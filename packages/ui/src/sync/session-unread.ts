<<<<<<< HEAD
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
||||||| bc50ba56aa
// ---------------------------------------------------------------------------
// Unread sessions: a turn that finished and nobody has looked at yet.
//
// OpenCode owns the state. Its session record carries `time.idle`, when the
// last turn ended, and `time.viewed`, a monotone watermark of the last idle
// transition a viewer saw. A session is unread while the turn that ended last
// is newer than the watermark. Because the record lives in OpenCode's database
// the mark survives restarts, and every client of the server sees the same one:
// a view recorded on the phone clears it on the desktop through the
// `session.viewed` event.
// ---------------------------------------------------------------------------
=======
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
import { useCallback } from "react"
import { compact, type Session } from "@/lib/opencode/model"
import { opencodeClient } from "@/lib/opencode/client"
import { getRuntimeKey } from "@/lib/runtime-switch"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
=======
import { useCallback } from "react"
import { z } from "zod"
import { compact, type Metadata, type Session } from "@/lib/opencode/model"
import { opencodeClient } from "@/lib/opencode/client"
import { getRuntimeKey } from "@/lib/runtime-switch"
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { requestSessionMetadataUpdate } from "./session-archive-batch"
>>>>>>> upstream/main

<<<<<<< HEAD
/**
 * Only top-level sessions are announced; a subtask reports to its parent. An
 * archived session is put away, whichever path archived it, so it is never
 * unread.
 */
export const isSessionUnread = (session: Session | undefined): boolean => (
 !!session && !session.parentSessionId && session.archivedAt === undefined && isUnreadTurn(session)
);
||||||| bc50ba56aa
/**
 * Only top-level sessions are announced; a subtask reports to its parent. An
 * archived session is put away, whichever path archived it, so it is never
 * unread.
 */
export const isSessionUnread = (session: Session | undefined): boolean => {
  if (!session || session.parentID || session.time.archived !== undefined) return false
  const { idle, viewed } = session.time
  return idle !== undefined && (viewed === undefined || viewed < idle)
}

/** Unread, and the turn that left it unread failed. */
export const isSessionUnreadWithError = (session: Session | undefined): boolean => (
  isSessionUnread(session) && session?.outcome === "failed"
)

export const useSessionUnread = (sessionId: string): boolean => (
  useGlobalSessionsStore(useCallback((state) => isSessionUnread(state.entityById.get(sessionId)), [sessionId]))
)

const hasUnreadSession = (state: { entityById: ReadonlyMap<string, Session> }): boolean => {
  for (const session of state.entityById.values()) {
    if (isSessionUnread(session)) return true
  }
  return false
}

/** Whether any session is unread; for a control that only matters while it is shown. */
export const useHasUnreadSession = (): boolean => useGlobalSessionsStore(hasUnreadSession)

/** Idle stamps being recorded right now, so repeated calls send one request. */
const pendingViews = new Map<string, number>()
=======
const markSchema = z.object({ openchamber: z.object({ markedUnread: z.object({ at: z.number() }) }) })
const openchamberSchema = z.object({ openchamber: z.record(z.string(), z.json()) })

const markByMetadata = new WeakMap<Metadata, number | null>()

const markOf = (session: Session): number | null => {
  const metadata = session.metadata
  if (!metadata) return null
  const cached = markByMetadata.get(metadata)
  if (cached !== undefined) return cached
  const at = markSchema.safeParse(metadata).data?.openchamber.markedUnread.at ?? null
  markByMetadata.set(metadata, at)
  return at
}

const hasUnreadMark = (session: Session): boolean => markOf(session) !== null

export const canSessionBeUnread = (session: Session | undefined): session is Session => (
  Boolean(session) && !session?.parentID && session?.time.archived === undefined
)

const hasUnseenTurn = (session: Session): boolean => {
  const { idle, viewed } = session.time
  return idle !== undefined && (viewed === undefined || viewed < idle)
}

export const isSessionUnread = (session: Session | undefined): boolean => (
  canSessionBeUnread(session) && (hasUnseenTurn(session) || hasUnreadMark(session))
)

export const isSessionMarkedUnread = (session: Session | undefined): boolean => (
  canSessionBeUnread(session) && hasUnreadMark(session)
)

export const isSessionUnreadWithError = (session: Session | undefined): boolean => (
  canSessionBeUnread(session) && hasUnseenTurn(session) && session.outcome === "failed"
)

export const useSessionUnread = (sessionId: string): boolean => (
  useGlobalSessionsStore(useCallback((state) => isSessionUnread(state.entityById.get(sessionId)), [sessionId]))
)

export const useSessionMarkedUnread = (sessionId: string): boolean => (
  useGlobalSessionsStore(useCallback((state) => isSessionMarkedUnread(state.entityById.get(sessionId)), [sessionId]))
)

const hasUnreadSession = (state: { entityById: ReadonlyMap<string, Session> }): boolean => {
  for (const session of state.entityById.values()) {
    if (isSessionUnread(session)) return true
  }
  return false
}

export const useHasUnreadSession = (): boolean => useGlobalSessionsStore(hasUnreadSession)

const pendingViews = new Map<string, number>()
>>>>>>> upstream/main

<<<<<<< HEAD
/**
 * The turn itself, whatever the session's place in a tree: a subtask's unread
 * mark rolls up to its parent, so the parent's badge needs it without the
 * top-level-only rule `isSessionUnread` applies.
 */
export const isUnreadTurn = (session: Session | null | undefined): boolean => {
 if (!session) return false;
 const workbench = session.metadata?.openchamber?.workbench;
 const legacyTime = 'time' in session && session.time && typeof session.time === 'object'
  ? (session.time as { idle?: number; viewed?: number })
  : undefined;
 const lastIdleAt = workbench?.lastIdleAt ?? legacyTime?.idle;
 const viewedAt = workbench?.viewedAt ?? legacyTime?.viewed;
 return lastIdleAt !== undefined && (viewedAt === undefined || viewedAt < lastIdleAt);
};
||||||| bc50ba56aa
/**
 * Records that the user saw these sessions' last turns. The local records take
 * the watermark at once, in one store update, so the marks clear without
 * waiting for the round trip; a failed write restores its session's mark,
 * unless something newer replaced it. Returns the sessions it marked.
 */
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
=======
const keptMarks = new Set<string>()

export const releaseKeptUnreadMarks = (): void => {
  keptMarks.clear()
}

const withMarkedUnread = (metadata: Metadata | undefined, at: number | null): Metadata => {
  const current = metadata ?? {}
  const namespace = { ...openchamberSchema.safeParse(current).data?.openchamber }
  if (at === null) delete namespace.markedUnread
  else namespace.markedUnread = { at }
  return { ...current, openchamber: namespace }
}

const setLocalMark = (sessionId: string, at: number | null): void => {
  const current = useGlobalSessionsStore.getState().entityById.get(sessionId)
  if (!current || markOf(current) === at) return
  useGlobalSessionsStore.getState().upsertSession({ ...current, metadata: withMarkedUnread(current.metadata, at) })
}

const markWrites = new Map<string, number>()
let lastMarkWrite = 0

const writeUnreadMark = async (session: Session, at: number | null): Promise<boolean> => {
  const runtimeKey = getRuntimeKey()
  const sessionId = session.id
  const previous = markOf(session)
  const write = ++lastMarkWrite
  markWrites.set(sessionId, write)
  setLocalMark(sessionId, at)

  const result = await requestSessionMetadataUpdate(
    sessionId,
    { openchamber: { markedUnread: at === null ? null : { at } } },
    resolveGlobalSessionDirectory(session),
  )
  const newest = markWrites.get(sessionId) === write
  if (newest) markWrites.delete(sessionId)
  if (runtimeKey !== getRuntimeKey()) return false
  if (result.outcome === "updated") {
    if (newest) setLocalMark(sessionId, at)
    return true
  }
  console.warn("[session-unread] failed to save the unread mark", result.reason)
  const current = useGlobalSessionsStore.getState().entityById.get(sessionId)
  if (newest && current && markOf(current) === at) {
    setLocalMark(sessionId, previous)
    if (at === null) keptMarks.add(sessionId)
  }
  return false
}

export const markSessionUnread = async (sessionId: string): Promise<boolean> => {
  const session = useGlobalSessionsStore.getState().entityById.get(sessionId)
  if (!canSessionBeUnread(session)) return false
  keptMarks.add(sessionId)
  if (hasUnreadMark(session)) return true
  return writeUnreadMark(session, Date.now())
}

type MarkSeenOptions = {
  explicit?: boolean
}

export const markSessionsUnreadSeen = (sessionIds: Iterable<string>, options: MarkSeenOptions = {}): string[] => {
  const store = useGlobalSessionsStore.getState()
  const runtimeKey = getRuntimeKey()
  const seen: Session[] = []
  const views: { session: Session; idle: number }[] = []
  const marks: Session[] = []
  for (const sessionId of sessionIds) {
    const session = store.entityById.get(sessionId)
    if (!canSessionBeUnread(session)) continue
    if (options.explicit) keptMarks.delete(sessionId)
    const clearsMark = hasUnreadMark(session) && !keptMarks.has(sessionId)
    const idle = session.time.idle
    const recordsView = hasUnseenTurn(session) && idle !== undefined && pendingViews.get(sessionId) !== idle
    if (!clearsMark && !recordsView) continue
    if (clearsMark) marks.push(session)
    if (recordsView) {
      pendingViews.set(sessionId, idle)
      views.push({ session, idle })
      seen.push({ ...session, time: { ...session.time, viewed: idle } })
    }
  }
  if (seen.length > 0) store.upsertSessions(seen)
>>>>>>> upstream/main

<<<<<<< HEAD
/** Unread, and the turn that left it unread failed. */
export const isSessionUnreadWithError = (session: Session | undefined): boolean => {
 if (!isSessionUnread(session)) return false;
 const workbench = session?.metadata?.openchamber?.workbench;
 const outcome = session && 'outcome' in session && typeof session.outcome === 'string'
  ? session.outcome
  : undefined;
 return workbench?.lastTurnOutcome === 'failed' || outcome === 'failed';
};
||||||| bc50ba56aa
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
=======
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
  for (const marked of marks) {
    const current = useGlobalSessionsStore.getState().entityById.get(marked.id) ?? marked
    void writeUnreadMark(current, null)
  }
  return [...new Set([...views.map(({ session }) => session.id), ...marks.map((session) => session.id)])]
}
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
export const markSessionUnreadSeen = (sessionId: string): void => {
  markSessionsUnreadSeen([sessionId])
}
=======
export const markSessionUnreadSeen = (sessionId: string, options?: MarkSeenOptions): void => {
  markSessionsUnreadSeen([sessionId], options)
}
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
/** Every unread session the client knows of. */
export const getUnreadSessionIds = (): string[] => {
  const ids: string[] = []
  for (const session of useGlobalSessionsStore.getState().entityById.values()) {
    if (isSessionUnread(session)) ids.push(session.id)
  }
  return ids
}
=======
export const getUnreadSessionIds = (): string[] => {
  const ids: string[] = []
  for (const session of useGlobalSessionsStore.getState().entityById.values()) {
    if (isSessionUnread(session)) ids.push(session.id)
  }
  return ids
}
>>>>>>> upstream/main
