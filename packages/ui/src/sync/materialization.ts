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

<<<<<<< HEAD
const filterParts = (parts: readonly Part[], skipPartTypes: ReadonlySet<string>): Part[] => (
  parts.filter((part) => Boolean(part.partId) && !skipPartTypes.has(part.type))
)
||||||| bc50ba56aa
function filterMaterializedParts(parts: Part[], skipPartTypes: ReadonlySet<string>): Part[] {
  return parts
    .filter((part) => !!part?.id && !skipPartTypes.has(part.type))
}

function finalizeActiveToolsInCompletedMessage(message: Message, parts: Part[]): Part[] {
  if (message.role !== "assistant" || message.time.completed === undefined) return parts

  const completedAt = message.time.completed
  let reconciledParts = parts
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (part.type !== "tool" || !ACTIVE_TOOL_STATUSES.has(part.state.status)) continue

    const start = getPartStateTime(part)?.start ?? completedAt
    if (reconciledParts === parts) reconciledParts = [...parts]
    reconciledParts[index] = {
      ...part,
      state: {
        ...part.state,
        status: "error" as const,
        error: "Interrupted",
        time: { start, end: completedAt },
      },
    }
  }

  return reconciledParts
}

function haveEquivalentPartSnapshots(left: Part[] | undefined, right: Part[]): boolean {
  // `undefined` means "parts never fetched", which is NOT equivalent to a
  // fetched-empty snapshot — the empty array must be committed so
  // getSessionMaterializationStatus can tell the two apart.
  if (!left) return false
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (!leftPart || !rightPart) return false
    if (leftPart === rightPart) continue
    if (leftPart.id !== rightPart.id) return false
    if (JSON.stringify(leftPart) !== JSON.stringify(rightPart)) return false
  }

  return true
}

function getPartEndTime(part: Part): number | undefined {
  const stateEnd = (part as { state?: { time?: { end?: unknown } } }).state?.time?.end
  if (typeof stateEnd === "number") {
    return stateEnd
  }

  const timeEnd = (part as { time?: { end?: unknown } }).time?.end
  return typeof timeEnd === "number" ? timeEnd : undefined
}

function getStringField(part: Part, field: "text" | "output"): string | undefined {
  const value = (part as Record<string, unknown>)[field]
  return typeof value === "string" ? value : undefined
}

function getPartStateAttachments(part: Part): Array<unknown> | undefined {
  const state = (part as Record<string, unknown>).state as Record<string, unknown> | undefined
  if (!state) return undefined
  const attachments = state.attachments
  return Array.isArray(attachments) ? attachments : undefined
}

function hasLiveStreamingField(part: Part): boolean {
  if (getPartEndTime(part) !== undefined) return false
  return STREAMING_PART_FIELDS.some((field) => {
    const value = getStringField(part, field)
    return typeof value === "string" && value.length > 0
  })
}

function getPartStateTime(part: Part): { start?: number; end?: number } | undefined {
  const stateTime = (part as { state?: { time?: { start?: unknown; end?: unknown } } }).state?.time
  if (!stateTime || typeof stateTime !== "object") return undefined
  const start = typeof stateTime.start === "number" ? stateTime.start : undefined
  const end = typeof stateTime.end === "number" ? stateTime.end : undefined
  if (start === undefined && end === undefined) return undefined
  return { start, end }
}

function mergeMaterializedPart(existing: Part | undefined, next: Part): Part {
  if (!existing) return next

  if (existing.type === "tool" && next.type === "tool") {
    // A page carries finished results as shells. The whole call this client
    // already holds (from the event stream, or a completed message) stays.
    if (
      existing.state.status === next.state.status
      && toolContentShellChars(next) !== null
      && toolContentShellChars(existing) === null
    ) {
      return existing
    }
    const existingStatus = (existing as { state?: { status?: unknown } }).state?.status
    const nextStatus = (next as { state?: { status?: unknown } }).state?.status
    if (
      typeof existingStatus === "string"
      && FINAL_TOOL_STATUSES.has(existingStatus)
      && typeof nextStatus === "string"
      && ACTIVE_TOOL_STATUSES.has(nextStatus)
    ) {
      return existing
    }
    // A snapshot fetched just before a call started can land after the live
    // `called`/`progress` events. OpenCode publishes progress metadata only
    // on change (a subagent's child `sessionID` exactly once), so letting the
    // stale copy win would lose it until the call settles.
    if (existing.state.status === "running" && next.state.status === "pending") {
      return existing
    }
    if (
      existing.state.status === "running"
      && next.state.status === "running"
      && existing.state.metadata !== undefined
      && next.state.metadata === undefined
    ) {
      next = { ...next, state: { ...next.state, metadata: existing.state.metadata } }
    }
  }

  if (getPartEndTime(next) !== undefined) {
    const existingAttachments = getPartStateAttachments(existing)
    if (existingAttachments?.length && getPartStateAttachments(next) === undefined) {
      const nextRecord = { ...next }
      const nextState = { ...((next as Record<string, unknown>).state as Record<string, unknown> ?? {}), attachments: existingAttachments }
      ;(nextRecord as Record<string, unknown>).state = nextState
      return nextRecord
    }
    return next
  }

  let merged: Part = next
  for (const field of STREAMING_PART_FIELDS) {
    const existingValue = getStringField(existing, field)
    if (!existingValue) continue

    const nextValue = getStringField(next, field)
    if (typeof nextValue === "string" && nextValue.length >= existingValue.length) continue
    if (typeof nextValue === "string" && nextValue.length > 0 && !existingValue.startsWith(nextValue)) continue

    if (merged === next) merged = { ...next }
    const mergedRecord = merged as Record<string, unknown>
    mergedRecord[field] = existingValue
  }

  const existingAttachments = getPartStateAttachments(existing)
  if (existingAttachments?.length && getPartStateAttachments(next) === undefined) {
    if (merged === next) merged = { ...next }
    const mergedRecord = merged as Record<string, unknown>
    const nextState = (next as Record<string, unknown>).state as Record<string, unknown> | undefined
    const newState = { ...(nextState ?? {}), attachments: existingAttachments }
    mergedRecord.state = newState
  }

  const existingTime = getPartStateTime(existing)
  if (existingTime) {
    const nextTime = getPartStateTime(next)
    const preservedStart = nextTime?.start ?? existingTime.start
    const preservedEnd = nextTime?.end ?? existingTime.end
    if (preservedStart !== nextTime?.start || preservedEnd !== nextTime?.end) {
      if (merged === next) merged = { ...next }
      const mergedRecord = merged as Record<string, unknown>
      const currentState = (mergedRecord.state as Record<string, unknown> | undefined) ?? (next as Record<string, unknown>).state as Record<string, unknown> | undefined
      const newState = { ...(currentState ?? {}), time: { start: preservedStart, end: preservedEnd } }
      mergedRecord.state = newState
    }
  }

  return merged
}
=======
function filterMaterializedParts(parts: Part[], skipPartTypes: ReadonlySet<string>): Part[] {
  return parts
    .filter((part) => !!part?.id && !skipPartTypes.has(part.type))
}

function finalizeActiveToolsInCompletedMessage(message: Message, parts: Part[]): Part[] {
  if (message.role !== "assistant" || message.time.completed === undefined) return parts

  const completedAt = message.time.completed
  let reconciledParts = parts
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (part.type !== "tool" || !ACTIVE_TOOL_STATUSES.has(part.state.status)) continue

    const start = getPartStateTime(part)?.start ?? completedAt
    if (reconciledParts === parts) reconciledParts = [...parts]
    reconciledParts[index] = {
      ...part,
      state: {
        ...part.state,
        status: "error" as const,
        error: "Interrupted",
        time: { start, end: completedAt },
      },
    }
  }

  return reconciledParts
}

function haveEquivalentPartSnapshots(left: Part[] | undefined, right: Part[]): boolean {
  if (!left) return false
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (!leftPart || !rightPart) return false
    if (leftPart === rightPart) continue
    if (leftPart.id !== rightPart.id) return false
    if (JSON.stringify(leftPart) !== JSON.stringify(rightPart)) return false
  }

  return true
}

function getPartEndTime(part: Part): number | undefined {
  const stateEnd = (part as { state?: { time?: { end?: unknown } } }).state?.time?.end
  if (typeof stateEnd === "number") {
    return stateEnd
  }

  const timeEnd = (part as { time?: { end?: unknown } }).time?.end
  return typeof timeEnd === "number" ? timeEnd : undefined
}

function getStringField(part: Part, field: "text" | "output"): string | undefined {
  const value = (part as Record<string, unknown>)[field]
  return typeof value === "string" ? value : undefined
}

function getPartStateAttachments(part: Part): Array<unknown> | undefined {
  const state = (part as Record<string, unknown>).state as Record<string, unknown> | undefined
  if (!state) return undefined
  const attachments = state.attachments
  return Array.isArray(attachments) ? attachments : undefined
}

function hasLiveStreamingField(part: Part): boolean {
  if (getPartEndTime(part) !== undefined) return false
  return STREAMING_PART_FIELDS.some((field) => {
    const value = getStringField(part, field)
    return typeof value === "string" && value.length > 0
  })
}

function getPartStateTime(part: Part): { start?: number; end?: number } | undefined {
  const stateTime = (part as { state?: { time?: { start?: unknown; end?: unknown } } }).state?.time
  if (!stateTime || typeof stateTime !== "object") return undefined
  const start = typeof stateTime.start === "number" ? stateTime.start : undefined
  const end = typeof stateTime.end === "number" ? stateTime.end : undefined
  if (start === undefined && end === undefined) return undefined
  return { start, end }
}

function mergeMaterializedPart(existing: Part | undefined, next: Part): Part {
  if (!existing) return next

  if (existing.type === "tool" && next.type === "tool") {
    if (
      existing.state.status === next.state.status
      && toolContentShellChars(next) !== null
      && toolContentShellChars(existing) === null
    ) {
      return existing
    }
    const existingStatus = (existing as { state?: { status?: unknown } }).state?.status
    const nextStatus = (next as { state?: { status?: unknown } }).state?.status
    if (
      typeof existingStatus === "string"
      && FINAL_TOOL_STATUSES.has(existingStatus)
      && typeof nextStatus === "string"
      && ACTIVE_TOOL_STATUSES.has(nextStatus)
    ) {
      return existing
    }
    if (existing.state.status === "running" && next.state.status === "pending") {
      return existing
    }
    if (
      existing.state.status === "running"
      && next.state.status === "running"
      && existing.state.metadata !== undefined
      && next.state.metadata === undefined
    ) {
      next = { ...next, state: { ...next.state, metadata: existing.state.metadata } }
    }
  }

  if (getPartEndTime(next) !== undefined) {
    const existingAttachments = getPartStateAttachments(existing)
    if (existingAttachments?.length && getPartStateAttachments(next) === undefined) {
      const nextRecord = { ...next }
      const nextState = { ...((next as Record<string, unknown>).state as Record<string, unknown> ?? {}), attachments: existingAttachments }
      ;(nextRecord as Record<string, unknown>).state = nextState
      return nextRecord
    }
    return next
  }

  let merged: Part = next
  for (const field of STREAMING_PART_FIELDS) {
    const existingValue = getStringField(existing, field)
    if (!existingValue) continue

    const nextValue = getStringField(next, field)
    if (typeof nextValue === "string" && nextValue.length >= existingValue.length) continue
    if (typeof nextValue === "string" && nextValue.length > 0 && !existingValue.startsWith(nextValue)) continue

    if (merged === next) merged = { ...next }
    const mergedRecord = merged as Record<string, unknown>
    mergedRecord[field] = existingValue
  }

  const existingAttachments = getPartStateAttachments(existing)
  if (existingAttachments?.length && getPartStateAttachments(next) === undefined) {
    if (merged === next) merged = { ...next }
    const mergedRecord = merged as Record<string, unknown>
    const nextState = (next as Record<string, unknown>).state as Record<string, unknown> | undefined
    const newState = { ...(nextState ?? {}), attachments: existingAttachments }
    mergedRecord.state = newState
  }

  const existingTime = getPartStateTime(existing)
  if (existingTime) {
    const nextTime = getPartStateTime(next)
    const preservedStart = nextTime?.start ?? existingTime.start
    const preservedEnd = nextTime?.end ?? existingTime.end
    if (preservedStart !== nextTime?.start || preservedEnd !== nextTime?.end) {
      if (merged === next) merged = { ...next }
      const mergedRecord = merged as Record<string, unknown>
      const currentState = (mergedRecord.state as Record<string, unknown> | undefined) ?? (next as Record<string, unknown>).state as Record<string, unknown> | undefined
      const newState = { ...(currentState ?? {}), time: { start: preservedStart, end: preservedEnd } }
      mergedRecord.state = newState
    }
  }

  return merged
}
>>>>>>> upstream/main

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
<<<<<<< HEAD
    const incoming = incomingById.get(existing.messageId)
    if (!incoming || options.mode === "prepend") continue
    const parts = mergeMaterializedParts(existing.parts, incoming.parts, skipPartTypes, existing.role === "assistant")
    const nextMessage = { ...incoming, parts }
    const partsEquivalent = JSON.stringify(parts) === JSON.stringify(existing.parts)
    if (JSON.stringify(nextMessage) === JSON.stringify(existing)) continue
    if (reconciled === currentMessages) reconciled = [...currentMessages]
    reconciled[index] = nextMessage
    partsChanged = partsChanged || !partsEquivalent
||||||| bc50ba56aa
    const incoming = incomingByID.get(existing.id)
    // History holds only delivered messages, so a record there supersedes the
    // pending one a missed `session.inbox.delivered` left behind, at its
    // delivery time.
    const delivered = existing.role === "synthetic" && existing.pending === true && incoming?.role === "synthetic"
    // A completion the server reports supersedes a turn this client still
    // holds open, and the local interruption mark (`interruptedTurnToolParts`)
    // it may have put on it. Any other existing record wins over the snapshot.
    const completed = existing.role === "assistant"
      && incoming?.role === "assistant"
      && incoming.time.completed !== undefined
      && (existing.time.completed === undefined || existing.closedLocally === true)
    if (!incoming || (!delivered && !completed)) continue
    deliveredWhileAway ||= delivered
    if (reconciledCurrentMessages === currentMessages) reconciledCurrentMessages = [...currentMessages]
    reconciledCurrentMessages[index] = incoming
=======
    const incoming = incomingByID.get(existing.id)
    const delivered = existing.role === "synthetic" && existing.pending === true && incoming?.role === "synthetic"
    const completed = existing.role === "assistant"
      && incoming?.role === "assistant"
      && incoming.time.completed !== undefined
      && (existing.time.completed === undefined || existing.closedLocally === true)
    if (!incoming || (!delivered && !completed)) continue
    deliveredWhileAway ||= delivered
    if (reconciledCurrentMessages === currentMessages) reconciledCurrentMessages = [...currentMessages]
    reconciledCurrentMessages[index] = incoming
>>>>>>> upstream/main
  }
  const messages = mergeMessages(reconciled, snapshots)
  const messagesChanged = messages !== currentMessages || (existingMessages === undefined && snapshots.length === 0)
  if (messagesChanged && messages !== reconciled) partsChanged = true

<<<<<<< HEAD
  const output = messagesChanged || partsChanged ? { ...state.message, [sessionId]: messages } : state.message
  return { message: output, messages, messagesChanged, partsChanged }
||||||| bc50ba56aa
  let partsChanged = false
  let nextPartState = state.part
  const isPrepend = options.mode === "prepend"

  for (const record of snapshots) {
    const messageID = record.info.id
    if (isPrepend && nextPartState[messageID]) continue

    const isAssistant = record.info.role === "assistant"
    const existing = nextPartState[messageID]
    const mergedParts = mergeMaterializedParts(
      existing,
      filterMaterializedParts(record.parts ?? [], skipPartTypes),
      skipPartTypes,
      isAssistant,
    )
    const nextParts = finalizeActiveToolsInCompletedMessage(record.info, mergedParts)
    // For non-assistant messages an empty snapshot keeps the old "absent"
    // representation; only assistant messages need the explicit [] marker
    // (getSessionMaterializationStatus checks only assistant messages).
    const equivalent = existing
      ? haveEquivalentPartSnapshots(existing, nextParts)
      : nextParts.length === 0 && !isAssistant
    if (equivalent) continue

    if (nextPartState === state.part) nextPartState = { ...state.part }

    if (nextParts.length === 0 && !isAssistant) {
      delete nextPartState[messageID]
    } else {
      // Store fetched-empty as an explicit [] (not absence): an assistant
      // message the server returned with zero parts (e.g. aborted before any
      // output) is authoritatively empty and must count as renderable, or
      // the ensure-renderable effects retry syncSession forever.
      nextPartState[messageID] = nextParts
    }
    partsChanged = true
  }

  return {
    message: messagesChanged ? { ...state.message, [sessionID]: messages } : state.message,
    part: partsChanged ? nextPartState : state.part,
    messages,
    messagesChanged,
    partsChanged,
  }
=======
  let partsChanged = false
  let nextPartState = state.part
  const isPrepend = options.mode === "prepend"

  for (const record of snapshots) {
    const messageID = record.info.id
    if (isPrepend && nextPartState[messageID]) continue

    const isAssistant = record.info.role === "assistant"
    const existing = nextPartState[messageID]
    const mergedParts = mergeMaterializedParts(
      existing,
      filterMaterializedParts(record.parts ?? [], skipPartTypes),
      skipPartTypes,
      isAssistant,
    )
    const nextParts = finalizeActiveToolsInCompletedMessage(record.info, mergedParts)
    const equivalent = existing
      ? haveEquivalentPartSnapshots(existing, nextParts)
      : nextParts.length === 0 && !isAssistant
    if (equivalent) continue

    if (nextPartState === state.part) nextPartState = { ...state.part }

    if (nextParts.length === 0 && !isAssistant) {
      delete nextPartState[messageID]
    } else {
      nextPartState[messageID] = nextParts
    }
    partsChanged = true
  }

  return {
    message: messagesChanged ? { ...state.message, [sessionID]: messages } : state.message,
    part: partsChanged ? nextPartState : state.part,
    messages,
    messagesChanged,
    partsChanged,
  }
>>>>>>> upstream/main
}

<<<<<<< HEAD
export function getSessionMaterializationStatus(state: MaterializedState, sessionId: string): SessionMaterializationStatus {
  const messages = state.message[sessionId]
  if (!messages) return { hasMessages: false, renderable: false, missingPartMessageIDs: [] }
  return { hasMessages: true, renderable: true, missingPartMessageIDs: [] }
||||||| bc50ba56aa
export function getSessionMaterializationStatus(
  state: MaterializedState,
  sessionID: string,
): SessionMaterializationStatus {
  const messages = state.message[sessionID]
  if (!messages) {
    return { hasMessages: false, renderable: false, missingPartMessageIDs: [] }
  }

  const missingPartMessageIDs: string[] = []
  for (const message of messages) {
    if (message.role !== "assistant") continue
    // `undefined` = parts never fetched (not renderable yet). An explicit []
    // is a fetched-empty snapshot (e.g. aborted assistant turn) and counts
    // as renderable — otherwise sessions containing such a message can never
    // reach renderable state and ensure-renderable callers loop forever.
    const parts = state.part[message.id]
    if (!parts) {
      missingPartMessageIDs.push(message.id)
    }
  }

  return {
    hasMessages: true,
    renderable: missingPartMessageIDs.length === 0,
    missingPartMessageIDs,
  }
=======
export type SessionMaterializationStatusOptions = {
  historyCovered?: boolean
}

export function getSessionMaterializationStatus(
  state: MaterializedState,
  sessionID: string,
  options: SessionMaterializationStatusOptions = {},
): SessionMaterializationStatus {
  const messages = state.message[sessionID]
  if (!messages) {
    return { hasMessages: false, renderable: false, missingPartMessageIDs: [] }
  }

  const missingPartMessageIDs: string[] = []
  for (const message of messages) {
    if (message.role !== "assistant") continue
    const parts = state.part[message.id]
    if (parts) continue
    if (options.historyCovered && message.time.completed === undefined) continue
    missingPartMessageIDs.push(message.id)
  }

  return {
    hasMessages: true,
    renderable: options.historyCovered !== false && missingPartMessageIDs.length === 0,
    missingPartMessageIDs,
  }
>>>>>>> upstream/main
}
