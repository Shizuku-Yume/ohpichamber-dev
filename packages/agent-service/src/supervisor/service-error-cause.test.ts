import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { ProblemDetailsSchema } from '@openchamber/agent-contract';

import { CanonicalApiError, CanonicalClient } from '../../../ui/src/api/canonicalClient.ts';
import { problemMessage } from '../../../ui/src/lib/problemMessage.ts';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '../../../ui/src/lib/runtime-url.ts';
import { setRuntimeExtraHeaders } from '../../../ui/src/lib/runtime-auth.ts';
import { WorkerReplySchema } from '../protocol.ts';
import { AgentService } from './service.ts';

import type { HostSkillSourceResult } from './file-resources-host-protocol.ts';

const ListeningPortSchema = z.object({ port: z.number().int().positive() });
const freePort = () => {
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  const probe: Server = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = ListeningPortSchema.safeParse(probe.address());
    probe.close(() => address.success ? resolve(address.data.port) : reject(new Error('A free loopback port is required')));
  });
  return promise;
};

test('an operation error reply must carry a detail', () => {
  const reply = { type: 'operation.error', workerGeneration: 'generation', commandId: 'command', code: 'SESSION_NOT_FOUND', status: 404 };
  expect(WorkerReplySchema.safeParse(reply).success).toBe(false);
  expect(WorkerReplySchema.safeParse({ ...reply, detail: 'BTW record not found: sentinel' }).success).toBe(true);
});

/**
 * One cause, followed from the worker that threw it to the sentence a person
 * reads: the worker's operation error detail, the problem response,
 * `CanonicalApiError.message` and the toast text all carry the same unique
 * string. The worker throws it itself; no layer in between may invent it.
 */
test('a worker cause reaches the problem response and the toast unchanged', async () => {
  const sentinel = `SENTINEL_CAUSE_${randomUUID().replaceAll('-', '')}`;
  const root = await mkdtemp(join(tmpdir(), 'sentinel-cause-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  manager.appendMessage({ role: 'user', content: 'Sentinel proof prompt', timestamp: Date.now() });
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  await manager.close();
  if (!sessionFile) throw new Error('A native session file is required');
  const secret = randomBytes(32).toString('hex');
  const rootSessionId = randomUUID();
  const projectId = randomUUID();
  const workspaceId = randomUUID();
  const env = {
    HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
    OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'), XDG_CACHE_HOME: join(root, 'cache'),
  };
  const port = await freePort();
  const service = new AgentService({
    workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
    internalSecret: secret,
    stateDirectory: join(root, 'service-state'),
    port,
    policyCheck: async () => ({ allowed: true }),
    invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
    hostSkillSource: async (operation): Promise<HostSkillSourceResult> => (
      operation.action === 'reconcile' ? { status: 'reconciled', sources: { workspace: '0', agent: '0' } }
        : { status: 'failed', code: 'SERVICE_UNAVAILABLE' }),
  });
  try {
    await service.start();
    const request = async (pathname: string, init: RequestInit = {}) => {
      const headers = new Headers({ 'x-internal-secret': secret, accept: 'application/json' });
      if (init.body) headers.set('content-type', 'application/json');
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
      return { status: response.status, body: z.json().parse(await response.json().catch(() => null)) };
    };
    expect((await request(`/internal/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'POST',
      body: JSON.stringify({ projectId, cwd, agentDirectory, agentDirectoryId: 'sentinel-owner', env })
    })).status).toBe(201);
    const opened = await request('/internal/sessions', {
      method: 'POST',
      body: JSON.stringify({ rootSessionId, projectId, workspaceId, cwd, agentDirectory, agentDirectoryId: 'sentinel-owner', displayPath: 'workspace', env, sessionFile, sessionsDirectory })
    });
    expect(opened).toMatchObject({ status: 201 });

    // The worker refuses an unknown BTW record with the record id it was given,
    // so the only source of this sentence is the worker's own thrown error.
    const refused = await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}/control`, {
      method: 'POST', body: JSON.stringify({ type: 'btw.branch', recordId: sentinel }),
    });
    expect(refused.status).toBe(404);
    const problem = ProblemDetailsSchema.parse(refused.body);
    expect(problem.detail).toBe(`BTW record not found: ${sentinel}`);

    // …and the real canonical client surfaces the same sentence as its error
    // message, so the chain is exercised end to end rather than reconstructed.
    const previousResolver = getRuntimeUrlResolver();
    configureRuntimeUrlResolver({ apiBaseUrl: `http://127.0.0.1:${port}` });
    setRuntimeExtraHeaders({ 'x-internal-secret': secret });
    let error: unknown;
    try {
      await new CanonicalClient().branchFromBtw(rootSessionId, sentinel);
    } catch (caught) { error = caught; }
    finally { setRuntimeExtraHeaders({}); setRuntimeUrlResolver(previousResolver); }
    expect(error).toBeInstanceOf(CanonicalApiError);
    expect((error as Error).message).toBe(`BTW record not found: ${sentinel}`);

    // …and the toast text a person reads is that cause, not the fallback.
    expect(problemMessage(error, 'The /btw branch could not be created.')).toBe(`BTW record not found: ${sentinel}`);
  } finally {
    await service.stop();
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
