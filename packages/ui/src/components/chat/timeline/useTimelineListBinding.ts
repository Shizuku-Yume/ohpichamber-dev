import React from 'react';
import type { LegendListRef } from '@legendapp/list/react';

import { estimateTimelineRowSize, type RowSizeMetrics } from '../lib/turns/rowSizeEstimate';
import { readColumnWidth, readToolLineHeight } from './timelineMetrics';
import { useStableEvent } from './useStableEvent';
import type { ListMetrics, RenderRow } from './types';

export const useTimelineListBinding = ({
    registerList,
    onIsAtEndChange,
    onTimelineDataChange,
    onListMetricsChange,
}: {
    registerList?: (list: LegendListRef | null) => void;
    onIsAtEndChange?: (isAtEnd: boolean) => void;
    onTimelineDataChange?: () => void;
    onListMetricsChange?: (metrics: ListMetrics) => void;
}) => {
    const listRef = React.useRef<LegendListRef | null>(null);
    const handleRegisterList = React.useCallback((list: LegendListRef | null) => {
        listRef.current = list;
        registerList?.(list);
    }, [registerList]);

    const stableIsAtEndChange = useStableEvent((isAtEnd: boolean) => {
        if (listRef.current) onIsAtEndChange?.(isAtEnd);
    });

    const stableTimelineDataChange = useStableEvent(() => {
        if (listRef.current) onTimelineDataChange?.();
    });

    const stableListMetricsChange = useStableEvent((metrics: ListMetrics) => {
        if (listRef.current) onListMetricsChange?.(metrics);
    });

    return {
        listRef,
        handleRegisterList,
        stableIsAtEndChange,
        stableTimelineDataChange,
        stableListMetricsChange,
    };
};

export const useTimelineListLifecycle = ({
    listRef,
    rows,
    showReasoningTraces,
    collapsibleThinkingBlocks,
    onTimelineDataChange,
    scrollerNode,
    isAtEndRef,
}: {
    listRef: React.RefObject<LegendListRef | null>;
    rows: readonly RenderRow[];
    showReasoningTraces: boolean;
    collapsibleThinkingBlocks: boolean;
    onTimelineDataChange: () => void;
    scrollerNode: HTMLElement | null;
    isAtEndRef: React.RefObject<boolean>;
}) => {
    const sizeMetricsRef = React.useRef<RowSizeMetrics>({
        columnWidth: 0,
        lineHeight: 32,
        showReasoningTraces,
        collapsibleThinkingBlocks,
    });
    sizeMetricsRef.current.showReasoningTraces = showReasoningTraces;
    sizeMetricsRef.current.collapsibleThinkingBlocks = collapsibleThinkingBlocks;

    const sizeMetrics = React.useCallback((): RowSizeMetrics => {
        const metrics = sizeMetricsRef.current;
        if (metrics.columnWidth <= 0) {
            metrics.columnWidth = Math.round(readColumnWidth(listRef.current?.getScrollableNode() ?? null));
            metrics.lineHeight = readToolLineHeight();
        }
        return metrics;
    }, [listRef]);

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

    React.useEffect(() => {
        if (!scrollerNode || globalThis.ResizeObserver === undefined) return;
        const observer = new ResizeObserver(() => {
            sizeMetricsRef.current.columnWidth = Math.round(readColumnWidth(scrollerNode));
        });
        observer.observe(scrollerNode);
        return () => observer.disconnect();
    }, [scrollerNode]);

    React.useLayoutEffect(() => {
        isAtEndRef.current = true;
    }, [isAtEndRef]);

    React.useEffect(() => {
        onTimelineDataChange();
    }, [rows, onTimelineDataChange]);

    return { estimateRowSize };
};
