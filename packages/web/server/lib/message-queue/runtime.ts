import { randomUUID } from 'node:crypto';
import {
  ProblemCodeSchema, ProblemDetailsSchema, QueueAppendRequestSchema,
  QueueDeleteRequestSchema, QueueReorderRequestSchema, QueueStateSchema, QueueTakeRequestSchema, QueueTakeResultSchema,
} from '@openchamber/agent-contract';
import { createCanonicalQueueRuntime } from './canonical-runtime.js';
import { createPromptQueueStore, PromptQueueError } from './sqlite-store.js';

/**
 * Canonical queue construction is deliberately split from Host composition:
 * SQLite owns durable queue state and the OMP service owns execution admission.
 */
export { createCanonicalQueueRuntime, createPromptQueueStore };
const scopeFor = async (resolveSessionScope, sessionId) => {
  const scope = await resolveSessionScope(sessionId);
  if (!scope || scope.sessionId !== sessionId) throw new PromptQueueError('SESSION_NOT_FOUND', 404, 'Session scope is not available');
  return scope;
};

const respondError = (res, error, fallback) => {
  const status = Number.isInteger(error?.status) ? error.status : (error?.name === 'ZodError' ? 400 : 500);
  const parsedCode = ProblemCodeSchema.safeParse(error?.code);
  const code = parsedCode.success ? parsedCode.data : status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR';
  const detail = error instanceof PromptQueueError ? error.message : fallback;
  const problem = ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`, title: detail, status, detail, code,
    retryable: status >= 500,
    ...(error instanceof PromptQueueError && error.details ? { details: error.details } : {}),
  });
  res.status(status).type('application/problem+json').json(problem);
};

const appendInput = (body) => {
  const { commandId, ...request } = body || {};
  return { commandId, request: QueueAppendRequestSchema.parse(request) };
};

const deleteInput = (body, queueItemId) => {
  const request = QueueDeleteRequestSchema.parse({ ...(body || {}), queueItemId });
  if (body?.queueItemId !== undefined && body.queueItemId !== queueItemId) {
    throw new PromptQueueError('INVALID_REQUEST', 400, 'Queue item identity must match its route');
  }
  return request;
};

const takeInput = (body, queueItemId) => {
  const request = QueueTakeRequestSchema.parse({ ...(body || {}), queueItemId });
  if (body?.queueItemId !== undefined && body.queueItemId !== queueItemId) {
    throw new PromptQueueError('INVALID_REQUEST', 400, 'Queue item identity must match its route');
  }
  return request;
};

const takeResult = async (runtime, scope, body, queueItemId) => {
  const taken = await runtime.take(scope, takeInput(body, queueItemId));
  return QueueTakeResultSchema.parse({
    queue: taken.queue,
    draft: taken.stored.draft ?? null,
    text: taken.stored.request.input.text,
    content: taken.stored.content,
    createdAt: taken.stored.createdAt,
  });
};

/**
 * Host product routes for the canonical queue. The request body is the
 * canonical QueueAppend/QueueReorder/Delete DTO; this layer never translates
 * OpenCode-shaped inputs or manufactures a model selection.
 */
export function registerMessageQueueRoutes(app, runtime, { resolveSessionScope, listQueueScopes } = {}) {
  if (typeof resolveSessionScope !== 'function') throw new TypeError('resolveSessionScope is required');
  if (typeof listQueueScopes !== 'function') throw new TypeError('listQueueScopes is required');

  app.get('/api/message-queue', async (_req, res) => {
    try {
      const listed = await listQueueScopes();
      if (!listed || !Array.isArray(listed.items) || !Array.isArray(listed.errors)) throw new PromptQueueError('INTERNAL_ERROR', 503, 'Queue scope listing is unavailable');
      const items = [];
      let maxRevision = 0;
      const errors = listed.errors.map((error) => ({ code: ProblemCodeSchema.safeParse(error?.code).success ? error.code : 'INTERNAL_ERROR' }));
      for (const scope of listed.items) {
        try {
          const state = QueueStateSchema.parse(await runtime.getState(scope));
          items.push(state);
          const rev = Number(state.revision) || 0;
          if (rev > maxRevision) maxRevision = rev;
        }
        catch (error) { errors.push({ code: ProblemCodeSchema.safeParse(error?.code).success ? error.code : 'INTERNAL_ERROR' }); }
      }
      res.json({ revision: maxRevision, items, errors });
    } catch (error) { respondError(res, error, 'Failed to load message queue'); }
  });

  app.post('/api/message-queue/sessions/:sessionId/items', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      const { commandId: bodyCommandId, request } = appendInput(req.body);
      const commandId = bodyCommandId ?? req.get('Idempotency-Key') ?? randomUUID();
      res.json(QueueStateSchema.parse(await runtime.append(scope, commandId, request)));
    } catch (error) { respondError(res, error, 'Failed to queue message'); }
  });

  app.put('/api/message-queue/sessions/:sessionId/order', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      res.json(QueueStateSchema.parse(await runtime.reorder(scope, QueueReorderRequestSchema.parse(req.body))));
    } catch (error) { respondError(res, error, 'Failed to reorder queue'); }
  });

  app.delete('/api/message-queue/sessions/:sessionId/items/:itemId', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      res.json(QueueStateSchema.parse(await runtime.remove(scope, deleteInput(req.body, req.params.itemId))));
    } catch (error) { respondError(res, error, 'Failed to remove queued message'); }
  });
  app.post('/api/message-queue/sessions/:sessionId/items/:itemId/take', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      res.json(await takeResult(runtime, scope, req.body, req.params.itemId));
    } catch (error) { respondError(res, error, 'Failed to take queued message'); }
  });
  app.put('/api/message-queue/sessions/:sessionId/hold', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      res.json(runtime.setHold(scope, req.body?.held, req.body?.ttlMs));
    } catch (error) { respondError(res, error, 'Failed to update queue hold'); }
  });
}
export function registerCanonicalQueueRoutes(router, runtime, { resolveSessionScope } = {}) {
  if (typeof resolveSessionScope !== 'function') throw new TypeError('resolveSessionScope is required');
  const scope = (id) => scopeFor(resolveSessionScope, id);
  router.get('/sessions/:sessionId/queue', async (req, res) => { try { res.json(QueueStateSchema.parse(await runtime.getState(await scope(req.params.sessionId)))); } catch (error) { respondError(res, error, 'Failed to load prompt queue'); } });
  router.post('/sessions/:sessionId/queue', async (req, res) => { try { const { commandId: bodyCommandId, request } = appendInput(req.body); const commandId = bodyCommandId ?? req.get('Idempotency-Key') ?? randomUUID(); res.json(QueueStateSchema.parse(await runtime.append(await scope(req.params.sessionId), commandId, request))); } catch (error) { respondError(res, error, 'Failed to append prompt queue'); } });
  router.put('/sessions/:sessionId/queue/order', async (req, res) => { try { res.json(QueueStateSchema.parse(await runtime.reorder(await scope(req.params.sessionId), QueueReorderRequestSchema.parse(req.body)))); } catch (error) { respondError(res, error, 'Failed to reorder prompt queue'); } });
  router.delete('/sessions/:sessionId/queue/:queueItemId', async (req, res) => { try { res.json(QueueStateSchema.parse(await runtime.remove(await scope(req.params.sessionId), deleteInput(req.body, req.params.queueItemId)))); } catch (error) { respondError(res, error, 'Failed to remove prompt queue item'); } });
  router.post('/sessions/:sessionId/queue/:queueItemId/take', async (req, res) => { try { res.json(await takeResult(runtime, await scope(req.params.sessionId), req.body, req.params.queueItemId)); } catch (error) { respondError(res, error, 'Failed to take prompt queue item'); } });
}
