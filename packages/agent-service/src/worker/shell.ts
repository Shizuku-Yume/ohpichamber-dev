import type {
  ShellJob, ShellJobIdentity, ShellOutput, ShellSnapshot, ShellStartRequest,
  ShellStopRequest, ShellTermination,
} from '@openchamber/agent-contract';
import { AsyncJobManager, type AsyncJob, type BashJobEvent } from '@oh-my-pi/pi-coding-agent/async/job-manager';
import { executeBash, releaseShellSessions, type BashResult } from '@oh-my-pi/pi-coding-agent/exec/bash-executor';
import type { AgentRegistry } from '@oh-my-pi/pi-coding-agent/registry/agent-registry';
import { ProjectionError } from '../projection/journal.ts';
import { ShellOperationSchema, type ShellOperation, type ShellResult } from '../shell/protocol.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_OUTPUT_BYTES = 65_536;
type Running = Extract<ShellJob, { status: 'running' }>;
type Ended = Extract<ShellJob, { status: 'ended' }>;
type Job = {
  identity: Running;
  native?: AsyncJob;
  output: Uint8Array;
  totalBytes: bigint;
  result?: Pick<BashResult, 'exitCode' | 'cancelled' | 'timedOut'>;
  stopped: boolean;
  origin: 'guest' | 'agent';
  sessionKey: string;
  outputUnavailable?: true;
};

export interface WorkerShellContext {
  manager: AsyncJobManager;
  workspaceId: string;
  projectId: string;
  sessionId: string;
  workerGeneration: string;
  epoch: string;
  cwd: string;
  nativeOwner?: { agentId: string; registry: AgentRegistry };
}

export class WorkerShell {
  private readonly jobs = new Map<string, Job>();
  private readonly nativeJobs = new Map<string, string>();
  private readonly ended = new Map<string, { job: Ended; output: Uint8Array; outputUnavailable?: true }>();
  private revision = 0n;
  private readonly unsubscribe: () => void;
  private observationFailure: unknown;
  private closed = false;

  constructor(private readonly context: WorkerShellContext) {
    this.unsubscribe = context.manager.observeBashJobs(event => {
      try { this.observeNative(event); }
      catch (error) {
        const jobId = this.nativeJobs.get(event.jobId);
        const job = jobId === undefined ? undefined : this.jobs.get(jobId);
        if (job) job.outputUnavailable = true;
        else this.observationFailure = error;
        throw error;
      }
    });
  }

  private observeNative(event: BashJobEvent): void {
    if (event.type === 'started') {
      const native = this.context.manager.getJob(event.jobId);
      if (this.closed || !native || native.type !== 'bash' || !native.process || !this.ownsNative(native)) {
        throw new ProjectionError(503, 'SHELL_OUTPUT_UNAVAILABLE', 'Native shell ownership could not be observed');
      }
      if (this.nativeJobs.has(native.id)) {
        throw new ProjectionError(503, 'SHELL_OUTPUT_UNAVAILABLE', 'Native shell job was observed twice');
      }
      const jobId = `native:${JSON.stringify([native.ownerId, native.id])}`;
      const job: Job = {
        identity: {
          jobId, sessionId: this.context.sessionId, epoch: this.context.epoch,
          workerGeneration: this.context.workerGeneration, workspaceId: this.context.workspaceId,
          projectId: this.context.projectId, command: native.process.command, background: native.foreground !== true,
          startedAt: native.startTime, outputCursor: '0', status: 'running',
        },
        native, origin: 'agent', sessionKey: event.sessionKey,
        output: new Uint8Array(), totalBytes: 0n, stopped: false,
      };
      this.jobs.set(jobId, job);
      this.nativeJobs.set(native.id, jobId);
      this.revision++;
      void native.promise.then(() => this.finish(jobId));
      return;
    }
    const jobId = this.nativeJobs.get(event.jobId);
    const job = jobId === undefined ? undefined : this.jobs.get(jobId);
    if (!job) throw new ProjectionError(503, 'SHELL_OUTPUT_UNAVAILABLE', 'Native shell output has no observed owner');
    if (event.type === 'chunk') this.append(job, event.chunk);
    else job.result = { exitCode: event.exitCode, cancelled: event.cancelled, timedOut: event.timedOut };
  }

  private ownsNative(native: AsyncJob): boolean {
    const owner = this.context.nativeOwner;
    if (!owner || native.ownerId === undefined) return false;
    if (native.ownerId === owner.agentId) return true;
    let ref = owner.registry.get(native.ownerId);
    if (ref?.session?.asyncJobManager !== this.context.manager) return false;
    const visited = new Set<string>();
    while (ref && !visited.has(ref.id)) {
      if (ref.id === owner.agentId) return true;
      visited.add(ref.id);
      ref = ref.parentId === undefined ? undefined : owner.registry.get(ref.parentId);
    }
    return false;
  }

  private visible(job: Job): boolean { return job.origin === 'guest' || job.native?.foreground !== true; }

  async operation(operation: ShellOperation): Promise<ShellResult> {
    if (this.closed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Shell worker is closed');
    if (this.observationFailure) throw new ProjectionError(503, 'SHELL_OUTPUT_UNAVAILABLE', 'Native shell observation failed');
    for (const job of this.jobs.values()) {
      if (job.origin === 'agent' && this.visible(job) && !job.identity.background) {
        job.identity.background = true;
        this.revision++;
      }
    }
    const parsed = ShellOperationSchema.parse(operation);
    if (parsed.type === 'start') return this.start(parsed.request);
    if (parsed.type === 'output') return this.output(parsed.request.job, parsed.request.cursor, parsed.request.tailBytes);
    if (parsed.type === 'snapshot') return { type: 'snapshot', snapshot: this.snapshot() };
    return { type: 'stop', result: await this.stop(parsed.request) };
  }

  private start(request: ShellStartRequest): ShellResult {
    const jobId = crypto.randomUUID();
    const identity: Running = {
      jobId, sessionId: this.context.sessionId, epoch: this.context.epoch,
      workerGeneration: this.context.workerGeneration, workspaceId: this.context.workspaceId,
      projectId: this.context.projectId, command: request.command, background: request.background,
      startedAt: Date.now(), outputCursor: '0', status: 'running',
    };
    const job: Job = {
      identity, output: new Uint8Array(), totalBytes: 0n, stopped: false,
      origin: 'guest', sessionKey: `${this.context.sessionId}:shell:${jobId}`,
    };
    const nativeId = this.context.manager.register('bash', request.command, async ({ signal, reportProgress }) => {
      const result = await executeBash(request.command, {
        cwd: this.context.cwd,
        timeout: request.timeoutMs,
        signal,
        sessionKey: job.sessionKey,
        onChunk: chunk => this.append(job, chunk),
        onPreview: preview => { void reportProgress(preview); },
      });
      job.result = result;
      // The final preview is cumulative and may elide bytes. Only onChunk advances cursors.
      if (result.cancelled) throw new Error(result.timedOut ? 'Command timed out' : 'Command stopped');
      return result.output;
    }, { id: jobId, ownerId: this.context.sessionId, foreground: true });
    const native = this.context.manager.getJob(nativeId);
    if (!native) throw new ProjectionError(503, 'SHELL_OUTPUT_UNAVAILABLE', 'Native shell job was not registered');
    job.native = native;
    this.jobs.set(jobId, job);
    this.revision++;
    void native.promise.then(() => this.finish(jobId));
    return { type: 'start', job: identity };
  }

  private append(job: Job, text: string): void {
    const chunk = encoder.encode(text);
    if (chunk.length === 0) return;
    job.totalBytes += BigInt(chunk.length);
    if (chunk.length >= MAX_OUTPUT_BYTES) {
      let start = chunk.length - MAX_OUTPUT_BYTES;
      while (start < chunk.length && (chunk[start]! & 0xc0) === 0x80) start++;
      job.output = chunk.slice(start);
    } else {
      let start = Math.max(0, job.output.length - (MAX_OUTPUT_BYTES - chunk.length));
      while (start < job.output.length && (job.output[start]! & 0xc0) === 0x80) start++;
      const retained = job.output.length - start;
      const output = new Uint8Array(retained + chunk.length);
      output.set(job.output.subarray(start));
      output.set(chunk, retained);
      job.output = output;
    }
    this.revision++;
  }

  private finish(jobId: string): void {
    const item = this.jobs.get(jobId);
    if (!item?.native || item.native.endTime === undefined) return;
    this.jobs.delete(jobId);
    if (item.origin === 'agent') this.nativeJobs.delete(item.native.id);
    releaseShellSessions(item.sessionKey);
    if (!this.visible(item)) {
      this.revision++;
      return;
    }
    const result = item.result;
    let termination: ShellTermination;
    if (result?.timedOut) termination = { reason: 'timeout', exitCode: null };
    else if (item.stopped && (result ? result.cancelled : item.native.status === 'cancelled')) {
      termination = { reason: 'stopped', exitCode: result?.exitCode ?? null };
    } else if (result?.exitCode !== undefined) termination = { reason: 'exit', exitCode: result.exitCode };
    else termination = { reason: 'signal', exitCode: null };
    const job: Ended = {
      ...item.identity, background: item.origin === 'agent' || item.identity.background,
      status: 'ended', endedAt: item.native.endTime,
      outputCursor: item.totalBytes.toString(), termination,
    };
    this.ended.set(jobId, { job, output: item.output, outputUnavailable: item.outputUnavailable });
    if (this.ended.size > 200) {
      let oldest: string | undefined;
      let oldestEnd = Infinity;
      for (const [id, ended] of this.ended) {
        if (ended.job.endedAt < oldestEnd) { oldest = id; oldestEnd = ended.job.endedAt; }
      }
      if (oldest !== undefined) this.ended.delete(oldest);
    }
    this.revision++;
  }

  private assertIdentity(expected: ShellJobIdentity, requested: ShellJobIdentity): void {
    if (expected.sessionId !== requested.sessionId || expected.jobId !== requested.jobId) {
      throw new ProjectionError(404, 'SHELL_NOT_FOUND', 'Shell job was not found');
    }
    if (expected.epoch !== requested.epoch || expected.workerGeneration !== requested.workerGeneration) {
      throw new ProjectionError(410, 'RESYNC_REQUIRED', 'Shell observation is no longer current');
    }
  }

  private owner(identity: ShellJobIdentity): Job {
    const job = this.jobs.get(identity.jobId);
    if (!job || !this.visible(job)) throw new ProjectionError(404, 'SHELL_NOT_FOUND', 'Running shell job was not found');
    this.assertIdentity(job.identity, identity);
    return job;
  }

  private output(identity: ShellJobIdentity, cursor: string, tailBytes: number): ShellResult {
    const running = this.jobs.get(identity.jobId);
    const ended = this.ended.get(identity.jobId);
    if (running && !this.visible(running)) throw new ProjectionError(404, 'SHELL_NOT_FOUND', 'Shell output was not found');
    const stored = running?.output ?? ended?.output;
    if (!stored) throw new ProjectionError(404, 'SHELL_NOT_FOUND', 'Shell output was not found');
    this.assertIdentity(running?.identity ?? ended!.job, identity);
    if (running?.outputUnavailable || ended?.outputUnavailable) throw new ProjectionError(503, 'SHELL_OUTPUT_UNAVAILABLE', 'Native shell output observation failed');
    const total = running?.totalBytes ?? BigInt(ended!.job.outputCursor);
    const requested = BigInt(cursor);
    if (requested > total) throw new ProjectionError(400, 'INVALID_CURSOR', 'Shell cursor exceeds current output');
    const retainedStart = total - BigInt(stored.length);
    let start = Number((requested < retainedStart ? retainedStart : requested) - retainedStart);
    // A retained byte window may start inside a UTF-8 code point.
    while (start < stored.length && (stored[start]! & 0xc0) === 0x80) start++;
    let end = Math.min(stored.length, start + tailBytes);
    if (end < stored.length) {
      while (end > start && (stored[end]! & 0xc0) === 0x80) end--;
    }
    const text = decoder.decode(stored.subarray(start, end));
    const startCursor = retainedStart + BigInt(start);
    const output: ShellOutput = {
      job: identity, requestedCursor: cursor, startCursor: startCursor.toString(),
      cursor: (retainedStart + BigInt(end)).toString(), skippedBytes: (startCursor - requested).toString(),
      output: text, ended: Boolean(ended),
    };
    return { type: 'output', output };
  }

  private snapshot(): ShellSnapshot {
    return {
      scope: { kind: 'session', sessionId: this.context.sessionId },
      epoch: this.context.epoch, revision: this.revision.toString(),
      running: [...this.jobs.values()].filter(item => this.visible(item)).map(item => ({ ...item.identity, outputCursor: item.totalBytes.toString() })),
      ended: [...this.ended.values()].map(item => item.job).sort((left, right) => left.endedAt - right.endedAt),
      recovery: { priorEpochs: 'invalidated' },
    };
  }

  private async stop(request: ShellStopRequest) {
    const item = this.owner(request.job);
    if (!item.native || !this.context.manager.cancel(item.native.id, { ownerId: item.native.ownerId })) {
      throw new ProjectionError(409, 'SHELL_NOT_FOUND', 'Shell job is no longer running');
    }
    item.stopped = true;
    await item.native.promise;
    this.finish(request.job.jobId);
    const ended = this.ended.get(request.job.jobId)?.job;
    if (!ended || ended.termination.reason !== 'stopped') {
      throw new ProjectionError(503, 'SHELL_STOP_TIMEOUT', 'Shell execution did not end with a stopped termination');
    }
    return { job: ended };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    const jobs = [...this.jobs.values()];
    for (const item of jobs) {
      if (item.native && this.context.manager.cancel(item.native.id, { ownerId: item.native.ownerId })) item.stopped = true;
    }
    await Promise.all(jobs.map(item => item.native?.promise));
    for (const item of jobs) this.finish(item.identity.jobId);
  }
}
