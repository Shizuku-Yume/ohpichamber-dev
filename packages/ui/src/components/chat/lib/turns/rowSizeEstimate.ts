import type { Part, TextPart, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { toolBaseName } from '@/lib/toolPresentation';
import { filterVisibleParts, isEmptyTextPart } from '../../message/partUtils';
import { isSettledAsk, isShownInPlace } from '../../message/parts/pageRenderView';
import { getToolFileChanges } from '../../message/parts/toolDiffUtils';
import { toToolView } from '../../message/parts/toolView';
import { getShownPages, hasUiBlock, toolResultsByCall, type ShownPart } from './liveActivity';
import type { TimelineRow } from './timelineRows';
import type { ChatMessageEntry } from './types';

export type RowSizeMetrics = {
    columnWidth: number;
    lineHeight: number;
    showReasoningTraces: boolean;
    collapsibleThinkingBlocks: boolean;
};

const TEXT_LINE_PX = 26;
const CHAR_WIDTH_PX = 16 * 0.5;
const PARAGRAPH_GAP_PX = 12;
const CODE_LINE_PX = 20;
const CODE_BLOCK_CHROME_PX = 48;
const PROMPT_CHROME_PX = 45;
const PROMPT_ATTACHMENT_PX = 66;
const EMPTY_PROMPT_PX = 40;
const DETAILED_TOOL_EXTRA_PX = 14;
const DETAILED_TOOLS = new Set(['patch', 'apply_patch', 'edit', 'write', 'subagent', 'task']);
const TURN_END_PX = 40;
const TURN_END_WITHOUT_ANSWER_PX = 8;
const FOLD_HEADER_PX = 40;
const SHOWN_PAGE_PX = 320;
const UNGROUPED_PX = 120;
const PATCH_FILE_CHIP_PX = 155;
const PATCH_FILES_EXTRA_PX = 18;
const PATCH_FILE_ROW_PX = 22;

const patchFileCount = (part: ToolCallPart, result: ToolResultPart | undefined): number => {
    const base = toolBaseName(part.toolName);
    if (base !== 'patch' && base !== 'apply_patch' && base !== 'edit') return 0;
    return getToolFileChanges(result ?? part, part).length;
};

const toolHeight = (part: ToolCallPart, result: ToolResultPart | undefined, metrics: RowSizeMetrics): number => {
    const files = patchFileCount(part, result);
    if (files > 1) {
        const perRow = Math.max(1, metrics.columnWidth / PATCH_FILE_CHIP_PX);
        return metrics.lineHeight + PATCH_FILES_EXTRA_PX + (Math.ceil(files / perRow) - 1) * PATCH_FILE_ROW_PX;
    }
    return metrics.lineHeight + (DETAILED_TOOLS.has(toolBaseName(part.toolName)) ? DETAILED_TOOL_EXTRA_PX : 0);
};

const textLines = (text: string, charsPerLine: number): number => {
    let lines = 0;
    for (const line of text.split('\n')) lines += Math.max(1, Math.ceil(line.length / charsPerLine));
    return lines;
};

const markdownHeight = (text: string, columnWidth: number): number => {
    const charsPerLine = Math.max(20, Math.floor(columnWidth / CHAR_WIDTH_PX));
    let height = 0;
    const segments = text.split(/^(?:```|~~~)[^\n]*$/m);
    segments.forEach((segment, index) => {
        if (index % 2 === 1) {
            height += CODE_BLOCK_CHROME_PX + segment.trim().split('\n').length * CODE_LINE_PX;
            return;
        }
        for (const paragraph of segment.split(/\n\s*\n/)) {
            const trimmed = paragraph.trim();
            if (!trimmed) continue;
            height += textLines(trimmed, charsPerLine) * TEXT_LINE_PX + PARAGRAPH_GAP_PX;
        }
    });
    return height;
};

const sliceText = (part: TextPart, row: Extract<TimelineRow, { kind: 'turn-message' }>): string => {
    const from = row.slice?.from?.partId === part.partId ? row.slice.from.offset : 0;
    const to = row.slice?.to?.partId === part.partId ? row.slice.to.offset : part.content.length;
    return part.content.slice(from, to);
};

const rowParts = (message: ChatMessageEntry, row: Extract<TimelineRow, { kind: 'turn-message' }>, metrics: RowSizeMetrics): Part[] => {
    const parts = filterVisibleParts(message.parts, { includeReasoning: metrics.showReasoningTraces }).filter((part) => !isEmptyTextPart(part));
    const start = row.slice?.from ? parts.findIndex((part) => part.partId === row.slice?.from?.partId) : 0;
    const endCut = row.slice?.to;
    let end = parts.length;
    if (endCut) {
        const index = parts.findIndex((part) => part.partId === endCut.partId);
        if (index >= 0) end = endCut.offset > 0 ? index + 1 : index;
    }
    return parts.slice(Math.max(0, start), end);
};

type TurnRowOf<K extends TimelineRow['kind']> = Extract<TimelineRow, { kind: K }>;

const hoistedPages = (row: TurnRowOf<'turn-fold' | 'turn-message' | 'turn-pages'>) => {
    if (!row.underFold) return [];
    const finalMessage = row.finalMessageId ? row.entry.turn.assistantMessages.find((message) => message.messageId === row.finalMessageId) : undefined;
    return getShownPages(row.entry.turn.assistantMessages, finalMessage, row.keepText);
};

const hoistedHeight = (
    pages: ShownPart[],
    results: Map<string, ToolResultPart>,
    messages: readonly ChatMessageEntry[],
    metrics: RowSizeMetrics,
): number => pages.reduce((height, page) => {
    if (page.type === 'text' && !hasUiBlock(page.content)) return height + markdownHeight(page.content, metrics.columnWidth);
    if (page.type === 'tool_call') {
        const owner = messages.find((candidate) => candidate.parts.some((part) => part.partId === page.partId));
        const view = toToolView(page, results.get(page.toolCallId), {
            sessionID: owner?.sessionId ?? '',
            messageID: owner?.messageId ?? '',
        });
        return height + (isSettledAsk(view) ? metrics.lineHeight : SHOWN_PAGE_PX);
    }
    return height + SHOWN_PAGE_PX;
}, 0);

const messageRowHeight = (row: TurnRowOf<'turn-message'>, metrics: RowSizeMetrics): number | undefined => {
    const message = row.entry.turn.assistantMessages.find((candidate) => candidate.messageId === row.messageId);
    if (!message) return undefined;
    const hoisted = hoistedPages(row);
    const results = toolResultsByCall(row.entry.turn.assistantMessages);
    const callIds = new Set<string>();
    for (const part of message.parts) {
        if (part.type === 'tool_call') callIds.add(part.toolCallId);
    }
    const parts = rowParts(message, row, metrics);
    const firstText = row.final ? parts.find((part) => part.type === 'text') : undefined;
    const answerStartsHere = firstText !== undefined
        && message.parts.find((part) => part.type === 'text' && !isEmptyTextPart(part))?.partId === firstText.partId
        && !(row.slice?.from?.partId === firstText.partId && row.slice.from.offset > 0);
    let height = answerStartsHere ? hoistedHeight(hoisted, results, row.entry.turn.assistantMessages, metrics) : 0;
    let hasText = false;
    for (const part of parts) {
        if (part.type === 'text') {
            if (hoisted.some((page) => page.partId === part.partId)) continue;
            hasText = true;
            height += markdownHeight(sliceText(part, row), metrics.columnWidth);
        } else if (part.type === 'reasoning') {
            if (!part.content.trim()) continue;
            height += metrics.collapsibleThinkingBlocks ? metrics.lineHeight : markdownHeight(part.content, metrics.columnWidth);
        } else if (part.type === 'tool_call') {
            const result = results.get(part.toolCallId);
            const view = toToolView(part, result, { sessionID: message.sessionId, messageID: message.messageId });
            if (isShownInPlace(view)) {
                if (!hoisted.some((page) => page.partId === part.partId)) height += SHOWN_PAGE_PX;
            } else {
                height += toolHeight(part, result, metrics);
            }
        } else if (part.type === 'tool_result') {
            if (!callIds.has(part.toolCallId)) height += metrics.lineHeight;
        } else {
            height += metrics.lineHeight;
        }
    }
    if (row.gapBelow) height += hasText ? TURN_END_PX : TURN_END_WITHOUT_ANSWER_PX;
    return height;
};

const promptHeight = (message: ChatMessageEntry, metrics: RowSizeMetrics): number => {
    let height = 0;
    for (const part of message.parts) {
        if (part.type === 'text' && part.content.trim()) height += markdownHeight(part.content, metrics.columnWidth * 0.8) - PARAGRAPH_GAP_PX;
        else if (part.type === 'attachment') height += PROMPT_ATTACHMENT_PX;
    }
    return height > 0 ? PROMPT_CHROME_PX + height : EMPTY_PROMPT_PX;
};

export const estimateTimelineRowSize = (row: TimelineRow, metrics: RowSizeMetrics): number | undefined => {
    if (metrics.columnWidth <= 0) return undefined;
    let height: number;
    switch (row.kind) {
        case 'ungrouped': return UNGROUPED_PX;
        case 'turn-head': height = promptHeight(row.entry.turn.userMessage, metrics); break;
        case 'turn-fold': {
            const results = toolResultsByCall(row.entry.turn.assistantMessages);
            height = FOLD_HEADER_PX + (row.keepText && !row.finalMessageId
                ? hoistedHeight(hoistedPages(row), results, row.entry.turn.assistantMessages, metrics)
                : 0);
            break;
        }
        case 'turn-pages': {
            const results = toolResultsByCall(row.entry.turn.assistantMessages);
            height = hoistedHeight(hoistedPages(row), results, row.entry.turn.assistantMessages, metrics);
            break;
        }
        case 'turn-message': {
            const message = messageRowHeight(row, metrics);
            return message === undefined ? undefined : Math.round(message);
        }
    }
    return Math.round(height + (row.gapBelow ? TURN_END_PX : 0));
};
