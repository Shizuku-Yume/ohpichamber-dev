import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { Agent, AgentCatalog, AgentMutationResult as NativeAgentMutationResult } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { emitConfigChange, scopeMatches, subscribeToConfigChanges } from "@/lib/configSync";
import { createDeferredSafeJSONStorage } from "./utils/safeStorage";
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useProjectsStore } from "@/stores/useProjectsStore";
import { compareCounters } from '@/sync/event-reducer';
import { getRuntimeKey } from "@/lib/runtime-switch";
import { waitForAgentServiceConnection } from "./waitForAgentServiceConnection";
import { isRetryableBootstrapError } from "@/sync/retry";
import { readAgentSelection, registerAgentReadinessListener, type AgentReadinessState } from "./agentConfigBridge";

/**
 * Directory a call operates on. Settings can browse another project without
 * moving the app, so every entry point takes one; omitting it means the project
 * the app is currently on.
 */
const resolveDirectory = (directory?: string | null): string | null => {
  if (directory !== undefined) {
    const trimmed = directory?.trim();
    return trimmed ? trimmed : null;
  }
  return getConfigDirectory();
};

const getConfigDirectory = (): string | null => {
  try {
    const projectsStore = useProjectsStore.getState();
    const activeProject = projectsStore.getActiveProject?.();
    
    // 1. Primary: Active project path from store
    if (activeProject?.path?.trim()) {
      return activeProject.path.trim();
    }

    // 2. Fallback: current OpenCode directory (session / runtime)
    const clientDir = hostFilesystem.getDirectory();
    if (clientDir?.trim()) {
      return clientDir.trim();
    }
  } catch (err) {
    console.warn('[AgentsStore] Error resolving config directory:', err);
  }

  return null;
};

const AGENTS_LOAD_CACHE_TTL_MS = 5000;
const DEFAULT_AGENTS_CACHE_KEY = '__default__';
const AGENT_RECOVERY_ATTEMPTS = 3;
const AGENT_RECOVERY_BACKOFF_MS = [250, 500] as const;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getAgentRecoveryKey = (directory: string): string => `${getRuntimeKey()}\0${getAgentsCacheKey(directory)}`;
const agentRecoveryInFlight = new Map<string, Promise<void>>();
const agentRecoverySettled = new Set<string>();
const agentsLastLoadedAt = new Map<string, number>();
// Each invalidation starts a new load generation. A read that began before the
// latest invalidation (a delete, a catalog event) may carry the list from
// before that change, so later callers never join it: they wait for it to
// settle and read again, and the newest generation's result is the one kept.
const agentsLoadGeneration = new Map<string, number>();
const agentsLoadInFlight = new Map<string, { generation: number; request: Promise<boolean> }>();
let agentsGeneration = 0;

const getAgentsCacheKey = (directory: string | null): string => {
  return directory?.trim() || DEFAULT_AGENTS_CACHE_KEY;
};

export const invalidateAgentsLoadCache = (directory: string | null = getConfigDirectory()) => {
  const cacheKey = getAgentsCacheKey(directory);
  agentsLastLoadedAt.delete(cacheKey);
  agentsLoadGeneration.set(cacheKey, (agentsLoadGeneration.get(cacheKey) ?? 0) + 1);
  // Retire reads started before a catalog mutation or notification.
};

interface AgentMutationResult { ok: boolean; error?: string; revision?: string }
interface AgentsStore {
  selectedAgentName: string | null;
  agents: Agent[];
  agentsByDirectory: Record<string, Agent[]>;
  revisionsByDirectory: Record<string, string>;
  errorsByDirectory: Record<string, string>;
  isLoading: boolean;
  agentDraft: Agent | null;
  setSelectedAgent: (name: string | null) => void;
  setAgentDraft: (draft: Agent | null) => void;
  loadAgents: (directory?: string | null) => Promise<boolean>;
  /** Retries one errored directory after the Agent Service reports ready. */
  retryAgentsWhenReady: (directory?: string | null) => Promise<void>;
  resetForRuntimeSwitch: () => void;
  createAgent: (agent: Agent, directory?: string | null) => Promise<AgentMutationResult>;
  updateAgent: (agent: Agent, directory?: string | null, expectedRevision?: string) => Promise<AgentMutationResult>;
  deleteAgent: (agentId: string, directory?: string | null, expectedRevision?: string) => Promise<AgentMutationResult>;
  getAgentByName: (name: string, directory?: string | null) => Agent | undefined;
}
declare global {
  interface Window { __zustand_agents_store__?: UseBoundStore<StoreApi<AgentsStore>> }
}
const EMPTY_AGENTS: Agent[] = [];
const CONFIG_EVENT_SOURCE = 'useAgentsStore';
export const selectAgentsForDirectory = (state: Pick<AgentsStore, 'agentsByDirectory'>, directory?: string | null): Agent[] =>
  state.agentsByDirectory[getAgentsCacheKey(resolveDirectory(directory))] ?? EMPTY_AGENTS;

type AgentCatalogStatus = 'loading' | 'ready' | 'error';
export const selectAgentCatalogStatus = (
  state: Pick<AgentsStore, 'revisionsByDirectory' | 'errorsByDirectory'>,
  directory?: string | null,
): AgentCatalogStatus => {
  const key = getAgentsCacheKey(resolveDirectory(directory));
  if (state.errorsByDirectory[key]) return 'error';
  return state.revisionsByDirectory[key] === undefined ? 'loading' : 'ready';
};

<<<<<<< HEAD
export const useAgentsStore: UseBoundStore<StoreApi<AgentsStore>> = create<AgentsStore>()(devtools(persist((set, get) => {
  const fail = (key: string, error: unknown): AgentMutationResult => {
    const message = error instanceof Error ? error.message : String(error);
    set((state) => ({ errorsByDirectory: { ...state.errorsByDirectory, [key]: message } }));
    return { ok: false, error: message };
  };
  const publishCatalog = (directory: string, catalog: AgentCatalog) => {
    const key = getAgentsCacheKey(directory);
    agentRecoverySettled.delete(getAgentRecoveryKey(directory));
    set((state) => {
      const previous = state.revisionsByDirectory[key];
      if (previous !== undefined && compareCounters(catalog.revision, previous) < 0) return state;
      return {
        agentsByDirectory: { ...state.agentsByDirectory, [key]: catalog.agents },
        revisionsByDirectory: { ...state.revisionsByDirectory, [key]: catalog.revision },
        errorsByDirectory: { ...state.errorsByDirectory, [key]: '' },
        ...(directory === getConfigDirectory() ? { agents: catalog.agents } : {}),
      };
    });
    const config = readAgentSelection();
    // The reader is absent only before the config store has registered; the
    // published catalog is still valid.
    if (!config) return;
    if (config.activeDirectoryKey === directory
        && !useSessionUIStore.getState().currentSessionId
        && config.selectionSource === 'auto' && config.agentSelectionSource === 'auto'
        && config.currentVariantSelection.override === undefined) {
      config.applyDefaultModelAgentSelection();
    }
  };
  const mutate = async (
    directory: string | null | undefined,
    expectedRevision: string | undefined,
    operation: (workspaceId: string, revision: string) => Promise<NativeAgentMutationResult>,
  ): Promise<AgentMutationResult> => {
    const resolved = resolveDirectory(directory);
    const key = getAgentsCacheKey(resolved);
    const generation = agentsGeneration;
    const runtimeKey = getRuntimeKey();
    const isCurrent = () => generation === agentsGeneration && runtimeKey === getRuntimeKey();
    try {
      if (!resolved) throw new Error('Workspace directory is unavailable');
      let revision = expectedRevision ?? get().revisionsByDirectory[key];
      if (revision === undefined) {
        if (!await get().loadAgents(resolved)) throw new Error(get().errorsByDirectory[key] || 'Agent catalog is unavailable');
        revision = get().revisionsByDirectory[key];
      }
      if (revision === undefined || !isCurrent()) throw new Error('Agent catalog is unavailable');
      const workspace = await canonicalClient.resolveWorkspace(resolved);
      if (!isCurrent()) return { ok: false };
      const result = await operation(workspace.workspaceId, revision);
      if (!isCurrent()) return { ok: false };
      invalidateAgentsLoadCache(resolved);
      const agents = selectAgentsForDirectory(get(), resolved);
      const previous = agents.find((agent) => agent.agentId === result.agentId);
      const updated = result.agent;
      const nextAgents = updated
        ? previous ? agents.map((agent) => agent.agentId === result.agentId ? updated : agent) : [...agents, updated]
        : agents.filter((agent) => agent.agentId !== result.agentId);
      publishCatalog(resolved, { workspaceId: workspace.workspaceId, revision: result.revision, agents: nextAgents });
      if (previous && get().selectedAgentName === previous.name && resolved === getConfigDirectory()) {
        set({ selectedAgentName: updated?.name ?? null });
      }
      emitConfigChange('agents', { source: CONFIG_EVENT_SOURCE });
      return { ok: true, revision: result.revision };
    } catch (error) {
      return isCurrent() ? fail(key, error) : { ok: false };
    }
  };
  return {
    selectedAgentName: null,
    agents: [], agentsByDirectory: {}, revisionsByDirectory: {}, errorsByDirectory: {},
    isLoading: false, agentDraft: null,
    setSelectedAgent: (selectedAgentName) => set({ selectedAgentName }),
    setAgentDraft: (agentDraft) => set({ agentDraft }),
    resetForRuntimeSwitch: () => {
      agentsGeneration += 1;
      agentsLastLoadedAt.clear(); agentsLoadInFlight.clear(); agentsLoadGeneration.clear();
      agentRecoveryInFlight.clear(); agentRecoverySettled.clear();
      set({ agents: [], agentsByDirectory: {}, revisionsByDirectory: {}, errorsByDirectory: {}, agentDraft: null, isLoading: false });
=======
export const useAgentsStore = create<AgentsStore>()(
  devtools(
    persist(
      (set, get) => ({

        selectedAgentName: null,
        agents: [],
        agentsByDirectory: {},
        disabledAgentsByDirectory: {},
        isLoading: false,
        agentDraft: null,

        loadDisabledAgents: async (requestedDirectory?: string | null) => {
          const configDirectory = resolveDirectory(requestedDirectory);
          const query = configDirectory ? `?directory=${encodeURIComponent(configDirectory)}` : '';
          try {
            const response = await runtimeFetch(`/api/config/disabled-agents${query}`, {
              headers: {
                'Cache-Control': 'no-cache',
                ...(configDirectory ? { 'x-opencode-directory': configDirectory } : {}),
              },
            });
            if (!response.ok) return false;
            const parsed = DisabledAgentsResponseSchema.safeParse(await response.json().catch(() => null));
            if (!parsed.success) return false;
            const cacheKey = getAgentsCacheKey(configDirectory);
            set((state) => ({ disabledAgentsByDirectory: { ...state.disabledAgentsByDirectory, [cacheKey]: parsed.data.agents } }));
            return true;
          } catch (error) {
            console.warn('[AgentsStore] Failed to read disabled agents:', error);
            return false;
          }
        },

        setSelectedAgent: (name: string | null) => {
          set({ selectedAgentName: name });
        },

        setAgentDraft: (draft: AgentDraft | null) => {
          set({ agentDraft: draft });
        },

        resetForRuntimeSwitch: () => {
          agentsGeneration += 1;
          agentsLastLoadedAt.clear();
          agentsLoadInFlight.clear();
          agentsLoadGeneration.clear();
          opencodeClient.clearAgentListRequests();
          set({ agents: [], agentsByDirectory: {}, isLoading: false });
        },

        loadAgents: async (requestedDirectory?: string | null) => {
          const configDirectory = resolveDirectory(requestedDirectory);
          const cacheKey = getAgentsCacheKey(configDirectory);
          const isAmbient = cacheKey === getAgentsCacheKey(getConfigDirectory());
          const now = Date.now();
          const loadedAt = agentsLastLoadedAt.get(cacheKey) ?? 0;
          const hasCachedAgents = (get().agentsByDirectory[cacheKey] ?? (isAmbient ? get().agents : [])).length > 0;

          if (hasCachedAgents && now - loadedAt < AGENTS_LOAD_CACHE_TTL_MS) {
            return true;
          }

          const runtimeGeneration = agentsGeneration;
          const runtimeKey = getRuntimeKey();
          // A catalog event may retire the read a create/delete is waiting for.
          // That caller still needs the current list, not a failed mutation toast.
          const wasRetired = (loadGeneration: number) => (
            agentsGeneration === runtimeGeneration
            && getRuntimeKey() === runtimeKey
            && (agentsLoadGeneration.get(cacheKey) ?? 0) !== loadGeneration
          );

          let inFlight = agentsLoadInFlight.get(cacheKey);
          while (inFlight) {
            if (inFlight.generation === (agentsLoadGeneration.get(cacheKey) ?? 0)) {
              const joined = inFlight;
              const loaded = await joined.request;
              return wasRetired(joined.generation) ? get().loadAgents(configDirectory) : loaded;
            }
            // Started before the latest invalidation: let it settle so it cannot
            // commit after this read, then read again.
            await inFlight.request;
            inFlight = agentsLoadInFlight.get(cacheKey);
          }

          const generation = agentsLoadGeneration.get(cacheKey) ?? 0;
          const isCurrentLoad = () => (
            agentsGeneration === runtimeGeneration
            && (agentsLoadGeneration.get(cacheKey) ?? 0) === generation
            && getRuntimeKey() === runtimeKey
          );
          const request = (async () => {
            set({ isLoading: true });
            // Failure must never look like an empty project. The mirror is the
            // fallback so a directory loaded before this map existed still counts.
            const previousAgents = get().agentsByDirectory[cacheKey] ?? (isAmbient ? get().agents : []);
            const previousSignature = buildAgentsSignature(previousAgents);

            for (let attempt = 0; attempt < 3; attempt++) {
              if (!isCurrentLoad()) return false;
              try {
                const queryParams = configDirectory ? `?directory=${encodeURIComponent(configDirectory)}` : '';

                // Ensure we list agents using the correct project context. Pass the
                // directory directly so this shares the in-flight request with the config
                // store instead of issuing a duplicate agents fetch at startup.
                const agents = await opencodeClient.listAgents(configDirectory);
                if (!isCurrentLoad()) return false;

                const agentsWithScope = await Promise.all(
                  agents.map(async (agent) => {
                    try {
                      // Force no-cache to ensure we get the latest scope info
                      const response = await runtimeFetch(`/api/config/agents/${encodeURIComponent(agent.name)}${queryParams}`, {
                        headers: {
                          'Cache-Control': 'no-cache',
                          ...(configDirectory ? { 'x-opencode-directory': configDirectory } : {}),
                        }
                      });

                      if (response.ok) {
                        const data = await response.json();

                        // Prioritize explicit scope from server response
                        let scope = data.scope;

                        // Fallback to deducing from sources if top-level scope is missing
                        if (!scope && data.sources) {
                          const sources = data.sources;
                          scope = (sources.md?.exists ? sources.md.scope : undefined)
                            ?? (sources.json?.exists ? sources.json.scope : undefined)
                            ?? sources.md?.scope
                            ?? sources.json?.scope;
                        }

                        // Parse subfolder group from file path
                        const mdPath: string | null | undefined = data.sources?.md?.path;
                        const group = parseAgentGroup(mdPath);

                        const activeSource = data.sources?.md?.exists
                          ? data.sources.md
                          : (data.sources?.json?.exists ? data.sources.json : null);
                        const legacy = activeSource?.legacy === true;
                        const sourcePath: string | null = activeSource?.path ?? null;
                        // v2's resolved AgentInfo carries no built-in flag; the
                        // config-entity route derives it from the sources.
                        const native = data.isBuiltIn === true;

                        if (scope === 'project' || scope === 'user') {
                          return { ...agent, scope: scope as AgentScope, group, legacy, path: sourcePath, native };
                        }

                        // Explicitly set null scope if not found, to clear stale state
                        return { ...agent, scope: undefined, group, legacy, path: sourcePath, native };
                      }
                    } catch (err) {
                      console.warn(`[AgentsStore] Failed to fetch config for agent ${agent.name}:`, err);
                    }
                    return agent;
                  })
                );

                // Invalidation retires requests formed before the catalog
                // change. Their lists and TTLs must not replace the fresh load.
                if (!isCurrentLoad()) return false;
                const nextSignature = buildAgentsSignature(agentsWithScope);
                if (previousSignature !== nextSignature) {
                  set((state) => {
                    const next: Partial<AgentsStore> = {
                      agentsByDirectory: { ...state.agentsByDirectory, [cacheKey]: agentsWithScope },
                      isLoading: false,
                    };
                    if (isAmbient) next.agents = agentsWithScope;
                    return next;
                  });
                } else {
                  set({ isLoading: false });
                }
                // A stale generation's read must not count as fresh for the TTL.
                if (generation === (agentsLoadGeneration.get(cacheKey) ?? 0)) {
                  agentsLastLoadedAt.set(cacheKey, Date.now());
                }
                return true;
              } catch {
                if (!isCurrentLoad()) return false;
                // ignore error
              }
            }

            if (isCurrentLoad()) {
              set({ isLoading: false });
            }
            return false;
          })();

          const entry = { generation, request };
          agentsLoadInFlight.set(cacheKey, entry);
          let loaded: boolean;
          try {
            loaded = await request;
          } finally {
            if (agentsLoadInFlight.get(cacheKey) === entry) agentsLoadInFlight.delete(cacheKey);
          }
          return wasRetired(generation) ? get().loadAgents(configDirectory) : loaded;
        },

        fetchAgentEntity: async (name: string, requestedDirectory?: string | null) => {
          const envelope = await fetchAgentResource<AgentEntityEnvelope>(name, 'config', requestedDirectory);
          if (!envelope) return null;
          return { ...envelope, config: envelope.config ?? {} };
        },

        fetchAgentPermissions: async (name: string, requestedDirectory?: string | null) => {
          const envelope = await fetchAgentResource<AgentPermissionsEnvelope>(name, 'permissions', requestedDirectory);
          if (!envelope) return null;
          return {
            ...envelope,
            global: envelope.global ?? [],
            agent: envelope.agent ?? [],
            effective: envelope.effective ?? [],
          };
        },

        createAgent: async (config: AgentConfig, requestedDirectory?: string | null) => {
          try {
            console.log('[AgentsStore] Creating agent:', config.name);

            const agentConfig: Record<string, unknown> = {
              mode: config.mode || 'subagent',
            };

            if (config.description) agentConfig.description = config.description;
            if (config.model) agentConfig.model = config.model;
            if (hasValue(config.steps)) agentConfig.steps = config.steps;
            if (config.system) agentConfig.system = config.system;
            if (config.color) agentConfig.color = config.color;
            if (config.hidden !== undefined) agentConfig.hidden = config.hidden;
            if (config.request) agentConfig.request = config.request;
            if (config.permissions?.length) agentConfig.permissions = config.permissions;
            if (config.scope) agentConfig.scope = config.scope;

            console.log('[AgentsStore] Agent config to save:', agentConfig);

            const configDirectory = resolveDirectory(requestedDirectory);
            const queryParams = configDirectory ? `?directory=${encodeURIComponent(configDirectory)}` : '';

            const response = await runtimeFetch(`/api/config/agents/${encodeURIComponent(config.name)}${queryParams}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(configDirectory ? { 'x-opencode-directory': configDirectory } : {}),
              },
              body: JSON.stringify(agentConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to create agent';
              throw new Error(message);
            }

            invalidateAgentsLoadCache(configDirectory);

            if (payload?.requiresManualRestart) {
              upsertOptimisticAgentLocal(set, get, config.name, config);
              return { ok: true, requiresManualRestart: true };
            }

            // OpenCode 2 re-reads the file itself; the store just refreshes its list.
            const loaded = await get().loadAgents(configDirectory);
            if (loaded) {
              emitConfigChange("agents", { source: CONFIG_EVENT_SOURCE });
            }
            return { ok: loaded };
          } catch (error) {
            console.error('Failed to create agent:', error);
            return { ok: false };
          }
        },

        updateAgent: async (name: string, config: Partial<AgentConfig>, requestedDirectory?: string | null) => {
          try {
            const agentConfig: Record<string, unknown> = {};

            if (config.mode !== undefined) agentConfig.mode = config.mode;
            if (config.description !== undefined) agentConfig.description = config.description;
            if (config.model !== undefined) agentConfig.model = config.model;
            if ('steps' in config) agentConfig.steps = config.steps ?? null;
            if (config.system !== undefined) agentConfig.system = config.system;
            if ('color' in config) agentConfig.color = config.color ?? null;
            if (config.hidden !== undefined) agentConfig.hidden = config.hidden;
            if ('disabled' in config) agentConfig.disabled = config.disabled ? true : null;
            // `request` is replaced wholesale, so a caller must send the full
            // block it wants persisted, not just the field it changed.
            if (config.request !== undefined) agentConfig.request = config.request;
            if (config.permissions !== undefined) agentConfig.permissions = config.permissions ?? [];

            const configDirectory = resolveDirectory(requestedDirectory);
            const queryParams = configDirectory ? `?directory=${encodeURIComponent(configDirectory)}` : '';

            const response = await runtimeFetch(`/api/config/agents/${encodeURIComponent(name)}${queryParams}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(configDirectory ? { 'x-opencode-directory': configDirectory } : {}),
              },
              body: JSON.stringify(agentConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to update agent';
              throw new Error(message);
            }

            invalidateAgentsLoadCache(configDirectory);

            if (payload?.requiresManualRestart) {
              upsertOptimisticAgentLocal(set, get, name, config);
              return { ok: true, requiresManualRestart: true };
            }

            // OpenCode 2 re-reads the file itself; the store just refreshes its list.
            const [loaded] = await Promise.all([
              get().loadAgents(configDirectory),
              'disabled' in config ? get().loadDisabledAgents(configDirectory) : Promise.resolve(true),
            ]);
            if (loaded) {
              emitConfigChange("agents", { source: CONFIG_EVENT_SOURCE });
            }
            return { ok: loaded };
          } catch (error) {
            console.error('Failed to update agent:', error);
            throw error;
          }
        },

        deleteAgent: async (name: string, scope?: AgentScope, requestedDirectory?: string | null) => {
          try {
            const configDirectory = resolveDirectory(requestedDirectory);
            const queryParams = configDirectory ? `?directory=${encodeURIComponent(configDirectory)}` : '';

            const response = await runtimeFetch(`/api/config/agents/${encodeURIComponent(name)}${queryParams}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                ...(configDirectory ? { 'x-opencode-directory': configDirectory } : {}),
              },
              body: JSON.stringify({ scope }),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to delete agent';
              throw new Error(message);
            }

            invalidateAgentsLoadCache(configDirectory);

            if (get().selectedAgentName === name) {
              set({ selectedAgentName: null });
            }

            const removeLocal = () => {
              set({ agents: get().agents.filter((agent) => agent.name !== name) });
            };

            if (payload?.requiresManualRestart) {
              removeLocal();
              return { ok: true, requiresManualRestart: true };
            }

            // OpenCode 2 re-reads the file itself and then announces
            // `agent.updated`, which re-reads this list again (catalogRefresh).
            // This read can land before that and still carry the deleted agent.
            const loaded = await get().loadAgents(configDirectory);
            if (loaded) {
              emitConfigChange("agents", { source: CONFIG_EVENT_SOURCE });
            }
            return { ok: loaded };
          } catch (error) {
            console.error('Failed to delete agent:', error);
            throw error;
          }
        },


        getAgentByName: (name: string, requestedDirectory?: string | null) => {
          return selectAgentsForDirectory(get(), requestedDirectory).find((agent) => agent.name === name);
        },

        getVisibleAgents: (requestedDirectory?: string | null) => {
          return filterVisibleAgents(selectAgentsForDirectory(get(), requestedDirectory));
        },
      }),
      {
        name: "agents-store",
        storage: createDeferredSafeJSONStorage(),
        partialize: (state) => ({
          selectedAgentName: state.selectedAgentName,
        }),
      },
    ),
    {
      name: "agents-store",
>>>>>>> bc50ba56a
    },
    loadAgents: async (requestedDirectory) => {
      const directory = resolveDirectory(requestedDirectory);
      const key = getAgentsCacheKey(directory);
      const runtimeGeneration = agentsGeneration;
      const runtimeKey = getRuntimeKey();
      const currentRuntime = () => runtimeGeneration === agentsGeneration && runtimeKey === getRuntimeKey();
      if (!get().errorsByDirectory[key] && get().revisionsByDirectory[key] !== undefined && Date.now() - (agentsLastLoadedAt.get(key) ?? 0) < AGENTS_LOAD_CACHE_TTL_MS) return true;
      const inFlight = agentsLoadInFlight.get(key);
      if (inFlight) {
        const loaded = await inFlight.request;
        if (!currentRuntime()) return false;
        return inFlight.generation === (agentsLoadGeneration.get(key) ?? 0) ? loaded : get().loadAgents(directory);
      }
      const generation = agentsLoadGeneration.get(key) ?? 0;
      const current = () => currentRuntime() && generation === (agentsLoadGeneration.get(key) ?? 0);
      const request = (async () => {
        set({ isLoading: true });
        try {
          if (!directory) throw new Error('Workspace directory is unavailable');
          const workspace = await canonicalClient.resolveWorkspace(directory);
          const catalog = await canonicalClient.getAgents(workspace.workspaceId);
          if (!current()) return false;
          publishCatalog(directory, catalog);
          agentsLastLoadedAt.set(key, Date.now());
          return true;
        } catch (error) {
          if (current()) {
            fail(key, error);
            if (directory) agentRecoverySettled.delete(getAgentRecoveryKey(directory));
            // Only the current config scope gets automatic recovery; a
            // session-pinned directory keeps its normal caller-driven load.
            if (directory && isRetryableBootstrapError(error) && resolveDirectory() === directory) {
              setTimeout(() => { void useAgentsStore.getState().retryAgentsWhenReady(directory); }, 0);
            }
          }
          return false;
        } finally {
          if (currentRuntime()) set({ isLoading: false });
        }
      })();
      const entry = { generation, request };
      agentsLoadInFlight.set(key, entry);
      let loaded: boolean;
      try { loaded = await request; }
      finally { if (agentsLoadInFlight.get(key) === entry) agentsLoadInFlight.delete(key); }
      if (!currentRuntime()) return false;
      return current() ? loaded : get().loadAgents(directory);
    },
    retryAgentsWhenReady: async (requestedDirectory) => {
      const directory = resolveDirectory(requestedDirectory);
      if (!directory) return;
      const key = getAgentsCacheKey(directory);
      if (!get().errorsByDirectory[key]) return;
      const recoveryKey = getAgentRecoveryKey(directory);
      if (agentRecoverySettled.has(recoveryKey)) return;
      const existing = agentRecoveryInFlight.get(recoveryKey);
      if (existing) return existing;

      const generation = agentsGeneration;
      const runtimeKey = getRuntimeKey();
      const isCurrent = () => generation === agentsGeneration && runtimeKey === getRuntimeKey()
        && resolveDirectory() === directory;
      const promise = (async () => {
        if (!isCurrent()) return;
        let ready: boolean;
        try {
          ready = await waitForAgentServiceConnection(undefined, { isCurrent });
        } catch {
          return;
        }
        if (!ready || !isCurrent()) return;
        for (let attempt = 0; attempt < AGENT_RECOVERY_ATTEMPTS; attempt += 1) {
          if (!isCurrent()) return;
          if (!get().errorsByDirectory[key]) return;
          if (await get().loadAgents(directory)) return;
          if (attempt + 1 < AGENT_RECOVERY_ATTEMPTS) {
            await sleep(AGENT_RECOVERY_BACKOFF_MS[Math.min(attempt, AGENT_RECOVERY_BACKOFF_MS.length - 1)]);
          }
        }
        if (isCurrent() && get().errorsByDirectory[key]) agentRecoverySettled.add(recoveryKey);
      })().finally(() => {
        if (agentRecoveryInFlight.get(recoveryKey) === promise) agentRecoveryInFlight.delete(recoveryKey);
      });
      agentRecoveryInFlight.set(recoveryKey, promise);
      return promise;
    },
    createAgent: (agent, directory) => mutate(directory, undefined, (workspaceId, expectedRevision) => canonicalClient.createAgent(workspaceId, { expectedRevision, agent })),
    updateAgent: (agent, directory, revision) => mutate(directory, revision, (workspaceId, expectedRevision) => canonicalClient.updateAgent(workspaceId, { expectedRevision, agent })),
    deleteAgent: (agentId, directory, revision) => mutate(directory, revision, (workspaceId, expectedRevision) => canonicalClient.deleteAgent(workspaceId, { expectedRevision, agentId })),
    getAgentByName: (name, directory) => selectAgentsForDirectory(get(), directory).find((agent) => agent.name === name),
  };
}, {
  name: 'agents-store', storage: createDeferredSafeJSONStorage(),
  partialize: (state) => ({ selectedAgentName: state.selectedAgentName }),
}), { name: 'agents-store' }));

if (typeof window !== "undefined") {
  window.__zustand_agents_store__ = useAgentsStore;
}

<<<<<<< HEAD
=======
type ConfigRefreshMode = "active" | "projects";

const normalizeRefreshScopes = (scopes?: ConfigChangeScope[]): ConfigChangeScope[] => {
  if (!scopes || scopes.length === 0) {
    return ["all"];
  }

  const unique = Array.from(new Set(scopes));
  if (unique.includes("all")) {
    return ["all"];
  }

  return unique;
};

async function performConfigRefresh(options: {
  message?: string;
  delayMs?: number;
  scopes?: ConfigChangeScope[];
  mode?: ConfigRefreshMode;
} = {}) {
  const { message, delayMs } = options;
  const scopes = normalizeRefreshScopes(options.scopes);
  const mode: ConfigRefreshMode = options.mode ?? (scopes.includes("all") ? "projects" : "active");

  try {
    updateConfigUpdateMessage(message || "Refreshing configuration…");
  } catch {
    // ignore
  }

  try {
    await waitForOpenCodeConnection(delayMs);

    const configStore = useConfigStore.getState();
    const agentConfigStore = useAgentsStore.getState();
    const commandsStore = useCommandsStore.getState();
    const skillsStore = useSkillsStore.getState();
    const skillsCatalogStore = useSkillsCatalogStore.getState();

    const refreshProviders = scopes.includes("all") || scopes.includes("providers");
    const refreshSdkAgents = scopes.includes("all") || scopes.includes("agents");
    const refreshAgentConfigs = scopes.includes("all") || scopes.includes("agents");
    const refreshCommands = scopes.includes("all") || scopes.includes("commands");
    const refreshSkills = scopes.includes("all") || scopes.includes("skills");

    const currentDirectory = getCurrentDirectory();
    const projects = mode === "projects" ? useProjectsStore.getState().projects : [];
    const directoriesToRefresh = Array.from(
      new Set([
        ...(currentDirectory ? [currentDirectory] : []),
        ...projects.map((project) => project.path).filter(Boolean),
      ]),
    );

    if (scopes.includes("all") && mode === "projects") {
      useConfigStore.setState({ directoryScoped: {} });
    }

    if (refreshProviders) {
      useConfigStore.getState().invalidateProviderCache(mode === "active" ? currentDirectory : undefined);
    }

    const sdkRefreshTasks: Promise<void>[] = [];
    for (const directory of directoriesToRefresh) {
      if (refreshProviders) {
        sdkRefreshTasks.push(configStore.loadProviders({ directory, source: 'agentsStore:refreshConfig' }).then(() => undefined));
      }
      if (refreshSdkAgents) {
        sdkRefreshTasks.push(configStore.loadAgents({ directory, source: 'agentsStore:refreshConfig' }).then(() => undefined));
      }
    }

    const uiRefreshTasks: Promise<void>[] = [];
    if (refreshAgentConfigs) {
      invalidateAgentsLoadCache(currentDirectory);
      uiRefreshTasks.push(agentConfigStore.loadAgents().then(() => undefined));
    }
    if (refreshCommands) {
      invalidateCommandsLoadCache(currentDirectory);
      // The directory the user works in, as the agents and providers above: a
      // worktree session's folder is not the active project's path.
      uiRefreshTasks.push(commandsStore.loadCommands(currentDirectory).then(() => undefined));
    }
    if (refreshSkills) {
      // Match loadSkills cache key (active-project-first). Passing client/directory-store
      // path here misses the key when those diverge after getRequestDirectory().
      invalidateSkillsLoadCache();
      uiRefreshTasks.push(skillsStore.loadSkills().then(() => undefined));
      uiRefreshTasks.push(skillsCatalogStore.loadCatalog({ refresh: true }).then(() => undefined));
    }

    updateConfigUpdateMessage("Refreshing configuration…");
    await Promise.all([...sdkRefreshTasks, ...uiRefreshTasks]);
  } catch (error) {
    updateConfigUpdateMessage("OpenCode refresh failed. Please retry.");
    await sleep(1500);
    throw error;
  } finally {
    finishConfigUpdate();
  }
}

export async function refreshAfterOpenCodeRestart(options?: {
  message?: string;
  delayMs?: number;
  scopes?: ConfigChangeScope[];
  mode?: ConfigRefreshMode;
}) {
  await performConfigRefresh(options);
}

export async function reloadOpenCodeConfiguration(options?: {
  message?: string;
  delayMs?: number;
  scopes?: ConfigChangeScope[];
  mode?: ConfigRefreshMode;
}) {
  startConfigUpdate(options?.message || "Reloading OpenCode configuration…");

  try {

    const response = await runtimeFetch('/api/config/reload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.error || 'Failed to reload configuration';
      throw new Error(message);
    }

    if (payload?.requiresManualRestart) {
      finishConfigUpdate();
      const error = new Error(
        payload?.message || 'Restart your connected OpenCode server to apply the changes.',
      );
      (error as Error & { requiresManualRestart?: boolean }).requiresManualRestart = true;
      throw error;
    }

    const refreshOptions = {
      ...options,
      scopes: options?.scopes ?? ["all"],
      mode: options?.mode ?? "projects",
    };

    if (payload?.requiresReload) {
      await refreshAfterOpenCodeRestart({
        ...refreshOptions,
        message: payload.message,
        delayMs: payload.reloadDelayMs,
      });
    } else {
      await refreshAfterOpenCodeRestart(refreshOptions);
    }
  } catch (error) {
    console.error('[reloadOpenCodeConfiguration] Failed:', error);
    if ((error as Error & { requiresManualRestart?: boolean })?.requiresManualRestart) {
      throw error;
    }
    updateConfigUpdateMessage('Failed to reload configuration. Please try again.');
    await sleep(2000);
    finishConfigUpdate();
    throw error;
  }
}

>>>>>>> bc50ba56a
let unsubscribeAgentsConfigChanges: (() => void) | null = null;

if (!unsubscribeAgentsConfigChanges) {
  unsubscribeAgentsConfigChanges = subscribeToConfigChanges((event) => {
    if (event.source === CONFIG_EVENT_SOURCE) {
      return;
    }

    if (scopeMatches(event, "agents")) {
      invalidateAgentsLoadCache();
      const { loadAgents } = useAgentsStore.getState();
      void loadAgents();
    }
  });
}

// The config store can be connected before the Agent Service finishes starting.
// The config store owns that transition and calls this hook; once both report
// ready, give one errored directory a bounded recovery. The canonical readiness
// waiter inside retryAgentsWhenReady is the actual gate.
let agentReadinessConnected = false;
const syncAgentReadiness = (state: AgentReadinessState): void => {
  const ready = state.isInitialized && state.connectionPhase === 'connected';
  if (!ready) {
    agentReadinessConnected = false;
    return;
  }
  if (agentReadinessConnected) return;
  agentReadinessConnected = true;
  agentRecoverySettled.clear();
  const directory = resolveDirectory();
  if (!directory) return;
  if (useAgentsStore.getState().errorsByDirectory[getAgentsCacheKey(directory)]) {
    void useAgentsStore.getState().retryAgentsWhenReady(directory);
  }
};

registerAgentReadinessListener(syncAgentReadiness);
