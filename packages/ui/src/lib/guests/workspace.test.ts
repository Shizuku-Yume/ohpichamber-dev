import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { ChildStoreManager } from '@/sync/child-store';
import { setSyncRefs } from '@/sync/sync-refs';
import { applyGlobalSessionStatusEvent, replaceGlobalSessionStatusById } from '@/sync/global-session-status';
import { readGuestWorkspace, observeGuestWorkspace } from './workspace';
import { guestMay } from './capabilities';
import { buildLinkedGuestIssue, buildLinkedIssue, buildLinkedLinearIssue } from '@/lib/linkedIssues';

const session = (sessionId: string, displayPath: string, projectId: string, workspaceId: string): Session => ({
  sessionId, projectId, workspaceId, displayPath, rootSessionId: sessionId,
  createdAt: 1, updatedAt: 1, epoch: 'epoch-1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: { title: sessionId }, metadataRevision: '1', archiveRevision: '0',
});
let manager: ChildStoreManager;
let bSession: Session;
beforeEach(() => {
  manager = new ChildStoreManager();
  setSyncRefs(manager, '/a');
  resetWorkspaceDirectories();
  useProjectsStore.setState({ hasServerSnapshot: true, serverSnapshotFailed: false, projects: [
    { id: 'path_/a', path: '/a', label: 'A', addedAt: 1 },
    { id: 'path_/b', path: '/b', label: 'B', addedAt: 1 },
    { id: 'path_/other', path: '/other', label: 'Other', addedAt: 1 },
  ] });
  useSessionUIStore.setState({ availableWorktreesByProject: new Map([['/b', [{ path: '/b-tree', projectDirectory: '/b', branch: 'fix', name: 'fix', label: 'fix', worktreeStatus: 'ready' }]]]), worktreeDiscoveryByProject: new Map([['/a', 'ready'], ['/b', 'ready'], ['/other', 'ready']]) });
  const aSession = session('a-session', '.', 'pro_a', 'ws-a');
  bSession = session('b-session', 'fix', 'pro_b', 'ws-b-tree');
  const unrelatedSession = session('unrelated-session', '.', 'pro_other', 'ws-other');
  registerWorkspaceDirectory('ws-a', '/a');
  registerWorkspaceDirectory('ws-b-tree', '/b-tree');
  registerWorkspaceDirectory('ws-other', '/other');
  useGlobalSessionsStore.getState().applySnapshot([aSession, bSession, unrelatedSession], [], 'ready');
  manager.ensureChild('/a', { bootstrap: false }).setState({ session: [aSession], sessionTotal: 1, sessionStatusReady: true });
  manager.ensureChild('/b-tree', { bootstrap: false }).setState({ session: [bSession], sessionTotal: 1, sessionStatusReady: true });
  manager.ensureChild('/other', { bootstrap: false }).setState({ session: [unrelatedSession], sessionTotal: 1, sessionStatusReady: true });
  // The legacy diagnostic field is not maintained by the current sync pipeline.
  useUIStore.setState({ eventStreamStatus: 'idle' });
  replaceGlobalSessionStatusById(new Map());
});
afterEach(() => manager.disposeAll());
const readB = () => {
  const snapshot = readGuestWorkspace({ kind: 'sessions', projectId: 'path_/b' }, 'board');
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
        expect(snapshot.sessions[0]).toMatchObject({ projectId: 'path_/b', directory: '/b-tree' });
        expect(snapshot.sessions[0].worktree?.branch).toBe('fix');
        expect(snapshot.sessions[0].activity).toBe('unknown');
      }
      expect(fetch.mock.calls.length).toBe(0);
    } finally { fetch.mockRestore(); }
  });
  test('projects canonical sessions by resolved workspace directory, not canonical project ids', () => {
    const aliasSession = session('alias-session', 'fix', 'pro_b', 'ws-b-alias');
    registerWorkspaceDirectory('ws-b-alias', '/b-alias');
    manager.ensureChild('/b-alias', { bootstrap: false }).setState({ session: [aliasSession], sessionTotal: 1, sessionStatusReady: true });

    const b = readB();
    expect(b.sessions.map((entry) => [entry.id, entry.projectId, entry.directory])).toEqual([
      ['b-session', 'path_/b', '/b-tree'],
    ]);
    expect(b.coverage.map((entry) => entry.directory)).toEqual(['/b', '/b-tree']);

    const a = readGuestWorkspace({ kind: 'sessions', projectId: 'path_/a' }, 'board');
    if (a.kind !== 'sessions') throw new Error('Expected sessions');
    expect(a.sessions.map((entry) => [entry.id, entry.projectId, entry.directory, entry.worktree])).toEqual([
      ['a-session', 'path_/a', '/a', null],
    ]);

    const other = readGuestWorkspace({ kind: 'sessions', projectId: 'path_/other' }, 'board');
    if (other.kind !== 'sessions') throw new Error('Expected sessions');
    expect(other.sessions.map((entry) => entry.id)).toEqual(['unrelated-session']);
    expect(readGuestWorkspace({ kind: 'sessions', projectId: 'path_/nope' }, 'board')).toMatchObject({ state: 'error', sessions: [] });
  });
  test('observer publishes a session added to a project directory', async () => {
    const child = manager.ensureChild('/b-tree', { bootstrap: false });
    child.setState({ session: [] });
    const seen: string[][] = [];
    const stop = observeGuestWorkspace({ kind: 'sessions', projectId: 'path_/b' }, 'board', (snapshot) => {
      if (snapshot.kind === 'sessions') seen.push(snapshot.sessions.map((entry) => entry.id));
    });
    try {
      expect(seen).toEqual([[]]);
      child.setState({ session: [bSession] });
      await Promise.resolve();
      expect(seen.at(-1)).toEqual(['b-session']);
    } finally { stop(); }
  });
  test('projects only the subscribing guest linked items with guest-visible ids and data', () => {
    const linkedIssues: NonNullable<NonNullable<Session['metadata']>['openchamber']>['linked_issues'] = [
      buildLinkedGuestIssue({ providerId: 'board', identifier: 'ITEM-1', title: 'Mine', url: 'https://guest.example/1', data: { column: 'todo', labels: ['a'] }, linkedAt: 2 }),
      buildLinkedGuestIssue({ providerId: 'other', identifier: 'ITEM-2', title: 'Theirs', url: 'https://guest.example/2', data: { secret: true }, linkedAt: 3 }),
      buildLinkedIssue({ number: 7, title: 'Issue', url: 'https://github.com/acme/widgets/issues/7', kind: 'issue', linkedAt: 4 }),
      buildLinkedLinearIssue({ identifier: 'ENG-1', title: 'Linear', url: 'https://linear.app/acme/ENG-1', linkedAt: 5 }),
      buildLinkedGuestIssue({ providerId: 'board', identifier: 'ITEM-3', title: 'No data', url: 'https://guest.example/3', linkedAt: 6 }),
    ];
    const linkedSession = { ...bSession, metadata: { title: 'b-session', openchamber: { linked_issues: linkedIssues } } };
    manager.ensureChild('/b-tree', { bootstrap: false }).setState({ session: [linkedSession] });

    const own = readB().sessions[0].items;
    expect(own).toEqual([
      { id: 'ITEM-1', data: { column: 'todo', labels: ['a'] } },
      { id: 'ITEM-3' },
    ]);
    expect('data' in own[1]).toBe(false);

    const other = readGuestWorkspace({ kind: 'sessions', projectId: 'path_/b' }, 'other');
    if (other.kind !== 'sessions') throw new Error('Expected sessions');
    expect(other.sessions[0].items).toEqual([{ id: 'ITEM-2', data: { secret: true } }]);
  });
  test('live outcomes work with canonical status events and distinguish turn outcomes', () => {
    useConfigStore.setState({ isConnected: true });
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
    useConfigStore.setState({ isConnected: true });
    const child = manager.ensureChild('/b-tree', { bootstrap: false });
    child.setState({ sessionStatusReady: true });
    const activity: string[] = [];
    const stop = observeGuestWorkspace({ kind: 'sessions', projectId: 'path_/b' }, 'board', (snapshot) => {
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
    const stop = observeGuestWorkspace({ kind: 'sessions', projectId: 'path_/b' }, 'board', () => snapshots.push(1));
    const child = manager.ensureChild('/b-tree', { bootstrap: false });
    await Promise.resolve();
    const baseline = snapshots.length;
    for (let i = 0; i < 100; i++) child.setState({ sessionStatusReady: child.getState().sessionStatusReady });
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
    useConfigStore.setState({ isConnected: true });
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
