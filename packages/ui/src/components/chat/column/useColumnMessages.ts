import React from 'react';
import type { Message, Turn } from '@openchamber/agent-contract';
import { useStreamingStore } from '@/sync/streaming';
import {
    useDirectorySync,
    useSessionMessageRecords,
    useSessionMessageLoadState,
    useSessionRenderable,
} from '@/sync/sync-context';
import { createFirstVisibleSessionPerformanceTracker } from '@/sync/session-load-performance';

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_TURNS: readonly Turn[] = [];

export const useColumnMessages = ({
    active,
    currentSessionId,
    currentSessionKey,
    effectiveSessionDirectory,
}: {
    active: boolean;
    currentSessionId: string | null;
    currentSessionKey: string | null;
    effectiveSessionDirectory: string | undefined;
}) => {
    const streamingMessageId = useStreamingStore(
        React.useCallback(
            (s) => (currentSessionId ? s.streamingMessageIds.get(currentSessionId) ?? null : null),
            [currentSessionId],
        ),
    );
    const activeStreamingPhase = useStreamingStore(
        React.useCallback(
            (s) => {
                if (!streamingMessageId) return null;
                return s.messageStreamStates.get(streamingMessageId)?.phase ?? null;
            },
            [streamingMessageId],
        ),
    );
    const hasRenderableSessionSnapshot = useSessionRenderable(currentSessionId ?? '', effectiveSessionDirectory);
    const sessionMessageRecords = useSessionMessageRecords(currentSessionId ?? '', effectiveSessionDirectory, {
        enabled: active,
        suspendPartUpdates: Boolean(streamingMessageId),
        suspendPartUpdatesForMessageId: streamingMessageId,
    });
    const sessionMessages = currentSessionId ? sessionMessageRecords : EMPTY_MESSAGES;
    const sessionTurns = useDirectorySync(
        React.useCallback((state) => (currentSessionId ? state.snapshot[currentSessionId]?.turns ?? EMPTY_TURNS : EMPTY_TURNS), [currentSessionId]),
        effectiveSessionDirectory,
    );
    const sessionMessageLoadState = useSessionMessageLoadState(
        currentSessionId ?? '',
        effectiveSessionDirectory,
    );
    const [firstVisiblePerformance] = React.useState(createFirstVisibleSessionPerformanceTracker);

    React.useEffect(() => {
        if (!active || !currentSessionKey || !hasRenderableSessionSnapshot || sessionMessages.length === 0) return;
        return firstVisiblePerformance.schedule(currentSessionKey, sessionMessages.length);
    }, [active, currentSessionKey, firstVisiblePerformance, hasRenderableSessionSnapshot, sessionMessages.length]);

    const historyMeta = React.useMemo(() => {
        if (!currentSessionId) return null;
        return {
            limit: sessionMessages.length,
            complete: sessionMessageLoadState.complete || !sessionMessageLoadState.cursor,
            loading: sessionMessageLoadState.status === 'loading',
        };
    }, [currentSessionId, sessionMessageLoadState.complete, sessionMessageLoadState.cursor, sessionMessageLoadState.status, sessionMessages.length]);

    return {
        streamingMessageId,
        activeStreamingPhase,
        hasRenderableSessionSnapshot,
        sessionMessages,
        sessionTurns,
        sessionMessageLoadState,
        historyMeta,
    };
};
