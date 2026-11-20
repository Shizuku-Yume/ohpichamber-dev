/**
 * Session assist lifecycle runtime.
 *
 * Next-prompt suggestions have moved to the OMP worker driver at completed
 * `agent_end`, and recaps are owned by OMP's `enableIdleMaintenance`. The Host
 * suggestion runtime, timers, metadata persistence and Jev gates are deleted.
 * This runtime observes canonical events to notify when a turn settles.
 */

export const createSessionAssistRuntime = ({
  sessionService,
  resolveSessionScope,
  lineage = null,
  onTurnSettled = null,
} = {}) => {
  if (!sessionService || typeof sessionService.open !== 'function' || typeof sessionService.history !== 'function') {
    throw new Error('session-assist requires the canonical session service');
  }
  if (typeof resolveSessionScope !== 'function') throw new Error('session-assist requires a session scope resolver');

  const settled = new Set();
  let stopped = false;

  const processCanonicalEvent = (event, scope) => {
    if (stopped || !event) return;
    if (event.type === 'session.deleted') {
      for (const id of event.deletedSessionIds ?? []) {
        settled.delete(id);
      }
      return;
    }
    const sessionId = typeof event?.sessionId === 'string' ? event.sessionId : '';
    if (!sessionId || (scope?.sessionId && scope.sessionId !== sessionId)) return;
    if (lineage?.isChild?.(sessionId) === true) return;

    if (event.type === 'run.started' || event.type === 'turn.started') {
      settled.delete(sessionId);
      return;
    }

    if (event.type === 'message.created' && event.role === 'user') {
      settled.delete(sessionId);
      return;
    }

    const isTurnCompleted = event.type === 'run.completed' || (event.type === 'session.status' && event.runtimeStatus === 'idle');
    if (isTurnCompleted) {
      if (!settled.has(sessionId)) {
        settled.add(sessionId);
        onTurnSettled?.(sessionId);
      }
      return;
    }

    if (event.type === 'run.failed' || event.type === 'run.cancelled' || (event.type === 'session.status' && event.runtimeStatus === 'unavailable')) {
      if (!settled.has(sessionId)) {
        settled.add(sessionId);
        onTurnSettled?.(sessionId);
      }
    }
  };

  const stop = () => {
    stopped = true;
    settled.clear();
  };

  return { processCanonicalEvent, stop };
};
