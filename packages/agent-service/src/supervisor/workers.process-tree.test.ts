import { expect, test } from 'bun:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerRegistry, cleanupWorkerDescendants, listWindowsWorkerProcesses, snapshotWorkerDescendants, stopWorkerProcess, terminateWorkerProcessTree, waitForWorkerProcessTree, windowsProcessTreeKillArgs } from './workers.ts';

const identity = (pid: number, parentPid = 4242, creationDate = '134395828713324692') => ({ pid, parentPid, creationDate });

test('descendant snapshot walks every level without including siblings or the leader', async () => {
  const processes = [identity(4242, 10), identity(5001), identity(5002, 5001), identity(5003, 10)];
  expect(await snapshotWorkerDescendants(4242, { listProcesses: async () => processes })).toEqual([processes[1], processes[2]]);
  expect(await snapshotWorkerDescendants(4242, { listProcesses: async () => [identity(4242, 10)] })).toEqual([]);
});

test('descendant snapshot skips orphans whose exited parent PID was reused by the leader', async () => {
  const leader = identity(4242, 10, '134395828713324692');
  const orphan = identity(5001, 4242, '134395828713324000');
  const orphanChild = identity(5002, 5001, '134395828713324800');
  const child = identity(5003, 4242, '134395828713324692');
  expect(await snapshotWorkerDescendants(4242, { listProcesses: async () => [leader, orphan, orphanChild, child] })).toEqual([child]);
});

test('snapshot inspection errors and missing identities are not successful snapshots', async () => {
  await expect(snapshotWorkerDescendants(4242, { listProcesses: async () => { throw new Error('snapshot failed'); } })).rejects.toThrow('snapshot failed');
  await expect(snapshotWorkerDescendants(4242, { listProcesses: async () => [identity(4242, 10), identity(5001, 4242, '')] })).rejects.toThrow('Invalid descendant identity');
  await expect(snapshotWorkerDescendants(4242, { listProcesses: async () => [identity(5001)] })).rejects.toThrow('Invalid leader identity');
  await expect(snapshotWorkerDescendants(4242, { listProcesses: async () => [identity(4242, 10, '')] })).rejects.toThrow('Invalid leader identity');
});

test('snapshot cleanup checks identity before every forced tree kill and verifies removal', async () => {
  let alive = [identity(5001), identity(5002, 5001)];
  const calls: string[] = [];
  expect(await cleanupWorkerDescendants([...alive], {
    listProcesses: async () => { calls.push('inspect'); return [...alive]; },
    terminateTree: async (pid, signal) => { calls.push(`${pid}:${signal}`); alive = alive.filter(p => p.pid !== pid); return true; },
  })).toBe(true);
  expect(calls).toEqual(['inspect', '5001:SIGKILL', 'inspect', '5002:SIGKILL', 'inspect']);
});

test('snapshot cleanup never kills a reused PID or an already exited process', async () => {
  const calls: number[] = [];
  expect(await cleanupWorkerDescendants([identity(5001), identity(5002)], {
    listProcesses: async () => [identity(5001, 4242, '134395828713324693')],
    terminateTree: async pid => { calls.push(pid!); return true; },
  })).toBe(true);
  expect(calls).toEqual([]);
});

test('snapshot cleanup fails closed on survivors, inspection failures and unsafe identities', async () => {
  const snapshot = [identity(5001)];
  expect(await cleanupWorkerDescendants(snapshot, {
    listProcesses: async () => snapshot,
    terminateTree: async () => true,
  })).toBe(false);
  expect(await cleanupWorkerDescendants(snapshot, {
    listProcesses: async () => { throw new Error('snapshot failed'); },
  })).toBe(false);
  expect(await cleanupWorkerDescendants(snapshot, {
    listProcesses: async () => [identity(5001, 4242, '')],
    terminateTree: async () => { throw new Error('Must not kill an unverified identity'); },
  })).toBe(false);
  expect(await cleanupWorkerDescendants([identity(process.pid)], {
    listProcesses: async () => { throw new Error('Must not inspect'); },
  })).toBe(false);
});

test('snapshot cleanup continues after a kill error and an empty snapshot needs no inspection', async () => {
  const snapshot = [identity(5001), identity(5002)];
  const calls: number[] = [];
  expect(await cleanupWorkerDescendants(snapshot, {
    listProcesses: async () => snapshot,
    terminateTree: async pid => { calls.push(pid!); throw new Error('taskkill failed'); },
  })).toBe(false);
  expect(calls).toEqual([5001, 5002]);
  expect(await cleanupWorkerDescendants([], {
    listProcesses: async () => { throw new Error('Must not inspect'); },
  })).toBe(true);
});

const stoppingWorker = () => {
  const calls: string[] = [];
  let resolveExit = () => {};
  const exited = new Promise<void>(resolve => { resolveExit = resolve; });
  const child: Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode' | 'kill'> = {
    pid: 4242, exitCode: null, signalCode: null,
    kill(signal) { calls.push(`kill:${signal}`); return true; },
  };
  const exit = (code: number | null = 0, signal: NodeJS.Signals | null = null) => {
    child.exitCode = code;
    child.signalCode = signal;
    resolveExit();
  };
  const terminateTree = async (_pid: number | undefined, signal: NodeJS.Signals = 'SIGKILL') => { calls.push(`tree:${signal}`); return false; };
  const waitForTree = async () => { calls.push('tree:wait'); return true; };
  return { child, exited, exit, calls, terminateTree, waitForTree };
};

test('tree termination precedes the grace and a delayed clean exit skips the direct fallback', async () => {
  const f = stoppingWorker();
  const waits: number[] = [];
  const stopped = stopWorkerProcess(f.child, f.exited, {
    cooperativeGraceMs: 1_000, terminateTree: f.terminateTree, waitForTree: f.waitForTree,
    waitForExit: (operation, ms) => {
      expect(f.calls).toEqual(['tree:SIGTERM']);
      waits.push(ms);
      return operation;
    },
  });
  expect(f.calls).toEqual(['tree:SIGTERM']);
  await Promise.resolve();
  expect(waits).toEqual([1_000]);
  f.exit();
  expect(await stopped).toBe(true);
  expect(f.calls).toEqual(['tree:SIGTERM']);
  expect(waits).toEqual([1_000, 5_000]);
});

test('expired grace preserves taskkill, fallback, stop timeout and forced escalation', async () => {
  const f = stoppingWorker();
  const waits: number[] = [];
  expect(await stopWorkerProcess(f.child, f.exited, {
    cooperativeGraceMs: 1_000, stopTimeoutMs: 200, terminateTree: f.terminateTree, waitForTree: f.waitForTree,
    waitForExit: async (_operation, ms) => {
      waits.push(ms);
      if (waits.length === 1) expect(f.calls).toEqual(['tree:SIGTERM']);
      if (waits.length === 2) expect(f.calls).toEqual(['tree:SIGTERM', 'kill:SIGTERM']);
      if (waits.length < 3) throw new Error('Worker operation timed out');
      f.exit(null, 'SIGKILL');
    },
  })).toBe(false);
  expect(waits).toEqual([1_000, 200, 500]);
  expect(f.calls).toEqual(['tree:SIGTERM', 'kill:SIGTERM', 'tree:SIGKILL', 'kill:SIGKILL']);
});

for (const code of [0, 1]) {
  test(`an already-exited worker retains exit code ${code}`, async () => {
    const f = stoppingWorker();
    f.exit(code);
    expect(await stopWorkerProcess(f.child, f.exited, {
      cooperativeGraceMs: 1_000, terminateTree: f.terminateTree, waitForTree: f.waitForTree,
      waitForExit: async (operation, ms) => { expect(ms).toBe(5_000); await operation; },
    })).toBe(code === 0);
    expect(f.calls).toEqual(['tree:SIGTERM']);
  });
}

for (const [code, signal] of [[1, null], [null, 'SIGTERM']] as const) {
  test(`an exit during the grace with code ${code} and signal ${signal} is not success`, async () => {
    const f = stoppingWorker();
    expect(await stopWorkerProcess(f.child, f.exited, {
      cooperativeGraceMs: 1_000, terminateTree: f.terminateTree, waitForTree: f.waitForTree,
      waitForExit: async (operation, ms) => {
        if (ms === 1_000) f.exit(code, signal);
        await operation;
      },
    })).toBe(false);
    expect(f.calls).toEqual(['tree:SIGTERM']);
  });
}

test('a successful tree signal skips the grace and preserves the existing group check', async () => {
  const f = stoppingWorker();
  expect(await stopWorkerProcess(f.child, f.exited, {
    cooperativeGraceMs: 1_000, stopTimeoutMs: 200,
    terminateTree: async (_pid, signal) => { f.calls.push(`tree:${signal}`); return true; },
    waitForTree: async (_pid, options) => { f.calls.push(`tree:wait:${options?.graceMs ?? 250}`); return options?.graceMs === 500; },
    waitForExit: async (_operation, ms) => { expect(ms).toBe(200); f.exit(); },
  })).toBe(true);
  expect(f.calls).toEqual(['tree:SIGTERM', 'tree:wait:250', 'tree:SIGKILL', 'tree:wait:500']);
});

test('ordinary stops still terminate immediately without a cooperative grace', async () => {
  const f = stoppingWorker();
  expect(await stopWorkerProcess(f.child, f.exited, {
    terminateTree: f.terminateTree, waitForTree: f.waitForTree,
    waitForExit: async () => { f.exit(null, 'SIGTERM'); },
  })).toBe(false);
  expect(f.calls).toEqual(['tree:SIGTERM', 'kill:SIGTERM']);
});

test('concurrent and repeated registry stops send one cooperative stop', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-cooperative-stop-'));
  const entrypoint = join(root, 'worker.mjs');
  const stops = join(root, 'stops');
  await writeFile(entrypoint, `import { appendFileSync } from 'node:fs';
process.on('message', message => {
  if (message.type === 'bootstrap') process.send({ type: 'ready', workerGeneration: message.workerGeneration });
  if (message.type === 'stop') {
    appendFileSync(${JSON.stringify(stops)}, 'stop\\n');
    setTimeout(() => process.exit(0), 25);
  }
});
process.on('SIGTERM', () => {});`);
  const registry = new WorkerRegistry({ workerEntrypoint: entrypoint, workerRuntime: process.execPath });
  try {
    await registry.start({ rootSessionId: 'root', projectId: 'project', workspaceId: 'workspace', cwd: root, agentDirectory: root });
    expect(await Promise.all([
      registry.stop('root', { cooperativeGraceMs: 1_000 }),
      registry.stop('root', { cooperativeGraceMs: 1_000 }),
    ])).toEqual([true, true]);
    expect(await registry.stop('root', { cooperativeGraceMs: 1_000 })).toBe(true);
    expect(await readFile(stops, 'utf8')).toBe('stop\n');
    expect(registry.info('root')).toBeUndefined();
  } finally {
    await registry.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

// This integration test observes real Linux process state, including zombies:
// an unreaped zombie has exited and is not a running descendant.
(process.platform === 'linux' ? test : test.skip)('worker stop terminates its Linux sleep grandchild', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-process-tree-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const pidFile = join(root, 'pid');
  await Promise.all([mkdir(cwd), mkdir(agentDirectory)]);
  const source = `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const child = spawn('/bin/sh', ['-c', "trap '' TERM; exec sleep 300"], { stdio: 'ignore' });
child.once('spawn', () => writeFileSync(${JSON.stringify(pidFile)}, String(child.pid)));
process.on('message', message => {
  if (message?.type === 'bootstrap') process.send({ type: 'ready', workerGeneration: message.workerGeneration });
  if (message?.type === 'stop') process.exit(0);
});`;
  const entrypoint = join(root, 'worker-fixture.mjs');
  await writeFile(entrypoint, source);
  const registry = new WorkerRegistry({ workerEntrypoint: entrypoint, workerRuntime: process.execPath, stopTimeoutMs: 200 });
  const sibling = spawn('sleep', ['300'], { stdio: 'ignore' });
  let pid: number | undefined;
  const state = async (childPid: number) => {
    try {
      const stat = await readFile(`/proc/${childPid}/stat`, 'utf8');
      return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0];
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code === 'ENOENT') return 'gone';
      throw error;
    }
  };
  try {
    await registry.start({ rootSessionId: 'root', projectId: 'project', workspaceId: 'workspace', cwd, agentDirectory });
    pid = Number(await readFile(pidFile, 'utf8'));
    expect(['gone', 'Z', 'X']).not.toContain(await state(pid));
    await registry.stop('root');
    const status = await state(pid);
    expect(['gone', 'Z', 'X']).toContain(status);
    expect(sibling.pid).toBeDefined();
    expect(['gone', 'Z', 'X']).not.toContain(await state(sibling.pid!));
  } finally {
    if (sibling.pid) { try { process.kill(sibling.pid, 'SIGKILL'); } catch { /* Controlled sibling already exited. */ } }
    if (pid !== undefined && Number.isSafeInteger(pid) && pid > 1) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* Controlled descendant already exited. */ }
    }
    await registry.close();
    await rm(root, { recursive: true, force: true });
  }
}, 10_000);

(process.platform === 'win32' ? test : test.skip)('Windows process snapshot is fast and carries live parent and creation identities', async () => {
  const started = performance.now();
  const processes = await listWindowsWorkerProcesses();
  expect(performance.now() - started).toBeLessThan(1_000);
  const self = processes.find(entry => entry.pid === process.pid);
  expect(self?.parentPid).toBe(process.ppid);
  expect(self?.creationDate).toMatch(/^\d+$/);
  expect(processes.every(entry => entry.pid > 1)).toBe(true);
});

// Windows releases a killed process's working-directory handle shortly after it exits.
const removeAfterWindowsExit = async (root: string) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rm(root, { recursive: true, force: true });
    } catch (error) {
      if (attempt >= 50) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
};

// Detached children leave the worker's kill-on-close job, and a cooperative
// stop lets the worker exit before taskkill /T runs. The windowless child and
// grandchild are then orphans that only the readiness snapshot still names.
(process.platform === 'win32' ? test : test.skip)('readiness stop removes orphaned windowless Windows descendants but not siblings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-windows-tree-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const pids = join(root, 'pids');
  const workerPid = join(root, 'worker-pid');
  await Promise.all([mkdir(cwd), mkdir(agentDirectory)]);
  const grandchild = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(pids)}, String(process.pid)); setInterval(() => {}, 1_000);`;
  const child = `import { spawn } from 'node:child_process'; spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore', windowsHide: true, detached: true }).unref(); setInterval(() => {}, 1_000);`;
  const entrypoint = join(root, 'worker-fixture.mjs');
  await writeFile(entrypoint, `import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
process.on('message', message => {
  if (message?.type === 'bootstrap') {
    writeFileSync(${JSON.stringify(workerPid)}, String(process.pid));
    spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: 'ignore', windowsHide: true, detached: true }).unref();
    const wait = setInterval(() => {
      if (!existsSync(${JSON.stringify(pids)})) return;
      clearInterval(wait);
      process.send({ type: 'ready', workerGeneration: message.workerGeneration });
    }, 10);
  }
  if (message?.type === 'stop') process.exit(0);
});`);
  const registry = new WorkerRegistry({ workerEntrypoint: entrypoint, workerRuntime: process.execPath });
  const sibling = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], { stdio: 'ignore', windowsHide: true });
  const alive = async (pid: number) => (await listWindowsWorkerProcesses()).some(entry => entry.pid === pid);
  let tracked: number[] = [];
  try {
    await registry.start({ rootSessionId: 'root', projectId: 'project', workspaceId: 'workspace', cwd, agentDirectory });
    const descendants = await snapshotWorkerDescendants(Number(await readFile(workerPid, 'utf8')));
    tracked = descendants.map(entry => entry.pid);
    expect(tracked).toContain(Number(await readFile(pids, 'utf8')));
    expect(tracked.length).toBeGreaterThanOrEqual(2);
    const started = performance.now();
    expect(await registry.stop('root', { cooperativeGraceMs: 1_000 })).toBe(true);
    expect(performance.now() - started).toBeLessThan(5_000);
    for (const pid of tracked) expect(await alive(pid)).toBe(false);
    expect(await alive(sibling.pid!)).toBe(true);
  } finally {
    sibling.kill('SIGKILL');
    for (const pid of tracked) await terminateWorkerProcessTree(pid, 'SIGKILL');
    await registry.close();
    await removeAfterWindowsExit(root);
  }
}, 20_000);

test('Windows worker tree termination uses direct hidden taskkill', async () => {
  const calls: unknown[][] = [];
  // SAFETY: the injected recorder accepts every command argument and returns the
  // stdout/stderr fields consumed by this command-only branch; it never executes a process.
  const execFileAsync = (async (...args: unknown[]) => { calls.push(args); return { stdout: '', stderr: '' }; }) as never;
  await terminateWorkerProcessTree(4242, 'SIGKILL', { platform: 'win32', execFileAsync });
  await terminateWorkerProcessTree(4242, 'SIGTERM', { platform: 'win32', execFileAsync });
  expect(calls).toEqual([
    ['taskkill', ['/T', '/F', '/PID', '4242'], { windowsHide: true }],
    ['taskkill', ['/T', '/PID', '4242'], { windowsHide: true }],
  ]);
  expect(windowsProcessTreeKillArgs(4242, 'SIGTERM')).toEqual(['/T', '/PID', '4242']);
  // SAFETY: the invalid runtime signal is the input under test; the helper
  // validates its string value before building arguments.
  expect(() => windowsProcessTreeKillArgs(4242, 'SIGUSR1' as NodeJS.Signals)).toThrow('Unsupported process signal');
});

test('worker group wait is bounded and reports surviving descendants', async () => {
  let clock = 0;
  let alive = true;
  const sleeping = (ms: number) => { clock += ms; if (clock >= 30) alive = false; return Promise.resolve(); };
  const processKill = () => { if (!alive) throw Object.assign(new Error('gone'), { code: 'ESRCH' }); };
  expect(await waitForWorkerProcessTree(4242, {
    platform: 'linux', processKill, graceMs: 100, pollMs: 10, now: () => clock, sleep: sleeping,
  })).toBe(true);
  expect(clock).toBe(30);

  let deadlineClock = 0;
  expect(await waitForWorkerProcessTree(4242, {
    platform: 'darwin', processKill: () => {}, graceMs: 50, pollMs: 10,
    now: () => deadlineClock, sleep: async (ms: number) => { deadlineClock += ms; },
  })).toBe(false);
  expect(deadlineClock).toBe(50);
  expect(await waitForWorkerProcessTree(4242, { platform: 'win32' })).toBe(true);
  for (const pid of [undefined, -1, 0, 1, Number.NaN, process.pid]) {
    expect(await waitForWorkerProcessTree(pid, { platform: 'linux', processKill: () => { throw new Error('must not signal'); } })).toBe(true);
  }
});

test('macOS worker cleanup signals a safe detached process group and tolerates ESRCH', async () => {
  const calls: unknown[][] = [];
  const processKill = (pid: number, signal?: NodeJS.Signals | number) => { calls.push([pid, signal]); };
  expect(await terminateWorkerProcessTree(4242, 'SIGTERM', { platform: 'darwin', processKill })).toBe(true);
  expect(calls).toEqual([[-4242, 'SIGTERM']]);
  for (const pid of [undefined, -1, 0, 1, Number.NaN, process.pid]) expect(await terminateWorkerProcessTree(pid, 'SIGKILL', { platform: 'darwin', processKill })).toBe(false);
  expect(calls).toHaveLength(1);
  expect(await terminateWorkerProcessTree(4242, 'SIGKILL', { platform: 'darwin', processKill: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); } })).toBe(false);
});
