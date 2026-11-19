import type { createWorktreeBootstrapStore } from '../git/worktree-bootstrap-storage.js';
import type { deleteBranch, isGitRepository, removeWorktree } from '../git/service.js';

export interface ScheduledWorktree {
  directory: string;
  branch: string | null;
  name: string | null;
}

export interface CreateScheduledWorktreeInput {
  projectDirectory: string;
  baseBranch?: string | undefined;
}

export interface RemoveScheduledWorktreeInput {
  projectDirectory: string;
  worktreeDirectory: string;
  deleteLocalBranch?: boolean;
  branch?: string | null;
  removeDirectory?: boolean;
}

export interface ScheduledWorktreeBridge {
  create: ((input: CreateScheduledWorktreeInput) => Promise<ScheduledWorktree>) | null;
  remove: (input: RemoveScheduledWorktreeInput) => Promise<void>;
  isGitRepository: (directory: string) => boolean | Promise<boolean>;
}

interface WorktreeBridgeDependencies {
  createWorktree?: ((directory: string, input: WorktreeCreationInput) => Promise<{
    path: string;
    branch?: string | null;
    name?: string | null;
  }>) | null;
  removeWorktree: typeof removeWorktree;
  deleteBranch: typeof deleteBranch;
  isGitRepository: typeof isGitRepository;
  bootstrapStore: ReturnType<typeof createWorktreeBootstrapStore> | undefined;
}

interface WorktreeCreationInput {
  mode: 'new';
  startRef?: string;
}

export const createUnregisteredScheduledWorktreeBridge = (): ScheduledWorktreeBridge => ({
  create: () => Promise.reject(new Error('worktree bridge not registered yet')),
  remove: () => Promise.reject(new Error('worktree bridge not registered yet')),
  isGitRepository: () => true,
});

export const fillScheduledWorktreeBridge = (bridge: Partial<ScheduledWorktreeBridge> | null | undefined, dependencies: WorktreeBridgeDependencies) => {
  if (!(bridge instanceof Object)) {
    return bridge;
  }

  const {
    createWorktree,
    removeWorktree,
    deleteBranch,
    isGitRepository,
    bootstrapStore,
  } = dependencies;

  if (createWorktree instanceof Function) {
    bridge.create = ({ projectDirectory, baseBranch }) => {
      const input: WorktreeCreationInput = { mode: 'new' };
      if (baseBranch) input.startRef = baseBranch;
      return createWorktree(projectDirectory, input).then((created) => ({
        directory: created.path,
        branch: created.branch || null,
        name: created.name || null,
      }));
    };
  } else {
    bridge.create = null;
  }

  bridge.remove = async ({ projectDirectory, worktreeDirectory, deleteLocalBranch, branch, removeDirectory = true }) => {
    if (removeDirectory) await removeWorktree(projectDirectory, {
      directory: worktreeDirectory,
      deleteLocalBranch: false,
    }, { bootstrapStore });
    if (deleteLocalBranch !== false && branch) {
      await deleteBranch(projectDirectory, branch, { force: true, ifExists: true });
    }
  };

  bridge.isGitRepository = (projectDirectory) => isGitRepository(projectDirectory, { strict: true });

  return bridge;
};
