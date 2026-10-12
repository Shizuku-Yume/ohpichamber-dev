import { describe, expect, test } from "bun:test"
import type { Session } from "@/lib/opencode/model"
import { upsertSessionRecord } from "./session-records"

const session = (id: string, overrides: Partial<Session> = {}): Session => ({
  id, projectID: "project", directory: "/workspace", title: id, cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 }, ...overrides,
})

describe("upsertSessionRecord", () => {
  test("inserts missing IDs in binary order", () => {
    expect(upsertSessionRecord([session("a"), session("c")], session("b")).map((item) => item.id)).toEqual(["a", "b", "c"])
  })

  test("preserves references for separately allocated equivalent metadata", () => {
    const current = [session("a", {
      metadata: { nested: ["value", { count: 1 }] },
    }), session("b")]
    const incoming = session("a", {
      metadata: { nested: ["value", { count: 1 }] },
    })
    const result = upsertSessionRecord(current, incoming)
    expect(result).toBe(current)
    expect(result[0]).toBe(current[0])
    expect(result[1]).toBe(current[1])
  })

  test("replaces a same-ID record when an unlisted semantic field changes", () => {
    const current = [session("a")]
    // SAFETY: a server payload may carry an additive field before the local
    // Session type knows it; the record is still a Session for this boundary.
    const incoming = { ...session("a"), customField: "changed" } as Session

    expect(upsertSessionRecord(current, incoming)).not.toBe(current)
  })

  test("preserves cached Host metadata and archive state when directory hydration marks failures", () => {
    const cached = session("a", {
      title: "Host title", directory: "/host", projectID: "host-project",
      metadata: { openchamber: { assist: { recap: "known" } } }, time: { created: 1, updated: 1, archived: 10 },
    })
    const result = upsertSessionRecord([cached], session("a", {
      hostMetadataError: "METADATA_CORRUPT", hostArchiveError: "METADATA_READ_FAILED",
      metadata: undefined, cost: 2, time: { created: 1, updated: 2 },
    }))
    expect(result[0]).toMatchObject({ title: "Host title", directory: "/host", projectID: "host-project", cost: 2, time: { updated: 2, archived: 10 } })
    expect(result[0].metadata).toBe(cached.metadata)
  })

  test("confirmed empty Host metadata and restored archive state replace cached values", () => {
    const cached = session("a", { metadata: { title: "Old" }, time: { created: 1, updated: 1, archived: 10 } })
    const result = upsertSessionRecord([cached], session("a", { metadata: {}, time: { created: 1, updated: 2 } }))
    expect(result[0].metadata).toEqual({})
    expect(result[0].time.archived).toBeUndefined()
  })

  const changes: Array<[string, Partial<Session>, Partial<Session>]> = [
    ["scalars", { title: "one", subpath: "a", parentID: "p", cost: 1, agent: "a" }, { title: "two", subpath: "b", parentID: "q", cost: 2, agent: "b" }],
    ["tokens", { tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } } }, { tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 6 } } }],
    ["model", { model: { id: "m", providerID: "p", variant: "a" } }, { model: { id: "m", providerID: "p", variant: "b" } }],
    ["metadata", { metadata: { key: "a" } }, { metadata: { key: "b" } }],
    ["permissions", { permissions: [{ action: "bash", resource: "*", effect: "ask" }] }, { permissions: [{ action: "bash", resource: "*", effect: "allow" }] }],
    ["revert", { revert: { messageID: "m", partID: "a", snapshot: "s" } }, { revert: { messageID: "m", partID: "b", snapshot: "s" } }],
    ["time", { time: { created: 1, updated: 1, idle: 2, archived: 3 } }, { time: { created: 1, updated: 2, idle: 2, archived: 3 } }],
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
