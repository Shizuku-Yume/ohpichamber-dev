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

function parseModelRef(value) {
  const parsed = modelRefSchema.safeParse(value);
  if (!parsed.success) return null;
  const trimmed = parsed.data.trim();
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
 * The canonical completion receives this same budget as maxOutputTokens.
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
  const clamped = clampPromptToModelLimit({ prompt: prompt.trim(), modelInfo, providerID: resolved.providerID, modelID: resolved.modelID, onOverflow, outputReserveTokens: outputTokens });
  const request = {
    completionId: randomUUID(), workspaceId,
    selection: { providerId: resolved.providerID, modelId: resolved.modelID },
    prompt: clamped.prompt, format: responseSchema ? { kind: 'json', schema: responseSchema } : { kind: 'text' },
    overflow: onOverflow === 'error' ? 'reject' : 'truncate', variant: null, reasoningEffort: null,
    timeoutMs: Number(timeoutMs) > 0 ? Number(timeoutMs) : 60_000,
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
 * Providers with enabled workspace models. Canonical provider records supply
 * identity and auth state; this helper never reads legacy engine config.
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
  outputReserveTokens instanceof Function ? outputReserveTokens(limits) : outputReserveTokens
);

/**
 * Reports which model would be used, without calling it.
 *
 */
export async function describeSmallModel({ workspaceId, preferredProviderID, preferredModelID, outputReserveTokens, overrideModel, role = 'smol' } = {}) {
  const client = getAgentService();
  if (!client) throw Object.assign(new Error('Agent service is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  const resolved = await resolveSmallModel({ client, workspaceId, model: overrideModel, preferredProviderID, preferredModelID, role });
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
