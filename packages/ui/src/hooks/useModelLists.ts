import React from 'react';
import { selectProvidersForDirectory, useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { findCatalogModel } from '@/lib/opencode/model';
import type { Model, Provider } from '@openchamber/agent-contract';

type ProviderWithModelList = Provider;

interface ModelListItem {
  provider: ProviderWithModelList;
  model: Model;
  providerId: string;
  modelId: string;
}

// `directory` resolves favorites and recents against that directory's catalog
// (a settings page editing another project), not the active one.
export const useModelLists = (directory?: string) => {
  const providers = useConfigStore((state) => (directory === undefined
    ? state.providers
    : selectProvidersForDirectory(state, directory)));
  const favoriteModels = useUIStore((state) => state.favoriteModels);
  const recentModels = useUIStore((state) => state.recentModels);
  const hiddenModels = useUIStore((state) => state.hiddenModels);

  const isHidden = React.useCallback((providerID: string, modelID: string) => {
    return hiddenModels.some((item) => item.providerID === providerID && item.modelID === modelID);
  }, [hiddenModels]);

  const favoriteModelsList = React.useMemo(() => {
    return favoriteModels
      .map(({ providerID: providerId, modelID: modelId }) => {
        const provider = providers.find((p) => p.providerId === providerId);
        if (!provider) return null;
        const model = findCatalogModel(provider.models, modelId);
        if (!model) return null;
        if (isHidden(providerId, modelId)) return null;
        return { provider, model, providerId, modelId };
      })
      .filter((item): item is ModelListItem => item !== null);
  }, [favoriteModels, providers, isHidden]);

  const recentModelsList = React.useMemo(() => {
    return recentModels
      .map(({ providerID: providerId, modelID: modelId }) => {
        const provider = providers.find((p) => p.providerId === providerId);
        if (!provider) return null;
        const model = findCatalogModel(provider.models, modelId);
        if (!model) return null;
        if (isHidden(providerId, modelId)) return null;
        return { provider, model, providerId, modelId };
      })
      .filter((item): item is ModelListItem => item !== null)
      .filter(({ providerId, modelId }) =>
        !favoriteModels.some(fav => fav.providerID === providerId && fav.modelID === modelId)
      );
  }, [recentModels, providers, favoriteModels, isHidden]);

  return { favoriteModelsList, recentModelsList };
};
