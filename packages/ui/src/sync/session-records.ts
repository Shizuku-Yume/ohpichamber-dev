import { mergeSessionDirectoryMetadata } from "@/stores/globalSessionStructure"
import type { Session } from "@openchamber/agent-contract"
import { Binary } from "./binary"

function areSessionsEqual(left: Session, right: Session): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function upsertSessionRecord(current: Session[], incoming: Session): Session[] {
  const result = Binary.search(current, incoming.sessionId, (session) => session.sessionId)
  if (!result.found) return [...current.slice(0, result.index), incoming, ...current.slice(result.index)]
  const merged = mergeSessionDirectoryMetadata(incoming, current[result.index])
  // Equivalent authoritative detail must retain sidebar session-list references.
  if (areSessionsEqual(current[result.index], merged)) return current
  const next = [...current]
  next[result.index] = merged
  return next
}
