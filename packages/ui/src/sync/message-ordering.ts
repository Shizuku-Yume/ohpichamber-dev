import type { Message } from "@openchamber/agent-contract"

/** Native message IDs are identity keys; creation time is transcript order. */
export const compareMessagesChronologically = (left: Message, right: Message): number => {
  const createdAtDifference = left.createdAt - right.createdAt
  if (createdAtDifference !== 0) return createdAtDifference
  if (left.messageId < right.messageId) return -1
  if (left.messageId > right.messageId) return 1
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
