import type { Message, Turn } from '@openchamber/agent-contract';
import { computeCacheHitRate } from '@/stores/utils/tokenUtils';

export type CompletedTurnStats = {
  lastAssistantMessageId: string;
  /** A newer prompt has already started the next turn; these numbers are from the turn before it. */
  previousTurn: boolean;
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
<<<<<<< HEAD
=======

const lastConversationIndex = (records: readonly SessionMessageRecord[], end: number): number => {
  for (let i = end - 1; i >= 0; i -= 1) {
    if (isConversationRole(records[i].info.role)) return i;
  }
  return -1;
};

/**
 * Calculates telemetry metrics for the latest completed turn in the session.
 * A turn encompasses all assistant steps since the preceding user message up to the final completed assistant step.
 */
export function getLatestCompletedTurnStats(
  records: readonly SessionMessageRecord[] | null | undefined,
): CompletedTurnStats | null {
  if (!records || records.length === 0) return null;

  // v2 plumbing roles can trail the final assistant step, so the turn ends at
  // the newest conversation record rather than the newest record.
  const newestIdx = lastConversationIndex(records, records.length);
  if (newestIdx < 0) return null;
  // A prompt that has no reply yet lands before the session reports busy. The
  // turn before it is the latest finished one, and is flagged as such.
  if (records[newestIdx].info.role === 'user') {
    const previousIdx = lastConversationIndex(records, newestIdx);
    return previousIdx < 0 ? null : calculateTurnStats(records, previousIdx, true);
  }
  return calculateTurnStats(records, newestIdx, false);
}

/** Excludes the entire newest user-bounded turn, including its completed tool steps. */
export function getPreviousCompletedTurnStats(records: readonly SessionMessageRecord[]): CompletedTurnStats | null {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (records[i].info.role !== 'user') continue;
    const previousIdx = lastConversationIndex(records, i);
    return previousIdx < 0 ? null : calculateTurnStats(records, previousIdx, true);
  }
  return null;
}

/**
 * Stats for the turn whose final step is `lastCompletedAssistantIdx`. A partial
 * turn must not be published as complete or silently replaced with an older
 * turn's stats.
 */
function calculateTurnStats(
  records: readonly SessionMessageRecord[],
  lastCompletedAssistantIdx: number,
  previousTurn: boolean,
): CompletedTurnStats | null {
  const lastAssistantInfo = records[lastCompletedAssistantIdx].info;
  if (lastAssistantInfo.role !== 'assistant') return null;
  let turnStartIdx = -1;
  for (let i = lastCompletedAssistantIdx - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record.info.role === 'user') {
      turnStartIdx = i + 1;
      break;
    }
  }

  if (turnStartIdx === -1) return null;

  const turnStartMs = nonnegative(records[turnStartIdx - 1].info.time.created);
  const turnEndMs = nonnegative(lastAssistantInfo.time.completed);
  const elapsedDurationMs =
    turnStartMs !== null && turnEndMs !== null && turnEndMs >= turnStartMs
      ? turnEndMs - turnStartMs
      : null;

  const stepStatsList: CompletedStepStats[] = [];
  for (let i = turnStartIdx; i <= lastCompletedAssistantIdx; i += 1) {
    const record = records[i];
    if (record.info.role === 'assistant') {
      const stepStats = calculateCompletedStepStats(record);
      if (!stepStats) return null;
      stepStatsList.push(stepStats);
    }
  }

  if (stepStatsList.length === 0) return null;

  let totalLlmDurationMs: number | null = 0;
  let totalToolDurationMs: number | null = 0;
  let totalInputTokens: number | null = 0;
  let totalOutputTokens: number | null = 0;
  let totalReasoningTokens: number | null = 0;
  let totalCacheReadTokens: number | null = 0;
  let totalCacheWriteTokens: number | null = 0;
  let totalCost: number | null = 0;
  let totalTtft: number | null = 0;

  for (const step of stepStatsList) {
    totalLlmDurationMs = add(totalLlmDurationMs, step.adjustedLlmDurationMs);
    totalToolDurationMs = add(totalToolDurationMs, step.toolDurationMs);
    totalInputTokens = add(totalInputTokens, step.inputTokens);
    totalOutputTokens = add(totalOutputTokens, step.outputTokens);
    totalReasoningTokens = add(totalReasoningTokens, step.reasoningTokens);
    totalCacheReadTokens = add(totalCacheReadTokens, step.cacheReadTokens);
    totalCacheWriteTokens = add(totalCacheWriteTokens, step.cacheWriteTokens);
    totalCost = add(totalCost, step.cost);
    totalTtft = add(totalTtft, step.ttftMs);
  }

  const avgTtftMs = totalTtft === null ? null : totalTtft / stepStatsList.length;

  const totalGeneratedTokens = add(totalOutputTokens, totalReasoningTokens);
  const tokensPerSecond = totalGeneratedTokens !== null && totalLlmDurationMs !== null
    ? tokenRate(totalGeneratedTokens, totalLlmDurationMs)
    : null;

  const cacheHit = totalInputTokens !== null && totalCacheReadTokens !== null && totalCacheWriteTokens !== null ? computeCacheHitRate({
    input: totalInputTokens,
    cache: { read: totalCacheReadTokens, write: totalCacheWriteTokens },
  }) : null;

  return {
    lastAssistantMessageId: records[lastCompletedAssistantIdx].info.id,
    previousTurn,
    stepsCount: stepStatsList.length,
    elapsedDurationMs,
    totalLlmDurationMs,
    totalToolDurationMs,
    avgTtftMs,
    tokensPerSecond,
    responseTokensPerSecond: calculateResponseTokenRate(records[lastCompletedAssistantIdx]),
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    reasoningTokens: totalReasoningTokens,
    totalGeneratedTokens,
    cacheHitPercent: cacheHit?.hasInput ? Math.round(cacheHit.percent) : null,
    cost: totalCost,
  };
}
>>>>>>> bc50ba56a
