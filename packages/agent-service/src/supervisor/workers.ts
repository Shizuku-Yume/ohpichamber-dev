import { randomUUID } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { promisify } from 'node:util';
import { z } from 'zod';
import { UsageWorkerBootstrapSchema, CompletionWorkerBootstrapSchema, WorkerBootstrapSchema, WorkerBootstrapMessageSchema, WorkerOperationSchema, WorkerReplySchema, WorkerPolicyResultSchema } from '../protocol.ts';
import type { CompletionWorkerBootstrap, WorkerBootstrap, WorkerApprovalPolicy, WorkerInfo, WorkerOperation, WorkerOperationResult, WorkerPolicyRequest, WorkerPolicyResult, WorkerInteraction } from '../protocol.ts';
import type { ProjectionSeed, ProjectionInput } from '../projection/protocol.ts';
import type { NativeOperationDescriptor, HostActionRequest, HostActionResult, HostNativePolicySnapshot } from './host-authorization-protocol.ts';
import { describeNativeOperation } from '../worker/native-policy-descriptor.ts';
import type { JsonObject, ProblemCode } from '@openchamber/agent-contract';
import type { NativeApprovalGrant } from '../native-policy-protocol.ts';

export class WorkerOperationError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, readonly details?: JsonObject, message = 'SDK worker operation failed') { super(message); }
}

interface RestartReservation {
  release: () => void;
  assertIdle: () => Promise<void>;
}

interface WorkerLifecycleCallbacks {
  onOpened?: (rootSessionId: string, generation: string, sessionFile: string, seed: ProjectionSeed) => void;
  onEvents?: (rootSessionId: string, generation: string, inputs: ProjectionInput[]) => void;
  onInteraction?: (rootSessionId: string, generation: string, interaction: WorkerInteraction) => void;
  onSubagent?: (rootSessionId: string, generation: string, subagent: { subagentId: string; toolCallId?: string; status: 'started' | 'completed' | 'failed' | 'aborted'; role: string; solutionSpace?: string; sessionFile?: string }) => void;
  onExit?: (rootSessionId: string, generation: string) => void;
}

export type StatelessWorkerInput = Omit<CompletionWorkerBootstrap, 'type' | 'workerGeneration' | 'authorizationRootId'> & {
  rootSessionId: string;
  env?: Record<string, string>;
};
export type RegisteredWorkerInfo = WorkerInfo & { kind: 'session' | 'stateless' | 'usage' };
export type WorkerAuthorizationScope = Pick<WorkerBootstrap, 'rootSessionId' | 'projectId' | 'workspaceId' | 'cwd' | 'agentDirectory' | 'agentDirectoryId'> & { workerGeneration: string };

type WorkerInput = { kind: 'session'; input: WorkerBootstrap } | { kind: 'stateless'; input: StatelessWorkerInput } | { kind: 'usage'; input: StatelessWorkerInput };
type WorkerEntry = WorkerInput & {
  info: WorkerInfo;
  child: ChildProcess;
  ready: Promise<void>;
  rejectReady: (error: Error) => void;
  exited: Promise<void>;
  stopping?: Promise<boolean>;
  pending: Map<string, { resolve: (result: WorkerOperationResult) => void; reject: (error: Error) => void }>;
  policySnapshot?: HostNativePolicySnapshot;
  environment: NodeJS.ProcessEnv;
  lastActivityAt: number;
};
type ActionHandle = { entry: WorkerEntry; controller: AbortController };

/** The Task17 measurement fixes these production values; tests may override them. */
export const WORKER_CAPACITY_POLICY = {
  maxActiveRootWorkers: 5,
  idleEvictionTimeoutMs: 600_000,
  reapIntervalMs: 30_000,
} as const;
export type WorkerCapacityPolicy = { readonly [K in keyof typeof WORKER_CAPACITY_POLICY]: number };

export type WorkerDiagnostic = { level: 'error' | 'warn' | 'info'; rootSessionId: string; workerGeneration: string; message: string };

export interface WorkerRegistryOptions {
  workerEntrypoint: string;
  workerRuntime?: string;
  onDiagnostic?: (entry: WorkerDiagnostic) => void;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
  policyCheck?: (rootSessionId: string, request: WorkerPolicyRequest, descriptor?: NativeOperationDescriptor) => Promise<WorkerPolicyResult>;
  invokeHostAction?: (rootSessionId: string, request: HostActionRequest, signal: AbortSignal) => Promise<HostActionResult>;
  consumeApprovalGrant?: (rootSessionId: string, generation: string, request: Extract<WorkerPolicyRequest, { type: 'tool' }>) => NativeApprovalGrant | undefined;
  prepareBootstrap?: (input: WorkerBootstrap) => Promise<WorkerBootstrap>;
  callbacks?: WorkerLifecycleCallbacks;
  /** Absent only in registry tests that model no session activity. */
  isSessionIdle?: (rootSessionId: string) => boolean;
  capacityPolicy?: WorkerCapacityPolicy;
}

const defaultExecFileAsync = promisify(execFile);
type ProcessKill = (pid: number, signal?: NodeJS.Signals | number) => void;

export const windowsProcessTreeKillArgs = (pid: number): string[] => {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) throw new Error('Unsafe process id');
  return ['/T', '/F', '/PID', String(pid)];
};

export const terminateWorkerProcessTree = async (
  pid: number | undefined,
  signal: NodeJS.Signals = 'SIGKILL',
  { platform = process.platform, execFileAsync = defaultExecFileAsync, processKill = process.kill as ProcessKill } = {},
): Promise<boolean> => {
  if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return false;
  if (platform === 'win32') {
    try {
      await execFileAsync('taskkill', windowsProcessTreeKillArgs(pid), { windowsHide: true });
      return true;
    } catch { return false; }
  }
  if (platform !== 'linux' && platform !== 'darwin') return false;
  try {
    processKill(-pid, signal);
    return true;
  } catch { return false; }
};

export const waitForWorkerProcessTree = async (
  pid: number | undefined,
  { platform = process.platform, processKill = process.kill as ProcessKill, graceMs = 250 } = {},
): Promise<boolean> => {
  if (platform === 'win32' || pid === undefined || !Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return true;
  const deadline = Date.now() + graceMs;
  const groupAlive = () => {
    try { processKill(-pid, 0); return true; } catch { return false; }
  };
  while (groupAlive() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  return !groupAlive();
};
function defaultWorkerRuntime(): string {
  if (process.execPath.includes('bun')) return process.execPath;
  return Bun.which('bun') ?? process.execPath;
}

// A worker runs model-invoked tools, including shells, so it must not inherit
// the service's whole environment: the Host's UI password and pairing tokens
// would be readable from the worker process. Only process needs (Bun, the OMP
// profile and XDG paths, locale, proxies and trust roots) are inherited.
// Provider credentials are not inherited from the Host's own environment; the
// Host-authorized per-directory overlay (`input.env`, which enterprise mode
// blanks) and OMP AuthStorage are the supported sources. This keeps unrelated
// Host tokens written as `*_TOKEN` out of a model-invoked shell while still
// letting a project configure its own provider environment.
const WORKER_ENV_KEYS = Object.freeze([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'USERPROFILE', 'SHELL', 'TERM', 'TMPDIR', 'TEMP', 'TMP',
  'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'TZ',
  'SystemRoot', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'WINDIR', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'ProgramFiles', 'ProgramFiles(x86)',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'CURL_CA_BUNDLE',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR',
  'OMP_PROFILE', 'PI_PROFILE', 'PI_CONFIG_DIR',
  'BUN_INSTALL', 'BUN_INSTALL_BIN',
]);

// A directory overlay comes from user/project settings, but it must not be able
// to forge the process-tree proof, the service token, or the worker's own
// agent-directory binding. OMP_PROFILE/PI_PROFILE remain part of the
// Host-authorized overlay: named profiles intentionally select their own
// config/plugin roots, while settings and AuthStorage keep the explicit agent
// directory captured by the Host.
const RESERVED_WORKER_ENV_KEYS: Record<string, true> = Object.freeze({
  ohpichamber_internal_secret: true,
  openchamber_managed_process_token: true,
  pi_coding_agent_dir: true,
});

const buildWorkerEnvironment = (input: Pick<WorkerBootstrap, 'env' | 'agentDirectory'>, sourceEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of WORKER_ENV_KEYS) {
    const value = sourceEnv[key];
    if (value !== undefined) environment[key] = value;
  }
  Object.assign(environment, input.env);
  // Environment names are case-insensitive on Windows; the overlay cannot smuggle
  // a second variant of a reserved name.
  for (const key of Object.keys(environment)) {
    if (Object.hasOwn(RESERVED_WORKER_ENV_KEYS, key.toLowerCase())) delete environment[key];
  }
  environment.PI_CODING_AGENT_DIR = input.agentDirectory;
  const managedToken = sourceEnv.OPENCHAMBER_MANAGED_PROCESS_TOKEN;
  if (managedToken !== undefined) environment.OPENCHAMBER_MANAGED_PROCESS_TOKEN = managedToken;
  return environment;
};

async function waitWithin(operation: Promise<void>, milliseconds: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Worker operation timed out')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class WorkerRegistry {
  // Deliberately not named `entries`: test doubles extend this class and
  // publish their own flat `entries` map, which must not shadow the live
  // process entries the reaper and lifecycle paths own.
  private readonly workerEntries = new Map<string, WorkerEntry>();
  private readonly mutations = new Map<string, Promise<void>>();
  private readonly actions = new Map<string, ActionHandle>();
  private readonly restartReservations = new Map<string, string>();
  private readonly pendingRootAdmissions = new Set<string>();
  private readonly capacityPolicy: WorkerCapacityPolicy;
  private readonly reapTimer: NodeJS.Timeout;
  private reaping = false;
  private closing = false;

  constructor(private readonly options: WorkerRegistryOptions) {
    this.capacityPolicy = options.capacityPolicy ?? WORKER_CAPACITY_POLICY;
    this.reapTimer = setInterval(() => { void this.reapIdleWorkers(); }, this.capacityPolicy.reapIntervalMs);
    this.reapTimer.unref();
  }

  list(): RegisteredWorkerInfo[] {
    return [...this.workerEntries.values()].map(entry => ({ ...entry.info, kind: entry.kind }));
  }

  info(rootSessionId: string): WorkerInfo | undefined {
    const entry = this.workerEntries.get(rootSessionId);
    return entry === undefined ? undefined : { ...entry.info };
  }

  bootstrap(rootSessionId: string): WorkerBootstrap | undefined {
    const entry = this.workerEntries.get(rootSessionId);
    return entry?.kind === 'session' ? structuredClone(entry.input) : undefined;
  }
  authorizationPolicy(workspaceId: string, agentDirectoryId: string, rootSessionId?: string): HostNativePolicySnapshot {
    const candidates = rootSessionId === undefined ? [...this.workerEntries.values()] : [this.workerEntries.get(rootSessionId)];
    const entry = candidates.find(candidate => candidate?.kind !== 'usage' && candidate?.input.workspaceId === workspaceId && candidate.input.agentDirectoryId === agentDirectoryId && candidate.child.connected && (candidate.info.state === 'starting' || candidate.info.state === 'ready') && candidate.policySnapshot !== undefined);
    if (!entry?.policySnapshot) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    return structuredClone(entry.policySnapshot);
  }

  authorizationScope(rootSessionId: string): WorkerAuthorizationScope | undefined {
    const entry = this.workerEntries.get(rootSessionId);
    if (this.closing || !entry || entry.kind === 'usage' || !entry.child.connected || (entry.info.state !== 'starting' && entry.info.state !== 'ready')) return undefined;
    const { projectId, workspaceId, cwd, agentDirectory, agentDirectoryId } = entry.input;
    return { rootSessionId, workerGeneration: entry.info.workerGeneration, projectId, workspaceId, cwd, agentDirectory, agentDirectoryId };
  }

  reserveRestart(rootSessionId: string, generation: string): RestartReservation {
    const entry = this.workerEntries.get(rootSessionId);
    if (this.closing || !entry || entry.kind !== 'session' || entry.info.state !== 'ready' || !entry.child.connected)
      throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    if (entry.info.workerGeneration !== generation) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
    if (this.restartReservations.has(rootSessionId) || this.mutations.has(rootSessionId) || entry.pending.size > 0
      || [...this.actions.values()].some(action => action.entry === entry))
      throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    this.restartReservations.set(rootSessionId, generation);
    return {
      release: () => {
        if (this.restartReservations.get(rootSessionId) === generation) this.restartReservations.delete(rootSessionId);
      },
      assertIdle: async () => {
        if (this.workerEntries.get(rootSessionId) !== entry || entry.info.state !== 'ready' || this.restartReservations.get(rootSessionId) !== generation)
          throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
        const result = await this.dispatch(entry, { type: 'shell', operation: { type: 'snapshot' } });
        if (this.workerEntries.get(rootSessionId) !== entry || entry.info.state !== 'ready') throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
        if (result.type !== 'shell' || result.result.type !== 'snapshot') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
        if (result.result.snapshot.running.length > 0 || [...this.actions.values()].some(action => action.entry === entry))
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
      },
    };
  }

  async request(rootSessionId: string, operation: WorkerOperation, expectedGeneration?: string): Promise<WorkerOperationResult> {
    const parsed = WorkerOperationSchema.parse(operation);
    const entry = this.workerEntries.get(rootSessionId);
    if (entry && this.restartReservations.get(rootSessionId) === entry.info.workerGeneration)
      throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    if (entry && expectedGeneration !== undefined && expectedGeneration !== entry.info.workerGeneration) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
    if (this.closing || !entry || entry.info.state !== 'ready' || !entry.child.connected) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    return this.dispatch(entry, parsed);
  }

  /**
   * Serialize with root lifecycle mutations. Shell start uses this so a
   * background job cannot be admitted between the idle probe and stopEntry.
   */
  requestSerialized(rootSessionId: string, operation: WorkerOperation, expectedGeneration?: string): Promise<WorkerOperationResult> {
    return this.withRoot(rootSessionId, () => this.request(rootSessionId, operation, expectedGeneration));
  }

  private dispatch(entry: WorkerEntry, operation: WorkerOperation): Promise<WorkerOperationResult> {
    const commandId = randomUUID();
    entry.lastActivityAt = Date.now();
    const result = new Promise<WorkerOperationResult>((resolve, reject) => entry.pending.set(commandId, { resolve, reject }));
    entry.child.send({ type: 'operation', workerGeneration: entry.info.workerGeneration, commandId, operation }, error => {
      if (!error) return;
      const pending = entry.pending.get(commandId); entry.pending.delete(commandId); pending?.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE'));
    });
    return result;
  }

  /**
   * A root may start only when fewer than the measured cap of session workers
   * are live. The synchronous reservation closes the gap between this check and
   * the asynchronous launch, so simultaneous opens cannot oversubscribe it.
   * Stateless catalog workers are per-workspace overhead and never count.
   */
  private reserveSessionCapacity(rootSessionId: string): void {
    const active = new Set<string>();
    for (const entry of this.workerEntries.values()) {
      if (entry.kind === 'session' && entry.info.rootSessionId !== rootSessionId
        && entry.child.exitCode === null && entry.child.signalCode === null) active.add(entry.info.rootSessionId);
    }
    for (const pending of this.pendingRootAdmissions) if (pending !== rootSessionId) active.add(pending);
    const maxActiveRootWorkers = this.capacityPolicy.maxActiveRootWorkers;
    if (active.size >= maxActiveRootWorkers) {
      throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', {
        reason: 'worker_capacity', activeRootWorkers: active.size, maxActiveRootWorkers,
      }, `Session capacity is full (${active.size} of ${maxActiveRootWorkers} active). Close another session or try again later.`);
    }
    this.pendingRootAdmissions.add(rootSessionId);
  }

  private async reapIdleWorkers(): Promise<void> {
    if (this.closing || this.reaping) return;
    this.reaping = true;
    try {
      const now = Date.now();
      const candidates = [...this.workerEntries.values()].filter(entry => entry.kind === 'session'
        && entry.info.state === 'ready' && entry.child.connected
        && now - entry.lastActivityAt >= this.capacityPolicy.idleEvictionTimeoutMs);
      for (const candidate of candidates) {
        try { await this.evictIfIdle(candidate); } catch { /* one failed candidate must not stop the scan */ }
      }
    } finally { this.reaping = false; }
  }

  private async evictIfIdle(candidate: WorkerEntry): Promise<void> {
    if (candidate.kind !== 'session' || this.closing || !this.sessionIsIdle(candidate.info.rootSessionId)) return;
    await this.withRoot(candidate.info.rootSessionId, async () => {
      const entry = this.workerEntries.get(candidate.info.rootSessionId);
      if (entry !== candidate || entry.kind !== 'session' || this.closing || entry.info.state !== 'ready' || !entry.child.connected) return;
      if (Date.now() - entry.lastActivityAt < this.capacityPolicy.idleEvictionTimeoutMs) return;
      if (this.restartReservations.has(entry.info.rootSessionId) || entry.pending.size > 0
        || [...this.actions.values()].some(action => action.entry === entry)) return;
      if (!this.sessionIsIdle(entry.info.rootSessionId)) return;
      // A background shell job outlives its start operation, so it is invisible
      // to the pending/action checks above. The worker's own snapshot is the
      // authority; a missing or failed snapshot means "not proven idle".
      if (!(await this.hasNoRunningShellJobs(entry))) return;
      if (this.workerEntries.get(entry.info.rootSessionId) !== entry || entry.info.state !== 'ready' || this.closing
        || this.restartReservations.has(entry.info.rootSessionId) || entry.pending.size > 0
        || [...this.actions.values()].some(action => action.entry === entry)
        || !this.sessionIsIdle(entry.info.rootSessionId)) return;
      await this.stopEntry(entry);
    });
  }

  /**
   * Probe through the worker's shell owner rather than guessing from session
   * state. A missing or failed probe keeps the worker alive. The reply counts
   * as worker activity, so a running job is re-probed after the next idle
   * window rather than on every scan.
   */
  private async hasNoRunningShellJobs(entry: WorkerEntry): Promise<boolean> {
    const commandId = randomUUID();
    let timer: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        new Promise<WorkerOperationResult>((resolve, reject) => {
          entry.pending.set(commandId, { resolve, reject });
          entry.child.send({ type: 'operation', workerGeneration: entry.info.workerGeneration, commandId,
            operation: { type: 'shell', operation: { type: 'snapshot' } } }, error => {
            if (!error) return;
            const pending = entry.pending.get(commandId);
            entry.pending.delete(commandId);
            pending?.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE'));
          });
        }),
        new Promise<undefined>(resolve => {
          timer = setTimeout(() => resolve(undefined), this.options.stopTimeoutMs ?? 5_000);
          timer.unref();
        }),
      ]);
      return result?.type === 'shell' && result.result.type === 'snapshot' && result.result.snapshot.running.length === 0;
    } catch { return false; }
    finally { clearTimeout(timer); entry.pending.delete(commandId); }
  }

  private sessionIsIdle(rootSessionId: string): boolean {
    try { return this.options.isSessionIdle?.(rootSessionId) ?? true; }
    catch { return false; }
  }

  async start(input: WorkerBootstrap, replace = false, approvalPolicies?: WorkerApprovalPolicy[], restartGeneration?: string): Promise<WorkerInfo> {
    return this.withRoot(input.rootSessionId, async () => {
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      const previous = this.workerEntries.get(input.rootSessionId);
      const reserved = this.restartReservations.get(input.rootSessionId);
      if (reserved !== undefined && (restartGeneration !== reserved || previous?.info.workerGeneration !== reserved))
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
      if (restartGeneration !== undefined && (reserved !== restartGeneration || previous?.info.workerGeneration !== restartGeneration))
        throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if (restartGeneration !== undefined && previous && (previous.pending.size > 0 || [...this.actions.values()].some(action => action.entry === previous)))
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
      if (previous && previous.kind !== 'session') throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if (previous?.info.state === 'ready' && !replace) return { ...previous.info };
      this.reserveSessionCapacity(input.rootSessionId);
      try {
        if (previous) {
          const clean = await this.stopEntry(previous);
          if (restartGeneration !== undefined && !clean) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED');
        }
        if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
        const prepared = WorkerBootstrapSchema.parse(this.options.prepareBootstrap ? await this.options.prepareBootstrap(input) : input);
        if (prepared.rootSessionId !== input.rootSessionId) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
        if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
        return await this.launch({ kind: 'session', input: prepared }, approvalPolicies);
      } finally {
        this.pendingRootAdmissions.delete(input.rootSessionId);
      }
    });
  }

  async startStateless(input: StatelessWorkerInput, replace = false): Promise<WorkerInfo> {
    const environment = this.workerEnvironment(input);
    const current = this.workerEntries.get(input.rootSessionId);
    if (current?.kind === 'stateless' && this.mutations.has(input.rootSessionId)
      && (replace || !this.sameStatelessIdentity(current, input, environment)))
      throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
    return this.withRoot(input.rootSessionId, async () => {
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      const previous = this.workerEntries.get(input.rootSessionId);
      if (previous && previous.kind !== 'stateless') throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if (previous?.info.state === 'ready' && !replace && this.sameStatelessIdentity(previous, input, environment)) return { ...previous.info };
      if (previous) {
        if (previous.pending.size > 0 || [...this.actions.values()].some(action => action.entry === previous))
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
        if (!await this.stopEntry(previous)) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      }
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      return this.launch({ kind: 'stateless', input: structuredClone(input) }, undefined, environment);
    });
  }

  private sameStatelessIdentity(entry: Extract<WorkerEntry, { kind: 'stateless' }>, input: StatelessWorkerInput, environment: NodeJS.ProcessEnv): boolean {
    const previous = entry.input;
    // Revision cursors describe persisted catalogs, not the process's execution identity.
    return previous.rootSessionId === input.rootSessionId && previous.projectId === input.projectId
      && previous.workspaceId === input.workspaceId && previous.cwd === input.cwd
      && previous.agentDirectory === input.agentDirectory && previous.agentDirectoryId === input.agentDirectoryId
      && previous.mcpConfigPath === input.mcpConfigPath && isDeepStrictEqual(entry.environment, environment);
  }

  private workerEnvironment(input: WorkerInput['input']): NodeJS.ProcessEnv {
    return buildWorkerEnvironment(input);
  }

  async startUsage(input: StatelessWorkerInput): Promise<WorkerInfo> {
    return this.withRoot(input.rootSessionId, async () => {
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      const previous = this.workerEntries.get(input.rootSessionId);
      if (previous && previous.kind !== 'usage') throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if (previous?.info.state === 'ready') return { ...previous.info };
      if (previous) await this.stopEntry(previous);
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      return this.launch({ kind: 'usage', input: structuredClone(input) });
    });
  }

  async stop(rootSessionId: string): Promise<boolean> {
    return this.withRoot(rootSessionId, async () => {
      const entry = this.workerEntries.get(rootSessionId);
      if (entry && this.restartReservations.get(rootSessionId) === entry.info.workerGeneration)
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT');
      return entry ? this.stopEntry(entry) : true;
    });
  }

  async close(): Promise<void> {
    clearInterval(this.reapTimer);
    this.closing = true;
    await Promise.all([...this.workerEntries.values()].map(entry => this.stopEntry(entry)));
    await Promise.all(this.mutations.values());
  }

  private async withRoot<T>(rootSessionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.mutations.get(rootSessionId);
    const finished = Promise.withResolvers<void>();
    this.mutations.set(rootSessionId, finished.promise);
    try {
      if (previous) await previous;
      return await operation();
    } finally {
      finished.resolve();
      if (this.mutations.get(rootSessionId) === finished.promise) this.mutations.delete(rootSessionId);
    }
  }

  private async launch(owner: WorkerInput, approvalPolicies?: WorkerApprovalPolicy[], environment = this.workerEnvironment(owner.input)): Promise<WorkerInfo> {
    const { input } = owner;
    const workerGeneration = randomUUID();
    const { env: _privateEnvironment, ...bootstrap } = input;
    const { rootSessionId: authorizationRootId, ...statelessBootstrap } = bootstrap;
    const command = owner.kind === 'session'
      ? WorkerBootstrapMessageSchema.parse({ ...bootstrap, type: 'bootstrap', workerGeneration, approvalPolicies })
      : owner.kind === 'usage'
        ? UsageWorkerBootstrapSchema.parse({ ...statelessBootstrap, authorizationRootId, type: 'usage.bootstrap', workerGeneration })
        : CompletionWorkerBootstrapSchema.parse({ ...statelessBootstrap, authorizationRootId, type: 'completion.bootstrap', workerGeneration });
    const ready = Promise.withResolvers<void>();
    const exited = Promise.withResolvers<void>();
    const workerRuntime = this.options.workerRuntime ?? defaultWorkerRuntime();
    const workerArgs = /(?:^|[\\/])bun(?:\.exe)?$/i.test(workerRuntime) ? ['--no-env-file', this.options.workerEntrypoint] : [this.options.workerEntrypoint];
    const child = spawn(workerRuntime, workerArgs, {
      cwd: input.cwd,
      env: environment,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    // Worker stderr is the only diagnostic channel; keep it line-bounded so a
    // noisy SDK cannot grow the service or the Host log without limit.
    const maxDiagnosticMessage = 2_048;
    const maxStderrBuffer = 8_192;
    let stderrBuffer = '';
    // Only normalized event classes cross the process boundary. Free-form
    // stderr may contain prompts or tool output and is deliberately dropped.
    const DiagnosticEventSchema = z.looseObject({
      type: z.enum(['mcp.runtime.failure', 'openchamber.diagnostic']),
      level: z.enum(['error', 'warn', 'info']).optional(),
      code: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/).optional(),
      error: z.unknown().optional(),
    });
    const ErrorCodeSchema = z.looseObject({ code: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/) });
    const emitDiagnostic = (line: string) => {
      const text = line.trim();
      if (!text) return;
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return; }
      const event = DiagnosticEventSchema.safeParse(parsed);
      if (!event.success) return;
      const level = event.data.type === 'mcp.runtime.failure' ? 'error' : event.data.level ?? 'error';
      const code = event.data.type === 'mcp.runtime.failure'
        ? ErrorCodeSchema.safeParse(event.data.error).data?.code ?? 'UNKNOWN'
        : event.data.code ?? 'UNKNOWN';
      const message = event.data.type === 'mcp.runtime.failure' ? `MCP runtime failure (${code})` : code;
      try {
        this.options.onDiagnostic?.({ level, rootSessionId: input.rootSessionId, workerGeneration, message: message.slice(0, maxDiagnosticMessage) });
      } catch { /* diagnostics must never affect worker lifecycle */ }
    };
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const bounded = Buffer.isBuffer(chunk) ? chunk.subarray(0, maxStderrBuffer) : Buffer.from(String(chunk).slice(0, maxStderrBuffer));
      stderrBuffer += bounded.toString();
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? '';
      if (stderrBuffer.length >= maxStderrBuffer) {
        emitDiagnostic(stderrBuffer);
        stderrBuffer = '';
        return;
      }
      for (const line of lines) emitDiagnostic(line);
    });
    const entry: WorkerEntry = {
      ...owner,
      info: { rootSessionId: authorizationRootId, projectId: input.projectId, workspaceId: input.workspaceId, workerGeneration, state: 'starting' },
      child,
      ready: ready.promise,
      rejectReady: ready.reject,
      exited: exited.promise,
      pending: new Map(),
      environment,
      lastActivityAt: Date.now(),
    };
    this.workerEntries.set(input.rootSessionId, entry);
    child.on('message', raw => {
      const reply = WorkerReplySchema.safeParse(raw);
      if (!reply.success || reply.data.workerGeneration !== workerGeneration) return;
      if (this.workerEntries.get(input.rootSessionId) !== entry) return;
      if (entry.info.state !== 'starting' && entry.info.state !== 'ready') return;
      entry.lastActivityAt = Date.now();
      if (reply.data.type === 'ready') {
        if (entry.info.state !== 'starting') return;
        entry.info.state = 'ready';
        ready.resolve();
      } else if (reply.data.type === 'error') {
        ready.reject(new WorkerOperationError(503, reply.data.code));
      } else if (reply.data.type === 'operation.error') {
        const pending = entry.pending.get(reply.data.commandId);
        if (pending) { entry.pending.delete(reply.data.commandId); pending.reject(new WorkerOperationError(reply.data.status, reply.data.code)); }
      } else if (reply.data.type === 'opened') {
        if (entry.kind === 'session') {
          entry.input.sessionFile = reply.data.sessionFile;
          this.options.callbacks?.onOpened?.(input.rootSessionId, workerGeneration, reply.data.sessionFile, reply.data.seed);
        }
      } else if (reply.data.type === 'subagent') {
        if (entry.kind === 'session') this.options.callbacks?.onSubagent?.(input.rootSessionId, workerGeneration, reply.data);
      } else if (reply.data.type === 'events') {
        if (entry.kind === 'session') this.options.callbacks?.onEvents?.(input.rootSessionId, workerGeneration, reply.data.inputs);
      } else if (reply.data.type === 'interaction') {
        if (entry.kind === 'session') this.options.callbacks?.onInteraction?.(input.rootSessionId, workerGeneration, reply.data.request);
      } else if (reply.data.type === 'policy.snapshot') {
        const snapshot = reply.data.snapshot;
        if (snapshot.projectId !== input.projectId || snapshot.workspaceId !== input.workspaceId || snapshot.cwd !== input.cwd || snapshot.agentDirectory !== input.agentDirectory || (input.agentDirectoryId !== undefined && snapshot.agentDirectoryId !== input.agentDirectoryId)) return;
        entry.policySnapshot = snapshot;
      } else if (reply.data.type === 'policy.request') {
        const check = this.options.policyCheck;
        const requestId = reply.data.requestId;
        const request = reply.data.request;
        void (async () => {
          const descriptor = await describeNativeOperation(input.cwd, request, reply.data.type === 'policy.request' ? reply.data.nativeContext : undefined);
          if (this.workerEntries.get(input.rootSessionId) !== entry || entry.info.workerGeneration !== workerGeneration) return { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 } as const;
          if (descriptor && request.type === 'tool' && request.toolName === 'bash' && request.approvalId && request.toolCallId) {
            descriptor.approvalGrant = this.options.consumeApprovalGrant?.(input.rootSessionId, workerGeneration, request);
          }
          return check ? check(input.rootSessionId, request, descriptor) : { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 } as const;
        })().then(result => {
          if (this.workerEntries.get(input.rootSessionId) === entry && entry.info.workerGeneration === workerGeneration && (entry.info.state === 'starting' || entry.info.state === 'ready') && entry.child.connected) entry.child.send({ type: 'policy.result', workerGeneration, requestId, result: WorkerPolicyResultSchema.parse(result) });
        }).catch(() => {
          if (this.workerEntries.get(input.rootSessionId) === entry && entry.info.workerGeneration === workerGeneration && (entry.info.state === 'starting' || entry.info.state === 'ready') && entry.child.connected) entry.child.send({ type: 'policy.result', workerGeneration, requestId, result: { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 } });
        });
      } else if (reply.data.type === 'action.cancel') {
        const handle = this.actions.get(reply.data.requestId);
        if (handle?.entry === entry) { this.actions.delete(reply.data.requestId); handle.controller.abort(); }
      } else if (reply.data.type === 'action.request') {
        const { requestId, request } = reply.data;
        if (this.actions.has(requestId) || request.sessionId !== input.rootSessionId) return;
        const handle = { entry, controller: new AbortController() };
        this.actions.set(requestId, handle);
        const invoke = this.options.invokeHostAction;
        void (invoke ? invoke(input.rootSessionId, request, handle.controller.signal) : Promise.resolve({ ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 } as const)).then(result => {
          if (this.actions.get(requestId) !== handle || handle.controller.signal.aborted) return;
          if (this.workerEntries.get(input.rootSessionId) === entry && entry.child.connected && entry.info.state === 'ready') entry.child.send({ type: 'action.result', workerGeneration, requestId, result });
        }).catch(() => {
          if (this.actions.get(requestId) === handle && this.workerEntries.get(input.rootSessionId) === entry && entry.child.connected) entry.child.send({ type: 'action.result', workerGeneration, requestId, result: { ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 } });
        }).finally(() => { if (this.actions.get(requestId) === handle) this.actions.delete(requestId); });
      } else if (reply.data.type === 'result') {
        const pending = entry.pending.get(reply.data.commandId);
        if (pending) { entry.pending.delete(reply.data.commandId); pending.resolve(reply.data.result); }
      }
    });
    child.once('error', () => ready.reject(new Error('SDK worker could not start')));
    child.once('close', () => {
      if (stderrBuffer) emitDiagnostic(stderrBuffer);
      stderrBuffer = '';
      for (const [requestId, handle] of this.actions) if (handle.entry === entry) { this.actions.delete(requestId); handle.controller.abort(); }
      const wasStarting = entry.info.state === 'starting';
      if (entry.info.state !== 'stopping') entry.info.state = 'crashed';
      if (wasStarting) ready.reject(new Error('SDK worker exited before initialization'));
      for (const pending of entry.pending.values()) pending.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE'));
      entry.pending.clear();
      this.options.callbacks?.onExit?.(input.rootSessionId, workerGeneration);
      exited.resolve();
    });
    try {
      if (!child.connected) ready.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE'));
      else child.send(command, error => { if (error) ready.reject(error); });
      await waitWithin(entry.ready, this.options.startupTimeoutMs ?? 15_000);
      if (this.closing || this.workerEntries.get(input.rootSessionId) !== entry || entry.info.state !== 'ready' || !child.connected) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      return { ...entry.info };
    } catch (error) {
      const code = error instanceof WorkerOperationError ? error.code : 'WORKER_INIT_FAILED';
      try {
        this.options.onDiagnostic?.({ level: 'error', rootSessionId: input.rootSessionId, workerGeneration, message: `Worker initialization failed (${code})` });
      } catch { /* diagnostics never affect lifecycle */ }
      await this.stopEntry(entry);
      throw error;
    }
  }

  private async stopEntry(entry: WorkerEntry): Promise<boolean> {
    if (entry.stopping) return entry.stopping;
    entry.stopping = (async () => {
      const wasStarting = entry.info.state === 'starting';
      entry.info.state = 'stopping';
      for (const [requestId, handle] of this.actions) if (handle.entry === entry) { this.actions.delete(requestId); handle.controller.abort(); }
      if (wasStarting) entry.rejectReady(new Error('SDK worker is stopping'));
      if (entry.child.connected) entry.child.send({ type: 'stop', workerGeneration: entry.info.workerGeneration });
      const groupSignalled = await terminateWorkerProcessTree(entry.child.pid, 'SIGTERM');
      if (!groupSignalled && entry.child.exitCode === null && entry.child.signalCode === null) entry.child.kill('SIGTERM');
      let escalated = false;
      try {
        await waitWithin(entry.exited, this.options.stopTimeoutMs ?? 5_000);
      } catch {
        if (entry.child.exitCode === null && entry.child.signalCode === null) {
          escalated = await terminateWorkerProcessTree(entry.child.pid, 'SIGKILL');
          if (!escalated) entry.child.kill('SIGKILL');
        }
        await waitWithin(entry.exited, 500);
      }
      if (groupSignalled && !await waitForWorkerProcessTree(entry.child.pid)) {
        await terminateWorkerProcessTree(entry.child.pid, 'SIGKILL');
        await waitForWorkerProcessTree(entry.child.pid, { graceMs: 500 });
      }
      for (const pending of entry.pending.values()) pending.reject(new Error('SDK worker is stopping'));
      entry.pending.clear();
      entry.info.state = 'stopped';
      if (this.workerEntries.get(entry.info.rootSessionId) === entry) this.workerEntries.delete(entry.info.rootSessionId);
      return entry.child.exitCode === 0;
    })();
    return entry.stopping;
  }
}
