import { expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import type { WorkerBootstrap } from '../protocol.ts';
import { SessionRegistry } from '../sessions/registry.ts';
import { AgentService } from './service.ts';
import { WORKER_CAPACITY_POLICY, WorkerOperationError, WorkerRegistry, type WorkerCapacityPolicy, type WorkerRegistryOptions } from './workers.ts';

const workerEntrypoint = fileURLToPath(new URL('./fixtures/capacity-worker.mjs', import.meta.url));
const realWorkerEntrypoint = fileURLToPath(new URL('../worker/index.ts', import.meta.url));

const ListeningPortSchema = z.object({ port: z.number().int().positive() });
const freePort = () => new Promise<number>((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = ListeningPortSchema.safeParse(probe.address());
    probe.close(() => address.success ? resolve(address.data.port) : reject(new Error('A free loopback port is required')));
  });
});

const policy = (overrides: Partial<WorkerCapacityPolicy> = {}): WorkerCapacityPolicy => ({
  ...WORKER_CAPACITY_POLICY, idleEvictionTimeoutMs: 600_000, reapIntervalMs: 60_000, ...overrides,
});

type LeaseWorkspace = {
  root: string;
  cwd: string;
  agentDirectory: string;
  stateDirectory: string;
  remove: () => Promise<void>;
};

type ExpectedRefusal = { status: number; code: string; details?: Record<string, unknown> };

const workspace = async (name: string): Promise<LeaseWorkspace> => {
  const root = await mkdtemp(join(tmpdir(), `worker-lease-${name}-`));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const stateDirectory = join(root, 'service-state');
  await Promise.all([cwd, agentDirectory, stateDirectory].map(directory => mkdir(directory, { recursive: true })));
  return { root, cwd, agentDirectory, stateDirectory, remove: () => rm(root, { recursive: true, force: true }) };
};

const sessionBootstrap = (rootSessionId: string, tree: LeaseWorkspace): WorkerBootstrap => ({
  rootSessionId, projectId: 'project', workspaceId: 'workspace', cwd: tree.cwd, agentDirectory: tree.agentDirectory,
  env: { WORKER_SESSION_FILE: join(tree.agentDirectory, `${rootSessionId}.jsonl`) },
});

const refusalOf = async (operation: Promise<unknown>): Promise<WorkerOperationError> => {
  const error = await operation.catch(caught => caught);
  expect(error).toBeInstanceOf(WorkerOperationError);
  if (!(error instanceof WorkerOperationError)) throw new Error('Expected a typed worker refusal');
  return error;
};

const expectRefusal = (error: WorkerOperationError, expected: ExpectedRefusal): void => {
  expect({
    status: error.status,
    code: error.code,
    ...(error.details === undefined ? {} : { details: error.details }),
  }).toEqual(expected);
};

const startStateless = (registry: WorkerRegistry, rootSessionId: string, tree: LeaseWorkspace, env?: Record<string, string>) => (
  registry.startStateless({
    rootSessionId, projectId: 'project', workspaceId: 'workspace', cwd: tree.cwd,
    agentDirectory: tree.agentDirectory, agentDirectoryId: 'agent-owner', catalogRevision: '0',
    ...(env === undefined ? {} : { env }),
  })
);

const startUsage = (registry: WorkerRegistry, tree: LeaseWorkspace, rootSessionId = 'usage-worker', cwd = tree.stateDirectory) => (
  registry.startUsage({
    rootSessionId, projectId: rootSessionId, workspaceId: rootSessionId,
    cwd, agentDirectory: tree.stateDirectory, agentDirectoryId: rootSessionId, catalogRevision: '0',
  })
);

const newRegistry = (overrides: Partial<WorkerRegistryOptions> = {}) => (
  new WorkerRegistry({
    workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 10_000, stopTimeoutMs: 2_000,
    capacityPolicy: policy(),
    ...overrides,
  })
);

test('a lease stops session and stateless workers at the directory, leaves usage alone, and refuses new starts until release', async () => {
  const tree = await workspace('kinds');
  const registry = newRegistry();
  try {
    await registry.start(sessionBootstrap('root-session', tree));
    await startStateless(registry, 'catalog-root', tree);
    await startUsage(registry, tree);

    const lease = await registry.acquireWorktreeLease('lease-1', tree.cwd);
    expect(new Set(lease.released)).toEqual(new Set(['root-session', 'catalog-root']));
    expect(registry.info('root-session')).toBeUndefined();
    expect(registry.info('catalog-root')).toBeUndefined();
    expect(registry.info('usage-worker')?.state).toBe('ready');
    expectRefusal(await refusalOf(registry.start(sessionBootstrap('root-session', tree))), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-1' },
    });
    expectRefusal(await refusalOf(startStateless(registry, 'catalog-root', tree)), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-1' },
    });
    expectRefusal(await refusalOf(startUsage(registry, tree, 'usage-inside', tree.cwd)), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-1' },
    });
    expect(registry.info('usage-inside')).toBeUndefined();

    await registry.releaseWorktreeLease('lease-1');
    const reopened = await registry.start(sessionBootstrap('root-session', tree));
    expect(reopened.state).toBe('ready');
    await startStateless(registry, 'catalog-root', tree);
    expect(registry.info('catalog-root')?.state).toBe('ready');
    const admittedUsage = await startUsage(registry, tree, 'usage-inside', tree.cwd);
    expect(admittedUsage.state).toBe('ready');
    expect(registry.info('usage-inside')?.state).toBe('ready');
    // The usage worker outside the lease remained untouched throughout.
    expect(registry.info('usage-worker')?.state).toBe('ready');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('a pending stateless operation refuses the lease with COMMAND_IN_FLIGHT and creates no lease', async () => {
  const tree = await workspace('busy-stateless');
  const registry = newRegistry();
  try {
    await startStateless(registry, 'catalog-root', tree, { WORKER_OPERATION_DELAY_MS: '300' });
    const pending = registry.request('catalog-root', { type: 'shell', operation: { type: 'snapshot' } });

    expectRefusal(await refusalOf(registry.acquireWorktreeLease('lease-busy', tree.cwd)), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { sessionId: 'catalog-root' },
    });
    await pending;
    // The refusal removed its fence: a later acquire succeeds.
    const lease = await registry.acquireWorktreeLease('lease-busy', tree.cwd);
    expect(lease.released).toEqual(['catalog-root']);
    await registry.releaseWorktreeLease('lease-busy');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('an active run refuses the lease with RUN_ACTIVE, and the idle worker stops once it ends', async () => {
  const tree = await workspace('busy-session');
  let idle = false;
  const registry = newRegistry({ isSessionIdle: () => idle });
  try {
    await registry.start(sessionBootstrap('root-session', tree));
    expectRefusal(await refusalOf(registry.acquireWorktreeLease('lease-run', tree.cwd)), {
      status: 409, code: 'RUN_ACTIVE', details: { sessionId: 'root-session' },
    });
    expect(registry.info('root-session')?.state).toBe('ready');

    idle = true;
    const lease = await registry.acquireWorktreeLease('lease-run', tree.cwd);
    expect(lease.released).toEqual(['root-session']);
    expect(registry.info('root-session')).toBeUndefined();
    await registry.releaseWorktreeLease('lease-run');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('a completed run and a newly opening draft do not prevent a worktree lease', async () => {
  const tree = await workspace('opening-session');
  const opening = Promise.withResolvers<void>();
  const observedOpening = Promise.withResolvers<void>();
  let draftIdle = false;
  const registry = newRegistry({
    callbacks: {
      onOpened: (...args) => sessions.onOpened(...args),
      onEvents: (...args) => sessions.onEvents(...args),
      onExit: (...args) => sessions.onExit(...args),
    },
    isSessionIdle: id => id === 'draft-session' ? draftIdle : sessions.isIdleForEviction(id),
    sessionOpening: id => {
      if (id !== 'draft-session') return;
      observedOpening.resolve();
      return opening.promise;
    },
  });
  const sessions = new SessionRegistry(tree.stateDirectory, registry);
  try {
    await sessions.initialize();
    await sessions.open({ ...sessionBootstrap('root-session', tree), displayPath: 'workspace' });
    const worker = registry.info('root-session');
    if (!worker) throw new Error('Expected a running worker');
    sessions.onEvents('root-session', worker.workerGeneration, [
      { timestamp: 1, event: { type: 'run.started', runId: 'run-1', origin: 'host', createdAt: 1 } },
    ]);
    expect(sessions.isIdleForEviction('root-session')).toBe(false);
    sessions.onEvents('root-session', worker.workerGeneration, [
      { timestamp: 2, event: { type: 'run.completed', runId: 'run-1', finishedAt: 2 } },
    ]);
    expect(sessions.isIdleForEviction('root-session')).toBe(true);

    await registry.start(sessionBootstrap('draft-session', tree));
    const acquisition = registry.acquireWorktreeLease('lease-opening', tree.cwd);
    await Promise.race([observedOpening.promise, acquisition]);
    expect(registry.info('draft-session')?.state).toBe('ready');

    draftIdle = true;
    opening.resolve();
    expect(await acquisition).toEqual({ leaseId: 'lease-opening', released: ['root-session', 'draft-session'] });
    expect(registry.info('root-session')).toBeUndefined();
    expect(registry.info('draft-session')).toBeUndefined();
    await registry.releaseWorktreeLease('lease-opening');
  } finally {
    opening.resolve();
    try { await sessions.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('session storage inside the leased directory refuses the lease', async () => {
  const tree = await workspace('session-storage');
  const registry = newRegistry();
  try {
    await registry.start({
      ...sessionBootstrap('root-session', tree),
      sessionsDirectory: join(tree.cwd, 'sessions'),
    });
    expectRefusal(await refusalOf(registry.acquireWorktreeLease('lease-storage', tree.cwd)), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { sessionId: 'root-session' },
    });
    expect(registry.info('root-session')?.state).toBe('ready');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('a refusal after an earlier stop keeps that worker stopped and creates no lease', async () => {
  const tree = await workspace('partial-refusal');
  const registry = newRegistry();
  try {
    await registry.start(sessionBootstrap('root-idle', tree));
    await startStateless(registry, 'catalog-busy', tree, { WORKER_OPERATION_DELAY_MS: '300' });
    const pending = registry.request('catalog-busy', { type: 'shell', operation: { type: 'snapshot' } });

    expectRefusal(await refusalOf(registry.acquireWorktreeLease('lease-partial', tree.cwd)), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { sessionId: 'catalog-busy' },
    });
    // The idle session was stopped before the refusal and is not restarted.
    expect(registry.info('root-idle')).toBeUndefined();
    expect(registry.info('catalog-busy')?.state).toBe('ready');
    await pending;

    const lease = await registry.acquireWorktreeLease('lease-partial', tree.cwd);
    expect(lease.released).toEqual(['catalog-busy']);
    await registry.releaseWorktreeLease('lease-partial');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('same, ancestor and descendant leases are refused with the holder named', async () => {
  const tree = await workspace('overlap');
  const registry = newRegistry();
  const parent = tree.cwd;
  const child = join(tree.cwd, 'nested');
  await mkdir(child, { recursive: true });
  const sibling = join(tree.root, 'sibling');
  await mkdir(sibling, { recursive: true });
  try {
    await registry.acquireWorktreeLease('lease-parent', parent);
    for (const [leaseId, directory] of [['lease-same', parent], ['lease-child', child]]) {
      expectRefusal(await refusalOf(registry.acquireWorktreeLease(leaseId, directory)), {
        status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-parent', directory: parent },
      });
    }
    await registry.releaseWorktreeLease('lease-parent');

    await registry.acquireWorktreeLease('lease-child', child);
    expectRefusal(await refusalOf(registry.acquireWorktreeLease('lease-parent-2', parent)), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-child', directory: child },
    });
    await registry.releaseWorktreeLease('lease-child');

    // A sibling name sharing a prefix is not containment.
    await registry.acquireWorktreeLease('lease-sibling', sibling);
    await registry.releaseWorktreeLease('lease-sibling');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('a lease racing an in-flight prepareBootstrap leaves no worker and refuses the start', async () => {
  const tree = await workspace('race');
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const registry = newRegistry({
    prepareBootstrap: async (input) => {
      entered.resolve();
      await release.promise;
      return input;
    },
  });
  try {
    const starting = registry.start(sessionBootstrap('root-race', tree));
    await entered.promise;
    await registry.acquireWorktreeLease('lease-race', tree.cwd);
    release.resolve();
    expectRefusal(await refusalOf(starting), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-race' },
    });
    expect(registry.info('root-race')).toBeUndefined();
    expect(registry.list()).toEqual([]);
    await registry.releaseWorktreeLease('lease-race');
    const reopened = await registry.start(sessionBootstrap('root-race', tree));
    expect(reopened.state).toBe('ready');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('a duplicate lease id and a missing or relative directory are invalid or held', async () => {
  const tree = await workspace('identity');
  const registry = newRegistry();
  try {
    expectRefusal(await refusalOf(registry.acquireWorktreeLease('', tree.cwd)), {
      status: 400, code: 'INVALID_REQUEST',
    });
    expectRefusal(await refusalOf(registry.acquireWorktreeLease('lease-x', 'relative/path')), {
      status: 400, code: 'INVALID_REQUEST',
    });
    expectRefusal(await refusalOf(registry.acquireWorktreeLease('lease-x', join(tree.root, 'missing'))), {
      status: 400, code: 'INVALID_REQUEST',
    });

    await registry.acquireWorktreeLease('lease-x', tree.cwd);
    expectRefusal(await refusalOf(registry.acquireWorktreeLease('lease-x', tree.cwd)), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-x', directory: tree.cwd },
    });
    await registry.releaseWorktreeLease('lease-x');
    // Unknown ids are idempotent releases.
    await registry.releaseWorktreeLease('never-held');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('a release during canonicalization cancels the pending lease without leaving a fence', async () => {
  const tree = await workspace('release-before-canonicalization');
  const entered = Promise.withResolvers<void>();
  const canonicalization = Promise.withResolvers<string>();
  const registry = newRegistry({
    canonicalizeDirectory: async () => {
      entered.resolve();
      return canonicalization.promise;
    },
  });
  try {
    const acquiring = registry.acquireWorktreeLease('lease-cancelled', tree.cwd);
    await entered.promise;
    await registry.releaseWorktreeLease('lease-cancelled');
    canonicalization.resolve(tree.cwd);

    expectRefusal(await refusalOf(acquiring), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-cancelled', directory: tree.cwd },
    });
    registry.assertWorktreeLeaseAllows(tree.cwd);

    const next = await registry.acquireWorktreeLease('lease-cancelled', tree.cwd);
    expect(next.leaseId).toBe('lease-cancelled');
    await registry.releaseWorktreeLease('lease-cancelled');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('a duplicate pending lease id cannot cancel its original owner', async () => {
  const tree = await workspace('duplicate-pending-id');
  const entered = Promise.withResolvers<void>();
  const canonicalization = Promise.withResolvers<string>();
  const registry = newRegistry({
    canonicalizeDirectory: async () => {
      entered.resolve();
      return canonicalization.promise;
    },
  });
  try {
    const original = registry.acquireWorktreeLease('lease-owner', tree.cwd);
    await entered.promise;
    expectRefusal(await refusalOf(registry.acquireWorktreeLease('lease-owner', tree.cwd)), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-owner', directory: tree.cwd },
    });
    canonicalization.resolve(tree.cwd);
    await original;

    expectRefusal(await refusalOf(registry.start(sessionBootstrap('root-after-owner', tree))), {
      status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-owner' },
    });
    await registry.releaseWorktreeLease('lease-owner');
    expect((await registry.start(sessionBootstrap('root-after-owner', tree))).state).toBe('ready');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('the service refuses worker admission inside a lease over HTTP and admits again after release', async () => {
  const tree = await workspace('http');
  const secret = randomBytes(32).toString('hex');
  const port = await freePort();
  const previousHome = process.env.HOME;
  process.env.HOME = tree.root;
  const service = new AgentService({
    workerEntrypoint: realWorkerEntrypoint,
    internalSecret: secret,
    stateDirectory: join(tree.root, 'service-state'),
    port,
    policyCheck: async () => ({ allowed: true }),
    invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
    hostSkillSource: async (operation) => (
      operation.action === 'reconcile'
        ? { status: 'reconciled', sources: { workspace: '0', agent: '0' } }
        : { status: 'failed', code: 'SERVICE_UNAVAILABLE' }
    ),
  });
  try {
    await service.start();
    const request = async (pathname: string, init: RequestInit = {}) => {
      const headers = new Headers({ 'x-internal-secret': secret, accept: 'application/json' });
      if (init.body) headers.set('content-type', 'application/json');
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    };
    const projectId = 'project-http';
    const workspaceId = 'workspace-http';
    const workerEnv = {
      HOME: tree.root, USERPROFILE: tree.root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: tree.agentDirectory,
      OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(tree.root, 'config'), XDG_DATA_HOME: join(tree.root, 'data'),
      XDG_STATE_HOME: join(tree.root, 'state'), XDG_CACHE_HOME: join(tree.root, 'cache'),
    };
    const bootstrap = {
      rootSessionId: 'root-http', projectId, workspaceId, cwd: tree.cwd,
      agentDirectory: tree.agentDirectory, agentDirectoryId: 'agent-http', displayPath: 'workspace',
      env: workerEnv,
    };
    expect((await request(`/internal/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'POST',
      body: JSON.stringify({ projectId, cwd: tree.cwd, agentDirectory: tree.agentDirectory, agentDirectoryId: 'agent-http', env: bootstrap.env }),
    })).status).toBe(201);
    const opened = await request('/internal/sessions', { method: 'POST', body: JSON.stringify(bootstrap) });
    expect(opened).toMatchObject({ status: 201 });

    expect((await request('/internal/worktree-leases', {
      method: 'POST', body: JSON.stringify({ leaseId: 'lease-http', directory: tree.cwd }),
    })).status).toBe(201);

    const sessionRefusal = await request('/internal/sessions', {
      method: 'POST', body: JSON.stringify({ ...bootstrap, rootSessionId: 'root-http-2' }),
    });
    expect(sessionRefusal.status).toBe(409);
    expect(sessionRefusal.body).toMatchObject({ status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-http' } });
    const { displayPath: _displayPath, ...workerBootstrap } = bootstrap;
    const workerRefusal = await request('/internal/workers', {
      method: 'POST', body: JSON.stringify({ ...workerBootstrap, rootSessionId: 'root-http-3' }),
    });
    expect(workerRefusal.status).toBe(409);
    expect(workerRefusal.body).toMatchObject({ status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-http' } });
    const reopenRefusal = await request('/internal/sessions/root-http/reopen', { method: 'POST', body: JSON.stringify(bootstrap) });
    expect(reopenRefusal.status).toBe(409);
    expect(reopenRefusal.body).toMatchObject({ status: 409, code: 'COMMAND_IN_FLIGHT', details: { leaseId: 'lease-http' } });

    expect((await request('/internal/worktree-leases/lease-http', { method: 'DELETE' })).status).toBe(204);
    expect((await request('/internal/worktree-leases/never-held', { method: 'DELETE' })).status).toBe(204);
    expect((await request('/internal/sessions', {
      method: 'POST', body: JSON.stringify({ ...bootstrap, rootSessionId: 'root-http-4' }),
    })).status).toBe(201);
    expect((await request('/internal/workers/root-http-4', { method: 'DELETE' })).status).toBe(204);
  } finally {
    await service.stop();
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    await tree.remove();
  }
}, 60_000);

test('a Host IPC disconnect stops the detached service', async () => {
  const root = await mkdtemp(join(tmpdir(), 'service-disconnect-'));
  const secret = randomBytes(32).toString('hex');
  const child = spawn(process.execPath, [
    '--no-env-file', fileURLToPath(new URL('../index.ts', import.meta.url)), '--port', '0',
  ], {
    cwd: root,
    env: { ...process.env, HOME: root },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const exited = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)));
  const listening = Promise.withResolvers<number>();
  child.stdout?.setEncoding('utf8');
  let output = '';
  child.stdout?.on('data', (chunk: string) => {
    output += chunk;
    const lines = output.split('\n');
    output = lines.pop() ?? '';
    for (const line of lines) {
      try {
        const value = JSON.parse(line) as { type?: string; port?: number };
        if (value.type === 'agent-service.listening' && Number.isInteger(value.port)) listening.resolve(value.port as number);
      } catch { /* not an announcement line */ }
    }
  });
  child.on('message', (message: { type?: string }) => {
    if (message?.type === 'agent-service.internal-secret.request') {
      child.send({ type: 'agent-service.internal-secret', secret });
    }
  });
  const timeout = <T,>(promise: Promise<T>, message: string): Promise<T> => Promise.race([
    promise,
    // Real timers: this integration test spawns and stops a real process.
    new Promise<never>((_resolve, reject) => { setTimeout(() => reject(new Error(message)), 20_000); }),
  ]);
  try {
    const port = await timeout(listening.promise, 'Agent Service did not announce a port');
    let ready = false;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/agent/v1/ready`, {
          headers: { 'x-internal-secret': secret },
        });
        if (response.status === 200) { ready = true; break; }
      } catch { /* still starting */ }
      // Real timers: polling a real spawned process's readiness endpoint.
      await Bun.sleep(100);
    }
    expect(ready).toBe(true);

    child.disconnect();
    expect(await timeout(exited, 'Agent Service did not exit after IPC disconnect')).toBe(0);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
