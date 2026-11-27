import { z } from 'zod';
import {
  EntityIdSchema, HistoryPageSchema, ProblemDetailsSchema, QueueStateSchema, RunSchema, RuntimeSessionSchema, SessionSnapshotSchema,
  type CanonicalEvent, type PromptAttachment, type PromptRequest, type QueueAppendRequest, type QueueDeleteRequest,
  type QueueReorderRequest, type QueueState, type QueueTakeRequest, type RuntimeSession, type SessionSnapshot, type Turn,
} from '@openchamber/agent-contract';
import { parseCanonicalEvent } from '../event-stream/validated-event.js';
import type { ResolvedAttachmentPath } from '../host/attachment-store.js';
import { isBoolean } from '../shared/guards.js';
import type { JsonValue } from '../shared/json-values.js';
import {
  PromptQueueError,
  type PromptQueueCapture,
  type PromptQueueListResult,
  type PromptQueueScheduledTaskProvenance,
  type PromptQueueScope,
  type PromptQueueStore,
  type PromptQueueStoredEntry,
} from './sqlite-store.js';
import { assertRootPromptAdmission } from './prompt-admission.js';

export interface CanonicalQueueScope {
  sessionId: string;
  projectId: string;
  workspaceId: string;
  cwd?: string | undefined;
  agentDirectory?: string | undefined;
  agentDirectoryId?: string | undefined;
  hostProjectId?: string | undefined;
  parentSessionId?: string | null | undefined;
}

export interface CanonicalQueueServiceClient {
  request: (pathname: string, init?: RequestInit) => Promise<globalThis.Response>;
}

export interface CanonicalQueueFailureEvent {
  sessionId?: string;
  queueItemId?: string;
  runId?: string;
  code: string;
}

export interface CanonicalQueueRuntimeDependencies {
  store: PromptQueueStore;
  service: CanonicalQueueServiceClient;
  resolveAttachments: (
    scope: CanonicalQueueScope,
    attachments: PromptAttachment[],
  ) => Promise<ResolvedAttachmentPath[]>;
  publishQueue: (event: { sessionId: string; queue: QueueState }) => void;
  reportFailure: (failure: CanonicalQueueFailureEvent) => void;
  capturePrompt?: ((scope: CanonicalQueueScope, request: PromptRequest) => Promise<PromptRequest>) | undefined;
  beforeDispatch?: ((scope: CanonicalQueueScope, capture: PromptQueueCapture) => Promise<void | object>) | undefined;
  onPromptAccepted?: ((scope: CanonicalQueueScope, capture: PromptQueueCapture) => Promise<void | object>) | undefined;
  onScheduledTaskResult?: ((
    provenance: PromptQueueScheduledTaskProvenance,
    status: 'sent' | 'failed' | 'cancelled',
    error?: string,
  ) => Promise<void | object | null>) | undefined;
  ensureSessionObserved?: ((scope: CanonicalQueueScope) => Promise<void>) | undefined;
  now?: (() => number) | undefined;
}

export interface CanonicalQueueHoldResult {
  held: boolean;
  expiresAt: number | null;
}

export interface CanonicalQueueRuntime {
  getState: (scope: CanonicalQueueScope) => Promise<QueueState>;
  append: (scope: CanonicalQueueScope, commandId: string, request: QueueAppendRequest) => Promise<QueueState>;
  remove: (scope: CanonicalQueueScope, request: QueueDeleteRequest) => Promise<QueueState>;
  take: (scope: CanonicalQueueScope, request: QueueTakeRequest) => Promise<{ queue: QueueState; stored: PromptQueueStoredEntry }>;
  dispatch: (scope: CanonicalQueueScope) => Promise<void>;
  hasScheduledTask: (projectId: string, taskId: string) => Promise<boolean>;
  cancelScheduledTask: (projectId: string, taskId: string) => Promise<{ cancelled: boolean }>;
  reorder: (scope: CanonicalQueueScope, request: QueueReorderRequest) => Promise<QueueState>;
  observe: (scope: CanonicalQueueScope, input: CanonicalEvent | JsonValue | undefined) => Promise<void>;
  setHold: (scope: CanonicalQueueScope, held: boolean, ttlMs?: number) => CanonicalQueueHoldResult;
  start: () => Promise<PromptQueueListResult>;
  stop: () => Promise<void>;
}

const AdmissionSchema = z.strictObject({ run: RunSchema });
const QUIET_MS = 500;
const ABORT_HOLD_MS = 2000;
const RETRY_MS = 2000;
const LEASE_MS = 30_000;

const queueScope = (scope: CanonicalQueueScope): PromptQueueScope => ({
  sessionId: EntityIdSchema.parse(scope?.sessionId),
  projectId: EntityIdSchema.parse(scope?.projectId),
  workspaceId: EntityIdSchema.parse(scope?.workspaceId),
});
const scopeKey = (scope: CanonicalQueueScope): string => JSON.stringify([scope.projectId, scope.workspaceId, scope.sessionId]);

export function createCanonicalQueueRuntime({
  store,
  service,
  resolveAttachments,
  publishQueue,
  reportFailure,
  capturePrompt = async (_scope, request) => request,
  beforeDispatch = async (_scope, _capture) => { },
  onPromptAccepted = async (_scope, _capture) => { },
  onScheduledTaskResult = async (_provenance, _status, _error) => { },
  ensureSessionObserved = async (_scope) => { },
  now = Date.now,
}: CanonicalQueueRuntimeDependencies): CanonicalQueueRuntime {
  if (!store || !service || !z.function().safeParse(service.request).success) throw new TypeError('canonical queue requires store and Agent service');
  if (!z.function().safeParse(resolveAttachments).success || !z.function().safeParse(publishQueue).success || !z.function().safeParse(reportFailure).success) throw new TypeError('canonical queue requires attachments and publication callbacks');
  if (!z.function().safeParse(capturePrompt).success || !z.function().safeParse(beforeDispatch).success || !z.function().safeParse(onPromptAccepted).success || !z.function().safeParse(onScheduledTaskResult).success) throw new TypeError('canonical queue requires delivery hooks');
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const operations = new Map<string, Promise<void>>();
  const holds = new Map<string, number>();
  const shutdown = new AbortController();
  let stopped = false;

  const changed = (scope: PromptQueueScope, value: QueueState): QueueState => {
    const queue = QueueStateSchema.parse(value);
    publishQueue({ sessionId: scope.sessionId, queue });
    return queue;
  };
  const remote = async <Schema extends z.ZodType>(pathname: string, schema: Schema, init?: RequestInit): Promise<z.output<Schema>> => {
    let response: globalThis.Response;
    try { response = await service.request(pathname, { ...init, signal: shutdown.signal }); }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError' && stopped) throw error;
      throw new PromptQueueError('SERVICE_UNAVAILABLE', 503, 'Agent Service is unavailable');
    }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new PromptQueueError('SERVICE_UNAVAILABLE', 503, 'Agent Service returned an invalid response'); }
    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(body);
      if (!problem.success) throw new PromptQueueError('SERVICE_UNAVAILABLE', 503, 'Agent Service returned an invalid problem response');
      throw new PromptQueueError(problem.data.code, problem.data.status, problem.data.detail, problem.data.details);
    }
    try { return schema.parse(body); }
    catch { throw new PromptQueueError('SERVICE_UNAVAILABLE', 503, 'Agent Service returned an invalid response'); }
  };
  const prefix = (scope: PromptQueueScope): string => `/api/agent/v1/sessions/${encodeURIComponent(scope.sessionId)}`;
  const inScope = (scope: PromptQueueScope, runtime: RuntimeSession): RuntimeSession => {
    if (runtime.sessionId !== scope.sessionId || runtime.projectId !== scope.projectId || runtime.workspaceId !== scope.workspaceId) {
      throw new PromptQueueError('SESSION_NOT_FOUND', 404, 'Execution session does not belong to the queue workspace');
    }
    return runtime;
  };
  const schedule = (scope: CanonicalQueueScope, delay = QUIET_MS): void => {
    if (stopped) return;
    const key = scopeKey(scope);
    const existing = timers.get(key);
    clearTimeout(existing);
    const timer = setTimeout(() => {
      timers.delete(key);
      void dispatch(scope).catch((error) => {
        reportFailure({ sessionId: scope.sessionId, code: error instanceof PromptQueueError ? error.code : 'SERVICE_UNAVAILABLE' });
        schedule(scope, RETRY_MS);
      });
    }, delay);
    timer.unref(); timers.set(key, timer);
  };
  const matchingTurn = async (scope: PromptQueueScope, snapshot: SessionSnapshot, runId: string): Promise<Turn | undefined> => {
    const found = snapshot.turns.findLast((turn) => turn.runId === runId);
    if (found || !snapshot.window.hasEarlier) return found;
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor !== undefined) query.set('cursor', cursor);
      const page = await remote(`${prefix(scope)}/history?${query}`, HistoryPageSchema);
      if (page.sessionId !== scope.sessionId || page.branch.branchId !== snapshot.branch.branchId || page.branch.branchVersion !== snapshot.branch.branchVersion) {
        throw new PromptQueueError('RESYNC_REQUIRED', 410, 'Execution branch changed during queue recovery');
      }
      const turn = page.turns.findLast((entry) => entry.runId === runId);
      if (turn) return turn;
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return undefined;
  };
  const scheduledProvenance = (capture: PromptQueueCapture): PromptQueueScheduledTaskProvenance | null =>
    z.function().safeParse(store.scheduledTaskProvenance).success ? store.scheduledTaskProvenance(capture.request) : null;
  const scheduledResult = async (
    capture: PromptQueueCapture,
    status: 'sent' | 'failed' | 'cancelled',
    error?: string,
  ): Promise<void> => {
    const provenance = scheduledProvenance(capture);
    if (provenance) await onScheduledTaskResult(provenance, status, error);
  };
  const accepted = async (scope: CanonicalQueueScope, capture: PromptQueueCapture): Promise<void> => {
    await onPromptAccepted(scope, capture);
    await scheduledResult(capture, 'sent');
  };
  const recoveryCapture = async (scope: CanonicalQueueScope, delivery: { leaseId: string }): Promise<PromptQueueCapture> => {
    if (!z.function().safeParse(store.getDeliveryCapture).success) throw new PromptQueueError('INTERNAL_ERROR', 503, 'Queue delivery capture is unavailable');
    return store.getDeliveryCapture(queueScope(scope), delivery.leaseId);
  };
  const recover = async (scope: PromptQueueScope, runtime: RuntimeSession): Promise<void> => {
    const pending = await store.pendingDeliveries(queueScope(scope));
    if (pending.length === 0) return;
    const snapshot = await remote(`${prefix(scope)}/snapshot`, SessionSnapshotSchema);
    inScope(scope, snapshot.session);
    for (const delivery of pending) {
      if (delivery.phase === 'claimed') continue;
      if (snapshot.activeRun?.runId === delivery.runId || await matchingTurn(scope, snapshot, delivery.runId)) {
        if (delivery.phase === 'submitting') {
          const capture = await recoveryCapture(scope, delivery);
          await accepted(scope, capture);
          changed(scope, await store.acknowledge(queueScope(scope), delivery.leaseId));
        }
        if (snapshot.session.activeRunId !== delivery.runId) await store.settle(queueScope(scope), delivery.runId);
      } else if (delivery.phase === 'submitting' && delivery.epoch !== runtime.epoch) {
        changed(scope, await store.fail(queueScope(scope), delivery.leaseId, 'SESSION_RESTORE_FAILED'));
        reportFailure({ sessionId: scope.sessionId, queueItemId: delivery.queueItemId, runId: delivery.runId, code: 'SESSION_RESTORE_FAILED' });
      } else if (delivery.phase === 'submitting') {
        throw new PromptQueueError('COMMAND_IN_FLIGHT', 409, 'Prompt admission is not yet reconciled');
      }
    }
  };
  const dispatch = (scope: CanonicalQueueScope): Promise<void> => {
    const ownerScope = queueScope(scope);
    const key = scopeKey(ownerScope);
    const existing = operations.get(key);
    if (existing) return existing;
    if (stopped) return Promise.resolve();
    const operation = (async () => {
      const holdUntil = holds.get(key) ?? 0;
      if (holdUntil > now()) { schedule(scope, holdUntil - now()); return; }
      holds.delete(key);
      const runtime = inScope(ownerScope, await remote(prefix(ownerScope), RuntimeSessionSchema));
      if (runtime.runtimeStatus === 'unavailable') throw new PromptQueueError('SERVICE_UNAVAILABLE', 503, 'Execution session must be reopened before dispatch');
      await recover(ownerScope, runtime);
      const before = await store.getState(ownerScope);
      const recovered = await store.recoverUnsentClaims(ownerScope);
      if (recovered.revision !== before.revision) changed(ownerScope, recovered);
      if (runtime.activeRunId !== null || runtime.continuationPending === true || runtime.runtimeStatus !== 'idle') {
        if (recovered.items.length > 0) schedule(scope, RETRY_MS);
        return;
      }
      const head = recovered.items[0];
      if (!head) return;
      if (head.status === 'leased') { schedule(scope, Math.max(RETRY_MS, head.lease.expiresAt - now())); return; }
      const claimed = await store.claimHead(ownerScope, recovered.revision, { epoch: runtime.epoch, expiresAt: now() + LEASE_MS });
      if (!claimed.capture) return;
      changed(ownerScope, claimed.queue);
      const capture = claimed.capture;
      try { await beforeDispatch(scope, capture); }
      catch (error) {
        changed(ownerScope, await store.fail(ownerScope, capture.leaseId, 'INVALID_REQUEST'));
        reportFailure({ sessionId: scope.sessionId, queueItemId: capture.queueItemId, runId: capture.runId, code: 'INVALID_REQUEST' });
        await scheduledResult(capture, 'failed', error instanceof Error ? error.message : undefined);
        schedule(scope); return;
      }
      let attachments: ResolvedAttachmentPath[];
      try { attachments = await resolveAttachments(scope, capture.request.input.attachments); }
      catch (error) {
        changed(ownerScope, await store.fail(ownerScope, capture.leaseId, 'INVALID_REQUEST'));
        reportFailure({ sessionId: scope.sessionId, queueItemId: capture.queueItemId, runId: capture.runId, code: 'INVALID_REQUEST' });
        await scheduledResult(capture, 'failed', error instanceof Error ? error.message : undefined);
        schedule(scope); return;
      }
      if (stopped) return;
      await store.markSubmitting(ownerScope, capture.leaseId);
      let response: globalThis.Response;
      try {
        response = await service.request(`/internal/sessions/${encodeURIComponent(scope.sessionId)}/runs`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'prompt', runId: capture.runId, request: capture.request, attachments }),
          signal: shutdown.signal,
        });
      } catch {
        schedule(scope, RETRY_MS); return;
      }
      let body: unknown;
      try { body = await response.json(); }
      catch { throw new PromptQueueError('SERVICE_UNAVAILABLE', 503, 'Agent Service returned an invalid response'); }
      if (!response.ok) {
        const parsed = ProblemDetailsSchema.safeParse(body);
        if (!parsed.success) throw new PromptQueueError('SERVICE_UNAVAILABLE', 503, 'Agent Service returned an invalid problem response');
        const problem = parsed.data;
        if (problem.code === 'RUN_ACTIVE') changed(ownerScope, await store.retry(ownerScope, capture.leaseId, problem.code));
        else if (response.status >= 400 && response.status < 500) {
          changed(ownerScope, await store.fail(ownerScope, capture.leaseId, problem.code));
          reportFailure({ sessionId: scope.sessionId, queueItemId: capture.queueItemId, runId: capture.runId, code: problem.code });
          await scheduledResult(capture, 'failed', problem.detail);
        }
        schedule(scope, RETRY_MS); return;
      }
      const admitted = AdmissionSchema.safeParse(body);
      if (!admitted.success) throw new PromptQueueError('SERVICE_UNAVAILABLE', 503, 'Agent Service returned an invalid admission response');
      if (admitted.data.run.runId !== capture.runId || admitted.data.run.sessionId !== scope.sessionId) {
        throw new PromptQueueError('INTERNAL_ERROR', 503, 'Execution acknowledgement identifies another delivery');
      }
      await accepted(scope, capture);
      changed(ownerScope, await store.acknowledge(ownerScope, capture.leaseId));
    })();
    operations.set(key, operation);
    void operation.finally(() => operations.delete(key)).catch(() => { });
    return operation;
  };

  return {
    getState: (scope) => store.getState(queueScope(scope)),
    append: async (scope, commandId, request) => {
      void ensureSessionObserved(scope).catch(() => { });
      const isRoot = scope.parentSessionId === undefined;
      const admitted = { ...request, request: isRoot ? assertRootPromptAdmission(request.request) : request.request };
      const captured = await capturePrompt(scope, admitted.request);
      const queue = await store.append(queueScope(scope), commandId, { ...admitted, request: isRoot ? assertRootPromptAdmission(captured) : captured });
      changed(scope, queue); schedule(scope); return queue;
    },
    remove: async (scope, request) => {
      const queue = await store.remove(queueScope(scope), request);
      changed(scope, queue);
      schedule(scope);
      return queue;
    },
    take: async (scope, request) => {
      const taken = await store.take(queueScope(scope), request);
      changed(scope, taken.queue);
      schedule(scope);
      return taken;
    },
    dispatch: (scope) => dispatch(scope),
    hasScheduledTask: (projectId, taskId) => store.hasScheduledTask({ projectId, taskId }),
    cancelScheduledTask: async (projectId, taskId) => {
      const result = await store.cancelScheduledTask({ projectId, taskId });
      try {
        for (const item of result.cancelled) await onScheduledTaskResult(item.provenance, 'cancelled');
      } catch (error) {
        await store.restoreScheduledCancellation(result.cancelled);
        throw error;
      }
      for (const entry of result.queue) changed(entry.scope, entry.state);
      return { cancelled: result.cancelled.length > 0 };
    },
    reorder: async (scope, request) => changed(scope, await store.reorder(queueScope(scope), request)),
    observe: async (scope, input) => {
      const event = parseCanonicalEvent(input);
      if (stopped || event.sessionId !== scope.sessionId) return;
      const owner = queueScope(scope);
      if (event.type === 'run.started' || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled') {
        const matching = (await store.pendingDeliveries(owner)).find((delivery) => delivery.runId === event.runId && delivery.epoch === event.epoch);
        if (matching?.phase === 'submitting') {
          const capture = await recoveryCapture(scope, matching);
          await accepted(scope, capture);
          changed(scope, await store.acknowledge(owner, matching.leaseId));
        }
        if (event.type !== 'run.started') {
          await store.settle(owner, event.runId, event.type === 'run.failed' ? 'PROVIDER_FAILURE' : null);
          if (event.type === 'run.cancelled') holds.set(scopeKey(scope), now() + ABORT_HOLD_MS);
          schedule(scope);
        }
      } else if (event.type === 'session.status' && event.runtimeStatus === 'idle') schedule(scope);
      else if (event.type === 'session.updated' && event.continuationPending === false) schedule(scope);
    },
    setHold: (scope, held, ttlMs = 300_000) => {
      queueScope(scope);
      if (!isBoolean(held) || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new PromptQueueError('INVALID_REQUEST', 400, 'Queue hold requires held and a positive duration');
      const key = scopeKey(scope);
      if (held) { const expiresAt = now() + Math.min(600_000, ttlMs); holds.set(key, expiresAt); schedule(scope, expiresAt - now()); return { held: true, expiresAt }; }
      holds.delete(key); schedule(scope); return { held: false, expiresAt: null };
    },
    start: async () => {
      const listed = await store.list();
      for (const error of listed.errors) reportFailure(error);
      for (const entry of listed.items) {
        void ensureSessionObserved(entry.scope).catch(() => { });
        schedule(entry.scope);
      }
      return listed;
    },
    stop: async () => {
      stopped = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      shutdown.abort();
      await Promise.allSettled(operations.values());
      await store.close();
    },
  };
}
