import type React from 'react';
import type { ChatMessageEntry } from '../lib/turns/types';
import type { RenderEntry } from './types';

export const useApprovalFooter = (
    sessionKey: string,
    directory: string | undefined,
    baseDisplayMessages: ChatMessageEntry[],
    trailingStreamingEntry: RenderEntry | undefined,
    listFooter: React.ReactNode,
): React.ReactNode => {
    void sessionKey;
    void directory;
    void baseDisplayMessages;
    void trailingStreamingEntry;
    return listFooter;
};
