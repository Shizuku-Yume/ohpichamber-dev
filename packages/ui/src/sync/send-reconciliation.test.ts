import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import type { AcceptedPromptReceipt, PromptReceiptResult, RejectedPromptReceipt } from "@openchamber/agent-contract"
import { getRuntimeApiBaseUrl, getRuntimeKey, getRuntimeSwitchRevision, switchRuntimeEndpoint } from "@/lib/runtime-switch"
import {
  reconcileInterruptedSend,
  resetSendReconciliationForTests,
  sendReconciliationOutcome,
  type ReconcileInterruptedSendInput,
  type SendReconciliationClock,
} from "./send-reconciliation"

const originalRuntime = getRuntimeKey()
const originalBase = getRuntimeApiBaseUrl()

const sessionId = "session-receipt"
const correlationId = "corr-receipt"

const acceptedReceipt: AcceptedPromptReceipt = {
  outcome: "accepted",
  correlationId,
  sessionId,
  operation: "send",
  runId: "run-accepted",
  acceptedAt: 10,
  expiresAt: 10 + 24 * 60 * 60 * 1000,
}

const rejectedReceipt: RejectedPromptReceipt = {
  outcome: "rejected",
  correlationId,
  sessionId,
  operation: "send",
  code: "RUN_ACTIVE",
  detail: "A run is already active in this session",
  rejectedAt: 10,
  expiresAt: 10 + 24 * 60 * 60 * 1000,
}

const unknownResult: PromptReceiptResult = { status: "unknown", correlationId, sessionId }

type Harness = {
  input: ReconcileInterruptedSendInput
  clock: SendReconciliationClock
  calls: string[]
  script: Array<PromptReceiptResult | "transport-error">
  restored: RejectedPromptReceipt[]
  removed: string[]
  reconciled: Array<string | null>
  resolutions: string[]
  setNow: (value: number) => void
  advanceNow: (ms: number) => void
}

function harness(script: Array<PromptReceiptResult | "transport-error">): Harness {
  const calls: string[] = []
  const restored: RejectedPromptReceipt[] = []
  const removed: string[] = []
  const reconciled: Array<string | null> = []
  const resolutions: string[] = []
  let now = 0
  const clock: SendReconciliationClock = {
    pollDelays: [1, 1, 1],
    steadyDelay: 1,
    windowMs: 20,
    retentionMs: 0,
    sleep: async () => {
      now += 1
    },
    now: () => now,
  }
  const input: ReconcileInterruptedSendInput = {
    runtimeKey: getRuntimeKey(),
    runtimeRevision: getRuntimeSwitchRevision(),
    sessionId,
    directory: "/receipts",
    correlationId,
    content: "Interrupted prompt",
    reconcileAccepted: (runId) => {
      reconciled.push(runId)
    },
    removePendingEcho: () => {
      removed.push(correlationId)
    },
    restoreDraft: (receipt) => {
      restored.push(receipt)
    },
    notifyResolved: (resolution) => {
      resolutions.push(resolution.outcome)
    },
    queryReceipt: async (queriedSession, queriedCorrelation) => {
      calls.push(`${queriedSession}/${queriedCorrelation}`)
      const next = script.length > 1 ? script.shift() : script[0]
      if (next === "transport-error" || next === undefined) throw new TypeError("Failed to fetch")
      return next
    },
  }
  return {
    input,
    clock,
    calls,
    script,
    restored,
    removed,
    reconciled,
    resolutions,
    setNow: (value) => {
      now = value
    },
    advanceNow: (ms) => {
      now += ms
    },
  }
}

beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: "https://receipts.test", runtimeKey: "receipts" })
  resetSendReconciliationForTests()
})

afterEach(() => {
  resetSendReconciliationForTests()
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime })
  mock.restore()
})

describe("interrupted send reconciliation", () => {
  test("accepted receipt reconciles the echo through its run exactly once and never restores", async () => {
    const h = harness([{ status: "accepted", receipt: acceptedReceipt }])
    const resolution = await reconcileInterruptedSend(h.input, h.clock)
    expect(resolution.outcome).toBe("accepted")
    expect(h.reconciled).toEqual(["run-accepted"])
    expect(h.restored).toHaveLength(0)
    expect(h.removed).toHaveLength(0)
    expect(h.resolutions).toEqual(["accepted"])
    expect(h.calls).toEqual([`${sessionId}/${correlationId}`])
  })

  test("rejected receipt removes the echo and restores the draft with the receipt detail", async () => {
    const h = harness([{ status: "rejected", receipt: rejectedReceipt }])
    const resolution = await reconcileInterruptedSend(h.input, h.clock)
    expect(resolution.outcome).toBe("rejected")
    expect(h.removed).toEqual([correlationId])
    expect(h.restored).toEqual([rejectedReceipt])
    expect(h.reconciled).toHaveLength(0)
    expect(h.resolutions).toEqual(["rejected"])
  })

  test("unknown stays pending through the whole window and never auto-restores", async () => {
    const h = harness([unknownResult])
    const resolution = await reconcileInterruptedSend(h.input, h.clock)
    expect(resolution.outcome).toBe("expired")
    expect(h.restored).toHaveLength(0)
    expect(h.removed).toHaveLength(0)
    expect(h.reconciled).toHaveLength(0)
    expect(h.calls.length).toBeGreaterThan(3)
    expect(h.resolutions).toEqual(["expired"])
  })

  test("transport failure mid-window is not an answer; a later accepted still converges", async () => {
    const h = harness(["transport-error", unknownResult, { status: "accepted", receipt: acceptedReceipt }])
    const resolution = await reconcileInterruptedSend(h.input, h.clock)
    expect(resolution.outcome).toBe("accepted")
    expect(h.reconciled).toEqual(["run-accepted"])
    expect(h.restored).toHaveLength(0)
    expect(h.calls.length).toBe(3)
  })

  test("a runtime switch orphans the loop without restore, removal or further queries", async () => {
    const h = harness([unknownResult])
    const pending = reconcileInterruptedSend(h.input, h.clock)
    await Promise.resolve()
    await Promise.resolve()
    const callsBefore = h.calls.length
    switchRuntimeEndpoint({ apiBaseUrl: "https://elsewhere.test", runtimeKey: "elsewhere" })
    const resolution = await pending
    expect(resolution.outcome).toBe("orphaned")
    expect(h.restored).toHaveLength(0)
    expect(h.removed).toHaveLength(0)
    expect(h.reconciled).toHaveLength(0)
    expect(h.calls.length).toBeLessThanOrEqual(callsBefore + 1)
  })

  test("a repeated adoption for the same correlation id joins the running loop", async () => {
    const h = harness([{ status: "rejected", receipt: rejectedReceipt }])
    const first = reconcileInterruptedSend(h.input, h.clock)
    const second = reconcileInterruptedSend(h.input, h.clock)
    expect(second).toBe(first)
    await first
    expect(h.restored).toEqual([rejectedReceipt])
    expect(h.calls).toHaveLength(1)
  })

  test("sendReconciliationOutcome reads the settled resolution after the loop finishes", async () => {
    const h = harness([{ status: "accepted", receipt: acceptedReceipt }])
    const pending = reconcileInterruptedSend(h.input, h.clock)
    const observer = sendReconciliationOutcome(sessionId, correlationId)
    expect(observer).not.toBeNull()
    const resolution = await pending
    expect((await observer!)?.outcome).toBe("accepted")
    expect(resolution.receipt).toEqual(acceptedReceipt)
  })

  test("unknown after a service restart window still flips to a late accepted outcome", async () => {
    // The service restarts between polls: queries transport-fail or answer
    // unknown while receipts reload, then the durable row answers accepted.
    const h = harness(["transport-error", unknownResult, unknownResult, { status: "accepted", receipt: acceptedReceipt }])
    const resolution = await reconcileInterruptedSend(h.input, h.clock)
    expect(resolution.outcome).toBe("accepted")
    expect(h.reconciled).toEqual(["run-accepted"])
    expect(h.restored).toHaveLength(0)
    expect(h.removed).toHaveLength(0)
    expect(h.calls.length).toBe(4)
  })
})
