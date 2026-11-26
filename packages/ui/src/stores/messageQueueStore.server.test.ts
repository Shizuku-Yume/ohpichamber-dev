import { beforeEach, describe, expect, test } from "bun:test"
import { directoryEnvironment } from './test-support/directoryEnvironment'
import { switchRuntimeEndpoint } from '@/lib/runtime-switch'
import type { AttachedFile } from "./types/sessionTypes"
import type { MessageQueueUpdatedEvent } from "./messageQueueStore"
import type { QueueItem, QueueState } from "@openchamber/agent-contract"
import { QueueAppendRequestSchema } from "@openchamber/agent-contract"
import { registerWorkspaceDirectory } from './globalSessions'
import { nativeHostSession, nativeSnapshot } from '@/sync/session-message-loader-test-fixtures'

const environment = directoryEnvironment({ home: '/home/test' })
type FetchCall = { path: string; method: string; body: unknown; directory?: string }
let calls: FetchCall[] = []
let activeRuntimeKey = "runtime-a"
let respond: (call: FetchCall) => Response | Promise<Response> = () => new Response("{}", { status: 200 })

environment.respond(async (url, init) => {
  if (url.pathname === '/api/fs/home') return Response.json({ home: '/home/test', chatsRoot: '/chats' })
  if (!url.pathname.startsWith('/api/message-queue')) throw new Error(`Unexpected request: ${url}`)
  const call: FetchCall = {
    path: `${url.pathname}${url.search}`,
    method: init?.method ?? "GET",
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
  }
  const directory = new Headers(init?.headers).get('x-openchamber-directory')
  if (directory) call.directory = decodeURIComponent(directory)
  calls.push(call)
  return respond(call)
})
const activateRuntime = (key: string) => {
  activeRuntimeKey = key
  switchRuntimeEndpoint({ apiBaseUrl: 'https://local.test', runtimeKey: key })
}
const { selectInputHistoryEntries, useInputHistoryStore } = await import("./useInputHistoryStore")
const { useGlobalSessionsStore } = await import('./useGlobalSessionsStore')
const locateSession = (directory: string) => {
  const workspaceId = `workspace-${directory}`
  registerWorkspaceDirectory(workspaceId, directory)
  useGlobalSessionsStore.getState().upsertSession({ ...nativeHostSession(nativeSnapshot('session-1')), workspaceId, archivedAt: undefined })
}

const {
  applyMessageQueueUpdatedEvent,
  createMessageQueueTarget,
  getMessageQueueKey,
  useMessageQueueStore,
} = await import("./messageQueueStore")

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })

const deferredResponse = () => {
  let complete: ((response: Response) => void) | undefined
  const promise = new Promise<Response>((resolve) => { complete = resolve })
  return {
    promise, resolve: (response: Response) => {
      if (!complete) throw new Error("Deferred response was not initialized")
      complete(response)
    }
  }
}

const target = createMessageQueueTarget("session-1", "/repo", "runtime-a")!
const key = getMessageQueueKey(target)

const serverItem = (id: string, content: string, extra: Partial<QueueItem> = {}): QueueItem => {
  const base = {
    queueItemId: id,
    createdAt: 1,
    content,
    text: content,
    attachments: [],
    context: [],
    options: { providerId: "p", modelId: "m", agentId: null, variant: null, reasoningEffort: null },
    originalAvailable: true,
    ...extra,
  };
  if (base.status === "leased") {
    const lease = extra && 'lease' in extra && extra.lease ? extra.lease : { leaseId: "l1", expiresAt: 1000 };
    return {
      ...base,
      status: "leased",
      lease,
    };
  }
  return {
    ...base,
    status: "queued",
  };
};

const issueMetadata = { openchamberContext: { kind: "repository-issue" as const, number: 3, title: "Bug", url: "https://x/issues/3" } }

const queueState = (items: QueueItem[], revision = "1", sessionId = "session-1"): QueueState => ({
  sessionId,
  revision,
  items,
})

const snapshot = (items: QueueState[] = [], revision = "0"): { items: QueueState[]; revision: string; errors: unknown[] } => ({
  items,
  revision,
  errors: [],
})

const updated = (revision: string, queue: QueueState, spaceId?: string): MessageQueueUpdatedEvent => ({
  type: "openchamber:message-queue.updated",
  properties: { sessionId: queue.sessionId, revision, queue, spaceId },
})

const attachment: AttachedFile = {
  id: "att-1",
  file: new File(["hi"], "note.txt", { type: "text/plain" }),
  dataUrl: "data:text/plain;base64,aGk=",
  serverPath: "attachment://att-1",
  mimeType: "text/plain",
  filename: "note.txt",
  size: 2,
  source: "server",
}

beforeEach(() => {
  useMessageQueueStore.getState().resetForRuntimeSwitch(activeRuntimeKey)
  activateRuntime("runtime-a")
  locateSession('/repo')
  useInputHistoryStore.setState({ globalBuckets: {}, sessionBuckets: {} })
  calls = []
  respond = () => json(snapshot([queueState([])]))
  // Forgetting also drops the revision guard, so each test starts unordered.
  useMessageQueueStore.getState().forgetQueue(target)
  useMessageQueueStore.setState({ queuedMessages: {}, quarantinedLegacyMessages: {}, sendingIds: {} })
})

describe("server-owned message queue", () => {
  test("hydrate uploads messages queued by an older build before reading the server", async () => {
    useMessageQueueStore.setState({
      queuedMessages: {
        [key]: [{ id: "local-1", content: "from before", text: "from before", createdAt: 1, originalAvailable: true, sendConfig: { providerID: "p", modelID: "m" } }],
      },
    })
    respond = (call) => (call.method === "POST"
      ? json(queueState([serverItem("q1", "from before")], "2"))
      : json(snapshot([queueState([serverItem("q1", "from before")], "2")])))
    await useMessageQueueStore.getState().hydrate()

    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/message-queue/sessions/session-1/items",
      body: {
        expectedRevision: "0", content: "from before",
        request: {
          input: { text: "from before", attachments: [], context: [] },
          options: { providerId: "p", modelId: "m", agentId: null, variant: null, reasoningEffort: null },
        },
        draft: {
          content: "from before",
          text: "from before",
          attachments: [],
          context: [],
          options: { providerId: "p", modelId: "m", agentId: null, variant: null, reasoningEffort: null },
        },
      },
    })
    expect(calls[1]?.path).toBe("/api/message-queue")
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((m) => m.id)).toEqual(["q1"])
  })

  test("hydrate replaces the runtime's projection with the server queue", async () => {
    respond = () => json(snapshot([queueState([serverItem("q1", "hello", { status: "leased", lease: { leaseId: "lease-1", expiresAt: 1000 } })], "3")]))
    await useMessageQueueStore.getState().hydrate()

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /api/message-queue"])
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((m) => m.content)).toEqual(["hello"])
    expect(useMessageQueueStore.getState().sendingIds[key]).toEqual(["q1"])
  })

  test("hydrate keeps a queue newer than its snapshot", async () => {
    const read = deferredResponse()
    respond = () => read.promise
    const hydration = useMessageQueueStore.getState().hydrate()
    await environment.settle()
    applyMessageQueueUpdatedEvent(updated("10", queueState([serverItem("q1", "queued after the read started")], "10")), "runtime-a")
    read.resolve(json(snapshot([])))
    await hydration

    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((m) => m.id)).toEqual(["q1"])
  })

  test("context-only queue previews survive authoritative snapshots", async () => {
    respond = () => json(snapshot([queueState([serverItem("q1", "", { contextPreview: "Explain this quote" })], "3")]))
    await useMessageQueueStore.getState().hydrate()
    const queued = useMessageQueueStore.getState().queuedMessages[key]?.[0]
    expect(queued?.contextPreview).toBe("Explain this quote")
    expect(queued?.content).toBe("")
    expect(queued?.context).toBeUndefined()
  })

  test("resync can establish the initial snapshot before bootstrap", async () => {
    activateRuntime("runtime-never-hydrated")
    respond = () => json(snapshot([], "1"))
    await useMessageQueueStore.getState().resync()
    expect(calls).toHaveLength(1)
  })

  test("a reconnect during the initial snapshot retains one trailing refresh", async () => {
    const first = deferredResponse()
    respond = () => calls.length === 1 ? first.promise : json(snapshot([], "12"))
    const bootstrap = useMessageQueueStore.getState().hydrate()
    const reconnect = useMessageQueueStore.getState().resync()
    const secondReconnect = useMessageQueueStore.getState().resync()
    await environment.settle()
    expect(calls).toHaveLength(1)
    first.resolve(json(snapshot([queueState([serverItem("q1", "delivered after snapshot")], "10")])))
    await Promise.all([bootstrap, reconnect, secondReconnect])
    expect(calls).toHaveLength(2)
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined()
  })

  test("concurrent bootstrap and recovery migrate a legacy message only once", async () => {
    activateRuntime("runtime-legacy-recovery")
    const legacyTarget = createMessageQueueTarget("session-1", "/repo", activeRuntimeKey)
    if (!legacyTarget) throw new Error("Missing test target")
    const legacyKey = getMessageQueueKey(legacyTarget)
    useMessageQueueStore.setState({ queuedMessages: { [legacyKey]: [{ id: "local", content: "legacy", text: "legacy", createdAt: 1, originalAvailable: true, sendConfig: { providerID: "p", modelID: "m" } }] } })
    const upload = deferredResponse()
    respond = (call) => call.method === "POST" ? upload.promise : json(snapshot([]))
    const bootstrap = useMessageQueueStore.getState().hydrate()
    const recovery = useMessageQueueStore.getState().resync()
    upload.resolve(json(queueState([], "2")))
    await Promise.all([bootstrap, recovery])
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1)
    expect(useMessageQueueStore.getState().queuedMessages[legacyKey]).toBeUndefined()
  })

  test("an authoritative empty queue prevents delayed older responses from resurrecting its rows", async () => {
    applyMessageQueueUpdatedEvent(updated("10", queueState([serverItem("q1", "queued", { status: "leased", lease: { leaseId: "l1", expiresAt: 1000 } })], "10")), "runtime-a")
    respond = () => json(snapshot([queueState([], "12")], "12"))
    await useMessageQueueStore.getState().hydrate()
    applyMessageQueueUpdatedEvent(updated("11", queueState([serverItem("q1", "stale", { status: "leased", lease: { leaseId: "l1", expiresAt: 1000 } })], "11")), "runtime-a")
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined()
    expect(useMessageQueueStore.getState().sendingIds[key]).toBeUndefined()
  })

  test("recovery demand survives a failed in-flight snapshot", async () => {
    const first = deferredResponse()
    applyMessageQueueUpdatedEvent(updated("10", queueState([serverItem("q1", "delivered")], "10")), "runtime-a")
    respond = () => calls.length === 1 ? first.promise : json(snapshot([], "12"))
    const bootstrap = useMessageQueueStore.getState().hydrate()
    const recovery = useMessageQueueStore.getState().resync()
    first.resolve(new Response(null, { status: 503 }))
    await Promise.all([bootstrap, recovery])
    expect(calls).toHaveLength(2)
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined()
  })

  test("snapshot counters from another session never block this session's newer queue", async () => {
    const other = createMessageQueueTarget('other-queue', '/other', 'runtime-a')
    if (!other) throw new Error('Missing queue target')
    respond = () => json(snapshot([
      queueState([serverItem('other-1', 'other')], '100', other.sessionId),
      queueState([serverItem('q1', 'first')], '1'),
    ], '100'))
    await useMessageQueueStore.getState().hydrate()
    applyMessageQueueUpdatedEvent(updated('2', queueState([serverItem('q2', 'second')], '2')), 'runtime-a')
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((item) => item.id)).toEqual(['q2'])
  })

  test("a partial snapshot preserves unreadable queues while applying complete siblings", async () => {
    const other = createMessageQueueTarget('other-queue', '/other', 'runtime-a')
    if (!other) throw new Error('Missing queue target')
    applyMessageQueueUpdatedEvent(updated('8', queueState([serverItem('q1', 'keep')], '8')), 'runtime-a')
    respond = () => json({ items: [queueState([serverItem('other-1', 'fresh')], '2', other.sessionId)], errors: [{ code: 'INTERNAL_ERROR' }] })
    await useMessageQueueStore.getState().hydrate()
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((item) => item.content)).toEqual(['keep'])
    expect(useMessageQueueStore.getState().queuedMessages[getMessageQueueKey(other)]?.map((item) => item.content)).toEqual(['fresh'])
  })

  test("returning to a runtime migrates its unattempted legacy messages without repeating the first upload", async () => {
    activateRuntime("runtime-partial-migration")
    const legacyTarget = createMessageQueueTarget("session-1", "/repo", activeRuntimeKey)
    if (!legacyTarget) throw new Error("Missing test target")
    const legacyKey = getMessageQueueKey(legacyTarget)
    useMessageQueueStore.setState({ queuedMessages: { [legacyKey]: ["first", "second"].map((id) => ({ id, content: id, text: id, createdAt: 1, originalAvailable: true, sendConfig: { providerID: "p", modelID: "m" } })) } })
    const first = deferredResponse()
    respond = (call) => call.method === "POST"
      ? calls.length === 1 ? first.promise : json(queueState([], "2"))
      : json(snapshot([], "3"))
    const initial = useMessageQueueStore.getState().hydrate()
    useMessageQueueStore.getState().resetForRuntimeSwitch(activeRuntimeKey)
    await environment.settle()
    activateRuntime("runtime-other")
    first.resolve(json(queueState([], "1")))
    await initial
    activateRuntime("runtime-partial-migration")
    await useMessageQueueStore.getState().hydrate()
    expect(calls.filter((call) => call.method === "POST").map((call) => QueueAppendRequestSchema.parse(call.body).content)).toEqual(["first", "second"])
  })

  test("a failed refresh preserves the projection and a later recovery retries", async () => {
    applyMessageQueueUpdatedEvent(updated("10", queueState([serverItem("q1", "queued")], "10")), "runtime-a")
    respond = () => new Response(null, { status: 503 })
    await expect(useMessageQueueStore.getState().resync()).rejects.toThrow()
    expect(useMessageQueueStore.getState().queuedMessages[key]).toHaveLength(1)
    respond = () => json(snapshot([], "12"))
    await useMessageQueueStore.getState().resync()
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined()
  })

  test("a runtime switch rejects an old snapshot and its pending recovery", async () => {
    const old = deferredResponse()
    respond = () => old.promise
    const bootstrap = useMessageQueueStore.getState().hydrate()
    const recovery = useMessageQueueStore.getState().resync()
    useMessageQueueStore.getState().resetForRuntimeSwitch(activeRuntimeKey)
    await environment.settle()
    activateRuntime("runtime-b")
    respond = () => json(snapshot([], "1"))
    await useMessageQueueStore.getState().hydrate()
    old.resolve(json(snapshot([queueState([serverItem("q1", "old runtime")], "99")], "99")))
    await Promise.all([bootstrap, recovery])
    expect(Object.keys(useMessageQueueStore.getState().queuedMessages)).toHaveLength(0)
    expect(calls).toHaveLength(2)
  })

  test("resync drops a queue the server no longer lists", async () => {
    useMessageQueueStore.setState({ queuedMessages: { [key]: [{ id: "q1", content: "dropped", text: "dropped", createdAt: 1, originalAvailable: true }] } })
    respond = () => json(snapshot([]))
    await useMessageQueueStore.getState().resync()
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBe(undefined)
  })

  test("addToQueue shows the message at once and settles on the server's copy", async () => {
    respond = () => json(queueState([serverItem("srv-1", "hi @reviewer", { agentMention: { agentId: "reviewer" } })], "5"))
    const pending = useMessageQueueStore.getState().addToQueue(target, {
      content: "hi @reviewer",
      text: "hi",
      agentMention: "reviewer",
      attachments: [attachment],
      sendConfig: { providerID: "p", modelID: "m", agent: "build" },
    })
    expect(useMessageQueueStore.getState().queuedMessages[key]).toHaveLength(1)
    await pending

    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/message-queue/sessions/session-1/items",
      body: {
        expectedRevision: "0",
        content: "hi @reviewer",
        request: {
          input: {
            text: "hi",
            attachments: [{ attachmentId: "att-1", name: "note.txt", mediaType: "text/plain", size: 2, uri: "attachment://att-1" }],
            context: [],
            agentMention: { agentId: "reviewer" },
          },
          options: {
            providerId: "p",
            modelId: "m",
            agentId: "build",
            variant: null,
            reasoningEffort: null,
          },
        },
        draft: {
          content: "hi @reviewer",
          text: "hi",
          attachments: [{ attachmentId: "att-1", name: "note.txt", mediaType: "text/plain", size: 2, uri: "attachment://att-1" }],
          context: [],
          agentMention: { agentId: "reviewer" },
          options: {
            providerId: "p",
            modelId: "m",
            agentId: "build",
            variant: null,
            reasoningEffort: null,
          },
        },
      },
    })
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((m) => m.id)).toEqual(["srv-1"])
  })

  test("accepted queue history survives Host delivery and rejected manual take without recapture", async () => {
    const historyTarget = { runtimeKey: 'runtime-a', directory: '/repo', sessionId: 'history-accepted' };
    const item = serverItem('history-item', 'original prompt');
    respond = () => json(queueState([item], "100", historyTarget.sessionId));
    const pending = useMessageQueueStore.getState().addToQueue(historyTarget, {
      content: item.content,
      attachments: [{ ...attachment, dataUrl: 'file:///repo/note.txt' }],
      sendConfig: { providerID: 'p', modelID: 'm' },
    });
    const entries = () => selectInputHistoryEntries({ ...useInputHistoryStore.getState(), scope: 'session' }, historyTarget);
    expect(entries()).toHaveLength(0);
    await pending;
    expect(entries().map((entry) => entry.text)).toEqual(['original prompt']);
    // A server delivery broadcast removes the projection, never the history.
    applyMessageQueueUpdatedEvent(updated("101", queueState([], "101", historyTarget.sessionId)), historyTarget.runtimeKey);
    expect(entries()).toHaveLength(1);
    expect(entries()).toHaveLength(1);
  });

  test("queue acceptance records the captured owner after the active runtime changes", async () => {
    const historyTarget = { runtimeKey: 'runtime-a', directory: '/original', sessionId: 'history-runtime-switch' };
    respond = () => {
      activateRuntime('runtime-b');
      return json(queueState([], "110", historyTarget.sessionId));
    };
    await useMessageQueueStore.getState().addToQueue(historyTarget, {
      content: 'for original runtime', sendConfig: { providerID: 'p', modelID: 'm' },
    });
    expect(selectInputHistoryEntries({ ...useInputHistoryStore.getState(), scope: 'session' }, historyTarget).map((entry) => entry.text)).toEqual(['for original runtime']);
    expect(selectInputHistoryEntries({ ...useInputHistoryStore.getState(), scope: 'session' }, { ...historyTarget, runtimeKey: activeRuntimeKey })).toEqual([]);
  });

  test("a rejected queue acceptance records no history", async () => {
    const historyTarget = { runtimeKey: 'runtime-a', directory: '/repo', sessionId: 'history-rejected' };
    respond = () => new Response('rejected', { status: 500 });
    await expect(useMessageQueueStore.getState().addToQueue(historyTarget, {
      content: 'rejected prompt', sendConfig: { providerID: 'p', modelID: 'm' },
    })).rejects.toThrow();
    expect(selectInputHistoryEntries({ ...useInputHistoryStore.getState(), scope: 'session' }, historyTarget)).toEqual([]);
  });

  test("addToQueue hands captured context to the Host inside the preserved original draft", async () => {
    const context = [
      { kind: "context" as const, text: "issue body", metadata: issueMetadata },
      { kind: "synthetic" as const, text: "conflict payload" },
    ]
    respond = () => json(queueState([serverItem("srv-1", "with context")], "6"))
    await useMessageQueueStore.getState().addToQueue(target, {
      content: "with context",
      context,
      sendConfig: { providerID: "p", modelID: "m" },
    })
    // SAFETY: the body is the QueueAppendRequest the store just serialized in this test; the assertion reads only the fields the append contract defines.
    const callBody = calls[0]?.body as { contextPreview?: string; request: { input: { context: unknown[] } }; draft?: { context: unknown[] } }
    expect(callBody?.request?.input?.context).toEqual(context)
    expect(callBody?.contextPreview).toBe("Bug")
    expect(callBody?.draft?.context).toEqual(context)
    expect(useMessageQueueStore.getState().queuedMessages[key]?.[0]?.context).toBe(undefined)
  })

  test("captured reasoning effort survives queue acceptance and reload under Host ownership", async () => {
    const sendConfig = { providerID: "p", modelID: "m", reasoningEffort: "high" }
    const item = serverItem("effort-1", "think carefully", {
      options: { providerId: "p", modelId: "m", agentId: null, variant: null, reasoningEffort: "high" },
    })
    respond = () => json(queueState([item], "6"))
    await useMessageQueueStore.getState().addToQueue(target, { content: item.content, sendConfig })
    const callBody = calls[0]?.body as { request?: { options?: { reasoningEffort?: string } } }
    expect(callBody?.request?.options?.reasoningEffort).toEqual("high")
    expect(useMessageQueueStore.getState().queuedMessages[key]?.[0]?.sendConfig).toEqual(sendConfig)

    respond = () => json(snapshot([queueState([item], "7")]))
    await useMessageQueueStore.getState().resync()
    expect(useMessageQueueStore.getState().queuedMessages[key]?.[0]?.sendConfig).toEqual(sendConfig)

    expect(useMessageQueueStore.getState().queuedMessages[key]?.[0]?.sendConfig).toEqual(sendConfig)
  })

  test("a server item with malformed context is rejected at the boundary", async () => {
    respond = () => json(snapshot([{
      ...queueState([]),
      items: [{
        ...serverItem("srv-1", "x"),
        context: [{ index: 0, kind: "invalid-kind" as unknown as "context", hasInstructions: false }],
      }],
    }]))
    await expect(useMessageQueueStore.getState().resync()).rejects.toThrow()
  })
  test("addToQueue rolls the optimistic entry back when the server refuses", async () => {
    respond = () => new Response("nope", { status: 500 })
    await expect(useMessageQueueStore.getState().addToQueue(target, {
      content: "x",
      sendConfig: { providerID: "p", modelID: "m" },
    })).rejects.toThrow()
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBe(undefined)
  })

  test("addToQueue refuses a message with no captured model", async () => {
    await expect(useMessageQueueStore.getState().addToQueue(target, { content: "x" })).rejects.toThrow()
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBe(undefined)
    expect(calls).toHaveLength(0)
  })

  test("a taken message leaves the queue and hands its full original draft back", async () => {
    const draft = {
      content: "with file [note.txt]",
      text: "with file",
      attachments: [{
        attachmentId: "att-1", name: "note.txt", mediaType: "text/plain", size: 2, uri: "attachment://att-1",
        agentPath: "/repo/note.txt",
        original: { mimeType: "text/plain", dataUrl: "data:text/plain;base64,aGk=", saveOnSend: true },
      }],
      context: [{ kind: "context", text: "issue body", metadata: issueMetadata }],
      agentMention: { agentId: "reviewer" },
      options: { providerId: "p", modelId: "m", agentId: "build", variant: "high", reasoningEffort: "medium" },
      goal: { objective: "ship it", tokenBudget: 4000 },
    }
    respond = () => json(snapshot([queueState([serverItem("q1", "with file [note.txt]")], "3")]))
    await useMessageQueueStore.getState().resync()
    respond = (call) => call.path.endsWith("/take")
      ? json({ queue: queueState([], "4"), draft, text: draft.text, content: draft.content, createdAt: 1 })
      : json(snapshot([]))

    const result = await useMessageQueueStore.getState().takeQueuedItem(target, "q1")

    expect(calls[1]).toEqual({
      method: "POST",
      path: "/api/message-queue/sessions/session-1/items/q1/take",
      body: { expectedRevision: "3", queueItemId: "q1" },
    })
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined()
    if (result.status !== 'taken') throw new Error(`expected a full take, got ${result.status}`)
    expect(result.draft).toEqual(draft)
    expect(result.message.content).toBe("with file [note.txt]")
    expect(result.message.text).toBe("with file")
    expect(result.message.agentMention).toBe("reviewer")
    expect(result.message.sendConfig).toEqual({ providerID: "p", modelID: "m", agent: "build", variant: "high", reasoningEffort: "medium" })
    expect(result.message.goal).toEqual({ objective: "ship it", tokenBudget: 4000 })
    expect(result.message.context).toEqual([{ kind: "context", text: "issue body", metadata: issueMetadata }])
    expect(result.message.originalAvailable).toBe(true)
    // The saveOnSend original rides back as the real picked file, re-armed for re-saving at send.
    const restored = result.message.attachments?.[0]
    expect(restored?.saveOnSend).toBe(true)
    expect(restored?.serverPath).toBeUndefined()
    expect(restored?.agentPath).toBeUndefined()
    expect(restored?.mimeType).toBe("text/plain")
    expect(restored?.size).toBe(2)
    expect(restored?.dataUrl).toBe("data:text/plain;base64,aGk=")
  })

  test("a reference-only attachment restores its reference identity", async () => {
    const draft = {
      content: "see [note.txt]",
      text: "see",
      attachments: [{ attachmentId: "att-1", name: "note.txt", mediaType: "text/plain", size: 2, uri: "attachment://att-1" }],
      context: [],
      options: { providerId: "p", modelId: "m", agentId: null, variant: null, reasoningEffort: null },
    }
    respond = () => json(snapshot([queueState([serverItem("q1", "see [note.txt]")], "3")]))
    await useMessageQueueStore.getState().resync()
    respond = () => json({ queue: queueState([], "4"), draft, text: draft.text, content: draft.content, createdAt: 1 })

    const result = await useMessageQueueStore.getState().takeQueuedItem(target, "q1")
    if (result.status !== 'taken') throw new Error(`expected a full take, got ${result.status}`)
    const restored = result.message.attachments?.[0]
    expect(restored?.serverPath).toBe("attachment://att-1")
    expect(restored?.saveOnSend).toBeUndefined()
  })

  test("a refused take leaves the queue untouched and refreshes the projection", async () => {
    respond = () => json(snapshot([queueState([serverItem("q1", "busy")], "3")]))
    await useMessageQueueStore.getState().resync()
    respond = (call) => call.path.endsWith("/take")
      ? new Response("conflict", { status: 409 })
      : json(snapshot([queueState([serverItem("q1", "busy", { status: "leased", lease: { leaseId: "l1", expiresAt: 1000 } })], "5")]))

    const result = await useMessageQueueStore.getState().takeQueuedItem(target, "q1")

    expect(result.status).toBe("refused")
    // The refresh re-read the owner snapshot: the item is still queued, now leased.
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((m) => m.id)).toEqual(["q1"])
    expect(useMessageQueueStore.getState().sendingIds[key]).toEqual(["q1"])
  })

  test("a missing take reports the item is already gone", async () => {
    respond = () => json(snapshot([queueState([serverItem("q1", "raced")], "3")]))
    await useMessageQueueStore.getState().resync()
    respond = (call) => call.path.endsWith("/take")
      ? new Response("gone", { status: 404 })
      : json(snapshot([]))

    const result = await useMessageQueueStore.getState().takeQueuedItem(target, "q1")

    expect(result.status).toBe("missing")
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined()
  })

  test("a concurrent take loser is refused while the winner keeps the draft", async () => {
    const draft = {
      content: "raced", text: "raced", attachments: [], context: [],
      options: { providerId: "p", modelId: "m", agentId: null, variant: null, reasoningEffort: null },
    }
    respond = () => json(snapshot([queueState([serverItem("q1", "raced")], "3")]))
    await useMessageQueueStore.getState().resync()
    // The first take wins; the queue moves to revision 4, so the second take's
    // expectedRevision is stale and the host answers 409.
    let taken = false
    respond = (call) => {
      if (!call.path.endsWith("/take")) return json(snapshot([queueState([], "4")]))
      if (taken) return new Response("conflict", { status: 409 })
      taken = true
      return json({ queue: queueState([], "4"), draft, text: draft.text, content: draft.content, createdAt: 1 })
    }

    const first = await useMessageQueueStore.getState().takeQueuedItem(target, "q1")
    expect(first.status).toBe("taken")
    // The loser is a second client whose projection never saw the winner's
    // broadcast: it still holds revision 3 and its take arrives stale. Simulate
    // that client by re-seeding this projection at the pre-take revision.
    useMessageQueueStore.getState().forgetQueue(target)
    applyMessageQueueUpdatedEvent(updated("3", queueState([serverItem("q1", "raced")], "3")), "runtime-a")
    const second = await useMessageQueueStore.getState().takeQueuedItem(target, "q1")
    expect(second.status).toBe("refused")
    expect(calls.filter((call) => call.path.endsWith("/take")).map((call) => call.body)).toEqual([
      { expectedRevision: "3", queueItemId: "q1" },
      { expectedRevision: "3", queueItemId: "q1" },
    ])
  })

  test("an old record without an original draft restores partially and says so", async () => {
    const item = serverItem("q1", "older prompt", { originalAvailable: false })
    respond = () => json(snapshot([queueState([item], "3")]))
    await useMessageQueueStore.getState().resync()
    respond = () => json({ queue: queueState([], "4"), draft: null, text: "older prompt", content: "older prompt", createdAt: 1 })

    const result = await useMessageQueueStore.getState().takeQueuedItem(target, "q1")

    expect(result.status).toBe("taken-partial")
    if (result.status !== 'taken-partial') throw new Error('unreachable')
    expect(result.message.content).toBe("older prompt")
    expect(result.message.originalAvailable).toBe(false)
    // Descriptor-level projection data survives: the captured send config is real.
    expect(result.message.sendConfig).toEqual({ providerID: "p", modelID: "m" })
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined()
  })

  test("a network failure on take throws and keeps the item queued", async () => {
    respond = () => json(snapshot([queueState([serverItem("q1", "still here")], "3")]))
    await useMessageQueueStore.getState().resync()
    respond = (call) => call.path.endsWith("/take")
      ? new Response("boom", { status: 500 })
      : json(snapshot([queueState([serverItem("q1", "still here")], "3")]))

    await expect(useMessageQueueStore.getState().takeQueuedItem(target, "q1")).rejects.toThrow()
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((m) => m.id)).toEqual(["q1"])
  })

  test("popToInput delegates to the take", async () => {
    const draft = {
      content: "pop me", text: "pop me", attachments: [], context: [],
      options: { providerId: "p", modelId: "m", agentId: null, variant: null, reasoningEffort: null },
    }
    respond = () => json(snapshot([queueState([serverItem("q1", "pop me")], "3")]))
    await useMessageQueueStore.getState().resync()
    respond = () => json({ queue: queueState([], "4"), draft, text: draft.text, content: draft.content, createdAt: 1 })

    const result = await useMessageQueueStore.getState().popToInput(target, "q1")
    expect(result.status).toBe("taken")
  })

  test("broadcasts update the projection but never move it backwards", () => {
    applyMessageQueueUpdatedEvent(updated("4", queueState([serverItem("q1", "newer")], "4")), "runtime-a")
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((m) => m.content)).toEqual(["newer"])

    applyMessageQueueUpdatedEvent(updated("2", queueState([serverItem("q0", "older")], "2")), "runtime-a")
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((m) => m.content)).toEqual(["newer"])

    applyMessageQueueUpdatedEvent(updated("9", queueState([serverItem("q1", "newer")], "9")), "runtime-b")
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((m) => m.content)).toEqual(["newer"])
  })

  test("a session move moves its queue projection instead of copying it", () => {
    applyMessageQueueUpdatedEvent(updated('4', queueState([serverItem("q1", "queued")], '4')), "runtime-a")
    locateSession('/repo/moved')
    applyMessageQueueUpdatedEvent(updated('5', queueState([serverItem("q1", "queued")], '5')), "runtime-a")

    const movedTarget = createMessageQueueTarget("session-1", "/repo/moved", "runtime-a")
    if (!movedTarget) throw new Error("moved target must be valid")
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined()
    expect(useMessageQueueStore.getState().queuedMessages[getMessageQueueKey(movedTarget)]?.map((m) => m.id)).toEqual(["q1"])
  })

  test("an old-directory response that arrives after the move event cannot bring the old row back", async () => {
    const movedTarget = createMessageQueueTarget("session-1", "/repo/moved", "runtime-a")
    if (!movedTarget) throw new Error("moved target must be valid")
    const movedKey = getMessageQueueKey(movedTarget)
    const enqueue = deferredResponse()
    respond = () => enqueue.promise
    const pending = useMessageQueueStore.getState().addToQueue(target, {
      content: "first",
      text: "first",
      sendConfig: { providerID: "p", modelID: "m" },
    })

    locateSession('/repo/moved')
    applyMessageQueueUpdatedEvent(updated('5', queueState([
      serverItem("q1", "first", { status: 'leased', lease: { leaseId: 'lease-1', expiresAt: 1000 } }),
      serverItem("q2", "second"),
    ], '5')), "runtime-a")
    enqueue.resolve(json(queueState([serverItem("q1", "first")], '4')))
    await pending

    const state = useMessageQueueStore.getState()
    expect(Object.keys(state.queuedMessages)).toEqual([movedKey])
    expect(state.queuedMessages[movedKey]?.map((m) => m.id)).toEqual(["q1", "q2"])
    expect(state.sendingIds).toEqual({ [movedKey]: ["q1"] })
  })

  test("a first snapshot older than a move cannot restore the old directory, delivered or not", async () => {
    const movedTarget = createMessageQueueTarget("session-1", "/repo/moved", "runtime-a")
    if (!movedTarget) throw new Error("moved target must be valid")
    const movedKey = getMessageQueueKey(movedTarget)
    for (const delivered of [false, true]) {
      useMessageQueueStore.getState().resetForRuntimeSwitch("runtime-a")
      useMessageQueueStore.setState({ queuedMessages: {}, sendingIds: {} })
      const snapshot = deferredResponse()
      respond = () => snapshot.promise
      const bootstrap = useMessageQueueStore.getState().hydrate()
      locateSession('/repo/moved')
      applyMessageQueueUpdatedEvent(updated('5', queueState([serverItem("q1", "queued", { status: 'leased', lease: { leaseId: 'lease-1', expiresAt: 1000 } })], '5')), "runtime-a")
      if (delivered) applyMessageQueueUpdatedEvent(updated('6', queueState([], '6')), "runtime-a")
      snapshot.resolve(json({ revision: 4, items: [queueState([serverItem("q1", "queued", { status: 'leased', lease: { leaseId: 'lease-1', expiresAt: 1000 } })], '4')] }))
      await bootstrap

      const state = useMessageQueueStore.getState()
      expect(Object.keys(state.queuedMessages)).toEqual(delivered ? [] : [movedKey])
      expect(state.sendingIds).toEqual(delivered ? {} : { [movedKey]: ["q1"] })
    }
  })

  test("an older broadcast for a directory the session never showed under is ignored after a move", () => {
    const movedTarget = createMessageQueueTarget("session-1", "/repo/moved", "runtime-a")
    if (!movedTarget) throw new Error("moved target must be valid")
    locateSession('/repo/moved')
    applyMessageQueueUpdatedEvent(updated('5', queueState([serverItem("q1", "moved")], '5')), "runtime-a")
    applyMessageQueueUpdatedEvent(updated('4', queueState([serverItem("q0", "before the move")], '4')), "runtime-a")

    expect(Object.keys(useMessageQueueStore.getState().queuedMessages)).toEqual([getMessageQueueKey(movedTarget)])
  })

  test("an empty session without a directory still clears the projection it was keyed under", () => {
    applyMessageQueueUpdatedEvent(updated("4", queueState([serverItem("q1", "queued", { status: "leased", lease: { leaseId: "l1", expiresAt: 1000 } })], "4")), "runtime-a")
    expect(useMessageQueueStore.getState().queuedMessages[key]).toHaveLength(1)
    expect(useMessageQueueStore.getState().sendingIds[key]).toEqual(["q1"])

    // A server that forgot the directory once the queue emptied.
    applyMessageQueueUpdatedEvent(updated("5", queueState([], "5")), "runtime-a")
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBe(undefined)
    expect(useMessageQueueStore.getState().sendingIds[key]).toBe(undefined)
  })

  test("removeFromQueue and clearQueue update locally and tell the server", async () => {
    useMessageQueueStore.setState({ queuedMessages: { [key]: [{ id: "q1", content: "a", text: "a", createdAt: 1, originalAvailable: true }, { id: "q2", content: "b", text: "b", createdAt: 2, originalAvailable: true }] } })
    respond = () => json(queueState([serverItem("q2", "b")], "10"))
    useMessageQueueStore.getState().removeFromQueue(target, "q1")
    expect(useMessageQueueStore.getState().queuedMessages[key]?.map((m) => m.id)).toEqual(["q2"])
    await environment.settle()
    expect(calls[0]).toEqual({ method: "DELETE", path: "/api/message-queue/sessions/session-1/items/q1", body: { expectedRevision: "0", queueItemId: "q1" } })

    respond = () => json(queueState([], "11"))
    useMessageQueueStore.getState().clearQueue(target)
    expect(useMessageQueueStore.getState().queuedMessages[key]).toBe(undefined)
    await environment.settle()
    expect(calls[1]).toEqual({ method: "DELETE", path: "/api/message-queue/sessions/session-1/items/q2", body: { expectedRevision: "10", queueItemId: "q2" } })
  })

  test("reorderQueue sends the complete new order", async () => {
    useMessageQueueStore.setState({ queuedMessages: { [key]: [{ id: "q1", content: "a", text: "a", createdAt: 1, originalAvailable: true }, { id: "q2", content: "b", text: "b", createdAt: 2, originalAvailable: true }] } })
    respond = () => json(queueState([serverItem("q2", "b"), serverItem("q1", "a")], "12"))
    useMessageQueueStore.getState().reorderQueue(target, "q2", "q1")
    await environment.settle()
    expect(calls[0]).toEqual({ method: "PUT", path: "/api/message-queue/sessions/session-1/order", body: { expectedRevision: "0", queueItemIds: ["q2", "q1"] } })
  })

  test("a snapshot that lands before session discovery keys its rows once discovery resolves the session", async () => {
    const lateSession = 'late-session'
    respond = () => json(snapshot([queueState([serverItem("q1", "queued elsewhere")], "3", lateSession)]))
    await useMessageQueueStore.getState().hydrate()

    const lateTarget = createMessageQueueTarget(lateSession, "/repo", "runtime-a")
    if (!lateTarget) throw new Error("missing late target")
    const lateKey = getMessageQueueKey(lateTarget)
    // Discovery has not run: the rows exist but cannot key under the composer's directory yet.
    expect(useMessageQueueStore.getState().queuedMessages[lateKey]).toBeUndefined()

    const workspaceId = `workspace-/repo`
    useGlobalSessionsStore.getState().upsertSession({
      ...nativeHostSession(nativeSnapshot(lateSession)), workspaceId, archivedAt: undefined,
    })

    expect(useMessageQueueStore.getState().queuedMessages[lateKey]?.map((m) => m.id)).toEqual(["q1"])
    expect(useMessageQueueStore.getState().queuedMessages[`runtime-a\n\n${lateSession}`]).toBeUndefined()
  })

  test("parked rows rekey when the session's workspace directory registers late", async () => {
    const lateSession = 'late-workspace-session'
    const workspaceId = 'workspace-late-arrival'
    applyMessageQueueUpdatedEvent(updated("4", queueState([serverItem("q1", "parked")], "4", lateSession)), "runtime-a")

    // The session entity arrives while its workspace directory is still unknown:
    // the entity map update alone cannot place the rows.
    useGlobalSessionsStore.getState().upsertSession({
      ...nativeHostSession(nativeSnapshot(lateSession)), workspaceId, archivedAt: undefined,
    })
    const lateTarget = createMessageQueueTarget(lateSession, "/late-arrival", "runtime-a")
    if (!lateTarget) throw new Error("missing late target")
    const lateKey = getMessageQueueKey(lateTarget)
    expect(useMessageQueueStore.getState().queuedMessages[lateKey]).toBeUndefined()
    expect(useMessageQueueStore.getState().queuedMessages[`runtime-a\n\n${lateSession}`]?.map((m) => m.id)).toEqual(["q1"])

    // The workspace resolution landing afterwards must still rekey the rows.
    registerWorkspaceDirectory(workspaceId, "/late-arrival")
    expect(useMessageQueueStore.getState().queuedMessages[lateKey]?.map((m) => m.id)).toEqual(["q1"])
    expect(useMessageQueueStore.getState().queuedMessages[`runtime-a\n\n${lateSession}`]).toBeUndefined()
  })

  test("a queue event that lands before session discovery survives it instead of vanishing", async () => {
    const lateSession = 'late-event-session'
    applyMessageQueueUpdatedEvent(updated("4", queueState([serverItem("q1", "early")], "4", lateSession)), "runtime-a")

    const workspaceId = `workspace-/repo`
    useGlobalSessionsStore.getState().upsertSession({
      ...nativeHostSession(nativeSnapshot(lateSession)), workspaceId, archivedAt: undefined,
    })

    const lateTarget = createMessageQueueTarget(lateSession, "/repo", "runtime-a")
    if (!lateTarget) throw new Error("missing late target")
    expect(useMessageQueueStore.getState().queuedMessages[getMessageQueueKey(lateTarget)]?.map((m) => m.content)).toEqual(["early"])
  })
})

describe("a session in an isolated space", () => {
  const SPACE = "a1b2c3d4e5f6"
  const spaceDirectory = `/spaces/${SPACE}/repo`
  const spaceTarget = createMessageQueueTarget("space-session", spaceDirectory, "runtime-a")!
  const spaceKey = getMessageQueueKey(spaceTarget)
  const spaceQueue = (items: QueueItem[], revision = "1") => queueState(items, revision, "space-session")

  beforeEach(() => {
    useMessageQueueStore.getState().forgetQueue(spaceTarget)
  })

  test("its queue requests go to the space, and the space's answer settles the projection", async () => {
    respond = () => json(spaceQueue([serverItem("s1", "later")], "1"))
    await useMessageQueueStore.getState().addToQueue(spaceTarget, { content: "later", sendConfig: { providerID: "p", modelID: "m" } })
    useMessageQueueStore.getState().removeFromQueue(spaceTarget, "s1")
    await environment.settle()

    expect(calls.map((call) => [call.method, call.path, call.directory])).toEqual([
      ["POST", "/api/message-queue/sessions/space-session/items", spaceDirectory],
      ["DELETE", "/api/message-queue/sessions/space-session/items/s1", spaceDirectory],
    ])
  })

  test("the host's snapshot leaves a space's queue alone, and the space's snapshot leaves the host's", async () => {
    useMessageQueueStore.setState({
      queuedMessages: {
        [key]: [{ id: "h0", content: "host", text: "host", createdAt: 1, originalAvailable: true }],
        [spaceKey]: [{ id: "s0", content: "space", text: "space", createdAt: 1, originalAvailable: true }],
      },
    })
    respond = () => json(snapshot([queueState([], "9")]))
    await useMessageQueueStore.getState().hydrate()
    expect(Object.keys(useMessageQueueStore.getState().queuedMessages)).toEqual([spaceKey])

    useMessageQueueStore.setState({ queuedMessages: { ...useMessageQueueStore.getState().queuedMessages, [key]: [{ id: "h1", content: "host", text: "host", createdAt: 1, originalAvailable: true }] } })
    respond = () => json(snapshot([spaceQueue([], "2")]))
    await useMessageQueueStore.getState().refreshSpaceQueue(SPACE)
    expect(calls.at(-1)).toMatchObject({ method: "GET", path: "/api/message-queue", directory: `/spaces/${SPACE}` })
    expect(Object.keys(useMessageQueueStore.getState().queuedMessages)).toEqual([key])
  })

  test("a space that cannot be read keeps what was last known of its queue", async () => {
    useMessageQueueStore.setState({ queuedMessages: { [spaceKey]: [{ id: "s0", content: "space", text: "space", createdAt: 1, originalAvailable: true }] } })
    respond = () => new Response("{}", { status: 503 })
    await useMessageQueueStore.getState().refreshSpaceQueue(SPACE)
    expect(useMessageQueueStore.getState().queuedMessages[spaceKey]?.map((m) => m.id)).toEqual(["s0"])
  })

  test("a change forwarded from the space applies with the space's own revisions, and only for that space", async () => {
    respond = () => json(snapshot([]))
    await useMessageQueueStore.getState().hydrate()

    applyMessageQueueUpdatedEvent(updated("1", spaceQueue([serverItem("s1", "next")], "1"), SPACE), "runtime-a")
    expect(useMessageQueueStore.getState().queuedMessages[spaceKey]?.map((m) => m.id)).toEqual(["s1"])

    // Another space, or the host, does not speak for this space's session.
    applyMessageQueueUpdatedEvent(updated("2", spaceQueue([], "2"), "0f0f0f0f0f0f"), "runtime-a")
    applyMessageQueueUpdatedEvent(updated("51", spaceQueue([], "51")), "runtime-a")
    expect(useMessageQueueStore.getState().queuedMessages[spaceKey]?.map((m) => m.id)).toEqual(["s1"])

    applyMessageQueueUpdatedEvent(updated("2", spaceQueue([], "2"), SPACE), "runtime-a")
    expect(useMessageQueueStore.getState().queuedMessages[spaceKey]).toBeUndefined()
  })
})
