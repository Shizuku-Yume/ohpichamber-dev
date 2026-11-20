import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { useShallow } from 'zustand/react/shallow';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useAllLiveSessions } from '@/sync/sync-context';
import { buildChildrenIndex, computeSubtreeCost } from './subagentCost';

export type SubagentCostRollup = {
  totalCost: number | null;
  ownCost: number;
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

  const ownCost = totalCost - subagentCost;

  return { totalCost, ownCost, subagentCost, subagentCount, perChildCost };
}

const NO_SESSIONS: Session[] = [];

export function useSessionsWithListedChildren(sessionId: string | null): Session[] {
  const liveSessions = useAllLiveSessions();
  const listedChildren = useGlobalSessionsStore(useShallow((state) => {
    const childIds = sessionId ? state.structure.activeChildrenByParentId.get(sessionId) : undefined;
    if (!childIds) return NO_SESSIONS;
    return childIds.flatMap((id) => {
      const child = state.entityById.get(id);
      return child ? [child] : [];
    });
  }));
  return React.useMemo(() => {
    if (listedChildren.length === 0) return liveSessions;
    const listedById = new Map(listedChildren.map((child) => [child.sessionId, child]));
    const merged = liveSessions.map((session) => {
      const listed = listedById.get(session.sessionId);
      if (!listed) return session;
      listedById.delete(session.sessionId);
      return session.model || !listed.model ? session : { ...session, agent: session.agent ?? listed.agent, model: listed.model };
    });
    return [...merged, ...listedById.values()];
  }, [listedChildren, liveSessions]);
}

export function useSubagentCostRollup(sessionId: string | null): SubagentCostRollup {
  const sessions = useSessionsWithListedChildren(sessionId);
  return React.useMemo(() => computeRollup(sessions, sessionId), [sessions, sessionId]);
}
