import { describe, expect, test } from 'bun:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ApprovalRequest, QuestionRequest } from '@openchamber/agent-contract'
import type { StoreApi } from 'zustand'
import { nativeApproval, nativeClient, nativeQuestion } from './session-message-loader-test-fixtures'
import { SyncProvider, useDirectoryStore, useSessionBlockingRequestCounts } from './sync-context'
import type { DirectoryStore } from './child-store'
import { installHookTestDom } from '../components/session/sidebar/test-utils/testDom'

// The provider has no current directory to bootstrap; the two scoped stores
// receive only the live bucket writes made by these tests.
const PARENT_DIR = '/repo'
const CHILD_DIR = '/worktrees/feature'

const createClient = () => {
  const client = nativeClient()
  client.listProjects = async () => ({ items: [], errors: {} })
  client.listWorkspaces = async () => ({ items: [], errors: {} })
  client.subscribeSessionEvents = () => () => {}
  return client
}

const permission = (id: string, sessionId: string): ApprovalRequest => ({ ...nativeApproval(sessionId), approvalId: id })
const form = (id: string, sessionId: string): QuestionRequest => ({ ...nativeQuestion(sessionId), questionId: id })

type ProbeStores = {
  parent: StoreApi<DirectoryStore>
  child: StoreApi<DirectoryStore>
}

let stores: ProbeStores | null = null
let renderedCounts: { permissionCount: number; formCount: number } | null = null
let renderCount = 0

/**
 * A collapsed row subscribes to its own bucket plus every hidden descendant's;
 * an expanded row subscribes to its own only. `includeChild` is that difference.
 */
const CountsProbe = ({ includeChild }: { includeChild: boolean }) => {
  const parentStore = useDirectoryStore(PARENT_DIR, { bootstrap: false })
  const childStore = useDirectoryStore(CHILD_DIR, { bootstrap: false })
  stores = { parent: parentStore, child: childStore }
  // Stable identity: the hook keys its store resolution and pinning on this array.
  const scopes = React.useMemo(() => (includeChild
    ? [
        { directory: PARENT_DIR, sessionIds: ['parent'] },
        { directory: CHILD_DIR, sessionIds: ['child'] },
      ]
    : [{ directory: PARENT_DIR, sessionIds: ['parent'] }]), [includeChild])
  renderedCounts = useSessionBlockingRequestCounts(scopes)
  renderCount += 1
  return null
}

const seedPermissions = async () => {
  await act(async () => {
    stores!.parent.setState({ permission: { parent: [permission('parent-permission', 'parent')] } })
    stores!.child.setState({
      permission: { child: [permission('child-permission-1', 'child'), permission('child-permission-2', 'child')] },
    })
  })
}

const withProbe = async (includeChild: boolean, assert: () => Promise<void>) => {
  const dom = installHookTestDom()
  const root = createRoot(dom.container)
  stores = null
  renderedCounts = null
  renderCount = 0
  try {
    await act(async () => root.render(
      <SyncProvider client={createClient()} directory="">
        <CountsProbe includeChild={includeChild} />
      </SyncProvider>,
    ))
    await assert()
  } finally {
    await act(async () => root.unmount())
    dom.restore()
  }
}

describe('useSessionBlockingRequestCounts', () => {
  test('rolls a hidden cross-directory subagent permission up to its collapsed parent (#2247)', async () => {
    await withProbe(true, async () => {
      // An unbootstrapped store contributes zero rather than inventing a count.
      expect(renderedCounts).toEqual({ permissionCount: 0, formCount: 0 })

      await seedPermissions()

      // 1 own + 2 hidden in another directory store, delivered through the
      // permission sidecar channel rather than a re-render of the whole tree.
      expect(renderedCounts?.permissionCount).toBe(3)

      const previousRenders = renderCount
      await act(async () => stores!.child.setState({
        permission: { ...stores!.child.getState().permission, unrelated: [permission('other', 'unrelated')] },
      }))
      expect(renderCount).toBe(previousRenders)

      await act(async () => stores!.child.setState({ permission: { child: [] } }))
      expect(renderedCounts?.permissionCount).toBe(1)
    })
  })

  test('keeps an expanded parent count scoped to the parent row', async () => {
    await withProbe(false, async () => {
      await seedPermissions()

      expect(renderedCounts?.permissionCount).toBe(1)
    })
  })

  test('counts forms and permissions independently for the same scopes', async () => {
    await withProbe(true, async () => {
      await act(async () => {
        stores!.child.setState({
          permission: { child: [permission('child-permission', 'child')] },
          form: { child: [form('child-form-1', 'child'), form('child-form-2', 'child')] },
        })
      })

      expect(renderedCounts).toEqual({ permissionCount: 1, formCount: 2 })
    })
  })
})
