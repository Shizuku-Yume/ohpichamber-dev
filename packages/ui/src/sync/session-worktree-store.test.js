import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { useSessionWorktreeStore } from './session-worktree-store';

beforeEach(() => useSessionWorktreeStore.setState({ attachments: new Map() }));
afterEach(() => useSessionWorktreeStore.setState({ attachments: new Map() }));

describe('session-worktree-store', () => {
  test('stores and retrieves attachment by session id', () => {
    const store = useSessionWorktreeStore.getState();
    store.setAttachment('session-1', {
      worktreeRoot: '/repo/worktrees/feat-a',
      cwd: '/repo/worktrees/feat-a',
      branch: 'feat-a',
      headState: 'branch',
      worktreeStatus: 'ready',
      worktreeSource: 'created-for-session',
      legacy: false,
      degraded: false,
    });

    const attachment = useSessionWorktreeStore.getState().getAttachment('session-1');
    expect(attachment?.worktreeRoot).toBe('/repo/worktrees/feat-a');
    expect(attachment?.branch).toBe('feat-a');
  });

  test('clears attachment by session id', () => {
    const store = useSessionWorktreeStore.getState();
    store.setAttachment('session-2', {
      worktreeRoot: '/repo/worktrees/feat-b',
      cwd: '/repo/worktrees/feat-b',
      branch: 'feat-b',
      headState: 'branch',
      worktreeStatus: 'ready',
      worktreeSource: 'existing',
      legacy: false,
      degraded: false,
    });

    store.clearAttachment('session-2');
    const attachment = useSessionWorktreeStore.getState().getAttachment('session-2');
    expect(attachment).toBeUndefined();
  });

  test('multiple sessions have independent attachments', () => {
    const store = useSessionWorktreeStore.getState();
    store.setAttachment('session-A', {
      worktreeRoot: '/repo/worktrees/feat-a',
      cwd: '/repo/worktrees/feat-a',
      branch: 'feat-a',
      headState: 'branch',
      worktreeStatus: 'ready',
      worktreeSource: 'existing',
      legacy: false,
      degraded: false,
    });
    store.setAttachment('session-B', {
      worktreeRoot: '/repo/worktrees/feat-b',
      cwd: '/repo/worktrees/feat-b',
      branch: 'feat-b',
      headState: 'branch',
      worktreeStatus: 'ready',
      worktreeSource: 'created-for-session',
      legacy: false,
      degraded: false,
    });

    const attA = useSessionWorktreeStore.getState().getAttachment('session-A');
    const attB = useSessionWorktreeStore.getState().getAttachment('session-B');
    expect(attA?.branch).toBe('feat-a');
    expect(attB?.branch).toBe('feat-b');
    expect(attA?.worktreeSource).toBe('existing');
    expect(attB?.worktreeSource).toBe('created-for-session');
  });

  test('replaces an attachment without changing another session or the previous snapshot', () => {
    const first = { worktreeRoot: '/repo/a', cwd: '/repo/a', branch: 'a', headState: 'branch', worktreeStatus: 'ready', worktreeSource: 'existing', legacy: false, degraded: false };
    const sibling = { ...first, worktreeRoot: '/repo/b', cwd: '/repo/b', branch: 'b' };
    const store = useSessionWorktreeStore.getState();
    store.setAttachment('session-a', first);
    store.setAttachment('session-b', sibling);
    const previous = useSessionWorktreeStore.getState().attachments;
    const replacement = { ...first, worktreeStatus: 'missing', degraded: true };
    store.setAttachment('session-a', replacement);

    expect(useSessionWorktreeStore.getState().getAttachment('session-a')).toBe(replacement);
    expect(useSessionWorktreeStore.getState().getAttachment('session-b')).toBe(sibling);
    expect(previous.get('session-a')).toBe(first);
    store.clearAttachment('session-a');
    expect(useSessionWorktreeStore.getState().getAttachment('session-a')).toBeUndefined();
    expect(useSessionWorktreeStore.getState().getAttachment('session-b')).toBe(sibling);
  });
});
