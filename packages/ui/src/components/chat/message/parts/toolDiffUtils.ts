import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { NATIVE_TOOLS, parseNativeReadPath } from '@/lib/toolHelpers';
import { z } from 'zod';

const editFileSchema = z.object({
    path: z.string().min(1),
    diff: z.string(),
    op: z.enum(['create', 'delete', 'update']).optional(),
    move: z.string().optional(),
    sourcePath: z.string().optional(),
    isError: z.boolean().optional(),
});
const editResultSchema = z.object({
    details: z.object({
        diff: z.string(),
        path: z.string().optional(),
        op: z.enum(['create', 'delete', 'update']).optional(),
        move: z.string().optional(),
        sourcePath: z.string().optional(),
        perFileResults: z.array(editFileSchema.nullable().catch(null)).optional(),
    }),
});
const writeResultSchema = z.object({ details: z.object({ resolvedPath: z.string().min(1) }) });
const pathValueSchema = z.string();

const WORKSPACE_PATH_SENTINEL = '[workspace]/';

/** The relative path a privacy-sanitized `[workspace]/…` tool target names.
 * The placeholder stands for the session workspace root, never a directory of
 * its own: a target that climbs above that root, starts another root (POSIX,
 * UNC, Windows drive), or carries a backslash separator names no workspace file
 * and is refused (null). Every path without the sentinel is unrelated
 * (undefined). `normalizeFilePath` later trims, collapses and re-splits the
 * value, so the checks run against that same shape.
 */
function workspaceRelativePath(path: string): string | null | undefined {
    if (!path.startsWith(WORKSPACE_PATH_SENTINEL)) return undefined;
    const relative = path.slice(WORKSPACE_PATH_SENTINEL.length);
    if (!relative || relative !== relative.trim() || relative.includes('\\') || relative.startsWith('/') || /^[A-Za-z]:/.test(relative)) return null;
    let depth = 0;
    for (const part of relative.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (depth === 0) return null;
            depth -= 1;
        } else {
            depth += 1;
        }
    }
    return relative;
}

/** Display/quick-open form of a tool path. Sanitized workspace targets become
 * their workspace-relative path; every other path, including a sentinel target
 * that names something outside the workspace, is returned unchanged. */
export function normalizeWorkspaceToolPath(path: string): string {
    return workspaceRelativePath(path) ?? path;
}


type ToolPart = ToolCallPart | ToolResultPart;
export interface ToolFileChange {
    path: string;
    sourcePath?: string;
    op?: 'create' | 'delete' | 'update';
    diff?: string;
    additions?: number;
    deletions?: number;
}
export interface ToolDiff {
    path: string;
    diff: string;
    additions: number;
    deletions: number;
}

/** Convert the SDK's numbered compact diff, not a tool input, to unified hunks.
 * Context/deletions carry old line numbers; additions carry new line numbers.
 * Blank/ellipsis rows separate regions, as in pi-tui's nativeDiff renderer.
 */
function parseNativeDiff(path: string, text: string): Omit<ToolDiff, 'path'> | undefined {
    if (!text.trim()) return { diff: '', additions: 0, deletions: 0 };
    const hunks: string[] = [];
    let body: string[] = [];
    let oldStart = 0;
    let newStart = 0;
    let oldCount = 0;
    let newCount = 0;
    let delta = 0;
    let additions = 0;
    let deletions = 0;
    const close = () => {
        if (!body.length) return;
        hunks.push(`@@ -${oldCount ? oldStart : Math.max(0, oldStart - 1)},${oldCount} +${newCount ? newStart : Math.max(0, newStart - 1)},${newCount} @@\n${body.join('\n')}`);
        delta += newCount - oldCount;
        body = [];
        oldCount = 0;
        newCount = 0;
    };
    for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
        if (!raw.trim() || /^(?:\s*(?:…|\.\.\.)\s*|\s+\d+\|(?:…|\.\.\.))$/.test(raw)) {
            close();
            continue;
        }
        const row = /^([+\- ])\s*(\d+)\|(.*)$/.exec(raw);
        if (!row) return undefined;
        const marker = row[1];
        const number = Number(row[2]);
        if (!body.length) {
            oldStart = marker === '+' ? number - delta : number;
            newStart = marker === '+' ? number : number + delta;
        }
        body.push(`${marker}${row[3]}`);
        if (marker !== '+') oldCount++;
        if (marker !== '-') newCount++;
        if (marker === '+') additions++;
        if (marker === '-') deletions++;
    }
    close();
    if (!hunks.length) return undefined;
    return { diff: `--- a/${path}\n+++ b/${path}\n${hunks.join('\n')}\n`, additions, deletions };
}

/** Successful native mutations only; call inputs are never evidence of a diff. */
export function getToolFileChanges(part: ToolPart, pairedCall?: ToolCallPart): ToolFileChange[] {
    if (part.type !== 'tool_result' || part.isError) return [];
    const call = pairedCall?.toolCallId === part.toolCallId && pairedCall.toolName === part.toolName ? pairedCall : undefined;
    if (part.toolName === 'write') {
        const resolved = writeResultSchema.safeParse(part.output).data?.details.resolvedPath;
        const inputPath = pathValueSchema.safeParse(call?.input.path).data;
        // Writes to tool devices/coordination URLs do not mutate project files.
        const path = resolved ?? (inputPath && !/^[a-z][a-z0-9+.-]*:\/\//i.test(inputPath) ? inputPath : undefined);
        return path && workspaceRelativePath(path) !== null ? [{ path: normalizeWorkspaceToolPath(path) }] : [];
    }
    if (part.toolName !== 'edit') return [];
    const details = editResultSchema.safeParse(part.output).data?.details;
    if (!details) return [];
    const files = details.perFileResults ?? (details.path ? [{ ...details, path: details.path }] : []);
    return files.flatMap((file): ToolFileChange[] => {
        if (!file || ('isError' in file && file.isError)) return [];
        const path = file.move ?? file.path;
        if (workspaceRelativePath(path) === null) return [];
        const parsed = parseNativeDiff(path, file.diff);
        return [{
            path: normalizeWorkspaceToolPath(path),
            sourcePath: file.sourcePath ? normalizeWorkspaceToolPath(file.sourcePath) : undefined,
            op: file.op,
            ...parsed,
        }];
    });
}

export function getToolDiffs(part: ToolPart, pairedCall?: ToolCallPart): ToolDiff[] {
    return getToolFileChanges(part, pairedCall).flatMap((file) =>
        file.diff && file.additions !== undefined && file.deletions !== undefined
            ? [{ path: file.path, diff: file.diff, additions: file.additions, deletions: file.deletions }]
            : []);
}

export function getPrimaryToolPath(part: ToolPart, pairedCall?: ToolCallPart): string | null {
    if (part.type === 'tool_result') return getToolFileChanges(part, pairedCall).find((file) => file.op !== 'delete')?.path ?? null;
    const path = pathValueSchema.safeParse(part.input.path).data;
    return (part.toolName === 'edit' || part.toolName === 'write') && path && workspaceRelativePath(path) !== null
        ? normalizeWorkspaceToolPath(path)
        : null;
}

export function extractFirstChangedLineFromDiff(diff: string): number | undefined {
    let current: number | undefined;
    let first: number | undefined;
    for (const line of diff.split('\n')) {
        const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        if (header) {
            current = Math.max(1, Number(header[1]));
            first ??= current;
        } else if (current !== undefined) {
            if (line.startsWith('+')) return current;
            if (line.startsWith(' ')) current++;
        }
    }
    return first;
}

export function resolveToolQuickOpenTarget(part: ToolPart, pairedCall?: ToolCallPart): { filePath: string; line?: number } | null {
    const call = part.type === 'tool_call' ? part : pairedCall?.toolCallId === part.toolCallId && pairedCall.toolName === part.toolName ? pairedCall : undefined;
    const readPath = pathValueSchema.safeParse(call?.input.path).data;
    if (call?.toolName === NATIVE_TOOLS.read && readPath) {
        const parsed = parseNativeReadPath(readPath);
        if (!parsed.path || workspaceRelativePath(parsed.path) === null) return null;
        return { filePath: normalizeWorkspaceToolPath(parsed.path), line: parsed.line };
    }
    const filePath = getPrimaryToolPath(part, pairedCall);
    if (!filePath) return null;
    const diff = getToolDiffs(part, pairedCall).find((file) => file.path === filePath)?.diff;
    return { filePath, line: diff ? extractFirstChangedLineFromDiff(diff) : undefined };
}
