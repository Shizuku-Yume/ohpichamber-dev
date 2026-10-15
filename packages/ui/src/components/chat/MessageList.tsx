import React from 'react';
import { LegendList, type LegendListRef } from '@legendapp/list/react';
import type { Message } from '@openchamber/agent-contract';
import ChatMessage from './ChatMessage';
import type { StreamPhase } from './message/types';
import { resolveTimelineIsAtEnd } from './lib/scroll/timelineScrollAnchoring';
import { ANCHOR_HOLD_MAX_FRAMES, ANCHOR_HOLD_STABLE_FRAMES, captureMessageViewportAnchor, type MessageViewportAnchor, type ViewportAnchorAlignment } from './lib/scroll/messageViewportAnchor';

type TimelineScrollContainerProps = {
    className?: string;
    style?: React.CSSProperties;
    tabIndex?: number;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
    'data-scrollbar'?: string;
    'data-scroll-shadow'?: string;
};
interface MessageListProps {
    sessionKey: string;
    messages: Message[];
    sessionIsWorking?: boolean;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
    retryOverlay?: { sessionId: string; message: string; confirmedAt?: number; fallbackTimestamp?: number } | null;
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
    holdViewportAnchor: (anchor: MessageViewportAnchor) => void;
    isHistoryVirtualized: () => boolean;
    scrollToBottom: () => void;
}

const MessageList = React.forwardRef<MessageListHandle, MessageListProps>((props, ref) => {
    const { messages, registerList, endPinningReleased = false, composerOverlayHeight = 0 } = props;
    const listRef = React.useRef<LegendListRef | null>(null);
    const atEndRef = React.useRef(true);
    const holdCleanupRef = React.useRef<(() => void) | null>(null);
    React.useEffect(() => () => holdCleanupRef.current?.(), []);
    const messageIndices = React.useMemo(() => new Map(messages.map((message, index) => [message.messageId, index])), [messages]);
    const turnIndices = React.useMemo(() => {
        const result = new Map<string, number>();
        messages.forEach((message, index) => { if (!result.has(message.turnId)) result.set(message.turnId, index); });
        return result;
    }, [messages]);
    const container = React.useCallback(() => listRef.current?.getScrollableNode() ?? null, []);
    const findMessage = React.useCallback((id: string) => container()?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`) ?? null, [container]);
    const scrollIndex = React.useCallback((index: number | undefined, behavior: ScrollBehavior = 'auto') => {
        if (index === undefined || !listRef.current) return false;
        void listRef.current.scrollToIndex({ index, animated: behavior === 'smooth', viewPosition: 0 });
        return true;
    }, []);
    const align = React.useCallback((anchor: MessageViewportAnchor): ViewportAnchorAlignment => {
        const node = findMessage(anchor.messageId);
        const scroll = container();
        if (!node || !scroll) return scrollIndex(messageIndices.get(anchor.messageId)) ? 'moved' : 'missing';
        const delta = node.getBoundingClientRect().top - scroll.getBoundingClientRect().top - anchor.offsetTop;
        if (Math.abs(delta) <= 0.5) return 'aligned';
        scroll.scrollTop += delta;
        return 'moved';
    }, [container, findMessage, messageIndices, scrollIndex]);
    const hold = React.useCallback((anchor: MessageViewportAnchor) => {
        holdCleanupRef.current?.();
        const scroll = container();
        if (!scroll) return;
        let frames = 0;
        let stable = 0;
        let frame = 0;
        const cleanup = () => {
            cancelAnimationFrame(frame);
            scroll.removeEventListener('touchstart', cleanup);
            scroll.removeEventListener('wheel', cleanup);
        };
        holdCleanupRef.current = cleanup;
        const step = () => {
            const result = align(anchor);
            stable = result === 'aligned' ? stable + 1 : 0;
            if (result === 'missing' || ++frames >= ANCHOR_HOLD_MAX_FRAMES || stable >= ANCHOR_HOLD_STABLE_FRAMES) { cleanup(); return; }
            frame = requestAnimationFrame(step);
        };
        scroll.addEventListener('touchstart', cleanup, { passive: true });
        scroll.addEventListener('wheel', cleanup, { passive: true });
        frame = requestAnimationFrame(step);
    }, [align, container]);
    React.useImperativeHandle(ref, () => ({
        scrollToTurnId: (id, options) => scrollIndex(turnIndices.get(id), options?.behavior),
        scrollToMessageId: (id, options) => {
            const node = findMessage(id);
            if (node) { node.scrollIntoView({ behavior: options?.behavior ?? 'auto', block: 'start' }); return true; }
            return scrollIndex(messageIndices.get(id), options?.behavior);
        },
        captureViewportAnchor: () => { const scroll = container(); return scroll ? captureMessageViewportAnchor(scroll) : null; },
        restoreViewportAnchor: (anchor) => align(anchor) !== 'missing',
        alignViewportAnchor: align,
        holdViewportAnchor: hold,
        isHistoryVirtualized: () => true,
        scrollToBottom: () => { void listRef.current?.scrollToEnd({ animated: false }); },
    }), [align, container, findMessage, hold, messageIndices, scrollIndex, turnIndices]);
    React.useEffect(() => { props.onTimelineDataChange?.(); }, [messages, props.onTimelineDataChange]);
    const setList = React.useCallback((list: LegendListRef | null) => { listRef.current = list; registerList?.(list); }, [registerList]);
    const onScroll = React.useCallback(() => {
        const state = listRef.current?.getState();
        if (!state) return;
        const atEnd = resolveTimelineIsAtEnd(state);
        if (typeof atEnd !== 'boolean' || atEnd === atEndRef.current) return;
        atEndRef.current = atEnd;
        props.onIsAtEndChange?.(atEnd);
    }, [props.onIsAtEndChange]);
    // Canonical turn identity is authoritative. Legacy synthetic-context,
    // diff summaries and retry-message injection are not canonical messages.
    return <LegendList<Message>
        key={props.sessionKey}
        ref={setList}
        data={messages}
        keyExtractor={(message) => message.messageId}
        renderItem={({ item, index }) => <ChatMessage message={item} previousMessage={messages[index - 1]} nextMessage={messages[index + 1]} activeStreamingPhase={item.messageId === props.activeStreamingMessageId ? props.activeStreamingPhase : null} />}
        estimatedItemSize={320}
        initialScrollAtEnd
        recycleItems={false}
        contentInsetEndAdjustment={composerOverlayHeight}
        maintainScrollAtEnd={false}
        maintainVisibleContentPosition={{ data: true, size: endPinningReleased }}
        onScroll={onScroll}
        onMetricsChange={props.onListMetricsChange}
        ListHeaderComponent={props.listHeader ? <>{props.listHeader}</> : undefined}
        ListFooterComponent={props.listFooter ? <>{props.listFooter}</> : undefined}
        {...props.scrollContainerProps}
    />;
});
MessageList.displayName = 'MessageList';
export default MessageList;
