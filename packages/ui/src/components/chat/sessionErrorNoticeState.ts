<<<<<<< HEAD
||||||| bc50ba56aa
import type { Message, StructuredError } from '@/lib/opencode/model';

export type LastMessageState = {
  role: Message['role'];
  timestamp: number;
  hasError: boolean;
} | null;

/**
 * A store message as SessionErrorNotice reads it.
 *
 * Only an assistant message finishes a turn, so only its `time.completed`
 * counts. Every other role — a prompt, or any of v2's plumbing records — is
 * timed by its creation. Reading a non-assistant record's time as a completion
 * made every fresh send look unanswered since the epoch and flashed the
 * no-reply notice whenever the server acknowledged slower than a frame.
 */
export const readLastMessageState = (last: Message | null | undefined): LastMessageState => {
  if (!last) return null;
  if (last.role === 'assistant') {
    const completed = last.time.completed ?? 0;
    return {
      role: last.role,
      timestamp: completed > 0 ? completed : last.time.created,
      hasError: Boolean(last.error),
    };
  }
  return { role: last.role, timestamp: last.time.created, hasError: false };
};

/**
 * The error OpenCode recorded for the session's last turn (2.0.27+): the
 * newest `idle` record after the last prompt or reply decides, and only a
 * `failed` one carries an error. Older OpenCode records the outcome alone.
 */
export const findRecordedTurnError = (messages: readonly Message[] | undefined): StructuredError | null => {
  if (!messages) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' || message.role === 'assistant') return null;
    if (message.role === 'idle') return message.outcome === 'failed' ? message.error ?? null : null;
  }
  return null;
};
=======
import type { Message, StructuredError } from '@/lib/opencode/model';

export type LastMessageState = {
  role: Message['role'];
  timestamp: number;
  hasError: boolean;
} | null;

export const readLastMessageState = (last: Message | null | undefined): LastMessageState => {
  if (!last) return null;
  if (last.role === 'assistant') {
    const completed = last.time.completed ?? 0;
    return {
      role: last.role,
      timestamp: completed > 0 ? completed : last.time.created,
      hasError: Boolean(last.error),
    };
  }
  return { role: last.role, timestamp: last.time.created, hasError: false };
};

export const findRecordedTurnError = (messages: readonly Message[] | undefined): StructuredError | null => {
  if (!messages) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' || message.role === 'assistant') return null;
    if (message.role === 'idle') return message.outcome === 'failed' ? message.error ?? null : null;
  }
  return null;
};
>>>>>>> upstream/main

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
