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
import { useAutoReviewStore, type AutoReviewRun } from '@/stores/useAutoReviewStore';
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
const AUTO_REVIEW_POLL_MS = 300;
const AUTO_REVIEW_MAX_ITERATIONS = 15;
const AUTO_REVIEW_FINAL_MARKER = 'FINAL_REVIEW_STATUS: no_remaining_findings';
const AUTO_REVIEW_FINAL_MARKER_NORMALIZED = AUTO_REVIEW_FINAL_MARKER.toLowerCase();
const activeAutoReviewLoops = new Set<string>();
const activeAutoReviewForwardKeys = new Set<string>();

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

type AssistantTextMessage = {
  id: string;
  text: string;
};

const getMessageCreatedAt = (message: Message): number => message.createdAt;

const getMessageRole = (message: Message): string => message.role;

const getAssistantText = (message: Message): string => message.parts
  .filter((part) => part.type === 'text')
  .map((part) => part.content)
  .join('');

const isCompactionCommandMessage = (message: Message): boolean => message.parts.some((part) =>
  part.type === 'step_summary' && part.title.toLowerCase().includes('compact'));
const getLatestAssistantTextMessage = (
  sessionID: string,
  directory: string,
  lastForwardedMessageID?: string,
  afterCreatedAt = 0,
): AssistantTextMessage | null => {
  const messages = getSyncMessages(sessionID, directory);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.messageId === lastForwardedMessageID) return null;
    if (getMessageRole(message) !== 'assistant') continue;
    if (getMessageCreatedAt(message) < afterCreatedAt - 1000) continue;
    if (isCompactionCommandMessage(message)) continue;
    const text = getAssistantText(message).trim();
    if (!text) continue;
    return { id: message.messageId, text };
  }
  return null;
};

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

const stopRunForRuntimeMismatch = (run: AutoReviewRun): void => {
  useAutoReviewStore.getState().updateRun(run.originalSessionID, (current) => ({
    ...current,
    status: 'stopped',
    error: 'Auto-review stopped because the runtime changed.',
  }));
};

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

const getAutoReviewForwardKey = (run: AutoReviewRun, messageID: string): string => [
  run.runtimeKey,
  run.originalSessionID,
  run.phase,
  run.expectedAssistantParentID ?? '',
  messageID,
].join(':');

export const claimAutoReviewForward = (run: AutoReviewRun, messageID: string): string | null => {
  const key = getAutoReviewForwardKey(run, messageID);
  if (activeAutoReviewForwardKeys.has(key)) return null;
  activeAutoReviewForwardKeys.add(key);
  return key;
};

export const releaseAutoReviewForward = (key: string): void => {
  activeAutoReviewForwardKeys.delete(key);
};

const autoReviewReviewerInstructions = (): Array<{ text: string; synthetic: true }> => [{
  synthetic: true,
  text: `This review is part of an automatic review loop. When no blocker or non-blocker findings remain open, end your response with this exact final line:\n${AUTO_REVIEW_FINAL_MARKER}\nNits never keep the loop going: list them if useful and still end with that line. While a blocker or non-blocker remains open, leave the line out.`,
}];

// A review session starts with the same review rules as /workspace-review,
// so its findings carry severities the loop's stop condition can rely on.
const reviewSessionInstructions = (prompts: MagicPromptSnapshot, autoReview: boolean | undefined): Array<{ text: string }> => {
  const reviewRules = { text: prompts.render('session.review.instructions') };
  return autoReview ? [reviewRules, ...autoReviewReviewerInstructions()] : [reviewRules];
};

const runAutoReviewLoop = async (originalSessionID: string, owner: ReviewOwner): Promise<void> => {
  while (true) {
    assertReviewOwner(owner);
    const run = useAutoReviewStore.getState().runsByOriginalSessionID[originalSessionID];
    if (!run || run.status !== 'running') return;
    if (!isAutoReviewRuntimeCurrent(run.runtimeKey)) {
      stopRunForRuntimeMismatch(run);
      return;
    }

    const sourceSessionID = run.phase === 'waiting_for_reviewer' ? run.reviewSessionID : run.originalSessionID;
    if (!isSessionIdle(sourceSessionID, run.directory)) {
      await new Promise((resolve) => setTimeout(resolve, AUTO_REVIEW_POLL_MS));
      continue;
    }

    const latest = getLatestAssistantTextMessage(
      sourceSessionID,
      run.directory,
      run.lastForwardedMessageID,
      run.waitAfterCreatedAt,
    );
    if (!latest) {
      await new Promise((resolve) => setTimeout(resolve, AUTO_REVIEW_POLL_MS));
      continue;
    }

    if (run.phase === 'waiting_for_reviewer') {
      const forwardKey = claimAutoReviewForward(run, latest.id);
      if (!forwardKey) {
        await new Promise((resolve) => setTimeout(resolve, AUTO_REVIEW_POLL_MS));
        continue;
      }
      if (!isAutoReviewRuntimeCurrent(run.runtimeKey)) {
        releaseAutoReviewForward(forwardKey);
        stopRunForRuntimeMismatch(run);
        return;
      }
      try {
        const waitAfterCreatedAt = Date.now();
        const isFinalReview = hasFinalReviewMarker(latest.text);
        const reviewFeedback = isFinalReview ? stripFinalReviewMarker(latest.text) : latest.text;
        const sentMessageID = await sendReviewFeedbackToOriginal(run.reviewSessionID, run.directory, reviewFeedback, run.runtimeKey);
        assertReviewOwner(owner);
        if (isFinalReview) {
          useAutoReviewStore.getState().completeRun(run.originalSessionID);
          return;
        }
        useAutoReviewStore.getState().updateRun(run.originalSessionID, (current) => ({
          ...current,
          phase: 'waiting_for_implementer',
          lastForwardedMessageID: latest.id,
          expectedAssistantParentID: sentMessageID,
          waitAfterCreatedAt,
        }));
      } finally {
        releaseAutoReviewForward(forwardKey);
      }
    } else {
      if (run.iteration >= run.maxIterations) {
        useAutoReviewStore.getState().stopRun(run.originalSessionID);
        return;
      }
      const forwardKey = claimAutoReviewForward(run, latest.id);
      if (!forwardKey) {
        await new Promise((resolve) => setTimeout(resolve, AUTO_REVIEW_POLL_MS));
        continue;
      }
      if (!isAutoReviewRuntimeCurrent(run.runtimeKey)) {
        releaseAutoReviewForward(forwardKey);
        stopRunForRuntimeMismatch(run);
        return;
      }
      try {
        const waitAfterCreatedAt = Date.now();
        const sentMessageID = await sendImplementationResponseToReviewer(run.originalSessionID, run.directory, latest.text, true, run.runtimeKey);
        assertReviewOwner(owner);
        useAutoReviewStore.getState().updateRun(run.originalSessionID, (current) => ({
          ...current,
          phase: 'waiting_for_reviewer',
          iteration: current.iteration + 1,
          lastForwardedMessageID: latest.id,
          expectedAssistantParentID: sentMessageID,
          waitAfterCreatedAt,
        }));
      } finally {
        releaseAutoReviewForward(forwardKey);
      }
    }
  }
};

const startAutoReviewRun = (run: AutoReviewRun): void => {
  useAutoReviewStore.getState().upsertRun(run);
  resumeAutoReviewRun(run.originalSessionID);
};

export const resumeAutoReviewRun = (originalSessionID: string): void => {
  const run = useAutoReviewStore.getState().runsByOriginalSessionID[originalSessionID];
  if (!run || run.status !== 'running' || !isAutoReviewRuntimeCurrent(run.runtimeKey) || activeAutoReviewLoops.has(originalSessionID)) return;
  const owner = captureReviewOwner(run.runtimeKey);
  activeAutoReviewLoops.add(originalSessionID);
  void runAutoReviewLoop(run.originalSessionID, owner).catch((error) => {
    if (getRuntimeKey() !== owner.runtimeKey || getRuntimeSwitchRevision() !== owner.revision) return;
    console.error('[review-flow] auto-review loop failed', error);
    const message = error instanceof Error ? error.message : String(error);
    useAutoReviewStore.getState().updateRun(run.originalSessionID, (current) => ({
      ...current,
      status: message.includes('runtime changed') ? 'stopped' : 'error',
      error: message,
    }));
  }).finally(() => {
    activeAutoReviewLoops.delete(originalSessionID);
  });
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

// A review session runs tools too (reads other directories, verifies with commands),
// so a fresh one starts with the same permission mode as the session it reviews.
// Failure only leaves the reviewer on the default mode the server gave it.
const inheritPermissionAutoAccept = async (originalSessionID: string, reviewSessionID: string): Promise<void> => {
  const permissions = usePermissionStore.getState();
  // `ask` is copied too: otherwise the server's default could make the
  // reviewer more permissive than the session it reviews.
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
      const runtimeKey = owner.runtimeKey;
      const waitAfterCreatedAt = Date.now();
      const sentMessageID = await sendPlainMessage(reviewSession.sessionId, input.directory, handoffReviewPrompt, reviewSelection, reviewSessionInstructions(prompts, input.autoReview), owner);
      assertReviewOwner(owner);
      if (input.autoReview) {
        startAutoReviewRun({
          originalSessionID: input.originalSessionID,
          reviewSessionID: reviewSession.sessionId,
          directory: input.directory,
          runtimeKey,
          status: 'running',
          phase: 'waiting_for_reviewer',
          iteration: 0,
          maxIterations: AUTO_REVIEW_MAX_ITERATIONS,
          expectedAssistantParentID: sentMessageID,
          waitAfterCreatedAt,
        });
      }
      if (!input.autoReview) {
        openReviewSessionPanel(input.directory, reviewSession);
      }
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
  const runtimeKey = owner.runtimeKey;
  const waitAfterCreatedAt = Date.now();
  const sentMessageID = await sendPlainMessage(reviewSession.sessionId, input.directory, reviewPrompt, reviewSelection, reviewSessionInstructions(prompts, input.autoReview), owner);
  assertReviewOwner(owner);
  if (input.autoReview) {
    startAutoReviewRun({
      originalSessionID: input.originalSessionID,
      reviewSessionID: reviewSession.sessionId,
      directory: input.directory,
      runtimeKey,
      status: 'running',
      phase: 'waiting_for_reviewer',
      iteration: 0,
      maxIterations: AUTO_REVIEW_MAX_ITERATIONS,
      expectedAssistantParentID: sentMessageID,
      waitAfterCreatedAt,
    });
  }
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

export const sendImplementationResponseToReviewer = async (originalSessionID: string, directory: string, implementationResponse: string, autoReview = false, expectedRuntimeKey?: string): Promise<string> => {
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
  const sentMessageID = await sendPlainMessage(reviewSessionID, directory, prompt, undefined, autoReview ? autoReviewReviewerInstructions() : undefined, owner);
  assertReviewOwner(owner);
  if (!autoReview) {
    openReviewSessionPanel(directory, reviewSession);
  }
  return sentMessageID;
};

export type ReviewTransferDirection = 'review-to-original' | 'original-to-review';

