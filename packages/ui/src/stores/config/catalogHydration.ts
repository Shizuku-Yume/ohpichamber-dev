import { type ConfigStore, type ProviderWithModelList } from "./types";
import { readLocalCatalogSnapshot, type CachedCatalog, readCachedCatalog } from "../configCatalogCache";
import { getRuntimeKey } from "@/lib/runtime-switch";
import { type ConfigRuntimeContext, isConfigRuntimeContextCurrent, captureConfigRuntimeContext } from "./runtime";
import { useConfigStore } from "../useConfigStore";
import { createEmptyDirectoryScopedConfig } from "./directorySnapshots";
import { DIRECTORY_KEY_GLOBAL } from "./directories";

/**
  * The synchronous catalog the first render may paint. It is derived from the
  * same runtime identity and active directory key the store starts with, so a
  * smoke test that prepopulates storage sees the picker filled on the first
  * render instead of one loading frame.
  */
export const readInitialCatalogSnapshot = (directoryKey: string): Pick<ConfigStore, 'providers' | 'models' | 'providersLoaded'> => {
    const snapshot = readLocalCatalogSnapshot(getRuntimeKey(), directoryKey);
    const providers = snapshot?.providers as ProviderWithModelList[] | undefined;
    if (!providers?.length) return {
        providers: [],
        models: [],
        providersLoaded: false
    };
    return {
        providers,
        models: [],
        providersLoaded: true
    };
};
/**
  * Paints a cached catalog only where the live load has not published one. A
  * present catalog is authoritative even when empty, so the cache never
  * replaces it; a failed live load keeps the previous data untouched.
  */
export const applyCachedCatalog = (context: ConfigRuntimeContext, directoryKey: string, cached: CachedCatalog | null): void => {
    if (!cached?.providers?.length || !isConfigRuntimeContextCurrent(context)) return;
    useConfigStore.setState(state => {
        const snapshot = state.directoryScoped[directoryKey] ?? createEmptyDirectoryScopedConfig();
        const isActive = state.activeDirectoryKey === directoryKey;
        const providersLive = snapshot.providersLoaded === true || snapshot.providers.length > 0 || isActive && (state.providersLoaded || state.providers.length > 0);
        if (providersLive) return state;
        const providers = cached.providers as ProviderWithModelList[];
        return {
            directoryScoped: {
                ...state.directoryScoped,
                [directoryKey]: {
                    ...snapshot,
                    providers,
                    providersLoaded: true
                }
            },
            ...(isActive ? {
                providers,
                providersLoaded: true
            } : {})
        };
    });
};

/** Shows cached canonical models while the live workspace request starts. */
export const hydrateConfigCatalogFromCache = async (directoryKey: string): Promise<void> => {
    if (directoryKey === DIRECTORY_KEY_GLOBAL) return;
    const context = captureConfigRuntimeContext();
    // The synchronous mirror paints this tick; the IndexedDB record re-validates
    // the same runtime+directory identity and never overrides a live catalog.
    applyCachedCatalog(context, directoryKey, readLocalCatalogSnapshot(context.runtimeKey, directoryKey));
    const cached = await readCachedCatalog(context.runtimeKey, directoryKey);
    applyCachedCatalog(context, directoryKey, cached);
};
