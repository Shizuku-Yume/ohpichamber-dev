import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { MCPConfigurationState } from '@openchamber/agent-contract';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { __resetDirsFromEnvForTests } from '@oh-my-pi/pi-utils';
import { WorkerSession } from './session.ts';

const directoryEnvironmentKeys = ['HOME', 'USERPROFILE', 'PI_CONFIG_DIR', 'PI_CODING_AGENT_DIR', 'OMP_PROFILE', 'PI_PROFILE', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME'] as const;
let environmentRoot = '';
let previousEnvironment: Array<readonly [string, string | undefined]> = [];
const previousNoTitle = process.env.PI_NO_TITLE;

beforeEach(async () => {
  resetSettingsForTest();
  previousEnvironment = directoryEnvironmentKeys.map(key => [key, process.env[key]] as const);
  for (const key of directoryEnvironmentKeys) delete process.env[key];
  environmentRoot = await mkdtemp(join(tmpdir(), 'native-mcp-startup-'));
  process.env.HOME = environmentRoot;
  process.env.USERPROFILE = environmentRoot;
  process.env.PI_CONFIG_DIR = '.omp';
  process.env.XDG_DATA_HOME = join(environmentRoot, 'data');
  process.env.XDG_STATE_HOME = join(environmentRoot, 'state');
  process.env.XDG_CACHE_HOME = join(environmentRoot, 'cache');
  __resetDirsFromEnvForTests();
});
afterEach(async () => {
  resetSettingsForTest();
  if (previousNoTitle === undefined) delete process.env.PI_NO_TITLE;
  else process.env.PI_NO_TITLE = previousNoTitle;
  for (const [key, value] of previousEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  __resetDirsFromEnvForTests();
  await rm(environmentRoot, { recursive: true, force: true });
});

const rpc = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string(),
  params: z.object({ protocolVersion: z.string().optional() }).passthrough().optional(),
});

for (const legacy of [false, true]) test(`worker open does not wait for the ${legacy ? 'legacy' : 'modern'} MCP connection and publishes tools when it lands`, async () => {
  const handshakeStarted = Promise.withResolvers<void>();
  const releaseHandshake = Promise.withResolvers<void>();
  let initialized = 0;
  let discovered = 0;
  const endpoint = Bun.serve({
    hostname: '127.0.0.1', port: 0, async fetch(request) {
      if (request.method === 'GET') return new Response(null, { status: 405 });
      if (request.method === 'DELETE') return new Response(null, { status: 204 });
      const message = rpc.parse(await request.json());
      if (message.id === undefined) return new Response(null, { status: 202 });
      if (message.method === 'server/discover') {
        discovered += 1;
        handshakeStarted.resolve();
        await releaseHandshake.promise;
        return Response.json(legacy
          ? { jsonrpc: '2.0', id: message.id, error: { code: -32022, message: 'Unsupported protocol version', data: { supported: ['2025-11-25'] } } }
          : { jsonrpc: '2.0', id: message.id, result: { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, cacheScope: 'private' } });
      }
      if (message.method === 'initialize') {
        initialized += 1;
        handshakeStarted.resolve();
        await releaseHandshake.promise;
        return Response.json({
          jsonrpc: '2.0', id: message.id, result: {
            protocolVersion: message.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} },
            serverInfo: { name: 'slow-mcp', version: '1' },
          }
        });
      }
      return Response.json({
        jsonrpc: '2.0', id: message.id, result: {
          tools: [{ name: 'slow_tool', description: 'Slow MCP tool', inputSchema: { type: 'object', properties: {} } }],
        }
      });
    },
  });

  const root = join(environmentRoot, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(root, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const mcpConfiguration: MCPConfigurationState = {
    workspaceId: 'workspace', persistedRevision: '0',
    config: { servers: [{ serverId: 'slow', label: 'Slow', enabled: true, transport: { type: 'http', url: endpoint.url.href } }] },
  };
  const opened: string[] = [];
  let worker: WorkerSession | undefined;
  try {
    worker = await WorkerSession.open({
      type: 'bootstrap', rootSessionId: 'native-mcp-root', workerGeneration: 'generation',
      projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd: root, agentDirectory,
      mcpConfigPath: join(agentDirectory, 'mcp.json'), mcpConfiguration, sessionsDirectory: join(environmentRoot, 'sessions'),
    }, inputs => {
      for (const input of inputs) if (input.event.type === 'catalog.updated') opened.push(input.event.catalog.kind);
    }, () => { throw new Error('No interaction expected'); }, () => { throw new Error('MCP startup must not fail the worker'); },
      async () => { }, async () => { throw new Error('No Host action expected'); }, () => { });

    // The worker is open and admissible while the external handshake is still pending.
    // No MCP tool commands exist before the catalogue lands.
    expect(worker.session.getAllToolInfos().map(tool => tool.name)).not.toContain('mcp__slow_tool');
    await handshakeStarted.promise;

    // Release the handshake: the ready catalog lands as a session event.
    releaseHandshake.resolve();
    await worker.mcpStartup;
    expect(worker.session.getAllToolInfos().map(tool => tool.name)).toContain('mcp__slow_tool');
    expect(discovered).toBeGreaterThan(0);
    expect(initialized).toBe(legacy ? 2 : 0);
    expect(opened).toContain('mcp');
  } finally {
    releaseHandshake.resolve();
    await worker?.close();
    await endpoint.stop(true);
  }
}, 30_000);

test('a failing external MCP server leaves the worker open instead of failing session startup', async () => {
  // Nothing listens on this port, so the handshake fails fast.
  const endpoint = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(null, { status: 500 }) });
  const url = endpoint.url.href;
  endpoint.stop(true);

  const root = join(environmentRoot, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(root, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const mcpConfiguration: MCPConfigurationState = {
    workspaceId: 'workspace', persistedRevision: '0',
    config: { servers: [{ serverId: 'broken', label: 'Broken', enabled: true, transport: { type: 'http', url } }] },
  };
  let worker: WorkerSession | undefined;
  try {
    worker = await WorkerSession.open({
      type: 'bootstrap', rootSessionId: 'native-mcp-broken-root', workerGeneration: 'generation',
      projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd: root, agentDirectory,
      mcpConfigPath: join(agentDirectory, 'mcp.json'), mcpConfiguration, sessionsDirectory: join(environmentRoot, 'sessions'),
    }, () => { }, () => { throw new Error('No interaction expected'); }, () => { throw new Error('MCP startup must not fail the worker'); },
      async () => { }, async () => { throw new Error('No Host action expected'); }, () => { });
    // The failure is contained: the session stays open and the startup settles.
    await worker.mcpStartup;
    expect(worker.session.isDisposed).toBe(false);
  } finally {
    await worker?.close();
  }
}, 30_000);


test('closing a worker with a pending MCP handshake settles instead of waiting for the handshake timeout', async () => {
  const started = Promise.withResolvers<void>();
  const endpoint = Bun.serve({
    hostname: '127.0.0.1', port: 0, async fetch(request) {
      if (request.method === 'GET') return new Response(null, { status: 405 });
      if (request.method === 'DELETE') return new Response(null, { status: 204 });
      const message = rpc.parse(await request.json());
      if (message.id === undefined) return new Response(null, { status: 202 });
      // The handshake never answers; close must not wait out its 30 s window.
      started.resolve();
      return new Promise<Response>(() => {});
    },
  });
  const root = join(environmentRoot, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(root, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const mcpConfiguration: MCPConfigurationState = {
    workspaceId: 'workspace', persistedRevision: '0',
    config: { servers: [{ serverId: 'stalled', label: 'Stalled', enabled: true, transport: { type: 'http', url: endpoint.url.href } }] },
  };
  let worker: WorkerSession | undefined;
  const beforeClose = Date.now();
  try {
    worker = await WorkerSession.open({
      type: 'bootstrap', rootSessionId: 'native-mcp-close-root', workerGeneration: 'generation',
      projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd: root, agentDirectory,
      mcpConfigPath: join(agentDirectory, 'mcp.json'), mcpConfiguration, sessionsDirectory: join(environmentRoot, 'sessions'),
    }, () => {}, () => { throw new Error('No interaction expected'); }, () => {},
    async () => {}, async () => { throw new Error('No Host action expected'); }, () => {});
    await started.promise;
    // The handshake is still pending; close must settle without it.
    await worker.close();
    worker = undefined;
    expect(Date.now() - beforeClose).toBeLessThan(5_000);
  } finally {
    await endpoint.stop(true);
  }
}, 30_000);
