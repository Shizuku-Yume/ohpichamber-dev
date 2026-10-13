import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { WorkerBootstrapMessageSchema, WorkerOperationSchema, WorkerReplySchema, WorkerPolicyResultSchema } from '../protocol.ts';
import type { WorkerApprovalPolicy, WorkerBootstrap, WorkerInfo, WorkerInteraction, WorkerOperation, WorkerOperationResult, WorkerPolicyRequest, WorkerPolicyResult } from '../protocol.ts';
import type { ProjectionInput, ProjectionSeed } from '../projection/protocol.ts';
import type { ProblemCode } from '@openchamber/agent-contract';

export class WorkerOperationError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode) { super('SDK worker operation failed'); }
}

interface WorkerLifecycleCallbacks {
  onOpened?: (rootSessionId: string, generation: string, sessionFile: string, seed: ProjectionSeed) => void;
  onEvents?: (rootSessionId: string, generation: string, inputs: ProjectionInput[]) => void;
  onInteraction?: (rootSessionId: string, generation: string, interaction: WorkerInteraction) => void;
  onExit?: (rootSessionId: string, generation: string) => void;
}


interface WorkerEntry {
  input: WorkerBootstrap;
  info: WorkerInfo;
  child: ChildProcess;
  ready: Promise<void>;
  rejectReady: (error: Error) => void;
  exited: Promise<void>;
  stopping?: Promise<boolean>;
  pending: Map<string, { resolve: (result: WorkerOperationResult) => void; reject: (error: Error) => void }>;
}

export interface WorkerRegistryOptions {
  workerEntrypoint: string;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
  callbacks?: WorkerLifecycleCallbacks;
  policyCheck?: (rootSessionId: string, request: WorkerPolicyRequest) => Promise<WorkerPolicyResult>;
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
  private closing = false;

  constructor(private readonly options: WorkerRegistryOptions) {}

  list(): WorkerInfo[] {
    return [...this.entries.values()].map(entry => ({ ...entry.info }));
  }

  async request(rootSessionId: string, operation: WorkerOperation): Promise<WorkerOperationResult> {
    const parsed = WorkerOperationSchema.parse(operation);
    const entry = this.entries.get(rootSessionId);
    if (this.closing || !entry || entry.info.state !== 'ready' || !entry.child.connected) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    const commandId = randomUUID();
    const result = new Promise<WorkerOperationResult>((resolve, reject) => entry.pending.set(commandId, { resolve, reject }));
    entry.child.send({ type: 'operation', workerGeneration: entry.info.workerGeneration, commandId, operation: parsed }, error => {
      if (!error) return;
      const pending = entry.pending.get(commandId); entry.pending.delete(commandId); pending?.reject(new WorkerOperationError(503, 'SERVICE_UNAVAILABLE'));
    });
    return result;
  }
  async catalog(rootSessionId: string, operation: WorkerOperation): Promise<WorkerOperationResult> { return this.request(rootSessionId, operation); }

  async start(input: WorkerBootstrap, replace = false, approvalPolicies?: WorkerApprovalPolicy[]): Promise<WorkerInfo> {
    return this.withRoot(input.rootSessionId, async () => {
      if (this.closing) throw new Error('Worker admission is closed');
      const previous = this.entries.get(input.rootSessionId);
      if (previous?.info.state === 'ready' && !replace) return { ...previous.info };
      if (previous) await this.stopEntry(previous);
      if (this.closing) throw new Error('Worker admission is closed');
      return this.launch(input, approvalPolicies);
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

  private async launch(input: WorkerBootstrap, approvalPolicies?: WorkerApprovalPolicy[]): Promise<WorkerInfo> {
    const workerGeneration = randomUUID();
    const ready = Promise.withResolvers<void>();
    const exited = Promise.withResolvers<void>();
    const env: NodeJS.ProcessEnv = { ...process.env, ...input.env, PI_CODING_AGENT_DIR: input.agentDirectory };
    delete env.OHPICHAMBER_INTERNAL_SECRET;
    const child = spawn(process.execPath, ['--no-env-file', this.options.workerEntrypoint], {
      cwd: input.cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const entry: WorkerEntry = {
      input,
      info: { rootSessionId: input.rootSessionId, projectId: input.projectId, workspaceId: input.workspaceId, workerGeneration, state: 'starting' },
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
        this.options.callbacks?.onOpened?.(input.rootSessionId, workerGeneration, reply.data.sessionFile, reply.data.seed);
      } else if (reply.data.type === 'events') {
        this.options.callbacks?.onEvents?.(input.rootSessionId, workerGeneration, reply.data.inputs);
      } else if (reply.data.type === 'interaction') {
        this.options.callbacks?.onInteraction?.(input.rootSessionId, workerGeneration, reply.data.request);
      } else if (reply.data.type === 'policy.request') {
        const check = this.options.policyCheck;
        const requestId = reply.data.requestId;
        const request = reply.data.request;
        void (check ? check(input.rootSessionId, request) : Promise.resolve({ allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 } as const)).then(result => {
          if (entry.child.connected) entry.child.send({ type: 'policy.result', workerGeneration, requestId, result: WorkerPolicyResultSchema.parse(result) });
        }).catch(() => {
          if (entry.child.connected) entry.child.send({ type: 'policy.result', workerGeneration, requestId, result: { allowed: false, code: 'SERVICE_UNAVAILABLE', status: 503 } });
        });
      } else if (reply.data.type === 'result') {
        const pending = entry.pending.get(reply.data.commandId);
        if (pending) { entry.pending.delete(reply.data.commandId); pending.resolve(reply.data.result); }
      }
    });
    child.once('error', () => ready.reject(new Error('SDK worker could not start')));
    child.once('close', () => {
      const wasStarting = entry.info.state === 'starting';
      if (entry.info.state !== 'stopping') entry.info.state = 'crashed';
      if (wasStarting) ready.reject(new Error('SDK worker exited before initialization'));
      for (const pending of entry.pending.values()) pending.reject(new Error('SDK worker exited'));
      entry.pending.clear();
      this.options.callbacks?.onExit?.(input.rootSessionId, workerGeneration);
      exited.resolve();
    });
    const command = WorkerBootstrapMessageSchema.parse({
      type: 'bootstrap', rootSessionId: input.rootSessionId, workerGeneration,
      projectId: input.projectId, workspaceId: input.workspaceId,
      cwd: input.cwd, agentDirectory: input.agentDirectory,
      sessionsDirectory: input.sessionsDirectory, sessionFile: input.sessionFile, mcpConfigPath: input.mcpConfigPath, options: input.options,
      approvalPolicies,
    });
    if (child.connected) child.send(command);
    try {
      await waitWithin(entry.ready, this.options.startupTimeoutMs ?? 15_000);
      return { ...entry.info };
    } catch (error) {
      await this.stopEntry(entry);
      throw error;
    }
  }

  private async stopEntry(entry: WorkerEntry): Promise<boolean> {
    if (entry.stopping) return entry.stopping;
    entry.stopping = (async () => {
      entry.info.state = 'stopping';
      entry.rejectReady(new Error('SDK worker is stopping'));
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
