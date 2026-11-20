import { ConnectionLostError } from './connection-lost-error';
import type { SentMessage } from '@/sync/send-message-options';

// The review-flow callback signature is retained for its Task 16 cutover;
// session records and action responses use the Canonical contract directly.
import { useSessionUIStore } from "./session-ui-store"
import { beginAgentStartupWait } from './agent-startup-wait'
import type { ChildStoreManager } from "./child-store"
import { computeSubtreeIds } from "./scoped-blocking-requests"
import type { ContextPartMetadata } from '@/lib/messages/contextParts'
type SyntheticContextInput = { id?: string; text: string; metadata?: ContextPartMetadata }
import { mergeSessionDirectoryMetadata, resolveGlobalSessionDirectory, useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useConfigStore } from "@/stores/useConfigStore"
import { registerSessionDirectory } from "./sync-refs"
import { isRestorableOnItsOwn } from "./session-restore-rule"
import { useGlobalSessionStatusStore, removeGlobalSessionStatuses } from "./global-session-status"
import { recordSendFailure } from "./send-failure-log"
import {
 withoutReviewSessionLink,
 type SessionMetadataRecord,
} from "@/lib/sessionReviewMetadata"
import { withContextObligatoryMessage, type ContextObligatoryMessage } from "@/lib/contextObligatoryMessages"
import type { LinkedIssue } from "@/lib/linkedIssues"
import { withSessionWorkState, type SessionWork } from "@/lib/sessionWorkMetadata"
import { withSessionPinned } from "@/lib/sessionPins"
import { getImperativeSessionMessageLoader } from "./session-message-loader"
import { clearSessionPrefetch } from "./session-prefetch-cache"
import { dropSessionCaches } from "./session-cache"
import { useInputStore } from "./input-store"
import { useSessionSuggestionStore } from "@/stores/useSessionSuggestionStore"
import { cleanupPersistedSessionState } from "./session-deletion-cleanup"
import { requestSessionArchiveBatch, requestSessionLinksUpdate, requestSessionUnarchiveBatch, type SessionArchiveStamp } from "./session-archive-batch"
import { markSessionUnreadSeen } from "./session-unread"
import { getRuntimeKey, getRuntimeSwitchRevision } from "@/lib/runtime-switch"
import { isRelayModeActive } from "@/lib/relay/runtime-tunnel"
import { retireSessionIdentity } from "./session-rekey-registry"
import { getErrorStatus, isAmbiguousSendFailure } from "./send-failure-classification"
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
 await waitForConnectionOrThrow({ intent: 'prompt' })
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

// Reference set by SyncProvider — allows actions to access the stores
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

export function optimisticAdd(input: OptimisticAddInput): void { _optimisticAdd?.(input) }
export function optimisticRemove(input: OptimisticRemoveInput): void { _optimisticRemove?.(input) }
/**
 * Revision patch for one or more sessions changing in the same store write.
 *
 * A batch bumps the revision once, because it is one state change: consumers
 * compare revisions to decide whether their view of the list is stale, and a
 * batch leaves them stale exactly once rather than once per session.
 */
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
  })
 } else {
  const pending = useInputStore.getState().pendingComposerRestore
  if (pending?.target.runtimeKey === runtimeKey && pending.target.sessionId === sessionId) useInputStore.setState({ pendingComposerRestore: null })
 }
}

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
}


function dir() {
 return _getDirectory() || undefined
}

function connectionLostError(): ConnectionLostError {
  const { hasEverConnected, lastDisconnectReason } = useConfigStore.getState()
  return new ConnectionLostError({ reason: lastDisconnectReason || null, everConnected: hasEverConnected })
}

const CONNECTION_GRACE_MS = 2000
const CONNECTION_PROBE_MS = 500
const RELAY_CONNECTION_GRACE_MS = 3000
const RELAY_CONNECTION_PROBE_MS = 3000
export async function waitForConnectionOrThrow(options: { intent?: 'prompt' } = {}): Promise<void> {
 const finishWait = options.intent === 'prompt' ? beginAgentStartupWait(getRuntimeSwitchRevision()) : undefined
 try {
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
 }
 throw connectionLostError()
 } finally {
  finishWait?.()
 }
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

 // Cross-directory live index: populated by global events and authoritative
 // per-directory status snapshots, and it survives child-store eviction.
 const globalStatus = useGlobalSessionStatusStore.getState()
 if (globalStatus.activeSessionIds.has(sessionId)) return "active"
 if (globalStatus.statusById.get(sessionId)?.status === "unavailable") return "unknown"

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

export async function clearStagedRevert(sessionId: string): Promise<void> {
 const runtimeKey = getRuntimeKey()
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
 if (!snapshot.branch.revert) return
 const result = await canonicalClient.selectSessionBranch(sessionId, { action: "restore", branchId: snapshot.branch.branchId, branchVersion: snapshot.branch.branchVersion })
 await installAuthoritativeBranch(sessionId, result, runtimeKey)
}

function getGlobalSessionSnapshot(sessionId: string): CanonicalSession | null {
 return useGlobalSessionsStore.getState().entityById.get(sessionId) ?? null
}

function findLiveSession(sessionId: string): CanonicalSession | null {
 if (!_childStores) return null
 for (const store of _childStores.children.values()) {
  const session = store.getState().session.find((item) => item.sessionId === sessionId)
  if (session) return session
 }
 return null
}

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
}

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)))

function getSessionDirectory(sessionId: string): string | undefined {
  const globalSession = getGlobalSessionSnapshot(sessionId)
  const globalDirectory = globalSession ? resolveGlobalSessionDirectory(globalSession) ?? undefined : undefined
  return globalDirectory
    || findSessionDirectoryInChildStores(sessionId)
    || useSessionUIStore.getState().getDirectoryForSession(sessionId)
    || dir()
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


function isFormRequestNotFoundError(error: unknown): boolean {
 return error instanceof CanonicalApiError
  && (error.problem.code === "QUESTION_NOT_FOUND" || error.problem.code === "QUESTION_EXPIRED")
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

async function submitQuestion(request: FormRequest, action: { action: "answer" | "update"; response: JsonValue } | { action: "cancel" }, runtimeKey: string): Promise<void> {
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 const reply: QuestionReply = { version: request.version, epoch: request.epoch, workerGeneration: request.workerGeneration, ...action }
 try {
  const result = await canonicalClient.respondQuestion(request.sessionId, request.questionId, reply)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  if (result.sessionId !== request.sessionId || result.questionId !== request.questionId) throw new Error("Question response identified another request")
  if (action.action !== "update") removeFormRequestFromChildStores(request.sessionId, request.questionId)
 } catch (error) {
  if (!isStaleRuntime(runtimeKey) && isFormRequestNotFoundError(error)) {
   removeFormRequestFromChildStores(request.sessionId, request.questionId)
   recoverStaleBlockingRequest(request.sessionId)
  }
  throw error
 }
}

/** Capture the existing composer selection in native session admission options. */
export type SessionCreateSelection = {
 model?: { providerId: string; modelId: string }
 agent?: string | null
 variant?: string
 reasoningEffort?: string
}

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
}

export async function setSessionWorkState(
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
}

export async function setSessionPinned(
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

}

/** Remove a server-confirmed session from every live child store that has it. */
function removeSessionFromLiveStores(sessionId: string, preferredDirectory?: string): SessionListSnapshot[] {
 if (!_childStores) return []

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
  directory: string | undefined
  rootDeleted: boolean
  cascadeIds: ReadonlySet<string>
}

function planChatDirectoryCleanup(sessionId: string, snapshot: CanonicalSession | null, directory: string | undefined): ChatDirectoryCleanupPlan {
 const global = useGlobalSessionsStore.getState()
 return {
  directory,
  rootDeleted: Boolean(snapshot && snapshot.parentSessionId == null),
  cascadeIds: computeSubtreeIds([...global.activeSessions, ...global.archivedSessions], sessionId),
 }
}

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
  expectedRuntimeKey?: string
}

export async function deleteSession(sessionId: string, options?: DeleteSessionOptions): Promise<boolean> {
 const expectedRuntimeKey = options?.expectedRuntimeKey ?? getRuntimeKey()
 if (isStaleRuntime(expectedRuntimeKey)) return false
 const sessionDirectory = getSessionDirectory(sessionId)
 const chatDirectoryCleanup = planChatDirectoryCleanup(sessionId, getGlobalSessionSnapshot(sessionId), sessionDirectory)
 try {
  await cleanupReviewMetadataBeforeDelete(sessionId, sessionDirectory, expectedRuntimeKey)
  if (isStaleRuntime(expectedRuntimeKey)) return false
  const deleted = await canonicalClient.deleteSession(sessionId)
  if (isStaleRuntime(expectedRuntimeKey)) return false
  if (deleted.sessionId !== sessionId || !deleted.deletedSessionIds.includes(sessionId)) {
   throw new Error("session.delete failed: server did not confirm deletion")
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
  expectedRuntimeKey?: string
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
  expectedRuntimeKey?: string
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

 for (const [directory, batchIds] of plan.batchesByDirectory) {
  if (isStaleRuntime(expectedRuntimeKey)) {
   failedIds.push(...batchIds)
   continue
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
  }
 }
 return ids
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
  expectedRuntimeKey?: string
  undo?: boolean
}

export async function unarchiveSessions(
 ids: string[],
 options?: UnarchiveSessionsOptions,
): Promise<{ restoredIds: string[]; failedIds: string[] }> {
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

 for (const [index, id] of ordered.entries()) {
  if (isStaleRuntime(expectedRuntimeKey)) {
   failedIds.push(...ordered.slice(index).filter((pending) => !settled.has(pending)))
   break
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
}


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
}

export async function optimisticSend(input: {
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
 await waitForConnectionOrThrow({ intent: 'prompt' })
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
 } catch (error) {
  if (isStaleRuntime(runtimeKey) || runtimeRevision !== getRuntimeSwitchRevision()) throw error
  console.warn("[session-actions] accepted review send history refresh failed", error)
 }
 reconcileAcceptedSend({
  runtimeKey, sessionId: input.sessionId, directory, pendingMessage, content: input.content,
  runId: acceptedRun?.runId ?? null, knownMessageIds,
 })
}


export async function abortCurrentOperation(sessionId: string): Promise<void> {
 const runtimeKey = getRuntimeKey()
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
 if (snapshot.compacting && !snapshot.activeRun) {
  await canonicalClient.abortCompaction(sessionId)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  return
 }
 if (!snapshot.activeRun) {
  await refetchSessionMessages(sessionId)
  return
 }
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
}


export async function respondToPermission(
 sessionId: string,
 requestId: string,
 response: "once" | "always" | "reject",
 _directoryOverride?: string,
): Promise<void> {
 void _directoryOverride
 const runtimeKey = getRuntimeKey()
 await waitForConnectionOrThrow()
 const request = await readPendingApproval(sessionId, requestId, runtimeKey)
 await submitApproval(request, response, runtimeKey)
}

export async function dismissPermission(sessionId: string, requestId: string): Promise<void> {
 await respondToPermission(sessionId, requestId, "reject")
}

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
  }
 }))
 return true
}


export async function replyToForm(sessionId: string, formId: string, answer: JsonValue): Promise<void> {
 const runtimeKey = getRuntimeKey()
 await waitForConnectionOrThrow()
 const request = await readPendingQuestion(sessionId, formId, runtimeKey)
 await submitQuestion(request, { action: "answer", response: answer }, runtimeKey)
}

export async function cancelForm(sessionId: string, formId: string): Promise<void> {
 const runtimeKey = getRuntimeKey()
 await waitForConnectionOrThrow()
 const request = await readPendingQuestion(sessionId, formId, runtimeKey)
 await submitQuestion(request, { action: "cancel" }, runtimeKey)
}

export async function updateForm(sessionId: string, formId: string, response: JsonValue): Promise<void> {
 const runtimeKey = getRuntimeKey()
 await waitForConnectionOrThrow()
 const request = await readPendingQuestion(sessionId, formId, runtimeKey)
 await submitQuestion(request, { action: "update", response }, runtimeKey)
}

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
  }
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
  }
 }))
 return true
}

export async function deferQuestionsAfterSend(forms: readonly FormRequest[], sent: SentMessage | undefined): Promise<void> {
  if (sent?.route !== "prompt") return
  await Promise.all(forms.filter((form) => form.sessionId === sent.sessionId).map(async (form) => {
    try {
      await cancelForm(form.sessionId, form.questionId)
    } catch (error) {
      if (isFormRequestNotFoundError(error)) {
        recoverStaleBlockingRequest(form.sessionId)
      } else if (!isFormRequestNotFoundError(error)) {
        console.error("[session-actions] Could not defer an open question after a send:", error)
      }
    }
  }))
}

export async function revertToMessage(sessionId: string, messageId: string): Promise<void> {
 const runtimeKey = getRuntimeKey()
 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
 const result = await canonicalClient.selectSessionBranch(sessionId, { action: "revert", messageId, branchId: snapshot.branch.branchId, branchVersion: snapshot.branch.branchVersion })
 await installAuthoritativeBranch(sessionId, result, runtimeKey)
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

 const snapshot = await canonicalClient.getSnapshot(sessionId)
 if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
 if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
 store.setState((state) => installSessionSnapshot(state, snapshot))
}

/** Insert the fork into the child store so the sidebar updates immediately, then switch to it. */
function openForkedSession(_store: DirectoryStoreApi, forkedSession: CanonicalSession, directory: string | null | undefined) {
 if (directory) _childStores?.ensureChild(directory, { bootstrap: false })
 publishCanonicalSession(forkedSession, directory ?? undefined)
 useSessionUIStore.getState().setCurrentSession(forkedSession.sessionId, directory)
}

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
}


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
}

export async function forkFromMessage(sessionId: string, messageId: string): Promise<void> {
 await forkAfterMessage(sessionId, messageId)
}

export async function fetchMessagesForSession(sessionId: string, directory?: string | null): Promise<void> {
 const resolvedDir = directory ?? dir()
 if (!resolvedDir) return
 await getImperativeSessionMessageLoader()?.ensure(
  { directory: resolvedDir, sessionId },
  { reason: "navigation" },
 )
}
