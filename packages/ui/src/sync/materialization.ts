


import type { Message, Part, ToolCallPart } from "@openchamber/agent-contract"
import { mergeMessages } from "./optimistic"
import { sortMessagesChronologically } from "./message-ordering"

export type MaterializedState = { message: Record<string, Message[]> }
export type MaterializeSessionSnapshotsOptions = { skipPartTypes?: ReadonlySet<string>; mode?: "merge" | "prepend" }
export type MaterializeSessionSnapshotsResult = {
  message: Record<string, Message[]>
  messages: Message[]
  messagesChanged: boolean
  partsChanged: boolean
}
export type SessionMaterializationStatus = {
  hasMessages: boolean
  renderable: boolean
  missingPartMessageIDs: string[]
}

const isActiveTool = (part: Part): part is ToolCallPart => (
  part.type === "tool_call" && (part.status === "pending_approval" || part.status === "approved" || part.status === "running")
)

export function getStaleRunningToolMessageID(state: MaterializedState, sessionId: string): string | undefined {
  const messages = state.message[sessionId] ?? []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === "user") return undefined
    if (message.role !== "assistant") continue
    return message.parts.some(isActiveTool) ? message.messageId : undefined
  }
  return undefined
}

const filterParts = (parts: readonly Part[], skipPartTypes: ReadonlySet<string>): Part[] => (
  parts.filter((part) => Boolean(part.partId) && !skipPartTypes.has(part.type))
)

function mergeMaterializedParts(
  existing: readonly Part[] | undefined,
  incoming: readonly Part[],
  skipPartTypes: ReadonlySet<string>,
  preserveLive: boolean,
): Part[] {
  const next = filterParts(incoming, skipPartTypes)
  if (!existing || !preserveLive) return next
  const incomingIds = new Set(next.map((part) => part.partId))
  const existingById = new Map(existing.map((part) => [part.partId, part] as const))
  let merged = next
  for (let index = 0; index < next.length; index += 1) {
    const incoming = next[index]
    const prior = existingById.get(incoming.partId)
    if (!prior) continue
    if (JSON.stringify(prior) === JSON.stringify(incoming)) {
      merged[index] = prior
      continue
    }
    if ((prior.type === "text" || prior.type === "reasoning") && incoming.type === prior.type
      && prior.content.length > incoming.content.length && prior.content.startsWith(incoming.content)) {
      merged[index] = prior
    }
    if (prior.type === "tool_call" && incoming.type === "tool_call") {
      const terminal = !isActiveTool(prior)
      if ((prior.status === "running" && (incoming.status === "pending_approval" || incoming.status === "approved"))
        || (terminal && isActiveTool(incoming))) merged[index] = prior
    }
  }
  const missingLive = existing.filter((part) => !incomingIds.has(part.partId) && !skipPartTypes.has(part.type)
    && (isActiveTool(part) || ((part.type === "text" || part.type === "reasoning") && part.content.length > 0)))
  if (missingLive.length > 0) merged = [...merged, ...missingLive]
  return merged
}

export function materializeSessionSnapshots(
  state: MaterializedState,
  sessionId: string,
  records: Message[],
  options: MaterializeSessionSnapshotsOptions = {},
): MaterializeSessionSnapshotsResult {
  const skipPartTypes = options.skipPartTypes ?? new Set<string>()
  const recordsByMessageId = new Map(records.filter((message) => Boolean(message?.messageId)).map((message) => [message.messageId, message] as const))
  const snapshots = sortMessagesChronologically([...recordsByMessageId.values()].map(message => {
    const parts = filterParts(message.parts, skipPartTypes)
    return parts.length === message.parts.length ? message : { ...message, parts }
  }))
  const existingMessages = state.message[sessionId]
  const currentMessages = existingMessages ?? []
  const incomingById = new Map(snapshots.map((message) => [message.messageId, message] as const))
  let reconciled = currentMessages
  let partsChanged = false
  for (let index = 0; index < currentMessages.length; index += 1) {
    const existing = currentMessages[index]
    const incoming = incomingById.get(existing.messageId)
    if (!incoming || options.mode === "prepend") continue
    const parts = mergeMaterializedParts(existing.parts, incoming.parts, skipPartTypes, existing.role === "assistant")
    const nextMessage = { ...incoming, parts }
    const partsEquivalent = JSON.stringify(parts) === JSON.stringify(existing.parts)
    if (JSON.stringify(nextMessage) === JSON.stringify(existing)) continue
    if (reconciled === currentMessages) reconciled = [...currentMessages]
    reconciled[index] = nextMessage
    partsChanged = partsChanged || !partsEquivalent
  }
  const messages = mergeMessages(reconciled, snapshots)
  const messagesChanged = messages !== currentMessages || (existingMessages === undefined && snapshots.length === 0)
  if (messagesChanged && messages !== reconciled) partsChanged = true

  const output = messagesChanged || partsChanged ? { ...state.message, [sessionId]: messages } : state.message
  return { message: output, messages, messagesChanged, partsChanged }
}

export function getSessionMaterializationStatus(state: MaterializedState, sessionId: string): SessionMaterializationStatus {
  const messages = state.message[sessionId]
  if (!messages) return { hasMessages: false, renderable: false, missingPartMessageIDs: [] }
  return { hasMessages: true, renderable: true, missingPartMessageIDs: [] }
}

export function isSessionMaterializationStillNeeded(
  state: MaterializedState,
  sessionID: string,
  request: SessionMaterializationRequest,
): boolean {
  if (request.reason === "empty-assistant-message") {
    return !request.messageID || !(state.message[sessionID] ?? []).some((message) => message.messageId === request.messageID && message.parts.length > 0)
  }

  if (request.reason === "missing-owning-message") {
    if (!request.messageID) return true
    return !(state.message[sessionID] ?? []).some((message) => message.messageId === request.messageID)
  }

  if (request.reason === "orphan-delta" || request.reason === "missing-delta-part") {
    if (!request.messageID || !request.partID) return true
    return !(state.message[sessionID] ?? []).find((message) => message.messageId === request.messageID)?.parts.some((part) => part.partId === request.partID)
  }

  if (request.reason === "settled-running-tool") {
    return getStaleRunningToolMessageID(state, sessionID) === request.messageID
  }

  return true
}

type SessionMaterializationReason = 'empty-assistant-message' | 'missing-owning-message' | 'orphan-delta' | 'missing-delta-part' | 'settled-running-tool'

export type SessionMaterializationRequest = {
  reason: SessionMaterializationReason
  messageID?: string
  partID?: string
}
