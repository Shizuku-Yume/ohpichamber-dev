import { z } from 'zod';
import { CanonicalEventSchema, HistoryPageSchema, ProblemDetailsSchema, RunSchema, RuntimeSessionSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import { PromptQueueError } from './sqlite-store.js';

const AdmissionSchema = z.strictObject({ run: RunSchema });
const QUIET_MS = 500;
const ABORT_HOLD_MS = 2000;
const RETRY_MS = 2000;
const LEASE_MS = 30_000;

/** One Host queue dispatcher; service acknowledgements never mean a run is terminal. */
export function createCanonicalQueueRuntime({ store, service, resolveAttachments, publishQueue, reportFailure, now = Date.now }) {
  if (!store || !service || typeof service.request !== 'function') throw new TypeError('canonical queue requires store and Agent service');
  if (typeof resolveAttachments !== 'function' || typeof publishQueue !== 'function' || typeof reportFailure !== 'function') throw new TypeError('canonical queue requires attachments and publication callbacks');
  const timers = new Map();
  const operations = new Map();
  const holds = new Map();
  const shutdown = new AbortController();
  let stopped = false;

  const changed = (scope, queue) => { publishQueue({ scope, queue }); return queue; };
  const remote = async (pathname, schema, init) => {
    const response = await service.request(pathname, { ...init, signal: shutdown.signal });
    const body = await response.json();
    if (!response.ok) {
      const problem = ProblemDetailsSchema.parse(body);
      throw new PromptQueueError(problem.code, problem.status, problem.detail, problem.details);
    }
    return schema.parse(body);
  };
  const prefix = (scope) => `/api/agent/v1/sessions/${encodeURIComponent(scope.sessionId)}`;
  const inScope = (scope, runtime) => {
    if (runtime.sessionId !== scope.sessionId || runtime.projectId !== scope.projectId || runtime.workspaceId !== scope.workspaceId) {
      throw new PromptQueueError('SESSION_NOT_FOUND', 404, 'Execution session does not belong to the queue workspace');
    }
    return runtime;
  };
  const schedule = (scope, delay = QUIET_MS) => {
    if (stopped) return;
    const existing = timers.get(scope.sessionId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      timers.delete(scope.sessionId);
      void dispatch(scope).catch((error) => {
        reportFailure({ scope, code: error instanceof PromptQueueError ? error.code : 'SERVICE_UNAVAILABLE' });
        schedule(scope, RETRY_MS);
      });
    }, delay);
    timer.unref(); timers.set(scope.sessionId, timer);
  };
  const matchingTurn = async (scope, snapshot, runId) => {
    const found = snapshot.turns.findLast((turn) => turn.runId === runId);
    if (found || !snapshot.window.hasEarlier) return found;
    let cursor;
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
  };
  const recover = async (scope, runtime) => {
    const pending = await store.pendingDeliveries(scope);
    if (pending.length === 0) return;
    const snapshot = await remote(`${prefix(scope)}/snapshot`, SessionSnapshotSchema);
    inScope(scope, snapshot.session);
    for (const delivery of pending) {
      if (delivery.phase === 'claimed') continue;
      if (snapshot.activeRun?.runId === delivery.runId || await matchingTurn(scope, snapshot, delivery.runId)) {
        if (delivery.phase === 'submitting') changed(scope, await store.acknowledge(scope, delivery.leaseId));
        if (snapshot.session.activeRunId !== delivery.runId) await store.settle(scope, delivery.runId);
      } else if (delivery.phase === 'submitting' && delivery.epoch !== runtime.epoch) {
        // A lost generation cannot prove whether its tool side effects ran. Never resend it.
        changed(scope, await store.fail(scope, delivery.leaseId, 'SESSION_RESTORE_FAILED'));
        reportFailure({ scope, queueItemId: delivery.queueItemId, runId: delivery.runId, code: 'SESSION_RESTORE_FAILED' });
      } else if (delivery.phase === 'submitting') {
        throw new PromptQueueError('COMMAND_IN_FLIGHT', 409, 'Prompt admission is not yet reconciled');
      }
    }
  };
  const dispatch = (scope) => {
    const existing = operations.get(scope.sessionId);
    if (existing) return existing;
    if (stopped) return Promise.resolve();
    const operation = (async () => {
      const holdUntil = holds.get(scope.sessionId) ?? 0;
      if (holdUntil > now()) { schedule(scope, holdUntil - now()); return; }
      holds.delete(scope.sessionId);
      const runtime = inScope(scope, await remote(prefix(scope), RuntimeSessionSchema));
      if (runtime.runtimeStatus === 'unavailable') throw new PromptQueueError('SERVICE_UNAVAILABLE', 503, 'Execution session must be reopened before dispatch');
      await recover(scope, runtime);
      const before = await store.getState(scope);
      const recovered = await store.recoverUnsentClaims(scope);
      if (recovered.revision !== before.revision) changed(scope, recovered);
      if (runtime.activeRunId !== null || runtime.runtimeStatus !== 'idle' || recovered.items.length === 0) return;
      if (recovered.items[0].status === 'leased') { schedule(scope, Math.max(RETRY_MS, recovered.items[0].lease.expiresAt - now())); return; }
      const claimed = await store.claimHead(scope, recovered.revision, { epoch: runtime.epoch, expiresAt: now() + LEASE_MS });
      if (!claimed.capture) return;
      changed(scope, claimed.queue);
      const capture = claimed.capture;
      let attachments;
      try { attachments = await resolveAttachments(scope, capture.request.input.attachments); }
      catch (error) {
        changed(scope, await store.fail(scope, capture.leaseId, 'INVALID_REQUEST'));
        reportFailure({ scope, queueItemId: capture.queueItemId, runId: capture.runId, code: 'INVALID_REQUEST' });
        schedule(scope); return;
      }
      if (stopped) return;
      await store.markSubmitting(scope, capture.leaseId);
      let response;
      try {
        response = await service.request(`/internal/sessions/${encodeURIComponent(scope.sessionId)}/runs`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'prompt', runId: capture.runId, request: capture.request, attachments }),
          signal: shutdown.signal,
        });
      } catch {
        // Transport failure is not proof of rejection. Reconcile run identity first.
        schedule(scope, RETRY_MS); return;
      }
      const body = await response.json();
      if (!response.ok) {
        const problem = ProblemDetailsSchema.parse(body);
        if (problem.code === 'RUN_ACTIVE') changed(scope, await store.retry(scope, capture.leaseId, problem.code));
        else if (response.status >= 400 && response.status < 500) {
          changed(scope, await store.fail(scope, capture.leaseId, problem.code));
          reportFailure({ scope, queueItemId: capture.queueItemId, runId: capture.runId, code: problem.code });
        }
        // A 5xx can arrive after admission; leave its claim intact until reconciliation.
        schedule(scope, RETRY_MS); return;
      }
      const admitted = AdmissionSchema.parse(body);
      if (admitted.run.runId !== capture.runId || admitted.run.sessionId !== scope.sessionId) {
        throw new PromptQueueError('INTERNAL_ERROR', 503, 'Execution acknowledgement identifies another delivery');
      }
      changed(scope, await store.acknowledge(scope, capture.leaseId));
    })();
    operations.set(scope.sessionId, operation);
    void operation.finally(() => operations.delete(scope.sessionId)).catch(() => {});
    return operation;
  };

  return {
    append: async (scope, commandId, request) => {
      const queue = await store.append(scope, commandId, request);
      changed(scope, queue); schedule(scope); return queue;
    },
    reorder: async (scope, request) => changed(scope, await store.reorder(scope, request)),
    remove: async (scope, request) => changed(scope, await store.remove(scope, request)),
    getState: store.getState,
    dispatch,
    observe: async (scope, input) => {
      const event = CanonicalEventSchema.parse(input);
      if (stopped || event.sessionId !== scope.sessionId) return;
      if (event.type === 'run.started' || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled') {
        const matching = (await store.pendingDeliveries(scope)).find((delivery) => delivery.runId === event.runId && delivery.epoch === event.epoch);
        if (matching?.phase === 'submitting') changed(scope, await store.acknowledge(scope, matching.leaseId));
        if (event.type !== 'run.started') {
          await store.settle(scope, event.runId, event.type === 'run.failed' ? 'PROVIDER_FAILURE' : null);
          if (event.type === 'run.cancelled') holds.set(scope.sessionId, now() + ABORT_HOLD_MS);
          schedule(scope);
        }
      } else if (event.type === 'session.status' && event.runtimeStatus === 'idle') schedule(scope);
    },
    setHold: (scope, held, ttlMs = 300_000) => {
      if (held) { const expiresAt = now() + Math.min(600_000, Math.max(1, ttlMs)); holds.set(scope.sessionId, expiresAt); schedule(scope, expiresAt - now()); return { held: true, expiresAt }; }
      holds.delete(scope.sessionId); schedule(scope); return { held: false, expiresAt: null };
    },
    start: async () => {
      const listed = await store.list();
      for (const error of listed.errors) reportFailure(error);
      for (const entry of listed.items) schedule(entry.scope);
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
