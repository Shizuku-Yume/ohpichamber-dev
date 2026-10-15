import { afterEach, describe, expect, jest, test } from "bun:test"
import type { HistoryPage, Message, QuestionRequest, SessionSnapshot } from "@openchamber/agent-contract"
import { ChildStoreManager } from "./child-store"
import { SessionMessageLoader, type SessionMessageTarget } from "./session-message-loader"
import { nativeClient, nativeHistory, nativeMessage, nativeSnapshot, nativeTurn } from "./session-message-loader-test-fixtures"

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  jest.useRealTimers()
})
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve() }
const IDLE_TTL_MS = 40
const COUNT_ONLY_TTL_MS = 60 * 60 * 1000
// The retention runtime arms a timer and compares wall-clock time, so the idle
// window is advanced on the fake clock and the pending work is drained after.
const waitIdle = async () => { await flush(); jest.advanceTimersByTime(IDLE_TTL_MS * 3); await flush() }

function transcript(sessionId: string, turns = 8, steps = 12): Message[] {
  const messages: Message[] = []
  for (let turn = 0; turn < turns; turn += 1) {
    for (let step = 0; step <= steps; step += 1) {
      const messageId = `message-${sessionId}-${turn}-${step}`
      const message = nativeMessage(sessionId, messageId, turn * (steps + 1) + step, step === 0 ? "user" : "assistant")
      message.parts = [{ type: "text", partId: `part-${messageId}`, content: "x".repeat(1024) }]
      messages.push(message)
    }
  }
  return messages
}

function snapshotFor(sessionId: string, messages: Message[]): SessionSnapshot {
  const visible = messages.slice(-10)
  const snapshot = nativeSnapshot(sessionId, visible)
  snapshot.window.hasEarlier = messages.length > visible.length
  snapshot.window.firstTurnId = visible[0]?.turnId ?? null
  snapshot.window.firstMessageId = visible[0]?.messageId ?? null
  snapshot.turns = visible.map(nativeTurn)
  return snapshot
}

function setup(surface: "desktop" | "mobile" = "desktop", recordsFor = transcript, idleTtlMs = COUNT_ONLY_TTL_MS) {
  jest.useFakeTimers()
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", { configurable: true, value: { __OPENCHAMBER_SURFACE__: surface } })
  cleanups.push(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow)
    else Reflect.deleteProperty(globalThis, "window")
  })
  const requests: Array<{ sessionId: string; cursor?: string; limit?: number }> = []
  let requestsUntilFailure = 0
  const backgroundMessages = new Map<string, Message[]>()
  const childStores = new ChildStoreManager()
  const records = (sessionId: string) => [...recordsFor(sessionId), ...(backgroundMessages.get(sessionId) ?? [])]
  childStores.ensureChild("/repo", { bootstrap: false }).setState({ session: [] })
  const client = nativeClient({
    getSnapshot: async (sessionId) => snapshotFor(sessionId, records(sessionId)),
    getHistory: async (sessionId, options): Promise<HistoryPage> => {
      requests.push({ sessionId, cursor: options?.cursor, limit: options?.limit })
      if (requestsUntilFailure > 0 && --requestsUntilFailure === 0) throw new Error("history failed")
      const all = records(sessionId)
      const boundary = options?.cursor ? Number(options.cursor) : all.length
      const limit = options?.limit ?? 100
      const start = Math.max(0, boundary - limit)
      return nativeHistory(all.slice(start, boundary), start > 0 ? String(start) : null, snapshotFor(sessionId, all))
    },
  })
  const loader = new SessionMessageLoader(childStores, { client, runtimeKey: "cache-test" })
  let viewed: SessionMessageTarget = { directory: "/repo", sessionId: "a" }
  let current = true
  const releases: SessionMessageTarget[] = []
  const active = new Set<string>()
  loader.startCacheRetention({
    idleTtlMs,
    isCurrent: () => current,
    isViewed: (target) => target.directory === viewed.directory && target.sessionId === viewed.sessionId,
    isActive: (target) => target.directory === "/repo" && active.has(target.sessionId),
    releaseDerivedCache: (target) => releases.push(target),
  })
  cleanups.push(() => { loader.dispose(); childStores.disposeAll() })
  const target = (sessionId: string, directory = "/repo") => ({ directory, sessionId })
  const select = async (sessionId: string, directory = "/repo") => {
    const previous = viewed
    viewed = target(sessionId, directory)
    loader.scheduleCacheRetention(previous.directory)
    await loader.ensure(viewed)
    await flush()
  }
  const messages = (sessionId: string, directory = "/repo") => childStores.getChild(directory)?.getState().message[sessionId]
  return {
    loader, childStores, requests, releases, select, target, messages,
    leave: () => { viewed = target(""); loader.scheduleCacheRetention("/repo") },
    changeRuntime: () => { current = false },
    failNext: () => { requestsUntilFailure = 1 },
    addBackground: (message: Message) => { backgroundMessages.set(message.sessionId, [...(backgroundMessages.get(message.sessionId) ?? []), message]) },
    setActive: (sessionId: string, value: boolean) => {
      if (value) active.add(sessionId)
      else active.delete(sessionId)
      loader.scheduleCacheRetention("/repo")
    },
  }
}

describe("native session cache retention", () => {
  for (const surface of ["desktop", "mobile"] as const) {
    test(`${surface}: retains whole native history across a warm switch`, async () => {
      const env = setup(surface)
      await env.select("a")
      await env.loader.loadComplete(env.target("a"))
      const original = env.messages("a") ?? []
      expect(original).toHaveLength(104)
      await env.select("b")
      const calls = env.requests.length
      await env.select("a")
      expect(env.requests).toHaveLength(calls)
      expect(env.messages("a")).toBe(original)
    })

    test(`${surface}: evicts after idle grace and reloads on return`, async () => {
      const env = setup(surface, transcript, IDLE_TTL_MS)
      await env.select("a")
      await env.loader.loadComplete(env.target("a"))
      await env.select("b")
      const calls = env.requests.length
      await waitIdle()
      expect(env.messages("a")).toBeUndefined()
      expect(env.releases.some((target) => target.sessionId === "a")).toBe(true)
      expect(env.loader.getSnapshot(env.target("a")).resolved).toBe(false)
      await env.select("a")
      expect(env.requests.length).toBeGreaterThan(calls)
      expect(env.messages("a")).toHaveLength(104)
    })

    test(`${surface}: count limit evicts the least recently visited session`, async () => {
      const env = setup(surface)
      const limit = surface === "desktop" ? 20 : 6
      for (let index = 0; index < limit; index += 1) await env.select(`s${index}`)
      expect(Object.keys(env.childStores.getChild("/repo")!.getState().message)).toHaveLength(limit)
      const calls = env.requests.length
      await env.select("s0")
      expect(env.requests).toHaveLength(calls)
      await env.select("overflow")
      expect(env.messages("s0")).toBeDefined()
      expect(env.messages("s1")).toBeUndefined()
    })
  }

  test("active and pending-question histories outlive idle grace", async () => {
    const env = setup("desktop", transcript, IDLE_TTL_MS)
    await env.select("a")
    env.setActive("a", true)
    await env.select("b")
    await waitIdle()
    expect(env.messages("a")).toHaveLength(104)
    env.setActive("a", false)
    const store = env.childStores.getChild("/repo")!
    const question: QuestionRequest = { questionId: "question-a", sessionId: "a", turnId: "turn-a", prompt: "Continue?", status: "pending", requestedAt: 1, epoch: "epoch-a", version: "1", workerGeneration: "worker-a" }
    store.setState({ form: { a: [question] } })
    await waitIdle()
    expect(env.messages("a")).toHaveLength(104)
    store.setState({ form: {} })
    await waitIdle()
    expect(env.messages("a")).toBeUndefined()
  })

  test("history readers and rendered transcripts hold retention until release", async () => {
    const env = setup("desktop", transcript, IDLE_TTL_MS)
    await env.select("b")
    const readRelease = env.loader.retainSessionHistory(env.target("a"))
    await env.loader.loadComplete(env.target("a"))
    await waitIdle()
    expect(env.messages("a")).toHaveLength(104)
    readRelease()
    const renderedRelease = env.loader.retainSessionHistory(env.target("a"), "rendered")
    await waitIdle()
    expect(env.messages("a")).toHaveLength(104)
    renderedRelease()
    await waitIdle()
    expect(env.messages("a")).toBeUndefined()
  })

  test("runtime changes cancel cleanup and directories isolate equal session IDs", async () => {
    const env = setup("desktop", transcript, IDLE_TTL_MS)
    await env.select("a")
    env.leave()
    env.changeRuntime()
    await waitIdle()
    expect(env.messages("a")).toHaveLength(104)
    await env.select("a", "/other")
    expect(env.messages("a", "/other")).not.toBe(env.messages("a"))
  })

  test("failed history preserves visible native messages and retries from its cursor", async () => {
    const env = setup("desktop", (sessionId) => transcript(sessionId, 30, 12))
    await env.select("a")
    const previous = env.messages("a")
    const cursor = env.loader.getSnapshot(env.target("a")).cursor
    env.failNext()
    await env.loader.loadOlder(env.target("a"))
    expect(env.messages("a")).toBe(previous)
    expect(env.loader.getSnapshot(env.target("a"))).toMatchObject({ status: "error", cursor })
    await env.loader.loadOlder(env.target("a"))
    expect(env.messages("a")?.length).toBeGreaterThan(previous?.length ?? 0)
  })
})

describe("evicted native history after background events", () => {
  test("reloads an evicted history after a late native message", async () => {
    const env = setup("mobile")
    for (const sessionId of ["s0", "s1", "s2", "s3", "s4", "s5", "overflow"]) await env.select(sessionId)
    expect(env.messages("s0")).toBeUndefined()
    const late = nativeMessage("s0", "message-s0-late", 10_000)
    env.addBackground(late)
    const store = env.childStores.getChild("/repo")!
    store.setState({ message: { ...store.getState().message, s0: [late] } })
    await flush()
    const calls = env.requests.length
    await env.select("s0")
    expect(env.requests.length).toBeGreaterThan(calls)
    const messages = env.messages("s0") ?? []
    expect(messages.some((message) => message.messageId === "message-s0-late")).toBe(true)
    expect(messages.length).toBeGreaterThan(1)
    expect(env.loader.getSnapshot(env.target("s0"))).toMatchObject({ status: "ready", resolved: true, complete: true })
  })
})
