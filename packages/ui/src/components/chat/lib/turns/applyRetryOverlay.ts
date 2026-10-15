import type { ChatMessageEntry } from './types';

const resolveMessageRole = (message: ChatMessageEntry): string => message.role;

interface RetryOverlayInput {
    sessionId: string | null;
    message: string;
    confirmedAt?: number;
    fallbackTimestamp: number;
}

export const applyRetryOverlay = (
    messages: ChatMessageEntry[],
    input: RetryOverlayInput,
): ChatMessageEntry[] => {
    if (!input.sessionId) {
        return messages;
    }

    const retryError: NonNullable<ChatMessageEntry['retryError']> = {
        name: 'SessionRetry',
        message: input.message,
        data: { message: input.message },
    };

    let lastUserIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (resolveMessageRole(messages[index]) === 'user') {
            lastUserIndex = index;
            break;
        }
    }

    if (lastUserIndex < 0) {
        return messages;
    }

    let targetAssistantIndex = -1;
    for (let index = messages.length - 1; index > lastUserIndex; index -= 1) {
        if (resolveMessageRole(messages[index]) === 'assistant') {
            targetAssistantIndex = index;
            break;
        }
    }

    if (targetAssistantIndex >= 0) {
        const existing = messages[targetAssistantIndex];
        if (existing.retryError) {
            return messages;
        }

        return messages.map((message, index) => {
            if (index !== targetAssistantIndex) {
                return message;
            }
            return {
                ...message,
                retryError,
            };
        });
    }

    const eventTime = typeof input.confirmedAt === 'number' ? input.confirmedAt : input.fallbackTimestamp;
    const syntheticId = `synthetic_retry_notice_${input.sessionId}`;
    const synthetic: ChatMessageEntry = {
        messageId: syntheticId,
        sessionId: input.sessionId,
        turnId: messages[lastUserIndex].turnId,
        role: 'assistant',
        createdAt: eventTime,
        retryError,
        parts: [],
    };

    const next = messages.slice();
    next.splice(lastUserIndex + 1, 0, synthetic);
    return next;
};
