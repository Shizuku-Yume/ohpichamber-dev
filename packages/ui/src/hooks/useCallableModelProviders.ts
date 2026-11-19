import { useEffect, useMemo } from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

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
