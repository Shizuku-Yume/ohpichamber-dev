import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { Session } from "@openchamber/agent-contract"

import { ChildStoreManager } from "./child-store"
import { setSyncRefs } from "./sync-refs"
import { useSessionUIStore } from "./session-ui-store"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from "@/stores/globalSessions"

/**
 * Selecting a session whose directory this client has not indexed yet routes it
 * through the active directory as a deliberate guess. Nothing used to settle
 * that guess once the owning directory finished bootstrapping, so every fetch
 * stayed addressed to a directory that does not own the session and the session
 * never rendered.
 *
 * These tests pin both directions: a guess is promoted once the authoritative
 * directory becomes readable, and a confirmed selection is never rewritten.
 */

const PARENT = "/repo"
const WORKTREE = "/repo/.worktrees/feature"
const SESSION_ID = "ses_directory_adoption"

const session = (sessionId: string, workspaceId: string): Session => ({
  sessionId,
  rootSessionId: sessionId,
  projectId: "project-adoption",
  workspaceId,
  displayPath: "repo/worktrees/feature",
  createdAt: 1,
  updatedAt: 1,
  epoch: "epoch-adoption",
  headSequence: "0",
  runtimeStatus: "idle",
  activeRunId: null,
  mode: { kind: "main" },
  title: "Worktree session", metadata: {},
  metadataRevision: "1",
  archiveRevision: "0",
})

const indexSessionIn = (
  manager: ChildStoreManager,
  directory: string,
  recordDirectory: string = directory,
): void => {
  const store = manager.ensureChild(directory, { bootstrap: false })
  const workspaceId = `workspace-adoption:${recordDirectory}`
  registerWorkspaceDirectory(workspaceId, recordDirectory)
  store.setState({
    session: [session(SESSION_ID, workspaceId)],
  })
}

let manager: ChildStoreManager

beforeEach(() => {
  manager = new ChildStoreManager()
  resetWorkspaceDirectories()
  setSyncRefs(manager, PARENT)
  useSessionUIStore.getState().setCurrentSession(null)
})

afterEach(() => {
  useSessionUIStore.getState().setCurrentSession(null)
  manager.disposeAll()
  resetWorkspaceDirectories()
})

describe("adoptAuthoritativeSessionDirectory", () => {
  test("opens a globally indexed Windows worktree session before its child store bootstraps", () => {
    const sessionId = "ses_windows_global_directory"
    const workspaceId = "workspace-windows-adoption"
    registerWorkspaceDirectory(workspaceId, "c:\\repo\\.worktrees\\feature")
    useGlobalSessionsStore.getState().upsertSession(session(sessionId, workspaceId))
    try {
      useSessionUIStore.getState().setCurrentSession(sessionId)

      expect(useSessionUIStore.getState().currentSessionDirectory).toBe("C:/repo/.worktrees/feature")
      expect(useSessionUIStore.getState().getDirectoryForSession(sessionId)).toBe("C:/repo/.worktrees/feature")
    } finally {
      useGlobalSessionsStore.getState().removeSessions([sessionId])
    }
  })

  test("promotes a guessed selection once the owning directory is indexed", () => {
    useSessionUIStore.getState().setCurrentSession(SESSION_ID)
    expect(useSessionUIStore.getState().currentSessionDirectory).not.toBe(WORKTREE)

    indexSessionIn(manager, WORKTREE)
    useSessionUIStore.getState().adoptAuthoritativeSessionDirectory()

    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(WORKTREE)
  })

  test("believes admitted workspace ownership over the store that merely holds the session", () => {
    // Public sessions carry workspace identity, not a Host filesystem path.
    // A parent list may hold a worktree session without becoming its owner.
    useSessionUIStore.getState().setCurrentSession(SESSION_ID)
    indexSessionIn(manager, PARENT, WORKTREE)

    useSessionUIStore.getState().adoptAuthoritativeSessionDirectory()

    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(WORKTREE)
  })

  test("does nothing while the owning directory is still unknown", () => {
    useSessionUIStore.getState().setCurrentSession(SESSION_ID)
    const before = useSessionUIStore.getState().currentSessionDirectory

    useSessionUIStore.getState().adoptAuthoritativeSessionDirectory()

    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(before)
  })

  test("never rewrites a selection that was confirmed at selection time", () => {
    useSessionUIStore.getState().setCurrentSession(SESSION_ID, WORKTREE)
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(WORKTREE)

    // A different directory claiming the session must not move a confirmed
    // selection: the confirmed value outranks anything sync learns later.
    indexSessionIn(manager, PARENT)
    useSessionUIStore.getState().adoptAuthoritativeSessionDirectory()

    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(WORKTREE)
  })

  test("is a no-op for a session that is no longer selected", () => {
    useSessionUIStore.getState().setCurrentSession(SESSION_ID)
    indexSessionIn(manager, WORKTREE)
    useSessionUIStore.getState().setCurrentSession("ses_other")

    // Whatever the new selection resolved to, a late adoption for the previous
    // session must not touch it.
    const before = useSessionUIStore.getState().currentSessionDirectory
    useSessionUIStore.getState().adoptAuthoritativeSessionDirectory(SESSION_ID)

    expect(useSessionUIStore.getState().currentSessionId).toBe("ses_other")
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(before)
  })
})
