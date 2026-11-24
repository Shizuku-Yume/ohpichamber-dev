import {
    flatScalarInputRows,
    isEditTool,
    isEvalTool,
    isQuestionTool,
    isRawInputSuppressedTool,
    isShellTool,
    toolBaseName,
} from '@/lib/toolPresentation';
import { formatToolInput } from '@/lib/toolHelpers';
import type { JsonObject, JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';

const readDisplayContentSchema = z.object({
    text: z.string(),
    startLine: z.number().optional(),
    lineNumbers: z.array(z.number().nullable()).optional(),
});

const displayContentDetailsSchema = z.object({
    displayContent: z.union([z.string(), readDisplayContentSchema]).optional(),
});

export function preferredDisplayContent(details: JsonValue | undefined, fallbackText: string): string {
    if (details === undefined || details === null) return fallbackText;
    const parsed = displayContentDetailsSchema.safeParse(details);
    if (!parsed.success || parsed.data.displayContent === undefined) return fallbackText;

    const stringContent = z.string().safeParse(parsed.data.displayContent).data;
    const text = stringContent ?? readDisplayContentSchema.parse(parsed.data.displayContent).text;
    return text.trim().length > 0 ? text : fallbackText;
}
export const STRUCTURED_CARD_TOOL_NAMES = [
    'debug',
    'github',
    'goal',
    'security_scan',
    'checkpoint',
    'rewind',
    'yield',
    'think',
    'report_issue',
    'resolve',
    'reject',
    'propose',
] as const;

const STRUCTURED_CARD_TOOL_SET: ReadonlySet<string> = new Set(STRUCTURED_CARD_TOOL_NAMES);

const DISPLAY_CONTENT_TOOL_MAP = {
    read: true,
    grep: true,
    ast_grep: true,
} as const;

const VIBE_TOOL_MAP = {
    vibe_spawn: true,
    vibe_send: true,
    vibe_wait: true,
    vibe_kill: true,
    vibe_list: true,
} as const;

export function isStructuredCardTool(toolName: string | undefined): boolean {
    return STRUCTURED_CARD_TOOL_SET.has(toolBaseName(toolName));
}

export function isVibeCardTool(toolName: string | undefined): boolean {
    return Object.hasOwn(VIBE_TOOL_MAP, toolBaseName(toolName));
}

export function isWaitCardTool(toolName: string | undefined): boolean {
    return toolBaseName(toolName) === 'wait';
}

export function isStructuredExpandedTool(toolName: string | undefined): boolean {
    const base = toolBaseName(toolName);
    return Object.hasOwn(VIBE_TOOL_MAP, base) || base === 'wait' || STRUCTURED_CARD_TOOL_SET.has(base);
}

export function preferToolDisplayContent<T extends { text: string; details?: JsonValue }>(
    toolName: string | undefined,
    resultContent: T,
): T {
    if (!Object.hasOwn(DISPLAY_CONTENT_TOOL_MAP, toolBaseName(toolName))) return resultContent;
    const preferred = preferredDisplayContent(resultContent.details, resultContent.text);
    return preferred === resultContent.text ? resultContent : { ...resultContent, text: preferred };
}

interface ExpandedInputPreview {
    scalarInputRows: Array<{ key: string; value: string }> | null;
    inputTextContent: string;
    hasInputText: boolean;
    hasScalarInputRows: boolean;
}

export function resolveExpandedInputPreview(params: {
    input: JsonObject | undefined;
    toolName: string;
    isWrite: boolean;
    hideToolInputPreview: boolean;
    writeContent: string | undefined;
}): ExpandedInputPreview {
    const { input, toolName, isWrite, hideToolInputPreview, writeContent } = params;
    if (!input || Object.keys(input).length === 0) {
        return { scalarInputRows: null, inputTextContent: '', hasInputText: false, hasScalarInputRows: false };
    }
    const suppressRawInput = isRawInputSuppressedTool(toolName);
    const skipScalar = isWrite
        || isShellTool(toolName)
        || isEvalTool(toolName)
        || isEditTool(toolName)
        || toolBaseName(toolName) === 'apply_patch'
        || isQuestionTool(toolName)
        || suppressRawInput;
    const scalarInputRows = skipScalar ? null : flatScalarInputRows(input);
    const inputTextContent = isWrite || suppressRawInput || scalarInputRows !== null
        ? ''
        : formatToolInput(input, toolName);
    const blocked = hideToolInputPreview || Boolean(writeContent);
    return {
        scalarInputRows,
        inputTextContent,
        hasInputText: !blocked && inputTextContent.trim().length > 0,
        hasScalarInputRows: !blocked && scalarInputRows !== null && scalarInputRows.length > 0,
    };
}
