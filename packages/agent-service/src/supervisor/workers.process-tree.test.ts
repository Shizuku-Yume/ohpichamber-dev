import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerRegistry, terminateWorkerProcessTree } from './workers.ts';

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
const child = spawn('sleep', ['300'], { stdio: 'ignore' });
child.once('spawn', () => writeFileSync(${JSON.stringify(pidFile)}, String(child.pid)));
process.on('message', message => {
  if (message?.type === 'bootstrap') process.send({ type: 'ready', workerGeneration: message.workerGeneration });
  if (message?.type === 'stop') process.exit(0);
});`;
  const entrypoint = join(root, 'worker-fixture.mjs');
  await writeFile(entrypoint, source);
  const registry = new WorkerRegistry({ workerEntrypoint: entrypoint, workerRuntime: process.execPath, stopTimeoutMs: 200 });
  let pid: number | undefined;
  const state = async (childPid: number) => {
    try {
      const stat = await readFile(`/proc/${childPid}/stat`, 'utf8');
      return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'gone';
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
  } finally {
    if (pid !== undefined && Number.isSafeInteger(pid) && pid > 1) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* Controlled descendant already exited. */ }
    }
    await registry.close();
    await rm(root, { recursive: true, force: true });
  }
}, 10_000);

test('Windows worker tree termination uses direct hidden taskkill', async () => {
  const calls: unknown[][] = [];
  await terminateWorkerProcessTree(4242, 'SIGKILL', { platform: 'win32', execFileAsync: (async (...args: unknown[]) => { calls.push(args); return { stdout: '', stderr: '' }; }) as never });
  expect(calls).toEqual([['taskkill', ['/T', '/F', '/PID', '4242'], { windowsHide: true }]]);
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
