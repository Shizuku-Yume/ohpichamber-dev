import React from 'react';
import { parseModelString } from '@openchamber/agent-contract';

import {
  findAnsweringModelKey,
  type ContextWindowLimits,
} from '@/lib/routing/contextWindowLimits';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDirectorySync } from '@/sync/sync-context';

<<<<<<< HEAD
/**
 * Which model's window the context readouts measure against.
 *
 * Canonical sessions do not carry a model selection. Measure the newest
 * assistant answer first, then the composer's model before an answer exists.
 * Under Auto the composer names no real model (the server picks one per
 * turn), so without an answer the readouts use their default window.
 */
||||||| bc50ba56aa
/**
 * Which model's window the context readouts measure against.
 *
 * OpenCode 2.x keeps the model on the session record, and that is what the
 * next turn runs on: a manual switch and an Auto-routed turn both land there
 * before any answer exists, so the record is measured against first. The
 * newest answer's model stands in when the record names none (older sessions),
 * and the composer's model only before the first answer. Under Auto the
 * composer names no real model at all (the server picks one per turn), so
 * without the record or an answer Auto reads as "no limit" and the readouts
 * divide by the 200k default.
 */
=======
>>>>>>> upstream/main
export const useContextWindowLimits = (sessionId: string | null, directory?: string): ContextWindowLimits => {
  const currentProviderId = useConfigStore((state) => state.currentProviderId);
  const currentModelId = useConfigStore((state) => state.currentModelId);
  const providers = useConfigStore((state) => state.providers);

<<<<<<< HEAD
  // `provider/model` strings, so the caller re-renders only when the model
  // changes, not on every streamed part.
||||||| bc50ba56aa
  // `provider/model` strings, so the caller re-renders only when the model
  // changes, not on every streamed part.
  const sessionModelKey = useDirectorySync(
    React.useCallback((state) => (
      sessionId ? findSessionModelKey(state.session.find((candidate) => candidate.id === sessionId)) : null
    ), [sessionId]),
    directory,
  );
=======
  const sessionModelKey = useDirectorySync(
    React.useCallback((state) => (
      sessionId ? findSessionModelKey(state.session.find((candidate) => candidate.id === sessionId)) : null
    ), [sessionId]),
    directory,
  );
>>>>>>> upstream/main
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
