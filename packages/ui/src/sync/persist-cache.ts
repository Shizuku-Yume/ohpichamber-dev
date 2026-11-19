<<<<<<< HEAD
import { SessionSchema, type Session } from "@openchamber/agent-contract"
||||||| bc50ba56aa
/**
 * Persisted child-store metadata caches.
 *
 * VCS info, project metadata, icons, and a bounded session-list snapshot are
 * cached to localStorage per runtime and directory so they survive reloads.
 * A bounded global snapshot of active sessions outside the managed chats root
 * seeds the global session store for the first sidebar paint.
 * Message/part data is always loaded from the server.
 */

import type { Session, Vcs } from "@/lib/opencode/model"
import type { ProjectMeta } from "./types"
=======

import { parseMetadata } from "@/lib/metadataParse"
import type { Session, Vcs } from "@/lib/opencode/model"
import type { ProjectMeta } from "./types"
>>>>>>> upstream/main
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from "@/lib/runtime-switch"
import { countSyncPersistenceSerialization, countSyncPersistenceStorageWrite } from "./performance-diagnostics"
import type { ProjectMeta } from "./types"
import { z } from "zod"

const PERSISTED_SESSION_LIMIT = 50
const SESSION_CACHE_FALLBACK_LIMITS = [PERSISTED_SESSION_LIMIT, 25, 10, 5, 1] as const
const SESSION_PERSIST_THROTTLE_MS = 2_000
const MANAGED_CHATS_CACHE_SCOPE = "openchamber:managed-chats"
const GLOBAL_SNAPSHOT_LIMITS = [200, 100, 50, 25, 10] as const
const GLOBAL_SNAPSHOT_MAX_CHARS = 256 * 1024
const GLOBAL_SNAPSHOT_VERSION = 1

type PendingSessionWrite = { runtimeKey: string; key: string; sessions: Session[]; write: () => void }
const pendingSessionWrites = new Map<string, PendingSessionWrite>()
let pendingSessionWriteTimer: ReturnType<typeof setTimeout> | undefined

<<<<<<< HEAD
type CacheKey = "vcs" | "projectMeta" | "icon" | "sessions"
||||||| bc50ba56aa
// ---------------------------------------------------------------------------
// Storage key generation
// ---------------------------------------------------------------------------
=======
>>>>>>> upstream/main

function hashCode(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash) + value.charCodeAt(index) | 0
  return Math.abs(hash).toString(36)
}

function storagePrefixForRuntime(runtimeKey: string, directory: string): string {
  const head = directory.slice(0, 12).replace(/[^a-zA-Z0-9]/g, "_")
  return `oc.dir.v2.${head}.${hashCode(`${runtimeKey}\0${directory}`)}`
}

<<<<<<< HEAD
function storagePrefix(directory: string): string {
  return storagePrefixForRuntime(getRuntimeKey() || "local", directory)
||||||| bc50ba56aa
// ---------------------------------------------------------------------------
// Typed cache helpers
// ---------------------------------------------------------------------------

type CacheKey = "vcs" | "projectMeta" | "icon" | "sessions"

function cacheKey(directory: string, key: CacheKey): string {
  return `${storagePrefix(directory)}.${key}`
=======

type CacheKey = "vcs" | "projectMeta" | "icon" | "sessions"

function cacheKey(directory: string, key: CacheKey): string {
  return `${storagePrefix(directory)}.${key}`
>>>>>>> upstream/main
}

function legacyStoragePrefix(directory: string): string {
  const head = directory.slice(0, 12).replace(/[^a-zA-Z0-9]/g, "_")
  return `oc.dir.${head}.${hashCode(directory)}`
}

function cacheKey(directory: string, key: CacheKey): string { return `${storagePrefix(directory)}.${key}` }
function legacyCacheKey(directory: string, key: CacheKey): string { return `${legacyStoragePrefix(directory)}.${key}` }

function readCache<T>(directory: string, key: CacheKey): T | undefined {
  try {
    const currentKey = cacheKey(directory, key)
    if (key === "sessions") {
      const pending = pendingSessionWrites.get(currentKey)
      if (pending) return pending.sessions as T
    }
    const raw = localStorage.getItem(currentKey) ?? (key === "sessions" ? null : localStorage.getItem(legacyCacheKey(directory, key)))
    return raw ? JSON.parse(raw) as T : undefined
  } catch {
    return undefined
  }
}

function writeCache<T>(directory: string, key: CacheKey, value: T | undefined): void {
  try {
    const currentKey = cacheKey(directory, key)
    const legacyKey = legacyCacheKey(directory, key)
    if (value === undefined) localStorage.removeItem(currentKey)
    else localStorage.setItem(currentKey, JSON.stringify(value))
    localStorage.removeItem(legacyKey)
  } catch {
    // Storage is best-effort; authoritative bootstrap remains the source of truth.
  }
}

<<<<<<< HEAD
type RecencyRecord = Pick<Session, "sessionId" | "parentSessionId" | "createdAt" | "updatedAt">
function sessionRecencyTimestamp(session: RecencyRecord): number { return session.updatedAt }
||||||| bc50ba56aa
/** What recency selection reads from a session or its persisted projection. */
type RecencyRecord = Pick<Session, "id" | "parentID" | "time">

function sessionRecencyTimestamp(session: RecencyRecord): number {
  const updated = session.time?.updated
  if (typeof updated === "number" && Number.isFinite(updated)) return updated
  const created = session.time?.created
  return typeof created === "number" && Number.isFinite(created) ? created : 0
}

=======
type RecencyRecord = Pick<Session, "id" | "parentID" | "time">

function sessionRecencyTimestamp(session: RecencyRecord): number {
  const updated = session.time?.updated
  if (typeof updated === "number" && Number.isFinite(updated)) return updated
  const created = session.time?.created
  return typeof created === "number" && Number.isFinite(created) ? created : 0
}

>>>>>>> upstream/main
function recentSessionIds(sessions: readonly RecencyRecord[], limit: number): Set<string> {
  return new Set([...sessions]
    .sort((left, right) => sessionRecencyTimestamp(right) - sessionRecencyTimestamp(left) || right.sessionId.localeCompare(left.sessionId))
    .slice(0, limit)
    .map((session) => session.sessionId))
}
function selectRecentSessions<T extends RecencyRecord>(sessions: T[], limit: number): T[] {
  if (sessions.length <= limit) return sessions
  const ids = recentSessionIds(sessions, limit)
  return sessions.filter((session) => ids.has(session.sessionId))
}
<<<<<<< HEAD
||||||| bc50ba56aa

/**
 * The `limit` most recent sessions plus every ancestor of a kept child, so a
 * kept subtask never paints without the parent that nests it.
 */
=======

>>>>>>> upstream/main
function selectRecentSessionsWithAncestors<T extends RecencyRecord>(sessions: T[], limit: number): T[] {
  if (sessions.length <= limit) return sessions
  const keptIds = recentSessionIds(sessions, limit)
  const byId = new Map(sessions.map((session) => [session.sessionId, session]))
  for (const id of [...keptIds]) {
    let parentId = byId.get(id)?.parentSessionId
    while (parentId && !keptIds.has(parentId) && byId.has(parentId)) {
      keptIds.add(parentId)
      parentId = byId.get(parentId)?.parentSessionId
    }
  }
  return sessions.filter((session) => keptIds.has(session.sessionId))
}

<<<<<<< HEAD
function tryWriteSerialized(key: string, serialized: string): boolean {
||||||| bc50ba56aa
/**
 * A persisted session keeps what the sidebar paints before the authoritative
 * list replaces it. Usage counters, the permission ruleset, and the session
 * assist recap are most of a record's size and none of its row, so they are
 * left out; the authoritative list brings them back.
 */
type PersistedSession = Omit<Session, "cost" | "tokens" | "permissions">

const metadataNamespaceSchema = z.record(z.string(), z.json())

function toPersistedSession(session: Session): PersistedSession {
  // Undefined fields are dropped when the record is serialized.
  const persisted = { ...session, cost: undefined, tokens: undefined, permissions: undefined }
  const metadata = session.metadata
  const namespace = metadata?.openchamber === undefined ? undefined : metadataNamespaceSchema.safeParse(metadata.openchamber).data
  if (!metadata || !namespace || !("assist" in namespace)) return persisted
  const openchamber = Object.fromEntries(Object.entries(namespace).filter(([key]) => key !== "assist"))
  return { ...persisted, metadata: { ...metadata, openchamber } }
}

/** Write a serialized value unless storage already holds exactly that value. */
function tryWriteSerialized(key: string, serialized: string, legacyKey?: string): boolean {
=======
type PersistedSession = Omit<Session, "cost" | "tokens" | "permissions">

const metadataNamespaceSchema = z.record(z.string(), z.json())

function toPersistedSession(session: Session): PersistedSession {
  const persisted = { ...session, cost: undefined, tokens: undefined, permissions: undefined }
  const metadata = session.metadata
  const namespace = metadata?.openchamber === undefined ? undefined : parseMetadata(metadataNamespaceSchema, metadata.openchamber).data
  if (!metadata || !namespace || !("assist" in namespace)) return persisted
  const openchamber = Object.fromEntries(Object.entries(namespace).filter(([key]) => key !== "assist"))
  return { ...persisted, metadata: { ...metadata, openchamber } }
}

function tryWriteSerialized(key: string, serialized: string, legacyKey?: string): boolean {
>>>>>>> upstream/main
  try {
    if (localStorage.getItem(key) === serialized) return true
    countSyncPersistenceStorageWrite()
    localStorage.setItem(key, serialized)
    return true
  } catch {
    return false
  }
}

function tryWriteCacheValue<T>(key: string, value: T): boolean {
  let serialized: string
  try { serialized = JSON.stringify(value) } catch { return false }
  countSyncPersistenceSerialization(serialized)
  return tryWriteSerialized(key, serialized)
}

function writeSessionCache(key: string, legacyKey: string, sessions: Session[]): void {
<<<<<<< HEAD
  const recent = selectRecentSessions(sessions, PERSISTED_SESSION_LIMIT)
  if (tryWriteCacheValue(key, recent)) {
    try { localStorage.removeItem(legacyKey) } catch { /* best effort */ }
||||||| bc50ba56aa
  const recentSessions = selectRecentSessions(sessions, PERSISTED_SESSION_LIMIT).map(toPersistedSession)
  if (tryWriteCacheValue(key, legacyKey, recentSessions)) return

  // Replacing a stale value can fail when unrelated localStorage data has
  // grown. Remove that value and retain as much recent history as still fits.
  try {
    localStorage.removeItem(key)
    localStorage.removeItem(legacyKey)
  } catch {
=======
  const recentSessions = selectRecentSessions(sessions, PERSISTED_SESSION_LIMIT).map(toPersistedSession)
  if (tryWriteCacheValue(key, legacyKey, recentSessions)) return

  try {
    localStorage.removeItem(key)
    localStorage.removeItem(legacyKey)
  } catch {
>>>>>>> upstream/main
    return
  }
  try { localStorage.removeItem(key); localStorage.removeItem(legacyKey) } catch { return }
  for (const limit of SESSION_CACHE_FALLBACK_LIMITS) {
    if (tryWriteCacheValue(key, selectRecentSessions(recent, limit))) return
  }
<<<<<<< HEAD
  tryWriteCacheValue(key, [])
||||||| bc50ba56aa

  // An empty v2 value is a tombstone: never resurrect stale legacy sessions.
  tryWriteCacheValue(key, legacyKey, [])
=======

  tryWriteCacheValue(key, legacyKey, [])
>>>>>>> upstream/main
}

export function flushPendingSessionWrites(): void {
  if (pendingSessionWriteTimer !== undefined) {
    clearTimeout(pendingSessionWriteTimer)
    pendingSessionWriteTimer = undefined
  }
  if (pendingSessionWrites.size === 0) return
  const writes = [...pendingSessionWrites.values()]
  pendingSessionWrites.clear()
  const runtimeKey = getRuntimeKey() || "local"
  for (const pending of writes) if (pending.runtimeKey === runtimeKey) pending.write()
}

function scheduleSessionWrite(pending: PendingSessionWrite): void {
  for (const [key, existing] of pendingSessionWrites) if (existing.runtimeKey !== pending.runtimeKey) pendingSessionWrites.delete(key)
  pendingSessionWrites.set(pending.key, pending)
  pendingSessionWriteTimer ??= setTimeout(flushPendingSessionWrites, SESSION_PERSIST_THROTTLE_MS)
}

function scheduleSessionCacheWrite(directory: string, sessions: Session[]): void {
  const runtimeKey = getRuntimeKey() || "local"
  const key = `${storagePrefixForRuntime(runtimeKey, directory)}.sessions`
  scheduleSessionWrite({ runtimeKey, key, sessions, write: () => writeSessionCache(key, legacyCacheKey(directory, "sessions"), sessions) })
}

function cancelPendingSessionWrites(runtimeKey: string): void {
  for (const [key, pending] of pendingSessionWrites) if (pending.runtimeKey === runtimeKey) pendingSessionWrites.delete(key)
  if (pendingSessionWrites.size === 0 && pendingSessionWriteTimer !== undefined) {
    clearTimeout(pendingSessionWriteTimer)
    pendingSessionWriteTimer = undefined
  }
}
subscribeRuntimeEndpointWillChange(({ previousRuntimeKey }) => cancelPendingSessionWrites(previousRuntimeKey))

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingSessionWrites, { capture: true })
  window.addEventListener("beforeunload", flushPendingSessionWrites, { capture: true })
  window.addEventListener("openchamber:flush-persisted-state", flushPendingSessionWrites)
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPendingSessionWrites() })
    document.addEventListener("freeze", flushPendingSessionWrites)
  }
}

<<<<<<< HEAD
export type PersistedDirCache = { vcs: unknown; projectMeta: ProjectMeta | undefined; icon: string | undefined; sessions: Session[] | undefined }
||||||| bc50ba56aa
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
=======
>>>>>>> upstream/main

<<<<<<< HEAD
function parseCachedSessions(records: readonly unknown[]): Session[] | undefined {
  const parsed: Session[] = []
  for (const record of records) {
    const result = SessionSchema.safeParse(record)
    if (!result.success) return undefined
    parsed.push(result.data)
  }
  return parsed
||||||| bc50ba56aa
export type PersistedDirCache = {
  vcs: Vcs | undefined
  projectMeta: ProjectMeta | undefined
  icon: string | undefined
  sessions: Session[] | undefined
}

/** Read all cached metadata for a directory */
/**
 * The fields the stores dereference before bootstrap replaces a cached list.
 * localStorage is shared by every OpenChamber build that ran on this origin,
 * so a record written by another version is data, not a `Session`: a record
 * missing any of these is dropped instead of crashing the first render.
 */
const cachedSessionSchema = z.looseObject({
  id: z.string().min(1),
  directory: z.string(),
  projectID: z.string(),
  title: z.string(),
  time: z.looseObject({ created: z.number(), updated: z.number(), archived: z.number().optional() }),
})

function parseCachedSessions(records: readonly unknown[]): Session[] {
  return records.flatMap((record) => {
    const parsed = cachedSessionSchema.safeParse(record)
    // SAFETY: the parsed record carries every field read before bootstrap and
    // keeps its remaining keys, which is all a stale-while-revalidate seed
    // needs. Persisted records omit usage and permissions (`PersistedSession`);
    // the authoritative list replaces every seeded record before they matter.
    return parsed.success ? [parsed.data as Session] : []
  })
=======
export type PersistedDirCache = {
  vcs: Vcs | undefined
  projectMeta: ProjectMeta | undefined
  icon: string | undefined
  sessions: Session[] | undefined
}

const cachedSessionSchema = z.looseObject({
  id: z.string().min(1),
  directory: z.string(),
  projectID: z.string(),
  title: z.string(),
  time: z.looseObject({ created: z.number(), updated: z.number(), archived: z.number().optional() }),
})

function parseCachedSessions(records: readonly unknown[]): Session[] {
  return records.flatMap((record) => {
    const parsed = cachedSessionSchema.safeParse(record)
    // SAFETY: the parsed record carries every field read before bootstrap and
    // keeps its remaining keys, which is all a stale-while-revalidate seed
    // needs. Persisted records omit usage and permissions (`PersistedSession`);
    // the authoritative list replaces every seeded record before they matter.
    return parsed.success ? [parsed.data as Session] : []
  })
>>>>>>> upstream/main
}

function readCachedSessions(directory: string): Session[] | undefined {
  const cached = readCache<unknown>(directory, "sessions")
  if (!Array.isArray(cached)) return undefined
  return parseCachedSessions(cached)
}

export function readDirCache(directory: string): PersistedDirCache {
  return {
    vcs: readCache<unknown>(directory, "vcs"),
    projectMeta: readCache<ProjectMeta>(directory, "projectMeta"),
    icon: readCache<string>(directory, "icon"),
    sessions: readCachedSessions(directory),
  }
}

export function persistSessions(directory: string, sessions: Session[] | undefined): void {
  const key = cacheKey(directory, "sessions")
  if (!sessions) {
    pendingSessionWrites.delete(key)
    writeCache(directory, "sessions", undefined)
    return
  }
  if (sessions.length === 0) {
    pendingSessionWrites.delete(key)
    writeSessionCache(key, legacyCacheKey(directory, "sessions"), sessions)
    return
  }
  scheduleSessionCacheWrite(directory, sessions)
}

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * Drops everything cached for a directory the host no longer has: its session
 * snapshot, a pending write of it included, and its metadata. The legacy keys go
 * with the current ones, so nothing of the directory comes back at the next start.
 */
export function forgetDirCache(directory: string): void {
  pendingSessionWrites.delete(cacheKey(directory, "sessions"))
  for (const key of ["vcs", "projectMeta", "icon", "sessions"] as const) writeCache(directory, key, undefined)
}

=======
export function forgetDirCache(directory: string): void {
  pendingSessionWrites.delete(cacheKey(directory, "sessions"))
  for (const key of ["vcs", "projectMeta", "icon", "sessions"] as const) writeCache(directory, key, undefined)
}

>>>>>>> upstream/main
export function readManagedChatSessions(expectedRuntimeKey = getRuntimeKey()): Session[] {
  if (expectedRuntimeKey !== getRuntimeKey()) return []
  return readDirCache(MANAGED_CHATS_CACHE_SCOPE).sessions ?? []
}
export function persistManagedChatSessions(sessions: Session[]): void { persistSessions(MANAGED_CHATS_CACHE_SCOPE, sessions) }

<<<<<<< HEAD
function globalSnapshotKey(runtimeKey: string): string { return `oc.global-sessions.v${GLOBAL_SNAPSHOT_VERSION}.${hashCode(runtimeKey)}` }
const globalSnapshotSchema = z.object({ version: z.literal(GLOBAL_SNAPSHOT_VERSION), runtimeKey: z.string(), sessions: z.array(z.unknown()) })
const isGlobalSnapshotSession = (session: Session): boolean => session.archivedAt === undefined
||||||| bc50ba56aa
export function persistManagedChatSessions(sessions: Session[]): void {
  if (isVSCodeRuntime()) return
  persistSessions(MANAGED_CHATS_CACHE_SCOPE, sessions.filter((session) => (
    isChatDirectoryPath(session.directory)
  )))
}

// ---------------------------------------------------------------------------
// Global active-session snapshot
// ---------------------------------------------------------------------------

function globalSnapshotKey(runtimeKey: string): string {
  return `oc.global-sessions.v${GLOBAL_SNAPSHOT_VERSION}.${hashCode(runtimeKey)}`
}

const globalSnapshotSchema = z.object({
  version: z.literal(GLOBAL_SNAPSHOT_VERSION),
  runtimeKey: z.string(),
  sessions: z.array(z.unknown()),
})

/**
 * Active sessions outside the managed chats root. Chats have their own
 * snapshot, which is classified against the server-resolved chats root.
 */
function isGlobalSnapshotSession(session: Session): boolean {
  return !session.time?.archived && !isChatDirectoryPath(session.directory)
}
=======
export function persistManagedChatSessions(sessions: Session[]): void {
  if (isVSCodeRuntime()) return
  persistSessions(MANAGED_CHATS_CACHE_SCOPE, sessions.filter((session) => (
    isChatDirectoryPath(session.directory)
  )))
}


function globalSnapshotKey(runtimeKey: string): string {
  return `oc.global-sessions.v${GLOBAL_SNAPSHOT_VERSION}.${hashCode(runtimeKey)}`
}

const globalSnapshotSchema = z.object({
  version: z.literal(GLOBAL_SNAPSHOT_VERSION),
  runtimeKey: z.string(),
  sessions: z.array(z.unknown()),
})

function isGlobalSnapshotSession(session: Session): boolean {
  return !session.time?.archived && !isChatDirectoryPath(session.directory)
}
>>>>>>> upstream/main

function writeGlobalSessionSnapshot(key: string, runtimeKey: string, sessions: Session[]): void {
  const eligible = sessions.filter(isGlobalSnapshotSession)
  let removedStale = false
  for (const limit of GLOBAL_SNAPSHOT_LIMITS) {
    const serialized = JSON.stringify({ version: GLOBAL_SNAPSHOT_VERSION, runtimeKey, sessions: selectRecentSessionsWithAncestors(eligible, limit) })
    countSyncPersistenceSerialization(serialized)
    if (serialized.length > GLOBAL_SNAPSHOT_MAX_CHARS) continue
    if (tryWriteSerialized(key, serialized)) return
    if (removedStale) continue
    removedStale = true
<<<<<<< HEAD
    try { localStorage.removeItem(key) } catch { return }
||||||| bc50ba56aa
    try {
      localStorage.removeItem(key)
    } catch {
      return
    }
  }
  // Nothing fits: no seed beats one describing an older list.
  try {
    localStorage.removeItem(key)
  } catch {
    // Unwritable storage keeps nothing new either way.
=======
    try {
      localStorage.removeItem(key)
    } catch {
      return
    }
  }
  try {
    localStorage.removeItem(key)
  } catch {
    // Unwritable storage keeps nothing new either way.
>>>>>>> upstream/main
  }
  try { localStorage.removeItem(key) } catch { /* best effort */ }
}

export function readGlobalSessionSnapshot(): Session[] {
  const runtimeKey = getRuntimeKey() || "local"
  const key = globalSnapshotKey(runtimeKey)
  const pending = pendingSessionWrites.get(key)
  if (pending) return selectRecentSessionsWithAncestors(pending.sessions.filter(isGlobalSnapshotSession), GLOBAL_SNAPSHOT_LIMITS[0])
  let raw: string | null
  try { raw = localStorage.getItem(key) } catch { return [] }
  if (!raw) return []
  let envelope: z.infer<typeof globalSnapshotSchema> | undefined
  try { envelope = globalSnapshotSchema.safeParse(JSON.parse(raw)).data } catch { envelope = undefined }
  if (!envelope || envelope.runtimeKey !== runtimeKey) {
    try { localStorage.removeItem(key) } catch { /* best effort */ }
    return []
  }
  const sessions = parseCachedSessions(envelope.sessions)
  if (!sessions) {
    try { localStorage.removeItem(key) } catch { /* best effort */ }
    return []
  }
  return sessions.filter(isGlobalSnapshotSession)
}

export function persistGlobalSessionSnapshot(sessions: Session[]): void {
  const runtimeKey = getRuntimeKey() || "local"
  const key = globalSnapshotKey(runtimeKey)
  scheduleSessionWrite({ runtimeKey, key, sessions, write: () => writeGlobalSessionSnapshot(key, runtimeKey, sessions) })
}
<<<<<<< HEAD
export function persistVcs(directory: string, vcs: unknown): void { writeCache(directory, "vcs", vcs) }
export function persistProjectMeta(directory: string, meta: ProjectMeta | undefined): void { writeCache(directory, "projectMeta", meta) }
export function persistIcon(directory: string, icon: string | undefined): void { writeCache(directory, "icon", icon) }
||||||| bc50ba56aa

/** Write vcs info to cache */
export function persistVcs(directory: string, vcs: Vcs | undefined): void {
  writeCache(directory, "vcs", vcs)
}

/** Write project metadata to cache */
export function persistProjectMeta(directory: string, meta: ProjectMeta | undefined): void {
  writeCache(directory, "projectMeta", meta)
}

/** Write icon to cache */
export function persistIcon(directory: string, icon: string | undefined): void {
  writeCache(directory, "icon", icon)
}
=======

export function persistVcs(directory: string, vcs: Vcs | undefined): void {
  writeCache(directory, "vcs", vcs)
}

export function persistProjectMeta(directory: string, meta: ProjectMeta | undefined): void {
  writeCache(directory, "projectMeta", meta)
}

export function persistIcon(directory: string, icon: string | undefined): void {
  writeCache(directory, "icon", icon)
}
>>>>>>> upstream/main
