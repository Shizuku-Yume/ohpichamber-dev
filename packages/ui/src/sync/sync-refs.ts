
import type { Part } from "@openchamber/agent-contract"
import { getRuntimeKey } from "@/lib/runtime-switch"
import type { ChildStoreManager } from "./child-store"
import { getSessionMaterializationStatus, type SessionMaterializationStatus } from "./materialization"
import type { State } from "./types"

let _childStores: ChildStoreManager | null = null
let _directory: string = ""
let boundRuntimeKey = ""
const registeredSessionDirectories = new Map<string, string>()
let cachedSessionManager: ChildStoreManager | null = null
let cachedSessionSlices = new Map<string, State["session"]>()
let cachedSessionsById = new Map<string, State["session"][number]>()
let cachedSessionDirectoryById = new Map<string, string>()

export function setSyncRefs(
  childStores: ChildStoreManager,
  directory: string,
) {
  if (_childStores !== childStores) {
    registeredSessionDirectories.clear()
    cachedSessionManager = null
    cachedSessionSlices = new Map()
    cachedSessionsById = new Map()
    cachedSessionDirectoryById = new Map()
  }
  _childStores = childStores
  boundRuntimeKey = getRuntimeKey()
  _directory = directory
}

<<<<<<< HEAD
/** Remember explicit session routing before directory discovery catches up. */
export function registerSessionDirectory(sessionId: string, directory: string) {
  if (sessionId && directory) registeredSessionDirectories.set(sessionId, directory)
||||||| bc50ba56aa
/** Pre-register a session→directory mapping in the routing index.
 *  Called from session-actions when creating sessions so SSE events
 *  arriving before session.created can be routed correctly. */
export function registerSessionDirectory(sessionID: string, directory: string) {
  _registerSessionDirectory?.(sessionID, directory)
=======
export function registerSessionDirectory(sessionID: string, directory: string) {
  _registerSessionDirectory?.(sessionID, directory)
>>>>>>> upstream/main
}

export function getSyncChildStores(): ChildStoreManager {
  if (!_childStores || boundRuntimeKey !== getRuntimeKey()) throw new Error("ChildStoreManager not initialized for this runtime — is SyncProvider mounted?")
  return _childStores
}

export function getDirectoryState(directory?: string): State | undefined {
  const stores = _childStores
  if (!stores || boundRuntimeKey !== getRuntimeKey()) return undefined
  const dir = directory || _directory
  if (!dir) return undefined
  return stores.getState(dir)
}

<<<<<<< HEAD
/**
 * Re-read initialized directories' canonical environments after a settings
 * write moved a fact they all derive: the model catalog carries
 * `planRoleAvailable`, which reads `modelRoles.plan`, and the composer disables
 * Plan from that value.
 *
 * `modelRoles` is one record in the shared agent directory, so a write changes
 * `planRoleAvailable` for every workspace. The Settings page names its own
 * directory, which is not necessarily the one a composer reads — a session in
 * a managed-chat or another project's directory kept the pre-write catalog, and
 * Plan stayed disabled while every catalog the settings page could see said the
 * role existed. Invalidating the fact therefore means re-running the bootstrap
 * lane for every directory the client has initialized; the lane owns the read,
 * so this asks for a forced run instead of fetching catalogs beside it.
 */
export function refreshDirectoryCatalogs(): void {
  const stores = _childStores
  if (!stores || boundRuntimeKey !== getRuntimeKey()) return
  for (const directory of stores.children.keys()) {
    stores.requestBootstrap({ directory, priority: "selected", reason: "action-demand", force: true })
||||||| bc50ba56aa
/** Read resolved OpenCode config from a directory child store, if bootstrapped. */
export function getSyncConfig(directory?: string): Config | undefined {
  const config = getDirectoryState(directory)?.config
  return config && Object.keys(config).length > 0 ? config : undefined
}

export function subscribeToSyncConfigChanges(listener: (directory: string, config: Config) => void): () => void {
  configListeners.add(listener)
  return () => {
    configListeners.delete(listener)
=======
export function getSyncConfig(directory?: string): Config | undefined {
  const config = getDirectoryState(directory)?.config
  return config && Object.keys(config).length > 0 ? config : undefined
}

export function subscribeToSyncConfigChanges(listener: (directory: string, config: Config) => void): () => void {
  configListeners.add(listener)
  return () => {
    configListeners.delete(listener)
>>>>>>> upstream/main
  }
}


<<<<<<< HEAD
/** Read sessions from current directory's child store */
export function getSyncSessions(directory?: string): State["session"] {
||||||| bc50ba56aa
/** Read sessions from current directory's child store */
export function getSyncSessions(directory?: string) {
=======
export function getSyncSessions(directory?: string) {
>>>>>>> upstream/main
  return getDirectoryState(directory)?.session ?? []
}

<<<<<<< HEAD
/** Read sessions across all initialized child stores */
export function getAllSyncSessions(): State["session"] {
||||||| bc50ba56aa
/** Read sessions across all initialized child stores */
export function getAllSyncSessions() {
=======
export function getAllSyncSessions() {
>>>>>>> upstream/main
  return Array.from(getAllSyncSessionMap().values())
}

export function getAllSyncSessionMap(): ReadonlyMap<string, State["session"][number]> {
  const stores = _childStores
  if (!stores || boundRuntimeKey !== getRuntimeKey()) return new Map()

  let changed = cachedSessionManager !== stores || cachedSessionSlices.size !== stores.children.size
  for (const [directory, store] of stores.children) {
    if (cachedSessionSlices.get(directory) !== store.getState().session) {
      changed = true
      break
    }
  }
  if (!changed) return cachedSessionsById

  const nextSlices = new Map<string, State["session"]>()
  const nextSessionsById = new Map<string, State["session"][number]>()
  const nextDirectoriesById = new Map<string, string>()
  for (const [directory, store] of stores.children) {
    const sessions = store.getState().session
    nextSlices.set(directory, sessions)
    for (const session of sessions) {
      if (!session?.sessionId) continue
      nextSessionsById.set(session.sessionId, session)
      nextDirectoriesById.set(session.sessionId, directory)
    }
  }
  cachedSessionManager = stores
  cachedSessionSlices = nextSlices
  cachedSessionsById = nextSessionsById
  cachedSessionDirectoryById = nextDirectoriesById
  return cachedSessionsById
}

<<<<<<< HEAD
/** Native workspace ownership is registered by the directory loader and actions.
 * A child store is a directory-scoped owner; public records contain no Host path. */
||||||| bc50ba56aa
/**
 * Directory of a child store that holds this session.
 *
 * This reports containment, not ownership, and a session can be held by more
 * than one store: a project's session list includes the sessions of its
 * worktrees so the sidebar can group them, so the parent repository holds
 * worktree sessions too. Ownership comes from the session record's own
 * directory; this is the fallback for a record that carries none. Returns
 * `null` when no initialized child store contains the session, which means
 * "unknown", never "no directory".
 */
=======
>>>>>>> upstream/main
export function getSyncSessionDirectory(sessionId: string): string | null {
  if (!sessionId || boundRuntimeKey !== getRuntimeKey()) return null
  getAllSyncSessionMap()
  return registeredSessionDirectories.get(sessionId) ?? cachedSessionDirectoryById.get(sessionId) ?? null
}

<<<<<<< HEAD
/** Read messages for a session from current directory's child store */
export function getSyncMessages(sessionId: string, directory?: string): State["message"][string] {
||||||| bc50ba56aa
/** Read messages for a session from current directory's child store */
export function getSyncMessages(sessionId: string, directory?: string) {
=======
export function getSyncMessages(sessionId: string, directory?: string) {
>>>>>>> upstream/main
  return getDirectoryState(directory)?.message[sessionId] ?? []
}

<<<<<<< HEAD
/** Read renderability of a session snapshot from current directory's child store */
export function getSyncSessionMaterializationStatus(sessionId: string, directory?: string): SessionMaterializationStatus {
||||||| bc50ba56aa
/** Read renderability of a session snapshot from current directory's child store */
export function getSyncSessionMaterializationStatus(sessionId: string, directory?: string) {
=======
export function getSyncSessionMaterializationStatus(sessionId: string, directory?: string) {
>>>>>>> upstream/main
  const state = getDirectoryState(directory)
  if (!state) return { hasMessages: false, renderable: false, missingPartMessageIDs: [] }
  return getSessionMaterializationStatus(state, sessionId)
}

<<<<<<< HEAD
/** Read parts for a message from current directory's child store */
export function getSyncParts(messageId: string, directory?: string): Part[] {
  const messages = getDirectoryState(directory)?.message
  if (!messages) return []
  for (const sessionMessages of Object.values(messages)) {
    const message = sessionMessages.find((item) => item.messageId === messageId)
    if (message) return message.parts
  }
  return []
||||||| bc50ba56aa
/** Read parts for a message from current directory's child store */
export function getSyncParts(messageId: string, directory?: string) {
  return getDirectoryState(directory)?.part[messageId] ?? []
}

/** Read session status from current directory's child store */
export function getSyncSessionStatus(sessionId: string, directory?: string) {
  return getDirectoryState(directory)?.session_status[sessionId]
=======
export function getSyncParts(messageId: string, directory?: string) {
  return getDirectoryState(directory)?.part[messageId] ?? []
}

export function getSyncSessionStatus(sessionId: string, directory?: string) {
  return getDirectoryState(directory)?.session_status[sessionId]
>>>>>>> upstream/main
}
