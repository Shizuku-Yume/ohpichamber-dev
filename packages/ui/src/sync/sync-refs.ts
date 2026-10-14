/**
 * Sync refs — imperative access to sync state from non-React code.
 *
 * SyncProvider sets these refs on mount. Store actions (session-ui-store,
 * session-actions) use them to read child-store domain data without hooks.
 */

import type { Part } from "@openchamber/agent-contract"
import { getRuntimeKey } from "@/lib/runtime-switch"
import type { ChildStoreManager } from "./child-store"
import { getSessionMaterializationStatus, type SessionMaterializationStatus } from "./materialization"
import type { State } from "./types"

let _childStores: ChildStoreManager | null = null
let _directory: string = ""
let boundRuntimeKey = ""
const registeredSessionDirectories = new Map<string, string>()
const configListeners = new Set<(directory: string, config: State["config"]) => void>()
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

/** Remember explicit session routing before directory discovery catches up. */
export function registerSessionDirectory(sessionId: string, directory: string) {
  if (sessionId && directory) registeredSessionDirectories.set(sessionId, directory)
}

export function getSyncChildStores(): ChildStoreManager {
  if (!_childStores || boundRuntimeKey !== getRuntimeKey()) throw new Error("ChildStoreManager not initialized for this runtime — is SyncProvider mounted?")
  return _childStores
}

/** Read current directory's child store state. Returns undefined if not bootstrapped. */
export function getDirectoryState(directory?: string): State | undefined {
  const stores = _childStores
  if (!stores || boundRuntimeKey !== getRuntimeKey()) return undefined
  const dir = directory || _directory
  if (!dir) return undefined
  return stores.getState(dir)
}

/** Read resolved directory configuration, if bootstrapped. */
export function getSyncConfig(directory?: string): State["config"] | undefined {
  const config = getDirectoryState(directory)?.config
  return config && Object.keys(config).length > 0 ? config : undefined
}

export function subscribeToSyncConfigChanges(listener: (directory: string, config: State["config"]) => void): () => void {
  configListeners.add(listener)
  return () => {
    configListeners.delete(listener)
  }
}

export function emitSyncConfigChanged(directory: string, config: State["config"]): void {
  if (!directory) return
  for (const listener of configListeners) {
    listener(directory, config)
  }
}

/** Read sessions from current directory's child store */
export function getSyncSessions(directory?: string) {
  return getDirectoryState(directory)?.session ?? []
}

/** Read sessions across all initialized child stores */
export function getAllSyncSessions() {
  return Array.from(getAllSyncSessionMap().values())
}

/** Read the cached cross-directory session index, rebuilding only when a session slice changes. */
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

/** Native workspace ownership is registered by the directory loader and actions.
 * A child store is a directory-scoped owner; public records contain no Host path. */
export function getSyncSessionDirectory(sessionId: string): string | null {
  if (!sessionId || boundRuntimeKey !== getRuntimeKey()) return null
  getAllSyncSessionMap()
  return registeredSessionDirectories.get(sessionId) ?? cachedSessionDirectoryById.get(sessionId) ?? null
}

/** Read messages for a session from current directory's child store */
export function getSyncMessages(sessionId: string, directory?: string) {
  return getDirectoryState(directory)?.message[sessionId] ?? []
}

/** Read renderability of a session snapshot from current directory's child store */
export function getSyncSessionMaterializationStatus(sessionId: string, directory?: string): SessionMaterializationStatus {
  const state = getDirectoryState(directory)
  if (!state) return { hasMessages: false, renderable: false, missingPartMessageIDs: [] }
  return getSessionMaterializationStatus(state, sessionId)
}

/** Read parts for a message from current directory's child store */
export function getSyncParts(messageId: string, directory?: string): Part[] {
  const messages = getDirectoryState(directory)?.message
  if (!messages) return []
  for (const sessionMessages of Object.values(messages)) {
    const message = sessionMessages.find((item) => item.messageId === messageId)
    if (message) return message.parts
  }
  return []
}

/** Read session status from current directory's child store */
export function getSyncSessionStatus(sessionId: string, directory?: string) {
  return getDirectoryState(directory)?.session_status[sessionId]
}
