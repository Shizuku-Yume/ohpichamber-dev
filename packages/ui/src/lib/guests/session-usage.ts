import type { GuestSessionContext, GuestSessionTokenTotals } from 'ohpichamber-sdk';
import type { Message, Session, SessionSnapshot } from '@openchamber/agent-contract';
import { modelRefKey } from '@openchamber/agent-contract';
import { limitsForAnsweringModel } from '@/lib/routing/contextWindowLimits';
import { computeGuestSessionTokens } from './session-tokens';

type FrameSessionFields = {
  id?: string;
  title?: string;
  model?: string;
  agent?: string;
  tokens: GuestSessionTokenTotals | null;
};

export const frameSessionFields = (
  session: Pick<Session, 'sessionId' | 'title'> | undefined,
  snapshot?: Pick<SessionSnapshot, 'selection' | 'messages' | 'window'>,
): FrameSessionFields => ({
  id: session?.sessionId,
  title: session?.title,
  model: snapshot?.selection?.model ? modelRefKey(snapshot.selection.model.providerId, snapshot.selection.model.modelId) : undefined,
  tokens: computeGuestSessionTokens(snapshot?.messages, snapshot?.window),
});

export const sameFrameSessionFields = (left: FrameSessionFields, right: FrameSessionFields): boolean => (
  left.id === right.id && left.title === right.title && left.model === right.model && left.agent === right.agent
  && (left.tokens === right.tokens || (!left.tokens && !right.tokens) || Boolean(left.tokens && right.tokens
    && left.tokens.prompt === right.tokens.prompt && left.tokens.output === right.tokens.output
    && left.tokens.reasoning === right.tokens.reasoning && left.tokens.cacheRead === right.tokens.cacheRead
    && left.tokens.cacheWrite === right.tokens.cacheWrite && left.tokens.cacheHitPercent === right.tokens.cacheHitPercent))
);

type FrameContextReading = { tokens: number; model: string | null };

export const selectFrameContextReading = (messages: readonly Message[]): FrameContextReading | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part.type !== 'notice' || part.noticeType !== 'compaction') continue;
      const tokens = part.details.tokensAfter;
      return typeof tokens === 'number' && tokens >= 0 ? { tokens, model: null } : null;
    }
    if (message.role !== 'assistant' || !message.usage || message.usage.totalTokens <= 0) continue;
    return { tokens: message.usage.totalTokens, model: message.providerId && message.modelId ? modelRefKey(message.providerId, message.modelId) : null };
  }
  return null;
};

export const sameFrameContextReading = (left: FrameContextReading | null, right: FrameContextReading | null): boolean => (
  left === right || (left !== null && right !== null && left.tokens === right.tokens && left.model === right.model)
);

export const frameContextLimit = (
  reading: FrameContextReading | null,
  providers: Parameters<typeof limitsForAnsweringModel>[1],
): number | null => {
  if (!reading) return null;
  const limit = limitsForAnsweringModel(reading.model, providers).context;
  return limit > 0 ? limit : null;
};

export const frameContext = (reading: FrameContextReading | null, limit: number | null): GuestSessionContext | null => (
  reading ? { tokens: reading.tokens, limit } : null
);
