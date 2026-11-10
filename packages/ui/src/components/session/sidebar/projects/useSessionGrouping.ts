import { matchesRankQuery, SIDEBAR_SEARCH } from '@/lib/search/fuzzySearch';
import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import type { WorktreeMetadata } from '@/types/worktree';
import type { SessionGroup, SessionNode } from '../types';
import {
 dedupeSessionsById,
 normalizeForBranchComparison,
 normalizePath,
} from '../utils';
import { getArchivedScopeKey } from '@/lib/sessionFolders/folderScopes';
import { getSessionLifecycleOrderValue } from '@/sync/session-ordering';
import { formatDirectoryName, formatPathForDisplay } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { getWorktreeFirstSeenAt } from './worktreeFirstSeen';
import { buildProjectWorktreeIndex } from '../worktreeIndex';
import type { SpaceMark } from '@/lib/spaces/spaces-store';
<<<<<<< HEAD

type Args = {
 homeDirectory: string | null;
 worktreeMetadata: Map<string, WorktreeMetadata>;
 pinnedSessionIds: Set<string>;
 sessionOrderRanks: ReadonlyMap<string, number>;
 gitBranches: Map<string, string | null>;
 isVSCode?: boolean;
 sessionOwners?: ReadonlyMap<string, { scopeDirectory: string }>;
 /** The isolated spaces of each project, by the project's normalized root. */
 spacesByProject?: ReadonlyMap<string, readonly SpaceMark[]>;
 /**
  * Members of active multi-runs. They list under the project root, where the
  * row model collapses them into one run row, instead of each lane's worktree
  * forming its own group.
  */
 runKeyBySessionId?: ReadonlyMap<string, string>;
 sessionById?: ReadonlyMap<string, Session>;
 childrenMap?: ReadonlyMap<string, readonly Session[]>;
 nestedSessionIds?: ReadonlySet<string>;
=======
import { resolveSessionNestingParentId } from '@/lib/sessionWorkLineage';
import { listedChildren } from '../listedChildren';

type Args = {
  homeDirectory: string | null;
  worktreeMetadata: Map<string, WorktreeMetadata>;
  pinnedSessionIds: Set<string>;
  sessionOrderRanks: ReadonlyMap<string, number>;
  gitBranches: Map<string, string | null>;
  isVSCode: boolean;
  sessionById: ReadonlyMap<string, Session>;
  childrenMap: ReadonlyMap<string, readonly Session[]>;
  nestedSessionIds: ReadonlySet<string>;
  sessionOwners?: ReadonlyMap<string, { scopeDirectory: string }>;
  /** The isolated spaces of each project, by the project's normalized root. */
  spacesByProject?: ReadonlyMap<string, readonly SpaceMark[]>;
  /**
   * Members of active multi-runs. They list under the project root, where the
   * row model collapses them into one run row, instead of each lane's worktree
   * forming its own group.
   */
  runKeyBySessionId?: ReadonlyMap<string, string>;
>>>>>>> bc50ba56a
};

const isArchivedSession = (session: Session): boolean => session.archivedAt !== undefined;

type SessionScopeOwners = Args['sessionOwners'];

const haveSameSessionScopes = (left: SessionScopeOwners, right: SessionScopeOwners): boolean => {
 if (left === right) return true;
 if (!left || !right || left.size !== right.size) return false;
 for (const [sessionId, owner] of right) {
  if (left.get(sessionId)?.scopeDirectory !== owner.scopeDirectory) return false;
 }
 return true;
};

type SessionGrouping = {
 buildGroupSearchText: (group: SessionGroup) => string;
 buildSessionSearchText: (session: Session) => string;
 filterSessionNodesForSearch: (nodes: SessionNode[], query: string) => SessionNode[];
 buildGroupedSessions: (projectSessions: readonly Session[], projectRoot: string | null, availableWorktrees: WorktreeMetadata[], projectRootBranch: string | null, projectIsRepo: boolean) => SessionGroup[];
 getGroupingSessions?: (projectSessions: readonly Session[]) => Session[];
};
export const useSessionGrouping = (args: Args): SessionGrouping => {
 const { t } = useI18n();
 // Read at call time rather than captured: the branch map is rebuilt whenever
 // any directory's git status changes, and a builder that changed identity
 // with it would invalidate every project section in the sidebar. The section
 // cache compares the branches each project actually uses instead.
 const gitBranchesRef = React.useRef(args.gitBranches);
 gitBranchesRef.current = args.gitBranches;
 // Same for the lifecycle ranks, replaced whenever any session moves up: the
 // section cache compares the ranks of each project's own sessions instead.
 const sessionOrderRanksRef = React.useRef(args.sessionOrderRanks);
 sessionOrderRanksRef.current = args.sessionOrderRanks;
 // The ownership index is rebuilt on every session-list change (a rename, a
 // recency flush), while grouping reads only each session's scope directory.
 // Keeping the map while those scopes are equal keeps the builder, and with it
 const sessionByIdRef = React.useRef(args.sessionById);
 sessionByIdRef.current = args.sessionById;
 const childrenMapRef = React.useRef(args.childrenMap);
 childrenMapRef.current = args.childrenMap;
 const nestedSessionIdsRef = React.useRef(args.nestedSessionIds);
 nestedSessionIdsRef.current = args.nestedSessionIds;
 const sessionOwnersRef = React.useRef(args.sessionOwners);
 const sessionOwners = React.useMemo(() => {
  if (!haveSameSessionScopes(sessionOwnersRef.current, args.sessionOwners)) {
   sessionOwnersRef.current = args.sessionOwners;
  }
  return sessionOwnersRef.current;
 }, [args.sessionOwners]);
 const buildGroupSearchText = React.useCallback((group: SessionGroup): string => {
  return [group.label, group.branch ?? '', group.description ?? '', group.directory ?? ''].join(' ').toLowerCase();
 }, []);

<<<<<<< HEAD
 const buildSessionSearchText = React.useCallback((session: Session): string => {
  const sessionDirectory = resolveGlobalSessionDirectory(session) ?? '';
  const sessionTitle = (session.title || t('sessions.sidebar.session.untitled')).trim();
  return `${sessionTitle} ${sessionDirectory}`.toLowerCase();
 }, [t]);

 const filterSessionNodesForSearch = React.useCallback(
  (nodes: SessionNode[], query: string): SessionNode[] => {
   if (!query) {
    return nodes;
   }

   const normalizedQuery = query.trim().toLowerCase();
   const isIdQuery = normalizedQuery.startsWith('ses_');
   return nodes.flatMap((node) => {
    if (isIdQuery && isArchivedSession(node.session)) return [];
    const nodeMatches = isIdQuery
     ? node.session.sessionId.toLowerCase() === normalizedQuery
     : matchesRankQuery([buildSessionSearchText(node.session)], query);
    if (nodeMatches) {
     return [node];
=======
export const useSessionGrouping = (args: Args) => {
  const { t } = useI18n();
  // Read at call time rather than captured: the branch map is rebuilt whenever
  // any directory's git status changes, and a builder that changed identity
  // with it would invalidate every project section in the sidebar. The section
  // cache compares the branches each project actually uses instead.
  const gitBranchesRef = React.useRef(args.gitBranches);
  gitBranchesRef.current = args.gitBranches;
  // Same for the lifecycle ranks, replaced whenever any session moves up: the
  // section cache compares the ranks of each project's own sessions instead.
  const sessionOrderRanksRef = React.useRef(args.sessionOrderRanks);
  sessionOrderRanksRef.current = args.sessionOrderRanks;
  const sessionByIdRef = React.useRef(args.sessionById);
  sessionByIdRef.current = args.sessionById;
  const childrenMapRef = React.useRef(args.childrenMap);
  childrenMapRef.current = args.childrenMap;
  const nestedSessionIdsRef = React.useRef(args.nestedSessionIds);
  nestedSessionIdsRef.current = args.nestedSessionIds;
  // The ownership index is rebuilt on every session-list change (a rename, a
  // recency flush), while grouping reads only each session's scope directory.
  // Keeping the map while those scopes are equal keeps the builder, and with it
  // every cached project section, across such updates.
  const sessionOwnersRef = React.useRef(args.sessionOwners);
  const sessionOwners = React.useMemo(() => {
    if (!haveSameSessionScopes(sessionOwnersRef.current, args.sessionOwners)) {
      sessionOwnersRef.current = args.sessionOwners;
>>>>>>> bc50ba56a
    }

    const filteredChildren = filterSessionNodesForSearch(node.children, query);
    if (filteredChildren.length === 0) {
     return [];
    }

    return [{ ...node, children: filteredChildren }];
   });
  },
  [buildSessionSearchText],
 );

<<<<<<< HEAD
 const buildGroupedSessions = React.useCallback(
  (
   projectSessions: readonly Session[],
   projectRoot: string | null,
   availableWorktrees: WorktreeMetadata[],
   projectRootBranch: string | null,
   projectIsRepo: boolean,
  ) => {
   const normalizedProjectRoot = normalizePath(projectRoot ?? null);
   // `orderSessionsByLifecycleScopes` owns lifecycle ordering before project
   // ownership buckets are built. Dedupe retains that root/sibling order.
   const sortedProjectSessions = dedupeSessionsById(projectSessions);

   const sessionMap = new Map(sortedProjectSessions.map((session) => [session.sessionId, session]));
   const childrenMap = new Map<string, Session[]>();
   sortedProjectSessions.forEach((session) => {
    const parentSessionId = session.parentSessionId;
    if (!parentSessionId) return;
    const parentSession = sessionMap.get(parentSessionId);
    // Only active subsessions nest; the archive shows top-level sessions.
    if (!parentSession || isArchivedSession(parentSession) || isArchivedSession(session)) {
     return;
    }
    const collection = childrenMap.get(parentSessionId) ?? [];
    collection.push(session);
    childrenMap.set(parentSessionId, collection);
   });
=======
      const normalizedQuery = query.trim().toLowerCase();
      const isIdQuery = normalizedQuery.startsWith('ses_');
      return nodes.flatMap((node) => {
        if (isIdQuery && isArchivedSession(node.session)) return [];
        const nodeMatches = isIdQuery
          ? node.session.id.toLowerCase() === normalizedQuery
          : matchesRankQuery([buildSessionSearchText(node.session)], query, SIDEBAR_SEARCH);
        if (nodeMatches) {
          return [node];
        }

        const filteredChildren = filterSessionNodesForSearch([...listedChildren(node)], query);
        if (filteredChildren.length === 0) {
          return [];
        }
>>>>>>> bc50ba56a

   const worktreeByPath = buildProjectWorktreeIndex(availableWorktrees, normalizedProjectRoot);
   // A space's group is keyed by the project's path inside the space, as its sessions are owned.
   const projectSpaces = (normalizedProjectRoot ? args.spacesByProject?.get(normalizedProjectRoot) : undefined) ?? [];
   const spaceByDirectory = new Map<string, SpaceMark>();
   for (const space of projectSpaces) {
    const directory = normalizePath(space.directory);
    if (directory) spaceByDirectory.set(directory, space);
   }

   const getSessionWorktree = (session: Session): WorktreeMetadata | null => {
    const sessionDirectory = resolveGlobalSessionDirectory(session);
    const sessionWorktreeMeta = args.worktreeMetadata.get(session.sessionId) ?? null;
    if (sessionWorktreeMeta) return sessionWorktreeMeta;
    if (sessionDirectory) {
     const worktree = worktreeByPath.get(sessionDirectory) ?? null;
     if (worktree && sessionDirectory !== normalizedProjectRoot) {
      return worktree;
     }
    }
    return null;
   };

<<<<<<< HEAD
   const claimedSessionIds = new Set<string>();
   const buildProjectNode = (session: Session): SessionNode => {
    claimedSessionIds.add(session.sessionId);
    const children = isArchivedSession(session) ? [] : childrenMapRef.current?.get(session.sessionId) ?? childrenMap.get(session.sessionId) ?? [];
    const childNodes: SessionNode[] = [];
    for (const child of children) {
     if (claimedSessionIds.has(child.sessionId)) continue;
     childNodes.push(buildProjectNode(child));
    }
    return { session, children: childNodes, worktree: getSessionWorktree(session) };
   };
=======
      const sessionMap = sessionByIdRef.current;
>>>>>>> bc50ba56a

   // A subsession is shown only nested under its active parent. Under an
   // archived parent, or archived itself, it is hidden rather than promoted
   // to a row of its own: subsessions are the agent's, restored with their
   // parent. One whose parent is not loaded yet stays visible as a root.
   const isHiddenSubsession = (session: Session): boolean => {
    const parentSessionId = session.parentSessionId;
    if (!parentSessionId) return false;
    if (isArchivedSession(session)) return true;
    const parentSession = sessionMap.get(parentSessionId);
    return Boolean(parentSession && isArchivedSession(parentSession));
   };

   const rootCandidates = sortedProjectSessions.filter((session) => {
    const parentSessionId = session.parentSessionId;
    if (!parentSessionId) return true;
    return !sessionMap.has(parentSessionId) && !isHiddenSubsession(session);
   });

<<<<<<< HEAD
   // A malformed cycle has no structural root. Start with normal roots,
   // then expose each still-unclaimed component from its first input row.
   const roots: SessionNode[] = [];
   const addRoot = (session: Session): void => {
    if (claimedSessionIds.has(session.sessionId)) return;
    roots.push(buildProjectNode(session));
   };
   rootCandidates.forEach(addRoot);
   sortedProjectSessions.forEach((session) => {
    if (!isHiddenSubsession(session)) addRoot(session);
   });
=======
      const claimedSessionIds = new Set<string>();
      const buildProjectNode = (session: Session): SessionNode => {
        claimedSessionIds.add(session.id);
        const children = isArchivedSession(session) ? [] : childrenMapRef.current.get(session.id) ?? [];
        const childNodes: SessionNode[] = [];
        for (const child of children) {
          if (isArchivedSession(child) || claimedSessionIds.has(child.id)) continue;
          childNodes.push(buildProjectNode(child));
        }
        return { session, children: childNodes, worktree: getSessionWorktree(session) };
      };
>>>>>>> bc50ba56a

   const groupedNodes = new Map<string, SessionNode[]>();
   const archivedKey = '__archived__';

<<<<<<< HEAD
   const getGroupKey = (session: Session) => {
    if (isArchivedSession(session)) return archivedKey;
    if (args.runKeyBySessionId?.has(session.sessionId)) return normalizedProjectRoot ?? '__project_root__';
    const resolvedScope = sessionOwners?.get(session.sessionId)?.scopeDirectory;
    if (resolvedScope) {
     if (resolvedScope === normalizedProjectRoot) return normalizedProjectRoot ?? '__project_root__';
     if (worktreeByPath.has(resolvedScope) || spaceByDirectory.has(resolvedScope)) return resolvedScope;
    }
    const metadataPath = normalizePath(args.worktreeMetadata.get(session.sessionId)?.path ?? null);
    const normalizedDir = metadataPath ?? normalizePath(session.displayPath ?? null) ?? resolveGlobalSessionDirectory(session);
    // Active sessions have already passed project ownership. An unavailable
    // worktree directory is still owned by this configured project, not an
    // archive; only archived records use the archive bucket.
    if (!normalizedDir) return normalizedProjectRoot ?? '__project_root__';
    if (normalizedDir !== normalizedProjectRoot && worktreeByPath.has(normalizedDir)) return normalizedDir;
    if (normalizedDir === normalizedProjectRoot) return normalizedProjectRoot ?? '__project_root__';
    return normalizedProjectRoot ?? '__project_root__';
   };

   roots.forEach((node) => {
    const groupKey = getGroupKey(node.session);
    if (!groupedNodes.has(groupKey)) groupedNodes.set(groupKey, []);
    groupedNodes.get(groupKey)?.push(node);
   });
=======
      const rootCandidates = sortedProjectSessions.filter((session) => {
        if (isArchivedSession(session)) return !session.parentID;
        return !nestedSessionIdsRef.current.has(session.id);
      });

      const isInNestingCycle = (session: Session): boolean => {
        const seen = new Set<string>();
        let current: Session | undefined = session;
        while (current && !isArchivedSession(current)) {
          if (seen.has(current.id)) return true;
          seen.add(current.id);
          const parentId = resolveSessionNestingParentId(current, (id) => sessionMap.get(id));
          current = parentId && sessionMap.has(parentId) ? sessionMap.get(parentId) : undefined;
        }
        return false;
      };

      // A malformed cycle has no structural root. Start with normal roots,
      // then expose each still-unclaimed component from its first input row.
      const roots: SessionNode[] = [];
      const addRoot = (session: Session): void => {
        if (claimedSessionIds.has(session.id)) return;
        roots.push(buildProjectNode(session));
      };
      rootCandidates.forEach(addRoot);
      sortedProjectSessions.forEach((session) => {
        if (!claimedSessionIds.has(session.id) && !isHiddenSubsession(session) && isInNestingCycle(session)) addRoot(session);
      });
>>>>>>> bc50ba56a

   const rootKey = normalizedProjectRoot ?? '__project_root__';
   const groups: SessionGroup[] = [{
    id: 'root',
    label: (projectIsRepo && projectRootBranch && projectRootBranch !== 'HEAD')
     ? t('sessions.sidebar.grouping.projectRootWithBranch', { branch: projectRootBranch })
     : t('sessions.sidebar.grouping.projectRoot'),
    branch: projectRootBranch ?? null,
    description: normalizedProjectRoot ? formatPathForDisplay(normalizedProjectRoot, args.homeDirectory) : null,
    isMain: true,
    isArchivedBucket: false,
    worktree: null,
    directory: normalizedProjectRoot,
    folderScopeKey: normalizedProjectRoot,
    sessions: groupedNodes.get(rootKey) ?? [],
   }];

   // Calculate display-order activity for each worktree.
   const worktreeActivityInfo = new Map<string, { hasActiveSession: boolean; lastUpdatedAt: number }>();
   availableWorktrees.forEach((meta) => {
    const directory = normalizePath(meta.path) ?? meta.path;
    const sessionsInWorktree = groupedNodes.get(directory) ?? [];
    const hasActiveSession = sessionsInWorktree.length > 0;
    // Lifecycle rank wins when present; timestamps seed bootstrap ordering.
    const lastUpdatedAt = sessionsInWorktree.reduce((max, node) => {
     const updatedAt = getSessionLifecycleOrderValue(node.session, sessionOrderRanksRef.current);
     if (!Number.isFinite(updatedAt)) {
      return max;
     }
     return Math.max(max, updatedAt);
    }, 0);

    worktreeActivityInfo.set(directory, { hasActiveSession, lastUpdatedAt });
   });

   // Sort populated worktrees by shared session activity, then empty ones by label.
   const compareWorktreeLabels = (a: WorktreeMetadata, b: WorktreeMetadata): number => {
    const aLabel = (a.label || a.branch || a.name || a.path || '').toLowerCase();
    const bLabel = (b.label || b.branch || b.name || b.path || '').toLowerCase();
    return aLabel.localeCompare(bLabel);
   };
   // A worktree is a work like the project root's: by its latest activity.
   // The row model lists them among the root's works by the same measure;
   // this order settles the ones with no session yet, newest first.
   const sortedWorktrees = [...availableWorktrees].sort((a, b) => {
    const aDir = normalizePath(a.path) ?? a.path;
    const bDir = normalizePath(b.path) ?? b.path;
    const aInfo = worktreeActivityInfo.get(aDir) ?? { hasActiveSession: false, lastUpdatedAt: 0 };
    const bInfo = worktreeActivityInfo.get(bDir) ?? { hasActiveSession: false, lastUpdatedAt: 0 };

    // First priority: active status (active first)
    if (aInfo.hasActiveSession !== bInfo.hasActiveSession) {
     return aInfo.hasActiveSession ? -1 : 1;
    }

    // Second priority: for populated worktrees, sort by latest display activity.
    if (aInfo.hasActiveSession && bInfo.hasActiveSession) {
     return bInfo.lastUpdatedAt - aInfo.lastUpdatedAt;
    }

    // Third priority: for inactive worktrees, most recently discovered
    // first (a worktree created mid-session surfaces at the top of the
    // list; startup discovery ties and falls through to labels).
    const aSeen = getWorktreeFirstSeenAt(a.path);
    const bSeen = getWorktreeFirstSeenAt(b.path);
    if (aSeen !== bSeen) {
     return bSeen - aSeen;
    }

    // Fourth priority: sort by label (asc)
    return compareWorktreeLabels(a, b);
   });

   const worktreeGroups = (args.isVSCode ?? false) ? [] : sortedWorktrees;
   worktreeGroups.forEach((meta) => {
    const directory = normalizePath(meta.path) ?? meta.path;
    const currentBranch = gitBranchesRef.current.get(directory)?.trim() || null;
    const metadataBranch = meta.branch?.trim() || null;
    const shouldSyncLabelWithBranch = Boolean(
     currentBranch && metadataBranch && meta.label && normalizeForBranchComparison(meta.label) === normalizeForBranchComparison(metadataBranch),
    );
    const label = shouldSyncLabelWithBranch
     ? currentBranch!
     : (meta.label || meta.name || formatDirectoryName(directory, args.homeDirectory) || directory);

    groups.push({
     id: `worktree:${directory}`,
     label,
     branch: currentBranch || metadataBranch,
     description: formatPathForDisplay(directory, args.homeDirectory),
     isMain: false,
     isArchivedBucket: false,
     worktree: meta,
     directory,
     folderScopeKey: directory,
     sessions: groupedNodes.get(directory) ?? [],
    });
   });

   // One group per space, after the worktrees, in the host's order; a space with no session
   // yet is still a group, so the user sees it is there.
   for (const [directory, space] of spaceByDirectory) {
    groups.push({
     id: `space:${space.id}`,
     label: space.name || t('sessions.sidebar.grouping.spaceUnnamed'),
     branch: null,
     description: null,
     isMain: false,
     isArchivedBucket: false,
     worktree: null,
     space,
     directory,
     folderScopeKey: directory,
     sessions: groupedNodes.get(directory) ?? [],
    });
   }

   const archivedSessions = groupedNodes.get(archivedKey) ?? [];
   if (archivedSessions.length > 0) {
    groups.push({
     id: 'archived',
     label: t('sessions.sidebar.grouping.archived'),
     branch: null,
     description: t('sessions.sidebar.grouping.archivedDescription'),
     isMain: false,
     isArchivedBucket: true,
     worktree: null,
     directory: null,
     folderScopeKey: normalizedProjectRoot ? getArchivedScopeKey(normalizedProjectRoot) : null,
     sessions: archivedSessions,
    });
   }

   return groups;
  },
  [args.homeDirectory, args.isVSCode, args.worktreeMetadata, sessionOwners, args.spacesByProject, args.runKeyBySessionId, t],
 );

<<<<<<< HEAD
 return {
  buildGroupSearchText,
  buildSessionSearchText,
  filterSessionNodesForSearch,
  buildGroupedSessions,
  getGroupingSessions: React.useCallback((projectSessions: readonly Session[]): Session[] => {
   const sessionMap = sessionByIdRef.current;
   if (!sessionMap) return [...projectSessions];
   const included = new Set<string>();
   const traversedDescendants = new Set<string>();
   const result: Session[] = [];
   const add = (session: Session): void => {
    if (included.has(session.sessionId)) return;
    included.add(session.sessionId);
    result.push(session);
   };
   const visitDescendants = (session: Session): void => {
    if (traversedDescendants.has(session.sessionId)) return;
    traversedDescendants.add(session.sessionId);
    add(session);
    for (const child of childrenMapRef.current?.get(session.sessionId) ?? []) {
     visitDescendants(child);
    }
   };
   for (const session of projectSessions) {
    visitDescendants(session);
    const ancestors = new Set<string>([session.sessionId]);
    let current = session;
    while (true) {
     const parentId = current.parentSessionId;
     const parent = parentId ? sessionMap.get(parentId) : undefined;
     if (!parent || ancestors.has(parent.sessionId)) break;
     ancestors.add(parent.sessionId);
     add(parent);
     current = parent;
    }
   }
   return result;
  }, []),
 };
=======
      // One group per space, after the worktrees, in the host's order; a space with no session
      // yet is still a group, so the user sees it is there.
      for (const [directory, space] of spaceByDirectory) {
        groups.push({
          id: `space:${space.id}`,
          label: space.name || t('sessions.sidebar.grouping.spaceUnnamed'),
          branch: null,
          description: null,
          isMain: false,
          isArchivedBucket: false,
          worktree: null,
          space,
          directory,
          folderScopeKey: directory,
          sessions: groupedNodes.get(directory) ?? [],
        });
      }

      const archivedSessions = groupedNodes.get(archivedKey) ?? [];
      if (archivedSessions.length > 0) {
        groups.push({
          id: 'archived',
          label: t('sessions.sidebar.grouping.archived'),
          branch: null,
          description: t('sessions.sidebar.grouping.archivedDescription'),
          isMain: false,
          isArchivedBucket: true,
          worktree: null,
          directory: null,
          folderScopeKey: !args.isVSCode && normalizedProjectRoot ? getArchivedScopeKey(normalizedProjectRoot) : null,
          sessions: archivedSessions,
        });
      }

      return groups;
    },
    [args.homeDirectory, args.worktreeMetadata, args.isVSCode, sessionOwners, args.spacesByProject, args.runKeyBySessionId, t],
  );

  const getGroupingSessions = React.useCallback((projectSessions: readonly Session[]): Session[] => {
    const sessionMap = sessionByIdRef.current;
    const included = new Set<string>();
    const traversedDescendants = new Set<string>();
    const result: Session[] = [];
    const add = (session: Session): void => {
      if (included.has(session.id)) return;
      included.add(session.id);
      result.push(session);
    };
    const visitDescendants = (session: Session): void => {
      if (traversedDescendants.has(session.id)) return;
      traversedDescendants.add(session.id);
      add(session);
      for (const child of childrenMapRef.current.get(session.id) ?? []) {
        visitDescendants(child);
      }
    };
    for (const session of projectSessions) {
      visitDescendants(session);
      const ancestors = new Set<string>([session.id]);
      let current = session;
      while (true) {
        const parentId = resolveSessionNestingParentId(current, (id) => sessionMap.get(id));
        const parent = parentId ? sessionMap.get(parentId) : undefined;
        if (!parent || ancestors.has(parent.id)) break;
        ancestors.add(parent.id);
        add(parent);
        current = parent;
      }
    }
    return result;
  }, []);

  return {
    buildGroupSearchText,
    buildSessionSearchText,
    filterSessionNodesForSearch,
    buildGroupedSessions,
    getGroupingSessions,
  };
>>>>>>> bc50ba56a
};
