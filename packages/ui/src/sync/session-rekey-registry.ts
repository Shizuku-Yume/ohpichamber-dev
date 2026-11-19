import { getRuntimeKey } from "@/lib/runtime-switch"

/**
 * Session ids the Agent Service rekeyed away from, per runtime.
 *
 * A completed `/btw` Promote to Branch retires the pre-branch id in the
 * service and in the Host; only the minted id answers. Consumers that read the
 * selection through React's deferred value hold one pre-rekey commit for a
 * moment after the selection moves, so a read for the retired id would still
 * leave the browser. Every read path asks here first: a retired id is not a
 * session to load, and no request is issued for it.
 *
 * The minted id retires nothing, so the map only ever grows by one entry per
 * branch and is bounded by the page's own branch count.
 */
const retiredByRuntime = new Map<string, Map<string, string>>()

function runtimeEntries(runtimeKey = getRuntimeKey()): Map<string, string> {
  let entries = retiredByRuntime.get(runtimeKey)
  if (!entries) {
    entries = new Map()
    retiredByRuntime.set(runtimeKey, entries)
  }
  return entries
}

/** Record that `previousSessionId` was replaced by `sessionId` and must not be read. */
export function retireSessionIdentity(previousSessionId: string | null | undefined, sessionId: string, runtimeKey?: string): void {
  if (!previousSessionId || previousSessionId === sessionId) return
  runtimeEntries(runtimeKey).set(previousSessionId, sessionId)
}

/** The id that replaced a retired session, or null when the id is still addressable. */
export function replacementForRetiredSession(sessionId: string | null | undefined, runtimeKey?: string): string | null {
  if (!sessionId) return null
  return runtimeEntries(runtimeKey).get(sessionId) ?? null
}

export function isRetiredSessionId(sessionId: string | null | undefined, runtimeKey?: string): boolean {
  return replacementForRetiredSession(sessionId, runtimeKey) !== null
}

/** Forget a runtime's retirement map when its transport is replaced. */
export function resetSessionRekeyRegistry(runtimeKey?: string): void {
  if (runtimeKey === undefined) retiredByRuntime.clear()
  else retiredByRuntime.delete(runtimeKey)
}
