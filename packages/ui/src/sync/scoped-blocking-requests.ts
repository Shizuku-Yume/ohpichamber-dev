import type { ApprovalRequest, QuestionRequest, Session } from '@openchamber/agent-contract';

type BlockingRequest = ApprovalRequest | QuestionRequest;
const requestId = (request: BlockingRequest): string => 'approvalId' in request ? request.approvalId : request.questionId;
const isPending = (request: BlockingRequest): boolean => request.status === 'pending';
export const computeSubtreeIds = (sessions: Session[], rootId: string): Set<string> => {
  const childrenByParent = new Map<string, string[]>();
  for (const session of sessions) {
    if (!session.parentSessionId) continue;
    const list = childrenByParent.get(session.parentSessionId) ?? [];
    list.push(session.sessionId); childrenByParent.set(session.parentSessionId, list);
  }
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
  }
  return result.length === 0 ? empty : result;
};
