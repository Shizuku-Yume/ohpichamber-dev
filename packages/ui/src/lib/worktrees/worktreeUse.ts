import type { Session } from '@openchamber/agent-contract';
import { normalizePath } from '@/lib/pathNormalization';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';

const isInside = (directory: string | null | undefined, root: string): boolean => {
  const normalized = normalizePath(directory ?? null);
  return normalized === root || Boolean(normalized?.startsWith(`${root}/`));
};

/** Sessions working in the worktree, its subdirectories and subsessions included. */
export const sessionsInWorktree = (sessions: readonly Session[], path: string): Session[] => {
  const root = normalizePath(path);
  return root ? sessions.filter((session) => isInside(resolveGlobalSessionDirectory(session), root)) : [];
};

/**
 * `sessionIds` and the sessions working in the worktree now. A retried delete
 * can come long after the first attempt, so it takes the sessions started
 * there since then as well.
 */
export const withSessionsNowInWorktree = (sessionIds: readonly string[], path: string): string[] => [
  ...new Set([...sessionIds, ...sessionsInWorktree(useGlobalSessionsStore.getState().activeSessions, path).map((session) => session.sessionId)]),
];
