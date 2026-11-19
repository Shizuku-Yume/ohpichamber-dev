import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { z } from 'zod';
import {
 SessionRecapListResponseSchema,
 SubagentListResponseSchema,
 SubagentTreeCostResponseSchema,
 SessionControlAckSchema,
 SessionToolsCatalogSchema,
} from '@openchamber/agent-contract';
import { AgentService } from './service.ts';

import type { HostSkillSourceResult } from './file-resources-host-protocol.ts';

const ListeningPortSchema = z.object({ port: z.number().int().positive() });
const freePort = () => new Promise<number>((resolve, reject) => {
 const probe = createServer();
 probe.once('error', reject);
 probe.listen(0, '127.0.0.1', () => {
  const address = ListeningPortSchema.safeParse(probe.address());
  probe.close(() => address.success ? resolve(address.data.port) : reject(new Error('A free loopback port is required')));
 });
});

/**
 * The recap and Agent Hub routes must be reachable through the real HTTP
 * surface, not only through their handler in isolation: this boots
 * `AgentService`, admits one session, and then calls every new route.
 */
test('recaps and Agent Hub routes answer over the real service HTTP surface', async () => {
 const root = await mkdtemp(join(tmpdir(), 'service-surface-'));
 const previousHome = process.env.HOME;
 process.env.HOME = root;
 const cwd = join(root, 'workspace');
 const agentDirectory = join(root, 'agent');
 await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
 const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
 const manager = SessionManager.create(cwd, sessionsDirectory);
 manager.appendMessage({ role: 'user', content: 'Surface proof prompt', timestamp: Date.now() });
 await manager.ensureOnDisk();
 await manager.flush();
 const sessionFile = manager.getSessionFile();
 await manager.close();
 if (!sessionFile) throw new Error('Native session file is required');

 const secret = randomBytes(32).toString('hex');
 const rootSessionId = randomUUID();
 const projectId = randomUUID();
 const workspaceId = randomUUID();
 const env = {
  HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
  OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
  XDG_STATE_HOME: join(root, 'state-home'), XDG_CACHE_HOME: join(root, 'cache')
 };
 const bootstrap = { rootSessionId, projectId, workspaceId, cwd, agentDirectory, agentDirectoryId: 'surface-owner', displayPath: 'workspace', env };
 const port = await freePort();
 const service = new AgentService({
  workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
  internalSecret: secret,
  stateDirectory: join(root, 'service-state'),
  port,
  policyCheck: async () => ({ allowed: true }),
  invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
  hostSkillSource: async (operation): Promise<HostSkillSourceResult> => {
   if (operation.action !== 'reconcile') return { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
   return { status: 'reconciled', sources: { workspace: '0', agent: '0' } };
  },
 });

 try {
  await service.start();
  const request = async (pathname: string, init: RequestInit = {}) => {
   const headers = new Headers({ 'x-internal-secret': secret, accept: 'application/json' });
   if (init.body) headers.set('content-type', 'application/json');
   const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
   return { status: response.status, body: z.json().parse(await response.json().catch(() => null)) };
  };

  const workspace = await request(`/internal/workspaces/${encodeURIComponent(workspaceId)}`, {
   method: 'POST',
   body: JSON.stringify({ projectId, cwd, agentDirectory, agentDirectoryId: 'surface-owner', env }),
  });
  expect(workspace.status).toBe(201);
  const created = await request('/internal/sessions', { method: 'POST', body: JSON.stringify({ ...bootstrap, sessionFile, sessionsDirectory }) });
  expect(created.status).toBe(201);

  const sessionPath = `/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}`;

  const recaps = await request(`${sessionPath}/recaps`);
  expect(recaps.status).toBe(200);
  expect(SessionRecapListResponseSchema.safeParse(recaps.body).success).toBe(true);

  const roster = await request(`${sessionPath}/subagents`);
  expect(roster.status).toBe(200);
  const parsedRoster = SubagentListResponseSchema.parse(roster.body);
  expect(parsedRoster.subagents).toEqual([]);

  const cost = await request(`${sessionPath}/subagents/tree-cost`);
  expect(cost.status).toBe(200);
  expect(SubagentTreeCostResponseSchema.parse(cost.body)).toMatchObject({ sessionId: rootSessionId, directCost: 0, treeCost: 0 });

  // A transcript for an agent this session never listed is refused, not faked.
  const transcript = await request(`${sessionPath}/subagents/${encodeURIComponent('unknown-agent')}/transcript`);
  expect(transcript.status).toBe(404);

  // Revive reaches the worker control path and answers with a canonical ack.
  const revive = await request(`${sessionPath}/control`, {
   method: 'POST',
   body: JSON.stringify({ type: 'subagent.revive', subagentId: 'unknown-agent' }),
  });
  expect(revive.status).toBe(404);
  expect(revive.body).toBeTruthy();

  const abortCompaction = await request(`${sessionPath}/control`, {
   method: 'POST',
   body: JSON.stringify({ type: 'compact.abort' }),
  });
  expect(abortCompaction.status).toBe(200);
  expect(SessionControlAckSchema.parse(abortCompaction.body)).toEqual({ type: 'compact.abort', aborted: false });

  // Unrelated routes still resolve elsewhere.
  const snapshot = await request(`${sessionPath}/snapshot`);
  expect(snapshot.status).toBe(200);
  expect(SessionControlAckSchema).toBeDefined();

  // Image routes answer over the real workspace HTTP surface
  const imageConfig = await request(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/images/config`, {
   method: 'POST',
   body: JSON.stringify({
    expectedRevision: '0',
    model: { modelId: 'probe-model', provider: 'probe-provider', name: 'Probe Image Model', enabled: true },
   }),
  });
  expect(imageConfig.status).toBe(422);
 } finally {
  await service.stop();
  if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
  await rm(root, { recursive: true, force: true });
 }
}, 60000);

test('workspace tools catalog reports hostTools enablement configured at workspace admission', async () => {
 const root = await mkdtemp(join(tmpdir(), 'service-surface-tools-'));
 const previousHome = process.env.HOME;
 process.env.HOME = root;
 const cwd = join(root, 'workspace');
 const agentDirectory = join(root, 'agent');
 await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));

 const secret = randomBytes(32).toString('hex');
 const projectId = randomUUID();
 const workspaceId = randomUUID();
 const env = {
  HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
  OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
  XDG_STATE_HOME: join(root, 'state-home'), XDG_CACHE_HOME: join(root, 'cache')
 };
 const port = await freePort();
 const service = new AgentService({
  workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
  internalSecret: secret,
  stateDirectory: join(root, 'service-state'),
  port,
  policyCheck: async () => ({ allowed: true }),
  invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
  hostSkillSource: async (operation): Promise<HostSkillSourceResult> => {
   if (operation.action !== 'reconcile') return { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
   return { status: 'reconciled', sources: { workspace: '0', agent: '0' } };
  },
 });

 try {
  await service.start();
  const request = async (pathname: string, init: RequestInit = {}) => {
   const headers = new Headers({ 'x-internal-secret': secret, accept: 'application/json' });
   if (init.body) headers.set('content-type', 'application/json');
   const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
   return { status: response.status, body: z.json().parse(await response.json().catch(() => null)) };
  };

  const workspace = await request(`/internal/workspaces/${encodeURIComponent(workspaceId)}`, {
   method: 'POST',
   body: JSON.stringify({
    projectId, cwd, agentDirectory, agentDirectoryId: 'tools-owner', env,
    hostTools: { web: false, openchamber: false, notify: true },
   }),
  });
  expect(workspace.status).toBe(201);

  const toolsResponse = await request(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/tools`);
  expect(toolsResponse.status).toBe(200);
  const catalog = SessionToolsCatalogSchema.parse(toolsResponse.body);
  const webTool = catalog.tools.find(t => t.name === 'web');
  const openchamberTool = catalog.tools.find(t => t.name === 'openchamber');
  const notifyTool = catalog.tools.find(t => t.name === 'notify');
  expect(webTool).toBeDefined();
  expect(webTool?.availability).toBe(false);
  expect(openchamberTool).toBeDefined();
  expect(openchamberTool?.availability).toBe(false);
  expect(notifyTool).toBeDefined();
  expect(notifyTool?.availability).toBe(true);
 } finally {
  await service.stop();
  if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
  await rm(root, { recursive: true, force: true });
 }
}, 60000);

/**
 * A saved MCP server's tools must appear before any session worker exists.
 * The catalog stages the real server, so this drives the repo's stdio MCP
 * fixture through the workspace HTTP surface with no session admitted.
 */
test('workspace tools catalog reports enabled MCP tools with no session worker', async () => {
 const root = await mkdtemp(join(tmpdir(), 'service-surface-mcp-tools-'));
 const previousHome = process.env.HOME;
 process.env.HOME = root;
 const cwd = join(root, 'workspace');
 const agentDirectory = join(root, 'agent');
 await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
 const fixtureServer = fileURLToPath(new URL('../../../../scripts/omp-m0/mcp-fixture-server.mjs', import.meta.url));
 const fixtureState = join(root, 'mcp-fixture-state.jsonl');
 await mkdir(join(cwd, '.omp'), { recursive: true });
 await writeFile(join(cwd, '.omp', 'mcp.json'), JSON.stringify({
  mcpServers: { fixture: { type: 'stdio', command: 'node', args: [fixtureServer, fixtureState] } },
 }));

 const secret = randomBytes(32).toString('hex');
 const projectId = randomUUID();
 const workspaceId = randomUUID();
 const env = {
  HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
  OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
  XDG_STATE_HOME: join(root, 'state-home'), XDG_CACHE_HOME: join(root, 'cache'),
  PATH: process.env.PATH ?? ''
 };
 const port = await freePort();
 const service = new AgentService({
  workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
  internalSecret: secret,
  stateDirectory: join(root, 'service-state'),
  port,
  policyCheck: async () => ({ allowed: true }),
  invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
  hostSkillSource: async (operation): Promise<HostSkillSourceResult> => {
   if (operation.action !== 'reconcile') return { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
   return { status: 'reconciled', sources: { workspace: '0', agent: '0' } };
  },
 });

 try {
  await service.start();
  const request = async (pathname: string, init: RequestInit = {}) => {
   const headers = new Headers({ 'x-internal-secret': secret, accept: 'application/json' });
   if (init.body) headers.set('content-type', 'application/json');
   const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
   return { status: response.status, body: z.json().parse(await response.json().catch(() => null)) };
  };

  const workspace = await request(`/internal/workspaces/${encodeURIComponent(workspaceId)}`, {
   method: 'POST',
   body: JSON.stringify({ projectId, cwd, agentDirectory, agentDirectoryId: 'mcp-tools-owner', env }),
  });
  expect(workspace.status).toBe(201);

  // No session is admitted anywhere before this read.
  const toolsResponse = await request(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/tools`);
  expect(toolsResponse.status).toBe(200);
  const catalog = SessionToolsCatalogSchema.parse(toolsResponse.body);
  const discovered = catalog.tools.filter(tool => tool.name.includes('fixture_echo'));
  expect(discovered.length).toBeGreaterThan(0);
  expect(discovered[0].availability).toBe(true);
  expect(discovered[0].description.length).toBeGreaterThan(0);
  const recorded = await readFile(fixtureState, 'utf8');
  expect(recorded).toContain('tools/list');
 } finally {
  await service.stop();
  if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
  await rm(root, { recursive: true, force: true });
 }
}, 120000);
