import { normalizePath } from "@/lib/pathNormalization"
import { normalizeProjectPath } from "@/lib/projectResolution"
import type { WorktreeMetadata } from "@/types/worktree"
import { directoriesWithRunningShells } from "./background-shells"
import { useGlobalSessionStatusStore } from "./global-session-status"
import type { State } from "./types"

// Retained host location release scheduling waits until native session work,
// pending user requests, and background shell jobs no longer hold a directory.
// Project roots remain resident; the Host owns the release operation.

type Timers<T> = {
  set: (run: () => void, ms: number) => T
  clear: (timer: T) => void
}

/**
 * `busy`: work or a question for the user still holds the location.
 * `unknown`: this window cannot see authoritative directory activity and leaves
 * release decisions to the Host.
 */
export type DirectoryUse = "free" | "busy" | "unknown"

type LocationReleaseDeps<T> = {
  /** How long after leaving `directory` to release it; null never releases it. */
  releaseDelayMs: (directory: string) => number | null
  isCurrentDirectory: (directory: string) => boolean
  directoryUse: (directory: string) => DirectoryUse
  release: (directory: string) => Promise<void>
  timers: Timers<T>
}

export type LocationRelease = {
  directoryChanged: (previous: string | null | undefined, next: string | null | undefined) => void
  dispose: () => void
}

export function createLocationRelease<T>(deps: LocationReleaseDeps<T>): LocationRelease {
  const { timers } = deps
  const pending = new Map<string, T>()
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
