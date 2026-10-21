import { spawn as nodeSpawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { CapturedHostBootstrapScopeSchema, HostApprovalPolicyListRequestSchema, HostSessionBootstrapSchema, HostSessionForkAckSchema, HostSessionRelocationFinalizeSchema, HostSessionRelocationPrepareSchema, HostSkillSourceOperationSchema, HostSkillSourceRequestSchema, HostSkillSourceResultSchema, HostWorkspaceBootstrapSchema, HostWorkspaceRegisteredSchema, WorkerBootstrapSchema } from '@openchamber/agent-service/private-protocol';
import { createHostWorkerAuthorizationChannel } from './worker-authorization-channel.js';

import { openApprovalPolicyStore } from './approval-policy-store.js';
import { AgentServiceReadySchema } from '@openchamber/agent-contract';

import { MANAGED_PROCESS_TOKEN_ENV, createManagedProcessRegistry, reapOrphanedProcesses, registerManagedProcess, unregisterManagedProcess } from './managed-process-registry.js';

const defaultRegistry = { registerManagedProcess, unregisterManagedProcess, reapOrphanedProcesses };

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
  registry = null, randomBytes = crypto.randomBytes,
  approvalPolicyStore = null,
  authorizeWorkerOperation, invokeHostAction, handleSkillSource,
} = {}) => {
  // One registry per Host data directory keeps test/instance records out of the
  // user's global config; OPENCHAMBER_MANAGED_PROCESS_REGISTRY still overrides.
  const processRegistry = registry ?? (dataDir
    ? createManagedProcessRegistry({ registryDir: path.join(dataDir, 'managed-processes'), bunPath })
    : defaultRegistry);
  let phase = 'stopped'; let child = null; let port = null; let secret = null;
  let startupPromise = null; let stopPromise = null; let lifecycle = 0; let startupController = null; let accepting = false;
  const scopes = new Map();
  const forkTickets = new Map();
  const relocationScopes = new Map();
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
    authorizeWorkerOperation, invokeHostAction,
  });
  let policyStore = approvalPolicyStore;
  let ownsPolicyStore = false;
  const state = () => ({ phase, pid: child?.pid ?? null, port });
  const assertAdmitted = () => { if (!accepting || phase !== 'ready' || !child) throw new Error('Agent service is not accepting requests'); };
  const captureScope = (body, allowRebind = false) => {
    const captured = Object.freeze(CapturedHostBootstrapScopeSchema.parse({ rootSessionId: body.rootSessionId, projectId: body.projectId, workspaceId: body.workspaceId, cwd: body.cwd, agentDirectory: body.agentDirectory, ...(body.agentDirectoryId === undefined ? {} : { agentDirectoryId: body.agentDirectoryId }) }));
    const prior = scopes.get(captured.rootSessionId);
    if (prior && !allowRebind && !isDeepStrictEqual(prior, captured)) throw new Error('Host bootstrap scope cannot change');
    if (prior && !allowRebind) return { captured: prior, prior };
    scopes.set(captured.rootSessionId, captured);
    return { captured, prior };
  };
  const handlePolicyMessage = (launched, message) => {
    const send = (value) => { if (launched.connected) launched.send(value, () => {}); };
    if (!['approval.policy.commit', 'approval.policy.list'].includes(message?.type)) return;
    try {
      if (child !== launched || !policyStore) throw new Error('Approval policy store unavailable');
      let captured = scopes.get(message.request?.sessionId);
      // A fork child is created inside the service, so the Host learns its identity only
      // while the fork request is in flight. Its scope is the already-captured source
      // scope with the child's own session identity: never a new workspace, and never a
      // rebind of an existing session.
      if (!captured && message.type === 'approval.policy.list') {
        const request = HostApprovalPolicyListRequestSchema.safeParse(message.request);
        const ticket = request.success && request.data.forkOf !== undefined && request.data.forkTicketId !== undefined
          ? forkTickets.get(request.data.forkOf)?.find(candidate => candidate.id === request.data.forkTicketId && candidate.childId === null && candidate.captured.workspaceId === request.data.workspaceId)
          : undefined;
        if (ticket && request.data.sessionId !== ticket.sourceSessionId && !scopes.has(request.data.sessionId)) {
          const childScope = Object.freeze({ ...ticket.captured, rootSessionId: request.data.sessionId });
          scopes.set(request.data.sessionId, childScope);
          ticket.childId = request.data.sessionId;
          ticket.childScope = childScope;
          captured = childScope;
        }
      }
      if (!captured || captured.workspaceId !== message.request?.workspaceId) throw new Error('Unauthorized approval policy scope');
      const approvalScope = { sessionId: captured.rootSessionId, rootSessionId: captured.rootSessionId, projectId: captured.projectId, workspaceId: captured.workspaceId };
      const result = message.type === 'approval.policy.commit' ? policyStore.commit({ scope: message.request.scope, decision: message.request.decision, target: message.request.target, ...approvalScope }) : { policies: policyStore.list(approvalScope) };
      send(message.type === 'approval.policy.commit'
        ? { type: 'approval.policy.committed', requestId: message.requestId, policyId: result.policyId, revision: result.revision }
        : { type: 'approval.policy.listed', requestId: message.requestId, policies: result.policies });
    } catch { send({ type: 'approval.policy.failed', requestId: message.requestId, code: 'APPROVAL_POLICY_WRITE_FAILED' }); }
  };
  const handleSkillSourceMessage = async (launched, message) => {
    if (message?.type !== 'host.skill-source.request') return;
    const requestId = HostSkillSourceRequestSchema.shape.requestId.safeParse(message.requestId);
    if (!requestId.success) return;
    let result = { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
    try {
      const request = HostSkillSourceRequestSchema.parse(message);
      const operation = HostSkillSourceOperationSchema.parse(request.operation);
      const captured = workspaceScopes.get(operation.workspaceId)?.scope;
      if (child !== launched || !accepting || phase !== 'ready' || !launched.connected
        || typeof handleSkillSource !== 'function' || !captured
        || captured.projectId !== operation.projectId || captured.workspaceId !== operation.workspaceId
        || captured.agentDirectoryId !== operation.agentDirectoryId) throw new Error('Skill source scope unavailable');
      // Only Host-captured paths reach the disk owner; the private operation carries IDs alone.
      const handled = HostSkillSourceResultSchema.parse(await handleSkillSource(operation, captured));
      if (child === launched && accepting && phase === 'ready'
        && workspaceScopes.get(operation.workspaceId)?.scope === captured) result = handled;
    } catch { /* Never send filesystem paths, thrown messages, or internal service details. */ }
    try {
      if (launched.connected) launched.send({ type: 'host.skill-source.result', requestId: requestId.data, result }, () => {});
    } catch { /* The service may disconnect while the Host source operation completes. */ }
  };
  // Registry failures are diagnostics, never lifecycle failures: a missing
  // record must not turn a healthy spawn or a completed stop into an error.
  const reapPreviousManagedChildren = async () => {
    try {
      await processRegistry.reapOrphanedProcesses();
    } catch {
      // Best-effort cleanup: the service still starts with a clean in-memory child.
    }
  };
  const registerManagedChild = async (launched, ownershipToken) => {
    if (!Number.isInteger(launched?.pid)) return;
    try {
      await processRegistry.registerManagedProcess({
        pid: launched.pid, ownerPid: process.pid, kind: 'agent-service',
        binary: bunPath, entrypoint, ownershipToken,
      });
    } catch {
      // Best-effort cleanup metadata: an unrecorded child is simply not reaped
      // on a later run, which is no worse than the pre-registry behavior.
    }
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
        else {
          // Escalate through pidfd identities; a numeric group kill can hit a
          // recycled id. A failure leaves the recorded child for startup reap.
          try {
            await processRegistry.terminateManagedProcess(current.pid, 'SIGKILL');
          } catch {
            // pidfd/Bun unavailable: no numeric fallback.
          }
        }
      }
      await waitWithin(exited, 500, 'Agent service did not exit after termination');
    }
    if (Number.isInteger(current.pid)) {
      try {
        await processRegistry.unregisterManagedProcess(current.pid);
      } catch {
        // Best-effort cleanup metadata; the child is already gone.
      }
    }
    if (child === current) child = null;
  };

  const start = async () => {
    if (stopPromise) { await stopPromise; return start(); }
    if (phase === 'ready') return state();
    if (startupPromise) return startupPromise;
    const myLifecycle = lifecycle;
    let deadline = 0;
    startupController = new AbortController();
    startupPromise = (async () => {
      if (child) await killChild();
      if (lifecycle !== myLifecycle) throw new Error('Agent service startup cancelled');
      phase = 'starting';
      accepting = false;
      // Reap children orphaned by a previous hard-killed Host before spawning
      // the replacement. The check after it closes the stop-during-reap race.
      await reapPreviousManagedChildren();
      if (lifecycle !== myLifecycle) throw new Error('Agent service startup cancelled');
      deadline = Date.now() + startupTimeoutMs;
      if (!policyStore && dataDir) { policyStore = openApprovalPolicyStore({ dataDir }); ownsPolicyStore = true; }
      const bytes = randomBytes(32);
      secret = Buffer.from(bytes).toString('hex');
      // Per-child nonce, inherited by the service's workers. It authorizes
      // process-tree membership during orphan cleanup; env/tree position alone
      // is not enough to signal a descendant.
      const ownershipToken = Buffer.from(randomBytes(16)).toString('hex');
      const childEnv = {
        ...process.env, ...env,
        [SECRET_ENV]: secret,
        [MANAGED_PROCESS_TOKEN_ENV]: ownershipToken,
      };
      const launched = spawn(bunPath, ['--no-env-file', entrypoint, '--port', '0'], {
        cwd: dataDir,
        env: childEnv,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      child = launched;
      const onPolicyMessage = message => { handlePolicyMessage(launched, message); authorization.handleMessage(launched, message); void handleSkillSourceMessage(launched, message); };
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
            relocationScopes.clear(); forkTickets.clear(); scopes.clear(); workspaceScopes.clear(); authorization.closeChild(launched);
            accepting = false;
          }
        };
        launched.stdout?.on('data', onData);
        launched.once('error', (error) => finish(reject, error));
        launched.once('exit', onExit);
      });
      // Record the real child before readiness so a hard-killed Host leaves a
      // reaping record behind; the write is already best-effort.
      await registerManagedChild(launched, ownershipToken);
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
      relocationScopes.clear(); forkTickets.clear(); scopes.clear();
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
    let capture; let workspaceCapture; let forkTicket;
    let relocationAction;
    const workspace = /^\/internal\/workspaces\/([^/]+)$/.exec(requestPath);
    const restartWorker = /^\/internal\/workers\/([^/]+)\/restart$/.exec(requestPath);
    const reopenSession = /^\/internal\/sessions\/([^/]+)\/reopen$/.exec(requestPath);
    const forkSession = method === 'POST' && /^\/internal\/sessions\/([^/]+)\/fork$/.exec(requestPath);
    const relocationPrepare = method === 'POST' && /^\/internal\/sessions\/([^/]+)\/relocation\/prepare$/.exec(requestPath);
    const relocationFinalize = method === 'POST' && /^\/internal\/sessions\/([^/]+)\/relocation\/finalize$/.exec(requestPath);
    const rootBootstrap = method === 'POST' && (requestPath === '/internal/sessions' || requestPath === '/internal/workers' || restartWorker || reopenSession);
    if (rootBootstrap || (workspace && method === 'POST') || relocationPrepare) {
      const schema = workspace ? HostWorkspaceBootstrapSchema : relocationPrepare ? HostSessionRelocationPrepareSchema : reopenSession ? HostSessionBootstrapSchema.omit({ sessionFile: true }) : requestPath === '/internal/sessions' ? HostSessionBootstrapSchema : WorkerBootstrapSchema;
      const parsed = schema.safeParse(JSON.parse(init.body));
      if (!parsed.success) throw new Error('Invalid Host bootstrap');
      if (relocationPrepare) {
        const sessionId = decodeURIComponent(relocationPrepare[1]);
        if (parsed.data.destination.rootSessionId !== sessionId) throw new Error('Invalid Host relocation scope');
        const destination = { ...parsed.data.destination, cwd: await fs.realpath(parsed.data.destination.cwd), agentDirectory: await fs.realpath(parsed.data.destination.agentDirectory) };
        capture = captureScope(destination, true);
        relocationScopes.set(sessionId, { prior: capture.prior });
        init = { ...init, body: JSON.stringify({ ...parsed.data, destination }) };
      } else {
        const body = { ...parsed.data, cwd: await fs.realpath(parsed.data.cwd), agentDirectory: await fs.realpath(parsed.data.agentDirectory) };
        if (restartWorker && decodeURIComponent(restartWorker[1]) !== body.rootSessionId) throw new Error('Invalid Host restart scope');
        if (reopenSession && decodeURIComponent(reopenSession[1]) !== body.rootSessionId) throw new Error('Invalid Host reopen scope');
        if (workspace) {
          const workspaceId = decodeURIComponent(workspace[1]);
          const captured = Object.freeze({ projectId: body.projectId, workspaceId, cwd: body.cwd, agentDirectory: body.agentDirectory, agentDirectoryId: body.agentDirectoryId });
          const prior = workspaceScopes.get(workspaceId);
          if (prior && !isDeepStrictEqual(prior.scope, captured)) throw new Error('Host workspace scope cannot change');
          workspaceCapture = { scope: captured, prior };
        } else {
          if (body.agentDirectoryId === undefined) {
            const registered = workspaceScopes.get(body.workspaceId)?.scope;
            if (registered && registered.projectId === body.projectId && registered.cwd === body.cwd
              && registered.agentDirectory === body.agentDirectory) body.agentDirectoryId = registered.agentDirectoryId;
          }
          capture = captureScope(body);
        }
        init = { ...init, body: JSON.stringify(body) };
      }
    } else if (relocationFinalize) {
      const parsed = HostSessionRelocationFinalizeSchema.safeParse(JSON.parse(init.body));
      if (!parsed.success) throw new Error('Invalid Host relocation finalization');
      relocationAction = parsed.data.action;
      if (relocationAction === 'rollback') {
        const sessionId = decodeURIComponent(relocationFinalize[1]);
        const transition = relocationScopes.get(sessionId);
        if (transition?.prior) scopes.set(sessionId, transition.prior);
      }
    } else if (forkSession) {
      // The service creates the child, so its identity arrives while this request is
      // in flight. A ticket lets the child's policy load derive its scope from the
      // already-captured source scope instead of failing closed for an unknown session.
      const sourceSessionId = decodeURIComponent(forkSession[1]);
      const sourceScope = scopes.get(sourceSessionId);
      let input;
      try { input = JSON.parse(init.body); } catch { throw new Error('Invalid Host fork request'); }
      if (!sourceScope || input?.sourceSessionId !== sourceSessionId) throw new Error('Fork requires an authorized source session scope');
      forkTicket = { id: crypto.randomUUID(), sourceSessionId, captured: sourceScope, childId: null, childScope: null };
      const tickets = forkTickets.get(sourceSessionId) ?? [];
      tickets.push(forkTicket);
      forkTickets.set(sourceSessionId, tickets);
      // The service echoes this opaque id on the child's policy load, so concurrent
      // forks of one source correlate to their own request instead of array order.
      init = { ...init, body: JSON.stringify({ ...input, forkTicketId: forkTicket.id }) };
    }
    const removeForkTicket = () => {
      const tickets = forkTickets.get(forkTicket.sourceSessionId);
      if (!tickets) return;
      const index = tickets.indexOf(forkTicket);
      if (index >= 0) tickets.splice(index, 1);
      if (!tickets.length) forkTickets.delete(forkTicket.sourceSessionId);
    };
    const releaseFork = () => {
      if (!forkTicket) return;
      const ticket = forkTicket;
      removeForkTicket();
      forkTicket = null;
      if (ticket.childId && scopes.get(ticket.childId) === ticket.childScope) scopes.delete(ticket.childId);
    };
    const settleFork = async (response) => {
      if (!forkTicket) return;
      if (!response.ok) { releaseFork(); return; }
      let ack;
      try { ack = HostSessionForkAckSchema.parse(await response.clone().json()); } catch { releaseFork(); throw new Error('Invalid Host fork admission'); }
      if (child !== requestedChild || lifecycle !== requestedLifecycle || !accepting
        || ack.sessionId !== ack.rootSessionId || ack.sourceSessionId !== forkTicket.sourceSessionId
        || (forkTicket.childId !== null && forkTicket.childId !== ack.sessionId)) {
        releaseFork();
        throw new Error('Invalid Host fork admission');
      }
      if (!forkTicket.childId) {
        if (scopes.has(ack.sessionId) || ack.sessionId === forkTicket.sourceSessionId) { releaseFork(); throw new Error('Invalid Host fork admission'); }
        const childScope = Object.freeze({ ...forkTicket.captured, rootSessionId: ack.sessionId });
        scopes.set(ack.sessionId, childScope);
        forkTicket.childId = ack.sessionId;
        forkTicket.childScope = childScope;
      }
      // The child is an authorized session from here on; only the in-flight ticket goes away.
      removeForkTicket();
      forkTicket = null;
    };
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
      if (!response.ok) {
        rollback();
        if (relocationPrepare) relocationScopes.delete(decodeURIComponent(relocationPrepare[1]));
      }
      if (forkTicket) await settleFork(response);
      if (response.ok && workspaceCapture) {
        const registered = HostWorkspaceRegisteredSchema.safeParse(await response.clone().json());
        if (!registered.success || registered.data.workspaceId !== workspaceCapture.scope.workspaceId
          || registered.data.projectId !== workspaceCapture.scope.projectId || registered.data.agentDirectoryId !== workspaceCapture.scope.agentDirectoryId
          || (workspaceCapture.prior && registered.data.authorizationRootId !== workspaceCapture.prior.rootSessionId)
          || child !== requestedChild || lifecycle !== requestedLifecycle || !accepting) throw new Error('Invalid Host workspace admission');
        const captured = captureScope({ ...workspaceCapture.scope, rootSessionId: registered.data.authorizationRootId });
        workspaceScopes.set(workspaceCapture.scope.workspaceId, { scope: workspaceCapture.scope, rootSessionId: captured.captured.rootSessionId });
      }
      if (response.ok && relocationFinalize) relocationScopes.delete(decodeURIComponent(relocationFinalize[1]));
      if (response.ok && method === 'DELETE') {
        const deleted = /^\/(?:api\/agent\/v1\/sessions|internal\/workers)\/([^/]+)$/.exec(requestPath);
        if (deleted && child === requestedChild && lifecycle === requestedLifecycle) scopes.delete(decodeURIComponent(deleted[1]));
      }
      return response;
    } catch (error) {
      releaseFork();
      rollback();
      if (relocationPrepare) relocationScopes.delete(decodeURIComponent(relocationPrepare[1]));
      throw error;
    }
  };
  return { start, stop, restart, request, getState: state };
};
