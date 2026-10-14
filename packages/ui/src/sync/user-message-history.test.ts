import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@openchamber/agent-contract"
import type { State } from "./types"
import { EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT, buildUserMessageHistorySnapshot } from "./user-message-history"

const text = (partId: string, content: string): Part => ({ type: "text", partId, content })
const message = (messageId: string, role: "user" | "assistant", createdAt = 1, parts: Part[] = []): Message => ({
  messageId, sessionId: "session-1", turnId: "turn-1", role, createdAt, parts,
})
const state = (partial: Partial<State>): Pick<State, "session" | "message"> => ({ session: [], message: {}, ...partial })

describe("buildUserMessageHistorySnapshot", () => {
  test("returns a shared empty snapshot without a session ID", () => {
    expect(buildUserMessageHistorySnapshot(state({}), "")).toBe(EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT)
  })

  test("lists native user prompts oldest first", () => {
    const first = message("user-1", "user", 10, [text("part-1", "first")])
    const second = message("user-2", "user", 20, [text("part-2", "second")])
    const snapshot = buildUserMessageHistorySnapshot(state({ message: { "session-1": [first, message("assistant-1", "assistant", 15), second] } }), "session-1")
    expect(snapshot.history).toEqual([{ text: "first", createdAt: 10 }, { text: "second", createdAt: 20 }])
  })

  test("keeps history stable when assistant records change", () => {
    const user = message("user-1", "user", 1, [text("part-user", "hello")])
    const first = buildUserMessageHistorySnapshot(state({ message: { "session-1": [user, message("assistant-1", "assistant", 2, [text("a", "stream")])] } }), "session-1")
    const second = buildUserMessageHistorySnapshot(state({ message: { "session-1": [user, message("assistant-1", "assistant", 2, [text("b", "streaming")])] } }), "session-1", first)
    expect(second).toBe(first)
  })

  test("updates history when a user message part changes", () => {
    const first = message("user-1", "user", 1, [text("part-user", "hello")])
    const before = buildUserMessageHistorySnapshot(state({ message: { "session-1": [first] } }), "session-1")
    const after = buildUserMessageHistorySnapshot(state({ message: { "session-1": [{ ...first, parts: [text("part-user", "updated")] }] } }), "session-1", before)
    expect(after).not.toBe(before)
    expect(after.history.map((prompt) => prompt.text)).toEqual(["updated"])
  })
})
