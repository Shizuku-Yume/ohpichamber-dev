import { beforeEach, describe, expect, test } from 'bun:test';

import { getRuntimeKey } from '@/lib/runtime-switch';
import { getPinnedSessionKey, isSessionPinned, useSessionPinnedStore } from './useSessionPinnedStore';

describe('useSessionPinnedStore', () => {
  beforeEach(() => {
    useSessionPinnedStore.setState({ ids: new Set(), touchedAt: {} });
  });

<<<<<<< HEAD
  test('isolates identical session IDs by directory', () => {
    const store = useSessionPinnedStore.getState();
    store.toggle({ directory: '/repo-a', sessionId: 'session-1' });
    store.toggle({ directory: '/repo-b', sessionId: 'session-1' });
||||||| bc50ba56aa
  test('reads pins from session metadata, per directory', () => {
    useGlobalSessionsStore.getState().applySnapshot([session('a', '/repo-a', true), session('b', '/repo-b', false)], []);
=======
  test('reads pins from session metadata, per directory', () => {
    const bulk = Array.from({ length: 250 }, (_, index) => session(`pinned-${index}`, '/repo-a', true));
    useGlobalSessionsStore.getState().applySnapshot([...bulk, session('a', '/repo-a', true), session('b', '/repo-b', false)], []);
>>>>>>> upstream/main

<<<<<<< HEAD
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, '/repo-a/', 'session-1')).toBe(true);
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, '/repo-b', 'session-1')).toBe(true);
    store.toggle({ directory: '/repo-a', sessionId: 'session-1' });
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, '/repo-a', 'session-1')).toBe(false);
    expect(isSessionPinned(useSessionPinnedStore.getState().ids, '/repo-b', 'session-1')).toBe(true);
||||||| bc50ba56aa
    expect(pinned('/repo-a/', 'a')).toBe(true);
    expect(pinned('/repo-b', 'b')).toBe(false);
    expect(pinned('/repo-b', 'a')).toBe(false);
=======
    expect(useSessionPinnedStore.getState().ids.size).toBe(251);
    for (const entry of bulk) expect(pinned('/repo-a', entry.id)).toBe(true);
    expect(pinned('/repo-a/', 'a')).toBe(true);
    expect(pinned('/repo-b', 'b')).toBe(false);
    expect(pinned('/repo-b', 'a')).toBe(false);
>>>>>>> upstream/main
  });

  test('explicit deletion clears only the matching runtime and directory', () => {
    const runtimeKey = getRuntimeKey();
    const activeKey = getPinnedSessionKey(runtimeKey, '/repo', 'session-1')!;
    const otherRuntimeKey = getPinnedSessionKey('other-runtime', '/repo', 'session-1')!;
    useSessionPinnedStore.setState({
      ids: new Set([activeKey, otherRuntimeKey]),
      touchedAt: { [activeKey]: 1, [otherRuntimeKey]: 2 },
    });

    useSessionPinnedStore.getState().clearPinnedSession(runtimeKey, '/repo/', 'session-1');

    expect(useSessionPinnedStore.getState().ids.has(activeKey)).toBe(false);
    expect(useSessionPinnedStore.getState().ids.has(otherRuntimeKey)).toBe(true);
  });

  test('does not silently evict older user pins', () => {
    const store = useSessionPinnedStore.getState();
    for (let index = 0; index < 250; index += 1) {
      store.toggle({ directory: '/repo', sessionId: `session-${index}` });
    }

    expect(useSessionPinnedStore.getState().ids.size).toBe(250);
  });
});
