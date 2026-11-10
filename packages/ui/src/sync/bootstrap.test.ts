import { describe, expect, test } from "bun:test"
import { createStore } from "zustand/vanilla"
<<<<<<< HEAD
import { CanonicalApiError, type CanonicalClient } from "@/api/canonicalClient"
import type { ShellSnapshot, Workspace } from "@openchamber/agent-contract"
import { bootstrapDirectory, bootstrapGlobal } from "./bootstrap"
import { INITIAL_GLOBAL_STATE, INITIAL_STATE, type GlobalState, type State } from "./types"

const workspace: Workspace = { workspaceId: "workspace-1", projectId: "project-1", name: "Workspace", displayPath: "." }
const shellSnapshot = { scope: { kind: "workspace", workspaceId: "workspace-1" }, epoch: "shell-epoch", revision: "0", running: [], ended: [], recovery: { priorEpochs: "invalidated" } } as ShellSnapshot
const inputFor = (client: CanonicalClient, stale: () => boolean = () => false) => {
  const store = createStore<State>(() => ({ ...INITIAL_STATE, path: { directory: "", worktree: "", home: "" } }))
  const patches: Partial<State>[] = []
=======
import { opencodeClient } from "@/lib/opencode/client"
import type { FormRequest, Session } from "@/lib/opencode/model"
import { bootstrapDirectory } from "./bootstrap"
import { INITIAL_STATE, type State } from "./types"
import { getBackgroundNetworkState, runBackgroundNetworkTask } from "../lib/background-network"
import { resetRecoverableQuestions, useRecoverableQuestionsStore } from "./recoverable-questions"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

const location = spyOn(opencodeClient, "getLocation")
const config = spyOn(opencodeClient, "getConfig")
const statuses = spyOn(opencodeClient, "getActiveSessionStatuses")
const commands = spyOn(opencodeClient, "listCommands")
const mcp = spyOn(opencodeClient, "listMcpServers")
const vcs = spyOn(opencodeClient, "getVcs")
const forms = spyOn(opencodeClient, "listPendingForms")
const permissions = spyOn(opencodeClient, "listPendingPermissions")
// Optional enrichment: unstubbed, its failed read would be retried as transient.
const shells = spyOn(opencodeClient, "listRunningShells")
// `commands` and `mcp` are spied so the regression test can assert bootstrap
// never touches them; they are not part of directory initialization.
const spies = [location, config, statuses, vcs, forms, permissions]

beforeEach(() => {
  resetRecoverableQuestions()
  for (const spy of [...spies, commands, mcp, shells]) spy.mockReset()
  shells.mockImplementation(async (directory) => ({ directory, shells: [] }))
  location.mockImplementation(async (directory) => ({
    directory: directory ?? "/repo",
    project: { id: "project-a", directory: directory ?? "/repo", canonical: directory ?? "/repo" },
  }))
  config.mockResolvedValue({})
  statuses.mockResolvedValue({})
  commands.mockResolvedValue([])
  mcp.mockResolvedValue([])
  vcs.mockResolvedValue({ branch: "main" })
  forms.mockResolvedValue([])
  permissions.mockResolvedValue([])
})

afterEach(() => {
  expect(getBackgroundNetworkState().active).toBe(0)
})

const inputFor = (state: Partial<State> = {}) => {
  const store = createStore<State>(() => ({ ...INITIAL_STATE, ...state }))
>>>>>>> bc50ba56a
  return {
    store, patches,
    input: { directory: "/repo", store, set: (patch: Partial<State>) => { patches.push(patch); store.setState(patch) }, isStale: stale, client, loadSessions: async () => {} },
  }
}
function nativeClient(overrides: Partial<Record<string, unknown>> = {}): CanonicalClient {
  return {
    resolveWorkspace: async () => workspace,
    listSessions: async () => ({ items: [], errors: {} }),
    getModels: async () => ({ workspaceId: workspace.workspaceId, revision: "0", models: [], defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false }),
    getProviders: async () => ({ workspaceId: workspace.workspaceId, revision: "0", providers: [] }),
    getAgents: async () => ({ workspaceId: workspace.workspaceId, revision: "0", agents: [] }),
    getShellSnapshot: async () => shellSnapshot,
    ...overrides,
  } as unknown as CanonicalClient
}

<<<<<<< HEAD
describe("native canonical bootstrap", () => {
  test("resolves the authorized workspace before loading sessions and environment", async () => {
    const calls: string[] = []
    const client = nativeClient({
      resolveWorkspace: async () => { calls.push("resolve"); return workspace },
      getModels: async () => { calls.push("models"); return {} as never },
      getProviders: async () => { calls.push("providers"); return {} as never },
      getAgents: async () => { calls.push("agents"); return {} as never },
      getShellSnapshot: async (scope: unknown) => { calls.push(`shell:${JSON.stringify(scope)}`); return shellSnapshot },
=======
const form = (id: string, title = "Pick"): FormRequest => ({
  id, sessionID: "session", title, fields: [{ key: "answer", type: "boolean" }],
})

const sessionRecord = (id: string): Session => ({
  id, projectID: "project-a", directory: "/repo", title: id,
  time: { created: 1, updated: 1 }, cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
})

describe("bootstrapDirectory", () => {
  test("finishes session loading while the config read is unresolved", async () => {
    const blocked = deferred<void>()
    config.mockImplementation(async () => { await blocked.promise; return {} })
    const input = inputFor()
    let initialized = false
    const bootstrap = bootstrapDirectory(input)
    void bootstrap.environment.then(() => { initialized = true })
    try {
      expect(await bootstrap.sessions).toBe("complete")
      expect(initialized).toBe(false)
      expect(input.store.getState().status).toBe("partial")
    } finally {
      blocked.resolve()
      expect(await bootstrap.environment).toBe("complete")
      expect(input.store.getState().status).toBe("complete")
    }
  })

  test("keeps session-list failure separate from successful environment initialization", async () => {
    const cached = [sessionRecord("cached")]
    const input = inputFor({ session: cached })
    const bootstrap = bootstrapDirectory({ ...input, loadSessions: async () => { throw new Error("unavailable") } })
    expect(await bootstrap.sessions).toBe("failed")
    expect(await bootstrap.environment).toBe("complete")
    expect(input.store.getState().session).toBe(cached)
  })

  test("a config failure cannot suppress status or pending-form recovery", async () => {
    config.mockRejectedValue(Object.assign(new Error("invalid config"), { status: 400 }))
    const pending = form("pending")
    forms.mockResolvedValue([pending])
    const input = inputFor()
    const bootstrap = bootstrapDirectory(input)
    expect(await bootstrap.sessions).toBe("complete")
    expect(await bootstrap.environment).toBe("failed")
    expect(input.store.getState().form.session).toEqual([pending])
    expect(input.store.getState().sessionStatusReady).toBe(true)
  })

  test("a failed status snapshot preserves live state and does not grant idle authority", async () => {
    const previous: State["session_status"] = { session: { type: "busy" } }
    statuses.mockResolvedValue(null)
    const input = inputFor({ session_status: previous })
    const bootstrap = bootstrapDirectory(input)
    expect(await bootstrap.sessions).toBe("complete")
    expect(await bootstrap.environment).toBe("failed")
    expect(input.store.getState().session_status).toBe(previous)
    expect(input.store.getState().sessionStatusReady).toBeUndefined()
  })

  test("keeps only the host's active sessions that this directory lists, however late the list lands", async () => {
    const own = { ...sessionRecord("own"), directory: "/repo" }
    const list = deferred<void>()
    statuses.mockResolvedValue({ own: { type: "busy" }, foreign: { type: "busy" } })
    const input = inputFor()
    const bootstrap = bootstrapDirectory({ ...input, loadSessions: () => list.promise })
    await Promise.resolve()
    expect(statuses.mock.calls).toHaveLength(0)
    input.store.setState({ session: [own] })
    list.resolve()
    expect(await bootstrap.environment).toBe("complete")
    expect(input.store.getState().session_status).toEqual({ own: { type: "busy" } })
  })

  test("a failed session list leaves statuses unknown, since it cannot say which sessions are here", async () => {
    const previous: State["session_status"] = { running: { type: "busy" } }
    statuses.mockResolvedValue({ running: { type: "busy" } })
    const input = inputFor({ session_status: previous })
    const bootstrap = bootstrapDirectory({ ...input, loadSessions: async () => { throw new Error("unavailable") } })
    expect(await bootstrap.environment).toBe("complete")
    expect(statuses.mock.calls).toHaveLength(0)
    expect(input.store.getState().session_status).toBe(previous)
    expect(input.store.getState().sessionStatusReady).toBeUndefined()
  })

  test("optional VCS failure preserves its previous state without failing core initialization", async () => {
    vcs.mockRejectedValue(Object.assign(new Error("VCS unavailable"), { status: 400 }))
    const previous: State["vcs"] = { branch: "main" }
    const input = inputFor({ vcs: previous })
    const bootstrap = bootstrapDirectory(input)
    expect(await bootstrap.sessions).toBe("complete")
    expect(await bootstrap.environment).toBe("complete")
    expect(input.store.getState().vcs).toBe(previous)
  })

  test("never reads MCP-initializing endpoints during directory initialization", async () => {
    // Reading MCP status initializes the directory's entire stdio server
    // fleet, and listing commands enumerates MCP prompts, which touches the
    // same state. Bootstrap used to run for every known project directory, so
    // either read spawned a fleet per project at startup. MCP and command
    // surfaces fetch on demand instead.
    const input = inputFor()
    const bootstrap = bootstrapDirectory(input)
    expect(await bootstrap.sessions).toBe("complete")
    expect(await bootstrap.environment).toBe("complete")
    expect(mcp.mock.calls).toHaveLength(0)
    expect(commands.mock.calls).toHaveLength(0)
  })

  test("rejects stale work before starting either phase", async () => {
    const input = inputFor()
    const state = input.store.getState()
    let lists = 0
    const bootstrap = bootstrapDirectory({ ...input, isStale: () => true, loadSessions: async () => { lists += 1 } })
    expect(await bootstrap.sessions).toBe("stale")
    expect(await bootstrap.environment).toBe("stale")
    expect(lists).toBe(0)
    for (const spy of spies) expect(spy.mock.calls).toHaveLength(0)
    expect(input.store.getState()).toBe(state)
  })

  test("drops queued initialization reads after the directory generation changes", async () => {
    const blocked = Array.from({ length: getBackgroundNetworkState().limit }, () => deferred<void>())
    const occupied = blocked.map((task) => runBackgroundNetworkTask(() => task.promise))
    let stale = false
    const input = inputFor()
    const bootstrap = bootstrapDirectory({ ...input, isStale: () => stale })
    expect(await bootstrap.sessions).toBe("complete")
    stale = true
    const state = input.store.getState()
    for (const task of blocked) task.resolve()
    await Promise.all(occupied)
    expect(await bootstrap.environment).toBe("stale")
    for (const spy of spies) expect(spy.mock.calls).toHaveLength(0)
    expect(input.store.getState()).toBe(state)
  })

  test("an in-flight response cannot commit after its initialization is superseded", async () => {
    const response = deferred<State["config"]>()
    const started = deferred<void>()
    let stale = false
    config.mockImplementation(() => { started.resolve(); return response.promise })
    const input = inputFor()
    const bootstrap = bootstrapDirectory({ ...input, isStale: () => stale })
    await bootstrap.sessions
    await started.promise
    stale = true
    const state = input.store.getState()
    response.resolve({ instructions: ["old configuration"] })
    expect(await bootstrap.environment).toBe("stale")
    expect(input.store.getState()).toBe(state)
  })

  test("a superseded form read cannot capture questions into the next runtime", async () => {
    const response = deferred<FormRequest[]>()
    const started = deferred<void>()
    forms.mockImplementation(() => { started.resolve(); return response.promise })
    let stale = false
    const bootstrap = bootstrapDirectory({ ...inputFor(), isStale: () => stale })
    await started.promise
    stale = true
    response.resolve([{
      id: "frm_old", sessionID: "ses_old", title: "Question", fields: [{ key: "q", type: "string" }],
      metadata: { kind: "question", tool: { messageID: "msg_old", id: "tool_old" } },
    }])
    expect(await bootstrap.environment).toBe("stale")
    expect(useRecoverableQuestionsStore.getState().seen.size).toBe(0)
  })

  test("addresses directory reads explicitly and names the directory to the v2 active-status read", async () => {
    for (const directory of ["/workspace/Alpha", "C:/Users/Developer/Tree", "//Server/Share/Project", "C:/Users/Ірина/Project with spaces/100%", "C:/"]) {
      for (const spy of spies) spy.mock.calls.length = 0
      const input = { ...inputFor(), directory }
      const bootstrap = bootstrapDirectory(input)
      expect(await bootstrap.sessions).toBe("complete")
      expect(await bootstrap.environment).toBe("complete")
      for (const spy of [location, config, vcs]) expect(spy.mock.calls).toEqual([[directory]])
      for (const spy of [forms, permissions]) expect(spy.mock.calls).toEqual([[{ directories: [directory] }]])
      // The directory travels with the read; the client keeps the host's snapshot global and
      // asks a directory inside an isolated space for its own.
      expect(statuses.mock.calls).toEqual([[directory]])
      expect(input.store.getState().path.directory).toBe(directory)
    }
  })

  test("an authoritative empty form list clears old records", async () => {
    const input = inputFor({ form: { session: [form("old")] } })
    const bootstrap = bootstrapDirectory(input)
    await bootstrap.sessions
    expect(await bootstrap.environment).toBe("complete")
    expect(input.store.getState().form).toEqual({})
  })

  test("failed form recovery preserves previous forms", async () => {
    const previous = { session: [form("old")] }
    forms.mockRejectedValue(Object.assign(new Error("unavailable"), { status: 400 }))
    const input = inputFor({ form: previous })
    const bootstrap = bootstrapDirectory(input)
    await bootstrap.sessions
    expect(await bootstrap.environment).toBe("failed")
    expect(input.store.getState().form).toBe(previous)
  })

  test("retries transient form failures without replaying the session list", async () => {
    let lists = 0
    const pending = form("pending")
    forms.mockRejectedValueOnce(Object.assign(new Error("warming up"), { status: 503 })).mockResolvedValue([pending])
    const input = inputFor()
    const bootstrap = bootstrapDirectory({ ...input, loadSessions: async () => { lists += 1 } })
    expect(await bootstrap.sessions).toBe("complete")
    expect(await bootstrap.environment).toBe("complete")
    expect(forms.mock.calls).toHaveLength(2)
    expect(lists).toBe(1)
    expect(input.store.getState().form.session).toEqual([pending])
  })

  test("fetched forms replace unchanged records and retain same-session live additions", async () => {
    const old = form("form-1")
    const added = form("form-2")
    const updated = form("form-1", "Updated")
    const input = inputFor({ form: { session: [old] } })
    forms.mockImplementation(async () => {
      input.store.setState({ form: { session: [old, added] } })
      return [updated]
>>>>>>> bc50ba56a
    })
    const { input, store } = inputFor(client)
    const result = bootstrapDirectory({ ...input, loadSessions: async () => { calls.push("sessions") } })
    expect(await result.sessions).toBe("complete")
    expect(await result.environment).toEqual({ status: "complete", retryable: false })
    expect(calls.indexOf("resolve")).toBeLessThan(calls.indexOf("sessions"))
    expect(calls).toContain('shell:{"kind":"workspace","workspaceId":"workspace-1"}')
    expect(store.getState().workspace).toEqual(workspace)
    expect(store.getState().status).toBe("complete")
  })

  test("stale scope does not commit workspace or environment results", async () => {
    let stale = false
    let resolve!: (value: Workspace) => void
    const pending = new Promise<Workspace>((done) => { resolve = done })
    const { input, store, patches } = inputFor(nativeClient({ resolveWorkspace: () => pending }), () => stale)
    const result = bootstrapDirectory(input)
    stale = true
    resolve(workspace)
    expect(await result.sessions).toBe("stale")
    expect(await result.environment).toEqual({ status: "stale", retryable: false })
    expect(store.getState().workspace).toBeUndefined()
    expect(patches).toEqual([])
  })

  test("failed native shell snapshot keeps the directory partial and reports a failed environment", async () => {
    const { input, store } = inputFor(nativeClient({ getShellSnapshot: async () => { throw new Error("shell unavailable") } }))
    const result = bootstrapDirectory(input)
    expect(await result.sessions).toBe("complete")
    expect(await result.environment).toEqual({ status: "failed", retryable: true })
    expect(store.getState().status).toBe("partial")
    expect(store.getState().workspace).toEqual(workspace)
  })

  test("retries service warmup without interpreting it as an empty workspace", async () => {
    let calls = 0
    const { input, store } = inputFor(nativeClient({ resolveWorkspace: async () => {
      calls += 1
      if (calls === 1) throw new CanonicalApiError({ type: "urn:test:warmup", title: "Warmup", status: 503, detail: "Starting", code: "SERVICE_UNAVAILABLE", retryable: true })
      return workspace
    } }))
    const result = bootstrapDirectory(input)
    expect(await result.sessions).toBe("complete")
    expect(await result.environment).toEqual({ status: "complete", retryable: false })
    expect(calls).toBe(2)
    expect(store.getState().workspace).toEqual(workspace)
  })

  test("retries retryable environment readiness and commits the eventual catalog", async () => {
    let modelCalls = 0
    const retryable = () => new CanonicalApiError({ type: "urn:test:warmup", title: "Warmup", status: 503, detail: "Agent Service is not ready", code: "SERVICE_UNAVAILABLE", retryable: true })
    const { input, store } = inputFor(nativeClient({ getModels: async () => {
      modelCalls += 1
      if (modelCalls === 1) throw retryable()
      return { workspaceId: workspace.workspaceId, revision: "1", models: [], defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false }
    } }))
    const result = bootstrapDirectory(input)
    expect(await result.sessions).toBe("complete")
    expect(await result.environment).toEqual({ status: "complete", retryable: false })
    expect(modelCalls).toBe(2)
    expect(store.getState().models).toEqual({ workspaceId: workspace.workspaceId, revision: "1", models: [], defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false })
    expect(store.getState().status).toBe("complete")
  })

  test("non-retryable environment failure fails immediately and preserves healthy siblings", async () => {
    let providerCalls = 0
    const nonRetryable = new CanonicalApiError({ type: "urn:test:denied", title: "Denied", status: 403, detail: "Forbidden", code: "UNAUTHORIZED", retryable: false })
    const { input, store } = inputFor(nativeClient({
      getProviders: async () => { providerCalls += 1; throw nonRetryable },
      getModels: async () => ({ workspaceId: workspace.workspaceId, revision: "1", models: [], defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false }),
    }))
    const result = bootstrapDirectory(input)
    expect(await result.sessions).toBe("complete")
    expect(await result.environment).toEqual({ status: "failed", retryable: false })
    expect(providerCalls).toBe(1)
    expect(store.getState().models).toEqual({ workspaceId: workspace.workspaceId, revision: "1", models: [], defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false })
    expect(store.getState().status).toBe("partial")
  })

  test("ignores environment completion after the runtime scope turns stale", async () => {
    let stale = false
    let resolveAgents!: (value: { workspaceId: string; revision: string; agents: never[] }) => void
    const pendingAgents = new Promise<{ workspaceId: string; revision: string; agents: never[] }>((resolve) => { resolveAgents = resolve })
    const { input, store, patches } = inputFor(nativeClient({ getAgents: () => pendingAgents }), () => stale)
    const result = bootstrapDirectory(input)
    await Promise.resolve()
    stale = true
    resolveAgents({ workspaceId: workspace.workspaceId, revision: "1", agents: [] })
    expect(await result.environment).toEqual({ status: "stale", retryable: false })
    expect(patches.some((patch) => "agents" in patch)).toBe(false)
    expect(store.getState().agents).toBeUndefined()
  })

  test("global failed and partial discovery preserve their own cached scopes", async () => {
    const cachedProject = { projectId: "project-old", name: "Cached", workspaceIds: ["workspace-old"], displayPath: "." }
    const cachedWorkspace = { ...workspace, workspaceId: "workspace-old", projectId: cachedProject.projectId }
    const store = createStore<GlobalState>(() => ({ ...INITIAL_GLOBAL_STATE, projects: [cachedProject], workspaces: [cachedWorkspace] }))
    const client = nativeClient({
      listProjects: async () => { throw new Error("project read denied") },
      listWorkspaces: async () => ({ items: [workspace], errors: { [cachedWorkspace.workspaceId]: "unavailable" } }),
    })
    await bootstrapGlobal(store.setState, store.getState, client)
    expect(store.getState().projects).toEqual([cachedProject])
    expect(store.getState().workspaces).toEqual([workspace, cachedWorkspace])
    expect(store.getState().error?.message).toBe("project read denied")
    expect(store.getState().discoveryErrors).toEqual({ [cachedWorkspace.workspaceId]: "unavailable" })
  })

  test("successful empty global discovery is authoritative, unlike failure", async () => {
    const store = createStore<GlobalState>(() => ({ ...INITIAL_GLOBAL_STATE, workspaces: [workspace] }))
    await bootstrapGlobal(store.setState, store.getState, nativeClient({ listProjects: async () => ({ items: [], errors: {} }), listWorkspaces: async () => ({ items: [], errors: {} }) }))
    expect(store.getState().projects).toEqual([])
    expect(store.getState().workspaces).toEqual([])
    expect(store.getState().error).toBeUndefined()
  })
})
