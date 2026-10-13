import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { OpenChamberControlError, asControlError } from '../openchamber-control/error.js';

const asList = (value) => (Array.isArray(value) ? value : []);

const MetadataPatchRequestSchema = z.object({ patch: z.record(z.string(), z.unknown()), directory: z.string().optional() });
const MetadataImportRequestSchema = z.object({
  intent: z.literal('operational-metadata-conversion'), consent: z.literal(true),
  source: z.string().trim().min(1).max(200),
  sessions: z.array(z.object({ id: z.string().trim().min(1), directory: z.string().optional() })).min(1).max(200),
});
const SelectedProjectionIdentitySchema = z.looseObject({
  id: z.string().min(1),
  location: z.looseObject({ directory: z.string().trim().min(1) }).optional(),
  directory: z.string().trim().min(1).optional(),
  metadata: z.looseObject({ directory: z.string().trim().min(1).optional() }).optional(),
}).refine((projection) => projection.location !== undefined || projection.directory !== undefined);

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

const resolveRequestedModel = (payload) => {
  const model = splitModel(payload?.model);
  if (model) return model;

  const providerID = asNonEmptyString(payload?.providerID);
  const modelID = asNonEmptyString(payload?.modelID);
  return providerID && modelID ? { providerID, modelID } : null;
};

const FALLBACK_PROVIDER_ID = 'opencode';
const FALLBACK_MODEL_ID = 'big-pickle';
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

// OpenCode 2.x serves one flat model catalogue instead of models nested under
// providers: every entry already names its provider.
const hasCatalogModel = (models, providerID, modelID) => models.some(
  (model) => model?.providerID === providerID && model?.modelID === modelID,
);

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

// The pick when nothing is configured or remembered: Big Pickle, else the first
// model. A model the user hid in the picker is skipped; configured defaults never
// come through here, so they stay honoured even when hidden. With every model
// hidden the session still needs one, so the unfiltered pick stands.
const resolveFallbackModel = (models, hiddenModels) => {
  const isVisible = (providerID, modelID) => !isModelHidden(hiddenModels, providerID, modelID);
  const candidates = models.filter(
    (entry) => asNonEmptyString(entry?.providerID) && asNonEmptyString(entry?.modelID),
  );
  const bigPickle = findCatalogModel(candidates, FALLBACK_PROVIDER_ID, FALLBACK_MODEL_ID);
  const pick = (bigPickle && isVisible(bigPickle.providerID, bigPickle.modelID) ? bigPickle : null)
    || candidates.find((entry) => isVisible(entry.providerID, entry.modelID))
    || bigPickle
    || candidates[0];
  return pick ? { providerID: pick.providerID, modelID: pick.modelID } : null;
};

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

/** `x-opencode-directory` is how v2 scopes a request; there is no query param. */
/**
 * Everything the default model/agent resolution needs, from one directory-scoped
 * client. A failed lookup answers empty on purpose: an empty catalogue means
 * "unknown", and callers must never turn that into a rejection.
 */
const fetchSelectionInputs = async ({ client, readSettingsFromDiskMigrated }) => {
  const settings = await readSettingsFromDiskMigrated();
  const [models, agents, configEntries] = await Promise.all([
    client.model.list().then((response) => asList(response?.data)).catch(() => []),
    // v2 agents carry `id` (`build`, what prompts and sessions refer to) and a
    // display `name` (`Build`); every lookup here is by id.
    client.agent.list().then((response) => asList(response?.data)).catch(() => []),
    client.config.get().then((response) => asList(response)).catch(() => []),
  ]);

  // Config entries arrive lowest priority first, so the last definition wins.
  let opencodeDefaultAgent = null;
  let opencodeDefaultModel = null;
  for (const entry of configEntries) {
    const info = entry?.info;
    if (!info) continue;
    const agent = asNonEmptyString(info.default_agent);
    if (agent) opencodeDefaultAgent = agent;
    // Config `model` is the v2 selection spelling: "provider/model#variant" or
    // the expanded object form. The canonical parser folds both.
    const model = parseModelSelection(info.model);
    if (model) opencodeDefaultModel = model;
  }

  return { settings, models, agents, opencodeDefaultAgent, opencodeDefaultModel };
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

  if (!model) model = resolveFallbackModel(models, hiddenModels);

  return {
    agent: resolvedAgent?.id,
    model,
    variant,
  };
};

/**
 * v2 selects model and agent per session, not per prompt: the choice is
 * switched once and then persists, so every dispatch sets it explicitly rather
 * than passing it alongside the prompt.
 */
const applySessionSelection = async ({ client, sessionID, model, agent, variant }) => {
  if (model) {
    await client.session.switchModel({
      sessionID,
      model: { id: model.modelID, providerID: model.providerID, ...(variant ? { variant } : {}) },
    });
  }
  if (agent) await client.session.switchAgent({ sessionID, agent });
};

const createSession = async ({ client, directory, title }) => {
  const session = await client.session.create({
    location: { directory },
    ...(title ? { title } : {}),
  });
  const sessionID = asNonEmptyString(session?.id);
  if (!sessionID) throw new Error('failed to create session');
  return sessionID;
};

const forkSession = async ({ client, sessionID, messageID }) => {
  const session = await client.session.fork({
    sessionID,
    // OpenCode 2.0.8 replaced the SessionForkBoundary object with an optional
    // `before` message id. Omitting it carries the whole session over, which is
    // what the old `{ type: 'through' }` boundary meant.
    ...(messageID ? { before: messageID } : {}),
  });
  if (!asNonEmptyString(session?.id)) throw new Error('failed to fork session');
  return session;
};

const listMessages = async ({ client, sessionID, limit }) => {
  const response = await client.message.list({ sessionID, limit, order: 'desc' });
  return asList(response?.data);
};

const latestCompletedAssistantMessageID = async ({ client, sessionID }) => {
  let messages;
  try {
    messages = await listMessages({ client, sessionID, limit: 100 });
  } catch {
    return null;
  }
  let latest = null;
  for (const message of messages) {
    if (message?.type !== 'assistant' || !Number.isFinite(message?.time?.completed)) continue;
    if (!latest || (message.time.created || 0) >= (latest.time?.created || 0)) latest = message;
  }
  return asNonEmptyString(latest?.id);
};

/**
 * The id of the newest `idle` record OpenCode appended to the session (it
 * marks the end of a run), null when the session has none, or undefined when
 * the history could not be read. A later delivery compares record ids, never
 * clock times, so a remote OpenCode with a skewed clock still matches.
 */
const latestIdleRecordID = async ({ client, sessionID }) => {
  let messages;
  try {
    messages = await listMessages({ client, sessionID, limit: 100 });
  } catch {
    return undefined;
  }
  let latest = null;
  for (const message of messages) {
    if (message?.type !== 'idle' || !asNonEmptyString(message?.id)) continue;
    if (!latest || (message.time?.created || 0) >= (latest.time?.created || 0)) latest = message;
  }
  return latest ? latest.id : null;
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

const resolveRequestedDirectory = async ({ payload, readSettingsFromDiskMigrated, sanitizeProjects, validateDirectoryPath }) => {
  const projectID = asNonEmptyString(payload?.projectId) || asNonEmptyString(payload?.projectID);
  if (projectID) {
    const settings = await readSettingsFromDiskMigrated();
    const projects = sanitizeProjects(settings?.projects || []);
    const project = projects.find((entry) => entry.id === projectID) || null;
    if (!project?.path) {
      return { ok: false, status: 404, error: 'Project not found' };
    }
    const validated = await validateDirectoryPath(project.path);
    return validated.ok
      ? { ok: true, directory: validated.directory, projectId: projectID }
      : { ok: false, status: 400, error: validated.error || 'Invalid project directory' };
  }

  const directory = asNonEmptyString(payload?.directory);
  const validated = await validateDirectoryPath(directory);
  if (!validated.ok) return { ok: false, status: 400, error: validated.error || 'Invalid directory' };
  const settings = await readSettingsFromDiskMigrated();
  const projects = sanitizeProjects(settings?.projects || []);
  let project = projects.find((entry) => entry.path === validated.directory);
  if (!project && projects.length > 0) {
    const { root } = await resolvePrimaryWorktreeRoot(validated.directory);
    project = projects.find((entry) => entry.path === root);
  }
  return { ok: true, directory: validated.directory, ...(project ? { projectId: project.id } : {}) };
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
  const { service, resolveWorkspaceScope, resolveSessionScope, registerSessionScope, publishSessionEvent, archiveStore, sessionMetadataStore, persistSessionMetadata, broadcastGlobalUiEvent } = dependencies;
  if (!service || typeof service.request !== 'function') throw new Error('session routes require the Agent service');
  if (typeof resolveWorkspaceScope !== 'function' || typeof resolveSessionScope !== 'function') throw new Error('session routes require Host scope resolvers');
  if (typeof registerSessionScope !== 'function') throw new Error('session routes require registerSessionScope');
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
    const projectId = asNonEmptyString(payload.projectId), workspaceId = asNonEmptyString(payload.workspaceId);
    if (!projectId || !workspaceId) throw new OpenChamberControlError('projectId and workspaceId are required', 400);
    const workspace = await resolveWorkspaceScope(workspaceId);
    if (!workspace || workspace.projectId !== projectId) throw new OpenChamberControlError('Workspace does not belong to project', 404);
    const options = payload.options && typeof payload.options === 'object' ? payload.options : {};
    const body = await request('/internal/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId, workspaceId, options }) });
    const session = body?.session || body, sessionId = asNonEmptyString(session?.sessionId || session?.id);
    if (!sessionId) throw new OpenChamberControlError('Agent service returned no session', 502);
    const rootSessionId = asNonEmptyString(session.rootSessionId) || sessionId;
    if (!await registerSessionScope({ sessionId, rootSessionId, workspaceId, agentDirectoryId: workspace.agentDirectoryId })) throw new OpenChamberControlError('Session scope registration failed', 500);
    const patch = { directory: workspace.cwd, projectID: projectId }; if (asNonEmptyString(options.title)) patch.title = options.title;
    await metadata.set(sessionId, patch, workspace.cwd); emit({ type: 'openchamber:session-created', properties: { sessionId, projectId, workspaceId } });
    return { session: { ...session, id: sessionId, sessionId, projectId, workspaceId } };
  };
  const send = async (sessionId, payload = {}) => { const scope = await scopeFor(sessionId); const body = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'prompt', scope: { projectId: scope.projectId, workspaceId: scope.workspaceId }, request: payload }) }); return body?.run ? body : { run: body }; };
  const fork = async (sessionId, payload = {}) => { const source = await scopeFor(sessionId); if (payload.before || payload.messageId || payload.beforeMessageId) throw new OpenChamberControlError('Forking before a message is not supported by the native session manager', 400); const childSessionId = randomUUID(); const rootSessionId = source.rootSessionId || sessionId; const body = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/fork`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceSessionId: sessionId, childSessionId, rootSessionId, workspaceId: source.workspaceId, agentDirectoryId: source.agentDirectoryId }) }); const session = body?.session || body, returnedId = asNonEmptyString(session?.sessionId || session?.id) || childSessionId; await registerSessionScope({ sessionId: returnedId, rootSessionId: asNonEmptyString(session?.rootSessionId) || rootSessionId, workspaceId: source.workspaceId, agentDirectoryId: source.agentDirectoryId }); return { ...session, id: returnedId, sessionId: returnedId, sourceSessionId: sessionId }; };
  const control = async (sessionId, operation) => { await scopeFor(sessionId); return request(`/internal/sessions/${encodeURIComponent(sessionId)}/operations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(operation) }); };
  return { create, send, fork, delete: async (id) => control(id, { type: 'delete' }), open: async (id) => request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/snapshot`), history: async (id, query = '') => { await scopeFor(id); return request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/history${query ? `?${query}` : ''}`); }, list: async (workspaceId) => request(`/api/agent/v1/sessions${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`), control, resolveDirectory: async (payload = {}) => { const scope = await resolveWorkspaceScope(payload.workspaceId); if (!scope) throw new OpenChamberControlError('Workspace was not found', 404); return scope.cwd; }, archive: async (payload = {}) => archiveStore.archive(payload.ids || [], payload.archivedAt), unarchive: async (payload = {}) => archiveStore.unarchive(payload.ids || []), getMetadata: async (id) => await sessionMetadataStore.getState(id) || { metadata: null, revision: '0' }, setMetadata: async (id, payload = {}) => metadata.set(id, payload.patch || {}, payload.directory || ''), sessionMetadataStore, archiveStore };
};



export const createOpenChamberSessionService = (dependencies) => createCanonicalSessionService(dependencies);
const sendServiceError = (res, error, fallback) => {
  const controlError = asControlError(error, fallback);
  const body = {
    error: controlError.message,
    ...(controlError.partial === true ? {
      partial: true,
      partialAction: controlError.partialAction,
      sessionId: controlError.sessionId,
      directory: controlError.directory,
    } : {}),
  };
  if (error?.code) body.code = error.code;
  return res.status(controlError.statusCode).json(body);
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
