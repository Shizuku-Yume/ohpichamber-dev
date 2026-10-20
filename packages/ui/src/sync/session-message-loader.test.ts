import { afterEach, describe, expect, test } from "bun:test"
import type { HistoryPage, SessionSnapshot } from "@openchamber/agent-contract"
import { ChildStoreManager } from "./child-store"
import { SessionMessageLoader, type LoaderConfiguration } from "./session-message-loader"
import { deferred, nativeApproval, nativeClient, nativeHistory, nativeHostSession, nativeMessage, nativeQuestion, nativeSnapshot } from "./session-message-loader-test-fixtures"
import { clearRuntimeSessionPrefetch, getSessionPrefetch, setSessionPrefetch } from "./session-prefetch-cache"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
const target = { directory: "/loader-repo", sessionId: "session-a" }

function setup(configuration: Partial<LoaderConfiguration> = {}) {
  const childStores = new ChildStoreManager()
  const client = configuration.client ?? nativeClient()
  const loader = new SessionMessageLoader(childStores, { runtimeKey: "runtime-a", ...configuration, client })
  const store = childStores.ensureChild(target.directory, { bootstrap: false })
  cleanups.push(() => { loader.dispose(); childStores.disposeAll() })
  return { childStores, client, loader, store }
}

function historyWindow(): SessionSnapshot {
  const snapshot = nativeSnapshot(target.sessionId, Array.from({ length: 10 }, (_, index) => nativeMessage(target.sessionId, `new-${index}`, index + 20)))
  snapshot.window.hasEarlier = true
  return snapshot
}

describe("canonical session snapshot loading", () => {
  test("deduplicates foreground and speculative demands", async () => {
    const pending = deferred<SessionSnapshot>()
    let calls = 0
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: () => { calls += 1; return pending.promise } }) })
    const prefetch = loader.prefetch(target)
    const navigation = loader.ensure(target, { reason: "navigation" })
    expect(calls).toBe(1)
    expect(prefetch).toBe(navigation)
    pending.resolve(nativeSnapshot())
    await navigation
    expect(store.getState().message[target.sessionId]).toEqual(nativeSnapshot().messages)
    expect(loader.getSnapshot(target)).toMatchObject({ status: "ready", complete: true, resolved: true })
    await loader.ensure(target)
    expect(calls).toBe(1)
  })

  test("commits recovery snapshot atomically before reporting the exact SSE cursor", async () => {
    const recovered = nativeSnapshot()
    recovered.session.epoch = "epoch-recovered"
    recovered.session.headSequence = "10000000000000000"
    recovered.cursor = "epoch-recovered:10000000000000000"
    recovered.approvals = [nativeApproval(target.sessionId, recovered.session.epoch)]
    recovered.questions = [nativeQuestion(target.sessionId, recovered.session.epoch)]
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => recovered }) })
    store.setState({ message: { [target.sessionId]: [nativeMessage(target.sessionId, "old-message")] }, permission: { [target.sessionId]: [nativeApproval()] }, form: { [target.sessionId]: [nativeQuestion()] } })
    const publications: string[][] = []
    store.subscribe(state => { publications.push(state.message[target.sessionId]?.map(message => message.messageId) ?? []) })
    let callbacks = 0
    loader.configure({ client: nativeClient({ getSnapshot: async () => recovered }), runtimeKey: "runtime-a", onSnapshot: (reportedTarget, snapshot) => {
      callbacks += 1
      expect(reportedTarget).toEqual(target)
      expect(snapshot).toBe(recovered)
      expect(snapshot.cursor).toBe("epoch-recovered:10000000000000000")
      expect(store.getState().snapshot[target.sessionId]?.session.epoch).toBe("epoch-recovered")
      expect(store.getState().sessionCursor[target.sessionId]).toBe(snapshot.cursor)
      expect(store.getState().message[target.sessionId]).toEqual(recovered.messages)
      expect(store.getState().permission[target.sessionId]).toEqual(recovered.approvals)
      expect(store.getState().form[target.sessionId]).toEqual(recovered.questions)
    } })
    await loader.refresh(target)
    expect(callbacks).toBe(1)
    expect(publications.every(ids => !ids.includes("old-message"))).toBe(true)
    expect(loader.getSnapshot(target).cursor).toBeUndefined()
  })

  test("keeps a recovery refresh behind an in-flight initial snapshot load", async () => {
    const initial = nativeSnapshot()
    const recovered = { ...initial, session: { ...initial.session, headSequence: "5" }, cursor: `${initial.session.epoch}:5` }
    const pending = deferred<SessionSnapshot>()
    let calls = 0
    const seen: Array<{ previous?: string; current: string }> = []
    const { loader, store } = setup({
      client: nativeClient({ getSnapshot: async () => (++calls === 1 ? pending.promise : recovered) }),
      onSnapshot: (_target, snapshot, previous) => {
        seen.push({ previous: previous?.session.headSequence, current: snapshot.session.headSequence })
      },
    })
    const initialLoad = loader.ensure(target)
    const recovery = loader.refresh(target, undefined, { recovered: true })
    expect(recovery).not.toBe(initialLoad)
    pending.resolve(initial)
    await initialLoad
    await recovery
    expect(seen).toEqual([{ previous: undefined, current: "4" }, { previous: "4", current: "5" }])
    expect(store.getState().snapshot[target.sessionId]?.session.headSequence).toBe("5")
  })

  test("snapshot failure preserves authoritative state and reports one load failure without retry", async () => {
    let calls = 0
    const error = new Error("Host unavailable")
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => { calls += 1; throw error } }) })
    const old = nativeSnapshot()
    const host = nativeHostSession(old)
    store.setState({ snapshot: { [target.sessionId]: old }, message: { [target.sessionId]: old.messages }, session: [host], queue: { [target.sessionId]: { sessionId: target.sessionId, revision: "9", items: [] } } })
    const before = store.getState()
    await loader.refresh(target)
    expect(store.getState()).toBe(before)
    expect(loader.getSnapshot(target)).toMatchObject({ status: "error", error })
    expect(calls).toBe(1)
  })

  test("metadata and queue failures leave cached Host authorities intact while runtime recovers", async () => {
    const snapshot = nativeSnapshot()
    const host = nativeHostSession(snapshot)
    const queue = { sessionId: target.sessionId, revision: "9", items: [] }
    const { loader, store } = setup({ client: nativeClient({ getSessionMetadata: async () => { throw new Error("metadata failed") }, getQueue: async () => { throw new Error("queue failed") } }) })
    store.setState({ session: [host], queue: { [target.sessionId]: queue } })
    await loader.ensure(target)
    expect(store.getState().session[0]?.metadata).toBe(host.metadata)
    expect(store.getState().session[0]?.metadataRevision).toBe("5")
    expect(store.getState().session[0]?.archiveRevision).toBe("8")
    expect(store.getState().session[0]?.archivedAt).toBe(3)
    expect(store.getState().queue[target.sessionId]).toBe(queue)
    expect(loader.getSnapshot(target).status).toBe("ready")
  })

  test("one failed Host read does not prevent the other independent authority from updating", async () => {
    const { loader, store } = setup({ client: nativeClient({ getSessionMetadata: async () => { throw new Error("metadata failed") }, getQueue: async sessionId => ({ sessionId, revision: "10", items: [] }) }) })
    store.setState({ session: [nativeHostSession()], queue: { [target.sessionId]: { sessionId: target.sessionId, revision: "9", items: [] } } })
    await loader.ensure(target)
    expect(store.getState().session[0]?.metadataRevision).toBe("5")
    expect(store.getState().queue[target.sessionId]?.revision).toBe("10")
  })

  test("missing Host projection uses a native session list, without synthesized metadata or archive", async () => {
    const host = nativeHostSession()
    const { loader, store } = setup({ client: nativeClient({ listSessions: async workspaceId => { expect(workspaceId).toBe("workspace-a"); return { items: [host], errors: {} } } }) })
    await loader.ensure(target)
    expect(store.getState().session[0]).toMatchObject({ metadata: host.metadata, metadataRevision: "5", archiveRevision: "8", archivedAt: 3 })
    const unprojected = { ...target, sessionId: "session-unprojected" }
    const failing = setup({ client: nativeClient({ listSessions: async () => { throw new Error("discovery failed") } }) })
    // Directory managers hydrate the same persisted Host projection. A failed
    // discovery for another session must not erase this valid sibling.
    const priorSibling = failing.store.getState().session.find(item => item.sessionId === target.sessionId)
    expect(priorSibling).toEqual(store.getState().session.find(item => item.sessionId === target.sessionId))
    await failing.loader.ensure(unprojected)
    expect(failing.store.getState().session.find(item => item.sessionId === unprojected.sessionId)).toBeUndefined()
    expect(failing.store.getState().session.find(item => item.sessionId === target.sessionId)).toBe(priorSibling)
    expect(failing.store.getState().snapshot[unprojected.sessionId]).toBeDefined()
  })

  test("metadata and archive revisions reconcile independently and never regress", async () => {
    const oldHost = nativeHostSession()
    const incoming = { ...oldHost, metadata: { title: "New title" }, metadataRevision: "6", archiveRevision: "1", archivedAt: undefined }
    const { loader, store } = setup({ client: nativeClient({ listSessions: async () => ({ items: [incoming], errors: {} }), getSessionMetadata: async sessionId => ({ sessionId, metadata: { title: "Newer title" }, revision: "7" }) }) })
    // A concurrent projection arrives while the missing-session list request is in flight.
    const list = deferred<{ items: typeof incoming[]; errors: Record<string, never> }>()
    const client = nativeClient({ listSessions: () => list.promise, getSessionMetadata: async sessionId => ({ sessionId, metadata: { title: "Newer title" }, revision: "7" }) })
    loader.configure({ client, runtimeKey: "runtime-a" })
    const load = loader.ensure(target)
    await Promise.resolve()
    await Promise.resolve()
    store.setState({ session: [oldHost] })
    list.resolve({ items: [incoming], errors: {} })
    await load
    expect(store.getState().session[0]?.metadata?.title).toBe("Newer title")
    expect(store.getState().session[0]?.metadataRevision).toBe("7")
    expect(store.getState().session[0]?.archiveRevision).toBe("8")
    expect(store.getState().session[0]?.archivedAt).toBe(3)
  })

  test("rejects snapshot responses from an obsolete runtime", async () => {
    const pending = deferred<SessionSnapshot>()
    let callbacks = 0
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: () => pending.promise }), onSnapshot: () => { callbacks += 1 } })
    const oldLoad = loader.ensure(target)
    loader.configure({ client: nativeClient({ getSnapshot: async () => nativeSnapshot(target.sessionId, [nativeMessage(target.sessionId, "current")]) }), runtimeKey: "runtime-b", onSnapshot: () => { callbacks += 1 } })
    await loader.ensure(target)
    pending.resolve(nativeSnapshot(target.sessionId, [nativeMessage(target.sessionId, "obsolete")]))
    await oldLoad
    expect(store.getState().message[target.sessionId]?.map(message => message.messageId)).toEqual(["current"])
    expect(callbacks).toBe(1)
  })

  test("rejects a response after directory store identity changes", async () => {
    const pending = deferred<SessionSnapshot>()
    const { loader, childStores, store } = setup({ client: nativeClient({ getSnapshot: () => pending.promise }) })
    const load = loader.ensure(target)
    expect(childStores.disposeDirectory(target.directory)).toBe(true)
    const replacement = childStores.ensureChild(target.directory, { bootstrap: false })
    pending.resolve(nativeSnapshot())
    await load
    expect(replacement).not.toBe(store)
    expect(replacement.getState().message[target.sessionId]).toBeUndefined()
    expect(store.getState().message[target.sessionId]).toBeUndefined()
  })

  test("clearDirectory and session invalidation reject stale generations", async () => {
    for (const scope of ["directory", "session"] as const) {
      const pending = deferred<SessionSnapshot>()
      const { loader, store } = setup({ client: nativeClient({ getSnapshot: () => pending.promise }) })
      const load = loader.ensure(target)
      if (scope === "directory") loader.clearDirectory(target.directory)
      else loader.invalidateSession(target)
      pending.resolve(nativeSnapshot())
      await load
      expect(store.getState().message[target.sessionId]).toBeUndefined()
      expect(loader.getSnapshot(target).resolved).toBe(false)
    }
  })

  test("isCurrent rejects late snapshot and Host writes", async () => {
    const pending = deferred<SessionSnapshot>()
    let current = true
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: () => pending.promise }), isCurrent: () => current })
    const load = loader.ensure(target)
    current = false
    pending.resolve(nativeSnapshot())
    await load
    expect(store.getState().message[target.sessionId]).toBeUndefined()
  })

  test("late independent Host reads cannot publish into another runtime", async () => {
    const metadata = deferred<{ sessionId: string; revision: string; metadata: { title: string } }>()
    const { loader, store } = setup({ client: nativeClient({ getSessionMetadata: () => metadata.promise }) })
    store.setState({ session: [nativeHostSession()] })
    const load = loader.ensure(target)
    await Promise.resolve()
    await Promise.resolve()
    loader.configure({ client: nativeClient(), runtimeKey: "runtime-b" })
    metadata.resolve({ sessionId: target.sessionId, revision: "100", metadata: { title: "Obsolete" } })
    await load
    expect(store.getState().session[0]?.metadata?.title).toBe("Saved title")
  })
  test("does not resurrect a session deleted while its snapshot was in flight", async () => {
    const pending = deferred<SessionSnapshot>()
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: () => pending.promise }) })
    const load = loader.ensure(target)
    store.setState({ sessionRevision: 1, sessionDeletedRevision: { [target.sessionId]: 1 } })
    pending.resolve(nativeSnapshot())
    await load
    expect(store.getState().message[target.sessionId]).toBeUndefined()
    expect(loader.getSnapshot(target)).toMatchObject({ status: "idle", resolved: false })
  })

})

describe("native history coverage", () => {
  test("a history demand waits for initial materialization and then loads older records", async () => {
    const pending = deferred<SessionSnapshot>()
    const snapshot = historyWindow()
    const older = nativeMessage(target.sessionId, "older-after-initial", 0)
    let calls = 0
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: () => pending.promise, getHistory: async () => ++calls === 1 ? nativeHistory(snapshot.messages, "older", snapshot) : nativeHistory([older], null, snapshot) }) })
    const initial = loader.ensure(target)
    const history = loader.loadOlder(target)
    pending.resolve(snapshot)
    await Promise.all([initial, history])
    expect(calls).toBe(2)
    expect(store.getState().message[target.sessionId]?.[0]).toBe(older)
    expect(loader.getSnapshot(target).complete).toBe(true)
  })

  test("a queued history demand cannot cross runtime reconfiguration", async () => {
    const pending = deferred<SessionSnapshot>()
    let calls = 0
    const { loader } = setup({ client: nativeClient({ getSnapshot: () => pending.promise, getHistory: async () => { calls += 1; return nativeHistory([]) } }) })
    const initial = loader.ensure(target)
    const history = loader.loadOlder(target)
    loader.configure({ runtimeKey: "replacement-runtime", client: nativeClient() })
    pending.resolve(historyWindow())
    await Promise.all([initial, history])
    expect(calls).toBe(0)
    expect(loader.getSnapshot(target).resolved).toBe(false)
  })

  test("uses HistoryPage.nextCursor only, merging chronological messages, inline parts and turns", async () => {
    const snapshot = historyWindow()
    const older = nativeMessage(target.sessionId, "old", 1)
    const requests: Array<{ cursor?: string; leafTurnId?: string; limit?: number } | undefined> = []
    const reportedCursors: string[] = []
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => snapshot, getHistory: async (_id, options) => {
      requests.push(options)
      return options?.cursor ? nativeHistory([older], null, snapshot) : nativeHistory([...snapshot.messages].reverse(), "opaque-history-page", snapshot)
    } }), onSnapshot: (_target, committed) => reportedCursors.push(committed.cursor) })
    await loader.ensure(target)
    expect(loader.getSnapshot(target).cursor).toBe("opaque-history-page")
    await loader.loadOlder(target)
    expect(requests[1]?.cursor).toBe("opaque-history-page")
    expect(requests[1]?.leafTurnId).toBeUndefined()
    expect(reportedCursors).toEqual([snapshot.cursor])
    expect(store.getState().sessionCursor[target.sessionId]).toBe(snapshot.cursor)
    expect(store.getState().message[target.sessionId]?.[0]).toEqual(older)
    expect(store.getState().message[target.sessionId]?.[0]?.parts[0]?.partId).toBe("part-old")
    expect(store.getState().snapshot[target.sessionId]?.turns[0]?.turnId).toBe(older.turnId)
    expect(loader.getSnapshot(target).complete).toBe(true)
  })

  test("history failure preserves visible history and cursor and never reports complete", async () => {
    const snapshot = historyWindow()
    let calls = 0
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => snapshot, getHistory: async () => {
      calls += 1
      if (calls > 1) throw new Error("history failed")
      return nativeHistory(snapshot.messages, "history-older", snapshot)
    } }) })
    await loader.ensure(target)
    const messages = store.getState().message[target.sessionId]
    await loader.loadOlder(target)
    expect(store.getState().message[target.sessionId]).toBe(messages)
    expect(loader.getSnapshot(target)).toMatchObject({ status: "error", cursor: "history-older", complete: false })
    await expect(loader.loadComplete(target)).rejects.toThrow("history failed")
    expect(calls).toBe(2)
  })

  test("rejects a history page from another branch identity or version", async () => {
    for (const mismatch of ["branchId", "branchVersion"] as const) {
      const snapshot = historyWindow()
      let calls = 0
      const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => snapshot, getHistory: async () => {
        calls += 1
        const page = nativeHistory(calls === 1 ? snapshot.messages : [nativeMessage(target.sessionId, "wrong-branch", 0)], "history-next", snapshot)
        if (calls > 1) page.branch = { ...page.branch, [mismatch]: mismatch === "branchId" ? "branch-b" : "2" }
        return page
      } }) })
      await loader.ensure(target)
      const before = store.getState()
      await loader.loadOlder(target)
      expect(store.getState()).toBe(before)
      expect(loader.getSnapshot(target)).toMatchObject({ status: "error", complete: false, cursor: "history-next" })
    }
  })

  test("rejects in-flight history after the live branch changes", async () => {
    const snapshot = historyWindow()
    const pending = deferred<HistoryPage>()
    let calls = 0
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => snapshot, getHistory: () => ++calls === 1 ? Promise.resolve(nativeHistory(snapshot.messages, "older", snapshot)) : pending.promise }) })
    await loader.ensure(target)
    const load = loader.loadOlder(target)
    store.setState({ snapshot: { [target.sessionId]: { ...store.getState().snapshot[target.sessionId]!, branch: { ...snapshot.branch, branchVersion: "2" } } } })
    const before = store.getState()
    pending.resolve(nativeHistory([nativeMessage(target.sessionId, "obsolete-history", 0)], null, snapshot))
    await load
    expect(store.getState()).toBe(before)
    expect(loader.getSnapshot(target).complete).toBe(false)
  })

  test("generation invalidation refuses stale history", async () => {
    const snapshot = historyWindow()
    const pending = deferred<HistoryPage>()
    let calls = 0
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => snapshot, getHistory: () => ++calls === 1 ? Promise.resolve(nativeHistory(snapshot.messages, "older", snapshot)) : pending.promise }) })
    await loader.ensure(target)
    const load = loader.loadOlder(target)
    loader.invalidateSession(target)
    pending.resolve(nativeHistory([nativeMessage(target.sessionId, "obsolete-history", 0)], null, snapshot))
    await load
    expect(store.getState().message[target.sessionId]?.some(message => message.messageId === "obsolete-history")).toBe(false)
    expect(loader.getSnapshot(target).resolved).toBe(false)
  })

  test("history does not overwrite newer live parts for overlapping native message IDs", async () => {
    const snapshot = historyWindow()
    const changed = { ...snapshot.messages[0]!, parts: [{ type: "text" as const, partId: snapshot.messages[0]!.parts[0]!.partId, content: "live update" }] }
    let calls = 0
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => snapshot, getHistory: async () => ++calls === 1 ? nativeHistory(snapshot.messages, "older", snapshot) : nativeHistory([snapshot.messages[0]!], null, snapshot) }) })
    await loader.ensure(target)
    store.setState({ message: { [target.sessionId]: [changed, ...snapshot.messages.slice(1)] } })
    await loader.loadOlder(target)
    expect(store.getState().message[target.sessionId]?.[0]).toBe(changed)
    expect(changed.parts[0]?.content).toBe("live update")
  })

  test("coalesces a parent recovery refresh behind a history read and replaces old branch atomically", async () => {
    const snapshot = historyWindow()
    const pending = deferred<HistoryPage>()
    let historyCalls = 0
    let snapshotCalls = 0
    const recovered = nativeSnapshot(target.sessionId, [nativeMessage(target.sessionId, "recovered")])
    recovered.branch = { ...recovered.branch, branchId: "branch-b", branchVersion: "2" }
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => ++snapshotCalls === 1 ? snapshot : recovered, getHistory: () => ++historyCalls === 1 ? Promise.resolve(nativeHistory(snapshot.messages, "older", snapshot)) : pending.promise }) })
    await loader.ensure(target)
    const older = loader.loadOlder(target)
    const refresh = loader.refresh(target)
    expect(loader.refresh(target)).toBe(refresh)
    expect(snapshotCalls).toBe(1)
    pending.resolve(nativeHistory([nativeMessage(target.sessionId, "old-history", 0)], null, snapshot))
    await Promise.all([older, refresh])
    expect(snapshotCalls).toBe(2)
    expect(store.getState().message[target.sessionId]?.map(message => message.messageId)).toEqual(["recovered"])
    expect(store.getState().snapshot[target.sessionId]?.branch).toEqual(recovered.branch)
  })

  test("loadComplete walks history to real terminal coverage", async () => {
    const snapshot = historyWindow()
    const cursors: Array<string | undefined> = []
    const { loader } = setup({ client: nativeClient({ getSnapshot: async () => snapshot, getHistory: async (_id, options) => {
      cursors.push(options?.cursor)
      return options?.cursor ? nativeHistory([nativeMessage(target.sessionId, "oldest", 0)], null, snapshot) : nativeHistory(snapshot.messages, "older", snapshot)
    } }) })
    await loader.loadComplete(target)
    expect(cursors).toEqual([undefined, "older"])
    expect(loader.getSnapshot(target).complete).toBe(true)
  })
})

describe("native optimistic continuity", () => {
  test("history echoes promote optimistic records and later rollback cannot remove them", async () => {
    const snapshot = historyWindow()
    const authoritative = nativeMessage(target.sessionId, "history-echo", 0)
    let calls = 0
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => snapshot, getHistory: async () => ++calls === 1 ? nativeHistory(snapshot.messages, "older", snapshot) : nativeHistory([authoritative], null, snapshot) }) })
    await loader.ensure(target)
    loader.optimisticAdd({ ...target, message: nativeMessage(target.sessionId, authoritative.messageId, 999) })
    await loader.loadOlder(target)
    loader.optimisticRemove({ ...target, messageId: authoritative.messageId })
    expect(store.getState().message[target.sessionId]?.[0]).toBe(authoritative)
    expect(store.getState().snapshot[target.sessionId]?.messages[0]).toBe(authoritative)
    expect(store.getState().partOwner[target.sessionId]?.[authoritative.parts[0]!.partId]).toBe(authoritative.messageId)
  })

  test("echoed optimistic messages receive authoritative timestamps and inline parts", async () => {
    const pending = deferred<SessionSnapshot>()
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: () => pending.promise }) })
    const load = loader.ensure(target)
    const optimistic = nativeMessage(target.sessionId, "echo", 999)
    loader.optimisticAdd({ ...target, message: optimistic })
    const authoritative = nativeMessage(target.sessionId, "echo", 10)
    pending.resolve(nativeSnapshot(target.sessionId, [authoritative]))
    await load
    expect(store.getState().message[target.sessionId]).toEqual([authoritative])
    expect(store.getState().partOwner[target.sessionId]?.["part-echo"]).toBe("echo")
  })

  test("unconfirmed optimistic messages survive recovery and rollback clears their part ownership", async () => {
    const { loader, store } = setup()
    const optimistic = nativeMessage(target.sessionId, "optimistic", 10)
    loader.optimisticAdd({ ...target, message: optimistic })
    await loader.ensure(target)
    expect(store.getState().message[target.sessionId]).toContain(optimistic)
    loader.optimisticRemove({ ...target, messageId: optimistic.messageId })
    expect(store.getState().message[target.sessionId]).not.toContain(optimistic)
    expect(store.getState().partOwner[target.sessionId]?.["part-optimistic"]).toBeUndefined()
  })
  test("rollback does not remove an authoritative echoed message", async () => {
    const authoritative = nativeMessage(target.sessionId, "promoted", 10)
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => nativeSnapshot(target.sessionId, [authoritative]) }) })
    loader.optimisticAdd({ ...target, message: nativeMessage(target.sessionId, "promoted", 999) })
    await loader.ensure(target)
    loader.optimisticRemove({ ...target, messageId: authoritative.messageId })
    expect(store.getState().message[target.sessionId]).toEqual([authoritative])
  })


  test("creating a session does not fake an authoritative runtime snapshot", async () => {
    let calls = 0
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async () => { calls += 1; return nativeSnapshot(target.sessionId, []) } }) })
    loader.initializeCreatedSession(target)
    expect(store.getState().message[target.sessionId]).toEqual([])
    expect(store.getState().snapshot[target.sessionId]).toBeUndefined()
    expect(loader.getSnapshot(target).resolved).toBe(false)
    await loader.ensure(target)
    expect(calls).toBe(1)
    expect(loader.getSnapshot(target).complete).toBe(true)
  })
})

describe("native selection recovery cache boundary", () => {
  afterEach(() => clearRuntimeSessionPrefetch("runtime-a"))

  test("invalidates speculative coverage without requiring a materialized loader entry", () => {
    const { loader } = setup()
    const other = { ...target, sessionId: "session-other" }
    setSessionPrefetch({ ...target, runtimeKey: "runtime-a", limit: 100, complete: true })
    setSessionPrefetch({ ...other, runtimeKey: "runtime-a", limit: 100, complete: true })
    loader.invalidateSession(target)
    expect(getSessionPrefetch(target.directory, target.sessionId, "runtime-a")).toBeUndefined()
    expect(getSessionPrefetch(other.directory, other.sessionId, "runtime-a")?.complete).toBe(true)
  })

  test("discarded optimistic shadows cannot reappear after an empty authoritative selection", async () => {
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async sessionId => nativeSnapshot(sessionId, []) }) })
    const other = { ...target, sessionId: "session-other" }
    const discarded = nativeMessage(target.sessionId, "discarded", 1)
    const unrelated = nativeMessage(other.sessionId, "unrelated", 1)
    loader.optimisticAdd({ ...target, message: discarded })
    loader.optimisticAdd({ ...other, message: unrelated })
    const unrelatedMessages = store.getState().message[other.sessionId]
    loader.invalidateSession(target)
    await loader.refresh(target)
    expect(store.getState().message[target.sessionId]).toEqual([])
    expect(store.getState().partOwner[target.sessionId]).toEqual({})
    expect(store.getState().message[other.sessionId]).toBe(unrelatedMessages)
    await loader.refresh(other)
    expect(store.getState().message[other.sessionId]).toEqual([unrelated])
  })

  test("a no-op visible selection still clears discarded shadows and speculation", async () => {
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async sessionId => nativeSnapshot(sessionId, []) }) })
    loader.optimisticAdd({ ...target, message: nativeMessage(target.sessionId, "discarded", 1) })
    store.setState({ message: { [target.sessionId]: [] } })
    setSessionPrefetch({ ...target, runtimeKey: "runtime-a", limit: 100, complete: true })
    loader.invalidateSession(target)
    expect(getSessionPrefetch(target.directory, target.sessionId, "runtime-a")).toBeUndefined()
    await loader.refresh(target)
    expect(store.getState().message[target.sessionId]).toEqual([])
  })

  test("selection invalidation preserves only explicitly retained optimistic records", async () => {
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: async sessionId => nativeSnapshot(sessionId, []) }) })
    const retained = nativeMessage(target.sessionId, "retained", 1)
    const discarded = nativeMessage(target.sessionId, "discarded", 2)
    loader.optimisticAdd({ ...target, message: retained })
    loader.optimisticAdd({ ...target, message: discarded })
    loader.invalidateSession(target, [retained])
    await loader.refresh(target)
    expect(store.getState().message[target.sessionId]).toEqual([retained])
    expect(store.getState().partOwner[target.sessionId]).toEqual({ "part-retained": "retained" })
  })

  test("a fresh branch and epoch win over a snapshot started before selection invalidation", async () => {
    const old = deferred<SessionSnapshot>()
    const selected = nativeSnapshot(target.sessionId, [nativeMessage(target.sessionId, "selected", 1)])
    selected.session.epoch = "epoch-selected"
    selected.branch = { branchId: "branch-selected", branchVersion: "2", leafMessageId: "selected" }
    selected.cursor = "opaque-selected-stream-cursor"
    let calls = 0
    const { loader, store } = setup({ client: nativeClient({ getSnapshot: () => ++calls === 1 ? old.promise : Promise.resolve(selected) }) })
    const obsolete = loader.refresh(target)
    loader.invalidateSession(target)
    await loader.refresh(target)
    const committed = store.getState()
    old.resolve(nativeSnapshot(target.sessionId, [nativeMessage(target.sessionId, "discarded", 2)]))
    await obsolete
    expect(store.getState()).toBe(committed)
    expect(store.getState().message[target.sessionId]?.map(message => message.messageId)).toEqual(["selected"])
    expect(store.getState().snapshot[target.sessionId]?.branch).toEqual(selected.branch)
    expect(store.getState().sessionEpoch[target.sessionId]).toBe("epoch-selected")
    expect(store.getState().sessionCursor[target.sessionId]).toBe(selected.cursor)
  })

  test("a selected branch retaining earlier history replaces the old cursor with its own authority", async () => {
    const previous = historyWindow()
    const kept = nativeMessage(target.sessionId, "kept", 10)
    const older = nativeMessage(target.sessionId, "older-selected", 1)
    const selected = nativeSnapshot(target.sessionId, [kept])
    selected.branch = { branchId: "selected-branch", branchVersion: "2", leafMessageId: kept.messageId }
    selected.window.hasEarlier = true
    let current = previous
    const cursors: Array<string | undefined> = []
    const { loader, store } = setup({ client: nativeClient({
      getSnapshot: async () => current,
      getHistory: async (_id, options) => {
        cursors.push(options?.cursor)
        return options?.cursor
          ? nativeHistory([older], null, selected)
          : nativeHistory(current.messages, current === previous ? "previous-branch-cursor" : "selected-branch-cursor", current)
      },
    }) })
    await loader.ensure(target)
    expect(loader.getSnapshot(target).cursor).toBe("previous-branch-cursor")
    loader.invalidateSession(target, [kept])
    expect(loader.getSnapshot(target)).toMatchObject({ resolved: false, cursor: undefined, complete: false })
    current = selected
    cleanups.push(loader.retainSessionHistory(target))
    await loader.refresh(target)
    expect(store.getState().message[target.sessionId]).toEqual([kept])
    expect(loader.getSnapshot(target)).toMatchObject({ resolved: true, cursor: "selected-branch-cursor", complete: false })
    await loader.loadOlder(target)
    expect(cursors).toEqual([undefined, undefined, "selected-branch-cursor"])
    expect(store.getState().message[target.sessionId]).toEqual([older, kept])
    expect(loader.getSnapshot(target).complete).toBe(true)
  })

  test("an empty selected branch resets prior history completeness and never reuses its cursor", async () => {
    const previous = historyWindow()
    let current = previous
    const history = nativeClient({
      getSnapshot: async () => current,
      getHistory: async () => nativeHistory(previous.messages, "old-branch-cursor", previous),
    })
    const { loader, store } = setup({ client: history })
    await loader.ensure(target)
    expect(loader.getSnapshot(target)).toMatchObject({ resolved: true, cursor: "old-branch-cursor", complete: false })
    loader.invalidateSession(target)
    expect(loader.getSnapshot(target)).toMatchObject({ resolved: false, cursor: undefined, complete: false })
    current = nativeSnapshot(target.sessionId, [])
    current.branch = { branchId: "empty-selected-branch", branchVersion: "2", leafMessageId: null }
    await loader.refresh(target)
    expect(store.getState().message[target.sessionId]).toEqual([])
    expect(loader.getSnapshot(target)).toMatchObject({ resolved: true, cursor: undefined, complete: true })
  })
})

describe("history-only canonical child sessions", () => {
  const childTarget = { directory: "/loader-repo", sessionId: "history-only-child" }
  function seedChild() {
    const original = useGlobalSessionsStore.getState()
    const child = { ...nativeHostSession(nativeSnapshot(childTarget.sessionId)), parentSessionId: "session-root", rootSessionId: "session-root" }
    useGlobalSessionsStore.getState().upsertSession(child)
    cleanups.push(() => useGlobalSessionsStore.setState(original))
    return child
  }

  test("opens and paginates using history and the projected Host row, without snapshot or journal attachment", async () => {
    const child = seedChild()
    const recent = nativeMessage(childTarget.sessionId, "recent", 2)
    const older = nativeMessage(childTarget.sessionId, "older", 1)
    const calls: Array<string | undefined> = []
    let forbiddenCalls = 0
    const forbidden = async () => { forbiddenCalls += 1; throw new Error("Child snapshot/metadata/queue is unavailable") }
    let snapshotCallbacks = 0
    const { loader, store } = setup({ onSnapshot: () => { snapshotCallbacks += 1 }, client: nativeClient({
      getSnapshot: forbidden, getSessionMetadata: forbidden, getQueue: forbidden,
      getHistory: async (sessionId, options) => {
        expect(sessionId).toBe(childTarget.sessionId)
        calls.push(options?.cursor)
        return nativeHistory(options?.cursor ? [older] : [recent], options?.cursor ? null : "older-page", nativeSnapshot(childTarget.sessionId))
      },
    }) })
    await loader.ensure(childTarget)
    expect(store.getState().session.find(row => row.sessionId === childTarget.sessionId)).toEqual(child)
    expect(store.getState().message[childTarget.sessionId]).toEqual([recent])
    expect(store.getState().snapshot[childTarget.sessionId]).toBeUndefined()
    expect(store.getState().sessionCursor[childTarget.sessionId]).toBeUndefined()
    expect(loader.getSnapshot(childTarget)).toMatchObject({ status: "ready", resolved: true, complete: false, cursor: "older-page" })
    await loader.loadOlder(childTarget)
    expect(store.getState().message[childTarget.sessionId]).toEqual([older, recent])
    expect(loader.getSnapshot(childTarget)).toMatchObject({ status: "ready", complete: true })
    expect(calls).toEqual([undefined, "older-page"])
    expect(snapshotCallbacks).toBe(0)
    expect(forbiddenCalls).toBe(0)
  })

  test("history failure preserves previous child messages", async () => {
    seedChild()
    const error = new Error("child history unavailable")
    const { loader, store } = setup({ client: nativeClient({ getHistory: async () => { throw error } }) })
    const messages = [nativeMessage(childTarget.sessionId)]
    store.setState({ message: { [childTarget.sessionId]: messages } })
    await loader.refresh(childTarget)
    expect(store.getState().message[childTarget.sessionId]).toBe(messages)
    expect(loader.getSnapshot(childTarget)).toMatchObject({ status: "error", error })
  })

  test("runtime reconfiguration rejects a delayed child history response", async () => {
    seedChild()
    const pending = deferred<HistoryPage>()
    const { loader, store } = setup({ client: nativeClient({ getHistory: () => pending.promise }) })
    const loading = loader.ensure(childTarget)
    loader.configure({ runtimeKey: "runtime-b", client: nativeClient() })
    pending.resolve(nativeHistory([nativeMessage(childTarget.sessionId)], null, nativeSnapshot(childTarget.sessionId)))
    await loading
    expect(store.getState().message[childTarget.sessionId]).toBeUndefined()
    expect(store.getState().snapshot[childTarget.sessionId]).toBeUndefined()
  })

  test("older child history rejects another branch and preserves the visible page", async () => {
    seedChild()
    const recent = nativeMessage(childTarget.sessionId, "recent", 2)
    const { loader, store } = setup({ client: nativeClient({ getHistory: async (_sessionId, options) => {
      const page = nativeHistory([recent], options?.cursor ? null : "older-page", nativeSnapshot(childTarget.sessionId))
      if (options?.cursor) page.branch = { ...page.branch, branchVersion: "2" }
      return page
    } }) })
    await loader.ensure(childTarget)
    const previous = store.getState().message[childTarget.sessionId]
    await loader.loadOlder(childTarget)
    expect(loader.getSnapshot(childTarget).status).toBe("error")
    expect(store.getState().message[childTarget.sessionId]).toBe(previous)
  })
})
