import { execFile, type ExecFileOptions, type ExecFileOptionsWithStringEncoding } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

const defaultExecFileAsync = promisify(execFile);

export type ProcessSignal = 'SIGTERM' | 'SIGKILL';

export type ProcessKillFn = (pid: number, signal?: NodeJS.Signals | number) => boolean | void;

export type ExecFileAsyncFn = (
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStringEncoding,
) => Promise<{ stdout: string; stderr: string }>;

export type ProcessTreeExecFileAsync = (
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

export interface ProcessTreeKillOptions {
  platform?: NodeJS.Platform;
  execFileAsync?: ProcessTreeExecFileAsync;
  processKill?: ProcessKillFn;
}

export interface ProcessTreeAliveOptions {
  platform?: NodeJS.Platform;
  processKill?: ProcessKillFn;
}

export interface WaitForProcessTreeExitOptions {
  graceMs?: number;
  pollMs?: number;
  platform?: NodeJS.Platform;
  processKill?: ProcessKillFn;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const REQUEST_ENV = 'OPENCHAMBER_PIDFD_REQUEST';

const IdentitySchema = z.object({
  pid: z.number().int().min(2),
  startTicks: z.string().regex(/^\d+$/),
});
const RequestSchema = z.object({
  identities: z.array(IdentitySchema).min(1),
  signal: z.enum(['SIGTERM', 'SIGKILL']),
});
const ResultItemSchema = z.object({
  pid: z.number().int(),
  delivered: z.boolean(),
  gone: z.boolean().optional(),
  identityMismatch: z.boolean().optional(),
  unavailable: z.boolean().optional(),
});
const ResultSchema = z.array(ResultItemSchema);

export type PidfdIdentity = z.infer<typeof IdentitySchema>;
export type PidfdSignalResult = z.infer<typeof ResultItemSchema>;
export type PidfdTerminator = (identities: PidfdIdentity[], signal: ProcessSignal) => Promise<PidfdSignalResult[]>;

export interface CreatePidfdTerminatorOptions {
  bunPath?: string;
  execFileAsync?: ExecFileAsyncFn;
}

export const processTreeKillArgs = (pid: number, signal: ProcessSignal = 'SIGKILL'): string[] => {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) throw new Error('Unsafe process id');
  if (signal !== 'SIGTERM' && signal !== 'SIGKILL') throw new Error('Unsupported process signal');
  return signal === 'SIGKILL' ? ['/T', '/F', '/PID', String(pid)] : ['/T', '/PID', String(pid)];
};

export const terminateProcessTree = async (
  pid: number,
  signal: ProcessSignal = 'SIGKILL',
  { platform = process.platform, execFileAsync = defaultExecFileAsync, processKill = process.kill }: ProcessTreeKillOptions = {},
): Promise<boolean> => {
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
  pid: number,
  { platform = process.platform, processKill = process.kill }: ProcessTreeAliveOptions = {},
): boolean => {
  if (platform !== 'darwin' && platform !== 'linux') return false;
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return false;
  try { processKill(-pid, 0); return true; } catch { return false; }
};

export const waitForProcessTreeExit = async (
  pid: number,
  {
    graceMs = 250,
    pollMs = 10,
    platform = process.platform,
    processKill = process.kill,
    now = Date.now,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: WaitForProcessTreeExitOptions = {},
): Promise<boolean> => {
  if (platform !== 'darwin') return true;
  const deadline = now() + graceMs;
  while (processTreeAlive(pid, { platform, processKill }) && now() < deadline) await sleep(pollMs);
  return !processTreeAlive(pid, { platform, processKill });
};

const PIDFD_HELPER_SOURCE = `
import { dlopen, read as readNative } from 'bun:ffi';
import { readFileSync } from 'node:fs';

const request = JSON.parse(process.env.${REQUEST_ENV} ?? '{}');
const signalNumbers = { SIGTERM: 15, SIGKILL: 9 };
const signalNumber = signalNumbers[request.signal];
if (!signalNumber || !Array.isArray(request.identities)) process.exit(2);

const processSymbols = {
  close: { args: ['i32'], returns: 'i32' },
  __errno_location: { args: [], returns: 'ptr' },
};
let symbols;
let pidfdOpen;
let pidfdSendSignal;
try {
  symbols = dlopen('libc.so.6', {
    pidfd_open: { args: ['i32', 'u32'], returns: 'i32' },
    pidfd_send_signal: { args: ['i32', 'i32', 'ptr', 'u32'], returns: 'i32' },
    ...processSymbols,
  }).symbols;
  pidfdOpen = symbols.pidfd_open;
  pidfdSendSignal = (fd, signal) => symbols.pidfd_send_signal(fd, signal, null, 0);
} catch {
  if (process.arch !== 'x64' && process.arch !== 'arm64') process.exit(2);
  try {
    symbols = dlopen('libc.so.6', {
      syscall: { args: ['i64', 'i64', 'i64', 'ptr', 'i64'], returns: 'i64_fast' },
      ...processSymbols,
    }).symbols;
  } catch {
    process.exit(2);
  }
  pidfdOpen = (pid, flags) => symbols.syscall(434n, BigInt(pid), BigInt(flags), null, 0n);
  pidfdSendSignal = (fd, signal) => symbols.syscall(424n, BigInt(fd), BigInt(signal), null, 0n);
}

const results = [];
for (const identity of request.identities) {
  if (!Number.isSafeInteger(identity.pid) || identity.pid < 2 || !/^[0-9]+$/.test(identity.startTicks)) {
    results.push({ pid: identity.pid, delivered: false, identityMismatch: true });
    continue;
  }
  const fd = pidfdOpen(identity.pid, 0);
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
    if (pidfdSendSignal(fd, signalNumber) === 0) {
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

export const createPidfdTerminator = ({
  bunPath = process.env.OHPICHAMBER_BUN || 'bun',
  execFileAsync = defaultExecFileAsync,
}: CreatePidfdTerminatorOptions = {}): PidfdTerminator => async (identities, signal) => {
  const request = RequestSchema.parse({ identities, signal });
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    [REQUEST_ENV]: JSON.stringify(request),
  };
  if (process.env.BUN_BE_BUN === '1') {
    env.BUN_BE_BUN = '1';
  }
  const { stdout } = await execFileAsync(bunPath, ['--no-env-file', '-e', PIDFD_HELPER_SOURCE], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    env,
  });
  return ResultSchema.parse(JSON.parse(stdout));
};
