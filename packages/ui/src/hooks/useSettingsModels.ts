import React from 'react';
import type { ImageModel, Model } from '@openchamber/agent-contract';
import { selectCatalogLoadedForDirectory, selectModelsForDirectory, useConfigStore } from '@/stores/useConfigStore';
import { toConfigDirectoryKey } from '@/stores/config/directories';

/**
 * The canonical model catalog for a Settings directory.
 *
 * Settings pages assign model roles and a commit-message model, so they need
 * the whole catalog — including models their provider disabled. The config
 * loader already reads exactly that catalog for the directory it tracks; a
 * page that fetched its own copy asked the Agent Service for the same bytes a
 * second time, and that read was the slowest request each page made. Reading
 * the store here keeps one catalog owner and one cache.
 */
export const useSettingsModels = (directory: string | null): Model[] => {
  const models = useConfigStore((state) => selectModelsForDirectory(state, directory));
  const loaded = useConfigStore((state) => selectCatalogLoadedForDirectory(state, 'models', directory));

  React.useEffect(() => {
    // A cached snapshot restores providers before any model catalog exists, so
    // `loaded` alone would leave the page without models. The loader dedupes
    // concurrent calls and the effect re-runs only when either input changes.
    if (!directory || (loaded && models.length > 0)) return;
    void useConfigStore.getState().loadProviders({ directory, source: 'settingsModels' });
  }, [directory, loaded, models.length]);

  return models;
};

export const useSettingsImageModels = (directory: string | null): readonly ImageModel[] | undefined => {
  const models = useConfigStore((state) => directory
    ? state.directoryScoped[toConfigDirectoryKey(directory)]?.imageModels
    : undefined);
  const loaded = useConfigStore((state) => selectCatalogLoadedForDirectory(state, 'models', directory));
  const needsLoad = !loaded || models === undefined;
  React.useEffect(() => {
    if (!directory || !needsLoad) return;
    void useConfigStore.getState().loadProviders({ directory, source: 'settingsImageModels' });
  }, [directory, needsLoad]);
  return models;
};
