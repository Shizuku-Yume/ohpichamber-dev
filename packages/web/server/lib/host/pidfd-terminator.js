// Linux pidfd signalling for the Node Host.
//
// The Host runs under Node (Electron main and the Web CLI), which exposes no
// pidfd syscall wrapper. A numeric `kill(pid, signal)` cannot be made race-free:
// the recorded process may exit and its pid may be reused between the birth
// check and the signal. The maintained repository helper
// (`scripts/omp-m0/pidfd-process.mjs`) instead opens a kernel process handle,
// rechecks the birth ticks, and signals through that handle.
//
// Bun is already required by the Agent Service and its packaged staging; this
// module therefore runs that same FFI pattern in a short-lived Bun child. There
// is no new file in the packaged web tree (asar is not readable by an external
// Bun), no new dependency, and no numeric fallback: if Bun, libc, or pidfd is
// unavailable the call throws and the reaper leaves the process alone.
//
// The child receives only paths/numbers/signals. It never receives the Host's
// internal secret or user environment.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

const defaultExecFileAsync = promisify(execFile);

// Non-Linux fallback limits: POSIX signals the detached process group, so a
// descendant that creates its own session/group escapes it. Windows taskkill
// walks ancestry, so it must run while the worker/service leader still exists;
// after that leader exits, orphaned descendants are not reliably discoverable.
// Linux keeps the birth-checked pidfd tree as its authoritative cleanup path.
export const processTreeKillArgs = (pid, signal = 'SIGKILL') => {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) throw new Error('Unsafe process id');
  if (signal !== 'SIGTERM' && signal !== 'SIGKILL') throw new Error('Unsupported process signal');
  return signal === 'SIGKILL' ? ['/T', '/F', '/PID', String(pid)] : ['/T', '/PID', String(pid)];
};

export const terminateProcessTree = async (
  pid,
  signal = 'SIGKILL',
  { platform = process.platform, execFileAsync = defaultExecFileAsync, processKill = process.kill } = {},
) => {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return false;
  if (platform === 'win32') {
    try {
      await execFileAsync('taskkill', processTreeKillArgs(pid, signal), { windowsHide: true });
      return true;
    } catch { return false; }
  }
  if (platform !== 'darwin' && platform !== 'linux') return false;
  try {
    processKill(-pid, signal);
    return true;
  } catch { return false; }
};

export const processTreeAlive = (
  pid,
  { platform = process.platform, processKill = process.kill } = {},
) => {
  if (platform !== 'darwin' && platform !== 'linux') return false;
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return false;
  try { processKill(-pid, 0); return true; } catch { return false; }
};

export const waitForProcessTreeExit = async (
  pid,
  { graceMs = 250, pollMs = 10, platform = process.platform, processKill = process.kill, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) => {
  // Only the POSIX group fallback can observe remaining members; Windows has no
  // portable tree query, so its taskkill call must happen while the leader exists.
  if (platform !== 'darwin') return true;
  const deadline = now() + graceMs;
  while (processTreeAlive(pid, { platform, processKill }) && now() < deadline) await sleep(pollMs);
  return !processTreeAlive(pid, { platform, processKill });
};
const REQUEST_ENV = 'OPENCHAMBER_PIDFD_REQUEST';

const IdentitySchema = z.object({
  pid: z.number().int().min(2),
  startTicks: z.string().regex(/^\d+$/),
});
const RequestSchema = z.object({
  identities: z.array(IdentitySchema).min(1),
  signal: z.enum(['SIGTERM', 'SIGKILL']),
});
const ResultSchema = z.array(z.object({
  pid: z.number().int(),
  delivered: z.boolean(),
  gone: z.boolean().optional(),
  identityMismatch: z.boolean().optional(),
  unavailable: z.boolean().optional(),
}));

// Static helper source. It opens pidfd first, so a pid reused before open is
// rejected by the birth-ticks comparison; reuse after open cannot redirect
// pidfd_send_signal. Every path closes the descriptor.
const PIDFD_HELPER_SOURCE = `
import { dlopen, read as readNative } from 'bun:ffi';
import { readFileSync } from 'node:fs';

const request = JSON.parse(process.env.${REQUEST_ENV} ?? '{}');
const signalNumbers = { SIGTERM: 15, SIGKILL: 9 };
const signalNumber = signalNumbers[request.signal];
if (!signalNumber || !Array.isArray(request.identities)) process.exit(2);

let symbols;
try {
  symbols = dlopen('libc.so.6', {
    pidfd_open: { args: ['i32', 'u32'], returns: 'i32' },
    pidfd_send_signal: { args: ['i32', 'i32', 'ptr', 'u32'], returns: 'i32' },
    close: { args: ['i32'], returns: 'i32' },
    __errno_location: { args: [], returns: 'ptr' },
  }).symbols;
} catch {
  process.exit(2);
}

const results = [];
for (const identity of request.identities) {
  if (!Number.isSafeInteger(identity.pid) || identity.pid < 2 || !/^[0-9]+$/.test(identity.startTicks)) {
    results.push({ pid: identity.pid, delivered: false, identityMismatch: true });
    continue;
  }
  const fd = symbols.pidfd_open(identity.pid, 0);
  if (fd < 0) {
    const errno = readNative.i32(symbols.__errno_location(), 0);
    results.push({ pid: identity.pid, delivered: false, gone: errno === 3, unavailable: errno === 38 || errno === 22 });
    continue;
  }
  try {
    let stat;
    try {
      stat = readFileSync('/proc/' + identity.pid + '/stat', 'utf8');
    } catch {
      results.push({ pid: identity.pid, delivered: false, gone: true });
      continue;
    }
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\\s+/);
    if (fields[19] !== identity.startTicks) {
      results.push({ pid: identity.pid, delivered: false, gone: false, identityMismatch: true });
      continue;
    }
    if (symbols.pidfd_send_signal(fd, signalNumber, null, 0) === 0) {
      results.push({ pid: identity.pid, delivered: true, gone: false, unavailable: false });
    } else {
      const errno = readNative.i32(symbols.__errno_location(), 0);
      results.push({ pid: identity.pid, delivered: false, gone: errno === 3, unavailable: errno === 38 });
    }
  } finally {
    symbols.close(fd);
  }
}
console.log(JSON.stringify(results));
`;

/**
 * Create the pidfd signal function used by the managed-process registry.
 * Identities are `{ pid, startTicks }`; results are per identity. A throw means
 * signalling is unavailable and the caller must fail closed.
 */
export const createPidfdTerminator = ({ bunPath = process.env.OHPICHAMBER_BUN || 'bun', execFileAsync = defaultExecFileAsync } = {}) => async (identities, signal) => {
  const request = RequestSchema.parse({ identities, signal });
  const { stdout } = await execFileAsync(bunPath, ['--no-env-file', '-e', PIDFD_HELPER_SOURCE], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      [REQUEST_ENV]: JSON.stringify(request),
    },
  });
  return ResultSchema.parse(JSON.parse(stdout));
};
