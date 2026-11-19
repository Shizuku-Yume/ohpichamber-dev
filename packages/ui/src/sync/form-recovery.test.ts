import { describe, expect, test } from "bun:test"
<<<<<<< HEAD
import type { Message, Part } from "@openchamber/agent-contract"
import { hasActiveFormToolInCurrentTurn, recoverPendingFormWithRetry } from "./form-recovery"
||||||| bc50ba56aa
import type { Message, Part } from "@/lib/opencode/model"
import { hasActiveFormToolInCurrentTurn, recoverPendingFormWithRetry } from "./form-recovery"
=======
import type { Message, Part } from "@/lib/opencode/model"
import { hasActiveFormToolInCurrentTurn, recoverPendingFormWithRetry, resolveRecoveryDirectory } from "./form-recovery"
>>>>>>> upstream/main

const message = (role: Message["role"], parts: Part[] = []): Message => ({
  messageId: `${role}-${parts.length}`, sessionId: "ses_1", turnId: "turn_1", role, createdAt: 1, parts,
})

const questionTool = (status: "pending_approval" | "running" | "completed"): Part => ({
  type: "tool_call", partId: `tool-${status}`, toolCallId: `call-${status}`, toolName: "ask", input: {}, status,
})

describe("hasActiveFormToolInCurrentTurn", () => {
  test("detects a pending or running question tool in the current turn", () => {
    expect(hasActiveFormToolInCurrentTurn([message("user"), message("assistant", [questionTool("pending_approval")])])).toBe(true)
    expect(hasActiveFormToolInCurrentTurn([message("user"), message("assistant", [questionTool("running")])])).toBe(true)
  })

  test("ignores completed tools and active tools from an older turn", () => {
    expect(hasActiveFormToolInCurrentTurn([message("assistant", [questionTool("completed")])])).toBe(false)
    expect(hasActiveFormToolInCurrentTurn([
      message("assistant", [questionTool("running")]),
      message("user"),
      message("assistant"),
    ])).toBe(false)
  })

  test("ignores non-question tools", () => {
    const tool: Part = { type: 'tool_call', partId: 'tool-bash', toolCallId: 'call-bash', toolName: 'bash', input: {}, status: 'running' }
    expect(hasActiveFormToolInCurrentTurn([message('user'), message('assistant', [tool])])).toBe(false)
  })
})

describe("recoverPendingFormWithRetry", () => {
  test("retries the cold-start inconsistency with bounded delays and stops on recovery", async () => {
    const delays: number[] = []
    let attempts = 0
    const recovered = await recoverPendingFormWithRetry(
      async () => { attempts += 1; return attempts === 3 },
      { sleep: async (delayMs) => { delays.push(delayMs) } },
    )
    expect(recovered).toBe(true)
    expect(attempts).toBe(3)
    expect(delays).toEqual([500, 1500])
  })

  test("does no more work after cancellation", async () => {
    let attempts = 0
    const recovered = await recoverPendingFormWithRetry(
      async () => { attempts += 1; return false },
      { isCancelled: () => true, sleep: async () => undefined },
    )
    expect(recovered).toBe(false)
    expect(attempts).toBe(0)
  })
})

describe("resolveRecoveryDirectory", () => {
  test("prefers the session's own directory and keeps the fallback when the read fails", () => {
    expect(resolveRecoveryDirectory({ directory: "/real" }, "/stale")).toBe("/real")
    expect(resolveRecoveryDirectory(null, "/stale")).toBe("/stale")
    expect(resolveRecoveryDirectory(null, null)).toBeNull()
  })
})
