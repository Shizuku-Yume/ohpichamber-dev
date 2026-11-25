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

const nonEmptyText = (value: string | undefined): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const taskInputItemSchema = z.object({
    name: z.string().optional(),
    agent: z.string().optional(),
    description: z.string().optional(),
    assignment: z.string().optional(),
    task: z.string().optional(),
    steps: z.array(z.string()).optional(),
    solutionSpace: z.string().optional(),
    isolated: z.boolean().optional(),
    model: z.string().optional(),
    effort: z.string().optional(),
});

const taskInputSchema = z.object({
    agent: z.string().optional(),
    context: z.string().optional(),
    tasks: z.array(taskInputItemSchema).optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    assignment: z.string().optional(),
    task: z.string().optional(),
    steps: z.array(z.string()).optional(),
    solutionSpace: z.string().optional(),
    isolated: z.boolean().optional(),
    model: z.string().optional(),
    effort: z.string().optional(),
});

interface NormalizedTaskItem {
    name: string | null;
    agent: string | null;
    description: string | null;
    assignment: string | null;
    extraTask: string | null;
    steps: string[];
    solutionSpace: string | null;
    isolated: boolean;
    model: string | null;
    effort: string | null;
}

const normalizeTaskItem = (
    item: z.infer<typeof taskInputItemSchema>,
    fallbackAgent: string | null,
): NormalizedTaskItem | null => {
    const name = nonEmptyText(item.name);
    const agent = nonEmptyText(item.agent) ?? fallbackAgent;
    const description = nonEmptyText(item.description);
    const assignmentText = nonEmptyText(item.assignment);
    const taskText = nonEmptyText(item.task);
    const assignment = assignmentText ?? taskText;
    const extraTask = assignmentText && taskText && assignmentText !== taskText ? taskText : null;
    const steps = (item.steps ?? []).map((step) => step.trim()).filter(Boolean);
    const solutionSpace = nonEmptyText(item.solutionSpace);
    const isolated = item.isolated === true;
    const model = nonEmptyText(item.model);
    const effort = nonEmptyText(item.effort);

    if (!name && !agent && !description && !assignment && !extraTask && steps.length === 0 && !solutionSpace && !isolated && !model && !effort) {
        return null;
    }

    return { name, agent, description, assignment, extraTask, steps, solutionSpace, isolated, model, effort };
};

const astEditOpSchema = z.object({
    pat: z.string().optional(),
    out: z.string().optional(),
});

const astEditInputSchema = z.object({
    ops: z.array(astEditOpSchema).optional(),
    paths: z.array(z.string()).optional(),
});

const todoListEntrySchema = z.object({
    phase: z.string(),
    items: z.array(z.string()),
});

const todoInputSchema = z.object({
    op: z.string().optional(),
    phase: z.string().optional(),
    task: z.union([z.string(), z.array(z.string())]).optional(),
    items: z.array(z.string()).optional(),
    list: z.array(todoListEntrySchema).optional(),
});

const imageInputItemSchema = z.object({
    path: z.string().optional(),
    data: z.string().optional(),
    mime_type: z.string().optional(),
});

const generateImageInputSchema = z.object({
    subject: z.string().optional(),
    action: z.string().optional(),
    scene: z.string().optional(),
    composition: z.string().optional(),
    lighting: z.string().optional(),
    style: z.string().optional(),
    text: z.string().optional(),
    aspect_ratio: z.string().optional(),
    image_size: z.string().optional(),
    model: z.string().optional(),
    changes: z.array(z.string()).optional(),
    input: z.array(imageInputItemSchema).optional(),
});

const IMAGE_SCALAR_KEYS = [
    'subject',
    'action',
    'scene',
    'composition',
    'lighting',
    'style',
    'text',
    'aspect_ratio',
    'image_size',
    'model',
] as const;

export type ResolvedStructuredToolInput =
    | { kind: 'task'; context: string | null; items: NormalizedTaskItem[] }
    | { kind: 'ast_edit'; ops: Array<{ pat: string; out: string }>; paths: string[] }
    | { kind: 'todo'; op: string | null; phase: string | null; tasks: string[]; list: Array<{ phase: string; items: string[] }> }
    | { kind: 'generate_image'; scalarRows: Array<{ key: string; value: string }>; changes: string[]; referencePaths: string[]; unnamedReferenceCount: number };

export function resolveStructuredToolInput(
    toolName: string,
    input: JsonObject | undefined,
    options?: { hideAstEditInput?: boolean; hideTodoInput?: boolean },
): ResolvedStructuredToolInput | null {
    if (!input) return null;
    switch (toolBaseName(toolName)) {
        case 'task': {
            const parsed = taskInputSchema.safeParse(input);
            if (!parsed.success) return null;
            const context = nonEmptyText(parsed.data.context);
            const topAgent = nonEmptyText(parsed.data.agent);
            const items: NormalizedTaskItem[] = [];
            if (parsed.data.tasks && parsed.data.tasks.length > 0) {
                for (const rawItem of parsed.data.tasks) {
                    const normalized = normalizeTaskItem(rawItem, topAgent);
                    if (normalized) items.push(normalized);
                }
            } else {
                const single = normalizeTaskItem(parsed.data, null);
                if (single) items.push(single);
            }
            return context || items.length > 0 ? { kind: 'task', context, items } : null;
        }
        case 'ast_edit': {
            if (options?.hideAstEditInput) return null;
            const parsed = astEditInputSchema.safeParse(input);
            if (!parsed.success) return null;
            const ops = (parsed.data.ops ?? [])
                .map((op) => ({ pat: op.pat?.trim() ?? '', out: op.out?.trim() ?? '' }))
                .filter((op) => op.pat.length > 0 || op.out.length > 0);
            const paths = (parsed.data.paths ?? []).map((entry) => entry.trim()).filter(Boolean);
            return ops.length > 0 || paths.length > 0 ? { kind: 'ast_edit', ops, paths } : null;
        }
        case 'todo': {
            if (options?.hideTodoInput) return null;
            const parsed = todoInputSchema.safeParse(input);
            if (!parsed.success) return null;
            const op = nonEmptyText(parsed.data.op);
            const phase = nonEmptyText(parsed.data.phase);
            const taskStrings = Array.isArray(parsed.data.task)
                ? parsed.data.task
                : parsed.data.task !== undefined
                    ? [parsed.data.task]
                    : [];
            const tasks = [...taskStrings, ...(parsed.data.items ?? [])].map((entry) => entry.trim()).filter(Boolean);
            const list = (parsed.data.list ?? [])
                .map((entry) => ({
                    phase: entry.phase.trim(),
                    items: entry.items.map((item) => item.trim()).filter(Boolean),
                }))
                .filter((entry) => entry.phase.length > 0 || entry.items.length > 0);
            return op || phase || tasks.length > 0 || list.length > 0
                ? { kind: 'todo', op, phase, tasks, list }
                : null;
        }
        case 'generate_image': {
            const parsed = generateImageInputSchema.safeParse(input);
            if (!parsed.success) return null;
            const scalarRows: Array<{ key: string; value: string }> = [];
            for (const key of IMAGE_SCALAR_KEYS) {
                const value = nonEmptyText(parsed.data[key]);
                if (value) scalarRows.push({ key, value });
            }
            const changes = (parsed.data.changes ?? []).map((entry) => entry.trim()).filter(Boolean);
            const referencePaths: string[] = [];
            let unnamedReferenceCount = 0;
            for (const item of parsed.data.input ?? []) {
                const pathValue = nonEmptyText(item.path);
                if (pathValue) referencePaths.push(pathValue);
                else if (item.data || item.mime_type) unnamedReferenceCount += 1;
            }
            return scalarRows.length > 0 || changes.length > 0 || referencePaths.length > 0 || unnamedReferenceCount > 0
                ? { kind: 'generate_image', scalarRows, changes, referencePaths, unnamedReferenceCount }
                : null;
        }
        default:
            return null;
    }
}
