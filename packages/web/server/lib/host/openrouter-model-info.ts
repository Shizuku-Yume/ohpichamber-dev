import express from 'express';
import { z } from 'zod';
import { ProblemDetailsSchema } from '@openchamber/agent-contract';
import { isEnterpriseMode, type EnterprisePolicyOptions } from '../enterprise-mode.js';
import { isString } from '../shared/guards.js';
import type { JsonValue } from '../shared/json-values.js';
import type { Application, NextFunction, Request, Response } from '../shared/http-contracts.js';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

const ModelIdSchema = z.string().trim().min(1).max(256);

const ModelInfoRequestSchema = z.strictObject({
  modelIds: z.array(ModelIdSchema).min(1).max(200),
});

const OpenRouterModelSchema = z.object({
  id: z.string().optional(),
  context_length: z.number().nullable().optional(),
  top_provider: z.object({
    context_length: z.number().nullable().optional(),
    max_completion_tokens: z.number().nullable().optional(),
  }).nullable().optional(),
  architecture: z.object({
    input_modalities: z.array(z.string()).nullable().optional(),
    modality: z.string().nullable().optional(),
  }).nullable().optional(),
  pricing: z.object({
    prompt: z.string().nullable().optional(),
    completion: z.string().nullable().optional(),
    input_cache_read: z.string().nullable().optional(),
    input_cache_write: z.string().nullable().optional(),
  }).nullable().optional(),
  supported_parameters: z.array(z.string()).nullable().optional(),
  reasoning: z.json().optional(),
}).loose();

const OpenRouterModelsResponseSchema = z.object({
  data: z.array(OpenRouterModelSchema),
});

const JsonBodyErrorSchema = z.object({
  status: z.number().optional(),
});

type OpenRouterModel = z.infer<typeof OpenRouterModelSchema>;

export interface OpenRouterCatalogInfo {
  source: 'openrouter';
  input: ('text' | 'image')[];
  contextWindow: number;
  maxTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  reasoning: boolean;
  toolsSupported?: boolean;
}

export interface OpenRouterModelMatch {
  modelId: string;
  catalog: OpenRouterCatalogInfo;
}

export interface OpenRouterModelInfoRouteOptions {
  fetchImpl?: typeof fetch;
  enterprisePolicyOptions?: EnterprisePolicyOptions;
  url?: string;
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

interface ModelIndex {
  exact: Map<string, OpenRouterModel>;
  byKey: Map<string, OpenRouterModel>;
}

const isPositiveInteger = (value: number | null | undefined): value is number =>
  Number.isInteger(value) && (value ?? 0) > 0;

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const perMillion = (value: string | null | undefined): number | null => {
  if (!isString(value) || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 1_000_000 * 1_000_000) / 1_000_000;
};

const foldVariant = (id: string): string =>
  String(id).trim().toLowerCase().replace(/:/g, '-').replace(/-(free|cloud)$/, '');

const matchKey = (id: string): string => foldVariant(id).split('/').pop() ?? '';

const indexes = new WeakMap<OpenRouterModel[], ModelIndex>();

const buildIndex = (models: OpenRouterModel[]): ModelIndex => {
  const cached = indexes.get(models);
  if (cached) return cached;
  const exact = new Map<string, OpenRouterModel>();
  const byKey = new Map<string, { identities: Set<string>; candidates: Array<{ id: string; model: OpenRouterModel }> }>();
  for (const model of models) {
    const id = isString(model.id) ? model.id : null;
    if (!id) continue;
    const lowered = id.toLowerCase();
    if (!exact.has(lowered)) exact.set(lowered, model);
    const key = matchKey(id);
    if (!key) continue;
    const entry = byKey.get(key) ?? { identities: new Set<string>(), candidates: [] };
    entry.identities.add(foldVariant(id));
    entry.candidates.push({ id, model });
    byKey.set(key, entry);
  }
  const unique = new Map<string, OpenRouterModel>();
  for (const [key, entry] of byKey) {
    if (entry.identities.size !== 1) continue;
    const [preferred] = [...entry.candidates].sort(
      (left, right) => (left.id.includes(':') ? 1 : 0) - (right.id.includes(':') ? 1 : 0) || left.id.length - right.id.length,
    );
    if (preferred) unique.set(key, preferred.model);
  }
  const index: ModelIndex = { exact, byKey: unique };
  indexes.set(models, index);
  return index;
};

const findModel = (index: ModelIndex, modelId: string): OpenRouterModel | null =>
  index.exact.get(modelId.toLowerCase()) ?? index.byKey.get(matchKey(modelId)) ?? null;

const inputModalities = (model: OpenRouterModel): ('text' | 'image')[] => {
  const declared = Array.isArray(model.architecture?.input_modalities)
    ? model.architecture.input_modalities
    : isString(model.architecture?.modality)
      ? (model.architecture.modality.split('->')[0] ?? '').split('+')
      : [];
  const inputs = new Set<'text' | 'image'>();
  for (const entry of declared) {
    if (entry === 'text' || entry === 'image') inputs.add(entry);
  }
  return [...inputs];
};

const toCatalogInfo = (model: OpenRouterModel): OpenRouterCatalogInfo | null => {
  const contextWindow = isPositiveInteger(model.top_provider?.context_length)
    ? model.top_provider.context_length
    : isPositiveInteger(model.context_length)
      ? model.context_length
      : null;
  const maxTokens = isPositiveInteger(model.top_provider?.max_completion_tokens)
    ? model.top_provider.max_completion_tokens
    : null;
  const input = inputModalities(model);
  const inputPrice = perMillion(model.pricing?.prompt);
  const outputPrice = perMillion(model.pricing?.completion);
  if (contextWindow === null || maxTokens === null || input.length === 0 || inputPrice === null || outputPrice === null) return null;

  const cost = {
    input: inputPrice,
    output: outputPrice,
    cacheRead: perMillion(model.pricing?.input_cache_read) ?? 0,
    cacheWrite: perMillion(model.pricing?.input_cache_write) ?? 0,
  };
  const supportedParameters = Array.isArray(model.supported_parameters) ? model.supported_parameters : null;
  const toolsSupported = supportedParameters
    ? supportedParameters.includes('tools') || supportedParameters.includes('tool_choice')
    : undefined;

  const info: OpenRouterCatalogInfo = {
    source: 'openrouter',
    input,
    contextWindow,
    maxTokens,
    cost,
    reasoning: Boolean(model.reasoning) || Boolean(supportedParameters?.includes('reasoning')) || Boolean(supportedParameters?.includes('include_reasoning')),
  };
  if (toolsSupported !== undefined) {
    info.toolsSupported = toolsSupported;
  }
  return info;
};

const fetchModels = async ({
  url,
  fetchImpl,
  timeoutMs,
}: {
  url: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<OpenRouterModel[]> => {
  if (!isHttpsUrl(url)) {
    throw new Error('OpenRouter model info requires an https URL');
  }
  const request = (async () => {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter responded with status ${response.status}`);
    }
    const declaredLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new Error('OpenRouter returned an oversized payload');
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error('OpenRouter returned an oversized payload');
    }
    let payloadJson: JsonValue;
    try {
      payloadJson = z.json().parse(JSON.parse(text));
    } catch {
      throw new Error('OpenRouter returned invalid JSON');
    }
    const payload = OpenRouterModelsResponseSchema.safeParse(payloadJson);
    if (!payload.success) {
      throw new Error('OpenRouter returned an unexpected payload');
    }
    return payload.data.data;
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('OpenRouter did not answer in time')), timeoutMs);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
    request.catch(() => { });
  }
};

const createOpenRouterModelCatalog = ({
  fetchImpl = globalThis.fetch,
  url = OPENROUTER_MODELS_URL,
  ttlMs = DEFAULT_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now,
}: Omit<OpenRouterModelInfoRouteOptions, 'enterprisePolicyOptions'> = {}) => {
  let models: OpenRouterModel[] | null = null;
  let fetchedAt = 0;
  let inflight: Promise<OpenRouterModel[]> | null = null;

  const load = async (): Promise<OpenRouterModel[]> => {
    const current = now();
    if (models && current - fetchedAt < ttlMs) return models;
    if (!inflight) {
      inflight = fetchModels({ url, fetchImpl, timeoutMs })
        .then((fetched) => {
          models = fetched;
          fetchedAt = now();
          return fetched;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };

  return {
    async lookup(modelIds: readonly string[]): Promise<OpenRouterModelMatch[]> {
      const fetched = await load();
      const index = buildIndex(fetched);
      const seen = new Set<string>();
      const result: OpenRouterModelMatch[] = [];
      for (const requested of modelIds) {
        const modelId = requested.trim();
        if (seen.has(modelId)) continue;
        seen.add(modelId);
        const model = findModel(index, modelId);
        if (!model) continue;
        const catalog = toCatalogInfo(model);
        if (!catalog) continue;
        result.push({ modelId, catalog });
      }
      return result;
    },
  };
};

const problem = (
  res: Response,
  status: number,
  code: string,
  detail: string,
  title = 'Model info unavailable',
): Response => {
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/problem+json');
  return res.status(status).json(ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`,
    title,
    status,
    detail,
    code,
    retryable: status >= 500,
  }));
};

export const registerOpenRouterModelInfoRoute = (
  app: Application,
  {
    fetchImpl,
    enterprisePolicyOptions,
    url,
    ttlMs,
    timeoutMs,
    now,
  }: OpenRouterModelInfoRouteOptions = {},
): void => {
  const catalogOptions: Omit<OpenRouterModelInfoRouteOptions, 'enterprisePolicyOptions'> = {};
  if (fetchImpl !== undefined) catalogOptions.fetchImpl = fetchImpl;
  if (url !== undefined) catalogOptions.url = url;
  if (ttlMs !== undefined) catalogOptions.ttlMs = ttlMs;
  if (timeoutMs !== undefined) catalogOptions.timeoutMs = timeoutMs;
  if (now !== undefined) catalogOptions.now = now;
  const catalog = createOpenRouterModelCatalog(catalogOptions);
  const refusals = {
    enterprise: (res: Response) => problem(res, 403, 'enterprise_mode', 'Model info from OpenRouter is not available in enterprise mode.'),
    invalid: (res: Response) => problem(res, 400, 'INVALID_REQUEST', 'Send 1 to 200 modelIds, each a non-empty string of at most 256 characters.', 'Model info request invalid'),
  };
  const refuseInEnterpriseMode = (_req: Request, res: Response, next: NextFunction): void | Response => (
    isEnterpriseMode(enterprisePolicyOptions)
      ? refusals.enterprise(res)
      : next()
  );
  const jsonBody = (req: Request, res: Response, next: NextFunction): void => {
    express.json({ limit: '64kb', strict: true })(req, res, (error) => {
      if (!error) return next();
      const parsedError = JsonBodyErrorSchema.safeParse(error);
      if (parsedError.success && parsedError.data.status === 413) {
        problem(res, 413, 'PAYLOAD_TOO_LARGE', 'The model info request body exceeds 64 KiB.', 'Model info request invalid');
        return;
      }
      refusals.invalid(res);
    });
  };

  app.post(
    '/api/openchamber/openrouter/model-info',
    refuseInEnterpriseMode,
    jsonBody,
    async (req, res) => {
      const parsed = ModelInfoRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return refusals.invalid(res);
      }
      try {
        const models = await catalog.lookup(parsed.data.modelIds);
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ models });
      } catch (error) {
        console.warn('Failed to fetch OpenRouter model info:', error instanceof Error ? error.message : error);
        return problem(res, 502, 'PROVIDER_UNAVAILABLE', 'OpenRouter model info is unavailable');
      }
    },
  );
};
