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
<<<<<<< HEAD
      pipeline.attach(target, snapshot)
      pipeline.attach({ ...target, directory: "/other" }, snapshot)
      pipeline.clearDirectory(target.directory)
      expect(fake.counts().cleanupCount).toBe(1)
      fake.invalidate()
      expect(time.delays()).toEqual([250])
      pipeline.detach({ ...target, directory: "/other" })
      expect(time.delays()).toEqual([])
    } finally { pipeline.cleanup(); time.restore() }
=======
      await streamFinished
      await new Promise((resolve) => setTimeout(resolve, 50))
    } finally {
      pipeline.cleanup()
    }
    expect(activity).toBe(0)
  })

  describe("while the OpenChamber session is expired", () => {
    afterEach(() => {
      useAuthSessionStore.getState().markAuthenticated()
    })

    /**
     * Every attempt is refused, and the first refusal confirms the expiry. The failure carries no
     * HTTP status, as a refused SSE request or WebSocket upgrade does in a browser, so the
     * pipeline's normal retry backoff applies.
     */
    const createUnauthorizedSdk = (onAttempt: () => void): OpenCodeClient => {
      const client: Pick<OpenCodeClient, "event"> = {
        event: {
          subscribe: () => ({
            [Symbol.asyncIterator]: () => ({
              next: async () => {
                onAttempt()
                useAuthSessionStore.getState().markExpired()
                throw new Error("UI authentication required")
              },
            }),
          }),
        },
      }
      // SAFETY: the pipeline only touches `event.subscribe` on the client.
      return client as OpenCodeClient
    }

    test("stops reconnecting until the user logs in, then reconnects at once", async () => {
      let attempts = 0
      const pipeline = createEventPipeline({
        sdk: createUnauthorizedSdk(() => { attempts += 1 }),
        onEvents: () => undefined,
        transport: "sse",
        heartbeatTimeoutMs: 60_000,
      })
      try {
        // The retry backoff starts at 250 ms and doubles; three more attempts would fit here.
        await new Promise((resolve) => setTimeout(resolve, 2_000))
        expect(attempts).toBe(1)

        useAuthSessionStore.getState().markAuthenticated()
        for (let i = 0; i < 20 && attempts < 2; i += 1) await new Promise((resolve) => setTimeout(resolve, 5))
        expect(attempts).toBe(2)
      } finally {
        pipeline.cleanup()
      }
    })

    test("a pipeline cleaned up while waiting for the login never reconnects", async () => {
      let attempts = 0
      const pipeline = createEventPipeline({
        sdk: createUnauthorizedSdk(() => { attempts += 1 }),
        onEvents: () => undefined,
        transport: "sse",
        heartbeatTimeoutMs: 60_000,
      })
      await new Promise((resolve) => setTimeout(resolve, 400))
      pipeline.cleanup()
      useAuthSessionStore.getState().markAuthenticated()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(attempts).toBe(1)
    })
  })
})

/** A relay tunnel socket the test drives by hand. */
function createFakeSocket(): RelayTunnelWebSocket {
  let readyState = 1
  return {
    get readyState() { return readyState },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send: () => undefined,
    close: () => { readyState = 3 },
  }
}

describe("createEventPipeline over the WebSocket transport", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: Object.assign(new EventTarget(), { location: new URL("http://runtime.test") }),
      configurable: true,
      writable: true,
    })
    // A valid URL token lets the attempt open the socket without minting one.
    setRuntimeUrlAuthToken("fixture-url-token", Date.now() + 10 * 60_000)
  })

  afterEach(() => {
    deactivateRelayTunnel()
    clearRuntimeUrlAuthToken()
    Reflect.deleteProperty(globalThis, "window")
  })

  test("counts a heartbeat frame as stream activity without delivering an event", async () => {
    const paths: string[] = []
    const sockets: RelayTunnelWebSocket[] = []
    const tunnel: RelayTunnelClient = {
      async fetch() { throw new Error("the WebSocket transport must not fetch") },
      openWebSocket(pathWithQuery) {
        paths.push(pathWithQuery)
        const socket = createFakeSocket()
        sockets.push(socket)
        return socket
      },
      getStatus: () => ({ state: "connected" }),
      subscribeStatus: () => () => undefined,
      retry: () => undefined,
      close: () => undefined,
    }
    adoptRelayTunnel({ relayUrl: "wss://relay.test", serverId: "fixture", hostEncPubJwk: {} }, tunnel)
    const delivered: SyncEvent[] = []
    let activity = 0
    const pipeline = createEventPipeline({
      sdk: createSdk([], () => undefined),
      onEvents: (_directory, batch) => { delivered.push(...batch) },
      onStreamActivity: () => { activity += 1 },
      transport: "ws",
      heartbeatTimeoutMs: 1_000,
    })
    try {
      for (let i = 0; i < 20 && sockets.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
      expect(sockets).toHaveLength(1)
      expect(paths[0]).toContain("/api/global/event/ws")
      const socket = sockets[0]
      socket.onmessage?.({ data: JSON.stringify({ type: "ready" }) })
      socket.onmessage?.({
        data: JSON.stringify({ type: "event", payload: { type: "openchamber:heartbeat", timestamp: 1 }, directory: "global" }),
      })
      await new Promise((resolve) => setTimeout(resolve, 50))
    } finally {
      pipeline.cleanup()
    }
    // The ready frame and the heartbeat frame both prove the socket is alive. Neither is an event.
    expect(activity).toBe(2)
    expect(delivered).toEqual([])
  })
})

describe("classifyStreamPayload", () => {
  test("routes authoritative space task titles and refuses malformed title records", () => {
    const properties = { spaceId: "0123456789ab", taskTitle: { title: "Task", by: "user" } }
    expect(classifyStreamPayload({ type: "openchamber:space-task-title.updated", properties }, undefined))
      .toEqual({ kind: "space-task-title", properties })
    expect(classifyStreamPayload({ type: "openchamber:space-task-title.updated", properties: { ...properties, taskTitle: { title: "Task", by: "other" } } }, undefined))
      .toEqual({ kind: "events", events: [] })
  })
  test("classifies each payload kind by its type", () => {
    expect(classifyStreamPayload(textDelta("a"), undefined)).toMatchObject({ kind: "events", events: [{ directory: "/repo" }] })
    expect(classifyStreamPayload({ type: "openchamber:space-setup", properties: { spaceId: "0123456789ab" } }, undefined))
      .toEqual({ kind: "space-setup", spaceId: "0123456789ab" })
    expect(classifyStreamPayload({ type: "openchamber:space-setup", properties: { spaceId: "bad" } }, undefined))
      .toEqual({ kind: "events", events: [] })
    expect(classifyStreamPayload({ type: "openchamber:space-permission-stream", properties: { spaceId: "0123456789ab", status: "connected" } }, undefined))
      .toEqual({ kind: "space-permission-stream", spaceId: "0123456789ab" })
    expect(classifyStreamPayload({ type: "openchamber:space-permission-stream", properties: { spaceId: "bad", status: "connected" } }, undefined))
      .toEqual({ kind: "events", events: [] })
    // A space's policy and a request it left for the user keep the space's id for their owner.
    expect(classifyStreamPayload({
      type: "openchamber:permission-auto-accept.updated",
      properties: { sessions: { ses_1: true }, modes: { ses_1: "auto" }, revision: 2, spaceId: "0123456789ab" },
    }, undefined)).toMatchObject({ kind: "events", events: [{ event: { type: "openchamber.permission-auto-accept", properties: { spaceId: "0123456789ab" } } }] })
    expect(classifyStreamPayload({
      type: "openchamber:permission-auto-accept.left-for-user",
      properties: { permissionId: "per_1", sessionId: "ses_1", directory: null, spaceId: "0123456789ab" },
    }, undefined)).toMatchObject({ kind: "events", events: [{ event: { type: "openchamber.permission-left-for-user", properties: { spaceId: "0123456789ab" } } }] })
    expect(classifyStreamPayload({ type: "openchamber:session-archived", properties: { sessionID: "ses_1", archivedAt: 5 } }, "/frame"))
      .toMatchObject({ kind: "events", events: [{ directory: "/frame", event: { type: "session.patched" } }] })
    expect(classifyStreamPayload({ nothing: true }, undefined)).toEqual({ kind: "events", events: [] })
    expect(classifyStreamPayload("text", undefined)).toEqual({ kind: "events", events: [] })
  })

  // Each delta used to be tried against nine OpenChamber schemas before the
  // wire schema; failed zod parses build issue objects, so this cost ~37us per
  // delta (750ms for 20k on an M-series laptop). Dispatching on `type` brings
  // it under 1us. The bound is loose enough for slow CI and far below the old cost.
  test("classifies a stream of text deltas without trying unrelated schemas", () => {
    const payloads = Array.from({ length: 20_000 }, (_, index) => textDelta(`chunk ${index}`))
    const started = performance.now()
    let events = 0
    for (const payload of payloads) {
      const classified = classifyStreamPayload(payload, undefined)
      if (classified.kind === "events") events += classified.events.length
    }
    const elapsed = performance.now() - started
    expect(events).toBe(20_000)
    expect(elapsed).toBeLessThan(300)
>>>>>>> bc50ba56a
  })
})
