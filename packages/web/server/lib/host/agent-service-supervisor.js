import { spawn as nodeSpawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

import { openApprovalPolicyStore } from './approval-policy-store.js';
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
  bunPath = 'bun', entrypoint, dataDir, env = {}, startupTimeoutMs = STARTUP_TIMEOUT_MS,
  stopTimeoutMs = STOP_TIMEOUT_MS, spawn = nodeSpawn, fetchImpl = globalThis.fetch,
  registry = { registerManagedProcess, unregisterManagedProcess }, randomBytes = crypto.randomBytes,
  approvalPolicyStore = null,
} = {}) => {
  let phase = 'stopped'; let child = null; let port = null; let secret = null;
  let startupPromise = null; let stopPromise = null; let lifecycle = 0; let startupController = null; let accepting = false;
  const scopes = new Map();
  let policyStore = approvalPolicyStore;
  let ownsPolicyStore = false;
  const state = () => ({ phase, pid: child?.pid ?? null, port });
  const assertAdmitted = () => { if (!accepting || phase !== 'ready' || !child) throw new Error('Agent service is not accepting requests'); };
  const captureScope = (body) => {
    if (![body?.rootSessionId, body?.projectId, body?.workspaceId].every(value => typeof value === 'string' && value.length > 0)) throw new Error('Invalid Host bootstrap scope');
    const captured = { sessionId: body.rootSessionId, rootSessionId: body.rootSessionId, projectId: body.projectId, workspaceId: body.workspaceId };
    const prior = scopes.get(captured.sessionId);
    if (prior && (prior.projectId !== captured.projectId || prior.workspaceId !== captured.workspaceId)) throw new Error('Host bootstrap scope cannot change');
    scopes.set(captured.sessionId, captured);
    return { captured, prior };
  };
  const handlePolicyMessage = (launched, message) => {
    const send = (value) => { if (launched.connected) launched.send(value, () => {}); };
    if (!['approval.policy.commit', 'approval.policy.list'].includes(message?.type)) return;
    try {
      const captured = scopes.get(message.request?.sessionId);
      if (child !== launched || !policyStore) throw new Error('Approval policy store unavailable');
      if (!captured || captured.workspaceId !== message.request?.workspaceId) throw new Error('Unauthorized approval policy scope');
      const result = message.type === 'approval.policy.commit' ? policyStore.commit({ scope: message.request.scope, decision: message.request.decision, target: message.request.target, ...captured }) : { policies: policyStore.list(captured) };
      send(message.type === 'approval.policy.commit'
        ? { type: 'approval.policy.committed', requestId: message.requestId, policyId: result.policyId, revision: result.revision }
        : { type: 'approval.policy.listed', requestId: message.requestId, policies: result.policies });
    } catch { send({ type: 'approval.policy.failed', requestId: message.requestId, code: 'APPROVAL_POLICY_WRITE_FAILED' }); }
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
      if (!policyStore && dataDir) { policyStore = openApprovalPolicyStore({ dataDir }); ownsPolicyStore = true; }
      const bytes = randomBytes(32);
      secret = Buffer.from(bytes).toString('hex');
      const childEnv = { ...process.env, ...env, [SECRET_ENV]: secret };
      const launched = spawn(bunPath, ['--no-env-file', entrypoint, '--port', '0'], {
        cwd: dataDir,
        env: childEnv,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      child = launched;
      const onPolicyMessage = message => handlePolicyMessage(launched, message);
      launched.on('message', onPolicyMessage);
      launched.once('close', () => launched.removeListener('message', onPolicyMessage));
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
      scopes.clear();
      if (ownsPolicyStore) { policyStore.close(); policyStore = null; ownsPolicyStore = false; }
      phase = 'stopped';
    })().finally(() => { stopPromise = null; });
    return stopPromise;
  };
  const restart = async () => { await stop(); return start(); };
  const request = async (requestPath, init = {}) => {
    assertAdmitted();
    if (!requestPath.startsWith('/')) throw new Error('Agent service request requires an absolute path');
    let capture;
    if (requestPath === '/internal/sessions' && String(init.method ?? 'GET').toUpperCase() === 'POST') capture = captureScope(JSON.parse(init.body));
    const rollback = () => {
      if (!capture || scopes.get(capture.captured.sessionId) !== capture.captured) return;
      if (capture.prior) scopes.set(capture.captured.sessionId, capture.prior);
      else scopes.delete(capture.captured.sessionId);
    };
    const headers = new Headers(init.headers ?? {}); headers.set(SECRET_HEADER, secret);
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}${requestPath}`, { ...init, headers });
      if (!response.ok) rollback();
      if (response.ok && String(init.method).toUpperCase() === 'DELETE') {
        const deleted = /^\/api\/agent\/v1\/sessions\/([^/]+)$/.exec(requestPath);
        if (deleted) scopes.delete(decodeURIComponent(deleted[1]));
      }
      return response;
    } catch (error) { rollback(); throw error; }
  };
  return { start, stop, restart, request, getState: state };
};
