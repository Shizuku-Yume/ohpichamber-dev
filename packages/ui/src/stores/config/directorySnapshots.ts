import { type ConfigStore, type DirectoryScopedConfig, type ProviderWithModelList } from './types';
import type { Agent } from '@openchamber/agent-contract';

export const hasLiveCatalog = (state: Pick<ConfigStore, 'directoryScoped'>, directoryKey: string): boolean => (
    state.directoryScoped[directoryKey]?.providersLoaded === true
);

export const createEmptyDirectoryScopedConfig = (
    providers: ProviderWithModelList[] = [],
    agents: Agent[] = [],
): DirectoryScopedConfig => ({
    providers,
    agents,
    currentProviderId: "",
    currentModelId: "",
    currentVariant: undefined,
    currentAgentName: undefined,
    selectedProviderId: "",
    agentModelSelections: {},
    defaultProviders: {},
    opencodeDefaultAgent: undefined,
    opencodeDefaultModel: undefined,
    selectionSource: "auto",
    agentSelectionSource: "auto",
});
