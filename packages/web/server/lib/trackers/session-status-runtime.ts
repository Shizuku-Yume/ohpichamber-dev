import { safeParseCanonicalEvent } from '../event-stream/validated-event.js';
import type { TrackerRuntimeEvent, TrackerSessionStatusInput, TrackerSessionStatusResult } from './tracker-contract.js';

type SessionStatusOptions = {
  post: (input: Pick<TrackerSessionStatusInput, 'sessionId'> & { kind: 'completed' | 'failure' }) => Promise<TrackerSessionStatusResult>;
  label: string;
  warn?: (...args: unknown[]) => void;
};

export function createSessionStatusRuntime({ post, label, warn = (...args) => console.warn(...args) }: SessionStatusOptions) {
  let stopped = false;
  const send = (kind: 'completed' | 'failure', sessionId: string) => {
    void post({ kind, sessionId }).catch((error) => {
      warn(`[trackers] ${label}: failed to post the session ${kind} comment:`, error?.message || error);
    });
  };
  return {
    processPayload: (payload: TrackerRuntimeEvent) => {
      if (stopped) return;
      const parsed = safeParseCanonicalEvent(payload);
      if (!parsed.success) return;
      const event = parsed.data;
      if (event.type === 'run.failed') {
        send('failure', event.sessionId);
        return;
      }
      if (event.type === 'session.status' && event.runtimeStatus === 'idle') send('completed', event.sessionId);
    },
    stop: () => { stopped = true; },
  };
}
