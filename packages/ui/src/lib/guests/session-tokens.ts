import type { Message, SessionSnapshot } from '@openchamber/agent-contract';
import type { GuestSessionTokenTotals } from 'ohpichamber-sdk';

export const computeGuestSessionTokens = (
  messages: readonly Message[] | undefined,
  window: SessionSnapshot['window'] | undefined,
): GuestSessionTokenTotals | null => {
  if (!messages || !window || window.hasEarlier
    || (messages[0]?.messageId ?? null) !== window.firstMessageId
    || (messages.at(-1)?.messageId ?? null) !== window.lastMessageId) return null;
  let reported = false;
  const totals: GuestSessionTokenTotals = { prompt: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cacheHitPercent: null };
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.usage) continue;
    reported = true;
    const usage = message.usage;
    totals.prompt += usage.input + usage.cacheRead + usage.cacheWrite;
    totals.output += usage.output;
    totals.reasoning += usage.reasoning ?? 0;
    totals.cacheRead += usage.cacheRead;
    totals.cacheWrite += usage.cacheWrite;
  }
  if (!reported) return null;
  if (totals.prompt > 0) totals.cacheHitPercent = totals.cacheRead / totals.prompt * 100;
  return totals;
};
