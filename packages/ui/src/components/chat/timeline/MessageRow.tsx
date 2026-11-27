import React from 'react';

import ChatMessage from '../ChatMessage';
import { areOptionalRenderRelevantMessagesEqual, areRelevantTurnGroupingContextsEqual, areRenderRelevantMessagesEqual } from '../message/renderCompare';
import type { ChatMessageEntry, TurnGroupingContext } from '../lib/turns/types';
import type { ReviewTransferDirection } from '@/lib/reviewFlow';
import type { StreamPhase } from '../message/types';
import { isVisibleSystemNoticeMessage } from './useDisplayMessages';

interface MessageRowProps {
    message: ChatMessageEntry;
    previousMessage?: ChatMessageEntry;
    nextMessage?: ChatMessageEntry;
    turnGroupingContext?: TurnGroupingContext;
    assistantHeaderMessageId?: string;
    isInActiveTurn?: boolean;
    activeStreamingPhase?: StreamPhase | null;
    animateUserOnMount?: boolean;
    onUserAnimationConsumed?: (messageId: string) => void;
    scrollToBottom?: () => void;
    reviewTransferDirection?: ReviewTransferDirection | null;
    isFirstRow?: boolean;
}

export const MessageRow = React.memo<MessageRowProps>(({
    message,
    previousMessage,
    nextMessage,
    turnGroupingContext,
    assistantHeaderMessageId,
    isInActiveTurn,
    activeStreamingPhase,
    animateUserOnMount,
    onUserAnimationConsumed,
    scrollToBottom,
    reviewTransferDirection,
}) => {
    void scrollToBottom;
    if (message.role === 'system' && !isVisibleSystemNoticeMessage(message)) return null;

    return (
        <ChatMessage
            message={message}
            previousMessage={previousMessage}
            nextMessage={nextMessage}
            animateUserOnMount={animateUserOnMount}
            onUserAnimationConsumed={onUserAnimationConsumed}
            turnGroupingContext={turnGroupingContext}
            assistantHeaderMessageId={assistantHeaderMessageId}
            isInActiveTurn={isInActiveTurn}
            activeStreamingPhase={activeStreamingPhase}
            reviewTransferDirection={reviewTransferDirection}
        />
    );
}, (prev, next) => {
    const prevTurn = prev.turnGroupingContext;
    const nextTurn = next.turnGroupingContext;

    return areRenderRelevantMessagesEqual(
        { info: prev.message, parts: prev.message.parts },
        { info: next.message, parts: next.message.parts },
    )
        && areOptionalRenderRelevantMessagesEqual(
            prev.previousMessage ? { info: prev.previousMessage, parts: prev.previousMessage.parts } : undefined,
            next.previousMessage ? { info: next.previousMessage, parts: next.previousMessage.parts } : undefined,
        )
        && areOptionalRenderRelevantMessagesEqual(
            prev.nextMessage ? { info: prev.nextMessage, parts: prev.nextMessage.parts } : undefined,
            next.nextMessage ? { info: next.nextMessage, parts: next.nextMessage.parts } : undefined,
        )
        && prev.animateUserOnMount === next.animateUserOnMount
        && prev.onUserAnimationConsumed === next.onUserAnimationConsumed
        && prev.scrollToBottom === next.scrollToBottom
        && areRelevantTurnGroupingContextsEqual(prevTurn, nextTurn, prev.message.messageId, prev.message.role === 'user')
        && prev.assistantHeaderMessageId === next.assistantHeaderMessageId
        && prev.isInActiveTurn === next.isInActiveTurn
        && prev.activeStreamingPhase === next.activeStreamingPhase
        && prev.reviewTransferDirection === next.reviewTransferDirection
        && prev.isFirstRow === next.isFirstRow;
});

MessageRow.displayName = 'MessageRow';
