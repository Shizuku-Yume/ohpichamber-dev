import React from 'react';
import { selectProvidersForDirectory, useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
<<<<<<< HEAD
import type { Model, Provider } from '@openchamber/agent-contract';
type ProviderModel = Model;
type ProviderWithModelList = Provider & { models: ProviderModel[] };

interface ModelListItem {
  provider: ProviderWithModelList;
  model: ProviderModel;
  providerID: string;
  modelID: string;
}
=======
import { resolveModelRefs } from '@/lib/modelRefs';
>>>>>>> bc50ba56a

// `directory` resolves favorites and recents against that directory's catalog
// (a settings page editing another project), not the active one.
export const useModelLists = (directory?: string) => {
  const providers = useConfigStore((state) => (directory === undefined
    ? state.providers
    : selectProvidersForDirectory(state, directory)));
  const favoriteModels = useUIStore((state) => state.favoriteModels);
  const recentModels = useUIStore((state) => state.recentModels);
  const hiddenModels = useUIStore((state) => state.hiddenModels);

<<<<<<< HEAD
  const isHidden = React.useCallback((providerID: string, modelID: string) => {
    return hiddenModels.some((item) => item.providerID === providerID && item.modelID === modelID);
  }, [hiddenModels]);

  const favoriteModelsList = React.useMemo(() => {
    return favoriteModels
      .map(({ providerID, modelID }) => {
        const provider = providers.find((p) => p.providerId === providerID);
        const model = provider?.models.find((entry) => entry.modelId === modelID);
        if (!provider || !model) return null;
        if (isHidden(providerID, modelID)) return null;
        return { provider, model, providerID, modelID };
      })
      .filter((item): item is ModelListItem => item !== null);
  }, [favoriteModels, providers, isHidden]);

  const recentModelsList = React.useMemo(() => {
    return recentModels
      .map(({ providerID, modelID }) => {
        const provider = providers.find((p) => p.providerId === providerID);
        const model = provider?.models.find((entry) => entry.modelId === modelID);
        if (!provider || !model) return null;
        if (isHidden(providerID, modelID)) return null;
        return { provider, model, providerID, modelID };
      })
      .filter((item): item is ModelListItem => item !== null)
=======
  const favoriteModelsList = React.useMemo(
    () => resolveModelRefs(favoriteModels, providers, hiddenModels),
    [favoriteModels, providers, hiddenModels],
  );

  const recentModelsList = React.useMemo(() => {
    return resolveModelRefs(recentModels, providers, hiddenModels)
>>>>>>> bc50ba56a
      .filter(({ providerID, modelID }) =>
        !favoriteModels.some(fav => fav.providerID === providerID && fav.modelID === modelID)
      );
  }, [recentModels, providers, favoriteModels, hiddenModels]);

  return { favoriteModelsList, recentModelsList };
};
