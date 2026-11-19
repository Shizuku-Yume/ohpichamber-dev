
import { getRuntimeKey } from "@/lib/runtime-switch"

type SessionPrefetchMeta = { limit: number; cursor?: string; complete: boolean; at: number }
const MAX_PREFETCH_ENTRIES = 200
const cache = new Map<string, SessionPrefetchMeta>()

function compositeKey(runtimeKey: string, directory: string, sessionId: string): string {
  return `${runtimeKey}\n${directory}\n${sessionId}`
}

export function getSessionPrefetch(directory: string, sessionId: string, runtimeKey = getRuntimeKey()): SessionPrefetchMeta | undefined {
  const id = compositeKey(runtimeKey, directory, sessionId)
  const value = cache.get(id)
  if (value) {
    cache.delete(id)
    cache.set(id, value)
  }
  return value
}

export function setSessionPrefetch(input: {
  directory: string
  sessionId: string
  limit: number
  cursor?: string
  complete: boolean
  at?: number
  runtimeKey?: string
}): void {
  const id = compositeKey(input.runtimeKey ?? getRuntimeKey(), input.directory, input.sessionId)
  cache.delete(id)
  cache.set(id, { limit: input.limit, cursor: input.cursor, complete: input.complete, at: input.at ?? Date.now() })
  while (cache.size > MAX_PREFETCH_ENTRIES) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    cache.delete(oldest)
  }
}

export function clearSessionPrefetch(directory: string, sessionIds: Iterable<string>, runtimeKey = getRuntimeKey()): void {
  for (const sessionId of sessionIds) if (sessionId) cache.delete(compositeKey(runtimeKey, directory, sessionId))
}
export function clearDirectorySessionPrefetch(directory: string, runtimeKey = getRuntimeKey()): void {
  const prefix = `${runtimeKey}\n${directory}\n`
  for (const id of cache.keys()) if (id.startsWith(prefix)) cache.delete(id)
}
export function clearRuntimeSessionPrefetch(runtimeKey: string): void {
  const prefix = `${runtimeKey}\n`
  for (const id of cache.keys()) if (id.startsWith(prefix)) cache.delete(id)
}
