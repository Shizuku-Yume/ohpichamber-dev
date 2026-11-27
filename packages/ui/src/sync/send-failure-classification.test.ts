import { describe, expect, test } from "bun:test"
import { CanonicalApiError } from "@/api/canonicalClient"
import { getErrorStatus, isAmbiguousSendFailure } from "./send-failure-classification"

function problemError(code: "COMMAND_IN_FLIGHT" | "RUN_ACTIVE" | "INVALID_REQUEST" | "SESSION_READ_ONLY" | "SERVICE_UNAVAILABLE", status: number, detail = "problem detail", retryable = false) {
  return new CanonicalApiError({
    type: `urn:ohpichamber:problem:${code}`,
    title: code,
    status,
    detail,
    code,
    retryable,
  })
}

describe("send failure classification", () => {
  test("a verified 409 COMMAND_IN_FLIGHT problem is ambiguous: acceptance is uncertain", () => {
    const error = problemError("COMMAND_IN_FLIGHT", 409, "Command acceptance is uncertain; it will not be dispatched again")
    expect(isAmbiguousSendFailure(error)).toBe(true)
    expect(getErrorStatus(error)).toBe(409)
  })

  test.each(["RUN_ACTIVE", "INVALID_REQUEST", "SESSION_READ_ONLY"] as const)("a verified deterministic refusal (%s) stays definite", code => {
    expect(isAmbiguousSendFailure(problemError(code, 409))).toBe(false)
  })

  test("a verified 503 problem whose code is a deterministic refusal stays definite", () => {
    expect(isAmbiguousSendFailure(problemError("RUN_ACTIVE", 503))).toBe(false)
  })

  test("a verified 503 SERVICE_UNAVAILABLE problem remains ambiguous through its status", () => {
    expect(isAmbiguousSendFailure(problemError("SERVICE_UNAVAILABLE", 503, "problem detail", true))).toBe(true)
  })

  test("getErrorStatus reads the problem document status for canonical errors", () => {
    expect(getErrorStatus(problemError("INVALID_REQUEST", 400))).toBe(400)
  })

  test("status-bearing non-canonical failures still classify by their direct or response status", () => {
    const direct = Object.assign(new Error("unavailable"), { status: 503 })
    const wrapped = Object.assign(new Error("unavailable"), { response: { status: 408 } })
    expect(isAmbiguousSendFailure(direct)).toBe(true)
    expect(getErrorStatus(direct)).toBe(503)
    expect(isAmbiguousSendFailure(wrapped)).toBe(true)
    expect(getErrorStatus(wrapped)).toBe(408)
  })

  test("transport-level losses stay ambiguous", () => {
    expect(isAmbiguousSendFailure(new TypeError("Failed to fetch"))).toBe(true)
    expect(isAmbiguousSendFailure(new Error("socket hang up"))).toBe(true)
    expect(isAmbiguousSendFailure(new Error("request timeout"))).toBe(true)
    expect(getErrorStatus(new TypeError("Failed to fetch"))).toBeNull()
  })

  test("an ordinary error with no ambiguity markers is definite", () => {
    expect(isAmbiguousSendFailure(new Error("The prompt is invalid"))).toBe(false)
  })
})
