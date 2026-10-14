import { describe, expect, test } from "bun:test"
import type { QuestionRequest, Session } from "@openchamber/agent-contract"

import { collectComposerForms } from "./sync-context"

const session = (sessionId: string, parentSessionId?: string): Session => ({
  sessionId, projectId: "project-1", workspaceId: "workspace-1", displayPath: ".", rootSessionId: "ses_root",
  ...(parentSessionId ? { parentSessionId } : {}), createdAt: 1, updatedAt: 1, epoch: "epoch-1", headSequence: "0",
  runtimeStatus: "awaiting_input", activeRunId: "run-1", metadata: null, metadataRevision: "0", archiveRevision: "0",
})
const question = (questionId: string, sessionId: string): QuestionRequest => ({
  questionId, sessionId, turnId: "turn-1", prompt: questionId, status: "pending", requestedAt: 1,
  epoch: "epoch-1", version: "1", workerGeneration: "worker-1",
})

describe("composer questions", () => {
  const empty: QuestionRequest[] = []
  const own = question("question_own", "ses_root")
  const child = question("question_child", "ses_child")
  const sessions = [session("ses_root"), session("ses_child", "ses_root"), session("ses_other")]

  test("a session subtree includes only its own pending questions", () => {
    const result = collectComposerForms(sessions, { ses_root: [own], ses_child: [child], ses_other: [question("question_other", "ses_other")] }, "ses_root")
    expect(result).toEqual([own, child])
  })

  test("a session with no pending questions does not receive a pseudo location request", () => {
    expect(collectComposerForms(sessions, {}, "ses_other")).toBe(empty)
  })

  test("without a session there is nothing to show", () => {
    expect(collectComposerForms(sessions, { ses_root: [own] }, null)).toBe(empty)
  })

  test("resolved questions are excluded from the composer", () => {
    const resolved = { ...own, status: "answered" as const, version: "2" as const, response: true, answeredAt: 2, resolvedAt: 2 }
    expect(collectComposerForms(sessions, { ses_root: [resolved] }, "ses_root")).toBe(empty)
  })
})
