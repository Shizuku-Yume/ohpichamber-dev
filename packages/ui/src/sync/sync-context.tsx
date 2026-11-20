
import { applySessionLiveWorkEvents, applySessionLiveWorkSnapshot } from "./session-live-work"
/* eslint-disable react-refresh/only-export-components -- SyncProvider, its contexts, hooks, and runtime helpers are one contract module. */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { useStore, type StoreApi } from "zustand"
import type { ApprovalRequest, CanonicalEvent, Message, Part, QuestionRequest, Run, Session, SessionCompacting, SessionRuntimeStatus, SessionSnapshot, TodoPhase } from "@openchamber/agent-contract"
import { canonicalClient, type CanonicalClient } from "@/api/canonicalClient"
import { getRuntimeKey, subscribeRuntimeEndpointChanged, subscribeRuntimeEndpointWillChange } from "@/lib/runtime-switch"
import { normalizePath } from "@/lib/pathNormalization"
import { useAuthSessionStore } from "@/lib/runtime-auth-expiry"
import { useConfigStore } from "@/stores/useConfigStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { resolveWorkspaceDirectory, subscribeWorkspaceDirectories } from "@/stores/globalSessions"
import { ChildStoreManager, markDirectorySessionPartChanged, subscribeDirectorySessionMessages, subscribeDirectoryPermission, subscribeDirectoryForm, type DirectoryStore, type DirectoryBootstrapPriority, type DirectoryBootstrapReason } from "./child-store"
import { bootstrapDirectory, bootstrapGlobal } from "./bootstrap"
import { BootstrapFailureError } from "./retry"
import { notifyFirstCanonicalBootstrap } from "./first-server-connect"
import { useGlobalSyncStore } from "./global-sync-store"
import { applyDirectoryEvent, compareCounters, installSessionList, mergeHostSession } from "./event-reducer"
import { useBtwStore } from "@/stores/useBtwStore"
import { useSubagentsStore } from "@/stores/useSubagentsStore"
import { useSessionRecapStore } from "@/stores/useSessionRecapStore"
import { useSessionSuggestionStore } from "@/stores/useSessionSuggestionStore"
import { useCleanseStore } from "@/stores/useCleanseStore"
import { useAdvisorStore } from "@/stores/useAdvisorStore"
import { createEventPipeline, type EventPipeline } from "./event-pipeline"
import { subscribeSessionFoldersSync } from "./session-folders-sync";
import { subscribeSessionDraftsSync } from "./session-drafts-sync";
import { subscribeMessageQueueSync } from "./message-queue-sync";
import { subscribeSessionAdmission } from "./session-admission";
import { subscribeControlStreamSync } from "./control-stream-sync";
import { subscribeSessionMetadataSync } from "./session-metadata-sync";
import { subscribePrWatchSync } from "./pr-watch-sync";
import { subscribeAutoReviewSync } from "./auto-review-sync";

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
import { appendErrorNotification } from "./notification-store"
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
      continue
    }
    if (event.type === "btw.delta" || event.type === "btw.completed") continue
    if (event.type === "subagent.updated") {
      useSubagentsStore.getState().applySubagentUpdate(target.sessionId, event.subagent);
      continue;
    }
    if (event.type === "session.recap") {
      useSessionRecapStore.getState().applyRecap(event);
    }
    if (event.type === "session.suggestion") {
      useSessionSuggestionStore.getState().applySuggestion(event);
    }
    if (event.type === "run.started" || event.type === "turn.started") {
      useSessionSuggestionStore.getState().clearSuggestion(target.sessionId);
    }
    if (event.type === "cleanse.progress") {
      useCleanseStore.getState().applyCleanseProgress(target.sessionId, event);
    }
    if (event.type === "advisor_yielded") {
      useAdvisorStore.getState().applyAdvisorYielded(target.sessionId, event);
    }
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
  }
  if (next !== original) {
    store.setState(next)
  }
  if (accepted.length) {
    applySessionLiveWorkEvents(accepted)
    applyGlobalSessionStatusEvents(target.directory, accepted)
    applyGlobalBlockingRequestEvents(target.directory, accepted)
    applyBackgroundShellEvents(target.directory, accepted)
    // A finished turn leaves its unread mark on the session record, which the
    // server stamps; this store keeps only the error details the record lacks.
    for (const event of outcomes) {
      if (event.type !== "run.failed") continue
      const error = summarizeSessionError(event.error)
      recordSessionError({ ...error, sessionId: target.sessionId, directory: target.directory })
      appendErrorNotification({ directory: target.directory, session: target.sessionId, time: event.finishedAt, error })
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
  /**
   * A child session's transcript is served by the history route only. Its
   * snapshot, metadata, queue and event routes are root-only, so nothing in
   * this provider may attach a stream or read those authorities for it.
   */
  const isKnownChildSession = useCallback((directory: string, sessionId: string): boolean => {
    const store = childStores.getChild(directory)
    const projected = store?.getState().session.find((item) => item.sessionId === sessionId)
      ?? useGlobalSessionsStore.getState().entityById.get(sessionId)
    if (projected) return projected.rootSessionId !== projected.sessionId
    const subagents = useSubagentsStore.getState().byParent
    for (const parentId in subagents) {
      const child = subagents[parentId].find((item) => item.subagentId === sessionId || item.childSessionId === sessionId)
      if (child) return true
    }
    return false
  }, [childStores])
  const onSnapshot = useCallback((target: SessionMessageTarget, snapshot: SessionSnapshot, recoveryPrevious?: SessionSnapshot) => {
    if (!isCurrent()) return
    const store = childStores.getChild(target.directory)
    if (!store || store.getState().snapshot[target.sessionId]?.cursor !== snapshot.cursor) return
    applySessionLiveWorkSnapshot(snapshot)
    if (isKnownChildSession(target.directory, target.sessionId)) return
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
  }, [childStores, isCurrent, isKnownChildSession])
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
      }
      for (const previous of prior.session) if ((prior.sessionEventRevision?.[previous.sessionId] ?? 0) > revision || previous.sessionId in listed.errors || workspace.workspaceId in listed.errors || workspace.projectId in listed.errors) byId.set(previous.sessionId, previous)
      const rows = [...byId.values()].filter((item) => item.archivedAt === undefined)
      // A metadata record announced before this read is newer than the row the
      // list carries, and this is the first place its directory is known.
      const listedState = installSessionList(prior, rows)
      const session = listedState.session
      const unchanged = session.length === prior.session.length && session.every((item, index) => item === prior.session[index])
      store.setState({ ...listedState, session: unchanged ? prior.session : session, sessionTotal: session.length, limit: Math.max(prior.limit, session.length), sessionListSource: Object.keys(listed.errors).length ? "live" : "authoritative", discoveryErrors: listed.errors })
      useGlobalSessionsStore.getState().upsertSessions([...byId.values()])
      if (Object.keys(listed.errors).length === 0) useGlobalSessionsStore.getState().clearWorkspaceDiscoveryErrors(workspace.workspaceId)
      // Only a root session has a snapshot to materialize; a child is read
      // through its history when it is opened.
      const live = session.filter((item) => item.rootSessionId === item.sessionId
        && (item.runtimeStatus === "running" || item.runtimeStatus === "awaiting_approval" || item.runtimeStatus === "awaiting_input"))
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
        // A failed read must reach the pipeline as a failure so it keeps its
        // permanent-4xx backoff; a resolved refresh is the only success.
        const failure = messageLoader.getSnapshot(target).error
        if (failure) throw failure
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
    const unsubscribePrWatchEvents = subscribePrWatchSync(props.runtimeKey ?? getRuntimeKey());
    const unsubscribeAutoReviewEvents = subscribeAutoReviewSync(props.runtimeKey ?? getRuntimeKey());
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
      for (const snapshot of Object.values(store.getState().snapshot)) {
        if (isKnownChildSession(directory, snapshot.session.sessionId)) continue
        pipeline.attach({ directory, sessionId: snapshot.session.sessionId }, snapshot)
      }
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
      stopBeforeSwitch(); resumeAfterSwitch(); stopAuthRecovery(); stopConnectionRecovery(); unconfigure(); pipeline.cleanup(); clearInterval(discoveryTimer); unsubscribeFolderEvents(); unsubscribeDraftEvents(); unsubscribeMessageQueueEvents(); unsubscribeMetadataEvents(); unsubscribeSessionAdmission(); unsubscribeControlStream(); unsubscribePrWatchEvents(); unsubscribeAutoReviewEvents();
      window.removeEventListener("online", resume)
      window.removeEventListener("offline", offline)
      window.removeEventListener("pageshow", pageshow)
      window.removeEventListener("openchamber:system-resume", resume)
      document.removeEventListener("visibilitychange", visible)
      if (pipelineRef.current === pipeline) pipelineRef.current = null
      disposalRef.current = setTimeout(() => { messageLoader.dispose(); childStores.disposeAll() }, 0)
    }
  }, [childStores, client, isCurrent, isKnownChildSession, loadSessions, messageLoader, onSnapshot, props.runtimeKey])

  useEffect(() => {
    const directory = currentDirectoryRef.current
    if (directory) childStores.ensureChild(directory, { priority: "selected", reason: "current-directory" })
    setSyncRefs(childStores, directory)
    setActionRefs(
      childStores,
      () => currentDirectoryRef.current,
      (targetDirectory, sessionId) => {
        if (isCurrent()) void messageLoader.refresh({ directory: targetDirectory, sessionId }).catch(() => { })
      },
      (sessionId, targetDirectory, options) => {
        if (!isCurrent()) return
        const dir = targetDirectory || currentDirectoryRef.current
        if (isKnownChildSession(dir, sessionId)) {
          pipelineRef.current?.detach({ directory: dir, sessionId })
          return
        }
        if (options?.refreshSnapshot) {
          void messageLoader.refresh({ directory: dir, sessionId }, undefined, { recovered: true, requireAvailable: true })
          return
        }
        const store = childStores.getChild(dir)
        const snapshot = store?.getState().snapshot[sessionId]
        if (snapshot) {
          pipelineRef.current?.attach({ directory: dir, sessionId }, snapshot)
          return
        }
        const session = store?.getState().session.find(s => s.sessionId === sessionId)
          ?? useGlobalSessionsStore.getState().entityById.get(sessionId)
        if (session) {
          const cursor = `${session.epoch}:${session.headSequence}`
          pipelineRef.current?.attach({ directory: dir, sessionId }, { cursor, session: { sessionId, runtimeStatus: session.runtimeStatus } })
        }
      },
      (sessionId, targetDirectory) => {
        if (!isCurrent()) return
        pipelineRef.current?.detach({ directory: targetDirectory, sessionId })
      },
    )
    setOptimisticRefs(
      (input) => { if (isCurrent()) messageLoader.optimisticAdd({ ...input, directory: input.directory || currentDirectoryRef.current }) },
      (input) => { if (isCurrent()) messageLoader.optimisticRemove({ ...input, directory: input.directory || currentDirectoryRef.current }) },
      (input) => { if (isCurrent()) messageLoader.optimisticConfirm({ ...input, directory: input.directory || currentDirectoryRef.current }) },
    )
    setImperativeSessionMessageLoader(messageLoader)
    return () => { if (getImperativeSessionMessageLoader() === messageLoader) setImperativeSessionMessageLoader(null) }
  }, [childStores, isCurrent, isKnownChildSession, messageLoader, props.directory])

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
export function useSessionRenderable(sessionId: string, directory?: string): boolean { return useSessionMessagesSelector(sessionId, directory, (_messages, state) => getSessionMaterializationStatus(state, sessionId).renderable) }
export function useSessionStatus(sessionId: string, directory?: string): SessionRuntimeStatus | undefined { return useDirectorySync(useCallback((state) => state.sessionStatusInvalidated?.[sessionId] ? "unavailable" : state.session_status[sessionId], [sessionId]), directory) }
export function useSessionActiveRun(sessionId: string, directory?: string): Run | null {
  return useDirectorySync(useCallback((state) => state.snapshot[sessionId]?.activeRun ?? null, [sessionId]), directory)
}
export function useSessionCompacting(sessionId: string | null | undefined, directory?: string): SessionCompacting | null {
  return useDirectorySync(useCallback((state) => (sessionId ? state.snapshot[sessionId]?.compacting ?? null : null), [sessionId]), directory)
}
const EMPTY_TODOS: TodoPhase[] = []
export function useSessionTodos(sessionId: string | null | undefined, directory?: string): TodoPhase[] {
  return useDirectorySync(useCallback((state) => (sessionId ? state.snapshot[sessionId]?.todos ?? EMPTY_TODOS : EMPTY_TODOS), [sessionId]), directory)
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

function useLiveSelector<T>(selector: (states: State[]) => T, isEqual: (left: T, right: T) => boolean, slice: "session" | "session_status"): T {
  const { childStores } = useSyncRuntime()
  const cache = useRef<{ value: T } | null>(null)
  const get = useCallback(() => { const value = selector(Array.from(childStores.children.values(), (store) => store.getState())); if (!cache.current || !isEqual(cache.current.value, value)) cache.current = { value }; return cache.current.value }, [childStores, selector, isEqual])
  return useSyncExternalStore(useCallback((notify) => childStores.subscribeAllSelected((state) => state[slice], notify), [childStores, slice]), get, get)
}
export function useAllLiveSessions(): Session[] { return useLiveSelector(aggregateLiveSessions, areSessionListsEquivalent, "session") }
export function useLiveSessionsExcluding(excludedIds: ReadonlySet<string>): Session[] { return useLiveSelector(useCallback((states) => aggregateLiveSessions(states).filter((session) => !excludedIds.has(session.sessionId)), [excludedIds]), areSessionListsEquivalent, "session") }
export function useAllSessionStatuses(): Record<string, SessionRuntimeStatus> { return useLiveSelector(aggregateLiveSessionStatuses, areStatusMapsEquivalent, "session_status") }

export function useSession(sessionId?: string | null, directory?: string): Session | undefined {
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

let bootingRoot = false

let bootedAt = 0

const BOOT_DEBOUNCE_MS = 1500

export function isRecentBoot() {
  return bootingRoot || Date.now() - bootedAt < BOOT_DEBOUNCE_MS
}
