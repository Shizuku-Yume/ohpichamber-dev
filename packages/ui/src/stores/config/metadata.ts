import { type ModelMetadata } from "@/types";
import { type ProviderModel, type ConfigSlice } from "./types";
import { runtimeFetch } from "@/lib/runtime-fetch";
import { markStartupTrace, measureStartupTrace } from "@/lib/startupTrace";

const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_PROXY_URL = "/api/openchamber/models-metadata";
const normalizeProviderId = (value: string) => value?.toLowerCase?.() ?? '';
interface ModelsDevModelEntry {
    id?: string;
    name?: string;
    tool_call?: boolean;
    reasoning?: boolean;
    temperature?: boolean;
    attachment?: boolean;
    structured_output?: boolean;
    modalities?: {
        input?: string[];
        output?: string[];
    };
    cost?: {
        input?: number;
        output?: number;
        cache_read?: number;
        cache_write?: number;
    };
    limit?: {
        context?: number;
        output?: number;
    };
    knowledge?: string;
    release_date?: string;
    last_updated?: string;
}
interface ModelsDevProviderEntry {
    id?: string;
    models?: Record<string, ModelsDevModelEntry | undefined>;
}
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const isModelsDevModelEntry = (value: unknown): value is ModelsDevModelEntry => {
    if (!isRecord(value)) {
        return false;
    }
    const candidate = value as ModelsDevModelEntry;
    if (candidate.modalities) {
        const {
            input,
            output
        } = candidate.modalities;
        if (input && !isStringArray(input)) {
            return false;
        }
        if (output && !isStringArray(output)) {
            return false;
        }
    }
    return true;
};
const isModelsDevProviderEntry = (value: unknown): value is ModelsDevProviderEntry => {
    if (!isRecord(value)) {
        return false;
    }
    const candidate = value as ModelsDevProviderEntry;
    return candidate.models === undefined || isRecord(candidate.models);
};
export const buildModelMetadataKey = (providerId: string, modelId: string) => {
    const normalizedProvider = normalizeProviderId(providerId);
    if (!normalizedProvider || !modelId) {
        return '';
    }
    return `${normalizedProvider}/${modelId}`;
};

/** Fallback metadata for models models.dev does not list. */
export const deriveModelMetadata = (providerId: string, model: ProviderModel): ModelMetadata => ({
    id: model.modelId,
    providerId,
    name: model.name,
    tool_call: model.toolsSupported,
    attachment: model.modalities.includes('image'),
    reasoning: model.reasoningEffortSupported,
    modalities: {
        input: model.modalities,
        output: model.modalities
    },
    cost: model.pricing ? {
        input: model.pricing.inputPerMillionTokens,
        output: model.pricing.outputPerMillionTokens,
        cache_read: model.pricing.cacheReadPerMillionTokens ?? 0,
        cache_write: model.pricing.cacheWritePerMillionTokens ?? 0
    } : undefined,
    limit: {
        context: model.contextWindow,
        output: model.maxOutputTokens
    }
});
const transformModelsDevResponse = (payload: unknown): Map<string, ModelMetadata> => {
    const metadataMap = new Map<string, ModelMetadata>();
    if (!isRecord(payload)) {
        return metadataMap;
    }
    for (const [providerKey, providerValue] of Object.entries(payload)) {
        if (!isModelsDevProviderEntry(providerValue)) {
            continue;
        }
        const providerId = typeof providerValue.id === 'string' && providerValue.id.length > 0 ? providerValue.id : providerKey;
        const models = providerValue.models;
        if (!models || !isRecord(models)) {
            continue;
        }
        for (const [modelKey, modelValue] of Object.entries(models)) {
            if (!isModelsDevModelEntry(modelValue)) {
                continue;
            }
            const resolvedModelId = typeof modelKey === 'string' && modelKey.length > 0 ? modelKey : modelValue.id;
            if (!resolvedModelId || typeof resolvedModelId !== 'string' || resolvedModelId.length === 0) {
                continue;
            }
            const metadata: ModelMetadata = {
                id: typeof modelValue.id === 'string' && modelValue.id.length > 0 ? modelValue.id : resolvedModelId,
                providerId,
                name: typeof modelValue.name === 'string' ? modelValue.name : undefined,
                tool_call: typeof modelValue.tool_call === 'boolean' ? modelValue.tool_call : undefined,
                reasoning: typeof modelValue.reasoning === 'boolean' ? modelValue.reasoning : undefined,
                temperature: typeof modelValue.temperature === 'boolean' ? modelValue.temperature : undefined,
                attachment: typeof modelValue.attachment === 'boolean' ? modelValue.attachment : undefined,
                structured_output: typeof modelValue.structured_output === 'boolean' ? modelValue.structured_output : undefined,
                modalities: modelValue.modalities ? {
                    input: isStringArray(modelValue.modalities.input) ? modelValue.modalities.input : undefined,
                    output: isStringArray(modelValue.modalities.output) ? modelValue.modalities.output : undefined
                } : undefined,
                cost: modelValue.cost,
                limit: modelValue.limit,
                knowledge: typeof modelValue.knowledge === 'string' ? modelValue.knowledge : undefined,
                release_date: typeof modelValue.release_date === 'string' ? modelValue.release_date : undefined,
                last_updated: typeof modelValue.last_updated === 'string' ? modelValue.last_updated : undefined
            };
            const key = buildModelMetadataKey(providerId, resolvedModelId);
            if (key) {
                metadataMap.set(key, metadata);
            }
        }
    }
    return metadataMap;
};
// The catalog is several megabytes and changes upstream a handful of times a
// day, so re-reads revalidate against the proxy's entity tag instead of
// downloading and parsing it again: an unchanged catalog is a 304 and the
// metadata map already in memory is the answer.
let modelsMetadataCache: { etag: string; metadata: Map<string, ModelMetadata> } | null = null;

const fetchModelsDevMetadata = async (): Promise<Map<string, ModelMetadata>> => {
    if (typeof fetch !== 'function') {
        return new Map();
    }
    const sources = [MODELS_DEV_PROXY_URL, MODELS_DEV_API_URL];
    for (const source of sources) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
        const timeout = controller ? setTimeout(() => controller.abort(), 8000) : undefined;
        try {
            const isAbsoluteUrl = /^https?:\/\//i.test(source);
            const conditional = !isAbsoluteUrl && modelsMetadataCache !== null;
            const requestInit: RequestInit = {
                signal: controller?.signal,
                headers: {
                    Accept: 'application/json',
                    ...(conditional ? { 'If-None-Match': modelsMetadataCache!.etag } : {})
                },
                cache: 'no-store'
            };
            if (isAbsoluteUrl) {
                requestInit.mode = 'cors';
            } else {
                requestInit.credentials = 'same-origin';
            }
            const response = isAbsoluteUrl ? await fetch(source, requestInit) : await runtimeFetch(source, requestInit);
            if (conditional && response.status === 304) {
                return modelsMetadataCache!.metadata;
            }
            if (!response.ok) {
                throw new Error(`Metadata request to ${source} returned status ${response.status}`);
            }
            const data = await response.json();
            const metadata = transformModelsDevResponse(data);
            if (!isAbsoluteUrl) {
                const etag = response.headers.get('etag');
                modelsMetadataCache = etag ? { etag, metadata } : null;
            }
            return metadata;
        } catch (error: unknown) {
            if ((error as Error)?.name === 'AbortError') {
                console.warn(`Model metadata request aborted (${source})`);
            } else {
                console.warn(`Failed to fetch model metadata from ${source}:`, error);
            }
        } finally {
            if (timeout) {
                clearTimeout(timeout);
            }
        }
    }
    return new Map();
};
let modelsMetadataInFlight: Promise<Map<string, ModelMetadata>> | null = null;
const MODELS_METADATA_IDLE_TIMEOUT_MS = 3_000;
const whenIdle = (): Promise<void> => new Promise(resolve => {
    if (typeof window === 'undefined') {
        resolve();
        return;
    }
    // Safari and iOS have no requestIdleCallback.
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => resolve(), {
            timeout: MODELS_METADATA_IDLE_TIMEOUT_MS
        });
    } else {
        window.setTimeout(resolve, 1_000);
    }
});
export const ensureModelsMetadataFetch = (getModelsMetadata: () => Map<string, ModelMetadata>, setModelsMetadata: (metadata: Map<string, ModelMetadata>) => void) => {
    const existing = getModelsMetadata();
    if (existing.size > 0) {
        return;
    }
    if (modelsMetadataInFlight) {
        return;
    }
    markStartupTrace('modelsMetadata:queued');
    // Model metadata (prices, limits, capabilities) only enriches the pickers
    // and usage display, so it waits until the browser is idle instead of
    // competing with startup for the network and main thread.
    modelsMetadataInFlight = whenIdle().then(() => measureStartupTrace('modelsMetadata', fetchModelsDevMetadata)).then(metadata => {
        if (metadata.size > 0) {
            markStartupTrace('modelsMetadata:set', {
                entries: metadata.size
            });
            setModelsMetadata(metadata);
        }
        return metadata;
    }).catch(() => new Map<string, ModelMetadata>()).finally(() => {
        modelsMetadataInFlight = null;
    });
};
export const createMetadataActions: ConfigSlice<"invalidateModelMetadataCache"> = (set, _get) => ({
    invalidateModelMetadataCache: () => {
        modelsMetadataInFlight = null;
        modelsMetadataCache = null;
        set({
            modelsMetadata: new Map<string, ModelMetadata>()
        });
    }
});
