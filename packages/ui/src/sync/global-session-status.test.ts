import { beforeEach, describe, expect, test } from 'bun:test';
import type { CanonicalEvent, SessionRuntimeStatus } from '@openchamber/agent-contract';
import { applyGlobalSessionStatusEvent, applyGlobalSessionStatusEvents, applyGlobalSessionStatusSnapshot, hasActiveSubagent, replaceGlobalSessionStatusById, setSessionParentResolver, useGlobalSessionStatusStore } from './global-session-status';
import { resetSessionActivityTiming, useSessionActivityTimingStore } from './session-activity-timing';
import { resetSessionOrdering } from './session-ordering';
import { resetBackgroundShells } from './background-shells';
const event = (type: CanonicalEvent['type'], fields: Record<string, unknown>): CanonicalEvent => ({ sessionId: String(fields.sessionId ?? 'session_1'), epoch: 'epoch_1', sequence: '1', timestamp: 1, type, ...fields } as CanonicalEvent);
const status = (sessionId: string, runtimeStatus: SessionRuntimeStatus): CanonicalEvent => event('session.status', { sessionId, runtimeStatus, activeRunId: runtimeStatus === 'idle' || runtimeStatus === 'unavailable' ? null : 'run_1' });
beforeEach(() => { replaceGlobalSessionStatusById(new Map()); resetSessionOrdering(); resetSessionActivityTiming(); resetBackgroundShells(); setSessionParentResolver(() => undefined); });
describe('global canonical session status', () => {
  test('tracks runtime status strings and active membership', () => {
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'running'));
    expect(useGlobalSessionStatusStore.getState().statusById.get('session_1')?.status).toBe('running');
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(true);
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'idle'));
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(false);
  });
  test('run terminal events settle timing and preserve failed outcome', () => {
    applyGlobalSessionStatusEvents('/repo', [event('run.started', { sessionId: 'session_1', runId: 'run_1', createdAt: 1 }), event('run.failed', { sessionId: 'session_1', runId: 'run_1', finishedAt: 2, error: 'failed' })]);
    expect(useSessionActivityTimingStore.getState().startedAt.has('session_1')).toBe(false);
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).toBe('failed');
  });
  test('authoritative snapshots reconcile one directory without clearing sibling status', () => {
    applyGlobalSessionStatusEvent('/repo', status('repo_session', 'running'));
    applyGlobalSessionStatusEvent('/other', status('other_session', 'running'));
    applyGlobalSessionStatusSnapshot('/repo', {}, ['repo_session']);
    expect(useGlobalSessionStatusStore.getState().statusById.has('repo_session')).toBe(false);
    expect(useGlobalSessionStatusStore.getState().statusById.has('other_session')).toBe(true);
  });
  test('nested active sessions keep the parent turn visible', () => {
    setSessionParentResolver((id) => id === 'child' ? 'root' : undefined);
    applyGlobalSessionStatusEvent('/repo', status('child', 'running'));
    expect(hasActiveSubagent('root', useGlobalSessionStatusStore.getState().activeSessionIds)).toBe(true);
  });
  test('scoped recovery preserves sibling timers and their active ancestor', () => {
    setSessionParentResolver((id) => id === 'other_child' ? 'root' : undefined);
    applyGlobalSessionStatusEvents('/repo', [status('root', 'running'), status('sibling', 'running')]);
    applyGlobalSessionStatusEvent('/other', status('other_child', 'running'));
    const siblingStart = useSessionActivityTimingStore.getState().startedAt.get('sibling');
    const rootStart = useSessionActivityTimingStore.getState().startedAt.get('root');
    applyGlobalSessionStatusSnapshot('/repo', { root: 'idle' }, ['root'], { root: null });
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('sibling')).toBe(true);
    expect(useSessionActivityTimingStore.getState().startedAt.get('sibling')).toBe(siblingStart);
    expect(useSessionActivityTimingStore.getState().startedAt.get('root')).toBe(rootStart);
    applyGlobalSessionStatusSnapshot('/other', {}, ['other_child']);
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('sibling')).toBe(true);
  });
  test('stale run terminals cannot clear a newer run or its timer', () => {
    applyGlobalSessionStatusEvent('/repo', event('run.started', { runId: 'new_run', createdAt: 100 }));
    applyGlobalSessionStatusEvent('/repo', event('run.failed', { runId: 'old_run', finishedAt: 200, error: 'stale' }));
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(true);
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).toBeNull();
    expect(useSessionActivityTimingStore.getState().startedAt.get('session_1')).toBe(100);
    applyGlobalSessionStatusEvent('/repo', event('run.completed', { runId: 'new_run', finishedAt: 250 }));
    expect(useSessionActivityTimingStore.getState().settledMs.get('session_1')).toBe(150);
  });
  test('disconnect clears active status without reporting a completed run', () => {
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'running'));
    applyGlobalSessionStatusSnapshot('/repo', { session_1: 'unavailable' }, ['session_1']);
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(false);
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).not.toBe('completed');
    applyGlobalSessionStatusSnapshot('/repo', { session_1: 'running' }, ['session_1'], { session_1: 'run_2' });
    applyGlobalSessionStatusEvent('/repo', event('run.completed', { runId: 'run_2', finishedAt: Date.now() }));
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(false);
  });
  test('idle following failure preserves outcome and a new run clears it', () => {
    applyGlobalSessionStatusEvents('/repo', [event('run.started', { runId: 'run_1', createdAt: 1 }), event('run.failed', { runId: 'run_1', finishedAt: 2, error: 'failed' }), status('session_1', 'idle')]);
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).toBe('failed');
    applyGlobalSessionStatusEvent('/repo', event('run.started', { runId: 'run_2', createdAt: 3 }));
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).toBeNull();
  });
  test('cancelled run publishes a terminal cancelled outcome', () => {
    applyGlobalSessionStatusEvent('/repo', event('run.started', { runId: 'run_cancelled', createdAt: 1 }));
    applyGlobalSessionStatusEvent('/repo', event('run.cancelled', { runId: 'run_cancelled', finishedAt: 2 }));
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).toBe('cancelled');
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(false);
  });
  test('streaming-only and repeated live events preserve public references', () => {
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'running'));
    const before = useGlobalSessionStatusStore.getState();
    applyGlobalSessionStatusEvent('/repo', event('part.delta', { partId: 'part_1', delta: 'x' }));
    expect(useGlobalSessionStatusStore.getState()).toBe(before);
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'running'));
    expect(useGlobalSessionStatusStore.getState()).toBe(before);
  });
  test('directory-wide empty success clears only its own statuses', () => {
    applyGlobalSessionStatusEvents('/repo', [status('one', 'running'), status('two', 'running')]);
    applyGlobalSessionStatusEvent('/other', status('other', 'running'));
    applyGlobalSessionStatusSnapshot('/repo', {});
    expect([...useGlobalSessionStatusStore.getState().activeSessionIds]).toEqual(['other']);
  });
  test('idle observations suppress host seed resurrection while preserving no-op idle', () => {
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'idle'));
    const observed = useGlobalSessionStatusStore.getState().observedById.get('session_1');
    expect(observed).toEqual({ directory: '/repo', outcome: null });
    const before = useGlobalSessionStatusStore.getState();
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'idle'));
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')).toEqual(observed);
    expect(useGlobalSessionStatusStore.getState().statusById).toBe(before.statusById);
  });
});
