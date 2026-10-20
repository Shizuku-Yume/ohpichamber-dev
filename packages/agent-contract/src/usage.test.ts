import { describe, expect, it } from 'bun:test';
import {
  UsageQuerySchema, UsageTokensSchema, UsageModelSchema, UsageToolTotalsSchema,
  UsageToolUsageSchema, UsageToolsSchema, UsageStatsSchema, UsageToolsResponseSchema,
} from './usage.ts';

const tokens = { input: 3, output: 2, reasoning: null, cacheRead: 1, cacheWrite: 0, total: 6 };
const totals = { calls: 3, succeeded: 1, failed: 1, unfinished: 1 };
const tool = { name: 'read', ...totals, durationP50: null };
const model = { providerId: 'provider', modelId: 'model', variant: null, steps: 1, tokens, cost: 0.01 };
const report = {
  range: { from: 1, to: 100 }, sessions: 1, subagents: 0, prompts: 1, steps: 1,
  tokens, cost: 0.01, tools: { mode: 'none' }, activeDays: 1, streak: 1,
  activity: [{ date: '2026-10-18', steps: 1 }], models: [model], partial: false,
};

describe('historical usage wire boundaries', () => {
  it('defaults the exclusive end, validates timezone, and rejects paths or invalid windows', () => {
    const query = { from: 1, to: 100, timezone: 'America/New_York' };
    expect(UsageQuerySchema.parse(query)).toEqual(query);
    expect(UsageQuerySchema.safeParse({ ...query, timezone: 'Not/AZone' }).success).toBe(false);
    expect(UsageQuerySchema.safeParse({ ...query, timezone: '+01:00' }).success).toBe(false);
    expect(UsageQuerySchema.safeParse({ ...query, from: 100 }).success).toBe(false);
    const before = Date.now();
    const defaulted = UsageQuerySchema.parse({ from: 1, timezone: 'UTC' });
    expect(defaulted.to).toBeGreaterThanOrEqual(before);
    expect(defaulted.to).toBeLessThanOrEqual(Date.now());
    expect(UsageQuerySchema.safeParse({ ...query, projectId: '/tmp/session.jsonl' }).success).toBe(false);
    expect(UsageQuerySchema.safeParse({ ...query, path: '~/.omp/stats.db' }).success).toBe(false);
    expect(UsageQuerySchema.safeParse({ ...query, range: 'all' }).success).toBe(false);
    expect(UsageQuerySchema.safeParse({ timezone: 'UTC' }).success).toBe(true);
  });

  it('preserves unavailable reasoning and duration without fabricating zero', () => {
    expect(UsageTokensSchema.parse(tokens).reasoning).toBeNull();
    expect(UsageTokensSchema.safeParse({ ...tokens, reasoning: undefined }).success).toBe(false);
    expect(UsageModelSchema.parse(model).tokens.reasoning).toBeNull();
    expect(UsageToolUsageSchema.parse(tool).durationP50).toBeNull();
    expect(UsageToolTotalsSchema.parse(totals).unfinished).toBe(1);
    expect(UsageToolTotalsSchema.safeParse({ ...totals, calls: 4 }).success).toBe(false);
    expect(UsageToolsSchema.parse({ mode: 'none' })).toEqual({ mode: 'none' });
    expect(UsageToolsSchema.safeParse({ mode: 'detail', totals }).success).toBe(false);
  });

  it('serializes complete and partial reports without native error paths', () => {
    expect(UsageStatsSchema.parse(JSON.parse(JSON.stringify(report)))).toEqual(report);
    expect(UsageStatsSchema.parse({ ...report, partial: true, errors: { 'session-1': 'UsageSourceMalformed' } }).partial).toBe(true);
    expect(UsageStatsSchema.safeParse({ ...report, partial: true, errors: { 'session-1': '/private/session.jsonl' } }).success).toBe(false);
    expect(UsageToolsResponseSchema.parse({ totals, usage: [tool], partial: false }).usage[0]?.unfinished).toBe(1);
  });
});
