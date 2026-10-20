import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWorktreeDirectory } from './worktree-directory.js';

const primaryWorktree = path.join(path.sep, 'projects', 'my-app');
const homeDirectory = path.join(path.sep, 'home', 'dev');

describe('resolveWorktreeDirectory', () => {
  it('returns null when the setting is absent or not a non-empty string', () => {
    expect(resolveWorktreeDirectory(null, primaryWorktree, homeDirectory)).toBeNull();
    expect(resolveWorktreeDirectory(undefined, primaryWorktree, homeDirectory)).toBeNull();
    expect(resolveWorktreeDirectory('   ', primaryWorktree, homeDirectory)).toBeNull();
    expect(resolveWorktreeDirectory(42, primaryWorktree, homeDirectory)).toBeNull();
    expect(resolveWorktreeDirectory({ directory: '.worktrees' }, primaryWorktree, homeDirectory)).toBeNull();
  });

  it('resolves a relative folder against the canonical checkout', () => {
    expect(resolveWorktreeDirectory('.worktrees', primaryWorktree, homeDirectory))
      .toBe(path.join(primaryWorktree, '.worktrees'));
    expect(resolveWorktreeDirectory('../trees', primaryWorktree, homeDirectory))
      .toBe(path.join(path.dirname(primaryWorktree), 'trees'));
  });

  it('uses an absolute path as-is', () => {
    const absolute = path.join(path.sep, 'var', 'trees');
    expect(resolveWorktreeDirectory(absolute, primaryWorktree, homeDirectory)).toBe(absolute);
  });

  it('expands a leading ~ against the home directory', () => {
    expect(resolveWorktreeDirectory('~', primaryWorktree, homeDirectory)).toBe(homeDirectory);
    expect(resolveWorktreeDirectory('~/trees', primaryWorktree, homeDirectory))
      .toBe(path.join(homeDirectory, 'trees'));
  });
});
