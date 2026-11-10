import { afterEach, beforeEach, describe, expect, test } from "bun:test"
<<<<<<< HEAD
import type { Session } from "@openchamber/agent-contract"
=======
>>>>>>> bc50ba56a

import { ChildStoreManager } from "./child-store"
import { setSyncRefs } from "./sync-refs"
import { useSessionUIStore } from "./session-ui-store"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
<<<<<<< HEAD
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from "@/stores/globalSessions"
=======
import { useProjectsStore } from "@/stores/useProjectsStore"
import { opencodeClient } from "@/lib/opencode/client"
import type { Session } from "@/lib/opencode/model"
>>>>>>> bc50ba56a

/**
 * Unknown selections wait for session detail before publishing a directory.
 * Known registered projects still open synchronously, and a late resolution
 * cannot overwrite a confirmed selection or a newer navigation.
 */

const PARENT = "/repo"
const WORKTREE = "/repo/.worktrees/feature"
let SESSION_ID = "ses_directory_adoption"
let run = 0

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
const originalGetSession = opencodeClient.getSession
const originalProjects = useProjectsStore.getState().projects
let resolveDetail: (session: Session) => void
const record = (directory: string): Session => ({
  id: SESSION_ID, directory, projectID: "repo", title: "test", cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
})
const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve() }

beforeEach(() => {
  SESSION_ID = `ses_directory_adoption_${++run}`
  manager = new ChildStoreManager()
  resetWorkspaceDirectories()
  setSyncRefs(manager, PARENT)
  useSessionUIStore.getState().setCurrentSession(null)
  useProjectsStore.setState({ projects: [{ id: "repo", path: PARENT }, { id: "windows", path: "C:/repo" }] })
  const detail = new Promise<Session>((resolve) => { resolveDetail = resolve })
  opencodeClient.getSession = () => detail
})
afterEach(async () => {
  useSessionUIStore.getState().setCurrentSession(null)
  resolveDetail(record(WORKTREE))
  await settle()
  opencodeClient.getSession = originalGetSession
  useProjectsStore.setState({ projects: originalProjects })
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

  test("waits for authoritative session detail before opening an unknown selection", async () => {
    useSessionUIStore.getState().setCurrentSession(SESSION_ID)
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()

    indexSessionIn(manager, WORKTREE)
    useSessionUIStore.getState().adoptAuthoritativeSessionDirectory()
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
    resolveDetail(record(WORKTREE))
    await settle()

    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(WORKTREE)
  })

<<<<<<< HEAD
  test("believes admitted workspace ownership over the store that merely holds the session", () => {
    // Public sessions carry workspace identity, not a Host filesystem path.
    // A parent list may hold a worktree session without becoming its owner.
    useSessionUIStore.getState().setCurrentSession(SESSION_ID)
=======
  test("believes the session record over the store that merely holds it", () => {
    // A project's session list includes the sessions of its worktrees so the
    // sidebar can group them, so the parent store holds this session while the
    // session itself reports the worktree. Ownership comes from the record.
>>>>>>> bc50ba56a
    indexSessionIn(manager, PARENT, WORKTREE)
    useSessionUIStore.getState().setCurrentSession(SESSION_ID)

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

  test("a late resolution is a no-op for a session that is no longer selected", async () => {
    useSessionUIStore.getState().setCurrentSession(SESSION_ID)
    indexSessionIn(manager, WORKTREE)
    useSessionUIStore.getState().setCurrentSession("ses_other", PARENT)

    // Whatever the new selection resolved to, a late adoption for the previous
    // session must not touch it.
    const before = useSessionUIStore.getState().currentSessionDirectory
    useSessionUIStore.getState().adoptAuthoritativeSessionDirectory(SESSION_ID)
    resolveDetail(record(WORKTREE))
    await settle()

    expect(useSessionUIStore.getState().currentSessionId).toBe("ses_other")
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(before)
  })
})
