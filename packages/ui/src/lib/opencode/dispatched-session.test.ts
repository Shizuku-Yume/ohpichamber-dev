import { describe, expect, test } from "bun:test"

import type { Message as CanonicalMessage } from "@openchamber/agent-contract"
import type { SyntheticMessage } from "./model"
import { readDispatchedSessionResult } from "./dispatched-session"
import { readSubagentRun } from "./subagent-run"
import { isBackgroundReportEntry, isSkippedTimelineMessage } from "@/components/chat/lib/timelineRoles"

const canonicalMessage: CanonicalMessage = {
  messageId: "msg",
  sessionId: "ses_parent",
  turnId: "turn",
  role: "assistant",
  createdAt: 30,
  parts: [{ type: "text", partId: "part", content: "Toolbar fixed." }],
}

// The shape `web/server/lib/dispatch-results` admits into the dispatching session.
const result = (overrides: Partial<SyntheticMessage> = {}): SyntheticMessage => ({
  id: "msg_result",
  sessionID: "ses_parent",
  role: "synthetic",
  time: { created: 30 },
  text: '<openchamber-session sessionID="ses_child" state="completed" title="Fix the toolbar">\n## Done\n\nToolbar fixed.\n</openchamber-session>',
  description: "Fix the toolbar",
  metadata: { source: "openchamber-session", sessionID: "ses_child", state: "completed", title: "Fix the toolbar" },
  ...overrides,
})

describe("readDispatchedSessionResult", () => {
  test("reads the session, state, title and unwrapped answer", () => {
    expect(readDispatchedSessionResult(result())).toEqual({
      sessionID: "ses_child",
      state: "completed",
      title: "Fix the toolbar",
      output: "## Done\n\nToolbar fixed.",
      reportedAt: 30,
    })
  })

  test("ignores other synthetic messages, a subagent report included", () => {
    expect(readDispatchedSessionResult(result({ metadata: undefined }))).toBeUndefined()
    expect(readDispatchedSessionResult(result({ metadata: { source: "subagent", childID: "ses_child", state: "completed" } }))).toBeUndefined()
    expect(readDispatchedSessionResult(result({ metadata: { source: "openchamber-session", sessionID: "ses_child", state: "running" } }))).toBeUndefined()
    expect(readSubagentRun(canonicalMessage)).toBeUndefined()
  })

  test("keeps text without the envelope as it is", () => {
    expect(readDispatchedSessionResult(result({ text: "plain" }))?.output).toBe("plain")
  })
})

describe("timeline roles", () => {
  test("canonical messages do not use synthetic background roles", () => {
    expect(isBackgroundReportEntry(canonicalMessage)).toBe(false)
    expect(isSkippedTimelineMessage(canonicalMessage)).toBe(false)
  })

  test("system messages stay hidden", () => {
    expect(isBackgroundReportEntry({ ...canonicalMessage, role: "system" })).toBe(false)
    expect(isSkippedTimelineMessage({ ...canonicalMessage, role: "system" })).toBe(true)
  })
})
