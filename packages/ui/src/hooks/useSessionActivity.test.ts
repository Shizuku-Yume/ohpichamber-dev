import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { nativeSnapshot } from '@/sync/session-message-loader-test-fixtures';
import { deriveSessionActivity, selectBoundRunId, sessionActivityPhase } from './useSessionActivity';

const projected = (activeRunId: string | null): Session => ({
  ...nativeSnapshot('session-1', []).session,
  runtimeStatus: activeRunId === null ? 'idle' : 'running',
  activeRunId,
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
});

const boundSnapshot = (activeRunId: string) => {
  const snapshot = nativeSnapshot('session-1', []);
  return {
    ...snapshot,
    session: { ...snapshot.session, runtimeStatus: 'running' as const, activeRunId },
  };
};

const activity = (overrides: Partial<Parameters<typeof deriveSessionActivity>[0]> = {}) => deriveSessionActivity({
  sessionId: 'session-1',
  status: undefined,
  activeRunId: null,
  permissionsPending: false,
  formsPending: false,
  ...overrides,
});

describe('session activity authority', () => {
  test('native compaction exposes stop without a run and clears with native completion', () => {
    expect(activity({ status: 'idle', compacting: true })).toMatchObject({ phase: 'busy', isWorking: true });
    expect(activity({ status: 'idle', compacting: false }).phase).toBe('idle');
    expect(activity({ status: 'idle', compacting: true, formsPending: true }).phase).toBe('idle');
    expect(activity({ status: 'idle', compacting: true, permissionsPending: true }).phase).toBe('idle');
  });

  test('a live runtime status is working and exposes stop', () => {
    for (const status of ['running', 'awaiting_approval', 'awaiting_input'] as const) {
      expect(activity({ status })).toMatchObject({ phase: 'busy', isWorking: true, isBusy: true, isUnknown: false });
    }
  });

  test('an authoritative idle status is idle', () => {
    expect(activity({ status: 'idle' })).toMatchObject({ phase: 'idle', isWorking: false, isUnknown: false });
    expect(activity({ status: 'idle', activeRunId: 'run-1' }).phase).toBe('idle');
  });

  test('missing or unavailable status with a native run binding is unknown, not idle', () => {
    for (const status of [undefined, 'unavailable'] as const) {
      const result = activity({ status, activeRunId: 'run-1' });
      expect(result).toMatchObject({ phase: 'unknown', isWorking: false, isBusy: false, isUnknown: true });
      // ChatInput.canAbort is `phase !== 'idle'`; unknown must expose stop.
      expect(result.phase !== 'idle').toBe(true);
    }
  });

  test('missing or unavailable status without a run binding does not invent stop', () => {
    for (const status of [undefined, 'unavailable'] as const) {
      const result = activity({ status, activeRunId: null });
      expect(result).toMatchObject({ phase: 'idle', isUnknown: false });
      expect(result.phase !== 'idle').toBe(false);
    }
  });

  test('pending permissions or forms keep the send precedence', () => {
    expect(activity({ status: 'running', activeRunId: 'run-1', permissionsPending: true }).phase).toBe('idle');
    expect(activity({ status: 'running', activeRunId: 'run-1', formsPending: true }).phase).toBe('idle');
    expect(activity({ status: 'unavailable', activeRunId: 'run-1', formsPending: true }).phase).toBe('idle');
  });

  test('an unavailable session is settled, which is what shows its recap and suggestion', () => {
    // A reload reaches a session the Agent Service does not hold: the projection
    // says `unavailable` with no run binding. The assist surfaces treat that as
    // settled, so a real payload written before the reload still renders.
    expect(sessionActivityPhase('unavailable', null)).toBe('idle');
    expect(sessionActivityPhase(undefined, null)).toBe('idle');
    expect(sessionActivityPhase('idle', 'run-1')).toBe('idle');
    // Proof of work, or a run the client cannot see the end of, is not settled.
    expect(sessionActivityPhase('running', 'run-1')).toBe('busy');
    expect(sessionActivityPhase('unavailable', 'run-1')).toBe('unknown');
  });

  test('no session has no activity', () => {
    expect(activity({ sessionId: null, status: 'running', activeRunId: 'run-1' }).phase).toBe('idle');
  });

  test('the materialized snapshot owns the run binding over a stale projection', () => {
    const snapshot = boundSnapshot('run-new');
    expect(selectBoundRunId({ session: [projected('run-stale')], snapshot: { 'session-1': snapshot } }, 'session-1')).toBe('run-new');
    const released = { ...snapshot, session: { ...snapshot.session, runtimeStatus: 'idle' as const, activeRunId: null } };
    expect(selectBoundRunId({ session: [projected('run-stale')], snapshot: { 'session-1': released } }, 'session-1')).toBeNull();
    expect(selectBoundRunId({ session: [projected('run-stale')], snapshot: {} }, 'session-1')).toBe('run-stale');
    expect(selectBoundRunId({ session: [], snapshot: {} }, 'session-1')).toBeNull();
  });
});
