import type { Session } from '@openchamber/agent-contract'

export const isRestorableOnItsOwn = (session: Session, entityById: ReadonlyMap<string, Session>): boolean => {
  if (!session.parentSessionId) return true
  const parent = entityById.get(session.parentSessionId)
  return Boolean(parent && parent.archivedAt === undefined)
}
