import type { Session } from '@openchamber/agent-contract';

const trimZeros = (value: string): string =>
  (value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value);

export const formatCost = (cost: number): string => `$${trimZeros(cost.toFixed(4))}`;

/**
 * Groups a flat live-session list by parentSessionId. One pass, O(n). Sessions
 * without a parentSessionId (roots) are simply absent as keys — callers look up
 * a specific id's children via `.get(id) ?? []`.
 */
export function buildChildrenIndex(sessions: readonly Session[]): Map<string, Session[]> {
  const index = new Map<string, Session[]>();
  for (const session of sessions) {
    const parentSessionId = session.parentSessionId;
    if (!parentSessionId) continue;
    const existing = index.get(parentSessionId);
    if (existing) {
      existing.push(session);
    } else {
      index.set(parentSessionId, [session]);
    }
  }
  return index;
}

/** Canonical sessions do not carry provider billing fields, so spend is unavailable. */
export function computeSubtreeCost(
  _id: string,
  _sessionsById: Map<string, Session>,
  _childrenByParent: Map<string, Session[]>,
  _visited: Set<string> = new Set(),
): number | null {
  void _visited;
  return null;
}
