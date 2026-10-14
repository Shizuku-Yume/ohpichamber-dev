import { describe, expect, test } from "bun:test"
import type { Message } from "@openchamber/agent-contract"
import { dropSessionCaches, getProtectedSessionCacheIds } from "./session-cache"
import { ChildStoreManager } from './child-store'
import { SessionCacheRetention } from './session-cache-retention'
import { nativeApproval, nativeQuestion } from "./session-message-loader-test-fixtures"

const assistant = (messageId: string, sessionId: string): Message => ({
  messageId,
  sessionId,
  turnId: `turn-${sessionId}`,
  role: "assistant",
  createdAt: 1,
  parts: [],
})

type Cache = Parameters<typeof getProtectedSessionCacheIds>[0]
const emptyCache = (): Cache => ({ session_status: {}, message: {}, permission: {}, form: {} })

describe("getProtectedSessionCacheIds", () => {
  test("protects active native runtime statuses", () => {
    const cache = emptyCache()
    cache.session_status.running = "running"
    cache.session_status.waiting = "awaiting_input"
    cache.session_status.idle = "idle"
    cache.message.running = [assistant("m-1", "running")]
    expect([...getProtectedSessionCacheIds(cache)]).toEqual(["running", "waiting"])
  })

  test("protects pending approvals and questions", () => {
    const cache = emptyCache()
    cache.permission.s1 = [nativeApproval("s1")]
    cache.form.s2 = [nativeQuestion("s2")]
    expect(getProtectedSessionCacheIds(cache)).toEqual(new Set(["s1", "s2"]))
  })
})

test("eviction removes native transcript authority and cursors only for its session", () => {
  const cache: Cache = {
    ...emptyCache(), message: { a: [assistant("m-a", "a")], b: [] },
    snapshot: { a: {}, b: {} }, partOwner: { a: {}, b: {} },
    sessionEpoch: { a: "epoch-a", b: "epoch-b" }, sessionCursor: { a: "epoch-a:1", b: "epoch-b:1" },
    sessionStatusInvalidated: { a: true, b: true },
  }
  dropSessionCaches(cache, ["a"])
  expect(cache.message.a).toBeUndefined()
  expect(cache.snapshot?.a).toBeUndefined()
  expect(cache.partOwner?.a).toBeUndefined()
  expect(cache.sessionEpoch?.a).toBeUndefined()
  expect(cache.sessionCursor?.a).toBeUndefined()
  expect(cache.sessionStatusInvalidated?.a).toBeUndefined()
  expect(cache.message.b).toEqual([])
  expect(cache.sessionCursor?.b).toBe("epoch-b:1")
})

test('inline native token publications do not rescan session retention', async () => {
  const manager = new ChildStoreManager()
  const store = manager.ensureChild('/token-retention', { bootstrap: false })
  store.setState({ message: { session: [assistant('message', 'session')] } })
  let protectionReads = 0
  let evictions = 0
  const retention = new SessionCacheRetention(manager, {
    limit: 20,
    isCurrent: () => true,
    isViewed: () => { protectionReads += 1; return true },
    isProtected: () => false,
    evict: () => { evictions += 1 },
  })
  try {
    await Promise.resolve()
    const baseline = protectionReads
    expect(baseline).toBeGreaterThan(0)
    for (let index = 0; index < 20; index += 1) {
      const message = assistant('message', 'session')
      message.parts = [{ type: 'text', partId: 'text', content: String(index) }]
      store.setState({ message: { session: [message] } })
      await Promise.resolve()
    }
    expect(protectionReads).toBe(baseline)
    expect(evictions).toBe(0)
  } finally {
    retention.dispose()
    manager.disposeAll()
  }
})
