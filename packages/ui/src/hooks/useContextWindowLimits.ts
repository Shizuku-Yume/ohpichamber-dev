import React from 'react';
import { parseModelString } from '@openchamber/agent-contract';

import {
  findAnsweringModelKey,
  type ContextWindowLimits,
} from '@/lib/routing/contextWindowLimits';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDirectorySync } from '@/sync/sync-context';

export const useContextWindowLimits = (sessionId: string | null, directory?: string): ContextWindowLimits => {
  const currentProviderId = useConfigStore((state) => state.currentProviderId);
  const currentModelId = useConfigStore((state) => state.currentModelId);
  const providers = useConfigStore((state) => state.providers);

  // `provider/model` strings, so the caller re-renders only when the model
  // changes, not on every streamed part.
  const answeringModelKey = useDirectorySync(
    React.useCallback((state) => (
      sessionId ? findAnsweringModelKey(state.message[sessionId] ?? []) : null
    ), [sessionId]),
    directory,
  );

  return React.useMemo(() => {
    const answering = parseModelString(answeringModelKey ?? '');
    if (answering) {
      const answeringModel = providers.find((provider) => provider.providerId === answering.providerId)?.models.find((entry) => entry.modelId === answering.modelId);
      if (answeringModel) return { context: answeringModel.contextWindow, output: answeringModel.maxOutputTokens };
    }
    const model = providers.find((provider) => provider.providerId === currentProviderId)?.models.find((entry) => entry.modelId === currentModelId);
    return { context: model?.contextWindow ?? 0, output: model?.maxOutputTokens ?? 0 };
  }, [answeringModelKey, currentProviderId, currentModelId, providers]);
};
