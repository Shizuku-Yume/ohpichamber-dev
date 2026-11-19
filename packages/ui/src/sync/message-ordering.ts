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

<<<<<<< HEAD
/** Native message IDs are identity keys; creation time is transcript order. */
const compareMessagesChronologically = (left: Message, right: Message): number => {
  const createdAtDifference = left.createdAt - right.createdAt
||||||| bc50ba56aa
/**
 * Within one millisecond a synthetic record goes first. Context attached to a
 * prompt is written right before it and often shares its millisecond, while
 * the prompt's id is minted earlier on the client, so the ID alone would put
 * that context after the prompt it belongs to.
 */
const equalTimeRank = (message: Message): number => (message.role === "synthetic" ? 0 : 1)

/**
 * Message IDs identify records; they are not chronology. OpenCode's sortable
 * ID timestamp rolls over, so a newly created `msg_000...` can follow a legacy
 * `msg_fff...`. Creation time is the authoritative transcript order, with ID
 * used only to make equal timestamps deterministic.
 */
export const compareMessagesChronologically = (left: Message, right: Message): number => {
  const createdAtDifference = getCreatedAt(left) - getCreatedAt(right)
=======
const equalTimeRank = (message: Message): number => (message.role === "synthetic" ? 0 : 1)

export const compareMessagesChronologically = (left: Message, right: Message): number => {
  const createdAtDifference = getCreatedAt(left) - getCreatedAt(right)
>>>>>>> upstream/main
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

<<<<<<< HEAD
export const messagesBefore = <T extends Message>(messages: T[], messageId?: string): T[] => {
  if (!messageId) return messages
  const index = findMessageIndex(messages, messageId)
  return index < 0 ? messages : messages.slice(0, index)
||||||| bc50ba56aa
/** Return the messages before the marker's current array position. */
export const messagesBefore = <T extends Message>(messages: readonly T[], messageID?: string): T[] => {
  if (!messageID) return messages as T[]
  const index = findMessageIndex(messages, messageID)
  return index < 0 ? messages as T[] : messages.slice(0, index)
=======
export const messagesBefore = <T extends Message>(messages: readonly T[], messageID?: string): T[] => {
  if (!messageID) return messages as T[]
  const index = findMessageIndex(messages, messageID)
  return index < 0 ? messages as T[] : messages.slice(0, index)
>>>>>>> upstream/main
}

<<<<<<< HEAD
export const messagesFrom = <T extends Message>(messages: readonly T[], messageId?: string): T[] => {
  if (!messageId) return []
  const index = findMessageIndex(messages, messageId)
||||||| bc50ba56aa
/** Return the marker and all messages after its current array position. */
export const messagesFrom = <T extends Message>(messages: readonly T[], messageID?: string): T[] => {
  if (!messageID) return []
  const index = findMessageIndex(messages, messageID)
=======
export const messagesFrom = <T extends Message>(messages: readonly T[], messageID?: string): T[] => {
  if (!messageID) return []
  const index = findMessageIndex(messages, messageID)
>>>>>>> upstream/main
  return index < 0 ? [] : messages.slice(index)
}
