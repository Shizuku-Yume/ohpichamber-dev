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
  })

  test("detects status map changes without relying on object identity", () => {
    expect(areStatusMapsEquivalent({ "session-1": "running" }, { "session-1": "running" })).toBe(true)
    expect(areStatusMapsEquivalent({ "session-1": "running" }, { "session-1": "idle" })).toBe(false)
    expect(areStatusMapsEquivalent({ "session-1": "running" }, {})).toBe(false)
  })
})
