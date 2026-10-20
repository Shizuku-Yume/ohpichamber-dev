/**
 * The personal `worktreeDirectory` project setting decides where new worktrees
 * land. This module owns the path rule: relative paths start at the project's
 * canonical checkout, absolute paths are used as-is, and a leading `~` means the
 * user's home directory. The worktree name is appended by the caller, so the
 * resolved value is always the parent directory, never the worktree itself.
 */
import os from 'node:os';
import path from 'node:path';

/**
 * Resolve a personal `worktreeDirectory` value into an absolute parent folder.
 *
 * Returns `null` when the setting is absent or not a non-empty string, so the
 * caller keeps the Host data-dir default.
 *
 * @param {unknown} directory the personal project setting
 * @param {string} primaryWorktree the project's canonical checkout
 * @param {string} [homeDirectory] overrides the home used for `~` (tests)
 * @returns {string | null}
 */
export function resolveWorktreeDirectory(directory, primaryWorktree, homeDirectory = os.homedir()) {
  if (typeof directory !== 'string') {
    return null;
  }

  const trimmed = directory.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === '~') {
    return path.resolve(homeDirectory);
  }
  if (/^~[\\/]/.test(trimmed)) {
    return path.resolve(homeDirectory, trimmed.slice(2));
  }
  return path.resolve(primaryWorktree, trimmed);
}
