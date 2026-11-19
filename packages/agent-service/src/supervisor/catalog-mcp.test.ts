import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MCPConfigurationState, MCPConfigureRequest, MCPCatalogState, MCPWorkerApplyOutcome } from '@openchamber/agent-contract';
import { CatalogCoordinator, type CatalogWorker } from './catalog.ts';
import { mcpAuthRequired } from '../mcp-auth.ts';

const server = { serverId: 'tools', label: 'Workspace tools', enabled: true, transport: { type: 'stdio' as const, command: 'workspace-tools', args: [] } };
const connectedProbe = async (_workspaceId: string, serverId: string, configuration: MCPConfigurationState) => ({
  workspaceId: 'workspace', serverId, persistedRevision: configuration.persistedRevision, status: 'connected' as const, toolCount: 1,
});
const failedProbe = (code: string, detail = 'Probe failed') => async (_workspaceId: string, serverId: string, configuration: MCPConfigurationState) => ({
  workspaceId: 'workspace', serverId, persistedRevision: configuration.persistedRevision, status: 'failed' as const, error: { code, detail, retryable: true },
});

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

test('catalog worker aliases resolve through repeated rekeys and retire with the worker', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-rekey-'));
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => null, probeMcp: connectedProbe });
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    const { worker } = workerFixture('original');
    await coordinator.register(worker);
    coordinator.rekey('original', 'first');
    coordinator.rekey('first', 'second');
    expect(coordinator.liveRoot('original')).toBe('second');
    expect(coordinator.liveRoot('first')).toBe('second');
    coordinator.retire('second', worker.identity.workerGeneration);
    expect(coordinator.liveRoot('original')).toBe('original');
    expect(coordinator.liveRoot('first')).toBe('first');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('workspace MCP config is durable without sessions and rejects concurrent stale CAS writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-cas-'));
  let stored: MCPConfigurationState | null = null;
  let writes = 0;
  const options = { readMcpConfiguration: async () => stored, probeMcp: connectedProbe, commitMcp: async (_workspaceId: string, _request: MCPConfigureRequest, next: MCPConfigurationState) => { writes++; stored = next; } };
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
    probeMcp: connectedProbe,
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
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => null, probeMcp: connectedProbe, commitMcp: async () => { throw new Error('Disk unavailable'); } });
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
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => stored, probeMcp: connectedProbe, commitMcp: async (_id, _input, next) => { stored = next; } });
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
    await expect(coordinator.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '1', config: { servers: [server, { ...server, serverId: 'other' }] } })).rejects.toMatchObject({ code: 'MCP_APPLY_FAILED', details: { result: { status: 'partial', configuration: { persistedRevision: '2' }, workers: [{ outcome: 'applied', revisions: { appliedRevision: '2' } }, { outcome: 'failed', revisions: { appliedRevision: '1' } }] } } });
    await expect(coordinator.reconnectWorkspaceMcp('workspace', 'tools', { persistedRevision: '2' })).rejects.toMatchObject({ code: 'MCP_RECONNECT_FAILED', details: { result: { status: 'partial' } } });
    expect(first.reconnects).toEqual(['tools']);
    expect(second.reconnects).toEqual(['tools']);
    expect((await coordinator.readMcp('second')).workerCatalog.appliedRevision).toBe('1');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('no-worker reconnect exposes a failed real probe separately from runtime application', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-probe-'));
  let stored: MCPConfigurationState | null = null;
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => stored, probeMcp: failedProbe('MCP_RECONNECT_FAILED'), commitMcp: async (_id, _input, next) => { stored = next; } });
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    await expect(coordinator.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '0', config: { servers: [server] } })).rejects.toMatchObject({ code: 'MCP_APPLY_FAILED' });
    const result = await coordinator.reconnectWorkspaceMcp('workspace', 'tools', { persistedRevision: '1' });
    expect(result).toMatchObject({ status: 'no-active-workers', workers: [], probe: { status: 'failed' } });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('reconnect finalizes earlier retired generations and holds new worker admission until fanout settles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-retirement-'));
  let stored: MCPConfigurationState | null = null;
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => stored, probeMcp: connectedProbe, commitMcp: async (_id, _input, next) => { stored = next; } });
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
    const reconnect = coordinator.reconnectWorkspaceMcp('workspace', 'tools', { persistedRevision: '1' });
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
test('the generation guard keeps a late registration from overwriting a newer one', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-generation-guard-'));
  const coordinator = new CatalogCoordinator(directory, {
    readMcpConfiguration: async () => null,
    probeMcp: connectedProbe,
    commitMcp: async () => { throw new Error('Unrelated MCP mutation'); },
  });
  await coordinator.initialize();
  await coordinator.registerWorkspace('workspace', 'agent');

  const rootSessionId = 'session-1';
  let firstLive = true;
  const firstIdentity = { rootSessionId, workspaceId: 'workspace', agentDirectoryId: 'agent', workerGeneration: 'gen-1' };
  const firstCatalog: MCPCatalogState = { worker: firstIdentity, runtimeStatus: 'ready', appliedRevision: '0', catalogRevision: '1', activeServers: [], tools: [] };
  const firstDeferred = Promise.withResolvers<void>();
  const firstWorker: CatalogWorker = {
    identity: firstIdentity,
    isLive: () => firstLive,
    mcp: {
      read: async configuration => {
        await firstDeferred.promise;
        return { configuration, workerCatalog: firstCatalog };
      },
      apply: async () => { throw new Error('Unused'); },
      reconnect: async () => { throw new Error('Unused'); },
      oauth: async () => { throw new Error('Unused'); },
      oauthStatus: async () => { throw new Error('Unused'); },
    },
    skills: {
      read: async persistedSources => ({ worker: firstIdentity, agentDirectoryId: 'agent', runtimeStatus: 'ready', persistedSources, appliedSources: null, catalogRevision: '1', skills: [] }),
      apply: async () => { throw new Error('Unused'); },
      expand: async () => { throw new Error('Unused'); },
    },
  };

  const firstRegistering = coordinator.register(firstWorker);

  const secondLive = true;
  const secondIdentity = { rootSessionId, workspaceId: 'workspace', agentDirectoryId: 'agent', workerGeneration: 'gen-2' };
  const secondCatalog: MCPCatalogState = { worker: secondIdentity, runtimeStatus: 'ready', appliedRevision: '0', catalogRevision: '2', activeServers: [], tools: [{ toolName: 'second-tool', description: 'from gen-2', inputSchema: {} }] };
  const secondWorker: CatalogWorker = {
    identity: secondIdentity,
    isLive: () => secondLive,
    mcp: {
      read: async configuration => ({ configuration, workerCatalog: secondCatalog }),
      apply: async () => { throw new Error('Unused'); },
      reconnect: async () => { throw new Error('Unused'); },
      oauth: async () => { throw new Error('Unused'); },
      oauthStatus: async () => { throw new Error('Unused'); },
    },
    skills: {
      read: async persistedSources => ({ worker: secondIdentity, agentDirectoryId: 'agent', runtimeStatus: 'ready', persistedSources, appliedSources: null, catalogRevision: '2', skills: [] }),
      apply: async () => { throw new Error('Unused'); },
      expand: async () => { throw new Error('Unused'); },
    },
  };

  firstLive = false;
  await coordinator.register(secondWorker);

  firstDeferred.resolve();
  await firstRegistering.catch(() => { });

  const mcp = await coordinator.readMcp(rootSessionId);
  expect(mcp.workerCatalog.worker.workerGeneration).toBe('gen-2');
  expect(mcp.workerCatalog.tools).toEqual(secondCatalog.tools);

  await rm(directory, { recursive: true, force: true });
});

test('configureWorkspaceMcp reports applied, saved-needs-auth, and saved-not-connected outcomes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-outcomes-'));
  let stored: MCPConfigurationState | null = null;
  const coordinator = new CatalogCoordinator(directory, {
    readMcpConfiguration: async () => stored,
    probeMcp: connectedProbe,
    commitMcp: async (_id, _input, next) => { stored = next; },
  });

  let workerOutcome: { fail: boolean; code?: string; detail?: string } = { fail: false };
  const identity = { rootSessionId: 'root-worker', workspaceId: 'workspace', workerGeneration: 'gen-1' };
  const worker: CatalogWorker = {
    identity: { ...identity, agentDirectoryId: 'agent' },
    isLive: () => true,
    mcp: {
      read: async configuration => ({ configuration, workerCatalog: { worker: identity, runtimeStatus: 'unavailable', appliedRevision: null, catalogRevision: '0', activeServers: [], tools: [] } }),
      apply: async (_request, configuration) => {
        if (workerOutcome.fail) {
          return {
            worker: identity,
            outcome: 'failed',
            revisions: { runtimeStatus: 'unavailable', appliedRevision: null, catalogRevision: '0' },
            error: { code: workerOutcome.code ?? 'MCP_APPLY_FAILED', detail: workerOutcome.detail ?? 'Failed', retryable: true },
          };
        }
        return {
          worker: identity,
          outcome: 'applied',
          revisions: { runtimeStatus: 'ready', appliedRevision: configuration.persistedRevision, catalogRevision: '1' },
        };
      },
      reconnect: async () => { throw new Error('Unused'); },
      oauth: async () => { throw new Error('Unused'); },
      oauthStatus: async () => { throw new Error('Unused'); },
    },
    skills: {
      read: async sources => ({ worker: identity, agentDirectoryId: 'agent', runtimeStatus: 'unavailable', persistedSources: sources, appliedSources: null, catalogRevision: '0', skills: [] }),
      apply: async () => { throw new Error('Unused'); },
      expand: async () => { throw new Error('Unused'); },
    },
  };

  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    await coordinator.register(worker);

    // 1. Outcome 'applied'
    workerOutcome = { fail: false };
    const appliedResult = await coordinator.configureWorkspaceMcp('workspace', {
      expectedPersistedRevision: '0',
      config: { servers: [server] },
    });
    expect(appliedResult.outcome).toBe('applied');
    expect(appliedResult.status).toBe('applied');

    // 2. Outcome 'saved-needs-auth' (e.g. OAuth 401 / MCP_AUTH_REQUIRED)
    workerOutcome = { fail: true, code: 'MCP_AUTH_REQUIRED', detail: '401 Unauthorized: sign-in required' };
    const authResult = await coordinator.configureWorkspaceMcp('workspace', {
      expectedPersistedRevision: '1',
      config: { servers: [server, { ...server, serverId: 'oauth-server' }] },
    });
    expect(authResult.outcome).toBe('saved-needs-auth');
    expect(authResult.status).toBe('failed');

    // 3. Outcome 'saved-not-connected' (connection failure -> throws 503 with result in details)
    workerOutcome = { fail: true, code: 'MCP_APPLY_FAILED', detail: 'ECONNREFUSED 127.0.0.1:9999' };
    try {
      await coordinator.configureWorkspaceMcp('workspace', {
        expectedPersistedRevision: '2',
        config: { servers: [server] },
      });
      expect.unreachable('Should have thrown for saved-not-connected');
    } catch (err: unknown) {
      expect(err).toMatchObject({
        code: 'MCP_APPLY_FAILED',
        details: {
          result: {
            outcome: 'saved-not-connected',
            status: 'failed',
          },
        },
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('no-worker configure classifies the saved servers by the stateless probe', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-unattended-'));
  let stored: MCPConfigurationState | null = null;
  try {
    const needsAuth = new CatalogCoordinator(directory, { readMcpConfiguration: async () => stored, probeMcp: failedProbe('MCP_AUTH_REQUIRED'), commitMcp: async (_id, _input, next) => { stored = next; } });
    await needsAuth.initialize();
    await needsAuth.registerWorkspace('workspace', 'agent');
    expect(await needsAuth.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '0', config: { servers: [server] } }))
      .toMatchObject({ status: 'no-active-workers', outcome: 'saved-needs-auth', workers: [] });
    const unreachable = new CatalogCoordinator(directory, { readMcpConfiguration: async () => stored, probeMcp: failedProbe('MCP_APPLY_FAILED'), commitMcp: async (_id, _input, next) => { stored = next; } });
    await unreachable.initialize();
    await expect(unreachable.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '1', config: { servers: [server] } }))
      .rejects.toMatchObject({ code: 'MCP_APPLY_FAILED', details: { result: { status: 'no-active-workers', outcome: 'saved-not-connected' } } });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

/** A probe answer in OMP's transport format: the challenge is inside the message,
 * and the code stays MCP_APPLY_FAILED because the probe route never classified it. */
const challengeProbe = failedProbe(
  'MCP_APPLY_FAILED',
  'HTTP 403: forbidden [WWW-Authenticate: Bearer resource_metadata="https://x/.well-known/oauth-protected-resource"]',
);

const failingWorker = (code: string, detail: string) => {
  const identity = { rootSessionId: 'root-worker', workspaceId: 'workspace', workerGeneration: 'gen-1' };
  const revisions = { runtimeStatus: 'unavailable' as const, appliedRevision: null, catalogRevision: '0' };
  const worker: CatalogWorker = {
    identity: { ...identity, agentDirectoryId: 'agent' },
    isLive: () => true,
    mcp: {
      read: async configuration => ({ configuration, workerCatalog: { worker: identity, ...revisions, activeServers: [], tools: [] } }),
      apply: async () => ({ worker: identity, outcome: 'failed', revisions, error: { code, detail, retryable: true } }),
      reconnect: async () => { throw new Error('Unused'); },
      oauth: async () => { throw new Error('Unused'); },
      oauthStatus: async () => { throw new Error('Unused'); },
    },
    skills: {
      read: async sources => ({ worker: identity, agentDirectoryId: 'agent', runtimeStatus: 'unavailable', persistedSources: sources, appliedSources: null, catalogRevision: '0', skills: [] }),
      apply: async () => { throw new Error('Unused'); },
      expand: async () => { throw new Error('Unused'); },
    },
  };
  return worker;
};

test('a probe that reports an auth challenge is a saved sign-in, not a failed install', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-challenge-'));
  let stored: MCPConfigurationState | null = null;
  try {
    const coordinator = new CatalogCoordinator(directory, {
      readMcpConfiguration: async () => stored, probeMcp: challengeProbe, commitMcp: async (_id, _input, next) => { stored = next; },
    });
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    const result = await coordinator.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '0', config: { servers: [server] } });
    expect(result).toMatchObject({ status: 'no-active-workers', outcome: 'saved-needs-auth', workers: [] });
    // The server stays saved: the configuration revision advanced and is readable.
    expect(result.configuration.persistedRevision).toBe('1');
    expect((await coordinator.readWorkspaceMcpConfig('workspace')).config.servers.map(item => item.serverId)).toEqual(['tools']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a genuinely non-auth probe failure still throws saved-not-connected and names the server cause', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-not-connected-'));
  let stored: MCPConfigurationState | null = null;
  try {
    const coordinator = new CatalogCoordinator(directory, {
      readMcpConfiguration: async () => stored,
      probeMcp: failedProbe('MCP_APPLY_FAILED', 'MCP subprocess closed stdout before responding'),
      commitMcp: async (_id, _input, next) => { stored = next; },
    });
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    await expect(coordinator.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '0', config: { servers: [server] } }))
      .rejects.toMatchObject({
        code: 'MCP_APPLY_FAILED',
        message: 'MCP subprocess closed stdout before responding',
        details: { result: { status: 'no-active-workers', outcome: 'saved-not-connected', workers: [] } },
      });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('the shared predicate answers identically for every auth signal, and both apply paths use it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-mcp-agreement-'));
  const signals = [
    { code: 'MCP_AUTH_REQUIRED', detail: 'Authorization required' },
    { code: 'AUTH_REQUIRED', detail: 'Authorization required' },
    { code: 'MCP_CREDENTIAL_UNAVAILABLE', detail: 'The credential is not available' },
    { code: 'MCP_APPLY_FAILED', detail: 'HTTP 401 Unauthorized' },
    { code: 'MCP_APPLY_FAILED', detail: 'HTTP 403: forbidden' },
    { code: 'MCP_APPLY_FAILED', detail: 'challenge claims insufficient_scope' },
  ];
  try {
    for (const signal of signals) {
      // The rule itself, before either path: this is the one both import.
      expect(mcpAuthRequired(signal)).toBe(true);
      expect(mcpAuthRequired({ code: 'MCP_APPLY_FAILED', detail: 'ECONNREFUSED 127.0.0.1:14032' })).toBe(false);
      expect(mcpAuthRequired({ code: 'MCP_APPLY_FAILED', detail: 'MCP handshake timed out' })).toBe(false);
      expect(mcpAuthRequired({ code: 'MCP_APPLY_FAILED', detail: 'unreachable', config: { auth: { type: 'oauth' } } })).toBe(true);
      expect(mcpAuthRequired({ code: 'MCP_APPLY_FAILED', detail: 'unreachable', config: { oauth: { clientId: 'public' } } })).toBe(true);
      expect(mcpAuthRequired({ code: 'MCP_APPLY_FAILED', detail: 'unreachable', config: { auth: { type: 'apikey' } } })).toBe(false);
      let stored: MCPConfigurationState | null = null;
      const commitMcp = async (_id: string, _input: MCPConfigureRequest, next: MCPConfigurationState) => { stored = next; };
      const liveDirectory = await mkdtemp(join(tmpdir(), 'workspace-mcp-agreement-live-'));
      const live = new CatalogCoordinator(liveDirectory, { readMcpConfiguration: async () => stored, probeMcp: connectedProbe, commitMcp });
      const probe = new CatalogCoordinator(directory, { readMcpConfiguration: async () => stored, probeMcp: failedProbe(signal.code, signal.detail), commitMcp });
      try {
        await live.initialize();
        await live.registerWorkspace('workspace', 'agent');
        await live.register(failingWorker(signal.code, signal.detail));
        expect((await live.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '0', config: { servers: [server] } })).outcome)
          .toBe('saved-needs-auth');
        await probe.initialize();
        await probe.registerWorkspace('workspace', 'agent');
        expect((await probe.configureWorkspaceMcp('workspace', { expectedPersistedRevision: '1', config: { servers: [server] } })).outcome)
          .toBe('saved-needs-auth');
      } finally { await rm(liveDirectory, { recursive: true, force: true }); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
