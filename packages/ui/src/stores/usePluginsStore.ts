import { create } from 'zustand';
<<<<<<< HEAD
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
=======
import { devtools, persist } from 'zustand/middleware';
import { createDeferredSafeJSONStorage } from './utils/safeStorage';
import { startConfigUpdate } from '@/lib/configUpdate';
import { refreshAfterOpenCodeRestart } from '@/stores/useAgentsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { OpencodeApiError, opencodeClient } from '@/lib/opencode/client';
import {
  checkPluginUpdates,
  listPluginRuntime,
  updatePluginPackage,
  type PluginRuntimeInfo,
} from '@/lib/opencode/plugins';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { getRuntimeKey } from '@/lib/runtime-switch';

export type PluginScope = 'user' | 'project';
/** `control` is an OpenCode 2 entry such as `-name` or `*` that turns known plugins off or on. */
export type PluginParsedKind = 'control' | 'npm' | 'path' | 'git';

export type PluginSwitchState = 'on' | 'off' | 'unavailable' | 'unreadable' | 'overridden';

export interface PluginEntry {
  id: string;
  spec: string;
  options?: Record<string, unknown>;
  scope: PluginScope;
  kind: 'config';
  parsedKind: PluginParsedKind;
  /** The config file that declares the entry; relative path specs resolve against its directory. */
  sourcePath?: string;
  /** The `plugin:` resource an `integration.use` policy matches; OpenChamber's managed layer denies it. */
  policyResource?: string;
  /** OpenChamber's switch state; unavailable when it cannot be applied here, unreadable when its store cannot be read, overridden when a rule in the OpenCode config keeps the plugin loading. */
  switchState?: PluginSwitchState;
  /** Host-resolved local target used only to filter duplicate discovery records. */
  resolvedPath?: string;
}

export interface PluginFile {
  id: string;
  fileName: string;
  scope: PluginScope;
  /** `file` is a `.ts`/`.js` OpenChamber can open; `package` is a plugin directory (or a v1 `plugin/` file) OpenCode loads but the page only lists. */
  kind: 'file' | 'package';
  absolutePath?: string;
  /** The `plugin:` resource an `integration.use` policy matches for this local plugin. */
  policyResource?: string;
  /** OpenChamber's switch state; unavailable when it cannot be applied here, unreadable when its store cannot be read, overridden when a rule in the OpenCode config keeps the plugin loading. */
  switchState?: PluginSwitchState;
  /** Host-resolved local target used only to filter duplicate discovery records. */
  resolvedPath?: string;
}

export interface PluginDraft {
  mode: 'entry' | 'file';
  scope: PluginScope;
  spec: string;
  optionsJson: string;
  fileName: string;
  content: string;
}

type PluginMutationResult = {
  ok: boolean;
  reloadFailed?: boolean;
  message?: string;
  warning?: string;
  requiresManualRestart?: boolean;
  /** The server refused the spec: OpenCode cannot load it. Nothing was written. */
  invalidSpec?: boolean;
  /** The server refused a switch: a rule in the OpenCode config would beat it. Nothing was written. */
  switchOverridden?: boolean;
};

export type RegistryResult =
  | { kind: 'npm-ok'; spec: string; name: string; currentVersion: string | null; latestVersion: string | null; versions: string[]; hasUpdate: boolean }
  | { kind: 'npm-missing-version'; spec: string; name: string; currentVersion: string; latestVersion: string | null; versions: string[] }
  | { kind: 'npm-missing-package'; spec: string; name: string; error: string }
  | { kind: 'npm-malformed'; spec: string; error: string }
  | { kind: 'npm-network'; spec: string; error: string }
  | { kind: 'path-ok'; spec: string; absolutePath: string }
  | { kind: 'path-missing'; spec: string; absolutePath: string }
  | { kind: 'path-unreadable'; spec: string; absolutePath: string }
  /** A Git package spec: OpenCode resolves it itself, so there is nothing to check. */
  | { kind: 'git-ok'; spec: string };

/**
 * What OpenCode reported for the plugins of one directory and runtime
 * (`scope`, see `getPluginsScopeKey`). `failed` means the read failed: every
 * plugin's status is unknown, never "all fine" and never "all failed".
 */
type PluginRuntimeSnapshot =
  | { kind: 'idle' }
  | { kind: 'ready'; scope: string; plugins: PluginRuntimeInfo[] }
  | { kind: 'failed'; scope: string };

/** An update this client started, keyed by `getPluginUpdateKey`. */
export type PluginPackageUpdate =
  | { kind: 'running' }
  | { kind: 'failed'; error: string };
>>>>>>> bc50ba56a

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
<<<<<<< HEAD
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
=======
  registryInfo: Record<string, RegistryResult>;
  isLoadingRegistry: boolean;
  draft: PluginDraft | null;
  runtime: PluginRuntimeSnapshot;
  isCheckingUpdates: boolean;
  packageUpdates: Record<string, PluginPackageUpdate>;
  /** Bumped after a switch writes a policy and on config events, so every policy reader re-reads. */
  policyRevision: number;

  setSelected: (id: string | null) => void;
  setDraft: (draft: PluginDraft | null) => void;
  loadPlugins: (options?: { force?: boolean }) => Promise<boolean>;
  loadRegistryInfo: (opts?: { specs?: string[]; force?: boolean }) => Promise<boolean>;
  updateToLatest: (id: string) => Promise<PluginMutationResult>;
  loadRuntime: () => Promise<boolean>;
  checkUpdates: () => Promise<boolean>;
  updatePackage: (target: string) => Promise<boolean>;
  createEntry: (input: { spec: string; options?: Record<string, unknown>; scope: PluginScope }) => Promise<PluginMutationResult>;
  updateEntry: (id: string, input: { spec?: string; options?: Record<string, unknown> }) => Promise<PluginMutationResult>;
  setEntryEnabled: (id: string, enabled: boolean) => Promise<PluginMutationResult>;
  setFileEnabled: (id: string, enabled: boolean) => Promise<PluginMutationResult>;
  bumpPolicyRevision: () => void;
  deleteEntry: (id: string) => Promise<PluginMutationResult>;
  readFile: (id: string) => Promise<{ fileName: string; scope: PluginScope; content: string } | null>;
  createFile: (input: { fileName: string; content: string; scope: PluginScope }) => Promise<PluginMutationResult>;
  updateFile: (id: string, input: { content: string }) => Promise<PluginMutationResult>;
  deleteFile: (id: string) => Promise<PluginMutationResult>;
  getById: (id: string) => PluginEntry | PluginFile | undefined;
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
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
=======

    const clientDir = opencodeClient.getDirectory();
    if (clientDir?.trim()) {
      return clientDir.trim();
    }
  } catch (err) {
    console.warn('[PluginsStore] Error resolving config directory:', err);
  }
  return null;
};

const CLIENT_RELOAD_DELAY_MS = 800;
const PLUGINS_LOAD_CACHE_TTL_MS = 5000;
const DEFAULT_PLUGINS_CACHE_KEY = '__default__';
const pluginsLastLoadedAt = new Map<string, number>();
const pluginsLoadInFlight = new Map<string, Promise<boolean>>();
const REGISTRY_SPECS_CHUNK_LIMIT = 1500;

const getPluginCacheKey = (directory: string | null): string => {
  return JSON.stringify([getRuntimeKey(), directory?.trim() || DEFAULT_PLUGINS_CACHE_KEY]);
};

/** Identifies the directory and runtime a runtime snapshot or update belongs to. */
export const getPluginsScopeKey = getPluginCacheKey;

export const getPluginUpdateKey = (scope: string, target: string): string => JSON.stringify([scope, target]);

// Only the newest runtime read may commit: a slower earlier one (or one for a
// directory the user already left) would put back an older inventory.
let runtimeReadGeneration = 0;

const invalidatePluginCache = (directory: string | null) => {
  pluginsLastLoadedAt.delete(getPluginCacheKey(directory));
};

export const usePluginsStore = create<PluginsStore>()(
  devtools(
    persist(
      (set, get) => ({
        entries: [],
        loadedDirectory: undefined,
        loadedRuntimeKey: undefined,
        files: [],
        selectedId: null,
        isLoading: false,
        registryInfo: {},
        isLoadingRegistry: false,
        draft: null,
        runtime: { kind: 'idle' },
        isCheckingUpdates: false,
        packageUpdates: {},
        policyRevision: 0,

        setSelected: (id) => set({ selectedId: id }),

        setDraft: (draft) => set({ draft }),

        loadPlugins: async (options) => {
          const configDirectory = getPluginsConfigDirectory();
          const runtimeKey = getRuntimeKey();
          const cacheKey = getPluginCacheKey(configDirectory);
          const now = Date.now();
          const loadedAt = pluginsLastLoadedAt.get(cacheKey) ?? 0;
          const hasCachedPlugins = get().loadedRuntimeKey === runtimeKey && get().loadedDirectory === configDirectory
            && (get().entries.length > 0 || get().files.length > 0);

          if (!options?.force && hasCachedPlugins && now - loadedAt < PLUGINS_LOAD_CACHE_TTL_MS) {
            return true;
          }

          const inFlight = pluginsLoadInFlight.get(cacheKey);
          if (!options?.force && inFlight) {
            return inFlight;
          }

          void get().loadRuntime();

          const request = (async () => {
            set({ isLoading: true });
            try {
              const response = await runtimeFetch(buildPluginsUrl('/api/config/plugins', configDirectory), {
                headers: buildDirectoryHeaders(configDirectory),
              });
              if (!response.ok) {
                throw new Error('Failed to load plugins');
              }
              const data = await readJson<PluginsListResponse>(response);
              if (getPluginCacheKey(getPluginsConfigDirectory()) !== cacheKey) return false;
              set({ entries: data.entries ?? [], files: data.files ?? [], loadedDirectory: configDirectory, loadedRuntimeKey: runtimeKey, isLoading: false });
              pluginsLastLoadedAt.set(cacheKey, Date.now());
              if (!options?.force) {
                void get().loadRegistryInfo();
              }
              return true;
            } catch (error) {
              if (getPluginCacheKey(getPluginsConfigDirectory()) !== cacheKey) return false;
              console.error('[PluginsStore] Failed to load plugins:', error);
              set({ isLoading: false });
              return false;
            }
          })();

          pluginsLoadInFlight.set(cacheKey, request);
          try {
            return await request;
          } finally {
            if (pluginsLoadInFlight.get(cacheKey) === request) pluginsLoadInFlight.delete(cacheKey);
          }
        },

        loadRegistryInfo: async (opts) => {
          const specs = dedupeSpecs(opts?.specs ?? get().entries.map((entry) => entry.spec));
          if (specs.length === 0) {
            set({ isLoadingRegistry: false });
            return true;
          }

          set({ isLoadingRegistry: true });
          try {
            const configDirectory = getPluginsConfigDirectory();
            const nextRegistryInfo: Record<string, RegistryResult> = { ...get().registryInfo };
            for (const chunk of chunkSpecs(specs)) {
              const response = await runtimeFetch(buildRegistryUrl(chunk, opts?.force === true, configDirectory), {
                headers: buildDirectoryHeaders(configDirectory),
              });
              if (!response.ok) {
                throw new Error('Failed to load plugin registry info');
              }
              const data = await readJson<RegistryInfoResponse>(response);
              for (const result of data.results ?? []) {
                nextRegistryInfo[result.spec] = result;
              }
            }
            set({ registryInfo: nextRegistryInfo, isLoadingRegistry: false });
            return true;
          } catch (error) {
            console.error('[PluginsStore] Failed to load plugin registry info:', error);
            set({ isLoadingRegistry: false });
            return false;
          }
        },

        loadRuntime: async () => {
          const configDirectory = getPluginsConfigDirectory();
          const scope = getPluginsScopeKey(configDirectory);
          const generation = ++runtimeReadGeneration;
          try {
            const plugins = await listPluginRuntime(configDirectory);
            if (generation !== runtimeReadGeneration || getPluginsScopeKey(getPluginsConfigDirectory()) !== scope) return false;
            set({ runtime: { kind: 'ready', scope, plugins } });
            return true;
          } catch (error) {
            if (generation !== runtimeReadGeneration || getPluginsScopeKey(getPluginsConfigDirectory()) !== scope) return false;
            console.error('[PluginsStore] Failed to read plugin status from OpenCode:', error);
            set({ runtime: { kind: 'failed', scope } });
            return false;
          }
        },

        checkUpdates: async () => {
          const configDirectory = getPluginsConfigDirectory();
          const scope = getPluginsScopeKey(configDirectory);
          set({ isCheckingUpdates: true });
          try {
            const plugins = await checkPluginUpdates(configDirectory);
            // A check returns the whole inventory, so once it lands it
            // supersedes list reads still in flight. Claiming the generation
            // only on success keeps a failed check from discarding them.
            runtimeReadGeneration += 1;
            if (getPluginsScopeKey(getPluginsConfigDirectory()) === scope) {
              set({ runtime: { kind: 'ready', scope, plugins } });
            }
            return true;
          } catch (error) {
            // The inventory already on screen is still what OpenCode loaded;
            // only its update flags were not refreshed. The caller reports it.
            console.error('[PluginsStore] Failed to check plugin updates:', error);
            return false;
          } finally {
            set({ isCheckingUpdates: false });
          }
        },

        updatePackage: async (target) => {
          const configDirectory = getPluginsConfigDirectory();
          const key = getPluginUpdateKey(getPluginsScopeKey(configDirectory), target);
          if (get().packageUpdates[key]?.kind === 'running') return false;
          set({ packageUpdates: { ...get().packageUpdates, [key]: { kind: 'running' } } });
          try {
            await updatePluginPackage(configDirectory, target);
            // OpenCode announces the reload with `plugin.updated`; reading now
            // clears the update flag even when that event is missed. The row
            // stays running until then so the stale flag can't offer a rerun.
            await get().loadRuntime();
            const next = { ...get().packageUpdates };
            delete next[key];
            set({ packageUpdates: next });
            return true;
          } catch (error) {
            const message = error instanceof OpencodeApiError ? error.detail : error instanceof Error ? error.message : String(error);
            set({ packageUpdates: { ...get().packageUpdates, [key]: { kind: 'failed', error: message } } });
            return false;
          }
        },

        updateToLatest: async (id) => {
          const entry = get().entries.find((plugin) => plugin.id === id);
          if (!entry) return { ok: false };
          const info = get().registryInfo[entry.spec];
          if (!info || info.kind !== 'npm-ok' || !info.hasUpdate || !info.latestVersion) {
            return { ok: false };
          }
          return await get().updateEntry(id, { spec: `${info.name}@${info.latestVersion}` });
        },

        createEntry: async (input) => {
          const result = await runPluginMutation('Creating plugin entry…', async (configDirectory) => {
            const response = await runtimeFetch(buildPluginsUrl('/api/config/plugins/entry', configDirectory), {
              method: 'POST',
              headers: buildJsonHeaders(configDirectory),
              body: JSON.stringify(buildEntryBody(input)),
            });
            return response;
          }, get);
          if (result.ok) {
            void get().loadRegistryInfo({ specs: [input.spec], force: true });
          }
          return result;
        },

        updateEntry: async (id, input) => {
          const existingSpec = get().entries.find((plugin) => plugin.id === id)?.spec;
          const nextSpec = input.spec ?? existingSpec;
          const result = await runPluginMutation('Updating plugin entry…', async (configDirectory) => {
            const response = await runtimeFetch(buildPluginsUrl(`/api/config/plugins/entry/${encodeURIComponent(id)}`, configDirectory), {
              method: 'PATCH',
              headers: buildJsonHeaders(configDirectory),
              body: JSON.stringify(buildEntryBody(input)),
            });
            return response;
          }, get);
          if (result.ok && nextSpec) {
            void get().loadRegistryInfo({ specs: [nextSpec], force: true });
          }
          return result;
        },

        setEntryEnabled: async (id, enabled) => {
          return runPluginMutation(
            enabled ? 'Enabling plugin…' : 'Disabling plugin…',
            async (configDirectory) => runtimeFetch(
              buildPluginsUrl(`/api/config/plugins/entry/${encodeURIComponent(id)}/enabled`, configDirectory),
              {
                method: 'PUT',
                headers: buildJsonHeaders(configDirectory),
                body: JSON.stringify({ enabled }),
              },
            ),
            get,
          );
        },

        setFileEnabled: async (id, enabled) => {
          return runPluginMutation(
            enabled ? 'Enabling plugin…' : 'Disabling plugin…',
            async (configDirectory) => runtimeFetch(
              buildPluginsUrl(`/api/config/plugins/file/${encodeURIComponent(id)}/enabled`, configDirectory),
              {
                method: 'PUT',
                headers: buildJsonHeaders(configDirectory),
                body: JSON.stringify({ enabled }),
              },
            ),
            get,
          );
        },

        bumpPolicyRevision: () => set((state) => ({ policyRevision: state.policyRevision + 1 })),

        deleteEntry: async (id) => {
          const entryToDelete = get().entries.find((plugin) => plugin.id === id);
          const result = await runPluginMutation('Deleting plugin entry…', async (configDirectory) => {
            const response = await runtimeFetch(buildPluginsUrl(`/api/config/plugins/entry/${encodeURIComponent(id)}`, configDirectory), {
              method: 'DELETE',
              headers: buildDirectoryHeaders(configDirectory),
            });
            return response;
          }, get);

          if (result.ok && get().selectedId === id) {
            set({ selectedId: null });
          }
          if (result.ok && entryToDelete) {
            const nextRegistryInfo = { ...get().registryInfo };
            delete nextRegistryInfo[entryToDelete.spec];
            set({ registryInfo: nextRegistryInfo });
          }
          return result;
        },

        readFile: async (id) => {
          try {
            const configDirectory = getPluginsConfigDirectory();
            const response = await runtimeFetch(buildPluginsUrl(`/api/config/plugins/file/${encodeURIComponent(id)}`, configDirectory), {
              headers: buildDirectoryHeaders(configDirectory),
            });
            if (!response.ok) {
              throw new Error('Failed to read plugin file');
            }
            return await readJson<PluginFileContent>(response);
          } catch (error) {
            console.error('[PluginsStore] Failed to read plugin file:', error);
            return null;
          }
        },

        createFile: async (input) => {
          return runPluginMutation('Creating plugin file…', async (configDirectory) => {
            const response = await runtimeFetch(buildPluginsUrl('/api/config/plugins/file', configDirectory), {
              method: 'POST',
              headers: buildJsonHeaders(configDirectory),
              body: JSON.stringify(input),
            });
            return response;
          }, get);
        },

        updateFile: async (id, input) => {
          return runPluginMutation('Updating plugin file…', async (configDirectory) => {
            const response = await runtimeFetch(buildPluginsUrl(`/api/config/plugins/file/${encodeURIComponent(id)}`, configDirectory), {
              method: 'PUT',
              headers: buildJsonHeaders(configDirectory),
              body: JSON.stringify(input),
            });
            return response;
          }, get);
        },

        deleteFile: async (id) => {
          const result = await runPluginMutation('Deleting plugin file…', async (configDirectory) => {
            const response = await runtimeFetch(buildPluginsUrl(`/api/config/plugins/file/${encodeURIComponent(id)}`, configDirectory), {
              method: 'DELETE',
              headers: buildDirectoryHeaders(configDirectory),
>>>>>>> bc50ba56a
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

<<<<<<< HEAD
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
=======
function buildEntryBody(input: { spec?: string; options?: Record<string, unknown>; scope?: PluginScope }): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.spec !== undefined) body.spec = input.spec;
  if (input.options !== undefined) body.options = input.options;
  if (input.scope !== undefined) body.scope = input.scope;
  return body;
}

async function runPluginMutation(
  progressMessage: string,
  request: (configDirectory: string | null) => Promise<Response>,
  get: () => PluginsStore,
): Promise<PluginMutationResult> {
  try {
    const configDirectory = getPluginsConfigDirectory();
    const response = await request(configDirectory);
    const payload = await readJson<PluginMutationPayload | null>(response).catch(() => null);

    if (!response.ok) {
      if (payload?.code === 'UNLOADABLE_SPEC') return { ok: false, invalidSpec: true };
      if (payload?.code === 'SWITCH_OVERRIDDEN') return { ok: false, switchOverridden: true };
      throw new Error(payload?.error || 'Failed to update plugin configuration');
    }

    invalidatePluginCache(configDirectory);

    if (payload?.requiresManualRestart) {
      await get().loadPlugins({ force: true });
      return {
        ok: true,
        requiresManualRestart: true,
        reloadFailed: payload?.reloadFailed === true,
        message: payload?.message,
        warning: payload?.warning,
      };
    }

    if (payload?.requiresReload) {
      startConfigUpdate(progressMessage);
      await refreshAfterOpenCodeRestart({
        message: payload.message,
        delayMs: payload.reloadDelayMs ?? CLIENT_RELOAD_DELAY_MS,
        scopes: ['all'],
>>>>>>> bc50ba56a
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
