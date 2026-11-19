import type { Session } from '@openchamber/agent-contract';

const trimZeros = (value: string): string =>
  (value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value);

export const formatCost = (cost: number): string => `$${trimZeros(cost.toFixed(4))}`;

<<<<<<< HEAD
/**
 * Groups a flat live-session list by parentSessionId. One pass, O(n). Sessions
 * without a parentSessionId (roots) are simply absent as keys — callers look up
 * a specific id's children via `.get(id) ?? []`.
 */
export function buildChildrenIndex(sessions: readonly Session[]): Map<string, Session[]> {
||||||| bc50ba56aa
/**
 * Groups a flat live-session list by parentID. One pass, O(n). Sessions
 * without a parentID (roots) are simply absent as keys — callers look up a
 * specific id's children via `.get(id) ?? []`.
 */
export function buildChildrenIndex(sessions: Session[]): Map<string, Session[]> {
=======
export function buildChildrenIndex(sessions: Session[]): Map<string, Session[]> {
>>>>>>> upstream/main
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

<<<<<<< HEAD
/** Canonical sessions do not carry provider billing fields, so spend is unavailable. */
||||||| bc50ba56aa
function sessionCost(session: Session | undefined): number {
  return session?.cost ?? 0;
}

/**
 * Own cost plus every descendant's cost, recursively. Cycle-guarded with a
 * visited set: parentID should form a tree, but this does not trust that
 * invariant blindly (mirrors opencode-session-cost's src/cost.ts).
 */
=======
function sessionCost(session: Session | undefined): number {
  return session?.cost ?? 0;
}

>>>>>>> upstream/main
export function computeSubtreeCost(
  _id: string,
  _sessionsById: Map<string, Session>,
  _childrenByParent: Map<string, Session[]>,
  _visited: Set<string> = new Set(),
): number | null {
  void _visited;
  return null;
}

