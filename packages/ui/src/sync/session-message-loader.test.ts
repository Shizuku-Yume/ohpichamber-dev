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

<<<<<<< HEAD
function historyWindow(): SessionSnapshot {
  const snapshot = nativeSnapshot(target.sessionId, Array.from({ length: 10 }, (_, index) => nativeMessage(target.sessionId, `new-${index}`, index + 20)))
  snapshot.window.hasEarlier = true
  return snapshot
=======
describe("SessionMessageLoader", () => {
  test("opens a confirmed new session without fetching history", async () => {
    let calls = 0
    const { childStores, loader } = createLoader(async () => {
      calls += 1
      return failure(404, "not found")
    })
    const target = { directory: "/created-repo", sessionID: "session-created" }

    loader.initializeCreatedSession(target)
    await loader.ensure(target, { reason: "navigation" })
    await loader.ensure(target, { reason: "reactive" })

    expect(calls).toBe(0)
    expect(loader.getSnapshot(target)).toMatchObject({ status: "ready", resolved: true, complete: true })
    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]).toEqual([])

    const record = createRecord(target.sessionID)
    loader.optimisticAdd({ ...target, message: record.info, parts: record.parts })
    await loader.ensure(target)
    expect(calls).toBe(0)
    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]).toEqual([record.info])

    // Explicit recovery still reaches the server and exposes a real failure.
    await loader.ensure(target, { force: true })
    expect(calls).toBe(1)
    expect(loader.getSnapshot(target).status).toBe("error")
    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]).toEqual([record.info])
    loader.dispose()
    childStores.disposeAll()
  })

  test("creation supersedes an early history failure without losing the first prompt", async () => {
    const pending = deferred<MessagePage>()
    const { childStores, loader } = createLoader(() => pending.promise)
    const target = { directory: "/created-race", sessionID: "session-created" }
    const earlyLoad = loader.ensure(target)

    loader.initializeCreatedSession(target)
    const record = createRecord(target.sessionID)
    loader.optimisticAdd({ ...target, message: record.info, parts: record.parts })
    pending.reject(Object.assign(new Error("session.messages failed (404): not found"), { status: 404 }))
    await earlyLoad

    expect(loader.getSnapshot(target).status).toBe("ready")
    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]).toEqual([record.info])
    expect(childStores.getChild(target.directory)?.getState().part[record.info.id]).toEqual(record.parts)
    loader.dispose()
    childStores.disposeAll()
  })

  test("creation preserves messages and history coverage received before its response", async () => {
    const record = createRecord("session-created")
    const { childStores, loader } = createLoader(async () => response([record], "older-cursor"))
    const target = { directory: "/created-events", sessionID: "session-created" }
    await loader.ensure(target)
    const before = childStores.getChild(target.directory)?.getState()
    const coverage = loader.getSnapshot(target)

    loader.initializeCreatedSession(target)

    expect(childStores.getChild(target.directory)?.getState()).toBe(before)
    expect(loader.getSnapshot(target)).toBe(coverage)
    loader.dispose()
    childStores.disposeAll()
  })

  test("deduplicates navigation and reactive loading for the same target", async () => {
    const pending = deferred<MessagePage>()
    let calls = 0
    const { childStores, loader } = createLoader(async () => {
      calls += 1
      return pending.promise
    })
    const target = { directory: "/repo", sessionID: "session-a" }

    const navigation = loader.ensure(target, { reason: "navigation" })
    const reactive = loader.ensure(target, { reason: "reactive" })
    expect(calls).toBe(1)

    pending.resolve(response([createRecord(target.sessionID)]))
    await Promise.all([navigation, reactive])

    expect(loader.getSnapshot(target).status).toBe("ready")
    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]?.length).toBe(1)
    loader.dispose()
    childStores.disposeAll()
  })

  test("leaves older history loading to explicit viewport demand", async () => {
    const calls: Array<{ limit?: number; cursor?: string }> = []
    const { childStores, loader } = createLoader(async ({ sessionID, limit, cursor }) => {
      calls.push({ limit, cursor })
      // Ten prompts satisfy the cold-navigation turn target without expansion.
      return cursor
        ? response([createRecord(sessionID, "msg_older", 1)])
        : response(Array.from({ length: 10 }, (_, index) => createRecord(sessionID, `msg_${index + 2}`, index + 2)), "older-cursor")
    })
    const target = { directory: "/repo", sessionID: "session-a" }

    await loader.ensure(target, { reason: "prefetch" })
    await Promise.resolve()

    expect(calls).toEqual([{ limit: 100, cursor: undefined }])
    expect(loader.getSnapshot(target).cursor).toBe("older-cursor")

    await loader.loadOlder(target)

    expect(calls).toEqual([
      { limit: 100, cursor: undefined },
      { limit: 100, cursor: "older-cursor" },
    ])
    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]?.map((message) => message.id))
      .toEqual(["msg_older", ...Array.from({ length: 10 }, (_, index) => `msg_${index + 2}`)])
    loader.dispose()
    childStores.disposeAll()
  })

  test("records only completed replies from older pages and retains their provenance after a trim", async () => {
    const target = { directory: "/repo", sessionID: "session-a" }
    const answer = (id: string, created: number) => ({
      info: { id, sessionID: target.sessionID, role: "assistant" as const, time: { created, completed: created + 1 }, finish: "stop" as const, agent: "build", providerID: "test", modelID: "test" },
      parts: [{ id: `part_${id}`, messageID: id, sessionID: target.sessionID, type: "text" as const, text: id }],
    })
    const older = answer("old-answer", 2)
    const unfinished = answer("unfinished", 3)
    const olderPage = deferred<MessagePage>()
    const { childStores, loader } = createLoader(async ({ sessionID, cursor }) => cursor
      ? olderPage.promise
      : response([...Array.from({ length: 10 }, (_, i) => createRecord(sessionID, `prompt-${i}`, 10 + i)), answer("latest", 20)], "older-cursor"))

    await loader.ensure(target)
    expect([...loader.getSnapshot(target).olderCompletedReplyIds]).toEqual([])
    const loading = loader.loadOlder(target)
    const live = answer("live-answer", 30)
    const store = childStores.ensureChild(target.directory, { bootstrap: false })
    store.setState((state) => ({
      message: { ...state.message, [target.sessionID]: [...state.message[target.sessionID], live.info] },
      part: { ...state.part, [live.info.id]: live.parts },
    }))
    olderPage.resolve(response([createRecord(target.sessionID, "old-prompt", 1), older, { ...unfinished, info: { ...unfinished.info, time: { created: 3 } } }]))
    await loading
    expect([...loader.getSnapshot(target).olderCompletedReplyIds]).toEqual(["old-answer"])
    expect(store.getState().message[target.sessionID].at(-1)?.id).toBe("live-answer")
    loader.invalidateSession(target, [older.info])
    expect([...loader.getSnapshot(target).olderCompletedReplyIds]).toEqual(["old-answer"])
    loader.invalidateDirectory(target.directory)
    expect([...loader.getSnapshot(target).olderCompletedReplyIds]).toEqual([])
    loader.dispose()
    childStores.disposeAll()
  })

  test("keeps a post-rollover tail after legacy messages for shared runtime identities", async () => {
    const runtimes = ["web", "desktop", "vscode", "mobile"]
    for (const runtimeKey of runtimes) {
      const childStores = new ChildStoreManager()
      const sdk = {
        getSessionMessages: async (sessionID: string) => response([
          createRecord(sessionID, "msg_000000000000Current", 200),
          createRecord(sessionID, "msg_ffffffffffffLegacy", 100),
        ]),
      }
      const loader = new SessionMessageLoader(childStores, { sdk, runtimeKey })
      const target = { directory: `/repo-${runtimeKey}`, sessionID: "session-a" }

      await loader.ensure(target)

      expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]?.map((message) => message.id))
        .toEqual(["msg_ffffffffffffLegacy", "msg_000000000000Current"])
      loader.dispose()
      childStores.disposeAll()
    }
  })

  test("loads every history page for an explicit complete-history request", async () => {
    const calls: Array<{ cursor?: string }> = []
    const { childStores, loader } = createLoader(async ({ sessionID, cursor }) => {
      calls.push({ cursor })
      if (!cursor) return response([createRecord(sessionID, "msg_latest")], "cursor-2")
      if (cursor === "cursor-2") return response([createRecord(sessionID, "msg_middle")], "cursor-1")
      return response([createRecord(sessionID, "msg_oldest")])
    })
    const target = { directory: "/repo", sessionID: "session-a" }

    await loader.loadComplete(target)

    expect(calls).toEqual([
      { cursor: undefined },
      { cursor: "cursor-2" },
      { cursor: "cursor-1" },
    ])
    expect(loader.getSnapshot(target).complete).toBe(true)
    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]).toHaveLength(3)
    loader.dispose()
    childStores.disposeAll()
  })

  test("rejects a complete-history request when its initial load fails", async () => {
    const { childStores, loader } = createLoader(async () => failure(400, "rejected"))
    const target = { directory: "/repo", sessionID: "session-a" }

    await expect(loader.loadComplete(target)).rejects.toThrow("session.messages failed (400): rejected")

    loader.dispose()
    childStores.disposeAll()
  })

  test("rejects a complete-history request when an older page fails", async () => {
    const { childStores, loader } = createLoader(async ({ sessionID, cursor }) => cursor
      ? failure(400, "older rejected")
      : response([createRecord(sessionID)], "older-cursor"))
    const target = { directory: "/repo", sessionID: "session-a" }

    await expect(loader.loadComplete(target)).rejects.toThrow("session.messages failed (400): older rejected")

    expect(loader.getSnapshot(target).cursor).toBe("older-cursor")
    loader.dispose()
    childStores.disposeAll()
  })

  test("fetches authoritative coverage when renderable messages have no loader metadata", async () => {
    let calls = 0
    const { childStores, loader } = createLoader(async ({ sessionID }) => {
      calls += 1
      return response([createRecord(sessionID)])
    })
    const target = { directory: "/repo", sessionID: "session-a" }
    childStores.ensureChild(target.directory, { bootstrap: false }).setState({
      message: { [target.sessionID]: [createRecord(target.sessionID, "cached").info] },
    })

    await loader.loadComplete(target)

    expect(calls).toBe(1)
    expect(loader.getSnapshot(target).complete).toBe(true)
    loader.dispose()
    childStores.disposeAll()
  })

  test("rejects repeated pagination cursors instead of looping forever", async () => {
    let calls = 0
    const { childStores, loader } = createLoader(async ({ sessionID, cursor }) => {
      calls += 1
      if (!cursor) return response([createRecord(sessionID, "latest")], "cursor-a")
      if (cursor === "cursor-a") return response([createRecord(sessionID, "middle")], "cursor-b")
      return response([createRecord(sessionID, "older")], "cursor-a")
    })
    const target = { directory: "/repo", sessionID: "session-a" }

    await expect(loader.loadComplete(target)).rejects.toThrow("Session history pagination made no progress")

    expect(calls).toBe(3)
    loader.dispose()
    childStores.disposeAll()
  })

  test("runs a requested tail refresh after an older in-flight load", async () => {
    const initial = deferred<MessagePage>()
    const refresh = deferred<MessagePage>()
    let calls = 0
    const limits: number[] = []
    const { childStores, loader } = createLoader(async ({ limit }) => {
      calls += 1
      limits.push(limit ?? 0)
      return calls === 1 ? initial.promise : refresh.promise
    })
    const target = { directory: "/repo", sessionID: "session-a" }

    const loading = loader.ensure(target, { reason: "navigation" })
    const refreshing = loader.refreshTail(target, 30)
    const duplicateRefresh = loader.refreshTail(target, 80)
    expect(calls).toBe(1)
    expect(duplicateRefresh).toBe(refreshing)

    initial.resolve(response([createRecord(target.sessionID, "msg_1")]))
    await loading
    await Promise.resolve()
    expect(calls).toBe(2)
    expect(limits).toEqual([100, 80])

    refresh.resolve(response([createRecord(target.sessionID, "msg_2")]))
    await Promise.all([refreshing, duplicateRefresh])

    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]?.map((message) => message.id))
      .toEqual(["msg_1", "msg_2"])
    loader.dispose()
    childStores.disposeAll()
  })

  test("a tail refresh replaces the optimistic prompt's client clock with the server's", async () => {
    // The browser's clock runs ahead of the server's: the prompt was stamped
    // 10s, the server recorded it at 1s and its reply at 1.5s.
    const prompt = createRecord("session-skew", "msg_prompt", 10_000)
    const serverPrompt = createRecord("session-skew", "msg_prompt", 1_000)
    const reply = {
      info: { id: "msg_reply", sessionID: "session-skew", role: "assistant", time: { created: 1_500, completed: 2_000 } } as Message,
      parts: [{ id: "part_reply", messageID: "msg_reply", sessionID: "session-skew", type: "text", text: "answer" }] as Part[],
    }
    const { childStores, loader } = createLoader(async () => response([serverPrompt, reply]))
    const target = { directory: "/remote", sessionID: "session-skew" }
    loader.initializeCreatedSession(target)
    loader.optimisticAdd({ ...target, message: prompt.info, parts: prompt.parts })

    await loader.refreshTail(target, 30)

    const messages = childStores.getChild(target.directory)?.getState().message[target.sessionID]
    expect(messages?.map((message) => [message.id, message.time.created])).toEqual([["msg_prompt", 1_000], ["msg_reply", 1_500]])
    loader.dispose()
    childStores.disposeAll()
  })

  test("a tail refresh keeps a prompt a live event already replaced", async () => {
    const prompt = createRecord("session-live", "msg_prompt", 10_000)
    const { childStores, loader } = createLoader(async () => response([createRecord("session-live", "msg_prompt", 1_000)]))
    const target = { directory: "/remote", sessionID: "session-live" }
    loader.initializeCreatedSession(target)
    loader.optimisticAdd({ ...target, message: prompt.info, parts: prompt.parts })
    const store = childStores.getChild(target.directory)!
    const live = { ...prompt.info, time: { created: 1_200 } }
    store.setState({ message: { ...store.getState().message, [target.sessionID]: [live] } })

    await loader.refreshTail(target, 30)

    expect(store.getState().message[target.sessionID]).toEqual([live])
    loader.dispose()
    childStores.disposeAll()
  })

  test("preserves complete history coverage across a tail refresh", async () => {
    let calls = 0
    const { childStores, loader } = createLoader(async ({ sessionID }) => {
      calls += 1
      return calls === 1
        ? response([createRecord(sessionID, "msg_1")])
        : response([createRecord(sessionID, "msg_1"), createRecord(sessionID, "msg_2", 2)], "stale-tail-cursor")
    })
    const target = { directory: "/repo", sessionID: "session-a" }

    await loader.ensure(target)
    expect(loader.getSnapshot(target).complete).toBe(true)
    expect(loader.getSnapshot(target).cursor).toBe(undefined)

    await loader.refreshTail(target, 2)

    expect(loader.getSnapshot(target).complete).toBe(true)
    expect(loader.getSnapshot(target).cursor).toBe(undefined)
    loader.dispose()
    childStores.disposeAll()
  })

  test("does not deduplicate identical session IDs across directories", async () => {
    const calls: string[] = []
    const { childStores, loader } = createLoader(async ({ directory, sessionID }) => {
      calls.push(directory ?? "")
      return response([createRecord(sessionID)])
    })

    await Promise.all([
      loader.ensure({ directory: "/repo-a", sessionID: "shared" }),
      loader.ensure({ directory: "/repo-b", sessionID: "shared" }),
    ])

    expect(calls.sort()).toEqual(["/repo-a", "/repo-b"])
    loader.dispose()
    childStores.disposeAll()
  })

  test("loads older history with the selected directory's cursor for duplicate session IDs", async () => {
    const providerDirectory = "/repo/provider"
    const selectedDirectory = "/repo/selected-worktree"
    const sessionID = "shared"
    const calls: Array<{ directory?: string; cursor?: string }> = []
    const { childStores, loader } = createLoader(async ({ directory, cursor }) => {
      calls.push({ directory, cursor })
      return cursor
        ? response([createRecord(sessionID, `older-${directory}`)])
        : response([createRecord(sessionID, `latest-${directory}`)], `${directory}-cursor`)
    })

    await Promise.all([
      loader.ensure({ directory: providerDirectory, sessionID }),
      loader.ensure({ directory: selectedDirectory, sessionID }),
    ])

    // Cold navigation extends each directory's window through its own cursor.
    expect(calls.filter((call) => call.cursor)).toEqual([
      { directory: providerDirectory, cursor: `${providerDirectory}-cursor` },
      { directory: selectedDirectory, cursor: `${selectedDirectory}-cursor` },
    ])
    expect(loader.getSnapshot({ directory: selectedDirectory, sessionID }).complete).toBe(true)
    calls.length = 0
    await loader.loadOlder({ directory: selectedDirectory, sessionID })
    expect(calls).toEqual([])
    loader.dispose()
    childStores.disposeAll()
  })

  test("exposes a retryable error without clearing an existing snapshot", async () => {
    let fail = true
    const { childStores, loader } = createLoader(async ({ sessionID }) => {
      if (fail) return failure(400, "rejected")
      return response([createRecord(sessionID)])
    })
    const target = { directory: "/repo", sessionID: "session-a" }
    const store = childStores.ensureChild(target.directory, { bootstrap: false })
    store.setState({ message: { [target.sessionID]: [{ id: "cached", sessionID: target.sessionID, role: "user", time: { created: 0 } } as Message] } })

    await loader.ensure(target, { force: true })
    expect(loader.getSnapshot(target).status).toBe("error")
    expect((loader.getSnapshot(target).error as Error & { status?: number }).status).toBe(400)
    expect(store.getState().message[target.sessionID]?.[0]?.id).toBe("cached")

    fail = false
    await loader.ensure(target, { force: true })
    expect(loader.getSnapshot(target).status).toBe("ready")
    loader.dispose()
    childStores.disposeAll()
  })

  test("propagates a zero response status on SDK errors", async () => {
    const { childStores, loader } = createLoader(async () => failure(0, "network rejected"))
    const target = { directory: "/repo", sessionID: "session-a" }

    await loader.ensure(target, { force: true })

    expect((loader.getSnapshot(target).error as Error & { status?: number }).status).toBe(0)
    loader.dispose()
    childStores.disposeAll()
  })

  test("prevents an evicted in-flight request from repopulating the store", async () => {
    const pending = deferred<MessagePage>()
    const { childStores, loader } = createLoader(async () => pending.promise)
    const target = { directory: "/repo", sessionID: "session-a" }

    const loading = loader.ensure(target)
    loader.invalidateSession(target)
    pending.resolve(response([createRecord(target.sessionID)]))
    await loading

    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]).toBe(undefined)
    expect(loader.getSnapshot(target).status).toBe("idle")
    loader.dispose()
    childStores.disposeAll()
  })

  test("treats an empty successful response as resolved authoritative state", async () => {
    const { childStores, loader } = createLoader(async () => response([]))
    const target = { directory: "/repo", sessionID: "empty" }

    await loader.ensure(target)

    expect(loader.getSnapshot(target).resolved).toBe(true)
    expect(loader.getSnapshot(target).complete).toBe(true)
    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]).toEqual([])
    loader.dispose()
    childStores.disposeAll()
  })

  test("retries a transient page failure instead of treating it as an empty snapshot", async () => {
    let calls = 0
    const { childStores, loader } = createLoader(async ({ sessionID }) => {
      calls += 1
      return calls === 1 ? failure(503, "unavailable") : response([createRecord(sessionID)])
    })
    const target = { directory: "/repo", sessionID: "session-a" }

    await loader.ensure(target)

    expect(calls).toBe(2)
    expect(loader.getSnapshot(target).status).toBe("ready")
    expect(childStores.getChild(target.directory)?.getState().message[target.sessionID]?.length).toBe(1)
    loader.dispose()
    childStores.disposeAll()
  })

  test("reports retries and every downloaded initial expansion record", async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
    const diagnosticWindow = {
      location: { search: "" },
      localStorage: {
        getItem: (key: string) => key === "openchamber_session_load_perf" ? "1" : null,
      },
    } as unknown as Window
    Object.defineProperty(globalThis, "window", { configurable: true, value: diagnosticWindow })

    const target = { directory: "/repo", sessionID: "session-a" }
    let calls = 0
    const { childStores, loader } = createLoader(async () => {
      calls += 1
      if (calls === 1) return failure(503, "unavailable")
      if (calls === 2) {
        const assistant = createRecord(target.sessionID, "msg_assistant")
        assistant.info = { ...assistant.info, role: "assistant" } as Message
        return response([assistant], "older")
      }
      return response([createRecord(target.sessionID, "msg_user")])
    })

    try {
      await loader.ensure(target)

      const events = diagnosticWindow.__openchamberSessionLoadPerformance?.events ?? []
      const initialEvent = events.find((event) => event.operation === "session-messages.initial")
      const pageEvents = events.filter((event) => event.operation === "session-messages.page")
      expect(calls).toBe(3)
      // The first page holds no prompt: one maximal page reads back to it.
      expect(pageEvents.map((event) => event.requestLimit)).toEqual([100, 200])
      expect(pageEvents.map((event) => event.cursorPresent)).toEqual([false, true])
      expect(pageEvents.map((event) => event.recordCount)).toEqual([1, 1])
      expect(initialEvent?.outcome).toBe("complete")
      expect(initialEvent?.retryCount).toBe(1)
      expect(initialEvent?.recordCount).toBe(2)
      expect("runtimeKey" in initialEvent!).toBe(false)
      expect("directory" in initialEvent!).toBe(false)
      expect("sessionID" in initialEvent!).toBe(false)
    } finally {
      loader.dispose()
      childStores.disposeAll()
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
      else Reflect.deleteProperty(globalThis, "window")
    }
  })
})

/**
 * A session's history on a fake server: records oldest first, served newest
 * first in cursor pages the way OpenCode does. Every request is recorded.
 */
const createHistoryServer = (sessionID: string) => {
  const records: ReturnType<typeof createRecord>[] = []
  const requests: Array<{ limit: number; cursor?: string; records: number }> = []
  const append = (count: number, promptEvery: number) => {
    for (let index = 0; index < count; index += 1) {
      const position = records.length
      const record = createRecord(sessionID, `msg_${String(position).padStart(5, "0")}`, position + 1)
      if (position % promptEvery !== 0) record.info = { ...record.info, role: "assistant", time: { created: position + 1, completed: position + 1 } } as Message
      records.push(record)
    }
  }
  const getPage = async ({ limit, cursor }: PageRequest): Promise<MessagePage> => {
    if (limit === undefined || limit > 200) return failure(400, "limit out of range")
    const end = cursor === undefined ? records.length : Number(cursor)
    const start = Math.max(0, end - limit)
    const items = records.slice(start, end)
    requests.push({ limit, cursor, records: items.length })
    return response(items, start > 0 ? String(start) : undefined)
  }
  return { records, requests, append, getPage }
>>>>>>> bc50ba56a
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
    const incoming = { ...oldHost, title: "New title", metadata: {}, metadataRevision: "6", archiveRevision: "1", archivedAt: undefined }
    const { loader, store } = setup({ client: nativeClient({ listSessions: async () => ({ items: [incoming], errors: {} }), getSessionMetadata: async sessionId => ({ sessionId, title: "Newer title", metadata: {}, revision: "7" }) }) })
    // A concurrent projection arrives while the missing-session list request is in flight.
    const list = deferred<{ items: typeof incoming[]; errors: Record<string, never> }>()
    const client = nativeClient({ listSessions: () => list.promise, getSessionMetadata: async sessionId => ({ sessionId, title: "Newer title", metadata: {}, revision: "7" }) })
    loader.configure({ client, runtimeKey: "runtime-a" })
    const load = loader.ensure(target)
    await Promise.resolve()
    await Promise.resolve()
    store.setState({ session: [oldHost] })
    list.resolve({ items: [incoming], errors: {} })
    await load
    // The native snapshot title remains canonical over Host metadata and list projections.
    expect(store.getState().session[0]?.title).toBe("Saved title")
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
    const metadata = deferred<{ sessionId: string; revision: string; metadata: Record<string, unknown> }>()
    const { loader, store } = setup({ client: nativeClient({ getSessionMetadata: () => metadata.promise }) })
    store.setState({ session: [nativeHostSession()] })
    const load = loader.ensure(target)
    await Promise.resolve()
    await Promise.resolve()
    loader.configure({ client: nativeClient(), runtimeKey: "runtime-b" })
    metadata.resolve({ sessionId: target.sessionId, revision: "100", metadata: {} })
    await load
    expect(store.getState().session[0]?.title).toBe("Saved title")
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
    // The first request is the newest turn window; older records follow its cursor.
    expect(requests[0]?.cursor).toBeUndefined()
    expect(requests[0]?.leafTurnId).toBe(snapshot.window.lastTurnId)
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
