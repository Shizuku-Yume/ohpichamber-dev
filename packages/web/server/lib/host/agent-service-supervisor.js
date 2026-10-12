import { spawn as nodeSpawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

import { AgentServiceReadySchema } from '@openchamber/agent-contract';

import { registerManagedProcess, unregisterManagedProcess } from './managed-process-registry.js';

const STARTUP_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 5_000;
const ANNOUNCEMENT_TYPE = 'agent-service.listening';
const SECRET_ENV = 'OHPICHAMBER_INTERNAL_SECRET';
const SECRET_HEADER = 'X-Internal-Secret';

const timeoutSignal = (ms) => AbortSignal.timeout(ms);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitWithin = async (operation, milliseconds, message, signal) => {
  let timer;
  let onAbort;
  try {
    return await Promise.race([
      operation,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
        if (signal) {
          onAbort = () => reject(new Error('Agent service startup cancelled'));
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        }
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
};

const normalizeAnnouncement = (line) => {
  try {
    const value = JSON.parse(line);
    if (value?.type !== ANNOUNCEMENT_TYPE || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535) return null;
    return value.port;
  } catch {
    return null;
  }
};

export const createAgentServiceSupervisor = ({
  bunPath = 'bun',
  entrypoint,
  dataDir,
  env = {},
  startupTimeoutMs = STARTUP_TIMEOUT_MS,
  stopTimeoutMs = STOP_TIMEOUT_MS,
  spawn = nodeSpawn,
  fetchImpl = globalThis.fetch,
  registry = { registerManagedProcess, unregisterManagedProcess },
  randomBytes = crypto.randomBytes,
} = {}) => {
  let phase = 'stopped';
  let child = null;
  let port = null;
  let secret = null;
  let startupPromise = null;
  let stopPromise = null;
  let lifecycle = 0;
  let startupController = null;
  let accepting = false;

  const state = () => ({ phase, pid: child?.pid ?? null, port });
  const assertAdmitted = () => {
    if (!accepting || phase !== 'ready' || !child) throw new Error('Agent service is not accepting requests');
  };
  const killChild = async () => {
    if (!child) return;
    const current = child;
    const exited = new Promise((resolve) => {
      if (current.exitCode !== null || current.signalCode !== null) resolve();
      else current.once('close', resolve);
    });
    if (current.exitCode === null && current.signalCode === null) current.kill('SIGTERM');
    try {
      await waitWithin(exited, stopTimeoutMs, 'Agent service stop timed out');
    } catch {
      if (current.exitCode === null && current.signalCode === null) {
        if (process.platform === 'win32') current.kill('SIGKILL');
        else process.kill(-current.pid, 'SIGKILL');
      }
      await waitWithin(exited, 500, 'Agent service did not exit after termination');
    }
    if (Number.isInteger(current.pid)) await registry.unregisterManagedProcess(current.pid);
    if (child === current) child = null;
  };

  const start = async () => {
    if (stopPromise) { await stopPromise; return start(); }
    if (phase === 'ready') return state();
    if (startupPromise) return startupPromise;
    const myLifecycle = lifecycle;
    const deadline = Date.now() + startupTimeoutMs;
    startupController = new AbortController();
    startupPromise = (async () => {
      if (child) await killChild();
      if (lifecycle !== myLifecycle) throw new Error('Agent service startup cancelled');
      phase = 'starting';
      accepting = false;
      const bytes = randomBytes(32);
      secret = Buffer.from(bytes).toString('hex');
      const childEnv = { ...process.env, ...env, [SECRET_ENV]: secret };
      const launched = spawn(bunPath, ['--no-env-file', entrypoint, '--port', '0'], {
        cwd: dataDir,
        env: childEnv,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child = launched;
      launched.stderr?.on('data', () => {});
      let announcement = '';
      const announced = new Promise((resolve, reject) => {
        let done = false;
        const finish = (fn, value) => { if (done) return; done = true; fn(value); };
        const onData = (chunk) => {
          announcement += chunk.toString();
          const lines = announcement.split(/\r?\n/);
          announcement = lines.pop() ?? '';
          for (const line of lines) {
            const discovered = normalizeAnnouncement(line);
            if (discovered) finish(resolve, discovered);
          }
        };
        const onExit = (code, signal) => {
          finish(reject, new Error(`Agent service exited before listening (${code ?? signal ?? 'unknown'})`));
          if (child === launched && phase !== 'stopping') {
            phase = 'failed';
            accepting = false;
          }
        };
        launched.stdout?.on('data', onData);
        launched.once('error', (error) => finish(reject, error));
        launched.once('exit', onExit);
      });
      const remaining = () => Math.max(1, deadline - Date.now());
      port = await waitWithin(announced, remaining(), 'Agent service startup timed out', startupController.signal);
      if (!Number.isInteger(launched.pid)) throw new Error('Agent service did not provide a pid');
      await registry.registerManagedProcess({ pid: launched.pid, ownerPid: process.pid, port, binary: bunPath, entrypoint: path.resolve(entrypoint), kind: 'agent-service', runtime: 'web' });
      while (Date.now() < deadline && lifecycle === myLifecycle) {
        try {
          const response = await fetchImpl(`http://127.0.0.1:${port}/api/agent/v1/ready`, { method: 'GET', headers: { [SECRET_HEADER]: secret, Accept: 'application/json' }, signal: AbortSignal.any([startupController.signal, timeoutSignal(Math.min(1500, remaining()))]) });
          if (response.status === 200) {
            const body = await response.json();
            if (AgentServiceReadySchema.parse(body) && lifecycle === myLifecycle) { phase = 'ready'; accepting = true; return state(); }
          }
        } catch { /* service is still initializing */ }
        await sleep(Math.min(100, remaining()));
      }
      throw new Error(lifecycle === myLifecycle ? 'Agent service readiness timed out' : 'Agent service startup cancelled');
    })().catch(async (error) => {
      phase = 'failed';
      accepting = false;
      await killChild();
      port = null;
      throw error;
    }).finally(() => { startupPromise = null; startupController = null; });
    return startupPromise;
  };

  const stop = async () => {
    lifecycle += 1;
    accepting = false;
    startupController?.abort();
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      phase = 'stopping';
      if (startupPromise) { try { await startupPromise; } catch { /* cleanup below */ } }
      await killChild();
      secret = null;
      port = null;
      phase = 'stopped';
    })().finally(() => { stopPromise = null; });
    return stopPromise;
  };
  const restart = async () => { await stop(); return start(); };
  const request = async (requestPath, init = {}) => {
    assertAdmitted();
    if (!requestPath.startsWith('/')) throw new Error('Agent service request requires an absolute path');
    const headers = new Headers(init.headers ?? {});
    headers.set(SECRET_HEADER, secret);
    return fetchImpl(`http://127.0.0.1:${port}${requestPath}`, { ...init, headers });
  };
  return { start, stop, restart, request, getState: state };
};
