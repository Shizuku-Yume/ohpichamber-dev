import { expect, test } from 'bun:test';
import type { Message, SessionSnapshot } from '@openchamber/agent-contract';
import { frameContext, frameContextLimit, frameSessionFields, sameFrameSessionFields, selectFrameContextReading } from './session-usage';

const assistant = (messageId: string, totalTokens: number, modelId = 'small'): Message => ({
  messageId, sessionId: 'session', turnId: 'turn', role: 'assistant', providerId: 'acme', modelId, createdAt: 1, parts: [],
  usage: { input: totalTokens, output: 20, cacheRead: 40, cacheWrite: 10, totalTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
});
const window: SessionSnapshot['window'] = { firstTurnId: 'turn', lastTurnId: 'turn', firstMessageId: 'answer', lastMessageId: 'answer', hasEarlier: false };
const snapshot = (input: number) => ({
  selection: { model: { providerId: 'acme', modelId: 'small' }, thinkingLevel: 'off' },
  messages: [assistant('answer', input)], window,
});
const session = { sessionId: 'session', title: 'Session' };

test('a frame observes Canonical counter changes without re-publishing unchanged totals', () => {
  const first = frameSessionFields(session, snapshot(100));
  expect(first.tokens).toEqual({ prompt: 150, output: 20, reasoning: 0, cacheRead: 40, cacheWrite: 10, cacheHitPercent: 40 / 150 * 100 });
  expect(first.model).toBe('acme/small');
  expect(sameFrameSessionFields(first, frameSessionFields(session, snapshot(100)))).toBe(true);
  expect(sameFrameSessionFields(first, frameSessionFields(session, snapshot(200)))).toBe(false);
  expect(sameFrameSessionFields(first, frameSessionFields({ ...session, title: 'Renamed' }, snapshot(100)))).toBe(false);
});

test('missing or partial authoritative snapshots stay unknown', () => {
  expect(frameSessionFields(undefined).tokens).toBeNull();
  expect(frameSessionFields(session).model).toBeUndefined();
  expect(frameSessionFields(session, { ...snapshot(100), window: { ...window, hasEarlier: true } }).tokens).toBeNull();
  expect(selectFrameContextReading([])).toBeNull();
});

test('context fill resets at a Canonical compaction notice and measures again at the next reply', () => {
  const compaction: Message = { messageId: 'compact', sessionId: 'session', turnId: 'turn', role: 'system', createdAt: 2, parts: [{ type: 'notice', partId: 'notice', noticeType: 'compaction', level: 'info', message: 'Compacted', details: { method: 'compacted', tokensBefore: 150 } }] };
  expect(selectFrameContextReading([assistant('first', 150)])).toEqual({ tokens: 150, model: 'acme/small' });
  expect(selectFrameContextReading([assistant('first', 150), compaction])).toBeNull();
  expect(selectFrameContextReading([{ ...compaction, parts: [{ type: 'notice', partId: 'notice', noticeType: 'compaction', level: 'info', details: { method: 'compacted', tokensBefore: 150, tokensAfter: 0 } }] }])).toEqual({ tokens: 0, model: null });
  expect(selectFrameContextReading([assistant('first', 150), compaction, assistant('next', 75)])).toEqual({ tokens: 75, model: 'acme/small' });
});

test('the context belongs to the latest measured answering model, not a later unmeasured step', () => {
  const reading = selectFrameContextReading([assistant('first', 150), assistant('next', 0, 'large')]);
  expect(reading).toEqual({ tokens: 150, model: 'acme/small' });
  expect(selectFrameContextReading([assistant('first', 150), assistant('next', 300, 'large')])).toEqual({ tokens: 300, model: 'acme/large' });
  expect(frameContextLimit(reading, [])).toBeNull();
  expect(frameContextLimit(reading, [{ providerId: 'acme', models: [{ modelId: 'small', contextWindow: 1_000, maxOutputTokens: 100 }] }])).toBe(1_000);
  expect(frameContext(reading, null)).toEqual({ tokens: 150, limit: null });
  expect(frameContext(null, null)).toBeNull();
});
