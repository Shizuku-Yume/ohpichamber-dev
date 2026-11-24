import { create } from 'zustand';
import type { Subagent } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';

type SubagentsStore = {
  byParent: Record<string, Subagent[]>;
  hydratedByParent: Record<string, string>;
  failedByParent: Record<string, string>;
  applySubagentUpdate: (parentSessionId: string, subagent: Subagent) => void;
  setSubagents: (parentSessionId: string, subagents: Subagent[]) => void;
  hydrateParent: (parentSessionId: string, force?: boolean) => Promise<void>;
  removeSubagent: (parentSessionId: string, subagentId: string) => void;
  clearSession: (parentSessionId: string) => void;
  resetForRuntimeSwitch: () => void;
};

const mergeSubagent = (previous: Subagent | undefined, incoming: Subagent): Subagent => {
  if (!previous) return incoming;
  const resolvedChildSessionId = incoming.childSessionId && incoming.childSessionId !== incoming.subagentId
    ? incoming.childSessionId
    : (previous.childSessionId && previous.childSessionId !== previous.subagentId
      ? previous.childSessionId
      : (incoming.childSessionId ?? previous.childSessionId));
  return {
    ...previous,
    ...incoming,
    name: incoming.name ?? previous.name,
    childSessionId: resolvedChildSessionId,
    toolCallId: incoming.toolCallId ?? previous.toolCallId,
    model: incoming.model ?? previous.model,
    solutionSpace: incoming.solutionSpace ?? previous.solutionSpace,
    description: incoming.description ?? previous.description,
    task: incoming.task ?? previous.task,
    createdAt: incoming.createdAt ?? previous.createdAt,
    contextTokens: incoming.contextTokens ?? previous.contextTokens,
    contextWindow: incoming.contextWindow ?? previous.contextWindow,
  };
};

const mergeHydratedList = (existing: readonly Subagent[], fetched: readonly Subagent[]): Subagent[] => {
  const merged = new Map<string, Subagent>();
  for (const item of fetched) {
    merged.set(item.subagentId, item);
  }
  for (const item of existing) {
    const persisted = merged.get(item.subagentId);
    if (!persisted) {
      merged.set(item.subagentId, item);
      continue;
    }
    // Live SSE records carry transient activeTool/lastIntent/retryCountdown that persisted transcripts omit;
    // persisted records carry authoritative childSessionId, tokens, cost, and durationMs.
    const preferLiveStatus = persisted.persisted && (item.status === 'running' || item.status === 'idle');
    merged.set(item.subagentId, {
      ...item,
      ...persisted,
      name: persisted.name ?? item.name,
      childSessionId: persisted.childSessionId ?? item.childSessionId,
      model: persisted.model ?? item.model,
      status: preferLiveStatus ? item.status : persisted.status,
      activeTool: item.status === 'running' ? (item.activeTool ?? persisted.activeTool) : persisted.activeTool,
      activeToolArgs: item.status === 'running' ? (item.activeToolArgs ?? persisted.activeToolArgs) : persisted.activeToolArgs,
      lastIntent: item.lastIntent ?? persisted.lastIntent,
      stage: item.stage ?? persisted.stage,
      retryCountdown: item.status === 'running' ? (item.retryCountdown ?? persisted.retryCountdown) : persisted.retryCountdown,
      contextTokens: persisted.contextTokens ?? item.contextTokens,
      contextWindow: persisted.contextWindow ?? item.contextWindow,
      solutionSpace: item.solutionSpace ?? persisted.solutionSpace,
      task: item.task ?? persisted.task,
      description: item.description ?? persisted.description,
      toolCallId: persisted.toolCallId ?? item.toolCallId,
    });
  }
  return [...merged.values()];
};

let storeGeneration = 0;
type InflightHydration = { promise: Promise<void>; pendingForce: boolean };
const inflightHydrations = new Map<string, InflightHydration>();
const mutationRevisionByParent = new Map<string, number>();

const bumpMutationRevision = (parentSessionId: string): number => {
  const next = (mutationRevisionByParent.get(parentSessionId) ?? 0) + 1;
  mutationRevisionByParent.set(parentSessionId, next);
  return next;
};

const withoutParentKey = (record: Record<string, string>, parentSessionId: string) => {
  if (!(parentSessionId in record)) return record;
  const next = { ...record };
  delete next[parentSessionId];
  return next;
};

export const useSubagentsStore = create<SubagentsStore>()((set, get) => ({
  byParent: {},
  hydratedByParent: {},
  failedByParent: {},
  applySubagentUpdate: (parentSessionId, subagent) => {
    bumpMutationRevision(parentSessionId);
    set((state) => {
      const current = state.byParent[parentSessionId] ?? [];
      const index = current.findIndex((item) => item.subagentId === subagent.subagentId);
      const updated = index >= 0
        ? current.map((item, idx) => (idx === index ? mergeSubagent(item, subagent) : item))
        : [...current, subagent];
      return {
        byParent: {
          ...state.byParent,
          [parentSessionId]: updated,
        },
        failedByParent: withoutParentKey(state.failedByParent, parentSessionId),
      };
    });
  },
  setSubagents: (parentSessionId, subagents) => {
    bumpMutationRevision(parentSessionId);
    set((state) => ({
      byParent: {
        ...state.byParent,
        [parentSessionId]: subagents,
      },
      failedByParent: withoutParentKey(state.failedByParent, parentSessionId),
    }));
  },
  hydrateParent: async (parentSessionId, force = false) => {
    if (!parentSessionId) return;
    const runtimeKey = getRuntimeKey();
    if (!force && get().hydratedByParent[parentSessionId] === runtimeKey) return;
    if (force && get().hydratedByParent[parentSessionId] === runtimeKey) {
      set((state) => ({
        hydratedByParent: withoutParentKey(state.hydratedByParent, parentSessionId),
      }));
    }
    const inflightKey = `${runtimeKey}\0${parentSessionId}`;
    const capturedGeneration = storeGeneration;

    const runFetch = async (): Promise<void> => {
      const startRevision = mutationRevisionByParent.get(parentSessionId) ?? 0;
      try {
        const fetched = await canonicalClient.listSubagents(parentSessionId);
        if (capturedGeneration !== storeGeneration || getRuntimeKey() !== runtimeKey) return;
        set((state) => {
          const current = state.byParent[parentSessionId] ?? [];
          const currentRevision = mutationRevisionByParent.get(parentSessionId) ?? 0;
          // Whether or not live updates arrived in flight, mergeHydratedList preserves newer live fields
          // while reconciling persisted childSessionId, tokens, cost, and settled rows.
          const nextList = currentRevision > startRevision || current.length > 0
            ? mergeHydratedList(current, fetched)
            : fetched;
          return {
            byParent: {
              ...state.byParent,
              [parentSessionId]: nextList,
            },
            hydratedByParent: {
              ...state.hydratedByParent,
              [parentSessionId]: runtimeKey,
            },
            failedByParent: withoutParentKey(state.failedByParent, parentSessionId),
          };
        });
      } catch {
        // Failure is not empty: preserve prior byParent state and leave parent unhydrated so future triggers can retry.
        if (capturedGeneration === storeGeneration && getRuntimeKey() === runtimeKey) {
          set((state) => ({
            hydratedByParent: withoutParentKey(state.hydratedByParent, parentSessionId),
            failedByParent: {
              ...state.failedByParent,
              [parentSessionId]: runtimeKey,
            },
          }));
        }
      }
    };

    const existing = inflightHydrations.get(inflightKey);
    if (existing) {
      if (!force || existing.pendingForce) return existing.promise;
      const chainedEntry: InflightHydration = {
        promise: Promise.resolve(),
        pendingForce: true,
      };
      chainedEntry.promise = existing.promise.then(() => {
        chainedEntry.pendingForce = false;
        if (capturedGeneration !== storeGeneration || getRuntimeKey() !== runtimeKey) return;
        return runFetch();
      });
      inflightHydrations.set(inflightKey, chainedEntry);
      void chainedEntry.promise.finally(() => {
        if (inflightHydrations.get(inflightKey) === chainedEntry) {
          inflightHydrations.delete(inflightKey);
        }
      });
      return chainedEntry.promise;
    }

    const entry: InflightHydration = {
      promise: runFetch(),
      pendingForce: false,
    };
    inflightHydrations.set(inflightKey, entry);
    void entry.promise.finally(() => {
      if (inflightHydrations.get(inflightKey) === entry) {
        inflightHydrations.delete(inflightKey);
      }
    });
    return entry.promise;
  },
  removeSubagent: (parentSessionId, subagentId) => {
    bumpMutationRevision(parentSessionId);
    set((state) => {
      const current = state.byParent[parentSessionId];
      if (!current) return state;
      return {
        byParent: {
          ...state.byParent,
          [parentSessionId]: current.filter((item) => item.subagentId !== subagentId),
        },
      };
    });
  },
  clearSession: (parentSessionId) => {
    bumpMutationRevision(parentSessionId);
    set((state) => {
      const hasParent = parentSessionId in state.byParent;
      const hasHydrated = parentSessionId in state.hydratedByParent;
      const hasFailed = parentSessionId in state.failedByParent;
      if (!hasParent && !hasHydrated && !hasFailed) return state;
      const byParent = { ...state.byParent };
      delete byParent[parentSessionId];
      const hydratedByParent = withoutParentKey(state.hydratedByParent, parentSessionId);
      const failedByParent = withoutParentKey(state.failedByParent, parentSessionId);
      return { byParent, hydratedByParent, failedByParent };
    });
  },
  resetForRuntimeSwitch: () => {
    storeGeneration += 1;
    inflightHydrations.clear();
    mutationRevisionByParent.clear();
    set({ byParent: {}, hydratedByParent: {}, failedByParent: {} });
  },
}));

subscribeRuntimeEndpointChanged(() => {
  useSubagentsStore.getState().resetForRuntimeSwitch();
});
