import { describe, expect, test } from 'bun:test';
import type { Message, SessionSnapshot } from '@openchamber/agent-contract';
import { computeGuestSessionTokens } from './session-tokens';

const message: Message = {
  messageId: 'answer', sessionId: 'session', turnId: 'turn', role: 'assistant', createdAt: 1, parts: [],
  usage: {
    input: 200, output: 50, reasoning: 30, cacheRead: 700, cacheWrite: 100, totalTokens: 1050,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
};
const window: SessionSnapshot['window'] = { firstTurnId: 'turn', lastTurnId: 'turn', firstMessageId: 'answer', lastMessageId: 'answer', hasEarlier: false };

describe('Canonical guest session token totals', () => {
  test('projects reported native usage without double-counting reasoning', () => {
    expect(computeGuestSessionTokens([message], window)).toEqual({ prompt: 1000, output: 50, reasoning: 30, cacheRead: 700, cacheWrite: 100, cacheHitPercent: 70 });
  });
  test('sums reported assistant steps and ignores user messages', () => {
    const last = { ...message, messageId: 'second' };
    const totals = computeGuestSessionTokens([{ ...message, role: 'user' }, message, last], { ...window, lastMessageId: 'second' });
    expect(totals).toEqual({ prompt: 2000, output: 100, reasoning: 60, cacheRead: 1400, cacheWrite: 200, cacheHitPercent: 70 });
  });
  test('leaves empty and unavailable usage unknown', () => {
    expect(computeGuestSessionTokens(undefined, undefined)).toBeNull();
    expect(computeGuestSessionTokens([], { ...window, firstMessageId: null, lastMessageId: null })).toBeNull();
    expect(computeGuestSessionTokens([{ ...message, usage: undefined }], window)).toBeNull();
  });
  test('never labels partial or out-of-sync history as session totals', () => {
    expect(computeGuestSessionTokens([message], { ...window, hasEarlier: true })).toBeNull();
    expect(computeGuestSessionTokens([message], { ...window, firstMessageId: 'earlier' })).toBeNull();
    expect(computeGuestSessionTokens([message], { ...window, lastMessageId: 'later' })).toBeNull();
  });
  test('preserves reported zero usage without inventing a cache rate', () => {
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: message.usage!.cost };
    expect(computeGuestSessionTokens([{ ...message, usage }], window)).toEqual({ prompt: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cacheHitPercent: null });
  });
});
