import { describe, expect, test } from "bun:test"
import type { ApprovalRequest, CanonicalEvent, QuestionRequest, SessionSnapshot } from "@openchamber/agent-contract"
import { applyDirectoryEvent, installSessionSnapshot } from "./event-reducer"
import { INITIAL_STATE, type State } from "./types"

const question = (overrides: Partial<QuestionRequest> = {}): QuestionRequest => ({
  questionId: "question-1", sessionId: "session-1", turnId: "turn-1", prompt: "Continue?", status: "pending", requestedAt: 1,
  epoch: "epoch-1", version: "1", workerGeneration: "worker-1", ...overrides,
})
const approval = (): ApprovalRequest => ({
  approvalId: "approval-1", sessionId: "session-1", turnId: "turn-1", toolCallId: "tool-1", toolName: "bash",
  actionType: "bash_command", commandSummary: "pwd", details: {}, status: "pending", requestedAt: 1,
  epoch: "epoch-1", version: "1", workerGeneration: "worker-1",
})
const snapshot = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  session: {
    sessionId: "session-1", projectId: "project-1", workspaceId: "workspace-1", displayPath: ".", rootSessionId: "session-1",
    createdAt: 1, updatedAt: 1, epoch: "epoch-1", headSequence: "0", runtimeStatus: "idle", activeRunId: null,
  },
  cursor: "epoch-1:0", activeRun: null,
  branch: { branchId: "branch-1", branchVersion: "0", leafMessageId: null },
  window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false },
  turns: [], messages: [], approvals: [], questions: [],
  requestRecovery: { pendingSet: "replace", priorEpochs: "expired" }, ...overrides,
})
const state = (overrides: Partial<State> = {}): State => ({
  ...INITIAL_STATE,
  session: [{ ...snapshot().session, metadata: null, metadataRevision: "0", archiveRevision: "0" }], sessionTotal: 1,
  ...overrides,
})
const event = (sequence: string, type: CanonicalEvent["type"], fields: Record<string, unknown> = {}): CanonicalEvent => ({
  sessionId: "session-1", epoch: "epoch-1", sequence, timestamp: Number(sequence), type, ...fields,
}) as CanonicalEvent

describe("canonical snapshot recovery", () => {
  test("accepts a contiguous status event once and rejects repeated delivery", () => {
    const base = installSessionSnapshot(state(), snapshot())
    const applied = applyDirectoryEvent(base, event("1", "session.status", { runtimeStatus: "running", activeRunId: "run-1" }))
    expect(applied.kind).toBe("applied")
    const duplicate = applyDirectoryEvent(applied.state, event("1", "session.status", { runtimeStatus: "running", activeRunId: "run-1" }))
    expect(duplicate.kind).toBe("duplicate")
  })

  test("an older snapshot cannot overwrite a newer head", () => {
    const current = installSessionSnapshot(state(), snapshot({ session: { ...snapshot().session, headSequence: "2" }, cursor: "epoch-1:2" }))
    const older = installSessionSnapshot(current, snapshot())
    expect(older).toBe(current)
  })

  test("a stale runtime event does not erase independently recovered requests", () => {
    const pending = snapshot({ approvals: [approval()], questions: [question()] })
    const base = installSessionSnapshot(state(), pending)
    const result = applyDirectoryEvent(base, event("1", "session.updated", {
      session: { ...snapshot().session, headSequence: "1" }, metadata: null, metadataRevision: "0", archivedAt: null, archiveRevision: "0",
    }))
    expect(result.kind).toBe("applied")
    expect(result.state.permission["session-1"]).toEqual([approval()])
    expect(result.state.form["session-1"]).toEqual([question()])
  })

  test("CAS-resolved questions are removed from the pending replacement set", () => {
    const base = installSessionSnapshot(state(), snapshot({ questions: [question()] }))
    const resolved = question({ status: "cancelled", version: "2", resolvedAt: 2, resolvedBy: "user-1" })
    const result = applyDirectoryEvent(base, event("1", "question.resolved", { question: resolved }))
    expect(result.kind).toBe("applied")
    expect(result.state.form["session-1"]).toEqual([])
  })

  test("a newly requested question survives an older empty snapshot", () => {
    const base = installSessionSnapshot(state(), snapshot())
    const requested = applyDirectoryEvent(base, event("1", "question.requested", { question: question() }))
    expect(requested.kind).toBe("applied")
    const older = installSessionSnapshot(requested.state, snapshot())
    expect(older).toBe(requested.state)
    expect(older.form["session-1"]).toEqual([question()])
  })

  test("session deletion clears runtime, status, and blocking request caches", () => {
    const base = installSessionSnapshot(state(), snapshot({ approvals: [approval()], questions: [question()] }))
    const result = applyDirectoryEvent(base, event("1", "session.deleted", { deletedSessionIds: ["session-1"] }))
    expect(result.state.snapshot["session-1"]).toBeUndefined()
    expect(result.state.session_status["session-1"]).toBeUndefined()
    expect(result.state.permission["session-1"]).toBeUndefined()
    expect(result.state.form["session-1"]).toBeUndefined()
  })

  test("state recovery for one session does not share request mutations with another", () => {
    const other = { ...snapshot(), session: { ...snapshot().session, sessionId: "session-2", rootSessionId: "session-2" }, cursor: "epoch-1:0" }
    const base = installSessionSnapshot(installSessionSnapshot(state({ session: [state().session[0]!, { ...state().session[0]!, sessionId: "session-2", rootSessionId: "session-2" }], sessionTotal: 2 }), snapshot()), other)
    const result = applyDirectoryEvent(base, event("1", "question.requested", { question: question() }))
    expect(result.state.form["session-1"]).toHaveLength(1)
    expect(result.state.form["session-2"]).toEqual([])
  })
})
