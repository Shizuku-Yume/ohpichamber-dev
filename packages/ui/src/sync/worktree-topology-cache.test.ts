import { beforeEach, describe, expect, test } from "bun:test"
import type { WorktreeMetadata } from "@/types/worktree"
import { persistWorktreeTopology, readPersistedWorktreeTopology } from "./worktree-topology-cache"

class TestStorage implements Storage {
  readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const worktree = (path: string): WorktreeMetadata => ({
  path,
  projectDirectory: "/repo",
  branch: path.split("/").pop() ?? "main",
  label: path.split("/").pop() ?? "main",
  worktreeRoot: path,
  headState: "branch",
  worktreeStatus: "ready",
})
let storage: TestStorage

beforeEach(() => {
  storage = new TestStorage()
})

describe("worktree topology persistence", () => {
  test("restores independent runtime topologies across A -> B -> A", () => {
    persistWorktreeTopology("runtime-a", new Map([["/repo", [worktree("/repo/a")]]]), storage)
    persistWorktreeTopology("runtime-b", new Map([["/repo", [worktree("/repo/b")]]]), storage)

    expect(readPersistedWorktreeTopology("runtime-a", storage).get("/repo")?.[0]?.path).toBe("/repo/a")
    expect(readPersistedWorktreeTopology("runtime-b", storage).get("/repo")?.[0]?.path).toBe("/repo/b")
  })

  test("claims the legacy topology for only the first runtime", () => {
    storage.setItem("oc.worktreeMap", JSON.stringify([["/repo", [worktree("/repo/legacy")]]]))

    expect(readPersistedWorktreeTopology("runtime-a", storage).get("/repo")?.[0]?.path).toBe("/repo/legacy")
    expect(readPersistedWorktreeTopology("runtime-b", storage).size).toBe(0)
    expect(storage.getItem("oc.worktreeMap")).toBeNull()
  })

  test("bounds retained runtime namespaces", () => {
    for (let index = 0; index < 10; index += 1) {
      persistWorktreeTopology(`runtime-${index}`, new Map([[`/repo-${index}`, [worktree(`/repo-${index}/wt`)]]]), storage)
    }

    const envelope = JSON.parse(storage.getItem("oc.worktreeMap.v2") ?? "{}") as { runtimes?: Record<string, unknown> }
    expect(Object.keys(envelope.runtimes ?? {})).toHaveLength(8)
  })

  test("successful empty topology replaces only the owning runtime", () => {
    persistWorktreeTopology("runtime-a", new Map([["/repo", [worktree("/repo/a")]]]), storage)
    persistWorktreeTopology("runtime-b", new Map([["/repo", [worktree("/repo/b")]]]), storage)
    persistWorktreeTopology("runtime-a", new Map(), storage)
    expect(readPersistedWorktreeTopology("runtime-a", storage).size).toBe(0)
    expect(readPersistedWorktreeTopology("runtime-b", storage).get("/repo")?.[0]?.path).toBe("/repo/b")
  })

  test("a failed persistence write leaves the previous persisted topology intact", () => {
    persistWorktreeTopology("runtime-a", new Map([["/repo", [worktree("/repo/a")]]]), storage)
    class WriteDeniedStorage extends TestStorage {
      setItem(): void { throw new Error("storage denied") }
    }
    const denied = new WriteDeniedStorage()
    for (const [key, value] of storage.values) denied.values.set(key, value)
    expect(() => persistWorktreeTopology("runtime-a", new Map(), denied)).not.toThrow()
    expect(readPersistedWorktreeTopology("runtime-a", denied).get("/repo")?.[0]?.path).toBe("/repo/a")
  })
})
