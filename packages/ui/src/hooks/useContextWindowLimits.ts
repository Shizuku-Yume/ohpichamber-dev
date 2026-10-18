import React from 'react';

import {
  findAnsweringModelKey,
  type ContextWindowLimits,
} from '@/lib/routing/contextWindowLimits';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDirectorySync } from '@/sync/sync-context';

/**
 * Which model's window the context readouts measure against.
 *
 * Canonical sessions do not carry a model selection. Measure the newest
 * assistant answer first, then the composer's model before an answer exists.
 * Under Auto the composer names no real model (the server picks one per
 * turn), so without an answer the readouts use their default window.
 */
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
    if (answeringModelKey) {
      const separator = answeringModelKey.indexOf('/');
      const providerId = answeringModelKey.slice(0, separator);
      const modelId = answeringModelKey.slice(separator + 1);
      const answeringModel = providers.find((provider) => provider.providerId === providerId)?.models.find((entry) => entry.modelId === modelId);
      if (answeringModel) return { context: answeringModel.contextWindow, output: answeringModel.maxOutputTokens };
    }
    const model = providers.find((provider) => provider.providerId === currentProviderId)?.models.find((entry) => entry.modelId === currentModelId);
    return { context: model?.contextWindow ?? 0, output: model?.maxOutputTokens ?? 0 };
  }, [answeringModelKey, currentProviderId, currentModelId, providers]);
};
