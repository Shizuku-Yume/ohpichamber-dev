import { describe, expect, test } from "bun:test"
import type { Message } from "@openchamber/agent-contract"
import { insertMessageChronologically, messagesBefore, messagesFrom, sortMessagesChronologically } from "./message-ordering"

const message = (messageId: string, createdAt: number): Message => ({
  messageId,
  sessionId: "session-a",
  turnId: "turn-a",
  role: "user",
  createdAt,
  parts: [],
})

describe("native message chronology", () => {
  test("orders by creation time before message ID", () => {
    const legacy = message("msg_ffffffffffffLegacy", 100)
    const current = message("msg_000000000000Current", 200)
    expect(sortMessagesChronologically([current, legacy])).toEqual([legacy, current])
    const messages = [legacy]
    insertMessageChronologically(messages, current)
    expect(messages).toEqual([legacy, current])
  })

  test("uses message ID as deterministic equal-time tie breaker", () => {
    const second = message("msg_b", 100)
    const first = message("msg_a", 100)
    expect(sortMessagesChronologically([second, first])).toEqual([first, second])
  })

  test("splits a branch by message identity, not lexical ID", () => {
    const before = message("msg_ffffBefore", 100)
    const marker = message("msg_0000Marker", 200)
    const after = message("msg_0001After", 300)
    const messages = [before, marker, after]
    expect(messagesBefore(messages, marker.messageId)).toEqual([before])
    expect(messagesFrom(messages, marker.messageId)).toEqual([marker, after])
    expect(messagesBefore(messages, "missing")).toBe(messages)
  })
})
