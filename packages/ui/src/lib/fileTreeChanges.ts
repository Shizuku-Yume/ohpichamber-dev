<<<<<<< HEAD
/** Native tool mutations invalidate Host file listings independently of mounted chat parts. */
import type { Part } from '@openchamber/agent-contract';
=======
/**
 * Tells file browsers which listings may be out of date, from signals the
 * client already receives. There is no watcher and no timer: OpenCode 2.2
 * watches single files on request (`lib/watchedFiles`, for the file on
 * screen), not folders, so the agent's own activity is the source.
 *
 * - A finished `write` or `patch` names its files: their directories change.
 * - A finished `shell`, `execute`, MCP or plugin call could touch anything.
 *   Its session is remembered until the step ends; the step's snapshot then
 *   says whether any file changed. A step that changed nothing costs nothing,
 *   which is the common case for read-only commands.
 * - A finished user shell command and a revert are unknown changes.
 *
 * Changes outside the agent (an editor, a terminal) are not seen here.
 */

>>>>>>> bc50ba56a
import { getNormalizedParentDirectory, normalizePath } from '@/lib/pathNormalization';
import { isExplorationTool, isWebTool } from '@/lib/toolHelpers';

/**
 * `paths` are absolute, normalized files whose parent listings changed.
 * Without `paths` anything under `directory` may have changed.
 */
export type FileTreeChange = { directory: string; paths?: string[] };

type FileTreeChangeListener = (change: FileTreeChange) => void;

const listeners = new Set<FileTreeChangeListener>();
/** Unknown targets are coalesced until their native run ends. */
const sessionsAwaitingRun = new Map<string, Set<string>>();
const completedToolCalls = new Map<string, Set<string>>();

export const subscribeFileTreeChanges = (listener: FileTreeChangeListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const notifyFileTreeChanged = (change: FileTreeChange): void => {
  const directory = normalizePath(change.directory);
  if (!directory) return;
  const next = change.paths ? { directory, paths: change.paths } : { directory };
  for (const listener of listeners) {
    listener(next);
  }
};

const isAbsolute = (path: string): boolean => path.startsWith('/') || /^[A-Za-z]:\//.test(path);

const resolveAgainst = (directory: string, path: string): string | null => {
  const normalized = normalizePath(path);
  if (!normalized) return null;
  if (isAbsolute(normalized)) return normalized;
  const segments = directory === '/' ? [''] : directory.split('/');
  for (const segment of normalized.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length > 1) segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/') || '/';
};

export const fileTreeChanges = {
  toolTransition(directory: string, sessionId: string, previousPart: Part | undefined, nextPart: Part): void {
    if (nextPart.type !== 'tool_call' && nextPart.type !== 'tool_result') return;
    if (nextPart.type === 'tool_call' && !['completed', 'failed', 'cancelled'].includes(nextPart.status)) return;
    if (previousPart?.type === 'tool_call' && previousPart.toolCallId === nextPart.toolCallId && previousPart.status === 'denied') return;
    if (nextPart.type === 'tool_call' && previousPart?.type === 'tool_call'
      && previousPart.toolCallId === nextPart.toolCallId
      && ['completed', 'failed', 'cancelled', 'denied'].includes(previousPart.status)) return;
    if (previousPart?.type === 'tool_result' && previousPart.toolCallId === nextPart.toolCallId) return;
    const root = normalizePath(directory);
    if (!root) return;
    const key = `${root}\n${sessionId}`;
    const completed = completedToolCalls.get(key) ?? new Set<string>();
    if (completed.has(nextPart.toolCallId)) return;
    completed.add(nextPart.toolCallId);
    completedToolCalls.set(key, completed);
    if (isExplorationTool(nextPart.toolName) || isWebTool(nextPart.toolName)) return;
    const call = nextPart.type === 'tool_call' ? nextPart
      : previousPart?.type === 'tool_call' && previousPart.toolCallId === nextPart.toolCallId ? previousPart : undefined;
    // write has one native path. edit's grammar depends on the worker's editMode;
    // do not guess its rename/delete targets from a legacy patch or metadata shape.
    if (nextPart.toolName === 'write' && typeof call?.input.path === 'string') {
      const rawPath = call.input.path.replace(/^\[(.*)#[0-9a-fA-F]+\]$/, '$1');
      const path = resolveAgainst(root, rawPath);
      if (path) notifyFileTreeChanged({ directory: root, paths: [path] });
      return;
    }
    const pending = sessionsAwaitingRun.get(sessionId) ?? new Set<string>();
    pending.add(root);
    sessionsAwaitingRun.set(sessionId, pending);
  },

  runCompleted(directory: string, sessionId: string): void {
    const root = normalizePath(directory);
    if (!root) return;
    const pending = sessionsAwaitingRun.get(sessionId);
    if (!pending?.delete(root)) return;
    if (pending.size === 0) sessionsAwaitingRun.delete(sessionId);
    notifyFileTreeChanged({ directory: root });
  },

  reset(): void {
    sessionsAwaitingRun.clear();
    completedToolCalls.clear();
  },

  unknownChange(directory: string): void {
    notifyFileTreeChanged({ directory });
  },
};

const isWithin = (path: string, root: string): boolean =>
  path === root || path.startsWith(root === '/' ? '/' : `${root}/`);

/**
 * The directories of `root`'s tree a change can affect: each named file's
 * parent, or `null` when the whole tree is in question. An empty list means
 * the change is elsewhere.
 */
export const affectedDirectories = (change: FileTreeChange, root: string): string[] | null => {
  if (!change.paths) {
    return isWithin(change.directory, root) || isWithin(root, change.directory) ? null : [];
  }
  const directories = new Set<string>();
  for (const path of change.paths) {
    const parent = getNormalizedParentDirectory(path);
    if (parent && isWithin(parent, root)) directories.add(parent);
  }
  return [...directories];
};
