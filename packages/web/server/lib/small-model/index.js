import { randomUUID } from 'node:crypto';
import os from 'os';
import path from 'path';
import { readMergedSettingsSync } from '../host/settings-files.js';
import {
  completeSmallModel,
  findModelInfo,
  getAgentService,
  listModelInfos,
  listProviderInfos,
} from './client.js';


const OPENCHAMBER_SETTINGS_FILE = path.join(
  process.env.OPENCHAMBER_DATA_DIR
    ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'openchamber'),
  'settings.json',
);

// OpenChamber's own settings: when the user unchecks "use default small model"
// their explicit override outranks the model OpenCode would pick.
const readSmallModelSettingsOverride = () => {
  const settings = readMergedSettingsSync({ fs, path, settingsFilePath: OPENCHAMBER_SETTINGS_FILE });
  if (settings.smallModelUseDefault !== false) return null;
  const override = typeof settings.smallModelOverride === 'string' ? settings.smallModelOverride.trim() : '';
  return override || null;
};

export function parseModelRef(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const slash = trimmed.indexOf('/');
  if (slash <= 0 || slash === trimmed.length - 1) return null;
  return {
    providerID: trimmed.slice(0, slash),
    modelID: trimmed.slice(slash + 1),
  };
}

// Rough safety clamp so a huge input never blows the model's context window.
// Token estimate is ~4 chars/token; when OpenCode reports no limit for the
// model a conservative default applies.
const DEFAULT_CONTEXT_TOKENS = 64_000;
const OUTPUT_RESERVE_TOKENS = 4_000;

/**
 * Input budget in characters, given how much of the context the caller intends
 * to leave for the answer. The reserve must match the output budget the caller
 * will actually request, or the two disagree and the model overruns its context.
 */
export const getModelInputCharBudget = ({ modelInfo, outputReserveTokens }) => {
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
 * `/api/experimental/generate` takes no output budget of its own, so this number only
 * shapes the input reserve — but it has to stay the same number on both sides
 * or a caller that asks for a large answer overruns the context.
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


/**
 * The model families that count as "small", most preferred first. The same
 * list OpenCode uses for its own session titles (`Catalog.model.small` in
 * `packages/core/src/catalog.ts`); OpenCode does not expose that lookup over
 * HTTP, so the scan is repeated here on `GET /api/model`.
 */
export const SMALL_MODEL_FAMILY_PRIORITY = ['gpt-luna', 'gemini-flash-lite', 'gemini-flash', 'claude-haiku'];

/**
 * A model's family: the catalog's `family` (models.dev) when it has one,
 * else read from the id. A custom provider or a subscription outside the
 * catalog has no `family`, yet its `gemini-3.6-flash` is still a flash.
 */
export const familyOf = (model) => {
  if (model?.family) return String(model.family);
  const id = String(model?.modelId ?? '').toLowerCase();
  if (id.includes('luna')) return 'gpt-luna';
  if (id.includes('flash-lite') || id.includes('flash_lite')) return 'gemini-flash-lite';
  if (id.includes('flash')) return 'gemini-flash';
  if (id.includes('haiku')) return 'claude-haiku';
  return null;
};

/**
 * The small model within one provider: the newest enabled, active, text-in
 * text-out model of the first family in `SMALL_MODEL_FAMILY_PRIORITY` that the
 * provider has. Null when the provider has none of those families.
 */
export const pickSmallModelInProvider = (models, providerID) => pickSmallModel(models, (model) => model.provider === providerID);

const pickSmallModel = (models, accept) => {
  const candidates = models
    .filter((model) => model && accept(model)
      && model.enabled !== false
      && (model.status === undefined || ['active', 'alpha', 'beta'].includes(model.status))
      && model.modalities.includes('text'));
  for (const family of SMALL_MODEL_FAMILY_PRIORITY) {
    const found = candidates.find((model) => familyOf(model) === family);
    if (found) return { providerID: found.provider, modelID: found.modelId };
  }
  return null;
};

/** Resolve only from explicit intent and the authorized workspace catalog. */
const resolveSmallModel = async ({ client, workspaceId, model, preferredProviderID, preferredModelID }) => {
  const explicit = parseModelRef(model);
  if (explicit) return { ...explicit, source: 'request' };

  const models = await listModelInfos(client, workspaceId);
  const fromSettings = parseModelRef(readSmallModelSettingsOverride());
  if (fromSettings) {
    const info = findModelInfo(models, fromSettings.providerID, fromSettings.modelID);
    if (info?.enabled !== false) return { ...fromSettings, source: 'settings' };
  }

  if (preferredProviderID) {
    const small = pickSmallModelInProvider(models, preferredProviderID);
    if (small) return { ...small, source: 'session-provider-small' };
    if (preferredModelID && findModelInfo(models, preferredProviderID, preferredModelID)) {
      return { providerID: preferredProviderID, modelID: preferredModelID, source: 'session-model' };
    }
    return null;
  }

  const fallback = pickSmallModel(models, () => true);
  return fallback ? { ...fallback, source: 'catalog-small' } : null;
};


const requestOptions = ({ timeoutMs, signal }) => {
  const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeout);
  return { signal: signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal };
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
export async function generateSmallModelText({ prompt, system, maxOutputTokens, model, workspaceId, preferredProviderID, preferredModelID, responseSchema, timeoutMs, signal, onOverflow = 'truncate' }) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw Object.assign(new Error('prompt is required'), { statusCode: 400 });
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) throw Object.assign(new Error('workspaceId is required'), { statusCode: 400 });
  const client = getAgentService();
  if (!client) throw Object.assign(new Error('Agent service is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });

  const resolved = await resolveSmallModel({ client, workspaceId, model, preferredProviderID, preferredModelID });
  if (!resolved) throw Object.assign(new Error(preferredProviderID ? 'No small model available within the session provider' : 'No small model is available in the workspace catalog'), { statusCode: 404, code: 'MODEL_UNAVAILABLE' });

  const models = await listModelInfos(client, workspaceId);
  const modelInfo = findModelInfo(models, resolved.providerID, resolved.modelID);
  const outputTokens = resolveOutputTokens({ modelInfo, maxOutputTokens });
  const clamped = clampPromptToModelLimit({ prompt: prompt.trim(), modelInfo, providerID: resolved.providerID, modelID: resolved.modelID, onOverflow, outputReserveTokens: outputTokens });
  const result = await completeSmallModel({
    completionId: randomUUID(), workspaceId,
    selection: { providerId: resolved.providerID, modelId: resolved.modelID },
    prompt: clamped.prompt, format: responseSchema ? { kind: 'json', schema: responseSchema } : { kind: 'text' },
    overflow: onOverflow, variant: null, reasoningEffort: null,
    ...(outputTokens ? { maxOutputTokens: outputTokens } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(typeof system === 'string' && system.trim() ? { system: system.trim() } : {}),
  }, { signal: requestOptions({ timeoutMs, signal }).signal });
  if (result.status === 'cancelled') throw Object.assign(new Error(`Small-model completion ${result.reason}`), { statusCode: 499, code: `completion-${result.reason}` });
  if (result.status === 'failed') throw completionError(result, resolved);
  const text = result.output.kind === 'json' ? JSON.stringify(result.output.value) : result.output.text;
  return { text: text.trim(), providerID: resolved.providerID, modelID: resolved.modelID, source: resolved.source, ...(clamped.truncated ? { inputTruncated: true } : {}) };
}

/**
 * Provider ids the small model can actually call. A provider counts when
 * OpenCode has at least one enabled model for it — that is the same test
 * OpenCode applies before letting a chat turn use it.
 *
 * The provider list alone is not enough: it comes back empty on setups where
 * models are perfectly usable, so the model list is the authority and the
 * provider list only contributes names.
 */
export async function listAuthenticatedProviders(workspaceId) {
  const client = getAgentService();
  if (!client) throw Object.assign(new Error('Agent service is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  const [providers, models] = await Promise.all([listProviderInfos(client, workspaceId), listModelInfos(client, workspaceId)]);
  const enabled = new Set(models.filter((model) => model?.enabled !== false).map((model) => model.provider));
  return providers.filter((provider) => enabled.has(provider.providerId)).map((provider) => provider.providerId);
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
  typeof outputReserveTokens === 'function' ? outputReserveTokens(limits) : outputReserveTokens
);

/**
 * Reports which model would be used, without calling it.
 *
 */
export async function describeSmallModel({ workspaceId, preferredProviderID, preferredModelID, outputReserveTokens, overrideModel } = {}) {
  const client = getAgentService();
  if (!client) throw Object.assign(new Error('Agent service is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  const resolved = await resolveSmallModel({ client, workspaceId, model: overrideModel, preferredProviderID, preferredModelID });
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
