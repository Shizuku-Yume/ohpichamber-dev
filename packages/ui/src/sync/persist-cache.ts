import { SessionSchema, type Session } from "@openchamber/agent-contract"
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

type CacheKey = "vcs" | "projectMeta" | "icon" | "sessions"

function hashCode(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash) + value.charCodeAt(index) | 0
  return Math.abs(hash).toString(36)
}

function storagePrefixForRuntime(runtimeKey: string, directory: string): string {
  const head = directory.slice(0, 12).replace(/[^a-zA-Z0-9]/g, "_")
  return `oc.dir.v2.${head}.${hashCode(`${runtimeKey}\0${directory}`)}`
}

function storagePrefix(directory: string): string {
  return storagePrefixForRuntime(getRuntimeKey() || "local", directory)
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

type RecencyRecord = Pick<Session, "sessionId" | "parentSessionId" | "createdAt" | "updatedAt">
function sessionRecencyTimestamp(session: RecencyRecord): number { return session.updatedAt }
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

function tryWriteSerialized(key: string, serialized: string): boolean {
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
  const recent = selectRecentSessions(sessions, PERSISTED_SESSION_LIMIT)
  if (tryWriteCacheValue(key, recent)) {
    try { localStorage.removeItem(legacyKey) } catch { /* best effort */ }
    return
  }
  try { localStorage.removeItem(key); localStorage.removeItem(legacyKey) } catch { return }
  for (const limit of SESSION_CACHE_FALLBACK_LIMITS) {
    if (tryWriteCacheValue(key, selectRecentSessions(recent, limit))) return
  }
  tryWriteCacheValue(key, [])
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

export type PersistedDirCache = { vcs: unknown; projectMeta: ProjectMeta | undefined; icon: string | undefined; sessions: Session[] | undefined }

function parseCachedSessions(records: readonly unknown[]): Session[] | undefined {
  const parsed: Session[] = []
  for (const record of records) {
    const result = SessionSchema.safeParse(record)
    if (!result.success) return undefined
    parsed.push(result.data)
  }
  return parsed
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

export function readManagedChatSessions(expectedRuntimeKey = getRuntimeKey()): Session[] {
  if (expectedRuntimeKey !== getRuntimeKey()) return []
  return readDirCache(MANAGED_CHATS_CACHE_SCOPE).sessions ?? []
}
export function persistManagedChatSessions(sessions: Session[]): void { persistSessions(MANAGED_CHATS_CACHE_SCOPE, sessions) }

function globalSnapshotKey(runtimeKey: string): string { return `oc.global-sessions.v${GLOBAL_SNAPSHOT_VERSION}.${hashCode(runtimeKey)}` }
const globalSnapshotSchema = z.object({ version: z.literal(GLOBAL_SNAPSHOT_VERSION), runtimeKey: z.string(), sessions: z.array(z.unknown()) })
const isGlobalSnapshotSession = (session: Session): boolean => session.archivedAt === undefined

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
    try { localStorage.removeItem(key) } catch { return }
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
export function persistVcs(directory: string, vcs: unknown): void { writeCache(directory, "vcs", vcs) }
export function persistProjectMeta(directory: string, meta: ProjectMeta | undefined): void { writeCache(directory, "projectMeta", meta) }
export function persistIcon(directory: string, icon: string | undefined): void { writeCache(directory, "icon", icon) }
