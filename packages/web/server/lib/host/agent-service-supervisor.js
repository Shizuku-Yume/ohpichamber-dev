import { spawn as nodeSpawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { CapturedHostBootstrapScopeSchema, HostApprovalPolicyListRequestSchema, HostSessionBootstrapSchema, HostSessionForkAckSchema, HostSessionRelocationFinalizeSchema, HostSessionRelocationPrepareSchema, HostSkillSourceOperationSchema, HostSkillSourceRequestSchema, HostSkillSourceResultSchema, HostWorkspaceBootstrapSchema, HostWorkspaceRegisteredSchema, WorkerBootstrapSchema } from '@openchamber/agent-service/private-protocol';
import { createHostWorkerAuthorizationChannel } from './worker-authorization-channel.js';

import { openApprovalPolicyStore } from './approval-policy-store.js';
import { AgentServiceReadySchema } from '@openchamber/agent-contract';

import { MANAGED_PROCESS_TOKEN_ENV, createManagedProcessRegistry, reapOrphanedProcesses, registerManagedProcess, terminateManagedProcess, unregisterManagedProcess } from './managed-process-registry.js';
import { terminateProcessTree, processTreeAlive, waitForProcessTreeExit } from './pidfd-terminator.js';

const defaultRegistry = { registerManagedProcess, unregisterManagedProcess, reapOrphanedProcesses, terminateManagedProcess };

const STARTUP_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 5_000;
const ANNOUNCEMENT_TYPE = 'agent-service.listening';
const SECRET_HEADER = 'X-Internal-Secret';
const DIAGNOSTIC_MAX_MESSAGE = 2_048;
const DIAGNOSTIC_MAX_CHUNK = 8_192;
const DIAGNOSTIC_MAX_PER_SECOND = 20;
const DIAGNOSTICS_LEVEL_ENV = 'OPENCHAMBER_AGENT_DIAGNOSTICS_LEVEL';
const DIAGNOSTIC_LEVELS = Object.freeze({ off: 0, error: 1, warn: 2, info: 3 });
const DiagnosticMessageSchema = z.object({
  type: z.literal('agent-service.diagnostic'),
  level: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  rootSessionId: z.string().optional(),
  workerGeneration: z.string().optional(),
});
const SECRET_REQUEST_TYPE = 'agent-service.internal-secret.request';
const SECRET_MESSAGE_TYPE = 'agent-service.internal-secret';

// The service inherits only what it needs to launch Bun and the SDK workers.
// Host credentials, UI passwords, pairing tokens and every other `*_TOKEN` stay
// in this process; a worker that runs a shell can read its own environment.
const SERVICE_ENV_KEYS = Object.freeze([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'USERPROFILE', 'SHELL', 'TERM', 'TMPDIR', 'TEMP', 'TMP',
  'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'TZ',
  'SystemRoot', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'WINDIR', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'ProgramFiles', 'ProgramFiles(x86)',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'CURL_CA_BUNDLE',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR',
  'OHPICHAMBER_BUN',
  'OMP_PROFILE', 'PI_PROFILE', 'PI_CONFIG_DIR', 'PI_CODING_AGENT_DIR',
  'BUN_INSTALL', 'BUN_INSTALL_BIN',
  'OPENCHAMBER_AGENT_DIAGNOSTICS_LEVEL',
]);

// Authorization/Bearer first: a quoted or space-containing value must not
// survive the more specific key=value patterns below.
const redactDiagnostic = message => message
  .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\r\n]*/gi, '$1[REDACTED]')
  .replace(/\bbearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
  .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
  .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
  .replace(/\b[a-f0-9]{64}\b/gi, '[REDACTED]');

const buildServiceEnvironment = (overrides = {}) => {
  const environment = {};
  for (const key of SERVICE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  // Overrides are a narrow embedding seam (for example OHPICHAMBER_BUN in the
  // packaged verifier), not a second environment. Only allowlisted names pass.
  for (const [key, value] of Object.entries(overrides)) {
    if (SERVICE_ENV_KEYS.includes(key) && value !== undefined) environment[key] = value;
  }
  return environment;
};

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
  restartBaseDelayMs = 1_000, restartMaxDelayMs = 15_000, restartMaxAttempts = 3, restartStabilityMs = 60_000,
  diagnosticsLevel = process.env.OPENCHAMBER_AGENT_DIAGNOSTICS_LEVEL ?? 'error',
  maxDiagnostics = 100, logDiagnostic = null,
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
  let restartAttempts = 0; let restartTimer = null; let restartStabilityTimer = null; let terminating = null;
  const diagnostics = [];
  const diagnosticLevel = DIAGNOSTIC_LEVELS[diagnosticsLevel] ?? DIAGNOSTIC_LEVELS.error;
  let diagnosticWindowStart = 0; let diagnosticWindowCount = 0; let diagnosticSuppressed = 0; let suppressionFlushTimer = null;
  const pushDiagnostic = (entry) => {
    const message = redactDiagnostic(String(entry.message)).slice(0, DIAGNOSTIC_MAX_MESSAGE);
    const record = { at: new Date().toISOString(), ...entry, message };
    diagnostics.push(record);
    while (diagnostics.length > maxDiagnostics) diagnostics.shift();
    const prefix = record.source === 'worker'
      ? `[agent-service] worker ${record.rootSessionId ?? 'unknown'}/${record.workerGeneration ?? 'unknown'}: `
      : '[agent-service] ';
    try { (logDiagnostic ?? console.error)(`${prefix}${record.message}`); } catch { /* diagnostics never affect lifecycle */ }
  };
  const flushSuppressedDiagnostics = () => {
    if (suppressionFlushTimer) { clearTimeout(suppressionFlushTimer); suppressionFlushTimer = null; }
    const suppressed = diagnosticSuppressed;
    diagnosticSuppressed = 0;
    diagnosticWindowStart = Date.now();
    diagnosticWindowCount = 0;
    if (suppressed > 0 && diagnosticLevel >= DIAGNOSTIC_LEVELS.warn) pushDiagnostic({ source: 'service', level: 'warn', message: `${suppressed} diagnostics suppressed by the rate limit` });
  };
  const recordDiagnostic = (entry) => {
    if (diagnosticLevel === DIAGNOSTIC_LEVELS.off || DIAGNOSTIC_LEVELS[entry.level] > diagnosticLevel) return;
    const now = Date.now();
    if (now - diagnosticWindowStart >= 1_000) flushSuppressedDiagnostics();
    if (diagnosticWindowCount >= DIAGNOSTIC_MAX_PER_SECOND) {
      diagnosticSuppressed += 1;
      if (!suppressionFlushTimer) {
        // A burst that stops must still leave its suppression total behind.
        suppressionFlushTimer = setTimeout(flushSuppressedDiagnostics, 1_000);
        suppressionFlushTimer.unref?.();
      }
      return;
    }
    diagnosticWindowCount += 1;
    pushDiagnostic(entry);
  };
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
    const scope = { rootSessionId: body.rootSessionId, projectId: body.projectId, workspaceId: body.workspaceId, cwd: body.cwd, agentDirectory: body.agentDirectory };
    if (body.agentDirectoryId !== undefined) scope.agentDirectoryId = body.agentDirectoryId;
    const captured = Object.freeze(CapturedHostBootstrapScopeSchema.parse(scope));
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
    const requestId = HostSkillSourceRequestSchema.pick({ requestId: true }).safeParse({ requestId: message.requestId });
    if (!requestId.success) return;
    let result = { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
    try {
      const request = HostSkillSourceRequestSchema.parse(message);
      const operation = HostSkillSourceOperationSchema.parse(request.operation);
      const captured = workspaceScopes.get(operation.workspaceId)?.scope;
      if (child !== launched || !accepting || phase !== 'ready' || !launched.connected
        || !handleSkillSource || !captured
        || captured.projectId !== operation.projectId || captured.workspaceId !== operation.workspaceId
        || captured.agentDirectoryId !== operation.agentDirectoryId) throw new Error('Skill source scope unavailable');
      // Only Host-captured paths reach the disk owner; the private operation carries IDs alone.
      const handled = HostSkillSourceResultSchema.parse(await handleSkillSource(operation, captured));
      if (child === launched && accepting && phase === 'ready'
        && workspaceScopes.get(operation.workspaceId)?.scope === captured) result = handled;
    } catch { /* Never send filesystem paths, thrown messages, or internal service details. */ }
    try {
      if (launched.connected) launched.send({ type: 'host.skill-source.result', requestId: requestId.data.requestId, result }, () => {});
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

  const clearRestartTimer = () => {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    if (restartStabilityTimer) { clearTimeout(restartStabilityTimer); restartStabilityTimer = null; }
    if (suppressionFlushTimer) { clearTimeout(suppressionFlushTimer); suppressionFlushTimer = null; }
  };

  const killChild = async () => {
    if (!child) return;
    const current = child;
    terminating = current;
    const exited = new Promise((resolve) => {
      if (current.exitCode !== null || current.signalCode !== null) resolve();
      else current.once('close', resolve);
    });
    if (current.exitCode === null && current.signalCode === null) {
      let signalled = false;
      if (process.platform === 'linux') {
        try { signalled = await processRegistry.terminateManagedProcess(current.pid, 'SIGTERM'); } catch { /* Leave failed identities for the orphan reaper. */ }
      } else signalled = await terminateProcessTree(current.pid, 'SIGTERM');
      if (!signalled) current.kill('SIGTERM');
    }
    try {
      await waitWithin(exited, stopTimeoutMs, 'Agent service stop timed out');
    } catch {
      if (process.platform === 'linux') {
        if (current.exitCode === null && current.signalCode === null) {
          // Linux uses the registry's birth-checked pidfd tree path.
          try { await processRegistry.terminateManagedProcess(current.pid, 'SIGKILL'); } catch { /* The orphan reaper retains the record. */ }
        }
      } else if (current.exitCode === null && current.signalCode === null) {
        // Windows taskkill walks ancestry while the leader exists; macOS and
        // Windows both receive a graceful tree signal above before this /F.
        const terminated = await terminateProcessTree(current.pid, 'SIGKILL');
        if (!terminated) current.kill('SIGKILL');
      }
      await waitWithin(exited, 500, 'Agent service did not exit after termination');
    }
    if (process.platform === 'darwin') {
      // The leader may have exited while group members remain; signal the
      // detached group again and bound the observation.
      if (processTreeAlive(current.pid)) await terminateProcessTree(current.pid, 'SIGKILL');
      await waitForProcessTreeExit(current.pid, { graceMs: 500 });
    }
    // Windows limitation: taskkill cannot discover descendants after the leader
    // exits, so its tree signal necessarily runs while the leader is alive.
    if (Number.isInteger(current.pid)) {
      try {
        await processRegistry.unregisterManagedProcess(current.pid);
      } catch {
        // Best-effort cleanup metadata; the child is already gone.
      }
    }
    if (child === current) child = null;
    if (terminating === current) terminating = null;
  };

  const scheduleRestart = () => {
    if (phase === 'stopping' || phase === 'stopped' || restartTimer || startupPromise) return;
    // The architecture bounds recovery: 1s, doubling to 15s, at most 3 retries.
    if (restartAttempts >= restartMaxAttempts) { phase = 'failed'; return; }
    const delay = Math.min(restartBaseDelayMs * 2 ** restartAttempts, restartMaxDelayMs);
    const scheduledLifecycle = lifecycle;
    restartAttempts += 1;
    // Health reports a distinct pending state while no child is running.
    phase = 'restarting';
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (lifecycle !== scheduledLifecycle || phase === 'stopping' || phase === 'stopped') return;
      if (startupPromise || phase === 'ready') return;
      void start(true).catch(() => { /* start() scheduled the next attempt */ });
    }, Math.max(0, delay));
    // Recovery must not keep the Host process alive on its own.
    restartTimer.unref?.();
  };

  const start = async (fromRestart = false) => {
    if (!fromRestart) { clearRestartTimer(); restartAttempts = 0; }
    if (fromRestart && (phase === 'stopping' || phase === 'stopped')) return state();
    if (stopPromise) { await stopPromise; return fromRestart ? state() : start(); }
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
        ...buildServiceEnvironment(env),
        [MANAGED_PROCESS_TOKEN_ENV]: ownershipToken,
        [DIAGNOSTICS_LEVEL_ENV]: diagnosticsLevel,
      };
      const launched = spawn(bunPath, ['--no-env-file', entrypoint, '--port', '0'], {
        cwd: dataDir,
        env: childEnv,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      child = launched;
      const onPolicyMessage = message => {
        // The token never enters the child's environment: a same-UID worker can
        // read `/proc/<service pid>/environ`, but not this private IPC channel.
        if (message?.type === SECRET_REQUEST_TYPE) {
          if (child !== launched || phase === 'stopping') return;
          try { launched.send?.({ type: SECRET_MESSAGE_TYPE, secret }); } catch { /* service exited during the handshake */ }
          return;
        }
        handlePolicyMessage(launched, message); authorization.handleMessage(launched, message); void handleSkillSourceMessage(launched, message);
      };
      launched.on('message', onPolicyMessage);
      launched.once('disconnect', () => authorization.closeChild(launched));
      launched.once('close', () => { launched.removeListener('message', onPolicyMessage); authorization.closeChild(launched); });
      const maxStderrBuffer = 8_192;
      let stderrBuffer = '';
      const recordServiceLine = (line) => {
        const text = line.trim();
        if (!text) return;
        const parsed = DiagnosticMessageSchema.safeParse((() => { try { return JSON.parse(text); } catch { return null; } })());
        if (parsed.success) recordDiagnostic({ source: 'worker', level: parsed.data.level, rootSessionId: parsed.data.rootSessionId, workerGeneration: parsed.data.workerGeneration, message: parsed.data.message });
        // Unstructured service stderr may contain arbitrary text; keep only that it happened.
        else recordDiagnostic({ source: 'service', level: 'error', message: 'Agent Service wrote unstructured stderr' });
      };
      launched.stderr?.on('data', chunk => {
        // Cap before decoding: a no-newline flood cannot allocate an unbounded string.
        const bounded = Buffer.isBuffer(chunk) ? chunk.subarray(0, DIAGNOSTIC_MAX_CHUNK) : Buffer.from(String(chunk).slice(0, DIAGNOSTIC_MAX_CHUNK));
        stderrBuffer += bounded.toString();
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() ?? '';
        if (stderrBuffer.length >= maxStderrBuffer) {
          recordServiceLine(stderrBuffer.slice(0, DIAGNOSTIC_MAX_MESSAGE));
          stderrBuffer = '';
          return;
        }
        for (const line of lines) recordServiceLine(line);
      });
      launched.once('close', () => { if (stderrBuffer) { recordServiceLine(stderrBuffer); stderrBuffer = ''; } });
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
          if (child !== launched || phase === 'stopping' || terminating === launched) return;
          if (restartStabilityTimer) { clearTimeout(restartStabilityTimer); restartStabilityTimer = null; }
          child = null;
          port = null;
          phase = 'failed';
          relocationScopes.clear(); forkTickets.clear(); scopes.clear(); workspaceScopes.clear(); authorization.closeChild(launched);
          accepting = false;
          if (Number.isInteger(launched.pid)) void processRegistry.unregisterManagedProcess(launched.pid).catch(() => {});
          scheduleRestart();
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
            if (AgentServiceReadySchema.parse(body) && lifecycle === myLifecycle) {
              phase = 'ready';
              accepting = true;
              if (fromRestart) {
                // A short ready->crash cycle must not reset the retry budget.
                if (!restartStabilityTimer) {
                  restartStabilityTimer = setTimeout(() => { restartAttempts = 0; restartStabilityTimer = null; }, restartStabilityMs);
                  restartStabilityTimer.unref?.();
                }
              } else {
                restartAttempts = 0;
              }
              return state();
            }
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
    }).finally(() => {
      const startupFinished = startupPromise;
      startupPromise = null;
      startupController = null;
      // A failed recovery attempt consumes one budget unit and schedules the
      // next one; an explicit stop or a newer start owns the lifecycle.
      if (fromRestart && startupFinished !== null && phase === 'failed' && lifecycle === myLifecycle) scheduleRestart();
    });
    return startupPromise;
  };

  const stop = async () => {
    lifecycle += 1;
    clearRestartTimer();
    restartAttempts = 0;
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
  return { start, stop, restart, request, getState: state, getDiagnostics: () => diagnostics.slice() };
};
