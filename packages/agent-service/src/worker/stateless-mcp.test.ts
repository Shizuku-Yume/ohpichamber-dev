import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { MCPConfigurationState, MCPServerConfig } from '@openchamber/agent-contract';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import type { CompletionWorkerBootstrap } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { StatelessWorker } from './stateless.ts';
import { openNativeRuntime } from './native-runtime.ts';
import { NativeMcpCredentials } from './mcp-credentials.ts';

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'stateless-mcp-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const bootstrap: CompletionWorkerBootstrap = { type: 'completion.bootstrap', authorizationRootId: 'workspace-authorization-owner', workerGeneration: 'workspace-generation', projectId: 'project', workspaceId: 'workspace', cwd, agentDirectory, agentDirectoryId: 'agent', catalogRevision: '0', mcpConfigPath: join(cwd, '.omp', 'mcp.json') };
  return { root, bootstrap };
}

async function persist(worker: StatelessWorker, server: MCPServerConfig, previous = '0') {
  const normalizedServer = { scope: 'project' as const, ...server };
  const configuration: MCPConfigurationState = { workspaceId: 'workspace', persistedRevision: (BigInt(previous) + 1n).toString(), config: { servers: [normalizedServer] } };
  await worker.operation({ type: 'mcp', operation: { type: 'persist', request: { expectedPersistedRevision: previous, config: configuration.config }, configuration } });
  return configuration;
}

test('stateless MCP secrets survive cold reopen, remain reference-only, and cannot cross workspace owners', async () => {
  const { root, bootstrap } = await fixture();
  let worker: StatelessWorker | undefined;
  try {
    worker = await StatelessWorker.open(bootstrap, async () => { });
    let configuration = await persist(worker, { serverId: 'tools', label: 'Tools', enabled: false, transport: { type: 'stdio', command: 'mcp-tool', args: [] } });
    const written = await worker.operation({ type: 'mcp', operation: { type: 'secret.write', serverId: 'tools', configuration, request: { persistedRevision: '1', value: '!literal-not-a-command' } } });
    if (written.type !== 'mcp' || written.result.type !== 'secret.written') throw new Error('Expected private secret receipt');
    expect(JSON.stringify(written)).not.toContain('!literal-not-a-command');
    const reference = written.result.result.credentialRef;
    configuration = await persist(worker, { serverId: 'tools', label: 'Tools', enabled: false, transport: { type: 'stdio', command: 'mcp-tool', args: [], envCredentialRefs: { TOOL_KEY: reference } } }, '1');
    const publicFile = await readFile(bootstrap.mcpConfigPath!, 'utf8');
    expect(publicFile).toContain(reference);
    expect(publicFile).not.toContain('!literal-not-a-command');
    await worker.close();
    worker = undefined;
    const runtime = await openNativeRuntime(bootstrap);
    let foreignReference: string;
    try {
      const owner = new NativeMcpCredentials(runtime.authStorage, 'workspace');
      const namespace = await owner.resolve(reference);
      expect(runtime.authStorage.credentials.get(namespace)).toMatchObject({ type: 'api_key', key: '!literal-not-a-command' });
      await expect(new NativeMcpCredentials(runtime.authStorage, 'sibling-workspace').resolve(reference)).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
      await expect(owner.resolve('provider-account-reference')).rejects.toMatchObject({ status: 403 });
      foreignReference = (await new NativeMcpCredentials(runtime.authStorage, 'sibling-workspace').write('tools', '2', 'sibling-private-secret')).credentialRef;
    } finally { runtime.authStorage.close(); }
    expect((await readdir(bootstrap.agentDirectory)).some(name => name.startsWith('session'))).toBe(false);
    worker = await StatelessWorker.open({ ...bootstrap, workerGeneration: 'reopened-generation' }, async () => { });
    expect(await worker.operation({ type: 'mcp.configuration.read' })).toEqual({ type: 'mcp.configuration', configuration });
    await expect(persist(worker, { serverId: 'tools', label: 'Tools', enabled: false, transport: { type: 'stdio', command: 'mcp-tool', args: [], envCredentialRefs: { TOOL_KEY: foreignReference } } }, '2')).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    expect(await worker.operation({ type: 'mcp.configuration.read' })).toEqual({ type: 'mcp.configuration', configuration });
  } finally { await worker?.close(); await rm(root, { recursive: true, force: true }); }
});

test('stateless MCP test performs a real HTTP handshake with private headers and no session admission', async () => {
  const { root, bootstrap } = await fixture();
  const received: string[] = [];
  const rpc = z.object({ id: z.union([z.number(), z.string()]).optional(), method: z.string(), params: z.object({ protocolVersion: z.string().optional() }).passthrough().optional() });
  const endpoint = Bun.serve({
    hostname: '127.0.0.1', port: 0, fetch: async request => {
      if (request.method === 'GET') return new Response(null, { status: 405 });
      if (request.method === 'DELETE') return new Response(null, { status: 204 });
      received.push(request.headers.get('x-workspace-secret') ?? '');
      const message = rpc.parse(await request.json());
      if (message.id === undefined) return new Response(null, { status: 202 });
      return Response.json({
        jsonrpc: '2.0', id: message.id, result: message.method === 'initialize'
          ? { protocolVersion: message.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'native-mcp-test', version: '1' } }
          : { tools: [{ name: 'fixture_tool', description: 'Native test tool', inputSchema: { type: 'object', properties: {} } }] }
      });
    }
  });
  let worker: StatelessWorker | undefined;
  try {
    worker = await StatelessWorker.open(bootstrap, async () => { });
    let configuration = await persist(worker, { serverId: 'remote', label: 'Remote', enabled: true, transport: { type: 'http', url: endpoint.url.href } });
    const written = await worker.operation({ type: 'mcp', operation: { type: 'secret.write', serverId: 'remote', configuration, request: { persistedRevision: '1', value: 'private-header-value' } } });
    if (written.type !== 'mcp' || written.result.type !== 'secret.written') throw new Error('Expected private secret receipt');
    configuration = await persist(worker, { serverId: 'remote', label: 'Remote', enabled: true, transport: { type: 'http', url: endpoint.url.href, headerCredentialRefs: { 'x-workspace-secret': written.result.result.credentialRef } } }, '1');
    const result = await worker.operation({ type: 'mcp', operation: { type: 'test', serverId: 'remote', configuration } });
    expect(result).toMatchObject({ type: 'mcp', result: { type: 'tested', result: { status: 'connected', toolCount: 1, persistedRevision: '2' } } });
    expect(received.length).toBeGreaterThan(0);
    expect(received.every(value => value === 'private-header-value')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-header-value');
  } finally { await worker?.close(); await endpoint.stop(true); await rm(root, { recursive: true, force: true }); }
});

async function persistServers(worker: StatelessWorker, servers: MCPServerConfig[], previous: string) {
  const normalized = servers.map(server => ({ scope: 'project' as const, ...server }));
  const configuration: MCPConfigurationState = { workspaceId: 'workspace', persistedRevision: (BigInt(previous) + 1n).toString(), config: { servers: normalized } };
  return worker.operation({ type: 'mcp', operation: { type: 'persist', request: { expectedPersistedRevision: previous, config: configuration.config }, configuration } });
}

test('a newly written or edited reference that cannot resolve is refused and names its entries', async () => {
  const { root, bootstrap } = await fixture();
  const authorized: string[] = [];
  let worker: StatelessWorker | undefined;
  try {
    worker = await StatelessWorker.open(bootstrap, async request => {
      if (request.type === 'mcp-server') authorized.push(request.server.serverId);
    });
    // The reference matches the credential shape yet no credential is stored:
    // a reference whose secret was removed outside the workspace.
    const missing = 'mcp_00000000-0000-0000-0000-000000000000';
    const servers: MCPServerConfig[] = [
      { serverId: 'broken', label: 'Broken', enabled: false, transport: { type: 'stdio', command: 'mcp-broken', args: [], envCredentialRefs: { TOOL_KEY: missing } } },
      { serverId: 'clean', label: 'Clean', enabled: false, transport: { type: 'stdio', command: 'mcp-clean', args: [] } },
    ];
    // Both entries are new, so the write fails closed: skipping them would either
    // drop user data or commit nothing under a bumped revision.
    authorized.length = 0;
    const failure = await persistServers(worker, servers, '0').catch(error => error);
    expect(failure).toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    expect(String(failure.message)).toContain('broken');
    expect(failure.details).toEqual({ servers: ['broken'] });
    // Every server's authorization and credential validation ran before the throw:
    // the failing entry does not stop validation of its siblings.
    expect(authorized).toEqual(['broken', 'clean']);
    await expect(readFile(bootstrap.mcpConfigPath!, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    // Removing the broken entry leaves a configuration that saves on its own.
    const persisted = await persistServers(worker, [servers[1]!], '0');
    if (persisted.type !== 'mcp' || persisted.result.type !== 'persisted') throw new Error('Expected persisted result');
    expect(persisted.result.needsCredentialReentry).toBeUndefined();
    expect(persisted.result.configuration.config.servers.map(server => server.serverId)).toEqual(['clean']);
    // Editing an existing entry onto a broken reference is refused as well:
    // only an unchanged entry may be skipped.
    const persistedEdit = persisted.result.configuration;
    const edited: MCPServerConfig[] = [{ ...persistedEdit.config.servers[0]!, transport: { type: 'stdio', command: 'mcp-clean', args: [], envCredentialRefs: { TOOL_KEY: missing } } }];
    const failureEdit = await persistServers(worker, edited, persistedEdit.persistedRevision).catch(error => error);
    expect(failureEdit).toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    expect(failureEdit.details).toEqual({ servers: ['clean'] });
    expect(await worker.operation({ type: 'mcp.configuration.read' })).toEqual({ type: 'mcp.configuration', configuration: persistedEdit });
  } finally { await worker?.close(); await rm(root, { recursive: true, force: true }); }
});

test('an unchanged entry whose credential no longer resolves is carried byte-for-byte, reported by name, and never blocks the other servers', async () => {
  const { root, bootstrap } = await fixture();
  const authorized: string[] = [];
  let worker: StatelessWorker | undefined;
  try {
    worker = await StatelessWorker.open(bootstrap, async request => {
      if (request.type === 'mcp-server') authorized.push(request.server.serverId);
    });
    // Both entries save cleanly with a real credential.
    const first = await persistServers(worker, [{ serverId: 'carrier', label: 'Carrier', enabled: false, transport: { type: 'stdio', command: 'mcp-carrier', args: [] } }], '0');
    if (first.type !== 'mcp' || first.result.type !== 'persisted') throw new Error('Expected persisted result');
    const written = await worker.operation({ type: 'mcp', operation: { type: 'secret.write', serverId: 'carrier', configuration: first.result.configuration, request: { persistedRevision: '1', value: 'carrier-private-value' } } });
    if (written.type !== 'mcp' || written.result.type !== 'secret.written') throw new Error('Expected private secret receipt');
    const reference = written.result.result.credentialRef;
    const carrier: MCPServerConfig = { serverId: 'carrier', label: 'Carrier', enabled: false, transport: { type: 'stdio', command: 'mcp-carrier', args: [], envCredentialRefs: { TOOL_KEY: reference } } };
    const second = await persistServers(worker, [carrier], '1');
    if (second.type !== 'mcp' || second.result.type !== 'persisted') throw new Error('Expected persisted result');
    // The stored credential vanishes outside the workspace (foreign store write
    // deleting the provider is not modelled; the credential store is rewritten
    // directly, the same end state as a credential removed on disk).
    const runtime = await openNativeRuntime(bootstrap);
    try {
      const owner = new NativeMcpCredentials(runtime.authStorage, 'workspace');
      const provider = await owner.resolve(reference);
      await runtime.authStorage.credentials.remove(provider);
      await runtime.authStorage.credentials.reload();
    } finally { runtime.authStorage.close(); }
    await expect(new NativeMcpCredentials((await openNativeRuntime(bootstrap)).authStorage, 'workspace').resolve('mcp_00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ status: 403 });
    // The unchanged carrier entry can no longer resolve, yet the clean edit saves.
    authorized.length = 0;
    const partial = await persistServers(worker, [carrier, { serverId: 'clean', label: 'Clean', enabled: false, transport: { type: 'stdio', command: 'mcp-clean', args: [] } }], '2');
    if (partial.type !== 'mcp' || partial.result.type !== 'persisted') throw new Error('Expected persisted result');
    expect(partial.result.needsCredentialReentry).toEqual(['carrier']);
    // A reference stores as an opaque token, so persisting the unchanged entry
    // is byte-identical to what the file already carries: it stays in the
    // committed configuration, and only the re-entry report marks it.
    expect(partial.result.configuration.config.servers.map(server => server.serverId)).toEqual(['carrier', 'clean']);
    expect(partial.result.configuration.config.servers.find(server => server.serverId === 'carrier')?.transport).toMatchObject({ envCredentialRefs: { TOOL_KEY: reference } });
    expect(partial.result.configuration.persistedRevision).toBe('3');
    // Every server's validation still ran.
    expect(authorized).toEqual(['carrier', 'clean']);
    expect(JSON.stringify(partial)).not.toContain('carrier-private-value');
    // The project file carries the entry unchanged: the next save still
    // reports it until the value is re-entered.
    const projectFile = await readFile(bootstrap.mcpConfigPath!, 'utf8');
    expect(projectFile).toContain('carrier');
    expect(projectFile).toContain('clean');
    expect(projectFile).toContain(reference);
    expect(projectFile).not.toContain('carrier-private-value');
    // A save of only the carrier entry — the entire configuration — carries
    // through as well: the write is byte-identical to the committed file, so
    // the revision lands with the entry still reported for re-entry.
    const lone = await persistServers(worker, [carrier], '3');
    if (lone.type !== 'mcp' || lone.result.type !== 'persisted') throw new Error('Expected persisted result');
    expect(lone.result.needsCredentialReentry).toEqual(['carrier']);
    expect(lone.result.configuration.config.servers.map(server => server.serverId)).toEqual(['carrier']);
    // Re-entering the credential clears the report on the next save.
    const runtimeReenter = await openNativeRuntime(bootstrap);
    try {
      const provider = `openchamber-mcp-${createHash('sha256').update('workspace').digest('hex')}-${reference}`;
      await runtimeReenter.authStorage.credentials.set(provider, { type: 'api_key', key: 'carrier-private-value', source: 'login' });
    } finally { runtimeReenter.authStorage.close(); }
    const resolved = await persistServers(worker, [carrier], '4');
    if (resolved.type !== 'mcp' || resolved.result.type !== 'persisted') throw new Error('Expected persisted result');
    expect(resolved.result.needsCredentialReentry).toBeUndefined();
  } finally { await worker?.close(); await rm(root, { recursive: true, force: true }); }
});

test('stateless probe and secret writes preserve Host refusals and reject stale OAuth generations', async () => {
  const { root, bootstrap } = await fixture();
  let deny = false;
  const refusal = new ProjectionError(403, 'UNAUTHORIZED', 'Host refused MCP');
  let worker: StatelessWorker | undefined;
  try {
    worker = await StatelessWorker.open(bootstrap, async () => { if (deny) throw refusal; });
    const configuration = await persist(worker, { serverId: 'remote', label: 'Remote', enabled: true, transport: { type: 'http', url: 'http://127.0.0.1:1/mcp' } });
    deny = true;
    await expect(worker.operation({ type: 'mcp', operation: { type: 'test', serverId: 'remote', configuration } })).rejects.toBe(refusal);
    await expect(worker.operation({ type: 'mcp', operation: { type: 'secret.write', serverId: 'remote', configuration, request: { persistedRevision: '1', value: 'must-not-persist' } } })).rejects.toBe(refusal);
    deny = false;
    const status = await worker.operation({ type: 'mcp', operation: { type: 'oauth.status', serverId: 'remote', configuration } });
    expect(status).toMatchObject({ type: 'mcp', result: { type: 'oauth', result: { status: 'unauthenticated', worker: { rootSessionId: bootstrap.authorizationRootId, workerGeneration: bootstrap.workerGeneration } } } });
    await expect(worker.operation({ type: 'mcp', operation: { type: 'oauth', serverId: 'remote', configuration, request: { action: 'start', persistedRevision: '1', workerGeneration: 'stale-generation' } } })).rejects.toMatchObject({ code: 'WORKER_GENERATION_CONFLICT' });
    await expect(worker.operation({ type: 'mcp', operation: { type: 'secret.write', serverId: 'remote', configuration, request: { persistedRevision: '0', value: 'must-not-persist' } } })).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
  } finally { await worker?.close(); await rm(root, { recursive: true, force: true }); }
});

test('a malformed user MCP file never blocks a project-only persist, while a user-scope save still fails closed', async () => {
  const { root, bootstrap } = await fixture();
  let worker: StatelessWorker | undefined;
  try {
    await writeFile(join(bootstrap.agentDirectory, 'mcp.json'), '{ this is not json', 'utf8');
    worker = await StatelessWorker.open(bootstrap, async () => { });
    const projectServer: MCPServerConfig = { serverId: 'proj', label: 'Proj', enabled: false, transport: { type: 'stdio', command: 'mcp-proj', args: [] } };
    const saved = await persistServers(worker, [projectServer], '0');
    if (saved.type !== 'mcp' || saved.result.type !== 'persisted') throw new Error('Expected persisted result');
    expect(saved.result.configuration.config.servers.map(server => server.serverId)).toEqual(['proj']);
    expect(saved.result.needsCredentialReentry).toBeUndefined();
    // The corrupt user file is left untouched: nothing was written to it, so a
    // hand repair loses nothing.
    expect(await readFile(join(bootstrap.agentDirectory, 'mcp.json'), 'utf8')).toBe('{ this is not json');
    const projectFile = await readFile(bootstrap.mcpConfigPath!, 'utf8');
    expect(projectFile).toContain('proj');
    // A second project-only save against the committed revision succeeds as well.
    const second = await persistServers(worker, [{ ...projectServer, label: 'Proj edited' }], '1');
    if (second.type !== 'mcp' || second.result.type !== 'persisted') throw new Error('Expected persisted result');
    expect(second.result.configuration.persistedRevision).toBe('2');
    // A save carrying a user-scope server must evaluate the shared file, so it
    // fails closed with the read failure instead of guessing its entries.
    const userServer: MCPServerConfig = { serverId: 'shared', label: 'Shared', enabled: false, scope: 'user', transport: { type: 'stdio', command: 'mcp-shared', args: [] } };
    await expect(persistServers(worker, [projectServer, userServer], '2')).rejects.toMatchObject({ code: 'MCP_CONFIG_READ_FAILED' });
    // A wrong-typed OpenChamber key in otherwise valid JSON is the same class:
    // project-only saves proceed, user-scope saves fail closed.
    await writeFile(join(bootstrap.agentDirectory, 'mcp.json'), JSON.stringify({ mcpServers: {}, openchamber: { credentials: 'not-a-map' } }), 'utf8');
    const third = await persistServers(worker, [{ ...projectServer, label: 'Proj edited again' }], '2');
    if (third.type !== 'mcp' || third.result.type !== 'persisted') throw new Error('Expected persisted result');
    expect(third.result.configuration.persistedRevision).toBe('3');
    await expect(persistServers(worker, [projectServer, userServer], '3')).rejects.toMatchObject({ code: 'MCP_CONFIG_READ_FAILED' });
  } finally { await worker?.close(); await rm(root, { recursive: true, force: true }); }
});
