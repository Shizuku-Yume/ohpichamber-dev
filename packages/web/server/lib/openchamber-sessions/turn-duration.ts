import type { JsonObject, JsonValue } from '../shared/json-values.js';
import { safeParseCanonicalEvent } from '../event-stream/validated-event.js';

const TERMINAL_OUTCOMES = {
  'run.completed': 'completed',
  'run.failed': 'failed',
  'run.cancelled': 'cancelled',
} as const;

const DEFAULT_LIMIT = 5000;

export interface TurnDurationRecorderDependencies {
  persistSessionMetadataPatch: (
    sessionID: string,
    patch: JsonObject,
    options: { directory: string },
  ) => Promise<JsonValue | object | void | undefined>;
  isChildSession: (sessionID: string) => boolean | undefined;
  limit?: number;
}

export interface TurnDurationScope {
  cwd?: string | undefined;
}

export const createTurnDurationRecorder = ({
  persistSessionMetadataPatch,
  isChildSession,
  limit = DEFAULT_LIMIT,
}: TurnDurationRecorderDependencies) => {
  const running = new Map<string, { runId: string; startedAt: number }>();

  const remember = (sessionID: string, run: { runId: string; startedAt: number }) => {
    running.delete(sessionID);
    running.set(sessionID, run);
    while (running.size > limit) {
      const oldest = running.keys().next().value;
      if (oldest === undefined) break;
      running.delete(oldest);
    }
  };

  const record = (
    sessionID: string,
    start: number,
    finishedAt: number,
    outcome: 'completed' | 'failed' | 'cancelled',
    directory: string,
  ) => {
    if (isChildSession(sessionID) === true) return;
    const patch: JsonObject = {
      openchamber: {
        workbench: { lastIdleAt: finishedAt, lastTurnOutcome: outcome },
        turn: { endedAt: finishedAt, durationMs: Math.max(0, finishedAt - start) },
      },
    };
    void Promise.resolve(persistSessionMetadataPatch(sessionID, patch, { directory }))
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn('[turn-duration] could not record a turn length:', detail);
      });
  };

  const processCanonicalEvent = (
    payload: Parameters<typeof safeParseCanonicalEvent>[0],
    scope?: TurnDurationScope | null,
  ) => {
    const parsed = safeParseCanonicalEvent(payload);
    if (!parsed.success) return;
    const event = parsed.data;
    if (event.type === 'session.deleted') {
      for (const sessionId of event.deletedSessionIds) running.delete(sessionId);
      return;
    }
    if (event.type === 'run.started') {
      remember(event.sessionId, { runId: event.runId, startedAt: event.createdAt });
      return;
    }
    if (event.type !== 'run.completed' && event.type !== 'run.failed' && event.type !== 'run.cancelled') return;
    const outcome = TERMINAL_OUTCOMES[event.type];
    const start = running.get(event.sessionId);
    running.delete(event.sessionId);
    if (!start || start.runId !== event.runId) return;
    record(event.sessionId, start.startedAt, event.finishedAt, outcome, scope?.cwd ?? '');
  };

  return { processCanonicalEvent };
};
