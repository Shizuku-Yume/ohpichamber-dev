/**
 * Session actions — Canonical Client operations and their UI reconciliation.
 * Host-owned archive and filesystem helpers keep their independent boundary.
 */

// The review-flow callback signature is retained for its Task 16 cutover;
// session records and action responses use the Canonical contract directly.
// Retained pure turn-boundary helper; native fork actions below use Turn records.
import type { Message } from "@/lib/opencode/model"
import { readSubagentRun } from "@/lib/opencode/subagent-run"
import { readDispatchedSessionResult } from "@/lib/opencode/dispatched-session"
import { useSessionUIStore } from "./session-ui-store"
import type { ChildStoreManager } from "./child-store"
import { computeSubtreeIds } from "./scoped-blocking-requests"
import type { SyntheticContextInput } from "@/lib/opencode/client"
import { ascendingId } from "@/lib/opencode/ids"
import { mergeSessionDirectoryMetadata, resolveGlobalSessionDirectory, useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useConfigStore } from "@/stores/useConfigStore"
import { waitForOpenCodeStartup } from "./opencode-startup-gate"
import { registerSessionDirectory } from "./sync-refs"
import { useGlobalSessionStatusStore, removeGlobalSessionStatuses } from "./global-session-status"
import { recordSendFailure } from "./send-failure-log"
import {
  withoutReviewSessionLink,
  type SessionMetadataRecord,
} from "@/lib/sessionReviewMetadata"
import { withContextObligatoryMessage, type ContextObligatoryMessage } from "@/lib/contextObligatoryMessages"
import { withoutBtwSessionLink } from "@/lib/sessionBtwMetadata"
import { withLinkedIssue, type LinkedIssue } from "@/lib/linkedIssues"
import { withSessionWorkState, type SessionWork } from "@/lib/sessionWorkMetadata"
import { getImperativeSessionMessageLoader } from "./session-message-loader"
import { cleanupPersistedSessionState } from "./session-deletion-cleanup"
import { requestSessionArchiveBatch, requestSessionUnarchiveBatch, type SessionArchiveStamp } from "./session-archive-batch"
import { registerBulkArchiveEchoes, releaseBulkArchiveEchoes } from "./bulk-archive-echo"
import { getRuntimeKey } from "@/lib/runtime-switch"
import { isRelayModeActive } from "@/lib/relay/runtime-tunnel"
import { getErrorStatus, isAmbiguousSendFailure } from "./send-failure-classification"
import { promoteRestoredSessionOrdering } from "./session-ordering"
import { normalizePath } from "@/lib/pathNormalization"
import { deleteChatDirectory } from "@/lib/chatDirectories"
import { cancelSessionTitleGeneration } from "./session-title-generation"
import { recordSessionActionFailure } from "./session-action-failures"
import { withoutSourceOwnedLinks } from "@/lib/sessionForkInheritance"
import { fetchGoalObjectiveContent, writeGoalObjectiveFile } from "@/lib/goalObjectiveFiles"
import { canonicalClient, CanonicalApiError } from "@/api/canonicalClient"
import { SessionMetadataSchema, SessionMetadataPatchSchema, PromptRequestSchema } from "@openchamber/agent-contract"
import type { Session as CanonicalSession, Message as CanonicalMessage, SessionMetadataState, PromptRequest, ApprovalRequest as PermissionRequest, QuestionRequest as FormRequest, ApprovalReply, QuestionReply, JsonValue, JsonObject as Metadata, SessionMetadata } from "@openchamber/agent-contract"
import { installHostSession, installSessionMetadata, installSessionSnapshot } from "./event-reducer"
import { registerWorkspaceDirectory } from "@/stores/globalSessions"

async function readCanonicalSession(sessionId: string, runtimeKey: string): Promise<CanonicalSession> {
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  const snapshot = await canonicalClient.getSession(sessionId)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  const metadata = await canonicalClient.getSessionMetadata(sessionId)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  if (snapshot.session.sessionId !== sessionId || metadata.sessionId !== sessionId) throw new Error("Session response identified another session")
  let host = getGlobalSessionSnapshot(sessionId) ?? findLiveSession(sessionId)
  if (!host) {
    const page = await canonicalClient.listSessions(snapshot.session.workspaceId)
    if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
    host = page.items.find((session) => session.sessionId === sessionId) ?? null
    if (!host) throw new Error("Host session projection is unavailable")
  }
  return {
    ...snapshot.session, metadata: metadata.metadata, metadataRevision: metadata.revision,
    archiveRevision: host.archiveRevision,
    ...(host.archivedAt === undefined ? {} : { archivedAt: host.archivedAt }),
  }
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

export type SessionSendInput = {
  sessionId: string
  request: PromptRequest
  mode?: "run" | "steer" | "follow-up"
  runtimeKey?: string
  commandId?: string
}

/** Native delivery never generates a message ID or retries an ambiguous send. */
export async function sendMessage(input: SessionSendInput): Promise<void> {
  const runtimeKey = input.runtimeKey ?? getRuntimeKey()
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  const request = PromptRequestSchema.parse(input.request)
  await waitForConnectionOrThrow()
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  if (input.mode === "steer") {
    const result = await canonicalClient.steer(input.sessionId, request, input.commandId)
    if (result.sessionId !== input.sessionId) throw new Error("Steer response identified another session")
  } else if (input.mode === "follow-up") {
    const result = await canonicalClient.followUp(input.sessionId, request, input.commandId)
    if (result.sessionId !== input.sessionId) throw new Error("Follow-up response identified another session")
  } else {
    const result = await canonicalClient.createRun(input.sessionId, request, input.commandId)
    if (result.run.sessionId !== input.sessionId) throw new Error("Run response identified another session")
  }
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
}

// Reference set by SyncProvider — allows actions to access the stores
let _childStores: ChildStoreManager | null = null
let _getDirectory: () => string = () => ""
// Optional ref into the sync layer's session-tail materialization queue. Used
// to reconcile a trailing running tool part after a blocking request is
// confirmed stale server-side (see recoverStaleBlockingRequest).
let _enqueueSessionMaterialization: ((directory: string, sessionID: string, messageID: string) => void) | null = null
type OptimisticAddInput = { sessionId: string; directory?: string | null; message: CanonicalMessage }
type OptimisticRemoveInput = { sessionId: string; directory?: string | null; messageId: string }
type OptimisticConfirmInput = OptimisticRemoveInput

let _optimisticAdd: ((input: OptimisticAddInput) => void) | null = null
let _optimisticRemove: ((input: OptimisticRemoveInput) => void) | null = null
let _optimisticConfirm: ((input: OptimisticConfirmInput) => void) | null = null

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

function invalidateSessionLoads(sessionId: string, directories: Iterable<string | null | undefined>): void {
  const loader = getImperativeSessionMessageLoader()
  if (!loader) return
  for (const directory of new Set(directories)) {
    if (directory) loader.invalidateSession({ directory, sessionId })
  }
}


export function setActionRefs(
  childStores: ChildStoreManager,
  getDirectory: () => string,
  enqueueSessionMaterialization?: (directory: string, sessionID: string, messageID: string) => void,
) {
  _childStores = childStores
  _getDirectory = getDirectory
  _enqueueSessionMaterialization = enqueueSessionMaterialization ?? null
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

/**
 * Provider/model of the session's last assistant message — the authoritative
 * "session provider" for utility calls (notes distillation etc.), independent
 * of what the composer picker currently points at.
 */
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

function unsupportedSessionControl(operation: string): CanonicalApiError {
  return new CanonicalApiError({
    type: "urn:ohpichamber:problem:NOT_IMPLEMENTED", title: "Session operation unavailable",
    status: 404, code: "NOT_IMPLEMENTED", retryable: false,
    detail: `The Canonical Agent Service does not support ${operation}.`,
  })
}

/** The public helper remains; a native workspace cannot be moved by an old engine. */
export async function moveSessionToDirectory(
  _session: CanonicalSession,
  _sourceDirectory: string,
  _destinationDirectory: string,
  expectedRuntimeKey = getRuntimeKey(),
): Promise<void> {
  if (isStaleRuntime(expectedRuntimeKey)) throw new Error("runtime changed")
  throw unsupportedSessionControl("moving a session to another workspace")
}

/** Native streams do not publish an authoritative workspace-move operation. */
export function adoptSessionMove(_sessionId: string, _sourceDirectory: string, _destinationDirectory: string): void {
  throw unsupportedSessionControl("adopting a session workspace move")
}

function dir() {
  return _getDirectory() || undefined
}

function connectionLostError(): Error {
  const { hasEverConnected, lastDisconnectReason } = useConfigStore.getState()
  const suffix = lastDisconnectReason
    ? ` (${lastDisconnectReason})`
    : hasEverConnected
      ? ""
      : " (never connected)"
  return new Error(`Connection lost${suffix}. Please wait for reconnection.`)
}

// Wait briefly for the pipeline to re-establish connection before failing a
// send. Transient reconnects (heartbeat race, WS→SSE fallback, brief network
// blip) otherwise surface as a hard "Connection lost" toast even though the
// pipeline recovers within a second. While waiting, run bounded health probes
// inside the same grace window so stale disconnected state can recover quickly.
// A relayed round trip crosses the relay twice (client -> relay -> host and
// back), so a healthy but distant host can easily need more than 500 ms.
const CONNECTION_GRACE_MS = 2000
const CONNECTION_PROBE_MS = 500
const RELAY_CONNECTION_GRACE_MS = 3000
const RELAY_CONNECTION_PROBE_MS = 3000
export async function waitForConnectionOrThrow(): Promise<void> {
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
  }
  throw connectionLostError()
}

type SessionListSnapshot = {
  directory: string
}

type DirectoryStoreApi = ReturnType<ChildStoreManager["ensureChild"]>


/** "unknown" means no live source covers this session right now, so no caller
 *  may treat it as idle on this answer. "idle" requires positive coverage. */
export type SessionLiveActivity = "unknown" | "idle" | "active"

/**
 * A session's live status can live in a different child store than the one that
 * wins the directory dedup, so any store reporting a non-idle status counts.
 * Read at the moment of use: a descendant can start working after the subtree
 * snapshot was taken.
 *
 * Absence of a non-idle status is not proof of idleness. Child stores are
 * evicted for background directories, and the global status index keeps only
 * non-idle entries, so "no report" and "idle" are different answers: report
 * "idle" only after a live idle event or successful status snapshot covers
 * the session's own directory. A loaded session list is not status authority.
 */
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

/** No native staged-revert contract exists; keep drafts/history unchanged. */
export async function clearStagedRevert(_sessionId: string): Promise<void> {
  throw unsupportedSessionControl("clearing a staged revert")
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

async function submitQuestion(request: FormRequest, action: { action: "answer"; response: FormAnswer } | { action: "cancel" }, runtimeKey: string): Promise<void> {
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
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

/** Capture the existing composer selection in native session admission options. */
export type SessionCreateSelection = {
  model?: { providerId: string; modelId: string }
  agent?: string
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
): Promise<CanonicalSession | null> {
  const runtimeKey = getRuntimeKey()
  try {
    const effectiveDirectory = directoryOverride ?? dir()
    if (!effectiveDirectory) throw new Error("No directory for session creation")
    const workspace = await canonicalClient.resolveWorkspace(effectiveDirectory)
    if (isStaleRuntime(runtimeKey)) return null
    const { session } = await canonicalClient.createSession({
      projectId: workspace.projectId,
      workspaceId: workspace.workspaceId,
      options: {
        providerId: selection?.model?.providerId ?? null,
        modelId: selection?.model?.modelId ?? null,
        agentId: selection?.agent ?? null,
        variant: selection?.variant ?? null,
        reasoningEffort: selection?.reasoningEffort ?? null,
      },
      metadata: SessionMetadataSchema.parse({ ...metadata, ...(title === undefined ? {} : { title }) }),
    })
    if (isStaleRuntime(runtimeKey)) return null
    registerWorkspaceDirectory(workspace.workspaceId, effectiveDirectory)
    _childStores?.ensureChild(effectiveDirectory, { bootstrap: false })
    publishCanonicalSession(session, effectiveDirectory)
    getImperativeSessionMessageLoader()?.initializeCreatedSession({ directory: effectiveDirectory, sessionId: session.sessionId })
    if (navigation === "open") useSessionUIStore.getState().setCurrentSession(session.sessionId, effectiveDirectory, selectionTransition)
    useSessionUIStore.getState().markSessionAsOpenChamberCreated(session.sessionId)
    return session
  } catch (error) {
    if (!isStaleRuntime(runtimeKey)) console.error("[session-actions] createSession failed", error)
    return null
  }
}

/**
 * True when a caller captured a runtime key before an asynchronous mutation and
 * that runtime is no longer the active one. Callers pass `undefined` when they
 * do not participate in runtime-scoped guarding, which keeps the previous
 * unguarded behavior.
 */
function isStaleRuntime(expectedRuntimeKey: string | undefined): boolean {
  return expectedRuntimeKey !== undefined && getRuntimeKey() !== expectedRuntimeKey
}

/**
 * Read a session, apply `updater` to its metadata, and persist the result.
 *
 * `expectedRuntimeKey` is optional here and unguarded when omitted, unlike the
 * archive and delete actions. When supplied, the runtime is rechecked before
 * the read, before the write, and before the global store is updated; a change
 * at any of those points **throws** `"runtime changed"` rather than returning a
 * value, because this function must resolve to a `Session`. Callers that pass a
 * key must therefore be prepared to catch that rejection.
 */
const isMetadataRecord = (value: JsonValue | undefined): value is Metadata =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)

/**
 * The JSON Merge Patch (RFC 7386) that turns `current` into `next`: changed
 * keys carry their new value, removed keys carry `null`, and nested records
 * recurse so a sibling key another feature owns is left untouched.
 */
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
): Promise<CanonicalSession> {
  const runtimeKey = expectedRuntimeKey ?? getRuntimeKey()
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  const current = getGlobalSessionSnapshot(sessionId) ?? await readCanonicalSession(sessionId, runtimeKey)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  const metadata = await canonicalClient.getSessionMetadata(sessionId)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  if (metadata.sessionId !== sessionId) throw new Error("Metadata response identified another session")
  const currentMetadata = metadata.metadata ?? {}
  const nextMetadata = SessionMetadataSchema.parse(updater(currentMetadata))
  const patch = SessionMetadataPatchSchema.parse({ changes: buildMetadataMergePatch(currentMetadata, nextMetadata) })
  const result = await canonicalClient.patchSessionMetadata(sessionId, patch)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
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
  return patchSessionMetadata(sessionId, directory, (metadata) =>
    withLinkedIssue(metadata, issue, linked))
}

/**
 * Link several items in one metadata write. Each write replaces the whole
 * link list, so separate concurrent `setLinkedIssue` calls would keep only
 * the last one's item.
 */
export async function addLinkedIssues(
  sessionId: string,
  directory: string | null | undefined,
  issues: readonly LinkedIssue[],
): Promise<CanonicalSession> {
  return patchSessionMetadata(sessionId, directory, (metadata) =>
    issues.reduce((current, issue) => withLinkedIssue(current, issue, true), metadata))
}

/**
 * The user tracks a session as in work (`open`) or marks its work done.
 * Bound to the server it was clicked on: when the runtime switches while the
 * change is in flight, nothing reaches the new server or its cache, and the
 * result is null rather than an error to show.
 */
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

  if (metadata?.openchamber?.kind === "btw") {
    const originalSessionID = metadata.openchamber.originalSessionID
    if (originalSessionID) await unlinkParent(originalSessionID, (current) => withoutBtwSessionLink(current, sessionId))
    return
  }

  // Deleting or archiving a session that has an active btw fork also removes
  // the fork: it is a temporary session that only exists for its parent's
  // panel. Best-effort — a failed fork delete must not block the parent's
  // operation; the orphaned fork stays visible in the sidebar.
  const btwSessionID = metadata?.openchamber?.btwSessionID
  if (btwSessionID) {
    try {
      if (isStaleRuntime(expectedRuntimeKey)) return
      await deleteSession(btwSessionID, { expectedRuntimeKey })
    } catch (error) {
      console.warn("[session-actions] failed to delete btw fork before parent delete", error)
    }
  }
}

/** Remove a server-confirmed session from every live child store that has it. */
function removeSessionFromLiveStores(sessionId: string, preferredDirectory?: string, archive = false): SessionListSnapshot[] {
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
    if (archive) {
      patch.session_status = { ...current.session_status }
      delete patch.session_status[sessionId]
      patch.sessionStatusInvalidated = { ...(current.sessionStatusInvalidated ?? {}), [sessionId]: true }
    }
    store.setState(patch)
  }

  return snapshots
}

/**
 * Remove a batch of server-confirmed sessions from every live child store.
 *
 * Each affected store is written once for the whole batch. Removing the
 * sessions one at a time notified every subscriber — and therefore re-rendered
 * the sidebar — once per session, which is what made archiving a worktree's
 * sessions block the main thread for seconds.
 */
function removeSessionsFromLiveStores(sessionIds: Iterable<string>, preferredDirectory?: string, archive = false): SessionListSnapshot[] {
  const ids = new Set(sessionIds)
  if (!_childStores || ids.size === 0) return []

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
    if (removed.length === 0) continue

    snapshots.push({ directory })
    const patch: Partial<ReturnType<DirectoryStoreApi["getState"]>> = {
      session: current.session.filter((session) => !ids.has(session.sessionId)),
      ...sessionsMutationPatch(current, removed, true),
    }
    if (archive) {
      patch.session_status = { ...current.session_status }
      patch.sessionStatusInvalidated = { ...(current.sessionStatusInvalidated ?? {}) }
      for (const id of removed) {
        delete patch.session_status[id]
        patch.sessionStatusInvalidated[id] = true
      }
    }
    store.setState(patch)
  }

  return snapshots
}

function cleanupSessionWorktreeMetadata(sessionId: string): void {
  useSessionUIStore.getState().setWorktreeMetadata(sessionId, null)
}

/**
 * Commit a server-confirmed deletion.
 *
 * `expectedRuntimeKey` is the runtime the deletion was confirmed on. It is
 * forwarded to `cleanupPersistedSessionState`, which rejects an identity whose
 * runtime is no longer active. Passing the live `getRuntimeKey()` here would
 * make that existing check a tautology, so the captured key is required to keep
 * it meaningful. Callers must still reject a stale runtime themselves, because
 * the in-memory live/global/UI stores mutated below are not runtime-scoped.
 */
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

/**
 * Reconcile a session the authoritative global snapshot proved gone.
 *
 * `session.deleted` is the primary signal, but the server can publish it while
 * this client's stream is being rebuilt, and then nothing removes the session
 * anywhere else: the live store keeps listing it, the sidebar keeps rendering
 * it, and the open chat keeps prompting an id the server no longer has. A
 * later complete snapshot that omits a session from the established baseline
 * reports the same deletion over the other channel, so it commits the same
 * reconciliation as a confirmed deletion instead of only clearing persisted
 * state.
 *
 * The captured runtime is rechecked here because the live, global, and UI
 * stores mutated below are not runtime-scoped.
 */
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
  /** Only a root session owns its managed chat directory. */
  rootDeleted: boolean
  /** The deleted session and the descendants the server cascade-deletes with it. */
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
  /**
   * Runtime key the deletion is scoped to. Defaults to the active runtime when
   * the action starts; callers may supply a key captured earlier when
   * confirmation spans a runtime switch.
   */
  expectedRuntimeKey?: string
}

/**
 * Delete one session.
 *
 * The runtime is rechecked before the request and again before any store is
 * reconciled, so a response produced by the previous runtime cannot mutate the
 * current runtime's state. Session IDs are not unique across runtimes, so
 * committing a stale deletion could otherwise evict an unrelated session and
 * erase its persisted queue, todos, drafts, folders, and pins.
 *
 * A `404` is treated as an already-completed deletion, but only when it is
 * still authoritative for the captured runtime. After a runtime change the
 * `404` describes either the previous runtime or a runtime this session never
 * belonged to; neither justifies committing cleanup here, so the action reports
 * failure and leaves reconciliation to the next authoritative load.
 */
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
  /**
   * Runtime key captured when the batch was confirmed. When supplied, the batch
   * stops as soon as the active runtime differs.
   */
  expectedRuntimeKey?: string
}

/**
 * Delete several sessions sequentially, preserving partial results.
 *
 * One failed session never blocks or erases the others: it is reported in
 * `failedIds` while the remaining IDs are still attempted. When the runtime
 * changes mid-batch, the sessions already committed on the captured runtime
 * stay in `deletedIds` and every ID that was not committed there is reported in
 * `failedIds`, so existing partial-failure feedback stays truthful.
 */
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

/**
 * Archive one session.
 *
 * `expectedRuntimeKey` defaults to the active runtime when the action starts.
 * Callers may supply a key captured earlier when confirmation spans a runtime
 * switch. When the runtime changes, the action stops and returns `false`
 * without reconciling any store, so a response
 * produced by the previous runtime cannot mutate the current runtime's live or
 * global session state. A session the server already archived before the switch
 * stays archived on that runtime and is re-read from the server the next time
 * the runtime is loaded.
 */
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
    const snapshots = removeSessionFromLiveStores(sessionId, sessionDirectory, true)
    removeGlobalSessionStatuses([sessionId])
    invalidateSessionLoads(sessionId, [...snapshots.map((snapshot) => snapshot.directory), sessionDirectory])
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
  /**
   * Runtime key captured when the batch was confirmed. When supplied, the batch
   * stops as soon as the active runtime differs.
   */
  expectedRuntimeKey?: string
}

/**
 * Archive several sessions, preserving partial results.
 *
 * Sessions that carry no review or btw link are archived by their directory's
 * server in one request, and the whole answer is reconciled with a single store
 * write. The remainder — review sessions, btw forks, sessions with an active
 * btw fork, and any session this client does not hold — keep the per-session
 * path, because unlinking a partner is UI-owned work that reads and rewrites
 * another session's metadata.
 *
 * One failed session never blocks or erases the others: it is reported in
 * `failedIds` while the remaining IDs are still attempted. When
 * `expectedRuntimeKey` is supplied and the runtime changes mid-batch, the
 * already-confirmed sessions stay in `archivedIds` and every ID that was not
 * confirmed on the captured runtime is reported in `failedIds`, so callers keep
 * showing the existing partial-failure feedback instead of silently dropping
 * work.
 */
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
  return links?.kind === "review" || links?.kind === "btw" || Boolean(links?.btwSessionID)
}

/**
 * Split the requested IDs into per-directory server batches and the sessions
 * that must be archived individually.
 *
 * Link classification reads this client's session records rather than
 * refetching each session: those records are kept current by the same
 * `session.updated` events that publish a link created anywhere else, so a
 * fetch per session would buy no authority the store does not already have.
 * A session this client does not hold is classified as individual, which
 * restores the per-session fetch for exactly the cases where the store has
 * nothing to say.
 */
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

/**
 * Reconcile a server-confirmed archive batch with one write per store.
 *
 * This mirrors what `archiveSession` does for a single session — drop it from
 * the live directory stores, invalidate its cached messages, move it to the
 * archived bucket, and clear it if it was open — with the per-session store
 * notifications collapsed into one.
 */
function commitArchivedSessions(stamps: SessionArchiveStamp[], directory: string): void {
  if (stamps.length === 0) return

  const ids = stamps.map((stamp) => stamp.id)
  const archived = stamps.flatMap((stamp) => withArchivedAt(stamp.id, stamp.archivedAt) ?? [])
  const snapshots = removeSessionsFromLiveStores(ids, directory, true)
  removeGlobalSessionStatuses(ids)
  const directories = [...snapshots.map((snapshot) => snapshot.directory), directory]
  for (const id of ids) invalidateSessionLoads(id, directories)

  useGlobalSessionsStore.getState().upsertSessions(archived)

  const ui = useSessionUIStore.getState()
  if (ui.currentSessionId && ids.includes(ui.currentSessionId)) ui.setCurrentSession(null)
}

/**
 * Restore one archived session back to the active list.
 *
 * Same contract as `archiveSession`: waits for server confirmation before
 * reconciling stores, and rejects stale runtimes so a response produced by a
 * previous runtime cannot mutate the current runtime's state. Archive state is
 * OpenChamber's own (OpenCode has no route for it), so this goes to the
 * OpenChamber unarchive route rather than the OpenCode client.
 *
 * A subsession is the agent's, not the user's: it is never restored on its
 * own. Restoring a top-level session brings its archived subsessions back with
 * it, so the agent runs it holds are whole again.
 */
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
  if (useGlobalSessionsStore.getState().entityById.get(rootId)?.parentSessionId) {
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
          const invalidated: Record<string, true> = { ...(current.sessionStatusInvalidated ?? {}) }
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
  /**
   * Runtime key captured when the batch was confirmed. When supplied, the batch
   * stops as soon as the active runtime differs.
   */
  expectedRuntimeKey?: string
  /**
   * Undo of an archive that just happened: put back exactly the sessions it
   * moved, subsessions included. Without it a subsession is only restored
   * with its parent.
   */
  undo?: boolean
}

/**
 * Restore several archived sessions sequentially, preserving partial results.
 *
 * One failed session never blocks or erases the others: it is reported in
 * `failedIds` while the remaining IDs are still attempted. When
 * `expectedRuntimeKey` is supplied and the runtime changes mid-batch, the
 * already-confirmed sessions stay in `restoredIds` and every ID that was not
 * confirmed on the captured runtime is reported in `failedIds`, so callers keep
 * showing truthful partial-failure feedback.
 */
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
  const result = await canonicalClient.patchSessionMetadata(sessionId, { changes: { title } })
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  options?.signal?.throwIfAborted()
  if (result.sessionId !== sessionId) throw new Error("Title response identified another session")
  publishCanonicalMetadata(current, result)
}

// ---------------------------------------------------------------------------
// Retained review-flow send boundary — Task 16 owns its transport cutover.
// ---------------------------------------------------------------------------

/**
 * Preserve the review-flow call contract without manufacturing native history.
 * Its callback still accepts a legacy transport correlation ID; that ID is
 * never installed as a canonical message or used to guess an accepted run.
 * Canonical history is reconciled only from an authoritative snapshot.
 */
export async function optimisticSend(input: {
  runtimeKey?: string
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
  send: (messageID: string, context: SyntheticContextInput[]) => Promise<void>
}): Promise<void> {
  if (!_optimisticAdd || !_optimisticRemove) {
    throw new Error("Optimistic refs not set — is useSync() mounted?")
  }
  const runtimeKey = input.runtimeKey ?? getRuntimeKey()
  const assertRuntimeUnchanged = () => {
    if (isStaleRuntime(runtimeKey)) throw new Error("Message was not sent because the runtime changed.")
  }
  assertRuntimeUnchanged()
  await waitForConnectionOrThrow()
  assertRuntimeUnchanged()
  input.beforeOptimisticInsert?.()
  const directory = input.directory ?? getSessionDirectory(input.sessionId)
  const context = (input.context ?? []).filter((item) => item.text.trim())
  const leading = await input.leadingContext
  assertRuntimeUnchanged()
  if (leading?.text.trim()) context.unshift(leading)
  // This is the existing callback's transport correlation token, not a native
  // message identity. The native service allocates all message/turn/part IDs.
  const correlationId = ascendingId("msg")
  input.onMessageID?.(correlationId)
  input.appendSubmissions?.()
  try {
    await input.send(correlationId, context)
  } catch (error) {
    if (!isStaleRuntime(runtimeKey)) {
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
    const messages = directory ? _childStores?.getChild(directory)?.getState().message[input.sessionId] : undefined
    for (const message of messages ?? []) {
      _optimisticConfirm?.({ sessionId: input.sessionId, directory, messageId: message.messageId })
    }
    input.onOptimisticInsert?.()
  } catch (error) {
    if (isStaleRuntime(runtimeKey)) throw error
    console.warn("[session-actions] accepted review send history refresh failed", error)
  }
}

// ---------------------------------------------------------------------------
// Abort
// ---------------------------------------------------------------------------

export async function abortCurrentOperation(sessionId: string): Promise<void> {
  const runtimeKey = getRuntimeKey()
  const snapshot = await canonicalClient.getSnapshot(sessionId)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  if (snapshot.session.sessionId !== sessionId) throw new Error("Snapshot response identified another session")
  if (!snapshot.activeRun) return
  const result = await canonicalClient.abortSession(sessionId, snapshot.activeRun.runId)
  if (isStaleRuntime(runtimeKey)) throw new Error("runtime changed")
  if (result.run.sessionId !== sessionId || result.run.runId !== snapshot.activeRun.runId) throw new Error("Abort response identified another run")
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function respondToPermission(
  sessionId: string,
  requestId: string,
  response: "once" | "always" | "reject",
  _directoryOverride?: string,
): Promise<void> {
  const runtimeKey = getRuntimeKey()
  await waitForConnectionOrThrow()
  const request = await readPendingApproval(sessionId, requestId, runtimeKey)
  await submitApproval(request, response, runtimeKey)
}

export async function dismissPermission(sessionId: string, requestId: string): Promise<void> {
  await respondToPermission(sessionId, requestId, "reject")
}

/** Reject pending subtree approvals once, restoring unresolved cards on failure. */
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

// ---------------------------------------------------------------------------
// Forms (the agent asking the user for input)
// ---------------------------------------------------------------------------

/** One filled-in form: every field the agent declared, keyed by field key. */
export type FormAnswer = Record<string, string | number | boolean | string[]>

export async function replyToForm(sessionId: string, formId: string, answer: FormAnswer): Promise<void> {
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

// ---------------------------------------------------------------------------
// Message history
// ---------------------------------------------------------------------------

/**
 * The native service has no revert/stage/commit operation. Reject before
 * mutating history, attachments or composer state; never fall back to OpenCode.
 */
export async function revertToMessage(_sessionId: string, _messageId: string): Promise<void> {
  throw unsupportedSessionControl("reverting session history")
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
    const goal = inherited.openchamber?.goal
    if (!goal?.id || !goal.objectiveFile) return
    const objective = await fetchGoalObjectiveContent(sourceSessionId)
    if (isStaleRuntime(expectedRuntimeKey) || objective === null) return
    const current = await canonicalClient.getSessionMetadata(forkedSession.sessionId)
    if (isStaleRuntime(expectedRuntimeKey) || current.metadata?.openchamber?.goal?.id !== goal.id) return
    const written = await writeGoalObjectiveFile(forkedSession.sessionId, objective)
    if (isStaleRuntime(expectedRuntimeKey)) return
    if (!written) await patchSessionMetadata(forkedSession.sessionId, directory, (metadata) => {
      const native = SessionMetadataSchema.parse(metadata)
      if (native.openchamber?.goal?.id !== goal.id) return metadata
      return { ...native, openchamber: { ...native.openchamber, goal: { ...native.openchamber.goal, objective, objectiveFile: false } } }
    }, expectedRuntimeKey)
  } catch (error) {
    if (!isStaleRuntime(expectedRuntimeKey)) console.warn("[session-actions] fork metadata inheritance failed", error)
  }
}

/**
 * Records that start something new after a turn. OpenCode 1 carried a
 * compaction and a shell run as user messages; OpenCode 2 gives them their own
 * roles, so they have to be named here or a fork after an answer copies them.
 */
const TURN_BOUNDARY_ROLES = new Set<Message["role"]>(["user", "compaction", "shell"])

const isTurnBoundary = (message: Message): boolean =>
  TURN_BOUNDARY_ROLES.has(message.role)
  || readSubagentRun(message) !== undefined
  || readDispatchedSessionResult(message) !== undefined

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

/** The session has no finished turn yet, so a fork would copy nothing stable. */
export class NothingToForkError extends Error {
  constructor() {
    super("No completed turn to fork from")
    this.name = "NothingToForkError"
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
  for (;;) {
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

/** Fork the native selected branch including the user message; leave both composers unchanged. */
export async function forkFromMessage(sessionId: string, messageId: string): Promise<void> {
  await forkAfterMessage(sessionId, messageId)
}

export async function fetchMessagesForSession(sessionID: string, directory?: string | null): Promise<void> {
  const resolvedDir = directory ?? dir()
  if (!resolvedDir) return
  await getImperativeSessionMessageLoader()?.ensure(
    { directory: resolvedDir, sessionId },
    { reason: "navigation" },
  )
}
