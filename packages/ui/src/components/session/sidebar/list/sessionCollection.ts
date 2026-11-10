import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { useLiveSessionsExcluding } from '@/sync/sync-context';
import {
  EMPTY_SESSION_ORDER_RANKS,
  orderSessionsByLifecycleScopes,
  useSessionOrderingStore,
} from '@/sync/session-ordering';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionPinnedStore } from '@/stores/useSessionPinnedStore';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { deriveRecentSessions } from '../recent/activitySections';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { normalizePath } from '../utils';
import { isChatDirectoryPath } from '@/lib/chatDirectories';
<<<<<<< HEAD
=======
import { isVSCodeWithoutWorkspace } from '@/lib/vscodeBootstrap';
import { isSpaceDirectory } from '@/lib/spaces/space-route';
import { isBtwSession } from '@/lib/sessionBtwMetadata';
>>>>>>> bc50ba56a
import { resolveSessionNestingParentId } from '@/lib/sessionWorkLineage';
import type { GlobalSessionStructure } from '@/stores/globalSessionStructure';
import { countSyncPerformance } from '@/sync/performance-diagnostics';
import type { SessionNode } from '../types';

type ProjectSidebarActiveSessionsArgs = {
  globalActiveSessions: Session[];
  liveSessions: Session[];
  knownDirectories: Set<string>;
  isVSCode: boolean;
};

type SidebarSessionPartitions = {
  projectSessions: Session[];
  chatSessions: Session[];
};

// A row nests under its subagent parent or under the session it grew out of
// (an auto-review, a `/btw` side conversation), see `lib/sessionWorkLineage`.
const nestingParentResolver = (sessionById: ReadonlyMap<string, Session>) => (
  (session: Session): string | null => resolveSessionNestingParentId(session, (id) => sessionById.get(id))
);

export const partitionSidebarSessions = (
  sessions: readonly Session[],
  isVSCode: boolean = false,
): SidebarSessionPartitions => {
  const projectSessions: Session[] = [];
  const chatSessions: Session[] = [];
  const excludeChats = isVSCode && !isVSCodeWithoutWorkspace();
  for (const session of sessions) {
<<<<<<< HEAD
    const directory = resolveGlobalSessionDirectory(session) ?? session.displayPath;
    if (isChatDirectoryPath(directory)) {
      if (isVSCode) continue;
=======
    if (isBtwSession(session)) continue;
    if (isChatDirectoryPath(session.directory)) {
      if (excludeChats) continue;
>>>>>>> bc50ba56a
      chatSessions.push(session);
      continue;
    }
    projectSessions.push(session);
  }
  return { projectSessions, chatSessions };
};


const isKnownActiveSessionDirectory = (
  session: Session,
  knownDirectories: Set<string>,
  isVSCode: boolean,
): boolean => {
<<<<<<< HEAD
  // The full app's global cache is authoritative for active-session retention.
  // A deleted worktree is not a deletion event, so its record must reach the
  // ownership resolver even when no current topology directory matches it.
  if (!isVSCode && !session.archivedAt) return true;
  if (isVSCode && session.archivedAt) return true;
  const directory = normalizePath(resolveGlobalSessionDirectory(session) ?? session.displayPath)?.toLowerCase();
=======
  // Filtering this projection never removes records from the global cache.
  // Unregistered destinations are assessed and registered by session admission.
  const normalized = normalizePath(resolveGlobalSessionDirectory(session));
  const directory = isVSCode ? normalized?.toLowerCase() : normalized;
>>>>>>> bc50ba56a
  if (!directory) return false;
  if (!isVSCode && isSpaceDirectory(directory)) return true;
  if (knownDirectories.size === 0) return false;
  return knownDirectories.has(directory) || (!isVSCode && [...knownDirectories].some((root) => directory.startsWith(root.endsWith('/') ? root : `${root}/`)));
};

// Global sessions provide complete sidebar coverage; initialized directory
// stores only fill gaps until the global cache catches up.
export const projectSidebarActiveSessions = ({
  globalActiveSessions,
  liveSessions,
  knownDirectories,
  isVSCode,
}: ProjectSidebarActiveSessionsArgs): Session[] => {
  const sessions = [...globalActiveSessions];
<<<<<<< HEAD
  const knownIds = new Set(globalActiveSessions.map((session) => session.sessionId));
  const knownDirectoryKeys = new Set([...knownDirectories].map((directory) => directory.toLowerCase()));
=======
  const knownIds = new Set(globalActiveSessions.map((session) => session.id));
  const knownDirectoryKeys = new Set([...knownDirectories].map((directory) => isVSCode ? directory.toLowerCase() : directory));
>>>>>>> bc50ba56a

  for (const session of liveSessions) {
    if (knownIds.has(session.sessionId)) continue;
    sessions.push(session);
  }

  return partitionSidebarSessions(sessions, isVSCode).projectSessions
    .filter((session) => isKnownActiveSessionDirectory(session, knownDirectoryKeys, isVSCode));
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
      if (child.archivedAt || visited.has(child.sessionId)) return [];
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

type SidebarSessionStructureArgs = Omit<ProjectSidebarActiveSessionsArgs, 'globalActiveSessions'> & {
  globalActiveSessions?: readonly Session[];
  globalStructure?: GlobalSessionStructure;
};

const buildSidebarSessionStructure = ({
  globalActiveSessions,
  liveSessions,
  knownDirectories,
  isVSCode,
  globalStructure,
}: SidebarSessionStructureArgs) => {
  countSyncPerformance('sidebarStructureBuilds');
  const indexedGlobalSessions = globalActiveSessions ?? [];
  const visibleSessions = mergeSidebarSessionSources(indexedGlobalSessions, liveSessions);
  const partition = partitionSidebarSessions(visibleSessions, isVSCode);
  const knownDirectoryKeys = new Set([...knownDirectories].map((directory) => isVSCode ? directory.toLowerCase() : directory));
  const projectSessions = partition.projectSessions
    .filter((session) => isKnownActiveSessionDirectory(session, knownDirectoryKeys, isVSCode));
  const sessions = [...projectSessions, ...partition.chatSessions];
<<<<<<< HEAD
  const sessionById = new Map(sessions.map((session) => [session.sessionId, session]));
  const projectSessionIds = new Set(projectSessions.map((session) => session.sessionId));
  const nestingParentOf = nestingParentResolver(sessionById);
  const indexedRootIds = globalStructure?.activeRootIds ?? [];
  const indexedRootIdSet = new Set(indexedRootIds);
  const rootSessions = [
    ...indexedRootIds.flatMap((sessionId) => {
      if (!projectSessionIds.has(sessionId)) return [];
      const session = sessionById.get(sessionId);
      return session && !nestingParentOf(session) ? [session] : [];
    }),
    ...projectSessions.filter((session) => (
      !indexedRootIdSet.has(session.sessionId) && !nestingParentOf(session)
    )),
  ];
=======
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
>>>>>>> bc50ba56a
  return {
    chatSessionIds: new Set(partition.chatSessions.map((session) => session.sessionId)),
    projectSessions,
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
  const nestingParentOf = nestingParentResolver(structure.sessionById);
  for (const session of orderedSessions) {
    const parentID = nestingParentOf(session);
    if (!parentID) continue;
    const siblings = childrenMap.get(parentID) ?? [];
    siblings.push(session);
    childrenMap.set(parentID, siblings);
  }
  return {
    chatSessions: orderedSessions.filter((session) => structure.chatSessionIds.has(session.sessionId)),
    childrenMap,
    orderedSessions,
  };
};

export type SidebarSessionProjection = {
  chatSessions: Session[];
  childrenMap: Map<string, Session[]>;
  orderedSessions: Session[];
  projectSessions: Session[];
  sessionById: Map<string, Session>;
};

export const buildSidebarSessionProjection = ({
  globalActiveSessions,
  liveSessions,
  knownDirectories,
  isVSCode,
  pinnedSessionIds,
  sessionOrderRanks,
}: SidebarSessionProjectionArgs): SidebarSessionProjection => {
  const structure = buildSidebarSessionStructure({
    globalActiveSessions,
    liveSessions,
    knownDirectories,
    isVSCode,
  });
  const ordering = orderSidebarSessionStructure(structure, pinnedSessionIds, sessionOrderRanks);
  const projectSessionIds = new Set(structure.projectSessions.map((session) => session.id));
  return {
    ...ordering,
    projectSessions: ordering.orderedSessions.filter((session) => projectSessionIds.has(session.id)),
    sessionById: structure.sessionById,
  };
};

type UseSessionProjectCollectionArgs = {
  knownDirectories: Set<string>;
  isVSCode: boolean;
  isVisible: boolean;
};

// The collection owns the global-first/live-gap merge and lifecycle ordering.
// Selection state intentionally never enters this boundary: rows subscribe to
// active state themselves, leaving this projection referentially stable.
export type UseSessionProjectCollectionResult = {
  archivedSessions: readonly Session[];
  childrenMap: Map<string, Session[]>;
  chatSessions: Session[];
  getDescendantIds: (sessionId: string, options: { includeArchived: boolean }) => string[];
  hasAuthoritativeGlobalSessions: boolean;
  nestedSessionIds: Set<string>;
  orderedSessions: Session[];
  pinnedSessionIds: Set<string>;
  sessionOrderRanks: ReadonlyMap<string, number>;
  sessions: readonly Session[];
  rootSessions: readonly Session[];
  sessionById: Map<string, Session>;
};

export const useSessionProjectCollection = ({
  knownDirectories,
  isVSCode,
  isVisible,
}: UseSessionProjectCollectionArgs): UseSessionProjectCollectionResult => {
  const globalActiveSessions = useGlobalSessionsStore((state) => state.activeSessions);
  const globalStructure = useGlobalSessionsStore((state) => state.structure);
  const rawArchivedSessions = useGlobalSessionsStore((state) => state.archivedSessions);
  const archivedSessions = React.useMemo(() => {
    const known = new Set([...knownDirectories].map((directory) => isVSCode ? directory.toLowerCase() : directory));
    return rawArchivedSessions.filter((session) => (
<<<<<<< HEAD
      isChatDirectoryPath(resolveGlobalSessionDirectory(session) ?? session.displayPath) ? !isVSCode : isKnownActiveSessionDirectory(session, known, isVSCode)
=======
      isChatDirectoryPath(session.directory) ? !isVSCode : isKnownActiveSessionDirectory(session, known, isVSCode)
>>>>>>> bc50ba56a
    ));
  }, [isVSCode, knownDirectories, rawArchivedSessions]);
  const hasAuthoritativeGlobalSessions = useGlobalSessionsStore((state) => state.status === 'ready');
  const pinnedSessionIds = useSessionPinnedStore((state) => state.ids);
  const sessionOrderRanks = useSessionOrderingStore(React.useCallback(
    (state) => isVisible ? state.rankById : EMPTY_SESSION_ORDER_RANKS,
    [isVisible],
  ));
  const globalSessionIds = React.useMemo(
<<<<<<< HEAD
    () => new Set([...globalActiveSessions, ...rawArchivedSessions].map((session) => session.sessionId)),
=======
    () => new Set([...globalActiveSessions, ...rawArchivedSessions].map((session) => session.id)),
>>>>>>> bc50ba56a
    [globalActiveSessions, rawArchivedSessions],
  );
  // Only the live sessions the global cache does not hold yet: the merge drops
  // a covered session's live copy, so its live bumps (`time.updated` on every
  // streamed step) neither re-render the sidebar nor rebuild the structure.
  const liveGapSessions = useLiveSessionsExcluding(globalSessionIds);
  const structure = React.useMemo(() => buildSidebarSessionStructure({
    globalActiveSessions,
    globalStructure,
    liveSessions: liveGapSessions,
    knownDirectories,
    isVSCode,
  }), [globalActiveSessions, globalStructure, isVSCode, knownDirectories, liveGapSessions]);
  const ordering = React.useMemo(
    () => orderSidebarSessionStructure(structure, pinnedSessionIds, sessionOrderRanks),
    [pinnedSessionIds, sessionOrderRanks, structure],
  );
  const { chatSessions, orderedSessions } = ordering;
<<<<<<< HEAD
  // Sessions a row nests under another one: they are never roots of their own.
  const nestedSessionIds = React.useMemo(
    () => new Set([...ordering.childrenMap.values()].flat().map((session) => session.sessionId)),
    [ordering.childrenMap],
  );
  const sessions = structure.projectSessions;
=======
>>>>>>> bc50ba56a
  const sessionById = React.useMemo(() => new Map(
    [...structure.sessions, ...archivedSessions].map((session) => [session.sessionId, session]),
  ), [archivedSessions, structure.sessions]);
  const childrenMap = React.useMemo(() => {
    const children = new Map(ordering.childrenMap);
    for (const session of archivedSessions) {
      // SAFETY: OpenCode's session records carry parentID for sub-session
      // hierarchy; the SDK's base Session type does not currently expose it.
      const parentID = session.parentSessionId;
      if (!parentID) continue;
      const siblings = children.get(parentID) ?? [];
      siblings.push(session);
      children.set(parentID, siblings);
    }
    return children;
  }, [archivedSessions, ordering.childrenMap]);
  // A missing parent may temporarily leave its child as a root. Once either
  // the active or archived cache supplies that parent, the child is no longer
  // a root in its own project bucket.
  const nestedSessionIds = React.useMemo(() => {
    const nested = new Set<string>();
    for (const [parentId, children] of childrenMap) {
      if (!sessionById.has(parentId)) continue;
      for (const child of children) nested.add(child.id);
    }
    return nested;
  }, [childrenMap, sessionById]);
  const projectSessionIds = React.useMemo(
    () => new Set(structure.projectSessions.map((session) => session.id)),
    [structure.projectSessions],
  );
  const sessions = React.useMemo(
    () => orderedSessions.filter((session) => projectSessionIds.has(session.id)),
    [orderedSessions, projectSessionIds],
  );
  const rootSessions = React.useMemo(
    () => sessions.filter((session) => !nestedSessionIds.has(session.id)),
    [nestedSessionIds, sessions],
  );
  const getDescendantIdsForAction = React.useCallback(
    (sessionId: string, options: { includeArchived: boolean }) => getDescendantIds(childrenMap, sessionId)
      .filter((id) => options.includeArchived || !sessionById.get(id)?.archivedAt),
    [childrenMap, sessionById],
  );

  return {
    archivedSessions,
    childrenMap,
    chatSessions,
    getDescendantIds: getDescendantIdsForAction,
    hasAuthoritativeGlobalSessions,
    nestedSessionIds,
    orderedSessions,
    pinnedSessionIds,
    sessionOrderRanks,
    sessions,
    rootSessions,
    sessionById,
  };
};

const EMPTY_ACTIVE_SESSION_IDS = new Set<string>();

type UseRecentSessionCollectionArgs = {
  enabled: boolean;
  pinnedSessionIds: ReadonlySet<string>;
  sessionOrderRanks: ReadonlyMap<string, number>;
  sessions: readonly Session[];
};

// Kept for MobileSessionsSheet compatibility until Task 32 migrates it.
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
      pinnedSessionIds instanceof Set ? pinnedSessionIds : new Set(pinnedSessionIds),
      sessionOrderRanks,
    );
  }, [activeSessionIdSet, enabled, pinnedSessionIds, sessionOrderRanks, sessions]);
};
