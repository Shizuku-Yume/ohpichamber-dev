import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { SessionCreateAckSchema, SessionCreateRequestSchema, RuntimeSessionSchema, SessionSchema, RunSchema, SessionDeleteAckSchema, PromptRequestSchema, CapturedSendOptionsSchema, SessionSnapshotSchema, HistoryPageSchema, SessionsPageSchema, ProblemDetailsSchema, ProblemCodeSchema } from '@openchamber/agent-contract';

import { OpenChamberControlError, asControlError } from '../openchamber-control/error.js';
const asNonEmptyString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const asList = (value) => (Array.isArray(value) ? value : []);
const isAutoModel = (selection) => selection?.providerID === 'opencode' && selection?.modelID === 'auto';


const splitModel = (value) => {
  const model = asNonEmptyString(value);
  if (!model) return null;
  const slashIndex = model.indexOf('/');
  if (slashIndex <= 0 || slashIndex === model.length - 1) return null;
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  };
};


const MIN_GOAL_TOKEN_BUDGET = 1_000;
const MAX_GOAL_TOKEN_BUDGET = 100_000_000;

const resolveGoalInput = (payload, prompt) => {
  const enabled = payload?.goal === true;
  if (payload?.goalTokenBudget !== undefined && !enabled) {
    return { ok: false, error: 'goalTokenBudget requires goal' };
  }
  if (enabled && !prompt) {
    return { ok: false, error: 'prompt is required when goal is enabled' };
  }
  if (payload?.goalTokenBudget === undefined) {
    return { ok: true, enabled, tokenBudget: null };
  }
  const tokenBudget = payload.goalTokenBudget;
  if (!Number.isSafeInteger(tokenBudget)
    || tokenBudget < MIN_GOAL_TOKEN_BUDGET
    || tokenBudget > MAX_GOAL_TOKEN_BUDGET) {
    return { ok: false, error: `goalTokenBudget must be an integer from ${MIN_GOAL_TOKEN_BUDGET} to ${MAX_GOAL_TOKEN_BUDGET}` };
  }
  return { ok: true, enabled, tokenBudget };
};

const isPrimaryAgentMode = (mode) => !mode || mode === 'primary' || mode === 'all';


const findCatalogModel = (models, providerID, modelID) => models.find(
  (model) => model?.providerID === providerID && model?.modelID === modelID,
) || null;

const resolveVariant = (models, providerID, modelID, variant) => {
  const normalized = asNonEmptyString(variant);
  if (!normalized) return undefined;
  const model = findCatalogModel(models, providerID, modelID);
  // A model the catalog does not know yet (cold or unreachable) keeps the
  // user's saved variant instead of losing it to a discovery gap.
  if (!model) return normalized;
  return asList(model.variants).some((entry) => entry?.id === normalized) ? normalized : undefined;
};

const isModelHidden = (hiddenModels, providerID, modelID) => hiddenModels.some(
  (hidden) => hidden?.providerID === providerID && hidden?.modelID === modelID,
);


const resolveProjectDefaults = (settings, directory, projectId) => {
  const projects = Array.isArray(settings?.projects) ? settings.projects : [];
  const matchedProject = projectId
    ? projects.find((entry) => entry?.id === projectId) || null
    : projects.find((entry) => entry?.path === directory) || null;
  return {
    defaultAgent: asNonEmptyString(matchedProject?.defaultAgent),
    defaultModel: asNonEmptyString(matchedProject?.defaultModel),
    defaultVariant: asNonEmptyString(matchedProject?.defaultVariant),
  };
};


const resolveDefaultSelection = ({ agents, models, settings, projectDefaults, opencodeDefaultAgent, opencodeDefaultModel, autoAvailable }) => {
  const primaryAgents = agents.filter((agent) => isPrimaryAgentMode(agent?.mode) && agent?.hidden !== true);
  let resolvedAgent = null;
  const projectDefaultAgent = asNonEmptyString(projectDefaults?.defaultAgent);
  const settingsDefaultAgent = asNonEmptyString(settings?.defaultAgent);
  // The project's default agent wins over the global one. v1 stored the agent's
  // display name; v2 agents are addressed by id (`build` vs `Build`), so a
  // setting saved before the upgrade still resolves.
  const findAgentBySetting = (wantedName) => {
    const wanted = wantedName.toLowerCase();
    return agents.find((agent) => agent?.id === wantedName)
      || agents.find((agent) => typeof agent?.name === 'string' && agent.name.toLowerCase() === wanted)
      || agents.find((agent) => typeof agent?.id === 'string' && agent.id.toLowerCase() === wanted)
      || null;
  };
  if (projectDefaultAgent) resolvedAgent = findAgentBySetting(projectDefaultAgent);
  if (!resolvedAgent && settingsDefaultAgent) resolvedAgent = findAgentBySetting(settingsDefaultAgent);
  if (!resolvedAgent && opencodeDefaultAgent) {
    const candidate = agents.find((agent) => agent?.id === opencodeDefaultAgent) || null;
    if (candidate && isPrimaryAgentMode(candidate.mode) && candidate.hidden !== true) {
      resolvedAgent = candidate;
    }
  }
  if (!resolvedAgent) {
    resolvedAgent = primaryAgents.find((agent) => agent?.id === 'build') || primaryAgents[0] || agents[0] || null;
  }

  let model = null;
  let variant;
  // Settings and project defaults store `provider/model` with the variant in
  // its own field, so these two stay a plain split; the OpenCode config model
  // can carry its variant and is parsed with the canonical parser.
  const projectDefaultModel = splitModel(projectDefaults?.defaultModel);
  const settingsDefaultModel = splitModel(settings?.defaultModel);
  // A saved choice is honoured even when the catalog has not listed it yet: a
  // discovery gap must not silently move the user onto another model.
  if (projectDefaultModel) {
    model = projectDefaultModel;
    variant = resolveVariant(models, model.providerID, model.modelID, projectDefaults?.defaultVariant);
  }
  if (!model && settingsDefaultModel) {
    model = settingsDefaultModel;
    variant = resolveVariant(models, model.providerID, model.modelID, settings?.defaultVariant);
  }

  // An agent's model is a v2 `ModelRef`: `id` is the model id, not a composite.
  const agentModel = resolvedAgent?.model;
  if (!model && asNonEmptyString(agentModel?.providerID) && asNonEmptyString(agentModel?.id)) {
    model = { providerID: agentModel.providerID, modelID: agentModel.id };
    variant = resolveVariant(models, model.providerID, model.modelID, agentModel.variant);
  }

  if (!model && opencodeDefaultModel) {
    model = { providerID: opencodeDefaultModel.providerID, modelID: opencodeDefaultModel.modelID };
    variant = resolveVariant(models, model.providerID, model.modelID, opencodeDefaultModel.variant);
  }

  // The model last picked in a chat composer. Like a saved default it is kept
  // through catalog gaps; a model hidden since, or Auto on a server without
  // routing, is skipped.
  const hiddenModels = asList(settings?.hiddenModels);
  const lastSelectedModel = splitModel(settings?.lastSelectedModel);
  if (!model
    && lastSelectedModel
    && !isModelHidden(hiddenModels, lastSelectedModel.providerID, lastSelectedModel.modelID)
    && (autoAvailable || !isAutoModel(lastSelectedModel))) {
    model = lastSelectedModel;
  }

  // No model is synthesized when the Host catalog has not supplied one.
  // The caller can admit a session only with a captured, explicit selection.
  if (!model) model = null;

  return {
    agent: resolvedAgent?.id,
    model,
    variant,
  };
};


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


// createWorktree returns while the worktree is still being populated in the
// background (git reset --hard after a --no-checkout add). Dispatching a
// prompt into a half-populated directory makes opencode's run die with
// UnknownError (agent and config files are not there yet), so wait until the
// bootstrap reaches git-ready (population done) or fails before creating the
// session and dispatching.
const WORKTREE_BOOTSTRAP_TIMEOUT_MS = 60_000;
const WORKTREE_BOOTSTRAP_POLL_MS = 150;

/**
 * A worktree from a pull or merge request: its number, and the folder and
 * branch names when the caller chose them. The head, the fork and its remote
 * come from the provider; a start ref or upstream would contradict them.
 */
const resolvePullRequestInput = (payload) => {
  if (payload?.pullRequest === undefined) return null;
  if (!Number.isSafeInteger(payload.pullRequest) || payload.pullRequest < 1) {
    throw new OpenChamberControlError('pullRequest must be a pull or merge request number, such as 42', 400);
  }
  if (payload.worktree?.startRef !== undefined || payload.setUpstream !== undefined) {
    throw new OpenChamberControlError('pullRequest checks out the pull request\'s own branch; do not combine it with startRef or setUpstream', 400);
  }
  const input = { number: payload.pullRequest };
  const name = asNonEmptyString(payload.worktree?.name);
  if (name) input.name = name;
  const branchName = asNonEmptyString(payload.worktree?.branchName);
  if (branchName) input.branchName = branchName;
  return input;
};

const resolveWorktreeInput = (payload) => {
  if (!payload?.worktree || typeof payload.worktree !== 'object') return null;
  const name = asNonEmptyString(payload.worktree.name);
  if (!name) return null;
  const branchName = asNonEmptyString(payload.worktree.branchName);
  const startRef = asNonEmptyString(payload.worktree.startRef);
  return {
    mode: 'new',
    name,
    ...(branchName ? { branchName } : {}),
    ...(startRef ? { startRef } : {}),
    ...(typeof payload.setUpstream === 'boolean' ? { setUpstream: payload.setUpstream } : {}),
  };
};
const createCanonicalSessionService = (dependencies) => {
  const { service, resolveWorkspaceScope, resolveSessionScope, registerSessionScope, resolveAttachments, publishSessionEvent, archiveStore, sessionMetadataStore, persistSessionMetadata, broadcastGlobalUiEvent } = dependencies;
  if (!service || typeof service.request !== 'function') throw new Error('session routes require the Agent service');
  if (typeof resolveWorkspaceScope !== 'function' || typeof resolveSessionScope !== 'function') throw new Error('session routes require Host scope resolvers');
  if (typeof registerSessionScope !== 'function') throw new Error('session routes require registerSessionScope');
  if (typeof resolveAttachments !== 'function') throw new Error('session routes require resolveAttachments');
  const request = async (pathname, init = {}) => {
    const response = await service.request(pathname, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) { const error = new OpenChamberControlError(body?.detail || body?.error || 'Agent service request failed', response.status); error.code = body?.code; throw error; }
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
    const patch = { directory: workspace.cwd, projectID: projectId, ...(requestedMetadata ? { openchamber: requestedMetadata } : {}) };
    await metadata.set(session.sessionId, patch, workspace.cwd);
    const stored = await sessionMetadataStore.getState(session.sessionId);
    const result = SessionCreateAckSchema.parse({ session: SessionSchema.parse({ ...session, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: '0' }) });
    emit({ type: 'openchamber:session-created', properties: { sessionId: session.sessionId, projectId, workspaceId } });
    return result;
  };
  const send = async (sessionId, payload = {}) => { const scope = await scopeFor(sessionId); const requestBody = PromptRequestSchema.parse(payload); const attachments = await resolveAttachments(scope, requestBody.input.attachments); const runId = randomUUID(); const response = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'prompt', runId, request: requestBody, attachments }) }); const run = RunSchema.parse(response?.run); return { run }; };
  const fork = async (sessionId, payload = {}) => { const source = await scopeFor(sessionId); const entryId = asNonEmptyString(payload.entryId || payload.messageId); const mode = payload.mode === undefined ? (entryId ? 'selected' : 'full') : payload.mode; if (mode !== 'selected' && mode !== 'full') throw new OpenChamberControlError('Fork mode must be selected or full', 400); if (mode === 'selected' && !entryId) throw new OpenChamberControlError('A native entry identity is required for a selected fork', 400); const body = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/fork`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceSessionId: sessionId, ...(mode === 'selected' ? { entryId } : {}), mode }) }); const ack = body?.session ? body : { session: body }; const child = RuntimeSessionSchema.parse(ack.session); if (child.projectId !== source.projectId || child.workspaceId !== source.workspaceId || child.rootSessionId !== source.rootSessionId) throw new OpenChamberControlError('Fork acknowledgement is outside the source scope', 502); if (!await registerSessionScope(child)) throw new OpenChamberControlError('Forked session scope registration failed', 500); return { session: child, sourceSessionId: sessionId, ...(entryId ? { entryId } : {}), mode }; };
  const open = async (id) => { const scope = await scopeFor(id); const snapshot = SessionSnapshotSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/snapshot`)); if (snapshot.session.sessionId !== id || snapshot.session.projectId !== scope.projectId || snapshot.session.workspaceId !== scope.workspaceId) throw new OpenChamberControlError('Session snapshot is outside the authorized scope', 502); return snapshot; };
  const history = async (id, query = '') => { const scope = await scopeFor(id); const page = HistoryPageSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/history${query ? `?${query}` : ''}`)); if (page.sessionId !== id || page.turns.some(turn => turn.projectId !== undefined && turn.projectId !== scope.projectId) || page.messages.some(message => message.projectId !== undefined && message.projectId !== scope.projectId)) throw new OpenChamberControlError('Session history is outside the authorized scope', 502); return page; };
  const list = async (workspaceId) => { if (typeof workspaceId !== 'string' || workspaceId.length === 0) throw new OpenChamberControlError('Workspace identity is required', 400); const workspace = await resolveWorkspaceScope(workspaceId); if (!workspace) throw new OpenChamberControlError('Workspace was not found', 404); const raw = z.strictObject({ items: z.array(RuntimeSessionSchema), errors: z.array(z.strictObject({ sessionId: z.string().min(1), code: ProblemCodeSchema })) }).parse(await request(`/api/agent/v1/sessions?workspaceId=${encodeURIComponent(workspaceId)}`)); if (raw.errors.length) throw new OpenChamberControlError('Some sessions could not be listed', 503); const items = await Promise.all(raw.items.map(async (session) => { if (session.projectId !== workspace.projectId || session.workspaceId !== workspaceId) throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502); const metadataState = await sessionMetadataStore.getState(session.sessionId); const archiveState = await archiveStore.getState(session.sessionId); return SessionSchema.parse({ ...session, metadata: metadataState?.metadata ?? null, metadataRevision: metadataState?.revision ?? '0', ...(archiveState?.archivedAt === undefined ? {} : { archivedAt: archiveState.archivedAt }), archiveRevision: archiveState?.revision ?? '0' }); })); return SessionsPageSchema.parse({ items, nextCursor: null }); };
  const archive = async (payload = {}) => { const parsed = parseArchiveRequest(payload); if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400); await Promise.all(parsed.ids.map((id) => scopeFor(id))); return archiveStore.archive(parsed.ids, parsed.archivedAt); };
  const unarchive = async (payload = {}) => { const parsed = parseIdBatch(payload); if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400); await Promise.all(parsed.ids.map((id) => scopeFor(id))); return archiveStore.unarchive(parsed.ids); };
  const getMetadata = async (id) => { await scopeFor(id); return await sessionMetadataStore.getState(id) || { metadata: null, revision: '0' }; };
  const setMetadata = async (id, payload = {}) => { const scope = await scopeFor(id); return metadata.set(id, payload.patch || {}, payload.directory || scope.cwd); };
  const remove = async (id) => { await scopeFor(id); const ack = SessionDeleteAckSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })); if (ack.sessionId !== id) throw new OpenChamberControlError('Session deletion acknowledgement identified another session', 502); return ack; };
  return { create, send, fork, delete: remove, open, history, list, control, resolveDirectory: async (payload = {}) => { const scope = await resolveWorkspaceScope(payload.workspaceId); if (!scope) throw new OpenChamberControlError('Workspace was not found', 404); return scope.cwd; }, archive, unarchive, getMetadata, setMetadata, sessionMetadataStore, archiveStore };
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

  app.post('/api/openchamber/sessions/:sessionId/metadata', express.json({ limit: '1mb' }), async (req, res) => {
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
  router.post('/:sessionId/fork', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.fork(req.params.sessionId, req.body || {}), 'Failed to fork session'));
  router.post('/:sessionId/control', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.control(req.params.sessionId, req.body || {}), 'Failed to control session'));
  router.delete('/:sessionId', (req, res) => call(res, () => service.delete(req.params.sessionId), 'Failed to delete session'));
  router.get('/:sessionId/metadata', (req, res) => call(res, () => service.getMetadata(req.params.sessionId), 'Failed to read session metadata'));
  router.post('/:sessionId/metadata', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.setMetadata(req.params.sessionId, req.body || {}), 'Failed to write session metadata'));
};
