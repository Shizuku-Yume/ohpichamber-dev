import { holdPartialTableRow } from '../../lib/streamTextCommit';
import type { StreamPhase } from '../types';

// external: #3277 Part finalization releases text even while the message waits on a question or permission.
export const resolveAssistantTextStreaming = (input: {
    streamPhase: StreamPhase;
    chatRenderMode: 'sorted' | 'live';
    isFinalized: boolean;
}): boolean => {
    if (input.isFinalized) {
        return false;
    }
    return input.chatRenderMode === 'live' && input.streamPhase === 'streaming';
};

export const resolveAssistantDisplayText = (input: {
    textContent: string;
    throttledTextContent: string;
    isStreaming: boolean;
}): string => {
    return input.isStreaming
        ? holdPartialTableRow(input.throttledTextContent)
        : input.textContent;
};

export const shouldRenderAssistantText = (input: {
    displayTextContent: string;
    isFinalized: boolean;
}): boolean => {
    if (!input.isFinalized && input.displayTextContent.trim().length === 0) {
        return false;
    }
    return input.displayTextContent.trim().length > 0;
};
