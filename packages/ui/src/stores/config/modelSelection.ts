import { type ConfigSlice, type DirectoryScopedConfig } from "./types";
import { AUTO_PROVIDER_ID, AUTO_MODEL_ID } from "@/lib/routing/autoModel";
import { hasProviderModel, isUnchangedSelection, variantResetForModelChange, resolveVariantFromSelection, modelVariantIds, resolveConfiguredDefaultVariant } from "./selectionResolution";
import { getProjectDefaultsForConfigDirectory } from "./projectDefaults";
import { fromDirectoryKey } from "./directories";

export const createModelSelection: ConfigSlice<"setProvider" | "setModel" | "setCurrentVariant" | "setCurrentReasoningEffort" | "setCurrentVariantOverride" | "getCurrentModelVariants" | "getDefaultVariantForModel" | "cycleCurrentVariant" | "setSelectedProvider" | "saveAgentModelSelection" | "getAgentModelSelection"> = (set, get) => ({
    setProvider: (providerId: string) => {
        const {
            providers
        } = get();
        const provider = providers.find(p => p.providerId === providerId);
        const isAuto = providerId === AUTO_PROVIDER_ID && hasProviderModel(providers, AUTO_PROVIDER_ID, AUTO_MODEL_ID);
        if (!provider && !isAuto) {
            return;
        }
        const firstModel = provider?.models[0];
        const newModelId = isAuto ? AUTO_MODEL_ID : firstModel?.modelId || "";
        if (isUnchangedSelection(get(), {
            currentProviderId: providerId,
            currentModelId: newModelId,
            selectionSource: "manual"
        })) {
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
            const variantReset = variantResetForModelChange(state, providerId, newModelId);
            const nextSnapshot: DirectoryScopedConfig = {
                ...baseSnapshot,
                ...variantReset,
                currentProviderId: providerId,
                currentModelId: newModelId,
                selectionSource: "manual"
            };
            return {
                ...variantReset,
                currentProviderId: providerId,
                currentModelId: newModelId,
                selectionSource: "manual",
                directoryScoped: {
                    ...state.directoryScoped,
                    [directoryKey]: nextSnapshot
                }
            };
        });
    },
    setModel: (modelId: string) => {
        if (isUnchangedSelection(get(), {
            currentModelId: modelId,
            selectionSource: "manual"
        })) {
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
            const variantReset = variantResetForModelChange(state, state.currentProviderId, modelId);
            const nextSnapshot: DirectoryScopedConfig = {
                ...baseSnapshot,
                ...variantReset,
                currentModelId: modelId,
                selectionSource: "manual"
            };
            return {
                ...variantReset,
                currentModelId: modelId,
                selectionSource: "manual",
                directoryScoped: {
                    ...state.directoryScoped,
                    [directoryKey]: nextSnapshot
                }
            };
        });
    },
    setCurrentVariant: (variant: string | undefined) => {
        get().setCurrentVariantOverride(undefined, variant);
    },
    setCurrentReasoningEffort: effort => {
        if (get().currentReasoningEffort !== effort) set({
            currentReasoningEffort: effort
        });
    },
    setCurrentVariantOverride: (override, inherited) => {
        set(state => {
            const currentVariant = resolveVariantFromSelection({
                override,
                inherited
            });
            if (state.currentVariant === currentVariant && state.currentVariantSelection.override === override && state.currentVariantSelection.inherited === inherited) {
                return state;
            }
            const directoryKey = state.activeDirectoryKey;
            const baseSnapshot = state.directoryScoped[directoryKey] ?? {
                providers: state.providers,
                currentProviderId: state.currentProviderId,
                currentModelId: state.currentModelId,
                currentVariant: state.currentVariant,
                currentAgentName: state.currentAgentName,
                selectedProviderId: state.selectedProviderId,
                agentModelSelections: state.agentModelSelections,
                defaultProviders: state.defaultProviders
            };
            return {
                currentVariant,
                currentVariantSelection: {
                    override,
                    inherited
                },
                directoryScoped: {
                    ...state.directoryScoped,
                    [directoryKey]: {
                        ...baseSnapshot,
                        currentVariant,
                        currentVariantSelection: {
                            override,
                            inherited
                        }
                    }
                }
            };
        });
    },
    getCurrentModelVariants: () => {
        return modelVariantIds(get().getCurrentModel());
    },
    getDefaultVariantForModel: (providerId: string, modelId: string) => {
        const state = get();
        return resolveConfiguredDefaultVariant({
            ...getProjectDefaultsForConfigDirectory(fromDirectoryKey(state.activeDirectoryKey)),
            settingsDefaultModel: state.settingsDefaultModel
        }, providerId, modelId);
    },
    cycleCurrentVariant: () => {
        const variantKeys = get().getCurrentModelVariants();
        if (variantKeys.length === 0) {
            return undefined;
        }
        const state = get();
        const currentOverride = state.currentVariantSelection.override;
        const inheritedVariant = state.currentVariantSelection.inherited ?? state.currentVariant;
        const currentVariant = currentOverride === undefined ? state.currentVariant : currentOverride;
        let nextOverride: string | null;
        if (currentVariant === null || currentVariant === undefined) {
            nextOverride = variantKeys[0];
        } else {
            const index = variantKeys.indexOf(currentVariant);
            nextOverride = index >= 0 ? variantKeys[index + 1] ?? null : null;
        }
        get().setCurrentVariantOverride(nextOverride, inheritedVariant);
        return nextOverride ?? undefined;
    },
    setSelectedProvider: (providerId: string) => {
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
                selectedProviderId: providerId,
                selectionSource: "manual"
            };
            return {
                selectedProviderId: providerId,
                selectionSource: "manual",
                directoryScoped: {
                    ...state.directoryScoped,
                    [directoryKey]: nextSnapshot
                }
            };
        });
    },
    saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => {
        set(state => {
            const directoryKey = state.activeDirectoryKey;
            const nextSelections = {
                ...state.agentModelSelections,
                [agentName]: {
                    providerId,
                    modelId
                }
            };
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
                agentModelSelections: nextSelections,
                selectionSource: "manual"
            };
            return {
                agentModelSelections: nextSelections,
                selectionSource: "manual",
                directoryScoped: {
                    ...state.directoryScoped,
                    [directoryKey]: nextSnapshot
                }
            };
        });
    },
    getAgentModelSelection: (agentName: string) => {
        const {
            agentModelSelections
        } = get();
        return agentModelSelections[agentName] || null;
    }
});
