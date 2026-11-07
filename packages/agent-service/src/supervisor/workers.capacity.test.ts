import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WorkerBootstrap } from '../protocol.ts';
import { WORKER_CAPACITY_POLICY, WorkerOperationError, WorkerRegistry, type WorkerCapacityPolicy } from './workers.ts';

const workerEntrypoint = fileURLToPath(new URL('./fixtures/capacity-worker.mjs', import.meta.url));

const policy = (overrides: Partial<WorkerCapacityPolicy> = {}): WorkerCapacityPolicy => ({ ...WORKER_CAPACITY_POLICY, ...overrides });

const workspace = async (name: string) => {
  const root = await mkdtemp(join(tmpdir(), `worker-capacity-${name}-`));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([mkdir(cwd), mkdir(agentDirectory)]);
  return { root, cwd, agentDirectory, remove: () => rm(root, { recursive: true, force: true }) };
};

const startSession = (registry: WorkerRegistry, rootSessionId: string, cwd: string, agentDirectory: string, env?: Record<string, string>) => {
  const bootstrap: WorkerBootstrap = { rootSessionId, projectId: 'project', workspaceId: 'workspace', cwd, agentDirectory };
  if (env !== undefined) bootstrap.env = env;
  return registry.start(bootstrap);
};

/**
 * Poll for an observable state instead of sleeping a fixed window. Real child
 * processes and the registry's own interval share no fake clock, so the
 * assertion stays on what the registry exposes and the deadline carries
 * generous slack for a machine running every suite at once.
 * Integration test: WorkerRegistry spawns real child processes and uses an
 * unmockable platform timer loop, so deterministic time control will not work.
 */
const pollUntil = async (description: string, timeoutMs: number, predicate: () => boolean) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${description}`);
    // Integration test: polling real worker process state against platform clock
    await Bun.sleep(20);
  }
};

/**
 * The registry entry disappears only after the worker's process has been
 * stopped and reaped, so that removal is the observable end of an eviction.
 */
const waitForEviction = async (registry: WorkerRegistry, rootSessionId: string, timeoutMs = 15_000) => {
  await pollUntil(`${rootSessionId} to be evicted`, timeoutMs, () => registry.info(rootSessionId) === undefined);
};

/**
 * Each idle-eviction attempt asks the registry's `isSessionIdle` option before
 * it may stop a worker. Counting those probes is a deterministic barrier: once
 * a worker has been probed N times and is still registered, N eviction attempts
 * ran while the postponement was in force, however much CPU contention
 * stretched the clock. Integration tests only: a unit-level fake clock cannot
 * drive real child process exit.
 */
const createReapBarrier = (idle: (rootSessionId: string) => boolean = () => true) => {
  const probes = new Map<string, number>();
  return {
    isSessionIdle: (rootSessionId: string) => {
      probes.set(rootSessionId, (probes.get(rootSessionId) ?? 0) + 1);
      return idle(rootSessionId);
    },
    /** Blocks until the registry has probed the root `attempts` more times. */
    waitForAttempts: (rootSessionId: string, attempts: number, timeoutMs = 10_000) => {
      const target = (probes.get(rootSessionId) ?? 0) + attempts;
      return pollUntil(`the registry to attempt ${target} evictions of ${rootSessionId}`, timeoutMs,
        () => (probes.get(rootSessionId) ?? 0) >= target);
    },
  };
};

/** Advance past the current millisecond so last-activity ordering is strict. */
const waitForClockTick = async () => {
  const started = Date.now();
  while (Date.now() === started) await Bun.sleep(0);
};

test('the measured Task17 policy is the production default', () => {
  expect(WORKER_CAPACITY_POLICY).toEqual({
    maxActiveRootWorkers: 5,
    idleEvictionTimeoutMs: 600_000,
    reapIntervalMs: 30_000,
  });
});

test('a new root at the cap evicts the least recently active idle worker', async () => {
  const tree = await workspace('evict-lru');
  const registry = new WorkerRegistry({ workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 10_000, stopTimeoutMs: 2_000,
    capacityPolicy: policy({ maxActiveRootWorkers: 2, idleEvictionTimeoutMs: 60_000, reapIntervalMs: 60_000 }) });
  try {
    await registry.startStateless({ rootSessionId: 'catalog-root', projectId: 'project', workspaceId: 'workspace',
      cwd: tree.cwd, agentDirectory: tree.agentDirectory, agentDirectoryId: 'agent', catalogRevision: '1' });
    await startSession(registry, 'root-one', tree.cwd, tree.agentDirectory);
    await waitForClockTick();
    await startSession(registry, 'root-two', tree.cwd, tree.agentDirectory);
    await waitForClockTick();

    await startSession(registry, 'root-three', tree.cwd, tree.agentDirectory);

    const workers = registry.list();
    expect(workers.filter(worker => worker.kind === 'session').map(worker => worker.rootSessionId).sort()).toEqual(['root-three', 'root-two']);
    expect(workers.find(worker => worker.kind === 'stateless')?.rootSessionId).toBe('catalog-root');
    expect(workers.filter(worker => worker.kind === 'session').every(worker => worker.state === 'ready')).toBe(true);
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('a busy-only cap is refused with the capacity outcome and leaves every worker', async () => {
  const tree = await workspace('busy-refusal');
  const registry = new WorkerRegistry({ workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 10_000, stopTimeoutMs: 2_000, isSessionIdle: () => false,
    capacityPolicy: policy({ maxActiveRootWorkers: 2, idleEvictionTimeoutMs: 60_000, reapIntervalMs: 60_000 }) });
  try {
    await startSession(registry, 'root-one', tree.cwd, tree.agentDirectory);
    await startSession(registry, 'root-two', tree.cwd, tree.agentDirectory);
    const refusal = await startSession(registry, 'root-three', tree.cwd, tree.agentDirectory).catch(error => error);
    expect(refusal).toBeInstanceOf(WorkerOperationError);
    if (!(refusal instanceof WorkerOperationError)) throw new Error('Expected a typed capacity refusal');
    expect(refusal).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE',
      details: { reason: 'worker_capacity', activeRootWorkers: 2, maxActiveRootWorkers: 2 } });
    expect(refusal.message).toBe('Session capacity is full (2 of 2 active). Every worker is busy; finish or close one before sending another message.');
    expect(registry.list().filter(worker => worker.kind === 'session').map(worker => worker.rootSessionId).sort()).toEqual(['root-one', 'root-two']);
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('simultaneous opens cannot oversubscribe the cap', async () => {
  const tree = await workspace('concurrent');
  const registry = new WorkerRegistry({ workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 10_000, stopTimeoutMs: 2_000,
    capacityPolicy: policy({ maxActiveRootWorkers: 2, idleEvictionTimeoutMs: 60_000, reapIntervalMs: 60_000 }) });
  try {
    const outcomes = await Promise.allSettled(['a', 'b', 'c'].map(id => startSession(registry, `root-${id}`, tree.cwd, tree.agentDirectory)));
    // Roots still starting are not idle, so a concurrent third admission may be refused; the cap must hold.
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(2);
    const rejected = outcomes.find(outcome => outcome.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : null).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(registry.list().filter(worker => worker.kind === 'session')).toHaveLength(2);
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('an idle worker is evicted while active-turn and pending-approval roots stay', async () => {
  const tree = await workspace('idle');
  const blocked = new Set(['root-active-turn', 'root-pending-approval']);
  const barrier = createReapBarrier(rootSessionId => !blocked.has(rootSessionId));
  const registry = new WorkerRegistry({ workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 10_000, stopTimeoutMs: 2_000,
    capacityPolicy: policy({ idleEvictionTimeoutMs: 100, reapIntervalMs: 20 }),
    isSessionIdle: barrier.isSessionIdle });
  const sessionRoots = () => registry.list().filter(worker => worker.kind === 'session').map(worker => worker.rootSessionId).sort();
  try {
    for (const id of ['root-idle', 'root-active-turn', 'root-pending-approval']) await startSession(registry, id, tree.cwd, tree.agentDirectory);
    // Two blocked roots are probed twice by every completed reap attempt, so
    // waiting for four probes proves the reaper ran with them still busy
    // rather than racing a fixed sleep.
    await Promise.all(['root-active-turn', 'root-pending-approval'].map(id => barrier.waitForAttempts(id, 4)));
    await waitForEviction(registry, 'root-idle');
    expect(sessionRoots()).toEqual(['root-active-turn', 'root-pending-approval']);

    blocked.delete('root-active-turn');
    await waitForEviction(registry, 'root-active-turn');
    expect(sessionRoots()).toEqual(['root-pending-approval']);

    blocked.delete('root-pending-approval');
    await waitForEviction(registry, 'root-pending-approval');
    expect(sessionRoots()).toEqual([]);
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('a pending worker operation and a restart reservation each postpone eviction', async () => {
  const tree = await workspace('pending');
  const barrier = createReapBarrier();
  // The fixture delays every snapshot reply, including the eviction probe, so
  // the stop timeout must stay well above the operation delay for the probe to
  // resolve rather than time out on a busy machine.
  const registry = new WorkerRegistry({ workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 10_000, stopTimeoutMs: 5_000,
    capacityPolicy: policy({ idleEvictionTimeoutMs: 50, reapIntervalMs: 10 }),
    isSessionIdle: barrier.isSessionIdle });
  try {
    await startSession(registry, 'root-pending-operation', tree.cwd, tree.agentDirectory, { WORKER_OPERATION_DELAY_MS: '1500' });
    const pending = registry.request('root-pending-operation', { type: 'shell', operation: { type: 'snapshot' } });
    // Two probes are one complete reaper decision, so waiting for four probes
    // proves the registry tried twice to evict while the operation was still
    // outstanding, with a hold far longer than the idle window so contention
    // cannot close that gap.
    await barrier.waitForAttempts('root-pending-operation', 4, 20_000);
    expect(registry.info('root-pending-operation')?.state).toBe('ready');
    // Rejects if the worker was stopped mid-operation; the reply is the
    // observable end of the postponement.
    await pending;
    await waitForEviction(registry, 'root-pending-operation');

    await startSession(registry, 'root-reserved', tree.cwd, tree.agentDirectory);
    const generation = registry.info('root-reserved')?.workerGeneration;
    if (!generation) throw new Error('A ready worker generation is required');
    const reservation = registry.reserveRestart('root-reserved', generation);
    await barrier.waitForAttempts('root-reserved', 2, 20_000);
    expect(registry.info('root-reserved')?.state).toBe('ready');
    reservation.release();
    await waitForEviction(registry, 'root-reserved');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);

test('a running background shell job postpones eviction until it ends', async () => {
  const tree = await workspace('shell-job');
  const barrier = createReapBarrier();
  const registry = new WorkerRegistry({ workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 10_000, stopTimeoutMs: 2_000,
    capacityPolicy: policy({ idleEvictionTimeoutMs: 100, reapIntervalMs: 20 }),
    isSessionIdle: barrier.isSessionIdle });
  try {
    await startSession(registry, 'root-shell-job', tree.cwd, tree.agentDirectory, { WORKER_SHELL_JOB_MS: '1500' });
    // Probing twice proves a reap decision ran; the job snapshot then proves
    // it was still running, which is the condition the eviction must respect.
    await barrier.waitForAttempts('root-shell-job', 2, 20_000);
    expect(registry.info('root-shell-job')?.state).toBe('ready');
    const probe = await registry.request('root-shell-job', { type: 'shell', operation: { type: 'snapshot' } });
    expect(probe.type === 'shell' && probe.result.type === 'snapshot' ? probe.result.snapshot.running : []).toHaveLength(1);

    await waitForEviction(registry, 'root-shell-job');
  } finally {
    try { await registry.close(); } finally { await tree.remove(); }
  }
}, 30_000);
