import type { Message, Turn } from '@openchamber/agent-contract';
import { computeCacheHitRate } from '@/stores/utils/tokenUtils';

<<<<<<< HEAD
||||||| bc50ba56aa
type SessionMessageRecord = {
  info: Message;
  parts: Part[];
};

type CompletedStepStats = {
  toolDurationMs: number | null;
  adjustedLlmDurationMs: number | null;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  cost: number | null;
};

=======
type SessionMessageRecord = {
  info: Message;
  parts: Part[];
};

type CompletedStepStats = {
  toolDurationMs: number | null;
  adjustedLlmDurationMs: number | null;
  ttftMs: number | null;
  firstOutputMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  cost: number | null;
};

>>>>>>> upstream/main
export type CompletedTurnStats = {
  lastAssistantMessageId: string;
<<<<<<< HEAD
||||||| bc50ba56aa
  /** A newer prompt has already started the next turn; these numbers are from the turn before it. */
  previousTurn: boolean;
=======
  previousTurn: boolean;
>>>>>>> upstream/main
  stepsCount: number;
  elapsedDurationMs: number | null;
  totalLlmDurationMs: number | null;
  totalToolDurationMs: number | null;
  avgTtftMs: number | null;
  avgFirstOutputMs: number | null;
  tokensPerSecond: number | null;
  responseTokensPerSecond: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalGeneratedTokens: number | null;
  cacheHitPercent: number | null;
  cost: number | null;
};

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * Merge an array of [start, end] time intervals into a disjoint union of intervals.
 * Correctly accounts for parallel / overlapping tool executions without double-counting.
 */
export function mergeTimeIntervals(intervals: readonly (readonly [number, number])[]): Array<[number, number]> {
  if (intervals.length === 0) return [];

  const valid: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      valid.push([start, end]);
    }
  }

  valid.sort((a, b) => a[0] - b[0]);
  if (valid.length === 0) return [];

  const merged: Array<[number, number]> = [valid[0]];

  for (let i = 1; i < valid.length; i += 1) {
    const current = valid[i];
    const last = merged[merged.length - 1];

    if (current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Sum the total duration spanned by an array of disjoint intervals.
 */
export function sumIntervalsDuration(intervals: readonly (readonly [number, number])[]): number {
  return intervals.reduce((sum, [start, end]) => sum + (end - start), 0);
}

=======
export function mergeTimeIntervals(intervals: readonly (readonly [number, number])[]): Array<[number, number]> {
  if (intervals.length === 0) return [];

  const valid: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      valid.push([start, end]);
    }
  }

  valid.sort((a, b) => a[0] - b[0]);
  if (valid.length === 0) return [];

  const merged: Array<[number, number]> = [valid[0]];

  for (let i = 1; i < valid.length; i += 1) {
    const current = valid[i];
    const last = merged[merged.length - 1];

    if (current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

export function sumIntervalsDuration(intervals: readonly (readonly [number, number])[]): number {
  return intervals.reduce((sum, [start, end]) => sum + (end - start), 0);
}

>>>>>>> upstream/main
export const formatTelemetryDuration = (ms: number): string => {
<<<<<<< HEAD
  if (!Number.isFinite(ms) || ms <= 0) return '0.0s';
  if (ms < 50) return '<0.1s';
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
||||||| bc50ba56aa
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0.0s';
  }
  // 1–49ms rounds to 0.0s at one decimal. That is a real wait, not zero.
  if (ms < 50) {
    return '<0.1s';
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
=======
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0.0s';
  }
  if (ms < 50) {
    return '<0.1s';
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
>>>>>>> upstream/main
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

<<<<<<< HEAD
type StepWindow = {
  startedAt: number;
  firstTokenAt: number | null;
  completedAt: number | null;
||||||| bc50ba56aa
/**
 * No provider streams anywhere near this fast; the quickest inference
 * services top out around 3,000 tok/s. A rate above it means the measured
 * window is broken, not that the model was quick.
 */
const MAX_PLAUSIBLE_TOKENS_PER_SECOND = 5_000;

/**
 * Tokens per second over a measured window, or null when the window cannot
 * have produced them.
 *
 * The turn window is "step duration minus tool time". A step whose tool ran
 * for nearly the whole step leaves a residual of a millisecond or two; real
 * data shows such steps (a 560 ms step with a 559 ms tool). Divide a few
 * hundred tokens by that and the panel reads ~392,250 tok/s (#3500).
 * Showing nothing is more honest than showing that.
 */
const tokenRate = (tokens: number, durationMs: number): number | null => {
  if (durationMs <= 0) return null;
  const rate = nonnegative(tokens / (durationMs / 1000));
  return rate !== null && rate <= MAX_PLAUSIBLE_TOKENS_PER_SECOND ? rate : null;
=======
const MAX_PLAUSIBLE_TOKENS_PER_SECOND = 5_000;

const tokenRate = (tokens: number, durationMs: number): number | null => {
  if (durationMs <= 0) return null;
  const rate = nonnegative(tokens / (durationMs / 1000));
  return rate !== null && rate <= MAX_PLAUSIBLE_TOKENS_PER_SECOND ? rate : null;
>>>>>>> upstream/main
};

<<<<<<< HEAD
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
||||||| bc50ba56aa
/** Text delivery rate for the final reply, not throughput of the agent loop. */
function calculateResponseTokenRate(record: SessionMessageRecord): number | null {
  const { info, parts } = record;
  if (info.role !== 'assistant' || info.error || parts.some((part) => part.type === 'tool')) return null;
  const output = nonnegative(info.tokens?.output);
  const { created, completed } = info.time;
  if (output === null || completed === undefined || nonnegative(created) === null || nonnegative(completed) === null) return null;
=======
function calculateResponseTokenRate(record: SessionMessageRecord): number | null {
  const { info, parts } = record;
  if (info.role !== 'assistant' || info.error || parts.some((part) => part.type === 'tool')) return null;
  const output = nonnegative(info.tokens?.output);
  const { created, completed } = info.time;
  if (output === null || completed === undefined || nonnegative(created) === null || nonnegative(completed) === null) return null;
>>>>>>> upstream/main

<<<<<<< HEAD
const rateFrom = (tokens: number | null, durationMs: number | null): number | null => {
  if (tokens === null || durationMs === null || durationMs <= 0) return null;
  const rate = tokens / (durationMs / 1000);
  return Number.isFinite(rate) && rate <= MAX_PLAUSIBLE_TOKENS_PER_SECOND ? rate : null;
};
||||||| bc50ba56aa
  // Stored text carries no timing; a reload stamps it with the step's own
  // `created` and `completed`. A start at `created` is that stamp, not a
  // measured first token. Dividing by it counted the initial wait and
  // reasoning, so the same turn read ~94 tok/s live and ~55 after a reload
  // (#5465). Unknown hides the row, as for TTFT.
  const intervals: Array<[number, number]> = [];
  for (const part of parts) {
    if (part.type !== 'text') continue;
    if (!part.text) continue;
    const start = part.time?.start;
    const end = part.time?.end;
    if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end)
      || start <= created || end > completed || end <= start) return null;
    intervals.push([start, end]);
  }
  return tokenRate(output, sumIntervalsDuration(mergeTimeIntervals(intervals)));
}
=======
  // external: #5465 Reloaded OpenCode text uses step creation stamps, so response speed requires observed text timing.
  const intervals: Array<[number, number]> = [];
  for (const part of parts) {
    if (part.type !== 'text') continue;
    if (!part.text) continue;
    const start = part.time?.start;
    const end = part.time?.end;
    if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end)
      || start <= created || end > completed || end <= start) return null;
    intervals.push([start, end]);
  }
  return tokenRate(output, sumIntervalsDuration(mergeTimeIntervals(intervals)));
}
>>>>>>> upstream/main

<<<<<<< HEAD
type TimingMetrics = Pick<
  CompletedTurnStats,
  'totalLlmDurationMs' | 'totalToolDurationMs' | 'avgTtftMs' | 'tokensPerSecond' | 'responseTokensPerSecond'
>;
||||||| bc50ba56aa
/**
 * Calculate stats for a single completed assistant step.
 */
function calculateCompletedStepStats(record: SessionMessageRecord): CompletedStepStats | null {
  const { info, parts } = record;
  if (info.role !== 'assistant') return null;
=======
function calculateCompletedStepStats(record: SessionMessageRecord): CompletedStepStats | null {
  const { info, parts } = record;
  if (info.role !== 'assistant') return null;
>>>>>>> upstream/main

const deriveTimingMetrics = (steps: readonly Message[], totalGeneratedTokens: number | null): TimingMetrics => {
  const windows = steps.map(stepWindow);
  const timed = windows.filter((window): window is StepWindow => window !== null);

<<<<<<< HEAD
  let totalLlmDurationMs: number | null = null;
  for (const window of timed) {
    if (window.completedAt === null) continue;
    totalLlmDurationMs = (totalLlmDurationMs ?? 0) + (window.completedAt - window.startedAt);
||||||| bc50ba56aa
  if (completed === undefined) return null;

  const validWindow = nonnegative(created) !== null && nonnegative(completed) !== null && completed >= created;
  const totalDurationMs = validWindow ? nonnegative(completed - created) : null;

  // An unfinished or invalid tool makes duration-dependent metrics unknown.
  const rawToolIntervals: Array<[number, number]> = [];
  let validTools = validWindow;
  for (const part of parts) {
    if (part.type !== 'tool') continue;
    if (part.state.status !== 'completed' && part.state.status !== 'error') {
      validTools = false;
      continue;
    }
    const start = part.state.time?.start;
    const end = part.state.time?.end;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < created || end > completed || end < start) {
      validTools = false;
      continue;
    }
    rawToolIntervals.push([start, end]);
=======
  if (completed === undefined) return null;

  const validWindow = nonnegative(created) !== null && nonnegative(completed) !== null && completed >= created;
  const totalDurationMs = validWindow ? nonnegative(completed - created) : null;

  const rawToolIntervals: Array<[number, number]> = [];
  let validTools = validWindow;
  for (const part of parts) {
    if (part.type !== 'tool') continue;
    if (part.state.status !== 'completed' && part.state.status !== 'error') {
      validTools = false;
      continue;
    }
    const start = part.state.time?.start;
    const end = part.state.time?.end;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < created || end > completed || end < start) {
      validTools = false;
      continue;
    }
    rawToolIntervals.push([start, end]);
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
  // Wait until the first text or reasoning part that starts after the step
  // was created. A start equal to `created` is the creation stamp copied onto
  // the part, not a measured first token. Counting it made tool-heavy turns
  // show Average TTFT 0.0s. Leaving it unset hides the row, same as a missing
  // timestamp.
  let ttftMs: number | null = null;
  for (const part of parts) {
    if (part.type === 'text' || part.type === 'reasoning') {
      const partStart = part.time?.start;
      if (validWindow && partStart !== undefined && Number.isFinite(partStart) && partStart > created && partStart <= completed) {
        const delta = partStart - created;
        ttftMs = ttftMs === null ? delta : Math.min(ttftMs, delta);
      }
    }
  }

  const inputTokens = nonnegative(info.tokens?.input);
  const outputTokens = nonnegative(info.tokens?.output);
  const reasoningTokens = nonnegative(info.tokens?.reasoning);
  const cacheReadTokens = nonnegative(info.tokens?.cache?.read);
  const cacheWriteTokens = nonnegative(info.tokens?.cache?.write);
  const cost = nonnegative(info.cost);

=======
  let ttftMs: number | null = null;
  for (const part of parts) {
    if (part.type === 'text' || part.type === 'reasoning') {
      const partStart = part.time?.start;
      if (validWindow && partStart !== undefined && Number.isFinite(partStart) && partStart > created && partStart <= completed) {
        const delta = partStart - created;
        ttftMs = ttftMs === null ? delta : Math.min(ttftMs, delta);
      }
    }
  }

  const firstToken = info.time.firstToken;
  const firstOutputMs = validWindow && firstToken !== undefined && Number.isFinite(firstToken)
    && firstToken >= created && firstToken <= completed
    ? firstToken - created
    : null;

  const inputTokens = nonnegative(info.tokens?.input);
  const outputTokens = nonnegative(info.tokens?.output);
  const reasoningTokens = nonnegative(info.tokens?.reasoning);
  const cacheReadTokens = nonnegative(info.tokens?.cache?.read);
  const cacheWriteTokens = nonnegative(info.tokens?.cache?.write);
  const cost = nonnegative(info.cost);

>>>>>>> upstream/main
  return {
<<<<<<< HEAD
    totalLlmDurationMs,
    totalToolDurationMs,
    avgTtftMs: ttftCount > 0 ? ttftTotal / ttftCount : null,
    tokensPerSecond: rateFrom(totalGeneratedTokens, totalLlmDurationMs),
    responseTokensPerSecond,
||||||| bc50ba56aa
    toolDurationMs,
    adjustedLlmDurationMs,
    ttftMs,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cost,
=======
    toolDurationMs,
    adjustedLlmDurationMs,
    ttftMs,
    firstOutputMs,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cost,
>>>>>>> upstream/main
  };
};

<<<<<<< HEAD
/** Timing-derived metrics come from `Message.timing` (task 23); a metric without a source stays null. */
||||||| bc50ba56aa
/**
 * Calculates telemetry metrics for the latest completed turn in the session.
 * A turn encompasses all assistant steps since the preceding user message up to the final completed assistant step.
 */
=======
>>>>>>> upstream/main
export function getLatestCompletedTurnStats(
  messages: readonly Message[] | null | undefined,
  turns?: readonly Turn[] | null,
): CompletedTurnStats | null {
  const completedTurns = turns ? turns.filter((turn) => turn.status === 'completed') : [];
  const latestTurn = completedTurns.length > 0 ? completedTurns[completedTurns.length - 1] : null;

<<<<<<< HEAD
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
||||||| bc50ba56aa
  // v2 plumbing roles can trail the final assistant step, so the turn ends at
  // the newest conversation record rather than the newest record.
  const newestIdx = lastConversationIndex(records, records.length);
  if (newestIdx < 0) return null;
  // A prompt that has no reply yet lands before the session reports busy. The
  // turn before it is the latest finished one, and is flagged as such.
  if (records[newestIdx].info.role === 'user') {
    const previousIdx = lastConversationIndex(records, newestIdx);
    return previousIdx < 0 ? null : calculateTurnStats(records, previousIdx, true);
=======
  const newestIdx = lastConversationIndex(records, records.length);
  if (newestIdx < 0) return null;
  if (records[newestIdx].info.role === 'user') {
    const previousIdx = lastConversationIndex(records, newestIdx);
    return previousIdx < 0 ? null : calculateTurnStats(records, previousIdx, true);
>>>>>>> upstream/main
  }

<<<<<<< HEAD
  if (!messages || messages.length === 0) return null;
  let lastAssistantIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      lastAssistantIndex = index;
||||||| bc50ba56aa
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
=======
export function getPreviousCompletedTurnStats(records: readonly SessionMessageRecord[]): CompletedTurnStats | null {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (records[i].info.role !== 'user') continue;
    const previousIdx = lastConversationIndex(records, i);
    return previousIdx < 0 ? null : calculateTurnStats(records, previousIdx, true);
  }
  return null;
}

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
>>>>>>> upstream/main
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

<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
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
  let totalFirstOutput: number | null = 0;

  for (const step of stepStatsList) {
    totalFirstOutput = add(totalFirstOutput, step.firstOutputMs);
    totalLlmDurationMs = add(totalLlmDurationMs, step.adjustedLlmDurationMs);
    totalToolDurationMs = add(totalToolDurationMs, step.toolDurationMs);
    totalInputTokens = add(totalInputTokens, step.inputTokens);
    totalOutputTokens = add(totalOutputTokens, step.outputTokens);
    totalReasoningTokens = add(totalReasoningTokens, step.reasoningTokens);
    totalCacheReadTokens = add(totalCacheReadTokens, step.cacheReadTokens);
    totalCacheWriteTokens = add(totalCacheWriteTokens, step.cacheWriteTokens);
    totalCost = add(totalCost, step.cost);
    totalTtft = add(totalTtft, step.ttftMs);
>>>>>>> upstream/main
  }

<<<<<<< HEAD
  const start = messages[turnStartIndex].createdAt;
  const end = messages[lastAssistantIndex].createdAt;
  const elapsedDurationMs = Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
  const totalGeneratedTokens = outputTokens;
  const cacheHit = inputTokens !== null && cacheReadTokens !== null && cacheWriteTokens !== null
    ? computeCacheHitRate({ input: inputTokens, cache: { read: cacheReadTokens, write: cacheWriteTokens } })
||||||| bc50ba56aa
  const avgTtftMs = totalTtft === null ? null : totalTtft / stepStatsList.length;

  const totalGeneratedTokens = add(totalOutputTokens, totalReasoningTokens);
  const tokensPerSecond = totalGeneratedTokens !== null && totalLlmDurationMs !== null
    ? tokenRate(totalGeneratedTokens, totalLlmDurationMs)
=======
  const avgTtftMs = totalTtft === null ? null : totalTtft / stepStatsList.length;
  const avgFirstOutputMs = totalFirstOutput === null ? null : totalFirstOutput / stepStatsList.length;

  const totalGeneratedTokens = add(totalOutputTokens, totalReasoningTokens);
  const tokensPerSecond = totalGeneratedTokens !== null && totalLlmDurationMs !== null
    ? tokenRate(totalGeneratedTokens, totalLlmDurationMs)
>>>>>>> upstream/main
    : null;

  return {
    lastAssistantMessageId: messages[lastAssistantIndex].messageId,
    stepsCount: assistants.length,
    elapsedDurationMs,
<<<<<<< HEAD
    ...deriveTimingMetrics(assistants, totalGeneratedTokens),
    inputTokens,
    outputTokens,
||||||| bc50ba56aa
    totalLlmDurationMs,
    totalToolDurationMs,
    avgTtftMs,
    tokensPerSecond,
    responseTokensPerSecond: calculateResponseTokenRate(records[lastCompletedAssistantIdx]),
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    reasoningTokens: totalReasoningTokens,
=======
    totalLlmDurationMs,
    totalToolDurationMs,
    avgTtftMs,
    avgFirstOutputMs,
    tokensPerSecond,
    responseTokensPerSecond: calculateResponseTokenRate(records[lastCompletedAssistantIdx]),
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    reasoningTokens: totalReasoningTokens,
>>>>>>> upstream/main
    totalGeneratedTokens,
    cacheHitPercent: cacheHit?.hasInput ? Math.round(cacheHit.percent) : null,
    cost,
  };
}
