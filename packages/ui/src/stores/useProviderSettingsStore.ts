import { createStore } from 'zustand/vanilla';
import type { ModelCatalog, ProviderCatalog } from '@openchamber/agent-contract';
import { canonicalClient, type CanonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { emitConfigChange } from '@/lib/configSync';

type ProviderClient = Pick<CanonicalClient, 'resolveWorkspace' | 'getProviders' | 'getModels'>;
export interface ProviderSettingsState {
  directory: string | null;
  runtimeKey: string;
  workspaceId: string | null;
  providers: ProviderCatalog | null;
  models: ModelCatalog | null;
  loading: boolean;
  error: Error | null;
  load: (directory: string) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

/** Page-owned, non-persisted catalogs. Neither credentials nor header values enter this store. */
export function createProviderSettingsStore(client: ProviderClient = canonicalClient, runtimeKey = getRuntimeKey) {
  let generation = 0;
  return createStore<ProviderSettingsState>((set, get) => ({
    directory: null, runtimeKey: runtimeKey(), workspaceId: null,
    providers: null, models: null, loading: false, error: null,
    reset: () => {
      generation++;
      set({ directory: null, runtimeKey: runtimeKey(), workspaceId: null, providers: null, models: null, loading: false, error: null });
    },
    load: async (directory) => {
      const owner = ++generation;
      const runtime = runtimeKey();
      const sameScope = get().directory === directory && get().runtimeKey === runtime;
      set({ directory, runtimeKey: runtime, loading: true, error: null,
        ...(!sameScope ? { workspaceId: null, providers: null, models: null } : {}) });
      const current = () => owner === generation && runtime === runtimeKey();
      try {
        const workspace = await client.resolveWorkspace(directory);
        if (!current()) return;
        const [providers, models] = await Promise.all([
          client.getProviders(workspace.workspaceId), client.getModels(workspace.workspaceId),
        ]);
        if (!current()) return;
        set({ workspaceId: workspace.workspaceId, providers, models, loading: false });
      } catch (error) {
        if (current()) set({ loading: false, error: error instanceof Error ? error : new Error(String(error)) });
      }
    },
    refresh: async () => {
      const directory = get().directory;
      if (directory && get().runtimeKey === runtimeKey()) {
        emitConfigChange('providers', { source: 'useProviderSettingsStore' });
        await get().load(directory);
      }
    },
  }));
}
