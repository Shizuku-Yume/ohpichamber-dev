import type { WorktreeMetadata } from '@/types/worktree';
import { normalizePath } from '../utils';

export const buildKnownSessionDirectories = (
  projects: Array<{ path: string }>,
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>,
): Set<string> => {
  const directories = new Set<string>();
  for (const project of projects) {
    const normalized = normalizePath(project.path);
    if (normalized) directories.add(normalized);
  }
  for (const worktrees of availableWorktreesByProject.values()) {
    for (const worktree of worktrees) {
      const normalized = normalizePath(worktree.path);
      if (normalized) directories.add(normalized);
    }
  }
  return directories;
};
