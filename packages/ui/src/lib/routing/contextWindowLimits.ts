import { modelRefKey, parseModelString, type Message, type ModelSelection } from '@openchamber/agent-contract';

export type ContextWindowLimits = {
  context: number;
  output: number;
};

const NO_CONTEXT_WINDOW_LIMITS: ContextWindowLimits = { context: 0, output: 0 };

type AnsweringMessage = Pick<Message, 'role' | 'providerId' | 'modelId'>;

const messageModelKey = (message: AnsweringMessage): string | null => {
  return modelRefKey(message.providerId, message.modelId) || null;
};

export const findAnsweringModelKey = (messages: readonly AnsweringMessage[]): string | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    const key = messageModelKey(message);
    if (key) return key;
  }
  return null;
};

type SessionModelLike = { model?: ModelSelection | null };

export const findSessionModelKey = (session: SessionModelLike | undefined): string | null => {
  const model = session?.model;
  return model ? modelRefKey(model.providerId, model.modelId) || null : null;
};

type ProviderModelLike = { modelId: string; contextWindow: number; maxOutputTokens: number };
type ProviderLike = { providerId: string; models: readonly ProviderModelLike[] };

export const limitsForAnsweringModel = (
  answeringModelKey: string | null,
  providers: readonly ProviderLike[],
): ContextWindowLimits => {
  if (!answeringModelKey) return NO_CONTEXT_WINDOW_LIMITS;
  const parsed = parseModelString(answeringModelKey);
  if (!parsed) return NO_CONTEXT_WINDOW_LIMITS;
  const model = providers.find((provider) => provider.providerId === parsed.providerId)?.models.find((entry) => entry.modelId === parsed.modelId);
  return { context: model?.contextWindow ?? 0, output: model?.maxOutputTokens ?? 0 };
};
