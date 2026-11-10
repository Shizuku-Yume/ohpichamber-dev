import { describe, expect, test } from 'bun:test';
import { resolveLaneStatus } from './laneStatus';

const idle = { runtimeStatus: 'idle' } as const;
const answered = { state: 'ready', text: 'Done.', error: null, status: 'completed', cost: null, finishedAt: null } as const;

describe('resolveLaneStatus', () => {
  test('blocking requests win over live activity', () => {
    for (const blocking of ['permission', 'question'] as const) {
      expect(resolveLaneStatus({ session: idle, busy: true, blocking, reply: answered })).toBe(blocking);
    }
  });
  test('a live turn wins over its previous failure', () => {
    expect(resolveLaneStatus({ session: idle, busy: true, blocking: null, reply: { ...answered, status: 'failed' } })).toBe('working');
  });
  test('native turn failure and cancellation never show success', () => {
    expect(resolveLaneStatus({ session: idle, busy: false, blocking: null, reply: { ...answered, status: 'failed' } })).toBe('failed');
    expect(resolveLaneStatus({ session: idle, busy: false, blocking: null, reply: { ...answered, status: 'cancelled' } })).toBe('stopped');
    expect(resolveLaneStatus({ session: { runtimeStatus: 'unavailable' }, busy: false, blocking: null, reply: answered })).toBe('failed');
  });
  test('successful empty history is distinct from a completed empty answer', () => {
    expect(resolveLaneStatus({ session: idle, busy: false, blocking: null, reply: { ...answered, text: '', status: null } })).toBe('notStarted');
    expect(resolveLaneStatus({ session: idle, busy: false, blocking: null, reply: { ...answered, text: '' } })).toBe('noReply');
    expect(resolveLaneStatus({ session: idle, busy: false, blocking: null, reply: answered })).toBe('finished');
  });
<<<<<<< HEAD
  test('history read failures are not treated as empty history', () => {
    expect(resolveLaneStatus({ session: idle, busy: false, blocking: null, reply: { state: 'error' } })).not.toBe('notStarted');
=======

  test('a lane with an active goal is working between turns, and ends when the goal settles', () => {
    const goal = (status: string) => ({ openchamber: { goal: { id: 'g', objective: 'ship it', status } } });
    expect(resolveLaneStatus({ session: { outcome: 'succeeded', time: ended, metadata: goal('active') }, busy: false, blocking: null, reply: answered })).toBe('working');
    expect(resolveLaneStatus({ session: { outcome: 'succeeded', time: ended, metadata: goal('complete') }, busy: false, blocking: null, reply: answered })).toBe('finished');
  });

  test('an empty answer is not finished, an unread or failed read still is', () => {
    expect(resolveLaneStatus({ session: { outcome: 'succeeded', time: ended }, busy: false, blocking: null, reply: { state: 'ready', text: '', error: null } })).toBe('noReply');
    expect(resolveLaneStatus({ session: { outcome: 'succeeded', time: ended }, busy: false, blocking: null, reply: answered })).toBe('finished');
    expect(resolveLaneStatus({ session: { time: ended }, busy: false, blocking: null, reply: { state: 'error' } })).toBe('finished');
    expect(resolveLaneStatus({ session: { time: ended }, busy: false, blocking: null, reply: { state: 'loading' } })).toBe('finished');
>>>>>>> bc50ba56a
  });
});
