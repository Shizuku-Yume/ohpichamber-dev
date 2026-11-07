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

function withWorkbenchViewedAt(
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

/** Idle stamps being recorded right now, so repeated calls send one request. */
const pendingViews = new Map<string, number>();

/**
 * Records that the user saw the session's last turn. The local record takes
 * the watermark at once, so the mark clears without waiting for the round
 * trip; a failed write restores it, unless something newer replaced it.
 */
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
