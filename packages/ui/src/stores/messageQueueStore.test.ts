import { describe, expect, test } from "bun:test"

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

