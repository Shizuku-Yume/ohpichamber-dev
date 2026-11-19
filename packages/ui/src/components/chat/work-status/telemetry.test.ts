import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Message, StepTiming, Turn } from '@openchamber/agent-contract';
import { formatTelemetryDuration, formatTelemetryTokens, formatThroughputRate, getLatestCompletedTurnStats } from './telemetry';

const user = (id = 'u1', createdAt = 0): Message => ({ messageId: id, sessionId: 'session', turnId: id, role: 'user', createdAt, parts: [] });
const assistant = (id = 'a1', createdAt = 5000, usage?: NonNullable<Message['usage']>, timing?: StepTiming): Message => ({
  messageId: id, sessionId: 'session', turnId: id, role: 'assistant', createdAt, parts: [],
  ...(usage === undefined ? {} : { usage }),
  ...(timing === undefined ? {} : { timing }),
});
const usage = (input: number, output: number, cacheRead = 0, cacheWrite = 0): NonNullable<Message['usage']> => ({
  input, output, cacheRead, cacheWrite, totalTokens: input + output + cacheRead + cacheWrite,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});
const turn = (reply = assistant('a1', 5000, usage(100, 100))): Message[] => [user(), reply];
const toolCallPart = (id: string): Message['parts'][number] => ({
  type: 'tool_call', partId: `p-${id}`, toolCallId: `t-${id}`, toolName: 'read', input: {}, status: 'completed',
});
const completedTurn = (assistantMessageIds: string[], startedAt = 1000, finishedAt = 8000): Turn => ({
  turnId: 'turn-1', sessionId: 'session', runId: 'run-1', status: 'completed',
  userMessageId: 'u1', assistantMessageIds, startedAt, finishedAt,
});
const step = (id: string, timing: StepTiming, output: number, parts: Message['parts'] = []): Message => ({
  messageId: id, sessionId: 'session', turnId: 'turn-1', role: 'assistant', createdAt: timing.startedAt,
  parts, usage: usage(100, output), timing,
});

describe('turn telemetry', () => {
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
||||||| bc50ba56aa

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
      inputTokens: 2500, cost: 0.015, tokensPerSecond: 60, responseTokensPerSecond: null, avgTtftMs: 1000, avgFirstOutputMs: null, cacheHitPercent: 44 });
  });

  test('first output averages OpenCode\'s recorded first output across steps, a tool-first step included', () => {
    // A step that opens with a tool call has no text start for TTFT, but
    // OpenCode still records its first output.
    const records = turn(assistant({ time: { created: 1000, firstToken: 1400, completed: 5000 } }), [text(1000), tool(1400, 4000)]);
    records.push({ info: assistant({ id: 'a2', time: { created: 6000, firstToken: 6200, completed: 7000 } }), parts: [] });
    const stats = getLatestCompletedTurnStats(records);
    expect(stats?.avgFirstOutputMs).toBe(300);
    expect(stats?.avgTtftMs).toBeNull();
  });

  test('first output is hidden when a step has no record of it or the record is outside the step', () => {
    const missing = [...turn(assistant({ time: { created: 1000, firstToken: 1400, completed: 5000 } }))];
    missing.push({ info: assistant({ id: 'a2', time: { created: 6000, completed: 7000 } }), parts: [] });
    expect(getLatestCompletedTurnStats(missing)?.avgFirstOutputMs).toBeNull();
    expect(getLatestCompletedTurnStats(turn(assistant({ time: { created: 1000, firstToken: 900, completed: 5000 } })))?.avgFirstOutputMs).toBeNull();
    expect(getLatestCompletedTurnStats(turn(assistant({ time: { created: 1000, firstToken: 6000, completed: 5000 } })))?.avgFirstOutputMs).toBeNull();
  });

  test('omits elapsed time when turn boundary timestamps are invalid', () => {
    const invalidStartStats = getLatestCompletedTurnStats([
      { info: { ...user, time: { created: Number.NaN } }, parts: [] },
      { info: assistant(), parts: [] },
>>>>>>> upstream/main
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

describe('timing-derived telemetry', () => {
  test('derives model time, tool time, TTFT and throughput from step timings', () => {
    const messages = [
      user(),
      step('a1', { startedAt: 1000, firstTokenAt: 1200, completedAt: 3000 }, 50, [toolCallPart('a1')]),
      step('a2', { startedAt: 5000, firstTokenAt: 5100, completedAt: 7000 }, 150),
    ];
    const stats = getLatestCompletedTurnStats(messages, [completedTurn(['a1', 'a2'])]);
    expect(stats).toMatchObject({
      totalLlmDurationMs: 4000,
      totalToolDurationMs: 2000,
      avgTtftMs: 150,
      totalGeneratedTokens: 200,
    });
    // 200 generated tokens over 4s of model time.
    expect(stats?.tokensPerSecond).toBeCloseTo(50, 6);
    // Final step: 150 tokens over the 1.9s between its first token and completion.
    expect(stats?.responseTokensPerSecond).toBeCloseTo(150 / 1.9, 6);
  });
  test('a step without timing leaves timing-derived metrics unavailable while usage still reports', () => {
    const messages = [user(), step('a1', { startedAt: 1000, firstTokenAt: 1200, completedAt: 3000 }, 50), assistant('a2', 4000, usage(200, 150))];
    const stats = getLatestCompletedTurnStats(messages, [completedTurn(['a1', 'a2'])]);
    expect(stats).toMatchObject({
      totalLlmDurationMs: 2000,
      totalToolDurationMs: null,
      avgTtftMs: 200,
      inputTokens: 300,
      outputTokens: 200,
      totalGeneratedTokens: 200,
    });
    expect(stats?.tokensPerSecond).toBeCloseTo(100, 6);
    // The final step carries no timing, so its response rate has no source.
    expect(stats?.responseTokensPerSecond).toBeNull();
  });
  test('a turn with no step timing reports usage but no timing-derived metrics', () => {
    const stats = getLatestCompletedTurnStats([user(), assistant('a1', 5000, usage(100, 300))], [completedTurn(['a1'])]);
    expect(stats).toMatchObject({
      totalLlmDurationMs: null,
      totalToolDurationMs: null,
      avgTtftMs: null,
      tokensPerSecond: null,
      responseTokensPerSecond: null,
      inputTokens: 100,
      outputTokens: 300,
    });
  });
  test('a single-step turn has no tool time', () => {
    const stats = getLatestCompletedTurnStats(
      [user(), step('a1', { startedAt: 1000, firstTokenAt: 1500, completedAt: 4000 }, 100)],
      [completedTurn(['a1'])],
    );
    expect(stats?.totalToolDurationMs).toBeNull();
    expect(stats?.totalLlmDurationMs).toBe(3000);
    expect(stats?.avgTtftMs).toBe(500);
    expect(stats?.tokensPerSecond).toBeCloseTo(100 / 3, 6);
    expect(stats?.responseTokensPerSecond).toBeCloseTo(100 / 2.5, 6);
  });
  test('an implausible rate is unavailable rather than reported', () => {
    const stats = getLatestCompletedTurnStats(
      [user(), step('a1', { startedAt: 1000, firstTokenAt: 1000, completedAt: 2000 }, 10_000_000)],
      [completedTurn(['a1'])],
    );
    expect(stats?.totalLlmDurationMs).toBe(1000);
    expect(stats?.tokensPerSecond).toBeNull();
    expect(stats?.responseTokensPerSecond).toBeNull();
  });
  test('a final step with tool calls has no response rate while the turn rate still reports', () => {
    const stats = getLatestCompletedTurnStats(
      [user(), step('a1', { startedAt: 1000, firstTokenAt: 1100, completedAt: 2000 }, 100, [toolCallPart('a1')])],
      [completedTurn(['a1'])],
    );
    expect(stats?.responseTokensPerSecond).toBeNull();
    expect(stats?.tokensPerSecond).toBeCloseTo(100, 6);
  });
});

describe('a real run recorded from the running server', () => {
    // Captured from a live OMP turn that ran one bash tool call and then
    // answered. The server records one turn per model step of a run, which is
    // the shape that broke the first version of this derivation.
    const history = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'real-run-history.json'), 'utf8'));

    test('reports model time, tool time, first-token latency and throughput', () => {
        const stats = getLatestCompletedTurnStats(history.messages, history.turns);
        expect(stats).not.toBeNull();
        expect(stats?.stepsCount).toBe(2);
        expect(stats?.totalLlmDurationMs).toBe(3748);
        expect(stats?.totalToolDurationMs).toBe(588);
        expect(stats?.avgTtftMs).toBeCloseTo(1725.5, 1);
        expect(stats?.tokensPerSecond).toBeCloseTo(25.88, 1);
        expect(stats?.responseTokensPerSecond).toBeCloseTo(571.43, 1);
        expect(stats?.elapsedDurationMs).toBe(4345);
        expect(stats?.outputTokens).toBe(97);
    });
});
