import { describe, expect, spyOn, test } from "bun:test"
import type { CanonicalEvent, SessionSnapshot } from "@openchamber/agent-contract"
import type { CanonicalClient } from "@/api/canonicalClient"
import { createEventPipeline } from "./event-pipeline"
import type { SessionMessageTarget } from "./session-message-loader"

const target: SessionMessageTarget = { directory: "/repo", sessionId: "session-1" }
const snapshot: SessionSnapshot = {
  session: { sessionId: "session-1", projectId: "project-1", workspaceId: "workspace-1", displayPath: ".", rootSessionId: "session-1", createdAt: 1, updatedAt: 1, epoch: "epoch-1", headSequence: "4", runtimeStatus: "idle", activeRunId: null, mode: { kind: "main" } },
  cursor: "epoch-1:4", activeRun: null,
  branch: { branchId: "branch-1", branchVersion: "0", leafMessageId: null },
  window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false },
  turns: [], messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: "replace", priorEpochs: "expired" },
}
const nativeEvent: CanonicalEvent = { sessionId: "session-1", epoch: "epoch-1", sequence: "5", timestamp: 5, type: "session.status", runtimeStatus: "idle", activeRunId: null }

const canonicalNotFound = { problem: { status: 404, code: "SESSION_NOT_FOUND" } }
function fakeClient() {
  let cleanupCount = 0
  let subscriptions = 0
  let cursor = ""
  let callback: ((event: CanonicalEvent) => void) | undefined
  let invalidated: (() => void) | undefined
  let failed: ((error: unknown) => void) | undefined
  const callbacks: ((event: CanonicalEvent) => void)[] = []
  const client = {
    subscribeSessionEvents(sessionId: string, eventCursor: string, onEvent: (event: CanonicalEvent) => void, onInvalidated: () => void, onError: (error: unknown) => void) {
      subscriptions += 1
      expect(sessionId).toBe(target.sessionId)
      cursor = eventCursor; callback = onEvent; invalidated = onInvalidated; failed = onError; callbacks.push(onEvent)
      return () => { cleanupCount += 1; callback = undefined }
    },
  } as unknown as CanonicalClient
  return { client, callbacks, fail: (error: unknown) => failed?.(error), emit: (event: CanonicalEvent) => callback?.(event), invalidate: () => invalidated?.(), counts: () => ({ cleanupCount, cursor, subscriptions }) }
}

function clock() {
  let next = 0
  const timers = new Map<number, { run: () => void; delay: number }>()
  const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((run: () => void, delay = 0) => {
    const id = ++next; timers.set(id, { run, delay }); return id
  }) as typeof setTimeout)
  const clear = spyOn(globalThis, "clearTimeout").mockImplementation(((id: number) => { timers.delete(id) }) as typeof clearTimeout)
  return {
    delays: () => [...timers.values()].map((timer) => timer.delay),
    run() { const first = timers.entries().next().value as [number, { run: () => void; delay: number }] | undefined; if (!first) throw new Error("No scheduled recovery"); timers.delete(first[0]); first[1].run() },
    restore() { timeout.mockRestore(); clear.mockRestore() },
  }
}

describe("native canonical event pipeline", () => {
  test("attaches from the snapshot cursor and forwards native events", () => {
    const fake = fakeClient()
    const batches: CanonicalEvent[][] = []
    const pipeline = createEventPipeline({ client: fake.client, isCurrent: () => true, onEvents: (_target, events) => { batches.push([...events]); return true }, recover: async () => {} })
    pipeline.attach(target, snapshot)
    fake.emit(nativeEvent)
    expect(fake.counts().cursor).toBe("epoch-1:4")
    expect(batches.flat()).toEqual([nativeEvent])
    pipeline.cleanup()
    expect(fake.counts().cleanupCount).toBe(1)
  })

  test("a cold snapshot without a worker does not request an event stream", () => {
    const fake = fakeClient()
    const pipeline = createEventPipeline({ client: fake.client, isCurrent: () => true, onEvents: () => true, recover: async () => {} })
    const cold = { ...snapshot, session: { ...snapshot.session, runtimeStatus: "unavailable" as const, activeRunId: null } }
    pipeline.attach(target, cold)
    expect(fake.counts().subscriptions).toBe(0)
    pipeline.cleanup()
    expect(fake.counts().cleanupCount).toBe(0)
  })

  test("destination attachment retires the source stream and rejects its late callbacks", () => {
    const fake = fakeClient()
    const received: SessionMessageTarget[] = []
    const pipeline = createEventPipeline({ client: fake.client, isCurrent: () => true, onEvents: (owner) => { received.push(owner); return true }, recover: async () => {} })
    const destination = { ...target, directory: "/destination" }
    try {
      pipeline.attach(target, snapshot)
      const oldCallback = fake.callbacks[0]
      pipeline.attach(destination, snapshot)
      expect(fake.counts().cleanupCount).toBe(1)
      oldCallback?.(nativeEvent)
      expect(received).toEqual([])
      fake.emit(nativeEvent)
      expect(received).toEqual([destination])
    } finally { pipeline.cleanup() }
    expect(fake.counts().cleanupCount).toBe(2)
  })

  test("invalidates and disposes the session stream without a second subscription", () => {
    const fake = fakeClient()
    const recovered: SessionMessageTarget[] = []
    const pipeline = createEventPipeline({ client: fake.client, isCurrent: () => true, onEvents: () => true, recover: async (value) => { recovered.push(value) } })
    pipeline.attach(target, snapshot)
    fake.invalidate()
    pipeline.cleanup()
    expect(recovered).toEqual([])
    expect(fake.counts().cleanupCount).toBe(1)
  })

  test("detach cancels callbacks so stale native events cannot publish", () => {
    const fake = fakeClient()
    const received: CanonicalEvent[] = []
    const pipeline = createEventPipeline({ client: fake.client, isCurrent: () => true, onEvents: (_target, events) => { received.push(...events); return true }, recover: async () => {} })
    pipeline.attach(target, snapshot)
    pipeline.detach(target)
    fake.emit(nativeEvent)
    expect(received).toEqual([])
    expect(fake.counts().cleanupCount).toBe(1)
  })

  test("reconnect interrupts backoff and keeps recovery single-flight", async () => {
    const time = clock()
    const fake = fakeClient()
    let finish!: () => void
    let recoveries = 0
    let disconnected = 0
    const pipeline = createEventPipeline({ client: fake.client, isCurrent: () => true, onEvents: () => true,
      recover: () => { recoveries += 1; return new Promise<void>((resolve) => { finish = resolve }) }, onDisconnect: () => { disconnected += 1 } })
    try {
      pipeline.attach(target, snapshot)
      fake.fail(new TypeError("network"))
      expect(time.delays()).toEqual([250])
      pipeline.reconnect()
      expect(time.delays()).toEqual([0])
      time.run()
      pipeline.reconnect()
      expect(recoveries).toBe(1)
      expect(time.delays()).toEqual([])
      expect(disconnected).toBe(1)
      pipeline.attach(target, snapshot)
      finish(); await Promise.resolve()
      expect(time.delays()).toEqual([])
      fake.callbacks[0]!(nativeEvent)
      expect(fake.callbacks.length).toBe(2)
    } finally { pipeline.cleanup(); time.restore() }
  })

  test("permanent errors use the long cap and manual recovery cancels that wait", () => {
    const time = clock()
    const fake = fakeClient()
    const pipeline = createEventPipeline({ client: fake.client, isCurrent: () => true, onEvents: () => true, recover: async () => {} })
    try {
      pipeline.attach(target, snapshot)
      fake.fail(canonicalNotFound)
      expect(time.delays()).toEqual([60_000])
      pipeline.reconnect()
      expect(time.delays()).toEqual([0])
    } finally { pipeline.cleanup(); time.restore() }
  })

  test("gap recovery discards queued events and old-runtime recovery cannot retry", async () => {
    const time = clock()
    const fake = fakeClient()
    let current = true
    let reject!: (error: Error) => void
    let batches = 0
    const pipeline = createEventPipeline({ client: fake.client, isCurrent: () => current, onEvents: () => { batches += 1; return false }, recover: () => new Promise<void>((_resolve, failure) => { reject = failure }) })
    try {
      pipeline.attach(target, snapshot)
      fake.emit(nativeEvent)
      expect(time.delays()).toEqual([250])
      fake.callbacks[0]!(nativeEvent)
      expect(batches).toBe(1)
      time.run()
      current = false
      reject(new Error("obsolete runtime")); await Promise.resolve()
      expect(time.delays()).toEqual([])
    } finally { pipeline.cleanup(); time.restore() }
  })

  test("detach aborts retry and directory eviction preserves unrelated streams", () => {
    const time = clock()
    const fake = fakeClient()
    const pipeline = createEventPipeline({ client: fake.client, isCurrent: () => true, onEvents: () => true, recover: async () => {} })
    try {
      pipeline.attach(target, snapshot)
      pipeline.attach({ ...target, directory: "/other" }, snapshot)
      pipeline.clearDirectory(target.directory)
      expect(fake.counts().cleanupCount).toBe(1)
      fake.invalidate()
      expect(time.delays()).toEqual([250])
      pipeline.detach({ ...target, directory: "/other" })
      expect(time.delays()).toEqual([])
    } finally { pipeline.cleanup(); time.restore() }
  })
})
