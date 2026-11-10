import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import type { Session } from "@openchamber/agent-contract"
import { canonicalClient } from "@/api/canonicalClient"
import type { ProjectEntry } from "@/lib/api/types"
import { resolveProjectForSessionDirectory } from "@/lib/projectResolution"
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from "@/lib/runtime-switch"
import { resetWorkspaceDirectories } from "@/stores/globalSessions"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useSessionUIStore } from "../session-ui-store"
import { ChildStoreManager } from "../child-store"
import { createSession, setActionRefs } from "../session-actions"
import type { WorktreeMetadata } from "@/types/worktree"

const PROJECT = "/projects/alpha"
const workspace = (directory: string) => ({
  workspaceId: `workspace-${directory.replace(/[^a-z0-9]+/gi, "-")}`,
  projectId: "project-1",
  name: "Workspace",
})

const session = (sessionId: string, workspaceId: string): Session => ({
  sessionId,
  projectId: "project-1",
  workspaceId,
  displayPath: ".",
  rootSessionId: sessionId,
  createdAt: 1,
  updatedAt: 1,
  epoch: "epoch-1",
  headSequence: "0",
  runtimeStatus: "idle",
  activeRunId: null,
  mode: { kind: "main" },
  metadata: null,
  metadataRevision: "0",
  archiveRevision: "0",
})

<<<<<<< HEAD
const originalRuntime = getRuntimeKey()
const originalBase = getRuntimeApiBaseUrl()
let manager: ChildStoreManager
let currentDirectory: string | null
const selected: Array<{ id: string | null; directory: string | null | undefined }> = []
const resolvedDirectories: string[] = []
=======
// Configurable current directory (used as fallback when no directoryOverride is set)
let currentDirectory: string | null = null
// Stands in for the runtime's raw client; createSession only compares identity.
const runtimeSdkClient = {}

let idCounter = 0
mock.module("@/lib/opencode/client", () => ({
  isOpencodeNotFound: () => false,
  ascendingId: (prefix: string) => `${prefix}_${(idCounter += 1).toString(16).padStart(12, "0")}`,
  opencodeClient: {
    getSdkClient: () => runtimeSdkClient,
    captureSessionCleanup: async () => async () => undefined,
    getDirectory: () => currentDirectory,
    setDirectory: mock(() => undefined),
    createSession: mock(async (params: unknown, directory?: string | null) => {
      nextCreateSessionCalls.push({ params, directory })
      return nextCreateSessionResponse
    }),
  },
}))

mock.module("../session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({
      setCurrentSession: (id: string | null, directoryHint?: string | null) => {
        setCurrentSessionCalls.push({ id, directoryHint })
      },
      markSessionAsOpenChamberCreated: (sessionId: string) => {
        markSessionAsOpenChamberCreatedCalls.push(sessionId)
      },
    }),
  },
}))

mock.module("../sync-refs", () => ({
  getDirectoryState: () => null,
  getAllSyncSessions: () => [],
  getSyncSessionDirectory: () => null,
  registerSessionDirectory: (sessionID: string, directory: string) => {
    registerSessionDirectoryCalls.push({ sessionID, directory })
  },
}))

mock.module("@/stores/useGlobalSessionsStore", () => ({
  useGlobalSessionsStore: {
    getState: () => ({
      upsertSession: (session: Session) => {
        upsertSessionCalls.push(session)
      },
    }),
  },
  mergeSessionDirectoryMetadata: (incoming: Session) => incoming,
  resolveGlobalSessionDirectory: () => null,
}))

mock.module("@/stores/useConfigStore", () => ({
  useConfigStore: {
    getState: () => ({
      isConnected: true,
      hasEverConnected: true,
    }),
  },
  selectCatalogLoadedForDirectory: () => false,
  selectConfigAgentsForDirectory: () => [],
}))

mock.module("../input-store", () => ({
  useInputStore: {
    getState: () => ({
      clearAttachedFiles: () => undefined,
      addRestoredAttachment: () => undefined,
    }),
  },
}))

const { createSession, setActionRefs } = await import("../session-actions")
>>>>>>> bc50ba56a

beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: "https://issue-1637.test", runtimeKey: "issue-1637" })
  resetWorkspaceDirectories()
  useGlobalSessionsStore.setState({ activeSessions: [], archivedSessions: [], entityById: new Map(), hasLoaded: true })
  manager = new ChildStoreManager()
  currentDirectory = null
  selected.length = 0
  resolvedDirectories.length = 0
  setActionRefs(manager, () => currentDirectory ?? "")

  spyOn(canonicalClient, "resolveWorkspace").mockImplementation(async (directory) => {
    resolvedDirectories.push(directory)
    return workspace(directory)
  })
  spyOn(canonicalClient, "createSession").mockImplementation(async (request) => ({
    session: session(`session-${resolvedDirectories.length}`, request.workspaceId),
  }))
  spyOn(useSessionUIStore.getState(), "setCurrentSession").mockImplementation((id, directory) => {
    selected.push({ id, directory })
  })
})

afterEach(() => {
  manager.disposeAll()
  mock.restore()
  resetWorkspaceDirectories()
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime })
})

describe("issue #1637 — native session admission keeps the effective directory", () => {
  test("directoryOverride is resolved and used for selection when the caller provides it", async () => {
    const result = await createSession("test title", PROJECT)

    expect(result?.sessionId).toBe("session-1")
    expect(resolvedDirectories).toEqual([PROJECT])
    expect(canonicalClient.createSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      workspaceId: "workspace--projects-alpha",
      options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
      title: "test title", metadata: {},
    }))
    expect(selected).toEqual([{ id: "session-1", directory: PROJECT }])
    expect(useGlobalSessionsStore.getState().entityById.get("session-1")?.workspaceId).toBe("workspace--projects-alpha")
  })

  test("the active directory is used when no override is provided", async () => {
    currentDirectory = "/projects/current"
    const result = await createSession("test title")

    expect(result?.sessionId).toBe("session-1")
    expect(resolvedDirectories).toEqual([currentDirectory])
    expect(selected).toEqual([{ id: "session-1", directory: currentDirectory }])
  })

  test("creation without an admitted directory is rejected without issuing a native request", async () => {
    expect(await createSession("test title", null)).toBeNull()
    expect(canonicalClient.resolveWorkspace).not.toHaveBeenCalled()
    expect(canonicalClient.createSession).not.toHaveBeenCalled()
    expect(selected).toEqual([])
  })
})

describe("issue #2270 — nested Git projects", () => {
  test("resolves a nested child repository directly instead of through a sibling project's ancestor worktree", () => {
    const projects = [
      { id: "project-a", path: "/workspace/project-a" },
      { id: "project-b", path: "/workspace/project-b" },
      { id: "project-c", path: "/workspace/project-c" },
    ] as ProjectEntry[]
    const leakedParentWorktree = {
      path: "/workspace",
      projectDirectory: "/workspace",
    } as WorktreeMetadata
    const availableWorktreesByProject = new Map<string, WorktreeMetadata[]>([
      ["/workspace/project-a", [leakedParentWorktree]],
    ])

    const resolved = resolveProjectForSessionDirectory(
      projects,
      availableWorktreesByProject,
      "/workspace/project-b/src",
    )

    expect(resolved?.id).toBe("project-b")
  })

  test("still resolves an external worktree through its owning project", () => {
    const projects = [
      { id: "project-a", path: "/workspace/project-a" },
      { id: "project-b", path: "/workspace/project-b" },
    ] as ProjectEntry[]
    const externalWorktree = {
      path: "/worktrees/project-b-feature",
      projectDirectory: "/workspace/project-b",
    } as WorktreeMetadata
    const availableWorktreesByProject = new Map<string, WorktreeMetadata[]>([
      ["/workspace/project-b", [externalWorktree]],
    ])

    const resolved = resolveProjectForSessionDirectory(
      projects,
      availableWorktreesByProject,
      "/worktrees/project-b-feature/src",
    )

    expect(resolved?.id).toBe("project-b")
  })
})
