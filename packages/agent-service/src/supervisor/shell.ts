import type { IncomingMessage } from 'node:http';
import type { z } from 'zod';
import {
  EntityIdSchema, EpochSchema, ShellOutputRequestSchema, ShellSnapshotSchema,
  ShellStartRequestSchema, ShellStopRequestSchema,
} from '@openchamber/agent-contract';
import type {
  ShellJob, ShellJobIdentity, ShellOutput, ShellScope, ShellSnapshot, ShellStopResult,
} from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import type { SessionRegistry } from '../sessions/registry.ts';
import { ShellResultSchema, type ShellOperation, type ShellResult } from '../shell/protocol.ts';
import { WorkerOperationError, type RegisteredWorkerInfo, type WorkerRegistry } from './workers.ts';

type ShellResponse = { status: number; body: ShellJob | ShellSnapshot | ShellOutput | ShellStopResult };
type BodyReader = <T>(request: IncomingMessage, schema: z.ZodType<T>) => Promise<T>;
type ScopeRevision = { members: string; membershipRevision: bigint; revision: bigint };

function identity(value: string): string {
  try { return EntityIdSchema.parse(decodeURIComponent(value)); }
  catch { throw new ProjectionError(400, 'INVALID_REQUEST', 'Shell route identity is invalid'); }
}

function unavailable(): WorkerOperationError {
  return new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
}

function resync(): ProjectionError {
  return new ProjectionError(410, 'RESYNC_REQUIRED', 'Shell observation is no longer current');
}

function membership(roots: RegisteredWorkerInfo[]): string {
  return JSON.stringify(roots.map(root => [root.rootSessionId, root.workerGeneration]).sort(
    (left, right) => left[0]!.localeCompare(right[0]!),
  ));
}

export class ShellCoordinator {
  private readonly revisions = new Map<string, ScopeRevision>();
  private readonly observationEpoch: string;

  constructor(
    private readonly workers: WorkerRegistry,
    private readonly sessions: SessionRegistry,
    observationEpoch: string,
    private readonly isAuthorizedRoot: (rootSessionId: string) => boolean,
  ) {
    this.observationEpoch = EpochSchema.parse(observationEpoch);
  }

  async handle(request: IncomingMessage, url: URL, readBody: BodyReader): Promise<ShellResponse | null> {
    if (!url.pathname.startsWith('/api/agent/v1/')) return null;
    const pathname = url.pathname.slice('/api/agent/v1'.length);
    const sessionJobs = /^\/sessions\/([^/]+)\/shell\/jobs$/.exec(pathname);
    if (sessionJobs && (request.method === 'GET' || request.method === 'POST')) {
      const sessionId = identity(sessionJobs[1]!);
      this.noQuery(url);
      if (request.method === 'GET') {
        return { status: 200, body: await this.snapshot({ kind: 'session', sessionId }) };
      }
      const input = await readBody(request, ShellStartRequestSchema);
      const root = this.root(sessionId);
      const result = await this.operation(root, { type: 'start', request: input });
      if (result.type !== 'start' || result.job.sessionId !== root.rootSessionId) throw unavailable();
      this.assertJobOwner(root, result.job);
      return { status: 201, body: result.job };
    }

    const scopedJobs = /^\/(workspaces|projects)\/([^/]+)\/shell\/jobs$/.exec(pathname);
    if (scopedJobs && request.method === 'GET') {
      this.noQuery(url);
      const scopeId = identity(scopedJobs[2]!);
      const scope: ShellScope = scopedJobs[1] === 'workspaces'
        ? { kind: 'workspace', workspaceId: scopeId }
        : { kind: 'project', projectId: scopeId };
      return { status: 200, body: await this.snapshot(scope) };
    }
    if (pathname === '/shell/jobs' && request.method === 'GET') {
      this.noQuery(url);
      return { status: 200, body: await this.snapshot({ kind: 'global' }) };
    }

    const jobRoute = /^\/sessions\/([^/]+)\/shell\/jobs\/([^/]+)\/(output|stop)$/.exec(pathname);
    if (!jobRoute || (jobRoute[3] === 'output' ? request.method !== 'GET' : request.method !== 'POST')) return null;
    const sessionId = identity(jobRoute[1]!);
    const jobId = identity(jobRoute[2]!);
    if (jobRoute[3] === 'output') {
      const input = this.outputRequest(url, sessionId, jobId);
      const root = this.root(sessionId);
      this.assertCurrent(root, input.job);
      const nativeRequest = { ...input, job: { ...input.job, sessionId: root.rootSessionId } };
      const result = await this.operation(root, { type: 'output', request: nativeRequest });
      if (result.type !== 'output' || !this.sameJob(result.output.job, nativeRequest.job)
        || result.output.requestedCursor !== input.cursor) throw unavailable();
      return { status: 200, body: result.output };
    }

    this.noQuery(url);
    const input = await readBody(request, ShellStopRequestSchema);
    const root = this.root(sessionId);
    // The path can address a subagent, while canonical jobs retain their root owner.
    if (input.job.jobId !== jobId || (input.job.sessionId !== sessionId && input.job.sessionId !== root.rootSessionId)) {
      throw new ProjectionError(400, 'INVALID_REQUEST', 'Shell job identity does not match its route');
    }
    this.assertCurrent(root, input.job);
    const nativeRequest = { job: { ...input.job, sessionId: root.rootSessionId } };
    const result = await this.operation(root, { type: 'stop', request: nativeRequest });
    if (result.type !== 'stop' || !this.sameJob(result.result.job, nativeRequest.job)) throw unavailable();
    this.assertJobOwner(root, result.result.job);
    return { status: 200, body: result.result };
  }

  private noQuery(url: URL): void {
    if (url.searchParams.size !== 0) throw new ProjectionError(400, 'INVALID_REQUEST', 'Shell query is invalid');
  }

  private outputRequest(url: URL, sessionId: string, jobId: string) {
    const keys = ['epoch', 'workerGeneration', 'cursor', 'tailBytes'];
    if (url.searchParams.size !== keys.length || keys.some(key => url.searchParams.getAll(key).length !== 1)
      || !/^[1-9][0-9]*$/.test(url.searchParams.get('tailBytes') ?? '')) {
      throw new ProjectionError(400, 'INVALID_REQUEST', 'Shell output query is invalid');
    }
    const parsed = ShellOutputRequestSchema.safeParse({
      job: { jobId, sessionId, epoch: url.searchParams.get('epoch'), workerGeneration: url.searchParams.get('workerGeneration') },
      cursor: url.searchParams.get('cursor'), tailBytes: Number(url.searchParams.get('tailBytes')),
    });
    if (!parsed.success) throw new ProjectionError(400, 'INVALID_REQUEST', 'Shell output query is invalid');
    return parsed.data;
  }

  private root(sessionId: string): RegisteredWorkerInfo {
    let rootSessionId: string;
    try { rootSessionId = this.sessions.runtime(sessionId).rootSessionId; }
    catch (error) {
      if (!(error instanceof ProjectionError) || error.code !== 'SESSION_NOT_FOUND') throw error;
      const bootstrap = this.workers.bootstrap(sessionId);
      if (!bootstrap || !this.isAuthorizedRoot(sessionId)) throw error;
      rootSessionId = bootstrap.rootSessionId;
    }
    if (!this.isAuthorizedRoot(rootSessionId)) {
      throw new ProjectionError(404, 'SESSION_NOT_FOUND', 'Session not found');
    }
    const root = this.workers.list().find(worker => worker.rootSessionId === rootSessionId && worker.kind === 'session');
    if (!root) throw unavailable();
    this.assertCapturedOwner(root);
    return root;
  }

  private roots(scope: ShellScope): RegisteredWorkerInfo[] {
    if (scope.kind === 'session') return [this.root(scope.sessionId)];
    const roots = this.workers.list().filter(worker => worker.kind === 'session'
      && this.isAuthorizedRoot(worker.rootSessionId)
      && (scope.kind !== 'workspace' || worker.workspaceId === scope.workspaceId)
      && (scope.kind !== 'project' || worker.projectId === scope.projectId));
    for (const root of roots) this.assertCapturedOwner(root);
    return roots;
  }

  private assertCapturedOwner(root: RegisteredWorkerInfo): void {
    const bootstrap = this.workers.bootstrap(root.rootSessionId);
    if (!bootstrap || bootstrap.rootSessionId !== root.rootSessionId
      || bootstrap.workspaceId !== root.workspaceId || bootstrap.projectId !== root.projectId
      || bootstrap.observationEpoch !== this.observationEpoch) throw unavailable();
  }

  private assertCurrent(root: RegisteredWorkerInfo, job: ShellJobIdentity): void {
    if (job.epoch !== this.observationEpoch || job.workerGeneration !== root.workerGeneration) throw resync();
  }

  private sameJob(left: ShellJobIdentity, right: ShellJobIdentity): boolean {
    return left.jobId === right.jobId && left.sessionId === right.sessionId
      && left.epoch === right.epoch && left.workerGeneration === right.workerGeneration;
  }

  private assertJobOwner(root: RegisteredWorkerInfo, job: ShellJob): void {
    if (job.epoch !== this.observationEpoch || job.workerGeneration !== root.workerGeneration
      || job.workspaceId !== root.workspaceId || job.projectId !== root.projectId) throw unavailable();
  }

  private async operation(root: RegisteredWorkerInfo, operation: ShellOperation): Promise<ShellResult> {
    const identitySensitive = operation.type === 'output' || operation.type === 'stop';
    const scope = this.workers.authorizationScope(root.rootSessionId);
    if (!this.isAuthorizedRoot(root.rootSessionId) || !scope || root.state !== 'ready') throw unavailable();
    if (scope.workerGeneration !== root.workerGeneration) {
      if (identitySensitive) throw resync();
      throw unavailable();
    }
    try {
      const reply = await this.workers.request(root.rootSessionId, { type: 'shell', operation }, root.workerGeneration);
      const current = this.workers.authorizationScope(root.rootSessionId);
      if (!current || !this.isAuthorizedRoot(root.rootSessionId)) throw unavailable();
      if (current.workerGeneration !== root.workerGeneration) {
        if (identitySensitive) throw resync();
        throw unavailable();
      }
      if (reply.type !== 'shell') throw unavailable();
      const parsed = ShellResultSchema.safeParse(reply.result);
      if (!parsed.success) throw unavailable();
      return parsed.data;
    } catch (error) {
      if (error instanceof WorkerOperationError && error.code === 'CATALOG_CONFLICT') {
        if (identitySensitive) throw resync();
        throw unavailable();
      }
      if (operation.type === 'snapshot') throw unavailable();
      throw error;
    }
  }

  private async snapshot(scope: ShellScope): Promise<ShellSnapshot> {
    const roots = this.roots(scope);
    const members = membership(roots);
    const snapshots = await Promise.all(roots.map(async root => {
      const result = await this.operation(root, { type: 'snapshot' });
      if (result.type !== 'snapshot' || result.snapshot.epoch !== this.observationEpoch
        || result.snapshot.scope.kind !== 'session' || result.snapshot.scope.sessionId !== root.rootSessionId) throw unavailable();
      for (const job of result.snapshot.running) this.assertJobOwner(root, job);
      for (const job of result.snapshot.ended) this.assertJobOwner(root, job);
      return result.snapshot;
    }));
    // A scope is complete only if its admitted generations are unchanged during the read.
    if (membership(this.roots(scope)) !== members) throw unavailable();
    const running: ShellSnapshot['running'] = [];
    const ended: ShellSnapshot['ended'] = [];
    let workerRevision = 0n;
    for (const snapshot of snapshots) {
      workerRevision += BigInt(snapshot.revision);
      running.push(...snapshot.running);
      ended.push(...snapshot.ended);
    }
    ended.sort((left, right) => left.endedAt - right.endedAt);
    if (ended.length > 200) ended.splice(0, ended.length - 200);
    const scopeKey = JSON.stringify(scope);
    const previous = this.revisions.get(scopeKey);
    let membershipRevision = previous?.membershipRevision ?? 0n;
    if (previous && previous.members !== members) {
      membershipRevision++;
      // Retiring a generation must not roll the scoped observation revision backwards.
      if (workerRevision + membershipRevision <= previous.revision) membershipRevision = previous.revision - workerRevision + 1n;
    }
    const revision = workerRevision + membershipRevision;
    const parsed = ShellSnapshotSchema.safeParse({
      scope, epoch: this.observationEpoch, revision: revision.toString(), running, ended,
      recovery: { priorEpochs: 'invalidated' },
    });
    if (!parsed.success) throw unavailable();
    // Empty reads of arbitrary unknown scopes do not accumulate bookkeeping entries.
    if ((roots.length > 0 || previous) && (!previous || previous.members !== members || revision >= previous.revision)) {
      this.revisions.set(scopeKey, { members, membershipRevision, revision });
    }
    return parsed.data;
  }
}
