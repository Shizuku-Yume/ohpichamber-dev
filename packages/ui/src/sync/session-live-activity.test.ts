<<<<<<< HEAD
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { Session } from "@openchamber/agent-contract"
import { ChildStoreManager } from "./child-store"
import { getSessionLiveActivity, setActionRefs } from "./session-actions"
import { setSyncRefs } from "./sync-refs"
import { useSessionUIStore } from "./session-ui-store"
=======
import { describe, expect, spyOn, test } from "bun:test"
import type { Session } from "@/lib/opencode/model"
import { opencodeClient } from "@/lib/opencode/client"
import { ChildStoreManager } from "./child-store"
import { getSessionLiveActivity, readSessionsLiveActivity, setActionRefs } from "./session-actions"
>>>>>>> bc50ba56a
import { useGlobalSessionsStore } from "../stores/useGlobalSessionsStore"
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from "../stores/globalSessions"
import { applyGlobalSessionStatusSnapshot, replaceGlobalSessionStatusById } from "./global-session-status"
import { nativeSnapshot } from "./session-message-loader-test-fixtures"

const session: Session = {
  ...nativeSnapshot("activity-session", []).session,
  title: "Activity", metadata: {}, metadataRevision: "0", archiveRevision: "0",
}
let manager: ChildStoreManager

beforeEach(() => {
  manager = new ChildStoreManager()
  setActionRefs(manager, () => "/repo")
  setSyncRefs(manager, "/repo")
  resetWorkspaceDirectories()
  registerWorkspaceDirectory(session.workspaceId, "/tree")
  replaceGlobalSessionStatusById(new Map())
  useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null, worktreeMetadata: new Map() })
  useGlobalSessionsStore.getState().applySnapshot([session], [])
})
afterEach(() => {
  manager.disposeAll()
  useGlobalSessionsStore.getState().resetForRuntimeSwitch()
  resetWorkspaceDirectories()
  replaceGlobalSessionStatusById(new Map())
})

describe("session live activity authority", () => {
  test("discovery alone cannot prove idle; a live status or successful scoped snapshot can", () => {
    const store = manager.ensureChild("/tree", { bootstrap: false })
    store.setState({ session: [session], sessionListSource: "authoritative" })
    expect(getSessionLiveActivity(session.sessionId)).toBe("unknown")
    store.setState({ session_status: { [session.sessionId]: "idle" } })
    expect(getSessionLiveActivity(session.sessionId)).toBe("idle")
    for (const status of ["running", "awaiting_approval", "awaiting_input"] as const) {
      store.setState({ session_status: { [session.sessionId]: status } })
      expect(getSessionLiveActivity(session.sessionId)).toBe("active")
    }
    store.setState({ session_status: {}, sessionStatusReady: true })
    expect(getSessionLiveActivity(session.sessionId)).toBe("idle")
  })

  test("a parent repository's initialized scope cannot prove an unknown worktree idle", () => {
    const parent = manager.ensureChild("/repo", { bootstrap: false })
    const worktree = manager.ensureChild("/tree", { bootstrap: false })
    parent.setState({ sessionStatusReady: true })
    worktree.setState({ session: [session], sessionListSource: "authoritative" })
    expect(getSessionLiveActivity(session.sessionId)).toBe("unknown")
    worktree.setState({ sessionStatusReady: true })
    expect(getSessionLiveActivity(session.sessionId)).toBe("idle")
  })

  test("invalidated and unavailable live scope is unknown, not successful idle", () => {
    const store = manager.ensureChild("/tree", { bootstrap: false })
    store.setState({ session: [session], sessionStatusReady: true, sessionStatusInvalidated: { [session.sessionId]: true } })
    expect(getSessionLiveActivity(session.sessionId)).toBe("unknown")
    store.setState({ session_status: { [session.sessionId]: "unavailable" }, sessionStatusInvalidated: {} })
    expect(getSessionLiveActivity(session.sessionId)).toBe("unknown")
    store.setState({ session_status: { [session.sessionId]: "idle" } })
    expect(getSessionLiveActivity(session.sessionId)).toBe("idle")
  })

  test("an active global observation remains active without a materialized child store", () => {
    applyGlobalSessionStatusSnapshot("/tree", { [session.sessionId]: "running" }, [session.sessionId], { [session.sessionId]: "run-a" })
    expect(getSessionLiveActivity(session.sessionId)).toBe("active")
    applyGlobalSessionStatusSnapshot("/tree", { [session.sessionId]: "unavailable" }, [session.sessionId])
    expect(getSessionLiveActivity(session.sessionId)).toBe("unknown")
  })
})

describe("readSessionsLiveActivity", () => {
  const readWith = async (
    snapshot: Awaited<ReturnType<typeof opencodeClient.getActiveSessionStatuses>>,
    prepare?: (store: ReturnType<ChildStoreManager["ensureChild"]>) => void,
  ) => {
    const manager = new ChildStoreManager()
    const store = manager.ensureChild("/tree", { bootstrap: false })
    setActionRefs(manager, () => "/tree")
    useGlobalSessionsStore.getState().applySnapshot([session], [])
    prepare?.(store)
    const read = spyOn(opencodeClient, "getActiveSessionStatuses").mockImplementation(async () => snapshot)
    try {
      return { activity: await readSessionsLiveActivity([session.id], "/tree"), askedDirectories: read.mock.calls.map(([directory]) => directory) }
    } finally {
      read.mockRestore()
      manager.disposeAll()
      useGlobalSessionsStore.getState().resetForRuntimeSwitch()
      replaceGlobalSessionStatusById(new Map())
    }
  }

  test("a successful read settles a session no store has a status for", async () => {
    expect(await readWith({})).toEqual({ activity: "idle", askedDirectories: ["/tree"] })
    expect(await readWith({ [session.id]: { type: "busy" } })).toEqual({ activity: "active", askedDirectories: ["/tree"] })
  })

  test("a failed read stays unknown", async () => {
    expect(await readWith(null)).toEqual({ activity: "unknown", askedDirectories: ["/tree"] })
  })

  test("stores that already answer need no read", async () => {
    expect(await readWith(null, (store) => store.setState({ session_status: { [session.id]: { type: "idle" } } })))
      .toEqual({ activity: "idle", askedDirectories: [] })
    expect(await readWith(null, (store) => store.setState({ session_status: { [session.id]: { type: "busy" } } })))
      .toEqual({ activity: "active", askedDirectories: [] })
  })
})
