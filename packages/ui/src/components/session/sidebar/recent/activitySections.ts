<<<<<<< HEAD
import type { Session } from '@openchamber/agent-contract';
=======
import type { Session } from '@/lib/opencode/model';
import { matchesRankQuery, SIDEBAR_SEARCH } from '@/lib/search/fuzzySearch';
>>>>>>> bc50ba56a
import type { SessionNode } from '../types';
import { listedChildren } from '../listedChildren';
import type { SidebarSessionLocation } from './sessionLocation';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

type RecentSessionLocation = SidebarSessionLocation;

type SidebarActivityItem = {
  node: SessionNode;
  projectId: string | null;
  groupDirectory: string | null;
  secondaryMeta: { projectLabel?: string | null; branchLabel?: string | null; inSpace?: boolean } | null;
  getSecondaryMeta?: (sessionId: string) => SidebarActivityItem['secondaryMeta'];
};

<<<<<<< HEAD
type RecentActivitySection = {
  key: 'active-now';
  items: SidebarActivityItem[];
};

// Recent and Timeline filter their own lists with the sidebar's rule: an
// exact `ses_` id, otherwise a case-insensitive title match.
const matchesSidebarSessionQuery = (session: Session, query: string): boolean => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (normalizedQuery.startsWith('ses_')) return session.sessionId.toLowerCase() === normalizedQuery;
  const title = session.title?.toLowerCase() ?? '';
  return title.includes(normalizedQuery);
=======
// The zones filter their own lists with the sidebar's rule: an exact `ses_`
// id, otherwise every word of the query at the start of a word of the title.
const matchesSidebarSessionQuery = (session: Session, query: string): boolean => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (normalizedQuery.startsWith('ses_')) return session.id.toLowerCase() === normalizedQuery;
  return matchesRankQuery([typeof session.title === 'string' ? session.title : ''], normalizedQuery, SIDEBAR_SEARCH);
>>>>>>> bc50ba56a
};

export const pruneSessionTreeForSidebarQuery = (node: SessionNode, query: string): SessionNode | null => {
  if (matchesSidebarSessionQuery(node.session, query)) return node;
  const children = listedChildren(node).flatMap((child) => {
    const pruned = pruneSessionTreeForSidebarQuery(child, query);
    return pruned ? [pruned] : [];
  });
  return children.length > 0 ? { ...node, children } : null;
};

/**
 * Whether a session tree answers a sidebar query: its root or any session
 * below it. A zone that lists whole trees and takes them out of every other
 * projection (In work) must keep a root whose subsession is the match, or the
 * match disappears from the sidebar entirely.
 */
export const sessionTreeMatchesSidebarQuery = (node: SessionNode, query: string): boolean => (
  matchesSidebarSessionQuery(node.session, query)
  || node.children.some((child) => sessionTreeMatchesSidebarQuery(child, query))
);

/** Sessions in a tree that answer the query themselves, ancestors kept only as context excluded. */
export const countSessionTreeQueryMatches = (node: SessionNode, query: string): number => (
  (matchesSidebarSessionQuery(node.session, query) ? 1 : 0)
  + listedChildren(node).reduce((total, child) => total + countSessionTreeQueryMatches(child, query), 0)
);

/**
 * The Pinned or In work sessions a search lists, with the matches each one
 * counts. `'tree'` looks through the whole session tree, since one-line zone
 * rows open to the match and search lists these sessions nowhere else.
 * `'session'` matches the session itself only.
 */
export type MatchedZoneSessions = {
  sessions: Session[];
  matchCountById: Map<string, number>;
};

export const matchZoneSessionsForSidebarQuery = (
  zone: readonly Session[],
  getTree: (session: Session) => SessionNode,
  query: string,
  scope: 'tree' | 'session',
): MatchedZoneSessions => {
  const matchCountById = new Map<string, number>();
  if (!query) return { sessions: [...zone], matchCountById };
  const sessions = zone.filter((session) => {
    const matches = scope === 'tree'
      ? countSessionTreeQueryMatches(getTree(session), query)
      : Number(matchesSidebarSessionQuery(session, query));
    if (matches > 0) matchCountById.set(session.sessionId, matches);
    return matches > 0;
  });
  return { sessions, matchCountById };
};

const RECENT_SESSION_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const isSubtaskSession = (session: Session): boolean => Boolean(session.parentSessionId);

const isArchivedSession = (session: Session): boolean => session.archivedAt !== undefined;

const getSessionUpdatedAt = (session: Session): number => (
  Number.isFinite(session.updatedAt) && session.updatedAt > 0 ? session.updatedAt : session.createdAt
);

// Recent contains non-archived root sessions that are active now or were
// updated within the retention window. The caller applies shared lifecycle
// ordering after this membership filter; batching ("Show more") handles long
// windows in the UI.
export const deriveRecentSessions = (
  sessions: readonly Session[],
  activeSessionIds: ReadonlySet<string>,
  now = Date.now(),
): Session[] => {
  const minUpdatedAt = now - RECENT_SESSION_MAX_AGE_MS;
  return sessions.filter((session) => {
    if (isArchivedSession(session) || isSubtaskSession(session)) {
      return false;
    }
    return activeSessionIds.has(session.sessionId) || getSessionUpdatedAt(session) >= minUpdatedAt;
  });
};

const attachRecentWorktrees = (
  node: SessionNode,
  getSessionLocation: (sessionId: string) => RecentSessionLocation | null,
): SessionNode => {
  const worktree = getSessionLocation(node.session.sessionId)?.worktree ?? null;
  const children = node.children.map((child) => attachRecentWorktrees(child, getSessionLocation));
  if (worktree === node.worktree && children.every((child, index) => child === node.children[index])) {
    return node;
  }
  return { ...node, worktree, children };
};

export const deriveRecentActivitySections = ({
  sessions,
  getSessionLocation,
  getSessionNode,
  query,
}: {
  sessions: Session[];
  getSessionLocation: (sessionId: string) => RecentSessionLocation | null;
  getSessionNode?: (session: Session) => SessionNode;
  query: string;
}): RecentActivitySection[] => [{
  key: 'active-now',
  items: sessions.flatMap((session) => {
    if (!matchesSidebarSessionQuery(session, query)) return [];
    const location = getSessionLocation(session.sessionId);
    const node = getSessionNode?.(session) ?? { session, children: [], worktree: null };
    return [{
      node: attachRecentWorktrees(node, getSessionLocation),
      projectId: location?.projectId ?? null,
      groupDirectory: location?.groupDirectory ?? resolveGlobalSessionDirectory(session),
      secondaryMeta: location ? {
        projectLabel: location.projectLabel,
        branchLabel: location.branchLabel,
        inSpace: location.inSpace,
      } : null,
      getSecondaryMeta: (sessionId: string) => {
        const childLocation = getSessionLocation(sessionId);
        return childLocation ? {
          projectLabel: childLocation.projectLabel,
          branchLabel: childLocation.branchLabel,
          inSpace: childLocation.inSpace,
        } : null;
      },
    }];
  }),
}];

// Timeline lists every non-archived root project session as one flat zone.
// Ordering, membership, and branch/project metadata are resolved by the
// caller; this projection only applies the search filter and shapes rows.
export const deriveTimelineActivityItems = ({
  sessions,
  getSessionLocation,
  getSessionNode,
  query,
}: {
  sessions: readonly Session[];
  getSessionLocation: (sessionId: string) => SidebarSessionLocation | null;
  getSessionNode: (session: Session) => SessionNode;
  query: string;
}): SidebarActivityItem[] => sessions.flatMap((session) => {
  if (!matchesSidebarSessionQuery(session, query)) return [];
  const location = getSessionLocation(session.sessionId);
  return [{
    node: getSessionNode(session),
    projectId: location?.projectId ?? null,
    groupDirectory: location?.groupDirectory ?? resolveGlobalSessionDirectory(session),
    secondaryMeta: {
      projectLabel: location?.projectLabel ?? null,
      branchLabel: location?.branchLabel ?? null,
      inSpace: location?.inSpace ?? false,
    },
  }];
});
