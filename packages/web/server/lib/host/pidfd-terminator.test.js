import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

import { createPidfdTerminator, processTreeKillArgs, terminateProcessTree, processTreeAlive, waitForProcessTreeExit } from './pidfd-terminator.js';

const linuxOnly = process.platform === 'linux' ? it : it.skip;

const identityOf = async (pid) => {
  const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
  return stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
};

const child = () => spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 3000)'], {
  stdio: 'ignore', windowsHide: true,
});

const waitExit = async (controlled) => {
  if (controlled.exitCode !== null || controlled.signalCode !== null) return;
  await once(controlled, 'exit');
};

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

describe('pidfd terminator', () => {
  linuxOnly('signals the exact identity and refuses a stale birth', async () => {
    const controlled = child();
    try {
      const terminator = createPidfdTerminator({ bunPath: globalThis.process.env.OHPICHAMBER_BUN || 'bun' });
      const startTicks = await identityOf(controlled.pid);

      const stale = await terminator([{ pid: controlled.pid, startTicks: '0' }], 'SIGTERM');
      expect(stale).toEqual([{ pid: controlled.pid, delivered: false, gone: false, identityMismatch: true }]);
      expect(alive(controlled.pid)).toBe(true);

      const delivered = await terminator([{ pid: controlled.pid, startTicks }], 'SIGTERM');
      expect(delivered).toEqual([{ pid: controlled.pid, delivered: true, gone: false, unavailable: false }]);
      await waitExit(controlled);
      expect(controlled.signalCode).toBe('SIGTERM');
    } finally {
      // The controlled child self-expires; cleanup never uses a numeric signal.
      await waitExit(controlled);
    }
  });

  linuxOnly('fails closed when the Bun pidfd helper is unavailable', async () => {
    const controlled = child();
    try {
      const terminator = createPidfdTerminator({ bunPath: '/definitely/missing/bun' });
      const startTicks = await identityOf(controlled.pid);
      await expect(terminator([{ pid: controlled.pid, startTicks }], 'SIGKILL')).rejects.toBeTruthy();
      expect(alive(controlled.pid)).toBe(true);
    } finally {
      await waitExit(controlled);
    }
  });

  linuxOnly('rejects invalid requests before spawning the helper', async () => {
    const terminator = createPidfdTerminator({ bunPath: '/definitely/missing/bun' });
    await expect(terminator([{ pid: 1, startTicks: '1' }], 'SIGKILL')).rejects.toBeTruthy();
    await expect(terminator([{ pid: 2, startTicks: 'not-ticks' }], 'SIGKILL')).rejects.toBeTruthy();
    await expect(terminator([{ pid: 2, startTicks: '1' }], 'SIGUSR1')).rejects.toBeTruthy();
  });
});

describe('portable process-tree fallback', () => {
  it('constructs a hidden Windows taskkill tree command and rejects unsafe pids', async () => {
    const calls = [];
    const execFileAsync = async (...args) => { calls.push(args); return { stdout: '', stderr: '' }; };
    await expect(terminateProcessTree(4242, 'SIGKILL', { platform: 'win32', execFileAsync })).resolves.toBe(true);
    await expect(terminateProcessTree(4242, 'SIGTERM', { platform: 'win32', execFileAsync })).resolves.toBe(true);
    expect(calls).toEqual([
      ['taskkill', ['/T', '/F', '/PID', '4242'], { windowsHide: true }],
      ['taskkill', ['/T', '/PID', '4242'], { windowsHide: true }],
    ]);
    expect(processTreeKillArgs(4242)).toEqual(['/T', '/F', '/PID', '4242']);
    expect(processTreeKillArgs(4242, 'SIGTERM')).toEqual(['/T', '/PID', '4242']);
    expect(terminateProcessTree(1, 'SIGKILL', { platform: 'win32' })).resolves.toBe(false);
    expect(() => processTreeKillArgs(process.pid)).toThrow('Unsafe process id');
    expect(() => processTreeKillArgs(4242, 'SIGUSR1')).toThrow('Unsupported process signal');
  });

  it('uses a detached macOS process group and tolerates an exited child', async () => {
    const signals = [];
    expect(await terminateProcessTree(4242, 'SIGTERM', { platform: 'darwin', processKill: (pid, signal) => signals.push([pid, signal]) })).toBe(true);
    expect(signals).toEqual([[-4242, 'SIGTERM']]);
    expect(await terminateProcessTree(4242, 'SIGTERM', { platform: 'darwin', processKill: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); } })).toBe(false);
    expect(processTreeAlive(4242, { platform: 'darwin', processKill: () => {} })).toBe(true);
    expect(processTreeAlive(4242, { platform: 'darwin', processKill: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); } })).toBe(false);
    expect(processTreeAlive(4242, { platform: 'win32', processKill: () => {} })).toBe(false);
  });

  it('bounds observation of a surviving macOS group and exits when it disappears', async () => {
    let clock = 0;
    let alive = true;
    const processKill = () => { if (!alive) throw Object.assign(new Error('gone'), { code: 'ESRCH' }); };
    const sleep = async (ms) => { clock += ms; if (clock >= 30) alive = false; };
    expect(await waitForProcessTreeExit(4242, { platform: 'darwin', processKill, graceMs: 100, pollMs: 10, now: () => clock, sleep })).toBe(true);
    expect(clock).toBe(30);

    let deadlineClock = 0;
    expect(await waitForProcessTreeExit(4242, {
      platform: 'darwin', processKill: () => {}, graceMs: 50, pollMs: 10,
      now: () => deadlineClock, sleep: async (ms) => { deadlineClock += ms; },
    })).toBe(false);
    expect(deadlineClock).toBe(50);
    expect(await waitForProcessTreeExit(4242, { platform: 'win32' })).toBe(true);
  });
});
