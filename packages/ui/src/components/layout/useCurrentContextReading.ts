import { DEFAULT_CONTEXT_LIMIT } from '@/components/chat/work-status/contextUsage';
import { useContextWindowLimits } from '@/hooks/useContextWindowLimits';
<<<<<<< HEAD
import type { Message } from '@openchamber/agent-contract';
=======
import type { Message } from '@/lib/opencode/model';
>>>>>>> bc50ba56a
import { findLatestContextFill } from '@/stores/utils/tokenUtils';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionMessagesSelector } from '@/sync/sync-context';

type ContextFillReading = { state: 'measured'; totalTokens: number } | { state: 'compacted' } | null;

<<<<<<< HEAD
const selectContextFill = (messages: readonly Message[]): ContextFillReading => {
 const fill = findLatestContextFill(messages);
 if (!fill) return null;
 return fill.state === 'measured' ? { state: 'measured', totalTokens: fill.totalTokens } : { state: 'compacted' };
};

const isSameContextFill = (a: ContextFillReading, b: ContextFillReading): boolean => {
 if (a === null || b === null) return a === b;
 if (a.state !== b.state) return false;
 return a.state === 'compacted' || (b.state === 'measured' && a.totalTokens === b.totalTokens);
=======
const selectContextFill = (messages: Message[]): ContextFillReading => {
  const fill = findLatestContextFill(messages);
  if (!fill) return null;
  return fill.state === 'measured' ? { state: 'measured', totalTokens: fill.totalTokens } : { state: 'compacted' };
};

const isSameContextFill = (a: ContextFillReading, b: ContextFillReading): boolean => {
  if (a === null || b === null) return a === b;
  if (a.state !== b.state) return false;
  return a.state === 'compacted' || (b.state === 'measured' && a.totalTokens === b.totalTokens);
>>>>>>> bc50ba56a
};

/**
 * The current session's context fill. A streamed step replaces the message
 * list many times while the fill stays the same, so callers re-render only
 * when a response reports a new token count or a compaction finishes.
 */
export const useCurrentContextReading = () => {
<<<<<<< HEAD
 const sessionId = useSessionUIStore((state) => state.currentSessionId);
 const directory = useSessionUIStore((state) => state.currentSessionDirectory) ?? undefined;
 const fill = useSessionMessagesSelector(sessionId ?? '', directory, selectContextFill, isSameContextFill);
 const { context } = useContextWindowLimits(sessionId, directory);
 const limit = context > 0 ? context : DEFAULT_CONTEXT_LIMIT;
 return { sessionId, fill, limit };
=======
  const sessionId = useSessionUIStore((state) => state.currentSessionId);
  const directory = useSessionUIStore((state) => state.currentSessionDirectory) ?? undefined;
  const fill = useSessionMessagesSelector(sessionId ?? '', directory, selectContextFill, isSameContextFill);
  const { context } = useContextWindowLimits(sessionId, directory);
  const limit = context > 0 ? context : DEFAULT_CONTEXT_LIMIT;
  return { sessionId, fill, limit };
>>>>>>> bc50ba56a
};
