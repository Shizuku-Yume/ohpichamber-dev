import { describe, expect, test } from "bun:test"
import type { Session } from "@openchamber/agent-contract"
import { upsertSessionRecord } from "./session-records"

const session = (sessionId: string, overrides: Partial<Session> = {}): Session => ({
  sessionId,
  rootSessionId: sessionId,
  projectId: "pro_workspace",
  workspaceId: "wsp_workspace",
  displayPath: "workspace/session",
  createdAt: 1,
  updatedAt: 1,
  epoch: "epoch_workspace",
  headSequence: "0",
  runtimeStatus: "idle",
  activeRunId: null,
  metadata: null,
  metadataRevision: "0",
  archiveRevision: "0",
  ...overrides,
})

describe("upsertSessionRecord", () => {
  test("inserts missing IDs in binary order", () => {
    expect(upsertSessionRecord([session("a"), session("c")], session("b")).map((item) => item.sessionId)).toEqual(["a", "b", "c"])
  })

  test("preserves references for equivalent metadata", () => {
    const current = [session("a", { metadata: { title: "Known" }, metadataRevision: "2" }), session("b")]
    const incoming = session("a", { metadata: { title: "Known" }, metadataRevision: "2" })
    const result = upsertSessionRecord(current, incoming)
    expect(result).toBe(current)
    expect(result[0]).toBe(current[0])
    expect(result[1]).toBe(current[1])
  })

  test("keeps newer Host metadata and archive revisions independently of runtime changes", () => {
    const cached = session("a", {
      metadata: { title: "Host title" }, metadataRevision: "9007199254740993",
      archivedAt: 10, archiveRevision: "3",
    })
    const result = upsertSessionRecord([cached], session("a", {
      metadata: { title: "Old" }, metadataRevision: "9007199254740992",
      archiveRevision: "2", updatedAt: 2, headSequence: "7",
    }))
    expect(result[0]).toMatchObject({ updatedAt: 2, headSequence: "7", archivedAt: 10, archiveRevision: "3" })
    expect(result[0].metadata).toBe(cached.metadata)
    expect(result[0].metadataRevision).toBe("9007199254740993")
  })

  test("confirmed empty metadata and restored archive replace cached values at newer revisions", () => {
    const cached = session("a", { metadata: { title: "Old" }, metadataRevision: "2", archivedAt: 10, archiveRevision: "2" })
    const result = upsertSessionRecord([cached], session("a", { metadata: {}, metadataRevision: "3", archiveRevision: "3", updatedAt: 2 }))
    expect(result[0].metadata).toEqual({})
    expect(result[0].archivedAt).toBeUndefined()
  })

  const changes: Array<[string, Partial<Session>, Partial<Session>]> = [
    ["workspace", { workspaceId: "wsp_a", projectId: "pro_a" }, { workspaceId: "wsp_b", projectId: "pro_b" }],
    ["parent", { parentSessionId: "p" }, { parentSessionId: "q" }],
    ["root ownership", { rootSessionId: "root-a" }, { rootSessionId: "root-b" }],
    ["metadata", { metadata: { title: "One" }, metadataRevision: "1" }, { metadata: { title: "Two" }, metadataRevision: "2" }],
    ["runtime status", { runtimeStatus: "idle", activeRunId: null }, { runtimeStatus: "running", activeRunId: "run_b" }],
    ["sequence", { headSequence: "1" }, { headSequence: "2" }],
    ["execution epoch", { epoch: "epoch-a", headSequence: "10" }, { epoch: "epoch-b", headSequence: "0" }],
    ["timestamps", { updatedAt: 1 }, { updatedAt: 2 }],
  ]

  for (const [field, current, incoming] of changes) {
    test(`replaces only target when ${field} changes`, () => {
      const first = session("a")
      const target = session("b", current)
      const last = session("c")
      const list = [first, target, last]
      const result = upsertSessionRecord(list, session("b", incoming))
      expect(result).not.toBe(list)
      expect(result[0]).toBe(first)
      expect(result[1]).not.toBe(target)
      expect(result[2]).toBe(last)
    })
  }
})
