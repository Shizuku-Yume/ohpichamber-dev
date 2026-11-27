import { handleComposerSendFailure } from './handleComposerSendFailure';
import type { InputHistorySubmission } from '@/stores/useInputHistoryStore';
import type { useI18n } from '@/lib/i18n';
import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerSessionLifecycle } from './useComposerSessionLifecycle';
import type { useComposerSendAvailability } from './useComposerSendAvailability';
import type { useComposerSelection } from './useComposerSelection';
import type { useComposerRuntime } from './useComposerRuntime';
import type { useComposerReferenceDrafts } from './useComposerReferenceDrafts';
import type { useComposerQueueState } from './useComposerQueueState';
import type { useComposerQueueActions } from './useComposerQueueActions';
import type { useComposerPreferences } from './useComposerPreferences';
import type { useComposerParallelRun } from './useComposerParallelRun';
import type { useComposerMentionAttachments } from './useComposerMentionAttachments';
import type { useComposerLanguage } from './useComposerLanguage';
import type { useComposerInlineContext } from './useComposerInlineContext';
import type { useComposerHistorySearchState } from './useComposerHistorySearchState';
import type { useComposerExpansion } from './useComposerExpansion';
import type { useComposerEditorState } from './useComposerEditorState';
import type { useComposerDraftText } from './useComposerDraftText';
import type { useComposerDraftHistory } from './useComposerDraftHistory';
import type { useComposerColumn } from './useComposerColumn';
import type { useComposerAttachmentWork } from './useComposerAttachmentWork';
import type { useComposerLargePasteState } from './useComposerLargePasteState';
import type { ComposerSendHandlers } from './composerSendHandlers';
import type { InlineCommentDraft } from '@/stores/useInlineCommentDraftStore';
import type { ChatInputProps } from './chatInputProps';
import type { SubmitOptions } from './chatInputProps';
import { getRuntimeSwitchRevision } from '@/lib/runtime-switch';
import type { CanonicalSkillMentions } from '@/sync/session-ui-store';

import { useProjectsStore } from '@/stores/useProjectsStore';
import { selectBuiltinCommandsForDirectory } from '@/stores/useCommandsStore';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { ROOT_SELECTION_AGENT } from '@/sync/selection-store';
import { runForkCommand } from '@/components/chat/composer/submit/forkCommand';
import { CanonicalApiError } from '@/api/canonicalClient';
import { selectAvailableSkillsForDirectory } from '@/stores/useSkillsStore';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { waitForPendingDraftWorktreeRequest } from '@/lib/worktrees/pendingDraftWorktree';
import { canonicalClient } from '@/api/canonicalClient';
import { postTrackerSessionStarted } from '@/lib/trackers/sessionStatus';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { createChatDraftIdentity, getChatDraftIdentityKey } from '@/lib/chatDraftPersistence';
import { useLinkedReferenceDrafts } from '../../composer/linkedReferenceDrafts';
import { useSelectionStore } from '@/sync/selection-store';
import { useInputStore } from '@/sync/input-store';
import * as sessionActions from '@/sync/session-actions';
import { sendReconciliationOutcome } from '@/sync/send-reconciliation';
import { useInlineCommentDraftStore } from '@/stores/useInlineCommentDraftStore';
import { useSnippetsStore } from '@/stores/useSnippetsStore';
import { loadMagicPrompts } from '@/lib/magicPrompts';
import { attachedFilesForModel, AttachmentPathSaveError } from '@/sync/model-attachment-paths';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useBtwStore } from '@/stores/useBtwStore';
import { toast } from '@/components/ui';
import { withComposerReferences, composerReferenceKey, toContextReference } from '../../composer/composerReferences';
import { runGuestCommand } from '@/lib/guests/run-command';
import { routeGuestSlashCommand } from '../../composer/submit/guestCommands';
import { useAuthSessionStore } from '@/lib/runtime-auth-expiry';
import { filterMissingInlineAttachments } from '../../composer/attachments/inlineMentionAttachments';
import { buildOutgoingMessage, expandCommentSnippets } from '../../composer/submit/buildOutgoingMessage';
import { buildCommandVariables, canRunCommand, findMagicPromptCommand, planLocalSlashCommand } from '../../composer/submit/slashCommands';
import { spaceModelRefusal, stoppedSpaceOfTarget } from '@/lib/spaces/space-model-access';
import { runSpaceAction } from '@/lib/spaces/space-repair';
import { useSpacesStore } from '@/lib/spaces/spaces-store';
import { buildChatInputHistorySubmissions } from '../../inputHistory';
import { collectInlineSkillMentions } from './composerMentionTokens';
import { recordLinkedReferences } from './recordLinkedReferences';
import { createComposerSubmitErrorMessage } from './createComposerSubmitErrorMessage';
import { saveAttachmentsHeldForSend } from './saveAttachmentsHeldForSend';

type Dependencies = {
    i18n: Pick<ReturnType<typeof useI18n>, 't'>;
    attachmentWork: Pick<ReturnType<typeof useComposerAttachmentWork>, 'waitForPendingAttachments'>;
    largePasteState: Pick<ReturnType<typeof useComposerLargePasteState>, 'largeTextPasteOffer'>;
    draftText: Pick<ReturnType<typeof useComposerDraftText>, 'confirmedMentionsRef' | 'setMessage' | 'currentChatDraftIdentityRef' | 'composerText'>;
    historySearchState: Pick<ReturnType<typeof useComposerHistorySearchState>, 'setPromptHistorySearch'>;
    editorState: Pick<ReturnType<typeof useComposerEditorState>, 'composerRef'>;
    column: Pick<ReturnType<typeof useComposerColumn>, 'openTimelineDialog'>;
    sending: Pick<ReturnType<typeof useSessionUIStore.getState>, 'sendMessage'>;
    inlineContext: Pick<ReturnType<typeof useComposerInlineContext>, 'isMobileCommentOpen' | 'hasDrafts' | 'attachmentsToSend' | 'inlineDraftTarget' | 'consumeDrafts'>;
    sendHandlers: Pick<ComposerSendHandlers, 'handleSubmitRef'>;
    sendAvailability: Pick<ReturnType<typeof useComposerSendAvailability>, 'pendingFirstSend' | 'getCurrentInputSnapshot'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'isBtwActive' | 'currentSessionId' | 'btwPanel' | 'newSessionDraftOpen' | 'newSessionDraft' | 'btwDirectory' | 'currentSessionDirectoryForSync' | 'currentDirectory' | 'attachedFiles' | 'inputMode' | 'btwSessionId' | 'activeRuntimeKey' | 'chatDraftIdentity' | 'immediateBtwSubmitRef' | 'sendHeldByMissingFolder' | 'setReviewDialogOpen' | 'consumePendingSyntheticParts' | 'projectActionsRef' | 'clearAttachedFiles' | 'btwComposerSessionId' | 'sessionFolder'>;
    parallelRun: Pick<ReturnType<typeof useComposerParallelRun>, 'parallel'>;
    sessionLifecycle: Pick<ReturnType<typeof useComposerSessionLifecycle>, 'sessionPhase' | 'autoReviewRunning'>;
    queueState: Pick<ReturnType<typeof useComposerQueueState>, 'messageQueueTarget'>;
    selection: Pick<ReturnType<typeof useComposerSelection>, 'currentProviderId' | 'currentModelId' | 'currentAgentName' | 'currentVariant' | 'mailboxTarget' | 'configuredReasoningEffort' | 'persistedThinkingLevel' | 'reasoningEffortForModel'>;
    language: Pick<ReturnType<typeof useComposerLanguage>, 'readSessionMentionsBeforeSend' | 'guestCommands' | 'availableSkills' | 'linkedReferences' | 'referenceLinksIn' | 'sessionMentionsIn' | 'loadCommands'>;
    preferences: Pick<ReturnType<typeof useComposerPreferences>, 'isMobile'>;
    expansion: Pick<ReturnType<typeof useComposerExpansion>, 'setExpandedInput'>;
    runtime: Pick<ReturnType<typeof useComposerRuntime>, 'runtimeTrackers' | 'runtimeFiles'>;
    draftHistory: Pick<ReturnType<typeof useComposerDraftHistory>, 'handoffDraft' | 'restoreDraft' | 'persistDraftImmediately' | 'messageHistory' | 'migrateDraft'>;
    queueActions: Pick<ReturnType<typeof useComposerQueueActions>, 'handleQueueMessage'>;
    props: Pick<ChatInputProps, 'scrollToBottom'>;
    mentionAttachments: Pick<ReturnType<typeof useComposerMentionAttachments>, 'prepareReadOnSendMentions' | 'mentionableAgents' | 'extractInlineFileMentions' | 'sanitizeAttachmentsForSend' | 'prepareDocumentMentions'>;
    referenceDrafts: Pick<ReturnType<typeof useComposerReferenceDrafts>, 'updateLinkedReferencesFor'>;
};

export function useComposerSubmission({
    i18n, attachmentWork, largePasteState, sendHandlers, draftText, editorState, column, sending, inlineContext,
    sendAvailability, sessionScope, parallelRun, sessionLifecycle, queueState, selection,
    language, preferences, expansion, runtime, draftHistory, queueActions, props,
    mentionAttachments, referenceDrafts,
}: Dependencies) {
    const { waitForPendingAttachments } = attachmentWork;
    const { largeTextPasteOffer } = largePasteState;
    const { handleSubmitRef } = sendHandlers;
    const { attachmentsToSend } = inlineContext;
    const { t } = i18n;
    const { confirmedMentionsRef, setMessage, currentChatDraftIdentityRef, composerText } = draftText;
    const { composerRef } = editorState;
    const { openTimelineDialog } = column;
    const { sendMessage } = sending;
    const { isMobileCommentOpen, hasDrafts, inlineDraftTarget, consumeDrafts } = inlineContext;
    const { getCurrentInputSnapshot } = sendAvailability;
    const {
        isBtwActive, currentSessionId, btwPanel, newSessionDraftOpen, newSessionDraft,
        currentSessionDirectoryForSync, currentDirectory, attachedFiles, inputMode,
        activeRuntimeKey, chatDraftIdentity, immediateBtwSubmitRef,
        setReviewDialogOpen, consumePendingSyntheticParts,
        clearAttachedFiles,
    } = sessionScope;
    const { parallel } = parallelRun;
    const { sessionPhase, autoReviewRunning } = sessionLifecycle;
    const { messageQueueTarget } = queueState;
    const {
        currentProviderId, currentModelId, currentVariant,
        mailboxTarget, configuredReasoningEffort, persistedThinkingLevel, reasoningEffortForModel } = selection;
    const {
        readSessionMentionsBeforeSend, guestCommands, linkedReferences, referenceLinksIn,
        sessionMentionsIn, loadCommands } = language;
    const { isMobile } = preferences;
    const { setExpandedInput } = expansion;
    const { runtimeTrackers, runtimeFiles } = runtime;
    const { handoffDraft, restoreDraft, persistDraftImmediately, messageHistory } = draftHistory;
    const { handleQueueMessage } = queueActions;
    const { scrollToBottom } = props;
    const {
        extractInlineFileMentions,
        sanitizeAttachmentsForSend, prepareDocumentMentions } = mentionAttachments;
    const { updateLinkedReferencesFor } = referenceDrafts;

    const getSubmitErrorMessage = createComposerSubmitErrorMessage(t);
    const hasLinkedReferences = linkedReferences.length > 0;

    const handleSubmit = async (options?: SubmitOptions) => {
        // Comment mode's only submit is attach; every other send path must be
        // inert while it is open.
        if (isMobileCommentOpen()) return;
        if (largeTextPasteOffer) return;
        const held = await saveAttachmentsHeldForSend(chatDraftIdentity, currentDirectory ?? undefined, attachmentsToSend(options?.presetText ?? getCurrentInputSnapshot().message), t, waitForPendingAttachments);
        if (held === 'stopped') return;
        if (held === 'saved') { void handleSubmitRef.current(options); return; }
        // "Run in parallel" launches the run instead of sending a message.
        if (parallel.isActive) {
            if (parallel.runCount >= 2) void parallel.launch();
            return;
        }
        const submitRuntimeKey = getRuntimeKey();
        const submitRuntimeRevision = getRuntimeSwitchRevision();
        const delivery = options?.delivery === 'steer' && sessionPhase !== 'idle' ? 'steer' : undefined;
        const capturedTarget = messageQueueTarget;
        // Snapshot the draft and current-session identity before the first
        // async gap so a later sidebar selection cannot reroute the send.
        const capturedDraftSnapshot = newSessionDraftOpen ? { ...newSessionDraft } : null;
        const capturedDraftProjectPath = capturedDraftSnapshot?.selectedProjectId
            ? useProjectsStore.getState().projects.find((project) => project.id === capturedDraftSnapshot.selectedProjectId)?.path ?? null
            : null;
        const inputSnapshot = options?.presetText != null
            ? {
                message: options.presetText,
                hasContent: options.presetText.trim().length > 0 || attachedFiles.length > 0 || hasDrafts || (!isBtwActive && hasLinkedReferences),
            }
            : getCurrentInputSnapshot();
        if (!inputSnapshot.hasContent || (!currentSessionId && !newSessionDraftOpen)) {
            return;
        }

        if (inputMode === 'normal' && inputSnapshot.message.trimStart().startsWith('/')
            && !planLocalSlashCommand(inputSnapshot.message, inputMode, hasDrafts, Boolean(currentSessionId), [])) {
            if (!await loadCommands(currentDirectory)) {
                toast.error(t('chat.chatInput.toast.messageSendFailed'));
                return;
            }
            if (submitRuntimeKey !== getRuntimeKey()) return;
        }

        // Local slash commands are planned before anything is taken or
        // consumed. An action command must leave the queue and the attached
        // context where they are; a prompt command must send that context with
        // the prompt it produces. A command the composer cannot run here is not
        // a local command at all and goes out as typed.
        let commandPlan = inputSnapshot.hasContent
            ? planLocalSlashCommand(inputSnapshot.message, inputMode, hasDrafts, Boolean(currentSessionId), selectBuiltinCommandsForDirectory(useCommandsStore.getState(), currentDirectory))
            : null;
        if (commandPlan?.kind === 'prompt') {
            const magicCommand = findMagicPromptCommand(commandPlan.command.name);
            const commandIsAvailable = commandPlan.command.name === 'btw'
                ? Boolean(currentSessionId)
                : magicCommand !== null && canRunCommand(magicCommand, {
                    hasSession: Boolean(currentSessionId),
                    hasDraft: newSessionDraftOpen,
                });
            if (!commandIsAvailable) commandPlan = null;
        }
        if (commandPlan?.command.name === 'handoff-review' && isMobile) commandPlan = null;

        // Enter BTW before sending so the question stays separate from the main draft.
        // A bare command waits for input; an argument requests one immediate send.
        if (commandPlan?.kind === 'prompt' && commandPlan.command.name === 'btw' && currentSessionId) {
            useBtwStore.getState().setPanelState(currentSessionId, {
                pending: true,
                collapsed: false,
                ephemeralRecordId: undefined,
                ephemeralText: undefined,
                ephemeralStatus: undefined,
                pendingSend: undefined
            });
            const targetIdentity = createChatDraftIdentity(activeRuntimeKey, currentSessionDirectoryForSync ?? currentDirectory, `btw-pending:${currentSessionId}`);
            const argument = commandPlan.command.argument.trim();
            handoffDraft(targetIdentity, isBtwActive ? argument : argument || null);
            if (argument && targetIdentity) immediateBtwSubmitRef.current = { identity: targetIdentity, text: argument };
            return;
        }
        if (useAuthSessionStore.getState().state !== 'ok') {
            toast.error(t('sessionAuth.expired.sendBlocked'));
            return;
        }

        // A failed send returns the typed prompt no matter WHY it failed —
        // auth, network, server, anything. Losing a long prompt to a toast is
        // the one outcome this handler must never produce. The mentions are
        // snapshotted here because sending clears them before it can fail.
        let admittedTarget: { sessionId: string; directory: string | null } | null = null;
        const confirmedMentionsSnapshot = new Set(confirmedMentionsRef.current);
        const restoreComposerText = () => {
            if (!inputSnapshot.message) return;
            const owner = admittedTarget ? createChatDraftIdentity(submitRuntimeKey, admittedTarget.directory ?? currentDirectory ?? '', admittedTarget.sessionId) : chatDraftIdentity;
            restoreDraft(owner, inputSnapshot.message, confirmedMentionsSnapshot);
        };

        // An extension command never reaches the model: the extension turns
        // `/name args` into a chip, which lands through the same pending slot
        // a guest panel's `attach` uses. Nothing else in the composer moves.
        const guestRoute = !isBtwActive && inputSnapshot.hasContent
            ? routeGuestSlashCommand(inputSnapshot.message, inputMode, guestCommands)
            : null;
        if (guestRoute) {
            setMessage('');
            confirmedMentionsRef.current.clear();
            persistDraftImmediately(chatDraftIdentity, '');
            messageHistory.reset();
            const outcome = await runGuestCommand(guestRoute);
            if (outcome.ok) {
                if (outcome.item) {
                    useInputStore.getState().setPendingGuestIssue(outcome.item);
                } else {
                    // Nothing matched: give the command back so the user can fix the argument.
                    restoreComposerText();
                    toast.info(t('chat.chatInput.toast.guestCommandNothing', { name: guestRoute.entry.guestName }));
                }
                return;
            }
            restoreComposerText();
            toast.error(outcome.reason === 'error'
                ? t('chat.chatInput.toast.guestCommandFailed', { command: guestRoute.entry.command.name, reason: outcome.message })
                : t('chat.chatInput.toast.guestCommandUnavailable', { name: guestRoute.entry.guestName }));
            return;
        }

        const providerIdToSend = currentProviderId;
        const modelIdToSend = currentModelId;
        const variantToSend = currentVariant;
        const sessionEffortAgent = currentSessionId
            ? useSelectionStore.getState().getSessionAgentSelection(currentSessionId)
            ?? useConfigStore.getState().currentAgentName
            ?? ROOT_SELECTION_AGENT
            : undefined;
        const sessionReasoningEffort = currentSessionId && sessionEffortAgent !== undefined
            ? useSelectionStore.getState().getAgentModelReasoningEffortForSession(
                currentSessionId, sessionEffortAgent, providerIdToSend, modelIdToSend,
            )
            : undefined;
        const reasoningEffortToSend = reasoningEffortForModel(providerIdToSend, modelIdToSend, {
            session: sessionReasoningEffort,
            native: currentSessionId ? persistedThinkingLevel : undefined,
            draft: configuredReasoningEffort,
        });

        // The isolated space the message targets, if any: a session by its directory, a draft by
        // the creation request it still waits on or by its directory.
        const spaceTarget = currentSessionId
            ? { requestId: null, directory: currentSessionDirectoryForSync ?? currentDirectory ?? null }
            : newSessionDraftOpen
                ? { requestId: newSessionDraft?.pendingWorktreeRequestId ?? null, directory: newSessionDraft?.directoryOverride ?? null }
                : null;
        // A stopped space takes no message on any model, and its catalog does not load while it is
        // stopped, so this comes before the model check. The message stays in the composer;
        // "Start", where the group's menu offers it, brings the space back and the user sends again.
        const stoppedSpace = spaceTarget ? stoppedSpaceOfTarget(spaceTarget) : null;
        if (stoppedSpace) {
            toast.error(t(stoppedSpace.reason === 'gone' ? 'spaces.draft.spaceGone' : 'spaces.draft.spaceStopped'), stoppedSpace.start ? {
                action: {
                    label: t('spaces.actions.start'),
                    onClick: () => void runSpaceAction(stoppedSpace.spaceId, 'start'),
                },
            } : undefined);
            return;
        }

        if (!providerIdToSend || !modelIdToSend) {
            console.warn('Cannot send message: provider or model not selected');
            toast.error(t('chat.chatInput.toast.noModelSelected'));
            return;
        }

        // A message to an isolated space goes only on a model the space holds a key for; otherwise
        // it stays in the input with the reason and the way to the grant dialog.
        const spaceRefusal = spaceTarget ? spaceModelRefusal(spaceTarget, providerIdToSend) : null;
        if (spaceRefusal) {
            const provider = useConfigStore.getState().providers.find((entry) => entry.providerId === spaceRefusal.providerId)?.name ?? spaceRefusal.providerId;
            toast.error(spaceRefusal.reason === 'domain_blocked'
                ? t('spaces.draft.modelDomainBlocked', { domain: spaceRefusal.domain })
                : spaceRefusal.reason === 'needs_again'
                    ? t('spaces.draft.modelNeedsKeyAgain', { provider })
                    : t('spaces.draft.modelNotGranted', { provider }), {
                action: {
                    label: t('spaces.group.access.give'),
                    onClick: () => useSpacesStore.getState().openAccessDialog(spaceRefusal.spaceId, spaceRefusal.providerId, spaceRefusal.reason === 'domain_blocked' ? spaceRefusal.domain : undefined),
                },
            });
            return;
        }

        // Auto-review owns the active workflow; follow-ups wait in its queue.
        if (currentSessionId && autoReviewRunning && !isBtwActive && !commandPlan) {
            void handleQueueMessage();
            return;
        }

        // Side questions never send or queue messages into the active session transcript.
        if (currentSessionId && !isBtwActive && !commandPlan) {
            // Sending is authoritative for blocking prompts: deny pending
            // permissions and dismiss open forms for the session subtree. The
            // deny/clear vanishes the card instantly (optimistic); rejecting
            // unblocks the agent's tool but does NOT end its turn.
            const [deniedPermissions, dismissedForms] = await Promise.all([
                sessionActions.dismissOpenPermissionsForSession(currentSessionId),
                sessionActions.dismissOpenFormsForSession(currentSessionId),
            ]);
            // An explicit Steer goes straight to the session inbox, which
            // takes it while the turn is still active. Any other send would
            // race with that run, so it is queued; the queued-message auto-send
            // hook delivers it once the session returns to idle (#1740, #3369).
            if ((deniedPermissions || dismissedForms) && delivery !== 'steer') {
                void handleQueueMessage();
                return;
            }
        }

        if ((commandPlan?.kind === 'builtin' || commandPlan?.kind === 'action') && currentSessionId) {
            const actionName = commandPlan.command.name;
            const isSubmitCurrent = () => getRuntimeKey() === submitRuntimeKey && getRuntimeSwitchRevision() === submitRuntimeRevision;
            let accepted = false;
            try {
                if (commandPlan.kind === 'builtin') {
                    const output = await sessionActions.runBuiltinCommand(currentSessionId, inputSnapshot.message);
                    if (!isSubmitCurrent()) return;
                    if (output) toast.info(output);
                    accepted = true;
                } else if (actionName === 'undo') {
                    await useSessionUIStore.getState().handleSlashUndo(currentSessionId);
                    if (!isSubmitCurrent()) return;
                    scrollToBottom?.();
                    accepted = true;
                } else if (actionName === 'redo') {
                    await useSessionUIStore.getState().handleSlashRedo(currentSessionId);
                    if (!isSubmitCurrent()) return;
                    scrollToBottom?.();
                    accepted = true;
                } else if (actionName === 'timeline') {
                    openTimelineDialog();
                    accepted = true;
                } else if (actionName === 'handoff-review') {
                    setReviewDialogOpen(true);
                    accepted = true;
                } else if (actionName === 'fork') {
                    const forkOutcome = await runForkCommand(currentSessionId, commandPlan.command.argument, {
                        providerID: currentProviderId,
                        modelID: currentModelId,
                        agent: undefined,
                        variant: currentVariant ?? undefined,
                    }, {
                        fork: sessionActions.forkFromLastCompletedTurn,
                        directoryFor: (session) => useSessionUIStore.getState().getDirectoryForSession(session.sessionId) || currentDirectory || null,
                        send: (text, forkSelection, target) => useSessionUIStore.getState().sendMessage(
                            text,
                            forkSelection.providerID,
                            forkSelection.modelID,
                            null,
                            undefined,
                            undefined,
                            undefined,
                            forkSelection.variant,
                            'normal',
                            target,
                        ),
                        draftIdentity: (directory, sessionId) => createChatDraftIdentity(getRuntimeKey(), directory, sessionId),
                        restoreText: (target, text) => useInputStore.setState({ pendingComposerRestore: { target, text, files: [] } }),
                    });
                    if (!isSubmitCurrent()) return;
                    if (forkOutcome === 'send-failed') {
                        toast.error(t('chat.chatInput.toast.forkSendFailed'));
                        return;
                    }
                    if (forkOutcome === 'stale') return;
                    accepted = true;
                } else if (actionName === 'compact') {
                    const instructions = commandPlan.command.argument.trim();
                    await sessionActions.compactSession(currentSessionId, instructions || undefined);
                    if (!isSubmitCurrent()) return;
                    accepted = true;
                }
            } catch (error) {
                if (!isSubmitCurrent()) return;
                if (actionName === 'fork') {
                    toast.error(error instanceof sessionActions.NothingToForkError
                        ? t('chat.chatInput.toast.forkNothingToFork')
                        : getSubmitErrorMessage(error, t('chat.chatInput.toast.forkFailed')));
                    return;
                }
                if (commandPlan.kind === 'builtin') {
                    toast.error(getSubmitErrorMessage(error, t('chat.chatInput.toast.messageSendFailed')));
                    return;
                }
                if (actionName === 'compact') {
                    if (error instanceof CanonicalApiError && error.problem.code === 'SESSION_TOO_SMALL') {
                        toast.info(t('chat.chatInput.toast.compactNotNeeded'));
                        return;
                    }
                    toast.error(getSubmitErrorMessage(error, t('chat.chatInput.toast.compactFailed')));
                    return;
                }
                toast.error(getSubmitErrorMessage(error, t('chat.chatInput.toast.messageSendFailed')));
                return;
            }
            if (!accepted) return;
            const submittedIdentityKey = chatDraftIdentity ? getChatDraftIdentityKey(chatDraftIdentity) : null;
            const liveIdentity = currentChatDraftIdentityRef.current;
            const liveIdentityKey = liveIdentity ? getChatDraftIdentityKey(liveIdentity) : null;
            const isSameComposerDraft = submittedIdentityKey === liveIdentityKey;
            const isComposerTextUnchanged = composerText.get() === inputSnapshot.message;
            if (!isSameComposerDraft || isComposerTextUnchanged) {
                persistDraftImmediately(chatDraftIdentity, '');
            }
            if (isSameComposerDraft && isComposerTextUnchanged) {
                setMessage('');
                confirmedMentionsRef.current.clear();
                messageHistory.reset();
                if (!isBtwActive) setExpandedInput(false);
                if (isMobile) composerRef.current?.blur();
            }
            return;
        }

        let sendMessageOptions: {
            target?: NonNullable<typeof capturedTarget>;
            sessionId?: string;
            directory?: string;
            draftSnapshot?: NonNullable<typeof capturedDraftSnapshot>;
            historySubmissions?: InputHistorySubmission[];
            delivery?: 'steer';
            skills?: CanonicalSkillMentions;
            fileResourcesExpanded?: boolean;
            reasoningEffort?: string;
        } | undefined;
        if (capturedTarget || capturedDraftSnapshot || delivery || reasoningEffortToSend) {
            sendMessageOptions = {};
            if (capturedTarget) sendMessageOptions.target = capturedTarget;
            if (capturedDraftSnapshot) sendMessageOptions.draftSnapshot = capturedDraftSnapshot;
        }
        if (delivery && sendMessageOptions) sendMessageOptions.delivery = delivery;
        if (reasoningEffortToSend) sendMessageOptions = { ...(sendMessageOptions ?? {}), reasoningEffort: reasoningEffortToSend };

        if (inputSnapshot.hasContent && !(await readSessionMentionsBeforeSend(inputSnapshot.message))) return;
        const reservedFilenames = new Set([
            ...attachedFiles.map((attachment) => attachment.filename),
        ]);
        const documentMentions = await prepareDocumentMentions(
            !isBtwActive && inputSnapshot.hasContent ? [inputSnapshot.message] : [],
            reservedFilenames,
            submitRuntimeKey,
        );
        if (documentMentions.status === 'runtime-changed') return;
        if (documentMentions.status === 'failed') {
            toast.error(t('chat.chatInput.toast.attachNamedFailed', { name: documentMentions.filename }));
            return;
        }
        const preparedDocumentMentions = documentMentions.prepared;

        const historySubmissions = buildChatInputHistorySubmissions({
            inputMode,
            // Server-owned items were recorded on acceptance.
            queuedMessages: [],
            composerText: inputSnapshot.message,
            composerAttachments: attachedFiles,
            includeComposer: inputSnapshot.hasContent,
        });
        if (historySubmissions?.length) {
            sendMessageOptions = { ...sendMessageOptions, historySubmissions };
        }

        // Inline review comments and synthetic context are consumed before
        // assembly so a failed send can restore exactly what it took. What is
        // here belongs to this send: queueing took its own context with it.
        const syntheticParts = isBtwActive ? [] : consumePendingSyntheticParts(mailboxTarget);
        const consumedDraftTarget = inlineDraftTarget;
        const drafts: InlineCommentDraft[] = consumedDraftTarget
            ? consumeDrafts(consumedDraftTarget)
            : [];
        const restoreConsumedDrafts = () => {
            if (consumedDraftTarget && drafts.length > 0) {
                useInlineCommentDraftStore.getState().restoreDrafts(consumedDraftTarget, drafts);
            }
        };
        // Everything a prompt command consumed comes back if it fails: the
        // attached context, the typed text, and the files.
        const restoreConsumedInput = () => {
            restoreConsumedDrafts();
            if (syntheticParts?.length) {
                const inputState = useInputStore.getState();
                inputState.setPendingSyntheticParts([...syntheticParts, ...(inputState.getPendingSyntheticParts(mailboxTarget) ?? [])], mailboxTarget);
            }
            restoreComposerText();
            if (attachedFiles.length > 0) {
                useInputStore.getState().restoreAttachedFiles(attachedFiles, chatDraftIdentity);
            }
        };

        const availableSkillNames = new Set(
            selectAvailableSkillsForDirectory(useSkillsStore.getState(), currentDirectory).map((skill) => skill.name),
        );

        // Comments become synthetic context, which the send-time expansion
        // below skips, so their own words expand here.
        let expandedDrafts: InlineCommentDraft[];
        try {
            expandedDrafts = await expandCommentSnippets(drafts, text => useSnippetsStore.getState().expandText(text, currentDirectory));
        } catch (error) {
            restoreConsumedInput();
            toast.error(getSubmitErrorMessage(error, t('chat.chatInput.toast.messageSendFailed')));
            return;
        }

        const referencesToSend = withComposerReferences(linkedReferences, inputSnapshot.hasContent ? referenceLinksIn(inputSnapshot.message) : []);
        const outgoing = buildOutgoingMessage({
            queued: [],
            composerText: inputSnapshot.hasContent ? inputSnapshot.message : null,
            composerAttachments: attachedFiles,
            inlineComments: expandedDrafts,
            syntheticTexts: [
                ...(syntheticParts?.map((part) => part.text) ?? []),
            ],
            references: isBtwActive ? [] : referencesToSend.map(toContextReference).concat(
                inputSnapshot.hasContent ? sessionMentionsIn(inputSnapshot.message) : [],
            ),
        }, {
            extractFileMentions: (text) => {
                if (isBtwActive) return { text, attachments: [] };
                const { sanitizedText, attachments } = extractInlineFileMentions(text, preparedDocumentMentions);
                return { text: sanitizedText, attachments };
            },
            sanitizeAttachments: sanitizeAttachmentsForSend,
            collectSkillNames: (text) => collectInlineSkillMentions(text, availableSkillNames),
        });

        const primaryText = outgoing.primaryText;
        const { skillNames } = outgoing;
        let { primaryAttachments, additionalParts } = outgoing;
        const isAttachmentOwnerCurrent = () => getRuntimeKey() === submitRuntimeKey && getRuntimeSwitchRevision() === submitRuntimeRevision;
        try {
            const model = { providerID: providerIdToSend, modelID: modelIdToSend };
            primaryAttachments = await attachedFilesForModel(model, primaryAttachments, capturedTarget?.directory ?? currentSessionDirectoryForSync ?? currentDirectory ?? undefined, isAttachmentOwnerCurrent);
            additionalParts = await Promise.all(additionalParts.map(async (part) => ({ ...part, attachments: part.attachments ? await attachedFilesForModel(model, part.attachments, capturedTarget?.directory ?? currentSessionDirectoryForSync ?? currentDirectory ?? undefined, isAttachmentOwnerCurrent) : undefined })));
            if (!isAttachmentOwnerCurrent()) { restoreConsumedDrafts(); return; }
        } catch (error) {
            restoreConsumedDrafts();
            if (isAttachmentOwnerCurrent()) toast.error(error instanceof AttachmentPathSaveError
                ? t('chat.chatInput.toast.textModelImageSaveFailed', { files: error.filenames.join(', ') })
                : getSubmitErrorMessage(error, t('chat.chatInput.toast.messageSendFailed')));
            return;
        }
        if (outgoing.primaryFileResourcesExpanded) sendMessageOptions = { ...sendMessageOptions, fileResourcesExpanded: true };

        if (outgoing.isEmpty) return;

        // Skills named inline are attached to the canonical prompt request.
        if (skillNames.length > 0) {
            sendMessageOptions = {
                ...sendMessageOptions,
                skills: { names: skillNames },
            };
        }

        // #3898: inline @-mentions resolve to server paths without checking
        // the file exists, and OpenCode 400s the whole prompt on a missing
        // file. Silently drop the unresolvable ones and submit the rest;
        // the prompt text itself is untouched. Filtered once here so every
        // send path below (magic-prompt, btw fork, optimistic row, main send)
        // carries the same list.
        const { sendable: sendableAttachments } = await filterMissingInlineAttachments(
            primaryAttachments,
            { listLocalDirectory: async (directory) => (await runtimeFiles.listDirectory(directory)).entries },
        );

        setMessage('');
        confirmedMentionsRef.current.clear();
        persistDraftImmediately(chatDraftIdentity, '');
        messageHistory.reset();
        if (attachedFiles.length > 0) {
            clearAttachedFiles(chatDraftIdentity);
        }
        if (!isBtwActive) setExpandedInput(false);

        if (isMobile) {
            composerRef.current?.blur();
        }

        // Prompt commands render a visible prompt and send it with everything
        // the composer had attached. `/btw` was handled above as a composer
        // transition and never reaches this sending path.
        if (commandPlan?.kind === 'prompt') {
            const { name: commandName, argument } = commandPlan.command;

            // The rest render a visible prompt plus synthetic instructions and
            // send them as one message, the attached context riding along.
            const command = findMagicPromptCommand(commandName);
            if (command) {
                const variables = buildCommandVariables(command, argument);
                try {
                    await sessionActions.waitForConnectionOrThrow({ intent: 'prompt' });
                    if (getRuntimeKey() !== submitRuntimeKey || getRuntimeSwitchRevision() !== submitRuntimeRevision) throw new Error('Runtime changed');
                    let promptDirectory: string | null;
                    if (capturedTarget) {
                        promptDirectory = capturedTarget.directory;
                    } else if (capturedDraftSnapshot?.target === 'chat') {
                        promptDirectory = null;
                    } else if (capturedDraftSnapshot) {
                        promptDirectory = capturedDraftSnapshot.pendingWorktreeRequestId
                            ? await waitForPendingDraftWorktreeRequest(capturedDraftSnapshot.pendingWorktreeRequestId)
                            : capturedDraftSnapshot.bootstrapPendingDirectory ?? capturedDraftSnapshot.directoryOverride ?? capturedDraftProjectPath;
                        if (!promptDirectory) throw new Error('Project directory is unavailable');
                    } else {
                        promptDirectory = currentSessionDirectoryForSync ?? currentDirectory;
                        if (!promptDirectory) throw new Error('Session directory is unavailable');
                    }
                    if (getRuntimeKey() !== submitRuntimeKey || getRuntimeSwitchRevision() !== submitRuntimeRevision) throw new Error('Runtime changed');
                    const prompts = await loadMagicPrompts(promptDirectory);
                    if (getRuntimeKey() !== submitRuntimeKey || getRuntimeSwitchRevision() !== submitRuntimeRevision) throw new Error('Runtime changed');
                    const visibleText = prompts.render(command.visiblePrompt, variables.visible);
                    const instructionsText = prompts.render(command.instructionsPrompt, variables.instructions);
                    await sendMessage(
                        visibleText,
                        providerIdToSend,
                        modelIdToSend,
                        null,
                        sendableAttachments,
                        undefined,
                        [...additionalParts, { text: instructionsText, synthetic: true }],
                        variantToSend,
                        inputMode,
                        { ...sendMessageOptions, runtimeRevision: submitRuntimeRevision },
                    );
                    if (getRuntimeKey() !== submitRuntimeKey || getRuntimeSwitchRevision() !== submitRuntimeRevision) throw new Error('Runtime changed');
                    scrollToBottom?.();
                } catch (error) {
                    if (getRuntimeKey() !== submitRuntimeKey || getRuntimeSwitchRevision() !== submitRuntimeRevision) return;
                    restoreConsumedInput();
                    toast.error(getSubmitErrorMessage(error, t(command.errorToastKey)));
                }
                return;
            }
        }


        const expandOutgoingSnippets = async () => {
            const expandText = useSnippetsStore.getState().expandText;
            for (const part of additionalParts) {
                if (!part.synthetic && !part.fileResourcesExpanded) part.text = await expandText(part.text, currentDirectory);
            }
        };
        let pendingBtwSend: symbol | null = null;
        try {
            if (isBtwActive && btwPanel.pending && currentSessionId) {
                const panelStore = useBtwStore.getState();
                if (panelStore.byParent[currentSessionId]?.pendingSend) return;
                pendingBtwSend = Symbol('btw-send');
                panelStore.setPanelState(currentSessionId, { pendingSend: pendingBtwSend });
                await expandOutgoingSnippets();
                if (getRuntimeKey() !== submitRuntimeKey || getRuntimeSwitchRevision() !== submitRuntimeRevision) {
                    if (useBtwStore.getState().byParent[currentSessionId]?.pendingSend === pendingBtwSend) {
                        useBtwStore.getState().setPanelState(currentSessionId, { pendingSend: undefined });
                    }
                    restoreComposerText();
                    return;
                }
            } else {
                await expandOutgoingSnippets();
            }
        } catch (error) {
            restoreConsumedInput();
            toast.error(getSubmitErrorMessage(error, t('chat.chatInput.toast.messageSendFailed')));
            return;
        }

        // Collect all attachments for error recovery
        const allAttachments = [
            ...sendableAttachments,
            ...additionalParts.flatMap(p => p.attachments ?? []),
        ];

        // Arm the timeline anchor BEFORE the optimistic user row can commit;
        // arming after (or a frame later) races the commit and the anchor
        // never claims the new message.
        scrollToBottom?.();

        // Only the btw question owns the composer. An ephemeral answer keeps
        // the panel open (`isBtwActive`), but the composer is then the main
        // session's input again, so a submit must fall through to the regular
        // send path rather than return after the composer was cleared.
        if (isBtwActive && btwPanel.pending && currentSessionId) {
            try {
                if (getRuntimeKey() !== submitRuntimeKey || getRuntimeSwitchRevision() !== submitRuntimeRevision) return;
                const result = await canonicalClient.askBtw(currentSessionId, primaryText);
                if (getRuntimeKey() !== submitRuntimeKey || getRuntimeSwitchRevision() !== submitRuntimeRevision) return;
                if (useBtwStore.getState().byParent[currentSessionId]?.pendingSend !== pendingBtwSend) return;
                useBtwStore.getState().setPanelState(currentSessionId, { pending: false, pendingSend: undefined, ephemeralRecordId: result.recordId, ephemeralText: '', ephemeralStatus: 'running', collapsed: false });
                scrollToBottom?.();
            } catch (error) {
                if (getRuntimeKey() !== submitRuntimeKey || getRuntimeSwitchRevision() !== submitRuntimeRevision) return;
                if (useBtwStore.getState().byParent[currentSessionId]?.pendingSend !== pendingBtwSend) return;
                useBtwStore.getState().setPanelState(currentSessionId, { pending: true, collapsed: false, pendingSend: undefined });
                restoreConsumedInput();
                toast.error(getSubmitErrorMessage(error, t('chat.btw.toast.createFailed')));
            }
            return;
        }

        const transferDraftReferences = () => {
            if (!admittedTarget || !isAttachmentOwnerCurrent()) return;
            useLinkedReferenceDrafts.getState().move(chatDraftIdentity, createChatDraftIdentity(submitRuntimeKey, admittedTarget.directory ?? currentDirectory ?? '', admittedTarget.sessionId));
        };
        const sendPromise = sendMessage(
            primaryText,
            providerIdToSend,
            modelIdToSend,
            null,
            sendableAttachments,
            undefined,
            additionalParts.length > 0 ? additionalParts : undefined,
            variantToSend,
            inputMode,
            {
                ...sendMessageOptions, onSessionCreated: (target) => {
                    admittedTarget = target;
                    transferDraftReferences();
                }
            },
        );
        void sendPromise.then(() => {
            if (!isAttachmentOwnerCurrent()) return;
            if (isBtwActive) return;
            const linkTargetSessionId = currentSessionId ?? admittedTarget?.sessionId;
            const linkTargetDirectory = currentSessionId
                ? currentSessionDirectoryForSync ?? currentDirectory
                : admittedTarget?.directory ?? currentDirectory;
            if (linkTargetSessionId && getRuntimeKey() === submitRuntimeKey) {
                void Promise.resolve().then(() => isAttachmentOwnerCurrent() ? recordLinkedReferences(linkTargetSessionId, linkTargetDirectory, referencesToSend) : undefined).catch((error: unknown) => {
                    console.error('Session link update failed:', error);
                    if (isAttachmentOwnerCurrent()) toast.error(t('chat.workStatus.linkedIssues.linkFailed'));
                });
            } else if (referencesToSend.length > 0) {
                toast.error(t('chat.workStatus.linkedIssues.linkFailed'));
            }
            // A session that starts with a Linear issue attached reports itself
            // on that issue (the Linear card's Session comments), however it
            // was started: a draft, a worktree made from the issue.
            if (!currentSessionId && linkTargetSessionId) {
                for (const reference of referencesToSend) {
                    if (reference.kind !== 'tracker-item') continue;
                    void postTrackerSessionStarted(runtimeTrackers, reference.provider, {
                        sessionId: linkTargetSessionId, identifier: reference.identifier,
                    });
                }
            }

            // The sent references leave the composer; one attached while the
            // send was out stays for the next message.
            const sentKeys = new Set(referencesToSend.map(composerReferenceKey));
            transferDraftReferences();
            const referenceOwner = admittedTarget ? createChatDraftIdentity(submitRuntimeKey, admittedTarget.directory ?? currentDirectory ?? '', admittedTarget.sessionId) : chatDraftIdentity;
            updateLinkedReferencesFor(referenceOwner, (current) => current.filter((reference) => !sentKeys.has(composerReferenceKey(reference))));
        }).catch((error: unknown) => {
            transferDraftReferences();
            const adopted = error instanceof sessionActions.AmbiguousSendAdoptedError;
            handleComposerSendFailure(error, {
                allAttachments, chatDraftIdentity, restoreConsumedDrafts, restoreComposerText, t,
                notifyError: (message) => { if (isAttachmentOwnerCurrent()) toast.error(message); },
                reconciliationAdopted: adopted,
            });
            if (adopted && error instanceof sessionActions.AmbiguousSendAdoptedError && error.correlationId) {
                const receiptSessionId = error.sessionId ?? null;
                const outcome = receiptSessionId ? sendReconciliationOutcome(receiptSessionId, error.correlationId) : null;
                void outcome?.then((resolution) => {
                    if (resolution.outcome !== 'rejected' || !isAttachmentOwnerCurrent()) return;
                    restoreConsumedDrafts();
                    restoreComposerText();
                    if (allAttachments.length > 0) {
                        useInputStore.getState().restoreAttachedFiles(allAttachments, chatDraftIdentity);
                    }
                    toast.error((resolution.receipt?.outcome === 'rejected' ? resolution.receipt.detail.trim() : '') || t('chat.chatInput.toast.messageSendFailed'));
                });
            }
        });

        if (!isMobile) {
            composerRef.current?.focus();
        }
    };

    return { handleSubmit };
}
