import type { Message } from "@openchamber/agent-contract"

// Canonical authoring order inside one turn: the prompt header first, then the
// assistant message, then independently authored tool results. This is the
// projection's order and makes equal-time messages deterministic before the
// identity tie-break.
const ROLE_ORDER = {
  user: 0,
  assistant: 1,
  system: 2,
} satisfies Record<Message['role'], number>

/** Native message IDs are identity keys; creation time is transcript order. */
const compareMessagesChronologically = (left: Message, right: Message): number => {
  const createdAtDifference = left.createdAt - right.createdAt
  if (createdAtDifference !== 0) return createdAtDifference
  // Keep all messages authored at one instant grouped by their turn before
  // ordering within that turn. A pairwise role check alone would interleave
  // turn headers and assistants and break comparator transitivity.
  if (left.turnId !== right.turnId) return left.turnId < right.turnId ? -1 : 1
  const roleDifference = ROLE_ORDER[left.role] - ROLE_ORDER[right.role]
  if (roleDifference !== 0) return roleDifference
  if (left.messageId !== right.messageId) return left.messageId < right.messageId ? -1 : 1
  return 0
}

export const sortMessagesChronologically = <T extends Message>(messages: readonly T[]): T[] => (
  [...messages].sort(compareMessagesChronologically)
)

export const findMessageIndex = (messages: readonly Message[], messageId: string): number => (
  messages.findIndex((message) => message.messageId === messageId)
)

export const insertMessageChronologically = <T extends Message>(messages: T[], message: T): number => {
  let low = 0
  let high = messages.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (compareMessagesChronologically(messages[middle], message) < 0) low = middle + 1
    else high = middle
  }
  messages.splice(low, 0, message)
  return low
}

export const messagesBefore = <T extends Message>(messages: T[], messageId?: string): T[] => {
  if (!messageId) return messages
  const index = findMessageIndex(messages, messageId)
  return index < 0 ? messages : messages.slice(0, index)
}

export const messagesFrom = <T extends Message>(messages: readonly T[], messageId?: string): T[] => {
  if (!messageId) return []
  const index = findMessageIndex(messages, messageId)
  return index < 0 ? [] : messages.slice(index)
}
