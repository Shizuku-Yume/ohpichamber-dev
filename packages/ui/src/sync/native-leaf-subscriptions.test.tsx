import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Message, Session } from '@openchamber/agent-contract'
import type { StoreApi } from 'zustand'
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions'
import { nativeClient, nativeMessage, nativeSnapshot } from './session-message-loader-test-fixtures'
import { SyncProvider, useDirectoryStore, useLiveSessionsExcluding, useSessionDirectory, useSessionMessagesSelector, useSessionSelector } from './sync-context'
import type { DirectoryStore } from './child-store'
import { installHookTestDom } from '../components/session/sidebar/test-utils/testDom'

// These probes cover native leaf boundaries without fabricating OpenCode model
// or token fields. Task14 retains the legacy model-choice/token regressions.
const DIR = '/repo'
const WORKTREE_DIR = '/repo/worktree'
const SESSION_ID = 'session-a'
const WORKSPACE_ID = 'workspace-a'
const WORKTREE_WORKSPACE_ID = 'workspace-b'

const createClient = () => {
  const client = nativeClient()
  client.listProjects = async () => ({ items: [], errors: {} })
  client.listWorkspaces = async () => ({ items: [], errors: {} })
  client.subscribeSessionEvents = () => () => {}
  return client
}

const session = (overrides: Partial<Session> = {}): Session => ({
  ...nativeSnapshot(SESSION_ID, []).session,
  metadata: { title: 'One' },
  metadataRevision: '1',
  archiveRevision: '0',
  ...overrides,
})

const message = (id: string, createdAt = 10): Message => nativeMessage(SESSION_ID, id, createdAt)

const selectRecordTitle = (record: Session | undefined) => record?.metadata?.title
const selectRuntimeStatus = (record: Session | undefined) => record?.runtimeStatus
const selectMessageFingerprint = (messages: Message[]) => messages.map((item) => `${item.messageId}:${item.createdAt}:${item.parts.map((part) => part.partId).join(',')}`).join('|')

type Readings = {
  directory: string | undefined
  title: string | undefined
  runtimeStatus: Session['runtimeStatus'] | undefined
  messageFingerprint: string
  liveGap: Session[]
}

let store: StoreApi<DirectoryStore> | null = null
let readings: Readings | null = null
let renders = 0

const Probe = ({ excludedIds }: { excludedIds: ReadonlySet<string> }) => {
  store = useDirectoryStore(DIR, { bootstrap: false })
  const directory = useSessionDirectory(SESSION_ID, DIR)
  const title = useSessionSelector(SESSION_ID, DIR, selectRecordTitle)
  const runtimeStatus = useSessionSelector(SESSION_ID, DIR, selectRuntimeStatus)
  const messageFingerprint = useSessionMessagesSelector(SESSION_ID, DIR, selectMessageFingerprint)
  const liveGap = useLiveSessionsExcluding(excludedIds)
  readings = { directory, title, runtimeStatus, messageFingerprint, liveGap }
  renders += 1
  return null
}

describe('native session leaf subscriptions', () => {
  let dom: { container: Element; restore: () => void }
  let root: Root

  const render = async (excludedIds: ReadonlySet<string>) => {
    await act(async () => root.render(
      <SyncProvider client={createClient()} directory="">
        <Probe excludedIds={excludedIds} />
      </SyncProvider>,
    ))
  }

  const seed = async (sessions: Session[], messages: Message[]) => {
    await act(async () => store!.setState({ session: sessions, message: { [SESSION_ID]: messages } }))
  }

  beforeEach(() => {
    dom = installHookTestDom()
    registerWorkspaceDirectory(WORKSPACE_ID, DIR)
    registerWorkspaceDirectory(WORKTREE_WORKSPACE_ID, WORKTREE_DIR)
    root = createRoot(dom.container)
    store = null
    readings = null
    renders = 0
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    resetWorkspaceDirectories()
    dom.restore()
  })

  test('a time-only session update and a re-sent native message list do not re-render', async () => {
    const excluded = new Set([SESSION_ID])
    await render(excluded)
    await seed([session()], [message('message-1', 10)])

    expect(readings?.directory).toBe(DIR)
    expect(readings?.title).toBe('One')
    expect(readings?.runtimeStatus).toBe('idle')
    expect(readings?.messageFingerprint).toBe('message-1:10:part-message-1')
    expect(readings?.liveGap).toEqual([])

    const settled = renders
    const fingerprint = readings?.messageFingerprint
    for (let step = 2; step < 12; step += 1) {
      await seed([session({ updatedAt: step })], [message('message-1', 10)])
    }

    expect(renders).toBe(settled)
    expect(readings?.messageFingerprint).toBe(fingerprint)
  })

  test('each rendered native value still follows a real change', async () => {
    await render(new Set([SESSION_ID]))
    await seed([session()], [message('message-1', 10)])

    await seed([session({ metadata: { title: 'Renamed' }, metadataRevision: '2' })], [message('message-1', 10)])
    expect(readings?.title).toBe('Renamed')

    await seed([session({ metadata: { title: 'Renamed' }, metadataRevision: '2', runtimeStatus: 'running', activeRunId: 'run-1' })], [message('message-1', 10)])
    expect(readings?.runtimeStatus).toBe('running')

    await seed([session({ workspaceId: WORKTREE_WORKSPACE_ID, metadata: { title: 'Renamed' }, metadataRevision: '2', runtimeStatus: 'running', activeRunId: 'run-1' })], [message('message-1', 10)])
    expect(readings?.directory).toBe(WORKTREE_DIR)

    await seed([session({ workspaceId: WORKTREE_WORKSPACE_ID, metadata: { title: 'Renamed' }, metadataRevision: '2' })], [message('message-1', 10), message('message-2', 20)])
    expect(readings?.messageFingerprint).toBe('message-1:10:part-message-1|message-2:20:part-message-2')

    await seed([session({ workspaceId: WORKTREE_WORKSPACE_ID, metadata: null, metadataRevision: '0' })], [])
    expect(readings?.title).toBeUndefined()
    expect(readings?.messageFingerprint).toBe('')
  })

  test('live sessions the caller excludes do not re-render it; the rest still do', async () => {
    const gapSession = session({ sessionId: 'session-gap', metadata: { title: 'Gap' } })
    await render(new Set([SESSION_ID]))
    await seed([session(), gapSession], [])
    expect(readings?.liveGap.map((entry) => entry.sessionId)).toEqual(['session-gap'])

    const settled = renders
    const gap = readings?.liveGap
    for (let step = 2; step < 8; step += 1) {
      await seed([session({ updatedAt: step }), gapSession], [])
    }
    expect(renders).toBe(settled)
    expect(readings?.liveGap).toBe(gap)

    await seed([session({ updatedAt: 9 }), { ...gapSession, metadata: { title: 'Renamed' }, metadataRevision: '2' }], [])
    expect(readings?.liveGap.map((entry) => entry.metadata?.title)).toEqual(['Renamed'])

    await render(new Set([SESSION_ID, 'session-gap']))
    expect(readings?.liveGap).toEqual([])
  })
})
