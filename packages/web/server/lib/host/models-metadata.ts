import { createHash } from 'node:crypto';
import { z } from 'zod';
import { isString } from '../shared/guards.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;

export interface ModelsMetadataOptions {
  url?: string;
  ttlMs?: number;
  timeoutMs?: number;
}

export type ModelsMetadataCatalog = JsonObject;

export interface ModelsMetadataResult {
  metadata: ModelsMetadataCatalog;
  fromCache: boolean;
  stale?: boolean;
}

export interface SerializedClientModelsMetadata {
  body: string;
  etag: string;
}

export interface ClientModelMetadata {
  name?: JsonValue;
  tool_call?: JsonValue;
  reasoning?: JsonValue;
  structured_output?: JsonValue;
  modalities?: JsonValue;
  cost?: JsonValue;
  limit?: JsonValue;
  knowledge?: JsonValue;
  release_date?: JsonValue;
}

export interface ClientProviderModelsMetadata {
  id?: string;
  models: Record<string, ClientModelMetadata>;
}

export type ClientModelsMetadataCatalog = Record<string, ClientProviderModelsMetadata>;

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(JsonValueSchema),
  z.record(z.string(), JsonValueSchema),
]));

const ModelsMetadataCatalogSchema: z.ZodType<ModelsMetadataCatalog> = z.record(z.string(), JsonValueSchema);

let cachedMetadata: ModelsMetadataCatalog | null = null;
let cachedAt = 0;
let inflight: Promise<ModelsMetadataCatalog> | null = null;

const fetchCatalog = async (url: string, timeoutMs: number): Promise<ModelsMetadataCatalog> => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`models.dev responded with status ${response.status}`);
  }
  const parsed = ModelsMetadataCatalogSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('models.dev returned an unexpected payload');
  }
  return parsed.data;
};

export async function getModelsMetadata({
  url = MODELS_DEV_API_URL,
  ttlMs = DEFAULT_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ModelsMetadataOptions = {}): Promise<ModelsMetadataResult> {
  const now = Date.now();
  if (cachedMetadata && now - cachedAt < ttlMs) {
    return { metadata: cachedMetadata, fromCache: true };
  }

  if (!inflight) {
    inflight = fetchCatalog(url, timeoutMs).finally(() => {
      inflight = null;
    });
  }

  try {
    const metadata = await inflight;
    cachedMetadata = metadata;
    cachedAt = Date.now();
    return { metadata, fromCache: false };
  } catch (error) {
    if (cachedMetadata) {
      return { metadata: cachedMetadata, fromCache: true, stale: true };
    }
    throw error;
  }
}

const CLIENT_MODEL_FIELDS = [
  'name',
  'tool_call',
  'reasoning',
  'structured_output',
  'modalities',
  'cost',
  'limit',
  'knowledge',
  'release_date',
] as const;

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const projections = new WeakMap<ModelsMetadataCatalog, ClientModelsMetadataCatalog>();
const serializedProjections = new WeakMap<ClientModelsMetadataCatalog, SerializedClientModelsMetadata>();

export function toSerializedClientModelsMetadata(
  metadata: ModelsMetadataCatalog | JsonValue | undefined,
): SerializedClientModelsMetadata {
  const projected = toClientModelsMetadata(metadata);
  const cached = serializedProjections.get(projected);
  if (cached) return cached;
  const body = JSON.stringify(projected);
  const etag = `"${createHash('sha256').update(body).digest('base64url')}"`;
  const entry = { body, etag };
  serializedProjections.set(projected, entry);
  return entry;
}

export function toClientModelsMetadata(
  metadata: ModelsMetadataCatalog | JsonValue | undefined,
): ClientModelsMetadataCatalog {
  if (!isJsonObject(metadata)) {
    const empty = new Map<string, ClientProviderModelsMetadata>();
    return Object.fromEntries(empty);
  }
  const cached = projections.get(metadata);
  if (cached) return cached;
  const result = new Map<string, ClientProviderModelsMetadata>();
  for (const [providerKey, provider] of Object.entries(metadata)) {
    if (!isJsonObject(provider) || !isJsonObject(provider.models)) continue;
    const models = new Map<string, ClientModelMetadata>();
    for (const [modelKey, model] of Object.entries(provider.models)) {
      if (!isJsonObject(model)) continue;
      const projected: ClientModelMetadata = {};
      for (const field of CLIENT_MODEL_FIELDS) {
        const value = model[field];
        if (value !== undefined) projected[field] = value;
      }
      models.set(modelKey, projected);
    }
    const modelRecord = Object.fromEntries(models);
    result.set(providerKey, isString(provider.id) ? { id: provider.id, models: modelRecord } : { models: modelRecord });
  }
  const catalog = Object.fromEntries(result);
  projections.set(metadata, catalog);
  return catalog;
}
