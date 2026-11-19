import { modelRefKey, parseModelString } from '@openchamber/agent-contract';

export type ContextWindowLimits = {
  context: number;
  output: number;
};

const NO_CONTEXT_WINDOW_LIMITS: ContextWindowLimits = { context: 0, output: 0 };

/**
 * Canonical records carry `providerId`/`modelId`; the legacy OpenCode export
 * carried `providerID`/`modelID`. Read both so a session synced by either
 * shape still names the model that answered it.
 */
type AnsweringMessage = { role?: string; providerId?: string; modelId?: string; providerID?: string; modelID?: string };

const messageModelKey = (message: AnsweringMessage): string | null => {
  const providerId = message.providerId ?? message.providerID;
  const modelId = message.modelId ?? message.modelID;
  return modelRefKey(providerId, modelId) || null;
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

type SessionModelLike = { model?: { providerID: string; id: string } };

export const findSessionModelKey = (session: SessionModelLike | undefined): string | null => {
  const model = session?.model;
  if (!model?.providerID || !model.id) return null;
  return `${model.providerID}/${model.id}`;
};

type ProviderModelLike = { id: string; limit?: { context?: number; output?: number } };
type ProviderLike = { id: string; models: readonly ProviderModelLike[] };

export const limitsForAnsweringModel = (
  answeringModelKey: string | null,
  providers: readonly ProviderLike[],
): ContextWindowLimits => {
  if (!answeringModelKey) return NO_CONTEXT_WINDOW_LIMITS;
  const parsed = parseModelString(answeringModelKey);
  if (!parsed) return NO_CONTEXT_WINDOW_LIMITS;
  const model = providers.find((provider) => provider.id === parsed.providerId)?.models.find((entry) => entry.id === parsed.modelId);
  return { context: model?.limit?.context ?? 0, output: model?.limit?.output ?? 0 };
};
