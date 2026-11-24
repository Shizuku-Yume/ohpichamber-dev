
import type { Part, Subagent } from "@openchamber/agent-contract"
import { getRuntimeKey } from "@/lib/runtime-switch"
import type { ChildStoreManager } from "./child-store"
import { getSessionMaterializationStatus, type SessionMaterializationStatus } from "./materialization"
import type { State } from "./types"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useSubagentsStore } from "@/stores/useSubagentsStore"

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

/** Remember explicit session routing before directory discovery catches up. */
export function registerSessionDirectory(sessionId: string, directory: string) {
  if (sessionId && directory) registeredSessionDirectories.set(sessionId, directory)
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
  }
}


/** Read sessions from current directory's child store */
export function getSyncSessions(directory?: string): State["session"] {
  return getDirectoryState(directory)?.session ?? []
}

/** Read sessions across all initialized child stores */
export function getAllSyncSessions(): State["session"] {
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

export function getSyncSessionDirectory(sessionId: string): string | null {
  if (!sessionId || boundRuntimeKey !== getRuntimeKey()) return null
  getAllSyncSessionMap()
  return registeredSessionDirectories.get(sessionId) ?? cachedSessionDirectoryById.get(sessionId) ?? null
}

/** Read messages for a session from current directory's child store */
export function getSyncMessages(sessionId: string, directory?: string): State["message"][string] {
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

export function syncSubagentUpdate(parentSessionId: string, subagent: Subagent): void {
  useSubagentsStore.getState().applySubagentUpdate(parentSessionId, subagent)
  if (!subagent.childSessionId || subagent.childSessionId === subagent.subagentId) return
  const global = useGlobalSessionsStore.getState()
  const parent = getAllSyncSessionMap().get(parentSessionId) ?? global.entityById.get(parentSessionId)
  if (parent) global.upsertSubagents(parent, [subagent])
}
