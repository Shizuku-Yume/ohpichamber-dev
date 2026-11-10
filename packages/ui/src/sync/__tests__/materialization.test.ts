import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@openchamber/agent-contract"
import {
  getSessionMaterializationStatus,
  getStaleRunningToolMessageID,
  materializeSessionSnapshots,
} from "../materialization"

const message = (messageId: string, parts: Part[] = []): Message => ({
  messageId, sessionId: "session-1", turnId: "turn-1", role: "assistant", createdAt: 1, parts,
})
const text = (partId: string, content: string): Part => ({ type: "text", partId, content })
const tool = (partId: string, status: "pending_approval" | "running" | "completed"): Part => ({
  type: "tool_call", partId, toolCallId: `call-${partId}`, toolName: "bash", input: {}, status,
})

describe("native session materialization", () => {
  test("materializes inline parts and marks the session renderable", () => {
    const result = materializeSessionSnapshots(
      { message: {} },
      "session-1",
      [message("message-1", [text("part-1", "hello")])],
    )
    expect(result.message["session-1"]?.[0]?.parts[0]?.partId).toBe("part-1")
    expect(result.partsChanged).toBe(true)
    expect(getSessionMaterializationStatus(result, "session-1")).toEqual({ hasMessages: true, renderable: true, missingPartMessageIDs: [] })
  })

  test("preserves active native tool parts omitted by a stale snapshot", () => {
    const live = tool("tool-1", "running")
    const result = materializeSessionSnapshots(
      { message: { "session-1": [message("message-1", [live])] } },
      "session-1",
      [message("message-1")],
    )
    expect(result.message["session-1"]?.[0]?.parts).toEqual([live])
    expect(getStaleRunningToolMessageID(result, "session-1")).toBe("message-1")
  })
  test("does not regress live tool status from running to pending approval", () => {
    const live = tool("tool-1", "running")
    const stale = tool("tool-1", "pending_approval")
    const result = materializeSessionSnapshots(
      { message: { "session-1": [message("message-1", [live])] } },
      "session-1",
      [message("message-1", [stale])],
    )
    expect(result.message["session-1"]?.[0]?.parts).toEqual([live])
  })


  test("preserves references when a native snapshot is equivalent", () => {
    const existing = message("message-1", [text("part-1", "same")])
    const state = { message: { "session-1": [existing] } }
    const result = materializeSessionSnapshots(state, "session-1", [existing])
    expect(result.message).toBe(state.message)
    expect(result.messagesChanged).toBe(false)
    expect(result.partsChanged).toBe(false)
  })

  test("preserves newer live text and reasoning against stale prefix snapshots", () => {
    const live = message("message-1", [text("text", "live output"), { type: "reasoning", partId: "reasoning", content: "live reasoning" }])
    const result = materializeSessionSnapshots({ message: { "session-1": [live] } }, "session-1", [message("message-1", [text("text", "live"), { type: "reasoning", partId: "reasoning", content: "live" }])])
    expect(result.message["session-1"]?.[0]).toBe(live)
  })

  test("new messages apply skipped part types and prepend preserves overlapping live records", () => {
    const live = message("message-1", [text("text", "live")])
    const older = { ...message("message-0", [text("hidden", "omit"), tool("tool", "completed")]), createdAt: 0 }
    const result = materializeSessionSnapshots({ message: { "session-1": [live] } }, "session-1", [older, message("message-1")], { mode: "prepend", skipPartTypes: new Set(["text"]) })
    expect(result.messages[0]?.parts).toEqual([tool("tool", "completed")])
    expect(result.messages[1]).toBe(live)
  })

  test("successful empty history is renderable and is not unresolved data", () => {
    const result = materializeSessionSnapshots({ message: {} }, "session-1", [])
    expect(result.message["session-1"]).toEqual([])
    expect(getSessionMaterializationStatus(result, "session-1").renderable).toBe(true)
    expect(getSessionMaterializationStatus({ message: {} }, "session-1").renderable).toBe(false)
  })
})
