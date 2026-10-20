import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { Session, SessionSnapshot } from "@openchamber/agent-contract"
import { getRuntimeKey } from "@/lib/runtime-switch"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { ChildStoreManager } from "./child-store"
import { installRuntimeRun } from "./event-reducer"
import { SessionMessageLoader } from "./session-message-loader"
import { deferred, nativeClient, nativeSnapshot } from "./session-message-loader-test-fixtures"
import { clearDirectorySessionPrefetch } from "./session-prefetch-cache"

// Companion to the committed run-control-snapshot-race regression: those cases
// prove the in-flight exception, these prove it stays narrow. Each case owns a
// runtime-scoped identity so load coverage module state cannot leak between.
let sequence = 0
let directory = ""
let sessionId = ""
let idle: SessionSnapshot
let host: Session
let manager: ChildStoreManager
let loader: SessionMessageLoader | null = null

beforeEach(() => {
  sequence += 1
  directory = `/run-control-authority-${sequence}`
  sessionId = `run-control-authority-session-${sequence}`
  idle = nativeSnapshot(sessionId, [])
  host = { ...idle.session, metadata: null, metadataRevision: "0", archiveRevision: "0" }
  manager = new ChildStoreManager()
  useGlobalSessionsStore.getState().applySnapshot([], [])
})

afterEach(() => {
  loader?.dispose()
  loader = null
  manager.disposeAll()
  clearDirectorySessionPrefetch(directory)
  useGlobalSessionsStore.getState().resetForRuntimeSwitch()
})

const createStore = () => {
  const store = manager.ensureChild(directory, { bootstrap: false })
  store.setState({
    workspace: { workspaceId: "workspace-a", projectId: "project-a", name: "Workspace" },
    session: [host],
    snapshot: { [sessionId]: idle },
    session_status: { [sessionId]: "idle" },
    sessionStatusReady: true,
  })
  return store
}

describe("run control snapshot authority outside the in-flight window", () => {
  test("a same-epoch snapshot stays authoritative when no acknowledgement arrived after the read began", async () => {
    const store = createStore()
    store.setState((state) => installRuntimeRun(state, { runId: "run-a", sessionId, status: "running", createdAt: 5 }))
    const response = deferred<SessionSnapshot>()
    const requested = deferred<void>()
    const client = nativeClient({ getSnapshot: () => { requested.resolve(); return response.promise } })
    loader = new SessionMessageLoader(manager, { client, runtimeKey: getRuntimeKey() })

    const pending = loader.ensure({ directory, sessionId })
    await requested.promise
    response.resolve(idle)
    await pending

    expect(store.getState().session_status[sessionId]).toBe("idle")
    expect(store.getState().snapshot[sessionId]?.session.activeRunId).toBeNull()
    expect(store.getState().snapshot[sessionId]?.activeRun).toBeNull()
  })

  test("an acknowledgement that binds only the projected session survives the first snapshot", async () => {
    const store = createStore()
    store.setState({ snapshot: {}, session_status: { [sessionId]: "idle" } })
    const response = deferred<SessionSnapshot>()
    const requested = deferred<void>()
    const client = nativeClient({ getSnapshot: () => { requested.resolve(); return response.promise } })
    loader = new SessionMessageLoader(manager, { client, runtimeKey: getRuntimeKey() })

    const pending = loader.ensure({ directory, sessionId })
    await requested.promise
    store.setState((state) => installRuntimeRun(state, { runId: "run-a", sessionId, status: "running", createdAt: 5 }))
    expect(store.getState().session.find((item) => item.sessionId === sessionId)?.activeRunId).toBe("run-a")
    expect(store.getState().runControlActiveRun?.[sessionId]).toEqual({ runId: "run-a", sessionId, status: "running", createdAt: 5 })

    response.resolve(idle)
    await pending

    expect(store.getState().session_status[sessionId]).toBe("running")
    expect(store.getState().snapshot[sessionId]?.session.activeRunId).toBe("run-a")
    expect(store.getState().snapshot[sessionId]?.activeRun).toEqual({ runId: "run-a", sessionId, status: "running", createdAt: 5 })
    expect(store.getState().session.find((item) => item.sessionId === sessionId)?.activeRunId).toBe("run-a")
    expect(store.getState().runControlActiveRun?.[sessionId]).toBeUndefined()
  })

  test("a snapshot from another epoch replaces run control even after an in-flight acknowledgement", async () => {
    const store = createStore()
    const response = deferred<SessionSnapshot>()
    const requested = deferred<void>()
    const client = nativeClient({ getSnapshot: () => { requested.resolve(); return response.promise } })
    loader = new SessionMessageLoader(manager, { client, runtimeKey: getRuntimeKey() })

    const pending = loader.ensure({ directory, sessionId })
    await requested.promise
    store.setState((state) => installRuntimeRun(state, { runId: "run-a", sessionId, status: "running", createdAt: 5 }))
    response.resolve({ ...idle, session: { ...idle.session, epoch: "epoch-b" }, cursor: "epoch-b:4" })
    await pending

    expect(store.getState().session_status[sessionId]).toBe("idle")
    expect(store.getState().snapshot[sessionId]?.session.activeRunId).toBeNull()
    expect(store.getState().snapshot[sessionId]?.activeRun).toBeNull()
  })
})
