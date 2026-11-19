import type { CanonicalClient } from "@/api/canonicalClient"
import { canonicalClient } from "@/api/canonicalClient"
import { registerWorkspaceDirectory } from "@/stores/globalSessions"
import { refreshBackgroundShells } from "./background-shells"
import type { GlobalState, State } from "./types"
import { isRetryableBootstrapError, retry, STARTUP_RETRY } from "./retry"

<<<<<<< HEAD
/** Discovery failures are scoped, never permission to erase a failed sibling. */
export async function bootstrapGlobal(
  set: (patch: Partial<GlobalState>) => void,
  get: () => GlobalState,
  client: CanonicalClient = canonicalClient,
  isCurrent: () => boolean = () => true,
) {
||||||| bc50ba56aa
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function projectID(directory: string, projects: Project[]) {
  return projects.find(
    (project) => project.worktree === directory || project.sandboxes?.includes(directory),
  )?.id
}

// ---------------------------------------------------------------------------
// Bootstrap global state
// ---------------------------------------------------------------------------

export async function bootstrapGlobal(set: (patch: Partial<GlobalState>) => void) {
=======
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function projectID(directory: string, projects: Project[]) {
  return projects.find(
    (project) => project.worktree === directory || project.sandboxes?.includes(directory),
  )?.id
}


export async function bootstrapGlobal(set: (patch: Partial<GlobalState>) => void) {
>>>>>>> upstream/main
  const results = await Promise.allSettled([
<<<<<<< HEAD
    retry(() => { if (!isCurrent()) throw new Error("Global bootstrap is no longer current"); return client.listProjects() }),
    retry(() => { if (!isCurrent()) throw new Error("Global bootstrap is no longer current"); return client.listWorkspaces() }),
||||||| bc50ba56aa
    // Sync chat classification needs the chats root before session lists load;
    // it resolves alongside the other bootstrap calls, not ahead of them.
    warmChatsRootDirectory(),
    retry(async () => {
      const [location, home] = await Promise.all([opencodeClient.getLocation(), opencodeClient.getFilesystemHome()])
      set({ path: { directory: location.directory, worktree: location.project.directory, home: home ?? "" } })
    }),
    retry(() => opencodeClient.getConfig().then((config) => set({ config }))),
    retry(() =>
      opencodeClient.listProjects().then((data) => {
        const projects = data
          .filter((p) => !!p.worktree && !p.worktree.includes("opencode-test"))
          .sort((a, b) => cmp(a.id, b.id))
        set({ projects })
      }),
    ),
=======
    warmChatsRootDirectory(),
    retry(async () => {
      const [location, home] = await Promise.all([opencodeClient.getLocation(), opencodeClient.getFilesystemHome()])
      set({ path: { directory: location.directory, worktree: location.project.directory, home: home ?? "" } })
    }),
    retry(() => opencodeClient.getConfig().then((config) => set({ config }))),
    retry(() =>
      opencodeClient.listProjects().then((data) => {
        const projects = data
          .filter((p) => !!p.worktree && !p.worktree.includes("opencode-test"))
          .sort((a, b) => cmp(a.id, b.id))
        set({ projects })
      }),
    ),
>>>>>>> upstream/main
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
<<<<<<< HEAD
  const workspaces = results[1]
  if (workspaces.status === "fulfilled") {
    const byId = new Map(workspaces.value.items.map((workspace) => [workspace.workspaceId, workspace]))
    for (const workspace of prior.workspaces) if (workspace.workspaceId in workspaces.value.errors || workspace.projectId in workspaces.value.errors) byId.set(workspace.workspaceId, workspace)
    patch.workspaces = [...byId.values()]
    Object.assign(errors, workspaces.value.errors)
||||||| bc50ba56aa

  // If ALL requests failed, OpenCode is likely down — fetch the OpenChamber
  // health endpoint (outside the readiness gate) to get the actual error reason.
  if (errors.length === results.length) {
    let message = errors[0] instanceof Error ? errors[0].message : String(errors[0])
    try {
      const healthRes = await runtimeFetch("/health", { signal: AbortSignal.timeout(4000) })
      if (healthRes.ok) {
        const health = await healthRes.json()
        if (health.lastOpenCodeError) {
          message = health.lastOpenCodeError
        } else if (!health.openCodeRunning) {
          message = "OpenCode process is not running"
        }
      }
    } catch {
      // health endpoint itself unreachable — use the original error
    }
    set({ ready: true, error: { type: "init", message } })
  } else {
    set({ ready: true, error: undefined })
=======

  if (errors.length === results.length) {
    let message = errors[0] instanceof Error ? errors[0].message : String(errors[0])
    try {
      const healthRes = await runtimeFetch("/health", { signal: AbortSignal.timeout(4000) })
      if (healthRes.ok) {
        const health = await healthRes.json()
        if (health.lastOpenCodeError) {
          message = health.lastOpenCodeError
        } else if (!health.openCodeRunning) {
          message = "OpenCode process is not running"
        }
      }
    } catch {
      // health endpoint itself unreachable — use the original error
    }
    set({ ready: true, error: { type: "init", message } })
  } else {
    set({ ready: true, error: undefined })
>>>>>>> upstream/main
  }
  patch.discoveryErrors = errors
  const failed = results.find((result) => result.status === "rejected")
  patch.error = failed?.status === "rejected"
    ? { type: "init", message: failed.reason instanceof Error ? failed.reason.message : String(failed.reason) }
    : undefined
  set(patch)
}

<<<<<<< HEAD
export type DirectoryBootstrapInput = {
||||||| bc50ba56aa
// ---------------------------------------------------------------------------
// Bootstrap per-directory state
// ---------------------------------------------------------------------------

type DirectoryBootstrapInput = {
=======

type DirectoryBootstrapInput = {
>>>>>>> upstream/main
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
||||||| bc50ba56aa
  // Initialization has its own completion and network capacity. A slow config
  // or directory cannot hold the session-list scheduler's slot.
  const environment = initializeDirectory(input, sessions)
=======
  const environment = initializeDirectory(input, sessions)
>>>>>>> upstream/main
  return { sessions, environment }
}
<<<<<<< HEAD
||||||| bc50ba56aa

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
=======

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

  const seededProject = projectID(directory, g.projects)
  if (seededProject) commit({ project: seededProject })
  if (Object.keys(state.config ?? {}).length === 0 && Object.keys(g.config ?? {}).length > 0) {
    if (commit({ config: g.config })) emitSyncConfigChanged(directory, g.config)
  }
  commit({ status: "partial" })
  if (input.isStale?.()) return "stale"

  const critical = Promise.allSettled([
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
  const enrichment = Promise.allSettled([
    read(() => opencodeClient.getVcs(directory).then((vcs) => commit({ vcs }))),
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
>>>>>>> upstream/main
