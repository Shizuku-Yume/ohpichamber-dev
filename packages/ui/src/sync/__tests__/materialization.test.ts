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

<<<<<<< HEAD
  test("successful empty history is renderable and is not unresolved data", () => {
    const result = materializeSessionSnapshots({ message: {} }, "session-1", [])
    expect(result.message["session-1"]).toEqual([])
    expect(getSessionMaterializationStatus(result, "session-1").renderable).toBe(true)
    expect(getSessionMaterializationStatus({ message: {} }, "session-1").renderable).toBe(false)
||||||| bc50ba56aa
  test("preserves live streaming parts omitted by a stale snapshot", () => {
    const livePart = part("prt_1", "msg_1", "text", "First chunk ")
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [] }],
    )

    expect(result.part.msg_1[0]).toBe(livePart)
  })

  test("preserves a locally aborted assistant message when a stale unfinished snapshot arrives", () => {
    const unfinishedMessage = message("msg_1")
    if (unfinishedMessage.role !== "assistant") throw new Error("Expected assistant fixture")
    const abortedMessage: Message = {
      ...unfinishedMessage,
      time: { created: 1, completed: 5000 },
      error: { type: "aborted", message: "aborted" },
      closedLocally: true,
    }
    const staleMessage = message("msg_1")
    const state = {
      message: { ses_1: [abortedMessage] },
      part: { msg_1: [] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: staleMessage, parts: [] }],
    )

    expect(result.message).toBe(state.message)
    expect(result.message.ses_1[0]).toBe(abortedMessage)
    expect(result.message.ses_1[0]).not.toBe(staleMessage)
  })

  test("replaces a locally aborted assistant message with the authoritative completed snapshot", () => {
    const unfinishedMessage = message("msg_1")
    if (unfinishedMessage.role !== "assistant") throw new Error("Expected assistant fixture")
    const abortedMessage: Message = {
      ...unfinishedMessage,
      time: { created: 1, completed: 5000 },
      error: { type: "aborted", message: "aborted" },
      closedLocally: true,
    }
    const completedMessage: Message = {
      ...unfinishedMessage,
      time: { created: 1, completed: 4000 },
    }
    const state = {
      message: { ses_1: [abortedMessage] },
      part: { msg_1: [] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: completedMessage, parts: [] }],
    )

    const reconciled = result.message.ses_1[0]
    expect(reconciled).toBe(completedMessage)
    expect(reconciled?.role).toBe("assistant")
    if (reconciled?.role !== "assistant") throw new Error("Expected assistant result")
    expect("error" in reconciled).toBe(false)
    expect(reconciled.time.completed).toBe(4000)
  })

  test("does not preserve omitted optimistic user text parts beside server snapshot parts", () => {
    const optimisticPart = { id: "prt_optimistic", messageID: "msg_1", type: "text", text: "Hello" } as Part
    const serverPart = part("prt_server", "msg_1", "text", "Hello")
    const state = {
      message: { ses_1: [userMessage("msg_1")] },
      part: { msg_1: [optimisticPart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: userMessage("msg_1"), parts: [serverPart] }],
    )

    expect(result.part.msg_1).toEqual([serverPart])
  })

  test("preserves state.time from existing part when snapshot drops it", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "completed", time: { start: 1000, end: 2000 } },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "completed" },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { time?: { start?: number; end?: number } } }
    expect(mergedPart.state?.time?.start).toBe(1000)
    expect(mergedPart.state?.time?.end).toBe(2000)
  })

  test("does not regress a locally interrupted tool (error + end) when a stale running snapshot arrives", () => {
    // The #2577 mark writes status "error" + end time; a later stale refresh
    // that still reports the part as running must not undo it.
    const interruptedTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "error", error: "Interrupted", time: { start: 1000, end: 5000 } },
    } as unknown as Part
    const staleRunningTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "running", time: { start: 1000 } },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [interruptedTool] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [staleRunningTool] }],
    )

    expect(result.part.msg_1[0]).toBe(interruptedTool)
    expect(result.part.msg_1[0]).not.toBe(staleRunningTool)
    expect((result.part.msg_1[0] as { state: { status: string } }).state.status).toBe("error")
  })

  test("keeps a live running subagent call when a stale pending snapshot arrives", () => {
    const runningTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      callID: "call-1",
      tool: "subagent",
      state: { status: "running", input: {}, metadata: { sessionID: "ses_child" }, time: { start: 1000 } },
    } satisfies ToolPart
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [runningTool] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [{ ...runningTool, state: { status: "pending", input: {}, raw: "" } }] }],
    )

    expect(result.part.msg_1[0]).toBe(runningTool)
  })

  test("keeps live progress metadata when a stale running snapshot lacks it", () => {
    const runningTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      callID: "call-1",
      tool: "subagent",
      state: { status: "running", input: {}, metadata: { sessionID: "ses_child" }, time: { start: 1000 } },
    } satisfies ToolPart
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [runningTool] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [{ ...runningTool, state: { status: "running", input: {}, time: { start: 1000 } } }] }],
    )

    const merged = result.part.msg_1[0]
    if (merged?.type !== "tool" || merged.state.status !== "running") throw new Error("Expected running tool part")
    expect(merged.state.metadata).toEqual({ sessionID: "ses_child" })
  })

  test("does not regress a completed tool when a stale running snapshot arrives", () => {
    const completedTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "completed", output: "done", time: { start: 1000, end: 2000 } },
    } as unknown as Part
    const staleRunningTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "running", time: { start: 1000 } },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [completedTool] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [staleRunningTool] }],
    )

    expect(result.part).toBe(state.part)
    expect(result.part.msg_1[0]).toBe(completedTool)
    expect(getStaleRunningToolMessageID(result, "ses_1")).toBe(undefined)
  })

  test("keeps a whole finished call when a page brings its shell, and takes the whole call over a shell", () => {
    const whole = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      tool: "read",
      callID: "call-prt_1",
      state: { status: "completed", input: { path: "a.ts" }, output: "file body", metadata: {}, time: { start: 1, end: 2 } },
    } satisfies ToolPart
    const shell = {
      ...whole,
      state: { ...whole.state, output: "", metadata: { openchamberContentShell: { chars: 9 } } },
    } satisfies ToolPart
    const info = completedAssistantMessage("msg_1")

    const holdingWhole = materializeSessionSnapshots({ message: { ses_1: [info] }, part: { msg_1: [whole] } }, "ses_1", [{ info, parts: [shell] }])
    expect(holdingWhole.part.msg_1[0]).toBe(whole)

    const holdingShell = materializeSessionSnapshots({ message: { ses_1: [info] }, part: { msg_1: [shell] } }, "ses_1", [{ info, parts: [whole] }])
    expect(holdingShell.part.msg_1[0]).toEqual(whole)
  })

  test("preserves state.attachments from existing part when completed snapshot lacks them", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "completed",
        output: "done",
        time: { start: 100, end: 200 },
        attachments: [{ id: "att-1", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "completed", output: "done", time: { start: 100, end: 200 } },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown> } }
    expect(mergedPart.state?.attachments).toHaveLength(1)
    expect((mergedPart.state?.attachments?.[0] as { id?: string })?.id).toBe("att-1")
  })

  test("preserves state.attachments during streaming merge when snapshot has no end time", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "running",
        time: { start: 100 },
        attachments: [{ id: "att-1", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "running", time: { start: 100 } },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown> } }
    expect(mergedPart.state?.attachments).toHaveLength(1)
    expect((mergedPart.state?.attachments?.[0] as { id?: string })?.id).toBe("att-1")
  })

  test("preserves both state.attachments and state.time.start during streaming merge when snapshot lacks both", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "running",
        time: { start: 100 },
        attachments: [{ id: "att-1", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "running" },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown>; time?: { start?: number; end?: number } } }
    expect(mergedPart.state?.attachments).toHaveLength(1)
    expect((mergedPart.state?.attachments?.[0] as { id?: string })?.id).toBe("att-1")
    expect(mergedPart.state?.time?.start).toBe(100)
  })

  test("does not merge existing state.attachments when snapshot has its own", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "completed",
        output: "done",
        time: { start: 100, end: 200 },
        attachments: [{ id: "att-old", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "completed",
        output: "done",
        time: { start: 100, end: 200 },
        attachments: [{ id: "att-new", type: "file", mime: "image/jpeg", url: "data:image/jpeg,..." }],
      },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown> } }
    expect(mergedPart.state?.attachments).toHaveLength(1)
    expect((mergedPart.state?.attachments?.[0] as { id?: string })?.id).toBe("att-new")
  })

  test("treats empty state.attachments in completed snapshot as authoritative", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "completed",
        output: "done",
        time: { start: 100, end: 200 },
        attachments: [{ id: "att-old", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "completed",
        output: "done",
        time: { start: 100, end: 200 },
        attachments: [],
      },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown> } }
    expect(mergedPart.state?.attachments).toEqual([])
  })

  test("treats empty state.attachments in streaming snapshot as authoritative", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "running",
        time: { start: 100 },
        attachments: [{ id: "att-old", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "running", time: { start: 100 }, attachments: [] },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown> } }
    expect(mergedPart.state?.attachments).toEqual([])
  })
})

describe("getSessionMaterializationStatus", () => {
  test("requires assistant parts for renderable cached state", () => {
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: {},
    }

    expect(getSessionMaterializationStatus(state, "ses_1")).toEqual({
      hasMessages: true,
      renderable: false,
      missingPartMessageIDs: ["msg_1"],
    })
  })

  test("treats user-only cached state as renderable", () => {
    const state = {
      message: { ses_1: [{ ...message("msg_1"), role: "user" } as Message] },
      part: {},
    }

    expect(getSessionMaterializationStatus(state, "ses_1")).toEqual({
      hasMessages: true,
      renderable: true,
      missingPartMessageIDs: [],
    })
  })
})

describe("isSessionMaterializationStillNeeded", () => {
  test("skips empty-assistant recovery after a part bucket arrives", () => {
    const state = { message: { ses_1: [message("msg_1")] }, part: { msg_1: [part("prt_1", "msg_1")] } }

    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "empty-assistant-message",
      messageID: "msg_1",
    })).toBe(false)
  })

  test("treats an explicit empty part bucket as authoritative", () => {
    const state = { message: { ses_1: [message("msg_1")] }, part: { msg_1: [] } }

    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "empty-assistant-message",
      messageID: "msg_1",
    })).toBe(false)
  })

  test("skips missing-message and missing-part recovery after ordered events repair state", () => {
    const state = { message: { ses_1: [message("msg_1")] }, part: { msg_1: [part("prt_1", "msg_1")] } }

    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "missing-owning-message",
      messageID: "msg_1",
    })).toBe(false)
    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "missing-delta-part",
      messageID: "msg_1",
      partID: "prt_1",
    })).toBe(false)
  })

  test("keeps recovery active while the requested entity is still missing", () => {
    const state = { message: { ses_1: [message("msg_1")] }, part: {} }

    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "orphan-delta",
      messageID: "msg_1",
      partID: "prt_1",
    })).toBe(true)
  })

  test("recovers a settled session whose trailing assistant still has a running tool", () => {
    const runningTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      tool: "read",
      state: { status: "running" },
    } as Part
    const state = { message: { ses_1: [message("msg_1")] }, part: { msg_1: [runningTool] } }

    expect(getStaleRunningToolMessageID(state, "ses_1")).toBe("msg_1")
    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "settled-running-tool",
      messageID: "msg_1",
    })).toBe(true)

    const completedState = {
      ...state,
      part: { msg_1: [{ ...runningTool, state: { status: "completed" } } as Part] },
    }
    expect(getStaleRunningToolMessageID(completedState, "ses_1")).toBe(undefined)
    expect(isSessionMaterializationStillNeeded(completedState, "ses_1", {
      reason: "settled-running-tool",
      messageID: "msg_1",
    })).toBe(false)
  })

  test("does not recover an older running tool after a newer user turn", () => {
    const state = {
      message: { ses_1: [message("msg_1"), userMessage("msg_2")] },
      part: {
        msg_1: [{
          id: "prt_1",
          messageID: "msg_1",
          sessionID: "ses_1",
          type: "tool",
          tool: "read",
          state: { status: "running" },
        } as Part],
      },
    }

    expect(getStaleRunningToolMessageID(state, "ses_1")).toBe(undefined)
=======
  test("preserves live streaming parts omitted by a stale snapshot", () => {
    const livePart = part("prt_1", "msg_1", "text", "First chunk ")
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [] }],
    )

    expect(result.part.msg_1[0]).toBe(livePart)
  })

  test("preserves a locally aborted assistant message when a stale unfinished snapshot arrives", () => {
    const unfinishedMessage = message("msg_1")
    if (unfinishedMessage.role !== "assistant") throw new Error("Expected assistant fixture")
    const abortedMessage: Message = {
      ...unfinishedMessage,
      time: { created: 1, completed: 5000 },
      error: { type: "aborted", message: "aborted" },
      closedLocally: true,
    }
    const staleMessage = message("msg_1")
    const state = {
      message: { ses_1: [abortedMessage] },
      part: { msg_1: [] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: staleMessage, parts: [] }],
    )

    expect(result.message).toBe(state.message)
    expect(result.message.ses_1[0]).toBe(abortedMessage)
    expect(result.message.ses_1[0]).not.toBe(staleMessage)
  })

  test("replaces a locally aborted assistant message with the authoritative completed snapshot", () => {
    const unfinishedMessage = message("msg_1")
    if (unfinishedMessage.role !== "assistant") throw new Error("Expected assistant fixture")
    const abortedMessage: Message = {
      ...unfinishedMessage,
      time: { created: 1, completed: 5000 },
      error: { type: "aborted", message: "aborted" },
      closedLocally: true,
    }
    const completedMessage: Message = {
      ...unfinishedMessage,
      time: { created: 1, completed: 4000 },
    }
    const state = {
      message: { ses_1: [abortedMessage] },
      part: { msg_1: [] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: completedMessage, parts: [] }],
    )

    const reconciled = result.message.ses_1[0]
    expect(reconciled).toBe(completedMessage)
    expect(reconciled?.role).toBe("assistant")
    if (reconciled?.role !== "assistant") throw new Error("Expected assistant result")
    expect("error" in reconciled).toBe(false)
    expect(reconciled.time.completed).toBe(4000)
  })

  test("does not preserve omitted optimistic user text parts beside server snapshot parts", () => {
    const optimisticPart = { id: "prt_optimistic", messageID: "msg_1", type: "text", text: "Hello" } as Part
    const serverPart = part("prt_server", "msg_1", "text", "Hello")
    const state = {
      message: { ses_1: [userMessage("msg_1")] },
      part: { msg_1: [optimisticPart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: userMessage("msg_1"), parts: [serverPart] }],
    )

    expect(result.part.msg_1).toEqual([serverPart])
  })

  test("preserves state.time from existing part when snapshot drops it", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "completed", time: { start: 1000, end: 2000 } },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "completed" },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { time?: { start?: number; end?: number } } }
    expect(mergedPart.state?.time?.start).toBe(1000)
    expect(mergedPart.state?.time?.end).toBe(2000)
  })

  test("does not regress a locally interrupted tool (error + end) when a stale running snapshot arrives", () => {
    // The #2577 mark writes status "error" + end time; a later stale refresh
    // that still reports the part as running must not undo it.
    const interruptedTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "error", error: "Interrupted", time: { start: 1000, end: 5000 } },
    } as unknown as Part
    const staleRunningTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "running", time: { start: 1000 } },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [interruptedTool] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [staleRunningTool] }],
    )

    expect(result.part.msg_1[0]).toBe(interruptedTool)
    expect(result.part.msg_1[0]).not.toBe(staleRunningTool)
    expect((result.part.msg_1[0] as { state: { status: string } }).state.status).toBe("error")
  })

  test("keeps a live running subagent call when a stale pending snapshot arrives", () => {
    const runningTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      callID: "call-1",
      tool: "subagent",
      state: { status: "running", input: {}, metadata: { sessionID: "ses_child" }, time: { start: 1000 } },
    } satisfies ToolPart
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [runningTool] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [{ ...runningTool, state: { status: "pending", input: {}, raw: "" } }] }],
    )

    expect(result.part.msg_1[0]).toBe(runningTool)
  })

  test("keeps live progress metadata when a stale running snapshot lacks it", () => {
    const runningTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      callID: "call-1",
      tool: "subagent",
      state: { status: "running", input: {}, metadata: { sessionID: "ses_child" }, time: { start: 1000 } },
    } satisfies ToolPart
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [runningTool] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [{ ...runningTool, state: { status: "running", input: {}, time: { start: 1000 } } }] }],
    )

    const merged = result.part.msg_1[0]
    if (merged?.type !== "tool" || merged.state.status !== "running") throw new Error("Expected running tool part")
    expect(merged.state.metadata).toEqual({ sessionID: "ses_child" })
  })

  test("does not regress a completed tool when a stale running snapshot arrives", () => {
    const completedTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "completed", output: "done", time: { start: 1000, end: 2000 } },
    } as unknown as Part
    const staleRunningTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "running", time: { start: 1000 } },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [completedTool] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [staleRunningTool] }],
    )

    expect(result.part).toBe(state.part)
    expect(result.part.msg_1[0]).toBe(completedTool)
    expect(getStaleRunningToolMessageID(result, "ses_1")).toBe(undefined)
  })

  test("keeps a whole finished call when a page brings its shell, and takes the whole call over a shell", () => {
    const whole = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      tool: "read",
      callID: "call-prt_1",
      state: { status: "completed", input: { path: "a.ts" }, output: "file body", metadata: {}, time: { start: 1, end: 2 } },
    } satisfies ToolPart
    const shell = {
      ...whole,
      state: { ...whole.state, output: "", metadata: { openchamberContentShell: { chars: 9 } } },
    } satisfies ToolPart
    const info = completedAssistantMessage("msg_1")

    const holdingWhole = materializeSessionSnapshots({ message: { ses_1: [info] }, part: { msg_1: [whole] } }, "ses_1", [{ info, parts: [shell] }])
    expect(holdingWhole.part.msg_1[0]).toBe(whole)

    const holdingShell = materializeSessionSnapshots({ message: { ses_1: [info] }, part: { msg_1: [shell] } }, "ses_1", [{ info, parts: [whole] }])
    expect(holdingShell.part.msg_1[0]).toEqual(whole)
  })

  test("preserves state.attachments from existing part when completed snapshot lacks them", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "completed",
        output: "done",
        time: { start: 100, end: 200 },
        attachments: [{ id: "att-1", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "completed", output: "done", time: { start: 100, end: 200 } },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown> } }
    expect(mergedPart.state?.attachments).toHaveLength(1)
    expect((mergedPart.state?.attachments?.[0] as { id?: string })?.id).toBe("att-1")
  })

  test("preserves state.attachments during streaming merge when snapshot has no end time", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "running",
        time: { start: 100 },
        attachments: [{ id: "att-1", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "running", time: { start: 100 } },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown> } }
    expect(mergedPart.state?.attachments).toHaveLength(1)
    expect((mergedPart.state?.attachments?.[0] as { id?: string })?.id).toBe("att-1")
  })

  test("preserves both state.attachments and state.time.start during streaming merge when snapshot lacks both", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "running",
        time: { start: 100 },
        attachments: [{ id: "att-1", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "running" },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown>; time?: { start?: number; end?: number } } }
    expect(mergedPart.state?.attachments).toHaveLength(1)
    expect((mergedPart.state?.attachments?.[0] as { id?: string })?.id).toBe("att-1")
    expect(mergedPart.state?.time?.start).toBe(100)
  })

  test("does not merge existing state.attachments when snapshot has its own", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "completed",
        output: "done",
        time: { start: 100, end: 200 },
        attachments: [{ id: "att-old", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "completed",
        output: "done",
        time: { start: 100, end: 200 },
        attachments: [{ id: "att-new", type: "file", mime: "image/jpeg", url: "data:image/jpeg,..." }],
      },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown> } }
    expect(mergedPart.state?.attachments).toHaveLength(1)
    expect((mergedPart.state?.attachments?.[0] as { id?: string })?.id).toBe("att-new")
  })

  test("treats empty state.attachments in completed snapshot as authoritative", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "completed",
        output: "done",
        time: { start: 100, end: 200 },
        attachments: [{ id: "att-old", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "completed",
        output: "done",
        time: { start: 100, end: 200 },
        attachments: [],
      },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown> } }
    expect(mergedPart.state?.attachments).toEqual([])
  })

  test("treats empty state.attachments in streaming snapshot as authoritative", () => {
    const livePart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: {
        status: "running",
        time: { start: 100 },
        attachments: [{ id: "att-old", type: "file", mime: "image/png", url: "data:image/png,..." }],
      },
    } as unknown as Part
    const snapshotPart = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      state: { status: "running", time: { start: 100 }, attachments: [] },
    } as unknown as Part
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: { msg_1: [livePart] },
    }

    const result = materializeSessionSnapshots(
      state,
      "ses_1",
      [{ info: message("msg_1"), parts: [snapshotPart] }],
    )

    const mergedPart = result.part.msg_1[0] as { state?: { attachments?: Array<unknown> } }
    expect(mergedPart.state?.attachments).toEqual([])
  })
})

describe("getSessionMaterializationStatus", () => {
  test("complete parts do not establish known-missing history coverage", () => {
    const state = {
      message: { ses_1: [userMessage("msg_u"), completedAssistantMessage("msg_done")] },
      part: { msg_done: [part("prt_1", "msg_done")] },
    }

    expect(getSessionMaterializationStatus(state, "ses_1", { historyCovered: false })).toEqual({
      hasMessages: true,
      renderable: false,
      missingPartMessageIDs: [],
    })
    expect(getSessionMaterializationStatus(state, "ses_1", { historyCovered: true }).renderable).toBe(true)
    expect(getSessionMaterializationStatus(state, "ses_1").renderable).toBe(true)
  })

  test("requires assistant parts for renderable cached state", () => {
    const state = {
      message: { ses_1: [message("msg_1")] },
      part: {},
    }

    expect(getSessionMaterializationStatus(state, "ses_1")).toEqual({
      hasMessages: true,
      renderable: false,
      missingPartMessageIDs: ["msg_1"],
    })
  })

  test("treats user-only cached state as renderable", () => {
    const state = {
      message: { ses_1: [{ ...message("msg_1"), role: "user" } as Message] },
      part: {},
    }

    expect(getSessionMaterializationStatus(state, "ses_1")).toEqual({
      hasMessages: true,
      renderable: true,
      missingPartMessageIDs: [],
    })
  })

  // OpenCode 2.x opens each step of a turn as a new assistant message and sends
  // its parts seconds later. Counting that wait as a gap reloaded the whole
  // transcript page once per step.
  test("a running step without parts is renderable only in a transcript the loader holds", () => {
    const state = {
      message: { ses_1: [userMessage("msg_u"), completedAssistantMessage("msg_done"), message("msg_live")] },
      part: { msg_done: [part("prt_1", "msg_done")] },
    }

    expect(getSessionMaterializationStatus(state, "ses_1", { historyCovered: true })).toEqual({
      hasMessages: true,
      renderable: true,
      missingPartMessageIDs: [],
    })
    // Records only events delivered still need the session's history.
    expect(getSessionMaterializationStatus(state, "ses_1").renderable).toBe(false)
  })

  test("a finished step without parts stays a gap even in a held transcript", () => {
    const state = {
      message: { ses_1: [completedAssistantMessage("msg_done")] },
      part: {},
    }

    expect(getSessionMaterializationStatus(state, "ses_1", { historyCovered: true })).toEqual({
      hasMessages: true,
      renderable: false,
      missingPartMessageIDs: ["msg_done"],
    })
  })
})

describe("isSessionMaterializationStillNeeded", () => {
  test("skips empty-assistant recovery after a part bucket arrives", () => {
    const state = { message: { ses_1: [message("msg_1")] }, part: { msg_1: [part("prt_1", "msg_1")] } }

    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "empty-assistant-message",
      messageID: "msg_1",
    })).toBe(false)
  })

  test("treats an explicit empty part bucket as authoritative", () => {
    const state = { message: { ses_1: [message("msg_1")] }, part: { msg_1: [] } }

    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "empty-assistant-message",
      messageID: "msg_1",
    })).toBe(false)
  })

  test("skips missing-message and missing-part recovery after ordered events repair state", () => {
    const state = { message: { ses_1: [message("msg_1")] }, part: { msg_1: [part("prt_1", "msg_1")] } }

    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "missing-owning-message",
      messageID: "msg_1",
    })).toBe(false)
    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "missing-delta-part",
      messageID: "msg_1",
      partID: "prt_1",
    })).toBe(false)
  })

  test("keeps recovery active while the requested entity is still missing", () => {
    const state = { message: { ses_1: [message("msg_1")] }, part: {} }

    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "orphan-delta",
      messageID: "msg_1",
      partID: "prt_1",
    })).toBe(true)
  })

  test("recovers a settled session whose trailing assistant still has a running tool", () => {
    const runningTool = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "tool",
      tool: "read",
      state: { status: "running" },
    } as Part
    const state = { message: { ses_1: [message("msg_1")] }, part: { msg_1: [runningTool] } }

    expect(getStaleRunningToolMessageID(state, "ses_1")).toBe("msg_1")
    expect(isSessionMaterializationStillNeeded(state, "ses_1", {
      reason: "settled-running-tool",
      messageID: "msg_1",
    })).toBe(true)

    const completedState = {
      ...state,
      part: { msg_1: [{ ...runningTool, state: { status: "completed" } } as Part] },
    }
    expect(getStaleRunningToolMessageID(completedState, "ses_1")).toBe(undefined)
    expect(isSessionMaterializationStillNeeded(completedState, "ses_1", {
      reason: "settled-running-tool",
      messageID: "msg_1",
    })).toBe(false)
  })

  test("does not recover an older running tool after a newer user turn", () => {
    const state = {
      message: { ses_1: [message("msg_1"), userMessage("msg_2")] },
      part: {
        msg_1: [{
          id: "prt_1",
          messageID: "msg_1",
          sessionID: "ses_1",
          type: "tool",
          tool: "read",
          state: { status: "running" },
        } as Part],
      },
    }

    expect(getStaleRunningToolMessageID(state, "ses_1")).toBe(undefined)
>>>>>>> upstream/main
  })
})
