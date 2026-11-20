


import { useCallback } from 'react';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
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
  lastIdleAt: Math.max(currentWb.lastIdleAt ?? 0, lastIdleAt),
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
export const isSessionUnread = (session: Session | undefined): boolean => (
 !!session && !session.parentSessionId && session.archivedAt === undefined && isUnreadTurn(session)
);

/**
 * The turn itself, whatever the session's place in a tree: a subtask's unread
 * mark rolls up to its parent, so the parent's badge needs it without the
 * top-level-only rule `isSessionUnread` applies.
 */
export const isUnreadTurn = (session: Session | null | undefined): boolean => {
 if (!session) return false;
 const workbench = session.metadata?.openchamber?.workbench;
 const lastIdleAt = workbench?.lastIdleAt;
 const viewedAt = workbench?.viewedAt;
 return lastIdleAt !== undefined && (viewedAt === undefined || viewedAt < lastIdleAt);
};

/** Unread, and the turn that left it unread failed. */
export const isSessionUnreadWithError = (session: Session | undefined): boolean => {
 if (!isSessionUnread(session)) return false;
 const workbench = session?.metadata?.openchamber?.workbench;
 return workbench?.lastTurnOutcome === 'failed';
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
export const markSessionUnreadSeen = (sessionId: string, options?: { explicit?: boolean }): void => {
 const store = useGlobalSessionsStore.getState();
 const session = store.entityById.get(sessionId);
 if (!session || !isSessionUnread(session)) return;
 const runtimeKey = getRuntimeKey();
 const key = `${runtimeKey}\n${sessionId}`;
 if (options?.explicit) keptMarks.delete(key);
 if (keptMarks.has(key)) return;
 const workbench = session.metadata?.openchamber?.workbench;
 const lastIdleAt = workbench?.lastIdleAt;
 if (lastIdleAt === undefined || pendingViews.get(key) === lastIdleAt) return;

 const previousViewed = workbench?.viewedAt;
 pendingViews.set(key, lastIdleAt);

 const updatedSession: Session = {
  ...session,
  metadata: withWorkbenchViewedAt(session.metadata, lastIdleAt, lastIdleAt),
 };
 store.upsertSession(updatedSession);

 const directory = resolveGlobalSessionDirectory(session);
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
   const currentViewed = currentWb?.viewedAt;
   if (currentViewed !== lastIdleAt) return;

   const rollbackSession: Session = {
    ...current,
    metadata: withWorkbenchViewedAt(current.metadata, lastIdleAt, previousViewed),
   };
   useGlobalSessionsStore.getState().upsertSession(rollbackSession);
  })
  .finally(() => {
   if (pendingViews.get(key) === lastIdleAt) pendingViews.delete(key);
  });
};

export const canSessionBeUnread = (session: Session | undefined): session is Session => (
  Boolean(session) && !session?.parentSessionId && session?.archivedAt === undefined
)

const keptMarks = new Set<string>()

const pendingMarks = new Map<string, Promise<boolean>>()

subscribeRuntimeEndpointWillChange(() => {
  keptMarks.clear()
  pendingViews.clear()
  pendingMarks.clear()
})

export const markSessionUnread = (sessionId: string): Promise<boolean> => {
  const runtimeKey = getRuntimeKey()
  const key = `${runtimeKey}\n${sessionId}`
  const pending = pendingMarks.get(key)
  if (pending) return pending
  const store = useGlobalSessionsStore.getState()
  const session = store.entityById.get(sessionId)
  if (!canSessionBeUnread(session)) return Promise.resolve(false)
  const previousViewed = session.metadata?.openchamber?.workbench?.viewedAt
  const lastIdleAt = session.metadata?.openchamber?.workbench?.lastIdleAt ?? session.updatedAt
  keptMarks.add(key)
  store.upsertSession({ ...session, metadata: withWorkbenchViewedAt(session.metadata, lastIdleAt, undefined) })
  const request = patchSessionMetadata(
    sessionId,
    resolveGlobalSessionDirectory(session),
    (metadata) => withWorkbenchViewedAt(metadata, lastIdleAt, undefined),
    runtimeKey,
  ).then((result) => result !== null && runtimeKey === getRuntimeKey()).catch((error) => {
    console.warn('[session-unread] failed to mark unread', error)
    if (runtimeKey !== getRuntimeKey()) return false
    keptMarks.delete(key)
    const current = useGlobalSessionsStore.getState().entityById.get(sessionId)
    const workbench = current?.metadata?.openchamber?.workbench
    if (current && workbench?.lastIdleAt === lastIdleAt && workbench.viewedAt === undefined) {
      useGlobalSessionsStore.getState().upsertSession({
        ...current,
        metadata: withWorkbenchViewedAt(current.metadata, lastIdleAt, previousViewed),
      })
    }
    return false
  }).finally(() => { if (pendingMarks.get(key) === request) pendingMarks.delete(key) })
  pendingMarks.set(key, request)
  return request
}

export const releaseKeptUnreadMarks = (): void => {
  keptMarks.clear()
}
