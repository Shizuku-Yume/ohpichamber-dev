import { type ConfigSlice, type DirectoryScopedConfig, type CurrentVariantSelection } from "./types";
import { selectAgentsForDirectory, useAgentsStore } from "@/stores/useAgentsStore";
import { fromDirectoryKey } from "./directories";
import { isUnchangedSelection, resolveVariantFromSelection, findProviderModel, modelVariantIds, modelHasVariant } from "./selectionResolution";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { useSelectionStore } from "@/sync/selection-store";
import { parseModelSelector } from "@openchamber/agent-contract";

export const createAgentSelection: ConfigSlice<"setAgent"> = (set, get) => ({
    setAgent: (agentName: string | undefined, options?: {
        keepModel?: boolean;
    }) => {
        const {
            activeDirectoryKey,
            providers,
            settingsDefaultModel,
            currentProviderId,
            currentModelId,
            currentAgentName
        } = get();
        const agents = selectAgentsForDirectory(useAgentsStore.getState(), fromDirectoryKey(activeDirectoryKey));
        const hadManualSelection = get().selectionSource === "manual";
        // The agent is a choice even when its model is inherited, so
        // it is recorded apart from `selectionSource`. Without it a
        // config reload resolves the default agent over this one.
        const agentSelectionSource = agentName ? "manual" as const : "auto" as const;

        // Only the write is skipped: the session memory and model
        // resolution below still run for an unchanged agent.
        if (!isUnchangedSelection(get(), {
            currentAgentName: agentName,
            agentSelectionSource
        })) {
            set(state => {
                const directoryKey = state.activeDirectoryKey;
                const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                    providers: state.providers,
                    currentProviderId: state.currentProviderId,
                    currentModelId: state.currentModelId,
                    currentAgentName: state.currentAgentName,
                    selectedProviderId: state.selectedProviderId,
                    agentModelSelections: state.agentModelSelections,
                    defaultProviders: state.defaultProviders
                };
                const nextSnapshot: DirectoryScopedConfig = {
                    ...baseSnapshot,
                    currentAgentName: agentName,
                    agentSelectionSource
                };
                return {
                    currentAgentName: agentName,
                    agentSelectionSource,
                    directoryScoped: {
                        ...state.directoryScoped,
                        [directoryKey]: nextSnapshot
                    }
                };
            });
        }
        if (agentName) {
            const {
                currentSessionId
            } = useSessionUIStore.getState();
            const selState = useSelectionStore.getState();
            if (currentSessionId) {
                selState.saveSessionAgentSelection(currentSessionId, agentName);
            }
        }
        if (agentName && !options?.keepModel) {
            const {
                currentSessionId
            } = useSessionUIStore.getState();

            // Writes the effort alongside the model, because the two are one
            // selection: leaving `currentVariantSelection` behind would let the
            // picker show one effort while sends carry another.
            const applyResolvedModelSelection = (providerId: string, modelId: string, variantSelection: CurrentVariantSelection, source: "auto" | "manual" = "manual") => {
                const variant = resolveVariantFromSelection(variantSelection);
                // Checked before `set()`: persist writes after every
                // `set()`, even one that returns the same state.
                const current = get();
                if (current.currentProviderId === providerId && current.currentModelId === modelId && current.currentVariant === variant && current.currentVariantSelection.override === variantSelection.override && current.currentVariantSelection.inherited === variantSelection.inherited && current.selectionSource === source) {
                    return;
                }
                set(state => {
                    const directoryKey = state.activeDirectoryKey;
                    const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                        providers: state.providers,
                        currentProviderId: state.currentProviderId,
                        currentModelId: state.currentModelId,
                        currentVariant: state.currentVariant,
                        currentAgentName: state.currentAgentName,
                        selectedProviderId: state.selectedProviderId,
                        agentModelSelections: state.agentModelSelections,
                        defaultProviders: state.defaultProviders
                    };
                    const nextSnapshot: DirectoryScopedConfig = {
                        ...baseSnapshot,
                        currentProviderId: providerId,
                        currentModelId: modelId,
                        currentVariant: variant,
                        currentVariantSelection: variantSelection,
                        selectionSource: source
                    };
                    return {
                        currentProviderId: providerId,
                        currentModelId: modelId,
                        currentVariant: variant,
                        currentVariantSelection: variantSelection,
                        selectionSource: source,
                        directoryScoped: {
                            ...state.directoryScoped,
                            [directoryKey]: nextSnapshot
                        }
                    };
                });
            };
            const resolveVariantSelectionForModel = (providerId: string, modelId: string, agentVariant?: string): CurrentVariantSelection => {
                const model = findProviderModel(providers, providerId, modelId);
                if (model && modelVariantIds(model).length === 0) return {
                    override: undefined,
                    inherited: undefined
                };

                // A model the catalog does not list (Auto, or a stale
                // selection) cannot rule a variant out, so inherited
                // choices stand until a real model contradicts them.
                const isAvailable = (candidate: string | null | undefined): candidate is string => candidate !== null && candidate !== undefined && (!model || modelHasVariant(model, candidate));
                const inherited = [agentVariant, get().getDefaultVariantForModel(providerId, modelId)].find(isAvailable);
                const savedVariant = currentSessionId ? useSelectionStore.getState().getAgentModelVariantForSession(currentSessionId, agentName, providerId, modelId) : undefined;
                // `null` is this session's explicit "Default"; it outranks
                // the agent and settings defaults just like a named effort.
                if (savedVariant === null || isAvailable(savedVariant)) {
                    return {
                        override: savedVariant,
                        inherited
                    };
                }

                // While drafting there is no session record to read the choice
                // back from, and switching agent is not a change of effort:
                // keep the picker's choice for this same model, "Default"
                // (an explicit `null`) included.
                const liveSelection = get().currentVariantSelection;
                const sameModel = get().currentProviderId === providerId && get().currentModelId === modelId;
                if (!currentSessionId && sameModel && (liveSelection.override === null || isAvailable(liveSelection.override))) {
                    return {
                        override: liveSelection.override,
                        inherited
                    };
                }
                return {
                    override: undefined,
                    inherited
                };
            };
            const agent = agents.find(candidate => candidate.agentId === agentName);

            // Prefer a session-level manual override for this agent over the
            // agent's configured default. Re-applying setAgent after subtask
            // completion / rematerialization must not clobber the override
            // (issue #2404).
            if (currentSessionId) {
                const existingAgentModel = useSelectionStore.getState().getAgentModelForSession(currentSessionId, agentName);
                if (existingAgentModel) {
                    applyResolvedModelSelection(existingAgentModel.providerId, existingAgentModel.modelId, resolveVariantSelectionForModel(existingAgentModel.providerId, existingAgentModel.modelId), "manual");
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
                    applyResolvedModelSelection(providerId, modelId, resolveVariantSelectionForModel(providerId, modelId), "auto");
                    return;
                }
            }
            const prevAgent = agents.find(candidate => candidate.agentId === currentAgentName);
            const prevAgentHasPinnedModel = Boolean(prevAgent?.model?.providerId === currentProviderId && prevAgent?.model?.modelId === currentModelId);
            const targetHasPinnedModel = Boolean(agent?.model);

            // The user has a live manual model selection and the target
            // agent configures no model of its own. Switching modes or
            // agents must not reset the selection to the settings default
            // (issue #2531) — mode switches are not model changes.
            if (!targetHasPinnedModel && !prevAgentHasPinnedModel && hadManualSelection && currentProviderId && currentModelId) {
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
                const parsed = parseModelSelector(settingsDefaultModel);
                if (parsed) {
                    const settingsProvider = providers.find(p => p.providerId === parsed.providerId);
                    if (settingsProvider?.models.some(model => model.modelId === parsed.modelId)) {
                        applyResolvedModelSelection(parsed.providerId, parsed.modelId, resolveVariantSelectionForModel(parsed.providerId, parsed.modelId), "auto");
                        return;
                    }
                }
            }

            // Otherwise keep the current valid model selection unchanged.
        }
    }
});
