/**
 * Owns Jev routing at runtime: which classification provider answers, whether
 * Auto is ready, which model and agent a send that selected `openchamber/auto`
 * runs on, and the safety net consulted in a `safety` permission session.
 * Failure paths fall back to the user's own behaviour for routing (the
 * fallback model) and to the user's own decision for the safety net: a request
 * Jev could not check waits for the user, and the UI is told why.
 *
 * Host-owned routing chooses a real model before the Agent Service executes
 * the request. The Auto sentinel is a Host selection, never an OMP model.
 */
import { z } from 'zod';
import { ApprovalRequestSchema, EntityIdSchema, ModelCatalogSchema, ProviderCatalogSchema } from '@openchamber/agent-contract';
import { BUILTIN_CATEGORIES, ZEN_JEV_PROMOTION_ACTIVE } from './defaults.js';
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
import { turnsToHistory } from './history.js';
import { loadSettledTurns } from '../session-assist/context.js';
import { PROMPT_CACHE_TTL_MS, cacheHoldCategory } from './cache.js';
import { ENTERPRISE_MODE_ERROR, isEnterpriseMode } from '../enterprise-mode.js';

const HISTORY_TIMEOUT_MS = 2500;
/** A held permission is remembered so reconnect reconciliation does not re-ask Jev. */
const PERMISSION_DECISION_TTL_MS = 15 * 60 * 1000;

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

<<<<<<< HEAD

=======
// v2's command body (`session.command` in the protocol) names the command in
// `name` and carries its arguments in `text`; a prompt body has no `name`.
const commandBodySchema = z.object({ name: z.string().trim().min(1), text: z.string().nullish() });
// v2 sends one user turn as flat text; the context the composer attached went
// ahead of it as synthetic messages, which are never the request being routed.
const promptBodySchema = z.object({ text: z.string().nullish() });
// A form reply carries the filled-in fields, keyed by ids the agent made up.
const formReplyBodySchema = z.object({ answer: z.record(z.string(), z.unknown()) });

/** The user's words for this send: the prompt text, the slash command, or a form's answers. */
export const requestTextOf = (body) => {
  const formReply = formReplyBodySchema.safeParse(body);
  if (formReply.success) return Object.values(formReply.data.answer).flat().join('\n').trim();
  const command = commandBodySchema.safeParse(body);
  if (command.success) {
    const args = command.data.text?.trim();
    return `/${command.data.name}${args ? ` ${args}` : ''}`;
  }
  const prompt = promptBodySchema.safeParse(body);
  return (prompt.success ? prompt.data.text ?? '' : '').trim();
};
>>>>>>> bc50ba56a

/** Extensions that name an image when its media type is not a `data:` URL. */
const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp']);

// The Host prompt carries attachments as `{ attachmentId, name, mediaType, uri }`;
// Jev reads text only, so a pasted image has to be stated in the request it
// judges. Kept beside `routingRequestTextOf` rather than inside the caller,
// so the rule lives with the classifier it serves.
const isImageAttachment = (attachment) => {
  const mediaType = typeof attachment?.mediaType === 'string' ? attachment.mediaType.trim().toLowerCase() : '';
  if (mediaType.startsWith('image/')) return true;
  const name = typeof attachment?.name === 'string' ? attachment.name.toLowerCase() : '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot + 1));
};

/**
 * The attachment fact for the classifier: without it the router discards the
 * one cue that distinguishes "look at this screenshot" from "fix the
 * image-upload endpoint".
 */
export const attachmentHint = (input) => {
  const attachments = Array.isArray(input?.attachments) ? input.attachments : [];
  const images = attachments.filter(isImageAttachment);
  if (images.length === 0) return '';
  const names = images.map((attachment) => (typeof attachment?.name === 'string' ? attachment.name.trim() : '')).filter(Boolean).slice(0, 3);
  const count = images.length === 1 ? 'an image' : `${images.length} images`;
  return `\n\n[The user attached ${count}${names.length > 0 ? `: ${names.join(', ')}` : ''}]`;
};

/** What the classifier sees for this send: the user's words plus the attachment fact. */
export const routingRequestTextOf = (input) => `${(input?.text ?? '').trim()}${attachmentHint(input)}`.trim();

const customEndpointInputSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  model: z.string().trim().min(1).max(200),
  key: z.string().trim().max(4000).nullable().optional(),
});

/** Project the persisted routing binding into captured native send options. */
const toModelRef = (model, variant) => {
  const ref = { providerId: model.providerID, modelId: model.modelID };
  if (variant) {
    ref.reasoningEffort = variant;
    ref.variant = variant;
  }
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
  resolveCredential,
  zenPromotionActive = ZEN_JEV_PROMOTION_ACTIVE,
  enterpriseMode = isEnterpriseMode,
  readPinnedEndpoint = readPinnedCustomEndpoint,
  listCatalogModels = null,
  readSessionHistory = null,
<<<<<<< HEAD
=======
  readConfigEntries = null,
  readSessionAgent = null,
  // Whether OpenChamber keeps this session's cache warm itself (`session-warming`).
  isSessionWarm = () => false,
>>>>>>> bc50ba56a
  now = Date.now,
}) {
  if (!service || typeof service.request !== 'function') throw new Error('routing requires the Agent service');
  if (typeof resolveWorkspaceScope !== 'function' || typeof resolveSessionScope !== 'function') throw new Error('routing requires Host scope resolvers');
  if (typeof resolveCredential !== 'function') throw new Error('routing requires the selected credential resolver');
  const permissionDecisions = new Map();
<<<<<<< HEAD
=======
  // Sessions the user put on Auto. The sentinel never reaches OpenCode, so
  // nothing upstream remembers the choice for us.
  // TODO(v2): this is process memory. A server restart drops the mark and the
  // session silently runs on whatever model it was last switched to while the
  // composer still shows Auto. Either persist it next to `routing.json` or have
  // the client resend the sentinel with every send.
  const autoSessions = new Map();
  const AUTO_SESSION_LIMIT = 1000;
  // Per session: the agent routing switched it to and the agent it ran as
  // before (`agentForSend`). Process memory too, so a restart forgets it.
  const routedAgents = new Map();
>>>>>>> bc50ba56a

  const broadcast = (type, properties) => {
    try {
      broadcastGlobalUiEvent?.({ type, properties });
    } catch (error) {
      console.warn(`[routing] failed to broadcast ${type}:`, errorMessage(error));
    }
  };

  const enabledCategories = (config) => config.categories.filter((category) => category.enabled);

  const scopeForWorkspace = async (workspaceId) => {
    if (!EntityIdSchema.safeParse(workspaceId).success) throw Object.assign(new Error('A workspace identity is required'), { status: 400, code: 'INVALID_REQUEST' });
    const scope = await resolveWorkspaceScope(workspaceId);
    if (!scope || scope.workspaceId !== workspaceId || !EntityIdSchema.safeParse(scope.agentDirectoryId).success)
      throw Object.assign(new Error('Workspace scope was not found'), { status: 403, code: 'UNAUTHORIZED' });
    return scope;
  };
  const nativeSources = {
    'zen-key': { providerId: 'opencode-zen', keyField: 'zenKey' },
    openrouter: { providerId: 'openrouter', keyField: 'openrouterKey' },
    vercel: { providerId: 'vercel-ai-gateway', keyField: 'vercelKey' },
  };

  /** Catalogs describe presence; only the source used for this request resolves a secret. */
  const resolveAccess = async (scope = null, useCredential = false) => {
    const [typesafeKey, stored, savedEndpoint] = await Promise.all([
      store.readToken(), store.readClassifierSource(), store.readCustomEndpoint(),
    ]);
    const pinned = readPinnedEndpoint();
    const customEndpoint = pinned ?? savedEndpoint;
    const enterprise = enterpriseMode();
    const selected = !enterprise ? stored : pinned && stored !== 'off' ? 'custom' : 'off';
    const keys = { typesafeKey, customEndpoint };
    const selections = {};
    if (scope && !enterprise) {
      const catalog = ProviderCatalogSchema.parse(await requestAgent(`/api/agent/v1/workspaces/${encodeURIComponent(scope.workspaceId)}/providers`));
      if (catalog.workspaceId !== scope.workspaceId) throw Object.assign(new Error('Provider catalog belongs to another workspace'), { status: 403, code: 'UNAUTHORIZED' });
      for (const [source, { providerId, keyField }] of Object.entries(nativeSources)) {
        const provider = catalog.providers.find((entry) => entry.providerId === providerId);
        if (provider?.auth.status !== 'configured' || provider.auth.method !== 'api-key') continue;
        selections[source] = { workspaceId: scope.workspaceId, agentDirectoryId: scope.agentDirectoryId,
          providerId, credentialRef: provider.auth.credentialRef, purpose: 'routing' };
        keys[keyField] = true;
      }
    }
    const classifier = resolveClassifier({ selected, ...keys, zenPromotionActive });
    let endpoint = null;
    if (useCredential && classifier.effective) {
      const native = nativeSources[classifier.effective];
      if (native) {
        const credential = await resolveCredential(selections[classifier.effective]);
        if (credential?.type !== 'api_key' || typeof credential.key !== 'string' || !credential.key)
          throw Object.assign(new Error('Selected routing credential is unavailable'), { status: 422, code: 'CREDENTIAL_UNAVAILABLE' });
        keys[native.keyField] = credential.key;
      }
      endpoint = classifierEndpoint(classifier.effective, keys);
    }
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
  const describe = async (workspaceId) => {
    const scope = workspaceId === undefined ? null : await scopeForWorkspace(workspaceId);
    const [config, access] = await Promise.all([store.readConfig(), resolveAccess(scope)]);
    const jevAvailable = access.classifier.effective !== null;
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
    if (!response.ok) throw Object.assign(new Error(body?.detail || 'Agent service request failed'), { status: response.status, code: body?.code });
    return body;
  };
  const scopeForSession = async (sessionId) => {
    const scope = await resolveSessionScope(sessionId);
    if (!scope) throw Object.assign(new Error('Session scope was not found'), { status: 404, code: 'SESSION_NOT_FOUND' });
    return scope;
  };
  const readHistory = readSessionHistory ?? (async ({ sessionId }) => {
    await scopeForSession(sessionId);
    const completedAtByMessage = new Map();
    const turns = await loadSettledTurns({
      signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
      readPage: async ({ limit, cursor }) => {
        const page = await requestAgent(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/history?${new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) })}`);
        for (const turn of page.turns) {
          if (turn.status !== 'completed' || !Number.isFinite(turn.finishedAt)) continue;
          for (const messageId of turn.assistantMessageIds) completedAtByMessage.set(messageId, turn.finishedAt);
        }
        return page;
      },
    });
    const last = turns.at(-1)?.assistant;
    const completedAt = completedAtByMessage.get(last?.id);
    return {
      history: turnsToHistory(turns),
      lastAnswer: last?.providerId && last.modelId && Number.isFinite(completedAt)
        ? { providerID: last.providerId, modelID: last.modelId, finishedAt: completedAt }
        : null,
    };
  });

  /** Hold downward moves only while the last settled model's prompt cache is warm. */
  const cacheHold = async ({ config, chosen, composerAgent, lastAnswer }) => {
    if (!config.preserveCache || !lastAnswer) return null;
    const held = cacheHoldCategory({
      categories: enabledCategories(config), fallback: config.fallback, composerAgent, chosen, current: lastAnswer,
    });
    if (!held) return null;
    const idle = now() - lastAnswer.finishedAt;
    if (idle < PROMPT_CACHE_TTL_MS) return held;
    return null;
  };

  // A category without a model of its own means "the fallback pair"; a variant
  // only travels with the model it was chosen for.
<<<<<<< HEAD
  const chooseSelection = (config, choice, _composerAgent) => {
=======
  const chooseSelection = (config, choice) => {
>>>>>>> bc50ba56a
    const own = Boolean(choice?.model);
    const model = own ? choice.model : config.fallback.model;
    const variant = own ? choice.variant : config.fallback.variant;
    return {
      model: toModelRef(model, variant),
<<<<<<< HEAD
      agent: null,
      decision: { providerID: model.providerID, modelID: model.modelID, variant: variant ?? null, reasoningEffort: variant ?? null, agent: null },
    };
  };

  const readCatalog = listCatalogModels ?? (async (workspaceId) => {
    await scopeForWorkspace(workspaceId);
    const catalog = ModelCatalogSchema.parse(await requestAgent(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/models`));
    if (catalog.workspaceId !== workspaceId) throw Object.assign(new Error('Model catalog belongs to another workspace'), { status: 403, code: 'UNAUTHORIZED' });
    return catalog.models;
  });
=======
      decision: { providerID: model.providerID, modelID: model.modelID, variant: variant ?? null, agent: choice?.agent ?? null },
    };
  };

  const readAgent = readSessionAgent ?? (async ({ sessionId, directory }) => (
    agentBodySchema.safeParse(await openCodeClient(directory).session.get({ sessionID: sessionId })).data?.agent ?? null
  ));

  /**
   * The agent a routed send runs as. A category agent replaces the session's
   * and is remembered with the agent it replaced. A send whose category names
   * no agent keeps the composer's, except while the session still runs as the
   * agent routing set: then it goes back to the one before (#6392). In Auto
   * the composer shows the session's agent, so it cannot ask for that itself.
   * A session found on any other agent was switched since, so its agent stays.
   */
  const agentForSend = async ({ sessionId, directory, categoryAgent, composerAgent }) => {
    const routed = routedAgents.get(sessionId);
    if (!sessionId || (!categoryAgent && !routed)) return categoryAgent || composerAgent;
    let current;
    try {
      current = await readAgent({ sessionId, directory });
    } catch (error) {
      console.warn('[routing] session agent unavailable, leaving it as it is:', errorMessage(error));
      return categoryAgent || composerAgent;
    }
    const stillRouted = routed?.agent === current;
    if (categoryAgent) {
      const previous = stillRouted ? routed.previous : current;
      routedAgents.delete(sessionId);
      // A session without an agent of its own has nothing to go back to.
      if (previous && previous !== categoryAgent) {
        routedAgents.set(sessionId, { agent: categoryAgent, previous });
        while (routedAgents.size > AUTO_SESSION_LIMIT) routedAgents.delete(routedAgents.keys().next().value);
      }
      return categoryAgent;
    }
    // A composer agent other than the routed one is the caller's own choice.
    if (!stillRouted || (composerAgent && composerAgent !== routed.agent)) {
      routedAgents.delete(sessionId);
      return composerAgent;
    }
    // Kept until a read finds the session off the routed agent, so a switch
    // back that fails is tried again on the next send.
    return routed.previous;
  };

  const readCatalog = listCatalogModels
    ?? (async (directory) => catalogResponseSchema.parse(await openCodeClient(directory).model.list()).data);
>>>>>>> bc50ba56a

  /**
   * Drops a variant the canonical model catalog does not list. An unreadable
   * catalog or a model not present in it cannot invalidate a saved variant.
   */
  const withKnownVariant = async (selection, workspaceId) => {
    const effort = selection.model.reasoningEffort ?? selection.model.variant;
    if (!effort) return selection;
    let models;
    try { models = await readCatalog(workspaceId); }
    catch (error) {
      console.warn('[routing] model catalog unavailable, keeping the saved thinking effort:', errorMessage(error));
      return selection;
    }
    const { providerId, modelId } = selection.model;
    const entry = models.find((model) => model.provider === providerId && model.modelId === modelId);
    if (!entry) return selection;
    const knownEfforts = Array.isArray(entry.reasoningOptions)
      ? entry.reasoningOptions.map((option) => option.reasoningEffort)
      : [];
    const knownVariants = Array.isArray(entry.variants)
      ? entry.variants.map((v) => v.variant)
      : [];
    if (effort === 'off' || knownEfforts.includes(effort) || knownVariants.includes(effort)) {
      return {
        ...selection,
        model: { ...selection.model, reasoningEffort: effort },
        decision: { ...selection.decision, reasoningEffort: effort },
      };
    }
    console.warn(`[routing] ${providerId}/${modelId} has no "${effort}" thinking level; using its default`);
    return {
      ...selection,
      model: { providerId, modelId, reasoningEffort: null, variant: null },
      decision: { ...selection.decision, variant: null, reasoningEffort: null },
    };
  };

  /**
   * Resolves one send that named the Auto sentinel. Returns the model and
   * agent the send must use, or null when a real model was selected.
   *
   * The caller captures the resolved model and agent for native delivery.
   * Without a configured fallback the request fails before any execution.
   */
  const resolveAutoSelection = async ({ sessionId, directory, workspaceId: requestedWorkspaceId, model, agent: _agent, requestText }) => {
    if (model?.providerId !== 'openchamber' || model?.modelId !== 'auto') return null;
    const sessionScope = await scopeForSession(sessionId);
    const workspaceId = requestedWorkspaceId ?? sessionScope.workspaceId;
    if (sessionScope.workspaceId !== workspaceId) throw Object.assign(new Error('Session workspace does not match routing workspace'), { status: 403, code: 'UNAUTHORIZED' });
    const state = await describe(workspaceId);
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
      const { endpoint } = await resolveAccess(await scopeForWorkspace(workspaceId), true);
      try {
        // A provider removed between presence discovery and execution is not usable.
        if (!endpoint) throw new Error('No classification provider is available');
        const request = (requestText ?? '').trim();
        const { answers, ms } = await jev.ask(buildRoutingRequest({ categories: enabledCategories(config), history, request }), endpoint);
        const result = decideRouting(answers.category, { categories: enabledCategories(config), minConfidence: config.minConfidence });
        decision.category = result.category?.id ?? null;
        decision.confidence = result.confidence;
        decision.reason = result.reason;
        decision.ms = ms;
<<<<<<< HEAD
        const held = await cacheHold({ config, chosen: result.category, composerAgent: null, lastAnswer });
=======
        // A queued send names the session's agent; while routing set it, a
        // category without an agent runs as the one before (`agentForSend`).
        const routed = routedAgents.get(sessionId);
        const composerAgent = routed && agent === routed.agent ? routed.previous : agent;
        const held = await cacheHold({ config, chosen: result.category, composerAgent, lastAnswer, sessionId, directory });
>>>>>>> bc50ba56a
        if (held) {
          // The send runs as the category the session is already on;
          // `cacheHold.requested` keeps what Jev asked for.
          decision.category = held.id;
          decision.cacheHold = { requested: result.category.id };
        }
        selection = chooseSelection(config, held ?? result.category);
      } catch (error) {
        decision.reason = 'error';
        decision.error = errorMessage(error);
        selection = chooseSelection(config, null);
      }
    } else {
      selection = chooseSelection(config, null);
    }
<<<<<<< HEAD
    selection = await withKnownVariant(selection, workspaceId);
    Object.assign(decision, selection.decision);
    broadcast('openchamber:routing.decision', decision);
    return { model: selection.model, agent: null, decision };
  };

=======
    selection = await withKnownVariant(selection, directory);
    const sendAgent = await agentForSend({
      sessionId, directory, categoryAgent: selection.decision.agent, composerAgent: agent ?? null,
    });
    Object.assign(decision, selection.decision);
    broadcast('openchamber:routing.decision', decision);
    return { model: selection.model, agent: sendAgent, decision };
  };

  /**
   * `POST /session/:id/model` with the sentinel puts the session on Auto;
   * with any real model it takes it off again.
   */
  const noteModelSelection = (sessionId, model, directory) => {
    if (!sessionId) return false;
    if (!isAutoModel(model)) {
      autoSessions.delete(sessionId);
      // Off Auto the composer shows the session's agent again and the user can
      // keep or change it, so routing has nothing to put back.
      routedAgents.delete(sessionId);
      return false;
    }
    autoSessions.delete(sessionId);
    autoSessions.set(sessionId, { directory: directory ?? null, at: now() });
    while (autoSessions.size > AUTO_SESSION_LIMIT) autoSessions.delete(autoSessions.keys().next().value);
    return true;
  };

  const isAutoSession = (sessionId) => Boolean(sessionId) && autoSessions.has(sessionId);

  /** Switches the session onto a resolved selection, the way a v2 send does. */
  const applySessionSelection = async (sessionId, directory, selection) => {
    const client = openCodeClient(directory);
    await client.session.switchModel({ sessionID: sessionId, model: selection.model });
    if (selection.agent) await client.session.switchAgent({ sessionID: sessionId, agent: selection.agent });
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
      requestText: routingRequestTextOf(body),
    });
    if (!resolved) return null;
    // v2 prompt and command bodies carry neither model nor agent: switching
    // the session is the whole application of the decision.
    await applySessionSelection(sessionId, directory, resolved);
    return resolved.decision;
  };
>>>>>>> bc50ba56a

  /**
   * Consulted by permission auto-accept in a `safety` session before it
   * replies. `accept` replies; `hold` leaves the request for the user. Only a
   * verdict from Jev accepts: with no classification provider the request
   * waits quietly, the way an `ask` session's would; when Jev fails it waits
   * too, and the UI is told why (`skipped`).
   */
  const evaluatePermission = async (permission, directory) => {
    const parsed = ApprovalRequestSchema.safeParse(permission);
    if (!parsed.success || parsed.data.status !== 'pending') return { action: 'hold' };
    const approval = parsed.data;
    const scope = await scopeForSession(approval.sessionId);
    const workspaceScope = await scopeForWorkspace(scope.workspaceId);
    const [config, presence] = await Promise.all([store.readConfig(), resolveAccess(workspaceScope)]);
    if (!presence.classifier.effective) return { action: 'hold', unavailable: true };
    const identity = JSON.stringify([approval.sessionId, approval.epoch, approval.workerGeneration, approval.version,
      presence.classifier.effective, config.safetyNet.threshold]);
    const cached = permissionDecisions.get(approval.approvalId);
    if (cached?.identity === identity && now() - cached.at < PERMISSION_DECISION_TTL_MS) return cached.result;
    const access = await resolveAccess(workspaceScope, true);
    if (!access.endpoint) return { action: 'hold', unavailable: true };
    let result;
    try {
      const { answers } = await jev.ask(buildPermissionRequest(approval), access.endpoint);
      const verdict = decidePermission(answers, { threshold: config.safetyNet.threshold });
      result = verdict.hold
        ? { action: 'hold', score: verdict.score, kind: verdict.kind }
        : { action: 'accept', score: verdict.score, kind: verdict.kind };
    } catch (error) {
      // Not remembered: reconnect reconciliation asks Jev again, and may accept.
      const skipped = errorMessage(error);
      broadcast('openchamber:routing.safety-skipped', {
        permissionId: approval.approvalId, sessionId: approval.sessionId, directory: directory ?? null, error: skipped,
      });
      return { action: 'hold', skipped };
    }
    if (result.action === 'hold') {
      broadcast('openchamber:routing.permission-held', {
        permissionId: approval.approvalId, sessionId: approval.sessionId, directory: directory ?? null, score: result.score, kind: result.kind,
      });
    }
    permissionDecisions.set(approval.approvalId, { at: now(), identity, result });
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
  const testClassifier = async (draft, workspaceId) => {
    const scope = workspaceId === undefined ? null : await scopeForWorkspace(workspaceId);
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
      const access = await resolveAccess(scope, true);
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

  /** Resolve the endpoint for an authorized workspace, or null when no provider is usable. */
  const currentClassifierEndpoint = async (workspaceId) => {
    const scope = await scopeForWorkspace(workspaceId);
    return (await resolveAccess(scope, true)).endpoint;
  };

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
    resolveAutoSelection,
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
