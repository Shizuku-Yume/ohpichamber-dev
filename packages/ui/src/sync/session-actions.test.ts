<<<<<<< HEAD
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import type { ApprovalRequest, PromptRequest, Run, Session, SessionDeleteAck, SessionSnapshot, Message, Turn } from "@openchamber/agent-contract"
import { CanonicalEventSchema, SessionMetadataSchema } from "@openchamber/agent-contract"
import { z } from "zod"
import { CanonicalApiError, canonicalClient } from "@/api/canonicalClient"
||||||| bc50ba56aa
import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test"
import type { PermissionRequest } from "@/types/permission"
import type { FormRequest } from "@/lib/opencode/model"
import type { InputState } from "./input-store"

const transportErrors = await import("@/lib/relay/transport-error")

// Records the client calls the actions make. The actions talk to
// `opencodeClient` only: OpenCode's own SDK never reaches this layer.
const replyCalls: Array<{ method: string; params: Record<string, unknown> }> = []
const registeredSessionDirectories: Array<{ sessionID: string; directory: string }> = []
let formReplyError: unknown | null = null
let selectionApplyError: unknown | null = null
let selectionApplyGate: (() => Promise<void>) | null = null
let formReplyGate: (() => void) | null = null
let agentUnavailableForSelection = false
let formCancelError: unknown | null = null
let permissionReplyError: unknown | null = null
const sessionMessageRecords = new Map<string, Array<{ info: Message; parts: Part[] }>>()
// Optional cursor pages for getSessionMessages: the request's cursor selects
// the page by index, so a paged lookup can be pinned without the flat records.
let cursorMessagePages: Array<{ items: Array<{ info: Message; parts: Part[] }>; cursor: { next?: string } }> | null = null
const sessionRecords = new Map<string, Session>()
const failingRevertSessionIds = new Set<string>()
let commitRevertError: Error | null = null
let sessionDeleteError: unknown | null = null
let sessionForkResult: Session | null = null
let sessionForkError: Error | null = null
let beforeSessionForkResolve: (() => void) | null = null
const selectedSessions: Array<{ sessionId: string | null; directoryHint?: string | null }> = []
let beforeSessionDeleteResolve: ((sessionId: string) => void) | null = null
// Lets a test switch runtime while a session read is in flight.
let beforeSessionGetResolve: (() => void) | null = null
const sessionMoveErrorsById = new Map<string, Error>()
let globalHasLoaded = true
const deletedChatDirectories: string[] = []
const globalUpsertedSessions: unknown[] = []
const globalUpsertedSessionBatches: Session[][] = []
const globalRemovedSessionIds: string[] = []
// Sessions this client is holding. `archiveSessions` reads them to decide which
// sessions can be archived by the server in one batch.
let globalActiveSessions: Session[] = []
const openchamberRouteRequests: Array<{ path: string; body: Record<string, unknown> }> = []
// Lets a test switch runtime while the archive/unarchive request is in flight.
let beforeArchiveRouteResolve: ((path: string) => void) | null = null
type MockRouteResponse = { status: number; body: unknown }
let archiveBatchResponse: MockRouteResponse = {
  status: 404,
  body: { error: 'not found' },
}
let unarchiveBatchResponse: MockRouteResponse = {
  status: 404,
  body: { error: 'not found' },
}
let linksRouteResponse: MockRouteResponse = {
  status: 404,
  body: { error: 'not found' },
}
let activeStatusSnapshot: Record<string, SessionStatus> | null = {}
let readActiveStatusSnapshot: (directory?: string | null) => Promise<Record<string, SessionStatus> | null> = async () => activeStatusSnapshot
const deletedCleanupIdentities: Array<{ runtimeKey: string; directory: string; sessionId: string }> = []
const movedSessionDirectories: Array<{ sessionID: string; directory: string }> = []
const globalArchivedSessions: Session[] = []
let runtimeKey = "default-runtime"
let runtimeGeneration = 0
const permissionPolicy = new Map<string, boolean>()
let permissionPolicyRevision = 0
const goalObjectives = new Map<string, string>()
const AMBIGUOUS_TRANSPORT_FAILURE = Symbol("ambiguous-transport-failure")

const notFound = (kind: string) => Object.assign(new Error(`${kind}NotFoundError`), { status: 404 })

const sdkClient = {}

mock.module("@/lib/opencode/client", () => ({
  isOpencodeNotFound: (error: unknown) => error instanceof Error && "status" in error && error.status === 404,
  ascendingId: (prefix: string) => `${prefix}_${(idCounter += 1).toString(16).padStart(12, "0")}`,
  opencodeClient: {
    getDirectory: () => "/test/project",
    getSdkClient: () => sdkClient,
    captureSessionCleanup: async () => async () => undefined,
    getActiveSessionStatuses: mock((directory?: string | null) => readActiveStatusSnapshot(directory)),
    getSession: mock(async (sessionId: string, directory?: string | null): Promise<Session> => {
      replyCalls.push({ method: "session.get", params: { sessionID: sessionId, directory } })
      beforeSessionGetResolve?.()
      const record = sessionRecords.get(sessionId)
      if (!record) throw notFound("Session")
      return record
    }),
    getSessionMessages: mock(async (
      sessionId: string,
      options?: { limit?: number; cursor?: string },
      directory?: string | null,
    ) => {
      replyCalls.push({ method: "session.messages", params: { sessionID: sessionId, directory, limit: options?.limit, cursor: options?.cursor } })
      const page = cursorMessagePages ? cursorMessagePages[Number(options?.cursor ?? "0")] : undefined
      if (page) return page
      return { items: sessionMessageRecords.get(sessionId) ?? [], cursor: {} }
    }),
    createSession: mock(async (params: Record<string, unknown>, directory?: string | null): Promise<Session> => {
      replyCalls.push({ method: "session.create", params: { ...params, directory } })
      return sessionRecords.get("created") ?? ({ id: "created" } as Session)
    }),
    deleteSession: mock(async (sessionId: string, directory?: string | null) => {
      replyCalls.push({ method: "session.delete", params: { sessionID: sessionId, directory } })
      // Lets a test switch runtime while the delete is in flight, so the action
      // observes the change only after awaiting (or catching) the response.
      beforeSessionDeleteResolve?.(sessionId)
      if (sessionDeleteError) throw sessionDeleteError
      return true
    }),
    renameSession: mock(async (sessionId: string, title: string, directory?: string | null) => {
      replyCalls.push({ method: "session.rename", params: { sessionID: sessionId, title, directory } })
      const record = sessionRecords.get(sessionId)
      if (record) sessionRecords.set(sessionId, { ...record, title })
    }),
    moveSession: mock(async (sessionId: string, directory: string) => {
      replyCalls.push({ method: "session.move", params: { sessionID: sessionId, directory } })
      const error = sessionMoveErrorsById.get(sessionId)
      if (error) throw error
    }),
    abortSession: mock(async (sessionId: string, directory?: string | null) => {
      replyCalls.push({ method: "session.abort", params: { sessionID: sessionId, directory } })
      return true
    }),
    stageRevert: mock(async (sessionId: string, messageId: string, options?: { directory?: string | null }) => {
      replyCalls.push({
        method: "session.revert.stage",
        params: { sessionID: sessionId, messageID: messageId, directory: options?.directory },
      })
      if (failingRevertSessionIds.has(sessionId)) throw new Error("session.revert.stage failed (500): rejected")
      // Mirror the server: staging records the marker on the session, which is
      // what the action re-reads through `getSession` afterwards.
      const record = sessionRecords.get(sessionId)
      sessionRecords.set(sessionId, { ...(record ?? sessionFixture(sessionId)), revert: { messageID: messageId } })
      return { messageID: messageId }
    }),
    commitRevert: mock(async () => { if (commitRevertError) throw commitRevertError }),
    forkSession: mock(async (
      sessionId: string,
      options?: { before?: string; directory?: string | null },
    ): Promise<Session> => {
      replyCalls.push({
        method: "session.fork",
        params: { sessionID: sessionId, messageID: options?.before, directory: options?.directory },
      })
      beforeSessionForkResolve?.()
      if (sessionForkError) throw sessionForkError
      if (!sessionForkResult) throw new Error("Missing fork session fixture")
      return sessionForkResult
    }),
    replyToPermission: mock(async (
      sessionId: string,
      requestId: string,
      reply: string,
      options?: { directory?: string | null },
    ) => {
      replyCalls.push({
        method: "permission.reply",
        params: { sessionID: sessionId, requestID: requestId, reply, directory: options?.directory },
      })
      if (permissionReplyError) throw permissionReplyError
      return true
    }),
    replyToForm: mock(async (
      sessionId: string,
      formId: string,
      answer: Record<string, unknown>,
      directory?: string | null,
    ) => {
      replyCalls.push({ method: "form.reply", params: { sessionID: sessionId, formID: formId, answer, directory } })
      formReplyGate?.()
      if (formReplyError) throw formReplyError
      return true
    }),
    applySendSelection: mock(async (
      sessionId: string,
      selection: { model?: { providerID: string; id: string; variant?: string | null }; agent?: string },
      directory?: string | null,
      _runtimeKey?: string,
    ) => {
      // The real entry checks the agent against the folder's list before it
      // switches anything; mirror that so the unavailable-agent case behaves.
      if (selection.agent && agentUnavailableForSelection) throw new AgentUnavailableError(selection.agent, directory ?? undefined)
      if (selectionApplyError) throw selectionApplyError
      await selectionApplyGate?.()
      if (selection.model || selection.agent) {
        replyCalls.push({ method: "selection.apply", params: { sessionID: sessionId, selection, directory } })
      }
    }),
    cancelForm: mock(async (sessionId: string, formId: string, directory?: string | null) => {
      replyCalls.push({ method: "form.cancel", params: { sessionID: sessionId, formID: formId, directory } })
      if (formCancelError) throw formCancelError
      return true
    }),
  },
}))

let idCounter = 0

// Mock useConfigStore. The composer selection fields are configurable per
// test: the form reply applies whatever the composer now shows (#6053).
type ComposerSelectionState = {
  currentProviderId: string
  currentModelId: string
  currentVariant?: string
  variantOverride?: string | null
  currentAgentName?: string
}
let configState: ComposerSelectionState = { currentProviderId: "", currentModelId: "" }
// Agents listed in the folder catalog for the current test; empty by default
// (nothing listed) so the unchanged-agent-not-in-catalog case passes through.
let listedAgents: string[] = []
mock.module("@/stores/useConfigStore", () => ({
  useConfigStore: {
    getState: () => ({
      isConnected: true,
      hasEverConnected: true,
      currentProviderId: configState.currentProviderId,
      currentModelId: configState.currentModelId,
      currentVariant: configState.currentVariant,
      currentVariantSelection: { override: configState.variantOverride },
      currentAgentName: configState.currentAgentName,
    }),
  },
  selectConfigAgentsForDirectory: () => listedAgents.map((id) => ({ id })),
  selectCatalogLoadedForDirectory: () => true,
}))

// The session the main chat shows; the composer in the config store is its own.
let mainSessionId: string | null = null

// Mock useSessionUIStore
type RecordedSend = {
  content: string
  providerID: string
  modelID: string
  agent?: string
  variant?: string | null
  queuedGoal?: null
  target?: { runtimeKey: string; sessionId: string; directory: string }
}
const sendMessageCalls: RecordedSend[] = []
let sendMessageBehavior: () => Promise<void> = async () => {}

mock.module("./session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({
      getDirectoryForSession: (sessionId: string) => {
        if (sessionId === "session-a") return "/test/project"
        if (sessionId === "session-b") return "/other/project"
        return null
      },
      currentSessionId: mainSessionId,
      setCurrentSession: (sessionId: string | null, directoryHint?: string | null) => {
        selectedSessions.push({ sessionId, directoryHint })
      },
      markSessionAsOpenChamberCreated: () => {},
      setWorktreeMetadata: () => {},
      setSessionDirectory: (sessionID: string, directory: string) => {
        movedSessionDirectories.push({ sessionID, directory })
      },
      sendMessage: async (
        content: string,
        providerID: string,
        modelID: string,
        agent?: string,
        attachments?: void,
        agentMentionName?: void,
        additionalParts?: void,
        variant?: string | null,
        inputMode?: void,
        options?: { userInitiated?: boolean; queuedGoal?: null; target?: { runtimeKey: string; sessionId: string; directory: string } },
      ) => {
        sendMessageCalls.push({ content, providerID, modelID, agent, variant, queuedGoal: options?.queuedGoal, target: options?.target })
        await sendMessageBehavior()
      },
    }),
  },
}))

// Mock useSelectionStore (the model fallback for a recovered answer, and a
// session's own picks for a form reply)
const settledModelPicks: string[] = []
const selectionPicks = {
  models: new Map<string, { providerId: string; modelId: string }>(),
  agents: new Map<string, string>(),
  efforts: new Map<string, string | null>(),
  switched: false,
  settled: settledModelPicks,
}
mock.module("./selection-store", () => ({
  useSelectionStore: {
    getState: () => ({
      getSessionModelSelection: () => null,
      getSessionAgentSelection: () => null,
      getSessionModelPick: (sessionId: string) => selectionPicks.models.get(sessionId) ?? null,
      getSessionAgentPick: (sessionId: string) => selectionPicks.agents.get(sessionId) ?? null,
      getAgentModelVariantForSession: (sessionId: string, agent: string, providerId: string, modelId: string) =>
        selectionPicks.efforts.get(`${sessionId}/${agent}/${providerId}/${modelId}`),
      isSessionModelSwitched: () => selectionPicks.switched,
      captureSessionModelPickSettlement: (sessionId: string, providerId: string, modelId: string) => () => {
        selectionPicks.settled.push(`${sessionId}:${providerId}/${modelId}`)
      },
    }),
  },
}))

// Mock useInputStore
const inputState: Pick<InputState,
  "pendingComposerRestore" | "pendingInputText" | "pendingInputMode" | "pendingInputTarget" | "pendingSessionRestores" | "setPendingSessionRestore" | "attachedFiles"
  | "clearAttachedFiles" | "addRestoredAttachment" | "getAttachedFiles" | "setAttachedFiles"
> = {
  pendingComposerRestore: null,
  pendingInputText: "",
  pendingInputMode: "replace",
  pendingInputTarget: null,
  pendingSessionRestores: new Map(),
  setPendingSessionRestore: (sessionId, text) => {
    if (text === null) inputState.pendingSessionRestores.delete(sessionId)
    else inputState.pendingSessionRestores.set(sessionId, text)
  },
  attachedFiles: [],
  clearAttachedFiles: () => {
    inputState.attachedFiles = []
  },
  setAttachedFiles: (files) => {
    inputState.attachedFiles = files
  },
  getAttachedFiles: () => inputState.attachedFiles,
  addRestoredAttachment: (attachment) => {
    inputState.attachedFiles = [...inputState.attachedFiles, {
      id: attachment.url,
      file: new File([], attachment.filename, { type: attachment.mimeType }),
      dataUrl: attachment.url,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
      size: 0,
      source: "server",
    }]
  },
}

mock.module("./input-store", () => ({
  useInputStore: {
    getState: () => inputState,
    setState: (patch: Partial<typeof inputState>) => Object.assign(inputState, patch),
  },
}))

mock.module("@/stores/useInlineCommentDraftStore", () => ({
  useInlineCommentDraftStore: {
    getState: () => ({
      getDrafts: () => [],
      clearDrafts: () => {},
      restoreDrafts: () => {},
      addDraft: () => {},
    }),
  },
}))

mock.module("@/lib/messages/contextParts", () => ({
  draftFromContextPayload: () => null,
  readContextPart: () => null,
}))

mock.module("@/stores/useGlobalSessionsStore", () => ({
  resolveGlobalSessionDirectory: (session: SessionWithDirectory) => session.directory ?? session.project?.worktree ?? null,
  mergeSessionDirectoryMetadata: (incoming: Session, existing?: SessionWithDirectory | null): SessionWithDirectory => {
    if (!existing) return incoming as SessionWithDirectory
    const next = { ...(incoming as SessionWithDirectory) }
    if (!next.directory && existing.directory) next.directory = existing.directory
    if (!next.project && existing.project) next.project = existing.project
    if (next.project && !next.project.worktree && existing.project?.worktree) {
      next.project = { ...next.project, worktree: existing.project.worktree }
    }
    return next
  },
  useGlobalSessionsStore: {
    getState: () => ({
      activeSessions: globalActiveSessions,
      archivedSessions: globalArchivedSessions,
      entityById: new Map([...globalActiveSessions, ...globalArchivedSessions].map((session) => [session.id, session])),
      hasLoaded: globalHasLoaded,
      upsertSession: (session: unknown) => {
        globalUpsertedSessions.push(session)
      },
      upsertSessions: (sessions: Session[]) => {
        globalUpsertedSessionBatches.push(sessions)
        globalUpsertedSessions.push(...sessions)
      },
      removeSessions: (ids: Iterable<string>) => {
        globalRemovedSessionIds.push(...ids)
      },
    }),
  },
}))

mock.module("@/lib/runtime-fetch", () => ({
  runtimeFetch: async (path: string, init?: { body?: string }) => {
    const payload = JSON.parse(String(init?.body ?? "{}"))
    openchamberRouteRequests.push({ path, body: payload })
    beforeArchiveRouteResolve?.(path)
    if (path.startsWith("/api/goals/objective/")) {
      const sessionId = path.slice("/api/goals/objective/".length)
      if (typeof payload.content === "string") goalObjectives.set(sessionId, payload.content)
      return Response.json({ content: goalObjectives.get(sessionId) })
    }
    if (path.startsWith("/api/permission-auto-accept")) {
      const sessionId = path.split("/sessions/")[1]
      if (sessionId) {
        permissionPolicy.set(decodeURIComponent(sessionId), payload.enabled)
        permissionPolicyRevision += 1
      }
      return Response.json({ sessions: Object.fromEntries(permissionPolicy), revision: permissionPolicyRevision })
    }
    const answer = path.endsWith("/unarchive")
      ? unarchiveBatchResponse
      : path.endsWith("/links")
        ? linksRouteResponse
        : archiveBatchResponse
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    })
  },
}))

mock.module("./global-session-status", () => ({
  useGlobalSessionStatusStore: {
    getState: () => ({
      statusById: new Map<string, { type: string }>(),
    }),
  },
}))

mock.module("./session-message-loader", () => ({
  getImperativeSessionMessageLoader: () => ({
    invalidateSession: () => {},
    ensure: async () => {},
    refreshTail: async () => {},
    initializeCreatedSession: () => {},
    getSnapshot: () => ({ status: "ready" as const }),
  }),
}))

mock.module("../lib/runtime-switch", () => ({
  getRuntimeApiBaseUrl: () => "http://session-actions.test",
  getRuntimeKey: () => runtimeKey,
  captureRuntimeInstance: () => {
    const captured = runtimeKey
    const generation = runtimeGeneration
    return () => captured === runtimeKey && generation === runtimeGeneration
  },
  switchRuntimeEndpoint: ({ runtimeKey: nextRuntimeKey }: { runtimeKey: string }) => {
    if (nextRuntimeKey !== runtimeKey) runtimeGeneration += 1
    runtimeKey = nextRuntimeKey
  },
  subscribeRuntimeEndpointWillChange: () => () => {},
  subscribeRuntimeEndpointChanged: () => () => {},
}))

mock.module("@/lib/relay/transport-error", () => ({
  ...transportErrors,
  markAmbiguousTransportFailure: (error: Error) => Object.assign(error, { [AMBIGUOUS_TRANSPORT_FAILURE]: true }),
  isAmbiguousTransportFailure: (error: unknown) => Boolean(
    error
    && typeof error === "object"
    && (error as { [AMBIGUOUS_TRANSPORT_FAILURE]?: boolean })[AMBIGUOUS_TRANSPORT_FAILURE],
  ),
}))

mock.module("./send-failure-classification", () => ({
  getErrorStatus: (error: unknown) => {
    if (!error || typeof error !== "object") return null
    const direct = (error as { status?: unknown }).status
    if (typeof direct === "number") return direct
    const response = (error as { response?: { status?: unknown } }).response
    return typeof response?.status === "number" ? response.status : null
  },
  isAmbiguousSendFailure: (error: unknown) => {
    if (error && typeof error === "object" && (error as { [AMBIGUOUS_TRANSPORT_FAILURE]?: boolean })[AMBIGUOUS_TRANSPORT_FAILURE]) {
      return true
    }

    const status = error && typeof error === "object"
      ? ((error as { status?: unknown }).status ?? (error as { response?: { status?: unknown } }).response?.status)
      : undefined
    if (status === 503 || status === 504 || status === 408) return true
    if (error instanceof TypeError) return true
    if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) return true

    const message = error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === "string"
        ? error.toLowerCase()
        : ""
    return message.includes("timeout")
      || message.includes("timed out")
      || message.includes("failed to fetch")
      || message.includes("networkerror")
      || message.includes("network error")
      || message.includes("gateway timeout")
      || message.includes("econnreset")
      || message.includes("socket hang up")
  },
}))

mock.module("@/lib/chatDirectories", () => ({
  deleteChatDirectory: async (directory: string) => {
    deletedChatDirectories.push(directory)
  },
}))

mock.module("./session-deletion-cleanup", () => ({
  cleanupPersistedSessionState: (identity: { runtimeKey: string; directory: string; sessionId: string }) => {
    deletedCleanupIdentities.push(identity)
  },
}))

// Lets a test place a session record where resolveSendSelection reads it.
let directoryStateOverride: ((directory?: string) => State | undefined) | null = null
mock.module("./sync-refs", () => ({
  getAllSyncSessionMap: () => sessionRecords,
  getDirectoryState: (directory?: string) => (directoryStateOverride ? directoryStateOverride(directory) : undefined),
  getSyncSessionDirectory: () => null,
  getAllSyncSessions: () => [],
  registerSessionDirectory: (sessionID: string, directory: string) => {
    registeredSessionDirectories.push({ sessionID, directory })
  },
}))

import { AgentUnavailableError } from "@/lib/opencode/agent-unavailable-error"
=======
import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test"
import type { PermissionRequest } from "@/types/permission"
import type { WorktreeMetadata } from "@/types/worktree"
import type { FormRequest } from "@/lib/opencode/model"
import type { InputState } from "./input-store"

const transportErrors = await import("@/lib/relay/transport-error")

// Records the client calls the actions make. The actions talk to
// `opencodeClient` only: OpenCode's own SDK never reaches this layer.
const replyCalls: Array<{ method: string; params: Record<string, unknown> }> = []
const registeredSessionDirectories: Array<{ sessionID: string; directory: string }> = []
let formReplyError: unknown | null = null
let selectionApplyError: unknown | null = null
let selectionApplyGate: (() => Promise<void>) | null = null
let formReplyGate: (() => void) | null = null
let agentUnavailableForSelection = false
let formCancelError: unknown | null = null
let permissionReplyError: unknown | null = null
const sessionMessageRecords = new Map<string, Array<{ info: Message; parts: Part[] }>>()
// The single-message read; null answers not-found.
let sessionMessageRead: ((sessionID: string, messageID: string) => { info: Message; parts: Part[] } | Promise<{ info: Message; parts: Part[] }>) | null = null
// Optional cursor pages for getSessionMessages: the request's cursor selects
// the page by index, so a paged lookup can be pinned without the flat records.
let cursorMessagePages: Array<{ items: Array<{ info: Message; parts: Part[] }>; cursor: { next?: string } }> | null = null
const sessionRecords = new Map<string, Session>()
// Records the server returns for a session no sync store holds, so a test can
// shape the cache-miss read without the lookup chain finding the record.
const fetchedSessionRecords = new Map<string, Session>()
const failingRevertSessionIds = new Set<string>()
// Stages that reach the server and then reject, as when the response is lost.
const lostStageResponseSessionIds = new Set<string>()
let sessionReadErrorOnce: Error | null = null
let stageRevertGate: Promise<void> | null = null
const stageRevertGates = new Map<string, Promise<void>>()
let messageReadGate: Promise<void> | null = null
let refreshGate: Promise<void> | null = null
let refreshStarted = false
let sessionReadGate: Promise<void> | null = null
let gatedSessionReadStarted = false
let commitRevertError: Error | null = null
let commitRevertCalls = 0
let commitRevertGate: Promise<void> | null = null
let sessionDeleteError: unknown | null = null
let sessionForkResult: Session | null = null
let sessionForkError: Error | null = null
let beforeSessionForkResolve: (() => void) | null = null
const selectedSessions: Array<{ sessionId: string | null; directoryHint?: string | null }> = []
let beforeSessionDeleteResolve: ((sessionId: string) => void) | null = null
// Lets a test switch runtime while a session read is in flight.
let beforeSessionGetResolve: (() => void) | null = null
const sessionMoveErrorsById = new Map<string, Error>()
let globalHasLoaded = true
const deletedChatDirectories: string[] = []
const globalUpsertedSessions: unknown[] = []
const globalUpsertedSessionBatches: Session[][] = []
const globalRemovedSessionIds: string[] = []
// Sessions this client is holding. `archiveSessions` reads them to decide which
// sessions can be archived by the server in one batch.
let globalActiveSessions: Session[] = []
const openchamberRouteRequests: Array<{ path: string; body: Record<string, unknown> }> = []
// Lets a test switch runtime while the archive/unarchive request is in flight.
let beforeArchiveRouteResolve: ((path: string) => void) | null = null
type MockRouteResponse = { status: number; body: unknown }
let archiveBatchResponse: MockRouteResponse = {
  status: 404,
  body: { error: 'not found' },
}
let unarchiveBatchResponse: MockRouteResponse = {
  status: 404,
  body: { error: 'not found' },
}
let linksRouteResponse: MockRouteResponse = {
  status: 404,
  body: { error: 'not found' },
}
let activeStatusSnapshot: Record<string, SessionStatus> | null = {}
let readActiveStatusSnapshot: (directory?: string | null) => Promise<Record<string, SessionStatus> | null> = async () => activeStatusSnapshot
const deletedCleanupIdentities: Array<{ runtimeKey: string; directory: string; sessionId: string }> = []
const movedSessionDirectories: Array<{ sessionID: string; directory: string }> = []
const queueMoves: Array<{ sessionId: string; directory: string }> = []
const tabMoves: Array<{ sessionId: string; directory: string }> = []
const folderMoves: Array<{ sessionId: string; directory: string; worktree: string | null }> = []
const worktreeMetadataCalls: Array<{ sessionID: string; metadata: WorktreeMetadata | null; cwd?: string }> = []
let availableWorktreesByProject = new Map<string, WorktreeMetadata[]>()
const globalArchivedSessions: Session[] = []
let runtimeKey = "default-runtime"
let runtimeGeneration = 0
const permissionPolicy = new Map<string, boolean>()
let permissionPolicyRevision = 0
const goalObjectives = new Map<string, string>()
const AMBIGUOUS_TRANSPORT_FAILURE = Symbol("ambiguous-transport-failure")

const notFound = (kind: string) => Object.assign(new Error(`${kind}NotFoundError`), { status: 404 })

const sdkClient = {}

mock.module("@/lib/opencode/client", () => ({
  isOpencodeNotFound: (error: unknown) => error instanceof Error && "status" in error && error.status === 404,
  ascendingId: (prefix: string) => `${prefix}_${(idCounter += 1).toString(16).padStart(12, "0")}`,
  opencodeClient: {
    getDirectory: () => "/test/project",
    getSdkClient: () => sdkClient,
    captureSessionCleanup: async () => async () => undefined,
    getActiveSessionStatuses: mock((directory?: string | null) => readActiveStatusSnapshot(directory)),
    getSession: mock(async (sessionId: string, directory?: string | null): Promise<Session> => {
      replyCalls.push({ method: "session.get", params: { sessionID: sessionId, directory } })
      beforeSessionGetResolve?.()
      const readError = sessionReadErrorOnce
      if (readError) {
        sessionReadErrorOnce = null
        throw readError
      }
      const record = sessionRecords.get(sessionId) ?? fetchedSessionRecords.get(sessionId)
      const gate = sessionReadGate
      if (gate) {
        sessionReadGate = null
        gatedSessionReadStarted = true
        await gate
      }
      if (!record) throw notFound("Session")
      return record
    }),
    getSessionMessage: mock(async (sessionId: string, messageId: string, directory?: string | null) => {
      replyCalls.push({ method: "session.message", params: { sessionID: sessionId, messageID: messageId, directory } })
      if (!sessionMessageRead) throw notFound("Message")
      return sessionMessageRead(sessionId, messageId)
    }),
    getSessionMessages: mock(async (
      sessionId: string,
      options?: { limit?: number; cursor?: string },
      directory?: string | null,
    ) => {
      replyCalls.push({ method: "session.messages", params: { sessionID: sessionId, directory, limit: options?.limit, cursor: options?.cursor } })
      await messageReadGate
      const page = cursorMessagePages ? cursorMessagePages[Number(options?.cursor ?? "0")] : undefined
      if (page) return page
      return { items: sessionMessageRecords.get(sessionId) ?? [], cursor: {} }
    }),
    createSession: mock(async (params: Record<string, unknown>, directory?: string | null): Promise<Session> => {
      replyCalls.push({ method: "session.create", params: { ...params, directory } })
      return sessionRecords.get("created") ?? ({ id: "created" } as Session)
    }),
    deleteSession: mock(async (sessionId: string, directory?: string | null) => {
      replyCalls.push({ method: "session.delete", params: { sessionID: sessionId, directory } })
      // Lets a test switch runtime while the delete is in flight, so the action
      // observes the change only after awaiting (or catching) the response.
      beforeSessionDeleteResolve?.(sessionId)
      if (sessionDeleteError) throw sessionDeleteError
      return true
    }),
    renameSession: mock(async (sessionId: string, title: string, directory?: string | null) => {
      replyCalls.push({ method: "session.rename", params: { sessionID: sessionId, title, directory } })
      const record = sessionRecords.get(sessionId)
      if (record) sessionRecords.set(sessionId, { ...record, title })
    }),
    moveSession: mock(async (sessionId: string, directory: string) => {
      replyCalls.push({ method: "session.move", params: { sessionID: sessionId, directory } })
      const error = sessionMoveErrorsById.get(sessionId)
      if (error) throw error
    }),
    abortSession: mock(async (sessionId: string, directory?: string | null) => {
      replyCalls.push({ method: "session.abort", params: { sessionID: sessionId, directory } })
      return true
    }),
    stageRevert: mock(async (sessionId: string, messageId: string, options?: { directory?: string | null }) => {
      replyCalls.push({
        method: "session.revert.stage",
        params: { sessionID: sessionId, messageID: messageId, directory: options?.directory },
      })
      await stageRevertGate
      await stageRevertGates.get(sessionId)
      if (failingRevertSessionIds.has(sessionId)) throw new Error("session.revert.stage failed (500): rejected")
      // Mirror the server: staging records the marker on the session, which is
      // what the action re-reads through `getSession` afterwards.
      const record = sessionRecords.get(sessionId)
      sessionRecords.set(sessionId, { ...(record ?? sessionFixture(sessionId)), revert: { messageID: messageId } })
      if (lostStageResponseSessionIds.has(sessionId)) throw new Error("session.revert.stage: network error")
      return { messageID: messageId }
    }),
    commitRevert: mock(async () => { commitRevertCalls++; await commitRevertGate; if (commitRevertError) throw commitRevertError }),
    clearRevert: mock(async (sessionId: string) => {
      const record = sessionRecords.get(sessionId)
      if (record) sessionRecords.set(sessionId, { ...record, revert: undefined })
    }),
    forkSession: mock(async (
      sessionId: string,
      options?: { before?: string; directory?: string | null },
    ): Promise<Session> => {
      replyCalls.push({
        method: "session.fork",
        params: { sessionID: sessionId, messageID: options?.before, directory: options?.directory },
      })
      beforeSessionForkResolve?.()
      if (sessionForkError) throw sessionForkError
      if (!sessionForkResult) throw new Error("Missing fork session fixture")
      return sessionForkResult
    }),
    replyToPermission: mock(async (
      sessionId: string,
      requestId: string,
      reply: string,
      options?: { directory?: string | null },
    ) => {
      replyCalls.push({
        method: "permission.reply",
        params: { sessionID: sessionId, requestID: requestId, reply, directory: options?.directory },
      })
      if (permissionReplyError) throw permissionReplyError
      return true
    }),
    replyToForm: mock(async (
      sessionId: string,
      formId: string,
      answer: Record<string, unknown>,
      directory?: string | null,
    ) => {
      replyCalls.push({ method: "form.reply", params: { sessionID: sessionId, formID: formId, answer, directory } })
      formReplyGate?.()
      if (formReplyError) throw formReplyError
      return true
    }),
    applySendSelection: mock(async (
      sessionId: string,
      selection: { model?: { providerID: string; id: string; variant?: string | null }; agent?: string },
      directory?: string | null,
      _runtimeKey?: string,
    ) => {
      // The real entry checks the agent against the folder's list before it
      // switches anything; mirror that so the unavailable-agent case behaves.
      if (selection.agent && agentUnavailableForSelection) throw new AgentUnavailableError(selection.agent, directory ?? undefined)
      if (selectionApplyError) throw selectionApplyError
      await selectionApplyGate?.()
      if (selection.model || selection.agent) {
        replyCalls.push({ method: "selection.apply", params: { sessionID: sessionId, selection, directory } })
      }
    }),
    cancelForm: mock(async (sessionId: string, formId: string, directory?: string | null, message?: string) => {
      replyCalls.push({ method: "form.cancel", params: { sessionID: sessionId, formID: formId, directory, message } })
      if (formCancelError) throw formCancelError
      return true
    }),
  },
}))

let idCounter = 0

// Mock useConfigStore. The composer selection fields are configurable per
// test: the form reply applies whatever the composer now shows (#6053).
type ComposerSelectionState = {
  currentProviderId: string
  currentModelId: string
  currentVariant?: string
  variantOverride?: string | null
  currentAgentName?: string
}
let configState: ComposerSelectionState = { currentProviderId: "", currentModelId: "" }
// Agents listed in the folder catalog for the current test; empty by default
// (nothing listed) so the unchanged-agent-not-in-catalog case passes through.
let listedAgents: string[] = []
mock.module("@/stores/useConfigStore", () => ({
  useConfigStore: {
    getState: () => ({
      isConnected: true,
      hasEverConnected: true,
      currentProviderId: configState.currentProviderId,
      currentModelId: configState.currentModelId,
      currentVariant: configState.currentVariant,
      currentVariantSelection: { override: configState.variantOverride },
      currentAgentName: configState.currentAgentName,
    }),
  },
  selectConfigAgentsForDirectory: () => listedAgents.map((id) => ({ id })),
  selectCatalogLoadedForDirectory: () => true,
}))

// The session the main chat shows; the composer in the config store is its own.
let mainSessionId: string | null = null

// Mock useSessionUIStore
type RecordedSend = {
  content: string
  providerID: string
  modelID: string
  agent?: string
  variant?: string | null
  queuedGoal?: null
  target?: { runtimeKey: string; sessionId: string; directory: string }
  metadata?: Metadata
}
const sendMessageCalls: RecordedSend[] = []
let sendMessageBehavior: () => Promise<void> = async () => {}

mock.module("./session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({
      getDirectoryForSession: (sessionId: string) => {
        if (sessionId === "session-a") return "/test/project"
        if (sessionId === "session-b") return "/other/project"
        return null
      },
      currentSessionId: mainSessionId,
      setCurrentSession: (sessionId: string | null, directoryHint?: string | null) => {
        selectedSessions.push({ sessionId, directoryHint })
      },
      markSessionAsOpenChamberCreated: () => {},
      availableWorktreesByProject,
      setWorktreeMetadata: (sessionID: string, metadata: WorktreeMetadata | null, cwd?: string) => {
        worktreeMetadataCalls.push({ sessionID, metadata, cwd })
      },
      setSessionDirectory: (sessionID: string, directory: string) => {
        movedSessionDirectories.push({ sessionID, directory })
      },
      sendMessage: async (
        content: string,
        providerID: string,
        modelID: string,
        agent?: string,
        attachments?: void,
        agentMentionName?: void,
        additionalParts?: void,
        variant?: string | null,
        inputMode?: void,
        options?: { userInitiated?: boolean; queuedGoal?: null; target?: { runtimeKey: string; sessionId: string; directory: string }; metadata?: Metadata },
      ) => {
        sendMessageCalls.push({ content, providerID, modelID, agent, variant, queuedGoal: options?.queuedGoal, target: options?.target, metadata: options?.metadata })
        await sendMessageBehavior()
      },
    }),
  },
}))

// Mock useSelectionStore (the model fallback for a recovered answer, and a
// session's own picks for a form reply)
const settledModelPicks: string[] = []
const selectionPicks = {
  models: new Map<string, { providerId: string; modelId: string }>(),
  agents: new Map<string, string>(),
  efforts: new Map<string, string | null>(),
  switched: false,
  settled: settledModelPicks,
}
mock.module("./selection-store", () => ({
  useSelectionStore: {
    getState: () => ({
      getSessionModelSelection: () => null,
      getSessionAgentSelection: () => null,
      getSessionModelPick: (sessionId: string) => selectionPicks.models.get(sessionId) ?? null,
      getSessionAgentPick: (sessionId: string) => selectionPicks.agents.get(sessionId) ?? null,
      getAgentModelVariantForSession: (sessionId: string, agent: string, providerId: string, modelId: string) =>
        selectionPicks.efforts.get(`${sessionId}/${agent}/${providerId}/${modelId}`),
      isSessionModelSwitched: () => selectionPicks.switched,
      captureSessionModelPickSettlement: (sessionId: string, providerId: string, modelId: string) => () => {
        selectionPicks.settled.push(`${sessionId}:${providerId}/${modelId}`)
      },
    }),
  },
}))

// Mock useInputStore
const inputState: Pick<InputState,
  "pendingComposerRestore" | "pendingInputText" | "pendingInputMode" | "pendingInputTarget" | "pendingSessionRestores" | "setPendingSessionRestore" | "attachedFiles"
  | "clearAttachedFiles" | "addRestoredAttachment" | "getAttachedFiles" | "setAttachedFiles"
> = {
  pendingComposerRestore: null,
  pendingInputText: "",
  pendingInputMode: "replace",
  pendingInputTarget: null,
  pendingSessionRestores: new Map(),
  setPendingSessionRestore: (sessionId, text) => {
    if (text === null) inputState.pendingSessionRestores.delete(sessionId)
    else inputState.pendingSessionRestores.set(sessionId, text)
  },
  attachedFiles: [],
  clearAttachedFiles: () => {
    inputState.attachedFiles = []
  },
  setAttachedFiles: (files) => {
    inputState.attachedFiles = files
  },
  getAttachedFiles: () => inputState.attachedFiles,
  addRestoredAttachment: (attachment) => {
    inputState.attachedFiles = [...inputState.attachedFiles, {
      id: attachment.url,
      file: new File([], attachment.filename, { type: attachment.mimeType }),
      dataUrl: attachment.url,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
      size: 0,
      source: "server",
    }]
  },
}

mock.module("./input-store", () => ({
  useInputStore: {
    getState: () => inputState,
    setState: (patch: Partial<typeof inputState>) => Object.assign(inputState, patch),
  },
}))

mock.module("@/stores/useInlineCommentDraftStore", () => ({
  useInlineCommentDraftStore: {
    getState: () => ({
      getDrafts: () => [],
      clearDrafts: () => {},
      restoreDrafts: () => {},
      addDraft: () => {},
    }),
  },
}))

mock.module("@/lib/messages/contextParts", () => ({
  draftFromContextPayload: () => null,
  readContextPart: () => null,
}))

mock.module("@/stores/messageQueueStore", () => ({
  createMessageQueueTarget: (sessionId: string, directory: string) => ({ runtimeKey, directory, sessionId }),
  useMessageQueueStore: {
    getState: () => ({
      followSessionMove: (destination: { sessionId: string; directory: string }) => {
        queueMoves.push({ sessionId: destination.sessionId, directory: destination.directory })
      },
    }),
  },
}))

mock.module("@/stores/useSessionFoldersStore", () => ({
  useSessionFoldersStore: {
    getState: () => ({
      followSessionMove: (sessionId: string, directory: string, worktree: string | null) => {
        folderMoves.push({ sessionId, directory, worktree })
      },
    }),
  },
}))

mock.module("@/lib/sessionTabs", () => ({
  followSessionTabMove: (sessionId: string, directory: string) => {
    tabMoves.push({ sessionId, directory })
  },
}))

mock.module("@/stores/useGlobalSessionsStore", () => ({
  resolveGlobalSessionDirectory: (session: SessionWithDirectory) => session.directory ?? session.project?.worktree ?? null,
  mergeSessionDirectoryMetadata: (incoming: Session, existing?: SessionWithDirectory | null): SessionWithDirectory => {
    if (!existing) return incoming as SessionWithDirectory
    const next = { ...(incoming as SessionWithDirectory) }
    if (!next.directory && existing.directory) next.directory = existing.directory
    if (!next.project && existing.project) next.project = existing.project
    if (next.project && !next.project.worktree && existing.project?.worktree) {
      next.project = { ...next.project, worktree: existing.project.worktree }
    }
    return next
  },
  useGlobalSessionsStore: {
    getState: () => ({
      activeSessions: globalActiveSessions,
      archivedSessions: globalArchivedSessions,
      entityById: new Map([...globalActiveSessions, ...globalArchivedSessions].map((session) => [session.id, session])),
      hasLoaded: globalHasLoaded,
      upsertSession: (session: unknown) => {
        globalUpsertedSessions.push(session)
      },
      upsertSessions: (sessions: Session[]) => {
        globalUpsertedSessionBatches.push(sessions)
        globalUpsertedSessions.push(...sessions)
      },
      removeSessions: (ids: Iterable<string>) => {
        globalRemovedSessionIds.push(...ids)
      },
    }),
  },
}))

mock.module("@/lib/runtime-fetch", () => ({
  runtimeFetch: async (path: string, init?: { body?: string }) => {
    const payload = JSON.parse(String(init?.body ?? "{}"))
    openchamberRouteRequests.push({ path, body: payload })
    beforeArchiveRouteResolve?.(path)
    if (path.startsWith("/api/goals/objective/")) {
      const sessionId = path.slice("/api/goals/objective/".length)
      if (typeof payload.content === "string") goalObjectives.set(sessionId, payload.content)
      return Response.json({ content: goalObjectives.get(sessionId) })
    }
    if (path.startsWith("/api/permission-auto-accept")) {
      const sessionId = path.split("/sessions/")[1]
      if (sessionId) {
        permissionPolicy.set(decodeURIComponent(sessionId), payload.enabled)
        permissionPolicyRevision += 1
      }
      return Response.json({ sessions: Object.fromEntries(permissionPolicy), revision: permissionPolicyRevision })
    }
    const answer = path.endsWith("/unarchive")
      ? unarchiveBatchResponse
      : path.endsWith("/links")
        ? linksRouteResponse
        : archiveBatchResponse
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    })
  },
}))

mock.module("./global-session-status", () => ({
  useGlobalSessionStatusStore: {
    getState: () => ({
      statusById: new Map<string, { type: string }>(),
    }),
  },
}))

mock.module("./session-message-loader", () => ({
  getImperativeSessionMessageLoader: () => ({
    invalidateSession: () => {},
    ensure: async () => {},
    refreshTail: async () => { refreshStarted = true; await refreshGate },
    initializeCreatedSession: () => {},
    getSnapshot: () => ({ status: "ready" as const }),
  }),
}))

mock.module("../lib/runtime-switch", () => ({
  getRuntimeApiBaseUrl: () => "http://session-actions.test",
  getRuntimeKey: () => runtimeKey,
  captureRuntimeInstance: () => {
    const captured = runtimeKey
    const generation = runtimeGeneration
    return () => captured === runtimeKey && generation === runtimeGeneration
  },
  switchRuntimeEndpoint: ({ runtimeKey: nextRuntimeKey }: { runtimeKey: string }) => {
    if (nextRuntimeKey !== runtimeKey) runtimeGeneration += 1
    runtimeKey = nextRuntimeKey
  },
  subscribeRuntimeEndpointWillChange: () => () => {},
  subscribeRuntimeEndpointChanged: () => () => {},
}))

mock.module("@/lib/relay/transport-error", () => ({
  ...transportErrors,
  markAmbiguousTransportFailure: (error: Error) => Object.assign(error, { [AMBIGUOUS_TRANSPORT_FAILURE]: true }),
  isAmbiguousTransportFailure: (error: unknown) => Boolean(
    error
    && typeof error === "object"
    && (error as { [AMBIGUOUS_TRANSPORT_FAILURE]?: boolean })[AMBIGUOUS_TRANSPORT_FAILURE],
  ),
}))

mock.module("./send-failure-classification", () => ({
  getErrorStatus: (error: unknown) => {
    if (!error || typeof error !== "object") return null
    const direct = (error as { status?: unknown }).status
    if (typeof direct === "number") return direct
    const response = (error as { response?: { status?: unknown } }).response
    return typeof response?.status === "number" ? response.status : null
  },
  isAmbiguousSendFailure: (error: unknown) => {
    if (error && typeof error === "object" && (error as { [AMBIGUOUS_TRANSPORT_FAILURE]?: boolean })[AMBIGUOUS_TRANSPORT_FAILURE]) {
      return true
    }

    const status = error && typeof error === "object"
      ? ((error as { status?: unknown }).status ?? (error as { response?: { status?: unknown } }).response?.status)
      : undefined
    if (status === 503 || status === 504 || status === 408) return true
    if (error instanceof TypeError) return true
    if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) return true

    const message = error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === "string"
        ? error.toLowerCase()
        : ""
    return message.includes("timeout")
      || message.includes("timed out")
      || message.includes("failed to fetch")
      || message.includes("networkerror")
      || message.includes("network error")
      || message.includes("gateway timeout")
      || message.includes("econnreset")
      || message.includes("socket hang up")
  },
}))

mock.module("@/lib/chatDirectories", () => ({
  deleteChatDirectory: async (directory: string) => {
    deletedChatDirectories.push(directory)
  },
}))

mock.module("./session-deletion-cleanup", () => ({
  cleanupPersistedSessionState: (identity: { runtimeKey: string; directory: string; sessionId: string }) => {
    deletedCleanupIdentities.push(identity)
  },
}))

// Lets a test place a session record where resolveSendSelection reads it.
let directoryStateOverride: ((directory?: string) => State | undefined) | null = null
mock.module("./sync-refs", () => ({
  getAllSyncSessionMap: () => sessionRecords,
  getDirectoryState: (directory?: string) => (directoryStateOverride ? directoryStateOverride(directory) : undefined),
  getSyncSessionDirectory: () => null,
  getAllSyncSessions: () => [],
  registerSessionDirectory: (sessionID: string, directory: string) => {
    registeredSessionDirectories.push({ sessionID, directory })
  },
}))

import { AgentUnavailableError } from "@/lib/opencode/agent-unavailable-error"
>>>>>>> upstream/main
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from "@/lib/runtime-switch"
<<<<<<< HEAD
import * as chatDirectories from "@/lib/chatDirectories"
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from "@/stores/globalSessions"
import { useConfigStore } from "@/stores/useConfigStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { isSessionPinned, useSessionPinnedStore } from "@/stores/useSessionPinnedStore"
import { ChildStoreManager } from "./child-store"
import { applyDirectoryEvent } from "./event-reducer"
import { replaceGlobalSessionStatusById } from "./global-session-status"
import { resetSessionActionFailures, takeSessionActionFailure } from "./session-action-failures"
import { SessionMessageLoader, setImperativeSessionMessageLoader } from "./session-message-loader"
import { deferred, nativeApproval, nativeClient, nativeHistory, nativeMessage, nativeQuestion, nativeSnapshot } from "./session-message-loader-test-fixtures"
import { useSessionUIStore } from "./session-ui-store"
import { setSyncRefs } from "./sync-refs"
import {
  NothingToForkError, abortCurrentOperation, archiveSession, archiveSessions, cancelForm,
  deleteSession, deleteSessions, dismissOpenFormsForSession, dismissOpenPermissionsForSession,
  dismissPermission, forkAfterMessage, forkFromLastCompletedTurn, forkFromMessage,
  getSessionLastAssistantModel, getSessionLiveActivity, patchSessionMetadata,
  moveSessionToDirectory, reconcileExternallyDeletedSession, refetchSessionMessages, replyToForm, revertToMessage,
  respondToPermission, sendMessage, setActionRefs, setSessionWorkState, optimisticSend, setOptimisticRefs,
  unarchiveSession, unarchiveSessions, updateSessionTitle, setLinkedIssue, addLinkedIssues,
} from "./session-actions"
||||||| bc50ba56aa
import { agentUnavailableFrom } from "./form-request-error"
import { INITIAL_STATE } from "./types"
import type { State } from "./types"
import type { DirectoryStore } from "./child-store"
import type { Message, Part, Session, SessionStatus } from "@/lib/opencode/model"
=======
import { agentUnavailableFrom, isFormRequestNotFoundError } from "./form-request-error"
import { INITIAL_STATE } from "./types"
import type { State } from "./types"
import type { DirectoryStore } from "./child-store"
import type { Message, Metadata, Part, Session, SessionStatus, ToolPart } from "@/lib/opencode/model"
>>>>>>> upstream/main
import type { LinkedIssue } from "@/lib/linkedIssues"
<<<<<<< HEAD
||||||| bc50ba56aa
import { noteQuestionFormSnapshot, resetRecoverableQuestions, useRecoverableQuestionsStore, type RecoveredQuestion } from "./recoverable-questions"
import { buildFormAnswer, type FormValues } from "../components/chat/formCardState"
import { serializeFormAnswerAsMarkdown } from "../components/chat/formSerializers"
=======
import { DEFERRED_ANSWER_LEAD_IN, DEFERRED_QUESTION_NOTE, noteQuestionFormSnapshot, resetRecoverableQuestions, useRecoverableQuestionsStore, type RecoveredQuestion } from "./recoverable-questions"
import { buildFormAnswer, type FormValues } from "../components/chat/formCardState"
import { serializeFormAnswerAsMarkdown } from "../components/chat/formSerializers"
>>>>>>> upstream/main

const originalRuntime = getRuntimeKey()
const originalBase = getRuntimeApiBaseUrl()
const originalUI = useSessionUIStore.getState()
const originalConfig = useConfigStore.getState()
const originalGlobal = useGlobalSessionsStore.getState()
const originalPins = useSessionPinnedStore.getState()
const directory = "/native/actions"
let manager: ChildStoreManager
let loader: SessionMessageLoader | null
let currentDirectory: string

function session(sessionId = "session-a", changes: Partial<Session> = {}): Session {
  return { ...nativeSnapshot(sessionId, []).session, title: "Before", metadata: {}, metadataRevision: "1", archiveRevision: "0", ...changes }
}

function seed(sessions = [session()], ownedDirectory = directory) {
  for (const item of sessions) registerWorkspaceDirectory(item.workspaceId, ownedDirectory)
  const store = manager.ensureChild(ownedDirectory, { bootstrap: false })
  store.setState({ session: sessions.filter(item => item.archivedAt === undefined) })
  useGlobalSessionsStore.getState().upsertSessions(sessions)
  return store
}

function changeRuntime() {
  switchRuntimeEndpoint({ apiBaseUrl: "https://actions-next.test", runtimeKey: "actions-next" })
}

function problem(code: "APPROVAL_NOT_FOUND" | "QUESTION_EXPIRED" | "SESSION_NOT_FOUND") {
  return new CanonicalApiError({ type: `urn:ohpichamber:problem:${code}`, title: "Unavailable", status: 404, detail: "No longer available", code, retryable: false })
}

<<<<<<< HEAD
function archiveResponse(ids: string[], failedIds: string[] = []) {
  return Response.json({ archived: ids.map(id => ({ id, archivedAt: 123 })), failedIds })
}

function restoreResponse(ids: string[], failedIds: string[] = []) {
  return Response.json({ restored: ids.map(id => ({ id, archivedAt: null })), failedIds })
}

/** The unarchive route reads `{ ids }` off the request body. */
const unarchiveRequestSchema = z.object({ ids: z.array(z.string()) })

beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: "https://actions.test", runtimeKey: "actions" })
  resetWorkspaceDirectories()
  replaceGlobalSessionStatusById(new Map())
  resetSessionActionFailures()
  useGlobalSessionsStore.getState().applySnapshot([], [])
  useGlobalSessionsStore.setState({ hasLoaded: true })
  useSessionPinnedStore.setState({ ids: new Set(), touchedAt: {} })
  useConfigStore.setState({ isConnected: true, hasEverConnected: true })
  useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null })
  spyOn(useSessionUIStore.getState(), "setCurrentSession").mockImplementation((sessionId, hint) => {
    useSessionUIStore.setState({ currentSessionId: sessionId, currentSessionDirectory: hint ?? null })
  })
  spyOn(chatDirectories, "deleteChatDirectory").mockResolvedValue(undefined)
  spyOn(canonicalClient, "getSessionMetadata").mockImplementation(async sessionId => ({ sessionId, revision: "0", metadata: null }))
  spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network request"))
  manager = new ChildStoreManager()
  currentDirectory = directory
  loader = null
  setActionRefs(manager, () => currentDirectory)
  setSyncRefs(manager, directory)
  setImperativeSessionMessageLoader(null)
})

afterEach(() => {
  setOptimisticRefs(() => { }, () => { }, () => { })
  setImperativeSessionMessageLoader(null)
  loader?.dispose()
  manager.disposeAll()
  mock.restore()
  replaceGlobalSessionStatusById(new Map())
  resetSessionActionFailures()
  resetWorkspaceDirectories()
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime })
  useSessionUIStore.setState(originalUI)
  useConfigStore.setState(originalConfig)
  useGlobalSessionsStore.setState(originalGlobal)
  useSessionPinnedStore.setState(originalPins)
})

describe("native branch consumer lifecycle", () => {
  test("tail undo and repeated undo work when selected snapshots omit reverted messages, and redo restores the leaf", async () => {
    const first = nativeMessage("session-a", "first", 1)
    const last = nativeMessage("session-a", "last", 2)
    let snapshot = nativeSnapshot("session-a", [first, last])
    const store = seed()
    store.setState({ snapshot: { "session-a": snapshot }, message: { "session-a": snapshot.messages } })
    spyOn(canonicalClient, "getSnapshot").mockImplementation(async () => snapshot)
    const select = spyOn(canonicalClient, "selectSessionBranch").mockImplementation(async (_id, request) => {
      const messages = request.action === "restore" ? [first, last] : request.messageId === "last" ? [first] : []
      snapshot = nativeSnapshot("session-a", messages)
      snapshot.branch = { ...snapshot.branch, branchVersion: String(BigInt(request.branchVersion) + 1n) }
      if (request.action === "revert") snapshot.branch.revert = { messageId: request.messageId }
      return { sessionId: "session-a", branch: snapshot.branch, draft: null }
    })
    await useSessionUIStore.getState().handleSlashUndo("session-a")
    expect(store.getState().message["session-a"]).toEqual([first])
    await useSessionUIStore.getState().handleSlashUndo("session-a")
    expect(store.getState().message["session-a"]).toEqual([])
    await useSessionUIStore.getState().handleSlashRedo("session-a")
    expect(select.mock.calls.map(([, request]) => request.action)).toEqual(["revert", "revert", "restore"])
    expect(select.mock.calls[2]?.[1]).toMatchObject({ branchId: "branch-a", branchVersion: "3" })
    expect(store.getState().message["session-a"]).toEqual([first, last])
||||||| bc50ba56aa
describe("moveSessionToDirectory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    registeredSessionDirectories.length = 0
    movedSessionDirectories.length = 0
    globalUpsertedSessions.length = 0
=======
describe("moveSessionToDirectory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    registeredSessionDirectories.length = 0
    movedSessionDirectories.length = 0
    worktreeMetadataCalls.length = 0
    queueMoves.length = 0
    tabMoves.length = 0
    folderMoves.length = 0
    globalActiveSessions = []
    availableWorktreesByProject = new Map()
    globalUpsertedSessions.length = 0
>>>>>>> upstream/main
  })

  test("a confirmed selection followed by failed snapshot recovery preserves prior authoritative data", async () => {
    const store = seed()
    const prior = nativeSnapshot()
    store.setState({ snapshot: { "session-a": prior }, message: { "session-a": prior.messages }, permission: { "session-a": [nativeApproval()] } })
    spyOn(canonicalClient, "getSnapshot").mockResolvedValueOnce(prior).mockRejectedValueOnce(new Error("snapshot offline"))
    spyOn(canonicalClient, "selectSessionBranch").mockResolvedValue({ sessionId: "session-a", branch: { ...prior.branch, branchVersion: "2", revert: { messageId: "message-a" } }, draft: null })
    await expect(revertToMessage("session-a", "message-a")).rejects.toThrow("snapshot offline")
    expect(store.getState().snapshot["session-a"]).toBe(prior)
    expect(store.getState().message["session-a"]).toBe(prior.messages)
    expect(store.getState().permission["session-a"]).toEqual([nativeApproval()])
  })

  test("branch acceptance publishes the selected snapshot through loader recovery and establishes history coverage", async () => {
    const store = seed()
    const prior = nativeSnapshot()
    const selected = nativeSnapshot("session-a", [])
    selected.branch = { ...selected.branch, branchVersion: "2", revert: { messageId: "message-a" } }
    const snapshots: SessionSnapshot[] = []
    loader = new SessionMessageLoader(manager, { runtimeKey: getRuntimeKey(), client: nativeClient(), onSnapshot: (_target, snapshot) => { snapshots.push(snapshot) } })
    setImperativeSessionMessageLoader(loader)
    spyOn(canonicalClient, "getSnapshot").mockResolvedValueOnce(prior).mockResolvedValueOnce(selected)
    spyOn(canonicalClient, "selectSessionBranch").mockResolvedValue({ sessionId: "session-a", branch: selected.branch, draft: null })
    await revertToMessage("session-a", "message-a")
    expect(snapshots).toEqual([selected])
    expect(loader.getSnapshot({ directory, sessionId: "session-a" })).toMatchObject({ status: "ready", resolved: true, complete: true })
    expect(store.getState().snapshot["session-a"]?.branch).toEqual(selected.branch)
  })
  test("relocation accepts destination snapshot through loader publication and native history coverage", async () => {
    const source = seed()
    source.setState({ snapshot: { "session-a": nativeSnapshot() }, message: { "session-a": [nativeMessage()] } })
    const destination = "/native/destination"
    const workspace = { workspaceId: "workspace-destination", projectId: "project-a", name: "Destination" }
    const moved = session("session-a", { workspaceId: workspace.workspaceId, epoch: "epoch-destination" })
    const snapshot = nativeSnapshot()
    snapshot.session = moved
    snapshot.cursor = "epoch-destination:4"
    snapshot.window.hasEarlier = true
    const history = spyOn(canonicalClient, "getHistory").mockImplementation(async (_sessionId, options) => options?.cursor === "older-page"
      ? nativeHistory([], null, snapshot)
      : nativeHistory(snapshot.messages, "older-page", snapshot))
    const published: Array<{ directory: string; snapshot: SessionSnapshot }> = []
    loader = new SessionMessageLoader(manager, {
      runtimeKey: getRuntimeKey(), client: canonicalClient,
      onSnapshot: (target, accepted) => { published.push({ directory: target.directory, snapshot: accepted }) }
    })
    setImperativeSessionMessageLoader(loader)
    spyOn(canonicalClient, "resolveWorkspace").mockResolvedValue(workspace)
    spyOn(canonicalClient, "relocateSession").mockResolvedValue({ sessions: [moved] })
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    spyOn(canonicalClient, "getQueue").mockResolvedValue({ sessionId: "session-a", revision: "0", items: [] })
    await moveSessionToDirectory(session(), directory, destination)
    expect(source.getState().message["session-a"]).toBeUndefined()
    expect(manager.getChild(destination)?.getState().snapshot["session-a"]?.session.workspaceId).toBe(workspace.workspaceId)
    expect(published).toEqual([{ directory: destination, snapshot }])
    expect(history).toHaveBeenCalledTimes(2)
    expect(loader.getSnapshot({ directory: destination, sessionId: "session-a" })).toMatchObject({ status: "ready", resolved: true, cursor: undefined, complete: true })
  })

  test("publishes nothing locally when the caller's server changed during the move", async () => {
    const source = createStore({}, {
      session: [{
        id: "session-a",
        projectID: "project",
        title: "Move me",
        directory: "/source",
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: 1, updated: 1 },
      }],
      sessionTotal: 1,
    })
    const destination = createStore({})
    const childStores = createChildStores([["/source", source], ["/destination", destination]])
    const { moveSessionToDirectory, setActionRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/source")

    await moveSessionToDirectory(source.getState().session[0], "/source", "/destination", () => false)

    expect(replyCalls.filter((call) => call.method === "session.move")).toHaveLength(1)
    expect(source.getState().session[0]?.id).toBe("session-a")
    expect(destination.getState().session).toHaveLength(0)
    expect(globalUpsertedSessions).toHaveLength(0)
  })

  test("an event-applied move updates the global directory and the worktree attachment", async () => {
    // SAFETY: test fixture; only the worktree path and branch are read.
    const worktree = {
      path: "/destination",
      projectDirectory: "/repo",
      branch: "feature",
      label: "feature",
    } as WorktreeMetadata
    availableWorktreesByProject = new Map([["/repo", [worktree]]])
    const source = createStore({}, {
      // SAFETY: test fixture; the action reads id, title and directory.
      session: [{ id: "session-a", title: "Renamed", directory: "/destination" } as Session],
      sessionTotal: 1,
    })
    const destination = createStore({})
    const childStores = createChildStores([["/source", source], ["/destination", destination]])
    const { adoptSessionMove, setActionRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/source")

    adoptSessionMove("session-a", "/source", "/destination")

    expect(globalUpsertedSessions.at(-1)).toMatchObject({
      id: "session-a",
      title: "Renamed",
      directory: "/destination",
    })
    expect(worktreeMetadataCalls.at(-1)).toMatchObject({
      sessionID: "session-a",
      cwd: "/destination",
    })
    expect(worktreeMetadataCalls.at(-1)?.metadata?.path).toBe("/destination")
    expect(queueMoves).toEqual([{ sessionId: "session-a", directory: "/destination" }])
    expect(tabMoves).toEqual([{ sessionId: "session-a", directory: "/destination" }])
    expect(folderMoves).toEqual([{ sessionId: "session-a", directory: "/destination", worktree: "/destination" }])
  })

  test("an event-applied move of a session no open folder lists still moves its attachment, folders and tabs", async () => {
    // SAFETY: test fixture; only the worktree path and branch are read.
    const worktree = { path: "/destination", projectDirectory: "/repo", branch: "feature", label: "feature" } as WorktreeMetadata
    availableWorktreesByProject = new Map([["/repo", [worktree]]])
    // SAFETY: test fixture; the action reads id, title and directory.
    globalActiveSessions = [{ id: "session-a", title: "Elsewhere", directory: "/destination" } as Session]
    const destination = createStore({})
    const childStores = createChildStores([["/destination", destination]])
    const { adoptSessionMove, setActionRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/other")

    adoptSessionMove("session-a", "/source", "/destination")

    expect(destination.getState().session[0]?.id).toBe("session-a")
    expect(registeredSessionDirectories).toEqual([{ sessionID: "session-a", directory: "/destination" }])
    expect(worktreeMetadataCalls.at(-1)?.metadata?.path).toBe("/destination")
    expect(folderMoves).toEqual([{ sessionId: "session-a", directory: "/destination", worktree: "/destination" }])
    expect(tabMoves).toEqual([{ sessionId: "session-a", directory: "/destination" }])
  })

  test("an event-applied move out of a worktree clears the attachment", async () => {
    const source = createStore({}, {
      // SAFETY: test fixture; the action reads id, title and directory.
      session: [{ id: "session-a", title: "Renamed", directory: "/elsewhere" } as Session],
      sessionTotal: 1,
    })
    const destination = createStore({})
    const childStores = createChildStores([["/source", source], ["/elsewhere", destination]])
    const { adoptSessionMove, setActionRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/source")

    adoptSessionMove("session-a", "/source", "/elsewhere")

    expect(globalUpsertedSessions.at(-1)).toMatchObject({
      id: "session-a",
      directory: "/elsewhere",
    })
    expect(worktreeMetadataCalls.at(-1)).toMatchObject({
      sessionID: "session-a",
      metadata: null,
      cwd: "/elsewhere",
    })
  })
})

describe("native session deletion", () => {
  test("retains live and persisted state on failure and reports the failure", async () => {
    const store = seed()
    useSessionPinnedStore.getState().toggle({ directory, sessionId: "session-a" })
    spyOn(canonicalClient, "deleteSession").mockRejectedValue(new Error("delete failed"))
    expect(await deleteSession("session-a")).toBe(false)
    expect(store.getState().session).toEqual([session()])
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, directory, "session-a")).toBe(true)
    expect(takeSessionActionFailure(["session-a"])?.message).toBe("delete failed")
  })

  test("commits the acknowledged cascade and cleans only its persisted state", async () => {
    const root = session()
    const child = session("child", { parentSessionId: root.sessionId, rootSessionId: root.sessionId })
    const retained = session("retained")
    const store = seed([root, child, retained])
    for (const item of [root, child, retained]) useSessionPinnedStore.getState().toggle({ directory, sessionId: item.sessionId })
    useSessionUIStore.setState({ currentSessionId: root.sessionId, currentSessionDirectory: directory })
    const remove = spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: root.sessionId, deletedSessionIds: [root.sessionId, child.sessionId] })
    expect(await deleteSession(root.sessionId)).toBe(true)
    expect(remove).toHaveBeenCalledWith(root.sessionId)
    expect(store.getState().session).toEqual([retained])
    expect(store.getState().sessionDeletedRevision?.[root.sessionId] ?? 0).toBeGreaterThan(0)
    expect(store.getState().sessionDeletedRevision?.[child.sessionId] ?? 0).toBeGreaterThan(0)
    expect(useGlobalSessionsStore.getState().entityById.has(child.sessionId)).toBe(false)
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, directory, root.sessionId)).toBe(false)
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, directory, child.sessionId)).toBe(false)
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, directory, retained.sessionId)).toBe(true)
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
  })

  test("rejects a deletion acknowledgment for another session", async () => {
    const store = seed()
    spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: "another", deletedSessionIds: ["another"] })
    expect(await deleteSession("session-a")).toBe(false)
    expect(store.getState().session).toEqual([session()])
  })

  test("a stable canonical not-found confirms deletion", async () => {
    const store = seed()
    spyOn(canonicalClient, "deleteSession").mockRejectedValue(problem("SESSION_NOT_FOUND"))
    expect(await deleteSession("session-a")).toBe(true)
    expect(store.getState().session).toEqual([])
  })

  for (const notFound of [false, true]) {
    test(`ignores an obsolete ${notFound ? "not-found" : "successful"} deletion response`, async () => {
      const store = seed()
      const response = deferred<SessionDeleteAck>()
      const started = deferred<void>()
      spyOn(canonicalClient, "deleteSession").mockImplementation(() => { started.resolve(); return response.promise })
      const pending = deleteSession("session-a")
      await started.promise
      changeRuntime()
      if (notFound) response.reject(problem("SESSION_NOT_FOUND"))
      else response.resolve({ sessionId: "session-a", deletedSessionIds: ["session-a"] })
      expect(await pending).toBe(false)
      expect(store.getState().session).toEqual([session()])
    })
  }

  test("preserves committed batch deletions and stops issuing requests after a runtime switch", async () => {
    const store = seed([session(), session("session-b"), session("session-c")])
    const remove = spyOn(canonicalClient, "deleteSession").mockImplementation(async sessionId => {
      if (sessionId === "session-b") changeRuntime()
      return { sessionId, deletedSessionIds: [sessionId] }
    })
    expect(await deleteSessions(["session-a", "session-b", "session-c"])).toEqual({ deletedIds: ["session-a"], failedIds: ["session-b", "session-c"] })
    expect(remove.mock.calls.map(call => call[0])).toEqual(["session-a", "session-b"])
    expect(store.getState().session.map(item => item.sessionId)).toEqual(["session-b", "session-c"])
  })

  test("keeps shared chat storage while a sibling root references its mapped workspace", async () => {
    seed([session(), session("sibling")])
    spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: "session-a", deletedSessionIds: ["session-a"] })
    expect(await deleteSession("session-a")).toBe(true)
    expect(chatDirectories.deleteChatDirectory).not.toHaveBeenCalled()
  })

  test("removes the last root's chat storage after its cascade is confirmed", async () => {
    seed([session(), session("child", { parentSessionId: "session-a", rootSessionId: "session-a" })])
    spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: "session-a", deletedSessionIds: ["session-a", "child"] })
    expect(await deleteSession("session-a")).toBe(true)
    expect(chatDirectories.deleteChatDirectory).toHaveBeenCalledWith(directory)
  })

  test("an incomplete global cache cannot authorize removing chat storage", async () => {
    seed()
    useGlobalSessionsStore.setState({ hasLoaded: false })
    spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: "session-a", deletedSessionIds: ["session-a"] })
    expect(await deleteSession("session-a")).toBe(true)
    expect(chatDirectories.deleteChatDirectory).not.toHaveBeenCalled()
  })

  test("external deletion rejects obsolete owners and reconciles a current identity", () => {
    const store = seed()
    reconcileExternallyDeletedSession({ runtimeKey: "obsolete", directory, sessionId: "session-a" })
    expect(store.getState().session).toHaveLength(1)
    reconcileExternallyDeletedSession({ runtimeKey: getRuntimeKey(), directory, sessionId: "session-a" })
    expect(store.getState().session).toEqual([])
    expect(useGlobalSessionsStore.getState().entityById.has("session-a")).toBe(false)
  })
})

describe("Host archive transitions over native records", () => {
  test("a failed single archive retains the session and status", async () => {
    const store = seed()
    store.setState({ session_status: { "session-a": "running" } })
    spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }))
    expect(await archiveSession("session-a")).toBe(false)
    expect(store.getState().session).toHaveLength(1)
    expect(store.getState().session_status["session-a"]).toBe("running")
    expect(takeSessionActionFailure(["session-a"])).not.toBeNull()
  })

  test("confirmed archive invalidates status and moves the full canonical record", async () => {
    const store = seed()
    store.setState({
      sessionStatusReady: true, session_status: { "session-a": "running" },
      snapshot: { "session-a": nativeSnapshot() }, message: { "session-a": [nativeMessage()] },
      permission: { "session-a": [nativeApproval()] }, form: { "session-a": [nativeQuestion()] }
    })
    spyOn(globalThis, "fetch").mockResolvedValue(archiveResponse(["session-a"]))
    expect(await archiveSession("session-a")).toBe(true)
    expect(store.getState().session).toEqual([])
    expect(store.getState().session_status["session-a"]).toBeUndefined()
    expect(store.getState().sessionStatusInvalidated?.['session-a']).toBe(true)
    expect(getSessionLiveActivity("session-a")).toBe("unknown")
    expect(store.getState().snapshot["session-a"]).toBeUndefined()
    expect(store.getState().message["session-a"]).toBeUndefined()
    expect(store.getState().permission["session-a"]).toBeUndefined()
    expect(store.getState().form["session-a"]).toBeUndefined()
    expect(useGlobalSessionsStore.getState().archivedSessions.find(item => item.sessionId === "session-a")).toEqual({ ...session(), archivedAt: 123 })
  })

  test("batches held sessions into one request and one directory publication", async () => {
    const store = seed([session(), session("session-b")])
    store.setState({
      sessionStatusReady: true, snapshot: { "session-a": nativeSnapshot(), "session-b": nativeSnapshot("session-b") },
      message: { "session-a": [nativeMessage()], "session-b": [nativeMessage("session-b")] }
    })
    const fetch = spyOn(globalThis, "fetch").mockImplementation(async input => String(input).includes("/auth/url-token")
      ? Response.json({ token: "actions-token", expiresAt: 999 })
      : archiveResponse(["session-a", "session-b"]))
    let publications = 0
    const unsubscribe = store.subscribe(() => { publications += 1 })
    try {
      expect(await archiveSessions(["session-a", "session-b"])).toEqual({ archivedIds: ["session-a", "session-b"], failedIds: [] })
      expect(fetch.mock.calls.filter(([input]) => String(input).includes("/sessions/archive"))).toHaveLength(1)
      expect(publications).toBe(1)
      expect(store.getState().session).toEqual([])
      expect(store.getState().snapshot).toEqual({})
      expect(store.getState().message).toEqual({})
      expect(getSessionLiveActivity("session-a")).toBe("unknown")
      expect(getSessionLiveActivity("session-b")).toBe("unknown")
      expect(useGlobalSessionsStore.getState().archivedSessions.map(item => item.sessionId).sort()).toEqual(["session-a", "session-b"])
    } finally { unsubscribe() }
  })

  test("partial archive failures preserve their native live records", async () => {
    const store = seed([session(), session("session-b")])
    spyOn(globalThis, "fetch").mockResolvedValue(archiveResponse(["session-a"], ["session-b"]))
    expect(await archiveSessions(["session-a", "session-b"])).toEqual({ archivedIds: ["session-a"], failedIds: ["session-b"] })
    expect(store.getState().session).toEqual([session("session-b")])
  })

  test("malformed archive responses never grant successful empty authority", async () => {
    const store = seed()
    spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ archived: [{ title: "missing identity" }], failedIds: [] }))
    expect(await archiveSessions(["session-a"])).toEqual({ archivedIds: [], failedIds: ["session-a"] })
    expect(store.getState().session).toEqual([session()])
  })

  test("an archive response from the previous runtime cannot remove live sessions", async () => {
    const store = seed([session(), session("session-b")])
    const response = deferred<Response>()
    const started = deferred<void>()
    spyOn(globalThis, "fetch").mockImplementation(() => { started.resolve(); return response.promise })
    const pending = archiveSessions(["session-a", "session-b"])
    await started.promise
    changeRuntime()
    response.resolve(archiveResponse(["session-a", "session-b"]))
    expect(await pending).toEqual({ archivedIds: [], failedIds: ["session-a", "session-b"] })
    expect(store.getState().session).toHaveLength(2)
  })

  test("restores a parent and archived descendants but refuses a child by itself", async () => {
    seed([session("root", { archivedAt: 3 }), session("child", { parentSessionId: "root", rootSessionId: "root", archivedAt: 3 })])
    const fetch = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/auth/url-token")) return Response.json({ token: "actions-token", expiresAt: 999 })
      const request = unarchiveRequestSchema.parse(JSON.parse(String(init?.body)))
      return restoreResponse(request.ids)
    })
    spyOn(canonicalClient, "getSnapshot").mockImplementation(async id => nativeSnapshot(id, []))
    expect(await unarchiveSession("child")).toBe(false)
    expect(fetch.mock.calls.filter(([input]) => String(input).includes("/sessions/unarchive"))).toHaveLength(0)
    expect(await unarchiveSessions(["child", "root"])).toEqual({ restoredIds: ["root", "child"], failedIds: [] })
    expect(useGlobalSessionsStore.getState().activeSessions.map(item => item.sessionId).sort()).toEqual(["child", "root"])
    expect(useGlobalSessionsStore.getState().activeSessions.every(item => item.archivedAt === undefined)).toBe(true)
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([])
  })

  test("failed status recovery leaves a committed restore unknown, not failed or idle", async () => {
    const store = seed([session("session-a", { archivedAt: 3 })])
    store.setState({ session: [], sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    spyOn(globalThis, "fetch").mockResolvedValue(restoreResponse(["session-a"]))
    spyOn(canonicalClient, "getSnapshot").mockRejectedValue(new Error("status unavailable"))
    expect(await unarchiveSession("session-a")).toBe(true)
    expect(useGlobalSessionsStore.getState().activeSessions.some(item => item.sessionId === "session-a")).toBe(true)
    expect(getSessionLiveActivity("session-a")).toBe("unknown")
    expect(takeSessionActionFailure(["session-a"])).toBeNull()
  })

  test("restore recovers native running status rather than trusting an old idle baseline", async () => {
    const store = seed([session("session-a", { archivedAt: 3 })])
    store.setState({ session: [], sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const snapshot = nativeSnapshot("session-a", [])
    const run: Run = { runId: "run-live", sessionId: "session-a", status: "running", origin: "host", createdAt: 4 }
    snapshot.session = { ...snapshot.session, runtimeStatus: "running", activeRunId: run.runId }
    snapshot.activeRun = run
    spyOn(globalThis, "fetch").mockResolvedValue(restoreResponse(["session-a"]))
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    expect(await unarchiveSession("session-a")).toBe(true)
    expect(store.getState().session_status["session-a"]).toBe("running")
    expect(getSessionLiveActivity("session-a")).toBe("active")
  })

  test("a newer status mutation wins over an in-flight restore snapshot", async () => {
    const store = seed([session("session-a", { archivedAt: 3 })])
    store.setState({ session: [], sessionStatusInvalidated: { "session-a": true } })
    const response = deferred<SessionSnapshot>()
    const started = deferred<void>()
    spyOn(globalThis, "fetch").mockResolvedValue(restoreResponse(["session-a"]))
    spyOn(canonicalClient, "getSnapshot").mockImplementation(() => { started.resolve(); return response.promise })
    const pending = unarchiveSession("session-a")
    await started.promise
    store.setState({ session_status: { "session-a": "awaiting_approval" } })
    response.resolve(nativeSnapshot("session-a", []))
    expect(await pending).toBe(true)
    expect(store.getState().session_status["session-a"]).toBe("awaiting_approval")
  })

  test("a missing restore stamp retains the archived record", async () => {
    seed([session("session-a", { archivedAt: 3 })])
    spyOn(globalThis, "fetch").mockResolvedValue(restoreResponse([], ["session-a"]))
    expect(await unarchiveSession("session-a")).toBe(false)
    expect(useGlobalSessionsStore.getState().archivedSessions.some(item => item.sessionId === "session-a")).toBe(true)
  })

  test("an obsolete restore response cannot restore the native record", async () => {
    const store = seed([session("session-a", { archivedAt: 3 })])
    store.setState({ sessionStatusInvalidated: { "session-a": true } })
    const response = deferred<Response>()
    const started = deferred<void>()
    spyOn(globalThis, "fetch").mockImplementation(() => { started.resolve(); return response.promise })
    const pending = unarchiveSession("session-a")
    await started.promise
    changeRuntime()
    response.resolve(restoreResponse(["session-a"]))
    expect(await pending).toBe(false)
    expect(store.getState().session).toEqual([])
    expect(store.getState().sessionStatusInvalidated?.['session-a']).toBe(true)
  })

  test("a runtime switch during status recovery keeps the already-confirmed restore", async () => {
    seed([session("session-a", { archivedAt: 3 })])
    spyOn(globalThis, "fetch").mockResolvedValue(restoreResponse(["session-a"]))
    spyOn(canonicalClient, "getSnapshot").mockImplementation(async id => { changeRuntime(); return nativeSnapshot(id, []) })
    expect(await unarchiveSessions(["session-a", "session-b"])).toEqual({ restoredIds: ["session-a"], failedIds: ["session-b"] })
  })
})

describe("native delivery and execution controls", () => {
  const request: PromptRequest = {
    input: { text: "Hello", attachments: [{ attachmentId: "attachment-a", name: "notes.txt", mediaType: "text/plain", size: 4, uri: "attachment://attachment-a" }], context: [{ kind: "synthetic", text: "Context" }] },
    options: { providerId: "provider-a", modelId: "model-a", agentId: "agent-a", variant: null, reasoningEffort: null },
  }
  const run: Run = { runId: "run-a", sessionId: "session-a", status: "running", origin: "host", createdAt: 1 }

  test.each(["unavailable", "idle", "missing"] as const)("accepted send requests snapshot recovery only for a cold or missing snapshot (%s)", async status => {
    const store = seed()
    if (status !== "missing") {
      const snapshot = nativeSnapshot()
      snapshot.session.runtimeStatus = status
      store.setState({ snapshot: { "session-a": snapshot } })
    }
    const ensure = mock(() => {})
    setActionRefs(manager, () => directory, undefined, ensure)
    const pending = deferred<{ run: Run }>()
    const create = spyOn(canonicalClient, "createRun").mockImplementation(() => pending.promise)
    const sending = sendMessage({ sessionId: "session-a", directory, request })
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
    expect(ensure).toHaveBeenCalledTimes(1)
    pending.resolve({ run })
    await sending
    expect(create).toHaveBeenCalledTimes(1)
    expect(ensure).toHaveBeenCalledTimes(status === "idle" ? 1 : 2)
    if (status !== "idle") expect(ensure).toHaveBeenLastCalledWith("session-a", directory, { refreshSnapshot: true })
  })

  test.each(["failure", "runtime-switch"])("an unaccepted or stale cold send does not request recovery (%s)", async outcome => {
    seed()
    const ensure = mock(() => {})
    setActionRefs(manager, () => directory, undefined, ensure)
    spyOn(canonicalClient, "createRun").mockImplementation(async () => { if (outcome === "failure") throw new Error("Refused"); changeRuntime(); return { run } })
    await expect(sendMessage({ sessionId: "session-a", directory, request })).rejects.toThrow()
    expect(ensure).toHaveBeenCalledTimes(1)
  })

  test("submits a native prompt and command identity without inventing transcript records", async () => {
    const store = seed()
    const create = spyOn(canonicalClient, "createRun").mockResolvedValue({ run })
    await sendMessage({ sessionId: "session-a", request, commandId: "command-a" })
    expect(create).toHaveBeenCalledWith("session-a", request, "command-a")
    expect(store.getState().message["session-a"]).toBeUndefined()
  })

  test("publishes the accepted run as control state before any status event", async () => {
    const store = seed()
    spyOn(canonicalClient, "createRun").mockResolvedValue({ run })
    await sendMessage({ sessionId: "session-a", request })
    expect(store.getState().session_status["session-a"]).toBe("running")
    expect(store.getState().session.find((item) => item.sessionId === "session-a")).toMatchObject({ runtimeStatus: "running", activeRunId: run.runId })
    // Control state only: acceptance is not proof of a message.
    expect(store.getState().message["session-a"]).toBeUndefined()
  })

  test("an idle snapshot unchanged since the request accepts the new run ack", async () => {
    const store = seed()
    const idle = nativeSnapshot("session-a", [])
    store.setState({ snapshot: { "session-a": idle } })
    spyOn(canonicalClient, "createRun").mockResolvedValue({ run })
    await sendMessage({ sessionId: "session-a", request })
    expect(store.getState().session_status["session-a"]).toBe("running")
    expect(store.getState().snapshot["session-a"]?.session).toMatchObject({ runtimeStatus: "running", activeRunId: run.runId })
  })

  test("a createRun ack resolved after a released run cannot resurrect stop", async () => {
    const store = seed()
    store.setState({ snapshot: { "session-a": nativeSnapshot("session-a", []) } })
    const ack = deferred<{ run: Run }>()
    const requested = deferred<void>()
    spyOn(canonicalClient, "createRun").mockImplementation(() => { requested.resolve(); return ack.promise })
    const pending = sendMessage({ sessionId: "session-a", request })
    await requested.promise

    // The run is observed terminal while the HTTP acknowledgement is in flight.
    const started = applyDirectoryEvent(store.getState(), CanonicalEventSchema.parse({
      sessionId: "session-a", epoch: "epoch-a", sequence: "5", timestamp: 5, type: "run.started", runId: run.runId, createdAt: 1,
    }))
    store.setState(started.state)
    const completed = applyDirectoryEvent(store.getState(), CanonicalEventSchema.parse({
      sessionId: "session-a", epoch: "epoch-a", sequence: "6", timestamp: 6, type: "run.completed", runId: run.runId, finishedAt: 6,
    }))
    store.setState(completed.state)
    expect(store.getState().session_status["session-a"]).toBe("idle")

    ack.resolve({ run })
    await pending
    expect(store.getState().session_status["session-a"]).toBe("idle")
    expect(store.getState().snapshot["session-a"]?.session.activeRunId).toBeNull()
    expect(store.getState().snapshot["session-a"]?.activeRun).toBeNull()
    expect(store.getState().session.find((item) => item.sessionId === "session-a")).toMatchObject({ runtimeStatus: "idle", activeRunId: null })
  })

  test("routes steer and follow-up through their native acknowledgments", async () => {
    const steer = spyOn(canonicalClient, "steer").mockResolvedValue({ sessionId: "session-a", runId: run.runId, acceptedAt: 2 })
    const follow = spyOn(canonicalClient, "followUp").mockResolvedValue({ sessionId: "session-a", followUpId: "follow-a", acceptedAt: 2 })
    await sendMessage({ sessionId: "session-a", request, mode: "steer", commandId: "steer-a" })
    await sendMessage({ sessionId: "session-a", request, mode: "follow-up", commandId: "follow-a" })
    expect(steer).toHaveBeenCalledWith("session-a", request, "steer-a")
    expect(follow).toHaveBeenCalledWith("session-a", request, "follow-a")
  })

  test("propagates an ambiguous delivery failure once without retrying or changing history", async () => {
    const store = seed()
    const message = nativeMessage()
    store.setState({ message: { "session-a": [message] } })
    const error = new TypeError("Failed to fetch")
    const create = spyOn(canonicalClient, "createRun").mockRejectedValue(error)
    try {
      await sendMessage({ sessionId: 'session-a', request })
      throw new Error('Expected sendMessage to reject')
    } catch (caught) {
      expect(caught).toBe(error)
    }
    expect(create).toHaveBeenCalledTimes(1)
    expect(store.getState().message["session-a"]).toEqual([message])
  })

  test("rejects an obsolete send before dispatch", async () => {
    const create = spyOn(canonicalClient, "createRun")
    await expect(sendMessage({ sessionId: "session-a", request, runtimeKey: "obsolete" })).rejects.toThrow("runtime changed")
    expect(create).not.toHaveBeenCalled()
  })

  test("rejects a run response addressed to another session", async () => {
    spyOn(canonicalClient, "createRun").mockResolvedValue({ run: { ...run, sessionId: "another" } })
    await expect(sendMessage({ sessionId: "session-a", request })).rejects.toThrow("another session")
  })

  test("aborts the authoritative active run and does nothing for an idle snapshot", async () => {
    const snapshot = nativeSnapshot("session-a", [])
    snapshot.session = { ...snapshot.session, runtimeStatus: "running", activeRunId: run.runId }
    snapshot.activeRun = run
    const read = spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    const abort = spyOn(canonicalClient, "abortSession").mockResolvedValue({ run: { ...run, status: "cancelled", finishedAt: 2 } })
    await abortCurrentOperation("session-a")
    expect(abort).toHaveBeenCalledWith("session-a", run.runId)
    read.mockResolvedValue(nativeSnapshot("session-a", []))
    await abortCurrentOperation("session-a")
    expect(abort).toHaveBeenCalledTimes(1)
  })

  test("publishes the abort acknowledgement as terminal control state", async () => {
    const store = seed()
    const live = nativeSnapshot("session-a", [])
    live.session = { ...live.session, runtimeStatus: "running", activeRunId: run.runId }
    live.activeRun = run
    store.setState({
      snapshot: { "session-a": live },
      session_status: { "session-a": "running" },
      session: [{ ...store.getState().session[0]!, runtimeStatus: "running", activeRunId: run.runId }],
    })
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(live)
    spyOn(canonicalClient, "abortSession").mockResolvedValue({ run: { ...run, status: "cancelled", finishedAt: 2 } })
    await abortCurrentOperation("session-a")
    expect(store.getState().session_status["session-a"]).toBe("idle")
    expect(store.getState().snapshot["session-a"]?.session.activeRunId).toBeNull()
    expect(store.getState().snapshot["session-a"]?.activeRun).toBeNull()
    expect(store.getState().session[0]).toMatchObject({ runtimeStatus: "idle", activeRunId: null })
  })

  test("failed history recovery preserves cached messages; successful empty authority replaces them", async () => {
    const store = seed()
    const cached = nativeMessage()
    store.setState({ message: { "session-a": [cached] } })
    const read = spyOn(canonicalClient, "getSnapshot").mockRejectedValue(new Error("offline"))
    await expect(refetchSessionMessages("session-a")).rejects.toThrow("offline")
    expect(store.getState().message["session-a"]).toEqual([cached])
    read.mockResolvedValue(nativeSnapshot("session-a", []))
    await refetchSessionMessages("session-a")
    expect(store.getState().message["session-a"]).toEqual([])
  })

  test("action refresh uses the real loader and preserves visible history on native read failure", async () => {
    const store = seed()
    const cached = nativeMessage()
    store.setState({ message: { "session-a": [cached] } })
    let fail = true
    const client = nativeClient({
      getSnapshot: async id => {
        if (fail) throw new Error("loader offline")
        return nativeSnapshot(id, [])
      }
    })
    loader = new SessionMessageLoader(manager, { client, runtimeKey: getRuntimeKey() })
    setImperativeSessionMessageLoader(loader)
    await expect(refetchSessionMessages("session-a")).rejects.toThrow("loader offline")
    expect(store.getState().message["session-a"]).toEqual([cached])
    fail = false
    await refetchSessionMessages("session-a")
    expect(store.getState().message["session-a"]).toEqual([])
  })

  test("confirmed deletion invalidates the real loader's resolved transcript coverage", async () => {
    seed()
    const target = { directory, sessionId: "session-a" }
    loader = new SessionMessageLoader(manager, { client: nativeClient(), runtimeKey: getRuntimeKey() })
    setImperativeSessionMessageLoader(loader)
    await loader.ensure(target)
    const generation = loader.getSnapshot(target).generation
    expect(loader.getSnapshot(target).resolved).toBe(true)
    spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: "session-a", deletedSessionIds: ["session-a"] })
    expect(await deleteSession("session-a")).toBe(true)
    expect(loader.getSnapshot(target).generation).toBe(generation + 1)
    expect(loader.getSnapshot(target).resolved).toBe(false)
  })

  test("reads assistant provider and model from inline native message records", () => {
    const store = seed()
    store.setState({ message: { "session-a": [{ ...nativeMessage("session-a", "assistant", 2, "assistant"), providerId: "provider-a", modelId: "model-a" }, nativeMessage("session-a", "user", 3)] } })
    expect(getSessionLastAssistantModel("session-a")).toEqual({ providerID: "provider-a", modelID: "model-a" })
  })
})

describe("native approval and question CAS", () => {
  const approval: ApprovalRequest = { ...nativeApproval(), policyTarget: { toolName: "bash", pattern: "pwd" } }
  const question = nativeQuestion()
  const identity = { version: approval.version, epoch: approval.epoch, workerGeneration: approval.workerGeneration }

  function requests() {
    const store = seed()
    store.setState({ permission: { "session-a": [approval] }, form: { "session-a": [question] } })
    return store
  }

  test("approval once, always and reject carry the pending CAS identity and clear confirmed cards", async () => {
    const store = requests()
    const reply = spyOn(canonicalClient, "respondApproval").mockImplementation(async (_sessionId, _approvalId, response) => ({
      ...approval, status: response.decision === "reject" ? "rejected" : "approved", version: "2", resolvedAt: 2,
      resolution: response.decision === "always-allow"
        ? { decision: "always-allow", policy: { policyId: "policy-a", revision: "1", persistence: "committed", scope: "session" } }
        : { decision: response.decision === "reject" ? "reject" : "approve" },
    }))
    for (const [response, decision] of [["once", "approve"], ["always", "always-allow"], ["reject", "reject"]] as const) {
      store.setState({ permission: { "session-a": [approval] } })
      await respondToPermission("session-a", approval.approvalId, response)
      const expected = response === "always"
        ? { ...identity, decision, policyScope: "session" }
        : { ...identity, decision }
      expect(reply).toHaveBeenLastCalledWith("session-a", approval.approvalId, expected)
      expect(store.getState().permission["session-a"]).toBeUndefined()
    }
  })

  test("question answers and cancellation carry the native CAS identity", async () => {
    const store = requests()
    const answer = { choice: "yes", count: 2 }
    const reply = spyOn(canonicalClient, "respondQuestion").mockResolvedValue({ ...question, status: "answered", version: "2", response: answer, answeredAt: 2, resolvedAt: 2 })
    await replyToForm("session-a", question.questionId, answer)
    expect(reply).toHaveBeenLastCalledWith("session-a", question.questionId, { ...identity, action: "answer", response: answer })
    expect(store.getState().form["session-a"]).toBeUndefined()
    store.setState({ form: { "session-a": [question] } })
    reply.mockResolvedValue({ ...question, status: "cancelled", version: "2", resolvedAt: 2 })
    await cancelForm("session-a", question.questionId)
    expect(reply).toHaveBeenLastCalledWith("session-a", question.questionId, { ...identity, action: "cancel" })
    expect(store.getState().form["session-a"]).toBeUndefined()
  })

  test("missing local cards are read from the native pending-set snapshot", async () => {
    seed()
    const snapshot = nativeSnapshot()
    snapshot.approvals = [approval]
    snapshot.questions = [question]
    const read = spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    const approve = spyOn(canonicalClient, "respondApproval").mockResolvedValue({ ...approval, status: "approved", version: "2", resolvedAt: 2, resolution: { decision: "approve" } })
    const answer = spyOn(canonicalClient, "respondQuestion").mockResolvedValue({ ...question, status: "answered", version: "2", response: { choice: "yes" }, answeredAt: 2, resolvedAt: 2 })
    await respondToPermission("session-a", approval.approvalId, "once")
    await replyToForm("session-a", question.questionId, { choice: "yes" })
    expect(read).toHaveBeenCalledTimes(2)
    expect(approve).toHaveBeenCalledWith("session-a", approval.approvalId, { ...identity, decision: "approve" })
    expect(answer).toHaveBeenCalledWith("session-a", question.questionId, { ...identity, action: "answer", response: { choice: "yes" } })
  })

  test("transient reply failure preserves both pending cards", async () => {
    const store = requests()
    spyOn(canonicalClient, "respondApproval").mockRejectedValue(new Error("offline"))
    spyOn(canonicalClient, "respondQuestion").mockRejectedValue(new Error("offline"))
    await expect(dismissPermission("session-a", approval.approvalId)).rejects.toThrow("offline")
    await expect(cancelForm("session-a", question.questionId)).rejects.toThrow("offline")
    expect(store.getState().permission["session-a"]).toEqual([approval])
    expect(store.getState().form["session-a"]).toEqual([question])
  })

  test("canonical terminal-request errors clear stale cards and request tail recovery", async () => {
    const store = requests()
    const message = nativeMessage()
    store.setState({ message: { "session-a": [message] } })
    const materialize = mock(() => { })
    setActionRefs(manager, () => directory, materialize)
    spyOn(canonicalClient, "respondApproval").mockRejectedValue(problem("APPROVAL_NOT_FOUND"))
    spyOn(canonicalClient, "respondQuestion").mockRejectedValue(problem("QUESTION_EXPIRED"))
    await expect(dismissPermission("session-a", approval.approvalId)).rejects.toBeInstanceOf(CanonicalApiError)
    await expect(cancelForm("session-a", question.questionId)).rejects.toBeInstanceOf(CanonicalApiError)
    expect(store.getState().permission["session-a"]).toBeUndefined()
    expect(store.getState().form["session-a"]).toBeUndefined()
    expect(materialize).toHaveBeenCalledTimes(2)
    expect(materialize).toHaveBeenCalledWith(directory, "session-a", message.messageId)
  })

  test("subtree dismissal removes duplicate pending cards immediately and sends once per identity", async () => {
    const child = session("child", { parentSessionId: "session-a", rootSessionId: "session-a" })
    const store = seed([session(), child, session("unrelated")])
    const childApproval = { ...nativeApproval("child"), approvalId: "approval-child" }
    const childQuestion = { ...nativeQuestion("child"), questionId: "question-child" }
    const unrelatedApproval = nativeApproval("unrelated")
    const unrelatedQuestion = nativeQuestion("unrelated")
    store.setState({ permission: { "session-a": [approval], child: [childApproval], unrelated: [unrelatedApproval] }, form: { "session-a": [question], child: [childQuestion], unrelated: [unrelatedQuestion] } })
    const duplicate = manager.ensureChild("/another-index", { bootstrap: false })
    duplicate.setState({ session: [session(), child], permission: { "session-a": [approval], child: [childApproval] }, form: { "session-a": [question], child: [childQuestion] } })
    const gate = deferred<void>()
    const approve = spyOn(canonicalClient, "respondApproval").mockImplementation(async (sessionId, approvalId) => {
      await gate.promise
      return { ...nativeApproval(sessionId), approvalId, status: "rejected", version: "2", resolvedAt: 2, resolution: { decision: "reject" } }
    })
    const answer = spyOn(canonicalClient, "respondQuestion").mockImplementation(async (sessionId, questionId) => {
      await gate.promise
      return { ...nativeQuestion(sessionId), questionId, status: "cancelled", version: "2", resolvedAt: 2 }
    })
    const approving = dismissOpenPermissionsForSession("session-a")
    const answering = dismissOpenFormsForSession("session-a")
    expect(store.getState().permission["session-a"]).toBeUndefined()
    expect(store.getState().form.child).toBeUndefined()
    expect(duplicate.getState().permission.child).toBeUndefined()
    expect(approve).toHaveBeenCalledTimes(2)
    expect(answer).toHaveBeenCalledTimes(2)
    gate.resolve()
    expect(await approving).toBe(true)
    expect(await answering).toBe(true)
    expect(store.getState().permission.unrelated).toEqual([unrelatedApproval])
    expect(store.getState().form.unrelated).toEqual([unrelatedQuestion])
  })

  for (const kind of ["approval", "question"] as const) {
    test(`${kind} dismissal restores an unresolved card only when snapshot recovery also fails`, async () => {
      const store = requests()
      spyOn(canonicalClient, "getSnapshot").mockRejectedValue(new Error("snapshot offline"))
      spyOn(canonicalClient, "respondApproval").mockRejectedValue(new Error("reply offline"))
      spyOn(canonicalClient, "respondQuestion").mockRejectedValue(new Error("reply offline"))
      const pending = kind === "approval" ? dismissOpenPermissionsForSession("session-a") : dismissOpenFormsForSession("session-a")
      expect(kind === "approval" ? store.getState().permission["session-a"] : store.getState().form["session-a"]).toBeUndefined()
      expect(await pending).toBe(true)
      expect(kind === "approval" ? store.getState().permission["session-a"] : store.getState().form["session-a"]).toEqual([kind === "approval" ? approval : question])
    })

    test(`${kind} dismissal accepts an authoritative empty pending set instead of restoring stale cards`, async () => {
      const store = requests()
      spyOn(canonicalClient, "getSnapshot").mockResolvedValue(nativeSnapshot("session-a", []))
      spyOn(canonicalClient, "respondApproval").mockRejectedValue(new Error("reply offline"))
      spyOn(canonicalClient, "respondQuestion").mockRejectedValue(new Error("reply offline"))
      expect(await (kind === "approval" ? dismissOpenPermissionsForSession("session-a") : dismissOpenFormsForSession("session-a"))).toBe(true)
      expect(kind === "approval" ? store.getState().permission["session-a"] : store.getState().form["session-a"]).toEqual([])
    })

    test(`${kind} dismissal never restores a card after the session epoch changes`, async () => {
      const store = requests()
      const failed = async () => { store.setState({ session: [session("session-a", { epoch: "new-epoch" })] }); throw new Error("offline") }
      spyOn(canonicalClient, "respondApproval").mockImplementation(failed)
      spyOn(canonicalClient, "respondQuestion").mockImplementation(failed)
      spyOn(canonicalClient, "getSnapshot").mockRejectedValue(new Error("snapshot offline"))
      expect(await (kind === "approval" ? dismissOpenPermissionsForSession("session-a") : dismissOpenFormsForSession("session-a"))).toBe(true)
      expect(kind === "approval" ? store.getState().permission["session-a"] : store.getState().form["session-a"]).toBeUndefined()
    })

    test(`${kind} dismissal never restores a card after a confirmed session deletion`, async () => {
      const store = requests()
      const failed = async () => { store.setState({ sessionDeletedRevision: { "session-a": 2 } }); throw new Error("offline") }
      spyOn(canonicalClient, "respondApproval").mockImplementation(failed)
      spyOn(canonicalClient, "respondQuestion").mockImplementation(failed)
      spyOn(canonicalClient, "getSnapshot").mockRejectedValue(new Error("snapshot offline"))
      expect(await (kind === "approval" ? dismissOpenPermissionsForSession("session-a") : dismissOpenFormsForSession("session-a"))).toBe(true)
      expect(kind === "approval" ? store.getState().permission["session-a"] : store.getState().form["session-a"]).toBeUndefined()
    })
  }

  test("a pending reply resolved after runtime replacement leaves current cards unchanged", async () => {
    const store = requests()
    const response = deferred<ApprovalRequest>()
    const started = deferred<void>()
    spyOn(canonicalClient, "respondApproval").mockImplementation(() => { started.resolve(); return response.promise })
    const pending = respondToPermission("session-a", approval.approvalId, "once")
    await started.promise
    changeRuntime()
    response.resolve({ ...approval, status: "approved", version: "2", resolvedAt: 2, resolution: { decision: "approve" } })
    await expect(pending).rejects.toThrow("runtime changed")
    expect(store.getState().permission["session-a"]).toEqual([approval])
  })

  test("no pending subtree work returns false without remote replies", async () => {
    seed()
    const approve = spyOn(canonicalClient, "respondApproval")
    const answer = spyOn(canonicalClient, "respondQuestion")
    expect(await dismissOpenPermissionsForSession("session-a")).toBe(false)
    expect(await dismissOpenFormsForSession("session-a")).toBe(false)
    expect(approve).not.toHaveBeenCalled()
    expect(answer).not.toHaveBeenCalled()
  })
})

describe("native metadata publication", () => {
  test("title updates go through OMP and publish the returned title", async () => {
    const store = seed()
    const rename = spyOn(canonicalClient, "renameSession").mockResolvedValue({ ...session(), title: "Renamed" })
    await updateSessionTitle("session-a", "Renamed")
    expect(rename).toHaveBeenCalledWith("session-a", "workspace-a", "Renamed")
    expect(store.getState().session[0].title).toBe("Renamed")
    expect(useGlobalSessionsStore.getState().entityById.get("session-a")?.title).toBe("Renamed")
  })

  test("native metadata patches preserve siblings and encode removals as merge-patch null", async () => {
    const original = session("session-a", { title: "Before", metadata: { notes: "remove", openchamber: { work: { state: "open" }, linked_issues: [] } } })
    const store = seed([original])
    spyOn(canonicalClient, "getSessionMetadata").mockResolvedValue({ sessionId: "session-a", revision: "1", metadata: original.metadata })
    const write = spyOn(canonicalClient, "patchSessionMetadata").mockResolvedValue({ sessionId: "session-a", revision: "2", metadata: { openchamber: { work: { state: "done" }, linked_issues: [] } } })
    await patchSessionMetadata("session-a", directory, metadata => {
      const next = SessionMetadataSchema.parse(metadata)
      delete next.notes
      return { ...next, openchamber: { ...next.openchamber, work: { state: "done" } } }
    })
    expect(write).toHaveBeenCalledWith("session-a", { changes: { notes: null, openchamber: { work: { state: "done" } } } })
    expect(store.getState().session[0].title).toBe("Before")
  })

  test("work state writes use the native metadata contract", async () => {
    seed()
    const write = spyOn(canonicalClient, "patchSessionMetadata").mockResolvedValue({ sessionId: "session-a", revision: "2", metadata: { openchamber: { work: { state: "open" } } } })
    await setSessionWorkState("session-a", directory, "open")
    expect(write).toHaveBeenCalledWith("session-a", { changes: { openchamber: { work: { state: "open", openedAt: expect.any(Number), openedBy: "user" } } } })
  })

  test("a stale metadata read never writes to the replacement runtime", async () => {
    seed()
    spyOn(canonicalClient, "getSessionMetadata").mockImplementation(async sessionId => { changeRuntime(); return { sessionId, revision: "0", metadata: null } })
    const write = spyOn(canonicalClient, "patchSessionMetadata")
    expect(await setSessionWorkState("session-a", directory, "open")).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

  test("metadata patch does not write after an A-B-A switch during its Host read", async () => {
    const store = seed()
    const pending = deferred<{ sessionId: string; revision: string; metadata: null }>()
    spyOn(canonicalClient, "getSessionMetadata").mockImplementation(() => pending.promise)
    const write = spyOn(canonicalClient, "patchSessionMetadata")
    const operation = patchSessionMetadata("session-a", directory, metadata => ({ ...metadata, title: "stale" }))
    changeRuntime()
    switchRuntimeEndpoint({ apiBaseUrl: "https://actions.test", runtimeKey: "actions" })
    pending.resolve({ sessionId: "session-a", revision: "1", metadata: null })
    await expect(operation).rejects.toThrow("runtime changed")
    expect(write).not.toHaveBeenCalled()
    expect(store.getState().session[0].title).toBe("Before")
  })

  test("an obsolete title response cannot overwrite live state", async () => {
    const store = seed()
    spyOn(canonicalClient, "renameSession").mockImplementation(async () => {
      changeRuntime()
      return { ...session(), title: "Old runtime" }
    })
    await expect(updateSessionTitle("session-a", "Old runtime")).rejects.toThrow("runtime changed")
    expect(store.getState().session[0].title).toBe("Before")
  })
})

describe("native selected-branch forks", () => {
  function prepareFork() {
    const source = session()
    const fork = session("fork", { metadata: null, metadataRevision: "0" })
    const store = seed([source])
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(nativeSnapshot())
    spyOn(canonicalClient, "patchSessionMetadata").mockResolvedValue({ sessionId: fork.sessionId, revision: "1", metadata: {} })
    const create = spyOn(canonicalClient, "forkSession").mockResolvedValue({ session: fork })
    return { store, source, fork, create }
  }

  test("forks the selected native message and opens it in the mapped workspace", async () => {
    const { store, fork } = prepareFork()
    await forkFromMessage("session-a", "message-a")
    expect(store.getState().session.some(item => item.sessionId === fork.sessionId)).toBe(true)
    expect(useSessionUIStore.getState().currentSessionId).toBe(fork.sessionId)
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(directory)
  })

  test("a failed fork leaves the source and selection unchanged", async () => {
    const { store, source, create } = prepareFork()
    create.mockRejectedValue(new Error("fork failed"))
    await expect(forkAfterMessage("session-a", "message-a")).rejects.toThrow("fork failed")
    expect(store.getState().session).toEqual([source])
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
  })

  test("a fork returned after a runtime switch is not inserted or selected", async () => {
    const { store, source, fork, create } = prepareFork()
    create.mockImplementation(async () => { changeRuntime(); return { session: fork } })
    expect(await forkAfterMessage("session-a", "message-a")).toBeNull()
    expect(store.getState().session).toEqual([source])
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
  })

  test("rejects a fork returned in an unrelated workspace", async () => {
    const { store, source, fork, create } = prepareFork()
    create.mockResolvedValue({ session: { ...fork, workspaceId: "other-workspace" } })
    await expect(forkAfterMessage("session-a", "message-a")).rejects.toThrow("source workspace")
    expect(store.getState().session).toEqual([source])
  })

  test("last-completed-turn fork uses native Turn status, not the presence of assistant text", async () => {
    const { create, fork } = prepareFork()
    const completedUser = nativeMessage("session-a", "finished-user", 1)
    const completed = { ...nativeMessage("session-a", "finished", 2, "assistant"), turnId: completedUser.turnId }
    const runningUser = nativeMessage("session-a", "running-user", 3)
    const running = { ...nativeMessage("session-a", "streaming", 4, "assistant"), turnId: runningUser.turnId }
    const snapshot = nativeSnapshot("session-a", [completedUser, completed, runningUser, running])
    snapshot.turns = [
      { turnId: completedUser.turnId, sessionId: "session-a", runId: "run-a", status: "completed", userMessageId: completedUser.messageId, assistantMessageIds: [completed.messageId], startedAt: 1, finishedAt: 2 },
      { turnId: runningUser.turnId, sessionId: "session-a", runId: "run-b", status: "running", userMessageId: runningUser.messageId, assistantMessageIds: [running.messageId], startedAt: 3 },
    ]
    snapshot.session = { ...snapshot.session, runtimeStatus: "running", activeRunId: "run-b" }
    snapshot.activeRun = { sessionId: "session-a", runId: "run-b", status: "running", origin: "host", createdAt: 3 }
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    const result = await forkFromLastCompletedTurn("session-a")
    expect(result?.sessionId).toBe(fork.sessionId)
    expect(create).toHaveBeenCalled()
  })

  test("searches earlier native history when the current window has no completed turn", async () => {
    const { create, fork } = prepareFork()
    const current = nativeMessage("session-a", "current-user", 3)
    const snapshot = nativeSnapshot("session-a", [current])
    snapshot.session = { ...snapshot.session, runtimeStatus: "running", activeRunId: "run-b" }
    snapshot.activeRun = { sessionId: "session-a", runId: "run-b", status: "running", origin: "host", createdAt: 3 }
    snapshot.turns = [{ turnId: current.turnId, sessionId: "session-a", runId: "run-b", status: "running", userMessageId: current.messageId, assistantMessageIds: [], startedAt: 3 }]
    snapshot.window.hasEarlier = true
    const user = nativeMessage("session-a", "older-user", 1)
    const completed = { ...nativeMessage("session-a", "older-answer", 2, "assistant"), turnId: user.turnId }
    const page = nativeHistory([user, completed], null, snapshot)
    page.turns = [{ turnId: user.turnId, sessionId: "session-a", runId: "run-a", status: "completed", userMessageId: user.messageId, assistantMessageIds: [completed.messageId], startedAt: 1, finishedAt: 2 }]
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    const history = spyOn(canonicalClient, "getHistory").mockResolvedValue(page)
    const result = await forkFromLastCompletedTurn("session-a")
    expect(history).toHaveBeenCalledTimes(1)
    expect(result?.sessionId).toBe(fork.sessionId)
    expect(create).toHaveBeenCalled()
  })

  test("no completed native turn refuses the fork without issuing a command", async () => {
    const { create } = prepareFork()
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(nativeSnapshot("session-a", []))
    await expect(forkFromLastCompletedTurn("session-a")).rejects.toBeInstanceOf(NothingToForkError)
    expect(create).not.toHaveBeenCalled()
  })
})

describe("review-flow optimistic send", () => {
  function canonicalUserMessage(sessionId: string, messageId: string, content: string, createdAt = 10): Message {
    return {
      messageId, sessionId, turnId: `turn-${messageId}`, role: "user", createdAt,
      parts: [{ type: "text", partId: `part-${messageId}`, content }],
    }
  }

  function reviewRun(runId = "run-review"): Run {
    return { runId, sessionId: "session-a", status: "running", origin: "host", createdAt: 2 }
  }

  function runTurn(run: Run, userMessage: Message): Turn {
    return {
      turnId: userMessage.turnId, sessionId: userMessage.sessionId, runId: run.runId, status: "running",
      userMessageId: userMessage.messageId, assistantMessageIds: [], startedAt: userMessage.createdAt,
    }
  }

  function snapshotWithRun(run: Run, userMessage: Message): SessionSnapshot {
    const snapshot = nativeSnapshot("session-a", [userMessage])
    snapshot.turns = [runTurn(run, userMessage)]
    snapshot.session = { ...snapshot.session, runtimeStatus: "running", activeRunId: run.runId }
    snapshot.activeRun = run
    return snapshot
  }

  function useOptimisticLoader(getSnapshot: () => Promise<SessionSnapshot>): void {
    const optimisticLoader = new SessionMessageLoader(manager, { runtimeKey: "actions", client: nativeClient({ getSnapshot }) })
    loader = optimisticLoader
    setImperativeSessionMessageLoader(optimisticLoader)
    setOptimisticRefs(
      (input) => optimisticLoader.optimisticAdd({ ...input, directory: input.directory || directory }),
      (input) => optimisticLoader.optimisticRemove({ ...input, directory: input.directory || directory }),
      (input) => optimisticLoader.optimisticConfirm({ ...input, directory: input.directory || directory }),
    )
  }

  test("inserts its pending user message before transport settles and removes only that record on a definite failure", async () => {
    const existing = canonicalUserMessage("session-a", "existing", "Earlier prompt", 1)
    const store = seed()
    store.setState({ message: { "session-a": [existing] } })
    useOptimisticLoader(async () => nativeSnapshot("session-a", [existing]))

    let pendingId = ""
    let duringSend: Message[] = []
    await expect(optimisticSend({
      sessionId: "session-a",
      directory,
      content: "Review feedback",
      onMessageID: (messageId) => { pendingId = messageId },
      send: async () => {
        duringSend = store.getState().message["session-a"] ?? []
        throw new Error("rejected")
      },
    })).rejects.toThrow("rejected")

    const pending = duringSend.filter((message) => message.messageId === pendingId)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.role).toBe("user")
    expect(pending[0]?.parts).toEqual([{ type: "text", partId: expect.any(String), content: "Review feedback" }])
    expect(store.getState().message["session-a"]).toEqual([existing])
  })

  test("reconciles an accepted send with the canonical history read without duplicating it", async () => {
    const run = reviewRun()
    const canonical = canonicalUserMessage("session-a", "canonical-user", "Review feedback", 20)
    const store = seed()
    let snapshot = nativeSnapshot("session-a", [])
    useOptimisticLoader(async () => snapshot)

    await optimisticSend({
      sessionId: "session-a",
      directory,
      content: "Review feedback",
      send: async () => {
        snapshot = snapshotWithRun(run, canonical)
        return run
      },
    })

    expect(store.getState().message["session-a"]).toEqual([canonical])
  })

  test("keeps an accepted pending record until the canonical turn arrives, then removes it without duplication", async () => {
    const run = reviewRun()
    const store = seed()
    let snapshot = nativeSnapshot("session-a", [])
    useOptimisticLoader(async () => snapshot)

    await optimisticSend({
      sessionId: "session-a",
      directory,
      content: "Review feedback",
      send: async () => run,
    })

    const pending = store.getState().message["session-a"] ?? []
    expect(pending).toHaveLength(1)
    expect(pending[0]?.role).toBe("user")

    const canonical = canonicalUserMessage("session-a", "canonical-user", "Review feedback", 20)
    snapshot = snapshotWithRun(run, canonical)
    store.setState((state) => ({
      message: { ...state.message, "session-a": [...(state.message["session-a"] ?? []), canonical] },
      snapshot: { ...state.snapshot, "session-a": snapshot },
    }))
    expect(store.getState().message["session-a"]).toEqual([canonical])
  })

  test("does not mistake an earlier identical user message for this send's canonical record", async () => {
    const run = reviewRun()
    const existing = canonicalUserMessage("session-a", "existing", "Review feedback", 1)
    const canonical = canonicalUserMessage("session-a", "canonical-user", "Review feedback", 20)
    const store = seed()
    store.setState({ message: { "session-a": [existing] } })
    let snapshot = nativeSnapshot("session-a", [existing])
    useOptimisticLoader(async () => snapshot)

    await optimisticSend({
      sessionId: "session-a",
      directory,
      content: "Review feedback",
      send: async () => run,
    })

    const accepted = store.getState().message["session-a"] ?? []
    expect(accepted).toHaveLength(2)
    expect(accepted[0]).toEqual(existing)

    snapshot = snapshotWithRun(run, canonical)
    store.setState((state) => ({
      message: { ...state.message, "session-a": [...(state.message["session-a"] ?? []), canonical] },
      snapshot: { ...state.snapshot, "session-a": snapshot },
    }))
    expect(store.getState().message["session-a"]).toEqual([existing, canonical])
  })
  test("normal send path renders user message before createRun resolves and reconciles once accepted", async () => {
    const store = seed()
    let duringSend: Message[] = []
    const createRunDeferred = Promise.withResolvers<{ run: Run }>()
    spyOn(canonicalClient, "createRun").mockImplementation(async () => {
      duringSend = store.getState().message["session-a"] ?? []
      return createRunDeferred.promise
    })

    const run: Run = { runId: "run-normal", sessionId: "session-a", status: "running", origin: "host", createdAt: 1 }
    const promptRequest: PromptRequest = {
      input: { text: "Optimistic user prompt", attachments: [], context: [] },
      options: { providerId: "provider-a", modelId: "model-a", agentId: null, variant: null, reasoningEffort: null },
    }

    useOptimisticLoader(async () => nativeSnapshot("session-a", []))

    const streamAttached: string[] = []
    setActionRefs(manager, () => currentDirectory, undefined, (sessionId) => {
      streamAttached.push(sessionId)
    })

    const sendPromise = sendMessage({
      sessionId: "session-a",
      directory,
      request: promptRequest,
      optimistic: true,
    })
    await Promise.resolve()

    expect(streamAttached).toEqual(["session-a"])
    expect(duringSend).toHaveLength(1)
    expect(duringSend[0]?.role).toBe("user")
    expect(duringSend[0]?.parts).toEqual([{ type: "text", partId: expect.any(String), content: "Optimistic user prompt" }])

    createRunDeferred.resolve({ run })
    const acceptedRun = await sendPromise
    expect(acceptedRun).toEqual(run)

    expect(store.getState().message["session-a"]).toHaveLength(1)

    const canonical = canonicalUserMessage("session-a", "canonical-normal-user", "Optimistic user prompt", 10)
    const snapshot = snapshotWithRun(run, canonical)
    store.setState((state) => ({
      message: { ...state.message, "session-a": [...(state.message["session-a"] ?? []), canonical] },
      snapshot: { ...state.snapshot, "session-a": snapshot },
    }))

    expect(store.getState().message["session-a"]).toEqual([canonical])
  })

  test("failed normal send removes optimistic message and records send failure", async () => {
    const store = seed()
    let duringSend: Message[] = []
    spyOn(canonicalClient, "createRun").mockImplementation(async () => {
      duringSend = store.getState().message["session-a"] ?? []
      throw new Error("createRun network failure")
    })

    const promptRequest: PromptRequest = {
      input: { text: "Will fail", attachments: [], context: [] },
      options: { providerId: "provider-a", modelId: "model-a", agentId: null, variant: null, reasoningEffort: null },
    }

    useOptimisticLoader(async () => nativeSnapshot("session-a", []))

    await expect(sendMessage({
      sessionId: "session-a",
      directory,
      request: promptRequest,
      optimistic: true,
    })).rejects.toThrow("createRun network failure")

    expect(duringSend).toHaveLength(1)
    expect(store.getState().message["session-a"]).toEqual([])
  })
})

describe("linking items through the server", () => {
  const issue: LinkedIssue = {
    id: "owner/repo#12",
    number: 12,
    title: "Rail badge count",
    url: "https://github.com/owner/repo/issues/12",
    kind: "issue",
    author: "someone",
    linkedAt: 1,
  }
  const guestEntry: LinkedIssue = {
    id: "guest:linear:ENG-1",
    providerId: "linear",
    identifier: "ENG-1",
    title: "Spec",
    url: "https://linear.app/openchamber/issue/ENG-1",
    kind: "guest",
    thread: "issue",
    linkedAt: 2,
  }

  test("sends the operation to the links route and mirrors the answer into the stores", async () => {
    const store = seed()
    // The metadata is what the server answered, not a list the client computed
    // from its own read.
    const metadata = { openchamber: { linked_issues: [issue, guestEntry] } }
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ metadata }))

    const updated = await setLinkedIssue("session-a", directory, guestEntry, true)

    const calls = fetch.mock.calls.filter(([input]) => String(input).includes("/sessions/session-a/links"))
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ entries: [guestEntry], linked: true })
    expect(updated.metadata).toEqual(metadata)
    expect(useGlobalSessionsStore.getState().entityById.get("session-a")?.metadata).toEqual(metadata)
    expect(store.getState().session[0]?.metadata).toEqual(metadata)
  })

  test("adds every item of a batch in one request", async () => {
    seed()
    const metadata = { openchamber: { linked_issues: [issue, guestEntry] } }
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ metadata }))

    await addLinkedIssues("session-a", directory, [issue, guestEntry])

    const calls = fetch.mock.calls.filter(([input]) => String(input).includes("/sessions/session-a/links"))
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ entries: [issue, guestEntry], linked: true })
  })

  test("serializes Linear in its documented stored form alongside neutral tracker links", async () => {
    seed()
    const linear: LinkedIssue = { id: "linear:ENG-3", kind: "tracker", provider: "linear", identifier: "ENG-3", title: "Spec", url: "https://linear.app/x/issue/ENG-3", linkedAt: 3 }
    const tracker: LinkedIssue = { id: "jira:OPS-4", kind: "tracker", provider: "jira", identifier: "OPS-4", title: "Outage", url: "https://jira.example/browse/OPS-4", linkedAt: 4 }
    const storedLinear = { ...linear, kind: "linear" }
    const metadata = { openchamber: { linked_issues: [issue, storedLinear, tracker] } }
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ metadata }))

    const updated = await addLinkedIssues("session-a", directory, [issue, linear, tracker])

    const calls = fetch.mock.calls.filter(([input]) => String(input).includes("/sessions/session-a/links"))
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ entries: [issue, storedLinear, tracker], linked: true })
    expect(updated.metadata).toEqual(metadata)
  })

  test("rejects when the server cannot serve the route, like the callers' catch expects", async () => {
    seed()
    spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }))

    await expect(setLinkedIssue("session-a", directory, issue, true))
      .rejects.toThrow("session link update failed")
  })

  test("treats a malformed answer as unavailable instead of as a success", async () => {
    seed()
    spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ nope: true }))

    await expect(setLinkedIssue("session-a", directory, issue, true))
      .rejects.toThrow("session link update failed")
<<<<<<< HEAD
||||||| bc50ba56aa
    expect(globalUpsertedSessions).toEqual([])
  })
})

describe("session restore (unarchive)", () => {
  // The route answers with stamps; the full record comes from the archived
  // list the global store already holds.
  const restored = (id: string, directory: string, archivedAt: number | null = null) => {
    globalArchivedSessions.push({
      id,
      projectID: "project-main",
      directory,
      title: `Title ${id}`,
      time: { created: 1, updated: 1, archived: 5 },
    } as unknown as Session)
    return { id, archivedAt }
  }

  beforeEach(async () => {
    replyCalls.length = 0
    registeredSessionDirectories.length = 0
    movedSessionDirectories.length = 0
    globalUpsertedSessions.length = 0
    globalActiveSessions.length = 0
    globalArchivedSessions.length = 0
    openchamberRouteRequests.length = 0
    beforeArchiveRouteResolve = null
    unarchiveBatchResponse = { status: 404, body: { error: "not found" } }
    activeStatusSnapshot = {}
    readActiveStatusSnapshot = async () => activeStatusSnapshot
    runtimeKey = "default-runtime"
    globalHasLoaded = true
    deletedChatDirectories.length = 0
    const { resetSessionOrdering } = await import("./session-ordering")
    resetSessionOrdering()
  })

  test("does not restore locally until the server returns the restored session", async () => {
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    const { takeSessionActionFailure } = await import("./session-action-failures")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(false)
    expect(takeSessionActionFailure(["session-a"])?.message).toContain("unarchive failed")
    expect(globalUpsertedSessions).toEqual([])
    expect(registeredSessionDirectories).toEqual([])
    const { useSessionOrderingStore } = await import("./session-ordering")
    expect(useSessionOrderingStore.getState().rankById.has("session-a")).toBe(false)
  })

  test("upserts the restored session and re-registers its directory after confirmation", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(true)
    expect(openchamberRouteRequests).toHaveLength(1)
    expect(openchamberRouteRequests[0].path).toBe("/api/openchamber/sessions/unarchive")
    expect(openchamberRouteRequests[0].body).toMatchObject({ ids: ["session-a"] })
    expect((globalUpsertedSessions[0] as Session)?.time?.archived).toBeUndefined()
    expect((globalUpsertedSessions[0] as Session)?.title).toBe("Title session-a")
    expect(registeredSessionDirectories).toEqual([{ sessionID: "session-a", directory: "/test/project" }])
    const { useSessionOrderingStore } = await import("./session-ordering")
    const rank = useSessionOrderingStore.getState().rankById.get("session-a")
    expect(rank ?? 0).toBeGreaterThan(0)
  })

  test("restores a parent together with its archived subsessions", async () => {
    const parent = restored("parent", "/test/project")
    globalArchivedSessions.push(
      { ...sessionFixture("child"), directory: "/test/project", parentID: "parent", time: { created: 1, updated: 1, archived: 5 } } as unknown as Session,
      { ...sessionFixture("grandchild"), directory: "/test/project", parentID: "child", time: { created: 1, updated: 1, archived: 5 } } as unknown as Session,
    )
    beforeArchiveRouteResolve = (path) => {
      if (!path.endsWith("/unarchive")) return
      const ids = openchamberRouteRequests.at(-1)?.body.ids
      const id = Array.isArray(ids) ? String(ids[0]) : ""
      unarchiveBatchResponse = { status: 200, body: { restored: [id === "parent" ? parent : { id, archivedAt: null }], failedIds: [] } }
    }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("parent")).toBe(true)
    expect(openchamberRouteRequests.map((request) => request.body.ids)).toEqual([["parent"], ["child"], ["grandchild"]])
  })

  test("restores linked reviews with the source while leaving archived forks untouched", async () => {
    globalArchivedSessions.push(
      { ...archivedFixture("review"), metadata: { openchamber: { kind: "review", originalSessionID: "session-a" } } },
      { ...archivedFixture("review-child"), parentID: "review" },
      { ...archivedFixture("fork"), fork: { sessionID: "session-a", boundary: { type: "through", messageID: "message" } } },
      { ...archivedFixture("promoted"), metadata: { openchamber: { btwPromoted: true } }, fork: { sessionID: "session-a", boundary: { type: "through", messageID: "message" } } },
    )
    beforeArchiveRouteResolve = (path) => {
      if (!path.endsWith("/unarchive")) return
      const ids = openchamberRouteRequests.at(-1)?.body.ids
      const id = Array.isArray(ids) ? String(ids[0]) : ""
      unarchiveBatchResponse = { status: 200, body: { restored: [{ id, archivedAt: null }], failedIds: [] } }
    }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(true)
    expect(openchamberRouteRequests.map((request) => request.body.ids)).toEqual([["session-a"], ["review"], ["review-child"]])
  })

  test("restores a subsession on its own when its parent is active", async () => {
    globalActiveSessions = [sessionFixture("parent")]
    globalArchivedSessions.push({ ...archivedFixture("child"), parentID: "parent" }, { ...archivedFixture("grandchild"), parentID: "child" })
    beforeArchiveRouteResolve = (path) => {
      if (!path.endsWith("/unarchive")) return
      const ids = openchamberRouteRequests.at(-1)?.body.ids
      unarchiveBatchResponse = { status: 200, body: { restored: [{ id: Array.isArray(ids) ? String(ids[0]) : "", archivedAt: null }], failedIds: [] } }
    }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    // Its own archived subsessions come back with it.
    expect(await unarchiveSession("child")).toBe(true)
    expect(openchamberRouteRequests.map((request) => request.body.ids)).toEqual([["child"], ["grandchild"]])
  })

  test("never restores a subsession of an archived or unknown parent on its own", async () => {
    globalArchivedSessions.push(
      { ...sessionFixture("child"), directory: "/test/project", parentID: "parent", time: { created: 1, updated: 1, archived: 5 } } as unknown as Session,
    )
    unarchiveBatchResponse = { status: 200, body: { restored: [{ id: "child", archivedAt: null }], failedIds: [] } }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, unarchiveSessions, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("child")).toBe(false)
    expect(await unarchiveSessions(["child"])).toEqual({ restoredIds: [], failedIds: ["child"] })
    expect(openchamberRouteRequests).toEqual([])

    // The same once the parent is known and archived.
    globalArchivedSessions.push(archivedFixture("parent"))
    expect(await unarchiveSession("child")).toBe(false)
    expect(openchamberRouteRequests).toEqual([])

    // Undo puts back exactly what an archive just moved, subsessions included.
    expect(await unarchiveSessions(["child"], { undo: true })).toEqual({ restoredIds: ["child"], failedIds: [] })
  })

  test("archive then immediately restore recovers the running status instead of treating an old snapshot as idle", async () => {
    archiveBatchResponse = { status: 200, body: { archived: [{ id: "session-a", archivedAt: 2 }], failedIds: [] } }
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    activeStatusSnapshot = { "session-a": { type: "busy" } }
    const source = createStore({}, {
      session: [{ ...sessionFixture("session-a"), directory: "/test/project" }],
      session_status: { "session-a": { type: "busy" } },
      sessionStatusReady: true,
    })
    const { archiveSession, unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await archiveSession("session-a")).toBe(true)
    expect(source.getState().session_status["session-a"]).toBeUndefined()
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBe(true)
    expect(await unarchiveSession("session-a")).toBe(true)
    expect(source.getState().session_status["session-a"]).toEqual({ type: "busy" })
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBeUndefined()
  })

  test("reads the owning space's status before settling a restored session", async () => {
    const spaceDirectory = "/spaces/a1b2c3d4e5f6/app"
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", spaceDirectory)], failedIds: [] } }
    const source = createStore({}, { sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const statusReadDirectories: Array<string | null | undefined> = []
    readActiveStatusSnapshot = async (directory): Promise<Record<string, SessionStatus>> => {
      expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBe(true)
      expect(source.getState().session_status["session-a"]).toBeUndefined()
      statusReadDirectories.push(directory)
      return directory === spaceDirectory ? { "session-a": { type: "busy" } } : {}
    }
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[spaceDirectory, source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(true)
    expect(statusReadDirectories).toEqual([spaceDirectory])
    expect(source.getState().session_status["session-a"]).toEqual({ type: "busy" })
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBeUndefined()
  })

  test("a failed restore status read leaves the session unknown without undoing the restore", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    activeStatusSnapshot = null
    const source = createStore({}, { sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(true)
    expect(source.getState().session_status["session-a"]).toBeUndefined()
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBe(true)
  })

  test("a runtime switch during the status read keeps a confirmed restore in restoredIds", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    const source = createStore({}, { sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const { switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    const { takeSessionActionFailure } = await import("./session-action-failures")
    const { unarchiveSessions, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")
    takeSessionActionFailure(["session-a", "session-b"])
    readActiveStatusSnapshot = async () => {
      switchRuntimeEndpoint({ apiBaseUrl: "http://restore-status-runtime-b.test", runtimeKey: "restore-status-runtime-b" })
      return { "session-a": { type: "busy" } }
    }

    expect(await unarchiveSessions(["session-a", "session-b"])).toEqual({
      restoredIds: ["session-a"], failedIds: ["session-b"],
    })
    expect(globalUpsertedSessions).toHaveLength(1)
    expect(source.getState().session_status["session-a"]).toBeUndefined()
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBe(true)
    expect(openchamberRouteRequests.map((request) => request.body.ids)).toEqual([["session-a"]])
    // A confirmed restore is not an action failure; the unattempted ID has no server error either.
    expect(takeSessionActionFailure(["session-a", "session-b"])).toBeNull()
  })

  test("a rejected status read cannot turn an already-confirmed restore into an action failure", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    const source = createStore({}, { sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const { takeSessionActionFailure } = await import("./session-action-failures")
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")
    takeSessionActionFailure(["session-a"])
    readActiveStatusSnapshot = async () => { throw new Error("status read failed") }

    expect(await unarchiveSession("session-a")).toBe(true)
    expect(globalUpsertedSessions).toHaveLength(1)
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBe(true)
    expect(takeSessionActionFailure(["session-a"])).toBeNull()
  })

  test("a status event during the restore read wins over its older snapshot", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    let resolveSnapshot: (snapshot: Record<string, SessionStatus>) => void = () => undefined
    let notifyReadStart: () => void = () => undefined
    const readStarted = new Promise<void>((resolve) => { notifyReadStart = resolve })
    readActiveStatusSnapshot = () => {
      notifyReadStart()
      return new Promise((resolve) => { resolveSnapshot = resolve })
    }
    const source = createStore({}, { sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    const restoring = unarchiveSession("session-a")
    await readStarted
    source.setState({ session_status: { "session-a": { type: "busy" } }, sessionStatusInvalidated: {} })
    resolveSnapshot({})
    expect(await restoring).toBe(true)
    expect(source.getState().session_status["session-a"]).toEqual({ type: "busy" })
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBeUndefined()
  })

  test("fails when the server keeps the session archived", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project", 2)], failedIds: [] } }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    // A silent server-side no-op must surface as a failure, not a success toast.
    expect(await unarchiveSession("session-a")).toBe(false)
    expect(globalUpsertedSessions).toEqual([])
    expect(registeredSessionDirectories).toEqual([])
    const { useSessionOrderingStore } = await import("./session-ordering")
    expect(useSessionOrderingStore.getState().rankById.has("session-a")).toBe(false)
  })

  test("fails when the answer omits the session that was asked for", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [], failedIds: ["session-a"] } }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(false)
    expect(globalUpsertedSessions).toEqual([])
  })

  test("restores a worktree session into its own directory, not the parent project", async () => {
    const worktreeDirectory = "/projects/main/.worktrees/feature-a"
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-worktree", worktreeDirectory)], failedIds: [] } }

    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[worktreeDirectory, createStore({})]]), () => worktreeDirectory)

    expect(await unarchiveSession("session-worktree")).toBe(true)
    expect(movedSessionDirectories).toEqual([])
    expect(registeredSessionDirectories).toEqual([{ sessionID: "session-worktree", directory: worktreeDirectory }])
    expect((globalUpsertedSessions[0] as SessionWithDirectory).directory).toBe(worktreeDirectory)
  })

  test("rejects a restore response that arrives after a runtime switch", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    const source = createStore({}, { session: [] })
    const { getRuntimeKey, switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    switchRuntimeEndpoint({ apiBaseUrl: "http://restore-runtime-a.test", runtimeKey: "restore-runtime-a" })
    beforeArchiveRouteResolve = () => {
      switchRuntimeEndpoint({ apiBaseUrl: "http://restore-runtime-b.test", runtimeKey: "restore-runtime-b" })
    }
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(false)
    expect(getRuntimeKey()).toBe("restore-runtime-b")
    // The stale response must not reconcile the runtime the user switched to.
    expect(globalUpsertedSessions).toEqual([])
    expect(registeredSessionDirectories).toEqual([])
    const { useSessionOrderingStore } = await import("./session-ordering")
    expect(useSessionOrderingStore.getState().rankById.has("session-a")).toBe(false)
  })

  test("keeps confirmed sessions and fails the rest when the runtime changes mid-batch", async () => {
    unarchiveBatchResponse = {
      status: 200,
      body: {
        restored: [
          restored("session-a", "/test/project"),
          restored("session-b", "/test/project"),
        ],
        failedIds: [],
      },
    }
    const source = createStore({}, { session: [] })
    const { switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    switchRuntimeEndpoint({ apiBaseUrl: "http://restore-batch-a.test", runtimeKey: "restore-batch-a" })
    let requests = 0
    beforeArchiveRouteResolve = () => {
      requests += 1
      if (requests === 2) {
        switchRuntimeEndpoint({ apiBaseUrl: "http://restore-batch-b.test", runtimeKey: "restore-batch-b" })
      }
    }
    const { unarchiveSessions, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    const result = await unarchiveSessions(["session-a", "session-b", "session-c"])

    // session-a was confirmed before the switch and stays restored; session-b's
    // response is stale and session-c is never attempted, so both are reported
    // as failures instead of being silently dropped.
    expect(result).toEqual({ restoredIds: ["session-a"], failedIds: ["session-b", "session-c"] })
    expect(globalUpsertedSessions).toHaveLength(1)
    // session-c must not reach the server after the runtime changed.
    expect(openchamberRouteRequests.map((request) => request.body.ids)).toEqual([["session-a"], ["session-b"]])
  })
})

describe("fetchMessagesForSession startup race", () => {
  test("does not reject before sync action refs are initialized", async () => {
    const { fetchMessagesForSession } = await import("./session-actions")

    let error: unknown = null
    try {
      await fetchMessagesForSession("session-a", "/test/project")
    } catch (err) {
      error = err
    }

    expect(error).toBe(null)
  })
})

describe("updateSessionTitle live state", () => {
  beforeEach(() => {
    replyCalls.length = 0
    globalUpsertedSessions.length = 0
    sessionRecords.clear()
  })

  test("updates the live directory store after renaming", async () => {
    const oldSession = { ...sessionFixture("session-a"), title: "Old Title" }
    const sessionStore = createStore({}, { session: [oldSession] })
    const childStores = createChildStores([["/test/project", sessionStore]])
    sessionRecords.set("session-a", oldSession)

    const { setActionRefs, updateSessionTitle } = await import("./session-actions")
    setActionRefs(childStores, () => "/current/project")

    await updateSessionTitle("session-a", "New Title")

    const renameCall = replyCalls.find((call) => call.method === "session.rename")
    expect(renameCall?.params.sessionID).toBe("session-a")
    expect(renameCall?.params.title).toBe("New Title")
    expect(renameCall?.params.directory).toBe("/test/project")
    // `session.update` answers with nothing, so the published record is the
    // re-read session rather than a locally patched copy.
    expect((globalUpsertedSessions[0] as Session)?.title).toBe("New Title")
    expect(sessionStore.getState().session[0].title).toBe("New Title")
  })

  test("renames a worktree session against its own directory, not the project root that indexes its status", async () => {
    const worktreeSession = { ...sessionFixture("session-wt"), directory: "/test/project/.worktrees/feature", title: "Old Title" }
    globalActiveSessions = [worktreeSession]
    sessionRecords.set("session-wt", worktreeSession)
    // The project root's store knows the session only through the status index
    // it receives for its worktrees; the session record itself lives elsewhere.
    const rootStore = createStore({}, { session: [], session_status: { "session-wt": { type: "idle" } } })
    const childStores = createChildStores([["/test/project", rootStore]])

    const { setActionRefs, updateSessionTitle } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await updateSessionTitle("session-wt", "New Title")

    const renameCall = replyCalls.find((call) => call.method === "session.rename")
    expect(renameCall?.params.directory).toBe("/test/project/.worktrees/feature")
    globalActiveSessions = []
  })
})

describe("optimisticSend target directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    commitRevertError = null
  })

  test("passes the prompt directory to optimistic state during session switch races", async () => {
    const currentStore = createStore({})
    const targetStore = createStore({})
    const childStores = createChildStores([
      ["/current/project", currentStore],
      ["/target/project", targetStore],
    ])
    let optimisticAdd: OptimisticAddCall | null = null
    let optimisticRemove: OptimisticRemoveCall | null = null
    let sentMessageID = ""

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/current/project")
    setOptimisticRefs(
      (input) => {
        optimisticAdd = input
      },
      (input) => {
        optimisticRemove = input
      },
    )

    await optimisticSend({
      sessionId: "session-new",
      directory: "/target/project",
      content: "hello",
      send: async (messageID) => {
        sentMessageID = messageID
      },
    })

    expect(optimisticAdd).not.toBeNull()
    const add = optimisticAdd as unknown as OptimisticAddCall
    expect(add.directory).toBe("/target/project")
    expect(add.sessionID).toBe("session-new")
    expect(add.message.id).toBe(sentMessageID)
    expect(optimisticRemove).toBe(null)
    expect(targetStore.getState().session_status["session-new"]?.type).toBe("busy")
    expect(currentStore.getState().session_status["session-new"]).toBe(undefined)
  })

  test("marks the prompt as being sent until its request settles, accepted or rejected", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    const { hasPromptInFlight } = await import("./prompts-in-flight")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(() => {}, () => {})

    let inFlightDuringSend = false
    await optimisticSend({
      sessionId: "session-cold",
      directory: "/target/project",
      content: "hello",
      send: async () => { inFlightDuringSend = hasPromptInFlight("session-cold") },
    })
    expect(inFlightDuringSend).toBe(true)
    expect(hasPromptInFlight("session-cold")).toBe(false)

    await expect(optimisticSend({
      sessionId: "session-cold",
      directory: "/target/project",
      content: "again",
      send: async () => { throw new Error("rejected") },
    })).rejects.toThrow("rejected")
    expect(hasPromptInFlight("session-cold")).toBe(false)
    expect(targetStore.getState().session_status["session-cold"]?.type).toBe("idle")
  })

  test("commits the new branch locally and discards its optimistic shadow when sending after a revert", async () => {
    const retainedMessage = { id: "msg_ffffffffffffRetained", role: "user", sessionID: "session-reverted", time: { created: 1 } } as Message
    const revertedMessage = { id: "msg_000000000000Reverted", role: "user", sessionID: "session-reverted", time: { created: 2 } } as Message
    const targetStore = createStore({}, {
      session: [{ id: "session-reverted", revert: { messageID: revertedMessage.id } } as Session],
      message: { "session-reverted": [retainedMessage, revertedMessage] },
      part: { [revertedMessage.id]: [{ id: "part_2", type: "text", text: "old branch" } as Part] },
    })
    const childStores = createChildStores([["/target/project", targetStore]])
    let optimisticMessage: Message | null = null
    const optimisticShadow = new Set([revertedMessage.id])

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      (input) => {
        optimisticMessage = input.message
        optimisticShadow.add(input.message.id)
        targetStore.setState((state) => ({
          message: { ...state.message, [input.sessionID]: [...(state.message[input.sessionID] ?? []), input.message] },
          part: { ...state.part, [input.message.id]: input.parts },
        }))
      },
      () => {},
      (input) => optimisticShadow.delete(input.messageID),
    )

    await optimisticSend({
      sessionId: "session-reverted",
      directory: "/target/project",
      content: "new branch",
      send: async () => {},
    })

    expect(targetStore.getState().session[0].revert).toBe(undefined)
    expect(targetStore.getState().message["session-reverted"].map((message) => message.id)).toEqual([
      retainedMessage.id,
      (optimisticMessage as unknown as Message).id,
    ])
    expect(targetStore.getState().part[revertedMessage.id]).toBe(undefined)
    expect(optimisticShadow.has(revertedMessage.id)).toBe(false)
    expect(optimisticShadow.has((optimisticMessage as unknown as Message).id)).toBe(true)
  })

  // A failed send puts the revert back only while the server still has it staged.
  for (const { outcome, commit, serverStaged, restored } of [
    { outcome: "before the commit", commit: "none", serverStaged: true, restored: true },
    { outcome: "after the server committed the revert", commit: "answered", serverStaged: false, restored: false },
    { outcome: "after a lost commit response the server applied", commit: "lost", serverStaged: false, restored: false },
    { outcome: "after a lost commit response the server did not apply", commit: "lost", serverStaged: true, restored: true },
  ] as const) test(`${restored ? "restores" : "keeps dropped"} the reverted branch when sending fails ${outcome}`, async () => {
    const retainedMessage = { id: "msg_ffffffffffffRetained", role: "user", sessionID: "session-reverted", time: { created: 1 } } as Message
    const revertedMessage = { id: "msg_000000000000Reverted", role: "user", sessionID: "session-reverted", time: { created: 2 } } as Message
    const revertedPart = { id: "part_2", type: "text", text: "old branch" } as Part
    const targetStore = createStore({}, {
      session: [{ id: "session-reverted", revert: { messageID: revertedMessage.id } } as Session],
      message: { "session-reverted": [retainedMessage, revertedMessage] },
      part: { [revertedMessage.id]: [revertedPart] },
    })
    const childStores = createChildStores([["/target/project", targetStore]])
    sessionRecords.set("session-reverted", serverStaged ? { ...sessionFixture("session-reverted"), revert: { messageID: revertedMessage.id } } : sessionFixture("session-reverted"))
    if (commit === "lost") commitRevertError = Object.assign(new Error("gateway timeout"), { status: 504 })

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      (input) => targetStore.setState((state) => ({
        message: { ...state.message, [input.sessionID]: [...(state.message[input.sessionID] ?? []), input.message] },
        part: { ...state.part, [input.message.id]: input.parts },
      })),
      (input) => targetStore.setState((state) => ({
        message: { ...state.message, [input.sessionID]: (state.message[input.sessionID] ?? []).filter((message) => message.id !== input.messageID) },
        part: Object.fromEntries(Object.entries(state.part).filter(([messageID]) => messageID !== input.messageID)),
      })),
    )

    await expect(optimisticSend({
      sessionId: "session-reverted",
      directory: "/target/project",
      content: "new branch",
      send: async (_messageID, _context, commitRevert) => {
        if (commit !== "none") await commitRevert?.()
        throw new Error("rejected")
      },
    })).rejects.toThrow()

    expect(targetStore.getState().session[0].revert).toEqual(restored ? { messageID: revertedMessage.id } : undefined)
    expect(targetStore.getState().message["session-reverted"]).toEqual(restored ? [retainedMessage, revertedMessage] : [retainedMessage])
    expect(targetStore.getState().part[revertedMessage.id]).toEqual(restored ? [revertedPart] : undefined)
  })

  test("runs appendSubmissions before revert cleanup and optimistic insertion", async () => {
    const revertedMessage = { id: "msg_000000000000Reverted", role: "user", sessionID: "session-reverted", time: { created: 2 } } as Message
    const targetStore = createStore({}, {
      session: [{ id: "session-reverted", revert: { messageID: revertedMessage.id } } as Session],
      message: { "session-reverted": [revertedMessage] },
      part: { [revertedMessage.id]: [{ id: "part_2", type: "text", text: "old branch" } as Part] },
    })
    const childStores = createChildStores([["/target/project", targetStore]])
    const callOrder: string[] = []

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {
        callOrder.push("optimistic-add")
      },
      () => {},
      () => {
        callOrder.push("revert-confirm")
      },
    )

    await optimisticSend({
      sessionId: "session-reverted",
      directory: "/target/project",
      content: "new branch",
      appendSubmissions: () => {
        callOrder.push("append")
      },
      send: async () => {},
    })

    expect(callOrder).toEqual(["append", "revert-confirm", "optimistic-add"])
  })

  test("runs appendSubmissions once for a definite rejection", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let appendCalls = 0

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      () => {},
    )

    await expect(optimisticSend({
      sessionId: "session-rejected",
      directory: "/target/project",
      content: "hello",
      appendSubmissions: () => {
        appendCalls += 1
      },
      send: async () => { throw new Error("rejected") },
    })).rejects.toThrow("rejected")

    expect(appendCalls).toBe(1)
  })

  test("shows context before the prompt at once and hands the same ids to the send", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    const added: Message[] = []
    const removed: string[] = []
    let sent: { messageID: string; contextIDs: Array<string | undefined> } | null = null

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      (input) => {
        added.push(input.message)
      },
      (input) => {
        removed.push(input.messageID)
      },
    )

    const metadata = { openchamberContext: { kind: "chat-quote" as const, quote: "q", text: "t", messageId: "m" } }
    await expect(optimisticSend({
      sessionId: "session-context",
      directory: "/target/project",
      content: "",
      context: [{ text: "first", metadata }, { text: "  " }, { text: "second" }],
      send: async (messageID, context) => {
        sent = { messageID, contextIDs: context.map((item) => item.id) }
        throw new Error("rejected")
      },
    })).rejects.toThrow("rejected")

    // The blank item gets no record, the others come first with the prompt's time.
    expect(added.map((message) => message.role)).toEqual(["synthetic", "synthetic", "user"])
    expect(new Set(added.map((message) => message.time.created)).size).toBe(1)
    expect(added[0]?.metadata).toEqual(metadata)
    const ids = added.map((message) => message.id)
    expect([...ids].sort()).toEqual(ids)
    expect(sent).toEqual({ messageID: ids[2], contextIDs: [ids[0], ids[1]] })
    // A rejected send takes the context records down with the prompt.
    expect(removed).toEqual(ids)
  })

  test("shows the prompt before the knowledge write finishes, and sends only after it", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    const added: Message[] = []
    let sent: { messageID: string; texts: string[] } | null = null
    let finishWrite: () => void = () => {}
    const ready = new Promise<void>((resolve) => { finishWrite = resolve })

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs((input) => { added.push(input.message) }, () => {})

    const sending = optimisticSend({
      sessionId: "session-ready",
      directory: "/target/project",
      content: "hello",
      context: [{ text: "quoted" }],
      ready,
      send: async (messageID, context) => {
        sent = { messageID, texts: context.map((item) => item.text) }
      },
    })
    for (let tick = 0; tick < 50 && !added.some((message) => message.role === "user"); tick += 1) {
      await Promise.resolve()
    }

    // The bubble is on screen while the knowledge is still being written, and
    // nothing has been sent ahead of it.
    expect(added.map((message) => message.role)).toEqual(["synthetic", "user"])
    expect(sent).toBe(null)

    finishWrite()
    await sending
    expect(sent).toEqual({ messageID: added[1].id, texts: ["quoted"] })
  })

  test("runs appendSubmissions once for an ambiguous confirmation", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let appendCalls = 0

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      () => {},
      () => {},
    )

    await optimisticSend({
      sessionId: "session-confirmed",
      directory: "/target/project",
      content: "hello",
      appendSubmissions: () => {
        appendCalls += 1
      },
      send: async (messageID) => {
        sessionMessageRecords.set("session-confirmed", [{
          info: { id: messageID, role: "user", sessionID: "session-confirmed", time: { created: 1 } },
          parts: [{ id: "server-part", sessionID: "session-confirmed", messageID, type: "text", text: "hello" }],
        }])
        const error = new Error("Failed to send message (504): gateway timeout") as Error & { status?: number }
        error.status = 504
        throw error
      },
    })

    expect(appendCalls).toBe(1)
  })

  test("does not run appendSubmissions when the runtime changes before dispatch", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let appendCalls = 0
    const { switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    switchRuntimeEndpoint({ apiBaseUrl: "http://runtime-b.test", runtimeKey: "runtime-b" })

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      () => {},
    )

    await expect(optimisticSend({
      sessionId: "session-race",
      directory: "/target/project",
      runtimeKey: "runtime-a",
      content: "hello",
      appendSubmissions: () => {
        appendCalls += 1
      },
      send: async () => {},
    })).rejects.toThrow("runtime changed")

    expect(appendCalls).toBe(0)
  })

  test("rolls back a captured send when the runtime changes after optimistic insert", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let optimisticAdd: OptimisticAddCall | null = null
    let optimisticRemove: OptimisticRemoveCall | null = null
    let finalSendCalled = false
    const { getRuntimeKey, switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    switchRuntimeEndpoint({ apiBaseUrl: "http://runtime-a.test", runtimeKey: "runtime-a" })

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      (input) => {
        optimisticAdd = input
      },
      (input) => {
        optimisticRemove = input
      },
    )

    let caught: unknown = null
    try {
      await optimisticSend({
        sessionId: "session-race",
        directory: "/target/project",
        runtimeKey: "runtime-a",
        content: "hello",
        onOptimisticInsert: () => {
          expect(getRuntimeKey()).toBe("runtime-a")
          switchRuntimeEndpoint({ apiBaseUrl: "http://runtime-b.test", runtimeKey: "runtime-b" })
        },
        send: async () => {
          finalSendCalled = true
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain("runtime changed")

    expect(optimisticAdd).not.toBeNull()
    expect(finalSendCalled).toBe(false)
    expect(optimisticRemove).not.toBeNull()
    expect((optimisticRemove as unknown as OptimisticRemoveCall).sessionID).toBe("session-race")
    expect(targetStore.getState().session_status["session-race"]?.type).toBe("idle")
  })

  test("confirms an ambiguous send failure with a recent message refetch", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let optimisticRemove: OptimisticRemoveCall | null = null
    let optimisticConfirm: OptimisticRemoveCall | null = null
    let sentMessageID = ""

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      (input) => {
        optimisticRemove = input
      },
      (input) => {
        optimisticConfirm = input
      },
    )

    await optimisticSend({
      sessionId: "session-confirmed",
      directory: "/target/project",
      content: "hello",
      send: async (messageID) => {
        sentMessageID = messageID
        sessionMessageRecords.set("session-confirmed", [{
          info: { id: messageID, role: "user", sessionID: "session-confirmed", time: { created: 1 } },
          parts: [{ id: "server-part", sessionID: "session-confirmed", messageID, type: "text", text: "hello" }],
        }])
        const error = new Error("Failed to send message (504): gateway timeout") as Error & { status?: number }
        error.status = 504
        throw error
      },
    })

    expect(optimisticRemove).toBe(null)
    expect((optimisticConfirm as OptimisticRemoveCall | null)?.messageID).toBe(sentMessageID)
    expect(replyCalls.find((call) => call.method === "session.messages")?.params.limit).toBe(30)
    expect(targetStore.getState().message["session-confirmed"]?.[0]?.id).toBe(sentMessageID)
    expect(targetStore.getState().part[sentMessageID]?.[0]?.id).toBe("server-part")
  })

  // Relay tunnel aborts carry no HTTP status and no wording the text-matching
  // heuristic recognizes. Without the transport tag they were classified as
  // definite failures, the accepted prompt was rolled back, and the queue
  // re-sent a message the engine was already answering (#2425).
  test("confirms a tunnel-tagged transport failure that no text heuristic matches", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let optimisticRemove: OptimisticRemoveCall | null = null
    let optimisticConfirm: OptimisticRemoveCall | null = null
    let sentMessageID = ""

    const { markAmbiguousTransportFailure } = await import("@/lib/relay/transport-error")
    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      (input) => {
        optimisticRemove = input
      },
      (input) => {
        optimisticConfirm = input
      },
    )

    await optimisticSend({
      sessionId: "session-tunnel",
      directory: "/target/project",
      content: "hello",
      send: async (messageID) => {
        sentMessageID = messageID
        sessionMessageRecords.set("session-tunnel", [{
          info: { id: messageID, role: "user", sessionID: "session-tunnel", time: { created: 1 } },
          parts: [{ id: "server-part", sessionID: "session-tunnel", messageID, type: "text", text: "hello" }],
        }])
        throw markAmbiguousTransportFailure(new Error("stream aborted by host"))
      },
    })

    expect(optimisticRemove).toBe(null)
    expect((optimisticConfirm as OptimisticRemoveCall | null)?.messageID).toBe(sentMessageID)
    expect(targetStore.getState().message["session-tunnel"]?.[0]?.id).toBe(sentMessageID)
  })

  test("rolls back an ambiguous send failure when recent messages do not contain the sent ID", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let optimisticRemove: OptimisticRemoveCall | null = null
    let optimisticConfirm: OptimisticRemoveCall | null = null

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      (input) => {
        optimisticRemove = input
      },
      (input) => {
        optimisticConfirm = input
      },
    )

    let caught: unknown = null
    try {
      await optimisticSend({
        sessionId: "session-missing",
        directory: "/target/project",
        content: "hello",
        send: async () => {
          const error = new Error("Failed to send message (504): gateway timeout") as Error & { status?: number }
          error.status = 504
          throw error
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((optimisticRemove as OptimisticRemoveCall | null)?.sessionID).toBe("session-missing")
    expect(optimisticConfirm).toBe(null)
    expect(replyCalls.filter((call) => call.method === "session.messages").every((call) => call.params.limit === 30)).toBe(true)
    expect(targetStore.getState().session_status["session-missing"]?.type).toBe("idle")
  })
})

describe("respondToPermission passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
  })

  test("passes directory from child store when permission is found", async () => {
    const permission: PermissionRequest = {
      id: "perm-1",
      sessionID: "session-a",
      action: "bash",
      resources: [],
      metadata: {},
    }

    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await respondToPermission("session-a", "perm-1", "once")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-1")
    expect(replyCalls[0].params.reply).toBe("once")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })

  test("passes directory from session mapping when permission not in store", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await respondToPermission("session-b", "perm-2", "always")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-2")
    expect(replyCalls[0].params.reply).toBe("always")
    expect(replyCalls[0].params.directory).toBe("/other/project")
  })

  test("passes directory from current directory as last resort", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/fallback/dir")

    await respondToPermission("unknown-session", "perm-3", "reject")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-3")
    expect(replyCalls[0].params.reply).toBe("reject")
    expect(replyCalls[0].params.directory).toBe("/fallback/dir")
  })

  test("uses an explicit event directory before incomplete local routing state", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/stale/current")

    await respondToPermission("unknown-session", "perm-event", "once", "/event/project")

    expect(replyCalls.filter((call) => call.method === "permission.reply").map((call) => call.params.directory)).toContain("/event/project")
    expect(replyCalls[0].params.directory).toBe("/event/project")
  })
})

describe("forkFromMessage composer restore", () => {
  const sourceSession: Session = {
    id: "session-a",
    projectID: "project-a",
    directory: "/test/project",
    title: "Source session",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
  const forkedSession: Session = { ...sourceSession, id: "session-fork", title: "Forked session" }
  const textPart: Part = {
    id: "part-text",
    sessionID: sourceSession.id,
    messageID: "message-fork",
    type: "text",
    text: "Replay this prompt",
  }
  const filePart: Part = {
    id: "part-file",
    sessionID: sourceSession.id,
    messageID: "message-fork",
    type: "file",
    url: "data:image/png;base64,aW1hZ2U=",
    mime: "image/png",
    filename: "screenshot.png",
  }
  const restoredFile = { url: filePart.url, mimeType: filePart.mime, filename: filePart.filename }

  beforeEach(() => {
    replyCalls.length = 0
    selectedSessions.length = 0
    runtimeKey = "fork-runtime"
    sessionForkResult = forkedSession
    sessionForkError = null
    beforeSessionForkResolve = null
    inputState.pendingComposerRestore = null
    inputState.pendingInputText = "Keep the source draft"
    inputState.pendingInputMode = "append"
    inputState.attachedFiles = [{
      id: "source-attachment",
      file: new File(["source"], "source.txt", { type: "text/plain" }),
      dataUrl: "data:text/plain;base64,c291cmNl",
      mimeType: "text/plain",
      filename: "source.txt",
      size: 6,
      source: "local",
    }]
  })

  for (const directory of ["/test/project", "/canonical/project"]) {
    test(`stages the replay for the returned session in ${directory} without changing the source composer`, async () => {
      sessionForkResult = { ...forkedSession, directory }
      const source = createStore({}, {
        session: [sourceSession],
        part: { "message-fork": [textPart, filePart] },
      })
      const sourceInput = { ...inputState }
      const { forkFromMessage, setActionRefs } = await import("./session-actions")
      setActionRefs(createChildStores([[sourceSession.directory, source]]), () => "/other/project")

      await forkFromMessage(sourceSession.id, "message-fork")

      expect(replyCalls).toEqual([{
        method: "session.fork",
        params: { sessionID: sourceSession.id, messageID: "message-fork", directory: sourceSession.directory },
      }])
      expect(inputState.pendingComposerRestore).toEqual({
        target: { runtimeKey: "fork-runtime", directory, sessionId: forkedSession.id },
        text: "Replay this prompt",
        files: [restoredFile],
      })
      expect(inputState.pendingInputText).toBe(sourceInput.pendingInputText)
      expect(inputState.pendingInputMode).toBe(sourceInput.pendingInputMode)
      expect(inputState.attachedFiles).toBe(sourceInput.attachedFiles)
      expect(inputState.attachedFiles).toHaveLength(1)
      expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: directory }])
      expect(source.getState().session).toEqual([sourceSession, sessionForkResult])
    })
  }

  test("forks before the message's context carriers so the fork does not repeat them", async () => {
    const carrier = { id: "message-ctx", sessionID: sourceSession.id, role: "synthetic", time: { created: 1 } } as Message
    const target = { id: "message-fork", sessionID: sourceSession.id, role: "user", time: { created: 2 } } as Message
    const source = createStore({}, {
      session: [sourceSession],
      message: { [sourceSession.id]: [carrier, target] },
      part: { "message-fork": [textPart] },
    })
    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromMessage(sourceSession.id, "message-fork")

    expect(replyCalls.find((call) => call.method === "session.fork")?.params.messageID).toBe("message-ctx")
  })

  test("uses the returned project worktree when the fork has no directory", async () => {
    const forkWithProject: Session & { project: { worktree: string } } = {
      ...forkedSession, directory: "", project: { worktree: "/canonical/worktree" },
    }
    sessionForkResult = forkWithProject
    const source = createStore({}, { session: [sourceSession], part: { "message-fork": [textPart] } })
    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromMessage(sourceSession.id, "message-fork")

    expect(inputState.pendingComposerRestore?.target.directory).toBe("/canonical/worktree")
    expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: "/canonical/worktree" }])
  })

  test("stages a file-only prompt with empty text without replacing source attachments", async () => {
    const source = createStore({}, {
      session: [sourceSession],
      part: { "message-fork": [filePart] },
    })
    const sourceInput = { ...inputState }
    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromMessage(sourceSession.id, "message-fork")

    expect(inputState.pendingComposerRestore).toEqual({
      target: { runtimeKey: "fork-runtime", directory: sourceSession.directory, sessionId: forkedSession.id },
      text: "",
      files: [restoredFile],
    })
    expect(inputState.pendingInputText).toBe(sourceInput.pendingInputText)
    expect(inputState.attachedFiles).toBe(sourceInput.attachedFiles)
    expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: sourceSession.directory }])
  })

  test("leaves input, selection, and sessions unchanged when the fork fails", async () => {
    sessionForkError = new Error("fork failed")
    const source = createStore({}, {
      session: [sourceSession],
      part: { "message-fork": [textPart, filePart] },
    })
    const sourceState = source.getState()
    const sourceInput = { ...inputState }
    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await expect(forkFromMessage(sourceSession.id, "message-fork")).rejects.toThrow("fork failed")

    expect(inputState).toEqual(sourceInput)
    expect(inputState.attachedFiles).toBe(sourceInput.attachedFiles)
    expect(selectedSessions).toEqual([])
    expect(source.getState()).toBe(sourceState)
  })

  test("does not select, mutate, or stage a fork resolved after the runtime changes", async () => {
    beforeSessionForkResolve = () => { runtimeKey = "other-runtime" }
    const source = createStore({}, {
      session: [sourceSession],
      part: { "message-fork": [textPart, filePart] },
    })
    const sourceState = source.getState()
    const sourceInput = { ...inputState }
    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromMessage(sourceSession.id, "message-fork")

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: "message-fork", directory: sourceSession.directory },
    }])
    expect(runtimeKey).toBe("other-runtime")
    expect(inputState).toEqual(sourceInput)
    expect(inputState.attachedFiles).toBe(sourceInput.attachedFiles)
    expect(selectedSessions).toEqual([])
    expect(source.getState()).toBe(sourceState)
  })
})

describe("forkAfterMessage", () => {
  const sourceSession: Session = {
    id: "session-a",
    projectID: "project-a",
    directory: "/test/project",
    title: "Source session",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
  const forkedSession: Session = { ...sourceSession, id: "session-fork", title: "Forked session" }
  // SAFETY: forkAfterMessage reads only id and role; the rest of the message shape is irrelevant here.
  const message = (id: string, role: "user" | "assistant" | "compaction") => ({ id, role, sessionID: sourceSession.id, time: { created: 1 } }) as Message
  const transcript = [
    message("msg-user-1", "user"),
    message("msg-answer-1", "assistant"),
    message("msg-user-2", "user"),
    message("msg-answer-2", "assistant"),
  ]

  beforeEach(() => {
    replyCalls.length = 0
    selectedSessions.length = 0
    runtimeKey = "fork-runtime"
    sessionForkResult = forkedSession
    sessionForkError = null
    beforeSessionForkResolve = null
    inputState.pendingComposerRestore = null
  })

  test("cuts before the next user message so the fork keeps the answer", async () => {
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkAfterMessage(sourceSession.id, "msg-answer-1")

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: "msg-user-2", directory: sourceSession.directory },
    }])
    expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: sourceSession.directory }])
    expect(source.getState().session).toEqual([sourceSession, forkedSession])
    expect(inputState.pendingComposerRestore).toBeNull()
  })

  for (const entrypoint of ["forkAfterMessage", "forkFromLastCompletedTurn"] as const) {
    test(`${entrypoint} retries a missing cut without copying a later turn`, async () => {
      const messages = [
        message("msg-user-1", "user"),
        { ...message("msg-answer-1", "assistant"), time: { created: 1, completed: 2 }, finish: "stop" },
        message("msg-user-2", "user"),
      ] as Message[]
      const source = createStore({}, {
        session: [sourceSession], message: { [sourceSession.id]: messages },
        session_status: { [sourceSession.id]: { type: "busy" } },
      })
      const actions = await import("./session-actions")
      actions.setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)
      sessionForkError = notFound("Message")
      let attempts = 0
      beforeSessionForkResolve = () => {
        attempts += 1
        if (attempts === 1) messages.push(message("msg-answer-2", "assistant"))
        else sessionForkError = null
      }

      if (entrypoint === "forkAfterMessage") await actions.forkAfterMessage(sourceSession.id, "msg-answer-1")
      else await actions.forkFromLastCompletedTurn(sourceSession.id)

      expect(replyCalls.filter((call) => call.method === "session.fork").map((call) => call.params.messageID))
        .toEqual(["msg-user-2", "msg-user-2"])
      expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: sourceSession.directory }])
    })

    test(`${entrypoint} leaves the source open after two 404s`, async () => {
      const messages = [
        message("msg-user-1", "user"),
        { ...message("msg-answer-1", "assistant"), time: { created: 1, completed: 2 }, finish: "stop" },
        message("msg-user-2", "user"),
      ] as Message[]
      const source = createStore({}, {
        session: [sourceSession], message: { [sourceSession.id]: messages },
        session_status: { [sourceSession.id]: { type: "busy" } },
      })
      const actions = await import("./session-actions")
      actions.setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)
      sessionForkError = notFound("Message")

      const result = entrypoint === "forkAfterMessage"
        ? actions.forkAfterMessage(sourceSession.id, "msg-answer-1")
        : actions.forkFromLastCompletedTurn(sourceSession.id)
      await expect(result).rejects.toThrow("MessageNotFoundError")
      expect(replyCalls.filter((call) => call.method === "session.fork").map((call) => call.params.messageID))
        .toEqual(["msg-user-2", "msg-user-2"])
      expect(selectedSessions).toEqual([])
      expect(source.getState().session).toEqual([sourceSession])
    })
  }

  test("does not retry the cut on another runtime", async () => {
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)
    sessionForkError = notFound("Message")
    beforeSessionForkResolve = () => { runtimeKey = "another-runtime" }

    await expect(forkAfterMessage(sourceSession.id, "msg-answer-1")).rejects.toThrow("runtime changed")
    expect(replyCalls.filter((call) => call.method === "session.fork")).toHaveLength(1)
    expect(selectedSessions).toEqual([])
  })

  test("leaves a compaction that followed the answer out of the fork", async () => {
    const compacted = [...transcript.slice(0, 2), message("msg-compaction", "compaction"), ...transcript.slice(2)]
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: compacted } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkAfterMessage(sourceSession.id, "msg-answer-1")

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: "msg-compaction", directory: sourceSession.directory },
    }])
  })

  test("leaves a workflow report that followed the answer out of the fork", async () => {
    const workflowReport: Message = {
      id: "msg-workflow-report",
      role: "synthetic",
      sessionID: sourceSession.id,
      time: { created: 1 },
      metadata: { source: "openchamber-workflow", runId: "run-1", name: "Review", state: "completed" },
      text: "<openchamber-workflow>\nreview done\n</openchamber-workflow>",
    }
    const messages = [...transcript.slice(0, 2), workflowReport, ...transcript.slice(2)]
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: messages } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkAfterMessage(sourceSession.id, "msg-answer-1")

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: workflowReport.id, directory: sourceSession.directory },
    }])
  })

  test("copies the whole transcript when the answer is the last message", async () => {
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkAfterMessage(sourceSession.id, "msg-answer-2")

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: undefined, directory: sourceSession.directory },
    }])
  })

  test("refuses to fork from a message that is not loaded", async () => {
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await expect(forkAfterMessage(sourceSession.id, "msg-missing")).rejects.toThrow("Fork source message is not loaded")
    expect(replyCalls).toEqual([])
    expect(selectedSessions).toEqual([])
  })

  for (const enabled of [false, true]) {
    for (const forkPoint of ["answer", "prompt"] as const) {
      test(`persists the source permission choice in VS Code (${enabled}, ${forkPoint})`, async () => {
        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
        const { usePermissionStore } = await import("@/stores/permissionStore")
        usePermissionStore.getState().reset()
        Object.defineProperty(globalThis, "window", { configurable: true, value: { __VSCODE_CONFIG__: {} } })
        permissionPolicy.clear()
        permissionPolicy.set(sourceSession.id, enabled)
        permissionPolicyRevision = 0
        sessionRecords.set(sourceSession.id, sourceSession)
        const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
        try {
          const { forkAfterMessage, forkFromMessage, setActionRefs } = await import("./session-actions")
          setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)
          if (forkPoint === "answer") await forkAfterMessage(sourceSession.id, "msg-answer-2")
          else await forkFromMessage(sourceSession.id, "msg-user-2")
          expect(permissionPolicy.get(forkedSession.id)).toBe(enabled)
          expect(usePermissionStore.getState().getSessionMode(forkedSession.id)).toBe(enabled ? "auto" : "ask")
        } finally {
          if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
          else Reflect.deleteProperty(globalThis, "window")
          usePermissionStore.getState().reset()
          sessionRecords.delete(sourceSession.id)
        }
      })
    }
  }

  for (const forkPoint of ["answer", "prompt"] as const) {
    for (const outcome of ["runtime-switch", "read-failure", "write-failure", "write-failure-after-switch"] as const) {
      test(`retains the VS Code fork and repairs metadata after ${outcome} (${forkPoint})`, async () => {
        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
        const { usePermissionStore } = await import("@/stores/permissionStore")
        usePermissionStore.getState().reset()
        Object.defineProperty(globalThis, "window", { configurable: true, value: { __VSCODE_CONFIG__: {} } })
        permissionPolicy.clear()
        permissionPolicy.set(sourceSession.id, true)
        permissionPolicyRevision = 0
        sessionRecords.set(sourceSession.id, sourceSession)
        const inheritedFork: Session = {
          ...forkedSession,
          metadata: { openchamber: {
            kind: "scheduled",
            btwSessionID: "source-btw",
            reviewSessionID: "source-review",
            goal: { id: "goal-1", objective: "fallback", objectiveFile: true, status: "active" },
          } },
        }
        sessionForkResult = inheritedFork
        sessionRecords.set(forkedSession.id, inheritedFork)
        goalObjectives.set(sourceSession.id, "fork objective")
        const repairedMetadata = { openchamber: {
          goal: { id: "goal-1", objective: "fallback", objectiveFile: true, status: "paused", statusReason: "paused in fork" },
        } }
        const previousArchiveResponse = archiveBatchResponse
        archiveBatchResponse = { status: 200, body: { metadata: repairedMetadata } }
        openchamberRouteRequests.length = 0
        beforeArchiveRouteResolve = (path) => {
          if (!path.startsWith("/api/permission-auto-accept")) return
          if (outcome === "runtime-switch") runtimeKey = "another-runtime"
          else if (outcome === "read-failure" || path.includes("/sessions/")) {
            if (outcome === "write-failure-after-switch") runtimeKey = "another-runtime"
            throw new Error("policy unavailable")
          }
        }
        const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
        try {
          const { forkAfterMessage, forkFromMessage, setActionRefs } = await import("./session-actions")
          setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)
          if (forkPoint === "answer") {
            expect(await forkAfterMessage(sourceSession.id, "msg-answer-2")).toBe(inheritedFork)
          } else {
            await forkFromMessage(sourceSession.id, "msg-user-2")
          }
          expect(permissionPolicy.get(forkedSession.id)).toBeUndefined()
          expect(usePermissionStore.getState().getSessionMode(forkedSession.id)).toBe("ask")
          expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: sourceSession.directory }])
          const metadataRequest = openchamberRouteRequests.find((entry) => entry.path.endsWith(`/${forkedSession.id}/metadata`))
          const objectiveRequests = openchamberRouteRequests.filter((entry) => entry.path.startsWith("/api/goals/objective/"))
          if (outcome === "runtime-switch" || outcome === "write-failure-after-switch") {
            expect(metadataRequest).toBeUndefined()
            expect(objectiveRequests).toEqual([])
            expect(source.getState().session).toEqual([sourceSession, inheritedFork])
          } else {
            expect(metadataRequest?.body).toEqual({ patch: { openchamber: {
              kind: null, btwSessionID: null, reviewSessionID: null,
              goal: { status: "paused", statusReason: "paused in fork" },
            } } })
            expect(objectiveRequests).toEqual([
              { path: `/api/goals/objective/${sourceSession.id}`, body: {} },
              { path: `/api/goals/objective/${forkedSession.id}`, body: { content: "fork objective" } },
            ])
            expect(goalObjectives.get(forkedSession.id)).toBe("fork objective")
            expect(source.getState().session[1]?.metadata).toEqual(repairedMetadata)
          }
        } finally {
          if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
          else Reflect.deleteProperty(globalThis, "window")
          beforeArchiveRouteResolve = null
          runtimeKey = "fork-runtime"
          usePermissionStore.getState().reset()
          sessionRecords.delete(sourceSession.id)
          sessionRecords.delete(forkedSession.id)
          archiveBatchResponse = previousArchiveResponse
          goalObjectives.clear()
        }
      })
    }
  }
})

describe("forkFromLastCompletedTurn", () => {
  const sourceSession: Session = {
    id: "session-a",
    projectID: "project-a",
    directory: "/test/project",
    title: "Source session",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
  // SAFETY: the turn lookup reads only id, role, time.completed, and finish.
  const message = (id: string, role: "user" | "assistant", completed?: number, finish?: "stop" | "tool-calls") =>
    ({ id, role, sessionID: sourceSession.id, finish, time: completed === undefined ? { created: 1 } : { created: 1, completed } }) as Message

  beforeEach(() => {
    replyCalls.length = 0
    selectedSessions.length = 0
    runtimeKey = "fork-runtime"
    sessionForkResult = { ...sourceSession, id: "session-fork" }
    sessionForkError = null
    beforeSessionForkResolve = null
  })

  test("skips a running turn, including its already completed steps", async () => {
    const transcript = [
      message("u1", "user"),
      message("a1", "assistant", 2),
      message("u2", "user"),
      message("a2-step", "assistant", 3),
      message("a2-live", "assistant"),
    ]
    const source = createStore({}, {
      session: [sourceSession],
      message: { [sourceSession.id]: transcript },
      session_status: { [sourceSession.id]: { type: "busy" } },
    })
    const { forkFromLastCompletedTurn, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromLastCompletedTurn(sourceSession.id)

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: "u2", directory: sourceSession.directory },
    }])
  })

  test("copies the whole transcript when the session is idle", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [message("u1", "user"), message("a1", "assistant", 2)]
    expect(findLastCompletedTurnMessageId(transcript, false)).toBe("a1")
  })

  test("refuses when no turn has finished", async () => {
    const source = createStore({}, {
      session: [sourceSession],
      message: { [sourceSession.id]: [message("u1", "user"), message("a1", "assistant")] },
      session_status: { [sourceSession.id]: { type: "busy" } },
    })
    const { forkFromLastCompletedTurn, NothingToForkError, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await expect(forkFromLastCompletedTurn(sourceSession.id)).rejects.toThrow(NothingToForkError)
    expect(replyCalls).toEqual([])
    expect(selectedSessions).toEqual([])
  })

  // OpenCode 2 opens turns without a user prompt too; the lookup must not
  // treat those openers as part of the finished turn before them.
  // SAFETY: the boundary lookup reads only role, time, and metadata; this
  // fixture carries exactly the synthetic report fields readSubagentRun parses.
  const subagentReport = {
    id: "msg-subagent-report",
    role: "synthetic",
    sessionID: sourceSession.id,
    time: { created: 1 },
    metadata: { source: "subagent", childID: "child-1", state: "completed" },
    text: "<subagent>\nchild done\n</subagent>",
  } as Message
  // SAFETY: the boundary lookup reads only role and time; compaction is a
  // TURN_BOUNDARY_ROLES member, so no other Message field is dereferenced.
  const compactionOpener = {
    id: "msg-compaction-opener",
    role: "compaction",
    sessionID: sourceSession.id,
    time: { created: 1 },
  } as Message
  // SAFETY: the boundary lookup reads only role and time; shell is a
  // TURN_BOUNDARY_ROLES member, so no other Message field is dereferenced.
  const shellOpener = {
    id: "msg-shell-opener",
    role: "shell",
    sessionID: sourceSession.id,
    time: { created: 1 },
  } as Message
  const shellCompletion: Message = {
    id: "msg-shell-completion",
    role: "synthetic",
    sessionID: sourceSession.id,
    time: { created: 1 },
    metadata: { source: "shell", shellID: "shell-1", state: "completed" },
    text: "<shell>\ndone\n</shell>",
  }

  test("finds the finished reply when the running turn resumed from a background subagent", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [message("u1", "user"), message("a1", "assistant", 2), subagentReport, message("a-live", "assistant")]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("finds the finished reply when the running turn resumed from a background command", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [message("u1", "user"), message("a1", "assistant", 2), shellCompletion, message("a-live", "assistant")]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("finds the finished reply when the running turn was opened by a compaction", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [message("u1", "user"), message("a1", "assistant", 2), compactionOpener, message("a-live", "assistant")]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("finds the finished reply when the running turn was opened by a shell run", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [message("u1", "user"), message("a1", "assistant", 2), shellOpener, message("a-live", "assistant")]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  // OpenCode steers these into a turn that is still running: they arrive right
  // after a step that ended on tool calls, so they do not open a new turn.
  test("does not treat a report steered into the running turn as its opener", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [
      message("u1", "user"),
      message("a1", "assistant", 2, "stop"),
      message("u2", "user"),
      message("a2", "assistant", 3, "tool-calls"),
      subagentReport,
      message("a-live", "assistant"),
    ]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("does not treat a compaction inside the running turn as its opener", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [
      message("u1", "user"),
      message("a1", "assistant", 2, "stop"),
      message("u2", "user"),
      message("a2", "assistant", 3, "tool-calls"),
      compactionOpener,
      message("a-live", "assistant"),
    ]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("does not treat a prompt typed during the running turn as its opener", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [
      message("u1", "user"),
      message("a1", "assistant", 2, "stop"),
      message("u2", "user"),
      message("a2", "assistant", 3, "tool-calls"),
      message("u3", "user"),
      message("a-live", "assistant"),
    ]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("forks from the finished reply while a subagent-resumed turn streams", async () => {
    const transcript = [message("u1", "user"), message("a1", "assistant", 2), subagentReport, message("a-live", "assistant")]
    const source = createStore({}, {
      session: [sourceSession],
      message: { [sourceSession.id]: transcript },
      session_status: { [sourceSession.id]: { type: "busy" } },
    })
    const { forkFromLastCompletedTurn, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromLastCompletedTurn(sourceSession.id)

    // Cut at the subagent report: the finished reply is kept, the in-flight
    // turn after it is not copied into the fork.
    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: "msg-subagent-report", directory: sourceSession.directory },
    }])
  })
})

describe("revertToMessage passes session directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    sessionMessageRecords.clear()
    sessionRecords.clear()
    failingRevertSessionIds.clear()
    Object.assign(inputState, {
      pendingInputText: "previous draft",
      pendingInputMode: "replace",
      pendingInputTarget: null,
      pendingSessionRestores: new Map(),
      attachedFiles: [],
    })
  })

  test("routes revert through the session directory instead of the current directory", async () => {
    const session = sessionFixture("session-a")
    sessionRecords.set(session.id, session)
    const targetMessage = { id: "msg_2", sessionID: "session-a", role: "user", time: { created: 2 } } as Message
    const targetPart = { id: "prt_2", messageID: "msg_2", type: "text", text: "edit this" } as Part
    const sessionStore = createStore({}, {
      session: [session],
      message: { "session-a": [targetMessage] },
      part: { "msg_2": [targetPart] },
    })
    const currentStore = createStore({})
    const childStores = createChildStores([
      ["/test/project", sessionStore],
      ["/current/project", currentStore],
    ])
    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(childStores, () => "/current/project")

    await revertToMessage("session-a", "msg_2")

    expect(replyCalls.find((call) => call.method === "session.revert.stage")?.params.directory).toBe("/test/project")
    expect((sessionStore.getState().session[0] as Session & { revert?: { messageID?: string } }).revert?.messageID).toBe("msg_2")
    expect(currentStore.getState().session).toHaveLength(0)
    expect(inputState.pendingSessionRestores.get("session-a")).toBe("edit this")
    // The reverted message's session, not whatever address was left behind.
    expect(inputState.pendingInputText).toBe("previous draft")
    expect(inputState.pendingInputTarget).toBeNull()
  })

  test("cuts the transcript at the message's context carriers so they leave with it", async () => {
    const session = sessionFixture("session-a")
    sessionRecords.set(session.id, session)
    const earlier = { id: "msg_1", sessionID: "session-a", role: "user", time: { created: 1 } } as Message
    const firstCarrier = { id: "msg_ctx_1", sessionID: "session-a", role: "synthetic", time: { created: 2 }, text: "quoted selection" } as Message
    const secondCarrier = { id: "msg_ctx_2", sessionID: "session-a", role: "synthetic", time: { created: 3 }, text: "review comment" } as Message
    const targetMessage = { id: "msg_2", sessionID: "session-a", role: "user", time: { created: 4 } } as Message
    const sessionStore = createStore({}, {
      session: [session],
      message: { "session-a": [earlier, firstCarrier, secondCarrier, targetMessage] },
      part: { "msg_2": [{ id: "prt_2", messageID: "msg_2", type: "text", text: "edit this" } as Part] },
    })
    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", sessionStore]]), () => "/test/project")
    openchamberRouteRequests.length = 0

    await revertToMessage("session-a", "msg_2")

    expect(replyCalls.find((call) => call.method === "session.revert.stage")?.params.messageID).toBe("msg_ctx_1")
    expect((sessionStore.getState().session[0] as Session & { revert?: { messageID?: string } }).revert?.messageID).toBe("msg_ctx_1")
    expect(inputState.pendingSessionRestores.get("session-a")).toBe("edit this")
  })

  test("rolls back optimistic revert when the SDK returns an error", async () => {
    const session = sessionFixture("session-a")
    const targetMessage = { id: "msg_2", sessionID: "session-a", role: "user", time: { created: 2 } } as Message
    const targetPart = { id: "prt_2", messageID: "msg_2", type: "text", text: "edit this" } as Part
    const sessionStore = createStore({}, {
      session: [session],
      message: { "session-a": [targetMessage] },
      part: { "msg_2": [targetPart] },
    })
    const childStores = createChildStores([["/test/project", sessionStore]])
    failingRevertSessionIds.add("session-a")
    inputState.setPendingSessionRestore("session-a", "earlier restore")
    inputState.setPendingSessionRestore("session-other", "other restore")

    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    let thrown: unknown
    try {
      await revertToMessage("session-a", "msg_2")
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain("session.revert.stage failed (500)")
    expect((sessionStore.getState().session[0] as Session & { revert?: { messageID?: string } }).revert).toBe(undefined)
    expect(inputState.pendingInputText).toBe("previous draft")
    expect(inputState.pendingSessionRestores.get("session-a")).toBe("earlier restore")
    expect(inputState.pendingSessionRestores.get("session-other")).toBe("other restore")
  })

  test("reverts recursive descendants at their first user message on or after the parent cutoff", async () => {
    const rootMessage = { id: "root-cutoff", sessionID: "root", role: "user", time: { created: 20 } } as Message
    const sessions = [
      { ...sessionFixture("root"), directory: "/tree", time: { created: 1, updated: 1 } },
      { ...sessionFixture("child"), parentID: "root", directory: "/tree", time: { created: 2, updated: 2 } },
      { ...sessionFixture("grandchild"), parentID: "child", directory: "/tree", time: { created: 3, updated: 3 } },
      { ...sessionFixture("old-child"), parentID: "root", directory: "/tree", time: { created: 4, updated: 4 } },
    ] as Session[]
    const store = createStore({}, { session: sessions, message: { root: [rootMessage] } })
    sessionMessageRecords.set("child", [
      { info: { id: "child-before", sessionID: "child", role: "user", time: { created: 10 } } as Message, parts: [] },
      { info: { id: "child-boundary", sessionID: "child", role: "user", time: { created: 20 } } as Message, parts: [] },
      { info: { id: "child-later", sessionID: "child", role: "user", time: { created: 30 } } as Message, parts: [] },
    ])
    sessionMessageRecords.set("grandchild", [
      { info: { id: "grandchild-assistant", sessionID: "grandchild", role: "assistant", time: { created: 20 } } as Message, parts: [] },
      { info: { id: "grandchild-user", sessionID: "grandchild", role: "user", time: { created: 21 } } as Message, parts: [] },
    ])
    sessionMessageRecords.set("old-child", [
      { info: { id: "old-child-user", sessionID: "old-child", role: "user", time: { created: 19 } } as Message, parts: [] },
    ])

    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(createChildStores([["/tree", store]]), () => "/tree")

    await revertToMessage("root", "root-cutoff")

    expect(replyCalls.filter((call) => call.method === "session.revert.stage").map((call) => [
      call.params.sessionID,
      call.params.messageID,
    ])).toEqual([
      ["child", "child-boundary"],
      ["grandchild", "grandchild-user"],
      ["root", "root-cutoff"],
    ])
  })

  test("reverting a subagent run report reverts its child from the start and leaves the composer alone", async () => {
    const earlier = { id: "root-context", sessionID: "root", role: "synthetic", time: { created: 5 }, text: "ctx" } as Message
    const report = {
      id: "root-report",
      sessionID: "root",
      role: "synthetic",
      time: { created: 40 },
      text: "done",
      metadata: { source: "subagent", childID: "child", state: "completed" },
    } as Message
    const sessions = [
      { ...sessionFixture("root"), directory: "/tree", time: { created: 1, updated: 1 } },
      { ...sessionFixture("child"), parentID: "root", directory: "/tree", time: { created: 10, updated: 10 } },
    ] as Session[]
    const store = createStore({}, { session: sessions, message: { root: [earlier, report] } })
    sessionMessageRecords.set("child", [
      { info: { id: "child-prompt", sessionID: "child", role: "user", time: { created: 11 } } as Message, parts: [] },
    ])
    inputState.pendingInputText = "still typing"

    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(createChildStores([["/tree", store]]), () => "/tree")

    await revertToMessage("root", "root-report")

    expect(replyCalls.filter((call) => call.method === "session.revert.stage").map((call) => [
      call.params.sessionID,
      call.params.messageID,
    ])).toEqual([
      ["child", "child-prompt"],
      ["root", "root-report"],
    ])
    expect(inputState.pendingInputText).toBe("still typing")
  })

  test("continues reverting other descendants and the parent when one child fails", async () => {
    const rootMessage = { id: "root-cutoff", sessionID: "root", role: "user", time: { created: 20 } } as Message
    const sessions = [
      { ...sessionFixture("root"), directory: "/tree", time: { created: 1, updated: 1 } },
      { ...sessionFixture("failing-child"), parentID: "root", directory: "/tree", time: { created: 2, updated: 2 } },
      { ...sessionFixture("healthy-child"), parentID: "root", directory: "/tree", time: { created: 3, updated: 3 } },
    ] as Session[]
    const store = createStore({}, { session: sessions, message: { root: [rootMessage] } })
    for (const id of ["failing-child", "healthy-child"]) {
      sessionMessageRecords.set(id, [{
        info: { id: `${id}-target`, sessionID: id, role: "user", time: { created: 20 } } as Message,
        parts: [],
      }])
    }
    failingRevertSessionIds.add("failing-child")

    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(createChildStores([["/tree", store]]), () => "/tree")

    await revertToMessage("root", "root-cutoff")

    expect(replyCalls.filter((call) => call.method === "session.revert.stage").map((call) => call.params.sessionID)).toEqual([
      "failing-child",
      "healthy-child",
      "root",
    ])
  })

  test("aborts a busy descendant before reverting it", async () => {
    const rootMessage = { id: "root-cutoff", sessionID: "root", role: "user", time: { created: 20 } } as Message
    const sessions = [
      { ...sessionFixture("root"), directory: "/tree", time: { created: 1, updated: 1 } },
      { ...sessionFixture("busy-child"), parentID: "root", directory: "/tree", time: { created: 2, updated: 2 } },
      { ...sessionFixture("idle-child"), parentID: "root", directory: "/tree", time: { created: 3, updated: 3 } },
    ] as Session[]
    const store = createStore({}, {
      session: sessions,
      message: { root: [rootMessage] },
      session_status: { "busy-child": { type: "busy" }, "idle-child": { type: "idle" } },
    })
    for (const id of ["busy-child", "idle-child"]) {
      sessionMessageRecords.set(id, [{
        info: { id: `${id}-target`, sessionID: id, role: "user", time: { created: 20 } } as Message,
        parts: [],
      }])
    }

    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(createChildStores([["/tree", store]]), () => "/tree")

    await revertToMessage("root", "root-cutoff")

    expect(replyCalls.filter((call) => call.method === "session.abort").map((call) => call.params.sessionID))
      .toEqual(["busy-child"])
    const busyAbortIndex = replyCalls.findIndex((call) => call.method === "session.abort")
    const busyRevertIndex = replyCalls.findIndex(
      (call) => call.method === "session.revert.stage" && call.params.sessionID === "busy-child",
    )
    expect(busyAbortIndex).toBeLessThan(busyRevertIndex)
    expect(replyCalls.filter((call) => call.method === "session.revert.stage").map((call) => call.params.sessionID)).toEqual([
      "busy-child",
      "idle-child",
      "root",
    ])
  })
})

describe("revertToMessage paged message lookup", () => {
  beforeEach(() => {
    replyCalls.length = 0
    sessionMessageRecords.clear()
    sessionRecords.clear()
    failingRevertSessionIds.clear()
    cursorMessagePages = null
    Object.assign(inputState, {
      pendingInputText: "",
      pendingInputMode: "replace",
      attachedFiles: [],
    })
  })

  test("stages the revert when the target message is only on a later page", async () => {
    const session = sessionFixture("session-a")
    sessionRecords.set(session.id, session)
    const newer: Message = { id: "msg_newer", sessionID: "session-a", role: "user", time: { created: 3 } }
    const older: Message = { id: "msg_old", sessionID: "session-a", role: "user", time: { created: 1 } }
    const sessionStore = createStore({}, {
      session: [session],
      message: { "session-a": [newer] },
      part: {},
    })
    const currentStore = createStore({})
    const childStores = createChildStores([
      ["/test/project", sessionStore],
      ["/current/project", currentStore],
    ])
    // The local store holds only the newest page; the target sits behind a cursor.
    cursorMessagePages = [
      { items: [{ info: newer, parts: [] }], cursor: { next: "1" } },
      { items: [{ info: older, parts: [] }], cursor: {} },
    ]
    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(childStores, () => "/current/project")

    await revertToMessage("session-a", "msg_old")

    expect(replyCalls.find((call) => call.method === "session.revert.stage")?.params.messageID).toBe("msg_old")
    expect(sessionStore.getState().session[0]?.revert?.messageID).toBe("msg_old")
    expect(replyCalls.filter((call) => call.method === "session.messages")).toHaveLength(2)
  })
})

describe("dismissPermission passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
    permissionReplyError = null
  })

  test("passes directory and reply=reject", async () => {
    const permission: PermissionRequest = {
      id: "perm-10",
      sessionID: "session-a",
      action: "edit",
      resources: [],
      metadata: {},
    }

    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await dismissPermission("session-a", "perm-10")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-10")
    expect(replyCalls[0].params.reply).toBe("reject")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })
})

describe("replyToForm passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
  })

  test("passes directory to form.reply", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await replyToForm("session-a", "q-1", { choice: true })

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.formID).toBe("q-1")
    expect(replyCalls[0].params.directory).toBe("/test/project")
    expect(replyCalls.filter((call) => call.method.endsWith(".reply") || call.method === "form.cancel").map((call) => call.params.directory)).toEqual(["/test/project"])
  })

  test("removes stale form from child store when reply returns not found", async () => {
    const form = buildForm("q-stale", "session-a")
    const store = createStore({}, { form: { "session-a": [form] } })
    const childStores = createChildStores([["/test/project", store]])
    formReplyError = Object.assign(new Error("form.reply failed (404): FormNotFoundError"), { status: 404 })

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    let thrown: unknown
    try {
      await replyToForm("session-a", "q-stale", { choice: true })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(store.getState().form["session-a"]).toBe(undefined)
  })
})

describe("cancelForm passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
  })

  test("passes directory to form.cancel", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, cancelForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await cancelForm("session-a", "q-2")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.formID).toBe("q-2")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })
})

describe("replyToForm applies the composer selection", () => {
  const OTHER_MODEL = { providerID: "openai", id: "gpt-6" }
  const SESSION_MODEL = { providerID: "anthropic", id: "claude-3" }
  const seedSession = (id: string, overrides: Partial<Session> = {}) => {
    const record: Session = { ...sessionFixture(id), model: SESSION_MODEL, agent: "build", ...overrides }
    sessionRecords.set(id, record)
    // SAFETY: the selection helpers read only the session slice of the state.
    directoryStateOverride = () => ({ session: [record] }) as State
    return record
  }
  const replyInMainChat = async (sessionId = "session-a", answer: Record<string, boolean> = { choice: true }) => {
    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(createChildStores([]), () => "/test/project")
    return replyToForm(sessionId, "q-1", answer)
  }
  const replyMethods = () => replyCalls.map((call) => call.method).filter((method) => method !== "session.get")
  const reset = () => {
    replyCalls.length = 0
    formReplyError = null
    selectionApplyError = null
    agentUnavailableForSelection = false
    selectionApplyGate = null
    directoryStateOverride = null
    configState = { currentProviderId: "", currentModelId: "" }
    listedAgents = []
    mainSessionId = null
    selectionPicks.models.clear()
    selectionPicks.agents.clear()
    selectionPicks.efforts.clear()
    selectionPicks.switched = false
    selectionPicks.settled.length = 0
    sessionRecords.clear()
  }

  beforeEach(reset)
  afterEach(reset)

  test("switches the main chat's session to the composer's selection before the answer", async () => {
    mainSessionId = "session-a"
    seedSession("session-a")
    selectionPicks.agents.set("session-a", "plan")
    configState = { currentProviderId: "openai", currentModelId: "gpt-6", currentVariant: "high", currentAgentName: "build" }

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
      model: { ...OTHER_MODEL, variant: "high" },
      agent: "plan",
    })
    expect(selectionPicks.settled).toEqual(["session-a:openai/gpt-6"])
  })

  test("an explicit Default takes the session off its effort", async () => {
    mainSessionId = "session-a"
    seedSession("session-a", { model: { ...SESSION_MODEL, variant: "high" } })
    configState = { currentProviderId: "anthropic", currentModelId: "claude-3", currentVariant: "high", variantOverride: null, currentAgentName: "build" }
    listedAgents = ["build"]

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({ model: SESSION_MODEL })
  })

  test("a failed switch leaves the answer unsent and the pick in place", async () => {
    mainSessionId = "session-a"
    configState = { currentProviderId: "openai", currentModelId: "gpt-6" }
    selectionApplyError = new Error("model switch failed")

    await expect(replyInMainChat()).rejects.toThrow("model switch failed")

    expect(replyMethods()).toEqual([])
    expect(selectionPicks.settled).toEqual([])
  })

  test("a changed agent the folder lacks leaves the form pending, and the error names it", async () => {
    mainSessionId = "session-a"
    seedSession("session-a", { agent: "plan" })
    configState = { currentProviderId: "anthropic", currentModelId: "claude-3", currentAgentName: "build" }
    agentUnavailableForSelection = true

    const error = await replyInMainChat().then(() => null, (caught: Error) => caught)

    expect(agentUnavailableFrom(error)).toBe("build")
    expect(replyMethods()).toEqual([])
  })

  test("an unchanged agent the folder's catalog lacks is still checked", async () => {
    mainSessionId = "session-a"
    seedSession("session-a")
    configState = { currentProviderId: "anthropic", currentModelId: "claude-3", currentAgentName: "build" }
    agentUnavailableForSelection = true

    const error = await replyInMainChat().then(() => null, (caught: Error) => caught)

    expect(agentUnavailableFrom(error)).toBe("build")
    expect(replyMethods()).toEqual([])
  })

  test("an unchanged selection switches nothing", async () => {
    mainSessionId = "session-a"
    seedSession("session-a")
    listedAgents = ["build"]
    configState = { currentProviderId: "anthropic", currentModelId: "claude-3", currentAgentName: "build" }

    await replyInMainChat()

    expect(replyMethods()).toEqual(["form.reply"])
  })

  test("a composer whose catalog has not loaded switches nothing", async () => {
    mainSessionId = "session-a"

    await replyInMainChat()

    expect(replyMethods()).toEqual(["form.reply"])
  })

  test("Auto reaches the session as the sentinel before the answer", async () => {
    // The sentinel marks the session; the server then routes the reply to the
    // concrete model before forwarding it (routing/routes.http.test.js).
    mainSessionId = "session-a"
    seedSession("session-a")
    listedAgents = ["build"]
    configState = { currentProviderId: "openchamber", currentModelId: "auto", currentAgentName: "build" }

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
      model: { providerID: "openchamber", id: "auto" },
    })
  })

  for (const surface of ["a pinned chat", "a /btw fork"]) {
    test(`${surface} replies with its own picks, never the main chat's`, async () => {
      mainSessionId = "session-main"
      configState = { currentProviderId: "google", currentModelId: "gemini", currentVariant: "max", currentAgentName: "review" }
      seedSession("session-a")
      selectionPicks.models.set("session-a", { providerId: "openai", modelId: "gpt-6" })
      selectionPicks.agents.set("session-a", "plan")
      selectionPicks.efforts.set("session-a/plan/openai/gpt-6", "low")

      await replyInMainChat()

      expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
        model: { ...OTHER_MODEL, variant: "low" },
        agent: "plan",
      })
    })
  }

  test("an effort-only change in a pinned chat keeps the session's model and agent", async () => {
    mainSessionId = "session-main"
    configState = { currentProviderId: "google", currentModelId: "gemini", currentAgentName: "review" }
    seedSession("session-a", { model: { ...SESSION_MODEL, variant: "low" } })
    selectionPicks.efforts.set("session-a/build/anthropic/claude-3", "high")

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
      model: { ...SESSION_MODEL, variant: "high" },
    })
  })

  test("a child session answered from its parent keeps what it is bound to", async () => {
    mainSessionId = "session-parent"
    configState = { currentProviderId: "google", currentModelId: "gemini", currentVariant: "max", currentAgentName: "review" }
    seedSession("session-a", { model: { ...SESSION_MODEL, variant: "low" }, agent: "workflow" })

    await replyInMainChat()

    expect(replyCalls.map((call) => call.method)).toEqual(["form.reply"])
  })

  test("an effort saved before a switch made elsewhere does not undo that switch", async () => {
    mainSessionId = "session-parent"
    seedSession("session-a", { model: { ...SESSION_MODEL, variant: "low" } })
    selectionPicks.efforts.set("session-a/build/anthropic/claude-3", "high")
    selectionPicks.switched = true

    await replyInMainChat()

    expect(replyCalls.map((call) => call.method)).toEqual(["form.reply"])
  })

  test("a location-scoped form is answered with no switch, on its owning directory", async () => {
    const form = buildForm("q-1", "global")
    const store = createStore({}, { form: { global: [form] } })
    mainSessionId = "global"
    configState = { currentProviderId: "openai", currentModelId: "gpt-6", currentAgentName: "build" }

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/somewhere/else")
    await replyToForm("global", "q-1", { choice: true })

    expect(replyCalls.map((call) => call.method)).toEqual(["form.reply"])
    expect(replyCalls[0]?.params.directory).toBe("/test/project")
  })

  for (const roundTrip of [false, true]) {
    test(`a runtime change during the switch stops the reply, return to original: ${roundTrip}`, async () => {
      const original = { apiBaseUrl: getRuntimeApiBaseUrl(), runtimeKey: getRuntimeKey() }
      const home = { apiBaseUrl: "http://form-home.test", runtimeKey: "form-home" }
      switchRuntimeEndpoint(home)
      mainSessionId = "session-a"
      configState = { currentProviderId: "openai", currentModelId: "gpt-6" }
      const form = buildForm("q-1", "session-a")
      const store = createStore({}, { form: { "session-a": [form] } })
      let release = () => {}
      let started = () => {}
      const reachedSwitch = new Promise<void>((resolve) => { started = resolve })
      selectionApplyGate = () => {
        started()
        return new Promise<void>((resolve) => { release = resolve })
      }

      const { setActionRefs, replyToForm } = await import("./session-actions")
      setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
      const reply = replyToForm("session-a", "q-1", { choice: true })
      await reachedSwitch

      try {
        switchRuntimeEndpoint({ apiBaseUrl: "http://form-other.test", runtimeKey: "form-other" })
        if (roundTrip) switchRuntimeEndpoint(home)
        release()
        await expect(reply).rejects.toThrow("runtime changed")
      } finally {
        switchRuntimeEndpoint(original)
      }

      expect(replyMethods()).not.toContain("form.reply")
      expect(store.getState().form["session-a"]).toEqual([form])
      expect(selectionPicks.settled).toEqual([])
    })
  }

  test("a not-found answer from an old runtime cleans nothing up", async () => {
    const original = { apiBaseUrl: getRuntimeApiBaseUrl(), runtimeKey: getRuntimeKey() }
    switchRuntimeEndpoint({ apiBaseUrl: "http://form-home.test", runtimeKey: "form-home" })
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, { form: { "session-a": [form] } })
    formReplyError = Object.assign(new Error("FormNotFoundError"), { status: 404 })
    formReplyGate = () => switchRuntimeEndpoint({ apiBaseUrl: "http://form-other.test", runtimeKey: "form-other" })

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    try {
      await expect(replyToForm("session-a", "q-1", { choice: true })).rejects.toThrow("FormNotFoundError")
    } finally {
      formReplyGate = null
      switchRuntimeEndpoint(original)
    }

    expect(store.getState().form["session-a"]).toEqual([form])
  })
})

function archivedFixture(id: string): Session {
  return { ...sessionFixture(id), time: { created: 1, updated: 1, archived: 5 } }
}

function sessionFixture(id: string): Session {
  return {
    id,
    projectID: "project-1",
    directory: "/test/project",
    title: id,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
}

describe("form dismissal clears pending state without the SSE echo (issues #2911, #2448)", () => {
  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
    formCancelError = null
  })

  test("cancelForm clears the form from the child store on success", async () => {
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [form] },
    })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, cancelForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await cancelForm("session-a", "q-1")

    // The backend confirmed the rejection. The local pending state must be gone
    // even if the SSE `form.cancelled` event is lost (SSE gap), otherwise the
    // session stays in "waiting for answer" and the next task never renders
    // thinking/final response (issues #2911, #2448).
    expect(store.getState().form["session-a"]).toBe(undefined)
  })

  test("replyToForm clears the form from the child store on success", async () => {
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [form] },
    })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await replyToForm("session-a", "q-1", { choice: true })

    expect(store.getState().form["session-a"]).toBe(undefined)
  })

  test("dismissOpenFormsForSession leaves the store cleared when the reject succeeds", async () => {
    const form = buildForm("q-root", "session-a")
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [form] },
    })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenFormsForSession("session-a")

    expect(dismissed).toBe(true)
    // The optimistic clear already removed it before the round-trip; the
    // successful reject must not resurrect it.
    expect(store.getState().form["session-a"]).toBe(undefined)
  })

  test("reply/reject actions on an already-cleared store stay no-ops (SSE echo equivalent)", async () => {
    // A later (or duplicated) SSE echo for an already-cleared request must not
    // error or resurrect state — the reducer only removes when present.
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: {},
    })

    const { setActionRefs, cancelForm, replyToForm } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    await replyToForm("session-a", "q-gone", { choice: true })
    await cancelForm("session-a", "q-gone")

    expect(store.getState().form["session-a"]).toBe(undefined)
  })
})

describe("blocking request reply routing and stale recovery (issue OPE-236)", () => {
  const materializationCalls: Array<{ directory: string; sessionID: string; messageID: string }> = []
  const enqueueMaterialization = (directory: string, sessionID: string, messageID: string) => {
    materializationCalls.push({ directory, sessionID, messageID })
  }

  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
    formCancelError = null
    materializationCalls.length = 0
    // replyToForm reads the composer selection; an empty one keeps this suite
    // about routing rather than model switching.
    directoryStateOverride = null
    configState = { currentProviderId: "", currentModelId: "" }
    listedAgents = []
  })

  test("routes the form reply by the request's own session directory, not the containing store key", async () => {
    // The form was asked by a worktree session whose record lives in the
    // parent store (containment). The reply must be addressed to the session's
    // own server-confirmed directory — otherwise the server resolves the
    // parent instance, does not find the pending form, and answers
    // FormNotFoundError, leaving the session stuck on "asking for input".
    const form = buildForm("q-wt", "session-wt")
    const store = createStore({}, {
      session: [{ id: "session-wt", directory: "/test/project/wt" } as Session],
      form: { "session-wt": [form] },
    })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project", enqueueMaterialization)

    await replyToForm("session-wt", "q-wt", { choice: true })

    expect(replyCalls.filter((call) => call.method.endsWith(".reply") || call.method === "form.cancel").map((call) => call.params.directory)).toEqual(["/test/project/wt"])
    expect(replyCalls[0]?.params.directory).toBe("/test/project/wt")
    expect(replyCalls[0]?.params.formID).toBe("q-wt")
  })

  test("routes permission replies by the request's own session directory", async () => {
    const permission = buildPermission("perm-wt", "session-wt")
    const store = createStore(
      { "session-wt": [permission] },
      {
        session: [{ id: "session-wt", directory: "/test/project/wt" } as Session],
      },
    )
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project", enqueueMaterialization)

    await respondToPermission("session-wt", "perm-wt", "once")

    expect(replyCalls.filter((call) => call.method.endsWith(".reply") || call.method === "form.cancel").map((call) => call.params.directory)).toEqual(["/test/project/wt"])
    expect(replyCalls[0]?.params.directory).toBe("/test/project/wt")
    expect(replyCalls[0]?.params.requestID).toBe("perm-wt")
  })

  test("falls back to the containing store key when the session record carries no directory", async () => {
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, {
      session: [{ id: "session-a" } as Session],
      form: { "session-a": [form] },
    })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project", enqueueMaterialization)

    await replyToForm("session-a", "q-1", { choice: true })

    expect(replyCalls.filter((call) => call.method.endsWith(".reply") || call.method === "form.cancel").map((call) => call.params.directory)).toEqual(["/test/project"])
    expect(replyCalls[0]?.params.directory).toBe("/test/project")
  })

  test("enqueues settled-running-tool tail recovery when the form reply is not found", async () => {
    const form = buildForm("q-stale", "session-a")
    const store = createStore({}, {
      session: [{ id: "session-a" } as Session],
      form: { "session-a": [form] },
      message: {
        "session-a": [{ id: "msg-1", sessionID: "session-a", role: "assistant", time: { created: 1 } } as Message],
      },
      part: {
        "msg-1": [{
          id: "prt-1",
          messageID: "msg-1",
          sessionID: "session-a",
          type: "tool",
          tool: "question",
          state: { status: "running" },
        } as Part],
      },
    })
    const childStores = createChildStores([["/test/project", store]])
    formReplyError = Object.assign(new Error("form.reply failed (404): FormNotFoundError"), { status: 404 })

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project", enqueueMaterialization)

    let thrown: unknown
    try {
      await replyToForm("session-a", "q-stale", { choice: true })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    // The stale request is gone from the store and the trailing running tool
    // part is reconciled instead of leaving the UI stuck on "asking for input".
    expect(store.getState().form["session-a"]).toBe(undefined)
    expect(materializationCalls).toEqual([{ directory: "/test/project", sessionID: "session-a", messageID: "msg-1" }])
  })

  test("enqueues tail recovery on reject not-found but not on success", async () => {
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, {
      session: [{ id: "session-a" } as Session],
      form: { "session-a": [form] },
      message: {
        "session-a": [{ id: "msg-1", sessionID: "session-a", role: "assistant", time: { created: 1 } } as Message],
      },
      part: {
        "msg-1": [{
          id: "prt-1",
          messageID: "msg-1",
          sessionID: "session-a",
          type: "tool",
          tool: "question",
          state: { status: "running" },
        } as Part],
      },
    })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, cancelForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project", enqueueMaterialization)

    // Success: no recovery enqueued — the normal form.cancelled event flow clears state.
    await cancelForm("session-a", "q-1")
    expect(materializationCalls).toEqual([])

    // Not-found: the request is stale server-side; the tail must be reconciled.
    formCancelError = Object.assign(new Error("form.cancel failed (404): FormNotFoundError"), { status: 404 })
    const stale = buildForm("q-stale", "session-a")
    store.setState({ form: { "session-a": [stale] } })

    let thrown: unknown
    try {
      await cancelForm("session-a", "q-stale")
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(store.getState().form["session-a"]).toBe(undefined)
    expect(materializationCalls).toEqual([{ directory: "/test/project", sessionID: "session-a", messageID: "msg-1" }])
  })
})

function buildForm(id: string, sessionId: string): FormRequest {
  return {
    id,
    sessionID: sessionId,
    title: "Choose an option",
    fields: [{ key: "choice", type: "boolean" }],
  }
}

function buildPermission(id: string, sessionId: string): PermissionRequest {
  return {
    id,
    sessionID: sessionId,
    action: "edit",
    resources: [],
    metadata: {},
  }
}

describe("dismissOpenFormsForSession", () => {
  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
    formCancelError = null
  })

  test("returns false and rejects nothing when no forms are pending", async () => {
    const store = createStore({}, { session: [{ id: "session-a", time: { created: 1 } } as Session] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenFormsForSession("session-a")

    expect(dismissed).toBe(false)
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
  })

  test("rejects every pending form in the session subtree (root + subagent child)", async () => {
    const rootForm = buildForm("q-root", "session-a")
    const childForm = buildForm("q-child", "session-child")
    const store = createStore({}, {
      session: [
        { id: "session-a", time: { created: 1 } } as Session,
        { id: "session-child", parentID: "session-a", time: { created: 2 } } as Session,
      ],
      form: {
        "session-a": [rootForm],
        "session-child": [childForm],
      },
    })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenFormsForSession("session-a")

    expect(dismissed).toBe(true)
    const rejectCalls = replyCalls.filter((call) => call.method === "form.cancel")
    expect(rejectCalls).toHaveLength(2)
    const rejectedIds = rejectCalls.map((call) => call.params.formID).sort()
    expect(rejectedIds).toEqual(["q-child", "q-root"])
    // Optimistic clear: the forms are removed from the local store so the
    // prompt disappears instantly, without waiting for the reject round-trip.
    expect(store.getState().form["session-a"]).toBe(undefined)
    expect(store.getState().form["session-child"]).toBe(undefined)
  })

  test("swallows FormNotFoundError so a stranded form never blocks the send", async () => {
    const staleForm = buildForm("q-stale", "session-a")
    const store = createStore({}, {
      session: [{ id: "session-a", time: { created: 1 } } as Session],
      form: { "session-a": [staleForm] },
    })
    const childStores = createChildStores([["/test/project", store]])
    formCancelError = Object.assign(new Error("form.cancel failed (404): FormNotFoundError"), { status: 404 })

    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenFormsForSession("session-a")

    expect(dismissed).toBe(true)
    const cancelCalls = replyCalls.filter((call) => call.method === "form.cancel")
    expect(cancelCalls).toHaveLength(1)
    expect(cancelCalls[0].params.formID).toBe("q-stale")
    // The stale entry is cleared from the store even though the server reported not-found.
    expect(store.getState().form["session-a"]).toBe(undefined)
  })

  test("puts the forms back when the cancel fails for another reason (#2448)", async () => {
    const rootForm = buildForm("q-root", "session-a")
    const childForm = buildForm("q-child", "session-child")
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [rootForm] },
    })
    // The subagent's session lives in its own worktree store.
    const worktreeStore = createStore({}, {
      session: [{ ...sessionFixture("session-child"), parentID: "session-a" }],
      form: { "session-child": [childForm] },
    })
    const childStores = createChildStores([["/test/project", store], ["/test/project/wt", worktreeStore]])
    formCancelError = Object.assign(new Error("session.form.cancel failed (500): unexpected status"), { status: 500 })

    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenFormsForSession("session-a")

    expect(dismissed).toBe(true)
    // The agent is still waiting on both forms, so each goes back to the store it came from.
    expect(store.getState().form["session-a"]).toEqual([rootForm])
    expect(store.getState().form["session-child"]).toBe(undefined)
    expect(worktreeStore.getState().form["session-child"]).toEqual([childForm])
    expect(worktreeStore.getState().form["session-a"]).toBe(undefined)
  })
})

describe("dismissPermission not-found handling", () => {
  beforeEach(() => {
    replyCalls.length = 0
    permissionReplyError = null
  })

  test("clears the stale permission and rethrows on PermissionNotFoundError", async () => {
    const permission = buildPermission("perm-stale", "session-a")
    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (404): PermissionNotFoundError"), { status: 404 })

    const { setActionRefs, dismissPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await expect(dismissPermission("session-a", "perm-stale")).rejects.toThrow()
    expect(replyCalls.filter((call) => call.method === "permission.reply")).toHaveLength(1)
    // The stale entry is cleared from the store even though the server reported not-found.
    expect(store.getState().permission["session-a"]).toBe(undefined)
  })

  test("does not clear the store on a non-not-found failure (rethrow only)", async () => {
    const permission = buildPermission("perm-500", "session-a")
    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (500)"), { status: 500 })

    const { setActionRefs, dismissPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await expect(dismissPermission("session-a", "perm-500")).rejects.toThrow()
    // A non-not-found failure leaves store reconciliation to the next server event.
    expect(store.getState().permission["session-a"]).toHaveLength(1)
  })

  test("an allow on a permission the server no longer has clears the card", async () => {
    const permission = buildPermission("perm-stale", "session-a")
    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (404): PermissionNotFoundError"), { status: 404 })

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await expect(respondToPermission("session-a", "perm-stale", "once")).rejects.toThrow()
    expect(store.getState().permission["session-a"]).toBe(undefined)
  })

  test("an allow that fails for another reason keeps the card", async () => {
    const permission = buildPermission("perm-500", "session-a")
    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (500)"), { status: 500 })

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await expect(respondToPermission("session-a", "perm-500", "once")).rejects.toThrow()
    expect(store.getState().permission["session-a"]).toHaveLength(1)
  })
})

describe("dismissOpenPermissionsForSession", () => {
  beforeEach(() => {
    replyCalls.length = 0
    permissionReplyError = null
  })

  test("returns false and rejects nothing when no permissions are pending", async () => {
    const store = createStore({}, { session: [{ id: "session-a", time: { created: 1 } } as Session] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissOpenPermissionsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenPermissionsForSession("session-a")

    expect(dismissed).toBe(false)
    expect(replyCalls.filter((call) => call.method === "permission.reply")).toHaveLength(0)
  })

  test("rejects every pending permission in the session subtree (root + subagent child)", async () => {
    const rootPermission = buildPermission("perm-root", "session-a")
    const childPermission = buildPermission("perm-child", "session-child")
    const store = createStore({
      "session-a": [rootPermission],
      "session-child": [childPermission],
    }, {
      session: [
        { id: "session-a", time: { created: 1 } } as Session,
        { id: "session-child", parentID: "session-a", time: { created: 2 } } as Session,
      ],
    })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissOpenPermissionsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenPermissionsForSession("session-a")

    expect(dismissed).toBe(true)
    const replyCallsForPermissions = replyCalls.filter((call) => call.method === "permission.reply")
    expect(replyCallsForPermissions).toHaveLength(2)
    const rejectedIds = replyCallsForPermissions.map((call) => call.params.requestID).sort()
    expect(rejectedIds).toEqual(["perm-child", "perm-root"])
    expect(replyCallsForPermissions.every((call) => call.params.reply === "reject")).toBe(true)
    // Optimistic clear: the permissions are removed from the local store so the
    // prompt disappears instantly, without waiting for the reject round-trip.
    expect(store.getState().permission["session-a"]).toBe(undefined)
    expect(store.getState().permission["session-child"]).toBe(undefined)
  })

  test("swallows PermissionNotFoundError so a stranded permission never blocks the send", async () => {
    const stalePermission = buildPermission("perm-stale", "session-a")
    const store = createStore({ "session-a": [stalePermission] }, {
      session: [{ id: "session-a", time: { created: 1 } } as Session],
    })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (404): PermissionNotFoundError"), { status: 404 })

    const { setActionRefs, dismissOpenPermissionsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenPermissionsForSession("session-a")

    expect(dismissed).toBe(true)
    const replyCallsForPermissions = replyCalls.filter((call) => call.method === "permission.reply")
    expect(replyCallsForPermissions).toHaveLength(1)
    expect(replyCallsForPermissions[0].params.requestID).toBe("perm-stale")
    // The stale entry is cleared from the store even though the server reported not-found.
    expect(store.getState().permission["session-a"]).toBe(undefined)
  })

  test("swallows and logs a non-not-found reject failure so the send is never blocked", async () => {
    const permission = buildPermission("perm-500", "session-a")
    const store = createStore({ "session-a": [permission] }, {
      session: [{ id: "session-a", time: { created: 1 } } as Session],
    })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (500)"), { status: 500 })

    const { setActionRefs, dismissOpenPermissionsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const errors: unknown[][] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => { errors.push(args) }
    try {
      const dismissed = await dismissOpenPermissionsForSession("session-a")

      expect(dismissed).toBe(true)
      const replyCallsForPermissions = replyCalls.filter((call) => call.method === "permission.reply")
      expect(replyCallsForPermissions).toHaveLength(1)
      expect(replyCallsForPermissions[0].params.requestID).toBe("perm-500")
      expect(errors).toHaveLength(1)
      expect(String(errors[0]?.[0])).toContain("[session-actions]")
    } finally {
      console.error = originalError
    }
  })

  test("puts the permissions back when the reject fails for another reason", async () => {
    const rootPermission = buildPermission("perm-root", "session-a")
    const childPermission = buildPermission("perm-child", "session-child")
    const store = createStore({ "session-a": [rootPermission] }, {
      session: [sessionFixture("session-a")],
    })
    // The subagent's session lives in its own worktree store.
    const worktreeStore = createStore({ "session-child": [childPermission] }, {
      session: [{ ...sessionFixture("session-child"), parentID: "session-a" }],
    })
    const childStores = createChildStores([["/test/project", store], ["/test/project/wt", worktreeStore]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (500): unexpected status"), { status: 500 })

    const { setActionRefs, dismissOpenPermissionsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const originalError = console.error
    console.error = () => {}
    let dismissed: boolean
    try {
      dismissed = await dismissOpenPermissionsForSession("session-a")
    } finally {
      console.error = originalError
    }

    expect(dismissed).toBe(true)
    // The agent is still waiting on both permissions, so each goes back to the store it came from.
    expect(store.getState().permission["session-a"]).toEqual([rootPermission])
    expect(store.getState().permission["session-child"]).toBe(undefined)
    expect(worktreeStore.getState().permission["session-child"]).toEqual([childPermission])
    expect(worktreeStore.getState().permission["session-a"]).toBe(undefined)
  })
})

describe("setSessionWorkState", () => {
  const savedArchiveResponse = archiveBatchResponse

  beforeEach(() => {
    runtimeKey = "runtime-a"
    openchamberRouteRequests.length = 0
    globalUpsertedSessions.length = 0
    beforeSessionGetResolve = null
    beforeArchiveRouteResolve = null
    sessionRecords.set("ses-work", { ...sessionFixture("ses-work"), metadata: {} })
    archiveBatchResponse = { status: 200, body: { metadata: { openchamber: { work: { state: "open" } } } } }
  })

  afterEach(() => {
    archiveBatchResponse = savedArchiveResponse
    beforeSessionGetResolve = null
    beforeArchiveRouteResolve = null
  })

  test("tracks the session through the metadata route", async () => {
    const { setSessionWorkState } = await import("./session-actions")

    const updated = await setSessionWorkState("ses-work", "/test/project", "open")

    expect(updated?.metadata).toEqual({ openchamber: { work: { state: "open" } } })
    const request = openchamberRouteRequests.find((entry) => entry.path.endsWith("/ses-work/metadata"))
    expect(request?.body).toMatchObject({ patch: { openchamber: { work: { state: "open", openedBy: "user" } } } })
  })

  test("reports a failed write and stores nothing", async () => {
    const { setSessionWorkState } = await import("./session-actions")
    archiveBatchResponse = { status: 500, body: { error: "OpenCode is down" } }

    const failure = await setSessionWorkState("ses-work", "/test/project", "done").catch((error: Error) => error)

    expect(failure instanceof Error).toBe(true)
    expect(globalUpsertedSessions).toHaveLength(0)
  })

  test("writes nothing to the new server when the runtime switches during the read", async () => {
    const { setSessionWorkState } = await import("./session-actions")
    beforeSessionGetResolve = () => {
      runtimeKey = "runtime-b"
    }

    expect(await setSessionWorkState("ses-work", "/test/project", "done")).toBeNull()

    expect(openchamberRouteRequests).toHaveLength(0)
    expect(globalUpsertedSessions).toHaveLength(0)
  })

  test("keeps the old server's answer out of the new server's cache when the runtime switches during the write", async () => {
    const { setSessionWorkState } = await import("./session-actions")
    beforeArchiveRouteResolve = () => {
      runtimeKey = "runtime-b"
    }

    expect(await setSessionWorkState("ses-work", "/test/project", "done")).toBeNull()

    expect(globalUpsertedSessions).toHaveLength(0)
  })
});

describe("sendRecoveredFormAnswer", () => {
  const recoveredForm: FormRequest = {
    id: "frm_recovered",
    sessionID: "session-a",
    title: "Questions",
    metadata: { kind: "question", tool: { messageID: "message-ask", id: "tool_ask" } },
    fields: [{ key: "q0", title: "Color", type: "string", options: [{ value: "Red", label: "Red" }] }],
  }

  const askMessage: Message = {
    id: "message-ask",
    sessionID: "session-a",
    role: "assistant",
    time: { created: 1 },
    agent: "build",
    providerID: "prov",
    modelID: "mod",
    variant: "think",
  }

  const askSession: Session = {
    id: "session-a",
    projectID: "proj",
    directory: "/test/project",
    title: "Ask",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }

  const question: RecoveredQuestion = {
    form: recoveredForm,
    directory: "/test/project",
    sessionID: "session-a",
    toolMessageID: "message-ask",
    evidence: "tool-interrupted",
  }

  const questionStore = () => createStore({}, {
    session: [askSession],
    message: { "session-a": [askMessage] },
  })

  beforeEach(() => {
    resetRecoverableQuestions()
    noteQuestionFormSnapshot("/test/project", [recoveredForm])
    sendMessageCalls.length = 0
    sendMessageBehavior = async () => {}
    runtimeKey = "default-runtime"
  })

  test("starts a new turn on the session that asked, with its own configuration", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")

    await sendRecoveredFormAnswer(question, "the answer")

    expect(sendMessageCalls).toEqual([{
      content: "the answer",
      providerID: "prov",
      modelID: "mod",
      agent: "build",
      variant: "think",
      queuedGoal: null,
      target: { runtimeKey: "default-runtime", sessionId: "session-a", directory: "/test/project" },
    }])
    // The card is done only after the send was accepted.
    expect(useRecoverableQuestionsStore.getState().outcomes.get("frm_recovered")).toBe("answered")
  })

  test("the new turn carries the serialized answer payload", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")
    const values: FormValues = {
      q0: { text: '', number: null, boolean: false, selected: ['Red'], custom: false, acknowledged: false },
    }

    await sendRecoveredFormAnswer(question, serializeFormAnswerAsMarkdown(recoveredForm, buildFormAnswer(recoveredForm.fields, values)))

    expect(sendMessageCalls).toHaveLength(1)
    expect(sendMessageCalls[0]?.content).toContain('# Questions')
    expect(sendMessageCalls[0]?.content).toContain('**Answer:** Red')
    expect(sendMessageCalls[0]?.content).toContain('{"q0":"Red"}')
  })

  test("a rejected send keeps the question recoverable", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")
    sendMessageBehavior = async () => {
      throw new Error("send failed")
    }

    await expect(sendRecoveredFormAnswer(question, "the answer")).rejects.toThrow("send failed")

    // No tombstone: the card and the draft the surface keeps stay for a retry.
    expect(useRecoverableQuestionsStore.getState().outcomes.has("frm_recovered")).toBe(false)
  })

  test("a duplicate submission reuses the first send", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    sendMessageBehavior = async () => {
      await gate
    }

    const first = sendRecoveredFormAnswer(question, "the answer")
    const second = sendRecoveredFormAnswer(question, "the answer")
    await Promise.resolve()
    expect(sendMessageCalls).toHaveLength(1)
    release()
    await Promise.all([first, second])
    expect(sendMessageCalls).toHaveLength(1)
  })

  test("a completion after a runtime switch leaves the next runtime alone", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")
    sendMessageBehavior = async () => {
      runtimeKey = "runtime-b"
    }

    await sendRecoveredFormAnswer(question, "the answer")

    expect(sendMessageCalls).toHaveLength(1)
    expect(useRecoverableQuestionsStore.getState().outcomes.has("frm_recovered")).toBe(false)
  })
})

describe("a session created with a title", () => {
  beforeEach(() => {
    replyCalls.length = 0
    globalUpsertedSessions.length = 0
    registeredSessionDirectories.length = 0
  })

  test("records the user's title and preserves existing metadata", async () => {
    const source = createStore({}, { session: [] })
    const { createSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    const session = await createSession("My task", "/test/project", { custom: "kept", openchamber: { kind: "review" } })

    expect(session?.id).toBe("created")
    const created = replyCalls.find((call) => call.method === "session.create")
    expect(created?.params.metadata).toEqual({
      custom: "kept",
      openchamber: { kind: "review", workTitle: { title: "My task", by: "user" } },
    })
  })

  test("leaves the metadata alone when no title is given", async () => {
    const source = createStore({}, { session: [] })
    const { createSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    const session = await createSession(undefined, "/test/project")

    expect(session?.id).toBe("created")
    const created = replyCalls.find((call) => call.method === "session.create")
    expect(created?.params.metadata).toBeUndefined()
=======
    expect(globalUpsertedSessions).toEqual([])
  })
})

describe("session restore (unarchive)", () => {
  // The route answers with stamps; the full record comes from the archived
  // list the global store already holds.
  const restored = (id: string, directory: string, archivedAt: number | null = null) => {
    globalArchivedSessions.push({
      id,
      projectID: "project-main",
      directory,
      title: `Title ${id}`,
      time: { created: 1, updated: 1, archived: 5 },
    } as unknown as Session)
    return { id, archivedAt }
  }

  beforeEach(async () => {
    replyCalls.length = 0
    registeredSessionDirectories.length = 0
    movedSessionDirectories.length = 0
    globalUpsertedSessions.length = 0
    globalActiveSessions.length = 0
    globalArchivedSessions.length = 0
    openchamberRouteRequests.length = 0
    beforeArchiveRouteResolve = null
    unarchiveBatchResponse = { status: 404, body: { error: "not found" } }
    activeStatusSnapshot = {}
    readActiveStatusSnapshot = async () => activeStatusSnapshot
    runtimeKey = "default-runtime"
    globalHasLoaded = true
    deletedChatDirectories.length = 0
    const { resetSessionOrdering } = await import("./session-ordering")
    resetSessionOrdering()
  })

  test("does not restore locally until the server returns the restored session", async () => {
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    const { takeSessionActionFailure } = await import("./session-action-failures")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(false)
    expect(takeSessionActionFailure(["session-a"])?.message).toContain("unarchive failed")
    expect(globalUpsertedSessions).toEqual([])
    expect(registeredSessionDirectories).toEqual([])
    const { useSessionOrderingStore } = await import("./session-ordering")
    expect(useSessionOrderingStore.getState().rankById.has("session-a")).toBe(false)
  })

  test("upserts the restored session and re-registers its directory after confirmation", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(true)
    expect(openchamberRouteRequests).toHaveLength(1)
    expect(openchamberRouteRequests[0].path).toBe("/api/openchamber/sessions/unarchive")
    expect(openchamberRouteRequests[0].body).toMatchObject({ ids: ["session-a"] })
    expect((globalUpsertedSessions[0] as Session)?.time?.archived).toBeUndefined()
    expect((globalUpsertedSessions[0] as Session)?.title).toBe("Title session-a")
    expect(registeredSessionDirectories).toEqual([{ sessionID: "session-a", directory: "/test/project" }])
    const { useSessionOrderingStore } = await import("./session-ordering")
    const rank = useSessionOrderingStore.getState().rankById.get("session-a")
    expect(rank ?? 0).toBeGreaterThan(0)
  })

  test("restores a parent together with its archived subsessions", async () => {
    const parent = restored("parent", "/test/project")
    globalArchivedSessions.push(
      { ...sessionFixture("child"), directory: "/test/project", parentID: "parent", time: { created: 1, updated: 1, archived: 5 } } as unknown as Session,
      { ...sessionFixture("grandchild"), directory: "/test/project", parentID: "child", time: { created: 1, updated: 1, archived: 5 } } as unknown as Session,
    )
    beforeArchiveRouteResolve = (path) => {
      if (!path.endsWith("/unarchive")) return
      const ids = openchamberRouteRequests.at(-1)?.body.ids
      const id = Array.isArray(ids) ? String(ids[0]) : ""
      unarchiveBatchResponse = { status: 200, body: { restored: [id === "parent" ? parent : { id, archivedAt: null }], failedIds: [] } }
    }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("parent")).toBe(true)
    expect(openchamberRouteRequests.map((request) => request.body.ids)).toEqual([["parent"], ["child"], ["grandchild"]])
  })

  test("restores linked reviews with the source while leaving archived forks untouched", async () => {
    globalArchivedSessions.push(
      { ...archivedFixture("review"), metadata: { openchamber: { kind: "review", originalSessionID: "session-a" } } },
      { ...archivedFixture("review-child"), parentID: "review" },
      { ...archivedFixture("fork"), fork: { sessionID: "session-a", boundary: { type: "through", messageID: "message" } } },
      { ...archivedFixture("promoted"), metadata: { openchamber: { btwPromoted: true } }, fork: { sessionID: "session-a", boundary: { type: "through", messageID: "message" } } },
    )
    beforeArchiveRouteResolve = (path) => {
      if (!path.endsWith("/unarchive")) return
      const ids = openchamberRouteRequests.at(-1)?.body.ids
      const id = Array.isArray(ids) ? String(ids[0]) : ""
      unarchiveBatchResponse = { status: 200, body: { restored: [{ id, archivedAt: null }], failedIds: [] } }
    }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(true)
    expect(openchamberRouteRequests.map((request) => request.body.ids)).toEqual([["session-a"], ["review"], ["review-child"]])
  })

  test("restores a subsession on its own when its parent is active", async () => {
    globalActiveSessions = [sessionFixture("parent")]
    globalArchivedSessions.push({ ...archivedFixture("child"), parentID: "parent" }, { ...archivedFixture("grandchild"), parentID: "child" })
    beforeArchiveRouteResolve = (path) => {
      if (!path.endsWith("/unarchive")) return
      const ids = openchamberRouteRequests.at(-1)?.body.ids
      unarchiveBatchResponse = { status: 200, body: { restored: [{ id: Array.isArray(ids) ? String(ids[0]) : "", archivedAt: null }], failedIds: [] } }
    }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    // Its own archived subsessions come back with it.
    expect(await unarchiveSession("child")).toBe(true)
    expect(openchamberRouteRequests.map((request) => request.body.ids)).toEqual([["child"], ["grandchild"]])
  })

  test("never restores a subsession of an archived or unknown parent on its own", async () => {
    globalArchivedSessions.push(
      { ...sessionFixture("child"), directory: "/test/project", parentID: "parent", time: { created: 1, updated: 1, archived: 5 } } as unknown as Session,
    )
    unarchiveBatchResponse = { status: 200, body: { restored: [{ id: "child", archivedAt: null }], failedIds: [] } }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, unarchiveSessions, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("child")).toBe(false)
    expect(await unarchiveSessions(["child"])).toEqual({ restoredIds: [], failedIds: ["child"] })
    expect(openchamberRouteRequests).toEqual([])

    // The same once the parent is known and archived.
    globalArchivedSessions.push(archivedFixture("parent"))
    expect(await unarchiveSession("child")).toBe(false)
    expect(openchamberRouteRequests).toEqual([])

    // Undo puts back exactly what an archive just moved, subsessions included.
    expect(await unarchiveSessions(["child"], { undo: true })).toEqual({ restoredIds: ["child"], failedIds: [] })
  })

  test("archive then immediately restore recovers the running status instead of treating an old snapshot as idle", async () => {
    archiveBatchResponse = { status: 200, body: { archived: [{ id: "session-a", archivedAt: 2 }], failedIds: [] } }
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    activeStatusSnapshot = { "session-a": { type: "busy" } }
    const source = createStore({}, {
      session: [{ ...sessionFixture("session-a"), directory: "/test/project" }],
      session_status: { "session-a": { type: "busy" } },
      sessionStatusReady: true,
    })
    const { archiveSession, unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await archiveSession("session-a")).toBe(true)
    expect(source.getState().session_status["session-a"]).toBeUndefined()
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBe(true)
    expect(await unarchiveSession("session-a")).toBe(true)
    expect(source.getState().session_status["session-a"]).toEqual({ type: "busy" })
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBeUndefined()
  })

  test("reads the owning space's status before settling a restored session", async () => {
    const spaceDirectory = "/spaces/a1b2c3d4e5f6/app"
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", spaceDirectory)], failedIds: [] } }
    const source = createStore({}, { sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const statusReadDirectories: Array<string | null | undefined> = []
    readActiveStatusSnapshot = async (directory): Promise<Record<string, SessionStatus>> => {
      expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBe(true)
      expect(source.getState().session_status["session-a"]).toBeUndefined()
      statusReadDirectories.push(directory)
      return directory === spaceDirectory ? { "session-a": { type: "busy" } } : {}
    }
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[spaceDirectory, source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(true)
    expect(statusReadDirectories).toEqual([spaceDirectory])
    expect(source.getState().session_status["session-a"]).toEqual({ type: "busy" })
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBeUndefined()
  })

  test("a failed restore status read leaves the session unknown without undoing the restore", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    activeStatusSnapshot = null
    const source = createStore({}, { sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(true)
    expect(source.getState().session_status["session-a"]).toBeUndefined()
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBe(true)
  })

  test("a runtime switch during the status read keeps a confirmed restore in restoredIds", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    const source = createStore({}, { sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const { switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    const { takeSessionActionFailure } = await import("./session-action-failures")
    const { unarchiveSessions, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")
    takeSessionActionFailure(["session-a", "session-b"])
    readActiveStatusSnapshot = async () => {
      switchRuntimeEndpoint({ apiBaseUrl: "http://restore-status-runtime-b.test", runtimeKey: "restore-status-runtime-b" })
      return { "session-a": { type: "busy" } }
    }

    expect(await unarchiveSessions(["session-a", "session-b"])).toEqual({
      restoredIds: ["session-a"], failedIds: ["session-b"],
    })
    expect(globalUpsertedSessions).toHaveLength(1)
    expect(source.getState().session_status["session-a"]).toBeUndefined()
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBe(true)
    expect(openchamberRouteRequests.map((request) => request.body.ids)).toEqual([["session-a"]])
    // A confirmed restore is not an action failure; the unattempted ID has no server error either.
    expect(takeSessionActionFailure(["session-a", "session-b"])).toBeNull()
  })

  test("a rejected status read cannot turn an already-confirmed restore into an action failure", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    const source = createStore({}, { sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const { takeSessionActionFailure } = await import("./session-action-failures")
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")
    takeSessionActionFailure(["session-a"])
    readActiveStatusSnapshot = async () => { throw new Error("status read failed") }

    expect(await unarchiveSession("session-a")).toBe(true)
    expect(globalUpsertedSessions).toHaveLength(1)
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBe(true)
    expect(takeSessionActionFailure(["session-a"])).toBeNull()
  })

  test("a status event during the restore read wins over its older snapshot", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    let resolveSnapshot: (snapshot: Record<string, SessionStatus>) => void = () => undefined
    let notifyReadStart: () => void = () => undefined
    const readStarted = new Promise<void>((resolve) => { notifyReadStart = resolve })
    readActiveStatusSnapshot = () => {
      notifyReadStart()
      return new Promise((resolve) => { resolveSnapshot = resolve })
    }
    const source = createStore({}, { sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    const restoring = unarchiveSession("session-a")
    await readStarted
    source.setState({ session_status: { "session-a": { type: "busy" } }, sessionStatusInvalidated: {} })
    resolveSnapshot({})
    expect(await restoring).toBe(true)
    expect(source.getState().session_status["session-a"]).toEqual({ type: "busy" })
    expect(source.getState().sessionStatusInvalidated?.["session-a"]).toBeUndefined()
  })

  test("fails when the server keeps the session archived", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project", 2)], failedIds: [] } }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    // A silent server-side no-op must surface as a failure, not a success toast.
    expect(await unarchiveSession("session-a")).toBe(false)
    expect(globalUpsertedSessions).toEqual([])
    expect(registeredSessionDirectories).toEqual([])
    const { useSessionOrderingStore } = await import("./session-ordering")
    expect(useSessionOrderingStore.getState().rankById.has("session-a")).toBe(false)
  })

  test("fails when the answer omits the session that was asked for", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [], failedIds: ["session-a"] } }
    const source = createStore({}, { session: [] })
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(false)
    expect(globalUpsertedSessions).toEqual([])
  })

  test("restores a worktree session into its own directory, not the parent project", async () => {
    const worktreeDirectory = "/projects/main/.worktrees/feature-a"
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-worktree", worktreeDirectory)], failedIds: [] } }

    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[worktreeDirectory, createStore({})]]), () => worktreeDirectory)

    expect(await unarchiveSession("session-worktree")).toBe(true)
    expect(movedSessionDirectories).toEqual([])
    expect(registeredSessionDirectories).toEqual([{ sessionID: "session-worktree", directory: worktreeDirectory }])
    expect((globalUpsertedSessions[0] as SessionWithDirectory).directory).toBe(worktreeDirectory)
  })

  test("rejects a restore response that arrives after a runtime switch", async () => {
    unarchiveBatchResponse = { status: 200, body: { restored: [restored("session-a", "/test/project")], failedIds: [] } }
    const source = createStore({}, { session: [] })
    const { getRuntimeKey, switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    switchRuntimeEndpoint({ apiBaseUrl: "http://restore-runtime-a.test", runtimeKey: "restore-runtime-a" })
    beforeArchiveRouteResolve = () => {
      switchRuntimeEndpoint({ apiBaseUrl: "http://restore-runtime-b.test", runtimeKey: "restore-runtime-b" })
    }
    const { unarchiveSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    expect(await unarchiveSession("session-a")).toBe(false)
    expect(getRuntimeKey()).toBe("restore-runtime-b")
    // The stale response must not reconcile the runtime the user switched to.
    expect(globalUpsertedSessions).toEqual([])
    expect(registeredSessionDirectories).toEqual([])
    const { useSessionOrderingStore } = await import("./session-ordering")
    expect(useSessionOrderingStore.getState().rankById.has("session-a")).toBe(false)
  })

  test("keeps confirmed sessions and fails the rest when the runtime changes mid-batch", async () => {
    unarchiveBatchResponse = {
      status: 200,
      body: {
        restored: [
          restored("session-a", "/test/project"),
          restored("session-b", "/test/project"),
        ],
        failedIds: [],
      },
    }
    const source = createStore({}, { session: [] })
    const { switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    switchRuntimeEndpoint({ apiBaseUrl: "http://restore-batch-a.test", runtimeKey: "restore-batch-a" })
    let requests = 0
    beforeArchiveRouteResolve = () => {
      requests += 1
      if (requests === 2) {
        switchRuntimeEndpoint({ apiBaseUrl: "http://restore-batch-b.test", runtimeKey: "restore-batch-b" })
      }
    }
    const { unarchiveSessions, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    const result = await unarchiveSessions(["session-a", "session-b", "session-c"])

    // session-a was confirmed before the switch and stays restored; session-b's
    // response is stale and session-c is never attempted, so both are reported
    // as failures instead of being silently dropped.
    expect(result).toEqual({ restoredIds: ["session-a"], failedIds: ["session-b", "session-c"] })
    expect(globalUpsertedSessions).toHaveLength(1)
    // session-c must not reach the server after the runtime changed.
    expect(openchamberRouteRequests.map((request) => request.body.ids)).toEqual([["session-a"], ["session-b"]])
  })
})

describe("updateSessionTitle live state", () => {
  beforeEach(() => {
    replyCalls.length = 0
    globalUpsertedSessions.length = 0
    sessionRecords.clear()
  })

  test("updates the live directory store after renaming", async () => {
    const oldSession = { ...sessionFixture("session-a"), title: "Old Title" }
    const sessionStore = createStore({}, { session: [oldSession] })
    const childStores = createChildStores([["/test/project", sessionStore]])
    sessionRecords.set("session-a", oldSession)

    const { setActionRefs, updateSessionTitle } = await import("./session-actions")
    setActionRefs(childStores, () => "/current/project")

    await updateSessionTitle("session-a", "New Title")

    const renameCall = replyCalls.find((call) => call.method === "session.rename")
    expect(renameCall?.params.sessionID).toBe("session-a")
    expect(renameCall?.params.title).toBe("New Title")
    expect(renameCall?.params.directory).toBe("/test/project")
    // `session.update` answers with nothing, so the published record is the
    // re-read session rather than a locally patched copy.
    expect((globalUpsertedSessions[0] as Session)?.title).toBe("New Title")
    expect(sessionStore.getState().session[0].title).toBe("New Title")
  })

  test("renames a worktree session against its own directory, not the project root that indexes its status", async () => {
    const worktreeSession = { ...sessionFixture("session-wt"), directory: "/test/project/.worktrees/feature", title: "Old Title" }
    globalActiveSessions = [worktreeSession]
    sessionRecords.set("session-wt", worktreeSession)
    // The project root's store knows the session only through the status index
    // it receives for its worktrees; the session record itself lives elsewhere.
    const rootStore = createStore({}, { session: [], session_status: { "session-wt": { type: "idle" } } })
    const childStores = createChildStores([["/test/project", rootStore]])

    const { setActionRefs, updateSessionTitle } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await updateSessionTitle("session-wt", "New Title")

    const renameCall = replyCalls.find((call) => call.method === "session.rename")
    expect(renameCall?.params.directory).toBe("/test/project/.worktrees/feature")
    globalActiveSessions = []
  })
})

describe("optimisticSend target directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    commitRevertError = null
  })

  test("passes the prompt directory to optimistic state during session switch races", async () => {
    const currentStore = createStore({})
    const targetStore = createStore({})
    const childStores = createChildStores([
      ["/current/project", currentStore],
      ["/target/project", targetStore],
    ])
    let optimisticAdd: OptimisticAddCall | null = null
    let optimisticRemove: OptimisticRemoveCall | null = null
    let sentMessageID = ""

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/current/project")
    setOptimisticRefs(
      (input) => {
        optimisticAdd = input
      },
      (input) => {
        optimisticRemove = input
      },
    )

    await optimisticSend({
      sessionId: "session-new",
      directory: "/target/project",
      content: "hello",
      send: async (messageID) => {
        sentMessageID = messageID
      },
    })

    expect(optimisticAdd).not.toBeNull()
    const add = optimisticAdd as unknown as OptimisticAddCall
    expect(add.directory).toBe("/target/project")
    expect(add.sessionID).toBe("session-new")
    expect(add.message.id).toBe(sentMessageID)
    expect(optimisticRemove).toBe(null)
    expect(targetStore.getState().session_status["session-new"]?.type).toBe("busy")
    expect(currentStore.getState().session_status["session-new"]).toBe(undefined)
  })

  test("marks the prompt as being sent until its request settles, accepted or rejected", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    const { hasPromptInFlight } = await import("./prompts-in-flight")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(() => {}, () => {})

    let inFlightDuringSend = false
    await optimisticSend({
      sessionId: "session-cold",
      directory: "/target/project",
      content: "hello",
      send: async () => { inFlightDuringSend = hasPromptInFlight("session-cold") },
    })
    expect(inFlightDuringSend).toBe(true)
    expect(hasPromptInFlight("session-cold")).toBe(false)

    await expect(optimisticSend({
      sessionId: "session-cold",
      directory: "/target/project",
      content: "again",
      send: async () => { throw new Error("rejected") },
    })).rejects.toThrow("rejected")
    expect(hasPromptInFlight("session-cold")).toBe(false)
    expect(targetStore.getState().session_status["session-cold"]?.type).toBe("idle")
  })

  test("commits the new branch locally and discards its optimistic shadow when sending after a revert", async () => {
    const retainedMessage = { id: "msg_ffffffffffffRetained", role: "user", sessionID: "session-reverted", time: { created: 1 } } as Message
    const revertedMessage = { id: "msg_000000000000Reverted", role: "user", sessionID: "session-reverted", time: { created: 2 } } as Message
    const targetStore = createStore({}, {
      session: [{ id: "session-reverted", revert: { messageID: revertedMessage.id } } as Session],
      message: { "session-reverted": [retainedMessage, revertedMessage] },
      part: { [revertedMessage.id]: [{ id: "part_2", type: "text", text: "old branch" } as Part] },
    })
    const childStores = createChildStores([["/target/project", targetStore]])
    let optimisticMessage: Message | null = null
    const optimisticShadow = new Set([revertedMessage.id])

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      (input) => {
        optimisticMessage = input.message
        optimisticShadow.add(input.message.id)
        targetStore.setState((state) => ({
          message: { ...state.message, [input.sessionID]: [...(state.message[input.sessionID] ?? []), input.message] },
          part: { ...state.part, [input.message.id]: input.parts },
        }))
      },
      () => {},
      (input) => optimisticShadow.delete(input.messageID),
    )

    await optimisticSend({
      sessionId: "session-reverted",
      directory: "/target/project",
      content: "new branch",
      send: async () => {},
    })

    expect(targetStore.getState().session[0].revert).toBe(undefined)
    expect(targetStore.getState().message["session-reverted"].map((message) => message.id)).toEqual([
      retainedMessage.id,
      (optimisticMessage as unknown as Message).id,
    ])
    expect(targetStore.getState().part[revertedMessage.id]).toBe(undefined)
    expect(optimisticShadow.has(revertedMessage.id)).toBe(false)
    expect(optimisticShadow.has((optimisticMessage as unknown as Message).id)).toBe(true)
  })

  // A failed send puts the revert back only while the server still has it staged.
  for (const { outcome, commit, serverStaged, restored } of [
    { outcome: "before the commit", commit: "none", serverStaged: true, restored: true },
    { outcome: "after the server committed the revert", commit: "answered", serverStaged: false, restored: false },
    { outcome: "after a lost commit response the server applied", commit: "lost", serverStaged: false, restored: false },
    { outcome: "after a lost commit response the server did not apply", commit: "lost", serverStaged: true, restored: true },
  ] as const) test(`${restored ? "restores" : "keeps dropped"} the reverted branch when sending fails ${outcome}`, async () => {
    const retainedMessage = { id: "msg_ffffffffffffRetained", role: "user", sessionID: "session-reverted", time: { created: 1 } } as Message
    const revertedMessage = { id: "msg_000000000000Reverted", role: "user", sessionID: "session-reverted", time: { created: 2 } } as Message
    const revertedPart = { id: "part_2", type: "text", text: "old branch" } as Part
    const targetStore = createStore({}, {
      session: [{ id: "session-reverted", revert: { messageID: revertedMessage.id } } as Session],
      message: { "session-reverted": [retainedMessage, revertedMessage] },
      part: { [revertedMessage.id]: [revertedPart] },
    })
    const childStores = createChildStores([["/target/project", targetStore]])
    sessionRecords.set("session-reverted", serverStaged ? { ...sessionFixture("session-reverted"), revert: { messageID: revertedMessage.id } } : sessionFixture("session-reverted"))
    if (commit === "lost") commitRevertError = Object.assign(new Error("gateway timeout"), { status: 504 })

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      (input) => targetStore.setState((state) => ({
        message: { ...state.message, [input.sessionID]: [...(state.message[input.sessionID] ?? []), input.message] },
        part: { ...state.part, [input.message.id]: input.parts },
      })),
      (input) => targetStore.setState((state) => ({
        message: { ...state.message, [input.sessionID]: (state.message[input.sessionID] ?? []).filter((message) => message.id !== input.messageID) },
        part: Object.fromEntries(Object.entries(state.part).filter(([messageID]) => messageID !== input.messageID)),
      })),
    )

    await expect(optimisticSend({
      sessionId: "session-reverted",
      directory: "/target/project",
      content: "new branch",
      send: async (_messageID, _context, commitRevert) => {
        if (commit !== "none") await commitRevert?.()
        throw new Error("rejected")
      },
    })).rejects.toThrow()

    expect(targetStore.getState().session[0].revert).toEqual(restored ? { messageID: revertedMessage.id } : undefined)
    expect(targetStore.getState().message["session-reverted"]).toEqual(restored ? [retainedMessage, revertedMessage] : [retainedMessage])
    expect(targetStore.getState().part[revertedMessage.id]).toEqual(restored ? [revertedPart] : undefined)
  })

  test("runs appendSubmissions before revert cleanup and optimistic insertion", async () => {
    const revertedMessage = { id: "msg_000000000000Reverted", role: "user", sessionID: "session-reverted", time: { created: 2 } } as Message
    const targetStore = createStore({}, {
      session: [{ id: "session-reverted", revert: { messageID: revertedMessage.id } } as Session],
      message: { "session-reverted": [revertedMessage] },
      part: { [revertedMessage.id]: [{ id: "part_2", type: "text", text: "old branch" } as Part] },
    })
    const childStores = createChildStores([["/target/project", targetStore]])
    const callOrder: string[] = []

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {
        callOrder.push("optimistic-add")
      },
      () => {},
      () => {
        callOrder.push("revert-confirm")
      },
    )

    await optimisticSend({
      sessionId: "session-reverted",
      directory: "/target/project",
      content: "new branch",
      appendSubmissions: () => {
        callOrder.push("append")
      },
      send: async () => {},
    })

    expect(callOrder).toEqual(["append", "revert-confirm", "optimistic-add"])
  })

  test("runs appendSubmissions once for a definite rejection", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let appendCalls = 0

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      () => {},
    )

    await expect(optimisticSend({
      sessionId: "session-rejected",
      directory: "/target/project",
      content: "hello",
      appendSubmissions: () => {
        appendCalls += 1
      },
      send: async () => { throw new Error("rejected") },
    })).rejects.toThrow("rejected")

    expect(appendCalls).toBe(1)
  })

  test("shows context before the prompt at once and hands the same ids to the send", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    const added: Message[] = []
    const removed: string[] = []
    let sent: { messageID: string; contextIDs: Array<string | undefined> } | null = null

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      (input) => {
        added.push(input.message)
      },
      (input) => {
        removed.push(input.messageID)
      },
    )

    const metadata = { openchamberContext: { kind: "chat-quote" as const, quote: "q", text: "t", messageId: "m" } }
    await expect(optimisticSend({
      sessionId: "session-context",
      directory: "/target/project",
      content: "",
      context: [{ text: "first", metadata }, { text: "  " }, { text: "second" }],
      send: async (messageID, context) => {
        sent = { messageID, contextIDs: context.map((item) => item.id) }
        throw new Error("rejected")
      },
    })).rejects.toThrow("rejected")

    // The blank item gets no record, the others come first with the prompt's time.
    expect(added.map((message) => message.role)).toEqual(["synthetic", "synthetic", "user"])
    expect(new Set(added.map((message) => message.time.created)).size).toBe(1)
    expect(added[0]?.metadata).toEqual(metadata)
    const ids = added.map((message) => message.id)
    expect([...ids].sort()).toEqual(ids)
    expect(sent).toEqual({ messageID: ids[2], contextIDs: [ids[0], ids[1]] })
    // A rejected send takes the context records down with the prompt.
    expect(removed).toEqual(ids)
  })

  test("shows the prompt before the knowledge write finishes, and sends only after it", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    const added: Message[] = []
    let sent: { messageID: string; texts: string[] } | null = null
    let finishWrite: () => void = () => {}
    const ready = new Promise<void>((resolve) => { finishWrite = resolve })

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs((input) => { added.push(input.message) }, () => {})

    const sending = optimisticSend({
      sessionId: "session-ready",
      directory: "/target/project",
      content: "hello",
      context: [{ text: "quoted" }],
      ready,
      send: async (messageID, context) => {
        sent = { messageID, texts: context.map((item) => item.text) }
      },
    })
    for (let tick = 0; tick < 50 && !added.some((message) => message.role === "user"); tick += 1) {
      await Promise.resolve()
    }

    // The bubble is on screen while the knowledge is still being written, and
    // nothing has been sent ahead of it.
    expect(added.map((message) => message.role)).toEqual(["synthetic", "user"])
    expect(sent).toBe(null)

    finishWrite()
    await sending
    expect(sent).toEqual({ messageID: added[1].id, texts: ["quoted"] })
  })

  test("runs appendSubmissions once for an ambiguous confirmation", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let appendCalls = 0

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      () => {},
      () => {},
    )

    await optimisticSend({
      sessionId: "session-confirmed",
      directory: "/target/project",
      content: "hello",
      appendSubmissions: () => {
        appendCalls += 1
      },
      send: async (messageID) => {
        sessionMessageRecords.set("session-confirmed", [{
          info: { id: messageID, role: "user", sessionID: "session-confirmed", time: { created: 1 } },
          parts: [{ id: "server-part", sessionID: "session-confirmed", messageID, type: "text", text: "hello" }],
        }])
        const error = new Error("Failed to send message (504): gateway timeout") as Error & { status?: number }
        error.status = 504
        throw error
      },
    })

    expect(appendCalls).toBe(1)
  })

  test("does not run appendSubmissions when the runtime changes before dispatch", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let appendCalls = 0
    const { switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    switchRuntimeEndpoint({ apiBaseUrl: "http://runtime-b.test", runtimeKey: "runtime-b" })

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      () => {},
    )

    await expect(optimisticSend({
      sessionId: "session-race",
      directory: "/target/project",
      runtimeKey: "runtime-a",
      content: "hello",
      appendSubmissions: () => {
        appendCalls += 1
      },
      send: async () => {},
    })).rejects.toThrow("runtime changed")

    expect(appendCalls).toBe(0)
  })

  test("rolls back a captured send when the runtime changes after optimistic insert", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let optimisticAdd: OptimisticAddCall | null = null
    let optimisticRemove: OptimisticRemoveCall | null = null
    let finalSendCalled = false
    const { getRuntimeKey, switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    switchRuntimeEndpoint({ apiBaseUrl: "http://runtime-a.test", runtimeKey: "runtime-a" })

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      (input) => {
        optimisticAdd = input
      },
      (input) => {
        optimisticRemove = input
      },
    )

    let caught: unknown = null
    try {
      await optimisticSend({
        sessionId: "session-race",
        directory: "/target/project",
        runtimeKey: "runtime-a",
        content: "hello",
        onOptimisticInsert: () => {
          expect(getRuntimeKey()).toBe("runtime-a")
          switchRuntimeEndpoint({ apiBaseUrl: "http://runtime-b.test", runtimeKey: "runtime-b" })
        },
        send: async () => {
          finalSendCalled = true
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain("runtime changed")

    expect(optimisticAdd).not.toBeNull()
    expect(finalSendCalled).toBe(false)
    expect(optimisticRemove).not.toBeNull()
    expect((optimisticRemove as unknown as OptimisticRemoveCall).sessionID).toBe("session-race")
    expect(targetStore.getState().session_status["session-race"]?.type).toBe("idle")
  })

  test("confirms an ambiguous send failure with a recent message refetch", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let optimisticRemove: OptimisticRemoveCall | null = null
    let optimisticConfirm: OptimisticRemoveCall | null = null
    let sentMessageID = ""

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      (input) => {
        optimisticRemove = input
      },
      (input) => {
        optimisticConfirm = input
      },
    )

    await optimisticSend({
      sessionId: "session-confirmed",
      directory: "/target/project",
      content: "hello",
      send: async (messageID) => {
        sentMessageID = messageID
        sessionMessageRecords.set("session-confirmed", [{
          info: { id: messageID, role: "user", sessionID: "session-confirmed", time: { created: 1 } },
          parts: [{ id: "server-part", sessionID: "session-confirmed", messageID, type: "text", text: "hello" }],
        }])
        const error = new Error("Failed to send message (504): gateway timeout") as Error & { status?: number }
        error.status = 504
        throw error
      },
    })

    expect(optimisticRemove).toBe(null)
    expect((optimisticConfirm as OptimisticRemoveCall | null)?.messageID).toBe(sentMessageID)
    expect(replyCalls.find((call) => call.method === "session.messages")?.params.limit).toBe(30)
    expect(targetStore.getState().message["session-confirmed"]?.[0]?.id).toBe(sentMessageID)
    expect(targetStore.getState().part[sentMessageID]?.[0]?.id).toBe("server-part")
  })

  // Relay tunnel aborts carry no HTTP status and no wording the text-matching
  // heuristic recognizes. Without the transport tag they were classified as
  // definite failures, the accepted prompt was rolled back, and the queue
  // re-sent a message the engine was already answering (#2425).
  test("confirms a tunnel-tagged transport failure that no text heuristic matches", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let optimisticRemove: OptimisticRemoveCall | null = null
    let optimisticConfirm: OptimisticRemoveCall | null = null
    let sentMessageID = ""

    const { markAmbiguousTransportFailure } = await import("@/lib/relay/transport-error")
    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      (input) => {
        optimisticRemove = input
      },
      (input) => {
        optimisticConfirm = input
      },
    )

    await optimisticSend({
      sessionId: "session-tunnel",
      directory: "/target/project",
      content: "hello",
      send: async (messageID) => {
        sentMessageID = messageID
        sessionMessageRecords.set("session-tunnel", [{
          info: { id: messageID, role: "user", sessionID: "session-tunnel", time: { created: 1 } },
          parts: [{ id: "server-part", sessionID: "session-tunnel", messageID, type: "text", text: "hello" }],
        }])
        throw markAmbiguousTransportFailure(new Error("stream aborted by host"))
      },
    })

    expect(optimisticRemove).toBe(null)
    expect((optimisticConfirm as OptimisticRemoveCall | null)?.messageID).toBe(sentMessageID)
    expect(targetStore.getState().message["session-tunnel"]?.[0]?.id).toBe(sentMessageID)
  })

  test("rolls back an ambiguous send failure when recent messages do not contain the sent ID", async () => {
    const targetStore = createStore({})
    const childStores = createChildStores([["/target/project", targetStore]])
    let optimisticRemove: OptimisticRemoveCall | null = null
    let optimisticConfirm: OptimisticRemoveCall | null = null

    const { optimisticSend, setActionRefs, setOptimisticRefs } = await import("./session-actions")
    setActionRefs(childStores, () => "/target/project")
    setOptimisticRefs(
      () => {},
      (input) => {
        optimisticRemove = input
      },
      (input) => {
        optimisticConfirm = input
      },
    )

    let caught: unknown = null
    try {
      await optimisticSend({
        sessionId: "session-missing",
        directory: "/target/project",
        content: "hello",
        send: async () => {
          const error = new Error("Failed to send message (504): gateway timeout") as Error & { status?: number }
          error.status = 504
          throw error
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((optimisticRemove as OptimisticRemoveCall | null)?.sessionID).toBe("session-missing")
    expect(optimisticConfirm).toBe(null)
    expect(replyCalls.filter((call) => call.method === "session.messages").every((call) => call.params.limit === 30)).toBe(true)
    expect(targetStore.getState().session_status["session-missing"]?.type).toBe("idle")
  })
})

describe("respondToPermission passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    permissionReplyError = null
    sessionRecords.clear()
    fetchedSessionRecords.clear()
    globalActiveSessions = []
    globalArchivedSessions.length = 0
    directoryStateOverride = null
    sessionRecords.set("session-a", sessionFixture("session-a"))
  })
  afterEach(() => {
    sessionRecords.clear()
    fetchedSessionRecords.clear()
  })

  test("passes directory from child store when permission is found", async () => {
    const permission: PermissionRequest = {
      id: "perm-1",
      sessionID: "session-a",
      action: "bash",
      resources: [],
      metadata: {},
    }

    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await respondToPermission("session-a", "perm-1", "once")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-1")
    expect(replyCalls[0].params.reply).toBe("once")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })

  test("passes directory from session mapping when permission not in store", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    // The server's record names no directory, so the guess stands.
    // SAFETY: the reply reads only the record's id and directory fields.
    fetchedSessionRecords.set("session-b", { id: "session-b" } as Session)
    await respondToPermission("session-b", "perm-2", "always")

    const replies = replyCalls.filter((call) => call.method === "permission.reply")
    expect(replies).toHaveLength(1)
    expect(replies[0].params.requestID).toBe("perm-2")
    expect(replies[0].params.reply).toBe("always")
    expect(replies[0].params.directory).toBe("/other/project")
  })

  test("passes directory from current directory as last resort", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/fallback/dir")

    // SAFETY: the reply reads only the record's id and directory fields.
    fetchedSessionRecords.set("unknown-session", { id: "unknown-session" } as Session)
    await respondToPermission("unknown-session", "perm-3", "reject")

    const replies = replyCalls.filter((call) => call.method === "permission.reply")
    expect(replies).toHaveLength(1)
    expect(replies[0].params.requestID).toBe("perm-3")
    expect(replies[0].params.reply).toBe("reject")
    expect(replies[0].params.directory).toBe("/fallback/dir")
  })

  test("uses an explicit event directory before incomplete local routing state", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/stale/current")

    await respondToPermission("unknown-session", "perm-event", "once", "/event/project")

    expect(replyCalls.filter((call) => call.method === "permission.reply").map((call) => call.params.directory)).toContain("/event/project")
    expect(replyCalls[0].params.directory).toBe("/event/project")
  })

  test("a worktree permission whose record no store holds is answered on the record's own directory (#6555)", async () => {
    const permission = buildPermission("perm-wt", "session-wt")
    const store = createStore({ "session-wt": [permission] })
    fetchedSessionRecords.set("session-wt", { ...sessionFixture("session-wt"), directory: "/test/project/wt" })

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    await respondToPermission("session-wt", "perm-wt", "once")

    expect(replyCalls.filter((call) => call.method === "permission.reply").map((call) => call.params.directory)).toEqual(["/test/project/wt"])
  })

  test("a failed record read sends nothing and keeps the permission pending (#6555)", async () => {
    const permission = buildPermission("perm-unread", "session-unread")
    const store = createStore({ "session-unread": [permission] })

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    await expect(respondToPermission("session-unread", "perm-unread", "once")).rejects.toThrow()

    expect(replyCalls.filter((call) => call.method === "permission.reply")).toHaveLength(0)
    expect(store.getState().permission["session-unread"]).toEqual([permission])
  })
})

describe("forkFromMessage composer restore", () => {
  const sourceSession: Session = {
    id: "session-a",
    projectID: "project-a",
    directory: "/test/project",
    title: "Source session",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
  const forkedSession: Session = { ...sourceSession, id: "session-fork", title: "Forked session" }
  const textPart: Part = {
    id: "part-text",
    sessionID: sourceSession.id,
    messageID: "message-fork",
    type: "text",
    text: "Replay this prompt",
  }
  const filePart: Part = {
    id: "part-file",
    sessionID: sourceSession.id,
    messageID: "message-fork",
    type: "file",
    url: "data:image/png;base64,aW1hZ2U=",
    mime: "image/png",
    filename: "screenshot.png",
  }
  const restoredFile = { url: filePart.url, mimeType: filePart.mime, filename: filePart.filename }

  beforeEach(() => {
    replyCalls.length = 0
    selectedSessions.length = 0
    runtimeKey = "fork-runtime"
    sessionForkResult = forkedSession
    sessionForkError = null
    beforeSessionForkResolve = null
    inputState.pendingComposerRestore = null
    inputState.pendingInputText = "Keep the source draft"
    inputState.pendingInputMode = "append"
    inputState.attachedFiles = [{
      id: "source-attachment",
      file: new File(["source"], "source.txt", { type: "text/plain" }),
      dataUrl: "data:text/plain;base64,c291cmNl",
      mimeType: "text/plain",
      filename: "source.txt",
      size: 6,
      source: "local",
    }]
  })

  for (const directory of ["/test/project", "/canonical/project"]) {
    test(`stages the replay for the returned session in ${directory} without changing the source composer`, async () => {
      sessionForkResult = { ...forkedSession, directory }
      const source = createStore({}, {
        session: [sourceSession],
        part: { "message-fork": [textPart, filePart] },
      })
      const sourceInput = { ...inputState }
      const { forkFromMessage, setActionRefs } = await import("./session-actions")
      setActionRefs(createChildStores([[sourceSession.directory, source]]), () => "/other/project")

      await forkFromMessage(sourceSession.id, "message-fork")

      expect(replyCalls).toEqual([{
        method: "session.fork",
        params: { sessionID: sourceSession.id, messageID: "message-fork", directory: sourceSession.directory },
      }])
      expect(inputState.pendingComposerRestore).toEqual({
        target: { runtimeKey: "fork-runtime", directory, sessionId: forkedSession.id },
        text: "Replay this prompt",
        files: [restoredFile],
      })
      expect(inputState.pendingInputText).toBe(sourceInput.pendingInputText)
      expect(inputState.pendingInputMode).toBe(sourceInput.pendingInputMode)
      expect(inputState.attachedFiles).toBe(sourceInput.attachedFiles)
      expect(inputState.attachedFiles).toHaveLength(1)
      expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: directory }])
      expect(source.getState().session).toEqual([sourceSession, sessionForkResult])
    })
  }

  test("forks before the message's context carriers so the fork does not repeat them", async () => {
    const carrier = { id: "message-ctx", sessionID: sourceSession.id, role: "synthetic", time: { created: 1 } } as Message
    const target = { id: "message-fork", sessionID: sourceSession.id, role: "user", time: { created: 2 } } as Message
    const source = createStore({}, {
      session: [sourceSession],
      message: { [sourceSession.id]: [carrier, target] },
      part: { "message-fork": [textPart] },
    })
    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromMessage(sourceSession.id, "message-fork")

    expect(replyCalls.find((call) => call.method === "session.fork")?.params.messageID).toBe("message-ctx")
  })

  test("uses the returned project worktree when the fork has no directory", async () => {
    const forkWithProject: Session & { project: { worktree: string } } = {
      ...forkedSession, directory: "", project: { worktree: "/canonical/worktree" },
    }
    sessionForkResult = forkWithProject
    const source = createStore({}, { session: [sourceSession], part: { "message-fork": [textPart] } })
    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromMessage(sourceSession.id, "message-fork")

    expect(inputState.pendingComposerRestore?.target.directory).toBe("/canonical/worktree")
    expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: "/canonical/worktree" }])
  })

  test("stages a file-only prompt with empty text without replacing source attachments", async () => {
    const source = createStore({}, {
      session: [sourceSession],
      part: { "message-fork": [filePart] },
    })
    const sourceInput = { ...inputState }
    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromMessage(sourceSession.id, "message-fork")

    expect(inputState.pendingComposerRestore).toEqual({
      target: { runtimeKey: "fork-runtime", directory: sourceSession.directory, sessionId: forkedSession.id },
      text: "",
      files: [restoredFile],
    })
    expect(inputState.pendingInputText).toBe(sourceInput.pendingInputText)
    expect(inputState.attachedFiles).toBe(sourceInput.attachedFiles)
    expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: sourceSession.directory }])
  })

  test("leaves input, selection, and sessions unchanged when the fork fails", async () => {
    sessionForkError = new Error("fork failed")
    const source = createStore({}, {
      session: [sourceSession],
      part: { "message-fork": [textPart, filePart] },
    })
    const sourceState = source.getState()
    const sourceInput = { ...inputState }
    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await expect(forkFromMessage(sourceSession.id, "message-fork")).rejects.toThrow("fork failed")

    expect(inputState).toEqual(sourceInput)
    expect(inputState.attachedFiles).toBe(sourceInput.attachedFiles)
    expect(selectedSessions).toEqual([])
    expect(source.getState()).toBe(sourceState)
  })

  test("does not select, mutate, or stage a fork resolved after the runtime changes", async () => {
    beforeSessionForkResolve = () => { runtimeKey = "other-runtime" }
    const source = createStore({}, {
      session: [sourceSession],
      part: { "message-fork": [textPart, filePart] },
    })
    const sourceState = source.getState()
    const sourceInput = { ...inputState }
    const { forkFromMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromMessage(sourceSession.id, "message-fork")

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: "message-fork", directory: sourceSession.directory },
    }])
    expect(runtimeKey).toBe("other-runtime")
    expect(inputState).toEqual(sourceInput)
    expect(inputState.attachedFiles).toBe(sourceInput.attachedFiles)
    expect(selectedSessions).toEqual([])
    expect(source.getState()).toBe(sourceState)
  })
})

describe("forkAfterMessage", () => {
  const sourceSession: Session = {
    id: "session-a",
    projectID: "project-a",
    directory: "/test/project",
    title: "Source session",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
  const forkedSession: Session = { ...sourceSession, id: "session-fork", title: "Forked session" }
  // SAFETY: forkAfterMessage reads only id and role; the rest of the message shape is irrelevant here.
  const message = (id: string, role: "user" | "assistant" | "compaction") => ({ id, role, sessionID: sourceSession.id, time: { created: 1 } }) as Message
  const transcript = [
    message("msg-user-1", "user"),
    message("msg-answer-1", "assistant"),
    message("msg-user-2", "user"),
    message("msg-answer-2", "assistant"),
  ]

  beforeEach(() => {
    replyCalls.length = 0
    selectedSessions.length = 0
    runtimeKey = "fork-runtime"
    sessionForkResult = forkedSession
    sessionForkError = null
    beforeSessionForkResolve = null
    inputState.pendingComposerRestore = null
  })

  test("cuts before the next user message so the fork keeps the answer", async () => {
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkAfterMessage(sourceSession.id, "msg-answer-1")

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: "msg-user-2", directory: sourceSession.directory },
    }])
    expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: sourceSession.directory }])
    expect(source.getState().session).toEqual([sourceSession, forkedSession])
    expect(inputState.pendingComposerRestore).toBeNull()
  })

  for (const entrypoint of ["forkAfterMessage", "forkFromLastCompletedTurn"] as const) {
    test(`${entrypoint} retries a missing cut without copying a later turn`, async () => {
      const messages = [
        message("msg-user-1", "user"),
        { ...message("msg-answer-1", "assistant"), time: { created: 1, completed: 2 }, finish: "stop" },
        message("msg-user-2", "user"),
      ] as Message[]
      const source = createStore({}, {
        session: [sourceSession], message: { [sourceSession.id]: messages },
        session_status: { [sourceSession.id]: { type: "busy" } },
      })
      const actions = await import("./session-actions")
      actions.setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)
      sessionForkError = notFound("Message")
      let attempts = 0
      beforeSessionForkResolve = () => {
        attempts += 1
        if (attempts === 1) messages.push(message("msg-answer-2", "assistant"))
        else sessionForkError = null
      }

      if (entrypoint === "forkAfterMessage") await actions.forkAfterMessage(sourceSession.id, "msg-answer-1")
      else await actions.forkFromLastCompletedTurn(sourceSession.id)

      expect(replyCalls.filter((call) => call.method === "session.fork").map((call) => call.params.messageID))
        .toEqual(["msg-user-2", "msg-user-2"])
      expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: sourceSession.directory }])
    })

    test(`${entrypoint} leaves the source open after two 404s`, async () => {
      const messages = [
        message("msg-user-1", "user"),
        { ...message("msg-answer-1", "assistant"), time: { created: 1, completed: 2 }, finish: "stop" },
        message("msg-user-2", "user"),
      ] as Message[]
      const source = createStore({}, {
        session: [sourceSession], message: { [sourceSession.id]: messages },
        session_status: { [sourceSession.id]: { type: "busy" } },
      })
      const actions = await import("./session-actions")
      actions.setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)
      sessionForkError = notFound("Message")

      const result = entrypoint === "forkAfterMessage"
        ? actions.forkAfterMessage(sourceSession.id, "msg-answer-1")
        : actions.forkFromLastCompletedTurn(sourceSession.id)
      await expect(result).rejects.toThrow("MessageNotFoundError")
      expect(replyCalls.filter((call) => call.method === "session.fork").map((call) => call.params.messageID))
        .toEqual(["msg-user-2", "msg-user-2"])
      expect(selectedSessions).toEqual([])
      expect(source.getState().session).toEqual([sourceSession])
    })
  }

  test("does not retry the cut on another runtime", async () => {
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)
    sessionForkError = notFound("Message")
    beforeSessionForkResolve = () => { runtimeKey = "another-runtime" }

    await expect(forkAfterMessage(sourceSession.id, "msg-answer-1")).rejects.toThrow("runtime changed")
    expect(replyCalls.filter((call) => call.method === "session.fork")).toHaveLength(1)
    expect(selectedSessions).toEqual([])
  })

  test("leaves a compaction that followed the answer out of the fork", async () => {
    const compacted = [...transcript.slice(0, 2), message("msg-compaction", "compaction"), ...transcript.slice(2)]
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: compacted } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkAfterMessage(sourceSession.id, "msg-answer-1")

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: "msg-compaction", directory: sourceSession.directory },
    }])
  })

  test("leaves a workflow report that followed the answer out of the fork", async () => {
    const workflowReport: Message = {
      id: "msg-workflow-report",
      role: "synthetic",
      sessionID: sourceSession.id,
      time: { created: 1 },
      metadata: { source: "openchamber-workflow", runId: "run-1", name: "Review", state: "completed" },
      text: "<openchamber-workflow>\nreview done\n</openchamber-workflow>",
    }
    const messages = [...transcript.slice(0, 2), workflowReport, ...transcript.slice(2)]
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: messages } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkAfterMessage(sourceSession.id, "msg-answer-1")

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: workflowReport.id, directory: sourceSession.directory },
    }])
  })

  test("copies the whole transcript when the answer is the last message", async () => {
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkAfterMessage(sourceSession.id, "msg-answer-2")

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: undefined, directory: sourceSession.directory },
    }])
  })

  test("refuses to fork from a message that is not loaded", async () => {
    const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
    const { forkAfterMessage, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await expect(forkAfterMessage(sourceSession.id, "msg-missing")).rejects.toThrow("Fork source message is not loaded")
    expect(replyCalls).toEqual([])
    expect(selectedSessions).toEqual([])
  })

  for (const enabled of [false, true]) {
    for (const forkPoint of ["answer", "prompt"] as const) {
      test(`persists the source permission choice in VS Code (${enabled}, ${forkPoint})`, async () => {
        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
        const { usePermissionStore } = await import("@/stores/permissionStore")
        usePermissionStore.getState().reset()
        Object.defineProperty(globalThis, "window", { configurable: true, value: { __VSCODE_CONFIG__: {} } })
        permissionPolicy.clear()
        permissionPolicy.set(sourceSession.id, enabled)
        permissionPolicyRevision = 0
        sessionRecords.set(sourceSession.id, sourceSession)
        const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
        try {
          const { forkAfterMessage, forkFromMessage, setActionRefs } = await import("./session-actions")
          setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)
          if (forkPoint === "answer") await forkAfterMessage(sourceSession.id, "msg-answer-2")
          else await forkFromMessage(sourceSession.id, "msg-user-2")
          expect(permissionPolicy.get(forkedSession.id)).toBe(enabled)
          expect(usePermissionStore.getState().getSessionMode(forkedSession.id)).toBe(enabled ? "auto" : "ask")
        } finally {
          if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
          else Reflect.deleteProperty(globalThis, "window")
          usePermissionStore.getState().reset()
          sessionRecords.delete(sourceSession.id)
        }
      })
    }
  }

  for (const forkPoint of ["answer", "prompt"] as const) {
    for (const outcome of ["runtime-switch", "read-failure", "write-failure", "write-failure-after-switch"] as const) {
      test(`retains the VS Code fork and repairs metadata after ${outcome} (${forkPoint})`, async () => {
        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
        const { usePermissionStore } = await import("@/stores/permissionStore")
        usePermissionStore.getState().reset()
        Object.defineProperty(globalThis, "window", { configurable: true, value: { __VSCODE_CONFIG__: {} } })
        permissionPolicy.clear()
        permissionPolicy.set(sourceSession.id, true)
        permissionPolicyRevision = 0
        sessionRecords.set(sourceSession.id, sourceSession)
        const inheritedFork: Session = {
          ...forkedSession,
          metadata: { openchamber: {
            kind: "scheduled",
            btwSessionID: "source-btw",
            reviewSessionID: "source-review",
            goal: { id: "goal-1", objective: "fallback", objectiveFile: true, status: "active" },
          } },
        }
        sessionForkResult = inheritedFork
        sessionRecords.set(forkedSession.id, inheritedFork)
        goalObjectives.set(sourceSession.id, "fork objective")
        const repairedMetadata = { openchamber: {
          goal: { id: "goal-1", objective: "fallback", objectiveFile: true, status: "paused", statusReason: "paused in fork" },
        } }
        const previousArchiveResponse = archiveBatchResponse
        archiveBatchResponse = { status: 200, body: { metadata: repairedMetadata } }
        openchamberRouteRequests.length = 0
        beforeArchiveRouteResolve = (path) => {
          if (!path.startsWith("/api/permission-auto-accept")) return
          if (outcome === "runtime-switch") runtimeKey = "another-runtime"
          else if (outcome === "read-failure" || path.includes("/sessions/")) {
            if (outcome === "write-failure-after-switch") runtimeKey = "another-runtime"
            throw new Error("policy unavailable")
          }
        }
        const source = createStore({}, { session: [sourceSession], message: { [sourceSession.id]: transcript } })
        try {
          const { forkAfterMessage, forkFromMessage, setActionRefs } = await import("./session-actions")
          setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)
          if (forkPoint === "answer") {
            expect(await forkAfterMessage(sourceSession.id, "msg-answer-2")).toBe(inheritedFork)
          } else {
            await forkFromMessage(sourceSession.id, "msg-user-2")
          }
          expect(permissionPolicy.get(forkedSession.id)).toBeUndefined()
          expect(usePermissionStore.getState().getSessionMode(forkedSession.id)).toBe("ask")
          expect(selectedSessions).toEqual([{ sessionId: forkedSession.id, directoryHint: sourceSession.directory }])
          const metadataRequest = openchamberRouteRequests.find((entry) => entry.path.endsWith(`/${forkedSession.id}/metadata`))
          const objectiveRequests = openchamberRouteRequests.filter((entry) => entry.path.startsWith("/api/goals/objective/"))
          if (outcome === "runtime-switch" || outcome === "write-failure-after-switch") {
            expect(metadataRequest).toBeUndefined()
            expect(objectiveRequests).toEqual([])
            expect(source.getState().session).toEqual([sourceSession, inheritedFork])
          } else {
            expect(metadataRequest?.body).toEqual({ patch: { openchamber: {
              kind: null, btwSessionID: null, reviewSessionID: null,
              goal: { status: "paused", statusReason: "paused in fork" },
            } } })
            expect(objectiveRequests).toEqual([
              { path: `/api/goals/objective/${sourceSession.id}`, body: {} },
              { path: `/api/goals/objective/${forkedSession.id}`, body: { content: "fork objective" } },
            ])
            expect(goalObjectives.get(forkedSession.id)).toBe("fork objective")
            expect(source.getState().session[1]?.metadata).toEqual(repairedMetadata)
          }
        } finally {
          if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
          else Reflect.deleteProperty(globalThis, "window")
          beforeArchiveRouteResolve = null
          runtimeKey = "fork-runtime"
          usePermissionStore.getState().reset()
          sessionRecords.delete(sourceSession.id)
          sessionRecords.delete(forkedSession.id)
          archiveBatchResponse = previousArchiveResponse
          goalObjectives.clear()
        }
      })
    }
  }
})

describe("forkFromLastCompletedTurn", () => {
  const sourceSession: Session = {
    id: "session-a",
    projectID: "project-a",
    directory: "/test/project",
    title: "Source session",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
  // SAFETY: the turn lookup reads only id, role, time.completed, and finish.
  const message = (id: string, role: "user" | "assistant", completed?: number, finish?: "stop" | "tool-calls") =>
    ({ id, role, sessionID: sourceSession.id, finish, time: completed === undefined ? { created: 1 } : { created: 1, completed } }) as Message

  beforeEach(() => {
    replyCalls.length = 0
    selectedSessions.length = 0
    runtimeKey = "fork-runtime"
    sessionForkResult = { ...sourceSession, id: "session-fork" }
    sessionForkError = null
    beforeSessionForkResolve = null
  })

  test("skips a running turn, including its already completed steps", async () => {
    const transcript = [
      message("u1", "user"),
      message("a1", "assistant", 2),
      message("u2", "user"),
      message("a2-step", "assistant", 3),
      message("a2-live", "assistant"),
    ]
    const source = createStore({}, {
      session: [sourceSession],
      message: { [sourceSession.id]: transcript },
      session_status: { [sourceSession.id]: { type: "busy" } },
    })
    const { forkFromLastCompletedTurn, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromLastCompletedTurn(sourceSession.id)

    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: "u2", directory: sourceSession.directory },
    }])
  })

  test("copies the whole transcript when the session is idle", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [message("u1", "user"), message("a1", "assistant", 2)]
    expect(findLastCompletedTurnMessageId(transcript, false)).toBe("a1")
  })

  test("refuses when no turn has finished", async () => {
    const source = createStore({}, {
      session: [sourceSession],
      message: { [sourceSession.id]: [message("u1", "user"), message("a1", "assistant")] },
      session_status: { [sourceSession.id]: { type: "busy" } },
    })
    const { forkFromLastCompletedTurn, NothingToForkError, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await expect(forkFromLastCompletedTurn(sourceSession.id)).rejects.toThrow(NothingToForkError)
    expect(replyCalls).toEqual([])
    expect(selectedSessions).toEqual([])
  })

  // OpenCode 2 opens turns without a user prompt too; the lookup must not
  // treat those openers as part of the finished turn before them.
  // SAFETY: the boundary lookup reads only role, time, and metadata; this
  // fixture carries exactly the synthetic report fields readSubagentRun parses.
  const subagentReport = {
    id: "msg-subagent-report",
    role: "synthetic",
    sessionID: sourceSession.id,
    time: { created: 1 },
    metadata: { source: "subagent", childID: "child-1", state: "completed" },
    text: "<subagent>\nchild done\n</subagent>",
  } as Message
  // SAFETY: the boundary lookup reads only role and time; compaction is a
  // TURN_BOUNDARY_ROLES member, so no other Message field is dereferenced.
  const compactionOpener = {
    id: "msg-compaction-opener",
    role: "compaction",
    sessionID: sourceSession.id,
    time: { created: 1 },
  } as Message
  // SAFETY: the boundary lookup reads only role and time; shell is a
  // TURN_BOUNDARY_ROLES member, so no other Message field is dereferenced.
  const shellOpener = {
    id: "msg-shell-opener",
    role: "shell",
    sessionID: sourceSession.id,
    time: { created: 1 },
  } as Message
  const shellCompletion: Message = {
    id: "msg-shell-completion",
    role: "synthetic",
    sessionID: sourceSession.id,
    time: { created: 1 },
    metadata: { source: "shell", shellID: "shell-1", state: "completed" },
    text: "<shell>\ndone\n</shell>",
  }

  test("finds the finished reply when the running turn resumed from a background subagent", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [message("u1", "user"), message("a1", "assistant", 2), subagentReport, message("a-live", "assistant")]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("finds the finished reply when the running turn resumed from a background command", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [message("u1", "user"), message("a1", "assistant", 2), shellCompletion, message("a-live", "assistant")]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("finds the finished reply when the running turn was opened by a compaction", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [message("u1", "user"), message("a1", "assistant", 2), compactionOpener, message("a-live", "assistant")]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("finds the finished reply when the running turn was opened by a shell run", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [message("u1", "user"), message("a1", "assistant", 2), shellOpener, message("a-live", "assistant")]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  // OpenCode steers these into a turn that is still running: they arrive right
  // after a step that ended on tool calls, so they do not open a new turn.
  test("does not treat a report steered into the running turn as its opener", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [
      message("u1", "user"),
      message("a1", "assistant", 2, "stop"),
      message("u2", "user"),
      message("a2", "assistant", 3, "tool-calls"),
      subagentReport,
      message("a-live", "assistant"),
    ]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("does not treat a compaction inside the running turn as its opener", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [
      message("u1", "user"),
      message("a1", "assistant", 2, "stop"),
      message("u2", "user"),
      message("a2", "assistant", 3, "tool-calls"),
      compactionOpener,
      message("a-live", "assistant"),
    ]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("does not treat a prompt typed during the running turn as its opener", async () => {
    const { findLastCompletedTurnMessageId } = await import("./session-actions")
    const transcript = [
      message("u1", "user"),
      message("a1", "assistant", 2, "stop"),
      message("u2", "user"),
      message("a2", "assistant", 3, "tool-calls"),
      message("u3", "user"),
      message("a-live", "assistant"),
    ]
    expect(findLastCompletedTurnMessageId(transcript, true)).toBe("a1")
  })

  test("forks from the finished reply while a subagent-resumed turn streams", async () => {
    const transcript = [message("u1", "user"), message("a1", "assistant", 2), subagentReport, message("a-live", "assistant")]
    const source = createStore({}, {
      session: [sourceSession],
      message: { [sourceSession.id]: transcript },
      session_status: { [sourceSession.id]: { type: "busy" } },
    })
    const { forkFromLastCompletedTurn, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([[sourceSession.directory, source]]), () => sourceSession.directory)

    await forkFromLastCompletedTurn(sourceSession.id)

    // Cut at the subagent report: the finished reply is kept, the in-flight
    // turn after it is not copied into the fork.
    expect(replyCalls).toEqual([{
      method: "session.fork",
      params: { sessionID: sourceSession.id, messageID: "msg-subagent-report", directory: sourceSession.directory },
    }])
  })
})

describe("revertToMessage passes session directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    sessionMessageRecords.clear()
    sessionRecords.clear()
    failingRevertSessionIds.clear()
    lostStageResponseSessionIds.clear()
    sessionReadErrorOnce = null
    stageRevertGate = null
    stageRevertGates.clear()
    messageReadGate = null
    refreshGate = null
    refreshStarted = false
    sessionReadGate = null
    gatedSessionReadStarted = false
    commitRevertCalls = 0
    commitRevertGate = null
    Object.assign(inputState, {
      pendingInputText: "previous draft",
      pendingInputMode: "replace",
      pendingInputTarget: null,
      pendingSessionRestores: new Map(),
      attachedFiles: [],
    })
  })

  test("waits for the pending revert before sending a new prompt", async () => {
    const session = sessionFixture("session-a")
    sessionRecords.set(session.id, session)
    const message: Message = { id: "msg_2", sessionID: session.id, role: "user", time: { created: 2 } }
    const store = createStore({}, { session: [session], message: { [session.id]: [message] } })
    const { setActionRefs, setOptimisticRefs, revertToMessage, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    let releaseStage = () => {}
    stageRevertGate = new Promise<void>((resolve) => { releaseStage = resolve })

    const reverting = revertToMessage(session.id, message.id)
    while (!replyCalls.some((call) => call.method === "session.revert.stage")) await Promise.resolve()
    let sent = false
    const sending = optimisticSend({
      sessionId: session.id,
      directory: "/test/project",
      content: "new branch",
      send: async () => { sent = true },
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const sentBeforeStage = sent
    releaseStage()
    await Promise.all([reverting, sending])
    expect(sentBeforeStage).toBe(false)
    expect(sent).toBe(true)
  })

  test("waits before committing a revert for non-prompt input", async () => {
    const session = sessionFixture("session-a")
    sessionRecords.set(session.id, session)
    const message: Message = { id: "msg_2", sessionID: session.id, role: "user", time: { created: 2 } }
    const store = createStore({}, { session: [session], message: { [session.id]: [message] } })
    const { setActionRefs, revertToMessage, commitStagedRevert } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    let releaseStage = () => {}
    stageRevertGate = new Promise<void>((resolve) => { releaseStage = resolve })
    const reverting = revertToMessage(session.id, message.id)
    while (!replyCalls.some((call) => call.method === "session.revert.stage")) await Promise.resolve()
    let committed = false
    const committing = commitStagedRevert(session.id, "/test/project").then(() => { committed = true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const committedBeforeStage = committed
    releaseStage()
    await Promise.all([reverting, committing])
    expect(committedBeforeStage).toBe(false)
    expect(committed).toBe(true)
    expect(commitRevertCalls).toBe(1)
  })

  test("does not send when the pending revert fails", async () => {
    const session = sessionFixture("session-a")
    const message: Message = { id: "msg_2", sessionID: session.id, role: "user", time: { created: 2 } }
    const store = createStore({}, { session: [session], message: { [session.id]: [message] } })
    const { setActionRefs, setOptimisticRefs, revertToMessage, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    failingRevertSessionIds.add(session.id)
    let releaseStage = () => {}
    stageRevertGate = new Promise<void>((resolve) => { releaseStage = resolve })
    const reverting = revertToMessage(session.id, message.id)
    const revertResult = reverting.catch((error: Error) => error)
    while (!replyCalls.some((call) => call.method === "session.revert.stage")) await Promise.resolve()
    let sent = false
    const sending = optimisticSend({ sessionId: session.id, directory: "/test/project", content: "new branch", send: async () => { sent = true } })
    const sendResult = sending.catch((error: Error) => error)
    await new Promise((resolve) => setTimeout(resolve, 10))
    releaseStage()
    expect(await revertResult).toBeInstanceOf(Error)
    expect(await sendResult).toBeInstanceOf(Error)
    expect(sent).toBe(false)
  })

  test("waits for history refresh before sending", async () => {
    const session = sessionFixture("session-a")
    sessionRecords.set(session.id, session)
    const message: Message = { id: "msg_2", sessionID: session.id, role: "user", time: { created: 2 } }
    const store = createStore({}, { session: [session], message: { [session.id]: [message] } })
    const { setActionRefs, setOptimisticRefs, revertToMessage, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    let releaseRead = () => {}
    refreshGate = new Promise<void>((resolve) => { releaseRead = resolve })
    const reverting = revertToMessage(session.id, message.id, { refresh: true })
    while (!refreshStarted) await Promise.resolve()
    let sent = false
    const sending = optimisticSend({ sessionId: session.id, directory: "/test/project", content: "new branch", send: async () => { sent = true } })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const sentBeforeRefresh = sent
    releaseRead()
    await Promise.all([reverting, sending])
    expect(sentBeforeRefresh).toBe(false)
    expect(sent).toBe(true)
  })

  test("holds descendant input during a parent revert", async () => {
    const parent = sessionFixture("parent")
    const child: Session = { ...sessionFixture("child"), parentID: parent.id }
    sessionRecords.set(parent.id, parent)
    sessionRecords.set(child.id, child)
    const message: Message = { id: "msg_2", sessionID: parent.id, role: "user", time: { created: 2 } }
    const store = createStore({}, { session: [parent, child], message: { [parent.id]: [message] } })
    const { setActionRefs, setOptimisticRefs, revertToMessage, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    let releaseRead = () => {}
    messageReadGate = new Promise<void>((resolve) => { releaseRead = resolve })
    const reverting = revertToMessage(parent.id, message.id)
    while (!replyCalls.some((call) => call.method === "session.messages" && call.params.sessionID === child.id)) await Promise.resolve()
    let sent = false
    const sending = optimisticSend({ sessionId: child.id, directory: "/test/project", content: "child prompt", send: async () => { sent = true } })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const sentBeforeCascade = sent
    releaseRead()
    await Promise.all([reverting, sending])
    expect(sentBeforeCascade).toBe(false)
    expect(sent).toBe(true)
  })

  test("includes a child created during history refresh and holds its input", async () => {
    const parent = sessionFixture("parent")
    const child: Session = { ...sessionFixture("child"), parentID: parent.id }
    const parentMessage: Message = { id: "parent-message", sessionID: parent.id, role: "user", time: { created: 2 } }
    const childMessage: Message = { id: "child-message", sessionID: child.id, role: "user", time: { created: 3 } }
    sessionRecords.set(parent.id, parent)
    sessionRecords.set(child.id, child)
    sessionMessageRecords.set(child.id, [{ info: childMessage, parts: [] }])
    const store = createStore({}, { session: [parent], message: { [parent.id]: [parentMessage], [child.id]: [childMessage] } })
    const { setActionRefs, setOptimisticRefs, revertToMessage, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    let releaseRead = () => {}
    refreshGate = new Promise<void>((resolve) => { releaseRead = resolve })
    const reverting = revertToMessage(parent.id, parentMessage.id, { refresh: true })
    while (!refreshStarted) await Promise.resolve()
    store.setState({ session: [parent, child] })
    let sent = false
    const sending = optimisticSend({ sessionId: child.id, directory: "/test/project", content: "child prompt", send: async () => { sent = true } })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const sentBeforeRefresh = sent
    releaseRead()
    await Promise.all([reverting, sending])
    expect(sentBeforeRefresh).toBe(false)
    expect(replyCalls.some((call) => call.method === "session.revert.stage" && call.params.sessionID === child.id)).toBe(true)
    expect(sent).toBe(true)
  })

  test("waits for an issued revert after a runtime round trip", async () => {
    const session = sessionFixture("runtime-session")
    sessionRecords.set(session.id, session)
    const message: Message = { id: "msg_2", sessionID: session.id, role: "user", time: { created: 2 } }
    const store = createStore({}, { session: [session], message: { [session.id]: [message] } })
    const { setActionRefs, setOptimisticRefs, revertToMessage, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    let releaseStage = () => {}
    stageRevertGate = new Promise<void>((resolve) => { releaseStage = resolve })
    const reverting = revertToMessage(session.id, message.id).catch((error: Error) => error)
    while (!replyCalls.some((call) => call.method === "session.revert.stage")) await Promise.resolve()
    runtimeGeneration += 2
    inputState.setPendingSessionRestore(session.id, "newer draft")
    let sent = false
    const sending = optimisticSend({ sessionId: session.id, directory: "/test/project", content: "new runtime", send: async () => { sent = true } }).catch((error: Error) => error)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const sentBeforeOldStage = sent
    releaseStage()
    expect(await reverting).toBeInstanceOf(Error)
    expect(await sending).toBeInstanceOf(Error)
    expect(sentBeforeOldStage).toBe(false)
    expect(sent).toBe(false)
    expect(store.getState().session[0].revert?.messageID).toBe(message.id)
    expect(inputState.pendingSessionRestores.get(session.id)).toBe("newer draft")
  })

  test("does not apply a stale reconciliation over a newer revert", async () => {
    const session = sessionFixture("reconcile-session")
    sessionRecords.set(session.id, session)
    const first: Message = { id: "msg_1", sessionID: session.id, role: "user", time: { created: 1 } }
    const second: Message = { id: "msg_2", sessionID: session.id, role: "user", time: { created: 2 } }
    const store = createStore({}, { session: [session], message: { [session.id]: [first, second] } })
    const { setActionRefs, setOptimisticRefs, revertToMessage, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    let releaseStage = () => {}
    stageRevertGate = new Promise<void>((resolve) => { releaseStage = resolve })
    const stale = revertToMessage(session.id, first.id).catch((error: Error) => error)
    while (!replyCalls.some((call) => call.method === "session.revert.stage")) await Promise.resolve()
    runtimeGeneration += 2
    let releaseRead = () => {}
    sessionReadGate = new Promise<void>((resolve) => { releaseRead = resolve })
    let sent = false
    const sending = optimisticSend({ sessionId: session.id, directory: "/test/project", content: "new prompt", send: async () => { sent = true } }).catch((error: Error) => error)
    releaseStage()
    await stale
    while (!gatedSessionReadStarted) await Promise.resolve()
    const newer = revertToMessage(session.id, second.id)
    await newer
    releaseRead()
    expect(await sending).toBeInstanceOf(Error)
    expect(sent).toBe(false)
    expect(store.getState().session[0].revert?.messageID).toBe(second.id)
  })

  test("does not restore a cleared revert from an older reconciliation read", async () => {
    const session = sessionFixture("clear-session")
    sessionRecords.set(session.id, session)
    const message: Message = { id: "msg_1", sessionID: session.id, role: "user", time: { created: 1 } }
    const store = createStore({}, { session: [session], message: { [session.id]: [message] } })
    const { setActionRefs, setOptimisticRefs, revertToMessage, clearStagedRevert, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    let releaseStage = () => {}
    stageRevertGate = new Promise<void>((resolve) => { releaseStage = resolve })
    const stale = revertToMessage(session.id, message.id).catch((error: Error) => error)
    while (!replyCalls.some((call) => call.method === "session.revert.stage")) await Promise.resolve()
    runtimeGeneration += 2
    let releaseRead = () => {}
    sessionReadGate = new Promise<void>((resolve) => { releaseRead = resolve })
    const sending = optimisticSend({ sessionId: session.id, directory: "/test/project", content: "new prompt", send: async () => {} }).catch((error: Error) => error)
    releaseStage()
    await stale
    while (!gatedSessionReadStarted) await Promise.resolve()
    await clearStagedRevert(session.id)
    releaseRead()
    expect(await sending).toBeInstanceOf(Error)
    expect(store.getState().session[0].revert).toBeUndefined()
  })

  test("reconciles and commits a stage whose response was lost before admitting non-prompt input", async () => {
    const session = sessionFixture("lost-stage")
    sessionRecords.set(session.id, session)
    const message: Message = { id: "msg_1", sessionID: session.id, role: "user", time: { created: 1 } }
    const store = createStore({}, { session: [session], message: { [session.id]: [message] } })
    const { setActionRefs, revertToMessage, commitStagedRevert } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    lostStageResponseSessionIds.add(session.id)

    expect(await revertToMessage(session.id, message.id).catch((error: Error) => error)).toBeInstanceOf(Error)
    // The rollback hides the marker the server now holds.
    expect(store.getState().session[0].revert).toBeUndefined()
    expect(sessionRecords.get(session.id)?.revert?.messageID).toBe(message.id)

    await commitStagedRevert(session.id, "/test/project")
    expect(replyCalls.filter((call) => call.method === "session.get" && call.params.sessionID === session.id)).toHaveLength(1)
    expect(store.getState().session[0].revert?.messageID).toBe(message.id)
    expect(commitRevertCalls).toBe(1)
  })

  test("keeps input blocked and the reconciliation pending when the read after a lost stage fails", async () => {
    const session = sessionFixture("lost-stage-read")
    sessionRecords.set(session.id, session)
    const message: Message = { id: "msg_1", sessionID: session.id, role: "user", time: { created: 1 } }
    const store = createStore({}, { session: [session], message: { [session.id]: [message] } })
    const { setActionRefs, revertToMessage, commitStagedRevert } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    lostStageResponseSessionIds.add(session.id)
    await revertToMessage(session.id, message.id).catch(() => undefined)

    sessionReadErrorOnce = new Error("session.get: network error")
    expect(await commitStagedRevert(session.id, "/test/project").catch((error: Error) => error)).toBeInstanceOf(Error)
    expect(commitRevertCalls).toBe(0)
    expect(store.getState().session[0].revert).toBeUndefined()

    await commitStagedRevert(session.id, "/test/project")
    expect(store.getState().session[0].revert?.messageID).toBe(message.id)
    expect(commitRevertCalls).toBe(1)
  })

  test("shares an in-flight reconciliation read between concurrent sends", async () => {
    const session = sessionFixture("shared-read")
    sessionRecords.set(session.id, session)
    const message: Message = { id: "msg_1", sessionID: session.id, role: "user", time: { created: 1 } }
    const store = createStore({}, { session: [session], message: { [session.id]: [message] } })
    const { setActionRefs, setOptimisticRefs, revertToMessage, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    let releaseStage = () => {}
    stageRevertGate = new Promise<void>((resolve) => { releaseStage = resolve })
    const stale = revertToMessage(session.id, message.id).catch((error: Error) => error)
    while (!replyCalls.some((call) => call.method === "session.revert.stage")) await Promise.resolve()
    runtimeGeneration += 2
    let releaseRead = () => {}
    sessionReadGate = new Promise<void>((resolve) => { releaseRead = resolve })
    const send = () => optimisticSend({ sessionId: session.id, directory: "/test/project", content: "new prompt", send: async () => {} }).catch((error: Error) => error)
    const first = send()
    releaseStage()
    await stale
    while (!gatedSessionReadStarted) await Promise.resolve()
    const second = send()
    await new Promise((resolve) => setTimeout(resolve, 10))
    const readsBeforeRelease = replyCalls.filter((call) => call.method === "session.get").length
    releaseRead()
    await Promise.all([first, second])
    expect(readsBeforeRelease).toBe(1)
  })

  test("a parent commit does not wait for a child's independent revert", async () => {
    const parent: Session = { ...sessionFixture("parent"), revert: { messageID: "parent-message" } }
    // A failed stage leaves its session for the next input to reconcile, so
    // this child keeps an id of its own.
    const child: Session = { ...sessionFixture("independent-child"), parentID: parent.id }
    const message: Message = { id: "child-message", sessionID: child.id, role: "user", time: { created: 2 } }
    sessionRecords.set(child.id, child)
    const store = createStore({}, { session: [parent, child], message: { [child.id]: [message] } })
    const { setActionRefs, revertToMessage, commitSessionRevert } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    let releaseChild = () => {}
    stageRevertGate = new Promise<void>((resolve) => { releaseChild = resolve })
    failingRevertSessionIds.add(child.id)
    const reverting = revertToMessage(child.id, message.id).catch((error: Error) => error)
    while (!replyCalls.some((call) => call.method === "session.revert.stage")) await Promise.resolve()
    let committed = false
    const committing = commitSessionRevert(parent.id, "/test/project").then(() => { committed = true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const committedBeforeChild = committed
    releaseChild()
    await Promise.all([reverting, committing])
    expect(committedBeforeChild).toBe(true)
    expect(commitRevertCalls).toBe(1)
  })

  test("a parent-only commit does not hold a child's input", async () => {
    const parent = sessionFixture("parent")
    const child: Session = { ...sessionFixture("child"), parentID: parent.id }
    const store = createStore({}, { session: [parent, child] })
    const { setActionRefs, setOptimisticRefs, commitSessionRevert, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    let releaseCommit = () => {}
    commitRevertGate = new Promise<void>((resolve) => { releaseCommit = resolve })
    const committing = commitSessionRevert(parent.id, "/test/project")
    while (commitRevertCalls === 0) await Promise.resolve()
    let sent = false
    const sending = optimisticSend({ sessionId: child.id, directory: "/test/project", content: "child prompt", send: async () => { sent = true } })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const sentBeforeCommit = sent
    releaseCommit()
    await Promise.all([committing, sending])
    expect(sentBeforeCommit).toBe(true)
  })

  test("keeps sibling input waiting until every earlier revert settles", async () => {
    const parent = sessionFixture("parent")
    const a: Session = { ...sessionFixture("a"), parentID: parent.id }
    const b: Session = { ...sessionFixture("b"), parentID: parent.id }
    const message = (id: string): Message => ({ id: `msg-${id}`, sessionID: id, role: "user", time: { created: 2 } })
    for (const session of [parent, a, b]) sessionRecords.set(session.id, session)
    const store = createStore({}, { session: [parent, a, b], message: { parent: [message("parent")], a: [message("a")], b: [message("b")] } })
    const { setActionRefs, setOptimisticRefs, revertToMessage, optimisticSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    setOptimisticRefs(() => {}, () => {})
    let releaseA = () => {}
    let releaseB = () => {}
    stageRevertGates.set("a", new Promise<void>((resolve) => { releaseA = resolve }))
    stageRevertGates.set("b", new Promise<void>((resolve) => { releaseB = resolve }))
    failingRevertSessionIds.add("a")
    const first = revertToMessage("a", "msg-a").catch((error: Error) => error)
    const second = revertToMessage("b", "msg-b")
    while (replyCalls.filter((call) => call.method === "session.revert.stage").length < 2) await Promise.resolve()
    const parentRevert = revertToMessage("parent", "msg-parent").catch((error: Error) => error)
    releaseA()
    expect(await first).toBeInstanceOf(Error)
    await new Promise((resolve) => setTimeout(resolve, 10))
    let sent = false
    const sending = optimisticSend({ sessionId: "b", directory: "/test/project", content: "child prompt", send: async () => { sent = true } }).catch((error: Error) => error)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const sentBeforeB = sent
    releaseB()
    await second
    expect(await parentRevert).toBeInstanceOf(Error)
    expect(await sending).toBeInstanceOf(Error)
    expect(sentBeforeB).toBe(false)
    expect(sent).toBe(false)
  })

  test("routes revert through the session directory instead of the current directory", async () => {
    const session = sessionFixture("session-a")
    sessionRecords.set(session.id, session)
    const targetMessage = { id: "msg_2", sessionID: "session-a", role: "user", time: { created: 2 } } as Message
    const targetPart = { id: "prt_2", messageID: "msg_2", type: "text", text: "edit this" } as Part
    const sessionStore = createStore({}, {
      session: [session],
      message: { "session-a": [targetMessage] },
      part: { "msg_2": [targetPart] },
    })
    const currentStore = createStore({})
    const childStores = createChildStores([
      ["/test/project", sessionStore],
      ["/current/project", currentStore],
    ])
    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(childStores, () => "/current/project")

    await revertToMessage("session-a", "msg_2")

    expect(replyCalls.find((call) => call.method === "session.revert.stage")?.params.directory).toBe("/test/project")
    expect((sessionStore.getState().session[0] as Session & { revert?: { messageID?: string } }).revert?.messageID).toBe("msg_2")
    expect(currentStore.getState().session).toHaveLength(0)
    expect(inputState.pendingSessionRestores.get("session-a")).toBe("edit this")
    // The reverted message's session, not whatever address was left behind.
    expect(inputState.pendingInputText).toBe("previous draft")
    expect(inputState.pendingInputTarget).toBeNull()
  })

  test("cuts the transcript at the message's context carriers so they leave with it", async () => {
    const session = sessionFixture("session-a")
    sessionRecords.set(session.id, session)
    const earlier = { id: "msg_1", sessionID: "session-a", role: "user", time: { created: 1 } } as Message
    const firstCarrier = { id: "msg_ctx_1", sessionID: "session-a", role: "synthetic", time: { created: 2 }, text: "quoted selection" } as Message
    const secondCarrier = { id: "msg_ctx_2", sessionID: "session-a", role: "synthetic", time: { created: 3 }, text: "review comment" } as Message
    const targetMessage = { id: "msg_2", sessionID: "session-a", role: "user", time: { created: 4 } } as Message
    const sessionStore = createStore({}, {
      session: [session],
      message: { "session-a": [earlier, firstCarrier, secondCarrier, targetMessage] },
      part: { "msg_2": [{ id: "prt_2", messageID: "msg_2", type: "text", text: "edit this" } as Part] },
    })
    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", sessionStore]]), () => "/test/project")
    openchamberRouteRequests.length = 0

    await revertToMessage("session-a", "msg_2")

    expect(replyCalls.find((call) => call.method === "session.revert.stage")?.params.messageID).toBe("msg_ctx_1")
    expect((sessionStore.getState().session[0] as Session & { revert?: { messageID?: string } }).revert?.messageID).toBe("msg_ctx_1")
    expect(inputState.pendingSessionRestores.get("session-a")).toBe("edit this")
  })

  test("rolls back optimistic revert when the SDK returns an error", async () => {
    const session = sessionFixture("session-a")
    const targetMessage = { id: "msg_2", sessionID: "session-a", role: "user", time: { created: 2 } } as Message
    const targetPart = { id: "prt_2", messageID: "msg_2", type: "text", text: "edit this" } as Part
    const sessionStore = createStore({}, {
      session: [session],
      message: { "session-a": [targetMessage] },
      part: { "msg_2": [targetPart] },
    })
    const childStores = createChildStores([["/test/project", sessionStore]])
    failingRevertSessionIds.add("session-a")
    inputState.setPendingSessionRestore("session-a", "earlier restore")
    inputState.setPendingSessionRestore("session-other", "other restore")

    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    let thrown: unknown
    try {
      await revertToMessage("session-a", "msg_2")
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain("session.revert.stage failed (500)")
    expect((sessionStore.getState().session[0] as Session & { revert?: { messageID?: string } }).revert).toBe(undefined)
    expect(inputState.pendingInputText).toBe("previous draft")
    expect(inputState.pendingSessionRestores.get("session-a")).toBe("earlier restore")
    expect(inputState.pendingSessionRestores.get("session-other")).toBe("other restore")
  })

  test("reverts recursive descendants at their first user message on or after the parent cutoff", async () => {
    const rootMessage = { id: "root-cutoff", sessionID: "root", role: "user", time: { created: 20 } } as Message
    const sessions = [
      { ...sessionFixture("root"), directory: "/tree", time: { created: 1, updated: 1 } },
      { ...sessionFixture("child"), parentID: "root", directory: "/tree", time: { created: 2, updated: 2 } },
      { ...sessionFixture("grandchild"), parentID: "child", directory: "/tree", time: { created: 3, updated: 3 } },
      { ...sessionFixture("old-child"), parentID: "root", directory: "/tree", time: { created: 4, updated: 4 } },
    ] as Session[]
    const store = createStore({}, { session: sessions, message: { root: [rootMessage] } })
    sessionMessageRecords.set("child", [
      { info: { id: "child-before", sessionID: "child", role: "user", time: { created: 10 } } as Message, parts: [] },
      { info: { id: "child-boundary", sessionID: "child", role: "user", time: { created: 20 } } as Message, parts: [] },
      { info: { id: "child-later", sessionID: "child", role: "user", time: { created: 30 } } as Message, parts: [] },
    ])
    sessionMessageRecords.set("grandchild", [
      { info: { id: "grandchild-assistant", sessionID: "grandchild", role: "assistant", time: { created: 20 } } as Message, parts: [] },
      { info: { id: "grandchild-user", sessionID: "grandchild", role: "user", time: { created: 21 } } as Message, parts: [] },
    ])
    sessionMessageRecords.set("old-child", [
      { info: { id: "old-child-user", sessionID: "old-child", role: "user", time: { created: 19 } } as Message, parts: [] },
    ])

    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(createChildStores([["/tree", store]]), () => "/tree")

    await revertToMessage("root", "root-cutoff")

    expect(replyCalls.filter((call) => call.method === "session.revert.stage").map((call) => [
      call.params.sessionID,
      call.params.messageID,
    ])).toEqual([
      ["child", "child-boundary"],
      ["grandchild", "grandchild-user"],
      ["root", "root-cutoff"],
    ])
  })

  test("reverting a subagent run report reverts its child from the start and leaves the composer alone", async () => {
    const earlier = { id: "root-context", sessionID: "root", role: "synthetic", time: { created: 5 }, text: "ctx" } as Message
    const report = {
      id: "root-report",
      sessionID: "root",
      role: "synthetic",
      time: { created: 40 },
      text: "done",
      metadata: { source: "subagent", childID: "child", state: "completed" },
    } as Message
    const sessions = [
      { ...sessionFixture("root"), directory: "/tree", time: { created: 1, updated: 1 } },
      { ...sessionFixture("child"), parentID: "root", directory: "/tree", time: { created: 10, updated: 10 } },
    ] as Session[]
    const store = createStore({}, { session: sessions, message: { root: [earlier, report] } })
    sessionMessageRecords.set("child", [
      { info: { id: "child-prompt", sessionID: "child", role: "user", time: { created: 11 } } as Message, parts: [] },
    ])
    inputState.pendingInputText = "still typing"

    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(createChildStores([["/tree", store]]), () => "/tree")

    await revertToMessage("root", "root-report")

    expect(replyCalls.filter((call) => call.method === "session.revert.stage").map((call) => [
      call.params.sessionID,
      call.params.messageID,
    ])).toEqual([
      ["child", "child-prompt"],
      ["root", "root-report"],
    ])
    expect(inputState.pendingInputText).toBe("still typing")
  })

  test("continues reverting other descendants and the parent when one child fails", async () => {
    const rootMessage = { id: "root-cutoff", sessionID: "root", role: "user", time: { created: 20 } } as Message
    const sessions = [
      { ...sessionFixture("root"), directory: "/tree", time: { created: 1, updated: 1 } },
      { ...sessionFixture("failing-child"), parentID: "root", directory: "/tree", time: { created: 2, updated: 2 } },
      { ...sessionFixture("healthy-child"), parentID: "root", directory: "/tree", time: { created: 3, updated: 3 } },
    ] as Session[]
    const store = createStore({}, { session: sessions, message: { root: [rootMessage] } })
    for (const id of ["failing-child", "healthy-child"]) {
      sessionMessageRecords.set(id, [{
        info: { id: `${id}-target`, sessionID: id, role: "user", time: { created: 20 } } as Message,
        parts: [],
      }])
    }
    failingRevertSessionIds.add("failing-child")

    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(createChildStores([["/tree", store]]), () => "/tree")

    await revertToMessage("root", "root-cutoff")

    expect(replyCalls.filter((call) => call.method === "session.revert.stage").map((call) => call.params.sessionID)).toEqual([
      "failing-child",
      "healthy-child",
      "root",
    ])
  })

  test("aborts a busy descendant before reverting it", async () => {
    const rootMessage = { id: "root-cutoff", sessionID: "root", role: "user", time: { created: 20 } } as Message
    const sessions = [
      { ...sessionFixture("root"), directory: "/tree", time: { created: 1, updated: 1 } },
      { ...sessionFixture("busy-child"), parentID: "root", directory: "/tree", time: { created: 2, updated: 2 } },
      { ...sessionFixture("idle-child"), parentID: "root", directory: "/tree", time: { created: 3, updated: 3 } },
    ] as Session[]
    const store = createStore({}, {
      session: sessions,
      message: { root: [rootMessage] },
      session_status: { "busy-child": { type: "busy" }, "idle-child": { type: "idle" } },
    })
    for (const id of ["busy-child", "idle-child"]) {
      sessionMessageRecords.set(id, [{
        info: { id: `${id}-target`, sessionID: id, role: "user", time: { created: 20 } } as Message,
        parts: [],
      }])
    }

    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(createChildStores([["/tree", store]]), () => "/tree")

    await revertToMessage("root", "root-cutoff")

    expect(replyCalls.filter((call) => call.method === "session.abort").map((call) => call.params.sessionID))
      .toEqual(["busy-child"])
    const busyAbortIndex = replyCalls.findIndex((call) => call.method === "session.abort")
    const busyRevertIndex = replyCalls.findIndex(
      (call) => call.method === "session.revert.stage" && call.params.sessionID === "busy-child",
    )
    expect(busyAbortIndex).toBeLessThan(busyRevertIndex)
    expect(replyCalls.filter((call) => call.method === "session.revert.stage").map((call) => call.params.sessionID)).toEqual([
      "busy-child",
      "idle-child",
      "root",
    ])
  })
})

describe("revertToMessage paged message lookup", () => {
  beforeEach(() => {
    replyCalls.length = 0
    sessionMessageRecords.clear()
    sessionRecords.clear()
    failingRevertSessionIds.clear()
    cursorMessagePages = null
    Object.assign(inputState, {
      pendingInputText: "",
      pendingInputMode: "replace",
      attachedFiles: [],
    })
  })

  test("stages the revert when the target message is only on a later page", async () => {
    const session = sessionFixture("session-a")
    sessionRecords.set(session.id, session)
    const newer: Message = { id: "msg_newer", sessionID: "session-a", role: "user", time: { created: 3 } }
    const older: Message = { id: "msg_old", sessionID: "session-a", role: "user", time: { created: 1 } }
    const sessionStore = createStore({}, {
      session: [session],
      message: { "session-a": [newer] },
      part: {},
    })
    const currentStore = createStore({})
    const childStores = createChildStores([
      ["/test/project", sessionStore],
      ["/current/project", currentStore],
    ])
    // The local store holds only the newest page; the target sits behind a cursor.
    cursorMessagePages = [
      { items: [{ info: newer, parts: [] }], cursor: { next: "1" } },
      { items: [{ info: older, parts: [] }], cursor: {} },
    ]
    const { setActionRefs, revertToMessage } = await import("./session-actions")
    setActionRefs(childStores, () => "/current/project")

    await revertToMessage("session-a", "msg_old")

    expect(replyCalls.find((call) => call.method === "session.revert.stage")?.params.messageID).toBe("msg_old")
    expect(sessionStore.getState().session[0]?.revert?.messageID).toBe("msg_old")
    expect(replyCalls.filter((call) => call.method === "session.messages")).toHaveLength(2)
  })
})

describe("dismissPermission passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
    permissionReplyError = null
  })

  test("passes directory and reply=reject", async () => {
    const permission: PermissionRequest = {
      id: "perm-10",
      sessionID: "session-a",
      action: "edit",
      resources: [],
      metadata: {},
    }

    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await dismissPermission("session-a", "perm-10")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.requestID).toBe("perm-10")
    expect(replyCalls[0].params.reply).toBe("reject")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })

  test("a failed record read rejects nothing and keeps the permission pending (#6555)", async () => {
    const permission = buildPermission("perm-unread", "session-unread")
    const store = createStore({ "session-unread": [permission] })
    fetchedSessionRecords.clear()

    const { setActionRefs, dismissPermission } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    await expect(dismissPermission("session-unread", "perm-unread")).rejects.toThrow()

    expect(replyCalls.filter((call) => call.method === "permission.reply")).toHaveLength(0)
    expect(store.getState().permission["session-unread"]).toEqual([permission])
  })
})

describe("replyToForm passes directory", () => {
  // Seeded here so each test stands alone: the reply needs the form session's record.
  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
    sessionRecords.clear()
    fetchedSessionRecords.clear()
    sessionRecords.set("session-a", sessionFixture("session-a"))
  })
  afterEach(() => {
    sessionRecords.clear()
  })

  test("passes directory to form.reply", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await replyToForm("session-a", "q-1", { choice: true })

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.formID).toBe("q-1")
    expect(replyCalls[0].params.directory).toBe("/test/project")
    expect(replyCalls.filter((call) => call.method.endsWith(".reply") || call.method === "form.cancel").map((call) => call.params.directory)).toEqual(["/test/project"])
  })

  test("removes stale form from child store when reply returns not found", async () => {
    const form = buildForm("q-stale", "session-a")
    const store = createStore({}, { form: { "session-a": [form] } })
    const childStores = createChildStores([["/test/project", store]])
    formReplyError = Object.assign(new Error("form.reply failed (404): FormNotFoundError"), { status: 404 })

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    let thrown: unknown
    try {
      await replyToForm("session-a", "q-stale", { choice: true })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(store.getState().form["session-a"]).toBe(undefined)
  })
})

describe("cancelForm passes directory", () => {
  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
    formCancelError = null
    sessionRecords.clear()
    fetchedSessionRecords.clear()
  })
  afterEach(() => {
    sessionRecords.clear()
    fetchedSessionRecords.clear()
  })

  test("passes directory to form.cancel", async () => {
    const childStores = createChildStores([])

    const { setActionRefs, cancelForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    sessionRecords.set("session-a", sessionFixture("session-a"))
    await cancelForm("session-a", "q-2")

    expect(replyCalls.length).toBe(1)
    expect(replyCalls[0].params.formID).toBe("q-2")
    expect(replyCalls[0].params.directory).toBe("/test/project")
  })

  test("a worktree form whose record no store holds is cancelled on the record's own directory (#6555)", async () => {
    const form = buildForm("q-wt", "session-wt")
    const store = createStore({}, { form: { "session-wt": [form] } })
    fetchedSessionRecords.set("session-wt", { ...sessionFixture("session-wt"), directory: "/test/project/wt" })

    const { setActionRefs, cancelForm } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    await cancelForm("session-wt", "q-wt")

    expect(replyCalls.filter((call) => call.method === "form.cancel").map((call) => call.params.directory)).toEqual(["/test/project/wt"])
    expect(store.getState().form["session-wt"]).toBe(undefined)
  })

  test("a failed record read cancels nothing and keeps the form pending (#6555)", async () => {
    const form = buildForm("q-unread", "session-unread")
    const store = createStore({}, { form: { "session-unread": [form] } })

    const { setActionRefs, cancelForm } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    let thrown: unknown
    try {
      await cancelForm("session-unread", "q-unread")
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(isFormRequestNotFoundError(thrown)).toBe(false)
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
    expect(store.getState().form["session-unread"]).toEqual([form])
  })
})

describe("replyToForm applies the composer selection", () => {
  const OTHER_MODEL = { providerID: "openai", id: "gpt-6" }
  const SESSION_MODEL = { providerID: "anthropic", id: "claude-3" }
  const seedSession = (id: string, overrides: Partial<Session> = {}) => {
    const record: Session = { ...sessionFixture(id), model: SESSION_MODEL, agent: "build", ...overrides }
    sessionRecords.set(id, record)
    // SAFETY: the selection helpers read only the session slice of the state.
    directoryStateOverride = () => ({ session: [record] }) as State
    return record
  }
  const replyInMainChat = async (sessionId = "session-a", answer: Record<string, boolean> = { choice: true }) => {
    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(createChildStores([]), () => "/test/project")
    return replyToForm(sessionId, "q-1", answer)
  }
  const replyMethods = () => replyCalls.map((call) => call.method).filter((method) => method !== "session.get")
  const reset = () => {
    replyCalls.length = 0
    formReplyError = null
    selectionApplyError = null
    agentUnavailableForSelection = false
    selectionApplyGate = null
    directoryStateOverride = null
    configState = { currentProviderId: "", currentModelId: "" }
    listedAgents = []
    mainSessionId = null
    selectionPicks.models.clear()
    selectionPicks.agents.clear()
    selectionPicks.efforts.clear()
    selectionPicks.switched = false
    selectionPicks.settled.length = 0
    sessionRecords.clear()
    fetchedSessionRecords.clear()
    globalActiveSessions = []
    globalArchivedSessions.length = 0
  }

  beforeEach(reset)
  afterEach(reset)

  test("switches the main chat's session to the composer's selection before the answer", async () => {
    mainSessionId = "session-a"
    seedSession("session-a")
    selectionPicks.agents.set("session-a", "plan")
    configState = { currentProviderId: "openai", currentModelId: "gpt-6", currentVariant: "high", currentAgentName: "build" }

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
      model: { ...OTHER_MODEL, variant: "high" },
      agent: "plan",
    })
    expect(selectionPicks.settled).toEqual(["session-a:openai/gpt-6"])
  })

  test("an explicit Default takes the session off its effort", async () => {
    mainSessionId = "session-a"
    seedSession("session-a", { model: { ...SESSION_MODEL, variant: "high" } })
    configState = { currentProviderId: "anthropic", currentModelId: "claude-3", currentVariant: "high", variantOverride: null, currentAgentName: "build" }
    listedAgents = ["build"]

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({ model: SESSION_MODEL })
  })

  test("a failed switch leaves the answer unsent and the pick in place", async () => {
    mainSessionId = "session-a"
    seedSession("session-a")
    configState = { currentProviderId: "openai", currentModelId: "gpt-6" }
    selectionApplyError = new Error("model switch failed")

    await expect(replyInMainChat()).rejects.toThrow("model switch failed")

    expect(replyMethods()).toEqual([])
    expect(selectionPicks.settled).toEqual([])
  })

  test("a failed session read still sends a model-only answer, with the picked model stated explicitly", async () => {
    mainSessionId = "session-a"
    seedSession("session-a")
    // The server read fails; the cache alone already matches the pick.
    sessionRecords.clear()
    configState = { currentProviderId: "anthropic", currentModelId: "claude-3" }

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({ model: SESSION_MODEL })
  })

  test("a changed agent the folder lacks leaves the form pending, and the error names it", async () => {
    mainSessionId = "session-a"
    seedSession("session-a", { agent: "plan" })
    configState = { currentProviderId: "anthropic", currentModelId: "claude-3", currentAgentName: "build" }
    agentUnavailableForSelection = true

    const error = await replyInMainChat().then(() => null, (caught: Error) => caught)

    expect(agentUnavailableFrom(error)).toBe("build")
    expect(replyMethods()).toEqual([])
  })

  test("an unchanged agent the folder's catalog lacks is still checked", async () => {
    mainSessionId = "session-a"
    seedSession("session-a")
    configState = { currentProviderId: "anthropic", currentModelId: "claude-3", currentAgentName: "build" }
    agentUnavailableForSelection = true

    const error = await replyInMainChat().then(() => null, (caught: Error) => caught)

    expect(agentUnavailableFrom(error)).toBe("build")
    expect(replyMethods()).toEqual([])
  })

  test("an unchanged selection switches nothing", async () => {
    mainSessionId = "session-a"
    seedSession("session-a")
    listedAgents = ["build"]
    configState = { currentProviderId: "anthropic", currentModelId: "claude-3", currentAgentName: "build" }

    await replyInMainChat()

    expect(replyMethods()).toEqual(["form.reply"])
  })

  test("a composer whose catalog has not loaded switches nothing", async () => {
    mainSessionId = "session-a"
    seedSession("session-a")

    await replyInMainChat()

    expect(replyMethods()).toEqual(["form.reply"])
  })

  test("Auto reaches the session as the sentinel before the answer", async () => {
    // The sentinel marks the session; the server then routes the reply to the
    // concrete model before forwarding it (routing/routes.http.test.js).
    mainSessionId = "session-a"
    seedSession("session-a")
    listedAgents = ["build"]
    configState = { currentProviderId: "openchamber", currentModelId: "auto", currentAgentName: "build" }

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
      model: { providerID: "openchamber", id: "auto" },
    })
  })

  for (const surface of ["a pinned chat", "a /btw fork"]) {
    test(`${surface} replies with its own picks, never the main chat's`, async () => {
      mainSessionId = "session-main"
      configState = { currentProviderId: "google", currentModelId: "gemini", currentVariant: "max", currentAgentName: "review" }
      seedSession("session-a")
      selectionPicks.models.set("session-a", { providerId: "openai", modelId: "gpt-6" })
      selectionPicks.agents.set("session-a", "plan")
      selectionPicks.efforts.set("session-a/plan/openai/gpt-6", "low")

      await replyInMainChat()

      expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
        model: { ...OTHER_MODEL, variant: "low" },
        agent: "plan",
      })
    })
  }

  test("an effort-only change in a pinned chat keeps the session's model and agent", async () => {
    mainSessionId = "session-main"
    configState = { currentProviderId: "google", currentModelId: "gemini", currentAgentName: "review" }
    seedSession("session-a", { model: { ...SESSION_MODEL, variant: "low" } })
    selectionPicks.efforts.set("session-a/build/anthropic/claude-3", "high")

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
      model: { ...SESSION_MODEL, variant: "high" },
    })
  })

  test("a child session answered from its parent keeps what it is bound to", async () => {
    mainSessionId = "session-parent"
    configState = { currentProviderId: "google", currentModelId: "gemini", currentVariant: "max", currentAgentName: "review" }
    seedSession("session-a", { model: { ...SESSION_MODEL, variant: "low" }, agent: "workflow" })

    await replyInMainChat()

    expect(replyCalls.map((call) => call.method)).toEqual(["form.reply"])
  })

  test("an open subagent answers on its own record, never the composer's (#6555)", async () => {
    // The subagent's chat can be opened straight from a notification, before
    // the composer's config has followed its record, so the app-wide config
    // still holds the previous chat's selection. Answering must not switch
    // the subagent off the agent and model it runs on.
    mainSessionId = "session-a"
    configState = { currentProviderId: "google", currentModelId: "gemini", currentVariant: "max", currentAgentName: "review" }
    seedSession("session-a", { parentID: "session-parent", model: { ...SESSION_MODEL, variant: "high" }, agent: "plan" })

    await replyInMainChat()

    expect(replyMethods()).toEqual(["form.reply"])
    expect(selectionPicks.settled).toEqual([])
  })

  test("an open subagent's own agent pick still applies, not the composer's (#6555)", async () => {
    mainSessionId = "session-a"
    configState = { currentProviderId: "google", currentModelId: "gemini", currentVariant: "max", currentAgentName: "review" }
    seedSession("session-a", { parentID: "session-parent", model: SESSION_MODEL, agent: "plan" })
    selectionPicks.agents.set("session-a", "build")

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({ agent: "build" })
    expect(selectionPicks.settled).toEqual([])
  })

  for (const placement of ["another directory's store", "the global cache"] as const) {
    test(`a child whose record sits only in ${placement} still answers on its own record (#6555)`, async () => {
      // The reply resolves a directory whose store exists but holds only
      // other sessions (the project-holds-worktree split), so the lookup must
      // widen instead of reading the miss as "this is the main chat".
      mainSessionId = "session-a"
      configState = { currentProviderId: "google", currentModelId: "gemini", currentVariant: "max" }
      const child: Session = { ...sessionFixture("session-a"), parentID: "session-parent", model: SESSION_MODEL, agent: "plan" }
      if (placement === "another directory's store") sessionRecords.set("session-a", child)
      else globalActiveSessions = [child]
      // SAFETY: the reply's directory store is read only for its session slice.
      directoryStateOverride = () => ({ session: [sessionFixture("session-other")] }) as State

      await replyInMainChat()

      expect(replyMethods()).toEqual(["form.reply"])
      expect(selectionPicks.settled).toEqual([])
    })
  }

  test("an unknown child reads its record from the server and keeps it (#6555)", async () => {
    mainSessionId = "session-a"
    configState = { currentProviderId: "google", currentModelId: "gemini", currentVariant: "max", currentAgentName: "review" }
    fetchedSessionRecords.set("session-a", {
      ...sessionFixture("session-a"),
      directory: "/owned/project",
      parentID: "session-parent",
      model: SESSION_MODEL,
      agent: "plan",
    })

    await replyInMainChat()

    expect(replyCalls.some((call) => call.method === "session.get")).toBe(true)
    expect(replyMethods()).toEqual(["form.reply"])
    expect(replyCalls.find((call) => call.method === "form.reply")?.params.directory).toBe("/owned/project")
  })

  test("a record an event inserts during the read wins over the older snapshot (#6555)", async () => {
    mainSessionId = "session-a"
    configState = { currentProviderId: "google", currentModelId: "gemini", currentAgentName: "review" }
    const snapshot: Session = { ...sessionFixture("session-a"), directory: "/owned/older", parentID: "session-parent", agent: "plan" }
    fetchedSessionRecords.set("session-a", snapshot)
    const live: Session = { ...snapshot, directory: "/owned/newer", title: "Newer title" }
    beforeSessionGetResolve = () => { globalActiveSessions = [live] }
    try {
      await replyInMainChat()
    } finally {
      beforeSessionGetResolve = null
    }

    expect(replyCalls.find((call) => call.method === "form.reply")?.params.directory).toBe("/owned/newer")
  })

  test("an unknown root reads its record from the server and answers with the composer (#6053)", async () => {
    mainSessionId = "session-a"
    configState = { currentProviderId: "openai", currentModelId: "gpt-6", currentAgentName: "build" }
    fetchedSessionRecords.set("session-a", {
      ...sessionFixture("session-a"),
      directory: "/owned/root",
      model: SESSION_MODEL,
      agent: "plan",
    })

    await replyInMainChat()

    expect(replyCalls.some((call) => call.method === "session.get")).toBe(true)
    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
      model: { providerID: "openai", id: "gpt-6" },
      agent: "build",
    })
    expect(replyCalls.find((call) => call.method === "form.reply")?.params.directory).toBe("/owned/root")
  })

  test("an unknown review session reads its record from the server and gets composer semantics (#6555)", async () => {
    mainSessionId = "session-a"
    configState = { currentProviderId: "google", currentModelId: "gemini", currentVariant: "max", currentAgentName: "review" }
    fetchedSessionRecords.set("session-a", {
      ...sessionFixture("session-a"),
      directory: "/owned/review",
      parentID: "session-parent",
      model: SESSION_MODEL,
      agent: "plan",
      metadata: { openchamber: { kind: "review", originalSessionID: "session-parent" } },
    })

    await replyInMainChat()

    expect(replyCalls.some((call) => call.method === "session.get")).toBe(true)
    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
      model: { providerID: "google", id: "gemini", variant: "max" },
      agent: "review",
    })
    expect(replyCalls.find((call) => call.method === "form.reply")?.params.directory).toBe("/owned/review")
  })

  test("a failed record read sends nothing and leaves the form pending (#6555)", async () => {
    mainSessionId = "session-a"
    configState = { currentProviderId: "openai", currentModelId: "gpt-6" }
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, { form: { "session-a": [form] } })

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    const error = await replyToForm("session-a", "q-1", { choice: true }).then(() => null, (caught: Error) => caught)

    // Every form caller gates on this helper: a record-read 404 classified as
    // form-not-found dismisses the card while the form stays pending (#6555).
    expect(error).toBeInstanceOf(Error)
    expect(isFormRequestNotFoundError(error)).toBe(false)
    expect(replyCalls.map((call) => call.method)).toEqual(["session.get"])
    expect(store.getState().form["session-a"]).toEqual([form])
  })

  test("a runtime change during the record read sends nothing and leaves the form pending (#6555)", async () => {
    const original = { apiBaseUrl: getRuntimeApiBaseUrl(), runtimeKey: getRuntimeKey() }
    switchRuntimeEndpoint({ apiBaseUrl: "http://form-fetch.test", runtimeKey: "form-fetch" })
    mainSessionId = "session-a"
    configState = { currentProviderId: "openai", currentModelId: "gpt-6" }
    fetchedSessionRecords.set("session-a", sessionFixture("session-a"))
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, { form: { "session-a": [form] } })
    beforeSessionGetResolve = () => switchRuntimeEndpoint({ apiBaseUrl: "http://form-other.test", runtimeKey: "form-other" })

    try {
      const { setActionRefs, replyToForm } = await import("./session-actions")
      setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
      await expect(replyToForm("session-a", "q-1", { choice: true })).rejects.toThrow("runtime changed")

      expect(replyCalls.map((call) => call.method)).toEqual(["session.get"])
      expect(store.getState().form["session-a"]).toEqual([form])
    } finally {
      beforeSessionGetResolve = null
      switchRuntimeEndpoint(original)
    }
  })

  test("an open review session answers with the composer's selection despite parentID (#6555)", async () => {
    mainSessionId = "session-a"
    configState = { currentProviderId: "google", currentModelId: "gemini", currentVariant: "max", currentAgentName: "review" }
    seedSession("session-a", {
      parentID: "session-parent",
      model: SESSION_MODEL,
      agent: "plan",
      metadata: { openchamber: { kind: "review", originalSessionID: "session-parent" } },
    })

    await replyInMainChat()

    expect(replyMethods()).toEqual(["selection.apply", "form.reply"])
    expect(replyCalls.find((call) => call.method === "selection.apply")?.params.selection).toEqual({
      model: { providerID: "google", id: "gemini", variant: "max" },
      agent: "review",
    })
  })

  test("an effort saved before a switch made elsewhere does not undo that switch", async () => {
    mainSessionId = "session-parent"
    seedSession("session-a", { model: { ...SESSION_MODEL, variant: "low" } })
    selectionPicks.efforts.set("session-a/build/anthropic/claude-3", "high")
    selectionPicks.switched = true

    await replyInMainChat()

    expect(replyCalls.map((call) => call.method)).toEqual(["form.reply"])
  })

  test("a location-scoped form is answered with no switch, on its owning directory", async () => {
    const form = buildForm("q-1", "global")
    const store = createStore({}, { form: { global: [form] } })
    mainSessionId = "global"
    configState = { currentProviderId: "openai", currentModelId: "gpt-6", currentAgentName: "build" }

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/somewhere/else")
    await replyToForm("global", "q-1", { choice: true })

    expect(replyCalls.map((call) => call.method)).toEqual(["form.reply"])
    expect(replyCalls[0]?.params.directory).toBe("/test/project")
  })

  for (const roundTrip of [false, true]) {
    test(`a runtime change during the switch stops the reply, return to original: ${roundTrip}`, async () => {
      const original = { apiBaseUrl: getRuntimeApiBaseUrl(), runtimeKey: getRuntimeKey() }
      const home = { apiBaseUrl: "http://form-home.test", runtimeKey: "form-home" }
      switchRuntimeEndpoint(home)
      mainSessionId = "session-a"
      seedSession("session-a")
      configState = { currentProviderId: "openai", currentModelId: "gpt-6" }
      const form = buildForm("q-1", "session-a")
      const store = createStore({}, { form: { "session-a": [form] } })
      let release = () => {}
      let started = () => {}
      const reachedSwitch = new Promise<void>((resolve) => { started = resolve })
      selectionApplyGate = () => {
        started()
        return new Promise<void>((resolve) => { release = resolve })
      }

      const { setActionRefs, replyToForm } = await import("./session-actions")
      setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
      const reply = replyToForm("session-a", "q-1", { choice: true })
      await reachedSwitch

      try {
        switchRuntimeEndpoint({ apiBaseUrl: "http://form-other.test", runtimeKey: "form-other" })
        if (roundTrip) switchRuntimeEndpoint(home)
        release()
        await expect(reply).rejects.toThrow("runtime changed")
      } finally {
        switchRuntimeEndpoint(original)
      }

      expect(replyMethods()).not.toContain("form.reply")
      expect(store.getState().form["session-a"]).toEqual([form])
      expect(selectionPicks.settled).toEqual([])
    })
  }

  test("a not-found answer from an old runtime cleans nothing up", async () => {
    const original = { apiBaseUrl: getRuntimeApiBaseUrl(), runtimeKey: getRuntimeKey() }
    switchRuntimeEndpoint({ apiBaseUrl: "http://form-home.test", runtimeKey: "form-home" })
    seedSession("session-a")
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, { form: { "session-a": [form] } })
    formReplyError = Object.assign(new Error("FormNotFoundError"), { status: 404 })
    formReplyGate = () => switchRuntimeEndpoint({ apiBaseUrl: "http://form-other.test", runtimeKey: "form-other" })

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    try {
      await expect(replyToForm("session-a", "q-1", { choice: true })).rejects.toThrow("FormNotFoundError")
    } finally {
      formReplyGate = null
      switchRuntimeEndpoint(original)
    }

    expect(store.getState().form["session-a"]).toEqual([form])
  })
})

function archivedFixture(id: string): Session {
  return { ...sessionFixture(id), time: { created: 1, updated: 1, archived: 5 } }
}

function sessionFixture(id: string): Session {
  return {
    id,
    projectID: "project-1",
    directory: "/test/project",
    title: id,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }
}

describe("form dismissal clears pending state without the SSE echo (issues #2911, #2448)", () => {
  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
    formCancelError = null
  })

  test("cancelForm clears the form from the child store on success", async () => {
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [form] },
    })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, cancelForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await cancelForm("session-a", "q-1")

    // The backend confirmed the rejection. The local pending state must be gone
    // even if the SSE `form.cancelled` event is lost (SSE gap), otherwise the
    // session stays in "waiting for answer" and the next task never renders
    // thinking/final response (issues #2911, #2448).
    expect(store.getState().form["session-a"]).toBe(undefined)
  })

  test("replyToForm clears the form from the child store on success", async () => {
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [form] },
    })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await replyToForm("session-a", "q-1", { choice: true })

    expect(store.getState().form["session-a"]).toBe(undefined)
  })

  test("dismissOpenFormsForSession leaves the store cleared when the reject succeeds", async () => {
    const form = buildForm("q-root", "session-a")
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [form] },
    })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const { dismissed } = await dismissOpenFormsForSession("session-a")

    expect(dismissed).toBe(true)
    // The optimistic clear already removed it before the round-trip; the
    // successful reject must not resurrect it.
    expect(store.getState().form["session-a"]).toBe(undefined)
  })

  test("reply/reject actions on an already-cleared store stay no-ops (SSE echo equivalent)", async () => {
    // A later (or duplicated) SSE echo for an already-cleared request must not
    // error or resurrect state — the reducer only removes when present.
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: {},
    })
    sessionRecords.set("session-a", sessionFixture("session-a"))

    const { setActionRefs, cancelForm, replyToForm } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    await replyToForm("session-a", "q-gone", { choice: true })
    await cancelForm("session-a", "q-gone")

    expect(store.getState().form["session-a"]).toBe(undefined)
  })
})

describe("blocking request reply routing and stale recovery (issue OPE-236)", () => {
  const materializationCalls: Array<{ directory: string; sessionID: string; messageID: string }> = []
  const enqueueMaterialization = (directory: string, sessionID: string, messageID: string) => {
    materializationCalls.push({ directory, sessionID, messageID })
  }

  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
    formCancelError = null
    materializationCalls.length = 0
    // replyToForm reads the composer selection; an empty one keeps this suite
    // about routing rather than model switching.
    directoryStateOverride = null
    configState = { currentProviderId: "", currentModelId: "" }
    listedAgents = []
  })

  test("routes the form reply by the request's own session directory, not the containing store key", async () => {
    // The form was asked by a worktree session whose record lives in the
    // parent store (containment). The reply must be addressed to the session's
    // own server-confirmed directory — otherwise the server resolves the
    // parent instance, does not find the pending form, and answers
    // FormNotFoundError, leaving the session stuck on "asking for input".
    const form = buildForm("q-wt", "session-wt")
    const store = createStore({}, {
      session: [{ id: "session-wt", directory: "/test/project/wt" } as Session],
      form: { "session-wt": [form] },
    })
    // SAFETY: mirrors the session slice this store already holds.
    sessionRecords.set("session-wt", { id: "session-wt", directory: "/test/project/wt" } as Session)
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project", enqueueMaterialization)

    await replyToForm("session-wt", "q-wt", { choice: true })

    expect(replyCalls.filter((call) => call.method.endsWith(".reply") || call.method === "form.cancel").map((call) => call.params.directory)).toEqual(["/test/project/wt"])
    expect(replyCalls[0]?.params.directory).toBe("/test/project/wt")
    expect(replyCalls[0]?.params.formID).toBe("q-wt")
  })

  test("routes permission replies by the request's own session directory", async () => {
    const permission = buildPermission("perm-wt", "session-wt")
    const store = createStore(
      { "session-wt": [permission] },
      {
        session: [{ id: "session-wt", directory: "/test/project/wt" } as Session],
      },
    )
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project", enqueueMaterialization)

    await respondToPermission("session-wt", "perm-wt", "once")

    expect(replyCalls.filter((call) => call.method.endsWith(".reply") || call.method === "form.cancel").map((call) => call.params.directory)).toEqual(["/test/project/wt"])
    expect(replyCalls[0]?.params.directory).toBe("/test/project/wt")
    expect(replyCalls[0]?.params.requestID).toBe("perm-wt")
  })

  test("falls back to the containing store key when the session record carries no directory", async () => {
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, {
      session: [{ id: "session-a" } as Session],
      form: { "session-a": [form] },
    })
    // SAFETY: mirrors the session slice this store already holds.
    sessionRecords.set("session-a", { id: "session-a" } as Session)
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project", enqueueMaterialization)

    await replyToForm("session-a", "q-1", { choice: true })

    expect(replyCalls.filter((call) => call.method.endsWith(".reply") || call.method === "form.cancel").map((call) => call.params.directory)).toEqual(["/test/project"])
    expect(replyCalls[0]?.params.directory).toBe("/test/project")
  })

  test("enqueues settled-running-tool tail recovery when the form reply is not found", async () => {
    const form = buildForm("q-stale", "session-a")
    const store = createStore({}, {
      session: [{ id: "session-a" } as Session],
      form: { "session-a": [form] },
      message: {
        "session-a": [{ id: "msg-1", sessionID: "session-a", role: "assistant", time: { created: 1 } } as Message],
      },
      part: {
        "msg-1": [{
          id: "prt-1",
          messageID: "msg-1",
          sessionID: "session-a",
          type: "tool",
          tool: "question",
          state: { status: "running" },
        } as Part],
      },
    })
    // SAFETY: mirrors the session slice this store already holds.
    sessionRecords.set("session-a", { id: "session-a" } as Session)
    const childStores = createChildStores([["/test/project", store]])
    formReplyError = Object.assign(new Error("form.reply failed (404): FormNotFoundError"), { status: 404 })

    const { setActionRefs, replyToForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project", enqueueMaterialization)

    let thrown: unknown
    try {
      await replyToForm("session-a", "q-stale", { choice: true })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    // The stale request is gone from the store and the trailing running tool
    // part is reconciled instead of leaving the UI stuck on "asking for input".
    expect(store.getState().form["session-a"]).toBe(undefined)
    expect(materializationCalls).toEqual([{ directory: "/test/project", sessionID: "session-a", messageID: "msg-1" }])
  })

  test("enqueues tail recovery on reject not-found but not on success", async () => {
    const form = buildForm("q-1", "session-a")
    const store = createStore({}, {
      session: [{ id: "session-a" } as Session],
      form: { "session-a": [form] },
      message: {
        "session-a": [{ id: "msg-1", sessionID: "session-a", role: "assistant", time: { created: 1 } } as Message],
      },
      part: {
        "msg-1": [{
          id: "prt-1",
          messageID: "msg-1",
          sessionID: "session-a",
          type: "tool",
          tool: "question",
          state: { status: "running" },
        } as Part],
      },
    })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, cancelForm } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project", enqueueMaterialization)

    // Success: no recovery enqueued — the normal form.cancelled event flow clears state.
    await cancelForm("session-a", "q-1")
    expect(materializationCalls).toEqual([])

    // Not-found: the request is stale server-side; the tail must be reconciled.
    formCancelError = Object.assign(new Error("form.cancel failed (404): FormNotFoundError"), { status: 404 })
    const stale = buildForm("q-stale", "session-a")
    store.setState({ form: { "session-a": [stale] } })

    let thrown: unknown
    try {
      await cancelForm("session-a", "q-stale")
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(store.getState().form["session-a"]).toBe(undefined)
    expect(materializationCalls).toEqual([{ directory: "/test/project", sessionID: "session-a", messageID: "msg-1" }])
  })
})

function buildForm(id: string, sessionId: string): FormRequest {
  return {
    id,
    sessionID: sessionId,
    title: "Choose an option",
    fields: [{ key: "choice", type: "boolean" }],
  }
}

function buildPermission(id: string, sessionId: string): PermissionRequest {
  return {
    id,
    sessionID: sessionId,
    action: "edit",
    resources: [],
    metadata: {},
  }
}

// A form linked to the tool call that posted it, as a deferred-question plugin and the question tool stamp it.
function buildLinkedForm(id: string, sessionId: string, messageID = "msg-tool"): FormRequest {
  return { ...buildForm(id, sessionId), metadata: { kind: "question", tool: { messageID, id: `call-${id}` } } }
}

function buildToolPart(formId: string, sessionId: string, status: ToolPart["state"]["status"], messageID = "msg-tool"): ToolPart {
  const part = (state: ToolPart["state"]): ToolPart => ({ id: `call-${formId}`, sessionID: sessionId, messageID, callID: `call-${formId}`, tool: "deferred_question", type: "tool", state })
  switch (status) {
    case "pending": return part({ status, input: {}, raw: "" })
    case "running": return part({ status, input: {}, time: { start: 1 } })
    case "completed": return part({ status, input: {}, output: "", time: { start: 1, end: 2 } })
    case "error": return part({ status, input: {}, error: "failed", time: { start: 1, end: 2 } })
  }
}

function messageWithParts(sessionId: string, messageID: string, parts: Part[]) {
  // SAFETY: the send path reads only the parts of this message.
  return { info: { id: messageID, sessionID: sessionId, role: "assistant" } as Message, parts }
}

describe("dismissOpenFormsForSession", () => {
  beforeEach(() => {
    replyCalls.length = 0
    formReplyError = null
    formCancelError = null
    sessionMessageRead = null
    resetRecoverableQuestions()
  })

  test("returns false and rejects nothing when no forms are pending", async () => {
    const store = createStore({}, { session: [{ id: "session-a", time: { created: 1 } } as Session] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const { dismissed } = await dismissOpenFormsForSession("session-a")

    expect(dismissed).toBe(false)
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
  })

  test("cancels pending forms without a tool link in the whole session subtree (root + subagent child)", async () => {
    const rootForm = buildForm("q-root", "session-a")
    const childForm = buildForm("q-child", "session-child")
    const store = createStore({}, {
      session: [
        { id: "session-a", time: { created: 1 } } as Session,
        { id: "session-child", parentID: "session-a", time: { created: 2 } } as Session,
      ],
      form: {
        "session-a": [rootForm],
        "session-child": [childForm],
      },
    })
    const childStores = createChildStores([["/test/project", store]])

    // The sync index holds every store's records; this mock reads it from sessionRecords.
    for (const session of store.getState().session) sessionRecords.set(session.id, session)
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const { dismissed } = await dismissOpenFormsForSession("session-a")

    expect(dismissed).toBe(true)
    const rejectCalls = replyCalls.filter((call) => call.method === "form.cancel")
    expect(rejectCalls).toHaveLength(2)
    const rejectedIds = rejectCalls.map((call) => call.params.formID).sort()
    expect(rejectedIds).toEqual(["q-child", "q-root"])
    // Optimistic clear: the forms are removed from the local store so the
    // prompt disappears instantly, without waiting for the reject round-trip.
    expect(store.getState().form["session-a"]).toBe(undefined)
    expect(store.getState().form["session-child"]).toBe(undefined)
  })

  test("swallows FormNotFoundError so a stranded form never blocks the send", async () => {
    const staleForm = buildForm("q-stale", "session-a")
    const store = createStore({}, {
      session: [{ id: "session-a", time: { created: 1 } } as Session],
      form: { "session-a": [staleForm] },
    })
    const childStores = createChildStores([["/test/project", store]])
    formCancelError = Object.assign(new Error("form.cancel failed (404): FormNotFoundError"), { status: 404 })

    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const { dismissed } = await dismissOpenFormsForSession("session-a")

    expect(dismissed).toBe(true)
    const cancelCalls = replyCalls.filter((call) => call.method === "form.cancel")
    expect(cancelCalls).toHaveLength(1)
    expect(cancelCalls[0].params.formID).toBe("q-stale")
    // The stale entry is cleared from the store even though the server reported not-found.
    expect(store.getState().form["session-a"]).toBe(undefined)
  })

  test("puts the forms back when the cancel fails for another reason (#2448)", async () => {
    const rootForm = buildForm("q-root", "session-a")
    const childForm = buildForm("q-child", "session-child")
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [rootForm] },
    })
    // The subagent's session lives in its own worktree store.
    const worktreeStore = createStore({}, {
      session: [{ ...sessionFixture("session-child"), parentID: "session-a" }],
      form: { "session-child": [childForm] },
    })
    const childStores = createChildStores([["/test/project", store], ["/test/project/wt", worktreeStore]])
    formCancelError = Object.assign(new Error("session.form.cancel failed (500): unexpected status"), { status: 500 })

    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const { dismissed } = await dismissOpenFormsForSession("session-a")

    expect(dismissed).toBe(true)
    // The agent is still waiting on both forms, so each goes back to the store it came from.
    expect(store.getState().form["session-a"]).toEqual([rootForm])
    expect(store.getState().form["session-child"]).toBe(undefined)
    expect(worktreeStore.getState().form["session-child"]).toEqual([childForm])
    expect(worktreeStore.getState().form["session-a"]).toBe(undefined)
  })

  // #5391: a form whose tool call has ended does not hold the turn, so a send leaves it open.
  test("leaves a form open when its linked tool call completed or failed", async () => {
    for (const status of ["completed", "error"] as const) {
      replyCalls.length = 0
      const form = buildLinkedForm("q-done", "session-a")
      const store = createStore({}, {
        session: [sessionFixture("session-a")],
        form: { "session-a": [form] },
        part: { "msg-tool": [buildToolPart("q-done", "session-a", status)] },
      })
      const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
      setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

      expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(false)
      expect(store.getState().form["session-a"]).toEqual([form])
      expect(replyCalls.filter((call) => call.method === "form.cancel" || call.method === "session.message")).toHaveLength(0)
    }
  })

  test("cancels a form whose linked tool call is still pending or running", async () => {
    for (const status of ["pending", "running"] as const) {
      replyCalls.length = 0
      const form = buildLinkedForm("q-wait", "session-a")
      const store = createStore({}, {
        session: [sessionFixture("session-a")],
        form: { "session-a": [form] },
        part: { "msg-tool": [buildToolPart("q-wait", "session-a", status)] },
      })
      sessionRecords.set("session-a", sessionFixture("session-a"))
      const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
      setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

      expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(true)
      expect(replyCalls.filter((call) => call.method === "form.cancel").map((call) => call.params.formID)).toEqual(["q-wait"])
      expect(store.getState().form["session-a"]).toBe(undefined)
    }
  })

  test("in a mixed session, cancels only the form that holds the turn", async () => {
    const released = buildLinkedForm("q-done", "session-a")
    const holding = buildLinkedForm("q-wait", "session-a")
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [released, holding] },
      part: { "msg-tool": [buildToolPart("q-done", "session-a", "completed"), buildToolPart("q-wait", "session-a", "running")] },
    })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(true)
    expect(replyCalls.filter((call) => call.method === "form.cancel").map((call) => call.params.formID)).toEqual(["q-wait"])
    expect(store.getState().form["session-a"]).toEqual([released])
  })

  test("cancels a form with a malformed tool link as before", async () => {
    const form: FormRequest = { ...buildForm("q-bad", "session-a"), metadata: { tool: { messageID: "msg-tool" } } }
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [form] },
      part: { "msg-tool": [buildToolPart("q-bad", "session-a", "completed")] },
    })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(true)
    expect(replyCalls.filter((call) => call.method === "form.cancel").map((call) => call.params.formID)).toEqual(["q-bad"])
    expect(replyCalls.filter((call) => call.method === "session.message")).toHaveLength(0)
  })

  test("leaves a subagent's form open when its tool call has ended", async () => {
    const childForm = buildLinkedForm("q-child", "session-child", "msg-child")
    const store = createStore({}, {
      session: [sessionFixture("session-a"), { ...sessionFixture("session-child"), parentID: "session-a" }],
      form: { "session-child": [childForm] },
      part: { "msg-child": [buildToolPart("q-child", "session-child", "completed", "msg-child")] },
    })
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(false)
    expect(store.getState().form["session-child"]).toEqual([childForm])
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
  })

  test("reads an unloaded tool call once, and a completed one leaves the form open for the composer too", async () => {
    const form = buildLinkedForm("q-old", "session-a")
    // The question's message lies before the loaded window: no parts for it.
    const store = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    sessionMessageRead = (sessionID, messageID) => messageWithParts(sessionID, messageID, [buildToolPart("q-old", sessionID, "completed")])
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")
    const { formTurnHold } = await import("./recoverable-questions")
    expect(formTurnHold(form, store.getState().part, useRecoverableQuestionsStore.getState().releasedForms)).toBe("unknown")

    expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(false)
    expect(replyCalls.filter((call) => call.method === "session.message")).toEqual([
      { method: "session.message", params: { sessionID: "session-a", messageID: "msg-tool", directory: "/test/project" } },
    ])
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
    expect(store.getState().form["session-a"]).toEqual([form])
    // The part is still not in the store, yet the composer's phase reads the read's answer.
    expect(formTurnHold(form, store.getState().part, useRecoverableQuestionsStore.getState().releasedForms)).toBe("released")

    // A second send needs no second read.
    replyCalls.length = 0
    expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(false)
    expect(replyCalls).toHaveLength(0)
  })

  test("cancels an unloaded form when the read shows it running, misses the part, or fails", async () => {
    const reads: Array<[string, typeof sessionMessageRead]> = [
      ["running", (sessionID, messageID) => messageWithParts(sessionID, messageID, [buildToolPart("q-old", sessionID, "running")])],
      ["missing part", (sessionID, messageID) => messageWithParts(sessionID, messageID, [])],
      ["failed read", null],
    ]
    for (const [, read] of reads) {
      replyCalls.length = 0
      resetRecoverableQuestions()
      sessionMessageRead = read
      const form = buildLinkedForm("q-old", "session-a")
      const store = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
      sessionRecords.set("session-a", sessionFixture("session-a"))
      const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
      setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

      expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(true)
      expect(replyCalls.filter((call) => call.method === "form.cancel").map((call) => call.params.formID)).toEqual(["q-old"])
      expect(store.getState().form["session-a"]).toBe(undefined)
      expect(useRecoverableQuestionsStore.getState().releasedForms.size).toBe(0)
    }
  })

  // One verdict per form across every store holding a copy (#5391 review).
  test("a stale running copy in another store does not cancel a form whose tool call completed", async () => {
    const form = buildLinkedForm("q-dup", "session-a")
    const fresh = createStore({}, {
      session: [sessionFixture("session-a")], form: { "session-a": [form] },
      part: { "msg-tool": [buildToolPart("q-dup", "session-a", "completed")] },
    })
    const stale = createStore({}, {
      session: [sessionFixture("session-a")], form: { "session-a": [form] },
      part: { "msg-tool": [buildToolPart("q-dup", "session-a", "running")] },
    })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", stale], ["/test/project/wt", fresh]]), () => "/test/project")

    expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(false)
    expect(replyCalls.filter((call) => call.method === "form.cancel" || call.method === "session.message")).toHaveLength(0)
    expect(fresh.getState().form["session-a"]).toEqual([form])
    expect(stale.getState().form["session-a"]).toEqual([form])
  })

  test("duplicate unloaded copies share one read, so a second, failing read cannot cancel a released form", async () => {
    const form = buildLinkedForm("q-dup", "session-a")
    const first = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
    const second = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    let reads = 0
    sessionMessageRead = (sessionID, messageID) => {
      if (++reads > 1) throw new Error("simulated transport failure")
      return messageWithParts(sessionID, messageID, [buildToolPart("q-dup", sessionID, "completed")])
    }
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", first], ["/test/project/wt", second]]), () => "/test/project")

    expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(false)
    expect(reads).toBe(1)
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
    expect(first.getState().form["session-a"]).toEqual([form])
    expect(second.getState().form["session-a"]).toEqual([form])
  })

  test("two racing sends share the read: a later failing read cannot cancel what the first read released", async () => {
    const form = buildLinkedForm("q-race", "session-a")
    const store = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    let answer: (value: { info: Message; parts: Part[] }) => void = () => {}
    let reads = 0
    sessionMessageRead = () => {
      if (++reads > 1) return Promise.reject(new Error("simulated transport failure"))
      return new Promise((resolve) => { answer = resolve })
    }
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    const sendA = dismissOpenFormsForSession("session-a")
    const sendB = dismissOpenFormsForSession("session-a")
    await new Promise((resolve) => setTimeout(resolve, 0))
    answer(messageWithParts("session-a", "msg-tool", [buildToolPart("q-race", "session-a", "completed")]))
    expect((await sendA).dismissed).toBe(false)
    expect((await sendB).dismissed).toBe(false)
    expect(reads).toBe(1)
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
    expect(store.getState().form["session-a"]).toEqual([form])
  })

  test("a failed read does not cancel a form another copy showed completed meanwhile", async () => {
    const form = buildLinkedForm("q-late", "session-a")
    const unloaded = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
    const other = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    sessionMessageRead = () => {
      // The tool call's completion reaches the other store while the read is out.
      other.setState((state) => ({ part: { ...state.part, "msg-tool": [buildToolPart("q-late", "session-a", "completed")] } }))
      throw new Error("simulated transport failure")
    }
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", unloaded], ["/test/project/wt", other]]), () => "/test/project")

    expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(false)
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
    expect(unloaded.getState().form["session-a"]).toEqual([form])
  })

  test("a runtime switch during a read stops the dismissal: nothing is removed or cancelled, on either runtime", async () => {
    const { switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    for (const outcome of ["failed", "completed"] as const) {
      replyCalls.length = 0
      resetRecoverableQuestions()
      switchRuntimeEndpoint({ apiBaseUrl: "http://forms-old.test", runtimeKey: `forms-old-${outcome}` })
      const unloaded = buildLinkedForm("q-old", "session-a")
      // A form that holds its turn and needs no read is spared as well.
      const holding = buildLinkedForm("q-wait", "session-a")
      const forms = () => ({ "session-a": [unloaded, holding] })
      const parts = () => ({ "msg-tool": [buildToolPart("q-wait", "session-a", "running")] })
      const oldStore = createStore({}, { session: [sessionFixture("session-a")], form: forms(), part: parts() })
      const newStore = createStore({}, { session: [sessionFixture("session-a")], form: forms(), part: parts() })
      sessionRecords.set("session-a", sessionFixture("session-a"))
      const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
      setActionRefs(createChildStores([["/test/project", oldStore]]), () => "/test/project")
      sessionMessageRead = (sessionID, messageID) => {
        switchRuntimeEndpoint({ apiBaseUrl: "http://forms-new.test", runtimeKey: `forms-new-${outcome}` })
        setActionRefs(createChildStores([["/test/project", newStore]]), () => "/test/project")
        if (outcome === "failed") throw new Error("simulated transport failure")
        return messageWithParts(sessionID, messageID, [buildToolPart("q-old", sessionID, "completed")])
      }

      expect((await dismissOpenFormsForSession("session-a")).dismissed).toBe(false)
      expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
      expect(oldStore.getState().form["session-a"]).toEqual([unloaded, holding])
      expect(newStore.getState().form["session-a"]).toEqual([unloaded, holding])
      expect(useRecoverableQuestionsStore.getState().releasedForms.size).toBe(0)
    }
  })

  test("a read from before a switch away and back is not shared: the send reads again on its own runtime", async () => {
    const { switchRuntimeEndpoint } = await import("../lib/runtime-switch")
    switchRuntimeEndpoint({ apiBaseUrl: "http://forms-a.test", runtimeKey: "forms-aba-a" })
    const form = buildLinkedForm("q-aba", "session-a")
    const oldStore = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
    const reloadedStore = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    const answers: Array<(value: { info: Message; parts: Part[] }) => void> = []
    sessionMessageRead = () => new Promise((resolve) => { answers.push(resolve) })
    const { setActionRefs, dismissOpenFormsForSession, readUnloadedFormToolLinks } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", oldStore]]), () => "/test/project")

    readUnloadedFormToolLinks("session-a")
    await new Promise((resolve) => setTimeout(resolve, 0))
    switchRuntimeEndpoint({ apiBaseUrl: "http://forms-b.test", runtimeKey: "forms-aba-b" })
    resetRecoverableQuestions()
    switchRuntimeEndpoint({ apiBaseUrl: "http://forms-a.test", runtimeKey: "forms-aba-a" })
    resetRecoverableQuestions()
    setActionRefs(createChildStores([["/test/project", reloadedStore]]), () => "/test/project")
    const send = dismissOpenFormsForSession("session-a")
    await new Promise((resolve) => setTimeout(resolve, 0))
    // Both reads find the call completed; only the send's own read may count.
    const completed = messageWithParts("session-a", "msg-tool", [buildToolPart("q-aba", "session-a", "completed")])
    for (const answer of answers) answer(completed)
    expect((await send).dismissed).toBe(false)
    expect(answers).toHaveLength(2)
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
    expect(reloadedStore.getState().form["session-a"]).toEqual([form])
  })

  test("a read that finishes after its form closed records nothing", async () => {
    const form = buildLinkedForm("q-closed", "session-a")
    const store = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    let answer: (value: { info: Message; parts: Part[] }) => void = () => {}
    sessionMessageRead = () => new Promise((resolve) => { answer = resolve })
    const { setActionRefs, readUnloadedFormToolLinks } = await import("./session-actions")
    const { applyRecoverableQuestionEvents } = await import("./recoverable-questions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    readUnloadedFormToolLinks("session-a")
    await new Promise((resolve) => setTimeout(resolve, 0))
    store.setState({ form: { "session-a": [] } })
    applyRecoverableQuestionEvents("/test/project", [{ type: "form.settled", properties: { sessionID: "session-a", formID: "q-closed", disposition: "replied" } }])
    answer(messageWithParts("session-a", "msg-tool", [buildToolPart("q-closed", "session-a", "completed")]))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useRecoverableQuestionsStore.getState().releasedForms.size).toBe(0)
  })

  for (const childStatus of ["running", "completed"] as const) {
    test(`a child form with the parent's form id is its own form (child ${childStatus})`, async () => {
      const parent = sessionFixture("session-parent")
      const child = { ...sessionFixture("session-child"), parentID: parent.id }
      const parentForm = buildLinkedForm("q-shared", parent.id, "msg-parent")
      const childForm = buildLinkedForm("q-shared", child.id, "msg-child")
      const parentStore = createStore({}, {
        session: [parent], form: { [parent.id]: [parentForm] },
        part: { "msg-parent": [buildToolPart("q-shared", parent.id, "running", "msg-parent")] },
      })
      const childStore = createStore({}, {
        session: [child], form: { [child.id]: [childForm] },
        part: { "msg-child": [buildToolPart("q-shared", child.id, childStatus, "msg-child")] },
      })
      sessionRecords.set(parent.id, parent)
      sessionRecords.set(child.id, child)
      const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
      setActionRefs(createChildStores([["/test/project", parentStore], ["/test/project/child", childStore]]), () => "/test/project")

      expect((await dismissOpenFormsForSession(parent.id)).dismissed).toBe(true)
      const cancelled = replyCalls.filter((call) => call.method === "form.cancel").map((call) => call.params.sessionID)
      expect(parentStore.getState().form[parent.id]).toBeUndefined()
      if (childStatus === "running") {
        expect(cancelled.sort()).toEqual([child.id, parent.id].sort())
        expect(childStore.getState().form[child.id]).toBeUndefined()
      } else {
        // The parent's cancel and its store cleanup leave the child's open question alone.
        expect(cancelled).toEqual([parent.id])
        expect(childStore.getState().form[child.id]).toEqual([childForm])
      }
    })
  }

  test("the composer's read of an unloaded call settles the first send: no second read, nothing cancelled", async () => {
    const form = buildLinkedForm("q-first", "session-a")
    const store = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [form] } })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    let answer: (value: { info: Message; parts: Part[] }) => void = () => {}
    sessionMessageRead = () => new Promise((resolve) => { answer = resolve })
    const { setActionRefs, dismissOpenFormsForSession, readUnloadedFormToolLinks } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    // useSessionActivity starts the read when it sees the form, before any send.
    readUnloadedFormToolLinks("session-a")
    await new Promise((resolve) => setTimeout(resolve, 0))
    // A send while that read is out waits for it instead of reading again.
    const send = dismissOpenFormsForSession("session-a")
    answer(messageWithParts("session-a", "msg-tool", [buildToolPart("q-first", "session-a", "completed")]))
    expect((await send).dismissed).toBe(false)
    expect(replyCalls.filter((call) => call.method === "session.message")).toHaveLength(1)
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
    const { formTurnHold } = await import("./recoverable-questions")
    expect(formTurnHold(form, store.getState().part, useRecoverableQuestionsStore.getState().releasedForms)).toBe("released")
  })

  // #5391: the session's own waiting question gives way to the message and stays open until the send resolves.
  test("with deferQuestions, leaves the session's own waiting question in place and returns it", async () => {
    const question = buildLinkedForm("q-ask", "session-a")
    const store = createStore({}, {
      session: [sessionFixture("session-a")],
      form: { "session-a": [question] },
      part: { "msg-tool": [{ ...buildToolPart("q-ask", "session-a", "running"), tool: "question" }] },
    })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    expect(await dismissOpenFormsForSession("session-a", { deferQuestions: true })).toEqual({ dismissed: false, deferred: [question] })
    expect(store.getState().form["session-a"]).toEqual([question])
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)

    // Without the option (a shell command) the same question is cancelled as before.
    expect(await dismissOpenFormsForSession("session-a")).toEqual({ dismissed: true, deferred: [] })
    expect(replyCalls.filter((call) => call.method === "form.cancel").map((call) => call.params.formID)).toEqual(["q-ask"])
  })

  test("with deferQuestions, a question whose call only a server read shows waiting is deferred too", async () => {
    const question = buildLinkedForm("q-ask", "session-a")
    // Forms can load before the message history: no part in the store.
    const store = createStore({}, { session: [sessionFixture("session-a")], form: { "session-a": [question] } })
    sessionRecords.set("session-a", sessionFixture("session-a"))
    sessionMessageRead = (sessionID, messageID) => messageWithParts(sessionID, messageID, [{ ...buildToolPart("q-ask", sessionID, "running"), tool: "question" }])
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    expect(await dismissOpenFormsForSession("session-a", { deferQuestions: true })).toEqual({ dismissed: false, deferred: [question] })
    expect(store.getState().form["session-a"]).toEqual([question])
    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)

    // A running call of another tool is no question to defer: cancelled as before.
    sessionMessageRead = (sessionID, messageID) => messageWithParts(sessionID, messageID, [buildToolPart("q-ask", sessionID, "running")])
    expect(await dismissOpenFormsForSession("session-a", { deferQuestions: true })).toEqual({ dismissed: true, deferred: [] })
  })

  test("with deferQuestions, a subagent's question and a form without a question call are cancelled as before", async () => {
    const question = buildLinkedForm("q-ask", "session-a")
    const childQuestion = buildLinkedForm("q-child", "session-child", "msg-child")
    const consent: FormRequest = { ...buildForm("q-consent", "session-a"), metadata: { kind: "websearch.provider" } }
    const store = createStore({}, {
      session: [sessionFixture("session-a"), { ...sessionFixture("session-child"), parentID: "session-a" }],
      form: { "session-a": [question, consent], "session-child": [childQuestion] },
      part: {
        "msg-tool": [{ ...buildToolPart("q-ask", "session-a", "running"), tool: "question" }],
        "msg-child": [{ ...buildToolPart("q-child", "session-child", "running", "msg-child"), tool: "question" }],
      },
    })
    for (const session of store.getState().session) sessionRecords.set(session.id, session)
    const { setActionRefs, dismissOpenFormsForSession } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    expect(await dismissOpenFormsForSession("session-a", { deferQuestions: true })).toEqual({ dismissed: true, deferred: [question] })
    expect(replyCalls.filter((call) => call.method === "form.cancel").map((call) => call.params.formID).sort()).toEqual(["q-child", "q-consent"])
    expect(store.getState().form["session-a"]).toEqual([question])
    expect(store.getState().form["session-child"]).toBe(undefined)
  })
})

describe("deferQuestionsAfterSend", () => {
  const question = buildLinkedForm("q-ask", "session-a")
  const promptToSessionA = { route: "prompt", sessionId: "session-a" } as const
  const questionStore = () => createStore({}, {
    session: [sessionFixture("session-a")],
    form: { "session-a": [question] },
  })

  beforeEach(() => {
    replyCalls.length = 0
    formCancelError = null
    resetRecoverableQuestions()
    noteQuestionFormSnapshot("/test/project", [question])
    sessionRecords.set("session-a", sessionFixture("session-a"))
  })

  test("cancels with the note and keeps the question recoverable", async () => {
    const store = questionStore()
    const { setActionRefs, deferQuestionsAfterSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    await deferQuestionsAfterSend([question], promptToSessionA)

    expect(replyCalls.filter((call) => call.method === "form.cancel").map((call) => call.params)).toEqual([
      { sessionID: "session-a", formID: "q-ask", directory: "/test/project", message: DEFERRED_QUESTION_NOTE },
    ])
    expect(store.getState().form["session-a"]).toBe(undefined)
    // A local dismissal would veto the card; a deferral must not.
    expect(useRecoverableQuestionsStore.getState().outcomes.has("q-ask")).toBe(false)
  })

  test("a failed cancel leaves the question pending", async () => {
    const store = questionStore()
    formCancelError = Object.assign(new Error("session.form.cancel failed (500): unexpected status"), { status: 500 })
    const { setActionRefs, deferQuestionsAfterSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    await deferQuestionsAfterSend([question], promptToSessionA)

    expect(store.getState().form["session-a"]).toEqual([question])
    expect(useRecoverableQuestionsStore.getState().outcomes.has("q-ask")).toBe(false)
  })

  // Only a plain prompt to the question's own session is the message the note announces.
  test("after a command, a shell command or a send elsewhere the question stays pending", async () => {
    const store = questionStore()
    const { setActionRefs, deferQuestionsAfterSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    for (const sent of [
      { route: "command", sessionId: "session-a" },
      { route: "shell", sessionId: "session-a" },
      { route: "prompt", sessionId: "session-b" },
      undefined,
    ] as const) {
      await deferQuestionsAfterSend([question], sent)
    }

    expect(replyCalls.filter((call) => call.method === "form.cancel")).toHaveLength(0)
    expect(store.getState().form["session-a"]).toEqual([question])
  })

  test("a question another page answered meanwhile (409 FormAlreadySettledError) is removed; another 409 leaves it", async () => {
    const store = questionStore()
    const { setActionRefs, deferQuestionsAfterSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    // Shaped as client.ts normalizeOpencodeError builds it from OpenCode 2.3.0's tagged body.
    formCancelError = Object.assign(new Error("session.form.cancel failed (409): SessionBusyError"), { status: 409, tag: "SessionBusyError" })
    await deferQuestionsAfterSend([question], promptToSessionA)
    expect(store.getState().form["session-a"]).toEqual([question])

    formCancelError = Object.assign(new Error("session.form.cancel failed (409): Form already settled: q-ask"), {
      status: 409, tag: "FormAlreadySettledError", detail: "Form already settled: q-ask",
    })
    await deferQuestionsAfterSend([question], promptToSessionA)
    expect(store.getState().form["session-a"]).toBe(undefined)
  })

  test("a question that settled meanwhile is removed without an error", async () => {
    const store = questionStore()
    formCancelError = Object.assign(new Error("form.cancel failed (404): FormNotFoundError"), { status: 404 })
    const { setActionRefs, deferQuestionsAfterSend } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", store]]), () => "/test/project")

    await deferQuestionsAfterSend([question], promptToSessionA)

    expect(store.getState().form["session-a"]).toBe(undefined)
  })
})

describe("dismissPermission not-found handling", () => {
  beforeEach(() => {
    replyCalls.length = 0
    permissionReplyError = null
  })

  test("clears the stale permission and rethrows on PermissionNotFoundError", async () => {
    const permission = buildPermission("perm-stale", "session-a")
    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (404): PermissionNotFoundError"), { status: 404 })

    const { setActionRefs, dismissPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await expect(dismissPermission("session-a", "perm-stale")).rejects.toThrow()
    expect(replyCalls.filter((call) => call.method === "permission.reply")).toHaveLength(1)
    // The stale entry is cleared from the store even though the server reported not-found.
    expect(store.getState().permission["session-a"]).toBe(undefined)
  })

  test("does not clear the store on a non-not-found failure (rethrow only)", async () => {
    const permission = buildPermission("perm-500", "session-a")
    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (500)"), { status: 500 })

    const { setActionRefs, dismissPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await expect(dismissPermission("session-a", "perm-500")).rejects.toThrow()
    // A non-not-found failure leaves store reconciliation to the next server event.
    expect(store.getState().permission["session-a"]).toHaveLength(1)
  })

  test("an allow on a permission the server no longer has clears the card", async () => {
    const permission = buildPermission("perm-stale", "session-a")
    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (404): PermissionNotFoundError"), { status: 404 })

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await expect(respondToPermission("session-a", "perm-stale", "once")).rejects.toThrow()
    expect(store.getState().permission["session-a"]).toBe(undefined)
  })

  test("an allow that fails for another reason keeps the card", async () => {
    const permission = buildPermission("perm-500", "session-a")
    const store = createStore({ "session-a": [permission] })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (500)"), { status: 500 })

    const { setActionRefs, respondToPermission } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    await expect(respondToPermission("session-a", "perm-500", "once")).rejects.toThrow()
    expect(store.getState().permission["session-a"]).toHaveLength(1)
  })
})

describe("dismissOpenPermissionsForSession", () => {
  beforeEach(() => {
    replyCalls.length = 0
    permissionReplyError = null
  })

  test("returns false and rejects nothing when no permissions are pending", async () => {
    const store = createStore({}, { session: [{ id: "session-a", time: { created: 1 } } as Session] })
    const childStores = createChildStores([["/test/project", store]])

    const { setActionRefs, dismissOpenPermissionsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenPermissionsForSession("session-a")

    expect(dismissed).toBe(false)
    expect(replyCalls.filter((call) => call.method === "permission.reply")).toHaveLength(0)
  })

  test("rejects every pending permission in the session subtree (root + subagent child)", async () => {
    const rootPermission = buildPermission("perm-root", "session-a")
    const childPermission = buildPermission("perm-child", "session-child")
    const store = createStore({
      "session-a": [rootPermission],
      "session-child": [childPermission],
    }, {
      session: [
        { id: "session-a", time: { created: 1 } } as Session,
        { id: "session-child", parentID: "session-a", time: { created: 2 } } as Session,
      ],
    })
    const childStores = createChildStores([["/test/project", store]])

    // The sync index holds every store's records; this mock reads it from sessionRecords.
    for (const session of store.getState().session) sessionRecords.set(session.id, session)
    const { setActionRefs, dismissOpenPermissionsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenPermissionsForSession("session-a")

    expect(dismissed).toBe(true)
    const replyCallsForPermissions = replyCalls.filter((call) => call.method === "permission.reply")
    expect(replyCallsForPermissions).toHaveLength(2)
    const rejectedIds = replyCallsForPermissions.map((call) => call.params.requestID).sort()
    expect(rejectedIds).toEqual(["perm-child", "perm-root"])
    expect(replyCallsForPermissions.every((call) => call.params.reply === "reject")).toBe(true)
    // Optimistic clear: the permissions are removed from the local store so the
    // prompt disappears instantly, without waiting for the reject round-trip.
    expect(store.getState().permission["session-a"]).toBe(undefined)
    expect(store.getState().permission["session-child"]).toBe(undefined)
  })

  test("swallows PermissionNotFoundError so a stranded permission never blocks the send", async () => {
    const stalePermission = buildPermission("perm-stale", "session-a")
    const store = createStore({ "session-a": [stalePermission] }, {
      session: [{ id: "session-a", time: { created: 1 } } as Session],
    })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (404): PermissionNotFoundError"), { status: 404 })

    const { setActionRefs, dismissOpenPermissionsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const dismissed = await dismissOpenPermissionsForSession("session-a")

    expect(dismissed).toBe(true)
    const replyCallsForPermissions = replyCalls.filter((call) => call.method === "permission.reply")
    expect(replyCallsForPermissions).toHaveLength(1)
    expect(replyCallsForPermissions[0].params.requestID).toBe("perm-stale")
    // The stale entry is cleared from the store even though the server reported not-found.
    expect(store.getState().permission["session-a"]).toBe(undefined)
  })

  test("swallows and logs a non-not-found reject failure so the send is never blocked", async () => {
    const permission = buildPermission("perm-500", "session-a")
    const store = createStore({ "session-a": [permission] }, {
      session: [{ id: "session-a", time: { created: 1 } } as Session],
    })
    const childStores = createChildStores([["/test/project", store]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (500)"), { status: 500 })

    const { setActionRefs, dismissOpenPermissionsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const errors: unknown[][] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => { errors.push(args) }
    try {
      const dismissed = await dismissOpenPermissionsForSession("session-a")

      expect(dismissed).toBe(true)
      const replyCallsForPermissions = replyCalls.filter((call) => call.method === "permission.reply")
      expect(replyCallsForPermissions).toHaveLength(1)
      expect(replyCallsForPermissions[0].params.requestID).toBe("perm-500")
      expect(errors).toHaveLength(1)
      expect(String(errors[0]?.[0])).toContain("[session-actions]")
    } finally {
      console.error = originalError
    }
  })

  test("puts the permissions back when the reject fails for another reason", async () => {
    const rootPermission = buildPermission("perm-root", "session-a")
    const childPermission = buildPermission("perm-child", "session-child")
    const store = createStore({ "session-a": [rootPermission] }, {
      session: [sessionFixture("session-a")],
    })
    // The subagent's session lives in its own worktree store.
    const worktreeStore = createStore({ "session-child": [childPermission] }, {
      session: [{ ...sessionFixture("session-child"), parentID: "session-a" }],
    })
    const childStores = createChildStores([["/test/project", store], ["/test/project/wt", worktreeStore]])
    permissionReplyError = Object.assign(new Error("permission.reply failed (500): unexpected status"), { status: 500 })

    const { setActionRefs, dismissOpenPermissionsForSession } = await import("./session-actions")
    setActionRefs(childStores, () => "/test/project")

    const originalError = console.error
    console.error = () => {}
    let dismissed: boolean
    try {
      dismissed = await dismissOpenPermissionsForSession("session-a")
    } finally {
      console.error = originalError
    }

    expect(dismissed).toBe(true)
    // The agent is still waiting on both permissions, so each goes back to the store it came from.
    expect(store.getState().permission["session-a"]).toEqual([rootPermission])
    expect(store.getState().permission["session-child"]).toBe(undefined)
    expect(worktreeStore.getState().permission["session-child"]).toEqual([childPermission])
    expect(worktreeStore.getState().permission["session-a"]).toBe(undefined)
  })
})

describe("setSessionWorkState", () => {
  const savedArchiveResponse = archiveBatchResponse

  beforeEach(() => {
    runtimeKey = "runtime-a"
    openchamberRouteRequests.length = 0
    globalUpsertedSessions.length = 0
    beforeSessionGetResolve = null
    beforeArchiveRouteResolve = null
    sessionRecords.set("ses-work", { ...sessionFixture("ses-work"), metadata: {} })
    archiveBatchResponse = { status: 200, body: { metadata: { openchamber: { work: { state: "open" } } } } }
  })

  afterEach(() => {
    archiveBatchResponse = savedArchiveResponse
    beforeSessionGetResolve = null
    beforeArchiveRouteResolve = null
  })

  test("tracks the session through the metadata route", async () => {
    const { setSessionWorkState } = await import("./session-actions")

    const updated = await setSessionWorkState("ses-work", "/test/project", "open")

    expect(updated?.metadata).toEqual({ openchamber: { work: { state: "open" } } })
    const request = openchamberRouteRequests.find((entry) => entry.path.endsWith("/ses-work/metadata"))
    expect(request?.body).toMatchObject({ patch: { openchamber: { work: { state: "open", openedBy: "user" } } } })
  })

  test("reports a failed write and stores nothing", async () => {
    const { setSessionWorkState } = await import("./session-actions")
    archiveBatchResponse = { status: 500, body: { error: "OpenCode is down" } }

    const failure = await setSessionWorkState("ses-work", "/test/project", "done").catch((error: Error) => error)

    expect(failure instanceof Error).toBe(true)
    expect(globalUpsertedSessions).toHaveLength(0)
  })

  test("writes nothing to the new server when the runtime switches during the read", async () => {
    const { setSessionWorkState } = await import("./session-actions")
    beforeSessionGetResolve = () => {
      runtimeKey = "runtime-b"
    }

    expect(await setSessionWorkState("ses-work", "/test/project", "done")).toBeNull()

    expect(openchamberRouteRequests).toHaveLength(0)
    expect(globalUpsertedSessions).toHaveLength(0)
  })

  test("keeps the old server's answer out of the new server's cache when the runtime switches during the write", async () => {
    const { setSessionWorkState } = await import("./session-actions")
    beforeArchiveRouteResolve = () => {
      runtimeKey = "runtime-b"
    }

    expect(await setSessionWorkState("ses-work", "/test/project", "done")).toBeNull()

    expect(globalUpsertedSessions).toHaveLength(0)
  })
});

describe("sendRecoveredFormAnswer", () => {
  const recoveredForm: FormRequest = {
    id: "frm_recovered",
    sessionID: "session-a",
    title: "Questions",
    metadata: { kind: "question", tool: { messageID: "message-ask", id: "tool_ask" } },
    fields: [{ key: "q0", title: "Color", type: "string", options: [{ value: "Red", label: "Red" }] }],
  }

  const askMessage: Message = {
    id: "message-ask",
    sessionID: "session-a",
    role: "assistant",
    time: { created: 1 },
    agent: "build",
    providerID: "prov",
    modelID: "mod",
    variant: "think",
  }

  const askSession: Session = {
    id: "session-a",
    projectID: "proj",
    directory: "/test/project",
    title: "Ask",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  }

  const question: RecoveredQuestion = {
    form: recoveredForm,
    directory: "/test/project",
    sessionID: "session-a",
    toolMessageID: "message-ask",
    evidence: "tool-interrupted",
  }

  const questionStore = () => createStore({}, {
    session: [askSession],
    message: { "session-a": [askMessage] },
  })

  beforeEach(() => {
    resetRecoverableQuestions()
    noteQuestionFormSnapshot("/test/project", [recoveredForm])
    sendMessageCalls.length = 0
    sendMessageBehavior = async () => {}
    runtimeKey = "default-runtime"
  })

  test("starts a new turn on the session that asked, with its own configuration", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")

    await sendRecoveredFormAnswer(question, "the answer")

    expect(sendMessageCalls).toEqual([{
      content: "the answer",
      providerID: "prov",
      modelID: "mod",
      agent: "build",
      variant: "think",
      queuedGoal: null,
      target: { runtimeKey: "default-runtime", sessionId: "session-a", directory: "/test/project" },
    }])
    // The card is done only after the send was accepted.
    expect(useRecoverableQuestionsStore.getState().outcomes.get("frm_recovered")).toBe("answered")
  })

  test("the new turn carries the serialized answer payload", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")
    const values: FormValues = {
      q0: { text: '', number: null, boolean: false, selected: ['Red'], custom: false, acknowledged: false },
    }

    await sendRecoveredFormAnswer(question, serializeFormAnswerAsMarkdown(recoveredForm, buildFormAnswer(recoveredForm.fields, values)))

    expect(sendMessageCalls).toHaveLength(1)
    expect(sendMessageCalls[0]?.content).toContain('# Questions')
    expect(sendMessageCalls[0]?.content).toContain('**Answer:** Red')
    expect(sendMessageCalls[0]?.content).toContain('{"q0":"Red"}')
  })

  test("a deferred question's answer opens with the lead-in and carries the marker", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")

    await sendRecoveredFormAnswer({ ...question, evidence: "deferred-on-send" }, "the answer")

    expect(sendMessageCalls.map((call) => [call.content, call.metadata])).toEqual([
      [`${DEFERRED_ANSWER_LEAD_IN}\n\nthe answer`, { openchamber: { deferredAnswer: { formID: "frm_recovered" } } }],
    ])
    expect(useRecoverableQuestionsStore.getState().outcomes.get("frm_recovered")).toBe("answered")
  })

  test("a rejected send keeps the question recoverable", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")
    sendMessageBehavior = async () => {
      throw new Error("send failed")
    }

    await expect(sendRecoveredFormAnswer(question, "the answer")).rejects.toThrow("send failed")

    // No tombstone: the card and the draft the surface keeps stay for a retry.
    expect(useRecoverableQuestionsStore.getState().outcomes.has("frm_recovered")).toBe(false)
  })

  test("a duplicate submission reuses the first send", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    sendMessageBehavior = async () => {
      await gate
    }

    const first = sendRecoveredFormAnswer(question, "the answer")
    const second = sendRecoveredFormAnswer(question, "the answer")
    await Promise.resolve()
    expect(sendMessageCalls).toHaveLength(1)
    release()
    await Promise.all([first, second])
    expect(sendMessageCalls).toHaveLength(1)
  })

  test("a completion after a runtime switch leaves the next runtime alone", async () => {
    const { sendRecoveredFormAnswer, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", questionStore()]]), () => "/test/project")
    sendMessageBehavior = async () => {
      runtimeKey = "runtime-b"
    }

    await sendRecoveredFormAnswer(question, "the answer")

    expect(sendMessageCalls).toHaveLength(1)
    expect(useRecoverableQuestionsStore.getState().outcomes.has("frm_recovered")).toBe(false)
  })
})

describe("a session created with a title", () => {
  beforeEach(() => {
    replyCalls.length = 0
    globalUpsertedSessions.length = 0
    registeredSessionDirectories.length = 0
  })

  test("records the user's title and preserves existing metadata", async () => {
    const source = createStore({}, { session: [] })
    const { createSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    const session = await createSession("My task", "/test/project", { custom: "kept", openchamber: { kind: "review" } })

    expect(session?.id).toBe("created")
    const created = replyCalls.find((call) => call.method === "session.create")
    expect(created?.params.metadata).toEqual({
      custom: "kept",
      openchamber: { kind: "review", workTitle: { title: "My task", by: "user" } },
    })
  })

  test("leaves the metadata alone when no title is given", async () => {
    const source = createStore({}, { session: [] })
    const { createSession, setActionRefs } = await import("./session-actions")
    setActionRefs(createChildStores([["/test/project", source]]), () => "/test/project")

    const session = await createSession(undefined, "/test/project")

    expect(session?.id).toBe("created")
    const created = replyCalls.find((call) => call.method === "session.create")
    expect(created?.params.metadata).toBeUndefined()
>>>>>>> upstream/main
  })
})
