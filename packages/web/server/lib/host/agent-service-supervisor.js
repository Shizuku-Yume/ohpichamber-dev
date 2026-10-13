import { spawn as nodeSpawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { CapturedHostBootstrapScopeSchema, HostSessionBootstrapSchema, HostWorkspaceBootstrapSchema, HostWorkspaceRegisteredSchema, WorkerBootstrapSchema } from '@openchamber/agent-service/private-protocol';
import { createHostWorkerAuthorizationChannel } from './worker-authorization-channel.js';

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
  authorizeWorkerOperation,
} = {}) => {
  let phase = 'stopped'; let child = null; let port = null; let secret = null;
  let startupPromise = null; let stopPromise = null; let lifecycle = 0; let startupController = null; let accepting = false;
  const scopes = new Map();
  const workspaceScopes = new Map();
  const authorization = createHostWorkerAuthorizationChannel({
    isCurrentChild: launched => child === launched && accepting && phase === 'ready',
    capturedScope: rootSessionId => scopes.get(rootSessionId),
    readLiveScope: async (launched, rootSessionId, signal) => {
      if (child !== launched || !secret || !port) throw new Error('Agent service authorization unavailable');
      const response = await fetchImpl(`http://127.0.0.1:${port}/internal/authorizations/${encodeURIComponent(rootSessionId)}`, { headers: { [SECRET_HEADER]: secret }, signal });
      if (!response.ok) throw new Error('Agent worker authorization scope unavailable');
      return response.json();
    },
    authorizeWorkerOperation,
  });
  let policyStore = approvalPolicyStore;
  let ownsPolicyStore = false;
  const state = () => ({ phase, pid: child?.pid ?? null, port });
  const assertAdmitted = () => { if (!accepting || phase !== 'ready' || !child) throw new Error('Agent service is not accepting requests'); };
  const captureScope = body => {
    const captured = Object.freeze(CapturedHostBootstrapScopeSchema.parse({ rootSessionId: body.rootSessionId, projectId: body.projectId, workspaceId: body.workspaceId, cwd: body.cwd, agentDirectory: body.agentDirectory, ...(body.agentDirectoryId === undefined ? {} : { agentDirectoryId: body.agentDirectoryId }) }));
    const prior = scopes.get(captured.rootSessionId);
    if (prior && !isDeepStrictEqual(prior, captured)) throw new Error('Host bootstrap scope cannot change');
    scopes.set(captured.rootSessionId, captured);
    return { captured, prior };
  };
  const handlePolicyMessage = (launched, message) => {
    const send = (value) => { if (launched.connected) launched.send(value, () => {}); };
    if (!['approval.policy.commit', 'approval.policy.list'].includes(message?.type)) return;
    try {
      const captured = scopes.get(message.request?.sessionId);
      if (child !== launched || !policyStore) throw new Error('Approval policy store unavailable');
      if (!captured || captured.workspaceId !== message.request?.workspaceId) throw new Error('Unauthorized approval policy scope');
      const approvalScope = { sessionId: captured.rootSessionId, rootSessionId: captured.rootSessionId, projectId: captured.projectId, workspaceId: captured.workspaceId };
      const result = message.type === 'approval.policy.commit' ? policyStore.commit({ scope: message.request.scope, decision: message.request.decision, target: message.request.target, ...approvalScope }) : { policies: policyStore.list(approvalScope) };
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
      const onPolicyMessage = message => { handlePolicyMessage(launched, message); authorization.handleMessage(launched, message); };
      launched.on('message', onPolicyMessage);
      launched.once('disconnect', () => authorization.closeChild(launched));
      launched.once('close', () => { launched.removeListener('message', onPolicyMessage); authorization.closeChild(launched); });
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
            scopes.clear(); workspaceScopes.clear(); authorization.closeChild(launched);
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
    authorization.close();
    startupController?.abort();
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      phase = 'stopping';
      if (startupPromise) { try { await startupPromise; } catch { /* cleanup below */ } }
      await killChild();
      secret = null;
      port = null;
      scopes.clear();
      workspaceScopes.clear();
      if (ownsPolicyStore) { policyStore.close(); policyStore = null; ownsPolicyStore = false; }
      phase = 'stopped';
    })().finally(() => { stopPromise = null; });
    return stopPromise;
  };
  const restart = async () => { await stop(); return start(); };
  const request = async (requestPath, init = {}) => {
    assertAdmitted();
    if (!requestPath.startsWith('/')) throw new Error('Agent service request requires an absolute path');
    const requestedChild = child; const requestedLifecycle = lifecycle;
    const method = String(init.method ?? 'GET').toUpperCase();
    let capture; let workspaceCapture;
    const workspace = /^\/internal\/workspaces\/([^/]+)$/.exec(requestPath);
    const restartWorker = /^\/internal\/workers\/([^/]+)\/restart$/.exec(requestPath);
    const rootBootstrap = method === 'POST' && (requestPath === '/internal/sessions' || requestPath === '/internal/workers' || restartWorker);
    if (rootBootstrap || (workspace && method === 'POST')) {
      const schema = workspace ? HostWorkspaceBootstrapSchema : requestPath === '/internal/sessions' ? HostSessionBootstrapSchema : WorkerBootstrapSchema;
      const parsed = schema.safeParse(JSON.parse(init.body));
      if (!parsed.success) throw new Error('Invalid Host bootstrap');
      const body = { ...parsed.data, cwd: await fs.realpath(parsed.data.cwd), agentDirectory: await fs.realpath(parsed.data.agentDirectory) };
      if (restartWorker && decodeURIComponent(restartWorker[1]) !== body.rootSessionId) throw new Error('Invalid Host restart scope');
      if (workspace) {
        const workspaceId = decodeURIComponent(workspace[1]);
        const captured = Object.freeze({ projectId: body.projectId, workspaceId, cwd: body.cwd, agentDirectory: body.agentDirectory, agentDirectoryId: body.agentDirectoryId });
        const prior = workspaceScopes.get(workspaceId);
        if (prior && !isDeepStrictEqual(prior.scope, captured)) throw new Error('Host workspace scope cannot change');
        workspaceCapture = { scope: captured, prior };
      } else capture = captureScope(body);
      init = { ...init, body: JSON.stringify(body) };
    }
    const rollback = () => {
      if (!capture || scopes.get(capture.captured.rootSessionId) !== capture.captured) return;
      if (capture.prior) scopes.set(capture.captured.rootSessionId, capture.prior);
      else scopes.delete(capture.captured.rootSessionId);
    };
    const headers = new Headers(init.headers ?? {}); headers.set(SECRET_HEADER, secret);
    try {
      assertAdmitted();
      if (child !== requestedChild || lifecycle !== requestedLifecycle) throw new Error('Agent service request scope expired');
      const response = await fetchImpl(`http://127.0.0.1:${port}${requestPath}`, { ...init, headers });
      if (!response.ok) rollback();
      if (response.ok && workspaceCapture) {
        const registered = HostWorkspaceRegisteredSchema.safeParse(await response.clone().json());
        if (!registered.success || registered.data.workspaceId !== workspaceCapture.scope.workspaceId
          || registered.data.projectId !== workspaceCapture.scope.projectId || registered.data.agentDirectoryId !== workspaceCapture.scope.agentDirectoryId
          || (workspaceCapture.prior && registered.data.authorizationRootId !== workspaceCapture.prior.rootSessionId)
          || child !== requestedChild || lifecycle !== requestedLifecycle || !accepting) throw new Error('Invalid Host workspace admission');
        const captured = captureScope({ ...workspaceCapture.scope, rootSessionId: registered.data.authorizationRootId });
        workspaceScopes.set(workspaceCapture.scope.workspaceId, { scope: workspaceCapture.scope, rootSessionId: captured.captured.rootSessionId });
      }
      if (response.ok && method === 'DELETE') {
        const deleted = /^\/(?:api\/agent\/v1\/sessions|internal\/workers)\/([^/]+)$/.exec(requestPath);
        if (deleted && child === requestedChild && lifecycle === requestedLifecycle) scopes.delete(decodeURIComponent(deleted[1]));
      }
      return response;
    } catch (error) { rollback(); throw error; }
  };
  return { start, stop, restart, request, getState: state };
};
