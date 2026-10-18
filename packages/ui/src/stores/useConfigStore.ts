import { create } from "zustand";
import { AUTO_MODEL_ID, AUTO_PROVIDER_ID, isAutoModel } from '@/lib/routing/autoModel';
import { selectAutoReady, useRoutingStore } from '@/stores/useRoutingStore';
import type { StoreApi, UseBoundStore } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { type Config } from '@/lib/opencode/model';
import type { Agent, Model, ModelCatalog, Provider, ProviderAuthState, ProviderCatalog } from '@openchamber/agent-contract';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { canonicalClient } from '@/api/canonicalClient';
import type { DesktopSettings } from "@/lib/desktop";
import type { CatalogKind } from "@/lib/opencode/events";
import { hostFilesystem } from '@/lib/host-filesystem';

import { isSameProjectConfigError, readProjectConfigError, type ProjectConfigError } from "@/lib/opencode/configError";
import { scopeMatches, subscribeToConfigChanges } from "@/lib/configSync";
import type { ModelMetadata } from "@/types";
import { createDeferredSafeJSONStorage } from "./utils/safeStorage";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { useSelectionStore } from "@/sync/selection-store";
import { useUIStore } from "@/stores/useUIStore";
import { loadDesktopSettings, updateDesktopSettings } from "@/lib/persistence";
import { useDirectoryStore } from "@/stores/useDirectoryStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { resolveProjectForSessionDirectory } from "@/lib/projectResolution";
import { streamDebugEnabled } from "@/stores/utils/streamDebug";
import { parseModelIdentifier, parseModelSelection } from "@/lib/modelIdentifier";
import type { ModelRef } from "@/lib/settings/parsers";
import { configModelIdentifier } from "@/lib/opencode/projection";
import { runtimeFetch } from "@/lib/runtime-fetch";
import { EMPTY_VOICE_API_KEYS, fetchVoiceApiKeys, migrateLegacyVoiceApiKeys, updateVoiceApiKeys, type VoiceApiKeyKind, type VoiceApiKeyState } from "@/lib/voiceKeysApi";
import { markStartupTrace, measureStartupTrace } from "@/lib/startupTrace";
import { normalizePath } from "@/lib/pathNormalization";
import { getSyncConfig, subscribeToSyncConfigChanges } from "@/sync/sync-refs";
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from "@/lib/runtime-switch";
import { readCachedCatalog, writeCachedCatalogWhenSettled, type CachedCatalog } from "./configCatalogCache";

const isConfigModelValue = (value: unknown): value is Config["model"] => {
    if (typeof value === "string") return true;
    if (!isRecord(value)) return false;
    return typeof value.providerID === "string" && typeof value.model === "string"
        && (value.variant === undefined || typeof value.variant === "string");
};

const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_PROXY_URL = "/api/openchamber/models-metadata";

const FALLBACK_PROVIDER_ID = "opencode";
const FALLBACK_MODEL_ID = "big-pickle";
// Sentinel selectedProviderId used by the providers UI while the "Add provider"
// form is open. It is intentionally not a real provider id and must not be
// persisted as a stable provider selection.
const ADD_PROVIDER_SENTINEL = "__add_provider__";
const GIT_UTILITY_PROVIDER_ID = "zen";
const GIT_UTILITY_PREFERRED_MODEL_ID = "big-pickle";
const PROVIDER_CONFIG_REFRESH_CONCURRENCY = 4;
const PROVIDERS_RETRY_SOURCE = "loadProviders:retryAfterFailure";
const PROVIDERS_RETRY_DELAY_MS = 3000;

interface OpenChamberDefaults {
    defaultModel?: string;
    defaultVariant?: string;
    defaultAgent?: string;
    autoCreateWorktree?: boolean;
    gitmojiEnabled?: boolean;
    defaultFileViewerPreview?: boolean;
    zenModel?: string;
    messageStreamTransport?: 'auto' | 'ws' | 'sse';
    dictationEnabled?: boolean;
    sttProvider?: 'local' | 'openai-compatible';
    sttServerUrl?: string;
    sttModel?: string;
    sttLocalModel?: string;
    sttLanguage?: string;
}

// Directory activation re-reads the OpenChamber defaults, which are global,
// not per directory: one request serves the switches that land inside this
// window, and concurrent activations share the in-flight one.
const OPENCHAMBER_DEFAULTS_FRESH_MS = 15_000;
type ConfigRuntimeContext = { runtimeKey: string; generation: number };

let configRuntimeGeneration = 0;

const captureConfigRuntimeContext = (): ConfigRuntimeContext => ({
    runtimeKey: getRuntimeKey(),
    generation: configRuntimeGeneration,
});

const isConfigRuntimeContextCurrent = (context: ConfigRuntimeContext): boolean => (
    context.generation === configRuntimeGeneration && context.runtimeKey === getRuntimeKey()
);

const isSameConfigRuntimeContext = (left: ConfigRuntimeContext, right: ConfigRuntimeContext): boolean => (
    left.runtimeKey === right.runtimeKey && left.generation === right.generation
);

let openChamberDefaultsCache: {
    at: number;
    context: ConfigRuntimeContext;
    request: Promise<OpenChamberDefaults | null>;
} | null = null;
let openChamberDefaultsUserRevision = 0;

const invalidateOpenChamberDefaultsCache = (): void => {
    openChamberDefaultsCache = null;
};

const recordOpenChamberDefaultsChange = (): void => {
    openChamberDefaultsUserRevision += 1;
    invalidateOpenChamberDefaultsCache();
};

const fetchOpenChamberDefaults = (context: ConfigRuntimeContext): Promise<OpenChamberDefaults | null> => {
    const now = Date.now();
    if (
        openChamberDefaultsCache
        && isSameConfigRuntimeContext(openChamberDefaultsCache.context, context)
        && now - openChamberDefaultsCache.at < OPENCHAMBER_DEFAULTS_FRESH_MS
    ) {
        return openChamberDefaultsCache.request;
    }
    const request = requestOpenChamberDefaults(context);
    const cacheEntry = { at: now, context, request };
    openChamberDefaultsCache = cacheEntry;
    void request.then((result) => {
        // A failed settings read must not become a 15-second authoritative
        // empty result. The next directory activation should retry it.
        if (result === null && openChamberDefaultsCache === cacheEntry) {
            openChamberDefaultsCache = null;
        }
    }).catch(() => {
        if (openChamberDefaultsCache === cacheEntry) openChamberDefaultsCache = null;
    });
    return request;
};

const toOpenChamberDefaults = (data: DesktopSettings): OpenChamberDefaults => {
    const defaultModel = data.defaultModel?.trim() ?? '';
    const defaultVariant = data.defaultVariant?.trim() ?? '';
    const defaultAgent = data.defaultAgent?.trim() ?? '';
    const zenModel = data.zenModel ?? '';

    return {
        defaultModel: defaultModel.length > 0 ? defaultModel : undefined,
        defaultVariant: defaultVariant.length > 0 ? defaultVariant : undefined,
        defaultAgent: defaultAgent.length > 0 ? defaultAgent : undefined,
        autoCreateWorktree: data.autoCreateWorktree,
        gitmojiEnabled: data.gitmojiEnabled,
        defaultFileViewerPreview: data.defaultFileViewerPreview,
        zenModel: zenModel.length > 0 ? zenModel : undefined,
        messageStreamTransport: data.messageStreamTransport,
        dictationEnabled: data.dictationEnabled,
        sttProvider: data.sttProvider,
        sttServerUrl: data.sttServerUrl,
        sttModel: data.sttModel,
        sttLocalModel: data.sttLocalModel,
        sttLanguage: data.sttLanguage,
    };
};

const requestOpenChamberDefaults = async (context: ConfigRuntimeContext): Promise<OpenChamberDefaults | null> => {
    markStartupTrace('config.defaults:start');
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const finish = (source: string, result: OpenChamberDefaults | null) => {
        const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
        markStartupTrace('config.defaults:end', {
            source,
            durationMs: Math.round(ended - started),
            hasDefaultModel: Boolean(result?.defaultModel),
            hasDefaultAgent: Boolean(result?.defaultAgent),
        });
        return result;
    };
    try {
        const data = await loadDesktopSettings();
        if (!isConfigRuntimeContextCurrent(context)) {
            return finish('stale', null);
        }
        if (!data) {
            return finish('settings-unavailable', null);
        }

        return finish('settings', toOpenChamberDefaults(data));
    } catch (error) {
        markStartupTrace('config.defaults:error', { error: error instanceof Error ? error.message : String(error) });
        return finish('error', null);
    }
};

const parseModelString = (modelString: string): { providerId: string; modelId: string } | null => {
    return parseModelIdentifier(modelString);
};

const normalizeProviderId = (value: string) => value?.toLowerCase?.() ?? '';

type ProviderModel = Model;
/** Canonical providers with their workspace models grouped for picker consumers. */
type ProviderWithModelList = Provider & { models: Model[]; canonicalAuth?: ProviderAuthState };

const combineCanonicalCatalog = (
    providerCatalog: ProviderCatalog,
    modelCatalog: ModelCatalog,
): ProviderWithModelList[] => {
    const modelsByProvider = new Map<string, Model[]>();
    for (const model of modelCatalog.models) {
        if (model.enabled === false) continue;
        const bucket = modelsByProvider.get(model.provider);
        if (bucket) bucket.push(model);
        else modelsByProvider.set(model.provider, [model]);
    }
    return providerCatalog.providers
        .filter((provider) => modelsByProvider.has(provider.providerId))
        .map((provider) => ({
            ...provider,
            models: modelsByProvider.get(provider.providerId) ?? [],
            canonicalAuth: provider.auth,
        }));
};

type GitModelSelection = { providerId: string; modelId: string };
type ProviderModelSelection = { providerId: string; modelId: string; variant?: string } | null;

const sanitizePersistedSelectedProviderId = (providerId: string | undefined): string => (
    providerId === ADD_PROVIDER_SENTINEL ? "" : (providerId ?? "")
);

const normalizeOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const findProviderModel = (
    providers: ProviderWithModelList[],
    providerId: string,
    modelId: string,
): Model | undefined => providers.find((provider) => provider.providerId === providerId)?.models.find((model) => model.modelId === modelId);

const modelVariantIds = (model: Model | undefined): string[] => model?.variants.map((variant) => variant.variant) ?? [];

const modelHasVariant = (model: Model | undefined, variant: string | null | undefined): boolean => (
    typeof variant === "string" && modelVariantIds(model).includes(variant)
);

const hasProviderModel = (
    providers: ProviderWithModelList[],
    providerId: string,
    modelId: string
): boolean => {
    if (isAutoModel(providerId, modelId)) return selectAutoReady(useRoutingStore.getState());
    return findProviderModel(providers, providerId, modelId) !== undefined;
};

/**
 * An `openchamber/auto` selection that this server cannot honour. Auto is a
 * valid choice only while the server says routing is available and ready;
 * a selection saved under another build (or before the token was removed)
 * must not be kept, or the sentinel would be sent to OpenCode as a model.
 * Unknown readiness (settings or the routing state not loaded yet) keeps the
 * selection, so a real Auto choice survives startup.
 */
export const isStaleAutoSelection = (providerId?: string | null, modelId?: string | null): boolean => {
    if (!providerId || !modelId || !isAutoModel(providerId, modelId)) return false;
    if (!useConfigStore.getState().settingsDefaultsLoaded) return false;
    if (!useUIStore.getState().routingFeatureAvailable) return true;
    const routing = useRoutingStore.getState();
    return routing.loaded && !selectAutoReady(routing);
};

const resolveProviderModelSelection = ({
    providers,
    currentProviderId,
    currentModelId,
    currentVariant,
    preserveCurrent = false,
    settingsDefaultModel,
    settingsDefaultVariant,
    allowFallback,
    fallbackPrefs,
}: {
    providers: ProviderWithModelList[];
    currentProviderId?: string;
    currentModelId?: string;
    currentVariant?: string;
    preserveCurrent?: boolean;
    settingsDefaultModel?: string;
    settingsDefaultVariant?: string;
    allowFallback: boolean;
    fallbackPrefs: FallbackModelPrefs;
}): ProviderModelSelection => {
    const resolveVariant = (providerId: string, modelId: string, variant?: string): string | undefined => {
        if (!variant) {
            return undefined;
        }

        return modelHasVariant(findProviderModel(providers, providerId, modelId), variant) ? variant : undefined;
    };

    const preserveManual = preserveCurrent && !isStaleAutoSelection(currentProviderId, currentModelId);
    if (currentProviderId && currentModelId && (preserveManual || hasProviderModel(providers, currentProviderId, currentModelId))) {
        return {
            providerId: currentProviderId,
            modelId: currentModelId,
            variant: preserveCurrent ? currentVariant : resolveVariant(currentProviderId, currentModelId, currentVariant),
        };
    }

    if (settingsDefaultModel) {
        const parsed = parseModelString(settingsDefaultModel);
        if (parsed) {
            return {
                providerId: parsed.providerId,
                modelId: parsed.modelId,
                variant: hasProviderModel(providers, parsed.providerId, parsed.modelId)
                    ? resolveVariant(parsed.providerId, parsed.modelId, settingsDefaultVariant)
                    : settingsDefaultVariant,
            };
        }
    }

    if (!allowFallback) return null;
    return resolveLastSelectedModel(fallbackPrefs) ?? resolveFallbackModel(providers, fallbackPrefs.hiddenModels);
};

/** What the automatic pick reads from the user's model preferences. */
type FallbackModelPrefs = {
    hiddenModels: readonly ModelRef[];
    lastSelectedModel: string | undefined;
};

const readFallbackModelPrefs = (): FallbackModelPrefs => {
    const { hiddenModels, lastSelectedModel } = useUIStore.getState();
    return { hiddenModels, lastSelectedModel };
};

const isModelHidden = (hiddenModels: readonly ModelRef[], providerId: string, modelId: string): boolean => hiddenModels.some(
    (hidden) => hidden.providerID === providerId && hidden.modelID === modelId,
);

// The model last picked in a chat composer, once nothing configured names one.
// Like a configured default it survives catalog gaps: a provider that has not
// registered yet must not move a new session onto Big Pickle. A model hidden
// since, or an Auto pick this server cannot honour, is skipped.
const resolveLastSelectedModel = (
    { hiddenModels, lastSelectedModel }: FallbackModelPrefs,
): { providerId: string; modelId: string } | null => {
    const parsed = lastSelectedModel ? parseModelString(lastSelectedModel) : null;
    if (!parsed) return null;
    if (isModelHidden(hiddenModels, parsed.providerId, parsed.modelId)) return null;
    if (isStaleAutoSelection(parsed.providerId, parsed.modelId)) return null;
    return parsed;
};

// The pick when nothing is configured or remembered: Big Pickle, else the first
// model. A model the user hid in the picker is skipped; configured defaults never
// come through here, so they stay honoured even when hidden. With every model
// hidden the conversation still needs one to send with, so the unfiltered pick stands.
const resolveFallbackModel = (
    providers: ProviderWithModelList[],
    hiddenModels: readonly ModelRef[],
): { providerId: string; modelId: string } | null => {
    const isVisible = (providerId: string, modelId: string) => !isModelHidden(hiddenModels, providerId, modelId);

    const hasBigPickle = hasProviderModel(providers, FALLBACK_PROVIDER_ID, FALLBACK_MODEL_ID);
    if (hasBigPickle && isVisible(FALLBACK_PROVIDER_ID, FALLBACK_MODEL_ID)) {
        return { providerId: FALLBACK_PROVIDER_ID, modelId: FALLBACK_MODEL_ID };
    }
    for (const provider of providers) {
        const visibleModel = provider.models.find((model) => isVisible(provider.providerId, model.modelId));
        if (visibleModel) {
            return { providerId: provider.providerId, modelId: visibleModel.modelId };
        }
    }

    if (hasBigPickle) {
        return { providerId: FALLBACK_PROVIDER_ID, modelId: FALLBACK_MODEL_ID };
    }
    const firstProvider = providers[0];
    const firstModel = firstProvider?.models[0];
    if (firstProvider && firstModel) {
        return { providerId: firstProvider.providerId, modelId: firstModel.modelId };
    }
    return null;
};

type DefaultAgentModelSelection = {
    agentName: string | undefined;
    providerId?: string;
    modelId?: string;
    variant?: string;
};

// Project and Host preferences outrank the native profile model binding.
// Discovery gaps preserve configured identifiers instead of choosing another model.
const resolveDefaultAgentModelSelection = ({
    agents,
    providers,
    projectDefaultAgent,
    projectDefaultModel,
    projectDefaultVariant,
    settingsDefaultAgent,
    settingsDefaultModel,
    settingsDefaultVariant,
    opencodeDefaultModel,
    allowFallback = true,
    fallbackPrefs,
}: {
    agents: Agent[];
    providers: ProviderWithModelList[];
    projectDefaultAgent?: string;
    projectDefaultModel?: string;
    projectDefaultVariant?: string;
    settingsDefaultAgent?: string;
    settingsDefaultModel?: string;
    settingsDefaultVariant?: string;
    opencodeDefaultModel?: string;
    allowFallback?: boolean;
    fallbackPrefs: FallbackModelPrefs;
}): DefaultAgentModelSelection => {
    const resolveVariant = (providerId: string, modelId: string, variant?: string): string | undefined => {
        if (!variant) {
            return undefined;
        }
        return modelHasVariant(findProviderModel(providers, providerId, modelId), variant) ? variant : undefined;
    };

    const resolvedAgent = agents.find((agent) => agent.agentId === projectDefaultAgent)
        ?? agents.find((agent) => agent.agentId === settingsDefaultAgent)
        ?? agents[0];
    // --- Model cascade ---
    let providerId: string | undefined;
    let modelId: string | undefined;
    let variant: string | undefined;

    const effectiveDefaultModel = projectDefaultModel || settingsDefaultModel;

    if (effectiveDefaultModel) {
        const parsed = parseModelString(effectiveDefaultModel);
        if (parsed) {
            providerId = parsed.providerId;
            modelId = parsed.modelId;
            // A project default carries its own variant; the settings variant
            // belongs to the settings model and must not leak onto it.
            const configuredVariant = projectDefaultModel ? projectDefaultVariant : settingsDefaultVariant;
            variant = hasProviderModel(providers, providerId, modelId)
                ? resolveVariant(providerId, modelId, configuredVariant)
                : configuredVariant;
        }
    }

    if (providerId || !allowFallback) {
        return { agentName: resolvedAgent?.agentId ?? projectDefaultAgent ?? settingsDefaultAgent, providerId, modelId, variant };
    }

    if (!providerId && resolvedAgent?.model) {
        providerId = resolvedAgent.model.providerId;
        modelId = resolvedAgent.model.modelId;
        variant = hasProviderModel(providers, providerId, modelId)
            ? resolveVariant(providerId, modelId)
            : undefined;
    }

    // OpenCode's global default model — used when neither our settings nor the agent pin a model.
    if (!providerId && opencodeDefaultModel) {
        const modelRef = parseModelSelection(opencodeDefaultModel);
        if (modelRef) {
            // OpenCode config/session model refs retain the legacy providerID/modelID keys.
            providerId = modelRef.providerID;
            modelId = modelRef.modelID;
            variant = hasProviderModel(providers, providerId, modelId)
                ? resolveVariant(providerId, modelId, modelRef.variant)
                : modelRef.variant;
        }
    }

    if (!providerId) {
        const fallback = resolveLastSelectedModel(fallbackPrefs) ?? resolveFallbackModel(providers, fallbackPrefs.hiddenModels);
        providerId = fallback?.providerId;
        modelId = fallback?.modelId;
    }

    return { agentName: resolvedAgent?.agentId, providerId, modelId, variant };
};

const resolveGitGenerationModelSelection = ({
    providers,
    settingsZenModel,
}: {
    providers: ProviderWithModelList[];
    settingsZenModel?: string;
}): GitModelSelection | null => {
    const zenModel = normalizeOptionalString(settingsZenModel);

    if (!Array.isArray(providers) || providers.length === 0) {
        if (zenModel) {
            return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: zenModel };
        }
        return null;
    }

    if (zenModel && hasProviderModel(providers, GIT_UTILITY_PROVIDER_ID, zenModel)) {
        return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: zenModel };
    }

    if (hasProviderModel(providers, GIT_UTILITY_PROVIDER_ID, GIT_UTILITY_PREFERRED_MODEL_ID)) {
        return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: GIT_UTILITY_PREFERRED_MODEL_ID };
    }

    const zenProvider = providers.find((provider) => provider.providerId === GIT_UTILITY_PROVIDER_ID);
    if (zenProvider?.models.length) {
        const randomIndex = Math.floor(Math.random() * zenProvider.models.length);
        const randomModelId = normalizeOptionalString(zenProvider.models[randomIndex]?.modelId);
        if (randomModelId) {
            return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: randomModelId };
        }
    }

    return null;
};

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");

const isModelsDevModelEntry = (value: unknown): value is ModelsDevModelEntry => {
    if (!isRecord(value)) {
        return false;
    }
    const candidate = value as ModelsDevModelEntry;
    if (candidate.modalities) {
        const { input, output } = candidate.modalities;
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

const buildModelMetadataKey = (providerId: string, modelId: string) => {
    const normalizedProvider = normalizeProviderId(providerId);
    if (!normalizedProvider || !modelId) {
        return '';
    }
    return `${normalizedProvider}/${modelId}`;
};

/** Fallback metadata for models models.dev does not list. */
const deriveModelMetadata = (providerId: string, model: ProviderModel): ModelMetadata => ({
    id: model.modelId,
    providerId,
    name: model.name,
    tool_call: model.toolsSupported,
    attachment: model.modalities.includes('image'),
    reasoning: model.reasoningEffortSupported,
    modalities: { input: model.modalities, output: model.modalities },
    cost: model.pricing ? {
        input: model.pricing.inputPerMillionTokens,
        output: model.pricing.outputPerMillionTokens,
        cache_read: model.pricing.cacheReadPerMillionTokens ?? 0,
        cache_write: model.pricing.cacheWritePerMillionTokens ?? 0,
    } : undefined,
    limit: { context: model.contextWindow, output: model.maxOutputTokens },
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

            const resolvedModelId =
                typeof modelKey === 'string' && modelKey.length > 0
                    ? modelKey
                    : modelValue.id;

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
                structured_output:
                    typeof modelValue.structured_output === 'boolean' ? modelValue.structured_output : undefined,
                modalities: modelValue.modalities
                    ? {
                          input: isStringArray(modelValue.modalities.input) ? modelValue.modalities.input : undefined,
                          output: isStringArray(modelValue.modalities.output) ? modelValue.modalities.output : undefined,
                      }
                    : undefined,
                cost: modelValue.cost,
                limit: modelValue.limit,
                knowledge: typeof modelValue.knowledge === 'string' ? modelValue.knowledge : undefined,
                release_date: typeof modelValue.release_date === 'string' ? modelValue.release_date : undefined,
                last_updated: typeof modelValue.last_updated === 'string' ? modelValue.last_updated : undefined,
            };

            const key = buildModelMetadataKey(providerId, resolvedModelId);
            if (key) {
                metadataMap.set(key, metadata);
            }
        }
    }

    return metadataMap;
};

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
            const requestInit: RequestInit = {
                signal: controller?.signal,
                headers: {
                    Accept: 'application/json',
                },
                cache: 'no-store',
            };

            if (isAbsoluteUrl) {
                requestInit.mode = 'cors';
            } else {
                requestInit.credentials = 'same-origin';
            }

            const response = isAbsoluteUrl
                ? await fetch(source, requestInit)
                : await runtimeFetch(source, requestInit);

            if (!response.ok) {
                throw new Error(`Metadata request to ${source} returned status ${response.status}`);
            }

            const data = await response.json();
            return transformModelsDevResponse(data);
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

const whenIdle = (): Promise<void> => new Promise((resolve) => {
    if (typeof window === 'undefined') {
        resolve();
        return;
    }
    // Safari and iOS have no requestIdleCallback.
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => resolve(), { timeout: MODELS_METADATA_IDLE_TIMEOUT_MS });
    } else {
        window.setTimeout(resolve, 1_000);
    }
});

const ensureModelsMetadataFetch = (
    getModelsMetadata: () => Map<string, ModelMetadata>,
    setModelsMetadata: (metadata: Map<string, ModelMetadata>) => void,
) => {
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
    modelsMetadataInFlight = whenIdle()
        .then(() => measureStartupTrace('modelsMetadata', fetchModelsDevMetadata))
        .then((metadata) => {
            if (metadata.size > 0) {
                markStartupTrace('modelsMetadata:set', { entries: metadata.size });
                setModelsMetadata(metadata);
            }
            return metadata;
        })
        .catch(() => new Map<string, ModelMetadata>())
        .finally(() => {
            modelsMetadataInFlight = null;
        });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CONNECTION_PROBE_TIMEOUT_MS = 800;
// The Agent Service readiness route can wait for the supervised worker to settle.
const CONNECTION_HEALTH_WAIT_MS = 3_000;
type AgentServiceReadiness = 'ready' | 'unavailable' | 'unreachable';

const probeAgentServiceReadiness = async (timeoutMs = CONNECTION_PROBE_TIMEOUT_MS): Promise<AgentServiceReadiness> => {
    return Promise.race([
        canonicalClient.checkReady().then((ready) => ready ? 'ready' : 'unavailable').catch(() => 'unreachable' as const),
        sleep(Math.max(1, timeoutMs)).then(() => 'unreachable' as const),
    ]);
};
const DIRECTORY_KEY_GLOBAL = "__global__";

const toDirectoryKey = (directory: string | null | undefined): string => {
    const trimmed = typeof directory === 'string' ? directory.trim() : '';
    return trimmed.length > 0 ? trimmed : DIRECTORY_KEY_GLOBAL;
};

const fromDirectoryKey = (key: string): string | null => (key === DIRECTORY_KEY_GLOBAL ? null : key);

const resolveInitialDirectoryKey = (): string => {
    if (typeof window === 'undefined') {
        return DIRECTORY_KEY_GLOBAL;
    }

    const directory = hostFilesystem.getDirectory() ?? useDirectoryStore.getState().currentDirectory;
    return toConfigDirectoryKey(directory);
};

// Persisted worktree→project mapping for project-level defaults. Config catalogs
// themselves are scoped to the worktree's own directory.
const WORKTREE_PROJECT_MAP_KEY = 'oc.worktreeProjectMap.v2';
const LEGACY_WORKTREE_PROJECT_MAP_KEY = 'oc.worktreeProjectMap';
const MAX_WORKTREE_PROJECT_RUNTIME_MAPS = 8;
type WorktreeProjectMapEnvelope = {
    version: 2;
    legacyClaimed: boolean;
    runtimes: Record<string, { updatedAt: number; entries: Record<string, string> }>;
};
const _worktreeProjectMaps = new Map<string, Record<string, string>>();
const readWorktreeProjectEnvelope = (): WorktreeProjectMapEnvelope => {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(WORKTREE_PROJECT_MAP_KEY) : null;
        if (!raw) return { version: 2, legacyClaimed: false, runtimes: {} };
        const parsed = JSON.parse(raw) as Partial<WorktreeProjectMapEnvelope>;
        if (parsed.version !== 2 || !parsed.runtimes || typeof parsed.runtimes !== 'object') {
            return { version: 2, legacyClaimed: false, runtimes: {} };
        }
        return { version: 2, legacyClaimed: parsed.legacyClaimed === true, runtimes: parsed.runtimes };
    } catch {
        return { version: 2, legacyClaimed: false, runtimes: {} };
    }
};
const writeWorktreeProjectEnvelope = (envelope: WorktreeProjectMapEnvelope): void => {
    const runtimes = Object.fromEntries(
        Object.entries(envelope.runtimes)
            .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
            .slice(0, MAX_WORKTREE_PROJECT_RUNTIME_MAPS),
    );
    localStorage.setItem(WORKTREE_PROJECT_MAP_KEY, JSON.stringify({ ...envelope, runtimes }));
};
const getWorktreeProjectMap = (): Record<string, string> => {
    const runtimeKey = getRuntimeKey() || 'default';
    const existing = _worktreeProjectMaps.get(runtimeKey);
    if (existing) return existing;
    const envelope = readWorktreeProjectEnvelope();
    let map = envelope.runtimes[runtimeKey]?.entries ?? null;
    if (!map && !envelope.legacyClaimed) {
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_WORKTREE_PROJECT_MAP_KEY) : null;
            map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
            envelope.legacyClaimed = true;
            envelope.runtimes[runtimeKey] = { updatedAt: Date.now(), entries: map };
            writeWorktreeProjectEnvelope(envelope);
            localStorage.removeItem(LEGACY_WORKTREE_PROJECT_MAP_KEY);
        } catch {
            map = {};
        }
    }
    const result = map ?? {};
    _worktreeProjectMaps.set(runtimeKey, result);
    return result;
};
const rememberWorktreeProject = (worktree: string, project: string): void => {
    if (!worktree || !project || worktree === project) return;
    const map = getWorktreeProjectMap();
    if (map[worktree] === project) return;
    map[worktree] = project;
    try {
        const runtimeKey = getRuntimeKey() || 'default';
        const envelope = readWorktreeProjectEnvelope();
        envelope.legacyClaimed = true;
        envelope.runtimes[runtimeKey] = { updatedAt: Date.now(), entries: map };
        writeWorktreeProjectEnvelope(envelope);
        localStorage.removeItem(LEGACY_WORKTREE_PROJECT_MAP_KEY);
    } catch {
        // localStorage quota exceeded — ignore; live resolution still works.
    }
};

const normalizeConfigPath = (value: string | null | undefined): string | null => {
    const result = normalizePath(value);
    if (result === null) return null;
    return result || '/';
};

const getKnownProjectDirectories = (): string[] => {
    try {
        return useProjectsStore.getState().projects
            .map((project) => normalizeConfigPath(project.path))
            .filter((path): path is string => Boolean(path));
    } catch {
        return [];
    }
};

const getFallbackProjectDirectory = (): string | null => {
    try {
        const { projects, activeProjectId } = useProjectsStore.getState();
        const active = activeProjectId
            ? projects.find((project) => project.id === activeProjectId)
            : null;
        return normalizeConfigPath(active?.path ?? projects[0]?.path ?? null);
    } catch {
        return null;
    }
};

const getProjectDefaultsForConfigDirectory = (directory: string | null | undefined) => {
    const configDirectory = normalizeConfigPath(directory);
    if (!configDirectory) {
        return {};
    }
    const session = useSessionUIStore.getState();
    if (!session.currentSessionId && session.newSessionDraft?.open && session.newSessionDraft.target === 'chat'
        && toDirectoryKey(configDirectory) === useConfigStore.getState().activeDirectoryKey) return {};
    const projectDirectory = resolveProjectDirectory(configDirectory);
    const project = useProjectsStore.getState().projects.find((entry) => normalizeConfigPath(entry.path) === projectDirectory);
    return {
        projectDefaultAgent: normalizeOptionalString(project?.defaultAgent),
        projectDefaultModel: normalizeOptionalString(project?.defaultModel),
        projectDefaultVariant: normalizeOptionalString(project?.defaultVariant),
    };
};

const resolveProjectDirectory = (directory: string | null | undefined): string | null => {
    const dir = normalizeConfigPath(directory);
    const projects = getKnownProjectDirectories();
    if (!dir) return null;
    if (projects.includes(dir)) return dir;

    // 1. Persisted mapping — resolves synchronously when the async worktree
    //    discovery has not populated the runtime map yet.
    const cached = normalizeConfigPath(getWorktreeProjectMap()[dir]);
    if (cached) return cached;
    // 2. Live resolution via projects + discovered worktree map; cache the hit.
    try {
        const project = resolveProjectForSessionDirectory(
            useProjectsStore.getState().projects,
            useSessionUIStore.getState().availableWorktreesByProject,
            dir,
        );
        const projectPath = normalizeConfigPath(project?.path ?? null);
        if (projectPath && projectPath !== dir) {
            rememberWorktreeProject(dir, projectPath);
            return projectPath;
        }
    } catch { /* The cached mapping, if any, was checked above. */ }
    return null;
};

const resolveConfigDirectory = normalizeConfigPath;

const toConfigDirectoryKey = (directory: string | null | undefined): string =>
    toDirectoryKey(resolveConfigDirectory(directory));

// Runtime freshness tracking (NOT persisted) for the stale-while-revalidate
// background refresh, keyed by config-directory key. Prevents re-fetching
// catalogs we just loaded for the same project or worktree.
const _providersLoadedAt = new Map<string, number>();
const CONFIG_REFRESH_TTL_MS = 30_000;

// OpenCode announces a rebuilt catalog for the directory it rebuilt, and only
// the active directory is re-read at once. Any other directory is marked stale
// so returning to it re-reads instead of trusting its snapshot: a worktree left
// while OpenCode was still starting it holds a provider list from before its
// plugin providers registered. A load that began before the mark must not make
// the directory fresh again, so marks carry a revision and loads capture one.
const ALL_DIRECTORIES = '*';
let _catalogRevision = 0;
const _providersStaleAt = new Map<string, number>();

const markCatalogStale = (loadedAt: Map<string, number>, staleAt: Map<string, number>, directoryKey: string | null): void => {
    _catalogRevision += 1;
    if (directoryKey === null) {
        loadedAt.clear();
        staleAt.set(ALL_DIRECTORIES, _catalogRevision);
        return;
    }
    loadedAt.delete(directoryKey);
    staleAt.set(directoryKey, _catalogRevision);
};

/** True when a catalog event for the directory landed after a load began at `loadRevision`. */
const isCatalogStaleSince = (staleAt: Map<string, number>, directoryKey: string, loadRevision: number): boolean =>
    Math.max(staleAt.get(directoryKey) ?? 0, staleAt.get(ALL_DIRECTORIES) ?? 0) > loadRevision;

const markCatalogLoaded = (
    loadedAt: Map<string, number>,
    staleAt: Map<string, number>,
    directoryKey: string,
    loadRevision: number,
): void => {
    if (isCatalogStaleSince(staleAt, directoryKey, loadRevision)) return;
    loadedAt.set(directoryKey, Date.now());
};

/**
 * Called for every catalog event with the directory it names (`null` for a
 * server-wide one such as a credential change).
 */
export const markConfigCatalogStale = (kind: CatalogKind, directory: string | null): void => {
    const directoryKey = directory ? toConfigDirectoryKey(directory) : null;
    if (kind === 'provider' || kind === 'model' || kind === 'credential' || kind === 'config') {
        markCatalogStale(_providersLoadedAt, _providersStaleAt, directoryKey);
    }
};
const getConfigLoadKey = (context: ConfigRuntimeContext, directoryKey: string): string => (
    JSON.stringify([context.generation, context.runtimeKey, directoryKey])
);

const CATALOG_CACHE_RECHECK_SOURCE = 'catalogCacheRecheck';
/** Persists settled canonical provider/model catalogs. */
const persistLoadedCatalog = (
    context: ConfigRuntimeContext,
    directoryKey: string,
    source: string,
    update: CachedCatalog,
    isEmpty: boolean,
    staleAt: Map<string, number>,
    loadRevision: number,
): void => {
    if (directoryKey === DIRECTORY_KEY_GLOBAL) return;
    if (isEmpty && source !== CATALOG_CACHE_RECHECK_SOURCE) return;
    writeCachedCatalogWhenSettled(context.runtimeKey, directoryKey, update, () => (
        !isConfigRuntimeContextCurrent(context) || isCatalogStaleSince(staleAt, directoryKey, loadRevision)
    ));
};

/** Shows cached canonical models while the live workspace request starts. */
const hydrateConfigCatalogFromCache = async (directoryKey: string): Promise<void> => {
    if (directoryKey === DIRECTORY_KEY_GLOBAL) return;
    const context = captureConfigRuntimeContext();
    const cached = await readCachedCatalog(context.runtimeKey, directoryKey);
    if (!cached || !isConfigRuntimeContextCurrent(context)) return;
    useConfigStore.setState((state) => {
        const snapshot = state.directoryScoped[directoryKey] ?? createEmptyDirectoryScopedConfig();
        const isActive = state.activeDirectoryKey === directoryKey;
        const providersLive = snapshot.providersLoaded === true || snapshot.providers.length > 0 || (isActive && (state.providersLoaded || state.providers.length > 0));
        const providers = !providersLive && cached.providers?.length ? cached.providers : null;
        if (!providers) return state;
        const nextSnapshot = { ...snapshot, providers };
        return {
            directoryScoped: { ...state.directoryScoped, [directoryKey]: nextSnapshot },
            ...(isActive ? { providers } : {}),
        };
    });
};


const clearProjectConfigError = (directoryKey: string): void => {
    if (!useConfigStore.getState().projectConfigErrors[directoryKey]) return;
    useConfigStore.setState((state) => {
        const next = { ...state.projectConfigErrors };
        delete next[directoryKey];
        return { projectConfigErrors: next };
    });
};

subscribeRuntimeEndpointChanged((detail) => {
    configRuntimeGeneration += 1;
    invalidateOpenChamberDefaultsCache();
    _providersLoadedAt.clear();
    _providersStaleAt.clear();
    _inFlightProviders.clear();
    _initializeAppInFlight = null;
    if (detail.runtimeKey === detail.previousRuntimeKey) return;
    useConfigStore.setState({
        configRuntimeKey: detail.runtimeKey,
        directoryScoped: {},
        projectConfigErrors: {},
        lastInitFailure: null,
        providers: [],
        providersLoaded: false,
        currentProviderId: '',
        currentModelId: '',
        currentAgentName: undefined,
        currentVariant: undefined,
        currentVariantSelection: { override: undefined, inherited: undefined },
        selectedProviderId: '',
        agentModelSelections: {},
        defaultProviders: {},
        opencodeDefaultModel: undefined,
        settingsDefaultModel: undefined,
        settingsDefaultVariant: undefined,
        settingsDefaultAgent: undefined,
        settingsDefaultsLoaded: false,
        settingsZenModel: undefined,
        selectionSource: 'auto',
        agentSelectionSource: 'auto',
        isInitialized: false,
        isConnected: false,
    });
});

const isConfigFresh = (loadedAt: Map<string, number>, key: string): boolean => {
    const at = loadedAt.get(key);
    return typeof at === 'number' && Date.now() - at < CONFIG_REFRESH_TTL_MS;
};

interface DirectoryScopedConfig {
    providersLoaded?: boolean;

    providers: ProviderWithModelList[];
    currentProviderId: string;
    currentModelId: string;
    currentVariant?: string | undefined;
    currentVariantSelection?: CurrentVariantSelection;
    currentAgentName: string | undefined;
    selectedProviderId: string;
    agentModelSelections: { [agentName: string]: { providerId: string; modelId: string } };
    defaultProviders: { [key: string]: string };
    opencodeDefaultModel?: string;
    selectionSource?: "auto" | "manual";
    // Whether the current agent was chosen for this chat (`setAgent`) rather
    // than resolved from defaults. Separate from `selectionSource`, which is
    // about the model: an agent pick keeps an inherited model inherited.
    agentSelectionSource?: "auto" | "manual";
}

/**
 * The thinking-effort selection, split into what the user picked and what
 * applies when they picked nothing:
 *
 * - `override: string`    an effort chosen in the picker
 * - `override: null`      "Default" chosen in the picker — send no effort
 * - `override: undefined` nothing chosen — the inherited default applies
 *
 * `null` and `undefined` are not interchangeable: collapsing them makes the
 * "Default" entry unpickable, because the settings default silently takes
 * effect again and the next assistant reply echoes it back as an explicit
 * choice.
 */
type CurrentVariantSelection = {
    override: string | null | undefined;
    inherited: string | undefined;
};

const resolveVariantFromSelection = (selection: CurrentVariantSelection): string | undefined => (
    selection.override === null ? undefined : selection.override ?? selection.inherited
);

const hasCompatibleCachedVariants = (providers: ProviderWithModelList[] | undefined): boolean => (
    Array.isArray(providers) && providers.every((provider) => (
        isRecord(provider)
        && Array.isArray(provider.models)
        && provider.models.every((model) => (
            isRecord(model)
            && Array.isArray(model.variants)
            && model.variants.every(isRecord)
        ))
    ))
);

/**
 * The effort the next send carries after a loader resolved `resolved` for the
 * model: a pick kept in `selection` wins. Loaders that kept the pick in
 * `currentVariantSelection` but wrote the resolved default to `currentVariant`
 * showed one effort in the picker and sent another.
 */
const variantAfterResolve = (selection: CurrentVariantSelection | undefined, resolved: string | undefined): string | undefined => (
    selection?.override === undefined ? resolved : resolveVariantFromSelection(selection)
);

/**
 * Lift the active directory's snapshot into the top-level fields the pickers
 * read (`providers` and selections). Persisted snapshots carry no
 * catalogs, so this restores selections; a blob from before that change still
 * has catalogs, and those paint instantly. Falls back to whatever top-level
 * data was persisted; handles legacy blobs that only stored directoryScoped.
 */
const hydrateActiveDirectorySnapshot = <T extends Partial<ConfigStore>>(merged: T): T => {
    const directoryScoped = merged.directoryScoped;
    const activeKey = merged.activeDirectoryKey;
    if (!directoryScoped || !activeKey) return merged;
    const snapshot = directoryScoped[activeKey];
    if (!snapshot) return merged;

    const next: Partial<ConfigStore> = { ...merged };
    if ((!merged.providers || merged.providers.length === 0) && snapshot.providers?.length) {
        next.providers = snapshot.providers;
    }
    if (!merged.defaultProviders || Object.keys(merged.defaultProviders).length === 0) {
        if (snapshot.defaultProviders && Object.keys(snapshot.defaultProviders).length > 0) {
            next.defaultProviders = snapshot.defaultProviders;
        }
    }
    if (snapshot.opencodeDefaultModel !== undefined) {
        next.opencodeDefaultModel = snapshot.opencodeDefaultModel;
    }
    if (snapshot.selectionSource) {
        next.selectionSource = snapshot.selectionSource;
    }
    if (snapshot.agentSelectionSource) {
        next.agentSelectionSource = snapshot.agentSelectionSource;
    }
    return next as T;
};

/** A directory snapshot as persisted: its selections, without the catalogs. */
const toPersistedDirectorySnapshot = (snapshot: DirectoryScopedConfig) => {
    const { providers: _providers, providersLoaded: _providersLoaded, ...selection } = snapshot;
    void _providers;
    void _providersLoaded;
    return {
        ...selection,
        selectedProviderId: sanitizePersistedSelectedProviderId(snapshot.selectedProviderId),
    };
};

const SELECTION_FIELDS = ["currentProviderId", "currentModelId", "currentAgentName", "selectionSource", "agentSelectionSource"] as const;
type SelectionField = typeof SELECTION_FIELDS[number];

/**
 * Whether writing `next` would leave both the top-level selection and the
 * active directory's snapshot as they are. The persist middleware writes the
 * whole store after every `set()`, even one whose updater returns the same
 * state. A setter checks for a change before it calls `set()` to avoid an
 * unnecessary durable write. A missing snapshot is a change: the write would create it.
 */
const isUnchangedSelection = (
    state: Pick<ConfigStore, "activeDirectoryKey" | "directoryScoped" | SelectionField>,
    next: Partial<Pick<DirectoryScopedConfig, SelectionField>>,
): boolean => {
    const snapshot = state.directoryScoped[state.activeDirectoryKey];
    if (!snapshot) return false;
    return SELECTION_FIELDS.every((field) => !(field in next) || (next[field] === state[field] && next[field] === snapshot[field]));
};

const createEmptyDirectoryScopedConfig = (
    providers: ProviderWithModelList[] = [],
): DirectoryScopedConfig => ({
    providers,
    currentProviderId: "",
    currentModelId: "",
    currentVariant: undefined,
    currentAgentName: undefined,
    selectedProviderId: "",
    agentModelSelections: {},
    defaultProviders: {},
    opencodeDefaultModel: undefined,
    selectionSource: "auto",
    agentSelectionSource: "auto",
});

const resolveSelectionWithManualGuard = ({
    currentAgentName,
    currentProviderId,
    currentModelId,
    currentVariant,
    selectionSource,
    agentSelectionSource,
    resolvedAgentName,
    resolvedProviderId,
    resolvedModelId,
    resolvedVariant,
}: {
    currentAgentName: string | undefined;
    currentProviderId: string;
    currentModelId: string;
    currentVariant: string | undefined;
    selectionSource: "auto" | "manual";
    agentSelectionSource: "auto" | "manual";
    resolvedAgentName: string | undefined;
    resolvedProviderId: string | undefined;
    resolvedModelId: string | undefined;
    resolvedVariant: string | undefined;
}) => {
    const manualAgentName = currentAgentName;
    const manualModelValid = !!currentProviderId
        && !!currentModelId;
    // A picked agent protects the model `setAgent` resolved for it as well:
    // the defaults cascade resolves a model for the default agent, not this one.
    const userOwnsSelection = selectionSource === "manual" || (agentSelectionSource === "manual" && !!manualAgentName);
    const preserveManual = userOwnsSelection && (!!manualAgentName || manualModelValid);

    return {
        agentName: preserveManual ? (manualAgentName ?? resolvedAgentName) : resolvedAgentName,
        providerId: preserveManual && manualModelValid ? currentProviderId : resolvedProviderId,
        modelId: preserveManual && manualModelValid ? currentModelId : resolvedModelId,
        variant: preserveManual && manualModelValid ? currentVariant : resolvedVariant,
        selectionSource: preserveManual && selectionSource === "manual" ? "manual" as const : "auto" as const,
    };
};

interface ConfigStore {

    activeDirectoryKey: string;
    directoryScoped: Record<string, DirectoryScopedConfig>;
    configRuntimeKey: string;

    providers: ProviderWithModelList[];
    providersLoaded: boolean;
    currentProviderId: string;
    currentModelId: string;
    currentVariant: string | undefined;
    currentVariantSelection: CurrentVariantSelection;
    currentAgentName: string | undefined;
    selectedProviderId: string;
    agentModelSelections: { [agentName: string]: { providerId: string; modelId: string } };
    defaultProviders: { [key: string]: string };
    selectionSource: "auto" | "manual";
    agentSelectionSource: "auto" | "manual";
    isConnected: boolean;
    hasEverConnected: boolean;
    connectionPhase: "connecting" | "connected" | "reconnecting";
    lastDisconnectReason: string | null;
    /** Why the last initializeApp attempt did not finish. Runtime-only; cleared on success. */
    lastInitFailure: InitFailure | null;
    /** Projects whose OpenCode config OpenCode refused to load, keyed by config-directory key. Runtime-only. */
    projectConfigErrors: Record<string, ProjectConfigError>;
    isInitialized: boolean;
    modelsMetadata: Map<string, ModelMetadata>;
    // OpenChamber settings-based defaults (take precedence over agent preferences)
    settingsDefaultModel: string | undefined; // format: "provider/model"
    settingsDefaultsLoaded: boolean;
    settingsDefaultVariant: string | undefined;
    settingsDefaultAgent: string | undefined;
    // OpenCode server's own global `model` config field ("provider/model"), used as a fallback
    // when neither our settingsDefaultModel nor the resolved agent pins a model.
    opencodeDefaultModel: string | undefined;
    settingsAutoCreateWorktree: boolean;
    settingsGitmojiEnabled: boolean;
    settingsDefaultFileViewerPreview: boolean;
    settingsZenModel: string | undefined;
    settingsMessageStreamTransport: 'auto' | 'ws' | 'sse';
    // Voice provider preference ('browser', 'openai', 'openai-compatible', or 'say' for macOS)
    voiceProvider: 'browser' | 'local' | 'openai' | 'openai-compatible' | 'say';
    setVoiceProvider: (provider: 'browser' | 'local' | 'openai' | 'openai-compatible' | 'say') => void;
    // TTS settings
    speechRate: number;
    speechPitch: number;
    speechVolume: number;
    sayVoice: string;
    browserVoice: string;
    localTtsVoiceId: number;
    /** Local TTS model the chosen voice belongs to (catalog id). */
    localTtsModelId: string;
    /** Local and macOS voices follow the language of the text being read. */
    ttsFollowTextLanguage: boolean;
    openaiVoice: string;
    /** Which voice API keys the server holds; the keys never reach the browser. */
    voiceApiKeys: VoiceApiKeyState;
    openaiCompatibleUrl: string;
    openaiCompatibleVoice: string;
    openaiCompatibleTtsModel: string;
    // STT (dictation) settings
    dictationEnabled: boolean;
    sttProvider: 'local' | 'openai-compatible';
    sttServerUrl: string;
    sttModel: string;
    sttLocalModel: string;
    sttLanguage: string;
    showMessageTTSButtons: boolean;
    ttsInputMode: 'sanitized' | 'raw' | 'summarized';
    ttsChunkedMode: boolean;
    // Summarization settings
    summarizeMessageTTS: boolean;
    summarizeVoiceConversation: boolean;
    summarizeCharacterThreshold: number;
    summarizeMaxLength: number;
    setSpeechRate: (rate: number) => void;
    setSpeechPitch: (pitch: number) => void;
    setSpeechVolume: (volume: number) => void;
    setSayVoice: (voice: string) => void;
    setBrowserVoice: (voice: string) => void;
    setLocalTtsVoiceId: (voiceId: number) => void;
    setLocalTtsModelId: (modelId: string) => void;
    setTtsFollowTextLanguage: (enabled: boolean) => void;
    setOpenaiVoice: (voice: string) => void;
    /** Store (string) or remove (null) one voice key on the server. Resolves false when the server refused. */
    setVoiceApiKey: (kind: VoiceApiKeyKind, apiKey: string | null) => Promise<boolean>;
    /**
     * Read which keys the server holds, moving any a previous build left in
     * the browser first. Once per runtime unless `force` (the Settings page).
     */
    refreshVoiceApiKeys: (options?: { force?: boolean }) => Promise<void>;
    setOpenaiCompatibleUrl: (url: string) => void;
    setOpenaiCompatibleVoice: (voice: string) => void;
    setOpenaiCompatibleTtsModel: (model: string) => void;
    setDictationEnabled: (enabled: boolean) => void;
    setSttProvider: (provider: 'local' | 'openai-compatible') => void;
    setSttServerUrl: (url: string) => void;
    setSttModel: (model: string) => void;
    setSttLocalModel: (model: string) => void;
    setSttLanguage: (lang: string) => void;
    setShowMessageTTSButtons: (show: boolean) => void;
    setTtsInputMode: (mode: 'sanitized' | 'raw' | 'summarized') => void;
    setTtsChunkedMode: (enabled: boolean) => void;
    setSummarizeMessageTTS: (enabled: boolean) => void;
    setSummarizeVoiceConversation: (enabled: boolean) => void;
    setSummarizeCharacterThreshold: (threshold: number) => void;
    setSummarizeMaxLength: (maxLength: number) => void;

    activateDirectory: (directory: string | null | undefined, options?: { preserveManualModel?: boolean }) => Promise<void>;

    /** `fresh`: a request already in flight started before the caller's reason to reload, so it cannot answer it. */
    loadProviders: (options?: { directory?: string | null; source?: string; fresh?: boolean }) => Promise<void>;
    loadSessionDefaults: () => Promise<boolean>;
    invalidateModelMetadataCache: () => void;
    invalidateProviderCache: (directory?: string | null) => void;
    setProvider: (providerId: string) => void;
    setModel: (modelId: string) => void;
    setCurrentVariant: (variant: string | undefined) => void;
    setCurrentVariantOverride: (override: string | null | undefined, inherited: string | undefined) => void;
    cycleCurrentVariant: () => string | undefined;
    getCurrentModelVariants: () => string[];
    /**
     * `keepModel` switches the agent alone. It is for following a switch the
     * session already made: OpenCode keeps a session on its own model when the
     * agent changes, so resolving the agent's model would show one the session
     * does not run on (and would replace Auto).
     */
    setAgent: (agentName: string | undefined, options?: { keepModel?: boolean }) => void;
    applyDefaultModelAgentSelection: (options?: { projectDefaultAgent?: string; projectDefaultModel?: string; projectDefaultVariant?: string }) => void;
    /** Replaces an `openchamber/auto` selection this server cannot honour with the default model. */
    dropStaleAutoSelection: () => void;
    applyOpenCodeConfigDefaults: (directory?: string | null, source?: string, config?: Config) => void;
    setSelectedProvider: (providerId: string) => void;
    setSettingsDefaultModel: (model: string | undefined) => void;
    setSettingsDefaultVariant: (variant: string | undefined) => void;
    setSettingsDefaultAgent: (agent: string | undefined) => void;
    setSettingsAutoCreateWorktree: (enabled: boolean) => void;
    setSettingsGitmojiEnabled: (enabled: boolean) => void;
    setSettingsDefaultFileViewerPreview: (enabled: boolean) => void;
    setSettingsZenModel: (model: string | undefined) => void;
    setSettingsMessageStreamTransport: (transport: 'auto' | 'ws' | 'sse') => void;
    getResolvedGitGenerationModel: () => { providerId: string; modelId: string } | null;
    saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => void;
    getAgentModelSelection: (agentName: string) => { providerId: string; modelId: string } | null;
    probeConnection: (options?: { timeoutMs?: number }) => Promise<boolean>;
    checkConnection: () => Promise<boolean>;
    initializeApp: () => Promise<void>;
    getCurrentProvider: () => ProviderWithModelList | undefined;
    getCurrentModel: () => ProviderModel | undefined;
    getModelMetadata: (providerId: string, modelId: string) => ModelMetadata | undefined;
}

declare global {
    interface Window {
        __zustand_config_store__?: UseBoundStore<StoreApi<ConfigStore>>;
    }
}

type ConfigStoreWithPersist = UseBoundStore<StoreApi<ConfigStore>> & {
    persist: {
        hasHydrated: () => boolean;
        onFinishHydration: (callback: (state: ConfigStore) => void) => () => void;
        rehydrate: () => void | Promise<void>;
    };
};

/** The startup step that failed, with the underlying error text when one exists. */
export type InitFailure = {
    step: 'serverUnreachable' | 'agentServiceUnavailable' | 'loadAgents' | 'unexpected';
    message: string | null;
};

// Share concurrent provider/model loads for the same runtime and directory.
const _inFlightProviders = new Map<string, Promise<void>>();
let _initializeAppInFlight: Promise<void> | null = null;


/**
 * Providers of one project. Returns a stored array, so components can select it
 * directly and re-render only when that project's list is replaced.
 *
 * Settings pages browse a project the app is not on; everything else wants the
 * active one, which is what an omitted directory resolves to.
 */
export const selectProvidersForDirectory = (
    state: Pick<ConfigStore, "providers" | "directoryScoped" | "activeDirectoryKey">,
    directory?: string | null,
): ProviderWithModelList[] => {
    const directoryKey = toConfigDirectoryKey(directory);
    if (directoryKey === state.activeDirectoryKey) {
        return state.providers;
    }
    return state.directoryScoped[directoryKey]?.providers ?? EMPTY_PROVIDERS;
};

const EMPTY_PROVIDERS: ProviderWithModelList[] = [];

/**
 * A model as any loaded catalog lists it: the active directory's first, then
 * the snapshots of the others. For display only. A directory OpenCode is still
 * starting answers with a partial catalog for a second or two, and the
 * composer keeps the name it already knows meanwhile instead of a raw id.
 * Selection, variants and validation stay on the active catalog.
 */
export const selectKnownCatalogModel = (
    state: Pick<ConfigStore, 'providers' | 'directoryScoped'>,
    providerId: string,
    modelId: string,
): ProviderModel | undefined => {
    const fromProviders = (providers: ProviderWithModelList[]) =>
        providers.find((provider) => provider.providerId === providerId)?.models.find((model) => model.modelId === modelId);
    const active = fromProviders(state.providers);
    if (active) return active;
    for (const snapshot of Object.values(state.directoryScoped)) {
        const known = fromProviders(snapshot.providers);
        if (known) return known;
    }
    return undefined;
};


export const selectCatalogLoadedForDirectory = (
    state: Pick<ConfigStore, 'providersLoaded' | 'directoryScoped' | 'activeDirectoryKey'>,
    _resource: 'models',
    directory?: string | null,
): boolean => {
    if (directory === undefined) return state.providersLoaded;
    const key = toConfigDirectoryKey(directory);
    return key === state.activeDirectoryKey ? state.providersLoaded : state.directoryScoped[key]?.providersLoaded === true;
};

/**
 * Whether a freshly fetched catalog carries the same providers and models as
 * the one already in the store. The comparison is structural (a serialized
 * form of every provider and model): the catalog is a few hundred records at
 * most and this runs once per re-read, never per render.
 */
const isSameProviderCatalog = (previous: ProviderWithModelList[], next: ProviderWithModelList[]): boolean => {
    if (previous === next) return true;
    if (previous.length !== next.length) return false;
    return JSON.stringify(previous) === JSON.stringify(next);
};

const isSameDefaults = (previous: { [key: string]: string }, next: { [key: string]: string }): boolean => {
    const previousKeys = Object.keys(previous);
    const nextKeys = Object.keys(next);
    if (previousKeys.length !== nextKeys.length) return false;
    return previousKeys.every((key) => previous[key] === next[key]);
};

/** The last read of which voice keys the server holds, per runtime (see refreshVoiceApiKeys). */
let voiceApiKeysLoad: { runtimeKey: string; promise: Promise<void> } | null = null;

export const useConfigStore: ConfigStoreWithPersist = create<ConfigStore>()(
    devtools(
        persist(
            (set, get) => ({

                activeDirectoryKey: resolveInitialDirectoryKey(),
                directoryScoped: {},
                configRuntimeKey: getRuntimeKey(),

                providers: [],
                providersLoaded: false,
                currentProviderId: "",
                currentModelId: "",
                currentVariant: undefined,
                currentVariantSelection: { override: undefined, inherited: undefined },
                currentAgentName: undefined,
                selectedProviderId: "",
                agentModelSelections: {},
                defaultProviders: {},
                selectionSource: "auto",
                agentSelectionSource: "auto",
                isConnected: false,
                hasEverConnected: false,
                connectionPhase: "connecting",
                lastDisconnectReason: null,
                lastInitFailure: null,
                projectConfigErrors: {},
                isInitialized: false,
                modelsMetadata: new Map<string, ModelMetadata>(),
                settingsDefaultModel: undefined,
                settingsDefaultsLoaded: false,
                settingsDefaultVariant: undefined,
                settingsDefaultAgent: undefined,
                opencodeDefaultModel: undefined,
                settingsAutoCreateWorktree: false,
                settingsGitmojiEnabled: false,
                settingsDefaultFileViewerPreview: true,
                settingsZenModel: undefined,
                settingsMessageStreamTransport: 'auto',
                // Voice provider preference - load from localStorage or default to 'browser'
                voiceProvider: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('voiceProvider');
                        if (saved === 'openai' || saved === 'browser' || saved === 'local' || saved === 'say' || saved === 'openai-compatible') return saved;
                    }
                    return 'browser';
                })(),
                // TTS settings - load from localStorage with defaults
                speechRate: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('speechRate');
                        if (saved) {
                            const parsed = parseFloat(saved);
                            if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 2) return parsed;
                        }
                    }
                    return 1;
                })(),
                speechPitch: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('speechPitch');
                        if (saved) {
                            const parsed = parseFloat(saved);
                            if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 2) return parsed;
                        }
                    }
                    return 1;
                })(),
                speechVolume: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('speechVolume');
                        if (saved) {
                            const parsed = parseFloat(saved);
                            if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
                        }
                    }
                    return 1;
                })(),
                // macOS Say voice - load from localStorage or default to 'Samantha'
                sayVoice: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('sayVoice');
                        if (saved) return saved;
                    }
                    return 'Samantha';
                })(),
                // Local (Kokoro) TTS speaker id - load from localStorage or default to 0
                localTtsVoiceId: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('localTtsVoiceId');
                        if (saved !== null) {
                            const parsed = Number.parseInt(saved, 10);
                            if (Number.isInteger(parsed) && parsed >= 0) return parsed;
                        }
                    }
                    return 0;
                })(),
                localTtsModelId: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('localTtsModelId');
                        if (saved) return saved;
                    }
                    return 'kokoro-en-v0_19';
                })(),

                ttsFollowTextLanguage: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('ttsFollowTextLanguage');
                        if (saved !== null) return saved === 'true';
                    }
                    return true;
                })(),
                // Browser voice - load from localStorage or default to empty (auto-select)
                browserVoice: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('browserVoice');
                        if (saved) return saved;
                    }
                    return '';
                })(),
                // OpenAI voice - load from localStorage or default to 'nova'
                openaiVoice: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('openaiVoice');
                        if (saved) return saved;
                    }
                    return 'nova';
                })(),
                voiceApiKeys: EMPTY_VOICE_API_KEYS,
                // OpenAI-compatible custom server URL
                openaiCompatibleUrl: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('openaiCompatibleUrl');
                        if (saved) return saved;
                    }
                    return '';
                })(),
                // OpenAI-compatible custom server voice
                openaiCompatibleVoice: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('openaiCompatibleVoice');
                        if (saved) return saved;
                    }
                    return 'af_sky';
                })(),
                // OpenAI-compatible custom server TTS model
                openaiCompatibleTtsModel: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('openaiCompatibleTtsModel');
                        if (saved && saved !== 'speaches-ai/Kokoro-82M-v1.0-ONNX') return saved;
                    }
                    return 'kokoro';
                })(),
                // Voice input (dictation) master toggle - default enabled
                dictationEnabled: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('dictationEnabled');
                        if (saved === 'false') return false;
                    }
                    return true;
                })(),
                // STT provider: 'local' (server-side sherpa-onnx) or 'openai-compatible'
                sttProvider: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('sttProvider');
                        if (saved === 'local' || saved === 'openai-compatible') return saved;
                        // Migrate legacy providers: 'server' used an OpenAI-compatible
                        // endpoint; 'browser' and 'wasm' map to the local default.
                        if (saved === 'server') return 'openai-compatible' as const;
                    }
                    return 'local' as const;
                })(),
                sttServerUrl: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('sttServerUrl');
                        if (saved) return saved;
                    }
                    return 'http://localhost:8001/v1';
                })(),
                sttModel: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('sttModel');
                        if (saved) return saved;
                    }
                    return 'deepdml/faster-whisper-large-v3-turbo-ct2';
                })(),
                sttLocalModel: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('sttLocalModel');
                        if (saved) return saved;
                    }
                    return 'parakeet-tdt-0.6b-v2-int8';
                })(),
                sttLanguage: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('sttLanguage');
                        if (saved !== null) return saved;
                    }
                    return '';
                })(),
                // Show TTS buttons on messages - disabled by default until user enables it
                showMessageTTSButtons: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('showMessageTTSButtons');
                        if (saved === 'true') return true;
                    }
                    return false;
                })(),
                ttsInputMode: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('ttsInputMode');
                        if (saved === 'raw') return 'raw' as const;
                        if (saved === 'summarized') return 'summarized' as const;
                    }
                    return 'sanitized' as const;
                })(),
                // Sentence-by-sentence server TTS synthesis - disabled by default
                ttsChunkedMode: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('ttsChunkedMode');
                        if (saved === 'true') return true;
                    }
                    return false;
                })(),
                // Summarization settings
                summarizeMessageTTS: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('summarizeMessageTTS');
                        if (saved === 'true') return true;
                    }
                    return false;
                })(),
                summarizeVoiceConversation: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('summarizeVoiceConversation');
                        if (saved === 'true') return true;
                    }
                    return false;
                })(),
                summarizeCharacterThreshold: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('summarizeCharacterThreshold');
                        if (saved) {
                            const parsed = parseInt(saved, 10);
                            if (!isNaN(parsed) && parsed >= 50 && parsed <= 2000) return parsed;
                        }
                    }
                    return 200;
                })(),
                summarizeMaxLength: (() => {
                    if (typeof window !== 'undefined') {
                        const saved = localStorage.getItem('summarizeMaxLength');
                        if (saved) {
                            const parsed = parseInt(saved, 10);
                            if (!isNaN(parsed) && parsed >= 50 && parsed <= 2000) return parsed;
                        }
                    }
                    return 500;
                })(),
                activateDirectory: async (directory, options) => {
                    const runtimeContext = captureConfigRuntimeContext();
                    // Keep the active catalog and snapshot scoped to the actual
                    // directory, including worktrees with their own opencode.json.
                    const configDirectory = resolveConfigDirectory(directory);
                    if (!configDirectory) {
                        markStartupTrace('activateDirectory:skippedUnknownDirectory', { directory });
                        return;
                    }
                    const directoryKey = toDirectoryKey(configDirectory);
                    let snapshotHadProviders = false;

                    set((state) => {
                        const snapshot = state.directoryScoped[directoryKey];
                        const carryManualModel = options?.preserveManualModel && state.activeDirectoryKey !== directoryKey
                            && state.selectionSource === 'manual' && Boolean(state.currentProviderId && state.currentModelId);
                        const manualModel = carryManualModel ? {
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            currentVariant: state.currentVariant,
                            currentVariantSelection: state.currentVariantSelection,
                            selectionSource: 'manual' as const,
                        } : null;
                        // An effort picked in the draft travels with it the same way,
                        // also when the model itself is still the automatic one.
                        const carriedOverride = !manualModel && options?.preserveManualModel
                            && state.activeDirectoryKey !== directoryKey
                            ? state.currentVariantSelection.override
                            : undefined;
                        const carriedVariant = carriedOverride === undefined ? null : {
                            currentVariant: carriedOverride ?? undefined,
                            currentVariantSelection: {
                                override: carriedOverride,
                                inherited: snapshot?.currentVariantSelection?.inherited ?? snapshot?.currentVariant,
                            },
                        };
                        const carried = manualModel ?? carriedVariant;
                        if (snapshot) {
                            snapshotHadProviders = snapshot.providers.length > 0;
                            return {
                                activeDirectoryKey: directoryKey,
                                directoryScoped: carried ? {
                                    ...state.directoryScoped,
                                    [directoryKey]: { ...snapshot, ...carried },
                                } : state.directoryScoped,
                                providers: snapshot.providers,
                                providersLoaded: snapshot.providersLoaded === true,
                                currentProviderId: manualModel?.currentProviderId ?? snapshot.currentProviderId,
                                currentModelId: manualModel?.currentModelId ?? snapshot.currentModelId,
                                currentVariant: carried ? carried.currentVariant : snapshot.currentVariant,
                                currentVariantSelection: carried?.currentVariantSelection ?? snapshot.currentVariantSelection ?? { override: undefined, inherited: snapshot.currentVariant },
                                currentAgentName: snapshot.currentAgentName,
                                selectedProviderId: snapshot.selectedProviderId,
                                agentModelSelections: snapshot.agentModelSelections,
                                defaultProviders: snapshot.defaultProviders,
                                opencodeDefaultModel: snapshot.opencodeDefaultModel,
                                selectionSource: manualModel?.selectionSource ?? snapshot.selectionSource ?? "auto",
                                agentSelectionSource: snapshot.agentSelectionSource ?? "auto",
                            };
                        }

                        return {
                            activeDirectoryKey: directoryKey,
                            directoryScoped: carried ? {
                                ...state.directoryScoped,
                                [directoryKey]: {
                                    providers: [], agentModelSelections: {}, defaultProviders: {},
                                    selectedProviderId: '', currentAgentName: undefined,
                                    currentProviderId: '', currentModelId: '', ...carried,
                                },
                            } : state.directoryScoped,
                            providers: [],
                            providersLoaded: false,
                            currentProviderId: manualModel?.currentProviderId ?? "",
                            currentModelId: manualModel?.currentModelId ?? "",
                            currentVariant: carried?.currentVariant,
                            currentVariantSelection: carried?.currentVariantSelection ?? { override: undefined, inherited: undefined },
                            currentAgentName: undefined,
                            selectedProviderId: "",
                            agentModelSelections: {},
                            defaultProviders: {},
                            opencodeDefaultModel: undefined,
                            selectionSource: manualModel?.selectionSource ?? "auto",
                            agentSelectionSource: "auto",
                        };
                    });

                    if (!get().isConnected) {
                        return;
                    }

                    // Stale-while-revalidate: when a cached snapshot already
                    // populated the pickers, refresh in the background so the UI
                    // stays instant but never shows stale provider/agent data for
                    // longer than one fetch. Only block when there is nothing to show.
                    const requiredLoads: Promise<void | boolean>[] = [];
                    if (snapshotHadProviders) {
                        if (isConfigFresh(_providersLoadedAt, directoryKey)) {
                            markStartupTrace('activateDirectory:providersFresh', { directoryKey });
                        } else {
                            markStartupTrace('activateDirectory:refreshProvidersBackground', { directoryKey });
                            void get().loadProviders({ directory: fromDirectoryKey(directoryKey), source: 'activateDirectory:refresh' });
                        }
                    } else {
                        requiredLoads.push(get().loadProviders({ directory: fromDirectoryKey(directoryKey), source: 'activateDirectory' }));
                    }

                    if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                    requiredLoads.push(useAgentsStore.getState().loadAgents(fromDirectoryKey(directoryKey)));
                    await Promise.all(requiredLoads);
                    if (!isConfigRuntimeContextCurrent(runtimeContext) || get().activeDirectoryKey !== directoryKey) return;
                    if (!useSessionUIStore.getState().currentSessionId
                        && get().selectionSource === 'auto' && get().agentSelectionSource === 'auto'
                        && get().currentVariantSelection.override === undefined) {
                        get().applyDefaultModelAgentSelection();
                    }
                },

                invalidateProviderCache: (directory) => {
                    const targetDirectoryKey = directory === undefined ? null : toDirectoryKey(directory);

                    set((state) => {
                        const nextState: Partial<ConfigStore> = {};
                        let scopedChanged = false;
                        const nextDirectoryScoped: Record<string, DirectoryScopedConfig> = {
                            ...state.directoryScoped,
                        };

                        const clearSnapshot = (snapshot: DirectoryScopedConfig): DirectoryScopedConfig => {
                            if (!snapshot.providersLoaded && snapshot.providers.length === 0 && Object.keys(snapshot.defaultProviders).length === 0) {
                                return snapshot;
                            }

                            scopedChanged = true;
                            return {
                                ...snapshot,
                                providers: [],
                                providersLoaded: false,
                                defaultProviders: {},
                            };
                        };

                        if (targetDirectoryKey) {
                            const snapshot = state.directoryScoped[targetDirectoryKey];
                            if (snapshot) {
                                nextDirectoryScoped[targetDirectoryKey] = clearSnapshot(snapshot);
                            }
                        } else {
                            for (const [directoryKey, snapshot] of Object.entries(state.directoryScoped)) {
                                nextDirectoryScoped[directoryKey] = clearSnapshot(snapshot);
                            }
                        }

                        if (scopedChanged) {
                            nextState.directoryScoped = nextDirectoryScoped;
                        }

                        if (targetDirectoryKey === null || targetDirectoryKey === state.activeDirectoryKey) {
                            nextState.providersLoaded = false;
                            if (state.providers.length > 0) {
                                nextState.providers = [];
                            }
                            if (Object.keys(state.defaultProviders).length > 0) {
                                nextState.defaultProviders = {};
                            }
                        }

                        return Object.keys(nextState).length > 0 ? nextState : state;
                    });
                },

                loadProviders: async (options) => {
                    const runtimeContext = captureConfigRuntimeContext();
                    const requestedDirectory = options?.directory ?? fromDirectoryKey(get().activeDirectoryKey);
                    const configDirectory = resolveConfigDirectory(requestedDirectory);
                    if (!configDirectory) {
                        markStartupTrace('loadProviders:skippedUnknownDirectory', { requestedDirectory, source: options?.source ?? 'unknown' });
                        return;
                    }
                    const effectiveDirectory = configDirectory ?? hostFilesystem.getDirectory() ?? null;
                    const directoryKey = toDirectoryKey(configDirectory);
                    const inFlightKey = getConfigLoadKey(runtimeContext, directoryKey);
                    const source = options?.source ?? 'unknown';
                    markStartupTrace('loadProviders:called', { directoryKey, source, requestedDirectory, effectiveDirectory });

                    // Dedup: if a load is already in-flight for this directory, reuse it.
                    // A fresh load waits it out instead: that request may have been
                    // answered before the change that prompted this one.
                    let existing = _inFlightProviders.get(inFlightKey);
                    if (existing && options?.fresh) {
                        await existing.catch(() => undefined);
                        existing = _inFlightProviders.get(inFlightKey);
                    }
                    if (existing) {
                        markStartupTrace('loadProviders:deduped', { directoryKey, source, requestedDirectory, effectiveDirectory });
                        return existing;
                    }

                    const promise: Promise<void> = (async () => {
                    if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                    const loadRevision = _catalogRevision;
                    const loaderStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
                    markStartupTrace('loadProviders:start', { directoryKey, source, requestedDirectory, effectiveDirectory });
                    const existingSnapshot = get().directoryScoped[directoryKey];
                    const previousProviders = existingSnapshot?.providers ?? (get().activeDirectoryKey === directoryKey ? get().providers : []);
                    const previousDefaults = existingSnapshot?.defaultProviders ?? (get().activeDirectoryKey === directoryKey ? get().defaultProviders : {});
                    let lastError: unknown = null;

                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            ensureModelsMetadataFetch(
                                () => get().modelsMetadata,
                                (metadata) => {
                                    if (isConfigRuntimeContextCurrent(runtimeContext)) {
                                        set({ modelsMetadata: metadata });
                                    }
                                },
                            );
                            const workspace = await measureStartupTrace(
                                'loadProviders:workspace',
                                () => canonicalClient.resolveWorkspace(configDirectory),
                                { directoryKey, source, requestedDirectory, effectiveDirectory, attempt: attempt + 1 },
                            );
                            const [providerCatalog, modelCatalog] = await Promise.all([
                                measureStartupTrace(
                                    'loadProviders:providers',
                                    () => canonicalClient.getProviders(workspace.workspaceId),
                                    { directoryKey, source, requestedDirectory, effectiveDirectory, attempt: attempt + 1 },
                                ),
                                measureStartupTrace(
                                    'loadProviders:models',
                                    () => canonicalClient.getModels(workspace.workspaceId),
                                    { directoryKey, source, requestedDirectory, effectiveDirectory, attempt: attempt + 1 },
                                ),
                            ]);
                            if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                            const processedProviders = combineCanonicalCatalog(providerCatalog, modelCatalog);
                            // Canonical catalogs intentionally do not publish a resolved default.
                            // Keep the prior map for cache/selection compatibility; model selection
                            // still resolves from explicit settings, the current pick, or fallback.
                            const defaults = previousDefaults;

                            if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                            // A re-read that returns the same catalog keeps the arrays the
                            // store already holds, so nothing subscribed to them re-renders.
                            const nextProviders = isSameProviderCatalog(previousProviders, processedProviders)
                                ? previousProviders
                                : processedProviders;
                            const nextDefaults = isSameDefaults(previousDefaults, defaults) ? previousDefaults : defaults;
                            set((state) => {
                                if (!isConfigRuntimeContextCurrent(runtimeContext)) return state;
                                const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                                    providers: [],
                                    currentProviderId: "",
                                    currentModelId: "",
                                    currentAgentName: undefined,
                                    selectedProviderId: "",
                                    agentModelSelections: {},
                                    defaultProviders: {},
                                };

                                const currentProviderId = state.activeDirectoryKey === directoryKey
                                    ? state.currentProviderId
                                    : baseSnapshot.currentProviderId;
                                const currentModelId = state.activeDirectoryKey === directoryKey
                                    ? state.currentModelId
                                    : baseSnapshot.currentModelId;
                                const currentVariant = state.activeDirectoryKey === directoryKey
                                    ? state.currentVariant
                                    : baseSnapshot.currentVariant;
                                const projectDefaults = getProjectDefaultsForConfigDirectory(fromDirectoryKey(directoryKey));
                                const resolvedModel = resolveProviderModelSelection({
                                    providers: nextProviders,
                                    currentProviderId,
                                    currentModelId,
                                    currentVariant,
                                    preserveCurrent: (state.activeDirectoryKey === directoryKey ? state.selectionSource : baseSnapshot.selectionSource) === 'manual',
                                    settingsDefaultModel: projectDefaults.projectDefaultModel || state.settingsDefaultModel,
                                    settingsDefaultVariant: projectDefaults.projectDefaultModel ? projectDefaults.projectDefaultVariant : state.settingsDefaultVariant,
                                    allowFallback: state.settingsDefaultsLoaded,
                                    fallbackPrefs: readFallbackModelPrefs(),
                                });
                                const currentSelectedProviderId = state.activeDirectoryKey === directoryKey
                                    ? state.selectedProviderId
                                    : baseSnapshot.selectedProviderId;
                                // The Providers settings selection belongs to the user, not to this
                                // loader. A refresh may report a different provider set — an OpenCode
                                // restart drops plugin-registered providers until they re-register —
                                // and re-deriving a selection here yanked the open provider away
                                // mid-edit. Keep whatever is selected; only fill in an empty one.
                                // The add-provider sentinel is kept for the same reason (issue #1765).
                                const selectedProviderId = currentSelectedProviderId
                                    ? currentSelectedProviderId
                                    : (resolvedModel?.providerId ?? nextProviders[0]?.providerId ?? "");

                                const heldVariantSelection = state.activeDirectoryKey === directoryKey
                                    ? state.currentVariantSelection
                                    : baseSnapshot.currentVariantSelection;
                                const pickedVariant = heldVariantSelection?.override;
                                const nextSnapshot: DirectoryScopedConfig = {
                                    ...baseSnapshot,
                                    providers: nextProviders,
                                    providersLoaded: true,
                                    defaultProviders: nextDefaults,
                                    currentProviderId: resolvedModel?.providerId ?? "",
                                    currentModelId: resolvedModel?.modelId ?? "",
                                    currentVariant: variantAfterResolve(heldVariantSelection, resolvedModel?.variant),
                                    currentVariantSelection: (state.activeDirectoryKey === directoryKey ? state.selectionSource : baseSnapshot.selectionSource) === 'manual'
                                        || pickedVariant !== undefined
                                        ? heldVariantSelection
                                        : { override: undefined, inherited: resolvedModel?.variant },
                                    selectedProviderId,
                                };

                                if (
                                    baseSnapshot.providers === nextSnapshot.providers
                                    && baseSnapshot.providersLoaded === true
                                    && baseSnapshot.defaultProviders === nextSnapshot.defaultProviders
                                    && baseSnapshot.currentProviderId === nextSnapshot.currentProviderId
                                    && baseSnapshot.currentModelId === nextSnapshot.currentModelId
                                    && baseSnapshot.currentVariant === nextSnapshot.currentVariant
                                    && baseSnapshot.selectedProviderId === nextSnapshot.selectedProviderId
                                    && (state.activeDirectoryKey !== directoryKey || (
                                        state.providers === nextSnapshot.providers
                                        && state.providersLoaded
                                        && state.defaultProviders === nextSnapshot.defaultProviders
                                        && state.currentProviderId === nextSnapshot.currentProviderId
                                        && state.currentModelId === nextSnapshot.currentModelId
                                        && state.currentVariant === nextSnapshot.currentVariant
                                        && state.selectedProviderId === nextSnapshot.selectedProviderId
                                    ))
                                ) {
                                    return state;
                                }

                                const nextState: Partial<ConfigStore> = {
                                    directoryScoped: {
                                        ...state.directoryScoped,
                                        [directoryKey]: nextSnapshot,
                                    },
                                };

                                if (state.activeDirectoryKey === directoryKey) {
                                    nextState.providers = nextProviders;
                                    nextState.providersLoaded = true;
                                    nextState.defaultProviders = nextDefaults;
                                    nextState.currentProviderId = nextSnapshot.currentProviderId;
                                    nextState.currentModelId = nextSnapshot.currentModelId;
                                    nextState.currentVariant = nextSnapshot.currentVariant;
                                    nextState.currentVariantSelection = nextSnapshot.currentVariantSelection ?? { override: undefined, inherited: nextSnapshot.currentVariant };
                                    nextState.selectedProviderId = selectedProviderId;
                                }

                                return nextState;
                            });

                            if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                            const loaderEnded = typeof performance !== 'undefined' ? performance.now() : Date.now();
                            markStartupTrace('loadProviders:end', {
                                directoryKey,
                                source,
                                requestedDirectory,
                                effectiveDirectory,
                                durationMs: Math.round(loaderEnded - loaderStarted),
                                providers: processedProviders.length,
                                models: processedProviders.reduce((count, provider) => count + provider.models.length, 0),
                            });
                            markCatalogLoaded(_providersLoadedAt, _providersStaleAt, directoryKey, loadRevision);
                                persistLoadedCatalog(runtimeContext, directoryKey, source, { providers: nextProviders, defaultProviders: nextDefaults }, false, _providersStaleAt, loadRevision);
                            return;
                        } catch (error) {
                            lastError = error;
                            markStartupTrace('loadProviders:attemptError', {
                                directoryKey,
                                source,
                                requestedDirectory,
                                effectiveDirectory,
                                attempt: attempt + 1,
                                error: error instanceof Error ? error.message : String(error),
                            });
                            const waitMs = 200 * (attempt + 1);
                            await new Promise((resolve) => setTimeout(resolve, waitMs));
                            if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                        }
                    }

                    if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                    console.error("Failed to load providers:", lastError);
                    markStartupTrace('loadProviders:error', {
                        directoryKey,
                        source,
                        requestedDirectory,
                        effectiveDirectory,
                        error: lastError instanceof Error ? lastError.message : String(lastError),
                    });

                    if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                    set((state) => {
                        if (!isConfigRuntimeContextCurrent(runtimeContext)) return state;
                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: [],
                            currentProviderId: "",
                            currentModelId: "",
                            currentAgentName: undefined,
                            selectedProviderId: "",
                            agentModelSelections: {},
                            defaultProviders: {},
                        };

                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            providers: previousProviders,
                            defaultProviders: previousDefaults,
                        };

                        const nextState: Partial<ConfigStore> = {
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };

                        if (state.activeDirectoryKey === directoryKey) {
                            nextState.providers = previousProviders;
                            nextState.defaultProviders = previousDefaults;

                            if (!state.currentProviderId && !state.currentModelId && state.settingsDefaultModel) {
                                const parsed = parseModelString(state.settingsDefaultModel);
                                if (parsed) {
                                    const settingsProvider = previousProviders.find((p) => p.providerId === parsed.providerId);
                                    const model = settingsProvider?.models.find((entry) => entry.modelId === parsed.modelId);
                                    if (model) {
                                        const currentVariant = modelHasVariant(model, state.settingsDefaultVariant)
                                            ? state.settingsDefaultVariant
                                            : undefined;

                                        nextState.currentProviderId = parsed.providerId;
                                        nextState.currentModelId = parsed.modelId;
                                        nextState.currentVariant = currentVariant;

                                        nextSnapshot.currentProviderId = parsed.providerId;
                                        nextSnapshot.currentModelId = parsed.modelId;
                                        nextSnapshot.currentVariant = currentVariant;

                                        // Only adopt this as the settings selection when the user has
                                        // none; a failed refresh must not move an existing one.
                                        if (!state.selectedProviderId) {
                                            nextState.selectedProviderId = parsed.providerId;
                                            nextSnapshot.selectedProviderId = parsed.providerId;
                                        }
                                    }
                                }
                            }
                        }

                        return nextState;
                    });

                    // Nothing else re-reads a directory whose providers never loaded: the
                    // composer would wait on the missing catalog until something unrelated,
                    // such as Settings → Providers, asked again. One delayed retry covers a
                    // server that was still starting this directory.
                    if (source !== PROVIDERS_RETRY_SOURCE && !get().directoryScoped[directoryKey]?.providersLoaded) {
                        setTimeout(() => {
                            if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                            const state = get();
                            if (state.activeDirectoryKey !== directoryKey || state.directoryScoped[directoryKey]?.providersLoaded) return;
                            void state.loadProviders({ directory: fromDirectoryKey(directoryKey), source: PROVIDERS_RETRY_SOURCE });
                        }, PROVIDERS_RETRY_DELAY_MS);
                    }
                    })().finally(() => {
                        if (_inFlightProviders.get(inFlightKey) === promise) _inFlightProviders.delete(inFlightKey);
                    });

                    _inFlightProviders.set(inFlightKey, promise);
                    return promise;
                },

                setProvider: (providerId: string) => {
                    const { providers } = get();
                    const provider = providers.find((p) => p.providerId === providerId);
                    const isAuto = providerId === AUTO_PROVIDER_ID && hasProviderModel(providers, AUTO_PROVIDER_ID, AUTO_MODEL_ID);
 
                    if (!provider && !isAuto) {
                        return;
                    }
 
                    const firstModel = provider?.models[0];
                    const newModelId = isAuto ? AUTO_MODEL_ID : (firstModel?.modelId || "");

                    if (isUnchangedSelection(get(), { currentProviderId: providerId, currentModelId: newModelId, selectionSource: "manual" })) {
                        return;
                    }

                    set((state) => {
                        const directoryKey = state.activeDirectoryKey;
                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: state.providers,
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            currentVariant: state.currentVariant,
                            currentAgentName: state.currentAgentName,
                            selectedProviderId: state.selectedProviderId,
                            agentModelSelections: state.agentModelSelections,
                            defaultProviders: state.defaultProviders,
                        };

                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            currentProviderId: providerId,
                            currentModelId: newModelId,
                            selectionSource: "manual",
                        };

                        return {
                            currentProviderId: providerId,
                            currentModelId: newModelId,
                            selectionSource: "manual",
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };
                    });
                },

                setModel: (modelId: string) => {
                    if (isUnchangedSelection(get(), { currentModelId: modelId, selectionSource: "manual" })) {
                        return;
                    }

                    set((state) => {
                        const directoryKey = state.activeDirectoryKey;
                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: state.providers,
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            currentVariant: state.currentVariant,
                            currentAgentName: state.currentAgentName,
                            selectedProviderId: state.selectedProviderId,
                            agentModelSelections: state.agentModelSelections,
                            defaultProviders: state.defaultProviders,
                        };
 
                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            currentModelId: modelId,
                            selectionSource: "manual",
                        };
 
                        return {
                            currentModelId: modelId,
                            selectionSource: "manual",
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };
                    });
                },

                setCurrentVariant: (variant: string | undefined) => {
                    get().setCurrentVariantOverride(undefined, variant);
                },

                setCurrentVariantOverride: (override, inherited) => {
                    set((state) => {
                        const currentVariant = resolveVariantFromSelection({ override, inherited });
                        if (
                            state.currentVariant === currentVariant
                            && state.currentVariantSelection.override === override
                            && state.currentVariantSelection.inherited === inherited
                        ) {
                            return state;
                        }

                        const directoryKey = state.activeDirectoryKey;
                        const baseSnapshot = state.directoryScoped[directoryKey] ?? {
                            providers: state.providers,
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            currentVariant: state.currentVariant,
                            currentAgentName: state.currentAgentName,
                            selectedProviderId: state.selectedProviderId,
                            agentModelSelections: state.agentModelSelections,
                            defaultProviders: state.defaultProviders,
                        };

                        return {
                            currentVariant,
                            currentVariantSelection: { override, inherited },
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: {
                                    ...baseSnapshot,
                                    currentVariant,
                                    currentVariantSelection: { override, inherited },
                                },
                            },
                        };
                    });
                },

                getCurrentModelVariants: () => {
                    return modelVariantIds(get().getCurrentModel());
                },

                cycleCurrentVariant: () => {
                    const variantKeys = get().getCurrentModelVariants();
                    if (variantKeys.length === 0) {
                        return undefined;
                    }

                    const state = get();
                    const currentOverride = state.currentVariantSelection.override;
                    const inheritedVariant = state.currentVariantSelection.inherited ?? state.currentVariant;
                    const currentVariant = currentOverride === undefined
                        ? state.currentVariant
                        : currentOverride;
                    let nextOverride: string | null;

                    if (currentVariant === null || currentVariant === undefined) {
                        nextOverride = variantKeys[0];
                    } else {
                        const index = variantKeys.indexOf(currentVariant);
                        nextOverride = index >= 0 ? (variantKeys[index + 1] ?? null) : null;
                    }

                    get().setCurrentVariantOverride(nextOverride, inheritedVariant);
                    return nextOverride ?? undefined;
                },
 
                setSelectedProvider: (providerId: string) => {
                    set((state) => {
                        const directoryKey = state.activeDirectoryKey;
                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: state.providers,
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            currentAgentName: state.currentAgentName,
                            selectedProviderId: state.selectedProviderId,
                            agentModelSelections: state.agentModelSelections,
                            defaultProviders: state.defaultProviders,
                        };

                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            selectedProviderId: providerId,
                            selectionSource: "manual",
                        };

                        return {
                            selectedProviderId: providerId,
                            selectionSource: "manual",
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };
                    });
                },

                saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => {
                    set((state) => {
                        const directoryKey = state.activeDirectoryKey;
                        const nextSelections = {
                            ...state.agentModelSelections,
                            [agentName]: { providerId, modelId },
                        };

                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: state.providers,
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            currentAgentName: state.currentAgentName,
                            selectedProviderId: state.selectedProviderId,
                            agentModelSelections: state.agentModelSelections,
                            defaultProviders: state.defaultProviders,
                        };

                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            agentModelSelections: nextSelections,
                            selectionSource: "manual",
                        };

                        return {
                            agentModelSelections: nextSelections,
                            selectionSource: "manual",
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };
                    });
                },

                getAgentModelSelection: (agentName: string) => {
                    const { agentModelSelections } = get();
                    return agentModelSelections[agentName] || null;
                },

                loadSessionDefaults: async () => {
                    const runtimeContext = captureConfigRuntimeContext();
                    const revision = openChamberDefaultsUserRevision;
                    const defaults = await fetchOpenChamberDefaults(runtimeContext);
                    if (!isConfigRuntimeContextCurrent(runtimeContext) || !defaults) return false;

                    set((state) => {
                        const edited = revision !== openChamberDefaultsUserRevision;
                        const next: Partial<ConfigStore> = {
                            configRuntimeKey: runtimeContext.runtimeKey,
                            settingsDefaultsLoaded: true,
                            settingsDefaultModel: edited ? state.settingsDefaultModel : defaults.defaultModel,
                            settingsDefaultVariant: edited ? state.settingsDefaultVariant : defaults.defaultVariant,
                            settingsDefaultAgent: edited ? state.settingsDefaultAgent : defaults.defaultAgent,
                            settingsAutoCreateWorktree: defaults.autoCreateWorktree ?? false,
                            settingsGitmojiEnabled: defaults.gitmojiEnabled ?? false,
                            settingsDefaultFileViewerPreview: defaults.defaultFileViewerPreview ?? true,
                            settingsZenModel: defaults.zenModel,
                            settingsMessageStreamTransport: defaults.messageStreamTransport ?? state.settingsMessageStreamTransport,
                            dictationEnabled: typeof defaults.dictationEnabled === 'boolean' ? defaults.dictationEnabled : state.dictationEnabled,
                            sttProvider: defaults.sttProvider ?? state.sttProvider,
                            sttServerUrl: defaults.sttServerUrl ?? state.sttServerUrl,
                            sttModel: defaults.sttModel ?? state.sttModel,
                            sttLocalModel: defaults.sttLocalModel ?? state.sttLocalModel,
                            sttLanguage: defaults.sttLanguage ?? state.sttLanguage,
                        };
                        if (!useSessionUIStore.getState().currentSessionId && state.selectionSource === 'auto' && state.agentSelectionSource === 'auto' && next.settingsDefaultAgent) {
                            next.currentAgentName = next.settingsDefaultAgent;
                        }
                        return next;
                    });
                    const state = get();
                    const projectDefaults = getProjectDefaultsForConfigDirectory(fromDirectoryKey(state.activeDirectoryKey));
                    // An effort picked while the settings document was still loading
                    // is a choice too; re-applying the defaults would clear it.
                    if (!useSessionUIStore.getState().currentSessionId && state.selectionSource === 'auto' && state.agentSelectionSource === 'auto'
                        && state.currentVariantSelection.override === undefined) {
                        state.applyDefaultModelAgentSelection(projectDefaults);
                    }
                    markStartupTrace('config.defaults:published');
                    return true;
                },


                invalidateModelMetadataCache: () => {
                    modelsMetadataInFlight = null;
                    set({ modelsMetadata: new Map<string, ModelMetadata>() });
                },

                setAgent: (agentName: string | undefined, options?: { keepModel?: boolean }) => {
                    const {
                        activeDirectoryKey,
                        providers,
                        settingsDefaultModel,
                        settingsDefaultVariant,
                        currentProviderId,
                        currentModelId,
                        currentAgentName,
                    } = get();
                    const agents = selectAgentsForDirectory(useAgentsStore.getState(), fromDirectoryKey(activeDirectoryKey));
                    const hadManualSelection = get().selectionSource === "manual";
                    // The agent is a choice even when its model is inherited, so
                    // it is recorded apart from `selectionSource`. Without it a
                    // config reload resolves the default agent over this one.
                    const agentSelectionSource = agentName ? "manual" as const : "auto" as const;

                    // Only the write is skipped: the session memory and model
                    // resolution below still run for an unchanged agent.
                    if (!isUnchangedSelection(get(), { currentAgentName: agentName, agentSelectionSource })) {
                        set((state) => {
                            const directoryKey = state.activeDirectoryKey;
                            const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                                providers: state.providers,
                                currentProviderId: state.currentProviderId,
                                currentModelId: state.currentModelId,
                                currentAgentName: state.currentAgentName,
                                selectedProviderId: state.selectedProviderId,
                                agentModelSelections: state.agentModelSelections,
                                defaultProviders: state.defaultProviders,
                            };

                            const nextSnapshot: DirectoryScopedConfig = {
                                ...baseSnapshot,
                                currentAgentName: agentName,
                                agentSelectionSource,
                            };

                            return {
                                currentAgentName: agentName,
                                agentSelectionSource,
                                directoryScoped: {
                                    ...state.directoryScoped,
                                    [directoryKey]: nextSnapshot,
                                },
                            };
                        });
                    }

                    if (agentName) {
                        const { currentSessionId } = useSessionUIStore.getState();
                        const selState = useSelectionStore.getState();

                        if (currentSessionId) {
                            selState.saveSessionAgentSelection(currentSessionId, agentName);
                        }

                    }

                    if (agentName && !options?.keepModel) {
                        const { currentSessionId } = useSessionUIStore.getState();

                        // Writes the effort alongside the model, because the two are one
                        // selection: leaving `currentVariantSelection` behind would let the
                        // picker show one effort while sends carry another.
                        const applyResolvedModelSelection = (
                            providerId: string,
                            modelId: string,
                            variantSelection: CurrentVariantSelection,
                            source: "auto" | "manual" = "manual",
                        ) => {
                            const variant = resolveVariantFromSelection(variantSelection);
                            // Checked before `set()`: persist writes after every
                            // `set()`, even one that returns the same state.
                            const current = get();
                            if (
                                current.currentProviderId === providerId
                                && current.currentModelId === modelId
                                && current.currentVariant === variant
                                && current.currentVariantSelection.override === variantSelection.override
                                && current.currentVariantSelection.inherited === variantSelection.inherited
                                && current.selectionSource === source
                            ) {
                                return;
                            }

                            set((state) => {
                                const directoryKey = state.activeDirectoryKey;
                                const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                                    providers: state.providers,
                                    currentProviderId: state.currentProviderId,
                                    currentModelId: state.currentModelId,
                                    currentVariant: state.currentVariant,
                                    currentAgentName: state.currentAgentName,
                                    selectedProviderId: state.selectedProviderId,
                                    agentModelSelections: state.agentModelSelections,
                                    defaultProviders: state.defaultProviders,
                                };

                                const nextSnapshot: DirectoryScopedConfig = {
                                    ...baseSnapshot,
                                    currentProviderId: providerId,
                                    currentModelId: modelId,
                                    currentVariant: variant,
                                    currentVariantSelection: variantSelection,
                                    selectionSource: source,
                                };

                                return {
                                    currentProviderId: providerId,
                                    currentModelId: modelId,
                                    currentVariant: variant,
                                    currentVariantSelection: variantSelection,
                                    selectionSource: source,
                                    directoryScoped: {
                                        ...state.directoryScoped,
                                        [directoryKey]: nextSnapshot,
                                    },
                                };
                            });
                        };

                        const resolveVariantSelectionForModel = (
                            providerId: string,
                            modelId: string,
                            agentVariant?: string,
                        ): CurrentVariantSelection => {
                            const model = findProviderModel(providers, providerId, modelId);
                            if (model && modelVariantIds(model).length === 0) return { override: undefined, inherited: undefined };

                            // A model the catalog does not list (Auto, or a stale
                            // selection) cannot rule a variant out, so inherited
                            // choices stand until a real model contradicts them.
                            const isAvailable = (candidate: string | null | undefined): candidate is string => (
                                candidate !== null
                                && candidate !== undefined
                                && (!model || modelHasVariant(model, candidate))
                            );

                            const inherited = [agentVariant, settingsDefaultVariant].find(isAvailable);

                            const savedVariant = currentSessionId
                                ? useSelectionStore.getState().getAgentModelVariantForSession(
                                    currentSessionId,
                                    agentName,
                                    providerId,
                                    modelId,
                                )
                                : undefined;
                            // `null` is this session's explicit "Default"; it outranks
                            // the agent and settings defaults just like a named effort.
                            if (savedVariant === null || isAvailable(savedVariant)) {
                                return { override: savedVariant, inherited };
                            }

                            // While drafting there is no session record to read the choice
                            // back from, and switching agent is not a change of effort:
                            // keep the picker's choice for this same model, "Default"
                            // (an explicit `null`) included.
                            const liveSelection = get().currentVariantSelection;
                            const sameModel = get().currentProviderId === providerId && get().currentModelId === modelId;
                            if (!currentSessionId && sameModel && (liveSelection.override === null || isAvailable(liveSelection.override))) {
                                return { override: liveSelection.override, inherited };
                            }

                            return { override: undefined, inherited };
                        };

                        const agent = agents.find((candidate) => candidate.agentId === agentName);

                        // Prefer a session-level manual override for this agent over the
                        // agent's configured default. Re-applying setAgent after subtask
                        // completion / rematerialization must not clobber the override
                        // (issue #2404).
                        if (currentSessionId) {
                            const existingAgentModel = useSelectionStore.getState().getAgentModelForSession(currentSessionId, agentName);
                            if (existingAgentModel) {
                                applyResolvedModelSelection(
                                    existingAgentModel.providerId,
                                    existingAgentModel.modelId,
                                    resolveVariantSelectionForModel(existingAgentModel.providerId, existingAgentModel.modelId),
                                    "manual",
                                );
                                return;
                            }
                        }

                        // No session override — use the agent's configured/pinned model.
                        const agentModelSelection = agent?.model;
                        if (agentModelSelection) {
                            const providerId = agentModelSelection.providerId;
                            const modelId = agentModelSelection.modelId;
                            const agentModel = findProviderModel(providers, providerId, modelId);

                            if (agentModel) {
                                applyResolvedModelSelection(
                                    providerId,
                                    modelId,
                                    resolveVariantSelectionForModel(providerId, modelId),
                                    "auto",
                                );
                                return;
                            }
                        }

                        const prevAgent = agents.find((candidate) => candidate.agentId === currentAgentName);
                        const prevAgentHasPinnedModel = Boolean(
                            prevAgent?.model?.providerId === currentProviderId
                            && prevAgent?.model?.modelId === currentModelId
                        );
                        const targetHasPinnedModel = Boolean(agent?.model);

                        // The user has a live manual model selection and the target
                        // agent configures no model of its own. Switching modes or
                        // agents must not reset the selection to the settings default
                        // (issue #2531) — mode switches are not model changes.
                        if (
                            !targetHasPinnedModel
                            && !prevAgentHasPinnedModel
                            && hadManualSelection
                            && currentProviderId
                            && currentModelId
                        ) {
                            // Keeping the pair in memory is not enough: without a write
                            // the settings default wins again after a reload. The removed
                            // ModelControls path persisted here, so this must too.
                            if (currentSessionId) {
                                const selection = useSelectionStore.getState();
                                selection.saveSessionModelSelection(currentSessionId, currentProviderId, currentModelId);
                                selection.saveAgentModelForSession(currentSessionId, agentName, currentProviderId, currentModelId);
                            }
                            return;
                        }

                        // If the agent has no preferred model, use settings default.
                        if (settingsDefaultModel) {
                            const parsed = parseModelString(settingsDefaultModel);
                            if (parsed) {
                                const settingsProvider = providers.find((p) => p.providerId === parsed.providerId);
                                if (settingsProvider?.models.some((model) => model.modelId === parsed.modelId)) {
                                    applyResolvedModelSelection(
                                        parsed.providerId,
                                        parsed.modelId,
                                        resolveVariantSelectionForModel(parsed.providerId, parsed.modelId),
                                        "auto",
                                    );
                                    return;
                                }
                            }
                        }

                        // Otherwise keep the current valid model selection unchanged.
                    }
                },

                // Fresh drafts resolve project preferences against the native workspace roster.
                dropStaleAutoSelection: () => {
                    const current = get();
                    if (!isStaleAutoSelection(current.currentProviderId, current.currentModelId)) return;
                    const projectDefaults = getProjectDefaultsForConfigDirectory(fromDirectoryKey(current.activeDirectoryKey));
                    const resolved = resolveProviderModelSelection({
                        providers: current.providers,
                        settingsDefaultModel: projectDefaults.projectDefaultModel || current.settingsDefaultModel,
                        settingsDefaultVariant: projectDefaults.projectDefaultModel ? projectDefaults.projectDefaultVariant : current.settingsDefaultVariant,
                        allowFallback: true,
                        fallbackPrefs: readFallbackModelPrefs(),
                    });
                    if (!resolved) return;
                    set((state) => {
                        const directoryKey = state.activeDirectoryKey;
                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: state.providers,
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            currentVariant: state.currentVariant,
                            currentAgentName: state.currentAgentName,
                            selectedProviderId: state.selectedProviderId,
                            agentModelSelections: state.agentModelSelections,
                            defaultProviders: state.defaultProviders,
                        };
                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            currentProviderId: resolved.providerId,
                            currentModelId: resolved.modelId,
                            currentVariant: resolved.variant,
                            currentVariantSelection: { override: undefined, inherited: resolved.variant },
                            selectionSource: "auto",
                        };
                        return {
                            currentProviderId: resolved.providerId,
                            currentModelId: resolved.modelId,
                            currentVariant: resolved.variant,
                            currentVariantSelection: { override: undefined, inherited: resolved.variant },
                            selectionSource: "auto",
                            directoryScoped: { ...state.directoryScoped, [directoryKey]: nextSnapshot },
                        };
                    });
                    // The session remembers its own pick; overwrite the stale one so the
                    // next restore does not bring Auto back.
                    const sessionId = useSessionUIStore.getState().currentSessionId;
                    if (sessionId) {
                        const selection = useSelectionStore.getState();
                        selection.saveSessionModelSelection(sessionId, resolved.providerId, resolved.modelId);
                        if (current.currentAgentName) selection.saveAgentModelForSession(sessionId, current.currentAgentName, resolved.providerId, resolved.modelId);
                    }
                },

                applyDefaultModelAgentSelection: (options) => {
                    const projectDefaults = options ?? getProjectDefaultsForConfigDirectory(fromDirectoryKey(get().activeDirectoryKey));
                    const {
                        activeDirectoryKey,
                        providers,
                        settingsDefaultModel,
                        settingsDefaultVariant,
                        settingsDefaultAgent,
                        opencodeDefaultModel,
                    } = get();
                    const agents = selectAgentsForDirectory(useAgentsStore.getState(), fromDirectoryKey(activeDirectoryKey));
                    const {
                        agentName: resolvedAgentName,
                        providerId: resolvedProviderId,
                        modelId: resolvedModelId,
                        variant: resolvedVariant,
                    } = resolveDefaultAgentModelSelection({
                        agents,
                        providers,
                        ...projectDefaults,
                        settingsDefaultAgent,
                        settingsDefaultModel,
                        settingsDefaultVariant,
                        opencodeDefaultModel,
                        allowFallback: get().settingsDefaultsLoaded,
                        fallbackPrefs: readFallbackModelPrefs(),
                    });

                    set((state) => {
                        const directoryKey = state.activeDirectoryKey;
                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: state.providers,
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            currentVariant: state.currentVariant,
                            currentAgentName: state.currentAgentName,
                            selectedProviderId: state.selectedProviderId,
                            agentModelSelections: state.agentModelSelections,
                            defaultProviders: state.defaultProviders,
                        };

                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            currentAgentName: resolvedAgentName,
                            currentProviderId: resolvedProviderId ?? '',
                            currentModelId: resolvedModelId ?? '',
                            currentVariant: resolvedVariant,
                            currentVariantSelection: { override: undefined, inherited: resolvedVariant },
                            selectionSource: "auto",
                            agentSelectionSource: "auto",
                        };

                        const nextState: Partial<ConfigStore> = {
                            currentAgentName: resolvedAgentName,
                            currentProviderId: nextSnapshot.currentProviderId,
                            currentModelId: nextSnapshot.currentModelId,
                            currentVariant: resolvedVariant,
                            currentVariantSelection: { override: undefined, inherited: resolvedVariant },
                            selectionSource: "auto",
                            agentSelectionSource: "auto",
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };

                        return nextState;
                    });
                },

                applyOpenCodeConfigDefaults: (directory, source = "syncConfig", config) => {
                    const eventDirectory = directory ?? fromDirectoryKey(get().activeDirectoryKey);
                    const directoryKey = toConfigDirectoryKey(eventDirectory);
                    const configDirectory = fromDirectoryKey(directoryKey);
                    const syncedConfig = config
                        ?? getSyncConfig(eventDirectory ?? undefined)
                        ?? getSyncConfig(configDirectory ?? undefined);
                    if (!syncedConfig) {
                        return;
                    }

                    const opencodeDefaultModel = configModelIdentifier(isConfigModelValue(syncedConfig.model) ? syncedConfig.model : undefined);
                    const projectDefaults = getProjectDefaultsForConfigDirectory(configDirectory);

                    set((state) => {
                        const snapshot = state.directoryScoped[directoryKey];
                        const isActive = state.activeDirectoryKey === directoryKey;
                        const providers = isActive ? state.providers : (snapshot?.providers ?? []);
                        const agents = selectAgentsForDirectory(useAgentsStore.getState(), configDirectory);
                        const baseSnapshot: DirectoryScopedConfig = snapshot ?? createEmptyDirectoryScopedConfig(providers);
                        const defaultsChanged = baseSnapshot.opencodeDefaultModel !== opencodeDefaultModel
                            || (isActive && state.opencodeDefaultModel !== opencodeDefaultModel);
                        const defaultsSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            providers,
                            opencodeDefaultModel,
                        };
                        const nextState: Partial<ConfigStore> = {
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: defaultsSnapshot,
                            },
                        };

                        if (isActive) {
                            nextState.opencodeDefaultModel = opencodeDefaultModel;
                        }

                        const selectionSource = isActive ? state.selectionSource : (snapshot?.selectionSource ?? "auto");
                        const agentSelectionSource = isActive ? state.agentSelectionSource : (snapshot?.agentSelectionSource ?? "auto");

                        if (providers.length === 0 || agents.length === 0) {
                            if (!defaultsChanged) {
                                return state;
                            }
                            return nextState;
                        }

                        const resolved = resolveDefaultAgentModelSelection({
                            agents,
                            providers,
                            projectDefaultAgent: projectDefaults.projectDefaultAgent,
                            projectDefaultModel: projectDefaults.projectDefaultModel,
                            projectDefaultVariant: projectDefaults.projectDefaultVariant,
                            settingsDefaultAgent: state.settingsDefaultAgent,
                            settingsDefaultModel: state.settingsDefaultModel,
                            settingsDefaultVariant: state.settingsDefaultVariant,
                            opencodeDefaultModel,
                            allowFallback: state.settingsDefaultsLoaded,
                            fallbackPrefs: readFallbackModelPrefs(),
                        });

                        if (!resolved.agentName) {
                            if (!defaultsChanged) {
                                return state;
                            }
                            return nextState;
                        }

                        const currentAgentName = isActive ? state.currentAgentName : baseSnapshot.currentAgentName;
                        const currentProviderId = isActive ? state.currentProviderId : baseSnapshot.currentProviderId;
                        const currentModelId = isActive ? state.currentModelId : baseSnapshot.currentModelId;
                        const currentVariant = isActive ? state.currentVariant : baseSnapshot.currentVariant;
                        const nextSelection = resolveSelectionWithManualGuard({
                            currentAgentName,
                            currentProviderId,
                            currentModelId,
                            currentVariant,
                            selectionSource,
                            agentSelectionSource,
                            resolvedAgentName: resolved.agentName,
                            resolvedProviderId: resolved.providerId,
                            resolvedModelId: resolved.modelId,
                            resolvedVariant: resolved.variant,
                        });

                        const heldVariantSelection = isActive ? state.currentVariantSelection : baseSnapshot.currentVariantSelection;
                        const nextVariant = variantAfterResolve(heldVariantSelection, nextSelection.variant);
                        const nextSnapshot: DirectoryScopedConfig = {
                            ...defaultsSnapshot,
                            providers,
                            currentAgentName: nextSelection.agentName,
                            currentVariantSelection: nextSelection.selectionSource === 'manual'
                                || heldVariantSelection?.override !== undefined
                                ? heldVariantSelection
                                : { override: undefined, inherited: nextSelection.variant },
                            ...(nextSelection.providerId && nextSelection.modelId
                                ? {
                                    currentProviderId: nextSelection.providerId,
                                    currentModelId: nextSelection.modelId,
                                    currentVariant: nextVariant,
                                }
                                : {}),
                            selectionSource: nextSelection.selectionSource,
                        };

                        const selectionChanged = baseSnapshot.currentAgentName !== nextSnapshot.currentAgentName
                            || baseSnapshot.currentProviderId !== nextSnapshot.currentProviderId
                            || baseSnapshot.currentModelId !== nextSnapshot.currentModelId
                            || baseSnapshot.currentVariant !== nextSnapshot.currentVariant
                            || baseSnapshot.selectedProviderId !== nextSnapshot.selectedProviderId
                            || (baseSnapshot.selectionSource ?? "auto") !== nextSnapshot.selectionSource
                            || (isActive && (
                                state.currentAgentName !== nextSelection.agentName
                                || state.selectionSource !== nextSelection.selectionSource
                                || (nextSelection.providerId !== undefined && nextSelection.modelId !== undefined && (
                                    state.currentProviderId !== nextSelection.providerId
                                    || state.currentModelId !== nextSelection.modelId
                                    || state.currentVariant !== nextVariant
                                ))
                            ));

                        if (!defaultsChanged && !selectionChanged) {
                            return state;
                        }

                        nextState.directoryScoped = {
                            ...state.directoryScoped,
                            [directoryKey]: nextSnapshot,
                        };

                        if (isActive) {
                            nextState.currentAgentName = nextSelection.agentName;
                            nextState.selectionSource = nextSelection.selectionSource;
                            if (nextSelection.providerId && nextSelection.modelId) {
                                nextState.currentProviderId = nextSelection.providerId;
                                nextState.currentModelId = nextSelection.modelId;
                                nextState.currentVariant = nextVariant;
                                nextState.currentVariantSelection = nextSnapshot.currentVariantSelection ?? { override: undefined, inherited: nextSelection.variant };
                            }
                        }

                        markStartupTrace('config:syncModelDefaultsApplied', { directoryKey, eventDirectory, source });
                        return nextState;
                    });
                },

                 setSettingsDefaultModel: (model: string | undefined) => {
                     recordOpenChamberDefaultsChange();
                     set({ settingsDefaultModel: model });
                     if (!useSessionUIStore.getState().currentSessionId) get().applyDefaultModelAgentSelection();
                 },

                 setSettingsDefaultVariant: (variant: string | undefined) => {
                     recordOpenChamberDefaultsChange();
                     set({ settingsDefaultVariant: variant });
                     if (!useSessionUIStore.getState().currentSessionId) get().applyDefaultModelAgentSelection();
                 },
 
                 setSettingsDefaultAgent: (agent: string | undefined) => {
                     recordOpenChamberDefaultsChange();
                     set({ settingsDefaultAgent: agent });
                     if (!useSessionUIStore.getState().currentSessionId) get().applyDefaultModelAgentSelection();
                 },

                setSettingsAutoCreateWorktree: (enabled: boolean) => {
                    set({ settingsAutoCreateWorktree: enabled });
                },

                setSettingsGitmojiEnabled: (enabled: boolean) => {
                    set({ settingsGitmojiEnabled: enabled });
                },

                setSettingsDefaultFileViewerPreview: (enabled: boolean) => {
                    set({ settingsDefaultFileViewerPreview: enabled });
                },

                setSettingsZenModel: (model: string | undefined) => {
                    set({ settingsZenModel: model });
                },

                setSettingsMessageStreamTransport: (transport: 'auto' | 'ws' | 'sse') => {
                    set({ settingsMessageStreamTransport: transport });
                },

                getResolvedGitGenerationModel: () => {
                    const state = get();
                    return resolveGitGenerationModelSelection({
                        providers: state.providers,
                        settingsZenModel: state.settingsZenModel,
                    });
                },

                setVoiceProvider: (provider: 'browser' | 'local' | 'openai' | 'openai-compatible' | 'say') => {
                    set({ voiceProvider: provider });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('voiceProvider', provider);
                    }
                },

                setSpeechRate: (rate: number) => {
                    const clampedRate = Math.max(0.5, Math.min(2, rate));
                    set({ speechRate: clampedRate });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('speechRate', String(clampedRate));
                    }
                },

                setSpeechPitch: (pitch: number) => {
                    const clampedPitch = Math.max(0.5, Math.min(2, pitch));
                    set({ speechPitch: clampedPitch });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('speechPitch', String(clampedPitch));
                    }
                },

                setSpeechVolume: (volume: number) => {
                    const clampedVolume = Math.max(0, Math.min(1, volume));
                    set({ speechVolume: clampedVolume });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('speechVolume', String(clampedVolume));
                    }
                },

                setSayVoice: (voice: string) => {
                    set({ sayVoice: voice });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('sayVoice', voice);
                    }
                },

                setLocalTtsVoiceId: (voiceId: number) => {
                    set({ localTtsVoiceId: voiceId });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('localTtsVoiceId', String(voiceId));
                    }
                },

                setLocalTtsModelId: (modelId: string) => {
                    set({ localTtsModelId: modelId });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('localTtsModelId', modelId);
                    }
                },

                setTtsFollowTextLanguage: (enabled: boolean) => {
                    set({ ttsFollowTextLanguage: enabled });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('ttsFollowTextLanguage', String(enabled));
                    }
                },

                setBrowserVoice: (voice: string) => {
                    set({ browserVoice: voice });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('browserVoice', voice);
                    }
                },

                setOpenaiVoice: (voice: string) => {
                    set({ openaiVoice: voice });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('openaiVoice', voice);
                    }
                },

                setVoiceApiKey: async (kind, apiKey) => {
                    try {
                        set({ voiceApiKeys: await updateVoiceApiKeys({ [kind]: apiKey }) });
                        return true;
                    } catch (error) {
                        console.warn('Failed to save voice API key:', error);
                        return false;
                    }
                },

                refreshVoiceApiKeys: (options) => {
                    // Every message's read-aloud button asks; one read per
                    // runtime answers them all.
                    const runtimeKey = getRuntimeKey();
                    if (!options?.force && voiceApiKeysLoad?.runtimeKey === runtimeKey) {
                        return voiceApiKeysLoad.promise;
                    }
                    const promise = (async () => {
                        try {
                            const migrated = await migrateLegacyVoiceApiKeys();
                            const voiceApiKeys = migrated ?? await fetchVoiceApiKeys();
                            if (getRuntimeKey() === runtimeKey) set({ voiceApiKeys });
                        } catch (error) {
                            // An offline server leaves keys unset, which offers setting one.
                            if (getRuntimeKey() === runtimeKey) set({ voiceApiKeys: EMPTY_VOICE_API_KEYS });
                            console.warn('Failed to read voice API keys:', error);
                        }
                    })();
                    voiceApiKeysLoad = { runtimeKey, promise };
                    return promise;
                },

                setOpenaiCompatibleUrl: (url: string) => {
                    set({ openaiCompatibleUrl: url });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('openaiCompatibleUrl', url);
                    }
                },


                setOpenaiCompatibleVoice: (voice: string) => {
                    set({ openaiCompatibleVoice: voice });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('openaiCompatibleVoice', voice);
                    }
                },

                setOpenaiCompatibleTtsModel: (model: string) => {
                    set({ openaiCompatibleTtsModel: model });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('openaiCompatibleTtsModel', model);
                    }
                },

                setDictationEnabled: (enabled: boolean) => {
                    set({ dictationEnabled: enabled });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('dictationEnabled', String(enabled));
                    }
                    updateDesktopSettings({ dictationEnabled: enabled }).catch(() => {});
                },

                setSttProvider: (provider: 'local' | 'openai-compatible') => {
                    set({ sttProvider: provider });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('sttProvider', provider);
                    }
                    updateDesktopSettings({ sttProvider: provider }).catch(() => {});
                },

                setSttServerUrl: (url: string) => {
                    set({ sttServerUrl: url });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('sttServerUrl', url);
                    }
                    updateDesktopSettings({ sttServerUrl: url }).catch(() => {});
                },


                setSttModel: (model: string) => {
                    set({ sttModel: model });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('sttModel', model);
                    }
                    updateDesktopSettings({ sttModel: model }).catch(() => {});
                },

                setSttLocalModel: (model: string) => {
                    set({ sttLocalModel: model });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('sttLocalModel', model);
                    }
                    updateDesktopSettings({ sttLocalModel: model }).catch(() => {});
                },

                setSttLanguage: (lang: string) => {
                    set({ sttLanguage: lang });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('sttLanguage', lang);
                    }
                    updateDesktopSettings({ sttLanguage: lang }).catch(() => {});
                },

                setShowMessageTTSButtons: (show: boolean) => {
                    set({ showMessageTTSButtons: show });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('showMessageTTSButtons', String(show));
                    }
                },

                setTtsInputMode: (mode: 'sanitized' | 'raw' | 'summarized') => {
                    set({ ttsInputMode: mode });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('ttsInputMode', mode);
                    }
                },

                setTtsChunkedMode: (enabled: boolean) => {
                    set({ ttsChunkedMode: enabled });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('ttsChunkedMode', String(enabled));
                    }
                },

                setSummarizeMessageTTS: (enabled: boolean) => {
                    set({ summarizeMessageTTS: enabled });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('summarizeMessageTTS', String(enabled));
                    }
                },

                setSummarizeVoiceConversation: (enabled: boolean) => {
                    set({ summarizeVoiceConversation: enabled });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('summarizeVoiceConversation', String(enabled));
                    }
                },

                setSummarizeCharacterThreshold: (threshold: number) => {
                    const clamped = Math.max(50, Math.min(2000, threshold));
                    set({ summarizeCharacterThreshold: clamped });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('summarizeCharacterThreshold', String(clamped));
                    }
                },

                setSummarizeMaxLength: (maxLength: number) => {
                    const clamped = Math.max(50, Math.min(2000, maxLength));
                    set({ summarizeMaxLength: clamped });
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('summarizeMaxLength', String(clamped));
                    }
                },

                probeConnection: async (options?: { timeoutMs?: number }) => {
                    const isHealthy = (await probeAgentServiceReadiness(options?.timeoutMs)) === 'ready';
                    if (isHealthy) {
                        set({ isConnected: true, hasEverConnected: true, connectionPhase: "connected" });
                        return true;
                    }

                    const state = get();
                    if (state.isConnected) {
                        return true;
                    }

                    set({
                        isConnected: false,
                        connectionPhase: state.hasEverConnected ? "reconnecting" : "connecting",
                        lastDisconnectReason: 'health_probe_unhealthy',
                    });
                    return false;
                },

                checkConnection: async () => {
                    const runtimeContext = captureConfigRuntimeContext();
                    markStartupTrace('checkConnection:start');
                    const maxAttempts = 5;
                    let attempt = 0;
                    let lastError: unknown = null;
                    let lastProbe: AgentServiceReadiness = 'unreachable';

                    while (attempt < maxAttempts) {
                        if (!isConfigRuntimeContextCurrent(runtimeContext)) return false;
                        try {
                            markStartupTrace('checkConnection:attempt', { attempt: attempt + 1 });
                            const probeStarted = Date.now();
                            lastProbe = await measureStartupTrace(
                                'checkConnection:agent-service',
                                () => probeAgentServiceReadiness(CONNECTION_HEALTH_WAIT_MS),
                                { attempt: attempt + 1 },
                            );
                            const isHealthy = lastProbe === 'ready';
                            if (!isConfigRuntimeContextCurrent(runtimeContext)) return false;
                            if (!isHealthy && attempt < maxAttempts - 1) {
                                const hasEverConnected = get().hasEverConnected;
                                set({
                                    isConnected: false,
                                    connectionPhase: hasEverConnected ? "reconnecting" : "connecting",
                                    lastDisconnectReason: 'health_check_unhealthy',
                                });
                                attempt += 1;
                                // A host that held the answer has already waited; one that
                                // answered at once (an older host or an unreachable
                                // server) keeps the old pacing.
                                await sleep(Math.max(0, 400 * attempt - (Date.now() - probeStarted)));
                                continue;
                            }

                            const hasEverConnected = get().hasEverConnected;
                            set(isHealthy
                                ? { isConnected: true, hasEverConnected: true, connectionPhase: "connected" }
                                : {
                                    isConnected: false,
                                    connectionPhase: hasEverConnected ? "reconnecting" : "connecting",
                                    lastDisconnectReason: lastProbe === 'unreachable' ? 'health_check_failed' : 'health_check_unhealthy',
                                });
                            markStartupTrace('checkConnection:end', { healthy: isHealthy, attempts: attempt + 1 });
                            return isHealthy;
                        } catch (error) {
                            lastError = error;
                            attempt += 1;
                            const delay = 400 * attempt;
                            await sleep(delay);
                        }
                    }

                    if (!isConfigRuntimeContextCurrent(runtimeContext)) return false;
                    if (lastError) {
                        console.warn("[ConfigStore] Failed to reach Agent Service after retrying:", lastError);
                    }
                    set({
                        isConnected: false,
                        connectionPhase: get().hasEverConnected ? "reconnecting" : "connecting",
                        lastDisconnectReason: 'health_check_failed',
                    });
                    markStartupTrace('checkConnection:end', { healthy: false, attempts: maxAttempts });
                    return false;
                },

                initializeApp: async () => {
                    if (_initializeAppInFlight) {
                        markStartupTrace('initializeApp:deduped');
                        return _initializeAppInFlight;
                    }

                    const runtimeContext = captureConfigRuntimeContext();
                    const run = (async () => {
                        const initStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
                        markStartupTrace('initializeApp:start');
                        try {
                            const debug = streamDebugEnabled();
                            if (debug) console.log("Starting app initialization...");

                            // OpenChamber preferences do not depend on OpenCode health
                            // or project discovery. Publish a known choice immediately.
                            void get().loadSessionDefaults();
                            const isConnected = await get().checkConnection();
                            if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                            if (debug) console.log("Connection check result:", isConnected);

                            if (!isConnected) {
                                if (debug) console.log("Server not connected");
                                // checkConnection already set lastDisconnectReason; do not overwrite.
                                set({
                                    isConnected: false,
                                    connectionPhase: get().hasEverConnected ? "reconnecting" : "connecting",
                                    lastInitFailure: {
                                        step: get().lastDisconnectReason === 'health_check_unhealthy' ? 'agentServiceUnavailable' : 'serverUnreachable',
                                        message: null,
                                    },
                                });
                                return;
                            }

                            if (debug) console.log("Initializing app...");
                            markStartupTrace('initApp:skipped', { reason: 'checkConnection already verified health' });

                            // Catalog owners preserve their last valid workspace snapshot on failure.
                            const initialDirectory = hostFilesystem.getDirectory()
                                ?? useDirectoryStore.getState().currentDirectory
                                ?? fromDirectoryKey(get().activeDirectoryKey);
                            const resolvedProject = resolveProjectForSessionDirectory(
                                useProjectsStore.getState().projects,
                                useSessionUIStore.getState().availableWorktreesByProject,
                                initialDirectory ?? null,
                            );
                            const resolvedInitialDirectory = (resolvedProject || resolveProjectDirectory(initialDirectory))
                                ? resolveConfigDirectory(initialDirectory)
                                : null;
                            const configDirectory = resolvedInitialDirectory ?? getFallbackProjectDirectory();
                            if (!configDirectory) {
                                markStartupTrace('initializeApp:noProjectConfigDirectory');
                                set({ isInitialized: true, isConnected: true, hasEverConnected: true, connectionPhase: "connected", lastInitFailure: null });
                                return;
                            }
                            if (!resolvedInitialDirectory && initialDirectory !== configDirectory) {
                                markStartupTrace('initializeApp:normalizedUnknownDirectoryToProject', {
                                    initialDirectory,
                                    configDirectory,
                                });
                                hostFilesystem.setDirectory(configDirectory);
                                useDirectoryStore.getState().setDirectory(configDirectory, { showOverlay: false });
                            }
                            const configDirectoryKey = toDirectoryKey(configDirectory);
                            if (get().activeDirectoryKey !== configDirectoryKey) {
                                set({ activeDirectoryKey: configDirectoryKey });
                                void hydrateConfigCatalogFromCache(configDirectoryKey);
                            }

                            if (debug) console.log("Loading providers and agents...");
                            await Promise.all([
                                get().loadProviders({ directory: configDirectory, source: 'initializeApp' }),
                                useAgentsStore.getState().loadAgents(configDirectory),
                            ]);

                            if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                            if (!useSessionUIStore.getState().currentSessionId
                                && get().selectionSource === 'auto' && get().agentSelectionSource === 'auto'
                                && get().currentVariantSelection.override === undefined) {
                                get().applyDefaultModelAgentSelection();
                            }
                            set({ isInitialized: true, isConnected: true, hasEverConnected: true, connectionPhase: "connected", lastInitFailure: null });
                            const initEnded = typeof performance !== 'undefined' ? performance.now() : Date.now();
                            markStartupTrace('initializeApp:end', {
                                durationMs: Math.round(initEnded - initStarted),
                                providers: get().providers.length,
                                agents: selectAgentsForDirectory(useAgentsStore.getState(), configDirectory).length,
                            });
                            if (debug) console.log("App initialized successfully");
                        } catch (error) {
                            if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                            console.error("Failed to initialize app:", error);
                            set({
                                isInitialized: false,
                                isConnected: false,
                                connectionPhase: get().hasEverConnected ? "reconnecting" : "connecting",
                                lastDisconnectReason: 'init_error',
                                lastInitFailure: { step: 'unexpected', message: (error instanceof Error ? error.message : String(error)) || null },
                            });
                            markStartupTrace('initializeApp:error', { error: error instanceof Error ? error.message : String(error) });
                        }
                    })().finally(() => {
                        if (_initializeAppInFlight === run) _initializeAppInFlight = null;
                    });

                    _initializeAppInFlight = run;
                    return run;
                },

                getCurrentProvider: () => {
                    const { providers, currentProviderId } = get();
                    return providers.find((p) => p.providerId === currentProviderId);
                },

                getCurrentModel: () => {
                    const provider = get().getCurrentProvider();
                    const { currentModelId } = get();
                    if (!provider) {
                        return undefined;
                    }
                    return provider.models.find((model) => model.modelId === currentModelId);
                },

                getModelMetadata: (providerId: string, modelId: string) => {
                    const key = buildModelMetadataKey(providerId, modelId);
                    if (!key) {
                        return undefined;
                    }
                    const { modelsMetadata, providers } = get();
                    const cached = modelsMetadata.get(key);
                    const model = providers.find((p) => p.providerId === providerId)?.models.find((entry) => entry.modelId === modelId);

                    // The running OpenCode's limits win over the models.dev
                    // catalog: providers adjust them per auth (ChatGPT sign-in
                    // serves GPT models with a 400K window, the catalog says 1M+).
                    if (cached) {
                        if (!model || model.contextWindow <= 0) return cached;
                        return { ...cached, limit: { ...cached.limit, context: model.contextWindow, output: model.maxOutputTokens } };
                    }

                    // Fallback: derive metadata from provider model data (covers custom providers not in models.dev)
                    return model ? deriveModelMetadata(providerId, model) : undefined;
                },
            }),
            {
                name: "config-store",
                storage: createDeferredSafeJSONStorage(),
                // Version 1 is the slim format below. Builds without it read
                // `snapshot.agents` unguarded; the version bump makes them skip
                // this blob (they have no migrate) instead of crashing on it.
                version: 1,
                // SAFETY: a version-0 blob is the same shape plus catalogs, and
                // merge() is the one place that validates any persisted state.
                migrate: (persistedState) => persistedState as ConfigStore,
                merge: (persistedState, currentState) => {
                    // SAFETY: Zustand's storage boundary supplies an unknown
                    // partial store. Only an explicitly matching runtime may hydrate it.
                    const persisted = persistedState as Partial<ConfigStore> | undefined;
                    if (!persisted || persisted.configRuntimeKey !== getRuntimeKey()) return currentState;
                    for (const key of ['agents', 'agentsLoaded', 'opencodeDefaultAgent']) Reflect.deleteProperty(persisted, key);

                    const storedScopes = isRecord(persisted.directoryScoped) && !Array.isArray(persisted.directoryScoped)
                        ? persisted.directoryScoped
                        : currentState.directoryScoped;
                    const directoryScoped = { ...storedScopes };
                    for (const [directory, snapshot] of Object.entries(directoryScoped)) {
                        if (!isRecord(snapshot)) {
                            delete directoryScoped[directory];
                        } else if (snapshot.providers === undefined) {
                            // Version 1 persists selections without catalogs; give the
                            // snapshot the empty lists the store expects. With no
                            // `*Loaded` flag persisted, an empty list reads as not loaded.
                            directoryScoped[directory] = { ...snapshot, providers: [] };
                        } else if (!hasCompatibleCachedVariants(snapshot.providers)) {
                            directoryScoped[directory] = {
                                ...snapshot, providers: [], providersLoaded: false, defaultProviders: {},
                            };
                        }
                        const retained = directoryScoped[directory];
                        if (retained) {
                            for (const key of ['agents', 'agentsLoaded', 'opencodeDefaultAgent']) Reflect.deleteProperty(retained, key);
                        }
                    }

                    const merged = { ...currentState, ...persisted, directoryScoped };
                    if (persisted.providers !== undefined && !hasCompatibleCachedVariants(persisted.providers)) {
                        merged.providers = currentState.providers;
                        merged.providersLoaded = currentState.providersLoaded;
                        merged.defaultProviders = currentState.defaultProviders;
                    }
                    return hydrateActiveDirectorySnapshot(merged);
                },
                // Selections only. The provider and agent catalogs are not
                // persisted: large catalog payloads would make every selection
                // write unnecessarily expensive. On a cold start the
                // pickers wait for initializeApp() / activateDirectory() to load
                // the catalogs. Older blobs that still carry them hydrate as before.
                partialize: (state) => ({
                    configRuntimeKey: state.configRuntimeKey,
                    activeDirectoryKey: state.activeDirectoryKey,
                    directoryScoped: Object.fromEntries(
                        Object.entries(state.directoryScoped).map(([directoryKey, snapshot]) => [
                            directoryKey,
                            toPersistedDirectorySnapshot(snapshot),
                        ]),
                    ),
                    currentProviderId: state.currentProviderId,
                    currentModelId: state.currentModelId,
                    currentVariant: state.currentVariant,
                    currentVariantSelection: state.currentVariantSelection,
                    currentAgentName: state.currentAgentName,
                    selectedProviderId: sanitizePersistedSelectedProviderId(state.selectedProviderId),
                    agentModelSelections: state.agentModelSelections,
                    defaultProviders: state.defaultProviders,
                    settingsDefaultModel: state.settingsDefaultModel,
                    settingsDefaultVariant: state.settingsDefaultVariant,
                    settingsDefaultAgent: state.settingsDefaultAgent,
                    settingsAutoCreateWorktree: state.settingsAutoCreateWorktree,
                    settingsGitmojiEnabled: state.settingsGitmojiEnabled,
                    settingsDefaultFileViewerPreview: state.settingsDefaultFileViewerPreview,
                    settingsZenModel: state.settingsZenModel,
                    settingsMessageStreamTransport: state.settingsMessageStreamTransport,
                    dictationEnabled: state.dictationEnabled,
                    speechRate: state.speechRate,
                    speechPitch: state.speechPitch,
                    speechVolume: state.speechVolume,
                }),
             },
         ),
    ),
);

if (typeof window !== "undefined") {
    window.__zustand_config_store__ = useConfigStore;
}

// Show the last known catalogs of the active directory while OpenCode starts.
// After persist hydration, which restores the active directory key.
if (typeof window !== "undefined") {
    const hydrateActiveCatalog = () => void hydrateConfigCatalogFromCache(useConfigStore.getState().activeDirectoryKey);
    if (useConfigStore.persist.hasHydrated()) hydrateActiveCatalog();
    else useConfigStore.persist.onFinishHydration(hydrateActiveCatalog);
}

const refreshKnownProviderDirectories = async (source: string): Promise<void> => {
    const runtimeContext = captureConfigRuntimeContext();
    const state = useConfigStore.getState();
    const directoryKeys = Array.from(new Set([
        state.activeDirectoryKey,
        ...Object.keys(state.directoryScoped),
    ])).filter((key) => key.length > 0);

    state.invalidateProviderCache();

    let nextIndex = 0;
    const workerCount = Math.min(PROVIDER_CONFIG_REFRESH_CONCURRENCY, directoryKeys.length);
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < directoryKeys.length) {
            if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
            const directoryKey = directoryKeys[nextIndex];
            nextIndex += 1;
            await useConfigStore.getState().loadProviders({
                directory: fromDirectoryKey(directoryKey),
                source,
                fresh: true,
            });
        }
    });

    await Promise.all(workers);
};

let unsubscribeConfigStoreChanges: (() => void) | null = null;

if (!unsubscribeConfigStoreChanges) {
    unsubscribeConfigStoreChanges = subscribeToConfigChanges(async (event) => {
            const tasks: Promise<void>[] = [];



        if (scopeMatches(event, "providers")) {
            tasks.push(refreshKnownProviderDirectories('configChange:providers'));
        }

        if (tasks.length > 0) {
            await Promise.all(tasks);
        }
    });
}

let unsubscribeConfigStoreDirectoryChanges: (() => void) | null = null;

let unsubscribeConfigStoreSyncConfigChanges: (() => void) | null = null;

if (!unsubscribeConfigStoreSyncConfigChanges) {
    unsubscribeConfigStoreSyncConfigChanges = subscribeToSyncConfigChanges((directory, config) => {
        useConfigStore.getState().applyOpenCodeConfigDefaults(directory, 'syncConfig', config);
    });
}

if (typeof window !== "undefined" && !unsubscribeConfigStoreDirectoryChanges) {
    unsubscribeConfigStoreDirectoryChanges = useDirectoryStore.subscribe((state, prevState) => {
        const nextKey = toDirectoryKey(state.currentDirectory);
        const prevKey = toDirectoryKey(prevState.currentDirectory);
        if (nextKey === prevKey) {
            return;
        }

        markStartupTrace('directoryStore:changed', { previous: prevKey, next: nextKey });
        void hydrateConfigCatalogFromCache(toConfigDirectoryKey(state.currentDirectory));
        void useConfigStore.getState().activateDirectory(state.currentDirectory);
    });
}

// Auto is only a model while the server says so. Whenever that answer changes
// (routing state loaded or updated, the feature flag learned from settings,
// settings defaults loaded), a selection this server cannot honour is replaced.
let unsubscribeConfigStoreRoutingChanges: (() => void) | null = null;

if (typeof window !== "undefined" && !unsubscribeConfigStoreRoutingChanges) {
    const drop = () => useConfigStore.getState().dropStaleAutoSelection();
    const unsubscribeRouting = useRoutingStore.subscribe(drop);
    const unsubscribeUi = useUIStore.subscribe((state, prevState) => {
        if (state.routingFeatureAvailable !== prevState.routingFeatureAvailable) drop();
    });
    const unsubscribeSelf = useConfigStore.subscribe((state, prevState) => {
        if (state.settingsDefaultsLoaded && !prevState.settingsDefaultsLoaded) drop();
    });
    unsubscribeConfigStoreRoutingChanges = () => {
        unsubscribeRouting();
        unsubscribeUi();
        unsubscribeSelf();
    };
}
