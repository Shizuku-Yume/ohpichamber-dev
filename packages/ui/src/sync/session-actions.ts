<<<<<<< HEAD
/**
 * Session actions — Canonical Client operations and their UI reconciliation.
 * Host-owned archive and filesystem helpers keep their independent boundary.
 */
||||||| bc50ba56aa
/**
 * Session actions — SDK-calling operations for session management.
 * Replaces the action methods from the old useSessionStore.
 */
=======
>>>>>>> upstream/main

<<<<<<< HEAD
// The review-flow callback signature is retained for its Task 16 cutover;
// session records and action responses use the Canonical contract directly.
import { useSessionUIStore } from "./session-ui-store"
||||||| bc50ba56aa
import type { FilePart, FormRequest, JsonValue, Message, Metadata, ModelSelection, Part, PermissionRequest, Session, SyntheticMessage, TextPart, UserMessage } from "@/lib/opencode/model"
import { compact, partIds } from "@/lib/opencode/model"
import { readSubagentRun } from "@/lib/opencode/subagent-run"
import { isAutoModel } from "@/lib/routing/autoModel"
import { Binary } from "./binary"
import { dropSessionCaches } from "./session-cache"
import { forkAtTranscriptCut, isTurnBoundary, transcriptCutAfterMessage, transcriptCutForMessage } from "./transcript-cut"
import { useSessionUIStore } from "./session-ui-store"
import { useSelectionStore } from "./selection-store"
import {
  noteLocalFormCancelled,
  noteLocalFormReplied,
  submitRecoveredAnswer,
  type RecoveredQuestion,
} from "./recoverable-questions"
import { resolveCheckedSendSelection, resolveSendSelection } from "./session-selection"
import { useInputStore } from "./input-store"
=======
import type { FilePart, FormRequest, JsonValue, Message, Metadata, ModelSelection, Part, PermissionRequest, Session, SyntheticMessage, TextPart, UserMessage } from "@/lib/opencode/model"
import { compact, partIds } from "@/lib/opencode/model"
import { readSubagentRun } from "@/lib/opencode/subagent-run"
import { attachmentBasename, withMissingCitations } from "@/lib/attachmentIdentity"
import { isAutoModel } from "@/lib/routing/autoModel"
import { Binary } from "./binary"
import { dropSessionCaches } from "./session-cache"
import { forkAtTranscriptCut, isTurnBoundary, transcriptCutAfterMessage, transcriptCutForMessage } from "./transcript-cut"
import { useSessionUIStore, type SentMessage } from "./session-ui-store"
import { useSelectionStore } from "./selection-store"
import {
  DEFERRED_ANSWER_LEAD_IN,
  DEFERRED_QUESTION_NOTE,
  deferredAnswerMetadata,
  formReleaseKey,
  formToolLink,
  formTurnHold,
  isWaitingQuestionCall,
  noteFormToolReleased,
  noteLocalFormCancelled,
  noteLocalFormReplied,
  submitRecoveredAnswer,
  useRecoverableQuestionsStore,
  type RecoveredQuestion,
} from "./recoverable-questions"
import { resolveCheckedSendSelection, resolveSendSelection } from "./session-selection"
import { useInputStore } from "./input-store"
>>>>>>> upstream/main
import type { ChildStoreManager } from "./child-store"
import { computeSubtreeIds } from "./scoped-blocking-requests"
<<<<<<< HEAD
import type { ContextPartMetadata } from '@/lib/messages/contextParts'
type SyntheticContextInput = { id?: string; text: string; metadata?: ContextPartMetadata }
||||||| bc50ba56aa
import { withUserWorkTitle } from "@/lib/sessionWorkTitle"
import { opencodeClient, type SyntheticContextInput } from "@/lib/opencode/client"
import { findMessagePageItem } from "@/lib/opencode/messagePaging"
import { toJsonRecord } from "@/lib/opencode/json"
import { ascendingId } from "@/lib/opencode/ids"
=======
import { withUserWorkTitle } from "@/lib/sessionWorkTitle"
import { opencodeClient, type SyntheticContextInput } from "@/lib/opencode/client"
import { withSessionMetadata } from "@/lib/opencode/projection"
import { findMessagePageItem } from "@/lib/opencode/messagePaging"
import { toJsonRecord } from "@/lib/opencode/json"
import { ascendingId } from "@/lib/opencode/ids"
>>>>>>> upstream/main
import { mergeSessionDirectoryMetadata, resolveGlobalSessionDirectory, useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
<<<<<<< HEAD
||||||| bc50ba56aa
import { readGlobalSessionLineage } from "@/stores/sessionLineage"
import { isRestorableOnItsOwn } from "./session-restore-rule"
=======
import { findWorktreeHoldingDirectory } from "@/lib/worktrees/worktreePaths"
import { createMessageQueueTarget, useMessageQueueStore } from "@/stores/messageQueueStore"
import { followSessionTabMove } from "@/lib/sessionTabs"
import { useSessionFoldersStore } from "@/stores/useSessionFoldersStore"
import { readGlobalSessionLineage } from "@/stores/sessionLineage"
import { isRestorableOnItsOwn } from "./session-restore-rule"
>>>>>>> upstream/main
import { useConfigStore } from "@/stores/useConfigStore"
<<<<<<< HEAD
import { registerSessionDirectory } from "./sync-refs"
import { isRestorableOnItsOwn } from "./session-restore-rule"
import { useGlobalSessionStatusStore, removeGlobalSessionStatuses } from "./global-session-status"
||||||| bc50ba56aa
import { waitForOpenCodeStartup } from "./opencode-startup-gate"
import { getAllSyncSessions, getDirectoryState, registerSessionDirectory } from "./sync-refs"
import { useGlobalSessionStatusStore } from "./global-session-status"
=======
import { waitForOpenCodeStartup } from "./opencode-startup-gate"
import { getAllSyncSessionMap, getDirectoryState, registerSessionDirectory } from "./sync-refs"
import { useGlobalSessionStatusStore } from "./global-session-status"
>>>>>>> upstream/main
import { recordSendFailure } from "./send-failure-log"
import {
 withoutReviewSessionLink,
 type SessionMetadataRecord,
} from "@/lib/sessionReviewMetadata"
import { withContextObligatoryMessage, type ContextObligatoryMessage } from "@/lib/contextObligatoryMessages"
<<<<<<< HEAD
import type { LinkedIssue } from "@/lib/linkedIssues"
import { withSessionWorkState, type SessionWork } from "@/lib/sessionWorkMetadata"
import { withSessionPinned } from "@/lib/sessionPins"
||||||| bc50ba56aa
import { getBtwOriginalSessionID, getBtwSessionID, isBtwSession, withoutBtwSessionLink } from "@/lib/sessionBtwMetadata"
import { type LinkedIssue } from "@/lib/linkedIssues"
import { withSessionWorkState, type SessionWork } from "@/lib/sessionWorkMetadata"
import { withSessionPinned } from "@/lib/sessionPins"
=======
import { getBtwOriginalSessionID, getBtwSessionID, isBtwSession, withoutBtwSessionLink } from "@/lib/sessionBtwMetadata"
import { type LinkedIssue } from "@/lib/linkedIssues"
import { withSessionWorkClosed, withSessionWorkState, type SessionWork } from "@/lib/sessionWorkMetadata"
import { isPinnedMetadata, withSessionPinned } from "@/lib/sessionPins"
>>>>>>> upstream/main
import { getImperativeSessionMessageLoader } from "./session-message-loader"
import { clearSessionPrefetch } from "./session-prefetch-cache"
import { dropSessionCaches } from "./session-cache"
import { useInputStore } from "./input-store"
import { useSessionSuggestionStore } from "@/stores/useSessionSuggestionStore"
import { cleanupPersistedSessionState } from "./session-deletion-cleanup"
import { requestSessionArchiveBatch, requestSessionLinksUpdate, requestSessionUnarchiveBatch, type SessionArchiveStamp } from "./session-archive-batch"
import { markSessionUnreadSeen } from "./session-unread"
<<<<<<< HEAD
import { getRuntimeKey, getRuntimeSwitchRevision } from "@/lib/runtime-switch"
||||||| bc50ba56aa
import { captureRuntimeInstance, getRuntimeKey } from "@/lib/runtime-switch"
=======
import { captureRuntimeInstance, getRuntimeKey } from "@/lib/runtime-switch"
import { markDefiniteTransportFailure } from "@/lib/relay/transport-error"
>>>>>>> upstream/main
import { isRelayModeActive } from "@/lib/relay/runtime-tunnel"
import { retireSessionIdentity } from "./session-rekey-registry"
import { getErrorStatus, isAmbiguousSendFailure } from "./send-failure-classification"
<<<<<<< HEAD
||||||| bc50ba56aa
import { isFormRequestNotFoundError } from "./form-request-error"
import { getStaleRunningToolMessageID } from "./materialization"
=======
import { isFormAlreadySettledError, isFormRequestNotFoundError } from "./form-request-error"
import { ConnectionLostError } from "./connection-lost-error"
import { getStaleRunningToolMessageID } from "./materialization"
>>>>>>> upstream/main
import { promoteRestoredSessionOrdering } from "./session-ordering"
import { normalizePath } from "@/lib/pathNormalization"
import { deleteChatDirectory } from "@/lib/chatDirectories"
import { cancelSessionTitleGeneration } from "./session-title-generation"
import { recordSessionActionFailure } from "./session-action-failures"
import { withoutSourceOwnedLinks } from "@/lib/sessionForkInheritance"
import { canonicalClient, CanonicalApiError } from "@/api/canonicalClient"
import { SessionMetadataSchema, SessionMetadataPatchSchema, PromptRequestSchema } from "@openchamber/agent-contract"
import type { Session as CanonicalSession, Message as CanonicalMessage, SessionSnapshot, SessionBranchResult, SessionMetadataState, PromptRequest, ApprovalRequest as PermissionRequest, QuestionRequest as FormRequest, ApprovalReply, QuestionReply, JsonValue, JsonObject as Metadata, SessionMetadata, SessionCreateRequest, Run, Workspace } from "@openchamber/agent-contract"
import { installHostSession, installRuntimeRun, installSessionMetadata, installSessionSnapshot, type RunControlBaseline } from "./event-reducer"
import { registerWorkspaceDirectory, resolveWorkspaceDirectory } from "@/stores/globalSessions"
import type { State } from "./types"

async function readCanonicalSession(sessionId: string, runtimeKey: string, runtimeRevision = getRuntimeSwitchRevision()): Promise<CanonicalSession> {
 if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
 const knownChild = getGlobalSessionSnapshot(sessionId) ?? findLiveSession(sessionId)
 if (knownChild?.parentSessionId) {
  const history = await canonicalClient.getHistory(sessionId)
  if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
  if (history.sessionId !== sessionId) throw new Error("Session history identified another session")
  return knownChild
 }
 const snapshot = await canonicalClient.getSession(sessionId)
 if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
 const metadata = await canonicalClient.getSessionMetadata(sessionId)
 if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== sessionId || metadata.sessionId !== sessionId) throw new Error("Session response identified another session")
 let host = getGlobalSessionSnapshot(sessionId) ?? findLiveSession(sessionId)
 if (!host) {
  const page = await canonicalClient.listSessions(snapshot.session.workspaceId)
  if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
  host = page.items.find((session) => session.sessionId === sessionId) ?? null
  if (!host) throw new Error("Host session projection is unavailable")
 }
 const session: CanonicalSession = {
  ...snapshot.session, metadata: metadata.metadata, metadataRevision: metadata.revision,
  archiveRevision: host.archiveRevision,
 }
 if (host.archivedAt !== undefined) session.archivedAt = host.archivedAt
 return session
}

function publishCanonicalSession(session: CanonicalSession, directory?: string): void {
 const ownedDirectory = resolveGlobalSessionDirectory(session) ?? directory
 if (ownedDirectory) registerSessionDirectory(session.sessionId, ownedDirectory)
 useGlobalSessionsStore.getState().upsertSession(session)
 for (const [candidateDirectory, store] of _childStores?.children ?? []) {
  if (candidateDirectory !== ownedDirectory && !store.getState().session.some((candidate) => candidate.sessionId === session.sessionId)) continue
  store.setState((state) => {
   const next = installHostSession(state, session)
   return next === state ? state : { ...next, ...sessionMutationPatch(state, session.sessionId, false) }
  })
 }
}

function publishCanonicalMetadata(base: CanonicalSession, metadata: SessionMetadataState): CanonicalSession {
 const current = getGlobalSessionSnapshot(base.sessionId) ?? base
 const updated = mergeSessionDirectoryMetadata({ ...current, metadata: metadata.metadata, metadataRevision: metadata.revision }, current)
 useGlobalSessionsStore.getState().upsertSession(updated)
 for (const store of _childStores?.children.values() ?? []) {
  store.setState((state) => {
   const next = installSessionMetadata(state, metadata)
   return next === state ? state : { ...next, ...sessionMutationPatch(state, base.sessionId, false) }
  })
 }
 return updated
}
export function applyCanonicalMetadataEvent(metadata: SessionMetadataState): void {
 let current = getGlobalSessionSnapshot(metadata.sessionId)
 if (!current && _childStores) {
  for (const store of _childStores.children.values()) {
   const candidate = store.getState().session.find((s) => s.sessionId === metadata.sessionId)
   if (candidate) {
    current = candidate
    break
   }
  }
 }
 if (current) {
  const updated = mergeSessionDirectoryMetadata(
   { ...current, metadata: metadata.metadata, metadataRevision: metadata.revision },
   current,
  )
  useGlobalSessionsStore.getState().upsertSession(updated)
 }
 // No child holds it yet: the record's directory is unknown here, so it is
 // buffered in one store and released when that directory's list names the
 // session. Buffering it in every open store would accumulate copies that
 // belong to a directory whose list never changes.
 let buffered = false
 for (const store of _childStores?.children.values() ?? []) {
  const holdsSession = store.getState().session.some((candidate) => candidate.sessionId === metadata.sessionId)
  store.setState((state) => {
   const next = installSessionMetadata(state, metadata, { bufferUnknown: !buffered && !holdsSession })
   if (next !== state) buffered = true
   return next === state ? state : { ...next, ...sessionMutationPatch(state, metadata.sessionId, false) }
  })
 }
}


export type SessionSendInput = {
 sessionId: string
 request: PromptRequest
 mode?: "run" | "steer" | "follow-up"
 runtimeKey?: string
 runtimeRevision?: number
 commandId?: string
 directory?: string | null
 optimistic?: boolean
 onOptimisticInsert?: () => void
}

/**
 * Native delivery never generates a message ID or retries an ambiguous send.
 * Returns the accepted outer run for the default mode so callers can correlate
 * the canonical turn and user message with this specific send.
 */
export async function sendMessage(input: SessionSendInput): Promise<Run | null> {
 useSessionSuggestionStore.getState().clearSuggestion(input.sessionId)
 const runtimeKey = input.runtimeKey ?? getRuntimeKey()
 const runtimeRevision = input.runtimeRevision ?? getRuntimeSwitchRevision()
 if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
 const request = PromptRequestSchema.parse(input.request)
 await waitForConnectionOrThrow()
 if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
 if (input.mode === "steer") {
  const result = await canonicalClient.steer(input.sessionId, request, input.commandId)
  if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
  if (result.sessionId !== input.sessionId) throw new Error("Steer response identified another session")
  return null
 } else if (input.mode === "follow-up") {
  const result = await canonicalClient.followUp(input.sessionId, request, input.commandId)
  if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
  if (result.sessionId !== input.sessionId) throw new Error("Follow-up response identified another session")
  return null
 } else {
  const directory = input.directory ?? getSessionDirectory(input.sessionId)
  const snapshot = directory ? _childStores?.getChild(directory)?.getState().snapshot[input.sessionId] : undefined
  const refreshAfterAcceptance = !snapshot || snapshot.session.runtimeStatus === "unavailable"
  _ensureSessionStream?.(input.sessionId, directory)

  const isOptimistic = Boolean(input.optimistic && _optimisticAdd && _optimisticRemove)
  let correlationId: string | undefined
  let pendingMessage: CanonicalMessage | undefined
  let knownMessageIds: Set<string> | undefined

  if (isOptimistic) {
   correlationId = `msg_${globalThis.crypto.randomUUID()}`
   const text = request.input.text
   const parts: CanonicalMessage['parts'] = [{ type: "text", partId: `part_${globalThis.crypto.randomUUID()}`, content: text }]
   for (const attachment of request.input.attachments ?? []) {
    parts.push({
     type: "attachment",
     partId: `part_${globalThis.crypto.randomUUID()}`,
     attachmentId: attachment.attachmentId,
     name: attachment.name,
     mediaType: attachment.mediaType,
     size: attachment.size,
     uri: attachment.uri,
    })
   }
   pendingMessage = {
    messageId: correlationId,
    sessionId: input.sessionId,
    turnId: `turn_${globalThis.crypto.randomUUID()}`,
    role: "user",
    createdAt: Date.now(),
    parts,
   }
   knownMessageIds = new Set(
    (directory ? _childStores?.getChild(directory)?.getState().message[input.sessionId] : undefined)
     ?.map((message) => message.messageId) ?? [],
   )
   _optimisticAdd!({ sessionId: input.sessionId, directory, message: pendingMessage })
   input.onOptimisticInsert?.()
  }

  try {
   const baselines = captureRunControlBaselines(input.sessionId)
   const result = await canonicalClient.createRun(input.sessionId, request, input.commandId)
   if (result.run.sessionId !== input.sessionId) throw new Error("Run response identified another session")
   if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
   publishRuntimeRun(result.run, baselines)
   if (refreshAfterAcceptance) _ensureSessionStream?.(input.sessionId, directory, { refreshSnapshot: true })

   if (isOptimistic && pendingMessage && knownMessageIds) {
    reconcileAcceptedSend({
     runtimeKey,
     sessionId: input.sessionId,
     directory,
     pendingMessage,
     content: request.input.text,
     runId: result.run.runId,
     knownMessageIds,
    })
   }

   return result.run
  } catch (error) {
   if (isOptimistic && correlationId) {
    if (!isStaleRuntime(runtimeKey) && runtimeRevision === getRuntimeSwitchRevision()) {
     _optimisticRemove!({ sessionId: input.sessionId, directory, messageId: correlationId })
     recordSendFailure({
      sessionId: input.sessionId,
      messageId: correlationId,
      directory: directory ?? null,
      status: getErrorStatus(error),
      ambiguous: isAmbiguousSendFailure(error),
      confirmationChecked: false,
      reason: error instanceof Error ? error.message : String(error),
     })
    }
   }
   throw error
  }
 }
}

type RunControlBaselines = ReadonlyMap<string, RunControlBaseline>

/** Per-store live head authority captured before a native run request. */
function captureRunControlBaselines(sessionId: string): RunControlBaselines {
 const baselines = new Map<string, RunControlBaseline>()
 for (const [directory, store] of _childStores?.children ?? []) {
  const state = store.getState()
  const session = state.snapshot[sessionId]?.session ?? state.session.find((item) => item.sessionId === sessionId)
  baselines.set(directory, session ? { epoch: session.epoch, headSequence: session.headSequence } : null)
 }
 return baselines
}

/**
 * Apply a native run acknowledgement to every store that already holds the
 * session. Stores are never created here: an ack for a session no store knows
 * about has nothing to reconcile, and a guessed directory would be worse than
 * waiting for the authoritative snapshot.
 */
function publishRuntimeRun(run: Run, baselines?: RunControlBaselines): void {
 for (const [directory, store] of _childStores?.children ?? []) {
  const state = store.getState()
  if (!state.snapshot[run.sessionId] && !state.session.some((session) => session.sessionId === run.sessionId)) continue
  store.setState((current) => installRuntimeRun(current, run, baselines?.get(directory) ?? null))
 }
}

<<<<<<< HEAD
// Reference set by SyncProvider — allows actions to access the stores
||||||| bc50ba56aa
const MESSAGE_REFETCH_LIMIT = 100
const SEND_CONFIRMATION_REFETCH_LIMIT = 30
// A relay-tunnel send fails when the tunnel drops, and the confirming refetch
// then has to travel over that same tunnel to answer "did my message land?".
// Two attempts 150ms apart always answered "no" on a remote connection, so an
// accepted prompt looked like a failed one and got re-sent — two AI responses
// for one user message. Wait for the connection to actually come back (an
// authoritative signal, not a blind sleep), then retry with backoff. A healthy
// connection skips the wait and answers on the first attempt.
const SEND_CONFIRMATION_REFETCH_ATTEMPTS = 3
const SEND_CONFIRMATION_REFETCH_BASE_RETRY_MS = 250
const SEND_CONFIRMATION_RECONNECT_TIMEOUT_MS = 3000
const SEND_CONFIRMATION_RECONNECT_POLL_MS = 100
// Reference set by SyncProvider — allows actions to access the stores
=======
const MESSAGE_REFETCH_LIMIT = 100
const SEND_CONFIRMATION_REFETCH_LIMIT = 30
const SEND_CONFIRMATION_REFETCH_ATTEMPTS = 3
const SEND_CONFIRMATION_REFETCH_BASE_RETRY_MS = 250
const SEND_CONFIRMATION_RECONNECT_TIMEOUT_MS = 3000
const SEND_CONFIRMATION_RECONNECT_POLL_MS = 100
>>>>>>> upstream/main
let _childStores: ChildStoreManager | null = null
let _getDirectory: () => string = () => ""
let _enqueueSessionMaterialization: ((directory: string, sessionID: string, messageID: string) => void) | null = null
let _ensureSessionStream: ((sessionId: string, directory?: string | null, options?: { refreshSnapshot: boolean }) => void) | null = null
let _detachSessionStream: ((sessionId: string, directory: string) => void) | null = null
export type OptimisticAddInput = { sessionId: string; directory?: string | null; message: CanonicalMessage }
export type OptimisticRemoveInput = { sessionId: string; directory?: string | null; messageId: string }
export type OptimisticConfirmInput = OptimisticRemoveInput

let _optimisticAdd: ((input: OptimisticAddInput) => void) | null = null
let _optimisticRemove: ((input: OptimisticRemoveInput) => void) | null = null
let _optimisticConfirm: ((input: OptimisticConfirmInput) => void) | null = null

<<<<<<< HEAD
export function optimisticAdd(input: OptimisticAddInput): void { _optimisticAdd?.(input) }
export function optimisticRemove(input: OptimisticRemoveInput): void { _optimisticRemove?.(input) }
/**
 * Revision patch for one or more sessions changing in the same store write.
 *
 * A batch bumps the revision once, because it is one state change: consumers
 * compare revisions to decide whether their view of the list is stale, and a
 * batch leaves them stale exactly once rather than once per session.
 */
||||||| bc50ba56aa
/**
 * Revision patch for one or more sessions changing in the same store write.
 *
 * A batch bumps the revision once, because it is one state change: consumers
 * compare revisions to decide whether their view of the list is stale, and a
 * batch leaves them stale exactly once rather than once per session.
 */
=======
>>>>>>> upstream/main
function sessionsMutationPatch(
 state: ReturnType<DirectoryStoreApi["getState"]>,
 sessionIds: Iterable<string>,
 deleted: boolean,
) {
 const revision = (state.sessionRevision ?? 0) + 1
 const sessionEventRevision = { ...(state.sessionEventRevision ?? {}) }
 const sessionDeletedRevision = { ...(state.sessionDeletedRevision ?? {}) }
 for (const sessionId of sessionIds) {
  if (deleted) {
   sessionDeletedRevision[sessionId] = revision
   delete sessionEventRevision[sessionId]
  } else {
   sessionEventRevision[sessionId] = revision
   delete sessionDeletedRevision[sessionId]
  }
 }
 return {
  sessionListSource: "live" as const,
  sessionRevision: revision,
  sessionEventRevision,
  sessionDeletedRevision,
 }
}

function sessionMutationPatch(
 state: ReturnType<DirectoryStoreApi["getState"]>,
 sessionId: string,
 deleted: boolean,
) {
 return sessionsMutationPatch(state, [sessionId], deleted)
}

function purgeSessionCaches(state: State, ids: string[]) {
 const next = {
  ...state, message: { ...state.message }, snapshot: { ...state.snapshot }, partOwner: { ...state.partOwner },
  sessionEpoch: { ...state.sessionEpoch }, sessionCursor: { ...state.sessionCursor }, session_status: { ...state.session_status },
  sessionStatusInvalidated: { ...state.sessionStatusInvalidated }, permission: { ...state.permission }, form: { ...state.form }
 }
 dropSessionCaches(next, ids)
 return next
}

function invalidateSessionLoadBatch(ids: string[], directories: Iterable<string | null | undefined>, purgeStores = true): void {
 const loader = getImperativeSessionMessageLoader()
 const owned = new Set(directories)
 const sessionIds = new Set(ids)
 for (const [directory, store] of _childStores?.children ?? []) {
  const state = store.getState()
  if (state.session.some((session) => sessionIds.has(session.sessionId)) || ids.some((id) => state.snapshot[id] || state.message[id])) owned.add(directory)
 }
 for (const directory of owned) {
  if (!directory) continue
  clearSessionPrefetch(directory, ids, getRuntimeKey())
  for (const sessionId of ids) loader?.invalidateSession({ directory, sessionId })
  if (purgeStores) _childStores?.getChild(directory)?.setState((state) => purgeSessionCaches(state, ids))
 }
}

function invalidateSessionLoads(sessionId: string, directories: Iterable<string | null | undefined>): void {
 invalidateSessionLoadBatch([sessionId], directories)
}

/**
 * Retire a session identity the Agent Service rekeyed (`/btw` Promote to
 * Branch). The pre-branch id is gone from both authorities, so its cached
 * loads and its live recovery stream are dropped in one pass; otherwise the
 * pipeline keeps refreshing a transcript the service now answers 404 for.
 */
export function retireRekeyedSession(previousSessionId: string, sessionId: string, directories: Iterable<string | null | undefined>): void {
 const owned = new Set(directories)
 for (const directory of owned) if (directory) _detachSessionStream?.(previousSessionId, directory)
 retireSessionIdentity(previousSessionId, sessionId)
 invalidateSessionLoadBatch([previousSessionId], owned, true)
}


export function setActionRefs(
 childStores: ChildStoreManager,
 getDirectory: () => string,
 enqueueSessionMaterialization?: (directory: string, sessionID: string, messageID: string) => void,
 ensureSessionStream?: (sessionId: string, directory?: string | null, options?: { refreshSnapshot: boolean }) => void,
 detachSessionStream?: (sessionId: string, directory: string) => void,
) {
 _childStores = childStores
 _getDirectory = getDirectory
 _enqueueSessionMaterialization = enqueueSessionMaterialization ?? null
 _ensureSessionStream = ensureSessionStream ?? null
 _detachSessionStream = detachSessionStream ?? null
}

export function setOptimisticRefs(
 add: (input: OptimisticAddInput) => void,
 remove: (input: OptimisticRemoveInput) => void,
 confirm?: (input: OptimisticConfirmInput) => void,
) {
 _optimisticAdd = add
 _optimisticRemove = remove
 _optimisticConfirm = confirm ?? null
}

function dirStore() {
 if (!_childStores) throw new Error("Child stores not initialized")
 const d = _getDirectory()
 if (!d) throw new Error("No current directory")
 return _childStores.ensureChild(d)
}

function dirStoreForDirectory(directory: string) {
 if (!_childStores) throw new Error("Child stores not initialized")
 if (!directory) throw new Error("No directory")
 return _childStores.ensureChild(directory)
}

function dirStoreForSession(sessionId: string): { store: DirectoryStoreApi; directory?: string } {
 const directory = getSessionDirectory(sessionId)
 if (directory) {
  return { store: dirStoreForDirectory(directory), directory }
 }
 return { store: dirStore(), directory: dir() }
}

export function getSessionLastAssistantModel(sessionId: string): { providerID: string; modelID: string } | null {
 try {
  const { store } = dirStoreForSession(sessionId)
  const messages = store.getState().message[sessionId]
  if (!messages) return null
  for (let i = messages.length - 1; i >= 0; i -= 1) {
   const info = messages[i]
   if (info?.role === "assistant" && info.providerId && info.modelId) {
    return { providerID: info.providerId, modelID: info.modelId }
   }
  }
  return null
 } catch {
  return null
 }
}

async function acceptActionSnapshot(directory: string, snapshot: SessionSnapshot, runtimeKey: string): Promise<void> {
 const sessionId = snapshot.session.sessionId
 const loader = getImperativeSessionMessageLoader()
 if (loader) {
  await loader.refresh({ directory, sessionId }, snapshot)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  const loaded = loader.getSnapshot({ directory, sessionId })
  if (loaded.status === "error") throw loaded.error ?? new Error("Session snapshot recovery failed")
 } else {
  dirStoreForDirectory(directory).setState((state) => installSessionSnapshot(purgeSessionCaches(state, [sessionId]), snapshot))
 }
}

<<<<<<< HEAD
async function installAuthoritativeBranch(sessionId: string, result: SessionBranchResult, runtimeKey: string): Promise<void> {
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 const { directory } = dirStoreForSession(sessionId)
 // Fence pre-selection responses without erasing the last valid transcript
 // while authoritative recovery can still fail.
 invalidateSessionLoadBatch([sessionId], [directory], false)
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== sessionId || snapshot.branch.branchId !== result.branch.branchId || snapshot.branch.branchVersion !== result.branch.branchVersion)
  throw new Error("Branch snapshot does not match its acknowledged selection")
 if (!directory) throw new Error("Branch directory is unknown")
 await acceptActionSnapshot(directory, snapshot, runtimeKey)
 for (const [ownedDirectory, store] of _childStores?.children ?? []) {
  if (ownedDirectory === directory) continue
  const state = store.getState()
  if (state.snapshot[sessionId] || state.message[sessionId]) store.setState(purgeSessionCaches(state, [sessionId]))
 }
 if (result.draft && directory) {
  useInputStore.setState({
   pendingComposerRestore: {
    target: { runtimeKey, directory, sessionId }, text: result.draft.text,
    files: result.draft.attachments.map((attachment) => ({ url: attachment.uri, mimeType: attachment.mediaType, filename: attachment.name, size: attachment.size })),
   }
||||||| bc50ba56aa
function mirrorSessionIntoLiveStores(session: Session, directory?: string): void {
  if (directory && updateLiveSession(session, directory)) {
    return
  }
  updateLiveSession(session)
}

function moveRecordEntries<T>(
  source: Record<string, T>,
  destination: Record<string, T>,
  keys: Iterable<string>,
): { source: Record<string, T>; destination: Record<string, T> } {
  let nextSource = source
  let nextDestination = destination

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    if (nextSource === source) nextSource = { ...source }
    if (nextDestination === destination) nextDestination = { ...destination }
    nextDestination[key] = source[key]
    delete nextSource[key]
  }

  return { source: nextSource, destination: nextDestination }
}

function reconcileSessionMove(
  session: Session,
  sourceDirectory: string,
  destinationDirectory: string,
): Session {
  const stores = _childStores
  const sourceStore = stores?.getChild(sourceDirectory)
  const destinationStore = stores?.ensureChild(destinationDirectory, { bootstrap: false })
  const sourceState = sourceStore?.getState()
  const destinationState = destinationStore?.getState()
  const liveSession = sourceState?.session.find((candidate) => candidate.id === session.id)
  // The `session.moved` event may already have carried the session over (it can
  // beat the move request's response); its record there is the newer one.
  const adoptedSession = liveSession
    ? undefined
    : destinationState?.session.find((candidate) => candidate.id === session.id)
  const movedSession: Session = {
    ...(adoptedSession ?? mergeSessionDirectoryMetadata(session, liveSession)),
    directory: destinationDirectory,
  }

  if (!destinationStore || !destinationState || sourceStore === destinationStore) {
    return movedSession
  }

  const destinationSessionIndex = destinationState.session.findIndex((candidate) => candidate.id === session.id)
  const destinationSessions = [...destinationState.session]
  if (destinationSessionIndex === -1) destinationSessions.push(movedSession)
  else destinationSessions[destinationSessionIndex] = movedSession

  if (!sourceStore || !sourceState) {
    destinationStore.setState({
      session: destinationSessions,
      sessionTotal: destinationSessionIndex === -1
        ? destinationState.sessionTotal + 1
        : destinationState.sessionTotal,
    })
    return movedSession
  }

  const sourceContainsSession = sourceState.session.some((candidate) => candidate.id === session.id)
  const status = moveRecordEntries(sourceState.session_status, destinationState.session_status, [session.id])
  const permissions = moveRecordEntries(sourceState.permission, destinationState.permission, [session.id])
  const forms = moveRecordEntries(sourceState.form, destinationState.form, [session.id])
  const messages = moveRecordEntries(sourceState.message, destinationState.message, [session.id])
  const messageIds = sourceState.message[session.id]?.map((message) => message.id) ?? []
  const parts = moveRecordEntries(sourceState.part, destinationState.part, messageIds)

  sourceStore.setState({
    session: sourceState.session.filter((candidate) => candidate.id !== session.id),
    sessionTotal: sourceContainsSession ? Math.max(0, sourceState.sessionTotal - 1) : sourceState.sessionTotal,
    session_status: status.source,
    permission: permissions.source,
    form: forms.source,
    message: messages.source,
    part: parts.source,
    ...sessionMutationPatch(sourceState, session.id, true),
=======
function mirrorSessionIntoLiveStores(session: Session, directory?: string): void {
  if (directory && updateLiveSession(session, directory)) {
    return
  }
  updateLiveSession(session)
}

function moveRecordEntries<T>(
  source: Record<string, T>,
  destination: Record<string, T>,
  keys: Iterable<string>,
): { source: Record<string, T>; destination: Record<string, T> } {
  let nextSource = source
  let nextDestination = destination

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    if (nextSource === source) nextSource = { ...source }
    if (nextDestination === destination) nextDestination = { ...destination }
    nextDestination[key] = source[key]
    delete nextSource[key]
  }

  return { source: nextSource, destination: nextDestination }
}

function reconcileSessionMove(
  session: Session,
  sourceDirectory: string,
  destinationDirectory: string,
): Session {
  const stores = _childStores
  const sourceStore = stores?.getChild(sourceDirectory)
  const destinationStore = stores?.ensureChild(destinationDirectory, { bootstrap: false })
  const sourceState = sourceStore?.getState()
  const destinationState = destinationStore?.getState()
  const liveSession = sourceState?.session.find((candidate) => candidate.id === session.id)
  const adoptedSession = liveSession
    ? undefined
    : destinationState?.session.find((candidate) => candidate.id === session.id)
  const movedSession: Session = {
    ...(adoptedSession ?? mergeSessionDirectoryMetadata(session, liveSession)),
    directory: destinationDirectory,
  }

  if (!destinationStore || !destinationState || sourceStore === destinationStore) {
    return movedSession
  }

  const destinationSessionIndex = destinationState.session.findIndex((candidate) => candidate.id === session.id)
  const destinationSessions = [...destinationState.session]
  if (destinationSessionIndex === -1) destinationSessions.push(movedSession)
  else destinationSessions[destinationSessionIndex] = movedSession

  if (!sourceStore || !sourceState) {
    destinationStore.setState({
      session: destinationSessions,
      sessionTotal: destinationSessionIndex === -1
        ? destinationState.sessionTotal + 1
        : destinationState.sessionTotal,
    })
    return movedSession
  }

  const sourceContainsSession = sourceState.session.some((candidate) => candidate.id === session.id)
  const status = moveRecordEntries(sourceState.session_status, destinationState.session_status, [session.id])
  const permissions = moveRecordEntries(sourceState.permission, destinationState.permission, [session.id])
  const forms = moveRecordEntries(sourceState.form, destinationState.form, [session.id])
  const messages = moveRecordEntries(sourceState.message, destinationState.message, [session.id])
  const messageIds = sourceState.message[session.id]?.map((message) => message.id) ?? []
  const parts = moveRecordEntries(sourceState.part, destinationState.part, messageIds)

  sourceStore.setState({
    session: sourceState.session.filter((candidate) => candidate.id !== session.id),
    sessionTotal: sourceContainsSession ? Math.max(0, sourceState.sessionTotal - 1) : sourceState.sessionTotal,
    session_status: status.source,
    permission: permissions.source,
    form: forms.source,
    message: messages.source,
    part: parts.source,
    ...sessionMutationPatch(sourceState, session.id, true),
>>>>>>> upstream/main
  })
 } else {
  const pending = useInputStore.getState().pendingComposerRestore
  if (pending?.target.runtimeKey === runtimeKey && pending.target.sessionId === sessionId) useInputStore.setState({ pendingComposerRestore: null })
 }
}

<<<<<<< HEAD
export async function moveSessionToDirectory(session: CanonicalSession, sourceDirectory: string, destinationDirectory: string, expectedRuntimeKey = getRuntimeKey()): Promise<void> {
 if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
 const source = normalizePath(sourceDirectory)
 const destination = normalizePath(destinationDirectory)
 if (!source || !destination) throw new Error("Session relocation directories are invalid")
 if (resolveWorkspaceDirectory(session.workspaceId) !== source) throw new Error("Session source directory is not authoritative")
 const workspace = await canonicalClient.resolveWorkspace(destination)
 if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
 if (workspace.projectId !== session.projectId) throw new Error("Relocation destination is outside the source project")
 const result = await canonicalClient.relocateSession(session.sessionId, workspace.workspaceId)
 if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
 if (result.sessions.some((member) => member.rootSessionId !== session.rootSessionId || member.projectId !== session.projectId)) throw new Error("Relocation response identified another session family")
 registerWorkspaceDirectory(workspace.workspaceId, destination)
 for (const moved of result.sessions) invalidateSessionLoads(moved.sessionId, [source, destination])
 removeSessionsFromLiveStores(result.sessions.map((member) => member.sessionId), source)
 for (const moved of result.sessions) {
  publishCanonicalSession(moved, destination)
  useSessionUIStore.getState().setSessionDirectory(moved.sessionId, destination)
 }
 const selectedId = useSessionUIStore.getState().currentSessionId
 const selected = result.sessions.find((member) => member.sessionId === selectedId) ?? result.sessions.find((member) => member.sessionId === session.sessionId)
 if (!selected) throw new Error("Relocation response omitted the requested session")
 const snapshot = await canonicalClient.getSnapshot(selected.sessionId)
 if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== selected.sessionId || snapshot.session.workspaceId !== workspace.workspaceId || snapshot.session.rootSessionId !== session.rootSessionId) throw new Error("Relocation snapshot identified another destination owner")
 await acceptActionSnapshot(destination, snapshot, expectedRuntimeKey)
||||||| bc50ba56aa
export async function moveSessionToDirectory(
  session: Session,
  sourceDirectory: string,
  destinationDirectory: string,
  expectedRuntimeKey?: string,
): Promise<void> {
  await opencodeClient.moveSession(session.id, destinationDirectory)

  // If the runtime changed during the move request, the server move
  // already happened, but we must not publish stale local state to the UI/stores.
  if (isStaleRuntime(expectedRuntimeKey)) return

  const moved = relocateSession(session, sourceDirectory, destinationDirectory)
  useGlobalSessionsStore.getState().upsertSession(moved)
=======
export async function moveSessionToDirectory(
  session: Session,
  sourceDirectory: string,
  destinationDirectory: string,
  isCurrent?: () => boolean,
): Promise<void> {
  await opencodeClient.moveSession(session.id, destinationDirectory)

  if (isCurrent && !isCurrent()) return

  relocateSession(session, sourceDirectory, destinationDirectory)
>>>>>>> upstream/main
}

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * Follows a move OpenCode already made: an agent's `session_move`, another
 * client, or this client's own request whose `session.moved` event arrived.
 * The session, its messages and live state go to the destination's store and
 * an open chat follows them, so the next prompt lands where the chat reads.
 * The global list already took the directory from the same event.
 */
export function adoptSessionMove(sessionId: string, sourceDirectory: string, destinationDirectory: string): void {
  // A session created under a path the server then canonicalized has its
  // record in the destination already and only its first message at the source.
  const session = _childStores?.getChild(sourceDirectory)?.getState().session.find((candidate) => candidate.id === sessionId)
    ?? _childStores?.getChild(destinationDirectory)?.getState().session.find((candidate) => candidate.id === sessionId)
  if (!session) return
  relocateSession(session, sourceDirectory, destinationDirectory)
}

function withNewRequests<T extends { id: string }>(current: T[], incoming: T[] | undefined) {
  const added = incoming?.filter((request) => !current.some((existing) => existing.id === request.id)) ?? []
  return added.length > 0 ? [...current, ...added] : current
}

/**
 * A session's transcript, status and pending requests are read from the store
 * of the directory it lives in. A store it passed through earlier can still
 * hold a copy, and events without a location would be routed to it: the copy
 * goes, and a pending permission or form in it joins the owner's. The session
 * lists stay: a parent repository lists its worktrees' sessions.
 */
function dropSessionLiveStateOutside(sessionId: string, ownerDirectory: string): void {
  const stores = _childStores
  const owner = stores?.getChild(ownerDirectory)
  if (!stores || !owner) return
  let permissions = owner.getState().permission[sessionId] ?? []
  let forms = owner.getState().form[sessionId] ?? []
  for (const store of stores.children.values()) {
    if (store === owner) continue
    const state = store.getState()
    // A part can land before its message, so parts count on their own.
    const holdsSession = [state.message, state.session_status, state.permission, state.form]
      .some((record) => Object.prototype.hasOwnProperty.call(record, sessionId))
      || Object.values(state.part).some((parts) => parts?.some((part) => part.sessionID === sessionId))
    if (!holdsSession) continue
    permissions = withNewRequests(permissions, state.permission[sessionId])
    forms = withNewRequests(forms, state.form[sessionId])
    const draft = {
      message: { ...state.message },
      part: { ...state.part },
      session_status: { ...state.session_status },
      permission: { ...state.permission },
      form: { ...state.form },
    }
    dropSessionCaches(draft, [sessionId])
    store.setState(draft)
  }
  const ownerState = owner.getState()
  if (permissions.length > 0 && permissions !== ownerState.permission[sessionId]) {
    owner.setState({ permission: { ...ownerState.permission, [sessionId]: permissions } })
  }
  if (forms.length > 0 && forms !== ownerState.form[sessionId]) {
    owner.setState({ form: { ...ownerState.form, [sessionId]: forms } })
  }
}

function relocateSession(session: Session, sourceDirectory: string, destinationDirectory: string): Session {
  invalidateSessionLoads(session.id, [sourceDirectory, destinationDirectory])
  const moved = reconcileSessionMove(session, sourceDirectory, destinationDirectory)
  dropSessionLiveStateOutside(session.id, destinationDirectory)
  registerSessionDirectory(session.id, destinationDirectory)
  useSessionUIStore.getState().setSessionDirectory(session.id, destinationDirectory)
  return moved
}
=======
export function adoptSessionMove(sessionId: string, sourceDirectory: string, destinationDirectory: string): void {
  const session = _childStores?.getChild(sourceDirectory)?.getState().session.find((candidate) => candidate.id === sessionId)
    ?? _childStores?.getChild(destinationDirectory)?.getState().session.find((candidate) => candidate.id === sessionId)
    ?? useGlobalSessionsStore.getState().entityById.get(sessionId)
  if (!session) return
  relocateSession(session, sourceDirectory, destinationDirectory)
}

function withNewRequests<T extends { id: string }>(current: T[], incoming: T[] | undefined) {
  const added = incoming?.filter((request) => !current.some((existing) => existing.id === request.id)) ?? []
  return added.length > 0 ? [...current, ...added] : current
}

function dropSessionLiveStateOutside(sessionId: string, ownerDirectory: string): void {
  const stores = _childStores
  const owner = stores?.getChild(ownerDirectory)
  if (!stores || !owner) return
  let permissions = owner.getState().permission[sessionId] ?? []
  let forms = owner.getState().form[sessionId] ?? []
  for (const store of stores.children.values()) {
    if (store === owner) continue
    const state = store.getState()
    const holdsSession = [state.message, state.session_status, state.permission, state.form]
      .some((record) => Object.prototype.hasOwnProperty.call(record, sessionId))
      || Object.values(state.part).some((parts) => parts?.some((part) => part.sessionID === sessionId))
    if (!holdsSession) continue
    permissions = withNewRequests(permissions, state.permission[sessionId])
    forms = withNewRequests(forms, state.form[sessionId])
    const draft = {
      message: { ...state.message },
      part: { ...state.part },
      session_status: { ...state.session_status },
      permission: { ...state.permission },
      form: { ...state.form },
    }
    dropSessionCaches(draft, [sessionId])
    store.setState(draft)
  }
  const ownerState = owner.getState()
  if (permissions.length > 0 && permissions !== ownerState.permission[sessionId]) {
    owner.setState({ permission: { ...ownerState.permission, [sessionId]: permissions } })
  }
  if (forms.length > 0 && forms !== ownerState.form[sessionId]) {
    owner.setState({ form: { ...ownerState.form, [sessionId]: forms } })
  }
}

function relocateSession(session: Session, sourceDirectory: string, destinationDirectory: string): Session {
  invalidateSessionLoads(session.id, [sourceDirectory, destinationDirectory])
  const moved = reconcileSessionMove(session, sourceDirectory, destinationDirectory)
  dropSessionLiveStateOutside(session.id, destinationDirectory)
  registerSessionDirectory(session.id, destinationDirectory)
  const ui = useSessionUIStore.getState()
  ui.setSessionDirectory(session.id, destinationDirectory)
  const destinationWorktree = findWorktreeHoldingDirectory(
    [...ui.availableWorktreesByProject.values()].flat(),
    destinationDirectory,
  )
  ui.setWorktreeMetadata(session.id, destinationWorktree ?? null, destinationDirectory)
  useSessionFoldersStore.getState().followSessionMove(session.id, destinationDirectory, destinationWorktree?.path ?? null)
  useGlobalSessionsStore.getState().upsertSession(moved)
  const queueTarget = createMessageQueueTarget(session.id, destinationDirectory)
  if (queueTarget) useMessageQueueStore.getState().followSessionMove(queueTarget)
  followSessionTabMove(session.id, destinationDirectory)
  return moved
}
>>>>>>> upstream/main

function dir() {
 return _getDirectory() || undefined
}

<<<<<<< HEAD
function connectionLostError(): Error {
 const { hasEverConnected, lastDisconnectReason } = useConfigStore.getState()
 const suffix = lastDisconnectReason
  ? ` (${lastDisconnectReason})`
  : hasEverConnected
   ? ""
   : " (never connected)"
 return new Error(`Connection lost${suffix}. Please wait for reconnection.`)
||||||| bc50ba56aa
function connectionLostError(): Error {
  const { hasEverConnected, lastDisconnectReason } = useConfigStore.getState()
  const suffix = lastDisconnectReason
    ? ` (${lastDisconnectReason})`
    : hasEverConnected
      ? ""
      : " (never connected)"
  return new Error(`Connection lost${suffix}. Please wait for reconnection.`)
=======
function connectionLostError(): ConnectionLostError {
  const { hasEverConnected, lastDisconnectReason } = useConfigStore.getState()
  return new ConnectionLostError({ reason: lastDisconnectReason || null, everConnected: hasEverConnected })
>>>>>>> upstream/main
}

const CONNECTION_GRACE_MS = 2000
const CONNECTION_PROBE_MS = 500
const RELAY_CONNECTION_GRACE_MS = 3000
const RELAY_CONNECTION_PROBE_MS = 3000
export async function waitForConnectionOrThrow(): Promise<void> {
<<<<<<< HEAD
 const relayed = isRelayModeActive()
 const deadline = Date.now() + (relayed ? RELAY_CONNECTION_GRACE_MS : CONNECTION_GRACE_MS)
 const probeMs = relayed ? RELAY_CONNECTION_PROBE_MS : CONNECTION_PROBE_MS
 while (Date.now() < deadline) {
  if (useConfigStore.getState().isConnected) return
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) break
  if (await useConfigStore.getState().probeConnection({ timeoutMs: Math.min(probeMs, remainingMs) })) return
  const sleepMs = Math.min(100, deadline - Date.now())
  if (sleepMs > 0) {
   await new Promise((resolve) => setTimeout(resolve, sleepMs))
||||||| bc50ba56aa
  // Before the page's first connection, wait for OpenCode to start instead of
  // failing after the short reconnect grace below.
  await waitForOpenCodeStartup()
  const relayed = isRelayModeActive()
  const deadline = Date.now() + (relayed ? RELAY_CONNECTION_GRACE_MS : CONNECTION_GRACE_MS)
  const probeMs = relayed ? RELAY_CONNECTION_PROBE_MS : CONNECTION_PROBE_MS
  while (Date.now() < deadline) {
    if (useConfigStore.getState().isConnected) return
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break
    if (await useConfigStore.getState().probeConnection({ timeoutMs: Math.min(probeMs, remainingMs) })) return
    const sleepMs = Math.min(100, deadline - Date.now())
    if (sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs))
    }
=======
  await waitForOpenCodeStartup()
  const relayed = isRelayModeActive()
  const deadline = Date.now() + (relayed ? RELAY_CONNECTION_GRACE_MS : CONNECTION_GRACE_MS)
  const probeMs = relayed ? RELAY_CONNECTION_PROBE_MS : CONNECTION_PROBE_MS
  while (Date.now() < deadline) {
    if (useConfigStore.getState().isConnected) return
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break
    if (await useConfigStore.getState().probeConnection({ timeoutMs: Math.min(probeMs, remainingMs) })) return
    const sleepMs = Math.min(100, deadline - Date.now())
    if (sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs))
    }
>>>>>>> upstream/main
  }
<<<<<<< HEAD
 }
 throw connectionLostError()
||||||| bc50ba56aa
  throw connectionLostError()
}

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

type CompactSelection = {
  providerID: string
  modelID: string
  variant?: string | null
}

/**
 * OpenCode compacts using the session record, so reconcile an unsent model
 * pick first. Auto has no prompt to route and leaves the record unchanged.
 */
export async function compactSession(
  sessionId: string,
  selection: CompactSelection | null,
  directory?: string | null,
): Promise<void> {
  const isCurrentRuntime = captureRuntimeInstance()
  const settleModelPick = selection && !isAutoModel(selection.providerID, selection.modelID)
    ? useSelectionStore.getState().captureSessionModelPickSettlement(sessionId, selection.providerID, selection.modelID)
    : undefined
  if (selection && !isAutoModel(selection.providerID, selection.modelID)) {
    const { model } = await resolveSendSelection(sessionId, directory ?? undefined, selection)
    if (!isCurrentRuntime()) throw new Error("Compaction was cancelled because the runtime changed.")
    if (model) {
      await opencodeClient.switchSessionModel(sessionId, model, directory)
    }
  }
  if (!isCurrentRuntime()) throw new Error("Compaction was cancelled because the runtime changed.")
  await opencodeClient.compactSession(sessionId, directory)
  settleModelPick?.()
=======
  throw connectionLostError()
}


type CompactSelection = {
  providerID: string
  modelID: string
  variant?: string | null
}

export async function compactSession(
  sessionId: string,
  selection: CompactSelection | null,
  directory?: string | null,
): Promise<void> {
  const isCurrentRuntime = captureRuntimeInstance()
  const settleModelPick = selection && !isAutoModel(selection.providerID, selection.modelID)
    ? useSelectionStore.getState().captureSessionModelPickSettlement(sessionId, selection.providerID, selection.modelID)
    : undefined
  if (selection && !isAutoModel(selection.providerID, selection.modelID)) {
    const { model } = await resolveSendSelection(sessionId, directory ?? undefined, selection)
    if (!isCurrentRuntime()) throw new Error("Compaction was cancelled because the runtime changed.")
    if (model) {
      await opencodeClient.switchSessionModel(sessionId, model, directory)
    }
  }
  if (!isCurrentRuntime()) throw new Error("Compaction was cancelled because the runtime changed.")
  await opencodeClient.compactSession(sessionId, directory)
  settleModelPick?.()
>>>>>>> upstream/main
}

type SessionListSnapshot = {
 directory: string
}

type DirectoryStoreApi = ReturnType<ChildStoreManager["ensureChild"]>


export type SessionLiveActivity = "unknown" | "idle" | "active"

export function getSessionLiveActivity(sessionId: string): SessionLiveActivity {
 const stores = _childStores

 if (stores) {
  for (const [, store] of stores.children) {
   const status = store.getState().session_status?.[sessionId]
   if (status && status !== "idle" && status !== "unavailable") return "active"
  }
 }

<<<<<<< HEAD
 // Cross-directory live index: populated by global events and authoritative
 // per-directory status snapshots, and it survives child-store eviction.
 const globalStatus = useGlobalSessionStatusStore.getState()
 if (globalStatus.activeSessionIds.has(sessionId)) return "active"
 if (globalStatus.statusById.get(sessionId)?.status === "unavailable") return "unknown"
||||||| bc50ba56aa
  // Cross-directory live index: populated by global events and authoritative
  // per-directory status snapshots, and it survives child-store eviction.
  if (useGlobalSessionStatusStore.getState().statusById.has(sessionId)) return "active"
=======
  if (useGlobalSessionStatusStore.getState().statusById.has(sessionId)) return "active"
>>>>>>> upstream/main

 if (!stores) return "unknown"
 return hasAuthoritativeIdleCoverage(sessionId, stores) ? "idle" : "unknown"
}

function hasAuthoritativeIdleCoverage(sessionId: string, stores: ChildStoreManager): boolean {
 const directory = useSessionUIStore.getState().getDirectoryForSession(sessionId)
  ?? resolveKnownSessionDirectory(sessionId)
  ?? findSessionDirectoryInChildStores(sessionId)
 if (!directory) return false
 const state = stores.getChild(directory)?.getState()
 if (state?.session_status[sessionId] === "unavailable") return false
 return (state?.sessionStatusReady === true && !state.sessionStatusInvalidated?.[sessionId])
  || state?.session_status[sessionId] === "idle"
}

function resolveKnownSessionDirectory(sessionId: string): string | null {
 const globalSession = getGlobalSessionSnapshot(sessionId)
 return globalSession ? resolveGlobalSessionDirectory(globalSession) : null
}

export function isSessionBusyNow(sessionId: string): boolean {
 return getSessionLiveActivity(sessionId) === "active"
}

<<<<<<< HEAD
export async function clearStagedRevert(sessionId: string): Promise<void> {
 const runtimeKey = getRuntimeKey()
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
 if (!snapshot.branch.revert) return
 const result = await canonicalClient.selectSessionBranch(sessionId, { action: "restore", branchId: snapshot.branch.branchId, branchVersion: snapshot.branch.branchVersion })
 await installAuthoritativeBranch(sessionId, result, runtimeKey)
||||||| bc50ba56aa
/**
 * Answers for a whole session tree, asking OpenCode when the stores cannot: a
 * folder nobody opened has no status of its own, and one that is gone never
 * will. "unknown" now means the read itself failed.
 */
export async function readSessionsLiveActivity(sessionIds: string[], directory: string): Promise<SessionLiveActivity> {
  const activities = sessionIds.map(getSessionLiveActivity)
  if (activities.includes("active")) return "active"
  if (!activities.includes("unknown")) return "idle"

  const activeStatuses = await opencodeClient.getActiveSessionStatuses(directory)
  if (activeStatuses === null) return "unknown"
  // An event that arrived during the read is newer than the snapshot.
  return sessionIds.some((id) => activeStatuses[id] || isSessionBusyNow(id)) ? "active" : "idle"
}

async function abortDescendantIfBusy(sessionId: string, directory: string): Promise<void> {
  if (!isSessionBusyNow(sessionId)) return
  try {
    await opencodeClient.abortSession(sessionId, directory)
  } catch {
    // ignore abort errors
  }
}

function getDescendantSessions(rootId: string): DescendantSession[] {
  const stores = _childStores
  if (!stores) return []

  const sessionsById = new Map<string, DescendantSession>()
  for (const [storeDirectory, store] of stores.children) {
    const state = store.getState()
    for (const session of state.session) {
      const directory = session.directory || storeDirectory
      const current = sessionsById.get(session.id)
      if (!current || session.directory) sessionsById.set(session.id, { session, directory })
    }
  }

  const subtreeIds = computeSubtreeIds(
    [...sessionsById.values()].map(({ session }) => session),
    rootId,
  )
  subtreeIds.delete(rootId)
  return [...subtreeIds]
    .map((id) => sessionsById.get(id))
    .filter((entry): entry is DescendantSession => !!entry)
}

function firstUserMessageAtOrAfter(messages: Message[], cutoff: number): Message | null {
  let target: Message | null = null
  for (const message of messages) {
    if (message.role !== "user" || message.time.created < cutoff) continue
    if (!target || message.time.created < target.time.created) target = message
  }
  return target
}

async function fetchSessionMessages(sessionId: string, directory?: string | null): Promise<Message[]> {
  const page = await opencodeClient.getSessionMessages(sessionId, undefined, directory)
  return page.items.map(({ info }) => info)
}

/**
 * Finds one message by id, following the cursor until it appears or the
 * history runs out. The local store holds only the newest page, so a revert
 * target older than that must be searched for across pages, not assumed gone.
 */
async function findSessionMessageById(sessionId: string, messageId: string, directory?: string | null): Promise<Message | null> {
  const found = await findMessagePageItem(sessionId, (item) => item.info.id === messageId, {}, directory)
  return found?.info ?? null
}

/**
 * From when descendants are reverted along with a cut at `target`. A subagent
 * run's report lands after its child already worked, so reverting the run
 * reverts the child from its start; any other target cuts at its own time.
 */
function descendantRevertCutoff(state: { session: readonly Session[] }, target: Message): number {
  const run = readSubagentRun(target)
  const child = run ? state.session.find((session) => session.id === run.childSessionID) : undefined
  return child ? Math.min(child.time.created, target.time.created) : target.time.created
}

async function cascadeRevertToDescendants(rootId: string, cutoff: number): Promise<void> {
  for (const { session, directory } of getDescendantSessions(rootId)) {
    try {
      // A running descendant would keep writing messages past the revert
      // boundary, so stop it first for the same reason the parent is aborted.
      await abortDescendantIfBusy(session.id, directory)
      const messages = await fetchSessionMessages(session.id, directory)
      // Equal timestamps belong to the reverted side of the boundary. Keeping
      // them would rely on unrelated message IDs to decide chronology.
      const target = firstUserMessageAtOrAfter(messages, cutoff)
      if (!target) continue
      await opencodeClient.stageRevert(session.id, target.id, { directory })
      mirrorSessionIntoLiveStores(await opencodeClient.getSession(session.id, directory), directory)
    } catch (error) {
      console.error(`[session-actions] Failed to cascade revert to descendant ${session.id}:`, error)
    }
  }
}

/** Cancels a staged revert: the hidden messages come back, in descendants too. */
export async function clearStagedRevert(sessionId: string): Promise<void> {
  const { directory } = dirStoreForSession(sessionId)
  for (const descendant of getDescendantSessions(sessionId)) {
    if (!descendant.session.revert) continue
    try {
      await opencodeClient.clearRevert(descendant.session.id, descendant.directory)
      mirrorSessionIntoLiveStores(await opencodeClient.getSession(descendant.session.id, descendant.directory), descendant.directory)
    } catch (error) {
      console.error(`[session-actions] Failed to clear revert in descendant ${descendant.session.id}:`, error)
    }
  }
  await opencodeClient.clearRevert(sessionId, directory)
  mirrorSessionIntoLiveStores(await opencodeClient.getSession(sessionId, directory), directory)
  // Clearing restores the files the staged revert had rolled back.
  if (directory) {
    sessionEvents.requestGitRefresh({ directory })
    fileTreeChanges.unknownChange(directory)
  }
=======
export async function readSessionsLiveActivity(sessionIds: string[], directory: string): Promise<SessionLiveActivity> {
  const activities = sessionIds.map(getSessionLiveActivity)
  if (activities.includes("active")) return "active"
  if (!activities.includes("unknown")) return "idle"

  const activeStatuses = await opencodeClient.getActiveSessionStatuses(directory)
  if (activeStatuses === null) return "unknown"
  return sessionIds.some((id) => activeStatuses[id] || isSessionBusyNow(id)) ? "active" : "idle"
}

async function abortDescendantIfBusy(sessionId: string, directory: string): Promise<void> {
  if (!isSessionBusyNow(sessionId)) return
  try {
    await opencodeClient.abortSession(sessionId, directory)
  } catch {
    // ignore abort errors
  }
}

function getDescendantSessions(rootId: string): DescendantSession[] {
  const stores = _childStores
  if (!stores) return []

  const sessionsById = new Map<string, DescendantSession>()
  for (const [storeDirectory, store] of stores.children) {
    const state = store.getState()
    for (const session of state.session) {
      const directory = session.directory || storeDirectory
      const current = sessionsById.get(session.id)
      if (!current || session.directory) sessionsById.set(session.id, { session, directory })
    }
  }

  const subtreeIds = computeSubtreeIds(
    [...sessionsById.values()].map(({ session }) => session),
    rootId,
  )
  subtreeIds.delete(rootId)
  return [...subtreeIds]
    .map((id) => sessionsById.get(id))
    .filter((entry): entry is DescendantSession => !!entry)
}

function firstUserMessageAtOrAfter(messages: Message[], cutoff: number): Message | null {
  let target: Message | null = null
  for (const message of messages) {
    if (message.role !== "user" || message.time.created < cutoff) continue
    if (!target || message.time.created < target.time.created) target = message
  }
  return target
}

async function fetchSessionMessages(sessionId: string, directory?: string | null): Promise<Message[]> {
  const page = await opencodeClient.getSessionMessages(sessionId, undefined, directory)
  return page.items.map(({ info }) => info)
}

async function findSessionMessageById(sessionId: string, messageId: string, directory?: string | null): Promise<Message | null> {
  const found = await findMessagePageItem(sessionId, (item) => item.info.id === messageId, {}, directory)
  return found?.info ?? null
}

function descendantRevertCutoff(state: { session: readonly Session[] }, target: Message): number {
  const run = readSubagentRun(target)
  const child = run ? state.session.find((session) => session.id === run.childSessionID) : undefined
  return child ? Math.min(child.time.created, target.time.created) : target.time.created
}

async function stageAndReadRevert(sessionId: string, messageId: string, directory: string | null | undefined, assertRuntime: () => void): Promise<Session> {
  const key = revertKey(sessionId)
  unreconciledReverts.add(key)
  await opencodeClient.stageRevert(sessionId, messageId, { directory })
  assertRuntime()
  const reverted = await opencodeClient.getSession(sessionId, directory)
  assertRuntime()
  unreconciledReverts.delete(key)
  return reverted
}

async function cascadeRevertToDescendants(descendants: DescendantSession[], cutoff: number, assertRuntime: () => void): Promise<void> {
  for (const { session, directory } of descendants) {
    try {
      assertRuntime()
      await abortDescendantIfBusy(session.id, directory)
      assertRuntime()
      const messages = await fetchSessionMessages(session.id, directory)
      assertRuntime()
      const target = firstUserMessageAtOrAfter(messages, cutoff)
      if (!target) continue
      const reverted = await stageAndReadRevert(session.id, target.id, directory, assertRuntime)
      mirrorSessionIntoLiveStores(reverted, directory)
    } catch (error) {
      assertRuntime()
      console.error(`[session-actions] Failed to cascade revert to descendant ${session.id}:`, error)
    }
  }
}

export function clearStagedRevert(sessionId: string): Promise<void> {
  return runRevertOperation(sessionId, () => clearStagedRevertNow(sessionId))
}

async function clearStagedRevertNow(sessionId: string): Promise<void> {
  const { directory } = dirStoreForSession(sessionId)
  for (const descendant of getDescendantSessions(sessionId)) {
    if (!descendant.session.revert) continue
    try {
      await opencodeClient.clearRevert(descendant.session.id, descendant.directory)
      mirrorSessionIntoLiveStores(await opencodeClient.getSession(descendant.session.id, descendant.directory), descendant.directory)
    } catch (error) {
      console.error(`[session-actions] Failed to clear revert in descendant ${descendant.session.id}:`, error)
    }
  }
  await opencodeClient.clearRevert(sessionId, directory)
  mirrorSessionIntoLiveStores(await opencodeClient.getSession(sessionId, directory), directory)
  if (directory) {
    sessionEvents.requestGitRefresh({ directory })
    fileTreeChanges.unknownChange(directory)
  }
>>>>>>> upstream/main
}

<<<<<<< HEAD
function getGlobalSessionSnapshot(sessionId: string): CanonicalSession | null {
 return useGlobalSessionsStore.getState().entityById.get(sessionId) ?? null
||||||| bc50ba56aa
/**
 * Commits the session's staged revert ahead of input that OpenCode admits
 * without committing it: a UI block answer or a shell command. Admitted while
 * the revert is staged, that input lies past its boundary, and the next
 * prompt's commit deletes it. The `session.revert.committed` event then trims
 * the reverted tail, as it does after another client's prompt.
 */
export async function commitStagedRevert(sessionId: string, directory?: string | null): Promise<void> {
  if (!findLiveSession(sessionId)?.revert) return
  await opencodeClient.commitRevert(sessionId, directory)
=======
type PendingRevert = { rootId: string; runtimeKey: string; affectsDescendants: boolean; promise: Promise<void> }
const pendingReverts = new Map<string, PendingRevert>()
const unreconciledReverts = new Set<string>()
const revertReconciliations = new Map<string, { promise: Promise<void>; isCurrent: () => boolean }>()
let revertRevision = 0

function revertKey(sessionId: string): string {
  return JSON.stringify([getRuntimeKey(), sessionId])
}

function pendingRevertsForSession(sessionId: string): PendingRevert[] {
  const direct = pendingReverts.get(revertKey(sessionId))
  const entries = new Set<PendingRevert>()
  if (direct) entries.add(direct)
  for (const entry of new Set(pendingReverts.values())) {
    if (entry.runtimeKey !== getRuntimeKey() || !entry.affectsDescendants || entries.has(entry)) continue
    if (getDescendantSessions(entry.rootId).some(({ session }) => session.id === sessionId)) entries.add(entry)
  }
  return [...entries]
}

export async function waitForPendingRevert(sessionId: string, directory?: string | null): Promise<void> {
  const isCurrentRuntime = captureRuntimeInstance()
  let failure: unknown
  const key = revertKey(sessionId)
  while (true) {
    const pending = pendingRevertsForSession(sessionId)
    if (pending.length > 0) {
      const results = await Promise.allSettled(pending.map((entry) => entry.promise))
      if (!isCurrentRuntime()) throw new Error("Runtime changed while waiting for the revert.")
      const failed = results.find((result) => result.status === "rejected")
      if (failed?.status === "rejected") failure = failed.reason
      continue
    }
    if (unreconciledReverts.has(key)) {
      let reconciliation = revertReconciliations.get(key)
      if (!reconciliation) {
        const revision = revertRevision
        const targetDirectory = directory ?? getSessionDirectory(sessionId)
        const read = Promise.resolve().then(async () => {
          const session = await opencodeClient.getSession(sessionId, targetDirectory)
          if (!isCurrentRuntime()) throw new Error("Runtime changed while reconciling the revert.")
          if (revision !== revertRevision || pendingRevertsForSession(sessionId).length > 0) return
          mirrorSessionIntoLiveStores(session, targetDirectory)
          unreconciledReverts.delete(key)
        })
        const promise = read.finally(() => {
          if (revertReconciliations.get(key)?.promise === promise) revertReconciliations.delete(key)
        })
        reconciliation = { promise, isCurrent: isCurrentRuntime }
        revertReconciliations.set(key, reconciliation)
      }
      try {
        await reconciliation.promise
      } catch (error) {
        if (!isCurrentRuntime()) throw error
        if (reconciliation.isCurrent()) throw error
      }
      if (!isCurrentRuntime()) throw new Error("Runtime changed while reconciling the revert.")
      continue
    }
    if (failure) throw failure
    return
  }
}

export async function commitStagedRevert(sessionId: string, directory?: string | null): Promise<void> {
  await waitForPendingRevert(sessionId, directory)
  await runRevertOperation(sessionId, async () => {
    if (!findLiveSession(sessionId)?.revert) return
    await opencodeClient.commitRevert(sessionId, directory)
  }, false)
}

export function commitSessionRevert(sessionId: string, directory?: string | null): Promise<void> {
  return runRevertOperation(sessionId, () => opencodeClient.commitRevert(sessionId, directory), false)
>>>>>>> upstream/main
}

function findLiveSession(sessionId: string): CanonicalSession | null {
 if (!_childStores) return null
 for (const store of _childStores.children.values()) {
  const session = store.getState().session.find((item) => item.sessionId === sessionId)
  if (session) return session
 }
 return null
}

<<<<<<< HEAD
/**
 * The archive routes answer with stamps, not session records, so the stamp is
 * applied to the session the global store already holds. A session it does not
 * hold is left alone rather than inserted as a record without its fields.
 */
function withArchivedAt(sessionId: string, archivedAt: number | null): CanonicalSession | null {
 const known = getGlobalSessionSnapshot(sessionId) ?? findLiveSession(sessionId)
 if (!known) return null
 const updated = { ...known }
 if (archivedAt === null) delete updated.archivedAt
 else updated.archivedAt = archivedAt
 return updated
||||||| bc50ba56aa
/**
 * The archive routes answer with stamps, not session records, so the stamp is
 * applied to the session the global store already holds. A session it does not
 * hold is left alone rather than inserted as a record without its fields.
 */
function withArchivedAt(sessionId: string, archivedAt: number | null): Session | null {
  const known = getGlobalSessionSnapshot(sessionId) ?? findLiveSession(sessionId)
  if (!known) return null
  const time = { ...known.time }
  if (archivedAt === null) delete time.archived
  else time.archived = archivedAt
  return { ...known, time }
=======
function withArchivedAt(sessionId: string, archivedAt: number | null): Session | null {
  const known = getGlobalSessionSnapshot(sessionId) ?? findLiveSession(sessionId)
  if (!known) return null
  const time = { ...known.time }
  if (archivedAt === null) delete time.archived
  else time.archived = archivedAt
  return { ...known, time }
>>>>>>> upstream/main
}

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)))

function getSessionDirectory(sessionId: string): string | undefined {
<<<<<<< HEAD
 // The global record carries the directory the server filed the session
 // under, so it wins. Directory stores come second: a project root's store
 // also indexes status, permissions and questions for sessions that live in
 // that project's worktrees, so a lookup there can name the root for a
 // worktree session and the server then answers 404/500 for the mutation.
 const globalSession = getGlobalSessionSnapshot(sessionId)
 const globalDirectory = globalSession ? resolveGlobalSessionDirectory(globalSession) ?? undefined : undefined
 return globalDirectory
  || findSessionDirectoryInChildStores(sessionId)
  || useSessionUIStore.getState().getDirectoryForSession(sessionId)
  || dir()
||||||| bc50ba56aa
  // The global record carries the directory the server filed the session
  // under, so it wins. Directory stores come second: a project root's store
  // also indexes status, permissions and questions for sessions that live in
  // that project's worktrees, so a lookup there can name the root for a
  // worktree session and the server then answers 404/500 for the mutation.
  const globalSession = getGlobalSessionSnapshot(sessionId)
  const globalDirectory = globalSession ? resolveGlobalSessionDirectory(globalSession) ?? undefined : undefined
  return globalDirectory
    || findSessionDirectoryInChildStores(sessionId)
    || useSessionUIStore.getState().getDirectoryForSession(sessionId)
    || dir()
=======
  const globalSession = getGlobalSessionSnapshot(sessionId)
  const globalDirectory = globalSession ? resolveGlobalSessionDirectory(globalSession) ?? undefined : undefined
  return globalDirectory
    || findSessionDirectoryInChildStores(sessionId)
    || useSessionUIStore.getState().getDirectoryForSession(sessionId)
    || dir()
>>>>>>> upstream/main
}

function findSessionDirectoryInChildStores(sessionId: string): string | null {
 const stores = _childStores
 if (!stores || !sessionId) return null

 for (const [directory, store] of stores.children) {
  const state = store.getState()
  if (
   state.session.some((session) => session.sessionId === sessionId)
   || Object.prototype.hasOwnProperty.call(state.message, sessionId)
   || Object.prototype.hasOwnProperty.call(state.session_status ?? {}, sessionId)
   || Object.prototype.hasOwnProperty.call(state.permission ?? {}, sessionId)
   || Object.prototype.hasOwnProperty.call(state.form ?? {}, sessionId)
  ) {
   return directory
  }
 }

 return null
}

<<<<<<< HEAD
||||||| bc50ba56aa
/** Directory of the instance that owns `sessionId`, for a reply request. */
function getSessionReplyDirectory(sessionId?: string): string | undefined {
  const directory = sessionId
    ? useSessionUIStore.getState().getDirectoryForSession(sessionId)
    : null
  return directory ?? dir()
}
=======
function getSessionReplyDirectory(sessionId?: string): string | undefined {
  const directory = sessionId
    ? useSessionUIStore.getState().getDirectoryForSession(sessionId)
    : null
  return directory ?? dir()
}
>>>>>>> upstream/main

<<<<<<< HEAD
function isFormRequestNotFoundError(error: unknown): boolean {
 return error instanceof CanonicalApiError
  && (error.problem.code === "QUESTION_NOT_FOUND" || error.problem.code === "QUESTION_EXPIRED")
||||||| bc50ba56aa
function restoreFilePartsToInput(fileParts: readonly FilePart[], target: ChatDraftIdentity | null): void {
  useInputStore.getState().clearAttachedFiles(target)
  for (const filePart of fileParts) {
    if (!filePart.url) continue
    useInputStore.getState().addRestoredAttachment({
      url: filePart.url,
      mimeType: filePart.mime,
      filename: filePart.filename ?? "attachment",
    }, target)
  }
}

/**
 * The context a user message was sent with.
 *
 * OpenCode 2.x admits attached context as synthetic messages inserted right
 * before the prompt, so the carriers are the contiguous run of synthetic
 * messages preceding the target — not parts of the message itself.
 */
function contextCarriersForMessage(messages: readonly Message[], messageID: string): ContextCarrierPart[] {
  const index = messages.findIndex((message) => message.id === messageID)
  if (index < 0) return []
  const carriers: ContextCarrierPart[] = []
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor]
    if (candidate.role !== "synthetic") break
    carriers.unshift({ metadata: candidate.metadata })
  }
  return carriers
}

/**
 * Put a message's attached context (review comments, quotes, terminal
 * selections, annotations) back on the composer chips.
 *
 * Context rides out as synthetic messages carrying structured metadata, so a
 * reverted or forked message can be rebuilt into the drafts it came from.
 * Without this the context is simply gone: the message is pulled back into the
 * composer with its text and files, but the comments attached to it are not.
 *
 * The target's existing drafts are replaced, matching how text and file
 * attachments are restored — the composer ends up as the message was sent.
 */
function restoreContextPartsToInput(
  parts: readonly ContextCarrierPart[],
  target: InlineCommentDraftTarget,
): void {
  const store = useInlineCommentDraftStore.getState()
  store.clearDrafts(target)
  for (const part of parts) {
    const payload = readContextPart(part)
    if (!payload) continue
    const draft = draftFromContextPayload(payload)
    if (draft) store.addDraft(target, draft, { written: true })
  }
}

/**
 * Server-confirmed directory that owns a session, from the session record
 * (`directory`, then `project.worktree`). Mirrors the authoritative source in
 * session-directory-resolution: holding a session in a child store proves
 * containment, not ownership — a project's session list legitimately includes
 * the sessions of its worktrees so the sidebar can group them — so reading
 * ownership from the containing store reports the parent for a session that
 * lives in a worktree, and every fetch is then addressed to a directory that
 * does not own it.
 */
function resolveSessionOwnedDirectory(session: Session): string | null {
  const record = session as Session & {
    directory?: string | null
    project?: { worktree?: string | null } | null
  }
  const raw = typeof record.directory === "string" && record.directory.trim().length > 0
    ? record.directory
    : typeof record.project?.worktree === "string" && record.project.worktree.trim().length > 0
      ? record.project.worktree
      : null
  return raw ? normalizePath(raw) : null
}

function resolveDirectoryForBlockingRequest(
  type: "permission" | "form",
  sessionId: string,
  requestId: string,
): string | null {
  const stores = _childStores
  if (!stores || !requestId) {
    return null
  }

  for (const [directory, store] of stores.children) {
    const state = store.getState()
    const requestMap = type === "permission" ? state.permission : state.form
    for (const requests of Object.values(requestMap) as Array<Array<{ id: string; sessionID?: string }> | undefined>) {
      const request = requests?.find((candidate) => candidate.id === requestId)
      if (!request) continue

      // Ownership beats containment. The request belongs to one specific
      // session, and the reply must reach the instance that actually tracks
      // it — the directory the session record's server-confirmed `directory`
      // names. The containing store's key only proves containment: a project
      // store holds its worktree sessions too, and a reply addressed to the
      // parent instance makes the server answer FormNotFoundError while the
      // form stays pending in the worktree instance, leaving the session
      // stuck on the running form tool. Fall back to the store
      // key only when the session record carries no directory.
      const requestSessionID = typeof request.sessionID === "string" && request.sessionID.length > 0
        ? request.sessionID
        : sessionId
      const sessionRecord = requestSessionID
        ? state.session.find((s) => s.id === requestSessionID)
        : undefined
      const ownedDirectory = sessionRecord ? resolveSessionOwnedDirectory(sessionRecord) : null
      if (ownedDirectory) return ownedDirectory
      return directory
    }
  }

  const sessionDirectory = useSessionUIStore.getState().getDirectoryForSession(sessionId)
  if (sessionDirectory) {
    return sessionDirectory
  }

  for (const [directory, store] of stores.children) {
    const state = store.getState()
    if (
      state.session.some((session) => session.id === sessionId)
      || Object.prototype.hasOwnProperty.call(state.message, sessionId)
      || Object.prototype.hasOwnProperty.call(state.session_status ?? {}, sessionId)
      || Object.prototype.hasOwnProperty.call(state.permission ?? {}, sessionId)
      || Object.prototype.hasOwnProperty.call(state.form ?? {}, sessionId)
    ) {
      return directory
    }
  }

  return null
}

/**
 * Reconcile the trailing assistant tool part after a blocking request turned
 * out to be stale server-side (reply/reject answered with not-found). The
 * local request is removed (the server no longer tracks it), but the
 * form/permission tool part can remain `running` with the session busy —
 * the UI would stay on "waiting for input" with no recovery until the user
 * stops the run. Enqueue the sync layer's settled-running-tool tail
 * materialization so the part converges to the server's actual state.
 */
function recoverStaleBlockingRequest(sessionId: string): void {
  const stores = _childStores
  const enqueue = _enqueueSessionMaterialization
  if (!stores || !enqueue || !sessionId) return

  for (const [directory, store] of stores.children) {
    const state = store.getState()
    if (
      !state.session.some((session) => session.id === sessionId)
      && !Object.prototype.hasOwnProperty.call(state.message, sessionId)
      && !Object.prototype.hasOwnProperty.call(state.session_status ?? {}, sessionId)
      && !Object.prototype.hasOwnProperty.call(state.form ?? {}, sessionId)
    ) {
      continue
    }
    const messageID = getStaleRunningToolMessageID(state, sessionId)
    if (messageID) {
      enqueue(directory, sessionId, messageID)
    }
    return
  }
}

function removeFormRequestFromChildStores(sessionId: string, requestId: string): boolean {
  const stores = _childStores
  if (!stores || !requestId) return false

  let removed = false
  for (const [, store] of stores.children) {
    const current = store.getState().form ?? {}
    let nextForm: typeof current | null = null
    const sessionIds = new Set([sessionId, ...Object.keys(current)].filter(Boolean))

    for (const candidateSessionId of sessionIds) {
      const requests = current[candidateSessionId]
      if (!requests?.length) continue

      const nextRequests = requests.filter((request) => request.id !== requestId)
      if (nextRequests.length === requests.length) continue

      nextForm ??= { ...current }
      if (nextRequests.length > 0) {
        nextForm[candidateSessionId] = nextRequests
      } else {
        delete nextForm[candidateSessionId]
      }
      removed = true
    }

    if (nextForm) {
      store.setState({ form: nextForm })
    }
  }

  return removed
}

/** Put back a form removed optimistically; a no-op when the store already holds it. */
function restoreFormRequest(store: DirectoryStoreApi, sessionId: string, form: FormRequest): void {
  store.setState((state) => {
    const forms = state.form[sessionId] ?? []
    const result = Binary.search(forms, form.id, (item) => item.id)
    if (result.found) return state
    const next = [...forms]
    next.splice(result.index, 0, form)
    return { form: { ...state.form, [sessionId]: next } }
  })
}

/** Put back a permission removed optimistically; a no-op when the store already holds it. */
function restorePermissionRequest(store: DirectoryStoreApi, sessionId: string, permission: PermissionRequest): void {
  store.setState((state) => {
    const permissions = state.permission[sessionId] ?? []
    const result = Binary.search(permissions, permission.id, (item) => item.id)
    if (result.found) return state
    const next = [...permissions]
    next.splice(result.index, 0, permission)
    return { permission: { ...state.permission, [sessionId]: next } }
  })
=======
function restoreFilePartsToInput(fileParts: readonly FilePart[], target: ChatDraftIdentity | null): void {
  useInputStore.getState().clearAttachedFiles(target)
  for (const filePart of fileParts) {
    if (!filePart.url) continue
    useInputStore.getState().addRestoredAttachment({
      url: filePart.url,
      mimeType: filePart.mime,
      filename: filePart.filename ?? "attachment",
    }, target)
  }
}

function contextCarriersForMessage(messages: readonly Message[], messageID: string): ContextCarrierPart[] {
  const index = messages.findIndex((message) => message.id === messageID)
  if (index < 0) return []
  const carriers: ContextCarrierPart[] = []
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor]
    if (candidate.role !== "synthetic") break
    carriers.unshift({ metadata: candidate.metadata })
  }
  return carriers
}

function restoreContextPartsToInput(
  parts: readonly ContextCarrierPart[],
  target: InlineCommentDraftTarget,
): void {
  const store = useInlineCommentDraftStore.getState()
  store.clearDrafts(target)
  for (const part of parts) {
    const payload = readContextPart(part)
    if (!payload) continue
    const draft = draftFromContextPayload(payload)
    if (draft) store.addDraft(target, draft, { written: true })
  }
}

function resolveSessionOwnedDirectory(session: Session): string | null {
  const record = session as Session & {
    directory?: string | null
    project?: { worktree?: string | null } | null
  }
  const raw = typeof record.directory === "string" && record.directory.trim().length > 0
    ? record.directory
    : typeof record.project?.worktree === "string" && record.project.worktree.trim().length > 0
      ? record.project.worktree
      : null
  return raw ? normalizePath(raw) : null
}

function resolveDirectoryForBlockingRequest(
  type: "permission" | "form",
  sessionId: string,
  requestId: string,
): string | null {
  const stores = _childStores
  if (!stores || !requestId) {
    return null
  }

  for (const [directory, store] of stores.children) {
    const state = store.getState()
    const requestMap = type === "permission" ? state.permission : state.form
    for (const requests of Object.values(requestMap) as Array<Array<{ id: string; sessionID?: string }> | undefined>) {
      const request = requests?.find((candidate) => candidate.id === requestId)
      if (!request) continue

      const requestSessionID = typeof request.sessionID === "string" && request.sessionID.length > 0
        ? request.sessionID
        : sessionId
      const sessionRecord = requestSessionID
        ? state.session.find((s) => s.id === requestSessionID)
        : undefined
      const ownedDirectory = sessionRecord ? resolveSessionOwnedDirectory(sessionRecord) : null
      if (ownedDirectory) return ownedDirectory
      return directory
    }
  }

  const sessionDirectory = useSessionUIStore.getState().getDirectoryForSession(sessionId)
  if (sessionDirectory) {
    return sessionDirectory
  }

  for (const [directory, store] of stores.children) {
    const state = store.getState()
    if (
      state.session.some((session) => session.id === sessionId)
      || Object.prototype.hasOwnProperty.call(state.message, sessionId)
      || Object.prototype.hasOwnProperty.call(state.session_status ?? {}, sessionId)
      || Object.prototype.hasOwnProperty.call(state.permission ?? {}, sessionId)
      || Object.prototype.hasOwnProperty.call(state.form ?? {}, sessionId)
    ) {
      return directory
    }
  }

  return null
}

function recoverStaleBlockingRequest(sessionId: string): void {
  const stores = _childStores
  const enqueue = _enqueueSessionMaterialization
  if (!stores || !enqueue || !sessionId) return

  for (const [directory, store] of stores.children) {
    const state = store.getState()
    if (
      !state.session.some((session) => session.id === sessionId)
      && !Object.prototype.hasOwnProperty.call(state.message, sessionId)
      && !Object.prototype.hasOwnProperty.call(state.session_status ?? {}, sessionId)
      && !Object.prototype.hasOwnProperty.call(state.form ?? {}, sessionId)
    ) {
      continue
    }
    const messageID = getStaleRunningToolMessageID(state, sessionId)
    if (messageID) {
      enqueue(directory, sessionId, messageID)
    }
    return
  }
}

function removeFormRequestFromChildStores(sessionId: string, requestId: string): boolean {
  const stores = _childStores
  if (!stores || !requestId) return false

  let removed = false
  for (const [, store] of stores.children) {
    const current = store.getState().form ?? {}
    let nextForm: typeof current | null = null
    const sessionIds = sessionId ? [sessionId] : Object.keys(current)

    for (const candidateSessionId of sessionIds) {
      const requests = current[candidateSessionId]
      if (!requests?.length) continue

      const nextRequests = requests.filter((request) => request.id !== requestId)
      if (nextRequests.length === requests.length) continue

      nextForm ??= { ...current }
      if (nextRequests.length > 0) {
        nextForm[candidateSessionId] = nextRequests
      } else {
        delete nextForm[candidateSessionId]
      }
      removed = true
    }

    if (nextForm) {
      store.setState({ form: nextForm })
    }
  }

  return removed
}

function restoreFormRequest(store: DirectoryStoreApi, sessionId: string, form: FormRequest): void {
  store.setState((state) => {
    const forms = state.form[sessionId] ?? []
    const result = Binary.search(forms, form.id, (item) => item.id)
    if (result.found) return state
    const next = [...forms]
    next.splice(result.index, 0, form)
    return { form: { ...state.form, [sessionId]: next } }
  })
}

function restorePermissionRequest(store: DirectoryStoreApi, sessionId: string, permission: PermissionRequest): void {
  store.setState((state) => {
    const permissions = state.permission[sessionId] ?? []
    const result = Binary.search(permissions, permission.id, (item) => item.id)
    if (result.found) return state
    const next = [...permissions]
    next.splice(result.index, 0, permission)
    return { permission: { ...state.permission, [sessionId]: next } }
  })
>>>>>>> upstream/main
}

function isPermissionRequestNotFoundError(error: unknown): boolean {
 return error instanceof CanonicalApiError
  && (error.problem.code === "APPROVAL_NOT_FOUND" || error.problem.code === "APPROVAL_EXPIRED")
}

function recoverStaleBlockingRequest(sessionId: string): void {
 if (!_childStores || !_enqueueSessionMaterialization) return
 for (const [directory, store] of _childStores.children) {
  const messageId = store.getState().message[sessionId]?.at(-1)?.messageId
  if (messageId) {
   _enqueueSessionMaterialization(directory, sessionId, messageId)
   return
  }
 }
}

<<<<<<< HEAD
function removeFormRequestFromChildStores(sessionId: string, requestId: string): void {
 for (const store of _childStores?.children.values() ?? []) {
  store.setState((state) => {
   const current = state.form[sessionId]
   if (!current?.some((request) => request.questionId === requestId)) return state
   const form = { ...state.form }
   const remaining = current.filter((request) => request.questionId !== requestId)
   if (remaining.length) form[sessionId] = remaining
   else delete form[sessionId]
   return { form }
  })
 }
}

function removePermissionRequestFromChildStores(sessionId: string, requestId: string): void {
 for (const store of _childStores?.children.values() ?? []) {
  store.setState((state) => {
   const current = state.permission[sessionId]
   if (!current?.some((request) => request.approvalId === requestId)) return state
   const permission = { ...state.permission }
   const remaining = current.filter((request) => request.approvalId !== requestId)
   if (remaining.length) permission[sessionId] = remaining
   else delete permission[sessionId]
   return { permission }
  })
 }
}

function restoreFormRequest(store: DirectoryStoreApi, sessionId: string, form: FormRequest): void {
 store.setState((state) => {
  if (state.sessionDeletedRevision?.[sessionId]) return state
  const session = state.session.find((candidate) => candidate.sessionId === sessionId)
  if (session && session.epoch !== form.epoch) return state
  const forms = state.form[sessionId] ?? []
  if (forms.some((request) => request.questionId === form.questionId)) return state
  return { form: { ...state.form, [sessionId]: [...forms, form] } }
 })
}

function restorePermissionRequest(store: DirectoryStoreApi, sessionId: string, permission: PermissionRequest): void {
 store.setState((state) => {
  if (state.sessionDeletedRevision?.[sessionId]) return state
  const session = state.session.find((candidate) => candidate.sessionId === sessionId)
  if (session && session.epoch !== permission.epoch) return state
  const permissions = state.permission[sessionId] ?? []
  if (permissions.some((request) => request.approvalId === permission.approvalId)) return state
  return { permission: { ...state.permission, [sessionId]: [...permissions, permission] } }
 })
}

async function readPendingApproval(sessionId: string, requestId: string, runtimeKey: string): Promise<PermissionRequest> {
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 for (const store of _childStores?.children.values() ?? []) {
  const request = store.getState().permission[sessionId]?.find((candidate) => candidate.approvalId === requestId)
  if (request?.status === "pending") return request
 }
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 const request = snapshot.approvals.find((candidate) => candidate.approvalId === requestId && candidate.sessionId === sessionId)
 if (!request) throw new CanonicalApiError({
  type: "urn:ohpichamber:problem:APPROVAL_NOT_FOUND", title: "Approval unavailable", status: 404,
  detail: "The approval request is no longer pending.", code: "APPROVAL_NOT_FOUND", retryable: false,
 })
 return request
}

async function readPendingQuestion(sessionId: string, requestId: string, runtimeKey: string): Promise<FormRequest> {
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 for (const store of _childStores?.children.values() ?? []) {
  const request = store.getState().form[sessionId]?.find((candidate) => candidate.questionId === requestId)
  if (request?.status === "pending") return request
 }
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 const request = snapshot.questions.find((candidate) => candidate.questionId === requestId && candidate.sessionId === sessionId)
 if (!request) throw new CanonicalApiError({
  type: "urn:ohpichamber:problem:QUESTION_NOT_FOUND", title: "Question unavailable", status: 404,
  detail: "The question request is no longer pending.", code: "QUESTION_NOT_FOUND", retryable: false,
 })
 return request
}

async function submitApproval(request: PermissionRequest, response: "once" | "always" | "reject", runtimeKey: string): Promise<void> {
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 const identity = { version: request.version, epoch: request.epoch, workerGeneration: request.workerGeneration }
 const reply: ApprovalReply = response === "always"
  ? { ...identity, decision: "always-allow", policyScope: "session" }
  : { ...identity, decision: response === "once" ? "approve" : "reject" }
 try {
  const result = await canonicalClient.respondApproval(request.sessionId, request.approvalId, reply)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  if (result.sessionId !== request.sessionId || result.approvalId !== request.approvalId) throw new Error("Approval response identified another request")
  removePermissionRequestFromChildStores(request.sessionId, request.approvalId)
 } catch (error) {
  if (!isStaleRuntime(runtimeKey) && isPermissionRequestNotFoundError(error)) {
   removePermissionRequestFromChildStores(request.sessionId, request.approvalId)
   recoverStaleBlockingRequest(request.sessionId)
  }
  throw error
 }
}

async function submitQuestion(request: FormRequest, action: { action: "answer"; response: JsonValue } | { action: "cancel" }, runtimeKey: string): Promise<void> {
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 const reply: QuestionReply = { version: request.version, epoch: request.epoch, workerGeneration: request.workerGeneration, ...action }
 try {
  const result = await canonicalClient.respondQuestion(request.sessionId, request.questionId, reply)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  if (result.sessionId !== request.sessionId || result.questionId !== request.questionId) throw new Error("Question response identified another request")
  removeFormRequestFromChildStores(request.sessionId, request.questionId)
 } catch (error) {
  if (!isStaleRuntime(runtimeKey) && isFormRequestNotFoundError(error)) {
   removeFormRequestFromChildStores(request.sessionId, request.questionId)
   recoverStaleBlockingRequest(request.sessionId)
  }
  throw error
 }
||||||| bc50ba56aa
/**
 * Directory the reply must be addressed to. Ownership beats containment, so
 * the request's own session record wins over the store that happens to hold it.
 */
function getRequestReplyDirectory(
  type: "permission" | "form",
  sessionId: string,
  requestId: string,
): string | undefined {
  return resolveDirectoryForBlockingRequest(type, sessionId, requestId)
    ?? getSessionReplyDirectory(sessionId)
=======
function getRequestReplyDirectory(
  type: "permission" | "form",
  sessionId: string,
  requestId: string,
): string | undefined {
  return resolveDirectoryForBlockingRequest(type, sessionId, requestId)
    ?? getSessionReplyDirectory(sessionId)
>>>>>>> upstream/main
}

function findSessionRecordAnywhere(sessionId: string, directory: string | undefined): Session | undefined {
  return getDirectoryState(directory)?.session.find((session) => session.id === sessionId)
    ?? getAllSyncSessionMap().get(sessionId)
    ?? useGlobalSessionsStore.getState().entityById.get(sessionId)
}

async function resolveBlockingRequestTarget(
  sessionId: string,
  guessedDirectory: string | undefined,
): Promise<{ record: Session | undefined; directory: string | undefined }> {
  if (sessionId === LOCATION_SCOPED_FORM_SESSION_ID) return { record: undefined, directory: guessedDirectory }
  let record = findSessionRecordAnywhere(sessionId, guessedDirectory)
  if (record === undefined) {
    const readIsCurrent = captureRuntimeInstance()
    let fetched: Session
    try {
      fetched = await opencodeClient.getSession(sessionId, guessedDirectory)
    } catch (error) {
      if (error instanceof Error) markDefiniteTransportFailure(error)
      throw new Error("The reply was not sent because its session record could not be read.", { cause: error })
    }
    if (!readIsCurrent()) throw new Error("The reply was cancelled because the runtime changed.")
    record = findSessionRecordAnywhere(sessionId, guessedDirectory) ?? fetched
  }
  return { record, directory: resolveSessionOwnedDirectory(record) ?? guessedDirectory }
}


<<<<<<< HEAD
/** Capture the existing composer selection in native session admission options. */
export type SessionCreateSelection = {
 model?: { providerId: string; modelId: string }
 agent?: string | null
 variant?: string
 reasoningEffort?: string
||||||| bc50ba56aa
/**
 * The model and agent a session starts on.
 *
 * v2 keeps the selection on the session, and a switch after creation is
 * recorded in the transcript as its own message. Callers that already know
 * what the first turn will run on pass it here, so the session is created on
 * that selection and the first prompt needs no switch at all.
 */
export type SessionCreateSelection = { model?: ModelSelection; agent?: string }

export async function createSession(
  title?: string,
  directoryOverride?: string | null,
  metadata?: Metadata,
  selectionTransition?: "submitted-draft",
  selection?: SessionCreateSelection,
  navigation: "open" | "preserve" = "open",
  /** An id this client minted (`descendingId("ses")`), so records keyed by it before the response stay valid. */
  id?: string,
  expectedRuntimeKey?: string,
): Promise<Session | null> {
  const runtimeKey = expectedRuntimeKey ?? getRuntimeKey()
  const runtimeClient = opencodeClient.getSdkClient()
  try {
    if (getRuntimeKey() !== runtimeKey || opencodeClient.getSdkClient() !== runtimeClient) return null
    // Capture the effective directory used for session creation so we can fall
    // back to it when the server response omits the `directory` field.
    // Without this, setCurrentSession would fall through to a stale
    // opencodeClient.getDirectory() value and group the session under the
    // wrong project (closes #1637, #2270).
    const effectiveDirectory = directoryOverride ?? dir()
    const cleanupSession = await opencodeClient.captureSessionCleanup(effectiveDirectory, runtimeKey)
    if (getRuntimeKey() !== runtimeKey || opencodeClient.getSdkClient() !== runtimeClient) return null
    const sessionMetadata = title ? withUserWorkTitle(metadata ?? {}, title) : metadata
    const session = await opencodeClient.createSession(
      { id, title, metadata: sessionMetadata, model: selection?.model, agent: selection?.agent },
      effectiveDirectory,
    )

    if (getRuntimeKey() !== runtimeKey || opencodeClient.getSdkClient() !== runtimeClient) {
      await cleanupSession(session.id)
      return null
    }
    const sessionDirectory = session.directory || effectiveDirectory || null
    // Pre-populate routing index so SSE events arriving before session.created
    // can be routed to the correct child store
    if (sessionDirectory) {
      registerSessionDirectory(session.id, sessionDirectory)
      const store = _childStores?.ensureChild(sessionDirectory, { bootstrap: false })
      if (store) {
        const current = store.getState().session
        const existing = Binary.search(current, session.id, (candidate) => candidate.id)
        // An event may have published newer metadata before the create response.
        if (!existing.found) {
          store.setState({ session: [...current.slice(0, existing.index), session, ...current.slice(existing.index)] })
        }
      }
      getImperativeSessionMessageLoader()?.initializeCreatedSession({ directory: sessionDirectory, sessionID: session.id })
    }
    if (navigation === "open") useSessionUIStore.getState().setCurrentSession(session.id, sessionDirectory, { transition: selectionTransition })
    useSessionUIStore.getState().markSessionAsOpenChamberCreated(session.id)
    useGlobalSessionsStore.getState().upsertSession(session)
    return session
  } catch (error) {
    console.error("[session-actions] createSession failed", error)
    return null
  }
=======
export type SessionCreateSelection = { model?: ModelSelection; agent?: string }

export async function createSession(
  title?: string,
  directoryOverride?: string | null,
  metadata?: Metadata,
  selectionTransition?: "submitted-draft",
  selection?: SessionCreateSelection,
  navigation: "open" | "preserve" = "open",
  id?: string,
  expectedRuntimeKey?: string,
): Promise<Session | null> {
  const runtimeKey = expectedRuntimeKey ?? getRuntimeKey()
  const runtimeClient = opencodeClient.getSdkClient()
  try {
    if (getRuntimeKey() !== runtimeKey || opencodeClient.getSdkClient() !== runtimeClient) return null
    const effectiveDirectory = directoryOverride ?? dir()
    const cleanupSession = await opencodeClient.captureSessionCleanup(effectiveDirectory, runtimeKey)
    if (getRuntimeKey() !== runtimeKey || opencodeClient.getSdkClient() !== runtimeClient) return null
    const sessionMetadata = title ? withUserWorkTitle(metadata ?? {}, title) : metadata
    const session = await opencodeClient.createSession(
      { id, title, metadata: sessionMetadata, model: selection?.model, agent: selection?.agent },
      effectiveDirectory,
    )

    if (getRuntimeKey() !== runtimeKey || opencodeClient.getSdkClient() !== runtimeClient) {
      await cleanupSession(session.id)
      return null
    }
    const sessionDirectory = session.directory || effectiveDirectory || null
    if (sessionDirectory) {
      registerSessionDirectory(session.id, sessionDirectory)
      const store = _childStores?.ensureChild(sessionDirectory, { bootstrap: false })
      if (store) {
        const current = store.getState().session
        const existing = Binary.search(current, session.id, (candidate) => candidate.id)
        if (!existing.found) {
          store.setState({ session: [...current.slice(0, existing.index), session, ...current.slice(existing.index)] })
        }
      }
      getImperativeSessionMessageLoader()?.initializeCreatedSession({ directory: sessionDirectory, sessionID: session.id })
    }
    if (navigation === "open") useSessionUIStore.getState().setCurrentSession(session.id, sessionDirectory, { transition: selectionTransition })
    useSessionUIStore.getState().markSessionAsOpenChamberCreated(session.id)
    useGlobalSessionsStore.getState().upsertSession(session)
    return session
  } catch (error) {
    console.error("[session-actions] createSession failed", error)
    return null
  }
>>>>>>> upstream/main
}

<<<<<<< HEAD
export async function createSession(
 title?: string,
 directoryOverride?: string | null,
 metadata?: SessionMetadata,
 selectionTransition?: "submitted-draft",
 selection?: SessionCreateSelection,
 navigation: "open" | "preserve" = "open",
 resolveWorkspace: (directory: string) => Promise<Workspace> = (directory) => canonicalClient.resolveWorkspace(directory),
): Promise<CanonicalSession | null> {
 const runtimeKey = getRuntimeKey()
 const runtimeRevision = getRuntimeSwitchRevision()
 try {
  const effectiveDirectory = directoryOverride ?? dir()
  if (!effectiveDirectory) throw new Error("No directory for session creation")
  const workspace = await resolveWorkspace(effectiveDirectory)
  if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) return null
  const admittedMetadata = { ...metadata }
  const createRequest: SessionCreateRequest = {
   projectId: workspace.projectId,
   workspaceId: workspace.workspaceId,
   options: {
    providerId: selection?.model?.providerId ?? null,
    modelId: selection?.model?.modelId ?? null,
    agentId: selection?.agent ?? null,
    variant: selection?.variant ?? null,
    reasoningEffort: selection?.reasoningEffort ?? null,
   },
   metadata: SessionMetadataSchema.parse(admittedMetadata),
  }
  if (title !== undefined) createRequest.title = title
  const { session } = await canonicalClient.createSession(createRequest)
  if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) return null
  registerWorkspaceDirectory(workspace.workspaceId, effectiveDirectory)
  _childStores?.ensureChild(effectiveDirectory, { bootstrap: false })
  publishCanonicalSession(session, effectiveDirectory)
  getImperativeSessionMessageLoader()?.initializeCreatedSession({ directory: effectiveDirectory, sessionId: session.sessionId })
  if (navigation === "open") useSessionUIStore.getState().setCurrentSession(session.sessionId, effectiveDirectory, selectionTransition)
  useSessionUIStore.getState().markSessionAsOpenChamberCreated(session.sessionId)
  return session
 } catch (error) {
  if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) return null
  // A canonical refusal such as the Agent Service capacity outcome carries
  // the sentence to show. Let the draft lifecycle report it instead of
  // turning every refusal into the same silent null; ordinary transport
  // failures keep the existing null contract.
  if (error instanceof CanonicalApiError) throw error
  console.error("[session-actions] createSession failed", error)
  return null
 }
||||||| bc50ba56aa
/**
 * Opens an empty transcript for a session this client is about to create
 * under `sessionId` in `directory`: events for it route to that store, and
 * its first message can be shown there before the server answers. The
 * create response then finds the transcript and leaves it alone.
 */
export function openPendingSessionTranscript(sessionId: string, directory: string): void {
  registerSessionDirectory(sessionId, directory)
  _childStores?.ensureChild(directory, { bootstrap: false })
  getImperativeSessionMessageLoader()?.initializeCreatedSession({ directory, sessionID: sessionId })
=======
export function openPendingSessionTranscript(sessionId: string, directory: string): void {
  registerSessionDirectory(sessionId, directory)
  _childStores?.ensureChild(directory, { bootstrap: false })
  getImperativeSessionMessageLoader()?.initializeCreatedSession({ directory, sessionID: sessionId })
>>>>>>> upstream/main
}

function isStaleRuntime(expectedRuntimeKey: string | undefined): boolean {
 return expectedRuntimeKey !== undefined && getRuntimeKey() !== expectedRuntimeKey
}

const isMetadataRecord = (value: JsonValue | undefined): value is Metadata =>
 value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)

// external: https://www.rfc-editor.org/rfc/rfc7386 Metadata merge patches delete keys with null and preserve untouched nested siblings.
function buildMetadataMergePatch(current: Metadata, next: Metadata): Metadata {
 const patch: Metadata = {}
 for (const key of Object.keys(current)) {
  if (!(key in next)) patch[key] = null
 }
 for (const [key, value] of Object.entries(next)) {
  const previous = current[key]
  if (isMetadataRecord(value) && isMetadataRecord(previous)) {
   const nested = buildMetadataMergePatch(previous, value)
   if (Object.keys(nested).length > 0) patch[key] = nested
   continue
  }
  if (JSON.stringify(previous) !== JSON.stringify(value)) patch[key] = value
 }
 return patch
}

export async function patchSessionMetadata(
<<<<<<< HEAD
 sessionId: string,
 directory: string | null | undefined,
 updater: (metadata: SessionMetadataRecord) => SessionMetadataRecord,
 expectedRuntimeKey?: string,
 expectedRuntimeRevision = getRuntimeSwitchRevision(),
): Promise<CanonicalSession> {
 const runtimeKey = expectedRuntimeKey ?? getRuntimeKey()
 if (isStaleRuntime(runtimeKey) || expectedRuntimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
 const current = getGlobalSessionSnapshot(sessionId) ?? await readCanonicalSession(sessionId, runtimeKey, expectedRuntimeRevision)
 if (isStaleRuntime(runtimeKey) || expectedRuntimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
 const metadata = await canonicalClient.getSessionMetadata(sessionId)
 if (isStaleRuntime(runtimeKey) || expectedRuntimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
 if (metadata.sessionId !== sessionId) throw new Error("Metadata response identified another session")
 const currentMetadata = metadata.metadata ?? {}
 const nextMetadata = SessionMetadataSchema.parse(updater(currentMetadata))
 const patch = SessionMetadataPatchSchema.parse({ changes: buildMetadataMergePatch(currentMetadata, nextMetadata) })
 const result = await canonicalClient.patchSessionMetadata(sessionId, patch)
 if (isStaleRuntime(runtimeKey) || expectedRuntimeRevision !== getRuntimeSwitchRevision()) throw new Error("runtime changed")
 if (result.sessionId !== sessionId) throw new Error("Metadata response identified another session")
 if (directory) registerSessionDirectory(sessionId, resolveGlobalSessionDirectory(current) ?? directory)
 return publishCanonicalMetadata(current, result)
||||||| bc50ba56aa
  sessionId: string,
  directory: string | null | undefined,
  updater: (metadata: SessionMetadataRecord) => SessionMetadataRecord,
  expectedRuntimeKey?: string,
): Promise<Session> {
  if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
  const targetDirectory = directory ?? getSessionDirectory(sessionId)
  const current = await opencodeClient.getSession(sessionId, targetDirectory)
  if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
  const currentMetadata = getSessionMetadata(current)
  const nextMetadata = updater(currentMetadata)
  // OpenCode 2.x only accepts metadata at session creation, so OpenChamber
  // keeps it (see session-archive-batch). The store applies a merge patch, so
  // only the difference travels and a key the updater dropped is deleted
  // explicitly. A runtime without that route cannot persist the change, and
  // reporting success would strand a review or btw link that the next load
  // silently drops.
  const result = await requestSessionMetadataUpdate(sessionId, buildMetadataMergePatch(currentMetadata, nextMetadata), targetDirectory)
  if (result.outcome !== "updated") throw new Error(`session metadata update failed: ${result.reason}`)
  const updated: Session = { ...current, metadata: result.metadata }
  if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
  useGlobalSessionsStore.getState().upsertSession(updated)
  const sessionDirectory = updated.directory || targetDirectory
  if (sessionDirectory) registerSessionDirectory(updated.id, sessionDirectory)
  mirrorSessionIntoLiveStores(updated, sessionDirectory ?? undefined)
  return updated
=======
  sessionId: string,
  directory: string | null | undefined,
  updater: (metadata: SessionMetadataRecord) => SessionMetadataRecord,
  expectedRuntimeKey?: string,
): Promise<Session> {
  if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
  const targetDirectory = directory ?? getSessionDirectory(sessionId)
  const current = await opencodeClient.getSession(sessionId, targetDirectory)
  if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
  const currentMetadata = getSessionMetadata(current)
  const nextMetadata = updater(currentMetadata)
  const result = await requestSessionMetadataUpdate(sessionId, buildMetadataMergePatch(currentMetadata, nextMetadata), targetDirectory)
  if (result.outcome !== "updated") throw new Error(`session metadata update failed: ${result.reason}`)
  const updated = withSessionMetadata(current, result.metadata)
  if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
  useGlobalSessionsStore.getState().upsertSession(updated)
  const sessionDirectory = updated.directory || targetDirectory
  if (sessionDirectory) registerSessionDirectory(updated.id, sessionDirectory)
  mirrorSessionIntoLiveStores(updated, sessionDirectory ?? undefined)
  return updated
>>>>>>> upstream/main
}

export async function setLinkedIssue(
 sessionId: string,
 directory: string | null | undefined,
 issue: LinkedIssue,
 linked: boolean,
): Promise<CanonicalSession> {
 return updateLinkedIssues(sessionId, directory, [issue], linked)
}

export async function addLinkedIssues(
 sessionId: string,
 directory: string | null | undefined,
 issues: readonly LinkedIssue[],
): Promise<CanonicalSession> {
 return updateLinkedIssues(sessionId, directory, issues, true)
}

async function updateLinkedIssues(
<<<<<<< HEAD
 sessionId: string,
 directory: string | null | undefined,
 issues: readonly LinkedIssue[],
 linked: boolean,
): Promise<CanonicalSession> {
 const runtimeKey = getRuntimeKey()
 const targetDirectory = directory ?? getSessionDirectory(sessionId)
 // A session no store holds still needs a record for the mirroring, and the
 // read can fail: taken before the write, a failed read rejects with nothing
 // landed. The read is display-only — none of the link list comes from the
 // client — so its ordering is free, and it must not turn into a report of
 // a link that did land.
 const heldBeforeRequest = getGlobalSessionSnapshot(sessionId) !== null
  || findLiveSession(sessionId) !== null
 const fallbackRecord = heldBeforeRequest
  ? null
  : await readCanonicalSession(sessionId, runtimeKey)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 const result = await requestSessionLinksUpdate(sessionId, issues, linked, targetDirectory)
 if (result.outcome !== "updated") throw new Error(`session link update failed: ${result.reason}`)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 // The server answered with the merged metadata; the session record is
 // display-only here. A session a store holds is mirrored from its snapshot
 // as the response lands; a store-miss uses the record read before the
 // request. A stale read can no longer corrupt the link list, since none of
 // it comes from the client. The route carries metadata, not a new revision:
 // the metadata broadcast owns that counter.
 const record = fallbackRecord
  ?? getGlobalSessionSnapshot(sessionId)
  ?? findLiveSession(sessionId)
  ?? await readCanonicalSession(sessionId, runtimeKey)
 const updated = publishCanonicalMetadata(record, {
  sessionId,
  revision: record.metadataRevision,
  metadata: result.metadata,
 })
 if (targetDirectory) registerSessionDirectory(sessionId, targetDirectory)
 return updated
||||||| bc50ba56aa
  sessionId: string,
  directory: string | null | undefined,
  issues: readonly LinkedIssue[],
  linked: boolean,
): Promise<Session> {
  const targetDirectory = directory ?? getSessionDirectory(sessionId)
  // A session no store holds still needs a record for the mirroring, and the
  // read can fail: taken before the write, a failed read rejects with nothing
  // landed. The read is display-only — none of the link list comes from the
  // client — so its ordering is free, and it must not turn into a report of
  // a link that did land.
  const heldBeforeRequest = getGlobalSessionSnapshot(sessionId) !== null
    || findLiveSession(sessionId) !== null
  const fallbackRecord = heldBeforeRequest
    ? null
    : await opencodeClient.getSession(sessionId, targetDirectory)
  const result = await requestSessionLinksUpdate(sessionId, issues, linked, targetDirectory)
  if (result.outcome !== "updated") throw new Error(`session link update failed: ${result.reason}`)
  // The server answered with the merged metadata; the session record is
  // display-only here. A session a store holds is mirrored from its snapshot
  // as the response lands; a store-miss uses the record read before the
  // request. A stale read can no longer corrupt the link list, since none of
  // it comes from the client.
  const record = fallbackRecord
    ?? (getGlobalSessionSnapshot(sessionId) ?? findLiveSession(sessionId))
    ?? await opencodeClient.getSession(sessionId, targetDirectory)
  const updated: Session = { ...record, metadata: result.metadata }
  useGlobalSessionsStore.getState().upsertSession(updated)
  const sessionDirectory = updated.directory || targetDirectory
  if (sessionDirectory) registerSessionDirectory(updated.id, sessionDirectory)
  mirrorSessionIntoLiveStores(updated, sessionDirectory ?? undefined)
  return updated
=======
  sessionId: string,
  directory: string | null | undefined,
  issues: readonly LinkedIssue[],
  linked: boolean,
): Promise<Session> {
  const targetDirectory = directory ?? getSessionDirectory(sessionId)
  const heldBeforeRequest = getGlobalSessionSnapshot(sessionId) !== null
    || findLiveSession(sessionId) !== null
  const fallbackRecord = heldBeforeRequest
    ? null
    : await opencodeClient.getSession(sessionId, targetDirectory)
  const result = await requestSessionLinksUpdate(sessionId, issues, linked, targetDirectory)
  if (result.outcome !== "updated") throw new Error(`session link update failed: ${result.reason}`)
  const record = fallbackRecord
    ?? (getGlobalSessionSnapshot(sessionId) ?? findLiveSession(sessionId))
    ?? await opencodeClient.getSession(sessionId, targetDirectory)
  const updated: Session = { ...record, metadata: result.metadata }
  useGlobalSessionsStore.getState().upsertSession(updated)
  const sessionDirectory = updated.directory || targetDirectory
  if (sessionDirectory) registerSessionDirectory(updated.id, sessionDirectory)
  mirrorSessionIntoLiveStores(updated, sessionDirectory ?? undefined)
  return updated
>>>>>>> upstream/main
}

export async function setSessionWorkState(
<<<<<<< HEAD
 sessionId: string,
 directory: string | null | undefined,
 state: SessionWork["state"],
): Promise<CanonicalSession | null> {
 const runtimeKeyAtClick = getRuntimeKey()
 try {
  return await patchSessionMetadata(sessionId, directory, (metadata) =>
   withSessionWorkState(metadata, state, Date.now()), runtimeKeyAtClick)
 } catch (error) {
  if (isStaleRuntime(runtimeKeyAtClick)) return null
  throw error
 }
||||||| bc50ba56aa
  sessionId: string,
  directory: string | null | undefined,
  state: SessionWork["state"],
): Promise<Session | null> {
  const runtimeKeyAtClick = getRuntimeKey()
  try {
    return await patchSessionMetadata(sessionId, directory, (metadata) =>
      withSessionWorkState(metadata, state, Date.now()), runtimeKeyAtClick)
  } catch (error) {
    if (isStaleRuntime(runtimeKeyAtClick)) return null
    throw error
  }
=======
  sessionId: string,
  directory: string | null | undefined,
  state: SessionWork["state"],
): Promise<Session | null> {
  const runtimeKeyAtClick = getRuntimeKey()
  try {
    return await patchSessionMetadata(sessionId, directory, (metadata) =>
      state === "open" && isPinnedMetadata(metadata) ? metadata : withSessionWorkState(metadata, state, Date.now()), runtimeKeyAtClick)
  } catch (error) {
    if (isStaleRuntime(runtimeKeyAtClick)) return null
    throw error
  }
>>>>>>> upstream/main
}

export async function setSessionPinned(
<<<<<<< HEAD
 sessionId: string,
 directory: string | null | undefined,
 pinned: boolean,
): Promise<CanonicalSession | null> {
 const runtimeKeyAtClick = getRuntimeKey()
 try {
  return await patchSessionMetadata(sessionId, directory, (metadata) =>
   withSessionPinned(metadata, pinned, Date.now()), runtimeKeyAtClick)
 } catch (error) {
  if (isStaleRuntime(runtimeKeyAtClick)) return null
  throw error
 }
||||||| bc50ba56aa
  sessionId: string,
  directory: string | null | undefined,
  pinned: boolean,
  list: string | null = null,
): Promise<Session | null> {
  const runtimeKeyAtClick = getRuntimeKey()
  try {
    return await patchSessionMetadata(sessionId, directory, (metadata) =>
      withSessionPinned(metadata, pinned, Date.now(), list), runtimeKeyAtClick)
  } catch (error) {
    if (isStaleRuntime(runtimeKeyAtClick)) return null
    throw error
  }
=======
  sessionId: string,
  directory: string | null | undefined,
  pinned: boolean,
  list: string | null = null,
): Promise<Session | null> {
  const runtimeKeyAtClick = getRuntimeKey()
  try {
    return await patchSessionMetadata(sessionId, directory, (metadata) => {
      const now = Date.now()
      const next = withSessionPinned(metadata, pinned, now, list)
      return pinned ? withSessionWorkClosed(next, now) : next
    }, runtimeKeyAtClick)
  } catch (error) {
    if (isStaleRuntime(runtimeKeyAtClick)) return null
    throw error
  }
>>>>>>> upstream/main
}

export async function setContextObligatoryMessage(
 sessionId: string,
 directory: string | null | undefined,
 message: ContextObligatoryMessage,
 pinned: boolean,
): Promise<CanonicalSession> {
 return patchSessionMetadata(sessionId, directory, (metadata) =>
  withContextObligatoryMessage(metadata, message, pinned))
}

async function cleanupReviewMetadataBeforeDelete(
 sessionId: string,
 directory?: string | null,
 expectedRuntimeKey?: string,
): Promise<void> {
 if (isStaleRuntime(expectedRuntimeKey)) return
 let metadata: CanonicalSession["metadata"]
 try {
  metadata = (await canonicalClient.getSessionMetadata(sessionId)).metadata
 } catch {
  return
 }
 if (isStaleRuntime(expectedRuntimeKey)) return

 const unlinkParent = async (originalSessionID: string, unlink: (metadata: SessionMetadataRecord) => SessionMetadataRecord) => {
  try {
   await patchSessionMetadata(originalSessionID, directory ?? getSessionDirectory(originalSessionID), unlink, expectedRuntimeKey)
  } catch (error) {
   const message = error instanceof Error ? error.message : String(error)
   if (/not found/i.test(message)) return
   console.warn("[session-actions] linked-session metadata cleanup failed before delete", error)
  }
 }

 if (metadata?.openchamber?.kind === "review") {
  const originalSessionID = metadata.openchamber.originalSessionID
  if (originalSessionID) await unlinkParent(originalSessionID, (current) => withoutReviewSessionLink(current, sessionId))
  return
 }

<<<<<<< HEAD
||||||| bc50ba56aa
  if (isReviewSession(session)) {
    const originalSessionID = getOriginalSessionID(session)
    if (originalSessionID) await unlinkParent(originalSessionID, (metadata) => withoutReviewSessionLink(metadata, sessionId))
    return
  }

  if (isBtwSession(session)) {
    const originalSessionID = getBtwOriginalSessionID(session)
    if (originalSessionID) await unlinkParent(originalSessionID, (metadata) => withoutBtwSessionLink(metadata, sessionId))
    return
  }

  // Deleting or archiving a session that has an active btw fork also removes
  // the fork: it is a temporary session that only exists for its parent's
  // panel. Best-effort — a failed fork delete must not block the parent's
  // operation; the orphaned fork stays visible in the sidebar.
  const btwSessionID = getBtwSessionID(session)
  if (btwSessionID) {
    try {
      if (isStaleRuntime(expectedRuntimeKey)) return
      await deleteSession(btwSessionID, { expectedRuntimeKey })
    } catch (error) {
      console.warn("[session-actions] failed to delete btw fork before parent delete", error)
    }
  }
=======
  if (isReviewSession(session)) {
    const originalSessionID = getOriginalSessionID(session)
    if (originalSessionID) await unlinkParent(originalSessionID, (metadata) => withoutReviewSessionLink(metadata, sessionId))
    return
  }

  if (isBtwSession(session)) {
    const originalSessionID = getBtwOriginalSessionID(session)
    if (originalSessionID) await unlinkParent(originalSessionID, (metadata) => withoutBtwSessionLink(metadata, sessionId))
    return
  }

  const btwSessionID = getBtwSessionID(session)
  if (btwSessionID) {
    try {
      if (isStaleRuntime(expectedRuntimeKey)) return
      await deleteSession(btwSessionID, { expectedRuntimeKey })
    } catch (error) {
      console.warn("[session-actions] failed to delete btw fork before parent delete", error)
    }
  }
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** Remove a server-confirmed session from every live child store that has it. */
function removeSessionFromLiveStores(sessionId: string, preferredDirectory?: string): SessionListSnapshot[] {
 if (!_childStores) return []
||||||| bc50ba56aa
/** Remove a server-confirmed session from every live child store that has it. */
function removeSessionFromLiveStores(sessionId: string, preferredDirectory?: string, archive = false): SessionListSnapshot[] {
  if (!_childStores) return []
=======
function removeSessionFromLiveStores(sessionId: string, preferredDirectory?: string, archive = false): SessionListSnapshot[] {
  if (!_childStores) return []
>>>>>>> upstream/main

 const snapshots: SessionListSnapshot[] = []
 const visited = new Set<string>()
 const candidates: Array<[string, DirectoryStoreApi]> = []

 if (preferredDirectory) {
  const preferredStore = _childStores.children.get(preferredDirectory)
  if (preferredStore) {
   candidates.push([preferredDirectory, preferredStore])
   visited.add(preferredDirectory)
  }
 }

 for (const entry of _childStores.children.entries()) {
  if (visited.has(entry[0])) continue
  candidates.push(entry)
 }

 for (const [directory, store] of candidates) {
  const current = store.getState()
  if (!current.session.some((session) => session.sessionId === sessionId)) {
   continue
  }
  snapshots.push({ directory })
  const patch: Partial<ReturnType<DirectoryStoreApi["getState"]>> = {
   session: current.session.filter((session) => session.sessionId !== sessionId),
   ...sessionMutationPatch(current, sessionId, true),
  }
  store.setState(patch)
 }

 return snapshots
}

function removeSessionsFromLiveStores(sessionIds: Iterable<string>, preferredDirectory?: string, archive = false): SessionListSnapshot[] {
 const ids = new Set(sessionIds)
 if (!_childStores || ids.size === 0) return []
 const cacheIds = [...ids]

 const snapshots: SessionListSnapshot[] = []
 const visited = new Set<string>()
 const candidates: Array<[string, DirectoryStoreApi]> = []

 if (preferredDirectory) {
  const preferredStore = _childStores.children.get(preferredDirectory)
  if (preferredStore) {
   candidates.push([preferredDirectory, preferredStore])
   visited.add(preferredDirectory)
  }
 }

 for (const entry of _childStores.children.entries()) {
  if (visited.has(entry[0])) continue
  candidates.push(entry)
 }

 for (const [directory, store] of candidates) {
  const current = store.getState()
  const removed = current.session.filter((session) => ids.has(session.sessionId)).map((session) => session.sessionId)
  const cached = archive && (directory === preferredDirectory || cacheIds.some((id) => current.snapshot[id] || current.message[id] || current.partOwner[id] || current.sessionEpoch[id] || current.sessionCursor[id] || current.session_status[id] || current.permission[id] || current.form[id]))
  if (removed.length === 0 && !cached) continue

  snapshots.push({ directory })
  const patch = archive ? purgeSessionCaches(current, cacheIds) : { ...current }
  patch.session = current.session.filter((session) => !ids.has(session.sessionId))
  Object.assign(patch, sessionsMutationPatch(current, removed, true))
  if (archive) {
   // Keep the unknown-status fence after purging the old snapshot. Directory
   // readiness alone must not certify an archived/restored session idle.
   const invalidated = patch.sessionStatusInvalidated ?? {}
   for (const id of ids) invalidated[id] = true
   patch.sessionStatusInvalidated = invalidated
  }
  store.setState(patch)
 }

 return snapshots
}

function cleanupSessionWorktreeMetadata(sessionId: string): void {
 useSessionUIStore.getState().setWorktreeMetadata(sessionId, null)
}

function finalizeConfirmedSessionDeletion(
 sessionId: string,
 sessionDirectory?: string,
 expectedRuntimeKey = getRuntimeKey(),
): void {
 const snapshots = removeSessionFromLiveStores(sessionId, sessionDirectory)
 removeGlobalSessionStatuses([sessionId])
 for (const store of _childStores?.children.values() ?? []) {
  const invalidated = store.getState().sessionStatusInvalidated
  if (!invalidated?.[sessionId]) continue
  const next = { ...invalidated }
  delete next[sessionId]
  store.setState({ sessionStatusInvalidated: next })
 }
 invalidateSessionLoads(sessionId, [...snapshots.map((snapshot) => snapshot.directory), sessionDirectory])
 useGlobalSessionsStore.getState().removeSessions([sessionId])
 const ui = useSessionUIStore.getState()
 if (ui.currentSessionId === sessionId) ui.setCurrentSession(null)
 cleanupSessionWorktreeMetadata(sessionId)
 if (sessionDirectory) {
  cleanupPersistedSessionState({
   runtimeKey: expectedRuntimeKey,
   directory: sessionDirectory,
   sessionId,
  })
 }
}

export function reconcileExternallyDeletedSession(identity: {
 runtimeKey: string
 directory: string
 sessionId: string
}): void {
 if (isStaleRuntime(identity.runtimeKey)) return
 finalizeConfirmedSessionDeletion(identity.sessionId, identity.directory, identity.runtimeKey)
}

type ChatDirectoryCleanupPlan = {
<<<<<<< HEAD
 directory: string | undefined
 /** Only a root session owns its managed chat directory. */
 rootDeleted: boolean
 /** The deleted session and the descendants the server cascade-deletes with it. */
 cascadeIds: ReadonlySet<string>
||||||| bc50ba56aa
  directory: string | undefined
  /** Only a root session owns its managed chat directory. */
  rootDeleted: boolean
  /** The deleted session and the descendants the server cascade-deletes with it. */
  cascadeIds: ReadonlySet<string>
=======
  directory: string | undefined
  rootDeleted: boolean
  cascadeIds: ReadonlySet<string>
>>>>>>> upstream/main
}

function planChatDirectoryCleanup(sessionId: string, snapshot: CanonicalSession | null, directory: string | undefined): ChatDirectoryCleanupPlan {
 const global = useGlobalSessionsStore.getState()
 return {
  directory,
  rootDeleted: Boolean(snapshot && snapshot.parentSessionId == null),
  cascadeIds: computeSubtreeIds([...global.activeSessions, ...global.archivedSessions], sessionId),
 }
}

<<<<<<< HEAD
/**
 * A managed chat directory is shared by every fork, side thread, and subagent
 * of the chat that created it, and OpenCode fails every prompt in a session
 * whose directory is gone. The directory is therefore removed only once no
 * known session outside the deleted subtree still resolves to it. An unloaded
 * global cache cannot prove that, so it keeps the directory: a leaked scratch
 * directory is recoverable, a stranded session is not.
 */
function isChatDirectoryStillReferenced(directory: string, excludedIds: ReadonlySet<string>): boolean {
 const global = useGlobalSessionsStore.getState()
 if (!global.hasLoaded) return true
 const normalized = normalizePath(directory)
 return [...global.activeSessions, ...global.archivedSessions].some((session) => (
  !excludedIds.has(session.sessionId) && resolveGlobalSessionDirectory(session) === normalized
 ))
||||||| bc50ba56aa
/**
 * A managed chat directory is shared by every fork, side thread, and subagent
 * of the chat that created it, and OpenCode fails every prompt in a session
 * whose directory is gone. The directory is therefore removed only once no
 * known session outside the deleted subtree still resolves to it. An unloaded
 * global cache cannot prove that, so it keeps the directory: a leaked scratch
 * directory is recoverable, a stranded session is not.
 */
function isChatDirectoryStillReferenced(directory: string, excludedIds: ReadonlySet<string>): boolean {
  const global = useGlobalSessionsStore.getState()
  if (!global.hasLoaded) return true
  const normalized = normalizePath(directory)
  return [...global.activeSessions, ...global.archivedSessions].some((session) => (
    !excludedIds.has(session.id) && resolveGlobalSessionDirectory(session) === normalized
  ))
=======
export function isChatDirectoryStillReferenced(directory: string, excludedIds: ReadonlySet<string>): boolean {
  const global = useGlobalSessionsStore.getState()
  if (!global.hasLoaded) return true
  const normalized = normalizePath(directory)
  return [...global.activeSessions, ...global.archivedSessions].some((session) => (
    !excludedIds.has(session.id) && resolveGlobalSessionDirectory(session) === normalized
  ))
>>>>>>> upstream/main
}

async function cleanupDeletedChatDirectory(plan: ChatDirectoryCleanupPlan, expectedRuntimeKey: string): Promise<void> {
 if (isStaleRuntime(expectedRuntimeKey) || !plan.directory || !plan.rootDeleted) return
 if (isChatDirectoryStillReferenced(plan.directory, plan.cascadeIds)) return
 try {
  await deleteChatDirectory(plan.directory)
 } catch (error) {
  console.warn("[session-actions] deleted chat directory cleanup failed", error)
 }
}

export type DeleteSessionOptions = {
<<<<<<< HEAD
 /**
  * Runtime key the deletion is scoped to. Defaults to the active runtime when
  * the action starts; callers may supply a key captured earlier when
  * confirmation spans a runtime switch.
  */
 expectedRuntimeKey?: string
||||||| bc50ba56aa
  /**
   * Runtime key the deletion is scoped to. Defaults to the active runtime when
   * the action starts; callers may supply a key captured earlier when
   * confirmation spans a runtime switch.
   */
  expectedRuntimeKey?: string
=======
  expectedRuntimeKey?: string
>>>>>>> upstream/main
}

export async function deleteSession(sessionId: string, options?: DeleteSessionOptions): Promise<boolean> {
 const expectedRuntimeKey = options?.expectedRuntimeKey ?? getRuntimeKey()
 if (isStaleRuntime(expectedRuntimeKey)) return false
 const sessionDirectory = getSessionDirectory(sessionId)
 const chatDirectoryCleanup = planChatDirectoryCleanup(sessionId, getGlobalSessionSnapshot(sessionId), sessionDirectory)
 try {
  await cleanupReviewMetadataBeforeDelete(sessionId, sessionDirectory, expectedRuntimeKey)
  if (isStaleRuntime(expectedRuntimeKey)) return false
<<<<<<< HEAD
  const deleted = await canonicalClient.deleteSession(sessionId)
  if (isStaleRuntime(expectedRuntimeKey)) return false
  if (deleted.sessionId !== sessionId || !deleted.deletedSessionIds.includes(sessionId)) {
   throw new Error("session.delete failed: server did not confirm deletion")
||||||| bc50ba56aa
  const sessionDirectory = getSessionDirectory(sessionId)
  const chatDirectoryCleanup = planChatDirectoryCleanup(sessionId, getGlobalSessionSnapshot(sessionId), sessionDirectory)
  try {
    await cleanupReviewMetadataBeforeDelete(sessionId, sessionDirectory, expectedRuntimeKey)
    if (isStaleRuntime(expectedRuntimeKey)) return false
    const deleted = await opencodeClient.deleteSession(sessionId, sessionDirectory)
    if (isStaleRuntime(expectedRuntimeKey)) return false
    if (deleted !== true) {
      throw new Error("session.delete failed: server did not confirm deletion")
    }
    finalizeConfirmedSessionDeletion(sessionId, sessionDirectory, expectedRuntimeKey)
    await cleanupDeletedChatDirectory(chatDirectoryCleanup)
    return true
  } catch (error) {
    console.error("[session-actions] deleteSession failed", error)
    recordSessionActionFailure(sessionId, toError(error))
    // The server cascade-deletes child sessions when the parent is removed.
    // Subsequent delete attempts for those children return 404; treat as
    // success since the session was already deleted by the cascade.
    if ((error as { status?: number })?.status === 404) {
      if (isStaleRuntime(expectedRuntimeKey)) return false
      finalizeConfirmedSessionDeletion(sessionId, sessionDirectory, expectedRuntimeKey)
      await cleanupDeletedChatDirectory(chatDirectoryCleanup)
      return true
    }
    return false
=======
  const sessionDirectory = getSessionDirectory(sessionId)
  const chatDirectoryCleanup = planChatDirectoryCleanup(sessionId, getGlobalSessionSnapshot(sessionId), sessionDirectory)
  try {
    await cleanupReviewMetadataBeforeDelete(sessionId, sessionDirectory, expectedRuntimeKey)
    if (isStaleRuntime(expectedRuntimeKey)) return false
    const deleted = await opencodeClient.deleteSession(sessionId, sessionDirectory)
    if (isStaleRuntime(expectedRuntimeKey)) return false
    if (deleted !== true) {
      throw new Error("session.delete failed: server did not confirm deletion")
    }
    finalizeConfirmedSessionDeletion(sessionId, sessionDirectory, expectedRuntimeKey)
    await cleanupDeletedChatDirectory(chatDirectoryCleanup)
    return true
  } catch (error) {
    console.error("[session-actions] deleteSession failed", error)
    recordSessionActionFailure(sessionId, toError(error))
    if ((error as { status?: number })?.status === 404) {
      if (isStaleRuntime(expectedRuntimeKey)) return false
      finalizeConfirmedSessionDeletion(sessionId, sessionDirectory, expectedRuntimeKey)
      await cleanupDeletedChatDirectory(chatDirectoryCleanup)
      return true
    }
    return false
>>>>>>> upstream/main
  }
  for (const deletedId of deleted.deletedSessionIds) finalizeConfirmedSessionDeletion(deletedId, getSessionDirectory(deletedId), expectedRuntimeKey)
  await cleanupDeletedChatDirectory({ ...chatDirectoryCleanup, cascadeIds: new Set(deleted.deletedSessionIds) }, expectedRuntimeKey)
  return true
 } catch (error) {
  if (isStaleRuntime(expectedRuntimeKey)) return false
  console.error("[session-actions] deleteSession failed", error)
  recordSessionActionFailure(sessionId, toError(error))
  // The server cascade-deletes child sessions when the parent is removed.
  // Subsequent delete attempts for those children return 404; treat as
  // success since the session was already deleted by the cascade.
  if ((error instanceof CanonicalApiError ? error.problem.status : getErrorStatus(error)) === 404) {
   if (isStaleRuntime(expectedRuntimeKey)) return false
   finalizeConfirmedSessionDeletion(sessionId, sessionDirectory, expectedRuntimeKey)
   await cleanupDeletedChatDirectory(chatDirectoryCleanup, expectedRuntimeKey)
   return true
  }
  return false
 }
}

export type DeleteSessionsOptions = {
<<<<<<< HEAD
 /**
  * Runtime key captured when the batch was confirmed. When supplied, the batch
  * stops as soon as the active runtime differs.
  */
 expectedRuntimeKey?: string
||||||| bc50ba56aa
  /**
   * Runtime key captured when the batch was confirmed. When supplied, the batch
   * stops as soon as the active runtime differs.
   */
  expectedRuntimeKey?: string
=======
  expectedRuntimeKey?: string
>>>>>>> upstream/main
}

export async function deleteSessions(
 ids: string[],
 options?: DeleteSessionsOptions,
): Promise<{ deletedIds: string[]; failedIds: string[] }> {
 const deletedIds: string[] = []
 const failedIds: string[] = []
 const expectedRuntimeKey = options?.expectedRuntimeKey ?? getRuntimeKey()

 for (const [index, id] of ids.entries()) {
  if (isStaleRuntime(expectedRuntimeKey)) {
   failedIds.push(...ids.slice(index))
   break
  }
  if (await deleteSession(id, { expectedRuntimeKey })) deletedIds.push(id)
  else failedIds.push(id)
 }

 return { deletedIds, failedIds }
}

export async function archiveSession(sessionId: string, expectedRuntimeKey = getRuntimeKey()): Promise<boolean> {
 if (isStaleRuntime(expectedRuntimeKey)) return false
 const sessionDirectory = getSessionDirectory(sessionId)
 const archivedAt = Date.now()
 try {
  await cleanupReviewMetadataBeforeDelete(sessionId, sessionDirectory, expectedRuntimeKey)
  if (isStaleRuntime(expectedRuntimeKey)) return false
  if (!sessionDirectory) throw new Error("archive failed: session directory is unknown")
  const result = await requestSessionArchiveBatch(sessionDirectory, [sessionId], archivedAt)
  if (isStaleRuntime(expectedRuntimeKey)) return false
  if (result.outcome !== "archived") {
   throw new Error(`archive failed: ${result.reason}`)
  }
  const stamp = result.archived.find((entry) => entry.id === sessionId)
  if (!stamp) {
   throw new Error("archive failed: server did not return the archived session")
  }
  const archived = withArchivedAt(sessionId, stamp.archivedAt)
  const snapshots = removeSessionsFromLiveStores([sessionId], sessionDirectory, true)
  removeGlobalSessionStatuses([sessionId])
  invalidateSessionLoadBatch([sessionId], [...snapshots.map((snapshot) => snapshot.directory), sessionDirectory], false)
  if (archived) useGlobalSessionsStore.getState().upsertSession(archived)
  const ui = useSessionUIStore.getState()
  if (ui.currentSessionId === sessionId) ui.setCurrentSession(null)
  return true
 } catch (error) {
  if (isStaleRuntime(expectedRuntimeKey)) return false
  console.error("[session-actions] archiveSession failed", error)
  recordSessionActionFailure(sessionId, toError(error))
  return false
 }
}

export type ArchiveSessionsOptions = {
<<<<<<< HEAD
 /**
  * Runtime key captured when the batch was confirmed. When supplied, the batch
  * stops as soon as the active runtime differs.
  */
 expectedRuntimeKey?: string
||||||| bc50ba56aa
  /**
   * Runtime key captured when the batch was confirmed. When supplied, the batch
   * stops as soon as the active runtime differs.
   */
  expectedRuntimeKey?: string
=======
  expectedRuntimeKey?: string
>>>>>>> upstream/main
}

export async function archiveSessions(
 ids: string[],
 options?: ArchiveSessionsOptions,
): Promise<{ archivedIds: string[]; failedIds: string[] }> {
 const archivedIds: string[] = []
 const failedIds: string[] = []
 const expectedRuntimeKey = options?.expectedRuntimeKey ?? getRuntimeKey()
 if (ids.length === 0) return { archivedIds, failedIds }

 const plan = planArchiveBatches(ids)

<<<<<<< HEAD
 for (const [directory, batchIds] of plan.batchesByDirectory) {
  if (isStaleRuntime(expectedRuntimeKey)) {
   failedIds.push(...batchIds)
   continue
||||||| bc50ba56aa
  for (const [directory, batchIds] of plan.batchesByDirectory) {
    if (isStaleRuntime(expectedRuntimeKey)) {
      failedIds.push(...batchIds)
      continue
    }

    const archivedAt = Date.now()
    registerBulkArchiveEchoes(
      expectedRuntimeKey,
      batchIds.map((id) => ({ id, archivedAt })),
    )
    const result = await requestSessionArchiveBatch(directory, batchIds, archivedAt)
    if (isStaleRuntime(expectedRuntimeKey)) {
      failedIds.push(...batchIds)
      continue
    }

    if (result.outcome === "archived") {
      releaseBulkArchiveEchoes(expectedRuntimeKey, batchIds)
      registerBulkArchiveEchoes(
        expectedRuntimeKey,
        result.archived,
      )
      commitArchivedSessions(result.archived, directory)
      archivedIds.push(...result.archived.map((entry) => entry.id))
      failedIds.push(...result.failedIds)
      continue
    }

    // The runtime does not serve the batch route, or its answer could not be
    // trusted. Archiving each session individually is slower but reaches the
    // same state, and re-archiving a session the server already archived writes
    // the same field again.
    console.warn("[session-actions] archive batch unavailable, archiving one by one", result.reason)
    releaseBulkArchiveEchoes(expectedRuntimeKey, batchIds)
    plan.individualIds.push(...batchIds)
=======
  for (const [directory, batchIds] of plan.batchesByDirectory) {
    if (isStaleRuntime(expectedRuntimeKey)) {
      failedIds.push(...batchIds)
      continue
    }

    const archivedAt = Date.now()
    registerBulkArchiveEchoes(
      expectedRuntimeKey,
      batchIds.map((id) => ({ id, archivedAt })),
    )
    const result = await requestSessionArchiveBatch(directory, batchIds, archivedAt)
    if (isStaleRuntime(expectedRuntimeKey)) {
      failedIds.push(...batchIds)
      continue
    }

    if (result.outcome === "archived") {
      releaseBulkArchiveEchoes(expectedRuntimeKey, batchIds)
      registerBulkArchiveEchoes(
        expectedRuntimeKey,
        result.archived,
      )
      commitArchivedSessions(result.archived, directory)
      archivedIds.push(...result.archived.map((entry) => entry.id))
      failedIds.push(...result.failedIds)
      continue
    }

    console.warn("[session-actions] archive batch unavailable, archiving one by one", result.reason)
    releaseBulkArchiveEchoes(expectedRuntimeKey, batchIds)
    plan.individualIds.push(...batchIds)
>>>>>>> upstream/main
  }

  const archivedAt = Date.now()
  const result = await requestSessionArchiveBatch(directory, batchIds, archivedAt)
  if (isStaleRuntime(expectedRuntimeKey)) {
   failedIds.push(...batchIds)
   continue
  }

  if (result.outcome === "archived") {
   commitArchivedSessions(result.archived, directory)
   archivedIds.push(...result.archived.map((entry) => entry.id))
   failedIds.push(...result.failedIds)
   continue
  }

  // The runtime does not serve the batch route, or its answer could not be
  // trusted. Archiving each session individually is slower but reaches the
  // same state, and re-archiving a session the server already archived writes
  // the same field again.
  console.warn("[session-actions] archive batch unavailable, archiving one by one", result.reason)
  plan.individualIds.push(...batchIds)
 }

 for (const [index, id] of plan.individualIds.entries()) {
  if (isStaleRuntime(expectedRuntimeKey)) {
   failedIds.push(...plan.individualIds.slice(index))
   break
  }
  if (await archiveSession(id, expectedRuntimeKey)) archivedIds.push(id)
  else failedIds.push(id)
 }

 return { archivedIds, failedIds }
}

<<<<<<< HEAD
/**
 * A session whose archive also has to rewrite another session's metadata.
 *
 * Review sessions and btw forks point at a parent that must be unlinked, and a
 * parent with an active btw fork has to delete that fork. Those are
 * read-modify-write pairs on a second session, so they stay on the per-session
 * path instead of the server batch.
 */
function hasLinkedSessionCleanup(session: CanonicalSession): boolean {
 const links = session.metadata?.openchamber
 return links?.kind === "review"
||||||| bc50ba56aa
/**
 * A session whose archive also has to rewrite another session's metadata.
 *
 * Review sessions and btw forks point at a parent that must be unlinked, and a
 * parent with an active btw fork has to delete that fork. Those are
 * read-modify-write pairs on a second session, so they stay on the per-session
 * path instead of the server batch.
 */
function hasLinkedSessionCleanup(session: Session): boolean {
  return isReviewSession(session) || isBtwSession(session) || Boolean(getBtwSessionID(session))
=======
function hasLinkedSessionCleanup(session: Session): boolean {
  return isReviewSession(session) || isBtwSession(session) || Boolean(getBtwSessionID(session))
>>>>>>> upstream/main
}

function planArchiveBatches(ids: string[]) {
 const global = useGlobalSessionsStore.getState()
 const knownSessions = new Map<string, CanonicalSession>()
 for (const session of [...global.activeSessions, ...global.archivedSessions]) {
  knownSessions.set(session.sessionId, session)
 }
 for (const store of _childStores?.children.values() ?? []) {
  for (const session of store.getState().session) knownSessions.set(session.sessionId, session)
 }

 const batchesByDirectory = new Map<string, string[]>()
 const individualIds: string[] = []

 for (const id of ids) {
  const session = knownSessions.get(id)
  const directory = session
   ? resolveGlobalSessionDirectory(session) ?? getSessionDirectory(id)
   : undefined
  if (!session || !directory || hasLinkedSessionCleanup(session)) {
   individualIds.push(id)
   continue
  }
  const batch = batchesByDirectory.get(directory)
  if (batch) batch.push(id)
  else batchesByDirectory.set(directory, [id])
 }

 return { batchesByDirectory, individualIds }
}

function commitArchivedSessions(stamps: SessionArchiveStamp[], directory: string): void {
 if (stamps.length === 0) return

 const ids = stamps.map((stamp) => stamp.id)
 const archived = stamps.flatMap((stamp) => withArchivedAt(stamp.id, stamp.archivedAt) ?? [])
 const snapshots = removeSessionsFromLiveStores(ids, directory, true)
 removeGlobalSessionStatuses(ids)
 const directories = [...snapshots.map((snapshot) => snapshot.directory), directory]
 invalidateSessionLoadBatch(ids, directories, false)

 useGlobalSessionsStore.getState().upsertSessions(archived)

 const ui = useSessionUIStore.getState()
 if (ui.currentSessionId && ids.includes(ui.currentSessionId)) ui.setCurrentSession(null)
}

export async function unarchiveSession(sessionId: string, expectedRuntimeKey = getRuntimeKey()): Promise<boolean> {
 const { restoredIds } = await restoreSessionTree(sessionId, expectedRuntimeKey)
 return restoredIds.includes(sessionId)
}

<<<<<<< HEAD
/** Archived subsessions under a session, each parent before its children. */
function archivedSubsessionIds(rootId: string): string[] {
 const childrenByParentId = new Map<string, string[]>()
 for (const session of useGlobalSessionsStore.getState().archivedSessions) {
  if (!session.parentSessionId) continue
  const siblings = childrenByParentId.get(session.parentSessionId) ?? []
  siblings.push(session.sessionId)
  childrenByParentId.set(session.parentSessionId, siblings)
 }
 const ids: string[] = []
 const seen = new Set([rootId])
 const queue = [rootId]
 for (let index = 0; index < queue.length; index += 1) {
  for (const childId of childrenByParentId.get(queue[index]) ?? []) {
   if (seen.has(childId)) continue
   seen.add(childId)
   ids.push(childId)
   queue.push(childId)
||||||| bc50ba56aa
/** Archived subsessions under a session, each parent before its children. */
const archivedSubsessionIds = (rootId: string): string[] =>
  readGlobalSessionLineage().descendantsOf(rootId, "archived").map((session) => session.id)

async function restoreSessionTree(
  rootId: string,
  expectedRuntimeKey: string,
): Promise<{ restoredIds: string[]; failedIds: string[] }> {
  const { entityById } = useGlobalSessionsStore.getState()
  const root = entityById.get(rootId)
  if (root && !isRestorableOnItsOwn(root, entityById)) {
    recordSessionActionFailure(rootId, new Error("a subsession is restored with its parent"))
    return { restoredIds: [], failedIds: [rootId] }
=======
const archivedSubsessionIds = (rootId: string): string[] =>
  readGlobalSessionLineage().descendantsOf(rootId, "archived").map((session) => session.id)

async function restoreSessionTree(
  rootId: string,
  expectedRuntimeKey: string,
): Promise<{ restoredIds: string[]; failedIds: string[] }> {
  const { entityById } = useGlobalSessionsStore.getState()
  const root = entityById.get(rootId)
  if (root && !isRestorableOnItsOwn(root, entityById)) {
    recordSessionActionFailure(rootId, new Error("a subsession is restored with its parent"))
    return { restoredIds: [], failedIds: [rootId] }
>>>>>>> upstream/main
  }
<<<<<<< HEAD
 }
 return ids
||||||| bc50ba56aa
  // Read before the root changes state: the walk follows the archived records.
  const subsessionIds = archivedSubsessionIds(rootId)
  if (!await restoreArchivedSession(rootId, expectedRuntimeKey)) return { restoredIds: [], failedIds: [rootId] }
  const restoredIds = [rootId]
  const failedIds: string[] = []
  for (const id of subsessionIds) {
    if (await restoreArchivedSession(id, expectedRuntimeKey)) restoredIds.push(id)
    else failedIds.push(id)
  }
  return { restoredIds, failedIds }
=======
  const subsessionIds = archivedSubsessionIds(rootId)
  if (!await restoreArchivedSession(rootId, expectedRuntimeKey)) return { restoredIds: [], failedIds: [rootId] }
  const restoredIds = [rootId]
  const failedIds: string[] = []
  for (const id of subsessionIds) {
    if (await restoreArchivedSession(id, expectedRuntimeKey)) restoredIds.push(id)
    else failedIds.push(id)
  }
  return { restoredIds, failedIds }
>>>>>>> upstream/main
}

async function restoreSessionTree(
 rootId: string,
 expectedRuntimeKey: string,
): Promise<{ restoredIds: string[]; failedIds: string[] }> {
 const { entityById } = useGlobalSessionsStore.getState()
 const root = entityById.get(rootId)
 if (root && !isRestorableOnItsOwn(root, entityById)) {
  recordSessionActionFailure(rootId, new Error("a subsession is restored with its parent"))
  return { restoredIds: [], failedIds: [rootId] }
 }
 // Read before the root changes state: the walk follows the archived records.
 const subsessionIds = archivedSubsessionIds(rootId)
 if (!await restoreArchivedSession(rootId, expectedRuntimeKey)) return { restoredIds: [], failedIds: [rootId] }
 const restoredIds = [rootId]
 const failedIds: string[] = []
 for (const id of subsessionIds) {
  if (await restoreArchivedSession(id, expectedRuntimeKey)) restoredIds.push(id)
  else failedIds.push(id)
 }
 return { restoredIds, failedIds }
}

async function restoreArchivedSession(sessionId: string, expectedRuntimeKey: string): Promise<boolean> {
 if (isStaleRuntime(expectedRuntimeKey)) return false
 const sessionDirectory = getSessionDirectory(sessionId)
 try {
  const result = await requestSessionUnarchiveBatch([sessionId], sessionDirectory)
  if (isStaleRuntime(expectedRuntimeKey)) return false
<<<<<<< HEAD
  if (result.outcome !== "restored") {
   throw new Error(`unarchive failed: ${result.reason}`)
||||||| bc50ba56aa
  const sessionDirectory = getSessionDirectory(sessionId)
  try {
    const result = await requestSessionUnarchiveBatch([sessionId], sessionDirectory)
    if (isStaleRuntime(expectedRuntimeKey)) return false
    if (result.outcome !== "restored") {
      throw new Error(`unarchive failed: ${result.reason}`)
    }
    if (!result.restored.includes(sessionId)) {
      throw new Error("unarchive failed: server did not return the restored session")
    }
    const restored = withArchivedAt(sessionId, null)
    if (restored) useGlobalSessionsStore.getState().upsertSession(restored)
    // Archiving put away whatever the session last did, so a restored session
    // does not come back unread.
    markSessionUnreadSeen(sessionId)
    if (sessionDirectory) registerSessionDirectory(sessionId, sessionDirectory)
    promoteRestoredSessionOrdering(sessionId)
    // Archive discarded this session's status. An older directory snapshot
    // cannot certify it idle after restore; only a fresh live read can.
    const store = sessionDirectory ? _childStores?.getChild(sessionDirectory) : undefined
    if (store) {
      const before = store.getState()
      // The restore already committed. A rejected status read is unknown, not
      // an action failure or a reason to mark this session idle.
      const statuses = await opencodeClient.getActiveSessionStatuses(sessionDirectory).catch(() => null)
      if (!isStaleRuntime(expectedRuntimeKey) && statuses !== null) {
        store.setState((current) => {
          if (current.sessionStatusInvalidated !== before.sessionStatusInvalidated
            || current.session_status[sessionId] !== before.session_status[sessionId]) return current
          const invalidated = { ...current.sessionStatusInvalidated }
          delete invalidated[sessionId]
          return {
            session_status: { ...current.session_status, [sessionId]: statuses[sessionId] ?? { type: "idle" } },
            sessionStatusInvalidated: invalidated,
          }
        })
      }
    }
    // Its worktree may have been removed while it sat in the archive; such a
    // session moves to its project root so it can be written to again. Loaded
    // lazily: the relocation module builds on this one.
    if (relocate && !isStaleRuntime(expectedRuntimeKey)) {
      void import("@/lib/worktrees/relocateRestoredSession")
        .then((module) => module.relocateRestoredSessionWithNotice(sessionId))
        .catch((error: unknown) => console.warn("[session-actions] restored session relocation failed", error))
    }
    return true
  } catch (error) {
    console.error("[session-actions] unarchiveSession failed", error)
    recordSessionActionFailure(sessionId, toError(error))
    return false
=======
  const sessionDirectory = getSessionDirectory(sessionId)
  try {
    const result = await requestSessionUnarchiveBatch([sessionId], sessionDirectory)
    if (isStaleRuntime(expectedRuntimeKey)) return false
    if (result.outcome !== "restored") {
      throw new Error(`unarchive failed: ${result.reason}`)
    }
    if (!result.restored.includes(sessionId)) {
      throw new Error("unarchive failed: server did not return the restored session")
    }
    const restored = withArchivedAt(sessionId, null)
    if (restored) useGlobalSessionsStore.getState().upsertSession(restored)
    markSessionUnreadSeen(sessionId)
    if (sessionDirectory) registerSessionDirectory(sessionId, sessionDirectory)
    promoteRestoredSessionOrdering(sessionId)
    const store = sessionDirectory ? _childStores?.getChild(sessionDirectory) : undefined
    if (store) {
      const before = store.getState()
      const statuses = await opencodeClient.getActiveSessionStatuses(sessionDirectory).catch(() => null)
      if (!isStaleRuntime(expectedRuntimeKey) && statuses !== null) {
        store.setState((current) => {
          if (current.sessionStatusInvalidated !== before.sessionStatusInvalidated
            || current.session_status[sessionId] !== before.session_status[sessionId]) return current
          const invalidated = { ...current.sessionStatusInvalidated }
          delete invalidated[sessionId]
          return {
            session_status: { ...current.session_status, [sessionId]: statuses[sessionId] ?? { type: "idle" } },
            sessionStatusInvalidated: invalidated,
          }
        })
      }
    }
    if (relocate && !isStaleRuntime(expectedRuntimeKey)) {
      void import("@/lib/worktrees/relocateRestoredSession")
        .then((module) => module.relocateRestoredSessionWithNotice(sessionId))
        .catch((error: unknown) => console.warn("[session-actions] restored session relocation failed", error))
    }
    return true
  } catch (error) {
    console.error("[session-actions] unarchiveSession failed", error)
    recordSessionActionFailure(sessionId, toError(error))
    return false
>>>>>>> upstream/main
  }
  if (!result.restored.includes(sessionId)) {
   throw new Error("unarchive failed: server did not return the restored session")
  }
  const restored = withArchivedAt(sessionId, null)
  if (restored) useGlobalSessionsStore.getState().upsertSession(restored)
  markSessionUnreadSeen(sessionId)
  if (sessionDirectory) registerSessionDirectory(sessionId, sessionDirectory)
  promoteRestoredSessionOrdering(sessionId)
  // Archive discarded this session's status. An older directory snapshot
  // cannot certify it idle after restore; only a fresh live read can.
  const store = sessionDirectory ? _childStores?.getChild(sessionDirectory) : undefined
  if (store) {
   const before = store.getState()
   // The restore already committed. A rejected status read is unknown, not
   // an action failure or a reason to mark this session idle.
   const snapshot = await canonicalClient.getSnapshot(sessionId).catch(() => null)
   if (!isStaleRuntime(expectedRuntimeKey) && snapshot !== null) {
    store.setState((current) => {
     if (current.sessionStatusInvalidated !== before.sessionStatusInvalidated
      || current.session_status[sessionId] !== before.session_status[sessionId]) return current
     const invalidated = { ...(current.sessionStatusInvalidated ?? {}) }
     delete invalidated[sessionId]
     return { ...installSessionSnapshot(current, snapshot), sessionStatusInvalidated: invalidated }
    })
   }
  }
  // Its worktree may have been removed while it sat in the archive; such a
  // session moves to its project root so it can be written to again. Loaded
  // lazily: the relocation module builds on this one.
  if (!isStaleRuntime(expectedRuntimeKey)) {
   void import("@/lib/worktrees/relocateRestoredSession")
    .then((module) => {
     if (!isStaleRuntime(expectedRuntimeKey)) return module.relocateRestoredSessionWithNotice(sessionId)
    })
    .catch((error: unknown) => console.warn("[session-actions] restored session relocation failed", error))
  }
  return true
 } catch (error) {
  if (isStaleRuntime(expectedRuntimeKey)) return false
  console.error("[session-actions] unarchiveSession failed", error)
  recordSessionActionFailure(sessionId, toError(error))
  return false
 }
}

export type UnarchiveSessionsOptions = {
<<<<<<< HEAD
 /**
  * Runtime key captured when the batch was confirmed. When supplied, the batch
  * stops as soon as the active runtime differs.
  */
 expectedRuntimeKey?: string
 /**
  * Undo of an archive that just happened: put back exactly the sessions it
  * moved, subsessions included. Without it a subsession is restored on its
  * own only while its parent is active (`isRestorableOnItsOwn`).
  */
 undo?: boolean
||||||| bc50ba56aa
  /**
   * Runtime key captured when the batch was confirmed. When supplied, the batch
   * stops as soon as the active runtime differs.
   */
  expectedRuntimeKey?: string
  /**
   * Undo of an archive that just happened: put back exactly the sessions it
   * moved, subsessions included, where they were, even when their folder is
   * gone. Without it a subsession is restored on its own only while its parent
   * is active (`isRestorableOnItsOwn`), and a session whose folder is gone
   * moves to its project.
   */
  undo?: boolean
=======
  expectedRuntimeKey?: string
  undo?: boolean
>>>>>>> upstream/main
}

export async function unarchiveSessions(
 ids: string[],
 options?: UnarchiveSessionsOptions,
): Promise<{ restoredIds: string[]; failedIds: string[] }> {
<<<<<<< HEAD
 const restoredIds: string[] = []
 const failedIds: string[] = []
 const expectedRuntimeKey = options?.expectedRuntimeKey ?? getRuntimeKey()
 const settled = new Set<string>()
 // Parents first, so a subsession listed next to its parent comes back with
 // it instead of being refused on its own.
 const entityById = useGlobalSessionsStore.getState().entityById
 const ordered = options?.undo
  ? ids
  : [...ids.filter((id) => !entityById.get(id)?.parentSessionId), ...ids.filter((id) => entityById.get(id)?.parentSessionId)]
||||||| bc50ba56aa
  const restoredIds: string[] = []
  const failedIds: string[] = []
  const expectedRuntimeKey = options?.expectedRuntimeKey ?? getRuntimeKey()
  const settled = new Set<string>()
  // Parents first, so a subsession listed next to its parent comes back with
  // it instead of being refused on its own.
  const entityById = useGlobalSessionsStore.getState().entityById
  const ordered = options?.undo
    ? ids
    : [...ids.filter((id) => !entityById.get(id)?.parentID), ...ids.filter((id) => entityById.get(id)?.parentID)]
=======
  const restoredIds: string[] = []
  const failedIds: string[] = []
  const expectedRuntimeKey = options?.expectedRuntimeKey ?? getRuntimeKey()
  const settled = new Set<string>()
  const entityById = useGlobalSessionsStore.getState().entityById
  const ordered = options?.undo
    ? ids
    : [...ids.filter((id) => !entityById.get(id)?.parentID), ...ids.filter((id) => entityById.get(id)?.parentID)]
>>>>>>> upstream/main

<<<<<<< HEAD
 for (const [index, id] of ordered.entries()) {
  if (isStaleRuntime(expectedRuntimeKey)) {
   failedIds.push(...ordered.slice(index).filter((pending) => !settled.has(pending)))
   break
||||||| bc50ba56aa
  for (const [index, id] of ordered.entries()) {
    if (isStaleRuntime(expectedRuntimeKey)) {
      failedIds.push(...ordered.slice(index).filter((pending) => !settled.has(pending)))
      break
    }
    if (settled.has(id)) continue
    if (options?.undo) {
      if (await restoreArchivedSession(id, expectedRuntimeKey, { relocate: false })) restoredIds.push(id)
      else failedIds.push(id)
      settled.add(id)
      continue
    }
    // A parent listed in the batch brings its subsessions back with it.
    const outcome = await restoreSessionTree(id, expectedRuntimeKey)
    for (const restored of outcome.restoredIds) settled.add(restored)
    for (const failed of outcome.failedIds) settled.add(failed)
    restoredIds.push(...outcome.restoredIds)
    failedIds.push(...outcome.failedIds)
=======
  for (const [index, id] of ordered.entries()) {
    if (isStaleRuntime(expectedRuntimeKey)) {
      failedIds.push(...ordered.slice(index).filter((pending) => !settled.has(pending)))
      break
    }
    if (settled.has(id)) continue
    if (options?.undo) {
      if (await restoreArchivedSession(id, expectedRuntimeKey, { relocate: false })) restoredIds.push(id)
      else failedIds.push(id)
      settled.add(id)
      continue
    }
    const outcome = await restoreSessionTree(id, expectedRuntimeKey)
    for (const restored of outcome.restoredIds) settled.add(restored)
    for (const failed of outcome.failedIds) settled.add(failed)
    restoredIds.push(...outcome.restoredIds)
    failedIds.push(...outcome.failedIds)
>>>>>>> upstream/main
  }
  if (settled.has(id)) continue
  if (options?.undo) {
   if (await restoreArchivedSession(id, expectedRuntimeKey)) restoredIds.push(id)
   else failedIds.push(id)
   settled.add(id)
   continue
  }
  // A parent listed in the batch brings its subsessions back with it.
  const outcome = await restoreSessionTree(id, expectedRuntimeKey)
  for (const restored of outcome.restoredIds) settled.add(restored)
  for (const failed of outcome.failedIds) settled.add(failed)
  restoredIds.push(...outcome.restoredIds)
  failedIds.push(...outcome.failedIds)
 }

 return { restoredIds, failedIds }
}

export async function updateSessionTitle(
 sessionId: string,
 title: string,
 options?: { directory?: string | null; expectedRuntimeKey?: string; signal?: AbortSignal },
): Promise<void> {
<<<<<<< HEAD
 const runtimeKey = options?.expectedRuntimeKey ?? getRuntimeKey()
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 options?.signal?.throwIfAborted()
 if (!options?.signal) cancelSessionTitleGeneration(sessionId)
 const current = getGlobalSessionSnapshot(sessionId) ?? await readCanonicalSession(sessionId, runtimeKey)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 options?.signal?.throwIfAborted()
 const result = await canonicalClient.renameSession(sessionId, current.workspaceId, title)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 options?.signal?.throwIfAborted()
 if (result.sessionId !== sessionId || !result.title) throw new Error("Title response identified another session")
 publishCanonicalSession(result, options?.directory ?? undefined)
||||||| bc50ba56aa
  if (isStaleRuntime(options?.expectedRuntimeKey)) throw new Error("runtime changed")
  if (options?.signal) options.signal.throwIfAborted()
  else cancelSessionTitleGeneration(sessionId)
  const sessionDirectory = options?.directory ?? getSessionDirectory(sessionId)
  await opencodeClient.renameSession(sessionId, title, sessionDirectory)
  // `session.update` answers with nothing, so the record published to the
  // stores is re-read rather than assembled from the local copy plus a hope.
  const session = await opencodeClient.getSession(sessionId, sessionDirectory)
  if (isStaleRuntime(options?.expectedRuntimeKey)) throw new Error("runtime changed")
  options?.signal?.throwIfAborted()
  useGlobalSessionsStore.getState().upsertSession(session)
  mirrorSessionIntoLiveStores(session, sessionDirectory)
  // A name the user gave is theirs: the agent's `work.name` keeps it. The
  // rename itself has succeeded, so a failed note only lets the agent rename
  // it later, which is no reason to report the rename as failed.
  if (options?.byUser) {
    await patchSessionMetadata(sessionId, sessionDirectory, (metadata) => withUserWorkTitle(metadata, title), options.expectedRuntimeKey)
      .catch(() => undefined)
  }
=======
  if (isStaleRuntime(options?.expectedRuntimeKey)) throw new Error("runtime changed")
  if (options?.signal) options.signal.throwIfAborted()
  else cancelSessionTitleGeneration(sessionId)
  const sessionDirectory = options?.directory ?? getSessionDirectory(sessionId)
  await opencodeClient.renameSession(sessionId, title, sessionDirectory)
  const session = await opencodeClient.getSession(sessionId, sessionDirectory)
  if (isStaleRuntime(options?.expectedRuntimeKey)) throw new Error("runtime changed")
  options?.signal?.throwIfAborted()
  useGlobalSessionsStore.getState().upsertSession(session)
  mirrorSessionIntoLiveStores(session, sessionDirectory)
  if (options?.byUser) {
    await patchSessionMetadata(sessionId, sessionDirectory, (metadata) => withUserWorkTitle(metadata, title), options.expectedRuntimeKey)
      .catch(() => undefined)
  }
>>>>>>> upstream/main
}

<<<<<<< HEAD
// ---------------------------------------------------------------------------
// Retained review-flow send boundary — Task 16 owns its transport cutover.
// ---------------------------------------------------------------------------
||||||| bc50ba56aa
// ---------------------------------------------------------------------------
// Optimistic message send — insert user message before API call, rollback on error
// ---------------------------------------------------------------------------
=======
>>>>>>> upstream/main

<<<<<<< HEAD
const isUserMessageWithText = (message: CanonicalMessage, content: string): boolean => (
 message.role === "user" && message.parts.some((part) => part.type === "text" && part.content === content)
)

/**
 * Forget an accepted send's pending record once the native transcript owns that
 * message. Native message IDs are allocated by the Agent Service, so the
 * canonical record arrives with a different ID. The accepted run identifies
 * this send's turn, and the turn names the canonical user message; without a
 * run (a caller that does not return one), only a user message that was absent
 * from the pre-send transcript and repeats this content can be its counterpart.
 * In both cases the pending record is removed only after the canonical message
 * is visible, so the two cannot both render.
 */
function reconcileAcceptedSend(input: {
 runtimeKey: string
 sessionId: string
 directory?: string | null
 pendingMessage: CanonicalMessage
 content: string
 runId: string | null
 knownMessageIds: ReadonlySet<string>
}): void {
 const store = input.directory ? _childStores?.getChild(input.directory) : undefined
 if (!store) return
 const messageId = input.pendingMessage.messageId
 const removePending = () => _optimisticRemove?.({ sessionId: input.sessionId, directory: input.directory, messageId })
 // A snapshot can promote an ID the server echoed by replacing the shadow
 // object with the authoritative record. That record is not ours to delete.
 const isPromoted = (messages: readonly CanonicalMessage[] | undefined) => {
  const visible = messages?.find((message) => message.messageId === messageId)
  return Boolean(visible && visible !== input.pendingMessage)
 }
 const confirmPromoted = () => _optimisticConfirm?.({ sessionId: input.sessionId, directory: input.directory, messageId })
 const hasCanonicalCounterpart = (state: State): boolean => {
  const messages = state.message[input.sessionId]
  if (!messages) return false
  if (input.runId) {
   const canonicalId = state.snapshot[input.sessionId]?.turns
    .find((turn) => turn.runId === input.runId)?.userMessageId
   return Boolean(canonicalId && messages.some((message) => message.messageId === canonicalId))
  }
  return messages.some((message) => (
   message.messageId !== messageId
   && !input.knownMessageIds.has(message.messageId)
   && isUserMessageWithText(message, input.content)
  ))
 }
 const messagesAtRead = store.getState().message[input.sessionId]
 if (isPromoted(messagesAtRead)) {
  confirmPromoted()
  return
 }
 if (hasCanonicalCounterpart(store.getState())) {
  removePending()
  return
 }
 let unsubscribe = () => { }
 unsubscribe = store.subscribe((state) => {
  const messages = state.message[input.sessionId]
  if (isStaleRuntime(input.runtimeKey)) {
   unsubscribe()
   return
  }
  if (isPromoted(messages)) {
   unsubscribe()
   confirmPromoted()
   return
  }
  // The loader may discard the pending record (invalidation, eviction, or a
  // runtime switch) before a canonical echo appears. Stop waiting then.
  if (!messages?.some((message) => message.messageId === messageId)) {
   unsubscribe()
   return
  }
  if (!hasCanonicalCounterpart(state)) return
  unsubscribe()
  removePending()
 })
||||||| bc50ba56aa
/**
 * Sets the session's status in its directory store ahead of the server:
 * busy when the agent's turn has started or is about to, idle when a send
 * that announced it never reached the server.
 */
export function markSessionStatus(sessionId: string, directory: string | null | undefined, type: "busy" | "idle"): void {
  const store = directory ? dirStoreForDirectory(directory) : dirStore()
  const current = store.getState()
  store.setState({
    session_status: {
      ...current.session_status,
      [sessionId]: { type },
    },
  })
=======
export function markSessionStatus(sessionId: string, directory: string | null | undefined, type: "busy" | "idle"): void {
  const store = directory ? dirStoreForDirectory(directory) : dirStore()
  const current = store.getState()
  store.setState({
    session_status: {
      ...current.session_status,
      [sessionId]: { type },
    },
  })
>>>>>>> upstream/main
}

<<<<<<< HEAD
/**
 * Send a review-flow prompt with optimistic continuity.
 *
 * A client-generated pending user message is inserted into the visible store
 * and the loader's optimistic shadow before transport, so the review send is
 * visible while the Host accepts it. The callback's correlation ID is not a
 * native message identity: the Agent Service allocates message, turn, and part
 * IDs. A definite failure removes only that unconfirmed record and records the
 * failure for diagnostics. An accepted send reconciles the pending record with
 * the server-authored user message named by the accepted run's canonical turn
 * (falling back to a new matching user message for callers that return no run),
 * from an authoritative snapshot/history read or the live transcript, without
 * duplicating it. A rejected read cannot turn an accepted send into a failure.
 */
||||||| bc50ba56aa
/**
 * Wraps an async send operation with optimistic user-message insertion.
 * Uses useSync()'s optimistic infrastructure — message + parts are inserted
 * into the store AND registered in the shadow Map. mergeOptimisticPage
 * handles deduplication when the server echoes back the real message.
 */
=======
>>>>>>> upstream/main
export async function optimisticSend(input: {
<<<<<<< HEAD
 runtimeKey?: string
 runtimeRevision?: number
 sessionId: string
 content: string
 directory?: string | null
 files?: Array<{ type: "file"; mime: string; url: string; filename: string }>
 context?: SyntheticContextInput[]
 leadingContext?: Promise<SyntheticContextInput | null>
 appendSubmissions?: () => void
 onOptimisticInsert?: () => void
 onMessageID?: (messageID: string) => void
 beforeOptimisticInsert?: () => void
 send: (messageID: string, context: SyntheticContextInput[]) => Promise<Run | null>
||||||| bc50ba56aa
  runtimeKey?: string
  sessionId: string
  content: string
  directory?: string | null
  files?: Array<{ type: "file"; mime: string; url: string; filename: string }>
  /** Context admitted ahead of the prompt; shown in the optimistic message until the server echoes it. */
  context?: SyntheticContextInput[]
  /**
   * Work the request waits for: the session being created, its project
   * knowledge being written into it. The user message is inserted without
   * waiting for it. A rejection is a definite failure of the send and rolls
   * the message back.
   */
  ready?: Promise<void>
  appendSubmissions?: () => void
  onOptimisticInsert?: () => void
  /**
   * Whether the insert marks the session busy (the default). A session that
   * does not exist yet is marked by its creator once the server has it.
   */
  markBusy?: boolean
  /**
   * The actual API call. Receives the optimistic message id and the context
   * with its optimistic ids, so the server's records reconcile in place, and,
   * while a revert is staged, the commit to run before any context is admitted.
   */
  send: (messageID: string, context: SyntheticContextInput[], commitRevert?: () => Promise<void>) => Promise<void>
=======
  runtimeKey?: string
  sessionId: string
  content: string
  directory?: string | null
  files?: Array<{ type: "file"; mime: string; url: string; filename: string }>
  context?: SyntheticContextInput[]
  ready?: Promise<void>
  appendSubmissions?: () => void
  onOptimisticInsert?: (messageID: string) => void
  markBusy?: boolean
  send: (messageID: string, context: SyntheticContextInput[], commitRevert?: () => Promise<void>) => Promise<void>
>>>>>>> upstream/main
}): Promise<void> {
 if (!_optimisticAdd || !_optimisticRemove) {
  throw new Error("Optimistic refs not set — is useSync() mounted?")
 }
 const runtimeKey = input.runtimeKey ?? getRuntimeKey()
 const runtimeRevision = input.runtimeRevision ?? getRuntimeSwitchRevision()
 const assertRuntimeUnchanged = () => {
  if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw new Error("Message was not sent because the runtime changed.")
 }
 assertRuntimeUnchanged()
 await waitForConnectionOrThrow()
 assertRuntimeUnchanged()
 const directory = input.directory ?? getSessionDirectory(input.sessionId)
 const context = (input.context ?? []).filter((item) => item.text.trim())
 const leading = await input.leadingContext
 assertRuntimeUnchanged()
 if (leading?.text.trim()) context.unshift(leading)
 // The callback's ID correlates the legacy transport and the returned send
 // identity. It is never installed as a native message ID.
 const correlationId = `msg_${globalThis.crypto.randomUUID()}`
 const pendingMessage: CanonicalMessage = {
  messageId: correlationId,
  sessionId: input.sessionId,
  turnId: `turn_${globalThis.crypto.randomUUID()}`,
  role: "user",
  createdAt: Date.now(),
  parts: [{ type: "text", partId: `part_${globalThis.crypto.randomUUID()}`, content: input.content }],
 }
 const knownMessageIds = new Set(
  (directory ? _childStores?.getChild(directory)?.getState().message[input.sessionId] : undefined)
   ?.map((message) => message.messageId) ?? [],
 )
 input.onMessageID?.(correlationId)
 input.appendSubmissions?.()
 input.beforeOptimisticInsert?.()
 _optimisticAdd({ sessionId: input.sessionId, directory, message: pendingMessage })
 input.onOptimisticInsert?.()
 let acceptedRun: Run | null = null
 try {
  assertRuntimeUnchanged()
  acceptedRun = await input.send(correlationId, context)
 } catch (error) {
  // A definite failure removes only the unconfirmed record. Once an echo
  // has promoted this ID, optimisticRemove refuses to delete it.
  if (!isStaleRuntime(runtimeKey) && runtimeRevision === getRuntimeSwitchRevision()) {
   _optimisticRemove({ sessionId: input.sessionId, directory, messageId: correlationId })
   recordSendFailure({
    sessionId: input.sessionId, messageId: correlationId, directory: directory ?? null,
    status: getErrorStatus(error), ambiguous: isAmbiguousSendFailure(error), confirmationChecked: false,
    reason: error instanceof Error ? error.message : String(error),
   })
  }
  throw error
 }
 assertRuntimeUnchanged()
 // Delivery already succeeded. A failed read cannot turn that acceptance
 // into a send failure (which would invite an unsafe duplicate submission).
 try {
  await refetchSessionMessages(input.sessionId)
  assertRuntimeUnchanged()
<<<<<<< HEAD
 } catch (error) {
  if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw error
  console.warn("[session-actions] accepted review send history refresh failed", error)
 }
 reconcileAcceptedSend({
  runtimeKey, sessionId: input.sessionId, directory, pendingMessage, content: input.content,
  runId: acceptedRun?.runId ?? null, knownMessageIds,
 })
||||||| bc50ba56aa
  input.appendSubmissions?.()

  const targetDirectory = input.directory ?? dir()
  const store = targetDirectory ? dirStoreForDirectory(targetDirectory) : dirStore()
  const stateBeforeSend = store.getState()
  const sessionBeforeSend = stateBeforeSend.session.find((session) => session.id === input.sessionId)
  const revertMessageID = sessionBeforeSend?.revert?.messageID
  const messagesBeforeSend = stateBeforeSend.message[input.sessionId] ?? []
  const revertedMessages = messagesFrom(messagesBeforeSend, revertMessageID)
  const revertedParts = new Map(
    revertedMessages.map((message) => [message.id, stateBeforeSend.part[message.id] ?? []] as const),
  )

  if (revertMessageID) {
    const session = stateBeforeSend.session.map((candidate) => (
      candidate.id === input.sessionId ? { ...candidate, revert: undefined } as Session : candidate
    ))
    const message = {
      ...stateBeforeSend.message,
      [input.sessionId]: messagesBefore(messagesBeforeSend, revertMessageID),
    }
    const part = { ...stateBeforeSend.part }
    for (const revertedMessage of revertedMessages) delete part[revertedMessage.id]
    store.setState({ session, message, part })

    // A server-backed user message can still remain in the loader's optimistic
    // shadow until a page fetch confirms it. Forget the reverted branch there
    // too, or the next tail refresh will merge those deleted messages back in.
    for (const revertedMessage of revertedMessages) {
      _optimisticConfirm?.({
        sessionID: input.sessionId,
        directory: targetDirectory,
        messageID: revertedMessage.id,
      })
    }
  }

  // Context ids come first so they sort before the prompt the way the server
  // admits them. The client skips blank items, so they get no record here.
  const context = (input.context ?? [])
    .filter((item) => item.text.trim())
    .map((item) => ({ ...item, id: ascendingId("msg") }))
  const messageID = ascendingId("msg")
  const optimisticIDs = [...context.map((item) => item.id), messageID]

  // Part ids follow `partIds`, the same derivation the projection uses for the
  // server's echo of this message. Identical ids let the echo reconcile in
  // place instead of rendering the prompt twice.
  const optimisticParts: Part[] = [
    { id: partIds.userText(messageID), sessionID: input.sessionId, messageID, type: "text", text: input.content },
  ]
  if (input.files) {
    input.files.forEach((file, index) => {
      optimisticParts.push({
        id: partIds.userFile(messageID, index),
        sessionID: input.sessionId,
        messageID,
        type: "file",
        mime: file.mime,
        url: file.url,
        filename: file.filename,
      })
    })
  }

  // A user message carries no model or agent in the v2 domain model: the turn's
  // provider and agent belong to the assistant message the server produces.
  const created = Date.now()
  const optimisticMessage: UserMessage = {
    id: messageID,
    role: "user",
    sessionID: input.sessionId,
    // A user message never completes a turn; only assistant messages carry
    // `time.completed`, and readers treat its presence as "turn finished".
    time: { created },
  }

  // Insert into store + register in shadow Map (for mergeOptimisticPage cleanup).
  // The context records carry the prompt's timestamp, so the timeline folds
  // them onto the prompt from the first frame.
  const addSyntheticContext = (item: SyntheticContextInput & { id: string }) => {
    const synthetic: SyntheticMessage = compact({
      id: item.id,
      role: "synthetic",
      sessionID: input.sessionId,
      time: { created },
      text: item.text,
      description: item.description,
      metadata: item.metadata ? toJsonRecord(item.metadata) : undefined,
    })
    optimisticAdd({ sessionID: input.sessionId, directory: targetDirectory, message: synthetic, parts: [] })
  }
  for (const item of context) addSyntheticContext(item)
  optimisticAdd({
    sessionID: input.sessionId,
    directory: targetDirectory,
    message: optimisticMessage,
    parts: optimisticParts,
  })
  input.onOptimisticInsert?.()

  if (input.markBusy !== false) markSessionStatus(input.sessionId, targetDirectory, "busy")

  // Whether the commit of the staged revert left, and whether the server
  // answered it. A failed send puts the revert back only while the server
  // still has it staged.
  let revertCommitSent = false
  let revertCommitted = false
  const commitRevert = revertMessageID
    ? async () => {
        revertCommitSent = true
        await opencodeClient.commitRevert(input.sessionId, targetDirectory)
        revertCommitted = true
      }
    : undefined

  const releasePrompt = trackPromptInFlight(input.sessionId)
  // Only a request that left can have been accepted; a failure before it is certain.
  let requestSent = false
  try {
    await input.ready
    assertRuntimeUnchanged()
    requestSent = true
    await input.send(messageID, context, commitRevert)
  } catch (error) {
    const status = getErrorStatus(error)
    const ambiguousFailure = requestSent && isAmbiguousSendFailure(error)
    const acceptedRecords = ambiguousFailure
      ? await fetchRecentSendConfirmationRecords(input.sessionId, messageID, targetDirectory)
      : null

    if (acceptedRecords) {
      materializeConfirmedSendRecords(store, input.sessionId, optimisticIDs, acceptedRecords)
      for (const optimisticID of optimisticIDs) {
        optimisticConfirm?.({
          sessionID: input.sessionId,
          directory: targetDirectory,
          messageID: optimisticID,
        })
      }
      return
    }

    // The rollback below makes the user's message disappear with no other
    // trace, and the composer intentionally stays silent for transport-level
    // failures. Record the failure so the About dialog's diagnostics report can
    // answer "it disappeared and nothing happened" with an actual cause.
    // `reason` is truncated by the recorder: a rejected send echoes the
    // provider/OpenCode response body, which this log has no reason to keep.
    const failureRecord = {
      sessionId: input.sessionId,
      messageId: messageID,
      directory: targetDirectory ?? null,
      status,
      ambiguous: ambiguousFailure,
      confirmationChecked: ambiguousFailure,
      reason: error instanceof Error ? error.message : String(error),
    }
    recordSendFailure(failureRecord)
    console.warn("[session-actions] prompt send rejected; rolling back optimistic message", failureRecord)

    let revertStaged = !revertCommitted
    // A commit whose response was lost may have landed all the same; the
    // session record, read once the connection is back, says which.
    if (revertCommitSent && !revertCommitted && ambiguousFailure) {
      revertStaged = await opencodeClient.getSession(input.sessionId, targetDirectory).then((record) => !!record.revert, () => true)
    }

    // Rollback via optimistic infrastructure. Context the server admitted
    // before the failure comes back with the next history read. The records
    // are where the session lives now: a session created from a draft can
    // have moved to another directory than the one its message was shown in.
    const rollbackDirectory = getSessionDirectory(input.sessionId) ?? targetDirectory
    const rollbackStore = rollbackDirectory && rollbackDirectory !== targetDirectory ? dirStoreForDirectory(rollbackDirectory) : store
    for (const optimisticID of optimisticIDs) {
      optimisticRemove({
        sessionID: input.sessionId,
        directory: rollbackDirectory,
        messageID: optimisticID,
      })
    }
    const rollbackState = rollbackStore.getState()
    let session = rollbackState.session
    let message = rollbackState.message
    let part = rollbackState.part

    if (revertMessageID && revertStaged) {
      session = rollbackState.session.map((candidate) => (
        candidate.id === input.sessionId ? { ...candidate, revert: sessionBeforeSend?.revert } as Session : candidate
      ))
      message = {
        ...rollbackState.message,
        [input.sessionId]: mergeMessages(rollbackState.message[input.sessionId] ?? [], revertedMessages),
      }
      part = { ...rollbackState.part }
      for (const [revertedMessageID, parts] of revertedParts) {
        part[revertedMessageID] = parts
      }
    }

    rollbackStore.setState({
      session,
      message,
      part,
      session_status: {
        ...rollbackState.session_status,
        [input.sessionId]: { type: "idle" as const },
      },
    })
    throw error
  } finally {
    releasePrompt()
  }
}

async function fetchRecentSendConfirmationRecords(
  sessionId: string,
  messageID: string,
  directory?: string | null,
): Promise<Array<{ info: Message; parts: Part[] }> | null> {
  // Bounded: a connection that never returns must still let the send fail
  // rather than hang the composer.
  const reconnectDeadline = Date.now() + SEND_CONFIRMATION_RECONNECT_TIMEOUT_MS
  while (!useConfigStore.getState().isConnected && Date.now() < reconnectDeadline) {
    await wait(SEND_CONFIRMATION_RECONNECT_POLL_MS)
  }

  for (let attempt = 0; attempt < SEND_CONFIRMATION_REFETCH_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await wait(SEND_CONFIRMATION_REFETCH_BASE_RETRY_MS * 2 ** (attempt - 1))
    try {
      const page = await opencodeClient.getSessionMessages(
        sessionId,
        { limit: SEND_CONFIRMATION_REFETCH_LIMIT },
        directory,
      )
      const records = page.items.filter((record) => !!record.info?.id)
      if (records.some((record) => record.info.id === messageID)) {
        return records
      }
    } catch {
      // Confirmation is best-effort; if it fails, keep the original send error path.
    }
  }
  return null
}

function materializeConfirmedSendRecords(
  store: DirectoryStoreApi,
  sessionId: string,
  optimisticIDs: readonly string[],
  records: Array<{ info: Message; parts: Part[] }>,
): void {
  const optimistic = new Set(optimisticIDs)
  store.setState((state) => {
    const currentMessages = state.message[sessionId]
    const message = { ...state.message }
    const part = { ...state.part }
    if (currentMessages) {
      const nextMessages = currentMessages.filter((message) => !optimistic.has(message.id))
      message[sessionId] = nextMessages
    }
    for (const optimisticID of optimisticIDs) delete part[optimisticID]

    const materialized = materializeSessionSnapshots(
      { ...state, message, part },
      sessionId,
      records,
    )
    return { message: materialized.message, part: materialized.part }
  })
=======
  await waitForPendingRevert(input.sessionId, input.directory)
  assertRuntimeUnchanged()
  input.appendSubmissions?.()

  const targetDirectory = input.directory ?? dir()
  const store = targetDirectory ? dirStoreForDirectory(targetDirectory) : dirStore()
  const stateBeforeSend = store.getState()
  const sessionBeforeSend = stateBeforeSend.session.find((session) => session.id === input.sessionId)
  const revertMessageID = sessionBeforeSend?.revert?.messageID
  const messagesBeforeSend = stateBeforeSend.message[input.sessionId] ?? []
  const revertedMessages = messagesFrom(messagesBeforeSend, revertMessageID)
  const revertedParts = new Map(
    revertedMessages.map((message) => [message.id, stateBeforeSend.part[message.id] ?? []] as const),
  )

  if (revertMessageID) {
    const session = stateBeforeSend.session.map((candidate) => (
      candidate.id === input.sessionId ? { ...candidate, revert: undefined } as Session : candidate
    ))
    const message = {
      ...stateBeforeSend.message,
      [input.sessionId]: messagesBefore(messagesBeforeSend, revertMessageID),
    }
    const part = { ...stateBeforeSend.part }
    for (const revertedMessage of revertedMessages) delete part[revertedMessage.id]
    store.setState({ session, message, part })

    for (const revertedMessage of revertedMessages) {
      _optimisticConfirm?.({
        sessionID: input.sessionId,
        directory: targetDirectory,
        messageID: revertedMessage.id,
      })
    }
  }

  const context = (input.context ?? [])
    .filter((item) => item.text.trim())
    .map((item) => ({ ...item, id: ascendingId("msg") }))
  const messageID = ascendingId("msg")
  const optimisticIDs = [...context.map((item) => item.id), messageID]

  const optimisticParts: Part[] = [
    { id: partIds.userText(messageID), sessionID: input.sessionId, messageID, type: "text", text: input.content },
  ]
  if (input.files) {
    input.files.forEach((file, index) => {
      optimisticParts.push({
        id: partIds.userFile(messageID, index),
        sessionID: input.sessionId,
        messageID,
        type: "file",
        mime: file.mime,
        url: file.url,
        filename: file.filename,
      })
    })
  }

  const created = Date.now()
  const optimisticMessage: UserMessage = {
    id: messageID,
    role: "user",
    sessionID: input.sessionId,
    time: { created },
  }

  const addSyntheticContext = (item: SyntheticContextInput & { id: string }) => {
    const synthetic: SyntheticMessage = compact({
      id: item.id,
      role: "synthetic",
      sessionID: input.sessionId,
      time: { created },
      text: item.text,
      description: item.description,
      metadata: item.metadata ? toJsonRecord(item.metadata) : undefined,
    })
    optimisticAdd({ sessionID: input.sessionId, directory: targetDirectory, message: synthetic, parts: [] })
  }
  for (const item of context) addSyntheticContext(item)
  optimisticAdd({
    sessionID: input.sessionId,
    directory: targetDirectory,
    message: optimisticMessage,
    parts: optimisticParts,
  })
  input.onOptimisticInsert?.(messageID)

  if (input.markBusy !== false) markSessionStatus(input.sessionId, targetDirectory, "busy")

  let revertCommitSent = false
  let revertCommitted = false
  const commitRevert = revertMessageID
    ? async () => {
        revertCommitSent = true
        await commitSessionRevert(input.sessionId, targetDirectory)
        revertCommitted = true
      }
    : undefined

  const releasePrompt = trackPromptInFlight(input.sessionId)
  let requestSent = false
  try {
    await input.ready
    assertRuntimeUnchanged()
    requestSent = true
    await input.send(messageID, context, commitRevert)
  } catch (error) {
    const status = getErrorStatus(error)
    const ambiguousFailure = requestSent && isAmbiguousSendFailure(error)
    const acceptedRecords = ambiguousFailure
      ? await fetchRecentSendConfirmationRecords(input.sessionId, messageID, targetDirectory)
      : null

    if (acceptedRecords) {
      materializeConfirmedSendRecords(store, input.sessionId, optimisticIDs, acceptedRecords)
      for (const optimisticID of optimisticIDs) {
        optimisticConfirm?.({
          sessionID: input.sessionId,
          directory: targetDirectory,
          messageID: optimisticID,
        })
      }
      return
    }

    const failureRecord = {
      sessionId: input.sessionId,
      messageId: messageID,
      directory: targetDirectory ?? null,
      status,
      ambiguous: ambiguousFailure,
      confirmationChecked: ambiguousFailure,
      reason: error instanceof Error ? error.message : String(error),
    }
    recordSendFailure(failureRecord)
    console.warn("[session-actions] prompt send rejected; rolling back optimistic message", failureRecord)

    let revertStaged = !revertCommitted
    if (revertCommitSent && !revertCommitted && ambiguousFailure) {
      revertStaged = await opencodeClient.getSession(input.sessionId, targetDirectory).then((record) => !!record.revert, () => true)
    }

    const rollbackDirectory = getSessionDirectory(input.sessionId) ?? targetDirectory
    const rollbackStore = rollbackDirectory && rollbackDirectory !== targetDirectory ? dirStoreForDirectory(rollbackDirectory) : store
    for (const optimisticID of optimisticIDs) {
      optimisticRemove({
        sessionID: input.sessionId,
        directory: rollbackDirectory,
        messageID: optimisticID,
      })
    }
    const rollbackState = rollbackStore.getState()
    let session = rollbackState.session
    let message = rollbackState.message
    let part = rollbackState.part

    if (revertMessageID && revertStaged) {
      session = rollbackState.session.map((candidate) => (
        candidate.id === input.sessionId ? { ...candidate, revert: sessionBeforeSend?.revert } as Session : candidate
      ))
      message = {
        ...rollbackState.message,
        [input.sessionId]: mergeMessages(rollbackState.message[input.sessionId] ?? [], revertedMessages),
      }
      part = { ...rollbackState.part }
      for (const [revertedMessageID, parts] of revertedParts) {
        part[revertedMessageID] = parts
      }
    }

    rollbackStore.setState({
      session,
      message,
      part,
      session_status: {
        ...rollbackState.session_status,
        [input.sessionId]: { type: "idle" as const },
      },
    })
    throw error
  } finally {
    releasePrompt()
  }
}

async function fetchRecentSendConfirmationRecords(
  sessionId: string,
  messageID: string,
  directory?: string | null,
): Promise<Array<{ info: Message; parts: Part[] }> | null> {
  const reconnectDeadline = Date.now() + SEND_CONFIRMATION_RECONNECT_TIMEOUT_MS
  while (!useConfigStore.getState().isConnected && Date.now() < reconnectDeadline) {
    await wait(SEND_CONFIRMATION_RECONNECT_POLL_MS)
  }

  for (let attempt = 0; attempt < SEND_CONFIRMATION_REFETCH_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await wait(SEND_CONFIRMATION_REFETCH_BASE_RETRY_MS * 2 ** (attempt - 1))
    try {
      const page = await opencodeClient.getSessionMessages(
        sessionId,
        { limit: SEND_CONFIRMATION_REFETCH_LIMIT },
        directory,
      )
      const records = page.items.filter((record) => !!record.info?.id)
      if (records.some((record) => record.info.id === messageID)) {
        return records
      }
    } catch {
      // Confirmation is best-effort; if it fails, keep the original send error path.
    }
  }
  return null
}

function materializeConfirmedSendRecords(
  store: DirectoryStoreApi,
  sessionId: string,
  optimisticIDs: readonly string[],
  records: Array<{ info: Message; parts: Part[] }>,
): void {
  const optimistic = new Set(optimisticIDs)
  store.setState((state) => {
    const currentMessages = state.message[sessionId]
    const message = { ...state.message }
    const part = { ...state.part }
    if (currentMessages) {
      const nextMessages = currentMessages.filter((message) => !optimistic.has(message.id))
      message[sessionId] = nextMessages
    }
    for (const optimisticID of optimisticIDs) delete part[optimisticID]

    const materialized = materializeSessionSnapshots(
      { ...state, message, part },
      sessionId,
      records,
    )
    return { message: materialized.message, part: materialized.part }
  })
>>>>>>> upstream/main
}


export async function abortCurrentOperation(sessionId: string): Promise<void> {
<<<<<<< HEAD
 const runtimeKey = getRuntimeKey()
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
 if (!snapshot.activeRun) return
 const result = await canonicalClient.abortSession(sessionId, snapshot.activeRun.runId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 if (result.run.sessionId !== sessionId || result.run.runId !== snapshot.activeRun.runId) throw new Error("Abort response identified another run")
 // The abort ack is the native terminal record for this run; publish it so
 // the stop control clears without waiting for the event stream to recover.
 publishRuntimeRun(result.run)
}
export async function compactSession(sessionId: string, instructions?: string): Promise<void> {
 const runtimeKey = getRuntimeKey()
 const result = await canonicalClient.compactSession(sessionId, instructions)
 if (isStaleRuntime(runtimeKey)) throw new Error('runtime changed')
 if (result.type !== 'compact') throw new Error('Compact response identified another control')
}
export async function runBuiltinCommand(sessionId: string, text: string): Promise<string> {
 const runtimeKey = getRuntimeKey()
 const result = await canonicalClient.runBuiltinCommand(sessionId, text)
 if (isStaleRuntime(runtimeKey)) throw new Error('runtime changed')
 if (result.type !== 'command') throw new Error('Command response identified another control')
 return result.output
||||||| bc50ba56aa
  // The abort must carry the SESSION'S directory, not the active UI directory:
  // OpenCode routes the request to the per-directory instance, and an abort
  // sent to the wrong instance cancels nothing while still returning 200 true
  // (the "stop button does nothing" report — sessions in another project/
  // worktree than the UI's current directory could never be aborted).
  const { directory } = dirStoreForSession(sessionId)
  try {
    await opencodeClient.abortSession(sessionId, directory)
  } catch (error) {
    console.error("[session-actions] abort failed", error)
  }
=======
  const { directory } = dirStoreForSession(sessionId)
  try {
    await opencodeClient.abortSession(sessionId, directory)
  } catch (error) {
    console.error("[session-actions] abort failed", error)
  }
>>>>>>> upstream/main
}


export async function respondToPermission(
 sessionId: string,
 requestId: string,
 response: "once" | "always" | "reject",
 _directoryOverride?: string,
): Promise<void> {
<<<<<<< HEAD
 void _directoryOverride
 const runtimeKey = getRuntimeKey()
 await waitForConnectionOrThrow()
 const request = await readPendingApproval(sessionId, requestId, runtimeKey)
 await submitApproval(request, response, runtimeKey)
||||||| bc50ba56aa
  await waitForConnectionOrThrow()
  const directory = directoryOverride
    || resolveDirectoryForBlockingRequest("permission", sessionId, requestId)
    || getSessionDirectory(sessionId)
    || dir()
  try {
    if (await opencodeClient.replyToPermission(sessionId, requestId, response, { directory }) !== true) {
      throw new Error("Permission reply failed")
    }
  } catch (error) {
    // The server no longer has it, so the card has nothing left to answer.
    if (isPermissionRequestNotFoundError(error)) {
      removePermissionRequestFromChildStores(sessionId, requestId)
    }
    throw error
  }
=======
  await waitForConnectionOrThrow()
  const directory = directoryOverride || (await resolveBlockingRequestTarget(
    sessionId,
    resolveDirectoryForBlockingRequest("permission", sessionId, requestId) || getSessionDirectory(sessionId),
  )).directory
  try {
    if (await opencodeClient.replyToPermission(sessionId, requestId, response, { directory }) !== true) {
      throw new Error("Permission reply failed")
    }
  } catch (error) {
    if (isPermissionRequestNotFoundError(error)) {
      removePermissionRequestFromChildStores(sessionId, requestId)
    }
    throw error
  }
>>>>>>> upstream/main
}

<<<<<<< HEAD
export async function dismissPermission(sessionId: string, requestId: string): Promise<void> {
 await respondToPermission(sessionId, requestId, "reject")
||||||| bc50ba56aa
export async function dismissPermission(
  sessionId: string,
  requestId: string,
): Promise<void> {
  await waitForConnectionOrThrow()
  const directory = resolveDirectoryForBlockingRequest("permission", sessionId, requestId)
    || getSessionDirectory(sessionId)
    || dir()
  try {
    if (await opencodeClient.replyToPermission(sessionId, requestId, "reject", { directory }) !== true) {
      throw new Error("Permission dismissal failed")
    }
  } catch (error) {
    if (isPermissionRequestNotFoundError(error)) {
      removePermissionRequestFromChildStores(sessionId, requestId)
    }
    throw error
  }
=======
export async function dismissPermission(
  sessionId: string,
  requestId: string,
): Promise<void> {
  await waitForConnectionOrThrow()
  const { directory } = await resolveBlockingRequestTarget(
    sessionId,
    resolveDirectoryForBlockingRequest("permission", sessionId, requestId) || getSessionDirectory(sessionId),
  )
  try {
    if (await opencodeClient.replyToPermission(sessionId, requestId, "reject", { directory }) !== true) {
      throw new Error("Permission dismissal failed")
    }
  } catch (error) {
    if (isPermissionRequestNotFoundError(error)) {
      removePermissionRequestFromChildStores(sessionId, requestId)
    }
    throw error
  }
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** Reject pending subtree approvals once, restoring unresolved cards on failure. */
||||||| bc50ba56aa
/**
 * Dismiss every pending permission for the session subtree rooted at `sessionId`
 * (the session itself plus any subagent children). Used by the chat send path:
 * sending a message while a permission prompt is open must cancel/supersede the
 * open permission so it cannot linger or block the new turn.
 *
 * The permissions are removed from the local store OPTIMISTICALLY (before any
 * network call) so the prompt disappears instantly instead of waiting on the
 * `permission.reply` round-trip. Each permission is then formally rejected on
 * the backend via `permission.reply` with `reply: "reject"`, which fires
 * `permission.replied` for reconciliation.
 *
 * Returns true when at least one permission was dismissed. Rejection failures are
 * swallowed (a stranded permission must never block the send);
 * PermissionNotFoundError also clears the stale entry from the child store via
 * {@link dismissPermission}. Any other failure puts the permission back: the
 * agent is still waiting on it, and no event will bring it back.
 *
 * Rejecting unblocks the agent's tool without guaranteeing an idle session.
 * The chat caller preserves explicit Steer as a direct send and queues other
 * follow-ups after dismissal. This helper does not choose message delivery.
 */
=======
>>>>>>> upstream/main
export async function dismissOpenPermissionsForSession(sessionId: string): Promise<boolean> {
 if (!sessionId || !_childStores) return false
 const runtimeKey = getRuntimeKey()
 const toDismiss = new Map<string, { permission: PermissionRequest; stores: DirectoryStoreApi[] }>()
 for (const store of _childStores.children.values()) {
  const state = store.getState()
  for (const scopedId of computeSubtreeIds(state.session, sessionId)) {
   for (const permission of state.permission[scopedId] ?? []) {
    if (permission.status !== "pending") continue
    const key = JSON.stringify([permission.sessionId, permission.approvalId])
    const existing = toDismiss.get(key)
    if (existing) existing.stores.push(store)
    else toDismiss.set(key, { permission, stores: [store] })
   }
  }
<<<<<<< HEAD
 }
 if (toDismiss.size === 0) return false
 for (const { permission } of toDismiss.values()) {
  removePermissionRequestFromChildStores(permission.sessionId, permission.approvalId)
 }
 await Promise.all([...toDismiss.values()].map(async ({ permission, stores }) => {
  try {
   await submitApproval(permission, "reject", runtimeKey)
  } catch (error) {
   if (isStaleRuntime(runtimeKey) || isPermissionRequestNotFoundError(error)) return
   console.error("[session-actions] Failed to dismiss open approval on send:", error)
   // A terminal event can race the failed response. Prefer a fresh native
   // pending-set replacement; restore the prior card only when it is unknown.
   try {
    await refetchSessionMessages(permission.sessionId)
   } catch {
    if (isStaleRuntime(runtimeKey)) return
    for (const store of stores) restorePermissionRequest(store, permission.sessionId, permission)
   }
||||||| bc50ba56aa

  if (toDismiss.length === 0) return false

  // Optimistically clear the permissions from the local store so the prompt
  // disappears immediately, before the reject round-trip.
  for (const { sessionId: scopedSessionId, permission } of toDismiss) {
    removePermissionRequestFromChildStores(scopedSessionId, permission.id)
=======

  if (toDismiss.length === 0) return false

  for (const { sessionId: scopedSessionId, permission } of toDismiss) {
    removePermissionRequestFromChildStores(scopedSessionId, permission.id)
>>>>>>> upstream/main
  }
<<<<<<< HEAD
 }))
 return true
||||||| bc50ba56aa

  await Promise.all(
    toDismiss.map(async ({ store, sessionId: scopedSessionId, permission }) => {
      try {
        await dismissPermission(scopedSessionId, permission.id)
      } catch (error) {
        if (isPermissionRequestNotFoundError(error)) return
        // Swallow: a failed dismissal must not block the send. The permission
        // is still pending server-side, so it goes back where it was.
        console.error("[session-actions] Failed to dismiss open permission on send:", error)
        restorePermissionRequest(store, scopedSessionId, permission)
      }
    }),
  )
  return true
=======

  await Promise.all(
    toDismiss.map(async ({ store, sessionId: scopedSessionId, permission }) => {
      try {
        await dismissPermission(scopedSessionId, permission.id)
      } catch (error) {
        if (isPermissionRequestNotFoundError(error)) return
        console.error("[session-actions] Failed to dismiss open permission on send:", error)
        restorePermissionRequest(store, scopedSessionId, permission)
      }
    }),
  )
  return true
>>>>>>> upstream/main
}


<<<<<<< HEAD
export async function replyToForm(sessionId: string, formId: string, answer: JsonValue): Promise<void> {
 const runtimeKey = getRuntimeKey()
 await waitForConnectionOrThrow()
 const request = await readPendingQuestion(sessionId, formId, runtimeKey)
 await submitQuestion(request, { action: "answer", response: answer }, runtimeKey)
||||||| bc50ba56aa
/** One filled-in form: every field the agent declared, keyed by field key. */
export type FormAnswer = Record<string, string | number | boolean | string[]>

/** What a form's session should run on next; a missing half stays as it is. */
type FormSelection = {
  model?: { providerID: string; modelID: string; variant?: string | null }
  agent?: string
}

/**
 * The selection of the composer that belongs to a form's session. The main
 * chat's composer lives in the app-wide config. Any other session, a pinned
 * chat or a `/btw` fork, holds its picks per session, and a child session
 * answered from its parent has none: its record, a workflow's binding included,
 * stays. A reply never copies another chat's model, agent or effort.
 */
function resolveFormSelection(sessionId: string, directory: string | undefined): FormSelection {
  const picks = useSelectionStore.getState()
  const agentPick = picks.getSessionAgentPick(sessionId) ?? undefined
  if (useSessionUIStore.getState().currentSessionId === sessionId) {
    const config = useConfigStore.getState()
    return {
      agent: agentPick ?? config.currentAgentName ?? undefined,
      model: config.currentProviderId && config.currentModelId
        ? {
            providerID: config.currentProviderId,
            modelID: config.currentModelId,
            variant: config.currentVariantSelection.override === null ? null : config.currentVariant,
          }
        : undefined,
    }
  }
  const record = (getDirectoryState(directory)?.session ?? getAllSyncSessions()).find((session) => session.id === sessionId)
  const recordModel = record?.model
  const modelPick = picks.getSessionModelPick(sessionId)
  const model = modelPick ?? (recordModel ? { providerId: recordModel.providerID, modelId: recordModel.id } : null)
  const agent = agentPick ?? record?.agent
  const savedEffort = model && agent
    ? picks.getAgentModelVariantForSession(sessionId, agent, model.providerId, model.modelId)
    : undefined
  // An effort saved before a switch made elsewhere is older than the record.
  const effortPicked = savedEffort !== undefined && !(recordModel
    && picks.isSessionModelSwitched(sessionId, `${recordModel.providerID}/${recordModel.id}#${recordModel.variant ?? ""}`))
  if (!model || (!modelPick && !effortPicked)) return { agent: agentPick }
  const recordEffort = recordModel?.providerID === model.providerId && recordModel.id === model.modelId
    ? recordModel.variant
    : undefined
  return {
    agent: agentPick,
    model: { providerID: model.providerId, modelID: model.modelId, variant: effortPicked ? savedEffort : recordEffort },
  }
}

/**
 * Puts a form's session on its composer's selection before the answer resumes
 * the turn, as a send does (#6053): an unchanged selection switches nothing,
 * and a failed switch leaves the answer unsent. Auto reaches the session as
 * the sentinel; the server routes the reply itself and switches to the real
 * model before it forwards the answer. Returns what to settle once the answer
 * is accepted.
 */
async function applyFormSelection(sessionId: string, directory: string | undefined, runtimeKey: string): Promise<() => void> {
  // No session owns a location-scoped form, so nothing can be switched for it.
  if (sessionId === LOCATION_SCOPED_FORM_SESSION_ID) return () => {}
  const { model, agent } = resolveFormSelection(sessionId, directory)
  if (!model && !agent) return () => {}
  const settleModelPick = model
    ? useSelectionStore.getState().captureSessionModelPickSettlement(sessionId, model.providerID, model.modelID, runtimeKey)
    : undefined
  const selection = await resolveCheckedSendSelection(sessionId, directory, {
    // Without a model the agent half is all that is compared and used.
    providerID: model?.providerID ?? "",
    modelID: model?.modelID ?? "",
    variant: model?.variant,
    agent,
  })
  await opencodeClient.applySendSelection(
    sessionId,
    { model: model ? selection.model : undefined, agent: selection.agent },
    directory,
    runtimeKey,
  )
  return () => settleModelPick?.()
}

/**
 * Puts a model picked in a session's composer, and not sent yet, on the session
 * while its turn waits for an automatic retry. OpenCode reloads the session's
 * model before every attempt, so the next attempt runs on the pick and the turn
 * goes on, as when the limit-failover plugin switches from its retry hook. A
 * pick made while the turn generates waits for the next send, or for this, if
 * the turn falls into a retry wait first. Auto has no prompt to route here, so
 * it waits for the next send too.
 *
 * The switch is sent without comparing the pick with the synced record: a pick
 * reverted before the previous switch reached the record would read as
 * unchanged. OpenCode ignores a switch to the model the session already runs.
 */
export async function applyModelPickToRetry(sessionId: string, directory: string | undefined): Promise<void> {
  const pick = useSelectionStore.getState().getSessionModelPick(sessionId)
  if (!pick || isAutoModel(pick.providerId, pick.modelId)) return
  const { model } = resolveFormSelection(sessionId, directory)
  if (model?.providerID !== pick.providerId || model.modelID !== pick.modelId) return
  const settleModelPick = useSelectionStore.getState().captureSessionModelPickSettlement(sessionId, model.providerID, model.modelID)
  await opencodeClient.switchSessionModel(sessionId, { providerID: model.providerID, id: model.modelID, variant: model.variant }, directory)
  settleModelPick()
}

export async function replyToForm(
  sessionId: string,
  formId: string,
  answer: FormAnswer,
): Promise<void> {
  // The client resolves its server at call time, so everything past an await
  // first proves it still works for the runtime the user answered in.
  const isCurrentRuntime = captureRuntimeInstance()
  const runtimeKey = getRuntimeKey()
  const assertRuntimeCurrent = () => {
    if (!isCurrentRuntime()) throw new Error("Form reply was cancelled because the runtime changed.")
  }
  await waitForConnectionOrThrow()
  assertRuntimeCurrent()
  const directory = getRequestReplyDirectory("form", sessionId, formId)
  try {
    const settleSelection = await applyFormSelection(sessionId, directory, runtimeKey)
    assertRuntimeCurrent()
    if (await opencodeClient.replyToForm(sessionId, formId, answer, directory) !== true) {
      throw new Error("Form reply failed")
    }
    // The stores belong to another server now, and this form is not on it.
    if (!isCurrentRuntime()) return
    settleSelection()
    // A successful reply is authoritative: the backend resolved the form, so
    // clear it from the local store deterministically instead of waiting for
    // the SSE `form.replied` event. A lost event (SSE gap) would leave the
    // form pending forever, which keeps the session in "waiting for answer" —
    // the next task's thinking and final response never render (issues #2911,
    // #2448). The later SSE event is a no-op (the reducer only removes when
    // present).
    removeFormRequestFromChildStores(sessionId, formId)
    noteLocalFormReplied(formId)
  } catch (error) {
    if (isCurrentRuntime() && isFormRequestNotFoundError(error)) {
      removeFormRequestFromChildStores(sessionId, formId)
      recoverStaleBlockingRequest(sessionId)
    }
    // Still thrown. Callers must use isFormRequestNotFoundError and must not
    // toast it as a retryable submit failure: the form is already gone.
    throw error
  }
=======
export type FormAnswer = Record<string, string | number | boolean | string[]>

type FormSelection = {
  model?: { providerID: string; modelID: string; variant?: string | null }
  agent?: string
}

function resolveFormSelection(record: Session | undefined, sessionId: string): FormSelection {
  const picks = useSelectionStore.getState()
  const agentPick = picks.getSessionAgentPick(sessionId) ?? undefined
  if (
    record
    && (isReviewSession(record) || !record.parentID)
    && useSessionUIStore.getState().currentSessionId === sessionId
  ) {
    const config = useConfigStore.getState()
    return {
      agent: agentPick ?? config.currentAgentName ?? undefined,
      model: config.currentProviderId && config.currentModelId
        ? {
            providerID: config.currentProviderId,
            modelID: config.currentModelId,
            variant: config.currentVariantSelection.override === null ? null : config.currentVariant,
          }
        : undefined,
    }
  }
  const recordModel = record?.model
  const modelPick = picks.getSessionModelPick(sessionId)
  const model = modelPick ?? (recordModel ? { providerId: recordModel.providerID, modelId: recordModel.id } : null)
  const agent = agentPick ?? record?.agent
  const savedEffort = model && agent
    ? picks.getAgentModelVariantForSession(sessionId, agent, model.providerId, model.modelId)
    : undefined
  const effortPicked = savedEffort !== undefined && !(recordModel
    && picks.isSessionModelSwitched(sessionId, `${recordModel.providerID}/${recordModel.id}#${recordModel.variant ?? ""}`))
  if (!model || (!modelPick && !effortPicked)) return { agent: agentPick }
  const recordEffort = recordModel?.providerID === model.providerId && recordModel.id === model.modelId
    ? recordModel.variant
    : undefined
  return {
    agent: agentPick,
    model: { providerID: model.providerId, modelID: model.modelId, variant: effortPicked ? savedEffort : recordEffort },
  }
}

async function applyFormSelection(record: Session | undefined, sessionId: string, directory: string | undefined, runtimeKey: string): Promise<() => void> {
  if (sessionId === LOCATION_SCOPED_FORM_SESSION_ID) return () => {}
  const { model, agent } = resolveFormSelection(record, sessionId)
  if (!model && !agent) return () => {}
  const settleModelPick = model
    ? useSelectionStore.getState().captureSessionModelPickSettlement(sessionId, model.providerID, model.modelID, runtimeKey)
    : undefined
  const selection = await resolveCheckedSendSelection(sessionId, directory, {
    providerID: model?.providerID ?? "",
    modelID: model?.modelID ?? "",
    variant: model?.variant,
    agent,
  })
  await opencodeClient.applySendSelection(
    sessionId,
    { model: model ? selection.model : undefined, agent: selection.agent },
    directory,
    runtimeKey,
  )
  return () => settleModelPick?.()
}

export async function applyModelPickToRetry(sessionId: string, directory: string | undefined): Promise<void> {
  const pick = useSelectionStore.getState().getSessionModelPick(sessionId)
  if (!pick || isAutoModel(pick.providerId, pick.modelId)) return
  const { model } = resolveFormSelection(findSessionRecordAnywhere(sessionId, directory), sessionId)
  if (model?.providerID !== pick.providerId || model.modelID !== pick.modelId) return
  const settleModelPick = useSelectionStore.getState().captureSessionModelPickSettlement(sessionId, model.providerID, model.modelID)
  await opencodeClient.switchSessionModel(sessionId, { providerID: model.providerID, id: model.modelID, variant: model.variant }, directory)
  settleModelPick()
}

export async function replyToForm(
  sessionId: string,
  formId: string,
  answer: FormAnswer,
): Promise<void> {
  const isCurrentRuntime = captureRuntimeInstance()
  const runtimeKey = getRuntimeKey()
  const assertRuntimeCurrent = () => {
    if (!isCurrentRuntime()) throw new Error("Form reply was cancelled because the runtime changed.")
  }
  await waitForConnectionOrThrow()
  assertRuntimeCurrent()
  try {
    const { record, directory: replyDirectory } = await resolveBlockingRequestTarget(
      sessionId,
      getRequestReplyDirectory("form", sessionId, formId),
    )
    const settleSelection = await applyFormSelection(record, sessionId, replyDirectory, runtimeKey)
    assertRuntimeCurrent()
    if (await opencodeClient.replyToForm(sessionId, formId, answer, replyDirectory) !== true) {
      throw new Error("Form reply failed")
    }
    if (!isCurrentRuntime()) return
    settleSelection()
    removeFormRequestFromChildStores(sessionId, formId)
    noteLocalFormReplied(sessionId, formId)
  } catch (error) {
    if (isCurrentRuntime() && isFormRequestNotFoundError(error)) {
      removeFormRequestFromChildStores(sessionId, formId)
      recoverStaleBlockingRequest(sessionId)
    }
    throw error
  }
>>>>>>> upstream/main
}

<<<<<<< HEAD
export async function cancelForm(sessionId: string, formId: string): Promise<void> {
 const runtimeKey = getRuntimeKey()
 await waitForConnectionOrThrow()
 const request = await readPendingQuestion(sessionId, formId, runtimeKey)
 await submitQuestion(request, { action: "cancel" }, runtimeKey)
||||||| bc50ba56aa
export async function cancelForm(sessionId: string, formId: string): Promise<void> {
  await waitForConnectionOrThrow()
  const directory = getRequestReplyDirectory("form", sessionId, formId)
  try {
    if (await opencodeClient.cancelForm(sessionId, formId, directory) !== true) {
      throw new Error("Form cancellation failed")
    }
    // A successful cancellation is authoritative; see replyToForm for the
    // lost-SSE-event rationale (issues #2911, #2448).
    removeFormRequestFromChildStores(sessionId, formId)
    noteLocalFormCancelled(formId)
  } catch (error) {
    if (isFormRequestNotFoundError(error)) {
      removeFormRequestFromChildStores(sessionId, formId)
      recoverStaleBlockingRequest(sessionId)
    }
    // Same as replyToForm: not-found is already settled, not a retryable cancel.
    throw error
  }
=======
export async function cancelForm(sessionId: string, formId: string, message?: string): Promise<void> {
  await waitForConnectionOrThrow()
  const { directory } = await resolveBlockingRequestTarget(sessionId, getRequestReplyDirectory("form", sessionId, formId))
  try {
    if (await opencodeClient.cancelForm(sessionId, formId, directory, message) !== true) {
      throw new Error("Form cancellation failed")
    }
    removeFormRequestFromChildStores(sessionId, formId)
    if (message === undefined) noteLocalFormCancelled(sessionId, formId)
  } catch (error) {
    if (isFormRequestNotFoundError(error)) {
      removeFormRequestFromChildStores(sessionId, formId)
      recoverStaleBlockingRequest(sessionId)
    }
    throw error
  }
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** Cancel pending subtree questions once, restoring unresolved cards on failure. */
export async function dismissOpenFormsForSession(sessionId: string): Promise<boolean> {
 if (!sessionId || !_childStores) return false
 const runtimeKey = getRuntimeKey()
 const toDismiss = new Map<string, { form: FormRequest; stores: DirectoryStoreApi[] }>()
 for (const store of _childStores.children.values()) {
  const state = store.getState()
  for (const scopedId of computeSubtreeIds(state.session, sessionId)) {
   for (const form of state.form[scopedId] ?? []) {
    if (form.status !== "pending") continue
    const key = JSON.stringify([form.sessionId, form.questionId])
    const existing = toDismiss.get(key)
    if (existing) existing.stores.push(store)
    else toDismiss.set(key, { form, stores: [store] })
   }
||||||| bc50ba56aa
/** The model and agent a recovered answer's new turn runs with. */
type RecoveredAnswerSelection = {
  providerID: string
  modelID: string
  agent?: string
  variant?: string
}

/**
 * The configuration to run a recovered answer with, most specific first: the
 * model that asked the question (the linked assistant message), then the
 * session's own record, then the selection this client saved for the session.
 */
function recoveredAnswerSelection(question: RecoveredQuestion): RecoveredAnswerSelection {
  const state = dirStoreForDirectory(question.directory).getState()
  const message = state.message[question.sessionID]?.find((candidate) => candidate.id === question.toolMessageID)
  if (message?.role === "assistant") {
    return {
      providerID: message.providerID,
      modelID: message.modelID,
      agent: message.agent,
      variant: message.variant,
    }
  }
  const session = state.session.find((candidate) => candidate.id === question.sessionID)
  if (session?.model) {
    return {
      providerID: session.model.providerID,
      modelID: session.model.id,
      agent: session.agent,
      variant: session.model.variant,
    }
  }
  const saved = useSelectionStore.getState().getSessionModelSelection(question.sessionID)
  if (saved) {
    return {
      providerID: saved.providerId,
      modelID: saved.modelId,
      agent: useSelectionStore.getState().getSessionAgentSelection(question.sessionID) ?? undefined,
    }
  }
  throw new Error("No model is recorded for this question")
}

/** Uses the normal send path for rollback and ambiguous-failure confirmation. */
export async function sendRecoveredFormAnswer(question: RecoveredQuestion, text: string): Promise<void> {
  const runtimeKey = getRuntimeKey()
  const isCurrentRuntime = captureRuntimeInstance()
  await submitRecoveredAnswer(question.form.id, async () => {
    const selection = recoveredAnswerSelection(question)
    await useSessionUIStore.getState().sendMessage(
      text,
      selection.providerID,
      selection.modelID,
      selection.agent,
      undefined,
      undefined,
      undefined,
      selection.variant,
      "normal",
      {
        userInitiated: true,
        queuedGoal: null,
        target: { runtimeKey, sessionId: question.sessionID, directory: question.directory },
      },
    )
    if (isCurrentRuntime()) noteLocalFormReplied(question.form.id)
  })
}

/**
 * Cancel every pending form for the session subtree rooted at `sessionId` (the
 * session itself plus any subagent children). Used by the chat send path:
 * sending a message while a form is open must supersede it so it cannot linger
 * or strand the session in a half-answered state.
 *
 * The forms are removed from the local store OPTIMISTICALLY (before any network
 * call) so the prompt disappears instantly instead of waiting on the round
 * trip. Each form is then formally cancelled on the backend, which fires
 * `form.cancelled` for reconciliation.
 *
 * Returns true when at least one form was cancelled. Failures are swallowed (a
 * stranded form must never block the send); a not-found error also clears the
 * stale entry from the child store via {@link cancelForm}. Any other failure
 * puts the form back: the agent is still waiting on it, and no event will bring
 * it back (a subagent's form has no other recovery path, #2448).
 *
 * Rejecting unblocks the agent's tool without guaranteeing an idle session.
 * The chat caller preserves explicit Steer as a direct send (the inbox takes
 * it while the turn is still active) and queues other follow-ups after
 * dismissal. This helper does not abort the session.
 */
export async function dismissOpenFormsForSession(sessionId: string): Promise<boolean> {
  if (!sessionId) return false
  const stores = _childStores
  if (!stores) return false

  const toDismiss: Array<{ store: DirectoryStoreApi; sessionId: string; form: FormRequest }> = []
  for (const [, store] of stores.children) {
    const state = store.getState()
    const scopedIds = computeSubtreeIds(state.session, sessionId)
    if (scopedIds.size === 0) continue
    const formsBySession: Record<string, FormRequest[]> = state.form ?? {}
    for (const scopedId of scopedIds) {
      const requests = formsBySession[scopedId]
      if (!requests) continue
      for (const request of requests) {
        toDismiss.push({ store, sessionId: scopedId, form: request })
      }
    }
=======
type RecoveredAnswerSelection = {
  providerID: string
  modelID: string
  agent?: string
  variant?: string
}

function recoveredAnswerSelection(question: RecoveredQuestion): RecoveredAnswerSelection {
  const state = dirStoreForDirectory(question.directory).getState()
  const message = state.message[question.sessionID]?.find((candidate) => candidate.id === question.toolMessageID)
  if (message?.role === "assistant") {
    return {
      providerID: message.providerID,
      modelID: message.modelID,
      agent: message.agent,
      variant: message.variant,
    }
  }
  const session = state.session.find((candidate) => candidate.id === question.sessionID)
  if (session?.model) {
    return {
      providerID: session.model.providerID,
      modelID: session.model.id,
      agent: session.agent,
      variant: session.model.variant,
    }
  }
  const saved = useSelectionStore.getState().getSessionModelSelection(question.sessionID)
  if (saved) {
    return {
      providerID: saved.providerId,
      modelID: saved.modelId,
      agent: useSelectionStore.getState().getSessionAgentSelection(question.sessionID) ?? undefined,
    }
  }
  throw new Error("No model is recorded for this question")
}

export async function sendRecoveredFormAnswer(question: RecoveredQuestion, text: string): Promise<void> {
  const runtimeKey = getRuntimeKey()
  const isCurrentRuntime = captureRuntimeInstance()
  const deferred = question.evidence === "deferred-on-send"
  await submitRecoveredAnswer(question.form.id, async () => {
    const selection = recoveredAnswerSelection(question)
    await useSessionUIStore.getState().sendMessage(
      deferred ? `${DEFERRED_ANSWER_LEAD_IN}\n\n${text}` : text,
      selection.providerID,
      selection.modelID,
      selection.agent,
      undefined,
      undefined,
      undefined,
      selection.variant,
      "normal",
      {
        userInitiated: true,
        queuedGoal: null,
        target: { runtimeKey, sessionId: question.sessionID, directory: question.directory },
        metadata: deferred ? deferredAnswerMetadata(question.form.id) : undefined,
      },
    )
    if (isCurrentRuntime()) noteLocalFormReplied(question.sessionID, question.form.id)
  })
}

function openFormReleaseKeys(): Set<string> {
  const keys = new Set<string>()
  for (const [, store] of _childStores?.children ?? []) {
    for (const forms of Object.values(store.getState().form ?? {})) {
      for (const form of forms ?? []) {
        const tool = formToolLink(form)
        if (tool) keys.add(formReleaseKey(form, tool))
      }
    }
  }
  return keys
}

const formToolReads = new Map<string, { read: Promise<boolean>; isCurrentRuntime: () => boolean }>()

function readFormToolLink(form: FormRequest): Promise<boolean> {
  const tool = formToolLink(form)
  if (!tool) return Promise.resolve(false)
  const key = formReleaseKey(form, tool)
  const existing = formToolReads.get(key)
  if (existing?.isCurrentRuntime()) return existing.read
  const isCurrentRuntime = captureRuntimeInstance()
  const read = (async () => {
    try {
      const { directory } = await resolveBlockingRequestTarget(form.sessionID, getRequestReplyDirectory("form", form.sessionID, form.id))
      const parts = { [tool.messageID]: (await opencodeClient.getSessionMessage(form.sessionID, tool.messageID, directory)).parts }
      if (!isCurrentRuntime()) return false
      if (formTurnHold(form, parts) !== "released") return isWaitingQuestionCall(form, parts)
      const openKeys = openFormReleaseKeys()
      if (openKeys.has(key)) noteFormToolReleased(key, openKeys)
    } catch (error) {
      console.error("[session-actions] Could not read the tool call of an open form:", error)
    }
    return false
  })().finally(() => {
    if (formToolReads.get(key)?.read === read) formToolReads.delete(key)
  })
  formToolReads.set(key, { read, isCurrentRuntime })
  return read
}

export function readUnloadedFormToolLinks(sessionId: string): void {
  const releasedForms = useRecoverableQuestionsStore.getState().releasedForms
  for (const [, store] of _childStores?.children ?? []) {
    const state = store.getState()
    for (const form of state.form?.[sessionId] ?? []) {
      if (formTurnHold(form, state.part, releasedForms) === "unknown") void readFormToolLink(form)
    }
  }
}

type OpenFormCopy = { store: DirectoryStoreApi; sessionId: string; form: FormRequest }

function formCopiesHold(copies: readonly OpenFormCopy[]): "holds" | "released" | "unknown" {
  const releasedForms = useRecoverableQuestionsStore.getState().releasedForms
  const holds = copies.map(({ store, form }) => formTurnHold(form, store.getState().part, releasedForms))
  if (holds.includes("released")) return "released"
  return holds.includes("unknown") ? "unknown" : "holds"
}

export async function dismissOpenFormsForSession(
  sessionId: string,
  options?: { deferQuestions?: boolean },
): Promise<{ dismissed: boolean; deferred: readonly FormRequest[] }> {
  const nothing = { dismissed: false, deferred: [] }
  if (!sessionId) return nothing
  const stores = _childStores
  if (!stores) return nothing

  const isCurrentRuntime = captureRuntimeInstance()
  const copiesByForm = new Map<string, OpenFormCopy[]>()
  for (const [, store] of stores.children) {
    const state = store.getState()
    const scopedIds = computeSubtreeIds(state.session, sessionId)
    if (scopedIds.size === 0) continue
    const formsBySession: Record<string, FormRequest[]> = state.form ?? {}
    for (const scopedId of scopedIds) {
      const requests = formsBySession[scopedId]
      if (!requests) continue
      for (const request of requests) {
        const formKey = `${scopedId}\u0000${request.id}`
        const copies = copiesByForm.get(formKey) ?? []
        copies.push({ store, sessionId: scopedId, form: request })
        copiesByForm.set(formKey, copies)
      }
    }
>>>>>>> upstream/main
  }
<<<<<<< HEAD
 }
 if (toDismiss.size === 0) return false
 for (const { form } of toDismiss.values()) {
  removeFormRequestFromChildStores(form.sessionId, form.questionId)
 }
 await Promise.all([...toDismiss.values()].map(async ({ form, stores }) => {
  try {
   await submitQuestion(form, { action: "cancel" }, runtimeKey)
  } catch (error) {
   if (isStaleRuntime(runtimeKey) || isFormRequestNotFoundError(error)) return
   console.error("[session-actions] Failed to cancel open question on send:", error)
   try {
    await refetchSessionMessages(form.sessionId)
   } catch {
    if (isStaleRuntime(runtimeKey)) return
    for (const store of stores) restoreFormRequest(store, form.sessionId, form)
   }
||||||| bc50ba56aa

  if (toDismiss.length === 0) return false

  // Optimistically clear the forms from the local store so the prompt
  // disappears immediately, before the cancel round-trip.
  for (const { sessionId: scopedSessionId, form } of toDismiss) {
    removeFormRequestFromChildStores(scopedSessionId, form.id)
=======

  const unread = [...copiesByForm.values()].filter((copies) => formCopiesHold(copies) === "unknown")
  const readAsWaitingQuestion = new Set<readonly OpenFormCopy[]>()
  if (unread.length > 0) {
    await Promise.all(unread.map(async (copies) => {
      if (await readFormToolLink(copies[0].form)) readAsWaitingQuestion.add(copies)
    }))
    if (!isCurrentRuntime()) return nothing
  }
  const deferred: FormRequest[] = []
  const toDismiss: OpenFormCopy[][] = []
  for (const copies of copiesByForm.values()) {
    if (formCopiesHold(copies) === "released") continue
    const deferrable = options?.deferQuestions && copies[0].sessionId === sessionId
      && (readAsWaitingQuestion.has(copies) || copies.some(({ store, form }) => isWaitingQuestionCall(form, store.getState().part)))
    if (deferrable) deferred.push(copies[0].form)
    else toDismiss.push(copies)
  }
  if (toDismiss.length === 0) return { dismissed: false, deferred }

  for (const [{ sessionId: scopedSessionId, form }] of toDismiss) {
    removeFormRequestFromChildStores(scopedSessionId, form.id)
>>>>>>> upstream/main
  }
<<<<<<< HEAD
 }))
 return true
||||||| bc50ba56aa

  await Promise.all(
    toDismiss.map(async ({ store, sessionId: scopedSessionId, form }) => {
      try {
        await cancelForm(scopedSessionId, form.id)
      } catch (error) {
        if (isFormRequestNotFoundError(error)) return
        // Swallow: a failed cancellation must not block the send. The form
        // is still pending server-side, so it goes back where it was.
        console.error("[session-actions] Failed to cancel open form on send:", error)
        restoreFormRequest(store, scopedSessionId, form)
      }
    }),
  )
  return true
=======

  await Promise.all(
    toDismiss.map(async (copies) => {
      const [{ sessionId: scopedSessionId, form }] = copies
      try {
        await cancelForm(scopedSessionId, form.id)
      } catch (error) {
        if (isFormRequestNotFoundError(error)) return
        console.error("[session-actions] Failed to cancel open form on send:", error)
        for (const copy of copies) restoreFormRequest(copy.store, copy.sessionId, copy.form)
      }
    }),
  )
  return { dismissed: true, deferred }
>>>>>>> upstream/main
}

export async function deferQuestionsAfterSend(forms: readonly FormRequest[], sent: SentMessage | undefined): Promise<void> {
  if (sent?.route !== "prompt") return
  await Promise.all(forms.filter((form) => form.sessionID === sent.sessionId).map(async (form) => {
    try {
      await cancelForm(form.sessionID, form.id, DEFERRED_QUESTION_NOTE)
    } catch (error) {
      if (error instanceof Error && isFormAlreadySettledError(error)) {
        removeFormRequestFromChildStores(form.sessionID, form.id)
        recoverStaleBlockingRequest(form.sessionID)
      } else if (!isFormRequestNotFoundError(error)) {
        console.error("[session-actions] Could not defer an open question after a send:", error)
      }
    }
  }))
}

<<<<<<< HEAD
export async function revertToMessage(sessionId: string, messageId: string): Promise<void> {
 const runtimeKey = getRuntimeKey()
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
 const result = await canonicalClient.selectSessionBranch(sessionId, { action: "revert", messageId, branchId: snapshot.branch.branchId, branchVersion: snapshot.branch.branchVersion })
 await installAuthoritativeBranch(sessionId, result, runtimeKey)
||||||| bc50ba56aa
/**
 * Revert to a specific user message.
 *
 * 1. Abort if session is busy
 * 2. Extract text from the target message for prompt restoration
 * 3. Optimistically set revert marker so messages hide immediately
 * 4. Call the runtime revert endpoint and merge returned session
 * 5. Set pendingInputText so the reverted message text appears in the input
 */
export async function revertToMessage(sessionId: string, messageId: string): Promise<void> {
  const { store, directory } = dirStoreForSession(sessionId)
  const state = store.getState()

  const localTarget = state.message[sessionId]?.find((message) => message.id === messageId)
  const targetMessage = localTarget
    ?? (await findSessionMessageById(sessionId, messageId, directory))
  if (!targetMessage) throw new Error(`Cannot revert session: message ${messageId} was not found`)

  // Abort if busy before mutating session state
  const status = state.session_status[sessionId]
  if (status && status.type !== "idle") {
    try {
      await opencodeClient.abortSession(sessionId, directory)
    } catch {
      // ignore abort errors
    }
  }

  // Extract message text for prompt restoration.
  const messages = state.message[sessionId] ?? []
  const targetMsg = messages.find((m) => m.id === messageId)
  let messageText = ""
  let submittedFileParts: FilePart[] = []
  let submittedContextParts: readonly ContextCarrierPart[] = []
  if (targetMsg && targetMsg.role === "user") {
    const parts = state.part[messageId] ?? []
    // Every part on a user message is the user's own: OpenCode 2.x delivers
    // injected context as synthetic messages, not as parts of this one.
    messageText = parts
      .filter((part): part is TextPart => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim()
    // Snapshot file parts for later restoration to the input.
    submittedFileParts = parts.filter((part): part is FilePart => part.type === "file")
    // Attached context (review comments, quotes, terminal selections) rides in
    // the synthetic messages before this one and belongs back on the chips.
    submittedContextParts = contextCarriersForMessage(messages, messageId)
  }
  const revertMessageID = transcriptCutForMessage(messages, messageId)

  // Optimistically set only the revert marker. Keep messages and parts in the
  // local store; visible-message selectors derive the displayed timeline from
  // session.revert. This matches the server model and preserves reverted
  // messages for the restore dock without maintaining a separate shadow copy.
  const prevRevert = state.session.find((candidate) => candidate.id === sessionId)?.revert
  const sessions = [...state.session]
  const sessionIdx = sessions.findIndex((s) => s.id === sessionId)

  if (sessionIdx >= 0) {
    sessions[sessionIdx] = { ...sessions[sessionIdx], revert: { messageID: revertMessageID } }
    store.setState({ session: sessions })
  }

  // Save input store state before mutations — if the API fails we need to
  // roll back both text and attachments to their previous values.
  const prevRestoreText = useInputStore.getState().pendingSessionRestores.get(sessionId) ?? null
  const draftTarget: InlineCommentDraftTarget | null = directory
    ? { directory, sessionKey: sessionId }
    : null
  const restoreIdentity = createChatDraftIdentity(getRuntimeKey(), directory, sessionId)
  const prevTargetAttachments = useInputStore.getState().getAttachedFiles(restoreIdentity)
  const prevDrafts = draftTarget ? useInlineCommentDraftStore.getState().getDrafts(draftTarget) : []

  // Restore reverted message text and file attachments to input
  if (messageText) {
    useInputStore.getState().setPendingSessionRestore(sessionId, messageText)
  }

  // Restore file/image attachments from the target message.
  // Clear existing attachments first — previous revert's attachments
  // must not carry over, even when the current message has no files.
  // Only a prompt goes back to the composer: reverting a subagent run report
  // leaves whatever the user is typing alone.
  if (targetMsg?.role === "user") {
    restoreFilePartsToInput(submittedFileParts, restoreIdentity)
    if (draftTarget) restoreContextPartsToInput(submittedContextParts, draftTarget)
  }

  // Call SDK and merge authoritative result into store
  try {
    // Descendants go first because OpenCode also restores file snapshots during
    // revert. All sessions share a directory, so the parent's snapshot must win.
    await cascadeRevertToDescendants(sessionId, descendantRevertCutoff(state, targetMessage))
    // Stage only: the messages disappear behind the revert marker while the
    // dock offers Commit (finalize) or Clear (bring them back).
    await opencodeClient.stageRevert(sessionId, revertMessageID, { directory })
    const revertedSession = await opencodeClient.getSession(sessionId, directory)
    const current = store.getState()
    const updated = [...current.session]
    const idx = updated.findIndex((s) => s.id === sessionId)
    if (idx >= 0) {
      updated[idx] = revertedSession
      store.setState({ session: updated })
    }
    if (directory) {
      sessionEvents.requestGitRefresh({ directory })
      fileTreeChanges.unknownChange(directory)
    }
  } catch (err) {
    // Rollback: restore removed messages + revert marker
    const current = store.getState()
    const rollback = [...current.session]
    const idx = rollback.findIndex((s) => s.id === sessionId)
    if (idx >= 0) {
      rollback[idx] = { ...rollback[idx], revert: prevRevert }
    }
    store.setState({
      session: rollback,
    })
    // Rollback input store: only this session's attachment slot moves.
    useInputStore.getState().setPendingSessionRestore(sessionId, prevRestoreText)
    useInputStore.getState().setAttachedFiles(prevTargetAttachments, restoreIdentity)
    if (draftTarget) {
      useInlineCommentDraftStore.getState().clearDrafts(draftTarget)
      useInlineCommentDraftStore.getState().restoreDrafts(draftTarget, prevDrafts)
    }
    throw err
  }
=======

function runRevertOperation(sessionId: string, action: () => Promise<void>, includeDescendants = true): Promise<void> {
  revertRevision += 1
  const descendants = includeDescendants ? getDescendantSessions(sessionId) : []
  const sessionIds = [sessionId, ...descendants.map(({ session }) => session.id)]
  const keys = sessionIds.map(revertKey)
  const previous = [...new Set(sessionIds.flatMap((id) => pendingRevertsForSession(id).map((entry) => entry.promise)))]
  const isCurrentRuntime = captureRuntimeInstance()
  const operation = Promise.resolve().then(async () => {
    const results = await Promise.allSettled(previous)
    const failed = results.find((result) => result.status === "rejected")
    if (failed?.status === "rejected") throw failed.reason
    if (!isCurrentRuntime()) throw new Error("Runtime changed while waiting for the revert.")
    await action()
  })
  const tracked = operation.finally(() => {
    for (const key of keys) {
      if (pendingReverts.get(key)?.promise === tracked) pendingReverts.delete(key)
    }
  })
  const entry = { rootId: sessionId, runtimeKey: getRuntimeKey(), affectsDescendants: includeDescendants, promise: tracked }
  for (const key of keys) pendingReverts.set(key, entry)
  return tracked
}

export function revertToMessage(sessionId: string, messageId: string, options?: { refresh?: boolean }): Promise<void> {
  return runRevertOperation(sessionId, async () => {
    const isCurrentRuntime = captureRuntimeInstance()
    if (options?.refresh) await refetchSessionMessages(sessionId)
    if (!isCurrentRuntime()) throw new Error("Runtime changed while waiting for the revert.")
    await stageRevertToMessage(sessionId, messageId)
  })
}

async function stageRevertToMessage(sessionId: string, messageId: string): Promise<void> {
  const isCurrentRuntime = captureRuntimeInstance()
  const assertRuntime = () => {
    if (!isCurrentRuntime()) throw new Error("Runtime changed while staging the revert.")
  }
  const { store, directory } = dirStoreForSession(sessionId)
  const state = store.getState()

  const localTarget = state.message[sessionId]?.find((message) => message.id === messageId)
  const targetMessage = localTarget
    ?? (await findSessionMessageById(sessionId, messageId, directory))
  assertRuntime()
  if (!targetMessage) throw new Error(`Cannot revert session: message ${messageId} was not found`)

  const status = state.session_status[sessionId]
  if (status && status.type !== "idle") {
    try {
      await opencodeClient.abortSession(sessionId, directory)
    } catch {
      // ignore abort errors
    }
  }
  assertRuntime()

  const messages = state.message[sessionId] ?? []
  const targetMsg = messages.find((m) => m.id === messageId)
  let messageText = ""
  let submittedFileParts: FilePart[] = []
  let submittedContextParts: readonly ContextCarrierPart[] = []
  if (targetMsg && targetMsg.role === "user") {
    const parts = state.part[messageId] ?? []
    messageText = parts
      .filter((part): part is TextPart => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim()
    submittedFileParts = parts.filter((part): part is FilePart => part.type === "file")
    submittedContextParts = contextCarriersForMessage(messages, messageId)
  }
  const revertMessageID = transcriptCutForMessage(messages, messageId)

  const prevRevert = state.session.find((candidate) => candidate.id === sessionId)?.revert
  const sessions = [...state.session]
  const sessionIdx = sessions.findIndex((s) => s.id === sessionId)

  if (sessionIdx >= 0) {
    sessions[sessionIdx] = { ...sessions[sessionIdx], revert: { messageID: revertMessageID } }
    store.setState({ session: sessions })
  }

  const prevRestoreText = useInputStore.getState().pendingSessionRestores.get(sessionId) ?? null
  const draftTarget: InlineCommentDraftTarget | null = directory
    ? { directory, sessionKey: sessionId }
    : null
  const restoreIdentity = createChatDraftIdentity(getRuntimeKey(), directory, sessionId)
  const prevTargetAttachments = useInputStore.getState().getAttachedFiles(restoreIdentity)
  const prevDrafts = draftTarget ? useInlineCommentDraftStore.getState().getDrafts(draftTarget) : []

  const restoredText = targetMsg?.role === "user"
    ? withMissingCitations(messageText ?? "", submittedFileParts.filter((part) => part.url).map((part) => ({ filename: attachmentBasename(part.filename ?? "attachment") })))
    : messageText
  if (restoredText) {
    useInputStore.getState().setPendingSessionRestore(sessionId, restoredText)
  }

  if (targetMsg?.role === "user") {
    restoreFilePartsToInput(submittedFileParts, restoreIdentity)
    if (draftTarget) restoreContextPartsToInput(submittedContextParts, draftTarget)
  }

  try {
    await cascadeRevertToDescendants(getDescendantSessions(sessionId), descendantRevertCutoff(state, targetMessage), assertRuntime)
    const revertedSession = await stageAndReadRevert(sessionId, revertMessageID, directory, assertRuntime)
    const current = store.getState()
    const updated = [...current.session]
    const idx = updated.findIndex((s) => s.id === sessionId)
    if (idx >= 0) {
      updated[idx] = revertedSession
      store.setState({ session: updated })
    }
    if (directory) {
      sessionEvents.requestGitRefresh({ directory })
      fileTreeChanges.unknownChange(directory)
    }
  } catch (err) {
    if (!isCurrentRuntime()) throw err
    const current = store.getState()
    const rollback = [...current.session]
    const idx = rollback.findIndex((s) => s.id === sessionId)
    if (idx >= 0) {
      rollback[idx] = { ...rollback[idx], revert: prevRevert }
    }
    store.setState({
      session: rollback,
    })
    useInputStore.getState().setPendingSessionRestore(sessionId, prevRestoreText)
    useInputStore.getState().setAttachedFiles(prevTargetAttachments, restoreIdentity)
    if (draftTarget) {
      useInlineCommentDraftStore.getState().clearDrafts(draftTarget)
      useInlineCommentDraftStore.getState().restoreDrafts(draftTarget, prevDrafts)
    }
    throw err
  }
>>>>>>> upstream/main
}

export async function refetchSessionMessages(sessionId: string): Promise<void> {
 const runtimeKey = getRuntimeKey()
 const { store, directory } = dirStoreForSession(sessionId)
 const loader = getImperativeSessionMessageLoader()
 if (loader && directory) {
  await loader.refresh({ directory, sessionId })
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  const snapshot = loader.getSnapshot({ directory, sessionId })
  if (snapshot.status === "error") throw snapshot.error ?? new Error("Session message refresh failed")
  return
 }

<<<<<<< HEAD
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
 store.setState((state) => installSessionSnapshot(state, snapshot))
||||||| bc50ba56aa
  // Actions can run in isolated tests before SyncProvider binds the shared
  // loader. The application runtime always takes the shared path above.
  const page = await opencodeClient.getSessionMessages(sessionId, { limit: MESSAGE_REFETCH_LIMIT }, directory)
  const records = page.items.filter((record) => !!record.info?.id)
  if (records.length === 0) return

  store.setState((state) => {
    const materialized = materializeSessionSnapshots(state, sessionId, records)
    return { message: materialized.message, part: materialized.part }
  })
=======
  const page = await opencodeClient.getSessionMessages(sessionId, { limit: MESSAGE_REFETCH_LIMIT }, directory)
  const records = page.items.filter((record) => !!record.info?.id)
  if (records.length === 0) return

  store.setState((state) => {
    const materialized = materializeSessionSnapshots(state, sessionId, records)
    return { message: materialized.message, part: materialized.part }
  })
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** Insert the fork into the child store so the sidebar updates immediately, then switch to it. */
function openForkedSession(_store: DirectoryStoreApi, forkedSession: CanonicalSession, directory: string | null | undefined) {
 if (directory) _childStores?.ensureChild(directory, { bootstrap: false })
 publishCanonicalSession(forkedSession, directory ?? undefined)
 useSessionUIStore.getState().setCurrentSession(forkedSession.sessionId, directory)
||||||| bc50ba56aa
/** Insert the fork into the child store so the sidebar updates immediately, then switch to it. */
function openForkedSession(store: DirectoryStoreApi, forkedSession: Session, directory: string | null | undefined) {
  const sessions = [...store.getState().session]
  const searchResult = Binary.search(sessions, forkedSession.id, (s) => s.id)
  if (!searchResult.found) {
    sessions.splice(searchResult.index, 0, forkedSession)
    store.setState({ session: sessions })
  }
  useSessionUIStore.getState().setCurrentSession(forkedSession.id, directory)
=======
function openForkedSession(store: DirectoryStoreApi, forkedSession: Session, directory: string | null | undefined) {
  const sessions = [...store.getState().session]
  const searchResult = Binary.search(sessions, forkedSession.id, (s) => s.id)
  if (!searchResult.found) {
    sessions.splice(searchResult.index, 0, forkedSession)
    store.setState({ session: sessions })
  }
  useSessionUIStore.getState().setCurrentSession(forkedSession.id, directory)
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** The Host metadata is inherited separately from the selected native transcript branch. */
async function inheritForkMetadata(sourceSessionId: string, forkedSession: CanonicalSession, directory: string | null | undefined, expectedRuntimeKey: string): Promise<void> {
 try {
  if (isStaleRuntime(expectedRuntimeKey)) return
  const source = await canonicalClient.getSessionMetadata(sourceSessionId)
  if (isStaleRuntime(expectedRuntimeKey)) return
  const inherited = SessionMetadataSchema.parse(withoutSourceOwnedLinks(source.metadata ?? {}))
  await patchSessionMetadata(forkedSession.sessionId, directory, (current) => Object.keys(current).length ? current : inherited, expectedRuntimeKey)
 } catch (error) {
  if (!isStaleRuntime(expectedRuntimeKey)) console.warn("[session-actions] fork metadata inheritance failed", error)
 }
||||||| bc50ba56aa
/**
 * The fork keeps the source's goal (OpenCode copies metadata) but not the
 * source's btw/review links; a file-backed objective is copied to the fork.
 * The objective copy re-reads the fork's goal id first and is skipped when the
 * user armed a new goal on the fork in the meantime.
 */
async function inheritForkState(sourceSessionId: string, forkedSession: Session, directory: string | null | undefined, expectedRuntimeKey: string) {
  // VS Code keeps its permission policy in the extension host; other runtimes
  // inherit it server-side when OpenCode announces session.forked.
  if (isVSCodeRuntime()) {
    try {
      const { usePermissionStore } = await import("@/stores/permissionStore")
      if (isStaleRuntime(expectedRuntimeKey)) return
      await usePermissionStore.getState().hydrate()
      if (isStaleRuntime(expectedRuntimeKey)) return
      const permissions = usePermissionStore.getState()
      if (!Object.hasOwn(permissions.modes, forkedSession.id)) {
        await permissions.setSessionMode(forkedSession.id, permissions.getSessionMode(sourceSessionId))
      }
    } catch (error) {
      console.warn("[fork] failed to copy the permission mode to the fork", error)
    }
    if (isStaleRuntime(expectedRuntimeKey)) return
  }
  return applyForkInheritance(sourceSessionId, forkedSession, {
    readGoalId: async (sessionId) => getSessionGoal(await opencodeClient.getSession(sessionId, directory))?.id ?? null,
    readObjective: fetchGoalObjectiveContent,
    writeObjective: writeGoalObjectiveFile,
    patchMetadata: async (sessionId, updater) => {
      await patchSessionMetadata(sessionId, directory, updater, expectedRuntimeKey)
    },
  })
=======
async function inheritForkState(sourceSessionId: string, forkedSession: Session, directory: string | null | undefined, expectedRuntimeKey: string) {
  if (isVSCodeRuntime()) {
    try {
      const { usePermissionStore } = await import("@/stores/permissionStore")
      if (isStaleRuntime(expectedRuntimeKey)) return
      await usePermissionStore.getState().hydrate()
      if (isStaleRuntime(expectedRuntimeKey)) return
      const permissions = usePermissionStore.getState()
      if (!Object.hasOwn(permissions.modes, forkedSession.id)) {
        await permissions.setSessionMode(forkedSession.id, permissions.getSessionMode(sourceSessionId))
      }
    } catch (error) {
      console.warn("[fork] failed to copy the permission mode to the fork", error)
    }
    if (isStaleRuntime(expectedRuntimeKey)) return
  }
  return applyForkInheritance(sourceSessionId, forkedSession, {
    readGoalId: async (sessionId) => getSessionGoal(await opencodeClient.getSession(sessionId, directory))?.id ?? null,
    readObjective: fetchGoalObjectiveContent,
    writeObjective: writeGoalObjectiveFile,
    patchMetadata: async (sessionId, updater) => { await patchSessionMetadata(sessionId, directory, updater, expectedRuntimeKey) },
    setPermissions: (sessionId, permissions) => opencodeClient.setSessionPermissions(sessionId, permissions, directory),
  })
>>>>>>> upstream/main
}

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * Fork keeping an assistant turn: the new session holds everything through
 * `messageId`, so the agent there still sees the answer it just gave. The
 * composer stays empty since there is no prompt to rewrite.
 */
export async function forkAfterMessage(sessionId: string, messageId: string): Promise<Session | null> {
  const expectedRuntimeKey = getRuntimeKey()
  const { store, directory } = dirStoreForSession(sessionId)
  const messages = store.getState().message[sessionId] ?? []
=======
export async function forkAfterMessage(sessionId: string, messageId: string): Promise<Session | null> {
  const expectedRuntimeKey = getRuntimeKey()
  const { store, directory } = dirStoreForSession(sessionId)
  const messages = store.getState().message[sessionId] ?? []
>>>>>>> upstream/main

/** Native selected forks include the named public message, without legacy composer replay. */
export async function forkAfterMessage(sessionId: string, messageId: string): Promise<CanonicalSession | null> {
 const expectedRuntimeKey = getRuntimeKey()
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(expectedRuntimeKey)) return null
 if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
 const { store, directory } = dirStoreForSession(sessionId)
 if (directory) {
  const owned = getGlobalSessionSnapshot(sessionId)
  if (!owned || resolveGlobalSessionDirectory(owned) !== normalizePath(directory)) {
   const workspace = await canonicalClient.resolveWorkspace(directory)
   if (isStaleRuntime(expectedRuntimeKey)) return null
   if (workspace.workspaceId !== snapshot.session.workspaceId) throw new Error("Session workspace directory is not resolved")
   registerWorkspaceDirectory(workspace.workspaceId, directory)
  }
 }
 const { session: forkedSession } = await canonicalClient.forkSession(snapshot.session, { messageId, mode: "selected" })
 if (isStaleRuntime(expectedRuntimeKey)) return null
 if (forkedSession.sessionId === sessionId || forkedSession.workspaceId !== snapshot.session.workspaceId) {
  throw new Error("Fork response did not identify a new session in the source workspace")
 }
 const forkDirectory = resolveGlobalSessionDirectory(forkedSession) ?? directory
 openForkedSession(store, forkedSession, forkDirectory)
 await inheritForkMetadata(sessionId, forkedSession, forkDirectory, expectedRuntimeKey)
 return isStaleRuntime(expectedRuntimeKey) ? null : getGlobalSessionSnapshot(forkedSession.sessionId) ?? forkedSession
}

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * Whether the boundary at `index` opened a turn rather than arriving inside one.
 * OpenCode steers subagent reports, compactions and prompts typed during a run
 * into the turn that is still going, right after a step that ended on tool
 * calls. A boundary opens a turn only when the assistant step before it finished
 * the previous turn (or there is none).
 */
const opensTurn = (messages: readonly Message[], index: number): boolean => {
  for (let before = index - 1; before >= 0; before -= 1) {
    const message = messages[before]
    if (message.role !== "assistant") continue
    return message.time.completed !== undefined && message.finish !== "tool-calls"
  }
  return true
}

/**
 * The last assistant message of the last finished turn, or null when there is
 * none. While a turn runs, everything from the record that opened it on is
 * excluded: that record is a turn boundary (a prompt, a compaction, a shell
 * run, or a background subagent run), and a step inside the running turn can
 * already carry `time.completed` while the turn keeps going, so only turns
 * before it count as stable.
 */
export function findLastCompletedTurnMessageId(messages: readonly Message[], turnRunning: boolean): string | null {
  let end = messages.length
  if (turnRunning) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (isTurnBoundary(messages[index]) && opensTurn(messages, index)) {
        end = index
        break
      }
    }
  }
  for (let index = end - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === "assistant" && message.time.completed !== undefined) return message.id
  }
  return null
}
=======
const opensTurn = (messages: readonly Message[], index: number): boolean => {
  for (let before = index - 1; before >= 0; before -= 1) {
    const message = messages[before]
    if (message.role !== "assistant") continue
    return message.time.completed !== undefined && message.finish !== "tool-calls"
  }
  return true
}

export function findLastCompletedTurnMessageId(messages: readonly Message[], turnRunning: boolean): string | null {
  let end = messages.length
  if (turnRunning) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (isTurnBoundary(messages[index]) && opensTurn(messages, index)) {
        end = index
        break
      }
    }
  }
  for (let index = end - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === "assistant" && message.time.completed !== undefined) return message.id
  }
  return null
}
>>>>>>> upstream/main

export class NothingToForkError extends Error {
 constructor() {
  super("No completed turn to fork from")
  this.name = "NothingToForkError"
 }
}

/**
 * The session's folder no longer exists, and metadata write is refused.
 * Archive is OpenChamber's own record and still works, so the UI offers it.
 */
export class SessionDirectoryMissingError extends Error {
 constructor(sessionId: string) {
  super(`the folder of session ${sessionId} no longer exists`)
  this.name = "SessionDirectoryMissingError"
 }
}

<<<<<<< HEAD
/**
 * `/fork`: fork after the last finished turn and open the fork. A running turn
 * in the source session is left alone and not copied.
 */
export async function forkFromLastCompletedTurn(sessionId: string): Promise<CanonicalSession | null> {
 const expectedRuntimeKey = getRuntimeKey()
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(expectedRuntimeKey)) return null
 if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
 let turns = snapshot.turns
 let messages = snapshot.messages
 let hasEarlier = snapshot.window.hasEarlier
 let cursor: string | undefined
 for (; ;) {
  const completed = new Set(turns.filter((turn) => turn.status === "completed").map((turn) => turn.turnId))
  const message = [...messages].reverse().find((candidate) => candidate.role === "assistant" && completed.has(candidate.turnId))
  if (message) return forkAfterMessage(sessionId, message.messageId)
  if (!hasEarlier) throw new NothingToForkError()
  const page = await canonicalClient.getHistory(sessionId, {
   limit: 100, cursor, leafTurnId: snapshot.window.lastTurnId ?? undefined,
  })
  if (isStaleRuntime(expectedRuntimeKey)) return null
  if (page.sessionId !== sessionId) throw new Error("History response identified another session")
  if (page.branch.branchId !== snapshot.branch.branchId || page.branch.branchVersion !== snapshot.branch.branchVersion) {
   throw new Error("Session branch changed while locating a completed turn")
  }
  turns = page.turns
  messages = page.messages
  cursor = page.nextCursor ?? undefined
  hasEarlier = page.nextCursor !== null
 }
||||||| bc50ba56aa
/**
 * `/fork`: fork after the last finished turn and open the fork. A running turn
 * in the source session is left alone and not copied.
 */
export async function forkFromLastCompletedTurn(sessionId: string): Promise<Session | null> {
  const { store } = dirStoreForSession(sessionId)
  const state = store.getState()
  const status = state.session_status?.[sessionId]
  const turnRunning = status !== undefined && status.type !== "idle"
  const messageId = findLastCompletedTurnMessageId(state.message[sessionId] ?? [], turnRunning)
  if (!messageId) throw new NothingToForkError()
  return forkAfterMessage(sessionId, messageId)
=======
export async function forkFromLastCompletedTurn(sessionId: string): Promise<Session | null> {
  const { store } = dirStoreForSession(sessionId)
  const state = store.getState()
  const status = state.session_status?.[sessionId]
  const turnRunning = status !== undefined && status.type !== "idle"
  const messageId = findLastCompletedTurnMessageId(state.message[sessionId] ?? [], turnRunning)
  if (!messageId) throw new NothingToForkError()
  return forkAfterMessage(sessionId, messageId)
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** Fork the native selected branch including the user message; leave both composers unchanged. */
||||||| bc50ba56aa
/**
 * Fork from a user message.
 *
 * 1. Extract text from the message for input restoration
 * 2. Call the runtime fork endpoint
 * 3. Insert the new session into the child store (so sidebar updates immediately)
 * 4. Switch to the new session and stage its composer replay
 */
=======
>>>>>>> upstream/main
export async function forkFromMessage(sessionId: string, messageId: string): Promise<void> {
<<<<<<< HEAD
 await forkAfterMessage(sessionId, messageId)
||||||| bc50ba56aa
  const expectedRuntimeKey = getRuntimeKey()
  const { store, directory } = dirStoreForSession(sessionId)
  const state = store.getState()

  // Extract message text and file attachments for input restoration.
  const parts = state.part[messageId] ?? []
  const messageText = parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim()
  const fileParts = parts.filter((part): part is FilePart => part.type === "file")

  const forkedSession = await opencodeClient.forkSession(sessionId, {
    before: transcriptCutForMessage(state.message[sessionId] ?? [], messageId),
    directory,
  })
  if (isStaleRuntime(expectedRuntimeKey)) return
  const target = createChatDraftIdentity(expectedRuntimeKey, resolveSessionOwnedDirectory(forkedSession) ?? directory, forkedSession.id)
  if (!target) throw new Error("Forked session has no composer directory")

  openForkedSession(store, forkedSession, target.directory)

  // Navigation is deferred in the chat column. Leave the source composer alone
  // until the rendered draft identity matches the fork, including for file-only prompts.
  useInputStore.setState({
    pendingComposerRestore: {
      target,
      text: messageText,
      files: fileParts.filter((part) => part.url).map((part) => ({
        url: part.url,
        mimeType: part.mime,
        filename: part.filename ?? "attachment",
      })),
    },
  })
  // The forked session is a fresh draft target, so the attached context of the
  // forked message follows the text into its composer.
  restoreContextPartsToInput(
    contextCarriersForMessage(state.message[sessionId] ?? [], messageId),
    { directory: target.directory, sessionKey: forkedSession.id },
  )
  await inheritForkState(sessionId, forkedSession, target.directory, expectedRuntimeKey)
=======
  const expectedRuntimeKey = getRuntimeKey()
  const { store, directory } = dirStoreForSession(sessionId)
  const state = store.getState()

  const parts = state.part[messageId] ?? []
  const messageText = parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim()
  const fileParts = parts.filter((part): part is FilePart => part.type === "file")

  const forkedSession = await opencodeClient.forkSession(sessionId, {
    before: transcriptCutForMessage(state.message[sessionId] ?? [], messageId),
    directory,
  })
  if (isStaleRuntime(expectedRuntimeKey)) return
  const target = createChatDraftIdentity(expectedRuntimeKey, resolveSessionOwnedDirectory(forkedSession) ?? directory, forkedSession.id)
  if (!target) throw new Error("Forked session has no composer directory")

  openForkedSession(store, forkedSession, target.directory)

  useInputStore.setState({
    pendingComposerRestore: {
      target,
      text: messageText,
      files: fileParts.filter((part) => part.url).map((part) => ({
        url: part.url,
        mimeType: part.mime,
        filename: part.filename ?? "attachment",
      })),
    },
  })
  restoreContextPartsToInput(
    contextCarriersForMessage(state.message[sessionId] ?? [], messageId),
    { directory: target.directory, sessionKey: forkedSession.id },
  )
  await inheritForkState(sessionId, forkedSession, target.directory, expectedRuntimeKey)
>>>>>>> upstream/main
}

export async function fetchMessagesForSession(sessionId: string, directory?: string | null): Promise<void> {
 const resolvedDir = directory ?? dir()
 if (!resolvedDir) return
 await getImperativeSessionMessageLoader()?.ensure(
  { directory: resolvedDir, sessionId },
  { reason: "navigation" },
 )
}
