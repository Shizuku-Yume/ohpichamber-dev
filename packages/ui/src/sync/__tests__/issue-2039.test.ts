import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import type { Session } from "@openchamber/agent-contract"
import { canonicalClient } from "@/api/canonicalClient"
import { cyclePermissionMode } from "../../components/chat/permissionAutoAccept"
import { ensureChatsRootDirectory } from "@/lib/chatDirectories"
import { hostFilesystem } from '@/lib/host-filesystem'
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from "@/lib/runtime-switch"
import * as branchNames from "@/lib/git/branchNameGenerator"
import * as openchamberConfig from "@/lib/openchamberConfig"
import * as persistence from "@/lib/persistence"
import { createProjectIdFromPath } from "@/lib/projectId"
import * as trustConfirmation from "@/lib/sharedTrustConfirmation"
import * as worktreeCreate from "@/lib/worktrees/worktreeCreate"
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from "@/stores/globalSessions"
import { useConfigStore } from "@/stores/useConfigStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useCommandsStore } from "@/stores/useCommandsStore"
import { useSkillsStore } from "@/stores/useSkillsStore"
import { usePermissionStore } from "@/stores/permissionStore"
import { useSessionGoalArmStore } from "@/stores/useSessionGoalArmStore"
import { getDeferredSafeStorage } from "@/stores/utils/safeStorage"
import { ChildStoreManager } from "../child-store"
import { setActionRefs } from "../session-actions"
import { setImperativeSessionMessageLoader } from "../session-message-loader"
import { subscribeSessionAdmission } from "../session-admission"
import { nativeSnapshot } from "../session-message-loader-test-fixtures"
import { setSyncRefs } from "../sync-refs"
import { materializeOpenDraftSession, useSessionUIStore } from "../session-ui-store"
import { useSelectionStore } from "../selection-store"
import { useSessionWorktreeStore } from "../session-worktree-store"

const originalRuntime = getRuntimeKey()
const originalBase = getRuntimeApiBaseUrl()
const originalUI = useSessionUIStore.getState()
const originalConfig = useConfigStore.getState()
const originalDirectory = useDirectoryStore.getState()
const originalGlobal = useGlobalSessionsStore.getState()
const originalProjects = useProjectsStore.getState()
const originalCommands = useCommandsStore.getState()
const originalSkills = useSkillsStore.getState()
const originalPermission = usePermissionStore.getState()
const originalGoal = useSessionGoalArmStore.getState()
const originalSelection = useSelectionStore.getState()
const originalWorktrees = useSessionWorktreeStore.getState()
const storage = getDeferredSafeStorage()
const draftTargetKey = "oc.chatInput.lastDraftTarget"
const originalDraftTarget = storage.getItem(draftTargetKey)
type CreateRequest = Parameters<typeof canonicalClient.createSession>[0]
type DefaultSelection = Parameters<typeof originalConfig.applyDefaultModelAgentSelection>[0]
const createSessionCalls: Array<CreateRequest & { directory: string | null }> = []
const resolveWorkspaceCalls: string[] = []
const permissionAutoAcceptCalls: Array<Parameters<typeof originalPermission.setSessionMode>> = []
const savedVariantCalls: Array<string | null | undefined> = []
const savedAgentModelCalls: Array<Parameters<typeof originalSelection.saveAgentModelForSession>> = []
const applyDefaultModelAgentSelectionCalls: DefaultSelection[] = []
const activateDirectoryCalls: Array<string | null | undefined> = []
const activationOptions: Array<{ preserveManualModel?: boolean } | undefined> = []
const createdWorktreeProjects: Array<{ id: string; path: string }> = []
let activationPending: Promise<void> | undefined
let manager: ChildStoreManager
let runtimeNumber = 0
const nativeSession = (sessionId: string, workspaceId = "workspace-issue-2039"): Session => ({
  ...nativeSnapshot(sessionId, []).session,
  projectId: "project-1",
  workspaceId,
  metadata: null,
  metadataRevision: "0",
  archiveRevision: "0",
})

beforeEach(async () => {
  switchRuntimeEndpoint({ apiBaseUrl: "https://issue-2039.test", runtimeKey: `issue-2039-${++runtimeNumber}` })
  storage.removeItem(draftTargetKey)
  for (const calls of [createSessionCalls, resolveWorkspaceCalls, permissionAutoAcceptCalls,
    savedVariantCalls, savedAgentModelCalls, applyDefaultModelAgentSelectionCalls,
    activateDirectoryCalls, activationOptions, createdWorktreeProjects]) calls.length = 0
  activationPending = undefined
  resetWorkspaceDirectories()
  useGlobalSessionsStore.getState().resetForRuntimeSwitch()
  useProjectsStore.setState({ projects: [], activeProjectId: null })
  useCommandsStore.setState({ commands: [], commandsByDirectory: {} })
  useSkillsStore.setState({ skills: [], skillsByDirectory: {} })
  usePermissionStore.getState().reset()
  useSessionGoalArmStore.getState().setArmed(false, null)
  useSessionWorktreeStore.setState({ attachments: new Map() })
  useSelectionStore.setState({
    sessionModelSelections: new Map(), sessionAgentSelections: new Map(),
    sessionFollowedAgents: new Map(), sessionFollowedModels: new Map(),
    sessionAgentModelSelections: new Map(), agentModelVariantSelections: new Map(), lastUsedProvider: null,
  })
  useConfigStore.setState({
    currentAgentName: "agent-default", currentProviderId: "provider", currentModelId: "model",
    currentVariantSelection: { override: undefined, inherited: "high" },
    selectionSource: "auto", agentSelectionSource: "auto",
    isConnected: true, hasEverConnected: true,
  })
  useDirectoryStore.setState({ currentDirectory: "", directoryHistory: [], historyIndex: -1, homeDirectory: "/home/test", isHomeReady: true })
  useSessionUIStore.setState({
    currentSessionId: null, currentSessionDirectory: null, materializedDraftSessionId: null,
    newSessionDraft: { draftId: 0, open: false, directoryOverride: null, parentID: null, target: "chat" },
    availableWorktreesByProject: new Map(), availableWorktrees: [], worktreeMetadata: new Map(), error: null,
  })
  manager = new ChildStoreManager()
  setSyncRefs(manager, "/repo")
  setActionRefs(manager, () => useDirectoryStore.getState().currentDirectory)
  setImperativeSessionMessageLoader(null)
  // Config catalog resolution remains a Task 15 leaf. Spy on its existing
  // action boundary while exercising the real draft, selection and sync stores.
  spyOn(useConfigStore.getState(), "activateDirectory").mockImplementation(async (directory, options) => {
    activateDirectoryCalls.push(directory)
    activationOptions.push(options)
    await activationPending
  })
  spyOn(useConfigStore.getState(), "applyDefaultModelAgentSelection").mockImplementation(selection => {
    applyDefaultModelAgentSelectionCalls.push(selection)
  })
  spyOn(useSelectionStore.getState(), "saveAgentModelForSession").mockImplementation((...selection) => {
    savedAgentModelCalls.push(selection)
    originalSelection.saveAgentModelForSession(...selection)
  })
  spyOn(useSelectionStore.getState(), "saveAgentModelVariantForSession").mockImplementation((...selection) => {
    savedVariantCalls.push(selection[4])
    originalSelection.saveAgentModelVariantForSession(...selection)
  })
  spyOn(usePermissionStore.getState(), "setSessionMode").mockImplementation(async (sessionId, mode) => {
    permissionAutoAcceptCalls.push([sessionId, mode])
    await originalPermission.setSessionMode(sessionId, mode)
  })
  spyOn(hostFilesystem, "getFilesystemHomeInfo").mockResolvedValue({ home: "/home/test" })
  spyOn(hostFilesystem, "createDirectory").mockImplementation(async path => ({ success: true, path }))
  spyOn(hostFilesystem, "getDirectoryAvailability").mockResolvedValue("available")
  spyOn(hostFilesystem, "getDirectory").mockReturnValue(undefined)
  spyOn(hostFilesystem, "setDirectory").mockImplementation(() => undefined)
  await ensureChatsRootDirectory()
  spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).includes("/auth/url-token")) return Response.json({ token: "issue-token", expiresAt: 999 })
    if (String(input).includes("/api/permission-auto-accept/sessions/") && init?.method === "PUT") {
      return Response.json({ sessions: { ses_issue_2039: true }, modes: { ses_issue_2039: "safety" }, revision: 1 })
    }
    throw new Error(`Unexpected network request: ${String(input)}`)
  })
  spyOn(canonicalClient, "resolveWorkspace").mockImplementation(async directory => {
    resolveWorkspaceCalls.push(directory)
    return { workspaceId: "workspace-issue-2039", projectId: "project-1", name: "Workspace", displayPath: "." }
  })
  spyOn(canonicalClient, "createSession").mockImplementation(async request => {
    createSessionCalls.push({ ...request, directory: resolveWorkspaceCalls.at(-1) ?? null })
    return { session: nativeSession("ses_issue_2039", request.workspaceId) }
  })
  spyOn(branchNames, "generateBranchName").mockReturnValue("generated-branch")
  spyOn(openchamberConfig, "getWorktreeSetupWaitEnabled").mockResolvedValue(false)
  spyOn(trustConfirmation, "resolveWorktreeSetupCommands").mockResolvedValue([])
  spyOn(worktreeCreate, "createWorktreeWithDefaults").mockImplementation(async project => {
    createdWorktreeProjects.push(project)
    return {
      source: "sdk", name: "generated-branch", path: "/worktrees/generated-branch",
      projectDirectory: project.path, branch: "generated-branch", label: "generated-branch"
    }
  })
})

afterEach(() => {
  setImperativeSessionMessageLoader(null)
  manager.disposeAll()
  mock.restore()
  resetWorkspaceDirectories()
  useSessionUIStore.setState(originalUI)
  useConfigStore.setState(originalConfig)
  useDirectoryStore.setState(originalDirectory)
  useGlobalSessionsStore.setState(originalGlobal)
  useProjectsStore.setState(originalProjects)
  useCommandsStore.setState(originalCommands)
  useSkillsStore.setState(originalSkills)
  usePermissionStore.setState(originalPermission)
  useSessionGoalArmStore.setState(originalGoal)
  useSelectionStore.setState(originalSelection)
  useSessionWorktreeStore.setState(originalWorktrees)
  if (originalDraftTarget === null) storage.removeItem(draftTargetKey)
  else storage.setItem(draftTargetKey, originalDraftTarget)
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime })
})

describe("issue 2039 draft auto-accept", () => {
  test("keeps the initial automatic draft selected after Host path normalization and delayed project discovery", async () => {
    const discoveryStarted = Promise.withResolvers<void>()
    const discovered = Promise.withResolvers<void>()
    spyOn(persistence, "updateDesktopSettings").mockImplementation(async changes => {
      if (!changes.projects) return { ok: true }
      const settings = {
        ...changes,
        projects: changes.projects.map(project => {
          const path = project.path.replace(/^\/tmp\//, "/private/tmp/")
          return { ...project, path, id: createProjectIdFromPath(path) }
        }),
        activeProjectId: changes.activeProjectId
          ? createProjectIdFromPath(changes.projects.find(project => project.id === changes.activeProjectId)!.path.replace(/^\/tmp\//, "/private/tmp/"))
          : changes.activeProjectId,
      }
      useProjectsStore.getState().synchronizeFromSettings(settings, { adoptActiveProject: false })
      return { ok: true, settings }
    })
    spyOn(useProjectsStore.getState(), "discoverProjectIcon").mockResolvedValue({ status: "no-favicon-found" })
    spyOn(useGlobalSessionsStore.getState(), "refreshSessionsForDirectories").mockImplementation(async () => {
      discoveryStarted.resolve()
      await discovered.promise
      return { activeSessions: [], archivedSessions: [] }
    })

    const adding = useProjectsStore.getState().addProject("/tmp/first-project")
    await discoveryStarted.promise
    useSessionUIStore.getState().openNewSessionDraft({ automatic: true })
    expect(useGlobalSessionsStore.getState().entityById.size).toBe(0)
    discovered.resolve()
    const project = await adding
    if (!project) throw new Error("Project was not added")
    useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: project.id, directoryOverride: project.path })

    const stopAdmission = subscribeSessionAdmission()
    try {
      const created = await materializeOpenDraftSession({ providerId: "provider", modelId: "model" })

      expect(created?.sessionId).toBe("ses_issue_2039")
      expect(useSessionUIStore.getState().currentSessionId).toBe("ses_issue_2039")
      expect(useSessionUIStore.getState().currentSessionDirectory).toBe("/private/tmp/first-project")
      expect(resolveWorkspaceCalls.length).toBeGreaterThan(0)
      expect([...new Set(resolveWorkspaceCalls)]).toEqual(["/private/tmp/first-project"])
      expect(useProjectsStore.getState().activeProjectId).toBe(project.id)
    } finally {
      stopAdmission()
    }
  })

  test("cycles the draft mode before a session exists", () => {
    const setDraftPermissionMode = mock(() => undefined)
    const setSessionMode = mock(async () => undefined)
    const onOpenSessionFirst = mock(() => undefined)
    const onToggleFailed = mock(() => undefined)

    cyclePermissionMode({
      permissionScopeSessionId: null,
      newSessionDraftOpen: true,
      currentMode: "ask",
      safetyAvailable: true,
      setDraftPermissionMode,
      setSessionMode,
      onOpenSessionFirst,
      onToggleFailed,
    })

    expect(setDraftPermissionMode).toHaveBeenCalledTimes(1)
    expect(setDraftPermissionMode).toHaveBeenCalledWith("safety")
    expect(setSessionMode).not.toHaveBeenCalled()
    expect(onOpenSessionFirst).not.toHaveBeenCalled()
    expect(onToggleFailed).not.toHaveBeenCalled()
  })

  test("guards the toggle when no draft is open", () => {
    const setDraftPermissionMode = mock(() => undefined)
    const setSessionMode = mock(async () => undefined)
    const onOpenSessionFirst = mock(() => undefined)
    const onToggleFailed = mock(() => undefined)

    cyclePermissionMode({
      permissionScopeSessionId: null,
      newSessionDraftOpen: false,
      currentMode: "ask",
      safetyAvailable: true,
      setDraftPermissionMode,
      setSessionMode,
      onOpenSessionFirst,
      onToggleFailed,
    })

    expect(setDraftPermissionMode).not.toHaveBeenCalled()
    expect(setSessionMode).not.toHaveBeenCalled()
    expect(onOpenSessionFirst).toHaveBeenCalledTimes(1)
    expect(onToggleFailed).not.toHaveBeenCalled()
  })


  test("stores auto-accept in the draft and applies it when the session materializes", async () => {
    useSessionUIStore.getState().openNewSessionDraft()

    // No choice yet: the server writes the default from Settings.
    expect(useSessionUIStore.getState().newSessionDraft.permissionMode).toBeUndefined()

    useSessionUIStore.getState().setDraftPermissionMode("safety")

    expect(useSessionUIStore.getState().newSessionDraft.permissionMode).toBe("safety")

    const result = await materializeOpenDraftSession({
      providerId: "provider",
      modelId: "model",
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(result?.sessionId).toBe("ses_issue_2039")
    expect(createSessionCalls).toHaveLength(1)
    expect(permissionAutoAcceptCalls).toEqual([["ses_issue_2039", "safety"]])
    expect(usePermissionStore.getState().modes.ses_issue_2039).toBe("safety")
    expect(createSessionCalls[0]?.options).toMatchObject({ providerId: "provider", modelId: "model" })
    expect(useSessionUIStore.getState().currentSessionId).toBe("ses_issue_2039")
  })

  test("stores only an explicit draft variant as the session override", async () => {
    useSessionUIStore.getState().openNewSessionDraft()
    await materializeOpenDraftSession({
      providerId: "provider",
      modelId: "model",
      agent: "agent-default",
      variant: "high",
    })

    expect(savedVariantCalls).toEqual([undefined])
    expect(useSelectionStore.getState().getAgentModelVariantForSession("ses_issue_2039", "agent-default", "provider", "model")).toBeUndefined()

    useConfigStore.setState({ currentVariantSelection: { override: "high", inherited: "high" } })
    useSessionUIStore.getState().openNewSessionDraft()
    await materializeOpenDraftSession({
      providerId: "provider",
      modelId: "model",
      agent: "agent-default",
      variant: "high",
    })

    expect(savedVariantCalls).toEqual([undefined, "high"])
    expect(useSelectionStore.getState().getAgentModelVariantForSession("ses_issue_2039", "agent-default", "provider", "model")).toBe("high")
  })

  test("stores a draft agent model only after an explicit model choice", async () => {
    useSessionUIStore.getState().openNewSessionDraft()
    await materializeOpenDraftSession({
      providerId: "provider",
      modelId: "model",
      agent: "agent-default",
      variant: "high",
    })

    expect(savedAgentModelCalls).toEqual([])
    expect(useSelectionStore.getState().getAgentModelForSession("ses_issue_2039", "agent-default")).toBeNull()

    useConfigStore.setState({ selectionSource: "manual" })
    useSessionUIStore.getState().openNewSessionDraft()
    await materializeOpenDraftSession({
      providerId: "provider",
      modelId: "other-model",
      agent: "agent-default",
      variant: "high",
    })

    expect(savedAgentModelCalls).toEqual([
      ["ses_issue_2039", "agent-default", "provider", "other-model"],
    ])
    expect(useSelectionStore.getState().getAgentModelForSession("ses_issue_2039", "agent-default")).toEqual({ providerId: "provider", modelId: "other-model" })
  })

  test("preserves choices when a draft keeps the same project", async () => {
    const project = {
      id: "project-1",
      path: "/repo",
      defaultAgent: "agent-project",
      defaultModel: "model-project",
      defaultVariant: "variant-project",
    }
    useProjectsStore.setState({ projects: [project] })

    useSessionUIStore.getState().openNewSessionDraft({
      target: "project",
      selectedProjectId: project.id,
      directoryOverride: project.path,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    applyDefaultModelAgentSelectionCalls.length = 0
    activateDirectoryCalls.length = 0
    activationOptions.length = 0

    useSessionUIStore.getState().setNewSessionDraftTarget({
      projectId: project.id,
      directoryOverride: project.path,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(activateDirectoryCalls).toEqual([])
    expect(applyDefaultModelAgentSelectionCalls).toEqual([])
  })

  test("loads the selected worktree's config when a project draft changes directories", () => {
    const project = { id: "project-1", path: "/repo" }
    useProjectsStore.setState({ projects: [project] })

    useSessionUIStore.getState().openNewSessionDraft({
      target: "project",
      selectedProjectId: project.id,
      directoryOverride: project.path,
    })
    activateDirectoryCalls.length = 0
    activationOptions.length = 0

    useSessionUIStore.getState().setNewSessionDraftTarget({
      projectId: project.id,
      directoryOverride: "/repo-worktree",
    })

    expect(activateDirectoryCalls).toEqual(["/repo-worktree"])
    expect(activationOptions).toEqual([{ preserveManualModel: true }])
  })

  test("reapplies project defaults when a project draft target is overridden", async () => {
    const project = {
      id: "project-1",
      path: "/repo",
      defaultAgent: "agent-project",
      defaultModel: "model-project",
      defaultVariant: "variant-project",
    }
    useProjectsStore.setState({ projects: [project] })

    useSessionUIStore.getState().openNewSessionDraft()
    await new Promise((resolve) => setTimeout(resolve, 0))
    applyDefaultModelAgentSelectionCalls.length = 0
    activateDirectoryCalls.length = 0

    useSessionUIStore.getState().overrideNewSessionDraftTarget({
      target: "project",
      selectedProjectId: project.id,
      directoryOverride: project.path,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(activateDirectoryCalls).toEqual(["/repo"])
    expect(applyDefaultModelAgentSelectionCalls.at(-1)).toEqual({
      projectDefaultModel: "model-project",
      projectDefaultVariant: "variant-project",
    })
  })

  test("late activation preserves a manual pick and same-project worktree refinements", async () => {
    let finish!: () => void
    activationPending = new Promise<void>((resolve) => { finish = resolve })
    useProjectsStore.setState({ projects: [{ id: 'project-1', path: '/repo' }] })
    useSessionUIStore.getState().openNewSessionDraft({ target: 'project', selectedProjectId: 'project-1', directoryOverride: '/repo' })
    expect(applyDefaultModelAgentSelectionCalls).toHaveLength(1)
    useConfigStore.setState({ selectionSource: 'manual' })
    useSessionUIStore.getState().overrideNewSessionDraftTarget({ directoryOverride: '/worktree', pendingWorktreeRequestId: 'request' })
    finish()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(applyDefaultModelAgentSelectionCalls).toHaveLength(1)
  })

  test("moving a prepared chat draft to a project discards its prepared session before deleting the folder", async () => {
    const order: string[] = []
    spyOn(canonicalClient, "prepareSession").mockImplementation(async () => ({ ok: true, sessionId: "prepared" }))
    spyOn(canonicalClient, "discardPreparedSession").mockImplementation(async ({ workspaceId }) => {
      order.push(`discard:${workspaceId}`)
      return { ok: true }
    })
    spyOn(globalThis, "fetch").mockRestore()
    spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/api/fs/delete")) {
        order.push("delete")
        return Response.json({ success: true })
      }
      throw new Error(`Unexpected network request: ${String(input)}`)
    })
    useProjectsStore.setState({ projects: [{ id: "project-1", path: "/repo" }] })
    useSessionUIStore.getState().openNewSessionDraft()
    const directory = await useSessionUIStore.getState().prepareChatDraftDirectory()
    expect(useSessionUIStore.getState().newSessionDraft.preparedChatDirectory).toBe(directory)

    useSessionUIStore.getState().setNewSessionDraftTarget({ projectId: "project-1", directoryOverride: "/repo" })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useSessionUIStore.getState().newSessionDraft.preparedChatDirectory).toBe(null)
    expect(order).toEqual(["discard:workspace-issue-2039", "delete"])
  })

  test("late project activation cannot replace a newer draft target or a closed draft", async () => {
    let finish!: () => void
    activationPending = new Promise<void>((resolve) => { finish = resolve })
    useProjectsStore.setState({ projects: [{ id: 'project-1', path: '/repo' }] })
    useSessionUIStore.getState().openNewSessionDraft({ target: 'project', selectedProjectId: 'project-1', directoryOverride: '/repo' })
    useSessionUIStore.getState().setNewSessionDraftTarget({ projectId: 'openchamber:chats' })
    const appliedBeforeClose = applyDefaultModelAgentSelectionCalls.length
    useSessionUIStore.getState().closeNewSessionDraft()
    finish()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(applyDefaultModelAgentSelectionCalls).toHaveLength(appliedBeforeClose)
  })

  test("reapplies the Chats scope defaults when opening a fresh no-project draft", async () => {
    useSessionUIStore.getState().openNewSessionDraft()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(activateDirectoryCalls).toEqual([null])
    expect(applyDefaultModelAgentSelectionCalls.at(-1)).toEqual({
      projectDefaultAgent: undefined,
      projectDefaultModel: undefined,
      projectDefaultVariant: undefined,
    })
  })

  test("restores project defaults when the next draft restores the previous project target", async () => {
    const project = {
      id: "project-1",
      path: "/repo",
      defaultAgent: "agent-project",
      defaultModel: "model-project",
      defaultVariant: "variant-project",
    }
    useProjectsStore.setState({ projects: [project] })

    useSessionUIStore.getState().openNewSessionDraft({
      target: "project",
      selectedProjectId: project.id,
      directoryOverride: project.path,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await materializeOpenDraftSession({
      providerId: "provider",
      modelId: "model",
      agent: "agent-project",
    })

    applyDefaultModelAgentSelectionCalls.length = 0
    activateDirectoryCalls.length = 0

    useSessionUIStore.getState().openNewSessionDraft()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(activateDirectoryCalls).toEqual(["/repo"])
    expect(applyDefaultModelAgentSelectionCalls.at(-1)).toEqual({
      projectDefaultModel: "model-project",
      projectDefaultVariant: "variant-project",
    })
  })

  test("does not apply draft auto-accept after the draft is closed", async () => {
    useSessionUIStore.getState().openNewSessionDraft()
    useSessionUIStore.getState().setDraftPermissionMode("auto")
    useSessionUIStore.getState().closeNewSessionDraft()

    expect(useSessionUIStore.getState().newSessionDraft.open).toBe(false)
    expect(useSessionUIStore.getState().newSessionDraft.permissionMode === undefined).toBe(true)

    const result = await materializeOpenDraftSession({
      providerId: "provider",
      modelId: "model",
    })

    expect(result).toBeNull()
    expect(createSessionCalls).toHaveLength(0)
    expect(permissionAutoAcceptCalls).toHaveLength(0)
  })

  test("transfers draft project context pins only to the session it creates", async () => {
    useSessionUIStore.getState().openNewSessionDraft({
      projectContextPins: { notes: ["note-a"], plans: [] },
    })
    useSessionUIStore.getState().setDraftProjectContextPin("plan", "plan-a", true)

    await materializeOpenDraftSession({ providerId: "provider", modelId: "model" })

    expect(createSessionCalls[0]?.metadata).toEqual({
      openchamber: {
        project_context_pins: { notes: ["note-a"], plans: ["plan-a"] },
      },
    })
    expect(useSessionUIStore.getState().newSessionDraft.projectContextPins).toBe(undefined)

    useSessionUIStore.getState().openNewSessionDraft()
    await materializeOpenDraftSession({ providerId: "provider", modelId: "model" })

    expect(createSessionCalls[1]?.metadata?.openchamber?.project_context_pins).toBeUndefined()
  })

  test("uses the admitted Host directory after worktree session creation", async () => {
    registerWorkspaceDirectory("workspace-issue-2039", "/canonical/worktree")
    useSessionUIStore.getState().openNewSessionDraft({
      directoryOverride: "/canonical/worktree",
    })

    const result = await materializeOpenDraftSession({
      providerId: "provider",
      modelId: "model",
    })

    expect(resolveWorkspaceCalls).toEqual(["/canonical/worktree"])
    expect(createSessionCalls[0]).toMatchObject({ directory: "/canonical/worktree", workspaceId: "workspace-issue-2039" })
    expect(result?.directory).toBe("/canonical/worktree")
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe("/canonical/worktree")
  })

  test("a draft that never sent does not keep its resolved workspace after it closes", async () => {
    // The per-draft cache must not outlive the draft: a later draft may reuse
    // the same path after the workspace changed, and a stale resolution would
    // admit into the old one.
    spyOn(canonicalClient, "resolveWorkspace").mockRestore()
    let nextWorkspaceId = "workspace-first"
    spyOn(canonicalClient, "resolveWorkspace").mockImplementation(async directory => {
      resolveWorkspaceCalls.push(directory)
      return { workspaceId: nextWorkspaceId, projectId: "project-1", name: "Workspace", displayPath: "." }
    })
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: "/canonical/worktree" })
    await Promise.resolve()
    useSessionUIStore.getState().closeNewSessionDraft()

    nextWorkspaceId = "workspace-second"
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: "/canonical/worktree" })
    await materializeOpenDraftSession({ providerId: "provider", modelId: "model" })

    expect(createSessionCalls[0]?.workspaceId).toBe("workspace-second")
  })

  test("a failed workspace resolution is retried instead of staying cached", async () => {
    spyOn(canonicalClient, "resolveWorkspace").mockRestore()
    let attempt = 0
    spyOn(canonicalClient, "resolveWorkspace").mockImplementation(async directory => {
      resolveWorkspaceCalls.push(directory)
      if (attempt++ === 0) throw new Error("host unavailable")
      return { workspaceId: "workspace-retry", projectId: "project-1", name: "Workspace", displayPath: "." }
    })
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: "/canonical/worktree" })
    await materializeOpenDraftSession({ providerId: "provider", modelId: "model" })

    expect(createSessionCalls[0]?.workspaceId).toBe("workspace-retry")
  })

  test("routes the session by its admitted workspace, not a stale requested-path attachment", async () => {
    registerWorkspaceDirectory("workspace-issue-2039", "/canonical/worktree")
    useSessionUIStore.getState().openNewSessionDraft({
      directoryOverride: "/canonical/worktree",
    })

    const created = await materializeOpenDraftSession({
      providerId: "provider",
      modelId: "model",
    })
    const sessionId = created?.sessionId ?? ""

    // The attachment remembers the requested path. The admitted workspace
    // association, not a private filesystem field on Session, owns routing.
    useSessionUIStore.getState().setWorktreeMetadata(sessionId, {
      path: "/requested/worktree",
      projectDirectory: "/repo",
      branch: "feature",
      label: "feature",
    })

    expect(useSessionUIStore.getState().getDirectoryForSession(sessionId)).toBe("/canonical/worktree")
  })
})

describe("assistant answer worktree routing", () => {
  test("reports session creation failure instead of completing silently", async () => {
    spyOn(canonicalClient, "createSession").mockRejectedValue(new Error("admission failed"))
    await expect(useSessionUIStore.getState().createSessionFromAssistantMessage({
      sessionId: "source-session",
      directory: "/repo",
      text: "Implement the plan",
    }, {
      providerId: "provider",
      modelId: "model",
      variant: "",
      instructions: "Follow the answer",
    })).rejects.toThrow("Failed to create session")
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
  })

  test("creates a sibling worktree from the captured source worktree directory", async () => {
    useProjectsStore.setState({
      projects: [
        { id: "project", path: "/repo" },
        { id: "source-worktree", path: "/worktrees/source" },
      ]
    })
    const sourceWorktree = {
      path: "/worktrees/source", projectDirectory: "/repo", branch: "source", label: "source",
    }
    useSessionUIStore.setState({
      availableWorktreesByProject: new Map([["/repo", [sourceWorktree]]]),
      worktreeMetadata: new Map([["source-session", sourceWorktree]]),
    })
    const send = spyOn(useSessionUIStore.getState(), "sendMessage").mockResolvedValue(undefined)
    await useSessionUIStore.getState().createSessionFromAssistantMessage({
      sessionId: "source-session", directory: "/worktrees/source", text: "Implement the plan",
    }, {
      providerId: "provider", modelId: "model", variant: "",
      instructions: "Follow the answer", createWorktree: true,
    })
    expect(createdWorktreeProjects).toEqual([{ id: "project", path: "/repo" }])
    expect(createSessionCalls[0]?.directory).toBe("/worktrees/generated-branch")
    expect(createSessionCalls[0]?.options).toMatchObject({ providerId: "provider", modelId: "model", agentId: null })
    expect(useSessionUIStore.getState().getDirectoryForSession("ses_issue_2039")).toBe("/worktrees/generated-branch")
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[9]?.target).toEqual({
      runtimeKey: getRuntimeKey(), sessionId: "ses_issue_2039", directory: "/worktrees/generated-branch",
    })
  })
  test("starts an OMP goal before the fork answer prompt", async () => {
    const order: string[] = []
    const goal = spyOn(canonicalClient, "goal").mockImplementation(async (sessionId, input) => {
      order.push("goal")
      return { type: "goal", mode: { kind: "goal", status: "active", objective: input.objective ?? "", tokenBudget: input.tokenBudget ?? null, tokensUsed: 0 } }
    })
    spyOn(canonicalClient, "createRun").mockImplementation(async sessionId => {
      order.push("prompt")
      return { run: { runId: "goal-run", sessionId, status: "running" as const, origin: "host" as const, createdAt: 1 } }
    })
    await useSessionUIStore.getState().createSessionFromAssistantMessage({
      sessionId: "source-session", directory: "/repo", text: "Implement the requested feature",
    }, {
      providerId: "provider", modelId: "model", variant: "", instructions: "Use the answer as the assignment", runAsGoal: true,
    })
    expect(goal).toHaveBeenCalledTimes(1)
    expect(goal.mock.calls[0]?.[1].objective).toContain("Implement the requested feature")
    expect(order).toEqual(["goal"])
    expect(canonicalClient.createRun).not.toHaveBeenCalled()
  })
})
