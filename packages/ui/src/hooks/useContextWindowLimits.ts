import React from 'react';

import {
  findAnsweringModelKey,
  limitsForAnsweringModel,
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
  const getCurrentModel = useConfigStore((state) => state.getCurrentModel);
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
    const answering = limitsForAnsweringModel(answeringModelKey, providers);
    if (answering.context > 0) return answering;
    const limit = getCurrentModel()?.limit;
    return { context: limit?.context ?? 0, output: limit?.output ?? 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the getter's output tracks the selected model ids
  }, [answeringModelKey, currentProviderId, currentModelId, getCurrentModel, providers]);
};
