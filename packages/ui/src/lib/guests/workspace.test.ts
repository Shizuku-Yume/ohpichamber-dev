import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { ChildStoreManager } from '@/sync/child-store';
import { setSyncRefs } from '@/sync/sync-refs';
import { applyGlobalSessionStatusEvent, replaceGlobalSessionStatusById } from '@/sync/global-session-status';
import { readGuestWorkspace, observeGuestWorkspace } from './workspace';
import { guestMay } from './capabilities';

const session = (sessionId: string, displayPath: string, projectId: string): Session => ({
  sessionId, projectId, workspaceId: `workspace-${projectId}`, displayPath, rootSessionId: sessionId,
  createdAt: 1, updatedAt: 1, epoch: 'epoch-1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: { title: sessionId }, metadataRevision: '1', archiveRevision: '0',
});
let manager: ChildStoreManager;
beforeEach(() => {
  manager = new ChildStoreManager();
  setSyncRefs(manager, '/a');
  useProjectsStore.setState({ hasServerSnapshot: true, serverSnapshotFailed: false, projects: [
    { id: 'a', path: '/a', label: 'A', addedAt: 1 }, { id: 'b', path: '/b', label: 'B', addedAt: 1 },
  ] });
  useSessionUIStore.setState({ availableWorktreesByProject: new Map([['/b', [{ path: '/b-tree', projectDirectory: '/b', branch: 'fix', name: 'fix', label: 'fix', worktreeStatus: 'ready' }]]]), worktreeDiscoveryByProject: new Map([['/a', 'ready'], ['/b', 'ready']]) });
  const aSession = session('a-session', '/a', 'a');
  const bSession = session('b-session', '/b-tree', 'b');
  useGlobalSessionsStore.getState().applySnapshot([aSession, bSession], [], 'ready');
  manager.ensureChild('/a', { bootstrap: false }).setState({ session: [aSession], sessionTotal: 1, sessionStatusReady: true });
  manager.ensureChild('/b-tree', { bootstrap: false }).setState({ session: [bSession], sessionTotal: 1, sessionStatusReady: true });
  // The legacy diagnostic field is not maintained by the current sync pipeline.
  useUIStore.setState({ eventStreamStatus: 'idle' });
  replaceGlobalSessionStatusById(new Map());
});
afterEach(() => manager.disposeAll());
const readB = () => {
  const snapshot = readGuestWorkspace({ kind: 'sessions', projectId: 'b' }, 'board');
  if (snapshot.kind !== 'sessions') throw new Error('Expected sessions');
  return snapshot;
};
describe('extension workspace projection', () => {
  test('paused and partially approved extensions cannot use retained grants', () => {
    expect(guestMay({ id: 'board', name: 'Board', icon: 'window', enabled: false,
      capabilities: { requested: ['sessions'], granted: ['sessions'] } }, 'sessions')).toBe(false);
    expect(guestMay({ id: 'board', name: 'Board', icon: 'window',
      capabilities: { requested: ['sessions', 'prompt'], granted: ['sessions'] } }, 'sessions')).toBe(false);
  });
  test('uses shared topology and never starts a network read', () => {
    const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
    try {
      for (let i = 0; i < 100; i++) {
        const snapshot = readB();
        expect(snapshot.sessions.map((entry) => entry.id)).toEqual(['b-session']);
        expect(snapshot.sessions[0].worktree?.branch).toBe('fix');
        expect(snapshot.sessions[0].activity).toBe('unknown');
      }
      expect(fetch.mock.calls.length).toBe(0);
    } finally { fetch.mockRestore(); }
  });
  test('live outcomes work with canonical status events and distinguish turn outcomes', () => {
    const status = (runtimeStatus: 'running' | 'idle', activeRunId: string | null, sequence: string) => ({
      type: 'session.status' as const, sessionId: 'b-session', epoch: 'epoch-1', sequence, timestamp: Number(sequence), runtimeStatus, activeRunId,
    });
    const store = manager.ensureChild('/b-tree', { bootstrap: false });
    store.setState({ sessionStatusReady: true });
    expect(readB().sessions[0]).toMatchObject({ activity: 'idle', outcome: null });
    applyGlobalSessionStatusEvent('/b-tree', status('running', 'run-1', '1'));
    expect(readB().sessions[0]).toMatchObject({ activity: 'running', outcome: null });
    applyGlobalSessionStatusEvent('/b-tree', { type: 'run.failed', sessionId: 'b-session', epoch: 'epoch-1', sequence: '2', timestamp: 2, runId: 'run-1', finishedAt: 2, error: 'Failed' });
    expect(readB().sessions[0]).toMatchObject({ activity: 'idle', outcome: 'failed' });
    applyGlobalSessionStatusEvent('/b-tree', status('running', 'run-2', '3'));
    applyGlobalSessionStatusEvent('/b-tree', { type: 'run.completed', sessionId: 'b-session', epoch: 'epoch-1', sequence: '4', timestamp: 4, runId: 'run-2', finishedAt: 4 });
    expect(readB().sessions[0]).toMatchObject({ activity: 'idle', outcome: 'completed' });
    useConfigStore.setState({ isConnected: false });
    expect(readB().sessions[0]).toMatchObject({ activity: 'unknown', outcome: null });
  });
  test('archive invalidation prevents old idle coverage and notifies guest subscribers', async () => {
    const child = manager.ensureChild('/b-tree', { bootstrap: false });
    child.setState({ sessionStatusReady: true });
    const activity: string[] = [];
    const stop = observeGuestWorkspace({ kind: 'sessions', projectId: 'b' }, 'board', (snapshot) => {
      if (snapshot.kind === 'sessions') activity.push(snapshot.sessions[0].activity);
    });
    try {
      expect(activity).toEqual(['idle']);
      child.setState({ sessionStatusInvalidated: { 'b-session': true } });
      await Promise.resolve();
      expect(readB().sessions[0]).toMatchObject({ activity: 'unknown', outcome: null });
      expect(activity).toEqual(['idle', 'unknown']);
      child.setState({ sessionStatusInvalidated: {} });
      await Promise.resolve();
      expect(activity).toEqual(['idle', 'unknown', 'idle']);
    } finally { stop(); }
  });
  test('worktree loading and errors retain data, and token updates do not publish', async () => {
    const snapshots: number[] = [];
    const stop = observeGuestWorkspace({ kind: 'sessions', projectId: 'b' }, 'board', () => snapshots.push(1));
    const child = manager.ensureChild('/b-tree', { bootstrap: false });
    await Promise.resolve();
    const baseline = snapshots.length;
    for (let i = 0; i < 100; i++) child.setState({ part: {} });
    await Promise.resolve();
    expect(snapshots.length).toBe(baseline);
    useSessionUIStore.setState({ worktreeDiscoveryByProject: new Map([['/b', 'error']]) });
    expect(readB()).toMatchObject({ state: 'error', sessions: [{ id: 'b-session' }] });
    await Promise.resolve();
    expect(snapshots.length).toBe(baseline + 1);
    stop();
    applyGlobalSessionStatusEvent('/b-tree', { type: 'session.status', sessionId: 'b-session', epoch: 'epoch-1', sequence: '5', timestamp: 5, runtimeStatus: 'running', activeRunId: 'run-3' });
    await Promise.resolve();
    expect(snapshots.length).toBe(baseline + 1);
  });
  test('blocking requests expose state without conversation data', () => {
    const child = manager.ensureChild('/b-tree', { bootstrap: false });
    applyGlobalSessionStatusEvent('/b-tree', { type: 'session.status', sessionId: 'b-session', epoch: 'epoch-1', sequence: '6', timestamp: 6, runtimeStatus: 'awaiting_approval', activeRunId: 'run-4' });
    expect(readB().sessions[0].activity).toBe('waiting-permission');
    child.setState({ permission: { 'b-session': [{ approvalId: 'permission', sessionId: 'b-session', turnId: 'turn-1', toolCallId: 'tool-1', toolName: 'bash', actionType: 'bash_command', commandSummary: 'echo', details: {}, status: 'pending', requestedAt: 1, version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' }] } });
    expect(readB().sessions[0].activity).toBe('waiting-permission');
    child.setState({ permission: {}, form: { 'b-session': [{ questionId: 'form', sessionId: 'b-session', turnId: 'turn-1', prompt: 'Pick one', schema: { type: 'boolean' }, status: 'pending', requestedAt: 1, version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' }] } });
    expect(readB().sessions[0].activity).toBe('waiting-question');
    expect('messages' in readB().sessions[0]).toBe(false);
  });
});
