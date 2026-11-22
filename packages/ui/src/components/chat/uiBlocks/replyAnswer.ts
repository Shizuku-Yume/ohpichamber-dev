import React from 'react';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';

import { patchSessionMetadata, sendMessage } from '@/sync/session-actions';
import { useSessionSelector } from '@/sync/sync-context';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { UiBlockReplyAnswerData } from './answer';
import { captureRuntimeInstance } from '@/lib/runtime-switch';

type ReplyBlock = { sessionId: string; directory: string; messageId: string; block: string };

/**
 * The model the answered session last sent with: its own last choice, then the
 * session's saved selection, then the app's current one. The block answer starts
 * the next turn, so it needs the same selection its prompt used.
 */
const resolveReplyOptions = (sessionId: string) => {
 const selection = useSelectionStore.getState();
 const config = useConfigStore.getState();
 const lastChoice = useSessionUIStore.getState().getLastUserChoice(sessionId);
 const sessionModel = selection.getSessionModelSelection(sessionId);
 const chosen = (lastChoice?.providerId && lastChoice.modelId)
  ? { providerId: lastChoice.providerId, modelId: lastChoice.modelId, variant: lastChoice.variant }
  : sessionModel
   ? {
    providerId: sessionModel.providerId,
    modelId: sessionModel.modelId,
    variant: config.currentProviderId === sessionModel.providerId && config.currentModelId === sessionModel.modelId
     ? config.currentVariant
     : undefined,
   }
   : (config.currentProviderId && config.currentModelId)
    ? { providerId: config.currentProviderId, modelId: config.currentModelId, variant: config.currentVariant }
    : null;
 if (!chosen) return null;
 return { providerId: chosen.providerId, modelId: chosen.modelId, agentId: null, variant: chosen.variant ?? null, reasoningEffort: null };
};

const answerKey = (target: ReplyBlock): string => `${target.messageId}\u0000${target.block}`;

const pickAnswer = (metadata: SessionMetadata | null | undefined, target: ReplyBlock): UiBlockReplyAnswerData | null => (
 metadata?.openchamber?.uiBlockAnswers?.[answerKey(target)]?.answer ?? null
);

const sameAnswer = (left: UiBlockReplyAnswerData | null, right: UiBlockReplyAnswerData | null) => (
 left === right || (left !== null && right !== null && JSON.stringify(left) === JSON.stringify(right))
);

/**
 * Records the answer in the session's shared metadata, so every client of that
 * session shows the same choices after a reload, then hands the choices to the
 * agent as a synthetic context entry on the next prompt: the chat shows no user
 * message for them and the agent reads them as its own words.
 */
export async function sendUiBlockReplyAnswer(
 target: ReplyBlock,
 answer: UiBlockReplyAnswerData,
 text: string,
): Promise<void> {
 const isCurrentRuntime = captureRuntimeInstance();
 const options = resolveReplyOptions(target.sessionId);
 if (!options) throw new Error('Select a model before answering a UI block');
 await patchSessionMetadata(target.sessionId, target.directory, (metadata) => ({
  ...metadata,
  openchamber: {
   ...metadata.openchamber,
   uiBlockAnswers: {
    ...metadata.openchamber?.uiBlockAnswers,
    [answerKey(target)]: { messageId: target.messageId, block: target.block, answer, answeredAt: Date.now() },
   },
  },
 }));
 if (!isCurrentRuntime()) throw new Error('Runtime changed');
 await sendMessage({
  sessionId: target.sessionId,
  request: {
   input: { text: '', attachments: [], context: [{ kind: 'synthetic', text }] },
   options,
  },
 });
}

/** The answer this block already gave, read from the session's metadata; null until it has one. */
export function useUiBlockReplyAnswer(target: ReplyBlock | null): UiBlockReplyAnswerData | null {
 const select = React.useCallback((session: Session | undefined) => (
  target ? pickAnswer(session?.metadata, target) : null
 ), [target]);
 return useSessionSelector(target?.sessionId ?? '', target?.directory, select, sameAnswer);
}
