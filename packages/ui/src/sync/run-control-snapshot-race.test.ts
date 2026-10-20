import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { Session, SessionSnapshot } from "@openchamber/agent-contract"
import { getRuntimeKey } from "@/lib/runtime-switch"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { ChildStoreManager } from "./child-store"
import { installRuntimeRun } from "./event-reducer"
import { SessionMessageLoader } from "./session-message-loader"
import { deferred, nativeClient, nativeSnapshot } from "./session-message-loader-test-fixtures"
import { clearDirectorySessionPrefetch } from "./session-prefetch-cache"

// Each case owns a distinct runtime-scoped identity. The loader caches load
// coverage by runtimeKey + directory + sessionId at module level, so reusing
// them would let one case mark the next one resolved and skip the snapshot
// read under test entirely.
let sequence = 0
let directory = ""
let sessionId = ""
let idle: SessionSnapshot
let host: Session
let manager: ChildStoreManager
let loader: SessionMessageLoader | null = null

const newer = (headSequence: string): SessionSnapshot => ({
  ...idle,
  session: { ...idle.session, headSequence },
  cursor: `epoch-a:${headSequence}`,
})

beforeEach(() => {
  sequence += 1
  directory = `/run-control-${sequence}`
  sessionId = `run-control-session-${sequence}`
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

describe("run control survives an in-flight snapshot read", () => {
  test("an acknowledgement published after the read began is not erased by its older idle snapshot", async () => {
    const store = createStore()
    const response = deferred<SessionSnapshot>()
    const requested = deferred<void>()
    const client = nativeClient({ getSnapshot: () => { requested.resolve(); return response.promise } })
    loader = new SessionMessageLoader(manager, { client, runtimeKey: getRuntimeKey() })

    const pending = loader.ensure({ directory, sessionId })
    await requested.promise
    store.setState((state) => installRuntimeRun(state, { runId: "run-a", sessionId, status: "running", createdAt: 5 }))
    expect(store.getState().session_status[sessionId]).toBe("running")

    response.resolve(idle)
    await pending

    // Same head sequence, so the snapshot is not "older" by sequence, but it
    // was read before the ack and must not resurrect Send/no-Stop.
    expect(store.getState().session_status[sessionId]).toBe("running")
    expect(store.getState().snapshot[sessionId]?.session).toMatchObject({ runtimeStatus: "running", activeRunId: "run-a" })
    expect(store.getState().snapshot[sessionId]?.activeRun?.runId).toBe("run-a")
  })

  test("a snapshot with a newer head sequence still owns the terminal state", async () => {
    const store = createStore()
    const response = deferred<SessionSnapshot>()
    const requested = deferred<void>()
    const client = nativeClient({ getSnapshot: () => { requested.resolve(); return response.promise } })
    loader = new SessionMessageLoader(manager, { client, runtimeKey: getRuntimeKey() })

    const pending = loader.ensure({ directory, sessionId })
    await requested.promise
    store.setState((state) => installRuntimeRun(state, { runId: "run-a", sessionId, status: "running", createdAt: 5 }))

    response.resolve(newer("5"))
    await pending

    expect(store.getState().session_status[sessionId]).toBe("idle")
    expect(store.getState().snapshot[sessionId]?.session.activeRunId).toBeNull()
    expect(store.getState().snapshot[sessionId]?.activeRun).toBeNull()
  })
})
