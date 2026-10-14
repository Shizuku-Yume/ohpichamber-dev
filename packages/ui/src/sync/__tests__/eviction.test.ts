import { describe, expect, test } from "bun:test"
import { canDisposeDirectory, hasPendingBlockingRequests, pickDirectoriesToEvict } from "../eviction"
import { INITIAL_STATE } from "../types"
import { nativeApproval, nativeQuestion } from "../session-message-loader-test-fixtures"

describe("hasPendingBlockingRequests", () => {
  test("protects pending approvals and questions", () => {
    expect(hasPendingBlockingRequests({ ...INITIAL_STATE, permission: { s1: [nativeApproval("s1")] } })).toBe(true)
    expect(hasPendingBlockingRequests({ ...INITIAL_STATE, form: { s1: [nativeQuestion("s1")] } })).toBe(true)
    expect(hasPendingBlockingRequests({ ...INITIAL_STATE, permission: {}, form: {} })).toBe(false)
  })
})

describe("pickDirectoriesToEvict", () => {
  test("skips pinned and pending directories", () => {
    const state = new Map([
      ["old", { lastAccessAt: 0 }],
      ["pending", { lastAccessAt: 0 }],
      ["pinned", { lastAccessAt: 0 }],
    ])
    expect(pickDirectoriesToEvict({
      stores: ["old", "pending", "pinned"], state, pins: new Set(["pinned"]), max: 2, ttl: 1, now: 10,
      hasPendingBlockingRequests: (directory) => directory === "pending",
    })).toEqual(["old"])
  })

  test("uses idle TTL independently of capacity and honors overflow grace", () => {
    const state = new Map([["idle", { lastAccessAt: 0 }], ["warm", { lastAccessAt: 95 }], ["recent", { lastAccessAt: 99 }]])
    const base = { stores: ["idle", "warm", "recent"], state, pins: new Set<string>(), max: 3, ttl: 50, graceMs: 10, now: 100 }
    expect(pickDirectoriesToEvict(base)).toEqual(["idle"])
    expect(pickDirectoriesToEvict({ ...base, max: 1 })).toEqual(["idle"])
    expect(pickDirectoriesToEvict({ ...base, max: 1, now: 110 })).toEqual(["idle", "warm"])
  })

  test("protected overflow is a soft capacity target", () => {
    expect(pickDirectoriesToEvict({ stores: ["pinned", "blocking"], state: new Map(), pins: new Set(["pinned"]), max: 0, ttl: 0, now: 100, hasPendingBlockingRequests: directory => directory === "blocking" })).toEqual([])
  })
})

describe("canDisposeDirectory", () => {
  test("requires every lifecycle guard to be clear", () => {
    const base = { directory: "/repo", hasStore: true, pinned: false, booting: false, loadingSessions: false, hasPendingBlockingRequests: false }
    expect(canDisposeDirectory(base)).toBe(true)
    expect(canDisposeDirectory({ ...base, pinned: true })).toBe(false)
    expect(canDisposeDirectory({ ...base, booting: true })).toBe(false)
    expect(canDisposeDirectory({ ...base, loadingSessions: true })).toBe(false)
    expect(canDisposeDirectory({ ...base, hasPendingBlockingRequests: true })).toBe(false)
    expect(canDisposeDirectory({ ...base, hasStore: false })).toBe(false)
    expect(canDisposeDirectory({ ...base, directory: "" })).toBe(false)
  })
})
