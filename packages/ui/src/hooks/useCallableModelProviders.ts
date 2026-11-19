import { useEffect, useMemo } from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

<<<<<<< HEAD
/**
 * Provider ids the Small Model and Changes Walkthrough pickers may offer,
 * resolved through OMP `modelRoles` and the model catalog (decision 2026-11-05).
 * `undefined` until providers are loaded.
 */
||||||| bc50ba56aa
/**
 * Provider ids the Small Model and Changes Walkthrough pickers may offer, from
 * `GET /api/small-model`. `undefined` until the server has answered.
 *
 * Asked again whenever the provider catalog changes. A panel that mounts while
 * OpenCode is still starting gets an empty answer, and asking once per mount
 * left a walkthrough panel restored at launch with an empty picker for the
 * whole run. The catalog arriving, a provider login and a runtime switch all
 * replace the catalog, and each can change this answer. A failed request keeps
 * the previous answer. The model list is directory-scoped, so the request
 * names the current directory; without one the picker would answer for
 * OpenCode's own working location, which need not hold the project's models.
 */
=======
>>>>>>> upstream/main
export function useCallableModelProviders(enabled = true): string[] | undefined {
  const providers = useConfigStore((state) => state.providers);
  const providersLoaded = useConfigStore((state) => state.providersLoaded);
  const ompSettings = useConfigStore((state) => state.ompSettings);
  const loadOmpSettings = useConfigStore((state) => state.loadOmpSettings);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);

  useEffect(() => {
    if (!enabled) return;
    if (!ompSettings) {
      void loadOmpSettings();
    }
  }, [enabled, ompSettings, loadOmpSettings, currentDirectory]);

  return useMemo(() => {
    if (!enabled) return undefined;
    if (!providersLoaded) return undefined;

    const set = new Set<string>();

    // 1. Configured providers in the catalog
    for (const provider of providers) {
      if (provider.canonicalAuth?.status === 'configured') {
        set.add(provider.providerId);
      } else if (provider.models && provider.models.length > 0 && provider.auth?.status === 'configured') {
        set.add(provider.providerId);
      }
    }

    // 2. Providers referenced by OMP modelRoles
    const rolesSetting = ompSettings?.settings?.find((s) => s.id === 'modelRoles');
    const rolesVal = rolesSetting?.value;
    if (rolesVal && typeof rolesVal === 'object' && !Array.isArray(rolesVal)) {
      for (const val of Object.values(rolesVal)) {
        if (typeof val === 'string' && val.includes('/')) {
          const providerId = val.split('/')[0].trim();
          if (providerId) set.add(providerId);
        } else if (Array.isArray(val)) {
          for (const item of val) {
            if (typeof item === 'string' && item.includes('/')) {
              const providerId = item.split('/')[0].trim();
              if (providerId) set.add(providerId);
            }
          }
        }
      }
    }

    return Array.from(set);
  }, [enabled, providersLoaded, providers, ompSettings]);
}
