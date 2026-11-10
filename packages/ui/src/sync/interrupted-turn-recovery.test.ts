import { describe, expect, test } from "bun:test"
import type { CanonicalEvent, Message, SessionSnapshot, Turn } from "@openchamber/agent-contract"
import { applyDirectoryEvent, installSessionSnapshot } from "./event-reducer"
import { INITIAL_STATE, type State } from "./types"

const user: Message = { messageId: "msg_u", sessionId: "ses_1", turnId: "turn_1", role: "user", createdAt: 1, parts: [] }
const assistant: Message = { messageId: "msg_a", sessionId: "ses_1", turnId: "turn_1", role: "assistant", createdAt: 2, parts: [] }
const runningTurn: Turn = {
  turnId: "turn_1", sessionId: "ses_1", runId: "run_1", status: "running", userMessageId: "msg_u", assistantMessageIds: ["msg_a"], startedAt: 1,
}

const snapshot = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  session: {
    sessionId: "ses_1", projectId: "project-1", workspaceId: "workspace-1", displayPath: ".", rootSessionId: "ses_1",
    createdAt: 1, updatedAt: 2, epoch: "epoch-1", headSequence: "0", runtimeStatus: "running", activeRunId: "run_1",
    mode: { kind: "main" },
  },
  cursor: "epoch-1:0", activeRun: { runId: "run_1", sessionId: "ses_1", status: "running", origin: "host", createdAt: 1 },
  branch: { branchId: "branch-1", branchVersion: "0", leafMessageId: "msg_a" },
  window: { firstTurnId: "turn_1", lastTurnId: "turn_1", firstMessageId: "msg_u", lastMessageId: "msg_a", hasEarlier: false },
  turns: [runningTurn], messages: [user, assistant], approvals: [], questions: [],
  requestRecovery: { pendingSet: "replace", priorEpochs: "expired" }, ...overrides,
})

const state = (overrides: Partial<State> = {}): State => ({
  ...INITIAL_STATE,
  session: [{ ...snapshot().session, metadata: null, metadataRevision: "0", archiveRevision: "0" }], sessionTotal: 1,
  ...overrides,
})

const event = (sequence: string, type: CanonicalEvent["type"], fields: Record<string, unknown> = {}): CanonicalEvent => ({
  sessionId: "ses_1", epoch: "epoch-1", sequence, timestamp: Number(sequence), type, ...fields,
}) as CanonicalEvent

describe("canonical interrupted-turn recovery", () => {
  test.each(["run.failed", "run.cancelled"] as const)("a terminal run event settles an interrupted %s turn", (type) => {
    const base = installSessionSnapshot(state(), snapshot())
    const result = applyDirectoryEvent(base, event("1", type, { runId: "run_1", finishedAt: 3, ...(type === "run.failed" ? { error: "interrupted" } : {}) }))
    expect(result.kind).toBe("applied")
    expect(result.state.session_status.ses_1).toBe("idle")
    expect(result.state.snapshot.ses_1?.activeRun).toBeNull()
    expect(result.state.snapshot.ses_1?.turns[0]?.status).toBe("running")
  })

  test("a completion for an older run cannot stop the current run", () => {
    const current = snapshot({
      session: { ...snapshot().session, activeRunId: "run_2" },
      activeRun: { runId: "run_2", sessionId: "ses_1", status: "running", origin: "host", createdAt: 2 },
    })
    const base = installSessionSnapshot(state(), current)
    const result = applyDirectoryEvent(base, event("1", "run.completed", { runId: "run_1", finishedAt: 3 }))
    expect(result.kind).toBe("applied")
    expect(result.state.session_status.ses_1).toBe("running")
    expect(result.state.snapshot.ses_1?.activeRun?.runId).toBe("run_2")
  })

  test("a canonical turn completion closes the matching turn", () => {
    const base = installSessionSnapshot(state(), snapshot())
    const result = applyDirectoryEvent(base, event("1", "turn.completed", { turnId: "turn_1", runId: "run_1" }))
    expect(result.kind).toBe("applied")
    expect(result.state.snapshot.ses_1?.turns[0]?.status).toBe("completed")
    expect(result.state.snapshot.ses_1?.turns[0]?.finishedAt).toBe(1)
  })

  test("duplicate and gap events leave the recovered snapshot untouched", () => {
    const base = installSessionSnapshot(state(), snapshot())
    const first = applyDirectoryEvent(base, event("1", "run.cancelled", { runId: "run_1", finishedAt: 3 }))
    expect(applyDirectoryEvent(first.state, event("1", "run.cancelled", { runId: "run_1", finishedAt: 3 })).kind).toBe("duplicate")
    const gap = applyDirectoryEvent(base, event("2", "run.cancelled", { runId: "run_1", finishedAt: 3 }))
    expect(gap.kind).toBe("resnapshot")
    expect(gap.state).toBe(base)
  })
})
