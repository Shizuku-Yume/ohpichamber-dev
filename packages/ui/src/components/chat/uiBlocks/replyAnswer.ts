import React from 'react';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';

import { patchSessionMetadata, sendMessage } from '@/sync/session-actions';
import { useSessionSelector } from '@/sync/sync-context';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { UiBlockReplyAnswerData } from './answer';

type ReplyBlock = { sessionId: string; directory: string; messageId: string; block: string };

<<<<<<< HEAD
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
||||||| bc50ba56aa
// One input id per block for this client's lifetime: a retry after a lost
// response reuses it, and OpenCode refuses the repeat.
const inputIds = new Map<string, string>();
const inputIdFor = (target: ReplyBlock): string => {
  const key = `${target.sessionId}\u0000${target.messageId}\u0000${target.block}`;
  const known = inputIds.get(key);
  if (known) return known;
  const id = ascendingId('msg');
  inputIds.set(key, id);
  return id;
};

/**
 * Hands the agent the choices made in a block of its reply. They travel as
 * synthetic input that starts the agent's next turn, so the chat shows no
 * user message for them; the input's metadata records the answer for the block.
 */
export async function sendUiBlockReplyAnswer(target: ReplyBlock, answer: UiBlockReplyAnswerData, text: string): Promise<void> {
  const runtimeKey = getRuntimeKey();
  await commitStagedRevert(target.sessionId, target.directory);
  await opencodeClient.resumeWithSyntheticInput({
    runtimeKey,
    id: inputIdFor(target),
    sessionId: target.sessionId,
    directory: target.directory,
    text,
    metadata: { [UI_BLOCK_ANSWER_METADATA_KEY]: { messageId: target.messageId, block: target.block, answer } },
  });
}

const findAnswer = (messages: Message[], target: ReplyBlock): UiBlockReplyAnswerData | null => {
  for (const message of messages) {
    if (message.role !== 'synthetic') continue;
    const record = uiBlockAnswerRecord.safeParse(message.metadata?.[UI_BLOCK_ANSWER_METADATA_KEY]);
    if (record.success && record.data.messageId === target.messageId && record.data.block === target.block) return record.data.answer;
  }
  return null;
=======
// external: https://github.com/anomalyco/opencode Reusing the input ID after a lost response lets OpenCode reject a duplicate answer.
const inputIds = new Map<string, string>();
const inputIdFor = (target: ReplyBlock): string => {
  const key = `${target.sessionId}\u0000${target.messageId}\u0000${target.block}`;
  const known = inputIds.get(key);
  if (known) return known;
  const id = ascendingId('msg');
  inputIds.set(key, id);
  return id;
};

export async function sendUiBlockReplyAnswer(target: ReplyBlock, answer: UiBlockReplyAnswerData, text: string): Promise<void> {
  const runtimeKey = getRuntimeKey();
  await commitStagedRevert(target.sessionId, target.directory);
  await opencodeClient.resumeWithSyntheticInput({
    runtimeKey,
    id: inputIdFor(target),
    sessionId: target.sessionId,
    directory: target.directory,
    text,
    metadata: { [UI_BLOCK_ANSWER_METADATA_KEY]: { messageId: target.messageId, block: target.block, answer } },
  });
}

const findAnswer = (messages: Message[], target: ReplyBlock): UiBlockReplyAnswerData | null => {
  for (const message of messages) {
    if (message.role !== 'synthetic') continue;
    const record = uiBlockAnswerRecord.safeParse(message.metadata?.[UI_BLOCK_ANSWER_METADATA_KEY]);
    if (record.success && record.data.messageId === target.messageId && record.data.block === target.block) return record.data.answer;
  }
  return null;
>>>>>>> upstream/main
};

const answerKey = (target: ReplyBlock): string => `${target.messageId}\u0000${target.block}`;

const pickAnswer = (metadata: SessionMetadata | null | undefined, target: ReplyBlock): UiBlockReplyAnswerData | null => (
 metadata?.openchamber?.uiBlockAnswers?.[answerKey(target)]?.answer ?? null
);

<<<<<<< HEAD
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
 await sendMessage({
  sessionId: target.sessionId,
  request: {
   input: { text: '', attachments: [], context: [{ kind: 'synthetic', text }] },
   options,
  },
 });
}

/** The answer this block already gave, read from the session's metadata; null until it has one. */
||||||| bc50ba56aa
/** The answer this block already gave, read back from the session; null until it has one. */
=======
>>>>>>> upstream/main
export function useUiBlockReplyAnswer(target: ReplyBlock | null): UiBlockReplyAnswerData | null {
 const select = React.useCallback((session: Session | undefined) => (
  target ? pickAnswer(session?.metadata, target) : null
 ), [target]);
 return useSessionSelector(target?.sessionId ?? '', target?.directory, select, sameAnswer);
}
