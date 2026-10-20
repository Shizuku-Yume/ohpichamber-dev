import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MCPConfigurationState, MCPConfigureRequest, MCPCatalogState, MCPWorkerApplyOutcome } from '@openchamber/agent-contract';
import { CatalogCoordinator, type CatalogWorker } from './catalog.ts';

const server = { serverId: 'tools', label: 'Workspace tools', enabled: true, transport: { type: 'stdio' as const, command: 'workspace-tools', args: [] } };

function workerFixture(rootSessionId: string, controls: { fail?: boolean; beforeReconnect?: () => Promise<void> } = {}) {
  const identity = { rootSessionId, workspaceId: 'workspace', workerGeneration: `generation-${rootSessionId}` };
  let live = true;
  let catalog: MCPCatalogState = { worker: identity, runtimeStatus: 'unavailable', appliedRevision: null, catalogRevision: '0', activeServers: [], tools: [] };
  const reconnects: string[] = [];
  const unused = async (): Promise<never> => { throw new Error('Unexpected operation'); };
  const revisions = () => ({ runtimeStatus: catalog.runtimeStatus, appliedRevision: catalog.appliedRevision, catalogRevision: catalog.catalogRevision });
  const worker: CatalogWorker = {
    identity: { ...identity, agentDirectoryId: 'agent' }, isLive: () => live,
    mcp: {
      read: async configuration => ({ configuration, workerCatalog: catalog }),
      apply: async (_request, configuration): Promise<MCPWorkerApplyOutcome> => {
        if (controls.fail) return { worker: identity, outcome: 'failed', revisions: revisions(), error: { code: 'MCP_APPLY_FAILED', detail: 'Server unavailable', retryable: true } };
        catalog = { ...catalog, runtimeStatus: 'ready', appliedRevision: configuration.persistedRevision, catalogRevision: (BigInt(catalog.catalogRevision) + 1n).toString(), activeServers: configuration.config.servers.filter(item => item.enabled).map(item => item.serverId) };
        return { worker: identity, outcome: 'applied', revisions: revisions() };
      },
      reconnect: async (serverId, request, configuration) => {
        reconnects.push(serverId);
        expect(request.workerGeneration).toBe(identity.workerGeneration);
        expect(request.expectedCatalogRevision).toBe(catalog.catalogRevision);
        await controls.beforeReconnect?.();
        if (controls.fail) throw new Error('Reconnect failed');
        catalog = { ...catalog, catalogRevision: (BigInt(catalog.catalogRevision) + 1n).toString() };
        return { configuration, workerCatalog: catalog };
      }, oauth: unused, oauthStatus: unused,
    },
    skills: {
      read: async persistedSources => ({ worker: identity, agentDirectoryId: 'agent', runtimeStatus: 'unavailable', persistedSources, appliedSources: null, catalogRevision: '0', skills: [] }),
      apply: unused, expand: unused,
    },
  };
  return { worker, reconnects, retire: () => { live = false; } };
}

test('workspace MCP config is durable without sessions and rejects concurrent stale CAS writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-cas-'));
  let stored: MCPConfigurationState | null = null;
  let writes = 0;
  const options = { readMcpConfiguration: async () => stored, commitMcp: async (_workspaceId: string, _request: MCPConfigureRequest, next: MCPConfigurationState) => { writes++; stored = next; } };
  try {
    const coordinator = new CatalogCoordinator(directory, options);
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    expect(await coordinator.readWorkspaceMcpConfig('workspace')).toEqual({ workspaceId: 'workspace', persistedRevision: '0', config: { servers: [] } });
    const results = await Promise.allSettled([1, 2].map(() => coordinator.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '0', config: { servers: [server] } })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'fulfilled')).toMatchObject({ value: { status: 'no-active-workers', workers: [], configuration: { persistedRevision: '1' } } });
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409, code: 'CATALOG_CONFLICT' } });
    expect(writes).toBe(1);
    const reopened = new CatalogCoordinator(directory, options);
    await reopened.initialize();
    expect(await reopened.readWorkspaceMcpConfig('workspace')).toEqual(stored);
    await expect(reopened.applyWorkspaceMcp('workspace', { persistedRevision: '0' })).rejects.toMatchObject({ status: 409 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('pending workspace OAuth releases coordinator for cancellation and rejects completion after config retirement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-oauth-lock-'));
  let stored: MCPConfigurationState | null = null;
  const coordinator = new CatalogCoordinator(directory, {
    readMcpConfiguration: async () => stored,
    commitMcp: async (_workspaceId, _request, next) => { stored = next; },
  });
  const entered = Promise.withResolvers<void>();
  const releaseComplete = Promise.withResolvers<void>();
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    const initial = await coordinator.configureWorkspaceMcp('workspace', {
      expectedPersistedRevision: '0', config: { servers: [server] },
    });
    const revision = initial.configuration.persistedRevision;
    const worker = { rootSessionId: 'stateless', workspaceId: 'workspace', workerGeneration: 'generation-stateless' };
    const completing = coordinator.workspaceOAuth('tools', 'workspace', revision, worker.workerGeneration, async configuration => {
      entered.resolve();
      await releaseComplete.promise;
      return { serverId: 'tools', worker, persistedRevision: configuration.persistedRevision, status: 'unauthenticated', authenticated: false };
    });
    await entered.promise;

    await coordinator.workspaceOAuth('tools', 'workspace', revision, worker.workerGeneration, async configuration => ({
      serverId: 'tools', worker, persistedRevision: configuration.persistedRevision, status: 'unauthenticated', authenticated: false,
    }));
    await coordinator.configureWorkspaceMcp('workspace', {
      expectedPersistedRevision: revision, config: { servers: [] },
    });
    releaseComplete.resolve();
    await expect(completing).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
  } finally {
    releaseComplete.resolve();
    await rm(directory, { recursive: true, force: true });
  }
});

test('workspace MCP failed persistence does not advance revision or replace current configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-write-failure-'));
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => null, commitMcp: async () => { throw new Error('Disk unavailable'); } });
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    await expect(coordinator.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '0', config: { servers: [server] } })).rejects.toMatchObject({ code: 'MCP_CONFIG_WRITE_FAILED' });
    expect((await coordinator.readWorkspaceMcpConfig('workspace')).persistedRevision).toBe('0');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('workspace apply and exact-server reconnect retain partial failures and last good sibling catalogs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-partial-'));
  let stored: MCPConfigurationState | null = null;
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => stored, commitMcp: async (_id, _input, next) => { stored = next; } });
  const control = { fail: false };
  const first = workerFixture('first');
  const second = workerFixture('second', control);
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    await coordinator.register(first.worker);
    await coordinator.register(second.worker);
    await coordinator.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '0', config: { servers: [server] } });
    control.fail = true;
    await expect(coordinator.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '1', config: { servers: [server, { ...server, serverId: 'other' }] } })).rejects.toMatchObject({ code: 'MCP_APPLY_FAILED', details: { result: { status: 'partial', configuration: { persistedRevision: '2' }, workers: [ { outcome: 'applied', revisions: { appliedRevision: '2' } }, { outcome: 'failed', revisions: { appliedRevision: '1' } } ] } } });
    await expect(coordinator.reconnectWorkspaceMcp('workspace', 'tools', { persistedRevision: '2' }, async () => { throw new Error('Must use live roots'); })).rejects.toMatchObject({ code: 'MCP_RECONNECT_FAILED', details: { result: { status: 'partial' } } });
    expect(first.reconnects).toEqual(['tools']);
    expect(second.reconnects).toEqual(['tools']);
    expect((await coordinator.readMcp('second')).workerCatalog.appliedRevision).toBe('1');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('no-worker reconnect exposes a failed real probe separately from runtime application', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-probe-'));
  let stored: MCPConfigurationState | null = null;
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => stored, commitMcp: async (_id, _input, next) => { stored = next; } });
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    await coordinator.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '0', config: { servers: [server] } });
    const result = await coordinator.reconnectWorkspaceMcp('workspace', 'tools', { persistedRevision: '1' }, async configuration => ({ workspaceId: 'workspace', serverId: 'tools', persistedRevision: configuration.persistedRevision, status: 'failed', error: { code: 'MCP_RECONNECT_FAILED', detail: 'Connection refused', retryable: true } }));
    expect(result).toMatchObject({ status: 'no-active-workers', workers: [], probe: { status: 'failed' } });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('reconnect finalizes earlier retired generations and holds new worker admission until fanout settles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-retirement-'));
  let stored: MCPConfigurationState | null = null;
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => stored, commitMcp: async (_id, _input, next) => { stored = next; } });
  const secondStarted = Promise.withResolvers<void>();
  const releaseSecond = Promise.withResolvers<void>();
  const first = workerFixture('first');
  const second = workerFixture('second', { beforeReconnect: async () => { secondStarted.resolve(); await releaseSecond.promise; } });
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    await coordinator.register(first.worker);
    await coordinator.register(second.worker);
    await coordinator.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '0', config: { servers: [server] } });
    const reconnect = coordinator.reconnectWorkspaceMcp('workspace', 'tools', { persistedRevision: '1' }, async () => { throw new Error('A live root remains'); });
    await secondStarted.promise;
    let admitted = false;
    const admission = coordinator.admit({ workspaceId: 'workspace', agentDirectoryId: 'agent', catalogRevision: '0' }, async () => ({ workspace: '0', agent: '0' }), async bootstrap => { admitted = true; return bootstrap; });
    expect(admitted).toBe(false);
    first.retire();
    coordinator.retire('first', first.worker.identity.workerGeneration);
    releaseSecond.resolve();
    const result = await reconnect;
    expect(result.status).toBe('applied');
    expect(result.workers.map(outcome => outcome.outcome)).toEqual(['retired', 'applied']);
    expect((await admission).mcpConfiguration.persistedRevision).toBe('1');
  } finally { releaseSecond.resolve(); await rm(directory, { recursive: true, force: true }); }
});
