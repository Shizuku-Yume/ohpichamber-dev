import React from 'react';
import type { Part } from '@openchamber/agent-contract';
import { MessageFilesDisplay } from '../../FileAttachment';
import type { StreamPhase } from '../types';
import { isEmptyTextPart, extractTextContent } from '../partUtils';
import { isQuestionTool } from '@/lib/toolHelpers';
import { ErrorResponseDetails } from '@/components/chat/ErrorResponseDetails';
import { SaveProjectPlanDialog } from '@/components/session/SaveProjectPlanDialog';
import { ForkSessionDialog } from '@/components/session/ForkSessionDialog';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { LongErrorText } from '../../LongErrorText';
import { flattenAssistantTextParts } from '@/lib/messages/messageText';
import { nativeToolResultContent } from '@/lib/toolResultContent';
import { copyTextToClipboard } from '@/lib/clipboard';
import { extractLoopbackUrls } from '@/lib/url';
import { stripAnsi } from '../../markdown/highlightsEngine';
import { useConfigStore } from '@/stores/useConfigStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { TextSelectionMenu } from '../TextSelectionMenu';
import { useChatSurfaceMode } from '@/components/chat/useChatSurfaceMode';
import { useChatSessionSelection } from '../../chatColumnSession';
import { isVSCodeRuntime } from '@/lib/desktop';
import { Icon } from '@/components/icon/Icon';
import { formatTimestampForDisplay } from '../timeFormat';
import { FadeInOnReveal } from '../FadeInOnReveal';
import { MessageSliceContext } from '../messageSliceContext';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useI18n } from '@/lib/i18n';
import { messageSelectionKey } from '@/stores/useMessageSelectionStore';
import { useUIStore } from '@/stores/useUIStore';
import type { TurnActivityRecord } from '../../lib/turns/types';
import type { MessageBodyProps } from './messageBodyProps';
import { CONTAIN_LAYOUT_STYLE, INLINE_MESSAGE_ACTIONS_CLASS_NAME } from './messageBodyStyles';
import { useMessageTTS } from '@/hooks/useMessageTTS';
import { useFactsFit } from '../useFactsFit';
import { AssistantMessageActionButtons } from './AssistantMessageActionButtons';
import { AssistantTurnActionButtons } from './AssistantTurnActionButtons';
import { AssistantTurnFooter } from './AssistantTurnFooter';
import { useAssistantForkActions } from './useAssistantForkActions';
import { useAssistantImageShare } from './useAssistantImageShare';
import { useAssistantPlanActions } from './useAssistantPlanActions';
import { useAssistantRenderedParts } from './useAssistantRenderedParts';
import { useFooterSheetActions } from './useFooterSheetActions';
import { useReviewTransferAction } from './useReviewTransferAction';
import { useSessionProjectRef } from './useSessionProjectRef';

const formatTurnDuration = (durationMs: number): string => {
    if (durationMs < 60_000) {
        return `${(durationMs / 1000).toFixed(1)}s`;
    }
    const totalSeconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
};

export const AssistantMessageBody = React.memo(({
    sessionId,
    workspaceId,
    messageId,
    parts,
    isMessageCompleted,
    messageCompletedAt,
    messageCreatedAt,

    isMobile,
    alwaysShowActions,
    hasTouchInput,
    expandedTools,
    onToggleTool,
    onShowPopup,
    streamPhase: _streamPhase,
    allowAnimation: _allowAnimation,
    hasTextContent = false,
    onCopyMessage,
    onCopyTurn,
    onCopyLink,
    showReasoningTraces = false,
    turnGroupingContext,
    errorMessage,
    errorResponseBody,
    reviewTransferDirection = null,
    contextPinned,
    contextPinPending,
    onToggleContextPin,
    footerProviderID,
    footerModelName,
    footerAgentName,
    footerVariant,
    extraActions,
    onSelectMessages,
}: Omit<MessageBodyProps, 'isUser'>) => {
    const { locale } = useI18n();
    const answerSelectionKey = turnGroupingContext?.turnId ? messageSelectionKey('answer', turnGroupingContext.turnId) : null;
    const chatSurfaceMode = useChatSurfaceMode();
    const streamPhase = _streamPhase;
    void _allowAnimation;
    const messageContentRef = React.useRef<HTMLDivElement>(null);
    const messageTextContentRef = React.useRef<HTMLDivElement>(null);
    const isTouchContext = Boolean(hasTouchInput ?? isMobile);
    const alwaysShowMessageActions = Boolean(alwaysShowActions ?? isMobile);
    const awaitingMessageCompletion = !isMessageCompleted;

    const storeWorkspaceId = useGlobalSessionsStore(
        React.useCallback((state) => (sessionId ? state.entityById.get(sessionId)?.workspaceId : undefined), [sessionId]),
    );
    const resolvedWorkspaceId = workspaceId ?? storeWorkspaceId;

    const visibleParts = React.useMemo(() => {
        return parts.filter((part) => !isEmptyTextPart(part));
    }, [parts]);

    const toolParts = React.useMemo(() => {
        return visibleParts.filter((part) => part.type === 'tool_call' || part.type === 'tool_result');
    }, [visibleParts]);

    const assistantTextParts = React.useMemo(() => {
        return visibleParts.filter((part) => part.type === 'text');
    }, [visibleParts]);
    const assistantPlanText = React.useMemo(() => flattenAssistantTextParts(assistantTextParts), [assistantTextParts]);

    const isVSCode = isVSCodeRuntime();
    const isMiniChatSurface = chatSurfaceMode === 'mini-chat';
    const canUseProjectPlanActions = !isVSCode && !isMiniChatSurface && !isMobile;
    const canShowMultiRunAction = !isVSCode && !isMiniChatSurface && !isMobile;
    const canOpenMessagePreview = !isVSCode && !isMiniChatSurface && !isMobile;

    const effectiveDirectory = useEffectiveDirectory();
    const currentSessionId = useChatSessionSelection().sessionId;
    const getDirectoryForSession = useSessionUIStore((state) => state.getDirectoryForSession);
    const openContextPreview = useUIStore((state) => state.openContextPreview);
    const isReviewSessionView = reviewTransferDirection === 'review-to-original';
    const effectiveReviewTransferDirection = (!isMobile && !isVSCode) ? reviewTransferDirection : null;
    const reviewTransferAction = useReviewTransferAction({ sessionId, effectiveDirectory, assistantPlanText, effectiveReviewTransferDirection });
    const chatRenderMode = useUIStore((state) => state.chatRenderMode);
    const showSplitAssistantMessageActions = useUIStore((state) => state.showSplitAssistantMessageActions);
    const timeFormatPreference = useUIStore((state) => state.timeFormatPreference);
    const isSortedRenderMode = chatRenderMode === 'sorted';
    const slice = React.useContext(MessageSliceContext);
    const isSliceEnd = !slice?.to;
    const isLastAssistantInTurn = turnGroupingContext?.isLastAssistantInTurn ?? false;
    const isTurnCompleted = !turnGroupingContext?.isWorking && isMessageCompleted;
    const isFinalAnswer = isLastAssistantInTurn && (isTurnCompleted || isMessageCompleted);
    const effectiveStreamPhase: StreamPhase = (isFinalAnswer || isMessageCompleted) ? 'completed' : streamPhase;

    const { sessionProjectRef, currentProjectRef } = useSessionProjectRef({ effectiveDirectory, canUseProjectPlanActions });

    const hasCopyableText = Boolean(hasTextContent) && !awaitingMessageCompletion;

    const messagePreviewUrl = React.useMemo(() => {
        if (!canOpenMessagePreview) {
            return null;
        }
        for (const part of assistantTextParts) {
            if (part.type !== 'text' || part.content.length === 0) continue;
            const url = extractLoopbackUrls(part.content)[0];
            if (!url) continue;
            return url.includes('0.0.0.0') ? url.replace('0.0.0.0', '127.0.0.1') : url;
        }
        for (const part of toolParts) {
            if (part.type !== 'tool_result') continue;
            const text = nativeToolResultContent(part).text;
            if (!text) continue;
            const url = extractLoopbackUrls(stripAnsi(text))[0];
            if (!url) continue;
            return url.includes('0.0.0.0') ? url.replace('0.0.0.0', '127.0.0.1') : url;
        }
        return null;
    }, [assistantTextParts, canOpenMessagePreview, toolParts]);

    const handleOpenPreview = React.useMemo(() => {
        if (!canOpenMessagePreview || !messagePreviewUrl) return undefined;
        return () => {
            const directory = effectiveDirectory
                ?? (currentSessionId ? getDirectoryForSession(currentSessionId) : null);
            if (!directory) return;
            openContextPreview(directory, messagePreviewUrl);
        };
    }, [canOpenMessagePreview, currentSessionId, effectiveDirectory, getDirectoryForSession, messagePreviewUrl, openContextPreview]);

    const {
        isPlanDialogOpen,
        setIsPlanDialogOpen,
        isPlanDialogMounted,
        suggestedPlanTitle,
        isSavingPlan,
        handleSaveAsPlanClick,
        handleConfirmSaveAsPlan,
    } = useAssistantPlanActions({ assistantPlanText, currentProjectRef });

    const {
        isForkDialogOpen,
        setIsForkDialogOpen,
        isForkSubmitting,
        handleForkClick,
        handleConfirmFork,
        handleForkFromHere,
        handleForkMultiRun,
        askOtherModelsSession,
        setAskOtherModelsSession,
        handleAskOtherModels,
    } = useAssistantForkActions({ sessionId, messageId, effectiveDirectory, assistantPlanText });

    const { shareTurnAsImage, shareShownMessageAsImage } = useAssistantImageShare({
        messageId,
        messageContentRef,
        messageTextContentRef,
        assistantTextParts,
        earlierAssistantText: turnGroupingContext?.earlierAssistantText,
    });

    const activityPartsForTurn = React.useMemo(() => {
        const all = turnGroupingContext?.activityParts;
        if (!isSortedRenderMode || !all) {
            return [];
        }
        return all;
    }, [isSortedRenderMode, turnGroupingContext?.activityParts]);

    const activityGroupSegmentsForMessage = React.useMemo(() => {
        const all = turnGroupingContext?.activityGroupSegments;
        if (!isSortedRenderMode || !all) {
            return [];
        }
        return all.filter((segment) => segment.anchorMessageId === messageId);
    }, [isSortedRenderMode, messageId, turnGroupingContext?.activityGroupSegments]);

    const hasAnchoredActivitySegments = activityGroupSegmentsForMessage.length > 0;

    const activityByPart = React.useMemo(() => {
        const byRef = new Map<Part, TurnActivityRecord>();
        const byId = new Map<string, TurnActivityRecord>();
        activityPartsForTurn.forEach((activity) => {
            byRef.set(activity.part, activity);
            if (activity.part.partId.length > 0) {
                byId.set(activity.part.partId, activity);
            }
        });

        return {
            get: (part: Part) => {
                const direct = byRef.get(part);
                if (direct) {
                    return direct;
                }
                if (part.partId.length > 0) {
                    return byId.get(part.partId);
                }
                return undefined;
            },
        };
    }, [activityPartsForTurn]);

    const toggleActivityGroup = turnGroupingContext?.toggleGroup;
    const isActivityOwnerMessage = !isSortedRenderMode
        || !turnGroupingContext?.activityOwnerMessageId
        || turnGroupingContext.activityOwnerMessageId === messageId
        || hasAnchoredActivitySegments;

    const shouldRenderActivityGroup = isSortedRenderMode
        && isActivityOwnerMessage
        && hasAnchoredActivitySegments
        && Boolean(toggleActivityGroup);

    const hasQuestionTool = React.useMemo(() => {
        return toolParts.some((toolPart) => isQuestionTool(toolPart.toolName));
    }, [toolParts]);

    const shouldDeferSortedInlineText = isSortedRenderMode && !isFinalAnswer && !hasQuestionTool;
    const showErrorMessage = Boolean(errorMessage) && isSliceEnd;
    const isPeekSurface = chatSurfaceMode === 'peek';
    const shouldShowMessageActions = hasCopyableText && !isPeekSurface && isSliceEnd;
    const shouldShowTurnFooter = isLastAssistantInTurn && hasTextContent && (isFinalAnswer || Boolean(errorMessage)) && !isPeekSurface && isSliceEnd;
    const shouldRenderActionsInActivity = isSortedRenderMode;
    const shouldShowStandaloneMessageActions = showSplitAssistantMessageActions && shouldShowMessageActions && !shouldShowTurnFooter && !shouldRenderActionsInActivity;

    const messageActionButtons = React.useMemo(() => (
        <AssistantMessageActionButtons
            hasCopyableText={hasCopyableText}
            isTouchContext={isTouchContext}
            onCopyMessage={onCopyMessage}
            onCopyLink={onCopyLink}
            onShareImage={shareShownMessageAsImage}
            ttsText={assistantPlanText}
            ttsReadingKey={messageId}
            reviewTransferAction={reviewTransferAction}
            extraActions={extraActions}
        />
    ), [assistantPlanText, extraActions, hasCopyableText, isTouchContext, messageId, onCopyLink, onCopyMessage, reviewTransferAction, shareShownMessageAsImage]);

    const onCopyFooter = onCopyTurn ?? onCopyMessage;

    const renderJustificationActions = React.useCallback((activity: TurnActivityRecord) => {
        if (!showSplitAssistantMessageActions || !isSortedRenderMode) {
            return null;
        }
        const text = extractTextContent(activity.part).trim();
        if (!text) {
            return null;
        }
        const copyJustificationText = async () => {
            const result = await copyTextToClipboard(text);
            return result.ok;
        };
        return (
            <AssistantMessageActionButtons
                hasCopyableText={true}
                isTouchContext={isTouchContext}
                onCopyMessage={copyJustificationText}
                onShareImage={shareShownMessageAsImage}
                ttsText={text}
            />
        );
    }, [isSortedRenderMode, isTouchContext, shareShownMessageAsImage, showSplitAssistantMessageActions]);

    const lastRenderableTextPartIndex = React.useMemo(() => {
        if (!shouldShowStandaloneMessageActions) {
            return -1;
        }

        let lastIndex = -1;
        for (let index = 0; index < visibleParts.length; index += 1) {
            const part = visibleParts[index];
            if (!part || part.type !== 'text') {
                continue;
            }
            if (shouldDeferSortedInlineText) {
                continue;
            }
            const activity = activityByPart.get(part);
            if (activity?.kind === 'justification') {
                continue;
            }
            lastIndex = index;
        }

        return lastIndex;
    }, [activityByPart, shouldDeferSortedInlineText, shouldShowStandaloneMessageActions, visibleParts]);

    const shouldRenderStandaloneActionsAfterContent = shouldShowStandaloneMessageActions && lastRenderableTextPartIndex < 0;
    const animateActivityRows = awaitingMessageCompletion || Boolean(turnGroupingContext?.isWorking);

    const renderedParts = useAssistantRenderedParts({
        messageId,
        sessionId,
        effectiveDirectory,
        visibleParts,
        messageTextContentRef,
        messageActionButtons,
        answerSelectionKey,
        effectiveStreamPhase,
        isFinalAnswer,
        isLastAssistantInTurn,
        turnGroupingContext,
        showReasoningTraces,
        expandedTools,
        onToggleTool,
        onShowPopup,
        isMobile,
        alwaysShowMessageActions,
        shouldShowStandaloneMessageActions,
        lastRenderableTextPartIndex,
        chatRenderMode,
        isSortedRenderMode,
        isActivityOwnerMessage,
        shouldRenderActivityGroup,
        shouldDeferSortedInlineText,
        activityByPart,
        activityGroupSegmentsForMessage,
        toggleActivityGroup,
        animateActivityRows,
        renderJustificationActions,
    });

    const turnDurationText = React.useMemo(() => {
        if (!isFinalAnswer) return undefined;
        const userCreatedAt = turnGroupingContext?.userMessageCreatedAt;
        if (userCreatedAt === undefined || messageCompletedAt === undefined) return undefined;
        if (messageCompletedAt <= userCreatedAt) return undefined;
        return formatTurnDuration(messageCompletedAt - userCreatedAt);
    }, [isFinalAnswer, turnGroupingContext?.userMessageCreatedAt, messageCompletedAt]);

    const footerTimestamp = React.useMemo(() => {
        void locale;
        const timestamp = messageCompletedAt !== undefined && messageCompletedAt > 0
            ? messageCompletedAt
            : (messageCreatedAt !== undefined && messageCreatedAt > 0 ? messageCreatedAt : null);
        if (timestamp === null) return null;

        const formatted = formatTimestampForDisplay(timestamp, timeFormatPreference);
        return formatted.length > 0 ? formatted : null;
    }, [messageCompletedAt, messageCreatedAt, timeFormatPreference, locale]);

    const footerEffortLabel = footerVariant && !['default', 'none'].includes(footerVariant.toLowerCase())
        ? footerVariant[0].toLowerCase() + footerVariant.slice(1)
        : null;

    const [actionSheetOpen, setActionSheetOpen] = React.useState(false);
    const footerFactsRef = React.useRef<HTMLDivElement>(null);
    useFactsFit(footerFactsRef);
    const { isPlaying: isFooterTTSPlaying, play: playFooterTTS, stop: stopFooterTTS } = useMessageTTS(messageId);
    const showMessageTTSButtons = useConfigStore((state) => state.showMessageTTSButtons);

    const footerSheetActions = useFooterSheetActions({
        assistantPlanText,
        canUseProjectPlanActions,
        contextPinPending,
        contextPinned,
        currentProjectRef,
        extraActions,
        handleForkClick,
        handleForkFromHere,
        handleSaveAsPlanClick,
        hasCopyableText,
        isFooterTTSPlaying,
        isMiniChatSurface,
        isReviewSessionView,
        onCopyFooter,
        onCopyLink,
        onSelectMessages,
        onToggleContextPin,
        playFooterTTS,
        reviewTransferAction,
        shareTurnAsImage,
        showMessageTTSButtons,
        stopFooterTTS,
    });

    const footerMenuActions = footerSheetActions.filter((action) => !action.onPointerRow);

    const finalTurnActionButtons = (
        <AssistantTurnActionButtons
            onCopyFooter={onCopyFooter}
            hasCopyableText={hasCopyableText}
            isTouchContext={isTouchContext}
            isFooterTTSPlaying={isFooterTTSPlaying}
            stopFooterTTS={stopFooterTTS}
            isMiniChatSurface={isMiniChatSurface}
            isReviewSessionView={isReviewSessionView}
            onOpenPreview={handleOpenPreview}
            handleForkFromHere={handleForkFromHere}
            handleForkClick={handleForkClick}
            canShowMultiRunAction={canShowMultiRunAction}
            turnId={turnGroupingContext?.turnId}
            handleAskOtherModels={handleAskOtherModels}
            handleForkMultiRun={handleForkMultiRun}
            onToggleContextPin={onToggleContextPin}
            contextPinned={contextPinned}
            contextPinPending={contextPinPending}
            footerMenuActions={footerMenuActions}
            askOtherModelsSession={askOtherModelsSession}
            setAskOtherModelsSession={setAskOtherModelsSession}
        />
    );

    return (
        <div
            ref={messageContentRef}
            data-message-text-export-root="true"
            data-chat-quote-root="true"
            className="relative w-full group/message"
            style={CONTAIN_LAYOUT_STYLE}
        >
            <TextSelectionMenu
                containerRef={messageContentRef}
                readingKey={messageId}
                canReadAloud={!isMiniChatSurface && showMessageTTSButtons}
            />
            {canUseProjectPlanActions && isPlanDialogMounted ? (
                <SaveProjectPlanDialog
                    open={isPlanDialogOpen}
                    onOpenChange={setIsPlanDialogOpen}
                    initialTitle={suggestedPlanTitle}
                    sourceText={assistantPlanText}
                    saving={isSavingPlan}
                    onSave={handleConfirmSaveAsPlan}
                />
            ) : null}
            {isForkDialogOpen ? (
                <ForkSessionDialog
                    open={isForkDialogOpen}
                    onOpenChange={setIsForkDialogOpen}
                    projectDirectory={effectiveDirectory ?? null}
                    sourceSessionId={sessionId ?? null}
                    worktreeProjectDirectory={sessionProjectRef?.path ?? null}
                    submitting={isForkSubmitting}
                    onConfirm={handleConfirmFork}
                />
            ) : null}
            <div>
                <div className="message-content-text leading-relaxed overflow-hidden text-foreground/90 [&_p:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0">
                    {renderedParts}
                    {showErrorMessage && (
                        <FadeInOnReveal key="assistant-error">
                            <div className="group/assistant-text relative mt-3 max-w-full break-words rounded-2xl bg-[var(--status-info-background)] px-4 py-3 text-base leading-relaxed">
                                <div className="flex items-center gap-3">
                                    <Icon name="information" className="size-4 shrink-0 text-[var(--status-info)]" />
                                    <div className="min-w-0 flex-1 break-words">
                                        <LongErrorText text={errorMessage ?? ''}>
                                            {(visibleText) => (
                                                <SimpleMarkdownRenderer
                                                    singleTilde={false}
                                                    content={visibleText}
                                                    onShowPopup={onShowPopup}
                                                    className="[&_.markdown-content>*:first-child]:mt-0 [&_.markdown-content>*:last-child]:mb-0"
                                                    enableFileReferences={false}
                                                />
                                            )}
                                        </LongErrorText>
                                    </div>
                                </div>
                                {errorResponseBody ? <ErrorResponseDetails body={errorResponseBody} className="mt-1 ps-7" /> : null}
                            </div>
                        </FadeInOnReveal>
                    )}
                </div>
                {isSliceEnd ? (
                    <MessageFilesDisplay
                        files={parts}
                        workspaceId={resolvedWorkspaceId}
                        onShowPopup={onShowPopup}
                    />
                ) : null}
                {shouldRenderStandaloneActionsAfterContent && (
                    <div className={INLINE_MESSAGE_ACTIONS_CLASS_NAME} data-message-actions="true">
                        <div className="flex items-center gap-1.5" data-message-action-group="true">
                            {messageActionButtons}
                        </div>
                    </div>
                )}
                {shouldShowTurnFooter && (
                    <AssistantTurnFooter
                        footerFactsRef={footerFactsRef}
                        footerModelName={footerModelName}
                        footerProviderID={footerProviderID}
                        footerAgentName={footerAgentName}
                        footerEffortLabel={footerEffortLabel}
                        turnDurationText={turnDurationText}
                        footerTimestamp={footerTimestamp}
                        alwaysShowMessageActions={alwaysShowMessageActions}
                        isTouchContext={isTouchContext}
                        actionSheetOpen={actionSheetOpen}
                        setActionSheetOpen={setActionSheetOpen}
                        actionButtons={finalTurnActionButtons}
                        isMiniChatSurface={isMiniChatSurface}
                        isLastAssistantInTurn={isLastAssistantInTurn}
                        isFinalAnswer={isFinalAnswer}
                        isMessageCompleted={isMessageCompleted}
                        turnGroupingContext={turnGroupingContext}
                        footerSheetActions={footerSheetActions}
                    />
                )}
            </div>
        </div>
    );
});
