import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  completeSmallModel,
  findModelInfo,
  getAgentService,
  getModelRoles,
  listModelInfos,
  listProviderInfos,
} from './client.js';

const modelRefSchema = z.string();
const nonEmptyTextSchema = z.string().refine((value) => value.trim().length > 0);

<<<<<<< HEAD
function parseModelRef(value) {
  const parsed = modelRefSchema.safeParse(value);
  if (!parsed.success) return null;
  const trimmed = parsed.data.trim();
=======
// The deadline is a hang guard, not a pace-setter: prefill dominates, so the
// budget scales with the prompt the module actually sends instead of the flat
// default. Issue #5017 measured local-model prefill at 94-187 tok/s on 4 GB-VRAM
// hardware, i.e. ~10.6 ms/token worst observed; 40 ms/token is ~4x headroom over
// that floor, which also absorbs the answer decode and one structured-output
// retry. The cap matches the walkthrough ceiling (../walkthrough/index.js), the
// in-repo precedent for size-scaled budgets.
const TIMEOUT_PER_TOKEN_MS = 40;
const TIMEOUT_MAX_MS = 900_000;

/** Budget for a prompt of `promptChars` characters (~4 chars/token, as for the input clamp). */
export const generationBudgetMs = (promptChars) => Math.min(
  TIMEOUT_MAX_MS,
  DEFAULT_TIMEOUT_MS + Math.max(0, Math.ceil(Number(promptChars) / 4)) * TIMEOUT_PER_TOKEN_MS,
);

// Waits between retries of an unready catalog, ~31 s in total. Right after
// OpenCode starts, plugin-provided models (claude-code) stay unavailable for
// 20-40 s while plugins for the global location load lazily. The rejection
// precedes provider dispatch, so a retry costs no tokens.
const UNAVAILABLE_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 16_000];
let unavailableRetryDelaysMs = UNAVAILABLE_RETRY_DELAYS_MS;

// Generation waits up to 5 s for the location's plugins, then answers that
// they are still activating; after them it answers the model missing.
const isCatalogNotReady = (error, model) => (
  (error?._tag === 'ModelNotFoundError'
    && error.providerID === model.providerID && error.modelID === model.modelID)
  || (error?._tag === 'ServiceUnavailableError' && error.service === 'plugin')
);

/** Test hook: replace the backoff schedule; no argument restores the default. */
export const setUnavailableRetryDelaysForTest = (delays = UNAVAILABLE_RETRY_DELAYS_MS) => {
  unavailableRetryDelaysMs = delays;
};

const OPENCHAMBER_SETTINGS_FILE = path.join(
  process.env.OPENCHAMBER_DATA_DIR
    ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'openchamber'),
  'settings.json',
);

/**
 * OpenChamber's own settings: when the user unchecks "use default small model"
 * their explicit override outranks the model OpenCode would pick. The chosen
 * thinking variant belongs to that override, and is ignored with the rest of
 * it while "use default" is on.
 */
const readSmallModelSettingsOverride = () => {
  const settings = readMergedSettingsSync({ fs, path, settingsFilePath: OPENCHAMBER_SETTINGS_FILE });
  if (settings.smallModelUseDefault !== false) return null;
  const model = parseModelRef(asNonEmptyString(settings.smallModelOverride));
  if (!model) return null;
  const variant = asNonEmptyString(settings.smallModelVariant);
  if (variant) model.variant = variant;
  return model;
};

export function parseModelRef(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
>>>>>>> bc50ba56a
  const slash = trimmed.indexOf('/');
  if (slash <= 0 || slash === trimmed.length - 1) return null;
  return {
    providerID: trimmed.slice(0, slash),
    modelID: trimmed.slice(slash + 1),
  };
}

// Conservative estimate for Host input budgeting against canonical limits.
const DEFAULT_CONTEXT_TOKENS = 64_000;
const OUTPUT_RESERVE_TOKENS = 4_000;

/**
 * Input budget in characters, given how much of the context the caller intends
 * to leave for the answer. The reserve must match the output budget the caller
 * will actually request, or the two disagree and the model overruns its context.
 */
const getModelInputCharBudget = ({ modelInfo, outputReserveTokens }) => {
  const context = Number(modelInfo?.contextWindow);
  const known = context > 0;
  const contextTokens = known ? context : DEFAULT_CONTEXT_TOKENS;
  const reserve = Number(outputReserveTokens) > 0 ? Number(outputReserveTokens) : OUTPUT_RESERVE_TOKENS;
  const inputBudgetTokens = Math.max(1_000, contextTokens - reserve);
  return { maxChars: inputBudgetTokens * 4, contextTokens, contextKnown: known };
};

/**
 * The output budget to actually request: what the caller asked for, capped by
 * what the model admits it can emit.
 *
<<<<<<< HEAD
 * The canonical completion receives this same budget as maxOutputTokens.
=======
 * `/api/experimental/generate/text` takes no output budget of its own, so this number only
 * shapes the input reserve — but it has to stay the same number on both sides
 * or a caller that asks for a large answer overruns the context.
>>>>>>> bc50ba56a
 */
const resolveOutputTokens = ({ modelInfo, maxOutputTokens }) => {
  const requested = Number(maxOutputTokens) > 0 ? Number(maxOutputTokens) : 0;
  if (!requested) return undefined;
  const limit = Number(modelInfo?.maxOutputTokens);
  return limit > 0 ? Math.min(requested, limit) : requested;
};

// `truncate` keeps the historical behavior for callers whose prompt losing its
// tail is survivable (summaries, commit messages). `error` is for callers whose
// output would be quietly wrong on a clipped input — they need the failure.
const clampPromptToModelLimit = ({ prompt, modelInfo, providerID, modelID, onOverflow, outputReserveTokens }) => {
  const { maxChars } = getModelInputCharBudget({ modelInfo, outputReserveTokens });
  if (prompt.length <= maxChars) {
    return { prompt, truncated: false };
  }
  if (onOverflow === 'error') {
    throw Object.assign(
      new Error(`Input is too large for ${providerID}/${modelID}: ${prompt.length} characters exceeds the ${maxChars} the model's context allows`),
      { statusCode: 413, code: 'context-too-small', providerID, modelID, requiredChars: prompt.length, availableChars: maxChars },
    );
  }
  return { prompt: `${prompt.slice(0, maxChars)}…`, truncated: true };
};


<<<<<<< HEAD
/** Product family preference used only within the caller's chosen provider. */
const SMALL_MODEL_FAMILY_PRIORITY = ['gpt-luna', 'gemini-flash-lite', 'gemini-flash', 'claude-haiku'];

/** Canonical model IDs supply the family used for utility preference. */
const familyOf = (model) => {
  const id = String(model?.modelId ?? '').toLowerCase();
  if (id.includes('luna')) return 'gpt-luna';
  if (id.includes('flash-lite') || id.includes('flash_lite')) return 'gemini-flash-lite';
  if (id.includes('flash')) return 'gemini-flash';
  if (id.includes('haiku')) return 'claude-haiku';
  return null;
};

=======
/**
 * The tiers that count as "small", most preferred first. The tiers are the
 * ones OpenCode uses for its own session titles (`Catalog.model.small` in
 * `packages/core/src/catalog.ts`); OpenCode does not expose that lookup over
 * HTTP, so the scan is repeated here on `GET /api/model`. A tier is a name,
 * not one lab's family: every lab's flash (`deepseek-flash`, `glm-flash`,
 * `mimo-v2.6-flash`) is a flash. Flash ranks before luna, unlike OpenCode's
 * list: on gateways a flash is the open model with the larger allowance,
 * where luna sends the content to OpenAI. `flash-lite` stays ahead of
 * `flash`, which is also how `smallModelTierOf` tells the two apart.
 */
export const SMALL_MODEL_TIER_PRIORITY = ['flash-lite', 'flash', 'luna', 'haiku'];

/**
 * A model's small tier, read from the catalog's `family` (models.dev) and its
 * id together: a catalog family can be a whole line (`mimo`, `qwen`) while
 * the id names the flash, and a custom provider has no `family` at all.
 */
export const smallModelTierOf = (model) => {
  const name = `${model?.family ?? ''} ${model?.id ?? ''}`.toLowerCase().replaceAll('_', '-');
  return SMALL_MODEL_TIER_PRIORITY.find((tier) => name.includes(tier)) ?? null;
};

/**
 * The small model within one provider: the newest enabled, active, text-in
 * text-out model of the first tier in `SMALL_MODEL_TIER_PRIORITY` that the
 * provider has. Null when the provider has none of those tiers.
 */
export const pickSmallModelInProvider = (models, providerID) => pickSmallModel(models, (model) => model.providerID === providerID);
>>>>>>> bc50ba56a

// Without a zen login OpenCode gives zen this placeholder instead of a key and
// trims it to the free models. Those serve OpenCode's own sessions only:
// `/api/experimental/generate/text` answers every one of them with "Free usage
// limit reached", so this module never resolves to one, whichever step names it.
// A zen login or key removes the placeholder.
const ZEN_ANONYMOUS_API_KEY = 'public';
const isAnonymousZenModel = (model) => model?.providerID === 'opencode'
  && model.settings?.apiKey === ZEN_ANONYMOUS_API_KEY;

/** Enabled, active, text in and text out; a field OpenCode does not report counts as fine. */
const isUsableTextModel = (model) => model.enabled !== false
  && !isAnonymousZenModel(model)
  && (model.status === undefined || model.status === 'active')
  && (model.capabilities?.input ?? ['text']).some((item) => String(item).startsWith('text'))
  && (model.capabilities?.output ?? ['text']).some((item) => String(item).startsWith('text'));

const pickSmallModel = (models, accept) => {
  const candidates = models
<<<<<<< HEAD
    .filter((model) => model && accept(model)
      && model.enabled !== false
      && (model.status === undefined || ['active', 'alpha', 'beta'].includes(model.status))
      && model.modalities.includes('text'));
  for (const family of SMALL_MODEL_FAMILY_PRIORITY) {
    const found = candidates.find((model) => familyOf(model) === family);
    if (found) return { providerID: found.provider, modelID: found.modelId };
=======
    .filter((model) => model && accept(model) && isUsableTextModel(model))
    .sort((a, b) => (Number(b.time?.released) || 0) - (Number(a.time?.released) || 0));
  for (const tier of SMALL_MODEL_TIER_PRIORITY) {
    const found = candidates.find((model) => smallModelTierOf(model) === tier);
    if (found) return { providerID: found.providerID, modelID: found.id };
>>>>>>> bc50ba56a
  }
  return null;
};

<<<<<<< HEAD
const usableModel = (model) => Boolean(model && model.enabled !== false && model.status !== 'deprecated' && model.modalities.includes('text'));
/** Resolve only from explicit intent and the authorized workspace catalog. */
const resolveSmallModel = async ({ client, workspaceId, model, preferredProviderID, preferredModelID, role = 'smol' }) => {
  const models = await listModelInfos(client, workspaceId);
  const explicit = parseModelRef(model);
  if (nonEmptyTextSchema.safeParse(model).success && !explicit) throw Object.assign(new Error('Invalid background model selection'), { statusCode: 400, code: 'INVALID_REQUEST' });
  if (explicit) return usableModel(findModelInfo(models, explicit.providerID, explicit.modelID)) ? { ...explicit, source: 'request' } : null;

  const modelRoles = await getModelRoles(client, workspaceId).catch(() => ({}));
  const targetRole = role || 'smol';
  const roleOverride = modelRoles?.[targetRole] || modelRoles?.default;
  const fromRoles = parseModelRef(roleOverride);
  if (roleOverride && !fromRoles) return null;
  if (fromRoles) {
    const info = findModelInfo(models, fromRoles.providerID, fromRoles.modelID);
    return usableModel(info) ? { ...fromRoles, source: 'modelRoles' } : null;
  }

  if (preferredProviderID) {
    const small = pickSmallModel(models, (candidate) => candidate.provider === preferredProviderID);
    if (small) return { ...small, source: 'session-provider-small' };
    if (preferredModelID && usableModel(findModelInfo(models, preferredProviderID, preferredModelID))) {
      return { providerID: preferredProviderID, modelID: preferredModelID, source: 'session-model' };
    }
=======
/**
 * Which model this call runs on, in order:
 *
 * 1. An explicit request model, with the thinking variant the caller names.
 * 2. OpenChamber's settings override (Settings → Sessions → Small Model),
 *    including the thinking variant chosen beside the model.
 * 3. The small model configured for OpenCode itself: the `title` agent's
 *    model and variant (`agents.title.model`, or v1 `small_model`) — `config`.
 * 4. The caller's own model when it is already a small one (`session-model`).
 *    Otherwise the small model of the caller's provider — the session's, or
 *    the one in the composer (tier scan above) — `session-provider-small`.
 *    Without one the caller's own model (`session-model`): costlier, but
 *    never someone else's subscription.
 * 5. `GET /api/model/default`: OpenCode's default model — `default`, only
 *    when the caller named no provider or it is on that provider. This is
 *    the chat default, not a small model; OpenCode's own family scan is not
 *    reachable over HTTP, which is why step 4 lives here.
 *
 * There is no step that picks a small model from whichever other provider
 * happens to be connected: the content (diffs, replies, session text) goes
 * only where the user sent their own work or configured on purpose.
 */
const resolveSmallModel = async ({ client, directory, model, variant, preferredProviderID, preferredModelID }) => {
  const models = await listModelInfos(client, directory);
  // A free zen model saved or configured anywhere counts as not set: the
  // resolution moves on as it would without it.
  const isCallable = ({ providerID, modelID }) => !isAnonymousZenModel(findModelInfo(models, providerID, modelID));

  const explicit = parseModelRef(model);
  if (explicit && isCallable(explicit)) {
    // A caller naming its model may name its thinking level with it.
    const explicitVariant = asNonEmptyString(variant);
    if (explicitVariant) explicit.variant = explicitVariant;
    return { ...explicit, source: 'request' };
  }

  const fromSettings = readSmallModelSettingsOverride();
  if (fromSettings && isCallable(fromSettings)) return { ...fromSettings, source: 'settings' };

  // A config can outlive the login behind it. OpenCode's own titles then move
  // on to another model, so a model it lists as disabled is skipped here too;
  // one it does not list (a plugin model still loading) is kept.
  const fromConfig = await getConfiguredSmallModelRef(client);
  if (fromConfig) {
    const info = findModelInfo(models, fromConfig.providerID, fromConfig.modelID);
    if (info?.enabled !== false && isCallable(fromConfig)) return { ...fromConfig, source: 'config' };
  }

  if (preferredProviderID) {
    // A session already on a small model keeps the side work there: another
    // small model of the same gateway can be another lab the user did not
    // pick, with its own retention terms. One OpenCode reports unusable (its
    // login gone, retired) falls through to the scan below.
    if (preferredModelID) {
      const sessionModel = findModelInfo(models, preferredProviderID, preferredModelID) ?? { id: preferredModelID };
      if (smallModelTierOf(sessionModel) && isUsableTextModel(sessionModel)) {
        return { providerID: preferredProviderID, modelID: preferredModelID, source: 'session-model' };
      }
    }
    const small = pickSmallModelInProvider(models, preferredProviderID);
    if (small) return { ...small, source: 'session-provider-small' };
    // OpenCode's own titles end here too: the model the user works with.
    if (preferredModelID && isCallable({ providerID: preferredProviderID, modelID: preferredModelID })) {
      return { providerID: preferredProviderID, modelID: preferredModelID, source: 'session-model' };
    }
  }

  const fallback = await getDefaultModelInfo(client);
  // Without a login OpenCode's default is a free zen model.
  if (!fallback || isAnonymousZenModel(fallback)) return null;
  // Without a configured default, OpenCode answers with its first available
  // model, from any provider. A caller that named its provider stays on it.
  if (preferredProviderID && fallback.providerID !== preferredProviderID) return null;
  return { providerID: fallback.providerID, modelID: fallback.id, source: 'default' };
};

const LOCAL_NETWORKS = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 32], ['127.0.0.0', 8], ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['169.254.0.0', 16], ['100.64.0.0', 10]]) {
  LOCAL_NETWORKS.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]]) {
  LOCAL_NETWORKS.addSubnet(address, prefix, 'ipv6');
}
const LOCAL_HOST_SUFFIXES = ['.localhost', '.local', '.lan', '.internal', '.home.arpa'];

/**
 * Whether the model is served from this machine or the local network, read
 * from the endpoint OpenCode reports for it (`settings.baseURL`). Covers
 * loopback, private and CGNAT (Tailscale) ranges, and LAN-style host names.
 * A model whose endpoint OpenCode does not report is not local.
 */
const isLocalModelEndpoint = (modelInfo) => {
  const endpoint = modelInfo?.settings?.baseURL ?? modelInfo?.settings?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) return false;
  let host;
  try {
    host = new URL(endpoint).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  const family = net.isIP(host);
  if (family) return LOCAL_NETWORKS.check(host, family === 6 ? 'ipv6' : 'ipv4');
  return host === 'localhost' || !host.includes('.') || LOCAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
};

const JSON_FENCE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;

/**
 * `/api/experimental/generate/text` has no structured-output mode, so the schema travels in the
 * prompt and the reply is parsed here.
 */
const buildSchemaInstruction = (responseSchema) =>
  `Reply with JSON matching this schema and nothing else: ${JSON.stringify(responseSchema)}`;

const extractJsonText = (raw) => {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return null;
  const fenced = JSON_FENCE.exec(trimmed);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
>>>>>>> bc50ba56a
    return null;
  }

  const fallback = pickSmallModel(models, () => true);
  return fallback ? { ...fallback, source: 'catalog-small' } : null;
};



const completionError = (result, resolved) => {
  const detail = result.error?.detail || 'Small-model completion failed';
  const statusCode = result.error?.code === 'CONTEXT_LIMIT' ? 413
    : result.error?.code === 'STRUCTURED_OUTPUT_INVALID' ? 422
      : result.error?.code === 'MODEL_UNAVAILABLE' ? 404 : 502;
  return Object.assign(new Error(detail), {
    statusCode,
    code: result.error?.code?.toLowerCase().replaceAll('_', '-'),
    providerID: resolved.providerID,
    modelID: resolved.modelID,
  });
};

/** Generate through the canonical stateless completion route. */
export async function generateSmallModelText({ prompt, system, maxOutputTokens, model, workspaceId, preferredProviderID, preferredModelID, responseSchema, timeoutMs, signal, onOverflow = 'truncate', role = 'smol' }) {
  if (!nonEmptyTextSchema.safeParse(prompt).success) throw Object.assign(new Error('prompt is required'), { statusCode: 400 });
  if (!nonEmptyTextSchema.safeParse(workspaceId).success) throw Object.assign(new Error('workspaceId is required'), { statusCode: 400 });
  const client = getAgentService();
  if (!client) throw Object.assign(new Error('Agent service is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });

  const resolved = await resolveSmallModel({ client, workspaceId, model, preferredProviderID, preferredModelID, role });
  if (!resolved) throw Object.assign(new Error(preferredProviderID ? 'No small model available within the session provider' : 'No small model is available in the workspace catalog'), { statusCode: 404, code: 'MODEL_UNAVAILABLE' });

  const models = await listModelInfos(client, workspaceId);
  const modelInfo = findModelInfo(models, resolved.providerID, resolved.modelID);
  const outputTokens = resolveOutputTokens({ modelInfo, maxOutputTokens });
<<<<<<< HEAD
  const clamped = clampPromptToModelLimit({ prompt: prompt.trim(), modelInfo, providerID: resolved.providerID, modelID: resolved.modelID, onOverflow, outputReserveTokens: outputTokens });
  const request = {
    completionId: randomUUID(), workspaceId,
    selection: { providerId: resolved.providerID, modelId: resolved.modelID },
    prompt: clamped.prompt, format: responseSchema ? { kind: 'json', schema: responseSchema } : { kind: 'text' },
    overflow: onOverflow === 'error' ? 'reject' : 'truncate', variant: null, reasoningEffort: null,
    timeoutMs: Number(timeoutMs) > 0 ? Number(timeoutMs) : 60_000,
=======

  const clamped = clampPromptToModelLimit({
    prompt: prompt.trim(),
    modelInfo,
    providerID: resolved.providerID,
    modelID: resolved.modelID,
    onOverflow,
    outputReserveTokens: outputTokens,
  });

  // `/api/experimental/generate/text` takes a single prompt, so the system instructions lead it.
  const sections = [];
  if (typeof system === 'string' && system.trim()) sections.push(system.trim());
  sections.push(clamped.prompt);
  if (responseSchema) sections.push(buildSchemaInstruction(responseSchema));
  const fullPrompt = sections.join('\n\n');

  const generationOptions = requestOptions({ timeoutMs, promptChars: fullPrompt.length, signal });
  const unavailableMessage = `Model unavailable: ${resolved.providerID}/${resolved.modelID}`;

  // A blown deadline is a budget problem the user can act on (shorter diff,
  // faster model), not a bad model choice, so it gets its own code and message.
  // Detection reads the deadline signal itself: its reason is always the
  // timeout, while the composed signal's reason propagation varies by runtime.
  const deadlineError = (cause) => Object.assign(
    new Error(`${resolved.providerID}/${resolved.modelID} did not finish within the ${Math.round(generationOptions.budgetMs / 1000)}s budget for this prompt size`, { cause }),
    { statusCode: 504, code: 'generation-timeout', providerID: resolved.providerID, modelID: resolved.modelID },
  );

  const send = async () => {
    const model = { id: resolved.modelID, providerID: resolved.providerID };
    if (variant) model.variant = variant;
    const result = await client.experimental.generate.text(
      { prompt: fullPrompt, model },
      generationOptions,
    );
    return typeof result?.text === 'string' ? result.text : '';
  };

  const sendWithCatalogRetry = async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await send();
      } catch (error) {
        if (generationOptions.deadline.aborted) throw deadlineError(error);
        if (!isCatalogNotReady(error, resolved)) throw error;
        // OpenCode 2 can resolve a cold catalog before its models arrive.
        // This rejection precedes provider dispatch; other failures must not retry.
        if (attempt < unavailableRetryDelaysMs.length) {
          await delay(unavailableRetryDelaysMs[attempt], undefined, { signal: generationOptions.signal })
            .catch((delayError) => {
              throw generationOptions.deadline.aborted ? deadlineError(delayError) : delayError;
            });
          continue;
        }
        throw Object.assign(new Error(unavailableMessage), {
          statusCode: 503,
          code: 'small-model-unavailable',
        });
      }
    }
  };

  let text = await sendWithCatalogRetry();

  if (responseSchema) {
    // One retry: a model that ignored the shape once often honours it on a
    // second pass, and the alternative is failing a walkthrough over a stray
    // sentence of preamble.
    let json = extractJsonText(text);
    if (json === null) {
      text = await sendWithCatalogRetry();
      json = extractJsonText(text);
    }
    if (json === null) {
      throw Object.assign(
        new Error(`${resolved.providerID}/${resolved.modelID} did not return JSON matching the requested schema`),
        { statusCode: 422, code: 'structured-output-unsupported', providerID: resolved.providerID, modelID: resolved.modelID },
      );
    }
    text = json;
  }

  return {
    text: text.trim(),
    providerID: resolved.providerID,
    modelID: resolved.modelID,
    source: resolved.source,
    ...(clamped.truncated ? { inputTruncated: true } : {}),
>>>>>>> bc50ba56a
  };
  if (outputTokens) request.maxOutputTokens = outputTokens;
  const parsedSystem = nonEmptyTextSchema.safeParse(system);
  if (parsedSystem.success) request.system = parsedSystem.data.trim();
  const result = await completeSmallModel(request, { signal });
  if (result.status === 'cancelled') throw Object.assign(new Error(`Small-model completion ${result.reason}`), { statusCode: 499, code: `completion-${result.reason}` });
  if (result.status === 'failed') throw completionError(result, resolved);
  const text = result.output.kind === 'json' ? JSON.stringify(result.output.value) : result.output.text;
  const output = { text: text.trim(), providerID: resolved.providerID, modelID: resolved.modelID, source: resolved.source };
  if (clamped.truncated) output.inputTruncated = true;
  return output;
}

/**
<<<<<<< HEAD
 * Providers with enabled workspace models. Canonical provider records supply
 * identity and auth state; this helper never reads legacy engine config.
 */
export async function listAuthenticatedProviders(workspaceId) {
  const client = getAgentService();
  if (!client) throw Object.assign(new Error('Agent service is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  const [providers, models] = await Promise.all([listProviderInfos(client, workspaceId), listModelInfos(client, workspaceId)]);
  const enabled = new Set(models.filter((model) => model?.enabled !== false).map((model) => model.provider));
  return providers.filter((provider) => enabled.has(provider.providerId)).map((provider) => provider.providerId);
=======
 * Provider ids the small model can actually call. A provider counts when
 * OpenCode has at least one enabled model for it — that is the same test
 * OpenCode applies before letting a chat turn use it — other than the free zen
 * models it lists without a login, which this module never calls. The model list is
 * directory-scoped, so `directory` scopes this answer the same way
 * `describeSmallModel` scopes its own; without one the server default applies.
 *
 * The provider list alone is not enough: it comes back empty on setups where
 * models are perfectly usable, so the model list is the authority and the
 * provider list only contributes names.
 */
export async function listAuthenticatedProviders(directory) {
  const client = getSmallModelClient(directory);
  if (!client) return [];
  try {
    const [providers, models] = await Promise.all([
      listProviderInfos(client),
      listModelInfos(client, directory),
    ]);
    const enabled = new Set();
    for (const model of models) {
      if (model?.enabled === false || isAnonymousZenModel(model)) continue;
      if (typeof model?.providerID === 'string' && model.providerID) enabled.add(model.providerID);
    }
    const ids = new Set();
    for (const provider of providers) {
      if (typeof provider?.id === 'string' && enabled.has(provider.id)) ids.add(provider.id);
    }
    for (const id of enabled) ids.add(id);
    return Array.from(ids);
  } catch {
    return [];
  }
>>>>>>> bc50ba56a
}

/**
 * The reserve, resolved against the model that was actually picked.
 *
 * A caller that wants "as much answer room as this model allows" cannot state a
 * number up front — it does not know which model it will get. Passing a
 * function lets it decide once the limits are known, and keeps the reserve and
 * the eventual request the same number by construction.
 */
const resolveReserveTokens = (outputReserveTokens, limits) => (
  outputReserveTokens instanceof Function ? outputReserveTokens(limits) : outputReserveTokens
);

/**
 * Reports which model would be used, without calling it.
 *
<<<<<<< HEAD
 */
export async function describeSmallModel({ workspaceId, preferredProviderID, preferredModelID, outputReserveTokens, overrideModel, role = 'smol' } = {}) {
  const client = getAgentService();
  if (!client) throw Object.assign(new Error('Agent service is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  const resolved = await resolveSmallModel({ client, workspaceId, model: overrideModel, preferredProviderID, preferredModelID, role });
=======
 * `structuredOutput` stays `null`: `/api/experimental/generate/text` has no structured-output
 * mode for any model, and this module emulates it through the prompt. Callers
 * must read `null` as "try it", which is exactly right here — the verdict
 * comes from the reply, not from a capability flag.
 */
export async function describeSmallModel({ directory, preferredProviderID, preferredModelID, outputReserveTokens, overrideModel, overrideVariant } = {}) {
  const client = getSmallModelClient(directory);
  if (!client) return null;

  // A caller with its own model setting (the diff walkthrough) outranks the
  // small-model chain entirely — it asked for this model on purpose. A free
  // zen model without a login is the exception: it counts as unset.
  const resolved = await resolveSmallModel({
    client,
    directory,
    model: overrideModel,
    variant: overrideVariant,
    preferredProviderID,
    preferredModelID,
  });
>>>>>>> bc50ba56a
  if (!resolved) return null;
  const models = await listModelInfos(client, workspaceId);
  const modelInfo = findModelInfo(models, resolved.providerID, resolved.modelID);
  const outputTokenLimit = Number(modelInfo?.maxOutputTokens) > 0 ? Number(modelInfo.maxOutputTokens) : null;
  const { contextTokens, contextKnown } = getModelInputCharBudget({ modelInfo });
  const reserveTokens = resolveReserveTokens(outputReserveTokens, { contextTokens, outputTokenLimit });
  const { maxChars } = getModelInputCharBudget({ modelInfo, outputReserveTokens: reserveTokens });
  return {
    ...resolved,
    inputCharBudget: maxChars,
    contextTokens,
    contextKnown,
    outputTokens: Number(reserveTokens) > 0 ? Number(reserveTokens) : null,
    outputTokenLimit,
  };
}
