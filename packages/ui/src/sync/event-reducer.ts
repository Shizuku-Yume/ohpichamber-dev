
import type { AdvisorNote, CanonicalEvent, Message, Part, QueueState, Run, Session, SessionMetadataState, SessionSnapshot } from "@openchamber/agent-contract"
import type { AdvisorState, CleanseProgressState, State } from "./types"
import { omitKeys } from "@/lib/omitKeys"

export function compareCounters(left: string, right: string): number {
 return left.length === right.length ? (left < right ? -1 : left > right ? 1 : 0) : left.length < right.length ? -1 : 1
}

/**
 * Allocation-free structural equality for the plain JSON-shaped records the
 * canonical contract carries. Objects compare key-set-wise (order is not
 * semantic), strings bail on length before the engine's byte comparison, and
 * recursion exits at the first difference instead of serializing both sides
 * whole. NaN never appears in validated payloads; it compares unequal here.
 */
function structuralEquals(left: unknown, right: unknown): boolean {
 if (left === right) return true
 if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false
 if (Array.isArray(left)) {
  if (!Array.isArray(right) || left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
   if (!structuralEquals(left[index], right[index])) return false
  }
  return true
 }
 if (Array.isArray(right)) return false
 const leftKeys = Object.keys(left)
 const rightKeys = Object.keys(right)
 if (leftKeys.length !== rightKeys.length) return false
 const leftRecord = left as Record<string, unknown>
 const rightRecord = right as Record<string, unknown>
 for (const key of leftKeys) {
  if (!Object.hasOwn(rightRecord, key) || !structuralEquals(leftRecord[key], rightRecord[key])) return false
 }
 return true
}
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
 const next = incoming.map((item) => { const old = prior.get(key(item)); return old && structuralEquals(old, item) ? old : item })
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
 return structuralEquals(previous, next) ? previous : next
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
}

/**
 * The most metadata records one directory's store holds for sessions it has
 * not seen. The buffer bridges an announcement that arrives before the list
 * read, so it only ever holds the handful of sessions created since that read;
 * a record whose session never arrives must not accumulate forever.
 */
const MAX_PENDING_METADATA = 256;

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
  if (pending && (compareCounters(metadata.revision, pending.revision) < 0 || structuralEquals(pending, metadata))) return state
  const buffered = { ...state.pendingMetadata, [metadata.sessionId]: metadata }
  if (pending === undefined) {
   // Oldest first: object keys keep insertion order, so the records dropped
   // here are the ones that have waited longest for a session that never came.
   const overflow = Object.keys(buffered).length - MAX_PENDING_METADATA
   if (overflow > 0) for (const sessionId of Object.keys(buffered).slice(0, overflow)) delete buffered[sessionId]
  }
  return { ...state, pendingMetadata: buffered }
 }
 if (compareCounters(metadata.revision, current.metadataRevision) < 0) return state
 return installHostSession(state, { ...current, metadata: metadata.metadata, metadataRevision: metadata.revision })
}

export function installQueue(state: State, queue: QueueState): State {
 const previous = state.queue[queue.sessionId]
 if (previous && (compareCounters(queue.revision, previous.revision) < 0 || structuralEquals(previous, queue))) return state
 return { ...state, queue: { ...state.queue, [queue.sessionId]: queue } }
}

function partOwners(messages: readonly Message[]): Record<string, string> {
 const owners: Record<string, string> = {}
 for (const message of messages) for (const part of message.parts) owners[part.partId] = message.messageId
 return owners
}

/** Runtime history and cursor commit together; Host metadata and queue are independent. */
export function installSessionSnapshot(state: State, snapshot: SessionSnapshot): State {
 const id = snapshot.session.sessionId
 const old = state.snapshot[id]
 if (old?.session.epoch === snapshot.session.epoch && compareCounters(snapshot.session.headSequence, old.session.headSequence) < 0) return state
 const messages = retain(state.message[id] ?? [], snapshot.messages, (message) => message.messageId)
 const approvals = retain(state.permission[id] ?? [], snapshot.approvals, (request) => request.approvalId)
 const questions = retain(state.form[id] ?? [], snapshot.questions, (request) => request.questionId)
 // Compare the candidate with its retained arrays substituted, never the raw
 // payload: `retain` has already canonicalized unchanged elements by deep
 // equality, so element references decide the arrays in O(count) instead of
 // re-walking every byte of transcript content on each snapshot install.
 const candidate = { ...snapshot, messages, approvals, questions }
 const nextSnapshot = old && structuralEquals(old, candidate) ? old : candidate
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
 if (snapshot && !settledLive && (snapshot.session.activeRunId !== (terminal ? null : run.runId) || snapshot.session.runtimeStatus !== status || !structuralEquals(snapshot.activeRun, activeRun))) {
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
 if (wantsPendingRun ? !structuralEquals(pendingRun, activeRun) : pendingRun !== undefined) {
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
 if (event.type === 'btw.delta' || event.type === 'btw.completed' || event.type === 'subagent.updated' || event.type === 'session.recap' || event.type === 'session.suggestion') {
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
   } else {
    const eventTime = event.timestamp ?? 0;
    if (eventTime && existing.updatedAt && eventTime < existing.updatedAt) {
     return { kind: 'applied', state };
    }
   }
  }
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
   if (index >= 0 && structuralEquals(message.parts[index], part)) return message
   const parts = [...message.parts]
   if (index < 0) parts.push(part)
   else parts[index] = part
   if (owners[part.partId] !== messageId) owners = { ...owners, [part.partId]: messageId }
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
    return providerId === message.providerId && modelId === message.modelId && structuralEquals(usage, message.usage) && structuralEquals(timing, message.timing) ? message : { ...message, ...(providerId === undefined ? {} : { providerId }), ...(modelId === undefined ? {} : { modelId }), ...(usage === undefined ? {} : { usage }), ...(timing === undefined ? {} : { timing }) }
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
}

