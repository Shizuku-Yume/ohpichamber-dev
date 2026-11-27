import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  parseModelSelector,
  resolveRoleSelector,
  thinkingLevelToReasoningEffort,
  modelRefKey,
  isRoleConfigured,
  type CompletionRequest,
  type CompletionResult,
  type ConfiguredThinkingLevel,
  type JsonObject,
  type Model,
} from '@openchamber/agent-contract';
import {
  completeSmallModel,
  findModelInfo,
  getAgentService,
  getModelRoles,
  listModelInfos,
  type SmallModelAgentService,
} from './client.js';

export type SmallModelSource =
  | 'request'
  | 'modelRoles'
  | 'session-provider-small'
  | 'session-model'
  | 'catalog-small';

export interface ResolvedSmallModel {
  providerID: string;
  modelID: string;
  source: SmallModelSource;
  thinkingLevel?: ConfiguredThinkingLevel | undefined;
  variant?: string | null | undefined;
}

export interface GenerateSmallModelTextOptions {
  prompt: string;
  system?: string | undefined;
  maxOutputTokens?: number | undefined;
  model?: string | undefined;
  workspaceId: string;
  preferredProviderID?: string | undefined;
  preferredModelID?: string | undefined;
  responseSchema?: JsonObject | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  onOverflow?: 'truncate' | 'error' | undefined;
  role?: string | undefined;
}

export interface GeneratedSmallModelText {
  text: string;
  providerID: string;
  modelID: string;
  source: SmallModelSource;
  inputTruncated?: boolean | undefined;
}

export interface OutputReserveLimits {
  contextTokens: number;
  outputTokenLimit: number | null;
}

export type OutputReserveTokens =
  | number
  | ((limits: OutputReserveLimits) => number | undefined)
  | undefined;

export interface DescribeSmallModelOptions {
  workspaceId?: string | undefined;
  preferredProviderID?: string | undefined;
  preferredModelID?: string | undefined;
  outputReserveTokens?: OutputReserveTokens;
  overrideModel?: string | undefined;
  role?: string | undefined;
}

export interface SmallModelDescription extends ResolvedSmallModel {
  inputCharBudget: number;
  contextTokens: number;
  contextKnown: boolean;
  outputTokens: number | null;
  outputTokenLimit: number | null;
}

interface ParsedSelection {
  providerID: string;
  modelID: string;
  thinkingLevel: ConfiguredThinkingLevel | undefined;
  variant: string | null;
}

const nonEmptyTextSchema = z.string().refine((value) => value.trim().length > 0);

const parseSelection = (value: string | undefined): ParsedSelection | null => {
  if (!nonEmptyTextSchema.safeParse(value).success || value === undefined) return null;
  const parsed = parseModelSelector(value.trim());
  return parsed ? {
    providerID: parsed.providerId,
    modelID: parsed.modelId,
    thinkingLevel: parsed.thinkingLevel,
    variant: parsed.variant ?? null,
  } : null;
};

const DEFAULT_CONTEXT_TOKENS = 64_000;
const OUTPUT_RESERVE_TOKENS = 4_000;

const getModelInputCharBudget = ({
  modelInfo,
  outputReserveTokens,
}: {
  modelInfo: Model | null;
  outputReserveTokens?: number | undefined;
}) => {
  const context = Number(modelInfo?.contextWindow);
  const known = context > 0;
  const contextTokens = known ? context : DEFAULT_CONTEXT_TOKENS;
  const reserve = Number(outputReserveTokens) > 0 ? Number(outputReserveTokens) : OUTPUT_RESERVE_TOKENS;
  const inputBudgetTokens = Math.max(1_000, contextTokens - reserve);
  return { maxChars: inputBudgetTokens * 4, contextTokens, contextKnown: known };
};

const resolveOutputTokens = ({
  modelInfo,
  maxOutputTokens,
}: {
  modelInfo: Model | null;
  maxOutputTokens?: number | undefined;
}): number | undefined => {
  const requested = Number(maxOutputTokens) > 0 ? Number(maxOutputTokens) : 0;
  if (!requested) return undefined;
  const limit = Number(modelInfo?.maxOutputTokens);
  return limit > 0 ? Math.min(requested, limit) : requested;
};

const clampPromptToModelLimit = ({
  prompt,
  modelInfo,
  providerID,
  modelID,
  onOverflow,
  outputReserveTokens,
}: {
  prompt: string;
  modelInfo: Model | null;
  providerID: string;
  modelID: string;
  onOverflow: 'truncate' | 'error';
  outputReserveTokens: number | undefined;
}) => {
  const { maxChars } = getModelInputCharBudget({ modelInfo, outputReserveTokens });
  if (prompt.length <= maxChars) {
    return { prompt, truncated: false };
  }
  if (onOverflow === 'error') {
    throw Object.assign(
      new Error(`Input is too large for ${modelRefKey(providerID, modelID)}: ${prompt.length} characters exceeds the ${maxChars} the model's context allows`),
      { statusCode: 413, code: 'context-too-small', providerID, modelID, requiredChars: prompt.length, availableChars: maxChars },
    );
  }
  return { prompt: `${prompt.slice(0, maxChars)}…`, truncated: true };
};

const SMALL_MODEL_FAMILY_PRIORITY = ['gpt-luna', 'gemini-flash-lite', 'gemini-flash', 'claude-haiku'] as const;

const familyOf = (model: Model): (typeof SMALL_MODEL_FAMILY_PRIORITY)[number] | null => {
  const id = String(model.modelId ?? '').toLowerCase();
  if (id.includes('luna')) return 'gpt-luna';
  if (id.includes('flash-lite') || id.includes('flash_lite')) return 'gemini-flash-lite';
  if (id.includes('flash')) return 'gemini-flash';
  if (id.includes('haiku')) return 'claude-haiku';
  return null;
};

const pickSmallModel = (models: readonly Model[], accept: (model: Model) => boolean): { providerID: string; modelID: string } | null => {
  const candidates = models
    .filter((model) => Boolean(model) && accept(model)
      && model.enabled !== false
      && (model.status === undefined || ['active', 'alpha', 'beta'].includes(model.status))
      && model.modalities.includes('text'));
  for (const family of SMALL_MODEL_FAMILY_PRIORITY) {
    const found = candidates.find((model) => familyOf(model) === family);
    if (found) return { providerID: found.provider, modelID: found.modelId };
  }
  return null;
};

const usableModel = (model: Model | null): boolean => Boolean(model && model.enabled !== false && model.status !== 'deprecated' && model.modalities.includes('text'));

const resolveSmallModel = async ({
  client,
  workspaceId,
  model,
  preferredProviderID,
  preferredModelID,
  role = 'smol',
}: {
  client: SmallModelAgentService;
  workspaceId: string;
  model?: string | undefined;
  preferredProviderID?: string | undefined;
  preferredModelID?: string | undefined;
  role?: string | undefined;
}): Promise<ResolvedSmallModel | null> => {
  const models = await listModelInfos(client, workspaceId);
  const explicit = parseSelection(model);
  if (nonEmptyTextSchema.safeParse(model).success && !explicit) throw Object.assign(new Error('Invalid background model selection'), { statusCode: 400, code: 'INVALID_REQUEST' });
  if (explicit) return usableModel(findModelInfo(models, explicit.providerID, explicit.modelID)) ? { ...explicit, source: 'request' } : null;

  const modelRoles = await getModelRoles(client, workspaceId).catch(() => ({}));
  const targetRole = role || 'smol';
  const roleSelector = resolveRoleSelector(targetRole, modelRoles);
  const fromRoles = parseSelection(roleSelector);
  if (!fromRoles && (isRoleConfigured(targetRole, modelRoles) || isRoleConfigured('default', modelRoles))) return null;
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

const resolveReasoningEffort = (modelInfo: Model | null, thinkingLevel: ConfiguredThinkingLevel | undefined): string | null => {
  const wanted = thinkingLevelToReasoningEffort(thinkingLevel);
  if (!wanted || !modelInfo?.reasoningEffortSupported) return null;
  const efforts = (modelInfo.reasoningOptions ?? []).map((option) => option.reasoningEffort).filter((effort) => effort !== 'off');
  if (efforts.length === 0) return null;
  return efforts.includes(wanted) ? wanted : (efforts[0] ?? null);
};

const completionError = (result: Extract<CompletionResult, { status: 'failed' }>, resolved: ResolvedSmallModel): Error & {
  statusCode: number;
  code: string;
  providerID: string;
  modelID: string;
} => {
  const detail = result.error.detail || 'Small-model completion failed';
  const statusCode = result.error.code === 'CONTEXT_LIMIT' ? 413
    : result.error.code === 'STRUCTURED_OUTPUT_INVALID' ? 422
      : result.error.code === 'MODEL_UNAVAILABLE' ? 404 : 502;
  return Object.assign(new Error(detail), {
    statusCode,
    code: result.error.code.toLowerCase().replaceAll('_', '-'),
    providerID: resolved.providerID,
    modelID: resolved.modelID,
  });
};

export async function generateSmallModelText({
  prompt,
  system,
  maxOutputTokens,
  model,
  workspaceId,
  preferredProviderID,
  preferredModelID,
  responseSchema,
  timeoutMs,
  signal,
  onOverflow = 'truncate',
  role = 'smol',
}: GenerateSmallModelTextOptions): Promise<GeneratedSmallModelText> {
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
  const request: CompletionRequest = {
    completionId: randomUUID(),
    workspaceId,
    selection: { providerId: resolved.providerID, modelId: resolved.modelID },
    prompt: clamped.prompt,
    format: responseSchema ? { kind: 'json', schema: responseSchema } : { kind: 'text' },
    overflow: onOverflow === 'error' ? 'reject' : 'truncate',
    variant: resolved.variant ?? null,
    reasoningEffort: resolveReasoningEffort(modelInfo, resolved.thinkingLevel),
    timeoutMs: Number(timeoutMs) > 0 ? Number(timeoutMs) : 60_000,
  };
  if (outputTokens) request.maxOutputTokens = outputTokens;
  const parsedSystem = nonEmptyTextSchema.safeParse(system);
  if (parsedSystem.success) request.system = parsedSystem.data.trim();
  const result = await completeSmallModel(request, { signal });
  if (result.status === 'cancelled') throw Object.assign(new Error(`Small-model completion ${result.reason}`), { statusCode: 499, code: `completion-${result.reason}` });
  if (result.status === 'failed') throw completionError(result, resolved);
  const text = result.output.kind === 'json' ? JSON.stringify(result.output.value) : result.output.text;
  const output: GeneratedSmallModelText = { text: text.trim(), providerID: resolved.providerID, modelID: resolved.modelID, source: resolved.source };
  if (clamped.truncated) output.inputTruncated = true;
  return output;
}

const resolveReserveTokens = (outputReserveTokens: OutputReserveTokens, limits: OutputReserveLimits): number | undefined => (
  outputReserveTokens instanceof Function ? outputReserveTokens(limits) : outputReserveTokens
);

export async function describeSmallModel({
  workspaceId = '',
  preferredProviderID,
  preferredModelID,
  outputReserveTokens,
  overrideModel,
  role = 'smol',
}: DescribeSmallModelOptions = {}): Promise<SmallModelDescription | null> {
  const client = getAgentService();
  if (!client) throw Object.assign(new Error('Agent service is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  const resolved = await resolveSmallModel({ client, workspaceId, model: overrideModel, preferredProviderID, preferredModelID, role });
  if (!resolved) return null;
  const models = await listModelInfos(client, workspaceId);
  const modelInfo = findModelInfo(models, resolved.providerID, resolved.modelID);
  const outputTokenLimit = Number(modelInfo?.maxOutputTokens) > 0 ? Number(modelInfo?.maxOutputTokens) : null;
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
