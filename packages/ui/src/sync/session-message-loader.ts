import type { StoreApi } from "zustand"
import type { HistoryPage, Message, Run, Session, SessionSnapshot, Turn } from "@openchamber/agent-contract"
import type { CanonicalClient } from "@/api/canonicalClient"
import type { ChildStoreManager, DirectoryStore } from "./child-store"
import { compareCounters, installHostSession, installQueue, installSessionMetadata, installSessionSnapshot } from "./event-reducer"
import { findMessageIndex, insertMessageChronologically, sortMessagesChronologically } from "./message-ordering"
import { mergeMessages, mergeOptimisticPage, type OptimisticItem } from "./optimistic"
import { clearDirectorySessionPrefetch, clearRuntimeSessionPrefetch, clearSessionPrefetch, getSessionPrefetch, setSessionPrefetch } from "./session-prefetch-cache"
import { isMobileSurfaceRuntime } from "@/lib/runtimeSurface"
import { normalizePath } from "@/lib/pathNormalization"
import { isDraftSessionId } from "@/lib/sessionIdentity"
import { isRetiredSessionId } from "./session-rekey-registry"
import { registerWorkspaceDirectory } from "@/stores/globalSessions"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useSubagentsStore } from "@/stores/useSubagentsStore"
import { startSessionLoadPerformanceEvent } from "./session-load-performance"
import { dropSessionCaches } from "./session-cache"
import { SessionCacheRetention } from "./session-cache-retention"
import { SESSION_CACHE_LIMIT, type State } from "./types"

const HISTORY_PAGE_SIZE = 100
const INITIAL_USER_TURNS = 10
const CONSTRAINED_SESSION_CACHE_LIMIT = 6

export type SessionMessageTarget = { directory: string; sessionId: string }
export type SessionMessageLoadKind = "initial" | "older" | "refresh" | "prefetch"
export type SessionMessageLoadStatus = "idle" | "loading" | "ready" | "error"
export type SessionMessageLoadState = {
  status: SessionMessageLoadStatus
  loadingKind: SessionMessageLoadKind | null
  error: Error | null
  resolved: boolean
  limit: number
  /** HistoryPage.nextCursor only. Never an SSE cursor. */
  cursor: string | undefined
  complete: boolean
  generation: number
  updatedAt: number | undefined
}
export type LoaderConfiguration = {
  client: CanonicalClient
  runtimeKey: string
  onSnapshot?: (target: SessionMessageTarget, snapshot: SessionSnapshot, recoveryPrevious?: SessionSnapshot) => void
  isCurrent?: () => boolean
}
type LoaderEntry = {
  snapshot: SessionMessageLoadState
  listeners: Set<() => void>
  inflight: Promise<void> | null
  queuedRefresh: Promise<void> | null
  queuedRecovery: Promise<void> | null
  optimistic: Map<string, OptimisticItem>
  evicted: boolean
  historyBranch?: Branch
}
type ChildStore = StoreApi<DirectoryStore>
type Branch = SessionSnapshot["branch"]

const createDefaultState = (generation = 0): SessionMessageLoadState => ({
  status: "idle", loadingKind: null, error: null, resolved: false,
  limit: isMobileSurfaceRuntime() ? 50 : 100, cursor: undefined, complete: false,
  generation, updatedAt: undefined,
})
export const EMPTY_SESSION_MESSAGE_LOAD_STATE = createDefaultState()

function partOwners(messages: readonly Message[]): Record<string, string> {
  const owners: Record<string, string> = {}
  for (const message of messages) for (const part of message.parts) owners[part.partId] = message.messageId
  return owners
}

/**
 * Run control is a live observation, not transcript history, so a snapshot
 * read that started before a run acknowledgement cannot release the run that
 * acknowledgement bound. The exception is deliberately exact: an accepted
 * acknowledgement changed run control after the read started (`runControlRevision`,
 * not the broader session event revision), the read belongs to the same epoch,
 * its head did not advance past the live head, it reports no active run, and
 * the live state still binds one. A genuinely newer read, an epoch switch, a
 * settled run, an unrelated session update, or a different bound run keeps the
 * snapshot authoritative.
 */
function preserveInFlightRunControl(
  previous: SessionSnapshot | undefined,
  projected: Session | undefined,
  pendingRun: Run | undefined,
  snapshot: SessionSnapshot,
  state: State,
  requestedRunControlRevision: number,
): SessionSnapshot {
  // Before the first snapshot lands, an acknowledgement binds the projected
  // session row; that row is the previous head and binding for this window.
  const previousSession = previous?.session ?? projected
  if (!previousSession
    || (state.runControlRevision?.[snapshot.session.sessionId] ?? 0) <= requestedRunControlRevision
    || previousSession.epoch !== snapshot.session.epoch
    || compareCounters(snapshot.session.headSequence, previousSession.headSequence) > 0
    || snapshot.session.activeRunId !== null
    || previousSession.activeRunId === null) return snapshot
  return {
    ...snapshot,
    session: { ...snapshot.session, runtimeStatus: previousSession.runtimeStatus, activeRunId: previousSession.activeRunId },
    activeRun: previous?.activeRun ?? pendingRun ?? snapshot.activeRun,
  }
}

export class SessionMessageLoader {
  private configuration: LoaderConfiguration
  private configurationGeneration = 0
  private disposed = false
  private readonly entries = new Map<string, LoaderEntry>()
  private retention: SessionCacheRetention | null = null
  private releaseDerivedCache: (target: SessionMessageTarget) => void = () => undefined
  private readonly historyReaders = new Map<string, number>()
  private readonly renderedSessions = new Map<string, number>()

  constructor(private readonly childStores: ChildStoreManager, configuration: LoaderConfiguration) {
    this.configuration = configuration
  }

  configure(configuration: LoaderConfiguration): void {
    const previous = this.configuration
    this.configuration = configuration
    if (previous.client === configuration.client && previous.runtimeKey === configuration.runtimeKey
      && previous.onSnapshot === configuration.onSnapshot && previous.isCurrent === configuration.isCurrent) return
    this.configurationGeneration += 1
    const entries = [...this.entries.values()]
    if (previous.runtimeKey !== configuration.runtimeKey) {
      this.entries.clear()
      this.historyReaders.clear()
      this.renderedSessions.clear()
      clearRuntimeSessionPrefetch(previous.runtimeKey)
    }
    for (const entry of entries) {
      entry.snapshot = {
        ...entry.snapshot, generation: entry.snapshot.generation + 1,
        status: entry.snapshot.resolved ? "ready" : "idle", loadingKind: null, error: null,
      }
      entry.inflight = null
      entry.queuedRefresh = null
      entry.queuedRecovery = null
      this.notify(entry)
    }
  }

  activate(): void { this.disposed = false }

  startCacheRetention(options: {
    idleTtlMs?: number
    isCurrent: () => boolean
    isViewed: (target: SessionMessageTarget) => boolean
    isActive: (target: SessionMessageTarget) => boolean
    releaseDerivedCache: (target: SessionMessageTarget) => void
  }): () => void {
    this.retention?.dispose()
    this.releaseDerivedCache = options.releaseDerivedCache
    const retention = new SessionCacheRetention(this.childStores, {
      limit: isMobileSurfaceRuntime() ? CONSTRAINED_SESSION_CACHE_LIMIT : SESSION_CACHE_LIMIT,
      idleTtlMs: options.idleTtlMs, isCurrent: options.isCurrent, isViewed: options.isViewed,
      isProtected: target => {
        const key = this.keyFor(target)
        const entry = this.entries.get(key)
        return options.isActive(target) || Boolean(this.historyReaders.get(key))
          || Boolean(this.renderedSessions.get(key)) || Boolean(entry?.inflight) || Boolean(entry?.optimistic.size)
      },
      evict: target => this.evictSessionHistory(target),
    })
    this.retention = retention
    return () => {
      retention.dispose()
      if (this.retention === retention) this.retention = null
    }
  }

  touchSessionCache(target: SessionMessageTarget): void {
    const normalized = this.normalizeTarget(target)
    if (normalized) this.retention?.touch(normalized)
  }

  scheduleCacheRetention(directory: string): void {
    const normalized = normalizePath(directory)
    if (normalized) this.retention?.schedule(normalized)
  }

  retainSessionHistory(target: SessionMessageTarget, reason: "read" | "rendered" = "read"): () => void {
    const normalized = this.normalizeTarget(target)
    if (!normalized) return () => undefined
    const key = this.keyFor(normalized)
    const holders = reason === "rendered" ? this.renderedSessions : this.historyReaders
    holders.set(key, (holders.get(key) ?? 0) + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const remaining = (holders.get(key) ?? 1) - 1
      if (remaining > 0) holders.set(key, remaining)
      else holders.delete(key)
      this.scheduleCacheRetention(normalized.directory)
    }
  }

  private evictSessionHistory(target: SessionMessageTarget): void {
    const store = this.childStores.getChild(target.directory)
    if (!store) return
    const current = store.getState()
    const runControlActiveRun = current.runControlActiveRun ? { ...current.runControlActiveRun } : undefined
    if (runControlActiveRun) delete runControlActiveRun[target.sessionId]
    const draft = {
      message: { ...current.message }, snapshot: { ...current.snapshot }, partOwner: { ...current.partOwner },
      session_status: { ...current.session_status }, permission: { ...current.permission }, form: { ...current.form },
      sessionEpoch: { ...current.sessionEpoch }, sessionCursor: { ...current.sessionCursor },
      sessionStatusInvalidated: current.sessionStatusInvalidated ? { ...current.sessionStatusInvalidated } : undefined,
      runControlActiveRun,
    }
    this.invalidateSession(target)
    this.getEntry(target).evicted = true
    dropSessionCaches(draft, [target.sessionId])
    this.releaseDerivedCache(target)
    store.setState(draft)
  }

  /** Creation establishes visible empty history, not runtime or request authority. */
  initializeCreatedSession(target: SessionMessageTarget): void {
    const normalized = this.normalizeTarget(target)
    if (!normalized || this.disposed) return
    const store = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    const current = store.getState()
    if (current.message[normalized.sessionId] !== undefined) return
    store.setState({ message: { ...current.message, [normalized.sessionId]: [] } })
  }

  ensure(target: SessionMessageTarget, options?: { force?: boolean; reason?: "navigation" | "reactive" | "prefetch" }): Promise<void> {
    const normalized = this.readTarget(target)
    if (!normalized || this.disposed) return Promise.resolve()
    const entry = this.getEntry(normalized)
    const store = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    if (options?.reason !== "prefetch") this.touchSessionCache(normalized)
    if (entry.inflight) {
      if (options?.reason !== "prefetch" && entry.snapshot.loadingKind === "prefetch") this.patchEntry(entry, { loadingKind: "initial" })
      return entry.inflight
    }
    if (!options?.force && entry.snapshot.resolved && !entry.evicted
      && (store.getState().snapshot[normalized.sessionId] !== undefined
        || store.getState().message[normalized.sessionId] !== undefined)) return Promise.resolve()
    return this.startSnapshotLoad(normalized, entry, store, options?.reason === "prefetch" ? "prefetch" : "initial")
  }

  prefetch(target: SessionMessageTarget): Promise<void> {
    const normalized = this.readTarget(target)
    if (!normalized || this.disposed) return Promise.resolve()
    this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    if (this.retention && !this.retention.admitPrefetch(normalized)) return Promise.resolve()
    return this.ensure(normalized, { reason: "prefetch" })
  }

  refresh(target: SessionMessageTarget, snapshot?: SessionSnapshot, options?: { recovered?: boolean }): Promise<void> {
    const normalized = this.readTarget(target)
    if (!normalized || this.disposed) return Promise.resolve()
    if (snapshot) this.invalidateSession(normalized)
    const entry = this.getEntry(normalized)
    if (entry.inflight) {
      if (options?.recovered) {
        if (entry.queuedRecovery) return entry.queuedRecovery
        const generation = entry.snapshot.generation
        const configurationGeneration = this.configurationGeneration
        const key = this.keyFor(normalized)
        const queued = entry.inflight.then(() => {
          if (this.disposed || configurationGeneration !== this.configurationGeneration
            || generation !== entry.snapshot.generation || this.entries.get(key) !== entry) return
          return this.refresh(normalized, undefined, { recovered: true })
        })
        entry.queuedRecovery = queued
        const clear = () => { if (entry.queuedRecovery === queued) entry.queuedRecovery = null }
        void queued.then(clear, clear)
        return queued
      }
      if (entry.snapshot.loadingKind !== "older") return entry.inflight
      if (entry.queuedRefresh) return entry.queuedRefresh
      const generation = entry.snapshot.generation
      const configurationGeneration = this.configurationGeneration
      const key = this.keyFor(normalized)
      const queued = entry.inflight.then(() => {
        if (entry.queuedRefresh === queued) entry.queuedRefresh = null
        if (this.disposed || configurationGeneration !== this.configurationGeneration
          || generation !== entry.snapshot.generation || this.entries.get(key) !== entry) return
        return this.refresh(normalized)
      })
      entry.queuedRefresh = queued
      return queued
    }
    const store = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    return this.startSnapshotLoad(normalized, entry, store, "refresh", snapshot, options?.recovered === true)
  }

  loadOlder(target: SessionMessageTarget): Promise<void> {
    const normalized = this.readTarget(target)
    if (!normalized || this.disposed) return Promise.resolve()
    const entry = this.getEntry(normalized)
    if (entry.inflight && entry.snapshot.loadingKind === "older") return entry.inflight
    const childStore = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    if (this.knownChild(normalized, childStore)) {
      if (entry.inflight || !entry.snapshot.resolved) {
        const configurationGeneration = this.configurationGeneration
        const generation = entry.snapshot.generation
        const pending = entry.inflight ?? this.ensure(normalized)
        return pending.then(() => {
          if (this.disposed || configurationGeneration !== this.configurationGeneration
            || generation !== entry.snapshot.generation || entry.snapshot.status !== "ready"
            || !(this.configuration.isCurrent?.() ?? true)) return
          return this.loadOlder(normalized)
        })
      }
      if (entry.snapshot.complete) return Promise.resolve()
      return this.startChildHistoryLoad(normalized, entry, childStore, "older")
    }
    if (entry.inflight || !this.childStores.getChild(normalized.directory)?.getState().snapshot[normalized.sessionId]) {
      const generation = entry.snapshot.generation
      const configurationGeneration = this.configurationGeneration
      const key = this.keyFor(normalized)
      const pending = entry.inflight ?? this.ensure(normalized)
      return pending.then(() => {
        if (this.disposed || configurationGeneration !== this.configurationGeneration
          || generation !== entry.snapshot.generation || this.entries.get(key) !== entry
          || entry.snapshot.status !== "ready" || !(this.configuration.isCurrent?.() ?? true)) return
        return this.loadOlder(normalized)
      })
    }
    if (entry.snapshot.complete) return Promise.resolve()
    const store = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    const snapshot = store.getState().snapshot[normalized.sessionId]
    if (!snapshot) return this.ensure(normalized)
    const branch = snapshot.branch
    const epoch = snapshot.session.epoch
    const cursor = entry.snapshot.cursor
    const client = this.configuration.client
    return this.startLoad(normalized, entry, store, "older", async isCurrent => {
      let page = await client.getHistory(normalized.sessionId, {
        cursor, leafTurnId: cursor ? undefined : snapshot.window.lastTurnId ?? undefined, limit: HISTORY_PAGE_SIZE,
      })
      if (!isCurrent()) return
      this.assertHistoryBranch(store, normalized.sessionId, epoch, branch, page)
      const visited = new Set<string>()
      if (cursor) visited.add(cursor)
      let messages = sortMessagesChronologically(page.messages)
      let turns = page.turns
      for (let extra = 0; page.nextCursor !== null; extra += 1) {
        if (visited.has(page.nextCursor) || page.messages.length === 0) throw new Error("Session history pagination made no progress")
        if (!messages[0] || messages[0].role === "user") break
        if (extra >= 2 && messages.some(message => message.role === "user")) break
        visited.add(page.nextCursor)
        const older = await client.getHistory(normalized.sessionId, { cursor: page.nextCursor, limit: HISTORY_PAGE_SIZE })
        if (!isCurrent()) return
        this.assertHistoryBranch(store, normalized.sessionId, epoch, branch, older)
        messages = mergeMessages(messages, sortMessagesChronologically(older.messages))
        turns = this.mergeTurns(turns, older.turns)
        page = older
      }
      this.commitHistory(normalized, store, { ...page, messages, turns })
      this.patchEntry(entry, {
        status: "ready", loadingKind: null, error: null, resolved: true,
        limit: Math.max(entry.snapshot.limit, store.getState().message[normalized.sessionId]?.length ?? 0),
        cursor: page.nextCursor ?? undefined, complete: page.nextCursor === null, updatedAt: Date.now(),
      })
      this.persistCoverage(normalized, entry.snapshot)
    })
  }

  async loadComplete(target: SessionMessageTarget): Promise<void> {
    const normalized = this.readTarget(target)
    if (!normalized || this.disposed) throw new Error("Session message loader is unavailable")
    const release = this.retainSessionHistory(normalized)
    const configurationGeneration = this.configurationGeneration
    const key = this.keyFor(normalized)
    const entry = this.getEntry(normalized)
    const generation = entry.snapshot.generation
    try {
      await this.ensure(normalized)
      const visited = new Set<string | undefined>()
      while (true) {
        if (this.disposed || configurationGeneration !== this.configurationGeneration
          || this.entries.get(key) !== entry || entry.snapshot.generation !== generation) throw new Error("Session history load became stale")
        const state = entry.snapshot
        if (state.status === "error") throw state.error ?? new Error("Session history could not be loaded")
        if (state.complete) return
        if (visited.has(state.cursor)) throw new Error("Session history pagination made no progress")
        visited.add(state.cursor)
        await this.loadOlder(normalized)
      }
    } finally { release() }
  }

  getSnapshot(target: SessionMessageTarget): SessionMessageLoadState {
    const normalized = this.normalizeTarget(target)
    return normalized ? this.getEntry(normalized).snapshot : EMPTY_SESSION_MESSAGE_LOAD_STATE
  }

  subscribe(target: SessionMessageTarget, listener: () => void): () => void {
    const normalized = this.normalizeTarget(target)
    if (!normalized) return () => undefined
    const entry = this.getEntry(normalized)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  optimisticAdd(input: SessionMessageTarget & { message: Message }): void {
    const target = this.normalizeTarget(input)
    if (!target || this.disposed || input.message.sessionId !== target.sessionId) return
    const entry = this.getEntry(target)
    entry.optimistic.set(input.message.messageId, { message: input.message })
    const store = this.childStores.ensureChild(target.directory, { bootstrap: false })
    const current = store.getState()
    const messages = [...(current.message[target.sessionId] ?? [])]
    if (findMessageIndex(messages, input.message.messageId) < 0) insertMessageChronologically(messages, input.message)
    store.setState({
      message: { ...current.message, [target.sessionId]: messages },
      partOwner: { ...current.partOwner, [target.sessionId]: partOwners(messages) },
    })
  }

  optimisticRemove(input: SessionMessageTarget & { messageId: string }): void {
    const target = this.normalizeTarget(input)
    if (!target || this.disposed) return
    const entry = this.getEntry(target)
    const pending = entry.optimistic.get(input.messageId)
    entry.optimistic.delete(input.messageId)
    const store = this.childStores.getChild(target.directory)
    if (!store || (!pending && entry.snapshot.resolved)) return
    const current = store.getState()
    const existing = current.message[target.sessionId]
    if (!existing) return
    // Once the server has echoed the ID, the visible record is authoritative;
    // rollback must not delete the promoted message. Before the first
    // authoritative snapshot, a confirmed client record remains removable.
    const promoted = existing.find(message => message.messageId === input.messageId)
    if (pending && promoted && promoted !== pending.message) return
    const messages = existing.filter(message => message.messageId !== input.messageId)
    store.setState({ message: { ...current.message, [target.sessionId]: messages }, partOwner: { ...current.partOwner, [target.sessionId]: partOwners(messages) } })
  }

  optimisticConfirm(input: SessionMessageTarget & { messageId: string }): void {
    const target = this.normalizeTarget(input)
    if (target) this.getEntry(target).optimistic.delete(input.messageId)
  }

  invalidateSession(target: SessionMessageTarget, preservedMessages: readonly Message[] = []): void {
    const normalized = this.normalizeTarget(target)
    if (!normalized) return
    clearSessionPrefetch(normalized.directory, [normalized.sessionId], this.configuration.runtimeKey)
    const entry = this.entries.get(this.keyFor(normalized))
    if (!entry) return
    entry.snapshot = createDefaultState(entry.snapshot.generation + 1)
    entry.inflight = null
    entry.queuedRefresh = null
    entry.queuedRecovery = null
    const preserved = new Set(preservedMessages.map(message => message.messageId))
    for (const messageId of entry.optimistic.keys()) if (!preserved.has(messageId)) entry.optimistic.delete(messageId)
    this.notify(entry)
  }

  invalidateDirectory(directory: string): void {
    const normalized = normalizePath(directory)
    if (!normalized) return
    clearDirectorySessionPrefetch(normalized, this.configuration.runtimeKey)
    for (const [key, entry] of this.entries) {
      if (!key.startsWith(`${this.configuration.runtimeKey}\n${normalized}\n`)) continue
      entry.snapshot = createDefaultState(entry.snapshot.generation + 1)
      entry.inflight = null
      entry.queuedRefresh = null
      entry.queuedRecovery = null
      entry.optimistic.clear()
      this.entries.delete(key)
      this.notify(entry)
    }
  }

  clearDirectory(directory: string): void { this.invalidateDirectory(directory) }

  dispose(): void {
    this.disposed = true
    this.configurationGeneration += 1
    this.retention?.dispose()
    this.retention = null
    for (const entry of this.entries.values()) {
      entry.snapshot = createDefaultState(entry.snapshot.generation + 1)
      entry.inflight = null
      entry.queuedRefresh = null
      entry.queuedRecovery = null
      entry.optimistic.clear()
      this.notify(entry)
    }
    this.entries.clear()
    this.historyReaders.clear()
    this.renderedSessions.clear()
    clearRuntimeSessionPrefetch(this.configuration.runtimeKey)
  }

  private normalizeTarget(target: SessionMessageTarget): SessionMessageTarget | null {
    const directory = normalizePath(target.directory)
    return directory && target.sessionId ? { directory, sessionId: target.sessionId } : null
  }

  /**
   * The boundary every *read* enters. A session id the rekey retired is not
   * addressable any more, so it is refused here and no request leaves the
   * browser for it: a deferred consumer holding one pre-rekey commit would
   * otherwise ask the Host for a session both authorities now answer 404 for.
   * Cache cleanup keeps addressing the raw id, so its own entry still clears.
   */
  private readTarget(target: SessionMessageTarget): SessionMessageTarget | null {
    const normalized = this.normalizeTarget(target)
    if (!normalized) return null
    return isRetiredSessionId(normalized.sessionId, this.configuration.runtimeKey) ? null : normalized
  }


  private keyFor(target: SessionMessageTarget): string {
    return `${this.configuration.runtimeKey}\n${target.directory}\n${target.sessionId}`
  }

  private getEntry(target: SessionMessageTarget): LoaderEntry {
    const key = this.keyFor(target)
    const existing = this.entries.get(key)
    if (existing) return existing
    const prefetched = getSessionPrefetch(target.directory, target.sessionId, this.configuration.runtimeKey)
    const stored = this.childStores.getChild(target.directory)?.getState().snapshot[target.sessionId]
    const entry: LoaderEntry = {
      snapshot: prefetched && stored ? {
        ...createDefaultState(), status: "ready", resolved: true, limit: prefetched.limit,
        cursor: prefetched.cursor, complete: prefetched.complete, updatedAt: prefetched.at,
      } : createDefaultState(),
      listeners: new Set(), inflight: null, queuedRefresh: null, queuedRecovery: null, optimistic: new Map(), evicted: false,
    }
    this.entries.set(key, entry)
    return entry
  }

  private patchEntry(entry: LoaderEntry, patch: Partial<SessionMessageLoadState>): void {
    entry.snapshot = { ...entry.snapshot, ...patch }
    this.notify(entry)
  }

  private notify(entry: LoaderEntry): void { for (const listener of entry.listeners) listener() }

  private startLoad(target: SessionMessageTarget, entry: LoaderEntry, store: ChildStore,
    kind: SessionMessageLoadKind, run: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
    const generation = entry.snapshot.generation
    const configurationGeneration = this.configurationGeneration
    const configuration = this.configuration
    const key = this.keyFor(target)
    const isCurrent = () => !this.disposed && configurationGeneration === this.configurationGeneration
      && entry.snapshot.generation === generation && this.entries.get(key) === entry
      && this.childStores.getChild(target.directory) === store && (configuration.isCurrent?.() ?? true)
    const finish = startSessionLoadPerformanceEvent({ operation: kind === "prefetch" ? "session-prefetch" : `session-messages.${kind}`, caller: kind })
    this.patchEntry(entry, { status: "loading", loadingKind: kind, error: null })
    const promise = run(isCurrent).then(() => finish(isCurrent() ? "complete" : "stale", { retryCount: 0, recordCount: store.getState().message[target.sessionId]?.length ?? 0 }))
      .catch((error: unknown) => {
        finish(isCurrent() ? "error" : "stale", { retryCount: 0, recordCount: 0 })
        if (isCurrent()) this.patchEntry(entry, { status: "error", loadingKind: null, error: error instanceof Error ? error : new Error("Session history could not be loaded") })
      }).finally(() => {
        if (entry.inflight === promise) entry.inflight = null
        if (isCurrent()) this.scheduleCacheRetention(target.directory)
      })
    entry.inflight = promise
    return promise
  }

  private knownSession(sessionId: string, store: ChildStore): Session | undefined {
    return useGlobalSessionsStore.getState().entityById.get(sessionId)
      ?? store.getState().session.find(session => session.sessionId === sessionId)
  }
  /**
   * A child's transcript is readable through the history route; the root-only
   * snapshot, metadata, queue and event routes answer 403/404 for it. A
   * `vibe_spawn` child is often absent from the projected session rows, so the
   * live subagent index is the remaining authoritative source. Its parent row
   * supplies the workspace identity the projection needs.
   */
  private knownChild(target: SessionMessageTarget, store: ChildStore): Session | undefined {
    const session = this.knownSession(target.sessionId, store)
    if (session && (session.parentSessionId || session.rootSessionId !== session.sessionId)) return session
    const subagents = useSubagentsStore.getState().byParent
    for (const parentId in subagents) {
      const found = subagents[parentId].find(child => child.subagentId === target.sessionId || child.childSessionId === target.sessionId)
      if (!found) continue
      const parent = this.knownSession(parentId, store)
      if (!parent) continue
      return {
        sessionId: target.sessionId, parentSessionId: parentId, rootSessionId: parent.rootSessionId,
        projectId: parent.projectId, workspaceId: parent.workspaceId, displayPath: parent.displayPath,
        createdAt: parent.createdAt, updatedAt: parent.updatedAt,
        epoch: parent.epoch, headSequence: parent.headSequence,
        runtimeStatus: "idle", activeRunId: null, mode: { kind: "main" },
        metadata: null, metadataRevision: "0", archiveRevision: "0",
      }
    }
    return undefined
  }
  private startChildHistoryLoad(target: SessionMessageTarget, entry: LoaderEntry, store: ChildStore, kind: SessionMessageLoadKind): Promise<void> {
    const client = this.configuration.client
    const child = this.knownChild(target, store)
    if (!child) return Promise.resolve()
    const cursor = kind === "older" ? entry.snapshot.cursor : undefined
    return this.startLoad(target, entry, store, kind, async isCurrent => {
      const requestedRevision = store.getState().sessionRevision ?? 0
      const page = await client.getHistory(target.sessionId, { cursor, limit: HISTORY_PAGE_SIZE })
      if (!isCurrent()) return
      if (page.sessionId !== target.sessionId || page.messages.some(message => message.sessionId !== target.sessionId)
        || page.turns.some(turn => turn.sessionId !== target.sessionId)) throw new Error("Child history identified another session")
      if (kind === "older" && entry.historyBranch && (page.branch.branchId !== entry.historyBranch.branchId
        || page.branch.branchVersion !== entry.historyBranch.branchVersion)) throw new Error("Session history branch changed")
      if (page.nextCursor !== null && (page.nextCursor === cursor || page.messages.length === 0)) throw new Error("Session history pagination made no progress")
      const current = store.getState()
      const deletedRevision = current.sessionDeletedRevision?.[target.sessionId]
      if (deletedRevision !== undefined && deletedRevision >= requestedRevision) {
        this.patchEntry(entry, { status: "idle", loadingKind: null, resolved: false })
        return
      }
      const incoming = sortMessagesChronologically(page.messages)
      const messages = kind === "older" ? mergeMessages(current.message[target.sessionId] ?? [], incoming) : incoming
      const next = installHostSession(current, this.knownChild(target, store) ?? child)
      store.setState({
        ...next, message: { ...next.message, [target.sessionId]: messages },
        partOwner: { ...next.partOwner, [target.sessionId]: partOwners(messages) }
      })
      entry.historyBranch = page.branch
      entry.evicted = false
      this.patchEntry(entry, {
        status: "ready", loadingKind: null, error: null, resolved: true,
        cursor: page.nextCursor ?? undefined, complete: page.nextCursor === null, limit: messages.length, updatedAt: Date.now()
      })
      this.persistCoverage(target, entry.snapshot)
      // No synthetic snapshot or journal cursor: Task32 exposes child history only.
    })
  }

  private startSnapshotLoad(target: SessionMessageTarget, entry: LoaderEntry, store: ChildStore, kind: "initial" | "refresh" | "prefetch", suppliedSnapshot?: SessionSnapshot, recovered = false): Promise<void> {
    // A composer draft is a local `draft_<draftId>` identity the Host has never
    // seen. Its transcript is the optimistic echo in the child store, so there
    // is no snapshot to request and no failure to report.
    if (isDraftSessionId(target.sessionId)) {
      if (!entry.snapshot.resolved || entry.snapshot.status !== "idle" || entry.snapshot.error !== null) {
        this.patchEntry(entry, { status: "idle", loadingKind: null, error: null, resolved: true, complete: true, limit: store.getState().message[target.sessionId]?.length ?? 0 })
      }
      return Promise.resolve()
    }
    if (this.knownChild(target, store)) return this.startChildHistoryLoad(target, entry, store, kind)
    const client = this.configuration.client
    const onSnapshot = this.configuration.onSnapshot
    return this.startLoad(target, entry, store, kind, async isCurrent => {
      const requestedRevision = store.getState().sessionRevision ?? 0
      const requestedRunControlRevision = store.getState().runControlRevision?.[target.sessionId] ?? 0
      const knownWorkspace = store.getState().workspace
      const [snapshot, workspace] = await Promise.all([
        suppliedSnapshot ? Promise.resolve(suppliedSnapshot) : client.getSnapshot(target.sessionId),
        knownWorkspace ? Promise.resolve(knownWorkspace) : client.resolveWorkspace(target.directory),
      ])
      if (!isCurrent()) return
      const current = store.getState()
      const deletedRevision = current.sessionDeletedRevision?.[target.sessionId]
      const sessionPresent = current.session.some(session => session.sessionId === target.sessionId)
      if ((deletedRevision !== undefined && !sessionPresent && deletedRevision >= requestedRevision)
        || (deletedRevision !== undefined && deletedRevision > requestedRevision)) {
        this.patchEntry(entry, { status: "idle", loadingKind: null, error: null, resolved: false, cursor: undefined, complete: false })
        return
      }
      if (snapshot.session.sessionId !== target.sessionId || snapshot.session.workspaceId !== workspace.workspaceId || current.workspace && current.workspace.workspaceId !== workspace.workspaceId) throw new Error("Session snapshot does not belong to the requested workspace")
      registerWorkspaceDirectory(workspace.workspaceId, target.directory)
      const old = current.snapshot[target.sessionId]
      if (old?.session.epoch === snapshot.session.epoch && compareCounters(snapshot.session.headSequence, old.session.headSequence) < 0) throw new Error("Session snapshot is older than the live state")
      const read = preserveInFlightRunControl(old, current.session.find((item) => item.sessionId === target.sessionId), current.runControlActiveRun?.[target.sessionId], snapshot, current, requestedRunControlRevision)
      const resolved: State = current.workspace ? current : { ...current, workspace, project: workspace.projectId, path: { ...current.path, directory: target.directory, workspaceId: workspace.workspaceId, projectId: workspace.projectId } }
      let next = installSessionSnapshot(resolved, { ...read, messages: sortMessagesChronologically(read.messages) })
      const optimistic = mergeOptimisticPage({ session: next.message[target.sessionId] ?? [], complete: !read.window.hasEarlier }, [...entry.optimistic.values()])
      for (const messageId of optimistic.confirmed) entry.optimistic.delete(messageId)
      if (entry.optimistic.size > 0) next = { ...next, message: { ...next.message, [target.sessionId]: optimistic.session }, partOwner: { ...next.partOwner, [target.sessionId]: partOwners(optimistic.session) } }
      // The installed snapshot now owns run control, including any run the
      // projected-only branch carried over from an acknowledgement.
      if (next.runControlActiveRun !== undefined && Object.hasOwn(next.runControlActiveRun, target.sessionId)) {
        const runControlActiveRun = { ...next.runControlActiveRun }
        delete runControlActiveRun[target.sessionId]
        next = { ...next, runControlActiveRun }
      }
      store.setState(next)
      entry.evicted = false
      this.patchEntry(entry, {
        resolved: true, cursor: undefined, complete: !read.window.hasEarlier,
        limit: next.message[target.sessionId]?.length ?? 0, updatedAt: Date.now(),
      })
      // Recovery, requests, runtime and the SSE cursor are visible before attaching SSE.
      if (!isCurrent()) return
      onSnapshot?.(target, read, recovered ? old : undefined)
      if (!isCurrent()) return
      const hostReads = this.loadHostState(target, store, read, client, isCurrent)
      // The runtime snapshot has no pagination cursor. Read native history to establish one.
      try {
        if (read.window.hasEarlier) await this.loadInitialHistory(target, entry, store, read, client, isCurrent)
        if (!isCurrent()) return
        this.patchEntry(entry, { status: "ready", loadingKind: null, error: null })
        this.persistCoverage(target, entry.snapshot)
      } finally { await hostReads }
    })
  }

  private async loadHostState(target: SessionMessageTarget, store: ChildStore, snapshot: SessionSnapshot, client: CanonicalClient, isCurrent: () => boolean): Promise<void> {
    // Metadata and queue are root-only routes; a child answers 404 for both.
    if (this.knownChild(target, store)) return
    const requestedRevision = store.getState().sessionRevision ?? 0
    const missingSession = !store.getState().session.some(session => session.sessionId === target.sessionId)
    const sessions = missingSession ? client.listSessions(snapshot.session.workspaceId).catch(() => null) : Promise.resolve(null)
    const metadata = client.getSessionMetadata(target.sessionId).catch(() => null)
    const queue = client.getQueue(target.sessionId).catch(() => null)
    const [hostList, hostMetadata, hostQueue] = await Promise.all([sessions, metadata, queue])
    if (!isCurrent()) return
    let next: State = store.getState()
    const deletedRevision = next.sessionDeletedRevision?.[target.sessionId]
    const deletedAfterRead = deletedRevision !== undefined && (deletedRevision > requestedRevision
      || (!next.session.some(session => session.sessionId === target.sessionId) && deletedRevision >= requestedRevision))
    const hostSession = deletedAfterRead ? undefined : hostList?.items.find(session => session.sessionId === target.sessionId)
    const runtime = next.snapshot[target.sessionId]?.session
    if (!deletedAfterRead && hostSession && runtime && hostSession.workspaceId === runtime.workspaceId) next = installHostSession(next, { ...hostSession, ...runtime })
    if (!deletedAfterRead && hostMetadata) next = installSessionMetadata(next, hostMetadata)
    if (!deletedAfterRead && hostQueue) next = installQueue(next, hostQueue)
    if (next !== store.getState()) store.setState(next)
  }

  private async loadInitialHistory(target: SessionMessageTarget, entry: LoaderEntry, store: ChildStore, snapshot: SessionSnapshot, client: CanonicalClient, isCurrent: () => boolean): Promise<void> {
    const maxRecords = isMobileSurfaceRuntime() ? 200 : 300
    const firstLimit = isMobileSurfaceRuntime() ? 50 : 100
    const reader = Boolean(this.historyReaders.get(this.keyFor(target)))
    const targetTurns = reader ? 1 : INITIAL_USER_TURNS
    let page = await client.getHistory(target.sessionId, { leafTurnId: snapshot.window.lastTurnId ?? undefined, limit: firstLimit })
    if (!isCurrent()) return
    this.assertHistoryBranch(store, target.sessionId, snapshot.session.epoch, snapshot.branch, page)
    const visited = new Set<string>()
    let messages = sortMessagesChronologically(page.messages)
    let turns = page.turns
    while (page.nextCursor !== null) {
      const userTurns = messages.filter(message => message.role === "user").length
      if (userTurns >= targetTurns || (userTurns > 0 && messages.length >= maxRecords)) break
      const cursor = page.nextCursor
      if (visited.has(cursor) || page.messages.length === 0) throw new Error("Session history pagination made no progress")
      visited.add(cursor)
      const limit = userTurns === 0 ? HISTORY_PAGE_SIZE : Math.min(HISTORY_PAGE_SIZE, maxRecords - messages.length)
      const older = await client.getHistory(target.sessionId, { cursor, limit })
      if (!isCurrent()) return
      this.assertHistoryBranch(store, target.sessionId, snapshot.session.epoch, snapshot.branch, older)
      messages = mergeMessages(messages, sortMessagesChronologically(older.messages))
      turns = this.mergeTurns(turns, older.turns)
      page = older
    }
    if (page.nextCursor !== null && page.messages.length === 0) throw new Error("Session history pagination made no progress")
    this.commitHistory(target, store, { ...page, messages, turns })
    this.patchEntry(entry, { cursor: page.nextCursor ?? undefined, complete: page.nextCursor === null, limit: store.getState().message[target.sessionId]?.length ?? 0, updatedAt: Date.now() })
  }

  private assertHistoryBranch(store: ChildStore, sessionId: string, epoch: string, branch: Branch, page: HistoryPage): void {
    const current = store.getState().snapshot[sessionId]
    if (!current || current.session.epoch !== epoch || current.branch.branchId !== branch.branchId
      || current.branch.branchVersion !== branch.branchVersion || page.sessionId !== sessionId
      || page.branch.branchId !== branch.branchId || page.branch.branchVersion !== branch.branchVersion) throw new Error("Session history branch changed")
  }

  private mergeTurns(existing: Turn[], incoming: Turn[]): Turn[] {
    const ids = new Set(existing.map(turn => turn.turnId))
    const added = incoming.filter(turn => !ids.has(turn.turnId))
    return added.length === 0 ? existing : [...existing, ...added].sort((left, right) => left.startedAt - right.startedAt || left.turnId.localeCompare(right.turnId))
  }

  private commitHistory(target: SessionMessageTarget, store: ChildStore, page: HistoryPage): void {
    const current = store.getState()
    const snapshot = current.snapshot[target.sessionId]
    const entry = this.getEntry(target)
    const incoming = sortMessagesChronologically(page.messages)
    const echoed = new Set(incoming.map(message => message.messageId))
    const existing = current.message[target.sessionId] ?? []
    const retained = existing.filter(message => !echoed.has(message.messageId) || entry.optimistic.get(message.messageId)?.message !== message)
    const messages = mergeMessages(retained.length === existing.length ? existing : retained, incoming)
    for (const messageId of echoed) entry.optimistic.delete(messageId)
    const authoritativeMessages = mergeMessages(snapshot.messages, incoming)
    const turns = this.mergeTurns(snapshot.turns, page.turns)
    if (messages === current.message[target.sessionId] && authoritativeMessages === snapshot.messages && turns === snapshot.turns) return
    store.setState({
      message: messages === current.message[target.sessionId] ? current.message : { ...current.message, [target.sessionId]: messages },
      snapshot: {
        ...current.snapshot, [target.sessionId]: {
          ...snapshot, messages: authoritativeMessages, turns,
          window: { ...snapshot.window, firstTurnId: turns[0]?.turnId ?? null, lastTurnId: turns.at(-1)?.turnId ?? null, firstMessageId: authoritativeMessages[0]?.messageId ?? null, lastMessageId: authoritativeMessages.at(-1)?.messageId ?? null, hasEarlier: page.nextCursor !== null },
        }
      },
      partOwner: messages === current.message[target.sessionId] ? current.partOwner : { ...current.partOwner, [target.sessionId]: partOwners(messages) },
    })
  }

  private persistCoverage(target: SessionMessageTarget, state: SessionMessageLoadState): void {
    setSessionPrefetch({ directory: target.directory, sessionId: target.sessionId, limit: state.limit, cursor: state.cursor, complete: state.complete, at: state.updatedAt, runtimeKey: this.configuration.runtimeKey })
  }
}

let imperativeLoader: SessionMessageLoader | null = null
export function setImperativeSessionMessageLoader(loader: SessionMessageLoader | null): void { imperativeLoader = loader }
export function getImperativeSessionMessageLoader(): SessionMessageLoader | null { return imperativeLoader }
