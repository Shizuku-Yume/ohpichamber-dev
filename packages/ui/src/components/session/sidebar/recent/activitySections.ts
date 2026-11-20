import type { Session } from '@openchamber/agent-contract';
import type { SessionNode } from '../types';
import type { SidebarSessionLocation } from './sessionLocation';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { matchesRankQuery, SIDEBAR_SEARCH } from '@/lib/search/fuzzySearch';
import { listedChildren } from '../listedChildren';

const matchesSidebarSessionQuery = (session: Session, query: string): boolean => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith('ses_')) return session.sessionId.toLowerCase() === normalized;
  return matchesRankQuery([session.title ?? ''], normalized, SIDEBAR_SEARCH);
};

export const pruneSessionTreeForSidebarQuery = (node: SessionNode, query: string): SessionNode | null => {
  if (matchesSidebarSessionQuery(node.session, query)) return node;
  const children = listedChildren(node).flatMap((child) => {
    const pruned = pruneSessionTreeForSidebarQuery(child, query);
    return pruned ? [pruned] : [];
  });
  return children.length ? { ...node, children } : null;
};

export const countSessionTreeQueryMatches = (node: SessionNode, query: string): number => (
  Number(matchesSidebarSessionQuery(node.session, query))
  + listedChildren(node).reduce((total, child) => total + countSessionTreeQueryMatches(child, query), 0)
);

export const matchZoneSessionsForSidebarQuery = (
  zone: readonly Session[],
  getTree: (session: Session) => SessionNode,
  query: string,
  scope: 'tree' | 'session',
): { sessions: Session[]; matchCountById: Map<string, number> } => {
  const matchCountById = new Map<string, number>();
  const sessions = zone.filter((session) => {
    if (!query.trim()) return true;
    const count = scope === 'tree' ? countSessionTreeQueryMatches(getTree(session), query) : Number(matchesSidebarSessionQuery(session, query));
    if (count) matchCountById.set(session.sessionId, count);
    return count > 0;
  });
  return { sessions, matchCountById };
};

type SidebarActivityItem = {
  node: SessionNode;
  projectId: string | null;
  groupDirectory: string | null;
  secondaryMeta: { projectLabel?: string | null; branchLabel?: string | null; inSpace?: boolean } | null;
  getSecondaryMeta?: (sessionId: string) => SidebarActivityItem['secondaryMeta'];
};

export const deriveTimelineActivityItems = ({
  sessions,
  getSessionLocation,
  getSessionNode,
  query = '',
}: {
  sessions: readonly Session[];
  getSessionLocation: (sessionId: string) => SidebarSessionLocation | null;
  getSessionNode: (session: Session) => SessionNode;
  query?: string;
}): SidebarActivityItem[] => sessions.filter((session) => matchesSidebarSessionQuery(session, query)).map((session) => {
  const location = getSessionLocation(session.sessionId);
  return {
    node: getSessionNode(session),
    projectId: location?.projectId ?? null,
    groupDirectory: location?.groupDirectory ?? resolveGlobalSessionDirectory(session),
    secondaryMeta: {
      projectLabel: location?.projectLabel ?? null,
      branchLabel: location?.branchLabel ?? null,
      inSpace: location?.inSpace ?? false,
    },
  };
});
