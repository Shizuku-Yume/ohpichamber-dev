import type { SessionSidebarRenderContext } from '../sessionSidebarRowModel';
import type { Session } from '@openchamber/agent-contract';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { matchesRankQuery, SIDEBAR_SEARCH } from '@/lib/search/fuzzySearch';
import { normalizePath } from '@/lib/pathNormalization';
import { isChatDirectoryPath } from '@/lib/chatDirectories';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { getPinnedSessionKey } from '@/stores/useSessionPinnedStore';
import type { WorktreeMetadata } from '@/types/worktree';
import type { SessionNode } from '../types';
import { isWorkflowAgentSession } from '@/lib/sessionWorkflowMetadata';

/**
 * Per-row render extras precomputed once per group render and threaded down to
 * each `SessionNodeItem`. Hoisting these out of the row `React.memo` comparator
 * turns an O(rows × subtree-depth) walk into per-row `Set.has`/string compares.
 *
 * The child variant intentionally omits `childRenderExtrasFor` — the resolver is
 * shared from the group and re-passed, so it does not need to recurse through
 * each child's extras object.
 */
export type SessionNodeChildRenderExtras = {
 subtreeContainsEditing: Set<string>;
 menuOpenSessionId: string | null;
 nodeStructureKey: string;
 blockingBadgeSessionScopes?: readonly BlockingBadgeSessionScope[];
 /**
  * Bumped once a minute by the owning list so rows that render a relative
  * timestamp ("5m") re-render and recompute it. Only the Recent list
  * supplies it; elsewhere the rows carry no time-dependent label.
  */
 relativeTimeTick?: number;
};

export type SessionNodeRenderExtras<TNode = SessionNode> = SessionNodeChildRenderExtras & {
 childRenderExtrasFor?: (child: TNode) => SessionNodeChildRenderExtras;
};

/**
 * Walk `nodes` and add `node.session.sessionId` to `result` for every node
 * whose subtree contains `targetId`. This is used to precompute, once
 * per SessionGroupSection render, which rows need to update when
 * `editingId` changes. With M visible rows, this
 * turns an O(M × subtree-depth) walk inside `SessionNodeItem.areEqual`
 * into a single O(M) `Set.has` per row.
 */
export const collectSubtreeContainingId = (
 nodes: SessionNode[],
 targetId: string | null,
 result: Set<string>,
): void => {
 if (!targetId) return;

 const visit = (node: SessionNode): boolean => {
  let containsTarget = node.session.sessionId === targetId;
  for (const child of node.children) {
   containsTarget = visit(child) || containsTarget;
  }
  if (containsTarget) {
   result.add(node.session.sessionId);
  }
  return containsTarget;
 };

 for (const node of nodes) {
  visit(node);
 }
};

export const nodeContainsSessionId = (node: SessionNode, sessionId: string | null): boolean => {
 if (!sessionId) {
  return false;
 }

 if (node.session.sessionId === sessionId) {
  return true;
 }

 for (const child of node.children) {
  if (nodeContainsSessionId(child, sessionId)) {
   return true;
  }
 }

 return false;
};

export type BlockingBadgeSessionScope = {
 directory: string;
 sessionIDs: string[];
};

export const canShowSessionWorktreeMenu = ({
 isSubtaskSession,
 archivedBucket,
 sessionDirectory,
}: {
 isSubtaskSession: boolean;
 archivedBucket: boolean;
 sessionDirectory: string | null;
}): boolean => !isSubtaskSession
&& !archivedBucket
 && !isChatDirectoryPath(sessionDirectory);

export const getSessionWorktreeMenuDisabled = ({
 sessionDirectory,
 isStreaming,
 isMovingToWorktree,
}: {
 sessionDirectory: string | null;
 isStreaming: boolean;
 isMovingToWorktree: boolean;
}): boolean => !sessionDirectory || isStreaming || isMovingToWorktree;

/**
 * Choose which (directory, sessionIDs) scopes a sidebar row's blocking-request
 * badges should count. An expanded row counts its own session and the workflow
 * agents under it, which have no rows; a collapsed parent row additionally
 * rolls up the hidden descendants of its subtree, grouped by the directory
 * store each descendant actually lives in.
 */
export const selectBlockingBadgeSessionScopes = (
 node: SessionNode,
 isExpanded: boolean,
 fallbackDirectory: string | null,
): BlockingBadgeSessionScope[] => {
<<<<<<< HEAD
 const sessionIDsByDirectory = new Map<string, string[]>();
 const visit = (current: SessionNode): void => {
  const directory = resolveGlobalSessionDirectory(current.session)
   ?? normalizePath(current.worktree?.path)
   ?? fallbackDirectory;
  if (directory) {
   const sessionIDs = sessionIDsByDirectory.get(directory) ?? [];
   sessionIDs.push(current.session.sessionId);
   sessionIDsByDirectory.set(directory, sessionIDs);
  }
  for (const child of current.children) {
   if (current === node && isExpanded && (child.session.metadata?.openchamber as { kind?: string } | undefined)?.kind !== 'workflow-agent') continue;
   visit(child);
  }
 };
 visit(node);
 return [...sessionIDsByDirectory].map(([directory, sessionIDs]) => ({ directory, sessionIDs }));
=======
  const sessionIDsByDirectory = new Map<string, string[]>();
  const visit = (current: SessionNode): void => {
    const directory = resolveGlobalSessionDirectory(current.session)
      ?? normalizePath(current.worktree?.path)
      ?? fallbackDirectory;
    if (directory) {
      const sessionIDs = sessionIDsByDirectory.get(directory) ?? [];
      sessionIDs.push(current.session.id);
      sessionIDsByDirectory.set(directory, sessionIDs);
    }
    for (const child of current.children) {
      if (current === node && isExpanded && !isWorkflowAgentSession(child.session)) continue;
      visit(child);
    }
  };
  visit(node);
  return [...sessionIDsByDirectory].map(([directory, sessionIDs]) => ({ directory, sessionIDs }));
>>>>>>> bc50ba56a
};

export const selectFolderRootNodes = (
 sessionIds: string[],
 nodeBySessionId: ReadonlyMap<string, SessionNode>,
): SessionNode[] => {
 const assignedSessionIds = new Set(sessionIds);

 return sessionIds
  .map((sessionId) => nodeBySessionId.get(sessionId))
  .filter((node): node is SessionNode => {
   if (!node) return false;

   const visited = new Set<string>();
   let parentSessionId = node.session.parentSessionId ?? null;
   while (parentSessionId && !visited.has(parentSessionId)) {
    if (assignedSessionIds.has(parentSessionId) && nodeBySessionId.has(parentSessionId)) return false;
    visited.add(parentSessionId);
    const parentNode = nodeBySessionId.get(parentSessionId);
    parentSessionId = parentNode?.session.parentSessionId ?? null;
   }
   return true;
  });
};

type FolderHierarchyEntry = {
 id: string;
 parentId?: string | null;
};

/**
 * Preserve stored folder order while projecting every disconnected or cyclic
 * component from a deterministic root. The persisted parent links stay as-is.
 */
export const normalizeFolderRoots = <T extends FolderHierarchyEntry>(folders: readonly T[]): T[] => {
 const folderById = new Map(folders.map((folder) => [folder.id, folder]));
 const childrenByParentId = new Map<string, T[]>();
 for (const folder of folders) {
  if (!folder.parentId || !folderById.has(folder.parentId)) continue;
  const children = childrenByParentId.get(folder.parentId) ?? [];
  children.push(folder);
  childrenByParentId.set(folder.parentId, children);
 }

 const visited = new Set<string>();
 const roots: T[] = [];
 const addRoot = (folder: T): void => {
  if (visited.has(folder.id)) return;
  roots.push(folder);
  const stack = [folder.id];
  while (stack.length > 0) {
   const id = stack.pop();
   if (!id || visited.has(id)) continue;
   visited.add(id);
   for (const child of childrenByParentId.get(id) ?? []) stack.push(child.id);
  }
 };

 folders.forEach((folder) => {
  if (!folder.parentId || !folderById.has(folder.parentId)) addRoot(folder);
 });
 folders.forEach(addRoot);
 return roots;
};

type FolderProjectionEntry = FolderHierarchyEntry & {
 name: string;
 nodeCount: number;
};

type FolderProjectionOptions = {
 archivedBucket: boolean;
 searchQuery: string;
};

export const selectFolderIdsForProjection = (
 entries: readonly FolderProjectionEntry[],
 options: FolderProjectionOptions,
): Set<string> => {
 const isIdQuery = options.searchQuery.trim().toLowerCase().startsWith('ses_');
 const entryById = new Map(entries.map((entry) => [entry.id, entry]));
 const childIdsByParentId = new Map<string, string[]>();
 const malformedIds = new Set<string>();
 for (const entry of entries) {
  if (entry.parentId && !entryById.has(entry.parentId)) {
   malformedIds.add(entry.id);
   continue;
  }
  if (entry.parentId) {
   const children = childIdsByParentId.get(entry.parentId) ?? [];
   children.push(entry.id);
   childIdsByParentId.set(entry.parentId, children);
  }

  const visitedParents = new Set<string>();
  let currentId: string | null | undefined = entry.id;
  while (currentId) {
   if (visitedParents.has(currentId)) {
    malformedIds.add(entry.id);
    break;
   }
   visitedParents.add(currentId);
   currentId = entryById.get(currentId)?.parentId;
  }
 }

 const keptIds = new Set<string>();
 const visitingIds = new Set<string>();
 const shouldKeep = (folderId: string): boolean => {
  if (keptIds.has(folderId)) return true;
  if (visitingIds.has(folderId)) return false;

<<<<<<< HEAD
  const entry = entryById.get(folderId);
  if (!entry) return false;
  visitingIds.add(folderId);
=======
    let keep = malformedIds.has(folderId);
    if (!keep && options.archivedBucket && entry.nodeCount === 0) {
      // Preserve the archived empty-folder rule: search does not make an
      // empty folder visible unless a descendant has archived content.
      keep = (childIdsByParentId.get(folderId) ?? []).some(shouldKeep);
    } else {
      if (!keep && !options.searchQuery) keep = true;
      if (!keep && (entry.nodeCount > 0 || (!isIdQuery && matchesRankQuery([entry.name], options.searchQuery, SIDEBAR_SEARCH)))) keep = true;
      if (!keep) keep = (childIdsByParentId.get(folderId) ?? []).some(shouldKeep);
    }
>>>>>>> bc50ba56a

  let keep = malformedIds.has(folderId);
  if (!keep && options.archivedBucket && entry.nodeCount === 0) {
   // Preserve the archived empty-folder rule: search does not make an
   // empty folder visible unless a descendant has archived content.
   keep = (childIdsByParentId.get(folderId) ?? []).some(shouldKeep);
  } else {
   if (!keep && !options.searchQuery) keep = true;
   if (!keep && (entry.nodeCount > 0 || (!isIdQuery && matchesRankQuery([entry.name], options.searchQuery)))) keep = true;
   if (!keep) keep = (childIdsByParentId.get(folderId) ?? []).some(shouldKeep);
  }

  visitingIds.delete(folderId);
  if (keep) keptIds.add(folderId);
  return keep;
 };

 entries.forEach((entry) => shouldKeep(entry.id));
 return new Set(entries.filter((entry) => keptIds.has(entry.id)).map((entry) => entry.id));
};

const sessionObjectVersions = new WeakMap<Session, number>();
let nextSessionObjectVersion = 1;

const getSessionObjectVersion = (session: Session): number => {
 const existing = sessionObjectVersions.get(session);
 if (existing !== undefined) return existing;
 const version = nextSessionObjectVersion;
 nextSessionObjectVersion += 1;
 sessionObjectVersions.set(session, version);
 return version;
};

/**
 * Build a key encoding descendant IDs and session object versions. This lets
 * row memoization detect one changed descendant without recursively comparing
 * every subtree after a reference-only grouping rebuild.
 */
export const computeNodeStructureKey = (node: SessionNode): string => {
 if (node.children.length === 0) {
  return '';
 }

 const childKeys = node.children.map((child) => {
  const childVersion = getSessionObjectVersion(child.session);
  if (child.children.length === 0) {
   return `${child.session.sessionId}@${childVersion}`;
  }
  return `${child.session.sessionId}@${childVersion}:${computeNodeStructureKey(child)}`;
 });

 return childKeys.join('|');
};

export const nodeHasPinnedMembershipChange = (
 prevNode: SessionNode,
 nextNode: SessionNode,
 prevPinnedSessionIds: Set<string>,
 nextPinnedSessionIds: Set<string>,
 prevGroupDirectory?: string | null,
 nextGroupDirectory?: string | null,
): boolean => {
 const runtimeKey = getRuntimeKey();
 const visit = (previous: SessionNode, current: SessionNode): boolean => {
  if (previous.session.sessionId !== current.session.sessionId || previous.children.length !== current.children.length) {
   return true;
  }

  const prevDirectory = resolveGlobalSessionDirectory(previous.session) ?? prevGroupDirectory;
  const nextDirectory = resolveGlobalSessionDirectory(current.session) ?? nextGroupDirectory;
  const prevKey = getPinnedSessionKey(runtimeKey, prevDirectory ?? '', previous.session.sessionId);
  const nextKey = getPinnedSessionKey(runtimeKey, nextDirectory ?? '', current.session.sessionId);
  if (
   (prevKey ? prevPinnedSessionIds.has(prevKey) : false)
   !== (nextKey ? nextPinnedSessionIds.has(nextKey) : false)
  ) {
   return true;
  }

  return previous.children.some((child, index) => visit(child, current.children[index]));
 };

 return visit(prevNode, nextNode);
};

/**
 * Visibility classes for the row's right-edge badges (pending permissions /
 * questions). The hover actions paint over the row's right edge, and they are
 * also forced visible while the row menu is open — without hover, so the
 * hover reveal padding does not apply and the actions would cover the badges.
 * The badges therefore yield exactly like the date/branch metadata label:
 * hidden while the actions are hover-revealed or the menu is open. Rows with
 * always-visible actions reserve permanent padding instead, so their badges
 * never conflict and must stay visible.
 */
export const selectRowBadgeVisibilityClass = (input: {
 actionsAlwaysVisible: boolean;
 menuOpen: boolean;
 hideOnHoverClass: string;
}): string => {
 if (input.actionsAlwaysVisible) return '';
 return `transition-opacity duration-150 ${input.menuOpen ? 'opacity-0' : input.hideOnHoverClass}`;
};

/**
 * Branch line for a row's tooltip and recent-list marker. An explicit
 * `secondaryMeta` means the owning projection already filtered the branch
 * (Recent and Timeline hide HEAD; Recent also hides a branch equal to the
 * project label), so a null `branchLabel` there is a deliberate filter and
 * must not fall through to the raw worktree branch. Project and Chats rows
 * pass no `secondaryMeta` and keep the worktree fallback.
 */
export const resolveTooltipBranchLabel = (
 secondaryMeta: { projectLabel?: string | null; branchLabel?: string | null } | null | undefined,
 worktreeBranch: string | null | undefined,
): string | null => (
 secondaryMeta
  ? (secondaryMeta.branchLabel ?? null)
  : (worktreeBranch ?? null)
);

/**
 * The worktree directory and branch whose change request a row shows. The
 * row's worktree is the only source of the pair.
 */
export const resolveSessionPrLookup = (
 worktree: WorktreeMetadata | null | undefined,
): { directory: string; branch: string } | null => {
 const branch = worktree?.branch?.trim();
 const directory = normalizePath(worktree?.path ?? null);
 return branch && directory ? { directory, branch } : null;
};

/**
 * Resolve the session id whose sidebar menu is open, or null if no
 * menu is open. Only one row can have its menu open at a time.
 */
export const resolveMenuOpenSessionId = (
 nodes: SessionNode[],
 menuKey: string | null,
 renderContext: SessionSidebarRenderContext,
 archivedBucket: boolean,
): string | null => {
 if (!menuKey) return null;
 const bucketTag = archivedBucket ? 'archived' : 'active';
 let result: string | null = null;
 const visit = (node: SessionNode): boolean => {
  const nodeMenuKey = `${renderContext}:${bucketTag}:${node.session.sessionId}`;
  if (nodeMenuKey === menuKey) {
   result = node.session.sessionId;
   return true;
  }
  for (const child of node.children) {
   if (visit(child)) return true;
  }
  return false;
 };
 nodes.forEach((node) => visit(node));
 return result;
};
