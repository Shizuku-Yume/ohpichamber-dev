import React from 'react';
import type { Message, SessionRuntimeStatus, Turn } from '@openchamber/agent-contract';
import { useConfigStore } from '@/stores/useConfigStore';
import { useMessageTTS } from '@/hooks/useMessageTTS';
import { useAutoReadAloud } from '@/hooks/useAutoReadAloud';
import { findLatestCompletedReply } from '@/lib/messages/latestReply';

export const useColumnAutoReadAloud = ({
    pinned,
    readOnly = false,
    currentSessionKey,
    ready,
    sessionIsWorking,
    sessionStatusType,
    sessionMessages,
    sessionTurns,
}: {
    pinned: boolean;
    readOnly?: boolean;
    currentSessionKey: string | null;
    ready: boolean;
    sessionIsWorking: boolean;
    sessionStatusType: SessionRuntimeStatus | undefined;
    sessionMessages: readonly Message[];
    sessionTurns: readonly Turn[];
}): void => {
    const latestCompletedReply = React.useMemo(
        () => findLatestCompletedReply(sessionTurns, sessionMessages),
        [sessionMessages, sessionTurns],
    );
    const autoReadAloudEnabled = useConfigStore((state) => state.autoReadAloudEnabled);
    const { play: playAutoReadAloud } = useMessageTTS(latestCompletedReply?.messageId);
    const sessionIsActive = sessionIsWorking
        || sessionStatusType === 'running'
        || sessionStatusType === 'awaiting_approval'
        || sessionStatusType === 'awaiting_input';
    useAutoReadAloud({
        sessionKey: currentSessionKey ?? '',
        ready,
        sessionIsActive,
        reply: latestCompletedReply,
        turns: sessionTurns,
        enabled: autoReadAloudEnabled && !pinned && !readOnly,
        play: playAutoReadAloud,
    });
};
