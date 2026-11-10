<<<<<<< HEAD
import { describe, expect, test } from "bun:test"
import type { CanonicalEvent, Message, SessionSnapshot, Turn } from "@openchamber/agent-contract"
import { applyDirectoryEvent, installSessionSnapshot } from "./event-reducer"
import { INITIAL_STATE, type State } from "./types"
=======
import { afterEach, describe, expect, test } from "bun:test"
import type { SyncEvent } from "@/lib/opencode/events"
import type { Message, Part, SessionOutcome, ToolPart } from "@/lib/opencode/model"
import { getRuntimeKey } from "@/lib/runtime-switch"
import { ChildStoreManager } from "./child-store"
import { createEventRoutingIndex, handleEvent, markRecordedInterruptedTurn } from "./sync-context"
import { materializeSessionSnapshots, type MaterializedMessageRecord } from "./materialization"
import { deriveRecoveredQuestions, noteQuestionFormSnapshot, resetRecoverableQuestions, useRecoverableQuestionsStore } from "./recoverable-questions"
>>>>>>> bc50ba56a

const user: Message = { messageId: "msg_u", sessionId: "ses_1", turnId: "turn_1", role: "user", createdAt: 1, parts: [] }
const assistant: Message = { messageId: "msg_a", sessionId: "ses_1", turnId: "turn_1", role: "assistant", createdAt: 2, parts: [] }
const runningTurn: Turn = {
  turnId: "turn_1", sessionId: "ses_1", runId: "run_1", status: "running", userMessageId: "msg_u", assistantMessageIds: ["msg_a"], startedAt: 1,
}

<<<<<<< HEAD
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
=======
const isStopped = (message: Message | undefined) => (
  message?.role === "assistant" && message.time.completed !== undefined && message.error?.type === "aborted"
)

const failedWith = (message: Message | undefined) => (
  message?.role === "assistant" && message.time.completed !== undefined && message.closedLocally ? message.error : undefined
)

describe("markRecordedInterruptedTurn", () => {
  for (const outcome of ["interrupted", "failed", "succeeded", undefined] as const) {
    test(`a completed message with a stale question recovers only with an interrupted or failed record: ${outcome}`, () => {
      resetRecoverableQuestions()
      const { store } = setup([])
      const question = { ...runningTool, tool: "question" }
      const completed = { ...openAssistant, time: { created: 2, completed: 3 } }
      const records: MaterializedMessageRecord[] = [{ info: completed, parts: [question] }]
      if (outcome) records.push({ info: idle(outcome), parts: [] })
      const snapshot = materializeSessionSnapshots(store.getState(), "ses_1", records)
      store.setState({ message: snapshot.message, part: snapshot.part })
      noteQuestionFormSnapshot("/repo", [{
        id: "frm_1", sessionID: "ses_1", title: "Question", fields: [{ key: "q0", type: "string" }],
        metadata: { kind: "question", tool: { messageID: "msg_a", id: "prt_t" } },
      }])

      markRecordedInterruptedTurn(store, "ses_1")

      const recovered = deriveRecoveredQuestions(store.getState(), useRecoverableQuestionsStore.getState(), new Set(["ses_1"]))
      expect(recovered).toHaveLength(outcome === "interrupted" || outcome === "failed" ? 1 : 0)
      // The server's completed assistant record remains authoritative.
      expect(store.getState().message.ses_1[0]).toBe(completed)
      const settled = store.getState()
      markRecordedInterruptedTurn(store, "ses_1")
      expect(store.getState()).toBe(settled)
      resetRecoverableQuestions()
    })
  }

  for (const state of [
    { status: "completed", input: {}, output: "answered", time: { start: 2, end: 3 } },
    { status: "error", input: {}, error: "Interaction cancelled because the location shut down", errorType: "aborted", time: { start: 2, end: 3 } },
  ] satisfies ToolPart["state"][]) {
    test(`a recorded interruption preserves the question's terminal ${state.status} outcome`, () => {
      const completed = { ...openAssistant, time: { created: 2, completed: 3 } }
      const { store } = setup([user, completed, idle("interrupted")])
      const question: ToolPart = { ...runningTool, type: "tool", tool: "question", state }
      store.setState({ part: { msg_a: [question] } })

      markRecordedInterruptedTurn(store, "ses_1")

      expect(store.getState().part.msg_a[0]).toBe(question)
      expect(store.getState().message.ses_1[1]).toBe(completed)
    })
  }

  for (const outcome of ["interrupted", "failed"] as const) {
    test(`marks the turn OpenCode recorded as ${outcome}`, () => {
      const { store } = setup([user, openAssistant, idle(outcome)])

      markRecordedInterruptedTurn(store, "ses_1")

      expect(isStopped(store.getState().message.ses_1[1])).toBe(true)
      const tool = store.getState().part.msg_a[0]
      expect(tool?.type === "tool" && tool.state.status).toBe("error")
    })
  }

  test("a failed turn recorded with its error shows that error, not a stop", () => {
    const { store } = setup([user, openAssistant, idle("failed", "msg_i", quota)])

    markRecordedInterruptedTurn(store, "ses_1")

    expect(failedWith(store.getState().message.ses_1[1])).toEqual(quota)
  })

  test("leaves an unfinished turn with no record open (#4156)", () => {
    // Another OpenCode process on the same database (the TUI) is running it.
    const { store } = setup([user, openAssistant])

    markRecordedInterruptedTurn(store, "ses_1")

    expect(store.getState().message.ses_1[1]).toBe(openAssistant)
    expect(store.getState().part.msg_a[0]).toBe(runningTool)
  })

  test("a succeeded record is not a stop", () => {
    const { store } = setup([user, openAssistant, idle("succeeded")])

    markRecordedInterruptedTurn(store, "ses_1")

    expect(store.getState().message.ses_1[1]).toBe(openAssistant)
  })

  test("a record from an earlier turn does not stop a later one", () => {
    const earlier: Message = { ...openAssistant, id: "msg_0", time: { created: 0, completed: 1 } }
    const { store } = setup([earlier, idle("interrupted", "msg_i0"), user, openAssistant])

    markRecordedInterruptedTurn(store, "ses_1")

    expect(store.getState().message.ses_1.at(-1)).toBe(openAssistant)
  })

  test("the newest record decides", () => {
    const { store } = setup([user, openAssistant, idle("interrupted", "msg_i0"), idle("succeeded")])

    markRecordedInterruptedTurn(store, "ses_1")

    expect(store.getState().message.ses_1[1]).toBe(openAssistant)
  })
>>>>>>> bc50ba56a
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
