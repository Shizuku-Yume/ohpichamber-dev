import type { StoreApi } from "zustand/vanilla"
import type { ChildStoreManager, DirectoryStore } from "./child-store"
import { getProtectedSessionCacheIds, pickSessionCacheEvictions } from "./session-cache"

const SESSION_CACHE_IDLE_TTL_MS = 5 * 60 * 1000

export type SessionMessageTarget = { directory: string; sessionId: string }
type RetentionOptions = {
  limit: number
  idleTtlMs?: number
  isCurrent: () => boolean
  isViewed: (target: SessionMessageTarget) => boolean
  isProtected: (target: SessionMessageTarget) => boolean
  evict: (target: SessionMessageTarget) => void
}
type DirectoryEntry = {
  store: StoreApi<DirectoryStore>
  seen: Set<string>
  idleSince: Map<string, number>
  timer: ReturnType<typeof setTimeout> | null
  unsubscribe: () => void
}

<<<<<<< HEAD
const sameMessageMembership = (left: Record<string, unknown>, right: Record<string, unknown>): boolean => {
  let leftCount = 0;
  let rightCount = 0;
  for (const sessionId in left) {
    if (!Object.prototype.hasOwnProperty.call(left, sessionId)) continue;
    if (!Object.prototype.hasOwnProperty.call(right, sessionId)) return false;
    leftCount += 1;
  }
  for (const sessionId in right) if (Object.prototype.hasOwnProperty.call(right, sessionId)) rightCount += 1;
  return leftCount === rightCount;
};

/** Whole-session retention keeps active and viewed native histories intact. */
||||||| bc50ba56aa
/**
 * Whole-session eviction, never partial trimming. A cached history is either
 * fully present or gone. Settled sessions nobody is looking at are dropped
 * after an idle grace period, so a quick return needs no request; the count
 * limit is a safety net that evicts the least recently visited session first.
 */
=======
>>>>>>> upstream/main
export class SessionCacheRetention {
  private readonly directories = new Map<string, DirectoryEntry>()
  private readonly pending = new Set<string>()
  private readonly unsubscribeRegistry: () => void
  private readonly idleTtlMs: number
  private disposed = false

  constructor(private readonly stores: ChildStoreManager, private readonly options: RetentionOptions) {
    this.idleTtlMs = options.idleTtlMs ?? SESSION_CACHE_IDLE_TTL_MS
    this.unsubscribeRegistry = stores.subscribeRegistry(() => this.attach())
    this.attach()
  }

  touch(target: SessionMessageTarget): void {
    const entry = this.directories.get(target.directory)
    if (!entry) return
    entry.seen.delete(target.sessionId)
    entry.seen.add(target.sessionId)
    this.schedule(target.directory)
  }

  admitPrefetch(target: SessionMessageTarget): boolean {
    const entry = this.directories.get(target.directory)
    if (!entry) return false
    const messages = entry.store.getState().message
    if (entry.seen.has(target.sessionId) || messages[target.sessionId] !== undefined) return true
    const occupied = new Set([...entry.seen, ...Object.keys(messages)])
    if (occupied.size >= this.options.limit) return false
<<<<<<< HEAD
    entry.seen = new Set([target.sessionId, ...entry.seen])
||||||| bc50ba56aa
    // Reserve capacity before HTTP starts. Speculative history is older than
    // every visited session and never promotes a cache hit's navigation recency.
    entry.seen = new Set([target.sessionID, ...entry.seen])
=======
    entry.seen = new Set([target.sessionID, ...entry.seen])
>>>>>>> upstream/main
    return true
  }

  schedule(directory: string): void {
    if (this.disposed || this.pending.has(directory)) return
    this.pending.add(directory)
    queueMicrotask(() => {
      this.pending.delete(directory)
      if (!this.disposed && this.options.isCurrent()) this.clean(directory)
    })
  }

  dispose(): void {
    this.disposed = true
    this.unsubscribeRegistry()
    for (const entry of this.directories.values()) this.detach(entry)
    this.directories.clear()
    this.pending.clear()
  }

  private detach(entry: DirectoryEntry): void {
    entry.unsubscribe()
    if (entry.timer !== null) clearTimeout(entry.timer)
    entry.timer = null
  }

  private attach(): void {
    for (const [directory, entry] of this.directories) {
      if (this.stores.getChild(directory) === entry.store) continue
      this.detach(entry)
      this.directories.delete(directory)
    }
    for (const [directory, store] of this.stores.children) {
      if (this.directories.has(directory)) continue
      const seen = new Set(Object.keys(store.getState().message))
      const unsubscribe = store.subscribe((state, previous) => {
        if (state.message === previous.message
          && state.session_status === previous.session_status
          && state.permission === previous.permission
          && state.form === previous.form) return
        if (state.session_status === previous.session_status
          && state.permission === previous.permission
          && state.form === previous.form
          && sameMessageMembership(state.message, previous.message)) return
        this.schedule(directory)
      })
      this.directories.set(directory, { store, seen, idleSince: new Map(), timer: null, unsubscribe })
      this.schedule(directory)
    }
  }

  private clean(directory: string): void {
    const entry = this.directories.get(directory)
    if (!entry) return
    const state = entry.store.getState()
    const protectedIds = getProtectedSessionCacheIds(state)
    for (const sessionId of entry.seen) {
      if (state.message[sessionId] !== undefined || this.options.isProtected({ directory, sessionId })) continue
      entry.seen.delete(sessionId)
      entry.idleSince.delete(sessionId)
    }
    for (const sessionId of Object.keys(state.message)) entry.seen.add(sessionId)
    for (const sessionId of entry.seen) {
      const target = { directory, sessionId }
      if (this.options.isViewed(target) || this.options.isProtected(target)) protectedIds.add(sessionId)
    }
    const now = Date.now()
    const expired: string[] = []
    for (const sessionId of entry.seen) {
      if (protectedIds.has(sessionId)) {
        entry.idleSince.delete(sessionId)
        continue
      }
      const since = entry.idleSince.get(sessionId)
      if (since === undefined) entry.idleSince.set(sessionId, now)
      else if (now - since >= this.idleTtlMs) expired.push(sessionId)
    }
    const overflow = pickSessionCacheEvictions({ seen: entry.seen, limit: this.options.limit, preserve: protectedIds })
    for (const sessionId of new Set([...expired, ...overflow])) {
      entry.seen.delete(sessionId)
      entry.idleSince.delete(sessionId)
      this.options.evict({ directory, sessionId })
    }
    this.armTimer(entry, directory, now)
  }

  private armTimer(entry: DirectoryEntry, directory: string, now: number): void {
    if (entry.timer !== null) clearTimeout(entry.timer)
    entry.timer = null
    let earliest: number | null = null
    for (const since of entry.idleSince.values()) if (earliest === null || since < earliest) earliest = since
    if (earliest === null) return
    entry.timer = setTimeout(() => {
      entry.timer = null
      this.schedule(directory)
    }, Math.max(0, earliest + this.idleTtlMs - now))
  }
}
