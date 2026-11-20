

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
import { problemMessage } from '@/lib/problemMessage';

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
const agentsLoadGeneration = new Map<string, number>();
const agentsLoadInFlight = new Map<string, { generation: number; request: Promise<boolean> }>();
let agentsGeneration = 0;
let agentsReloadEpoch = 0;

const getAgentsCacheKey = (directory: string | null): string => {
  return directory?.trim() || DEFAULT_AGENTS_CACHE_KEY;
};

export const invalidateAgentsLoadCache = (directory: string | null = getConfigDirectory()) => {
  const cacheKey = getAgentsCacheKey(directory);
  agentsLastLoadedAt.delete(cacheKey);
  agentsLoadGeneration.set(cacheKey, (agentsLoadGeneration.get(cacheKey) ?? 0) + 1);
  // Retire reads started before a catalog mutation or notification.
};

export const invalidateAgentCatalogsForReload = (): void => {
  agentsReloadEpoch += 1;
  const keys = new Set([
    ...Object.keys(useAgentsStore.getState().agentsByDirectory),
    ...agentsLastLoadedAt.keys(),
    ...agentsLoadInFlight.keys(),
  ]);
  agentsLastLoadedAt.clear();
  for (const key of keys) agentsLoadGeneration.set(key, (agentsLoadGeneration.get(key) ?? 0) + 1);
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

export const useAgentsStore: UseBoundStore<StoreApi<AgentsStore>> = create<AgentsStore>()(devtools(persist((set, get) => {
  const fail = (key: string, error: unknown): AgentMutationResult => {
    const message = problemMessage(error, 'The agent catalog operation failed.');
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
    },
    loadAgents: async (requestedDirectory) => {
      const reloadEpoch = agentsReloadEpoch;
      const directory = resolveDirectory(requestedDirectory);
      const key = getAgentsCacheKey(directory);
      const runtimeGeneration = agentsGeneration;
      const runtimeKey = getRuntimeKey();
      const currentRuntime = () => runtimeGeneration === agentsGeneration && runtimeKey === getRuntimeKey();
      if (!get().errorsByDirectory[key] && get().revisionsByDirectory[key] !== undefined && Date.now() - (agentsLastLoadedAt.get(key) ?? 0) < AGENTS_LOAD_CACHE_TTL_MS) return true;
      const inFlight = agentsLoadInFlight.get(key);
      if (inFlight && inFlight.generation === (agentsLoadGeneration.get(key) ?? 0)) {
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
      if (!currentRuntime() || reloadEpoch !== agentsReloadEpoch) return false;
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
