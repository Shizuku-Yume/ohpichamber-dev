import { subscribeRuntimeEndpointChanged } from "@/lib/runtime-switch";
import { configRuntime } from "./runtime";
import { invalidateOpenChamberDefaultsCache } from "./defaults";
import { _providersLoadedAt } from "./catalogLifecycle";
import { _inFlightProviders } from "./catalogRequests";
import { resetConfigInitialization } from "./connection";
import { useConfigStore } from "../useConfigStore";
import { registerAgentSelectionReader, notifyAgentReadiness } from "@/stores/agentConfigBridge";
import { hydrateConfigCatalogFromCache } from "./catalogHydration";
import { subscribeToConfigChanges, scopeMatches } from "@/lib/configSync";
import { refreshKnownProviderDirectories } from "./providers";
import { useDirectoryStore } from "@/stores/useDirectoryStore";
import { toDirectoryKey, toConfigDirectoryKey } from "./directories";
import { markStartupTrace } from "@/lib/startupTrace";
import { useRoutingStore } from "@/stores/useRoutingStore";
import { useUIStore } from "@/stores/useUIStore";

let unsubscribeConfigStoreChanges: (() => void) | null = null;
let unsubscribeConfigStoreDirectoryChanges: (() => void) | null = null;
// Auto is only a model while the server says so. Whenever that answer changes
// (routing state loaded or updated, the feature flag learned from settings,
// settings defaults loaded), a selection this server cannot honour is replaced.
let unsubscribeConfigStoreRoutingChanges: (() => void) | null = null;
let runtimeSubscribed = false;
export const subscribeConfigRuntimeChanges = (): void => {
    if (runtimeSubscribed) return;
    runtimeSubscribed = true;
    subscribeRuntimeEndpointChanged(detail => {
        configRuntime.generation += 1;
        invalidateOpenChamberDefaultsCache();
        _providersLoadedAt.clear();
        _inFlightProviders.clear();
        resetConfigInitialization();
        if (detail.runtimeKey === detail.previousRuntimeKey) return;
        useConfigStore.setState({
            configRuntimeKey: detail.runtimeKey,
            directoryScoped: {},
            lastInitFailure: null,
            providers: [],
            models: [],
            providersLoaded: false,
            workspaceId: '',
            currentProviderId: '',
            currentModelId: '',
            currentAgentName: undefined,
            currentVariant: undefined,
            currentVariantSelection: {
                override: undefined,
                inherited: undefined
            },
            currentReasoningEffort: undefined,
            selectedProviderId: '',
            agentModelSelections: {},
            defaultProviders: {},
            settingsDefaultModel: undefined,
            settingsDefaultReasoningEffort: undefined,
            settingsDefaultsLoaded: false,
            settingsZenModel: undefined,
            selectionSource: 'auto',
            agentSelectionSource: 'auto',
            isInitialized: false,
            isConnected: false
        });
    });
};
let storeSubscribed = false;
export const subscribeConfigStoreChanges = (): void => {
    if (storeSubscribed) return;
    storeSubscribed = true;
    // The agents store cannot import this module back. This store owns the
    // connection state, so it supplies the selection reader catalog publication
    // needs and forwards readiness transitions to the agents store hook.
    registerAgentSelectionReader(() => useConfigStore.getState());
    useConfigStore.subscribe((state, previous) => {
        if (state.isInitialized === previous.isInitialized && state.connectionPhase === previous.connectionPhase) return;
        notifyAgentReadiness(state);
    });

    // Show the last known catalogs of the active directory while the service starts.
    // After persist hydration, which restores the active directory key.
    if (typeof window !== "undefined") {
        const hydrateActiveCatalog = () => void hydrateConfigCatalogFromCache(useConfigStore.getState().activeDirectoryKey);
        if (useConfigStore.persist.hasHydrated()) hydrateActiveCatalog();else useConfigStore.persist.onFinishHydration(hydrateActiveCatalog);
    }
    if (!unsubscribeConfigStoreChanges) {
        unsubscribeConfigStoreChanges = subscribeToConfigChanges(async event => {
            const tasks: Promise<void>[] = [];
            if (scopeMatches(event, "providers")) {
                tasks.push(refreshKnownProviderDirectories('configChange:providers'));
            }
            if (tasks.length > 0) {
                await Promise.all(tasks);
            }
        });
    }
    if (typeof window !== "undefined" && !unsubscribeConfigStoreDirectoryChanges) {
        unsubscribeConfigStoreDirectoryChanges = useDirectoryStore.subscribe((state, prevState) => {
            const nextKey = toDirectoryKey(state.currentDirectory);
            const prevKey = toDirectoryKey(prevState.currentDirectory);
            if (nextKey === prevKey) {
                return;
            }
            markStartupTrace('directoryStore:changed', {
                previous: prevKey,
                next: nextKey
            });
            void hydrateConfigCatalogFromCache(toConfigDirectoryKey(state.currentDirectory));
            void useConfigStore.getState().activateDirectory(state.currentDirectory);
        });
    }

    // Auto is only a model while the server says so. Whenever that answer changes
    // (routing state loaded or updated, the feature flag learned from settings,
    // settings defaults loaded), a selection this server cannot honour is replaced.
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
};
