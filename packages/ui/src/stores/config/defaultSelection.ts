import { type ConfigSlice, type DirectoryScopedConfig, type ConfigStore } from "./types";
import { resolveConfigDirectory, toConfigDirectoryKey, fromDirectoryKey } from "./directories";
import { useAgentsStore } from "@/stores/useAgentsStore";
import { getProjectDefaultsForConfigDirectory } from "./projectDefaults";
import { resolveDefaultAgentModelSelection, readFallbackModelPrefs, resolveProviderModelSelection } from "./selectionResolution";
import { isStaleAutoSelection } from "./selectors";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { useSelectionStore } from "@/sync/selection-store";

export const createDefaultSelection: ConfigSlice<"resolveDirectoryDefaultSelection" | "dropStaleAutoSelection" | "applyDefaultModelAgentSelection"> = (set, get) => ({
    resolveDirectoryDefaultSelection: async directory => {
        const configDirectory = resolveConfigDirectory(directory);
        if (!configDirectory) return null;
        const directoryKey = toConfigDirectoryKey(configDirectory);
        // The directory's own catalog: a new worktree session runs elsewhere than the
        // composer that opened the dialog.
        const [,, defaults] = await Promise.all([get().loadProviders({
            directory: configDirectory,
            source: 'resolveDirectoryDefaultSelection'
        }).catch(() => undefined), useAgentsStore.getState().loadAgents(configDirectory).catch(() => undefined), Promise.resolve(getProjectDefaultsForConfigDirectory(configDirectory))]);
        const state = get();
        const isActive = state.activeDirectoryKey === directoryKey;
        const snapshot = state.directoryScoped[directoryKey];
        const providers = isActive ? state.providers : snapshot?.providers ?? [];
        const resolved = resolveDefaultAgentModelSelection({
            providers,
            projectDefaultModel: defaults.projectDefaultModel,
            projectDefaultVariant: defaults.projectDefaultVariant,
            settingsDefaultModel: state.settingsDefaultModel,
            allowFallback: state.settingsDefaultsLoaded,
            fallbackPrefs: readFallbackModelPrefs()
        });
        if (!resolved.providerId || !resolved.modelId) return null;
        return {
            agentName: resolved.agentName,
            providerId: resolved.providerId,
            modelId: resolved.modelId,
            variant: resolved.variant
        };
    },
    // Fresh drafts resolve project preferences against the native workspace roster.
    dropStaleAutoSelection: () => {
        const current = get();
        if (!isStaleAutoSelection(current.currentProviderId, current.currentModelId)) return;
        const projectDefaults = getProjectDefaultsForConfigDirectory(fromDirectoryKey(current.activeDirectoryKey));
        const resolved = resolveProviderModelSelection({
            providers: current.providers,
            settingsDefaultModel: projectDefaults.projectDefaultModel || current.settingsDefaultModel,
            defaultVariant: projectDefaults.projectDefaultModel ? projectDefaults.projectDefaultVariant : undefined,
            allowFallback: true,
            fallbackPrefs: readFallbackModelPrefs()
        });
        if (!resolved) return;
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
                currentProviderId: resolved.providerId,
                currentModelId: resolved.modelId,
                currentVariant: resolved.variant,
                currentVariantSelection: {
                    override: undefined,
                    inherited: resolved.variant
                },
                selectionSource: "auto"
            };
            return {
                currentProviderId: resolved.providerId,
                currentModelId: resolved.modelId,
                currentVariant: resolved.variant,
                currentVariantSelection: {
                    override: undefined,
                    inherited: resolved.variant
                },
                selectionSource: "auto",
                directoryScoped: {
                    ...state.directoryScoped,
                    [directoryKey]: nextSnapshot
                }
            };
        });
        // The session remembers its own pick; overwrite the stale one so the
        // next restore does not bring Auto back.
        const sessionId = useSessionUIStore.getState().currentSessionId;
        if (sessionId) {
            const selection = useSelectionStore.getState();
            selection.saveSessionModelSelection(sessionId, resolved.providerId, resolved.modelId);
            if (current.currentAgentName) selection.saveAgentModelForSession(sessionId, current.currentAgentName, resolved.providerId, resolved.modelId);
        }
    },
    applyDefaultModelAgentSelection: options => {
        const projectDefaults = options ?? getProjectDefaultsForConfigDirectory(fromDirectoryKey(get().activeDirectoryKey));
        const {
            providers,
            settingsDefaultModel
        } = get();
        const {
            agentName: resolvedAgentName,
            providerId: resolvedProviderId,
            modelId: resolvedModelId,
            variant: resolvedVariant
        } = resolveDefaultAgentModelSelection({
            providers,
            ...projectDefaults,
            settingsDefaultModel,
            allowFallback: get().settingsDefaultsLoaded,
            fallbackPrefs: readFallbackModelPrefs()
        });
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
                currentAgentName: resolvedAgentName,
                currentProviderId: resolvedProviderId ?? '',
                currentModelId: resolvedModelId ?? '',
                currentVariant: resolvedVariant,
                currentVariantSelection: {
                    override: undefined,
                    inherited: resolvedVariant
                },
                selectionSource: "auto",
                agentSelectionSource: "auto"
            };
            const nextState: Partial<ConfigStore> = {
                currentAgentName: resolvedAgentName,
                currentProviderId: nextSnapshot.currentProviderId,
                currentModelId: nextSnapshot.currentModelId,
                currentVariant: resolvedVariant,
                currentVariantSelection: {
                    override: undefined,
                    inherited: resolvedVariant
                },
                selectionSource: "auto",
                agentSelectionSource: "auto",
                directoryScoped: {
                    ...state.directoryScoped,
                    [directoryKey]: nextSnapshot
                }
            };
            return nextState;
        });
    }
});
