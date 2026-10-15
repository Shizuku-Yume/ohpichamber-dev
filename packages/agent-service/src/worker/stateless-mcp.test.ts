import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const configuration: MCPConfigurationState = { workspaceId: 'workspace', persistedRevision: (BigInt(previous) + 1n).toString(), config: { servers: [server] } };
  await worker.operation({ type: 'mcp', operation: { type: 'persist', request: { expectedPersistedRevision: previous, config: configuration.config }, configuration } });
  return configuration;
}

test('stateless MCP secrets survive cold reopen, remain reference-only, and cannot cross workspace owners', async () => {
  const { root, bootstrap } = await fixture();
  let worker: StatelessWorker | undefined;
  try {
    worker = await StatelessWorker.open(bootstrap, async () => {});
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
    worker = await StatelessWorker.open({ ...bootstrap, workerGeneration: 'reopened-generation' }, async () => {});
    expect(await worker.operation({ type: 'mcp.configuration.read' })).toEqual({ type: 'mcp.configuration', configuration });
    await expect(persist(worker, { serverId: 'tools', label: 'Tools', enabled: false, transport: { type: 'stdio', command: 'mcp-tool', args: [], envCredentialRefs: { TOOL_KEY: foreignReference } } }, '2')).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    expect(await worker.operation({ type: 'mcp.configuration.read' })).toEqual({ type: 'mcp.configuration', configuration });
  } finally { await worker?.close(); await rm(root, { recursive: true, force: true }); }
});

test('stateless MCP test performs a real HTTP handshake with private headers and no session admission', async () => {
  const { root, bootstrap } = await fixture();
  const received: string[] = [];
  const rpc = z.object({ id: z.union([z.number(), z.string()]).optional(), method: z.string(), params: z.object({ protocolVersion: z.string().optional() }).passthrough().optional() });
  const endpoint = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: async request => {
    if (request.method === 'GET') return new Response(null, { status: 405 });
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    received.push(request.headers.get('x-workspace-secret') ?? '');
    const message = rpc.parse(await request.json());
    if (message.id === undefined) return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: '2.0', id: message.id, result: message.method === 'initialize'
      ? { protocolVersion: message.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'native-mcp-test', version: '1' } }
      : { tools: [{ name: 'fixture_tool', description: 'Native test tool', inputSchema: { type: 'object', properties: {} } }] } });
  } });
  let worker: StatelessWorker | undefined;
  try {
    worker = await StatelessWorker.open(bootstrap, async () => {});
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
