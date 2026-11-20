import { WorktreeKeepStoppedError, moveSessionsThenRemoveWorktree } from '@/lib/worktrees/worktreeRemovalFlow';
import type { WorktreeKeepStop } from '@/lib/worktrees/worktreeRemovalFlow';
import type { Session, SessionMoveToWorktreeResult } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import { toast } from '@/components/ui';
import { checkIsGitRepository, getGitStatus } from '@/lib/gitApi';
import { normalizePath } from '@/lib/pathNormalization';
import { resolveFolderProjectRef, resolveProjectRef } from '@/lib/worktreeSessionCreator';
import { generateBranchName } from '@/lib/git/branchNameGenerator';
import { canonicalClient } from '@/api/canonicalClient';
import { getLatestWorktreeMetadata, listProjectWorktrees } from '@/lib/worktrees/worktreeManager';
import { checkoutHoldsDirectory, findWorktreeHoldingDirectory } from '@/lib/worktrees/worktreePaths';
import { resolveWorktreeStartDirectory } from '@/lib/worktrees/worktreeStartDirectory';
import { refreshGlobalSessionsForDirectories } from '@/stores/useGlobalSessionsStore';
import { isAmbiguousSendFailure } from '@/sync/send-failure-classification';
import { getSessionLiveActivity, moveSessionToDirectory } from '@/sync/session-actions';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { WorktreeMetadata } from '@/types/worktree';
import { create } from 'zustand';
import { captureRuntimeInstance, getRuntimeKey } from '@/lib/runtime-switch';
import { resolveWorkspaceDirectory } from '@/stores/globalSessions';

export type SessionTreeMoveMessages = {
  success: string;
  failure: string;
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

export class SessionMoveOutcomeUnknownError extends Error {
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
      kind: 'project';
      root: Session;
      descendants: Session[];
      sourceDirectory: string;
      projectDirectory: string;
      messages: SessionTreeMoveMessages;
    };

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
};

const refreshMovedDirectories = async (sourceDirectory: string, destinationDirectory: string | undefined): Promise<void> => {
  const directories = destinationDirectory ? [sourceDirectory, destinationDirectory] : [sourceDirectory];
  try {
    await refreshGlobalSessionsForDirectories(directories);
  } catch (error) {
    console.warn('[session-worktree-move] Failed to refresh moved sessions', error);
  }
};

const moveSessionTreeTransaction = async (
  input: { root: Session; descendants: Session[]; sourceDirectory: string },
  prepareDestination: () => Promise<{ directory: string; metadata: WorktreeMetadata | null }>,
  isCurrent = captureRuntimeInstance(),
  assertIdle: (sessions: Session[]) => void | Promise<void> = assertSessionsIdle,
): Promise<string> => {
  const runtimeKey = getRuntimeKey();
  const familyId = input.root.rootSessionId;
  if (useSessionMoveState.getState().pendingSessionIds.has(familyId)) {
    throw new Error('Session move already in progress');
  }
  setSessionMovePending(familyId, true);

  try {
    const sessions = [...input.descendants, input.root];
    const destination = await prepareDestination();
    if (!isCurrent()) throw new WorktreeKeepStoppedError('switched');
    await assertIdle(sessions);
    if (!isCurrent()) throw new WorktreeKeepStoppedError('switched');
    try {
      // Canonical relocation moves the complete family atomically on the Host.
      await moveSessionToDirectory(input.root, input.sourceDirectory, destination.directory, runtimeKey);
    } catch (error) {
      if (!isCurrent()) throw new WorktreeKeepStoppedError('switched');
      if (error instanceof Error && isAmbiguousSendFailure(error)) {
        await refreshMovedDirectories(input.sourceDirectory, destination.directory);
        throw new SessionMoveOutcomeUnknownError(error);
      }
      throw error;
    }
    if (!isCurrent()) throw new WorktreeKeepStoppedError('switched');
    const metadata = destination.metadata ? getLatestWorktreeMetadata(destination.metadata) : null;
    for (const session of sessions) {
      useSessionUIStore.getState().setWorktreeMetadata(session.sessionId, metadata, destination.directory);
    }
    await refreshMovedDirectories(input.sourceDirectory, destination.directory);
    return destination.directory;
  } finally {
    setSessionMovePending(familyId, false);
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
  carry: readonly string[];
}): Promise<SessionMoveToWorktreeResult> => {
  const project = resolveProjectRef(input.sourceDirectory);
  if (!project) throw new Error('Unable to find the project for this session');
  const run = async (): Promise<SessionMoveToWorktreeResult> => {
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

const WORKTREE_SESSION_READ_TIMEOUT_MS = 10_000;

const readWorktreeSession = async (sessionId: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      canonicalClient.getSession(sessionId).then(({ session }) => session).catch(() => null),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), WORKTREE_SESSION_READ_TIMEOUT_MS); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const readWorktreeActivity = async (sessions: readonly Session[]) => {
  if (sessions.some((session) => getSessionLiveActivity(session.sessionId) === 'active')) return 'active';
  const current = await Promise.all(sessions.map((session) => readWorktreeSession(session.sessionId)));
  if (current.some((session) => session && session.runtimeStatus !== 'idle' && session.runtimeStatus !== 'unavailable')) return 'active';
  if (current.some((session) => !session || session.activeRunId !== null)) return 'unknown';
  return 'idle';
};

export const moveWorktreeSessionsThenRemove = (input: {
  worktreePath: string;
  projectDirectory: string;
  readSessions: () => readonly Session[];
  removeWorktree: () => Promise<boolean>;
}): Promise<{ removed: boolean }> => {
  const isCurrent = captureRuntimeInstance();
  const worktreePath = normalizePath(input.worktreePath) ?? input.worktreePath;
  return moveSessionsThenRemoveWorktree({
    worktreePath,
    readSessions: input.readSessions,
    readActivity: readWorktreeActivity,
    resolveDestination: async (directory) => {
      const destination = normalizePath((await resolveFolderProjectRef(directory))?.path);
      return destination && !checkoutHoldsDirectory(worktreePath, destination) ? destination : input.projectDirectory;
    },
    moveTree: async (tree) => {
      await moveSessionTreeTransaction(tree, async () => ({ directory: tree.projectDirectory, metadata: null }), isCurrent, async (sessions) => {
        const activity = await readWorktreeActivity(sessions);
        if (!isCurrent()) throw new WorktreeKeepStoppedError('switched');
        if (activity !== 'idle') throw new WorktreeKeepStoppedError(activity === 'active' ? 'busy' : 'unknown');
      });
    },
    confirmMoves: async (moves) => {
      if (!isCurrent()) return false;
      const confirmed = await Promise.all(moves.flatMap((move) => [move.root, ...move.descendants].map(async ({ sessionId }) => {
        const session = await readWorktreeSession(sessionId);
        return session !== null && resolveWorkspaceDirectory(session.workspaceId) === normalizePath(move.projectDirectory);
      })));
      return isCurrent() && confirmed.every(Boolean);
    },
    removeWorktree: input.removeWorktree,
    isCurrent,
  });
};

const KEEP_STOP_KEYS = {
  busy: 'sessions.sidebar.work.archive.keptRunning',
  unknown: 'sessions.sidebar.work.archive.keptUnknown',
  added: 'sessions.sidebar.dialogs.worktreeDelete.keepAdded',
  unconfirmed: 'sessions.sidebar.dialogs.worktreeDelete.keepUnconfirmed',
  switched: 'sessions.sidebar.dialogs.worktreeDelete.keepSwitched',
} satisfies Record<WorktreeKeepStop, I18nKey>;

export const describeWorktreeKeepError = (error: Error, t: (key: I18nKey) => string): string | null => {
  if (error instanceof WorktreeKeepStoppedError) return t(KEEP_STOP_KEYS[error.reason]);
  if (error instanceof SessionMoveOutcomeUnknownError) return t('sessions.sidebar.dialogs.worktreeDelete.keepOutcomeUnknown');
  return null;
};
