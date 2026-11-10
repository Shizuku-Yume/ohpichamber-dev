import React from 'react';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ProviderResult, QuotaProviderId } from '@/types';
<<<<<<< HEAD
import { QUOTA_PROVIDERS } from '@/lib/quota';
import { fetchExtensionQuotaProviders, quotaProviderIds, sameExtensionQuotaProviders, type ExtensionQuotaProvider } from '@/lib/quota/extensionProviders';
import type { DesktopSettings } from '@/lib/desktop';
=======
import type { QuotaProviderMeta } from '@/lib/quota';
import { fetchExtensionQuotaProviders, quotaProviderIds, quotaProviderList, sameExtensionQuotaProviders, type ExtensionQuotaProvider } from '@/lib/quota/extensionProviders';
import { getDesktopWindowVisibility, isDesktopShell, type DesktopSettings } from '@/lib/desktop';
import { isCapacitorApp } from '@/lib/platform';
>>>>>>> bc50ba56a
import { getDefaultModels } from '@/lib/quota/model-families';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';
import { fetchConfiguredQuotaProviders, fetchQuota } from '@/lib/quota/fetchQuota';
import { getRuntimeKey, isTransientRuntimeKey } from '@/lib/runtime-switch';
import { runBackgroundNetworkTask } from '@/lib/background-network';
import { useConfigStore } from '@/stores/useConfigStore';
import { runBackgroundNetworkTask } from '@/lib/background-network';

const QUOTA_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
<<<<<<< HEAD
// A visible readout that just loaded is not read again, so a panel's rows and
// its header mounting together cost one read.
=======
>>>>>>> bc50ba56a
const QUOTA_OPEN_FRESHNESS_MS = 15 * 1000;
// Quotas and their display settings are read from the connected OpenChamber
// instance, so both belong to that instance. Bumped on every reset so a
// response in flight for the previous instance cannot land in the new one.
let quotaGeneration = 0;
let inFlightRuntimeLoad: Promise<void> | null = null;
<<<<<<< HEAD
const quotaRequests = new Map<string, { controller: AbortController; promise: Promise<boolean> }>();
const quotaRequestKey = (workspaceId: string, providerId: QuotaProviderId) => `${workspaceId}\0${providerId}`;
let inFlightExtensionLoad: Promise<void> | null = null;
let extensionLoadAgain = false;
let quotaAutoRefreshConsumers = 0;
let quotaAutoRefreshInterval: number | null = null;
let lastVisibleRefreshAt: number | null = null;
=======
// One read of the extension provider list at a time; a change announced while
// one is out gets one more read after it, since that read may predate the change.
let inFlightExtensionLoad: Promise<void> | null = null;
let extensionLoadAgain = false;
const quotaRequests = new Map<QuotaProviderId, { controller: AbortController; promise: Promise<boolean> }>();
let configuredProvidersRequest: Promise<ReadonlySet<string> | null> | null = null;
const quotaAutoRefreshConsumers = new Map<symbol, boolean>();
let quotaAutoRefreshInterval: number | null = null;
let lastVisibleRefreshAt: number | null = null;
let lastVisibleRefreshIncludedAll = false;
let nativeQuotaWindowVisible = false;
>>>>>>> bc50ba56a

interface QuotaSettingsState {
  displayMode: 'usage' | 'remaining';
  /**
   * The providers shown in Work Status, the header and the tray: the saved
   * list narrowed to the providers known now (`savedDropdownProviderIds`), or
   * every known provider when nothing was saved.
   */
  dropdownProviderIds: QuotaProviderId[];
  /** The "show in Work Status" list as the instance stores it, or null for "every provider". */
  savedDropdownProviderIds: string[] | null;
  selectedModels: Record<string, string[]>;  // Map of providerId -> selected model names
  expandedFamilies: Record<string, string[]>;  // Map of providerId -> EXPANDED family IDs (header dropdown - inverted)
}

interface QuotaStore extends QuotaSettingsState {
  /**
   * The usage providers installed extensions serve on this instance, from
   * `GET /api/quota/extensions`. Read when the instance loads and again
   * whenever the server announces a catalog change; a failed read keeps the
   * list it had.
   */
  extensionProviders: ExtensionQuotaProvider[];
  results: ProviderResult[];
  /**
   * Usage providers installed extensions serve on this instance, after the
   * built-ins (`GET /api/quota/extensions`). Read on connect and whenever the
   * server announces a change; a failed read keeps the list it had.
   */
  extensionProviders: ExtensionQuotaProvider[];
  /** Instance whose quotas `results` describes, or `null` when nothing is loaded. */
  loadedRuntimeKey: string | null;
  /** Workspace whose quota results the loaded instance describes. */
  loadedWorkspaceId: string | null;
  selectedProviderId: QuotaProviderId | null;
  isLoading: boolean;
  isFetchingProvider: Record<string, boolean>;
  lastUpdated: number | null;
  error: string | null;
  /** Refresh failures are not authoritative provider configuration or usage. */
  refreshErrors: Partial<Record<QuotaProviderId, string>>;

  loadSettings: () => Promise<void>;
<<<<<<< HEAD
  /** Reads the extension provider list again; a provider that left takes its card with it. */
=======
  /** Reads the extension provider list again; new providers are fetched once the instance has loaded, gone ones are forgotten. */
>>>>>>> bc50ba56a
  loadExtensionProviders: () => Promise<void>;
  fetchAllQuotas: () => Promise<void>;
  /** Resolves true when at least one provider answered — see `ensureLoadedForRuntime`. */
  fetchQuotas: (providerIds: QuotaProviderId[], options?: { invalidate?: boolean }) => Promise<boolean>;
  /** Resolves true when the instance answered, false on a transport failure. */
  fetchProviderQuota: (providerId: QuotaProviderId, invalidate?: boolean) => Promise<boolean>;
  setSelectedProvider: (providerId: QuotaProviderId | null) => void;
  setDisplayMode: (mode: 'usage' | 'remaining') => void;
  /** Shows or hides one provider in the "show in Work Status" list; answers the list to save. */
  setProviderInDropdown: (providerId: QuotaProviderId, shown: boolean) => string[];
  setSelectedModels: (providerId: string, modelNames: string[]) => void;
  toggleModelSelected: (providerId: string, modelName: string) => void;
  setExpandedFamilies: (providerId: string, familyIds: string[]) => void;
  toggleFamilyExpanded: (providerId: string, familyId: string) => void;
  applyDefaultSelections: (providerId: string, availableModels: string[]) => void;
  /**
   * Load settings and quotas once per instance, when that instance is ready.
   *
   * Providers report themselves as configured only after the instance can read
   * their credentials, which on a remote instance is not true the moment the UI
   * mounts. A fetch fired at mount therefore answers "nothing configured", and
   * because every provider then has a result, no consumer asks again until the
   * three-minute refresh — which is why Usage stayed missing from the
   * work-status panel until Settings -> Usage forced a fresh fetch.
   */
  ensureLoadedForRuntime: (options?: { refresh?: boolean; allProviders?: boolean; visibleOnly?: boolean }) => Promise<void>;
  resetForRuntimeSwitch: () => void;
  refreshAfterCredentialChange: () => Promise<void>;
}

<<<<<<< HEAD
const parseSettings = (data: DesktopSettings, extensionProviders: readonly ExtensionQuotaProvider[]): QuotaSettingsState => {
  const allProviderIds = quotaProviderIds(extensionProviders);
=======
/**
 * The saved list narrowed to the providers known now, in the saved order; an
 * id of a provider this build or this instance no longer has drops out, and
 * comes back when it does. No saved list means every known provider, the
 * extensions' included, as a built-in added in a new version is shown.
 */
const resolveDropdownProviderIds = (saved: readonly string[] | null, known: readonly QuotaProviderId[]): QuotaProviderId[] => (
  saved === null
    ? [...known]
    : saved.filter((entry): entry is QuotaProviderId => known.some((id) => id === entry))
);

const parseSettings = (data: DesktopSettings, extensionProviders: readonly ExtensionQuotaProvider[]): QuotaSettingsState => {
>>>>>>> bc50ba56a
  const displayMode = data.usageDisplayMode === 'remaining' ? 'remaining' : 'usage';
  const savedDropdownProviderIds = data.usageDropdownProviders ?? null;

  return {
    displayMode,
    savedDropdownProviderIds,
    dropdownProviderIds: resolveDropdownProviderIds(savedDropdownProviderIds, quotaProviderIds(extensionProviders)),
    // Map of providerId -> selected model names
    selectedModels: data.usageSelectedModels ?? {},
    // Expanded families (inverted collapsed logic for header dropdown)
    expandedFamilies: data.usageExpandedFamilies ?? {},
  };
};

const defaultQuotaSettings = (extensionProviders: readonly ExtensionQuotaProvider[] = []): QuotaSettingsState => ({
  displayMode: 'usage',
<<<<<<< HEAD
=======
  savedDropdownProviderIds: null,
>>>>>>> bc50ba56a
  dropdownProviderIds: quotaProviderIds(extensionProviders),
  selectedModels: {},
  expandedFamilies: {},
});

const loadSettingsFromRuntime = async (extensionProviders: readonly ExtensionQuotaProvider[]): Promise<QuotaSettingsState> => {
  const settings = await loadDesktopSettings();
  return settings ? parseSettings(settings, extensionProviders) : defaultQuotaSettings(extensionProviders);
<<<<<<< HEAD
=======
};

/**
 * A new extension provider list from the server. Providers that left take
 * their results, their errors and the page's selection with them, so a
 * paused or removed extension's card is gone everywhere at once; providers
 * that arrived are fetched when the instance has loaded, so the card fills
 * without waiting for the next refresh.
 */
const applyExtensionProviders = (next: ExtensionQuotaProvider[]): void => {
  const state = useQuotaStore.getState();
  if (sameExtensionQuotaProviders(state.extensionProviders, next)) return;
  const gone = state.extensionProviders.map((previous) => previous.id).filter((id) => !next.some((entry) => entry.id === id));
  const isGone = (id: string): boolean => gone.some((goneId) => goneId === id);
  for (const id of gone) {
    quotaRequests.get(id)?.controller.abort();
    quotaRequests.delete(id);
  }
  useQuotaStore.setState((current) => {
    const refreshErrors = { ...current.refreshErrors };
    for (const id of gone) delete refreshErrors[id];
    return {
      extensionProviders: next,
      dropdownProviderIds: resolveDropdownProviderIds(current.savedDropdownProviderIds, quotaProviderIds(next)),
      results: gone.length > 0 ? current.results.filter((result) => !isGone(result.providerId)) : current.results,
      refreshErrors,
      selectedProviderId: current.selectedProviderId !== null && isGone(current.selectedProviderId) ? null : current.selectedProviderId,
      isFetchingProvider: Object.fromEntries(Object.entries(current.isFetchingProvider).filter(([id]) => !isGone(id))),
      isLoading: quotaRequests.size > 0,
    };
  });
  const { results, loadedRuntimeKey, fetchQuotas } = useQuotaStore.getState();
  const arrived = next.map((entry) => entry.id).filter((id) => !results.some((result) => result.providerId === id) && !quotaRequests.has(id));
  if (arrived.length > 0 && (loadedRuntimeKey !== null || results.length > 0)) void fetchQuotas(arrived);
};

/** Overlapping loads share one list read, as they share one request per provider. */
const readConfiguredProviders = () => {
  if (configuredProvidersRequest) return configuredProvidersRequest;
  const request: Promise<ReadonlySet<string> | null> = fetchConfiguredQuotaProviders().finally(() => {
    if (configuredProvidersRequest === request) configuredProvidersRequest = null;
  });
  configuredProvidersRequest = request;
  return request;
};

/**
 * The answer the server gives for a provider without a credential, so every
 * provider keeps a result and a removed credential clears its old sample.
 */
const recordNotConfigured = (set: (update: (state: QuotaStore) => Partial<QuotaStore>) => void, providerIds: QuotaProviderId[]) => {
  const absent = new Set<QuotaProviderId>(providerIds);
  const fetchedAt = Date.now();
  set((state) => {
    const refreshErrors = { ...state.refreshErrors };
    for (const providerId of absent) delete refreshErrors[providerId];
    return {
      results: [
        ...state.results.filter((entry) => !absent.has(entry.providerId)),
        ...quotaProviderList(state.extensionProviders).filter((provider) => absent.has(provider.id)).map((provider) => ({
          providerId: provider.id, providerName: provider.name, ok: false, configured: false, error: 'Not configured', usage: null, fetchedAt,
        })),
      ],
      refreshErrors,
      error: Object.values(refreshErrors)[0] ?? null,
      lastUpdated: fetchedAt,
    };
  });
>>>>>>> bc50ba56a
};

/**
 * A new extension provider list from the server. Providers that left take
 * their results, their errors and the page's selection with them, so a paused
 * or removed extension's card is gone everywhere at once; providers that
 * arrived are fetched once the instance has loaded, so their card fills
 * without waiting for the next refresh.
 */
const applyExtensionProviders = (next: ExtensionQuotaProvider[]): void => {
  const state = useQuotaStore.getState();
  if (sameExtensionQuotaProviders(state.extensionProviders, next)) return;
  const gone = state.extensionProviders.map((previous) => previous.id).filter((id) => !next.some((entry) => entry.id === id));
  const isGone = (id: string): boolean => gone.some((goneId) => goneId === id);
  for (const id of gone) {
    quotaRequests.get(id)?.controller.abort();
    quotaRequests.delete(id);
  }
  useQuotaStore.setState((current) => {
    const refreshErrors = { ...current.refreshErrors };
    for (const id of gone) delete refreshErrors[id];
    return {
      extensionProviders: next,
      dropdownProviderIds: unknownProvidersDropped(current.dropdownProviderIds, quotaProviderIds(next)),
      results: gone.length > 0 ? current.results.filter((result) => !isGone(result.providerId)) : current.results,
      refreshErrors,
      selectedProviderId: current.selectedProviderId !== null && isGone(current.selectedProviderId) ? null : current.selectedProviderId,
      isFetchingProvider: Object.fromEntries(Object.entries(current.isFetchingProvider).filter(([id]) => !isGone(id))),
      isLoading: quotaRequests.size > 0,
    };
  });
  const { results, loadedRuntimeKey, fetchQuotas } = useQuotaStore.getState();
  const arrived = next.map((entry) => entry.id).filter((id) => !results.some((result) => result.providerId === id) && !quotaRequests.has(id));
  if (arrived.length > 0 && (loadedRuntimeKey !== null || results.length > 0)) void fetchQuotas(arrived);
};

/**
 * The shown list narrowed to providers that still exist, keeping the user's
 * order. A provider missing right now, such as a paused extension's, drops out
 * and comes back with it.
 */
const unknownProvidersDropped = (shown: readonly QuotaProviderId[], known: readonly QuotaProviderId[]): QuotaProviderId[] => (
  shown.filter((entry) => known.some((id) => id === entry))
);

export const useQuotaStore = create<QuotaStore>()(
  devtools(
    (set, get) => ({
      results: [],
      extensionProviders: [],
      loadedRuntimeKey: null,
      loadedWorkspaceId: null,
      selectedProviderId: null,
      isLoading: false,
      isFetchingProvider: {},
      lastUpdated: null,
      error: null,
      refreshErrors: {},
      ...defaultQuotaSettings(),

      loadSettings: async () => {
        const generation = quotaGeneration;
        try {
          const settings = await loadSettingsFromRuntime(get().extensionProviders);
          if (generation !== quotaGeneration) return;
          // The list is narrowed against the extensions known when the read lands; a later list read narrows it again.
          set({ ...settings, dropdownProviderIds: resolveDropdownProviderIds(settings.savedDropdownProviderIds, quotaProviderIds(get().extensionProviders)) });
        } catch (error) {
          console.warn('Failed to load usage settings:', error);
        }
      },

      loadExtensionProviders: async () => {
        if (inFlightExtensionLoad) {
          extensionLoadAgain = true;
          return inFlightExtensionLoad;
        }
        const generation = quotaGeneration;
        inFlightExtensionLoad = (async () => {
          try {
            const next = await fetchExtensionQuotaProviders();
            if (generation !== quotaGeneration) return;
            applyExtensionProviders(next);
          } catch (error) {
            // A failed read is not an empty list: the cards stay until the server answers.
            if (generation === quotaGeneration) console.warn('Failed to load extension usage providers:', error);
          }
        })().finally(() => {
          if (generation !== quotaGeneration) return;
          inFlightExtensionLoad = null;
          if (extensionLoadAgain) {
            extensionLoadAgain = false;
            void get().loadExtensionProviders();
          }
        });
        return inFlightExtensionLoad;
      },

      fetchQuotas: async (providerIds, { invalidate = false } = {}) => {
        const generation = quotaGeneration;
        try {
          // One read instead of a request per provider nobody has a credential
          // for. An account switch names providers it knows are configured.
          if (!invalidate) set({ isLoading: true });
          const configured = invalidate ? null : await readConfiguredProviders();
          if (generation !== quotaGeneration) return false;
          const absent = configured ? providerIds.filter((providerId) => !configured.has(providerId)) : [];
          const targets = providerIds.filter((providerId) => !absent.includes(providerId));
          if (absent.length > 0) recordNotConfigured(set, absent);
          if (targets.length === 0) set({ isLoading: quotaRequests.size > 0 });
          const answered = await Promise.all(targets.map((providerId) => get().fetchProviderQuota(providerId, invalidate)));
          if (generation !== quotaGeneration) return false;
          return absent.length > 0 || answered.some(Boolean);
        } catch (error) {
          if (generation !== quotaGeneration) return false;
          const message = error instanceof Error ? error.message : 'Failed to fetch quotas';
          set({ error: message });
          return false;
        }
      },

      fetchAllQuotas: async () => {
        await get().fetchQuotas(quotaProviderIds(get().extensionProviders));
      },

      fetchProviderQuota: async (providerId, invalidate = false) => {
        // Quota selection is workspace-scoped. Without a resolved workspace the
        // Host would reject the request as missing context, so wait for the
        // catalog owner to publish one instead of turning that into an error.
        const workspaceId = useConfigStore.getState().workspaceId;
        if (!workspaceId) return false;
        // Coalescing is scoped too: a request for workspace A must never be
        // handed to a caller that is now asking for workspace B. `invalidate` is
        // how a provider-account switch says the shared request, and any sample
        // it produces, describe the account being switched away from.
        const requestKey = quotaRequestKey(workspaceId, providerId);
        const existing = quotaRequests.get(requestKey);
        if (existing && !invalidate) return existing.promise;
        if (existing) {
          existing.controller.abort();
          quotaRequests.delete(requestKey);
        }
        const generation = quotaGeneration;
        const controller = new AbortController();
        const promise = Promise.resolve().then(async () => {
          try {
            const result = await fetchQuota(providerId, { signal: controller.signal, workspaceId });
            if (generation !== quotaGeneration) return false;
            // A reachable instance can still report that its provider request
            // failed. Configuration is known, but there is no new usage sample.
            if (!result.ok && result.configured) {
              const message = result.error || 'Failed to fetch quota';
              set(state => {
                const previous = state.results.find(entry => entry.providerId === providerId);
                // Preserving the last sample keeps a periodic refresh from
                // blanking the surface on a blip. After a switch it is wrong:
                // that sample belongs to the account just left, so keeping it
                // shows one account's usage as if it were the new account's.
                const keepPrevious = previous?.configured && !invalidate;
                const results = keepPrevious
                  ? state.results
                  : [...state.results.filter(entry => entry.providerId !== providerId), result];
                return { results, refreshErrors: { ...state.refreshErrors, [providerId]: message }, error: message };
              });
              return true;
            }
            set((state) => {
              const refreshErrors = { ...state.refreshErrors };
              delete refreshErrors[providerId];
              const results = state.results.filter(entry => entry.providerId !== providerId);
              results.push(result);
              return { results, refreshErrors, error: Object.values(refreshErrors)[0] ?? null, lastUpdated: Date.now() };
            });
            return true;
          } catch (error) {
            if (generation !== quotaGeneration) return false;
            // An abort is this store superseding its own request, not the
            // instance failing. Recording it would report a refresh error right
            // after a switch, over the sample being replaced.
            if (controller.signal.aborted) return false;
            const message = error instanceof Error ? error.message : 'Failed to fetch quota';
            set(state => ({ refreshErrors: { ...state.refreshErrors, [providerId]: message }, error: message }));
            return false;
          } finally {
            if (quotaRequests.get(requestKey)?.controller === controller) quotaRequests.delete(requestKey);
            if (generation === quotaGeneration) {
              // A superseded request finishes while its replacement still runs;
              // the provider stays fetching until the replacement settles too.
              set((state) => ({
                isFetchingProvider: { ...state.isFetchingProvider, [providerId]: quotaRequests.has(requestKey) },
                isLoading: quotaRequests.size > 0,
              }));
            }
          }
        });
        quotaRequests.set(requestKey, { controller, promise });
        set(state => ({ isLoading: true, isFetchingProvider: { ...state.isFetchingProvider, [providerId]: true } }));
        return promise;
      },

      ensureLoadedForRuntime: async ({ refresh = false, allProviders = false, visibleOnly = false } = {}) => {
        const runtimeKey = getRuntimeKey();
        if (isTransientRuntimeKey(runtimeKey)) return;
        // Wait for the instance to report itself initialised. Asking earlier
        // gets an honest-looking "not configured" for every provider, which is
        // then cached as if it were the answer.
<<<<<<< HEAD
        const config = useConfigStore.getState();
        if (!config.isInitialized || !config.workspaceId) return;
        if (get().loadedRuntimeKey === runtimeKey && get().loadedWorkspaceId === config.workspaceId) return;
        if (inFlightRuntimeLoad) return inFlightRuntimeLoad;

        const generation = quotaGeneration;
        inFlightRuntimeLoad = (async () => {
          // The instance's own provider list first: the settings read narrows
          // the shown list against it.
          await get().loadExtensionProviders();
          await get().loadSettings();
=======
        if (!useConfigStore.getState().isInitialized) return;
        if (visibleOnly && !hasVisibleQuotaReadout()) return;
        if (!refresh && get().loadedRuntimeKey === runtimeKey) return;
        const generation = quotaGeneration;
        let missingProvidersOnly = false;
        if (inFlightRuntimeLoad) {
          await inFlightRuntimeLoad;
>>>>>>> bc50ba56a
          if (generation !== quotaGeneration) return;
          if (!allProviders) return;
          // Settings can open while a smaller readout is loading its selection.
          // Fetch any providers that load did not include.
          missingProvidersOnly = true;
        }

        inFlightRuntimeLoad = (async () => {
          // Both say what this instance shows: its settings and the providers its extensions serve.
          if (get().loadedRuntimeKey !== runtimeKey) await Promise.all([get().loadSettings(), get().loadExtensionProviders()]);
          if (generation !== quotaGeneration) return;
          if (visibleOnly && !hasVisibleQuotaReadout()) {
            lastVisibleRefreshAt = null;
            lastVisibleRefreshIncludedAll = false;
            return;
          }
          if (!useConfigStore.getState().isInitialized) return;
          const { dropdownProviderIds, fetchQuotas } = get();
          const requestedIds = allProviders ? quotaProviderIds(get().extensionProviders) : dropdownProviderIds;
          const providerIds = missingProvidersOnly
            ? requestedIds.filter(providerId => !get().results.some(result => result.providerId === providerId))
            : requestedIds;
          if (providerIds.length === 0) return;
          const answered = await fetchQuotas(providerIds);
          // Mark the instance loaded only once it actually answered. Claiming it
          // up front meant a load that failed on a cold or briefly unreachable
          // instance was never attempted again — Usage would stay empty until
          // the three-minute refresh, or forever after a switch.
          if (answered && generation === quotaGeneration) set({ loadedRuntimeKey: runtimeKey, loadedWorkspaceId: config.workspaceId });
        })().finally(() => { if (generation === quotaGeneration) inFlightRuntimeLoad = null; });

        return inFlightRuntimeLoad;
      },

      resetForRuntimeSwitch: () => {
        quotaGeneration += 1;
        configuredProvidersRequest = null;
        for (const request of quotaRequests.values()) request.controller.abort();
        quotaRequests.clear();
        inFlightRuntimeLoad = null;
        inFlightExtensionLoad = null;
        extensionLoadAgain = false;
        lastVisibleRefreshAt = null;
        lastVisibleRefreshIncludedAll = false;
        set({
          // Display mode, the provider selection and the per-provider model
          // picks all come from the instance's own settings, and
          // `dropdownProviderIds` decides what gets fetched — carrying them
          // over would query the new instance through the old one's choices.
          // The extensions' providers are the instance's too.
          ...defaultQuotaSettings(),
<<<<<<< HEAD
          // The extensions' providers belong to the instance too.
=======
>>>>>>> bc50ba56a
          extensionProviders: [],
          results: [],
          loadedRuntimeKey: null,
          loadedWorkspaceId: null,
          selectedProviderId: null,
          isLoading: false,
          isFetchingProvider: {},
          lastUpdated: null,
          error: null,
          refreshErrors: {},
        });
      },

      refreshAfterCredentialChange: async () => {
        // Samples describe the account just left, even when no readout is open.
        quotaGeneration += 1;
        configuredProvidersRequest = null;
        for (const request of quotaRequests.values()) request.controller.abort();
        quotaRequests.clear();
        inFlightRuntimeLoad = null;
        inFlightExtensionLoad = null;
        extensionLoadAgain = false;
        lastVisibleRefreshAt = null;
        lastVisibleRefreshIncludedAll = false;
        set({ results: [], loadedRuntimeKey: null, isLoading: false, isFetchingProvider: {}, lastUpdated: null, refreshErrors: {}, error: null });
        if (!hasVisibleQuotaReadout()) return;
        await get().ensureLoadedForRuntime({ refresh: true, allProviders: [...quotaAutoRefreshConsumers.values()].some(Boolean), visibleOnly: true });
      },

      setSelectedProvider: (providerId) => set({ selectedProviderId: providerId }),
      setDisplayMode: (mode) => set({ displayMode: mode }),
      setProviderInDropdown: (providerId, shown) => {
        const { savedDropdownProviderIds, dropdownProviderIds, extensionProviders } = get();
        // The saved list, since the shown one lacks a provider absent right now, such as a paused extension's.
        const base: readonly string[] = savedDropdownProviderIds ?? dropdownProviderIds;
        const next = shown ? [...new Set([...base, providerId])] : base.filter((id) => id !== providerId);
        set({ savedDropdownProviderIds: next, dropdownProviderIds: resolveDropdownProviderIds(next, quotaProviderIds(extensionProviders)) });
        return next;
      },

      setSelectedModels: (providerId, modelNames) => {
        set((state) => ({
          selectedModels: { ...state.selectedModels, [providerId]: modelNames }
        }));
      },

      toggleModelSelected: (providerId, modelName) => {
        set((state) => {
          const currentSelected = state.selectedModels[providerId] ?? [];
          const isSelected = currentSelected.includes(modelName);
          const nextSelected = isSelected
            ? currentSelected.filter((m) => m !== modelName)
            : [...currentSelected, modelName];
          return {
            selectedModels: { ...state.selectedModels, [providerId]: nextSelected }
          };
        });
      },

      setExpandedFamilies: (providerId, familyIds) => {
        set((state) => ({
          expandedFamilies: { ...state.expandedFamilies, [providerId]: familyIds }
        }));
        // Persist
        void updateDesktopSettings({ usageExpandedFamilies: get().expandedFamilies });
      },

      toggleFamilyExpanded: (providerId, familyId) => {
        set((state) => {
          const currentExpanded = state.expandedFamilies[providerId] ?? [];
          const isExpanded = currentExpanded.includes(familyId);
          const nextExpanded = isExpanded
            ? currentExpanded.filter((id) => id !== familyId)
            : [...currentExpanded, familyId];
          return {
            expandedFamilies: { ...state.expandedFamilies, [providerId]: nextExpanded }
          };
        });
        // Persist
        void updateDesktopSettings({ usageExpandedFamilies: get().expandedFamilies });
      },

      applyDefaultSelections: (providerId, availableModels) => {
        const state = get();
        // Only apply if no prior selections exist
        if ((state.selectedModels[providerId]?.length ?? 0) > 0) return;

        const defaults = getDefaultModels(providerId as QuotaProviderId, availableModels);
        if (defaults.length === 0) return;

        set((s) => ({
          selectedModels: { ...s.selectedModels, [providerId]: defaults },
        }));
        // Persist
        void updateDesktopSettings({ usageSelectedModels: get().selectedModels });
      },
    }),
    { name: 'quota-store' }
  )
);

<<<<<<< HEAD
/**
 * Reads usage for whoever has a readout on screen, ahead of queued background
 * reads: the rows a person is looking at come first. A visible readout that
 * just refreshed is not read again, so several panels mounting together cost
 * one load.
 */
const refreshVisibleQuotas = (): void => {
  // A mounted but hidden surface (a closed sheet) holds no demand.
  const readoutVisible = quotaAutoRefreshConsumers > 0
    && (typeof document === 'undefined' || document.visibilityState !== 'hidden');
  if (!readoutVisible || !useConfigStore.getState().isInitialized) return;
  const now = Date.now();
  if (lastVisibleRefreshAt !== null && now - lastVisibleRefreshAt < QUOTA_OPEN_FRESHNESS_MS) return;
  lastVisibleRefreshAt = now;
  void runBackgroundNetworkTask(async () => {
    // The readout may have closed while waiting for the shared network gate.
    if (!readoutVisible) {
      if (lastVisibleRefreshAt === now) lastVisibleRefreshAt = null;
      return;
    }
    await useQuotaStore.getState().ensureLoadedForRuntime();
  }, 'active-session');
};

/**
 * Keeps the usage readouts current while one is on screen. `visible` lets a
 * surface that is mounted but hidden (a collapsed panel, a closed sheet) hold
 * no refresh demand; the interval runs only while someone needs it.
 */
export const useQuotaAutoRefresh = (visible = true) => {
  const isInitialized = useConfigStore((state) => state.isInitialized);
  React.useEffect(() => {
    if (!visible || !isInitialized) return undefined;
    quotaAutoRefreshConsumers += 1;
    // A readout that appears after the instance is ready loads once on its
    // own: without this, a panel opened later waited for Settings or the
    // three-minute interval before its rows existed.
    refreshVisibleQuotas();
    if (quotaAutoRefreshInterval === null) {
      quotaAutoRefreshInterval = window.setInterval(() => {
        refreshVisibleQuotas();
      }, QUOTA_REFRESH_INTERVAL_MS);
=======
const hasVisibleQuotaReadout = () => quotaAutoRefreshConsumers.size > 0
  && globalThis.document !== undefined && document.visibilityState !== 'hidden'
  && ((!isDesktopShell() && !isCapacitorApp()) || nativeQuotaWindowVisible);

const refreshVisibleQuotas = (tray = false) => {
  if ((!tray && !hasVisibleQuotaReadout()) || !useConfigStore.getState().isInitialized) return;
  const allProviders = !tray && [...quotaAutoRefreshConsumers.values()].some(Boolean);
  const now = Date.now();
  if (lastVisibleRefreshAt !== null && now - lastVisibleRefreshAt < QUOTA_OPEN_FRESHNESS_MS
    && (!allProviders || lastVisibleRefreshIncludedAll)) return;
  lastVisibleRefreshAt = now;
  lastVisibleRefreshIncludedAll = allProviders;
  void runBackgroundNetworkTask(async () => {
    // The readout may have closed while waiting for the shared network gate.
    if (!tray && !hasVisibleQuotaReadout()) {
      if (lastVisibleRefreshAt === now) {
        lastVisibleRefreshAt = null;
        lastVisibleRefreshIncludedAll = false;
      }
      return;
>>>>>>> bc50ba56a
    }
    await useQuotaStore.getState().ensureLoadedForRuntime({ refresh: true, allProviders, visibleOnly: !tray });
  }, 'active-session');
};

/** Native tray openings are readout demand even with a hidden renderer window. */
export const refreshTrayQuotas = (initial = false) => {
  if (initial && useQuotaStore.getState().loadedRuntimeKey === getRuntimeKey()) return;
  refreshVisibleQuotas(true);
};

const updateQuotaAutoRefresh = () => {
  if (!hasVisibleQuotaReadout()) {
    if (quotaAutoRefreshInterval !== null) window.clearInterval(quotaAutoRefreshInterval);
    quotaAutoRefreshInterval = null;
    return;
  }
  refreshVisibleQuotas();
  if (quotaAutoRefreshInterval === null) quotaAutoRefreshInterval = window.setInterval(refreshVisibleQuotas, QUOTA_REFRESH_INTERVAL_MS);
};

/** Only mounted, shown quota readouts register demand. Buttons which open them do not. */
export const useQuotaAutoRefresh = (visible = true, allProviders = false) => {
  const isInitialized = useConfigStore(state => state.isInitialized);
  const [nativeVisible, setNativeVisible] = React.useState(() => !isDesktopShell() && !isCapacitorApp());
  React.useEffect(() => {
    let disposed = false;
    let removeListener: (() => void) | undefined;
    const reportNativeVisibility = (value: boolean) => {
      nativeQuotaWindowVisible = value;
      setNativeVisible(value);
      updateQuotaAutoRefresh();
    };
    if (isDesktopShell()) {
      let revision = 0;
      const onVisibility = (event: Event) => {
        if (!(event instanceof CustomEvent) || (event.detail !== true && event.detail !== false)) return;
        revision += 1;
        reportNativeVisibility(event.detail);
      };
      window.addEventListener('openchamber:window-visibility', onVisibility);
      void getDesktopWindowVisibility().then(value => {
        if (!disposed && revision === 0) reportNativeVisibility(value === true);
      }).catch(() => undefined);
      removeListener = () => window.removeEventListener('openchamber:window-visibility', onVisibility);
    } else if (isCapacitorApp()) {
      void import('@capacitor/app').then(async ({ App }) => {
        if (disposed) return;
        let revision = 0;
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          revision += 1;
          if (!disposed) reportNativeVisibility(isActive);
        });
        if (disposed) { void handle.remove(); return; }
        removeListener = () => { void handle.remove(); };
        const state = await App.getState();
        if (!disposed && revision === 0) reportNativeVisibility(state.isActive);
      }).catch(() => undefined);
    }
    return () => { disposed = true; removeListener?.(); };
  }, []);
  React.useEffect(() => {
    if (!visible || !isInitialized || !nativeVisible) return;
    const consumer = Symbol();
    quotaAutoRefreshConsumers.set(consumer, allProviders);
    if (quotaAutoRefreshConsumers.size === 1) document.addEventListener('visibilitychange', updateQuotaAutoRefresh);
    updateQuotaAutoRefresh();

    return () => {
<<<<<<< HEAD
      quotaAutoRefreshConsumers -= 1;
      if (quotaAutoRefreshConsumers === 0 && quotaAutoRefreshInterval !== null) {
        window.clearInterval(quotaAutoRefreshInterval);
        quotaAutoRefreshInterval = null;
        lastVisibleRefreshAt = null;
      }
    };
  }, [visible, isInitialized]);
=======
      quotaAutoRefreshConsumers.delete(consumer);
      if (quotaAutoRefreshConsumers.size === 0) document.removeEventListener('visibilitychange', updateQuotaAutoRefresh);
      updateQuotaAutoRefresh();
    };
  }, [visible, allProviders, isInitialized, nativeVisible]);
};

/** Every usage provider to draw on this instance: the built-ins, then the extensions', in the server's order. */
export const useQuotaProviders = (): QuotaProviderMeta[] => {
  const extensionProviders = useQuotaStore((state) => state.extensionProviders);
  return React.useMemo(() => quotaProviderList(extensionProviders), [extensionProviders]);
>>>>>>> bc50ba56a
};


// Quota results are workspace-scoped. Track readiness as one scope: a catalog
// that is still initializing, or a directory switch whose catalog has not
// re-resolved yet, has no usable workspace. Any change — including
// ready→empty during a switch — aborts in-flight requests and clears results,
// then loads once the new workspace is published.
let observedQuotaScope = '';
useConfigStore.subscribe((state) => {
  const nextScope = state.isInitialized ? state.workspaceId : '';
  if (nextScope === observedQuotaScope) return;
  observedQuotaScope = nextScope;
  useQuotaStore.getState().resetForRuntimeSwitch();
  if (nextScope) void useQuotaStore.getState().ensureLoadedForRuntime();
});
