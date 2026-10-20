import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  LocalExtensionSource, PluginCatalogState, PluginConfigureRequest, PluginDoctorResult,
  PluginInstallRequest, PluginMutationResult, PluginTarget,
} from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { compareCounters } from '@/sync/event-reducer';
import { useProjectsStore } from './useProjectsStore';

interface PluginsStore {
  catalog: PluginCatalogState | null;
  loadedDirectory: string | null;
  loadedRuntimeKey: string | null;
  requestedScope: string | null;
  isLoading: boolean;
  error: Error | null;
  isMutating: boolean;
  lastMutation: PluginMutationResult | null;
  doctor: PluginDoctorResult | null;
  loadPlugins: (options?: { directory?: string | null; force?: boolean }) => Promise<boolean>;
  installPlugin: (source: PluginInstallRequest['source']) => Promise<PluginMutationResult>;
  uninstallPlugin: (target: PluginTarget) => Promise<PluginMutationResult>;
  configurePlugin: (input: Omit<PluginConfigureRequest, 'expectedRevision'>) => Promise<PluginMutationResult>;
  updatePlugin: (target: PluginTarget) => Promise<PluginMutationResult>;
  applyPlugins: () => Promise<PluginMutationResult>;
  readLocalExtension: (extensionId: string) => Promise<LocalExtensionSource>;
  writeLocalExtension: (extensionId: string, content: string) => Promise<PluginMutationResult>;
  deleteLocalExtension: (extensionId: string) => Promise<PluginMutationResult>;
  loadMarketplace: () => Promise<void>;
  loadDoctor: () => Promise<void>;
}

const directoryNow = (): string | null => useProjectsStore.getState().getActiveProject()?.path?.trim()
  || hostFilesystem.getDirectory()?.trim() || null;
const scopeKey = (directory: string | null, runtime = getRuntimeKey()): string => JSON.stringify([runtime, directory]);

/** Native catalog authority is the captured workspace plus its decimal revision, never a persisted UI snapshot. */
export const usePluginsStore = create<PluginsStore>()(devtools((set, get) => {
  let loadGeneration = 0;
  let mutationRevision = 0;
  let mutationTail = Promise.resolve();
  let inFlight: { scope: string; directory: string | null; promise: Promise<boolean> } | null = null;

  const owner = () => {
    const state = get();
    const catalog = state.catalog;
    const scope = scopeKey(state.loadedDirectory, state.loadedRuntimeKey ?? '');
    if (!catalog || state.loadedRuntimeKey !== getRuntimeKey() || state.requestedScope !== scope) {
      throw new Error('The plugin catalog is not loaded for the selected workspace.');
    }
    return { catalog, scope };
  };
  const current = (scope: string): boolean => get().requestedScope === scope
    && scopeKey(get().loadedDirectory) === scope;
  const mutate = (perform: (catalog: PluginCatalogState) => Promise<PluginMutationResult>): Promise<PluginMutationResult> => {
    const captured = owner();
    const run = mutationTail.then(async () => {
      const latest = owner();
      if (latest.scope !== captured.scope) throw new Error('The selected plugin workspace changed.');
      set({ isMutating: true });
      try {
        const result = await perform(latest.catalog);
        mutationRevision += 1;
        if (current(captured.scope)) {
          const existing = get().catalog;
          if (!existing || compareCounters(result.revision, existing.revision) >= 0) {
            set({ catalog: result.catalog, lastMutation: result, error: null, doctor: null });
          }
        }
        return result;
      } finally {
        if (current(captured.scope)) set({ isMutating: false });
      }
    });
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
  };

  return {
    catalog: null, loadedDirectory: null, loadedRuntimeKey: null, requestedScope: null,
    isLoading: false, error: null, isMutating: false, lastMutation: null, doctor: null,
    loadPlugins: options => {
      if (inFlight && inFlight.scope !== scopeKey(inFlight.directory)) inFlight = null;
      const directory = options?.directory === undefined
        ? (inFlight ? inFlight.directory : get().loadedDirectory ?? directoryNow()) : options.directory;
      const runtimeKey = getRuntimeKey();
      const scope = scopeKey(directory, runtimeKey);
      if (inFlight?.scope === scope && !options?.force) return inFlight.promise;
      const generation = ++loadGeneration;
      const revision = mutationRevision;
      const previousScope = get().requestedScope;
      set({ requestedScope: scope, isLoading: true, error: null,
        ...(previousScope !== scope ? { lastMutation: null, doctor: null, isMutating: false } : {}),
      });
      const promise = (async () => {
        try {
          if (!directory) throw new Error('Select a workspace to manage native plugins.');
          const workspace = await canonicalClient.resolveWorkspace(directory);
          if (generation !== loadGeneration || getRuntimeKey() !== runtimeKey || get().requestedScope !== scope) return false;
          const catalog = await canonicalClient.plugins.list(workspace.workspaceId);
          if (generation !== loadGeneration || getRuntimeKey() !== runtimeKey || get().requestedScope !== scope) return false;
          const existing = get().catalog;
          const newerMutation = existing?.workspaceId === catalog.workspaceId
            && get().loadedRuntimeKey === runtimeKey && get().loadedDirectory === directory
            && (mutationRevision !== revision || compareCounters(existing.revision, catalog.revision) > 0)
            && compareCounters(existing.revision, catalog.revision) >= 0;
          const committedCatalog = newerMutation && existing ? existing : catalog;
          const doctor = get().doctor;
          set({ catalog: committedCatalog, loadedDirectory: directory, loadedRuntimeKey: runtimeKey, isLoading: false,
            doctor: doctor?.revision === committedCatalog.revision ? doctor : null });
          return true;
        } catch (error) {
          if (generation !== loadGeneration || getRuntimeKey() !== runtimeKey || get().requestedScope !== scope) return false;
          set({ isLoading: false, error: error instanceof Error ? error : new Error(String(error)) });
          return false;
        }
      })();
      inFlight = { scope, directory, promise };
      void promise.then(() => { if (inFlight?.promise === promise) inFlight = null; });
      return promise;
    },
    installPlugin: source => mutate(catalog => canonicalClient.plugins.install(catalog.workspaceId, { expectedRevision: catalog.revision, source })),
    uninstallPlugin: target => mutate(catalog => canonicalClient.plugins.uninstall(catalog.workspaceId, { expectedRevision: catalog.revision, target })),
    configurePlugin: input => mutate(catalog => canonicalClient.plugins.configure(catalog.workspaceId, { ...input, expectedRevision: catalog.revision })),
    updatePlugin: target => mutate(catalog => canonicalClient.plugins.update(catalog.workspaceId, { expectedRevision: catalog.revision, target })),
    applyPlugins: () => mutate(catalog => canonicalClient.plugins.apply(catalog.workspaceId, { expectedRevision: catalog.revision, strategy: 'restart-idle-sessions' })),
    readLocalExtension: async extensionId => {
      const captured = owner();
      const result = await canonicalClient.plugins.readLocal(captured.catalog.workspaceId, extensionId);
      if (!current(captured.scope)) throw new Error('The selected plugin workspace changed.');
      return result;
    },
    writeLocalExtension: (extensionId, content) => mutate(catalog => canonicalClient.plugins.writeLocal(catalog.workspaceId, { expectedRevision: catalog.revision, extensionId, content })),
    deleteLocalExtension: extensionId => mutate(catalog => canonicalClient.plugins.deleteLocal(catalog.workspaceId, { expectedRevision: catalog.revision, extensionId })),
    loadMarketplace: async () => {
      const captured = owner();
      const marketplace = await canonicalClient.plugins.marketplace(captured.catalog.workspaceId);
      const catalog = get().catalog;
      if (current(captured.scope) && catalog && compareCounters(marketplace.revision, catalog.revision) >= 0) {
        set({ catalog: { ...catalog, marketplace: marketplace.entries } });
      }
    },
    loadDoctor: async () => {
      const captured = owner();
      const doctor = await canonicalClient.plugins.doctor(captured.catalog.workspaceId);
      if (current(captured.scope) && doctor.revision === get().catalog?.revision) set({ doctor });
    },
  };
}, { name: 'native-plugins-store' }));

subscribeRuntimeEndpointChanged(() => {
  usePluginsStore.setState({ catalog: null, loadedDirectory: null, loadedRuntimeKey: null, requestedScope: null,
    isLoading: false, error: null, isMutating: false, lastMutation: null, doctor: null });
});
