import { create } from 'zustand';
import { resolveSmallModel } from '@/lib/smallModelRequest';
import { useConfigStore } from '@/stores/useConfigStore';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { subscribeToConfigChanges } from '@/lib/configSync';
import type { SmallModelRequest } from '@/lib/smallModelRequest';

export type SmallModelAvailabilityScope = Pick<SmallModelRequest, 'workspaceId' | 'preferred'>;


export type SmallModelAvailability = 'unknown' | 'available' | 'unavailable';

const MAX_AGE_MS = 60_000;

const toKey = (directory: string | null | undefined, scope?: SmallModelAvailabilityScope): string => {
  const config = useConfigStore.getState();
  const preferred = scope?.preferred;
  return `${getRuntimeKey()}::${directory?.trim() || '__global__'}::${JSON.stringify([scope?.workspaceId ?? null, preferred?.providerId ?? config.currentProviderId, preferred?.modelId ?? config.currentModelId])}`;
};

const inFlight = new Map<string, Promise<void>>();
let generation = 0;

interface SmallModelStore {
  byKey: Record<string, { availability: SmallModelAvailability; fetchedAt: number }>;
  /** Fetch when unknown or stale; concurrent callers share one request. */
  ensureFresh: (directory?: string | null, scope?: SmallModelAvailabilityScope) => Promise<void>;
  /** Forget every answer; the next reader fetches again. */
  invalidate: () => void;
}

export const useSmallModelStore = create<SmallModelStore>()((set, get) => ({
  byKey: {},

  ensureFresh: async (directory, scope) => {
    const key = toKey(directory, scope);
    const entry = get().byKey[key];
    if (entry && Date.now() - entry.fetchedAt < MAX_AGE_MS) return;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const version = generation;
    const request = (async () => {
      try {
        const { selection } = await resolveSmallModel({ directory, ...scope });
        if (version !== generation || key !== toKey(directory, scope)) return;
        const available = selection !== null;
        // A failed or malformed answer keeps the previous one: an unreachable
        // server is not evidence that the model went away.
        set((state) => ({
          byKey: {
            ...state.byKey,
            [key]: { availability: available ? 'available' : 'unavailable', fetchedAt: Date.now() },
          },
        }));
      } catch {
        // Transport failure: keep whatever we knew.
      } finally {
        if (version === generation) inFlight.delete(key);
      }
    })();
    inFlight.set(key, request);
    return request;
  },

  invalidate: () => {
    generation += 1;
    inFlight.clear();
    set({ byKey: {} });
  },
}));

export const selectSmallModelAvailability = (
  state: SmallModelStore,
  directory: string | null | undefined,
  scope?: SmallModelAvailabilityScope,
): SmallModelAvailability => state.byKey[toKey(directory, scope)]?.availability ?? 'unknown';

subscribeToConfigChanges(() => useSmallModelStore.getState().invalidate());
subscribeRuntimeEndpointChanged(() => useSmallModelStore.getState().invalidate());
