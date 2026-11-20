import type { JsonValue, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import React from 'react';
import { z } from 'zod';

import { nativeToolResultContent } from '@/lib/toolResultContent';

/** Runtime backend that an eval cell dispatches to. */
type EvalLanguage = 'python' | 'js';

/** One column of a table view. */
export interface EvalTableColumn {
    head: string;
    numeric?: boolean;
}

/** Pretty rendering of structured data produced by a cell. */
type EvalView =
    | { kind: 'table'; columns: EvalTableColumn[]; rows: string[][] }
    | { kind: 'json'; value: unknown }
    | { kind: 'markdown'; text: string };

/** A view and the exact printed text it stands for. */
export interface EvalViewEntry {
    text: string;
    view: EvalView;
}

/** Status event emitted by eval prelude helpers or bridged tools. */
export interface EvalStatusEvent {
    op: string;
    [key: string]: unknown;
}

/** Structured view of a single cell's execution state and output. */
export interface EvalCellView {
    index: number;
    title?: string;
    code: string;
    language: EvalLanguage;
    output: string;
    views?: EvalViewEntry[];
    status: 'pending' | 'running' | 'complete' | 'error';
    durationMs?: number;
    exitCode?: number;
    statusEvents?: EvalStatusEvent[];
    statusEventsElided?: number;
}

/** Top-level view model for an eval tool presentation. */
export interface EvalViewData {
    cells: EvalCellView[];
    images: Array<{ mediaType: string; data: string; title?: string }>;
    statusEvents?: EvalStatusEvent[];
    statusEventsElided?: number;
    replies?: string[];
    isError?: boolean;
    notice?: string;
    meta?: {
        truncated?: boolean;
        truncatedDirection?: 'head' | 'tail';
        totalBytes?: number;
        shownBytes?: number;
        totalLines?: number;
        shownLines?: number;
        [key: string]: unknown;
    };
    async?: {
        state: 'running' | 'completed' | 'failed' | 'cancelled';
        jobId: string;
        type: 'eval';
    };
    isRunning: boolean;
    isFailed: boolean;
    totalDurationMs: number;
    toolCallCount: number;
}

const evalTableColumnSchema = z.object({
    head: z.string(),
    numeric: z.boolean().optional(),
});

const evalViewSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('table'),
        columns: z.array(evalTableColumnSchema),
        rows: z.array(z.array(z.string())),
    }),
    z.object({
        kind: z.literal('json'),
        value: z.unknown(),
    }),
    z.object({
        kind: z.literal('markdown'),
        text: z.string(),
    }),
]);

const evalViewEntrySchema = z.object({
    text: z.string(),
    view: evalViewSchema,
});

const evalStatusEventSchema = z.object({
    op: z.string(),
}).passthrough();

const evalCellResultSchema = z.object({
    index: z.number().optional(),
    title: z.string().optional(),
    code: z.string().default(''),
    language: z.string().optional(),
    output: z.string().default(''),
    views: z.array(evalViewEntrySchema).optional(),
    status: z.enum(['pending', 'running', 'complete', 'error']).default('pending'),
    durationMs: z.number().optional(),
    exitCode: z.number().optional(),
    statusEvents: z.array(evalStatusEventSchema).optional(),
    statusEventsElided: z.number().optional(),
});

const evalToolDetailsSchema = z.object({
    cells: z.array(evalCellResultSchema).optional(),
    images: z.array(z.record(z.string(), z.unknown())).optional(),
    statusEvents: z.array(evalStatusEventSchema).optional(),
    statusEventsElided: z.number().optional(),
    replies: z.array(z.string()).optional(),
    isError: z.boolean().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
    language: z.string().optional(),
    languages: z.array(z.string()).optional(),
    notice: z.string().optional(),
    async: z.object({
        state: z.enum(['running', 'completed', 'failed', 'cancelled']),
        jobId: z.string(),
        type: z.literal('eval'),
    }).optional(),
}).passthrough();

export function normalizeEvalLanguage(lang: string | undefined): EvalLanguage {
    if (lang === 'js' || lang === 'javascript') return 'js';
    return 'python';
}

const NON_TOOL_STATUS_OPS: Record<string, true> = {
    log: true,
    phase: true,
    mcp_progress: true,
    env: true,
    tool_define: true,
};

function isToolCallStatusEvent(event: { op: string }): boolean {
    return !NON_TOOL_STATUS_OPS[event.op];
}

/** One ordered piece of a cell's output: printed text, or a view shown in place of matching text. */
type EvalOutputPart =
    | { kind: 'text'; text: string }
    | { kind: 'view'; view: EvalView };

/**
 * Split `output` around its views, in order: each view's `text` is searched
 * from the end of the previous match, unmatched entries are skipped, and
 * blank text between views is dropped.
 */
export function splitEvalOutput(
    output: string,
    views: readonly EvalViewEntry[] | undefined,
): EvalOutputPart[] {
    if (!views || views.length === 0) {
        return output.trim().length > 0 ? [{ kind: 'text', text: output }] : [];
    }
    const parts: EvalOutputPart[] = [];
    const pushText = (chunk: string, trimStart: boolean, trimEnd: boolean) => {
        let text = chunk;
        if (trimStart) text = text.replace(/^\n+/, '');
        if (trimEnd) text = text.replace(/\n+$/, '');
        if (text.trim().length > 0) parts.push({ kind: 'text', text });
    };
    let cursor = 0;
    for (const entry of views) {
        if (!entry.text) continue;
        const at = output.indexOf(entry.text, cursor);
        if (at < 0) continue;
        pushText(output.slice(cursor, at), cursor > 0, true);
        parts.push({ kind: 'view', view: entry.view });
        cursor = at + entry.text.length;
    }
    pushText(output.slice(cursor), cursor > 0, cursor > 0);
    return parts;
}

/** One-line result summary for the tool row: `N cells · 1.2s · M tool calls`. */
export function evalResultSummary(
    value: JsonValue | undefined,
    t?: (key: string, params?: Record<string, unknown>) => string,
): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const rawDetails = (value as Record<string, JsonValue>).details ?? value;
    if (!rawDetails || typeof rawDetails !== 'object' || Array.isArray(rawDetails)) return null;
    const details = rawDetails as Record<string, JsonValue>;

    const cells = z.array(z.record(z.string(), z.unknown())).safeParse(details.cells).data;
    const cellCount = cells?.length ?? (Array.isArray(details.cells) ? details.cells.length : 0);

    let totalDurationMs = 0;
    let toolCalls = 0;

    const countEvents = (events: unknown[]) => {
        for (const ev of events) {
            if (ev && typeof ev === 'object' && !Array.isArray(ev)) {
                const op = (ev as Record<string, unknown>).op;
                if (typeof op === 'string' && isToolCallStatusEvent({ op })) {
                    toolCalls += 1;
                }
            }
        }
    };

    if (cells) {
        for (const cell of cells) {
            if (typeof cell.durationMs === 'number') totalDurationMs += cell.durationMs;
            if (Array.isArray(cell.statusEvents)) {
                countEvents(cell.statusEvents);
            }
        }
    }
    if (Array.isArray(details.statusEvents)) {
        countEvents(details.statusEvents);
    }

    const cellPart = cellCount > 0
        ? (t ? t('chat.eval.cells', { count: cellCount }) : `${cellCount} ${cellCount === 1 ? 'cell' : 'cells'}`)
        : null;
    const durationPart = totalDurationMs > 0
        ? (totalDurationMs >= 1000 ? `${(totalDurationMs / 1000).toFixed(1)}s` : `${Math.round(totalDurationMs)}ms`)
        : null;
    const toolCallPart = toolCalls > 0
        ? (t ? t('chat.eval.toolCalls', { count: toolCalls }) : `${toolCalls} ${toolCalls === 1 ? 'tool call' : 'tool calls'}`)
        : null;

    const parts = [cellPart, durationPart, toolCallPart].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
}

/** Fallback cell list derived from `call.input` before any tool results arrive. */
function fallbackCellsFromInput(call: ToolCallPart | undefined): EvalCellView[] {
    if (!call?.input || typeof call.input !== 'object') {
        return [{
            index: 0,
            code: '',
            language: 'js',
            output: '',
            status: call?.status === 'running' ? 'running' : 'pending',
        }];
    }
    const input = call.input as Record<string, unknown>;
    const isRunning = call.status === 'running';

    if (Array.isArray(input.cells) && input.cells.length > 0) {
        return input.cells.map((cell, idx) => {
            const c = (cell && typeof cell === 'object') ? (cell as Record<string, unknown>) : {};
            return {
                index: idx,
                title: typeof c.title === 'string' ? c.title : undefined,
                code: typeof c.code === 'string' ? c.code : '',
                language: normalizeEvalLanguage(typeof c.language === 'string' ? c.language : undefined),
                output: '',
                status: isRunning && idx === 0 ? 'running' : 'pending',
            };
        });
    }

    const code = typeof input.code === 'string' ? input.code : '';
    const title = typeof input.title === 'string' ? input.title : undefined;
    const language = normalizeEvalLanguage(typeof input.language === 'string' ? input.language : undefined);

    return [{
        index: 0,
        title,
        code,
        language,
        output: '',
        status: isRunning ? 'running' : 'pending',
    }];
}

function extractDetailsPayload(result: ToolResultPart | undefined): unknown {
    if (!result || !result.output) return undefined;
    if (typeof result.output === 'object' && !Array.isArray(result.output)) {
        const obj = result.output as Record<string, unknown>;
        if (obj.details !== undefined) return obj.details;
        if (Array.isArray(obj.cells)) return obj;
    }
    const native = nativeToolResultContent(result);
    return native.details;
}

/**
 * Hook to parse and present an `eval` tool call and its streaming or final result.
 * Validates details with Zod and falls back to `call.input` as pending cells.
 */
export function useEvalView(
    call: ToolCallPart | undefined,
    result: ToolResultPart | undefined,
): EvalViewData {
    return React.useMemo<EvalViewData>(() => {
        const rawDetails = extractDetailsPayload(result);
        const parsedDetails = rawDetails ? evalToolDetailsSchema.safeParse(rawDetails) : null;
        const details = parsedDetails?.success ? parsedDetails.data : undefined;
        const nativeContent = nativeToolResultContent(result);

        const callStatus = call?.status;
        const isRunning = callStatus
            ? (callStatus === 'running' || callStatus === 'approved' || callStatus === 'pending_approval')
            : (!result || details?.async?.state === 'running');
        let cells: EvalCellView[];
        if (details?.cells && details.cells.length > 0) {
            cells = details.cells.map((cell, idx) => ({
                index: cell.index ?? idx,
                title: cell.title,
                code: cell.code,
                language: normalizeEvalLanguage(cell.language ?? details.language),
                output: cell.output || (details.cells?.length === 1 && nativeContent.text ? nativeContent.text : ''),
                views: cell.views as EvalViewEntry[] | undefined,
                status: cell.status,
                durationMs: cell.durationMs,
                exitCode: cell.exitCode,
                statusEvents: cell.statusEvents as EvalStatusEvent[] | undefined,
                statusEventsElided: cell.statusEventsElided,
            }));
        } else {
            cells = fallbackCellsFromInput(call);
            if (nativeContent.text && cells.length === 1) {
                const hasError = result?.isError === true || callStatus === 'failed' || callStatus === 'denied';
                cells[0] = {
                    ...cells[0],
                    output: nativeContent.text,
                    status: hasError ? 'error' : (isRunning ? 'running' : 'complete'),
                };
            }
        }

        const isFailed = result?.isError === true || callStatus === 'failed' || callStatus === 'denied' || details?.isError === true || cells.some((c) => c.status === 'error');
        let totalDurationMs = 0;
        let toolCallCount = 0;

        const countEvents = (events: EvalStatusEvent[] | undefined) => {
            if (!events) return;
            for (const ev of events) {
                if (ev && typeof ev.op === 'string' && isToolCallStatusEvent(ev)) {
                    toolCallCount += 1;
                }
            }
        };

        for (const cell of cells) {
            if (typeof cell.durationMs === 'number') totalDurationMs += cell.durationMs;
            countEvents(cell.statusEvents);
        }
        countEvents(details?.statusEvents as EvalStatusEvent[] | undefined);

        // Gather images: from details or from nativeContent
        const images: Array<{ mediaType: string; data: string; title?: string }> = [];
        if (details?.images && Array.isArray(details.images)) {
            for (const img of details.images) {
                if (typeof img.data === 'string' && typeof img.mimeType === 'string') {
                    images.push({ mediaType: img.mimeType, data: img.data, title: typeof img.title === 'string' ? img.title : undefined });
                }
            }
        } else if (nativeContent.images.length > 0) {
            for (const img of nativeContent.images) {
                images.push(img);
            }
        }

        return {
            cells,
            images,
            statusEvents: details?.statusEvents as EvalStatusEvent[] | undefined,
            statusEventsElided: details?.statusEventsElided,
            replies: details?.replies,
            isError: isFailed,
            notice: details?.notice,
            meta: details?.meta as EvalViewData['meta'],
            async: details?.async,
            isRunning,
            isFailed,
            totalDurationMs,
            toolCallCount,
        };
    }, [call, result]);
}
