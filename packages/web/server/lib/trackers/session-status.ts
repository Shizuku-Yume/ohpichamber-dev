import type { TrackerRegistry, TrackerRuntimeEvent, TrackerSessionStatusRuntime } from './tracker-contract.js';

interface TrackerState {
  pending: TrackerRuntimeEvent[];
  runtime?: TrackerSessionStatusRuntime;
  failedAt?: number;
  loading: boolean;
}

export function createTrackerSessionStatus({ registry, now = Date.now, retryAfterMs = 30_000, maxPending = 200, warn = (...args) => console.warn(...args) }: {
  registry: Pick<TrackerRegistry, 'list' | 'descriptor' | 'implementation'>;
  now?: () => number; retryAfterMs?: number; maxPending?: number; warn?: (...args: unknown[]) => void;
}) {
  const states = new Map<string, TrackerState>();
  let stopped = false;
  const load = (id: string, pending: TrackerRuntimeEvent[] = []) => {
    const state: TrackerState = { pending, loading: true };
    states.set(id, state);
    void registry.implementation(id).then((tracker) => {
      if (stopped || states.get(id) !== state) return;
      const createRuntime = tracker?.sessionStatus?.createRuntime;
      const runtime = createRuntime?.();
      state.loading = false;
      if (!runtime) { state.pending = []; return; }
      state.runtime = runtime;
      for (const event of state.pending.splice(0)) runtime.processPayload(event);
    }).catch((error) => {
      if (stopped || states.get(id) !== state) return;
      state.runtime?.stop();
      delete state.runtime;
      state.loading = false;
      state.failedAt = now();
      warn(`[trackers] ${id}: session status runtime did not start`, error);
    });
    return state;
  };
  const forget = (id: string) => {
    states.get(id)?.runtime?.stop();
    states.delete(id);
  };
  return {
    processPayload(payload: TrackerRuntimeEvent) {
      if (stopped || (payload.type !== 'session.status' && payload.type !== 'run.failed')) return;
      for (const id of registry.list()) {
        if (!registry.descriptor(id)?.capabilities.sessionComments) continue;
        let state = states.get(id);
        if (!state || (state.failedAt !== undefined && now() - state.failedAt >= retryAfterMs)) state = load(id, state?.pending);
        if (state.runtime) {
          try { state.runtime.processPayload(payload); }
          catch (error) { warn(`[trackers] ${id}: session event failed`, error); }
        } else if (state.loading || state.failedAt !== undefined) {
          state.pending.push(payload);
          if (state.pending.length > maxPending) state.pending.shift();
        }
      }
    },
    forget,
    stop() {
      stopped = true;
      for (const id of states.keys()) forget(id);
    },
  };
}
