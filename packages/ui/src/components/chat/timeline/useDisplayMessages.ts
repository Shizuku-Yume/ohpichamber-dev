import React from 'react';

import { getNormalizedMessageForDisplay } from '../lib/messageDisplayNormalization';
import { streamPerfMeasure } from '@/stores/utils/streamDebug';
import type { ChatMessageEntry } from '../lib/turns/types';
import type { RetryOverlay } from './types';

export const isVisibleSystemNoticeMessage = (message: ChatMessageEntry): boolean => (
    message.role === 'system'
    && message.parts.some((part) => part.type === 'notice' && part.noticeType === 'async_job_result')
);

export const useDisplayMessages = (
    messages: ChatMessageEntry[],
    sessionKey: string,
    directory: string | undefined,
    retryOverlay: RetryOverlay | null,
) => {
    void sessionKey;
    void directory;
    void retryOverlay;

    const baseDisplayMessages = React.useMemo(() => streamPerfMeasure('ui.message_list.base_display_ms', () => {
        const seenIds = new Set<string>();
        const latestById = new Map<string, ChatMessageEntry>();
        const dedupedMessages: ChatMessageEntry[] = [];

        for (const message of messages) {
            if (message.role === 'system' && !isVisibleSystemNoticeMessage(message)) {
                continue;
            }
            latestById.set(message.messageId, message);
        }

        for (const message of messages) {
            if (message.role === 'system' && !isVisibleSystemNoticeMessage(message)) {
                continue;
            }
            const messageId = message.messageId;
            if (seenIds.has(messageId)) {
                continue;
            }
            seenIds.add(messageId);
            dedupedMessages.push(getNormalizedMessageForDisplay(latestById.get(messageId) ?? message));
        }

        return dedupedMessages;
    }), [messages]);

    return { baseDisplayMessages, displayMessages: baseDisplayMessages };
};
