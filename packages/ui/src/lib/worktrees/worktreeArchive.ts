import React from 'react';
import { create } from 'zustand';
import { z } from 'zod';
import type { Session } from '@openchamber/agent-contract';
import type { GitWorktreeArchive } from '@/lib/api/types';
import { canArchiveWorktrees, git } from '@/lib/gitApi';
import { normalizePath } from '@/lib/pathNormalization';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { resolveWorktreeSetupCommandsOrCancel } from '@/lib/sharedTrustConfirmation';
<<<<<<< HEAD
import { archiveProjectWorktree, createWorktree, listProjectWorktrees, removeProjectWorktree, type ProjectRef } from '@/lib/worktrees/worktreeManager';
=======
import {
  archiveProjectWorktree,
  createWorktree,
  listProjectWorktrees,
  removeProjectWorktree,
  resolveWorktreeTeardownCommand,
  type ProjectRef,
} from '@/lib/worktrees/worktreeManager';
import { archiveSessionsThenRemoveWorktree } from '@/lib/worktrees/worktreeRemovalFlow';
>>>>>>> bc50ba56a
import { clearWorktreeRemoval, markWorktreeRemoving } from '@/lib/worktrees/worktreeRemovalState';
import { getSafeStorage } from '@/stores/utils/safeStorage';
import type { WorktreeMetadata } from '@/types/worktree';

/**
 * Archived worktrees, per project. The repository is the record (the server
 * lists `refs/openchamber/archive/*`), so this is only a cache of the last
 * listing: every page that shows archives loads it again when it opens, and
 * this client's own archive, restore and delete reload it.
 */
type ProjectArchives =
  | { status: 'loading'; archives: GitWorktreeArchive[] }
  | { status: 'ready'; archives: GitWorktreeArchive[] }
  | { status: 'error'; archives: GitWorktreeArchive[]; error: string };

type WorktreeArchivesState = { byProject: ReadonlyMap<string, ProjectArchives> };

const useWorktreeArchivesStore = create<WorktreeArchivesState>(() => ({ byProject: new Map() }));

const setProjectArchives = (projectPath: string, value: ProjectArchives): void => {
  const next = new Map(useWorktreeArchivesStore.getState().byProject);
  next.set(projectPath, value);
  useWorktreeArchivesStore.setState({ byProject: next });
};

// The newest listing request per project: an older one that answers later
// must not put back what an archive, restore or delete since changed.
const latestListing = new Map<string, number>();
let listingSequence = 0;

/** Lists the project's archives again; keeps the last listing visible while it loads. */
export async function loadWorktreeArchives(projectPath: string): Promise<GitWorktreeArchive[]> {
  const key = normalizePath(projectPath);
  if (!key || !canArchiveWorktrees()) return [];
  const runtime = getRuntimeKey();
  const request = ++listingSequence;
  latestListing.set(key, request);
  const isLatest = () => getRuntimeKey() === runtime && latestListing.get(key) === request;
  const previous = useWorktreeArchivesStore.getState().byProject.get(key)?.archives ?? [];
  setProjectArchives(key, { status: 'loading', archives: previous });
  try {
    const archives = await git.worktree.listArchives(key);
    if (isLatest()) setProjectArchives(key, { status: 'ready', archives });
    return archives;
  } catch (error) {
    // Failure is not an empty archive: keep the previous listing and say so.
    if (isLatest()) {
      setProjectArchives(key, { status: 'error', archives: previous, error: error instanceof Error ? error.message : String(error) });
    }
    throw error;
  }
}

const EMPTY: ProjectArchives = { status: 'ready', archives: [] };

/** The project's archives, loaded when the caller mounts. Null project: nothing. */
export const useProjectWorktreeArchives = (projectPath: string | null | undefined): ProjectArchives => {
  const key = normalizePath(projectPath ?? null);
  React.useEffect(() => {
    if (key) void loadWorktreeArchives(key).catch(() => undefined);
  }, [key]);
  return useWorktreeArchivesStore((state) => (key ? state.byProject.get(key) : undefined) ?? EMPTY);
};

/** Every project's last listing, for the Archive page. */
export const useWorktreeArchivesByProject = (): ReadonlyMap<string, ProjectArchives> => useWorktreeArchivesStore((state) => state.byProject);

subscribeRuntimeEndpointChanged(() => {
  if (useWorktreeArchivesStore.getState().byProject.size > 0) useWorktreeArchivesStore.setState({ byProject: new Map() });
});

const newArchiveId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Archives the worktree through the Host-owned session and worker lifecycle. */
export async function archiveWorktreeWork(input: {
  project: ProjectRef;
  worktree: WorktreeMetadata;
  sessions: readonly Session[];
  /** The name the sidebar showed for the work, kept when the worktree has no task title. */
  title?: string;
  /** False for an archive nobody started by hand; see `resolveWorktreeTeardownCommand`. */
  askForTrust?: boolean;
}): Promise<void> {
  // Session scope is derived by the Host, not from this client's loaded page.
  markWorktreeRemoving(input.worktree.path);
  try {
<<<<<<< HEAD
    await archiveProjectWorktree(input.project, input.worktree, {
      id: newArchiveId(),
      title: input.title ?? input.worktree.title,
=======
    // Before any session is archived: a teardown that cannot run (untrusted
    // in a pass nobody started, an unreadable setup) or that fails leaves the
    // sessions alone, so the merged-PR cleanup's retries do not churn them. The
    // server snapshots the worktree later, with what the teardown left.
    const teardownCommand = await resolveWorktreeTeardownCommand(input.project, input.worktree, { ask: input.askForTrust });
    if (teardownCommand) {
      await git.worktree.teardown(normalizePath(input.project.path) ?? input.project.path, { directory: input.worktree.path, teardownCommand });
    }
    await archiveSessionsThenRemoveWorktree({
      sessionIds,
      archiveSessions: (ids) => archiveSessions(ids),
      restoreSessions: (ids) => unarchiveSessions(ids, { undo: true }),
      removeWorktree: async (archivedIds) => {
        if (archivedIds.length !== sessionIds.length) {
          throw new Error(`Could not archive ${sessionIds.length - archivedIds.length} session(s)`);
        }
        try {
          await archiveProjectWorktree(input.project, input.worktree, { id: newArchiveId(), sessionIds: archivedIds, title: input.title });
        } catch (error) {
          if (!(error instanceof GitWorktreeRequestError) || error.code !== 'WORKTREE_ARCHIVE_PARTIAL') throw error;
          partial = error;
        }
        return true;
      },
>>>>>>> bc50ba56a
    });
  } finally {
    clearWorktreeRemoval(input.worktree.path);
    void loadWorktreeArchives(input.project.path).catch(() => undefined);
  }
}

/** What an archived worktree is called: its task, else its branch, else its folder. */
export const archivedWorktreeLabel = (archive: GitWorktreeArchive): string => (
  archive.title || archive.branch || archive.path.split('/').filter(Boolean).pop() || archive.path
);

const lastSegment = (path: string): string => normalizePath(path)?.split('/').filter(Boolean).pop() ?? '';


export type WorktreeArchiveRestore =
  | { outcome: 'restored'; worktree: WorktreeMetadata; conflicts: boolean }
  /** The user closed the prompt about the project's shared setup commands. */
  | { outcome: 'cancelled' };

// Restores in flight by archive id. Restoring a session brings its
// subsessions back one by one, and each would otherwise start the same
// restore; the Archive page's buttons can too.
const restoresInFlight = new Map<string, Promise<WorktreeArchiveRestore>>();

/**
 * Brings an archived worktree back: a new checkout of its branch (or of the
 * commit it stood on, when the branch is gone) at its old folder name, the
 * project's setup commands, its changes on top, then its sessions. A folder
 * that git had to name differently takes the sessions along. A restore of the
 * same archive already running is joined, not repeated.
 */
export function restoreArchivedWorktree(input: {
  project: ProjectRef;
  archive: GitWorktreeArchive;
  recovery?: { revision: number; head: string };
}): Promise<WorktreeArchiveRestore> {
  const running = restoresInFlight.get(input.archive.id);
  if (running) return running;
  const restore = restoreArchivedWorktreeOnce(input).finally(() => restoresInFlight.delete(input.archive.id));
  restoresInFlight.set(input.archive.id, restore);
  return restore;
}

async function restoreArchivedWorktreeOnce(input: {
  project: ProjectRef;
  archive: GitWorktreeArchive;
  recovery?: { revision: number; head: string };
}): Promise<WorktreeArchiveRestore> {
  const { project, archive } = input;
  const setupCommands = await resolveWorktreeSetupCommandsOrCancel(project);
  if (setupCommands === null) return { outcome: 'cancelled' };

  const worktreeName = lastSegment(archive.path);
  const worktree = input.recovery
    ? await createWorktree(project, { mode: 'new', branchName: `archive-recovery-${newArchiveId()}`, startRef: input.recovery.head, worktreeName, setupCommands })
    : archive.branchExists
    ? await createWorktree(project, { mode: 'existing', existingBranch: archive.branch, worktreeName, setupCommands })
    : await createWorktree(project, {
      mode: 'new',
      branchName: archive.branch || worktreeName,
      startRef: archive.head,
      worktreeName,
      setupCommands,
    });
  let conflicts: boolean;
  try {
    ({ conflicts } = await git.worktree.restoreArchive(worktree.path, archive.id, input.recovery ? { mode: 'new_checkout', revision: input.recovery.revision } : undefined));
  } catch (error) {
    const keepCheckout = input.recovery || (error && typeof error === 'object' && 'code' in error && ['WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 'WORKTREE_ARCHIVE_DELETE_RECOVERY_REQUIRED'].includes(String(error.code)));
    if (!keepCheckout) {
      await removeProjectWorktree(project, worktree, { deleteLocalBranch: Boolean(input.recovery) || !archive.branchExists }).catch(() => undefined);
    }
    throw error;
  } finally {
    void listProjectWorktrees(project, { force: true }).catch(() => undefined);
    void loadWorktreeArchives(project.path).catch(() => undefined);
  }
  noteRestoredWorktree(worktree.path);


  return { outcome: 'restored', worktree, conflicts };
}

/** Delete the snapshot through the Host, which owns all associated session effects. */
export async function deleteArchivedWorktree(input: {
  project: ProjectRef;
  archive: GitWorktreeArchive;
  deleteBranch?: boolean;
}): Promise<void> {
  try {
    await git.worktree.deleteArchive(normalizePath(input.project.path) ?? input.project.path, {
      id: input.archive.id,
      deleteBranch: input.deleteBranch === true,
    });
  } finally {
    void loadWorktreeArchives(input.project.path).catch(() => undefined);
  }
}


// Worktrees restored here, for the merged-PR cleanup: restoring one whose PR
// is merged is the user taking it back, and the cleanup would otherwise
// archive it again on its next pass.
const RESTORED_STORAGE_KEY = 'openchamber.mergedWorktreeCleanup.restored';
const RESTORED_LIMIT = 100;
const restoredSchema = z.array(z.string()).catch([]);

const readRestored = (): string[] => {
  try {
    return restoredSchema.parse(JSON.parse(getSafeStorage().getItem(RESTORED_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
};

const writeRestored = (paths: string[]): void => {
  getSafeStorage().setItem(RESTORED_STORAGE_KEY, JSON.stringify(paths.slice(-RESTORED_LIMIT)));
};

const noteRestoredWorktree = (path: string): void => {
  const key = normalizePath(path);
  if (key) writeRestored([...readRestored().filter((entry) => entry !== key), key]);
};

/** Whether the worktree at `path` was restored here since the cleanup last saw it; answers once. */
export const takeRestoredWorktree = (path: string): boolean => {
  const key = normalizePath(path);
  const restored = readRestored();
  if (!key || !restored.includes(key)) return false;
  writeRestored(restored.filter((entry) => entry !== key));
  return true;
};
