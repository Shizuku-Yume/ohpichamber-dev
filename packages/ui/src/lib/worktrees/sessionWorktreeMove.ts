import type { Session, SessionMoveToWorktreeResult } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import { toast } from '@/components/ui';
import { checkIsGitRepository, getGitStatus, setGitWorktreeTitle } from '@/lib/gitApi';
import { carriedWorkTitleOwner } from '@/lib/sessionWorkTitle';
import { normalizePath } from '@/lib/pathNormalization';
import { resolveFolderProjectRef, resolveProjectRef } from '@/lib/worktreeSessionCreator';
import { generateBranchName } from '@/lib/git/branchNameGenerator';
import { canonicalClient } from '@/api/canonicalClient';
import { getLatestWorktreeMetadata, listProjectWorktrees } from '@/lib/worktrees/worktreeManager';
import { checkoutHoldsDirectory, findWorktreeHoldingDirectory } from '@/lib/worktrees/worktreePaths';
import { resolveWorktreeStartDirectory } from '@/lib/worktrees/worktreeStartDirectory';
import { refreshGlobalSessionsForDirectories } from '@/stores/useGlobalSessionsStore';
import { isAmbiguousSendFailure } from '@/sync/send-failure-classification';
import { isSessionBusyNow, moveSessionToDirectory, readSessionsLiveActivity } from '@/sync/session-actions';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { WorktreeMetadata } from '@/types/worktree';
import { create } from 'zustand';

export type SessionTreeMoveMessages = {
  success: string;
  failure: string;
  /** Description under the failure toast when the answer was lost and the new worktree was kept. */
  outcomeUnknown: string;
};

export const buildSessionTreeMoveMessages = (
  t: (key: I18nKey) => string,
  keys: { success: I18nKey; failure: I18nKey },
): SessionTreeMoveMessages => ({
  success: t(keys.success),
  failure: t(keys.failure),
  outcomeUnknown: t('sessions.sidebar.session.moveToWorktree.outcomeUnknown'),
});

/** The move request lost its answer after a new worktree was created; the worktree stays. */
class SessionMoveOutcomeUnknownError extends Error {
  constructor(cause: Error) {
    super(cause.message, { cause });
    this.name = 'SessionMoveOutcomeUnknownError';
  }
}

export type SessionTreeMoveIntent =
  | {
      kind: 'existing';
      root: Session;
      descendants: Session[];
      sourceDirectory: string;
      destination: WorktreeMetadata;
      messages: SessionTreeMoveMessages;
    }
  | {
      kind: 'quick';
      root: Session;
      descendants: Session[];
      sourceDirectory: string;
      messages: SessionTreeMoveMessages;
    }
  | {
      // The conversation moves to a folder the user picked, usually a
      // project's root; files the session wrote stay where they are.
      kind: 'project';
      root: Session;
      descendants: Session[];
      sourceDirectory: string;
      projectDirectory: string;
      messages: SessionTreeMoveMessages;
    };

// OpenCode 2.x `session.move` relocates the session only; uncommitted changes
// stay in the source worktree. v1 could carry them along and asked the user
// which to do, so this module once held a confirmation step. There is nothing
// to choose now, and a move starts as soon as it is requested.
type SessionMoveState = {
  pendingSessionIds: Set<string>;
};

const useSessionMoveState = create<SessionMoveState>(() => ({
  pendingSessionIds: new Set(),
}));

export const useIsSessionWorktreeMovePending = (sessionId: string): boolean =>
  useSessionMoveState((state) => state.pendingSessionIds.has(sessionId));

const setSessionMovePending = (sessionId: string, pending: boolean): void => {
  useSessionMoveState.setState((state) => {
    if (state.pendingSessionIds.has(sessionId) === pending) return state;
    const pendingSessionIds = new Set(state.pendingSessionIds);
    if (pending) pendingSessionIds.add(sessionId);
    else pendingSessionIds.delete(sessionId);
    return { ...state, pendingSessionIds };
  });
};

const resolveSourceBranch = async (directory: string, projectDirectory: string): Promise<string> => {
  try {
    const status = await getGitStatus(directory, { mode: 'light' });
    const currentBranch = status.current?.trim();
    if (currentBranch) return currentBranch;
  } catch {
    // Fall back to discovered worktree metadata below.
  }

  const normalizedDirectory = normalizePath(directory);
  const normalizedProjectDirectory = normalizePath(projectDirectory) ?? projectDirectory;
  const worktrees = useSessionUIStore.getState().availableWorktreesByProject;
  const metadata = findWorktreeHoldingDirectory(
    worktrees.get(normalizedProjectDirectory) ?? worktrees.get(projectDirectory) ?? [],
    normalizedDirectory ?? directory,
  );
  const mappedBranch = metadata?.branch?.trim();
  if (mappedBranch) return mappedBranch;

  throw new Error('Unable to determine the current branch');
};

<<<<<<< HEAD
// Scans every child store instead of the source directory's: a session's live
// status can be reported by a directory other than the one that wins the
// directory dedup, and a directory-scoped read would then see no status at all
// and move a running session.
const assertSessionsIdle = (sessions: Session[]): void => {
  for (const session of sessions) {
    const activity = getSessionLiveActivity(session.sessionId);
    if (activity === 'unknown') throw new Error('Session status is unavailable');
    if (activity === 'active') throw new Error('Session is not idle');
  }
=======
// A session's live status can be reported by a directory other than the one
// that wins the directory dedup, so the answer covers every child store. The
// source directory only picks the server asked when no store knows: the host,
// or the isolated space that holds it.
const assertSessionsIdle = async (sessions: Session[], sourceDirectory: string): Promise<void> => {
  const activity = await readSessionsLiveActivity(sessions.map((session) => session.id), sourceDirectory);
  if (activity === 'unknown') throw new Error('Session status is unavailable');
  if (activity === 'active') throw new Error('Session is not idle');
>>>>>>> bc50ba56a
};

type RollbackFailure = {
  sessionId: string;
  error: Error;
};

/** Rollback left sessions in the destination; the toast names them. */
class IncompleteRollbackError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'IncompleteRollbackError';
  }
}

const createIncompleteRollbackError = (moveError: Error, rollbackFailures: RollbackFailure[]): Error => {
  const rollbackSummary = rollbackFailures
    .map(({ sessionId, error }) => `${sessionId}: ${error.message}`)
    .join(', ');
  return new IncompleteRollbackError(
    `Session move partially failed and could not be fully rolled back: ${moveError.message}. Rollback failures: ${rollbackSummary}`,
    { moveError, rollbackFailures },
  );
};

const rollbackMovedSessions = async (
  sessions: Session[],
  sourceDirectory: string,
  worktreeDirectory: string,
  previousMetadata: ReadonlyMap<string, WorktreeMetadata | undefined>,
): Promise<RollbackFailure[]> => {
  const failures: RollbackFailure[] = [];
  for (const session of [...sessions].reverse()) {
    if (isSessionBusyNow(session.sessionId)) {
      failures.push({ sessionId: session.sessionId, error: new Error('Session is not idle') });
      continue;
    }
    try {
      await moveSessionToDirectory(session, worktreeDirectory, sourceDirectory);
      useSessionUIStore.getState().setWorktreeMetadata(session.sessionId, previousMetadata.get(session.sessionId) ?? null, sourceDirectory);
    } catch (error) {
      failures.push({
        sessionId: session.sessionId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
  return failures;
};

const refreshMovedDirectories = async (sourceDirectory: string, destinationDirectory: string | undefined): Promise<void> => {
  const directories = destinationDirectory ? [sourceDirectory, destinationDirectory] : [sourceDirectory];
  try {
    await refreshGlobalSessionsForDirectories(directories);
  } catch (error) {
    // Direct action updates already reconciled both stores. Keep the outcome
    // unchanged if this best-effort authoritative refresh is unavailable.
    console.warn('[session-worktree-move] Failed to refresh moved sessions', error);
  }
};

const moveSessionTreeTransaction = async (
  input: {
    root: Session;
    descendants: Session[];
    sourceDirectory: string;
  },
  prepareDestination: () => Promise<{
    directory: string;
    /** Null for a project root, which is not a worktree. */
    metadata: WorktreeMetadata | null;
    onMoveFailure?: (error: Error) => Promise<never>;
  }>,
): Promise<string> => {
  if (useSessionMoveState.getState().pendingSessionIds.has(input.root.sessionId)) {
    throw new Error('Session move already in progress');
  }
  setSessionMovePending(input.root.sessionId, true);

  try {
    const sessions = [...input.descendants, input.root];
    const previousMetadata = new Map(
      sessions.map((session) => [
        session.sessionId,
        useSessionUIStore.getState().getWorktreeMetadata(session.sessionId),
      ]),
    );
    await assertSessionsIdle(sessions, input.sourceDirectory);

    let destination: Awaited<ReturnType<typeof prepareDestination>> | null = null;
    const moved: Session[] = [];
    let moveOutcomeUnknown = false;
    try {
      destination = await prepareDestination();
      for (const [index, session] of sessions.entries()) {
        // Setup and earlier moves can take long enough for a not-yet-moved
        // session to start running, so re-check the remaining source tree
        // immediately before each move. The root moves last.
        await assertSessionsIdle(sessions.slice(index), input.sourceDirectory);
        try {
          await moveSessionToDirectory(session, input.sourceDirectory, destination.directory);
        } catch (error) {
          // A transport failure leaves the outcome unknown: the server may have
          // moved the session before the response was lost. Definite rejections
          // keep this false.
          if (isAmbiguousSendFailure(error)) moveOutcomeUnknown = true;
          throw error;
        }
        moved.push(session);
        if (session.sessionId === input.root.sessionId) continue;
        useSessionUIStore.getState().setWorktreeMetadata(session.sessionId, destination.metadata ? getLatestWorktreeMetadata(destination.metadata) : null, destination.directory);
      }
    } catch (error) {
      const moveError = error instanceof Error ? error : new Error(String(error));
      const rollbackFailures = await rollbackMovedSessions(
        moved,
        input.sourceDirectory,
        destination?.directory ?? input.sourceDirectory,
        previousMetadata,
      );
      if (moveOutcomeUnknown) {
        // The move request may have completed server-side, so the session's
        // directory is unknown too. Reconcile both directories now instead of
        // letting the sidebar contradict the toast until the next poll.
        await refreshMovedDirectories(input.sourceDirectory, destination?.directory);
      }
      if (rollbackFailures.length > 0) {
        throw createIncompleteRollbackError(moveError, rollbackFailures);
      }
      // OpenCode admits a move durably before it answers, so a lost response
      // does not cancel it: the session may already sit in the destination or
      // land there once the inbox drains. Only a definite rejection proves the
      // destination is unused and safe to delete.
      if (destination?.onMoveFailure && !moveOutcomeUnknown) {
        return destination.onMoveFailure(moveError);
      }
      if (destination?.onMoveFailure && moveOutcomeUnknown) {
        throw new SessionMoveOutcomeUnknownError(moveError);
      }
      throw moveError;
    }
    useSessionUIStore.getState().setWorktreeMetadata(input.root.sessionId, destination.metadata ? getLatestWorktreeMetadata(destination.metadata) : null, destination.directory);

    await refreshMovedDirectories(input.sourceDirectory, destination.directory);
    return destination.directory;
  } finally {
    setSessionMovePending(input.root.sessionId, false);
  }
};

export const moveSessionTreeToExistingWorktree = async (input: {
  root: Session;
  descendants: Session[];
  sourceDirectory: string;
  destination: WorktreeMetadata;
}): Promise<string> => {
  const normalizedSourceDirectory = normalizePath(input.sourceDirectory) ?? input.sourceDirectory;
  const normalizedDestinationDirectory = normalizePath(input.destination.path) ?? input.destination.path;
  if (checkoutHoldsDirectory(normalizedDestinationDirectory, normalizedSourceDirectory)) {
    throw new Error('Source and destination are the same');
  }
  if (input.destination.worktreeStatus !== 'ready') {
    throw new Error('Destination worktree is not ready');
  }

  return moveSessionTreeTransaction(input, async () => {
    // The project of the session being moved decides the folder, as the server does;
    // the destination worktree can be shared by several projects of one repository.
    const project = await resolveFolderProjectRef(input.sourceDirectory);
    return {
      directory: project ? await resolveWorktreeStartDirectory(project, input.destination.path) : input.destination.path,
      metadata: input.destination,
    };
  });
};

const moveSessionTreeToProject = async (input: {
  root: Session;
  descendants: Session[];
  sourceDirectory: string;
  projectDirectory: string;
}): Promise<string> => {
  if ((normalizePath(input.sourceDirectory) ?? input.sourceDirectory) === (normalizePath(input.projectDirectory) ?? input.projectDirectory)) {
    throw new Error('Source and destination are the same');
  }
  return moveSessionTreeTransaction(input, async () => ({ directory: input.projectDirectory, metadata: null }));
};

/**
 * The session tree moves into a worktree the Host makes for it: the Host
 * creates the checkout, carries whatever the caller names, and relocates the
 * session last, so a failure on any of those is rolled back there and this
 * client never holds a half-made checkout. The session is moved alone; a
 * descendant that stays behind is its own session, not a broken tree.
 */
const moveSessionTreeToNewWorktree = async (input: {
  root: Session;
  sourceDirectory: string;
<<<<<<< HEAD
  carry: readonly string[];
}): Promise<SessionMoveToWorktreeResult> => {
  const project = resolveProjectRef(input.sourceDirectory);
  if (!project) throw new Error('Unable to find the project for this session');
  const run = async (): Promise<SessionMoveToWorktreeResult> => {
=======
}): Promise<string> => {
  const directory = await moveSessionTreeTransaction(input, async () => {
    const project = resolveProjectRef(input.sourceDirectory);
    if (!project) throw new Error('Unable to find the project for this session');

>>>>>>> bc50ba56a
    const sourceBranch = await checkIsGitRepository(input.sourceDirectory)
      ? await resolveSourceBranch(input.sourceDirectory, project.path)
      : null;
    const name = generateBranchName();
    const result = await canonicalClient.moveSessionToWorktree(input.root.sessionId, {
      worktree: sourceBranch ? { name, startRef: sourceBranch } : { name },
      carry: [...input.carry],
    });
    // The Host answers with the relocated sessions; adopt them and the new
    // checkout before the next listing, so the sidebar shows where they are.
    const destinationDirectory = result.directory;
    const metadata: WorktreeMetadata = {
      path: result.worktree.path,
      projectDirectory: project.path,
      branch: result.worktree.branch,
      label: result.worktree.branch || result.worktree.name,
      name: result.worktree.name,
      worktreeStatus: 'ready',
      worktreeSource: 'created-for-session',
    };
<<<<<<< HEAD
    useSessionUIStore.getState().setWorktreeMetadata(input.root.sessionId, metadata, destinationDirectory);
    for (const moved of result.sessions ?? []) {
      if (moved.sessionId === input.root.sessionId) continue;
      useSessionUIStore.getState().setWorktreeMetadata(moved.sessionId, metadata, destinationDirectory);
    }
    await listProjectWorktrees(project, { force: true }).catch(() => null);
    await refreshMovedDirectories(input.sourceDirectory, destinationDirectory);
    return result;
  };
  if (useSessionMoveState.getState().pendingSessionIds.has(input.root.sessionId)) throw new Error('Session move already in progress');
  const previousMetadata = useSessionUIStore.getState().getWorktreeMetadata(input.root.sessionId);
  setSessionMovePending(input.root.sessionId, true);
  try {
    return await run();
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    // A lost answer may have moved the session; the Host keeps the checkout
    // either way, so the UI says the outcome is unknown instead of claiming a
    // failure. Both directories are reconciled so the sidebar stops
    // contradicting the toast before the next poll.
    if (isAmbiguousSendFailure(failure)) {
      await refreshMovedDirectories(input.sourceDirectory, undefined);
      throw new SessionMoveOutcomeUnknownError(failure);
    }
    useSessionUIStore.getState().setWorktreeMetadata(input.root.sessionId, previousMetadata ?? null, input.sourceDirectory);
    throw failure;
  } finally {
    setSessionMovePending(input.root.sessionId, false);
  }
=======
  });
  // Seed from the current session title. Generated titles stay agent-owned so
  // work.name can replace them; an explicit user title keeps its ownership.
  const taskTitle = input.root.title?.trim();
  if (taskTitle) {
    await setGitWorktreeTitle(directory, taskTitle, carriedWorkTitleOwner(input.root.metadata)).catch((error) => {
      console.warn('[session-worktree-move] Failed to carry the task name into the new worktree', error);
    });
  }
  return directory;
>>>>>>> bc50ba56a
};

const executeSessionTreeMove = (intent: SessionTreeMoveIntent): void => {
  const movePromise = intent.kind === 'existing'
    ? moveSessionTreeToExistingWorktree({
        root: intent.root,
        descendants: intent.descendants,
        sourceDirectory: intent.sourceDirectory,
        destination: intent.destination,
      })
    : intent.kind === 'project'
    ? moveSessionTreeToProject({
        root: intent.root,
        descendants: intent.descendants,
        sourceDirectory: intent.sourceDirectory,
        projectDirectory: intent.projectDirectory,
      })
    // The Host moves the session family itself, so this asks for the root only.
    : moveSessionTreeToNewWorktree({
        root: intent.root,
        sourceDirectory: intent.sourceDirectory,
        carry: [],
      });

  void movePromise
    .then(() => toast.success(intent.messages.success))
    .catch((error) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      toast.error(intent.messages.failure, {
        description: failure instanceof SessionMoveOutcomeUnknownError ? intent.messages.outcomeUnknown : failure.message,
      });
    });
};

export const requestSessionTreeMove = (intent: SessionTreeMoveIntent): void => {
  if (useSessionMoveState.getState().pendingSessionIds.has(intent.root.sessionId)) return;
  executeSessionTreeMove(intent);
};
