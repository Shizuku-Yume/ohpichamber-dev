import { create } from 'zustand';
import type {
  CacheWarmingMode,
  SessionCacheWarmingApplyResult,
  SessionCacheWarmingState,
} from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';

export type SessionWarmingEntry = {
  state: SessionCacheWarmingState;
  lastOutcome: SessionCacheWarmingApplyResult['status'] | null;
  updatedAtRevision: number;
};

export interface SessionWarmingStoreState {
  runtimeKey: string;
  entries: Record<string, SessionWarmingEntry>;
  loadingBySession: Record<string, boolean>;
  savingBySession: Record<string, boolean>;
  errorBySession: Record<string, 'read' | 'write'>;
  loadSessionWarming: (sessionId: string, options?: { force?: boolean }) => Promise<SessionCacheWarmingState | null>;
  setSessionWarmingMode: (sessionId: string, mode: CacheWarmingMode | null) => Promise<SessionCacheWarmingApplyResult>;
  toggleSessionKeepWarm: (sessionId: string) => Promise<SessionCacheWarmingApplyResult>;
  invalidateWorkspaceSessions: (workspaceId: string, workspaceMode?: CacheWarmingMode) => void;
  removeSessions: (sessionIds: Iterable<string>) => void;
  reset: () => void;
}

type SessionWarmingClient = Pick<typeof canonicalClient, 'readSessionCacheWarming' | 'updateSessionCacheWarming'>;

type SessionWarmingDependencies = {
  client: SessionWarmingClient;
  getRuntimeKey: () => string;
};

type InflightRead = {
  generation: number;
  controller: AbortController;
  promise: Promise<SessionCacheWarmingState | null>;
};

const omitSessionKeys = <T>(record: Record<string, T>, sessionIds: readonly string[]) => {
  let next: Record<string, T> | null = null;
  for (const sessionId of sessionIds) {
    if (!Object.hasOwn(next ?? record, sessionId)) continue;
    next ??= { ...record };
    delete next[sessionId];
  }
  return next ?? record;
};

/**
 * Computes the next persisted override when toggling "Keep warm" for a session:
 * - Currently off: clear `'off'` suppression if workspace is warm (`null`), else set `'idle'`.
 * - Currently warm: clear per-session warm override if workspace is `'off'` (`null`), else suppress with `'off'`.
 */
const computeToggledMode = (current: SessionCacheWarmingState): CacheWarmingMode | null => {
  if (current.effectiveMode !== 'off') {
    return current.workspaceMode === 'off' ? null : 'off';
  }
  return current.workspaceMode !== 'off' ? null : 'idle';
};

/**
 * Authoritative per-session cache-warming state keyed by runtime.
 * Failed reads preserve the previous entry; writes serialize per session with CAS conflict recovery.
 */
export const createSessionWarmingStore = (dependencies: SessionWarmingDependencies) => {
  let runtimeGeneration = 0;
  let mutationCounter = 0;
  const inflightReads = new Map<string, InflightRead>();
  const writeQueues = new Map<string, Promise<void>>();
  const activeWriteControllers = new Set<AbortController>();
  const sessionMutationRevisions = new Map<string, number>();

  const isOwnerCurrent = (capturedGeneration: number, capturedRuntimeKey: string): boolean => (
    capturedGeneration === runtimeGeneration && capturedRuntimeKey === dependencies.getRuntimeKey()
  );

  return create<SessionWarmingStoreState>()((set, get) => {
    const reset = (): void => {
      runtimeGeneration += 1;
      mutationCounter += 1;
      for (const inflight of inflightReads.values()) {
        inflight.controller.abort();
      }
      inflightReads.clear();
      for (const controller of activeWriteControllers) {
        controller.abort();
      }
      activeWriteControllers.clear();
      writeQueues.clear();
      sessionMutationRevisions.clear();
      set({
        runtimeKey: dependencies.getRuntimeKey(),
        entries: {},
        loadingBySession: {},
        savingBySession: {},
        errorBySession: {},
      });
    };

    const ensureCurrentRuntime = (): void => {
      if (get().runtimeKey !== dependencies.getRuntimeKey()) {
        reset();
      }
    };

    const commitState = (
      sessionId: string,
      persisted: SessionCacheWarmingState,
      lastOutcome: SessionCacheWarmingApplyResult['status'] | null,
    ): void => {
      set((state) => ({
        entries: {
          ...state.entries,
          [sessionId]: {
            state: persisted,
            lastOutcome,
            updatedAtRevision: ++mutationCounter,
          },
        },
        errorBySession: omitSessionKeys(state.errorBySession, [sessionId]),
      }));
    };

    const loadSessionWarming = (
      sessionId: string,
      options?: { force?: boolean },
    ): Promise<SessionCacheWarmingState | null> => {
      ensureCurrentRuntime();
      if (!sessionId) return Promise.resolve(null);

      const force = options?.force === true;
      const existing = get().entries[sessionId];
      const hasError = get().errorBySession[sessionId] !== undefined;
      if (existing && !force && !hasError) {
        return Promise.resolve(existing.state);
      }

      const existingInflight = inflightReads.get(sessionId);
      if (existingInflight && existingInflight.generation === runtimeGeneration) {
        if (!force) {
          return existingInflight.promise;
        }
        existingInflight.controller.abort();
        inflightReads.delete(sessionId);
      }

      const capturedGeneration = runtimeGeneration;
      const capturedRuntimeKey = dependencies.getRuntimeKey();
      const capturedMutationRevision = sessionMutationRevisions.get(sessionId) ?? 0;
      const controller = new AbortController();

      const record: InflightRead = {
        generation: capturedGeneration,
        controller,
        promise: Promise.resolve(null),
      };

      record.promise = (async (): Promise<SessionCacheWarmingState | null> => {
        set((state) => (
          state.loadingBySession[sessionId]
            ? state
            : { loadingBySession: { ...state.loadingBySession, [sessionId]: true } }
        ));
        try {
          const fresh = await dependencies.client.readSessionCacheWarming(sessionId, controller.signal);
          if (!isOwnerCurrent(capturedGeneration, capturedRuntimeKey)) return null;
          if ((sessionMutationRevisions.get(sessionId) ?? 0) !== capturedMutationRevision) {
            return get().entries[sessionId]?.state ?? null;
          }
          const prior = get().entries[sessionId];
          const preservedOutcome = prior && prior.state.revision === fresh.revision ? prior.lastOutcome : null;
          commitState(sessionId, fresh, preservedOutcome);
          return fresh;
        } catch {
          if (inflightReads.get(sessionId) !== record) return null;
          if (!isOwnerCurrent(capturedGeneration, capturedRuntimeKey) || controller.signal.aborted) return null;
          if ((sessionMutationRevisions.get(sessionId) ?? 0) !== capturedMutationRevision) {
            return get().entries[sessionId]?.state ?? null;
          }
          set((state) => ({
            errorBySession: { ...state.errorBySession, [sessionId]: 'read' },
          }));
          return null;
        } finally {
          if (inflightReads.get(sessionId) === record) {
            inflightReads.delete(sessionId);
            if (isOwnerCurrent(capturedGeneration, capturedRuntimeKey)) {
              set((state) => ({
                loadingBySession: omitSessionKeys(state.loadingBySession, [sessionId]),
              }));
            }
          }
        }
      })();

      inflightReads.set(sessionId, record);
      return record.promise;
    };

    const enqueueWrite = (
      sessionId: string,
      computeTargetMode: (current: SessionCacheWarmingState) => CacheWarmingMode | null,
    ): Promise<SessionCacheWarmingApplyResult> => {
      ensureCurrentRuntime();
      if (!sessionId) {
        return Promise.reject(new Error('Session ID is required'));
      }

      const capturedGeneration = runtimeGeneration;
      const capturedRuntimeKey = dependencies.getRuntimeKey();

      set((state) => ({
        savingBySession: { ...state.savingBySession, [sessionId]: true },
        errorBySession: omitSessionKeys(state.errorBySession, [sessionId]),
      }));

      const previous = writeQueues.get(sessionId) ?? Promise.resolve();
      const runTask = previous.then(async (): Promise<SessionCacheWarmingApplyResult> => {
        if (!isOwnerCurrent(capturedGeneration, capturedRuntimeKey)) {
          throw new Error('Runtime endpoint changed');
        }

        const controller = new AbortController();
        activeWriteControllers.add(controller);
        sessionMutationRevisions.set(sessionId, (sessionMutationRevisions.get(sessionId) ?? 0) + 1);

        try {
          let current = get().entries[sessionId]?.state ?? null;
          if (!current) {
            current = await dependencies.client.readSessionCacheWarming(sessionId, controller.signal);
            if (!isOwnerCurrent(capturedGeneration, capturedRuntimeKey)) {
              throw new Error('Runtime endpoint changed');
            }
            commitState(sessionId, current, get().entries[sessionId]?.lastOutcome ?? null);
          }

          const targetMode = computeTargetMode(current);
          const attemptUpdate = (expectedRevision: string) => (
            dependencies.client.updateSessionCacheWarming(
              sessionId,
              { expectedRevision, mode: targetMode },
              controller.signal,
            )
          );

          let result: SessionCacheWarmingApplyResult;
          try {
            result = await attemptUpdate(current.revision);
          } catch (error) {
            if (
              isOwnerCurrent(capturedGeneration, capturedRuntimeKey)
              && !controller.signal.aborted
              && error instanceof CanonicalApiError
              && error.problem.status === 409
              && error.problem.code === 'CATALOG_CONFLICT'
            ) {
              const refreshed = await dependencies.client.readSessionCacheWarming(sessionId, controller.signal);
              if (!isOwnerCurrent(capturedGeneration, capturedRuntimeKey)) {
                throw new Error('Runtime endpoint changed');
              }
              commitState(sessionId, refreshed, get().entries[sessionId]?.lastOutcome ?? null);
              result = await attemptUpdate(refreshed.revision);
            } else {
              throw error;
            }
          }

          if (!isOwnerCurrent(capturedGeneration, capturedRuntimeKey)) {
            throw new Error('Runtime endpoint changed');
          }
          sessionMutationRevisions.set(sessionId, (sessionMutationRevisions.get(sessionId) ?? 0) + 1);
          commitState(sessionId, result.persisted, result.status);
          return result;
        } catch (error) {
          if (isOwnerCurrent(capturedGeneration, capturedRuntimeKey) && !controller.signal.aborted) {
            set((state) => ({
              errorBySession: { ...state.errorBySession, [sessionId]: 'write' },
            }));
          }
          throw error;
        } finally {
          activeWriteControllers.delete(controller);
        }
      });

      const tail = runTask.then(() => undefined, () => undefined);
      writeQueues.set(sessionId, tail);
      void tail.finally(() => {
        if (writeQueues.get(sessionId) === tail) {
          writeQueues.delete(sessionId);
          if (isOwnerCurrent(capturedGeneration, capturedRuntimeKey)) {
            set((state) => ({
              savingBySession: omitSessionKeys(state.savingBySession, [sessionId]),
            }));
          }
        }
      });

      return runTask;
    };

    return {
      runtimeKey: dependencies.getRuntimeKey(),
      entries: {},
      loadingBySession: {},
      savingBySession: {},
      errorBySession: {},
      loadSessionWarming,
      setSessionWarmingMode: (sessionId, mode) => enqueueWrite(sessionId, () => mode),
      toggleSessionKeepWarm: (sessionId) => enqueueWrite(sessionId, computeToggledMode),
      invalidateWorkspaceSessions: (workspaceId, workspaceMode) => {
        ensureCurrentRuntime();
        if (!workspaceId) return;
        const currentEntries = get().entries;
        const matchingIds: string[] = [];
        for (const [sessionId, entry] of Object.entries(currentEntries)) {
          if (entry.state.workspaceId === workspaceId) {
            matchingIds.push(sessionId);
          }
        }
        if (matchingIds.length === 0) return;

        if (workspaceMode === undefined) {
          for (const sessionId of matchingIds) {
            void loadSessionWarming(sessionId, { force: true });
          }
          return;
        }

        set((state) => {
          let nextEntries: Record<string, SessionWarmingEntry> | null = null;
          for (const sessionId of matchingIds) {
            const entry = state.entries[sessionId];
            if (!entry || entry.state.workspaceId !== workspaceId) continue;
            const nextEffectiveMode = entry.state.mode ?? workspaceMode;
            if (entry.state.workspaceMode === workspaceMode && entry.state.effectiveMode === nextEffectiveMode) {
              continue;
            }
            nextEntries ??= { ...state.entries };
            nextEntries[sessionId] = {
              ...entry,
              state: {
                ...entry.state,
                workspaceMode,
                effectiveMode: nextEffectiveMode,
              },
              updatedAtRevision: ++mutationCounter,
            };
          }
          return nextEntries ? { entries: nextEntries } : state;
        });
      },
      removeSessions: (sessionIds) => {
        ensureCurrentRuntime();
        const ids = Array.from(sessionIds).filter(Boolean);
        if (ids.length === 0) return;
        for (const sessionId of ids) {
          sessionMutationRevisions.set(sessionId, (sessionMutationRevisions.get(sessionId) ?? 0) + 1);
          const inflight = inflightReads.get(sessionId);
          if (inflight) {
            inflight.controller.abort();
            inflightReads.delete(sessionId);
          }
        }
        set((state) => {
          const nextEntries = omitSessionKeys(state.entries, ids);
          const nextLoading = omitSessionKeys(state.loadingBySession, ids);
          const nextSaving = omitSessionKeys(state.savingBySession, ids);
          const nextErrors = omitSessionKeys(state.errorBySession, ids);
          if (
            nextEntries === state.entries
            && nextLoading === state.loadingBySession
            && nextSaving === state.savingBySession
            && nextErrors === state.errorBySession
          ) {
            return state;
          }
          return {
            entries: nextEntries,
            loadingBySession: nextLoading,
            savingBySession: nextSaving,
            errorBySession: nextErrors,
          };
        });
      },
      reset,
    };
  });
};

export const useSessionWarmingStore = createSessionWarmingStore({
  client: canonicalClient,
  getRuntimeKey,
});

subscribeRuntimeEndpointWillChange(() => {
  useSessionWarmingStore.getState().reset();
});

export const useSessionWarmingState = (sessionId: string | null | undefined): SessionCacheWarmingState | null => (
  useSessionWarmingStore((state) => (sessionId ? state.entries[sessionId]?.state ?? null : null))
);

export const useSessionWarmingSaving = (sessionId: string | null | undefined): boolean => (
  useSessionWarmingStore((state) => (sessionId ? state.savingBySession[sessionId] === true : false))
);
export const isSessionKeptWarm = (state: SessionCacheWarmingState | null | undefined): boolean => (
  state !== null && state !== undefined && state.effectiveMode !== 'off'
);
