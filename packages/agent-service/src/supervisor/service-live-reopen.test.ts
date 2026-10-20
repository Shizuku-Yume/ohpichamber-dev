import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { z } from 'zod';
import { MCPCatalogReadSchema, RuntimeSessionSchema } from '@openchamber/agent-contract';
import type { HostSkillSourceResult } from './file-resources-host-protocol.ts';
import { HostSessionBootstrapSchema } from './host-authorization-protocol.ts';

type ReopenBody = z.infer<typeof HostSessionBootstrapSchema>;
import { AgentService } from './service.ts';

const ListeningPortSchema = z.object({ port: z.number().int().positive() });
const freePort = () => new Promise<number>((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = ListeningPortSchema.safeParse(probe.address());
    probe.close(() => address.success ? resolve(address.data.port) : reject(new Error('A free loopback port is required')));
  });
});

test('private reopen returns a live root without re-admission and keeps scope refusals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'service-live-reopen-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const otherCwd = join(root, 'other');
  const agentDirectory = join(root, 'agent');
  await Promise.all([cwd, otherCwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  manager.appendMessage({ role: 'user', content: 'Task64 retained prompt', timestamp: Date.now() });
  manager.appendMessage({ role: 'user', content: 'Task64 second prompt', timestamp: Date.now() });
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  await manager.close();
  if (!sessionFile) throw new Error('Native session file is required');
  const secret = randomBytes(32).toString('hex');
  const rootSessionId = randomUUID();
  const projectId = randomUUID();
  const workspaceId = randomUUID();
  const env = { HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
    OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state-home'), XDG_CACHE_HOME: join(root, 'cache') };
  const bootstrap: ReopenBody = { rootSessionId, projectId, workspaceId, cwd, agentDirectory, agentDirectoryId: 'service-owner', displayPath: 'workspace', env };
  const port = await freePort();
  let reconciles = 0;
  const service = new AgentService({
    workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
    internalSecret: secret,
    stateDirectory: join(root, 'service-state'),
    port,
    policyCheck: async () => ({ allowed: true }),
    invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
    hostSkillSource: async (operation): Promise<HostSkillSourceResult> => {
      if (operation.action !== 'reconcile') return { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
      reconciles += 1;
      return { status: 'reconciled', sources: { workspace: '0', agent: '0' } };
    },
  });
  try {
    await service.start();
    const request = async (pathname: string, init: RequestInit = {}) => {
      const headers = new Headers({ 'x-internal-secret': secret, accept: 'application/json' });
      if (init.body) headers.set('content-type', 'application/json');
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
      return { status: response.status, body: await response.json() };
    };
    const workspace = await request(`/internal/workspaces/${encodeURIComponent(workspaceId)}`, { method: 'POST',
      body: JSON.stringify({ projectId, cwd, agentDirectory, agentDirectoryId: 'service-owner', env }) });
    expect(workspace.status).toBe(201);
    const createdResponse = await request('/internal/sessions', { method: 'POST', body: JSON.stringify({ ...bootstrap, sessionFile, sessionsDirectory }) });
    expect(createdResponse.status).toBe(201);
    const created = RuntimeSessionSchema.parse(createdResponse.body);
    const reconcilesAfterAdmission = reconciles;
    expect(reconcilesAfterAdmission).toBe(1);
    const catalogGeneration = async () => {
      const catalog = await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}/mcp/catalog`);
      expect(catalog.status).toBe(200);
      return MCPCatalogReadSchema.parse(catalog.body).workerCatalog.worker.workerGeneration;
    };
    const generation = await catalogGeneration();
    const reopen = (body: ReopenBody) => request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/reopen`, {
      method: 'POST', body: JSON.stringify(body) });
    const live = await reopen(bootstrap);
    expect(live.status).toBe(200);
    expect(RuntimeSessionSchema.parse(live.body)).toMatchObject({ sessionId: rootSessionId, rootSessionId, epoch: created.epoch, runtimeStatus: 'idle' });
    expect(reconciles).toBe(reconcilesAfterAdmission);
    expect(await catalogGeneration()).toBe(generation);
    for (const mismatch of [{ agentDirectoryId: 'other-owner' }, { projectId: randomUUID() }, { cwd: otherCwd }]) {
      const refused = await reopen({ ...bootstrap, ...mismatch });
      expect(refused).toMatchObject({ status: 403, body: { code: 'UNAUTHORIZED' } });
    }
    expect(reconciles).toBe(reconcilesAfterAdmission);
    expect(await catalogGeneration()).toBe(generation);
  } finally {
    await service.stop();
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
}, 60000);
