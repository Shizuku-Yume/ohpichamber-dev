import type { Session } from '@openchamber/agent-contract';
import { normalizePath } from '@/lib/pathNormalization';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
<<<<<<< HEAD
||||||| bc50ba56aa
import { useBackgroundShellsStore } from '@/sync/background-shells';
import { useSessionUIStore } from '@/sync/session-ui-store';
=======
import { useBackgroundShellsStore } from '@/sync/background-shells';
import type { ChildStoreManager } from '@/sync/child-store';
import { aggregateLiveSessions } from '@/sync/live-aggregate';
import { useSessionUIStore } from '@/sync/session-ui-store';
>>>>>>> upstream/main

const isInside = (directory: string | null | undefined, root: string): boolean => {
  const normalized = normalizePath(directory ?? null);
  return normalized === root || Boolean(normalized?.startsWith(`${root}/`));
};

<<<<<<< HEAD
/** Sessions working in the worktree, its subdirectories and subsessions included. */
const sessionsInWorktree = (sessions: readonly Session[], path: string): Session[] => {
||||||| bc50ba56aa
/** Sessions working in the worktree, its subdirectories and subsessions included. */
export const sessionsInWorktree = (sessions: readonly Session[], path: string): Session[] => {
=======
export const sessionsInWorktree = (sessions: readonly Session[], path: string): Session[] => {
>>>>>>> upstream/main
  const root = normalizePath(path);
  return root ? sessions.filter((session) => isInside(resolveGlobalSessionDirectory(session), root)) : [];
};

export const withSessionsNowInWorktree = (sessionIds: readonly string[], path: string): string[] => [
  ...new Set([...sessionIds, ...sessionsInWorktree(useGlobalSessionsStore.getState().activeSessions, path).map((session) => session.sessionId)]),
];
<<<<<<< HEAD
||||||| bc50ba56aa

export type WorktreeUse = 'free' | 'busy' | 'inUse' | 'unknown';

/**
 * Whether anything works in the worktree right now, read at the moment of the
 * action. On screen: the directory shown or the open session is there. Busy: a
 * background command runs there, or the host reports a session there running;
 * a failed read is unknown, never free. The host is asked directly because the
 * per-directory status cache is evicted for directories nobody looked at for a
 * while, and a worktree waiting for cleanup is exactly such a directory.
 */
export async function readWorktreeUse(path: string): Promise<WorktreeUse> {
  const root = normalizePath(path) ?? path;
  // Ask the host first and read local state after it answers, so a session
  // opened or started meanwhile counts.
  const statuses = await opencodeClient.getActiveSessionStatuses(root);
  const sessions = sessionsInWorktree(useGlobalSessionsStore.getState().activeSessions, root);
  const currentSessionId = useSessionUIStore.getState().currentSessionId;
  if (isInside(useDirectoryStore.getState().currentDirectory, root) || sessions.some((session) => session.id === currentSessionId)) return 'inUse';
  const shells = useBackgroundShellsStore.getState();
  if ([...shells.byId.values()].some((shell) => isInside(shell.directory, root)) || sessions.some((session) => shells.sessionIds.has(session.id))) {
    return 'busy';
  }
  // One read of the host's map covers every directory; a session missing from it is idle.
  if (!statuses) return 'unknown';
  return sessions.some((session) => session.id in statuses) ? 'busy' : 'free';
}
=======

export const activeSessionsInWorktreeNow = (path: string, liveSessions: readonly Session[]): Session[] => {
  const root = normalizePath(path);
  if (!root) return [];
  const listed = useGlobalSessionsStore.getState().activeSessions;
  const listedIds = new Set(listed.map((session) => session.id));
  const merged = new Map(sessionsInWorktree(listed, root).map((session) => [session.id, session]));
  for (const session of liveSessions) {
    if (!listedIds.has(session.id) && !session.time?.archived && isInside(resolveGlobalSessionDirectory(session), root)) merged.set(session.id, session);
  }
  return [...merged.values()];
};

export const readSessionsInWorktree = (childStores: ChildStoreManager, path: string): Session[] => activeSessionsInWorktreeNow(
  path,
  aggregateLiveSessions(Array.from(childStores.children.values(), (store) => store.getState())),
);

export const subscribeSessionsInWorktree = (childStores: ChildStoreManager, notify: () => void): (() => void) => {
  const stopLive = childStores.subscribeAllSelected((state) => state.session, notify);
  const stopGlobal = useGlobalSessionsStore.subscribe((state, previous) => {
    if (state.activeSessions !== previous.activeSessions) notify();
  });
  return () => {
    stopLive();
    stopGlobal();
  };
};

export type WorktreeUse = 'free' | 'busy' | 'inUse' | 'unknown';

export async function readWorktreeUse(path: string): Promise<WorktreeUse> {
  const root = normalizePath(path) ?? path;
  const statuses = await opencodeClient.getActiveSessionStatuses(root);
  const sessions = sessionsInWorktree(useGlobalSessionsStore.getState().activeSessions, root);
  const currentSessionId = useSessionUIStore.getState().currentSessionId;
  if (isInside(useDirectoryStore.getState().currentDirectory, root) || sessions.some((session) => session.id === currentSessionId)) return 'inUse';
  const shells = useBackgroundShellsStore.getState();
  if ([...shells.byId.values()].some((shell) => isInside(shell.directory, root)) || sessions.some((session) => shells.sessionIds.has(session.id))) {
    return 'busy';
  }
  if (!statuses) return 'unknown';
  return sessions.some((session) => session.id in statuses) ? 'busy' : 'free';
}
>>>>>>> upstream/main
