import type { GitStatus } from '@/lib/api/types';
import type { Session } from '@openchamber/agent-contract';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { normalizePath } from '@/lib/pathNormalization';
import type { WorktreeMetadata } from '@/types/worktree';
import type { SourceControlProvider } from '@/lib/source-control/types';

export type MergedWorktreeCandidate = {
  worktree: WorktreeMetadata;
  project: { id: string; path: string };
  prNumber: number;
  provider?: SourceControlProvider | null;
  mergedHeadSha: string | null;
};

<<<<<<< HEAD
export type MergedWorktreeDecision =
  /** Someone is still there: a running agent or the session on screen. Ask again later. */
  | { action: 'wait' }
  /** Nothing can be lost: archive the sessions, remove the worktree and its local branch. */
  | { action: 'remove' }
  /** Something exists only here (uncommitted work or commits after the merge): archive, keep the worktree. */
  | { action: 'archive-only' };

/**
 * The worktree is removable only when it holds nothing the merged PR does
 * not: no uncommitted changes, and no commit outside the PR's history. A
 * checkout behind the PR's last commit qualifies: the PR gained commits on
 * the host (Update branch, a bot, an applied suggestion) after this pull.
 */
export const decideMergedWorktreeCleanup = (input: {
  sessionsBusyOrUnknown: boolean;
  sessionOpen: boolean;
  isDirty: boolean | null;
  /** Commits here the merged PR lacks; null when git could not tell. */
  hasUnmergedCommits: boolean | null;
}): MergedWorktreeDecision => {
  if (input.sessionsBusyOrUnknown || input.sessionOpen) return { action: 'wait' };
  const nothingToLose = input.isDirty === false && input.hasUnmergedCommits === false;
  return nothingToLose ? { action: 'remove' } : { action: 'archive-only' };
};

/**
 * Whether the checkout has commits the merged PR lacks. The PR's last commit
 * answers it when this clone has that commit. A checkout behind a PR that
 * gained commits on the host may lack it, and then a branch with nothing left
 * to push has lost nothing either. Null when neither can tell.
 */
||||||| bc50ba56aa
/**
 * Whether the checkout has commits the merged PR lacks. The PR's last commit
 * answers it when this clone has that commit. A checkout behind a PR that
 * gained commits on the host may lack it, and then a branch with nothing left
 * to push has lost nothing either. Null when neither can tell.
 */
=======
>>>>>>> upstream/main
export const hasUnmergedCommits = async (input: {
  mergedHeadSha: string | null;
  status: Pick<GitStatus, 'tracking' | 'ahead'>;
  hasCommitsAfter: (sha: string) => Promise<boolean>;
}): Promise<boolean | null> => {
  if (input.mergedHeadSha) {
    try {
      return await input.hasCommitsAfter(input.mergedHeadSha);
    } catch {
      // The PR's last commit was never fetched into this clone.
    }
  }
  return input.status.tracking ? input.status.ahead > 0 : null;
};

/** Sessions working in the worktree, its subdirectories included. */
const sessionsInWorktree = (sessions: readonly Session[], worktreePath: string): Session[] => {
  const root = normalizePath(worktreePath);
  if (!root) return [];
  return sessions.filter((session) => {
    const directory = normalizePath(resolveGlobalSessionDirectory(session));
    return directory === root || Boolean(directory?.startsWith(`${root}/`));
  });
};

export type MergedWorktreeOutcome =
  | { kind: 'removed'; candidate: MergedWorktreeCandidate; archivedCount: number }
  | { kind: 'archived'; candidate: MergedWorktreeCandidate; archivedCount: number }
  | { kind: 'failed'; candidate: MergedWorktreeCandidate; error: Error };

export type MergedWorktreeCleanupDeps = {
  listCandidates: () => MergedWorktreeCandidate[];
<<<<<<< HEAD
  /** Sessions are archived once per worktree and PR, so work continued in a kept worktree is never archived again. */
||||||| bc50ba56aa
  /** Archived or taken back for this PR, or waiting out the delay after a failed archive. */
=======
>>>>>>> upstream/main
  isHandled: (candidate: MergedWorktreeCandidate) => boolean;
  markHandled: (candidate: MergedWorktreeCandidate) => void;
<<<<<<< HEAD
  getActiveSessions: () => readonly Session[];
  isSessionIdle: (sessionId: string) => boolean;
  isSessionOpen: (sessionId: string) => boolean;
  /** The worktree is the directory on screen, e.g. a new-session draft there. */
  isWorktreeOpen: (path: string) => boolean;
  /** Something here archives or removes it right now (Done, a delete). */
||||||| bc50ba56aa
  /** The archive failed: try again later, each time after a longer delay. */
  markFailed: (candidate: MergedWorktreeCandidate) => void;
  /** Sessions to archive with the worktree, its subdirectories and subsessions included. */
  getWorktreeSessions: (path: string) => readonly Session[];
  /**
   * Whether anything works there now: an agent or a background command runs,
   * or it is on screen. Only "free" lets the archive go; "unknown" waits.
   */
  readWorktreeUse: (path: string) => Promise<'free' | 'busy' | 'inUse' | 'unknown'>;
  /** Something here archives or removes it right now (Done, a delete). */
=======
  markFailed: (candidate: MergedWorktreeCandidate) => void;
  getWorktreeSessions: (path: string) => readonly Session[];
  readWorktreeUse: (path: string) => Promise<'free' | 'busy' | 'inUse' | 'unknown'>;
>>>>>>> upstream/main
  isWorktreeRemoving: (path: string) => boolean;
<<<<<<< HEAD
  /** The user restored it from the archive since the last pass; answers once. */
||||||| bc50ba56aa
  /** False once the app switched servers since the pass began. */
  isCurrentRuntime: () => boolean;
  /** The user restored it from the archive since the last pass; answers once. */
=======
  isCurrentRuntime: () => boolean;
>>>>>>> upstream/main
  takeRestored: (path: string) => boolean;
<<<<<<< HEAD
  readWorktreeState: (candidate: MergedWorktreeCandidate) => Promise<{ isDirty: boolean | null; hasUnmergedCommits: boolean | null }>;
  archiveSessions: (sessionIds: string[]) => Promise<{ failedIds: string[] }>;
  removeWorktree: (candidate: MergedWorktreeCandidate) => Promise<void>;
  /** Archives the worktree with its sessions through the Host archive route. */
||||||| bc50ba56aa
  /** Archives the worktree with these sessions; rejects when either does not go. */
=======
>>>>>>> upstream/main
  archiveWorktree: (candidate: MergedWorktreeCandidate, sessions: readonly Session[]) => Promise<void>;
  report: (outcome: MergedWorktreeOutcome) => void;
};

<<<<<<< HEAD
/**
 * One pass over the merged worktrees. Sessions are archived at most once; a
 * kept worktree nobody works in is checked again, so it goes once its last
 * changes are cleaned up or pulled. One still in use is left for a later
 * pass, and one failure never stops the others.
 */
export async function runMergedWorktreeCleanup(
  deps: MergedWorktreeCleanupDeps,
  /** Kept worktrees cost git reads every time, so only the periodic pass rechecks them. */
  options: { recheckKept: boolean } = { recheckKept: true },
): Promise<void> {
||||||| bc50ba56aa
/**
 * One pass over the merged worktrees: each one nobody works in is archived
 * with its sessions. An archive keeps every change and commit, so nothing has
 * to be checked for loss first. One still in use is left for a later pass,
 * and one failure never stops the others.
 */
export async function runMergedWorktreeCleanup(deps: MergedWorktreeCleanupDeps): Promise<void> {
=======
export async function runMergedWorktreeCleanup(deps: MergedWorktreeCleanupDeps): Promise<void> {
>>>>>>> upstream/main
  for (const candidate of deps.listCandidates()) {
<<<<<<< HEAD
    if (deps.isWorktreeRemoving(candidate.worktree.path)) continue;
    // Restoring a merged worktree is the user taking it back: this PR is done
    // with, and only a later one cleans it up again.
||||||| bc50ba56aa
    if (deps.isHandled(candidate)) continue;
    // Restoring a merged worktree is the user taking it back: this PR is done
    // with, and only a later one cleans it up again.
=======
    if (deps.isHandled(candidate)) continue;
>>>>>>> upstream/main
    if (deps.takeRestored(candidate.worktree.path)) {
      deps.markHandled(candidate);
      continue;
    }
<<<<<<< HEAD
    const handled = deps.isHandled(candidate);
    if (handled && !options.recheckKept) continue;
    const sessions = sessionsInWorktree(deps.getActiveSessions(), candidate.worktree.path);
    const sessionIds = sessions.map((session) => session.sessionId);
    // Sessions in a kept worktree mean the work went on there.
    if (handled && sessionIds.length > 0) continue;
||||||| bc50ba56aa
    // Read before the removal check: a Done may start while the host answers.
    const use = await deps.readWorktreeUse(candidate.worktree.path);
    // Another server's worktree with the same path must not be archived.
    if (!deps.isCurrentRuntime()) return;
    if (use !== 'free' || deps.isWorktreeRemoving(candidate.worktree.path)) continue;
    const sessions = deps.getWorktreeSessions(candidate.worktree.path);
=======
    const use = await deps.readWorktreeUse(candidate.worktree.path);
    if (!deps.isCurrentRuntime()) return;
    if (use !== 'free' || deps.isWorktreeRemoving(candidate.worktree.path)) continue;
    const sessions = deps.getWorktreeSessions(candidate.worktree.path);
>>>>>>> upstream/main

    let decision: MergedWorktreeDecision;
    try {
      const state = await deps.readWorktreeState(candidate);
      decision = decideMergedWorktreeCleanup({
        // Re-read after the git round trip: an agent may have started meanwhile.
        sessionsBusyOrUnknown: sessionIds.some((id) => !deps.isSessionIdle(id)),
        sessionOpen: sessionIds.some((id) => deps.isSessionOpen(id)) || deps.isWorktreeOpen(candidate.worktree.path),
        isDirty: state.isDirty,
        hasUnmergedCommits: state.hasUnmergedCommits,
      });
    } catch {
      // Git could not answer; nothing is decided on a guess. Try again next pass.
      continue;
    }
    if (decision.action === 'wait') continue;
    if (handled && decision.action !== 'remove') continue;

    if (!handled) deps.markHandled(candidate);
    try {
      if (decision.action === 'remove') {
        // Plain worktree removal archives selected sessions here. The archive
        // path below delegates all session effects to the Host.
        if (sessionIds.length > 0) {
          const { failedIds } = await deps.archiveSessions(sessionIds);
          if (failedIds.length > 0) throw new Error(`Could not archive ${failedIds.length} session(s)`);
        }
        await deps.removeWorktree(candidate);
        deps.report({ kind: 'removed', candidate, archivedCount: sessionIds.length });
      } else {
        // A kept worktree is archived with its sessions; the archive holds every
        // change and commit, so nothing is lost and the folder can go.
        await deps.archiveWorktree(candidate, sessions);
        deps.report({ kind: 'archived', candidate, archivedCount: sessionIds.length });
      }
    } catch (error) {
      deps.report({ kind: 'failed', candidate, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }
}
