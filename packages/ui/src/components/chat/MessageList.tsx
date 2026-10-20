import React from 'react';
import { LegendList, type LegendListRef } from '@legendapp/list/react';

import ChatMessage from './ChatMessage';
import { filterVisibleParts, isEmptyTextPart } from './message/partUtils';
import { areOptionalRenderRelevantMessagesEqual, areRelevantTurnGroupingContextsEqual, areRenderRelevantMessagesEqual } from './message/renderCompare';
import TurnItem from './components/TurnItem';
import { LiveTurnActivity } from './components/LiveTurnActivity';
import { getTurnsWithLaterAssistant, hasLiveActivity } from './lib/turns/liveActivity';
import type { ChatMessageEntry, TurnRecord, TurnGroupingContext } from './lib/turns/types';
import { useTurnRecords } from './hooks/useTurnRecords';
import { buildHistoryEntries, type TimelineEntry } from './lib/turns/timelineEntries';
import { buildLiveStreamingEntry } from './lib/turns/streamingTailEntry';
import { FULL_MESSAGE_WINDOW, TurnMessageWindowContext, createTurnMessageWindowStore } from './lib/turns/turnMessageWindow';
import { attachToolResultsForDisplay, getNormalizedMessageForDisplay } from './lib/messageDisplayNormalization';
import { useUIStore } from '@/stores/useUIStore';
import { isHiddenUserMessage } from './message/hiddenUserMessage';
import { FadeInDisabledProvider } from './message/FadeInOnReveal';
import { hasPendingUserSendAnimation, consumePendingUserSendAnimation } from '@/lib/userSendAnimation';
import { streamPerfCount, streamPerfMark, streamPerfMeasure } from '@/stores/utils/streamDebug';
import type { StreamPhase } from './message/types';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionPartsForMessages } from '@/sync/sync-context';
import type { ReviewTransferDirection } from '@/lib/reviewFlow';
import { resolveTimelineIsAtEnd } from './lib/scroll/timelineScrollAnchoring';
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
    onListMetricsChange?: (metrics: { readonly footerSize: number }) => void;
    onTimelineDataChange?: () => void;
    listHeader?: React.ReactNode;
    listFooter?: React.ReactNode;
    scrollContainerProps?: TimelineScrollContainerProps;
}

export interface MessageListHandle {
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

interface TurnBlockProps {
    turn: TurnRecord;
    hasLaterAssistant?: boolean;
    isLastTurn: boolean;
    nextEntryFirstMessage?: ChatMessageEntry;
    sessionIsWorking: boolean;
    defaultActivityExpanded: boolean;
    turnUiStates: Map<string, TurnUiState>;
    onToggleTurnGroup: ToggleTurnGroup;
    chatRenderMode: 'sorted' | 'live';
    stickyUserHeader?: boolean;
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
    reviewTransferDirection?: ReviewTransferDirection | null;
}

const turnContainsMessageId = (turn: TurnRecord, messageId: string | null | undefined): boolean => {
    if (!messageId) {
        return false;
    }

    if (turn.userMessage.messageId === messageId) {
        return true;
    }

    return turn.assistantMessages.some((assistant) => assistant.messageId === messageId);
};

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
        () => !isHiddenUserMessage(turn.userMessage),
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

MessageListEntry.displayName = 'MessageListEntry';

// Shared row state. Passed through context rather than closed over by
// `renderItem` so the render callback keeps a stable identity — a changing
// `renderItem` makes the list re-render every mounted row on every commit.
type TimelineRowContextValue = {
    stickyUserHeader: boolean;
    defaultActivityExpanded: boolean;
    turnUiStates: Map<string, TurnUiState>;
    onToggleTurnGroup: ToggleTurnGroup;
    chatRenderMode: 'sorted' | 'live';
    showTurnChangedFiles: boolean;
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    reviewTransferDirection?: ReviewTransferDirection | null;
    streamingTailKey: string | null;
    directory?: string;
    sessionIsWorking: boolean;
    activeStreamingMessageId: string | null;
    activeStreamingPhase: StreamPhase | null;
    sessionKey: string;
};

const TimelineRowContext = React.createContext<TimelineRowContextValue | null>(null);

const TimelineRow = React.memo(({ entry }: { entry: RenderEntry }) => {
    const context = React.useContext(TimelineRowContext);
    if (!context) return null;

    const live = context.streamingTailKey === entry.key;
    return (
        <TimelineRowContent
            entry={entry}
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
            shouldAnimateUserMessage={context.shouldAnimateUserMessage}
            onUserAnimationConsumed={context.onUserAnimationConsumed}
            activeStreamingMessageId={live ? context.activeStreamingMessageId : null}
            activeStreamingPhase={live ? context.activeStreamingPhase : null}
            reviewTransferDirection={context.reviewTransferDirection}
        />
    );
});

TimelineRow.displayName = 'TimelineRow';

const timelineKeyExtractor = (item: RenderEntry): string => item.key;

// Row type drives container reuse. Turn blocks and ungrouped messages have very
// different shapes, so keeping them in separate pools avoids re-measuring a
// container every time one replaces the other.
const timelineItemType = (item: RenderEntry): string => item.kind;

const renderTimelineItem = ({ item }: { item: RenderEntry }) => <TimelineRow entry={item} />;

type TimelineListProps = {
    entries: RenderEntry[];
    streamingTailKey: string | null;
    registerList: (list: LegendListRef | null) => void;
    endPinningReleased: boolean;
    composerOverlayHeight: number;
    onIsAtEndChange: (isAtEnd: boolean) => void;
    onListMetricsChange: (metrics: { readonly footerSize: number }) => void;
    onTimelineDataChange: () => void;
    listHeader?: React.ReactNode;
    listFooter?: React.ReactNode;
    scrollContainerProps?: TimelineScrollContainerProps;
    rowContext: TimelineRowContextValue;
};

const TimelineList = React.memo(({
    entries,
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
}: TimelineListProps) => {
    const listRef = React.useRef<LegendListRef | null>(null);
    const isAtEndRef = React.useRef(true);

    const setListRef = React.useCallback((list: LegendListRef | null) => {
        listRef.current = list;
        registerList(list);
    }, [registerList]);

    // The list reports scroll continuously; only end-crossings are interesting,
    // so the edge is debounced to a state transition here rather than pushing a
    // callback on every frame.
    const handleScroll = React.useCallback(() => {
        const state = listRef.current?.getState();
        if (!state) return;
        const isAtEnd = resolveTimelineIsAtEnd(state);
        if (isAtEnd === undefined || isAtEnd === isAtEndRef.current) return;
        isAtEndRef.current = isAtEnd;
        onIsAtEndChange(isAtEnd);
    }, [onIsAtEndChange]);

    // Data changes are the only moment an automatic correction can be needed;
    // the owning hook decides whether one actually applies.
    React.useEffect(() => {
        onTimelineDataChange();
    }, [entries, onTimelineDataChange]);

    const header = React.useMemo(() => (listHeader ? <>{listHeader}</> : undefined), [listHeader]);
    const footer = React.useMemo(() => (listFooter ? <>{listFooter}</> : undefined), [listFooter]);

    return (
        <TimelineRowContext.Provider value={rowContext}>
            <LegendList<RenderEntry>
                ref={setListRef}
                data={entries}
                keyExtractor={timelineKeyExtractor}
                getItemType={timelineItemType}
                renderItem={renderTimelineItem}
                estimatedItemSize={TIMELINE_ESTIMATED_ENTRY_SIZE}
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
                maintainVisibleContentPosition={{ data: true, size: endPinningReleased }}
                onScroll={handleScroll}
                onMetricsChange={onListMetricsChange}
                ListHeaderComponent={header}
                ListFooterComponent={footer}
                {...scrollContainerProps}
            />
        </TimelineRowContext.Provider>
    );
});

TimelineList.displayName = 'TimelineList';

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

    // Stable identities: these reach the list, where a changing callback would
    // re-render every mounted row.
    const stableIsAtEndChange = useStableEvent((isAtEnd: boolean) => {
        onIsAtEndChange?.(isAtEnd);
    });

    const stableTimelineDataChange = useStableEvent(() => {
        onTimelineDataChange?.();
    });

    const stableListMetricsChange = useStableEvent((metrics: { readonly footerSize: number }) => {
        onListMetricsChange?.(metrics);
    });

    const currentUserOrder = React.useMemo(() => {
        return messages
            .filter((message) => message.role === 'user')
            .map((message) => message.messageId);
    }, [messages]);

    // Detect new user messages SYNCHRONOUSLY during render.
    // Must happen during render (not in useEffect) so that ToolRevealOnMount
    // receives animate=true on the FIRST render of the new message,
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

    // Row lookups for navigation, built in one pass over the rows. Assistant
    // messages before a turn's last one are collapsible: in a collapsed turn
    // their text sits inside the folded activity and has no row of its own.
    const {
        messageIndexMap,
        turnIndexMap,
        collapsibleTurnByMessageId,
        turnByAssistantMessageId,
    } = React.useMemo(() => {
        const messageIndexes = new Map<string, number>();
        const turnIndexes = new Map<string, number>();
        const collapsible = new Map<string, string>();
        const all = new Map<string, string>();
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
                all.set(messageId, turnId);
                if (assistantIndex < assistantMessages.length - 1) collapsible.set(messageId, turnId);
            });
        });
        return {
            messageIndexMap: messageIndexes,
            turnIndexMap: turnIndexes,
            collapsibleTurnByMessageId: collapsible,
            turnByAssistantMessageId: all,
        };
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
        return container.querySelector(`[data-message-id="${messageId}"]`);
    }, [resolveScrollContainer]);

    // Accepts any index the list renders, the trailing streaming entry
    // included — it lives at historyEntries.length and is a legitimate
    // navigation target (the timeline rail's last item).
    const scrollHistoryIndexIntoView = React.useCallback((index: number) => {
        if (index < 0 || index >= allEntries.length) {
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
    }, [allEntries.length]);

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
        const cancelOnUserInput = () => {
            cancelled = true;
            container.removeEventListener('touchstart', cancelOnUserInput);
            container.removeEventListener('wheel', cancelOnUserInput);
        };
        container.addEventListener('touchstart', cancelOnUserInput, { passive: true });
        container.addEventListener('wheel', cancelOnUserInput, { passive: true });
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
        const index = messageIndexMap.get(anchor.messageId);
        const container = resolveScrollContainer();
        if (index === undefined || !container) {
            return 'missing';
        }
        if (revealFoldedMessage(anchor.messageId)) {
            scrollHistoryIndexIntoView(index);
            return 'moved';
        }

        const element = findMessageElement(anchor.messageId);
        if (!element) {
            // Not mounted: bring its row in from the estimate; the next step
            // measures the real position.
            mountWindowedMessage(anchor.messageId);
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
    }, [findMessageElement, messageIndexMap, mountWindowedMessage, resolveScrollContainer, revealFoldedMessage, scrollHistoryIndexIntoView]);

    // Installed during layout so a parent's layout effect (session entry
    // restore) already reaches this list, not the one it replaced.
    React.useImperativeHandle(ref, () => {
        const handle: MessageListHandle = {
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

                if (!findMessageElement(messageId)) mountWindowedMessage(messageId);
                const didScroll = scrollMessageElementIntoView(messageId, behavior)
                    || scrollHistoryIndexIntoView(index);
                if (didScroll && behavior !== 'smooth') {
                    settleNavigationTarget(() => findMessageElement(messageId), 50);
                }
                return didScroll;
            },

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
    }, [alignViewportAnchor, findMessageElement, messageIndexMap, mountWindowedMessage, resolveScrollContainer, scrollHistoryIndexIntoView, scrollMessageElementIntoView, settleNavigationTarget, turnIndexMap]);

    const rowContext = React.useMemo<TimelineRowContextValue>(() => ({
        stickyUserHeader,
        defaultActivityExpanded,
        turnUiStates,
        onToggleTurnGroup: toggleTurnGroup,
        chatRenderMode,
        showTurnChangedFiles,
        shouldAnimateUserMessage,
        onUserAnimationConsumed,
        reviewTransferDirection,
        streamingTailKey: trailingStreamingEntry?.key ?? null,
        directory,
        sessionIsWorking,
        activeStreamingMessageId,
        activeStreamingPhase,
        sessionKey,
    }), [
        activeStreamingMessageId,
        activeStreamingPhase,
        chatRenderMode,
        defaultActivityExpanded,
        directory,
        onUserAnimationConsumed,
        reviewTransferDirection,
        sessionIsWorking,
        sessionKey,
        shouldAnimateUserMessage,
        showTurnChangedFiles,
        stickyUserHeader,
        toggleTurnGroup,
        trailingStreamingEntry?.key,
        turnUiStates,
    ]);

    return (
        // Virtualized rows unmount/remount during scroll; re-running the reveal
        // fade on every remount reads as blinking. Rows are never "new" from the
        // list's point of view, so fade-in is disabled for them — content
        // arriving inside the streaming tail keeps its own animations.
        <FadeInDisabledProvider disabled>
            <TurnMessageWindowContext.Provider value={turnMessageWindowEnabled ? turnMessageWindow : null}>
                <TimelineList
                    key={sessionKey}
                    entries={allEntries}
                    streamingTailKey={trailingStreamingEntry?.key ?? null}
                    registerList={handleRegisterList}
                    composerOverlayHeight={composerOverlayHeight}
                    onIsAtEndChange={stableIsAtEndChange}
                    onListMetricsChange={stableListMetricsChange}
                    onTimelineDataChange={stableTimelineDataChange}
                    listHeader={listHeader}
                    listFooter={listFooter}
                    scrollContainerProps={scrollContainerProps}
                    rowContext={rowContext}
                    endPinningReleased={endPinningReleased}
                />
            </TurnMessageWindowContext.Provider>
        </FadeInDisabledProvider>
    );
});

MessageList.displayName = 'MessageList';

export default React.memo(MessageList);
