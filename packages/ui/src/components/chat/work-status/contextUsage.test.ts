import { describe, expect, test } from 'bun:test';
import type { Message } from '@openchamber/agent-contract';
import { computeContextUsage, DEFAULT_CONTEXT_LIMIT } from './contextUsage';

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
