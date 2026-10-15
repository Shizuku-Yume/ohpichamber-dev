import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { useLiveSessionsExcluding } from '@/sync/sync-context';
import {
  EMPTY_SESSION_ORDER_RANKS,
  orderSessionsByLifecycleScopes,
  useSessionOrderingStore,
} from '@/sync/session-ordering';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionPinnedStore } from '@/stores/useSessionPinnedStore';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { deriveRecentSessions } from '../recent/activitySections';
import { isChatDirectoryPath } from '@/lib/chatDirectories';
import { isBtwSession } from '@/lib/sessionBtwMetadata';
import type { GlobalSessionStructure } from '@/stores/globalSessionStructure';
import { countSyncPerformance } from '@/sync/performance-diagnostics';
import type { SessionNode } from '../types';

type ProjectSidebarActiveSessionsArgs = {
  globalActiveSessions: readonly Session[];
  liveSessions: readonly Session[];
};

type SidebarSessionPartitions = {
  projectSessions: Session[];
  chatSessions: Session[];
};

const parentIdOf = (session: Session): string | null => {
  return session.parentSessionId ?? null;
};

// This boundary owns session visibility before Recent or projects take
// ownership. Temporary /btw forks never leak into any sidebar projection.
export const partitionSidebarSessions = (
  sessions: readonly Session[],
): SidebarSessionPartitions => {
  const projectSessions: Session[] = [];
  const chatSessions: Session[] = [];
  for (const session of sessions) {
    if (isBtwSession(session)) continue;
    if (isChatDirectoryPath(resolveGlobalSessionDirectory(session))) {
      chatSessions.push(session);
      continue;
    }
    projectSessions.push(session);
  }
  return { projectSessions, chatSessions };
};

const EMPTY_ACTIVE_SESSION_IDS: ReadonlySet<string> = new Set();


// Global sessions provide complete sidebar coverage; initialized directory
// stores only fill gaps until the global cache catches up.
export const projectSidebarActiveSessions = ({
  globalActiveSessions,
  liveSessions,
}: ProjectSidebarActiveSessionsArgs): Session[] => {
  const sessions = [...globalActiveSessions];
  const knownIds = new Set(globalActiveSessions.map((session) => session.sessionId));

  for (const session of liveSessions) {
    if (knownIds.has(session.sessionId)) continue;
    sessions.push(session);
  }

  return partitionSidebarSessions(sessions).projectSessions;
};

export const projectSidebarCollection = (args: ProjectSidebarActiveSessionsArgs): Session[] => {
  return projectSidebarActiveSessions(args);
};

const mergeSidebarSessionSources = (
  globalActiveSessions: readonly Session[],
  liveSessions: readonly Session[],
): Session[] => {
  const sessions = [...globalActiveSessions];
  const knownIds = new Set(globalActiveSessions.map((session) => session.sessionId));
  for (const session of liveSessions) {
    if (knownIds.has(session.sessionId)) continue;
    knownIds.add(session.sessionId);
    sessions.push(session);
  }
  return sessions;
};

// The collection owns hierarchy membership. Consumers receive this narrow
// resolver instead of retaining the collection's mutable indexing detail.
export const getDescendantIds = (
  childrenMap: ReadonlyMap<string, readonly Session[]>,
  sessionId: string,
): string[] => {
  const descendants: string[] = [];
  const visited = new Set<string>([sessionId]);
  const visit = (parentId: string): void => {
    for (const child of childrenMap.get(parentId) ?? []) {
      if (visited.has(child.sessionId)) continue;
      visited.add(child.sessionId);
      descendants.push(child.sessionId);
      visit(child.sessionId);
    }
  };
  visit(sessionId);
  return descendants;
};

// Recent and managed Chats render their rows from this tree, and the row's
// archive/delete actions collect descendants from it as well. Building it to
// full depth here keeps a grandchild reachable everywhere: a projection that
// stopped at direct children rendered correctly but left grandchildren active
// after their root was archived. Archived children are cut at every depth,
// as they were for direct children before.
export const buildActiveSessionNode = (
  childrenMap: ReadonlyMap<string, readonly Session[]>,
  session: Session,
): SessionNode => {
  const visited = new Set<string>([session.sessionId]);
  const build = (current: Session): SessionNode => ({
    session: current,
    children: (childrenMap.get(current.sessionId) ?? []).flatMap((child) => {
      if (child.archivedAt !== undefined || visited.has(child.sessionId)) return [];
      visited.add(child.sessionId);
      return [build(child)];
    }),
    worktree: null,
  });
  return build(session);
};

type SidebarSessionProjectionArgs = ProjectSidebarActiveSessionsArgs & {
  pinnedSessionIds: Set<string>;
  sessionOrderRanks: ReadonlyMap<string, number>;
};

export type SidebarSessionProjection = {
  chatSessions: Session[];
  childrenMap: Map<string, Session[]>;
  orderedSessions: Session[];
  projectSessions: Session[];
  sessionById: Map<string, Session>;
};

type SidebarSessionStructureArgs = Omit<ProjectSidebarActiveSessionsArgs, 'globalActiveSessions'> & {
  globalActiveSessions?: readonly Session[];
  globalStructure?: GlobalSessionStructure;
};

const buildSidebarSessionStructure = ({
  globalActiveSessions,
  liveSessions,
  globalStructure,
}: SidebarSessionStructureArgs) => {
  countSyncPerformance('sidebarStructureBuilds');
  const indexedGlobalSessions = globalActiveSessions ?? [];
  const visibleSessions = mergeSidebarSessionSources(indexedGlobalSessions, liveSessions);
  const partition = partitionSidebarSessions(visibleSessions);
  const projectSessions = partition.projectSessions;
  const sessions = [...projectSessions, ...partition.chatSessions];
  const sessionById = new Map(sessions.map((session) => [session.sessionId, session]));
  const projectSessionIds = new Set(projectSessions.map((session) => session.sessionId));
  const indexedRootIds = globalStructure?.activeRootIds ?? [];
  const indexedRootIdSet = new Set(indexedRootIds);
  const rootSessions = [
    ...indexedRootIds.flatMap((sessionId) => {
      if (!projectSessionIds.has(sessionId)) return [];
      const session = sessionById.get(sessionId);
      return session ? [session] : [];
    }),
    ...projectSessions.filter((session) => (
      !indexedRootIdSet.has(session.sessionId) && !parentIdOf(session)
    )),
  ];
  return {
    chatSessionIds: new Set(partition.chatSessions.map((session) => session.sessionId)),
    projectSessions,
    rootSessions,
    sessionById,
    sessions,
    hierarchy: globalStructure ? {
      rootIds: globalStructure.activeRootIds,
      childrenByParentId: globalStructure.activeChildrenByParentId,
    } : undefined,
  };
};

const orderSidebarSessionStructure = (
  structure: ReturnType<typeof buildSidebarSessionStructure>,
  pinnedSessionIds: Set<string>,
  sessionOrderRanks: ReadonlyMap<string, number>,
) => {
  const orderedSessions = orderSessionsByLifecycleScopes(
    structure.sessions,
    pinnedSessionIds,
    sessionOrderRanks,
    structure.hierarchy,
  );
  const childrenMap = new Map<string, Session[]>();
  for (const session of orderedSessions) {
    const parentId = parentIdOf(session);
    if (!parentId) continue;
    const siblings = childrenMap.get(parentId) ?? [];
    siblings.push(session);
    childrenMap.set(parentId, siblings);
  }
  return {
    chatSessions: orderedSessions.filter((session) => structure.chatSessionIds.has(session.sessionId)),
    childrenMap,
    orderedSessions,
  };
};

export const buildSidebarSessionProjection = ({
  globalActiveSessions,
  liveSessions,
  pinnedSessionIds,
  sessionOrderRanks,
}: SidebarSessionProjectionArgs): SidebarSessionProjection => {
  const structure = buildSidebarSessionStructure({
    globalActiveSessions,
    liveSessions,
  });
  const ordering = orderSidebarSessionStructure(structure, pinnedSessionIds, sessionOrderRanks);
  return {
    ...ordering,
    projectSessions: structure.projectSessions,
    sessionById: structure.sessionById,
  };
};

type UseSessionProjectCollectionArgs = {
  isVisible: boolean;
};

export type SessionProjectCollection = {
  archivedSessions: Session[];
  childrenMap: Map<string, Session[]>;
  chatSessions: Session[];
  getDescendantIds: (sessionId: string, options: { includeArchived: boolean }) => string[];
  hasAuthoritativeGlobalSessions: boolean;
  orderedSessions: Session[];
  pinnedSessionIds: Set<string>;
  sessionOrderRanks: ReadonlyMap<string, number>;
  sessions: Session[];
  rootSessions: Session[];
};

// The collection owns the global-first/live-gap merge and lifecycle ordering.
// Selection state intentionally never enters this boundary: rows subscribe to
// active state themselves, leaving this projection referentially stable.
export const useSessionProjectCollection = ({
  isVisible,
}: UseSessionProjectCollectionArgs): SessionProjectCollection => {
  const globalStructure = useGlobalSessionsStore((state) => state.structure);
  const globalActiveSessions = useGlobalSessionsStore((state) => state.activeSessions);
  const archivedSessions = useGlobalSessionsStore((state) => state.archivedSessions);
  const hasAuthoritativeGlobalSessions = useGlobalSessionsStore((state) => state.status === 'ready');
  const pinnedSessionIds = useSessionPinnedStore((state) => state.ids);
  const sessionOrderRanks = useSessionOrderingStore(React.useCallback(
    (state) => isVisible ? state.rankById : EMPTY_SESSION_ORDER_RANKS,
    [isVisible],
  ));
  const globalSessionIds = React.useMemo(
    () => new Set(globalStructure.activeSessionIds),
    [globalStructure.activeSessionIds],
  );
  // Only the live sessions the global cache does not hold yet: the merge drops
  // a covered session's live copy, so its live bumps (`updatedAt` on every
  // streamed step) neither re-render the sidebar nor rebuild the structure.
  const liveGapSessions = useLiveSessionsExcluding(globalSessionIds);
  const structure = React.useMemo(() => buildSidebarSessionStructure({
    globalActiveSessions,
    globalStructure,
    liveSessions: liveGapSessions,
  }), [globalActiveSessions, globalStructure, liveGapSessions]);
  const ordering = React.useMemo(
    () => orderSidebarSessionStructure(structure, pinnedSessionIds, sessionOrderRanks),
    [pinnedSessionIds, sessionOrderRanks, structure],
  );
  const { chatSessions, orderedSessions } = ordering;
  const sessions = structure.projectSessions;
  const sessionById = React.useMemo(() => new Map(
    [...structure.sessions, ...archivedSessions].map((session) => [session.sessionId, session]),
  ), [archivedSessions, structure.sessions]);
  const childrenMap = React.useMemo(() => {
    const children = new Map(ordering.childrenMap);
    for (const session of archivedSessions) {
      const parentId = session.parentSessionId;
      if (!parentId) continue;
      const siblings = children.get(parentId) ?? [];
      siblings.push(session);
      children.set(parentId, siblings);
    }
    return children;
  }, [archivedSessions, ordering.childrenMap]);
  const getDescendantIdsForAction = React.useCallback(
    (sessionId: string, options: { includeArchived: boolean }) => getDescendantIds(childrenMap, sessionId)
      .filter((id) => options.includeArchived || sessionById.get(id)?.archivedAt === undefined),
    [childrenMap, sessionById],
  );

  return {
    archivedSessions,
    childrenMap,
    chatSessions,
    getDescendantIds: getDescendantIdsForAction,
    hasAuthoritativeGlobalSessions,
    orderedSessions,
    pinnedSessionIds,
    sessionOrderRanks,
    sessions,
    rootSessions: structure.rootSessions,
  };
};

type UseRecentSessionCollectionArgs = {
  enabled: boolean;
  pinnedSessionIds: Set<string>;
  sessionOrderRanks: ReadonlyMap<string, number>;
  sessions: readonly Session[];
};

// Recent is a separate high-frequency collection view. Its active membership
// never participates in project ownership or project section projection.
export const useRecentSessionCollection = ({
  enabled,
  pinnedSessionIds,
  sessionOrderRanks,
  sessions,
}: UseRecentSessionCollectionArgs): Session[] => {
  const activeSessionIdSet = useGlobalSessionStatusStore(
    React.useCallback(
      (state) => enabled ? state.activeSessionIds : EMPTY_ACTIVE_SESSION_IDS,
      [enabled],
    ),
  );

  return React.useMemo(() => {
    if (!enabled) return [];
    countSyncPerformance('recentCandidatesVisited', sessions.length);
    return orderSessionsByLifecycleScopes(
      deriveRecentSessions(sessions, activeSessionIdSet),
      pinnedSessionIds,
      sessionOrderRanks,
    );
  }, [activeSessionIdSet, enabled, pinnedSessionIds, sessionOrderRanks, sessions]);
};
