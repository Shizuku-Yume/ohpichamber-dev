import { getGitLog, getGitStatus } from '@/lib/gitApi';
import type { Session } from '@openchamber/agent-contract';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { isNothingLost, type OverviewWorktreeLosses } from '@/lib/overview/overviewModel';
import { normalizePath } from '@/lib/pathNormalization';
import { isSessionInWork } from '@/lib/sessionWorkMetadata';
import { hasUnmergedCommits } from '@/lib/worktrees/mergedWorktreeCleanup';
import { removeProjectWorktree } from '@/lib/worktrees/worktreeManager';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useBackgroundShellsStore } from '@/sync/background-shells';
import { archiveSessions, setSessionWorkState } from '@/sync/session-actions';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { WorktreeMetadata } from '@/types/worktree';

export type OverviewWorktreeGit = { losses: OverviewWorktreeLosses; lastCommitAt: number | null };

export type OverviewWorktreeTarget = {
  worktree: WorktreeMetadata;
  project: { id: string; path: string };
  mergedHeadSha: string | null;
};

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
 * What removing the worktree would lose. Merged: anything past the PR's last
 * commit. Otherwise: anything its upstream (or the base `ahead` was counted
 * against) lacks; with neither, git cannot tell and the answer is null.
 */
export async function readOverviewWorktreeGit(target: OverviewWorktreeTarget): Promise<OverviewWorktreeGit> {
  const path = target.worktree.path;
  const status = await getGitStatus(path, { fresh: true });
  const unpushed = target.mergedHeadSha
    ? await hasUnmergedCommits({
      mergedHeadSha: target.mergedHeadSha,
      status,
      hasCommitsAfter: async (sha) => (await getGitLog(path, { from: sha, to: 'HEAD', maxCount: 1 })).all.length > 0,
    })
    : (status.tracking || status.aheadBase ? status.ahead > 0 : null);
  const log = await getGitLog(path, { maxCount: 1 });
  const lastCommitAt = log.latest ? Date.parse(log.latest.date) : Number.NaN;
  return {
    losses: { uncommittedFiles: status.files.length, unpushed },
    lastCommitAt: Number.isFinite(lastCommitAt) ? lastCommitAt : null,
  };
}

export async function markOverviewSessionsDone(sessions: readonly Session[]): Promise<Session[]> {
  const failed: Session[] = [];
  for (const session of sessions) {
    try {
      await setSessionWorkState(session.sessionId, resolveGlobalSessionDirectory(session) ?? session.displayPath, 'done');
    } catch {
      failed.push(session);
    }
  }
  return failed;
}

export type WorktreeUse = 'free' | 'busy' | 'inUse' | 'unknown';

/**
 * Whether anything works in the worktree right now, read at the moment of the
 * action. On screen: the directory shown or the open session is there. Busy: a
 * background command runs there, or the host reports a session there running;
 * a failed read is unknown, never free.
 */
export async function readWorktreeUse(path: string): Promise<WorktreeUse> {
  const root = normalizePath(path) ?? path;
  const sessions = sessionsInWorktree(useGlobalSessionsStore.getState().activeSessions, root);
  const currentSessionId = useSessionUIStore.getState().currentSessionId;
  if (isInside(useDirectoryStore.getState().currentDirectory, root) || sessions.some((session) => session.sessionId === currentSessionId)) return 'inUse';
  const shells = useBackgroundShellsStore.getState();
  if ([...shells.byId.values()].some((shell) => isInside(shell.directory, root)) || sessions.some((session) => shells.sessionIds.has(session.sessionId))) {
    return 'busy';
  }
  const activeIds = useGlobalSessionStatusStore.getState().activeSessionIds;
  return sessions.some((session) => activeIds.has(session.sessionId)) ? 'busy' : 'free';
}

export type OverviewRemoveOutcome =
  | { kind: 'removed' }
  | { kind: 'busy' | 'inUse' | 'unknown' }
  | { kind: 'changed' }
  | { kind: 'failed'; error: Error };

const losesMore = (now: OverviewWorktreeLosses, agreed: OverviewWorktreeLosses): boolean => (
  now.uncommittedFiles > agreed.uncommittedFiles
  || (now.unpushed !== false && agreed.unpushed === false)
  || (now.unpushed === null && agreed.unpushed !== null)
);

export async function removeOverviewWorktree(input: {
  target: OverviewWorktreeTarget;
  agreed: OverviewWorktreeLosses;
  skipTeardown?: boolean;
}): Promise<OverviewRemoveOutcome> {
  const { target, agreed } = input;
  const path = target.worktree.path;
  try {
    const before = await readWorktreeUse(path);
    if (before !== 'free') return { kind: before };
    const git = await readOverviewWorktreeGit(target);
    if (isNothingLost(agreed) ? !isNothingLost(git.losses) : losesMore(git.losses, agreed)) return { kind: 'changed' };
    const after = await readWorktreeUse(path);
    if (after !== 'free') return { kind: after };

    const sessions = sessionsInWorktree(useGlobalSessionsStore.getState().activeSessions, path);
    await markOverviewSessionsDone(sessions.filter((session) => !session.parentSessionId && isSessionInWork(session)));
    if (sessions.length > 0) {
      const { failedIds } = await archiveSessions(sessions.map((session) => session.sessionId));
      if (failedIds.length > 0) throw new Error(`Could not archive ${failedIds.length} session(s)`);
    }
    await removeProjectWorktree(target.project, target.worktree, { deleteLocalBranch: true, skipTeardown: input.skipTeardown });
    return { kind: 'removed' };
  } catch (error) {
    return { kind: 'failed', error: error instanceof Error ? error : new Error(String(error)) };
  }
}
