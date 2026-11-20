import { afterEach, describe, expect, test } from "bun:test"
import type { QuestionRequest, SessionSnapshot } from "@openchamber/agent-contract"
import { ChildStoreManager } from "./child-store"
import { SessionMessageLoader } from "./session-message-loader"
import { deferred, nativeClient, nativeHistory, nativeMessage, nativeQuestion, nativeSnapshot } from "./session-message-loader-test-fixtures"
import { getAllSyncSessionMap, getDirectoryState, getSyncParts, getSyncSessionDirectory, registerSessionDirectory, setSyncRefs } from "./sync-refs"

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })
const target = { directory: "/sync-repo", sessionId: "session-a" }

function setup(configuration: Parameters<typeof nativeClient>[0] = {}) {
  const childStores = new ChildStoreManager()
  const client = nativeClient(configuration)
  const loader = new SessionMessageLoader(childStores, { client, runtimeKey: "sync-test" })
  const store = childStores.ensureChild(target.directory, { bootstrap: false })
  cleanups.push(() => { loader.dispose(); childStores.disposeAll() })
  return { loader, store }
}

describe("native sync loader controller contract", () => {
  test("coalesces navigation and prefetch into one native snapshot recovery", async () => {
    const pending = deferred<SessionSnapshot>()
    let calls = 0
    const { loader, store } = setup({ getSnapshot: () => { calls += 1; return pending.promise } })
    const prefetch = loader.prefetch(target)
    const navigation = loader.ensure(target, { reason: "navigation" })
    expect(calls).toBe(1)
    expect(prefetch).toBe(navigation)
    const message = nativeMessage(target.sessionId, "message-inline")
    pending.resolve(nativeSnapshot(target.sessionId, [message]))
    await navigation
    expect(store.getState().message[target.sessionId]).toEqual([message])
    expect(message.parts[0]?.partId).toBe("part-message-inline")
    expect(loader.getSnapshot(target)).toMatchObject({ status: "ready", resolved: true, complete: true })
  })

  test("refresh publishes native pending questions with the recovered snapshot", async () => {
    const question: QuestionRequest = nativeQuestion(target.sessionId)
    const recovered = nativeSnapshot(target.sessionId, [nativeMessage(target.sessionId, "message-recovered")])
    recovered.questions = [question]
    const { loader, store } = setup({ getSnapshot: async () => recovered })
    await loader.refresh(target)
    expect(store.getState().form[target.sessionId]).toEqual([question])
    expect(store.getState().form[target.sessionId]?.[0]?.status).toBe("pending")
    expect(store.getState().message[target.sessionId]?.[0]?.messageId).toBe("message-recovered")
  })

  test("complete history returns chronologically ordered native messages with inline parts", async () => {
    const newest = nativeMessage(target.sessionId, "message-new", 20)
    const oldest = nativeMessage(target.sessionId, "message-old", 1)
    const snapshot = nativeSnapshot(target.sessionId, [newest])
    snapshot.window.hasEarlier = true
    const { loader, store } = setup({
      getSnapshot: async () => snapshot,
      getHistory: async (_sessionId, options) => options?.cursor
        ? nativeHistory([oldest], null, snapshot)
        : nativeHistory([newest], "older", snapshot),
    })
    await loader.loadComplete(target)
    const messages = store.getState().message[target.sessionId] ?? []
    expect(messages.map((message) => message.messageId)).toEqual([oldest.messageId, newest.messageId])
    expect(messages.every((message) => message.parts.length > 0)).toBe(true)
    expect(loader.getSnapshot(target).complete).toBe(true)
  })

  test("optimistic native messages can be removed and confirmed by messageId", async () => {
    const { loader, store } = setup()
    const message = nativeMessage(target.sessionId, "message-optimistic")
    loader.optimisticAdd({ ...target, message })
    expect(store.getState().message[target.sessionId]).toEqual([message])
    loader.optimisticConfirm({ ...target, messageId: message.messageId })
    expect(store.getState().message[target.sessionId]).toEqual([message])
    loader.optimisticRemove({ ...target, messageId: message.messageId })
    expect(store.getState().message[target.sessionId]).toEqual([])
  })
})

describe("native imperative sync references", () => {
  test("routes explicit pre-discovery sessions across directory navigation without an SDK", () => {
    const manager = new ChildStoreManager()
    cleanups.push(() => manager.disposeAll())
    setSyncRefs(manager, "/first")
    registerSessionDirectory("native-session", "/workspace")
    setSyncRefs(manager, "/second")
    expect(getSyncSessionDirectory("native-session")).toBe("/workspace")
    const replacement = new ChildStoreManager()
    cleanups.push(() => replacement.disposeAll())
    setSyncRefs(replacement, "/replacement")
    expect(getSyncSessionDirectory("native-session")).toBeNull()
  })

  test("indexes canonical session IDs and reads parts from inline native messages", () => {
    const manager = new ChildStoreManager()
    cleanups.push(() => manager.disposeAll())
    const message = nativeMessage("native-session", "native-message")
    const snapshot = nativeSnapshot(message.sessionId, [message])
    const store = manager.ensureChild("/native", { bootstrap: false })
    store.setState({ session: [{ ...snapshot.session, metadata: null, metadataRevision: "0", archiveRevision: "0" }], message: { [message.sessionId]: [message] } })
    setSyncRefs(manager, "/native")
    expect(getDirectoryState()?.path.directory).toBe("/native")
    expect(getAllSyncSessionMap().get(message.sessionId)?.sessionId).toBe(message.sessionId)
    expect(getSyncParts(message.messageId)).toBe(message.parts)
    expect(getSyncParts("missing-message")).toEqual([])
  })
})
