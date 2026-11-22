import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { closeSessionIndex, recordSessionRecap } from '@oh-my-pi/pi-coding-agent/session/session-index';
import { HistoryPageSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import { AgentService } from '../supervisor/service.ts';

test('snapshot and history read a persisted session without starting a worker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cold-reads-'));
  const previousHome = process.env.HOME;
  const previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  manager.appendMessage({ role: 'user', content: 'Cold prompt', timestamp: Date.now() });
  manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Cold answer' }], timestamp: Date.now() });
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  await manager.close();
  if (!sessionFile) throw new Error('Native session file is required');

  const stateDirectory = join(root, 'service-state');
  await mkdir(stateDirectory, { recursive: true });
  const rootSessionId = randomUUID();
  const now = Date.now();
  await writeFile(join(stateDirectory, 'session-references.json'), JSON.stringify({
    references: {
      [rootSessionId]: {
        rootSessionId, projectId: randomUUID(), workspaceId: randomUUID(), cwd, agentDirectory, displayPath: 'workspace',
        sessionFile, sessionsDirectory, createdAt: now, updatedAt: now,
      },
    },
    subagents: {},
    relocations: {},
  }), { mode: 0o600 });

  const secret = randomBytes(32).toString('hex');
  const port = await new Promise<number>((resolve, reject) => {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const bound = probe.port;
    probe.stop(true).then(() => resolve(bound), reject);
  });
  const service = new AgentService({
    workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
    internalSecret: secret, stateDirectory, port,
    policyCheck: async () => ({ allowed: true }),
    invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
    hostSkillSource: async operation => operation.action === 'reconcile'
      ? { status: 'reconciled', sources: { workspace: '0', agent: '0' } }
      : { status: 'failed', code: 'SERVICE_UNAVAILABLE' },
  });
  const request = async (pathname: string) => {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { headers: { 'x-internal-secret': secret, accept: 'application/json' } });
    return { status: response.status, body: await response.json() };
  };
  try {
    await service.start();
    expect((await request('/internal/workers')).body.workers).toEqual([]);

    const snapshotResponse = await request(`/api/agent/v1/sessions/${rootSessionId}/snapshot`);
    expect(snapshotResponse.status).toBe(200);
    const snapshot = SessionSnapshotSchema.parse(snapshotResponse.body);
    expect(snapshot.session.runtimeStatus).toBe('unavailable');
    expect(snapshot.messages.map(message => message.role)).toEqual(['user', 'assistant']);

    const recaps = await request(`/api/agent/v1/sessions/${rootSessionId}/recaps`);
    expect(recaps).toEqual({ status: 200, body: { recaps: [] } });
    recordSessionRecap(manager.getSessionId(), cwd, 'Referenced native recap');
    expect((await request(`/api/agent/v1/sessions/${rootSessionId}/recaps`)).body.recaps).toEqual([
      expect.objectContaining({ sessionId: rootSessionId, cwd, recap: 'Referenced native recap' }),
    ]);

    const historyResponse = await request(`/api/agent/v1/sessions/${rootSessionId}/history?limit=10`);
    expect(historyResponse.status).toBe(200);
    const history = HistoryPageSchema.parse(historyResponse.body);
    expect(history.messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect((await request('/internal/workers')).body.workers).toEqual([]);
  } finally {
    await service.stop();
    closeSessionIndex();
    if (previousAgentDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('a listed unreferenced OMP session reads cold and promotes on its first reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-promotion-'));
  const previousHome = process.env.HOME;
  const previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  manager.appendMessage({ role: 'user', content: 'CLI prompt', timestamp: Date.now() });
  manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'CLI answer' }], timestamp: Date.now() });
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  const sessionId = manager.getSessionId();
  await manager.close();
  if (!sessionFile) throw new Error('Native session file is required');

  const stateDirectory = join(root, 'service-state');
  const projectId = randomUUID();
  const workspaceId = randomUUID();
  const agentDirectoryId = 'native-owner';
  const env = { HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
    OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'), XDG_CACHE_HOME: join(root, 'cache') };
  const secret = randomBytes(32).toString('hex');
  const port = await new Promise<number>((resolve, reject) => {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const bound = probe.port;
    probe.stop(true).then(() => resolve(bound), reject);
  });
  const service = new AgentService({
    workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
    internalSecret: secret, stateDirectory, port,
    policyCheck: async () => ({ allowed: true }),
    invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
    hostSkillSource: async operation => operation.action === 'reconcile'
      ? { status: 'reconciled', sources: { workspace: '0', agent: '0' } }
      : { status: 'failed', code: 'SERVICE_UNAVAILABLE' },
  });
  const request = async (pathname: string, init: RequestInit = {}) => {
    const headers = new Headers({ 'x-internal-secret': secret, accept: 'application/json' });
    if (init.body) headers.set('content-type', 'application/json');
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
    return { status: response.status, body: await response.json() };
  };
  const sessionWorkers = async () => (await request('/internal/workers')).body.workers
    .filter((worker: { kind: string }) => worker.kind === 'session');
  const reopenBody = JSON.stringify({ rootSessionId: sessionId, projectId, workspaceId, cwd, agentDirectory, agentDirectoryId, displayPath: 'workspace' });
  try {
    await service.start();
    expect((await request(`/internal/workspaces/${encodeURIComponent(workspaceId)}`, { method: 'POST',
      body: JSON.stringify({ projectId, cwd, agentDirectory, agentDirectoryId, env }) })).status).toBe(201);

    const listed = await request(`/api/agent/v1/sessions?workspaceId=${encodeURIComponent(workspaceId)}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId, rootSessionId: sessionId, projectId, workspaceId }),
    ]));
    expect(await sessionWorkers()).toEqual([]);
    await expect(readFile(join(stateDirectory, 'session-references.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    const snapshot = await request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/snapshot`);
    expect(snapshot.status).toBe(200);
    expect(SessionSnapshotSchema.parse(snapshot.body).messages.map(message => message.role)).toEqual(['user', 'assistant']);
    const history = await request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/history?limit=10`);
    expect(history.status).toBe(200);
    expect(HistoryPageSchema.parse(history.body).messages.map(message => message.role)).toEqual(['user', 'assistant']);

    const recapsPath = `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/recaps`;
    expect(await request(recapsPath)).toEqual({ status: 200, body: { recaps: [] } });
    recordSessionRecap(sessionId, cwd, 'Native cold recap');
    recordSessionRecap(sessionId, join(root, 'other-workspace'), 'Do not cross workspace scope');
    expect((await request(recapsPath)).body.recaps).toEqual([
      expect.objectContaining({ sessionId, cwd, recap: 'Native cold recap' }),
    ]);
    const missing = await request(`/api/agent/v1/sessions/${randomUUID()}/recaps`);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('SESSION_NOT_FOUND');
    expect(await sessionWorkers()).toEqual([]);

    const reopened = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/reopen`, { method: 'POST', body: reopenBody });
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({ sessionId, rootSessionId: sessionId, projectId, workspaceId });
    expect((await request(recapsPath)).body.recaps).toEqual([
      expect.objectContaining({ sessionId, cwd, recap: 'Native cold recap' }),
    ]);
    expect((await sessionWorkers()).map((worker: { rootSessionId: string }) => worker.rootSessionId)).toEqual([sessionId]);

    const references = JSON.parse(await readFile(join(stateDirectory, 'session-references.json'), 'utf8'));
    expect(references.references[sessionId]).toMatchObject({
      rootSessionId: sessionId, projectId, workspaceId, cwd, agentDirectory, agentDirectoryId, sessionFile,
    });

    // A second reopen joins the live root instead of starting a second worker.
    expect((await request(`/internal/sessions/${encodeURIComponent(sessionId)}/reopen`, { method: 'POST', body: reopenBody })).status).toBe(200);
    expect((await sessionWorkers()).map((worker: { rootSessionId: string }) => worker.rootSessionId)).toEqual([sessionId]);
  } finally {
    await service.stop();
    closeSessionIndex();
    if (previousAgentDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
