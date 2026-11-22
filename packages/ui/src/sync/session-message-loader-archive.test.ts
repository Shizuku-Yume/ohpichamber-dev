import { afterEach, expect, test } from "bun:test"
import { ChildStoreManager } from "./child-store"
import { SessionMessageLoader } from "./session-message-loader"
import { nativeClient, nativeHostSession, nativeSnapshot } from "./session-message-loader-test-fixtures"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"

const target = { directory: "/loader-repo", sessionId: "session-a" }
const original = useGlobalSessionsStore.getState()
afterEach(() => useGlobalSessionsStore.setState(original))

test("opens an archived session that archiving tombstoned before the request", async () => {
  const childStores = new ChildStoreManager()
  const loader = new SessionMessageLoader(childStores, { runtimeKey: "runtime-a", client: nativeClient({ getSnapshot: async () => nativeSnapshot() }) })
  const store = childStores.ensureChild(target.directory, { bootstrap: false })
  try {
    store.setState({ sessionRevision: 1, sessionDeletedRevision: { [target.sessionId]: 1 } })
    useGlobalSessionsStore.getState().applySnapshot([], [{ ...nativeHostSession(), archivedAt: 5 }], "ready")
    await loader.ensure(target)
    expect(store.getState().message[target.sessionId]?.length).toBeGreaterThan(0)
    expect(loader.getSnapshot(target)).toMatchObject({ resolved: true })
  } finally {
    loader.dispose()
    childStores.disposeAll()
  }
})

test("leaves a snapshot loaded through another workspace's directory idle instead of failing", async () => {
  const childStores = new ChildStoreManager()
  const snapshot = nativeSnapshot()
  const loader = new SessionMessageLoader(childStores, { runtimeKey: "runtime-a", client: nativeClient({ getSnapshot: async () => snapshot }) })
  const store = childStores.ensureChild(target.directory, { bootstrap: false })
  try {
    store.setState({ workspace: { ...(store.getState().workspace ?? {}), workspaceId: `${snapshot.session.workspaceId}-project-root` } as never })
    await loader.ensure(target)
    expect(store.getState().message[target.sessionId]).toBeUndefined()
    expect(loader.getSnapshot(target)).toMatchObject({ status: "idle", error: null, resolved: false })
  } finally {
    loader.dispose()
    childStores.disposeAll()
  }
})
