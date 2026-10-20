import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';


import { unsupportedRepositoryRootReason } from './repository-root.js';

describe('unsupportedRepositoryRootReason', () => {
  it('rejects a repository rooted at a filesystem root or the home directory', () => {
    const home = path.join(os.tmpdir(), 'unsupported-root-home');
    expect(unsupportedRepositoryRootReason('/', home)).toBe('filesystem-root');
    expect(unsupportedRepositoryRootReason(path.parse(process.cwd()).root, home)).toBe('filesystem-root');
    expect(unsupportedRepositoryRootReason(home, home)).toBe('home');
    expect(unsupportedRepositoryRootReason(`${home}${path.sep}`, home)).toBe('home');
  });

  it('accepts an ordinary project root, including one directly under home', () => {
    const home = path.join(os.tmpdir(), 'unsupported-root-home');
    expect(unsupportedRepositoryRootReason(path.join(home, 'project'), home)).toBeNull();
    expect(unsupportedRepositoryRootReason(path.join(os.tmpdir(), 'repo'), home)).toBeNull();
    expect(unsupportedRepositoryRootReason('', home)).toBeNull();
  });
});

