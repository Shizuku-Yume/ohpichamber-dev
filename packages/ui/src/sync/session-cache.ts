import type { ApprovalRequest, Message, QuestionRequest, SessionRuntimeStatus } from "@openchamber/agent-contract"

type SessionCache = {
  session_status: Record<string, SessionRuntimeStatus | undefined>
  message: Record<string, Message[] | undefined>
  snapshot?: Record<string, unknown>
  partOwner?: Record<string, unknown>
  sessionEpoch?: Record<string, string>
  sessionCursor?: Record<string, string>
  sessionStatusInvalidated?: Record<string, true>
  permission: Record<string, ApprovalRequest[] | undefined>
  form: Record<string, QuestionRequest[] | undefined>
}
const isLiveStatus = (status: SessionRuntimeStatus | undefined): boolean => (
  status === "running" || status === "awaiting_approval" || status === "awaiting_input"
)

export function getProtectedSessionCacheIds(store: SessionCache): Set<string> {
  const protectedIds = new Set<string>()

  for (const [sessionId, status] of Object.entries(store.session_status ?? {})) {
    if (isLiveStatus(status)) protectedIds.add(sessionId)
  }

  for (const [sessionId, approvals] of Object.entries(store.permission ?? {})) {
    if ((approvals?.length ?? 0) > 0) protectedIds.add(sessionId)
  }

  for (const [sessionId, questions] of Object.entries(store.form ?? {})) {
    if ((questions?.length ?? 0) > 0) protectedIds.add(sessionId)
  }

  return protectedIds
}

export function dropSessionCaches(store: SessionCache, sessionIds: Iterable<string>): void {
  const stale = new Set(Array.from(sessionIds).filter(Boolean))
  if (stale.size === 0) return
  for (const sessionId of stale) {
    delete store.message[sessionId]
    if (store.snapshot) delete store.snapshot[sessionId]
    if (store.partOwner) delete store.partOwner[sessionId]
    if (store.sessionEpoch) delete store.sessionEpoch[sessionId]
    if (store.sessionCursor) delete store.sessionCursor[sessionId]
    if (store.sessionStatusInvalidated) delete store.sessionStatusInvalidated[sessionId]
    delete store.session_status[sessionId]
    delete store.permission[sessionId]
    delete store.form[sessionId]
  }
}

export function pickSessionCacheEvictions(input: {
  seen: Set<string>
  keep?: string
  limit: number
  preserve?: Iterable<string>
}): string[] {
  const stale: string[] = []
  const keep = new Set(input.preserve)
  if (input.keep) {
    keep.add(input.keep)
    input.seen.delete(input.keep)
    input.seen.add(input.keep)
  }
  for (const id of input.seen) {
    if (input.seen.size - stale.length <= input.limit) break
    if (keep.has(id)) continue
    stale.push(id)
  }
  for (const id of stale) input.seen.delete(id)
  return stale
}
