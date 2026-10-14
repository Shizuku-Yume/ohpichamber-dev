import { beforeEach, describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { compareSessionsByLifecycleOrder, observeSessionActivityEvent, orderSessionsByLifecycleScopes, reconcileSessionActivitySnapshot, removeSessionOrdering, resetSessionOrdering, useSessionOrderingStore } from './session-ordering';
const session = (sessionId: string, updatedAt: number, parentSessionId?: string): Session => ({ sessionId, projectId: 'project_1', workspaceId: 'workspace_1', displayPath: 'session', parentSessionId, rootSessionId: parentSessionId ?? sessionId, createdAt: updatedAt - 1, updatedAt, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, metadata: null, metadataRevision: '0', archiveRevision: '0' });
beforeEach(() => resetSessionOrdering());
describe('native session lifecycle ordering', () => {
  test('promotes only active and settled lifecycle edges', () => {
    observeSessionActivityEvent('session-a', 'settled');
    expect(useSessionOrderingStore.getState().rankById.has('session-a')).toBe(false);
    observeSessionActivityEvent('session-a', 'active');
    const rank = useSessionOrderingStore.getState().rankById.get('session-a');
    observeSessionActivityEvent('session-a', 'active');
    expect(useSessionOrderingStore.getState().rankById.get('session-a')).toBe(rank);
    observeSessionActivityEvent('session-a', 'settled');
    expect(useSessionOrderingStore.getState().rankById.get('session-a')).toBeGreaterThan(rank ?? 0);
  });
  test('seeds snapshots without synthetic promotion', () => {
    reconcileSessionActivitySnapshot(['active'], ['active', 'idle']);
    expect(useSessionOrderingStore.getState().rankById.has('active')).toBe(false);
  });
  test('removes deleted session rank', () => {
    observeSessionActivityEvent('session-a', 'active');
    removeSessionOrdering('session-a');
    expect(useSessionOrderingStore.getState().rankById.has('session-a')).toBe(false);
  });
  test('orders a parent forest parent-first', () => {
    const root = session('root', 1); const child = session('child', 2, 'root'); const other = session('other', 3);
    observeSessionActivityEvent('child', 'active');
    const ordered = orderSessionsByLifecycleScopes([root, child, other], new Set(), useSessionOrderingStore.getState().rankById);
    expect(ordered.map((item) => item.sessionId)).toEqual(['other', 'root', 'child']);
  });
  test('compares siblings by lifecycle rank', () => {
    const left = session('left', 1); const right = session('right', 1);
    observeSessionActivityEvent('left', 'active'); observeSessionActivityEvent('right', 'active');
    expect(compareSessionsByLifecycleOrder(right, left, new Set(), useSessionOrderingStore.getState().rankById)).toBeLessThan(0);
  });
  test('honors Host-pinned metadata without a resolved directory', () => {
    const pinned = { ...session('pinned', 1), metadata: { isPinned: true }, metadataRevision: '1' };
    const fresh = session('fresh', 100);
    expect(orderSessionsByLifecycleScopes([fresh, pinned], new Set(), new Map()).map((item) => item.sessionId)).toEqual(['pinned', 'fresh']);
  });
});
