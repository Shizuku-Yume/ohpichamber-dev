import { type ConfigRuntimeContext, isConfigRuntimeContextCurrent } from "./runtime";
import { type CachedCatalog, writeCachedCatalogWhenSettled, writeLocalCatalogSnapshot } from "../configCatalogCache";
import { DIRECTORY_KEY_GLOBAL } from "./directories";
import { _inFlightProviders } from "./catalogRequests";
import { useConfigStore } from "../useConfigStore";
import { invalidateAgentCatalogsForReload } from "../useAgentsStore";

export const catalogLifecycle = { loadEpoch: 0 };

export const invalidateConfigCatalogsForReload = (kinds: readonly ("provider" | "agent")[]): void => {
    if (kinds.includes("provider")) {
        catalogLifecycle.loadEpoch += 1;
        _providersLoadedAt.clear();
        _inFlightProviders.clear();
    }
    if (kinds.includes("agent")) invalidateAgentCatalogsForReload();
    useConfigStore.setState(state => ({ catalogReloadRevision: state.catalogReloadRevision + 1 }));
};

// Runtime freshness tracking (NOT persisted) for the stale-while-revalidate
// background refresh, keyed by config-directory key. Prevents re-fetching
// catalogs we just loaded for the same project or worktree.
export const _providersLoadedAt = new Map<string, number>();
const CONFIG_REFRESH_TTL_MS = 30_000;
const CATALOG_CACHE_RECHECK_SOURCE = 'catalogCacheRecheck';
/** Persists settled canonical provider/model catalogs. */
export const persistLoadedCatalog = (context: ConfigRuntimeContext, directoryKey: string, source: string, update: CachedCatalog, isEmpty: boolean, loadEpoch = catalogLifecycle.loadEpoch): void => {
    if (directoryKey === DIRECTORY_KEY_GLOBAL) return;
    if (isEmpty && source !== CATALOG_CACHE_RECHECK_SOURCE) return;
    writeCachedCatalogWhenSettled(context.runtimeKey, directoryKey, update, () => !isConfigRuntimeContextCurrent(context) || loadEpoch !== catalogLifecycle.loadEpoch);
    // Mirror the same snapshot synchronously so the next startup paints before
    // any async storage read. It is not a second authority: the live load
    // replaces it and the IndexedDB record stays the durable owner.
    if (!isEmpty) writeLocalCatalogSnapshot(context.runtimeKey, directoryKey, update);
};

/**
  * Paints a cached catalog only where the live load has not published one. A
  * present catalog is authoritative even when empty, so the cache never
  * replaces it; a failed live load keeps the previous data untouched.
  */
export const isConfigFresh = (loadedAt: Map<string, number>, key: string): boolean => {
    const at = loadedAt.get(key);
    return typeof at === 'number' && Date.now() - at < CONFIG_REFRESH_TTL_MS;
};
