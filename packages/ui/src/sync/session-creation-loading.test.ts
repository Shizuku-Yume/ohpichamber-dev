import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import type { Session, SessionCreateAck } from "@openchamber/agent-contract"
import { canonicalClient, CanonicalApiError } from "@/api/canonicalClient"
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from "@/lib/runtime-switch"
import { resetWorkspaceDirectories } from "@/stores/globalSessions"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { ChildStoreManager } from "./child-store"
import { createSession, setActionRefs } from "./session-actions"
import { SessionMessageLoader, setImperativeSessionMessageLoader } from "./session-message-loader"
import { deferred, nativeClient, nativeMessage, nativeSnapshot } from "./session-message-loader-test-fixtures"
import { useSessionUIStore } from "./session-ui-store"

const originalUI = useSessionUIStore.getState()
const originalGlobal = useGlobalSessionsStore.getState()
const originalRuntime = getRuntimeKey()
const originalBase = getRuntimeApiBaseUrl()
const directory = "/requested/worktree"
const session: Session = { ...nativeSnapshot("session-created", []).session, title: "New session", metadata: {}, metadataRevision: "1", archiveRevision: "0" }
let childStores: ChildStoreManager
let loader: SessionMessageLoader
let requests: number

beforeEach(() => {
  resetWorkspaceDirectories()
  useGlobalSessionsStore.getState().applySnapshot([], [])
  useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null })
  requests = 0
  childStores = new ChildStoreManager()
  loader = new SessionMessageLoader(childStores, { client: nativeClient({ getSnapshot: async () => { requests += 1; throw new Error("history unavailable") } }), runtimeKey: getRuntimeKey() })
  setActionRefs(childStores, () => "/current")
  setImperativeSessionMessageLoader(loader)
  spyOn(canonicalClient, "resolveWorkspace").mockResolvedValue({ workspaceId: session.workspaceId, projectId: session.projectId, name: "Workspace" })
  spyOn(canonicalClient, "createSession").mockResolvedValue({ session })
  spyOn(useSessionUIStore.getState(), "setCurrentSession").mockImplementation((sessionId, hint) => {
    useSessionUIStore.setState({ currentSessionId: sessionId, currentSessionDirectory: hint ?? null })
  })
})

afterEach(() => {
  setImperativeSessionMessageLoader(null)
  loader.dispose()
  childStores.disposeAll()
  mock.restore()
  resetWorkspaceDirectories()
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime })
  useSessionUIStore.setState(originalUI)
  useGlobalSessionsStore.setState(originalGlobal)
})

describe("native confirmed session creation", () => {
  test("publishes visible empty history before navigation without inventing snapshot authority", async () => {
    const target = { directory, sessionId: session.sessionId }
    const select = spyOn(useSessionUIStore.getState(), "setCurrentSession").mockImplementation((sessionId, hint) => {
      expect(childStores.getChild(directory)?.getState().message[session.sessionId]).toEqual([])
      useSessionUIStore.setState({ currentSessionId: sessionId, currentSessionDirectory: hint ?? null })
    })

    expect(await createSession(undefined, directory)).toEqual(session)

    expect(select).toHaveBeenCalledWith(session.sessionId, directory, undefined)
    expect(requests).toBe(0)
    expect(childStores.getChild(directory)?.getState().session).toEqual([session])
    expect(childStores.getChild(directory)?.getState().snapshot[session.sessionId]).toBeUndefined()
    expect(loader.getSnapshot(target).resolved).toBe(false)
    await loader.ensure(target, { reason: "reactive" })
    expect(requests).toBe(1)
    expect(loader.getSnapshot(target).status).toBe("error")
    expect(childStores.getChild(directory)?.getState().message[session.sessionId]).toEqual([])
  })

  test("captures native workspace, metadata and composer options in the creation request", async () => {
    await createSession("Chosen title", directory, { notes: "Keep" }, "submitted-draft", {
      model: { providerId: "provider-a", modelId: "model-a" }, agent: "agent-a", variant: "variant-a", reasoningEffort: "high",
    })
    expect(canonicalClient.resolveWorkspace).toHaveBeenCalledWith(directory)
    expect(canonicalClient.createSession).toHaveBeenCalledWith({
      projectId: session.projectId, workspaceId: session.workspaceId,
      options: { providerId: "provider-a", modelId: "model-a", agentId: "agent-a", variant: "variant-a", reasoningEffort: "high" },
      title: "Chosen title", metadata: {notes: "Keep"},
    })
  })

  test("retains newer Host metadata and an inline first prompt received before the create response", async () => {
    const store = childStores.ensureChild(directory, { bootstrap: false })
    const newer = { ...session, title: "Already renamed", metadata: {}, metadataRevision: "2", headSequence: "5", updatedAt: 3 }
    const message = nativeMessage(session.sessionId, "first-message", 3)
    spyOn(canonicalClient, "createSession").mockImplementation(async () => {
      store.setState({ session: [newer], message: { [session.sessionId]: [message] } })
      return { session }
    })

    await createSession(undefined, directory)

    expect(store.getState().session).toEqual([newer])
    expect(store.getState().message[session.sessionId]).toEqual([message])
    expect(requests).toBe(0)
  })

  test("a rejected create never seeds successful empty history or changes selection", async () => {
    spyOn(canonicalClient, "createSession").mockRejectedValue(new Error("offline"))
    expect(await createSession(undefined, directory)).toBeNull()
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
    expect(childStores.getChild(directory)).toBeUndefined()
    expect(requests).toBe(0)
  })

  test("a canonical capacity refusal reaches the draft lifecycle with its Problem Details sentence", async () => {
    const refusal = new CanonicalApiError({
      type: "urn:ohpichamber:problem:SERVICE_UNAVAILABLE", title: "Agent Service unavailable", status: 503,
      detail: "Session capacity is full (5 of 5 active). Close another session or try again later.",
      code: "SERVICE_UNAVAILABLE", retryable: true,
    })
    spyOn(canonicalClient, "createSession").mockRejectedValue(refusal)
    expect(await createSession(undefined, directory).catch(error => error)).toBe(refusal)
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
    expect(requests).toBe(0)
  })

  test("a create response from an obsolete runtime never seeds the current store", async () => {
    const response = deferred<SessionCreateAck>()
    const started = deferred<void>()
    spyOn(canonicalClient, "createSession").mockImplementation(() => { started.resolve(); return response.promise })
    const pending = createSession(undefined, directory)
    await started.promise
    switchRuntimeEndpoint({ apiBaseUrl: "https://creation-next.test", runtimeKey: "creation-next" })
    response.resolve({ session })
    expect(await pending).toBeNull()
    expect(childStores.getChild(directory)).toBeUndefined()
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
  })

  test("preserve-navigation creation still publishes the confirmed session and empty transcript", async () => {
    expect(await createSession(undefined, directory, undefined, undefined, undefined, "preserve")).toEqual(session)
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
    expect(childStores.getChild(directory)?.getState().message[session.sessionId]).toEqual([])
  })
})
