import { describe, expect, test } from "bun:test"
import {
  aggregateLiveSessions,
  aggregateLiveSessionStatuses,
  areSessionListsEquivalent,
  areStatusMapsEquivalent,
  findLiveSession,
  findLiveSessionStatus,
} from "../live-aggregate.ts"

const session = (sessionId, workspaceId, updatedAt, overrides = {}) => ({
  sessionId,
  projectId: "project-1",
  workspaceId,
  displayPath: workspaceId,
  rootSessionId: overrides.parentSessionId ?? sessionId,
  createdAt: updatedAt - 1,
  updatedAt,
  epoch: "epoch-1",
  headSequence: String(updatedAt),
  runtimeStatus: "idle",
  activeRunId: null,
  metadata: null,
  metadataRevision: "0",
  archiveRevision: "0",
  ...overrides,
})
const state = (sessions, statuses = {}) => ({ session: sessions, session_status: statuses })

describe("native live aggregate", () => {
  test("detects canonical identity, parent, runtime, and metadata changes", () => {
    const original = session("session-1", "workspace-a", 10, { metadata: { title: "A" } })
    expect(areSessionListsEquivalent([original], [{ ...original, metadata: { title: "A" } }])).toBe(true)
    expect(areSessionListsEquivalent([original], [{ ...original, metadata: { title: "B" } }])).toBe(false)
    expect(areSessionListsEquivalent([original], [{ ...original, title: "Renamed" }])).toBe(false)
    expect(areSessionListsEquivalent([original], [{ ...original, parentSessionId: "parent-1" }])).toBe(false)
    expect(areSessionListsEquivalent([original], [{ ...original, runtimeStatus: "running", activeRunId: "run-1" }])).toBe(false)
    expect(areSessionListsEquivalent([original], [{ ...original, workspaceId: "workspace-b" }])).toBe(false)
  })

  test("selects the freshest session across directory stores and keeps child identity", () => {
    const older = session("session-1", "workspace-a", 10)
    const newer = session("session-1", "workspace-a", 25, { metadata: { title: "new" } })
    const child = session("session-2", "workspace-a", 20, { parentSessionId: "session-1", rootSessionId: "session-1" })
    const result = aggregateLiveSessions([state([older]), state([newer, child])])
    expect(result.map((item) => item.sessionId)).toEqual(["session-1", "session-2"])
    expect(result[0]).toBe(newer)
    expect(findLiveSession([state([older]), state([newer])], "session-1")).toBe(newer)
  })

<<<<<<< HEAD
  test("prefers active statuses over stale idle snapshots and lets fresher idle win", () => {
    const old = session("session-1", "workspace-a", 10)
    const fresh = session("session-1", "workspace-a", 30)
    const statuses = aggregateLiveSessionStatuses([
      state([old], { "session-1": "idle", "session-2": "idle" }),
      state([old], { "session-1": "running", "session-2": "awaiting_input" }),
    ])
    expect(statuses["session-1"]).toBe("running")
    expect(statuses["session-2"]).toBe("awaiting_input")
    expect(findLiveSessionStatus([state([old], { "session-1": "running" }), state([fresh], { "session-1": "idle" })], "session-1")).toBe("idle")
||||||| bc50ba56aa
  it('compares rebuilt session lists field by field', () => {
    const list = [session('ses-1', '/a', 10), session('ses-2', '/b', 20, { parentID: 'ses-1' })]

    expect(areSessionListsEquivalent(list, [...list])).toBe(true)
    expect(areSessionListsEquivalent(list, list.map((item) => ({ ...item, time: { ...item.time } })))).toBe(true)
    expect(areSessionListsEquivalent(list, [list[0], { ...list[1], time: { ...list[1].time, updated: 21 } }])).toBe(false)
    expect(areSessionListsEquivalent(list, [list[0], { ...list[1], title: 'renamed' }])).toBe(false)
    expect(areSessionListsEquivalent(list, [list[0], { ...list[1], parentID: undefined }])).toBe(false)
    expect(areSessionListsEquivalent(list, [list[0], { ...list[1], directory: '/c' }])).toBe(false)
    expect(areSessionListsEquivalent(list, [list[0], { ...list[1], time: { ...list[1].time, archived: 30 } }])).toBe(false)
=======
  it('detects a spend change, which leaves the timestamp alone', () => {
    const tokens = { input: 100, output: 50, reasoning: 0, cache: { read: 10, write: 0 } }
    const original = session('ses-1', '/a', 10, { cost: 0.5, tokens })
    const withoutSpend = session('ses-1', '/a', 10)

    expect(areSessionListsEquivalent([original], [{ ...original, tokens: { ...tokens, cache: { ...tokens.cache } } }])).toBe(true)
    expect(areSessionListsEquivalent([withoutSpend], [original])).toBe(false)
    expect(areSessionListsEquivalent([original], [{ ...original, cost: 0.75 }])).toBe(false)
    expect(areSessionListsEquivalent([original], [{ ...original, tokens: { ...tokens, output: 80 } }])).toBe(false)
    expect(areSessionListsEquivalent([original], [{ ...original, tokens: { ...tokens, cache: { read: 20, write: 0 } } }])).toBe(false)
  })

  it('compares rebuilt session lists field by field', () => {
    const list = [session('ses-1', '/a', 10), session('ses-2', '/b', 20, { parentID: 'ses-1' })]

    expect(areSessionListsEquivalent(list, [...list])).toBe(true)
    expect(areSessionListsEquivalent(list, list.map((item) => ({ ...item, time: { ...item.time } })))).toBe(true)
    expect(areSessionListsEquivalent(list, [list[0], { ...list[1], time: { ...list[1].time, updated: 21 } }])).toBe(false)
    expect(areSessionListsEquivalent(list, [list[0], { ...list[1], title: 'renamed' }])).toBe(false)
    expect(areSessionListsEquivalent(list, [list[0], { ...list[1], parentID: undefined }])).toBe(false)
    expect(areSessionListsEquivalent(list, [list[0], { ...list[1], directory: '/c' }])).toBe(false)
    expect(areSessionListsEquivalent(list, [list[0], { ...list[1], time: { ...list[1].time, archived: 30 } }])).toBe(false)
>>>>>>> upstream/main
  })

  test("detects status map changes without relying on object identity", () => {
    expect(areStatusMapsEquivalent({ "session-1": "running" }, { "session-1": "running" })).toBe(true)
    expect(areStatusMapsEquivalent({ "session-1": "running" }, { "session-1": "idle" })).toBe(false)
    expect(areStatusMapsEquivalent({ "session-1": "running" }, {})).toBe(false)
  })
})
