import { beforeEach, describe, expect, test } from 'bun:test';
import { applySessionActivityEvents, observeSessionActivityTiming, reconcileSessionActivityTiming, removeSessionActivityTiming, resetSessionActivityTiming, useSessionActivityTimingStore } from './session-activity-timing';
const startedAt = (id: string): number | undefined => useSessionActivityTimingStore.getState().startedAt.get(id);
const settledMs = (id: string): number | undefined => useSessionActivityTimingStore.getState().settledMs.get(id);
beforeEach(() => resetSessionActivityTiming());
describe('native session activity timing', () => {
  test('repeated active observations do not restart a turn', () => {
    observeSessionActivityTiming('session_1', 'active');
    const start = startedAt('session_1');
    observeSessionActivityTiming('session_1', 'active');
    expect(startedAt('session_1')).toBe(start);
  });
  test('run boundaries settle a watched turn', () => {
    applySessionActivityEvents('/repo', [{ type: 'run.started', sessionId: 'session_1', epoch: 'epoch_1', sequence: '1', timestamp: 1, runId: 'run_1', createdAt: 1 }]);
    expect(startedAt('session_1')).toBeDefined();
    applySessionActivityEvents('/repo', [{ type: 'run.completed', sessionId: 'session_1', epoch: 'epoch_1', sequence: '2', timestamp: 2, runId: 'run_1', finishedAt: 2 }]);
    expect(startedAt('session_1')).toBeUndefined();
    expect(settledMs('session_1')).toBe(1);
  });
  test('snapshot coverage settles only watched sessions', () => {
    observeSessionActivityTiming('session_1', 'active'); observeSessionActivityTiming('session_2', 'active');
    reconcileSessionActivityTiming(new Set(['session_1']), (id) => id === 'session_1' || id === 'session_2');
    expect(startedAt('session_1')).toBeDefined();
    expect(startedAt('session_2')).toBeUndefined();
    expect(settledMs('session_2')).toBeDefined();
  });
  test('deletion clears timing state', () => {
    observeSessionActivityTiming('session_1', 'active'); removeSessionActivityTiming('session_1');
    expect(startedAt('session_1')).toBeUndefined(); expect(settledMs('session_1')).toBeUndefined();
  });
  test('stale run completion cannot settle a newer run', () => {
    applySessionActivityEvents('/repo', [{ type: 'run.started', sessionId: 'session_1', epoch: 'epoch_1', sequence: '1', timestamp: 1, runId: 'run_2', createdAt: 1 }]);
    applySessionActivityEvents('/repo', [{ type: 'run.completed', sessionId: 'session_1', epoch: 'epoch_1', sequence: '2', timestamp: 2, runId: 'run_1', finishedAt: 2 }]);
    expect(startedAt('session_1')).toBe(1);
    expect(settledMs('session_1')).toBeUndefined();
  });
});
