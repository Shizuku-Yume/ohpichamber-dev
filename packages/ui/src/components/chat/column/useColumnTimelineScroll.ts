import React from 'react';
import { z } from 'zod';
import type { Message } from '@openchamber/agent-contract';
import { useChatTimelineScroll, type LinkedMessageState } from '@/hooks/useChatTimelineScroll';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageListHandle } from '../timeline/types';
import type { TimelineRevealGate } from '../timelineRevealGate';

const CHAT_FORCE_SCROLL_BOTTOM_EVENT = 'openchamber:chat-force-scroll-bottom';
const forceScrollDetailSchema = z.object({ sessionId: z.string().optional() });
export const useColumnTimelineScroll = ({
    pinned,
    currentSessionId,
    currentSessionKey,
    composerOverlayHeight,
    messageListRef,
    sessionMessages,
    sessionIsWorking,
    revealGate,
}: {
    pinned: boolean;
    currentSessionId: string | null;
    currentSessionKey: string | null;
    composerOverlayHeight: number;
    messageListRef: React.RefObject<MessageListHandle | null>;
    sessionMessages: readonly Message[];
    sessionIsWorking: boolean;
    revealGate: TimelineRevealGate;
}) => {
    const { t } = useI18n();
    const activeTurnChangeRef = React.useRef<(turnId: string | null) => void>(() => { });
    const handleActiveTurnChange = React.useCallback((turnId: string | null) => {
        activeTurnChangeRef.current(turnId);
    }, []);
    const loadHistoryUntilMessageRef = React.useRef<(messageId: string, maxBatches: number) => Promise<boolean>>(async () => false);
    const currentSessionKeyRef = React.useRef(currentSessionKey);
    currentSessionKeyRef.current = currentSessionKey;
    const loadHistoryUntilMessage = React.useCallback(
        (messageId: string, maxBatches: number) => loadHistoryUntilMessageRef.current(messageId, maxBatches),
        [],
    );
    const handleLinkedMessageMissing = React.useCallback(() => {
        toast.info(t('chat.messageLink.notFound'));
    }, [t]);
    const checkLinkedMessage = React.useCallback(async (messageId: string): Promise<LinkedMessageState> => {
        return sessionMessages.some((message) => message.messageId === messageId) ? 'exists' : 'unknown';
    }, [sessionMessages]);
    const scroll = useChatTimelineScroll({
        currentSessionId,
        currentSessionKey,
        composerOverlayHeight,
        messageListRef,
        loadHistoryUntilMessage,
        checkLinkedMessage,
        onLinkedMessageMissing: handleLinkedMessageMissing,
        sessionIsWorking,
        pinned,
        revealGate,
        onActiveTurnChange: handleActiveTurnChange,
    });
    const { goToBottom } = scroll;

    React.useEffect(() => {
        if (globalThis.window === undefined || !currentSessionId) return;

        const handleForceScrollBottom = (event: Event) => {
            const detail = event instanceof CustomEvent ? forceScrollDetailSchema.safeParse(event.detail).data : undefined;
            if (detail?.sessionId && detail.sessionId !== currentSessionId) return;
            goToBottom('instant');
        };

        window.addEventListener(CHAT_FORCE_SCROLL_BOTTOM_EVENT, handleForceScrollBottom);
        return () => {
            window.removeEventListener(CHAT_FORCE_SCROLL_BOTTOM_EVENT, handleForceScrollBottom);
        };
    }, [currentSessionId, goToBottom]);

    return {
        ...scroll,
        activeTurnChangeRef,
        loadHistoryUntilMessageRef,
        currentSessionKeyRef,
        checkLinkedMessage,
        handleLinkedMessageMissing,
    };
};
