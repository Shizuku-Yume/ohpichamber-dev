import type { Message, Turn } from '@openchamber/agent-contract';
import { computeCacheHitRate } from '@/stores/utils/tokenUtils';

export type CompletedTurnStats = {
  lastAssistantMessageId: string;
  stepsCount: number;
  elapsedDurationMs: number | null;
  totalLlmDurationMs: number | null;
  totalToolDurationMs: number | null;
  avgTtftMs: number | null;
  tokensPerSecond: number | null;
  responseTokensPerSecond: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalGeneratedTokens: number | null;
  cacheHitPercent: number | null;
  cost: number | null;
};

export function mergeTimeIntervals(intervals: readonly (readonly [number, number])[]): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const valid: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) valid.push([start, end]);
  }
  valid.sort((a, b) => a[0] - b[0]);
  if (valid.length === 0) return [];
  const merged: Array<[number, number]> = [valid[0]];
  for (let i = 1; i < valid.length; i += 1) {
    const current = valid[i];
    const last = merged[merged.length - 1];
    if (current[0] <= last[1]) last[1] = Math.max(last[1], current[1]);
    else merged.push(current);
  }
  return merged;
}

export function sumIntervalsDuration(intervals: readonly (readonly [number, number])[]): number {
  return intervals.reduce((sum, [start, end]) => sum + (end - start), 0);
}

export const formatTelemetryDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '0.0s';
  if (ms < 50) return '<0.1s';
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
};

export const formatTelemetryTokens = (tokens: number): string => {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(Math.round(tokens));
};

export const formatThroughputRate = (tps: number): string => `~${Math.round(tps)} tok/s`;

const nonnegative = (value: number | undefined): number | null =>
  value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;

const add = (left: number | null, right: number | null): number | null =>
  left === null || right === null ? null : nonnegative(left + right);

/**
 * Canonical messages intentionally expose no provider timing fields. Turn
 * telemetry therefore reports only values represented by the contract and
 * leaves timing/rate metrics unavailable instead of reconstructing them.
 */
export function getLatestCompletedTurnStats(
  messages: readonly Message[] | null | undefined,
  turns?: readonly Turn[] | null,
): CompletedTurnStats | null {
  const completedTurns = turns ? turns.filter((turn) => turn.status === 'completed') : [];
  const latestTurn = completedTurns.length > 0 ? completedTurns[completedTurns.length - 1] : null;

  if (latestTurn) {
    const start = latestTurn.startedAt;
    const end = latestTurn.finishedAt;
    const elapsedDurationMs = Number.isFinite(start) && Number.isFinite(end) && end !== undefined && end >= start ? end - start : null;

    const assistantIds = new Set(latestTurn.assistantMessageIds);
    let assistants = messages
      ? messages.filter((message) => message.role === 'assistant' && (assistantIds.has(message.messageId) || message.turnId === latestTurn.turnId))
      : [];
    if (assistants.length === 0 && messages) {
      assistants = messages.filter((message) => message.role === 'assistant');
    }
    const lastAssistantMessageId = assistants.length > 0
      ? assistants[assistants.length - 1].messageId
      : latestTurn.assistantMessageIds.length > 0
        ? latestTurn.assistantMessageIds[latestTurn.assistantMessageIds.length - 1]
        : null;

    if (!lastAssistantMessageId) return null;

    let inputTokens: number | null = 0;
    let outputTokens: number | null = 0;
    let cacheReadTokens: number | null = 0;
    let cacheWriteTokens: number | null = 0;
    let cost: number | null = 0;
    for (const message of assistants) {
      inputTokens = add(inputTokens, nonnegative(message.usage?.input));
      outputTokens = add(outputTokens, nonnegative(message.usage?.output));
      cacheReadTokens = add(cacheReadTokens, nonnegative(message.usage?.cacheRead));
      cacheWriteTokens = add(cacheWriteTokens, nonnegative(message.usage?.cacheWrite));
      cost = add(cost, nonnegative(message.usage?.cost?.total));
    }

    const totalGeneratedTokens = outputTokens;
    const cacheHit = inputTokens !== null && cacheReadTokens !== null && cacheWriteTokens !== null
      ? computeCacheHitRate({ input: inputTokens, cache: { read: cacheReadTokens, write: cacheWriteTokens } })
      : null;

    return {
      lastAssistantMessageId,
      stepsCount: Math.max(assistants.length, latestTurn.assistantMessageIds.length),
      elapsedDurationMs,
      totalLlmDurationMs: null,
      totalToolDurationMs: null,
      avgTtftMs: null,
      tokensPerSecond: null,
      responseTokensPerSecond: null,
      inputTokens,
      outputTokens,
      totalGeneratedTokens,
      cacheHitPercent: cacheHit?.hasInput ? Math.round(cacheHit.percent) : null,
      cost,
    };
  }

  if (!messages || messages.length === 0) return null;
  let lastAssistantIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      lastAssistantIndex = index;
      break;
    }
  }
  if (lastAssistantIndex < 0) return null;

  let turnStartIndex = -1;
  for (let index = lastAssistantIndex; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role === 'user') {
      const isVirtual = ('virtualUser' in candidate && Boolean(candidate.virtualUser))
        || (candidate.createdAt === messages[lastAssistantIndex].createdAt && index < lastAssistantIndex);
      if (isVirtual && index > 0) {
        const earlierUser = messages.slice(0, index).some((m) => m.role === 'user');
        if (earlierUser) continue;
      }
      turnStartIndex = index;
      break;
    }
  }
  if (turnStartIndex < 0) return null;
  const assistants = messages.slice(turnStartIndex + 1, lastAssistantIndex + 1).filter((message) => message.role === 'assistant');
  if (assistants.length === 0) return null;

  let inputTokens: number | null = 0;
  let outputTokens: number | null = 0;
  let cacheReadTokens: number | null = 0;
  let cacheWriteTokens: number | null = 0;
  let cost: number | null = 0;
  for (const message of assistants) {
    inputTokens = add(inputTokens, nonnegative(message.usage?.input));
    outputTokens = add(outputTokens, nonnegative(message.usage?.output));
    cacheReadTokens = add(cacheReadTokens, nonnegative(message.usage?.cacheRead));
    cacheWriteTokens = add(cacheWriteTokens, nonnegative(message.usage?.cacheWrite));
    cost = add(cost, nonnegative(message.usage?.cost?.total));
  }

  const start = messages[turnStartIndex].createdAt;
  const end = messages[lastAssistantIndex].createdAt;
  const elapsedDurationMs = Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
  const totalGeneratedTokens = outputTokens;
  const cacheHit = inputTokens !== null && cacheReadTokens !== null && cacheWriteTokens !== null
    ? computeCacheHitRate({ input: inputTokens, cache: { read: cacheReadTokens, write: cacheWriteTokens } })
    : null;

  return {
    lastAssistantMessageId: messages[lastAssistantIndex].messageId,
    stepsCount: assistants.length,
    elapsedDurationMs,
    totalLlmDurationMs: null,
    totalToolDurationMs: null,
    avgTtftMs: null,
    tokensPerSecond: null,
    responseTokensPerSecond: null,
    inputTokens,
    outputTokens,
    totalGeneratedTokens,
    cacheHitPercent: cacheHit?.hasInput ? Math.round(cacheHit.percent) : null,
    cost,
  };
}
