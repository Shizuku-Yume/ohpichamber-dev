import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  clearDirectorySessionPrefetch,
  clearSessionPrefetch,
  clearRuntimeSessionPrefetch,
  getSessionPrefetch,
  setSessionPrefetch,
} from "./session-prefetch-cache"

const runtimes = ["prefetch-runtime-a", "prefetch-runtime-b"]

beforeEach(() => {
  for (const runtimeKey of runtimes) clearRuntimeSessionPrefetch(runtimeKey)
})
afterEach(() => {
  for (const runtimeKey of runtimes) clearRuntimeSessionPrefetch(runtimeKey)
})

describe("session prefetch cache", () => {
  test("isolates colliding directory and session IDs by runtime", () => {
    setSessionPrefetch({ directory: "/repo", sessionId: "session", limit: 10, complete: false, runtimeKey: runtimes[0] })
    setSessionPrefetch({ directory: "/repo", sessionId: "session", limit: 20, complete: true, runtimeKey: runtimes[1] })

    expect(getSessionPrefetch("/repo", "session", runtimes[0])?.limit).toBe(10)
    expect(getSessionPrefetch("/repo", "session", runtimes[1])?.limit).toBe(20)
  })

  test("clears only the owning runtime and directory", () => {
    setSessionPrefetch({ directory: "/repo-a", sessionId: "session", limit: 10, complete: false, runtimeKey: runtimes[0] })
    setSessionPrefetch({ directory: "/repo-b", sessionId: "session", limit: 20, complete: false, runtimeKey: runtimes[0] })
    setSessionPrefetch({ directory: "/repo-a", sessionId: "session", limit: 30, complete: false, runtimeKey: runtimes[1] })

    clearDirectorySessionPrefetch("/repo-a", runtimes[0])

    expect(getSessionPrefetch("/repo-a", "session", runtimes[0])).toBe(undefined)
    expect(getSessionPrefetch("/repo-b", "session", runtimes[0])?.limit).toBe(20)
    expect(getSessionPrefetch("/repo-a", "session", runtimes[1])?.limit).toBe(30)
  })

  test("bounds retained metadata globally", () => {
    for (let index = 0; index <= 200; index += 1) {
      setSessionPrefetch({
        directory: "/repo",
        sessionId: `session-${index}`,
        limit: index,
        complete: false,
        runtimeKey: runtimes[0],
      })
    }

    expect(getSessionPrefetch("/repo", "session-0", runtimes[0])).toBe(undefined)
    expect(getSessionPrefetch("/repo", "session-200", runtimes[0])?.limit).toBe(200)
  })

  test("replaces pagination metadata and invalidates only addressed sessions", () => {
    const target = { directory: "/repo", sessionId: "session-a", runtimeKey: runtimes[0] }
    setSessionPrefetch({ ...target, limit: 10, cursor: "older-cursor", complete: false, at: 1 })
    setSessionPrefetch({ ...target, limit: 20, complete: true, at: 2 })
    setSessionPrefetch({ ...target, sessionId: "session-b", limit: 30, complete: false })
    setSessionPrefetch({ ...target, runtimeKey: runtimes[1], limit: 40, complete: false })
    expect(getSessionPrefetch("/repo", "session-a", runtimes[0])).toEqual({ limit: 20, cursor: undefined, complete: true, at: 2 })

    clearSessionPrefetch("/repo", ["session-a", ""], runtimes[0])
    expect(getSessionPrefetch("/repo", "session-a", runtimes[0])).toBeUndefined()
    expect(getSessionPrefetch("/repo", "session-b", runtimes[0])?.limit).toBe(30)
    expect(getSessionPrefetch("/repo", "session-a", runtimes[1])?.limit).toBe(40)
  })

  test("reads refresh recency before bounded eviction", () => {
    for (let index = 0; index < 200; index += 1) {
      setSessionPrefetch({ directory: "/repo", sessionId: `session-${index}`, limit: index, complete: false, runtimeKey: runtimes[0] })
    }
    getSessionPrefetch("/repo", "session-0", runtimes[0])
    setSessionPrefetch({ directory: "/repo", sessionId: "session-new", limit: 200, complete: false, runtimeKey: runtimes[0] })
    expect(getSessionPrefetch("/repo", "session-1", runtimes[0])).toBeUndefined()
    expect(getSessionPrefetch("/repo", "session-0", runtimes[0])?.limit).toBe(0)
  })
})
