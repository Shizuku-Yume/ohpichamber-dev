import React from 'react';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ProviderResult, QuotaProviderId } from '@/types';
import { QUOTA_PROVIDERS } from '@/lib/quota';
import { fetchExtensionQuotaProviders, quotaProviderIds, sameExtensionQuotaProviders, type ExtensionQuotaProvider } from '@/lib/quota/extensionProviders';
import type { DesktopSettings } from '@/lib/desktop';
import { getDefaultModels } from '@/lib/quota/model-families';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';
import { fetchQuota } from '@/lib/quota/fetchQuota';
import { getRuntimeKey, isTransientRuntimeKey } from '@/lib/runtime-switch';
import { runBackgroundNetworkTask } from '@/lib/background-network';
import { useConfigStore } from '@/stores/useConfigStore';

const QUOTA_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
// A visible readout that just loaded is not read again, so a panel's rows and
// its header mounting together cost one read.
const QUOTA_OPEN_FRESHNESS_MS = 15 * 1000;
// Quotas and their display settings are read from the connected OpenChamber
// instance, so both belong to that instance. Bumped on every reset so a
// response in flight for the previous instance cannot land in the new one.
let quotaGeneration = 0;
let inFlightRuntimeLoad: Promise<void> | null = null;
const quotaRequests = new Map<string, { controller: AbortController; promise: Promise<boolean> }>();
const quotaRequestKey = (workspaceId: string, providerId: QuotaProviderId) => `${workspaceId}\0${providerId}`;
let inFlightExtensionLoad: Promise<void> | null = null;
let extensionLoadAgain = false;
let quotaAutoRefreshConsumers = 0;
let quotaAutoRefreshInterval: number | null = null;
let lastVisibleRefreshAt: number | null = null;

interface QuotaSettingsState {
  displayMode: 'usage' | 'remaining';
  dropdownProviderIds: QuotaProviderId[];
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
  /** Reads the extension provider list again; a provider that left takes its card with it. */
  loadExtensionProviders: () => Promise<void>;
  fetchAllQuotas: () => Promise<void>;
  /** Resolves true when at least one provider answered — see `ensureLoadedForRuntime`. */
  fetchQuotas: (providerIds: QuotaProviderId[], options?: { invalidate?: boolean }) => Promise<boolean>;
  /** Resolves true when the instance answered, false on a transport failure. */
  fetchProviderQuota: (providerId: QuotaProviderId, invalidate?: boolean) => Promise<boolean>;
  setSelectedProvider: (providerId: QuotaProviderId | null) => void;
  setDisplayMode: (mode: 'usage' | 'remaining') => void;
  setDropdownProviderIds: (providerIds: QuotaProviderId[]) => void;
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
  ensureLoadedForRuntime: () => Promise<void>;
  resetForRuntimeSwitch: () => void;
}

const parseSettings = (data: DesktopSettings, extensionProviders: readonly ExtensionQuotaProvider[]): QuotaSettingsState => {
  const allProviderIds = quotaProviderIds(extensionProviders);
  const displayMode = data.usageDisplayMode === 'remaining' ? 'remaining' : 'usage';
  const dropdownProviderIds = data.usageDropdownProviders
    ? data.usageDropdownProviders.filter((entry): entry is QuotaProviderId =>
        allProviderIds.some((id) => id === entry)
      )
    : allProviderIds;

  return {
    displayMode,
    dropdownProviderIds,
    // Map of providerId -> selected model names
    selectedModels: data.usageSelectedModels ?? {},
    // Expanded families (inverted collapsed logic for header dropdown)
    expandedFamilies: data.usageExpandedFamilies ?? {},
  };
};

const defaultQuotaSettings = (extensionProviders: readonly ExtensionQuotaProvider[] = []): QuotaSettingsState => ({
  displayMode: 'usage',
  dropdownProviderIds: quotaProviderIds(extensionProviders),
  selectedModels: {},
  expandedFamilies: {},
});

const loadSettingsFromRuntime = async (extensionProviders: readonly ExtensionQuotaProvider[]): Promise<QuotaSettingsState> => {
  const settings = await loadDesktopSettings();
  return settings ? parseSettings(settings, extensionProviders) : defaultQuotaSettings(extensionProviders);
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
      displayMode: 'usage',
      dropdownProviderIds: QUOTA_PROVIDERS.map((provider) => provider.id),
      selectedModels: {},
      expandedFamilies: {},

      loadSettings: async () => {
        const generation = quotaGeneration;
        try {
          const settings = await loadSettingsFromRuntime(get().extensionProviders);
          if (generation !== quotaGeneration) return;
          set(settings);
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
          const answered = await Promise.all(
            providerIds.map((providerId) => get().fetchProviderQuota(providerId, invalidate))
          );
          if (generation !== quotaGeneration) return false;
          return answered.some(Boolean);
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

      ensureLoadedForRuntime: async () => {
        const runtimeKey = getRuntimeKey();
        if (isTransientRuntimeKey(runtimeKey)) return;
        // Wait for the instance to report itself initialised. Asking earlier
        // gets an honest-looking "not configured" for every provider, which is
        // then cached as if it were the answer.
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
          if (generation !== quotaGeneration) return;
          const { dropdownProviderIds, fetchQuotas } = get();
          if (dropdownProviderIds.length === 0) return;
          const answered = await fetchQuotas(dropdownProviderIds);
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
        for (const request of quotaRequests.values()) request.controller.abort();
        quotaRequests.clear();
        inFlightRuntimeLoad = null;
        set({
          // Display mode, the provider selection and the per-provider model
          // picks all come from the instance's own settings, and
          // `dropdownProviderIds` decides what gets fetched — carrying them
          // over would query the new instance through the old one's choices.
          ...defaultQuotaSettings(),
          // The extensions' providers belong to the instance too.
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

      setSelectedProvider: (providerId) => set({ selectedProviderId: providerId }),
      setDisplayMode: (mode) => set({ displayMode: mode }),
      setDropdownProviderIds: (providerIds) => set({ dropdownProviderIds: providerIds }),

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
    }

    return () => {
      quotaAutoRefreshConsumers -= 1;
      if (quotaAutoRefreshConsumers === 0 && quotaAutoRefreshInterval !== null) {
        window.clearInterval(quotaAutoRefreshInterval);
        quotaAutoRefreshInterval = null;
        lastVisibleRefreshAt = null;
      }
    };
  }, [visible, isInitialized]);
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
