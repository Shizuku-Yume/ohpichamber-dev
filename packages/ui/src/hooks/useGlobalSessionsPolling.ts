import React from 'react';
import { getAllSyncSessions } from '@/sync/sync-refs';
import {
  ensureGlobalSessionsLoaded,
  refreshGlobalSessions,
  useGlobalSessionsStore,
} from '@/stores/useGlobalSessionsStore';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { seedGlobalSessionStatusFromHost } from '@/sync/host-session-status-seed';
import { subscribeFirstServerConnect } from '@/sync/first-server-connect';
import { subscribeStreamGap } from '@/sync/stream-gap';
import { isDesktopShell } from '@/lib/desktop';

export const GLOBAL_SESSIONS_REFRESH_INTERVAL_MS = 45_000;
const GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS = 10 * 60_000;
const STARTUP_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

type ScheduleTimeout = (callback: () => void, delay: number) => number;
type ClearTimeout = (timeoutId: number) => void;

type PollingVisibility = {
  isHidden: () => boolean;
  onVisible: (listener: () => void) => () => void;
};

const NEVER_HIDDEN: PollingVisibility = { isHidden: () => false, onVisible: () => () => undefined };

type SubscribeServerReady = (listener: () => void) => () => void;

const NEVER_READY: SubscribeServerReady = () => () => undefined;

type SubscribeStreamGap = (listener: () => void) => () => void;

const NEVER_GAP: SubscribeStreamGap = () => () => undefined;

const desktopWindowVisibility = (): PollingVisibility => {
  let hidden = false;
  const listeners = new Set<() => void>();
  window.addEventListener('openchamber:window-visibility', (event) => {
    if (!(event instanceof CustomEvent) || (event.detail !== true && event.detail !== false)) return;
    const wasHidden = hidden;
    hidden = !event.detail;
    if (wasHidden && event.detail) for (const listener of listeners) listener();
  });
  return {
    isHidden: () => hidden,
    onVisible: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
};

let sharedDesktopVisibility: PollingVisibility | null = null;

const documentVisibility = (): PollingVisibility => {
  if (typeof document === 'undefined') return NEVER_HIDDEN;
  if (isDesktopShell()) {
    sharedDesktopVisibility ??= desktopWindowVisibility();
    return sharedDesktopVisibility;
  }
  return {
    isHidden: () => document.visibilityState === 'hidden',
    onVisible: (listener) => {
      let wasHidden = document.visibilityState === 'hidden';
      const handle = () => {
        const hidden = document.visibilityState === 'hidden';
        if (wasHidden && !hidden) listener();
        wasHidden = hidden;
      };
      const focus = () => { if (wasHidden && document.visibilityState !== 'hidden') handle(); };
      document.addEventListener('visibilitychange', handle);
      window.addEventListener('focus', focus);
      return () => {
        document.removeEventListener('visibilitychange', handle);
        window.removeEventListener('focus', focus);
      };
    },
  };
};

export const startGlobalSessionsPolling = (
  initialLoad: () => Promise<boolean>,
  refresh: () => Promise<boolean>,
  scheduleTimeout: ScheduleTimeout = window.setTimeout.bind(window),
  clearScheduledTimeout: ClearTimeout = window.clearTimeout.bind(window),
  visibility: PollingVisibility = NEVER_HIDDEN,
  subscribeServerReady: SubscribeServerReady = NEVER_READY,
  headCheck: () => Promise<boolean> = refresh,
  now: () => number = Date.now,
  subscribeStreamGapListener: SubscribeStreamGap = NEVER_GAP,
): (() => void) => {
  let disposed = false;
  let timeoutId: number | undefined;
  let startupRetries = 0;
  let hasSucceeded = false;
  let running = false;
  let readyDuringRun = false;
  let fullRefreshPending = false;
  // A refresh came due while the app was hidden and has not run yet.
  let missedWhileHidden = false;
  let lastFullRefreshAt = Number.NEGATIVE_INFINITY;
  /** Schedules the next pass; the caller decided its delay. */
  const scheduleNext = (retryDelay?: number, delay = GLOBAL_SESSIONS_REFRESH_INTERVAL_MS) => {
    timeoutId = scheduleTimeout(() => {
      timeoutId = undefined;
      if (visibility.isHidden()) {
        // A refresh that came due is owed, not dropped: becoming visible runs
        // it once, and an app that never hides still sees its own cadence.
        missedWhileHidden = true;
        return;
      }
      const fullDue = !hasSucceeded || now() - lastFullRefreshAt >= GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS;
      void run(fullDue ? refresh : headCheck, fullDue);
    }, retryDelay ?? delay);
  };
  const run = async (load: () => Promise<boolean>, full = true) => {
    running = true;
    readyDuringRun = false;
    const succeeded = await load().catch(() => false);
    running = false;
    if (disposed) return;
    hasSucceeded ||= succeeded;
    if (full && succeeded) {
      lastFullRefreshAt = now();
      fullRetryAt = null;
      headRetryAt = null;
    } else if (succeeded) {
      headRetryAt = null;
    } else if (hasSucceeded) {
      const retryAt = now() + GLOBAL_SESSIONS_RETRY_INTERVAL_MS;
      if (full) fullRetryAt = retryAt;
      else headRetryAt ??= retryAt;
    }
    if (fullRefreshPending) {
      fullRefreshPending = false;
      gapDuringRun = false;
      void run(refresh);
      return;
    }
    if (!hasSucceeded && readyDuringRun) {
      void run(refresh);
      return;
    }
    const retryDelay = !hasSucceeded ? STARTUP_RETRY_DELAYS_MS[startupRetries] : undefined;
    if (retryDelay !== undefined) startupRetries += 1;
    const untilFullRefresh = GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS - (now() - lastFullRefreshAt);
    const delay = untilFullRefresh > 0
      ? Math.min(GLOBAL_SESSIONS_REFRESH_INTERVAL_MS, untilFullRefresh)
      : full ? GLOBAL_SESSIONS_REFRESH_INTERVAL_MS : 0;
    scheduleNext(retryDelay, delay);
  };
  const stopListening = visibility.onVisible(() => {
    if (disposed) return;
    if (timeoutId !== undefined) clearScheduledTimeout(timeoutId);
    timeoutId = undefined;
    // Only a refresh the reader missed is owed; nothing was due while the app
    // was visible, so coming back to it asks for nothing.
    if (!missedWhileHidden) { if (!running) scheduleNext(); return; }
    missedWhileHidden = false;
    if (running) { fullRefreshPending = true; return; }
    void run(refresh);
  });
  const stopReadyListening = subscribeServerReady(() => {
    if (disposed || hasSucceeded) return;
    if (running) {
      readyDuringRun = true;
      return;
    }
    if (timeoutId !== undefined) clearScheduledTimeout(timeoutId);
    timeoutId = undefined;
    void run(refresh);
  });
  const stopGapListening = subscribeStreamGapListener(() => {
    if (disposed) return;
    if (running) { gapDuringRun = true; return; }
    if (!hasSucceeded) return;
    void run(headCheck, false);
  });
  void run(initialLoad);
  return () => {
    disposed = true;
    stopListening();
    stopReadyListening();
    stopGapListening();
    if (timeoutId !== undefined) clearScheduledTimeout(timeoutId);
  };
};

export const useGlobalSessionsPolling = (enabled: boolean): void => {
  React.useEffect(() => {
    if (!enabled) return;

    const start = () => {
      const runtimeKey = getRuntimeKey();
      let active = true;
      const load = async (initial: boolean): Promise<boolean> => {
        if (initial) await ensureGlobalSessionsLoaded(getAllSyncSessions());
        else await refreshGlobalSessions();
        if (!active || getRuntimeKey() !== runtimeKey) return false;
        void seedGlobalSessionStatusFromHost();
        return useGlobalSessionsStore.getState().status === 'ready';
      };
      const stop = startGlobalSessionsPolling(
        () => load(true),
        () => load(false),
        window.setTimeout.bind(window),
        window.clearTimeout.bind(window),
        documentVisibility(),
        (listener) => subscribeFirstServerConnect((connectedRuntimeKey) => {
          if (connectedRuntimeKey === runtimeKey) listener();
        }),
        () => useGlobalSessionsStore.getState().refreshSessionHead(),
        Date.now,
        (listener) => subscribeStreamGap((gapRuntimeKey) => {
          if (gapRuntimeKey === runtimeKey) listener();
        }),
      );
      return () => { active = false; stop(); };
    };
    let stop = start();
    const unsubscribe = subscribeRuntimeEndpointChanged(() => {
      stop();
      stop = start();
    });
    return () => {
      unsubscribe();
      stop();
    };
  }, [enabled]);
};
