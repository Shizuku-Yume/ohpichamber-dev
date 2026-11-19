import type {
  JobWidgetView, PipeStreamSummary, ShellJob,
  ShellJobIdentity, ShellOutput, ShellSnapshot, ShellStartRequest, ShellStdinRequest,
  ShellStdinResult, ShellStopRequest, ShellStopResult, ShellStreamRequest, ShellStreamResponse, ShellTermination,
} from '@openchamber/agent-contract';
import type { DaemonSnapshot } from '@oh-my-pi/pi-tui/tools/daemon';
import type { JobWidgets } from '@oh-my-pi/pi-coding-agent/job-widgets/registry';
import { type AsyncJob, type AsyncJobManagerApi, type BashJobEvent } from '@oh-my-pi/pi-coding-agent/async/job-manager';
import { executeBash, releaseShellSessions, type BashResult } from '@oh-my-pi/pi-coding-agent/exec/bash-executor';
import type { PipeStreams } from '@oh-my-pi/pi-natives';
import type { AgentRegistryApi } from '@oh-my-pi/pi-coding-agent/registry/agent-registry';
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
  serviceName?: string;
  serviceMode?: 'persist' | 'session' | 'detached';
};
type ServiceRecord = {
  identity: Running;
  daemon: DaemonSnapshot;
};

export interface WorkerShellContext {
  manager: AsyncJobManagerApi;
  workspaceId: string;
  projectId: string;
  sessionId: string;
  workerGeneration: string;
  epoch: string;
  cwd: string;
  nativeOwner?: { agentId: string; registry: AgentRegistryApi };
  widgets?: JobWidgets;
  listServices?: () => Promise<DaemonSnapshot[]>;
  serviceLogs?: (name: string) => Promise<string>;
  sendServiceInput?: (serviceName: string, input: string) => Promise<void>;
  stopService?: (name: string) => Promise<void>;
  privateRoots?: Array<{ root: string; label: string }>;
}

function findSafeUtf8End(buffer: Uint8Array, start = 0): number {
  const len = buffer.length;
  if (len <= start) return start;
  for (let offset = 1; offset <= 4 && len - offset >= start; offset++) {
    const byte = buffer[len - offset]!;
    if ((byte & 0x80) !== 0) {
      if ((byte & 0xe0) === 0xc0) return offset < 2 ? len - offset : len;
      if ((byte & 0xf0) === 0xe0) return offset < 3 ? len - offset : len;
      if ((byte & 0xf8) === 0xf0) return offset < 4 ? len - offset : len;
      if ((byte & 0xc0) === 0x80) continue;
      return len;
    } else {
      return len;
    }
  }
  return len;
}

export class WorkerShell {
  private readonly jobs = new Map<string, Job>();
  private readonly nativeJobs = new Map<string, string>();
  private readonly ended = new Map<string, { job: Ended; output: Uint8Array; outputUnavailable?: true; streams?: PipeStreams }>();
  private readonly authorizedServices = new Map<string, ServiceRecord>();
  private readonly endedServices = new Map<string, Ended>();
  private revision = 0n;
  private readonly unsubscribe?: () => void;
  private readonly unsubscribeWidgets?: () => void;
  private observationFailure: unknown;
  private closed = false;
  /**
   * The root session this worker currently serves. A completed `/btw` branch
   * rekeys the native session in place, so the shell projection must follow it:
   * every job identity and the snapshot's scope name it, and a stale id makes
   * the Host's root check refuse every shell read with 503.
   */
  private sessionId: string;

  constructor(private readonly context: WorkerShellContext) {
    this.sessionId = context.sessionId;
    this.unsubscribe = context.manager.observeBashJobs?.(event => {
      try { this.observeNative(event); }
      catch (error) {
        const jobId = this.nativeJobs.get(event.jobId);
        const job = jobId === undefined ? undefined : this.jobs.get(jobId);
        if (job) job.outputUnavailable = true;
        else this.observationFailure = error;
        throw error;
      }
    });
    if (context.widgets) {
      this.unsubscribeWidgets = context.widgets.subscribe(() => {
        this.revision++;
      });
    }
  }

  /**
   * Follow a native session rekey (a completed `/btw` branch). Every job this
   * shell owns is addressed by its root session id, so the running and ended
   * records, the guest job keys and the scope all move together; a stale id
   * answers 404 to the Host's root-addressed output read.
   */
  rekey(sessionId: string): void {
    if (this.closed || this.sessionId === sessionId) return;
    for (const job of this.jobs.values()) job.identity.sessionId = sessionId;
    for (const record of this.ended.values()) record.job.sessionId = sessionId;
    for (const record of this.authorizedServices.values()) record.identity.sessionId = sessionId;
    for (const record of this.endedServices.values()) record.sessionId = sessionId;
    this.sessionId = sessionId;
    this.revision++;
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
          jobId, sessionId: this.sessionId, epoch: this.context.epoch,
          workerGeneration: this.context.workerGeneration, workspaceId: this.context.workspaceId,
          projectId: this.context.projectId, command: this.publicText(native.process.command), background: native.foreground !== true,
          startedAt: native.startTime, outputCursor: '0', status: 'running',
        },
        native, origin: 'agent', sessionKey: event.sessionKey,
        output: new Uint8Array(), totalBytes: 0n, stopped: false,
      };
      this.jobs.set(jobId, job);
      this.nativeJobs.set(native.id, jobId);
      this.revision++;
      this.context.widgets?.requestCaption(native);
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
    // Live sessions in this worker's registry share this root's job manager.
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
    if (parsed.type === 'output') return await this.output(parsed.request.job, parsed.request.cursor, parsed.request.tailBytes);
    if (parsed.type === 'snapshot') return { type: 'snapshot', snapshot: await this.snapshot() };
    if (parsed.type === 'stream') return { type: 'stream', stream: this.stream(parsed.request) };
    if (parsed.type === 'stdin') return { type: 'stdin', result: await this.stdin(parsed.request) };
    return { type: 'stop', result: await this.stop(parsed.request) };
  }

  private start(request: ShellStartRequest): ShellResult {
    const jobId = crypto.randomUUID();
    const identity: Running = {
      jobId, sessionId: this.sessionId, epoch: this.context.epoch,
      workerGeneration: this.context.workerGeneration, workspaceId: this.context.workspaceId,
      projectId: this.context.projectId, command: this.publicText(request.command), background: request.background,
      startedAt: Date.now(), outputCursor: '0', status: 'running',
    };
    const job: Job = {
      identity, output: new Uint8Array(), totalBytes: 0n, stopped: false,
      origin: 'guest', sessionKey: `${this.sessionId}:shell:${jobId}`,
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
    }, { id: jobId, ownerId: this.sessionId, foreground: true });
    const native = this.context.manager.getJob(nativeId);
    if (!native) throw new ProjectionError(503, 'SHELL_OUTPUT_UNAVAILABLE', 'Native shell job was not registered');
    job.native = native;
    this.jobs.set(jobId, job);
    this.revision++;
    void native.promise.then(() => this.finish(jobId));
    return { type: 'start', job: identity };
  }

  private publicText(text: string): string {
    if (!this.context.privateRoots) return text;
    let result = text;
    for (const { root, label } of this.context.privateRoots) {
      if (root && result.includes(root)) {
        result = result.replaceAll(root, `[${label}]`);
      }
    }
    return result;
  }

  private findStreams(identity: ShellJobIdentity): PipeStreams | undefined {
    const active = this.jobs.get(identity.jobId);
    if (active) {
      this.assertIdentity(active.identity, identity);
      return active.native?.process?.streams;
    }
    const ended = this.ended.get(identity.jobId);
    if (ended) {
      this.assertIdentity(ended.job, identity);
      return ended.streams;
    }
    return undefined;
  }

  private stream(request: ShellStreamRequest): ShellStreamResponse {
    const streams = this.findStreams(request.job);
    if (!streams) {
      throw new ProjectionError(404, 'SHELL_NOT_FOUND', `Shell job ${request.job.jobId} or its pipe streams were not found`);
    }
    const chunk = streams.read(request.streamId, request.from);
    if (!chunk) {
      throw new ProjectionError(404, 'SHELL_NOT_FOUND', `Pipe stream ${request.streamId} was not found`);
    }
    const buffer = chunk.data;
    let start = chunk.start;
    let safeStart = 0;
    if (buffer.length > MAX_OUTPUT_BYTES) {
      const offset = buffer.length - MAX_OUTPUT_BYTES;
      safeStart = offset;
      while (safeStart < buffer.length && (buffer[safeStart]! & 0xc0) === 0x80) safeStart++;
      start += safeStart;
    }
    const safeEnd = findSafeUtf8End(buffer, safeStart);
    const text = decoder.decode(buffer.subarray(safeStart, safeEnd));
    const end = chunk.start + safeEnd;
    return {
      job: request.job,
      streamId: request.streamId,
      start,
      end,
      chunk: this.publicText(text),
      open: chunk.open,
    };
  }

  private async refreshServices(): Promise<void> {
    if (!this.context.listServices) return;
    let daemons: DaemonSnapshot[];
    try {
      daemons = await this.context.listServices();
    } catch {
      return;
    }
    const currentIds = new Set<string>();
    for (const daemon of daemons) {
      if (daemon.owner !== this.sessionId) continue;
      const jobId = `service:${daemon.id}`;
      currentIds.add(jobId);
      const isEnded = (daemon.state as string) === 'stopped' || daemon.state === 'exited' || daemon.state === 'failed';
      const serviceMode: 'persist' | 'detached' | 'session' =
        daemon.persist ? 'persist' : daemon.detached ? 'detached' : 'session';
      const pids = daemon.pid ? [daemon.pid] : undefined;
      const startedAt = daemon.startedAt || daemon.createdAt || Date.now();
      const identity: Running = {
        jobId,
        sessionId: this.sessionId,
        epoch: this.context.epoch,
        workerGeneration: this.context.workerGeneration,
        workspaceId: this.context.workspaceId,
        projectId: this.context.projectId,
        command: this.publicText(daemon.name),
        background: true,
        startedAt,
        outputCursor: daemon.outputBytes ? daemon.outputBytes.toString() : '0',
        serviceName: daemon.name,
        serviceMode,
        canReceiveStdin: !isEnded,
        pids,
        status: 'running',
      };
      if (!isEnded) {
        this.authorizedServices.set(jobId, { identity, daemon });
      } else {
        this.authorizedServices.delete(jobId);
        this.endedServices.set(jobId, {
          ...identity,
          status: 'ended',
          endedAt: daemon.exitedAt ?? Date.now(),
          termination: daemon.exitCode !== undefined && daemon.exitCode !== null
            ? { reason: 'exit', exitCode: daemon.exitCode }
            : { reason: 'stopped', exitCode: null },
          canReceiveStdin: false,
        });
      }
    }
    for (const [id] of this.authorizedServices) {
      if (!currentIds.has(id)) {
        this.authorizedServices.delete(id);
      }
    }
  }

  private async findAuthorizedService(identity: ShellJobIdentity): Promise<ServiceRecord> {
    if (!identity.jobId.startsWith('service:')) {
      throw new ProjectionError(404, 'SHELL_NOT_FOUND', 'Shell job is not a named service');
    }
    await this.refreshServices();
    const record = this.authorizedServices.get(identity.jobId);
    if (!record) {
      const ended = this.endedServices.get(identity.jobId);
      if (ended) {
        this.assertIdentity(ended, identity);
        throw new ProjectionError(400, 'INVALID_REQUEST', 'Named service has ended');
      }
      throw new ProjectionError(404, 'SHELL_NOT_FOUND', `Named service ${identity.jobId} was not found or unauthorized for this session`);
    }
    this.assertIdentity(record.identity, identity);
    return record;
  }

  private async stdin(request: ShellStdinRequest): Promise<ShellStdinResult> {
    if (request.job.jobId.startsWith('service:')) {
      const { daemon } = await this.findAuthorizedService(request.job);
      if (daemon.state === 'failed') {
        throw new ProjectionError(400, 'INVALID_REQUEST', 'Cannot send stdin to an exited named service');
      }
      if (!this.context.sendServiceInput) {
        throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Service stdin routing is unavailable');
      }
      await this.context.sendServiceInput(daemon.name, request.input);
      return {
        job: request.job,
        writtenBytes: Buffer.byteLength(request.input, 'utf-8'),
      };
    }
    const active = this.jobs.get(request.job.jobId);
    if (active) {
      this.assertIdentity(active.identity, request.job);
      if (active.stopped) {
        throw new ProjectionError(400, 'INVALID_REQUEST', 'Cannot send stdin to a stopped shell job');
      }
      if (active.serviceName && this.context.sendServiceInput) {
        await this.context.sendServiceInput(active.serviceName, request.input);
        return {
          job: request.job,
          writtenBytes: Buffer.byteLength(request.input, 'utf-8'),
        };
      }
      throw new ProjectionError(400, 'INVALID_REQUEST', 'This shell job does not accept stdin input; stdin is only supported for named services');
    }
    const ended = this.ended.get(request.job.jobId);
    if (ended) {
      this.assertIdentity(ended.job, request.job);
      throw new ProjectionError(400, 'INVALID_REQUEST', 'Cannot send stdin to an ended shell job');
    }
    throw new ProjectionError(404, 'SHELL_NOT_FOUND', 'Shell job was not found');
  }
  private enrich(item: Job): {
    intent?: string;
    caption?: string;
    pids?: number[];
    streams?: PipeStreamSummary[];
    widget?: JobWidgetView;
    serviceName?: string;
    serviceMode?: 'persist' | 'session' | 'detached';
    canReceiveStdin?: boolean;
  } {
    const native = item.native;
    if (!native) return {};
    const intent = native.intent ? this.publicText(native.intent) : undefined;
    const rawCaption = this.context.widgets?.caption(native);
    const caption = rawCaption ? this.publicText(rawCaption) : undefined;
    const widget = this.context.widgets?.view(native) as JobWidgetView | undefined;
    const pids = native.process ? [...native.process.pids()] : undefined;
    const rawStreams = native.process?.streams?.list();
    const streams: PipeStreamSummary[] | undefined = rawStreams && rawStreams.length > 0
      ? rawStreams.map(s => ({
        id: s.id,
        producer: this.publicText(s.producer),
        consumer: this.publicText(s.consumer),
        total: s.total,
        open: s.open,
      }))
      : undefined;
    return {
      intent,
      caption,
      pids: pids && pids.length > 0 ? pids : undefined,
      streams,
      widget,
      serviceName: item.serviceName,
      serviceMode: item.serviceMode,
      canReceiveStdin: Boolean(item.serviceName),
    };
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
    const enriched = this.enrich(item);
    const job: Ended = {
      ...item.identity,
      ...enriched,
      background: item.origin === 'agent' || item.identity.background,
      status: 'ended', endedAt: item.native.endTime,
      outputCursor: item.totalBytes.toString(), termination,
    };
    this.ended.set(jobId, { job, output: item.output, outputUnavailable: item.outputUnavailable, streams: item.native?.process?.streams });
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

  private async output(identity: ShellJobIdentity, cursor: string, tailBytes: number): Promise<ShellResult> {
    if (identity.jobId.startsWith('service:')) {
      const { daemon } = await this.findAuthorizedService(identity);
      if (!this.context.serviceLogs) {
        throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Service logs are unavailable');
      }
      const text = await this.context.serviceLogs(daemon.name);
      const encoded = encoder.encode(this.publicText(text));
      const total = BigInt(encoded.length);
      const requested = BigInt(cursor);
      if (requested > total) throw new ProjectionError(400, 'INVALID_CURSOR', 'Shell cursor exceeds current output');
      const retainedStart = total > BigInt(MAX_OUTPUT_BYTES) ? total - BigInt(MAX_OUTPUT_BYTES) : 0n;
      let start = Number((requested < retainedStart ? retainedStart : requested) - retainedStart);
      while (start < encoded.length && (encoded[start]! & 0xc0) === 0x80) start++;
      let end = Math.min(encoded.length, start + tailBytes);
      if (end < encoded.length) {
        while (end > start && (encoded[end]! & 0xc0) === 0x80) end--;
      }
      const chunkText = decoder.decode(encoded.subarray(start, end));
      const startCursor = retainedStart + BigInt(start);
      return {
        type: 'output',
        output: {
          job: identity,
          requestedCursor: cursor,
          startCursor: startCursor.toString(),
          cursor: (retainedStart + BigInt(end)).toString(),
          skippedBytes: (startCursor - requested).toString(),
          output: chunkText,
          ended: (daemon.state as string) === 'stopped' || daemon.state === 'exited' || daemon.state === 'failed',
        },
      };
    }
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

  private async snapshot(): Promise<ShellSnapshot> {
    const runningJobs: Running[] = [...this.jobs.values()]
      .filter(item => this.visible(item))
      .map(item => ({ ...item.identity, ...this.enrich(item), outputCursor: item.totalBytes.toString() }));
    const endedJobs: Ended[] = [...this.ended.values()]
      .map(item => item.job)
      .sort((left, right) => left.endedAt - right.endedAt);

    await this.refreshServices();
    for (const record of this.authorizedServices.values()) {
      runningJobs.push(record.identity);
    }
    for (const ended of this.endedServices.values()) {
      endedJobs.push(ended);
    }

    return {
      scope: { kind: 'session', sessionId: this.sessionId },
      epoch: this.context.epoch, revision: this.revision.toString(),
      running: runningJobs,
      ended: endedJobs.sort((left, right) => left.endedAt - right.endedAt),
      recovery: { priorEpochs: 'invalidated' },
    };
  }

  private async stop(request: ShellStopRequest): Promise<ShellStopResult> {
    if (request.job.jobId.startsWith('service:')) {
      const { daemon } = await this.findAuthorizedService(request.job);
      if (!this.context.stopService) {
        throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Service stop is unavailable');
      }
      await this.context.stopService(daemon.name);
      if (!this.context.listServices) {
        throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Service list is unavailable to verify stop');
      }
      const updatedDaemons = await this.context.listServices();
      const updated = updatedDaemons.find(d => d.id === daemon.id);
      if (!updated || ((updated.state as string) !== 'stopped' && updated.state !== 'exited' && updated.state !== 'failed')) {
        throw new ProjectionError(503, 'SHELL_STOP_TIMEOUT', `Named service ${daemon.name} did not stop (state: ${updated?.state ?? 'unobservable'})`);
      }
      const endedJob: Ended = {
        jobId: request.job.jobId,
        sessionId: request.job.sessionId,
        epoch: request.job.epoch,
        workerGeneration: request.job.workerGeneration,
        workspaceId: this.context.workspaceId,
        projectId: this.context.projectId,
        command: this.publicText(daemon.name),
        background: true,
        startedAt: daemon.startedAt || daemon.createdAt || Date.now(),
        outputCursor: updated?.outputBytes ? updated.outputBytes.toString() : daemon.outputBytes ? daemon.outputBytes.toString() : '0',
        status: 'ended',
        endedAt: updated?.exitedAt ?? Date.now(),
        termination: { reason: 'stopped', exitCode: updated?.exitCode ?? null },
        serviceName: daemon.name,
        serviceMode: daemon.persist ? 'persist' : daemon.detached ? 'detached' : 'session',
        canReceiveStdin: false,
      };
      this.authorizedServices.delete(request.job.jobId);
      this.endedServices.set(request.job.jobId, endedJob);
      return { job: endedJob };
    }
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
    this.unsubscribe?.();
    this.unsubscribeWidgets?.();
    this.context.widgets?.dispose();
    const jobs = [...this.jobs.values()];
    for (const item of jobs) {
      if (item.native && this.context.manager.cancel(item.native.id, { ownerId: item.native.ownerId })) item.stopped = true;
    }
    await Promise.all(jobs.map(item => item.native?.promise));
    for (const item of jobs) this.finish(item.identity.jobId);
  }
}
