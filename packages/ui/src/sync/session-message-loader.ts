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
import { retry, STARTUP_RETRY } from "./retry"

<<<<<<< HEAD
const HISTORY_PAGE_SIZE = 100
||||||| bc50ba56aa
// One agent turn can span well over a hundred tool steps, so the first
// request is sized to hold a long last turn without a follow-up read.
const INITIAL_MESSAGE_PAGE_SIZE = 100
const CONSTRAINED_INITIAL_MESSAGE_PAGE_SIZE = 50
const HISTORY_MESSAGE_PAGE_SIZE = 100
// Extra pages one interactive history action may read to reach a user prompt.
const HISTORY_TURN_ALIGNMENT_EXTRA_PAGES = 2
// Cold navigation aims for this many user-led turns within the expansion bounds.
=======
const INITIAL_MESSAGE_PAGE_SIZE = 100
const CONSTRAINED_INITIAL_MESSAGE_PAGE_SIZE = 50
const HISTORY_MESSAGE_PAGE_SIZE = 100
const HISTORY_TURN_ALIGNMENT_EXTRA_PAGES = 2
>>>>>>> upstream/main
const INITIAL_USER_TURNS = 10
const CONSTRAINED_SESSION_CACHE_LIMIT = 6
<<<<<<< HEAD
||||||| bc50ba56aa
// Cold navigation extends the first page backward through the cursor until
// INITIAL_USER_TURNS prompts are present or this many records are held. The
// ceiling never stops it before the newest prompt. Nothing already downloaded
// is requested again.
const INITIAL_WINDOW_MAX_RECORDS = 300
const CONSTRAINED_INITIAL_WINDOW_MAX_RECORDS = 200
// OpenCode rejects a message page larger than this.
const MAX_MESSAGE_PAGE_SIZE = 200
// An extension page is sized from the turn density already fetched, with this
// headroom so uneven turns rarely need one more round trip.
const EXTENSION_ESTIMATE_HEADROOM = 1.2
// Tail read that confirms a cached transcript after a stream gap. It usually
// overlaps the cache; when it does not, the window is read back further.
const STALE_HISTORY_TAIL_LIMIT = 30

export type SessionMessageTarget = {
  directory: string
  sessionID: string
}
=======
const INITIAL_WINDOW_MAX_RECORDS = 300
const CONSTRAINED_INITIAL_WINDOW_MAX_RECORDS = 200
const MAX_MESSAGE_PAGE_SIZE = 200
const EXTENSION_ESTIMATE_HEADROOM = 1.2
const STALE_HISTORY_TAIL_LIMIT = 30

export type SessionMessageTarget = {
  directory: string
  sessionID: string
}
>>>>>>> upstream/main

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
<<<<<<< HEAD
||||||| bc50ba56aa
  /** Completed replies fetched through older pages, never live completions. */
  olderCompletedReplyIds: ReadonlySet<string>
=======
  olderCompletedReplyIds: ReadonlySet<string>
>>>>>>> upstream/main
}
<<<<<<< HEAD
export type LoaderConfiguration = {
  client: CanonicalClient
  runtimeKey: string
  onSnapshot?: (target: SessionMessageTarget, snapshot: SessionSnapshot, recoveryPrevious?: SessionSnapshot) => void
  isCurrent?: () => boolean
}
||||||| bc50ba56aa

=======

const entryCoversHistory = (entry: LoaderEntry): boolean => entry.snapshot.resolved && !entry.evicted

>>>>>>> upstream/main
type LoaderEntry = {
  snapshot: SessionMessageLoadState
  listeners: Set<() => void>
  inflight: Promise<void> | null
  queuedRefresh: Promise<void> | null
  queuedRecovery: Promise<void> | null
  optimistic: Map<string, OptimisticItem>
  evicted: boolean
<<<<<<< HEAD
  historyBranch?: Branch
||||||| bc50ba56aa
  /**
   * The loader's history epoch at the start of the last authoritative read
   * that confirmed this transcript. Older than the current epoch means a
   * stream gap may have hidden changes from it.
   */
  verifiedEpoch: number
  /**
   * The newest cached record when the first stream gap after the last
   * confirmation happened. Records before it are known contiguous; records
   * after it may have arrived by live events with a hole behind them, so a
   * stale tail refresh joins the cache only through this record.
   */
  gapAnchorID: string | null
  /** The session's pending inbox was read into this entry since it was opened. */
  inboxSeeded: boolean
  /** Ids painted from the inbox; a replacing window must not drop them. */
  inboxSeededIDs: Set<string>
=======
  verifiedEpoch: number
  gapAnchorID: string | null
  inboxSeeded: boolean
  inboxSeededIDs: Set<string>
>>>>>>> upstream/main
}
<<<<<<< HEAD
type ChildStore = StoreApi<DirectoryStore>
type Branch = SessionSnapshot["branch"]
||||||| bc50ba56aa

type FetchedPage = {
  session: Message[]
  partsByMessageID: Map<string, Part[]>
  cursor: string | undefined
  complete: boolean
}

type LoadPerformanceDetails = {
  retryCount: number
  recordCount: number
}

/**
 * The loader only needs one page call. Narrowing the dependency to that call
 * keeps the adapter (`opencodeClient`) the single place that knows how the
 * server encodes messages, and keeps tests free of a whole SDK double.
 */
export type SessionMessagePageSource = {
  getSessionMessages(
    id: string,
    options?: { limit?: number; cursor?: string; order?: "asc" | "desc"; partShells?: boolean },
    directory?: string | null,
  ): Promise<MessagePage>
  /**
   * Pending inbox items for one session, when the runtime can read them. A
   * cold load uses this to repaint messages the live `session.inbox.*` events
   * added while the client was open.
   */
  getSessionInbox?(id: string, directory?: string | null): Promise<readonly PendingInboxMessage[]>
}

type LoaderConfiguration = {
  sdk: SessionMessagePageSource
  runtimeKey: string
}

/** OpenCode's first connection of the page (`openCodeStartupSignal`). */
type OpenCodeStartupSignal = {
  isStarting(): boolean
  /** Resolves on the first connection; rejects when OpenCode does not come up. */
  waitForConnection(): Promise<void>
}

const NO_OPENCODE_STARTUP: OpenCodeStartupSignal = {
  isStarting: () => false,
  waitForConnection: () => Promise.resolve(),
}

const isConstrainedRuntime = () => isVSCodeRuntime() || isMobileSurfaceRuntime()
const getInitialPageSize = () => isConstrainedRuntime()
  ? CONSTRAINED_INITIAL_MESSAGE_PAGE_SIZE
  : INITIAL_MESSAGE_PAGE_SIZE
const getInitialWindowMaxRecords = () => isConstrainedRuntime()
  ? CONSTRAINED_INITIAL_WINDOW_MAX_RECORDS
  : INITIAL_WINDOW_MAX_RECORDS

const isUserMessage = (message: Message): boolean => message.role === "user"

const hasUserMessage = (messages: Message[]): boolean => messages.some(isUserMessage)

const countUserMessages = (messages: Message[]): number => {
  let turns = 0
  for (const message of messages) if (isUserMessage(message)) turns += 1
  return turns
}

const hasInitialTurns = (messages: Message[]): boolean => countUserMessages(messages) >= INITIAL_USER_TURNS

/**
 * Where a transcript that outgrew the cold-navigation window is cut back to
 * it: the index of the prompt the kept records start with, or -1 when
 * nothing goes. The kept window follows the cold-navigation rule (ten
 * prompts, or the record ceiling once at least the newest prompt is in), so a
 * cut always falls on a turn boundary, and only the window is walked. The
 * prompt's context carriers (the `synthetic` records sent right before it)
 * stay with it: its chips, and a revert or fork that cuts at the first
 * carrier, need them.
 */
const findHistoryTrimIndex = (messages: Message[]): number => {
  const maxRecords = getInitialWindowMaxRecords()
  let prompts = 0
  let cut = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!isUserMessage(messages[index])) continue
    prompts += 1
    if (prompts >= INITIAL_USER_TURNS || messages.length - index >= maxRecords) {
      cut = index
      break
    }
  }
  while (cut > 0 && messages[cut - 1].role === "synthetic") cut -= 1
  return cut > 0 ? cut : -1
}

/**
 * Drops the cached records a replacing window no longer covers, so older
 * cached history cannot sit behind a hole. Kept: records the window carries,
 * optimistic records, and records newer than the window, which arrived live
 * while it was read.
 */
const withoutHistoryOutsideWindow = (
  state: DirectoryStore,
  sessionID: string,
  page: FetchedPage,
  optimistic: ReadonlyMap<string, OptimisticItem>,
  preserved: ReadonlySet<string>,
): DirectoryStore => {
  const messages = state.message[sessionID]
  if (!messages) return state
  const pageIDs = new Set(page.session.map((message) => message.id))
  const newestWindowTime = page.session.at(-1)?.time.created ?? Number.NEGATIVE_INFINITY
  const dropped: string[] = []
  const kept = messages.filter((message) => {
    if (pageIDs.has(message.id) || optimistic.has(message.id) || preserved.has(message.id) || message.time.created > newestWindowTime) return true
    dropped.push(message.id)
    return false
  })
  if (dropped.length === 0) return state
  const part = { ...state.part }
  for (const messageID of dropped) delete part[messageID]
  return { ...state, message: { ...state.message, [sessionID]: kept }, part }
}

/**
 * Drops the client's own copies of records the page now carries, so the
 * server's version replaces them instead of losing to them as an existing
 * record. An optimistic prompt is stamped with the browser's clock, the reply
 * with the server's; a remote client whose clock runs ahead would otherwise
 * keep its prompt sorted after the reply until a reload. A copy a live event
 * already replaced is no longer the optimistic object and is left alone.
 */
const withoutEchoedOptimisticRecords = (
  state: DirectoryStore,
  sessionID: string,
  page: FetchedPage,
  optimistic: ReadonlyMap<string, OptimisticItem>,
): DirectoryStore => {
  const messages = state.message[sessionID]
  if (!messages || optimistic.size === 0) return state
  const pageIDs = new Set(page.session.map((message) => message.id))
  const kept = messages.filter((message) => (
    !pageIDs.has(message.id) || optimistic.get(message.id)?.message !== message
  ))
  return kept.length === messages.length ? state : { ...state, message: { ...state.message, [sessionID]: kept } }
}

const toLoadError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("Session messages could not be loaded")

const filterIdentifiedParts = (parts: Part[]): Part[] => parts
  .filter((part) => Boolean(part?.id))
=======

type FetchedPage = {
  session: Message[]
  partsByMessageID: Map<string, Part[]>
  cursor: string | undefined
  complete: boolean
}

type LoadPerformanceDetails = {
  retryCount: number
  recordCount: number
}

export type SessionMessagePageSource = {
  getSessionMessages(
    id: string,
    options?: { limit?: number; cursor?: string; order?: "asc" | "desc"; partShells?: boolean },
    directory?: string | null,
  ): Promise<MessagePage>
  getSessionInbox?(id: string, directory?: string | null): Promise<readonly PendingInboxMessage[]>
}

type LoaderConfiguration = {
  sdk: SessionMessagePageSource
  runtimeKey: string
}

type OpenCodeStartupSignal = {
  isStarting(): boolean
  waitForConnection(): Promise<void>
}

const NO_OPENCODE_STARTUP: OpenCodeStartupSignal = {
  isStarting: () => false,
  waitForConnection: () => Promise.resolve(),
}

const isConstrainedRuntime = () => isVSCodeRuntime() || isMobileSurfaceRuntime()
const getInitialPageSize = () => isConstrainedRuntime()
  ? CONSTRAINED_INITIAL_MESSAGE_PAGE_SIZE
  : INITIAL_MESSAGE_PAGE_SIZE
const getInitialWindowMaxRecords = () => isConstrainedRuntime()
  ? CONSTRAINED_INITIAL_WINDOW_MAX_RECORDS
  : INITIAL_WINDOW_MAX_RECORDS

const isUserMessage = (message: Message): boolean => message.role === "user"

const hasUserMessage = (messages: Message[]): boolean => messages.some(isUserMessage)

const countUserMessages = (messages: Message[]): number => {
  let turns = 0
  for (const message of messages) if (isUserMessage(message)) turns += 1
  return turns
}

const hasInitialTurns = (messages: Message[]): boolean => countUserMessages(messages) >= INITIAL_USER_TURNS

const findHistoryTrimIndex = (messages: Message[]): number => {
  const maxRecords = getInitialWindowMaxRecords()
  let prompts = 0
  let cut = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!isUserMessage(messages[index])) continue
    prompts += 1
    if (prompts >= INITIAL_USER_TURNS || messages.length - index >= maxRecords) {
      cut = index
      break
    }
  }
  while (cut > 0 && messages[cut - 1].role === "synthetic") cut -= 1
  return cut > 0 ? cut : -1
}

const withoutHistoryOutsideWindow = (
  state: DirectoryStore,
  sessionID: string,
  page: FetchedPage,
  optimistic: ReadonlyMap<string, OptimisticItem>,
  preserved: ReadonlySet<string>,
): DirectoryStore => {
  const messages = state.message[sessionID]
  if (!messages) return state
  const pageIDs = new Set(page.session.map((message) => message.id))
  const newestWindowTime = page.session.at(-1)?.time.created ?? Number.NEGATIVE_INFINITY
  const dropped: string[] = []
  const kept = messages.filter((message) => {
    if (pageIDs.has(message.id) || optimistic.has(message.id) || preserved.has(message.id) || message.time.created > newestWindowTime) return true
    dropped.push(message.id)
    return false
  })
  if (dropped.length === 0) return state
  const part = { ...state.part }
  for (const messageID of dropped) delete part[messageID]
  return { ...state, message: { ...state.message, [sessionID]: kept }, part }
}

const withoutEchoedOptimisticRecords = (
  state: DirectoryStore,
  sessionID: string,
  page: FetchedPage,
  optimistic: ReadonlyMap<string, OptimisticItem>,
): DirectoryStore => {
  const messages = state.message[sessionID]
  if (!messages || optimistic.size === 0) return state
  const pageIDs = new Set(page.session.map((message) => message.id))
  const kept = messages.filter((message) => (
    !pageIDs.has(message.id) || optimistic.get(message.id)?.message !== message
  ))
  return kept.length === messages.length ? state : { ...state, message: { ...state.message, [sessionID]: kept } }
}

const toLoadError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("Session messages could not be loaded")

const filterIdentifiedParts = (parts: Part[]): Part[] => parts
  .filter((part) => Boolean(part?.id))
>>>>>>> upstream/main

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
<<<<<<< HEAD
  private configuration: LoaderConfiguration
  private configurationGeneration = 0
||||||| bc50ba56aa
  private sdk: SessionMessagePageSource
  private runtimeKey: string
  private sdkEpoch = 0
  /** Advances on every stream gap; see `markHistoryStale`. */
  private historyEpoch = 0
=======
  private sdk: SessionMessagePageSource
  private runtimeKey: string
  private sdkEpoch = 0
  private historyEpoch = 0
>>>>>>> upstream/main
  private disposed = false
  private readonly entries = new Map<string, LoaderEntry>()
  private retention: SessionCacheRetention | null = null
  private releaseDerivedCache: (target: SessionMessageTarget) => void = () => undefined
  private readonly historyReaders = new Map<string, number>()
  private readonly renderedSessions = new Map<string, number>()
<<<<<<< HEAD
||||||| bc50ba56aa
  /** Timelines scrolled away from the end; they keep `trimHistory` off. */
  private readonly historyBrowsers = new Map<string, number>()
=======
  private readonly historyBrowsers = new Map<string, number>()
>>>>>>> upstream/main

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

<<<<<<< HEAD
  activate(): void { this.disposed = false }
||||||| bc50ba56aa
  /**
   * Re-enable a loader which was disposed by a transient React effect cleanup.
   *
   * React Strict Mode runs effect setup, cleanup, then setup again in
   * development. The provider owns one ref-stable loader across that sequence,
   * so the second setup must be able to accept new work after the first cleanup
   * invalidated its in-flight requests.
   */
  activate(): void {
    this.disposed = false
  }
=======
  // external: https://react.dev/reference/react/StrictMode Effect setup runs again after development cleanup, so the ref-stable loader must accept new work.
  activate(): void {
    this.disposed = false
  }
>>>>>>> upstream/main

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

<<<<<<< HEAD
  retainSessionHistory(target: SessionMessageTarget, reason: "read" | "rendered" = "read"): () => void {
||||||| bc50ba56aa
  /**
   * Hold history for an imperative reader, a transcript still on screen, or a
   * timeline whose reader is away from its end (`browsing`, which only keeps
   * `trimHistory` from cutting what that reader may be looking at).
   */
  retainSessionHistory(target: SessionMessageTarget, reason: "read" | "rendered" | "browsing" = "read"): () => void {
=======
  retainSessionHistory(target: SessionMessageTarget, reason: "read" | "rendered" | "browsing" = "read"): () => void {
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
  /**
   * Cuts a transcript that outgrew the cold-navigation window back to that
   * window, the way it would open cold. The dropped turns stay reachable:
   * coverage moves to a cursor below the oldest kept prompt, so loading older
   * history reads them again. The caller decides when the reader cannot see
   * the cut (`ChatContainer` asks after a turn starts or ends, with the reader
   * at the end). Nothing is cut while a load runs, while a history reader
   * holds the transcript or another timeline browses it, while a revert is
   * pending, after a stream gap the transcript was not confirmed since (it
   * may hold a hole the cursor would hide), or at a record the server has not
   * confirmed. Returns whether anything was cut.
   */
  trimHistory(target: SessionMessageTarget): boolean {
    const normalized = this.normalizeTarget(target)
    if (!normalized || this.disposed) return false
    const key = this.keyFor(normalized)
    const entry = this.entries.get(key)
    if (!entry || entry.snapshot.status !== "ready" || !entry.snapshot.resolved || entry.inflight || entry.evicted) return false
    if (this.historyReaders.get(key) || this.historyBrowsers.get(key) || entry.verifiedEpoch < this.historyEpoch) return false
    const store = this.childStores.getChild(normalized.directory)
    if (!store) return false
    const current = store.getState()
    const messages = current.message[normalized.sessionID]
    if (!messages) return false
    // A pending revert hides the transcript's tail behind its marker; a cut
    // counted over the hidden turns could drop the marker and show them again.
    if (current.session.find((session) => session.id === normalized.sessionID)?.revert) return false
    const cut = findHistoryTrimIndex(messages)
    if (cut < 0 || entry.optimistic.has(messages[cut].id)) return false
    const part = { ...current.part }
    for (let index = 0; index < cut; index += 1) delete part[messages[index].id]
    store.setState({ message: { ...current.message, [normalized.sessionID]: messages.slice(cut) }, part })
    this.patchEntry(entry, {
      limit: messages.length - cut,
      cursor: olderMessagesCursor(messages[cut].id),
      complete: false,
      updatedAt: Date.now(),
    })
    this.persistCoverage(normalized, entry.snapshot)
    return true
  }

=======
  trimHistory(target: SessionMessageTarget): boolean {
    const normalized = this.normalizeTarget(target)
    if (!normalized || this.disposed) return false
    const key = this.keyFor(normalized)
    const entry = this.entries.get(key)
    if (!entry || entry.snapshot.status !== "ready" || !entry.snapshot.resolved || entry.inflight || entry.evicted) return false
    if (this.historyReaders.get(key) || this.historyBrowsers.get(key) || entry.verifiedEpoch < this.historyEpoch) return false
    const store = this.childStores.getChild(normalized.directory)
    if (!store) return false
    const current = store.getState()
    const messages = current.message[normalized.sessionID]
    if (!messages) return false
    if (current.session.find((session) => session.id === normalized.sessionID)?.revert) return false
    const cut = findHistoryTrimIndex(messages)
    if (cut < 0 || entry.optimistic.has(messages[cut].id)) return false
    const part = { ...current.part }
    for (let index = 0; index < cut; index += 1) delete part[messages[index].id]
    store.setState({ message: { ...current.message, [normalized.sessionID]: messages.slice(cut) }, part })
    this.patchEntry(entry, {
      limit: messages.length - cut,
      cursor: olderMessagesCursor(messages[cut].id),
      complete: false,
      updatedAt: Date.now(),
    })
    this.persistCoverage(normalized, entry.snapshot)
    return true
  }

>>>>>>> upstream/main
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
<<<<<<< HEAD
    if (current.message[normalized.sessionId] !== undefined) return
    store.setState({ message: { ...current.message, [normalized.sessionId]: [] } })
||||||| bc50ba56aa
    // The create response establishes an empty transcript, but events or a
    // prompt may already have materialized a newer snapshot while it travelled.
    if (current.message[normalized.sessionID] !== undefined) return
    const entry = this.getEntry(normalized)
    this.bumpGeneration(entry)
    entry.inflight = null
    entry.verifiedEpoch = this.historyEpoch
    store.setState({ message: { ...current.message, [normalized.sessionID]: [] } })
    this.patchEntry(entry, {
      status: "ready",
      loadingKind: null,
      error: null,
      resolved: true,
      cursor: undefined,
      complete: true,
      updatedAt: Date.now(),
    })
    this.persistCoverage(normalized, entry.snapshot)
=======
    const entry = this.getEntry(normalized)
    if (entryCoversHistory(entry)) return
    this.bumpGeneration(entry)
    entry.inflight = null
    entry.verifiedEpoch = this.historyEpoch
    if (current.message[normalized.sessionID] === undefined) {
      store.setState({ message: { ...current.message, [normalized.sessionID]: [] } })
    }
    this.patchEntry(entry, {
      status: "ready",
      loadingKind: null,
      error: null,
      resolved: true,
      cursor: undefined,
      complete: true,
      updatedAt: Date.now(),
    })
    this.persistCoverage(normalized, entry.snapshot)
>>>>>>> upstream/main
  }

  ensure(target: SessionMessageTarget, options?: { force?: boolean; reason?: "navigation" | "reactive" | "prefetch" }): Promise<void> {
    const normalized = this.readTarget(target)
    if (!normalized || this.disposed) return Promise.resolve()
    const entry = this.getEntry(normalized)
    const store = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
<<<<<<< HEAD
||||||| bc50ba56aa
    const materialization = getSessionMaterializationStatus(store.getState(), normalized.sessionID)
=======
    const materialization = getSessionMaterializationStatus(store.getState(), normalized.sessionID, {
      historyCovered: entryCoversHistory(entry),
    })
>>>>>>> upstream/main
    if (options?.reason !== "prefetch") this.touchSessionCache(normalized)
<<<<<<< HEAD
||||||| bc50ba56aa
    // Messages that arrived by event after an eviction are renderable but are
    // not history coverage: the earlier transcript must be fetched again.
    if (!options?.force && materialization.renderable && !entry.evicted) {
      if (!entry.snapshot.resolved) {
        this.patchEntry(entry, {
          status: "ready",
          error: null,
          resolved: true,
          limit: Math.max(entry.snapshot.limit, store.getState().message[normalized.sessionID]?.length ?? 0),
        })
      }
      // A prefetched transcript renders without this open reading history, so
      // the first real open still has to restore the pending inbox.
      if (options?.reason !== "prefetch" && !entry.inboxSeeded) {
        const generation = entry.snapshot.generation
        const sdkEpoch = this.sdkEpoch
        void this.seedPendingInbox(normalized, entry, store, () => (
          !this.disposed
          && this.sdkEpoch === sdkEpoch
          && entry.snapshot.generation === generation
          && this.childStores.getChild(normalized.directory) === store
        ))
      }
      // The cached transcript renders now; a gap-stale one refreshes behind it.
      if (options?.reason !== "prefetch" && this.revalidateIfStale(normalized)) return Promise.resolve()
      return entry.inflight ?? Promise.resolve()
    }
=======
    if (!options?.force && materialization.renderable) {
      if (options?.reason !== "prefetch" && !entry.inboxSeeded) {
        const generation = entry.snapshot.generation
        const sdkEpoch = this.sdkEpoch
        void this.seedPendingInbox(normalized, entry, store, () => (
          !this.disposed
          && this.sdkEpoch === sdkEpoch
          && entry.snapshot.generation === generation
          && this.childStores.getChild(normalized.directory) === store
        ))
      }
      if (options?.reason !== "prefetch" && this.revalidateIfStale(normalized)) return Promise.resolve()
      return entry.inflight ?? Promise.resolve()
    }
>>>>>>> upstream/main
    if (entry.inflight) {
<<<<<<< HEAD
      if (options?.reason !== "prefetch" && entry.snapshot.loadingKind === "prefetch") this.patchEntry(entry, { loadingKind: "initial" })
      return entry.inflight
||||||| bc50ba56aa
      const promoting = options?.reason !== "prefetch" && entry.snapshot.loadingKind === "prefetch"
      if (!promoting) return entry.inflight
      this.patchEntry(entry, { loadingKind: "initial" })
      const generation = entry.snapshot.generation
      const sdkEpoch = this.sdkEpoch
      const inflight = entry.inflight
      // The prefetch ran loadInitial with the inbox read disabled; the open
      // that promoted it still has to restore the pending items once it lands.
      return inflight.then(async () => {
        if (this.disposed || this.sdkEpoch !== sdkEpoch || entry.snapshot.generation !== generation) return
        if (this.childStores.getChild(normalized.directory) !== store || entry.inboxSeeded) return
        await this.seedPendingInbox(normalized, entry, store, () => (
          !this.disposed
          && this.sdkEpoch === sdkEpoch
          && entry.snapshot.generation === generation
        ))
      })
=======
      const promoting = options?.reason !== "prefetch" && entry.snapshot.loadingKind === "prefetch"
      if (!promoting) return entry.inflight
      this.patchEntry(entry, { loadingKind: "initial" })
      const generation = entry.snapshot.generation
      const sdkEpoch = this.sdkEpoch
      const inflight = entry.inflight
      return inflight.then(async () => {
        if (this.disposed || this.sdkEpoch !== sdkEpoch || entry.snapshot.generation !== generation) return
        if (this.childStores.getChild(normalized.directory) !== store || entry.inboxSeeded) return
        await this.seedPendingInbox(normalized, entry, store, () => (
          !this.disposed
          && this.sdkEpoch === sdkEpoch
          && entry.snapshot.generation === generation
        ))
      })
>>>>>>> upstream/main
    }
<<<<<<< HEAD
    if (!options?.force && entry.snapshot.resolved && !entry.evicted
      && (store.getState().snapshot[normalized.sessionId] !== undefined
        || store.getState().message[normalized.sessionId] !== undefined)) return Promise.resolve()
    return this.startSnapshotLoad(normalized, entry, store, options?.reason === "prefetch" ? "prefetch" : "initial")
||||||| bc50ba56aa
    if (options?.force) this.bumpGeneration(entry)
    const kind: SessionMessageLoadKind = options?.reason === "prefetch" ? "prefetch" : "initial"
    // A session opened before OpenCode is ready (the launch reopening the
    // last session, a link) reads at once: OpenCode may already answer. If
    // that read fails, the failure says nothing about the session, so the
    // load stays loading and reads once more when OpenCode connects. Only a
    // failure after that, or OpenCode not starting at all, becomes an error.
    // A prefetch does not wait, unless a foreground caller joined it since.
    const startedBeforeOpenCode = this.openCodeStartup.isStarting()
    return this.startLoad(normalized, entry, store, kind, async (isCurrent, performance) => {
      try {
        await this.loadInitial(normalized, entry, store, isCurrent, performance, kind !== "prefetch")
      } catch (error) {
        if (!startedBeforeOpenCode || entry.snapshot.loadingKind === "prefetch" || !isCurrent()) throw error
        await this.openCodeStartup.waitForConnection()
        if (!isCurrent()) return
        await this.loadInitial(normalized, entry, store, isCurrent, performance, kind !== "prefetch")
      }
    })
  }

  /**
   * The event stream had a gap: any cached transcript may have missed
   * changes. Each one refreshes its tail the next time it is opened.
   */
  markHistoryStale(): void {
    for (const entry of this.entries.values()) {
      // An entry already stale keeps the anchor of its first gap: an older
      // anchor only makes the tail read back further.
      if (!entry.snapshot.resolved || entry.verifiedEpoch < this.historyEpoch) continue
      const messages = this.childStores.getChild(entry.target.directory)?.getState().message[entry.target.sessionID] ?? []
      const confirmed = messages.filter((message) => !entry.optimistic.has(message.id))
      entry.gapAnchorID = confirmed.at(-1)?.id ?? null
    }
    this.historyEpoch += 1
  }

  /**
   * Refreshes a cached transcript in the background when a stream gap
   * happened after it was last confirmed. Returns whether a refresh started.
   * A failed refresh keeps the cached records and the stale mark.
   */
  revalidateIfStale(target: SessionMessageTarget): boolean {
    const normalized = this.normalizeTarget(target)
    if (!normalized || this.disposed) return false
    const entry = this.entries.get(this.keyFor(normalized))
    if (!entry?.snapshot.resolved || entry.inflight || entry.verifiedEpoch >= this.historyEpoch) return false
    void this.refreshTail(normalized, STALE_HISTORY_TAIL_LIMIT)
    return true
=======
    if (options?.force) this.bumpGeneration(entry)
    const kind: SessionMessageLoadKind = options?.reason === "prefetch" ? "prefetch" : "initial"
    const startedBeforeOpenCode = this.openCodeStartup.isStarting()
    return this.startLoad(normalized, entry, store, kind, async (isCurrent, performance) => {
      try {
        await this.loadInitial(normalized, entry, store, isCurrent, performance, kind !== "prefetch")
      } catch (error) {
        if (!startedBeforeOpenCode || entry.snapshot.loadingKind === "prefetch" || !isCurrent()) throw error
        await this.openCodeStartup.waitForConnection()
        if (!isCurrent()) return
        await this.loadInitial(normalized, entry, store, isCurrent, performance, kind !== "prefetch")
      }
    })
  }

  markHistoryStale(): void {
    for (const entry of this.entries.values()) {
      if (!entry.snapshot.resolved || entry.verifiedEpoch < this.historyEpoch) continue
      const messages = this.childStores.getChild(entry.target.directory)?.getState().message[entry.target.sessionID] ?? []
      const confirmed = messages.filter((message) => !entry.optimistic.has(message.id))
      entry.gapAnchorID = confirmed.at(-1)?.id ?? null
    }
    this.historyEpoch += 1
  }

  revalidateIfStale(target: SessionMessageTarget): boolean {
    const normalized = this.normalizeTarget(target)
    if (!normalized || this.disposed) return false
    const entry = this.entries.get(this.keyFor(normalized))
    if (!entry?.snapshot.resolved || entry.inflight || entry.verifiedEpoch >= this.historyEpoch) return false
    void this.refreshTail(normalized, STALE_HISTORY_TAIL_LIMIT)
    return true
>>>>>>> upstream/main
  }

  prefetch(target: SessionMessageTarget): Promise<void> {
    const normalized = this.readTarget(target)
    if (!normalized || this.disposed) return Promise.resolve()
    this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    if (this.retention && !this.retention.admitPrefetch(normalized)) return Promise.resolve()
    return this.ensure(normalized, { reason: "prefetch" })
  }

  refresh(target: SessionMessageTarget, snapshot?: SessionSnapshot, options?: { recovered?: boolean; requireAvailable?: boolean }): Promise<void> {
    const normalized = this.readTarget(target)
    if (!normalized || this.disposed) return Promise.resolve()
    if (snapshot) this.invalidateSession(normalized)
    const entry = this.getEntry(normalized)
    if (entry.inflight) {
<<<<<<< HEAD
      if (options?.recovered) {
        if (entry.queuedRecovery) return entry.queuedRecovery
        const generation = entry.snapshot.generation
        const configurationGeneration = this.configurationGeneration
        const key = this.keyFor(normalized)
        const queued = entry.inflight.then(() => {
          if (this.disposed || configurationGeneration !== this.configurationGeneration
            || generation !== entry.snapshot.generation || this.entries.get(key) !== entry) return
          return this.refresh(normalized, undefined, options)
        })
        entry.queuedRecovery = queued
        const clear = () => { if (entry.queuedRecovery === queued) entry.queuedRecovery = null }
        void queued.then(clear, clear)
        return queued
||||||| bc50ba56aa
      if (entry.snapshot.loadingKind === "older") return entry.inflight
      return entry.inflight.then(() => this.loadOlderPage(normalized, mode))
    }
    if (entry.snapshot.complete || !entry.snapshot.cursor) return Promise.resolve()
    const store = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    const cursor = entry.snapshot.cursor
    return this.startLoad(normalized, entry, store, "older", async (isCurrent, performance) => {
      let page = await this.fetchPage(normalized, HISTORY_MESSAGE_PAGE_SIZE, cursor, "older", performance)
      if (!isCurrent()) return
      const visited = new Set([cursor])
      // An interactive batch tries to start on a user prompt so the oldest
      // visible turn is whole. Every fetched record is kept, and the server
      // cursor stays authoritative. Alignment reads are bounded, except that a
      // batch holding no prompt at all would add nothing visible: it keeps
      // reading until the turn's prompt arrives.
      for (let extra = 0; mode === "interactive"; extra += 1) {
        if (page.complete || !page.session[0] || isUserMessage(page.session[0])) break
        if (extra >= HISTORY_TURN_ALIGNMENT_EXTRA_PAGES && hasUserMessage(page.session)) break
        if (!page.cursor || visited.has(page.cursor)) throw new Error("Session history pagination made no progress")
        visited.add(page.cursor)
        const older = await this.fetchPage(normalized, HISTORY_MESSAGE_PAGE_SIZE, page.cursor, "older", performance)
        if (!isCurrent()) return
        if (older.session.length === 0 && !older.complete) throw new Error("Session history pagination made no progress")
        page = {
          session: [...older.session, ...page.session],
          partsByMessageID: new Map([...page.partsByMessageID, ...older.partsByMessageID]),
          cursor: older.cursor,
          complete: older.complete,
        }
=======
      if (entry.snapshot.loadingKind === "older") return entry.inflight
      return entry.inflight.then(() => this.loadOlderPage(normalized, mode))
    }
    if (entry.snapshot.complete || !entry.snapshot.cursor) return Promise.resolve()
    const store = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    const cursor = entry.snapshot.cursor
    return this.startLoad(normalized, entry, store, "older", async (isCurrent, performance) => {
      let page = await this.fetchPage(normalized, HISTORY_MESSAGE_PAGE_SIZE, cursor, "older", performance)
      if (!isCurrent()) return
      const visited = new Set([cursor])
      for (let extra = 0; mode === "interactive"; extra += 1) {
        if (page.complete || !page.session[0] || isUserMessage(page.session[0])) break
        if (extra >= HISTORY_TURN_ALIGNMENT_EXTRA_PAGES && hasUserMessage(page.session)) break
        if (!page.cursor || visited.has(page.cursor)) throw new Error("Session history pagination made no progress")
        visited.add(page.cursor)
        const older = await this.fetchPage(normalized, HISTORY_MESSAGE_PAGE_SIZE, page.cursor, "older", performance)
        if (!isCurrent()) return
        if (older.session.length === 0 && !older.complete) throw new Error("Session history pagination made no progress")
        page = {
          session: [...older.session, ...page.session],
          partsByMessageID: new Map([...page.partsByMessageID, ...older.partsByMessageID]),
          cursor: older.cursor,
          complete: older.complete,
        }
>>>>>>> upstream/main
      }
<<<<<<< HEAD
      if (entry.snapshot.loadingKind !== "older") return entry.inflight
      if (entry.queuedRefresh) return entry.queuedRefresh
      const generation = entry.snapshot.generation
      const configurationGeneration = this.configurationGeneration
      const key = this.keyFor(normalized)
      const queued = entry.inflight.then(() => {
        if (entry.queuedRefresh === queued) entry.queuedRefresh = null
        if (this.disposed || configurationGeneration !== this.configurationGeneration
          || generation !== entry.snapshot.generation || this.entries.get(key) !== entry) return
        return this.refresh(normalized, undefined, options)
      })
      entry.queuedRefresh = queued
      return queued
    }
    const store = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    return this.startSnapshotLoad(normalized, entry, store, "refresh", snapshot, options?.recovered === true, options?.requireAvailable === true)
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
||||||| bc50ba56aa
      // Commit the whole batch atomically. A failed follow-up read keeps the
      // previous visible history and its retry cursor intact.
      const committed = this.commitPage(normalized, entry, store, page, "prepend", isCurrent)
      if (!committed || !isCurrent()) return
=======
      const committed = this.commitPage(normalized, entry, store, page, "prepend", isCurrent)
      if (!committed || !isCurrent()) return
>>>>>>> upstream/main
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
<<<<<<< HEAD
    } finally { release() }
||||||| bc50ba56aa
      const queuedRefresh = inflight.then(() => {
        if (
          this.disposed
          || this.sdkEpoch !== sdkEpoch
          || entry.snapshot.generation !== generation
          || this.entries.get(entryKey) !== entry
        ) {
          clearQueuedRefresh()
          return
        }
        const refreshLimit = entry.queuedRefreshLimit
        clearQueuedRefresh()
        return this.refreshTail(normalized, refreshLimit)
      })
      entry.queuedRefresh = queuedRefresh
      return queuedRefresh
    }
    const store = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    this.bumpGeneration(entry)
    return this.startLoad(normalized, entry, store, "refresh", async (isCurrent, performance) => {
      const epoch = this.historyEpoch
      const previousCoverage = entry.snapshot.resolved
        ? { cursor: entry.snapshot.cursor, complete: entry.snapshot.complete }
        : null
      // The tail must join the cached history. When more records arrived
      // than the tail holds, merging it would leave a hole behind it: read
      // back until it joins, or replace the cache with a fresh window.
      // Without a gap the cache is contiguous, so any record cached before
      // this read is a join point. After a gap, records that arrived by live
      // events may sit past a hole, so only the gap anchor is; a stale entry
      // without one cannot prove a join and takes a fresh window.
      const joinIDs = entry.verifiedEpoch < epoch
        ? new Set(entry.gapAnchorID ? [entry.gapAnchorID] : [])
        : new Set((store.getState().message[normalized.sessionID] ?? [])
          .filter((message) => !entry.optimistic.has(message.id))
          .map((message) => message.id))
      let page = await this.fetchPage(normalized, Math.max(1, limit), undefined, "refresh", performance)
      if (!isCurrent()) return
      let replacesCache = false
      if (previousCoverage) {
        const joinsCache = (window: FetchedPage) => window.session.some((message) => joinIDs.has(message.id))
        const window = await this.extendWindow(normalized, page, {
          isSatisfied: (candidate) => joinsCache(candidate) || hasInitialTurns(candidate.session),
          targetTurns: INITIAL_USER_TURNS,
        }, isCurrent, performance)
        if (!window) return
        page = window
        replacesCache = !page.complete && !joinsCache(page)
      }
      const committed = this.commitPage(normalized, entry, store, page, replacesCache ? "replace" : "merge", isCurrent)
      if (!committed || !isCurrent()) return
      entry.verifiedEpoch = Math.max(entry.verifiedEpoch, epoch)
      // A tail that joins the cache uses a deliberately small window: its
      // cursor describes only that window and must not replace the
      // established coverage, unless the tail holds the whole history.
      const coverage = replacesCache || page.complete || !previousCoverage ? page : previousCoverage
      this.patchEntry(entry, {
        status: "ready",
        loadingKind: null,
        error: null,
        resolved: true,
        limit: replacesCache ? committed.messages.length : Math.max(entry.snapshot.limit, committed.messages.length),
        cursor: coverage.cursor,
        complete: coverage.complete,
        updatedAt: Date.now(),
      })
      this.persistCoverage(normalized, entry.snapshot)
      await this.seedPendingInbox(normalized, entry, store, isCurrent)
    })
=======
      const queuedRefresh = inflight.then(() => {
        if (
          this.disposed
          || this.sdkEpoch !== sdkEpoch
          || entry.snapshot.generation !== generation
          || this.entries.get(entryKey) !== entry
        ) {
          clearQueuedRefresh()
          return
        }
        const refreshLimit = entry.queuedRefreshLimit
        clearQueuedRefresh()
        return this.refreshTail(normalized, refreshLimit)
      })
      entry.queuedRefresh = queuedRefresh
      return queuedRefresh
    }
    const store = this.childStores.ensureChild(normalized.directory, { bootstrap: false })
    this.bumpGeneration(entry)
    return this.startLoad(normalized, entry, store, "refresh", async (isCurrent, performance) => {
      const epoch = this.historyEpoch
      const previousCoverage = entry.snapshot.resolved
        ? { cursor: entry.snapshot.cursor, complete: entry.snapshot.complete }
        : null
      const joinIDs = entry.verifiedEpoch < epoch
        ? new Set(entry.gapAnchorID ? [entry.gapAnchorID] : [])
        : new Set((store.getState().message[normalized.sessionID] ?? [])
          .filter((message) => !entry.optimistic.has(message.id))
          .map((message) => message.id))
      let page = await this.fetchPage(normalized, Math.max(1, limit), undefined, "refresh", performance)
      if (!isCurrent()) return
      let replacesCache = false
      if (previousCoverage) {
        const joinsCache = (window: FetchedPage) => window.session.some((message) => joinIDs.has(message.id))
        const window = await this.extendWindow(normalized, page, {
          isSatisfied: (candidate) => joinsCache(candidate) || hasInitialTurns(candidate.session),
          targetTurns: INITIAL_USER_TURNS,
        }, isCurrent, performance)
        if (!window) return
        page = window
        replacesCache = !page.complete && !joinsCache(page)
      }
      const committed = this.commitPage(normalized, entry, store, page, replacesCache ? "replace" : "merge", isCurrent)
      if (!committed || !isCurrent()) return
      entry.verifiedEpoch = Math.max(entry.verifiedEpoch, epoch)
      const coverage = replacesCache || page.complete || !previousCoverage ? page : previousCoverage
      this.patchEntry(entry, {
        status: "ready",
        loadingKind: null,
        error: null,
        resolved: true,
        limit: replacesCache ? committed.messages.length : Math.max(entry.snapshot.limit, committed.messages.length),
        cursor: coverage.cursor,
        complete: coverage.complete,
        updatedAt: Date.now(),
      })
      this.persistCoverage(normalized, entry.snapshot)
      await this.seedPendingInbox(normalized, entry, store, isCurrent)
    })
>>>>>>> upstream/main
  }

  getSnapshot(target: SessionMessageTarget): SessionMessageLoadState {
    const normalized = this.normalizeTarget(target)
    return normalized ? this.getEntry(normalized).snapshot : EMPTY_SESSION_MESSAGE_LOAD_STATE
  }

  coversHistory(target: SessionMessageTarget): boolean {
    const normalized = this.normalizeTarget(target)
    const entry = normalized ? this.entries.get(this.keyFor(normalized)) : undefined
    return Boolean(entry && entryCoversHistory(entry))
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
<<<<<<< HEAD
      snapshot: prefetched && stored ? {
        ...createDefaultState(), status: "ready", resolved: true, limit: prefetched.limit,
        cursor: prefetched.cursor, complete: prefetched.complete, updatedAt: prefetched.at,
      } : createDefaultState(),
      listeners: new Set(), inflight: null, queuedRefresh: null, queuedRecovery: null, optimistic: new Map(), evicted: false,
||||||| bc50ba56aa
      target: { directory: target.directory, sessionID: target.sessionID },
      snapshot: prefetched
        ? {
            ...createDefaultState(),
            status: "ready",
            resolved: true,
            limit: prefetched.limit,
            cursor: prefetched.cursor,
            complete: prefetched.complete,
            updatedAt: prefetched.at,
          }
        : createDefaultState(),
      listeners: new Set(),
      inflight: null,
      queuedRefresh: null,
      queuedRefreshLimit: 0,
      optimistic: new Map(),
      evicted: false,
      // Unknown provenance: confirmed only as of the loader's first epoch.
      verifiedEpoch: 0,
      gapAnchorID: null,
      inboxSeeded: false,
      inboxSeededIDs: new Set(),
=======
      target: { directory: target.directory, sessionID: target.sessionID },
      snapshot: prefetched
        ? {
            ...createDefaultState(),
            status: "ready",
            resolved: true,
            limit: prefetched.limit,
            cursor: prefetched.cursor,
            complete: prefetched.complete,
            updatedAt: prefetched.at,
          }
        : createDefaultState(),
      listeners: new Set(),
      inflight: null,
      queuedRefresh: null,
      queuedRefreshLimit: 0,
      optimistic: new Map(),
      evicted: false,
      verifiedEpoch: 0,
      gapAnchorID: null,
      inboxSeeded: false,
      inboxSeededIDs: new Set(),
>>>>>>> upstream/main
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

<<<<<<< HEAD
  private knownSession(sessionId: string, store: ChildStore): Session | undefined {
    return store.getState().session.find(session => session.sessionId === sessionId)
      ?? useGlobalSessionsStore.getState().entityById.get(sessionId)
||||||| bc50ba56aa
  private async loadInitial(
    target: SessionMessageTarget,
    entry: LoaderEntry,
    store: { getState: () => DirectoryStore; setState: DirectoryStoreSetter },
    isCurrent: () => boolean,
    performance?: LoadPerformanceDetails,
    seedInbox = true,
  ): Promise<void> {
    const epoch = this.historyEpoch
    const storeMessageCount = store.getState().message[target.sessionID]?.length ?? 0
    // Cold navigation aims for several whole turns; history readers and
    // sessions that already hold messages only need one user boundary.
    const coldNavigation = (storeMessageCount === 0 || entry.evicted) && !this.historyReaders.get(this.keyFor(target))
    const firstLimit = Math.max(entry.snapshot.limit, storeMessageCount, getInitialPageSize())
    const firstPage = await this.fetchPage(target, firstLimit, undefined, "initial-page", performance)
    if (!isCurrent()) return
    const acceptedPage = await this.extendWindow(target, firstPage, coldNavigation
      ? { isSatisfied: (window) => hasInitialTurns(window.session), targetTurns: INITIAL_USER_TURNS }
      : { isSatisfied: (window) => hasUserMessage(window.session), targetTurns: 1 }, isCurrent, performance)
    if (!acceptedPage) return

    // Publish the chosen window once.
    const committed = this.commitPage(target, entry, store, acceptedPage, "merge", isCurrent)
    if (!committed || !isCurrent()) return
    entry.evicted = false
    entry.verifiedEpoch = Math.max(entry.verifiedEpoch, epoch)
    this.patchEntry(entry, {
      status: "ready",
      loadingKind: null,
      error: null,
      resolved: true,
      limit: committed.messages.length,
      cursor: acceptedPage.cursor,
      complete: acceptedPage.complete,
      updatedAt: Date.now(),
    })
    this.persistCoverage(target, entry.snapshot)
    if (seedInbox) await this.seedPendingInbox(target, entry, store, isCurrent)
=======
  private async loadInitial(
    target: SessionMessageTarget,
    entry: LoaderEntry,
    store: { getState: () => DirectoryStore; setState: DirectoryStoreSetter },
    isCurrent: () => boolean,
    performance?: LoadPerformanceDetails,
    seedInbox = true,
  ): Promise<void> {
    const epoch = this.historyEpoch
    const storeMessageCount = store.getState().message[target.sessionID]?.length ?? 0
    const coldNavigation = (storeMessageCount === 0 || entry.evicted) && !this.historyReaders.get(this.keyFor(target))
    const firstLimit = Math.max(entry.snapshot.limit, storeMessageCount, getInitialPageSize())
    const firstPage = await this.fetchPage(target, firstLimit, undefined, "initial-page", performance)
    if (!isCurrent()) return
    const acceptedPage = await this.extendWindow(target, firstPage, coldNavigation
      ? { isSatisfied: (window) => hasInitialTurns(window.session), targetTurns: INITIAL_USER_TURNS }
      : { isSatisfied: (window) => hasUserMessage(window.session), targetTurns: 1 }, isCurrent, performance)
    if (!acceptedPage) return

    const committed = this.commitPage(target, entry, store, acceptedPage, "merge", isCurrent)
    if (!committed || !isCurrent()) return
    entry.evicted = false
    entry.verifiedEpoch = Math.max(entry.verifiedEpoch, epoch)
    this.patchEntry(entry, {
      status: "ready",
      loadingKind: null,
      error: null,
      resolved: true,
      limit: committed.messages.length,
      cursor: acceptedPage.cursor,
      complete: acceptedPage.complete,
      updatedAt: Date.now(),
    })
    this.persistCoverage(target, entry.snapshot)
    if (seedInbox) await this.seedPendingInbox(target, entry, store, isCurrent)
>>>>>>> upstream/main
  }
<<<<<<< HEAD
  /**
   * The row that tells a child apart from a root: the listed child row when the
   * projection carries one, otherwise the identity a `vibe_spawn` child still
   * has through the live subagent index. Its transcript is readable only through
   * the history route; the root-only snapshot, metadata, queue and event routes
   * answer 403/404 for it. The parent row supplies the workspace identity, and
   * the subagent record supplies the child's own activity. A child has no event
   * stream of its own: its epoch and head are its own identity, never the
   * parent's cursor, which would describe events the child never received.
   */
  private knownChild(target: SessionMessageTarget, store: ChildStore): Session | undefined {
    const listed = this.knownSession(target.sessionId, store)
    if (listed) return listed.rootSessionId !== listed.sessionId ? listed : undefined
    const subagents = useSubagentsStore.getState().byParent
    for (const parentId in subagents) {
      const found = subagents[parentId].find(child => child.subagentId === target.sessionId || child.childSessionId === target.sessionId)
      if (!found) continue
      const parent = this.knownSession(parentId, store)
      if (!parent) continue
      const active = found.status === "running" && parent.activeRunId !== null
      const runtimeStatus = parent.runtimeStatus === "unavailable" ? "unavailable" : active ? parent.runtimeStatus : "idle"
      return {
        sessionId: target.sessionId, parentSessionId: parentId, rootSessionId: parent.rootSessionId,
        projectId: parent.projectId, workspaceId: parent.workspaceId, displayPath: parent.displayPath,
        createdAt: found.createdAt ?? parent.createdAt, updatedAt: found.updatedAt ?? parent.updatedAt,
        epoch: target.sessionId, headSequence: "0",
        runtimeStatus, activeRunId: runtimeStatus === "idle" || runtimeStatus === "unavailable" ? null : parent.activeRunId,
        mode: { kind: "main" },
        metadata: null, metadataRevision: "0", archiveRevision: "0",
||||||| bc50ba56aa

  /**
   * Extends a newest-first window backward through the server cursor until
   * `isSatisfied` holds, history is complete, or the window reaches the record
   * ceiling. The ceiling never stops it before the newest prompt: a window
   * without one has no turn to render. Each extension page is sized from the
   * turn density fetched so far, so a long session needs one more round trip,
   * not one per hundred records. Returns null when the read went stale.
   */
  private async extendWindow(
    target: SessionMessageTarget,
    firstPage: FetchedPage,
    goal: { isSatisfied: (window: FetchedPage) => boolean; targetTurns: number },
    isCurrent: () => boolean,
    performance?: LoadPerformanceDetails,
  ): Promise<FetchedPage | null> {
    let window = firstPage
    const visited = new Set<string>()
    while (!window.complete && !goal.isSatisfied(window)) {
      const held = window.session.length
      const turns = countUserMessages(window.session)
      const remaining = getInitialWindowMaxRecords() - held
      if (turns > 0 && remaining <= 0) break
      const cursor = window.cursor
      if (!cursor || visited.has(cursor)) break
      visited.add(cursor)
      const estimate = turns > 0
        ? Math.ceil((held * goal.targetTurns * EXTENSION_ESTIMATE_HEADROOM) / turns) - held
        : MAX_MESSAGE_PAGE_SIZE
      const limit = turns > 0 ? Math.max(1, Math.min(estimate, remaining)) : estimate
      const older = await this.fetchPage(target, limit, cursor, "initial-page", performance)
      if (!isCurrent()) return null
      if (older.session.length === 0 && !older.complete) break
      window = {
        session: [...older.session, ...window.session],
        partsByMessageID: new Map([...window.partsByMessageID, ...older.partsByMessageID]),
        cursor: older.cursor,
        complete: older.complete,
=======

  private async extendWindow(
    target: SessionMessageTarget,
    firstPage: FetchedPage,
    goal: { isSatisfied: (window: FetchedPage) => boolean; targetTurns: number },
    isCurrent: () => boolean,
    performance?: LoadPerformanceDetails,
  ): Promise<FetchedPage | null> {
    let window = firstPage
    const visited = new Set<string>()
    while (!window.complete && !goal.isSatisfied(window)) {
      const held = window.session.length
      const turns = countUserMessages(window.session)
      const remaining = getInitialWindowMaxRecords() - held
      if (turns > 0 && remaining <= 0) break
      const cursor = window.cursor
      if (!cursor || visited.has(cursor)) break
      visited.add(cursor)
      const estimate = turns > 0
        ? Math.ceil((held * goal.targetTurns * EXTENSION_ESTIMATE_HEADROOM) / turns) - held
        : MAX_MESSAGE_PAGE_SIZE
      const limit = turns > 0 ? Math.max(1, Math.min(estimate, remaining)) : estimate
      const older = await this.fetchPage(target, limit, cursor, "initial-page", performance)
      if (!isCurrent()) return null
      if (older.session.length === 0 && !older.complete) break
      window = {
        session: [...older.session, ...window.session],
        partsByMessageID: new Map([...window.partsByMessageID, ...older.partsByMessageID]),
        cursor: older.cursor,
        complete: older.complete,
>>>>>>> upstream/main
      }
    }
    return undefined
  }
<<<<<<< HEAD
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
||||||| bc50ba56aa

  /**
   * Repaints the messages that a session's pending OpenCode inbox items stand
   * for.
   *
   * `session.inbox.enqueued` adds them live, but the inbox is not part of the
   * message history: a cold load (a refresh, another device, a remounted
   * route) showed nothing while OpenCode still held the items, and later
   * admitted every one at once. Best effort — a failed read leaves the loaded
   * transcript exactly as it was.
   */
  private async seedPendingInbox(
    target: SessionMessageTarget,
    entry: LoaderEntry,
    store: { getState: () => DirectoryStore; setState: DirectoryStoreSetter },
    isCurrent: () => boolean,
  ): Promise<void> {
    const read = this.sdk.getSessionInbox?.bind(this.sdk)
    if (!read) return
    let items: readonly PendingInboxMessage[]
    try {
      items = await read(target.sessionID, target.directory)
    } catch {
      return
    }
    if (!isCurrent()) return
    entry.inboxSeeded = true
    if (items.length === 0) return
    try {
=======

  private async seedPendingInbox(
    target: SessionMessageTarget,
    entry: LoaderEntry,
    store: { getState: () => DirectoryStore; setState: DirectoryStoreSetter },
    isCurrent: () => boolean,
  ): Promise<void> {
    const read = this.sdk.getSessionInbox?.bind(this.sdk)
    if (!read) return
    let items: readonly PendingInboxMessage[]
    try {
      items = await read(target.sessionID, target.directory)
    } catch {
      return
    }
    if (!isCurrent()) return
    entry.inboxSeeded = true
    if (items.length === 0) return
    try {
>>>>>>> upstream/main
      const current = store.getState()
<<<<<<< HEAD
      const deletedRevision = current.sessionDeletedRevision?.[target.sessionId]
      if (deletedRevision !== undefined && deletedRevision >= requestedRevision) {
        this.patchEntry(entry, { status: "idle", loadingKind: null, resolved: false })
        return
||||||| bc50ba56aa
      const messages = [...(current.message[target.sessionID] ?? [])]
      const held = new Set(messages.map((message) => message.id))
      const parts = { ...current.part }
      let changed = false
      for (const { info, parts: itemParts } of items) {
        // A live event (or an earlier seed) already painted this item.
        if (held.has(info.id)) continue
        messages.push(info)
        if (itemParts) parts[info.id] = itemParts
        entry.inboxSeededIDs.add(info.id)
        held.add(info.id)
        changed = true
=======
      const messages = [...(current.message[target.sessionID] ?? [])]
      const held = new Set(messages.map((message) => message.id))
      const parts = { ...current.part }
      let changed = false
      for (const { info, parts: itemParts } of items) {
        if (held.has(info.id)) continue
        messages.push(info)
        if (itemParts) parts[info.id] = itemParts
        entry.inboxSeededIDs.add(info.id)
        held.add(info.id)
        changed = true
>>>>>>> upstream/main
      }
      const incoming = sortMessagesChronologically(page.messages)
      const messages = kind === "older" ? mergeMessages(current.message[target.sessionId] ?? [], incoming) : incoming
      // History establishes the transcript, not session authority. `knownChild`
      // reads the directory row first, so a child installed while this read was
      // in flight keeps its own status and cursor; the pre-read identity is only
      // used when no row exists yet to materialize the unlisted child.
      const next = installHostSession(current, this.knownChild(target, store) ?? child)
      store.setState({
        ...next, message: { ...next.message, [target.sessionId]: messages },
        partOwner: { ...next.partOwner, [target.sessionId]: partOwners(messages) }
      })
<<<<<<< HEAD
      entry.historyBranch = page.branch
      entry.evicted = false
      this.patchEntry(entry, {
        status: "ready", loadingKind: null, error: null, resolved: true,
        cursor: page.nextCursor ?? undefined, complete: page.nextCursor === null, limit: messages.length, updatedAt: Date.now()
      })
      this.persistCoverage(target, entry.snapshot)
      // No synthetic snapshot or journal cursor: Task32 exposes child history only.
||||||| bc50ba56aa
    } catch {
      // A malformed item must not turn an already loaded transcript into an
      // error; the read succeeded, so this open does not retry it.
    }
  }

  /**
   * One page of messages, newest first. `cursor` comes from the previous
   * page's `next` and walks toward older history; its absence is the adapter
   * saying this is the oldest page, which is the only signal for `complete`.
   */
  private async fetchPage(
    target: SessionMessageTarget,
    requestedLimit: number,
    cursor?: string,
    caller: "initial-page" | "older" | "refresh" = "initial-page",
    performance?: LoadPerformanceDetails,
  ): Promise<FetchedPage> {
    const limit = Math.min(Math.max(1, requestedLimit), MAX_MESSAGE_PAGE_SIZE)
    const finishPagePerformance = startSessionLoadPerformanceEvent({
      operation: "session-messages.page",
      caller,
      requestLimit: limit,
      cursorPresent: cursor !== undefined,
=======
    } catch {
      // A malformed item must not turn an already loaded transcript into an
      // error; the read succeeded, so this open does not retry it.
    }
  }

  private async fetchPage(
    target: SessionMessageTarget,
    requestedLimit: number,
    cursor?: string,
    caller: "initial-page" | "older" | "refresh" = "initial-page",
    performance?: LoadPerformanceDetails,
  ): Promise<FetchedPage> {
    const limit = Math.min(Math.max(1, requestedLimit), MAX_MESSAGE_PAGE_SIZE)
    const finishPagePerformance = startSessionLoadPerformanceEvent({
      operation: "session-messages.page",
      caller,
      requestLimit: limit,
      cursorPresent: cursor !== undefined,
>>>>>>> upstream/main
    })
<<<<<<< HEAD
||||||| bc50ba56aa
    let attempts = 0
    let recordCount = 0
    try {
      const page = await retry(async () => {
        attempts += 1
        // Finished tool results arrive as shells; a row that shows one
        // completes its message (`tool-content-completion.ts`).
        return this.sdk.getSessionMessages(target.sessionID, { limit, cursor, partShells: true }, target.directory)
      })
      const records = page.items.filter((record) => Boolean(record?.info?.id))
      recordCount = records.length
      if (performance) performance.recordCount += recordCount
      const session = sortMessagesChronologically(records.map((record) => record.info))
      const partsByMessageID = new Map<string, Part[]>()
      for (const record of records) {
        partsByMessageID.set(record.info.id, filterIdentifiedParts(record.parts ?? []))
      }
      const nextCursor = page.cursor?.next
      finishPagePerformance("complete", { retryCount: Math.max(0, attempts - 1), recordCount })
      return { session, partsByMessageID, cursor: nextCursor, complete: !nextCursor }
    } catch (error) {
      finishPagePerformance("error", { retryCount: Math.max(0, attempts - 1), recordCount })
      throw error
    } finally {
      if (performance) performance.retryCount += Math.max(0, attempts - 1)
    }
=======
    let attempts = 0
    let recordCount = 0
    try {
      const page = await retry(async () => {
        attempts += 1
        return this.sdk.getSessionMessages(target.sessionID, { limit, cursor, partShells: true }, target.directory)
      })
      const records = page.items.filter((record) => Boolean(record?.info?.id))
      recordCount = records.length
      if (performance) performance.recordCount += recordCount
      const session = sortMessagesChronologically(records.map((record) => record.info))
      const partsByMessageID = new Map<string, Part[]>()
      for (const record of records) {
        partsByMessageID.set(record.info.id, filterIdentifiedParts(record.parts ?? []))
      }
      const nextCursor = page.cursor?.next
      finishPagePerformance("complete", { retryCount: Math.max(0, attempts - 1), recordCount })
      return { session, partsByMessageID, cursor: nextCursor, complete: !nextCursor }
    } catch (error) {
      finishPagePerformance("error", { retryCount: Math.max(0, attempts - 1), recordCount })
      throw error
    } finally {
      if (performance) performance.retryCount += Math.max(0, attempts - 1)
    }
>>>>>>> upstream/main
  }

<<<<<<< HEAD
  private startSnapshotLoad(target: SessionMessageTarget, entry: LoaderEntry, store: ChildStore, kind: "initial" | "refresh" | "prefetch", suppliedSnapshot?: SessionSnapshot, recovered = false, requireAvailable = false): Promise<void> {
    // A composer draft is a local `draft_<draftId>` identity the Host has never
    // seen. Its transcript is the optimistic echo in the child store, so there
    // is no snapshot to request and no failure to report.
    if (isDraftSessionId(target.sessionId)) {
      if (!entry.snapshot.resolved || entry.snapshot.status !== "idle" || entry.snapshot.error !== null) {
        this.patchEntry(entry, { status: "idle", loadingKind: null, error: null, resolved: true, complete: true, limit: store.getState().message[target.sessionId]?.length ?? 0 })
      }
      return Promise.resolve()
||||||| bc50ba56aa
  private commitPage(
    target: SessionMessageTarget,
    entry: LoaderEntry,
    store: { getState: () => DirectoryStore; setState: DirectoryStoreSetter },
    page: FetchedPage,
    mode: "merge" | "prepend" | "replace",
    isCurrent: () => boolean,
  ): { messages: Message[] } | null {
    if (!isCurrent()) return null
    const current = store.getState()
    const echoed = withoutEchoedOptimisticRecords(current, target.sessionID, page, entry.optimistic)
    const state = mode === "replace" ? withoutHistoryOutsideWindow(echoed, target.sessionID, page, entry.optimistic, entry.inboxSeededIDs) : echoed
    const merged = mergeOptimisticPage({
      session: page.session,
      part: [...page.partsByMessageID].map(([id, part]) => ({ id, part })),
      cursor: page.cursor,
      complete: page.complete,
    }, [...entry.optimistic.values()])
    for (const messageID of merged.confirmed) entry.optimistic.delete(messageID)
    const mergedPartsByMessageID = new Map(merged.part.map((candidate) => [candidate.id, candidate.part] as const))
    const materialized = materializeSessionSnapshots(
      state,
      target.sessionID,
      merged.session.map((info) => ({
        info,
        parts: page.partsByMessageID.get(info.id)
          ?? mergedPartsByMessageID.get(info.id)
          ?? [],
      })),
      { mode: mode === "prepend" ? "prepend" : "merge" },
    )
    if (!isCurrent()) return null
    // Records the page made redundant were removed before materializing;
    // that removal is a change even when the page itself changes nothing.
    const messagesChanged = materialized.messagesChanged || state.message !== current.message
    const partsChanged = materialized.partsChanged || state.part !== current.part
    if (messagesChanged || partsChanged) {
      store.setState({
        ...(messagesChanged ? { message: materialized.message } : {}),
        ...(partsChanged ? { part: materialized.part } : {}),
      })
=======
  private commitPage(
    target: SessionMessageTarget,
    entry: LoaderEntry,
    store: { getState: () => DirectoryStore; setState: DirectoryStoreSetter },
    page: FetchedPage,
    mode: "merge" | "prepend" | "replace",
    isCurrent: () => boolean,
  ): { messages: Message[] } | null {
    if (!isCurrent()) return null
    const current = store.getState()
    const echoed = withoutEchoedOptimisticRecords(current, target.sessionID, page, entry.optimistic)
    const state = mode === "replace" ? withoutHistoryOutsideWindow(echoed, target.sessionID, page, entry.optimistic, entry.inboxSeededIDs) : echoed
    const merged = mergeOptimisticPage({
      session: page.session,
      part: [...page.partsByMessageID].map(([id, part]) => ({ id, part })),
      cursor: page.cursor,
      complete: page.complete,
    }, [...entry.optimistic.values()])
    for (const messageID of merged.confirmed) entry.optimistic.delete(messageID)
    const mergedPartsByMessageID = new Map(merged.part.map((candidate) => [candidate.id, candidate.part] as const))
    const materialized = materializeSessionSnapshots(
      state,
      target.sessionID,
      merged.session.map((info) => ({
        info,
        parts: page.partsByMessageID.get(info.id)
          ?? mergedPartsByMessageID.get(info.id)
          ?? [],
      })),
      { mode: mode === "prepend" ? "prepend" : "merge" },
    )
    if (!isCurrent()) return null
    const messagesChanged = materialized.messagesChanged || state.message !== current.message
    const partsChanged = materialized.partsChanged || state.part !== current.part
    if (messagesChanged || partsChanged) {
      store.setState({
        ...(messagesChanged ? { message: materialized.message } : {}),
        ...(partsChanged ? { part: materialized.part } : {}),
      })
>>>>>>> upstream/main
    }
    if (this.knownChild(target, store)) return this.startChildHistoryLoad(target, entry, store, kind)
    const client = this.configuration.client
    const onSnapshot = this.configuration.onSnapshot
    return this.startLoad(target, entry, store, kind, async isCurrent => {
      const requestedRevision = store.getState().sessionRevision ?? 0
      const requestedRunControlRevision = store.getState().runControlRevision?.[target.sessionId] ?? 0
      const knownWorkspace = store.getState().workspace
      const [snapshot, workspace] = await retry(async () => {
        if (!isCurrent()) throw new Error("Session snapshot load is no longer current")
        const result = await Promise.all([
          suppliedSnapshot ? Promise.resolve(suppliedSnapshot) : client.getSnapshot(target.sessionId),
          knownWorkspace ? Promise.resolve(knownWorkspace) : client.resolveWorkspace(target.directory),
        ])
        if (requireAvailable && result[0].session.runtimeStatus === "unavailable") {
          throw Object.assign(new Error("Session worker is not accepting requests yet"), { status: 503 })
        }
        return result
      }, STARTUP_RETRY)
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
