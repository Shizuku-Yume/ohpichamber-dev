import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { Message, Part } from '@openchamber/agent-contract'
import { subscribeDirectorySessionMessages } from './child-store'
import { useDirectoryStore, useDirectorySync } from './directory-sync-hooks'
import { getSessionMaterializationStatus } from './materialization'
import { buildUserMessageHistorySnapshot, EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT, type TranscriptPrompt } from './user-message-history'
import type { State } from './types'

const EMPTY_MESSAGES: Message[] = []
const EMPTY_PART_MAP: Record<string, Part[]> = {}

export function useSessionMessages(sessionId: string, directory?: string): Message[] {
  const store = useDirectoryStore(directory)
  return useSyncExternalStore(useCallback((notify) => subscribeDirectorySessionMessages(store, sessionId, notify), [store, sessionId]), useCallback(() => store.getState().message[sessionId] ?? EMPTY_MESSAGES, [store, sessionId]), () => EMPTY_MESSAGES)
}
export function useSessionMessagesSelector<T>(sessionId: string, directory: string | undefined, select: (messages: Message[], state: State) => T, isEqual: (left: T, right: T) => boolean = Object.is): T {
  const store = useDirectoryStore(directory)
  const cache = useRef<{ value: T } | null>(null)
  const get = useCallback(() => { const state = store.getState(); const value = select(state.message[sessionId] ?? EMPTY_MESSAGES, state); if (!cache.current || !isEqual(cache.current.value, value)) cache.current = { value }; return cache.current.value }, [store, sessionId, select, isEqual])
  return useSyncExternalStore(useCallback((notify) => subscribeDirectorySessionMessages(store, sessionId, notify), [store, sessionId]), get, get)
}
export function useSessionRenderable(sessionId: string, directory?: string): boolean { return useSessionMessagesSelector(sessionId, directory, (_messages, state) => getSessionMaterializationStatus(state, sessionId).renderable) }
export function useUserMessageHistory(sessionId: string, directory?: string): TranscriptPrompt[] {
  const store = useDirectoryStore(directory)
  const cache = useRef(EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT)
  const get = useCallback(() => { cache.current = buildUserMessageHistorySnapshot(store.getState(), sessionId, cache.current); return cache.current.history }, [store, sessionId])
  return useSyncExternalStore(useCallback((notify) => subscribeDirectorySessionMessages(store, sessionId, notify), [store, sessionId]), get, get)
}
/** Inline parts selector; the canonical store never carries a split part map. */
export function useSessionPartsForMessages(sessionId: string, messageIds: readonly string[], directory?: string): Record<string, Part[]> {
  const store = useDirectoryStore(directory)
  const cache = useRef<Record<string, Part[]>>(EMPTY_PART_MAP)
  const get = useCallback(() => {
    const wanted = new Set(messageIds)
    const next: Record<string, Part[]> = {}
    for (const message of store.getState().message[sessionId] ?? EMPTY_MESSAGES) if (wanted.has(message.messageId)) next[message.messageId] = message.parts
    const previous = cache.current
    if (Object.keys(previous).length !== Object.keys(next).length || Object.keys(next).some((id) => next[id] !== previous[id])) cache.current = next
    return cache.current
  }, [store, sessionId, messageIds])
  return useSyncExternalStore(useCallback((notify) => subscribeDirectorySessionMessages(store, sessionId, (change) => { if (change.reset || change.messagesChanged || change.partMessageIds.some((id) => messageIds.includes(id))) notify() }), [store, sessionId, messageIds]), get, get)
}

export function useSessionMessagesResolved(sessionId: string, directory?: string): boolean {
  return useDirectorySync(useCallback((state: State) => Boolean(sessionId && Object.hasOwn(state.message, sessionId)), [sessionId]), directory)
}
