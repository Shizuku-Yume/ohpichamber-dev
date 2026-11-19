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

<<<<<<< HEAD
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
||||||| bc50ba56aa
  test('preserves message references for already-committed messages', () => {
    // Simulate expansion: commit 50 (assistant-only), then 100 (with user), then 150.
    // Pages are supersets: the 100-page includes all 50 from the first page,
    // the 150-page includes all 100 from the second.
    // Messages are chronological in the store,
    // so look them up by id rather than positional index.
    const a1 = assistantMessage('a_1')
    const a2 = assistantMessage('a_2')
    const u1 = userMessage('u_1')
    const u0 = userMessage('u_0')
    const a3 = assistantMessage('a_3')
    const page50 = [a1, a2]
    const page100 = [u1, a1, a2]
    const page150 = [u0, u1, a1, a2, a3]

    const partsFor = (msgs: Message[]): { info: Message; parts: Part[] }[] =>
      msgs.map((info) => ({
        info,
        parts: info.role === 'assistant' ? [textPart(`p_${info.id}`, info.id)] : [],
      }))

    let state = { message: {} as Record<string, Message[]>, part: {} as Record<string, Part[]> }

    // Commit 1: assistant-only page (skeleton stays — no user message).
    // But materialization itself is valid; we test the reference property here.
    const m1 = materializeSessionSnapshots(state, 'ses_1', partsFor(page50), { skipPartTypes: SKIP_PARTS })
    state = { message: m1.message, part: m1.part }
    const afterFirst = state.message.ses_1
    expect(afterFirst.find((m) => m.id === 'a_1')).toBe(a1)
    expect(afterFirst.find((m) => m.id === 'a_2')).toBe(a2)

    // Commit 2: 100-message superset.
    const m2 = materializeSessionSnapshots(state, 'ses_1', partsFor(page100), { skipPartTypes: SKIP_PARTS })
    state = { message: m2.message, part: m2.part }
    const afterSecond = state.message.ses_1
    expect(afterSecond.find((m) => m.id === 'a_1')).toBe(a1)
    expect(afterSecond.find((m) => m.id === 'a_2')).toBe(a2)
    expect(afterSecond.find((m) => m.id === 'u_1')).toBe(u1)

    // Commit 3: 150-message superset.
    const m3 = materializeSessionSnapshots(state, 'ses_1', partsFor(page150), { skipPartTypes: SKIP_PARTS })
    const afterThird = m3.message.ses_1
    // All previously-committed messages keep their references.
    expect(afterThird.find((m) => m.id === 'a_1')).toBe(a1)
    expect(afterThird.find((m) => m.id === 'a_2')).toBe(a2)
    expect(afterThird.find((m) => m.id === 'u_1')).toBe(u1)
    // New messages from the 150-page are present.
    expect(afterThird.find((m) => m.id === 'u_0')).toBe(u0)
    expect(afterThird.find((m) => m.id === 'a_3')).toBe(a3)
  })

  test('preserves part references for unchanged assistant messages', () => {
    const msg = assistantMessage('a_1')
    const prt = textPart('p_a_1', 'a_1')
    const state = {
      message: { ses_1: [msg] } as Record<string, Message[]>,
      part: { a_1: [prt] } as Record<string, Part[]>,
    }

    // Re-materialize with the same message + part (superset adds a new message).
    const m = materializeSessionSnapshots(state, 'ses_1', [
      { info: msg, parts: [prt] },
      { info: userMessage('u_1'), parts: [] },
    ], { skipPartTypes: new Set(['patch', 'step-start', 'step-finish']) })

    // The existing part array reference is preserved (equivalent snapshot).
    expect(m.part.a_1).toBe(state.part.a_1)
    expect(m.partsChanged).toBe(false) // user message has no parts → no part change
  })

  test('does not create a no-op store update when re-committing the same page', () => {
    const msg = userMessage('u_1')
    const state = {
      message: { ses_1: [msg] } as Record<string, Message[]>,
      part: {} as Record<string, Part[]>,
    }

    const m = materializeSessionSnapshots(state, 'ses_1', [
      { info: msg, parts: [] },
    ], { skipPartTypes: new Set(['patch', 'step-start', 'step-finish']) })

    expect(m.messagesChanged).toBe(false)
    expect(m.partsChanged).toBe(false)
    expect(m.message).toBe(state.message)
    expect(m.part).toBe(state.part)
  })
})

describe('mergeOptimisticPage idempotency across commits (#2084)', () => {
  test('places a post-rollover optimistic message at the chronological tail', () => {
    const legacy = userMessage('msg_ffffffffffffLegacy', 100)
    const current = userMessage('msg_000000000000Current', 200)
    const page = { session: [legacy], part: [], cursor: undefined, complete: true }

    const merged = mergeOptimisticPage(page, [{ message: current, parts: [] }])

    expect(merged.session).toEqual([legacy, current])
  })

  test('second call after clearOptimistic returns the page unchanged', () => {
    // Simulate: first commit confirmed an optimistic item, clearOptimistic
    // removed it; second commit (expansion) finds no optimistic items.
    const page = { session: [userMessage('u_1')], part: [{ id: 'u_1', part: [] }], cursor: 'c1', complete: false }

    // First merge with one optimistic item.
    const optimisticItem = { message: userMessage('opt_1'), parts: [textPart('p_opt_1', 'opt_1')] }
    const merged1 = mergeOptimisticPage(page, [optimisticItem])
    expect(merged1.confirmed).toEqual([]) // opt_1 is not in page.session → not confirmed

    // After clearOptimistic (simulated by passing empty items), merge is a no-op.
    const merged2 = mergeOptimisticPage(page, [])
    expect(merged2.confirmed).toEqual([])
    expect(merged2.session).toEqual(page.session)
    expect(merged2.cursor).toBe('c1')
    expect(merged2.complete).toBe(false)
  })

  test('mergeOptimisticPage with empty items is a fast no-op path', () => {
    const page = {
      session: [assistantMessage('a_1')],
      part: [{ id: 'a_1', part: [textPart('p_a_1', 'a_1')] }],
      cursor: undefined,
      complete: true,
    }
    const merged = mergeOptimisticPage(page, [])
    expect(merged.session).toEqual(page.session)
    expect(merged.confirmed).toEqual([])
    expect(merged.complete).toBe(true)
  })
})

describe('first-commit gating invariant (#2084)', () => {
  // The loadMessages refactor gates the first store commit on hasUserMessage.
  // When the first page is assistant-only, it defers to the expansion loop
  // and keeps the skeleton. This test verifies the gate condition itself:
  // hasUserMessage(page.session) must be false for an assistant-only page.
  test('assistant-only page does not trigger an early commit', () => {
    const assistantOnlyPage = [assistantMessage('a_1'), assistantMessage('a_2')]
    expect(hasUserMessage(assistantOnlyPage)).toBe(false)
  })

  test('page with a user message triggers an early commit', () => {
    const pageWithUser = [assistantMessage('a_1'), userMessage('u_1')]
    expect(hasUserMessage(pageWithUser)).toBe(true)
  })

  test('complete page triggers an early commit even without a user message', () => {
    // page.complete means there are no older messages to expand into.
    // Committing immediately is correct — the skeleton should disappear.
    // This mirrors the `hasUserMessage(page.session) || page.complete` gate.
    const completeAssistantOnlyPage = [assistantMessage('a_1')]
    const isComplete = true
    expect(hasUserMessage(completeAssistantOnlyPage) || isComplete).toBe(true)
  })

  test('prepend mode always commits — deferral does not apply', () => {
    // The deferred init path exists to keep the skeleton visible for an
    // assistant-only initial fetch. Prepend mode (loading older history)
    // has no skeleton to protect and must always write to the store —
    // otherwise the fetched older messages would be silently dropped.
    //
    // This test pins the gate condition: deferral requires `!options.before`.
    // An assistant-only, incomplete page in prepend mode must NOT defer.
    const assistantOnlyPage = [assistantMessage('a_1'), assistantMessage('a_2')]
    const hasBefore = true // prepend mode
    const isComplete = false

    // The actual gate in loadMessages is:
    //   const deferFirstCommit = !options?.before && !page.complete && !hasUserMessage(page.session)
    const deferFirstCommit = !hasBefore && !isComplete && !hasUserMessage(assistantOnlyPage)
    expect(deferFirstCommit).toBe(false) // prepend must not defer
  })
=======
  test('preserves message references for already-committed messages', () => {
    // Simulate expansion: commit 50 (assistant-only), then 100 (with user), then 150.
    // Pages are supersets: the 100-page includes all 50 from the first page,
    // the 150-page includes all 100 from the second.
    // Messages are chronological in the store,
    // so look them up by id rather than positional index.
    const a1 = assistantMessage('a_1')
    const a2 = assistantMessage('a_2')
    const u1 = userMessage('u_1')
    const u0 = userMessage('u_0')
    const a3 = assistantMessage('a_3')
    const page50 = [a1, a2]
    const page100 = [u1, a1, a2]
    const page150 = [u0, u1, a1, a2, a3]

    const partsFor = (msgs: Message[]): { info: Message; parts: Part[] }[] =>
      msgs.map((info) => ({
        info,
        parts: info.role === 'assistant' ? [textPart(`p_${info.id}`, info.id)] : [],
      }))

    let state = { message: {} as Record<string, Message[]>, part: {} as Record<string, Part[]> }

    // Commit 1: assistant-only page (skeleton stays — no user message).
    // But materialization itself is valid; we test the reference property here.
    const m1 = materializeSessionSnapshots(state, 'ses_1', partsFor(page50), { skipPartTypes: SKIP_PARTS })
    state = { message: m1.message, part: m1.part }
    const afterFirst = state.message.ses_1
    expect(afterFirst.find((m) => m.id === 'a_1')).toBe(a1)
    expect(afterFirst.find((m) => m.id === 'a_2')).toBe(a2)

    // Commit 2: 100-message superset.
    const m2 = materializeSessionSnapshots(state, 'ses_1', partsFor(page100), { skipPartTypes: SKIP_PARTS })
    state = { message: m2.message, part: m2.part }
    const afterSecond = state.message.ses_1
    expect(afterSecond.find((m) => m.id === 'a_1')).toBe(a1)
    expect(afterSecond.find((m) => m.id === 'a_2')).toBe(a2)
    expect(afterSecond.find((m) => m.id === 'u_1')).toBe(u1)

    // Commit 3: 150-message superset.
    const m3 = materializeSessionSnapshots(state, 'ses_1', partsFor(page150), { skipPartTypes: SKIP_PARTS })
    const afterThird = m3.message.ses_1
    // All previously-committed messages keep their references.
    expect(afterThird.find((m) => m.id === 'a_1')).toBe(a1)
    expect(afterThird.find((m) => m.id === 'a_2')).toBe(a2)
    expect(afterThird.find((m) => m.id === 'u_1')).toBe(u1)
    // New messages from the 150-page are present.
    expect(afterThird.find((m) => m.id === 'u_0')).toBe(u0)
    expect(afterThird.find((m) => m.id === 'a_3')).toBe(a3)
  })

  test('preserves part references for unchanged assistant messages', () => {
    const msg = assistantMessage('a_1')
    const prt = textPart('p_a_1', 'a_1')
    const state = {
      message: { ses_1: [msg] } as Record<string, Message[]>,
      part: { a_1: [prt] } as Record<string, Part[]>,
    }

    // Re-materialize with the same message + part (superset adds a new message).
    const m = materializeSessionSnapshots(state, 'ses_1', [
      { info: msg, parts: [prt] },
      { info: userMessage('u_1'), parts: [] },
    ], { skipPartTypes: new Set(['patch', 'step-start', 'step-finish']) })

    // The existing part array reference is preserved (equivalent snapshot).
    expect(m.part.a_1).toBe(state.part.a_1)
    expect(m.partsChanged).toBe(false) // user message has no parts → no part change
  })

  test('does not create a no-op store update when re-committing the same page', () => {
    const msg = userMessage('u_1')
    const state = {
      message: { ses_1: [msg] } as Record<string, Message[]>,
      part: {} as Record<string, Part[]>,
    }

    const m = materializeSessionSnapshots(state, 'ses_1', [
      { info: msg, parts: [] },
    ], { skipPartTypes: new Set(['patch', 'step-start', 'step-finish']) })

    expect(m.messagesChanged).toBe(false)
    expect(m.partsChanged).toBe(false)
    expect(m.message).toBe(state.message)
    expect(m.part).toBe(state.part)
  })
})

describe('mergeOptimisticPage idempotency across commits (#2084)', () => {
  test('places a post-rollover optimistic message at the chronological tail', () => {
    const legacy = userMessage('msg_ffffffffffffLegacy', 100)
    const current = userMessage('msg_000000000000Current', 200)
    const page = { session: [legacy], part: [], cursor: undefined, complete: true }

    const merged = mergeOptimisticPage(page, [{ message: current, parts: [] }])

    expect(merged.session).toEqual([legacy, current])
  })

  test('second call after clearOptimistic returns the page unchanged', () => {
    // Simulate: first commit confirmed an optimistic item, clearOptimistic
    // removed it; second commit (expansion) finds no optimistic items.
    const page = { session: [userMessage('u_1')], part: [{ id: 'u_1', part: [] }], cursor: 'c1', complete: false }

    // First merge with one optimistic item.
    const optimisticItem = { message: userMessage('opt_1'), parts: [textPart('p_opt_1', 'opt_1')] }
    const merged1 = mergeOptimisticPage(page, [optimisticItem])
    expect(merged1.confirmed).toEqual([]) // opt_1 is not in page.session → not confirmed

    // After clearOptimistic (simulated by passing empty items), merge is a no-op.
    const merged2 = mergeOptimisticPage(page, [])
    expect(merged2.confirmed).toEqual([])
    expect(merged2.session).toEqual(page.session)
    expect(merged2.cursor).toBe('c1')
    expect(merged2.complete).toBe(false)
  })

  test('mergeOptimisticPage with empty items is a fast no-op path', () => {
    const page = {
      session: [assistantMessage('a_1')],
      part: [{ id: 'a_1', part: [textPart('p_a_1', 'a_1')] }],
      cursor: undefined,
      complete: true,
    }
    const merged = mergeOptimisticPage(page, [])
    expect(merged.session).toEqual(page.session)
    expect(merged.confirmed).toEqual([])
    expect(merged.complete).toBe(true)
  })
})

describe('first-commit gating invariant (#2084)', () => {
  // The loadMessages refactor gates the first store commit on hasUserMessage.
  // When the first page is assistant-only, it defers to the expansion loop
  // and keeps the skeleton. This test verifies the gate condition itself:
  // hasUserMessage(page.session) must be false for an assistant-only page.
  test('assistant-only page does not trigger an early commit', () => {
    const assistantOnlyPage = [assistantMessage('a_1'), assistantMessage('a_2')]
    expect(hasUserMessage(assistantOnlyPage)).toBe(false)
  })

  test('page with a user message triggers an early commit', () => {
    const pageWithUser = [assistantMessage('a_1'), userMessage('u_1')]
    expect(hasUserMessage(pageWithUser)).toBe(true)
  })

>>>>>>> upstream/main
})
