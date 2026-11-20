import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { useAllLiveSessions } from '@/sync/sync-context';
import { buildChildrenIndex, computeSubtreeCost } from './subagentCost';

export type SubagentCostRollup = {
  totalCost: number | null;
  /** The root session's own spend, excluding every subagent. */
  ownCost: number;
  /** Everything the subagents cost between them: `totalCost - ownCost`. */
  subagentCost: number;
  subagentCount: number;
  perChildCost: Map<string, number>;
};

const EMPTY_ROLLUP: SubagentCostRollup = {
  totalCost: null,
  ownCost: 0,
  subagentCost: 0,
  subagentCount: 0,
  perChildCost: new Map(),
};

function countDescendants(id: string, childrenByParent: Map<string, Session[]>, visited: Set<string>): number {
  if (visited.has(id)) return 0;
  visited.add(id);
  const kids = childrenByParent.get(id) ?? [];
  let count = kids.length;
  for (const kid of kids) count += countDescendants(kid.sessionId, childrenByParent, visited);
  return count;
}

/**
 * Pure core of useSubagentCostRollup, kept separate so it can be unit-tested
 * directly against a plain session array instead of rendering the hook.
 */
export function computeRollup(liveSessions: Session[], sessionId: string | null): SubagentCostRollup {
  if (!sessionId) return EMPTY_ROLLUP;

  const sessionsById = new Map(liveSessions.map((session) => [session.sessionId, session]));
  if (!sessionsById.has(sessionId)) return EMPTY_ROLLUP;

  const childrenByParent = buildChildrenIndex(liveSessions);
  const totalCost = computeSubtreeCost(sessionId, sessionsById, childrenByParent);
  const subagentCount = countDescendants(sessionId, childrenByParent, new Set());
  // Canonical session discovery does not provide an authoritative spend total.
  // Keep the descendant count without presenting missing billing as zero spend.
  if (totalCost === null) return { ...EMPTY_ROLLUP, subagentCount };

  const perChildCost = new Map<string, number>();
  let subagentCost = 0;
  for (const child of childrenByParent.get(sessionId) ?? []) {
    const childSubtree = computeSubtreeCost(child.sessionId, sessionsById, childrenByParent);
    if (childSubtree === null) return { ...EMPTY_ROLLUP, subagentCount };
    perChildCost.set(child.sessionId, childSubtree);
    subagentCost += childSubtree;
  }

  // Derived by subtraction rather than read back off the session, so the split
  // always adds up to the total the panel shows even if a cycle guard trimmed
  // part of the walk.
  const ownCost = totalCost - subagentCost;

  return { totalCost, ownCost, subagentCost, subagentCount, perChildCost };
}

/**
 * Own cost plus every descendant subagent's cost, recursively summed, for a
 * given root session. Reads the same `useAllLiveSessions()` subscription
 * WorkStatusSubagentsSection already holds — no new store subscription.
 */
export function useSubagentCostRollup(sessionId: string | null): SubagentCostRollup {
  const liveSessions = useAllLiveSessions();
  return React.useMemo(() => computeRollup(liveSessions, sessionId), [liveSessions, sessionId]);
}
