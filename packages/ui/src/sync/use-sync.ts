import { useCallback, useMemo } from "react"
import type { Message } from "@openchamber/agent-contract"
import { getRuntimeKey } from "@/lib/runtime-switch"
import { useChildStoreManager, useSessionMessageLoader, useSyncDirectory, useSyncRuntime } from "./sync-context"

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

  const recoverPendingQuestions = useCallback(async (sessionId: string, directoryOverride?: string): Promise<boolean> => {
    const targetDirectory = directoryOverride || directory
    if (!sessionId || !targetDirectory || getRuntimeKey() !== runtimeKey) return false
    await messageLoader.refresh({ directory: targetDirectory, sessionId })
    if (getRuntimeKey() !== runtimeKey) return false
    const targetStore = childStores.ensureChild(targetDirectory, { bootstrap: false })
    return (targetStore.getState().form[sessionId] ?? []).some((request) => request.status === "pending")
  }, [childStores, directory, messageLoader, runtimeKey])

  const syncSession = useCallback(async (sessionId: string, force?: boolean, directoryOverride?: string) => {
    const targetDirectory = directoryOverride || directory
    if (!sessionId || !targetDirectory || getRuntimeKey() !== runtimeKey) return
    const target = { directory: targetDirectory, sessionId }
    touch(sessionId, targetDirectory)
    if (force) await messageLoader.refresh(target)
    else await messageLoader.ensure(target, { reason: "navigation" })
  }, [directory, messageLoader, runtimeKey, touch])

  const loadMore = useCallback(async (sessionId: string, targetDirectory: string) => {
    if (getRuntimeKey() !== runtimeKey) return
    touch(sessionId, targetDirectory)
    await messageLoader.loadOlder({ directory: targetDirectory, sessionId })
  }, [messageLoader, runtimeKey, touch])

  const prefetchSession = useCallback(async (sessionId: string, targetDirectory: string) => {
    if (getRuntimeKey() !== runtimeKey) return
    await messageLoader.prefetch({ directory: targetDirectory, sessionId })
  }, [messageLoader, runtimeKey])

  const hasMore = useCallback((sessionId: string, directoryOverride?: string) => {
    const state = messageLoader.getSnapshot({ directory: directoryOverride || directory, sessionId })
    return !state.complete && Boolean(state.cursor)
  }, [directory, messageLoader])

  const isLoading = useCallback((sessionId: string, directoryOverride?: string) => (
    messageLoader.getSnapshot({ directory: directoryOverride || directory, sessionId }).status === "loading"
  ), [directory, messageLoader])

  const isComplete = useCallback((sessionId: string, directoryOverride?: string) => (
    messageLoader.getSnapshot({ directory: directoryOverride || directory, sessionId }).complete
  ), [directory, messageLoader])

  const optimisticAdd = useCallback((input: { sessionId: string; directory?: string | null; message: Message }) => {
    if (getRuntimeKey() !== runtimeKey) return
    messageLoader.optimisticAdd({ directory: input.directory || directory, sessionId: input.sessionId, message: input.message })
  }, [directory, messageLoader, runtimeKey])

  const optimisticRemove = useCallback((input: { sessionId: string; directory?: string | null; messageId: string }) => {
    if (getRuntimeKey() !== runtimeKey) return
    messageLoader.optimisticRemove({ directory: input.directory || directory, sessionId: input.sessionId, messageId: input.messageId })
  }, [directory, messageLoader, runtimeKey])

  const optimisticConfirm = useCallback((input: { sessionId: string; directory?: string | null; messageId: string }) => {
    if (getRuntimeKey() !== runtimeKey) return
    messageLoader.optimisticConfirm({ directory: input.directory || directory, sessionId: input.sessionId, messageId: input.messageId })
  }, [directory, messageLoader, runtimeKey])

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
