import os from 'node:os';
import path from 'node:path';
import { isString } from '../shared/guards.js';
import type { JsonValue } from '../shared/json-values.js';

export function resolveWorktreeDirectory(
  directory: JsonValue | undefined,
  primaryWorktree: string,
  homeDirectory: string = os.homedir(),
): string | null {
  if (!isString(directory)) {
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
