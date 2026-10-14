import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { Session, SessionRuntimeStatus, SessionSnapshot } from '@openchamber/agent-contract';
import { canonicalClient, type SessionList } from '@/api/canonicalClient';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { applyGlobalSessionStatusEvent, replaceGlobalSessionStatusById, useGlobalSessionStatusStore } from './global-session-status';
import { resetGlobalBlockingRequests, useGlobalBlockingRequestsStore } from './global-blocking-requests';
import { HOST_STATUS_SEED_MAX_AGE_MS, buildHostStatusSeedSnapshots, seedGlobalSessionStatusFromHost } from './host-session-status-seed';
import { deferred, nativeApproval, nativeQuestion, nativeSnapshot } from './session-message-loader-test-fixtures';
import { resetSessionOrdering } from './session-ordering';
import { resetSessionActivityTiming } from './session-activity-timing';
import { installHookTestDom } from '../components/session/sidebar/test-utils/testDom';

const NOW = 1_700_000_000_000;
const originalRuntime = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();
let restoreDom: (() => void) | undefined;
const session = (sessionId: string, runtimeStatus: SessionRuntimeStatus = 'running', extra: Partial<Session> = {}): Session => ({
  sessionId, workspaceId: 'workspace-a', projectId: 'project-a', displayPath: 'display-only', rootSessionId: sessionId,
  createdAt: NOW - 1_000, updatedAt: NOW, epoch: 'epoch-a', headSequence: '4', runtimeStatus,
  activeRunId: runtimeStatus === 'idle' || runtimeStatus === 'unavailable' ? null : 'run-a',
  metadata: null, metadataRevision: '0', archiveRevision: '0', ...extra,
});
const liveStatus = (sessionId: string, runtimeStatus: SessionRuntimeStatus) => applyGlobalSessionStatusEvent('/repo', {
  type: 'session.status', sessionId, epoch: 'epoch-a', sequence: '5', timestamp: NOW, runtimeStatus,
  activeRunId: runtimeStatus === 'idle' || runtimeStatus === 'unavailable' ? null : 'run-a',
});

beforeEach(() => {
  restoreDom = installHookTestDom().restore;
  switchRuntimeEndpoint({ apiBaseUrl: 'https://seed-a.test', runtimeKey: 'seed-a' });
  resetWorkspaceDirectories();
  registerWorkspaceDirectory('workspace-a', '/repo');
  replaceGlobalSessionStatusById(new Map());
  resetGlobalBlockingRequests();
  resetSessionOrdering();
  resetSessionActivityTiming();
  spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => {
  mock.restore();
  replaceGlobalSessionStatusById(new Map());
  resetGlobalBlockingRequests();
  resetWorkspaceDirectories();
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime });
  restoreDom?.();
});

describe('native host status seed projection', () => {
  test('keeps distinct native live statuses and groups by admitted workspace, never display path', () => {
    const running = session('running');
    const approval = session('approval', 'awaiting_approval', { workspaceId: 'workspace-b' });
    const input = session('input', 'awaiting_input');
    const result = buildHostStatusSeedSnapshots({ items: [running, approval, input, session('idle', 'idle'), session('offline', 'unavailable')], errors: {} }, {
      isKnown: () => false, now: NOW, resolveDirectory: (id) => id === 'workspace-b' ? '/other' : '/repo',
    });
    expect(result.get('/repo')).toEqual([running, input]);
    expect(result.get('/other')).toEqual([approval]);
  });

  test('preserves readable siblings but excludes errors, observed, stale, archived and unresolved sessions', () => {
    const fresh = session('fresh', 'running', { updatedAt: NOW - HOST_STATUS_SEED_MAX_AGE_MS });
    const result = buildHostStatusSeedSnapshots({ items: [
      fresh, session('known'), session('stale', 'running', { updatedAt: fresh.updatedAt - 1 }),
      session('failed'), session('scope-failed', 'running', { workspaceId: 'failed-workspace' }),
      session('unplaced', 'running', { workspaceId: 'unknown' }), session('archived', 'running', { archivedAt: 0 }),
    ], errors: { failed: 'SESSION_UNAVAILABLE', 'failed-workspace': 'WORKSPACE_UNAVAILABLE' } }, {
      isKnown: (id) => id === 'known', now: NOW, resolveDirectory: (id) => id === 'unknown' ? null : '/repo',
    });
    expect(result.get('/repo')).toEqual([fresh]);
  });
});

describe('seedGlobalSessionStatusFromHost', () => {
  test('seeds unopened native sessions without overriding a live idle observed during discovery', async () => {
    const response = deferred<SessionList>();
    spyOn(canonicalClient, 'listSessions').mockReturnValue(response.promise);
    const snapshots = spyOn(canonicalClient, 'getSnapshot');
    const seed = seedGlobalSessionStatusFromHost();
    liveStatus('settled', 'idle');
    response.resolve({ items: [session('unopened'), session('settled')], errors: {} });
    await seed;
    expect(useGlobalSessionStatusStore.getState().statusById.get('unopened')).toEqual({ status: 'running', directory: '/repo' });
    expect(useGlobalSessionStatusStore.getState().statusById.has('settled')).toBe(false);
    expect(snapshots).not.toHaveBeenCalled();
  });

  test('failure, empty discovery, scoped errors and missing bindings never clear activity', async () => {
    liveStatus('existing', 'running');
    const list = spyOn(canonicalClient, 'listSessions').mockRejectedValue(new Error('offline'));
    await seedGlobalSessionStatusFromHost();
    list.mockResolvedValue({ items: [], errors: {} });
    await seedGlobalSessionStatusFromHost();
    list.mockResolvedValue({ items: [session('failed'), session('healthy'), session('unplaced', 'running', { workspaceId: 'unknown' })], errors: { failed: 'SESSION_UNAVAILABLE' } });
    await seedGlobalSessionStatusFromHost();
    expect([...useGlobalSessionStatusStore.getState().activeSessionIds].sort()).toEqual(['existing', 'healthy']);
  });

  test('coalesces overlapping requests but retries after their completion', async () => {
    const response = deferred<SessionList>();
    const list = spyOn(canonicalClient, 'listSessions').mockReturnValue(response.promise);
    const first = seedGlobalSessionStatusFromHost();
    expect(seedGlobalSessionStatusFromHost()).toBe(first);
    response.resolve({ items: [], errors: {} });
    await first;
    await seedGlobalSessionStatusFromHost();
    expect(list).toHaveBeenCalledTimes(2);
  });

  test('rejects a prior runtime generation even after switching back and does not coalesce new ownership', async () => {
    const old = deferred<SessionList>();
    const current = deferred<SessionList>();
    const list = spyOn(canonicalClient, 'listSessions').mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const stale = seedGlobalSessionStatusFromHost();
    switchRuntimeEndpoint({ apiBaseUrl: 'https://seed-b.test', runtimeKey: 'seed-b' });
    switchRuntimeEndpoint({ apiBaseUrl: 'https://seed-a.test', runtimeKey: 'seed-a' });
    registerWorkspaceDirectory('workspace-a', '/repo');
    const fresh = seedGlobalSessionStatusFromHost();
    old.resolve({ items: [session('obsolete')], errors: {} });
    await stale;
    expect(seedGlobalSessionStatusFromHost()).toBe(fresh);
    current.resolve({ items: [session('current')], errors: {} });
    await fresh;
    expect([...useGlobalSessionStatusStore.getState().activeSessionIds]).toEqual(['current']);
    expect(list).toHaveBeenCalledTimes(2);
  });

  test('loads real native pending DTOs only for blocking activity and filters prior epochs and terminal requests', async () => {
    spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: [session('blocked', 'awaiting_approval')], errors: {} });
    const snapshot = nativeSnapshot('blocked', []);
    snapshot.approvals = [nativeApproval('blocked'), { ...nativeApproval('blocked', 'old-epoch'), approvalId: 'old' }, { ...nativeApproval('blocked'), approvalId: 'terminal', status: 'expired' }];
    snapshot.questions = [nativeQuestion('blocked')];
    spyOn(canonicalClient, 'getSnapshot').mockResolvedValue(snapshot);
    await seedGlobalSessionStatusFromHost();
    const requests = useGlobalBlockingRequestsStore.getState().bySession.get('blocked');
    expect(requests?.permissions.map((item) => item.approvalId)).toEqual(['approval-a']);
    expect(requests?.forms.map((item) => item.questionId)).toEqual(['question-a']);
  });

  test('failed, stale-runtime and mismatched snapshots cannot seed pending requests', async () => {
    const list = spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: [session('blocked', 'awaiting_input')], errors: {} });
    const read = spyOn(canonicalClient, 'getSnapshot').mockRejectedValue(new Error('snapshot offline'));
    await seedGlobalSessionStatusFromHost();
    expect(useGlobalBlockingRequestsStore.getState().bySession.size).toBe(0);
    replaceGlobalSessionStatusById(new Map());
    read.mockResolvedValue(nativeSnapshot('other', []));
    await seedGlobalSessionStatusFromHost();
    expect(useGlobalBlockingRequestsStore.getState().bySession.size).toBe(0);
    replaceGlobalSessionStatusById(new Map());
    const response = deferred<SessionSnapshot>();
    read.mockReturnValue(response.promise);
    const seed = seedGlobalSessionStatusFromHost();
    await Promise.resolve();
    switchRuntimeEndpoint({ apiBaseUrl: 'https://seed-b.test', runtimeKey: 'seed-b' });
    const snapshot = nativeSnapshot('blocked', []);
    snapshot.questions = [nativeQuestion('blocked')];
    response.resolve(snapshot);
    await seed;
    expect(useGlobalBlockingRequestsStore.getState().bySession.size).toBe(0);
    expect(list).toHaveBeenCalledTimes(3);
  });
});
