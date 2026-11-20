import { type ProviderWithModelList, type ConfigSlice, type ConfigStore, type DirectoryScopedConfig } from "./types";
import { type ProviderCatalog, type ModelCatalog, type Model, modelRefKey, parseModelSelector } from "@openchamber/agent-contract";
import { captureConfigRuntimeContext, isConfigRuntimeContextCurrent } from "./runtime";
import { useConfigStore } from "../useConfigStore";
import { fromDirectoryKey, toDirectoryKey, resolveConfigDirectory } from "./directories";
import { markStartupTrace, measureStartupTrace } from "@/lib/startupTrace";
import { hostFilesystem } from "@/lib/host-filesystem";
import { getConfigLoadKey, _inFlightProviders } from "./catalogRequests";
import { ensureModelsMetadataFetch } from "./metadata";
import { canonicalClient } from "@/api/canonicalClient";
import { getProjectDefaultsForConfigDirectory } from "./projectDefaults";
import { resolveProviderModelSelection, readFallbackModelPrefs, variantAfterResolve } from "./selectionResolution";
import { _providersLoadedAt, persistLoadedCatalog, catalogLifecycle } from "./catalogLifecycle";

const PROVIDER_CONFIG_REFRESH_CONCURRENCY = 4;
const PROVIDERS_RETRY_SOURCE = "loadProviders:retryAfterFailure";
const PROVIDERS_RETRY_DELAY_MS = 3000;
const combineCanonicalCatalog = (providerCatalog: ProviderCatalog, modelCatalog: ModelCatalog): ProviderWithModelList[] => {
    const modelsByProvider = new Map<string, Model[]>();
    for (const model of modelCatalog.models) {
        if (model.enabled === false) continue;
        const bucket = modelsByProvider.get(model.provider);
        if (bucket) bucket.push(model);else modelsByProvider.set(model.provider, [model]);
    }
    return providerCatalog.providers.filter(provider => modelsByProvider.has(provider.providerId)).map(provider => ({
        ...provider,
        models: modelsByProvider.get(provider.providerId) ?? [],
        canonicalAuth: provider.auth
    }));
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
const isSameDefaults = (previous: {
    [key: string]: string;
}, next: {
    [key: string]: string;
}): boolean => {
    const previousKeys = Object.keys(previous);
    const nextKeys = Object.keys(next);
    if (previousKeys.length !== nextKeys.length) return false;
    return previousKeys.every(key => previous[key] === next[key]);
};

/** The last read of which voice keys the server holds, per runtime (see refreshVoiceApiKeys). */
export const refreshKnownProviderDirectories = async (source: string): Promise<void> => {
    const runtimeContext = captureConfigRuntimeContext();
    const state = useConfigStore.getState();
    const directoryKeys = Array.from(new Set([state.activeDirectoryKey, ...Object.keys(state.directoryScoped)])).filter(key => key.length > 0);
    state.invalidateProviderCache();
    let nextIndex = 0;
    const workerCount = Math.min(PROVIDER_CONFIG_REFRESH_CONCURRENCY, directoryKeys.length);
    const workers = Array.from({
        length: workerCount
    }, async () => {
        while (nextIndex < directoryKeys.length) {
            if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
            const directoryKey = directoryKeys[nextIndex];
            nextIndex += 1;
            await useConfigStore.getState().loadProviders({
                directory: fromDirectoryKey(directoryKey),
                source,
                fresh: true
            });
        }
    });
    await Promise.all(workers);
};
export const createProviderCatalog: ConfigSlice<"invalidateProviderCache" | "loadProviders"> = (set, get) => ({
    invalidateProviderCache: directory => {
        const targetDirectoryKey = directory === undefined ? null : toDirectoryKey(directory);
        set(state => {
            const nextState: Partial<ConfigStore> = {};
            let scopedChanged = false;
            const nextDirectoryScoped: Record<string, DirectoryScopedConfig> = {
                ...state.directoryScoped
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
                    defaultProviders: {}
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
    loadProviders: async options => {
        const runtimeContext = captureConfigRuntimeContext();
        const loadEpoch = catalogLifecycle.loadEpoch;
        const isCurrent = () => isConfigRuntimeContextCurrent(runtimeContext) && loadEpoch === catalogLifecycle.loadEpoch;
        const requestedDirectory = options?.directory ?? fromDirectoryKey(get().activeDirectoryKey);
        const configDirectory = resolveConfigDirectory(requestedDirectory);
        if (!configDirectory) {
            markStartupTrace('loadProviders:skippedUnknownDirectory', {
                requestedDirectory,
                source: options?.source ?? 'unknown'
            });
            return;
        }
        const effectiveDirectory = configDirectory ?? hostFilesystem.getDirectory() ?? null;
        const directoryKey = toDirectoryKey(configDirectory);
        const inFlightKey = getConfigLoadKey(runtimeContext, directoryKey);
        const source = options?.source ?? 'unknown';
        markStartupTrace('loadProviders:called', {
            directoryKey,
            source,
            requestedDirectory,
            effectiveDirectory
        });

        // Dedup: if a load is already in-flight for this directory, reuse it.
        // A fresh load waits it out instead: that request may have been
        // answered before the change that prompted this one.
        let existing = _inFlightProviders.get(inFlightKey);
        if (existing && options?.fresh) {
            await existing.catch(() => undefined);
            existing = _inFlightProviders.get(inFlightKey);
        }
        if (existing) {
            markStartupTrace('loadProviders:deduped', {
                directoryKey,
                source,
                requestedDirectory,
                effectiveDirectory
            });
            return existing;
        }
        const promise: Promise<void> = (async () => {
            if (!isCurrent()) return;
            const loaderStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
            markStartupTrace('loadProviders:start', {
                directoryKey,
                source,
                requestedDirectory,
                effectiveDirectory
            });
            const existingSnapshot = get().directoryScoped[directoryKey];
            const previousProviders = existingSnapshot?.providers ?? (get().activeDirectoryKey === directoryKey ? get().providers : []);
            const previousDefaults = existingSnapshot?.defaultProviders ?? (get().activeDirectoryKey === directoryKey ? get().defaultProviders : {});
            let lastError: unknown = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    ensureModelsMetadataFetch(() => get().modelsMetadata, metadata => {
                        if (isCurrent()) {
                            set({
                                modelsMetadata: metadata
                            });
                        }
                    });
                    const workspace = await measureStartupTrace('loadProviders:workspace', () => canonicalClient.resolveWorkspace(configDirectory), {
                        directoryKey,
                        source,
                        requestedDirectory,
                        effectiveDirectory,
                        attempt: attempt + 1
                    });
                    const [providerCatalog, modelCatalog] = await Promise.all([measureStartupTrace('loadProviders:providers', () => canonicalClient.getProviders(workspace.workspaceId), {
                        directoryKey,
                        source,
                        requestedDirectory,
                        effectiveDirectory,
                        attempt: attempt + 1
                    }), measureStartupTrace('loadProviders:models', () => canonicalClient.getModels(workspace.workspaceId), {
                        directoryKey,
                        source,
                        requestedDirectory,
                        effectiveDirectory,
                        attempt: attempt + 1
                    })]);
                    if (!isCurrent()) return;
                    const processedProviders = combineCanonicalCatalog(providerCatalog, modelCatalog);
                    // OMP resolves new-session defaults from modelRoles.default and
                    // defaultThinkingLevel; the app shows these instead of keeping
                    // its own default model or effort.
                    // An empty catalog is a directory still starting, not
                    // evidence that OMP lost its default; keep the last
                    // resolved default until a real catalog replaces it.
                    const keepPreviousDefaults = modelCatalog.models.length === 0 && modelCatalog.defaults.model === null;
                    const ompDefaultModel = modelCatalog.defaults.model ? modelRefKey(modelCatalog.defaults.model.providerId, modelCatalog.defaults.model.modelId) : undefined;
                    const ompDefaultReasoningEffort = modelCatalog.defaults.thinkingLevel ?? undefined;
                    const defaults: Record<string, string> = {};
                    if (!isCurrent()) return;
                    // A re-read that returns the same catalog keeps the arrays the
                    // store already holds, so nothing subscribed to them re-renders.
                    const nextProviders = isSameProviderCatalog(previousProviders, processedProviders) ? previousProviders : processedProviders;
                    const nextDefaults = isSameDefaults(previousDefaults, defaults) ? previousDefaults : defaults;
                    set(state => {
                        if (!isCurrent()) return state;
                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: [],
                            currentProviderId: "",
                            currentModelId: "",
                            currentAgentName: undefined,
                            selectedProviderId: "",
                            agentModelSelections: {},
                            defaultProviders: {}
                        };
                        const currentProviderId = state.activeDirectoryKey === directoryKey ? state.currentProviderId : baseSnapshot.currentProviderId;
                        const currentModelId = state.activeDirectoryKey === directoryKey ? state.currentModelId : baseSnapshot.currentModelId;
                        const currentVariant = state.activeDirectoryKey === directoryKey ? state.currentVariant : baseSnapshot.currentVariant;
                        const projectDefaults = getProjectDefaultsForConfigDirectory(fromDirectoryKey(directoryKey));
                        const resolvedModel = resolveProviderModelSelection({
                            providers: nextProviders,
                            currentProviderId,
                            currentModelId,
                            currentVariant,
                            preserveCurrent: (state.activeDirectoryKey === directoryKey ? state.selectionSource : baseSnapshot.selectionSource) === 'manual',
                            settingsDefaultModel: projectDefaults.projectDefaultModel || ompDefaultModel,
                            defaultVariant: projectDefaults.projectDefaultModel ? projectDefaults.projectDefaultVariant : undefined,
                            allowFallback: state.settingsDefaultsLoaded,
                            fallbackPrefs: readFallbackModelPrefs()
                        });
                        const currentSelectedProviderId = state.activeDirectoryKey === directoryKey ? state.selectedProviderId : baseSnapshot.selectedProviderId;
                        // The Providers settings selection belongs to the user, not to this
                        // loader. A refresh may report a different provider set — an OpenCode
                        // restart drops plugin-registered providers until they re-register —
                        // and re-deriving a selection here yanked the open provider away
                        // mid-edit. Keep whatever is selected; only fill in an empty one.
                        // The add-provider sentinel is kept for the same reason (issue #1765).
                        const selectedProviderId = currentSelectedProviderId ? currentSelectedProviderId : resolvedModel?.providerId ?? nextProviders[0]?.providerId ?? "";
                        const heldVariantSelection = state.activeDirectoryKey === directoryKey ? state.currentVariantSelection : baseSnapshot.currentVariantSelection;
                        const pickedVariant = heldVariantSelection?.override;
                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            providers: nextProviders,
                            models: modelCatalog.models,
                            providersLoaded: true,
                            defaultProviders: nextDefaults,
                            currentProviderId: resolvedModel?.providerId ?? "",
                            currentModelId: resolvedModel?.modelId ?? "",
                            currentVariant: variantAfterResolve(heldVariantSelection, resolvedModel?.variant),
                            currentVariantSelection: (state.activeDirectoryKey === directoryKey ? state.selectionSource : baseSnapshot.selectionSource) === 'manual' || pickedVariant !== undefined ? heldVariantSelection : {
                                override: undefined,
                                inherited: resolvedModel?.variant
                            },
                            selectedProviderId
                        };
                        if (baseSnapshot.providers === nextSnapshot.providers && baseSnapshot.models === nextSnapshot.models && baseSnapshot.providersLoaded === true && baseSnapshot.defaultProviders === nextSnapshot.defaultProviders && baseSnapshot.currentProviderId === nextSnapshot.currentProviderId && baseSnapshot.currentModelId === nextSnapshot.currentModelId && baseSnapshot.currentVariant === nextSnapshot.currentVariant && baseSnapshot.selectedProviderId === nextSnapshot.selectedProviderId && (state.activeDirectoryKey !== directoryKey || state.providers === nextSnapshot.providers && state.models === nextSnapshot.models && state.providersLoaded && state.defaultProviders === nextSnapshot.defaultProviders && state.currentProviderId === nextSnapshot.currentProviderId && state.currentModelId === nextSnapshot.currentModelId && state.currentVariant === nextSnapshot.currentVariant && state.selectedProviderId === nextSnapshot.selectedProviderId && state.workspaceId === workspace.workspaceId && state.settingsDefaultModel === ompDefaultModel && state.settingsDefaultReasoningEffort === ompDefaultReasoningEffort)) {
                            return state;
                        }
                        const nextState: Partial<ConfigStore> = {
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot
                            }
                        };
                        if (state.activeDirectoryKey === directoryKey) {
                            nextState.providers = nextProviders;
                            nextState.models = modelCatalog.models;
                            nextState.providersLoaded = true;
                            nextState.workspaceId = workspace.workspaceId;
                            void get().loadOmpSettings(workspace.workspaceId);
                            nextState.defaultProviders = nextDefaults;
                            nextState.currentProviderId = nextSnapshot.currentProviderId;
                            nextState.currentModelId = nextSnapshot.currentModelId;
                            nextState.currentVariant = nextSnapshot.currentVariant;
                            nextState.currentVariantSelection = nextSnapshot.currentVariantSelection ?? {
                                override: undefined,
                                inherited: nextSnapshot.currentVariant
                            };
                            nextState.selectedProviderId = selectedProviderId;
                            nextState.settingsDefaultModel = keepPreviousDefaults ? state.settingsDefaultModel : ompDefaultModel;
                            nextState.settingsDefaultReasoningEffort = keepPreviousDefaults ? state.settingsDefaultReasoningEffort : ompDefaultReasoningEffort;
                        }
                        return nextState;
                    });
                    if (!isCurrent()) return;
                    const loaderEnded = typeof performance !== 'undefined' ? performance.now() : Date.now();
                    markStartupTrace('loadProviders:end', {
                        directoryKey,
                        source,
                        requestedDirectory,
                        effectiveDirectory,
                        durationMs: Math.round(loaderEnded - loaderStarted),
                        providers: processedProviders.length,
                        models: processedProviders.reduce((count, provider) => count + provider.models.length, 0)
                    });
                    _providersLoadedAt.set(directoryKey, Date.now());
                    persistLoadedCatalog(runtimeContext, directoryKey, source, {
                        providers: nextProviders,
                        defaultProviders: nextDefaults
                    }, false, loadEpoch);
                    return;
                } catch (error) {
                    lastError = error;
                    markStartupTrace('loadProviders:attemptError', {
                        directoryKey,
                        source,
                        requestedDirectory,
                        effectiveDirectory,
                        attempt: attempt + 1,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    const waitMs = 200 * (attempt + 1);
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                    if (!isCurrent()) return;
                }
            }
            if (!isCurrent()) return;
            console.error("Failed to load providers:", lastError);
            markStartupTrace('loadProviders:error', {
                directoryKey,
                source,
                requestedDirectory,
                effectiveDirectory,
                error: lastError instanceof Error ? lastError.message : String(lastError)
            });
            if (!isCurrent()) return;
            set(state => {
                if (!isCurrent()) return state;
                const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                    providers: [],
                    currentProviderId: "",
                    currentModelId: "",
                    currentAgentName: undefined,
                    selectedProviderId: "",
                    agentModelSelections: {},
                    defaultProviders: {}
                };
                const nextSnapshot: DirectoryScopedConfig = {
                    ...baseSnapshot,
                    providers: previousProviders,
                    defaultProviders: previousDefaults
                };
                const nextState: Partial<ConfigStore> = {
                    directoryScoped: {
                        ...state.directoryScoped,
                        [directoryKey]: nextSnapshot
                    }
                };
                if (state.activeDirectoryKey === directoryKey) {
                    nextState.providers = previousProviders;
                    nextState.defaultProviders = previousDefaults;
                    if (!state.currentProviderId && !state.currentModelId && state.settingsDefaultModel) {
                        const parsed = parseModelSelector(state.settingsDefaultModel);
                        if (parsed) {
                            const settingsProvider = previousProviders.find(p => p.providerId === parsed.providerId);
                            const model = settingsProvider?.models.find(entry => entry.modelId === parsed.modelId);
                            if (model) {
                                nextState.currentProviderId = parsed.providerId;
                                nextState.currentModelId = parsed.modelId;
                                nextState.currentVariant = undefined;
                                nextSnapshot.currentProviderId = parsed.providerId;
                                nextSnapshot.currentModelId = parsed.modelId;
                                nextSnapshot.currentVariant = undefined;

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
                    if (!isCurrent()) return;
                    const state = get();
                    if (state.activeDirectoryKey !== directoryKey || state.directoryScoped[directoryKey]?.providersLoaded) return;
                    void state.loadProviders({
                        directory: fromDirectoryKey(directoryKey),
                        source: PROVIDERS_RETRY_SOURCE
                    });
                }, PROVIDERS_RETRY_DELAY_MS);
            }
        })().finally(() => {
            if (_inFlightProviders.get(inFlightKey) === promise) _inFlightProviders.delete(inFlightKey);
        });
        _inFlightProviders.set(inFlightKey, promise);
        return promise;
    }
});
