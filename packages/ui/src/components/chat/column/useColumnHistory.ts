import React from 'react';
import type { Message } from '@openchamber/agent-contract';
import { useSessionMessageLoader } from '@/sync/sync-context';
import { useChatTimelineController } from '../hooks/useChatTimelineController';
import type { MessageListHandle } from '../timeline/types';

type TimelineControllerArgs = Parameters<typeof useChatTimelineController>[0];

export const useColumnHistory = ({
    active,
    currentSessionId,
    currentSessionKey,
    effectiveSessionDirectory,
    messageLoader,
    sessionMessages,
    historyMeta,
    sessionIsWorking,
    scrollRef,
    scrollNode,
    messageListRef,
    loadMoreMessages,
    goToBottom,
    onManualNavigation,
    isPinned,
    showScrollButton,
    nearContentStart,
    activeTurnChangeRef,
    loadHistoryUntilMessageRef,
}: {
    active: boolean;
    currentSessionId: string | null;
    currentSessionKey: string | null;
    effectiveSessionDirectory: string | undefined;
    messageLoader: ReturnType<typeof useSessionMessageLoader>;
    sessionMessages: Message[];
    historyMeta: TimelineControllerArgs['historyMeta'];
    sessionIsWorking: boolean;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    scrollNode: HTMLElement | null;
    messageListRef: React.RefObject<MessageListHandle | null>;
    loadMoreMessages: TimelineControllerArgs['loadMoreMessages'];
    goToBottom: TimelineControllerArgs['goToBottom'];
    onManualNavigation: () => void;
    isPinned: boolean;
    showScrollButton: boolean;
    nearContentStart: boolean;
    activeTurnChangeRef: React.RefObject<(turnId: string | null) => void>;
    loadHistoryUntilMessageRef: React.RefObject<(messageId: string, maxBatches: number) => Promise<boolean>>;
}) => {
    void active;
    void sessionIsWorking;

    const timelineController = useChatTimelineController({
        sessionId: currentSessionId,
        sessionKey: currentSessionKey,
        messages: sessionMessages,
        historyMeta,
        scrollRef,
        messageListRef,
        loadMoreMessages,
        goToBottom,
        releaseAutoFollow: onManualNavigation,
        isPinned,
        showScrollButton,
    });

    React.useEffect(() => {
        if (isPinned || !currentSessionId || !effectiveSessionDirectory) return;
        return messageLoader.retainSessionHistory({ directory: effectiveSessionDirectory, sessionId: currentSessionId }, 'read');
    }, [currentSessionId, effectiveSessionDirectory, isPinned, messageLoader]);

    const handleHistoryScroll = timelineController.handleHistoryScroll;
    React.useEffect(() => {
        if (!scrollNode) return;
        const onScroll = () => handleHistoryScroll();
        scrollNode.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            scrollNode.removeEventListener('scroll', onScroll);
        };
    }, [handleHistoryScroll, scrollNode]);

    const resumeToLatestInstant = React.useCallback(() => {
        goToBottom('instant');
    }, [goToBottom]);

    const showLoadOlderButton = timelineController.historySignals.canLoadEarlier && nearContentStart;
    const timelineLoadEarlier = timelineController.loadEarlier;
    const handleLoadOlderClick = React.useCallback(() => {
        onManualNavigation();
        void timelineLoadEarlier({ userInitiated: true });
    }, [onManualNavigation, timelineLoadEarlier]);

    React.useEffect(() => {
        activeTurnChangeRef.current = timelineController.handleActiveTurnChange;
    }, [activeTurnChangeRef, timelineController.handleActiveTurnChange]);

    const controllerLoadHistoryUntilMessage = timelineController.loadHistoryUntilMessage;
    loadHistoryUntilMessageRef.current = async (messageId, maxBatches) => {
        const release = currentSessionId && effectiveSessionDirectory
            ? messageLoader.retainSessionHistory({ directory: effectiveSessionDirectory, sessionId: currentSessionId }, 'read')
            : null;
        try {
            return await controllerLoadHistoryUntilMessage(messageId, { maxBatches });
        } finally {
            release?.();
        }
    };

    return {
        timelineController,
        controllerLoadHistoryUntilMessage,
        resumeToLatestInstant,
        showLoadOlderButton,
        handleLoadOlderClick,
    };
};
