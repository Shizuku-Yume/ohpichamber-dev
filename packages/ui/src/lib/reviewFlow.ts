import type { Message, Session } from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { loadMagicPrompts, type MagicPromptSnapshot } from '@/lib/magicPrompts';
import {
  getOriginalSessionID,
  getReviewSessionID,
  isReviewSession,
  withoutReviewSessionLink,
  withReviewSessionLink,
  withReviewSessionMarker,
} from '@/lib/sessionReviewMetadata';
import { useConfigStore } from '@/stores/useConfigStore';
import { useAutoReviewStore } from '@/stores/useAutoReviewStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import { usePermissionStore } from '@/stores/permissionStore';
import { optimisticSend, patchSessionMetadata, sendMessage, waitForConnectionOrThrow } from '@/sync/session-actions';
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getDirectoryState, getSyncMessages, registerSessionDirectory } from '@/sync/sync-refs';
import { markPendingUserSendAnimation } from '@/lib/userSendAnimation';
import { getRuntimeKey, getRuntimeSwitchRevision } from '@/lib/runtime-switch';
import { expandNativeFileResource } from '@/api/fileResourceExpansion';
import { resolveWorkspaceDirectory } from '@/stores/globalSessions';

const HANDOFF_TIMEOUT_MS = 180_000;
const HANDOFF_POLL_MS = 400;
const AUTO_REVIEW_FINAL_MARKER = 'FINAL_REVIEW_STATUS: no_remaining_findings';
const AUTO_REVIEW_FINAL_MARKER_NORMALIZED = AUTO_REVIEW_FINAL_MARKER.toLowerCase();

type SessionModelContext = {
  providerId: string;
  modelId: string;
  agentId?: string;
  variant?: string;
};

type StartReviewFlowInput = SessionModelContext & {
  originalSessionID: string;
  directory: string;
  agentMentionName?: string;
  generateHandoff?: boolean;
  returnAfterHandoffRequest?: boolean;
  autoReview?: boolean;
};

const getMessageCreatedAt = (message: Message): number => message.createdAt;

const getMessageRole = (message: Message): string => message.role;

const getAssistantText = (message: Message): string => message.parts
  .filter((part) => part.type === 'text')
  .map((part) => part.content)
  .join('');

const isCompactionCommandMessage = (message: Message): boolean => message.parts.some((part) =>
  part.type === 'step_summary' && part.title.toLowerCase().includes('compact'));

/** A session is ready for handoff only after its latest native turn is terminal. */
const isSessionIdle = (sessionID: string, directory: string): boolean => {
  const state = getDirectoryState(directory);
  const snapshot = state?.snapshot[sessionID];
  if (!snapshot || snapshot.session.runtimeStatus !== 'idle') return false;
  const latestTurn = snapshot.turns.at(-1);
  if (!latestTurn) return false;
  return snapshot.activeRun === null
    && (latestTurn.status === 'completed' || latestTurn.status === 'failed' || latestTurn.status === 'cancelled');
};

export const isAutoReviewRuntimeCurrent = (runtimeKey: string): boolean => runtimeKey === getRuntimeKey();

export const assertAutoReviewRuntimeStillCurrent = (expectedRuntimeKey?: string): void => {
  if (expectedRuntimeKey && !isAutoReviewRuntimeCurrent(expectedRuntimeKey)) {
    throw new Error('Auto-review stopped because the runtime changed.');
  }
};

type ReviewOwner = { runtimeKey: string; revision: number };
const captureReviewOwner = (expectedRuntimeKey?: string): ReviewOwner => {
  assertAutoReviewRuntimeStillCurrent(expectedRuntimeKey);
  return { runtimeKey: expectedRuntimeKey ?? getRuntimeKey(), revision: getRuntimeSwitchRevision() };
};
const assertReviewOwner = (owner: ReviewOwner): void => {
  if (getRuntimeKey() !== owner.runtimeKey || getRuntimeSwitchRevision() !== owner.revision) {
    throw new Error('Review stopped because the runtime changed.');
  }
};


export const hasFinalReviewMarker = (text: string): boolean => {
  const lines = text.trim().split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.at(-1)?.toLowerCase() === AUTO_REVIEW_FINAL_MARKER_NORMALIZED;
};

export const stripFinalReviewMarker = (text: string): string => {
  const lines = text.trimEnd().split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.at(-1)?.trim().toLowerCase() === AUTO_REVIEW_FINAL_MARKER_NORMALIZED) {
    lines.pop();
  }
  return lines.join('\n').trim();
};

// A review session starts with the same review rules as /workspace-review,
// so its findings carry severities the loop's stop condition can rely on.
const reviewSessionInstructions = (prompts: MagicPromptSnapshot): Array<{ text: string }> => [
  { text: prompts.render('session.review.instructions') },
];

/**
 * The host runs the review loop, so the UI prepares the review session and
 * hands it every prompt it will send. From here on the handoff request, the
 * review, the fixes and the re-reviews all run on the host, whether or not
 * this window stays open.
 */
const startAutoReview = async (
  input: StartReviewFlowInput,
  selection: SessionModelContext,
  prompts: MagicPromptSnapshot,
  owner: ReviewOwner,
): Promise<void> => {
  const reviewSession = await createOrReuseReviewSession(input.originalSessionID, input.directory, selection, owner);
  assertReviewOwner(owner);
  const withHandoff = input.generateHandoff ?? true;
  await useAutoReviewStore.getState().startRun({
    originalSessionID: input.originalSessionID,
    reviewSessionID: reviewSession.sessionId,
    directory: input.directory,
    handoff: withHandoff
      ? { text: prompts.render('session.reviewHandoff.visible'), instructions: prompts.render('session.reviewHandoff.instructions') }
      : undefined,
    prompts: {
      reviewStart: withHandoff
        ? prompts.render('session.reviewSession.visible', { handoff: '{{handoff}}' })
        : prompts.render('session.reviewSessionWithoutHandoff.visible'),
      reviewRules: prompts.render('session.review.instructions'),
      feedbackToImplementer: prompts.render('session.reviewFeedbackToImplementer.visible', { review_feedback: '{{review_feedback}}' }),
      responseToReviewer: prompts.render('session.implementationResponseToReviewer.visible', { implementation_response: '{{implementation_response}}' }),
    },
  });
  assertReviewOwner(owner);
};

const waitForAssistantText = async (sessionID: string, directory: string, afterCreatedAt: number, owner: ReviewOwner): Promise<string> => {
  const deadline = Date.now() + HANDOFF_TIMEOUT_MS;
  while (Date.now() < deadline) {
    assertReviewOwner(owner);
    // v2 completes every step, and a step that says "let me check" before a
    // tool call has text too. Only the finished turn holds the handoff.
    if (!isSessionIdle(sessionID, directory)) {
      await new Promise((resolve) => setTimeout(resolve, HANDOFF_POLL_MS));
      continue;
    }
    const messages = getSyncMessages(sessionID, directory);
    const candidates = messages
      .filter((message) => getMessageRole(message) === 'assistant')
      .filter((message) => getMessageCreatedAt(message) >= afterCreatedAt - 1000)
      .filter((message) => !isCompactionCommandMessage(message))
      .sort((left, right) => getMessageCreatedAt(right) - getMessageCreatedAt(left));

    for (const message of candidates) {
      const text = getAssistantText(message).trim();
      if (text) return text;
    }

    await new Promise((resolve) => setTimeout(resolve, HANDOFF_POLL_MS));
  }
  throw new Error('Timed out waiting for handoff response');
};

const resolveModelContext = (sessionID: string): SessionModelContext | null => {
  const selection = useSelectionStore.getState();
  const config = useConfigStore.getState();
  const lastChoice = useSessionUIStore.getState().getLastUserChoice(sessionID);
  const sessionModel = selection.getSessionModelSelection(sessionID);
  const lastChoiceModel = lastChoice?.providerId && lastChoice.modelId
    ? { providerId: lastChoice.providerId, modelId: lastChoice.modelId }
    : null;
  const selectedModel = lastChoiceModel || sessionModel || (config.currentProviderId && config.currentModelId
    ? { providerId: config.currentProviderId, modelId: config.currentModelId }
    : null);
  if (!selectedModel?.providerId || !selectedModel?.modelId) return null;
  if (lastChoiceModel) {
    return {
      providerId: lastChoiceModel.providerId,
      modelId: lastChoiceModel.modelId,
      variant: lastChoice?.variant,
    };
  }
  const configVariant = config.currentProviderId === selectedModel.providerId && config.currentModelId === selectedModel.modelId
    ? config.currentVariant
    : undefined;
  return {
    providerId: selectedModel.providerId,
    modelId: selectedModel.modelId,
    agentId: undefined,
    variant: configVariant || undefined,
  };
};

const sendPlainMessage = async (
  sessionID: string,
  directory: string,
  text: string,
  modelContext: SessionModelContext | null | undefined,
  /** Context items sent ahead of the prompt as synthetic messages. */
  context: Array<{ text: string }> | undefined,
  owner: ReviewOwner,
): Promise<string> => {
  const runtimeKey = owner.runtimeKey;
  const session = useGlobalSessionsStore.getState().entityById.get(sessionID);
  const directoryOwner = session ? resolveWorkspaceDirectory(session.workspaceId) : undefined;
  const assertCurrent = () => {
    assertReviewOwner(owner);
    const current = useGlobalSessionsStore.getState().entityById.get(sessionID);
    if (session && (!current || current.workspaceId !== session.workspaceId || current.epoch !== session.epoch || resolveWorkspaceDirectory(session.workspaceId) !== directoryOwner)) throw new Error('Review prompt scope changed');
  };
  assertCurrent();
  const captured = modelContext ?? resolveModelContext(sessionID);
  if (!captured) throw new Error('Select a model before sending review flow messages');
  const expanded = await expandNativeFileResource(text, directory);
  assertCurrent();
  text = expanded?.content ?? text;
  const resolved = { ...captured, ...expanded?.modelSelection, agentId: undefined };
  const selection = useSelectionStore.getState();
  selection.saveSessionModelSelection(sessionID, resolved.providerId, resolved.modelId);

  markPendingUserSendAnimation(sessionID);
  let sentMessageID: string | null = null;
  await optimisticSend({
    runtimeKey,
    runtimeRevision: owner.revision,
    sessionId: sessionID,
    content: text,
    directory,
    context,
    onMessageID: (messageID) => {
      sentMessageID = messageID;
    },
    beforeOptimisticInsert: assertCurrent,
    onOptimisticInsert: () => requestChatForceScrollBottom(sessionID),
    send: (_messageID, promptContext) => {
      assertCurrent();
      return sendMessage({
        sessionId: sessionID,
        runtimeKey,
        runtimeRevision: owner.revision,
        request: {
          input: { text, attachments: [], context: promptContext.map((item) => ({ kind: 'synthetic' as const, text: item.text })) },
          options: { providerId: resolved.providerId, modelId: resolved.modelId, agentId: null, variant: resolved.variant ?? null, reasoningEffort: null },
        },
      });
    },
  });
  assertCurrent();
  if (!sentMessageID) throw new Error('Failed to prepare review flow message');
  return sentMessageID;
};

const requestChatForceScrollBottom = (sessionId: string): void => {
  if (globalThis.window === undefined) return;
  globalThis.window.dispatchEvent(new CustomEvent('openchamber:chat-force-scroll-bottom', {
    detail: { sessionId },
  }));
};

const openReviewSessionPanel = (directory: string, session: Session): void => {
  useUIStore.getState().openContextPanelTab(directory, {
    mode: 'chat',
    dedupeKey: `session:${session.sessionId}`,
    label: session.title ?? null,
    sessionTitleFallback: session.title ?? null,
  });
};

const readHostSession = async (sessionID: string, owner: ReviewOwner): Promise<Session> => {
  assertReviewOwner(owner);
  const snapshot = await canonicalClient.getSession(sessionID);
  assertReviewOwner(owner);
  const sessions = await canonicalClient.listSessions(snapshot.session.workspaceId);
  assertReviewOwner(owner);
  const session = sessions.items.find((entry) => entry.sessionId === sessionID);
  if (!session || sessions.errors[sessionID] || sessions.errors[snapshot.session.workspaceId]) {
    throw new Error('Host session projection is unavailable');
  }
  return session;
};

const getSessionOrNull = async (sessionID: string, owner: ReviewOwner): Promise<Session | null> => {
  try {
    return await readHostSession(sessionID, owner);
  } catch (error) {
    if (error instanceof CanonicalApiError && error.problem.status === 404) return null;
    throw error;
  }
};

const getReviewSessionTitle = (original: Session): string => {
  const implementationTitle = original.title?.trim() || original.sessionId;
  return `Review: ${implementationTitle}`;
};

const inheritPermissionAutoAccept = async (originalSessionID: string, reviewSessionID: string): Promise<void> => {
  const permissions = usePermissionStore.getState();
  const mode = permissions.getSessionMode(originalSessionID);
  try {
    await permissions.setSessionMode(reviewSessionID, mode);
  } catch (error) {
    console.warn('[review-flow] failed to inherit permission auto-accept for review session', error);
  }
};

const createOrReuseReviewSession = async (
  originalSessionID: string,
  directory: string,
  selection: SessionModelContext,
  owner: ReviewOwner,
): Promise<Session> => {
  assertReviewOwner(owner);
  const original = await readHostSession(originalSessionID, owner);
  assertReviewOwner(owner);
  const existingReviewID = getReviewSessionID(original);
  if (existingReviewID) {
    const existing = await getSessionOrNull(existingReviewID, owner);
    assertReviewOwner(owner);
    if (existing && isReviewSession(existing)) return existing;
    await patchSessionMetadata(originalSessionID, directory, (metadata) => withoutReviewSessionLink(metadata, existingReviewID), owner.runtimeKey, owner.revision);
    assertReviewOwner(owner);
  }

  const review = (await canonicalClient.createSession({
    projectId: original.projectId,
    workspaceId: original.workspaceId,
    options: { providerId: selection.providerId, modelId: selection.modelId, agentId: null, variant: selection.variant ?? null, reasoningEffort: null },
    title: getReviewSessionTitle(original),
    metadata: withReviewSessionMarker({}, originalSessionID),
  })).session;
  assertReviewOwner(owner);
  registerSessionDirectory(review.sessionId, directory);
  try {
    await patchSessionMetadata(originalSessionID, directory, (metadata) => withReviewSessionLink(metadata, review.sessionId), owner.runtimeKey, owner.revision);
    assertReviewOwner(owner);
  } catch (error) {
    assertReviewOwner(owner);
    await canonicalClient.deleteSession(review.sessionId).catch((deleteError) => {
      console.warn('[review-flow] failed to delete unlinked review session after link failure', deleteError);
    });
    throw error;
  }
  useGlobalSessionsStore.getState().upsertSession(review);
  await inheritPermissionAutoAccept(originalSessionID, review.sessionId);
  assertReviewOwner(owner);
  return review;
};

export const startReviewFlow = async (input: StartReviewFlowInput): Promise<void> => {
  const owner = captureReviewOwner();
  await waitForConnectionOrThrow();
  assertReviewOwner(owner);
  const prompts = await loadMagicPrompts(input.directory);
  assertReviewOwner(owner);
  const reviewSelection: SessionModelContext = {
    providerId: input.providerId,
    modelId: input.modelId,
    agentId: undefined,
    variant: input.variant,
  };
  if (input.autoReview) {
    await startAutoReview(input, reviewSelection, prompts, owner);
    return;
  }

  let reviewPrompt: string;

  if (input.generateHandoff ?? true) {
    const visibleText = prompts.render('session.reviewHandoff.visible');
    const instructionsText = prompts.render('session.reviewHandoff.instructions');
    const startedAt = Date.now();
    await sendPlainMessage(input.originalSessionID, input.directory, visibleText, null, [
      { text: instructionsText },
    ], owner);
    assertReviewOwner(owner);

    const continueFromHandoff = async (): Promise<void> => {
      const handoff = await waitForAssistantText(input.originalSessionID, input.directory, startedAt, owner);
      assertReviewOwner(owner);
      const handoffReviewPrompt = prompts.render('session.reviewSession.visible', { handoff });
      const reviewSession = await createOrReuseReviewSession(input.originalSessionID, input.directory, reviewSelection, owner);
      assertReviewOwner(owner);
      await sendPlainMessage(reviewSession.sessionId, input.directory, handoffReviewPrompt, reviewSelection, reviewSessionInstructions(prompts), owner);
      assertReviewOwner(owner);
      openReviewSessionPanel(input.directory, reviewSession);
    };

    if (input.returnAfterHandoffRequest) {
      void continueFromHandoff().catch((error) => {
        console.error('[review-flow] failed to finish background review flow', error);
      });
      return;
    }

    await continueFromHandoff();
    return;
  } else {
    reviewPrompt = prompts.render('session.reviewSessionWithoutHandoff.visible');
  }

  const reviewSession = await createOrReuseReviewSession(input.originalSessionID, input.directory, reviewSelection, owner);
  assertReviewOwner(owner);
  await sendPlainMessage(reviewSession.sessionId, input.directory, reviewPrompt, reviewSelection, reviewSessionInstructions(prompts), owner);
  assertReviewOwner(owner);
  if (!input.autoReview) {
    openReviewSessionPanel(input.directory, reviewSession);
  }
};

export const sendReviewFeedbackToOriginal = async (reviewSessionID: string, directory: string, reviewFeedback: string, expectedRuntimeKey?: string): Promise<string> => {
  const owner = captureReviewOwner(expectedRuntimeKey);
  const reviewSession = await readHostSession(reviewSessionID, owner);
  assertReviewOwner(owner);
  const originalSessionID = getOriginalSessionID(reviewSession);
  if (!originalSessionID) throw new Error('Original session is missing');
  const prompts = await loadMagicPrompts(directory);
  assertReviewOwner(owner);
  const prompt = prompts.render('session.reviewFeedbackToImplementer.visible', { review_feedback: reviewFeedback });
  return sendPlainMessage(originalSessionID, directory, prompt, undefined, undefined, owner);
};

export const sendImplementationResponseToReviewer = async (originalSessionID: string, directory: string, implementationResponse: string, expectedRuntimeKey?: string): Promise<string> => {
  const owner = captureReviewOwner(expectedRuntimeKey);
  const originalSession = await readHostSession(originalSessionID, owner);
  assertReviewOwner(owner);
  const reviewSessionID = getReviewSessionID(originalSession);
  if (!reviewSessionID) throw new Error('Review session is missing');
  let reviewSession: Session;
  try {
    reviewSession = await readHostSession(reviewSessionID, owner);
    assertReviewOwner(owner);
  } catch (error) {
    assertReviewOwner(owner);
    if (error instanceof CanonicalApiError && error.problem.status === 404) {
      await patchSessionMetadata(originalSessionID, directory, (metadata) => withoutReviewSessionLink(metadata, reviewSessionID), owner.runtimeKey, owner.revision);
      assertReviewOwner(owner);
    }
    throw error;
  }
  const prompts = await loadMagicPrompts(directory);
  assertReviewOwner(owner);
  const prompt = prompts.render('session.implementationResponseToReviewer.visible', { implementation_response: implementationResponse });
  const sentMessageID = await sendPlainMessage(reviewSessionID, directory, prompt, undefined, undefined, owner);
  assertReviewOwner(owner);
  openReviewSessionPanel(directory, reviewSession);
  return sentMessageID;
};

export type ReviewTransferDirection = 'review-to-original' | 'original-to-review';

