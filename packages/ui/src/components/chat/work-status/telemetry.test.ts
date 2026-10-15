import { describe, expect, test } from 'bun:test';
import type { Message } from '@openchamber/agent-contract';
import { formatTelemetryDuration, formatTelemetryTokens, formatThroughputRate, getLatestCompletedTurnStats, mergeTimeIntervals, sumIntervalsDuration } from './telemetry';

const user = (id = 'u1', createdAt = 0): Message => ({ messageId: id, sessionId: 'session', turnId: id, role: 'user', createdAt, parts: [] });
const assistant = (id = 'a1', createdAt = 5000, usage?: NonNullable<Message['usage']>): Message => ({
  messageId: id, sessionId: 'session', turnId: id, role: 'assistant', createdAt, parts: [],
  ...(usage === undefined ? {} : { usage }),
});
const usage = (input: number, output: number, cacheRead = 0, cacheWrite = 0): NonNullable<Message['usage']> => ({
  input, output, cacheRead, cacheWrite, totalTokens: input + output + cacheRead + cacheWrite,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});
const turn = (reply = assistant('a1', 5000, usage(100, 100))): Message[] => [user(), reply];

describe('turn telemetry', () => {
  test('merges intervals and sums their duration', () => {
    expect(mergeTimeIntervals([])).toEqual([]);
    const merged = mergeTimeIntervals([[3000, 4000], [1000, 3000], [1500, 2500], [6000, 7000], [Number.NaN, 1], [9, 8]]);
    expect(merged).toEqual([[1000, 4000], [6000, 7000]]);
    expect(sumIntervalsDuration(merged)).toBe(4000);
  });
  test('formats durations, token counts and rates', () => {
    expect(formatTelemetryDuration(0)).toBe('0.0s');
    expect(formatTelemetryDuration(1234)).toBe('1.2s');
    expect(formatTelemetryDuration(84000)).toBe('1m 24s');
    expect(formatTelemetryTokens(1234)).toBe('1.2K');
    expect(formatTelemetryTokens(1500000)).toBe('1.5M');
    expect(formatThroughputRate(52.3)).toBe('~52 tok/s');
  });
  test('aggregates canonical assistant usage for the latest user-bounded turn', () => {
    const stats = getLatestCompletedTurnStats([
      user('old-user', 0), assistant('old', 1000, usage(10, 20)),
      user('new-user', 2000), assistant('new', 5000, usage(100, 300, 200, 0)),
    ]);
    expect(stats).toMatchObject({ stepsCount: 1, lastAssistantMessageId: 'new', elapsedDurationMs: 3000, inputTokens: 100, outputTokens: 300, totalGeneratedTokens: 300, cost: 0 });
    expect(stats?.tokensPerSecond).toBeNull();
    expect(stats?.responseTokensPerSecond).toBeNull();
  });
  test('requires a complete user-bounded assistant turn', () => {
    expect(getLatestCompletedTurnStats(null)).toBeNull();
    expect(getLatestCompletedTurnStats([])).toBeNull();
    expect(getLatestCompletedTurnStats([assistant()])).toBeNull();
    expect(getLatestCompletedTurnStats([user(), assistant('a', 1)])?.lastAssistantMessageId).toBe('a');
  });
  test('missing usage remains unavailable while valid timing is retained', () => {
    const stats = getLatestCompletedTurnStats(turn(assistant('a1', 5000)));
    expect(stats?.elapsedDurationMs).toBe(5000);
    expect(stats?.inputTokens).toBeNull();
    expect(stats?.outputTokens).toBeNull();
    expect(stats?.cost).toBeNull();
  });
  test('preserves zero usage and cache accounting', () => {
    const stats = getLatestCompletedTurnStats(turn(assistant('a1', 5000, usage(0, 0))));
    expect(stats?.outputTokens).toBe(0);
    expect(stats?.tokensPerSecond).toBeNull();
    expect(stats?.cost).toBe(0);
    expect(stats?.cacheHitPercent).toBe(0);
  });
});
