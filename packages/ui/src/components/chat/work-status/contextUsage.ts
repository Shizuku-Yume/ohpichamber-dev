/**
 * Context-window usage for a specific session.
 *
 * The header's readout cannot serve this panel. It reads the current
 * session's messages with **no directory**, which resolves to the *current*
 * directory's child store. A session held by another directory — a worktree,
 * or any moment right after a directory switch — therefore reads as "no
 * messages" and the readout silently disappears while the header still shows
 * a value.
 *
 * This computes the same quantity from messages the caller has already
 * subscribed to for a known session and directory, so there is no hidden
 * global read to race with.
 */

import { computeCacheHitRate, findLatestContextFill, type ContextFillMessage } from '@/stores/utils/tokenUtils';

type WorkStatusContextUsage =
  | {
    state: 'measured';
    totalTokens: number;
    /** Context limit actually used for the ratio, after the default fallback. */
    limit: number;
    /** Unrounded, so the panel and the header cannot disagree by a rounding step. */
    percent: number;
  }
  /** Compacted since the last response that reported tokens: the fill is unknown, not zero. */
  | { state: 'compacted'; limit: number };

/** The store's own fallback when a model exposes no context limit. */
export const DEFAULT_CONTEXT_LIMIT = 200_000;

/** Usage from the newest canonical assistant message with reported usage. */
export const computeContextUsage = (
  messages: readonly ContextFillMessage[],
  contextLimit: number,
): WorkStatusContextUsage | null => {
  const fill = findLatestContextFill(messages);
  if (!fill) return null;

  const limit = contextLimit > 0 ? contextLimit : DEFAULT_CONTEXT_LIMIT;

  return { state: 'measured', totalTokens: fill.totalTokens, limit, percent: (fill.totalTokens / limit) * 100 };
};

type LastReplyTokens = {
  output: number;
  /** Share of the prompt served from cache; null when the reply reported no prompt tokens. */
  cacheHitPercent: number | null;
};

/**
 * The figures of the reply the context reading comes from, for the phone's
 * session rows. Never a sum over messages: a long session holds only its tail,
 * so a sum falls as the chat grows, and every reply re-reads the whole context.
 */
export const computeLastReplyTokens = (messages: readonly ContextFillMessage[]): LastReplyTokens | null => {
  const fill = findLatestContextFill(messages);
  const usage = fill ? messages[fill.index]?.usage : undefined;
  if (!usage) return null;
  const hitRate = computeCacheHitRate(usage);
  return { output: usage.output ?? 0, cacheHitPercent: hitRate.hasInput ? hitRate.percent : null };
};
