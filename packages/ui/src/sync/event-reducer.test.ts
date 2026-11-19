import { describe, expect, test } from "bun:test"
import type { CanonicalEvent, Message, Run, RuntimeSession, Session, SessionSnapshot } from "@openchamber/agent-contract"
import { applyDirectoryEvent, clearSessionAdvisor, compareCounters, installQueue, installRuntimeRun, installSessionMetadata, installSessionSnapshot, mergeHostSession } from "./event-reducer"
import { INITIAL_STATE, type State } from "./types"

const runtime = (overrides: Partial<RuntimeSession> = {}): RuntimeSession => ({
  sessionId: "session-1", projectId: "project-1", workspaceId: "workspace-1", displayPath: ".", rootSessionId: "session-1",
  createdAt: 1, updatedAt: 1, epoch: "epoch-1", headSequence: "0", runtimeStatus: "idle", activeRunId: null, mode: { kind: "main" }, ...overrides,
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
  test.each([
    event("1", "btw.delta", { recordId: "btw-1", delta: "Answer" }),
    event("1", "btw.completed", { recordId: "btw-1", status: "completed", text: "Answer" }),
    event("1", "subagent.updated", { subagent: { subagentId: "child", parentSessionId: "session-1", role: "task", status: "completed" } }),
  ])("ephemeral $type consumes its sequence before the next durable event", observation => {
    const base = state({ snapshot: { "session-1": snapshot() } })
    const observed = applyDirectoryEvent(base, observation)
    expect(observed.kind).toBe("applied")
    expect(observed.state.snapshot["session-1"]?.session.headSequence).toBe("1")
    expect(applyDirectoryEvent(observed.state, event("2", "session.status", { runtimeStatus: "idle", activeRunId: null })).kind).toBe("applied")
    expect(applyDirectoryEvent(observed.state, observation).kind).toBe("duplicate")
    expect(applyDirectoryEvent(base, { ...observation, sequence: "2" }).kind).toBe("resnapshot")
    expect(applyDirectoryEvent(base, { ...observation, epoch: "old" }).kind).toBe("resnapshot")
  })

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
  test("projects a top-level mode event to the snapshot and live session row", () => {
    const base = state({ snapshot: { "session-1": snapshot() }, sessionCursor: { "session-1": "epoch-1:0" } })
    const changed = applyDirectoryEvent(base, event("1", "session.updated", { mode: { kind: "plan", status: "active", planReference: "local://plans/session-1.md" } }))
    expect(changed.kind).toBe("applied")
    expect(changed.state.snapshot["session-1"]?.session.mode).toEqual({ kind: "plan", status: "active", planReference: "local://plans/session-1.md" })
    expect(changed.state.session[0]?.mode).toEqual({ kind: "plan", status: "active", planReference: "local://plans/session-1.md" })
    expect(applyDirectoryEvent(changed.state, event("1", "session.updated", { mode: { kind: "main" } })).kind).toBe("duplicate")
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

  test("projects live selection updates into the snapshot", () => {
    const base = state({ snapshot: { "session-1": snapshot() }, sessionCursor: { "session-1": "epoch-1:0" } })
    const changed = applyDirectoryEvent(base, event("1", "session.updated", { selection: { model: { providerId: "provider-1", modelId: "model-1" }, thinkingLevel: "off" } }))
    expect(changed.kind).toBe("applied")
    expect(changed.state.snapshot["session-1"]?.selection).toEqual({ model: { providerId: "provider-1", modelId: "model-1" }, thinkingLevel: "off" })
    expect(changed.state.session[0]).toBe(base.session[0])
    const cleared = applyDirectoryEvent(changed.state, event("2", "session.updated", { selection: { model: null, thinkingLevel: null } }))
    expect(cleared.state.snapshot["session-1"]?.selection).toEqual({ model: null, thinkingLevel: null })
  })

  test("preserves newer host metadata when an older update arrives", () => {
    const current = session({ metadata: { notes: "New" }, metadataRevision: "8" })
    const prior = snapshot({ session: runtime({ headSequence: "0" }) })
    const base = state({ session: [current], snapshot: { "session-1": prior }, sessionCursor: { "session-1": "epoch-1:0" } })
    const result = applyDirectoryEvent(base, event("1", "session.updated", { session: runtime({ headSequence: "1" }), metadata: { notes: "Old" }, metadataRevision: "7" }))
    expect(result.kind).toBe("applied")
    expect(result.state.session[0]?.metadata).toEqual({ notes: "New" })
    expect(result.state.session[0]?.metadataRevision).toBe("8")
  })

  test("settles a matching cancelled run", () => {
    const running = snapshot({ session: runtime({ headSequence: "0", runtimeStatus: "running", activeRunId: "run-1" }), activeRun: { runId: "run-1", sessionId: "session-1", status: "running", origin: "host", createdAt: 1 } })
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
    const prior = session({ title: "new", metadata: {}, metadataRevision: "10", archiveRevision: "10", archivedAt: 20, headSequence: "4" })
    const merged = mergeHostSession(session({ title: "old", metadata: {}, metadataRevision: "2", archiveRevision: "2", headSequence: "2" }), prior)
    expect(merged.metadata).toBe(prior.metadata)
    expect(merged.archivedAt).toBe(20)
    expect(merged.headSequence).toBe("4")
    const base = state({ session: [prior], queue: { "session-1": { sessionId: "session-1", revision: "10", items: [] } } })
    expect(installSessionMetadata(base, { sessionId: "session-1", revision: "2", metadata: null })).toBe(base)
    // Default is drop, not buffer: only the caller that cannot know the
    // record's directory asks for it to be held.
    expect(installSessionMetadata(base, { sessionId: "session-absent", revision: "1", metadata: null })).toBe(base)
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

  const run = (overrides: Partial<Run> = {}): Run => ({ runId: "run-1", sessionId: "session-1", status: "running", origin: "host", createdAt: 5, ...overrides })

  test("an accepted run acknowledgement binds live control state before its event arrives", () => {
    const base = installSessionSnapshot(state(), snapshot())
    const accepted = installRuntimeRun(base, run())
    expect(accepted.session_status["session-1"]).toBe("running")
    expect(accepted.snapshot["session-1"]?.session).toMatchObject({ runtimeStatus: "running", activeRunId: "run-1" })
    expect(accepted.snapshot["session-1"]?.activeRun).toEqual({ runId: "run-1", sessionId: "session-1", status: "running", origin: "host", createdAt: 5 })
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
  test("reduces cleanse.progress events across discovering, repairing, and completed transitions", () => {
    let current = installSessionSnapshot(state(), snapshot());
    const cleanseEvent = (seq: string, status: 'discovering' | 'repairing' | 'verifying' | 'completed' | 'failed' | 'cancelled', fields: Record<string, unknown> = {}): CanonicalEvent => ({
      sessionId: "session-1",
      epoch: "epoch-1",
      sequence: seq,
      timestamp: 1000,
      type: "cleanse.progress",
      status,
      activeCheckers: [],
      completedCheckers: [],
      repairedFiles: [],
      ...fields,
    });

    // Start: discovering
    const discoveringResult = applyDirectoryEvent(current, cleanseEvent("1", "discovering", { activeCheckers: ["typescript", "oxlint"] }));
    expect(discoveringResult.kind).toBe("applied");
    current = discoveringResult.state;
    expect(current.cleanse?.["session-1"]).toBeDefined();
    expect(current.cleanse?.["session-1"]?.status).toBe("discovering");
    expect(current.cleanse?.["session-1"]?.activeCheckers).toEqual(["typescript", "oxlint"]);

    // Progress: checkers completing
    const progressResult = applyDirectoryEvent(current, cleanseEvent("2", "discovering", {
      activeCheckers: ["typescript"],
      completedCheckers: ["oxlint"],
      diagnosticsCount: 2,
    }));
    expect(progressResult.kind).toBe("applied");
    current = progressResult.state;
    expect(current.cleanse?.["session-1"]?.activeCheckers).toEqual(["typescript"]);
    expect(current.cleanse?.["session-1"]?.completedCheckers).toEqual(["oxlint"]);
    expect(current.cleanse?.["session-1"]?.diagnosticsCount).toBe(2);

    // Repairing
    const repairResult = applyDirectoryEvent(current, cleanseEvent("3", "repairing", {
      completedCheckers: ["oxlint", "typescript"],
      repairedFiles: ["src/index.ts"],
    }));
    current = repairResult.state;
    expect(current.cleanse?.["session-1"]?.status).toBe("repairing");
    expect(current.cleanse?.["session-1"]?.repairedFiles).toEqual(["src/index.ts"]);

    // Completed
    const completedResult = applyDirectoryEvent(current, cleanseEvent("4", "completed", {
      completedCheckers: ["oxlint", "typescript"],
      repairedFiles: ["src/index.ts"],
      summary: "Cleanse finished",
    }));
    current = completedResult.state;
    expect(current.cleanse?.["session-1"]?.status).toBe("completed");
    expect(current.cleanse?.["session-1"]?.summary).toBe("Cleanse finished");

    // Stale sequence is ignored
    const staleResult = applyDirectoryEvent(current, cleanseEvent("2", "discovering", { activeCheckers: ["stale"] }));
    expect(staleResult.state.cleanse?.["session-1"]?.status).toBe("completed");
  });

  test("cleanse.progress respects session scoping and preserves other sessions", () => {
    let current = installSessionSnapshot(state(), snapshot());
    const cleanseEvent = (sessionId: string, seq: string, status: 'discovering' | 'completed', repairedFiles: string[] = []): CanonicalEvent => ({
      sessionId,
      epoch: "epoch-1",
      sequence: seq,
      timestamp: 1000,
      type: "cleanse.progress",
      status,
      activeCheckers: [],
      completedCheckers: [],
      repairedFiles,
    });

    current = applyDirectoryEvent(current, cleanseEvent("session-1", "1", "discovering")).state;
    current = applyDirectoryEvent(current, cleanseEvent("session-2", "1", "completed", ["fix.ts"])).state;

    expect(current.cleanse?.["session-1"]?.status).toBe("discovering");
    expect(current.cleanse?.["session-2"]?.status).toBe("completed");
    expect(current.cleanse?.["session-2"]?.repairedFiles).toEqual(["fix.ts"]);
  });

  test("cleanse.progress: rejects sequence earlier in epoch A, accepts low sequence in new epoch B with opaque UUID, rejects historical stale", () => {
    const epochA = "ffffffff-1111-4111-8111-111111111111";
    const epochB = "00000000-2222-4222-8222-222222222222"; // Lexicographically earlier!
    let current = installSessionSnapshot(state(), snapshot());

    const makeCleanse = (epoch: string, seq: string, timestamp: number, status: 'discovering' | 'completed' = 'discovering'): CanonicalEvent => ({
      sessionId: "session-1",
      epoch,
      sequence: seq,
      timestamp,
      type: "cleanse.progress",
      status,
      activeCheckers: ["ts"],
      completedCheckers: [],
      repairedFiles: [],
    });

    // Epoch A at sequence 10
    current = applyDirectoryEvent(current, makeCleanse(epochA, "10", 1000)).state;
    expect(current.cleanse?.["session-1"]?.epoch).toBe(epochA);
    expect(current.cleanse?.["session-1"]?.sequence).toBe("10");

    // Sequence earlier in epoch A (sequence 5 < 10) is rejected
    const staleSeqResult = applyDirectoryEvent(current, makeCleanse(epochA, "5", 1050, "completed"));
    expect(staleSeqResult.state.cleanse?.["session-1"]?.sequence).toBe("10");
    expect(staleSeqResult.state.cleanse?.["session-1"]?.status).toBe("discovering");

    // New epoch B (opaque UUID sorting earlier): sequence 1 is accepted!
    const newEpochResult = applyDirectoryEvent(current, makeCleanse(epochB, "1", 2000, "completed"));
    current = newEpochResult.state;
    expect(current.cleanse?.["session-1"]?.epoch).toBe(epochB);
    expect(current.cleanse?.["session-1"]?.sequence).toBe("1");
    expect(current.cleanse?.["session-1"]?.status).toBe("completed");

    // Historical stale event from older epoch A arriving late (timestamp 1100 < 2000) is rejected
    const histStaleResult = applyDirectoryEvent(current, makeCleanse(epochA, "99", 1100, "discovering"));
    expect(histStaleResult.state.cleanse?.["session-1"]?.epoch).toBe(epochB);
    expect(histStaleResult.state.cleanse?.["session-1"]?.sequence).toBe("1");
    expect(histStaleResult.state.cleanse?.["session-1"]?.status).toBe("completed");
  });

  test("advisor_yielded: reduces notes, rejects earlier sequence in epoch A, accepts low sequence in new epoch B, merges notes deduplicated", () => {
    const epochA = "ffffffff-1111-4111-8111-111111111111";
    const epochB = "00000000-2222-4222-8222-222222222222";
    let current = installSessionSnapshot(state(), snapshot());

    const advisorEvent = (epoch: string, seq: string, timestamp: number, notes: Array<{ noteId: string; severity: 'blocker' | 'concern' | 'nit'; text: string; timestamp: number }>): CanonicalEvent => ({
      sessionId: "session-1",
      epoch,
      sequence: seq,
      timestamp,
      type: "advisor_yielded",
      notes,
    });

    // First event in epoch A
    current = applyDirectoryEvent(current, advisorEvent(epochA, "10", 1000, [
      { noteId: "note-1", severity: "blocker", text: "Missing return", timestamp: 1000 },
    ])).state;

    expect(current.advisor?.["session-1"]).toBeDefined();
    expect(current.advisor?.["session-1"]?.epoch).toBe(epochA);
    expect(current.advisor?.["session-1"]?.sequence).toBe("10");
    expect(current.advisor?.["session-1"]?.notes).toHaveLength(1);
    expect(current.advisor?.["session-1"]?.notes[0]?.text).toBe("Missing return");

    // Stale sequence in epoch A is rejected
    const staleResult = applyDirectoryEvent(current, advisorEvent(epochA, "5", 1050, [
      { noteId: "note-stale", severity: "nit", text: "Stale note", timestamp: 1050 },
    ]));
    expect(staleResult.state.advisor?.["session-1"]?.sequence).toBe("10");
    expect(staleResult.state.advisor?.["session-1"]?.notes).toHaveLength(1);

    // Subsequent sequence in epoch A merges notes deduplicated by noteId and ordered by timestamp
    current = applyDirectoryEvent(current, advisorEvent(epochA, "11", 1100, [
      { noteId: "note-1", severity: "blocker", text: "Missing return updated", timestamp: 1000 },
      { noteId: "note-2", severity: "concern", text: "Add timeout", timestamp: 1050 },
    ])).state;
    expect(current.advisor?.["session-1"]?.sequence).toBe("11");
    expect(current.advisor?.["session-1"]?.notes).toHaveLength(2);
    expect(current.advisor?.["session-1"]?.notes[0]?.noteId).toBe("note-1");
    expect(current.advisor?.["session-1"]?.notes[1]?.noteId).toBe("note-2");

    // New epoch B (opaque UUID): low sequence "1" is accepted
    current = applyDirectoryEvent(current, advisorEvent(epochB, "1", 2000, [
      { noteId: "note-b-1", severity: "concern", text: "New epoch note", timestamp: 2000 },
    ])).state;
    expect(current.advisor?.["session-1"]?.epoch).toBe(epochB);
    expect(current.advisor?.["session-1"]?.sequence).toBe("1");
    expect(current.advisor?.["session-1"]?.notes).toHaveLength(1);
    expect(current.advisor?.["session-1"]?.notes[0]?.noteId).toBe("note-b-1");

    // Historical stale event from epoch A (timestamp 1200 < 2000) is rejected
    const histStale = applyDirectoryEvent(current, advisorEvent(epochA, "99", 1200, [
      { noteId: "note-old", severity: "nit", text: "Historical note", timestamp: 1200 },
    ]));
    expect(histStale.state.advisor?.["session-1"]?.epoch).toBe(epochB);
    expect(histStale.state.advisor?.["session-1"]?.sequence).toBe("1");
    expect(histStale.state.advisor?.["session-1"]?.notes[0]?.noteId).toBe("note-b-1");

    // clearSessionAdvisor removes advisor notes for that session
    current = clearSessionAdvisor(current, "session-1");
    expect(current.advisor?.["session-1"]).toBeUndefined();
  });

  test("session.deleted cleans up cleanse and advisor state for deleted sessions", () => {
    let current = installSessionSnapshot(state(), snapshot());
    current = {
      ...current,
      cleanse: {
        "session-1": {
          sessionId: "session-1",
          epoch: "epoch-1",
          sequence: "1",
          status: "completed",
          activeCheckers: [],
          completedCheckers: [],
          repairedFiles: [],
          updatedAt: 1000,
        },
      },
      advisor: {
        "session-1": {
          sessionId: "session-1",
          epoch: "epoch-1",
          sequence: "1",
          notes: [{ noteId: "n1", severity: "nit", text: "test", timestamp: 1000 }],
          updatedAt: 1000,
        },
      },
    };

    const deleted = applyDirectoryEvent(current, {
      sessionId: "session-1",
      epoch: "epoch-1",
      sequence: "1",
      timestamp: 2000,
      type: "session.deleted",
      deletedSessionIds: ["session-1"],
    });

    expect(deleted.state.cleanse?.["session-1"]).toBeUndefined();
    expect(deleted.state.advisor?.["session-1"]).toBeUndefined();
    expect(deleted.state.advisor?.["session-1"]).toBeUndefined();
  });

  test("projects live compacting state and clears it on null or snapshot recovery", () => {
    const base = state({ snapshot: { "session-1": snapshot() }, sessionCursor: { "session-1": "epoch-1:0" } })
    const started = applyDirectoryEvent(base, event("1", "session.updated", {
      compacting: { method: "soft-compacted", reason: "threshold", startedAt: 100 },
    }))
    expect(started.kind).toBe("applied")
    expect(started.state.snapshot["session-1"]?.compacting).toEqual({
      method: "soft-compacted",
      reason: "threshold",
      startedAt: 100,
    })

    const cleared = applyDirectoryEvent(started.state, event("2", "session.updated", { compacting: null }))
    expect(cleared.kind).toBe("applied")
    expect(cleared.state.snapshot["session-1"]?.compacting).toBeNull()

    const restarted = applyDirectoryEvent(cleared.state, event("3", "session.updated", {
      compacting: { method: "soft-compacted", reason: "overflow", startedAt: 200 },
    }))
    expect(restarted.state.snapshot["session-1"]?.compacting?.method).toBe("soft-compacted")

    const compacted = applyDirectoryEvent(restarted.state, event("4", "session.compacted", {
      compactionId: "cmp-1",
      tokensBefore: 1000,
      completedAt: 250,
    }))
    expect(compacted.kind).toBe("resnapshot")

    const recovered = installSessionSnapshot(restarted.state, snapshot({
      session: runtime({ headSequence: "4" }),
      cursor: "epoch-1:4",
      compacting: null,
    }))
    expect(recovered.snapshot["session-1"]?.compacting).toBeNull()
  })

  test("projects live todos and clears them when todo_auto_clear emits an empty list", () => {
    const base = state({ snapshot: { "session-1": snapshot() }, sessionCursor: { "session-1": "epoch-1:0" } })
    const phases = [{ name: "Plan", tasks: [{ content: "Inspect", status: "in_progress" }] }]
    const updated = applyDirectoryEvent(base, event("1", "session.updated", { todos: phases }))
    expect(updated.kind).toBe("applied")
    expect(updated.state.snapshot["session-1"]?.todos).toEqual(phases)

    const cleared = applyDirectoryEvent(updated.state, event("2", "session.updated", { todos: [] }))
    expect(cleared.kind).toBe("applied")
    expect(cleared.state.snapshot["session-1"]?.todos).toEqual([])
  })
})
