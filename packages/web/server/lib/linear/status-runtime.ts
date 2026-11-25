import { safeParseCanonicalEvent } from '../event-stream/validated-event.js';
import { postLinearSessionStatus } from './status.js';
import type { TrackerRuntimeEvent, TrackerSessionStatusRuntime } from '../trackers/tracker-contract.js';

export function createLinearSessionStatusRuntime() {
  let stopped = false;

  const processCanonicalEvent = (payload) => {
    if (stopped) return;
    const parsed = safeParseCanonicalEvent(payload);
    if (!parsed.success) return;
    const event = parsed.data;
    if (event.type === 'session.status') {
      if (event.runtimeStatus !== 'idle') return;
      void postLinearSessionStatus({ kind: 'completed', sessionId: event.sessionId }).catch((error) => {
        console.warn('[linear] failed to post session completed comment:', error?.message || error);
      });
      return;
    }
    if (event.type === 'run.failed') {
      void postLinearSessionStatus({ kind: 'failure', sessionId: event.sessionId }).catch((error) => {
        console.warn('[linear] failed to post session failure comment:', error?.message || error);
      });
    }
  };

  const stop = () => {
    stopped = true;
  };

  return { processCanonicalEvent, stop };
}
