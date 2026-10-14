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
    const earlier = message("message-z", 100)
    const later = message("message-a", 200)
    const input = [later, earlier]
    expect(sortMessagesChronologically(input)).toEqual([earlier, later])
    expect(input).toEqual([later, earlier])
    const messages = [earlier]
    expect(insertMessageChronologically(messages, later)).toBe(1)
    expect(messages).toEqual([earlier, later])
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

  test("inserts at either edge and between same-time messages without replacing records", () => {
    const first = message("message-a", 100)
    const last = message("message-c", 100)
    const middle = message("message-b", 100)
    const messages: Message[] = []
    expect(insertMessageChronologically(messages, last)).toBe(0)
    expect(insertMessageChronologically(messages, first)).toBe(0)
    expect(insertMessageChronologically(messages, middle)).toBe(1)
    expect(messages).toEqual([first, middle, last])
    expect(messages[0]).toBe(first)
    expect(messages[2]).toBe(last)
  })

  test("handles absent and edge branch markers without inventing history", () => {
    const first = message("message-a", 100)
    const last = message("message-b", 200)
    const messages = [first, last]
    expect(messagesBefore(messages)).toBe(messages)
    expect(messagesBefore(messages, first.messageId)).toEqual([])
    expect(messagesFrom(messages)).toEqual([])
    expect(messagesFrom(messages, "missing")).toEqual([])
    expect(messagesFrom(messages, last.messageId)).toEqual([last])
  })
})
