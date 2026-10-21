import { describe, expect, test } from "bun:test"
import {
  ChildStoreManager,
  markDirectorySessionPartChanged,
  subscribeDirectoryForm,
  subscribeDirectoryForms,
  subscribeDirectoryPermission,
  subscribeDirectoryPermissions,
  subscribeDirectorySessionMessages,
} from "./child-store"
import { DIR_IDLE_TTL_MS, EVICTION_GRACE_MS, MAX_DIR_STORES, type State } from "./types"
import { FilesystemError } from "@/lib/api/files-errors"
import { CanonicalApiError } from "@/api/canonicalClient"
import type { ApprovalRequest, QuestionRequest } from "@openchamber/agent-contract"
import { nativeSnapshot } from "./session-message-loader-test-fixtures"

type Deferred = { promise: Promise<void>; resolve: () => void }
const settle = async () => { await Promise.resolve(); await Promise.resolve() }
const deferred = (): Deferred => {
  let resolve!: () => void
  const promise = new Promise<void>((next) => { resolve = next })
  return { promise, resolve }
}
const approval = (approvalId: string, sessionId: string): ApprovalRequest => ({
  version: "1", epoch: "epoch-1", workerGeneration: "worker-1", approvalId, sessionId,
  turnId: "turn-1", toolCallId: `tool-${approvalId}`, toolName: "bash", actionType: "bash_command",
  commandSummary: "ls", details: {}, status: "pending", requestedAt: 1,
})
const question = (questionId: string, sessionId: string): QuestionRequest => ({
  version: "1", epoch: "epoch-1", workerGeneration: "worker-1", questionId, sessionId, turnId: "turn-1",
  prompt: "Continue?", status: "pending", requestedAt: 1,
})
const message = (messageId: string, sessionId = "session-1") => ({
  messageId, sessionId, turnId: "turn-1", role: "assistant" as const, createdAt: 1, parts: [],
})

describe("ChildStoreManager subscriptions", () => {
  test("notifies only the changed permission and form buckets", () => {
    const manager = new ChildStoreManager()
    const child = manager.ensureChild("/workspace", { bootstrap: false })
    let permissionCalls = 0
    let formCalls = 0
    const unsubscribers = [
      subscribeDirectoryPermissions(child, ["session-1"], () => { permissionCalls += 1 }),
      subscribeDirectoryPermission(child, "session-2", () => { permissionCalls += 1 }),
      subscribeDirectoryForms(child, ["session-1"], () => { formCalls += 1 }),
      subscribeDirectoryForm(child, "session-2", () => { formCalls += 1 }),
    ]
    child.setState({ permission: { "session-1": [approval("approval-1", "session-1")] } })
    expect(permissionCalls).toBe(1)
    expect(formCalls).toBe(0)
    child.setState({ form: { "session-2": [question("question-2", "session-2")] } })
    expect(permissionCalls).toBe(1)
    expect(formCalls).toBe(1)
    child.setState({ permission: { "session-1": child.getState().permission["session-1"]!, "session-2": [approval("approval-2", "session-2")] } })
    expect(permissionCalls).toBe(2)
    for (const unsubscribe of unsubscribers) unsubscribe()
    manager.disposeAll()
  })

  test("routes inline part changes only to the owning session", () => {
    const manager = new ChildStoreManager()
    const child = manager.ensureChild("/workspace", { bootstrap: false })
    const changes: Array<{ messagesChanged: boolean; partMessageIds: readonly string[] }> = []
    child.setState({ message: { "session-1": [message("message-1")], "session-2": [message("message-2", "session-2")] } })
    const unsubscribe = subscribeDirectorySessionMessages(child, "session-1", (change) => changes.push(change))
    markDirectorySessionPartChanged(child, "session-1", "message-1")
    child.setState({ message: { ...child.getState().message, "session-1": [{ ...message("message-1"), parts: [{ type: "text", partId: "part-1", content: "hello" }] }] } })
    expect(changes.at(-1)).toMatchObject({ messagesChanged: false, partMessageIds: ["message-1"] })
    unsubscribe()
    manager.disposeAll()
  })

  test("keeps unrelated message changes out of a session subscriber", () => {
    const manager = new ChildStoreManager()
    const child = manager.ensureChild("/workspace", { bootstrap: false })
    let calls = 0
    const unsubscribe = subscribeDirectorySessionMessages(child, "session-1", () => { calls += 1 })
    child.setState({ message: { "session-2": [message("message-2", "session-2")] } })
    expect(calls).toBe(0)
    unsubscribe()
    manager.disposeAll()
  })
})

describe("ChildStoreManager directory lifecycle", () => {
  test("keeps an idle directory alive until its final consumer releases it", () => {
    const manager = new ChildStoreManager()
    const originalDateNow = Date.now
    let currentTime = 10_000
    Date.now = () => currentTime
    try {
      const child = manager.ensureChild("/workspace", { bootstrap: false })
      manager.pin("/workspace/")
      manager.pin("/workspace")
      manager.unpin("/workspace")
      currentTime += DIR_IDLE_TTL_MS + EVICTION_GRACE_MS + 1
      manager.runEviction()
      expect(manager.pinned("/workspace")).toBe(true)
      expect(manager.getChild("/workspace")).toBe(child)
      manager.unpin("/workspace/")
      expect(manager.pinned("/workspace")).toBe(false)
      expect(manager.getChild("/workspace")).toBeUndefined()
    } finally {
      Date.now = originalDateNow
      manager.disposeAll()
    }
  })

  test("keeps expanded directories alive while foreground demand exists", () => {
    const manager = new ChildStoreManager()
    const originalDateNow = Date.now
    let currentTime = 10_000
    Date.now = () => currentTime
    const directories = Array.from({ length: MAX_DIR_STORES + 5 }, (_, index) => `/workspace-${index}`)
    try {
      for (const directory of directories) manager.ensureChild(directory, { bootstrap: false }).setState({ status: "complete" })
      manager.setBootstrapDemand("expanded-sidebar", directories.map((directory) => ({ directory, priority: "expanded" as const, reason: "project-expanded" as const })))
      currentTime += EVICTION_GRACE_MS + 1
      manager.runEviction()
      expect(directories.every((directory) => manager.getChild(directory))).toBe(true)
    } finally {
      Date.now = originalDateNow
      manager.disposeAll()
    }
  })
})

describe("ChildStoreManager bootstrap scheduler", () => {
  test("bounds concurrency and eventually refreshes every queued directory", async () => {
    const manager = new ChildStoreManager()
    const running = new Map<string, Deferred>()
    const started: string[] = []
    let maxRunning = 0
    const cleanup = manager.configure({
      bootstrapConcurrency: 2,
      onBootstrap: ({ directory }) => {
        const task = deferred()
        running.set(directory, task)
        started.push(directory)
        maxRunning = Math.max(maxRunning, running.size)
        return task.promise.finally(() => running.delete(directory))
      },
    })
    manager.setBootstrapDemand("sidebar", Array.from({ length: 10 }, (_, index) => ({ directory: `/workspace-${index}`, priority: "expanded" as const, reason: "project-expanded" as const })))
    while (started.length < 10) {
      expect(running.size).toBeLessThanOrEqual(2)
      running.values().next().value?.resolve()
      await settle()
    }
    for (const task of running.values()) task.resolve()
    await settle()
    expect(new Set(started).size).toBe(10)
    expect(maxRunning).toBe(2)
    cleanup()
    manager.disposeAll()
  })

  test("continues after a synchronous failure and records a failed directory", async () => {
    const manager = new ChildStoreManager()
    const started: string[] = []
    const cleanup = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: ({ directory }) => { started.push(directory); if (directory === "/failed") throw new Error("failed") },
    })
    manager.setBootstrapDemand("sidebar", [
      { directory: "/failed", priority: "expanded", reason: "project-expanded" },
      { directory: "/healthy", priority: "expanded", reason: "project-expanded" },
    ])
    await settle(); await settle()
    expect(started).toEqual(["/failed", "/healthy"])
    expect(manager.getBootstrapState("/failed")).toBe("failed")
    expect(manager.getBootstrapState("/healthy")).toBe("complete")
    cleanup(); manager.disposeAll()
  })

  test("requeues a failed environment initialization when the bootstrap list phase completed", async () => {
    const manager = new ChildStoreManager()
    let runs = 0
    let failEnvironment = true
    const cleanup = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: ({ trackInitialization }) => {
        runs += 1
        trackInitialization(failEnvironment ? Promise.reject(new Error("environment unavailable")) : Promise.resolve())
      },
    })
    manager.requestBootstrap({ directory: "/workspace", priority: "selected", reason: "current-directory" })
    await settle(); await settle(); await settle()
    expect(runs).toBe(1)
    expect(manager.getBootstrapState("/workspace")).toBe("complete")
    expect(manager.getInitializationState("/workspace")).toBe("failed")

    failEnvironment = false
    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(true)
    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)
    await settle(); await settle(); await settle()
    expect(runs).toBe(2)
    expect(manager.getBootstrapState("/workspace")).toBe("complete")
    expect(manager.getInitializationState("/workspace")).toBe("complete")

    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)
    expect(runs).toBe(2)
    cleanup(); manager.disposeAll()
  })

  test("consumes a recovery signal received while environment initialization is running", async () => {
    const manager = new ChildStoreManager()
    let runs = 0
    let rejectInitialization!: (error: unknown) => void
    const cleanup = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: ({ trackInitialization }) => {
        runs += 1
        if (runs === 1) trackInitialization(new Promise<void>((_, reject) => { rejectInitialization = reject }))
        else trackInitialization(Promise.resolve())
      },
    })
    manager.requestBootstrap({ directory: "/workspace", priority: "selected", reason: "current-directory" })
    await settle(); await settle()
    expect(runs).toBe(1)
    expect(manager.getInitializationState("/workspace")).toBe("running")
    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)

    rejectInitialization(new Error("environment unavailable"))
    await settle(); await settle(); await settle()
    expect(runs).toBe(2)
    expect(manager.getInitializationState("/workspace")).toBe("complete")
    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)
    cleanup(); manager.disposeAll()
  })

  test("does not requeue a non-retryable initialization failure", async () => {
    const manager = new ChildStoreManager()
    let runs = 0
    const denial = new CanonicalApiError({ type: "urn:test:denied", title: "Denied", status: 403, detail: "Forbidden", code: "UNAUTHORIZED", retryable: false })
    const cleanup = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: ({ trackInitialization }) => {
        runs += 1
        trackInitialization(Promise.reject(denial))
      },
    })
    manager.requestBootstrap({ directory: "/workspace", priority: "selected", reason: "current-directory" })
    await settle(); await settle(); await settle()
    expect(runs).toBe(1)
    expect(manager.getBootstrapState("/workspace")).toBe("complete")
    expect(manager.getInitializationState("/workspace")).toBe("failed")

    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)
    await settle(); await settle()
    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)
    expect(runs).toBe(1)
    expect(manager.getInitializationState("/workspace")).toBe("failed")
    cleanup(); manager.disposeAll()
  })

  test("records permission failures and clears them on a forced retry", async () => {
    const manager = new ChildStoreManager()
    let denied = true
    const cleanup = manager.configure({ onBootstrap: () => { if (denied) throw new FilesystemError("Access denied", { reason: "os-permission", status: 403 }) } })
    manager.requestBootstrap({ directory: "/protected", priority: "selected", reason: "current-directory" })
    await settle(); await settle()
    expect(manager.getBootstrapFailure("/protected")).toBe("os-permission")
    denied = false
    manager.requestBootstrap({ directory: "/protected", priority: "selected", reason: "action-demand", force: true })
    await settle(); await settle()
    expect(manager.getBootstrapState("/protected")).toBe("complete")
    expect(manager.getBootstrapFailure("/protected")).toBeUndefined()
    cleanup(); manager.disposeAll()
  })

  test("does not publish a completion from a superseded runtime scope", async () => {
    const manager = new ChildStoreManager()
    let current = true
    let runs = 0
    const old = deferred()
    manager.configure({ isCurrentScope: () => current, onBootstrap: () => { runs += 1; return old.promise } })
    manager.requestBootstrap({ directory: "/workspace", priority: "selected", reason: "selected-session" })
    current = false
    old.resolve()
    await settle(); await settle()
    expect(runs).toBe(1)
    expect(manager.getBootstrapState("/workspace")).toBe("queued")
    current = true
    manager.configure({ isCurrentScope: () => current, onBootstrap: () => { runs += 1 } })
    await settle(); await settle()
    expect(runs).toBe(2)
    expect(manager.getBootstrapState("/workspace")).toBe("complete")
    manager.disposeAll()
  })
})

describe("ChildStoreManager stream restart recovery", () => {
  const bootstrapped = (manager: ChildStoreManager, directory: string, patch: Partial<State> = {}) => manager.ensureChild(directory, { bootstrap: false }).setState({ status: "complete", ...patch })

  test("refreshes current, pinned, waiting, and active directories while deferring idle stores", async () => {
    const manager = new ChildStoreManager()
    const started: string[] = []
    bootstrapped(manager, "/current")
    bootstrapped(manager, "/pinned")
    bootstrapped(manager, "/waiting", { permission: { waiting: [approval("approval", "waiting")] } })
    bootstrapped(manager, "/busy", { session_status: { busy: "running" } })
    bootstrapped(manager, "/idle")
    manager.setBootstrapDemand("column", [{ directory: "/pinned", priority: "selected", reason: "selected-session" }])
    const cleanup = manager.configure({ bootstrapConcurrency: 2, onBootstrap: async ({ directory }) => { started.push(directory) } })
    const refreshing = manager.refreshAfterStreamRestart("/current")
    for (let index = 0; index < 10; index += 1) await settle()
    expect([...refreshing].sort()).toEqual(["/busy", "/current", "/pinned", "/waiting"])
    expect(started).toEqual(expect.arrayContaining(["/current", "/pinned", "/waiting", "/busy"]))
    expect(started).not.toContain("/idle")
    cleanup(); manager.disposeAll()
  })

  test("refreshes an idle store when a listed session becomes active during the gap", async () => {
    const manager = new ChildStoreManager()
    const started: string[] = []
    bootstrapped(manager, "/current")
    bootstrapped(manager, "/asked", { session: [{ ...nativeSnapshot("session-asked", []).session, metadata: null, metadataRevision: "0", archiveRevision: "0" }], session_status: { "session-asked": "idle" } })
    const cleanup = manager.configure({ bootstrapConcurrency: 2, onBootstrap: async ({ directory }) => { started.push(directory) } })
    manager.refreshAfterStreamRestart("/current")
    await settle(); await settle()
    expect([...manager.refreshStaleDirectoriesWithActiveSessions(new Set(["session-asked", "elsewhere"]))]).toEqual(["/asked"])
    await settle(); await settle()
    expect(started).toEqual(["/current", "/asked"])
    cleanup(); manager.disposeAll()
  })
})
