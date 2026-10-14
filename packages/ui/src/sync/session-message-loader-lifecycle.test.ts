import { expect, test } from "bun:test"
import type { SessionSnapshot } from "@openchamber/agent-contract"
import { SessionMessageLoader } from "./session-message-loader"
import { ChildStoreManager } from "./child-store"
import { deferred, nativeClient, nativeMessage, nativeSnapshot } from "./session-message-loader-test-fixtures"

test("accepts fresh loads after Strict Mode cleanup without publishing disposed work", async () => {
  const childStores = new ChildStoreManager()
  const firstResponse = deferred<SessionSnapshot>()
  let requests = 0
  const client = nativeClient({ getSnapshot: async sessionId => {
    requests += 1
    return requests === 1 ? firstResponse.promise : nativeSnapshot(sessionId, [nativeMessage(sessionId, "current")])
  } })
  const loader = new SessionMessageLoader(childStores, { client, runtimeKey: "runtime" })
  const target = { directory: "/project", sessionId: "session-1" }
  try {
    const firstLoad = loader.ensure(target)
    loader.dispose()
    loader.activate()
    await loader.ensure(target)
    firstResponse.resolve(nativeSnapshot(target.sessionId, [nativeMessage(target.sessionId, "obsolete")]))
    await firstLoad
    expect(requests).toBe(2)
    expect(loader.getSnapshot(target).status).toBe("ready")
    expect(childStores.getState(target.directory)?.message[target.sessionId]?.map(message => message.messageId)).toEqual(["current"])
  } finally {
    loader.dispose()
    childStores.disposeAll()
  }
})
