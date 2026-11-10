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
  test('history read failures are not treated as empty history', () => {
    expect(resolveLaneStatus({ session: idle, busy: false, blocking: null, reply: { state: 'error' } })).not.toBe('notStarted');
  });
});
