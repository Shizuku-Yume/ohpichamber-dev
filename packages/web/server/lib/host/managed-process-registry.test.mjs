import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MANAGED_PROCESS_TOKEN_ENV, createManagedProcessRegistry, terminateManagedProcess } from './managed-process-registry.js';

// The registry takes filesystem, process-table and pidfd helpers as
// dependencies. These tests inject fakes so no real process is ever signalled.
const readdirMock = vi.fn();
const readFileMock = vi.fn();
const rmMock = vi.fn();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();
const renameMock = vi.fn();
const signalIdentitiesMock = vi.fn();
const registryDir = path.resolve('/registry');
const registryFile = (pid) => path.join(registryDir, `${pid}.json`);

let processTable;
let envTokens;
const registry = createManagedProcessRegistry({
  fs: {
    readdir: readdirMock,
    readFile: readFileMock,
    rm: rmMock,
    mkdir: mkdirMock,
    writeFile: writeFileMock,
    rename: renameMock,
  },
  registryDir,
  readProcessTable: async () => processTable,
  signalIdentities: signalIdentitiesMock,
});
const { registerManagedProcess, unregisterManagedProcess, reapOrphanedProcesses } = registry;

const TOKEN = '0123456789abcdef0123456789abcdef';
const OTHER_TOKEN = 'fedcba9876543210fedcba9876543210';
const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform');
const ORIGINAL_KILL = process.kill;
const ORIGINAL_REGISTRY_ENV = process.env.OPENCHAMBER_MANAGED_PROCESS_REGISTRY;
const killMock = vi.fn();

let alive;
const setAlive = (...pids) => {
  alive = new Set(pids);
};

const setPlatform = (platform) => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
};

// /proc/<pid>/stat after the command name: state, ppid, pgrp, session, ...
// starttime (field 22, index 19 once the parenthesized command is removed).
const statLine = (pid, birthIdentity, { processGroupId = pid, sessionId = pid, parentPid = 1 } = {}) => {
  const fields = ['S', String(parentPid), String(processGroupId), String(sessionId), '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', birthIdentity];
  return `${pid} (bun) ${fields.join(' ')}`;
};

const cmdlineFor = (binary, entrypoint) => [binary, '--no-env-file', entrypoint, '--port', '0'].join('\0');
const environFor = (token = TOKEN) => `HOME=/tmp\0${MANAGED_PROCESS_TOKEN_ENV}=${token}\0`;

const tableEntry = (pid, birthIdentity, options = {}) => ({
  pid, birthIdentity, state: 'S', parentPid: 1, processGroupId: pid, sessionId: pid, ...options,
});

const record = (overrides = {}) => ({
  pid: 777,
  ownerPid: 12345,
  kind: 'agent-service',
  binary: '/usr/bin/bun',
  entrypoint: '/srv/index.js',
  birthIdentity: '1234',
  ownershipToken: TOKEN,
  runtime: 'web',
  ...overrides,
});

const serveFiles = (entry, { birthIdentity = '1234', cmdline = null } = {}) => {
  readdirMock.mockResolvedValue(['777.json']);
  readFileMock.mockImplementation(async (file) => {
    if (file === registryFile(777)) return JSON.stringify(entry);
    if (file === '/proc/777/stat') return statLine(777, birthIdentity);
    if (file === '/proc/777/cmdline') return cmdline ?? cmdlineFor('/usr/bin/bun', '/srv/index.js');
    const env = /^\/proc\/(\d+)\/environ$/.exec(file);
    if (env) return environFor(envTokens.get(Number(env[1])) ?? TOKEN);
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
};

beforeEach(() => {
  setPlatform('linux');
  readdirMock.mockReset();
  readFileMock.mockReset();
  rmMock.mockReset();
  mkdirMock.mockReset();
  writeFileMock.mockReset();
  renameMock.mockReset();
  signalIdentitiesMock.mockReset();
  killMock.mockReset();
  setAlive();
  processTable = [];
  envTokens = new Map();
  rmMock.mockResolvedValue();
  mkdirMock.mockResolvedValue();
  writeFileMock.mockResolvedValue();
  renameMock.mockResolvedValue();
  delete process.env.OPENCHAMBER_MANAGED_PROCESS_REGISTRY;
  Object.defineProperty(process, 'kill', { value: killMock, configurable: true });
  killMock.mockImplementation((pid, signal) => {
    if (signal === 0 || signal === undefined) {
      if (alive.has(pid)) return true;
      const error = new Error('ESRCH');
      error.code = 'ESRCH';
      throw error;
    }
    throw new Error(`numeric signal must not be used: ${pid} ${signal}`);
  });
  // A delivered pidfd signal removes that exact identity from the fake table.
  signalIdentitiesMock.mockImplementation(async (identities) => identities.map(({ pid, startTicks }) => {
    const index = processTable.findIndex((entry) => entry.pid === pid && entry.birthIdentity === startTicks);
    if (index < 0) return { pid, delivered: false, gone: true };
    processTable.splice(index, 1);
    return { pid, delivered: true };
  }));
});

afterEach(() => {
  Object.defineProperty(process, 'kill', { value: ORIGINAL_KILL, configurable: true });
  if (ORIGINAL_PLATFORM) Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM);
  if (ORIGINAL_REGISTRY_ENV === undefined) delete process.env.OPENCHAMBER_MANAGED_PROCESS_REGISTRY;
  else process.env.OPENCHAMBER_MANAGED_PROCESS_REGISTRY = ORIGINAL_REGISTRY_ENV;
});

const numericSignalCalls = () => killMock.mock.calls.filter(([, signal]) => signal !== 0 && signal !== undefined);

describe('reapOrphanedProcesses', () => {
  it('returns zero counts when the registry directory is missing', async () => {
    readdirMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    expect(await reapOrphanedProcesses()).toEqual({ inspected: 0, reaped: 0 });
    expect(readFileMock).not.toHaveBeenCalled();
    expect(signalIdentitiesMock).not.toHaveBeenCalled();
  });

  it('drops an entry whose pid is already dead without signalling anything', async () => {
    serveFiles(record());
    setAlive(12345);
    processTable = [];

    expect(await reapOrphanedProcesses()).toEqual({ inspected: 1, reaped: 0 });
    expect(rmMock).toHaveBeenCalledWith(registryFile(777), { force: true });
    expect(signalIdentitiesMock).not.toHaveBeenCalled();
  });

  it('discards a legacy OpenCode record without inspecting or signalling it', async () => {
    readdirMock.mockResolvedValue(['777.json']);
    readFileMock.mockResolvedValue(JSON.stringify({ pid: 777, ownerPid: 12345, port: 4096, binary: '/opencode', runtime: 'web' }));
    setAlive(777);

    expect(await reapOrphanedProcesses()).toEqual({ inspected: 1, reaped: 0 });
    expect(readFileMock).toHaveBeenCalledTimes(1);
    expect(rmMock).toHaveBeenCalledWith(registryFile(777), { force: true });
    expect(signalIdentitiesMock).not.toHaveBeenCalled();
  });

  it('refuses a record without birth identity or ownership token', async () => {
    serveFiles(record({ birthIdentity: undefined }));
    setAlive(777);
    expect(await reapOrphanedProcesses()).toEqual({ inspected: 1, reaped: 0 });
    expect(signalIdentitiesMock).not.toHaveBeenCalled();

    serveFiles(record({ ownershipToken: undefined }));
    expect(await reapOrphanedProcesses()).toEqual({ inspected: 1, reaped: 0 });
    expect(signalIdentitiesMock).not.toHaveBeenCalled();
  });

  it('reaps a verified orphan tree through pidfd identities only', async () => {
    serveFiles(record());
    setAlive(777, 778);
    // A worker in the same session/group and one reparented native descendant
    // that stayed in the service tree. Both inherited the ownership token.
    processTable = [
      tableEntry(777, '1234'),
      tableEntry(778, '1300', { parentPid: 777, processGroupId: 777, sessionId: 777 }),
      tableEntry(779, '1400', { parentPid: 778, processGroupId: 779, sessionId: 779 }),
    ];

    expect(await reapOrphanedProcesses({ log: () => {} })).toEqual({ inspected: 1, reaped: 1 });
    expect(signalIdentitiesMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        { pid: 777, startTicks: '1234' },
        { pid: 778, startTicks: '1300' },
        { pid: 779, startTicks: '1400' },
      ]),
      'SIGTERM',
    );
    expect(processTable).toEqual([]);
    expect(rmMock).toHaveBeenCalledWith(registryFile(777), { force: true });
    expect(numericSignalCalls()).toEqual([]);
    expect(killMock.mock.calls.every(([pid]) => pid > 0)).toBe(true);
  });

  it('never signals a tree member that lacks the ownership token', async () => {
    serveFiles(record());
    setAlive(777, 778);
    envTokens.set(778, OTHER_TOKEN);
    processTable = [
      tableEntry(777, '1234'),
      tableEntry(778, '1300', { parentPid: 777, processGroupId: 777, sessionId: 777 }),
    ];

    expect(await reapOrphanedProcesses()).toEqual({ inspected: 1, reaped: 1 });
    const signalled = signalIdentitiesMock.mock.calls.flatMap(([identities]) => identities.map((identity) => identity.pid));
    expect(signalled).toContain(777);
    expect(signalled).not.toContain(778);
    expect(processTable.map((entry) => entry.pid)).toEqual([778]);
    expect(numericSignalCalls()).toEqual([]);
  });

  it('refuses a recycled leader pid with a different birth identity', async () => {
    serveFiles(record(), { birthIdentity: '9999' });
    setAlive(777);

    expect(await reapOrphanedProcesses()).toEqual({ inspected: 1, reaped: 0 });
    expect(signalIdentitiesMock).not.toHaveBeenCalled();
    expect(rmMock).toHaveBeenCalledWith(registryFile(777), { force: true });
  });

  it('refuses a leader whose environment no longer carries the token', async () => {
    serveFiles(record());
    envTokens.set(777, OTHER_TOKEN);
    setAlive(777);

    expect(await reapOrphanedProcesses()).toEqual({ inspected: 1, reaped: 0 });
    expect(signalIdentitiesMock).not.toHaveBeenCalled();
    expect(rmMock).toHaveBeenCalledWith(registryFile(777), { force: true });
  });

  it('refuses a leader pid whose command is not the recorded Agent Service', async () => {
    serveFiles(record(), { cmdline: '/usr/bin/other\0--serve\0' });
    setAlive(777);

    expect(await reapOrphanedProcesses()).toEqual({ inspected: 1, reaped: 0 });
    expect(signalIdentitiesMock).not.toHaveBeenCalled();
    expect(rmMock).toHaveBeenCalledWith(registryFile(777), { force: true });
  });

  it('leaves the child alone while its recorded owner is alive', async () => {
    serveFiles(record());
    setAlive(777, 12345);

    expect(await reapOrphanedProcesses()).toEqual({ inspected: 1, reaped: 0 });
    expect(signalIdentitiesMock).not.toHaveBeenCalled();
    expect(rmMock).not.toHaveBeenCalled();
  });

  it('refuses to guess identity on a non-Linux platform', async () => {
    setPlatform('darwin');
    serveFiles(record());
    setAlive(777);

    expect(await reapOrphanedProcesses()).toEqual({ inspected: 1, reaped: 0 });
    expect(signalIdentitiesMock).not.toHaveBeenCalled();
    expect(rmMock).not.toHaveBeenCalled();
  });

  it('fails closed and keeps the record when pidfd signalling is unavailable', async () => {
    serveFiles(record());
    setAlive(777);
    processTable = [tableEntry(777, '1234')];
    signalIdentitiesMock.mockRejectedValue(new Error('PIDFD_UNAVAILABLE'));

    expect(await reapOrphanedProcesses({ log: () => {} })).toEqual({ inspected: 1, reaped: 0 });
    expect(numericSignalCalls()).toEqual([]);
    expect(rmMock).not.toHaveBeenCalled();
  });
});

describe('terminateManagedProcess', () => {
  it('escalates a live owned child through pidfd SIGKILL only', async () => {
    serveFiles(record({ ownerPid: process.pid }));
    processTable = [
      tableEntry(777, '1234'),
      tableEntry(778, '1300', { parentPid: 777, processGroupId: 777, sessionId: 777 }),
    ];

    expect(await registry.terminateManagedProcess(777, 'SIGKILL')).toBe(true);
    expect(signalIdentitiesMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        { pid: 777, startTicks: '1234' },
        { pid: 778, startTicks: '1300' },
      ]),
      'SIGKILL',
    );
    expect(numericSignalCalls()).toEqual([]);
  });

  it('refuses a record owned by another process or an invalid signal', async () => {
    serveFiles(record());

    expect(await registry.terminateManagedProcess(777, 'SIGKILL')).toBe(false);
    expect(await registry.terminateManagedProcess(777, 'SIGUSR1')).toBe(false);
    expect(signalIdentitiesMock).not.toHaveBeenCalled();
  });
});

describe('registerManagedProcess', () => {
  it('records the spawned child with birth identity and ownership token', async () => {
    readFileMock.mockImplementation(async (file) => {
      if (file === '/proc/4242/stat') return statLine(4242, '987654');
      if (file === '/proc/4242/environ') return environFor(TOKEN);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    await registerManagedProcess({
      pid: 4242, ownerPid: 12345, kind: 'agent-service', binary: '/usr/bin/bun',
      entrypoint: '/srv/index.js', ownershipToken: TOKEN,
    });

    const temporaryFile = `${registryFile(4242)}.tmp-${process.pid}`;
    expect(mkdirMock).toHaveBeenCalledWith(registryDir, { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(temporaryFile, expect.any(String));
    expect(renameMock).toHaveBeenCalledWith(temporaryFile, registryFile(4242));
    expect(JSON.parse(writeFileMock.mock.calls[0][1])).toMatchObject({
      pid: 4242, ownerPid: 12345, kind: 'agent-service', binary: '/usr/bin/bun',
      entrypoint: '/srv/index.js', birthIdentity: '987654', ownershipToken: TOKEN, runtime: 'web',
    });
  });

  it('does not record a child without token or Agent Service identity', async () => {
    await registerManagedProcess({ pid: 4242, kind: 'agent-service', binary: 'bun', entrypoint: '/srv/index.js' });
    await registerManagedProcess({ pid: 4242, binary: '/opencode', entrypoint: 'serve' });
    await registerManagedProcess({ pid: 4242, kind: 'agent-service', binary: 'bun', entrypoint: '/srv/index.js', ownershipToken: TOKEN });
    await registerManagedProcess({ pid: 'not-a-pid', kind: 'agent-service', binary: 'bun', entrypoint: '/srv/index.js', ownershipToken: TOKEN });

    expect(writeFileMock).not.toHaveBeenCalled();
    // Only the complete registration reaches the birth read.
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it('does not record when the token was not inherited or birth is unavailable', async () => {
    readFileMock.mockImplementation(async (file) => {
      if (file === '/proc/4242/stat') return statLine(4242, '987654');
      if (file === '/proc/4242/environ') return environFor(OTHER_TOKEN);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    await registerManagedProcess({
      pid: 4242, kind: 'agent-service', binary: '/usr/bin/bun', entrypoint: '/srv/index.js', ownershipToken: TOKEN,
    });
    expect(writeFileMock).not.toHaveBeenCalled();

    readFileMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await registerManagedProcess({
      pid: 4242, kind: 'agent-service', binary: '/usr/bin/bun', entrypoint: '/srv/index.js', ownershipToken: TOKEN,
    });
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});

describe('unregisterManagedProcess', () => {
  it('removes the entry file', async () => {
    await unregisterManagedProcess(4242);

    expect(rmMock).toHaveBeenCalledWith(registryFile(4242), { force: true });
  });

  it('is a no-op for a non-integer pid', async () => {
    await unregisterManagedProcess(undefined);

    expect(rmMock).not.toHaveBeenCalled();
  });
});

describe('default registry exports', () => {
  it('rejects an invalid or unrecorded pid through the default export', async () => {
    await expect(terminateManagedProcess(undefined)).resolves.toBe(false);
    await expect(terminateManagedProcess(4242)).resolves.toBe(false);
  });
});
