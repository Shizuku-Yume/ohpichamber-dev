import type { Message } from "@openchamber/agent-contract"
import { sortMessagesChronologically } from "./message-ordering"

export type OptimisticItem = { message: Message }

export type MessagePage = {
  session: Message[]
  cursor?: string
  complete: boolean
}

export function mergeOptimisticPage(page: MessagePage, items: readonly OptimisticItem[]) {
  if (items.length === 0) return { ...page, confirmed: [] as string[] }
  const session = [...page.session]
  const confirmed: string[] = []

  for (const item of items) {
    const messageId = item.message.messageId
    const index = session.findIndex((message) => message.messageId === messageId)
    if (index < 0) {
      session.push(item.message)
      continue
    }
    // Native identity is the reconciliation key. Once the server echoes the
    // client-generated ID, its complete record is authoritative even if a
    // partial response omits one optimistic part.
    confirmed.push(messageId)
  }

  return {
    cursor: page.cursor,
    complete: page.complete,
    session: sortMessagesChronologically(session),
    confirmed,
  }
}

<<<<<<< HEAD
/** Merge chronologically sorted message arrays by native message identity. */
export function mergeMessages<T extends Message>(existingMessages: readonly T[], incomingMessages: readonly T[]): T[] {
  const messagesById = new Map(existingMessages.map((item) => [item.messageId, item] as const))
||||||| bc50ba56aa
/** Merge two chronologically sorted message arrays by identity, deduplicating.
 *  Preserves existing references for items that already exist — avoids
 *  unnecessary React re-renders when prepending older history. */
export function mergeMessages<T extends Message>(existingMessages: readonly T[], incomingMessages: readonly T[]) {
  const messagesByID = new Map(existingMessages.map((item) => [item.id, item] as const))
=======
export function mergeMessages<T extends Message>(existingMessages: readonly T[], incomingMessages: readonly T[]) {
  const messagesByID = new Map(existingMessages.map((item) => [item.id, item] as const))
>>>>>>> upstream/main
  let changed = false
  for (const item of incomingMessages) {
    if (!messagesById.has(item.messageId)) {
      messagesById.set(item.messageId, item)
      changed = true
    }
  }
  if (!changed) return existingMessages as T[]
  return sortMessagesChronologically([...messagesById.values()])
}
