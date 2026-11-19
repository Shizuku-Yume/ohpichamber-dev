import type { ApprovalRequest, QuestionRequest, Session } from '@openchamber/agent-contract';

<<<<<<< HEAD
type BlockingRequest = ApprovalRequest | QuestionRequest;
const requestId = (request: BlockingRequest): string => 'approvalId' in request ? request.approvalId : request.questionId;
const isPending = (request: BlockingRequest): boolean => request.status === 'pending';
export const computeSubtreeIds = (sessions: Session[], rootId: string): Set<string> => {
  const childrenByParent = new Map<string, string[]>();
||||||| bc50ba56aa
export const computeSubtreeIds = (sessions: Session[], rootId: string): Set<string> => {
  const childrenByParent = new Map<string, string[]>()
=======
const NO_CHILDREN: readonly Session[] = []

const childrenByParentCache = new WeakMap<readonly Session[], ReadonlyMap<string, readonly Session[]>>()

const readChildrenByParent = (sessions: readonly Session[]): ReadonlyMap<string, readonly Session[]> => {
  const cached = childrenByParentCache.get(sessions)
  if (cached) return cached
  const childrenByParent = new Map<string, Session[]>()
>>>>>>> upstream/main
  for (const session of sessions) {
<<<<<<< HEAD
    if (!session.parentSessionId) continue;
    const list = childrenByParent.get(session.parentSessionId) ?? [];
    list.push(session.sessionId); childrenByParent.set(session.parentSessionId, list);
||||||| bc50ba56aa
    if (!session.parentID) continue
    const list = childrenByParent.get(session.parentID) ?? []
    list.push(session.id)
    childrenByParent.set(session.parentID, list)
=======
    if (!session.parentID) continue
    const list = childrenByParent.get(session.parentID)
    if (list) list.push(session)
    else childrenByParent.set(session.parentID, [session])
>>>>>>> upstream/main
  }
<<<<<<< HEAD
  const ids = new Set<string>([rootId]); const queue = [rootId];
  for (const id of queue) for (const childId of childrenByParent.get(id) ?? []) if (!ids.has(childId)) { ids.add(childId); queue.push(childId); }
  return ids;
};
export const areRequestArraysReferentiallyEqual = <T extends BlockingRequest>(left: T[], right: T[]): boolean => left === right || (left.length === right.length && left.every((entry, index) => entry === right[index]));
export const collectScopedBlockingRequests = <T extends BlockingRequest>(sessions: Session[], requestsBySession: Record<string, T[] | undefined>, sessionId: string | null, empty: T[]): T[] => {
  if (!sessionId) return empty;
  const scopedIds = computeSubtreeIds(sessions, sessionId); const seen = new Set<string>(); const result: T[] = [];
  for (const id of scopedIds) for (const entry of requestsBySession[id] ?? []) {
    const idValue = requestId(entry);
    const key = JSON.stringify([entry.sessionId, entry.epoch, entry.workerGeneration, idValue]);
    if (!isPending(entry) || entry.sessionId !== id || seen.has(key)) continue;
    seen.add(key); result.push(entry);
||||||| bc50ba56aa

  const ids = new Set<string>([rootId])
  const queue = [rootId]
  for (const id of queue) {
    const children = childrenByParent.get(id)
    if (!children) continue
    for (const childId of children) {
      if (ids.has(childId)) continue
      ids.add(childId)
      queue.push(childId)
    }
=======
  childrenByParentCache.set(sessions, childrenByParent)
  return childrenByParent
}

export const readChildSessions = (sessions: readonly Session[], parentId: string): readonly Session[] => (
  readChildrenByParent(sessions).get(parentId) ?? NO_CHILDREN
)

export const computeSubtreeIds = (sessions: readonly Session[], rootId: string): Set<string> => {
  const childrenByParent = readChildrenByParent(sessions)
  const ids = new Set<string>([rootId])
  const queue = [rootId]
  for (const id of queue) {
    const children = childrenByParent.get(id)
    if (!children) continue
    for (const child of children) {
      if (ids.has(child.id)) continue
      ids.add(child.id)
      queue.push(child.id)
    }
>>>>>>> upstream/main
  }
<<<<<<< HEAD
  return result.length === 0 ? empty : result;
};
||||||| bc50ba56aa
  return ids
}

export const areRequestArraysReferentiallyEqual = <T extends BlockingRequest>(left: T[], right: T[]): boolean => {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export const collectScopedBlockingRequests = <T extends BlockingRequest>(
  sessions: Session[],
  requestsBySession: Record<string, T[] | undefined>,
  sessionID: string | null,
  empty: T[],
): T[] => {
  if (!sessionID) return empty

  const scopedIds = computeSubtreeIds(sessions, sessionID)
  if (scopedIds.size === 0) return empty

  const seen = new Set<string>()
  const result: T[] = []
  for (const id of scopedIds) {
    const entries = requestsBySession[id]
    if (!entries) continue
    for (const entry of entries) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      result.push(entry)
    }
  }

  return result.length === 0 ? empty : result
}
=======
  return ids
}

export const areRequestArraysReferentiallyEqual = <T extends BlockingRequest>(left: T[], right: T[]): boolean => {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

const hasAnyRequest = <T>(requestsBySession: Record<string, T[] | undefined>): boolean => {
  for (const sessionID in requestsBySession) {
    if (requestsBySession[sessionID]?.length) return true
  }
  return false
}

export const collectScopedBlockingRequests = <T extends BlockingRequest>(
  sessions: Session[],
  requestsBySession: Record<string, T[] | undefined>,
  sessionID: string | null,
  empty: T[],
): T[] => {
  if (!sessionID || !hasAnyRequest(requestsBySession)) return empty

  const scopedIds = computeSubtreeIds(sessions, sessionID)
  if (scopedIds.size === 0) return empty

  const seen = new Set<string>()
  const result: T[] = []
  for (const id of scopedIds) {
    const entries = requestsBySession[id]
    if (!entries) continue
    for (const entry of entries) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      result.push(entry)
    }
  }

  return result.length === 0 ? empty : result
}
>>>>>>> upstream/main
