import { normalizePath } from "@/lib/pathNormalization"
import { normalizeProjectPath } from "@/lib/projectResolution"
import type { WorktreeMetadata } from "@/types/worktree"
import { directoriesWithRunningShells } from "./background-shells"
import { useGlobalSessionStatusStore } from "./global-session-status"
import type { State } from "./types"

<<<<<<< HEAD
// Retained host location release scheduling waits until native session work,
// pending user requests, and background shell jobs no longer hold a directory.
// Project roots remain resident; the Host owns the release operation.
||||||| bc50ba56aa
// OpenCode 2 keeps a location for every directory it serves, and each location
// runs its own copy of the user's local MCP servers until OpenCode's hour-long
// inactivity sweep. Once the user has left a directory and nothing runs there,
// ask OpenCode to drop that location sooner. The directory the user is in is
// never released; the server's reads without a directory of their own go to
// that one too.

/** Long enough that flicking between chats does not restart their MCP servers. */
export const CHAT_LOCATION_RELEASE_DELAY_MS = 30_000

/**
 * Worktrees are a place the user works in and comes back to through the day,
 * and coming back after a release waits for the MCP servers to start again.
 */
export const WORKTREE_LOCATION_RELEASE_DELAY_MS = 5 * 60_000

/**
 * Projects are where the user returns most, so they keep their MCP servers the
 * longest; a user switching between several projects would otherwise hold a
 * full set for each of them for OpenCode's hour.
 */
export const PROJECT_LOCATION_RELEASE_DELAY_MS = 15 * 60_000
=======

export const CHAT_LOCATION_RELEASE_DELAY_MS = 30_000

export const WORKTREE_LOCATION_RELEASE_DELAY_MS = 5 * 60_000

export const PROJECT_LOCATION_RELEASE_DELAY_MS = 15 * 60_000
>>>>>>> upstream/main

type Timers<T> = {
  set: (run: () => void, ms: number) => T
  clear: (timer: T) => void
}

<<<<<<< HEAD
/**
 * `busy`: work or a question for the user still holds the location.
 * `unknown`: this window cannot see authoritative directory activity and leaves
 * release decisions to the Host.
 */
||||||| bc50ba56aa
const realTimers: Timers<ReturnType<typeof setTimeout>> = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (timer) => clearTimeout(timer),
}

/**
 * `busy`: work or a question for the user still holds the location.
 * `unknown`: this window cannot see the directory's sessions, so it leaves
 * the location to OpenCode's own sweep.
 */
=======
const realTimers: Timers<ReturnType<typeof setTimeout>> = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (timer) => clearTimeout(timer),
}

>>>>>>> upstream/main
export type DirectoryUse = "free" | "busy" | "unknown"

type LocationReleaseDeps<T> = {
<<<<<<< HEAD
  /** How long after leaving `directory` to release it; null never releases it. */
  releaseDelayMs: (directory: string) => number | null
||||||| bc50ba56aa
  /** How long after leaving `directory` to release it. */
  releaseDelayMs: (directory: string) => number
=======
  releaseDelayMs: (directory: string) => number
>>>>>>> upstream/main
  isCurrentDirectory: (directory: string) => boolean
  directoryUse: (directory: string) => DirectoryUse
  release: (directory: string) => Promise<void>
  timers: Timers<T>
}

export type LocationRelease = {
  directoryChanged: (previous: string | null | undefined, next: string | null | undefined) => void
<<<<<<< HEAD
||||||| bc50ba56aa
  /**
   * Something that kept a directory busy let go. Directories waiting for
   * their next busy re-check that `matches` accepts are looked at now.
   */
  recheck: (matches: (directory: string) => boolean) => void
=======
  recheck: (matches: (directory: string) => boolean) => void
>>>>>>> upstream/main
  dispose: () => void
}

export function createLocationRelease<T>(deps: LocationReleaseDeps<T>): LocationRelease {
  const { timers } = deps
  const pending = new Map<string, T>()
<<<<<<< HEAD
||||||| bc50ba56aa
  // Directories found busy, with the delay their re-check runs at.
  const rechecking = new Map<string, number>()
=======
  const rechecking = new Map<string, number>()
>>>>>>> upstream/main
  let disposed = false

  const cancel = (directory: string) => {
    const timer = pending.get(directory)
    if (timer === undefined) return
    timers.clear(timer)
    pending.delete(directory)
  }

  const schedule = (directory: string, delayMs: number) => {
    cancel(directory)
    pending.set(directory, timers.set(() => attempt(directory, delayMs), delayMs))
  }

  const attempt = (directory: string, delayMs: number) => {
    pending.delete(directory)
    if (disposed || deps.isCurrentDirectory(directory)) return
    const use = deps.directoryUse(directory)
    if (use === "unknown") return
    if (use === "busy") {
      schedule(directory, delayMs)
      return
    }
    void deps.release(directory).catch(() => {
      // A failed release leaves the Host location resident.
    })
  }

  return {
    directoryChanged: (previous, next) => {
      if (disposed || previous === next) return
      if (next) cancel(next)
      if (!previous) return
      const delayMs = deps.releaseDelayMs(previous)
      if (delayMs !== null) schedule(previous, delayMs)
    },
    dispose: () => {
      disposed = true
      for (const timer of pending.values()) timers.clear(timer)
      pending.clear()
    },
  }
}

<<<<<<< HEAD
/**
 * Whether anything in `directory` still needs its location: active native
 * execution, a pending approval/question, or a background command.
 * `state` is the directory's store; without one the answer is unknown.
 */
||||||| bc50ba56aa
/**
 * Whether anything in `directory` still needs its location: a running or
 * retrying session, a pending permission or form, a recap and suggestion the
 * server is still to write, or a background command.
 * `state` is the directory's store; without one the answer is unknown.
 */
=======
>>>>>>> upstream/main
export function directoryUse(
  directory: string,
  state: Pick<State, "session_status" | "permission" | "form"> | undefined,
): DirectoryUse {
  if (!state) return "unknown"
  for (const status of Object.values(state.session_status)) {
    if (status === "running" || status === "awaiting_approval" || status === "awaiting_input") return "busy"
    if (status === "unavailable") return "unknown"
  }
  if (Object.values(state.permission).some((requests) => requests.some((request) => request.status === "pending"))) return "busy"
  if (Object.values(state.form).some((requests) => requests.some((request) => request.status === "pending"))) return "busy"

  const scope = normalizeProjectPath(directory) ?? directory
  for (const entry of useGlobalSessionStatusStore.getState().statusById.values()) {
    if ((normalizeProjectPath(entry.directory) ?? entry.directory) !== scope) continue
    if (entry.status === "running" || entry.status === "awaiting_approval" || entry.status === "awaiting_input") return "busy"
    if (entry.status === "unavailable") return "unknown"
  }
  const shellRuns = directoriesWithRunningShells().some((shellDirectory) => (
    (normalizeProjectPath(shellDirectory) ?? shellDirectory) === scope
  ))
  return shellRuns ? "busy" : "free"
}

<<<<<<< HEAD
/** Whether `directory` is a known worktree of a project, not the project root itself. */
||||||| bc50ba56aa
/** Whether `directory` is a known worktree of a project or a sub-folder inside one, not the project root itself. */
=======
>>>>>>> upstream/main
export function isWorktreeDirectory(
  directory: string,
  availableWorktreesByProject: ReadonlyMap<string, readonly WorktreeMetadata[]>,
): boolean {
  const target = normalizePath(directory)
  if (!target) return false
  const projectRoots = [...availableWorktreesByProject.keys()].map((projectPath) => normalizePath(projectPath))
  if (projectRoots.includes(target)) return false
  for (const worktrees of availableWorktreesByProject.values()) {
    if (worktrees.some((worktree) => normalizePath(worktree.path) === target)) return true
  }
  return false
}
