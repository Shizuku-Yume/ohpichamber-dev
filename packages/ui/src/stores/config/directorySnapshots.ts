import { type DirectoryScopedConfig, type ProviderWithModelList } from "./types";
import { type Model } from "@openchamber/agent-contract";

export const createEmptyDirectoryScopedConfig = (providers: ProviderWithModelList[] = [], models: Model[] = []): DirectoryScopedConfig => ({
    providers,
    models,
    currentProviderId: "",
    currentModelId: "",
    currentVariant: undefined,
    currentAgentName: undefined,
    selectedProviderId: "",
    agentModelSelections: {},
    defaultProviders: {},
    selectionSource: "auto",
    agentSelectionSource: "auto"
});
