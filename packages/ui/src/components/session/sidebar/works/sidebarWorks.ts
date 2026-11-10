import type { Session } from '@openchamber/agent-contract';
import { isSessionInWork } from '@/lib/sessionWorkMetadata';
import { normalizePath } from '@/lib/pathNormalization';
import { isSessionInWork } from '@/lib/sessionWorkMetadata';
import type { SessionGroup, SessionNode } from '../types';
import type { ProjectSection } from '../projects/sessionProjectRender';

/**
 * A work is what the sidebar lists as one entry: a linked worktree or an
 * isolated space with all its sessions, or a root session of the project root
 * with the sessions nested under it. See DOCUMENTATION.md next to this file.
 */
export type SidebarWorkRef =
<<<<<<< HEAD
 | { kind: 'worktree'; key: string; projectId: string; group: SessionGroup }
 | { kind: 'session'; key: string; projectId: string; rootSessionId: string };
=======
  | { kind: 'group'; key: string; projectId: string; group: SessionGroup }
  | { kind: 'session'; key: string; projectId: string | null; rootSessionId: string };
>>>>>>> bc50ba56a

type SidebarGroupWorkRef = Extract<SidebarWorkRef, { kind: 'group' }>;

<<<<<<< HEAD
export type SidebarWorkIndex = {
 bySessionId: ReadonlyMap<string, SidebarWorkRef>;
 /** Every worktree work, in section and group order, sessions or not. */
 worktreeWorks: readonly SidebarWorktreeWorkRef[];
};

/** A linked worktree's group: the one kind of group that is a work of its own. */
export const isWorktreeWorkGroup = (group: SessionGroup): boolean => (
 !group.isMain && group.isArchivedBucket !== true && !group.space && group.worktree !== null
);

export const isGroupWork = (group: SessionGroup): boolean => (
 !group.isMain && group.isArchivedBucket !== true && (Boolean(group.space) || group.worktree !== null)
=======
type SidebarWorkIndex = {
  bySessionId: ReadonlyMap<string, SidebarWorkRef>;
  /** Every worktree and space work, in section and group order, sessions or not. */
  groupWorks: readonly SidebarGroupWorkRef[];
};

/**
 * A group that is a work of its own: a linked worktree's, or an isolated
 * space's, which is a separate copy of the project the same way.
 */
export const isGroupWork = (group: SessionGroup): boolean => (
  !group.isMain && group.isArchivedBucket !== true && (Boolean(group.space) || group.worktree !== null)
>>>>>>> bc50ba56a
);

/** The root folder holding a session or a worktree, and the project of that folder. */
export type SidebarFolderMembership = { folderId: string; projectId: string };

/**
 * The folder of the work's own project that holds it. A work that changed
 * project (a nested folder added as one) keeps its stored membership in the
 * old project, whose folders no longer list it.
 */
export const findWorkFolderId = (ref: SidebarWorkRef, folderByMember: ReadonlyMap<string, SidebarFolderMembership>): string | null => {
  const memberId = ref.kind === 'group' ? worktreeFolderMemberId(ref.group.directory) : ref.rootSessionId;
  const membership = memberId ? folderByMember.get(memberId) : undefined;
  return membership?.projectId === ref.projectId ? membership?.folderId ?? null : null;
};

export const isFiledInFolder = (ref: SidebarWorkRef, folderByMember: ReadonlyMap<string, SidebarFolderMembership>): boolean => (
  findWorkFolderId(ref, folderByMember) !== null
);

/**
 * The sessions in work of a root session's work: the root and what nests
 * under it, past subagents, whose own state never counts. The work is in work
 * while any of them is, and Done closes all of them.
 */
export const collectSessionWorkInWork = (root: SessionNode): Session[] => {
  const inWork: Session[] = [];
  const stack: SessionNode[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (isSessionInWork(current.session)) inWork.push(current.session);
    for (const child of current.children) if (!child.session.parentID) stack.push(child);
  }
  return inWork;
};

const worktreeWorkGroupKey = (projectId: string, group: SessionGroup): string => `${projectId}:${group.id}`;

/**
 * A worktree's entry in a folder of its project root, beside the session ids
 * there. The folder store and the server treat members as opaque ids, so a
 * worktree is filed with the same assign and unassign changes as a session.
 */
export const worktreeFolderMemberId = (directory: string | null): string | null => {
 const normalized = normalizePath(directory);
 return normalized ? `worktree:${normalized}` : null;
};
export type SidebarFolderMembership = { folderId: string; projectId: string };

export const findWorkFolderId = (ref: SidebarWorkRef, folderByMember: ReadonlyMap<string, SidebarFolderMembership>): string | null => {
 const memberId = ref.kind === 'worktree' ? worktreeFolderMemberId(ref.group.directory) : ref.rootSessionId;
 const membership = memberId ? folderByMember.get(memberId) : undefined;
 return membership?.projectId === ref.projectId ? membership?.folderId ?? null : null;
};

export const isFiledInFolder = (ref: SidebarWorkRef, folderByMember: ReadonlyMap<string, SidebarFolderMembership>): boolean => (
 findWorkFolderId(ref, folderByMember) !== null
);

const sessionWorkKey = (rootSessionId: string): string => `session:${rootSessionId}`;

/** Which work each listed session belongs to, from the project sections. */
export const buildSidebarWorkIndex = (sections: readonly ProjectSection[]): SidebarWorkIndex => {
<<<<<<< HEAD
 const bySessionId = new Map<string, SidebarWorkRef>();
 const worktreeWorks: SidebarWorktreeWorkRef[] = [];
 const claim = (node: SessionNode, ref: SidebarWorkRef): void => {
  const stack = [node];
  while (stack.length > 0) {
   const current = stack.pop();
   if (!current || bySessionId.has(current.session.sessionId)) continue;
   bySessionId.set(current.session.sessionId, ref);
   stack.push(...current.children);
  }
 };
 for (const section of sections) {
  const projectId = section.project.id;
  for (const group of section.groups) {
   if (group.isArchivedBucket) continue;
   if (isGroupWork(group)) {
    const ref: SidebarWorktreeWorkRef = { kind: 'worktree', key: worktreeWorkGroupKey(projectId, group), projectId, group };
    worktreeWorks.push(ref);
    group.sessions.forEach((node) => claim(node, ref));
    continue;
   }
   for (const node of group.sessions) {
    claim(node, { kind: 'session', key: sessionWorkKey(node.session.sessionId), projectId, rootSessionId: node.session.sessionId });
   }
  }
 }
 return { bySessionId, worktreeWorks };
};

const EMPTY_ANCHORS: ReadonlyMap<string, number> = new Map();

export const buildSessionRootIndex = (
 rootSessions: readonly Session[],
 childrenMap: ReadonlyMap<string, readonly Session[]>,
): ReadonlyMap<string, string> => {
 const rootOf = new Map<string, string>();
 for (const root of rootSessions) {
  const stack: Session[] = [root];
  while (stack.length > 0) {
   const current = stack.pop();
   if (!current || rootOf.has(current.sessionId)) continue;
   rootOf.set(current.sessionId, root.sessionId);
   stack.push(...(childrenMap.get(current.sessionId) ?? []));
  }
 }
 return rootOf;
};

/**
 * The works In work lists, before Pinned takes its own: a work is in work when
 * its root or a session nested under it, past subagents, is.
 */
export const orderInWorkWorks = (
 orderedSessions: readonly Session[],
 index: SidebarWorkIndex,
 rootOf: ReadonlyMap<string, string>,
 isChatDirectory: (directory: string | null | undefined) => boolean,
): SidebarWorkRef[] => orderSidebarWorks(orderedSessions, index, (session) => (
 !session.parentSessionId && session.archivedAt === undefined && !isChatDirectory(session.displayPath) && isSessionInWork(session)
), EMPTY_ANCHORS, rootOf);

export const buildWorktreeArchiveAnchors = ({
 groupWorks,
 archivedSessions,
 orderedSessions,
 orderValueOf,
 isPinned,
}: {
 groupWorks: readonly SidebarWorktreeWorkRef[];
 archivedSessions: readonly Session[];
 orderedSessions: readonly Session[];
 orderValueOf: (session: Session) => number;
 isPinned: (session: Session) => boolean;
}): ReadonlyMap<string, number> => {
 if (groupWorks.length === 0 || archivedSessions.length === 0) return EMPTY_ANCHORS;
 const keyByDirectory = new Map(groupWorks.flatMap((ref) => {
  const directory = normalizePath(ref.group.directory ?? null);
  return directory ? [[directory, ref.key] as const] : [];
 }));
 const newestByKey = new Map<string, number>();
 for (const session of archivedSessions) {
  if (session.parentSessionId) continue;
  const key = keyByDirectory.get(normalizePath(session.displayPath ?? null) ?? '');
  if (!key) continue;
  newestByKey.set(key, Math.max(newestByKey.get(key) ?? Number.NEGATIVE_INFINITY, orderValueOf(session)));
 }
 if (newestByKey.size === 0) return EMPTY_ANCHORS;
 const tops = orderedSessions.flatMap((session, index) => (
  session.parentSessionId || isPinned(session) ? [] : [{ index, value: orderValueOf(session) }]
 ));
 const anchors = new Map<string, number>();
 for (const [key, newest] of newestByKey) {
  const next = tops.find((entry) => entry.value < newest);
  anchors.set(key, (next?.index ?? orderedSessions.length) - 0.5);
 }
 return anchors;
=======
  const bySessionId = new Map<string, SidebarWorkRef>();
  const groupWorks: SidebarGroupWorkRef[] = [];
  const claim = (node: SessionNode, ref: SidebarWorkRef): void => {
    const stack = [node];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || bySessionId.has(current.session.id)) continue;
      bySessionId.set(current.session.id, ref);
      stack.push(...current.children);
    }
  };
  for (const section of sections) {
    const projectId = section.project.id;
    for (const group of section.groups) {
      if (group.isArchivedBucket) continue;
      if (isGroupWork(group)) {
        const ref: SidebarGroupWorkRef = { kind: 'group', key: worktreeWorkGroupKey(projectId, group), projectId, group };
        groupWorks.push(ref);
        group.sessions.forEach((node) => claim(node, ref));
        continue;
      }
      for (const node of group.sessions) {
        claim(node, { kind: 'session', key: sessionWorkKey(node.session.id), projectId, rootSessionId: node.session.id });
      }
    }
  }
  return { bySessionId, groupWorks };
>>>>>>> bc50ba56a
};

/**
 * The works of the sessions `include` accepts, each once, in the order of the
 * first of their sessions in `orderedSessions` (the sidebar's lifecycle order,
 * so a work moves up when any of its sessions does). With `archiveAnchors`
<<<<<<< HEAD
 * a worktree work also stands where its archived sessions hold it.
 */
export const orderSidebarWorks = (
 orderedSessions: readonly Session[],
 index: SidebarWorkIndex,
 include: (session: Session) => boolean,
 archiveAnchors: ReadonlyMap<string, number> = EMPTY_ANCHORS,
 rootOf?: ReadonlyMap<string, string>,
): SidebarWorkRef[] => {
 const rankByKey = new Map<string, { ref: SidebarWorkRef; rank: number }>();
 orderedSessions.forEach((session, position) => {
  if (!include(session)) return;
  const rootSessionId = rootOf?.get(session.sessionId);
  const ref = index.bySessionId.get(session.sessionId) ?? (rootSessionId ? index.bySessionId.get(rootSessionId) : undefined);
  if (ref && !rankByKey.has(ref.key)) rankByKey.set(ref.key, { ref, rank: position });
 });
 if (archiveAnchors.size === 0) return [...rankByKey.values()].map((entry) => entry.ref);
 for (const ref of index.worktreeWorks) {
  const anchor = archiveAnchors.get(ref.key);
  if (anchor === undefined) continue;
  const listed = rankByKey.get(ref.key);
  rankByKey.set(ref.key, { ref, rank: Math.min(listed?.rank ?? anchor, anchor) });
 }
 return [...rankByKey.values()]
  .sort((a, b) => a.rank - b.rank)
  .map((entry) => entry.ref);
=======
 * (`buildWorktreeArchiveAnchors`) a worktree work also stands where its
 * archived sessions hold it, and is listed for them alone. With `rootOf` a
 * nested session can resolve through its root's registered project work.
 */
export const orderSidebarWorks = (
  orderedSessions: readonly Session[],
  index: SidebarWorkIndex,
  include: (session: Session) => boolean,
  archiveAnchors: ReadonlyMap<string, number> = EMPTY_ANCHORS,
  rootOf?: ReadonlyMap<string, string>,
): SidebarWorkRef[] => {
  const rankByKey = new Map<string, { ref: SidebarWorkRef; rank: number }>();
  orderedSessions.forEach((session, position) => {
    if (!include(session)) return;
    const rootSessionId = rootOf?.get(session.id);
    const ref = index.bySessionId.get(session.id) ?? (rootSessionId ? index.bySessionId.get(rootSessionId) : undefined);
    if (ref && !rankByKey.has(ref.key)) rankByKey.set(ref.key, { ref, rank: position });
  });
  if (archiveAnchors.size === 0) return [...rankByKey.values()].map((entry) => entry.ref);
  for (const ref of index.groupWorks) {
    const anchor = archiveAnchors.get(ref.key);
    if (anchor === undefined) continue;
    const listed = rankByKey.get(ref.key);
    rankByKey.set(ref.key, { ref, rank: Math.min(listed?.rank ?? anchor, anchor) });
  }
  return [...rankByKey.values()].sort((left, right) => left.rank - right.rank).map((entry) => entry.ref);
>>>>>>> bc50ba56a
};

/**
 * The top-level session each session nests under, itself for a top-level
 * one, by the sidebar's nesting (`childrenMap`): a subagent, a review or a
 * promoted /btw belongs to the session it came from, not to a work of its own.
 */
export const buildSessionRootIndex = (
  rootSessions: readonly Session[],
  childrenMap: ReadonlyMap<string, readonly Session[]>,
): ReadonlyMap<string, string> => {
  const rootOf = new Map<string, string>();
  for (const root of rootSessions) {
    const stack: Session[] = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || rootOf.has(current.id)) continue;
      rootOf.set(current.id, root.id);
      stack.push(...(childrenMap.get(current.id) ?? []));
    }
  }
  return rootOf;
};

/**
 * The works In work lists, before Pinned takes its own: a work is in work when
 * its root or a session nested under it, past subagents, is. In work spans
 * projects. A session without a registered project work stays hidden until
 * session admission has checked its configuration and registered its folder.
 */
export const orderInWorkWorks = (
  orderedSessions: readonly Session[],
  index: SidebarWorkIndex,
  rootOf: ReadonlyMap<string, string>,
  isChatDirectory: (directory: string | null | undefined) => boolean,
): SidebarWorkRef[] => orderSidebarWorks(orderedSessions, index, (session) => (
  // A subagent's own work state never puts its run in work: the user works
  // in the sessions they started, as the Done button on a row reads it.
  !session.parentID && !session.time?.archived && !isChatDirectory(session.directory) && isSessionInWork(session)
), EMPTY_ANCHORS, rootOf);

/**
 * Where each worktree work's archived sessions hold it in `orderedSessions`,
 * by work key: a position between two listed sessions, before the first
 * unpinned top-level session that was last active before the newest archived
 * session of the worktree. Archiving a session is not work, so the worktree
 * keeps the place its newest session gave it instead of falling to the next
 * one's. Top-level sessions are listed newest first after the pinned ones,
 * which is what makes the position well defined.
 */
export const buildWorktreeArchiveAnchors = ({
  groupWorks,
  archivedSessions,
  orderedSessions,
  orderValueOf,
  isPinned,
}: {
  groupWorks: readonly SidebarGroupWorkRef[];
  archivedSessions: readonly Session[];
  orderedSessions: readonly Session[];
  /** A session's value in the lifecycle order, newer is higher. */
  orderValueOf: (session: Session) => number;
  isPinned: (session: Session) => boolean;
}): ReadonlyMap<string, number> => {
  if (groupWorks.length === 0 || archivedSessions.length === 0) return EMPTY_ANCHORS;
  const keyByDirectory = new Map(groupWorks.flatMap((ref) => {
    const directory = normalizePath(ref.group.directory ?? null);
    return directory ? [[directory, ref.key] as const] : [];
  }));
  const newestByKey = new Map<string, number>();
  for (const session of archivedSessions) {
    if (session.parentID) continue;
    const key = keyByDirectory.get(normalizePath(session.directory ?? null) ?? '');
    if (!key) continue;
    newestByKey.set(key, Math.max(newestByKey.get(key) ?? Number.NEGATIVE_INFINITY, orderValueOf(session)));
  }
  if (newestByKey.size === 0) return EMPTY_ANCHORS;
  const tops = orderedSessions.flatMap((session, index) => (
    session.parentID || isPinned(session) ? [] : [{ index, value: orderValueOf(session) }]
  ));
  const anchors = new Map<string, number>();
  for (const [key, newest] of newestByKey) {
    const next = tops.find((entry) => entry.value < newest);
    anchors.set(key, (next?.index ?? orderedSessions.length) - 0.5);
  }
  return anchors;
};

const EMPTY_ANCHORS: ReadonlyMap<string, number> = new Map();
