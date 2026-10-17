
/**
 * When a prompt looks unanswered, the store may simply have missed the reply:
 * a live stream that drops or never delivers the turn's message events leaves
 * the prompt as the last message even though OpenCode answered it, and nothing
 * else re-reads the session until a manual reload. So the session tail is
 * re-read from the server at these offsets (ms after the prompt starts to look
 * unanswered). The notice waits for the first read to settle: a reply found by
 * it replaces the prompt as the last message and the notice never shows; a
 * failed read shows the notice, since a failure must not hide a real no-reply.
 * The later reads keep running under a visible notice so a late reply still
 * replaces it; a genuine no-reply stops costing requests after the last offset.
 */
const UNANSWERED_RECHECK_DELAYS_MS: readonly number[] = [0, 10_000, 30_000];

type RecheckScheduler = {
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
};

/**
 * Runs `refetch` once per offset in `delays` until cancelled, and calls
 * `onSettled` after each read finishes, whether it succeeded or failed. A read
 * that settles after cancellation reports nothing, so a read started for an
 * old prompt or session cannot affect the current one.
 */
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
