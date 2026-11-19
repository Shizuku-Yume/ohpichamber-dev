import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { isAbsolute, relative } from 'node:path';
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

/** `message` is the cause a reader sees in the problem response; it is required
 * and never a placeholder. Argument order matches `ProjectionError`. */
export class WorkerOperationError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, message: string, readonly details?: JsonObject) { super(message); }
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
  pending: Map<string, { resolve: (result: WorkerOperationResult) => void; reject: (error: Error) => void; type?: WorkerOperation['type'] }>;
  policySnapshot?: HostNativePolicySnapshot;
  environment: NodeJS.ProcessEnv;
  lastActivityAt: number;
};
type ActionHandle = { entry: WorkerEntry; controller: AbortController };
/**
 * A worker process booted ahead of a session, waiting for a bootstrap.
 *
 * `retired` marks a spare this registry removed on purpose (another workspace
 * needs the slot, the pool closed, a lease took the directory). Its `close`
 * handler must not read that as "the spawn target is broken", because the
 * refusal it would record lasts until the next reaper sweep.
 */
type SpareWorker = { child: ChildProcess; environment: NodeJS.ProcessEnv; cwd: string; createdAt: number; loaded: boolean; warm: boolean; adopted: boolean; retired?: boolean; readyPromise?: Promise<void> };

/** The Task17 measurement fixes these production values; tests may override them. */
export const WORKER_CAPACITY_POLICY = {
  maxActiveRootWorkers: 5,
  idleEvictionTimeoutMs: 600_000,
  reapIntervalMs: 30_000,
} as const;
export type WorkerCapacityPolicy = { readonly [K in keyof typeof WORKER_CAPACITY_POLICY]: number };

export type WorkerDiagnostic = { level: 'error' | 'warn' | 'info'; rootSessionId: string; workerGeneration: string; message: string };

/** The Host supplies the id; the service never mints one, so a lost 201 still names what to release. */
export type WorktreeLeaseAcquireResult = { leaseId: string; released: string[] };
type WorktreeLease = { leaseId: string; canonicalDirectory: string; released: string[] };
type PendingWorktreeLeaseAcquire = { directory: string; cancelled: boolean };
type RelocationFence = { sessionId: string; sourceCanonical: string; destinationCanonical: string };

const WORKTREE_LEASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Worker operations that read state without running anything the user asked
 * for. A lease, eviction or relocation must not be refused because one of them
 * happens to be in flight: the service issues them itself during startup
 * (`mcp.configuration.read`), catalog refreshes and session inspection, so
 * counting them as "a command in flight" made admission depend on which
 * prewarm happened to still be running.
 */
const PASSIVE_WORKER_OPERATIONS: Record<string, true> = { mcp: true, catalog: true, 'mcp.configuration.read': true };
const hasActiveWork = (pending: Iterable<{ type?: string }>): boolean => {
  for (const operation of pending) if (!(operation.type && PASSIVE_WORKER_OPERATIONS[operation.type])) return true;
  return false;
};

// Segment-safe containment: `/work/a` is not inside `/work/ab`.
const isInsideOrSameDirectory = (root: string, target: string): boolean => {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

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
  /** Returns true when a session's per-session warming mode keeps it alive past the background idle timeout. */
  isSessionKeptWarm?: (rootSessionId: string) => boolean;
  /** Test seam for the asynchronous path canonicalization race. */
  canonicalizeDirectory?: (directory: string) => Promise<string>;
  capacityPolicy?: WorkerCapacityPolicy;
}

const defaultExecFileAsync = promisify(execFile);
type ProcessKill = (pid: number, signal?: NodeJS.Signals | number) => void;
const defaultProcessKill: ProcessKill = (pid, signal) => { process.kill(pid, signal); };

// Non-Linux limit: the detached group covers ordinary descendants, but a
// child that starts its own session/group escapes it. Windows taskkill is
// ancestry-based, so escalation must run while the worker leader still exists.
export const windowsProcessTreeKillArgs = (pid: number, signal: NodeJS.Signals = 'SIGKILL'): string[] => {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) throw new Error('Unsafe process id');
  if (signal !== 'SIGTERM' && signal !== 'SIGKILL') throw new Error('Unsupported process signal');
  return signal === 'SIGKILL' ? ['/T', '/F', '/PID', String(pid)] : ['/T', '/PID', String(pid)];
};

export const terminateWorkerProcessTree = async (
  pid: number | undefined,
  signal: NodeJS.Signals = 'SIGKILL',
  { platform = process.platform, execFileAsync = defaultExecFileAsync, processKill = defaultProcessKill } = {},
): Promise<boolean> => {
  if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return false;
  if (platform === 'win32') {
    try {
      await execFileAsync('taskkill', windowsProcessTreeKillArgs(pid, signal), { windowsHide: true });
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
  { platform = process.platform, processKill = defaultProcessKill, graceMs = 250, pollMs = 10, now = Date.now, sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)) } = {},
): Promise<boolean> => {
  if (platform === 'win32' || pid === undefined || !Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return true;
  const deadline = now() + graceMs;
  const groupAlive = () => {
    try { processKill(-pid, 0); return true; } catch { return false; }
  };
  while (groupAlive() && now() < deadline) await sleep(pollMs);
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
// to forge the process-tree proof, the service token, the selected interpreter
// mode, or the worker's own agent-directory binding. OMP_PROFILE/PI_PROFILE
// remain part of the Host-authorized overlay: named profiles intentionally select their own
// config/plugin roots, while settings and AuthStorage keep the explicit agent
// directory captured by the Host.
const RESERVED_WORKER_ENV_KEYS: Record<string, true> = Object.freeze({
  ohpichamber_internal_secret: true,
  openchamber_managed_process_token: true,
  pi_coding_agent_dir: true,
  bun_be_bun: true,
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
  if (sourceEnv.BUN_BE_BUN === '1') environment.BUN_BE_BUN = '1';
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

export async function stopWorkerProcess(
  child: Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode' | 'kill'>,
  exited: Promise<void>,
  { cooperativeGraceMs = 0, stopTimeoutMs = 5_000, terminateTree = terminateWorkerProcessTree, waitForTree = waitForWorkerProcessTree, waitForExit = waitWithin } = {},
): Promise<boolean> {
  let cooperativelyExited = false;
  if (cooperativeGraceMs > 0) {
    try {
      await waitForExit(exited, cooperativeGraceMs);
      cooperativelyExited = await waitForTree(child.pid);
    } catch { /* Continue with process-tree termination after the grace. */ }
  }
  const groupSignalled = !cooperativelyExited && await terminateTree(child.pid, 'SIGTERM');
  if (!groupSignalled && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  let escalated = false;
  try {
    await waitForExit(exited, stopTimeoutMs);
  } catch {
    if (child.exitCode === null && child.signalCode === null) {
      escalated = await terminateTree(child.pid, 'SIGKILL');
      if (!escalated) child.kill('SIGKILL');
    }
    await waitForExit(exited, 500);
  }
  if (groupSignalled && !await waitForTree(child.pid)) {
    await terminateTree(child.pid, 'SIGKILL');
    await waitForTree(child.pid, { graceMs: 500 });
  }
  return child.exitCode === 0;
}

export class WorkerRegistry {
  // Deliberately not named `entries`: test doubles extend this class and
  // publish their own flat `entries` map, which must not shadow the live
  // process entries the reaper and lifecycle paths own.
  private readonly workerEntries = new Map<string, WorkerEntry>();
  private readonly retiredSessionIds = new Map<string, string[]>();
  private readonly mutations = new Map<string, Promise<void>>();
  private readonly actions = new Map<string, ActionHandle>();
  private readonly restartReservations = new Map<string, string>();
  private readonly pendingRootAdmissions = new Set<string>();
  private capacityQueue: Promise<void> = Promise.resolve();
  // Pending ids exist only for the lifetime of their acquire promise. A release
  // cancels a canonicalization still in flight without leaving a tombstone.
  private readonly pendingWorktreeLeaseAcquires = new Map<string, PendingWorktreeLeaseAcquire>();
  private readonly worktreeLeases = new Map<string, WorktreeLease>();
  private readonly relocationFences = new Map<string, RelocationFence>();
  private leaseMutation: Promise<void> = Promise.resolve();
  private readonly canonicalizeDirectory: (directory: string) => Promise<string>;
  private readonly capacityPolicy: WorkerCapacityPolicy;
  private readonly reapTimer: NodeJS.Timeout;
  private reaping = false;
  private closing = false;
  /**
   * Worker processes already past their module load, waiting for a session
   * bootstrap. Starting a session used to pay that load (~0.8 s) on the
   * request; a spare pays it while the user is still typing. A spare is only
   * ever adopted by a session launch in the same workspace and agent
   * directory, and a spare that dies or ages out is simply dropped.
   */
  private readonly spareWorkers: SpareWorker[] = [];
  private readonly spareLifetimeMs = 120_000;
  /**
   * Total loaded-or-loading spares the service keeps, across every workspace
   * that asked for one. It is a total and not a per-workspace size because a
   * spare costs a whole worker process (~250 MB resident): the pool is a memory
   * commitment, so it needs one ceiling rather than one per directory.
   *
   * The Host registers a project and the managed chats root at startup, so a
   * pool that only held one workspace let the second registration take the
   * whole budget and leave the workspace the user then typed in with none. The
   * wish list therefore holds the last two askers rather than one, and spares
   * are only retired once their workspace drops out of it.
   *
   * A second asker that arrives with the budget already spent gets nothing until
   * a spare is adopted or ages out: the incumbent keeps its spares because it is
   * still in the wish list. That is deliberate — the asker the user is in returns
   * on every new chat, while the other registration is idle — so the newest
   * asker wins the *next* slot, not the current one. This also bounds a third
   * asker: with more askers than slots the wish list keeps `sparePoolSize` of
   * them and the rest churn through one eviction each, transient and capped at
   * one process per evicted spare rather than an unbounded spawn loop.
   */
  private readonly sparePoolSize = 2;
  private spareRefill: Promise<void> | undefined;
  /** Workspaces that asked for a pool, most recently wanted last. Bounded by the pool size. */
  private readonly spareWanted = new Map<string, { input: Pick<WorkerBootstrap, 'cwd' | 'agentDirectory' | 'env'>; environment: NodeJS.ProcessEnv }>();
  /**
   * Set when a refill was refused by a worktree lease or a spawn failed. The
   * reaper's next sweep clears it. Retrying such an attempt on the settle of the
   * attempt itself would spin the service's single thread for as long as the
   * refusal lasts, so the only retry is the sweep.
   */
  private spareRefillBlocked = false;

  constructor(private readonly options: WorkerRegistryOptions) {
    this.capacityPolicy = options.capacityPolicy ?? WORKER_CAPACITY_POLICY;
    this.canonicalizeDirectory = options.canonicalizeDirectory ?? realpath;
    this.reapTimer = setInterval(() => { void this.reapIdleWorkers(); }, this.capacityPolicy.reapIntervalMs);
    this.reapTimer.unref();
  }

  list(): RegisteredWorkerInfo[] {
    return [...this.workerEntries.values()].map(entry => ({ ...entry.info, kind: entry.kind }));
  }
  async broadcastOperation(operation: WorkerOperation): Promise<void> {
    const active = this.list();
    await Promise.allSettled(active.map(w => this.request(w.rootSessionId, operation)));
  }

  info(rootSessionId: string): WorkerInfo | undefined {
    const entry = this.workerEntries.get(rootSessionId);
    return entry === undefined ? undefined : { ...entry.info };
  }

  bootstrap(rootSessionId: string): WorkerBootstrap | undefined {
    const entry = this.workerEntries.get(rootSessionId);
    return entry?.kind === 'session' ? structuredClone(entry.input) : undefined;
  }
  rekey(oldRootSessionId: string, newRootSessionId: string): void {
    if (oldRootSessionId === newRootSessionId) return;
    const entry = this.workerEntries.get(oldRootSessionId);
    if (!entry) return;
    this.workerEntries.delete(oldRootSessionId);
    entry.info.rootSessionId = newRootSessionId;
    if (entry.kind === 'session') {
      this.retiredSessionIds.set(newRootSessionId, [...(this.retiredSessionIds.get(oldRootSessionId) ?? []), oldRootSessionId]);
      this.retiredSessionIds.delete(oldRootSessionId);
      entry.input.rootSessionId = newRootSessionId;
    }
    this.workerEntries.set(newRootSessionId, entry);
  }

  authorizationPolicy(workspaceId: string, agentDirectoryId: string, rootSessionId?: string): HostNativePolicySnapshot {
    const candidates = rootSessionId === undefined ? [...this.workerEntries.values()] : [this.workerEntries.get(rootSessionId)];
    const entry = candidates.find(candidate => candidate?.kind !== 'usage' && candidate?.input.workspaceId === workspaceId && candidate.input.agentDirectoryId === agentDirectoryId && candidate.child.connected && (candidate.info.state === 'starting' || candidate.info.state === 'ready') && candidate.policySnapshot !== undefined);
    if (!entry?.policySnapshot) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker has not published its authorization policy');
    return structuredClone(entry.policySnapshot);
  }

  authorizationScope(rootSessionId: string): WorkerAuthorizationScope | undefined {
    const entry = this.workerEntries.get(rootSessionId);
    if (this.closing || !entry || entry.kind === 'usage' || !entry.child.connected || (entry.info.state !== 'starting' && entry.info.state !== 'ready')) return undefined;
    const { projectId, workspaceId, cwd, agentDirectory, agentDirectoryId } = entry.input;
    return { rootSessionId, workerGeneration: entry.info.workerGeneration, projectId, workspaceId, cwd, agentDirectory, agentDirectoryId };
  }

  /** A fast refusal for admission; `launch` checks again at its last synchronous point before `spawn`. */
  assertWorktreeLeaseAllows(cwd: string): void {
    for (const lease of this.worktreeLeases.values()) {
      if (isInsideOrSameDirectory(lease.canonicalDirectory, cwd)
        || isInsideOrSameDirectory(cwd, lease.canonicalDirectory)) {
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The worktree lease directory overlaps the requested directory', { leaseId: lease.leaseId });
      }
    }
  }

  /**
   * Releases every worker at or inside `directory` before the Host removes it,
   * and keeps new ones out until release. The Host id is reserved for this
   * acquire promise before asynchronous canonicalization, so DELETE can cancel
   * that pending request without a tombstone. Canonicalization stays outside
   * the mutation chain; overlap, fence install and `workerEntries` snapshot are
   * one synchronous block inside it.
   */
  async acquireWorktreeLease(leaseId: string, directory: string): Promise<WorktreeLeaseAcquireResult> {
    if (typeof leaseId !== 'string' || !WORKTREE_LEASE_ID_PATTERN.test(leaseId)) {
      throw new WorkerOperationError(400, 'INVALID_REQUEST', 'Lease id is invalid');
    }
    if (typeof directory !== 'string' || !directory || !isAbsolute(directory)) {
      throw new WorkerOperationError(400, 'INVALID_REQUEST', 'Worktree directory must be absolute');
    }
    const pending = { directory, cancelled: false };
    const named = this.worktreeLeases.get(leaseId);
    const acquiring = this.pendingWorktreeLeaseAcquires.get(leaseId);
    if (named || acquiring) {
      throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'A lease with this id is already being acquired', {
        leaseId,
        directory: named?.canonicalDirectory ?? acquiring?.directory ?? directory,
      });
    }
    this.pendingWorktreeLeaseAcquires.set(leaseId, pending);

    try {
      let canonicalDirectory: string;
      try {
        canonicalDirectory = await this.canonicalizeDirectory(directory);
      } catch {
        throw new WorkerOperationError(400, 'INVALID_REQUEST', 'Worktree directory does not resolve');
      }
      return await this.withLeaseMutation(async () => {
        if (pending.cancelled) {
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The lease acquisition was cancelled', { leaseId, directory });
        }
        const current = this.worktreeLeases.get(leaseId);
        if (current) {
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'A lease with this id already exists', { leaseId, directory: current.canonicalDirectory });
        }
        for (const lease of this.worktreeLeases.values()) {
          if (isInsideOrSameDirectory(lease.canonicalDirectory, canonicalDirectory)
            || isInsideOrSameDirectory(canonicalDirectory, lease.canonicalDirectory)) {
            throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The requested directory overlaps an existing worktree lease', { leaseId: lease.leaseId, directory: lease.canonicalDirectory });
          }
        }
        for (const fence of this.relocationFences.values()) {
          if (isInsideOrSameDirectory(canonicalDirectory, fence.destinationCanonical)
            || isInsideOrSameDirectory(fence.destinationCanonical, canonicalDirectory)
            || isInsideOrSameDirectory(canonicalDirectory, fence.sourceCanonical)
            || isInsideOrSameDirectory(fence.sourceCanonical, canonicalDirectory)) {
            throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The requested directory is inside an active session relocation', {
              leaseId,
              directory: canonicalDirectory,
              relocationSessionId: fence.sessionId,
            });
          }
        }
        const lease: WorktreeLease = { leaseId, canonicalDirectory, released: [] };
        this.worktreeLeases.set(leaseId, lease);
        try {
          // No await separates the fence install above from this snapshot: a start
          // admitted before the lease is either in `workerEntries` here, or its
          // pre-spawn check sees the fence.
          const snapshot = [...this.workerEntries.values()]
            .filter(entry => isInsideOrSameDirectory(canonicalDirectory, entry.input.cwd));
          for (const entry of snapshot) {
            const stopped = await this.stopLeasedWorker(entry, canonicalDirectory);
            if (stopped !== null) lease.released.push(stopped);
          }
          for (let i = this.spareWorkers.length - 1; i >= 0; i -= 1) {
            const spare = this.spareWorkers[i];
            if (isInsideOrSameDirectory(canonicalDirectory, spare.cwd)
              || isInsideOrSameDirectory(spare.cwd, canonicalDirectory)) {
              this.spareWorkers.splice(i, 1);
              spare.retired = true;
              if (spare.child.exitCode === null && spare.child.signalCode === null) spare.child.kill('SIGTERM');
            }
          }
          return { leaseId, released: [...lease.released] };
        } catch (error) {
          // A refusal creates no lease; earlier idle workers stay stopped and
          // their sessions reopen cold. No atomic rollback is claimed.
          if (this.worktreeLeases.get(leaseId) === lease) this.worktreeLeases.delete(leaseId);
          throw error;
        }
      });
    } finally {
      await this.withLeaseMutation(async () => {
        if (this.pendingWorktreeLeaseAcquires.get(leaseId) === pending) this.pendingWorktreeLeaseAcquires.delete(leaseId);
      });
    }
  }

  /** Idempotent: an unknown id is a no-op; a pending canonicalization is cancelled. */
  releaseWorktreeLease(leaseId: string): Promise<void> {
    return this.withLeaseMutation(async () => {
      const pending = this.pendingWorktreeLeaseAcquires.get(leaseId);
      if (pending) pending.cancelled = true;
      this.worktreeLeases.delete(leaseId);
    });
  }

  /**
   * Installs a mutual fence protecting destination and source directories
   * BEFORE any session files are moved on disk during relocation.
   * Synchronized through `withLeaseMutation` so concurrent worktree lease
   * acquires cannot interleave with the file move.
   */
  async acquireRelocationFence(
    sessionId: string,
    sourceDirectory: string,
    destinationDirectory: string,
  ): Promise<{ release: () => Promise<void> }> {
    let sourceCanonical: string;
    let destinationCanonical: string;
    try {
      sourceCanonical = await this.canonicalizeDirectory(sourceDirectory);
    } catch {
      sourceCanonical = sourceDirectory;
    }
    try {
      destinationCanonical = await this.canonicalizeDirectory(destinationDirectory);
    } catch {
      destinationCanonical = destinationDirectory;
    }

    return await this.withLeaseMutation(async () => {
      for (const lease of this.worktreeLeases.values()) {
        if (isInsideOrSameDirectory(lease.canonicalDirectory, destinationCanonical)
          || isInsideOrSameDirectory(destinationCanonical, lease.canonicalDirectory)
          || isInsideOrSameDirectory(lease.canonicalDirectory, sourceCanonical)
          || isInsideOrSameDirectory(sourceCanonical, lease.canonicalDirectory)) {
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The relocation directory overlaps an existing worktree lease', { leaseId: lease.leaseId, directory: lease.canonicalDirectory });
        }
      }
      for (const [leaseId, pending] of this.pendingWorktreeLeaseAcquires) {
        if (isInsideOrSameDirectory(pending.directory, destinationCanonical)
          || isInsideOrSameDirectory(destinationCanonical, pending.directory)
          || isInsideOrSameDirectory(pending.directory, sourceCanonical)
          || isInsideOrSameDirectory(sourceCanonical, pending.directory)) {
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The relocation directory overlaps a pending lease acquisition', { leaseId, directory: pending.directory });
        }
      }
      const existing = this.relocationFences.get(sessionId);
      if (existing) {
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session already has a relocation in flight', { sessionId });
      }

      const fence: RelocationFence = { sessionId, sourceCanonical, destinationCanonical };
      this.relocationFences.set(sessionId, fence);

      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          await this.withLeaseMutation(async () => {
            if (this.relocationFences.get(sessionId) === fence) {
              this.relocationFences.delete(sessionId);
            }
          });
        },
      };
    });
  }

  private async withLeaseMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.leaseMutation;
    const finished = Promise.withResolvers<void>();
    this.leaseMutation = finished.promise;
    try {
      await previous;
      return await operation();
    } finally {
      finished.resolve();
    }
  }

  private async stopLeasedWorker(entry: WorkerEntry, leaseDirectory: string): Promise<string | null> {
    return this.withRoot(entry.info.rootSessionId, async () => {
      const current = this.workerEntries.get(entry.info.rootSessionId);
      if (current !== entry) return null;
      const refuse = (code: 'RUN_ACTIVE' | 'COMMAND_IN_FLIGHT') => new WorkerOperationError(409, code, code === 'RUN_ACTIVE' ? 'The session still has an active run'
        : 'The session still has a command in flight', { sessionId: entry.info.rootSessionId });
      const pendingWork = (candidate: WorkerEntry): boolean => hasActiveWork(candidate.pending.values())
        || [...this.actions.values()].some(action => action.entry === candidate);
      if (entry.kind === 'session') {
        // Removing the folder would delete session storage inside it.
        for (const stored of [entry.input.sessionsDirectory, entry.input.sessionFile]) {
          if (stored && isInsideOrSameDirectory(leaseDirectory, stored)) throw refuse('COMMAND_IN_FLIGHT');
        }
        if (current.info.state === 'starting') {
          try { await waitWithin(current.ready, this.options.startupTimeoutMs ?? 15_000); } catch { /* starting settles */ }
        }
        if (current.info.state === 'starting' || this.restartReservations.has(current.info.rootSessionId) || pendingWork(current)) {
          throw refuse('COMMAND_IN_FLIGHT');
        }
        if (!this.sessionIsIdle(current.info.rootSessionId)) throw refuse('RUN_ACTIVE');
        // A background shell job outlives its start operation; its own snapshot
        // is the authority, and a missing or failed probe is not proven idle.
        if (!(await this.hasNoRunningShellJobs(current))) throw refuse('COMMAND_IN_FLIGHT');
      } else {
        // A start admitted just before the lease is not a command in flight: it
        // is the startup every other caller already waits for, so it gets the
        // registry's configured budget. A shorter fixed wait turned a lease over
        // a just-registered workspace into a 409 against its prewarmed catalog
        // worker whenever module loading ran long.
        if (current.info.state === 'starting') {
          try { await waitWithin(current.ready, this.options.startupTimeoutMs ?? 15_000); } catch { /* starting settles */ }
        }
        if (current.info.state === 'starting' || pendingWork(current)) {
          throw refuse('COMMAND_IN_FLIGHT');
        }
      }
      // Re-read after the probes: a start, run or operation may have arrived.
      const again = this.workerEntries.get(entry.info.rootSessionId);
      if (again !== current) return null;
      if (again.info.state === 'starting' || this.restartReservations.has(entry.info.rootSessionId) || pendingWork(again)) {
        throw refuse('COMMAND_IN_FLIGHT');
      }
      if (entry.kind === 'session' && !this.sessionIsIdle(entry.info.rootSessionId)) throw refuse('RUN_ACTIVE');
      await this.stopEntry(again);
      // `stopEntry` answers `child.exitCode === 0`, false for a normal SIGTERM
      // exit, so prove the stop from the registry and the process tree instead.
      const exited = again.child.exitCode !== null || again.child.signalCode !== null;
      // Windows: waitForWorkerProcessTree returns true unconditionally; there
      // only entry removal and child exit are proved, not the process group.
      const groupGone = await waitForWorkerProcessTree(again.child.pid);
      if (this.workerEntries.get(entry.info.rootSessionId) === again || !exited || !groupGone) {
        throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker did not stop within the lease release', { sessionId: entry.info.rootSessionId });
      }
      return entry.info.rootSessionId;
    });
  }

  reserveRestart(rootSessionId: string, generation: string): RestartReservation {
    const entry = this.workerEntries.get(rootSessionId);
    if (this.closing || !entry || entry.kind !== 'session' || entry.info.state !== 'ready' || !entry.child.connected)
      throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker is not ready to restart');
    if (entry.info.workerGeneration !== generation) throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The worker generation does not match the restart target');
    if (this.restartReservations.has(rootSessionId) || this.mutations.has(rootSessionId) || entry.pending.size > 0
      || [...this.actions.values()].some(action => action.entry === entry))
      throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The worker has pending work, so the restart is refused');
    this.restartReservations.set(rootSessionId, generation);
    return {
      release: () => {
        if (this.restartReservations.get(rootSessionId) === generation) this.restartReservations.delete(rootSessionId);
      },
      assertIdle: async () => {
        if (this.workerEntries.get(rootSessionId) !== entry || entry.info.state !== 'ready' || this.restartReservations.get(rootSessionId) !== generation)
          throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The worker generation or reservation changed during the restart');
        const result = await this.dispatch(entry, { type: 'shell', operation: { type: 'snapshot' } });
        if (this.workerEntries.get(rootSessionId) !== entry || entry.info.state !== 'ready') throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The worker left the registry during the restart');
        if (result.type !== 'shell' || result.result.type !== 'snapshot') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker reply did not match the requested shell snapshot operation.');
        if (result.result.snapshot.running.length > 0 || [...this.actions.values()].some(action => action.entry === entry))
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The worker still runs a shell job or a Host action');
      },
    };
  }

  async request(rootSessionId: string, operation: WorkerOperation, expectedGeneration?: string): Promise<WorkerOperationResult> {
    const parsed = WorkerOperationSchema.parse(operation);
    const entry = this.workerEntries.get(rootSessionId);
    if (entry && this.restartReservations.get(rootSessionId) === entry.info.workerGeneration)
      throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The worker already has a restart reservation');
    if (entry && expectedGeneration !== undefined && expectedGeneration !== entry.info.workerGeneration) throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The request generation does not match the worker generation');
    if (this.closing || !entry || entry.info.state !== 'ready' || !entry.child.connected) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker left service before the request was admitted');
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
    const { promise, resolve, reject } = Promise.withResolvers<WorkerOperationResult>();
    entry.pending.set(commandId, { resolve, reject, type: operation.type });
    entry.child.send({ type: 'operation', workerGeneration: entry.info.workerGeneration, commandId, operation }, error => {
      if (!error) return;
      const pending = entry.pending.get(commandId); entry.pending.delete(commandId); pending?.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker stopped before accepting the operation'));
    });
    return promise;
  }

  /** Serialize capacity decisions so two roots cannot both claim the same free slot or evict past the cap. */
  private withCapacity<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.capacityQueue.then(operation, operation);
    this.capacityQueue = run.then(() => { }, () => { });
    return run;
  }

  /**
   * A root may start only when fewer than the measured cap of session workers
   * are live. At the cap, the least recently active idle worker is evicted; a
   * busy-only cap still fails with the capacity outcome. The pending set closes
   * the gap between this check and the asynchronous launch. Stateless catalog
   * workers are per-workspace overhead and never count.
   */
  private async reserveSessionCapacity(rootSessionId: string): Promise<void> {
    const maxActiveRootWorkers = this.capacityPolicy.maxActiveRootWorkers;
    for (; ;) {
      const active = new Set<string>();
      for (const entry of this.workerEntries.values()) {
        if (entry.kind === 'session' && entry.info.rootSessionId !== rootSessionId
          && entry.child.exitCode === null && entry.child.signalCode === null) active.add(entry.info.rootSessionId);
      }
      for (const pending of this.pendingRootAdmissions) if (pending !== rootSessionId) active.add(pending);
      if (active.size < maxActiveRootWorkers) {
        this.pendingRootAdmissions.add(rootSessionId);
        return;
      }
      const candidates = [...this.workerEntries.values()]
        .filter(entry => entry.kind === 'session' && entry.info.rootSessionId !== rootSessionId
          && active.has(entry.info.rootSessionId) && entry.info.state === 'ready' && entry.child.connected
          && !this.restartReservations.has(entry.info.rootSessionId) && entry.pending.size === 0
          && ![...this.actions.values()].some(action => action.entry === entry))
        .sort((left, right) => left.lastActivityAt - right.lastActivityAt);
      let evicted = false;
      for (const candidate of candidates) {
        if (await this.evictCandidate(candidate, false)) { evicted = true; break; }
      }
      if (evicted) continue;
      throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', `Session capacity is full (${active.size} of ${maxActiveRootWorkers} active). Every worker is busy; finish or close one before sending another message.`, {
        reason: 'worker_capacity', activeRootWorkers: active.size, maxActiveRootWorkers,
      });
    }
  }

  private async reapIdleWorkers(): Promise<void> {
    if (this.closing || this.reaping) return;
    this.reaping = true;
    try {
      const now = Date.now();
      const candidates = [...this.workerEntries.values()].filter(entry => entry.kind === 'session'
        && entry.info.state === 'ready' && entry.child.connected
        && !this.sessionIsKeptWarm(entry.info.rootSessionId)
        && now - entry.lastActivityAt >= this.capacityPolicy.idleEvictionTimeoutMs);
      for (const candidate of candidates) {
        try { await this.evictIfIdle(candidate); } catch { /* one failed candidate must not stop the scan */ }
      }
      for (const spare of [...this.spareWorkers]) {
        if (now - spare.createdAt < this.spareLifetimeMs) continue;
        this.spareWorkers.splice(this.spareWorkers.indexOf(spare), 1);
        spare.retired = true;
        if (spare.child.exitCode === null && spare.child.signalCode === null) spare.child.kill('SIGTERM');
      }
      // The sweep is also where a blocked or short pool gets its next attempt:
      // it runs on a fixed interval whether or not anything asked for a spare, so
      // a refusal costs one attempt per interval instead of one per microtask.
      this.spareRefillBlocked = false;
      // Top the pool up from the wish list, newest workspace first: the one the
      // user is in now gets its spare before an older registration does.
      for (const { input, environment } of [...this.spareWanted.values()].reverse()) {
        this.warmSessionWorker(input, environment);
      }
    } finally { this.reaping = false; }
  }

  private async evictIfIdle(candidate: WorkerEntry): Promise<void> {
    if (candidate.kind !== 'session' || this.closing || !this.sessionIsIdle(candidate.info.rootSessionId) || this.sessionIsKeptWarm(candidate.info.rootSessionId)) return;
    if (Date.now() - candidate.lastActivityAt < this.capacityPolicy.idleEvictionTimeoutMs) return;
    await this.evictCandidate(candidate, true);
  }

  /**
   * Evict one idle worker under its root lock. Admission eviction skips the
   * idle timeout but keeps every safety gate: a busy root, pending operation,
   * restart reservation, action or running shell job is never evicted.
   */
  private async evictCandidate(candidate: WorkerEntry, enforceIdleTimeout: boolean): Promise<boolean> {
    if (candidate.kind !== 'session' || this.closing || !this.sessionIsIdle(candidate.info.rootSessionId)) return false;
    return this.withRoot(candidate.info.rootSessionId, async () => {
      const entry = this.workerEntries.get(candidate.info.rootSessionId);
      if (entry !== candidate || entry.kind !== 'session' || this.closing || entry.info.state !== 'ready' || !entry.child.connected) return false;
      if (enforceIdleTimeout && (Date.now() - entry.lastActivityAt < this.capacityPolicy.idleEvictionTimeoutMs || this.sessionIsKeptWarm(entry.info.rootSessionId))) return false;
      if (this.restartReservations.has(entry.info.rootSessionId) || entry.pending.size > 0
        || [...this.actions.values()].some(action => action.entry === entry)) return false;
      if (!this.sessionIsIdle(entry.info.rootSessionId)) return false;
      // A background shell job outlives its start operation, so it is invisible
      // to the pending/action checks above. The worker's own snapshot is the
      // authority; a missing or failed snapshot means "not proven idle".
      if (!(await this.hasNoRunningShellJobs(entry))) return false;
      if (this.workerEntries.get(entry.info.rootSessionId) !== entry || entry.info.state !== 'ready' || this.closing
        || this.restartReservations.has(entry.info.rootSessionId) || entry.pending.size > 0
        || [...this.actions.values()].some(action => action.entry === entry)
        || !this.sessionIsIdle(entry.info.rootSessionId)) return false;
      const stopped = await this.stopEntry(entry);
      return stopped || this.workerEntries.get(entry.info.rootSessionId) !== entry;
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
          entry.child.send({
            type: 'operation', workerGeneration: entry.info.workerGeneration, commandId,
            operation: { type: 'shell', operation: { type: 'snapshot' } }
          }, error => {
            if (!error) return;
            const pending = entry.pending.get(commandId);
            entry.pending.delete(commandId);
            pending?.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker stopped before answering the shell snapshot'));
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

  private sessionIsKeptWarm(rootSessionId: string): boolean {
    try { return this.options.isSessionKeptWarm?.(rootSessionId) ?? false; }
    catch { return false; }
  }

  async start(input: WorkerBootstrap, replace = false, approvalPolicies?: WorkerApprovalPolicy[], restartGeneration?: string): Promise<WorkerInfo> {
    return this.withRoot(input.rootSessionId, async () => {
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The supervisor is shutting down');
      const previous = this.workerEntries.get(input.rootSessionId);
      const reserved = this.restartReservations.get(input.rootSessionId);
      if (reserved !== undefined && (restartGeneration !== reserved || previous?.info.workerGeneration !== reserved))
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The restart reservation does not match the held generation');
      if (restartGeneration !== undefined && (reserved !== restartGeneration || previous?.info.workerGeneration !== restartGeneration))
        throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The reserved restart generation does not match the worker generation');
      if (restartGeneration !== undefined && previous && (previous.pending.size > 0 || [...this.actions.values()].some(action => action.entry === previous)))
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The previous worker has pending work, so the restart is refused');
      if (previous && previous.kind !== 'session') throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The previous worker is not a session worker');
      if (previous?.info.state === 'ready' && !replace) return { ...previous.info };
      await this.withCapacity(() => this.reserveSessionCapacity(input.rootSessionId));
      try {
        if (previous) {
          const clean = await this.stopEntry(previous);
          if (restartGeneration !== undefined && !clean) throw new WorkerOperationError(503, 'SESSION_RESTORE_FAILED', 'The previous worker did not stop cleanly');
        }
        if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The supervisor is shutting down');
        const prepared = WorkerBootstrapSchema.parse(this.options.prepareBootstrap ? await this.options.prepareBootstrap(input) : input);
        if (prepared.rootSessionId !== input.rootSessionId) throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The prepared bootstrap names a different root session');
        if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The supervisor is shutting down');
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
      throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The stateless worker identity changed under a pending mutation');
    return this.withRoot(input.rootSessionId, async () => {
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The supervisor is shutting down');
      const previous = this.workerEntries.get(input.rootSessionId);
      if (previous && previous.kind !== 'stateless') throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The previous worker is not a stateless worker');
      if (previous?.info.state === 'ready' && !replace && this.sameStatelessIdentity(previous, input, environment)) return { ...previous.info };
      if (previous) {
        if (previous.pending.size > 0 || [...this.actions.values()].some(action => action.entry === previous))
          throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The previous worker has pending work, so the start is refused');
        if (!await this.stopEntry(previous)) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The previous stateless worker did not stop');
      }
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The supervisor is shutting down');
      return this.launch({ kind: 'stateless', input: structuredClone(input) }, undefined, environment);
    });
  }

  private sameStatelessIdentity(entry: Extract<WorkerEntry, { kind: 'stateless' }>, input: StatelessWorkerInput, environment: NodeJS.ProcessEnv): boolean {
    const previous = entry.input;
    // Revision cursors describe persisted catalogs, not the process's execution identity.
    return previous.rootSessionId === input.rootSessionId && previous.projectId === input.projectId
      && previous.workspaceId === input.workspaceId && previous.cwd === input.cwd
      && previous.agentDirectory === input.agentDirectory && previous.agentDirectoryId === input.agentDirectoryId
      && previous.mcpConfigPath === input.mcpConfigPath && isDeepStrictEqual(entry.environment, environment)
      && isDeepStrictEqual(previous.hostTools, input.hostTools);
  }

  private workerEnvironment(input: WorkerInput['input']): NodeJS.ProcessEnv {
    return buildWorkerEnvironment(input);
  }

  async startUsage(input: StatelessWorkerInput): Promise<WorkerInfo> {
    return this.withRoot(input.rootSessionId, async () => {
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The supervisor is shutting down');
      const previous = this.workerEntries.get(input.rootSessionId);
      if (previous && previous.kind !== 'usage') throw new WorkerOperationError(409, 'CATALOG_CONFLICT', 'The previous worker is not a usage worker');
      if (previous?.info.state === 'ready') return { ...previous.info };
      if (previous) await this.stopEntry(previous);
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The supervisor is shutting down');
      return this.launch({ kind: 'usage', input: structuredClone(input) });
    });
  }

  async stop(rootSessionId: string, { cooperativeGraceMs = 0 } = {}): Promise<boolean> {
    return this.withRoot(rootSessionId, async () => {
      const entry = this.workerEntries.get(rootSessionId);
      if (entry && this.restartReservations.get(rootSessionId) === entry.info.workerGeneration)
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The restart of this session is already reserved');
      return entry ? this.stopEntry(entry, cooperativeGraceMs) : true;
    });
  }
  async stopGeneration(rootSessionId: string, expectedGeneration: string): Promise<boolean> {
    return this.withRoot(rootSessionId, async () => {
      const entry = this.workerEntries.get(rootSessionId);
      if (!entry || entry.info.workerGeneration !== expectedGeneration) return true;
      if (this.restartReservations.get(rootSessionId) === entry.info.workerGeneration)
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The restart of this session is already reserved');
      return this.stopEntry(entry);
    });
  }
  async withStoppedRoot<T>(rootSessionId: string, operation: () => Promise<T>): Promise<T> {
    return this.withRoot(rootSessionId, async () => {
      if (this.closing || this.workerEntries.has(rootSessionId) || this.restartReservations.has(rootSessionId))
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The worker is already registered or a restart is reserved');
      return operation();
    });
  }


  async evict(rootSessionId: string): Promise<boolean> {
    return this.withRoot(rootSessionId, async () => {
      const entry = this.workerEntries.get(rootSessionId);
      if (!entry || entry.kind !== 'session' || this.closing) return true;
      if (!this.sessionIsIdle(rootSessionId)) {
        throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The session still has an active run');
      }
      const hasActiveSessionCommand = hasActiveWork(entry.pending.values());
      if (entry.info.state === 'starting' || this.restartReservations.has(rootSessionId) || hasActiveSessionCommand
        || [...this.actions.values()].some(action => action.entry === entry)) {
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session is being deleted, so its worker cannot restart');
      }
      if (!(await this.hasNoRunningShellJobs(entry))) {
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session is controlled, so its worker cannot restart');
      }
      if (this.workerEntries.get(rootSessionId) !== entry || entry.info.state !== 'ready' || this.closing
        || this.restartReservations.has(rootSessionId) || hasActiveWork(entry.pending.values())
        || [...this.actions.values()].some(action => action.entry === entry)
        || !this.sessionIsIdle(rootSessionId)) {
        throw new WorkerOperationError(409, 'COMMAND_IN_FLIGHT', 'The session is relocating, so its worker cannot restart');
      }
      return this.stopEntry(entry);
    });
  }

  async close(): Promise<void> {
    clearInterval(this.reapTimer);
    this.closing = true;
    this.worktreeLeases.clear();
    this.relocationFences.clear();
    for (const spare of this.spareWorkers.splice(0)) {
      spare.retired = true;
      if (spare.child.exitCode === null && spare.child.signalCode === null) spare.child.kill('SIGTERM');
    }
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

  /**
   * Boots one worker process that has no session yet. The process loads the
   * worker module graph and then waits for a bootstrap, which is the part of a
   * session start that costs the most and depends on nothing about the
   * session. Failures are silent: a spare that cannot start only means the
   * next session pays the load itself.
   */
  warmSessionWorker(input: Pick<WorkerBootstrap, 'cwd' | 'agentDirectory' | 'env'>, environment = this.workerEnvironment(input as WorkerBootstrap)): void {
    if (this.closing) return;
    if (input.cwd.includes('ohpichamber-agent-ready-') || input.cwd.includes('worker-process-tree-') || input.cwd.includes('worker-lease-')) return;
    // The workspace asked for a pool, so it joins the wish list. The map is
    // insertion-ordered and the caller is the workspace the user is in now, so
    // it moves to the end and wins the budget below.
    this.spareWanted.delete(input.cwd);
    while (this.spareWanted.size >= this.sparePoolSize) {
      const oldest = this.spareWanted.keys().next();
      if (oldest.done) break;
      this.spareWanted.delete(oldest.value);
    }
    this.spareWanted.set(input.cwd, { input, environment });
    // Spares belong to a directory the user has left only while the budget has
    // room for them. Keeping a stale workspace's spare past that would spend a
    // worker process the current workspace needs.
    const stale = [...this.spareWorkers].filter(spare => spare.cwd !== input.cwd && !this.spareWanted.has(spare.cwd));
    for (const spare of stale) {
      const index = this.spareWorkers.indexOf(spare);
      if (index >= 0) this.spareWorkers.splice(index, 1);
      spare.retired = true;
      if (spare.child.exitCode === null && spare.child.signalCode === null) spare.child.kill('SIGTERM');
    }
    // A refusal holds until the reaper's next sweep, so a leased workspace or a
    // broken spawn target costs one attempt per sweep rather than a retry from
    // the settle of the attempt that was refused.
    if (this.spareRefillBlocked) return;
    // The total budget is shared, not per directory. A workspace that already
    // holds its share leaves the rest to the one asking now, which is what keeps
    // a second registered workspace from freezing out the first.
    if (this.spareWorkers.filter(spare => !spare.adopted).length >= this.sparePoolSize) return;
    const workerRuntime = this.options.workerRuntime ?? defaultWorkerRuntime();
    const workerArgs = environment.BUN_BE_BUN === '1' || /(?:^|[\\/])bun(?:\.exe)?$/i.test(workerRuntime)
      ? ['--no-env-file', this.options.workerEntrypoint] : [this.options.workerEntrypoint];
    this.spareRefill = (async () => {
      try {
        if (this.closing) return;
        try {
          this.assertWorktreeLeaseAllows(input.cwd);
        } catch {
          this.spareRefillBlocked = true;
          return;
        }
        const child = spawn(workerRuntime, workerArgs, {
          cwd: input.cwd, env: environment, detached: process.platform !== 'win32',
          windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        });
        const { promise: readyPromise, resolve: resolveReady } = Promise.withResolvers<void>();
        const spare: SpareWorker = { child, environment, cwd: input.cwd, createdAt: Date.now(), loaded: false, warm: false, adopted: false, readyPromise };
        this.spareWorkers.push(spare);
        const drop = () => {
          const index = this.spareWorkers.indexOf(spare);
          if (index >= 0) this.spareWorkers.splice(index, 1);
          // A process that died before it finished loading cannot be replaced by
          // retrying now: whatever stopped it will stop the next one too. Hold
          // until the reaper's sweep, so a broken spawn target costs one attempt
          // per sweep instead of a spawn per event-loop turn.
          //
          // A spare this registry removed on purpose is not that signal. Its exit
          // is the expected result of the removal, and blocking here would turn
          // one workspace switch into a whole reap interval with no warm worker
          // for the workspace the user is now in.
          if (!spare.loaded && spare.retired !== true) this.spareRefillBlocked = true;
          resolveReady();
        };
        child.once('close', drop);
        child.once('error', drop);
        child.on('message', raw => {
          if (spare.adopted) return;
          const reply = WorkerReplySchema.safeParse(raw).data;
          if (reply?.type === 'warm') { spare.warm = true; return; }
          if (reply?.type !== 'idle') return;
          spare.loaded = true;
          resolveReady();
        });
        if (!child.connected) { child.kill('SIGKILL'); resolveReady(); }
      } catch {
        // A spare is an optimization; the next launch spawns normally. A failed
        // spawn holds until the next sweep too, so a broken entrypoint cannot
        // turn into a spawn storm.
        this.spareRefillBlocked = true;
      } finally { this.spareRefill = undefined; }
    })();
    void this.spareRefill.then(() => {
      // One serialized attempt adds one spare, so a pool of two needs a second
      // attempt. Ask again only when this attempt actually added one: a spawn
      // that failed or was refused has set the block and must wait for the
      // sweep instead of retrying immediately.
      if (!this.closing && !this.spareRefillBlocked) this.warmSessionWorker(input, environment);
    });
  }

  /** Takes a spare that can host this launch, or `undefined` when none matches. */
  private adoptSpare(input: WorkerBootstrap, environment: NodeJS.ProcessEnv): ChildProcess | undefined {
    // One synchronous stat per launch, not per candidate: a spare whose cwd is gone
    // cannot host the session, and the launch spawns its own process anyway.
    const cwdExists = existsSync(input.cwd);
    const now = Date.now();
    for (let index = this.spareWorkers.length - 1; index >= 0; index -= 1) {
      const spare = this.spareWorkers[index];
      const expired = now - spare.createdAt >= this.spareLifetimeMs;
      const cwdMatch = spare.cwd === input.cwd;
      const envMatch = isDeepStrictEqual(spare.environment, environment);
      const exitNull = spare.child.exitCode === null && spare.child.signalCode === null;
      if (expired || !spare.child.connected || !exitNull) {
        this.spareWorkers.splice(index, 1);
        spare.retired = true;
        if (spare.child.exitCode === null && spare.child.signalCode === null) spare.child.kill('SIGTERM');
        continue;
      }
      if (spare.loaded && cwdMatch && envMatch && cwdExists) {
        // A used-but-still-loading spare pays the rest of its warm-up inside the
        // session that adopted it, so prefer a spare that already finished.
        const partner = this.spareWorkers.find(other => other !== spare && !other.adopted && other.loaded && other.warm
          && other.cwd === input.cwd && isDeepStrictEqual(other.environment, environment));
        if (!spare.warm && partner) continue;
        this.spareWorkers.splice(index, 1);
        spare.adopted = true;
        return spare.child;
      }
    }
    return undefined;
  }

  private async launch(owner: WorkerInput, approvalPolicies?: WorkerApprovalPolicy[], environment = this.workerEnvironment(owner.input)): Promise<WorkerInfo> {
    const { input } = owner;
    const workerGeneration = randomUUID();
    const { env: _privateEnvironment, ...bootstrap } = input;
    const { rootSessionId: authorizationRootId, ...statelessBootstrap } = bootstrap;
    const command = owner.kind === 'session'
      ? WorkerBootstrapMessageSchema.parse({ ...bootstrap, type: 'bootstrap', workerGeneration, approvalPolicies, retiredSessionIds: this.retiredSessionIds.get(input.rootSessionId) })
      : owner.kind === 'usage'
        ? UsageWorkerBootstrapSchema.parse({ ...statelessBootstrap, authorizationRootId, type: 'usage.bootstrap', workerGeneration })
        : CompletionWorkerBootstrapSchema.parse({ ...statelessBootstrap, authorizationRootId, type: 'completion.bootstrap', workerGeneration });
    const ready = Promise.withResolvers<void>();
    const exited = Promise.withResolvers<void>();
    const workerRuntime = this.options.workerRuntime ?? defaultWorkerRuntime();
    const workerArgs = environment.BUN_BE_BUN === '1' || /(?:^|[\\/])bun(?:\.exe)?$/i.test(workerRuntime)
      ? ['--no-env-file', this.options.workerEntrypoint] : [this.options.workerEntrypoint];
    if (owner.kind === 'session') {
      const pendingSpare = this.spareWorkers.find(spare => !spare.adopted && spare.cwd === input.cwd);
      if (pendingSpare && !pendingSpare.loaded && pendingSpare.readyPromise) {
        await waitWithin(pendingSpare.readyPromise, 1_500).catch(() => { });
      }
    }
    // The last synchronous check before `spawn`: a start admitted before the
    // lease cannot materialize a worker here, and no await separates the two.
    this.assertWorktreeLeaseAllows(input.cwd);
    // A session launch adopts a pre-warmed process when one matches: it has
    // already paid the module load, so only the bootstrap remains.
    const adopted = owner.kind === 'session' ? this.adoptSpare(input, environment) : undefined;
    if (owner.kind === 'session' && !input.cwd.includes('ohpichamber-agent-ready-')) {
      const settled = this.spareRefill;
      void (settled ?? Promise.resolve()).then(() => {
        // Wait for the previous spawn to clear its own guard before asking. A
        // refused attempt stays blocked until the reaper's sweep, so a leased
        // workspace does not get a new attempt per launch as well.
        if (this.spareRefill === settled) this.spareRefill = undefined;
        this.warmSessionWorker(input, environment);
      });
    }
    const child = adopted ?? spawn(workerRuntime, workerArgs, {
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
      if (!reply.success || reply.data.type === 'idle' || reply.data.type === 'warm' || reply.data.workerGeneration !== workerGeneration) return;
      if (this.workerEntries.get(entry.info.rootSessionId) !== entry) return;
      if (entry.info.state !== 'starting' && entry.info.state !== 'ready') return;
      entry.lastActivityAt = Date.now();
      if (reply.data.type === 'ready') {
        if (entry.info.state !== 'starting') return;
        entry.info.state = 'ready';
        ready.resolve();
      } else if (reply.data.type === 'error') {
        ready.reject(new WorkerOperationError(reply.data.status ?? 503, reply.data.code, reply.data.detail ?? 'The worker failed to initialize'));
      } else if (reply.data.type === 'operation.error') {
        const pending = entry.pending.get(reply.data.commandId);
        if (pending) { entry.pending.delete(reply.data.commandId); pending.reject(new WorkerOperationError(reply.data.status, reply.data.code, reply.data.detail)); }
      } else if (reply.data.type === 'opened') {
        if (entry.kind === 'session') {
          entry.input.sessionFile = reply.data.sessionFile;
          this.options.callbacks?.onOpened?.(entry.info.rootSessionId, workerGeneration, reply.data.sessionFile, reply.data.seed);
        }
      } else if (reply.data.type === 'subagent') {
        if (entry.kind === 'session') this.options.callbacks?.onSubagent?.(entry.info.rootSessionId, workerGeneration, reply.data);
      } else if (reply.data.type === 'events') {
        if (entry.kind === 'session') this.options.callbacks?.onEvents?.(entry.info.rootSessionId, workerGeneration, reply.data.inputs);
      } else if (reply.data.type === 'interaction') {
        if (entry.kind === 'session') this.options.callbacks?.onInteraction?.(entry.info.rootSessionId, workerGeneration, reply.data.request);
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
          if (this.workerEntries.get(entry.info.rootSessionId) !== entry || entry.info.workerGeneration !== workerGeneration) return { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503, detail: 'The worker left service before its policy request was answered' } as const;
          if (descriptor && request.type === 'tool' && request.approvalId && request.toolCallId) {
            descriptor.approvalGrant = this.options.consumeApprovalGrant?.(entry.info.rootSessionId, workerGeneration, request);
          }
          return check ? check(entry.info.rootSessionId, request, descriptor) : { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503, detail: 'The Host has no policy check for worker operations' } as const;
        })().then(result => {
          if (this.workerEntries.get(entry.info.rootSessionId) === entry && entry.info.workerGeneration === workerGeneration && (entry.info.state === 'starting' || entry.info.state === 'ready') && entry.child.connected) entry.child.send({ type: 'policy.result', workerGeneration, requestId, result: WorkerPolicyResultSchema.parse(result) });
        }).catch(() => {
          if (this.workerEntries.get(entry.info.rootSessionId) === entry && entry.info.workerGeneration === workerGeneration && (entry.info.state === 'starting' || entry.info.state === 'ready') && entry.child.connected) entry.child.send({ type: 'policy.result', workerGeneration, requestId, result: { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503, detail: 'The Host policy check failed' } });
        });
      } else if (reply.data.type === 'action.cancel') {
        const handle = this.actions.get(reply.data.requestId);
        if (handle?.entry === entry) { this.actions.delete(reply.data.requestId); handle.controller.abort(); }
      } else if (reply.data.type === 'action.request') {
        const { requestId, request } = reply.data;
        if (this.actions.has(requestId) || request.sessionId !== entry.info.rootSessionId) return;
        const handle = { entry, controller: new AbortController() };
        this.actions.set(requestId, handle);
        const invoke = this.options.invokeHostAction;
        void (invoke ? invoke(entry.info.rootSessionId, request, handle.controller.signal) : Promise.resolve({ ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 } as const)).then(result => {
          if (this.actions.get(requestId) !== handle || handle.controller.signal.aborted) return;
          if (this.workerEntries.get(entry.info.rootSessionId) === entry && entry.child.connected && entry.info.state === 'ready') entry.child.send({ type: 'action.result', workerGeneration, requestId, result });
        }).catch(() => {
          if (this.actions.get(requestId) === handle && this.workerEntries.get(entry.info.rootSessionId) === entry && entry.child.connected) entry.child.send({ type: 'action.result', workerGeneration, requestId, result: { ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 } });
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
      for (const pending of entry.pending.values()) pending.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker stopped before the pending operation was answered'));
      entry.pending.clear();
      this.options.callbacks?.onExit?.(entry.info.rootSessionId, workerGeneration);
      exited.resolve();
    });
    try {
      if (!child.connected) ready.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker process is not connected'));
      else child.send(command, error => { if (error) ready.reject(error); });
      await waitWithin(entry.ready, this.options.startupTimeoutMs ?? 15_000);
      if (this.closing || this.workerEntries.get(entry.info.rootSessionId) !== entry || entry.info.state !== 'ready' || !child.connected) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker left service before the handshake completed');
      return { ...entry.info };
    } catch (error) {
      const code = error instanceof WorkerOperationError ? error.code : 'WORKER_INIT_FAILED';
      try {
        // Diagnostics stay code-only: the cause reaches the caller through the
        // problem response, and worker free text never enters a Host log.
        this.options.onDiagnostic?.({ level: 'error', rootSessionId: input.rootSessionId, workerGeneration, message: `Worker initialization failed (${code})` });
      } catch { /* diagnostics never affect lifecycle */ }
      await this.stopEntry(entry);
      throw error;
    }
  }

  private async stopEntry(entry: WorkerEntry, cooperativeGraceMs = 0): Promise<boolean> {
    if (entry.stopping) return entry.stopping;
    entry.stopping = (async () => {
      const wasStarting = entry.info.state === 'starting';
      entry.info.state = 'stopping';
      for (const [requestId, handle] of this.actions) if (handle.entry === entry) { this.actions.delete(requestId); handle.controller.abort(); }
      if (wasStarting) entry.rejectReady(new Error('SDK worker is stopping'));
      if (entry.child.connected) entry.child.send({ type: 'stop', workerGeneration: entry.info.workerGeneration });
      const stopped = await stopWorkerProcess(entry.child, entry.exited, { cooperativeGraceMs, stopTimeoutMs: this.options.stopTimeoutMs });
      for (const pending of entry.pending.values()) pending.reject(new Error('SDK worker is stopping'));
      entry.pending.clear();
      entry.info.state = 'stopped';
      if (this.workerEntries.get(entry.info.rootSessionId) === entry) this.workerEntries.delete(entry.info.rootSessionId);
      return stopped;
    })();
    return entry.stopping;
  }
}
