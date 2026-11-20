import { type ProviderWithModelList, type ConfigStore, type DirectoryScopedConfig } from "./types";
import { isRecord } from "./metadata";
import { readLocalCatalogSnapshot } from "../configCatalogCache";
import { getRuntimeKey } from "@/lib/runtime-switch";
import { createDeferredSafeJSONStorage } from "../utils/safeStorage";
import { type PersistOptions } from "zustand/middleware";

// Sentinel selectedProviderId used by the providers UI while the "Add provider"
// form is open. It is intentionally not a real provider id and must not be
// persisted as a stable provider selection.
const ADD_PROVIDER_SENTINEL = "__add_provider__";
const sanitizePersistedSelectedProviderId = (providerId: string | undefined): string => providerId === ADD_PROVIDER_SENTINEL ? "" : providerId ?? "";
const hasCompatibleCachedVariants = (providers: ProviderWithModelList[] | undefined): boolean => Array.isArray(providers) && providers.every(provider => isRecord(provider) && Array.isArray(provider.models) && provider.models.every(model => isRecord(model) && Array.isArray(model.variants) && model.variants.every(isRecord)));

/**
  * The effort the next send carries after a loader resolved `resolved` for the
  * model: a pick kept in `selection` wins. Loaders that kept the pick in
  * `currentVariantSelection` but wrote the resolved default to `currentVariant`
  * showed one effort in the picker and sent another.
  */

/**
  * Lift the active directory's snapshot into the top-level fields the pickers
  * read (`providers` and selections). Persisted snapshots carry no
  * catalogs, so this restores selections; a blob from before that change still
  * has catalogs, and those paint instantly. Falls back to whatever top-level
  * data was persisted; handles legacy blobs that only stored directoryScoped.
  */
const hydrateActiveDirectorySnapshot = <T extends Partial<ConfigStore>,>(merged: T, bootState: Partial<ConfigStore>): T => {
    const directoryScoped = merged.directoryScoped;
    const activeKey = merged.activeDirectoryKey;
    if (!directoryScoped || !activeKey) return merged;
    const snapshot = directoryScoped[activeKey];
    if (!snapshot) return merged;
    const next: Partial<ConfigStore> = {
        ...merged
    };
    // Top-level providers in the boot state belong to the boot directory key,
    // which resolves before the directory store hydrates. When the persisted
    // selection names another directory, those providers describe the wrong
    // scope and must not paint it.
    const bootScopeMatches = bootState.activeDirectoryKey === activeKey;
    if (!bootScopeMatches) next.providers = [];
    if (!next.providers?.length && snapshot.providers?.length) {
        next.providers = snapshot.providers;
    }
    // A persisted selection names the directory the user actually left, which
    // can differ from the boot-time key. When neither a live catalog nor a
    // persisted one exists, the synchronous mirror for the *merged* runtime and
    // active key fills the first published state, so the first render is not a
    // loading frame. A present catalog — even an empty one — always wins.
    const liveCatalogPresent = Boolean(next.providers?.length) || snapshot.providersLoaded === true;
    if (!liveCatalogPresent) {
        const cached = readLocalCatalogSnapshot(merged.configRuntimeKey || getRuntimeKey(), activeKey);
        const cachedProviders = cached?.providers as ProviderWithModelList[] | undefined;
        if (cached && cachedProviders?.length) {
            const scoped = {
                ...snapshot,
                providers: cachedProviders,
                providersLoaded: true
            };
            next.providers = cachedProviders;
            next.providersLoaded = true;
            next.directoryScoped = {
                ...directoryScoped,
                [activeKey]: scoped
            };
            if (!merged.defaultProviders || Object.keys(merged.defaultProviders).length === 0) {
                const cachedDefaults = cached.defaultProviders;
                if (cachedDefaults && Object.keys(cachedDefaults).length > 0) {
                    next.defaultProviders = cachedDefaults;
                }
            }
        } else if (!bootScopeMatches) {
            // Nothing cached for the persisted scope: stay not-loaded rather
            // than paint another directory's providers.
            next.providersLoaded = false;
            next.directoryScoped = {
                ...directoryScoped,
                [activeKey]: {
                    ...snapshot,
                    providers: [],
                    providersLoaded: false
                }
            };
        }
    }
    if (!merged.defaultProviders || Object.keys(merged.defaultProviders).length === 0) {
        if (snapshot.defaultProviders && Object.keys(snapshot.defaultProviders).length > 0) {
            next.defaultProviders = snapshot.defaultProviders;
        }
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
    // Catalogs are derived from the workspace and re-read on every start, so
    // they stay out of the persisted blob exactly as `providers` does.
    const {
        providers: _providers,
        models: _models,
        providersLoaded: _providersLoaded,
        ...selection
    } = snapshot;
    void _providers;
    void _models;
    void _providersLoaded;
    return {
        ...selection,
        selectedProviderId: sanitizePersistedSelectedProviderId(snapshot.selectedProviderId)
    };
};
const partializeConfigState = (state: ConfigStore) => ({
    configRuntimeKey: state.configRuntimeKey,
    activeDirectoryKey: state.activeDirectoryKey,
    directoryScoped: Object.fromEntries(Object.entries(state.directoryScoped).map(([directoryKey, snapshot]) => [directoryKey, toPersistedDirectorySnapshot(snapshot)])),
    currentProviderId: state.currentProviderId,
    currentModelId: state.currentModelId,
    currentVariant: state.currentVariant,
    currentVariantSelection: state.currentVariantSelection,
    currentAgentName: state.currentAgentName,
    selectedProviderId: sanitizePersistedSelectedProviderId(state.selectedProviderId),
    agentModelSelections: state.agentModelSelections,
    defaultProviders: state.defaultProviders,
    settingsDefaultModel: state.settingsDefaultModel,
    settingsAutoCreateWorktree: state.settingsAutoCreateWorktree,
    settingsGitmojiEnabled: state.settingsGitmojiEnabled,
    settingsDefaultFileViewerPreview: state.settingsDefaultFileViewerPreview,
    settingsZenModel: state.settingsZenModel,
    dictationEnabled: state.dictationEnabled,
    dictationAutoSend: state.dictationAutoSend,
    speechRate: state.speechRate,
    speechPitch: state.speechPitch,
    speechVolume: state.speechVolume
});

export const configPersistence = {
    name: "config-store",
    storage: createDeferredSafeJSONStorage(),
    // Version 1 is the slim format below. Builds without it read
    // `snapshot.agents` unguarded; the version bump makes them skip
    // this blob (they have no migrate) instead of crashing on it.
    version: 1,
    // SAFETY: a version-0 blob is the same shape plus catalogs, and
    // merge() is the one place that validates any persisted state.
    migrate: persistedState => persistedState as ConfigStore,
    merge: (persistedState, currentState) => {
        // SAFETY: Zustand's storage boundary supplies an unknown
        // partial store. Only an explicitly matching runtime may hydrate it.
        const persisted = persistedState as Partial<ConfigStore> | undefined;
        if (!persisted || persisted.configRuntimeKey !== getRuntimeKey()) return currentState;
        for (const key of ['agents', 'agentsLoaded', 'opencodeDefaultAgent']) Reflect.deleteProperty(persisted, key);
        const storedScopes = isRecord(persisted.directoryScoped) && !Array.isArray(persisted.directoryScoped) ? persisted.directoryScoped : currentState.directoryScoped;
        const directoryScoped = {
            ...storedScopes
        };
        for (const [directory, snapshot] of Object.entries(directoryScoped)) {
            if (!isRecord(snapshot)) {
                delete directoryScoped[directory];
            } else if (snapshot.providers === undefined) {
                // Version 1 persists selections without catalogs; give the
                // snapshot the empty lists the store expects. With no
                // `*Loaded` flag persisted, an empty list reads as not loaded.
                directoryScoped[directory] = {
                    ...snapshot,
                    providers: []
                };
            } else if (!hasCompatibleCachedVariants(snapshot.providers)) {
                directoryScoped[directory] = {
                    ...snapshot,
                    providers: [],
                    providersLoaded: false,
                    defaultProviders: {}
                };
            }
            const retained = directoryScoped[directory];
            if (retained) {
                for (const key of ['agents', 'agentsLoaded', 'opencodeDefaultAgent']) Reflect.deleteProperty(retained, key);
            }
        }
        const merged = {
            ...currentState,
            ...persisted,
            directoryScoped
        };
        if (persisted.providers !== undefined && !hasCompatibleCachedVariants(persisted.providers)) {
            merged.providers = currentState.providers;
            merged.providersLoaded = currentState.providersLoaded;
            merged.defaultProviders = currentState.defaultProviders;
        }
        return hydrateActiveDirectorySnapshot(merged, currentState);
    },
    // Selections only. The provider and agent catalogs are not
    // persisted: large catalog payloads would make every selection
    // write unnecessarily expensive. On a cold start the
    // pickers wait for initializeApp() / activateDirectory() to load
    // the catalogs. Older blobs that still carry them hydrate as before.
    partialize: partializeConfigState
} satisfies PersistOptions<ConfigStore, ReturnType<typeof partializeConfigState>>;
