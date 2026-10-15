import React from 'react';
import { useSession, useSessionStatus } from '@/sync/sync-context';
import { getCurrentSessionAssist, type SessionAssistPayload } from '@/lib/sessionAssistMetadata';
import { useUIStore } from '@/stores/useUIStore';

// How long the chat must sit untouched before the recap becomes visible.
// The suggestion has no such delay — it shows as soon as it arrives.
const RECAP_VISIBILITY_DELAY_MS = 60 * 1000;

export interface SessionAssistState {
  /** Valid (fresh) assist payload, or null. */
  assist: SessionAssistPayload | null;
  /** Recap text, only when the 1-minute quiet window has elapsed. */
  visibleRecap: string | null;
  /** Suggestion text — fresh payload, session idle; caller still gates on input emptiness. */
  suggestion: string | null;
  /** False until the session record is in memory; the recap cannot be decided before that. */
  sessionKnown: boolean;
}

export function useSessionAssistState(sessionId: string, directory?: string): SessionAssistState {
  const session = useSession(sessionId, directory);
  const status = useSessionStatus(sessionId, directory);
  const sessionRecapEnabled = useUIStore((state) => state.sessionRecapEnabled);
  const sessionSuggestionEnabled = useUIStore((state) => state.sessionSuggestionEnabled);

  const isIdle = !status || status === 'idle';
  // Same freshness rule as the sidebar row's recap tooltip: the canonical
  // session update is authoritative, not the last loaded assistant answer.
  const assist = isIdle ? getCurrentSessionAssist(session) : null;

  // Recap waits out the quiet window after the session's latest update;
  // re-render once when the boundary passes.
  const idleAt = session?.updatedAt ?? 0;
  const [, forceTick] = React.useReducer((tick: number) => tick + 1, 0);
  const quietElapsed = assist ? Date.now() - idleAt >= RECAP_VISIBILITY_DELAY_MS : false;

  React.useEffect(() => {
    if (!assist || quietElapsed || !idleAt) return undefined;
    const remaining = RECAP_VISIBILITY_DELAY_MS - (Date.now() - idleAt);
    if (remaining <= 0) return undefined;
    const timer = setTimeout(forceTick, remaining + 250);
    return () => clearTimeout(timer);
  }, [assist, quietElapsed, idleAt]);

  return {
    assist,
    visibleRecap: sessionRecapEnabled && assist && assist.recap && quietElapsed ? assist.recap : null,
    suggestion: sessionSuggestionEnabled && assist && assist.suggestion ? assist.suggestion : null,
    sessionKnown: session !== undefined && session !== null,
  };
}
