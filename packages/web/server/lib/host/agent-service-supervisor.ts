import { spawn as nodeSpawn, type ChildProcess, type Serializable, type SpawnOptions } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  CapturedHostBootstrapScopeSchema,
  HostApprovalPolicyListRequestSchema,
  HostPermissionEvaluateRequestSchema,
  HostPermissionModeLoadRequestSchema,
  HostPermissionModeReplySchema,
  HostPermissionVerdictSchema,
  HostSessionBootstrapSchema,
  HostSessionForkAckSchema,
  HostSessionRelocationFinalizeSchema,
  HostSessionRelocationPrepareSchema,
  HostSkillSourceOperationSchema,
  HostSkillSourceRequestSchema,
  HostSkillSourceResultSchema,
  HostWorkspaceBootstrapSchema,
  HostWorkspaceRegisteredSchema,
  WorkerBootstrapSchema,
  type CapturedHostBootstrapScope,
  type HostActionRequest,
  type HostActionResult,
  type HostAuthorizationScope,
  type HostSkillSourceOperation,
  type HostSkillSourceResult,
  type NativeOperationDescriptor,
  type WorkerPolicyRequest,
  type WorkerPolicyResult,
} from '@openchamber/agent-service/private-protocol';
import { AgentServiceReadySchema } from '@openchamber/agent-contract';
import { evaluateHostPermission, resolveHostPermissionMode } from '../permission-auto-accept/host-channel.js';
import { isString } from '../shared/guards.js';
import type { JsonValue } from '../shared/json-values.js';
import { createHostWorkerAuthorizationChannel, type WorkerAuthorizationChild } from './worker-authorization-channel.js';
import { openApprovalPolicyStore, type ApprovalPolicyStore } from './approval-policy-store.js';
import {
  MANAGED_PROCESS_TOKEN_ENV,
  createManagedProcessRegistry,
  reapOrphanedProcesses,
  registerManagedProcess,
  terminateManagedProcess,
  unregisterManagedProcess,
} from './managed-process-registry.js';
import { terminateProcessTree, processTreeAlive, waitForProcessTreeExit } from './pidfd-terminator.js';

export type AgentServicePhase = 'stopped' | 'starting' | 'restarting' | 'ready' | 'stopping' | 'failed';
export type AgentServiceDiagnosticLevel = 'off' | 'error' | 'warn' | 'info';

export interface AgentServiceDiagnostic {
  at: string;
  level: 'error' | 'warn' | 'info';
  source: 'worker' | 'service';
  message: string;
  rootSessionId?: string | undefined;
  workerGeneration?: string | undefined;
}

export interface AgentServiceSupervisorState {
  phase: AgentServicePhase;
  pid: number | null;
  port: number | null;
  ompVersion: string | null;
}

export interface AgentServiceRegistry {
  registerManagedProcess: typeof registerManagedProcess;
  unregisterManagedProcess: typeof unregisterManagedProcess;
  reapOrphanedProcesses: typeof reapOrphanedProcesses;
  terminateManagedProcess: (pid: number, signal?: 'SIGTERM' | 'SIGKILL') => Promise<boolean>;
}

export interface AgentServiceSupervisorOptions {
  bunPath?: string | undefined;
  entrypoint: string;
  dataDir?: string | undefined;
  env?: Record<string, string> | undefined;
  startupTimeoutMs?: number | undefined;
  stopTimeoutMs?: number | undefined;
  restartBaseDelayMs?: number | undefined;
  restartMaxDelayMs?: number | undefined;
  restartMaxAttempts?: number | undefined;
  restartStabilityMs?: number | undefined;
  diagnosticsLevel?: AgentServiceDiagnosticLevel | string | undefined;
  maxDiagnostics?: number | undefined;
  logDiagnostic?: ((message: string) => void) | null | undefined;
  spawn?: ((file: string, args: readonly string[], options: SpawnOptions) => ChildProcess) | undefined;
  fetchImpl?: typeof fetch | undefined;
  registry?: AgentServiceRegistry | null | undefined;
  randomBytes?: ((size: number) => Uint8Array) | undefined;
  approvalPolicyStore?: ApprovalPolicyStore | null | undefined;
  authorizeWorkerOperation?: ((
    scope: HostAuthorizationScope,
    request: WorkerPolicyRequest,
    descriptor?: NativeOperationDescriptor,
  ) => Promise<WorkerPolicyResult>) | undefined;
  invokeHostAction?: ((
    scope: HostAuthorizationScope,
    request: HostActionRequest,
    signal: AbortSignal,
  ) => Promise<HostActionResult>) | undefined;
  handleSkillSource?: ((
    operation: HostSkillSourceOperation,
    scope: Readonly<{
      projectId: string;
      workspaceId: string;
      agentDirectoryId: string;
      cwd: string;
      agentDirectory: string;
    }>,
  ) => Promise<HostSkillSourceResult>) | undefined;
}

export interface AgentServiceSupervisor {
  start(): Promise<AgentServiceSupervisorState>;
  stop(): Promise<void>;
  restart(): Promise<AgentServiceSupervisorState>;
  request(path: string, init?: RequestInit): Promise<Response>;
  holdRestarts(): void;
  resumeRestarts(): void;
  getState(): AgentServiceSupervisorState;
  getDiagnostics(): AgentServiceDiagnostic[];
}

interface WorkspaceScopeCaptureEntry {
  scope: {
    projectId: string;
    workspaceId: string;
    cwd: string;
    agentDirectory: string;
    agentDirectoryId: string;
  };
  rootSessionId: string;
}

interface ForkTicket {
  id: string;
  sourceSessionId: string;
  captured: CapturedHostBootstrapScope;
  childId: string | null;
  childScope: CapturedHostBootstrapScope | null;
}

interface BootstrapScopeCapture {
  captured: CapturedHostBootstrapScope;
  prior: CapturedHostBootstrapScope | undefined;
}

const defaultRegistry: AgentServiceRegistry = {
  registerManagedProcess,
  unregisterManagedProcess,
  reapOrphanedProcesses,
  terminateManagedProcess,
};

const STARTUP_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 5_000;
const ANNOUNCEMENT_TYPE = 'agent-service.listening';
const SECRET_HEADER = 'X-Internal-Secret';
const DIAGNOSTIC_MAX_MESSAGE = 2_048;
const DIAGNOSTIC_MAX_CHUNK = 8_192;
const DIAGNOSTIC_MAX_PER_SECOND = 20;
const DIAGNOSTICS_LEVEL_ENV = 'OPENCHAMBER_AGENT_DIAGNOSTICS_LEVEL';
const DiagnosticLevelSchema = z.enum(['off', 'error', 'warn', 'info']);
const DiagnosticMessageSchema = z.object({
  type: z.literal('agent-service.diagnostic'),
  level: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  rootSessionId: z.string().optional(),
  workerGeneration: z.string().optional(),
});
const AnnouncementSchema = z.object({
  type: z.literal(ANNOUNCEMENT_TYPE),
  port: z.number().int().min(1).max(65535),
});
const IpcMessageHeaderSchema = z.object({
  type: z.string(),
  requestId: z.string().optional(),
});
const ApprovalPolicyCommitRequestSchema = z.object({
  sessionId: z.string(),
  workspaceId: z.string(),
  scope: z.enum(['session', 'workspace']),
  decision: z.enum(['allow', 'deny']),
  target: z.object({ toolName: z.string(), pattern: z.string() }),
});
const ApprovalPolicyCommitMessageSchema = z.object({
  type: z.literal('approval.policy.commit'),
  requestId: z.string(),
  request: ApprovalPolicyCommitRequestSchema,
});
const ApprovalPolicyListMessageSchema = z.object({
  type: z.literal('approval.policy.list'),
  requestId: z.string(),
  request: HostApprovalPolicyListRequestSchema,
});
const ForkInputSchema = z.looseObject({
  sourceSessionId: z.string(),
});
const SECRET_REQUEST_TYPE = 'agent-service.internal-secret.request';
const SECRET_MESSAGE_TYPE = 'agent-service.internal-secret';

const SERVICE_ENV_KEYS: readonly string[] = [
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
  'BUN_BE_BUN',
  'BUN_INSTALL', 'BUN_INSTALL_BIN',
  'OPENCHAMBER_AGENT_DIAGNOSTICS_LEVEL',
];
const SERVICE_ENV_KEY_SET = new Set(SERVICE_ENV_KEYS);

const diagnosticLevelValue = (level: AgentServiceDiagnosticLevel): number => {
  switch (level) {
    case 'off': return 0;
    case 'error': return 1;
    case 'warn': return 2;
    case 'info': return 3;
  }
};

const redactDiagnostic = (message: string): string => message
  .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\r\n]*/gi, '$1[REDACTED]')
  .replace(/\bbearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
  .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
  .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
  .replace(/\b[a-f0-9]{64}\b/gi, '[REDACTED]');

const buildServiceEnvironment = (overrides: Record<string, string> = {}) => {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of SERVICE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (SERVICE_ENV_KEY_SET.has(key) && value !== undefined) environment[key] = value;
  }
  return environment;
};
const timeoutSignal = (ms: number): AbortSignal => AbortSignal.timeout(ms);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitWithin = async <Result>(
  operation: Promise<Result>,
  milliseconds: number,
  message: string,
  signal?: AbortSignal,
): Promise<Result> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<Result>((_resolve, reject) => {
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
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
};

const normalizeAnnouncement = (line: string): number | null => {
  try {
    const parsed = AnnouncementSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data.port : null;
  } catch {
    return null;
  }
};

export const createAgentServiceSupervisor = (options: AgentServiceSupervisorOptions): AgentServiceSupervisor => {
  const {
    bunPath = 'bun',
    entrypoint,
    dataDir,
    env = {},
    startupTimeoutMs = STARTUP_TIMEOUT_MS,
    stopTimeoutMs = STOP_TIMEOUT_MS,
    spawn = nodeSpawn,
    fetchImpl = globalThis.fetch,
    registry = null,
    randomBytes = crypto.randomBytes,
    restartBaseDelayMs = 1_000,
    restartMaxDelayMs = 15_000,
    restartMaxAttempts = 3,
    restartStabilityMs = 60_000,
    diagnosticsLevel = process.env.OPENCHAMBER_AGENT_DIAGNOSTICS_LEVEL ?? 'error',
    maxDiagnostics = 100,
    logDiagnostic = null,
    approvalPolicyStore = null,
    authorizeWorkerOperation,
    invokeHostAction,
    handleSkillSource,
  } = options;
  const processRegistry = registry ?? (dataDir
    ? createManagedProcessRegistry({ registryDir: path.join(dataDir, 'managed-processes'), bunPath })
    : defaultRegistry);
  let phase: AgentServicePhase = 'stopped';
  let child: ChildProcess | null = null;
  let port: number | null = null;
  let secret: string | null = null;
  let ompVersion: string | null = null;
  let startupPromise: Promise<AgentServiceSupervisorState> | null = null;
  let stopPromise: Promise<void> | null = null;
  let lifecycle = 0;
  let startupController: AbortController | null = null;
  let accepting = false;
  let restartAttempts = 0;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let restartStabilityTimer: ReturnType<typeof setTimeout> | null = null;
  let terminating: ChildProcess | null = null;
  let restartHolds = 0;
  const diagnostics: AgentServiceDiagnostic[] = [];
  const parsedDiagnosticLevel = DiagnosticLevelSchema.safeParse(diagnosticsLevel);
  const resolvedDiagnosticLevelName: AgentServiceDiagnosticLevel = parsedDiagnosticLevel.success ? parsedDiagnosticLevel.data : 'error';
  const diagnosticLevel = diagnosticLevelValue(resolvedDiagnosticLevelName);
  let diagnosticWindowStart = 0;
  let diagnosticWindowCount = 0;
  let diagnosticSuppressed = 0;
  let suppressionFlushTimer: ReturnType<typeof setTimeout> | null = null;
  const pushDiagnostic = (entry: Omit<AgentServiceDiagnostic, 'at'>): void => {
    const message = redactDiagnostic(String(entry.message)).slice(0, DIAGNOSTIC_MAX_MESSAGE);
    const record: AgentServiceDiagnostic = { at: new Date().toISOString(), ...entry, message };
    diagnostics.push(record);
    while (diagnostics.length > maxDiagnostics) diagnostics.shift();
    const prefix = record.source === 'worker'
      ? `[agent-service] worker ${record.rootSessionId ?? 'unknown'}/${record.workerGeneration ?? 'unknown'}: `
      : '[agent-service] ';
    try { (logDiagnostic ?? console.error)(`${prefix}${record.message}`); } catch { void 0; }
  };
  const flushSuppressedDiagnostics = (): void => {
    if (suppressionFlushTimer) { clearTimeout(suppressionFlushTimer); suppressionFlushTimer = null; }
    const suppressed = diagnosticSuppressed;
    diagnosticSuppressed = 0;
    diagnosticWindowStart = Date.now();
    diagnosticWindowCount = 0;
    if (suppressed > 0 && diagnosticLevel >= diagnosticLevelValue('warn')) {
      pushDiagnostic({ source: 'service', level: 'warn', message: `${suppressed} diagnostics suppressed by the rate limit` });
    }
  };
  const recordDiagnostic = (entry: Omit<AgentServiceDiagnostic, 'at'>): void => {
    if (diagnosticLevel === 0 || diagnosticLevelValue(entry.level) > diagnosticLevel) return;
    const now = Date.now();
    if (now - diagnosticWindowStart >= 1_000) flushSuppressedDiagnostics();
    if (diagnosticWindowCount >= DIAGNOSTIC_MAX_PER_SECOND) {
      diagnosticSuppressed += 1;
      if (!suppressionFlushTimer) {
        suppressionFlushTimer = setTimeout(flushSuppressedDiagnostics, 1_000);
        suppressionFlushTimer.unref?.();
      }
      return;
    }
    diagnosticWindowCount += 1;
    pushDiagnostic(entry);
  };
  const scopes = new Map<string, CapturedHostBootstrapScope>();
  const forkTickets = new Map<string, ForkTicket[]>();
  const relocationScopes = new Map<string, { prior: CapturedHostBootstrapScope | undefined }>();
  const workspaceScopes = new Map<string, WorkspaceScopeCaptureEntry>();
  const authorization = createHostWorkerAuthorizationChannel({
    isCurrentChild: (launched: WorkerAuthorizationChild) => child === launched && accepting && phase === 'ready',
    capturedScope: (rootSessionId: string) => scopes.get(rootSessionId),
    readLiveScope: async (launched: WorkerAuthorizationChild, rootSessionId: string, signal: AbortSignal): Promise<JsonValue> => {
      if (child !== launched || !secret || !port) throw new Error('Agent service authorization unavailable');
      const response = await fetchImpl(`http://127.0.0.1:${port}/internal/authorizations/${encodeURIComponent(rootSessionId)}`, {
        headers: { [SECRET_HEADER]: secret },
        signal,
      });
      if (!response.ok) throw new Error('Agent worker authorization scope unavailable');
      return z.json().parse(await response.json());
    },
    authorizeWorkerOperation,
    invokeHostAction,
  });
  let policyStore: ApprovalPolicyStore | null = approvalPolicyStore;
  let ownsPolicyStore = false;
  const state = (): AgentServiceSupervisorState => ({ phase, pid: child?.pid ?? null, port, ompVersion });
  const assertAdmitted = (): void => { if (!accepting || phase !== 'ready' || !child) throw new Error('Agent service is not accepting requests'); };
  const pendingModeSessions = new Set<string>();
  const pushPermissionMode = async (sessionId: string): Promise<void> => {
    if (!port || !secret || !accepting) return;
    try {
      const mode = await resolveHostPermissionMode(sessionId);
      await fetchImpl(`http://127.0.0.1:${port}/internal/sessions/${encodeURIComponent(sessionId)}/permission-mode`, {
        method: 'POST',
        headers: { [SECRET_HEADER]: secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
    } catch { void 0; }
  };
  const captureScope = (
    body: {
      rootSessionId: string;
      projectId: string;
      workspaceId: string;
      cwd: string;
      agentDirectory: string;
      agentDirectoryId?: string | undefined;
    },
    allowRebind = false,
  ): BootstrapScopeCapture => {
    const captured = Object.freeze(CapturedHostBootstrapScopeSchema.parse(
      body.agentDirectoryId !== undefined
        ? {
          rootSessionId: body.rootSessionId,
          projectId: body.projectId,
          workspaceId: body.workspaceId,
          cwd: body.cwd,
          agentDirectory: body.agentDirectory,
          agentDirectoryId: body.agentDirectoryId,
        }
        : {
          rootSessionId: body.rootSessionId,
          projectId: body.projectId,
          workspaceId: body.workspaceId,
          cwd: body.cwd,
          agentDirectory: body.agentDirectory,
        },
    ));
    const prior = scopes.get(captured.rootSessionId);
    if (prior && !allowRebind && !isDeepStrictEqual(prior, captured)) throw new Error('Host bootstrap scope cannot change');
    if (prior && !allowRebind) return { captured: prior, prior };
    scopes.set(captured.rootSessionId, captured);
    if (pendingModeSessions.delete(captured.rootSessionId) || allowRebind) {
      void pushPermissionMode(captured.rootSessionId);
    }
    return { captured, prior };
  };
  const handlePolicyMessage = (launched: ChildProcess, rawMessage: Serializable): void => {
    const header = IpcMessageHeaderSchema.safeParse(rawMessage);
    if (!header.success) return;
    const messageType = header.data.type;
    const send = (value: Serializable) => { if (launched.connected) launched.send(value, () => { }); };
    if (!['approval.policy.commit', 'approval.policy.list', 'permission.evaluate', 'permission.mode.load'].includes(messageType)) return;
    if (messageType === 'permission.evaluate' || messageType === 'permission.mode.load') {
      const parsed = messageType === 'permission.evaluate'
        ? HostPermissionEvaluateRequestSchema.safeParse(rawMessage)
        : HostPermissionModeLoadRequestSchema.safeParse(rawMessage);
      const sendVerdict = (verdict: Serializable) => { if (launched.connected) launched.send(verdict, () => { }); };
      if (!parsed.success) {
        sendVerdict(messageType === 'permission.evaluate'
          ? { type: 'permission.verdict', requestId: header.data.requestId, verdict: 'unavailable' }
          : { type: 'permission.mode', requestId: header.data.requestId, mode: 'ask' });
        return;
      }
      const parsedRequest = parsed.data;
      const sessionId = parsedRequest.sessionId;
      const captured = scopes.get(sessionId);
      const failClosed = () => sendVerdict(parsedRequest.type === 'permission.evaluate'
        ? { type: 'permission.verdict', requestId: parsedRequest.requestId, verdict: 'unavailable' }
        : { type: 'permission.mode', requestId: parsedRequest.requestId, mode: 'ask' });
      if (!captured || captured.rootSessionId !== sessionId || child !== launched) {
        pendingModeSessions.add(sessionId);
        failClosed();
        return;
      }
      void (async () => {
        let reply:
          | { type: 'permission.verdict'; requestId: string; verdict: 'accept' | 'hold' | 'unavailable' }
          | { type: 'permission.mode'; requestId: string; mode: 'ask' | 'safety' | 'auto' };
        try {
          if (parsedRequest.type === 'permission.evaluate') {
            const verdict = await evaluateHostPermission(parsedRequest.approval);
            reply = {
              type: 'permission.verdict',
              requestId: parsedRequest.requestId,
              verdict: verdict?.action === 'accept' ? 'accept' : verdict?.unavailable ? 'unavailable' : 'hold',
            };
          } else {
            const mode = await resolveHostPermissionMode(sessionId);
            reply = { type: 'permission.mode', requestId: parsedRequest.requestId, mode };
          }
        } catch {
          reply = parsedRequest.type === 'permission.evaluate'
            ? { type: 'permission.verdict', requestId: parsedRequest.requestId, verdict: 'unavailable' }
            : { type: 'permission.mode', requestId: parsedRequest.requestId, mode: 'ask' };
        }
        if (child !== launched) return;
        const schema = reply.type === 'permission.verdict' ? HostPermissionVerdictSchema : HostPermissionModeReplySchema;
        if (schema.safeParse(reply).success) sendVerdict(reply);
      })();
      return;
    }
    try {
      if (child !== launched || !policyStore) throw new Error('Approval policy store unavailable');
      if (messageType === 'approval.policy.commit') {
        const parsedCommit = ApprovalPolicyCommitMessageSchema.parse(rawMessage);
        const captured = scopes.get(parsedCommit.request.sessionId);
        if (!captured || captured.workspaceId !== parsedCommit.request.workspaceId) {
          throw new Error('Unauthorized approval policy scope');
        }
        const approvalScope = {
          sessionId: captured.rootSessionId,
          rootSessionId: captured.rootSessionId,
          projectId: captured.projectId,
          workspaceId: captured.workspaceId,
        };
        const committed = policyStore.commit({
          scope: parsedCommit.request.scope,
          decision: parsedCommit.request.decision,
          target: parsedCommit.request.target,
          ...approvalScope,
        });
        send({ type: 'approval.policy.committed', requestId: parsedCommit.requestId, policyId: committed.policyId, revision: committed.revision });
        return;
      }
      const parsedList = ApprovalPolicyListMessageSchema.parse(rawMessage);
      let captured = scopes.get(parsedList.request.sessionId);
      if (!captured) {
        const listReq = parsedList.request;
        const ticket = listReq.forkOf !== undefined && listReq.forkTicketId !== undefined
          ? forkTickets.get(listReq.forkOf)?.find((candidate) => (
            candidate.id === listReq.forkTicketId
            && candidate.childId === null
            && candidate.captured.workspaceId === listReq.workspaceId
          ))
          : undefined;
        if (ticket && listReq.sessionId !== ticket.sourceSessionId && !scopes.has(listReq.sessionId)) {
          const childScope = Object.freeze({ ...ticket.captured, rootSessionId: listReq.sessionId });
          scopes.set(listReq.sessionId, childScope);
          ticket.childId = listReq.sessionId;
          ticket.childScope = childScope;
          captured = childScope;
        }
      }
      if (!captured || captured.workspaceId !== parsedList.request.workspaceId) {
        throw new Error('Unauthorized approval policy scope');
      }
      const approvalScope = {
        sessionId: captured.rootSessionId,
        rootSessionId: captured.rootSessionId,
        projectId: captured.projectId,
        workspaceId: captured.workspaceId,
      };
      send({ type: 'approval.policy.listed', requestId: parsedList.requestId, policies: policyStore.list(approvalScope) });
    } catch {
      send({ type: 'approval.policy.failed', requestId: header.data.requestId, code: 'APPROVAL_POLICY_WRITE_FAILED' });
    }
  };
  const handleSkillSourceMessage = async (launched: ChildProcess, rawMessage: Serializable): Promise<void> => {
    const header = IpcMessageHeaderSchema.safeParse(rawMessage);
    if (!header.success || header.data.type !== 'host.skill-source.request') return;
    const requestId = HostSkillSourceRequestSchema.pick({ requestId: true }).safeParse({ requestId: header.data.requestId });
    if (!requestId.success) return;
    let result: HostSkillSourceResult = { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
    try {
      const parsedRequest = HostSkillSourceRequestSchema.parse(rawMessage);
      const operation = HostSkillSourceOperationSchema.parse(parsedRequest.operation);
      const captured = workspaceScopes.get(operation.workspaceId)?.scope;
      if (child !== launched || !accepting || phase !== 'ready' || !launched.connected
        || !handleSkillSource || !captured
        || captured.projectId !== operation.projectId || captured.workspaceId !== operation.workspaceId
        || captured.agentDirectoryId !== operation.agentDirectoryId) {
        throw new Error('Skill source scope unavailable');
      }
      const handled = HostSkillSourceResultSchema.parse(await handleSkillSource(operation, captured));
      if (child === launched && accepting && phase === 'ready'
        && workspaceScopes.get(operation.workspaceId)?.scope === captured) {
        result = handled;
      }
    } catch { void 0; }
    try {
      if (launched.connected) launched.send({ type: 'host.skill-source.result', requestId: requestId.data.requestId, result }, () => { });
    } catch { void 0; }
  };
  const reapPreviousManagedChildren = async (): Promise<void> => {
    try {
      await processRegistry.reapOrphanedProcesses();
    } catch { void 0; }
  };
  const registerManagedChild = async (launched: ChildProcess, ownershipToken: string): Promise<void> => {
    if (!Number.isInteger(launched?.pid) || launched.pid === undefined) return;
    try {
      await processRegistry.registerManagedProcess({
        pid: launched.pid,
        ownerPid: process.pid,
        kind: 'agent-service',
        binary: bunPath,
        entrypoint,
        ownershipToken,
      });
    } catch { void 0; }
  };

  const clearRestartTimer = (): void => {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    if (restartStabilityTimer) { clearTimeout(restartStabilityTimer); restartStabilityTimer = null; }
    if (suppressionFlushTimer) { clearTimeout(suppressionFlushTimer); suppressionFlushTimer = null; }
  };

  const killChild = async (): Promise<void> => {
    if (!child) return;
    const current = child;
    const currentPid = current.pid;
    terminating = current;
    const exited = new Promise<void>((resolve) => {
      if (current.exitCode !== null || current.signalCode !== null) resolve();
      else current.once('close', () => resolve());
    });
    if (current.exitCode === null && current.signalCode === null && currentPid !== undefined) {
      let signalled = false;
      if (process.platform === 'linux') {
        try { signalled = await processRegistry.terminateManagedProcess(currentPid, 'SIGTERM'); } catch { void 0; }
      } else signalled = await terminateProcessTree(currentPid, 'SIGTERM');
      if (!signalled) current.kill('SIGTERM');
    }
    try {
      await waitWithin(exited, stopTimeoutMs, 'Agent service stop timed out');
    } catch {
      if (process.platform === 'linux') {
        if (current.exitCode === null && current.signalCode === null && currentPid !== undefined) {
          try { await processRegistry.terminateManagedProcess(currentPid, 'SIGKILL'); } catch { void 0; }
        }
      } else if (current.exitCode === null && current.signalCode === null && currentPid !== undefined) {
        const terminated = await terminateProcessTree(currentPid, 'SIGKILL');
        if (!terminated) current.kill('SIGKILL');
      }
      await waitWithin(exited, 500, 'Agent service did not exit after termination');
    }
    if (process.platform === 'darwin' && currentPid !== undefined) {
      if (processTreeAlive(currentPid)) await terminateProcessTree(currentPid, 'SIGKILL');
      await waitForProcessTreeExit(currentPid, { graceMs: 500 });
    }
    if (currentPid !== undefined && Number.isInteger(currentPid)) {
      try {
        await processRegistry.unregisterManagedProcess(currentPid);
      } catch { void 0; }
    }
    if (child === current) child = null;
    if (terminating === current) terminating = null;
  };

  const scheduleRestart = (): void => {
    if (phase === 'stopping' || phase === 'stopped' || restartTimer || startupPromise) return;
    if (restartHolds > 0) return;
    if (restartAttempts >= restartMaxAttempts) { phase = 'failed'; return; }
    const delay = Math.min(restartBaseDelayMs * 2 ** restartAttempts, restartMaxDelayMs);
    const scheduledLifecycle = lifecycle;
    restartAttempts += 1;
    phase = 'restarting';
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (lifecycle !== scheduledLifecycle || phase === 'stopping' || phase === 'stopped') return;
      if (startupPromise || phase === 'ready') return;
      void start(true).catch(() => { void 0; });
    }, Math.max(0, delay));
    restartTimer.unref?.();
  };

  const start = async (fromRestart = false): Promise<AgentServiceSupervisorState> => {
    if (!fromRestart) { clearRestartTimer(); restartAttempts = 0; }
    if (fromRestart && (phase === 'stopping' || phase === 'stopped')) return state();
    if (fromRestart && restartHolds > 0) return state();
    if (stopPromise) { await stopPromise; return fromRestart ? state() : start(); }
    if (phase === 'ready') return state();
    if (startupPromise) return startupPromise;
    const myLifecycle = lifecycle;
    let deadline = 0;
    const controller = new AbortController();
    startupController = controller;
    startupPromise = (async () => {
      if (child) await killChild();
      if (lifecycle !== myLifecycle) throw new Error('Agent service startup cancelled');
      phase = 'starting';
      accepting = false;
      await reapPreviousManagedChildren();
      if (lifecycle !== myLifecycle) throw new Error('Agent service startup cancelled');
      deadline = Date.now() + startupTimeoutMs;
      if (!policyStore && dataDir) { policyStore = openApprovalPolicyStore({ dataDir }); ownsPolicyStore = true; }
      const bytes = randomBytes(32);
      secret = Buffer.from(bytes).toString('hex');
      const ownershipToken = Buffer.from(randomBytes(16)).toString('hex');
      const childEnv: NodeJS.ProcessEnv = {
        ...buildServiceEnvironment(env),
        [MANAGED_PROCESS_TOKEN_ENV]: ownershipToken,
        [DIAGNOSTICS_LEVEL_ENV]: resolvedDiagnosticLevelName,
      };
      const launched = spawn(bunPath, ['--no-env-file', entrypoint, '--port', '0'], {
        cwd: dataDir,
        env: childEnv,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      child = launched;
      const onPolicyMessage = (rawMessage: Serializable) => {
        const header = IpcMessageHeaderSchema.safeParse(rawMessage);
        if (header.success && header.data.type === SECRET_REQUEST_TYPE) {
          if (child !== launched || phase === 'stopping') return;
          try { launched.send?.({ type: SECRET_MESSAGE_TYPE, secret }); } catch { void 0; }
          return;
        }
        handlePolicyMessage(launched, rawMessage);
        authorization.handleMessage(launched, rawMessage);
        void handleSkillSourceMessage(launched, rawMessage);
      };
      launched.on('message', onPolicyMessage);
      launched.once('disconnect', () => authorization.closeChild(launched));
      launched.once('close', () => { launched.removeListener('message', onPolicyMessage); authorization.closeChild(launched); });
      const maxStderrBuffer = 8_192;
      let stderrBuffer = '';
      const recordServiceLine = (line: string): void => {
        const text = line.trim();
        if (!text) return;
        const parsed = DiagnosticMessageSchema.safeParse((() => { try { return JSON.parse(text); } catch { return null; } })());
        if (parsed.success) {
          recordDiagnostic({
            source: 'worker',
            level: parsed.data.level,
            rootSessionId: parsed.data.rootSessionId,
            workerGeneration: parsed.data.workerGeneration,
            message: parsed.data.message,
          });
        } else {
          recordDiagnostic({ source: 'service', level: 'error', message: 'Agent Service wrote unstructured stderr' });
        }
      };
      launched.stderr?.on('data', (chunk: Buffer | string) => {
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
      const announced = new Promise<number>((resolve, reject) => {
        let done = false;
        const finishResolve = (value: number) => { if (done) return; done = true; resolve(value); };
        const finishReject = (reason: Error) => { if (done) return; done = true; reject(reason); };
        const onData = (chunk: Buffer | string) => {
          announcement += chunk.toString();
          const lines = announcement.split(/\r?\n/);
          announcement = lines.pop() ?? '';
          for (const line of lines) {
            const discovered = normalizeAnnouncement(line);
            if (discovered) finishResolve(discovered);
          }
        };
        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
          finishReject(new Error(`Agent service exited before listening (${code ?? signal ?? 'unknown'})`));
          if (child !== launched || phase === 'stopping' || terminating === launched) return;
          if (restartStabilityTimer) { clearTimeout(restartStabilityTimer); restartStabilityTimer = null; }
          child = null;
          port = null;
          ompVersion = null;
          phase = 'failed';
          relocationScopes.clear();
          forkTickets.clear();
          scopes.clear();
          workspaceScopes.clear();
          authorization.closeChild(launched);
          accepting = false;
          if (launched.pid !== undefined && Number.isInteger(launched.pid)) {
            void processRegistry.unregisterManagedProcess(launched.pid).catch(() => { void 0; });
          }
          scheduleRestart();
        };
        launched.stdout?.on('data', onData);
        launched.once('error', (error) => finishReject(error));
        launched.once('exit', onExit);
      });
      await registerManagedChild(launched, ownershipToken);
      const remaining = () => Math.max(1, deadline - Date.now());
      port = await waitWithin(announced, remaining(), 'Agent service startup timed out', controller.signal);
      while (Date.now() < deadline && lifecycle === myLifecycle) {
        try {
          const response = await fetchImpl(`http://127.0.0.1:${port}/api/agent/v1/ready`, {
            method: 'GET',
            headers: { [SECRET_HEADER]: secret, Accept: 'application/json' },
            signal: AbortSignal.any([controller.signal, timeoutSignal(Math.min(1500, remaining()))]),
          });
          if (response.status === 200) {
            const body: JsonValue = z.json().parse(await response.json());
            const parsedReady = AgentServiceReadySchema.parse(body);
            if (parsedReady && lifecycle === myLifecycle) {
              ompVersion = parsedReady.ompVersion ?? null;
              phase = 'ready';
              accepting = true;
              if (fromRestart) {
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
        } catch { void 0; }
        await sleep(Math.min(100, remaining()));
      }
      throw new Error(lifecycle === myLifecycle ? 'Agent service readiness timed out' : 'Agent service startup cancelled');
    })().catch(async (error) => {
      phase = 'failed';
      accepting = false;
      await killChild();
      port = null;
      ompVersion = null;
      throw error;
    }).finally(() => {
      const startupFinished = startupPromise;
      startupPromise = null;
      startupController = null;
      if (fromRestart && startupFinished !== null && phase === 'failed' && lifecycle === myLifecycle) scheduleRestart();
    });
    return startupPromise;
  };

  const holdRestarts = (): void => {
    restartHolds += 1;
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  };
  const resumeRestarts = (): void => {
    if (restartHolds === 0) return;
    restartHolds -= 1;
    if (restartHolds > 0) return;
    if (phase === 'stopping' || phase === 'stopped' || child || startupPromise) return;
    void start(true).catch(() => { void 0; });
  };

  const stop = async (): Promise<void> => {
    lifecycle += 1;
    clearRestartTimer();
    restartHolds = 0;
    restartAttempts = 0;
    accepting = false;
    authorization.close();
    startupController?.abort();
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      phase = 'stopping';
      if (startupPromise) { try { await startupPromise; } catch { void 0; } }
      await killChild();
      secret = null;
      port = null;
      ompVersion = null;
      relocationScopes.clear();
      forkTickets.clear();
      scopes.clear();
      workspaceScopes.clear();
      if (ownsPolicyStore && policyStore) { policyStore.close(); policyStore = null; ownsPolicyStore = false; }
      phase = 'stopped';
    })().finally(() => { stopPromise = null; });
    return stopPromise;
  };
  const restart = async (): Promise<AgentServiceSupervisorState> => { await stop(); return start(); };
  const request = async (requestPath: string, init: RequestInit = {}): Promise<Response> => {
    assertAdmitted();
    if (!requestPath.startsWith('/')) throw new Error('Agent service request requires an absolute path');
    const requestedChild = child;
    const requestedLifecycle = lifecycle;
    const method = String(init.method ?? 'GET').toUpperCase();
    let capture: BootstrapScopeCapture | undefined;
    let workspaceCapture: { scope: WorkspaceScopeCaptureEntry['scope']; prior: WorkspaceScopeCaptureEntry | undefined } | undefined;
    let forkTicket: ForkTicket | null = null;
    let relocationAction: 'commit' | 'rollback' | undefined;
    const workspace = /^\/internal\/workspaces\/([^/]+)$/.exec(requestPath);
    const restartWorker = /^\/internal\/workers\/([^/]+)\/restart$/.exec(requestPath);
    const reopenSession = /^\/internal\/sessions\/([^/]+)\/reopen$/.exec(requestPath);
    const forkSession = method === 'POST' ? /^\/internal\/sessions\/([^/]+)\/fork$/.exec(requestPath) : null;
    const relocationPrepare = method === 'POST' ? /^\/internal\/sessions\/([^/]+)\/relocation\/prepare$/.exec(requestPath) : null;
    const relocationFinalize = method === 'POST' ? /^\/internal\/sessions\/([^/]+)\/relocation\/finalize$/.exec(requestPath) : null;
    const rootBootstrap = method === 'POST' && (requestPath === '/internal/sessions' || requestPath === '/internal/workers' || Boolean(restartWorker) || Boolean(reopenSession));
    if (rootBootstrap || (workspace && method === 'POST') || relocationPrepare) {
      if (!isString(init.body)) throw new Error('Invalid Host bootstrap');
      let parsedJson: JsonValue;
      try {
        parsedJson = z.json().parse(JSON.parse(init.body));
      } catch {
        throw new Error('Invalid Host bootstrap');
      }
      if (relocationPrepare) {
        const parsed = HostSessionRelocationPrepareSchema.safeParse(parsedJson);
        if (!parsed.success) throw new Error('Invalid Host bootstrap');
        const sessionId = decodeURIComponent(relocationPrepare[1] ?? '');
        if (parsed.data.destination.rootSessionId !== sessionId) throw new Error('Invalid Host relocation scope');
        const destination = {
          ...parsed.data.destination,
          cwd: await fs.realpath(parsed.data.destination.cwd),
          agentDirectory: await fs.realpath(parsed.data.destination.agentDirectory),
        };
        capture = captureScope(destination, true);
        relocationScopes.set(sessionId, { prior: capture.prior });
        init = { ...init, body: JSON.stringify({ ...parsed.data, destination }) };
      } else if (workspace) {
        const parsed = HostWorkspaceBootstrapSchema.safeParse(parsedJson);
        if (!parsed.success) throw new Error('Invalid Host bootstrap');
        const body = {
          ...parsed.data,
          cwd: await fs.realpath(parsed.data.cwd),
          agentDirectory: await fs.realpath(parsed.data.agentDirectory),
        };
        const workspaceId = decodeURIComponent(workspace[1] ?? '');
        const captured = Object.freeze({
          projectId: body.projectId,
          workspaceId,
          cwd: body.cwd,
          agentDirectory: body.agentDirectory,
          agentDirectoryId: body.agentDirectoryId,
        });
        const prior = workspaceScopes.get(workspaceId);
        if (prior && !isDeepStrictEqual(prior.scope, captured)) throw new Error('Host workspace scope cannot change');
        workspaceCapture = { scope: captured, prior };
        init = { ...init, body: JSON.stringify(body) };
      } else {
        const schema = reopenSession
          ? HostSessionBootstrapSchema.omit({ sessionFile: true })
          : requestPath === '/internal/sessions'
            ? HostSessionBootstrapSchema
            : WorkerBootstrapSchema;
        const parsed = schema.safeParse(parsedJson);
        if (!parsed.success) throw new Error('Invalid Host bootstrap');
        const body = {
          ...parsed.data,
          cwd: await fs.realpath(parsed.data.cwd),
          agentDirectory: await fs.realpath(parsed.data.agentDirectory),
        };
        if (restartWorker && decodeURIComponent(restartWorker[1] ?? '') !== body.rootSessionId) throw new Error('Invalid Host restart scope');
        if (reopenSession && decodeURIComponent(reopenSession[1] ?? '') !== body.rootSessionId) throw new Error('Invalid Host reopen scope');
        if (body.agentDirectoryId === undefined) {
          const registered = workspaceScopes.get(body.workspaceId)?.scope;
          if (registered && registered.projectId === body.projectId && registered.cwd === body.cwd
            && registered.agentDirectory === body.agentDirectory) {
            body.agentDirectoryId = registered.agentDirectoryId;
          }
        }
        capture = captureScope(body);
        init = { ...init, body: JSON.stringify(body) };
      }
    } else if (relocationFinalize) {
      if (!isString(init.body)) throw new Error('Invalid Host relocation finalization');
      const parsed = HostSessionRelocationFinalizeSchema.safeParse(JSON.parse(init.body));
      if (!parsed.success) throw new Error('Invalid Host relocation finalization');
      relocationAction = parsed.data.action;
      if (relocationAction === 'rollback') {
        const sessionId = decodeURIComponent(relocationFinalize[1] ?? '');
        const transition = relocationScopes.get(sessionId);
        if (transition?.prior) scopes.set(sessionId, transition.prior);
      }
    } else if (forkSession) {
      const sourceSessionId = decodeURIComponent(forkSession[1] ?? '');
      const sourceScope = scopes.get(sourceSessionId);
      if (!isString(init.body)) throw new Error('Invalid Host fork request');
      let parsedFork: z.infer<typeof ForkInputSchema>;
      try {
        parsedFork = ForkInputSchema.parse(JSON.parse(init.body));
      } catch {
        throw new Error('Invalid Host fork request');
      }
      if (!sourceScope || parsedFork.sourceSessionId !== sourceSessionId) throw new Error('Fork requires an authorized source session scope');
      forkTicket = { id: crypto.randomUUID(), sourceSessionId, captured: sourceScope, childId: null, childScope: null };
      const tickets = forkTickets.get(sourceSessionId) ?? [];
      tickets.push(forkTicket);
      forkTickets.set(sourceSessionId, tickets);
      init = { ...init, body: JSON.stringify({ ...parsedFork, forkTicketId: forkTicket.id }) };
    }
    const removeForkTicket = (ticket: ForkTicket) => {
      const tickets = forkTickets.get(ticket.sourceSessionId);
      if (!tickets) return;
      const index = tickets.indexOf(ticket);
      if (index >= 0) tickets.splice(index, 1);
      if (!tickets.length) forkTickets.delete(ticket.sourceSessionId);
    };
    const releaseFork = () => {
      const ticket = forkTicket;
      if (!ticket) return;
      removeForkTicket(ticket);
      forkTicket = null;
      if (ticket.childId && scopes.get(ticket.childId) === ticket.childScope) scopes.delete(ticket.childId);
    };
    const settleFork = async (response: Response) => {
      const ticket = forkTicket;
      if (!ticket) return;
      if (!response.ok) { releaseFork(); return; }
      let ack: z.infer<typeof HostSessionForkAckSchema>;
      try {
        ack = HostSessionForkAckSchema.parse(await response.clone().json());
      } catch {
        releaseFork();
        throw new Error('Invalid Host fork admission');
      }
      if (child !== requestedChild || lifecycle !== requestedLifecycle || !accepting
        || ack.sessionId !== ack.rootSessionId || ack.sourceSessionId !== ticket.sourceSessionId
        || (ticket.childId !== null && ticket.childId !== ack.sessionId)) {
        releaseFork();
        throw new Error('Invalid Host fork admission');
      }
      if (!ticket.childId) {
        if (scopes.has(ack.sessionId) || ack.sessionId === ticket.sourceSessionId) { releaseFork(); throw new Error('Invalid Host fork admission'); }
        const childScope = Object.freeze({ ...ticket.captured, rootSessionId: ack.sessionId });
        scopes.set(ack.sessionId, childScope);
        ticket.childId = ack.sessionId;
        ticket.childScope = childScope;
      }
      removeForkTicket(ticket);
      forkTicket = null;
    };
    const rollback = () => {
      if (!capture || scopes.get(capture.captured.rootSessionId) !== capture.captured) return;
      if (capture.prior) scopes.set(capture.captured.rootSessionId, capture.prior);
      else scopes.delete(capture.captured.rootSessionId);
    };
    const headers = new Headers(init.headers ?? {});
    if (secret) headers.set(SECRET_HEADER, secret);
    try {
      assertAdmitted();
      if (child !== requestedChild || lifecycle !== requestedLifecycle) throw new Error('Agent service request scope expired');
      const response = await fetchImpl(`http://127.0.0.1:${port}${requestPath}`, { ...init, headers });
      if (!response.ok) {
        rollback();
        if (relocationPrepare) relocationScopes.delete(decodeURIComponent(relocationPrepare[1] ?? ''));
      }
      if (forkTicket) await settleFork(response);
      if (response.ok && workspaceCapture) {
        const registered = HostWorkspaceRegisteredSchema.safeParse(await response.clone().json());
        if (!registered.success || registered.data.workspaceId !== workspaceCapture.scope.workspaceId
          || registered.data.projectId !== workspaceCapture.scope.projectId || registered.data.agentDirectoryId !== workspaceCapture.scope.agentDirectoryId
          || (workspaceCapture.prior && registered.data.authorizationRootId !== workspaceCapture.prior.rootSessionId)
          || child !== requestedChild || lifecycle !== requestedLifecycle || !accepting) {
          throw new Error('Invalid Host workspace admission');
        }
        const captured = captureScope({ ...workspaceCapture.scope, rootSessionId: registered.data.authorizationRootId });
        workspaceScopes.set(workspaceCapture.scope.workspaceId, { scope: workspaceCapture.scope, rootSessionId: captured.captured.rootSessionId });
      }
      if (response.ok && relocationFinalize) relocationScopes.delete(decodeURIComponent(relocationFinalize[1] ?? ''));
      if (response.ok && method === 'DELETE') {
        const deleted = /^\/(?:api\/agent\/v1\/sessions|internal\/workers)\/([^/]+)$/.exec(requestPath);
        if (deleted && child === requestedChild && lifecycle === requestedLifecycle) scopes.delete(decodeURIComponent(deleted[1] ?? ''));
      }
      return response;
    } catch (error) {
      releaseFork();
      rollback();
      if (relocationPrepare) relocationScopes.delete(decodeURIComponent(relocationPrepare[1] ?? ''));
      throw error;
    }
  };
  return {
    start,
    stop,
    restart,
    request,
    holdRestarts,
    resumeRestarts,
    getState: state,
    getDiagnostics: () => diagnostics.slice(),
  };
};
