import { afterEach, describe, expect, test } from "bun:test"
import { createLocationRelease, directoryUse, isWorktreeDirectory, type DirectoryUse } from "../location-release"
import { applyGlobalSessionStatusEvent, replaceGlobalSessionStatusById } from "../global-session-status"
import { replaceDirectoryShells, resetBackgroundShells } from "../background-shells"
import type { ShellJob, ShellSnapshot } from '@openchamber/agent-contract'
import type { WorktreeMetadata } from "@/types/worktree"
import type { State } from "../types"

const CHAT = "/home/u/.config/openchamber/chats/2026-10-03/session-a"
const OTHER_CHAT = "/home/u/.config/openchamber/chats/2026-10-03/session-b"
const WORKTREE = "/repo/app-worktrees/feature"
const PROJECT = "/repo/app"
const CHAT_DELAY = 30_000
const WORKTREE_DELAY = 300_000

type ManualTimer = { run: () => void; ms: number; cleared: boolean }
type NativeDirectoryState = Pick<State, "session_status" | "permission" | "form">

function harness(options: { busy?: Set<string>; unknown?: Set<string>; failRelease?: boolean } = {}) {
  const timers: ManualTimer[] = []
  const released: string[] = []
  const busy = options.busy ?? new Set<string>()
  const unknown = options.unknown ?? new Set<string>()
  const current = { value: PROJECT }
  const release = createLocationRelease<ManualTimer>({
    releaseDelayMs: (directory) => directory.includes("/chats/") ? CHAT_DELAY : directory === WORKTREE ? WORKTREE_DELAY : null,
    isCurrentDirectory: (directory) => directory === current.value,
    directoryUse: (directory): DirectoryUse => unknown.has(directory) ? "unknown" : busy.has(directory) ? "busy" : "free",
    release: async (directory) => { released.push(directory); if (options.failRelease) throw new Error("404") },
    timers: {
      set: (run, ms) => { const timer = { run, ms, cleared: false }; timers.push(timer); return timer },
      clear: (timer) => { timer.cleared = true },
    },
  })
  const move = (next: string) => { const previous = current.value; current.value = next; release.directoryChanged(previous, next) }
  const fire = () => { for (const timer of timers.splice(0)) if (!timer.cleared) timer.run() }
  return { release, released, fire, timers, busy, move }
}

const idle: NativeDirectoryState = { session_status: {}, permission: {}, form: {} }
const shell = (jobId: string): Extract<ShellJob, { status: 'running' }> => ({
  jobId, sessionId: "session-1", epoch: "epoch-1", workerGeneration: "worker-1", workspaceId: "workspace-1", projectId: "project-1",
  command: "bun dev", background: true, startedAt: 1, outputCursor: "0", status: "running",
})

describe("native location release", () => {
  test("leaving an idle chat releases its location after the chat delay", () => {
    const h = harness(); h.move(CHAT); h.move(PROJECT)
    expect(h.released).toEqual([]); expect(h.timers.map((timer) => timer.ms)).toEqual([CHAT_DELAY])
    h.fire(); expect(h.released).toEqual([CHAT])
  })
  test("leaving an idle worktree uses its longer delay", () => {
    const h = harness(); h.move(WORKTREE); h.move(PROJECT)
    expect(h.timers.map((timer) => timer.ms)).toEqual([WORKTREE_DELAY]); h.fire(); expect(h.released).toEqual([WORKTREE])
  })
  test("project roots are never released and returning cancels a pending release", () => {
    const h = harness(); h.move(CHAT); h.fire(); expect(h.released).toEqual([])
    h.move(OTHER_CHAT); h.move(WORKTREE); h.move(CHAT); h.fire(); expect(h.released).toEqual([OTHER_CHAT, WORKTREE])
  })
  test("busy work is retried at its directory delay and released after settling", () => {
    const h = harness({ busy: new Set([WORKTREE]) }); h.move(WORKTREE); h.move(PROJECT); h.fire()
    expect(h.timers.map((timer) => timer.ms)).toEqual([WORKTREE_DELAY]); h.fire(); expect(h.released).toEqual([])
    h.busy.delete(WORKTREE); h.fire(); expect(h.released).toEqual([WORKTREE])
  })
  test("unknown and disposed locations are not polled", () => {
    const h = harness({ unknown: new Set([CHAT]) }); h.move(CHAT); h.move(PROJECT); h.fire()
    expect(h.timers).toHaveLength(0); expect(h.released).toEqual([])
    const second = harness(); second.move(CHAT); second.move(PROJECT); second.release.dispose(); second.fire(); expect(second.released).toEqual([])
  })
  test("failed release remains an observed attempted release", async () => {
    const h = harness({ failRelease: true }); h.move(CHAT); h.move(PROJECT); h.fire(); await Promise.resolve(); expect(h.released).toEqual([CHAT])
  })
})

describe("directoryUse", () => {
  afterEach(() => { replaceGlobalSessionStatusById(new Map()); resetBackgroundShells() })
  test("missing directory state is unknown and idle native state is free", () => {
    expect(directoryUse(CHAT, undefined)).toBe("unknown")
    expect(directoryUse(CHAT, { ...idle, session_status: { session: "idle" } })).toBe("free")
  })
  test("unavailable native authority cannot release a location", () => {
    expect(directoryUse(CHAT, { ...idle, session_status: { session: "unavailable" } })).toBe("unknown")
    applyGlobalSessionStatusEvent(CHAT, { sessionId: 'session-global', epoch: 'epoch-1', sequence: '1', timestamp: 1, type: 'session.status', runtimeStatus: 'unavailable', activeRunId: null })
    expect(directoryUse(CHAT, idle)).toBe("unknown")
    expect(directoryUse(OTHER_CHAT, idle)).toBe("free")
  })
  test("native approval and input waits hold the location", () => {
    for (const runtimeStatus of ["awaiting_approval", "awaiting_input"] as const) {
      expect(directoryUse(CHAT, { ...idle, session_status: { session: runtimeStatus } })).toBe("busy")
    }
  })
  test("running native status and global status hold the location", () => {
    expect(directoryUse(CHAT, { ...idle, session_status: { session: "running" } })).toBe("busy")
    applyGlobalSessionStatusEvent(CHAT, { sessionId: "session-global", epoch: "epoch-1", sequence: "1", timestamp: 1, type: "session.status", runtimeStatus: "running", activeRunId: "run-1" })
    expect(directoryUse(CHAT, idle)).toBe("busy")
    expect(directoryUse(OTHER_CHAT, idle)).toBe("free")
  })
  test("a native background shell holds its workspace", () => {
    const snapshot: ShellSnapshot = { scope: { kind: 'workspace', workspaceId: 'workspace-1' }, epoch: 'epoch-1', revision: '1', running: [shell('shell-1')], ended: [], recovery: { priorEpochs: 'invalidated' } }
    replaceDirectoryShells(CHAT, snapshot, 0)
    expect(directoryUse(CHAT, idle)).toBe("busy"); expect(directoryUse(OTHER_CHAT, idle)).toBe("free")
  })
})

describe("isWorktreeDirectory", () => {
  const worktree = (path: string): WorktreeMetadata => ({ source: "sdk", name: "feature", path, projectDirectory: PROJECT, branch: "feature", label: "feature" })
  test("recognizes a listed worktree but not its project root", () => {
    const byProject = new Map([[PROJECT, [worktree(PROJECT), worktree(WORKTREE)]]])
    expect(isWorktreeDirectory(WORKTREE, byProject)).toBe(true)
    expect(isWorktreeDirectory(`${WORKTREE}/`, byProject)).toBe(true)
    expect(isWorktreeDirectory(PROJECT, byProject)).toBe(false)
    expect(isWorktreeDirectory("/elsewhere", byProject)).toBe(false)
  })
})
