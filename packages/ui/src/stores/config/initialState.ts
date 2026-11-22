import { type ConfigSlice } from "./types";
import { resolveInitialDirectoryKey } from "./directories";
import { getRuntimeKey } from "@/lib/runtime-switch";
import { readInitialCatalogSnapshot } from "./catalogHydration";
import { type ModelMetadata } from "@/types";

export const createInitialConfigState: ConfigSlice<"catalogReloadRevision" | "activeDirectoryKey" | "directoryScoped" | "configRuntimeKey" | "providers" | "models" | "providersLoaded" | "workspaceId" | "currentProviderId" | "currentModelId" | "currentVariant" | "currentVariantSelection" | "currentReasoningEffort" | "currentAgentName" | "selectedProviderId" | "agentModelSelections" | "defaultProviders" | "selectionSource" | "agentSelectionSource" | "isConnected" | "hasEverConnected" | "connectionPhase" | "lastDisconnectReason" | "lastInitFailure" | "isInitialized" | "modelsMetadata" | "settingsDefaultModel" | "chatsDefaultModel" | "chatsDefaultVariant" | "settingsDefaultsLoaded" | "settingsDefaultReasoningEffort" | "settingsAutoCreateWorktree" | "settingsGitmojiEnabled" | "settingsDefaultFileViewerPreview" | "settingsZenModel" | "ompSettings"> = (_set, _get) => {
    const initialDirectoryKey = resolveInitialDirectoryKey();
    return {
        catalogReloadRevision: 0,
        activeDirectoryKey: initialDirectoryKey,
        directoryScoped: {},
        configRuntimeKey: getRuntimeKey(),
        ...readInitialCatalogSnapshot(initialDirectoryKey),
        workspaceId: "",
        currentProviderId: "",
        currentModelId: "",
        currentVariant: undefined,
        currentVariantSelection: {
            override: undefined,
            inherited: undefined
        },
        currentReasoningEffort: undefined,
        currentAgentName: undefined,
        selectedProviderId: "",
        agentModelSelections: {},
        defaultProviders: {},
        selectionSource: "auto",
        agentSelectionSource: "auto",
        isConnected: false,
        hasEverConnected: false,
        connectionPhase: "connecting",
        lastDisconnectReason: null,
        lastInitFailure: null,
        isInitialized: false,
        modelsMetadata: new Map<string, ModelMetadata>(),
        settingsDefaultModel: undefined,
        chatsDefaultModel: undefined,
        chatsDefaultVariant: undefined,
        settingsDefaultsLoaded: false,
        settingsDefaultReasoningEffort: undefined,
        settingsAutoCreateWorktree: false,
        settingsGitmojiEnabled: false,
        settingsDefaultFileViewerPreview: true,
        settingsZenModel: undefined,
        ompSettings: null
    };
};
