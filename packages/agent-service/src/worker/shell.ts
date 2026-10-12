import type { ShellJob, ShellJobIdentity, ShellOutput, ShellSnapshot, ShellStartRequest, ShellStopRequest } from '@openchamber/agent-contract';
import { AsyncJobManager, type AsyncJob } from '@oh-my-pi/pi-coding-agent/async/job-manager';
import { executeBash } from '@oh-my-pi/pi-coding-agent/exec/bash-executor';
import type { ToolSession } from '@oh-my-pi/pi-coding-agent/tools';
import { ShellOperationSchema, type ShellOperation, type ShellResult } from '../shell/protocol.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
type Running = Extract<ShellJob, { status: 'running' }>;
type Ended = Extract<ShellJob, { status: 'ended' }>;
type ShellResultState = { exitCode: number | undefined; timedOut?: boolean; cancelled: boolean };
type Job = { identity: Running; native: AsyncJob; output: Uint8Array; result?: ShellResultState; stopped: boolean };

export interface WorkerShellContext {
  session: ToolSession;
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
  private revision = 0;
  private closed = false;

  constructor(private readonly context: WorkerShellContext) {}

  async operation(operation: ShellOperation): Promise<ShellResult> {
    if (this.closed) throw new Error('Shell worker is closed');
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
    const job: Job = { identity, native: undefined as unknown as AsyncJob, output: new Uint8Array(), stopped: false };
    const nativeId = this.context.manager.register('bash', request.command, async ({ signal, reportProgress }) => {
      const result = await executeBash(request.command, {
        cwd: this.context.cwd,
        timeout: request.timeoutMs,
        signal,
        sessionKey: `${this.context.sessionId}:shell:${jobId}`,
        onChunk: chunk => this.append(job, chunk),
        onPreview: preview => { this.replace(job, preview); void reportProgress(preview); },
      });
      job.result = result;
      if (result.output) this.replace(job, result.output);
      if (result.cancelled) throw new Error(result.timedOut ? 'Command timed out' : 'Command stopped');
      return result.output;
    }, { id: jobId, ownerId: this.context.sessionId });
    const native = this.context.manager.getJob(nativeId);
    if (!native) throw new Error('Native shell job was not registered');
    job.native = native;
    this.jobs.set(jobId, job);
    void native.promise.then(() => this.finish(jobId));
    return { type: 'start', job: identity };
  }

  private append(job: Job, text: string): void {
    const bytes = encoder.encode(text);
    const output = new Uint8Array(job.output.length + bytes.length);
    output.set(job.output);
    output.set(bytes, job.output.length);
    job.output = output;
  }

  private replace(job: Job, text: string): void { job.output = encoder.encode(text); }

  private finish(jobId: string): void {
    const item = this.jobs.get(jobId);
    if (!item || item.native.status === 'running') return;
    const result = item.result;
    const termination = result?.timedOut
      ? { reason: 'timeout' as const, exitCode: null }
      : item.stopped || item.native.status === 'cancelled'
        ? { reason: 'stopped' as const, exitCode: result?.exitCode ?? null }
        : { reason: 'exit' as const, exitCode: result?.exitCode ?? -1 };
    const job: Ended = { ...item.identity, status: 'ended', endedAt: Date.now(), termination };
    this.jobs.delete(jobId);
    this.ended.set(jobId, { job, output: item.output });
    while (this.ended.size > 200) this.ended.delete(this.ended.keys().next().value!);
    this.revision++;
  }

  private owner(identity: ShellJobIdentity): Job {
    const job = this.jobs.get(identity.jobId);
    if (!job || job.identity.sessionId !== identity.sessionId || job.identity.epoch !== identity.epoch || job.identity.workerGeneration !== identity.workerGeneration) throw new Error('Shell job not found');
    return job;
  }

  private output(identity: ShellJobIdentity, cursor: string, tailBytes: number): ShellResult {
    const running = this.jobs.get(identity.jobId);
    const ended = this.ended.get(identity.jobId);
    if (!running && !ended) throw new Error('Shell job not found');
    if (running) this.owner(identity);
    if (ended && (ended.job.sessionId !== identity.sessionId || ended.job.epoch !== identity.epoch || ended.job.workerGeneration !== identity.workerGeneration)) throw new Error('Shell job not found');
    const bytes = running?.output ?? ended!.output;
    const requested = BigInt(cursor);
    const minimum = BigInt(Math.max(0, bytes.length - tailBytes));
    let start = requested < minimum ? minimum : requested;
    while (start < BigInt(bytes.length) && (bytes[Number(start)]! & 0xc0) === 0x80) start++;
    const text = decoder.decode(bytes.slice(Number(start)));
    const end = start + BigInt(encoder.encode(text).length);
    const output: ShellOutput = {
      job: identity, requestedCursor: cursor, startCursor: start.toString(), cursor: end.toString(),
      skippedBytes: (start - requested).toString(), output: text, ended: Boolean(ended),
    };
    return { type: 'output', output };
  }
  private snapshot(): ShellSnapshot {
    return {
      scope: { kind: 'session', sessionId: this.context.sessionId },
      epoch: this.context.epoch,
      revision: String(this.revision),
      running: [...this.jobs.values()].map(item => item.identity),
      ended: [...this.ended.values()].map(item => item.job),
      recovery: { priorEpochs: 'invalidated' },
    };
  }

  private async stop(request: ShellStopRequest) {
    const item = this.owner(request.job);
    if (!this.context.manager.cancel(item.native.id, { ownerId: this.context.sessionId })) throw new Error('Shell job is no longer running');
    item.stopped = true;
    await item.native.promise;
    this.finish(request.job.jobId);
    const ended = this.ended.get(request.job.jobId)?.job;
    if (!ended || ended.termination.reason !== 'stopped') throw new Error('Shell job did not stop');
    return { job: ended } as const;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.context.manager.cancelAll({ ownerId: this.context.sessionId });
    await this.context.manager.waitForOwnerJobs(this.context.sessionId);
    for (const jobId of [...this.jobs.keys()]) this.finish(jobId);
  }
}
