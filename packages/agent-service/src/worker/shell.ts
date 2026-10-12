import type {
  ShellJob, ShellJobIdentity, ShellOutput, ShellSnapshot, ShellStartRequest,
  ShellStopRequest, ShellTermination,
} from '@openchamber/agent-contract';
import { AsyncJobManager, type AsyncJob } from '@oh-my-pi/pi-coding-agent/async/job-manager';
import { executeBash, releaseShellSessions, type BashResult } from '@oh-my-pi/pi-coding-agent/exec/bash-executor';
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
  result?: BashResult;
  stopped: boolean;
};

export interface WorkerShellContext {
  manager: AsyncJobManager;
  workspaceId: string;
  projectId: string;
  sessionId: string;
  workerGeneration: string;
  epoch: string;
  cwd: string;
}

export class WorkerShell {
  private readonly jobs = new Map<string, Job>();
  private readonly ended = new Map<string, { job: Ended; output: Uint8Array }>();
  private revision = 0n;
  private closed = false;

  constructor(private readonly context: WorkerShellContext) {}

  async operation(operation: ShellOperation): Promise<ShellResult> {
    if (this.closed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Shell worker is closed');
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
    const job: Job = { identity, output: new Uint8Array(), totalBytes: 0n, stopped: false };
    const nativeId = this.context.manager.register('bash', request.command, async ({ signal, reportProgress }) => {
      const result = await executeBash(request.command, {
        cwd: this.context.cwd,
        timeout: request.timeoutMs,
        signal,
        sessionKey: `${this.context.sessionId}:shell:${jobId}`,
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
      job.output = chunk.slice(chunk.length - MAX_OUTPUT_BYTES);
    } else {
      const retained = Math.min(job.output.length, MAX_OUTPUT_BYTES - chunk.length);
      const output = new Uint8Array(retained + chunk.length);
      output.set(job.output.subarray(job.output.length - retained));
      output.set(chunk, retained);
      job.output = output;
    }
    this.revision++;
  }

  private finish(jobId: string): void {
    const item = this.jobs.get(jobId);
    if (!item?.native || item.native.status === 'running') return;
    const result = item.result;
    let termination: ShellTermination;
    if (result?.timedOut) termination = { reason: 'timeout', exitCode: null };
    else if (item.stopped && (result?.cancelled || item.native.status === 'cancelled')) {
      termination = { reason: 'stopped', exitCode: result?.exitCode ?? null };
    } else if (result?.exitCode !== undefined) termination = { reason: 'exit', exitCode: result.exitCode };
    else termination = { reason: 'signal', exitCode: null };
    const job: Ended = {
      ...item.identity, status: 'ended', endedAt: Date.now(),
      outputCursor: item.totalBytes.toString(), termination,
    };
    this.jobs.delete(jobId);
    this.ended.set(jobId, { job, output: item.output });
    releaseShellSessions(`${this.context.sessionId}:shell:${jobId}`);
    while (this.ended.size > 200) {
      const oldest = this.ended.keys().next().value;
      if (oldest === undefined) break;
      this.ended.delete(oldest);
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
    if (!job) throw new ProjectionError(404, 'SHELL_NOT_FOUND', 'Running shell job was not found');
    this.assertIdentity(job.identity, identity);
    return job;
  }

  private output(identity: ShellJobIdentity, cursor: string, tailBytes: number): ShellResult {
    const running = this.jobs.get(identity.jobId);
    const ended = this.ended.get(identity.jobId);
    const stored = running?.output ?? ended?.output;
    if (!stored) throw new ProjectionError(404, 'SHELL_NOT_FOUND', 'Shell output was not found');
    this.assertIdentity(running?.identity ?? ended!.job, identity);
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
      running: [...this.jobs.values()].map(item => ({ ...item.identity, outputCursor: item.totalBytes.toString() })),
      ended: [...this.ended.values()].map(item => item.job),
      recovery: { priorEpochs: 'invalidated' },
    };
  }

  private async stop(request: ShellStopRequest) {
    const item = this.owner(request.job);
    if (!item.native || !this.context.manager.cancel(item.native.id, { ownerId: this.context.sessionId })) {
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
    for (const item of this.jobs.values()) item.stopped = true;
    this.context.manager.cancelAll({ ownerId: this.context.sessionId });
    await this.context.manager.waitForOwnerJobs(this.context.sessionId);
    for (const jobId of [...this.jobs.keys()]) this.finish(jobId);
  }
}
