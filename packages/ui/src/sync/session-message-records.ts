import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { Message } from '@openchamber/agent-contract'
import { subscribeDirectorySessionMessages } from './child-store'
import { useDirectoryStore } from './directory-sync-hooks'
import type { State } from './types'

const EMPTY_MESSAGES: Message[] = []

export type SessionMessageRecordsSnapshot = { sessionId: string; list: Message[]; byId: ReadonlyMap<string, Message> }
export function buildSessionMessageRecordsSnapshot(state: State, sessionId: string, previous?: SessionMessageRecordsSnapshot): SessionMessageRecordsSnapshot {
  const list = state.message[sessionId] ?? EMPTY_MESSAGES
  return previous?.sessionId === sessionId && previous.list === list ? previous : { sessionId, list, byId: new Map(list.map((message) => [message.messageId, message])) }
}
export function useSessionMessageRecords(sessionId: string, directory?: string, options?: { enabled?: boolean; suspendPartUpdates?: boolean; suspendPartUpdatesForMessageId?: string | null }): Message[] {
  const store = useDirectoryStore(directory)
  const cache = useRef<SessionMessageRecordsSnapshot>({ sessionId, list: EMPTY_MESSAGES, byId: new Map() })
  const get = useCallback(() => { if (options?.enabled === false) return cache.current.sessionId === sessionId ? cache.current.list : EMPTY_MESSAGES; cache.current = buildSessionMessageRecordsSnapshot(store.getState(), sessionId, cache.current); return cache.current.list }, [store, sessionId, options?.enabled])
  return useSyncExternalStore(useCallback((notify) => options?.enabled === false ? () => { } : subscribeDirectorySessionMessages(store, sessionId, (change) => { if (options?.suspendPartUpdates && !change.messagesChanged && !change.reset && change.partMessageIds.length && change.partMessageIds.every((id) => !options.suspendPartUpdatesForMessageId || id === options.suspendPartUpdatesForMessageId)) return; notify() }), [store, sessionId, options?.enabled, options?.suspendPartUpdates, options?.suspendPartUpdatesForMessageId]), get, get)
}
