import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WorkerBootstrap } from '../protocol.ts';
import { WorkerRegistry } from './workers.ts';

/**
 * A spare is a worker process with no session. This fixture reports `idle`
 * immediately, then `warm` once it finished its background work, which is the
 * signal the supervisor uses to prefer an already-warm process.
 */
const SPARE_FIXTURE = [
  "import { appendFileSync, existsSync } from 'node:fs';",
  "import { join } from 'node:path';",
  // A worker's environment is the supervisor's allowlist, so the fixture reports
  // into its own working directory's parent, which the test owns.
  "const log = join(process.cwd(), '..', 'spare.log');",
  "const note = line => { try { appendFileSync(log, line + '\\n'); } catch { } };",
  "const send = message => { if (process.connected) process.send(message); };",
  "note(`spawn ${process.pid}`);",
  "note(`cwd ${process.pid} ${process.cwd()}`);",
  // A test may drop `../slow` to keep every spare unloaded, which is the state
  // startup is in when the Host registers a second workspace.
  "const goIdle = () => { send({ type: 'idle' }); setTimeout(() => { note(`warm ${process.pid}`); send({ type: 'warm' }); }, 50); };",
  "if (existsSync(join(process.cwd(), '..', 'slow'))) setTimeout(goIdle, 600); else goIdle();",
  "process.on('message', message => {",
  "  if (message?.type === 'bootstrap') { note(`bootstrap ${process.pid}`); send({ type: 'ready', workerGeneration: message.workerGeneration }); }",
  "  if (message?.type === 'stop') process.exit(0);",
  "});",
  "process.on('disconnect', () => process.exit(0));",
  "process.on('SIGTERM', () => process.exit(0));",
].join('\n');

const fixture = async (options: { slowLoad?: boolean } = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'worker-spare-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const entrypoint = join(root, 'spare-worker.mjs');
  const log = join(root, 'spare.log');
  await Promise.all([mkdir(cwd), mkdir(agentDirectory)]);
  if (options.slowLoad) await writeFile(join(root, 'slow'), '');
  await writeFile(entrypoint, SPARE_FIXTURE);
  return { root, cwd, agentDirectory, entrypoint, log, remove: () => rm(root, { recursive: true, force: true }) };
};

const registryFor = (entrypoint: string, sparePolicy?: { spareLifetimeMs?: number; sparePoolSize?: number }, capacityPolicy?: ConstructorParameters<typeof WorkerRegistry>[0]['capacityPolicy']) => new WorkerRegistry({
  workerEntrypoint: entrypoint,
  workerRuntime: process.execPath,
  isSessionIdle: () => true,
  prepareBootstrap: async input => input,
  ...(sparePolicy ? { sparePolicy } : {}),
  ...(capacityPolicy ? { capacityPolicy } : {}),
});

// The wish-list mechanics these tests pin are independent of the pool size,
// and the production default is one: pass the two-slot policy the scenarios
// were written for wherever the count matters.
const TWO_SPARES = { sparePoolSize: 2 };

const bootstrap = (rootSessionId: string, cwd: string, agentDirectory: string): WorkerBootstrap =>
({ rootSessionId, projectId: 'project', workspaceId: 'workspace', cwd, agentDirectory });

const spawnCount = async (log: string): Promise<number> => {
  const text = await Bun.file(log).text().catch(() => '');
  return text.split('\n').filter(line => line.startsWith('spawn ')).length;
};

const linePids = async (log: string, prefix: string): Promise<string[]> =>
  (await Bun.file(log).text().catch(() => '')).split('\n').filter(line => line.startsWith(prefix)).map(line => line.slice(prefix.length).trim());

const pids = (log: string): Promise<string[]> => linePids(log, 'spawn ');

/** Pids of spares this fixture started for one workspace directory. */
const pidsFor = async (log: string, cwd: string): Promise<string[]> =>
  (await Bun.file(log).text().catch(() => '')).split('\n')
    .filter(line => line.startsWith('cwd '))
    .map(line => line.slice(4).split(' '))
    .filter(([, dir]) => dir === cwd)
    .map(([pid]) => pid!);

const waitFor = async (predicate: () => Promise<boolean> | boolean, timeoutMs = 10_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await Bun.sleep(20);
  }
  throw new Error(`Timed out after ${timeoutMs} ms`);
};

// Integration test: WorkerRegistry spawns real child processes and uses the
// platform clock, so the pool is observed through its effect on process starts.
test('adopting a spare leaves a replacement loading so the next new chat adopts too', async () => {
  const f = await fixture();
  const registry = registryFor(f.entrypoint, TWO_SPARES);
  try {
    registry.warmSessionWorker({ cwd: f.cwd, agentDirectory: f.agentDirectory });
    await waitFor(async () => await spawnCount(f.log) >= 1);
    // The pool holds two slots: the first adoptable spare and one replacement.
    await waitFor(async () => await spawnCount(f.log) >= 2);

    await registry.start(bootstrap('first', f.cwd, f.agentDirectory));
    // Adoption consumed one slot, so the pool must still hold a loading spare and
    // refill again rather than leaving the next launch to a cold spawn.
    await waitFor(async () => await spawnCount(f.log) >= 3);
    await registry.start(bootstrap('second', f.cwd, f.agentDirectory));
    expect(registry.info('second')?.state).toBe('ready');
  } finally {
    await registry.close();
    await f.remove();
  }
}, 30_000);

// A second launch must adopt the loading replacement rather than spawn its own.
// Asserting only that a third spawn happened leaves this green with adoption
// disabled, so the spawn count after the second start is the assertion that
// actually distinguishes the two behaviours.
test('the second new chat adopts the replacement instead of spawning a third worker', async () => {
  const f = await fixture();
  const registry = registryFor(f.entrypoint, TWO_SPARES);
  try {
    registry.warmSessionWorker({ cwd: f.cwd, agentDirectory: f.agentDirectory });
    await waitFor(async () => await spawnCount(f.log) >= 2);
    await registry.start(bootstrap('first', f.cwd, f.agentDirectory));
    await waitFor(async () => await spawnCount(f.log) >= 3);
    // Adoption means the process that served the second session had already been
    // spawned before the second launch began. A spawn count cannot say that: the
    // refill pads the pool back to two either way, so both paths end at the same
    // total. The bootstrapped pid is the direct signal.
    const spawnedBeforeSecond = new Set(await pids(f.log));
    expect(spawnedBeforeSecond.size).toBeGreaterThanOrEqual(3);
    await registry.start(bootstrap('second', f.cwd, f.agentDirectory));
    expect(registry.info('second')?.state).toBe('ready');
    const bootstrapped = await linePids(f.log, 'bootstrap ');
    const servedSecond = bootstrapped.at(-1);
    expect(servedSecond).toBeDefined();
    expect(spawnedBeforeSecond.has(servedSecond!)).toBe(true);
  } finally {
    await registry.close();
    await f.remove();
  }
}, 30_000);

// The pool must never retry fast enough to starve the service's event loop. The
// shape here is the reported one: a worktree lease refuses every spawn, so no
// attempt can ever add a spare and the only thing that can stop the retries is
// the code under test.
//
// Note for whoever breaks this next: with the retry restored the failure shows up
// as a hang to this file's timeout, not as a red assertion. The retry loop keeps
// the macrotask queue starved, so `Bun.sleep` and the interval never run and the
// expectations are never reached. A hang here means the refill spins.
test('a refused refill does not retry from its own settle', async () => {
  const f = await fixture();
  const registry = registryFor(f.entrypoint);
  try {
    await registry.acquireWorktreeLease('lease-under-test', f.cwd);
    const warm = registry.warmSessionWorker.bind(registry);
    let attempts = 0;
    registry.warmSessionWorker = (input, environment) => {
      attempts += 1;
      warm(input, environment);
    };

    registry.warmSessionWorker({ cwd: f.cwd, agentDirectory: f.agentDirectory });

    // Timers are the measurement: a retry loop that restarts from its own settle
    // never yields to the macrotask queue, so this timer would not fire at all.
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; }, 100);
    try { await Bun.sleep(1_000); } finally { clearInterval(timer); }
    expect(ticks).toBeGreaterThanOrEqual(3);
    // One refused attempt, and nothing that retries it within the interval.
    expect(attempts).toBe(1);
    expect(await spawnCount(f.log)).toBe(0);
  } finally {
    await registry.releaseWorktreeLease('lease-under-test').catch(() => undefined);
    await registry.close();
    await f.remove();
  }
}, 30_000);


// The Host registers its project and the managed chats root during startup, so
// two workspaces ask for a pool before either worker finished loading. That cost
// a real regression: an ask evicted every spare belonging to a *different*
// workspace, so the two startup registrations killed each other's spares and the
// workspace the user then typed in paid a cold worker launch on its first prompt
// (~1.5 s against ~0.65 s once both asks are honoured).
//
// The assertion is adoption, which is what the user feels: the session must be
// served by a process that already existed. A spawn count cannot say that — the
// refill pads the pool back either way — and process liveness cannot either,
// because a killed child is still a zombie that answers `kill(pid, 0)` until it
// is reaped.
test('a second workspace does not take the first workspace\'s spares', async () => {
  const f = await fixture({ slowLoad: true });
  const other = join(f.root, 'other-workspace');
  await mkdir(other);
  const registry = registryFor(f.entrypoint, TWO_SPARES);
  try {
    // Both startup registrations happen before either worker finishes loading,
    // which is the state the real service is in.
    registry.warmSessionWorker({ cwd: f.cwd, agentDirectory: f.agentDirectory });
    await waitFor(async () => (await pidsFor(f.log, f.cwd)).length >= 2, 5_000);

    registry.warmSessionWorker({ cwd: other, agentDirectory: f.agentDirectory });
    await Bun.sleep(500);

    // The user then starts a chat in the project. It must be handed a worker that
    // was already spawned, not made to wait out a cold launch.
    const spawnedBeforeStart = new Set(await pids(f.log));
    await registry.start(bootstrap('first', f.cwd, f.agentDirectory));
    expect(registry.info('first')?.state).toBe('ready');
    const served = (await linePids(f.log, 'bootstrap ')).at(-1);
    expect(served).toBeDefined();
    expect(spawnedBeforeStart.has(served!)).toBe(true);
  } finally {
    await registry.close();
    await f.remove();
  }
}, 30_000);

// The reported bug lasted because any removal of an unloaded spare was read as a
// broken spawn target: `drop` then set the refusal that only the 30 s reaper
// sweep clears, so one eviction left every workspace without a spare for a whole
// reap interval. A removal the registry chose on purpose must not record that.
//
// The eviction that does it is the third asker, not the second: the wish list
// holds `sparePoolSize` entries, so A's spares stay wanted while A is still in
// it, and only a third workspace pushes A out and lets the stale sweep retire
// them. Two askers prove nothing here — the earlier version of this test made
// exactly that mistake and stayed green with the `retired` line deleted.
//
// The lease refusal is the same signal arriving for a real reason and must still
// block (pinned by `a refused refill does not retry from its own settle`), so the
// two cases have to stay distinguishable.
test('a deliberate eviction does not refuse refills until the next reaper sweep', async () => {
  const f = await fixture({ slowLoad: true });
  const second = join(f.root, 'second-workspace');
  const third = join(f.root, 'third-workspace');
  await Promise.all([mkdir(second), mkdir(third)]);
  const registry = registryFor(f.entrypoint, TWO_SPARES);
  // SAFETY: Accessing private `spareWorkers` for test-only inspection.
  const pool = () => (registry as unknown as { spareWorkers: { cwd: string; retired?: boolean }[] }).spareWorkers;
  try {
    // The first workspace fills the pool while its spares are still loading, so
    // the eviction below happens to unloaded spares — the state that used to set
    // the refusal.
    registry.warmSessionWorker({ cwd: f.cwd, agentDirectory: f.agentDirectory });
    await waitFor(async () => (await pidsFor(f.log, f.cwd)).length >= 2, 5_000);
    const firstWorkspaceSpares = pool().filter((spare: { cwd: string }) => spare.cwd === f.cwd);
    expect(firstWorkspaceSpares.length).toBe(2);
    expect(firstWorkspaceSpares.every((spare: { retired?: boolean }) => spare.retired !== true)).toBe(true);

    // Two more askers push the first workspace out of the two-entry wish list.
    registry.warmSessionWorker({ cwd: second, agentDirectory: f.agentDirectory });
    registry.warmSessionWorker({ cwd: third, agentDirectory: f.agentDirectory });

    // The eviction is real: both of the first workspace's spares are gone from
    // the pool. Asserting this is what stops the test from passing on a setup
    // that never removed anything.
    const surviving = pool().filter((spare: { cwd: string }) => spare.cwd === f.cwd);
    expect(surviving.length).toBe(0);

    // `retired` is what the `close` handler reads, so it has to be set on the
    // entries *before* their exit is reported: that is the whole guard.
    for (const spare of firstWorkspaceSpares) {
      expect((spare as { retired?: boolean }).retired).toBe(true);
    }

    // The refusal is set from the exit handler, so the assertion has to wait for
    // the children to actually exit. Without this the test reads the flag before
    // the handler can set it and stays green with the guard deleted.
    await waitFor(() => firstWorkspaceSpares.every(
      (spare: { child: { exitCode: number | null; signalCode: string | null } }) => spare.child.exitCode !== null || spare.child.signalCode !== null,
    ), 5_000);
    // The exit handler runs on the same turn as the exit; give it one.
    await Bun.sleep(50);

    // And it was a chosen removal, so the refusal that freezes the pool for a
    // whole reap interval is not set.
    // SAFETY: Accessing private `spareRefillBlocked` for test-only inspection.
    expect((registry as unknown as { spareRefillBlocked: boolean }).spareRefillBlocked).toBe(false);
  } finally {
    await registry.close();
    await f.remove();
  }
}, 30_000);

// The production default holds one spare, not two: the second slot only ever
// served two new chats inside one spawn window, and it cost a whole worker
// process of idle memory permanently.
test('the default pool holds a single spare', async () => {
  const f = await fixture();
  const registry = registryFor(f.entrypoint);
  // SAFETY: Accessing private `spareWorkers` for test-only inspection.
  const pool = () => (registry as unknown as { spareWorkers: unknown[] }).spareWorkers;
  try {
    registry.warmSessionWorker({ cwd: f.cwd, agentDirectory: f.agentDirectory });
    await waitFor(async () => await spawnCount(f.log) >= 1);
    // Even after the first spare finished loading and the refill chain settled,
    // the pool never grows past one.
    await Bun.sleep(500);
    expect(pool().length).toBe(1);
    expect(await spawnCount(f.log)).toBe(1);
  } finally {
    await registry.close();
    await f.remove();
  }
}, 30_000);

// A spare nobody uses must die with its lifetime instead of being replaced
// forever: the reaper refills the pool only for a workspace with a launch or
// an ask inside the spare lifetime, so an idle service returns to zero spares.
test('an idle workspace loses its spare and the sweep does not replace it', async () => {
  const f = await fixture();
  const registry = registryFor(f.entrypoint,
    { spareLifetimeMs: 300 },
    { maxActiveRootWorkers: 5, idleEvictionTimeoutMs: 600_000, reapIntervalMs: 100 });
  // SAFETY: Accessing private `spareWorkers` for test-only inspection.
  const pool = () => (registry as unknown as { spareWorkers: unknown[] }).spareWorkers;
  try {
    registry.warmSessionWorker({ cwd: f.cwd, agentDirectory: f.agentDirectory });
    await waitFor(async () => await spawnCount(f.log) >= 1);
    expect(pool().length).toBe(1);
    // Past the lifetime with no launch, several sweeps pass: the spare dies
    // and stays dead. The spawn count must not grow either — a refill that
    // only replaced the corpse would leave memory constant while looking idle.
    const spawnsAtExpiry = await spawnCount(f.log);
    await waitFor(async () => pool().length === 0, 5_000);
    await Bun.sleep(500);
    expect(pool().length).toBe(0);
    expect(await spawnCount(f.log)).toBe(spawnsAtExpiry);
  } finally {
    await registry.close();
    await f.remove();
  }
}, 30_000);

// The same sweep must refill the pool when the workspace did have activity
// inside the lifetime: a launch re-asks for the pool, so while the user keeps
// opening chats the spare is there, and taking it away would cost the next new
// chat its warm start.
test('a launch inside the spare lifetime keeps the pool refilled', async () => {
  const f = await fixture();
  const registry = registryFor(f.entrypoint,
    { spareLifetimeMs: 1_000 },
    { maxActiveRootWorkers: 5, idleEvictionTimeoutMs: 600_000, reapIntervalMs: 100 });
  // SAFETY: Accessing private `spareWorkers` for test-only inspection.
  const pool = () => (registry as unknown as { spareWorkers: unknown[] }).spareWorkers;
  try {
    registry.warmSessionWorker({ cwd: f.cwd, agentDirectory: f.agentDirectory });
    await waitFor(async () => await spawnCount(f.log) >= 1);
    // Consume the spare in a real launch. The launch is the activity the refill
    // gate reads, and the refill after adoption must produce a replacement.
    await registry.start(bootstrap('first', f.cwd, f.agentDirectory));
    expect(registry.info('first')?.state).toBe('ready');
    await waitFor(async () => pool().length >= 1, 5_000);
    // The replacement is within its own lifetime now. While the launch is still
    // inside the gate window the pool must stay filled even across sweeps.
    await Bun.sleep(400);
    expect(pool().length).toBeGreaterThanOrEqual(1);
  } finally {
    await registry.close();
    await f.remove();
  }
}, 30_000);
