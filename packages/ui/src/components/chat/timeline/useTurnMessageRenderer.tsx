import React from 'react';

import { earlierAssistantText } from '../lib/turns/earlierAssistantText';
import { assistantTextSegments } from '@/lib/messages/messageText';
import type { ChatMessageEntry, TurnRecord, TurnGroupingContext } from '../lib/turns/types';
import type { ReviewTransferDirection } from '@/lib/reviewFlow';
import type { StreamPhase } from '../message/types';
import { MessageRow } from './MessageRow';

export interface TurnRendererInput {
    turn: TurnRecord;
    isLastTurn: boolean;
    nextEntryFirstMessage?: ChatMessageEntry;
    sessionIsWorking: boolean;
    scrollToBottom?: () => void;
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
    reviewTransferDirection?: ReviewTransferDirection | null;
    chatRenderMode?: 'live' | 'sorted';
    defaultActivityExpanded?: boolean;
    isGroupExpanded?: boolean;
    onToggleGroup?: () => void;
}

export const useTurnMessageRenderer = ({
    turn,
    isLastTurn,
    nextEntryFirstMessage,
    sessionIsWorking,
    scrollToBottom,
    shouldAnimateUserMessage,
    onUserAnimationConsumed,
    activeStreamingMessageId,
    activeStreamingPhase,
    reviewTransferDirection,
    chatRenderMode = 'live',
    isGroupExpanded = false,
    onToggleGroup,
}: TurnRendererInput) => {
    const streamingAssistantMessageId = React.useMemo(() => {
        if (activeStreamingMessageId && turn.assistantMessages.some((assistant) => assistant.messageId === activeStreamingMessageId)) {
            return activeStreamingMessageId;
        }
        return null;
    }, [activeStreamingMessageId, turn.assistantMessages]);

    const turnEarlierAssistantText = React.useMemo(
        () => earlierAssistantText(turn.assistantMessages),
        [turn.assistantMessages],
    );
    const firstTextAssistantIndex = React.useMemo(() => {
        return turn.assistantMessages.findIndex((assistant) => assistantTextSegments(assistant.parts).length > 0);
    }, [turn.assistantMessages]);

    const assistantIndexById = React.useMemo(() => {
        const ids = new Map<string, number>();
        turn.assistantMessages.forEach((assistant, index) => {
            ids.set(assistant.messageId, index);
        });
        return ids;
    }, [turn.assistantMessages]);

    const activityOwnerMessageId = React.useMemo(() => {
        if (streamingAssistantMessageId) {
            return streamingAssistantMessageId;
        }
        return turn.assistantMessages[0]?.messageId;
    }, [streamingAssistantMessageId, turn.assistantMessages]);

    const turnGroupingContextBase = React.useMemo(() => {
        return {
            turnId: turn.turnId,
            summaryBody: turn.summaryText,
            activityParts: turn.activityParts,
            activityGroupSegments: turn.activitySegments,
            headerMessageId: turn.headerMessageId,
            hasTools: turn.hasTools,
            hasReasoning: turn.hasReasoning,
            diffStats: turn.diffStats,
            changedFiles: turn.changedFiles,
            userMessageCreatedAt: turn.userMessage.createdAt,
        };
    }, [
        turn.activityParts,
        turn.activitySegments,
        turn.changedFiles,
        turn.diffStats,
        turn.hasReasoning,
        turn.hasTools,
        turn.headerMessageId,
        turn.summaryText,
        turn.turnId,
        turn.userMessage.createdAt,
    ]);

    const snapshotTurnId = turn.userMessage.role === 'user' ? turn.turnId : undefined;

    const streamPhaseOf = React.useCallback((messageId: string): StreamPhase => {
        return messageId === streamingAssistantMessageId ? (activeStreamingPhase ?? 'streaming') : 'completed';
    }, [activeStreamingPhase, streamingAssistantMessageId]);

    const renderMessage = React.useCallback(
        (message: ChatMessageEntry) => {
            const assistantIndex = assistantIndexById.get(message.messageId) ?? -1;
            const isAssistantMessage = assistantIndex >= 0;
            const isFirstAssistant = assistantIndex === 0;
            const isLastAssistant = assistantIndex === turn.assistantMessages.length - 1;
            const isActivityOwner = Boolean(activityOwnerMessageId) && message.messageId === activityOwnerMessageId;
            const shouldAttachFullTurnContext = chatRenderMode === 'sorted'
                ? isAssistantMessage
                : (isActivityOwner || isFirstAssistant || isLastAssistant);
            const assistantHeaderMessageId = turn.assistantMessages[0]?.messageId ?? turn.headerMessageId;

            const previousMessage = isAssistantMessage && isFirstAssistant ? turn.userMessage : undefined;
            const nextMessage = isAssistantMessage && isLastAssistant ? nextEntryFirstMessage : undefined;

            let turnGroupingContext: TurnGroupingContext | undefined;
            if (isAssistantMessage) {
                turnGroupingContext = {
                    turnId: turn.turnId,
                    activityOwnerMessageId,
                    snapshotTurnId,
                    isFirstAssistantInTurn: isFirstAssistant,
                    isLastAssistantInTurn: isLastAssistant,
                    hasEarlierAssistantText: chatRenderMode === 'live' && isLastAssistant && turnEarlierAssistantText.length > 0,
                    earlierAssistantText: isLastAssistant && turnEarlierAssistantText.length > 0 ? turnEarlierAssistantText : undefined,
                    opensAnswerText: firstTextAssistantIndex < 0 ? isFirstAssistant : assistantIndex === firstTextAssistantIndex,
                    isLatestTurn: isLastTurn,
                    isWorking: isLastTurn && sessionIsWorking && message.messageId === streamingAssistantMessageId,
                    hasTools: turn.hasTools,
                    hasReasoning: turn.hasReasoning,
                };
                if (shouldAttachFullTurnContext) {
                    turnGroupingContext.summaryBody = turnGroupingContextBase.summaryBody;
                    turnGroupingContext.activityParts = turnGroupingContextBase.activityParts;
                    turnGroupingContext.activityGroupSegments = turnGroupingContextBase.activityGroupSegments;
                    turnGroupingContext.headerMessageId = turnGroupingContextBase.headerMessageId;
                    turnGroupingContext.diffStats = turnGroupingContextBase.diffStats;
                    turnGroupingContext.changedFiles = turnGroupingContextBase.changedFiles;
                    turnGroupingContext.userMessageCreatedAt = turnGroupingContextBase.userMessageCreatedAt;
                    if (chatRenderMode === 'sorted') {
                        turnGroupingContext.isGroupExpanded = isGroupExpanded;
                        turnGroupingContext.toggleGroup = onToggleGroup;
                    }
                }
            }
            return (
                <MessageRow
                    key={message.messageId}
                    message={message}
                    previousMessage={previousMessage}
                    nextMessage={nextMessage}
                    turnGroupingContext={turnGroupingContext}
                    assistantHeaderMessageId={assistantHeaderMessageId}
                    isInActiveTurn={Boolean(streamingAssistantMessageId) && message.messageId === streamingAssistantMessageId}
                    activeStreamingPhase={message.messageId === streamingAssistantMessageId ? activeStreamingPhase : null}
                    reviewTransferDirection={reviewTransferDirection}
                    animateUserOnMount={shouldAnimateUserMessage(message)}
                    onUserAnimationConsumed={onUserAnimationConsumed}
                    scrollToBottom={scrollToBottom}
                />
            );
        },
        [
            activeStreamingPhase,
            activityOwnerMessageId,
            assistantIndexById,
            chatRenderMode,
            firstTextAssistantIndex,
            isGroupExpanded,
            isLastTurn,
            nextEntryFirstMessage,
            onToggleGroup,
            onUserAnimationConsumed,
            reviewTransferDirection,
            scrollToBottom,
            sessionIsWorking,
            shouldAnimateUserMessage,
            snapshotTurnId,
            streamingAssistantMessageId,
            turn.hasReasoning,
            turn.hasTools,
            turn.assistantMessages,
            turn.headerMessageId,
            turn.turnId,
            turn.userMessage,
            turnEarlierAssistantText,
            turnGroupingContextBase,
        ],
    );

    return { renderMessage, streamPhaseOf };
};
