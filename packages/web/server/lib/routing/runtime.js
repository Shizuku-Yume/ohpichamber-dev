/**
 * Owns Jev routing at runtime: which classification provider answers, whether
 * Auto is ready, which model and agent a send that selected `openchamber/auto`
 * runs on, and the safety net consulted in a `safety` permission session.
 * Failure paths fall back to the user's own behaviour for routing (the
 * fallback model) and to the user's own decision for the safety net: a request
 * Jev could not check waits for the user, and the UI is told why.
 *
 * OpenCode 2.x holds the model and the agent on the session, switched by their
 * own calls, and a prompt body carries only the user's text. So Auto is a
 * per-session state here: the sentinel arrives on `POST /session/:id/model`
 * and is swallowed, and every prompt in that session is routed until a real
 * model is selected.
 */
import { z } from 'zod';
import { AUTO_MODEL_REF, BUILTIN_CATEGORIES, ZEN_JEV_PROMOTION_ACTIVE, isAutoModel } from './defaults.js';
import { createRoutingStore, parseEffectiveConfig } from './store.js';
import { buildPermissionRequest, buildProbeRequest, buildRoutingRequest, createJevClient, decidePermission, decideRouting, isProbeAnswer } from './jev.js';
import {
  CLASSIFIER_SOURCES,
  classifierEndpoint,
  legacyClassifier,
  parseCustomEndpointUrl,
  readPinnedCustomEndpoint,
  resolveClassifier,
} from './classifier.js';
import { loadRoutingHistory } from './history.js';
import { PROMPT_CACHE_TTL_MS, cacheHoldCategory, warmWindowMs } from './cache.js';
import { ENTERPRISE_MODE_ERROR, isEnterpriseMode } from '../enterprise-mode.js';

const HISTORY_TIMEOUT_MS = 2500;
/** A held permission is remembered so reconnect reconciliation does not re-ask Jev. */
const PERMISSION_DECISION_TTL_MS = 15 * 60 * 1000;

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

// v2's command body (`session.command` in the protocol) names the command in
// `name` and carries its arguments in `text`; a prompt body has no `name`.
const commandBodySchema = z.object({ name: z.string().trim().min(1), text: z.string().nullish() });
// v2 sends one user turn as flat text; the context the composer attached went
// ahead of it as synthetic messages, which are never the request being routed.
const promptBodySchema = z.object({ text: z.string().nullish() });

/** The user's words for this send: the prompt text, or the slash command. */
export const requestTextOf = (body) => {
  const command = commandBodySchema.safeParse(body);
  if (command.success) {
    const args = command.data.text?.trim();
    return `/${command.data.name}${args ? ` ${args}` : ''}`;
  }
  const prompt = promptBodySchema.safeParse(body);
  return (prompt.success ? prompt.data.text ?? '' : '').trim();
};

const agentBodySchema = z.object({ agent: z.string().trim().min(1) });

// Canonical workspace catalogs expose provider/model identities and variants.
const catalogResponseSchema = z.object({
  workspaceId: z.string().min(1),
  revision: z.string().min(1),
  models: z.array(z.object({
    modelId: z.string().min(1), provider: z.string().min(1), variants: z.array(z.object({ variant: z.string().min(1) })),
  })),
});

const customEndpointInputSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  model: z.string().trim().min(1).max(200),
  key: z.string().trim().max(4000).nullable().optional(),
});

/** OpenChamber stores a model as `{ providerID, modelID }`; v2 wants a `Model.Ref`. */
const toModelRef = (model, variant) => {
  const ref = { providerID: model.providerID, id: model.modelID };
  if (variant) ref.variant = variant;
  return ref;
};


export function createRoutingRuntime({
  dataDir,
  service,
  resolveWorkspaceScope,
  resolveSessionScope,
  broadcastGlobalUiEvent,
  fetchImpl = fetch,
  store = createRoutingStore({ dataDir }),
  jev = createJevClient({ fetchImpl }),
  readProviderKeys = async () => ({}),
  zenPromotionActive = ZEN_JEV_PROMOTION_ACTIVE,
  enterpriseMode = isEnterpriseMode,
  readPinnedEndpoint = readPinnedCustomEndpoint,
  listCatalogModels = null,
  readSessionHistory = null,
  readConfigEntries = null,
  now = Date.now,
}) {
  if (!service || typeof service.request !== 'function') throw new Error('routing requires the Agent service');
  if (typeof resolveWorkspaceScope !== 'function' || typeof resolveSessionScope !== 'function') throw new Error('routing requires Host scope resolvers');
  const permissionDecisions = new Map();
  // Sessions the user put on Auto. The sentinel never reaches OpenCode, so
  // nothing upstream remembers the choice for us.
  // TODO(v2): this is process memory. A server restart drops the mark and the
  // session silently runs on whatever model it was last switched to while the
  // composer still shows Auto. Either persist it next to `routing.json` or have
  // the client resend the sentinel with every send.
  const autoSessions = new Map();
  const AUTO_SESSION_LIMIT = 1000;

  const broadcast = (type, properties) => {
    try {
      broadcastGlobalUiEvent?.({ type, properties });
    } catch (error) {
      console.warn(`[routing] failed to broadcast ${type}:`, errorMessage(error));
    }
  };

  const enabledCategories = (config) => config.categories.filter((category) => category.enabled);

  /** Which classification provider answers now, and where its requests go (null endpoint: no Jev). */
  const resolveAccess = async () => {
    const [typesafeKey, stored, savedEndpoint] = await Promise.all([
      store.readToken(),
      store.readClassifierSource(),
      store.readCustomEndpoint(),
    ]);
    // An endpoint the administrator pinned replaces the one saved in Settings.
    const pinned = readPinnedEndpoint();
    const customEndpoint = pinned ?? savedEndpoint;
    const keys = { typesafeKey, customEndpoint, ...(await readProviderKeys()) };
    // Enterprise mode overrides whatever was picked; the pick itself is kept.
    // The pinned endpoint is the administrator's own, so there it is the
    // default and Off the only other choice.
    const selected = !enterpriseMode() ? stored : pinned && stored !== 'off' ? 'custom' : 'off';
    const classifier = resolveClassifier({ selected, ...keys, zenPromotionActive });
    const endpoint = classifier.effective ? classifierEndpoint(classifier.effective, keys) : null;
    return { classifier, endpoint, tokenPresent: Boolean(typesafeKey), customEndpoint, pinned: pinned !== null };
  };

  // What Settings shows of the custom endpoint: never the key itself.
  const describeCustomEndpoint = (endpoint, pinned) => (endpoint
    ? { url: endpoint.url, model: endpoint.model, keyPresent: Boolean(endpoint.key), pinned }
    : null);

  const pinnedEndpointError = () => Object.assign(
    new Error('The custom endpoint is set by your administrator and cannot be changed here'),
    { status: 409 },
  );

  /** What the client needs to decide whether to offer Auto and the safety net, and what Settings shows. */
  const describe = async () => {
    const [config, access] = await Promise.all([store.readConfig(), resolveAccess()]);
    const jevAvailable = access.endpoint !== null;
    const autoReady = jevAvailable && config.enabled && Boolean(config.fallback) && enabledCategories(config).length >= 2;
    // Built-in text travels with the config so "Reset" in Settings restores the shipped wording.
    // `jevSource` is the two-value field clients from before the classifier
    // pick parse, `classifier` what v2.0.2 clients parse, and `classification`
    // the full picture.
    return {
      available: true,
      autoReady,
      jevAvailable,
      tokenPresent: access.tokenPresent,
      customEndpoint: describeCustomEndpoint(access.customEndpoint, access.pinned),
      enterpriseMode: enterpriseMode(),
      jevSource: access.classifier.effective === 'typesafe' ? 'typesafe' : 'zen-free',
      classifier: legacyClassifier(access.classifier),
      classification: access.classifier,
      config,
      builtins: BUILTIN_CATEGORIES,
    };
  };

  const publishUpdated = async () => {
    const state = await describe();
    broadcast('openchamber:routing.updated', {
      available: state.available,
      autoReady: state.autoReady,
      jevAvailable: state.jevAvailable,
      tokenPresent: state.tokenPresent,
      jevSource: state.jevSource,
    });
    return state;
  };

  const requestAgent = async (path, init = {}) => {
    const response = await service.request(path, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(body?.detail || body?.error || 'Agent service request failed'), { status: response.status });
    return body;
  };
  const scopeForSession = async (sessionId) => {
    const scope = await resolveSessionScope(sessionId);
    if (!scope) throw Object.assign(new Error('Session scope was not found'), { status: 404, code: 'SESSION_NOT_FOUND' });
    return scope;
  };
  const readHistory = readSessionHistory ?? (async ({ sessionId }) => {
    await scopeForSession(sessionId);
    return loadRoutingHistory({
      signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
      readPage: async ({ limit, cursor }) => requestAgent(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/history?${new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) })}`),
    });
  });
  const readConfig = readConfigEntries;

  /**
   * "Try to preserve cache usage": the category to stay on instead of a lower
   * one while the model that wrote the last answer likely still holds a warm
   * prompt cache, or null to switch as Jev said (`cache.js`). OpenCode's
   * warming config is read only once the plain cache lifetime has passed.
   */
  const cacheHold = async ({ config, chosen, composerAgent, lastAnswer, directory }) => {
    if (!config.preserveCache || !lastAnswer) return null;
    const held = cacheHoldCategory({
      categories: enabledCategories(config), fallback: config.fallback, composerAgent, chosen, current: lastAnswer,
    });
    if (!held) return null;
    const idle = now() - lastAnswer.completed;
    if (idle < PROMPT_CACHE_TTL_MS) return held;
    if (!readConfig) return null;
    try {
      return idle < warmWindowMs(await readConfig(directory)) ? held : null;
    } catch (error) {
      console.warn('[routing] cache-warming configuration unavailable; treating the prompt cache as cold:', errorMessage(error));
      return null;
    }
  };

  // A category without a model of its own means "the fallback pair"; a variant
  // only travels with the model it was chosen for.
  const chooseSelection = (config, choice, composerAgent) => {
    const own = Boolean(choice?.model);
    const model = own ? choice.model : config.fallback.model;
    const variant = own ? choice.variant : config.fallback.variant;
    return {
      model: toModelRef(model, variant),
      // A category agent replaces the composer's; an empty one keeps it.
      agent: choice?.agent || composerAgent || null,
      decision: { providerID: model.providerID, modelID: model.modelID, variant: variant ?? null, agent: choice?.agent ?? null },
    };
  };

  const readCatalog = listCatalogModels ?? (async (workspaceId) => {
    const scope = await resolveWorkspaceScope(workspaceId);
    if (!scope || scope.workspaceId !== workspaceId) throw Object.assign(new Error('Workspace scope was not found'), { status: 404, code: 'SESSION_NOT_FOUND' });
    return catalogResponseSchema.parse(await requestAgent(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/models`)).models;
  });

  /**
   * Drops a variant the model does not list, so the reply runs on the model's
   * default thinking instead of OpenCode refusing it. Routing settings from
   * before #4133 saved list positions ("0", "1", "2") as variants. A catalog
   * that cannot be read, or does not know the model yet, keeps the variant.
   */
  const withKnownVariant = async (selection, workspaceId) => {
    const variant = selection.model.variant;
    if (!variant) return selection;
    let models;
    try { models = await readCatalog(workspaceId); }
    catch (error) {
      console.warn('[routing] model catalog unavailable, keeping the saved variant:', errorMessage(error));
      return selection;
    }
    const { providerID, id } = selection.model;
    const entry = models.find((model) => model.provider === providerID && model.modelId === id);
    if (!entry || entry.variants.some((known) => known.variant === variant)) return selection;
    console.warn(`[routing] ${providerID}/${id} has no "${variant}" thinking level; using its default`);
    return { ...selection, model: { providerID, id }, decision: { ...selection.decision, variant: null } };
  };

  /**
   * Resolves one send that named the Auto sentinel. Returns the model and
   * agent the send must use, or null when a real model was selected.
   *
   * v2 carries neither model nor agent in a prompt body — they are session
   * state, switched by their own calls — so the caller applies the selection
   * (`applySessionSelection`, or its own switch calls) instead of the runtime
   * rewriting a body in place the way v1 allowed.
   *
   * Throws only when Auto cannot be honoured at all (no fallback configured):
   * the sentinel must never reach OpenCode.
   */
  const resolveAutoSelection = async ({ sessionId, directory, workspaceId: requestedWorkspaceId, model, agent, requestText }) => {
    if (!isAutoModel(model)) return null;
    const sessionScope = await scopeForSession(sessionId);
    const workspaceId = requestedWorkspaceId ?? sessionScope.workspaceId;
    if (sessionScope.workspaceId !== workspaceId) throw Object.assign(new Error('Session workspace does not match routing workspace'), { status: 403, code: 'UNAUTHORIZED' });
    const state = await describe();
    const config = state.config;
    if (!config?.fallback) {
      throw Object.assign(new Error('Auto routing is selected but no fallback model is configured'), { status: 400 });
    }
    const decision = { sessionId, at: now(), category: null, confidence: 0, reason: 'not-ready', ms: 0 };
    let selection;
    if (state.autoReady) {
      let history = [];
      let lastAnswer = null;
      try {
        ({ history, lastAnswer } = await readHistory({ sessionId, directory }));
      } catch (error) {
        console.warn('[routing] history unavailable, routing on the request alone:', errorMessage(error));
      }
      try {
        const { endpoint } = await resolveAccess();
        if (!endpoint) throw new Error('No classification provider is available');
        const request = (requestText ?? '').trim();
        const { answers, ms } = await jev.ask(buildRoutingRequest({ categories: enabledCategories(config), history, request }), endpoint);
        const result = decideRouting(answers.category, { categories: enabledCategories(config), minConfidence: config.minConfidence });
        decision.category = result.category?.id ?? null;
        decision.confidence = result.confidence;
        decision.reason = result.reason;
        decision.ms = ms;
        const held = await cacheHold({ config, chosen: result.category, composerAgent: agent, lastAnswer, directory });
        if (held) {
          // The send runs as the category the session is already on;
          // `cacheHold.requested` keeps what Jev asked for.
          decision.category = held.id;
          decision.cacheHold = { requested: result.category.id };
        }
        selection = chooseSelection(config, held ?? result.category, agent);
      } catch (error) {
        decision.reason = 'error';
        decision.error = errorMessage(error);
        selection = chooseSelection(config, null, agent);
      }
    } else {
      selection = chooseSelection(config, null, agent);
    }
    selection = await withKnownVariant(selection, workspaceId);
    Object.assign(decision, selection.decision);
    broadcast('openchamber:routing.decision', decision);
    return { model: selection.model, agent: selection.agent, decision };
  };

  /**
   * `POST /session/:id/model` with the sentinel puts the session on Auto;
   * with any real model it takes it off again.
   */
  const noteModelSelection = (sessionId, model, directory) => {
    if (!sessionId) return false;
    if (!isAutoModel(model)) {
      autoSessions.delete(sessionId);
      return false;
    }
    autoSessions.delete(sessionId);
    autoSessions.set(sessionId, { directory: directory ?? null, at: now() });
    while (autoSessions.size > AUTO_SESSION_LIMIT) autoSessions.delete(autoSessions.keys().next().value);
    return true;
  };

  const isAutoSession = (sessionId) => Boolean(sessionId) && autoSessions.has(sessionId);

  /** Switches the session onto a resolved selection, the way a v2 send does. */
  const applySessionSelection = async (sessionId, _directory, selection) => {
    await requestAgent(`/internal/sessions/${encodeURIComponent(sessionId)}/selection`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: selection.model, ...(selection.agent ? { agent: selection.agent } : {}) }) });
  };

  /**
   * One send in a routed session: asks Jev on the request text, switches the
   * session onto the answer, and keeps the body in step with it.
   */
  const routeSend = async ({ sessionId, directory, body }) => {
    const resolved = await resolveAutoSelection({
      sessionId,
      directory,
      model: AUTO_MODEL_REF,
      agent: agentBodySchema.safeParse(body).data?.agent ?? null,
      requestText: requestTextOf(body),
    });
    if (!resolved) return null;
    // v2 prompt and command bodies carry neither model nor agent: switching
    // the session is the whole application of the decision.
    await applySessionSelection(sessionId, directory, resolved);
    return resolved.decision;
  };

  /**
   * Consulted by permission auto-accept in a `safety` session before it
   * replies. `accept` replies; `hold` leaves the request for the user. Only a
   * verdict from Jev accepts: with no classification provider the request
   * waits quietly, the way an `ask` session's would; when Jev fails it waits
   * too, and the UI is told why (`skipped`).
   */
  const evaluatePermission = async (permission, directory) => {
    if (!permission?.id) return { action: 'hold' };
    const cached = permissionDecisions.get(permission.id);
    if (cached && now() - cached.at < PERMISSION_DECISION_TTL_MS) return cached.result;
    const [config, access] = await Promise.all([store.readConfig(), resolveAccess()]);
    if (!access.endpoint) return { action: 'hold', unavailable: true };
    let result;
    try {
      const { answers } = await jev.ask(buildPermissionRequest(permission), access.endpoint);
      const verdict = decidePermission(answers, { threshold: config.safetyNet.threshold });
      result = verdict.hold
        ? { action: 'hold', score: verdict.score, kind: verdict.kind }
        : { action: 'accept', score: verdict.score, kind: verdict.kind };
    } catch (error) {
      // Not remembered: reconnect reconciliation asks Jev again, and may accept.
      const skipped = errorMessage(error);
      broadcast('openchamber:routing.safety-skipped', {
        permissionId: permission.id, sessionId: permission.sessionID, directory: directory ?? null, error: skipped,
      });
      return { action: 'hold', skipped };
    }
    if (result.action === 'hold') {
      broadcast('openchamber:routing.permission-held', {
        permissionId: permission.id, sessionId: permission.sessionID, directory: directory ?? null, score: result.score, kind: result.kind,
      });
    }
    permissionDecisions.set(permission.id, { at: now(), result });
    return result;
  };

  /**
   * Whether the old global safety-net switch was on. Asked once, when the
   * permission policy converts its pre-modes `true` entries: those sessions
   * were auto-accepting behind the safety net, so they become `safety`.
   */
  const legacySafetyNetEnabled = async () => {
    try {
      return (await store.readConfig()).safetyNet.enabled === true;
    } catch {
      return false;
    }
  };

  const forgetPermission = (permissionId) => {
    permissionDecisions.delete(permissionId);
  };

  const updateConfig = async (input) => {
    const config = parseEffectiveConfig(input);
    await store.writeConfig(config);
    return publishUpdated();
  };

  const setToken = async (token) => {
    const parsed = z.string().trim().min(1).max(4000).safeParse(token);
    if (!parsed.success) throw Object.assign(new Error('A Jev API key is required'), { status: 400 });
    if (enterpriseMode()) throw Object.assign(new Error(ENTERPRISE_MODE_ERROR), { status: 403 });
    await store.writeToken(parsed.data);
    // Pasting a key is choosing it.
    await store.writeClassifierSource('typesafe');
    return publishUpdated();
  };

  const clearToken = async () => {
    await store.clearToken();
    return publishUpdated();
  };

  const setClassifierSource = async (source) => {
    const parsed = z.enum(CLASSIFIER_SOURCES).safeParse(source);
    if (!parsed.success) throw Object.assign(new Error(`Unknown classification provider: ${String(source)}`), { status: 400 });
    const allowedInEnterprise = parsed.data === 'off' || (parsed.data === 'custom' && readPinnedEndpoint() !== null);
    if (enterpriseMode() && !allowedInEnterprise) throw Object.assign(new Error(ENTERPRISE_MODE_ERROR), { status: 403 });
    await store.writeClassifierSource(parsed.data);
    return publishUpdated();
  };

  /**
   * Saves the custom System One endpoint and picks it, the way saving a
   * TypeSafe key does. `key`: a string replaces the saved one, null removes
   * it, absent keeps it, so the URL or model can change without retyping it.
   */
  const setCustomEndpoint = async (input) => {
    if (readPinnedEndpoint()) throw pinnedEndpointError();
    if (enterpriseMode()) throw Object.assign(new Error(ENTERPRISE_MODE_ERROR), { status: 403 });
    const parsed = customEndpointInputSchema.safeParse(input);
    if (!parsed.success) throw Object.assign(new Error('A URL and a model are required'), { status: 400 });
    const { model, key } = parsed.data;
    const url = parseCustomEndpointUrl(parsed.data.url);
    // An empty key field is the same as leaving it out.
    const keepKey = key === undefined || key === '';
    const savedKey = keepKey ? (await store.readCustomEndpoint())?.key : key;
    const endpoint = { url, model };
    if (savedKey) endpoint.key = savedKey;
    await store.writeCustomEndpoint(endpoint);
    // Saving is choosing it; removing only the key is not a choice of anything.
    if (key !== null) await store.writeClassifierSource('custom');
    return publishUpdated();
  };

  const clearCustomEndpoint = async () => {
    if (readPinnedEndpoint()) throw pinnedEndpointError();
    await store.clearCustomEndpoint();
    return publishUpdated();
  };

  /**
   * Sends one small Jev request and reports what came back, so Settings can
   * show a broken setup before a feature quietly falls back. Without `draft`
   * it tests the provider answering now; with one it tests the custom endpoint
   * fields as typed, before they are saved (an empty key reuses the saved
   * one). Nothing is stored either way.
   */
  const testClassifier = async (draft) => {
    let source;
    let endpoint;
    if (draft !== undefined) {
      if (readPinnedEndpoint()) throw pinnedEndpointError();
      if (enterpriseMode()) throw Object.assign(new Error(ENTERPRISE_MODE_ERROR), { status: 403 });
      const parsed = customEndpointInputSchema.safeParse(draft);
      if (!parsed.success) throw Object.assign(new Error('A URL and a model are required'), { status: 400 });
      const key = parsed.data.key || (await store.readCustomEndpoint())?.key;
      source = 'custom';
      endpoint = classifierEndpoint('custom', {
        customEndpoint: { url: parseCustomEndpointUrl(parsed.data.url), model: parsed.data.model, ...(key ? { key } : {}) },
      });
    } else {
      const access = await resolveAccess();
      source = access.classifier.effective;
      endpoint = access.endpoint;
    }
    if (!source || !endpoint) return { ok: false, reason: 'unavailable' };
    try {
      const { answers, ms } = await jev.ask(buildProbeRequest(), endpoint);
      if (!isProbeAnswer(answers.probe)) return { ok: false, reason: 'unparsable', source, model: endpoint.model };
      return { ok: true, source, model: endpoint.model, ms };
    } catch (error) {
      if (error?.code === 'timeout') return { ok: false, reason: 'timeout', source, model: endpoint.model };
      if (typeof error?.status === 'number') return { ok: false, reason: 'http', status: error.status, source, model: endpoint.model };
      if (error instanceof SyntaxError || /no answers/.test(errorMessage(error))) {
        return { ok: false, reason: 'unparsable', source, model: endpoint.model };
      }
      return { ok: false, reason: 'network', message: errorMessage(error), source, model: endpoint.model };
    }
  };

  /** Where a Jev request goes right now, or null when no classification provider is usable. */
  const currentClassifierEndpoint = async () => (await resolveAccess()).endpoint;

  /** Held permissions the UI can read back after a reload. */
  const heldPermissions = () => {
    const held = [];
    for (const [permissionId, entry] of permissionDecisions) {
      if (entry.result.action === 'hold') held.push({ permissionId, score: entry.result.score, kind: entry.result.kind });
    }
    return held;
  };

  return {
    describe,
    classifierEndpoint: currentClassifierEndpoint,
    noteModelSelection,
    isAutoSession,
    resolveAutoSelection,
    applySessionSelection,
    routeSend,
    evaluatePermission,
    forgetPermission,
    heldPermissions,
    legacySafetyNetEnabled,
    updateConfig,
    setToken,
    clearToken,
    setClassifierSource,
    setCustomEndpoint,
    clearCustomEndpoint,
    testClassifier,
  };
}
