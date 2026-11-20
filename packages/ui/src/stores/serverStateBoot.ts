/**
 * The server-owned state every app surface must read before it can claim
 * anything about it, and the list every runtime switch must clear.
 *
 * Two failure modes this replaces:
 *
 * - A store that only hydrated when some page happened to mount reported the
 *   previous runtime's values, or a fabricated default (`ask`, `0`, `false`),
 *   to the whole app until the user opened that page. The permission shield was
 *   the worst case: restarting the server with default mode `auto` still showed
 *   `ask` until something happened to read the policy.
 * - A hand-written reset list in `apps/runtimeEndpointReset.ts` drifted from
 *   the set of stores that actually project server state, so one switch leaked
 *   the previous instance's values into that store.
 *
 * A store joins here when its content is the server's answer rather than a
 * live event. Entries declare `hydrate`, so boot reads it everywhere, and
 * `reset`, so a switch drops it. Event-only projections (advisor, cleanse) are
 * reset here without a hydrator: they have no value to read.
 */

import { subscribeOpenchamberEvents, type PermissionPolicySyncEvent } from '@/lib/openchamberEvents';
import { useSpacesStore } from '@/lib/spaces/spaces-store';
import { useAdvisorStore } from './useAdvisorStore';
import { useCleanseStore } from './useCleanseStore';
import { useConfigStore } from './useConfigStore';
import { useGitIdentitiesStore } from './useGitIdentitiesStore';
import { useMcpStore } from './useMcpStore';
import { usePermissionStore } from './permissionStore';
import { useQuotaStore } from './useQuotaStore';
import { hydrateSessionFoldersFromServer, useSessionFoldersStore } from './useSessionFoldersStore';
import { useSkillsCatalogStore } from './useSkillsCatalogStore';
import { useSkillsStore } from './useSkillsStore';
import { useWebSearchStore } from './useWebSearchStore';
import type { LoadPhase } from './loadPhase';
import { policySnapshotFromWire } from './utils/permissionAutoAccept';

type ServerStateBootEntry = {
  /** Stable id, also the key in the phase record. */
  id: string;
  /**
   * Reads the server's answer. Omitted by event-only projections, which have
   * nothing to read until the server announces something.
   */
  hydrate?: () => Promise<void> | void;
  /** Drops values owned by the runtime that just left. */
  reset: (runtimeKey: string) => void;
};

/**
 * Ordered as the app reads them: the policy a composer needs first, then the
 * work-status readouts, then the catalogs.
 */
export const SERVER_STATE_BOOT_ENTRIES: readonly ServerStateBootEntry[] = [
  {
    id: 'permission-policy',
    hydrate: () => usePermissionStore.getState().hydrate(),
    reset: () => usePermissionStore.getState().reset(),
  },
  {
    id: 'git-identities',
    hydrate: async () => {
      const identities = useGitIdentitiesStore.getState();
      await Promise.all([
        identities.loadProfiles(),
        identities.loadGlobalIdentity(),
        identities.loadDefaultGitIdentityId(),
      ]);
    },
    reset: (runtimeKey) => useGitIdentitiesStore.getState().resetForRuntimeSwitch(runtimeKey),
  },
  {
    id: 'quota',
    hydrate: async () => {
      // Asking before the instance reports itself initialised gets an
      // honest-looking "not configured" for every provider, cached as an answer.
      if (!useConfigStore.getState().isInitialized) return;
      const quota = useQuotaStore.getState();
      await Promise.all([quota.loadSettings(), quota.loadExtensionProviders()]);
      await quota.ensureLoadedForRuntime({ visibleOnly: true });
    },
    reset: () => useQuotaStore.getState().resetForRuntimeSwitch(),
  },
  {
    id: 'session-folders',
    hydrate: () => hydrateSessionFoldersFromServer(),
    reset: (runtimeKey) => useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey),
  },
  {
    id: 'web-search',
    hydrate: () => useWebSearchStore.getState().load(),
    reset: () => useWebSearchStore.getState().invalidate(),
  },
  {
    id: 'mcp',
    reset: () => useMcpStore.getState().resetForRuntimeSwitch(),
  },
  {
    id: 'skills',
    reset: () => useSkillsStore.getState().resetForRuntimeSwitch(),
  },
  {
    id: 'skills-catalog',
    reset: () => useSkillsCatalogStore.getState().resetForRuntimeSwitch(),
  },
  {
    id: 'advisor',
    reset: () => useAdvisorStore.getState().reset(),
  },
  {
    id: 'cleanse',
    reset: () => useCleanseStore.getState().reset(),
  },
];

type PhaseListener = (phases: Readonly<Record<string, LoadPhase>>) => void;

let phases: Readonly<Record<string, LoadPhase>> = {};
const listeners = new Set<PhaseListener>();
let bootGeneration = 0;
let inFlight: Promise<void> | null = null;

const publish = (next: Record<string, LoadPhase>): void => {
  phases = next;
  for (const listener of listeners) listener(phases);
};

export const getServerStateBootPhases = (): Readonly<Record<string, LoadPhase>> => phases;

export const subscribeServerStateBoot = (listener: PhaseListener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const phaseOf = (id: string, phase: LoadPhase): void => {
  if (phases[id] === phase) return;
  publish({ ...phases, [id]: phase });
};

/**
 * Reads every server-owned store once per pass. A store that fails is marked
 * `error` and keeps whatever it held; boot never clears state to hide a
 * failure, because an empty answer is the one value a failed read must not
 * produce. Concurrent calls share one pass.
 */
export const bootServerStateStores = (): Promise<void> => {
  if (inFlight) return inFlight;
  const generation = ++bootGeneration;
  const pass = (async () => {
    await Promise.all(SERVER_STATE_BOOT_ENTRIES.map(async (entry) => {
      if (!entry.hydrate) {
        // Nothing to read yet: it becomes known when the server announces a value.
        phaseOf(entry.id, 'unknown');
        return;
      }
      try {
        await entry.hydrate();
        if (generation === bootGeneration) phaseOf(entry.id, 'ready');
      } catch (error) {
        if (generation !== bootGeneration) return;
        console.warn(`[server-state-boot] ${entry.id} could not be read:`, error);
        phaseOf(entry.id, 'error');
      }
    }));
  })().finally(() => { if (generation === bootGeneration) inFlight = null; });
  inFlight = pass;
  return pass;
};

/** One switch: every server-owned store drops the runtime that just left. */
export const resetServerStateStores = (runtimeKey: string): void => {
  bootGeneration += 1;
  inFlight = null;
  publish({});
  for (const entry of SERVER_STATE_BOOT_ENTRIES) {
    try {
      entry.reset(runtimeKey);
    } catch (error) {
      console.warn(`[server-state-boot] ${entry.id} could not be reset:`, error);
    }
    phaseOf(entry.id, 'unknown');
  }
};

/**
 * The control stream's share of the registry: every connection reads the
 * policy again (a change made during a gap was never announced here), and so
 * does the host's announcement that it follows a space's modes again. The
 * policy broadcast itself is applied here too, since the store is the one place
 * a mode lives.
 *
 * The endpoint is read at event time, not captured at install time. A surface
 * that is not remounted on an instance switch (the phone: only `SyncProvider`
 * is keyed by the endpoint epoch, and the native shell mounts no auth gate)
 * would otherwise drop every event forever after the switch, because the
 * captured key no longer matches.
 */
export const installServerStateBootEvents = (): (() => void) => {
  const readSpaceModes = (spaceIds: Iterable<string>, onlyNew = false) => {
    for (const spaceId of spaceIds) {
      if (onlyNew && readSpaceIds.has(spaceId)) continue;
      readSpaceIds.add(spaceId);
      void usePermissionStore.getState().refreshSpaceModes(spaceId).then((done) => {
        if (!done) readSpaceIds.delete(spaceId);
      });
    }
  };
  const readSpaceIds = new Set<string>();
  readSpaceModes(useSpacesStore.getState().spaces.keys(), true);
  const unsubscribeSpaces = useSpacesStore.subscribe((state, previous) => {
    if (state.spaces !== previous.spaces) readSpaceModes(state.spaces.keys(), true);
  });
  const unsubscribeEvents = subscribeOpenchamberEvents((event) => {
    if (event.type === 'event-stream-ready') {
      void bootServerStateStores();
      readSpaceModes(useSpacesStore.getState().spaces.keys());
      return;
    }
    if (event.type === 'space-permission-stream') {
      readSpaceIds.delete(event.spaceId);
      readSpaceModes([event.spaceId]);
      return;
    }
    if (event.type === 'permission-policy') applyPermissionPolicy(event.event);
  });
  return () => {
    unsubscribeSpaces();
    unsubscribeEvents();
  };
};

/** A mode change announced by any window, applied through the same gate as a read. */
const applyPermissionPolicy = (event: PermissionPolicySyncEvent): void => {
  if (event.type !== 'openchamber:permission-auto-accept.updated') return;
  usePermissionStore.getState().applySnapshot(policySnapshotFromWire(event.properties));
};
