import type { Session } from '@openchamber/agent-contract';
import { canonicalClient, type SessionList } from '@/api/canonicalClient';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { isSessionDiscoveryFailed, resolveWorkspaceDirectory } from '@/stores/globalSessions';
import { applyGlobalSessionStatusSnapshot, useGlobalSessionStatusStore } from './global-session-status';
import { seedGlobalBlockingRequests } from './global-blocking-requests';

// All retained surfaces use the active Host's canonical discovery. This seed is
// additive, never proof that a missing session settled, and never a live event.
//
// No age window: `session.updatedAt` is the native transcript file's mtime, and
// comparing it with this client's `Date.now()` measured clock skew and timezone
// between two machines, not staleness. A running session the Host still lists is
// running; the live stream corrects it if it is not.
type SeedDependencies = {
  isKnown: (sessionId: string) => boolean;
  resolveDirectory: (workspaceId: string) => string | null;
};

/** Keep native activity only for readable, admitted, unobserved owners. */
export const buildHostStatusSeedSnapshots = (
  listed: SessionList,
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

type SeedRequest = { runtimeKey: string; stale: boolean; promise: Promise<void> };
let inFlight: SeedRequest | null = null;
const isKnown = (sessionId: string): boolean => {
  const state = useGlobalSessionStatusStore.getState();
  return state.statusById.has(sessionId) || state.observedById.has(sessionId);
};

/** Coalesce only current-runtime requests; failure and absence preserve activity. */
export const seedGlobalSessionStatusFromHost = (): Promise<void> => {
  const runtimeKey = getRuntimeKey();
  if (inFlight && !inFlight.stale && inFlight.runtimeKey === runtimeKey) return inFlight.promise;
  const request: SeedRequest = { runtimeKey, stale: false, promise: Promise.resolve() };
  const unsubscribe = subscribeRuntimeEndpointWillChange((detail) => {
    if (detail.runtimeKey !== runtimeKey) request.stale = true;
  });
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
};
