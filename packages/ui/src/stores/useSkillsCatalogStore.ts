import { create } from 'zustand';
import type { SkillRepositorySource, SkillRepositoryItem, SkillRepositoryScanRequest, SkillRepositoryError, SkillRepositoryInstallRequest, SkillRepositoryInstallResult } from '@openchamber/agent-contract';
import { SkillRepositoryInstallFailureDetailsSchema } from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { invalidateSkillsLoadCache, useSkillsStore } from './useSkillsStore';
import { useProjectsStore } from './useProjectsStore';
import { useUIStore } from './useUIStore';
import { useDirectoryStore as useAppDirectoryStore } from './useDirectoryStore';
import { hostFilesystem } from '@/lib/host-filesystem';
import { emitConfigChange } from '@/lib/configSync';
import { getChatsRoot } from '@/lib/chatDirectories';

export type SkillsCatalogSource = SkillRepositorySource;
export type SkillsCatalogItem = SkillRepositoryItem;
type ScanResult = { ok: true; items: SkillRepositoryItem[] } | { ok: false; error: SkillRepositoryError };
type InstallInput = Omit<SkillRepositoryInstallRequest, 'expectedSourceRevision'>;
interface CatalogState {
  sources: SkillRepositorySource[];
  itemsBySource: { [sourceId: string]: SkillRepositoryItem[] };
  loadedSourceIds: { [sourceId: string]: boolean };
  selectedSourceId: string | null;
  isLoadingCatalog: boolean; isLoadingSource: boolean; isScanning: boolean; isInstalling: boolean;
  lastCatalogError: SkillRepositoryError | null; lastScanError: SkillRepositoryError | null; lastInstallError: SkillRepositoryError | null;
  scanResults: SkillRepositoryItem[] | null;
  setSelectedSource: (id: string | null) => void;
  loadCatalog: (options?: { refresh?: boolean }) => Promise<boolean>;
  loadSource: (sourceId: string, options?: { refresh?: boolean; signal?: AbortSignal }) => Promise<boolean>;
  scanRepo: (request: SkillRepositoryScanRequest) => Promise<ScanResult>;
  installSkills: (request: InstallInput, options?: { directory?: string | null }) => Promise<SkillRepositoryInstallResult>;
  resetForRuntimeSwitch: () => void;
}
<<<<<<< HEAD
const initial = { sources: [], itemsBySource: {}, loadedSourceIds: {}, selectedSourceId: null, isLoadingCatalog: false, isLoadingSource: false, isScanning: false, isInstalling: false, lastCatalogError: null, lastScanError: null, lastInstallError: null, scanResults: null };
const failure = (error: Error | string): SkillRepositoryError => ({ kind: error instanceof CanonicalApiError && error.problem.status === 401 ? 'authRequired' : 'unknown', message: error instanceof Error ? error.message : error });
const directory = (): string => {
  const settingsProjectPath = useUIStore.getState().settingsProjectPath?.trim();
  if (settingsProjectPath) return settingsProjectPath;
  const currentDirectory = useAppDirectoryStore.getState().currentDirectory?.trim();
  if (currentDirectory) return currentDirectory;
  const projectPath = useProjectsStore.getState().getActiveProject()?.path?.trim();
  if (projectPath) return projectPath;
  const chatsRoot = getChatsRoot()?.trim();
  if (chatsRoot) return chatsRoot;
  const homeDir = useAppDirectoryStore.getState().homeDirectory?.trim();
  if (homeDir) return homeDir;
  const anyProject = useProjectsStore.getState().projects?.[0]?.path?.trim();
  if (anyProject) return anyProject;
  const hostDir = hostFilesystem.getDirectory()?.trim();
  if (hostDir) return hostDir;
  return '~';
};
let generation = 0;
let selectedDirectory: string | null = null;
interface CatalogRequestScope { owner: number; directory: string }
export const useSkillsCatalogStore = create<CatalogState>((set, get) => {
  let catalogLoadedAt = 0;
  let catalogInFlight: Promise<boolean> | null = null;
  let catalogEpoch = 0;
  let catalogRequestRevision = 0;
  const sourceLoads = new Map<string, Promise<boolean>>();
  const capture = (override?: string | null): CatalogRequestScope => {
    const requested = override?.trim() || directory();
    if (selectedDirectory !== requested) {
      generation++; selectedDirectory = requested; catalogLoadedAt = 0; catalogInFlight = null; catalogEpoch++; sourceLoads.clear(); set(initial);
    }
    return { owner: generation, directory: requested };
  };
  return {
    ...initial,
    setSelectedSource: selectedSourceId => set({ selectedSourceId }),
    resetForRuntimeSwitch: () => { generation++; selectedDirectory = null; catalogLoadedAt = 0; catalogInFlight = null; catalogEpoch++; sourceLoads.clear(); set(initial); },
    loadCatalog: async options => {
      let scope: CatalogRequestScope;
      try { scope = capture(); } catch (error) { set({ lastCatalogError: failure(error instanceof Error ? error : String(error)) }); return false; }
      if (!options?.refresh && Date.now() - catalogLoadedAt < 5000) return true;
      if (catalogInFlight && !options?.refresh) return catalogInFlight;
      const requestRevision = ++catalogRequestRevision;
      const pending = (async () => {
        set({ isLoadingCatalog: true, lastCatalogError: null });
        try {
          const workspace = await canonicalClient.resolveWorkspace(scope.directory);
          if (scope.owner !== generation) return false;
          const result = await canonicalClient.skillRepositories.catalog(workspace.workspaceId);
          if (scope.owner !== generation || requestRevision !== catalogRequestRevision) return false;
          if (options?.refresh) { catalogEpoch++; sourceLoads.clear(); }
          set(state => ({
            sources: result.sources, selectedSourceId: result.sources.some(source => source.id === state.selectedSourceId) ? state.selectedSourceId : result.sources[0]?.id ?? null,
            ...(options?.refresh ? { itemsBySource: {}, loadedSourceIds: {}, isLoadingSource: false } : {})
          }));
          catalogLoadedAt = Date.now();
||||||| bc50ba56aa

export const useSkillsCatalogStore = create<SkillsCatalogState>()(
  devtools(
    (set, get) => ({
      // Empty until the server answers: it decides which catalogs exist, and a
      // machine policy can hide the built-in ones.
      sources: [],
      itemsBySource: {},
      selectedSourceId: null,
      loadedSourceIds: {},

      isLoadingCatalog: false,
      isLoadingSource: false,
      isScanning: false,
      isInstalling: false,

      lastCatalogError: null,
      lastScanError: null,
      lastInstallError: null,

      scanResults: null,

      setSelectedSource: (id) => set({ selectedSourceId: id }),

      loadCatalog: async (options) => {
        const currentDirectory = getRequestDirectory();
        const cacheKey = getSkillsCatalogCacheKey(currentDirectory);
        const now = Date.now();
        const loadedAt = skillsCatalogLastLoadedAt.get(cacheKey) ?? 0;
        // An empty list can be the answer, so freshness alone decides.
        const hasCachedCatalog = loadedAt > 0;
        if (!options?.refresh && hasCachedCatalog && now - loadedAt < SKILLS_CATALOG_LOAD_CACHE_TTL_MS) {
=======

export const useSkillsCatalogStore = create<SkillsCatalogState>()(
  devtools(
    (set, get) => ({
      sources: [],
      itemsBySource: {},
      selectedSourceId: null,
      loadedSourceIds: {},

      isLoadingCatalog: false,
      isLoadingSource: false,
      isScanning: false,
      isInstalling: false,

      lastCatalogError: null,
      lastScanError: null,
      lastInstallError: null,

      scanResults: null,

      setSelectedSource: (id) => set({ selectedSourceId: id }),

      loadCatalog: async (options) => {
        const currentDirectory = getRequestDirectory();
        const cacheKey = getSkillsCatalogCacheKey(currentDirectory);
        const now = Date.now();
        const loadedAt = skillsCatalogLastLoadedAt.get(cacheKey) ?? 0;
        const hasCachedCatalog = loadedAt > 0;
        if (!options?.refresh && hasCachedCatalog && now - loadedAt < SKILLS_CATALOG_LOAD_CACHE_TTL_MS) {
>>>>>>> upstream/main
          return true;
<<<<<<< HEAD
        } catch (error) { if (scope.owner === generation && requestRevision === catalogRequestRevision) set({ lastCatalogError: failure(error instanceof Error ? error : String(error)) }); return false; }
        finally { if (scope.owner === generation && requestRevision === catalogRequestRevision) set({ isLoadingCatalog: false }); }
      })();
      catalogInFlight = pending;
      try { return await pending; } finally { if (catalogInFlight === pending) catalogInFlight = null; }
    },
    loadSource: async (sourceId, options) => {
      let scope: CatalogRequestScope;
      try { scope = capture(); } catch (error) { set({ lastCatalogError: failure(error instanceof Error ? error : String(error)) }); return false; }
      const existing = sourceLoads.get(sourceId);
      if (existing && !options?.refresh) return existing;
      const epoch = catalogEpoch;
      let resolvePending!: (value: boolean) => void;
      const pending = new Promise<boolean>((resolve) => { resolvePending = resolve; });
      void (async () => {
||||||| bc50ba56aa
        }

        const inFlight = skillsCatalogLoadInFlight.get(cacheKey);
        if (!options?.refresh && inFlight) {
          return inFlight;
        }

        const request = (async () => {
          set({ isLoadingCatalog: true, lastCatalogError: null });

          const previous = {
            sources: get().sources,
            itemsBySource: get().itemsBySource,
            loadedSourceIds: get().loadedSourceIds,
          };

          let lastError: SkillsCatalogResponse['error'] | null = null;

          try {
            const refresh = options?.refresh ? '?refresh=true' : '';
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), 3000);

            try {
              const response = await runtimeFetch(`/api/config/skills/catalog${refresh}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller.signal,
              });

              const payload = (await response.json().catch(() => null)) as SkillsCatalogResponse | null;
              if (!response.ok || !payload?.ok) {
                lastError = payload?.error || { kind: 'unknown', message: `Failed to load catalog (${response.status})` };
                throw new Error(lastError.message);
              }

              // The server's list is the answer, empty included: a machine
              // policy can hide every built-in catalog.
              const sources = payload.sources ?? previous.sources;
              const itemsBySource = options?.refresh ? {} : (get().itemsBySource || {});
              const loadedSourceIds = options?.refresh ? {} : (get().loadedSourceIds || {});
              const currentSelected = get().selectedSourceId;
              const selectedSourceId =
                (currentSelected && sources.some((s) => s.id === currentSelected))
                  ? currentSelected
                  : (sources[0]?.id ?? null);

              set({
                sources,
                itemsBySource,
                loadedSourceIds,
                selectedSourceId,
              });

              skillsCatalogLastLoadedAt.set(cacheKey, Date.now());
              return true;
            } finally {
              window.clearTimeout(timeoutId);
            }
          } catch (error) {
            lastError = lastError || { kind: 'unknown', message: error instanceof Error ? error.message : String(error) };

            set({
              sources: previous.sources,
              itemsBySource: previous.itemsBySource,
              loadedSourceIds: previous.loadedSourceIds,
              lastCatalogError: lastError || { kind: 'unknown', message: 'Failed to load catalog' },
            });

            return false;
          } finally {
            set({ isLoadingCatalog: false });
          }
        })();

        skillsCatalogLoadInFlight.set(cacheKey, request);
        try {
          return await request;
        } finally {
          skillsCatalogLoadInFlight.delete(cacheKey);
        }
      },

      loadSource: async (sourceId, options) => {
        if (!sourceId) {
          return false;
        }

        // Deduplicate concurrent loads of the same source: the background
        // loader effect can restart while a request for this source is
        // already in flight.
        if (!options?.refresh) {
          const inFlight = sourceLoadInFlight.get(sourceId);
          if (inFlight) {
            return inFlight;
          }
        }

        activeSourceLoads += 1;
=======
        }

        const inFlight = skillsCatalogLoadInFlight.get(cacheKey);
        if (!options?.refresh && inFlight) {
          return inFlight;
        }

        const request = (async () => {
          set({ isLoadingCatalog: true, lastCatalogError: null });

          const previous = {
            sources: get().sources,
            itemsBySource: get().itemsBySource,
            loadedSourceIds: get().loadedSourceIds,
          };

          let lastError: SkillsCatalogResponse['error'] | null = null;

          try {
            const refresh = options?.refresh ? '?refresh=true' : '';
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), 3000);

            try {
              const response = await runtimeFetch(`/api/config/skills/catalog${refresh}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller.signal,
              });

              const payload = (await response.json().catch(() => null)) as SkillsCatalogResponse | null;
              if (!response.ok || !payload?.ok) {
                lastError = payload?.error || { kind: 'unknown', message: `Failed to load catalog (${response.status})` };
                throw new Error(lastError.message);
              }

              const sources = payload.sources ?? previous.sources;
              const itemsBySource = options?.refresh ? {} : (get().itemsBySource || {});
              const loadedSourceIds = options?.refresh ? {} : (get().loadedSourceIds || {});
              const currentSelected = get().selectedSourceId;
              const selectedSourceId =
                (currentSelected && sources.some((s) => s.id === currentSelected))
                  ? currentSelected
                  : (sources[0]?.id ?? null);

              set({
                sources,
                itemsBySource,
                loadedSourceIds,
                selectedSourceId,
              });

              skillsCatalogLastLoadedAt.set(cacheKey, Date.now());
              return true;
            } finally {
              window.clearTimeout(timeoutId);
            }
          } catch (error) {
            lastError = lastError || { kind: 'unknown', message: error instanceof Error ? error.message : String(error) };

            set({
              sources: previous.sources,
              itemsBySource: previous.itemsBySource,
              loadedSourceIds: previous.loadedSourceIds,
              lastCatalogError: lastError || { kind: 'unknown', message: 'Failed to load catalog' },
            });

            return false;
          } finally {
            set({ isLoadingCatalog: false });
          }
        })();

        skillsCatalogLoadInFlight.set(cacheKey, request);
        try {
          return await request;
        } finally {
          skillsCatalogLoadInFlight.delete(cacheKey);
        }
      },

      loadSource: async (sourceId, options) => {
        if (!sourceId) {
          return false;
        }

        if (!options?.refresh) {
          const inFlight = sourceLoadInFlight.get(sourceId);
          if (inFlight) {
            return inFlight;
          }
        }

        activeSourceLoads += 1;
>>>>>>> upstream/main
        set({ isLoadingSource: true, lastCatalogError: null });
        try {
          const workspace = await canonicalClient.resolveWorkspace(scope.directory, { signal: options?.signal });
          if (scope.owner !== generation || epoch !== catalogEpoch || sourceLoads.get(sourceId) !== pending) { resolvePending(false); return; }
          const result = await canonicalClient.skillRepositories.source(workspace.workspaceId, { sourceId, refresh: options?.refresh }, { signal: options?.signal });
          if (scope.owner !== generation || epoch !== catalogEpoch || sourceLoads.get(sourceId) !== pending) { resolvePending(false); return; }
          set(state => ({ itemsBySource: { ...state.itemsBySource, [sourceId]: result.items }, loadedSourceIds: { ...state.loadedSourceIds, [sourceId]: true } }));
          resolvePending(true);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') { resolvePending(false); return; }
          if (scope.owner === generation && epoch === catalogEpoch && sourceLoads.get(sourceId) === pending) set({ lastCatalogError: failure(error instanceof Error ? error : String(error)) });
          resolvePending(false);
        }
      })();
      sourceLoads.set(sourceId, pending);
      try { return await pending; } finally {
        if (sourceLoads.get(sourceId) === pending) sourceLoads.delete(sourceId);
        if (scope.owner === generation && epoch === catalogEpoch) set({ isLoadingSource: sourceLoads.size > 0 });
      }
    },
    scanRepo: async request => {
      let owner = generation;
      try {
        const scope = capture(); owner = scope.owner;
        set({ isScanning: true, lastScanError: null, scanResults: null });
        const workspace = await canonicalClient.resolveWorkspace(scope.directory);
        if (owner !== generation) throw new Error('Workspace selection changed');
        const result = await canonicalClient.skillRepositories.scan(workspace.workspaceId, request);
        if (owner !== generation) throw new Error('Workspace selection changed');
        set({ scanResults: result.items });
        return { ok: true, items: result.items };
      } catch (error) { const problem = failure(error instanceof Error ? error : String(error)); if (owner === generation) set({ lastScanError: problem }); return { ok: false, error: problem }; }
      finally { if (owner === generation) set({ isScanning: false }); }
    },
    installSkills: async (request, options) => {
      let owner = generation;
      try {
        const scope = capture(options?.directory); owner = scope.owner;
        set({ isInstalling: true, lastInstallError: null });
        const workspace = await canonicalClient.resolveWorkspace(scope.directory);
        if (owner !== generation) throw new Error('Workspace selection changed');
        const files = await canonicalClient.fileResources.getSkillFileCatalog(workspace.workspaceId);
        if (owner !== generation) throw new Error('Workspace selection changed');
        let result: SkillRepositoryInstallResult;
        try {
          result = await canonicalClient.skillRepositories.install(workspace.workspaceId, { ...request, expectedSourceRevision: files.sources[request.scope] });
        } catch (error) {
          if (!(error instanceof CanonicalApiError) || error.problem.code !== 'SKILL_APPLY_FAILED') throw error;
          const committed = SkillRepositoryInstallFailureDetailsSchema.parse(error.problem.details);
          if (committed.repository.workspaceId !== workspace.workspaceId || committed.result.scope.kind !== request.scope) throw error;
          result = committed.repository;
        }
        if (owner !== generation) throw new Error('Workspace selection changed');
        if (!result.ok) { set({ lastInstallError: result.error }); return result; }
        catalogEpoch++; sourceLoads.clear(); catalogLoadedAt = 0; catalogInFlight = null; catalogRequestRevision++;
        invalidateSkillsLoadCache(scope.directory);
        await useSkillsStore.getState().loadSkills(scope.directory);
        if (owner !== generation) return result;
        emitConfigChange('skills', { source: 'useSkillsCatalogStore' });
        await get().loadCatalog({ refresh: true });
        return result;
      } catch (error) { const problem = failure(error instanceof Error ? error : String(error)); if (owner === generation) set({ lastInstallError: problem }); return { ok: false, error: problem }; }
      finally { if (owner === generation) set({ isInstalling: false }); }
    },
  };
});
