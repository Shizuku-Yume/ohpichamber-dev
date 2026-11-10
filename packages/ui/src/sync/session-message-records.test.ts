import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@openchamber/agent-contract"
import { buildSessionMessageRecordsSnapshot } from "./sync-context"
import { INITIAL_STATE, type State } from "./types"

const message = (messageId: string, role: Message["role"], createdAt = 1, parts: Part[] = []): Message => ({ messageId, sessionId: "session-1", turnId: "turn-1", role, createdAt, parts })
const state = (messages: Message[]): State => ({ ...INITIAL_STATE, message: { "session-1": messages } })

describe("native session message records", () => {
  test("indexes canonical messages by message identity", () => {
    const first = message("message-1", "user")
    const second = message("message-2", "assistant", 2, [{ type: "text", partId: "part-2", content: "reply" }])
    const snapshot = buildSessionMessageRecordsSnapshot(state([first, second]), "session-1")
    expect(snapshot.list).toEqual([first, second])
    expect(snapshot.byId.get("message-2")).toBe(second)
  })

  test("retains the complete native part array and rebuilds only when the message list changes", () => {
    const part: Part = { type: "tool_call", partId: "part-1", toolCallId: "call-1", toolName: "search", input: {}, status: "running" }
    const item = message("message-1", "assistant", 1, [part])
    const messages = [item]
    const current = buildSessionMessageRecordsSnapshot(state(messages), "session-1")
    const same = buildSessionMessageRecordsSnapshot({ ...state(messages), status: "complete" }, "session-1", current)
    expect(same).toBe(current)
    expect(same.byId.get("message-1")?.parts).toEqual([part])
    const replacement = message("message-1", "assistant", 1, [part, { type: "text", partId: "part-2", content: "done" }])
    const next = buildSessionMessageRecordsSnapshot(state([replacement]), "session-1", current)
    expect(next).not.toBe(current)
    expect(next.byId.get("message-1")).toBe(replacement)
  })

  test("uses stable empty records for an unloaded native session", () => {
    const first = buildSessionMessageRecordsSnapshot(state([]), "session-unknown")
    const second = buildSessionMessageRecordsSnapshot(state([]), "session-unknown", first)
    expect(first.list).toEqual([])
    expect(first.byId.size).toBe(0)
    expect(second).toBe(first)
  })

  test("does not reuse another session's snapshot when both share an empty list", () => {
    const empty: Message[] = []
    const currentState: State = { ...INITIAL_STATE, message: { "session-1": empty, "session-2": empty } }
    const first = buildSessionMessageRecordsSnapshot(currentState, "session-1")
    const second = buildSessionMessageRecordsSnapshot(currentState, "session-2", first)
    expect(second).not.toBe(first)
    expect(second.sessionId).toBe("session-2")
    expect(second.list).toBe(empty)
  })
})
