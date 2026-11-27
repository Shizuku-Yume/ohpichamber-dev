import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess, ChildProcessByStdio } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Duplex } from 'node:stream';
import type { Readable, Writable } from 'node:stream';
import { z } from 'zod';

import { SpaceError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const KILL_WAIT_MS = 5_000;
const STREAM_STDERR_BYTES = 4 * 1024;

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

const isValidPid = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 1;

export interface KillTreeTarget {
  pid?: number | string | null | undefined;
  kill?: ((signal?: NodeJS.Signals | number) => boolean) | undefined;
}

export interface KillLiveTreesOptions {
  children?: Iterable<KillTreeTarget> | undefined;
  platform?: NodeJS.Platform | undefined;
  kill?: ((pid: number, signal: NodeJS.Signals | number) => boolean | void) | undefined;
  spawnSyncProcess?: typeof spawnSync | undefined;
  systemRoot?: string | undefined;
}

export interface RunCommandOptions {
  timeoutMs?: number | undefined;
  maxOutputBytes?: number | undefined;
  keepTail?: boolean | undefined;
  stdin?: string | Buffer | undefined;
  killTree?: boolean | undefined;
  keepAtExit?: boolean | undefined;
  killWaitMs?: number | undefined;
  signal?: AbortSignal | undefined;
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export interface RunCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type RunCommandFn = (
  file: string,
  args: readonly string[],
  options?: RunCommandOptions,
) => Promise<RunCommandResult>;

export interface KillProcessTreeOptions {
  platform?: NodeJS.Platform | undefined;
  kill?: ((pid: number, signal: NodeJS.Signals | number) => boolean | void) | undefined;
  spawnProcess?: typeof spawn | undefined;
  systemRoot?: string | undefined;
  waitMs?: number | undefined;
}

const liveTrees = new Set<KillTreeTarget>();
let exitHandlerInstalled = false;

export const liveTreeCount = (): number => liveTrees.size;

export function killLiveTrees({
  children = liveTrees,
  platform = process.platform,
  kill = (pid, signal) => process.kill(pid, signal),
  spawnSyncProcess = spawnSync,
  systemRoot = process.env.SystemRoot,
}: KillLiveTreesOptions = {}): void {
  for (const child of children) {
    const pid = child?.pid;
    if (!isValidPid(pid)) continue;
    try {
      if (platform === 'win32') {
        if (systemRoot) {
          spawnSyncProcess(path.win32.join(systemRoot, 'System32', 'taskkill.exe'), ['/T', '/F', '/PID', String(pid)], {
            shell: false, windowsHide: true, stdio: 'ignore', timeout: KILL_WAIT_MS,
          });
        }
      } else {
        kill(-pid, 'SIGKILL');
      }
    } catch { continue; }
  }
  if (children === liveTrees) liveTrees.clear();
}

const killLiveTreesAtExit = (): void => killLiveTrees();

const trackTree = (child: ChildProcess): void => {
  if (!exitHandlerInstalled) {
    exitHandlerInstalled = true;
    process.prependListener('exit', killLiveTreesAtExit);
  }
  liveTrees.add(child);
};

const abortReason = (signal: AbortSignal, file: string, args: readonly string[]): SpaceError =>
(signal.reason instanceof SpaceError
  ? signal.reason
  : new SpaceError('command_aborted', `${file} ${args[0] ?? ''} was stopped by its caller`));

export function runCommand(file: string, args: readonly string[], options: RunCommandOptions = {}): Promise<RunCommandResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const keepTail = options.keepTail === true;
  const stdin = options.stdin ?? '';
  const killTree = options.killTree === true;
  const keepAtExit = options.keepAtExit === true;
  const killWaitMs = options.killWaitMs ?? KILL_WAIT_MS;
  const abortSignal = options.signal;

  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(abortReason(abortSignal, file, args));
      return;
    }
    let errorFile: { folder: string; fd: number } | null = null;
    const closeErrorFile = (): void => {
      if (errorFile === null) return;
      try { fs.closeSync(errorFile.fd); } catch { errorFile.fd = -1; }
      fs.rmSync(errorFile.folder, { recursive: true, force: true });
      errorFile = null;
    };
    if (keepAtExit) {
      try {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-stderr-'));
        errorFile = { folder, fd: fs.openSync(path.join(folder, 'stderr'), 'w+') };
      } catch (error) {
        const detail = errorDetailSchema.safeParse(error).data;
        const message = detail?.message ?? String(error);
        reject(new SpaceError('command_spawn_failed', `Could not start ${file}: no file for its output: ${message}`, { errno: detail?.code ?? null }));
        return;
      }
    }
    let child: ChildProcess;
    try {
      child = spawn(file, [...args], {
        shell: false,
        windowsHide: true,
        cwd: options.cwd,
        env: options.env,
        detached: killTree && process.platform !== 'win32',
        stdio: errorFile === null ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'ignore', errorFile.fd],
      });
    } catch (error) {
      closeErrorFile();
      const detail = errorDetailSchema.safeParse(error).data;
      const message = detail?.message ?? String(error);
      reject(new SpaceError('command_spawn_failed', `Could not start ${file}: ${message}`, { errno: detail?.code ?? null }));
      return;
    }

    if (killTree && !keepAtExit) trackTree(child);
    if (errorFile !== null) fs.rmSync(errorFile.folder, { recursive: true, force: true });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let capturedBytes = 0;
    const heldBytes = new Map<Buffer[], number>([[stdoutChunks, 0], [stderrChunks, 0]]);
    let settled = false;
    let closed = false;
    const closeWaiters: Array<() => void> = [];
    const waitForClose = (): Promise<void> => new Promise((resolveWait) => {
      if (closed) {
        resolveWait();
        return;
      }
      const bound = setTimeout(resolveWait, killWaitMs);
      closeWaiters.push(() => { clearTimeout(bound); resolveWait(); });
    });

    const fail = (error: SpaceError): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', stop);
      if (!killTree) {
        child.kill('SIGKILL');
        reject(error);
        return;
      }
      void killProcessTree(child, { waitMs: killWaitMs }).then(waitForClose).then(() => reject(error));
    };

    const timer = setTimeout(() => {
      fail(new SpaceError('command_timeout', `${file} ${args[0] ?? ''} did not finish within ${timeoutMs} ms and was stopped`));
    }, timeoutMs);
    const stop = (): void => {
      if (abortSignal) fail(abortReason(abortSignal, file, args));
    };
    abortSignal?.addEventListener('abort', stop, { once: true });

    const window = (chunks: Buffer[]) => (chunk: Buffer): void => {
      chunks.push(chunk);
      let held = (heldBytes.get(chunks) ?? 0) + chunk.length;
      while (chunks[0] !== undefined && held - chunks[0].length >= maxOutputBytes) {
        const shifted = chunks.shift();
        if (shifted !== undefined) held -= shifted.length;
      }
      if (held > maxOutputBytes && chunks[0] !== undefined) {
        chunks[0] = chunks[0].subarray(held - maxOutputBytes);
        held = maxOutputBytes;
      }
      heldBytes.set(chunks, held);
    };
    const capture = (chunks: Buffer[]) => (keepTail ? window(chunks) : (chunk: Buffer): void => {
      capturedBytes += chunk.length;
      if (capturedBytes > maxOutputBytes) {
        fail(new SpaceError('command_output_too_large', `${file} ${args[0] ?? ''} printed more than ${maxOutputBytes} bytes and was stopped`));
        return;
      }
      chunks.push(chunk);
    });

    child.stdout?.on('data', capture(stdoutChunks));
    child.stderr?.on('data', capture(stderrChunks));
    interface ErrorFileRead {
      size: number;
      kept: Buffer;
    }
    const readErrorFile = (fd: number): ErrorFileRead => {
      const size = fs.fstatSync(fd).size;
      const kept = Buffer.alloc(Math.min(size, maxOutputBytes));
      fs.readSync(fd, kept, 0, kept.length, size - kept.length);
      return { size, kept };
    };

    child.on('error', (error) => {
      liveTrees.delete(child);
      closeErrorFile();
      const detail = errorDetailSchema.safeParse(error).data;
      fail(new SpaceError('command_spawn_failed', `Could not start ${file}: ${error.message}`, { errno: detail?.code ?? null }));
    });
    child.on('exit', () => {
      liveTrees.delete(child);
    });

    child.on('close', (code, signal) => {
      closed = true;
      for (const wake of closeWaiters.splice(0)) wake();
      if (settled) {
        closeErrorFile();
        return;
      }
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', stop);
      if (code === null) {
        closeErrorFile();
        reject(new SpaceError('command_killed', `${file} ${args[0] ?? ''} was stopped by signal ${signal}`));
        return;
      }
      if (errorFile !== null) {
        let read: ErrorFileRead;
        try {
          read = readErrorFile(errorFile.fd);
        } catch (error) {
          const message = errorDetailSchema.safeParse(error).data?.message ?? String(error);
          reject(new SpaceError('command_output_unreadable', `The output of ${file} ${args[0] ?? ''} could not be read back: ${message}`, { exitCode: code }));
          return;
        } finally {
          closeErrorFile();
        }
        if (!keepTail && read.size > maxOutputBytes) {
          reject(new SpaceError('command_output_too_large', `${file} ${args[0] ?? ''} printed more than ${maxOutputBytes} bytes`));
          return;
        }
        stderrChunks.push(read.kept);
      }
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });

    child.stdin?.on('error', () => { });
    child.stdin?.end(stdin);
  });
}

export async function killProcessTree(
  child: KillTreeTarget | null | undefined,
  {
    platform = process.platform,
    kill = (pid, signal) => process.kill(pid, signal),
    spawnProcess = spawn,
    systemRoot = process.env.SystemRoot,
    waitMs = KILL_WAIT_MS,
  }: KillProcessTreeOptions = {},
): Promise<boolean> {
  const pid = child?.pid;
  if (!isValidPid(pid)) {
    return false;
  }
  const killChildOnly = (): void => {
    try {
      child?.kill?.('SIGKILL');
    } catch { return; }
  };
  if (platform === 'win32') {
    if (!systemRoot) {
      killChildOnly();
      return true;
    }
    await new Promise<void>((resolveKill) => {
      const bound = setTimeout(resolveKill, waitMs);
      const done = (): void => { clearTimeout(bound); resolveKill(); };
      try {
        const killer = spawnProcess(path.win32.join(systemRoot, 'System32', 'taskkill.exe'), ['/T', '/F', '/PID', String(pid)], {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.once('error', () => { killChildOnly(); done(); });
        killer.once('exit', done);
      } catch {
        killChildOnly();
        done();
      }
    });
    return true;
  }
  try {
    kill(-pid, 'SIGKILL');
  } catch {
    killChildOnly();
  }
  return true;
}

export class CommandStream extends Duplex {
  #child: ChildProcessByStdio<Writable, Readable, Readable>;
  #file: string;
  #args: readonly string[];
  #stderr: Buffer[] = [];
  #stderrBytes = 0;
  #receivedBytes = 0;
  #closed = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  timeout: number;

  constructor(child: ChildProcessByStdio<Writable, Readable, Readable>, file: string, args: readonly string[]) {
    super({ allowHalfOpen: false });
    this.#child = child;
    this.#file = file;
    this.#args = args;
    this.timeout = 0;
    this.on('error', () => { });

    child.stdout.on('data', (chunk: Buffer) => {
      this.#receivedBytes += chunk.length;
      this.#touch();
      if (!this.push(chunk)) child.stdout.pause();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (this.#stderrBytes >= STREAM_STDERR_BYTES) return;
      this.#stderr.push(chunk.subarray(0, STREAM_STDERR_BYTES - this.#stderrBytes));
      this.#stderrBytes += chunk.length;
    });
    child.stdin.on('error', (error) => {
      const detail = errorDetailSchema.safeParse(error).data;
      if (!this.#closed) this.destroy(this.#failure(`its input closed: ${detail?.code ?? error.message}`));
    });
    child.on('error', (error) => {
      this.#closed = true;
      const detail = errorDetailSchema.safeParse(error).data;
      this.destroy(new SpaceError('command_spawn_failed', `Could not start ${file}: ${error.message}`, { errno: detail?.code ?? null }));
    });
    child.on('close', (code, signal) => {
      this.#closed = true;
      if (this.destroyed) return;
      if (code === 0 && this.#receivedBytes > 0) {
        this.push(null);
        return;
      }
      const why = code === null ? `stopped by signal ${signal}` : `exited with code ${code}`;
      this.destroy(this.#failure(`${why}${this.#stderrText() ? `: ${this.#stderrText()}` : ''}`));
    });
  }

  #stderrText(): string {
    return Buffer.concat(this.#stderr).toString('utf8').trim();
  }

  #failure(what: string): SpaceError {
    return new SpaceError('command_stream_failed', `${this.#file} ${this.#args[0] ?? ''} ${what}`);
  }

  #touch(): void {
    if (this.timeout > 0) this.setTimeout(this.timeout);
  }

  override _read(): void {
    this.#child.stdout.resume();
  }

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.#touch();
    if (this.#closed) {
      callback(this.#failure('has ended'));
      return;
    }
    this.#child.stdin.write(chunk, callback);
  }

  override _final(callback: (error?: Error | null) => void): void {
    if (this.#closed) {
      callback();
      return;
    }
    this.#child.stdin.end(callback);
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#child.stdout.removeAllListeners('data');
    try {
      this.#child.kill('SIGKILL');
    } catch { callback(error); return; }
    callback(error);
  }

  setTimeout(milliseconds: number, callback?: () => void): this {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.timeout = milliseconds;
    if (callback) {
      if (milliseconds > 0) this.once('timeout', callback);
      else this.removeListener('timeout', callback);
    }
    if (milliseconds > 0) {
      this.#timer = setTimeout(() => { this.#timer = null; this.emit('timeout'); }, milliseconds);
      this.#timer.unref?.();
    }
    return this;
  }

  setNoDelay(): this { return this; }

  setKeepAlive(): this { return this; }

  ref(): this { return this; }

  unref(): this { return this; }
}

export function openCommandStream(file: string, args: readonly string[]): CommandStream {
  let child: ChildProcessByStdio<Writable, Readable, Readable>;
  try {
    child = spawn(file, [...args], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    const detail = errorDetailSchema.safeParse(error).data;
    const message = detail?.message ?? String(error);
    throw new SpaceError('command_spawn_failed', `Could not start ${file}: ${message}`, { errno: detail?.code ?? null });
  }
  return new CommandStream(child, file, args);
}
