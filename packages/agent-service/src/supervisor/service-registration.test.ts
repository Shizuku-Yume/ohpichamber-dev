import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type Server } from 'node:net';
import { z } from 'zod';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { ProblemDetailsSchema } from '@openchamber/agent-contract';

import { WorkerRegistry, WORKER_CAPACITY_POLICY } from './workers.ts';
import { AgentService } from './service.ts';
import type { HostSkillSourceResult } from './file-resources-host-protocol.ts';

const workerEntrypoint = fileURLToPath(new URL('./fixtures/capacity-worker.mjs', import.meta.url));

const freePort = () => {
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  const probe: Server = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') { probe.close(); reject(new Error('Address unavailable')); return; }
    probe.close(() => resolve(address.port));
  });
  return promise;
};

test('a replacement worker waiting when an old registration fails is not stopped', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-stop-generation-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([mkdir(cwd), mkdir(agentDirectory)]);

  const registry = new WorkerRegistry({
    workerEntrypoint,
    capacityPolicy: WORKER_CAPACITY_POLICY,
  });

  const rootSessionId = 'root-sess-stop-gen';
  try {
    const first = await registry.start({
      rootSessionId,
      projectId: 'project',
      workspaceId: 'workspace',
      cwd,
      agentDirectory,
    });
    const firstGen = first.workerGeneration;
    expect(first.state).toBe('ready');

    // Replace worker: start replacement worker
    const second = await registry.start({
      rootSessionId,
      projectId: 'project',
      workspaceId: 'workspace',
      cwd,
      agentDirectory,
    }, true);
    const secondGen = second.workerGeneration;
    expect(secondGen).not.toBe(firstGen);
    expect(second.state).toBe('ready');

    // When the old registration fails, it calls stopGeneration with firstGen.
    // The check and stop run together under withRoot: because the worker generation is now secondGen,
    // the replacement worker MUST NOT be stopped.
    const result = await registry.stopGeneration(rootSessionId, firstGen);
    expect(result).toBe(true);

    const currentInfo = registry.info(rootSessionId);
    expect(currentInfo).toBeDefined();
    expect(currentInfo?.workerGeneration).toBe(secondGen);
    expect(currentInfo?.state).toBe('ready');
  } finally {
    await registry.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a deferred registration failure surfaces with its cause as a session error and in diagnostics', async () => {
  const sentinelCause = 'Sentinel MCP discovery failed due to network reset';
  const root = await mkdtemp(join(tmpdir(), 'service-deferred-reg-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([cwd, agentDirectory].map(dir => mkdir(dir, { recursive: true })));

  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  manager.appendMessage({ role: 'user', content: 'Initial message', timestamp: Date.now() });
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  await manager.close();
  if (!sessionFile) throw new Error('Session file required');

  const diagnostics: Array<{ level: string; rootSessionId?: string; workerGeneration?: string; message: string }> = [];
  const secret = randomBytes(32).toString('hex');
  const rootSessionId = randomUUID();
  const projectId = randomUUID();
  const workspaceId = randomUUID();
  const port = await freePort();

  const diagnosticSettled = Promise.withResolvers<{ level: string; rootSessionId?: string; workerGeneration?: string; message: string }>();
  const service = new AgentService({
    workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
    internalSecret: secret,
    stateDirectory: join(root, 'service-state'),
    port,
    policyCheck: async () => ({ allowed: true }),
    invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
    hostSkillSource: async (operation): Promise<HostSkillSourceResult> => (
      operation.action === 'reconcile' ? { status: 'reconciled', sources: { workspace: '0', agent: '0' } }
        : { status: 'failed', code: 'SERVICE_UNAVAILABLE' }
    ),
    onDiagnostic: (diagnostic) => {
      diagnostics.push(diagnostic);
      if (diagnostic.message.includes('Catalog registration failed')) {
        diagnosticSettled.resolve(diagnostic);
      }
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

    // Register workspace
    const wsResp = await request(`/internal/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'POST',
      body: JSON.stringify({ projectId, cwd, agentDirectory, agentDirectoryId: 'owner-reg-fail', env: {} }),
    });
    expect(wsResp.status).toBe(201);

    // Mock catalog.register to reject with the sentinel cause
    const coordinator = service['catalog'];
    coordinator.register = async () => {
      throw new Error(sentinelCause);
    };

    const opened = await request('/internal/sessions', {
      method: 'POST',
      body: JSON.stringify({
        rootSessionId,
        projectId,
        workspaceId,
        cwd,
        agentDirectory,
        agentDirectoryId: 'owner-reg-fail',
        displayPath: 'workspace',
        sessionFile,
        sessionsDirectory,
      }),
    });
    expect(opened.status).toBe(201);
    // 1. Verify diagnostics captured the registration failure
    const diagnostic = await diagnosticSettled.promise;
    expect(diagnostic).toBeDefined();
    expect(diagnostic.level).toBe('error');
    expect(diagnostic.rootSessionId).toBe(rootSessionId);
    expect(diagnostic.message).toContain(sentinelCause);
    // Wait for the worker to fully exit and trigger onExit before inspecting runtime/submitting run
    const { promise: delay, resolve: resolveDelay } = Promise.withResolvers<void>();
    setTimeout(resolveDelay, 150);
    await delay;
    // 2. Verify the session runtime surfaces the cause
    // Registration failure calls sessions.registrationFailed(rootSessionId, generation, cause),
    // which marks the journal unavailable with that cause.
    const sessionRes = await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}`);
    expect(sessionRes.body).toMatchObject({
      sessionId: rootSessionId,
      runtimeStatus: 'unavailable',
    });

    // 3. A run submitted to this session fails with the cause
    const runRes = await request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/runs`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'prompt',
        runId: randomUUID(),
        request: { input: { text: 'Hello', context: [], attachments: [] }, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null } },
      }),
    });
    expect(runRes.status).toBe(503);
    const problem = ProblemDetailsSchema.parse(runRes.body);
    expect(problem.code).toBe('SERVICE_UNAVAILABLE');
    expect(problem.detail).toContain(sentinelCause);
  } finally {
    process.env.HOME = previousHome;
    await service.stop();
  }
}, 30_000);
