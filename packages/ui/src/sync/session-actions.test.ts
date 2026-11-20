import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import type { ApprovalRequest, PromptRequest, Run, Session, SessionDeleteAck, SessionSnapshot, Message, Turn } from "@openchamber/agent-contract"
import { CanonicalEventSchema, SessionMetadataSchema } from "@openchamber/agent-contract"
import { z } from "zod"
import { CanonicalApiError, canonicalClient } from "@/api/canonicalClient"
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from "@/lib/runtime-switch"
import * as chatDirectories from "@/lib/chatDirectories"
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from "@/stores/globalSessions"
import { useConfigStore } from "@/stores/useConfigStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { isSessionPinned, useSessionPinnedStore } from "@/stores/useSessionPinnedStore"
import { ChildStoreManager } from "./child-store"
import { applyDirectoryEvent } from "./event-reducer"
import { replaceGlobalSessionStatusById } from "./global-session-status"
import { resetSessionActionFailures, takeSessionActionFailure } from "./session-action-failures"
import { SessionMessageLoader, setImperativeSessionMessageLoader } from "./session-message-loader"
import { deferred, nativeApproval, nativeClient, nativeHistory, nativeMessage, nativeQuestion, nativeSnapshot } from "./session-message-loader-test-fixtures"
import { useSessionUIStore } from "./session-ui-store"
import { setSyncRefs } from "./sync-refs"
import {
  NothingToForkError, abortCurrentOperation, archiveSession, archiveSessions, cancelForm,
  deleteSession, deleteSessions, dismissOpenFormsForSession, dismissOpenPermissionsForSession,
  dismissPermission, forkAfterMessage, forkFromLastCompletedTurn, forkFromMessage,
  getSessionLastAssistantModel, getSessionLiveActivity, patchSessionMetadata,
  moveSessionToDirectory, reconcileExternallyDeletedSession, refetchSessionMessages, replyToForm, revertToMessage,
  respondToPermission, sendMessage, setActionRefs, setSessionWorkState, optimisticSend, setOptimisticRefs,
  unarchiveSession, unarchiveSessions, updateSessionTitle, setLinkedIssue, addLinkedIssues,
} from "./session-actions"
import type { LinkedIssue } from "@/lib/linkedIssues"

const originalRuntime = getRuntimeKey()
const originalBase = getRuntimeApiBaseUrl()
const originalUI = useSessionUIStore.getState()
const originalConfig = useConfigStore.getState()
const originalGlobal = useGlobalSessionsStore.getState()
const originalPins = useSessionPinnedStore.getState()
const directory = "/native/actions"
let manager: ChildStoreManager
let loader: SessionMessageLoader | null
let currentDirectory: string

function session(sessionId = "session-a", changes: Partial<Session> = {}): Session {
  return { ...nativeSnapshot(sessionId, []).session, title: "Before", metadata: {}, metadataRevision: "1", archiveRevision: "0", ...changes }
}

function seed(sessions = [session()], ownedDirectory = directory) {
  for (const item of sessions) registerWorkspaceDirectory(item.workspaceId, ownedDirectory)
  const store = manager.ensureChild(ownedDirectory, { bootstrap: false })
  store.setState({ session: sessions.filter(item => item.archivedAt === undefined) })
  useGlobalSessionsStore.getState().upsertSessions(sessions)
  return store
}

function changeRuntime() {
  switchRuntimeEndpoint({ apiBaseUrl: "https://actions-next.test", runtimeKey: "actions-next" })
}

function problem(code: "APPROVAL_NOT_FOUND" | "QUESTION_EXPIRED" | "SESSION_NOT_FOUND") {
  return new CanonicalApiError({ type: `urn:ohpichamber:problem:${code}`, title: "Unavailable", status: 404, detail: "No longer available", code, retryable: false })
}

function archiveResponse(ids: string[], failedIds: string[] = []) {
  return Response.json({ archived: ids.map(id => ({ id, archivedAt: 123 })), failedIds })
}

function restoreResponse(ids: string[], failedIds: string[] = []) {
  return Response.json({ restored: ids.map(id => ({ id, archivedAt: null })), failedIds })
}

/** The unarchive route reads `{ ids }` off the request body. */
const unarchiveRequestSchema = z.object({ ids: z.array(z.string()) })

beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: "https://actions.test", runtimeKey: "actions" })
  resetWorkspaceDirectories()
  replaceGlobalSessionStatusById(new Map())
  resetSessionActionFailures()
  useGlobalSessionsStore.getState().applySnapshot([], [])
  useGlobalSessionsStore.setState({ hasLoaded: true })
  useSessionPinnedStore.setState({ ids: new Set(), touchedAt: {} })
  useConfigStore.setState({ isConnected: true, hasEverConnected: true })
  useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null })
  spyOn(useSessionUIStore.getState(), "setCurrentSession").mockImplementation((sessionId, hint) => {
    useSessionUIStore.setState({ currentSessionId: sessionId, currentSessionDirectory: hint ?? null })
  })
  spyOn(chatDirectories, "deleteChatDirectory").mockResolvedValue(undefined)
  spyOn(canonicalClient, "getSessionMetadata").mockImplementation(async sessionId => ({ sessionId, revision: "0", metadata: null }))
  spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network request"))
  manager = new ChildStoreManager()
  currentDirectory = directory
  loader = null
  setActionRefs(manager, () => currentDirectory)
  setSyncRefs(manager, directory)
  setImperativeSessionMessageLoader(null)
})

afterEach(() => {
  setOptimisticRefs(() => { }, () => { }, () => { })
  setImperativeSessionMessageLoader(null)
  loader?.dispose()
  manager.disposeAll()
  mock.restore()
  replaceGlobalSessionStatusById(new Map())
  resetSessionActionFailures()
  resetWorkspaceDirectories()
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime })
  useSessionUIStore.setState(originalUI)
  useConfigStore.setState(originalConfig)
  useGlobalSessionsStore.setState(originalGlobal)
  useSessionPinnedStore.setState(originalPins)
})

describe("native branch consumer lifecycle", () => {
  test("tail undo and repeated undo work when selected snapshots omit reverted messages, and redo restores the leaf", async () => {
    const first = nativeMessage("session-a", "first", 1)
    const last = nativeMessage("session-a", "last", 2)
    let snapshot = nativeSnapshot("session-a", [first, last])
    const store = seed()
    store.setState({ snapshot: { "session-a": snapshot }, message: { "session-a": snapshot.messages } })
    spyOn(canonicalClient, "getSnapshot").mockImplementation(async () => snapshot)
    const select = spyOn(canonicalClient, "selectSessionBranch").mockImplementation(async (_id, request) => {
      const messages = request.action === "restore" ? [first, last] : request.messageId === "last" ? [first] : []
      snapshot = nativeSnapshot("session-a", messages)
      snapshot.branch = { ...snapshot.branch, branchVersion: String(BigInt(request.branchVersion) + 1n) }
      if (request.action === "revert") snapshot.branch.revert = { messageId: request.messageId }
      return { sessionId: "session-a", branch: snapshot.branch, draft: null }
    })
    await useSessionUIStore.getState().handleSlashUndo("session-a")
    expect(store.getState().message["session-a"]).toEqual([first])
    await useSessionUIStore.getState().handleSlashUndo("session-a")
    expect(store.getState().message["session-a"]).toEqual([])
    await useSessionUIStore.getState().handleSlashRedo("session-a")
    expect(select.mock.calls.map(([, request]) => request.action)).toEqual(["revert", "revert", "restore"])
    expect(select.mock.calls[2]?.[1]).toMatchObject({ branchId: "branch-a", branchVersion: "3" })
    expect(store.getState().message["session-a"]).toEqual([first, last])
  })

  test("a confirmed selection followed by failed snapshot recovery preserves prior authoritative data", async () => {
    const store = seed()
    const prior = nativeSnapshot()
    store.setState({ snapshot: { "session-a": prior }, message: { "session-a": prior.messages }, permission: { "session-a": [nativeApproval()] } })
    spyOn(canonicalClient, "getSnapshot").mockResolvedValueOnce(prior).mockRejectedValueOnce(new Error("snapshot offline"))
    spyOn(canonicalClient, "selectSessionBranch").mockResolvedValue({ sessionId: "session-a", branch: { ...prior.branch, branchVersion: "2", revert: { messageId: "message-a" } }, draft: null })
    await expect(revertToMessage("session-a", "message-a")).rejects.toThrow("snapshot offline")
    expect(store.getState().snapshot["session-a"]).toBe(prior)
    expect(store.getState().message["session-a"]).toBe(prior.messages)
    expect(store.getState().permission["session-a"]).toEqual([nativeApproval()])
  })

  test("branch acceptance publishes the selected snapshot through loader recovery and establishes history coverage", async () => {
    const store = seed()
    const prior = nativeSnapshot()
    const selected = nativeSnapshot("session-a", [])
    selected.branch = { ...selected.branch, branchVersion: "2", revert: { messageId: "message-a" } }
    const snapshots: SessionSnapshot[] = []
    loader = new SessionMessageLoader(manager, { runtimeKey: getRuntimeKey(), client: nativeClient(), onSnapshot: (_target, snapshot) => { snapshots.push(snapshot) } })
    setImperativeSessionMessageLoader(loader)
    spyOn(canonicalClient, "getSnapshot").mockResolvedValueOnce(prior).mockResolvedValueOnce(selected)
    spyOn(canonicalClient, "selectSessionBranch").mockResolvedValue({ sessionId: "session-a", branch: selected.branch, draft: null })
    await revertToMessage("session-a", "message-a")
    expect(snapshots).toEqual([selected])
    expect(loader.getSnapshot({ directory, sessionId: "session-a" })).toMatchObject({ status: "ready", resolved: true, complete: true })
    expect(store.getState().snapshot["session-a"]?.branch).toEqual(selected.branch)
  })
  test("relocation accepts destination snapshot through loader publication and native history coverage", async () => {
    const source = seed()
    source.setState({ snapshot: { "session-a": nativeSnapshot() }, message: { "session-a": [nativeMessage()] } })
    const destination = "/native/destination"
    const workspace = { workspaceId: "workspace-destination", projectId: "project-a", name: "Destination" }
    const moved = session("session-a", { workspaceId: workspace.workspaceId, epoch: "epoch-destination" })
    const snapshot = nativeSnapshot()
    snapshot.session = moved
    snapshot.cursor = "epoch-destination:4"
    snapshot.window.hasEarlier = true
    const history = spyOn(canonicalClient, "getHistory").mockImplementation(async (_sessionId, options) => options?.cursor === "older-page"
      ? nativeHistory([], null, snapshot)
      : nativeHistory(snapshot.messages, "older-page", snapshot))
    const published: Array<{ directory: string; snapshot: SessionSnapshot }> = []
    loader = new SessionMessageLoader(manager, {
      runtimeKey: getRuntimeKey(), client: canonicalClient,
      onSnapshot: (target, accepted) => { published.push({ directory: target.directory, snapshot: accepted }) }
    })
    setImperativeSessionMessageLoader(loader)
    spyOn(canonicalClient, "resolveWorkspace").mockResolvedValue(workspace)
    spyOn(canonicalClient, "relocateSession").mockResolvedValue({ sessions: [moved] })
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    spyOn(canonicalClient, "getQueue").mockResolvedValue({ sessionId: "session-a", revision: "0", items: [] })
    await moveSessionToDirectory(session(), directory, destination)
    expect(source.getState().message["session-a"]).toBeUndefined()
    expect(manager.getChild(destination)?.getState().snapshot["session-a"]?.session.workspaceId).toBe(workspace.workspaceId)
    expect(published).toEqual([{ directory: destination, snapshot }])
    expect(history).toHaveBeenCalledTimes(2)
    expect(loader.getSnapshot({ directory: destination, sessionId: "session-a" })).toMatchObject({ status: "ready", resolved: true, cursor: undefined, complete: true })
  })

  test("a retired runtime cannot publish a completed native move", async () => {
    const source = seed();
    const relocation = deferred<{ sessions: Session[] }>();
    const started = deferred<void>();
    spyOn(canonicalClient, "resolveWorkspace").mockResolvedValue({ workspaceId: "workspace-destination", projectId: "project-a", name: "Destination" });
    spyOn(canonicalClient, "relocateSession").mockImplementation(() => { started.resolve(); return relocation.promise });
    const pending = moveSessionToDirectory(session(), directory, "/destination");
    await started.promise;
    changeRuntime();
    relocation.resolve({ sessions: [session("session-a", { workspaceId: "workspace-destination" })] });
    await expect(pending).rejects.toThrow('runtime changed');
    expect(source.getState().session).toEqual([session()]);
    expect(manager.getChild("/destination")?.getState().session ?? []).toEqual([]);
  });
});

describe("native session deletion", () => {
  test("retains live and persisted state on failure and reports the failure", async () => {
    const store = seed()
    useSessionPinnedStore.getState().toggle({ directory, sessionId: "session-a" })
    spyOn(canonicalClient, "deleteSession").mockRejectedValue(new Error("delete failed"))
    expect(await deleteSession("session-a")).toBe(false)
    expect(store.getState().session).toEqual([session()])
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, directory, "session-a")).toBe(true)
    expect(takeSessionActionFailure(["session-a"])?.message).toBe("delete failed")
  })

  test("commits the acknowledged cascade and cleans only its persisted state", async () => {
    const root = session()
    const child = session("child", { parentSessionId: root.sessionId, rootSessionId: root.sessionId })
    const retained = session("retained")
    const store = seed([root, child, retained])
    for (const item of [root, child, retained]) useSessionPinnedStore.getState().toggle({ directory, sessionId: item.sessionId })
    useSessionUIStore.setState({ currentSessionId: root.sessionId, currentSessionDirectory: directory })
    const remove = spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: root.sessionId, deletedSessionIds: [root.sessionId, child.sessionId] })
    expect(await deleteSession(root.sessionId)).toBe(true)
    expect(remove).toHaveBeenCalledWith(root.sessionId)
    expect(store.getState().session).toEqual([retained])
    expect(store.getState().sessionDeletedRevision?.[root.sessionId] ?? 0).toBeGreaterThan(0)
    expect(store.getState().sessionDeletedRevision?.[child.sessionId] ?? 0).toBeGreaterThan(0)
    expect(useGlobalSessionsStore.getState().entityById.has(child.sessionId)).toBe(false)
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, directory, root.sessionId)).toBe(false)
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, directory, child.sessionId)).toBe(false)
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, directory, retained.sessionId)).toBe(true)
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
  })

  test("rejects a deletion acknowledgment for another session", async () => {
    const store = seed()
    spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: "another", deletedSessionIds: ["another"] })
    expect(await deleteSession("session-a")).toBe(false)
    expect(store.getState().session).toEqual([session()])
  })

  test("a stable canonical not-found confirms deletion", async () => {
    const store = seed()
    spyOn(canonicalClient, "deleteSession").mockRejectedValue(problem("SESSION_NOT_FOUND"))
    expect(await deleteSession("session-a")).toBe(true)
    expect(store.getState().session).toEqual([])
  })

  for (const notFound of [false, true]) {
    test(`ignores an obsolete ${notFound ? "not-found" : "successful"} deletion response`, async () => {
      const store = seed()
      const response = deferred<SessionDeleteAck>()
      const started = deferred<void>()
      spyOn(canonicalClient, "deleteSession").mockImplementation(() => { started.resolve(); return response.promise })
      const pending = deleteSession("session-a")
      await started.promise
      changeRuntime()
      if (notFound) response.reject(problem("SESSION_NOT_FOUND"))
      else response.resolve({ sessionId: "session-a", deletedSessionIds: ["session-a"] })
      expect(await pending).toBe(false)
      expect(store.getState().session).toEqual([session()])
    })
  }

  test("preserves committed batch deletions and stops issuing requests after a runtime switch", async () => {
    const store = seed([session(), session("session-b"), session("session-c")])
    const remove = spyOn(canonicalClient, "deleteSession").mockImplementation(async sessionId => {
      if (sessionId === "session-b") changeRuntime()
      return { sessionId, deletedSessionIds: [sessionId] }
    })
    expect(await deleteSessions(["session-a", "session-b", "session-c"])).toEqual({ deletedIds: ["session-a"], failedIds: ["session-b", "session-c"] })
    expect(remove.mock.calls.map(call => call[0])).toEqual(["session-a", "session-b"])
    expect(store.getState().session.map(item => item.sessionId)).toEqual(["session-b", "session-c"])
  })

  test("keeps shared chat storage while a sibling root references its mapped workspace", async () => {
    seed([session(), session("sibling")])
    spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: "session-a", deletedSessionIds: ["session-a"] })
    expect(await deleteSession("session-a")).toBe(true)
    expect(chatDirectories.deleteChatDirectory).not.toHaveBeenCalled()
  })

  test("removes the last root's chat storage after its cascade is confirmed", async () => {
    seed([session(), session("child", { parentSessionId: "session-a", rootSessionId: "session-a" })])
    spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: "session-a", deletedSessionIds: ["session-a", "child"] })
    expect(await deleteSession("session-a")).toBe(true)
    expect(chatDirectories.deleteChatDirectory).toHaveBeenCalledWith(directory)
  })

  test("an incomplete global cache cannot authorize removing chat storage", async () => {
    seed()
    useGlobalSessionsStore.setState({ hasLoaded: false })
    spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: "session-a", deletedSessionIds: ["session-a"] })
    expect(await deleteSession("session-a")).toBe(true)
    expect(chatDirectories.deleteChatDirectory).not.toHaveBeenCalled()
  })

  test("external deletion rejects obsolete owners and reconciles a current identity", () => {
    const store = seed()
    reconcileExternallyDeletedSession({ runtimeKey: "obsolete", directory, sessionId: "session-a" })
    expect(store.getState().session).toHaveLength(1)
    reconcileExternallyDeletedSession({ runtimeKey: getRuntimeKey(), directory, sessionId: "session-a" })
    expect(store.getState().session).toEqual([])
    expect(useGlobalSessionsStore.getState().entityById.has("session-a")).toBe(false)
  })
})

describe("Host archive transitions over native records", () => {
  test("a failed single archive retains the session and status", async () => {
    const store = seed()
    store.setState({ session_status: { "session-a": "running" } })
    spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }))
    expect(await archiveSession("session-a")).toBe(false)
    expect(store.getState().session).toHaveLength(1)
    expect(store.getState().session_status["session-a"]).toBe("running")
    expect(takeSessionActionFailure(["session-a"])).not.toBeNull()
  })

  test("confirmed archive invalidates status and moves the full canonical record", async () => {
    const store = seed()
    store.setState({
      sessionStatusReady: true, session_status: { "session-a": "running" },
      snapshot: { "session-a": nativeSnapshot() }, message: { "session-a": [nativeMessage()] },
      permission: { "session-a": [nativeApproval()] }, form: { "session-a": [nativeQuestion()] }
    })
    spyOn(globalThis, "fetch").mockResolvedValue(archiveResponse(["session-a"]))
    expect(await archiveSession("session-a")).toBe(true)
    expect(store.getState().session).toEqual([])
    expect(store.getState().session_status["session-a"]).toBeUndefined()
    expect(store.getState().sessionStatusInvalidated?.['session-a']).toBe(true)
    expect(getSessionLiveActivity("session-a")).toBe("unknown")
    expect(store.getState().snapshot["session-a"]).toBeUndefined()
    expect(store.getState().message["session-a"]).toBeUndefined()
    expect(store.getState().permission["session-a"]).toBeUndefined()
    expect(store.getState().form["session-a"]).toBeUndefined()
    expect(useGlobalSessionsStore.getState().archivedSessions.find(item => item.sessionId === "session-a")).toEqual({ ...session(), archivedAt: 123 })
  })

  test("batches held sessions into one request and one directory publication", async () => {
    const store = seed([session(), session("session-b")])
    store.setState({
      sessionStatusReady: true, snapshot: { "session-a": nativeSnapshot(), "session-b": nativeSnapshot("session-b") },
      message: { "session-a": [nativeMessage()], "session-b": [nativeMessage("session-b")] }
    })
    const fetch = spyOn(globalThis, "fetch").mockImplementation(async input => String(input).includes("/auth/url-token")
      ? Response.json({ token: "actions-token", expiresAt: 999 })
      : archiveResponse(["session-a", "session-b"]))
    let publications = 0
    const unsubscribe = store.subscribe(() => { publications += 1 })
    try {
      expect(await archiveSessions(["session-a", "session-b"])).toEqual({ archivedIds: ["session-a", "session-b"], failedIds: [] })
      expect(fetch.mock.calls.filter(([input]) => String(input).includes("/sessions/archive"))).toHaveLength(1)
      expect(publications).toBe(1)
      expect(store.getState().session).toEqual([])
      expect(store.getState().snapshot).toEqual({})
      expect(store.getState().message).toEqual({})
      expect(getSessionLiveActivity("session-a")).toBe("unknown")
      expect(getSessionLiveActivity("session-b")).toBe("unknown")
      expect(useGlobalSessionsStore.getState().archivedSessions.map(item => item.sessionId).sort()).toEqual(["session-a", "session-b"])
    } finally { unsubscribe() }
  })

  test("partial archive failures preserve their native live records", async () => {
    const store = seed([session(), session("session-b")])
    spyOn(globalThis, "fetch").mockResolvedValue(archiveResponse(["session-a"], ["session-b"]))
    expect(await archiveSessions(["session-a", "session-b"])).toEqual({ archivedIds: ["session-a"], failedIds: ["session-b"] })
    expect(store.getState().session).toEqual([session("session-b")])
  })

  test("malformed archive responses never grant successful empty authority", async () => {
    const store = seed()
    spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ archived: [{ title: "missing identity" }], failedIds: [] }))
    expect(await archiveSessions(["session-a"])).toEqual({ archivedIds: [], failedIds: ["session-a"] })
    expect(store.getState().session).toEqual([session()])
  })

  test("an archive response from the previous runtime cannot remove live sessions", async () => {
    const store = seed([session(), session("session-b")])
    const response = deferred<Response>()
    const started = deferred<void>()
    spyOn(globalThis, "fetch").mockImplementation(() => { started.resolve(); return response.promise })
    const pending = archiveSessions(["session-a", "session-b"])
    await started.promise
    changeRuntime()
    response.resolve(archiveResponse(["session-a", "session-b"]))
    expect(await pending).toEqual({ archivedIds: [], failedIds: ["session-a", "session-b"] })
    expect(store.getState().session).toHaveLength(2)
  })

  test("restores a parent and archived descendants but refuses a child by itself", async () => {
    seed([session("root", { archivedAt: 3 }), session("child", { parentSessionId: "root", rootSessionId: "root", archivedAt: 3 })])
    const fetch = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/auth/url-token")) return Response.json({ token: "actions-token", expiresAt: 999 })
      const request = unarchiveRequestSchema.parse(JSON.parse(String(init?.body)))
      return restoreResponse(request.ids)
    })
    spyOn(canonicalClient, "getSnapshot").mockImplementation(async id => nativeSnapshot(id, []))
    expect(await unarchiveSession("child")).toBe(false)
    expect(fetch.mock.calls.filter(([input]) => String(input).includes("/sessions/unarchive"))).toHaveLength(0)
    expect(await unarchiveSessions(["child", "root"])).toEqual({ restoredIds: ["root", "child"], failedIds: [] })
    expect(useGlobalSessionsStore.getState().activeSessions.map(item => item.sessionId).sort()).toEqual(["child", "root"])
    expect(useGlobalSessionsStore.getState().activeSessions.every(item => item.archivedAt === undefined)).toBe(true)
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([])
  })

  test("failed status recovery leaves a committed restore unknown, not failed or idle", async () => {
    const store = seed([session("session-a", { archivedAt: 3 })])
    store.setState({ session: [], sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    spyOn(globalThis, "fetch").mockResolvedValue(restoreResponse(["session-a"]))
    spyOn(canonicalClient, "getSnapshot").mockRejectedValue(new Error("status unavailable"))
    expect(await unarchiveSession("session-a")).toBe(true)
    expect(useGlobalSessionsStore.getState().activeSessions.some(item => item.sessionId === "session-a")).toBe(true)
    expect(getSessionLiveActivity("session-a")).toBe("unknown")
    expect(takeSessionActionFailure(["session-a"])).toBeNull()
  })

  test("restore recovers native running status rather than trusting an old idle baseline", async () => {
    const store = seed([session("session-a", { archivedAt: 3 })])
    store.setState({ session: [], sessionStatusReady: true, sessionStatusInvalidated: { "session-a": true } })
    const snapshot = nativeSnapshot("session-a", [])
    const run: Run = { runId: "run-live", sessionId: "session-a", status: "running", origin: "host", createdAt: 4 }
    snapshot.session = { ...snapshot.session, runtimeStatus: "running", activeRunId: run.runId }
    snapshot.activeRun = run
    spyOn(globalThis, "fetch").mockResolvedValue(restoreResponse(["session-a"]))
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    expect(await unarchiveSession("session-a")).toBe(true)
    expect(store.getState().session_status["session-a"]).toBe("running")
    expect(getSessionLiveActivity("session-a")).toBe("active")
  })

  test("a newer status mutation wins over an in-flight restore snapshot", async () => {
    const store = seed([session("session-a", { archivedAt: 3 })])
    store.setState({ session: [], sessionStatusInvalidated: { "session-a": true } })
    const response = deferred<SessionSnapshot>()
    const started = deferred<void>()
    spyOn(globalThis, "fetch").mockResolvedValue(restoreResponse(["session-a"]))
    spyOn(canonicalClient, "getSnapshot").mockImplementation(() => { started.resolve(); return response.promise })
    const pending = unarchiveSession("session-a")
    await started.promise
    store.setState({ session_status: { "session-a": "awaiting_approval" } })
    response.resolve(nativeSnapshot("session-a", []))
    expect(await pending).toBe(true)
    expect(store.getState().session_status["session-a"]).toBe("awaiting_approval")
  })

  test("a missing restore stamp retains the archived record", async () => {
    seed([session("session-a", { archivedAt: 3 })])
    spyOn(globalThis, "fetch").mockResolvedValue(restoreResponse([], ["session-a"]))
    expect(await unarchiveSession("session-a")).toBe(false)
    expect(useGlobalSessionsStore.getState().archivedSessions.some(item => item.sessionId === "session-a")).toBe(true)
  })

  test("an obsolete restore response cannot restore the native record", async () => {
    const store = seed([session("session-a", { archivedAt: 3 })])
    store.setState({ sessionStatusInvalidated: { "session-a": true } })
    const response = deferred<Response>()
    const started = deferred<void>()
    spyOn(globalThis, "fetch").mockImplementation(() => { started.resolve(); return response.promise })
    const pending = unarchiveSession("session-a")
    await started.promise
    changeRuntime()
    response.resolve(restoreResponse(["session-a"]))
    expect(await pending).toBe(false)
    expect(store.getState().session).toEqual([])
    expect(store.getState().sessionStatusInvalidated?.['session-a']).toBe(true)
  })

  test("a runtime switch during status recovery keeps the already-confirmed restore", async () => {
    seed([session("session-a", { archivedAt: 3 })])
    spyOn(globalThis, "fetch").mockResolvedValue(restoreResponse(["session-a"]))
    spyOn(canonicalClient, "getSnapshot").mockImplementation(async id => { changeRuntime(); return nativeSnapshot(id, []) })
    expect(await unarchiveSessions(["session-a", "session-b"])).toEqual({ restoredIds: ["session-a"], failedIds: ["session-b"] })
  })
})

describe("native delivery and execution controls", () => {
  const request: PromptRequest = {
    input: { text: "Hello", attachments: [{ attachmentId: "attachment-a", name: "notes.txt", mediaType: "text/plain", size: 4, uri: "attachment://attachment-a" }], context: [{ kind: "synthetic", text: "Context" }] },
    options: { providerId: "provider-a", modelId: "model-a", agentId: "agent-a", variant: null, reasoningEffort: null },
  }
  const run: Run = { runId: "run-a", sessionId: "session-a", status: "running", origin: "host", createdAt: 1 }

  test.each(["unavailable", "idle", "missing"] as const)("accepted send requests snapshot recovery only for a cold or missing snapshot (%s)", async status => {
    const store = seed()
    if (status !== "missing") {
      const snapshot = nativeSnapshot()
      snapshot.session.runtimeStatus = status
      store.setState({ snapshot: { "session-a": snapshot } })
    }
    const ensure = mock(() => {})
    setActionRefs(manager, () => directory, undefined, ensure)
    const pending = deferred<{ run: Run }>()
    const create = spyOn(canonicalClient, "createRun").mockImplementation(() => pending.promise)
    const sending = sendMessage({ sessionId: "session-a", directory, request })
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
    expect(ensure).toHaveBeenCalledTimes(1)
    pending.resolve({ run })
    await sending
    expect(create).toHaveBeenCalledTimes(1)
    expect(ensure).toHaveBeenCalledTimes(status === "idle" ? 1 : 2)
    if (status !== "idle") expect(ensure).toHaveBeenLastCalledWith("session-a", directory, { refreshSnapshot: true })
  })

  test.each(["failure", "runtime-switch"])("an unaccepted or stale cold send does not request recovery (%s)", async outcome => {
    seed()
    const ensure = mock(() => {})
    setActionRefs(manager, () => directory, undefined, ensure)
    spyOn(canonicalClient, "createRun").mockImplementation(async () => { if (outcome === "failure") throw new Error("Refused"); changeRuntime(); return { run } })
    await expect(sendMessage({ sessionId: "session-a", directory, request })).rejects.toThrow()
    expect(ensure).toHaveBeenCalledTimes(1)
  })

  test("submits a native prompt and command identity without inventing transcript records", async () => {
    const store = seed()
    const create = spyOn(canonicalClient, "createRun").mockResolvedValue({ run })
    await sendMessage({ sessionId: "session-a", request, commandId: "command-a" })
    expect(create).toHaveBeenCalledWith("session-a", request, "command-a")
    expect(store.getState().message["session-a"]).toBeUndefined()
  })

  test("publishes the accepted run as control state before any status event", async () => {
    const store = seed()
    spyOn(canonicalClient, "createRun").mockResolvedValue({ run })
    await sendMessage({ sessionId: "session-a", request })
    expect(store.getState().session_status["session-a"]).toBe("running")
    expect(store.getState().session.find((item) => item.sessionId === "session-a")).toMatchObject({ runtimeStatus: "running", activeRunId: run.runId })
    // Control state only: acceptance is not proof of a message.
    expect(store.getState().message["session-a"]).toBeUndefined()
  })

  test("an idle snapshot unchanged since the request accepts the new run ack", async () => {
    const store = seed()
    const idle = nativeSnapshot("session-a", [])
    store.setState({ snapshot: { "session-a": idle } })
    spyOn(canonicalClient, "createRun").mockResolvedValue({ run })
    await sendMessage({ sessionId: "session-a", request })
    expect(store.getState().session_status["session-a"]).toBe("running")
    expect(store.getState().snapshot["session-a"]?.session).toMatchObject({ runtimeStatus: "running", activeRunId: run.runId })
  })

  test("a createRun ack resolved after a released run cannot resurrect stop", async () => {
    const store = seed()
    store.setState({ snapshot: { "session-a": nativeSnapshot("session-a", []) } })
    const ack = deferred<{ run: Run }>()
    const requested = deferred<void>()
    spyOn(canonicalClient, "createRun").mockImplementation(() => { requested.resolve(); return ack.promise })
    const pending = sendMessage({ sessionId: "session-a", request })
    await requested.promise

    // The run is observed terminal while the HTTP acknowledgement is in flight.
    const started = applyDirectoryEvent(store.getState(), CanonicalEventSchema.parse({
      sessionId: "session-a", epoch: "epoch-a", sequence: "5", timestamp: 5, type: "run.started", runId: run.runId, createdAt: 1,
    }))
    store.setState(started.state)
    const completed = applyDirectoryEvent(store.getState(), CanonicalEventSchema.parse({
      sessionId: "session-a", epoch: "epoch-a", sequence: "6", timestamp: 6, type: "run.completed", runId: run.runId, finishedAt: 6,
    }))
    store.setState(completed.state)
    expect(store.getState().session_status["session-a"]).toBe("idle")

    ack.resolve({ run })
    await pending
    expect(store.getState().session_status["session-a"]).toBe("idle")
    expect(store.getState().snapshot["session-a"]?.session.activeRunId).toBeNull()
    expect(store.getState().snapshot["session-a"]?.activeRun).toBeNull()
    expect(store.getState().session.find((item) => item.sessionId === "session-a")).toMatchObject({ runtimeStatus: "idle", activeRunId: null })
  })

  test("routes steer and follow-up through their native acknowledgments", async () => {
    const steer = spyOn(canonicalClient, "steer").mockResolvedValue({ sessionId: "session-a", runId: run.runId, acceptedAt: 2 })
    const follow = spyOn(canonicalClient, "followUp").mockResolvedValue({ sessionId: "session-a", followUpId: "follow-a", acceptedAt: 2 })
    await sendMessage({ sessionId: "session-a", request, mode: "steer", commandId: "steer-a" })
    await sendMessage({ sessionId: "session-a", request, mode: "follow-up", commandId: "follow-a" })
    expect(steer).toHaveBeenCalledWith("session-a", request, "steer-a")
    expect(follow).toHaveBeenCalledWith("session-a", request, "follow-a")
  })

  test("propagates an ambiguous delivery failure once without retrying or changing history", async () => {
    const store = seed()
    const message = nativeMessage()
    store.setState({ message: { "session-a": [message] } })
    const error = new TypeError("Failed to fetch")
    const create = spyOn(canonicalClient, "createRun").mockRejectedValue(error)
    try {
      await sendMessage({ sessionId: 'session-a', request })
      throw new Error('Expected sendMessage to reject')
    } catch (caught) {
      expect(caught).toBe(error)
    }
    expect(create).toHaveBeenCalledTimes(1)
    expect(store.getState().message["session-a"]).toEqual([message])
  })

  test("rejects an obsolete send before dispatch", async () => {
    const create = spyOn(canonicalClient, "createRun")
    await expect(sendMessage({ sessionId: "session-a", request, runtimeKey: "obsolete" })).rejects.toThrow("runtime changed")
    expect(create).not.toHaveBeenCalled()
  })

  test("rejects a run response addressed to another session", async () => {
    spyOn(canonicalClient, "createRun").mockResolvedValue({ run: { ...run, sessionId: "another" } })
    await expect(sendMessage({ sessionId: "session-a", request })).rejects.toThrow("another session")
  })

  test("aborts the authoritative active run and does nothing for an idle snapshot", async () => {
    const snapshot = nativeSnapshot("session-a", [])
    snapshot.session = { ...snapshot.session, runtimeStatus: "running", activeRunId: run.runId }
    snapshot.activeRun = run
    const read = spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    const abort = spyOn(canonicalClient, "abortSession").mockResolvedValue({ run: { ...run, status: "cancelled", finishedAt: 2 } })
    await abortCurrentOperation("session-a")
    expect(abort).toHaveBeenCalledWith("session-a", run.runId)
    read.mockResolvedValue(nativeSnapshot("session-a", []))
    await abortCurrentOperation("session-a")
    expect(abort).toHaveBeenCalledTimes(1)
  })

  test("cancels authoritative compaction without requiring an active run", async () => {
    const store = seed()
    const live = nativeSnapshot("session-a", [])
    live.compacting = { method: "handed-off", startedAt: 1 }
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(live)
    const compactionAbort = spyOn(canonicalClient, "abortCompaction").mockResolvedValue({ type: "compact.abort", aborted: true })
    await abortCurrentOperation("session-a")
    expect(compactionAbort).toHaveBeenCalledWith("session-a")
    expect(store.getState().snapshot["session-a"]?.activeRun).toBeUndefined()
  })

  test("publishes the run abort acknowledgement as terminal control state", async () => {
    const store = seed()
    const live = nativeSnapshot("session-a", [])
    live.session = { ...live.session, runtimeStatus: "running", activeRunId: run.runId }
    live.activeRun = run
    live.compacting = { method: "soft-compacted", startedAt: 1 }
    store.setState({
      snapshot: { "session-a": live },
      session_status: { "session-a": "running" },
      session: [{ ...store.getState().session[0]!, runtimeStatus: "running", activeRunId: run.runId }],
    })
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(live)
    spyOn(canonicalClient, "abortSession").mockResolvedValue({ run: { ...run, status: "cancelled", finishedAt: 2 } })
    await abortCurrentOperation("session-a")
    expect(store.getState().session_status["session-a"]).toBe("idle")
    expect(store.getState().snapshot["session-a"]?.session.activeRunId).toBeNull()
    expect(store.getState().snapshot["session-a"]?.activeRun).toBeNull()
    expect(store.getState().session[0]).toMatchObject({ runtimeStatus: "idle", activeRunId: null })
  })

  test("failed history recovery preserves cached messages; successful empty authority replaces them", async () => {
    const store = seed()
    const cached = nativeMessage()
    store.setState({ message: { "session-a": [cached] } })
    const read = spyOn(canonicalClient, "getSnapshot").mockRejectedValue(new Error("offline"))
    await expect(refetchSessionMessages("session-a")).rejects.toThrow("offline")
    expect(store.getState().message["session-a"]).toEqual([cached])
    read.mockResolvedValue(nativeSnapshot("session-a", []))
    await refetchSessionMessages("session-a")
    expect(store.getState().message["session-a"]).toEqual([])
  })

  test("action refresh uses the real loader and preserves visible history on native read failure", async () => {
    const store = seed()
    const cached = nativeMessage()
    store.setState({ message: { "session-a": [cached] } })
    let fail = true
    const client = nativeClient({
      getSnapshot: async id => {
        if (fail) throw new Error("loader offline")
        return nativeSnapshot(id, [])
      }
    })
    loader = new SessionMessageLoader(manager, { client, runtimeKey: getRuntimeKey() })
    setImperativeSessionMessageLoader(loader)
    await expect(refetchSessionMessages("session-a")).rejects.toThrow("loader offline")
    expect(store.getState().message["session-a"]).toEqual([cached])
    fail = false
    await refetchSessionMessages("session-a")
    expect(store.getState().message["session-a"]).toEqual([])
  })

  test("confirmed deletion invalidates the real loader's resolved transcript coverage", async () => {
    seed()
    const target = { directory, sessionId: "session-a" }
    loader = new SessionMessageLoader(manager, { client: nativeClient(), runtimeKey: getRuntimeKey() })
    setImperativeSessionMessageLoader(loader)
    await loader.ensure(target)
    const generation = loader.getSnapshot(target).generation
    expect(loader.getSnapshot(target).resolved).toBe(true)
    spyOn(canonicalClient, "deleteSession").mockResolvedValue({ sessionId: "session-a", deletedSessionIds: ["session-a"] })
    expect(await deleteSession("session-a")).toBe(true)
    expect(loader.getSnapshot(target).generation).toBe(generation + 1)
    expect(loader.getSnapshot(target).resolved).toBe(false)
  })

  test("reads assistant provider and model from inline native message records", () => {
    const store = seed()
    store.setState({ message: { "session-a": [{ ...nativeMessage("session-a", "assistant", 2, "assistant"), providerId: "provider-a", modelId: "model-a" }, nativeMessage("session-a", "user", 3)] } })
    expect(getSessionLastAssistantModel("session-a")).toEqual({ providerID: "provider-a", modelID: "model-a" })
  })
})

describe("native approval and question CAS", () => {
  const approval: ApprovalRequest = { ...nativeApproval(), policyTarget: { toolName: "bash", pattern: "pwd" } }
  const question = nativeQuestion()
  const identity = { version: approval.version, epoch: approval.epoch, workerGeneration: approval.workerGeneration }

  function requests() {
    const store = seed()
    store.setState({ permission: { "session-a": [approval] }, form: { "session-a": [question] } })
    return store
  }

  test("approval once, always and reject carry the pending CAS identity and clear confirmed cards", async () => {
    const store = requests()
    const reply = spyOn(canonicalClient, "respondApproval").mockImplementation(async (_sessionId, _approvalId, response) => ({
      ...approval, status: response.decision === "reject" ? "rejected" : "approved", version: "2", resolvedAt: 2,
      resolution: response.decision === "always-allow"
        ? { decision: "always-allow", policy: { policyId: "policy-a", revision: "1", persistence: "committed", scope: "session" } }
        : { decision: response.decision === "reject" ? "reject" : "approve" },
    }))
    for (const [response, decision] of [["once", "approve"], ["always", "always-allow"], ["reject", "reject"]] as const) {
      store.setState({ permission: { "session-a": [approval] } })
      await respondToPermission("session-a", approval.approvalId, response)
      const expected = response === "always"
        ? { ...identity, decision, policyScope: "session" }
        : { ...identity, decision }
      expect(reply).toHaveBeenLastCalledWith("session-a", approval.approvalId, expected)
      expect(store.getState().permission["session-a"]).toBeUndefined()
    }
  })

  test("question answers and cancellation carry the native CAS identity", async () => {
    const store = requests()
    const answer = { choice: "yes", count: 2 }
    const reply = spyOn(canonicalClient, "respondQuestion").mockResolvedValue({ ...question, status: "answered", version: "2", response: answer, answeredAt: 2, resolvedAt: 2 })
    await replyToForm("session-a", question.questionId, answer)
    expect(reply).toHaveBeenLastCalledWith("session-a", question.questionId, { ...identity, action: "answer", response: answer })
    expect(store.getState().form["session-a"]).toBeUndefined()
    store.setState({ form: { "session-a": [question] } })
    reply.mockResolvedValue({ ...question, status: "cancelled", version: "2", resolvedAt: 2 })
    await cancelForm("session-a", question.questionId)
    expect(reply).toHaveBeenLastCalledWith("session-a", question.questionId, { ...identity, action: "cancel" })
    expect(store.getState().form["session-a"]).toBeUndefined()
  })

  test("missing local cards are read from the native pending-set snapshot", async () => {
    seed()
    const snapshot = nativeSnapshot()
    snapshot.approvals = [approval]
    snapshot.questions = [question]
    const read = spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    const approve = spyOn(canonicalClient, "respondApproval").mockResolvedValue({ ...approval, status: "approved", version: "2", resolvedAt: 2, resolution: { decision: "approve" } })
    const answer = spyOn(canonicalClient, "respondQuestion").mockResolvedValue({ ...question, status: "answered", version: "2", response: { choice: "yes" }, answeredAt: 2, resolvedAt: 2 })
    await respondToPermission("session-a", approval.approvalId, "once")
    await replyToForm("session-a", question.questionId, { choice: "yes" })
    expect(read).toHaveBeenCalledTimes(2)
    expect(approve).toHaveBeenCalledWith("session-a", approval.approvalId, { ...identity, decision: "approve" })
    expect(answer).toHaveBeenCalledWith("session-a", question.questionId, { ...identity, action: "answer", response: { choice: "yes" } })
  })

  test("transient reply failure preserves both pending cards", async () => {
    const store = requests()
    spyOn(canonicalClient, "respondApproval").mockRejectedValue(new Error("offline"))
    spyOn(canonicalClient, "respondQuestion").mockRejectedValue(new Error("offline"))
    await expect(dismissPermission("session-a", approval.approvalId)).rejects.toThrow("offline")
    await expect(cancelForm("session-a", question.questionId)).rejects.toThrow("offline")
    expect(store.getState().permission["session-a"]).toEqual([approval])
    expect(store.getState().form["session-a"]).toEqual([question])
  })

  test("canonical terminal-request errors clear stale cards and request tail recovery", async () => {
    const store = requests()
    const message = nativeMessage()
    store.setState({ message: { "session-a": [message] } })
    const materialize = mock(() => { })
    setActionRefs(manager, () => directory, materialize)
    spyOn(canonicalClient, "respondApproval").mockRejectedValue(problem("APPROVAL_NOT_FOUND"))
    spyOn(canonicalClient, "respondQuestion").mockRejectedValue(problem("QUESTION_EXPIRED"))
    await expect(dismissPermission("session-a", approval.approvalId)).rejects.toBeInstanceOf(CanonicalApiError)
    await expect(cancelForm("session-a", question.questionId)).rejects.toBeInstanceOf(CanonicalApiError)
    expect(store.getState().permission["session-a"]).toBeUndefined()
    expect(store.getState().form["session-a"]).toBeUndefined()
    expect(materialize).toHaveBeenCalledTimes(2)
    expect(materialize).toHaveBeenCalledWith(directory, "session-a", message.messageId)
  })

  test("subtree dismissal removes duplicate pending cards immediately and sends once per identity", async () => {
    const child = session("child", { parentSessionId: "session-a", rootSessionId: "session-a" })
    const store = seed([session(), child, session("unrelated")])
    const childApproval = { ...nativeApproval("child"), approvalId: "approval-child" }
    const childQuestion = { ...nativeQuestion("child"), questionId: "question-child" }
    const unrelatedApproval = nativeApproval("unrelated")
    const unrelatedQuestion = nativeQuestion("unrelated")
    store.setState({ permission: { "session-a": [approval], child: [childApproval], unrelated: [unrelatedApproval] }, form: { "session-a": [question], child: [childQuestion], unrelated: [unrelatedQuestion] } })
    const duplicate = manager.ensureChild("/another-index", { bootstrap: false })
    duplicate.setState({ session: [session(), child], permission: { "session-a": [approval], child: [childApproval] }, form: { "session-a": [question], child: [childQuestion] } })
    const gate = deferred<void>()
    const approve = spyOn(canonicalClient, "respondApproval").mockImplementation(async (sessionId, approvalId) => {
      await gate.promise
      return { ...nativeApproval(sessionId), approvalId, status: "rejected", version: "2", resolvedAt: 2, resolution: { decision: "reject" } }
    })
    const answer = spyOn(canonicalClient, "respondQuestion").mockImplementation(async (sessionId, questionId) => {
      await gate.promise
      return { ...nativeQuestion(sessionId), questionId, status: "cancelled", version: "2", resolvedAt: 2 }
    })
    const approving = dismissOpenPermissionsForSession("session-a")
    const answering = dismissOpenFormsForSession("session-a")
    expect(store.getState().permission["session-a"]).toBeUndefined()
    expect(store.getState().form.child).toBeUndefined()
    expect(duplicate.getState().permission.child).toBeUndefined()
    expect(approve).toHaveBeenCalledTimes(2)
    expect(answer).toHaveBeenCalledTimes(2)
    gate.resolve()
    expect(await approving).toBe(true)
    expect(await answering).toBe(true)
    expect(store.getState().permission.unrelated).toEqual([unrelatedApproval])
    expect(store.getState().form.unrelated).toEqual([unrelatedQuestion])
  })

  for (const kind of ["approval", "question"] as const) {
    test(`${kind} dismissal restores an unresolved card only when snapshot recovery also fails`, async () => {
      const store = requests()
      spyOn(canonicalClient, "getSnapshot").mockRejectedValue(new Error("snapshot offline"))
      spyOn(canonicalClient, "respondApproval").mockRejectedValue(new Error("reply offline"))
      spyOn(canonicalClient, "respondQuestion").mockRejectedValue(new Error("reply offline"))
      const pending = kind === "approval" ? dismissOpenPermissionsForSession("session-a") : dismissOpenFormsForSession("session-a")
      expect(kind === "approval" ? store.getState().permission["session-a"] : store.getState().form["session-a"]).toBeUndefined()
      expect(await pending).toBe(true)
      expect(kind === "approval" ? store.getState().permission["session-a"] : store.getState().form["session-a"]).toEqual([kind === "approval" ? approval : question])
    })

    test(`${kind} dismissal accepts an authoritative empty pending set instead of restoring stale cards`, async () => {
      const store = requests()
      spyOn(canonicalClient, "getSnapshot").mockResolvedValue(nativeSnapshot("session-a", []))
      spyOn(canonicalClient, "respondApproval").mockRejectedValue(new Error("reply offline"))
      spyOn(canonicalClient, "respondQuestion").mockRejectedValue(new Error("reply offline"))
      expect(await (kind === "approval" ? dismissOpenPermissionsForSession("session-a") : dismissOpenFormsForSession("session-a"))).toBe(true)
      expect(kind === "approval" ? store.getState().permission["session-a"] : store.getState().form["session-a"]).toEqual([])
    })

    test(`${kind} dismissal never restores a card after the session epoch changes`, async () => {
      const store = requests()
      const failed = async () => { store.setState({ session: [session("session-a", { epoch: "new-epoch" })] }); throw new Error("offline") }
      spyOn(canonicalClient, "respondApproval").mockImplementation(failed)
      spyOn(canonicalClient, "respondQuestion").mockImplementation(failed)
      spyOn(canonicalClient, "getSnapshot").mockRejectedValue(new Error("snapshot offline"))
      expect(await (kind === "approval" ? dismissOpenPermissionsForSession("session-a") : dismissOpenFormsForSession("session-a"))).toBe(true)
      expect(kind === "approval" ? store.getState().permission["session-a"] : store.getState().form["session-a"]).toBeUndefined()
    })

    test(`${kind} dismissal never restores a card after a confirmed session deletion`, async () => {
      const store = requests()
      const failed = async () => { store.setState({ sessionDeletedRevision: { "session-a": 2 } }); throw new Error("offline") }
      spyOn(canonicalClient, "respondApproval").mockImplementation(failed)
      spyOn(canonicalClient, "respondQuestion").mockImplementation(failed)
      spyOn(canonicalClient, "getSnapshot").mockRejectedValue(new Error("snapshot offline"))
      expect(await (kind === "approval" ? dismissOpenPermissionsForSession("session-a") : dismissOpenFormsForSession("session-a"))).toBe(true)
      expect(kind === "approval" ? store.getState().permission["session-a"] : store.getState().form["session-a"]).toBeUndefined()
    })
  }

  test("a pending reply resolved after runtime replacement leaves current cards unchanged", async () => {
    const store = requests()
    const response = deferred<ApprovalRequest>()
    const started = deferred<void>()
    spyOn(canonicalClient, "respondApproval").mockImplementation(() => { started.resolve(); return response.promise })
    const pending = respondToPermission("session-a", approval.approvalId, "once")
    await started.promise
    changeRuntime()
    response.resolve({ ...approval, status: "approved", version: "2", resolvedAt: 2, resolution: { decision: "approve" } })
    await expect(pending).rejects.toThrow("runtime changed")
    expect(store.getState().permission["session-a"]).toEqual([approval])
  })

  test("no pending subtree work returns false without remote replies", async () => {
    seed()
    const approve = spyOn(canonicalClient, "respondApproval")
    const answer = spyOn(canonicalClient, "respondQuestion")
    expect(await dismissOpenPermissionsForSession("session-a")).toBe(false)
    expect(await dismissOpenFormsForSession("session-a")).toBe(false)
    expect(approve).not.toHaveBeenCalled()
    expect(answer).not.toHaveBeenCalled()
  })
})

describe("native metadata publication", () => {
  test("title updates go through OMP and publish the returned title", async () => {
    const store = seed()
    const rename = spyOn(canonicalClient, "renameSession").mockResolvedValue({ ...session(), title: "Renamed" })
    await updateSessionTitle("session-a", "Renamed")
    expect(rename).toHaveBeenCalledWith("session-a", "workspace-a", "Renamed")
    expect(store.getState().session[0].title).toBe("Renamed")
    expect(useGlobalSessionsStore.getState().entityById.get("session-a")?.title).toBe("Renamed")
  })

  test("native metadata patches preserve siblings and encode removals as merge-patch null", async () => {
    const original = session("session-a", { title: "Before", metadata: { notes: "remove", openchamber: { work: { state: "open" }, linked_issues: [] } } })
    const store = seed([original])
    spyOn(canonicalClient, "getSessionMetadata").mockResolvedValue({ sessionId: "session-a", revision: "1", metadata: original.metadata })
    const write = spyOn(canonicalClient, "patchSessionMetadata").mockResolvedValue({ sessionId: "session-a", revision: "2", metadata: { openchamber: { work: { state: "done" }, linked_issues: [] } } })
    await patchSessionMetadata("session-a", directory, metadata => {
      const next = SessionMetadataSchema.parse(metadata)
      delete next.notes
      return { ...next, openchamber: { ...next.openchamber, work: { state: "done" } } }
    })
    expect(write).toHaveBeenCalledWith("session-a", { changes: { notes: null, openchamber: { work: { state: "done" } } } })
    expect(store.getState().session[0].title).toBe("Before")
  })

  test("work state writes use the native metadata contract", async () => {
    seed()
    const write = spyOn(canonicalClient, "patchSessionMetadata").mockResolvedValue({ sessionId: "session-a", revision: "2", metadata: { openchamber: { work: { state: "open" } } } })
    await setSessionWorkState("session-a", directory, "open")
    expect(write).toHaveBeenCalledWith("session-a", { changes: { openchamber: { work: { state: "open", openedAt: expect.any(Number), openedBy: "user" } } } })
  })

  test("a stale metadata read never writes to the replacement runtime", async () => {
    seed()
    spyOn(canonicalClient, "getSessionMetadata").mockImplementation(async sessionId => { changeRuntime(); return { sessionId, revision: "0", metadata: null } })
    const write = spyOn(canonicalClient, "patchSessionMetadata")
    expect(await setSessionWorkState("session-a", directory, "open")).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

  test("metadata patch does not write after an A-B-A switch during its Host read", async () => {
    const store = seed()
    const pending = deferred<{ sessionId: string; revision: string; metadata: null }>()
    spyOn(canonicalClient, "getSessionMetadata").mockImplementation(() => pending.promise)
    const write = spyOn(canonicalClient, "patchSessionMetadata")
    const operation = patchSessionMetadata("session-a", directory, metadata => ({ ...metadata, title: "stale" }))
    changeRuntime()
    switchRuntimeEndpoint({ apiBaseUrl: "https://actions.test", runtimeKey: "actions" })
    pending.resolve({ sessionId: "session-a", revision: "1", metadata: null })
    await expect(operation).rejects.toThrow("runtime changed")
    expect(write).not.toHaveBeenCalled()
    expect(store.getState().session[0].title).toBe("Before")
  })

  test("an obsolete title response cannot overwrite live state", async () => {
    const store = seed()
    spyOn(canonicalClient, "renameSession").mockImplementation(async () => {
      changeRuntime()
      return { ...session(), title: "Old runtime" }
    })
    await expect(updateSessionTitle("session-a", "Old runtime")).rejects.toThrow("runtime changed")
    expect(store.getState().session[0].title).toBe("Before")
  })
})

describe("native selected-branch forks", () => {
  function prepareFork() {
    const source = session()
    const fork = session("fork", { metadata: null, metadataRevision: "0" })
    const store = seed([source])
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(nativeSnapshot())
    spyOn(canonicalClient, "patchSessionMetadata").mockResolvedValue({ sessionId: fork.sessionId, revision: "1", metadata: {} })
    const create = spyOn(canonicalClient, "forkSession").mockResolvedValue({ session: fork })
    return { store, source, fork, create }
  }

  test("forks the selected native message and opens it in the mapped workspace", async () => {
    const { store, fork } = prepareFork()
    await forkFromMessage("session-a", "message-a")
    expect(store.getState().session.some(item => item.sessionId === fork.sessionId)).toBe(true)
    expect(useSessionUIStore.getState().currentSessionId).toBe(fork.sessionId)
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(directory)
  })

  test("a failed fork leaves the source and selection unchanged", async () => {
    const { store, source, create } = prepareFork()
    create.mockRejectedValue(new Error("fork failed"))
    await expect(forkAfterMessage("session-a", "message-a")).rejects.toThrow("fork failed")
    expect(store.getState().session).toEqual([source])
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
  })

  test("a fork returned after a runtime switch is not inserted or selected", async () => {
    const { store, source, fork, create } = prepareFork()
    create.mockImplementation(async () => { changeRuntime(); return { session: fork } })
    expect(await forkAfterMessage("session-a", "message-a")).toBeNull()
    expect(store.getState().session).toEqual([source])
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
  })

  test("rejects a fork returned in an unrelated workspace", async () => {
    const { store, source, fork, create } = prepareFork()
    create.mockResolvedValue({ session: { ...fork, workspaceId: "other-workspace" } })
    await expect(forkAfterMessage("session-a", "message-a")).rejects.toThrow("source workspace")
    expect(store.getState().session).toEqual([source])
  })

  test("last-completed-turn fork uses native Turn status, not the presence of assistant text", async () => {
    const { create, fork } = prepareFork()
    const completedUser = nativeMessage("session-a", "finished-user", 1)
    const completed = { ...nativeMessage("session-a", "finished", 2, "assistant"), turnId: completedUser.turnId }
    const runningUser = nativeMessage("session-a", "running-user", 3)
    const running = { ...nativeMessage("session-a", "streaming", 4, "assistant"), turnId: runningUser.turnId }
    const snapshot = nativeSnapshot("session-a", [completedUser, completed, runningUser, running])
    snapshot.turns = [
      { turnId: completedUser.turnId, sessionId: "session-a", runId: "run-a", status: "completed", userMessageId: completedUser.messageId, assistantMessageIds: [completed.messageId], startedAt: 1, finishedAt: 2 },
      { turnId: runningUser.turnId, sessionId: "session-a", runId: "run-b", status: "running", userMessageId: runningUser.messageId, assistantMessageIds: [running.messageId], startedAt: 3 },
    ]
    snapshot.session = { ...snapshot.session, runtimeStatus: "running", activeRunId: "run-b" }
    snapshot.activeRun = { sessionId: "session-a", runId: "run-b", status: "running", origin: "host", createdAt: 3 }
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    const result = await forkFromLastCompletedTurn("session-a")
    expect(result?.sessionId).toBe(fork.sessionId)
    expect(create).toHaveBeenCalled()
  })

  test("searches earlier native history when the current window has no completed turn", async () => {
    const { create, fork } = prepareFork()
    const current = nativeMessage("session-a", "current-user", 3)
    const snapshot = nativeSnapshot("session-a", [current])
    snapshot.session = { ...snapshot.session, runtimeStatus: "running", activeRunId: "run-b" }
    snapshot.activeRun = { sessionId: "session-a", runId: "run-b", status: "running", origin: "host", createdAt: 3 }
    snapshot.turns = [{ turnId: current.turnId, sessionId: "session-a", runId: "run-b", status: "running", userMessageId: current.messageId, assistantMessageIds: [], startedAt: 3 }]
    snapshot.window.hasEarlier = true
    const user = nativeMessage("session-a", "older-user", 1)
    const completed = { ...nativeMessage("session-a", "older-answer", 2, "assistant"), turnId: user.turnId }
    const page = nativeHistory([user, completed], null, snapshot)
    page.turns = [{ turnId: user.turnId, sessionId: "session-a", runId: "run-a", status: "completed", userMessageId: user.messageId, assistantMessageIds: [completed.messageId], startedAt: 1, finishedAt: 2 }]
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(snapshot)
    const history = spyOn(canonicalClient, "getHistory").mockResolvedValue(page)
    const result = await forkFromLastCompletedTurn("session-a")
    expect(history).toHaveBeenCalledTimes(1)
    expect(result?.sessionId).toBe(fork.sessionId)
    expect(create).toHaveBeenCalled()
  })

  test("no completed native turn refuses the fork without issuing a command", async () => {
    const { create } = prepareFork()
    spyOn(canonicalClient, "getSnapshot").mockResolvedValue(nativeSnapshot("session-a", []))
    await expect(forkFromLastCompletedTurn("session-a")).rejects.toBeInstanceOf(NothingToForkError)
    expect(create).not.toHaveBeenCalled()
  })
})

describe("review-flow optimistic send", () => {
  function canonicalUserMessage(sessionId: string, messageId: string, content: string, createdAt = 10): Message {
    return {
      messageId, sessionId, turnId: `turn-${messageId}`, role: "user", createdAt,
      parts: [{ type: "text", partId: `part-${messageId}`, content }],
    }
  }

  function reviewRun(runId = "run-review"): Run {
    return { runId, sessionId: "session-a", status: "running", origin: "host", createdAt: 2 }
  }

  function runTurn(run: Run, userMessage: Message): Turn {
    return {
      turnId: userMessage.turnId, sessionId: userMessage.sessionId, runId: run.runId, status: "running",
      userMessageId: userMessage.messageId, assistantMessageIds: [], startedAt: userMessage.createdAt,
    }
  }

  function snapshotWithRun(run: Run, userMessage: Message): SessionSnapshot {
    const snapshot = nativeSnapshot("session-a", [userMessage])
    snapshot.turns = [runTurn(run, userMessage)]
    snapshot.session = { ...snapshot.session, runtimeStatus: "running", activeRunId: run.runId }
    snapshot.activeRun = run
    return snapshot
  }

  function useOptimisticLoader(getSnapshot: () => Promise<SessionSnapshot>): void {
    const optimisticLoader = new SessionMessageLoader(manager, { runtimeKey: "actions", client: nativeClient({ getSnapshot }) })
    loader = optimisticLoader
    setImperativeSessionMessageLoader(optimisticLoader)
    setOptimisticRefs(
      (input) => optimisticLoader.optimisticAdd({ ...input, directory: input.directory || directory }),
      (input) => optimisticLoader.optimisticRemove({ ...input, directory: input.directory || directory }),
      (input) => optimisticLoader.optimisticConfirm({ ...input, directory: input.directory || directory }),
    )
  }

  test("inserts its pending user message before transport settles and removes only that record on a definite failure", async () => {
    const existing = canonicalUserMessage("session-a", "existing", "Earlier prompt", 1)
    const store = seed()
    store.setState({ message: { "session-a": [existing] } })
    useOptimisticLoader(async () => nativeSnapshot("session-a", [existing]))

    let pendingId = ""
    let duringSend: Message[] = []
    await expect(optimisticSend({
      sessionId: "session-a",
      directory,
      content: "Review feedback",
      onMessageID: (messageId) => { pendingId = messageId },
      send: async () => {
        duringSend = store.getState().message["session-a"] ?? []
        throw new Error("rejected")
      },
    })).rejects.toThrow("rejected")

    const pending = duringSend.filter((message) => message.messageId === pendingId)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.role).toBe("user")
    expect(pending[0]?.parts).toEqual([{ type: "text", partId: expect.any(String), content: "Review feedback" }])
    expect(store.getState().message["session-a"]).toEqual([existing])
  })

  test("reconciles an accepted send with the canonical history read without duplicating it", async () => {
    const run = reviewRun()
    const canonical = canonicalUserMessage("session-a", "canonical-user", "Review feedback", 20)
    const store = seed()
    let snapshot = nativeSnapshot("session-a", [])
    useOptimisticLoader(async () => snapshot)

    await optimisticSend({
      sessionId: "session-a",
      directory,
      content: "Review feedback",
      send: async () => {
        snapshot = snapshotWithRun(run, canonical)
        return run
      },
    })

    expect(store.getState().message["session-a"]).toEqual([canonical])
  })

  test("keeps an accepted pending record until the canonical turn arrives, then removes it without duplication", async () => {
    const run = reviewRun()
    const store = seed()
    let snapshot = nativeSnapshot("session-a", [])
    useOptimisticLoader(async () => snapshot)

    await optimisticSend({
      sessionId: "session-a",
      directory,
      content: "Review feedback",
      send: async () => run,
    })

    const pending = store.getState().message["session-a"] ?? []
    expect(pending).toHaveLength(1)
    expect(pending[0]?.role).toBe("user")

    const canonical = canonicalUserMessage("session-a", "canonical-user", "Review feedback", 20)
    snapshot = snapshotWithRun(run, canonical)
    store.setState((state) => ({
      message: { ...state.message, "session-a": [...(state.message["session-a"] ?? []), canonical] },
      snapshot: { ...state.snapshot, "session-a": snapshot },
    }))
    expect(store.getState().message["session-a"]).toEqual([canonical])
  })

  test("does not mistake an earlier identical user message for this send's canonical record", async () => {
    const run = reviewRun()
    const existing = canonicalUserMessage("session-a", "existing", "Review feedback", 1)
    const canonical = canonicalUserMessage("session-a", "canonical-user", "Review feedback", 20)
    const store = seed()
    store.setState({ message: { "session-a": [existing] } })
    let snapshot = nativeSnapshot("session-a", [existing])
    useOptimisticLoader(async () => snapshot)

    await optimisticSend({
      sessionId: "session-a",
      directory,
      content: "Review feedback",
      send: async () => run,
    })

    const accepted = store.getState().message["session-a"] ?? []
    expect(accepted).toHaveLength(2)
    expect(accepted[0]).toEqual(existing)

    snapshot = snapshotWithRun(run, canonical)
    store.setState((state) => ({
      message: { ...state.message, "session-a": [...(state.message["session-a"] ?? []), canonical] },
      snapshot: { ...state.snapshot, "session-a": snapshot },
    }))
    expect(store.getState().message["session-a"]).toEqual([existing, canonical])
  })
  test("normal send path renders user message before createRun resolves and reconciles once accepted", async () => {
    const store = seed()
    let duringSend: Message[] = []
    const createRunDeferred = Promise.withResolvers<{ run: Run }>()
    spyOn(canonicalClient, "createRun").mockImplementation(async () => {
      duringSend = store.getState().message["session-a"] ?? []
      return createRunDeferred.promise
    })

    const run: Run = { runId: "run-normal", sessionId: "session-a", status: "running", origin: "host", createdAt: 1 }
    const promptRequest: PromptRequest = {
      input: { text: "Optimistic user prompt", attachments: [], context: [] },
      options: { providerId: "provider-a", modelId: "model-a", agentId: null, variant: null, reasoningEffort: null },
    }

    useOptimisticLoader(async () => nativeSnapshot("session-a", []))

    const streamAttached: string[] = []
    setActionRefs(manager, () => currentDirectory, undefined, (sessionId) => {
      streamAttached.push(sessionId)
    })

    const sendPromise = sendMessage({
      sessionId: "session-a",
      directory,
      request: promptRequest,
      optimistic: true,
    })
    await Promise.resolve()

    expect(streamAttached).toEqual(["session-a"])
    expect(duringSend).toHaveLength(1)
    expect(duringSend[0]?.role).toBe("user")
    expect(duringSend[0]?.parts).toEqual([{ type: "text", partId: expect.any(String), content: "Optimistic user prompt" }])

    createRunDeferred.resolve({ run })
    const acceptedRun = await sendPromise
    expect(acceptedRun).toEqual(run)

    expect(store.getState().message["session-a"]).toHaveLength(1)

    const canonical = canonicalUserMessage("session-a", "canonical-normal-user", "Optimistic user prompt", 10)
    const snapshot = snapshotWithRun(run, canonical)
    store.setState((state) => ({
      message: { ...state.message, "session-a": [...(state.message["session-a"] ?? []), canonical] },
      snapshot: { ...state.snapshot, "session-a": snapshot },
    }))

    expect(store.getState().message["session-a"]).toEqual([canonical])
  })

  test("failed normal send removes optimistic message and records send failure", async () => {
    const store = seed()
    let duringSend: Message[] = []
    spyOn(canonicalClient, "createRun").mockImplementation(async () => {
      duringSend = store.getState().message["session-a"] ?? []
      throw new Error("createRun network failure")
    })

    const promptRequest: PromptRequest = {
      input: { text: "Will fail", attachments: [], context: [] },
      options: { providerId: "provider-a", modelId: "model-a", agentId: null, variant: null, reasoningEffort: null },
    }

    useOptimisticLoader(async () => nativeSnapshot("session-a", []))

    await expect(sendMessage({
      sessionId: "session-a",
      directory,
      request: promptRequest,
      optimistic: true,
    })).rejects.toThrow("createRun network failure")

    expect(duringSend).toHaveLength(1)
    expect(store.getState().message["session-a"]).toEqual([])
  })
})

describe("linking items through the server", () => {
  const issue: LinkedIssue = {
    id: "owner/repo#12",
    number: 12,
    title: "Rail badge count",
    url: "https://github.com/owner/repo/issues/12",
    kind: "issue",
    author: "someone",
    linkedAt: 1,
  }
  const guestEntry: LinkedIssue = {
    id: "guest:linear:ENG-1",
    providerId: "linear",
    identifier: "ENG-1",
    title: "Spec",
    url: "https://linear.app/openchamber/issue/ENG-1",
    kind: "guest",
    thread: "issue",
    linkedAt: 2,
  }

  test("sends the operation to the links route and mirrors the answer into the stores", async () => {
    const store = seed()
    // The metadata is what the server answered, not a list the client computed
    // from its own read.
    const metadata = { openchamber: { linked_issues: [issue, guestEntry] } }
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ metadata }))

    const updated = await setLinkedIssue("session-a", directory, guestEntry, true)

    const calls = fetch.mock.calls.filter(([input]) => String(input).includes("/sessions/session-a/links"))
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ entries: [guestEntry], linked: true })
    expect(updated.metadata).toEqual(metadata)
    expect(useGlobalSessionsStore.getState().entityById.get("session-a")?.metadata).toEqual(metadata)
    expect(store.getState().session[0]?.metadata).toEqual(metadata)
  })

  test("adds every item of a batch in one request", async () => {
    seed()
    const metadata = { openchamber: { linked_issues: [issue, guestEntry] } }
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ metadata }))

    await addLinkedIssues("session-a", directory, [issue, guestEntry])

    const calls = fetch.mock.calls.filter(([input]) => String(input).includes("/sessions/session-a/links"))
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ entries: [issue, guestEntry], linked: true })
  })

  test("serializes Linear in its documented stored form alongside neutral tracker links", async () => {
    seed()
    const linear: LinkedIssue = { id: "linear:ENG-3", kind: "tracker", provider: "linear", identifier: "ENG-3", title: "Spec", url: "https://linear.app/x/issue/ENG-3", linkedAt: 3 }
    const tracker: LinkedIssue = { id: "jira:OPS-4", kind: "tracker", provider: "jira", identifier: "OPS-4", title: "Outage", url: "https://jira.example/browse/OPS-4", linkedAt: 4 }
    const storedLinear = { ...linear, kind: "linear" }
    const metadata = { openchamber: { linked_issues: [issue, storedLinear, tracker] } }
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ metadata }))

    const updated = await addLinkedIssues("session-a", directory, [issue, linear, tracker])

    const calls = fetch.mock.calls.filter(([input]) => String(input).includes("/sessions/session-a/links"))
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ entries: [issue, storedLinear, tracker], linked: true })
    expect(updated.metadata).toEqual(metadata)
  })

  test("rejects when the server cannot serve the route, like the callers' catch expects", async () => {
    seed()
    spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }))

    await expect(setLinkedIssue("session-a", directory, issue, true))
      .rejects.toThrow("session link update failed")
  })

  test("treats a malformed answer as unavailable instead of as a success", async () => {
    seed()
    spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ nope: true }))

    await expect(setLinkedIssue("session-a", directory, issue, true))
      .rejects.toThrow("session link update failed")
  })
})
