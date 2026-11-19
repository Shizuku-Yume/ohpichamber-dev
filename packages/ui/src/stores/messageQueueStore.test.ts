<<<<<<< HEAD
import { describe, expect, test } from "bun:test"
||||||| bc50ba56aa
import { beforeEach, describe, expect, mock, test } from "bun:test"

// The local queue is the VS Code behavior; every other runtime hands the
// queue to the server (see messageQueueStore.server.test.ts).
const desktop = await import("@/lib/desktop")
mock.module("@/lib/desktop", () => ({ ...desktop, isVSCodeRuntime: () => true }))
=======
import { beforeEach, describe, expect, test } from "bun:test"
import { directoryEnvironment } from './test-support/directoryEnvironment'

directoryEnvironment({ vscode: true })
>>>>>>> upstream/main

const {
  createMessageQueueTarget,
  getMessageQueueKey,
  migrateMessageQueueState,
  parseMessageQueueKey,
} = await import("./messageQueueStore")


describe("message queue runtime ownership", () => {
  test("round trips a composite queue key", () => {
    const target = createMessageQueueTarget("session-1", "/repo", "runtime-a")!
    expect(parseMessageQueueKey(getMessageQueueKey(target))).toEqual(target)
  })

  test("quarantines legacy session-only queues instead of activating them", () => {
    const migrated = migrateMessageQueueState({
      queuedMessages: {
        "session-1": [{ id: "queued-1", content: "legacy", createdAt: 1 }],
      },
    }, 1)

    expect(migrated.queuedMessages).toEqual({})
    expect(migrated.quarantinedLegacyMessages?.["session-1"]?.[0]?.content).toBe("legacy")
  })

  test("messages persisted before delivery text existed deliver their content", () => {
    const migrated = migrateMessageQueueState({
      queuedMessages: {
        "runtime-a\n/repo\nsession-1": [{ id: "queued-1", content: "@Builder old", createdAt: 1 }],
      },
    }, 2)

    expect(migrated.queuedMessages?.["runtime-a\n/repo\nsession-1"]?.[0]?.text).toBe("@Builder old")
  })

})

<<<<<<< HEAD
||||||| bc50ba56aa
describe("in-flight queued sends", () => {
  test("hides a dispatched message from the sendable queue but keeps it visible", () => {
    const target = createMessageQueueTarget("session-1", "/repo", "runtime-a")!
    const store = useMessageQueueStore.getState()
    store.addToQueue(target, { content: "first" })
    store.addToQueue(target, { content: "second" })
    const [first] = useMessageQueueStore.getState().getQueueForTarget(target)

    useMessageQueueStore.getState().markSending(target, first.id)

    expect(useMessageQueueStore.getState().getQueueForTarget(target)).toHaveLength(2)
    const sendable = useMessageQueueStore.getState().getSendableQueue(target)
    expect(sendable).toHaveLength(1)
    expect(sendable[0]?.content).toBe("second")

    useMessageQueueStore.getState().clearSending(target, first.id)
    expect(useMessageQueueStore.getState().getSendableQueue(target)).toHaveLength(2)
    expect(useMessageQueueStore.getState().sendingIds).toEqual({})
  })

  test("clearQueue retains a message whose send is still awaiting the server", () => {
    const target = createMessageQueueTarget("session-1", "/repo", "runtime-a")!
    const store = useMessageQueueStore.getState()
    store.addToQueue(target, { content: "in flight" })
    store.addToQueue(target, { content: "merged by composer" })
    const [inFlight] = useMessageQueueStore.getState().getQueueForTarget(target)
    useMessageQueueStore.getState().markSending(target, inFlight.id)

    useMessageQueueStore.getState().clearQueue(target)

    const remaining = useMessageQueueStore.getState().getQueueForTarget(target)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.id).toBe(inFlight.id)
  })

  test("clearQueue drops everything once no send is in flight", () => {
    const target = createMessageQueueTarget("session-1", "/repo", "runtime-a")!
    useMessageQueueStore.getState().addToQueue(target, { content: "queued" })

    useMessageQueueStore.getState().clearQueue(target)

    expect(useMessageQueueStore.getState().getQueueForTarget(target)).toHaveLength(0)
  })
})
=======
describe("in-flight queued sends", () => {
  test("hides a dispatched message from the sendable queue but keeps it visible", () => {
    const target = createMessageQueueTarget("session-1", "/repo", "runtime-a")!
    const store = useMessageQueueStore.getState()
    store.addToQueue(target, { content: "first" })
    store.addToQueue(target, { content: "second" })
    const [first] = useMessageQueueStore.getState().getQueueForTarget(target)

    useMessageQueueStore.getState().markSending(target, first.id)

    expect(useMessageQueueStore.getState().getQueueForTarget(target)).toHaveLength(2)
    const sendable = useMessageQueueStore.getState().getSendableQueue(target)
    expect(sendable).toHaveLength(1)
    expect(sendable[0]?.content).toBe("second")

    useMessageQueueStore.getState().clearSending(target, first.id)
    expect(useMessageQueueStore.getState().getSendableQueue(target)).toHaveLength(2)
    expect(useMessageQueueStore.getState().sendingIds).toEqual({})
  })

  test("clearQueue retains a message whose send is still awaiting the server", () => {
    const target = createMessageQueueTarget("session-1", "/repo", "runtime-a")!
    const store = useMessageQueueStore.getState()
    store.addToQueue(target, { content: "in flight" })
    store.addToQueue(target, { content: "merged by composer" })
    const [inFlight] = useMessageQueueStore.getState().getQueueForTarget(target)
    useMessageQueueStore.getState().markSending(target, inFlight.id)

    useMessageQueueStore.getState().clearQueue(target)

    const remaining = useMessageQueueStore.getState().getQueueForTarget(target)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.id).toBe(inFlight.id)
  })

  test("clearQueue drops everything once no send is in flight", () => {
    const target = createMessageQueueTarget("session-1", "/repo", "runtime-a")!
    useMessageQueueStore.getState().addToQueue(target, { content: "queued" })

    useMessageQueueStore.getState().clearQueue(target)

    expect(useMessageQueueStore.getState().getQueueForTarget(target)).toHaveLength(0)
  })
})

describe("a session that moves", () => {
  const source = createMessageQueueTarget("session-1", "/repo", "runtime-a")!
  const destination = createMessageQueueTarget("session-1", "/repo/moved", "runtime-a")!

  test("a queue waiting on a busy session moves whole, and the old key has nothing to dispatch", () => {
    useMessageQueueStore.getState().addToQueue(source, { content: "queued while busy" })

    useMessageQueueStore.getState().followSessionMove(destination)

    const state = useMessageQueueStore.getState()
    expect(Object.keys(state.queuedMessages)).toEqual([getMessageQueueKey(destination)])
    expect(state.getSendableQueue(destination).map((message) => message.content)).toEqual(["queued while busy"])
    expect(state.getSendableQueue(source)).toEqual([])
  })

  test("a send in flight during the move is delivered once and settles at the destination", () => {
    const store = useMessageQueueStore.getState()
    store.addToQueue(source, { content: "in flight" })
    store.addToQueue(source, { content: "next" })
    const [inFlight] = useMessageQueueStore.getState().getQueueForTarget(source)
    useMessageQueueStore.getState().markSending(source, inFlight.id)

    useMessageQueueStore.getState().followSessionMove(destination)
    // The destination must not offer the message that is still being sent.
    expect(useMessageQueueStore.getState().getSendableQueue(destination).map((message) => message.content)).toEqual(["next"])

    // What the auto-send hook does when the send resolves.
    const located = useMessageQueueStore.getState().locateQueuedMessage(source, inFlight.id)
    expect(located).toEqual(destination)
    useMessageQueueStore.getState().removeFromQueue(located, inFlight.id)
    useMessageQueueStore.getState().clearSending(useMessageQueueStore.getState().locateQueuedMessage(source, inFlight.id), inFlight.id)

    const state = useMessageQueueStore.getState()
    expect(state.getQueueForTarget(destination).map((message) => message.content)).toEqual(["next"])
    expect(state.sendingIds).toEqual({})
    expect(Object.keys(state.queuedMessages)).toEqual([getMessageQueueKey(destination)])
  })

  test("a move to the directory the queue is already under changes nothing", () => {
    useMessageQueueStore.getState().addToQueue(source, { content: "queued" })
    const before = useMessageQueueStore.getState().queuedMessages

    useMessageQueueStore.getState().followSessionMove(source)

    expect(useMessageQueueStore.getState().queuedMessages).toBe(before)
  })
})
>>>>>>> upstream/main
