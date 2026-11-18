import { describe, expect, spyOn, test } from "bun:test"
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import type { CanonicalClient } from "@/api/canonicalClient"
import type { Message, Session, SessionSnapshot, ShellSnapshot, Workspace } from '@openchamber/agent-contract'
import { SyncProvider, useChildStoreManager, useSyncDirectory, useSyncRuntime, handleEvents } from "./sync-context"
import { useGlobalSessionStatusStore, applyGlobalSessionStatusEvents } from "./global-session-status"
import { installSessionSnapshot } from "./event-reducer"
import { usePrefetchSessionMessages } from "./use-sync"
import { ChildStoreManager } from "./child-store"
import { installHookTestDom } from "../components/session/sidebar/test-utils/testDom"
import { useSessionUIStore } from "./session-ui-store"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useSubagentsStore } from "@/stores/useSubagentsStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { deferred, nativeClient as createCanonicalClient, nativeSnapshot } from './session-message-loader-test-fixtures'
import { fileTreeChanges, subscribeFileTreeChanges } from "@/lib/fileTreeChanges"

const workspace = (directory: string): Workspace => ({ workspaceId: `workspace-${directory.slice(1).replaceAll('/', '-')}`, projectId: 'project-1', name: 'Workspace', displayPath: '.' })
const shellSnapshot = (workspaceId: string): ShellSnapshot => ({ scope: { kind: 'workspace', workspaceId }, epoch: 'shell-epoch', revision: '0', running: [], ended: [], recovery: { priorEpochs: 'invalidated' } })
const createNativeClient = (): CanonicalClient => {
  const client = createCanonicalClient()
  client.listProjects = async () => ({ items: [{ projectId: 'project-1', name: 'Project', workspaceIds: [], displayPath: '.' }], errors: {} })
  client.listWorkspaces = async () => ({ items: [], errors: {} })
  client.resolveWorkspace = async (directory: string) => workspace(directory)
  client.listSessions = async () => ({ items: [], errors: {} })
  client.getModels = async (workspaceId: string) => ({ workspaceId, revision: '0', models: [], defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false })
  client.getProviders = async (workspaceId: string) => ({ workspaceId, revision: '0', providers: [] })
  client.getAgents = async (workspaceId: string) => ({ workspaceId, revision: '0', agents: [] })
  client.getShellSnapshot = async (scope) => { if (scope.kind !== 'workspace') throw new Error('Selection fixture only uses workspace shell scope'); return shellSnapshot(scope.workspaceId) }
  client.subscribeSessionEvents = () => () => {}
  return client
}
const session = (sessionId: string, workspaceId: string): Session => ({
  sessionId, projectId: 'project-1', workspaceId, displayPath: '.', rootSessionId: sessionId, createdAt: 1, updatedAt: 1, epoch: 'epoch-1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
})

describe("SyncProvider native scope and selection boundaries", () => {
  test("keeps a selected native transcript whole after directory adoption", async () => {
    const dom = installHookTestDom()
    const root = createRoot(dom.container)
    let manager: ChildStoreManager | undefined
    const Probe = () => { manager = useChildStoreManager(); return null }
    const directory = "/workspace/actual"
    const sessionId = "selected-native"
    // The selected session's folder is a registered project, and the session
    // is in the global index: admission reads that record's directory, so a
    // selection made with a guessed hint survives the real one arriving.
    useProjectsStore.setState({
      projects: [{ id: 'project-1', path: directory, label: 'Workspace' }],
      activeProjectId: 'project-1',
    })
    useGlobalSessionsStore.getState().upsertSession(session(sessionId, 'workspace-actual'))
    try {
      await act(async () => root.render(<SyncProvider client={createNativeClient()} directory="/workspace/guess"><Probe /></SyncProvider>))
      if (!manager) throw new Error("Directory manager was not mounted")
      const store = manager.ensureChild(directory, { bootstrap: false })
      const messages: Message[] = Array.from({ length: 10 }, (_, index) => ({ messageId: `${sessionId}-${index}`, sessionId, turnId: "turn-1", role: "user", createdAt: index, parts: [{ type: "text", partId: `part-${index}`, content: `message-${index}` }] }))
      store.setState({ session: [session(sessionId, "workspace-actual")], sessionTotal: 1, message: { [sessionId]: messages } })
      await act(async () => { useSessionUIStore.getState().setCurrentSession(sessionId, "/workspace/guess"); useSessionUIStore.getState().setSessionDirectory(sessionId, directory); await Promise.resolve() })
      expect(useSessionUIStore.getState().currentSessionDirectory).toBe(directory)
      expect(store.getState().message[sessionId]).toHaveLength(10)
      await act(async () => { useSessionUIStore.getState().setCurrentSession(null); await Promise.resolve() })
      expect(store.getState().message[sessionId]).toHaveLength(10)
    } finally {
      useProjectsStore.setState({ projects: [], activeProjectId: null })
      useSessionUIStore.getState().setCurrentSession(null)
      await act(async () => root.unmount())
      dom.restore()
    }
  })

  test("keeps runtime-only prefetch consumers stable when only the current directory changes", async () => {
    const dom = installHookTestDom()
    const root = createRoot(dom.container)
    let runtimeRenders = 0
    const client = createNativeClient()
    let directoryRenders = 0
    let callback: unknown
    const RuntimeConsumer = React.memo(() => { callback = usePrefetchSessionMessages(); runtimeRenders += 1; return null })
    const DirectoryConsumer = () => { useSyncDirectory(); directoryRenders += 1; return null }
    try {
      await act(async () => root.render(<SyncProvider client={client} directory="/workspace/a"><RuntimeConsumer /><DirectoryConsumer /></SyncProvider>))
      const initialCallback = callback
      await act(async () => root.render(<SyncProvider client={client} directory="/workspace/b"><RuntimeConsumer /><DirectoryConsumer /></SyncProvider>))
      expect(runtimeRenders).toBe(1)
      expect(callback).toBe(initialCallback)
      expect(directoryRenders).toBe(2)
    } finally {
      await act(async () => root.unmount())
      dom.restore()
    }
  })

  test("directory discovery preserves mutations newer than its request", async () => {
    const dom = installHookTestDom()
    const root = createRoot(dom.container)
    const directory = "/workspace/revision-race"
    const resolved = workspace(directory)
    const pending = deferred<{ items: Session[]; errors: Record<string, string> }>()
    const client = createNativeClient()
    client.listSessions = () => pending.promise
    let manager: ChildStoreManager | undefined
    const Probe = () => { manager = useChildStoreManager(); return null }
    try {
      await act(async () => root.render(<SyncProvider client={client} directory={directory}><Probe /></SyncProvider>))
      if (!manager) throw new Error("Directory manager was not mounted")
      const store = manager.ensureChild(directory, { bootstrap: false })
      const stale = session("mutated-session", resolved.workspaceId)
      const current = { ...stale, title: "Local mutation", metadata: {}, metadataRevision: "2" }
      store.setState({ session: [current], sessionRevision: 1, sessionEventRevision: { [current.sessionId]: 1 } })
      await act(async () => { pending.resolve({ items: [stale], errors: {} }); await Promise.resolve() })
      expect(store.getState().session[0]).toBe(current)
      expect(store.getState().session_status[current.sessionId]).toBe("idle")
      expect(store.getState().sessionStatusReady).toBe(true)
    } finally {
      await act(async () => root.unmount())
      dom.restore()
    }
  })
  test("late idle discovery preserves an accepted live run snapshot", async () => {
    const dom = installHookTestDom()
    const root = createRoot(dom.container)
    const directory = "/workspace/live-authority"
    const resolved = workspace(directory)
    const listed = session("live-session", resolved.workspaceId)
    const pending = deferred<{ items: Session[]; errors: Record<string, string> }>()
    const client = createNativeClient()
    client.listSessions = () => pending.promise
    const sibling = { ...session("materializing-sibling", resolved.workspaceId), runtimeStatus: "running" as const, activeRunId: "sibling-run" }
    const materializing = deferred<SessionSnapshot>()
    const materializationStarted = deferred<void>()
    client.getSnapshot = () => { materializationStarted.resolve(); return materializing.promise }
    let manager: ChildStoreManager | undefined
    const Probe = () => { manager = useChildStoreManager(); return null }
    try {
      await act(async () => root.render(<SyncProvider client={client} directory={directory}><Probe /></SyncProvider>))
      if (!manager) throw new Error("Directory manager was not mounted")
      const store = manager.ensureChild(directory, { bootstrap: false })
      const initial = { ...nativeSnapshot(listed.sessionId), session: listed, cursor: `${listed.epoch}:0` }
      store.setState((state) => installSessionSnapshot(state, initial))
      await act(async () => {
        pending.resolve({ items: [listed, sibling], errors: {} })
        await materializationStarted.promise
        expect(handleEvents({ directory, sessionId: listed.sessionId }, [{ type: "run.started", sessionId: listed.sessionId, epoch: listed.epoch, sequence: "1", timestamp: 2, runId: "live-run", createdAt: 2 }], manager!)).toBe(true)
        materializing.resolve({ ...nativeSnapshot(sibling.sessionId), session: sibling, cursor: `${sibling.epoch}:0`, activeRun: { runId: "sibling-run", sessionId: sibling.sessionId, status: "running", origin: "host", createdAt: 1 } })
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(store.getState().session_status[listed.sessionId]).toBe("running")
      expect(store.getState().snapshot[listed.sessionId]?.session.activeRunId).toBe("live-run")
      expect(useGlobalSessionStatusStore.getState().activeSessionIds.has(listed.sessionId)).toBe(true)
      applyGlobalSessionStatusEvents(directory, [{ type: "run.completed", sessionId: listed.sessionId, epoch: listed.epoch, sequence: "2", timestamp: 3, runId: "older-run", finishedAt: 3 }])
      expect(useGlobalSessionStatusStore.getState().activeSessionIds.has(listed.sessionId)).toBe(true)
    } finally {
      await act(async () => root.unmount())
      dom.restore()
    }
  })

  test("polling preserves blocked live state, unavailable fences, and terminal run clearing", async () => {
    const dom = installHookTestDom()
    const root = createRoot(dom.container)
    const directory = "/workspace/poll-authority"
    const listed = session("poll-live-session", workspace(directory).workspaceId)
    const sibling = session("poll-sibling", listed.workspaceId)
    const client = createNativeClient()
    let discoveries = 0
    client.listSessions = async () => { discoveries += 1; return { items: [listed, sibling], errors: {} } }
    let poll: (() => void) | undefined
    const interval = spyOn(globalThis, "setInterval")
    let manager: ChildStoreManager | undefined
    const Probe = () => { manager = useChildStoreManager(); return null }
    try {
      await act(async () => root.render(<SyncProvider client={client} directory={directory}><Probe /></SyncProvider>))
      const pollCall = interval.mock.calls.find((call) => call[1] === 15_000)
      if (pollCall) poll = pollCall[0]
      if (!manager || !poll) throw new Error("Discovery poll was not mounted")
      const store = manager.ensureChild(directory, { bootstrap: false })
      manager.pin(directory)
      store.setState((state) => installSessionSnapshot(state, { ...nativeSnapshot(listed.sessionId), session: listed, cursor: `${listed.epoch}:0` }))
      const target = { directory, sessionId: listed.sessionId }
      expect(handleEvents(target, [
        { type: "run.started", sessionId: listed.sessionId, epoch: listed.epoch, sequence: "1", timestamp: 2, runId: "poll-run", createdAt: 2 },
        { type: "session.status", sessionId: listed.sessionId, epoch: listed.epoch, sequence: "2", timestamp: 3, runtimeStatus: "awaiting_approval", activeRunId: "poll-run" },
      ], manager)).toBe(true)
      const before = discoveries
      await act(async () => { poll!(); await Promise.resolve(); await Promise.resolve() })
      expect(discoveries).toBe(before + 1)
      expect(store.getState().session_status[listed.sessionId]).toBe("awaiting_approval")
      expect(store.getState().snapshot[listed.sessionId]?.session.activeRunId).toBe("poll-run")
      expect(store.getState().session.map((item) => item.sessionId)).toEqual([listed.sessionId, sibling.sessionId])
      expect(useGlobalSessionsStore.getState().activeSessions.some((item) => item.sessionId === sibling.sessionId)).toBe(true)
      expect(useGlobalSessionStatusStore.getState().statusById.get(listed.sessionId)?.status).toBe("awaiting_approval")
      store.setState({ sessionStatusInvalidated: { [listed.sessionId]: true }, session_status: { [listed.sessionId]: "unavailable" } })
      await act(async () => { poll!(); await Promise.resolve(); await Promise.resolve() })
      expect(store.getState().session_status[listed.sessionId]).toBe("unavailable")
      expect(useGlobalSessionStatusStore.getState().activeSessionIds.has(listed.sessionId)).toBe(false)
      store.setState((state) => installSessionSnapshot(state, { ...state.snapshot[listed.sessionId]!, session: { ...state.snapshot[listed.sessionId]!.session, headSequence: "3", runtimeStatus: "idle", activeRunId: null }, activeRun: null, cursor: `${listed.epoch}:3` }))
      // A stale discovery row with a run must not resurrect a terminal snapshot.
      client.listSessions = async () => ({ items: [{ ...listed, headSequence: "4", runtimeStatus: "running", activeRunId: "stale-run" }, sibling], errors: {} })
      await act(async () => { poll!(); await Promise.resolve(); await Promise.resolve() })
      expect(store.getState().session_status[listed.sessionId]).toBe("idle")
      expect(store.getState().snapshot[listed.sessionId]?.session.activeRunId).toBeNull()
      expect(useGlobalSessionStatusStore.getState().activeSessionIds.has(listed.sessionId)).toBe(false)
    } finally {
      interval.mockRestore()
      await act(async () => root.unmount())
      dom.restore()
    }
  })

  test("recovery snapshot invalidates the file tree once only after runtime advances", async () => {
    const dom = installHookTestDom()
    const root = createRoot(dom.container)
    const directory = "/workspace/file-tree-recovery"
    const target = { directory, sessionId: "tree-session" }
    const client = createNativeClient()
    const resolved = workspace(directory)
    client.getSnapshot = async (sessionId) => {
      const snapshot = nativeSnapshot(sessionId)
      return { ...snapshot, session: { ...snapshot.session, workspaceId: resolved.workspaceId, projectId: resolved.projectId } }
    }
    let runtime: ReturnType<typeof useSyncRuntime> | undefined
    const Probe = () => { runtime = useSyncRuntime(); return null }
    const changes: Array<{ directory: string; paths?: string[] }> = []
    const stopChanges = subscribeFileTreeChanges((change) => changes.push(change))
    try {
      await act(async () => root.render(<SyncProvider client={client} directory={directory}><Probe /></SyncProvider>))
      if (!runtime) throw new Error("Sync runtime was not mounted")
      const store = runtime.childStores.ensureChild(directory, { bootstrap: false })
      store.setState({ workspace: resolved, project: resolved.projectId })
      fileTreeChanges.reset()
      changes.length = 0

      await act(async () => { await runtime!.messageLoader.ensure(target) })
      const initial = store.getState().snapshot[target.sessionId]
      if (!initial) throw new Error("Initial snapshot was not installed")
      expect(changes).toEqual([])

      await act(async () => { await runtime!.messageLoader.refresh(target, initial, { recovered: true }) })
      expect(changes).toEqual([])

      const gap = {
        type: "part.completed" as const,
        sessionId: target.sessionId,
        epoch: initial.session.epoch,
        sequence: "6",
        timestamp: 3,
        messageId: "message-a",
        part: {
          type: "tool_call" as const, partId: "call-write", toolCallId: "write-1",
          toolName: "write", input: { path: "new.ts" }, status: "completed" as const,
        },
      }
      expect(handleEvents(target, [gap], runtime.childStores)).toBe(false)
      expect(changes).toEqual([])

      const changed = {
        ...initial,
        session: { ...initial.session, headSequence: "6", runtimeStatus: "idle" as const, activeRunId: null },
        cursor: `${initial.session.epoch}:6`,
      }
      await act(async () => { await runtime!.messageLoader.refresh(target, changed, { recovered: true }) })
      expect(changes).toEqual([{ directory }])
    } finally {
      stopChanges()
      fileTreeChanges.reset()
      await act(async () => root.unmount())
      dom.restore()
    }
  })

  test("directory discovery excludes archived rows without deleting the global archive", async () => {
    const dom = installHookTestDom()
    const root = createRoot(dom.container)
    const directory = "/workspace/archive-scope"
    const active = session("active-session", workspace(directory).workspaceId)
    const archived = { ...session("archived-session", active.workspaceId), archivedAt: 20, archiveRevision: "1" }
    const client = createNativeClient()
    client.listSessions = async () => ({ items: [active, archived], errors: {} })
    let manager: ChildStoreManager | undefined
    const Probe = () => { manager = useChildStoreManager(); return null }
    try {
      await act(async () => root.render(<SyncProvider client={client} directory={directory}><Probe /></SyncProvider>))
      if (!manager) throw new Error("Directory manager was not mounted")
      expect(manager.getState(directory)?.session.map((item) => item.sessionId)).toEqual([active.sessionId])
      expect(useGlobalSessionsStore.getState().archivedSessions.find((item) => item.sessionId === archived.sessionId)).toEqual(archived)
    } finally {
      await act(async () => root.unmount())
      dom.restore()
    }
  })
  test("a child session never attaches events or reads the root-only snapshot route", async () => {
    const dom = installHookTestDom()
    const root = createRoot(dom.container)
    const directory = "/workspace/child-boundary"
    const resolved = workspace(directory)
    const parent = session("child-parent", resolved.workspaceId)
    const child = { ...session("child-worker", resolved.workspaceId), parentSessionId: parent.sessionId, rootSessionId: parent.sessionId }
    const client = createNativeClient()
    const streams: string[] = []
    client.subscribeSessionEvents = (sessionId) => { streams.push(sessionId); return () => {} }
    let snapshots = 0
    client.getSnapshot = async () => { snapshots += 1; throw new Error("Root-only route") }
    client.getSessionMetadata = async () => { snapshots += 1; throw new Error("Root-only route") }
    client.getQueue = async () => { snapshots += 1; throw new Error("Root-only route") }
    let runtime: ReturnType<typeof useSyncRuntime> | undefined
    const Probe = () => { runtime = useSyncRuntime(); return null }
    try {
      await act(async () => root.render(<SyncProvider client={client} directory={directory}><Probe /></SyncProvider>))
      if (!runtime) throw new Error("Sync runtime was not mounted")
      const store = runtime.childStores.ensureChild(directory, { bootstrap: false })
      store.setState({ workspace: resolved, project: resolved.projectId, session: [parent, child] })
      // The child is known only through the live subagent index, as a freshly
      // spawned `vibe_spawn` task is before discovery catches up.
      useSubagentsStore.getState().applySubagentUpdate(parent.sessionId, {
        subagentId: "sub-1", parentSessionId: parent.sessionId, childSessionId: child.sessionId, role: "coder", status: "running",
      })
      const target = { directory, sessionId: child.sessionId }
      await act(async () => { await runtime!.messageLoader.ensure(target) })
      expect(snapshots).toBe(0)
      expect(streams).toEqual([])
      expect(runtime.messageLoader.getSnapshot(target)).toMatchObject({ status: "ready", resolved: true })
      // Even a snapshot-shaped record cannot make this provider subscribe.
      store.setState({ snapshot: { [child.sessionId]: { ...nativeSnapshot(child.sessionId), session: child, cursor: `${child.epoch}:0` } } })
      await act(async () => { await runtime!.messageLoader.refresh(target) })
      expect(streams).toEqual([])
    } finally {
      useSubagentsStore.setState({ byParent: {} })
      await act(async () => root.unmount())
      dom.restore()
    }
  })
})
