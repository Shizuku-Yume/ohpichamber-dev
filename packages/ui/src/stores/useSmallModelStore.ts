import { create } from 'zustand';
import { resolveSmallModel } from '@/lib/smallModelRequest';
import { useConfigStore } from '@/stores/useConfigStore';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { subscribeToConfigChanges } from '@/lib/configSync';
import type { SmallModelRequest } from '@/lib/smallModelRequest';

export type SmallModelAvailabilityScope = Pick<SmallModelRequest, 'workspaceId' | 'preferred'>;

<<<<<<< HEAD
/**
 * Whether OpenChamber's background model ("small model") can run right now.
 *
 * Canonical workspace model catalogs and scoped profile settings determine
 * availability. Failed discovery keeps the previous answer; it is not proof
 * that a selected model disappeared.
 *
 * Cached per runtime + directory and refreshed at most once a minute unless
 * something that changes the answer happens: a provider login or a settings
 * save emits a config change, a runtime switch drops everything.
 */
||||||| bc50ba56aa
/**
 * Whether OpenChamber's background model ("small model") can run right now.
 *
 * `GET /api/small-model` answers `available: false` when OpenCode has no model
 * a stateless generation may use — a fresh install on OpenCode's free tier,
 * for instance, has models for chat but none for this. Session renaming, the
 * session goal and the changes walkthrough all depend on it, so the surfaces
 * that start them read this store to show a disabled state with a reason
 * instead of failing after the click.
 *
 * Cached per runtime + directory and refreshed at most once a minute unless
 * something that changes the answer happens: a provider login or a settings
 * save emits a config change, a runtime switch drops everything.
 */
=======
>>>>>>> upstream/main

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
<<<<<<< HEAD
  /** Fetch when unknown or stale; concurrent callers share one request. */
  ensureFresh: (directory?: string | null, scope?: SmallModelAvailabilityScope) => Promise<void>;
  /** Forget every answer; the next reader fetches again. */
||||||| bc50ba56aa
  /** Fetch when unknown or stale; concurrent callers share one request. */
  ensureFresh: (directory?: string | null) => Promise<void>;
  /** Forget every answer; the next reader fetches again. */
=======
  ensureFresh: (directory?: string | null) => Promise<void>;
>>>>>>> upstream/main
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
<<<<<<< HEAD
        const { selection } = await resolveSmallModel({ directory, ...scope });
        if (version !== generation || key !== toKey(directory, scope)) return;
        const available = selection !== null;
        // A failed or malformed answer keeps the previous one: an unreachable
        // server is not evidence that the model went away.
||||||| bc50ba56aa
        const trimmed = directory?.trim() ?? '';
        const query = trimmed ? `?directory=${encodeURIComponent(trimmed)}` : '';
        const response = await runtimeFetch(`/api/small-model${query}`);
        if (!response.ok) return;
        // SAFETY: `GET /api/small-model` (server `small-model/routes.js`)
        // answers `{ available: boolean, ... }`; only that field is read and
        // anything but a real boolean is treated as "no answer" below.
        const payload = (await response.json().catch(() => null)) as { available?: boolean } | null;
        const available = payload?.available;
        if (available !== true && available !== false) return;
        // A failed or malformed answer keeps the previous one: an unreachable
        // server is not evidence that the model went away.
=======
        const trimmed = directory?.trim() ?? '';
        const query = trimmed ? `?directory=${encodeURIComponent(trimmed)}` : '';
        const response = await runtimeFetch(`/api/small-model${query}`);
        if (!response.ok) return;
        // SAFETY: `GET /api/small-model` (server `small-model/routes.js`)
        // answers `{ available: boolean, ... }`; only that field is read and
        // anything but a real boolean is treated as "no answer" below.
        const payload = (await response.json().catch(() => null)) as { available?: boolean } | null;
        const available = payload?.available;
        if (available !== true && available !== false) return;
>>>>>>> upstream/main
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

<<<<<<< HEAD
// Profile settings or credentials invalidate discovery; runtime resets reject
// all pending answers, including a switch away and back to the same endpoint.
||||||| bc50ba56aa
// Logging into a provider, or changing the Small Model setting, changes the
// answer; a runtime switch points at a different OpenCode entirely.
=======
>>>>>>> upstream/main
subscribeToConfigChanges(() => useSmallModelStore.getState().invalidate());
subscribeRuntimeEndpointChanged(() => useSmallModelStore.getState().invalidate());
