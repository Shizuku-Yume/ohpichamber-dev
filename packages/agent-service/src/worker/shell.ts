import type { ShellJob, ShellJobIdentity, ShellOutput, ShellSnapshot, ShellStartRequest, ShellStopRequest } from '@openchamber/agent-contract';
import { AsyncJobManager, type AsyncJob } from '@oh-my-pi/pi-coding-agent/async/job-manager';
import { BashTool } from '@oh-my-pi/pi-coding-agent/tools/bash';
import type { ToolSession } from '@oh-my-pi/pi-coding-agent/tools';
import { ShellOperationSchema, type ShellOperation, type ShellResult } from '../shell/protocol.ts';

const encoder = new TextEncoder();
type Running = Extract<ShellJob, { status: 'running' }>;
type Ended = Extract<ShellJob, { status: 'ended' }>;

type JobRecord = { identity: Running; native: AsyncJob; output: string; timedOut: boolean; timer?: ReturnType<typeof setTimeout> };
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
  private readonly bash: BashTool;
  private readonly jobs = new Map<string, JobRecord>();
  private readonly ended: Ended[] = [];
  private revision = 0;
  private closed = false;

  constructor(private readonly context: WorkerShellContext) { this.bash = new BashTool(context.session); }

  async operation(operation: ShellOperation): Promise<ShellResult> {
    if (this.closed) throw new Error('Shell worker is closed');
    const parsed = ShellOperationSchema.parse(operation);
    switch (parsed.type) {
      case 'start': return this.start(parsed.request);
      case 'output': return this.output(parsed.request.job, parsed.request.cursor, parsed.request.tailBytes);
      case 'snapshot': return { type: 'snapshot', snapshot: this.snapshot() };
      case 'stop': return { type: 'stop', result: await this.stop(parsed.request) };
    }
  }

  private start(request: ShellStartRequest): ShellResult {
    const jobId = crypto.randomUUID();
    const identity: Running = {
      jobId,
      sessionId: this.context.sessionId,
      epoch: this.context.epoch,
      workerGeneration: this.context.workerGeneration,
      workspaceId: this.context.workspaceId,
      projectId: this.context.projectId,
      command: request.command,
      background: request.background,
      startedAt: Date.now(),
      outputCursor: '0',
      status: 'running',
    };
    let record: JobRecord | undefined;
    const nativeId = this.context.manager.register('bash', request.command, async ({ signal, reportProgress }) => {
      const result = await this.bash.execute(jobId, {
        command: request.command,
        cwd: this.context.cwd,
        async: request.background,
        ...(request.timeoutMs === undefined ? {} : { timeout: request.timeoutMs / 1000 }),
      }, signal, async update => {
        const text = update.content.filter(part => part.type === 'text').map(part => part.text).join('');
        if (text) {
          if (record) record.output += text;
          await reportProgress(record?.output ?? text);
        }
      });
      return result.content.filter(part => part.type === 'text').map(part => part.text).join('');
    }, { ownerId: this.context.sessionId, id: jobId });
    const native = this.context.manager.getJob(nativeId);
    if (!native) throw new Error('Native shell job was not registered');
    record = { identity, native, output: '', timedOut: false };
    this.jobs.set(jobId, record);
    if (request.timeoutMs !== undefined) record.timer = setTimeout(() => {
      record!.timedOut = true;
      this.context.manager.cancel(native.id, { ownerId: this.context.sessionId });
    }, request.timeoutMs);
    void native.promise.then(() => this.finish(jobId));
    return { type: 'start', job: identity };
  }

  private finish(jobId: string): void {
    const record = this.jobs.get(jobId);
    if (!record || record.native.status === 'running') return;
    if (record.timer !== undefined) clearTimeout(record.timer);
    const reason = record.timedOut ? 'timeout' : record.native.status === 'cancelled' ? 'stopped' : record.native.status === 'failed' ? 'signal' : 'exit';
    const termination = reason === 'exit' ? { reason: 'exit' as const, exitCode: 0 } : reason === 'timeout' ? { reason: 'timeout' as const, exitCode: null } : reason === 'stopped' ? { reason: 'stopped' as const, exitCode: null } : { reason: 'signal' as const, exitCode: null };
    const ended: Ended = { ...record.identity, status: 'ended', endedAt: Date.now(), termination };
    this.jobs.delete(jobId);
    this.ended.push(ended);
    if (this.ended.length > 200) this.ended.splice(0, this.ended.length - 200);
    this.revision++;
  }

  private output(job: ShellJobIdentity, cursor: string, tailBytes: number): ShellResult {
    const record = this.jobs.get(job.jobId);
    if (!record || record.identity.sessionId !== job.sessionId || record.identity.workerGeneration !== job.workerGeneration || record.identity.epoch !== job.epoch) throw new Error('Shell job not found');
    const bytes = encoder.encode(record.output);
    const requested = BigInt(cursor);
    let start = Math.max(0, bytes.byteLength - tailBytes, Number(requested));
    while (start < bytes.byteLength && (bytes[start]! & 0xc0) === 0x80) start++;
    const output = new TextDecoder().decode(bytes.slice(start));
    const end = start + encoder.encode(output).byteLength;
    const result: ShellOutput = {
      job,
      requestedCursor: cursor,
      startCursor: String(start),
      cursor: String(end),
      skippedBytes: String(start - Number(requested)),
      output,
      ended: record.native.status !== 'running',
    };
    return { type: 'output', output: result };
  }

  private snapshot(): ShellSnapshot {
    return {
      scope: { kind: 'session', sessionId: this.context.sessionId },
      epoch: this.context.epoch,
      revision: String(this.revision),
      running: [...this.jobs.values()].map(record => record.identity),
      ended: [...this.ended],
      recovery: { priorEpochs: 'invalidated' },
    };
  }

  private async stop(request: ShellStopRequest) {
    const record = this.jobs.get(request.job.jobId);
    if (!record || record.identity.sessionId !== request.job.sessionId || record.identity.workerGeneration !== request.job.workerGeneration || record.identity.epoch !== request.job.epoch) throw new Error('Shell job not found');
    if (!this.context.manager.cancel(record.native.id, { ownerId: this.context.sessionId })) throw new Error('Shell job is no longer running');
    await record.native.promise;
    const ended = this.ended.find(job => job.jobId === request.job.jobId);
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
