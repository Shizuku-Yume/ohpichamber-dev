<<<<<<< HEAD
import type { AdvisorNote, CanonicalEvent, Message, Part, QueueState, Run, Session, SessionMetadataState, SessionSnapshot } from "@openchamber/agent-contract"
import type { AdvisorState, CleanseProgressState, State } from "./types"
import { omitKeys } from "@/lib/omitKeys"
||||||| bc50ba56aa
import type { MessagePatch, SessionPatch, SyncEvent, ToolTransition } from "@/lib/opencode/events"
import {
  compact,
  isFinalToolStatus,
  type Message,
  type Part,
  type Session,
  type SessionStatus,
  type ToolPart,
} from "@/lib/opencode/model"
import { Binary } from "./binary"
import { withoutUnshownResult } from "@/lib/opencode/toolContentShells"
import type { State } from "./types"
import { dropSessionCaches } from "./session-cache"
import { syncDebug } from "./debug"
import { shouldSkipStaleSessionEvent } from "./session-event-freshness"
import {
  compareMessagesChronologically,
  findMessageIndex,
  insertMessageChronologically,
} from "./message-ordering"
=======
import type { MessagePatch, SessionPatch, SyncEvent, ToolTransition } from "@/lib/opencode/events"
import {
  compact,
  isFinalToolStatus,
  type Message,
  type Part,
  type Session,
  type SessionStatus,
  type ToolPart,
} from "@/lib/opencode/model"
import { Binary } from "./binary"
import { withSessionMetadata } from "@/lib/opencode/projection"
import { withoutUnshownResult } from "@/lib/opencode/toolContentShells"
import type { State } from "./types"
import { dropSessionCaches } from "./session-cache"
import { syncDebug } from "./debug"
import { shouldSkipStaleSessionEvent } from "./session-event-freshness"
import {
  compareMessagesChronologically,
  findMessageIndex,
  insertMessageChronologically,
} from "./message-ordering"
>>>>>>> upstream/main

export function compareCounters(left: string, right: string): number {
 return left.length === right.length ? (left < right ? -1 : left > right ? 1 : 0) : left.length < right.length ? -1 : 1
}

const same = <T>(left: T, right: T): boolean => left === right || JSON.stringify(left) === JSON.stringify(right)
const clearInvalidation = (invalidated: Record<string, true> | undefined, sessionId: string): Record<string, true> | undefined => {
 if (!invalidated?.[sessionId]) return invalidated
 const next = { ...invalidated }
 delete next[sessionId]
 return next
}

export function mergeAdvisorNotes(
 existingNotes: readonly AdvisorNote[],
 incomingNotes: readonly AdvisorNote[],
): AdvisorNote[] {
 const byId = new Map<string, AdvisorNote>();
 for (const note of existingNotes) {
  byId.set(note.noteId, note);
 }
 for (const note of incomingNotes) {
  byId.set(note.noteId, note);
 }
 return Array.from(byId.values()).sort(
  (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0) || a.noteId.localeCompare(b.noteId),
 );
}

export function clearSessionAdvisor(state: State, sessionId: string): State {
 if (!state.advisor?.[sessionId]) return state;
 const advisor = { ...state.advisor };
 delete advisor[sessionId];
 return { ...state, advisor };
}
const retain = <T>(current: readonly T[], incoming: readonly T[], key: (item: T) => string): T[] => {
 const prior = new Map(current.map((item) => [key(item), item]))
 const next = incoming.map((item) => { const old = prior.get(key(item)); return old && same(old, item) ? old : item })
 return next.length === current.length && next.every((item, index) => item === current[index]) ? current as T[] : next
}

export function mergeHostSession(incoming: Session, previous?: Session): Session {
 if (!previous) return incoming
 let next = incoming
 if (incoming.epoch === previous.epoch && compareCounters(incoming.headSequence, previous.headSequence) < 0) {
  const runtime = omitKeys(previous, ['metadata', 'metadataRevision', 'archiveRevision', 'archivedAt'])
  next = { ...incoming, ...runtime }
 }
 if (compareCounters(incoming.metadataRevision, previous.metadataRevision) < 0) {
  next = { ...next, metadata: previous.metadata, metadataRevision: previous.metadataRevision }
 }
 if (compareCounters(incoming.archiveRevision, previous.archiveRevision) < 0) {
  next = { ...next, archiveRevision: previous.archiveRevision }
  if (previous.archivedAt === undefined) delete next.archivedAt
  else next.archivedAt = previous.archivedAt
 }
 return same(previous, next) ? previous : next
}

export function installHostSession(state: State, incoming: Session): State {
 const index = state.session.findIndex((item) => item.sessionId === incoming.sessionId)
 const previous = state.session[index]
 const pending = index < 0 ? state.pendingMetadata?.[incoming.sessionId] : undefined
 const next = mergeHostSession(
  pending && compareCounters(pending.revision, incoming.metadataRevision) >= 0
   ? { ...incoming, metadata: pending.metadata, metadataRevision: pending.revision }
   : incoming,
  previous,
 )
 if (next === previous && !pending) return state
 const session = [...state.session]
 if (index < 0) session.push(next)
 else session[index] = next
 const revision = (state.sessionRevision ?? 0) + 1
 const released = index < 0 && state.pendingMetadata?.[incoming.sessionId] !== undefined
 const pendingMetadata = released && state.pendingMetadata
  ? omitPendingMetadata(state.pendingMetadata, incoming.sessionId)
  : state.pendingMetadata
 const next_state = {
  ...state, session, sessionTotal: session.length, sessionRevision: revision,
  sessionEventRevision: { ...state.sessionEventRevision, [incoming.sessionId]: revision },
 }
 if (pendingMetadata !== undefined) next_state.pendingMetadata = pendingMetadata
 return next_state
}

<<<<<<< HEAD
/**
 * A whole session list read from the Host. A metadata record announced before
 * the read is newer than the row the list carries, and the list is the first
 * place its directory is known, so those rows go in through the same installer
 * an event uses: the buffered record lands on the row and the buffer is
 * released. Installing the list directly left a stale title and a leaked entry.
 */
export function installSessionList(state: State, rows: readonly Session[]): State {
 const buffered = state.pendingMetadata
 if (!buffered) return { ...state, session: [...rows], sessionTotal: rows.length }
 const settled = rows.filter((row) => buffered[row.sessionId] === undefined)
 let next: State = { ...state, session: settled, sessionTotal: settled.length }
 for (const row of rows) if (buffered[row.sessionId] !== undefined) next = installHostSession(next, row)
 return next
}

const omitPendingMetadata = (record: Record<string, SessionMetadataState>, sessionId: string) => {
 const next = { ...record }
 delete next[sessionId]
 return next
||||||| bc50ba56aa
/**
 * A full text snapshot that extends or repeats the streamed text means the
 * next delta may overlap it; mark the field so the delta appends only what is
 * new.
 */
function getUpdatedDeltaFields(previous: Part, next: Part): string[] {
  if (previous.type !== next.type) return []
  if (next.type !== "text" && next.type !== "reasoning") return []
  if (previous.type !== "text" && previous.type !== "reasoning") return []
  const previousValue = previous.text
  const nextValue = next.text
  if (previousValue.length === 0 || nextValue.length === 0) return []
  if (nextValue === previousValue || nextValue.startsWith(previousValue) || previousValue.startsWith(nextValue)) {
    return ["text"]
  }
  return []
=======
function getUpdatedDeltaFields(previous: Part, next: Part): string[] {
  if (previous.type !== next.type) return []
  if (next.type !== "text" && next.type !== "reasoning") return []
  if (previous.type !== "text" && previous.type !== "reasoning") return []
  const previousValue = previous.text
  const nextValue = next.text
  if (previousValue.length === 0 || nextValue.length === 0) return []
  if (nextValue === previousValue || nextValue.startsWith(previousValue) || previousValue.startsWith(nextValue)) {
    return ["text"]
  }
  return []
>>>>>>> upstream/main
}

<<<<<<< HEAD
/**
 * The most metadata records one directory's store holds for sessions it has
 * not seen. The buffer bridges an announcement that arrives before the list
 * read, so it only ever holds the handful of sessions created since that read;
 * a record whose session never arrives must not accumulate forever.
 */
const MAX_PENDING_METADATA = 256;
||||||| bc50ba56aa
/**
 * A text or reasoning `ended` snapshot carries only its own timestamp as
 * `start`; the start streamed earlier is the real one and stays.
 */
function withStreamedStart(previous: Part, next: Part): Part {
  if (next.type !== "text" && next.type !== "reasoning") return next
  if (previous.type !== next.type || !previous.time || !next.time) return next
  if (next.time.end === undefined || previous.time.start >= next.time.start) return next
  return { ...next, time: { ...next.time, start: previous.time.start } }
}

function getPartEndTime(part: Part): number | undefined {
  if (part.type === "tool") {
    return part.state.status === "completed" || part.state.status === "error" ? part.state.time.end : undefined
  }
  if (part.type === "text" || part.type === "reasoning") return part.time?.end
  return undefined
}

function shouldPreserveExistingPart(previous: Part, next: Part): boolean {
  if (previous.type !== "tool" || next.type !== "tool") {
    return false
  }

  if (isFinalToolStatus(previous.state.status) && !isFinalToolStatus(next.state.status)) {
    return true
  }

  const previousEnd = getPartEndTime(previous)
  const nextEnd = getPartEndTime(next)
  if (previousEnd !== undefined && nextEnd === undefined) {
    return true
  }

  return false
}

function areSessionStatusesEqual(left: SessionStatus | undefined, right: SessionStatus): boolean {
  if (left === right) return true
  if (!left || left.type !== right.type) return false
  if (left.type === "retry") {
    return right.type === "retry"
      && left.attempt === right.attempt
      && left.message === right.message
      && left.next === right.next
  }
  return true
}

function areJsonEquivalent<T extends object>(left: T | undefined, right: T | undefined): boolean {
  if (left === right) return true
  if (left === undefined || right === undefined) return false
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Global events
// ---------------------------------------------------------------------------

export type GlobalEventResult = {
  type: "refresh"
} | {
  type: "catalog"
  kind: Extract<SyncEvent, { type: "catalog.updated" }>["properties"]["kind"]
} | null

export type SessionMaterializationReason =
  | "missing-owning-message"
  | "orphan-delta"
  | "missing-delta-part"
  | "empty-assistant-message"
  | "child-session-idle"
  | "child-session-discovered"
  | "ensure-session-messages"
  | "stream-reconnect"
  | "transport-switch"
  | "stale-status-resync"
  | "settled-running-tool"

export type DirectoryEventResult = boolean | {
  changed: boolean
  materialization: {
    type: "incomplete-session-snapshot"
    reason: SessionMaterializationReason
    sessionID?: string
    messageID: string
    partID?: string
  }
}

function hasMessage(draft: State, sessionID: string | undefined, messageID: string): boolean {
  if (!sessionID) return false
  const messages = draft.message[sessionID]
  if (!messages) return false
  return messages.some((message) => message.id === messageID)
}

/** Index of the compaction still running in a session (the newest one), or -1. */
const findRunningCompactionIndex = (messages: readonly Message[]): number => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === "compaction") return message.status === "running" ? index : -1
  }
  return -1
}

export function reduceGlobalEvent(event: SyncEvent): GlobalEventResult {
  if (event.type === "server.connected") {
    return { type: "refresh" }
  }
  if (event.type === "catalog.updated") {
    return { type: "catalog", kind: event.properties.kind }
  }
  return null
}

// ---------------------------------------------------------------------------
// Patch application
// ---------------------------------------------------------------------------

function applySessionPatch(session: Session, patch: SessionPatch): Session {
  const next: Session = { ...session }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.directory !== undefined) next.directory = patch.directory
  if (patch.projectID !== undefined) next.projectID = patch.projectID
  if (patch.subpath === null) delete next.subpath
  else if (patch.subpath !== undefined) next.subpath = patch.subpath
  if (patch.agent !== undefined) next.agent = patch.agent
  if (patch.model !== undefined) next.model = patch.model
  if (patch.cost !== undefined) next.cost = patch.cost
  if (patch.tokens !== undefined) next.tokens = patch.tokens
  if (patch.permissions !== undefined) next.permissions = patch.permissions
  if (patch.revert === null) delete next.revert
  else if (patch.revert !== undefined) next.revert = patch.revert
  if (patch.outcome !== undefined) next.outcome = patch.outcome
  if (patch.metadata !== undefined) next.metadata = patch.metadata
  if (patch.time) {
    const { archived, ...rest } = patch.time
    next.time = compact({ ...session.time, ...rest, archived: archived === null ? undefined : (archived ?? session.time.archived) })
  }
  return next
}

function applyMessagePatch(message: Message, patch: MessagePatch): Message {
  if (message.role === "assistant") {
    const next = { ...message }
    if (patch.time) next.time = compact({ ...message.time, ...patch.time })
    if (patch.finish !== undefined) next.finish = patch.finish
    if (patch.error !== undefined) next.error = patch.error
    // A completion the server reports supersedes the local interruption mark
    // (`interruptedTurnToolParts`); a turn that really failed arrives with its
    // own error in the same patch.
    else if (patch.time?.completed !== undefined && message.closedLocally) delete next.error
    if (patch.error !== undefined || patch.time?.completed !== undefined) delete next.closedLocally
    if (patch.cost !== undefined) next.cost = patch.cost
    if (patch.tokens !== undefined) next.tokens = patch.tokens
    if (patch.snapshot) next.snapshot = compact({ ...message.snapshot, ...patch.snapshot })
    if (patch.retry === null) delete next.retry
    else if (patch.retry !== undefined) next.retry = patch.retry
    return next
  }
  if (message.role === "shell") {
    const next = { ...message }
    if (patch.time?.completed !== undefined) next.time = { ...message.time, completed: patch.time.completed }
    if (patch.shell) {
      next.status = patch.shell.status
      if (patch.shell.exit !== undefined) next.exit = patch.shell.exit
      if (patch.shell.signal !== undefined) next.signal = patch.shell.signal
      if (patch.shell.output !== undefined) next.output = patch.shell.output
    }
    return next
  }
  if (patch.time?.created !== undefined) {
    const next = { ...message, time: { ...message.time, created: patch.time.created } }
    // Only delivery out of the inbox moves a synthetic message's time.
    if (next.role === "synthetic") delete next.pending
    return next
  }
  return message
}
=======
function withStreamedStart(previous: Part, next: Part): Part {
  if (next.type !== "text" && next.type !== "reasoning") return next
  if (previous.type !== next.type || !previous.time || !next.time) return next
  if (next.time.end === undefined || previous.time.start >= next.time.start) return next
  return { ...next, time: { ...next.time, start: previous.time.start } }
}

function getPartEndTime(part: Part): number | undefined {
  if (part.type === "tool") {
    return part.state.status === "completed" || part.state.status === "error" ? part.state.time.end : undefined
  }
  if (part.type === "text" || part.type === "reasoning") return part.time?.end
  return undefined
}

function shouldPreserveExistingPart(previous: Part, next: Part): boolean {
  if (previous.type !== "tool" || next.type !== "tool") {
    return false
  }

  if (isFinalToolStatus(previous.state.status) && !isFinalToolStatus(next.state.status)) {
    return true
  }

  const previousEnd = getPartEndTime(previous)
  const nextEnd = getPartEndTime(next)
  if (previousEnd !== undefined && nextEnd === undefined) {
    return true
  }

  return false
}

function areSessionStatusesEqual(left: SessionStatus | undefined, right: SessionStatus): boolean {
  if (left === right) return true
  if (!left || left.type !== right.type) return false
  if (left.type === "retry") {
    return right.type === "retry"
      && left.attempt === right.attempt
      && left.message === right.message
      && left.next === right.next
  }
  return true
}

function areJsonEquivalent<T extends object>(left: T | undefined, right: T | undefined): boolean {
  if (left === right) return true
  if (left === undefined || right === undefined) return false
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}


export type GlobalEventResult = {
  type: "refresh"
} | {
  type: "catalog"
  kind: Extract<SyncEvent, { type: "catalog.updated" }>["properties"]["kind"]
} | null

export type SessionMaterializationReason =
  | "missing-owning-message"
  | "orphan-delta"
  | "missing-delta-part"
  | "empty-assistant-message"
  | "child-session-idle"
  | "child-session-discovered"
  | "ensure-session-messages"
  | "stream-reconnect"
  | "stream-replayed"
  | "transport-switch"
  | "stale-status-resync"
  | "settled-running-tool"

export type DirectoryEventResult = boolean | {
  changed: boolean
  materialization: {
    type: "incomplete-session-snapshot"
    reason: SessionMaterializationReason
    sessionID?: string
    messageID: string
    partID?: string
  }
}

function hasMessage(draft: State, sessionID: string | undefined, messageID: string): boolean {
  if (!sessionID) return false
  const messages = draft.message[sessionID]
  if (!messages) return false
  return messages.some((message) => message.id === messageID)
}

const findRunningCompactionIndex = (messages: readonly Message[]): number => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === "compaction") return message.status === "running" ? index : -1
  }
  return -1
}

export function reduceGlobalEvent(event: SyncEvent): GlobalEventResult {
  if (event.type === "server.connected") {
    return { type: "refresh" }
  }
  if (event.type === "catalog.updated") {
    return { type: "catalog", kind: event.properties.kind }
  }
  return null
}


function applySessionPatch(session: Session, patch: SessionPatch): Session {
  const next: Session = patch.metadata === undefined ? { ...session } : withSessionMetadata(session, patch.metadata)
  if (patch.title !== undefined) next.title = patch.title
  if (patch.directory !== undefined) next.directory = patch.directory
  if (patch.projectID !== undefined) next.projectID = patch.projectID
  if (patch.subpath === null) delete next.subpath
  else if (patch.subpath !== undefined) next.subpath = patch.subpath
  if (patch.agent !== undefined) next.agent = patch.agent
  if (patch.model !== undefined) next.model = patch.model
  if (patch.cost !== undefined) next.cost = patch.cost
  if (patch.tokens !== undefined) next.tokens = patch.tokens
  if (patch.permissions !== undefined) next.permissions = patch.permissions
  if (patch.revert === null) delete next.revert
  else if (patch.revert !== undefined) next.revert = patch.revert
  if (patch.outcome !== undefined) next.outcome = patch.outcome
  if (patch.time) {
    const { archived, ...rest } = patch.time
    next.time = compact({ ...session.time, ...rest, archived: archived === null ? undefined : (archived ?? session.time.archived) })
  }
  return next
}

function applyMessagePatch(message: Message, patch: MessagePatch): Message {
  if (message.role === "assistant") {
    const next = { ...message }
    if (patch.time) next.time = compact({ ...message.time, ...patch.time })
    if (patch.finish !== undefined) next.finish = patch.finish
    if (patch.error !== undefined) next.error = patch.error
    else if (patch.time?.completed !== undefined && message.closedLocally) delete next.error
    if (patch.error !== undefined || patch.time?.completed !== undefined) delete next.closedLocally
    if (patch.cost !== undefined) next.cost = patch.cost
    if (patch.tokens !== undefined) next.tokens = patch.tokens
    if (patch.snapshot) next.snapshot = compact({ ...message.snapshot, ...patch.snapshot })
    if (patch.retry === null) delete next.retry
    else if (patch.retry !== undefined) next.retry = patch.retry
    return next
  }
  if (message.role === "shell") {
    const next = { ...message }
    if (patch.time?.completed !== undefined) next.time = { ...message.time, completed: patch.time.completed }
    if (patch.shell) {
      next.status = patch.shell.status
      if (patch.shell.exit !== undefined) next.exit = patch.shell.exit
      if (patch.shell.signal !== undefined) next.signal = patch.shell.signal
      if (patch.shell.output !== undefined) next.output = patch.shell.output
    }
    return next
  }
  if (patch.time?.created !== undefined) {
    const next = { ...message, time: { ...message.time, created: patch.time.created } }
    if (next.role === "synthetic") delete next.pending
    return next
  }
  return message
}
>>>>>>> upstream/main

<<<<<<< HEAD
/**
 * `bufferUnknown` holds a metadata record for a session this directory does not
 * project yet. Callers enable it only where the record's own directory is not
 * known, so every child store of a live workspace does not accumulate copies of
 * metadata that belongs to another directory.
 */
export function installSessionMetadata(
 state: State,
 metadata: SessionMetadataState,
 options: { bufferUnknown?: boolean } = {},
): State {
 const current = state.session.find((item) => item.sessionId === metadata.sessionId)
 if (!current) {
  if (!options.bufferUnknown) return state
  // Metadata arrives before the session list does: an auto-generated title is
  // announced for a session created moments ago. Dropping it left the sidebar
  // stale until a reload, so it is held until a session record arrives.
  const pending = state.pendingMetadata?.[metadata.sessionId]
  if (pending && (compareCounters(metadata.revision, pending.revision) < 0 || same(pending, metadata))) return state
  const buffered = { ...state.pendingMetadata, [metadata.sessionId]: metadata }
  if (pending === undefined) {
   // Oldest first: object keys keep insertion order, so the records dropped
   // here are the ones that have waited longest for a session that never came.
   const overflow = Object.keys(buffered).length - MAX_PENDING_METADATA
   if (overflow > 0) for (const sessionId of Object.keys(buffered).slice(0, overflow)) delete buffered[sessionId]
||||||| bc50ba56aa
/**
 * A terminal tool state this client manufactured while finalizing an
 * interrupted turn. The server never confirmed it, so an authoritative
 * transition that arrives later supersedes it; every other final state is
 * OpenCode's and stands (a stale replay must not regress it).
 */
function isLocallyMarkedToolState(state: ToolPart["state"]): boolean {
  return state.status === "error" && state.errorSource === "local"
}

function applyToolTransition(part: ToolPart, transition: ToolTransition): ToolPart {
  const state = part.state
  switch (transition.kind) {
    case "input":
      if (state.status !== "pending") return part
      return { ...part, state: { ...state, raw: transition.raw } }
    case "called":
      if (isFinalToolStatus(state.status)) return part
      return {
        ...part,
        executed: transition.executed,
        state: { status: "running", input: transition.input, time: { start: transition.start } },
      }
    case "progress":
      if (state.status !== "running") return part
      return { ...part, state: { ...state, metadata: transition.metadata } }
    case "success": {
      if (isFinalToolStatus(state.status) && !isLocallyMarkedToolState(state)) return part
      const start = state.status === "pending" ? transition.end : state.time.start
      const attachments = transition.attachments
      return withoutUnshownResult({
        ...part,
        executed: transition.executed,
        state: compact({
          status: "completed",
          input: state.input,
          output: transition.output,
          metadata: transition.metadata ?? (state.status === "running" ? state.metadata : undefined),
          time: { start, end: transition.end },
          attachments,
        }),
      })
    }
    case "failed": {
      if (isFinalToolStatus(state.status) && !isLocallyMarkedToolState(state)) return part
      const start = state.status === "pending" ? transition.end : state.time.start
      return withoutUnshownResult({
        ...part,
        executed: transition.executed,
        state: compact({
          status: "error",
          input: state.input,
          error: transition.error,
          errorType: transition.errorType,
          output: transition.output,
          metadata: transition.metadata ?? (state.status === "running" ? state.metadata : undefined),
          time: { start, end: transition.end },
        }),
      })
    }
=======
function isLocallyMarkedToolState(state: ToolPart["state"]): boolean {
  return state.status === "error" && state.errorSource === "local"
}

function applyToolTransition(part: ToolPart, transition: ToolTransition): ToolPart {
  const state = part.state
  switch (transition.kind) {
    case "input":
      if (state.status !== "pending") return part
      return { ...part, state: { ...state, raw: transition.raw } }
    case "called":
      if (isFinalToolStatus(state.status)) return part
      return {
        ...part,
        executed: transition.executed,
        state: { status: "running", input: transition.input, time: { start: transition.start } },
      }
    case "progress":
      if (state.status !== "running") return part
      return { ...part, state: { ...state, metadata: transition.metadata } }
    case "success": {
      if (isFinalToolStatus(state.status) && !isLocallyMarkedToolState(state)) return part
      const start = state.status === "pending" ? transition.end : state.time.start
      const attachments = transition.attachments
      return withoutUnshownResult({
        ...part,
        executed: transition.executed,
        state: compact({
          status: "completed",
          input: state.input,
          output: transition.output,
          metadata: transition.metadata ?? (state.status === "running" ? state.metadata : undefined),
          time: { start, end: transition.end },
          attachments,
        }),
      })
    }
    case "failed": {
      if (isFinalToolStatus(state.status) && !isLocallyMarkedToolState(state)) return part
      const start = state.status === "pending" ? transition.end : state.time.start
      return withoutUnshownResult({
        ...part,
        executed: transition.executed,
        state: compact({
          status: "error",
          input: state.input,
          error: transition.error,
          errorType: transition.errorType,
          output: transition.output,
          metadata: transition.metadata ?? (state.status === "running" ? state.metadata : undefined),
          time: { start, end: transition.end },
        }),
      })
    }
>>>>>>> upstream/main
  }
  return { ...state, pendingMetadata: buffered }
 }
 if (compareCounters(metadata.revision, current.metadataRevision) < 0) return state
 return installHostSession(state, { ...current, metadata: metadata.metadata, metadataRevision: metadata.revision })
}

export function installQueue(state: State, queue: QueueState): State {
 const previous = state.queue[queue.sessionId]
 if (previous && (compareCounters(queue.revision, previous.revision) < 0 || same(previous, queue))) return state
 return { ...state, queue: { ...state.queue, [queue.sessionId]: queue } }
}

<<<<<<< HEAD
function partOwners(messages: readonly Message[]): Record<string, string> {
 const owners: Record<string, string> = {}
 for (const message of messages) for (const part of message.parts) owners[part.partId] = message.messageId
 return owners
}
||||||| bc50ba56aa
// ---------------------------------------------------------------------------
// Directory events — mutates draft in place for batching efficiency.
// Caller MUST pass a mutable copy of State (e.g. structuredClone or spread).
// ---------------------------------------------------------------------------
=======
>>>>>>> upstream/main

/** Runtime history and cursor commit together; Host metadata and queue are independent. */
export function installSessionSnapshot(state: State, snapshot: SessionSnapshot): State {
 const id = snapshot.session.sessionId
 const old = state.snapshot[id]
 if (old?.session.epoch === snapshot.session.epoch && compareCounters(snapshot.session.headSequence, old.session.headSequence) < 0) return state
 const messages = retain(state.message[id] ?? [], snapshot.messages, (message) => message.messageId)
 const approvals = retain(state.permission[id] ?? [], snapshot.approvals, (request) => request.approvalId)
 const questions = retain(state.form[id] ?? [], snapshot.questions, (request) => request.questionId)
 const nextSnapshot = old && same(old, snapshot) ? old : { ...snapshot, messages, approvals, questions }
 let next: State = {
  ...state,
  snapshot: nextSnapshot === old ? state.snapshot : { ...state.snapshot, [id]: nextSnapshot },
  message: messages === state.message[id] ? state.message : { ...state.message, [id]: messages },
  permission: approvals === state.permission[id] ? state.permission : { ...state.permission, [id]: approvals },
  form: questions === state.form[id] ? state.form : { ...state.form, [id]: questions },
  sessionCursor: state.sessionCursor[id] === snapshot.cursor ? state.sessionCursor : { ...state.sessionCursor, [id]: snapshot.cursor },
  sessionEpoch: state.sessionEpoch[id] === snapshot.session.epoch ? state.sessionEpoch : { ...state.sessionEpoch, [id]: snapshot.session.epoch },
  session_status: state.session_status[id] === snapshot.session.runtimeStatus ? state.session_status : { ...state.session_status, [id]: snapshot.session.runtimeStatus },
  sessionStatusInvalidated: clearInvalidation(state.sessionStatusInvalidated, id),
  partOwner: messages === state.message[id] ? state.partOwner : { ...state.partOwner, [id]: partOwners(messages) },
 }
 const projected = state.session.find((session) => session.sessionId === id)
 if (projected) next = installHostSession(next, { ...projected, ...snapshot.session })
 return Object.keys(next).every((key) => next[key as keyof State] === state[key as keyof State]) ? state : next
}

export type DirectoryEventResult = { kind: "applied" | "duplicate" | "resnapshot"; state: State }

/**
 * Live session authority captured before a native run request was sent.
 * `null` means the store held no session record at request start, so there is
 * no head to compare the acknowledgement against.
 */
export type RunControlBaseline = { epoch: string; headSequence: string } | null

/**
 * A native run acknowledgement is a control observation, not transcript history.
 * An accepted run may bind an unbound session (or refresh the same binding); it
 * never replaces a different run another acknowledgement or event already made
 * authoritative. A terminal acknowledgement releases only the run it names, so
 * a late abort for an older run cannot clear a newer one. Full snapshots remain
 * the replacement authority: the next install rewrites both fields wholesale.
 *
 * A live ack is also rejected when the session advanced past the head captured
 * before the request began and still reports no bound run. That means the run
 * was already observed terminal (or replaced) while the HTTP acknowledgement
 * was in flight; binding it then would resurrect the stop control.
 */
export function installRuntimeRun(state: State, run: Run, requestBaseline: RunControlBaseline = null): State {
 const id = run.sessionId
 const snapshot = state.snapshot[id]
 const index = state.session.findIndex((item) => item.sessionId === id)
 if (!snapshot && index < 0) return state
 const boundRunId = snapshot ? snapshot.session.activeRunId : state.session[index]!.activeRunId
 const terminal = run.status === "completed" || run.status === "failed" || run.status === "cancelled"
 if (terminal ? boundRunId !== run.runId : boundRunId !== null && boundRunId !== run.runId) return state
 if (!terminal && boundRunId === null && requestBaseline !== null) {
  const current = snapshot?.session ?? state.session[index]
  if (current && (current.epoch !== requestBaseline.epoch
   || compareCounters(current.headSequence, requestBaseline.headSequence) !== 0)) return state
 }

 const status = terminal ? "idle" : "running"
 const activeRun = terminal ? null : { runId: run.runId, sessionId: id, status: run.status, origin: run.origin, createdAt: run.createdAt }
 // A repeated live ack never downgrades the run record an event may already
 // have advanced; it only fills a binding that is missing.
 const settledLive = !terminal && snapshot?.session.activeRunId === run.runId && snapshot.activeRun !== null && snapshot.session.runtimeStatus === "running"
 let next = state
 if (snapshot && !settledLive && (snapshot.session.activeRunId !== (terminal ? null : run.runId) || snapshot.session.runtimeStatus !== status || !same(snapshot.activeRun, activeRun))) {
  next = {
   ...next,
   snapshot: {
    ...next.snapshot,
    [id]: { ...snapshot, session: { ...snapshot.session, runtimeStatus: status, activeRunId: terminal ? null : run.runId }, activeRun },
   },
  }
 }
 if (next.session_status[id] !== status) next = { ...next, session_status: { ...next.session_status, [id]: status } }
 if (next.sessionStatusInvalidated?.[id]) next = { ...next, sessionStatusInvalidated: clearInvalidation(next.sessionStatusInvalidated, id) }
 const projected = next.session[index]
 if (projected && (projected.runtimeStatus !== status || projected.activeRunId !== (terminal ? null : run.runId))) {
  next = installHostSession(next, { ...projected, runtimeStatus: status, activeRunId: terminal ? null : run.runId })
 } else if (!projected && next !== state) {
  // A snapshot can exist without a projected session record. Record the
  // control mutation so a snapshot read started before this ack cannot
  // install its older idle fields over it.
  const revision = (next.sessionRevision ?? 0) + 1
  next = { ...next, sessionRevision: revision, sessionEventRevision: { ...next.sessionEventRevision, [id]: revision } }
 }
 // Unrelated session updates also advance sessionEventRevision. This marker
 // advances only for the accepted acknowledgement above, so an in-flight
 // snapshot read can identify the exact run-control observation it predates.
 if (next !== state) {
  next = { ...next, runControlRevision: { ...next.runControlRevision, [id]: (next.runControlRevision?.[id] ?? 0) + 1 } }
 }
 // A session without a snapshot keeps the accepted run here: the projected row
 // only carries `activeRunId`, and the loader needs the full record to keep the
 // snapshot's run identity invariant when its first in-flight read lands.
 const pendingRun = next.runControlActiveRun?.[id]
 const wantsPendingRun = !terminal && snapshot === undefined
 if (wantsPendingRun ? !same(pendingRun, activeRun) : pendingRun !== undefined) {
  const runControlActiveRun = { ...next.runControlActiveRun }
  if (wantsPendingRun && activeRun) runControlActiveRun[id] = activeRun
  else delete runControlActiveRun[id]
  next = { ...next, runControlActiveRun }
 }
 // Every transition above early-returns when it has nothing to change, so an
 // unchanged ack is already `state` itself.
 return next
}

/** Every canonical variant shares the same sequence gate. Never apply across a gap. */
export function applyDirectoryEvent(state: State, event: CanonicalEvent): DirectoryEventResult {
 if (event.type === 'btw.delta' || event.type === 'btw.completed' || event.type === 'subagent.updated') return { kind: 'applied', state };
 if (event.type === 'session.recap' || event.type === 'session.suggestion') {
  const id = event.sessionId;
  const snapshot = state.snapshot[id];
  if (!snapshot) return { kind: 'applied', state };
  if (event.epoch !== snapshot.session.epoch) return { kind: 'resnapshot', state };
  const comparison = compareCounters(event.sequence, snapshot.session.headSequence);
  if (comparison <= 0) return { kind: 'duplicate', state };
  if (BigInt(event.sequence) !== BigInt(snapshot.session.headSequence) + 1n) return { kind: 'resnapshot', state };
  const session = { ...snapshot.session, headSequence: event.sequence };
  return {
   kind: 'applied',
   state: {
    ...state,
    snapshot: {
     ...state.snapshot,
     [id]: { ...snapshot, session },
    },
    session: state.session.map(s => s.sessionId === id ? { ...s, headSequence: event.sequence } : s),
   },
  };
 }
 if (event.type === 'cleanse.progress') {
  const id = event.sessionId;
  const existing = state.cleanse?.[id];
  if (existing) {
   const eventEpoch = event.epoch ?? '0';
   const existingEpoch = existing.epoch ?? '0';
   if (eventEpoch === existingEpoch) {
    if (event.sequence && existing.sequence && compareCounters(event.sequence, existing.sequence) < 0) {
     return { kind: 'applied', state };
    }
<<<<<<< HEAD
   } else {
    const eventTime = event.timestamp ?? 0;
    if (eventTime && existing.updatedAt && eventTime < existing.updatedAt) {
     return { kind: 'applied', state };
||||||| bc50ba56aa

    case "session.created": {
      const info = event.properties.info
      const sessions = draft.session
      const result = Binary.search(sessions, info.id, (s) => s.id)
      if (result.found && shouldSkipStaleSessionEvent(sessions[result.index], info)) {
        return false
      }
      if (result.found) {
        // A create echo for a session we already hold (optimistic create, or
        // a replayed event) must not erase title/usage learned since.
        sessions[result.index] = { ...info, ...sessions[result.index] }
      } else {
        sessions.splice(result.index, 0, info)
        trimSessions(draft)
        if (!info.parentID) draft.sessionTotal += 1
      }
      markSessionEvent(info.id, false)
      return true
=======

    case "session.created": {
      const info = event.properties.info
      const sessions = draft.session
      const result = Binary.search(sessions, info.id, (s) => s.id)
      if (result.found && shouldSkipStaleSessionEvent(sessions[result.index], info)) {
        return false
      }
      if (result.found) {
        sessions[result.index] = { ...info, ...sessions[result.index] }
      } else {
        sessions.splice(result.index, 0, info)
        trimSessions(draft)
        if (!info.parentID) draft.sessionTotal += 1
      }
      markSessionEvent(info.id, false)
      return true
>>>>>>> upstream/main
    }
<<<<<<< HEAD
   }
||||||| bc50ba56aa

    case "session.patched": {
      const { sessionID, patch } = event.properties
      const sessions = draft.session
      const result = Binary.search(sessions, sessionID, (s) => s.id)
      if (!result.found) return false
      const next = applySessionPatch(sessions[result.index], patch)
      if (shouldSkipStaleSessionEvent(sessions[result.index], next)) return false

      // Archiving removes the session from the live list; its caches go too.
      if (next.time.archived && !sessions[result.index].time.archived) {
        sessions.splice(result.index, 1)
        cleanupSessionCaches(draft, sessionID)
        draft.sessionStatusInvalidated = { ...draft.sessionStatusInvalidated, [sessionID]: true }
        if (!next.parentID) draft.sessionTotal = Math.max(0, draft.sessionTotal - 1)
        markSessionEvent(sessionID, true)
        return true
      }

      if (areJsonEquivalent(sessions[result.index], next)) return false
      sessions[result.index] = next
      markSessionEvent(sessionID, false)
      return true
    }

    case "session.revert.committed": {
      // OpenCode deleted the boundary message and everything after it without
      // per-message removals, so the same range goes here. The loaded window
      // is always the transcript's tail: a boundary the window does not hold
      // is older than everything loaded, so a matching marker trims it all.
      const { sessionID, to } = event.properties
      const sessions = draft.session
      const result = Binary.search(sessions, sessionID, (s) => s.id)
      const session = result.found ? sessions[result.index] : undefined
      const messages = draft.message[sessionID]
      let changed = false
      if (messages && messages.length > 0) {
        const index = findMessageIndex(messages, to)
        const from = index >= 0 ? index : session?.revert?.messageID === to ? 0 : -1
        if (from >= 0) {
          for (const removed of messages.slice(from)) delete draft.part[removed.id]
          draft.message[sessionID] = messages.slice(0, from)
          changed = true
        }
      }
      if (session?.revert) {
        const rest = { ...session }
        delete rest.revert
        sessions[result.index] = rest
        markSessionEvent(sessionID, false)
        changed = true
      }
      return changed
    }

    case "session.deleted": {
      const sessions = draft.session
      const { sessionID } = event.properties
      const result = Binary.search(sessions, sessionID, (s) => s.id)
      const info = result.found ? sessions[result.index] : undefined
      if (result.found) sessions.splice(result.index, 1)
      cleanupSessionCaches(draft, sessionID)
      if (draft.sessionStatusInvalidated?.[sessionID]) {
        draft.sessionStatusInvalidated = { ...draft.sessionStatusInvalidated }
        delete draft.sessionStatusInvalidated[sessionID]
      }
      if (!info?.parentID) draft.sessionTotal = Math.max(0, draft.sessionTotal - 1)
      markSessionEvent(sessionID, true)
      return true
    }

    case "session.status": {
      const { sessionID, status } = event.properties
      const wasInvalidated = draft.sessionStatusInvalidated?.[sessionID] === true
      if (wasInvalidated) {
        draft.sessionStatusInvalidated = { ...draft.sessionStatusInvalidated }
        delete draft.sessionStatusInvalidated[sessionID]
      }
      if (areSessionStatusesEqual(draft.session_status[sessionID], status)) {
        return wasInvalidated
      }
      draft.session_status[sessionID] = status
      return true
    }

    case "session.idle":
    case "session.error": {
      // An error ends the turn; it is not a lasting status.
      const { sessionID } = event.properties
      const status = { type: "idle" } as const
      const wasInvalidated = draft.sessionStatusInvalidated?.[sessionID] === true
      if (wasInvalidated) {
        draft.sessionStatusInvalidated = { ...draft.sessionStatusInvalidated }
        delete draft.sessionStatusInvalidated[sessionID]
      }
      if (areSessionStatusesEqual(draft.session_status[sessionID], status)) {
        return wasInvalidated
      }
      draft.session_status[sessionID] = status
      return true
    }

    case "message.updated": {
      let info = event.properties.info
      const messages = draft.message[info.sessionID]
      if (!messages) {
        draft.message[info.sessionID] = [info]
        return true
      }
      // A compaction settles the record that has been running, the way
      // OpenCode's own message store does: `session.compaction.ended` carries
      // no input id, so the settled record keeps the running one's identity.
      const runningCompaction = info.role === "compaction" && info.status !== "running"
        ? findRunningCompactionIndex(messages)
        : -1
      if (runningCompaction >= 0) {
        const running = messages[runningCompaction]
        info = { ...info, id: running.id, time: { ...running.time } }
      }
      const messageIndex = findMessageIndex(messages, info.id)
      if (messageIndex >= 0) {
        // Skip message replacement if unchanged — preserves reference, avoids re-render
        const existing = messages[messageIndex]
        if (areJsonEquivalent(existing, info)) {
          syncDebug.reducer.messageUpdatedUnchanged(info.sessionID, info.id, info.role, undefined, undefined)
          return false
        }
        const next = [...messages]
        if (compareMessagesChronologically(existing, info) === 0) {
          next[messageIndex] = info
        } else {
          next.splice(messageIndex, 1)
          insertMessageChronologically(next, info)
        }
        draft.message[info.sessionID] = next
      } else {
        const next = [...messages]
        insertMessageChronologically(next, info)
        draft.message[info.sessionID] = next
      }
      return true
    }

    case "message.patched": {
      const { sessionID, messageID, patch } = event.properties
      const messages = draft.message[sessionID]
      if (!messages) {
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-owning-message", sessionID, messageID },
        }
      }
      const shellID = messageID.startsWith("shell:") ? messageID.slice("shell:".length) : undefined
      const messageIndex = shellID ? findShellMessageIndex(messages, shellID) : findMessageIndex(messages, messageID)
      if (messageIndex < 0) {
        if (shellID) return false
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-owning-message", sessionID, messageID },
        }
      }
      const existing = messages[messageIndex]
      const updated = applyMessagePatch(existing, patch)
      if (updated === existing || areJsonEquivalent(existing, updated)) return false
      const next = [...messages]
      if (compareMessagesChronologically(existing, updated) === 0) {
        next[messageIndex] = updated
      } else {
        next.splice(messageIndex, 1)
        insertMessageChronologically(next, updated)
      }
      draft.message[sessionID] = next
      return true
    }

    case "message.compaction.delta": {
      const { sessionID, delta } = event.properties
      const messages = draft.message[sessionID]
      if (!messages || !delta) return false
      const index = findRunningCompactionIndex(messages)
      if (index < 0) return false
      const running = messages[index]
      if (running.role !== "compaction") return false
      const next = [...messages]
      next[index] = { ...running, summary: running.summary + delta }
      draft.message[sessionID] = next
      return true
    }

    case "message.removed": {
      const { sessionID, messageID } = event.properties
      const messages = draft.message[sessionID]
      if (messages) {
        const next = [...messages]
        const messageIndex = findMessageIndex(next, messageID)
        if (messageIndex >= 0) {
          next.splice(messageIndex, 1)
          draft.message[sessionID] = next
        }
      }
      delete draft.part[messageID]
      return true
    }

    case "message.part.updated": {
      const { sessionID, part } = event.properties
      const messageID = part.messageID
      const missingOwningMessage = !hasMessage(draft, sessionID, messageID)
      const parts = draft.part[messageID]
      if (!parts) {
        syncDebug.reducer.partUpdatedNoExistingParts(messageID, part.id, part.type)
        draft.part[messageID] = [part]
        return missingOwningMessage
          ? {
            changed: true,
            materialization: { type: "incomplete-session-snapshot", reason: "missing-owning-message", sessionID, messageID, partID: part.id },
          }
          : true
      }
      const next = [...parts]
      const partIndex = next.findIndex((candidate) => candidate.id === part.id)
      if (partIndex >= 0) {
        const previous = next[partIndex]
        if (shouldPreserveExistingPart(previous, part)) {
          return false
        }
        const dedupeFields = getUpdatedDeltaFields(previous, part)
        const settled = withStreamedStart(previous, part)
        // SAFETY: the dedupe marker is a private annotation the delta reducer
        // strips again; the part itself is unchanged.
        next[partIndex] = dedupeFields.length > 0
          ? ({ ...settled, __dedupeNextDeltaFields: dedupeFields } as Part & DedupeMetadata)
          : settled
      } else {
        next.push(part)
      }
      draft.part[messageID] = next
      return missingOwningMessage
        ? {
          changed: true,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-owning-message", sessionID, messageID, partID: part.id },
        }
        : true
    }

    case "message.parts.replaced": {
      const { sessionID, messageID, parts } = event.properties
      const missingOwningMessage = !hasMessage(draft, sessionID, messageID)
      const existing = draft.part[messageID]
      if (existing && areJsonEquivalent(existing, parts)) return false
      draft.part[messageID] = parts
      return missingOwningMessage
        ? {
          changed: true,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-owning-message", sessionID, messageID },
        }
        : true
    }

    case "message.part.delta": {
      const { sessionID, messageID, partID, field, delta } = event.properties
      const parts = draft.part[messageID]
      if (!parts) {
        syncDebug.reducer.partDeltaNoParts(messageID, partID)
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "orphan-delta", sessionID, messageID, partID },
        }
      }
      const partIndex = parts.findIndex((part) => part.id === partID)
      if (partIndex < 0) {
        syncDebug.reducer.partDeltaNotFound(messageID, partID)
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-delta-part", sessionID, messageID, partID },
        }
      }
      const existing = parts[partIndex]
      const next = [...parts]
      if (field === "raw") {
        if (existing.type !== "tool" || existing.state.status !== "pending") return false
        next[partIndex] = { ...existing, state: { ...existing.state, raw: existing.state.raw + delta } }
        draft.part[messageID] = next
        return true
      }
      if (existing.type !== "text" && existing.type !== "reasoning") return false
      // SAFETY: the marker is only ever set by the snapshot branch above.
      const dedupeFields = (existing as DedupeMetadata).__dedupeNextDeltaFields ?? []
      const shouldDedupe = dedupeFields.includes(field)
      // Create new Part object + new array so React detects the change
      // SAFETY: same private marker as above on an otherwise unchanged part.
      next[partIndex] = {
        ...existing,
        text: shouldDedupe ? appendNonOverlappingDelta(existing.text, delta) : existing.text + delta,
        __dedupeNextDeltaFields: dedupeFields.filter((candidate) => candidate !== field),
      } as Part & DedupeMetadata
      draft.part[messageID] = next
      return true
    }

    case "message.tool.transition": {
      const { sessionID, messageID, partID, transition } = event.properties
      const parts = draft.part[messageID]
      if (!parts) {
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "orphan-delta", sessionID, messageID, partID },
        }
      }
      const partIndex = parts.findIndex((part) => part.id === partID)
      const existing = partIndex >= 0 ? parts[partIndex] : undefined
      if (!existing || existing.type !== "tool") {
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-delta-part", sessionID, messageID, partID },
        }
      }
      const updated = applyToolTransition(existing, transition)
      if (updated === existing) return false
      const next = [...parts]
      next[partIndex] = updated
      draft.part[messageID] = next
      return true
    }

    case "vcs.branch.updated": {
      const { branch } = event.properties
      if (draft.vcs?.branch === branch) return false
      draft.vcs = compact({ ...draft.vcs, branch })
      return true
    }

    case "permission.asked": {
      const permission = event.properties
      const permissions = draft.permission[permission.sessionID] ?? []
      const next = [...permissions]
      const result = Binary.search(next, permission.id, (p) => p.id)
      if (result.found) {
        next[result.index] = permission
      } else {
        next.splice(result.index, 0, permission)
      }
      draft.permission[permission.sessionID] = next
      return true
    }

    case "permission.replied": {
      const { sessionID, requestID } = event.properties
      const permissions = draft.permission[sessionID]
      if (!permissions) return false
      const result = Binary.search(permissions, requestID, (p) => p.id)
      if (result.found) {
        const next = [...permissions]
        next.splice(result.index, 1)
        draft.permission[sessionID] = next
        return true
      }
      return false
    }

    case "form.created": {
      const form = event.properties.form
      const forms = draft.form[form.sessionID] ?? []
      const next = [...forms]
      const result = Binary.search(next, form.id, (f) => f.id)
      if (result.found) {
        next[result.index] = form
      } else {
        next.splice(result.index, 0, form)
      }
      draft.form[form.sessionID] = next
      return true
    }

    case "form.settled": {
      const { sessionID, formID } = event.properties
      const forms = draft.form[sessionID]
      if (!forms) return false
      const result = Binary.search(forms, formID, (f) => f.id)
      if (result.found) {
        const next = [...forms]
        next.splice(result.index, 1)
        draft.form[sessionID] = next
        return true
      }
      return false
    }

    case "mcp.status.changed": {
      callbacks?.onLoadMcp?.()
      return false
    }

    case "catalog.updated": {
      callbacks?.onCatalogUpdated?.(event.properties.kind)
      return false
    }

    default:
      return false
=======

    case "session.patched": {
      const { sessionID, patch } = event.properties
      const sessions = draft.session
      const result = Binary.search(sessions, sessionID, (s) => s.id)
      if (!result.found) return false
      const next = applySessionPatch(sessions[result.index], patch)
      if (shouldSkipStaleSessionEvent(sessions[result.index], next)) return false

      if (next.time.archived && !sessions[result.index].time.archived) {
        sessions.splice(result.index, 1)
        cleanupSessionCaches(draft, sessionID)
        draft.sessionStatusInvalidated = { ...draft.sessionStatusInvalidated, [sessionID]: true }
        if (!next.parentID) draft.sessionTotal = Math.max(0, draft.sessionTotal - 1)
        markSessionEvent(sessionID, true)
        return true
      }

      if (areJsonEquivalent(sessions[result.index], next)) return false
      sessions[result.index] = next
      markSessionEvent(sessionID, false)
      return true
    }

    case "session.revert.committed": {
      const { sessionID, to } = event.properties
      const sessions = draft.session
      const result = Binary.search(sessions, sessionID, (s) => s.id)
      const session = result.found ? sessions[result.index] : undefined
      const messages = draft.message[sessionID]
      let changed = false
      if (messages && messages.length > 0) {
        const index = findMessageIndex(messages, to)
        const from = index >= 0 ? index : session?.revert?.messageID === to ? 0 : -1
        if (from >= 0) {
          for (const removed of messages.slice(from)) delete draft.part[removed.id]
          draft.message[sessionID] = messages.slice(0, from)
          changed = true
        }
      }
      if (session?.revert) {
        const rest = { ...session }
        delete rest.revert
        sessions[result.index] = rest
        markSessionEvent(sessionID, false)
        changed = true
      }
      return changed
    }

    case "session.deleted": {
      const sessions = draft.session
      const { sessionID } = event.properties
      const result = Binary.search(sessions, sessionID, (s) => s.id)
      const info = result.found ? sessions[result.index] : undefined
      if (result.found) sessions.splice(result.index, 1)
      cleanupSessionCaches(draft, sessionID)
      if (draft.sessionStatusInvalidated?.[sessionID]) {
        draft.sessionStatusInvalidated = { ...draft.sessionStatusInvalidated }
        delete draft.sessionStatusInvalidated[sessionID]
      }
      if (!info?.parentID) draft.sessionTotal = Math.max(0, draft.sessionTotal - 1)
      markSessionEvent(sessionID, true)
      return true
    }

    case "session.status": {
      const { sessionID, status } = event.properties
      const wasInvalidated = draft.sessionStatusInvalidated?.[sessionID] === true
      if (wasInvalidated) {
        draft.sessionStatusInvalidated = { ...draft.sessionStatusInvalidated }
        delete draft.sessionStatusInvalidated[sessionID]
      }
      if (areSessionStatusesEqual(draft.session_status[sessionID], status)) {
        return wasInvalidated
      }
      draft.session_status[sessionID] = status
      return true
    }

    case "session.idle":
    case "session.error": {
      const { sessionID } = event.properties
      const status = { type: "idle" } as const
      const wasInvalidated = draft.sessionStatusInvalidated?.[sessionID] === true
      if (wasInvalidated) {
        draft.sessionStatusInvalidated = { ...draft.sessionStatusInvalidated }
        delete draft.sessionStatusInvalidated[sessionID]
      }
      if (areSessionStatusesEqual(draft.session_status[sessionID], status)) {
        return wasInvalidated
      }
      draft.session_status[sessionID] = status
      return true
    }

    case "message.updated": {
      let info = event.properties.info
      const messages = draft.message[info.sessionID]
      if (!messages) {
        draft.message[info.sessionID] = [info]
        return true
      }
      const runningCompaction = info.role === "compaction" && info.status !== "running"
        ? findRunningCompactionIndex(messages)
        : -1
      if (runningCompaction >= 0) {
        const running = messages[runningCompaction]
        info = { ...info, id: running.id, time: { ...running.time } }
      }
      const messageIndex = findMessageIndex(messages, info.id)
      if (messageIndex >= 0) {
        const existing = messages[messageIndex]
        if (areJsonEquivalent(existing, info)) {
          syncDebug.reducer.messageUpdatedUnchanged(info.sessionID, info.id, info.role, undefined, undefined)
          return false
        }
        const next = [...messages]
        if (compareMessagesChronologically(existing, info) === 0) {
          next[messageIndex] = info
        } else {
          next.splice(messageIndex, 1)
          insertMessageChronologically(next, info)
        }
        draft.message[info.sessionID] = next
      } else {
        const next = [...messages]
        insertMessageChronologically(next, info)
        draft.message[info.sessionID] = next
      }
      return true
    }

    case "message.patched": {
      const { sessionID, messageID, patch } = event.properties
      const messages = draft.message[sessionID]
      if (!messages) {
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-owning-message", sessionID, messageID },
        }
      }
      const shellID = messageID.startsWith("shell:") ? messageID.slice("shell:".length) : undefined
      const messageIndex = shellID ? findShellMessageIndex(messages, shellID) : findMessageIndex(messages, messageID)
      if (messageIndex < 0) {
        if (shellID) return false
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-owning-message", sessionID, messageID },
        }
      }
      const existing = messages[messageIndex]
      const updated = applyMessagePatch(existing, patch)
      if (updated === existing || areJsonEquivalent(existing, updated)) return false
      const next = [...messages]
      if (compareMessagesChronologically(existing, updated) === 0) {
        next[messageIndex] = updated
      } else {
        next.splice(messageIndex, 1)
        insertMessageChronologically(next, updated)
      }
      draft.message[sessionID] = next
      return true
    }

    case "message.compaction.delta": {
      const { sessionID, delta } = event.properties
      const messages = draft.message[sessionID]
      if (!messages || !delta) return false
      const index = findRunningCompactionIndex(messages)
      if (index < 0) return false
      const running = messages[index]
      if (running.role !== "compaction") return false
      const next = [...messages]
      next[index] = { ...running, summary: running.summary + delta }
      draft.message[sessionID] = next
      return true
    }

    case "message.removed": {
      const { sessionID, messageID } = event.properties
      const messages = draft.message[sessionID]
      if (messages) {
        const next = [...messages]
        const messageIndex = findMessageIndex(next, messageID)
        if (messageIndex >= 0) {
          next.splice(messageIndex, 1)
          draft.message[sessionID] = next
        }
      }
      delete draft.part[messageID]
      return true
    }

    case "message.part.updated": {
      const { sessionID, part } = event.properties
      const messageID = part.messageID
      const missingOwningMessage = !hasMessage(draft, sessionID, messageID)
      const parts = draft.part[messageID]
      if (!parts) {
        syncDebug.reducer.partUpdatedNoExistingParts(messageID, part.id, part.type)
        draft.part[messageID] = [part]
        return missingOwningMessage
          ? {
            changed: true,
            materialization: { type: "incomplete-session-snapshot", reason: "missing-owning-message", sessionID, messageID, partID: part.id },
          }
          : true
      }
      const next = [...parts]
      const partIndex = next.findIndex((candidate) => candidate.id === part.id)
      if (partIndex >= 0) {
        const previous = next[partIndex]
        if (shouldPreserveExistingPart(previous, part)) {
          return false
        }
        const dedupeFields = getUpdatedDeltaFields(previous, part)
        const settled = withStreamedStart(previous, part)
        // SAFETY: the dedupe marker is a private annotation the delta reducer
        // strips again; the part itself is unchanged.
        next[partIndex] = dedupeFields.length > 0
          ? ({ ...settled, __dedupeNextDeltaFields: dedupeFields } as Part & DedupeMetadata)
          : settled
      } else {
        next.push(part)
      }
      draft.part[messageID] = next
      return missingOwningMessage
        ? {
          changed: true,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-owning-message", sessionID, messageID, partID: part.id },
        }
        : true
    }

    case "message.parts.replaced": {
      const { sessionID, messageID, parts } = event.properties
      const missingOwningMessage = !hasMessage(draft, sessionID, messageID)
      const existing = draft.part[messageID]
      if (existing && areJsonEquivalent(existing, parts)) return false
      draft.part[messageID] = parts
      return missingOwningMessage
        ? {
          changed: true,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-owning-message", sessionID, messageID },
        }
        : true
    }

    case "message.part.delta": {
      const { sessionID, messageID, partID, field, delta } = event.properties
      const parts = draft.part[messageID]
      if (!parts) {
        syncDebug.reducer.partDeltaNoParts(messageID, partID)
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "orphan-delta", sessionID, messageID, partID },
        }
      }
      const partIndex = parts.findIndex((part) => part.id === partID)
      if (partIndex < 0) {
        syncDebug.reducer.partDeltaNotFound(messageID, partID)
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-delta-part", sessionID, messageID, partID },
        }
      }
      const existing = parts[partIndex]
      const next = [...parts]
      if (field === "raw") {
        if (existing.type !== "tool" || existing.state.status !== "pending") return false
        next[partIndex] = { ...existing, state: { ...existing.state, raw: existing.state.raw + delta } }
        draft.part[messageID] = next
        return true
      }
      if (existing.type !== "text" && existing.type !== "reasoning") return false
      // SAFETY: the marker is only ever set by the snapshot branch above.
      const dedupeFields = (existing as DedupeMetadata).__dedupeNextDeltaFields ?? []
      const shouldDedupe = dedupeFields.includes(field)
      // SAFETY: same private marker as above on an otherwise unchanged part.
      next[partIndex] = {
        ...existing,
        text: shouldDedupe ? appendNonOverlappingDelta(existing.text, delta) : existing.text + delta,
        __dedupeNextDeltaFields: dedupeFields.filter((candidate) => candidate !== field),
      } as Part & DedupeMetadata
      draft.part[messageID] = next
      return true
    }

    case "message.tool.transition": {
      const { sessionID, messageID, partID, transition } = event.properties
      const parts = draft.part[messageID]
      if (!parts) {
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "orphan-delta", sessionID, messageID, partID },
        }
      }
      const partIndex = parts.findIndex((part) => part.id === partID)
      const existing = partIndex >= 0 ? parts[partIndex] : undefined
      if (!existing || existing.type !== "tool") {
        return {
          changed: false,
          materialization: { type: "incomplete-session-snapshot", reason: "missing-delta-part", sessionID, messageID, partID },
        }
      }
      const updated = applyToolTransition(existing, transition)
      if (updated === existing) return false
      const next = [...parts]
      next[partIndex] = updated
      draft.part[messageID] = next
      return true
    }

    case "vcs.branch.updated": {
      const { branch } = event.properties
      if (draft.vcs?.branch === branch) return false
      draft.vcs = compact({ ...draft.vcs, branch })
      return true
    }

    case "permission.asked": {
      const permission = event.properties
      const permissions = draft.permission[permission.sessionID] ?? []
      const next = [...permissions]
      const result = Binary.search(next, permission.id, (p) => p.id)
      if (result.found) {
        next[result.index] = permission
      } else {
        next.splice(result.index, 0, permission)
      }
      draft.permission[permission.sessionID] = next
      return true
    }

    case "permission.replied": {
      const { sessionID, requestID } = event.properties
      const permissions = draft.permission[sessionID]
      if (!permissions) return false
      const result = Binary.search(permissions, requestID, (p) => p.id)
      if (result.found) {
        const next = [...permissions]
        next.splice(result.index, 1)
        draft.permission[sessionID] = next
        return true
      }
      return false
    }

    case "form.created": {
      const form = event.properties.form
      const forms = draft.form[form.sessionID] ?? []
      const next = [...forms]
      const result = Binary.search(next, form.id, (f) => f.id)
      if (result.found) {
        next[result.index] = form
      } else {
        next.splice(result.index, 0, form)
      }
      draft.form[form.sessionID] = next
      return true
    }

    case "form.settled": {
      const { sessionID, formID } = event.properties
      const forms = draft.form[sessionID]
      if (!forms) return false
      const result = Binary.search(forms, formID, (f) => f.id)
      if (result.found) {
        const next = [...forms]
        next.splice(result.index, 1)
        draft.form[sessionID] = next
        return true
      }
      return false
    }

    case "mcp.status.changed": {
      callbacks?.onLoadMcp?.()
      return false
    }

    case "catalog.updated": {
      callbacks?.onCatalogUpdated?.(event.properties.kind)
      return false
    }

    default:
      return false
>>>>>>> upstream/main
  }
<<<<<<< HEAD
  const nextCleanseState: CleanseProgressState = {
   sessionId: id,
   epoch: event.epoch ?? '0',
   sequence: event.sequence ?? '0',
   status: event.status,
   activeCheckers: [...event.activeCheckers],
   completedCheckers: [...event.completedCheckers],
   repairedFiles: [...event.repairedFiles],
   diagnosticsCount: event.diagnosticsCount,
   summary: event.summary,
   updatedAt: event.timestamp ?? Date.now(),
  };
  return {
   kind: 'applied',
   state: {
    ...state,
    cleanse: {
     ...state.cleanse,
     [id]: nextCleanseState,
    },
   },
  };
 }
 if (event.type === 'advisor_yielded') {
  const id = event.sessionId;
  const existing = state.advisor?.[id];
  const eventEpoch = event.epoch ?? '0';
  if (existing) {
   const existingEpoch = existing.epoch ?? '0';
   if (eventEpoch === existingEpoch) {
    if (event.sequence && existing.sequence && compareCounters(event.sequence, existing.sequence) < 0) {
     return { kind: 'applied', state };
    }
   } else {
    const eventTime = event.timestamp ?? 0;
    if (eventTime && existing.updatedAt && eventTime < existing.updatedAt) {
     return { kind: 'applied', state };
    }
   }
  }
  const priorNotes = existing && existing.epoch === eventEpoch ? existing.notes : [];
  const notes = mergeAdvisorNotes(priorNotes, event.notes);
  const nextAdvisorState: AdvisorState = {
   sessionId: id,
   epoch: eventEpoch,
   sequence: event.sequence ?? '0',
   notes,
   updatedAt: event.timestamp ?? Date.now(),
  };
  return {
   kind: 'applied',
   state: {
    ...state,
    advisor: {
     ...state.advisor,
     [id]: nextAdvisorState,
    },
   },
  };
 }
 const id = event.sessionId
 const snapshot = state.snapshot[id]
 if (!snapshot) {
  // A session this directory does not project yet. Deletion and a Host session
  // record are authoritative on their own: an auto-generated title or a
  // deletion announced before the list was read must not be dropped and
  // recovered later. Everything else still needs the epoch and head the
  // snapshot carries, so it asks for a resnapshot.
  if (event.type === 'session.deleted') {
   const released = state.pendingMetadata
    ? event.deletedSessionIds.filter((sessionId) => state.pendingMetadata?.[sessionId] !== undefined)
    : []
   if (released.length === 0) return { kind: 'applied', state }
   const pendingMetadata = { ...state.pendingMetadata }
   for (const sessionId of released) delete pendingMetadata[sessionId]
   return { kind: 'applied', state: { ...state, pendingMetadata } }
  }
  if (event.type === 'session.updated' && event.session) {
   if (event.session.sessionId !== id || event.session.epoch !== event.epoch || compareCounters(event.session.headSequence, event.sequence) > 0) {
    return { kind: 'resnapshot', state }
   }
   const pending = state.pendingMetadata?.[id]
   let session: Session = {
    ...event.session, metadata: event.metadata ?? null,
    metadataRevision: event.metadataRevision ?? '0',
    archiveRevision: event.archiveRevision ?? '0',
   }
   if (event.mode) session.mode = event.mode
   if (event.continuationPending !== undefined) session.continuationPending = event.continuationPending
   if (event.title !== undefined) session.title = event.title
   if (event.loop !== undefined) session.loop = event.loop
   // A metadata record announced before the list was read is newer than the
   // projection this event carries; keep the announced one.
   if (pending && compareCounters(pending.revision, session.metadataRevision) >= 0) {
    session = { ...session, metadata: pending.metadata, metadataRevision: pending.revision }
   }
   if (event.archiveRevision !== undefined) {
    session = { ...session, archiveRevision: event.archiveRevision }
    if (event.archivedAt === null) delete session.archivedAt
    else if (event.archivedAt !== undefined) session.archivedAt = event.archivedAt
   }
   return { kind: 'applied', state: installHostSession(state, session) }
  }
  return { kind: "resnapshot", state }
 }
 if (event.epoch !== snapshot.session.epoch) return { kind: "resnapshot", state }
 const comparison = compareCounters(event.sequence, snapshot.session.headSequence)
 if (comparison <= 0) return { kind: "duplicate", state }
 if (BigInt(event.sequence) !== BigInt(snapshot.session.headSequence) + 1n) return { kind: "resnapshot", state }
 let next = state
 let updated = snapshot
 let messages = state.message[id] ?? snapshot.messages
 let turns = snapshot.turns
 let owners = state.partOwner[id] ?? {}
 let recover = false
 const updateMessage = (messageId: string, change: (message: Message) => Message) => {
  const index = messages.findIndex((message) => message.messageId === messageId)
  if (index < 0) { recover = true; return }
  const current = messages[index]!
  const message = change(current)
  if (message === current) return
  messages = [...messages]
  messages[index] = message
 }
 const updatePart = (partId: string, change: (part: Part) => Part) => {
  const messageId = owners[partId]
  if (!messageId) { recover = true; return }
  updateMessage(messageId, (message) => {
   const index = message.parts.findIndex((part) => part.partId === partId)
   if (index < 0) { recover = true; return message }
   const part = change(message.parts[index]!)
   if (part === message.parts[index]) return message
   const parts = [...message.parts]
   parts[index] = part
   return { ...message, parts }
  })
 }
 const upsertPart = (messageId: string, part: Part) => {
  if (owners[part.partId] !== undefined && owners[part.partId] !== messageId) { recover = true; return }
  updateMessage(messageId, (message) => {
   const index = message.parts.findIndex((item) => item.partId === part.partId)
   if (index >= 0 && same(message.parts[index], part)) return message
   const parts = [...message.parts]
   if (index < 0) parts.push(part)
   else parts[index] = part
   owners = { ...owners, [part.partId]: messageId }
   return { ...message, parts }
  })
 }
 switch (event.type) {
  case "session.updated": {
   if (event.session) {
    if (event.session.sessionId !== id || event.session.epoch !== event.epoch || event.session.workspaceId !== snapshot.session.workspaceId || compareCounters(event.session.headSequence, event.sequence) > 0) { recover = true; break }
    updated = { ...updated, session: { ...event.session, ...(event.mode ? { mode: event.mode } : {}) } }
   } else if (event.mode) {
    updated = { ...updated, session: { ...updated.session, mode: event.mode } }
   }
   if (event.continuationPending !== undefined) updated = { ...updated, session: { ...updated.session, continuationPending: event.continuationPending } }
   if (event.title !== undefined) updated = { ...updated, session: { ...updated.session, title: event.title } }
   if (event.selection !== undefined) updated = { ...updated, selection: event.selection }
   if (event.compacting !== undefined) updated = { ...updated, compacting: event.compacting }
   if (event.todos !== undefined) updated = { ...updated, todos: event.todos }
   if (event.loop !== undefined) updated = { ...updated, session: { ...updated.session, loop: event.loop } }
   const current = next.session.find((session) => session.sessionId === id)
   if (current) {
    let session: Session = { ...current, ...(event.session ?? {}), ...(event.mode ? { mode: event.mode } : {}), ...(event.continuationPending === undefined ? {} : { continuationPending: event.continuationPending }), ...(event.title === undefined ? {} : { title: event.title }), ...(event.loop !== undefined ? { loop: event.loop } : {}) }
    if (event.metadataRevision !== undefined && compareCounters(event.metadataRevision, current.metadataRevision) >= 0) {
     session = { ...session, metadata: event.metadata ?? null, metadataRevision: event.metadataRevision }
    }
    if (event.archiveRevision !== undefined && compareCounters(event.archiveRevision, current.archiveRevision) >= 0) {
     session = { ...session, archiveRevision: event.archiveRevision }
     if (event.archivedAt === null) delete session.archivedAt
     else if (event.archivedAt !== undefined) session.archivedAt = event.archivedAt
    }
    next = installHostSession(next, session)
   }
   break
  }
  case "session.deleted": {
   const deleted = new Set(event.deletedSessionIds)
   const session = next.session.filter((item) => !deleted.has(item.sessionId))
   const without = <T>(record: Record<string, T>): Record<string, T> => {
    if (!event.deletedSessionIds.some((key) => Object.hasOwn(record, key))) return record
    const result = { ...record }
    for (const key of deleted) delete result[key]
    return result
   }
   const revision = (next.sessionRevision ?? 0) + 1
   const sessionDeletedRevision = { ...next.sessionDeletedRevision }
   for (const sessionId of deleted) sessionDeletedRevision[sessionId] = revision
   return {
    kind: "applied", state: {
     ...next, session, sessionTotal: session.length,
     sessionRevision: revision, sessionDeletedRevision,
     // A metadata record buffered for a session that is now gone would be
     // applied to a later session with the same id, or leak for the process's
     // lifetime. The no-snapshot branch above releases them too.
     pendingMetadata: without(next.pendingMetadata ?? {}),
     snapshot: without(next.snapshot), message: without(next.message), permission: without(next.permission), form: without(next.form),
     queue: without(next.queue), partOwner: without(next.partOwner), session_status: without(next.session_status),
     cleanse: without(next.cleanse), advisor: without(next.advisor),
     runControlActiveRun: next.runControlActiveRun ? without(next.runControlActiveRun) : next.runControlActiveRun,
     sessionCursor: without(next.sessionCursor), sessionEpoch: without(next.sessionEpoch), sessionStatusInvalidated: next.sessionStatusInvalidated ? without(next.sessionStatusInvalidated) : next.sessionStatusInvalidated,
    }
   }
  }
  case "session.status":
   updated = { ...updated, session: { ...updated.session, runtimeStatus: event.runtimeStatus, activeRunId: event.activeRunId } }
   if (event.activeRunId === null) updated = { ...updated, activeRun: null }
   break
  case "run.started":
   updated = { ...updated, activeRun: { runId: event.runId, sessionId: id, status: "running", origin: event.origin ?? "host", createdAt: event.createdAt }, session: { ...updated.session, runtimeStatus: "running", activeRunId: event.runId } }
   break
  case "run.completed":
  case "run.failed":
  case "run.cancelled":
   if (updated.session.activeRunId === event.runId) updated = { ...updated, activeRun: null, session: { ...updated.session, runtimeStatus: "idle", activeRunId: null } }
   break
  case "turn.started":
   if (!turns.some((turn) => turn.turnId === event.turnId)) turns = [...turns, { turnId: event.turnId, sessionId: id, runId: event.runId, status: "running", userMessageId: event.userMessageId, assistantMessageIds: [], startedAt: event.timestamp }]
   break
  case "turn.completed": {
   const index = turns.findIndex((turn) => turn.turnId === event.turnId)
   if (index < 0) { recover = true; break }
   turns = [...turns]
   if (turns[index]!.runId !== event.runId) { recover = true; break }
   turns[index] = { ...turns[index]!, status: "completed", finishedAt: event.timestamp }
   break
  }
  case "message.created": {
   if (!messages.some((message) => message.messageId === event.messageId)) messages = [...messages, { messageId: event.messageId, sessionId: id, turnId: event.turnId, role: event.role, createdAt: event.timestamp, parts: [], ...(event.providerId === undefined ? {} : { providerId: event.providerId }), ...(event.modelId === undefined ? {} : { modelId: event.modelId }), ...(event.usage === undefined ? {} : { usage: event.usage }), ...(event.timing === undefined ? {} : { timing: event.timing }) }]
   if (event.role === "assistant") {
    const index = turns.findIndex((turn) => turn.turnId === event.turnId)
    if (index < 0) { recover = true; break }
    if (!turns[index]!.assistantMessageIds.includes(event.messageId)) {
     turns = [...turns]
     turns[index] = { ...turns[index]!, assistantMessageIds: [...turns[index]!.assistantMessageIds, event.messageId] }
    }
   }
   break
  }
  case "message.updated":
   updateMessage(event.messageId, (message) => {
    const providerId = event.providerId ?? message.providerId
    const modelId = event.modelId ?? message.modelId
    const usage = event.usage ?? message.usage
    const timing = event.timing ?? message.timing
    return providerId === message.providerId && modelId === message.modelId && same(usage, message.usage) && same(timing, message.timing) ? message : { ...message, ...(providerId === undefined ? {} : { providerId }), ...(modelId === undefined ? {} : { modelId }), ...(usage === undefined ? {} : { usage }), ...(timing === undefined ? {} : { timing }) }
   })
   break
  case "part.started": upsertPart(event.messageId, event.part); break
  case "part.updated":
  case "part.completed": {
   const messageId = owners[event.part.partId]
   if (!messageId) recover = true
   else upsertPart(messageId, event.part)
   break
  }
  case "part.delta":
   updatePart(event.partId, (part) => {
    if (part.type !== "text" && part.type !== "reasoning") { recover = true; return part }
    return event.delta.length === 0 ? part : { ...part, content: part.content + event.delta }
   })
   break
  case "tool.started":
  case "tool.completed": {
   // The envelope has a toolCallId, not a part/message identity. Limit lookup to
   // this addressed session; tool_result remains its independently authored part.
   let found = false
   for (const message of messages) {
    const call = message.parts.find((part) => part.type === "tool_call" && part.toolCallId === event.toolCallId)
    if (!call || call.type !== "tool_call") continue
    found = true
    updatePart(call.partId, (part) => {
     const status = event.type === "tool.started" ? "running" : event.status
     return part.type === "tool_call" && part.status !== status ? { ...part, status } : part
    })
    break
   }
   if (!found) recover = true
   break
  }
  case "approval.requested":
  case "approval.resolved": {
   const request = event.approval
   if (request.sessionId !== id || request.epoch !== event.epoch) { recover = true; break }
   const prior = updated.approvals.find((item) => item.approvalId === request.approvalId)
   if (prior && prior.workerGeneration !== request.workerGeneration) { recover = true; break }
   if (!prior || compareCounters(request.version, prior.version) > 0) {
    const approvals = updated.approvals.filter((item) => item.approvalId !== request.approvalId)
    if (request.status === "pending") approvals.push(request)
    updated = { ...updated, approvals }
   }
   break
  }
  case "question.requested":
  case "question.resolved": {
   const request = event.question
   if (request.sessionId !== id || request.epoch !== event.epoch) { recover = true; break }
   const prior = updated.questions.find((item) => item.questionId === request.questionId)
   if (prior && prior.workerGeneration !== request.workerGeneration) { recover = true; break }
   if (!prior || compareCounters(request.version, prior.version) > 0) {
    const questions = updated.questions.filter((item) => item.questionId !== request.questionId)
    if (request.status === "pending") questions.push(request)
    updated = { ...updated, questions }
   }
   break
  }
  case "queue.updated":
   if (event.queue.sessionId !== id) recover = true
   else next = installQueue(next, event.queue)
   break
  case "catalog.updated": {
   const worker = event.catalog.state.worker
   if (worker.workspaceId !== snapshot.session.workspaceId || worker.rootSessionId !== snapshot.session.rootSessionId) { recover = true; break }
   const key = `${worker.rootSessionId}\n${event.catalog.kind}`
   const previous = next.catalog[key]
   if (!previous || previous.state.worker.workerGeneration !== worker.workerGeneration || compareCounters(event.catalog.state.catalogRevision, previous.state.catalogRevision) > 0) next = { ...next, catalog: { ...next.catalog, [key]: event.catalog } }
   break
  }
  case "shell.updated": {
   if (event.job.sessionId !== id || event.job.epoch !== event.epoch || event.job.workspaceId !== snapshot.session.workspaceId) { recover = true; break }
   const previous = next.shell[event.job.jobId]
   if (!previous || previous.workerGeneration !== event.job.workerGeneration || previous.epoch !== event.job.epoch || (previous.status !== "ended" && compareCounters(event.job.outputCursor, previous.outputCursor) >= 0)) next = { ...next, shell: { ...next.shell, [event.job.jobId]: event.job } }
   break
  }
  case "session.compacted": recover = true; break
  default: { const exhaustive: never = event; return exhaustive }
 }
 if (recover) return { kind: "resnapshot", state }
 updated = {
  ...updated, messages, turns,
  // `updatedAt` is the native transcript's mtime as the Agent Service reported
  // it. Bumping it with the event's wall clock mixed two clocks for a recency
  // tie-break; the snapshot keeps the service's own value, and the next list
  // read carries the file's newer mtime.
  session: { ...updated.session, epoch: event.epoch, headSequence: event.sequence },
  window: turns === snapshot.turns && messages === (state.message[id] ?? snapshot.messages) ? updated.window : { ...updated.window, firstTurnId: turns[0]?.turnId ?? null, lastTurnId: turns.at(-1)?.turnId ?? null, firstMessageId: messages[0]?.messageId ?? null, lastMessageId: messages.at(-1)?.messageId ?? null },
  branch: event.type === "message.created" ? { ...updated.branch, leafMessageId: messages.at(-1)?.messageId ?? null } : updated.branch,
 }
 const committed: State = {
  ...next,
  snapshot: { ...next.snapshot, [id]: updated },
  message: messages === state.message[id] ? next.message : { ...next.message, [id]: messages },
  partOwner: owners === state.partOwner[id] ? next.partOwner : { ...next.partOwner, [id]: owners },
  permission: updated.approvals === snapshot.approvals ? next.permission : { ...next.permission, [id]: updated.approvals },
  form: updated.questions === snapshot.questions ? next.form : { ...next.form, [id]: updated.questions },
  session_status: updated.session.runtimeStatus === state.session_status[id] ? next.session_status : { ...next.session_status, [id]: updated.session.runtimeStatus },
  sessionStatusInvalidated: clearInvalidation(next.sessionStatusInvalidated, id),
 }
 return { kind: "applied", state: committed }
||||||| bc50ba56aa
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trimSessions(draft: State) {
  if (draft.session.length <= draft.limit) return
  // Sessions with a pending permission or form stay and do not count toward
  // the limit: the composer finds a subagent's requests through its parent
  // link in this list.
  const isBlocking = (sessionID: string) =>
    (draft.permission[sessionID]?.length ?? 0) > 0 || (draft.form[sessionID]?.length ?? 0) > 0
  // Drop the oldest by creation time. The array is sorted by id, and session
  // ids descend with time, so its head holds the newest session: trimming by
  // position evicted a just-created subagent before its requests arrived.
  const trimmable = draft.session
    .filter((session) => !isBlocking(session.id))
    .sort((a, b) => a.time.created - b.time.created)
  const excess = trimmable.length - draft.limit
  if (excess <= 0) return
  const dropped = new Set(trimmable.slice(0, excess).map((session) => session.id))
  draft.session = draft.session.filter((session) => !dropped.has(session.id))
}

function cleanupSessionCaches(draft: State, sessionID: string) {
  if (!sessionID) return
  dropSessionCaches(draft, [sessionID])
=======
}


function trimSessions(draft: State) {
  if (draft.session.length <= draft.limit) return
  const isBlocking = (sessionID: string) =>
    (draft.permission[sessionID]?.length ?? 0) > 0 || (draft.form[sessionID]?.length ?? 0) > 0
  const trimmable = draft.session
    .filter((session) => !isBlocking(session.id))
    .sort((a, b) => a.time.created - b.time.created)
  const excess = trimmable.length - draft.limit
  if (excess <= 0) return
  const dropped = new Set(trimmable.slice(0, excess).map((session) => session.id))
  draft.session = draft.session.filter((session) => !dropped.has(session.id))
}

function cleanupSessionCaches(draft: State, sessionID: string) {
  if (!sessionID) return
  draft.message = { ...draft.message }
  draft.part = { ...draft.part }
  draft.session_status = { ...draft.session_status }
  draft.permission = { ...draft.permission }
  draft.form = { ...draft.form }
  dropSessionCaches(draft, [sessionID])
>>>>>>> upstream/main
}
