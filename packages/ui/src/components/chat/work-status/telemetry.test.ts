import { describe, expect, test } from 'bun:test';
import type { Message, Turn } from '@openchamber/agent-contract';
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
<<<<<<< HEAD
  test('aggregates canonical assistant usage for the latest user-bounded turn', () => {
    const stats = getLatestCompletedTurnStats([
      user('old-user', 0), assistant('old', 1000, usage(10, 20)),
      user('new-user', 2000), assistant('new', 5000, usage(100, 300, 200, 0)),
=======

  test('aggregates a multi-step turn, subtracting the tool union and including reasoning tokens', () => {
    const records = turn(assistant({
      time: { created: 10000, completed: 20000 }, cost: 0.01,
      tokens: { input: 1000, output: 200, reasoning: 300, cache: { read: 2000, write: 0 } },
    }), [text(11500), tool(13000, 15000), tool(14000, 16000)]);
    records.push({ info: assistant({ id: 'a2', time: { created: 21000, completed: 24000 }, cost: 0.005,
      tokens: { input: 1500, output: 100, reasoning: 0, cache: { read: 0, write: 0 } },
    }), parts: [text(21500)] });
    const stats = getLatestCompletedTurnStats(records);
    expect(stats).toEqual({ stepsCount: 2, lastAssistantMessageId: 'a2', previousTurn: false, elapsedDurationMs: 24000, totalToolDurationMs: 3000,
      totalLlmDurationMs: 10000, outputTokens: 300, reasoningTokens: 300, totalGeneratedTokens: 600,
      inputTokens: 2500, cost: 0.015, tokensPerSecond: 60, responseTokensPerSecond: null, avgTtftMs: 1000, cacheHitPercent: 44 });
  });

  test('omits elapsed time when turn boundary timestamps are invalid', () => {
    const invalidStartStats = getLatestCompletedTurnStats([
      { info: { ...user, time: { created: Number.NaN } }, parts: [] },
      { info: assistant(), parts: [] },
>>>>>>> bc50ba56a
    ]);
    expect(stats).toMatchObject({ stepsCount: 1, lastAssistantMessageId: 'new', elapsedDurationMs: 3000, inputTokens: 100, outputTokens: 300, totalGeneratedTokens: 300, cost: 0 });
    expect(stats?.tokensPerSecond).toBeNull();
    expect(stats?.responseTokensPerSecond).toBeNull();
  });
<<<<<<< HEAD
  test('requires a complete user-bounded assistant turn', () => {
    expect(getLatestCompletedTurnStats(null)).toBeNull();
    expect(getLatestCompletedTurnStats([])).toBeNull();
    expect(getLatestCompletedTurnStats([assistant()])).toBeNull();
    expect(getLatestCompletedTurnStats([user(), assistant('a', 1)])?.lastAssistantMessageId).toBe('a');
=======

  test('uses only the latest user-bounded turn', () => {
    const records = [...turn(), ...turn(assistant({ id: 'new' }))];
    expect(getLatestCompletedTurnStats(records)?.stepsCount).toBe(1);
    expect(getLatestCompletedTurnStats(records)?.lastAssistantMessageId).toBe('new');
  });

  test('a plumbing message after the final step does not hide the finished turn', () => {
    const synthetic: SyntheticMessage = { id: 's1', sessionID: user.sessionID, role: 'synthetic', time: { created: 6000 }, text: 'plugin prompt' };
    const records = [...turn(assistant(), [text(1500)]), { info: synthetic, parts: [] }];
    expect(getLatestCompletedTurnStats(records)?.lastAssistantMessageId).toBe('a1');
  });

  test('a prompt with no reply yet yields the turn before it, flagged as previous', () => {
    const previous = getLatestCompletedTurnStats([...turn(), { info: { ...user, id: 'u2' }, parts: [] }]);
    expect(previous?.lastAssistantMessageId).toBe('a1');
    expect(previous?.previousTurn).toBe(true);
    expect(getLatestCompletedTurnStats(turn())?.previousTurn).toBe(false);
    expect(getLatestCompletedTurnStats([{ info: user, parts: [] }])).toBeNull();
    expect(getLatestCompletedTurnStats([{ info: user, parts: [] }, { info: { ...user, id: 'u2' }, parts: [] }])).toBeNull();
    expect(getLatestCompletedTurnStats([
      ...turn(assistant({ time: { created: 1000 } })), { info: { ...user, id: 'u2' }, parts: [] },
    ])).toBeNull();
  });

  test('does not publish unfinished or truncated turns, or substitute older results', () => {
    expect(getLatestCompletedTurnStats(null)).toBeNull();
    expect(getLatestCompletedTurnStats([])).toBeNull();
    expect(getLatestCompletedTurnStats([{ info: assistant(), parts: [] }])).toBeNull();
    expect(getLatestCompletedTurnStats([...turn(), ...turn(assistant({ time: { created: 1000 } }))])).toBeNull();
    expect(getLatestCompletedTurnStats([
      ...turn(assistant({ time: { created: 1000 } })), { info: assistant({ id: 'a2' }), parts: [] },
    ])).toBeNull();
>>>>>>> bc50ba56a
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
    // Without input tokens a cache hit rate has no denominator, so it is
    // unavailable rather than 0%.
    expect(stats?.cacheHitPercent).toBeNull();
  });
  test('calculates true elapsed duration and aggregates multi-step tool calls from canonical Turn', () => {
    // Intermediate virtual user messages created at tool completion timestamp
    const userPrompt: Message = { messageId: 'u1', sessionId: 'session', turnId: 'turn-1', role: 'user', createdAt: 1000, parts: [] };
    const assistantStep1: Message = { messageId: 'a1', sessionId: 'session', turnId: 'turn-1', role: 'assistant', createdAt: 2000, parts: [], usage: usage(100, 50) };
    const virtualUserStep: Message = { messageId: 'vu1', sessionId: 'session', turnId: 'turn-1', role: 'user', createdAt: 4500, parts: [] };
    const assistantStep2: Message = { messageId: 'a2', sessionId: 'session', turnId: 'turn-1', role: 'assistant', createdAt: 4500, parts: [], usage: usage(200, 150) };

    const turnRecord: Turn = {
      turnId: 'turn-1',
      sessionId: 'session',
      runId: 'run-1',
      status: 'completed',
      userMessageId: 'u1',
      assistantMessageIds: ['a1', 'a2'],
      startedAt: 1000,
      finishedAt: 5500,
    };

    const stats = getLatestCompletedTurnStats([userPrompt, assistantStep1, virtualUserStep, assistantStep2], [turnRecord]);
    expect(stats).toMatchObject({
      lastAssistantMessageId: 'a2',
      stepsCount: 2,
      elapsedDurationMs: 4500,
      inputTokens: 300,
      outputTokens: 200,
      totalGeneratedTokens: 200,
    });
    expect(formatTelemetryDuration(stats!.elapsedDurationMs!)).toBe('4.5s');
  });
  test('selects latest completed turn when multiple historical turns exist', () => {
    const turn1: Turn = {
      turnId: 'turn-1', sessionId: 'session', runId: 'run-1', status: 'completed',
      userMessageId: 'u1', assistantMessageIds: ['a1'], startedAt: 1000, finishedAt: 3000,
    };
    const turn2: Turn = {
      turnId: 'turn-2', sessionId: 'session', runId: 'run-2', status: 'completed',
      userMessageId: 'u2', assistantMessageIds: ['a2'], startedAt: 4000, finishedAt: 7500,
    };
    const turnRunning: Turn = {
      turnId: 'turn-3', sessionId: 'session', runId: 'run-3', status: 'running',
      userMessageId: 'u3', assistantMessageIds: [], startedAt: 8000,
    };

    const messages: Message[] = [
      { messageId: 'u1', sessionId: 'session', turnId: 'turn-1', role: 'user', createdAt: 1000, parts: [] },
      { messageId: 'a1', sessionId: 'session', turnId: 'turn-1', role: 'assistant', createdAt: 3000, parts: [], usage: usage(50, 50) },
      { messageId: 'u2', sessionId: 'session', turnId: 'turn-2', role: 'user', createdAt: 4000, parts: [] },
      { messageId: 'a2', sessionId: 'session', turnId: 'turn-2', role: 'assistant', createdAt: 7500, parts: [], usage: usage(150, 150) },
    ];

    const stats = getLatestCompletedTurnStats(messages, [turn1, turn2, turnRunning]);
    expect(stats).toMatchObject({
      lastAssistantMessageId: 'a2',
      stepsCount: 1,
      elapsedDurationMs: 3500,
      inputTokens: 150,
      outputTokens: 150,
    });
    expect(formatTelemetryDuration(stats!.elapsedDurationMs!)).toBe('3.5s');
  });
  test('skips virtual user step messages with identical timestamp to assistant when turns record is absent', () => {
    const userPrompt: Message = { messageId: 'u1', sessionId: 'session', turnId: 'turn-1', role: 'user', createdAt: 1000, parts: [] };
    const assistantStep1: Message = { messageId: 'a1', sessionId: 'session', turnId: 'turn-1', role: 'assistant', createdAt: 2000, parts: [], usage: usage(100, 50) };
    const virtualUserStep: Message = { messageId: 'vu1', sessionId: 'session', turnId: 'turn-1', role: 'user', createdAt: 4500, parts: [] };
    const assistantStep2: Message = { messageId: 'a2', sessionId: 'session', turnId: 'turn-1', role: 'assistant', createdAt: 4500, parts: [], usage: usage(200, 150) };

    const stats = getLatestCompletedTurnStats([userPrompt, assistantStep1, virtualUserStep, assistantStep2]);
    expect(stats?.elapsedDurationMs).toBe(3500);
    expect(formatTelemetryDuration(stats!.elapsedDurationMs!)).toBe('3.5s');
  });
});
