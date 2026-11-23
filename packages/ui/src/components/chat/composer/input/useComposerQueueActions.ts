import type { FileResourceExpandResult } from '@openchamber/agent-contract';
import type { InlineCommentDraft } from '@/stores/useInlineCommentDraftStore';
import type { useI18n } from '@/lib/i18n';
import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerSendAvailability } from './useComposerSendAvailability';
import type { useComposerSelection } from './useComposerSelection';
import type { useComposerReferenceDrafts } from './useComposerReferenceDrafts';
import type { useComposerQueueState } from './useComposerQueueState';
import type { useComposerPreferences } from './useComposerPreferences';
import type { useComposerMentionAttachments } from './useComposerMentionAttachments';
import type { useComposerLanguage } from './useComposerLanguage';
import type { useComposerInlineContext } from './useComposerInlineContext';
import type { useComposerEditorState } from './useComposerEditorState';
import type { useComposerDraftText } from './useComposerDraftText';
import type { useComposerAttachmentWork } from './useComposerAttachmentWork';
import type { useComposerLargePasteState } from './useComposerLargePasteState';
import type { ComposerSendHandlers } from './composerSendHandlers';
import type { QueuedContextPart, QueuedMessage } from '@/stores/messageQueueStore';
import type { SyntheticContextPart } from '@/sync/input-store';
import type { ComposerReference } from '../../composer/composerReferences';
import type { SessionReference } from '../../composer/sessionReferences';
import type { ChatInputProps } from './chatInputProps';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { createComposerSubmitErrorMessage } from './createComposerSubmitErrorMessage';
import { selectBuiltinCommandsForDirectory } from '@/stores/useCommandsStore';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { selectAvailableSkillsForDirectory } from '@/stores/useSkillsStore';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { expandCanonicalSkills } from '@/sync/session-ui-store';
import { expandWorkspaceSkillNames } from '@/api/fileResourceExpansion';
import { expandNativeFileResource } from '@/api/fileResourceExpansion';
import { ROOT_SELECTION_AGENT } from '@/sync/selection-store';
import React from 'react';
import { useSessionGoalArmStore } from '@/stores/useSessionGoalArmStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useInputStore } from '@/sync/input-store';
import { useInlineCommentDraftStore } from '@/stores/useInlineCommentDraftStore';
import { useSnippetsStore } from '@/stores/useSnippetsStore';
import { attachedFilesForModel, AttachmentPathSaveError } from '@/sync/model-attachment-paths';
import { getChatDraftIdentityKey, writeChatDraft } from '@/lib/chatDraftPersistence';
import { captureRuntimeInstance, getRuntimeKey } from '@/lib/runtime-switch';
import { CONTEXT_METADATA_KEY, draftFromContextPayload } from '@/lib/messages/contextParts';
import { toast } from '@/components/ui';
import { toContextReference, withComposerReferences } from '../../composer/composerReferences';
import { routeGuestSlashCommand } from '../../composer/submit/guestCommands';
import { withMissingCitations } from '@/lib/attachmentIdentity';
import { filterMissingInlineAttachments } from '../../composer/attachments/inlineMentionAttachments';
import { buildComposerContext, expandCommentSnippets } from '../../composer/submit/buildOutgoingMessage';
import { planLocalSlashCommand } from '../../composer/submit/slashCommands';
import { collectInlineSkillMentions } from './composerMentionTokens';
import { recordLinkedReferences } from './recordLinkedReferences';
import { saveAttachmentsHeldForSend } from './saveAttachmentsHeldForSend';

type Dependencies = {
    inlineContext: Pick<ReturnType<typeof useComposerInlineContext>, 'isMobileCommentOpen' | 'hasDrafts' | 'attachmentsToSend' | 'inlineDraftTarget' | 'consumeDrafts'>;
    attachmentWork: Pick<ReturnType<typeof useComposerAttachmentWork>, 'waitForPendingAttachments'>;
    largePasteState: Pick<ReturnType<typeof useComposerLargePasteState>, 'largeTextPasteOffer'>;
    i18n: Pick<ReturnType<typeof useI18n>, 't'>;
    draftText: Pick<ReturnType<typeof useComposerDraftText>, 'setMessage' | 'confirmedMentionsRef' | 'composerText'>;
    editorState: Pick<ReturnType<typeof useComposerEditorState>, 'composerRef'>;
    sendHandlers: Pick<ComposerSendHandlers, 'handleQueueMessageRef' | 'handleSubmitRef'>;
    sendAvailability: Pick<ReturnType<typeof useComposerSendAvailability>, 'getCurrentInputSnapshot'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'currentSessionId' | 'inputMode' | 'sendHeldByMissingFolderRef' | 'consumePendingSyntheticParts' | 'projectActionsRef' | 'clearAttachedFiles' | 'chatDraftIdentity' | 'currentDirectory' | 'attachedFiles'>;
    queueState: Pick<ReturnType<typeof useComposerQueueState>, 'messageQueueTarget' | 'addToQueue' | 'popQueuedToInput'>;
    language: Pick<ReturnType<typeof useComposerLanguage>, 'guestCommands' | 'readSessionMentionsBeforeSend' | 'linkedReferences' | 'availableSkills' | 'referenceLinksIn' | 'sessionMentionsIn' | 'rememberSessionMentions' | 'loadCommands'>;
    selection: Pick<ReturnType<typeof useComposerSelection>, 'currentProviderId' | 'currentModelId' | 'mailboxTarget' | 'currentAgentName' | 'currentVariant' | 'configuredReasoningEffort' | 'persistedThinkingLevel' | 'reasoningEffortForModel'>;
    mentionAttachments: Pick<ReturnType<typeof useComposerMentionAttachments>, 'sanitizeAttachmentsForSend' | 'prepareReadOnSendMentions' | 'mentionableAgents' | 'extractInlineFileMentions' | 'prepareDocumentMentions'>;
    props: Pick<ChatInputProps, 'scrollToLatest'>;
    referenceDrafts: Pick<ReturnType<typeof useComposerReferenceDrafts>, 'setLinkedReferencesFor' | 'updateLinkedReferencesFor' | 'updateLinkedReferences'>;
    preferences: Pick<ReturnType<typeof useComposerPreferences>, 'isMobile'>;
};

export function useComposerQueueActions({
    inlineContext, attachmentWork, largePasteState, i18n, draftText, editorState, sendHandlers, sendAvailability,
    sessionScope, queueState, language, selection, mentionAttachments, props, referenceDrafts,
    preferences,
}: Dependencies) {
    const { isMobileCommentOpen, hasDrafts, inlineDraftTarget, consumeDrafts } = inlineContext;
    const { waitForPendingAttachments } = attachmentWork;
    const { largeTextPasteOffer } = largePasteState;
    const { attachmentsToSend } = inlineContext;
    const { handleQueueMessageRef } = sendHandlers;
    const { t } = i18n;
    const { setMessage, confirmedMentionsRef, composerText } = draftText;
    const { composerRef } = editorState;
    const { handleSubmitRef } = sendHandlers;
    const { getCurrentInputSnapshot } = sendAvailability;
    const {
        currentSessionId, inputMode, consumePendingSyntheticParts,
        clearAttachedFiles, chatDraftIdentity, currentDirectory, attachedFiles} = sessionScope;
    const { messageQueueTarget, addToQueue, popQueuedToInput } = queueState;
    const {
        guestCommands, readSessionMentionsBeforeSend, linkedReferences,
        sessionMentionsIn, rememberSessionMentions, loadCommands} = language;
    const { currentProviderId, currentModelId, currentAgentName, mailboxTarget, currentVariant , configuredReasoningEffort, persistedThinkingLevel, reasoningEffortForModel} = selection;
    const {
        sanitizeAttachmentsForSend,
        extractInlineFileMentions, prepareDocumentMentions} = mentionAttachments;
    const { scrollToLatest } = props;
    const { setLinkedReferencesFor, updateLinkedReferencesFor, updateLinkedReferences } = referenceDrafts;
    const { isMobile } = preferences;

    const { files: runtimeFiles } = useRuntimeAPIs();
    const getSubmitErrorMessage = createComposerSubmitErrorMessage(t);

    const handleQueueMessage = React.useCallback(async () => {
        // The comment's exit paths are attach/cancel; queueing a real prompt
        // underneath comment mode must never fire.
        if (isMobileCommentOpen() || largeTextPasteOffer) return;
        const held = await saveAttachmentsHeldForSend(chatDraftIdentity, messageQueueTarget?.directory ?? undefined, attachmentsToSend(getCurrentInputSnapshot().message), t, waitForPendingAttachments);
        if (held === 'stopped') return;
        if (held === 'saved') { void handleQueueMessageRef.current(); return; }
        const inputSnapshot = getCurrentInputSnapshot();
        if (!inputSnapshot.hasContent || !currentSessionId || !messageQueueTarget) return;
        const queueRuntimeKey = getRuntimeKey();
        const isQueueRuntime = captureRuntimeInstance();
        const queueDraftKey = useInputStore.getState().attachmentDraftKey;
        const isQueueOwner = () => isQueueRuntime()
            && useInputStore.getState().attachmentDraftKey === queueDraftKey;
        const effortAgent = useSelectionStore.getState().getSessionAgentSelection(currentSessionId) ?? currentAgentName ?? ROOT_SELECTION_AGENT;
        const capturedEffort = useSelectionStore.getState().getAgentModelReasoningEffortForSession(currentSessionId, effortAgent, currentProviderId ?? '', currentModelId ?? '');
        if (inputMode === 'normal' && inputSnapshot.message.trimStart().startsWith('/')
            && !planLocalSlashCommand(inputSnapshot.message, inputMode, hasDrafts, true, [])) {
            if (!await loadCommands(currentDirectory)) {
                toast.error(t('chat.chatInput.toast.messageSendFailed'));
                return;
            }
            if (queueRuntimeKey !== getRuntimeKey() || !isQueueOwner()) return;
        }

        // A local or extension command is run, not queued: the queue delivers
        // text to the model, and `/compact`, `/btw`, or `/task` mean nothing there.
        if (planLocalSlashCommand(inputSnapshot.message, inputMode, hasDrafts, true, selectBuiltinCommandsForDirectory(useCommandsStore.getState(), currentDirectory))
            || routeGuestSlashCommand(inputSnapshot.message, inputMode, guestCommands)) {
            void handleSubmitRef.current();
            return;
        }
        const queueTarget = messageQueueTarget;
        const queueSessionId = currentSessionId;
        const messageToQueue = inputSnapshot.message.replace(/^\n+|\n+$/g, '');
        if (!(await readSessionMentionsBeforeSend(messageToQueue))) return;
        const composerAttachments = sanitizeAttachmentsForSend(attachedFiles);

        // A queued message is resolved now, not at delivery: the server that
        // sends it has no agent list, no confirmed mentions, and no way to read
        // a document the user named — and the mention must match what was
        // visible when the user typed it.
        const documentMentions = await prepareDocumentMentions(
            [messageToQueue],
            new Set(composerAttachments.map((attachment) => attachment.filename)),
            queueRuntimeKey,
        );
        if (documentMentions.status === 'runtime-changed') return;
        if (documentMentions.status === 'failed') {
            toast.error(t('chat.chatInput.toast.attachNamedFailed', { name: documentMentions.filename }));
            return;
        }
        const sanitizedText = messageToQueue;
        const { attachments: extractedMentionAttachments } = extractInlineFileMentions(sanitizedText, documentMentions.prepared);
        // #3898: a queued message is delivered later without the composer, so
        // a phantom mention (`@masha.conner`) must be dropped now or the
        // delivery 400s.
        const { sendable: mentionAttachments } = await filterMissingInlineAttachments(
            extractedMentionAttachments,
            { listLocalDirectory: async (directory) => (await runtimeFiles.listDirectory(directory)).entries },
        );
        const availableSkillNames = new Set(
            selectAvailableSkillsForDirectory(useSkillsStore.getState(), queueTarget.directory).map((skill) => skill.name),
        );
        const queuedSkillNames = collectInlineSkillMentions(sanitizedText, availableSkillNames);
        let skillInstruction: string | null;
        // Capture native expansion and bindings with the queued selection.
        let expandedResource: FileResourceExpandResult | null;
        try {
            skillInstruction = queueSessionId
                ? await expandCanonicalSkills(queueSessionId, queuedSkillNames)
                : await expandWorkspaceSkillNames(queueTarget.directory, queuedSkillNames);
            expandedResource = await expandNativeFileResource(sanitizedText, queueTarget.directory);
            const invocation = expandedResource ? null : /^\/([^\s]+)(?:\s([\s\S]*))?$/.exec(sanitizedText);
            if (invocation && availableSkillNames.has(invocation[1])) {
                const slashSkill = queueSessionId
                    ? await expandCanonicalSkills(queueSessionId, [invocation[1]], invocation[2] ?? '')
                    : await expandWorkspaceSkillNames(queueTarget.directory, [invocation[1]], invocation[2] ?? '');
                skillInstruction = [skillInstruction, slashSkill].filter(Boolean).join('\n\n');
            }
        } catch (error) {
            toast.error(getSubmitErrorMessage(error, t('chat.queuedMessage.toast.queueFailed')));
            return;
        }
        const textToQueue = expandedResource?.content ?? sanitizedText;
        if (!isQueueOwner()) return;
        let attachmentsToQueue = [...composerAttachments, ...mentionAttachments];
        try {
            const providerID = expandedResource?.modelSelection?.providerId ?? currentProviderId;
            const modelID = expandedResource?.modelSelection?.modelId ?? currentModelId;
            if (providerID && modelID) attachmentsToQueue = await attachedFilesForModel({ providerID, modelID }, attachmentsToQueue, queueTarget.directory, isQueueRuntime);
        } catch (error) {
            if (!isQueueRuntime()) return;
            toast.error(error instanceof AttachmentPathSaveError
                ? t('chat.chatInput.toast.textModelImageSaveFailed', { files: error.filenames.join(', ') })
                : getSubmitErrorMessage(error, t('chat.queuedMessage.toast.queueFailed')));
            return;
        }
        if (!isQueueOwner()) return;

        // Everything attached to the composer leaves with the message: the
        // chips are part of what was queued, and come back if it is edited.
        const syntheticParts = consumePendingSyntheticParts(mailboxTarget) ?? [];
        const draftTarget = inlineDraftTarget;
        const drafts = draftTarget ? consumeDrafts(draftTarget) : [];
        const linked = linkedReferences;
        // Queued context is delivered as captured, so comment snippets expand now.
        let expandedDrafts: InlineCommentDraft[];
        try {
            expandedDrafts = await expandCommentSnippets(drafts, text => useSnippetsStore.getState().expandText(text, queueTarget.directory));
        } catch (error) {
            if (isQueueRuntime()) {
                if (draftTarget) useInlineCommentDraftStore.getState().restoreDrafts(draftTarget, drafts);
                if (syntheticParts.length) useInputStore.getState().setPendingSyntheticParts(syntheticParts, mailboxTarget);
                toast.error(getSubmitErrorMessage(error, t('chat.queuedMessage.toast.queueFailed')));
            }
            return;
        }
        if (!isQueueOwner()) {
            if (isQueueRuntime()) {
                if (draftTarget) useInlineCommentDraftStore.getState().restoreDrafts(draftTarget, drafts);
                if (syntheticParts.length) useInputStore.getState().setPendingSyntheticParts(syntheticParts, mailboxTarget);
            }
            return;
        }
        const context = buildComposerContext({
            inlineComments: expandedDrafts,
            syntheticTexts: syntheticParts.map((part) => part.text),
            references: [...linked.map(toContextReference), ...sessionMentionsIn(messageToQueue)],
        }, skillInstruction);

        // Sending while the agent works must still take the reader to the
        // live edge — a queued message produces no user row yet, so the
        // anchor path has nothing to claim and would leave the viewport
        // parked mid-history.
        scrollToLatest?.();

        // Clear the composer. The mentions it had confirmed were resolved
        // above, so nothing later needs them.
        setMessage('');
        confirmedMentionsRef.current.clear();
        if (composerAttachments.length > 0) {
            const sentIds = new Set(composerAttachments.map((file) => file.id));
            const input = useInputStore.getState();
            input.setAttachedFiles(input.getAttachedFiles(chatDraftIdentity).filter((file) => !sentIds.has(file.id)), chatDraftIdentity);
        }
        setLinkedReferencesFor(chatDraftIdentity, []);
        if (!isMobile) {
            composerRef.current?.focus();
        }

        const queuedProviderId = expandedResource?.modelSelection?.providerId ?? currentProviderId;
        const queuedModelId = expandedResource?.modelSelection?.modelId ?? currentModelId;
        const queuedSessionEffort = capturedEffort;
        try {
            await addToQueue(queueTarget, {
                content: messageToQueue,
                text: textToQueue,
                attachments: attachmentsToQueue.length > 0 ? attachmentsToQueue : undefined,
                context: context.length > 0 ? context : undefined,
                sendConfig: queuedProviderId && queuedModelId ? {
                    providerID: queuedProviderId,
                    modelID: queuedModelId,
                    variant: currentVariant ?? undefined,
                    reasoningEffort: reasoningEffortForModel(queuedProviderId, queuedModelId, {
                        session: queuedSessionEffort,
                        native: queueSessionId ? persistedThinkingLevel : undefined,
                        draft: configuredReasoningEffort,
                    }),
                } : undefined,
            });
        } catch (error) {
            console.warn('[queue] failed to queue message:', error);
            if (isQueueRuntime()) toast.error(getSubmitErrorMessage(error, t('chat.queuedMessage.toast.queueFailed')));
            // The composer was cleared on queueing; give everything back. The
            // text is appended if the user has already typed something new.
            const currentInput = composerRef.current?.getValue() ?? composerText.get();
            const ownsComposer = isQueueRuntime() && chatDraftIdentity && useInputStore.getState().attachmentDraftKey === getChatDraftIdentityKey(chatDraftIdentity);
            if (!ownsComposer) {
                writeChatDraft(chatDraftIdentity, messageToQueue, []);
            } else if (!currentInput) {
                setMessage(messageToQueue);
            } else {
                useInputStore.getState().setPendingInputText(messageToQueue, 'append', mailboxTarget);
            }
            if (composerAttachments.length > 0) {
                useInputStore.getState().restoreAttachedFiles(composerAttachments, chatDraftIdentity);
            }
            if (draftTarget && drafts.length > 0) {
                useInlineCommentDraftStore.getState().restoreDrafts(draftTarget, drafts);
            }
            if (syntheticParts.length > 0) {
                useInputStore.getState().setPendingSyntheticParts(syntheticParts, mailboxTarget);
            }
            // Anything attached while the queue write was out stays, after these.
            updateLinkedReferencesFor(chatDraftIdentity, (current) => withComposerReferences(linked, current));
            return;
        }
        if (isQueueRuntime()) recordLinkedReferences(queueSessionId, queueTarget.directory, linked);
    }, [largeTextPasteOffer, waitForPendingAttachments, attachmentsToSend, handleQueueMessageRef, getCurrentInputSnapshot, getSubmitErrorMessage, currentSessionId, currentDirectory, messageQueueTarget, inputMode, hasDrafts, loadCommands, guestCommands, attachedFiles, sanitizeAttachmentsForSend, prepareDocumentMentions, extractInlineFileMentions, runtimeFiles, consumePendingSyntheticParts, mailboxTarget, inlineDraftTarget, consumeDrafts, linkedReferences, scrollToLatest, clearAttachedFiles, chatDraftIdentity, isMobile, isMobileCommentOpen, addToQueue, currentProviderId, currentModelId, currentVariant, configuredReasoningEffort, persistedThinkingLevel, reasoningEffortForModel, t, readSessionMentionsBeforeSend, sessionMentionsIn]);

    const restoreQueuedContext = React.useCallback((context: readonly QueuedContextPart[]) => {
        const synthetic: SyntheticContextPart[] = [];
        const restored: Exclude<ComposerReference, { kind: 'shared-page' }>[] = [];
        const sharedPages: ComposerReference[] = [];
        const mentions: SessionReference[] = [];
        for (const part of context) {
            if (part.kind === 'synthetic') {
                synthetic.push({ text: part.text, synthetic: true });
                continue;
            }
            if (part.kind !== 'context') continue;
            const payload = part.metadata[CONTEXT_METADATA_KEY];
            if (payload.kind === 'shared-page') {
                sharedPages.push({
                    kind: 'shared-page',
                    shareKey: payload.receivedId ?? payload.host,
                    receivedId: payload.receivedId,
                    host: payload.host,
                    title: payload.title || null,
                    opened: payload.opened,
                    contextText: part.text,
                });
            } else if (payload.kind === 'repository-issue') {
                restored.push({
                    kind: 'repository-issue',
                    ...(payload.provider ? { provider: payload.provider } : {}),
                    number: payload.number,
                    title: payload.title,
                    url: payload.url,
                    contextText: part.text,
                });
            } else if (payload.kind === 'repository-discussion') {
                restored.push({
                    kind: 'repository-discussion',
                    provider: payload.provider,
                    number: payload.number,
                    title: payload.title,
                    url: payload.url,
                    contextText: part.text,
                });
            } else if (payload.kind === 'change-request') {
                const reference: Extract<ComposerReference, { kind: 'change-request' }> = {
                    kind: 'change-request',
                    provider: payload.provider ?? 'github',
                    number: payload.number,
                    title: payload.title,
                    url: payload.url,
                    head: '',
                    base: '',
                    includeDiff: false,
                    contextText: part.text,
                };
                if (payload.sourceLinks) reference.sourceLinks = payload.sourceLinks;
                restored.push(reference);
            } else if (payload.kind === 'tracker-item') {
                restored.push({ kind: 'tracker-item', provider: payload.provider, identifier: payload.identifier, title: payload.title, url: payload.url, contextText: part.text });
            } else if (payload.kind === 'session') {
                mentions.push({ kind: 'session', sessionId: payload.sessionId, title: payload.title, contextText: part.text });
            } else if (payload.kind === 'session-message') {
                mentions.push({
                    kind: 'session-message',
                    sessionId: payload.sessionId,
                    messageId: payload.messageId,
                    sessionTitle: payload.sessionTitle,
                    excerpt: payload.excerpt,
                    contextText: part.text,
                });
            } else if (payload.kind === 'guest-issue' || payload.kind === 'guest-pr') {
                restored.push({
                    kind: 'guest',
                    providerId: payload.providerId,
                    id: payload.id,
                    title: payload.title,
                    url: payload.url,
                    contextText: part.text,
                    thread: payload.kind === 'guest-pr' ? 'pull' : 'issue',
                    data: payload.data,
                });
            } else {
                const draft = draftFromContextPayload(payload);
                if (draft && inlineDraftTarget) {
                    useInlineCommentDraftStore.getState().addDraft(inlineDraftTarget, draft, { written: true });
                }
            }
        }
        const chips: ComposerReference[] = [...restored, ...sharedPages];
        if (chips.length > 0) {
            updateLinkedReferences((current) => withComposerReferences(current, chips));
        }
        rememberSessionMentions(mentions);
        if (synthetic.length > 0) {
            const pending = useInputStore.getState().getPendingSyntheticParts(mailboxTarget) ?? [];
            useInputStore.getState().setPendingSyntheticParts([...pending, ...synthetic], mailboxTarget);
        }
    }, [inlineDraftTarget, mailboxTarget, rememberSessionMentions, updateLinkedReferences]);

    const handleQueuedMessageEdit = React.useCallback((queued: QueuedMessage) => {
        if (queued.attachments && queued.attachments.length > 0) {
            const currentAttachments = useInputStore.getState().attachedFiles;
            useInputStore.getState().setAttachedFiles([...currentAttachments, ...queued.attachments]);
        }
        setMessage(withMissingCitations(queued.content, queued.attachments ?? []));
        if (queued.goal) useSessionGoalArmStore.getState().setArmed(true, queued.goal.objective ?? null);
        restoreQueuedContext(queued.context ?? []);
        setTimeout(() => {
            composerRef.current?.focus();
        }, 0);
    }, [restoreQueuedContext, setMessage, composerRef]);

    const handleQueuedMessageEditById = React.useCallback((messageId: string) => {
        if (!messageQueueTarget) return;
        void popQueuedToInput(messageQueueTarget, messageId).then((queued) => {
            if (queued) handleQueuedMessageEdit(queued);
        }).catch((error) => {
            console.warn('[queue] failed to take queued message for editing:', error);
            toast.info(t('common.unavailable'));
        });
    }, [messageQueueTarget, popQueuedToInput, handleQueuedMessageEdit, t]);

    const handleQueuedMessageSend = React.useCallback((messageId: string) => {
        void handleSubmitRef.current({ queuedOnly: true, queuedMessageId: messageId, delivery: 'steer' });
    }, [handleSubmitRef]);

    return {
        handleQueueMessage, handleQueuedMessageEdit, handleQueuedMessageEditById, handleQueuedMessageSend,
    };
}
