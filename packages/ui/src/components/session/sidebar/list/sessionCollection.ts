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
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { isSpaceDirectory } from '@/lib/spaces/space-route';
import { normalizePath } from '../utils';
import { isChatDirectoryPath } from '@/lib/chatDirectories';
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

const nestingParentResolver = (sessionById: ReadonlyMap<string, Session>) => (
  (session: Session): string | null => resolveSessionNestingParentId(session, (id) => sessionById.get(id))
);

export const partitionSidebarSessions = (
  sessions: readonly Session[],
  isVSCode: boolean,
): SidebarSessionPartitions => {
  const projectSessions: Session[] = [];
  const chatSessions: Session[] = [];
  const excludeChats = isVSCode;
  for (const session of sessions) {
    if (isChatDirectoryPath(resolveGlobalSessionDirectory(session))) {
      if (excludeChats) continue;
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
  const normalized = normalizePath(resolveGlobalSessionDirectory(session));
  const directory = isVSCode ? normalized?.toLowerCase() : normalized;
  if (!directory) return false;
  if (!isVSCode && isSpaceDirectory(directory)) return true;
  if (knownDirectories.size === 0) return false;
  return knownDirectories.has(directory) || (!isVSCode && [...knownDirectories].some((root) => directory.startsWith(root.endsWith('/') ? root : `${root}/`)));
};

const keepKnownSessionsWithDescendants = (
  sessions: readonly Session[],
  isKnown: (session: Session) => boolean,
  anchors: readonly Session[],
): Session[] => {
  const sessionById = new Map([...anchors, ...sessions].map((session) => [session.sessionId, session]));
  const nestingParentOf = nestingParentResolver(sessionById);
  const kept = new Map<string, boolean>(anchors.map((anchor) => [anchor.sessionId, true]));
  const keeps = (session: Session): boolean => {
    const cached = kept.get(session.sessionId);
    if (cached !== undefined) return cached;
    kept.set(session.sessionId, false);
    const parent = isKnown(session) ? null : sessionById.get(nestingParentOf(session) ?? '');
    const result = parent === null || Boolean(parent && keeps(parent));
    kept.set(session.sessionId, result);
    return result;
  };
  return sessions.filter(keeps);
};

export const projectSidebarActiveSessions = ({
  globalActiveSessions,
  liveSessions,
  knownDirectories,
  isVSCode,
}: ProjectSidebarActiveSessionsArgs): Session[] => {
  const sessions = [...globalActiveSessions];
  const knownIds = new Set(globalActiveSessions.map((session) => session.sessionId));
  const knownDirectoryKeys = new Set([...knownDirectories].map((directory) => isVSCode ? directory.toLowerCase() : directory));

  for (const session of liveSessions) {
    if (knownIds.has(session.sessionId)) continue;
    sessions.push(session);
  }

  const partition = partitionSidebarSessions(sessions, isVSCode);
  return keepKnownSessionsWithDescendants(
    partition.projectSessions,
    (session) => isKnownActiveSessionDirectory(session, knownDirectoryKeys, isVSCode),
    partition.chatSessions,
  );
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
  const projectSessions = keepKnownSessionsWithDescendants(
    partition.projectSessions,
    (session) => isKnownActiveSessionDirectory(session, knownDirectoryKeys, isVSCode),
    partition.chatSessions,
  );
  const sessions = [...projectSessions, ...partition.chatSessions];
  const sessionById = new Map(sessions.map((session) => [session.sessionId, session]));
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

const EMPTY_PINNED_SESSION_IDS = new Set<string>();

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

type SidebarSessionProjection = {
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
  const projectSessionIds = new Set(structure.projectSessions.map((session) => session.sessionId));
  return {
    ...ordering,
    projectSessions: ordering.orderedSessions.filter((session) => projectSessionIds.has(session.sessionId)),
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
type UseSessionProjectCollectionResult = {
  archivedSessions: readonly Session[];
  childrenMap: Map<string, Session[]>;
  chatSessions: Session[];
  getDescendantIds: (sessionId: string, options: { includeArchived: boolean }) => string[];
  getTimeOrderedSessions: () => readonly Session[];
  hasAuthoritativeGlobalSessions: boolean;
  nestedSessionIds: Set<string>;
  orderedSessions: Session[];
  pinnedSessionIds: Set<string>;
  sessionOrderRanks: ReadonlyMap<string, number>;
  sessions: Session[];
  rootSessions: Session[];
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
      isChatDirectoryPath(resolveGlobalSessionDirectory(session)) ? !isVSCode : isKnownActiveSessionDirectory(session, known, isVSCode)
    ));
  }, [isVSCode, knownDirectories, rawArchivedSessions]);
  const hasAuthoritativeGlobalSessions = useGlobalSessionsStore((state) => state.status === 'ready');
  const pinnedSessionIds = useSessionPinnedStore((state) => state.ids);
  const sessionOrderRanks = useSessionOrderingStore(React.useCallback(
    (state) => isVisible ? state.rankById : EMPTY_SESSION_ORDER_RANKS,
    [isVisible],
  ));
  const globalSessionIds = React.useMemo(
    () => new Set([...globalActiveSessions, ...rawArchivedSessions].map((session) => session.sessionId)),
    [globalActiveSessions, rawArchivedSessions],
  );
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
  const getTimeOrderedSessions = React.useMemo(() => {
    let cached: Session[] | null = null;
    return (): readonly Session[] => {
      if (pinnedSessionIds.size === 0) return orderedSessions;
      cached ??= orderSidebarSessionStructure(structure, EMPTY_PINNED_SESSION_IDS, sessionOrderRanks).orderedSessions;
      return cached;
    };
  }, [orderedSessions, pinnedSessionIds, sessionOrderRanks, structure]);
  const sessionById = React.useMemo(() => new Map(
    [...structure.sessions, ...archivedSessions].map((session) => [session.sessionId, session]),
  ), [archivedSessions, structure.sessions]);
  const childrenMap = React.useMemo(() => {
    const children = new Map(ordering.childrenMap);
    for (const session of archivedSessions) {
      const parentID = session.parentSessionId;
      if (!parentID) continue;
      const siblings = children.get(parentID) ?? [];
      siblings.push(session);
      children.set(parentID, siblings);
    }
    return children;
  }, [archivedSessions, ordering.childrenMap]);
  const nestedSessionIds = React.useMemo(() => {
    const nested = new Set<string>();
    for (const [parentId, children] of childrenMap) {
      if (!sessionById.has(parentId)) continue;
      for (const child of children) nested.add(child.sessionId);
    }
    return nested;
  }, [childrenMap, sessionById]);
  const projectSessionIds = React.useMemo(
    () => new Set(structure.projectSessions.map((session) => session.sessionId)),
    [structure.projectSessions],
  );
  const sessions = React.useMemo(
    () => orderedSessions.filter((session) => projectSessionIds.has(session.sessionId)),
    [orderedSessions, projectSessionIds],
  );
  const rootSessions = React.useMemo(
    () => sessions.filter((session) => !nestedSessionIds.has(session.sessionId)),
    [nestedSessionIds, sessions],
  );
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
    nestedSessionIds,
    orderedSessions,
    getTimeOrderedSessions,
    pinnedSessionIds,
    sessionOrderRanks,
    sessions,
    rootSessions,
    sessionById,
  };
};
