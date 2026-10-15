import { describe, expect, test } from "bun:test"

import type { Message } from "@openchamber/agent-contract"
import {
  findSubagentCancellation,
  findSubagentRun,
  isRunningSubagentRunMessage,
  readBackgroundSubagentChildID,
  readSubagentRun,
} from "./subagent-run"

const message: Message = {
  messageId: "msg_report",
  sessionId: "ses_parent",
  turnId: "turn_parent",
  role: "assistant",
  createdAt: 20,
  parts: [{ type: "text", text: "completed subagent output" }],
}

describe("canonical subagent transcript limitations", () => {
  test("does not infer synthetic reports, background calls, or cancellation metadata", () => {
    expect(readSubagentRun(message)).toBeUndefined()
    expect(readBackgroundSubagentChildID(message.parts[0])).toBeUndefined()
    expect(findSubagentRun([message], "ses_child")).toBeUndefined()
    expect(findSubagentCancellation([message], "ses_child")).toBe(false)
    expect(isRunningSubagentRunMessage("subagent-run:ses_child")).toBe(false)
  })
})
