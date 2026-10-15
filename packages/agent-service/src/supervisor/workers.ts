import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { CompletionWorkerBootstrapSchema, WorkerBootstrapSchema, WorkerBootstrapMessageSchema, WorkerOperationSchema, WorkerReplySchema, WorkerPolicyResultSchema } from '../protocol.ts';
import type { CompletionWorkerBootstrap, WorkerBootstrap, WorkerApprovalPolicy, WorkerInfo, WorkerOperation, WorkerOperationResult, WorkerPolicyRequest, WorkerPolicyResult, WorkerInteraction } from '../protocol.ts';
import type { ProjectionSeed, ProjectionInput } from '../projection/protocol.ts';
import type { NativeOperationDescriptor, HostActionRequest, HostActionResult, HostNativePolicySnapshot } from './host-authorization-protocol.ts';
import { describeNativeOperation } from '../worker/native-policy-descriptor.ts';
import type { JsonObject, ProblemCode } from '@openchamber/agent-contract';
import type { NativeApprovalGrant } from '../native-policy-protocol.ts';

export class WorkerOperationError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, readonly details?: JsonObject) { super('SDK worker operation failed'); }
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
export type RegisteredWorkerInfo = WorkerInfo & { kind: 'session' | 'stateless' };
export type WorkerAuthorizationScope = Pick<WorkerBootstrap, 'rootSessionId' | 'projectId' | 'workspaceId' | 'cwd' | 'agentDirectory' | 'agentDirectoryId'> & { workerGeneration: string };

type WorkerInput = { kind: 'session'; input: WorkerBootstrap } | { kind: 'stateless'; input: StatelessWorkerInput };
type WorkerEntry = WorkerInput & {
  info: WorkerInfo;
  child: ChildProcess;
  ready: Promise<void>;
  rejectReady: (error: Error) => void;
  exited: Promise<void>;
  stopping?: Promise<boolean>;
  pending: Map<string, { resolve: (result: WorkerOperationResult) => void; reject: (error: Error) => void }>;
  policySnapshot?: HostNativePolicySnapshot;
};
type ActionHandle = { entry: WorkerEntry; controller: AbortController };

export interface WorkerRegistryOptions {
  workerEntrypoint: string;
  workerRuntime?: string;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
  policyCheck?: (rootSessionId: string, request: WorkerPolicyRequest, descriptor?: NativeOperationDescriptor) => Promise<WorkerPolicyResult>;
  invokeHostAction?: (rootSessionId: string, request: HostActionRequest, signal: AbortSignal) => Promise<HostActionResult>;
  consumeApprovalGrant?: (rootSessionId: string, generation: string, request: Extract<WorkerPolicyRequest, { type: 'tool' }>) => NativeApprovalGrant | undefined;
  prepareBootstrap?: (input: WorkerBootstrap) => Promise<WorkerBootstrap>;
  callbacks?: WorkerLifecycleCallbacks;
}
function defaultWorkerRuntime(): string {
  if (process.execPath.includes('bun')) return process.execPath;
  return Bun.which('bun') ?? process.execPath;
}

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
  private readonly entries = new Map<string, WorkerEntry>();
  private readonly mutations = new Map<string, Promise<void>>();
  private readonly actions = new Map<string, ActionHandle>();
  private closing = false;

  constructor(private readonly options: WorkerRegistryOptions) {}

  list(): RegisteredWorkerInfo[] {
    return [...this.entries.values()].map(entry => ({ ...entry.info, kind: entry.kind }));
  }

  info(rootSessionId: string): WorkerInfo | undefined {
    const entry = this.entries.get(rootSessionId);
    return entry === undefined ? undefined : { ...entry.info };
  }

  bootstrap(rootSessionId: string): WorkerBootstrap | undefined {
    const entry = this.entries.get(rootSessionId);
    return entry?.kind === 'session' ? structuredClone(entry.input) : undefined;
  }
  authorizationPolicy(workspaceId: string, agentDirectoryId: string, rootSessionId?: string): HostNativePolicySnapshot {
    const candidates = rootSessionId === undefined ? [...this.entries.values()] : [this.entries.get(rootSessionId)];
    const entry = candidates.find(candidate => candidate?.input.workspaceId === workspaceId && candidate.input.agentDirectoryId === agentDirectoryId && candidate.child.connected && (candidate.info.state === 'starting' || candidate.info.state === 'ready') && candidate.policySnapshot !== undefined);
    if (!entry?.policySnapshot) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    return structuredClone(entry.policySnapshot);
  }

  authorizationScope(rootSessionId: string): WorkerAuthorizationScope | undefined {
    const entry = this.entries.get(rootSessionId);
    if (this.closing || !entry || !entry.child.connected || (entry.info.state !== 'starting' && entry.info.state !== 'ready')) return undefined;
    const { projectId, workspaceId, cwd, agentDirectory, agentDirectoryId } = entry.input;
    return { rootSessionId, workerGeneration: entry.info.workerGeneration, projectId, workspaceId, cwd, agentDirectory, agentDirectoryId };
  }

  async request(rootSessionId: string, operation: WorkerOperation, expectedGeneration?: string): Promise<WorkerOperationResult> {
    const parsed = WorkerOperationSchema.parse(operation);
    const entry = this.entries.get(rootSessionId);
    if (entry && expectedGeneration !== undefined && expectedGeneration !== entry.info.workerGeneration) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
    if (this.closing || !entry || entry.info.state !== 'ready' || !entry.child.connected) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    const commandId = randomUUID();
    const result = new Promise<WorkerOperationResult>((resolve, reject) => entry.pending.set(commandId, { resolve, reject }));
    entry.child.send({ type: 'operation', workerGeneration: entry.info.workerGeneration, commandId, operation: parsed }, error => {
      if (!error) return;
      const pending = entry.pending.get(commandId); entry.pending.delete(commandId); pending?.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE'));
    });
    return result;
  }

  async start(input: WorkerBootstrap, replace = false, approvalPolicies?: WorkerApprovalPolicy[]): Promise<WorkerInfo> {
    return this.withRoot(input.rootSessionId, async () => {
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      const previous = this.entries.get(input.rootSessionId);
      if (previous?.kind === 'stateless') throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if (previous?.info.state === 'ready' && !replace) return { ...previous.info };
      if (previous) await this.stopEntry(previous);
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      const prepared = WorkerBootstrapSchema.parse(this.options.prepareBootstrap ? await this.options.prepareBootstrap(input) : input);
      if (prepared.rootSessionId !== input.rootSessionId) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      return this.launch({ kind: 'session', input: prepared }, approvalPolicies);
    });
  }

  async startStateless(input: StatelessWorkerInput, replace = false): Promise<WorkerInfo> {
    return this.withRoot(input.rootSessionId, async () => {
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      const previous = this.entries.get(input.rootSessionId);
      if (previous?.kind === 'session') throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if (previous?.info.state === 'ready' && !replace) return { ...previous.info };
      if (previous) await this.stopEntry(previous);
      if (this.closing) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      return this.launch({ kind: 'stateless', input: structuredClone(input) });
    });
  }

  async stop(rootSessionId: string): Promise<boolean> {
    return this.withRoot(rootSessionId, async () => {
      const entry = this.entries.get(rootSessionId);
      return entry ? this.stopEntry(entry) : true;
    });
  }

  async close(): Promise<void> {
    this.closing = true;
    await Promise.all([...this.entries.values()].map(entry => this.stopEntry(entry)));
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

  private async launch(owner: WorkerInput, approvalPolicies?: WorkerApprovalPolicy[]): Promise<WorkerInfo> {
    const { input } = owner;
    const workerGeneration = randomUUID();
    const { env: privateEnvironment, ...bootstrap } = input;
    const { rootSessionId: authorizationRootId, ...statelessBootstrap } = bootstrap;
    const command = owner.kind === 'session'
      ? WorkerBootstrapMessageSchema.parse({ ...bootstrap, type: 'bootstrap', workerGeneration, approvalPolicies })
      : CompletionWorkerBootstrapSchema.parse({ ...statelessBootstrap, authorizationRootId, type: 'completion.bootstrap', workerGeneration });
    const ready = Promise.withResolvers<void>();
    const exited = Promise.withResolvers<void>();
    const env: NodeJS.ProcessEnv = { ...process.env, ...privateEnvironment, PI_CODING_AGENT_DIR: input.agentDirectory };
    delete env.OHPICHAMBER_INTERNAL_SECRET;
    const workerRuntime = this.options.workerRuntime ?? defaultWorkerRuntime();
    const workerArgs = /(?:^|[\\/])bun(?:\.exe)?$/i.test(workerRuntime) ? ['--no-env-file', this.options.workerEntrypoint] : [this.options.workerEntrypoint];
    const child = spawn(workerRuntime, workerArgs, {
      cwd: input.cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const entry: WorkerEntry = {
      ...owner,
      info: { rootSessionId: authorizationRootId, projectId: input.projectId, workspaceId: input.workspaceId, workerGeneration, state: 'starting' },
      child,
      ready: ready.promise,
      rejectReady: ready.reject,
      exited: exited.promise,
      pending: new Map(),
    };
    this.entries.set(input.rootSessionId, entry);
    child.on('message', raw => {
      const reply = WorkerReplySchema.safeParse(raw);
      if (!reply.success || reply.data.workerGeneration !== workerGeneration) return;
      if (this.entries.get(input.rootSessionId) !== entry) return;
      if (entry.info.state !== 'starting' && entry.info.state !== 'ready') return;
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
          if (this.entries.get(input.rootSessionId) !== entry || entry.info.workerGeneration !== workerGeneration) return { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 } as const;
          if (descriptor && request.type === 'tool' && request.toolName === 'bash' && request.approvalId && request.toolCallId) {
            descriptor.approvalGrant = this.options.consumeApprovalGrant?.(input.rootSessionId, workerGeneration, request);
          }
          return check ? check(input.rootSessionId, request, descriptor) : { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 } as const;
        })().then(result => {
          if (this.entries.get(input.rootSessionId) === entry && entry.info.workerGeneration === workerGeneration && (entry.info.state === 'starting' || entry.info.state === 'ready') && entry.child.connected) entry.child.send({ type: 'policy.result', workerGeneration, requestId, result: WorkerPolicyResultSchema.parse(result) });
        }).catch(() => {
          if (this.entries.get(input.rootSessionId) === entry && entry.info.workerGeneration === workerGeneration && (entry.info.state === 'starting' || entry.info.state === 'ready') && entry.child.connected) entry.child.send({ type: 'policy.result', workerGeneration, requestId, result: { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 } });
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
          if (this.entries.get(input.rootSessionId) === entry && entry.child.connected && entry.info.state === 'ready') entry.child.send({ type: 'action.result', workerGeneration, requestId, result });
        }).catch(() => {
          if (this.actions.get(requestId) === handle && this.entries.get(input.rootSessionId) === entry && entry.child.connected) entry.child.send({ type: 'action.result', workerGeneration, requestId, result: { ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 } });
        }).finally(() => { if (this.actions.get(requestId) === handle) this.actions.delete(requestId); });
      } else if (reply.data.type === 'result') {
        const pending = entry.pending.get(reply.data.commandId);
        if (pending) { entry.pending.delete(reply.data.commandId); pending.resolve(reply.data.result); }
      }
    });
    child.once('error', () => ready.reject(new Error('SDK worker could not start')));
    child.once('close', () => {
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
      if (this.closing || this.entries.get(input.rootSessionId) !== entry || entry.info.state !== 'ready' || !child.connected) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      return { ...entry.info };
    } catch (error) {
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
      try {
        await waitWithin(entry.exited, this.options.stopTimeoutMs ?? 5_000);
      } catch {
        if (entry.child.exitCode === null && entry.child.signalCode === null) entry.child.kill('SIGKILL');
        await waitWithin(entry.exited, 500);
      }
      for (const pending of entry.pending.values()) pending.reject(new Error('SDK worker is stopping'));
      entry.pending.clear();
      entry.info.state = 'stopped';
      if (this.entries.get(entry.info.rootSessionId) === entry) this.entries.delete(entry.info.rootSessionId);
      return entry.child.exitCode === 0;
    })();
    return entry.stopping;
  }
}
