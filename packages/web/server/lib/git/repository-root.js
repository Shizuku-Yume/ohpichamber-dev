import os from 'os';
import path from 'path';

/**
 * A repository whose root is the user's home directory or a filesystem root
 * (`C:\`, `/`) covers the whole disk. Every status read walks Program Files
 * or the entire home tree, which is minutes of Git work per refresh and, on
 * Windows, the process pile-ups users report. Such a repository is nearly
 * always an accidental `git init` in the wrong place, so OpenChamber treats
 * it as no repository at all. Returns the reason or null for a normal root.
 */
export const unsupportedRepositoryRootReason = (repoRoot, home = os.homedir()) => {
  const root = String(repoRoot ?? '').trim();
  if (!root) return null;
  const resolved = path.resolve(root);
  if (path.resolve(path.parse(resolved).root) === resolved) return 'filesystem-root';
  const homeRoot = String(home ?? '').trim();
  if (homeRoot && path.resolve(homeRoot) === resolved) return 'home';
  return null;
};

/**
 * The primary checkout of a repository from a git dir written with forward
 * slashes: `<root>/.git` for the checkout itself, `<root>/.git/worktrees/<name>`
 * for a linked worktree. Null for any other layout (a bare repository, a
 * separate git dir).
 */
export const primaryWorktreeRootFromGitDir = (gitDir) => {
  if (!gitDir) return null;
  if (gitDir.endsWith('/.git')) {
    return gitDir.slice(0, -'/.git'.length) || null;
  }
  const markerIndex = gitDir.indexOf('/.git/worktrees/');
  if (markerIndex > 0) {
    return gitDir.slice(0, markerIndex) || null;
  }
  return null;
};

