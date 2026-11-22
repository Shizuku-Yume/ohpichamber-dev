import { describe, expect, test } from "bun:test"
import type { CanonicalEvent } from "@openchamber/agent-contract"
import { applyDirectoryEvent, installSessionSnapshot } from "./event-reducer"
import { INITIAL_STATE } from "./types"
import { nativeQuestion, nativeSnapshot } from "./session-message-loader-test-fixtures"

const initial = () => {
 const first = { ...nativeSnapshot("session-a", []), questions: [nativeQuestion("session-a")] }
 const second = { ...nativeSnapshot("session-b", []), questions: [nativeQuestion("session-b")] }
 return installSessionSnapshot(installSessionSnapshot({ ...INITIAL_STATE }, first), second)
}
const event = (sessionId: string, fields: Record<string, unknown>): CanonicalEvent => ({
 sessionId, epoch: "epoch-a", sequence: "5", timestamp: 5, type: "question.resolved", ...fields,
} as CanonicalEvent)

describe("Canonical session-scoped form state", () => {
 test("identical request IDs in different sessions occupy independent buckets", () => {
  const state = initial()
  expect(state.form["session-a"]?.[0].sessionId).toBe("session-a")
  expect(state.form["session-b"]?.[0].sessionId).toBe("session-b")
 })

 test("an authoritative empty snapshot clears only its own session", () => {
  const state = initial()
  const sibling = state.form["session-b"]
  const next = installSessionSnapshot(state, nativeSnapshot("session-a", []))
  expect(next.form["session-a"] ?? []).toEqual([])
  expect(next.form["session-b"]).toBe(sibling)
 })

 test("resolving a question keeps the sibling session's same-ID question", () => {
  const state = initial()
  const sibling = state.form["session-b"]
  const result = applyDirectoryEvent(state, event("session-a", { question: { ...nativeQuestion("session-a"), version: "2", status: "cancelled", resolvedAt: 5 } }))
  expect(result.kind).toBe("applied")
  expect(result.state.form["session-a"] ?? []).toEqual([])
  expect(result.state.form["session-b"]).toBe(sibling)
 })

 test("a cross-session question event requests recovery without altering either bucket", () => {
  const state = initial()
  const result = applyDirectoryEvent(state, event("session-a", { question: { ...nativeQuestion("session-b"), version: "2", status: "cancelled", resolvedAt: 5 } }))
  expect(result.kind).toBe("resnapshot")
  expect(result.state.form).toBe(state.form)
 })
})
