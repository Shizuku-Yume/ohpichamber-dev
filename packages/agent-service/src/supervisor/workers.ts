import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { WorkerBootstrapMessageSchema, WorkerReplySchema } from '../protocol.ts';
import type { WorkerBootstrap, WorkerInfo } from '../protocol.ts';

interface WorkerEntry {
  input: WorkerBootstrap;
  info: WorkerInfo;
  child: ChildProcess;
  ready: Promise<void>;
  rejectReady: (error: Error) => void;
  exited: Promise<void>;
  stopping?: Promise<boolean>;
}

export interface WorkerRegistryOptions {
  workerEntrypoint: string;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
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

  async start(input: WorkerBootstrap, replace = false): Promise<WorkerInfo> {
    return this.withRoot(input.rootSessionId, async () => {
      if (this.closing) throw new Error('Worker admission is closed');
      const previous = this.entries.get(input.rootSessionId);
      if (previous?.info.state === 'ready' && !replace) return { ...previous.info };
      if (previous) await this.stopEntry(previous);
      if (this.closing) throw new Error('Worker admission is closed');
      return this.launch(input);
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

  private async launch(input: WorkerBootstrap): Promise<WorkerInfo> {
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
    };
    this.entries.set(input.rootSessionId, entry);
    child.on('message', raw => {
      const reply = WorkerReplySchema.safeParse(raw);
      if (!reply.success || reply.data.workerGeneration !== workerGeneration) return;
      if (this.entries.get(input.rootSessionId) !== entry || entry.info.state !== 'starting') return;
      if (reply.data.type === 'ready') {
        entry.info.state = 'ready';
        ready.resolve();
      } else if (reply.data.type === 'error') {
        ready.reject(new Error('SDK worker initialization failed'));
      }
    });
    child.once('error', () => ready.reject(new Error('SDK worker could not start')));
    child.once('close', () => {
      const wasStarting = entry.info.state === 'starting';
      if (entry.info.state !== 'stopping') entry.info.state = 'crashed';
      if (wasStarting) ready.reject(new Error('SDK worker exited before initialization'));
      exited.resolve();
    });
    const command = WorkerBootstrapMessageSchema.parse({
      type: 'bootstrap', rootSessionId: input.rootSessionId, workerGeneration,
      cwd: input.cwd, agentDirectory: input.agentDirectory,
      sessionsDirectory: input.sessionsDirectory,
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
      entry.info.state = 'stopped';
      if (this.entries.get(entry.info.rootSessionId) === entry) this.entries.delete(entry.info.rootSessionId);
      return entry.child.exitCode === 0;
    })();
    return entry.stopping;
  }
}
