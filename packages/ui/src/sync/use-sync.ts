import { useCallback, useMemo } from "react"
<<<<<<< HEAD
import type { Message } from "@openchamber/agent-contract"
import { getRuntimeKey } from "@/lib/runtime-switch"
import { useChildStoreManager, useSessionMessageLoader, useSyncDirectory, useSyncRuntime } from "./sync-context"
||||||| bc50ba56aa
import type { Message, Part } from "@/lib/opencode/model"
import { opencodeClient } from "@/lib/opencode/client"
import { Binary } from "./binary"
import { upsertSessionRecord } from "./session-records"
import { retry } from "./retry"
import {
  useChildStoreManager,
  useDirectoryStore,
  useSessionMessageLoader,
  useSyncDirectory,
  useSyncRuntime,
  resyncBlockingRequestsForDirectory,
  buildSessionMessageRecordsSnapshot,
  markRecordedInterruptedTurn,
} from "./sync-context"
import { stripSessionDiffSnapshots } from "./sanitize"
import { getSessionMaterializationStatus } from "./materialization"
import { getRuntimeKey } from "@/lib/runtime-switch"

// Shared across useSync() hook instances. Chat, model controls, and sidebar can
// all request the same session during startup; coalesce them into one HTTP load.
const syncSessionInflightByKey = new Map<string, Promise<void>>()

// Per-session generation counter. When a newer syncSession request starts for
// the same session, older in-flight requests become stale and must not write
// to the store. This prevents rapid session switches (e.g. 1→2→3 in the
// sidebar) from having each completed fetch fight for focus.
const syncSessionGenerationByKey = new Map<string, number>()

const isUserMessage = (message: Message): boolean => message.role === "user"

export function hasUserMessage(messages: Message[] | undefined): boolean {
  return Boolean(messages?.some(isUserMessage))
}

export function shouldFetchSessionForRenderableSync(input: {
  hasSession: boolean
  shouldLoadMessages: boolean
  force?: boolean
}): boolean {
  return Boolean(input.force) || !input.hasSession || input.shouldLoadMessages
}
=======
import type { Message, Part } from "@/lib/opencode/model"
import { opencodeClient } from "@/lib/opencode/client"
import { Binary } from "./binary"
import { upsertSessionRecord } from "./session-records"
import { adoptSessionMove } from "./session-actions"
import { resolveSessionReadDirectory, type SessionReadDirectorySources } from "./session-read-directory"
import { withAdmittedLineage } from "./session-admission"
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { retry } from "./retry"
import {
  useChildStoreManager,
  useDirectoryStore,
  useSessionMessageLoader,
  useSyncDirectory,
  useSyncRuntime,
  resyncBlockingRequestsForDirectory,
  buildSessionMessageRecordsSnapshot,
  markRecordedInterruptedTurn,
} from "./sync-context"
import { stripSessionDiffSnapshots } from "./sanitize"
import { getSessionMaterializationStatus } from "./materialization"
import { captureRuntimeInstance, getRuntimeKey } from "@/lib/runtime-switch"

const sessionReadDirectorySources: SessionReadDirectorySources = {
  knownDirectory: (sessionID) => {
    const record = useGlobalSessionsStore.getState().entityById.get(sessionID)
    return record ? withAdmittedLineage(sessionID, resolveGlobalSessionDirectory(record)) : null
  },
  readUnscoped: (sessionID) => opencodeClient.getSessionUnscoped(sessionID),
  adopt: adoptSessionMove,
}

const syncSessionInflightByKey = new Map<string, Promise<void>>()

const syncSessionGenerationByKey = new Map<string, number>()

const isUserMessage = (message: Message): boolean => message.role === "user"

export function hasUserMessage(messages: Message[] | undefined): boolean {
  return Boolean(messages?.some(isUserMessage))
}

export function shouldFetchSessionForRenderableSync(input: {
  hasSession: boolean
  shouldLoadMessages: boolean
  force?: boolean
}): boolean {
  return Boolean(input.force) || !input.hasSession || input.shouldLoadMessages
}
>>>>>>> upstream/main

function useSessionCacheTouch() {
  const { messageLoader, runtimeKey } = useSyncRuntime()
  return useCallback((sessionId: string, directory: string) => {
    if (getRuntimeKey() !== runtimeKey) return
    messageLoader.touchSessionCache({ directory, sessionId })
  }, [messageLoader, runtimeKey])
}

export function useSync() {
  const directory = useSyncDirectory()
  const childStores = useChildStoreManager()
  const messageLoader = useSessionMessageLoader()
  const { runtimeKey } = useSyncRuntime()
  const touch = useSessionCacheTouch()

<<<<<<< HEAD
  const recoverPendingQuestions = useCallback(async (sessionId: string, directoryOverride?: string): Promise<boolean> => {
    const targetDirectory = directoryOverride || directory
    if (!sessionId || !targetDirectory || getRuntimeKey() !== runtimeKey) return false
    await messageLoader.refresh({ directory: targetDirectory, sessionId })
    if (getRuntimeKey() !== runtimeKey) return false
    const targetStore = childStores.ensureChild(targetDirectory, { bootstrap: false })
    return (targetStore.getState().form[sessionId] ?? []).some((request) => request.status === "pending")
  }, [childStores, directory, messageLoader, runtimeKey])
||||||| bc50ba56aa
  const recoverPendingQuestions = useCallback(
    async (sessionID: string, directoryOverride?: string): Promise<boolean> => {
      const targetDirectory = directoryOverride || directory
      if (!sessionID || !targetDirectory || getRuntimeKey() !== runtimeKey) return false
      const targetStore = childStores.ensureChild(targetDirectory, {
        priority: "selected",
        reason: "selected-session",
      })
      await resyncBlockingRequestsForDirectory(targetDirectory, targetStore, [sessionID], {
        includePermissions: false,
      })
      if (getRuntimeKey() !== runtimeKey) return false
      return (targetStore.getState().form[sessionID]?.length ?? 0) > 0
    },
    [childStores, directory, runtimeKey],
  )
=======
  const recoverPendingQuestions = useCallback(
    async (sessionID: string, directoryOverride?: string): Promise<boolean> => {
      const selectedDirectory = directoryOverride || directory
      if (!sessionID || !selectedDirectory || getRuntimeKey() !== runtimeKey) return false
      const targetDirectory = await resolveSessionReadDirectory(sessionID, selectedDirectory, captureRuntimeInstance(), sessionReadDirectorySources)
      if (!targetDirectory) return false
      const targetStore = childStores.ensureChild(targetDirectory, {
        priority: "selected",
        reason: "selected-session",
      })
      await resyncBlockingRequestsForDirectory(targetDirectory, targetStore, [sessionID], {
        includePermissions: false,
      })
      if (getRuntimeKey() !== runtimeKey) return false
      return (targetStore.getState().form[sessionID]?.length ?? 0) > 0
    },
    [childStores, directory, runtimeKey],
  )
>>>>>>> upstream/main

  const syncSession = useCallback(async (sessionId: string, force?: boolean, directoryOverride?: string) => {
    const targetDirectory = directoryOverride || directory
    if (!sessionId || !targetDirectory || getRuntimeKey() !== runtimeKey) return
    const target = { directory: targetDirectory, sessionId }
    touch(sessionId, targetDirectory)
    if (force) await messageLoader.refresh(target)
    else await messageLoader.ensure(target, { reason: "navigation" })
  }, [directory, messageLoader, runtimeKey, touch])

<<<<<<< HEAD
  const loadMore = useCallback(async (sessionId: string, targetDirectory: string) => {
    if (getRuntimeKey() !== runtimeKey) return
    touch(sessionId, targetDirectory)
    await messageLoader.loadOlder({ directory: targetDirectory, sessionId })
  }, [messageLoader, runtimeKey, touch])
||||||| bc50ba56aa
  // Sync a session (load if not cached)
  const syncSession = useCallback(
    async (sessionID: string, force?: boolean, directoryOverride?: string) => {
      if (getRuntimeKey() !== runtimeKey) return
      const targetDirectory = directoryOverride || directory
      touch(sessionID, targetDirectory)
      const key = keyFor(sessionID, targetDirectory)
=======
  const syncSession = useCallback(
    async (sessionID: string, force?: boolean, directoryOverride?: string) => {
      if (getRuntimeKey() !== runtimeKey) return
      const selectedDirectory = directoryOverride || directory
      if (!selectedDirectory) return
      const targetDirectory = await resolveSessionReadDirectory(sessionID, selectedDirectory, captureRuntimeInstance(), sessionReadDirectorySources)
      if (!targetDirectory) return
      touch(sessionID, targetDirectory)
      const key = keyFor(sessionID, targetDirectory)
>>>>>>> upstream/main

<<<<<<< HEAD
  const prefetchSession = useCallback(async (sessionId: string, targetDirectory: string) => {
    if (getRuntimeKey() !== runtimeKey) return
    await messageLoader.prefetch({ directory: targetDirectory, sessionId })
  }, [messageLoader, runtimeKey])
||||||| bc50ba56aa
      // Dedup inflight requests
      const existing = syncSessionInflightByKey.get(key)
      if (existing) return existing
=======
      const existing = syncSessionInflightByKey.get(key)
      if (existing) return existing
>>>>>>> upstream/main

<<<<<<< HEAD
  const hasMore = useCallback((sessionId: string, directoryOverride?: string) => {
    const state = messageLoader.getSnapshot({ directory: directoryOverride || directory, sessionId })
    return !state.complete && Boolean(state.cursor)
  }, [directory, messageLoader])
||||||| bc50ba56aa
      // This is a new request. Bump generation so any older request that
      // might still be finishing (e.g. from a previous component lifecycle)
      // knows it is stale and should not write to the store.
      const generation = (syncSessionGenerationByKey.get(key) ?? 0) + 1
      syncSessionGenerationByKey.set(key, generation)
=======
      const generation = (syncSessionGenerationByKey.get(key) ?? 0) + 1
      syncSessionGenerationByKey.set(key, generation)
>>>>>>> upstream/main

<<<<<<< HEAD
  const isLoading = useCallback((sessionId: string, directoryOverride?: string) => (
    messageLoader.getSnapshot({ directory: directoryOverride || directory, sessionId }).status === "loading"
  ), [directory, messageLoader])
||||||| bc50ba56aa
      const targetStore = targetDirectory === directory
        ? store
        : childStores.ensureChild(targetDirectory, { bootstrap: false })
      const isStale = () => getRuntimeKey() !== runtimeKey
        || syncSessionGenerationByKey.get(key) !== generation
        || childStores.children.get(targetDirectory) !== targetStore
      const current = targetStore.getState()
      const materialization = getSessionMaterializationStatus(current, sessionID)
      const cachedReady = materialization.hasMessages && materialization.renderable
      const hasSession = Binary.search(current.session, sessionID, (s) => s.id).found
      if (cachedReady && hasSession && !force) {
        if (!isStale()) markRecordedInterruptedTurn(targetStore, sessionID)
        // Renders from cache; a transcript a stream gap left unconfirmed
        // refreshes its tail in the background.
        messageLoader.revalidateIfStale({ directory: targetDirectory, sessionID })
        return
      }
      const shouldLoadMessages = Boolean(!cachedReady || force)
      const shouldFetchSession = shouldFetchSessionForRenderableSync({ hasSession, shouldLoadMessages, force: Boolean(force) })
      const promise = (async () => {
        await Promise.all([
          shouldFetchSession
            ? (async () => {
                try {
                  const session = await retry(() => opencodeClient.getSession(sessionID, targetDirectory))
                  if (!isStale()) {
                    const nextSession = stripSessionDiffSnapshots(session)
                    const s = targetStore.getState()
                    const sessions = upsertSessionRecord(s.session, nextSession)
                    if (sessions !== s.session && !isStale()) {
                      targetStore.setState({ session: sessions })
                    }
                  }
                } catch (e) {
                  console.error("[sync] failed to fetch session", sessionID, e)
                }
              })()
            : Promise.resolve(),
          shouldLoadMessages
            ? (async () => {
                await messageLoader.ensure(
                  { directory: targetDirectory, sessionID },
                  { force, reason: "reactive" },
                )
                if (!isStale()) {
                  markRecordedInterruptedTurn(targetStore, sessionID)
                }
              })()
            : Promise.resolve(),
        ])
      })()
=======
      const targetStore = targetDirectory === directory
        ? store
        : childStores.ensureChild(targetDirectory, { bootstrap: false })
      const isStale = () => getRuntimeKey() !== runtimeKey
        || syncSessionGenerationByKey.get(key) !== generation
        || childStores.children.get(targetDirectory) !== targetStore
      const current = targetStore.getState()
      const materialization = getSessionMaterializationStatus(current, sessionID, {
        historyCovered: messageLoader.coversHistory({ directory: targetDirectory, sessionID }),
      })
      const cachedReady = materialization.hasMessages && materialization.renderable
      const hasSession = Binary.search(current.session, sessionID, (s) => s.id).found
      if (cachedReady && hasSession && !force) {
        if (!isStale()) markRecordedInterruptedTurn(targetStore, sessionID)
        messageLoader.revalidateIfStale({ directory: targetDirectory, sessionID })
        return
      }
      const shouldLoadMessages = Boolean(!cachedReady || force)
      const shouldFetchSession = shouldFetchSessionForRenderableSync({ hasSession, shouldLoadMessages, force: Boolean(force) })
      const promise = (async () => {
        await Promise.all([
          shouldFetchSession
            ? (async () => {
                try {
                  const session = await retry(() => opencodeClient.getSession(sessionID, targetDirectory))
                  if (!isStale()) {
                    const nextSession = stripSessionDiffSnapshots(session)
                    const s = targetStore.getState()
                    const sessions = upsertSessionRecord(s.session, nextSession)
                    if (sessions !== s.session && !isStale()) {
                      targetStore.setState({ session: sessions })
                    }
                  }
                } catch (e) {
                  console.error("[sync] failed to fetch session", sessionID, e)
                }
              })()
            : Promise.resolve(),
          shouldLoadMessages
            ? (async () => {
                await messageLoader.ensure(
                  { directory: targetDirectory, sessionID },
                  { force, reason: "reactive" },
                )
                if (!isStale()) {
                  markRecordedInterruptedTurn(targetStore, sessionID)
                }
              })()
            : Promise.resolve(),
        ])
      })()
>>>>>>> upstream/main

  const isComplete = useCallback((sessionId: string, directoryOverride?: string) => (
    messageLoader.getSnapshot({ directory: directoryOverride || directory, sessionId }).complete
  ), [directory, messageLoader])

<<<<<<< HEAD
  const optimisticAdd = useCallback((input: { sessionId: string; directory?: string | null; message: Message }) => {
    if (getRuntimeKey() !== runtimeKey) return
    messageLoader.optimisticAdd({ directory: input.directory || directory, sessionId: input.sessionId, message: input.message })
  }, [directory, messageLoader, runtimeKey])
||||||| bc50ba56aa
  // Load more (pagination)
  const loadMore = useCallback(
    async (sessionID: string, targetDirectory: string) => {
      touch(sessionID, targetDirectory)
      await messageLoader.loadOlder({ directory: targetDirectory, sessionID })
    },
    [messageLoader, touch],
  )
=======
  const loadMore = useCallback(
    async (sessionID: string, targetDirectory: string) => {
      touch(sessionID, targetDirectory)
      await messageLoader.loadOlder({ directory: targetDirectory, sessionID })
    },
    [messageLoader, touch],
  )
>>>>>>> upstream/main

  const optimisticRemove = useCallback((input: { sessionId: string; directory?: string | null; messageId: string }) => {
    if (getRuntimeKey() !== runtimeKey) return
    messageLoader.optimisticRemove({ directory: input.directory || directory, sessionId: input.sessionId, messageId: input.messageId })
  }, [directory, messageLoader, runtimeKey])

  const optimisticConfirm = useCallback((input: { sessionId: string; directory?: string | null; messageId: string }) => {
    if (getRuntimeKey() !== runtimeKey) return
    messageLoader.optimisticConfirm({ directory: input.directory || directory, sessionId: input.sessionId, messageId: input.messageId })
  }, [directory, messageLoader, runtimeKey])

<<<<<<< HEAD
  return useMemo(() => ({
    ensureSessionRenderable: syncSession,
    syncSession,
    prefetchSession,
    loadMore,
    hasMore,
    isLoading,
    isComplete,
    recoverPendingQuestions,
    optimistic: { add: optimisticAdd, remove: optimisticRemove, confirm: optimisticConfirm },
  }), [syncSession, prefetchSession, loadMore, hasMore, isLoading, isComplete, recoverPendingQuestions, optimisticAdd, optimisticRemove, optimisticConfirm])
||||||| bc50ba56aa
  const isLoading = useCallback(
    (sessionID: string, directoryOverride?: string) => messageLoader
      .getSnapshot({ directory: directoryOverride || directory, sessionID }).status === "loading",
    [directory, messageLoader],
  )

  // True only when a fetch has positively confirmed the history is fully
  // loaded (no next cursor). Distinct from !hasMore(), which is also true for
  // sessions whose meta simply hasn't been populated yet.
  const isComplete = useCallback(
    (sessionID: string, directoryOverride?: string) => messageLoader
      .getSnapshot({ directory: directoryOverride || directory, sessionID }).complete,
    [directory, messageLoader],
  )

  // Optimistic add (for prompt submission)
  const optimisticAdd = useCallback(
    (input: { sessionID: string; directory?: string | null; message: Message; parts: Part[] }) => {
      messageLoader.optimisticAdd({
        directory: input.directory || directory,
        sessionID: input.sessionID,
        message: input.message,
        parts: input.parts,
      })
    },
    [directory, messageLoader],
  )

  // Optimistic remove (for rollback on error)
  const optimisticRemove = useCallback(
    (input: { sessionID: string; directory?: string | null; messageID: string }) => {
      messageLoader.optimisticRemove({
        directory: input.directory || directory,
        sessionID: input.sessionID,
        messageID: input.messageID,
      })
    },
    [directory, messageLoader],
  )

  const optimisticConfirm = useCallback(
    (input: { sessionID: string; directory?: string | null; messageID: string }) => {
      messageLoader.optimisticConfirm({
        directory: input.directory || directory,
        sessionID: input.sessionID,
        messageID: input.messageID,
      })
    },
    [directory, messageLoader],
  )

  return useMemo(
    () => ({
      ensureSessionRenderable: syncSession,
      syncSession,
      prefetchSession,
      loadMore,
      hasMore,
      isLoading,
      isComplete,
      recoverPendingQuestions,
      optimistic: {
        add: optimisticAdd,
        remove: optimisticRemove,
        confirm: optimisticConfirm,
      },
    }),
    [syncSession, prefetchSession, loadMore, hasMore, isLoading, isComplete, recoverPendingQuestions, optimisticAdd, optimisticRemove, optimisticConfirm],
  )
=======
  const isLoading = useCallback(
    (sessionID: string, directoryOverride?: string) => messageLoader
      .getSnapshot({ directory: directoryOverride || directory, sessionID }).status === "loading",
    [directory, messageLoader],
  )

  const isComplete = useCallback(
    (sessionID: string, directoryOverride?: string) => messageLoader
      .getSnapshot({ directory: directoryOverride || directory, sessionID }).complete,
    [directory, messageLoader],
  )

  const optimisticAdd = useCallback(
    (input: { sessionID: string; directory?: string | null; message: Message; parts: Part[] }) => {
      messageLoader.optimisticAdd({
        directory: input.directory || directory,
        sessionID: input.sessionID,
        message: input.message,
        parts: input.parts,
      })
    },
    [directory, messageLoader],
  )

  const optimisticRemove = useCallback(
    (input: { sessionID: string; directory?: string | null; messageID: string }) => {
      messageLoader.optimisticRemove({
        directory: input.directory || directory,
        sessionID: input.sessionID,
        messageID: input.messageID,
      })
    },
    [directory, messageLoader],
  )

  const optimisticConfirm = useCallback(
    (input: { sessionID: string; directory?: string | null; messageID: string }) => {
      messageLoader.optimisticConfirm({
        directory: input.directory || directory,
        sessionID: input.sessionID,
        messageID: input.messageID,
      })
    },
    [directory, messageLoader],
  )

  return useMemo(
    () => ({
      ensureSessionRenderable: syncSession,
      syncSession,
      prefetchSession,
      loadMore,
      hasMore,
      isLoading,
      isComplete,
      recoverPendingQuestions,
      optimistic: {
        add: optimisticAdd,
        remove: optimisticRemove,
        confirm: optimisticConfirm,
      },
    }),
    [syncSession, prefetchSession, loadMore, hasMore, isLoading, isComplete, recoverPendingQuestions, optimisticAdd, optimisticRemove, optimisticConfirm],
  )
>>>>>>> upstream/main
}

export function usePrefetchSessionMessages() {
  const { messageLoader, runtimeKey } = useSyncRuntime()
  return useCallback(async ({ directory, sessionId }: { directory: string; sessionId: string }) => {
    if (getRuntimeKey() !== runtimeKey) return
    await messageLoader.prefetch({ directory, sessionId })
  }, [messageLoader, runtimeKey])
}

export function useLoadedSessionMessageRecords() {
  const { childStores, runtimeKey } = useSyncRuntime()

  return useCallback(({ directory, sessionID }: { directory: string; sessionID: string }) => {
    if (getRuntimeKey() !== runtimeKey) return null
    const store = childStores.getChild(directory)
    return store ? buildSessionMessageRecordsSnapshot(store.getState(), sessionID).list : null
  }, [childStores, runtimeKey])
}

export function useSessionMessageRecordsForExport() {
  const { childStores, messageLoader, runtimeKey } = useSyncRuntime()
  const touch = useSessionCacheTouch()
  return useCallback(async ({ directory, sessionId }: { directory: string; sessionId: string }): Promise<Message[] | null> => {
    if (getRuntimeKey() !== runtimeKey) return null
    const store = childStores.ensureChild(directory, { bootstrap: false })
    const target = { directory, sessionId }
    touch(sessionId, directory)
    const release = messageLoader.retainSessionHistory(target)
    try {
      await messageLoader.loadComplete(target)
      if (getRuntimeKey() !== runtimeKey) return null
      return store.getState().message[sessionId] ?? []
    } finally {
      release()
    }
  }, [childStores, messageLoader, runtimeKey, touch])
}
