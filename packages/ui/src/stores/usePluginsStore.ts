import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  ExtensionInventory, ExtensionInventoryState, LocalExtensionSource, PluginCatalogState, PluginConfigureRequest, PluginDoctorResult,
  MarketplaceSource, PluginInstallRequest, PluginMutationResult, PluginTarget, PluginUpgradePreviewEntry,
  PluginUpdateCheckEntry,
} from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { compareCounters } from '@/sync/event-reducer';
import { useProjectsStore } from './useProjectsStore';

interface PluginsStore {
  catalog: PluginCatalogState | null;
  /** Native capability inventory; the plugin catalog embeds it, toggles refresh it independently. */
  extensions: ExtensionInventory | null;
  /** Native settings (`/extensions`) owner revision; never the plugin catalog revision. */
  extensionRevision: string | null;
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
  upgradeAllPlugins: () => Promise<PluginMutationResult>;
  previewUpgrade: (target?: PluginTarget) => Promise<PluginUpgradePreviewEntry[]>;
  addMarketplaceSource: (source: string) => Promise<PluginMutationResult>;
  removeMarketplaceSource: (name: string) => Promise<PluginMutationResult>;
  updateMarketplaceSource: (name?: string) => Promise<PluginMutationResult>;
  checkUpdates: () => Promise<PluginUpdateCheckEntry[]>;
  listMarketplaceSources: () => Promise<MarketplaceSource[]>;
  applyPlugins: () => Promise<PluginMutationResult>;
  readLocalExtension: (extensionId: string) => Promise<LocalExtensionSource>;
  writeLocalExtension: (extensionId: string, content: string) => Promise<PluginMutationResult>;
  deleteLocalExtension: (extensionId: string) => Promise<PluginMutationResult>;
  loadMarketplace: () => Promise<void>;
  loadDoctor: () => Promise<void>;
  /** Refresh the native capability inventory without re-reading the plugin registry. */
  loadExtensions: () => Promise<ExtensionInventoryState>;
  /** Toggle one discovery provider; native `disabledProviders` is the persisted switch. */
  toggleExtensionProvider: (providerId: string, enabled: boolean) => Promise<ExtensionInventoryState>;
  /** Toggle one provider's own user-level `~/` config opt-in. */
  toggleExtensionUserSource: (providerId: string, enabled: boolean) => Promise<ExtensionInventoryState>;
  /** Toggle one discovered row through its provider's native `disabledExtensions` entry. */
  toggleExtensionItem: (providerId: string, extensionId: string, enabled: boolean) => Promise<ExtensionInventoryState>;
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
  /**
    * Extension switches are native settings writes. They own an independent
    * revision (`extensionRevision`, from the `/extensions` owner) that is never
    * the plugin catalog revision, so neither authority can overwrite the other.
    * The plugin catalog's embedded inventory is initial display only.
    */
  const applyInventory = (inventory: ExtensionInventoryState, scope: string): void => {
    if (!current(scope)) return;
    mutationRevision += 1;
    set({ extensions: inventory.extensions, extensionRevision: inventory.revision, error: null });
  };
  /**
    * Extension switches are native settings writes owned by the agent-directory
    * revision, which is never the plugin catalog revision. Writes serialize
    * behind the plugin mutation tail, use the captured extension revision for
    * CAS, and re-check the scope after any read so a runtime switch cannot carry
    * a captured workspace's write into the new host.
    */
  const extensionCall = (
    perform: (expectedRevision: string, workspaceId: string) => Promise<ExtensionInventoryState>,
  ): Promise<ExtensionInventoryState> => {
    const captured = owner();
    const run = mutationTail.then(async () => {
      const latest = owner();
      if (latest.scope !== captured.scope) throw new Error('The selected plugin workspace changed.');
      set({ isMutating: true });
      try {
        const workspaceId = latest.catalog.workspaceId;
        // Establishing the owner revision is the only read before a write; a known
        // revision is used as-is so stale CAS 409s reach the caller.
        let expectedRevision = get().extensionRevision;
        if (expectedRevision === null) {
          const established = await canonicalClient.extensions.inventory(workspaceId);
          if (!current(captured.scope)) throw new Error('The selected plugin workspace changed.');
          applyInventory(established, captured.scope);
          expectedRevision = established.revision;
        }
        const inventory = await perform(expectedRevision, workspaceId);
        applyInventory(inventory, captured.scope);
        return inventory;
      } finally {
        if (current(captured.scope)) set({ isMutating: false });
      }
    });
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
  };
  const refreshExtensions = (): Promise<ExtensionInventoryState> => {
    const captured = owner();
    const run = mutationTail.then(async () => {
      const latest = owner();
      if (latest.scope !== captured.scope) throw new Error('The selected plugin workspace changed.');
      set({ isMutating: true });
      try {
        const inventory = await canonicalClient.extensions.inventory(latest.catalog.workspaceId);
        applyInventory(inventory, captured.scope);
        return inventory;
      } finally {
        if (current(captured.scope)) set({ isMutating: false });
      }
    });
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
  };
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
            set({
              catalog: result.catalog, lastMutation: result, error: null, doctor: null
            });
          }
        }
        // Installing, removing or applying plugins changes discovered capability
        // rows; the extension owner revision stays independent of this one, so a
        // stale refresh never replaces a newer committed snapshot.
        const refreshed = await canonicalClient.extensions.inventory(result.catalog.workspaceId).catch(() => null);
        if (refreshed !== null && current(captured.scope)
          && compareCounters(refreshed.revision, get().extensionRevision ?? '0') >= 0) {
          applyInventory(refreshed, captured.scope);
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
    catalog: null, extensions: null, extensionRevision: null, loadedDirectory: null, loadedRuntimeKey: null, requestedScope: null,
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
      set({
        requestedScope: scope, isLoading: true, error: null,
        ...(previousScope !== scope ? { lastMutation: null, doctor: null, isMutating: false, extensions: null, extensionRevision: null } : {}),
      });
      const promise = (async () => {
        try {
          if (!directory) throw new Error('Select a workspace to manage native plugins.');
          const workspace = await canonicalClient.resolveWorkspace(directory);
          if (generation !== loadGeneration || getRuntimeKey() !== runtimeKey || get().requestedScope !== scope) return false;
          const catalog = await canonicalClient.plugins.list(workspace.workspaceId);
          if (generation !== loadGeneration || getRuntimeKey() !== runtimeKey || get().requestedScope !== scope) return false;
          // A forced reload reconciles the authoritative settings-owned inventory; a
          // cached read keeps the last committed snapshot rather than the catalog's copy.
          const refreshed = options?.force === true
            ? await canonicalClient.extensions.inventory(workspace.workspaceId).catch(() => null)
            : null;
          if (generation !== loadGeneration || getRuntimeKey() !== runtimeKey || get().requestedScope !== scope) return false;
          const existing = get().catalog;
          const newerMutation = existing?.workspaceId === catalog.workspaceId
            && get().loadedRuntimeKey === runtimeKey && get().loadedDirectory === directory
            && (mutationRevision !== revision || compareCounters(existing.revision, catalog.revision) > 0)
            && compareCounters(existing.revision, catalog.revision) >= 0;
          const committedCatalog = newerMutation && existing ? existing : catalog;
          // The catalog's embedded inventory is display data. An authoritative
          // `/extensions` snapshot wins whenever it has committed for this scope.
          const prior = get().extensionRevision !== null && get().extensions !== null ? get().extensions : null;
          const committedExtensions = refreshed !== null && (prior === null
            || compareCounters(refreshed.revision, get().extensionRevision ?? '0') >= 0)
            ? refreshed.extensions : prior ?? committedCatalog.extensions;
          const doctor = get().doctor;
          set({
            catalog: committedCatalog, extensions: committedExtensions,
            ...(refreshed !== null && (prior === null || compareCounters(refreshed.revision, get().extensionRevision ?? '0') >= 0)
              ? { extensionRevision: refreshed.revision } : {}),
            loadedDirectory: directory, loadedRuntimeKey: runtimeKey, isLoading: false,
            doctor: doctor?.revision === committedCatalog.revision ? doctor : null
          });
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
    upgradeAllPlugins: () => mutate(catalog => canonicalClient.plugins.upgradeAll(catalog.workspaceId, { expectedRevision: catalog.revision })),
    previewUpgrade: async target => {
      const captured = owner();
      const result = await canonicalClient.plugins.previewUpgrade(captured.catalog.workspaceId,
        target === undefined ? {} : { target });
      if (!current(captured.scope)) throw new Error('The selected plugin workspace changed.');
      return result.preview;
    },
    addMarketplaceSource: source => mutate(catalog => canonicalClient.plugins.manageMarketplace(catalog.workspaceId, {
      action: 'add', expectedRevision: catalog.revision, source
    })),
    removeMarketplaceSource: name => mutate(catalog => canonicalClient.plugins.manageMarketplace(catalog.workspaceId, {
      action: 'remove', expectedRevision: catalog.revision, name
    })),
    updateMarketplaceSource: name => mutate(catalog => canonicalClient.plugins.manageMarketplace(catalog.workspaceId,
      name === undefined ? { action: 'update', expectedRevision: catalog.revision }
        : { action: 'update', expectedRevision: catalog.revision, name })),
    /** Reads the native registry through the manage `list` action; never fetches. */
    listMarketplaceSources: async () => {
      const captured = owner();
      const result = await canonicalClient.plugins.listMarketplaceSources(captured.catalog.workspaceId);
      if (!current(captured.scope)) throw new Error('The selected plugin workspace changed.');
      const catalog = get().catalog;
      if (catalog && compareCounters(result.revision, catalog.revision) >= 0) {
        set({ catalog: { ...catalog, marketplaceSources: result.sources } });
      }
      return result.sources;
    },
    checkUpdates: async () => {
      const captured = owner();
      const result = await canonicalClient.plugins.checkUpdates(captured.catalog.workspaceId);
      if (!current(captured.scope)) throw new Error('The selected plugin workspace changed.');
      const catalog = get().catalog;
      if (catalog && compareCounters(result.revision, catalog.revision) >= 0) {
        set({ catalog: { ...catalog, availableUpdates: result.updates } });
      }
      return result.updates;
    },
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
        set({
          catalog: {
            ...catalog, marketplace: marketplace.entries,
            marketplaceSources: marketplace.sources, availableUpdates: marketplace.updates
          }
        });
      }
    },
    loadDoctor: async () => {
      const captured = owner();
      const doctor = await canonicalClient.plugins.doctor(captured.catalog.workspaceId);
      if (current(captured.scope) && doctor.revision === get().catalog?.revision) set({ doctor });
    },
    /**
      * Extension switches are native settings writes guarded by the extensions
      * owner revision, which is read immediately before each write. Writes
      * serialize behind the same tail as plugin mutations, and a scope change
      * refuses the queued write.
      */
    loadExtensions: refreshExtensions,
    toggleExtensionProvider: (providerId, enabled) =>
      extensionCall((expectedRevision, workspaceId) => canonicalClient.extensions.toggle(workspaceId,
        { expectedRevision, providerId, enabled })),
    toggleExtensionUserSource: (providerId, enabled) =>
      extensionCall((expectedRevision, workspaceId) => canonicalClient.extensions.toggle(workspaceId,
        { expectedRevision, providerId, enabled, userSource: true })),
    toggleExtensionItem: (providerId, extensionId, enabled) =>
      extensionCall((expectedRevision, workspaceId) => canonicalClient.extensions.toggle(workspaceId,
        { expectedRevision, providerId, extensionId, enabled })),
  };
}, { name: 'native-plugins-store' }));

subscribeRuntimeEndpointChanged(() => {
  usePluginsStore.setState({
    catalog: null, extensions: null, extensionRevision: null, loadedDirectory: null, loadedRuntimeKey: null, requestedScope: null,
    isLoading: false, error: null, isMutating: false, lastMutation: null, doctor: null
  });
});
