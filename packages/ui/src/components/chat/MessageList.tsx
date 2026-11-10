import React from 'react';
import { LegendList, type LegendListRef } from '@legendapp/list/react';

import ChatMessage from './ChatMessage';
import { filterVisibleParts, isEmptyTextPart } from './message/partUtils';
import { areOptionalRenderRelevantMessagesEqual, areRelevantTurnGroupingContextsEqual, areRenderRelevantMessagesEqual } from './message/renderCompare';
import TurnItem from './components/TurnItem';
import { turnHeaderCanStick } from './lib/turns/stickyPrompt';
import { TurnFold, TurnPagesRow } from './components/LiveTurnActivity';
import { useTurnFoldContexts } from './components/useTurnFold';
import { LiveFinalActivityContext, LiveTurnHoistedPagesContext } from './components/liveActivityContext';
import { MessageSliceContext } from './message/messageSliceContext';
import { PendingWorkflowApprovals } from './workflows/PendingWorkflowApprovals';
import { getTurnsWithLaterAssistant, uiPageMessageId } from './lib/turns/liveActivity';
import type { ChatMessageEntry, TurnRecord, TurnGroupingContext } from './lib/turns/types';
import { useTurnRecords } from './hooks/useTurnRecords';
import { buildHistoryEntries, type TimelineEntry } from './lib/turns/timelineEntries';
import { buildLiveStreamingEntry } from './lib/turns/streamingTailEntry';
<<<<<<< HEAD
import { FULL_MESSAGE_WINDOW, TurnMessageWindowContext, createTurnMessageWindowStore } from './lib/turns/turnMessageWindow';
import { attachToolResultsForDisplay, getNormalizedMessageForDisplay } from './lib/messageDisplayNormalization';
import { useUIStore } from '@/stores/useUIStore';
import { turnHeaderCanStick as canStickPrompt } from './lib/turns/stickyPrompt';
=======
import { buildTimelineRows, type TimelineRow } from './lib/turns/timelineRows';
import { getNormalizedMessageForDisplay } from './lib/messageDisplayNormalization';
import { attachSyntheticContext } from './lib/attachSyntheticContext';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
>>>>>>> bc50ba56a
import { FadeInDisabledProvider } from './message/FadeInOnReveal';
import { hasPendingUserSendAnimation, consumePendingUserSendAnimation } from '@/lib/userSendAnimation';
import { streamPerfCount, streamPerfMark, streamPerfMeasure } from '@/stores/utils/streamDebug';
import type { StreamPhase } from './message/types';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionPartsForMessages } from '@/sync/sync-context';
import type { ReviewTransferDirection } from '@/lib/reviewFlow';
import { resolveTimelineIsAtEnd } from './lib/scroll/timelineScrollAnchoring';
import { estimateTimelineRowSize, type RowSizeMetrics } from './lib/turns/rowSizeEstimate';
import { onNavigationRelease } from './lib/scroll/timelineScrollIntent';
import { useSelectionRowHold } from './lib/scroll/selectionRowHold';
import { isReasoningRevealTarget } from './search/reasoningReveal';
import {
    ANCHOR_HOLD_MAX_FRAMES,
    ANCHOR_HOLD_STABLE_FRAMES,
    captureMessageViewportAnchor,
    type MessageViewportAnchor,
    type ViewportAnchorAlignment,
} from './lib/scroll/messageViewportAnchor';

const EMPTY_STATIC_ENTRY_MESSAGES: ChatMessageEntry[] = [];
const EMPTY_UNGROUPED_MESSAGE_IDS = new Set<string>();
const EMPTY_ROW_MESSAGE_IDS: readonly string[] = [];

// --- Timeline virtualization (@legendapp/list) -----------------------------
// The timeline is a single virtualized list on every surface: history turns
// AND the live streaming tail are rows of the same list, so the list owns one
// coherent scroll position instead of arbitrating between a virtualizer and a
// separately-rendered tail.
const TIMELINE_ESTIMATED_ENTRY_SIZE = 320;

// Presentation-only props forwarded to the scroll container the list renders.
// Deliberately narrow: the list owns scroll and layout callbacks on that
// element, so only styling, focus and click-through are caller-controlled.
type TimelineScrollContainerProps = {
    className?: string;
    style?: React.CSSProperties;
    tabIndex?: number;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
    'data-scrollbar'?: string;
    'data-scroll-shadow'?: string;
};

const useStableEvent = <TArgs extends unknown[], TResult>(handler: (...args: TArgs) => TResult) => {
    const handlerRef = React.useRef(handler);
    React.useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    return React.useCallback((...args: TArgs) => handlerRef.current(...args), []);
};

interface MessageListProps {
    sessionKey: string;
    messages: ChatMessageEntry[];
    sessionIsWorking?: boolean;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
    /** Canonical messages carry no retry record; retained for the chat caller contract. */
    retryOverlay?: {
        sessionId: string;
        message: string;
        confirmedAt?: number;
        fallbackTimestamp?: number;
    } | null;
    isLoadingOlder: boolean;
    scrollToBottom?: () => void;
    directory?: string;
    registerList?: (list: LegendListRef | null) => void;
    endPinningReleased?: boolean;
    composerOverlayHeight?: number;
    onIsAtEndChange?: (isAtEnd: boolean) => void;
    onListMetricsChange?: (metrics: { readonly headerSize: number; readonly footerSize: number }) => void;
    onTimelineDataChange?: () => void;
    listHeader?: React.ReactNode;
    listFooter?: React.ReactNode;
    scrollContainerProps?: TimelineScrollContainerProps;
}

export interface MessageListHandle {
    resolveUiPageMessageId: (messageId: string, partId: string) => string;
    scrollToUiPageRow: (messageId: string) => boolean;
    scrollToTurnId: (turnId: string, options?: { behavior?: ScrollBehavior }) => boolean;
    scrollToMessageId: (messageId: string, options?: { behavior?: ScrollBehavior }) => boolean;
    captureViewportAnchor: () => MessageViewportAnchor | null;
    restoreViewportAnchor: (anchor: MessageViewportAnchor) => boolean;
    alignViewportAnchor: (anchor: MessageViewportAnchor) => ViewportAnchorAlignment;
    holdViewportAnchor: (anchor: { messageId: string; offsetTop: number }) => void;
    isHistoryVirtualized: () => boolean;
    scrollToBottom: () => void;
}

type RenderEntry = TimelineEntry;
type RenderRow = TimelineRow;
type TurnEntry = Extract<RenderEntry, { kind: 'turn' }>;

type TurnUiState = { isExpanded: boolean; isLiveExpanded?: boolean };
type ToggleTurnGroup = (turnId: string, mode?: 'sorted' | 'live') => void;

// Turn group expansion outlives the list, like tool expansion in ChatMessage:
// returning to a session shows its groups as they were left, which a restored
// reading position inside an expanded group depends on. Turn IDs are message
// IDs, unique across sessions. The defaults change meaning with the activity
// render mode, so a mode switch drops everything.
const TURN_UI_STATE_CACHE_MAX = 4000;
const turnUiStateCache = new Map<string, TurnUiState>();
let turnUiStateCacheMode: string | null = null;

const readTurnUiStateCache = (activityRenderMode: string): Map<string, TurnUiState> => {
    if (turnUiStateCacheMode !== activityRenderMode) {
        turnUiStateCache.clear();
        turnUiStateCacheMode = activityRenderMode;
    }
    return new Map(turnUiStateCache);
};

const writeTurnUiStateCache = (turnId: string, state: TurnUiState): void => {
    turnUiStateCache.delete(turnId);
    turnUiStateCache.set(turnId, state);
    if (turnUiStateCache.size > TURN_UI_STATE_CACHE_MAX) {
        const oldest = turnUiStateCache.keys().next().value;
        if (oldest !== undefined) turnUiStateCache.delete(oldest);
    }
};

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
    reviewTransferDirection?: ReviewTransferDirection | null;
}

const MessageRow = React.memo<MessageRowProps>(({
    message,
    previousMessage,
    nextMessage,
    turnGroupingContext,
    assistantHeaderMessageId,
    isInActiveTurn,
    activeStreamingPhase,
    animateUserOnMount,
    onUserAnimationConsumed,
    reviewTransferDirection,
}) => {
    if (message.role === 'system') return null;

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
            { info: next.message, parts: next.message.parts }
        )
        && areOptionalRenderRelevantMessagesEqual(
            prev.previousMessage ? { info: prev.previousMessage, parts: prev.previousMessage.parts } : undefined,
            next.previousMessage ? { info: next.previousMessage, parts: next.previousMessage.parts } : undefined
        )
        && areOptionalRenderRelevantMessagesEqual(
            prev.nextMessage ? { info: prev.nextMessage, parts: prev.nextMessage.parts } : undefined,
            next.nextMessage ? { info: next.nextMessage, parts: next.nextMessage.parts } : undefined
        )
        && prev.animateUserOnMount === next.animateUserOnMount
        && prev.onUserAnimationConsumed === next.onUserAnimationConsumed
        && areRelevantTurnGroupingContextsEqual(prevTurn, nextTurn, prev.message.messageId, prev.message.role === 'user')
        && prev.assistantHeaderMessageId === next.assistantHeaderMessageId
        && prev.isInActiveTurn === next.isInActiveTurn
        && prev.activeStreamingPhase === next.activeStreamingPhase
        && prev.reviewTransferDirection === next.reviewTransferDirection;
});

MessageRow.displayName = 'MessageRow';

interface TurnRendererInput {
    turn: TurnRecord;
    isLastTurn: boolean;
    nextEntryFirstMessage?: ChatMessageEntry;
    sessionIsWorking: boolean;
<<<<<<< HEAD
    defaultActivityExpanded: boolean;
    turnUiStates: Map<string, TurnUiState>;
    onToggleTurnGroup: ToggleTurnGroup;
    chatRenderMode: 'sorted' | 'live';
    stickyUserHeader?: boolean;
=======
    scrollToBottom?: () => void;
>>>>>>> bc50ba56a
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
    reviewTransferDirection?: ReviewTransferDirection | null;
}

<<<<<<< HEAD
=======
/** Draws any message of a turn with the turn-wide context it needs; every row of the turn uses it. */
const useTurnMessageRenderer = ({
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
}: TurnRendererInput) => {
    const streamingAssistantMessageId = React.useMemo(() => {
        if (activeStreamingMessageId && turn.assistantMessages.some((assistant) => assistant.info.id === activeStreamingMessageId)) {
            return activeStreamingMessageId;
        }

        for (let index = turn.assistantMessages.length - 1; index >= 0; index -= 1) {
            const assistant = turn.assistantMessages[index];
            if (!isAssistantMessageCompleted(assistant)) {
                return assistant.info.id;
            }
        }

        return null;
    }, [activeStreamingMessageId, turn.assistantMessages]);

    const turnEarlierAssistantText = React.useMemo(
        () => earlierAssistantText(turn.assistantMessages),
        [turn.assistantMessages]
    );

    const assistantIndexById = React.useMemo(() => {
        const ids = new Map<string, number>();
        turn.assistantMessages.forEach((assistant, index) => {
            ids.set(assistant.info.id, index);
        });
        return ids;
    }, [turn.assistantMessages]);

    const turnIsInActiveStream = React.useMemo(() => {
        return turnContainsMessageId(turn, streamingAssistantMessageId);
    }, [turn, streamingAssistantMessageId]);

    // Besides the first and the last message, the step streaming right now
    // also gets the turn-wide context.
    const activityOwnerMessageId = React.useMemo(() => {
        if (turnIsInActiveStream && streamingAssistantMessageId) {
            return streamingAssistantMessageId;
        }
        return turn.assistantMessages[0]?.info.id;
    }, [streamingAssistantMessageId, turnIsInActiveStream, turn.assistantMessages]);

    const turnGroupingContextBase = React.useMemo(() => {
        const userCreatedAt = (turn.userMessage.info.time as { created?: number } | undefined)?.created;
        // The variant lives on the assistant message that ran with it, not on
        // the prompt. Take the turn's first assistant step: later steps of the
        // same turn run with the same selection, and it is available before
        // the final answer exists.
        let assistantVariant: string | undefined;
        for (const entry of turn.assistantMessages) {
            const variant = entry.info.role === 'assistant' ? entry.info.variant?.trim() : undefined;
            if (variant) {
                assistantVariant = variant;
                break;
            }
        }
        return {
            turnId: turn.turnId,
            summaryBody: turn.summaryText,
            activityParts: turn.activityParts,
            headerMessageId: turn.headerMessageId,
            hasTools: turn.hasTools,
            hasReasoning: turn.hasReasoning,
            changedFiles: turn.changedFiles,
            userMessageCreatedAt: typeof userCreatedAt === 'number' ? userCreatedAt : undefined,
            assistantVariant,
        };
    }, [turn.activityParts, turn.changedFiles, turn.hasReasoning, turn.hasTools, turn.headerMessageId, turn.summaryText, turn.turnId, turn.assistantMessages, turn.userMessage.info]);

    return React.useCallback(
        (message: ChatMessageEntry) => {
            const assistantIndex = assistantIndexById.get(message.info.id) ?? -1;
            const isAssistantMessage = assistantIndex >= 0;
            const isFirstAssistant = assistantIndex === 0;
            const isLastAssistant = assistantIndex === turn.assistantMessages.length - 1;
            const isActivityOwner = Boolean(activityOwnerMessageId) && message.info.id === activityOwnerMessageId;
            const shouldAttachFullTurnContext = isActivityOwner || isFirstAssistant || isLastAssistant;
            const assistantHeaderMessageId = turn.assistantMessages[0]?.info.id ?? turn.headerMessageId;

            const nextMessage = isAssistantMessage && isLastAssistant ? nextEntryFirstMessage : undefined;

            const turnGroupingContext = isAssistantMessage
                ? {
                    turnId: turn.turnId,
                    isFirstAssistantInTurn: isFirstAssistant,
                    isLastAssistantInTurn: isLastAssistant,
                    earlierAssistantText: isLastAssistant && turnEarlierAssistantText.length > 0 ? turnEarlierAssistantText : undefined,
                    isLatestTurn: isLastTurn,
                    isWorking: isLastTurn && sessionIsWorking && message.info.id === streamingAssistantMessageId,
                    hasTools: turn.hasTools,
                    hasReasoning: turn.hasReasoning,
                    ...(shouldAttachFullTurnContext ? {
                        summaryBody: turnGroupingContextBase.summaryBody,
                        activityParts: turnGroupingContextBase.activityParts,
                        headerMessageId: turnGroupingContextBase.headerMessageId,
                        changedFiles: turnGroupingContextBase.changedFiles,
                        userMessageCreatedAt: turnGroupingContextBase.userMessageCreatedAt,
                        assistantVariant: turnGroupingContextBase.assistantVariant,
                    } : {}),
                } satisfies TurnGroupingContext
                : undefined;

            return (
                <MessageRow
                    key={message.info.id}
                    message={message}
                    nextMessage={nextMessage}
                    turnGroupingContext={turnGroupingContext}
                    assistantHeaderMessageId={assistantHeaderMessageId}
                    isInActiveTurn={Boolean(streamingAssistantMessageId) && message.info.id === streamingAssistantMessageId}
                    activeStreamingPhase={message.info.id === streamingAssistantMessageId ? activeStreamingPhase : null}
                    reviewTransferDirection={reviewTransferDirection}
                    animateUserOnMount={shouldAnimateUserMessage(message)}
                    onUserAnimationConsumed={onUserAnimationConsumed}
                    scrollToBottom={scrollToBottom}
                />
            );
        },
        [
            isLastTurn,
            nextEntryFirstMessage,
            scrollToBottom,
            sessionIsWorking,
            turn.assistantMessages,
            turn.headerMessageId,
            turn.hasReasoning,
            turn.hasTools,
            turn.turnId,
            turnGroupingContextBase,
            streamingAssistantMessageId,
            activeStreamingPhase,
            reviewTransferDirection,
            assistantIndexById,
            turnEarlierAssistantText,
            activityOwnerMessageId,
            shouldAnimateUserMessage,
            onUserAnimationConsumed,
        ]
    );
};

type TurnRowProps = Omit<TurnRendererInput, 'turn' | 'isLastTurn' | 'nextEntryFirstMessage'> & {
    row: Exclude<RenderRow, { kind: 'ungrouped' }>;
    entry: TurnEntry;
    turnExpansion: Map<string, boolean>;
    onToggleTurnActivity: ToggleTurnActivity;
};

/** One list row of a turn (see `timelineRows.ts` for how a turn splits into rows). */
const TurnRow = React.memo(({
    row,
    entry,
    turnExpansion,
    onToggleTurnActivity,
    ...rendererInput
}: TurnRowProps) => {
    const { turn } = entry;
    const renderMessage = useTurnMessageRenderer({
        ...rendererInput,
        turn,
        isLastTurn: entry.isLastTurn,
        nextEntryFirstMessage: entry.nextEntryFirstMessage,
    });
    const isActivityExpanded = turnExpansion.get(turn.turnId) === true;
    const hasLaterAssistant = entry.hasLaterAssistant === true;
    const foldContexts = useTurnFoldContexts(turn, hasLaterAssistant, isActivityExpanded, row.finalMessageId);
    const handleToggleActivity = React.useCallback(() => {
        onToggleTurnActivity(turn.turnId);
    }, [onToggleTurnActivity, turn.turnId]);

    if (row.kind === 'turn-head') {
        return <TurnItem turn={turn} gapBelow={row.gapBelow} renderMessage={renderMessage} />;
    }

    let content: React.ReactNode = null;
    if (row.kind === 'turn-fold') {
        content = (
            <TurnFold turn={turn} hasLaterAssistant={hasLaterAssistant} expanded={isActivityExpanded}
                finalMessageId={row.finalMessageId} onToggle={handleToggleActivity} renderMessage={renderMessage} />
        );
    } else if (row.kind === 'turn-pages') {
        content = <TurnPagesRow turn={turn} />;
    } else {
        const message = turn.assistantMessages.find((candidate) => candidate.info.id === row.messageId);
        if (message) {
            content = (
                <MessageSliceContext.Provider value={row.slice}>
                    {row.final ? (
                        <LiveFinalActivityContext.Provider value={foldContexts.finalContext}>
                            {renderMessage(message)}
                        </LiveFinalActivityContext.Provider>
                    ) : renderMessage(message)}
                </MessageSliceContext.Provider>
            );
        }
    }

    // Under a fold, a message does not draw the pages the turn hoists.
    const underFold = row.underFold;
    return (
        <div className={cn('relative w-full', row.gapBelow && 'pb-2')} data-turn-row={turn.turnId}>
            {underFold ? (
                <LiveTurnHoistedPagesContext.Provider value={foldContexts.hoistedPages}>{content}</LiveTurnHoistedPagesContext.Provider>
            ) : content}
        </div>
    );
});

TurnRow.displayName = 'TurnRow';

interface UngroupedMessageRowProps {
    message: ChatMessageEntry;
    nextMessage?: ChatMessageEntry;
    isFirstRow?: boolean;
    scrollToBottom?: () => void;
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
    reviewTransferDirection?: ReviewTransferDirection | null;
}

const UngroupedMessageRow = React.memo(({
    message,
    nextMessage,
    isFirstRow,
    scrollToBottom,
    shouldAnimateUserMessage,
    onUserAnimationConsumed,
    activeStreamingMessageId,
    activeStreamingPhase,
    reviewTransferDirection,
}: UngroupedMessageRowProps) => {
    return (
        <MessageRow
            message={message}
            nextMessage={nextMessage}
            animateUserOnMount={shouldAnimateUserMessage(message)}
            onUserAnimationConsumed={onUserAnimationConsumed}
            scrollToBottom={scrollToBottom}
            isInActiveTurn={Boolean(activeStreamingMessageId) && message.info.id === activeStreamingMessageId}
            activeStreamingPhase={message.info.id === activeStreamingMessageId ? activeStreamingPhase : null}
            reviewTransferDirection={reviewTransferDirection}
            isFirstRow={isFirstRow}
        />
    );
});

UngroupedMessageRow.displayName = 'UngroupedMessageRow';

>>>>>>> bc50ba56a
const turnContainsMessageId = (turn: TurnRecord, messageId: string | null | undefined): boolean => {
    if (!messageId) {
        return false;
    }

    if (turn.userMessage.messageId === messageId) {
        return true;
    }

    return turn.assistantMessages.some((assistant) => assistant.messageId === messageId);
};

<<<<<<< HEAD
export const TurnBlock = React.memo(({
    turn,
    hasLaterAssistant = false,
    isLastTurn,
    nextEntryFirstMessage,
    sessionIsWorking,
    defaultActivityExpanded,
    turnUiStates,
    onToggleTurnGroup,
    chatRenderMode,
    stickyUserHeader = true,
    shouldAnimateUserMessage,
    onUserAnimationConsumed,
    activeStreamingMessageId,
    activeStreamingPhase,
    reviewTransferDirection,
}: TurnBlockProps) => {
    const showReasoningTraces = useUIStore((state) => state.showReasoningTraces);
    // A hidden prompt has nothing to pin.
    const turnHeaderCanStick = React.useMemo(
        () => canStickPrompt(turn.userMessage),
        [turn.userMessage]
    );
    const turnUiState = turnUiStates.get(turn.turnId) ?? { isExpanded: defaultActivityExpanded };
    const handleToggleTurnGroup = React.useCallback(() => {
        onToggleTurnGroup(turn.turnId);
    }, [onToggleTurnGroup, turn.turnId]);
    const handleToggleLiveActivity = React.useCallback(() => {
        onToggleTurnGroup(turn.turnId, 'live');
    }, [onToggleTurnGroup, turn.turnId]);

    const messageOrder = React.useMemo(() => {
        const ordered = [turn.userMessage, ...turn.assistantMessages];
        const lookup = new Map<string, number>();
        ordered.forEach((message, index) => {
            lookup.set(message.messageId, index);
        });
        return { ordered, lookup };
    }, [turn.assistantMessages, turn.userMessage]);

    // Authoritative: the streaming store names the one message still producing
    // output. A turn does not infer completion from timestamps or notices.
    const streamingAssistantMessageId = React.useMemo(() => {
        if (!activeStreamingMessageId) return null;
        return turn.assistantMessages.some((assistant) => assistant.messageId === activeStreamingMessageId)
            ? activeStreamingMessageId
            : null;
    }, [activeStreamingMessageId, turn.assistantMessages]);

    const visibleAssistantMessages = React.useMemo(() => {
        if (chatRenderMode === 'live') {
            return turn.assistantMessages;
        }

        const completed = turn.assistantMessages.filter((assistant) => assistant.messageId !== streamingAssistantMessageId);
        if (completed.length === turn.assistantMessages.length) {
            return turn.assistantMessages;
        }

        if (streamingAssistantMessageId) {
            const completedIds = new Set(completed.map((assistant) => assistant.messageId));
            return turn.assistantMessages.filter((assistant) => (
                completedIds.has(assistant.messageId)
                || assistant.messageId === streamingAssistantMessageId
            ));
        }

        if (completed.length > 0) {
            return completed;
        }
        const firstAssistant = turn.assistantMessages[0];
        return firstAssistant ? [firstAssistant] : [];
    }, [chatRenderMode, streamingAssistantMessageId, turn.assistantMessages]);

    const completedAssistantMessages = React.useMemo(() => {
        if (chatRenderMode !== 'sorted') {
            return turn.assistantMessages;
        }
        return streamingAssistantMessageId
            ? turn.assistantMessages.filter((assistant) => assistant.messageId !== streamingAssistantMessageId)
            : turn.assistantMessages;
    }, [chatRenderMode, streamingAssistantMessageId, turn.assistantMessages]);

    const visibleAssistantIds = React.useMemo(() => {
        const ids = new Map<string, number>();
        visibleAssistantMessages.forEach((assistant, index) => {
            ids.set(assistant.messageId, index);
        });
        return ids;
    }, [visibleAssistantMessages]);

    const completedAssistantIdSet = React.useMemo(() => {
        return new Set(completedAssistantMessages.map((assistant) => assistant.messageId));
    }, [completedAssistantMessages]);

    const visibleActivityMessageIdSet = React.useMemo(() => {
        const ids = new Set(completedAssistantIdSet);
        if (streamingAssistantMessageId) {
            ids.add(streamingAssistantMessageId);
        }
        return ids;
    }, [completedAssistantIdSet, streamingAssistantMessageId]);

    const turnIsInActiveStream = React.useMemo(() => {
        return turnContainsMessageId(turn, streamingAssistantMessageId);
    }, [turn, streamingAssistantMessageId]);

    const activityOwnerMessageId = React.useMemo(() => {
        if (turnIsInActiveStream && streamingAssistantMessageId) {
            return streamingAssistantMessageId;
        }
        return visibleAssistantMessages[0]?.messageId;
    }, [streamingAssistantMessageId, turnIsInActiveStream, visibleAssistantMessages]);

    const visibleActivityParts = React.useMemo(() => {
        if (chatRenderMode !== 'sorted') {
            return turn.activityParts;
        }
        if (visibleActivityMessageIdSet.size === turn.assistantMessages.length) {
            return turn.activityParts;
        }
        return turn.activityParts.filter((activity) => visibleActivityMessageIdSet.has(activity.messageId));
    }, [chatRenderMode, visibleActivityMessageIdSet, turn.activityParts, turn.assistantMessages.length]);

    const visibleActivitySegments = React.useMemo(() => {
        if (chatRenderMode !== 'sorted') {
            return turn.activitySegments;
        }
        if (visibleActivityMessageIdSet.size === turn.assistantMessages.length) {
            return turn.activitySegments;
        }
        return turn.activitySegments
            .map((segment) => {
                const parts = segment.parts.filter((activity) => visibleActivityMessageIdSet.has(activity.messageId));
                if (parts.length === 0) {
                    return null;
                }
                const anchorMessageId = visibleActivityMessageIdSet.has(segment.anchorMessageId)
                    ? segment.anchorMessageId
                    : parts[0]?.messageId;
                if (!anchorMessageId) {
                    return null;
                }
                return {
                    ...segment,
                    anchorMessageId,
                    parts,
                };
            })
            .filter((segment): segment is NonNullable<typeof segment> => segment !== null);
    }, [chatRenderMode, visibleActivityMessageIdSet, turn.activitySegments, turn.assistantMessages.length]);

    const turnGroupingContextBase = React.useMemo(() => {
        return {
            turnId: turn.turnId,
            summaryBody: turn.summaryText,
            activityParts: visibleActivityParts,
            activityGroupSegments: visibleActivitySegments,
            headerMessageId: turn.headerMessageId,
            hasTools: turn.hasTools,
            hasReasoning: turn.hasReasoning,
            diffStats: turn.diffStats,
            changedFiles: turn.changedFiles,
            userMessageCreatedAt: turn.userMessage.createdAt,
        };
    }, [turn.changedFiles, turn.diffStats, turn.hasReasoning, turn.hasTools, turn.headerMessageId, turn.summaryText, turn.turnId, turn.userMessage.createdAt, visibleActivityParts, visibleActivitySegments]);

    const renderMessage = React.useCallback(
        (message: ChatMessageEntry) => {
            const isUserMessage = message.role === 'user';
            const messageIndex = messageOrder.lookup.get(message.messageId);
            const assistantIndex = visibleAssistantIds.get(message.messageId) ?? -1;
            const isAssistantMessage = assistantIndex >= 0;
            const isFirstAssistant = assistantIndex === 0;
            const isLastAssistant = assistantIndex === visibleAssistantMessages.length - 1;
            const isActivityOwner = Boolean(activityOwnerMessageId) && message.messageId === activityOwnerMessageId;
            const hasAnchoredActivitySegment = visibleActivitySegments.some((segment) => segment.anchorMessageId === message.messageId);
            const shouldAttachFullTurnContext = chatRenderMode === 'sorted'
                ? isAssistantMessage
                : (isActivityOwner || isFirstAssistant || isLastAssistant);
            const assistantHeaderMessageId = visibleAssistantMessages[0]?.messageId ?? turn.headerMessageId;

            const previousMessage = isUserMessage
                ? undefined
                : (isAssistantMessage
                    ? (isFirstAssistant
                        ? turn.userMessage
                        : undefined)
                    : (messageIndex !== undefined && messageIndex > 0
                        ? messageOrder.ordered[messageIndex - 1]
                        : undefined));
            const nextMessage = isAssistantMessage && isLastAssistant ? nextEntryFirstMessage : undefined;

            let turnGroupingContext: TurnGroupingContext | undefined;
            if (isAssistantMessage) {
                turnGroupingContext = {
                    turnId: turn.turnId,
                    activityOwnerMessageId,
                    isFirstAssistantInTurn: isFirstAssistant,
                    isLastAssistantInTurn: isLastAssistant,
                    hasEarlierAssistantText: chatRenderMode === 'live' && isLastAssistant && visibleAssistantMessages.some((assistant, index) => (
                        index < assistantIndex && filterVisibleParts(assistant.parts).some((part) => part.type === 'text' && !isEmptyTextPart(part))
                    )),
                    isLatestTurn: isLastTurn,
                    isWorking: isLastTurn && sessionIsWorking && (
                        chatRenderMode === 'sorted'
                            ? hasAnchoredActivitySegment
                            : message.messageId === streamingAssistantMessageId
                    ),
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
                    turnGroupingContext.isGroupExpanded = turnUiState.isExpanded;
                    turnGroupingContext.toggleGroup = handleToggleTurnGroup;
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
                />
            );
        },
        [
            isLastTurn,
            nextEntryFirstMessage,
            messageOrder.lookup,
            messageOrder.ordered,
            sessionIsWorking,
            chatRenderMode,
            turn.headerMessageId,
            turn.hasReasoning,
            turn.hasTools,
            turn.turnId,
            turn.userMessage,
            turnUiState.isExpanded,
            turnGroupingContextBase,
            streamingAssistantMessageId,
            activeStreamingPhase,
            reviewTransferDirection,
            visibleAssistantMessages,
            visibleAssistantIds,
            visibleActivitySegments,
            activityOwnerMessageId,
            shouldAnimateUserMessage,
            onUserAnimationConsumed,
            handleToggleTurnGroup,
        ]
    );

    const renderableTurn = React.useMemo(() => {
        if (visibleAssistantMessages === turn.assistantMessages) {
            return turn;
        }
        return {
            ...turn,
            assistantMessages: visibleAssistantMessages,
        };
    }, [turn, visibleAssistantMessages]);

    return (
        <TurnItem
            turn={renderableTurn}
            stickyUserHeader={stickyUserHeader && turnHeaderCanStick}
            renderMessage={renderMessage}
            assistantContent={chatRenderMode === 'live' && !defaultActivityExpanded && hasLiveActivity(turn, showReasoningTraces) ? (
                <LiveTurnActivity
                    turn={renderableTurn}
                    hasLaterAssistant={hasLaterAssistant}
                    expanded={turnUiState.isLiveExpanded === true}
                    onToggle={handleToggleLiveActivity}
                    renderMessage={renderMessage}
                />
            ) : undefined}
        />
    );
});

TurnBlock.displayName = 'TurnBlock';

interface UngroupedMessageRowProps {
    message: ChatMessageEntry;
    previousMessage?: ChatMessageEntry;
    nextMessage?: ChatMessageEntry;
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
    reviewTransferDirection?: ReviewTransferDirection | null;
}

const UngroupedMessageRow = React.memo(({
    message,
    previousMessage,
    nextMessage,
    shouldAnimateUserMessage,
    onUserAnimationConsumed,
    activeStreamingMessageId,
    activeStreamingPhase,
    reviewTransferDirection,
}: UngroupedMessageRowProps) => {
    return (
        <MessageRow
            message={message}
            previousMessage={previousMessage}
            nextMessage={nextMessage}
            animateUserOnMount={shouldAnimateUserMessage(message)}
            onUserAnimationConsumed={onUserAnimationConsumed}
            isInActiveTurn={Boolean(activeStreamingMessageId) && message.messageId === activeStreamingMessageId}
            activeStreamingPhase={message.messageId === activeStreamingMessageId ? activeStreamingPhase : null}
            reviewTransferDirection={reviewTransferDirection}
        />
    );
});

UngroupedMessageRow.displayName = 'UngroupedMessageRow';

interface MessageListEntryProps {
    entry: RenderEntry;
    stickyUserHeader?: boolean;
    sessionIsWorking: boolean;
    defaultActivityExpanded: boolean;
    turnUiStates: Map<string, TurnUiState>;
    onToggleTurnGroup: ToggleTurnGroup;
    chatRenderMode: 'sorted' | 'live';
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
    reviewTransferDirection?: ReviewTransferDirection | null;
}

const MessageListEntry = React.memo(({
    entry,
    stickyUserHeader,
    sessionIsWorking,
    defaultActivityExpanded,
    turnUiStates,
    onToggleTurnGroup,
    chatRenderMode,
    shouldAnimateUserMessage,
    onUserAnimationConsumed,
    activeStreamingMessageId,
    activeStreamingPhase,
    reviewTransferDirection,
}: MessageListEntryProps) => {
    streamPerfCount('ui.message_list_entry.render');
    if (entry.kind === 'ungrouped') {
        return (
            <UngroupedMessageRow
                message={entry.message}
                previousMessage={entry.previousMessage}
                nextMessage={entry.nextMessage}
                shouldAnimateUserMessage={shouldAnimateUserMessage}
                onUserAnimationConsumed={onUserAnimationConsumed}
                activeStreamingMessageId={activeStreamingMessageId}
                activeStreamingPhase={activeStreamingPhase}
                reviewTransferDirection={reviewTransferDirection}
            />
        );
    }

    return (
        <TurnBlock
            turn={entry.turn}
            hasLaterAssistant={entry.hasLaterAssistant}
            isLastTurn={entry.isLastTurn}
            nextEntryFirstMessage={entry.nextEntryFirstMessage}
            sessionIsWorking={sessionIsWorking}
            defaultActivityExpanded={defaultActivityExpanded}
            turnUiStates={turnUiStates}
            onToggleTurnGroup={onToggleTurnGroup}
            chatRenderMode={chatRenderMode}
            shouldAnimateUserMessage={shouldAnimateUserMessage}
            onUserAnimationConsumed={onUserAnimationConsumed}
            activeStreamingMessageId={activeStreamingMessageId}
            activeStreamingPhase={activeStreamingPhase}
            reviewTransferDirection={reviewTransferDirection}
            stickyUserHeader={stickyUserHeader}
        />
    );
});
=======
/**
 * The live tail's entry with the part store's newest parts, for the rows of
 * the tail. `LiveTailSource` computes it once per publish; only the rows of
 * the tail read it, so a streamed part re-renders those and nothing else.
 */
type LiveTailStore = {
    get: () => RenderEntry | null;
    set: (entry: RenderEntry | null) => void;
    notify: () => void;
    subscribe: (listener: () => void) => () => void;
};

const createLiveTailStore = (): LiveTailStore => {
    let current: RenderEntry | null = null;
    const listeners = new Set<() => void>();
    return {
        get: () => current,
        set: (entry) => {
            current = entry;
        },
        notify: () => {
            for (const listener of listeners) listener();
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
};
>>>>>>> bc50ba56a

const LiveTailSource: React.FC<{
    entry: RenderEntry | undefined;
    directory?: string;
    showTurnChangedFiles: boolean;
    store: LiveTailStore;
}> = ({ entry, directory, showTurnChangedFiles, store }) => {
    // Overlay live parts on every message of the tail, not only the one
    // currently streaming: a finished step message's base record can lag the
    // part store, and rendering it from that stale snapshot briefly unmounts
    // its completed tool parts when the stream hands off to the next message.
    const tailMessageIds = React.useMemo(() => {
        if (!entry) return EMPTY_ROW_MESSAGE_IDS;
        if (entry.kind === 'turn') return entry.turn.assistantMessageIds;
        return [entry.message.info.id];
    }, [entry]);
    const livePartsByMessageId = useSessionPartsForMessages(tailMessageIds, directory);
    const liveEntry = React.useMemo(() => (entry ? buildLiveStreamingEntry(entry, {
        livePartsByMessageId,
        showTurnChangedFiles,
        mergeHiddenUserTurns: true,
    }) : null), [entry, livePartsByMessageId, showTurnChangedFiles]);
    // Set while rendering, before the rows of this pass read it; the rows a
    // publish alone changes hear it after the commit.
    store.set(liveEntry);
    React.useLayoutEffect(() => {
        store.notify();
    }, [liveEntry, store]);
    return null;
};

type TimelineRowContextValue = {
<<<<<<< HEAD
    stickyUserHeader: boolean;
    defaultActivityExpanded: boolean;
    turnUiStates: Map<string, TurnUiState>;
    onToggleTurnGroup: ToggleTurnGroup;
    chatRenderMode: 'sorted' | 'live';
    showTurnChangedFiles: boolean;
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    reviewTransferDirection?: ReviewTransferDirection | null;
=======
    scrollToBottom?: () => void;
    turnExpansion: Map<string, boolean>;
    onToggleTurnActivity: ToggleTurnActivity;
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    reviewTransferDirection?: ReviewTransferDirection | null;
    // The rows of the live tail read its live entry; every other row renders
    // its entry as it is.
>>>>>>> bc50ba56a
    streamingTailKey: string | null;
    liveTail: LiveTailStore;
    sessionIsWorking: boolean;
    activeStreamingMessageId: string | null;
    activeStreamingPhase: StreamPhase | null;
    sessionKey: string;
};

const TimelineRowContext = React.createContext<TimelineRowContextValue | null>(null);

const subscribeNowhere = () => () => {};
const readNothing = () => null;

// Every row renders through this one component, live tail or history, so a
// row keeps its React tree when it moves between the two. The live tail
// changes on every send and on a revert; with a different component per role
// the row remounted, its state reset for a commit (a long user message lost
// its "show more" link), and the list measured that frame as the
// row's height. The next row then sat that much too high until a later
// re-measure.
const TimelineRow = React.memo(({ row }: { row: RenderRow }) => {
    const context = React.useContext(TimelineRowContext);
    const live = context?.streamingTailKey === row.entry.key;
    const liveTail = context?.liveTail;
    const liveEntry = React.useSyncExternalStore(
        live && liveTail ? liveTail.subscribe : subscribeNowhere,
        live && liveTail ? () => {
            const entry = liveTail.get();
            return entry?.key === row.entry.key ? entry : null;
        } : readNothing,
    );
    if (!context) return null;

    const entry = liveEntry ?? row.entry;
    const activeStreamingMessageId = live ? context.activeStreamingMessageId : null;
    const activeStreamingPhase = live ? context.activeStreamingPhase : null;
    if (row.kind === 'ungrouped' || entry.kind === 'ungrouped') {
        if (entry.kind !== 'ungrouped') return null;
        return (
            <UngroupedMessageRow
                message={entry.message}
                nextMessage={entry.nextMessage}
                isFirstRow={entry.isFirstRow}
                scrollToBottom={context.scrollToBottom}
                shouldAnimateUserMessage={context.shouldAnimateUserMessage}
                onUserAnimationConsumed={context.onUserAnimationConsumed}
                activeStreamingMessageId={activeStreamingMessageId}
                activeStreamingPhase={activeStreamingPhase}
                reviewTransferDirection={context.reviewTransferDirection}
            />
        );
    }
    streamPerfCount('ui.message_list_entry.render');
    return (
        <TurnRow
            row={row}
            entry={entry}
<<<<<<< HEAD
            live={live}
            directory={context.directory}
            sessionKey={context.sessionKey}
            stickyUserHeader={context.stickyUserHeader}
            sessionIsWorking={live && context.sessionIsWorking}
            defaultActivityExpanded={context.defaultActivityExpanded}
            turnUiStates={context.turnUiStates}
            onToggleTurnGroup={context.onToggleTurnGroup}
            chatRenderMode={context.chatRenderMode}
            showTurnChangedFiles={context.showTurnChangedFiles}
=======
            scrollToBottom={context.scrollToBottom}
            sessionIsWorking={live && context.sessionIsWorking}
            turnExpansion={context.turnExpansion}
            onToggleTurnActivity={context.onToggleTurnActivity}
>>>>>>> bc50ba56a
            shouldAnimateUserMessage={context.shouldAnimateUserMessage}
            onUserAnimationConsumed={context.onUserAnimationConsumed}
            activeStreamingMessageId={activeStreamingMessageId}
            activeStreamingPhase={activeStreamingPhase}
            reviewTransferDirection={context.reviewTransferDirection}
        />
    );
});

TimelineRow.displayName = 'TimelineRow';

const timelineKeyExtractor = (item: RenderRow): string => item.key;

// Row type drives container reuse. Prompts, folds and messages have very
// different shapes, so keeping them in separate pools avoids re-measuring a
// container every time one replaces the other.
const timelineItemType = (item: RenderRow): string => item.kind;

const renderTimelineItem = ({ item }: { item: RenderRow }) => <TimelineRow row={item} />;

// Where message text wraps: the chat column's content box. Read from a
// column in the list when there is one, else from the column's own rule
// (`.chat-message-column` in typography.css: 48rem unless the layout is wide,
// about 1 to 1.5rem of padding on each side).
const readColumnWidth = (scroller: HTMLElement | null): number => {
    const column = scroller?.querySelector<HTMLElement>('.chat-message-column');
    if (column && column.clientWidth > 0) {
        const style = getComputedStyle(column);
        return column.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    }
    const width = scroller?.clientWidth || window.innerWidth;
    const wide = Boolean(scroller?.closest('.wide-chat-layout'));
    return Math.min(width, wide ? width : 768) - (width >= 1024 ? 48 : 32);
};

// A touch device: raised tap targets (mobile.css) and native scroll momentum.
const isTouchLayout = (): boolean => {
    const root = document.documentElement;
    return root.classList.contains('mobile-pointer') && !root.classList.contains('desktop-runtime');
};

// A tool, reasoning or file line: 36 px where touch targets are raised, 32 px elsewhere.
const readToolLineHeight = (): number => (isTouchLayout() ? 36 : 32);

type TimelineListProps = {
    rows: RenderRow[];
    stickyRowIndices: number[] | undefined;
    registerList: (list: LegendListRef | null) => void;
    endPinningReleased: boolean;
    composerOverlayHeight: number;
    onIsAtEndChange: (isAtEnd: boolean) => void;
    onListMetricsChange: (metrics: { readonly headerSize: number; readonly footerSize: number }) => void;
    onTimelineDataChange: () => void;
    listHeader?: React.ReactNode;
    listFooter?: React.ReactNode;
    scrollContainerProps?: TimelineScrollContainerProps;
    rowContext: TimelineRowContextValue;
    showReasoningTraces: boolean;
    collapsibleThinkingBlocks: boolean;
};

const TimelineList = React.memo(({
    rows,
    stickyRowIndices,
    registerList,
    endPinningReleased,
    composerOverlayHeight,
    onIsAtEndChange,
    onListMetricsChange,
    onTimelineDataChange,
    listHeader,
    listFooter,
    scrollContainerProps,
    rowContext,
    showReasoningTraces,
    collapsibleThinkingBlocks,
}: TimelineListProps) => {
    const listRef = React.useRef<LegendListRef | null>(null);
    const isAtEndRef = React.useRef(true);
    const [touchLayout] = React.useState(isTouchLayout);

    // Each row is placed at an estimate of its own height until measured
    // (`rowSizeEstimate.ts`).
    const sizeMetricsRef = React.useRef<RowSizeMetrics>({ columnWidth: 0, lineHeight: 32, showReasoningTraces, collapsibleThinkingBlocks });
    sizeMetricsRef.current.showReasoningTraces = showReasoningTraces;
    sizeMetricsRef.current.collapsibleThinkingBlocks = collapsibleThinkingBlocks;
    const sizeMetrics = React.useCallback((): RowSizeMetrics => {
        const metrics = sizeMetricsRef.current;
        if (metrics.columnWidth <= 0) {
            metrics.columnWidth = Math.round(readColumnWidth(listRef.current?.getScrollableNode() ?? null));
            metrics.lineHeight = readToolLineHeight();
        }
        return metrics;
    }, []);
    // The list asks again on every pass over rows it has not measured; a row
    // whose content did not change keeps its object (`buildTimelineRows`).
    const estimatesRef = React.useRef(new WeakMap<RenderRow, { metrics: string; size: number | undefined }>());
    const estimateRowSize = React.useCallback((row: RenderRow): number | undefined => {
        const metrics = sizeMetrics();
        const signature = `${metrics.columnWidth}|${metrics.lineHeight}|${metrics.showReasoningTraces}|${metrics.collapsibleThinkingBlocks}`;
        const cached = estimatesRef.current.get(row);
        if (cached && cached.metrics === signature) return cached.size;
        const size = estimateTimelineRowSize(row, metrics);
        estimatesRef.current.set(row, { metrics: signature, size });
        return size;
    }, [sizeMetrics]);
    const [scrollerNode, setScrollerNode] = React.useState<HTMLElement | null>(null);
    React.useEffect(() => {
        if (!scrollerNode) return;
        const observer = new ResizeObserver(() => {
            sizeMetricsRef.current.columnWidth = Math.round(readColumnWidth(scrollerNode));
        });
        observer.observe(scrollerNode);
        return () => observer.disconnect();
    }, [scrollerNode]);

    const setListRef = React.useCallback((list: LegendListRef | null) => {
        listRef.current = list;
        setScrollerNode(list?.getScrollableNode() ?? null);
        registerList(list);
    }, [registerList]);

<<<<<<< HEAD
=======
    React.useLayoutEffect(() => {
        isAtEndRef.current = true;
    }, []);

    // The list keeps a prompt row on top until the next one reaches the top
    // and covers it. A turn's prompt leaves with its turn instead: once the
    // turn's last row scrolls under it, it is pushed up by as much.
    const rowsRef = React.useRef(rows);
    rowsRef.current = rows;
    const pushedHeaderRef = React.useRef<HTMLElement | null>(null);
    const pushStickyHeader = React.useCallback((state: ReturnType<LegendListRef['getState']>) => {
        const active = state.activeStickyIndex;
        const element = active >= 0 ? state.elementAtIndex(active) ?? null : null;
        const pushed = pushedHeaderRef.current;
        if (pushed && pushed !== element) pushed.style.transform = '';
        pushedHeaderRef.current = element;
        if (!element) return;
        const data = rowsRef.current;
        let end = active + 1;
        while (end < data.length && data[end].kind !== 'turn-head' && data[end].kind !== 'ungrouped') end += 1;
        // The turn's end is the top of the row after it; one not mounted is
        // far below, and the prompt stays where it sticks.
        const next = end < data.length ? state.elementAtIndex(end) : null;
        const scroller = listRef.current?.getScrollableNode();
        if (!next || !scroller) {
            element.style.transform = '';
            return;
        }
        const push = Math.min(0, next.getBoundingClientRect().top - scroller.getBoundingClientRect().top - element.offsetHeight);
        element.style.transform = push < 0 ? `translateY(${push}px)` : '';
    }, []);

>>>>>>> bc50ba56a
    // The list reports scroll continuously; only end-crossings are interesting,
    // so the edge is debounced to a state transition here rather than pushing a
    // callback on every frame.
    const handleScroll = React.useCallback(() => {
        const state = listRef.current?.getState();
        if (!state) return;
        if (stickyRowIndices) pushStickyHeader(state);
        const isAtEnd = resolveTimelineIsAtEnd(state);
        if (isAtEnd === undefined || isAtEnd === isAtEndRef.current) return;
        isAtEndRef.current = isAtEnd;
        onIsAtEndChange(isAtEnd);
    }, [onIsAtEndChange, pushStickyHeader, stickyRowIndices]);

    // Data changes are the only moment an automatic correction can be needed;
    // the owning hook decides whether one actually applies.
    React.useEffect(() => {
        onTimelineDataChange();
    }, [rows, onTimelineDataChange]);

    const header = React.useMemo(() => (listHeader ? <>{listHeader}</> : undefined), [listHeader]);
    const footer = React.useMemo(() => (listFooter ? <>{listFooter}</> : undefined), [listFooter]);

    const alwaysRender = useSelectionRowHold(listRef);

    return (
        <TimelineRowContext.Provider value={rowContext}>
            <LegendList<RenderRow>
                ref={setListRef}
                data={rows}
                keyExtractor={timelineKeyExtractor}
                getItemType={timelineItemType}
                renderItem={renderTimelineItem}
                estimatedItemSize={TIMELINE_ESTIMATED_ENTRY_SIZE}
                getEstimatedItemSize={estimateRowSize}
                initialScrollAtEnd
                // Chat rows own internal state (expanded tool calls, reveal
                // animations); recycling a container into a different row would
                // carry that state across.
                recycleItems={false}
                contentInsetEndAdjustment={composerOverlayHeight}
                // Off: the owning hook (useChatTimelineScroll) is the only
                // writer that keeps the end in view, instantly at rest and as
                // a glide while output streams.
                maintainScrollAtEnd={false}
                // A prepend first positions rows using estimated heights;
                // later measurements must preserve the same visible row too.
<<<<<<< HEAD
                maintainVisibleContentPosition={{ data: true, size: endPinningReleased }}
=======
                // Keep size compensation active while reading history, including
                // when scrolling mounts older rows above the viewport. A pinned
                // reader is held on the end by the owning hook instead.
                // On touch, a correction for rows measured above the reader
                // waits until the scroll stops (the scroll documentation, "A
                // row is placed at an estimate").
                maintainVisibleContentPosition={{ data: true, size: endPinningReleased, deferSizeWhileScrolling: touchLayout }}
                // The rows a selection spans stay mounted while it lasts.
                alwaysRender={alwaysRender}
>>>>>>> bc50ba56a
                onScroll={handleScroll}
                onMetricsChange={onListMetricsChange}
                stickyHeaderIndices={stickyRowIndices}
                ListHeaderComponent={header}
                ListFooterComponent={footer}
                {...scrollContainerProps}
            />
        </TimelineRowContext.Provider>
    );
});

TimelineList.displayName = 'TimelineList';

<<<<<<< HEAD
// Every row renders through this one component, live tail or history, so a
// row keeps its React tree when it moves between the two.
const TimelineRowContent: React.FC<{
    entry: RenderEntry;
    live: boolean;
    directory?: string;
    sessionKey: string;
    stickyUserHeader: boolean;
    sessionIsWorking: boolean;
    defaultActivityExpanded: boolean;
    turnUiStates: Map<string, TurnUiState>;
    onToggleTurnGroup: ToggleTurnGroup;
    chatRenderMode: 'sorted' | 'live';
    showTurnChangedFiles: boolean;
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
    reviewTransferDirection?: ReviewTransferDirection | null;
}> = ({
    entry,
    live,
    directory,
    sessionKey,
    stickyUserHeader,
    sessionIsWorking,
    defaultActivityExpanded,
    turnUiStates,
    onToggleTurnGroup,
    chatRenderMode,
    showTurnChangedFiles,
    shouldAnimateUserMessage,
    onUserAnimationConsumed,
    activeStreamingMessageId,
    activeStreamingPhase,
    reviewTransferDirection,
}) => {
    // Overlay live parts on every message of the tail, not only the one
    // currently streaming: a finished step message's base record can lag the
    // part store, and rendering it from that stale snapshot briefly unmounts
    // its completed tool parts when the stream hands off to the next message.
    // A history row subscribes to nothing.
    const tailMessageIds = React.useMemo(() => {
        if (!live) return EMPTY_ROW_MESSAGE_IDS;
        if (entry.kind === 'turn') return entry.turn.assistantMessageIds;
        return [entry.message.messageId];
    }, [entry, live]);
    const livePartsByMessageId = useSessionPartsForMessages(sessionKey, tailMessageIds, directory);
    const rowEntry = React.useMemo(() => (live ? buildLiveStreamingEntry(entry, {
        livePartsByMessageId,
        showTextJustificationActivity: chatRenderMode === 'sorted',
        showTurnChangedFiles,
        mergeHiddenUserTurns: true,
    }) : entry), [chatRenderMode, entry, live, livePartsByMessageId, showTurnChangedFiles]);

    return (
        <MessageListEntry
            entry={rowEntry}
            stickyUserHeader={stickyUserHeader}
            sessionIsWorking={sessionIsWorking}
            defaultActivityExpanded={defaultActivityExpanded}
            turnUiStates={turnUiStates}
            onToggleTurnGroup={onToggleTurnGroup}
            chatRenderMode={chatRenderMode}
            shouldAnimateUserMessage={shouldAnimateUserMessage}
            onUserAnimationConsumed={onUserAnimationConsumed}
            activeStreamingMessageId={activeStreamingMessageId}
            activeStreamingPhase={activeStreamingPhase}
            reviewTransferDirection={reviewTransferDirection}
        />
    );
};

TimelineRowContent.displayName = 'TimelineRowContent';
=======
>>>>>>> bc50ba56a

const MessageList = React.forwardRef<MessageListHandle, MessageListProps>(({
    sessionKey,
    messages,
    sessionIsWorking = false,
    activeStreamingMessageId = null,
    activeStreamingPhase = null,
    directory,
    registerList,
    endPinningReleased = false,
    composerOverlayHeight = 0,
    onIsAtEndChange,
    onListMetricsChange,
    onTimelineDataChange,
    listHeader,
    listFooter,
    scrollContainerProps,
}, ref) => {
    streamPerfMark('react.message_list_render');
    streamPerfCount('ui.message_list.render');
    const stickyUserHeader = useUIStore(state => state.stickyUserHeader);
    const chatRenderMode = useUIStore((state) => state.chatRenderMode);
    const activityRenderMode = useUIStore((state) => state.activityRenderMode);
    const showTurnChangedFiles = useUIStore((state) => state.showTurnChangedFiles);
    const showReasoningTraces = useUIStore((state) => state.showReasoningTraces);
    const collapsibleThinkingBlocks = useUIStore((state) => state.collapsibleThinkingBlocks);
    const stickyUserHeader = useUIStore((state) => state.stickyUserHeader);
    const defaultActivityExpanded = activityRenderMode === 'summary';
    const reviewTransferDirection = useGlobalSessionsStore((state) => {
        return state.reviewTransferBySessionId.get(sessionKey) ?? null;
    });
    const [turnUiStates, setTurnUiStates] = React.useState<Map<string, TurnUiState>>(() => readTurnUiStateCache(activityRenderMode));
    const userAnimationRef = React.useRef<{
        sessionKey: string | undefined;
        previousOrder: string[];
        animatedIds: Set<string>;
    }>({ sessionKey: undefined, previousOrder: [], animatedIds: new Set() });

    const turnUiStateModeRef = React.useRef(activityRenderMode);
    React.useEffect(() => {
        if (turnUiStateModeRef.current === activityRenderMode) return;
        turnUiStateModeRef.current = activityRenderMode;
        setTurnUiStates(readTurnUiStateCache(activityRenderMode));
    }, [activityRenderMode]);

    const toggleTurnGroup = React.useCallback((turnId: string, mode: 'sorted' | 'live' = 'sorted') => {
        setTurnUiStates((previous) => {
            const next = new Map(previous);
            const current = next.get(turnId) ?? { isExpanded: defaultActivityExpanded };
            const toggled = mode === 'live'
                ? { ...current, isLiveExpanded: !current.isLiveExpanded }
                : { ...current, isExpanded: !current.isExpanded };
            next.set(turnId, toggled);
            writeTurnUiStateCache(turnId, toggled);
            return next;
        });
    }, [defaultActivityExpanded]);

    const baseDisplayMessages = React.useMemo(() => streamPerfMeasure('ui.message_list.base_display_ms', () => {
        const seenIds = new Set<string>();
        const latestById = new Map<string, ChatMessageEntry>();
        const dedupedMessages: ChatMessageEntry[] = [];
        for (const message of messages) {
            if (message.role === 'system') {
                continue;
            }
            latestById.set(message.messageId, message);
        }

        // Preserve the first occurrence's chronological position, but use the last
        // value because prepended history can overlap with newer live store data.
        for (const message of messages) {
            if (message.role === 'system') {
                continue;
            }
            const messageId = message.messageId;
            if (seenIds.has(messageId)) {
                continue;
            }
            seenIds.add(messageId);
            dedupedMessages.push(getNormalizedMessageForDisplay(latestById.get(messageId) ?? message));
        }

        return attachToolResultsForDisplay(dedupedMessages, messages);
    }), [messages]);

    const { projection, staticTurns, streamingTurn } = useTurnRecords(baseDisplayMessages, {
        sessionKey,
        showTextJustificationActivity: chatRenderMode === 'sorted',
        showTurnChangedFiles,
    });
    const uiPageProjectionRef = React.useRef({ projection, defaultActivityExpanded });
    React.useLayoutEffect(() => {
        uiPageProjectionRef.current = { projection, defaultActivityExpanded };
    }, [projection, defaultActivityExpanded]);
    const hasUngroupedStaticEntries = projection.ungroupedMessageIds.size > 0;
    const tailHasAssistant = Boolean(streamingTurn?.assistantMessages.length);
    const turnsWithLaterAssistant = React.useMemo(() => {
        if (chatRenderMode !== 'live' || defaultActivityExpanded) return new Set<string>();
        const retired = getTurnsWithLaterAssistant(staticTurns);
        if (tailHasAssistant) {
            for (const turn of staticTurns) retired.add(turn.turnId);
        }
        return retired;
    }, [chatRenderMode, defaultActivityExpanded, staticTurns, tailHasAssistant]);
    const staticEntryMessages = hasUngroupedStaticEntries ? baseDisplayMessages : EMPTY_STATIC_ENTRY_MESSAGES;
    const staticEntryUngroupedIds = hasUngroupedStaticEntries ? projection.ungroupedMessageIds : EMPTY_UNGROUPED_MESSAGE_IDS;
    const trailingStreamingEntry = React.useMemo<RenderEntry | undefined>(() => {
        if (streamingTurn) {
            return {
                kind: 'turn',
                key: `turn:${streamingTurn.turnId}`,
                turn: streamingTurn,
                isLastTurn: streamingTurn.turnId === projection.lastTurnId,
            } satisfies RenderEntry;
        }

        if (projection.ungroupedMessageIds.size === 0) {
            return undefined;
        }

        const lastMessage = baseDisplayMessages[baseDisplayMessages.length - 1];
        if (!lastMessage || !projection.ungroupedMessageIds.has(lastMessage.messageId)) {
            return undefined;
        }

        return {
            kind: 'ungrouped',
            key: `msg:${lastMessage.messageId}`,
            message: lastMessage,
            previousMessage: baseDisplayMessages.length > 1 ? baseDisplayMessages[baseDisplayMessages.length - 2] : undefined,
            nextMessage: undefined,
        } satisfies RenderEntry;
    }, [baseDisplayMessages, projection.lastTurnId, projection.ungroupedMessageIds, streamingTurn]);

    const approvalLiveMessageIds = React.useMemo(() => {
        if (!trailingStreamingEntry) return EMPTY_ROW_MESSAGE_IDS;
        return trailingStreamingEntry.kind === 'turn'
            ? trailingStreamingEntry.turn.assistantMessageIds
            : [trailingStreamingEntry.message.info.id];
    }, [trailingStreamingEntry]);
    const footerWithApprovals = React.useMemo(() => (
        <>
            <PendingWorkflowApprovals sessionId={sessionKey} messages={baseDisplayMessages}
                liveMessageIds={approvalLiveMessageIds} directory={directory} />
            {listFooter}
        </>
    ), [approvalLiveMessageIds, baseDisplayMessages, directory, listFooter, sessionKey]);

    if (trailingStreamingEntry) {
        streamPerfCount('ui.message_list.render.streaming');
    }

    // Depend on the trailing entry's first message (stable while its assistant
    // streams), not the trailing entry itself, so streaming updates do not
    // recreate every static entry and re-render every turn block.
    const trailingEntryFirstMessage = trailingStreamingEntry
        ? (trailingStreamingEntry.kind === 'turn' ? trailingStreamingEntry.turn.userMessage : trailingStreamingEntry.message)
        : undefined;
    const previousHistoryEntriesRef = React.useRef<RenderEntry[]>([]);
    const hasStreamingTurn = Boolean(streamingTurn);
    const historyEntries = React.useMemo(() => streamPerfMeasure('ui.message_list.render_entries_ms', () => {
        const entries = buildHistoryEntries({
            staticTurns,
            lastTurnId: projection.lastTurnId,
            turnsWithLaterAssistant,
            messages: staticEntryMessages,
            ungroupedMessageIds: staticEntryUngroupedIds,
            hasStreamingTurn,
            trailingEntryFirstMessage,
        }, previousHistoryEntriesRef.current);
        previousHistoryEntriesRef.current = entries;
        return entries;
    }), [hasStreamingTurn, projection.lastTurnId, staticEntryMessages, staticEntryUngroupedIds, staticTurns, trailingEntryFirstMessage, turnsWithLaterAssistant]);

    // Every surface uses the same virtualized list for the whole timeline —
    // there is no small-list DOM path to transition out of, which is what used
    // to remount the history subtree mid-prepend.
    const listRef = React.useRef<LegendListRef | null>(null);
    const handleRegisterList = React.useCallback((list: LegendListRef | null) => {
        listRef.current = list;
        registerList?.(list);
    }, [registerList]);

    const allEntries = React.useMemo(() => {
        return trailingStreamingEntry ? [...historyEntries, trailingStreamingEntry] : historyEntries;
    }, [historyEntries, trailingStreamingEntry]);

    const previousRowsRef = React.useRef<RenderRow[]>([]);
    const rows = React.useMemo(() => streamPerfMeasure('ui.message_list.render_rows_ms', () => {
        const next = buildTimelineRows(allEntries, {
            collapsedActivity: !defaultActivityExpanded,
            expandedTurns: turnExpansion,
            showReasoningTraces,
        }, previousRowsRef.current);
        previousRowsRef.current = next;
        return next;
    }), [allEntries, defaultActivityExpanded, showReasoningTraces, turnExpansion]);

    // The prompt rows the list keeps on top while their turn scrolls under them.
    const stickyRowIndices = React.useMemo(() => {
        if (!stickyUserHeader) return undefined;
        const indices: number[] = [];
        rows.forEach((row, index) => {
            if (row.kind === 'turn-head' && turnHeaderCanStick(row.entry.turn.userMessage)) indices.push(index);
        });
        return indices.length > 0 ? indices : undefined;
    }, [rows, stickyUserHeader]);

    const [liveTail] = React.useState(createLiveTailStore);

    // Stable identities: these reach the list, where a changing callback would
    // re-render every mounted row.
    const stableIsAtEndChange = useStableEvent((isAtEnd: boolean) => {
        onIsAtEndChange?.(isAtEnd);
    });

    const stableTimelineDataChange = useStableEvent(() => {
        onTimelineDataChange?.();
    });

    const stableListMetricsChange = useStableEvent((metrics: { readonly headerSize: number; readonly footerSize: number }) => {
<<<<<<< HEAD
        onListMetricsChange?.(metrics);
=======
        if (listRef.current) onListMetricsChange?.(metrics);
>>>>>>> bc50ba56a
    });

    const currentUserOrder = React.useMemo(() => {
        return messages
            .filter((message) => message.role === 'user')
            .map((message) => message.messageId);
    }, [messages]);

    // Detect new user messages SYNCHRONOUSLY during render.
    // Must happen during render (not in useEffect) so that the new message
    // receives animate=true on its FIRST render,
    // starting it hidden (opacity 0). An effect-based approach causes
    // the message to flash visible before the animation starts.
    {
        const anim = userAnimationRef.current;

        // Reset on session switch
        if (anim.sessionKey !== sessionKey) {
            anim.sessionKey = sessionKey;
            anim.previousOrder = currentUserOrder;
            anim.animatedIds = new Set();
        }

        // Detect appended user messages
        const prev = anim.previousOrder;
        if (currentUserOrder.length > prev.length) {
            const isAppendOnly = prev.every((id, i) => currentUserOrder[i] === id);
            if (isAppendOnly && hasPendingUserSendAnimation(sessionKey)) {
                for (let i = prev.length; i < currentUserOrder.length; i += 1) {
                    const id = currentUserOrder[i];
                    if (id && !anim.animatedIds.has(id)) {
                        if (!consumePendingUserSendAnimation(sessionKey)) break;
                        anim.animatedIds.add(id);
                    }
                }
            }
        }
        anim.previousOrder = currentUserOrder;
    }

    const shouldAnimateUserMessage = React.useCallback((message: ChatMessageEntry): boolean => {
        if (message.role !== 'user') return false;
        return userAnimationRef.current.animatedIds.has(message.messageId);
    }, []);

    const onUserAnimationConsumed = React.useCallback((messageId: string) => {
        userAnimationRef.current.animatedIds.delete(messageId);
    }, []);

    // Row lookups for navigation, built in one pass over the rows. A message
    // maps to the row it starts in; one without a row of its own (a step
    // under a closed fold) to its turn's fold, else its prompt. Assistant
    // messages before a turn's last one are collapsible: in a collapsed turn
<<<<<<< HEAD
    // their text sits inside the folded activity and has no row of its own.
=======
    // their text sits inside the folded activity. Reasoning of any of a
    // turn's messages, the last one included, sits in that fold too.
>>>>>>> bc50ba56a
    const {
        messageIndexMap,
        turnIndexMap,
        rowIndexByKey,
        collapsibleTurnByMessageId,
        turnByAssistantMessageId,
    } = React.useMemo(() => {
        const messageIndexes = new Map<string, number>();
        const turnIndexes = new Map<string, number>();
        const rowIndexes = new Map<string, number>();
        const collapsible = new Map<string, string>();
        const all = new Map<string, string>();
<<<<<<< HEAD
        allEntries.forEach((entry, index) => {
            if (entry.kind === 'ungrouped') {
                messageIndexes.set(entry.message.messageId, index);
                return;
            }
            const { turnId, userMessage, assistantMessages } = entry.turn;
            turnIndexes.set(turnId, index);
            messageIndexes.set(userMessage.messageId, index);
            assistantMessages.forEach((message, assistantIndex) => {
                const messageId = message.messageId;
                messageIndexes.set(messageId, index);
=======
        const foldIndexes = new Map<string, number>();
        rows.forEach((row, index) => {
            rowIndexes.set(row.key, index);
            if (row.kind === 'ungrouped') {
                messageIndexes.set(row.entry.message.info.id, index);
                return;
            }
            const { turnId } = row.entry.turn;
            if (row.kind === 'turn-head') {
                turnIndexes.set(turnId, index);
                messageIndexes.set(row.entry.turn.userMessage.info.id, index);
            } else if (row.kind === 'turn-fold') {
                foldIndexes.set(turnId, index);
            } else if (row.kind === 'turn-message' && !row.slice?.from) {
                messageIndexes.set(row.messageId, index);
            }
        });
        for (const entry of allEntries) {
            if (entry.kind !== 'turn') continue;
            const { turnId, assistantMessages } = entry.turn;
            const fallback = foldIndexes.get(turnId) ?? turnIndexes.get(turnId);
            assistantMessages.forEach((message, assistantIndex) => {
                const messageId = message.info.id;
                if (!messageIndexes.has(messageId) && fallback !== undefined) messageIndexes.set(messageId, fallback);
>>>>>>> bc50ba56a
                all.set(messageId, turnId);
                if (assistantIndex < assistantMessages.length - 1) collapsible.set(messageId, turnId);
            });
        }
        return {
            messageIndexMap: messageIndexes,
            turnIndexMap: turnIndexes,
            rowIndexByKey: rowIndexes,
            collapsibleTurnByMessageId: collapsible,
            turnByAssistantMessageId: all,
        };
<<<<<<< HEAD
    }, [allEntries]);
    const turnUiStatesRef = React.useRef(turnUiStates);
    turnUiStatesRef.current = turnUiStates;

    // The list remounts per session, so entering a session again mounts only
    // the newest messages of its long turns.
    const [turnMessageWindow] = React.useState(createTurnMessageWindowStore);
    const turnMessageWindowEnabled = chatRenderMode === 'live';

    const resolveScrollContainer = React.useCallback((): HTMLElement | null => {
        const listNode = listRef.current?.getScrollableNode();
        if (listNode) {
            return listNode;
        }
        return document.querySelector<HTMLDivElement>('[data-scrollbar="chat"]');
    }, []);

    /**
     * Mounts the whole turn holding a message that navigation is about to
     * reach but that its turn has not mounted yet (see TurnMessageWindow).
     */
    const mountWindowedMessage = React.useCallback((messageId: string): void => {
        if (!turnMessageWindowEnabled) return;
        const turnId = turnByAssistantMessageId.get(messageId);
        if (turnId) turnMessageWindow.setRange(turnId, FULL_MESSAGE_WINDOW);
    }, [turnByAssistantMessageId, turnMessageWindow, turnMessageWindowEnabled]);
=======
    }, [allEntries, rows]);
    const turnExpansionRef = React.useRef(turnExpansion);
    turnExpansionRef.current = turnExpansion;

    /** The row an anchor names: the slice of a long answer it was taken in, else its message's first row. */
    const anchorRowIndex = React.useCallback((anchor: MessageViewportAnchor): number | undefined => (
        (anchor.slice ? rowIndexByKey.get(`step:${anchor.messageId}:${anchor.slice}`) : undefined)
            ?? messageIndexMap.get(anchor.messageId)
    ), [messageIndexMap, rowIndexByKey]);
>>>>>>> bc50ba56a

    /**
     * Opens the turn a linked or searched message is folded into, the way a
     * browser's find opens a closed <details>. True when it had to open it:
     * the row renders the message on a later frame. Both folds are opened,
     * since which one hides the text depends on the chat render mode.
     */
    const revealFoldedMessage = React.useCallback((messageId: string): boolean => {
        const turnId = isReasoningRevealTarget(messageId)
            ? turnByAssistantMessageId.get(messageId)
            : collapsibleTurnByMessageId.get(messageId);
        if (!turnId) return false;
        const current = turnUiStatesRef.current.get(turnId) ?? { isExpanded: defaultActivityExpanded };
        if (current.isExpanded && current.isLiveExpanded) return false;
        const opened = { ...current, isExpanded: true, isLiveExpanded: true };
        writeTurnUiStateCache(turnId, opened);
        setTurnUiStates((previous) => new Map(previous).set(turnId, opened));
        return true;
    }, [collapsibleTurnByMessageId, defaultActivityExpanded, turnByAssistantMessageId]);

    const findMessageElement = React.useCallback((messageId: string): HTMLElement | null => {
        const container = resolveScrollContainer();
        if (!container) {
            return null;
        }
        // A search hit in reasoning lands on the reasoning itself, which in
        // sorted mode is drawn inside another message's activity.
        if (isReasoningRevealTarget(messageId)) {
            const reasoning = container.querySelector<HTMLElement>(`[data-reasoning-message-id="${messageId}"]`);
            if (reasoning) return reasoning;
        }
        // A long answer's later rows carry its id too; its start is the one without a slice.
        return container.querySelector(`[data-message-id="${messageId}"]:not([data-message-slice])`);
    }, [resolveScrollContainer]);

<<<<<<< HEAD
=======
    // A slice that no longer exists (the message is cut elsewhere now: the
    // reasoning was hidden) falls back to the message's first row, as its index does.
    const findAnchorElement = React.useCallback((anchor: MessageViewportAnchor): HTMLElement | null => (
        anchor.slice && rowIndexByKey.has(`step:${anchor.messageId}:${anchor.slice}`)
            ? resolveScrollContainer()?.querySelector<HTMLElement>(`[data-message-id="${anchor.messageId}"][data-message-slice="${anchor.slice}"]`) ?? null
            : findMessageElement(anchor.messageId)
    ), [findMessageElement, resolveScrollContainer, rowIndexByKey]);

>>>>>>> bc50ba56a
    // Accepts any index the list renders, the trailing streaming entry
    // included — it lives at historyEntries.length and is a legitimate
    // navigation target (the timeline rail's last item).
    const scrollHistoryIndexIntoView = React.useCallback((index: number) => {
        if (index < 0 || index >= rows.length) {
            return false;
        }

        const list = listRef.current;
        if (!list) {
            return false;
        }

        // Unanimated: an unmounted target's position is still an estimate, and
        // a smooth scroll would end at that stale offset once the real
        // measurement replaces it.
        void list.scrollToIndex({ index, animated: false, viewPosition: 0 });
        return true;
    }, [rows.length]);

    // A navigation scroll lands on estimates: an unmounted target teleports
    // to its estimated offset, and even a mounted one drifts when neighbours
    // finish measuring a frame later. This settle loop re-aligns the target to
    // the requested viewport position until the layout stops moving, and backs
    // off the moment the user touches the scroll.
    const settleNavigationTarget = React.useCallback((
        findElement: () => HTMLElement | null,
        desiredOffsetTop: number,
    ) => {
        const container = resolveScrollContainer();
        if (!container) {
            return;
        }
        let frames = 0;
        let stable = 0;
        let cancelled = false;
<<<<<<< HEAD
=======
        let frame: number;
        let stopReleaseListener: (() => void) | null = null;
>>>>>>> bc50ba56a
        const cancelOnUserInput = () => {
            cancelled = true;
            container.removeEventListener('touchstart', cancelOnUserInput);
            container.removeEventListener('wheel', cancelOnUserInput);
<<<<<<< HEAD
=======
            stopReleaseListener?.();
            if (cancelNavigationRef.current === cancelOnUserInput) cancelNavigationRef.current = null;
>>>>>>> bc50ba56a
        };
        container.addEventListener('touchstart', cancelOnUserInput, { passive: true });
        container.addEventListener('wheel', cancelOnUserInput, { passive: true });
        stopReleaseListener = onNavigationRelease(container, cancelOnUserInput);
        const step = () => {
            if (cancelled) return;
            const element = findElement();
            if (element) {
                const delta = element.getBoundingClientRect().top
                    - container.getBoundingClientRect().top
                    - desiredOffsetTop;
                if (Math.abs(delta) > 0.5) {
                    container.scrollTop += delta;
                    stable = 0;
                } else {
                    stable += 1;
                }
            }
            frames += 1;
            if (stable >= ANCHOR_HOLD_STABLE_FRAMES || frames >= ANCHOR_HOLD_MAX_FRAMES) {
                container.removeEventListener('touchstart', cancelOnUserInput);
                container.removeEventListener('wheel', cancelOnUserInput);
                return;
            }
            window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }, [resolveScrollContainer]);

    const scrollMessageElementIntoView = React.useCallback((messageId: string, behavior: ScrollBehavior = 'auto') => {
        const container = resolveScrollContainer();
        if (!container) {
            return false;
        }
        const messageElement = findMessageElement(messageId);
        if (!messageElement) {
            return false;
        }

        const containerRect = container.getBoundingClientRect();
        const messageRect = messageElement.getBoundingClientRect();
        const offset = 50;
        const top = messageRect.top - containerRect.top + container.scrollTop - offset;
        container.scrollTo({ top, behavior });
        return true;
    }, [findMessageElement, resolveScrollContainer]);

    const alignViewportAnchor = React.useCallback((anchor: MessageViewportAnchor): ViewportAnchorAlignment => {
        const index = anchorRowIndex(anchor);
        const container = resolveScrollContainer();
        if (index === undefined || !container) {
            return 'missing';
        }
        if (revealFoldedMessage(anchor.messageId)) {
            scrollHistoryIndexIntoView(index);
            return 'moved';
        }

<<<<<<< HEAD
        const element = findMessageElement(anchor.messageId);
        if (!element) {
            // Not mounted: bring its row in from the estimate; the next step
            // measures the real position.
            mountWindowedMessage(anchor.messageId);
=======
        const element = findAnchorElement(anchor);
        if (!element) {
            // Not mounted: bring its row in from the estimate; the next step
            // measures the real position.
>>>>>>> bc50ba56a
            return scrollHistoryIndexIntoView(index) ? 'moved' : 'missing';
        }
        const delta = element.getBoundingClientRect().top
            - container.getBoundingClientRect().top
            - anchor.offsetTop;
        if (Math.abs(delta) <= 0.5) {
            return 'aligned';
        }
        const before = container.scrollTop;
        container.scrollTop += delta;
        // A message near either end of the timeline cannot reach the offset:
        // the scroll is clamped, and where it stopped is as close as it gets.
        return Math.abs(container.scrollTop - before) < 0.5 ? 'aligned' : 'moved';
<<<<<<< HEAD
    }, [findMessageElement, messageIndexMap, mountWindowedMessage, resolveScrollContainer, revealFoldedMessage, scrollHistoryIndexIntoView]);
=======
    }, [anchorRowIndex, findAnchorElement, resolveScrollContainer, revealFoldedMessage, scrollHistoryIndexIntoView]);
>>>>>>> bc50ba56a

    // Installed during layout so a parent's layout effect (session entry
    // restore) already reaches this list, not the one it replaced.
    React.useImperativeHandle(ref, () => {
        const handle: MessageListHandle = {
            resolveUiPageMessageId: (messageId, partId) => {
                const { projection: current, defaultActivityExpanded: expanded } = uiPageProjectionRef.current;
                const turnId = current.indexes.messageToTurnId.get(messageId);
                const turn = turnId ? current.indexes.turnById.get(turnId) : undefined;
                return uiPageMessageId(turn, expanded, messageId, partId);
            },
            scrollToUiPageRow: (messageId) => {
                const turnId = uiPageProjectionRef.current.projection.indexes.messageToTurnId.get(messageId);
                const index = turnId ? rowIndexByKey.get(`pages:${turnId}`) : undefined;
                if (index === undefined) return false;
                cancelNavigationRef.current?.();
                return scrollHistoryIndexIntoView(index);
            },
            scrollToTurnId: (turnId: string, options?: { behavior?: ScrollBehavior }) => {
                const behavior = options?.behavior ?? 'auto';
                const index = turnIndexMap.get(turnId);
                if (index === undefined) {
                    return false;
                }

                const container = resolveScrollContainer();
                if (!container) {
                    return false;
                }
                const findTurnElement = () => container.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`);
                const turnElement = findTurnElement();
                if (turnElement) {
                    turnElement.scrollIntoView({ behavior, block: 'start' });
                    if (behavior !== 'smooth') settleNavigationTarget(findTurnElement, 0);
                    return true;
                }

                if (!scrollHistoryIndexIntoView(index)) {
                    return false;
                }
                if (behavior !== 'smooth') settleNavigationTarget(findTurnElement, 0);
                return true;
            },

            scrollToMessageId: (messageId: string, options?: { behavior?: ScrollBehavior }) => {
                const behavior = options?.behavior ?? 'auto';
                const index = messageIndexMap.get(messageId);
                if (index === undefined) {
                    return false;
                }

<<<<<<< HEAD
                // A folded-in message has no row until its fold opens, and its
                // row then draws on a later frame.
                revealFoldedMessage(messageId);
                if (!findMessageElement(messageId)) mountWindowedMessage(messageId);
=======
                revealFoldedMessage(messageId);
>>>>>>> bc50ba56a
                const didScroll = scrollMessageElementIntoView(messageId, behavior)
                    || scrollHistoryIndexIntoView(index);
                if (didScroll && behavior !== 'smooth') {
                    settleNavigationTarget(() => findMessageElement(messageId), 50);
                }
                return didScroll;
            },

<<<<<<< HEAD
            holdViewportAnchor: (anchor: { messageId: string; offsetTop: number }) => {
                const container = resolveScrollContainer();
                if (!container) {
                    return;
                }

                let frames = 0;
                let stable = 0;
                let cancelled = false;
                const cancelOnUserInput = () => {
                    cancelled = true;
                    container.removeEventListener('touchstart', cancelOnUserInput);
                    container.removeEventListener('wheel', cancelOnUserInput);
                };
                container.addEventListener('touchstart', cancelOnUserInput, { passive: true });
                container.addEventListener('wheel', cancelOnUserInput, { passive: true });
                const step = () => {
                    if (cancelled) return;
                    const element = findMessageElement(anchor.messageId);
                    if (element) {
                        const delta = element.getBoundingClientRect().top
                            - container.getBoundingClientRect().top
                            - anchor.offsetTop;
                        if (Math.abs(delta) > 0.5) {
                            container.scrollTop += delta;
                            stable = 0;
                        } else {
                            stable += 1;
                        }
                    }
                    frames += 1;
                    if (stable >= ANCHOR_HOLD_STABLE_FRAMES || frames >= ANCHOR_HOLD_MAX_FRAMES) {
                        container.removeEventListener('touchstart', cancelOnUserInput);
                        container.removeEventListener('wheel', cancelOnUserInput);
                        return;
                    }
                    window.requestAnimationFrame(step);
                };
                window.requestAnimationFrame(step);
=======
            holdViewportAnchor: (anchor) => {
                settleNavigationTarget(() => findAnchorElement(anchor), anchor.offsetTop);
>>>>>>> bc50ba56a
            },

            // The timeline is always virtualized now; the flag stays so callers
            // that branch on it keep compiling and take the virtualized path.
            isHistoryVirtualized: () => true,

            captureViewportAnchor: () => {
                const container = resolveScrollContainer();
                return container ? captureMessageViewportAnchor(container) : null;
            },

            restoreViewportAnchor: (anchor: MessageViewportAnchor) => alignViewportAnchor(anchor) !== 'missing',

            alignViewportAnchor,

            scrollToBottom: () => {
                const list = listRef.current;
                if (list) {
                    void list.scrollToEnd({ animated: false });
                    return;
                }
                const container = resolveScrollContainer();
                if (!container) return;
                // Overshoot so the browser clamps to the exact fractional
                // maximum (scrollHeight is integer-rounded).
                container.scrollTop = container.scrollHeight + 4096;
            },
        };
        return handle;
    }, [alignViewportAnchor, findMessageElement, messageIndexMap, mountWindowedMessage, resolveScrollContainer, revealFoldedMessage, scrollHistoryIndexIntoView, scrollMessageElementIntoView, settleNavigationTarget, turnIndexMap]);

<<<<<<< HEAD
    const rowContext = React.useMemo<TimelineRowContextValue>(() => ({
        stickyUserHeader,
        defaultActivityExpanded,
        turnUiStates,
        onToggleTurnGroup: toggleTurnGroup,
        chatRenderMode,
        showTurnChangedFiles,
=======
        if (typeof ref === 'function') {
            ref(handle);
            return () => {
                ref(null);
            };
        }

        const objectRef = ref;
        objectRef.current = handle;
        return () => {
            if (objectRef.current === handle) objectRef.current = null;
        };
    }, [alignViewportAnchor, findAnchorElement, findMessageElement, messageIndexMap, resolveScrollContainer, revealFoldedMessage, rowIndexByKey, scrollHistoryIndexIntoView, scrollMessageElementIntoView, settleNavigationTarget, turnIndexMap, ref]);

    const rowContext = React.useMemo(() => ({
        scrollToBottom: stableScrollToBottom,
        turnExpansion,
        onToggleTurnActivity: toggleTurnActivity,
>>>>>>> bc50ba56a
        shouldAnimateUserMessage,
        onUserAnimationConsumed,
        reviewTransferDirection,
        streamingTailKey: trailingStreamingEntry?.key ?? null,
        liveTail,
        sessionIsWorking,
        activeStreamingMessageId,
        activeStreamingPhase,
        sessionKey,
    }), [
        activeStreamingMessageId,
        activeStreamingPhase,
<<<<<<< HEAD
        chatRenderMode,
        defaultActivityExpanded,
        directory,
=======
        liveTail,
>>>>>>> bc50ba56a
        onUserAnimationConsumed,
        reviewTransferDirection,
        sessionIsWorking,
        sessionKey,
        shouldAnimateUserMessage,
<<<<<<< HEAD
        showTurnChangedFiles,
        stickyUserHeader,
        toggleTurnGroup,
=======
        stableScrollToBottom,
        toggleTurnActivity,
>>>>>>> bc50ba56a
        trailingStreamingEntry?.key,
        turnUiStates,
    ]);

    return (
        // Virtualized rows unmount/remount during scroll; re-running the reveal
        // fade on every remount reads as blinking. Rows are never "new" from the
        // list's point of view, so fade-in is disabled for them — content
        // arriving inside the streaming tail keeps its own animations.
        <FadeInDisabledProvider disabled>
<<<<<<< HEAD
            <TurnMessageWindowContext.Provider value={turnMessageWindowEnabled ? turnMessageWindow : null}>
                <TimelineList
=======
            <LiveTailSource entry={trailingStreamingEntry} directory={directory}
                showTurnChangedFiles={showTurnChangedFiles} store={liveTail} />
            <TimelineList
>>>>>>> bc50ba56a
                    key={sessionKey}
                    rows={rows}
                    stickyRowIndices={stickyRowIndices}
                    registerList={handleRegisterList}
                    composerOverlayHeight={composerOverlayHeight}
                    onIsAtEndChange={stableIsAtEndChange}
                    onListMetricsChange={stableListMetricsChange}
                    onTimelineDataChange={stableTimelineDataChange}
                    listHeader={listHeader}
                    listFooter={footerWithApprovals}
                    scrollContainerProps={scrollContainerProps}
                    rowContext={rowContext}
                    endPinningReleased={endPinningReleased}
                    showReasoningTraces={showReasoningTraces}
                    collapsibleThinkingBlocks={collapsibleThinkingBlocks}
                />
        </FadeInDisabledProvider>
    );
});

MessageList.displayName = 'MessageList';

export default React.memo(MessageList);
