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

/** A rate above this means the timing window is broken, not that the model is fast. */
const MAX_PLAUSIBLE_TOKENS_PER_SECOND = 5000;

const nonnegative = (value: number | undefined): number | null =>
  value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;

const add = (left: number | null, right: number | null): number | null =>
  left === null || right === null ? null : nonnegative(left + right);

type StepWindow = {
  startedAt: number;
  firstTokenAt: number | null;
  completedAt: number | null;
};

const stepWindow = (message: Message): StepWindow | null => {
  const timing = message.timing;
  if (!timing || !Number.isFinite(timing.startedAt)) return null;
  // A stamp before the step started cannot describe this step.
  const usable = (value: number | undefined) =>
    value !== undefined && Number.isFinite(value) && value >= timing.startedAt ? value : null;
  return {
    startedAt: timing.startedAt,
    firstTokenAt: usable(timing.firstTokenAt),
    completedAt: usable(timing.completedAt),
  };
};

const rateFrom = (tokens: number | null, durationMs: number | null): number | null => {
  if (tokens === null || durationMs === null || durationMs <= 0) return null;
  const rate = tokens / (durationMs / 1000);
  return Number.isFinite(rate) && rate <= MAX_PLAUSIBLE_TOKENS_PER_SECOND ? rate : null;
};

type TimingMetrics = Pick<
  CompletedTurnStats,
  'totalLlmDurationMs' | 'totalToolDurationMs' | 'avgTtftMs' | 'tokensPerSecond' | 'responseTokensPerSecond'
>;

const deriveTimingMetrics = (steps: readonly Message[], totalGeneratedTokens: number | null): TimingMetrics => {
  const windows = steps.map(stepWindow);
  const timed = windows.filter((window): window is StepWindow => window !== null);

  let totalLlmDurationMs: number | null = null;
  for (const window of timed) {
    if (window.completedAt === null) continue;
    totalLlmDurationMs = (totalLlmDurationMs ?? 0) + (window.completedAt - window.startedAt);
  }

  // Time between one step finishing and the next starting is tool and loop
  // work, not model time.
  let totalToolDurationMs: number | null = null;
  if (timed.length >= 2) {
    totalToolDurationMs = 0;
    for (let index = 1; index < windows.length; index += 1) {
      const previous = windows[index - 1];
      const current = windows[index];
      if (previous === null || previous.completedAt === null || current === null) continue;
      const gap = current.startedAt - previous.completedAt;
      if (gap >= 0) totalToolDurationMs += gap;
    }
  }

  let ttftTotal = 0;
  let ttftCount = 0;
  for (const window of timed) {
    if (window.firstTokenAt === null) continue;
    ttftTotal += window.firstTokenAt - window.startedAt;
    ttftCount += 1;
  }

  const finalStep = steps.length > 0 ? steps[steps.length - 1] : null;
  const finalWindow = windows.length > 0 ? windows[windows.length - 1] : null;
  const finalOutput = finalStep ? nonnegative(finalStep.usage?.output) : null;
  const finalStepIsText = finalStep !== null && !finalStep.parts.some((part) => part.type === 'tool_call');
  const responseTokensPerSecond = finalStepIsText && finalWindow !== null
    && finalWindow.firstTokenAt !== null && finalWindow.completedAt !== null
    ? rateFrom(finalOutput, finalWindow.completedAt - finalWindow.firstTokenAt)
    : null;

  return {
    totalLlmDurationMs,
    totalToolDurationMs,
    avgTtftMs: ttftCount > 0 ? ttftTotal / ttftCount : null,
    tokensPerSecond: rateFrom(totalGeneratedTokens, totalLlmDurationMs),
    responseTokensPerSecond,
  };
};

/** Timing-derived metrics come from `Message.timing` (task 23); a metric without a source stays null. */
export function getLatestCompletedTurnStats(
  messages: readonly Message[] | null | undefined,
  turns?: readonly Turn[] | null,
): CompletedTurnStats | null {
  const completedTurns = turns ? turns.filter((turn) => turn.status === 'completed') : [];
  const latestTurn = completedTurns.length > 0 ? completedTurns[completedTurns.length - 1] : null;

  if (latestTurn) {
    // One run is several turns, one per model step. The step timings only add
    // up to a turn's model time and the tool time between steps when the whole
    // run is read together, so the stats cover every turn of the latest run.
    const runTurns = latestTurn.runId
      ? (turns ?? []).filter((turn) => turn.runId === latestTurn.runId)
      : [latestTurn];
    const firstTurn = runTurns[0] ?? latestTurn;
    const lastTurn = runTurns[runTurns.length - 1] ?? latestTurn;
    const start = firstTurn.startedAt;
    const end = lastTurn.finishedAt;
    const elapsedDurationMs = Number.isFinite(start) && Number.isFinite(end) && end !== undefined && end >= start ? end - start : null;

    const assistantIds = new Set(runTurns.flatMap((turn) => turn.assistantMessageIds));
    const turnIds = new Set(runTurns.map((turn) => turn.turnId));
    let assistants = messages
      ? messages.filter((message) => message.role === 'assistant' && (assistantIds.has(message.messageId) || (message.turnId !== undefined && turnIds.has(message.turnId))))
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
      stepsCount: Math.max(assistants.length, assistantIds.size),
      elapsedDurationMs,
      ...deriveTimingMetrics(assistants, totalGeneratedTokens),
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
    ...deriveTimingMetrics(assistants, totalGeneratedTokens),
    inputTokens,
    outputTokens,
    totalGeneratedTokens,
    cacheHitPercent: cacheHit?.hasInput ? Math.round(cacheHit.percent) : null,
    cost,
  };
}
