/**
 * How long each session's last run took, kept on the session itself.
 *
 * The sidebar shows the length of a finished turn while the session is unread.
 * A page can only measure a turn while it is open, and the unread mark outlives
 * the page, so the Host measures every run from the canonical event stream it
 * always holds and writes the result into the session's metadata:
 * `openchamber.turn = { endedAt, durationMs }` beside
 * `openchamber.workbench = { lastIdleAt, lastTurnOutcome }`.
 *
 * Starts live in memory. A run is matched to its own start by `runId`, so a
 * start whose end was missed (a restart or a dropped stream) can never be
 * paired with the next run's end; forgetting starts on any subscribe or
 * reconnect would need the same bookkeeping and would not improve on it.
 */
import { safeParseCanonicalEvent } from '../event-stream/validated-event.js';

const TERMINAL_OUTCOMES = { 'run.completed': 'completed', 'run.failed': 'failed', 'run.cancelled': 'cancelled' };
const DEFAULT_LIMIT = 5000;

/**
 * @param {object} deps
 * @param {(sessionID: string, patch: object, options: { directory: string }) => Promise<unknown>} deps.persistSessionMetadataPatch
 * @param {(sessionID: string) => boolean | undefined} deps.isChildSession true for a known subsession
 * @param {number} [deps.limit] bound on remembered starts
 */
export const createTurnDurationRecorder = ({ persistSessionMetadataPatch, isChildSession, limit = DEFAULT_LIMIT }) => {
 /** sessionID → the running outer run's id and the time it started. */
 const running = new Map();

 const remember = (sessionID, run) => {
  running.delete(sessionID);
  running.set(sessionID, run);
  while (running.size > limit) running.delete(running.keys().next().value);
 };

 const record = (sessionID, start, finishedAt, outcome, directory) => {
  // A subsession's runs belong to its parent, which is what the sidebar shows.
  if (isChildSession(sessionID) === true) return;
  const patch = {
   openchamber: {
    workbench: { lastIdleAt: finishedAt, lastTurnOutcome: outcome },
    turn: { endedAt: finishedAt, durationMs: Math.max(0, finishedAt - start) },
   },
  };
  void Promise.resolve(persistSessionMetadataPatch(sessionID, patch, { directory }))
   .catch((error) => console.warn('[turn-duration] could not record a turn length:', error?.message ?? error));
 };

 /** Takes the Hub's validated canonical events, with the session's Host scope. */
 const processCanonicalEvent = (payload, scope) => {
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
  const outcome = TERMINAL_OUTCOMES[event.type];
  if (!outcome) return;
  const start = running.get(event.sessionId);
  running.delete(event.sessionId);
  // Only a run this recorder watched start can be measured.
  if (!start || start.runId !== event.runId) return;
  record(event.sessionId, start.startedAt, event.finishedAt, outcome, scope?.cwd ?? '');
 };

 return { processCanonicalEvent };
};
