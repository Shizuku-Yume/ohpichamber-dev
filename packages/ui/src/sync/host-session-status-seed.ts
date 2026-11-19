<<<<<<< HEAD
import type { Session } from '@openchamber/agent-contract';
import { canonicalClient, type SessionList } from '@/api/canonicalClient';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { isSessionDiscoveryFailed, resolveWorkspaceDirectory } from '@/stores/globalSessions';
import { applyGlobalSessionStatusSnapshot, useGlobalSessionStatusStore } from './global-session-status';
import { seedGlobalBlockingRequests } from './global-blocking-requests';
||||||| bc50ba56aa
import { hostTurnStart, type SessionTurnStart, type SyncEvent } from '@/lib/opencode/events';
import { opencodeClient } from '@/lib/opencode/client';
import type { HostSessionStatusSnapshot } from '@/lib/opencode/session-status';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { applyGlobalSessionStatusEvents, hasBackgroundWork, useGlobalSessionStatusStore } from './global-session-status';
import { readHostBlockingRequestsSnapshot } from './global-blocking-requests';
import { applyHostTurnStarts, needsHostTurnStarts } from './session-activity-timing';
=======
import { hostTurnStart, type SessionTurnStart, type SyncEvent } from '@/lib/opencode/events';
import { opencodeClient } from '@/lib/opencode/client';
import type { HostSessionStatusSnapshot } from '@/lib/opencode/session-status';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { applyGlobalSessionStatusEvents, hasBackgroundWork, useGlobalSessionStatusStore } from './global-session-status';
import { readHostBlockingRequestsSnapshot } from './global-blocking-requests';
import { applyHostTurnStarts, needsHostTurnStarts } from './session-activity-timing';
import { seedSessionContextFromHost, sessionContextRevision } from './session-live-work';
>>>>>>> upstream/main

<<<<<<< HEAD
// All retained surfaces use the active Host's canonical discovery. This seed is
// additive, never proof that a missing session settled, and never a live event.
//
// No age window: `session.updatedAt` is the native transcript file's mtime, and
// comparing it with this client's `Date.now()` measured clock skew and timezone
// between two machines, not staleness. A running session the Host still lists is
// running; the live stream corrects it if it is not.
||||||| bc50ba56aa
// Seeds the cross-directory status index from the host's own map.
//
// Directory bootstrap only runs for the directory the user is working in, so a
// turn that was already running in another project when this client started
// is invisible to the event stream until its next status event. The OpenChamber
// host (web server, or the VS Code extension host) has been listening to the
// single upstream stream the whole time and answers `/api/sessions/status` in
// one request without creating OpenCode instances.
//
// The seed is strictly additive: it only adds busy entries for sessions this
// client has not observed itself. Absence from the host map never clears
// anything, because the map has no directory and a missing entry proves
// nothing about a session the client already knows to be running. A live event
// that arrives before the seed wins, since the event path records every
// observed session and the seed skips those.

// Nothing on the host reconciles its map against OpenCode after a stream gap,
// so a missed idle can leave `busy` there for the host's 24-hour retention.
// A running turn refreshes its entry at every agent-loop step; an entry older
// than this is not trusted as current activity. A genuinely long tool call
// past this age simply waits for its next event instead of being seeded.
export const HOST_STATUS_SEED_MAX_AGE_MS = 30 * 60_000;

=======

export const HOST_STATUS_SEED_MAX_AGE_MS = 30 * 60_000;

>>>>>>> upstream/main
type SeedDependencies = {
  isKnown: (sessionId: string) => boolean;
  resolveDirectory: (workspaceId: string) => string | null;
};

<<<<<<< HEAD
/** Keep native activity only for readable, admitted, unobserved owners. */
export const buildHostStatusSeedSnapshots = (
  listed: SessionList,
||||||| bc50ba56aa
/**
 * Turns the host snapshot into per-directory `session.status` events for the
 * sessions the client has no live observation of. Retry collapses to busy:
 * the host keeps no attempt details, and the next live event restores them.
 */
export const buildHostStatusSeedEvents = (
  snapshot: HostSessionStatusSnapshot,
=======
export const buildHostStatusSeedEvents = (
  snapshot: HostSessionStatusSnapshot,
>>>>>>> upstream/main
  deps: SeedDependencies,
): Map<string, Session[]> => {
  const byDirectory = new Map<string, Session[]>();
  for (const session of listed.items) {
    if (session.runtimeStatus === 'idle' || session.runtimeStatus === 'unavailable') continue;
    if (session.archivedAt !== undefined || isSessionDiscoveryFailed(session, listed.errors)) continue;
    if (deps.isKnown(session.sessionId)) continue;
    const directory = deps.resolveDirectory(session.workspaceId);
    if (!directory) continue;
    const sessions = byDirectory.get(directory) ?? [];
    sessions.push(session);
    byDirectory.set(directory, sessions);
  }
  return byDirectory;
};

<<<<<<< HEAD
type SeedRequest = { runtimeKey: string; stale: boolean; promise: Promise<void> };
let inFlight: SeedRequest | null = null;
const isKnown = (sessionId: string): boolean => {
  const state = useGlobalSessionStatusStore.getState();
  return state.statusById.has(sessionId) || state.observedById.has(sessionId);
||||||| bc50ba56aa
/**
 * The host's turn starts, moved onto this device's clock. A busy entry's start
 * is its running turn's. An idle entry's is its last turn's, which counts only
 * while this device holds that turn open for background work (`isHeldHere`); otherwise the turn is over, or a newer one began that the
 * host map has not caught up with.
 */
export const buildHostTurnStarts = (
  snapshot: HostSessionStatusSnapshot,
  isHeldHere: (sessionId: string) => boolean,
): Map<string, SessionTurnStart> => {
  const starts = new Map<string, SessionTurnStart>();
  for (const [sessionId, entry] of Object.entries(snapshot.sessions)) {
    if (entry.turnStartedAt === undefined) continue;
    const running = entry.status === 'busy' || entry.status === 'retry';
    if (!running && !isHeldHere(sessionId)) continue;
    starts.set(sessionId, hostTurnStart(entry.turnStartedAt, snapshot.serverTime));
  }
  return starts;
=======
export const buildHostTurnStarts = (
  snapshot: HostSessionStatusSnapshot,
  isHeldHere: (sessionId: string) => boolean,
): Map<string, SessionTurnStart> => {
  const starts = new Map<string, SessionTurnStart>();
  for (const [sessionId, entry] of Object.entries(snapshot.sessions)) {
    if (entry.turnStartedAt === undefined) continue;
    const running = entry.status === 'busy' || entry.status === 'retry';
    if (!running && !isHeldHere(sessionId)) continue;
    starts.set(sessionId, hostTurnStart(entry.turnStartedAt, snapshot.serverTime));
  }
  return starts;
>>>>>>> upstream/main
};

<<<<<<< HEAD
/** Coalesce only current-runtime requests; failure and absence preserve activity. */
||||||| bc50ba56aa
/** Idle here, with background work keeping its turn open. */
const isHeldHere = (sessionId: string, activeSessionIds: ReadonlySet<string>): boolean => (
  !activeSessionIds.has(sessionId) && hasBackgroundWork(sessionId, activeSessionIds)
);

let inFlight: Promise<void> | null = null;

/** Fetches the host map once and seeds unobserved busy sessions. Coalesces overlapping calls. */
=======
const isHeldHere = (sessionId: string, activeSessionIds: ReadonlySet<string>): boolean => (
  !activeSessionIds.has(sessionId) && hasBackgroundWork(sessionId, activeSessionIds)
);

let inFlight: Promise<void> | null = null;

>>>>>>> upstream/main
export const seedGlobalSessionStatusFromHost = (): Promise<void> => {
  const runtimeKey = getRuntimeKey();
<<<<<<< HEAD
  if (inFlight && !inFlight.stale && inFlight.runtimeKey === runtimeKey) return inFlight.promise;
  const request: SeedRequest = { runtimeKey, stale: false, promise: Promise.resolve() };
  const unsubscribe = subscribeRuntimeEndpointWillChange((detail) => {
    if (detail.runtimeKey !== runtimeKey) request.stale = true;
||||||| bc50ba56aa
  const requestedAt = Date.now();
  inFlight = (async () => {
    const snapshot = await readHostBlockingRequestsSnapshot(async () => {
      const response = await opencodeClient.getHostSessionStatusSnapshot();
      return getRuntimeKey() === runtimeKey ? response : null;
    }, (sessionId) => {
      const session = useGlobalSessionsStore.getState().entityById.get(sessionId);
      return session ? resolveGlobalSessionDirectory(session) : null;
    });
    // A runtime switch between request and response clears the index; the old
    // host's sessions must not be written into the new one.
    if (!snapshot || getRuntimeKey() !== runtimeKey) return;
    // Turns that begin from here on, the statuses below included, are newer than the map.
    const answeredAt = Date.now();
    const status = useGlobalSessionStatusStore.getState();
    const entities = useGlobalSessionsStore.getState().entityById;
    const events = buildHostStatusSeedEvents(snapshot, {
      isKnown: (sessionId) => status.statusById.has(sessionId) || status.observedById.has(sessionId),
      resolveDirectory: (sessionId) => {
        const session = entities.get(sessionId);
        return session ? resolveGlobalSessionDirectory(session) : null;
      },
    });
    for (const [directory, payloads] of events) {
      applyGlobalSessionStatusEvents(directory, payloads);
    }
    // After the statuses: a session seeded busy just now is in its turn here.
    const { activeSessionIds } = useGlobalSessionStatusStore.getState();
    const held = new Set(Object.keys(snapshot.sessions).filter((sessionId) => isHeldHere(sessionId, activeSessionIds)));
    applyHostTurnStarts(buildHostTurnStarts(snapshot, (sessionId) => held.has(sessionId)), held, { requestedAt, answeredAt });
  })().finally(() => {
    inFlight = null;
=======
  const requestedAt = Date.now();
  const contextSince = sessionContextRevision();
  inFlight = (async () => {
    const snapshot = await readHostBlockingRequestsSnapshot(async () => {
      const response = await opencodeClient.getHostSessionStatusSnapshot();
      return getRuntimeKey() === runtimeKey ? response : null;
    }, (sessionId) => {
      const session = useGlobalSessionsStore.getState().entityById.get(sessionId);
      return session ? resolveGlobalSessionDirectory(session) : null;
    });
    if (!snapshot || getRuntimeKey() !== runtimeKey) return;
    const answeredAt = Date.now();
    const status = useGlobalSessionStatusStore.getState();
    const entities = useGlobalSessionsStore.getState().entityById;
    const events = buildHostStatusSeedEvents(snapshot, {
      isKnown: (sessionId) => status.statusById.has(sessionId) || status.observedById.has(sessionId),
      resolveDirectory: (sessionId) => {
        const session = entities.get(sessionId);
        return session ? resolveGlobalSessionDirectory(session) : null;
      },
    });
    for (const [directory, payloads] of events) {
      applyGlobalSessionStatusEvents(directory, payloads);
    }
    const { activeSessionIds } = useGlobalSessionStatusStore.getState();
    const held = new Set(Object.keys(snapshot.sessions).filter((sessionId) => isHeldHere(sessionId, activeSessionIds)));
    applyHostTurnStarts(buildHostTurnStarts(snapshot, (sessionId) => held.has(sessionId)), held, { requestedAt, answeredAt });
    if (snapshot.context) seedSessionContextFromHost(new Map(Object.entries(snapshot.context)), contextSince);
  })().finally(() => {
    inFlight = null;
>>>>>>> upstream/main
  });
<<<<<<< HEAD
  const isCurrent = () => !request.stale && getRuntimeKey() === runtimeKey;
  request.promise = (async () => {
    let listed: SessionList;
    try { listed = await canonicalClient.listSessions(); } catch { return; }
    if (!isCurrent()) return;
    const seeds = buildHostStatusSeedSnapshots(listed, { isKnown, resolveDirectory: resolveWorkspaceDirectory });
    const pending: Promise<void>[] = [];
    for (const [directory, sessions] of seeds) {
      for (const session of sessions) {
        if (!isCurrent()) return;
        if (isKnown(session.sessionId) || resolveWorkspaceDirectory(session.workspaceId) !== directory) continue;
        // Read authority before the write below marks this session observed;
        // otherwise the seed always looks redundant and never loads blockers.
        const alreadyObserved = useGlobalSessionStatusStore.getState().observedById.has(session.sessionId);
        applyGlobalSessionStatusSnapshot(directory, { [session.sessionId]: session.runtimeStatus }, [session.sessionId], { [session.sessionId]: session.activeRunId });
        if (session.runtimeStatus !== 'awaiting_approval' && session.runtimeStatus !== 'awaiting_input') continue;
        pending.push((async () => {
          try {
            const snapshot = await canonicalClient.getSnapshot(session.sessionId);
            if (!isCurrent() || resolveWorkspaceDirectory(session.workspaceId) !== directory) return;
            if (snapshot.session.sessionId !== session.sessionId || snapshot.session.workspaceId !== session.workspaceId || snapshot.session.epoch !== session.epoch) return;
            if (alreadyObserved) return;
            seedGlobalBlockingRequests([{
              sessionId: session.sessionId, directory,
              permissions: snapshot.approvals.filter((item) => item.epoch === snapshot.session.epoch),
              forms: snapshot.questions.filter((item) => item.epoch === snapshot.session.epoch),
            }]);
          } catch { /* A failed snapshot is not an empty pending set. */ }
        })());
      }
    }
    await Promise.all(pending);
  })().finally(() => {
    unsubscribe();
    if (inFlight === request) inFlight = null;
  });
  inFlight = request;
  return request.promise;
||||||| bc50ba56aa
  return inFlight;
};

// Long enough for the host's own status event, which carries the start of a
// turn this device just saw begin, to make the read unnecessary.
const TURN_START_REQUEST_DELAY_MS = 300;
let turnStartRequest: ReturnType<typeof setTimeout> | null = null;

/**
 * Asks the host for the turn starts this page lacks or stands in for. One
 * request after a short wait covers every session that asked meanwhile.
 */
export const requestHostTurnStarts = (): void => {
  if (turnStartRequest !== null) return;
  turnStartRequest = setTimeout(() => {
    turnStartRequest = null;
    if (needsHostTurnStarts()) void seedGlobalSessionStatusFromHost();
  }, TURN_START_REQUEST_DELAY_MS);
=======
  return inFlight;
};

const TURN_START_REQUEST_DELAY_MS = 300;
let turnStartRequest: ReturnType<typeof setTimeout> | null = null;

export const requestHostTurnStarts = (): void => {
  if (turnStartRequest !== null) return;
  turnStartRequest = setTimeout(() => {
    turnStartRequest = null;
    if (needsHostTurnStarts()) void seedGlobalSessionStatusFromHost();
  }, TURN_START_REQUEST_DELAY_MS);
>>>>>>> upstream/main
};
