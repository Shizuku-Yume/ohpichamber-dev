import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { Session } from "@openchamber/agent-contract"
import { switchRuntimeEndpoint } from "@/lib/runtime-switch"
import {
  flushPendingSessionWrites,
  persistGlobalSessionSnapshot,
  persistManagedChatSessions,
  persistSessions,
  readDirCache,
  readGlobalSessionSnapshot,
  readManagedChatSessions,
} from "./persist-cache"

class TestStorage implements Storage {
  readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

const originalLocalStorage = globalThis.localStorage
const directory = "/repo"
const session = (index: number, updatedAt = index): Session => ({
  sessionId: `session-${index}`,
  projectId: "project",
  workspaceId: "workspace",
  displayPath: `sessions/${index}`,
  rootSessionId: `session-${index}`,
  createdAt: Math.max(0, updatedAt - 1),
  updatedAt,
  epoch: "epoch",
  headSequence: "0",
  runtimeStatus: "idle",
  activeRunId: null,
  metadata: null,
  metadataRevision: "0",
  archiveRevision: "0",
})

let storage: TestStorage
beforeEach(() => {
  storage = new TestStorage()
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
  switchRuntimeEndpoint({ apiBaseUrl: "https://runtime-default.test", runtimeKey: "runtime-default" })
})
afterEach(() => { Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage }) })

describe("native persisted sessions", () => {
  test("validates native records and rejects malformed records", () => {
    persistSessions(directory, [session(1)])
    flushPendingSessionWrites()
    const key = storage.key(0)!
    storage.setItem(key, JSON.stringify([session(1), { sessionId: "legacy" }]))
    expect(readDirCache(directory).sessions).toBeUndefined()
  })

  test("preserves runtime-scoped managed chat snapshots", () => {
    persistManagedChatSessions([session(1)])
    flushPendingSessionWrites()
    expect(readManagedChatSessions().map((item) => item.sessionId)).toEqual(["session-1"])
    switchRuntimeEndpoint({ apiBaseUrl: "https://runtime-other.test", runtimeKey: "runtime-other" })
    expect(readManagedChatSessions()).toEqual([])
  })

  test("keeps active global snapshots and excludes archived sessions", () => {
    persistGlobalSessionSnapshot([session(1), { ...session(2), archivedAt: 10 }])
    flushPendingSessionWrites()
    expect(readGlobalSessionSnapshot().map((item) => item.sessionId)).toEqual(["session-1"])
  })

  test("writes an authoritative empty directory snapshot", () => {
    persistSessions(directory, [])
    expect(readDirCache(directory).sessions).toEqual([])
  })
  test("caps directory snapshots by native numeric recency", () => {
    persistSessions(directory, Array.from({ length: 80 }, (_, index) => session(index)));
    flushPendingSessionWrites();
    const cached = readDirCache(directory).sessions!;
    expect(cached).toHaveLength(50);
    expect(cached[0].sessionId).toBe("session-30");
    expect(cached.at(-1)?.sessionId).toBe("session-79");
  })
  test("an empty mutation supersedes an older pending directory write", () => {
    persistSessions(directory, [session(1)]);
    persistSessions(directory, []);
    flushPendingSessionWrites();
    expect(readDirCache(directory).sessions).toEqual([]);
  })
  test("pending snapshots never publish into the next runtime", () => {
    persistSessions(directory, [session(1)]);
    switchRuntimeEndpoint({ apiBaseUrl: "https://runtime-other.test", runtimeKey: "runtime-other" });
    flushPendingSessionWrites();
    expect(readDirCache(directory).sessions).toBeUndefined();
    expect(storage.length).toBe(0);
  })
})
