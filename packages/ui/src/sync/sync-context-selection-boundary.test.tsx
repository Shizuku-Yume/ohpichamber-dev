import { describe, expect, test } from "bun:test"
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import type { CanonicalClient } from "@/api/canonicalClient"
import type { Message, Session, ShellSnapshot, Workspace } from '@openchamber/agent-contract'
import { SyncProvider, useChildStoreManager, useSyncDirectory } from "./sync-context"
import { usePrefetchSessionMessages } from "./use-sync"
import { ChildStoreManager } from "./child-store"
import { installHookTestDom } from "../components/session/sidebar/test-utils/testDom"
import { useSessionUIStore } from "./session-ui-store"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { deferred, nativeClient as createCanonicalClient } from './session-message-loader-test-fixtures'

const workspace = (directory: string): Workspace => ({ workspaceId: `workspace-${directory.slice(1).replaceAll('/', '-')}`, projectId: 'project-1', name: 'Workspace', displayPath: '.' })
const shellSnapshot = (workspaceId: string): ShellSnapshot => ({ scope: { kind: 'workspace', workspaceId }, epoch: 'shell-epoch', revision: '0', running: [], ended: [], recovery: { priorEpochs: 'invalidated' } })
const createNativeClient = (): CanonicalClient => {
  const client = createCanonicalClient()
  client.listProjects = async () => ({ items: [{ projectId: 'project-1', name: 'Project', workspaceIds: [], displayPath: '.' }], errors: {} })
  client.listWorkspaces = async () => ({ items: [], errors: {} })
  client.resolveWorkspace = async (directory: string) => workspace(directory)
  client.listSessions = async () => ({ items: [], errors: {} })
  client.getModels = async (workspaceId: string) => ({ workspaceId, revision: '0', models: [] })
  client.getProviders = async (workspaceId: string) => ({ workspaceId, revision: '0', providers: [] })
  client.getAgents = async (workspaceId: string) => ({ workspaceId, revision: '0', agents: [] })
  client.getShellSnapshot = async (scope) => { if (scope.kind !== 'workspace') throw new Error('Selection fixture only uses workspace shell scope'); return shellSnapshot(scope.workspaceId) }
  client.subscribeSessionEvents = () => () => {}
  return client
}
const session = (sessionId: string, workspaceId: string): Session => ({
  sessionId, projectId: 'project-1', workspaceId, displayPath: '.', rootSessionId: sessionId, createdAt: 1, updatedAt: 1, epoch: 'epoch-1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
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
    try {
      await act(async () => root.render(<SyncProvider client={createNativeClient()} directory="/workspace/guess"><Probe /></SyncProvider>))
      if (!manager) throw new Error("Directory manager was not mounted")
      const store = manager.ensureChild(directory, { bootstrap: false })
      const messages: Message[] = Array.from({ length: 10 }, (_, index) => ({ messageId: `${sessionId}-${index}`, sessionId, turnId: "turn-1", role: "user", createdAt: index, parts: [] }))
      store.setState({ session: [session(sessionId, "workspace-actual")], sessionTotal: 1, message: { [sessionId]: messages } })
      await act(async () => { useSessionUIStore.getState().setCurrentSession(sessionId, "/workspace/guess"); useSessionUIStore.getState().setSessionDirectory(sessionId, directory); await Promise.resolve() })
      expect(useSessionUIStore.getState().currentSessionDirectory).toBe(directory)
      expect(store.getState().message[sessionId]).toHaveLength(10)
      await act(async () => { useSessionUIStore.getState().setCurrentSession(null); await Promise.resolve() })
      expect(store.getState().message[sessionId]).toHaveLength(10)
    } finally {
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
      const current = { ...stale, metadata: { title: "Local mutation" }, metadataRevision: "2" }
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
})
