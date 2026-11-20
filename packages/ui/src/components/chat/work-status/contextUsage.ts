
import { findLatestContextFill, type ContextFillMessage } from '@/stores/utils/tokenUtils';

type WorkStatusContextUsage =
  | {
    state: 'measured';
    totalTokens: number;
    limit: number;
    percent: number;
  }
  | { state: 'compacted'; limit: number };

export const DEFAULT_CONTEXT_LIMIT = 200_000;

export const computeContextUsage = (
  messages: readonly ContextFillMessage[],
  contextLimit: number,
): WorkStatusContextUsage | null => {
  const fill = findLatestContextFill(messages);
  if (!fill) return null;

  const limit = contextLimit > 0 ? contextLimit : DEFAULT_CONTEXT_LIMIT;

  return { state: 'measured', totalTokens: fill.totalTokens, limit, percent: (fill.totalTokens / limit) * 100 };
};
