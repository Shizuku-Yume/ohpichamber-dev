
import { applySessionLiveWorkEvents, applySessionLiveWorkSnapshot } from "./session-live-work"
/* eslint-disable react-refresh/only-export-components -- SyncProvider, its contexts, hooks, and runtime helpers are one contract module. */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { useStore, type StoreApi } from "zustand"
import type { ApprovalRequest, CanonicalEvent, Part, QuestionRequest, Run, Session, SessionCompacting, SessionRuntimeStatus, SessionSnapshot, TodoPhase } from "@openchamber/agent-contract"
import { canonicalClient, type CanonicalClient } from "@/api/canonicalClient"
import { getRuntimeKey, subscribeRuntimeEndpointChanged, subscribeRuntimeEndpointWillChange } from "@/lib/runtime-switch"
import { normalizePath } from "@/lib/pathNormalization"
import { useAuthSessionStore } from "@/lib/runtime-auth-expiry"
import { useConfigStore } from "@/stores/useConfigStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { resolveWorkspaceDirectory, subscribeWorkspaceDirectories } from "@/stores/globalSessions"
import { ChildStoreManager, markDirectorySessionPartChanged, subscribeDirectoryPermission, subscribeDirectoryForm, type DirectoryStore, type DirectoryBootstrapPriority, type DirectoryBootstrapReason } from "./child-store"
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
import { subscribeExtensionWaitsSync } from "./extension-waits-sync";
import { resetExtensionWaitsForRuntimeSwitch } from "./extension-waits";
import { subscribeAutoReviewSync } from "./auto-review-sync";

import { getImperativeSessionMessageLoader, setImperativeSessionMessageLoader, type SessionMessageLoadState, type SessionMessageTarget } from "./session-message-loader"
import { createSyncStores, takePrefetchedSyncStores } from './sync-stores'
export { prefetchSessionBeforeMount } from './sync-stores'
import { setSyncRefs } from "./sync-refs"
import { setActionRefs, setOptimisticRefs } from "./session-actions"
import { aggregateLiveSessions, aggregateLiveSessionStatuses, areSessionListsEquivalent, areStatusMapsEquivalent, findLiveSession } from "./live-aggregate"
import { applyGlobalSessionStatusEvents, applyGlobalSessionStatusSnapshot, useGlobalSessionStatusStore, setSessionParentResolver } from "./global-session-status"
import { applyGlobalBlockingRequestEvents, replaceGlobalBlockingRequestSnapshot } from "./global-blocking-requests"
import { applyBackgroundShellEvents } from "./background-shells"
import { collectScopedBlockingRequests, areRequestArraysReferentiallyEqual } from "./scoped-blocking-requests"
import { appendErrorNotification } from "./notification-store"
import { recordSessionError, summarizeSessionError } from "./session-error-log"
import type { State } from "./types"
import { sessionEvents } from "@/lib/sessionEvents"
import { fileTreeChanges } from "@/lib/fileTreeChanges"
import { SyncContext, SyncRuntimeContext, useSyncRuntime, useSyncSystem, type CurrentDirectorySource, type SyncRuntime, type SyncSystem } from './sync-runtime-context'
export { SyncContext, SyncRuntimeContext, useSyncRuntime, type SyncRuntime } from './sync-runtime-context'

const EMPTY_APPROVALS: ApprovalRequest[] = []
const EMPTY_QUESTIONS: QuestionRequest[] = []
const EMPTY_LOAD: SessionMessageLoadState = { status: "idle", loadingKind: null, error: null, resolved: false, limit: 0, cursor: undefined, complete: false, generation: 0, updatedAt: undefined }
let activeTarget: SessionMessageTarget | null = null
const externallyViewedSessions = new Map<string, number>()
// Browsers allow six HTTP/1.1 connections per origin across every tab, and each
// session stream holds one. Only viewed and live sessions keep a stream; an idle
// session left off screen is parked and resumes from its head when viewed again.
const LIVE_STREAM_STATUSES = new Set<SessionRuntimeStatus>(["running", "awaiting_approval", "awaiting_input"])
const STREAM_PARK_DELAY_MS = 15_000
let onViewedSessionChange: ((target: SessionMessageTarget) => void) | null = null
// A send asks for its session's stream even when the chat is not on screen.
const streamRequests = new Map<string, number>()

function isViewedSession(target: SessionMessageTarget): boolean {
  return activeTarget?.directory === target.directory && activeTarget.sessionId === target.sessionId
    || (externallyViewedSessions.get(`${target.directory}\n${target.sessionId}`) ?? 0) > Date.now()
}

export function setActiveSession(directory: string, sessionId: string) {
  const previous = activeTarget
  const normalized = normalizePath(directory)
  activeTarget = normalized && sessionId ? { directory: normalized, sessionId } : null
  const loader = getImperativeSessionMessageLoader()
  if (previous) loader?.scheduleCacheRetention(previous.directory)
  if (activeTarget) loader?.touchSessionCache(activeTarget)
  if (previous) onViewedSessionChange?.(previous)
  if (activeTarget) onViewedSessionChange?.(activeTarget)
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
  onViewedSessionChange?.({ directory: normalized, sessionId })
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
    if (event.type === "btw.delta" || event.type === "btw.completed" || event.type === "subagent.updated") {
      const result = applyDirectoryEvent(next, event)
      if (result.kind === "resnapshot") { contiguous = false; break }
      if (result.kind === "duplicate") continue
      next = result.state
    }
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
  const parkStreamRef = useRef<((target: SessionMessageTarget) => void) | null>(null)
  const storesRef = useRef<ReturnType<typeof createSyncStores> | null>(null)
  if (!storesRef.current) {
    storesRef.current = takePrefetchedSyncStores(client, props.runtimeKey) ?? createSyncStores(client, props.runtimeKey)
  }
  const stores = storesRef.current
  if (stores.configuration.client !== client) stores.configuration = { ...stores.configuration, client }
  const { childStores, messageLoader } = stores
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
  const wantsStream = useCallback((target: SessionMessageTarget, runtimeStatus?: SessionRuntimeStatus) => {
    if (isViewedSession(target) || (runtimeStatus !== undefined && LIVE_STREAM_STATUSES.has(runtimeStatus))) return true
    if ((streamRequests.get(`${target.directory}\n${target.sessionId}`) ?? 0) > Date.now()) return true
    // BTW answers stream only as transient events that a resumed stream cannot replay.
    const btw = useBtwStore.getState().byParent[target.sessionId]
    if (btw?.ephemeralStatus === "running" || btw?.pendingSend) return true
    const status = childStores.getChild(target.directory)?.getState().session_status[target.sessionId]
    return status !== undefined && LIVE_STREAM_STATUSES.has(status)
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
    if (wantsStream(target, snapshot.session.runtimeStatus)) pipelineRef.current?.attach(target, snapshot)
    else parkStreamRef.current?.(target)
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
  }, [childStores, isCurrent, isKnownChildSession, wantsStream])
  stores.callbacks.isCurrent = isCurrent
  stores.callbacks.onSnapshot = onSnapshot
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
      const recoverySessions = new Set<string>()
      for (const item of session) {
        const cached = store.getState().snapshot[item.sessionId]?.session
        if (cached && item.rootSessionId === item.sessionId
          && (item.epoch !== cached.epoch || compareCounters(item.headSequence, cached.headSequence) > 0)
          && (item.runtimeStatus !== cached.runtimeStatus || item.activeRunId !== cached.activeRunId)) recoverySessions.add(item.sessionId)
      }
      // Discovering a child must also recover its parent's task tool record.
      await Promise.allSettled([
        ...live.filter((item) => !store.getState().snapshot[item.sessionId]).map((item) => messageLoader.ensure({ directory, sessionId: item.sessionId }, { reason: "reactive" })),
        ...[...newChildParents].filter((sessionId) => !recoverySessions.has(sessionId) && Boolean(store.getState().snapshot[sessionId])).map((sessionId) => messageLoader.refresh({ directory, sessionId })),
        ...[...recoverySessions].filter((sessionId) => Boolean(store.getState().snapshot[sessionId])).map((sessionId) => messageLoader.refresh({ directory, sessionId }, undefined, { recovered: true })),
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
    messageLoader.configure(stores.configuration)
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
        if (!isViewedSession(target)) parkStreamRef.current?.(target)
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
    const parkTimers = new Map<string, ReturnType<typeof setTimeout>>()
    // Off-screen streams are rechecked every STREAM_PARK_DELAY_MS until unwanted, so
    // post-run events (suggestions) still arrive and expired send requests release.
    const parkStream = (target: SessionMessageTarget) => {
      const streamKey = `${target.directory}\n${target.sessionId}`
      if (!pipeline.has(target) || parkTimers.has(streamKey)) return
      parkTimers.set(streamKey, setTimeout(() => {
        parkTimers.delete(streamKey)
        if (!isCurrent() || !pipeline.has(target)) return
        if (!wantsStream(target)) pipeline.detach(target)
        else if (!isViewedSession(target)) parkStream(target)
      }, STREAM_PARK_DELAY_MS))
    }
    parkStreamRef.current = parkStream
    const viewedSessionChange = (target: SessionMessageTarget) => {
      if (!isCurrent()) return
      const streamKey = `${target.directory}\n${target.sessionId}`
      if (isViewedSession(target)) {
        clearTimeout(parkTimers.get(streamKey))
        parkTimers.delete(streamKey)
        const snapshot = childStores.getChild(target.directory)?.getState().snapshot[target.sessionId]
        if (!snapshot || pipeline.has(target) || isKnownChildSession(target.directory, target.sessionId)) return
        const { epoch, headSequence, runtimeStatus } = snapshot.session
        pipeline.attach(target, { cursor: `${epoch}:${headSequence}`, session: { sessionId: target.sessionId, runtimeStatus } })
        return
      }
      parkStream(target)
    }
    onViewedSessionChange = viewedSessionChange
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
    const unsubscribeExtensionWaitEvents = subscribeExtensionWaitsSync(props.runtimeKey ?? getRuntimeKey());
    const unsubscribeAutoReviewEvents = subscribeAutoReviewSync(props.runtimeKey ?? getRuntimeKey());
    const stopBeforeSwitch = subscribeRuntimeEndpointWillChange((detail) => {
      if (detail.runtimeKey === props.runtimeKey) return
      currentRef.current = false
      pipeline.cleanup()
      useGlobalSyncStore.getState().actions.reset()
      resetExtensionWaitsForRuntimeSwitch()
      activeTarget = null
      externallyViewedSessions.clear()
      streamRequests.clear()
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
        onSnapshot({ directory, sessionId: snapshot.session.sessionId }, snapshot)
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
      unsubscribeExtensionWaitEvents()
      window.removeEventListener("online", resume)
      window.removeEventListener("offline", offline)
      window.removeEventListener("pageshow", pageshow)
      window.removeEventListener("openchamber:system-resume", resume)
      document.removeEventListener("visibilitychange", visible)
      if (pipelineRef.current === pipeline) pipelineRef.current = null
      if (onViewedSessionChange === viewedSessionChange) onViewedSessionChange = null
      if (parkStreamRef.current === parkStream) parkStreamRef.current = null
      for (const timer of parkTimers.values()) clearTimeout(timer)
      disposalRef.current = setTimeout(() => { messageLoader.dispose(); childStores.disposeAll() }, 0)
    }
  }, [childStores, client, isCurrent, isKnownChildSession, loadSessions, messageLoader, onSnapshot, props.runtimeKey, stores, wantsStream])

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
        streamRequests.set(`${dir}\n${sessionId}`, Date.now() + STREAM_PARK_DELAY_MS)
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
    isViewed: isViewedSession,
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

const bootingRoot = false

const bootedAt = 0

const BOOT_DEBOUNCE_MS = 1500

export function isRecentBoot() {
  return bootingRoot || Date.now() - bootedAt < BOOT_DEBOUNCE_MS
}

export { useSessionMessages, useSessionMessagesSelector, useSessionRenderable, useUserMessageHistory, useSessionPartsForMessages } from './session-message-hooks'
export { buildSessionMessageRecordsSnapshot, useSessionMessageRecords, type SessionMessageRecordsSnapshot } from './session-message-records'
