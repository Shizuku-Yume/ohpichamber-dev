import { isAutoModel } from "@/lib/routing/autoModel";
import { useConfigStore } from "../useConfigStore";
import { useUIStore } from "@/stores/useUIStore";
import { useRoutingStore, selectAutoReady } from "@/stores/useRoutingStore";
import { type ConfigStore, type ProviderWithModelList, type ProviderModel, type ConfigSlice } from "./types";
import { toConfigDirectoryKey } from "./directories";
import { type Model } from "@openchamber/agent-contract";
import { buildModelMetadataKey, deriveModelMetadata } from "./metadata";

export const isStaleAutoSelection = (providerId?: string | null, modelId?: string | null): boolean => {
    if (!providerId || !modelId || !isAutoModel(providerId, modelId)) return false;
    if (!useConfigStore.getState().settingsDefaultsLoaded) return false;
    if (!useUIStore.getState().routingFeatureAvailable) return true;
    const routing = useRoutingStore.getState();
    return routing.loaded && !selectAutoReady(routing);
};
export const selectConfiguredModelPair = (state: Pick<ConfigStore, 'providers' | 'directoryScoped' | 'activeDirectoryKey' | 'currentProviderId' | 'currentModelId'>, directory?: string | null): {
    inActiveDirectory: boolean;
    providerId: string;
    modelId: string;
} => {
    if (directory == null) {
        return {
            inActiveDirectory: false,
            providerId: state.currentProviderId,
            modelId: state.currentModelId
        };
    }
    const directoryKey = toConfigDirectoryKey(directory);
    if (directoryKey === state.activeDirectoryKey) {
        return {
            inActiveDirectory: true,
            providerId: state.currentProviderId,
            modelId: state.currentModelId
        };
    }
    const scoped = state.directoryScoped[directoryKey];
    return {
        inActiveDirectory: false,
        providerId: scoped?.currentProviderId ?? '',
        modelId: scoped?.currentModelId ?? ''
    };
};
export const selectProvidersForDirectory = (state: Pick<ConfigStore, "providers" | "directoryScoped" | "activeDirectoryKey">, directory?: string | null): ProviderWithModelList[] => {
    if (directory == null) return state.providers;
    const directoryKey = toConfigDirectoryKey(directory);
    if (directoryKey === state.activeDirectoryKey) {
        return state.providers;
    }
    return state.directoryScoped[directoryKey]?.providers ?? EMPTY_PROVIDERS;
};
export const selectModelsForDirectory = (state: Pick<ConfigStore, "models" | "directoryScoped" | "activeDirectoryKey">, directory?: string | null): Model[] => {
    if (directory == null) return state.models;
    const directoryKey = toConfigDirectoryKey(directory);
    if (directoryKey === state.activeDirectoryKey) return state.models;
    return state.directoryScoped[directoryKey]?.models ?? EMPTY_MODELS;
};
const EMPTY_PROVIDERS: ProviderWithModelList[] = [];
const EMPTY_MODELS: Model[] = [];

/**
  * A model as any loaded catalog lists it: the active directory's first, then
  * the snapshots of the others. For display only. A directory OpenCode is still
  * starting answers with a partial catalog for a second or two, and the
  * composer keeps the name it already knows meanwhile instead of a raw id.
  * Selection, variants and validation stay on the active catalog.
  */
export const selectKnownCatalogModel = (state: Pick<ConfigStore, 'providers' | 'directoryScoped'>, providerId: string, modelId: string): ProviderModel | undefined => {
    const fromProviders = (providers: ProviderWithModelList[]) => providers.find(provider => provider.providerId === providerId)?.models.find(model => model.modelId === modelId);
    const active = fromProviders(state.providers);
    if (active) return active;
    for (const snapshot of Object.values(state.directoryScoped)) {
        const known = fromProviders(snapshot.providers);
        if (known) return known;
    }
    return undefined;
};
export const selectCatalogLoadedForDirectory = (state: Pick<ConfigStore, 'providersLoaded' | 'directoryScoped' | 'activeDirectoryKey'>, _resource: 'models', directory?: string | null): boolean => {
    if (directory === undefined) return state.providersLoaded;
    const key = toConfigDirectoryKey(directory);
    return key === state.activeDirectoryKey ? state.providersLoaded : state.directoryScoped[key]?.providersLoaded === true;
};
export const createConfigGetters: ConfigSlice<"getCurrentProvider" | "getCurrentModel" | "getModelMetadata"> = (_set, get) => ({
    getCurrentProvider: () => {
        const {
            providers,
            currentProviderId
        } = get();
        return providers.find(p => p.providerId === currentProviderId);
    },
    getCurrentModel: () => {
        const provider = get().getCurrentProvider();
        const {
            currentModelId
        } = get();
        if (!provider) {
            return undefined;
        }
        return provider.models.find(model => model.modelId === currentModelId);
    },
    getModelMetadata: (providerId: string, modelId: string) => {
        const key = buildModelMetadataKey(providerId, modelId);
        if (!key) {
            return undefined;
        }
        const {
            modelsMetadata,
            providers
        } = get();
        const cached = modelsMetadata.get(key);
        const model = providers.find(p => p.providerId === providerId)?.models.find(entry => entry.modelId === modelId);

        // The running OpenCode's limits win over the models.dev
        // catalog: providers adjust them per auth (ChatGPT sign-in
        // serves GPT models with a 400K window, the catalog says 1M+).
        if (cached) {
            if (!model || model.contextWindow <= 0) return cached;
            return {
                ...cached,
                limit: {
                    ...cached.limit,
                    context: model.contextWindow,
                    output: model.maxOutputTokens
                }
            };
        }

        // Fallback: derive metadata from provider model data (covers custom providers not in models.dev)
        return model ? deriveModelMetadata(providerId, model) : undefined;
    }
});
