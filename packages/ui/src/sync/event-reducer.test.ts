import { describe, expect, test } from "bun:test"
import type { CanonicalEvent, Message, Run, RuntimeSession, Session, SessionSnapshot } from "@openchamber/agent-contract"
import { applyDirectoryEvent, compareCounters, installQueue, installRuntimeRun, installSessionMetadata, installSessionSnapshot, mergeHostSession } from "./event-reducer"
import { INITIAL_STATE, type State } from "./types"

const runtime = (overrides: Partial<RuntimeSession> = {}): RuntimeSession => ({
  sessionId: "session-1", projectId: "project-1", workspaceId: "workspace-1", displayPath: ".", rootSessionId: "session-1",
  createdAt: 1, updatedAt: 1, epoch: "epoch-1", headSequence: "0", runtimeStatus: "idle", activeRunId: null, ...overrides,
})
const session = (overrides: Partial<Session> = {}): Session => ({
  ...runtime(), metadata: null, metadataRevision: "0", archiveRevision: "0", ...overrides,
})
const snapshot = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  session: runtime(), cursor: "epoch-1:0", activeRun: null,
  branch: { branchId: "branch-1", branchVersion: "0", leafMessageId: null },
  window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false },
  turns: [], messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: "replace", priorEpochs: "expired" }, ...overrides,
})
const state = (overrides: Partial<State> = {}): State => ({
  ...INITIAL_STATE, session: [session()], sessionTotal: 1, snapshot: {}, message: {}, permission: {}, form: {},
  sessionEpoch: {}, sessionCursor: {}, partOwner: {}, ...overrides,
})
const event = (sequence: string, type: CanonicalEvent["type"], fields: Record<string, unknown> = {}): CanonicalEvent => ({
  sessionId: "session-1", epoch: "epoch-1", sequence, timestamp: Number(sequence), type, ...fields,
} as CanonicalEvent)

describe("native canonical event reducer", () => {
  test("compares arbitrary uint64 counters numerically", () => {
    expect(compareCounters("9007199254740993", "9007199254740992")).toBe(1)
    expect(compareCounters("10", "2")).toBe(1)
    expect(compareCounters("0", "0")).toBe(0)
  })

  test("installs one atomic runtime snapshot and preserves unrelated references", () => {
    const unrelated = session({ sessionId: "session-2" })
    const prior = state({ session: [session(), unrelated], sessionTotal: 2, catalog: { agent: { kind: "agent", revision: "1", items: [] } as never } })
    const catalog = prior.catalog
    const next = installSessionSnapshot(prior, snapshot({ session: runtime({ headSequence: "2", updatedAt: 20 }), cursor: "epoch-1:2" }))
    expect(next.snapshot["session-1"]?.cursor).toBe("epoch-1:2")
    expect(next.message["session-1"]).toBe(next.snapshot["session-1"]?.messages)
    expect(next.catalog).toBe(catalog)
    expect(next.session.find((item) => item.sessionId === "session-2")).toBe(unrelated)
  })

  test("ignores duplicates, requests resnapshot on gaps and epoch changes", () => {
    const base = state({ snapshot: { "session-1": snapshot() }, sessionCursor: { "session-1": "epoch-1:0" } })
    const duplicate = applyDirectoryEvent(base, event("0", "session.status", { runtimeStatus: "idle", activeRunId: null }))
    expect(duplicate.kind).toBe("duplicate")
    expect(applyDirectoryEvent(base, event("2", "session.status", { runtimeStatus: "running", activeRunId: "run-1" })).kind).toBe("resnapshot")
    expect(applyDirectoryEvent(base, { ...event("1", "session.status", { runtimeStatus: "idle", activeRunId: null }), epoch: "epoch-2" }).kind).toBe("resnapshot")
  })

  test("applies contiguous runtime events while retaining unrelated parts", () => {
    const message: Message = { messageId: "message-1", sessionId: "session-1", turnId: "turn-1", role: "assistant", createdAt: 1, parts: [{ type: "text", partId: "part-1", content: "hello" }] }
    let current = state({ snapshot: { "session-1": snapshot({ messages: [message] }), }, message: { "session-1": [message] }, partOwner: { "session-1": { "part-1": "message-1" } } })
    const result = applyDirectoryEvent(current, event("1", "part.delta", { partId: "part-1", delta: " world" }))
    expect(result.kind).toBe("applied")
    current = result.state
    expect(current.snapshot["session-1"]?.cursor).toBe("epoch-1:0")
    expect(current.snapshot["session-1"]?.session.headSequence).toBe("1")
    expect(current.message["session-1"]?.[0]?.parts[0]).toEqual({ type: "text", partId: "part-1", content: "hello world" })
    expect(current.session.find((item) => item.sessionId === "session-1")).toBeDefined()
  })

  test("resnapshots when a delta addresses an unknown part instead of fabricating state", () => {
    const base = state({ snapshot: { "session-1": snapshot() } })
    const result = applyDirectoryEvent(base, event("1", "part.delta", { partId: "missing", delta: "x" }))
    expect(result.kind).toBe("resnapshot")
    expect(result.state).toBe(base)
  })

  test("preserves newer host metadata when an older update arrives", () => {
    const current = session({ metadata: { title: "New" }, metadataRevision: "8" })
    const prior = snapshot({ session: runtime({ headSequence: "0" }) })
    const base = state({ session: [current], snapshot: { "session-1": prior }, sessionCursor: { "session-1": "epoch-1:0" } })
    const result = applyDirectoryEvent(base, event("1", "session.updated", { session: runtime({ headSequence: "1" }), metadata: { title: "Old" }, metadataRevision: "7" }))
    expect(result.kind).toBe("applied")
    expect(result.state.session[0]?.metadata).toEqual({ title: "New" })
    expect(result.state.session[0]?.metadataRevision).toBe("8")
  })

  test("settles a matching cancelled run", () => {
    const running = snapshot({ session: runtime({ headSequence: "0", runtimeStatus: "running", activeRunId: "run-1" }), activeRun: { runId: "run-1", sessionId: "session-1", status: "running", createdAt: 1 } })
    const base = state({ snapshot: { "session-1": running }, sessionCursor: { "session-1": "epoch-1:0" } })
    const settled = applyDirectoryEvent(base, event("1", "run.cancelled", { runId: "run-1", finishedAt: 2 }))
    expect(settled.kind).toBe("applied")
    expect(settled.state.snapshot["session-1"]?.session.runtimeStatus).toBe("idle")
    expect(settled.state.snapshot["session-1"]?.activeRun).toBeNull()
  })
  test("accepts newer catalog revisions and requests recovery for another workspace", () => {
    const worker = { workspaceId: "workspace-1", rootSessionId: "session-1", workerGeneration: "worker-1" }
    const catalog = (revision: string, workspaceId = "workspace-1") => ({
      kind: "mcp" as const,
      state: { worker: { ...worker, workspaceId }, catalogRevision: revision, items: [] },
    })
    const base = state({ snapshot: { "session-1": snapshot() }, sessionCursor: { "session-1": "epoch-1:0" } })
    const first = applyDirectoryEvent(base, event("1", "catalog.updated", { catalog: catalog("1") }))
    expect(first.kind).toBe("applied")
    const second = applyDirectoryEvent(first.state, event("2", "catalog.updated", { catalog: catalog("2") }))
    expect(second.kind).toBe("applied")
    expect(second.state.catalog["session-1\nmcp"]?.state.catalogRevision).toBe("2")
    expect(applyDirectoryEvent(second.state, event("3", "catalog.updated", { catalog: catalog("3", "other-workspace") })).kind).toBe("resnapshot")
  })

  test("snapshot recovery rejects older heads, clears invalidation and replaces pending scope", () => {
    const base = installSessionSnapshot(state({ sessionStatusInvalidated: { "session-1": true, other: true } }), snapshot({ session: runtime({ headSequence: "9007199254740993" }), cursor: "epoch-1:9007199254740993" }))
    expect(base.sessionStatusInvalidated).toEqual({ other: true })
    expect(installSessionSnapshot(base, snapshot({ session: runtime({ headSequence: "9007199254740992" }), cursor: "epoch-1:9007199254740992" }))).toBe(base)
    expect(installSessionSnapshot(base, base.snapshot["session-1"]!)).toBe(base)
    const restarted = installSessionSnapshot(base, snapshot({ session: runtime({ epoch: "epoch-2" }), cursor: "epoch-2:0" }))
    expect(restarted.sessionEpoch["session-1"]).toBe("epoch-2")
    expect(restarted.permission["session-1"]).toEqual([])
  })

  test("metadata, archive and queue revisions remain independent of runtime snapshots", () => {
    const prior = session({ metadata: { title: "new" }, metadataRevision: "10", archiveRevision: "10", archivedAt: 20, headSequence: "4" })
    const merged = mergeHostSession(session({ metadata: { title: "old" }, metadataRevision: "2", archiveRevision: "2", headSequence: "2" }), prior)
    expect(merged.metadata).toBe(prior.metadata)
    expect(merged.archivedAt).toBe(20)
    expect(merged.headSequence).toBe("4")
    const base = state({ session: [prior], queue: { "session-1": { sessionId: "session-1", revision: "10", items: [] } } })
    expect(installSessionMetadata(base, { sessionId: "session-1", revision: "2", metadata: null })).toBe(base)
    expect(installQueue(base, { sessionId: "session-1", revision: "2", items: [] })).toBe(base)
    const next = installSessionSnapshot(base, snapshot())
    expect(next.queue).toBe(base.queue)
    expect(next.session[0]?.metadata).toBe(prior.metadata)
  })

  test("run completion cannot settle a newer run and opaque cursor remains authoritative", () => {
    let base = installSessionSnapshot(state(), snapshot())
    base = applyDirectoryEvent(base, event("1", "run.started", { runId: "run-2", createdAt: 1 })).state
    const stale = applyDirectoryEvent(base, event("2", "run.completed", { runId: "run-1", finishedAt: 2 }))
    expect(stale.state.session_status["session-1"]).toBe("running")
    expect(stale.state.snapshot["session-1"]?.activeRun?.runId).toBe("run-2")
    const done = applyDirectoryEvent(stale.state, event("3", "run.cancelled", { runId: "run-2", finishedAt: 3 }))
    expect(done.state.session_status["session-1"]).toBe("idle")
    expect(done.state.snapshot["session-1"]?.activeRun).toBeNull()
    expect(done.state.sessionCursor["session-1"]).toBe("epoch-1:0")
  })

  test("canonical turn, message, part and tool lifecycles retain inline authored records", () => {
    let base = installSessionSnapshot(state(), snapshot())
    const events = [
      event("1", "turn.started", { runId: "run-1", turnId: "turn-1", userMessageId: "user-1" }),
      event("2", "message.created", { messageId: "message-1", turnId: "turn-1", role: "assistant" }),
      event("3", "part.started", { messageId: "message-1", part: { type: "reasoning", partId: "reason-1", content: "thinking" } }),
      event("4", "part.delta", { partId: "reason-1", delta: " deeply" }),
      event("5", "part.started", { messageId: "message-1", part: { type: "tool_call", partId: "call-1", toolCallId: "tool-1", toolName: "bash", input: {}, status: "pending_approval" } }),
      event("6", "tool.started", { toolCallId: "tool-1", toolName: "bash" }),
      event("7", "tool.completed", { toolCallId: "tool-1", status: "completed" }),
      event("8", "part.completed", { part: { type: "text", partId: "reason-1", content: "finished" } }),
      event("9", "message.updated", { messageId: "message-1", providerId: "provider-1", modelId: "model-1" }),
      event("10", "turn.completed", { turnId: "turn-1", runId: "run-1" }),
    ]
    for (const item of events) { const result = applyDirectoryEvent(base, item); expect(result.kind).toBe("applied"); base = result.state }
    expect(base.message["session-1"]?.[0]?.parts).toEqual([
      { type: "text", partId: "reason-1", content: "finished" },
      { type: "tool_call", partId: "call-1", toolCallId: "tool-1", toolName: "bash", input: {}, status: "completed" },
    ])
    expect(base.snapshot["session-1"]?.turns[0]?.status).toBe("completed")
    expect(base.partOwner["session-1"]).toEqual({ "reason-1": "message-1", "call-1": "message-1" })
  })

  test("ownership mismatches and compaction recover atomically without advancing cursor", () => {
    const base = installSessionSnapshot(state(), snapshot())
    for (const item of [
      event("1", "queue.updated", { queue: { sessionId: "foreign", revision: "1", items: [] } }),
      event("1", "part.completed", { part: { type: "text", partId: "missing", content: "x" } }),
      event("1", "tool.completed", { toolCallId: "missing", status: "completed" }),
      event("1", "session.updated", { session: runtime({ sessionId: "foreign" }) }),
      event("1", "session.compacted", { compactionId: "compact-1", tokensBefore: 10, completedAt: 1 }),
    ]) { const result = applyDirectoryEvent(base, item); expect(result.kind).toBe("resnapshot"); expect(result.state).toBe(base) }
  })

  test("deletion clears every addressed session cache and preserves siblings", () => {
    let base = installSessionSnapshot(state({ session: [session(), session({ sessionId: "session-2" })] }), snapshot())
    base = installSessionSnapshot(base, snapshot({ session: runtime({ sessionId: "session-2" }) }))
    const sibling = base.snapshot["session-2"]
    const next = applyDirectoryEvent(base, event("1", "session.deleted", { deletedSessionIds: ["session-1"] })).state
    expect(next.snapshot["session-1"]).toBeUndefined()
    expect(next.sessionCursor["session-1"]).toBeUndefined()
    expect(next.permission["session-1"]).toBeUndefined()
    expect(next.snapshot["session-2"]).toBe(sibling)
    expect(next.sessionDeletedRevision?.["session-1"] ?? 0).toBeGreaterThan(0)
  })

  const run = (overrides: Partial<Run> = {}): Run => ({ runId: "run-1", sessionId: "session-1", status: "running", createdAt: 5, ...overrides })

  test("an accepted run acknowledgement binds live control state before its event arrives", () => {
    const base = installSessionSnapshot(state(), snapshot())
    const accepted = installRuntimeRun(base, run())
    expect(accepted.session_status["session-1"]).toBe("running")
    expect(accepted.snapshot["session-1"]?.session).toMatchObject({ runtimeStatus: "running", activeRunId: "run-1" })
    expect(accepted.snapshot["session-1"]?.activeRun).toEqual({ runId: "run-1", sessionId: "session-1", status: "running", createdAt: 5 })
    expect(accepted.session[0]).toMatchObject({ runtimeStatus: "running", activeRunId: "run-1" })
    // Control state only: the transcript is untouched and a repeated ack is a no-op.
    expect(accepted.message["session-1"]).toBe(base.message["session-1"])
    expect(installRuntimeRun(accepted, run())).toBe(accepted)
  })

  test("a stale or foreign run acknowledgement cannot steal the bound run", () => {
    const live = installRuntimeRun(installSessionSnapshot(state(), snapshot()), run())
    expect(installRuntimeRun(live, run({ runId: "run-other" }))).toBe(live)
    // The terminal ack for a run the store never bound is not proof this run ended.
    expect(installRuntimeRun(live, run({ runId: "run-other", status: "cancelled", finishedAt: 6 }))).toBe(live)
  })

  test("only the terminal acknowledgement of the bound run releases it", () => {
    const live = installRuntimeRun(installSessionSnapshot(state(), snapshot()), run())
    const stale = installRuntimeRun(live, run({ runId: "run-old", status: "cancelled", finishedAt: 6 }))
    expect(stale).toBe(live)
    const done = installRuntimeRun(live, run({ status: "cancelled", finishedAt: 7 }))
    expect(done.session_status["session-1"]).toBe("idle")
    expect(done.snapshot["session-1"]?.session).toMatchObject({ runtimeStatus: "idle", activeRunId: null })
    expect(done.snapshot["session-1"]?.activeRun).toBeNull()
    expect(done.session[0]).toMatchObject({ runtimeStatus: "idle", activeRunId: null })
    // A terminal duplicate is a no-op.
    expect(installRuntimeRun(done, run({ status: "cancelled", finishedAt: 7 }))).toBe(done)
  })

  test("a control acknowledgement without a projected session records its mutation revision", () => {
    const base = state({ session: [], sessionTotal: 0, snapshot: { "session-1": snapshot() } })
    const accepted = installRuntimeRun(base, run())
    expect(accepted.snapshot["session-1"]?.session.activeRunId).toBe("run-1")
    expect(accepted.sessionEventRevision?.["session-1"] ?? 0).toBeGreaterThan(0)
  })

  test("an accepted run acknowledgement binds when the head is unchanged since the request", () => {
    const base = installSessionSnapshot(state(), snapshot())
    const accepted = installRuntimeRun(base, run(), { epoch: "epoch-1", headSequence: "0" })
    expect(accepted.session_status["session-1"]).toBe("running")
    expect(accepted.snapshot["session-1"]?.session).toMatchObject({ runtimeStatus: "running", activeRunId: "run-1" })
  })

  test("a late live acknowledgement cannot resurrect a run the session already released", () => {
    let terminal = installSessionSnapshot(state(), snapshot())
    terminal = applyDirectoryEvent(terminal, event("1", "run.started", { runId: "run-1", createdAt: 1 })).state
    terminal = applyDirectoryEvent(terminal, event("2", "run.completed", { runId: "run-1", finishedAt: 2 })).state
    expect(terminal.session_status["session-1"]).toBe("idle")
    expect(terminal.session[0]).toMatchObject({ runtimeStatus: "idle", activeRunId: null })
    // The ack was requested at head 0 and resolved after the terminal head 2.
    expect(installRuntimeRun(terminal, run(), { epoch: "epoch-1", headSequence: "0" })).toBe(terminal)
    // The same ack from a request made at the current head still binds.
    expect(installRuntimeRun(terminal, run(), { epoch: "epoch-1", headSequence: "2" }).session_status["session-1"]).toBe("running")
  })

  test("a newer terminal snapshot rejects a stale live acknowledgement", () => {
    const base = installSessionSnapshot(state(), snapshot({ session: runtime({ headSequence: "2" }), cursor: "epoch-1:2" }))
    expect(installRuntimeRun(base, run(), { epoch: "epoch-1", headSequence: "0" })).toBe(base)
    expect(base.session_status["session-1"]).toBe("idle")
  })

  test("an acknowledgement clears a disconnect invalidation and a later snapshot replaces it", () => {
    const disconnected = state({
      session: [session({ runtimeStatus: "unavailable", activeRunId: null })],
      session_status: { "session-1": "unavailable" },
      sessionStatusInvalidated: { "session-1": true },
    })
    const accepted = installRuntimeRun(disconnected, run())
    expect(accepted.sessionStatusInvalidated?.["session-1"]).toBeUndefined()
    expect(accepted.session_status["session-1"]).toBe("running")
    const authoritative = installSessionSnapshot(accepted, snapshot({ session: runtime({ headSequence: "1", runtimeStatus: "idle" }), cursor: "epoch-1:1" }))
    expect(authoritative.session_status["session-1"]).toBe("idle")
    expect(authoritative.snapshot["session-1"]?.session.activeRunId).toBeNull()
  })
})
