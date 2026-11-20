
const UNANSWERED_RECHECK_DELAYS_MS: readonly number[] = [0, 10_000, 30_000];

type RecheckScheduler = {
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
};

export const scheduleUnansweredRechecks = (
  refetch: () => Promise<void>,
  scheduler: RecheckScheduler,
  onSettled: () => void = () => undefined,
  delays: readonly number[] = UNANSWERED_RECHECK_DELAYS_MS,
): (() => void) => {
  let cancelled = false;
  const settle = () => {
    if (!cancelled) onSettled();
  };
  const handles = delays.map((delay) => scheduler.setTimeout(() => {
    if (cancelled) return;
    void refetch().then(settle, settle);
  }, delay));
  return () => {
    cancelled = true;
    for (const handle of handles) scheduler.clearTimeout(handle);
  };
};
