import { describe, expect, test } from 'bun:test';
<<<<<<< HEAD
import type { Message } from '@openchamber/agent-contract';
import { computeContextUsage, DEFAULT_CONTEXT_LIMIT } from './contextUsage';
=======
import { computeContextUsage, computeLastReplyCacheHit, computeSessionTokenTotals, DEFAULT_CONTEXT_LIMIT } from './contextUsage';
>>>>>>> bc50ba56a

const assistant = (usage: NonNullable<Message['usage']> | undefined, messageId = 'message'): Message => ({
  messageId, sessionId: 'session', turnId: messageId, role: 'assistant', createdAt: 1, parts: [], ...(usage === undefined ? {} : { usage }),
});
const usage = (totalTokens: number): NonNullable<Message['usage']> => ({
  input: totalTokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});
const measured = (result: ReturnType<typeof computeContextUsage>) => {
  if (result?.state !== 'measured') throw new Error(`expected measured result, got ${result?.state ?? 'null'}`);
  return result;
};

describe('computeContextUsage', () => {
  test('uses the newest canonical assistant usage', () => {
    const result = computeContextUsage([assistant(usage(400), 'old'), assistant(usage(900), 'new')], 1000);
    expect(measured(result).totalTokens).toBe(900);
    expect(measured(result).percent).toBe(90);
  });
  test('skips messages without positive reported usage', () => {
    expect(measured(computeContextUsage([assistant(usage(300), 'real'), assistant(usage(0), 'empty')], 1000)).totalTokens).toBe(300);
    expect(computeContextUsage([{ messageId: 'user', role: 'user', usage: undefined }], 1000)).toBeNull();
  });
  test('keeps the percentage unrounded and applies the default limit', () => {
    expect(measured(computeContextUsage([assistant(usage(336))], 1000)).percent.toFixed(1)).toBe('33.6');
    expect(measured(computeContextUsage([assistant(usage(20_000))], 0)).limit).toBe(DEFAULT_CONTEXT_LIMIT);
  });
  test('returns null when no assistant reports usage', () => {
    expect(computeContextUsage([], 1000)).toBeNull();
    expect(computeContextUsage([assistant(undefined)], 1000)).toBeNull();
  });
  test('uses the server total instead of summing round-trip fields', () => {
    const result = computeContextUsage([assistant({ ...usage(232_872), input: 0, cacheRead: 3_291_956 })], 1_000_000);
    expect(measured(result).totalTokens).toBe(232_872);
    expect(measured(result).percent.toFixed(4)).toBe('23.2872');
  });
});

describe('computeLastReplyCacheHit', () => {
  test('reads the newest reply, never an average', () => {
    const result = computeLastReplyCacheHit([
      assistant({ total: 10, input: 10, output: 0, cache: { read: 0, write: 0 } }, 'old'),
      assistant({ total: 100, input: 20, output: 5, cache: { read: 60, write: 20 } }, 'new'),
    ]);
    expect(result).toBe(60);
  });

  test('has nothing to say after a compaction until the next reply', () => {
    // The compaction record's tokens describe the summarizing request.
    const result = computeLastReplyCacheHit([
      assistant({ total: 100, input: 20, output: 5, cache: { read: 80, write: 0 } }, 'reply'),
      compaction({ total: 50, input: 50, output: 10 }),
    ]);
    expect(result).toBeNull();
    expect(computeLastReplyCacheHit([])).toBeNull();
  });
});

describe('computeSessionTokenTotals', () => {
  test('reads the session counters, with the cache hit rate over all prompt tokens', () => {
    const result = computeSessionTokenTotals({
      tokens: { input: 200, output: 50, reasoning: 30, cache: { read: 700, write: 100 } },
    });
    // The prompt counts cached tokens too; OpenCode's `input` is only the uncached part.
    expect(result).toEqual({ prompt: 1000, output: 50, reasoning: 30, cacheRead: 700, cacheWrite: 100, cacheHitPercent: 70 });
  });

  test('has no cache hit rate without prompt tokens', () => {
    expect(computeSessionTokenTotals({ tokens: { input: 0, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } })?.cacheHitPercent).toBeNull();
  });

  test('has nothing to say before the session reports usage', () => {
    // A persisted snapshot strips the counters until the live record arrives.
    expect(computeSessionTokenTotals({})).toBeNull();
    expect(computeSessionTokenTotals(null)).toBeNull();
    // A new session carries only zeros.
    expect(computeSessionTokenTotals({ tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })).toBeNull();
  });
});
