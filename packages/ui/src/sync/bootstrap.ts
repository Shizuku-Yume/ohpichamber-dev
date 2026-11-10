import type { CanonicalClient } from "@/api/canonicalClient"
import { canonicalClient } from "@/api/canonicalClient"
import { registerWorkspaceDirectory } from "@/stores/globalSessions"
import { refreshBackgroundShells } from "./background-shells"
<<<<<<< HEAD
import type { GlobalState, State } from "./types"
import { isRetryableBootstrapError, retry, STARTUP_RETRY } from "./retry"
=======
import {
  readDirectoryStatusSnapshot,
  selectHeldSessionStatuses,
  readDirectoryFormSnapshot,
  readDirectoryPermissionSnapshot,
  type DirectoryRecoverySource,
} from "./directory-recovery-snapshots"
import { noteQuestionFormSnapshot } from "./recoverable-questions"
>>>>>>> bc50ba56a

/** Discovery failures are scoped, never permission to erase a failed sibling. */
export async function bootstrapGlobal(
  set: (patch: Partial<GlobalState>) => void,
  get: () => GlobalState,
  client: CanonicalClient = canonicalClient,
  isCurrent: () => boolean = () => true,
) {
  const results = await Promise.allSettled([
    retry(() => { if (!isCurrent()) throw new Error("Global bootstrap is no longer current"); return client.listProjects() }),
    retry(() => { if (!isCurrent()) throw new Error("Global bootstrap is no longer current"); return client.listWorkspaces() }),
  ])
  if (!isCurrent()) return
  const prior = get()
  const patch: Partial<GlobalState> = { ready: true }
  const errors: Record<string, string> = {}
  const projects = results[0]
  if (projects.status === "fulfilled") {
    const byId = new Map(projects.value.items.map((project) => [project.projectId, project]))
    for (const project of prior.projects) if (project.projectId in projects.value.errors) byId.set(project.projectId, project)
    patch.projects = [...byId.values()]
    Object.assign(errors, projects.value.errors)
  }
  const workspaces = results[1]
  if (workspaces.status === "fulfilled") {
    const byId = new Map(workspaces.value.items.map((workspace) => [workspace.workspaceId, workspace]))
    for (const workspace of prior.workspaces) if (workspace.workspaceId in workspaces.value.errors || workspace.projectId in workspaces.value.errors) byId.set(workspace.workspaceId, workspace)
    patch.workspaces = [...byId.values()]
    Object.assign(errors, workspaces.value.errors)
  }
  patch.discoveryErrors = errors
  const failed = results.find((result) => result.status === "rejected")
  patch.error = failed?.status === "rejected"
    ? { type: "init", message: failed.reason instanceof Error ? failed.reason.message : String(failed.reason) }
    : undefined
  set(patch)
}

export type DirectoryBootstrapInput = {
  directory: string
  store: { getState: () => State }
  set: (patch: Partial<State>) => void
  isStale?: () => boolean
  client?: CanonicalClient
  loadSessions: (directory: string) => Promise<void> | void
}

export type BootstrapResult = "complete" | "failed" | "stale"
export type EnvironmentBootstrapResult = { status: BootstrapResult; retryable: boolean }

/** Resolve an authorized directory before any workspace-scoped operation. */
export function bootstrapDirectory(input: DirectoryBootstrapInput) {
  const client = input.client ?? canonicalClient
  const resolved = (async () => {
    const workspace = await retry(() => {
      if (input.isStale?.()) throw new Error("Workspace bootstrap is no longer current")
      return client.resolveWorkspace(input.directory)
    })
    if (input.isStale?.()) return undefined
    registerWorkspaceDirectory(workspace.workspaceId, input.directory)
    input.set({ workspace, project: workspace.projectId, path: {
      ...input.store.getState().path, directory: input.directory,
      projectId: workspace.projectId, workspaceId: workspace.workspaceId,
    }, status: "partial" })
    return workspace
  })()
  const sessions = (async (): Promise<BootstrapResult> => {
    try {
      const workspace = await resolved
      if (!workspace || input.isStale?.()) return "stale"
      await retry(async () => {
        if (input.isStale?.()) throw new Error("Workspace bootstrap is no longer current")
        await input.loadSessions(input.directory)
      })
      return input.isStale?.() ? "stale" : "complete"
    } catch {
      return input.isStale?.() ? "stale" : "failed"
    }
  })()
  const environment = (async (): Promise<EnvironmentBootstrapResult> => {
    try {
      const workspace = await resolved
      if (!workspace || input.isStale?.()) return { status: "stale", retryable: false }
      const startupRead = <T>(read: () => Promise<T>): Promise<T> => retry(() => {
        if (input.isStale?.()) throw new Error("Workspace bootstrap is no longer current")
        return read()
      }, STARTUP_RETRY)
      const reads = await Promise.allSettled([
        startupRead(() => client.getModels(workspace.workspaceId)).then((models) => { if (!input.isStale?.()) input.set({ models }) }),
        startupRead(() => client.getProviders(workspace.workspaceId)).then((providers) => { if (!input.isStale?.()) input.set({ providers }) }),
        startupRead(() => client.getAgents(workspace.workspaceId)).then((agents) => { if (!input.isStale?.()) input.set({ agents }) }),
        startupRead(() => refreshBackgroundShells(input.directory, async () => {
          const snapshot = await client.getShellSnapshot({ kind: "workspace", workspaceId: workspace.workspaceId })
          if (input.isStale?.()) throw new Error("Workspace bootstrap is no longer current")
          return snapshot
        })),
      ])
      if (input.isStale?.()) return { status: "stale", retryable: false }
      const rejected = reads.filter((result): result is PromiseRejectedResult => result.status === "rejected")
      if (rejected.length > 0) {
        return {
          status: "failed",
          retryable: rejected.some((result) => isRetryableBootstrapError(result.reason)),
        }
      }
      if (await sessions !== "complete") return { status: "failed", retryable: false }
      input.set({ status: "complete" })
      return { status: "complete", retryable: false }
    } catch (error) {
      if (input.isStale?.()) return { status: "stale", retryable: false }
      return { status: "failed", retryable: isRetryableBootstrapError(error) }
    }
  })()
<<<<<<< HEAD
  return { sessions, environment }
}
=======
  // Initialization has its own completion and network capacity. A slow config
  // or directory cannot hold the session-list scheduler's slot.
  const environment = initializeDirectory(input, sessions)
  return { sessions, environment }
}

async function initializeDirectory(input: DirectoryBootstrapInput, sessions: Promise<BootstrapResult>): Promise<BootstrapResult> {
  const { directory, store, set, global: g } = input
  const read = <T>(request: () => Promise<T>, priority?: "active-session") => retry(() => runBackgroundNetworkTask(() => {
    if (input.isStale?.()) throw new Error("Directory initialization superseded")
    return request()
  }, priority))
  const commit = (patch: Partial<State>): boolean => {
    if (input.isStale?.()) return false
    set(patch)
    return true
  }
  const state = store.getState()

  // Seed from global state while we fetch directory-specific data
  const seededProject = projectID(directory, g.projects)
  if (seededProject) commit({ project: seededProject })
  if (Object.keys(state.config ?? {}).length === 0 && Object.keys(g.config ?? {}).length > 0) {
    if (commit({ config: g.config })) emitSyncConfigChanged(directory, g.config)
  }
  commit({ status: "partial" })
  if (input.isStale?.()) return "stale"

  // Queue live recovery first. Each read commits independently and a failing
  // config read cannot suppress pending form or permission recovery.
  const critical = Promise.allSettled([
    // The host's active list covers every directory, so it speaks for this one
    // only once the session list says which of those sessions are here. Without
    // that list the statuses stay unknown.
    sessions.then(async (listed) => {
      if (listed !== "complete") return
      await read(async () => {
        const session_status = await readDirectoryStatusSnapshot(store, async () => {
          const statuses = await opencodeClient.getActiveSessionStatuses(directory)
          if (statuses === null) throw new Error("session.active failed")
          return selectHeldSessionStatuses(statuses, store.getState().session)
        })
        commit({ session_status, sessionStatusReady: true })
      }, "active-session")
    }),
    read(async () => {
      const form = await readDirectoryFormSnapshot(store, () => (
        opencodeClient.listPendingForms({ directories: [directory] })
      ))
      if (commit({ form })) noteQuestionFormSnapshot(directory, Object.values(form).flat())
    }),
    read(async () => {
      const permission = await readDirectoryPermissionSnapshot(store, () => (
        opencodeClient.listPendingPermissions({ directories: [directory] })
      ))
      commit({ permission })
    }),
    read(() => opencodeClient.getConfig(directory).then((config) => {
      if (commit({ config })) emitSyncConfigChanged(directory, config)
    })),
    read(() =>
      opencodeClient.getLocation(directory).then((location) => {
        commit({
          project: location.project.id,
          path: { directory: location.directory, worktree: location.project.directory, home: g.path.home },
        })
      }),
    ),
  ])
  // MCP status and the command list are deliberately not read here. Reading
  // MCP state initializes the directory's whole stdio server fleet as an
  // OpenCode side effect, and listing commands enumerates MCP prompts, which
  // touches that same state. Both surfaces fetch on demand through their own
  // stores (useMcpStore, useCommandsStore) instead.
  const enrichment = Promise.allSettled([
    read(() => opencodeClient.getVcs(directory).then((vcs) => commit({ vcs }))),
    // Commands the agent left running in the background, including ones whose
    // start or exit this client missed.
    read(() => refreshBackgroundShells(directory, (target) => opencodeClient.listRunningShells(target))),
  ])
  const [results, enrichmentResults] = await Promise.all([critical, enrichment])
  if (input.isStale?.()) return "stale"
  const enrichmentErrors = enrichmentResults.filter((result): result is PromiseRejectedResult => result.status === "rejected")
  if (enrichmentErrors.length) console.warn(`[bootstrap] optional enrichment failed for ${directory}`, enrichmentErrors[0].reason)
  const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
  if (errors.length) {
    console.error(`[bootstrap] environment initialization failed for ${directory}`, errors[0].reason)
    return "failed"
  }
  commit({ status: "complete" })
  return "complete"
}
>>>>>>> bc50ba56a
