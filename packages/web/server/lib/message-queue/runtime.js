import { createCanonicalQueueRuntime } from './canonical-runtime.js';
import { createPromptQueueStore, PromptQueueError } from './sqlite-store.js';

/**
 * Canonical queue construction is deliberately split from Host composition:
 * SQLite owns durable queue state and the OMP service owns execution admission.
 */
export { createCanonicalQueueRuntime, createPromptQueueStore, PromptQueueError };

const scopeFor = async (resolveSessionScope, sessionId) => {
  const scope = await resolveSessionScope(sessionId);
  if (!scope) throw Object.assign(new Error('Session scope is not available'), { status: 404, code: 'SESSION_NOT_FOUND' });
  return scope;
};

const respondError = (res, error, fallback) => {
  const status = Number.isInteger(error?.status) ? error.status : (error?.name === 'ZodError' ? 400 : 500);
  res.status(status).json({
    type: 'about:blank',
    title: error?.message || fallback,
    status,
    detail: error?.message || fallback,
    code: error?.code || 'INTERNAL_ERROR',
    ...(error?.details ? { details: error.details } : {}),
  });
};

/**
 * Host product routes for the canonical queue. The request body is the
 * canonical QueueAppend/QueueReorder/Delete DTO; this layer never translates
 * OpenCode-shaped inputs or manufactures a model selection.
 */
export function registerMessageQueueRoutes(app, runtime, { resolveSessionScope, listQueueScopes } = {}) {
  if (typeof resolveSessionScope !== 'function') throw new TypeError('resolveSessionScope is required');

  app.get('/api/message-queue', async (_req, res) => {
    try {
      const scopes = typeof listQueueScopes === 'function' ? await listQueueScopes() : [];
      const items = [];
      const errors = [];
      for (const scope of scopes) {
        try { items.push({ scope, queue: await runtime.getState(scope) }); }
        catch (error) { errors.push({ scope, code: error?.code || 'INTERNAL_ERROR' }); }
      }
      res.json({ items, errors });
    } catch (error) { respondError(res, error, 'Failed to load message queue'); }
  });

  app.post('/api/message-queue/sessions/:sessionId/items', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      const body = req.body || {};
      res.json(await runtime.append(scope, body.commandId, body));
    } catch (error) { respondError(res, error, 'Failed to queue message'); }
  });

  app.put('/api/message-queue/sessions/:sessionId/order', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      res.json(await runtime.reorder(scope, req.body || {}));
    } catch (error) { respondError(res, error, 'Failed to reorder queue'); }
  });

  app.delete('/api/message-queue/sessions/:sessionId/items/:itemId', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      res.json(await runtime.remove(scope, { ...(req.body || {}), queueItemId: req.params.itemId }));
    } catch (error) { respondError(res, error, 'Failed to remove queued message'); }
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
  const scope = async (id) => { const value = await resolveSessionScope(id); if (!value) throw Object.assign(new Error('Session scope was not found'), { status: 404, code: 'SESSION_NOT_FOUND' }); return value; };
  router.get('/sessions/:sessionId/queue', async (req, res) => { try { res.json(await runtime.getState(await scope(req.params.sessionId))); } catch (error) { respondError(res, error, 'Failed to load prompt queue'); } });
  router.post('/sessions/:sessionId/queue', async (req, res) => { try { const body = req.body || {}; res.json(await runtime.append(await scope(req.params.sessionId), body.commandId, body)); } catch (error) { respondError(res, error, 'Failed to append prompt queue'); } });
  router.put('/sessions/:sessionId/queue/order', async (req, res) => { try { res.json(await runtime.reorder(await scope(req.params.sessionId), req.body || {})); } catch (error) { respondError(res, error, 'Failed to reorder prompt queue'); } });
  router.delete('/sessions/:sessionId/queue/:queueItemId', async (req, res) => { try { res.json(await runtime.remove(await scope(req.params.sessionId), { ...(req.body || {}), queueItemId: req.params.queueItemId })); } catch (error) { respondError(res, error, 'Failed to remove prompt queue item'); } });
}
