import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { SessionCreateAckSchema, SessionCreateRequestSchema, RuntimeSessionSchema, SessionSchema, RunSchema, RunAbortRequestSchema, SessionDeleteAckSchema, PromptRequestSchema, CapturedSendOptionsSchema, SessionSnapshotSchema, HistoryPageSchema, SessionMetadataStateSchema, SessionMetadataPatchSchema, SteerRequestSchema, SteerAckSchema, FollowUpRequestSchema, FollowUpAckSchema, ProblemDetailsSchema, ProblemCodeSchema } from '@openchamber/agent-contract';

import { OpenChamberControlError, asControlError } from '../openchamber-control/error.js';
const SessionForkAckSchema = z.strictObject({ sessionId: z.string().min(1), rootSessionId: z.string().min(1), sessionFile: z.string().min(1), sourceSessionId: z.string().min(1), entryId: z.string().min(1).nullable(), mode: z.enum(['selected', 'full']) });
const SessionReopenScopeSchema = z.strictObject({ rootSessionId: z.string().min(1), projectId: z.string().min(1), workspaceId: z.string().min(1), cwd: z.string().min(1), agentDirectory: z.string().min(1), agentDirectoryId: z.string().min(1), displayPath: z.string().min(1), env: z.record(z.string(), z.string()).optional() });




/**
 * Upper bound on one archive batch.
 *
 * The batch is a bounded amount of work on one request, and callers with more
 * sessions than this send several batches and keep their own partial results.
 */
const MAX_ARCHIVE_BATCH = 500;

const parseIdBatch = (payload) => {
  const rawIds = payload?.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { ok: false, error: 'ids must be a non-empty array of session ids' };
  }
  if (rawIds.length > MAX_ARCHIVE_BATCH) {
    return { ok: false, error: `ids must contain at most ${MAX_ARCHIVE_BATCH} session ids` };
  }

  const ids = [];
  for (const value of rawIds) {
    const id = asNonEmptyString(value);
    if (!id) return { ok: false, error: 'ids must contain non-empty session ids' };
    ids.push(id);
  }
  return { ok: true, ids };
};

const parseArchiveRequest = (payload) => {
  const parsed = parseIdBatch(payload);
  if (!parsed.ok) return parsed;

  const archivedAt = payload?.archivedAt;
  if (archivedAt !== undefined && (!Number.isSafeInteger(archivedAt) || archivedAt <= 0)) {
    return { ok: false, error: 'archivedAt must be a positive integer timestamp' };
  }

  return { ok: true, ids: parsed.ids, archivedAt: archivedAt ?? Date.now() };
};


const createCanonicalSessionService = (dependencies) => {
  const { service, resolveWorkspaceScope, resolveSessionScope, listWorkspaceScopes, registerSessionScope, resolveAttachments, capturePrompt, beforeDispatch, onPromptAccepted, publishSessionEvent, archiveStore, sessionMetadataStore, persistSessionMetadata, broadcastGlobalUiEvent } = dependencies;
  if (!service || typeof service.request !== 'function') throw new Error('session routes require the Agent service');
  if (typeof resolveWorkspaceScope !== 'function' || typeof resolveSessionScope !== 'function') throw new Error('session routes require Host scope resolvers');
  if (typeof registerSessionScope !== 'function') throw new Error('session routes require registerSessionScope');
  if (typeof resolveAttachments !== 'function') throw new Error('session routes require resolveAttachments');
  if (typeof capturePrompt !== 'function' || typeof beforeDispatch !== 'function' || typeof onPromptAccepted !== 'function') throw new Error('session routes require direct delivery hooks');
  const request = async (pathname, init = {}) => {
    const response = await service.request(pathname, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) { const problem = ProblemDetailsSchema.safeParse(body); const error = new OpenChamberControlError(problem.success ? problem.data.detail : body?.detail || body?.error || 'Agent service request failed', response.status); error.code = problem.success ? problem.data.code : body?.code; throw error; }
    return body;
  };
  const scopeFor = async (sessionId) => { const scope = await resolveSessionScope(sessionId); if (!scope) throw new OpenChamberControlError('Session scope was not found', 404); return scope; };
  const emit = (event) => { try { publishSessionEvent?.(event); } catch {} try { broadcastGlobalUiEvent?.(event); } catch {} };
  const metadata = { getState: (id) => sessionMetadataStore.getState(id), set: async (id, patch, directory = '') => persistSessionMetadata ? persistSessionMetadata(id, patch, { directory }) : sessionMetadataStore.setSessionMetadata(id, patch) };
  const create = async (payload = {}) => {
    const parsed = SessionCreateRequestSchema.safeParse(payload);
    if (!parsed.success) throw new OpenChamberControlError('Session create request is invalid', 400);
    const { projectId, workspaceId, metadata: requestedMetadata } = parsed.data;
    const options = CapturedSendOptionsSchema.parse(parsed.data.options);
    const workspace = await resolveWorkspaceScope(workspaceId);
    if (!workspace || workspace.projectId !== projectId) throw new OpenChamberControlError('Workspace does not belong to project', 404);
    const rootSessionId = randomUUID();
    const displayPath = typeof workspace.displayPath === 'string' && !workspace.displayPath.startsWith('/') && !workspace.displayPath.startsWith('\\') && !/^[A-Za-z]:/.test(workspace.displayPath) ? workspace.displayPath : 'workspace';
    const body = await request('/internal/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rootSessionId, projectId, workspaceId, cwd: workspace.cwd, agentDirectory: workspace.agentDirectory, agentDirectoryId: workspace.agentDirectoryId, displayPath, options, ...(workspace.env ? { env: workspace.env } : {}) }) });
    const session = RuntimeSessionSchema.parse(body);
    if (session.projectId !== projectId || session.workspaceId !== workspaceId || session.rootSessionId !== rootSessionId) throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502);
    if (!await registerSessionScope(session)) throw new OpenChamberControlError('Session scope registration failed', 500);
    if (requestedMetadata) await metadata.set(session.sessionId, requestedMetadata, workspace.cwd);
    const stored = await sessionMetadataStore.getState(session.sessionId);
    const result = SessionCreateAckSchema.parse({ session: SessionSchema.parse({ ...session, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: '0' }) });
    emit({ type: 'openchamber:session-created', properties: { sessionId: session.sessionId, projectId, workspaceId } });
    return result;
  };
  const prepareDelivery = async (scope, requestBody, identity = {}) => { const capturedRequest = PromptRequestSchema.parse(await capturePrompt(scope, requestBody)); const capture = { ...identity, request: capturedRequest }; await beforeDispatch(scope, capture); const attachments = await resolveAttachments(scope, capturedRequest.input.attachments); return { ...capture, attachments }; };
  const send = async (sessionId, payload = {}) => { const scope = await scopeFor(sessionId); const requestBody = PromptRequestSchema.parse(payload); const runId = randomUUID(); const capture = await prepareDelivery(scope, requestBody, { runId, deliveryRunId: runId }); const response = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'prompt', runId, request: capture.request, attachments: capture.attachments }) }); const run = RunSchema.parse(response?.run); const receipt = { runId, deliveryRunId: runId, run }; await onPromptAccepted(scope, { ...capture, receipt }, receipt); return { run }; };
  const steer = async (sessionId, payload = {}) => { const scope = await scopeFor(sessionId); const requestBody = PromptRequestSchema.parse(payload.request ?? payload); const envelope = SteerRequestSchema.parse({ sessionId, request: requestBody }); const deliveryRunId = randomUUID(); const capture = await prepareDelivery(scope, envelope.request, { deliveryRunId }); const ack = SteerAckSchema.parse(await request(`/internal/sessions/${encodeURIComponent(sessionId)}/steer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: capture.request, attachments: capture.attachments }) })); const receipt = { runId: ack.runId, deliveryRunId, ack }; await onPromptAccepted(scope, { ...capture, runId: ack.runId, receipt }, receipt); return ack; };
  const followUp = async (sessionId, payload = {}) => { const scope = await scopeFor(sessionId); const requestBody = PromptRequestSchema.parse(payload.request ?? payload); const envelope = FollowUpRequestSchema.parse({ sessionId, request: requestBody }); const deliveryRunId = randomUUID(); const capture = await prepareDelivery(scope, envelope.request, { deliveryRunId }); const ack = FollowUpAckSchema.parse(await request(`/internal/sessions/${encodeURIComponent(sessionId)}/follow-up`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: capture.request, attachments: capture.attachments }) })); const receipt = { deliveryRunId, followUpId: ack.followUpId, ack }; await onPromptAccepted(scope, { ...capture, receipt }, receipt); return ack; };
  const fork = async (sessionId, payload = {}) => { const source = await scopeFor(sessionId); const publicMessageId = asNonEmptyString(payload.messageId); const directEntryId = asNonEmptyString(payload.entryId); const entryId = publicMessageId ? asNonEmptyString((await request(`/internal/sessions/${encodeURIComponent(sessionId)}/native-entry/${encodeURIComponent(publicMessageId)}`)).entryId) : directEntryId; const mode = payload.mode === undefined ? (entryId ? 'selected' : 'full') : payload.mode; if (mode !== 'selected' && mode !== 'full') throw new OpenChamberControlError('Fork mode must be selected or full', 400); if (mode === 'selected' && !entryId) throw new OpenChamberControlError('A native entry identity is required for a selected fork', 400); const body = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/fork`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceSessionId: sessionId, entryId: entryId ?? null, mode }) }); const ack = SessionForkAckSchema.parse(body); if (ack.sourceSessionId !== sessionId || (mode === 'selected' && ack.entryId !== entryId) || ack.mode !== mode) throw new OpenChamberControlError('Fork acknowledgement does not match the requested source', 502); const child = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(ack.sessionId)}`)); if (child.sessionId !== ack.sessionId || child.rootSessionId !== ack.rootSessionId || child.projectId !== source.projectId || child.workspaceId !== source.workspaceId) throw new OpenChamberControlError('Fork acknowledgement is outside the source scope', 502); if (!await registerSessionScope(child)) throw new OpenChamberControlError('Forked session scope registration failed', 500); const stored = await sessionMetadataStore.getState(child.sessionId); const archive = await archiveStore.getState(child.sessionId); const result = SessionCreateAckSchema.parse({ session: SessionSchema.parse({ ...child, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', ...(archive?.archivedAt === undefined ? {} : { archivedAt: archive.archivedAt }), archiveRevision: archive?.revision ?? '0' }) }); return result; };
  const reopen = async (scope) => {
    const bootstrap = SessionReopenScopeSchema.parse({ rootSessionId: scope.rootSessionId, projectId: scope.projectId, workspaceId: scope.workspaceId, cwd: scope.cwd, agentDirectory: scope.agentDirectory, agentDirectoryId: scope.agentDirectoryId, displayPath: scope.displayPath ?? 'workspace', ...(scope.env ? { env: scope.env } : {}) });
    const runtime = RuntimeSessionSchema.parse(await request(`/internal/sessions/${encodeURIComponent(bootstrap.rootSessionId)}/reopen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bootstrap) }));
    if (runtime.sessionId !== bootstrap.rootSessionId || runtime.rootSessionId !== bootstrap.rootSessionId || runtime.projectId !== bootstrap.projectId || runtime.workspaceId !== bootstrap.workspaceId) throw new OpenChamberControlError('Session restore acknowledgement is outside the authorized scope', 502);
  };
  const open = async (id) => { const scope = await scopeFor(id); await reopen(scope); const snapshot = SessionSnapshotSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/snapshot`)); if (snapshot.session.sessionId !== id || snapshot.session.projectId !== scope.projectId || snapshot.session.workspaceId !== scope.workspaceId) throw new OpenChamberControlError('Session snapshot is outside the authorized scope', 502); return snapshot; };
  const history = async (id, query = '') => { const scope = await scopeFor(id); await reopen(scope); const page = HistoryPageSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/history${query ? `?${query}` : ''}`)); if (page.sessionId !== id || page.turns.some(turn => turn.projectId !== undefined && turn.projectId !== scope.projectId) || page.messages.some(message => message.projectId !== undefined && message.projectId !== scope.projectId)) throw new OpenChamberControlError('Session history is outside the authorized scope', 502); return page; };
  const list = async (workspaceId) => {
    const scopePage = workspaceId ? { items: [{ workspaceId }], errors: {} } : await (typeof listWorkspaceScopes === 'function' ? listWorkspaceScopes() : Promise.reject(new OpenChamberControlError('Workspace enumeration is unavailable', 503)));
    const parsedScopes = z.strictObject({ items: z.array(z.strictObject({ workspaceId: z.string().min(1) })), errors: z.record(ProblemCodeSchema) }).parse(scopePage);
    const pages = await Promise.all(parsedScopes.items.map(async ({ workspaceId: id }) => {
      try {
        const workspace = await resolveWorkspaceScope(id);
        if (!workspace) throw new OpenChamberControlError('Workspace scope is unavailable during global session listing', workspaceId ? 404 : 503, { code: workspaceId ? 'SESSION_NOT_FOUND' : 'SERVICE_UNAVAILABLE' });
        const raw = z.strictObject({ items: z.array(RuntimeSessionSchema), errors: z.array(z.strictObject({ sessionId: z.string().min(1), code: ProblemCodeSchema })) }).parse(await request(`/api/agent/v1/sessions?workspaceId=${encodeURIComponent(id)}`));
        const items = await Promise.all(raw.items.map(async session => {
          if (session.projectId !== workspace.projectId || session.workspaceId !== id) throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502, { code: 'INTERNAL_ERROR' });
          const metadataState = await sessionMetadataStore.getState(session.sessionId);
          const archiveState = await archiveStore.getState(session.sessionId);
          if (!await registerSessionScope(session)) throw new OpenChamberControlError('Session scope registration failed', 500, { code: 'INTERNAL_ERROR' });
          return SessionSchema.parse({ ...session, metadata: metadataState?.metadata ?? null, metadataRevision: metadataState?.revision ?? '0', ...(archiveState?.archivedAt === undefined ? {} : { archivedAt: archiveState.archivedAt }), archiveRevision: archiveState?.revision ?? '0' });
        }));
        return { items, errors: Object.fromEntries(raw.errors.map(error => [error.sessionId, error.code])) };
      } catch (error) {
        const code = ProblemCodeSchema.safeParse(error?.code);
        return { items: [], errors: { [id]: code.success ? code.data : 'SERVICE_UNAVAILABLE' } };
      }
    }));
    return z.strictObject({ items: z.array(SessionSchema), errors: z.record(ProblemCodeSchema) }).parse({ items: pages.flatMap(page => page.items), errors: Object.assign({}, parsedScopes.errors, ...pages.map(page => page.errors)) });
  };
  const archive = async (payload = {}) => { const parsed = parseArchiveRequest(payload); if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400); await Promise.all(parsed.ids.map((id) => scopeFor(id))); return archiveStore.archive(parsed.ids, parsed.archivedAt); };
  const unarchive = async (payload = {}) => { const parsed = parseIdBatch(payload); if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400); await Promise.all(parsed.ids.map((id) => scopeFor(id))); return archiveStore.unarchive(parsed.ids); };
  const getMetadata = async (id) => { await scopeFor(id); const state = await sessionMetadataStore.getState(id); return SessionMetadataStateSchema.parse({ sessionId: id, revision: state?.revision ?? '0', metadata: state?.metadata ?? null }); };
  const setMetadata = async (id, payload = {}) => { const scope = await scopeFor(id); const patch = SessionMetadataPatchSchema.parse(payload); const result = await metadata.set(id, patch.changes, scope.cwd); return SessionMetadataStateSchema.parse({ sessionId: id, revision: result.revision, metadata: result.metadata }); };
  const control = async (sessionId, operation = {}) => { await scopeFor(sessionId); if (operation?.type !== 'abort') throw new OpenChamberControlError('Unsupported session control operation', 400); const parsed = RunAbortRequestSchema.parse({ sessionId, runId: operation.runId }); const body = await request(`/api/agent/v1/sessions/${encodeURIComponent(parsed.sessionId)}/runs/${encodeURIComponent(parsed.runId)}/abort`, { method: 'POST' }); return { run: RunSchema.parse(body?.run) }; };
  const remove = async (id) => { await scopeFor(id); const ack = SessionDeleteAckSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })); if (ack.sessionId !== id) throw new OpenChamberControlError('Session deletion acknowledgement identified another session', 502); return ack; };
  return { create, send, steer, followUp, fork, delete: remove, open, history, list, control, resolveDirectory: async (payload = {}) => { const scope = await resolveWorkspaceScope(payload.workspaceId); if (!scope) throw new OpenChamberControlError('Workspace was not found', 404); return scope.cwd; }, archive, unarchive, getMetadata, setMetadata, sessionMetadataStore, archiveStore };
};



export const createOpenChamberSessionService = (dependencies) => createCanonicalSessionService(dependencies);
const sendServiceError = (res, error, fallback) => {
  const controlError = asControlError(error, fallback);
  const status = controlError.statusCode >= 400 && controlError.statusCode <= 599 ? controlError.statusCode : 500;
  const codeResult = ProblemCodeSchema.safeParse(error?.code);
  const code = codeResult.success ? codeResult.data : status === 404 ? 'SESSION_NOT_FOUND' : status === 400 ? 'INVALID_REQUEST' : status === 401 || status === 403 ? 'UNAUTHORIZED' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR';
  const problem = ProblemDetailsSchema.parse({ type: `urn:ohpichamber:problem:${code}`, title: 'Session operation failed', status, detail: controlError.message || fallback || 'Session operation failed', code, retryable: status >= 500 });
  return res.status(status).json(problem);
};

export const registerOpenChamberSessionRoutes = (app, dependencies) => {
  if (!dependencies.isRequestOriginAllowed) throw new Error('Session routes require isRequestOriginAllowed');
  const service = dependencies.sessionService || createOpenChamberSessionService(dependencies);


  app.post('/api/openchamber/sessions', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.create(req.body && typeof req.body === 'object' ? req.body : {}));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to create session:', error);
      return sendServiceError(res, error, 'Failed to create session');
    }
  });

  app.post('/api/openchamber/sessions/archive', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.archive(req.body && typeof req.body === 'object' ? req.body : {}));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to archive sessions:', error);
      return sendServiceError(res, error, 'Failed to archive sessions');
    }
  });

  app.get('/api/openchamber/sessions/:sessionId/metadata', async (req, res) => {
    try {
      return res.json(await service.getMetadata(
        req.params.sessionId,
        asNonEmptyString(req.query?.directory) || '',
      ));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to read session metadata:', error);
      return sendServiceError(res, error, 'Failed to read session metadata');
    }
  });

  app.patch('/api/openchamber/sessions/:sessionId/metadata', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.setMetadata(
        req.params.sessionId,
        req.body && typeof req.body === 'object' ? req.body : {},
      ));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to store session metadata:', error);
      return sendServiceError(res, error, 'Failed to store session metadata');
    }
  });

  app.post('/api/openchamber/sessions/unarchive', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.unarchive(req.body && typeof req.body === 'object' ? req.body : {}));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to unarchive sessions:', error);
      return sendServiceError(res, error, 'Failed to unarchive sessions');
    }
  });

  app.post(
    '/api/openchamber/sessions/:sessionId/send',
    express.json({ limit: '1mb' }),
    async (req, res) => {
      try {
        return res.json(await service.send(req.params.sessionId, req.body));
      } catch (error) {
        console.error('[OpenChamberSessions] failed to send session:', error);
        return sendServiceError(res, error, 'Failed to send session');
      }
    },
  );
  app.post('/api/openchamber/sessions/:sessionId/steer', express.json({ limit: '1mb' }), async (req, res) => { try { return res.json(await service.steer(req.params.sessionId, req.body || {})); } catch (error) { return sendServiceError(res, error, 'Failed to steer session'); } });
  app.post('/api/openchamber/sessions/:sessionId/follow-up', express.json({ limit: '1mb' }), async (req, res) => { try { return res.json(await service.followUp(req.params.sessionId, req.body || {})); } catch (error) { return sendServiceError(res, error, 'Failed to submit session follow-up'); } });
  app.post(
    '/api/openchamber/sessions/:sessionId/fork',
    express.json({ limit: '1mb' }),
    async (req, res) => {
      try {
        return res.json(await service.fork(req.params.sessionId, req.body));
      } catch (error) {
        console.error('[OpenChamberSessions] failed to fork session:', error);
        return sendServiceError(res, error, 'Failed to fork session');
      }
    },
  );
  app.get('/api/openchamber/sessions/:sessionId', async (req, res) => {
    try { return res.json(await service.open(req.params.sessionId)); }
    catch (error) { return sendServiceError(res, error, 'Failed to open session'); }
  });
  app.get('/api/openchamber/sessions/:sessionId/history', async (req, res) => {
    try { return res.json(await service.history(req.params.sessionId, new URLSearchParams(req.query).toString())); }
    catch (error) { return sendServiceError(res, error, 'Failed to read session history'); }
  });
  app.post('/api/openchamber/sessions/:sessionId/control', express.json({ limit: '1mb' }), async (req, res) => {
    try { return res.json(await service.control(req.params.sessionId, req.body || {})); }
    catch (error) { return sendServiceError(res, error, 'Failed to control session'); }
  });
};
export const registerCanonicalSessionRoutes = (router, service) => {
  const call = async (res, operation, fallback) => { try { res.json(await operation()); } catch (error) { sendServiceError(res, error, fallback); } };
  router.post('/', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.create(req.body || {}), 'Failed to create session'));
  router.get('/', (req, res) => call(res, () => service.list(typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined), 'Failed to list sessions'));
  router.get('/:sessionId', (req, res) => call(res, () => service.open(req.params.sessionId), 'Failed to open session'));
  router.get('/:sessionId/history', (req, res) => call(res, () => service.history(req.params.sessionId, new URLSearchParams(req.query).toString()), 'Failed to read session history'));
  router.post('/:sessionId/runs', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.send(req.params.sessionId, req.body || {}), 'Failed to submit session run'));
  router.post('/:sessionId/steer', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.steer(req.params.sessionId, req.body || {}), 'Failed to steer session'));
  router.post('/:sessionId/follow-up', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.followUp(req.params.sessionId, req.body || {}), 'Failed to submit session follow-up'));
  router.post('/:sessionId/fork', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.fork(req.params.sessionId, req.body || {}), 'Failed to fork session'));
  router.post('/:sessionId/control', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.control(req.params.sessionId, req.body || {}), 'Failed to control session'));
  router.delete('/:sessionId', (req, res) => call(res, () => service.delete(req.params.sessionId), 'Failed to delete session'));
  router.get('/:sessionId/metadata', (req, res) => call(res, () => service.getMetadata(req.params.sessionId), 'Failed to read session metadata'));
  router.patch('/:sessionId/metadata', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.setMetadata(req.params.sessionId, req.body || {}), 'Failed to write session metadata'));
};
