import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ConfigStore, ConfigStoreWithPersist } from './config/types';
import { configPersistence } from './config/persistence';
import { subscribeConfigRuntimeChanges, subscribeConfigStoreChanges } from './config/subscriptions';
import { createInitialConfigState } from './config/initialState';
import { createVoiceSettings } from './config/voice';
import { createDirectoryActivation } from './config/activation';
import { createProviderCatalog } from './config/providers';
import { createModelSelection } from './config/modelSelection';
import { createSettingsDefaults } from './config/defaults';
import { createMetadataActions } from './config/metadata';
import { createAgentSelection } from './config/agentSelection';
import { createDefaultSelection } from './config/defaultSelection';
import { createConfigConnection } from './config/connection';
import { createConfigGetters } from './config/selectors';

subscribeConfigRuntimeChanges();

export const useConfigStore: ConfigStoreWithPersist = create<ConfigStore>()(devtools(persist((set, get) => ({
    ...createInitialConfigState(set, get),
    ...createVoiceSettings(set, get),
    ...createDirectoryActivation(set, get),
    ...createProviderCatalog(set, get),
    ...createModelSelection(set, get),
    ...createSettingsDefaults(set, get),
    ...createMetadataActions(set, get),
    ...createAgentSelection(set, get),
    ...createDefaultSelection(set, get),
    ...createConfigConnection(set, get),
    ...createConfigGetters(set, get),
}), configPersistence)));

subscribeConfigStoreChanges();

export { invalidateOpenChamberDefaultsCache } from './config/defaults';
export { isStaleAutoSelection, selectConfiguredModelPair, selectProvidersForDirectory, selectModelsForDirectory, selectKnownCatalogModel, selectCatalogLoadedForDirectory } from './config/selectors';
export { type InitFailure } from './config/types';
