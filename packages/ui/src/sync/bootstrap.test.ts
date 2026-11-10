import { describe, expect, test } from "bun:test"
import { createStore } from "zustand/vanilla"
import { CanonicalApiError, type CanonicalClient } from "@/api/canonicalClient"
import type { ShellSnapshot, Workspace } from "@openchamber/agent-contract"
import { bootstrapDirectory, bootstrapGlobal } from "./bootstrap"
import { INITIAL_GLOBAL_STATE, INITIAL_STATE, type GlobalState, type State } from "./types"

const workspace: Workspace = { workspaceId: "workspace-1", projectId: "project-1", name: "Workspace", displayPath: "." }
const shellSnapshot = { scope: { kind: "workspace", workspaceId: "workspace-1" }, epoch: "shell-epoch", revision: "0", running: [], ended: [], recovery: { priorEpochs: "invalidated" } } as ShellSnapshot
const inputFor = (client: CanonicalClient, stale: () => boolean = () => false) => {
  const store = createStore<State>(() => ({ ...INITIAL_STATE, path: { directory: "", worktree: "", home: "" } }))
  const patches: Partial<State>[] = []
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

describe("native canonical bootstrap", () => {
  test("resolves the authorized workspace before loading sessions and environment", async () => {
    const calls: string[] = []
    const client = nativeClient({
      resolveWorkspace: async () => { calls.push("resolve"); return workspace },
      getModels: async () => { calls.push("models"); return {} as never },
      getProviders: async () => { calls.push("providers"); return {} as never },
      getAgents: async () => { calls.push("agents"); return {} as never },
      getShellSnapshot: async (scope: unknown) => { calls.push(`shell:${JSON.stringify(scope)}`); return shellSnapshot },
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
