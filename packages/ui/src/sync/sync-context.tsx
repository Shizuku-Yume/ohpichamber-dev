<<<<<<< HEAD
/* eslint-disable react-refresh/only-export-components -- SyncProvider, its contexts, hooks, and runtime helpers are one contract module. */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { useStore, type StoreApi } from "zustand"
import type { AdvisorNote, ApprovalRequest, CanonicalEvent, Message, Part, QuestionRequest, Run, Session, SessionRuntimeStatus, SessionSnapshot } from "@openchamber/agent-contract"
import { canonicalClient, type CanonicalClient } from "@/api/canonicalClient"
import { getRuntimeKey, subscribeRuntimeEndpointChanged, subscribeRuntimeEndpointWillChange } from "@/lib/runtime-switch"
import { normalizePath } from "@/lib/pathNormalization"
import { isSurfaceAttended } from "@/lib/surfaceAttention"
import { useAuthSessionStore } from "@/lib/runtime-auth-expiry"
import { useConfigStore } from "@/stores/useConfigStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { resolveWorkspaceDirectory, subscribeWorkspaceDirectories } from "@/stores/globalSessions"
import { ChildStoreManager, markDirectorySessionPartChanged, subscribeDirectorySessionMessages, subscribeDirectoryPermission, subscribeDirectoryForm, type DirectoryStore, type DirectoryBootstrapPriority, type DirectoryBootstrapReason } from "./child-store"
import { bootstrapDirectory, bootstrapGlobal } from "./bootstrap"
import { BootstrapFailureError } from "./retry"
import { notifyFirstCanonicalBootstrap } from "./first-server-connect"
import { useGlobalSyncStore } from "./global-sync-store"
import { applyDirectoryEvent, compareCounters, mergeHostSession } from "./event-reducer"
import { useBtwStore } from "@/stores/useBtwStore"
import { useSubagentsStore } from "@/stores/useSubagentsStore"
import { useSessionRecapStore } from "@/stores/useSessionRecapStore"
import { useCleanseStore } from "@/stores/useCleanseStore"
import { useAdvisorStore } from "@/stores/useAdvisorStore"
import { createEventPipeline, type EventPipeline } from "./event-pipeline"
import { subscribeSessionFoldersSync } from "./session-folders-sync";
import { subscribeSessionDraftsSync } from "./session-drafts-sync";
import { subscribeMessageQueueSync } from "./message-queue-sync";
import { subscribeSessionAdmission } from "./session-admission";
import { subscribeControlStreamSync } from "./control-stream-sync";
import { subscribeSessionMetadataSync } from "./session-metadata-sync";

import { SessionMessageLoader, getImperativeSessionMessageLoader, setImperativeSessionMessageLoader, type SessionMessageLoadState, type SessionMessageTarget } from "./session-message-loader"
import { setSyncRefs } from "./sync-refs"
import { setActionRefs, setOptimisticRefs } from "./session-actions"
import { aggregateLiveSessions, aggregateLiveSessionStatuses, areSessionListsEquivalent, areStatusMapsEquivalent, findLiveSession } from "./live-aggregate"
import { applyGlobalSessionStatusEvents, applyGlobalSessionStatusSnapshot, useGlobalSessionStatusStore, setSessionParentResolver } from "./global-session-status"
import { applyGlobalBlockingRequestEvents, replaceGlobalBlockingRequestSnapshot } from "./global-blocking-requests"
import { applyBackgroundShellEvents } from "./background-shells"
import { collectScopedBlockingRequests, areRequestArraysReferentiallyEqual } from "./scoped-blocking-requests"
import { buildUserMessageHistorySnapshot, EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT, type TranscriptPrompt } from "./user-message-history"
import { getSessionMaterializationStatus } from "./materialization"
import { appendNotification } from "./notification-store"
import { recordSessionError, summarizeSessionError } from "./session-error-log"
import type { State } from "./types"
import { sessionEvents } from "@/lib/sessionEvents"
import { fileTreeChanges } from "@/lib/fileTreeChanges"

type CurrentDirectorySource = { get: () => string; subscribe: (notify: () => void) => () => void }
export type SyncRuntime = { childStores: ChildStoreManager; messageLoader: SessionMessageLoader; runtimeKey: string; client: CanonicalClient; currentDirectory: CurrentDirectorySource }
type SyncSystem = SyncRuntime & { directory: string }
export const SyncContext = createContext<SyncSystem | null>(null)
export const SyncRuntimeContext = createContext<SyncRuntime | null>(null)
const EMPTY_MESSAGES: Message[] = []
const EMPTY_APPROVALS: ApprovalRequest[] = []
const EMPTY_QUESTIONS: QuestionRequest[] = []
const EMPTY_PART_MAP: Record<string, Part[]> = {}
const EMPTY_LOAD: SessionMessageLoadState = { status: "idle", loadingKind: null, error: null, resolved: false, limit: 0, cursor: undefined, complete: false, generation: 0, updatedAt: undefined }
let activeTarget: SessionMessageTarget | null = null
const externallyViewedSessions = new Map<string, number>()
=======
/* oxlint-disable react/only-export-components */
import React, { createContext, useContext, useEffect, useRef, useCallback, useMemo } from "react"
import type { StoreApi } from "zustand"
import { useStore } from "zustand"
import type { OpenCodeClient } from "@opencode/client"
import { syncEventMessageID, syncEventSessionID, type CatalogKind, type OpenchamberNotification, type SyncEvent } from "@/lib/opencode/events"
import type {
  FormRequest,
  Message,
  Part,
  PermissionRequest,
  Session,
  SessionOutcome,
  SessionStatus,
  StructuredError,
} from "@/lib/opencode/model"
import { createEventPipeline } from "./event-pipeline"
import { isVSCodeRuntime } from "@/lib/desktop"
import { isSurfaceAttended } from "@/lib/surfaceAttention"
import { isMobileSurfaceRuntime } from "@/lib/runtimeSurface"
import { reduceGlobalEvent, applyDirectoryEvent, type SessionMaterializationReason } from "./event-reducer"
import { useGlobalSyncStore } from "./global-sync-store"
import {
  ChildStoreManager,
  markDirectorySessionPartChanged,
  subscribeDirectoryPermission,
  subscribeDirectoryPermissions,
  subscribeDirectoryForms,
  subscribeDirectorySessionMessages,
  type DirectoryBootstrapContext,
  type DirectoryBootstrapReason,
  type DirectoryBootstrapPriority,
  type DirectoryStore,
} from "./child-store"
import {
  aggregateLiveSessions,
  aggregateLiveSessionStatuses,
  areSessionListsEquivalent,
  areStatusMapsEquivalent,
  findLiveSession,
} from "./live-aggregate"
import { bootstrapGlobal, bootstrapDirectory } from "./bootstrap"
import { retry } from "./retry"
import { touchStreamingSession, updateChangedStreamingSessions, updateStreamingState } from "./streaming"
import { countSyncPerformance } from "./performance-diagnostics"
import { runBackgroundNetworkTask } from "@/lib/background-network"
import { recordDirectoryRecoveryEvent, selectHeldSessionStatuses } from "./directory-recovery-snapshots"
import { hasPromptInFlight, withPromptsInFlight } from "./prompts-in-flight"
import { applyRecoverableQuestionEvents, deriveRecoveredQuestions, noteQuestionFormSnapshot, useRecoverableQuestionsStore, type RecoveredQuestion } from "./recoverable-questions"
import { adoptSessionMove, setActionRefs } from "./session-actions"
import { subscribeSessionAdmission } from "./session-admission"
import { setSyncRefs, getAllSyncSessions, emitSyncConfigChanged, getDirectoryState } from "./sync-refs"
import { useSessionUIStore } from "./session-ui-store"
import { stripSessionDiffSnapshots } from "./sanitize"
import { upsertSessionRecord } from "./session-records"
import {
  applySessionEventToGlobalSessions,
  applySessionEventsToGlobalSessions,
} from "./session-event-router"
import { shouldConsumeBulkArchiveEcho } from "./bulk-archive-echo"
import { applyForkedSession, noteForkedSessionPatched } from "./forked-session"
import { LOCATION_SCOPED_FORM_SESSION_ID } from "./location-scoped-forms"
import { useUIStore } from "@/stores/useUIStore"
import { useBtwStore } from "@/stores/useBtwStore"
import { selectNewChildSessions } from "./child-session-discovery"
import { syncDebug } from "./debug"
import { normalizePath } from "@/lib/pathNormalization"
import { Binary } from "./binary"
import { getReconnectCandidateSessionIds, mergeBootstrapSessions } from "./reconnect-recovery"
import { messagesBefore } from "./message-ordering"
import { opencodeClient } from "@/lib/opencode/client"
import { usePermissionStore } from "@/stores/permissionStore"
import { policySnapshotFromWire } from "@/stores/utils/permissionAutoAccept"
import { selectSafetyNetAvailable, useRoutingStore } from "@/stores/useRoutingStore"
import { useMessageQueueStore } from "@/stores/messageQueueStore"
import { isAutoReviewAvailable, useAutoReviewStore } from "@/stores/useAutoReviewStore"
import { subscribeMessageQueueSync } from "./message-queue-sync"
import { subscribeAutoReviewSync } from "./auto-review-sync"
import { subscribePrWatchSync } from "./pr-watch-sync"
import { subscribeSessionWarmingSync } from "./session-warming-sync"
import { subscribeSessionFoldersSync } from "./session-folders-sync"
import { subscribeSessionDraftsSync } from "./session-drafts-sync"
import { subscribePermissionPolicySync, subscribeSpacePermissionModes } from "./permission-mode-sync"
import { subscribeControlStreamSync } from "./control-stream-sync"
import type { ControlStreamSyncEvent } from "@/lib/openchamberEvents"
import { spaceFoldersOfProject, subscribeSpaceCatalogs } from "./space-catalog-sync"
import { subscribeSpaceSessionProject } from "./space-session-project"
import {
  processVSCodePermissionAutoAccept,
  processVSCodeReconciledPermissionAutoAccept,
} from "./vscode-permission-auto-accept"
import { markConfigCatalogStale, useConfigStore } from "@/stores/useConfigStore"
import { refreshStoresForCatalogKinds } from "@/stores/catalogRefresh"
import { useMcpStore } from "@/stores/useMcpStore"
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { spaceIdOfDirectory } from "@/lib/spaces/space-route"
import { isDirectoryOfKnownSpace, isSpaceDirectoryStopped, isSpaceStopped, knownSpaceIds, refreshSpacesJourney, spaceIdsGone, spacesRuntimeGeneration, useSpacesStore } from "@/lib/spaces/spaces-store"
import { cleanupPersistedSessionState } from "./session-deletion-cleanup"
import { toast } from "@/components/ui"
import { appendErrorNotification, markSessionViewed } from "./notification-store"
import { isSessionUnread } from "./session-unread"
import { recordSessionError, responseBodyOf, summarizeOpenCodeError } from "./session-error-log"
import {
  applyGlobalSessionStatusEvent,
  applyGlobalSessionStatusEvents,
  applyGlobalSessionStatusSnapshot,
  getDirectoryOwnedSessionIds,
  setSessionParentResolver,
  useGlobalSessionStatusStore,
} from "./global-session-status"
import { applyGlobalBlockingRequestEvents, applyWaitingPageEvent, settledPageKeys, useGlobalBlockingRequestsStore } from "./global-blocking-requests"
import { requestHostTurnStarts } from "./host-session-status-seed"
import { setHostTurnStartRequester } from "./session-activity-timing"
import { applyBackgroundShellEvents, directoriesWithRunningShells, refreshBackgroundShells } from "./background-shells"
import { applyBackgroundImageEvents, refreshBackgroundImages } from "./background-images"
import { applyReplyCommandEvents } from "./reply-commands"
import {
  CHAT_LOCATION_RELEASE_DELAY_MS,
  PROJECT_LOCATION_RELEASE_DELAY_MS,
  WORKTREE_LOCATION_RELEASE_DELAY_MS,
  createRealLocationRelease,
  directoryUse,
  isWorktreeDirectory,
  type LocationRelease,
} from "./location-release"
import { applySessionAssistEvent, subscribeSessionAssistSettled } from "./pending-session-assists"
import { useWorkflowRunsStore } from "@/lib/workflows/store"
import { setWorkflowRunningSessions } from "./workflow-activity"
import { isChatDirectoryPath } from "@/lib/chatDirectories"
import type { State } from "./types"
import {
  getSessionMaterializationRequestKey,
  getSessionMaterializationStatus,
  getStaleRunningToolMessageID,
  isSessionMaterializationStillNeeded,
  type SessionMaterializationRequest,
} from "./materialization"
import { openSessionFromToast } from "./session-navigation"
import { revealRequest, revealWaitingPage } from "./request-reveal"
import { getPermissionToastKey, showPermissionNeededToast } from "./permission-toast"
import { getRuntimeLiveStatusSeed, LIVE_STATUS_TTL_MS } from "./runtime-live-memory"
import { captureRuntimeInstance, getRuntimeKey } from "@/lib/runtime-switch"
import { getRegisteredRuntimeAPIs } from "@/contexts/runtimeAPIRegistry"
import { isFilesystemError } from "@/lib/api/files-errors"
import { formatMessage, useI18nStore } from "@/lib/i18n"
import { sessionEvents } from "@/lib/sessionEvents"
import { fileTreeChanges } from "@/lib/fileTreeChanges"
import { notifyWatchedFileChanged, renewWatchedFiles } from "@/lib/watchedFiles"
import { listGlobalSessionPages, splitGlobalSessionsByArchived, type GlobalSessionRecord, type SessionPageLister } from "@/stores/globalSessions"
import { areRequestArraysReferentiallyEqual, collectScopedBlockingRequests, computeSubtreeIds } from "./scoped-blocking-requests"
import { EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT, buildUserMessageHistorySnapshot, type TranscriptPrompt, type UserMessageHistorySnapshot } from "./user-message-history"
import {
  EMPTY_SESSION_MESSAGE_LOAD_STATE,
  SessionMessageLoader,
  getImperativeSessionMessageLoader,
  setImperativeSessionMessageLoader,
  type SessionMessageLoadState,
} from "./session-message-loader"
import { openCodeStartupSignal } from "./opencode-startup-gate"
import { claimFirstServerConnect, notifyFirstServerConnect } from "./first-server-connect"

// Session rows read which sessions run a workflow from a small store of their
// own (`workflow-activity.ts`), kept here from the runs the server reports.
useWorkflowRunsStore.subscribe((state) => {
  setWorkflowRunningSessions(Object.entries(state.bySession).flatMap(([sessionId, entry]) => (
    entry.runs.some((run) => run.state === "running") ? [sessionId] : []
  )))
})

// A waiting page's toast leaves with the page, however the index learned it
// stopped waiting: its end event, or the host's snapshot after that event fell
// into a gap of the control stream.
// Only a toast on screen is dismissed: most waiting pages never raised one.
useGlobalBlockingRequestsStore.subscribe((state, previous) => {
  if (state.bySession === previous.bySession) return
  const settled = settledPageKeys(previous.bySession, state.bySession)
  if (settled.length === 0) return
  const shown = new Set(toast.getToasts().map((entry) => entry.id))
  for (const key of settled) {
    if (shown.has(`page-${key}`)) toast.dismiss(`page-${key}`)
  }
})

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * The provider's current directory as a subscribable value instead of a
 * context field. A hook that is handed an explicit directory reads a constant
 * snapshot from it and therefore does not re-render when the current
 * directory changes; a context read would re-render every consumer — every
 * sidebar row — on each cross-project switch.
 */
type CurrentDirectorySource = {
  get: () => string
  subscribe: (notify: () => void) => () => void
}

type SyncRuntime = {
  childStores: ChildStoreManager
  messageLoader: SessionMessageLoader
  runtimeKey: string
  sdk: OpenCodeClient
  currentDirectory: CurrentDirectorySource
}

type SyncSystem = SyncRuntime & {
  directory: string
}

// Subagent sessions keep their parent's turn open in the status index; the
// global sessions list knows every session's parent, children included.
setSessionParentResolver((sessionId) => useGlobalSessionsStore.getState().entityById.get(sessionId)?.parentID)

// A turn this page did not see begin counts from the host's record of its
// start, read from the host's status map.
setHostTurnStartRequester(requestHostTurnStarts)

const SYNC_CONTEXT_GLOBAL_KEY = "__openchamber_sync_context__"
const SYNC_RUNTIME_CONTEXT_GLOBAL_KEY = "__openchamber_sync_runtime_context__"
type SyncGlobal = typeof globalThis & {
  [SYNC_CONTEXT_GLOBAL_KEY]?: React.Context<SyncSystem | null>
  [SYNC_RUNTIME_CONTEXT_GLOBAL_KEY]?: React.Context<SyncRuntime | null>
}

const syncGlobal = globalThis as SyncGlobal
const SyncContext = syncGlobal[SYNC_CONTEXT_GLOBAL_KEY] ?? createContext<SyncSystem | null>(null)
syncGlobal[SYNC_CONTEXT_GLOBAL_KEY] = SyncContext
const SyncRuntimeContext = syncGlobal[SYNC_RUNTIME_CONTEXT_GLOBAL_KEY] ?? createContext<SyncRuntime | null>(null)
syncGlobal[SYNC_RUNTIME_CONTEXT_GLOBAL_KEY] = SyncRuntimeContext

function useSyncSystem() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error("useSyncSystem must be used within <SyncProvider>")
  return ctx
}

export function useSyncRuntime() {
  const ctx = useContext(SyncRuntimeContext)
  if (!ctx) throw new Error("useSyncRuntime must be used within <SyncProvider>")
  return ctx
}

function getLiveStates(childStores: ChildStoreManager): State[] {
  return Array.from(childStores.children.values(), (store) => store.getState())
}

function useLiveSyncSelector<T>(
  selector: (states: State[]) => T,
  isEqual: (left: T, right: T) => boolean = Object.is,
  subscribe?: (childStores: ChildStoreManager, notify: () => void) => () => void,
): T {
  const { childStores } = useSyncRuntime()
  const sourceRevisionRef = useRef(0)
  const cacheRef = useRef<{
    childStores: ChildStoreManager
    selector: (states: State[]) => T
    revision: number
    value: T
  } | null>(null)

  const getSnapshot = useCallback(() => {
    const cached = cacheRef.current
    if (
      cached
      && cached.childStores === childStores
      && cached.selector === selector
      && cached.revision === sourceRevisionRef.current
    ) {
      return cached.value
    }
    const next = selector(getLiveStates(childStores))
    const value = cached && isEqual(cached.value, next) ? cached.value : next
    cacheRef.current = { childStores, selector, revision: sourceRevisionRef.current, value }
    return value
  }, [childStores, isEqual, selector])

  const subscribeToSource = useCallback((notify: () => void) => {
    const invalidate = () => {
      sourceRevisionRef.current += 1
      notify()
    }
    // Force the post-subscribe snapshot to close the read-before-subscribe gap.
    sourceRevisionRef.current += 1
    return subscribe ? subscribe(childStores, invalidate) : childStores.subscribeAll(invalidate)
  }, [childStores, subscribe])

  return React.useSyncExternalStore(
    subscribeToSource,
    getSnapshot,
    getSnapshot,
  )
}

// ---------------------------------------------------------------------------
// Event handler — applies ordered SSE events to a cumulative per-flush draft.
// Per-event side effects remain ordered, while each directory store publishes
// once and each touched top-level slice is cloned at most once per flush.
// ---------------------------------------------------------------------------

type SessionMove = { sessionID: string; from: string; to: string }

type DirectoryEventBatch = {
  states: Map<StoreApi<DirectoryStore>, DirectoryStore>
  clonedFields: Map<StoreApi<DirectoryStore>, Set<keyof State>>
  changedStores: Set<StoreApi<DirectoryStore>>
  globalSessionEvents: SyncEvent[]
  globalStatusEventsByDirectory: Map<string, SyncEvent[]>
  /** Applied after the stores publish: a move reads and writes both stores directly. */
  sessionMoves: SessionMove[]
}

const createDirectoryEventBatch = (): DirectoryEventBatch => ({
  states: new Map(),
  clonedFields: new Map(),
  changedStores: new Set(),
  globalSessionEvents: [],
  globalStatusEventsByDirectory: new Map(),
  sessionMoves: [],
})

const getDirectoryEventState = (
  store: StoreApi<DirectoryStore>,
  batch?: DirectoryEventBatch,
): DirectoryStore => batch?.states.get(store) ?? store.getState()

const publishDirectoryEventBatch = (batch: DirectoryEventBatch): void => {
  applySessionEventsToGlobalSessions(batch.globalSessionEvents)
  for (const [directory, events] of batch.globalStatusEventsByDirectory) {
    // Before statuses: an idle that follows a command's start in the same
    // flush must see the command.
    applyBackgroundShellEvents(directory, events)
    applyBackgroundImageEvents(directory, events)
    applyReplyCommandEvents(events)
    applyGlobalSessionStatusEvents(directory, events)
    applyGlobalBlockingRequestEvents(directory, events)
    applyRecoverableQuestionEvents(directory, events)
  }
  for (const store of batch.changedStores) {
    const state = batch.states.get(store)
    if (!state) continue
    countSyncPerformance("directoryStorePublications")
    store.setState(state)
  }
  for (const move of batch.sessionMoves) adoptSessionMove(move.sessionID, move.from, move.to)
}

/** Read status for a session across all directories */
export function useGlobalSessionStatus(sessionId: string): SessionStatus | undefined {
  return useGlobalSessionStatusStore(
    useCallback((state) => state.statusById.get(sessionId)?.status, [sessionId]),
  )
}

/** Read all session statuses (for sidebar) */
export function useAllSessionStatuses(): Record<string, SessionStatus> {
  return useLiveSyncSelector(
    useCallback((states) => aggregateLiveSessionStatuses(states), []),
    areStatusMapsEquivalent,
    useCallback(
      (childStores: ChildStoreManager, notify: () => void) => childStores.subscribeAllSelected(
        (state: State) => state.session_status,
        notify,
      ),
      [],
    ),
  )
}

const subscribeLiveSessionLists = (childStores: ChildStoreManager, notify: () => void) => childStores.subscribeAllSelected(
  (state: State) => state.session,
  notify,
)

export function useAllLiveSessions(): Session[] {
  return useLiveSyncSelector(
    useCallback((states) => {
      countSyncPerformance("liveSessionAggregateRuns")
      return aggregateLiveSessions(states)
    }, []),
    areSessionListsEquivalent,
    subscribeLiveSessionLists,
  )
}

const EMPTY_LIVE_SESSIONS: Session[] = []

/**
 * Live sessions whose ids are not in `excludedIds`, newest first. Updates to
 * an excluded session (a `time.updated` bump on every streamed step) do not
 * re-render the caller.
 */
export function useLiveSessionsExcluding(excludedIds: ReadonlySet<string>): Session[] {
  return useLiveSyncSelector(
    useCallback((states) => {
      countSyncPerformance("liveSessionAggregateRuns")
      const sessions = aggregateLiveSessions(states).filter((session) => !excludedIds.has(session.id))
      return sessions.length === 0 ? EMPTY_LIVE_SESSIONS : sessions
    }, [excludedIds]),
    areSessionListsEquivalent,
    subscribeLiveSessionLists,
  )
}

// Boot debounce — suppresses redundant refresh/re-bootstrap events during startup.
let bootingRoot = false
let bootedAt = 0
let globalBootstrapGeneration = 0
const BOOT_DEBOUNCE_MS = 1500
const RECONNECT_MESSAGE_LIMIT = 30
const SESSION_MATERIALIZATION_MESSAGE_LIMIT = 30
const ACTIVE_SESSION_WATCHDOG_INTERVAL_MS = 5_000
const ACTIVE_SESSION_STATUS_POLL_INTERVAL_MS = 5_000
const ACTIVE_SESSION_STATUS_POLL_MAX_BACKOFF_MS = 60_000
const ACTIVE_SESSION_STALE_EVENT_MS = 20_000
const ACTIVE_SESSION_FULL_RESYNC_COOLDOWN_MS = 15_000
const CHILD_SESSION_DISCOVERY_INTERVAL_MS = 15_000
const WATCHDOG_READ_MAX_BACKOFF_MS = 60_000

type DirectoryReadBackoff = Map<string, { delay: number; retryAt: number }>

function recordWatchdogReadFailure(backoff: DirectoryReadBackoff, directory: string, interval: number): void {
  const delay = Math.min((backoff.get(directory)?.delay ?? interval) * 2, WATCHDOG_READ_MAX_BACKOFF_MS)
  backoff.set(directory, { delay, retryAt: Date.now() + delay })
}

// Active-session watchdog network calls run under the shared
// background-network gate (see lib/background-network.ts). The watchdog walks
// every initialized child store each tick and fires a status poll plus a
// child-session discovery list per directory with active candidates — on
// startup with many cache-hydrated directories that is dozens of simultaneous
// requests, which would otherwise queue interactive traffic (opening a
// session) behind them on the browser's ~6 sockets per origin. Later ticks
// still cover every directory via the per-directory timestamps.

const requestSignature = (items: Array<{ id: string }> | undefined): string => {
  if (!items || items.length === 0) return ""
  return items
    .map((item) => item.id)
    .sort(cmp)
    .join("|")
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const syncSnapshotSignature = (value: unknown): string => JSON.stringify(value)

function haveEquivalentSyncSnapshots(left: unknown, right: unknown): boolean {
  return syncSnapshotSignature(left) === syncSnapshotSignature(right)
}

// ---------------------------------------------------------------------------
// Session materialization scheduler — when local message/part state is incomplete,
// fetch the canonical session snapshot and materialize messages and parts together.
// Tracked per-runtime and directory, deduplicated, and auto-expiring.
// ---------------------------------------------------------------------------

type PendingSessionMaterialization = {
  runtimeKey: string
  sessionID: string
  directory: string
  enqueuedAt: number
  request: SessionMaterializationRequest
}

const SESSION_MATERIALIZATION_COOLDOWN_MS = 5_000
const pendingSessionMaterializations = new Map<string, PendingSessionMaterialization>()

// One in-flight directory status fetch at a time, shared by the active-session
// watchdog poll and the deferred completion poll so the two cannot overlap on
// the same directory.
const statusPollingDirectories = new Set<string>()

// Directories with a child-session discovery pull in flight. Discovery now
// pages through the session list, so one pull can outlast the watchdog
// interval; two overlapping pulls would each snapshot the same pre-commit
// session list and append the same child twice.
const childDiscoveryDirectories = new Set<string>()

// Deferred completion polls awaiting their delay, keyed by directory+session so
// a burst of completing messages schedules one check.
const pendingMessageCompletionPolls = new Map<string, ReturnType<typeof setTimeout>>()

// How long to wait for the turn's own `session.idle` before spending a request.
export const MESSAGE_COMPLETION_STATUS_POLL_DELAY_MS = 750

function enqueueSessionMaterialization(
  directory: string,
  sessionID: string,
  childStores: ChildStoreManager,
  request: SessionMaterializationRequest,
) {
  if (!directory || directory === "global" || !sessionID) return
  const runtimeKey = getRuntimeKey()
  const k = getSessionMaterializationRequestKey(runtimeKey, directory, sessionID)
  const existing = pendingSessionMaterializations.get(k)
  if (existing && Date.now() - existing.enqueuedAt < SESSION_MATERIALIZATION_COOLDOWN_MS) {
    const settlementMustFollowEarlierRecovery = request.reason === "settled-running-tool"
      && existing.request.reason !== "settled-running-tool"
    if (!settlementMustFollowEarlierRecovery) return
  }

  const pending = { runtimeKey, sessionID, directory, enqueuedAt: Date.now(), request }
  pendingSessionMaterializations.set(k, pending)
  countSyncPerformance("materializationEnqueues")
  if (request.reason === "empty-assistant-message") {
    countSyncPerformance("materializationEmptyAssistantEnqueues")
  } else if (request.reason === "missing-owning-message") {
    countSyncPerformance("materializationMissingMessageEnqueues")
  } else if (request.reason === "orphan-delta" || request.reason === "missing-delta-part") {
    countSyncPerformance("materializationMissingPartEnqueues")
  } else {
    countSyncPerformance("materializationLifecycleEnqueues")
  }

  const run = async () => {
    if (pending.runtimeKey !== getRuntimeKey()) {
      if (pendingSessionMaterializations.get(k) === pending) {
        pendingSessionMaterializations.delete(k)
      }
      return
    }
    const store = childStores.getChild(directory)
    if (!store) {
      if (pendingSessionMaterializations.get(k) === pending) {
        pendingSessionMaterializations.delete(k)
      }
      return
    }
    try {
      // The gap the event saw went with the transcript the move carried:
      // recover it where the session lives now.
      const movedTo = directorySessionMovedTo(store.getState(), directory, sessionID)
      if (movedTo) {
        if (childStores.getChild(movedTo)) enqueueSessionMaterialization(movedTo, sessionID, childStores, request)
        return
      }
      if (!isSessionMaterializationStillNeeded(store.getState(), sessionID, request)) {
        countSyncPerformance("materializationPreflightSkips")
        return
      }
      countSyncPerformance("materializationRequests")
      await materializeSessionFromServer(directory, sessionID, store, {
        ...request,
        isStale: () => childStores.children.get(directory) !== store
          || pendingSessionMaterializations.get(k) !== pending,
      })
    } catch {
      // Transient failure — next SSE event or reconnect will catch up.
    } finally {
      const remainingCooldown = SESSION_MATERIALIZATION_COOLDOWN_MS - (Date.now() - pending.enqueuedAt)
      if (remainingCooldown <= 0) {
        if (pendingSessionMaterializations.get(k) === pending) {
          pendingSessionMaterializations.delete(k)
        }
      } else {
        setTimeout(() => {
          if (pendingSessionMaterializations.get(k) === pending) {
            pendingSessionMaterializations.delete(k)
          }
        }, remainingCooldown)
      }
    }
  }

  // Start after the current ordered event batch, then recheck local state
  // before issuing HTTP in case another event in the batch repaired it.
  void Promise.resolve().then(run)
}

async function materializeSessionFromServer(
  directory: string,
  sessionID: string,
  store: StoreApi<DirectoryStore>,
  options?: SessionMaterializationRequest & { isStale?: () => boolean },
) {
  const runtimeKey = getRuntimeKey()
  const sdk = opencodeClient.getSdkClient()
  const isStale = () => options?.isStale?.() || getRuntimeKey() !== runtimeKey
    || opencodeClient.getSdkClient() !== sdk
  const statusBeforeMaterialization = store.getState().session_status?.[sessionID]
  syncDebug.recovery.materializing({
    reason: options?.reason ?? "ensure-session-messages",
    directory,
    sessionID,
    messageID: options?.messageID,
    partID: options?.partID,
  })
  const loader = getImperativeSessionMessageLoader()
  if (!loader || isStale()) return
  await loader.refreshTail({ directory, sessionID }, SESSION_MATERIALIZATION_MESSAGE_LIMIT)
  if (isStale()) return
  if (loader.getSnapshot({ directory, sessionID }).status === "error") {
    throw loader.getSnapshot({ directory, sessionID }).error ?? new Error("Session materialization failed")
  }

  if (statusBeforeMaterialization && statusBeforeMaterialization.type !== "idle" && !isStale()) {
    await resyncDirectorySessionStatuses(directory, store, [sessionID], "authoritative", isStale)
  }
  if (!isStale()) {
    markRecordedInterruptedTurn(store, sessionID)
  }
}

// Module-level refs for notification viewed check.
// Used to determine if user is currently viewing the session when a notification arrives.
let _activeDirectory = ""
let _activeSession = ""
const externallyViewedSessions = new Map<string, number>()
const EXTERNAL_VIEW_TTL_MS = 15_000

const viewedSessionKey = (directory: string, sessionId: string) => `${directory}\n${sessionId}`

function pruneExternallyViewedSessions(now = Date.now()) {
  for (const [key, expiresAt] of externallyViewedSessions.entries()) {
    if (expiresAt <= now) {
      externallyViewedSessions.delete(key)
    }
  }
}
const pendingFormToastIds = new Set<string>()
const pendingPermissionToastIds = new Set<string>()
const pendingVSCodePermissionEvents = new Map<string, symbol>()

const getVSCodePermissionEventKey = (
  runtimeKey: string,
  directory: string,
  sessionID?: string,
  requestID?: string,
): string | null => {
  const requestKey = getPermissionToastKey(sessionID, requestID)
  return requestKey ? JSON.stringify([runtimeKey, directory, requestKey]) : null
}

const getFormToastKey = (sessionID?: string, requestID?: string) => {
  if (!sessionID || !requestID) return null
  return `${sessionID}:${requestID}`
}

/** A pending form has no question text on the wire — only the form's title. */
const FORM_TOAST_DESCRIPTION = "Agent is waiting for your input"

/** "Open session" on a question or permission toast also brings that request into view. */
const openRequestFromToast = (sessionID: string, directory: string, requestID: string) => {
  openSessionFromToast(sessionID, directory)
  revealRequest(requestID)
}

/** A location-scoped form names no session to open; the toast then only announces it. */
const formToastAction = (sessionID: string, directory: string, formID: string) => (
  sessionID === LOCATION_SCOPED_FORM_SESSION_ID
    ? undefined
    : { label: "Open session", onClick: () => openRequestFromToast(sessionID, directory, formID) }
)

/** Blank server strings mean "absent" here, not "empty title". */
const trimmedOrUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const notificationToastId = (kind?: string, title?: string, body?: string, tag?: string): string | undefined => {
  if (tag) return tag
  const fallback = [kind, title, body].filter(Boolean).join("|")
  return fallback || undefined
}

const showPluginNotificationToast = (kind?: string, title?: string, body?: string, tag?: string): void => {
  if (kind !== "plugin" || !title) return
  toast.info(title, {
    id: notificationToastId(kind, title, body, tag),
    description: body,
  })
}

const isUiFocused = (): boolean => (
  typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()
)

/** A window that is hidden or unfocused; without a document nobody can be away. */
const isUiAway = (): boolean => "document" in globalThis && !isUiFocused()

/**
 * OpenChamber's own notification frame: the agent-completion notice for
 * desktop, VS Code and mobile (the web surface has its own stream), plus the
 * toast raised when a managed OpenCode restart interrupted a turn.
 */
const handleUiNotificationEvent = (notification: OpenchamberNotification, fallbackDirectory: string): void => {
  const kind = trimmedOrUndefined(notification.kind)
  const sessionId = trimmedOrUndefined(notification.sessionId)
  const directory = trimmedOrUndefined(notification.directory)
    ?? (fallbackDirectory !== "global" ? fallbackDirectory : "")
  const title = trimmedOrUndefined(notification.title)
  const body = trimmedOrUndefined(notification.body)
  const tag = trimmedOrUndefined(notification.tag)

  if (kind === "opencode-restart-interrupted" || kind === "opencode-restart-resuming") {
    const dictionary = useI18nStore.getState().dictionary
    const title = formatMessage(dictionary, "chat.toast.opencodeRestartInterrupted.title")
    const options = {
      id: "opencode-restart-interrupted",
      description: formatMessage(dictionary, kind === "opencode-restart-resuming"
        ? "chat.toast.opencodeRestartInterrupted.autoResumeDescription"
        : "chat.toast.opencodeRestartInterrupted.description"),
      duration: Infinity,
    }
    if (sessionId && directory) {
      toast.info(title, {
        ...options,
        action: {
          label: formatMessage(dictionary, "chat.toast.opencodeRestartInterrupted.openSession"),
          onClick: () => openSessionFromToast(sessionId, directory),
        },
      })
    } else {
      toast.info(title, options)
    }
  } else if (notification.showWhenFocused === true && isUiFocused()) {
    showPluginNotificationToast(kind, title, body, tag)
  }

  // The local desktop shell already delivered this one natively.
  if (
    (notification.desktopNotificationDelivered === true || notification.desktopStdoutActive === true)
    && getRuntimeKey() === "local"
  ) return

  const notifications = getRegisteredRuntimeAPIs()?.notifications
  if (!notifications?.notifyAgentCompletion) return

  void notifications.notifyAgentCompletion({
    title,
    body,
    tag,
    kind,
    sessionId,
    directory: directory || undefined,
    runtimeKey: getRuntimeKey(),
    requireHidden: notification.kind === "plugin" ? true : notification.requireHidden === true,
  }).catch((error) => {
    console.warn("[notifications] failed to dispatch UI notification", error)
  })
}
>>>>>>> bc50ba56a

export function setActiveSession(directory: string, sessionId: string) {
  const previous = activeTarget
  const normalized = normalizePath(directory)
  activeTarget = normalized && sessionId ? { directory: normalized, sessionId } : null
  const loader = getImperativeSessionMessageLoader()
  if (previous) loader?.scheduleCacheRetention(previous.directory)
  if (activeTarget) loader?.touchSessionCache(activeTarget)
}
export function setExternallyViewedSession(directory: string, sessionId: string, viewed: boolean) {
  const normalized = normalizePath(directory)
  if (!normalized || !sessionId) return
  const key = `${normalized}\n${sessionId}`
  if (viewed) externallyViewedSessions.set(key, Date.now() + 15_000)
  else {
    externallyViewedSessions.delete(key)
    getImperativeSessionMessageLoader()?.scheduleCacheRetention(normalized)
  }
}

export function useSyncRuntime(): SyncRuntime {
  const runtime = useContext(SyncRuntimeContext)
  if (!runtime) throw new Error("Sync hooks require SyncProvider")
  return runtime
}
function useSyncSystem(): SyncSystem {
  const system = useContext(SyncContext)
  if (!system) throw new Error("Sync hooks require SyncProvider")
  return system
}

<<<<<<< HEAD
/** Sequence-gated directory batch: only accepted events reach global projections. */
export function handleEvents(target: SessionMessageTarget, events: readonly CanonicalEvent[], childStores: ChildStoreManager): boolean {
  const store = childStores.getChild(target.directory)
  if (!store) return false
  const original = store.getState()
  let next: State = original
  const outcomes: Array<Extract<CanonicalEvent, { type: "run.completed" | "run.failed" }>> = []
  const accepted: CanonicalEvent[] = []
  let contiguous = true
  for (const event of events) {
    if (event.sessionId !== target.sessionId) { contiguous = false; break }
    if ((event.type === "btw.delta" || event.type === "btw.completed") && next.snapshot[target.sessionId]?.session.epoch === event.epoch) {
      if (event.type === "btw.delta") useBtwStore.getState().applyEphemeralDelta(target.sessionId, event.recordId, event.delta)
      else useBtwStore.getState().completeEphemeral(target.sessionId, event.recordId, event.status === 'completed' ? 'completed' : event.status === 'cancelled' ? 'cancelled' : 'failed', event.text)
=======
// Sessions with live work of their own: non-idle status or unresolved turns and
// tools. The viewed session joins only when it is one of them. Polling an idle
// viewed session every 5 s bought nothing the event stream does not deliver,
// and over the private relay that cadence kept the relay awake for as long as a
// session stayed open on any device. The stale-stream check still covers the
// viewed session.
function getLiveSessionCandidateIds(state: DirectoryStore): string[] {
  return getReconnectCandidateSessionIds(state)
}

type DirectorySessionStatusSnapshot = NonNullable<
  Awaited<ReturnType<typeof opencodeClient.getActiveSessionStatuses>>
>

// How a `/api/session/active` snapshot is reconciled into the store.
//
// The snapshot lists only active (busy/retry) sessions across every
// directory; an absent candidate means "idle per this snapshot".
//
// - "monotonic": only confirm/raise active status. Never lowers a busy/retry
//   session to idle. Used by the periodic watchdog poll — real idle arrives via
//   SSE (session.status / session.idle) or via an authoritative resync that the
//   watchdog escalates to when it detects a stale busy entry. This keeps the
//   blind 5s poll from clobbering live state on a transient/misscoped snapshot.
// - "authoritative": treat the snapshot as ground truth — absent/idle candidates
//   are lowered to idle. Used by reconnect/escalated resyncs, a deliberate edge
//   where the live server snapshot is the source of truth (mirrors the bootstrap
//   snapshot). The snapshot wins over any derived message state here.
type StatusSnapshotMode = "monotonic" | "authoritative"

export function applySessionStatusSnapshot(
  store: StoreApi<DirectoryStore>,
  snapshot: DirectorySessionStatusSnapshot,
  candidateSessionIds: string[],
  mode: StatusSnapshotMode,
): boolean {
  if (candidateSessionIds.length === 0) return false

  let changed = false
  store.setState((state: DirectoryStore) => {
    const current = state.session_status ?? {}
    let next: Record<string, SessionStatus> | undefined
    let nextInvalidated: Record<string, true> | undefined
    const draft = () => (next ??= { ...current })

    for (const sessionId of candidateSessionIds) {
      const incoming = toSessionStatus(snapshot[sessionId])
      if (mode === "authoritative" && state.sessionStatusInvalidated?.[sessionId]) {
        // The successful snapshot supersedes the archive's discarded status.
        nextInvalidated ??= { ...state.sessionStatusInvalidated }
        delete nextInvalidated[sessionId]
        changed = true
      }

      if (incoming && incoming.type !== "idle") {
        // Confirm or raise active status (catches a busy event the SSE missed).
        // `session.active` reports a turn waiting for a retry as plain busy, so
        // its busy confirms a retry status until the attempt is due; the
        // attempt's own busy event ends it.
        const held = current[sessionId]
        if (incoming.type === "busy" && held?.type === "retry" && (held.next === undefined || held.next > Date.now())) continue
        if (!haveEquivalentSyncSnapshots(current[sessionId], incoming)) {
          draft()[sessionId] = incoming
          changed = true
        }
        continue
      }

      // Snapshot reports this candidate idle (absent, or explicit idle).
      // Monotonic never lowers; authoritative trusts the snapshot as truth,
      // except for a session whose prompt OpenCode has not admitted yet.
      if (mode === "monotonic" || hasPromptInFlight(sessionId)) continue

      const existing = current[sessionId]
      // Keep the successful snapshot distinguishable from "status has never
      // been observed".
      if (!existing || existing.type !== "idle") {
        draft()[sessionId] = { type: "idle" }
        changed = true
      }
    }

    if (!next && !nextInvalidated) return state
    const patch: Partial<DirectoryStore> = {}
    if (next) patch.session_status = next
    if (nextInvalidated) patch.sessionStatusInvalidated = nextInvalidated
    return patch
  })

  return changed
}

async function resyncDirectorySessionStatuses(
  directory: string,
  store: StoreApi<DirectoryStore>,
  candidateSessionIds: string[],
  mode: StatusSnapshotMode,
  isStale?: () => boolean,
): Promise<DirectorySessionStatusSnapshot | null> {
  const invalidatedAtStart = store.getState().sessionStatusInvalidated
  const nextStatuses = await opencodeClient.getActiveSessionStatuses(directory)
  // null = fetch failed; preserve existing state. {} or populated = a snapshot
  // of active sessions — reconciled per `mode` (absence ≠ idle under monotonic).
  if (nextStatuses === null || isStale?.()) return null
  const currentInvalidated = store.getState().sessionStatusInvalidated
  const eligibleIds = candidateSessionIds.filter((id) => (
    !currentInvalidated?.[id] || currentInvalidated === invalidatedAtStart
  ))
  applySessionStatusSnapshot(store, nextStatuses, eligibleIds, mode)
  if (mode === "authoritative") {
    store.setState({ sessionStatusReady: true })
    const state = store.getState()
    applyGlobalSessionStatusSnapshot(
      directory,
      withPromptsInFlight(selectHeldSessionStatuses(nextStatuses, state.session), state.session_status),
      getDirectoryOwnedSessionIds(directory, state.session),
    )
  }
  return nextStatuses
}

/**
 * Re-check the session status shortly after an assistant message completes.
 * The turn-ending `session.idle` event can be delayed or lost; left alone, the
 * busy spinner keeps showing until the next watchdog poll tick (up to ~5s) and
 * its escalation (up to ~10s).
 *
 * The check is deferred by `MESSAGE_COMPLETION_STATUS_POLL_DELAY_MS`, and the
 * status is read again when the timer fires: a normal turn whose `session.idle`
 * arrives inside that window settles on its own and issues no request at all.
 * Only a session the store still believes busy costs one status fetch, which
 * mirrors the watchdog escalation — the monotonic pass confirms/raises busy but
 * never lowers it, and when the snapshot reports the session idle while the
 * store still believes it busy, an authoritative resync settles the status.
 *
 * Bounded: one scheduled check per session, one in-flight status fetch per
 * directory (shared with the watchdog poll), best-effort — the watchdog poll
 * remains the backstop.
 */
export function maybePollStatusAfterMessageCompletion(
  directory: string,
  store: StoreApi<DirectoryStore>,
  sessionID: string,
): void {
  if (!directory || directory === "global" || !sessionID) return
  const current = store.getState().session_status?.[sessionID]
  if (!current || current.type === "idle") return

  const pendingKey = `${directory}\u0000${sessionID}`
  if (pendingMessageCompletionPolls.has(pendingKey)) return

  const timer = setTimeout(() => {
    pendingMessageCompletionPolls.delete(pendingKey)
    const latest = store.getState().session_status?.[sessionID]
    if (!latest || latest.type === "idle") return
    if (statusPollingDirectories.has(directory)) return

    statusPollingDirectories.add(directory)
    void (async () => {
      try {
        const statuses = await runBackgroundNetworkTask(() =>
          resyncDirectorySessionStatuses(directory, store, [sessionID], "monotonic"), "active-session")
        if (!statuses) return
        if (needsSnapshotAfterStatusPoll(store.getState(), sessionID, statuses[sessionID])) {
          await runBackgroundNetworkTask(() =>
            resyncDirectorySessionStatuses(directory, store, [sessionID], "authoritative"), "active-session")
        }
      } catch {
        // Best-effort — the watchdog poll retries on its own cadence.
      } finally {
        statusPollingDirectories.delete(directory)
      }
    })()
  }, MESSAGE_COMPLETION_STATUS_POLL_DELAY_MS)

  pendingMessageCompletionPolls.set(pendingKey, timer)
}

// After a monotonic poll, decide whether to escalate to a full authoritative
// resync: the store believes the session is active but the snapshot reports it
// idle/absent — a suspected missed idle that the monotonic poll deliberately
// won't lower on its own. The authoritative resync is the recovery path. A
// session whose prompt is still being sent is busy without being listed yet.
export function needsSnapshotAfterStatusPoll(
  state: DirectoryStore,
  sessionId: string,
  snapshotEntry: DirectorySessionStatusSnapshot[string] | undefined,
): boolean {
  const incoming = toSessionStatus(snapshotEntry)
  if (incoming && incoming.type !== "idle") return false
  if (hasPromptInFlight(sessionId)) return false
  const currentStatus = state.session_status?.[sessionId]
  return Boolean(currentStatus && currentStatus.type !== "idle")
}

// Decide whether the event stream is genuinely stale and warrants a full
// resync. Uses stream activity that includes heartbeats, so a quiet-but-
// connected session (only receiving heartbeats) is NOT considered stale.
// A stale signal means no events at all — including no heartbeats — for the
// configured threshold, which is strong evidence the connection is dead.
// Returns false when lastStreamActivityAt is 0 (no events received yet),
// so the watchdog does not fire before the stream has delivered its first
// heartbeat.
export function shouldTriggerStaleResync(
  lastStreamActivityAt: number,
  lastFullResyncAt: number,
  now: number,
  staleThresholdMs: number = ACTIVE_SESSION_STALE_EVENT_MS,
  resyncCooldownMs: number = ACTIVE_SESSION_FULL_RESYNC_COOLDOWN_MS,
): boolean {
  if (lastStreamActivityAt <= 0) return false
  if (now - lastStreamActivityAt < staleThresholdMs) return false
  if (now - lastFullResyncAt < resyncCooldownMs) return false
  return true
}

type EventRoutingIndex = {
  sessionDirectoryById: Map<string, string>
  messageSessionById: Map<string, string>
  sessionMessageIdsById: Map<string, Set<string>>
}

const SHOULD_DISPATCH_VSCODE_NOTIFICATIONS = isVSCodeRuntime()

const dispatchVSCodeRuntimeNotificationEvent = (directory: string, payload: SyncEvent) => {
  if (!SHOULD_DISPATCH_VSCODE_NOTIFICATIONS || typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("openchamber:vscode-notification-event", {
    detail: { directory, payload },
  }))
}

export const createEventRoutingIndex = (): EventRoutingIndex => ({
  sessionDirectoryById: new Map(),
  messageSessionById: new Map(),
  sessionMessageIdsById: new Map(),
})

const normalizeEventDirectory = (rawDirectory: string): string => {
  if (!rawDirectory || rawDirectory === "global") {
    return rawDirectory
  }
  const normalized = rawDirectory.replace(/\\/g, "/").replace(/^([a-z]):/, (_, l: string) => l.toUpperCase() + ":")
  // Strip trailing slashes to match child store keys (normalizeDirectoryPath in useDirectoryStore)
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized
}

/** Part-bearing events: the store slice they touch is `part`, keyed by message. */
const isPartEvent = (type: SyncEvent["type"]): boolean => (
  type === "message.part.updated"
  || type === "message.part.delta"
  || type === "message.tool.transition"
  || type === "message.parts.replaced"
)

const setIndexedSessionDirectory = (routingIndex: EventRoutingIndex, sessionID: string, directory: string) => {
  if (!sessionID || !directory || directory === "global") {
    return
  }
  routingIndex.sessionDirectoryById.set(sessionID, directory)
}

const setIndexedSessionMessages = (
  routingIndex: EventRoutingIndex,
  sessionID: string,
  directory: string,
  messages: Message[],
) => {
  if (!sessionID) {
    return
  }

  setIndexedSessionDirectory(routingIndex, sessionID, directory)

  const previous = routingIndex.sessionMessageIdsById.get(sessionID)
  const next = new Set<string>()

  for (const message of messages) {
    if (!message?.id) {
      continue
    }
    next.add(message.id)
    routingIndex.messageSessionById.set(message.id, sessionID)
  }

  if (previous) {
    for (const previousMessageID of previous) {
      if (!next.has(previousMessageID)) {
        routingIndex.messageSessionById.delete(previousMessageID)
      }
    }
  }

  routingIndex.sessionMessageIdsById.set(sessionID, next)
}

const setIndexedMessage = (
  routingIndex: EventRoutingIndex,
  sessionID: string,
  messageID: string,
  directory: string,
) => {
  if (!sessionID || !messageID) {
    return
  }

  setIndexedSessionDirectory(routingIndex, sessionID, directory)
  routingIndex.messageSessionById.set(messageID, sessionID)

  const existing = routingIndex.sessionMessageIdsById.get(sessionID)
  if (existing) {
    existing.add(messageID)
  } else {
    routingIndex.sessionMessageIdsById.set(sessionID, new Set([messageID]))
  }
}

const removeIndexedMessage = (
  routingIndex: EventRoutingIndex,
  messageID: string,
  sessionHint?: string | null,
) => {
  if (!messageID) {
    return
  }

  const sessionID = sessionHint ?? routingIndex.messageSessionById.get(messageID)
  routingIndex.messageSessionById.delete(messageID)

  if (!sessionID) {
    return
  }

  const messageIds = routingIndex.sessionMessageIdsById.get(sessionID)
  if (!messageIds) {
    return
  }

  messageIds.delete(messageID)
  if (messageIds.size === 0) {
    routingIndex.sessionMessageIdsById.delete(sessionID)
  }
}

const removeIndexedSession = (routingIndex: EventRoutingIndex, sessionID: string) => {
  if (!sessionID) {
    return
  }

  routingIndex.sessionDirectoryById.delete(sessionID)
  const messageIds = routingIndex.sessionMessageIdsById.get(sessionID)
  if (messageIds) {
    for (const messageID of messageIds) {
      routingIndex.messageSessionById.delete(messageID)
    }
  }
  routingIndex.sessionMessageIdsById.delete(sessionID)
}

const ingestDirectoryStateIntoRoutingIndex = (
  routingIndex: EventRoutingIndex,
  directory: string,
  state: State,
) => {
  const nextSessionIds = new Set<string>()

  for (const session of state.session) {
    if (!session?.id) {
      continue
    }
    nextSessionIds.add(session.id)
    setIndexedSessionDirectory(routingIndex, session.id, directory)
  }

  for (const sessionID of Object.keys(state.message)) {
    nextSessionIds.add(sessionID)
    setIndexedSessionDirectory(routingIndex, sessionID, directory)
    setIndexedSessionMessages(routingIndex, sessionID, directory, state.message[sessionID] ?? EMPTY_MESSAGES)
  }

  for (const [indexedSessionID, indexedDirectory] of routingIndex.sessionDirectoryById) {
    if (indexedDirectory !== directory) {
      continue
    }
    if (!nextSessionIds.has(indexedSessionID)) {
      removeIndexedSession(routingIndex, indexedSessionID)
    }
  }
}

const findSessionInChildStores = (
  sessionID: string,
  childStores: ChildStoreManager,
  routingIndex: EventRoutingIndex,
  batch?: DirectoryEventBatch,
): string | null => {
  for (const [dir, store] of childStores.children) {
    const state = getDirectoryEventState(store, batch)
    if (
      state.session.some((s) => s.id === sessionID)
      || Object.prototype.hasOwnProperty.call(state.message, sessionID)
      || Object.prototype.hasOwnProperty.call(state.session_status ?? {}, sessionID)
    ) {
      // Self-heal: populate the routing index so future events resolve instantly
      setIndexedSessionDirectory(routingIndex, sessionID, dir)
      return dir
    }
  }
  return null
}

const childStoreHasSessionState = (
  childStores: ChildStoreManager,
  directory: string,
  sessionID: string,
  batch?: DirectoryEventBatch,
): boolean => {
  const store = childStores.getChild(directory)
  if (!store) return false
  const state = getDirectoryEventState(store, batch)
  return state.session.some((session) => session.id === sessionID)
    || Object.prototype.hasOwnProperty.call(state.message, sessionID)
    || Object.prototype.hasOwnProperty.call(state.session_status ?? {}, sessionID)
}

const childStoreHasMessagePartState = (
  childStores: ChildStoreManager,
  directory: string,
  messageID: string,
  batch?: DirectoryEventBatch,
): boolean => {
  const store = childStores.getChild(directory)
  if (!store) return false
  return Object.prototype.hasOwnProperty.call(getDirectoryEventState(store, batch).part, messageID)
}

const getActiveDirectoryFallback = (
  childStores: ChildStoreManager,
  sessionID?: string | null,
): string | null => {
  if (!_activeDirectory || !_activeSession) return null
  if (sessionID && sessionID !== _activeSession) return null
  return childStores.getChild(_activeDirectory) ? _activeDirectory : null
}

const resolveCachedSessionDirectory = (sessionID: string): string | null => {
  const session = useGlobalSessionsStore.getState().entityById.get(sessionID)
  return session ? resolveGlobalSessionDirectory(session) : null
}

const isBlockingRequestEvent = (payload: SyncEvent): boolean => (
  payload.type === "permission.asked"
  || payload.type === "permission.replied"
  || payload.type === "form.created"
  || payload.type === "form.settled"
)

/**
 * Where the session went when it left this directory: the store removed it and
 * no longer lists it, and the global list names another directory. Null while
 * it still belongs here. Events about the move itself still name the directory
 * it left, and reading the session back there leaves a copy that later
 * location-less events are routed to.
 */
const directorySessionMovedTo = (state: State, directory: string, sessionID: string): string | null => {
  if (state.sessionDeletedRevision?.[sessionID] === undefined) return null
  if (state.session.some((session) => session.id === sessionID)) return null
  const ownDirectory = resolveCachedSessionDirectory(sessionID)
  if (ownDirectory === null) return null
  return normalizeEventDirectory(ownDirectory) === normalizeEventDirectory(directory) ? null : ownDirectory
}

const resolveDirectoryFromRoutingIndex = (
  routingIndex: EventRoutingIndex,
  rawDirectory: string,
  payload: SyncEvent,
  childStores: ChildStoreManager,
  batch?: DirectoryEventBatch,
): string => {
  const normalizedDirectory = normalizeEventDirectory(rawDirectory)

  // A location-scoped form names the "global" sentinel, not a session: no
  // store lists it, and indexing it would file the next directory's
  // elicitation into the first one's store. Its own directory tag routes it.
  const addressedSessionID = syncEventSessionID(payload)
  const sessionID = addressedSessionID === LOCATION_SCOPED_FORM_SESSION_ID ? undefined : addressedSessionID
  if (sessionID) {
    if (normalizedDirectory && normalizedDirectory !== "global" && childStoreHasSessionState(childStores, normalizedDirectory, sessionID, batch)) {
      setIndexedSessionDirectory(routingIndex, sessionID, normalizedDirectory)
      return normalizedDirectory
    }

    // The chat reads a session's permissions and forms from the store of the
    // directory it lives in. OpenCode can send `permission.asked` without a
    // location, and holding the session proves little: a store the session
    // moved out of gets a copy back when that directory is read again later
    // (a stream reconnect, opening it), and that read points the index at it.
    if (isBlockingRequestEvent(payload) && (!normalizedDirectory || normalizedDirectory === "global")) {
      const ownDirectory = resolveCachedSessionDirectory(sessionID)
      if (ownDirectory && childStores.getChild(ownDirectory)) {
        setIndexedSessionDirectory(routingIndex, sessionID, ownDirectory)
        return ownDirectory
      }
    }

    const indexedDirectory = routingIndex.sessionDirectoryById.get(sessionID)
    if (indexedDirectory && childStores.getChild(indexedDirectory)) {
      return indexedDirectory
    }

    // Routing index miss — scan child stores for this session.
    // Covers optimistic sessions not yet indexed and events with wrong/empty directory.
    const found = findSessionInChildStores(sessionID, childStores, routingIndex, batch)
    if (found) {
      return found
    }

    // Unopened directories have no store, so a session the global cache lists
    // for one of them is routed to that recorded directory. Without this, the
    // active-session and single-store fallbacks below would file another
    // project's events into whichever directory happens to be open.
    const cachedDirectory = resolveCachedSessionDirectory(sessionID)
    if (cachedDirectory) {
      return cachedDirectory
    }

    // The global stream does not always include a directory. During a session
    // transition, its routing index can lag the active session briefly; route
    // a session-addressed event only when that session is the one being viewed.
    const activeDirectory = getActiveDirectoryFallback(childStores, sessionID)
    if (activeDirectory) {
      return activeDirectory
    }
  }

  const messageID = syncEventMessageID(payload)
  if (messageID) {
    if (normalizedDirectory && normalizedDirectory !== "global" && childStoreHasMessagePartState(childStores, normalizedDirectory, messageID, batch)) {
      return normalizedDirectory
    }

    const sessionFromMessage = routingIndex.messageSessionById.get(messageID)
    if (sessionFromMessage) {
      const indexedDirectory = routingIndex.sessionDirectoryById.get(sessionFromMessage)
      if (indexedDirectory && childStores.getChild(indexedDirectory)) {
        return indexedDirectory
      }
    }

    // Scan child stores for a store that has parts for this message
    for (const [dir, store] of childStores.children) {
      if (Object.prototype.hasOwnProperty.call(getDirectoryEventState(store, batch).part, messageID)) {
        return dir
      }
    }

    // Some reconnect/idle gaps can deliver part events before the matching
    // message.updated event and without a sessionID. If the user is actively
    // viewing a session, route the orphaned part event there so the reducer can
    // trigger HTTP materialization instead of dropping it as a global event.
    const activeDirectory = getActiveDirectoryFallback(childStores)
    if (activeDirectory) {
      return activeDirectory
    }
  }

  // Single-store fallback: if there's only one directory, use it
  if (
    (addressedSessionID || messageID)
    && (!normalizedDirectory || normalizedDirectory === "global")
    && childStores.children.size === 1
  ) {
    const onlyDirectory = childStores.children.keys().next().value
    if (typeof onlyDirectory === "string" && onlyDirectory.length > 0) {
      return onlyDirectory
    }
  }

  return normalizedDirectory
}

const resolveMaterializationSessionID = (
  materializationSessionID: string | undefined,
  messageID: string | undefined,
  resolvedDirectory: string,
  routingIndex: EventRoutingIndex,
): string | undefined => {
  if (materializationSessionID) return materializationSessionID
  if (messageID) {
    const indexedSessionID = routingIndex.messageSessionById.get(messageID)
    if (indexedSessionID) return indexedSessionID
  }
  if (resolvedDirectory && resolvedDirectory === _activeDirectory && _activeSession) {
    return _activeSession
  }
  return undefined
}

const updateRoutingIndexFromEvent = (
  routingIndex: EventRoutingIndex,
  directory: string,
  payload: SyncEvent,
) => {
  if (!directory || directory === "global") {
    return
  }

  const sessionID = syncEventSessionID(payload)
  if (sessionID && sessionID !== LOCATION_SCOPED_FORM_SESSION_ID) {
    setIndexedSessionDirectory(routingIndex, sessionID, directory)
  }

  switch (payload.type) {
    case "session.created":
      setIndexedSessionDirectory(routingIndex, payload.properties.info.id, directory)
      return

    case "session.deleted":
      removeIndexedSession(routingIndex, payload.properties.sessionID)
      return

    case "message.updated": {
      const { info } = payload.properties
      setIndexedMessage(routingIndex, info.sessionID, info.id, directory)
      return
    }

    case "message.removed": {
      const { sessionID, messageID } = payload.properties
      removeIndexedMessage(routingIndex, messageID, sessionID)
      return
    }

    case "message.part.updated": {
      const { part } = payload.properties
      setIndexedMessage(routingIndex, part.sessionID ?? payload.properties.sessionID, part.messageID, directory)
      return
    }

    case "message.part.delta":
    case "message.tool.transition":
    case "message.parts.replaced":
      setIndexedMessage(routingIndex, payload.properties.sessionID, payload.properties.messageID, directory)
      return

    default:
      return
  }
}

/**
 * Re-fetch pending forms and permissions for a directory and merge them
 * into the directory's child store, preserving any in-flight SSE updates that
 * arrived while the request was pending. Used by reconnect/materialization
 * recovery paths only; normal session switches rely on primary SSE reducer
 * state for `form.created` / `permission.asked` events. When
 * `candidateSessionIds` is omitted, every session known to the directory store
 * is treated as a candidate; when provided, recovery is limited to those IDs.
 */
export async function resyncBlockingRequestsForDirectory(
  directory: string,
  store: StoreApi<DirectoryStore>,
  candidateSessionIds?: string[],
  options?: { includePermissions?: boolean },
) {
  const isCurrentRuntime = captureRuntimeInstance()
  const before = store.getState()
  const candidateIds = new Set<string>(candidateSessionIds ?? [
    ...before.session.map((session) => session.id),
    ...Object.keys(before.message ?? {}),
    ...Object.keys(before.session_status ?? {}),
    ...Object.keys(before.form ?? {}),
    ...Object.keys(before.permission ?? {}),
  ])
  if (candidateIds.size === 0) return true
  const candidates = Array.from(candidateIds)
  let succeeded = true

  // Re-fetch pending forms that may have been asked during an SSE gap,
  // reconnect window, or directory materialization gap.
  try {
    const beforeSignatures = new Map(
      candidates.map((sessionId) => [sessionId, requestSignature(before.form[sessionId])]),
    )
    const pendingForms = await opencodeClient.listPendingForms({ directories: [directory] })
    if (!isCurrentRuntime()) return false
    noteQuestionFormSnapshot(directory, pendingForms)
    const grouped: Record<string, FormRequest[]> = {}
    for (const form of pendingForms) {
      if (!form?.id || !form.sessionID) continue
      if (!candidateIds.has(form.sessionID)) continue
      const list = grouped[form.sessionID]
      if (list) list.push(form)
      else grouped[form.sessionID] = [form]
    }
    for (const sessionId of Object.keys(grouped)) {
      grouped[sessionId].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    }

    for (const [sessionId, forms] of Object.entries(grouped)) {
      const knownIds = new Set((before.form[sessionId] ?? []).map((item) => item.id))
      const isViewed = isViewedInCurrentSession(directory, sessionId)
      if (isViewed) continue
      for (const form of forms) {
        if (knownIds.has(form.id)) continue
        const toastKey = getFormToastKey(sessionId, form.id)
        if (!toastKey || pendingFormToastIds.has(toastKey)) continue
        pendingFormToastIds.add(toastKey)
        toast.info(form.title, {
          id: `form-${toastKey}`,
          description: FORM_TOAST_DESCRIPTION,
          action: formToastAction(sessionId, directory, form.id),
        })
      }
    }

    store.setState((state: DirectoryStore) => {
      const merged = { ...state.form }
      for (const [sessionId, forms] of Object.entries(grouped)) {
        merged[sessionId] = forms
      }
      for (const sessionId of candidates) {
        if (grouped[sessionId]) continue
        const beforeSignature = beforeSignatures.get(sessionId) ?? ""
        const currentSignature = requestSignature(state.form[sessionId])
        if (currentSignature !== beforeSignature) continue
        delete merged[sessionId]
      }
      return { form: merged }
    })
  } catch {
    // Non-fatal: form resync best-effort
    succeeded = false
  }

  if (options?.includePermissions === false) return succeeded

  // Re-fetch pending permissions — same rationale as forms.
  try {
    const beforeSignatures = new Map(
      candidates.map((sessionId) => [sessionId, requestSignature(before.permission[sessionId])]),
    )
    const pendingPermissions = await opencodeClient.listPendingPermissions({ directories: [directory] })
    if (!isCurrentRuntime()) return false
    const grouped: Record<string, PermissionRequest[]> = {}
    for (const permission of pendingPermissions) {
      if (!permission?.id || !permission.sessionID) continue
      if (!candidateIds.has(permission.sessionID)) continue
      const list = grouped[permission.sessionID]
      if (list) list.push(permission)
      else grouped[permission.sessionID] = [permission]
    }
    for (const sessionId of Object.keys(grouped)) {
      grouped[sessionId].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    }

    if (isVSCodeRuntime()) {
      const acceptedIdsBySession = new Map<string, Set<string>>()
      await Promise.all(Object.entries(grouped).flatMap(([sessionId, permissions]) =>
        permissions.map(async (permission) => {
          if (!(await processVSCodeReconciledPermissionAutoAccept(permission, directory))) return
          const accepted = acceptedIdsBySession.get(sessionId) ?? new Set<string>()
          accepted.add(permission.id)
          acceptedIdsBySession.set(sessionId, accepted)
        }),
      ))

      for (const sessionId of Object.keys(grouped)) {
        const acceptedIds = acceptedIdsBySession.get(sessionId)
        if (!acceptedIds) continue
        const remaining = (grouped[sessionId] ?? []).filter((permission) => !acceptedIds.has(permission.id))
        if (remaining.length > 0) grouped[sessionId] = remaining
        else delete grouped[sessionId]
      }
    }

    for (const [sessionId, permissions] of Object.entries(grouped)) {
      const knownIds = new Set((before.permission[sessionId] ?? []).map((item) => item.id))
      const isViewed = isViewedInCurrentSession(directory, sessionId)
      if (isViewed) continue
      for (const permission of permissions) {
        if (knownIds.has(permission.id)) continue
        showPermissionNeededToast({
          permission,
          directory,
          isViewed,
          pendingIds: pendingPermissionToastIds,
          show: (title, options) => toast.info(title, options),
          openSession: openRequestFromToast,
        })
      }
    }

    store.setState((state: DirectoryStore) => {
      const merged = { ...state.permission }
      for (const [sessionId, permissions] of Object.entries(grouped)) {
        merged[sessionId] = permissions
      }
      for (const sessionId of candidates) {
        if (grouped[sessionId]) continue
        const beforeSignature = beforeSignatures.get(sessionId) ?? ""
        const currentSignature = requestSignature(state.permission[sessionId])
        if (currentSignature !== beforeSignature) continue
        delete merged[sessionId]
      }
      return { permission: merged }
    })
  } catch {
    // Non-fatal: permission resync best-effort
    succeeded = false
  }
  return succeeded
}

export async function resyncBlockingRequestsForActiveDirectory(
  directory: string,
  childStores: ChildStoreManager,
) {
  const store = childStores.getChild(directory)
  if (!store) return
  await resyncBlockingRequestsForDirectory(directory, store)
}

async function resyncDirectoryAfterReconnect(
  directory: string,
  store: StoreApi<DirectoryStore>,
  routingIndex: EventRoutingIndex,
  reason: SessionMaterializationReason,
  isStale: () => boolean,
) {
  if (isStale()) return
  const current = store.getState()
  const candidateSessionIds = getActiveSessionCandidateIds(directory, current)
  if (candidateSessionIds.length === 0) return true

  const statuses = await resyncDirectorySessionStatuses(directory, store, candidateSessionIds, "authoritative", isStale)
  let succeeded = statuses !== null
  if (isStale()) return

  await Promise.all(candidateSessionIds.map(async (sessionId) => {
    syncDebug.recovery.materializing({ reason, directory, sessionID: sessionId })
    const loader = getImperativeSessionMessageLoader()
    const [session] = await Promise.all([
      retry(() => opencodeClient.getSession(sessionId, directory)).catch(() => null),
      loader?.refreshTail({ directory, sessionID: sessionId }, RECONNECT_MESSAGE_LIMIT) ?? Promise.resolve(),
    ])
    if (isStale()) return
    if (!session || loader?.getSnapshot({ directory, sessionID: sessionId }).status === "error") succeeded = false
    markRecordedInterruptedTurn(store, sessionId)
    if (!session) return

    const nextSession = stripSessionDiffSnapshots(session)
    store.setState((state: DirectoryStore) => {
      const sessions = upsertSessionRecord(state.session, nextSession)
      let sessionTotal = state.sessionTotal

      if (sessions === state.session) {
        return state
      }
      if (!state.session.some((item) => item.id === nextSession.id) && !nextSession.parentID) sessionTotal += 1

      return {
        session: sessions,
        sessionTotal,
      }
    })

    setIndexedSessionDirectory(routingIndex, nextSession.id, directory)
    setIndexedSessionMessages(routingIndex, sessionId, directory, store.getState().message[sessionId] ?? [])
  }))

  if (isStale()) return
  const blockingRequestsSucceeded = await resyncBlockingRequestsForDirectory(directory, store, candidateSessionIds)

  if (isStale()) return
  ingestDirectoryStateIntoRoutingIndex(routingIndex, directory, store.getState())
  return succeeded && blockingRequestsSucceeded
}

/**
 * A deferred store that looked idle before a stream gap may own a session
 * that started a turn, or asked a permission or form, during it. OpenCode's
 * active-session list is global, so one read finds those stores without
 * reading any directory. A failed read leaves them deferred as before.
 */
async function refreshStoresActiveAfterGap(childStores: ChildStoreManager): Promise<void> {
  const runtime = { key: getRuntimeKey(), sdk: opencodeClient.getSdkClient() }
  const active = await opencodeClient.getActiveSessionStatuses()
  if (!active || !isCatalogRuntimeCurrent(runtime)) return
  childStores.refreshStaleDirectoriesWithActiveSessions(new Set(Object.keys(active)))
}

type CatalogRuntime = { key: string; sdk: ReturnType<typeof opencodeClient.getSdkClient> }

const isCatalogRuntimeCurrent = (runtime: CatalogRuntime): boolean =>
  runtime.key === getRuntimeKey() && runtime.sdk === opencodeClient.getSdkClient()

/**
 * OpenCode reports a catalog change (`config.updated`, `agent.updated`, ...)
 * without saying what changed, so the affected slice is re-read rather than
 * patched. Config resolves per directory, so each directory the change was
 * announced for refreshes its own copy; projects are global.
 *
 * Only those directories: a directory-scoped read makes OpenCode start that
 * location, MCP servers included, so re-reading every directory with a store
 * started every project in the sidebar the first time one of them announced
 * its catalog. A directory OpenCode names in an event is already running.
 *
 * The sync stores only hold what chat needs; the Settings lists and the
 * composer read their own stores, which `refreshStoresForCatalogKinds` refreshes
 * once for the entire burst.
 */
async function reloadCatalog(
  kind: CatalogKind,
  childStores: ChildStoreManager,
  eventDirectories: readonly string[],
  runtime: CatalogRuntime,
): Promise<void> {
  if (!isCatalogRuntimeCurrent(runtime)) return
  // Before anything re-reads: a fresh GET must not be served the config the
  // client cached seconds ago.
  if (kind === "config") opencodeClient.clearConfigCache()

  if (kind === "project") {
    const projects = await opencodeClient.listProjects().catch(() => null)
    if (isCatalogRuntimeCurrent(runtime) && projects) {
      useGlobalSyncStore.getState().actions.set({ projects })
    }
    return
  }
  // Config is the only catalog the directory stores hold. Agents, commands,
  // providers and the rest live in the stores their consumers read, which
  // `refreshStoresForCatalogKinds` refreshes once for the entire burst.
  if (kind !== "config") return

  await Promise.all(eventDirectories.map(async (directory) => {
    const store = childStores.getChild(directory)
    if (!store) return
    if (!isCatalogRuntimeCurrent(runtime)) return
    try {
      const config = await opencodeClient.getConfig(directory)
      if (!isCatalogRuntimeCurrent(runtime)) return
      store.setState({ config })
      emitSyncConfigChanged(directory, config)
    } catch {
      // Best-effort: the next catalog event or bootstrap re-reads it.
    }
  }))
}

/**
 * One saved file makes v2 rebuild several catalogs, so the events arrive in a
 * burst. Collect the kinds and the directories they name, and re-read once the
 * burst settles; the lists are whole-slice reads, so a later event supersedes
 * an earlier one of the same kind anyway. An event without a location (a
 * credential change) re-reads the current directory.
 */
const CATALOG_RELOAD_DEBOUNCE_MS = 250
const pendingCatalogReloads = new Map<CatalogKind, Set<string>>()
const pendingCatalogCurrentKinds = new Set<CatalogKind>()
let pendingCatalogRuntime: CatalogRuntime | null = null
let catalogReloadTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCatalogReload(
  kind: CatalogKind,
  childStores: ChildStoreManager,
  directory: string | null,
): void {
  const runtime = { key: getRuntimeKey(), sdk: opencodeClient.getSdkClient() }
  markConfigCatalogStale(kind, directory)
  // A space folder groups its models under its host project's providers: an event there makes
  // that folder's catalog stale as well, so a visit re-reads it.
  if (directory) for (const spaceFolder of spaceFoldersOfProject(directory)) markConfigCatalogStale(kind, spaceFolder)
  if (pendingCatalogRuntime && !isCatalogRuntimeCurrent(pendingCatalogRuntime)) {
    pendingCatalogReloads.clear()
    pendingCatalogCurrentKinds.clear()
  }
  pendingCatalogRuntime = runtime
  const directories = pendingCatalogReloads.get(kind) ?? new Set<string>()
  if (directory) directories.add(directory)
  else pendingCatalogCurrentKinds.add(kind)
  pendingCatalogReloads.set(kind, directories)
  if (catalogReloadTimer) clearTimeout(catalogReloadTimer)
  catalogReloadTimer = setTimeout(() => {
    catalogReloadTimer = null
    const scheduledRuntime = pendingCatalogRuntime
    pendingCatalogRuntime = null
    const reloads = [...pendingCatalogReloads.entries()]
    const currentKinds = new Set(pendingCatalogCurrentKinds)
    pendingCatalogReloads.clear()
    pendingCatalogCurrentKinds.clear()
    if (!scheduledRuntime || !isCatalogRuntimeCurrent(scheduledRuntime)) return
    const currentDirectory = opencodeClient.getDirectory()
    for (const [pendingKind, pendingDirectories] of reloads) {
      if (currentKinds.has(pendingKind) && currentDirectory) pendingDirectories.add(currentDirectory)
      void reloadCatalog(pendingKind, childStores, [...pendingDirectories], scheduledRuntime)
    }
    void refreshStoresForCatalogKinds(new Map([...reloads].map(([kind, directories]) => [kind, [...directories]])))
  }, CATALOG_RELOAD_DEBOUNCE_MS)
}

/**
 * OpenCode starts a location's MCP servers asynchronously and announces each
 * server's status as it settles, in the location it runs in. A status read
 * moments after the location started holds `pending` until that announcement
 * re-reads it. One re-read per directory once the burst settles.
 */
const MCP_STATUS_REFRESH_DEBOUNCE_MS = 250
const mcpStatusRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleMcpStatusRefresh(directory: string): void {
  if (dormantLocations.has(directory)) return
  const pending = mcpStatusRefreshTimers.get(directory)
  if (pending) clearTimeout(pending)
  mcpStatusRefreshTimers.set(directory, setTimeout(() => {
    mcpStatusRefreshTimers.delete(directory)
    void useMcpStore.getState().refreshIfHeld(directory)
  }, MCP_STATUS_REFRESH_DEBOUNCE_MS))
}

function cancelMcpStatusRefresh(directory: string): void {
  const pending = mcpStatusRefreshTimers.get(directory)
  if (pending) clearTimeout(pending)
  mcpStatusRefreshTimers.delete(directory)
}

function forgetMcpStatus(directory: string): void {
  cancelMcpStatusRefresh(directory)
  useMcpStore.getState().forgetDirectory(directory)
}

/**
 * Directories on screen whose location OpenCode shut down while the window was
 * hidden or unfocused. Their bootstrap waits for the user to come back: an app
 * left open overnight would otherwise restart the directory and all its MCP
 * servers every hour, right after each idle shutdown. Their MCP status is not
 * re-read meanwhile, for the same reason.
 */
const dormantLocations = new Set<string>()

export function wakeDormantLocations(childStores: ChildStoreManager, currentDirectory: string | null | undefined): void {
  for (const directory of dormantLocations) {
    if (directory !== currentDirectory) {
      forgetMcpStatus(directory)
>>>>>>> bc50ba56a
      continue
    }
    if (event.type === "btw.delta" || event.type === "btw.completed") continue
    if (event.type === "subagent.updated") {
      useSubagentsStore.getState().applySubagentUpdate(target.sessionId, event.subagent);
      continue;
    }
<<<<<<< HEAD
    if (event.type === "session.recap") {
      useSessionRecapStore.getState().applyRecap(event);
      continue;
=======
    void useMcpStore.getState().refreshIfHeld(directory)
  }
  dormantLocations.clear()
}

// Only top-level sessions raise notifications. The directory store knows the
// parent when the directory is open; the global cache covers the rest.
const isSubtaskSession = (
  sessionID: string,
  directory: string,
  childStores: ChildStoreManager,
  batch?: DirectoryEventBatch,
): boolean => {
  const store = childStores.getChild(directory)
  const stored = store ? getDirectoryEventState(store, batch).session.find((s) => s.id === sessionID) : undefined
  const session = stored ?? useGlobalSessionsStore.getState().entityById.get(sessionID)
  return Boolean(session?.parentID)
}

const notifyPermissionAsked = (permission: PermissionRequest, directory: string): void => {
  showPermissionNeededToast({
    permission,
    directory,
    isViewed: isViewedInCurrentSession(directory, permission.sessionID),
    pendingIds: pendingPermissionToastIds,
    show: (title, options) => toast.info(title, options),
    openSession: openRequestFromToast,
  })
}

/**
 * Whether the server answers this session's requests without the user: `auto`
 * always, `safety` while the safety net can run.
 */
const isAnsweredWithoutUser = (sessionID: string): boolean => {
  const mode = usePermissionStore.getState().getSessionMode(sessionID)
  return mode === "auto" || (mode === "safety" && selectSafetyNetAvailable(useRoutingStore.getState()))
}

// A request the server may answer on its own stays out of sight: no card, no
// badge, no toast, so an accepted one never flashes. It is replayed as an
// `ask` request when the server reports it left the request for the user
// (`openchamber.permission-left-for-user`: the safety net held it, Jev failed,
// or the reply did not go through), and dropped when it is answered.
const MAX_EARLY_LEFT_FOR_USER = 100
// Keyed by session and request, so a report names the request of its own session only.
const permissionsAwaitingAutoAnswer = new Map<string, () => void>()
// Reports that arrived before their request: the request is shown at once.
const leftForUserBeforeAsked = new Set<string>()
const autoAnswerKey = (sessionID: string, permissionID: string) => `${sessionID}\n${permissionID}`

/** Whether a fresh `permission.asked` will be held back until the server rules on it. */
const isHeldUntilAutoAnswered = (permission: PermissionRequest): boolean =>
  !leftForUserBeforeAsked.has(autoAnswerKey(permission.sessionID, permission.id)) && !isVSCodeRuntime() && isAnsweredWithoutUser(permission.sessionID)

/** Hold `permission.asked` back until the server rules on it, when it may answer it. */
const holdBackUntilAutoAnswered = (permission: PermissionRequest, replayAsAsk: () => void): boolean => {
  const key = autoAnswerKey(permission.sessionID, permission.id)
  if (leftForUserBeforeAsked.delete(key)) return false
  if (!isHeldUntilAutoAnswered(permission)) return false
  permissionsAwaitingAutoAnswer.set(key, replayAsAsk)
  return true
}

const showPermissionLeftForUser = (
  { permissionId, sessionId, directory, spaceId }: Extract<SyncEvent, { type: "openchamber.permission-left-for-user" }>["properties"],
): void => {
  // A report the host forwarded from a space speaks only for a session of that space.
  if (spaceId && spaceIdOfDirectory(useSessionUIStore.getState().getDirectoryForSession(sessionId)) !== spaceId) return
  const key = autoAnswerKey(sessionId, permissionId)
  const replayAsAsk = permissionsAwaitingAutoAnswer.get(key)
  if (replayAsAsk) {
    permissionsAwaitingAutoAnswer.delete(key)
    replayAsAsk()
    return
  }
  // Already on screen: shown as an `ask` request, or loaded by a resync.
  if (directory && getDirectoryState(directory)?.permission[sessionId]?.some((entry) => entry.id === permissionId)) return
  leftForUserBeforeAsked.add(key)
  const oldest = leftForUserBeforeAsked.values().next()
  if (leftForUserBeforeAsked.size > MAX_EARLY_LEFT_FOR_USER && !oldest.done) leftForUserBeforeAsked.delete(oldest.value)
}

const permissionReplayAsAsk = (
  rawDirectory: string,
  payload: SyncEvent,
  childStores: ChildStoreManager,
  routingIndex: EventRoutingIndex,
  expectedRuntimeKey: string,
  streamingDirectory: string | undefined,
) => () => {
  if (expectedRuntimeKey !== getRuntimeKey()) return
  // The first pass kept the held request out of the cross-directory index too,
  // so the replay applies global effects and the sidebar badge appears now.
  handleEvent(rawDirectory, payload, childStores, routingIndex, expectedRuntimeKey, true, streamingDirectory, undefined, false)
}

const forgetAutoAnswerWait = (sessionID: string, permissionID: string): void => {
  permissionsAwaitingAutoAnswer.delete(autoAnswerKey(sessionID, permissionID))
  leftForUserBeforeAsked.delete(autoAnswerKey(sessionID, permissionID))
}

const notifyFormCreated = (form: FormRequest, directory: string): void => {
  const sessionID = form.sessionID
  const toastKey = getFormToastKey(sessionID, form.id)
  if (isViewedInCurrentSession(directory, sessionID) || !toastKey || pendingFormToastIds.has(toastKey)) return
  pendingFormToastIds.add(toastKey)
  toast.info(form.title, {
    id: `form-${toastKey}`,
    description: FORM_TOAST_DESCRIPTION,
    action: formToastAction(sessionID, directory, form.id),
  })
}

/**
 * The in-app toast a form gets, for a page an agent showed that waits for the
 * user's answer: shown while the user looks at another session, dismissed
 * once the page stops waiting. The native notification comes from the server.
 */
const notifyWaitingPage = (event: Extract<SyncEvent, { type: "openchamber.page-waiting" }>): void => {
  const { sessionID, page } = event.properties
  const directory = event.properties.directory ?? resolveCachedSessionDirectory(sessionID)
  if (!directory || isViewedInCurrentSession(directory, sessionID)) return
  toast.info(page.title, {
    id: `page-${sessionID}:${page.id}`,
    description: FORM_TOAST_DESCRIPTION,
    action: {
      label: "Open session",
      onClick: () => {
        revealWaitingPage(sessionID)
        openSessionFromToast(sessionID, directory)
      },
    },
  })
}

// Blocking requests in a directory without a store still deserve the in-app
// toast: the sidebar row and tray approvals need the directory store, but the
// toast only needs the request and where to open it. VS Code keeps its
// extension-host auto-accept path, which runs on the store branch only.
const notifyBlockingRequestWithoutStore = (payload: SyncEvent, directory: string, replayAsAsk: (() => void) | null): void => {
  if (isVSCodeRuntime()) return
  if (payload.type === "permission.asked") {
    const permission = payload.properties
    if (replayAsAsk && holdBackUntilAutoAnswered(permission, replayAsAsk)) return
    notifyPermissionAsked(permission, directory)
    return
  }
  if (payload.type === "form.created") {
    notifyFormCreated(payload.properties.form, directory)
  }
}

const recordTurnOutcomeNotification = (
  payload: Extract<SyncEvent, { type: "session.idle" | "session.error" }>,
  directory: string,
  childStores: ChildStoreManager,
  batch?: DirectoryEventBatch,
): void => {
  const { sessionID } = payload.properties
  if (!sessionID) return
  const errorSummary = payload.type === "session.error" ? summarizeOpenCodeError(payload.properties.error) : null
  const responseBody = payload.type === "session.error" ? responseBodyOf(payload.properties.error) : null
  if (errorSummary) {
    recordSessionError({ sessionId: sessionID, directory, ...errorSummary })
  }
  // The unread mark itself is OpenCode's (`session-unread.ts`); only the error
  // details the chat shows under a failed turn are kept here.
  if (!errorSummary || isSubtaskSession(sessionID, directory, childStores, batch)) return
  appendErrorNotification({
    directory,
    session: sessionID,
    time: Date.now(),
    error: { ...errorSummary, responseBody },
  })
}

type ControlStreamOnlyEvent = Exclude<ControlStreamSyncEvent, { type: "session.patched" }>

const isControlStreamOnlyEvent = (payload: SyncEvent): payload is ControlStreamOnlyEvent => (
  payload.type === "openchamber.page-waiting"
  || payload.type === "openchamber.page-settled"
  || payload.type === "openchamber.session-assist"
  || payload.type === "openchamber.workflow-run"
  || payload.type === "openchamber.workflow-run-removed"
)

/**
 * OpenChamber's own announcements that only the control stream feeds in. Each
 * one switches something on and off (a waiting page, a pending recap) or
 * replaces a run summary without a revision, so a second copy from the
 * WebSocket, arriving in a different order, could undo a newer change.
 */
const applyControlStreamOnlyEvent = (payload: ControlStreamOnlyEvent): void => {
  switch (payload.type) {
    // A page that waits for the user's answer lives only in the cross-directory
    // index: no directory store holds it, since OpenCode never hears of the wait.
    case "openchamber.page-waiting":
    case "openchamber.page-settled":
      applyWaitingPageEvent(payload, resolveCachedSessionDirectory)
      if (payload.type === "openchamber.page-waiting") notifyWaitingPage(payload)
      return
    case "openchamber.session-assist":
      applySessionAssistEvent(payload.properties, resolveCachedSessionDirectory)
      return
    case "openchamber.workflow-run":
      useWorkflowRunsStore.getState().apply(payload.properties.run)
      return
    case "openchamber.workflow-run-removed":
      useWorkflowRunsStore.getState().remove(payload.properties.parentSessionId, payload.properties.runId)
      return
  }
}

export function handleEvent(
  rawDirectory: string,
  payload: SyncEvent,
  childStores: ChildStoreManager,
  routingIndex: EventRoutingIndex,
  expectedRuntimeKey: string,
  // A `permission.asked` replayed because nothing answered it automatically:
  // VS Code's extension host declined it, or the server left it for the user.
  autoAnswerDeclined = false,
  streamingDirectory?: string,
  batch?: DirectoryEventBatch,
  globalEffectsAlreadyApplied = false,
) {
  if (payload.type === "openchamber.notification") {
    handleUiNotificationEvent(payload.properties, normalizeEventDirectory(rawDirectory))
    return
  }

  if (payload.type === "openchamber.permission-left-for-user") {
    showPermissionLeftForUser(payload.properties)
    return
  }

  // Applied from the control stream (`applyControlStreamOnlyEvent`), which carries
  // them on every transport; this WebSocket copy is the same change.
  if (isControlStreamOnlyEvent(payload)) return

  // A watched file changed: the views showing it re-read it (`lib/watchedFiles`).
  if (payload.type === "filesystem.changed") {
    if (expectedRuntimeKey !== getRuntimeKey()) return
    notifyWatchedFileChanged(payload.properties.file)
    return
  }

  if (payload.type === "openchamber.permission-auto-accept") {
    usePermissionStore.getState().applySnapshot(policySnapshotFromWire(payload.properties), expectedRuntimeKey, payload.properties.spaceId ?? "")
    return
  }

  if (shouldConsumeBulkArchiveEcho(payload, expectedRuntimeKey)) return

  const directory = resolveDirectoryFromRoutingIndex(routingIndex, rawDirectory, payload, childStores, batch)

  // OpenCode dropped this directory's in-memory services (an hour idle, or an
  // explicit reload). Session records and messages live in its database and
  // stay valid; what went away is the live state read from that graph, so the
  // directory the user is looking at is bootstrapped again from scratch. The
  // pending permissions and forms it rejected on the way out, and the turns it
  // interrupted, arrive as their own events. Background directories are left
  // alone on purpose: re-reading them would recreate the services OpenCode
  // just evicted and turn every idle directory into an hourly refresh loop;
  // they are re-read when selected or on the next reconnect. Their MCP status
  // is forgotten: the servers it describes are gone, and the status changes
  // OpenCode announces while stopping them would otherwise re-read the
  // directory and start it again moments after it was released. With the window
  // hidden or unfocused, the directory on screen waits for the user to return
  // (`dormantLocations`).
  if (payload.type === "location.shutdown") {
    if (!directory || directory === "global" || expectedRuntimeKey !== getRuntimeKey()) return
    if (directory !== opencodeClient.getDirectory()) {
      forgetMcpStatus(directory)
      return
>>>>>>> bc50ba56a
    }
    if (event.type === "cleanse.progress") {
      useCleanseStore.getState().applyCleanseProgress(target.sessionId, event);
    }
    if (event.type === "advisor_yielded") {
      useAdvisorStore.getState().applyAdvisorYielded(target.sessionId, event);
    }
<<<<<<< HEAD
    const result = applyDirectoryEvent(next, event)
    if (result.kind === "resnapshot") { contiguous = false; break }
    if (result.kind === "duplicate") continue
    if ((event.type === "run.completed" || event.type === "run.failed") && next.snapshot[target.sessionId]?.activeRun?.runId === event.runId) outcomes.push(event)
    if (event.type === "tool.completed" || event.type === "part.started" || event.type === "part.completed") {
      const toolCallId = event.type === "tool.completed" ? event.toolCallId
        : event.part.type === "tool_call" || event.part.type === "tool_result" ? event.part.toolCallId : undefined
      if (toolCallId) {
        const before = next.message[target.sessionId] ?? []
        const after = result.state.message[target.sessionId] ?? []
        let incoming: Part | undefined = event.type === "tool.completed" ? undefined : event.part
        let previous: Part | undefined
        if (!incoming) for (const message of after) {
          incoming = message.parts.find((part) => part.type === "tool_call" && part.toolCallId === toolCallId)
          if (incoming) break
=======
    return
  }

  if (payload.type === "session.patched") {
    noteForkedSessionPatched(payload.properties.sessionID)
  }

  if (payload.type === "session.forked") {
    void applyForkedSession(
      {
        sessionID: payload.properties.sessionID,
        parentID: payload.properties.parentID,
        directory: directory && directory !== "global" ? directory : undefined,
      },
      {
        isKnown: (sessionID) => useGlobalSessionsStore.getState().entityById.has(sessionID),
        isCreatingLocally: (parentID) => useBtwStore.getState().byParent[parentID]?.creating === true,
        getSession: (sessionID, sessionDirectory) => opencodeClient.getSession(sessionID, sessionDirectory),
        isCurrent: () => expectedRuntimeKey === getRuntimeKey(),
        apply: (info) => handleEvent(
          rawDirectory,
          { type: "session.created", properties: { info } },
          childStores,
          routingIndex,
          expectedRuntimeKey,
        ),
      },
    )
    return
  }

  if (payload.type === "session.deleted" && expectedRuntimeKey === getRuntimeKey()) {
    const sessionID = syncEventSessionID(payload)
    if (sessionID && directory && directory !== "global") {
      cleanupPersistedSessionState({ runtimeKey: expectedRuntimeKey, directory, sessionId: sessionID })
    }
  }

  if (!globalEffectsAlreadyApplied) {
    // A request the server may answer on its own stays out of the
    // cross-directory index as well, or collapsed rows, the tray and run
    // overviews would flash a shield for a request that is then auto-approved.
    // It enters the index when it is replayed for the user.
    const heldForAutoAnswer = payload.type === "permission.asked"
      && !autoAnswerDeclined
      && isHeldUntilAutoAnswered(payload.properties)
    if (batch) {
      batch.globalSessionEvents.push(payload)
      if (!heldForAutoAnswer) {
        const statusEvents = batch.globalStatusEventsByDirectory.get(directory)
        if (statusEvents) statusEvents.push(payload)
        else batch.globalStatusEventsByDirectory.set(directory, [payload])
      }
    } else {
      applySessionEventToGlobalSessions(payload)
      // Child stores remain the primary source for synced directories; these
      // indexes cover unopened directories and list/status races.
      applyBackgroundShellEvents(directory, [payload])
      applyBackgroundImageEvents(directory, [payload])
      applyReplyCommandEvents([payload])
      applyGlobalSessionStatusEvent(directory, payload)
      if (!heldForAutoAnswer) applyGlobalBlockingRequestEvents(directory, [payload])
      applyRecoverableQuestionEvents(directory, [payload])
    }
  }

  // Turn-complete and error notifications are recorded before the directory
  // store lookup. Unopened directories are never bootstrapped and have no
  // store, yet their collapsed sidebar rows still need the unread dot.
  if ((payload.type === "session.idle" || payload.type === "session.error") && directory && directory !== "global") {
    recordTurnOutcomeNotification(payload, directory, childStores, batch)
  }

  // Global events
  if (directory === "global" || !directory) {
    const recent = isRecentBoot()
    const result = reduceGlobalEvent(payload)
    if (!result) return
    if (result.type === "refresh") {
      // Suppress refresh during/shortly after bootstrap
      if (!recent) {
        useGlobalSyncStore.setState({ reload: "pending" })
      }
    } else if (result.type === "catalog") {
      scheduleCatalogReload(result.kind, childStores, null)
    }
    if (payload.type === "server.connected") {
      // OpenCode restarted behind a live stream: an image it was generating
      // may be gone, and the job list says which.
      void runBackgroundNetworkTask(() => refreshBackgroundImages(() => opencodeClient.listRunningImageJobs()))
        .catch(() => undefined)
      // OpenCode answers for the first time, boot window or not: directory
      // bootstraps that failed while it was starting get their one retry.
      if (expectedRuntimeKey === getRuntimeKey() && claimFirstServerConnect(childStores, expectedRuntimeKey)) {
        childStores.retryFailedBootstraps()
        notifyFirstServerConnect(expectedRuntimeKey)
      }
      // OpenCode's stream restarted outside the boot window: events were lost.
      // Stores in use re-read now; the rest re-read when used again.
      if (!recent) {
        getImperativeSessionMessageLoader()?.markHistoryStale()
        const refreshing = childStores.refreshAfterStreamRestart(opencodeClient.getDirectory())
        // Bootstrap re-reads the commands of the directories it refreshes; a
        // command in any other directory may have exited during the gap.
        for (const dir of directoriesWithRunningShells()) {
          if (refreshing.has(normalizePath(dir) ?? dir)) continue
          void runBackgroundNetworkTask(() => refreshBackgroundShells(dir, (target) => opencodeClient.listRunningShells(target)))
            .catch(() => undefined)
>>>>>>> bc50ba56a
        }
        for (const message of before) {
          previous = message.parts.find((part) => part.type === "tool_call" && part.toolCallId === toolCallId)
          if (previous) break
        }
        if (incoming) {
          sessionEvents.requestGitRefreshForToolTransition(target.directory, target.sessionId, previous, incoming)
          fileTreeChanges.toolTransition(target.directory, target.sessionId, previous, incoming)
        }
      }
    }
<<<<<<< HEAD
    if ((event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled")
      && next.snapshot[target.sessionId]?.activeRun?.runId === event.runId) {
      fileTreeChanges.runCompleted(target.directory, target.sessionId)
    }
    accepted.push(event)
    if (event.type === "part.started") markDirectorySessionPartChanged(store, target.sessionId, event.messageId)
    else if (event.type === "part.delta" || event.type === "part.completed") {
      const partId = event.type === "part.delta" ? event.partId : event.part.partId
      const messageId = result.state.partOwner[target.sessionId]?.[partId]
      if (messageId) markDirectorySessionPartChanged(store, target.sessionId, messageId)
    }
    next = result.state
=======
  }

  updateRoutingIndexFromEvent(routingIndex, resolvedDirectory, payload)

  // After the routing index update above, which still files the session under
  // the source; the move re-registers it under the destination.
  if (sessionMove) {
    if (batch) batch.sessionMoves.push(sessionMove)
    else adoptSessionMove(sessionMove.sessionID, sessionMove.from, sessionMove.to)
  }
}

// ---------------------------------------------------------------------------
// Interrupted-turn reconciliation
//
// When OpenCode stops or fails a turn it says so: the live
// `session.execution.interrupted`/`failed` event, and the `idle` record it
// appends to the session's history with the same outcome. That explicit
// record is the only thing that marks a turn stopped here. The server does
// not always finalize the trailing assistant message and its tool parts
// before the record (anomalyco/opencode#19023), so the record's turn is
// completed locally (`closedLocally`) and its orphaned tools become
// `error`/`Interrupted` with an end time — the same shape OpenCode itself
// writes for cancelled tools. The message carries the error OpenCode reported
// for a failed turn; `aborted` only when the turn was stopped or the failure
// came without one. A later terminal event can supersede the mark;
// a stale refresh cannot regress the locally final state.
//
// An idle status, a status snapshot that no longer lists a session, or an
// unfinished message alone never marks a turn: a turn run by another
// OpenCode process on the same database (the TUI, `opencode run`) looks
// exactly like that while it is still going (#4156).
export function interruptedTurnToolParts(
  state: DirectoryStore,
  sessionID: string,
  now = Date.now(),
  failure?: StructuredError,
  recordedInterruption = false,
): { messageID: string; messages: Message[]; parts?: Part[] } | null {
  if ((state.form?.[sessionID] ?? []).length > 0) return null
  if ((state.permission?.[sessionID] ?? []).length > 0) return null
  // A session that is running again belongs to its new turn.
  const status = state.session_status?.[sessionID]
  if (status && status.type !== "idle") return null

  const messages = state.message[sessionID] ?? []
  let messageIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index]
    if (candidate.role === "user") return null
    if (candidate.role !== "assistant") continue
    messageIndex = index
    break
  }
  if (messageIndex < 0) return null

  const message = messages[messageIndex]
  if (message.role !== "assistant") return null
  const completed = message.time.completed !== undefined
  if (completed && !recordedInterruption) {
    // The turn finished; a missed terminal tool event is the tail refresh's
    // job, not an interruption.
    return null
  }

  const messageID = message.id
  const nextMessages = completed ? messages : [...messages]
  const error: StructuredError = failure ?? { type: "aborted", message: "aborted" }
  if (!completed) nextMessages[messageIndex] = {
    ...message,
    time: { ...message.time, completed: now },
    error,
    closedLocally: true,
  }

  let partsChanged = false
  const currentParts = state.part[messageID]
  const nextParts = currentParts?.map((part): Part => {
    if (part.type !== "tool") return part
    // Materialization also manufactures this error under completed messages.
    // Only the recorded turn interruption grants it recovery provenance.
    if (recordedInterruption && part.state.status === "error" && part.state.error === "Interrupted"
      && part.state.errorSource === undefined && part.state.errorType === undefined) {
      partsChanged = true
      return { ...part, state: { ...part.state, errorSource: "local" } }
    }
    if (part.state.status !== "pending" && part.state.status !== "running") return part
    partsChanged = true
    const start = part.state.status === "running" ? part.state.time.start : now
    return {
      ...part,
      state: {
        ...part.state,
        status: "error",
        error: "Interrupted",
        // A local mark, not OpenCode's report: an authoritative transition
        // that arrives later supersedes it (`event-reducer`), and recovery
        // reads the provenance to tell a manufactured end from a real one.
        errorSource: "local",
        time: { start, end: now },
      },
    }
  })

  if (completed && !partsChanged) return null
  return {
    messageID,
    messages: nextMessages,
    parts: partsChanged ? nextParts : undefined,
>>>>>>> bc50ba56a
  }
  if (next !== original) {
    store.setState(next)
  }
<<<<<<< HEAD
  if (accepted.length) {
    applyGlobalSessionStatusEvents(target.directory, accepted)
    applyGlobalBlockingRequestEvents(target.directory, accepted)
    applyBackgroundShellEvents(target.directory, accepted)
    const viewed = isSurfaceAttended() && (
      activeTarget?.directory === target.directory && activeTarget.sessionId === target.sessionId
      || (externallyViewedSessions.get(`${target.directory}\n${target.sessionId}`) ?? 0) > Date.now()
    )
    for (const event of outcomes) {
      if (event.type === "run.failed") {
        const error = summarizeSessionError(event.error)
        recordSessionError({ ...error, sessionId: target.sessionId, directory: target.directory })
        appendNotification({ type: "error", directory: target.directory, session: target.sessionId, time: event.finishedAt, viewed, error })
      } else appendNotification({ type: "turn-complete", directory: target.directory, session: target.sessionId, time: event.finishedAt, viewed })
    }
    if (next.session !== original.session) {
      const mutations: Array<{ type: "upsert"; session: Session } | { type: "remove"; sessionId: string }> = []
      for (const event of accepted) {
        if (event.type === "session.deleted") for (const sessionId of event.deletedSessionIds) mutations.push({ type: "remove", sessionId })
        else if (event.type === "session.updated") {
          const session = next.session.find((item) => item.sessionId === event.sessionId)
          if (session) mutations.push({ type: "upsert", session })
        }
      }
      if (mutations.length) useGlobalSessionsStore.getState().applySessionMutations(mutations)
    }
=======
  return undefined
}

/**
 * Marks the trailing turn of a freshly loaded session stopped when its history
 * records that OpenCode interrupted or failed it. Any other history, including
 * an unfinished answer with no record after it, is left as OpenCode stored it.
 */
export function markRecordedInterruptedTurn(store: StoreApi<DirectoryStore>, sessionID: string): void {
  const state = store.getState()
  const end = recordedTurnEnd(state, sessionID)
  if (end?.outcome !== "interrupted" && end?.outcome !== "failed") return
  const interrupted = interruptedTurnToolParts(state, sessionID, Date.now(), end.outcome === "failed" ? end.error : undefined, true)
  if (!interrupted) return

  const interruptedParts = interrupted.parts
  if (!interruptedParts) {
    store.setState((current) => ({
      message: { ...current.message, [sessionID]: interrupted.messages },
    }))
    return
>>>>>>> bc50ba56a
  }
  return contiguous
}

export function SyncProvider(props: { directory: string; children: React.ReactNode; client?: CanonicalClient }) {
  const runtimeKey = useSyncExternalStore(
    useCallback((notify) => subscribeRuntimeEndpointChanged(() => notify()), []), getRuntimeKey, getRuntimeKey,
  )
  return <RuntimeSyncProvider key={runtimeKey} {...props} runtimeKey={runtimeKey} />
}

function RuntimeSyncProvider(props: { directory: string; children: React.ReactNode; client?: CanonicalClient; runtimeKey: string }) {
  const client = props.client ?? canonicalClient
  const currentRef = useRef(true)
  const pipelineRef = useRef<EventPipeline | null>(null)
  const childStoresRef = useRef<ChildStoreManager | null>(null)
  if (!childStoresRef.current) childStoresRef.current = new ChildStoreManager()
  const childStores = childStoresRef.current
  const isCurrent = useCallback(() => currentRef.current && getRuntimeKey() === props.runtimeKey, [props.runtimeKey])
  const onSnapshot = useCallback((target: SessionMessageTarget, snapshot: SessionSnapshot, recoveryPrevious?: SessionSnapshot) => {
    if (!isCurrent()) return
    const store = childStores.getChild(target.directory)
    if (!store || store.getState().snapshot[target.sessionId]?.cursor !== snapshot.cursor) return
    const invalidated = { ...(store.getState().sessionStatusInvalidated ?? {}) }
    delete invalidated[target.sessionId]
    store.setState({ sessionStatusInvalidated: invalidated, sessionStatusReady: true })
    applyGlobalSessionStatusSnapshot(target.directory, { [target.sessionId]: snapshot.session.runtimeStatus }, [target.sessionId], { [target.sessionId]: snapshot.session.activeRunId })
    replaceGlobalBlockingRequestSnapshot(target.directory, snapshot)
    const session = store.getState().session.find((item) => item.sessionId === target.sessionId)
    if (session) useGlobalSessionsStore.getState().upsertSession(session)
    pipelineRef.current?.attach(target, snapshot)
    const previous = recoveryPrevious?.session
    if (previous && (
      previous.epoch !== snapshot.session.epoch
      || compareCounters(snapshot.session.headSequence, previous.headSequence) > 0
    )) {
      // A gap can abandon the live tool event that would have invalidated the
      // tree. The adopted snapshot is the authority, so ask mounted file
      // surfaces to re-list the addressed directory once; they coalesce it.
      fileTreeChanges.unknownChange(target.directory)
    }
  }, [childStores, isCurrent])
  const messageLoaderRef = useRef<SessionMessageLoader | null>(null)
  if (!messageLoaderRef.current) messageLoaderRef.current = new SessionMessageLoader(childStores, { client, runtimeKey: props.runtimeKey, isCurrent, onSnapshot })
  const messageLoader = messageLoaderRef.current
  const disposalRef = useRef<number | NodeJS.Timeout | undefined>(undefined)
  const currentDirectoryValue = normalizePath(props.directory) ?? ""
  const currentDirectoryRef = useRef<string>(currentDirectoryValue)
  currentDirectoryRef.current = currentDirectoryValue
  const directoryListeners = useRef(new Set<() => void>())
  const currentDirectory = useMemo<CurrentDirectorySource>(() => ({
    get: () => currentDirectoryRef.current,
    subscribe(notify) { directoryListeners.current.add(notify); return () => { directoryListeners.current.delete(notify) } },
  }), [])
  useLayoutEffect(() => { for (const notify of directoryListeners.current) notify() }, [props.directory])
  const runtime = useMemo<SyncRuntime>(() => ({ childStores, messageLoader, client, runtimeKey: props.runtimeKey, currentDirectory }), [childStores, messageLoader, client, props.runtimeKey, currentDirectory])
  const system = useMemo<SyncSystem>(() => ({ ...runtime, directory: currentDirectoryValue }), [runtime, currentDirectoryValue])
  const sessionListInflight = useRef(new Map<string, Promise<void>>())

<<<<<<< HEAD
  const loadSessions = useCallback((directory: string): Promise<void> => {
    const existing = sessionListInflight.current.get(directory)
    if (existing) return existing
    const store = childStores.getChild(directory)
    const workspace = store?.getState().workspace
    if (!store || !workspace) return Promise.reject(new Error("Workspace must resolve before session discovery"))
    const revision = store.getState().sessionRevision ?? 0
    const isStale = () => !isCurrent() || childStores.getChild(directory) !== store || store.getState().workspace?.workspaceId !== workspace.workspaceId
    const request = client.listSessions(workspace.workspaceId).then(async (listed) => {
      if (isStale()) return
      const prior = store.getState()
      const previousById = new Map(prior.session.map((session) => [session.sessionId, session]))
      const byId = new Map<string, Session>()
      for (const session of listed.items) {
        if (session.workspaceId !== workspace.workspaceId || (prior.sessionDeletedRevision?.[session.sessionId] ?? 0) > revision) continue
        const previous = previousById.get(session.sessionId)
        byId.set(session.sessionId, (prior.sessionEventRevision?.[session.sessionId] ?? 0) > revision && previous ? previous : mergeHostSession(session, previous))
=======
  const runtime = useMemo<SyncRuntime>(
    () => ({ childStores, messageLoader, runtimeKey, sdk: props.sdk, currentDirectory: currentDirectorySource }),
    [childStores, currentDirectorySource, messageLoader, props.sdk, runtimeKey],
  )
  const system = useMemo<SyncSystem>(
    () => ({ ...runtime, directory: props.directory }),
    [props.directory, runtime],
  )

  useEffect(() => {
    staleResyncBackoffByDirectoryRef.current = new Map()
    childDiscoveryBackoffByDirectoryRef.current = new Map()
  }, [childStores, props.sdk, runtimeKey])

  const triggerDirectoryResync = useCallback((directory: string, reason: SessionMaterializationReason) => {
    const store = childStores.children.get(directory)
    if (!store) return
    const staleResyncBackoff = staleResyncBackoffByDirectoryRef.current
    if (reason === "stale-status-resync" && Date.now() < (staleResyncBackoff.get(directory)?.retryAt ?? 0)) return
    const resyncing = resyncingDirectoriesRef.current
    if (resyncing.has(directory)) return

    lastFullResyncAtByDirectoryRef.current.set(directory, Date.now())
    resyncing.add(directory)
    const sdk = opencodeClient.getSdkClient()
    const expectedRuntimeKey = getRuntimeKey()
    const isStale = () => getRuntimeKey() !== expectedRuntimeKey
      || opencodeClient.getSdkClient() !== sdk || childStores.children.get(directory) !== store
      || staleResyncBackoffByDirectoryRef.current !== staleResyncBackoff
    void resyncDirectoryAfterReconnect(directory, store, routingIndex, reason, isStale)
      .then((succeeded) => {
        if (isStale()) return
        if (succeeded) staleResyncBackoff.delete(directory)
        else recordWatchdogReadFailure(staleResyncBackoff, directory, ACTIVE_SESSION_FULL_RESYNC_COOLDOWN_MS)
      })
      .catch(() => {
        if (!isStale()) recordWatchdogReadFailure(staleResyncBackoff, directory, ACTIVE_SESSION_FULL_RESYNC_COOLDOWN_MS)
      })
      .finally(() => {
        resyncing.delete(directory)
      })
  }, [childStores, routingIndex])

  useEffect(() => {
    if (typeof window === "undefined") return

    const onSystemResume = () => {
      const directory = currentDirectoryRef.current
      if (!directory || !childStores.getChild(directory)) return

      const resyncing = blockingRequestResyncingDirectoriesRef.current
      if (resyncing.has(directory)) return
      resyncing.add(directory)
      void resyncBlockingRequestsForActiveDirectory(directory, childStores)
        .finally(() => resyncing.delete(directory))
    }

    window.addEventListener("openchamber:system-resume", onSystemResume)
    return () => window.removeEventListener("openchamber:system-resume", onSystemResume)
  }, [childStores])

  useEffect(() => {
    const onReturn = () => {
      if (dormantLocations.size > 0 && isUiFocused()) wakeDormantLocations(childStores, currentDirectoryRef.current)
    }
    window.addEventListener("focus", onReturn)
    document.addEventListener("visibilitychange", onReturn)
    return () => {
      window.removeEventListener("focus", onReturn)
      document.removeEventListener("visibilitychange", onReturn)
      dormantLocations.clear()
    }
  }, [childStores])

  // Configure child store manager
  useEffect(() => {
    void usePermissionStore.getState().hydrate().catch(() => undefined)
    void useMessageQueueStore.getState().hydrate().catch(() => undefined)
    if (isAutoReviewAvailable()) void useAutoReviewStore.getState().hydrate().catch(() => undefined)
  }, [props.sdk])

  useEffect(() => {
    const expectedRuntimeKey = getRuntimeKey()
    const sdkEpoch = opencodeClient.getSdkClient()
    return childStores.configure({
      bootstrapConcurrency: 2,
      isCurrentScope: () => getRuntimeKey() === expectedRuntimeKey && opencodeClient.getSdkClient() === sdkEpoch,
      onBootstrap: async (context: DirectoryBootstrapContext) => {
        const { directory } = context
        const isCurrent = context.isCurrent
        const store = childStores.getChild(directory)
        if (!store || !isCurrent()) return

        const failBootstrap = async () => {
          if (!isCurrent()) return
          // Only the owning filesystem API can establish an OS permission
          // failure; OpenCode/proxy text is not permission evidence.
          const files = getRegisteredRuntimeAPIs()?.files
          if (files) {
            try {
              await files.listDirectory(directory)
            } catch (error) {
              if (isFilesystemError(error) && error.reason === "os-permission") throw error
            }
          }
          throw new Error(`Directory bootstrap failed for ${directory}`)
        }
        let initializationAttempt = 0

        const runBootstrap = async (attempt: number): Promise<"complete" | "failed" | "stale"> => {
          if (!isCurrent()) return "stale"
          const currentAttempt = ++initializationAttempt
          const globalState = useGlobalSyncStore.getState()
          const bootstrap = bootstrapDirectory({
            directory,
            store,
            set: (patch) => {
              if (!isCurrent()) return
              store.setState(patch)
              if (patch.session_status) {
                applyGlobalSessionStatusSnapshot(directory, patch.session_status, getDirectoryOwnedSessionIds(directory, store.getState().session))
              }
              if (patch.session || patch.message) {
                ingestDirectoryStateIntoRoutingIndex(routingIndex, directory, store.getState())
              }
            },
            isStale: () => !isCurrent() || currentAttempt !== initializationAttempt,
            global: {
              config: globalState.config,
              projects: globalState.projects,
              path: globalState.path,
            },
            // Each page owns its bounded retry. Replaying the whole list here
            // multiplies attempts and holds a bootstrap slot behind failures.
            loadSessions: async (dir) => {
              if (!isCurrent()) return
              const baselineRevision = store.getState().sessionRevision ?? 0
              // One list covers the directory: v2 has no roots or archived
              // filter, so roots and child sessions (sub-agent delegations)
              // arrive together and are split here. Children must be present
              // for pending forms to scope to them right after a restart.
              const { active } = splitGlobalSessionsByArchived(
                await listGlobalSessionPages(listSessionPage, {
                  directory: dir,
                  pageSize: 500,
                  onPage: (page) => {
                    if (!isCurrent()) return
                    const { active } = splitGlobalSessionsByArchived(page)
                    const current = store.getState()
                    const { sessions } = mergeBootstrapSessions(
                      active.filter((session) => !session.parentID), active, current.session, {
                        baselineRevision,
                        partial: true,
                        eventRevision: current.sessionEventRevision,
                        deletedRevision: current.sessionDeletedRevision,
                      },
                    )
                    if (sessions === current.session) return
                    store.setState({ session: sessions, limit: Math.max(sessions.length, 50) })
                    ingestDirectoryStateIntoRoutingIndex(routingIndex, directory, store.getState())
                  },
                }),
              )
              const allSessions = active
                .filter((s) => !!s?.id)
                .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
              const rootSessions = allSessions.filter((s) => !s.parentID)
              if (!isCurrent()) return

              // A cold OpenCode process can briefly return children before its
              // roots query catches up. Recover referenced parents from the
              // broader response or cache instead of publishing orphan rows.
              const current = store.getState()
              const { sessions, rootCount } = mergeBootstrapSessions(rootSessions, allSessions, current.session, {
                baselineRevision,
                eventRevision: current.sessionEventRevision,
                deletedRevision: current.sessionDeletedRevision,
              })
              store.setState({
                session: sessions,
                sessionTotal: rootCount,
                sessionListSource: "authoritative",
                limit: Math.max(sessions.length, 50),
              })
              ingestDirectoryStateIntoRoutingIndex(routingIndex, directory, store.getState())
            },
          })
          context.trackInitialization(bootstrap.environment.then((result) => {
            if (result === "failed") return failBootstrap()
          }))
          const result = await bootstrap.sessions
          if (!isCurrent()) return "stale"
          if (result !== "complete") return result

          // VS Code-only race: the bridge can answer with an empty 200 (instead
          // of a retryable 503) while OpenCode is still warming up, which the
          // page retries inside loadSessions can't catch. Re-run a few times there.
          //
          // On web/desktop this retry is both redundant and harmful: loadSessions
          // already retries transient failures (listGlobalSessionPages throws on
          // 5xx and retries internally), so an empty result here is AUTHORITATIVE —
          // the directory genuinely has no sessions (e.g. a deleted worktree only
          // referenced by archived sessions). Re-running the full bootstrap 6×2s
          // per such directory is the startup log storm.
          if (isVSCodeRuntime() && isCurrent()) {
            const state = store.getState()
            if (state.session.length === 0 && attempt < 5) {
              console.warn(`[bootstrap] sessions empty for ${directory} after attempt ${attempt + 1}; retrying in 2s`)
              await new Promise((r) => setTimeout(r, 2000))
              if (!isCurrent()) return "stale"
              store.setState({ status: "loading" as const })
              return runBootstrap(attempt + 1)
            } else if (state.session.length === 0) {
              console.warn(`[bootstrap] sessions empty for ${directory} after ${attempt + 1} attempts; giving up`)
            }
          }
          return "complete"
        }

        const result = await runBootstrap(0)
        if (result === "failed") await failBootstrap()

        // Selecting a session whose directory this client had not indexed yet
        // routes it through the active directory as a documented guess. This is
        // the moment that guess can be settled: the owning store now holds the
        // session, so the authoritative directory is finally readable. Without
        // this the guess survives, every fetch is addressed to a directory that
        // does not own the session, and the session never renders.
        if (result === "complete") {
          useSessionUIStore.getState().adoptAuthoritativeSessionDirectory()
        }
      },
      onDispose: (directory) => {
        messageLoader.invalidateDirectory(directory)
        lastStatusPollAtByDirectoryRef.current.delete(directory)
        statusPollBackoffByDirectoryRef.current.delete(directory)
        lastFullResyncAtByDirectoryRef.current.delete(directory)
        lastChildDiscoveryAtByDirectoryRef.current.delete(directory)
        staleResyncBackoffByDirectoryRef.current.delete(directory)
        childDiscoveryBackoffByDirectoryRef.current.delete(directory)
      },
      isLoadingSessions: () => false,
    })
  }, [childStores, messageLoader, props.sdk, routingIndex])

  // A space that left both lists, deleted here or from another window, takes its directories
  // with it: their stores and persisted caches go, so its chats show once, from the archive.
  useEffect(() => {
    let previous = knownSpaceIds(useSpacesStore.getState())
    let generation = spacesRuntimeGeneration()
    return useSpacesStore.subscribe((state) => {
      const next = knownSpaceIds(state)
      // A reset empties both lists without deleting anything: a runtime switch, whose stores go
      // their own way, or the switch turned off, whose spaces come back with it.
      const reset = spacesRuntimeGeneration() !== generation
      generation = spacesRuntimeGeneration()
      const gone = reset ? [] : spaceIdsGone(previous, next)
      previous = next
      if (gone.length === 0) return
      const goneIds = new Set(gone)
      for (const directory of Array.from(childStores.children.keys())) {
        const spaceId = spaceIdOfDirectory(directory)
        if (spaceId !== null && goneIds.has(spaceId)) childStores.forgetDirectory(directory)
>>>>>>> bc50ba56a
      }
      for (const previous of prior.session) if ((prior.sessionEventRevision?.[previous.sessionId] ?? 0) > revision || previous.sessionId in listed.errors || workspace.workspaceId in listed.errors || workspace.projectId in listed.errors) byId.set(previous.sessionId, previous)
      const session = [...byId.values()].filter((item) => item.archivedAt === undefined)
      const unchanged = session.length === prior.session.length && session.every((item, index) => item === prior.session[index])
      store.setState({ session: unchanged ? prior.session : session, sessionTotal: session.length, limit: Math.max(prior.limit, session.length), sessionListSource: Object.keys(listed.errors).length ? "live" : "authoritative", discoveryErrors: listed.errors })
      useGlobalSessionsStore.getState().upsertSessions([...byId.values()])
      const live = session.filter((item) => item.runtimeStatus === "running" || item.runtimeStatus === "awaiting_approval" || item.runtimeStatus === "awaiting_input")
      const newChildParents = new Set(session.filter((item) => item.parentSessionId && !previousById.has(item.sessionId)).map((item) => item.parentSessionId!))
      // Discovering a child must also recover its parent's task tool record.
      await Promise.allSettled([
        ...live.filter((item) => !store.getState().snapshot[item.sessionId]).map((item) => messageLoader.ensure({ directory, sessionId: item.sessionId }, { reason: "reactive" })),
        ...[...newChildParents].filter((sessionId) => Boolean(store.getState().snapshot[sessionId])).map((sessionId) => messageLoader.refresh({ directory, sessionId })),
      ])
      if (isStale()) return
      const statuses: Record<string, SessionRuntimeStatus> = {}
      const activeRunIds: Record<string, string | null> = {}
      const committed = store.getState()
      for (const item of committed.session) {
        const snapshot = committed.snapshot[item.sessionId]
        const liveSession = snapshot?.session.workspaceId === workspace.workspaceId && snapshot.session.epoch === committed.sessionEpoch[item.sessionId] ? snapshot.session : undefined
        statuses[item.sessionId] = committed.sessionStatusInvalidated?.[item.sessionId] ? "unavailable" : liveSession?.runtimeStatus ?? item.runtimeStatus
        activeRunIds[item.sessionId] = statuses[item.sessionId] === "unavailable" ? null : liveSession ? liveSession.activeRunId : item.activeRunId
      }
<<<<<<< HEAD
      const previousStatuses = committed.session_status
      const unchangedStatuses = Object.keys(previousStatuses).length === Object.keys(statuses).length && Object.entries(statuses).every(([id, status]) => previousStatuses[id] === status)
      store.setState({ session_status: unchangedStatuses ? previousStatuses : statuses, sessionStatusReady: true })
      applyGlobalSessionStatusSnapshot(directory, statuses, committed.session.map((item) => item.sessionId), activeRunIds)
    }).finally(() => { if (sessionListInflight.current.get(directory) === request) sessionListInflight.current.delete(directory) })
    sessionListInflight.current.set(directory, request)
    return request
  }, [childStores, client, isCurrent, messageLoader])

  useEffect(() => {
    currentRef.current = true
    clearTimeout(disposalRef.current)
    disposalRef.current = undefined
=======
    })
      .then(() => {
        if (globalBootstrapGeneration === generation) {
          bootedAt = Date.now()
        }
      })
      .finally(() => {
        if (globalBootstrapGeneration === generation) {
          bootingRoot = false
        }
      })
    return () => {
      if (globalBootstrapGeneration === generation) {
        bootingRoot = false
      }
    }
  }, [props.sdk])

  // Event pipeline — created once per mount. No class, no start/stop.
  // Abort controller owned by the pipeline closure. Cleanup aborts + flushes.
  useEffect(() => {
    const unsubscribeQueueEvents = subscribeMessageQueueSync(runtimeKey)
    const unsubscribeSessionAdmission = subscribeSessionAdmission()
    const unsubscribeAutoReviewEvents = subscribeAutoReviewSync(runtimeKey)
    const unsubscribePrWatchEvents = subscribePrWatchSync(runtimeKey)
    const unsubscribeSessionWarming = subscribeSessionWarmingSync(runtimeKey)
    const unsubscribeFolderEvents = subscribeSessionFoldersSync(runtimeKey)
    const unsubscribeDraftEvents = subscribeSessionDraftsSync(runtimeKey)
    const unsubscribeSpaceModes = subscribeSpacePermissionModes(runtimeKey)
    const unsubscribePermissionPolicy = subscribePermissionPolicySync(
      runtimeKey,
      (event) => handleEvent("global", event, childStores, routingIndex, runtimeKey),
    )
    // An archive patch goes the usual way: the WebSocket copy is the same
    // patch, and applying it twice changes nothing.
    const unsubscribeControlStream = subscribeControlStreamSync(runtimeKey, (event) => {
      if (event.type === "session.patched") handleEvent("global", event, childStores, routingIndex, runtimeKey)
      else applyControlStreamOnlyEvent(event)
    })
    const unsubscribeSpaceCatalogs = subscribeSpaceCatalogs(runtimeKey)
    const unsubscribeSpaceSessionProject = subscribeSpaceSessionProject(runtimeKey)
    const resyncAfterStreamGap = (reason: SessionMaterializationReason) => {
      // Cached transcripts may have missed events too; each revalidates its
      // tail the next time it is opened. Mark first so the active sessions'
      // tail refreshes below count as that revalidation.
      messageLoader.markHistoryStale()
      for (const dir of childStores.children.keys()) triggerDirectoryResync(dir, reason)
    }
    const pipeline = createEventPipeline({
      sdk: props.sdk,
      transport: messageStreamTransport,
      routeDirectory: (directory, payload) => {
        return resolveDirectoryFromRoutingIndex(routingIndex, directory, payload, childStores)
      },
      // Track ALL stream activity (including heartbeats) as proof of
      // connection health. The watchdog stale check uses this to distinguish
      // a genuinely dead stream (no heartbeats for 20s) from a quiet-but-
      // connected session that is only receiving heartbeats. Excluding
      // heartbeats caused issue #1656: the stale timer fired for any quiet
      // session, triggering redundant full resyncs every ~15s. OpenCode 2
      // heartbeats never become events: OpenCode sends an SSE comment and the
      // WS bridge an `openchamber:heartbeat` frame, so delivered events miss them.
      onStreamActivity: () => {
        lastStreamActivityAtRef.current = Date.now()
      },
      onEvents: (directory, payloads) => {
        const batch = createDirectoryEventBatch()
        try {
          for (const payload of payloads) {
            dispatchVSCodeRuntimeNotificationEvent(directory, payload)
            if (payload.type === "installation.update-available") {
              const { version } = payload.properties
              if (version) dispatchOpenCodeUpdateAvailable({ version })
            }
            handleEvent(directory, payload, childStores, routingIndex, runtimeKey, false, currentDirectoryRef.current, batch)
          }
        } finally {
          publishDirectoryEventBatch(batch)
        }
      },
      onSpaceStream: ({ spaceId, status }) => {
        // A space's stream went: its sessions may be old until it answers again. Back: re-read
        // that one space, the directories the global list knows for it, so a session made or
        // finished during the gap shows up without a full global reload.
        useSpacesStore.getState().noteStream(spaceId, status)
        // A stream that is back on a space this window lists as stopped means the space was started
        // elsewhere: the list is read again, so the group and the paused polls follow.
        if (status === "connected" && isSpaceStopped(spaceId)) {
          void refreshSpacesJourney().catch(() => undefined)
        }
        if (status !== "connected") {
          // A space that stopped itself for the idle stop ends its stream on its way out. While the
          // host's list still says it runs, read the list again at each failed reconnect, which the
          // host paces, so the group says "stopped" rather than "not answering" once it is down.
          if (useSpacesStore.getState().journey?.get(spaceId)?.state === "running") {
            void refreshSpacesJourney().catch(() => undefined)
          }
          return
        }
        const directories = Array.from(useGlobalSessionsStore.getState().sessionsByDirectory.keys())
          .filter((directory) => spaceIdOfDirectory(directory) === spaceId)
        const spaceDirectory = useSpacesStore.getState().spaces.get(spaceId)?.directory
        if (spaceDirectory) directories.push(spaceDirectory)
        if (directories.length === 0) return
        void useGlobalSessionsStore.getState().refreshSessionsForDirectories(directories).catch(() => undefined)
      },
      onSpaceProgress: (progress) => {
        // A step of a creation moves the space's group on at once. A space this list has not seen,
        // made from another window among them, and the end of a creation, whose entry then comes
        // from the place, are read again from the journey route.
        const known = useSpacesStore.getState().noteProgress(progress)
        if (known && progress.step !== "ready" && progress.step !== "failed") return
        void refreshSpacesJourney().catch(() => undefined)
      },
      onSpaceTaskTitle: (spaceId, taskTitle) => {
        if (runtimeKey !== getRuntimeKey()) return
        if (!useSpacesStore.getState().noteTaskTitle(spaceId, taskTitle)) void refreshSpacesJourney().catch(() => undefined)
      },
      onSpaceSetup: () => {
        // The setup commands of a space moved on; what they do now is in the list.
        void refreshSpacesJourney().catch(() => undefined)
      },
      onSpacePermissionStream: (spaceId) => {
        if (runtimeKey !== getRuntimeKey()) return
        void usePermissionStore.getState().refreshSpaceModes(spaceId)
      },
      onReconnect: ({ replayReset }) => {
        // The first connection and every one after a gap: spaces being made or whose making failed
        // are known only to the journey list, and a step announced during the gap was missed.
        if (useUIStore.getState().isolatedSpacesEnabled && !isVSCodeRuntime()) {
          void refreshSpacesJourney().catch(() => undefined)
        }
        // Queue recovery is independent of the directory-bootstrap debounce.
        void useMessageQueueStore.getState().resync().catch(() => undefined)
        // OpenCode keeps file watches in memory; a restart behind the gap dropped them.
        renewWatchedFiles()
        // Images in progress have no other source after a start or a gap: the
        // job list answers for every session at once.
        void runBackgroundNetworkTask(() => refreshBackgroundImages(() => opencodeClient.listRunningImageJobs()))
          .catch(() => undefined)
        useConfigStore.setState({
          isConnected: true,
          hasEverConnected: true,
          connectionPhase: "connected",
        })
        const isFirstConnect = !pipelineHasConnectedRef.current
        pipelineHasConnectedRef.current = true
        if (!replayReset && isFirstConnect && !pipelineDisconnectedBeforeFirstConnectRef.current) {
          return
        }
        if (!replayReset && isRecentBoot()) {
          return
        }
        resyncAfterStreamGap("stream-reconnect")
      },
      onDisconnect: (reason) => {
        if (!pipelineHasConnectedRef.current) {
          pipelineDisconnectedBeforeFirstConnectRef.current = true
        }
        const { hasEverConnected } = useConfigStore.getState()
        useConfigStore.setState({
          isConnected: false,
          connectionPhase: hasEverConnected ? "reconnecting" : "connecting",
          lastDisconnectReason: reason,
        })
      },
      onTransportSwitch: () => {
        void useMessageQueueStore.getState().resync().catch(() => undefined)
        // Transport changes are gap-prone in real networks. Treat them like a
        // reconnect and refresh active session snapshots from HTTP.
        useConfigStore.setState({
          isConnected: true,
          hasEverConnected: true,
          connectionPhase: "connected",
        })
        resyncAfterStreamGap("transport-switch")
      },
    })
    pipelineReconnectRef.current = pipeline.reconnect
    return () => {
      if (pipelineReconnectRef.current === pipeline.reconnect) {
        pipelineReconnectRef.current = null
      }
      pipeline.cleanup()
      unsubscribeQueueEvents()
      unsubscribeSessionAdmission()
      unsubscribeAutoReviewEvents()
      unsubscribePrWatchEvents()
      unsubscribeSessionWarming()
      unsubscribeFolderEvents()
      unsubscribeDraftEvents()
      unsubscribeSpaceModes()
      unsubscribePermissionPolicy()
      unsubscribeControlStream()
      unsubscribeSpaceCatalogs()
      unsubscribeSpaceSessionProject()
    }
  }, [props.sdk, childStores, messageLoader, routingIndex, messageStreamTransport, runtimeKey, triggerDirectoryResync])

  useEffect(() => {
    let stopped = false
    let running = false
    const statusPollBackoff = new Map<string, number>()
    statusPollBackoffByDirectoryRef.current = statusPollBackoff
    const staleResyncBackoff = staleResyncBackoffByDirectoryRef.current
    const childDiscoveryBackoff = childDiscoveryBackoffByDirectoryRef.current

    const discoverChildSessions = async (
      directory: string,
      store: StoreApi<DirectoryStore>,
      parentSessionIds: string[],
    ) => {
      if (parentSessionIds.length === 0) return
      if (childDiscoveryDirectories.has(directory)) return
      childDiscoveryDirectories.add(directory)
      try {
        // Each live parent's children only, every page of them. Listing the
        // whole directory every 15 s moved megabytes per read in a directory
        // with a thousand sessions, for as long as any of them was working.
        const listed: GlobalSessionRecord[] = []
        for (const parentID of parentSessionIds) {
          listed.push(...await listGlobalSessionPages(listSessionPage, { directory, parentID, pageSize: 200 }))
          if (stopped || childStores.getChild(directory) !== store) return
        }
        const { active: allSessions } = splitGlobalSessionsByArchived(listed)
        childDiscoveryBackoff.delete(directory)
        const state = store.getState()
        const globalEntities = useGlobalSessionsStore.getState().entityById
        const newChildSessions = selectNewChildSessions(
          allSessions,
          new Set(state.session.map((s) => s.id)),
          new Set(parentSessionIds),
          (sessionId) => Boolean(globalEntities.get(sessionId)?.time?.archived),
        )
        if (newChildSessions.length === 0) return
        // Collect unique parent IDs for materialization
        const parentIdsForMaterialization = new Set<string>()
        for (const session of newChildSessions) {
          if (session.parentID) parentIdsForMaterialization.add(session.parentID)
        }
        store.setState((state: DirectoryStore) => {
          const sessions = [...state.session, ...newChildSessions].sort((a, b) =>
            a.id < b.id ? -1 : a.id > b.id ? 1 : 0
          )
          return { session: sessions, limit: Math.max(sessions.length, 50) }
        })
        // Trigger parent session materialization so the task tool part
        // state (metadata, sessionId, output) is refreshed.
        for (const pid of parentIdsForMaterialization) {
          enqueueSessionMaterialization(directory, pid, childStores, { reason: "child-session-discovered" })
        }
      } catch {
        if (!stopped && childStores.getChild(directory) === store) {
          recordWatchdogReadFailure(childDiscoveryBackoff, directory, CHILD_SESSION_DISCOVERY_INTERVAL_MS)
        }
      } finally {
        childDiscoveryDirectories.delete(directory)
      }
    }

    const pollDirectoryStatuses = async (
      directory: string,
      store: StoreApi<DirectoryStore>,
      candidateSessionIds: string[],
    ) => {
      const polling = statusPollingDirectories
      if (polling.has(directory)) return
      polling.add(directory)
      const recordFailure = () => {
        if (stopped || childStores.getChild(directory) !== store) return
        const previousDelay = statusPollBackoff.get(directory) ?? ACTIVE_SESSION_STATUS_POLL_INTERVAL_MS
        statusPollBackoff.set(directory, Math.min(previousDelay * 2, ACTIVE_SESSION_STATUS_POLL_MAX_BACKOFF_MS))
        // Count the wait from completion, including when the request was slow.
        lastStatusPollAtByDirectoryRef.current.set(directory, Date.now())
      }
      try {
        const before = store.getState()
        const statuses = await runBackgroundNetworkTask(() => resyncDirectorySessionStatuses(directory, store, candidateSessionIds, "monotonic"), "active-session")
        if (statuses === undefined) return
        if (statuses === null) {
          recordFailure()
          return
        }
        if (stopped || childStores.getChild(directory) !== store) return
        statusPollBackoff.delete(directory)
        const needsSnapshot = candidateSessionIds.some((sessionId) => (
          needsSnapshotAfterStatusPoll(before, sessionId, statuses[sessionId])
        ))
        if (needsSnapshot) {
          triggerDirectoryResync(directory, "stale-status-resync")
        }
      } catch {
        recordFailure()
      } finally {
        polling.delete(directory)
      }
    }

    const tick = () => {
      if (running || stopped) return
      running = true
      void Promise.resolve()
        .then(() => {
          if (stopped) return
          const now = Date.now()
          for (const [directory, store] of childStores.children.entries()) {
            // A stopped space answers nothing: the journey list is the authority, so its
            // directories wait, status as they last reported, until the list says it runs.
            if (isSpaceDirectoryStopped(directory)) continue
            const state = store.getState()
            const candidateSessionIds = getActiveSessionCandidateIds(directory, state)
            if (candidateSessionIds.length === 0) {
              lastStatusPollAtByDirectoryRef.current.delete(directory)
              statusPollBackoff.delete(directory)
              lastFullResyncAtByDirectoryRef.current.delete(directory)
              staleResyncBackoff.delete(directory)
              childDiscoveryBackoff.delete(directory)
              lastChildDiscoveryAtByDirectoryRef.current.delete(directory)
              continue
            }

            const liveSessionIds = getLiveSessionCandidateIds(state)
            const lastStatusPollAt = lastStatusPollAtByDirectoryRef.current.get(directory) ?? 0
            const statusPollInterval = statusPollBackoff.get(directory) ?? ACTIVE_SESSION_STATUS_POLL_INTERVAL_MS
            if (liveSessionIds.length > 0 && now - lastStatusPollAt >= statusPollInterval) {
              lastStatusPollAtByDirectoryRef.current.set(directory, now)
              void pollDirectoryStatuses(directory, store, liveSessionIds).catch(() => undefined)
            }

            const lastFullResyncAt = lastFullResyncAtByDirectoryRef.current.get(directory) ?? 0
            if (now >= (staleResyncBackoff.get(directory)?.retryAt ?? 0)
              && shouldTriggerStaleResync(lastStreamActivityAtRef.current, lastFullResyncAt, now)) {
              pipelineReconnectRef.current?.("active_stream_stale")
              triggerDirectoryResync(directory, "stale-status-resync")
            }

            // Discover child sessions created by other OpenCode instances
            // that didn't broadcast a session.created event on this stream.
            const lastChildDiscoveryAt = lastChildDiscoveryAtByDirectoryRef.current.get(directory) ?? 0
            if (liveSessionIds.length > 0 && now - lastChildDiscoveryAt >= CHILD_SESSION_DISCOVERY_INTERVAL_MS
              && now >= (childDiscoveryBackoff.get(directory)?.retryAt ?? 0)) {
              lastChildDiscoveryAtByDirectoryRef.current.set(directory, now)
              void discoverChildSessions(directory, store, liveSessionIds)
            }
          }
        })
        .finally(() => {
          running = false
          if (stopped) {
            statusPollingDirectories.clear()
          }
        })
    }

    const interval = setInterval(tick, ACTIVE_SESSION_WATCHDOG_INTERVAL_MS)
    tick()

    return () => {
      stopped = true
      clearInterval(interval)
    }
  }, [childStores, props.sdk, triggerDirectoryResync, runtimeKey])

  // Ensure current directory's child store exists
  useEffect(() => {
    let seedExpiryTimer: ReturnType<typeof setTimeout> | undefined
    if (props.directory) {
      const store = childStores.ensureChild(props.directory, {
        priority: "selected",
        reason: "current-directory",
      })
      const statusSeed = getRuntimeLiveStatusSeed(getRuntimeKey(), props.directory)
      if (statusSeed) {
        store.setState((state: DirectoryStore) => ({
          session_status: {
            ...state.session_status,
            [statusSeed.sessionId]: state.session_status[statusSeed.sessionId] ?? statusSeed.status,
          },
        }))
        seedExpiryTimer = setTimeout(() => {
          store.setState((state: DirectoryStore) => {
            if (state.session_status[statusSeed.sessionId] !== statusSeed.status) {
              return state
            }
            return {
              session_status: {
                ...state.session_status,
                [statusSeed.sessionId]: { type: "idle" as const },
              },
            }
          })
        }, LIVE_STATUS_TTL_MS)
      }
      ingestDirectoryStateIntoRoutingIndex(routingIndex, props.directory, store.getState())
    }
    return () => {
      if (seedExpiryTimer) clearTimeout(seedExpiryTimer)
    }
  }, [props.directory, childStores, routingIndex])

  // Set refs so non-React code (session-actions, session-ui-store) can access sync state
  useEffect(() => messageLoader.startCacheRetention({
    isCurrent: () => getRuntimeKey() === runtimeKey,
    isViewed: ({ directory, sessionID }) => (
      directory === _activeDirectory && sessionID === _activeSession
    ) || (externallyViewedSessions.get(viewedSessionKey(directory, sessionID)) ?? 0) > Date.now(),
    isActive: ({ directory, sessionID }) => {
      const live = useGlobalSessionStatusStore.getState().statusById.get(sessionID)
      return live?.directory === directory && live.status.type !== "idle"
    },
    releaseDerivedCache: ({ directory, sessionID }) => {
      const store = childStores.getChild(directory)
      if (store) dropCachedSessionMessageRecordsSnapshots(store, [sessionID])
    },
  }), [childStores, messageLoader, runtimeKey])

  useEffect(() => {
    setImperativeSessionMessageLoader(messageLoader)
    setSyncRefs(props.sdk, childStores, props.directory, (sessionID, dir) => {
      setIndexedSessionDirectory(routingIndex, sessionID, dir)
    })
    setActionRefs(
      childStores,
      () => opencodeClient.getDirectory() || props.directory,
      (directory, sessionID, messageID) => {
        enqueueSessionMaterialization(directory, sessionID, childStores, {
          reason: "settled-running-tool",
          messageID,
        })
      },
    )
    return () => {
      if (getImperativeSessionMessageLoader() === messageLoader) {
        setImperativeSessionMessageLoader(null)
      }
    }
  }, [props.sdk, props.directory, childStores, messageLoader, routingIndex])

  useEffect(() => {
    if (messageLoaderDisposalTimerRef.current) {
      clearTimeout(messageLoaderDisposalTimerRef.current)
      messageLoaderDisposalTimerRef.current = null
    }
>>>>>>> bc50ba56a
    messageLoader.activate()
    messageLoader.configure({ client, runtimeKey: props.runtimeKey, isCurrent, onSnapshot })
    const pipeline = createEventPipeline({
      client, isCurrent,
      onEvents(target, events) {
        const previous = childStores.getChild(target.directory)?.getState().sessionDeletedRevision
        const contiguous = handleEvents(target, events, childStores)
        const deleted = childStores.getChild(target.directory)?.getState().sessionDeletedRevision
        for (const event of events) {
          if (event.type !== "session.deleted") continue
          for (const sessionId of event.deletedSessionIds) {
            if (deleted?.[sessionId] === undefined || deleted[sessionId] === previous?.[sessionId]) continue
            const deletedTarget = { directory: target.directory, sessionId }
            messageLoader.invalidateSession(deletedTarget)
            pipelineRef.current?.detach(deletedTarget)
          }
        }
        return contiguous
      },
      recover: async (target) => {
        const btw = useBtwStore.getState().byParent[target.sessionId]
        if (btw?.ephemeralStatus === "running" && btw.ephemeralRecordId) {
          useBtwStore.getState().completeEphemeral(target.sessionId, btw.ephemeralRecordId, "failed", btw.ephemeralText ?? "")
        } else if (btw?.pendingSend) {
          useBtwStore.getState().setPanelState(target.sessionId, { pendingSend: undefined, pending: true })
        }
        await messageLoader.refresh(target, undefined, { recovered: true })
      },
      onDisconnect(target) {
        const store = childStores.getChild(target.directory)
        if (store && isCurrent()) {
          const state = store.getState()
          store.setState({
            sessionStatusInvalidated: { ...(state.sessionStatusInvalidated ?? {}), [target.sessionId]: true },
            session_status: { ...state.session_status, [target.sessionId]: "unavailable" },
          })
          applyGlobalSessionStatusSnapshot(target.directory, { [target.sessionId]: "unavailable" }, [target.sessionId])
        }
        const btw = useBtwStore.getState().byParent[target.sessionId]
        if (btw?.ephemeralStatus === "running" && btw.ephemeralRecordId) {
          useBtwStore.getState().completeEphemeral(target.sessionId, btw.ephemeralRecordId, "failed", btw.ephemeralText ?? "")
        } else if (btw?.pendingSend) {
          useBtwStore.getState().setPanelState(target.sessionId, { pendingSend: undefined, pending: true })
        }
      },
    })
    pipelineRef.current = pipeline
    const unconfigure = childStores.configure({
      isCurrentScope: isCurrent,
      onBootstrap(context) {
        const store = childStores.getChild(context.directory)
        if (!store) return
        const result = bootstrapDirectory({ directory: context.directory, store, client, set: (patch) => { if (context.isCurrent()) store.setState(patch) }, isStale: () => !context.isCurrent() || !isCurrent(), loadSessions })
        context.trackInitialization(result.environment.then(({ status, retryable }) => {
          if (status === "failed") throw new BootstrapFailureError("Canonical environment discovery failed", retryable)
        }))
        return result.sessions.then((status) => {
          if (status === "failed") throw new Error("Canonical session discovery failed")
          if (status === "complete" && context.isCurrent() && isCurrent()) notifyFirstCanonicalBootstrap(childStores, props.runtimeKey)
        })
      },
      onDispose(directory) { pipeline.clearDirectory(directory); messageLoader.clearDirectory(directory) },
    })
    setSessionParentResolver((sessionId) => findLiveSession(Array.from(childStores.children.values(), (store) => store.getState()), sessionId)?.parentSessionId)
    void bootstrapGlobal(useGlobalSyncStore.setState, useGlobalSyncStore.getState, client, isCurrent)
    const unsubscribeFolderEvents = subscribeSessionFoldersSync(props.runtimeKey);
    const unsubscribeDraftEvents = subscribeSessionDraftsSync(props.runtimeKey);
    const unsubscribeMessageQueueEvents = subscribeMessageQueueSync(props.runtimeKey ?? getRuntimeKey());
    const unsubscribeMetadataEvents = subscribeSessionMetadataSync(props.runtimeKey ?? getRuntimeKey());
    // A shown session whose directory stops being admitted (a move out, a
    // removed project) is parked here rather than left reading nothing.
    const unsubscribeSessionAdmission = subscribeSessionAdmission();
    // Workflow runs and the host snapshot follow the control stream: an SSE
    // client hears a run's progress here, never on its own engine stream.
    const unsubscribeControlStream = subscribeControlStreamSync(props.runtimeKey ?? getRuntimeKey());
    const stopBeforeSwitch = subscribeRuntimeEndpointWillChange((detail) => {
      if (detail.runtimeKey === props.runtimeKey) return
      currentRef.current = false
      pipeline.cleanup()
      useGlobalSyncStore.getState().actions.reset()
      activeTarget = null
      externallyViewedSessions.clear()
    })
    const resumeAfterSwitch = subscribeRuntimeEndpointChanged((detail) => {
      if (detail.runtimeKey !== props.runtimeKey || !isCurrent()) return
      pipeline.reconnect()
      childStores.retryFailedBootstraps()
      childStores.refreshAfterStreamRestart(currentDirectoryRef.current)
      void bootstrapGlobal(useGlobalSyncStore.setState, useGlobalSyncStore.getState, client, isCurrent)
    })
    for (const [directory, store] of childStores.children) {
      for (const snapshot of Object.values(store.getState().snapshot)) pipeline.attach({ directory, sessionId: snapshot.session.sessionId }, snapshot)
    }
    const discoveryTimer = setInterval(() => {
      if (!isCurrent()) return
      for (const [directory, store] of childStores.children) {
        if (!store.getState().workspace || !childStores.pinned(directory)) continue
        void loadSessions(directory).catch(() => { })
      }
    }, 15_000)
    const resume = () => {
      if (!isCurrent()) return
      pipeline.reconnect()
      childStores.retryFailedBootstraps()
      childStores.refreshAfterStreamRestart(currentDirectoryRef.current)
    }
    const visible = () => { if (document.visibilityState === "visible") resume() }
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) resume() }
    const offline = () => {
      if (!isCurrent()) return
      for (const [directory, store] of childStores.children) {
        for (const sessionId of Object.keys(store.getState().snapshot)) pipeline.invalidate({ directory, sessionId })
      }
    }
    const stopAuthRecovery = useAuthSessionStore.subscribe((state, previous) => {
      if (state.state === "ok" && previous.state !== "ok") resume()
    })
    // The Host connection is independent of browser online state: a local
    // server restart drops Web/Electron transport while the browser stays
    // online. Resume the same recovery startup and the other resume signals
    // use, once per false-to-true transition.
    const stopConnectionRecovery = useConfigStore.subscribe((state, previous) => {
      if (state.isConnected && !previous.isConnected) resume()
    })
    // Effects only run in a browser document; the provider never registers
    // listeners during server rendering.
    window.addEventListener("online", resume)
    window.addEventListener("offline", offline)
    window.addEventListener("pageshow", pageshow)
    window.addEventListener("openchamber:system-resume", resume)
    document.addEventListener("visibilitychange", visible)
    return () => {
      currentRef.current = false
      stopBeforeSwitch(); resumeAfterSwitch(); stopAuthRecovery(); stopConnectionRecovery(); unconfigure(); pipeline.cleanup(); clearInterval(discoveryTimer); unsubscribeFolderEvents(); unsubscribeDraftEvents(); unsubscribeMessageQueueEvents(); unsubscribeMetadataEvents(); unsubscribeSessionAdmission(); unsubscribeControlStream();
      window.removeEventListener("online", resume)
      window.removeEventListener("offline", offline)
      window.removeEventListener("pageshow", pageshow)
      window.removeEventListener("openchamber:system-resume", resume)
      document.removeEventListener("visibilitychange", visible)
      if (pipelineRef.current === pipeline) pipelineRef.current = null
      disposalRef.current = setTimeout(() => { messageLoader.dispose(); childStores.disposeAll() }, 0)
    }
  }, [childStores, client, isCurrent, loadSessions, messageLoader, onSnapshot, props.runtimeKey])

  useEffect(() => {
    const directory = currentDirectoryRef.current
    if (directory) childStores.ensureChild(directory, { priority: "selected", reason: "current-directory" })
    setSyncRefs(childStores, directory)
    setActionRefs(childStores, () => currentDirectoryRef.current, (targetDirectory, sessionId) => {
      if (isCurrent()) void messageLoader.refresh({ directory: targetDirectory, sessionId }).catch(() => { })
    })
    setOptimisticRefs(
      (input) => { if (isCurrent()) messageLoader.optimisticAdd({ ...input, directory: input.directory || currentDirectoryRef.current }) },
      (input) => { if (isCurrent()) messageLoader.optimisticRemove({ ...input, directory: input.directory || currentDirectoryRef.current }) },
      (input) => { if (isCurrent()) messageLoader.optimisticConfirm({ ...input, directory: input.directory || currentDirectoryRef.current }) },
    )
    setImperativeSessionMessageLoader(messageLoader)
    return () => { if (getImperativeSessionMessageLoader() === messageLoader) setImperativeSessionMessageLoader(null) }
  }, [childStores, isCurrent, messageLoader, props.directory])

  useEffect(() => messageLoader.startCacheRetention({
    isCurrent,
    isViewed: (target) => activeTarget?.directory === target.directory && activeTarget.sessionId === target.sessionId || (externallyViewedSessions.get(`${target.directory}\n${target.sessionId}`) ?? 0) > Date.now(),
    isActive: (target) => { const status = childStores.getChild(target.directory)?.getState().session_status[target.sessionId]; return status === "running" || status === "awaiting_approval" || status === "awaiting_input" },
    releaseDerivedCache: (target) => { pipelineRef.current?.detach(target) },
  }), [childStores, isCurrent, messageLoader])

  return <SyncContext.Provider value={system}><SyncRuntimeContext.Provider value={runtime}>{props.children}</SyncRuntimeContext.Provider></SyncContext.Provider>
}

export function useDirectoryStore(directory?: string, options?: { bootstrap?: boolean; priority?: DirectoryBootstrapPriority; reason?: DirectoryBootstrapReason }): StoreApi<DirectoryStore> {
  const runtime = useSyncRuntime()
  const dir = useSyncExternalStore(
    runtime.currentDirectory.subscribe,
    () => normalizePath(directory ?? runtime.currentDirectory.get()) ?? "",
    () => normalizePath(directory ?? runtime.currentDirectory.get()) ?? "",
  )
  if (!dir) throw new Error("Sync hooks require an active directory")
  const store = runtime.childStores.ensureChild(dir, options)
  useEffect(() => { runtime.childStores.pin(dir); return () => runtime.childStores.unpin(dir) }, [dir, runtime.childStores])
  return store
}
export function useSessionMessageLoadState(sessionId: string, directory?: string): SessionMessageLoadState {
  const runtime = useSyncRuntime()
  const current = useSyncDirectory()
  const target = useMemo<SessionMessageTarget | null>(() => {
    const resolved = normalizePath(directory ?? current)
    return resolved && sessionId ? { directory: resolved, sessionId } : null
  }, [current, directory, sessionId])
  return useSyncExternalStore(
    useCallback((notify) => target ? runtime.messageLoader.subscribe(target, notify) : () => { }, [runtime.messageLoader, target]),
    useCallback(() => target ? runtime.messageLoader.getSnapshot(target) : EMPTY_LOAD, [runtime.messageLoader, target]),
    () => EMPTY_LOAD,
  )
}
export function useDirectorySync<T>(selector: (state: State) => T, directory?: string): T { return useStore(useDirectoryStore(directory), selector) }
export function useSyncDirectory() { return useSyncSystem().directory }
export function useChildStoreManager() { return useSyncRuntime().childStores }
export function useSessionMessageLoader() { return useSyncRuntime().messageLoader }

export function useSessionMessages(sessionId: string, directory?: string): Message[] {
  const store = useDirectoryStore(directory)
  return useSyncExternalStore(useCallback((notify) => subscribeDirectorySessionMessages(store, sessionId, notify), [store, sessionId]), useCallback(() => store.getState().message[sessionId] ?? EMPTY_MESSAGES, [store, sessionId]), () => EMPTY_MESSAGES)
}
export function useSessionMessagesSelector<T>(sessionId: string, directory: string | undefined, select: (messages: Message[], state: State) => T, isEqual: (left: T, right: T) => boolean = Object.is): T {
  const store = useDirectoryStore(directory)
  const cache = useRef<{ value: T } | null>(null)
  const get = useCallback(() => { const state = store.getState(); const value = select(state.message[sessionId] ?? EMPTY_MESSAGES, state); if (!cache.current || !isEqual(cache.current.value, value)) cache.current = { value }; return cache.current.value }, [store, sessionId, select, isEqual])
  return useSyncExternalStore(useCallback((notify) => subscribeDirectorySessionMessages(store, sessionId, notify), [store, sessionId]), get, get)
}
export function useSessionMessagesResolved(sessionId: string, directory?: string): boolean { return useSessionMessagesSelector(sessionId, directory, (_messages, state) => Object.hasOwn(state.message, sessionId)) }
export function useSessionRenderable(sessionId: string, directory?: string): boolean { return useSessionMessagesSelector(sessionId, directory, (_messages, state) => getSessionMaterializationStatus(state, sessionId).renderable) }
export function useSessionStatus(sessionId: string, directory?: string): SessionRuntimeStatus | undefined { return useDirectorySync(useCallback((state) => state.sessionStatusInvalidated?.[sessionId] ? "unavailable" : state.session_status[sessionId], [sessionId]), directory) }
export function useSessionActiveRun(sessionId: string, directory?: string): Run | null {
  return useDirectorySync(useCallback((state) => state.snapshot[sessionId]?.activeRun ?? null, [sessionId]), directory)
}
export function useSessionStatusSnapshotReady(directory?: string, sessionId?: string): boolean { return useDirectorySync(useCallback((state) => sessionId ? Boolean(state.snapshot[sessionId]) && !state.sessionStatusInvalidated?.[sessionId] : Boolean(state.sessionStatusReady), [sessionId]), directory) }
export function useGlobalSessionStatus(sessionId: string): SessionRuntimeStatus | undefined { return useGlobalSessionStatusStore(useCallback((state) => state.statusById.get(sessionId)?.status, [sessionId])) }
export function useSessionPermissions(sessionId: string, directory?: string, options?: { bootstrap?: boolean }): ApprovalRequest[] {
  const store = useDirectoryStore(directory, options)
  return useSyncExternalStore(useCallback((notify) => subscribeDirectoryPermission(store, sessionId, notify), [store, sessionId]), useCallback(() => store.getState().permission[sessionId] ?? EMPTY_APPROVALS, [store, sessionId]), () => EMPTY_APPROVALS)
}
export function useSessionForms(sessionId: string, directory?: string): QuestionRequest[] {
  const store = useDirectoryStore(directory)
  return useSyncExternalStore(useCallback((notify) => subscribeDirectoryForm(store, sessionId, notify), [store, sessionId]), useCallback(() => store.getState().form[sessionId] ?? EMPTY_QUESTIONS, [store, sessionId]), () => EMPTY_QUESTIONS)
}
export function useSessions(directory?: string): Session[] { return useDirectorySync(useCallback((state) => state.session, []), directory) }

const EMPTY_ADVISOR_NOTES: AdvisorNote[] = [];
export function useSessionAdvisorNotes(sessionId: string | null | undefined, directory?: string): AdvisorNote[] {
  const storeNotes = useAdvisorStore(
    useCallback((state) => (sessionId ? state.bySession[sessionId]?.notes : undefined), [sessionId]),
  );
  const dirNotes = useDirectorySync(
    useCallback((state) => (sessionId ? state.advisor?.[sessionId]?.notes : undefined), [sessionId]),
    directory,
  );
  return storeNotes ?? dirNotes ?? EMPTY_ADVISOR_NOTES;
}

function useLiveSelector<T>(selector: (states: State[]) => T, isEqual: (left: T, right: T) => boolean, slice: "session" | "session_status"): T {
  const { childStores } = useSyncRuntime()
  const cache = useRef<{ value: T } | null>(null)
  const get = useCallback(() => { const value = selector(Array.from(childStores.children.values(), (store) => store.getState())); if (!cache.current || !isEqual(cache.current.value, value)) cache.current = { value }; return cache.current.value }, [childStores, selector, isEqual])
  return useSyncExternalStore(useCallback((notify) => childStores.subscribeAllSelected((state) => state[slice], notify), [childStores, slice]), get, get)
}
export function useAllLiveSessions(): Session[] { return useLiveSelector(aggregateLiveSessions, areSessionListsEquivalent, "session") }
export function useLiveSessionsExcluding(excludedIds: ReadonlySet<string>): Session[] { return useLiveSelector(useCallback((states) => aggregateLiveSessions(states).filter((session) => !excludedIds.has(session.sessionId)), [excludedIds]), areSessionListsEquivalent, "session") }
export function useAllSessionStatuses(): Record<string, SessionRuntimeStatus> { return useLiveSelector(aggregateLiveSessionStatuses, areStatusMapsEquivalent, "session_status") }

<<<<<<< HEAD
export function useSession(sessionId?: string | null, directory?: string): Session | undefined {
=======
/** Get sessions list for a directory */
export function useSessions(directory?: string) {
  return useDirectorySync(
    useCallback((state: State) => state.session, []),
    directory,
  )
}

const sessionStartTimesCache = new WeakMap<State["session"], ReadonlyMap<string, number>>()

const readSessionStartTimes = (sessions: State["session"]): ReadonlyMap<string, number> => {
  let startTimes = sessionStartTimesCache.get(sessions)
  if (!startTimes) {
    startTimes = new Map(sessions.map((session) => [session.id, session.time.created]))
    sessionStartTimesCache.set(sessions, startTimes)
  }
  return startTimes
}

const haveSameStartTimes = (left: ReadonlyMap<string, number>, right: ReadonlyMap<string, number>): boolean => {
  if (left === right) return true
  if (left.size !== right.size) return false
  for (const [sessionID, created] of left) {
    if (right.get(sessionID) !== created) return false
  }
  return true
}

/**
 * When each session of a directory started, by session id. Keeps its identity
 * until a session is added or removed: the session list is replaced on every
 * streamed step (`session.updated` moves `time.updated`), start times never
 * change.
 */
export function useSessionStartTimes(directory?: string): ReadonlyMap<string, number> {
  const store = useDirectoryStore(directory)
  const cacheRef = useRef<ReadonlyMap<string, number> | null>(null)
  const getSnapshot = useCallback(() => {
    const next = readSessionStartTimes(store.getState().session)
    const cached = cacheRef.current
    if (cached && haveSameStartTimes(cached, next)) return cached
    cacheRef.current = next
    return next
  }, [store])
  const subscribe = useCallback((notify: () => void) => store.subscribe((state, previous) => {
    if (state.session !== previous.session) notify()
  }), [store])
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const selectPermissionRequestsBySession = (state: State) => state.permission
const selectFormRequestsBySession = (state: State) => state.form

/**
 * Forms for the composer of `sessionID`: the session subtree's own, then the
 * directory's location-scoped ones. A location-scoped form has no session to
 * be viewed from, so every session of its directory offers it; the answer is
 * still sent to that directory's OpenCode instance because the reply
 * resolves its directory from the store that holds the form.
 */
export const collectComposerForms = (
  sessions: Session[],
  formsBySession: Record<string, FormRequest[] | undefined>,
  sessionID: string | null,
  empty: FormRequest[],
): FormRequest[] => {
  const own = collectScopedBlockingRequests(sessions, formsBySession, sessionID, empty)
  const locationScoped = sessionID ? formsBySession[LOCATION_SCOPED_FORM_SESSION_ID] : undefined
  if (!locationScoped || locationScoped.length === 0) return own
  return own === empty ? locationScoped : [...own, ...locationScoped]
}

type ScopedBlockingRequestCache<T extends { id: string }> = {
  sessionID: string | null
  sessions: Session[] | null
  requestsBySession: Record<string, T[] | undefined> | null
  result: T[]
}

function useScopedBlockingRequests<T extends { id: string }>(
  sessionID: string | null,
  directory: string | undefined,
  selectRequestsBySession: (state: State) => Record<string, T[] | undefined>,
  empty: T[],
  collect: (
    sessions: Session[],
    requestsBySession: Record<string, T[] | undefined>,
    sessionID: string | null,
    empty: T[],
  ) => T[] = collectScopedBlockingRequests,
): T[] {
  const cacheRef = useRef<ScopedBlockingRequestCache<T>>({
    sessionID: null,
    sessions: null,
    requestsBySession: null,
    result: empty,
  })

  return useDirectorySync(
    useCallback((state: State) => {
      const requestsBySession = selectRequestsBySession(state)
      const cache = cacheRef.current
      if (
        cache.sessionID === sessionID
        && cache.sessions === state.session
        && cache.requestsBySession === requestsBySession
      ) {
        return cache.result
      }

      const next = collect(state.session, requestsBySession, sessionID, empty)
      const result = areRequestArraysReferentiallyEqual(cache.result, next) ? cache.result : next
      cacheRef.current = {
        sessionID,
        sessions: state.session,
        requestsBySession,
        result,
      }
      return result
    }, [collect, empty, selectRequestsBySession, sessionID]),
    directory,
  )
}

export function useScopedBlockingPermissions(sessionID: string | null, directory?: string): PermissionRequest[] {
  return useScopedBlockingRequests(sessionID, directory, selectPermissionRequestsBySession, EMPTY_PERMISSION_REQUESTS)
}

export function useScopedBlockingForms(sessionID: string | null, directory?: string): FormRequest[] {
  return useScopedBlockingRequests(sessionID, directory, selectFormRequestsBySession, EMPTY_FORM_REQUESTS, collectComposerForms)
}

/**
 * The questions whose ask died with their turn, for this session's scope (the
 * session and its subtree). A recovered question is a local re-ask, not a
 * pending request: it blocks nothing, and answering it starts a new turn.
 */
export function useRecoveredQuestions(sessionID: string | null, directory?: string): RecoveredQuestion[] {
  const store = useDirectoryStore(directory)
  const sessions = useStore(store, (state) => state.session)
  const form = useStore(store, (state) => state.form)
  const part = useStore(store, (state) => state.part)
  const recovery = useRecoverableQuestionsStore()
  return useMemo(() => deriveRecoveredQuestions(
    { form, part },
    recovery,
    sessionID ? computeSubtreeIds(sessions, sessionID) : new Set<string>(),
  ), [form, part, recovery, sessionID, sessions])
}

const sessionsByIdCache = new WeakMap<State["session"], Map<string, Session>>()

const getSessionById = (sessions: State["session"], sessionID?: string | null): Session | undefined => {
  if (!sessionID) return undefined
  let sessionsById = sessionsByIdCache.get(sessions)
  if (!sessionsById) {
    sessionsById = new Map(sessions.map((session) => [session.id, session]))
    sessionsByIdCache.set(sessions, sessionsById)
  }
  return sessionsById.get(sessionID)
}

export function useParentSession(sessionID: string | null, directory?: string): Session | null {
  return useDirectorySync(
    useCallback((state: State) => {
      if (!sessionID) return null
      const current = getSessionById(state.session, sessionID)
      if (!current?.parentID) return null
      return getSessionById(state.session, current.parentID)
        ?? getAllSyncSessions().find((s) => s.id === current.parentID)
        ?? null
    }, [sessionID]),
    directory,
  )
}

/** Get one session by id for a directory */
export function useSession(sessionID?: string | null, directory?: string) {
>>>>>>> bc50ba56a
  const { childStores } = useSyncRuntime()
  const get = useCallback(() => directory ? childStores.getChild(directory)?.getState().session.find((session) => session.sessionId === sessionId) : findLiveSession(Array.from(childStores.children.values(), (store) => store.getState()), sessionId), [childStores, directory, sessionId])
  return useSyncExternalStore(useCallback((notify) => childStores.subscribeAllSelected((state) => directory && state.path.directory !== normalizePath(directory) ? undefined : state.session.find((session) => session.sessionId === sessionId), notify), [childStores, directory, sessionId]), get, get)
}
export function useSessionSelector<T>(sessionId: string | null | undefined, directory: string | undefined, select: (session: Session | undefined) => T, isEqual: (left: T, right: T) => boolean = Object.is): T {
  const { childStores } = useSyncRuntime()
  const cache = useRef<{ value: T } | null>(null)
  const get = useCallback(() => {
    const session = directory ? childStores.getChild(directory)?.getState().session.find((item) => item.sessionId === sessionId) : findLiveSession(Array.from(childStores.children.values(), (store) => store.getState()), sessionId)
    const value = select(session)
    if (!cache.current || !isEqual(cache.current.value, value)) cache.current = { value }
    return cache.current.value
  }, [childStores, directory, sessionId, select, isEqual])
  return useSyncExternalStore(useCallback((notify) => childStores.subscribeAllSelected((state) => directory && state.path.directory !== normalizePath(directory) ? undefined : state.session.find((session) => session.sessionId === sessionId), notify), [childStores, directory, sessionId]), get, get)
}
export function useParentSession(sessionId: string | null, directory?: string): Session | null { const session = useSession(sessionId, directory); return useSession(session?.parentSessionId, directory) ?? null }
export function useSessionDirectory(sessionId?: string | null, directory?: string): string | undefined {
  const workspaceId = useSessionSelector(sessionId, directory, useCallback((session) => session?.workspaceId, []))
  const get = useCallback(() => workspaceId ? resolveWorkspaceDirectory(workspaceId) ?? undefined : undefined, [workspaceId])
  return useSyncExternalStore(subscribeWorkspaceDirectories, get, get)
}

<<<<<<< HEAD
export const collectComposerForms = (sessions: Session[], forms: Record<string, QuestionRequest[] | undefined>, sessionId: string | null): QuestionRequest[] => collectScopedBlockingRequests(sessions, forms, sessionId, EMPTY_QUESTIONS)
function useScopedRequests<T extends ApprovalRequest | QuestionRequest>(sessionId: string | null, directory: string | undefined, slice: "permission" | "form", empty: T[]): T[] {
  const store = useDirectoryStore(directory)
  const cache = useRef<T[]>(empty)
  const get = useCallback(() => {
    const state = store.getState()
    // SAFETY: `slice` names the slice whose element type is `T` — the
    // "permission" caller passes `ApprovalRequest` and the "form" caller
    // passes `QuestionRequest` — so the store's two request records both hold
    // `Record<string, T[]>` for the `T` this call was instantiated with.
    const value = collectScopedBlockingRequests(state.session, state[slice] as Record<string, T[]>, sessionId, empty)
    if (!areRequestArraysReferentiallyEqual(cache.current, value)) cache.current = value
    return cache.current
  }, [store, sessionId, slice, empty])
  return useSyncExternalStore(useCallback((notify) => store.subscribe((state, prior) => { if (state.session !== prior.session || state[slice] !== prior[slice]) notify() }), [store, slice]), get, get)
}
export function useScopedBlockingPermissions(sessionId: string | null, directory?: string): ApprovalRequest[] { return useScopedRequests(sessionId, directory, "permission", EMPTY_APPROVALS) }
export function useScopedBlockingForms(sessionId: string | null, directory?: string): QuestionRequest[] { return useScopedRequests(sessionId, directory, "form", EMPTY_QUESTIONS) }
export function useSessionBlockingRequestCounts(scopes: readonly { directory: string; sessionIds: readonly string[] }[]): { permissionCount: number; formCount: number } {
  const { childStores } = useSyncRuntime()
  useEffect(() => {
    for (const scope of scopes) childStores.pin(scope.directory)
    return () => { for (const scope of scopes) childStores.unpin(scope.directory) }
  }, [childStores, scopes])
  const cache = useRef({ permissionCount: 0, formCount: 0 })
  const get = useCallback(() => { let permissionCount = 0; let formCount = 0; for (const scope of scopes) { const state = childStores.getChild(scope.directory)?.getState(); for (const id of scope.sessionIds) { permissionCount += state?.permission[id]?.filter((request) => request.status === "pending").length ?? 0; formCount += state?.form[id]?.filter((request) => request.status === "pending").length ?? 0 } } if (cache.current.permissionCount !== permissionCount || cache.current.formCount !== formCount) cache.current = { permissionCount, formCount }; return cache.current }, [childStores, scopes])
  return useSyncExternalStore(useCallback((notify) => { const subscriptions = scopes.map((scope) => { const store = childStores.ensureChild(scope.directory, { bootstrap: false }); return store.subscribe((state, prior) => { if (scope.sessionIds.some((id) => state.permission[id] !== prior.permission[id] || state.form[id] !== prior.form[id])) notify() }) }); return () => { for (const unsubscribe of subscriptions) unsubscribe() } }, [childStores, scopes]), get, get)
=======
const selectSessionDirectory = (session: Session | undefined): string | undefined => session?.directory ?? undefined

/** Get one session directory by id for a directory */
export function useSessionDirectory(sessionID?: string | null, directory?: string): string | undefined {
  return useSessionSelector(sessionID, directory, selectSessionDirectory)
}

/** Get the current directory */
export function useSyncDirectory() {
  return useSyncSystem().directory
}

/** Get the child store manager (for advanced operations) */
export function useChildStoreManager() {
  return useSyncRuntime().childStores
}

type SessionMessageRecord = { info: Message; parts: Part[] }
const EMPTY_SESSION_MESSAGE_RECORDS: SessionMessageRecord[] = []

type SessionMessageRecordsSnapshot = {
  sessionID: string
  sourceMessages: Message[]
  visibleMessages: Message[]
  revertMessageID?: string
  suspendPartUpdates: boolean
  suspendedPartUpdatesMessageID?: string
  list: SessionMessageRecord[]
  byId: Map<string, SessionMessageRecord>
}

const SESSION_MESSAGE_RECORDS_CACHE_MAX = 40
const VSCODE_SESSION_MESSAGE_RECORDS_CACHE_MAX = 4
const VSCODE_SESSION_MESSAGE_RECORDS_CACHE_MAX_MESSAGES = 30
const MOBILE_SESSION_MESSAGE_RECORDS_CACHE_MAX = 4
const MOBILE_SESSION_MESSAGE_RECORDS_CACHE_MAX_MESSAGES = 30
const sessionMessageRecordsCache = new WeakMap<StoreApi<DirectoryStore>, Map<string, SessionMessageRecordsSnapshot>>()

const getSessionMessageRecordsCacheKey = (
  sessionID: string,
  suspendPartUpdates: boolean,
  suspendedPartUpdatesMessageID?: string,
): string => (
  `${sessionID}\u0000${suspendPartUpdates ? 1 : 0}\u0000${suspendedPartUpdatesMessageID ?? ""}`
)

const getSessionMessageRecordsCache = (store: StoreApi<DirectoryStore>): Map<string, SessionMessageRecordsSnapshot> => {
  let cache = sessionMessageRecordsCache.get(store)
  if (!cache) {
    cache = new Map()
    sessionMessageRecordsCache.set(store, cache)
  }
  return cache
}

const readCachedSessionMessageRecordsSnapshot = (
  store: StoreApi<DirectoryStore>,
  sessionID: string,
  suspendPartUpdates: boolean,
  suspendedPartUpdatesMessageID?: string,
): SessionMessageRecordsSnapshot | undefined => {
  const cache = sessionMessageRecordsCache.get(store)
  if (!cache) return undefined
  const key = getSessionMessageRecordsCacheKey(sessionID, suspendPartUpdates, suspendedPartUpdatesMessageID)
  const cached = cache.get(key)
  if (!cached) return undefined
  cache.delete(key)
  cache.set(key, cached)
  return cached
}

const rememberSessionMessageRecordsSnapshot = (
  store: StoreApi<DirectoryStore>,
  snapshot: SessionMessageRecordsSnapshot,
): void => {
  if (!snapshot.sessionID) return
  const cache = getSessionMessageRecordsCache(store)
  const key = getSessionMessageRecordsCacheKey(
    snapshot.sessionID,
    snapshot.suspendPartUpdates,
    snapshot.suspendedPartUpdatesMessageID,
  )
  const constrainedMaxMessages = isVSCodeRuntime()
    ? VSCODE_SESSION_MESSAGE_RECORDS_CACHE_MAX_MESSAGES
    : isMobileSurfaceRuntime()
      ? MOBILE_SESSION_MESSAGE_RECORDS_CACHE_MAX_MESSAGES
      : null
  if (constrainedMaxMessages !== null && snapshot.list.length > constrainedMaxMessages) {
    cache.delete(key)
    return
  }
  cache.delete(key)
  cache.set(key, snapshot)
  const max = isVSCodeRuntime()
    ? VSCODE_SESSION_MESSAGE_RECORDS_CACHE_MAX
    : isMobileSurfaceRuntime()
      ? MOBILE_SESSION_MESSAGE_RECORDS_CACHE_MAX
      : SESSION_MESSAGE_RECORDS_CACHE_MAX
  while (cache.size > max) {
    const oldest = cache.keys().next().value
    if (typeof oldest !== "string") break
    cache.delete(oldest)
  }
}

function dropCachedSessionMessageRecordsSnapshots(
  store: StoreApi<DirectoryStore>,
  sessionIDs: Iterable<string>,
): void {
  const cache = sessionMessageRecordsCache.get(store)
  if (!cache) return
  for (const sessionID of sessionIDs) {
    if (!sessionID) continue
    const prefix = `${sessionID}\u0000`
    for (const key of [...cache.keys()]) {
      if (key.startsWith(prefix)) {
        cache.delete(key)
      }
    }
  }
}

type TaskToolPart = Extract<Part, { type: "tool" }>

const isTaskToolPart = (part: Part | undefined): part is TaskToolPart => (
  part?.type === "tool" && part.tool?.trim().toLowerCase() === "task"
)

const readTaskSessionId = (part: Part | undefined): string | undefined => {
  if (!isTaskToolPart(part)) return undefined
  const metadata = (part.state as { metadata?: unknown } | undefined)?.metadata
  if (!metadata || typeof metadata !== "object") return undefined
  const record = metadata as { sessionId?: unknown; sessionID?: unknown }
  const value = typeof record.sessionId === "string" ? record.sessionId : record.sessionID
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

const hasTaskSessionIdentityChange = (previous: Part[], current: Part[] | undefined): boolean => {
  let previousTaskCount = 0
  for (const part of previous) {
    if (!isTaskToolPart(part)) continue
    previousTaskCount += 1
    const currentPart = current?.find((candidate) => candidate.id === part.id && isTaskToolPart(candidate))
    if (!currentPart || readTaskSessionId(part) !== readTaskSessionId(currentPart)) return true
  }

  let currentTaskCount = 0
  for (const part of current ?? EMPTY_PARTS) {
    if (isTaskToolPart(part)) currentTaskCount += 1
  }
  return previousTaskCount !== currentTaskCount
}

const snapshotPartsMatchState = (snapshot: SessionMessageRecordsSnapshot, state: State): boolean => {
  for (const record of snapshot.list) {
    if (snapshot.suspendPartUpdates) {
      const suspendedID = snapshot.suspendedPartUpdatesMessageID
      if (
        (!suspendedID || record.info.id === suspendedID)
        && !hasTaskSessionIdentityChange(record.parts, state.part[record.info.id])
      ) {
        continue
      }
    }
    if ((state.part[record.info.id] ?? EMPTY_PARTS) !== record.parts) {
      return false
    }
  }

  return true
}

// Session lists are ID-sorted; snapshot reads run on every store notification,
// so the revert lookup must not scan the directory's whole session list.
const getSessionRevertMessageID = (sessions: State["session"], sessionID: string): string | undefined => {
  const result = Binary.search(sessions, sessionID, (session) => session.id)
  return result.found ? sessions[result.index]?.revert?.messageID : undefined
}

const getReusableSessionMessageRecordsSnapshot = (
  store: StoreApi<DirectoryStore>,
  state: State,
  sessionID: string,
  suspendPartUpdates: boolean,
  suspendedPartUpdatesMessageID?: string,
): SessionMessageRecordsSnapshot | undefined => {
  const cached = readCachedSessionMessageRecordsSnapshot(store, sessionID, suspendPartUpdates, suspendedPartUpdatesMessageID)
  if (!cached) return undefined
  const sourceMessages = state.message[sessionID] ?? EMPTY_MESSAGES
  const revertMessageID = getSessionRevertMessageID(state.session, sessionID)
  if (
    cached.sourceMessages === sourceMessages
    && cached.revertMessageID === revertMessageID
    && cached.suspendPartUpdates === suspendPartUpdates
    && cached.suspendedPartUpdatesMessageID === suspendedPartUpdatesMessageID
    && snapshotPartsMatchState(cached, state)
  ) {
    return cached
  }
  return undefined
}

function getVisibleMessagesForSession(state: State, sessionID: string, previous?: SessionMessageRecordsSnapshot): {
  sourceMessages: Message[]
  visibleMessages: Message[]
  revertMessageID?: string
} {
  const sourceMessages = state.message[sessionID] ?? EMPTY_MESSAGES
  const revertMessageID = getSessionRevertMessageID(state.session, sessionID)

  if (
    previous
    && previous.sourceMessages === sourceMessages
    && previous.revertMessageID === revertMessageID
  ) {
    return {
      sourceMessages,
      visibleMessages: previous.visibleMessages,
      revertMessageID,
    }
  }

  return {
    sourceMessages,
    visibleMessages: messagesBefore(sourceMessages, revertMessageID),
    revertMessageID,
  }
}

export function buildSessionMessageRecordsSnapshot(
  state: State,
  sessionID: string,
  previous?: SessionMessageRecordsSnapshot,
  suspendPartUpdates = false,
  suspendedPartUpdatesMessageID?: string,
): SessionMessageRecordsSnapshot {
  const { sourceMessages, visibleMessages, revertMessageID } = getVisibleMessagesForSession(state, sessionID, previous)
  const nextById = new Map<string, SessionMessageRecord>()
  const nextList = visibleMessages.map((message) => {
    const previousRecord = previous?.byId.get(message.id)
    const shouldSuspendParts = suspendPartUpdates
      && previousRecord
      && (!suspendedPartUpdatesMessageID || message.id === suspendedPartUpdatesMessageID)
      && !hasTaskSessionIdentityChange(previousRecord.parts, state.part[message.id])
    const parts = shouldSuspendParts
      ? previousRecord.parts
      : (state.part[message.id] ?? EMPTY_PARTS)

    const nextRecord = previousRecord && previousRecord.info === message && previousRecord.parts === parts
      ? previousRecord
      : { info: message, parts }

    nextById.set(message.id, nextRecord)
    return nextRecord
  })

  const unchanged = Boolean(previous)
    && previous?.visibleMessages === visibleMessages
    && previous.suspendPartUpdates === suspendPartUpdates
    && previous.suspendedPartUpdatesMessageID === suspendedPartUpdatesMessageID
    && previous.list.length === nextList.length
    && previous.list.every((record, index) => record === nextList[index])

  if (unchanged && previous) {
    return previous
  }

  return {
    sessionID,
    sourceMessages,
    visibleMessages,
    revertMessageID,
    suspendPartUpdates,
    suspendedPartUpdatesMessageID,
    list: nextList,
    byId: nextById,
  }
}

export function readSessionMessageRecordsSnapshot(
  store: StoreApi<DirectoryStore>,
  sessionID: string,
  current: SessionMessageRecordsSnapshot,
  suspendPartUpdates: boolean,
  suspendedPartUpdatesMessageID?: string,
): SessionMessageRecordsSnapshot {
  const state = store.getState()
  const sameSession = current.sessionID === sessionID
  // A suspension that changes within a session continues from what the chat
  // shows now. A snapshot cached under the other suspension can hold older
  // parts of the message it suspended, and its parts check skips that message.
  const suspensionChanged = sameSession && (
    current.suspendPartUpdates !== suspendPartUpdates
    || current.suspendedPartUpdatesMessageID !== suspendedPartUpdatesMessageID
  )
  const reusableSnapshot = suspensionChanged
    ? undefined
    : getReusableSessionMessageRecordsSnapshot(store, state, sessionID, suspendPartUpdates, suspendedPartUpdatesMessageID)
  if (reusableSnapshot) return reusableSnapshot

  const previousSnapshot = sameSession
    ? current
    : readCachedSessionMessageRecordsSnapshot(store, sessionID, suspendPartUpdates, suspendedPartUpdatesMessageID)
  const nextSnapshot = buildSessionMessageRecordsSnapshot(
    state,
    sessionID,
    previousSnapshot,
    suspendPartUpdates,
    suspendedPartUpdatesMessageID,
  )
  rememberSessionMessageRecordsSnapshot(store, nextSnapshot)
  return nextSnapshot
}

export function useSessionRenderable(sessionID: string, directory?: string): boolean {
  const store = useDirectoryStore(directory)
  const renderableRef = useRef(false)
  const getSnapshot = useCallback(() => {
    const renderable = Boolean(sessionID && getSessionMaterializationStatus(store.getState(), sessionID).renderable)
    renderableRef.current = renderable
    return renderable
  }, [sessionID, store])
  const subscribe = useCallback(
    (notify: () => void) => sessionID
      ? subscribeDirectorySessionMessages(store, sessionID, (change) => {
          const state = store.getState()
          const remainsRenderable = change.partMessageIDs.every((messageID) => (
            Object.prototype.hasOwnProperty.call(state.part, messageID)
          ))
          if (
            !change.messagesChanged
            && !change.reset
            && change.partMessageIDs.length > 0
            && renderableRef.current
            && remainsRenderable
          ) {
            countSyncPerformance("sessionRenderableNotificationSkips")
            return
          }
          notify()
        })
      : () => undefined,
    [sessionID, store],
  )
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const EMPTY_RECORD_IDS: ReadonlySet<string> = new Set()
const userHistoryRecordIDs = new WeakMap<UserMessageHistorySnapshot["records"], ReadonlySet<string>>()

// Part notifications during streaming carry many message IDs; one ID set per
// records array keeps the relevance check linear instead of parts × prompts.
const getUserHistoryRecordIDs = (snapshot: UserMessageHistorySnapshot): ReadonlySet<string> => {
  let ids = userHistoryRecordIDs.get(snapshot.records)
  if (!ids) {
    ids = new Set(snapshot.records.map((record) => record.message.id))
    userHistoryRecordIDs.set(snapshot.records, ids)
  }
  return ids
}

/**
 * The user's prompts in the visible transcript of a session, oldest first.
 * Session-scoped ArrowUp recall merges this with the persisted input history,
 * so sessions that predate the persisted store still recall their prompts.
 */
export function useUserMessageHistory(sessionID: string, directory?: string): TranscriptPrompt[] {
  const store = useDirectoryStore(directory)
  const snapshotRef = useRef<UserMessageHistorySnapshot>(EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT)

  const getSnapshot = useCallback(() => {
    const next = buildUserMessageHistorySnapshot(store.getState(), sessionID, snapshotRef.current)
    snapshotRef.current = next
    return next.history
  }, [sessionID, store])

  const subscribe = useCallback((notify: () => void) => {
    if (!sessionID) return () => undefined
    const unsubscribeMessages = subscribeDirectorySessionMessages(store, sessionID, (change) => {
      if (!change.messagesChanged && !change.reset && change.partMessageIDs.length > 0) {
        const snapshot = snapshotRef.current
        const recordIDs = snapshot.sessionID === sessionID ? getUserHistoryRecordIDs(snapshot) : EMPTY_RECORD_IDS
        const affectsUserHistory = change.partMessageIDs.some((messageID) => recordIDs.has(messageID))
        if (!affectsUserHistory) {
          countSyncPerformance("userMessageHistoryNotificationSkips")
          return
        }
      }
      notify()
    })
    const unsubscribeSession = store.subscribe((state, previous) => {
      if (state.session === previous.session) return
      if (getSessionRevertMessageID(state.session, sessionID) !== getSessionRevertMessageID(previous.session, sessionID)) notify()
    })
    return () => {
      unsubscribeMessages()
      unsubscribeSession()
    }
  }, [sessionID, store])

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Get messages for a session in the old {info, parts}[] format.
 * Uses visible messages (filtered by revert state).
 *
 * Uses a ref-stable parts lookup that only triggers re-renders when
 * a part array for one of our displayed messages actually changes.
 */
export function useSessionMessageRecords(
  sessionID: string,
  directory?: string,
  options?: { enabled?: boolean; suspendPartUpdates?: boolean; suspendPartUpdatesForMessageId?: string | null },
) {
  const store = useDirectoryStore(directory)
  const snapshotRef = useRef<SessionMessageRecordsSnapshot>({
    sessionID,
    sourceMessages: EMPTY_MESSAGES,
    visibleMessages: EMPTY_MESSAGES,
    revertMessageID: undefined,
    suspendPartUpdates: Boolean(options?.suspendPartUpdates),
    suspendedPartUpdatesMessageID: options?.suspendPartUpdatesForMessageId ?? undefined,
    list: [],
    byId: new Map(),
  })

  const getSnapshot = useCallback(() => {
    if (!sessionID) {
      return EMPTY_SESSION_MESSAGE_RECORDS
    }
    if (options?.enabled === false) {
      return snapshotRef.current.sessionID === sessionID ? snapshotRef.current.list : EMPTY_SESSION_MESSAGE_RECORDS
    }

    snapshotRef.current = readSessionMessageRecordsSnapshot(
      store,
      sessionID,
      snapshotRef.current,
      Boolean(options?.suspendPartUpdates),
      options?.suspendPartUpdatesForMessageId ?? undefined,
    )
    return snapshotRef.current.list
  }, [options?.enabled, options?.suspendPartUpdates, options?.suspendPartUpdatesForMessageId, sessionID, store])

  const subscribe = useCallback((notify: () => void) => {
    if (!sessionID || options?.enabled === false) return () => undefined
    const unsubscribeMessages = subscribeDirectorySessionMessages(store, sessionID, (change) => {
      const suspendPartUpdates = Boolean(options?.suspendPartUpdates)
      const suspendedPartUpdatesMessageID = options?.suspendPartUpdatesForMessageId ?? undefined
      if (!change.messagesChanged && !change.reset && suspendPartUpdates && change.partMessageIDs.length > 0) {
        const state = store.getState()
        const snapshot = snapshotRef.current.sessionID === sessionID ? snapshotRef.current : undefined
        const allChangesSuspended = change.partMessageIDs.every((messageID) => {
          if (suspendedPartUpdatesMessageID && messageID !== suspendedPartUpdatesMessageID) return false
          const previousParts = snapshot?.byId.get(messageID)?.parts
          return Boolean(
            previousParts
            && !hasTaskSessionIdentityChange(previousParts, state.part[messageID]),
          )
        })
        if (allChangesSuspended) {
          countSyncPerformance("sessionMessageRecordNotificationSkips")
          return
        }
      }
      notify()
    })
    const unsubscribeSession = store.subscribe((state, previous) => {
      if (state.session === previous.session) return
      if (getSessionRevertMessageID(state.session, sessionID) !== getSessionRevertMessageID(previous.session, sessionID)) notify()
    })
    return () => {
      unsubscribeMessages()
      unsubscribeSession()
    }
  }, [options?.enabled, options?.suspendPartUpdates, options?.suspendPartUpdatesForMessageId, sessionID, store])

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
>>>>>>> bc50ba56a
}

export type SessionMessageRecordsSnapshot = { sessionId: string; list: Message[]; byId: ReadonlyMap<string, Message> }
export function buildSessionMessageRecordsSnapshot(state: State, sessionId: string, previous?: SessionMessageRecordsSnapshot): SessionMessageRecordsSnapshot {
  const list = state.message[sessionId] ?? EMPTY_MESSAGES
  return previous?.sessionId === sessionId && previous.list === list ? previous : { sessionId, list, byId: new Map(list.map((message) => [message.messageId, message])) }
}
export function useSessionMessageRecords(sessionId: string, directory?: string, options?: { enabled?: boolean; suspendPartUpdates?: boolean; suspendPartUpdatesForMessageId?: string | null }): Message[] {
  const store = useDirectoryStore(directory)
  const cache = useRef<SessionMessageRecordsSnapshot>({ sessionId, list: EMPTY_MESSAGES, byId: new Map() })
  const get = useCallback(() => { if (options?.enabled === false) return cache.current.sessionId === sessionId ? cache.current.list : EMPTY_MESSAGES; cache.current = buildSessionMessageRecordsSnapshot(store.getState(), sessionId, cache.current); return cache.current.list }, [store, sessionId, options?.enabled])
  return useSyncExternalStore(useCallback((notify) => options?.enabled === false ? () => { } : subscribeDirectorySessionMessages(store, sessionId, (change) => { if (options?.suspendPartUpdates && !change.messagesChanged && !change.reset && change.partMessageIds.length && change.partMessageIds.every((id) => !options.suspendPartUpdatesForMessageId || id === options.suspendPartUpdatesForMessageId)) return; notify() }), [store, sessionId, options?.enabled, options?.suspendPartUpdates, options?.suspendPartUpdatesForMessageId]), get, get)
}
export function useUserMessageHistory(sessionId: string, directory?: string): TranscriptPrompt[] {
  const store = useDirectoryStore(directory)
  const cache = useRef(EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT)
  const get = useCallback(() => { cache.current = buildUserMessageHistorySnapshot(store.getState(), sessionId, cache.current); return cache.current.history }, [store, sessionId])
  return useSyncExternalStore(useCallback((notify) => subscribeDirectorySessionMessages(store, sessionId, notify), [store, sessionId]), get, get)
}
/** Inline parts selector; the canonical store never carries a split part map. */
export function useSessionPartsForMessages(sessionId: string, messageIds: readonly string[], directory?: string): Record<string, Part[]> {
  const store = useDirectoryStore(directory)
  const cache = useRef<Record<string, Part[]>>(EMPTY_PART_MAP)
  const get = useCallback(() => {
    const wanted = new Set(messageIds)
    const next: Record<string, Part[]> = {}
    for (const message of store.getState().message[sessionId] ?? EMPTY_MESSAGES) if (wanted.has(message.messageId)) next[message.messageId] = message.parts
    const previous = cache.current
    if (Object.keys(previous).length !== Object.keys(next).length || Object.keys(next).some((id) => next[id] !== previous[id])) cache.current = next
    return cache.current
  }, [store, sessionId, messageIds])
  return useSyncExternalStore(useCallback((notify) => subscribeDirectorySessionMessages(store, sessionId, (change) => { if (change.reset || change.messagesChanged || change.partMessageIds.some((id) => messageIds.includes(id))) notify() }), [store, sessionId, messageIds]), get, get)
}
