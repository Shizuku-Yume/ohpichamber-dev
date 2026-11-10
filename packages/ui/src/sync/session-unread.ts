// ---------------------------------------------------------------------------
// Unread sessions: a turn that finished and nobody has looked at yet.
//
// The Host owns the state. Its session record carries `workbench.lastIdleAt`,
// when the last turn ended, and `workbench.viewedAt`, a monotone watermark of
// the last idle transition a viewer saw. A session is unread while the turn that
// ended last is newer than the watermark. Because the record lives in Host
// metadata the mark survives restarts, and every client of the server sees the
// same one.
// ---------------------------------------------------------------------------

import { useCallback } from 'react';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { patchSessionMetadata } from './session-actions';

export function withWorkbenchViewedAt(
 metadata: SessionMetadata | null | undefined,
 lastIdleAt: number,
 viewedAt: number | undefined,
): SessionMetadata {
 const current = metadata ?? {};
 const currentOc = current.openchamber ?? {};
 const currentWb = currentOc.workbench ?? {};

 const nextWorkbench = {
  ...currentWb,
  lastIdleAt,
  ...(viewedAt !== undefined ? { viewedAt } : {}),
 };
 if (viewedAt === undefined) {
  delete nextWorkbench.viewedAt;
 }

 return {
  ...current,
  openchamber: {
   ...currentOc,
   workbench: nextWorkbench,
  },
 };
}

/**
 * Only top-level sessions are announced; a subtask reports to its parent. An
 * archived session is put away, whichever path archived it, so it is never
 * unread.
 */
export const isSessionUnread = (session: Session | undefined): boolean => {
 if (!session || session.parentSessionId || session.archivedAt !== undefined) return false;
 const workbench = session.metadata?.openchamber?.workbench;
 const legacyTime = 'time' in session && session.time && typeof session.time === 'object'
  ? (session.time as { idle?: number; viewed?: number })
  : undefined;
 const lastIdleAt = workbench?.lastIdleAt ?? legacyTime?.idle;
 const viewedAt = workbench?.viewedAt ?? legacyTime?.viewed;
 return lastIdleAt !== undefined && (viewedAt === undefined || viewedAt < lastIdleAt);
};

/** Unread, and the turn that left it unread failed. */
export const isSessionUnreadWithError = (session: Session | undefined): boolean => {
 if (!isSessionUnread(session)) return false;
 const workbench = session?.metadata?.openchamber?.workbench;
 const outcome = session && 'outcome' in session && typeof session.outcome === 'string'
  ? session.outcome
  : undefined;
 return workbench?.lastTurnOutcome === 'failed' || outcome === 'failed';
};

export const useSessionUnread = (sessionId: string): boolean => (
 useGlobalSessionsStore(useCallback((state) => isSessionUnread(state.entityById.get(sessionId)), [sessionId]))
);

const hasUnreadSession = (state: { entityById: ReadonlyMap<string, Session> }): boolean => {
  for (const session of state.entityById.values()) {
    if (isSessionUnread(session)) return true
  }
  return false
}

/** Whether any session is unread; for a control that only matters while it is shown. */
export const useHasUnreadSession = (): boolean => useGlobalSessionsStore(hasUnreadSession)

/** Idle stamps being recorded right now, so repeated calls send one request. */
const pendingViews = new Map<string, number>();

/**
 * Records that the user saw these sessions' last turns. The local records take
 * the watermark at once, in one store update, so the marks clear without
 * waiting for the round trip; a failed write restores its session's mark,
 * unless something newer replaced it. Returns the sessions it marked.
 */
<<<<<<< HEAD
export const markSessionUnreadSeen = (sessionId: string): void => {
 const store = useGlobalSessionsStore.getState();
 const session = store.entityById.get(sessionId);
 if (!session || !isSessionUnread(session)) return;
 const workbench = session.metadata?.openchamber?.workbench;
 const legacyTime = 'time' in session && session.time && typeof session.time === 'object'
  ? (session.time as { idle?: number; viewed?: number })
  : undefined;
 const lastIdleAt = workbench?.lastIdleAt ?? legacyTime?.idle;
 if (lastIdleAt === undefined || pendingViews.get(sessionId) === lastIdleAt) return;

 const previousViewed = workbench?.viewedAt ?? legacyTime?.viewed;
 const runtimeKey = getRuntimeKey();
 pendingViews.set(sessionId, lastIdleAt);

 const updatedSession: Session = {
  ...session,
  metadata: withWorkbenchViewedAt(session.metadata, lastIdleAt, lastIdleAt),
 };
 store.upsertSession(updatedSession);

 const directory = resolveGlobalSessionDirectory(session) ?? (session as { directory?: string }).directory;
 void patchSessionMetadata(
  sessionId,
  directory,
  (metadata) => withWorkbenchViewedAt(metadata, lastIdleAt, lastIdleAt),
  runtimeKey,
 )
  .catch((error) => {
   console.warn('[session-unread] failed to record a view', error);
   if (runtimeKey !== getRuntimeKey()) return;
   const current = useGlobalSessionsStore.getState().entityById.get(sessionId);
   if (!current) return;
   const currentWb = current.metadata?.openchamber?.workbench;
   const currentLegacyTime = 'time' in current && current.time && typeof current.time === 'object'
    ? (current.time as { viewed?: number })
    : undefined;
   const currentViewed = currentWb?.viewedAt ?? currentLegacyTime?.viewed;
   if (currentViewed !== lastIdleAt) return;

   const rollbackSession: Session = {
    ...current,
    metadata: withWorkbenchViewedAt(current.metadata, lastIdleAt, previousViewed),
   };
   useGlobalSessionsStore.getState().upsertSession(rollbackSession);
  })
  .finally(() => {
   if (pendingViews.get(sessionId) === lastIdleAt) pendingViews.delete(sessionId);
  });
};
=======
export const markSessionsUnreadSeen = (sessionIds: Iterable<string>): string[] => {
  const store = useGlobalSessionsStore.getState()
  const runtimeKey = getRuntimeKey()
  const seen: Session[] = []
  const views: { session: Session; idle: number }[] = []
  for (const sessionId of sessionIds) {
    const session = store.entityById.get(sessionId)
    if (!session || !isSessionUnread(session)) continue
    const idle = session.time.idle
    if (idle === undefined || pendingViews.get(sessionId) === idle) continue
    pendingViews.set(sessionId, idle)
    views.push({ session, idle })
    seen.push({ ...session, time: { ...session.time, viewed: idle } })
  }
  if (seen.length === 0) return []
  store.upsertSessions(seen)

  for (const { session, idle } of views) {
    const sessionId = session.id
    void opencodeClient.viewSession(sessionId, idle, session.directory)
      .catch((error) => {
        console.warn("[session-unread] failed to record a view", error)
        if (runtimeKey !== getRuntimeKey()) return
        const current = useGlobalSessionsStore.getState().entityById.get(sessionId)
        if (current?.time.viewed !== idle) return
        useGlobalSessionsStore.getState().upsertSession({
          ...current,
          time: compact({ ...current.time, viewed: session.time.viewed }),
        })
      })
      .finally(() => {
        if (pendingViews.get(sessionId) === idle) pendingViews.delete(sessionId)
      })
  }
  return seen.map((session) => session.id)
}

export const markSessionUnreadSeen = (sessionId: string): void => {
  markSessionsUnreadSeen([sessionId])
}

/** Every unread session the client knows of. */
export const getUnreadSessionIds = (): string[] => {
  const ids: string[] = []
  for (const session of useGlobalSessionsStore.getState().entityById.values()) {
    if (isSessionUnread(session)) ids.push(session.id)
  }
  return ids
}
>>>>>>> bc50ba56a
