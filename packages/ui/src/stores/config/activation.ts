import { type ConfigSlice } from "./types";
import { captureConfigRuntimeContext, isConfigRuntimeContextCurrent } from "./runtime";
import { resolveConfigDirectory, toDirectoryKey, fromDirectoryKey } from "./directories";
import { markStartupTrace } from "@/lib/startupTrace";
import { applyCachedCatalog } from "./catalogHydration";
import { readLocalCatalogSnapshot } from "../configCatalogCache";
import { _providersLoadedAt, isConfigFresh } from "./catalogLifecycle";
import { useAgentsStore } from "@/stores/useAgentsStore";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { useSelectionStore } from "@/sync/selection-store";

export const createDirectoryActivation: ConfigSlice<"activateDirectory"> = (set, get) => ({
    activateDirectory: async (directory, options) => {
        const runtimeContext = captureConfigRuntimeContext();
        // Keep the active catalog and snapshot scoped to the actual
        // directory, including worktrees with their own opencode.json.
        const configDirectory = resolveConfigDirectory(directory);
        if (!configDirectory) {
            markStartupTrace('activateDirectory:skippedUnknownDirectory', {
                directory
            });
            return;
        }
        const directoryKey = toDirectoryKey(configDirectory);
        // First entry into a directory with nothing in memory paints the
        // synchronous mirror in this tick; the live load still owns the
        // final catalog and replaces it.
        if (!get().directoryScoped[directoryKey]?.providers?.length) {
            applyCachedCatalog(runtimeContext, directoryKey, readLocalCatalogSnapshot(runtimeContext.runtimeKey, directoryKey));
        }
        let snapshotHadProviders = false;
        const previousDirectoryKey = get().activeDirectoryKey;
        if (previousDirectoryKey !== directoryKey) _providersLoadedAt.delete(previousDirectoryKey);
        set(state => {
            const snapshot = state.directoryScoped[directoryKey];
            const directoryChanged = state.activeDirectoryKey !== directoryKey;
            const sessionUiState = useSessionUIStore.getState();
            const activeSessionId = sessionUiState.currentSessionId;
            const promotedSessionModel = activeSessionId && sessionUiState.materializedDraftSessionId === activeSessionId
                ? useSelectionStore.getState().getSessionModelSelection(activeSessionId)
                : null;
            const carryManualModel = (options?.preserveManualModel && state.activeDirectoryKey !== directoryKey && state.selectionSource === 'manual' && Boolean(state.currentProviderId && state.currentModelId))
                || Boolean(promotedSessionModel && state.activeDirectoryKey !== directoryKey);
            const manualModel = carryManualModel ? {
                currentProviderId: promotedSessionModel?.providerId ?? state.currentProviderId,
                currentModelId: promotedSessionModel?.modelId ?? state.currentModelId,
                currentVariant: state.currentVariant,
                currentVariantSelection: state.currentVariantSelection,
                selectionSource: 'manual' as const
            } : null;
            const carriedOverride = !manualModel && options?.preserveManualModel && state.activeDirectoryKey !== directoryKey ? state.currentVariantSelection.override : undefined;
            const carriedVariant = carriedOverride === undefined ? null : {
                currentVariant: carriedOverride ?? undefined,
                currentVariantSelection: {
                    override: carriedOverride,
                    inherited: snapshot?.currentVariantSelection?.inherited ?? snapshot?.currentVariant
                }
            };
            const carried = manualModel ?? carriedVariant;
            if (snapshot) {
                snapshotHadProviders = snapshot.providers.length > 0;
                return {
                    activeDirectoryKey: directoryKey,
                    workspaceId: directoryChanged ? "" : state.workspaceId,
                    directoryScoped: carried ? {
                        ...state.directoryScoped,
                        [directoryKey]: {
                            ...snapshot,
                            ...carried
                        }
                    } : state.directoryScoped,
                    providers: snapshot.providers,
                    providersLoaded: snapshot.providersLoaded === true,
                    currentProviderId: manualModel?.currentProviderId ?? snapshot.currentProviderId,
                    currentModelId: manualModel?.currentModelId ?? snapshot.currentModelId,
                    currentVariant: carried ? carried.currentVariant : snapshot.currentVariant,
                    currentVariantSelection: carried?.currentVariantSelection ?? snapshot.currentVariantSelection ?? {
                        override: undefined,
                        inherited: snapshot.currentVariant
                    },
                    currentAgentName: snapshot.currentAgentName,
                    selectedProviderId: snapshot.selectedProviderId,
                    agentModelSelections: snapshot.agentModelSelections,
                    defaultProviders: snapshot.defaultProviders,
                    selectionSource: manualModel?.selectionSource ?? snapshot.selectionSource ?? "auto",
                    agentSelectionSource: snapshot.agentSelectionSource ?? "auto"
                };
            }
            return {
                activeDirectoryKey: directoryKey,
                workspaceId: directoryChanged ? "" : state.workspaceId,
                directoryScoped: carried ? {
                    ...state.directoryScoped,
                    [directoryKey]: {
                        providers: [],
                        models: [],
                        agentModelSelections: {},
                        defaultProviders: {},
                        selectedProviderId: '',
                        currentAgentName: undefined,
                        currentProviderId: '',
                        currentModelId: '',
                        ...carried
                    }
                } : state.directoryScoped,
                providers: [],
                providersLoaded: false,
                currentProviderId: manualModel?.currentProviderId ?? "",
                currentModelId: manualModel?.currentModelId ?? "",
                currentVariant: carried?.currentVariant,
                currentVariantSelection: carried?.currentVariantSelection ?? {
                    override: undefined,
                    inherited: undefined
                },
                currentAgentName: undefined,
                selectedProviderId: "",
                agentModelSelections: {},
                defaultProviders: {},
                selectionSource: manualModel?.selectionSource ?? "auto",
                agentSelectionSource: "auto"
            };
        });
        if (!get().isConnected) {
            return;
        }

        // Stale-while-revalidate: when a cached snapshot already
        // populated the pickers, refresh in the background so the UI
        // stays instant but never shows stale provider/agent data for
        // longer than one fetch. Only block when there is nothing to show.
        // A directory switch clears the workspace identity, so even a
        // fresh provider snapshot must resolve again: the snapshot
        // keeps the pickers painted, but quota and catalog consumers
        // need the new directory's workspace before they can read.
        const directoryChanged = previousDirectoryKey !== directoryKey;
        const requiredLoads: Promise<void | boolean>[] = [];
        if (snapshotHadProviders) {
            if (!directoryChanged && isConfigFresh(_providersLoadedAt, directoryKey)) {
                markStartupTrace('activateDirectory:providersFresh', {
                    directoryKey
                });
            } else if (directoryChanged) {
                markStartupTrace('activateDirectory:resolveNewDirectory', {
                    directoryKey
                });
                requiredLoads.push(get().loadProviders({
                    directory: fromDirectoryKey(directoryKey),
                    source: 'activateDirectory:directoryChange'
                }));
            } else {
                markStartupTrace('activateDirectory:refreshProvidersBackground', {
                    directoryKey
                });
                void get().loadProviders({
                    directory: fromDirectoryKey(directoryKey),
                    source: 'activateDirectory:refresh'
                });
            }
        } else {
            requiredLoads.push(get().loadProviders({
                directory: fromDirectoryKey(directoryKey),
                source: 'activateDirectory'
            }));
        }
        if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
        requiredLoads.push(useAgentsStore.getState().loadAgents(fromDirectoryKey(directoryKey)));
        await Promise.all(requiredLoads);
        if (!isConfigRuntimeContextCurrent(runtimeContext) || get().activeDirectoryKey !== directoryKey) return;
        if (!useSessionUIStore.getState().currentSessionId && get().selectionSource === 'auto' && get().agentSelectionSource === 'auto' && get().currentVariantSelection.override === undefined) {
            get().applyDefaultModelAgentSelection();
        }
    }
});
