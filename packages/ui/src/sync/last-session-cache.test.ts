import { beforeEach, describe, expect, test } from "bun:test"
import { clearLastActiveSession, persistLastActiveSession, readLastActiveSession } from "./last-session-cache"

class TestStorage implements Storage {
  readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

let storage: TestStorage

beforeEach(() => {
  storage = new TestStorage()
})

describe("last active session persistence", () => {
  test("keeps independent entries per runtime", () => {
    persistLastActiveSession("runtime-a", { sessionId: "ses-a", directory: "/repo/a" }, storage)
    persistLastActiveSession("runtime-b", { sessionId: "ses-b", directory: null }, storage)

    expect(readLastActiveSession("runtime-a", storage)).toEqual({ sessionId: "ses-a", directory: "/repo/a" })
    expect(readLastActiveSession("runtime-b", storage)).toEqual({ sessionId: "ses-b", directory: null })
  })

  test("overwrites the entry for the same runtime", () => {
    persistLastActiveSession("runtime-a", { sessionId: "ses-1", directory: "/repo" }, storage)
    persistLastActiveSession("runtime-a", { sessionId: "ses-2", directory: null }, storage)

    expect(readLastActiveSession("runtime-a", storage)).toEqual({ sessionId: "ses-2", directory: null })
  })

  test("clear removes only the targeted runtime", () => {
    persistLastActiveSession("runtime-a", { sessionId: "ses-a", directory: null }, storage)
    persistLastActiveSession("runtime-b", { sessionId: "ses-b", directory: null }, storage)

    clearLastActiveSession("runtime-a", storage)

    expect(readLastActiveSession("runtime-a", storage)).toBeNull()
    expect(readLastActiveSession("runtime-b", storage)).toEqual({ sessionId: "ses-b", directory: null })
  })

  test("malformed persisted payload is unavailable startup context, not a crash", () => {
    storage.setItem("oc.lastSession.v1", "{not json")
    expect(readLastActiveSession("runtime-a", storage)).toBeNull()

    storage.setItem("oc.lastSession.v1", JSON.stringify({ version: 99, runtimes: { "runtime-a": { sessionId: "x" } } }))
    expect(readLastActiveSession("runtime-a", storage)).toBeNull()
  })

  test("bounds retained runtime namespaces", () => {
    for (let index = 0; index < 10; index += 1) {
      persistLastActiveSession(`runtime-${index}`, { sessionId: `ses-${index}`, directory: null }, storage)
    }
    const retained = Array.from({ length: 10 }, (_, index) => readLastActiveSession(`runtime-${index}`, storage))
      .filter(Boolean)
    expect(retained.length).toBe(8)
    // Newest entries survive.
    expect(readLastActiveSession("runtime-9", storage)).not.toBeNull()
    expect(readLastActiveSession("runtime-0", storage)).toBeNull()
  })

  test("ignores malformed entries without losing a valid runtime pointer", () => {
    storage.setItem("oc.lastSession.v1", JSON.stringify({ version: 1, runtimes: {
      "runtime-a": { sessionId: "", directory: "/repo", updatedAt: 1 },
      "runtime-b": { sessionId: "ses-b", directory: 123, updatedAt: 2 },
      "runtime-c": { sessionId: "ses-c", directory: "/repo/c", updatedAt: 3 },
    } }))
    expect(readLastActiveSession("runtime-a", storage)).toBeNull()
    expect(readLastActiveSession("runtime-b", storage)).toEqual({ sessionId: "ses-b", directory: null })
    expect(readLastActiveSession("runtime-c", storage)).toEqual({ sessionId: "ses-c", directory: "/repo/c" })
  })

  test("failed writes preserve the previous pointer and do not break session switching", () => {
    persistLastActiveSession("runtime-a", { sessionId: "ses-a", directory: "/repo/a" }, storage)
    class WriteDeniedStorage extends TestStorage {
      setItem(): void { throw new Error("storage denied") }
    }
    const denied = new WriteDeniedStorage()
    for (const [key, value] of storage.values) denied.values.set(key, value)
    expect(() => persistLastActiveSession("runtime-a", { sessionId: "ses-new", directory: "/repo/new" }, denied)).not.toThrow()
    expect(readLastActiveSession("runtime-a", denied)).toEqual({ sessionId: "ses-a", directory: "/repo/a" })
  })
})
