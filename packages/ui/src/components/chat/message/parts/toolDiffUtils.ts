import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { isAstEditTool, isEditTool, isReadTool, isWriteTool, parseNativeReadPath } from '@/lib/toolHelpers';
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

<<<<<<< HEAD
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
||||||| bc50ba56aa
const APPLY_PATCH_ENVELOPE_PATTERN = /^\*\*\*\s+(?:Begin Patch|End Patch|Add File:|Update File:|Delete File:|Move to:)/m;
const HUNK_HEADER_PATTERN = /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/m;
const GIT_DIFF_FILE_BREAK_PATTERN = /(?=^diff --git\s+)/gm;
const GIT_DIFF_FILE_BREAK_TEST = /^diff --git\s+/m;
const UNIFIED_DIFF_FILE_BREAK_PATTERN = /(?=^---\s+\S)/gm;
const UNIFIED_DIFF_FILE_BREAK_TEST = /^---\s+\S/m;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const normalizePatchText = (patch: string): string => {
    return patch.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
};

const normalizeBareUnifiedHeaderLines = (patch: string): string => {
    let reachedHunk = false;
    return patch.split('\n').map((line) => {
        if (line.startsWith('@@')) {
            reachedHunk = true;
            return line;
        }

        if (reachedHunk) {
            return line;
        }

        const headerMatch = line.match(/^\s*(---|\+\+\+)\s+(.+)$/);
        if (!headerMatch) {
            return line;
        }

        const marker = headerMatch[1];
        const rawPath = headerMatch[2] ?? '';
        if (rawPath.trim() === '/dev/null') {
            return `${marker} /dev/null`;
        }

        return `${marker} ${rawPath.replace(/\\/g, '/')}`;
    }).join('\n');
};

const normalizeLooseUnifiedHunkBody = (patch: string): string => {
    let inHunk = false;
    return patch.split('\n').map((line) => {
        if (line.startsWith('@@')) {
            inHunk = true;
            return line;
        }

        if (!inHunk || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('diff --git')) {
            return line;
        }

        if (line.length === 0) {
            return ' ';
        }

        const first = line[0];
        if (first === ' ' || first === '+' || first === '-' || first === '\\') {
            return line;
        }

        return ` ${line}`;
    }).join('\n');
};

const formatHunkRange = (start: string, count: number): string => {
    return count === 1 ? start : `${start},${count}`;
};

const recountUnifiedHunkHeaders = (patch: string): string => {
    const lines = patch.split('\n');
    const result = [...lines];

    for (let index = 0; index < lines.length; index += 1) {
        const header = lines[index] ?? '';
        const match = header.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
        if (!match) {
            continue;
        }

        let oldCount = 0;
        let newCount = 0;
        for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
            const line = lines[bodyIndex] ?? '';
            if (line.startsWith('@@') || line.startsWith('--- ') || line.startsWith('diff --git')) {
                break;
            }

            if (line.startsWith('\\')) {
                continue;
            }

            if (line.startsWith('+')) {
                newCount += 1;
                continue;
            }

            if (line.startsWith('-')) {
                oldCount += 1;
                continue;
            }

            oldCount += 1;
            newCount += 1;
        }

        result[index] = `@@ -${formatHunkRange(match[1] ?? '0', oldCount)} +${formatHunkRange(match[2] ?? '0', newCount)} @@${match[3] ?? ''}`;
    }

    return result.join('\n');
};

const normalizeLooseUnifiedPatch = (patch: string): string => {
    return recountUnifiedHunkHeaders(normalizeLooseUnifiedHunkBody(normalizeBareUnifiedHeaderLines(normalizePatchText(patch))));
};

export const getPatchText = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
        return /\S/.test(value) ? value : undefined;
    }

    if (isRecord(value)) {
        const patch = value.patch;
        if (typeof patch === 'string') {
            return /\S/.test(patch) ? patch : undefined;
        }
    }

    return undefined;
};

export const getApplyPatchFilePath = (file: unknown): string | null => {
    if (!isRecord(file)) {
        return null;
    }

    // v2 reports `file` (FileDiff.Info); the other keys keep MCP and plugin
    // tools that use the older naming working.
    return typeof file.file === 'string'
        ? file.file
        : typeof file.movePath === 'string'
            ? file.movePath
            : typeof file.filePath === 'string'
                ? file.filePath
                : typeof file.relativePath === 'string'
                    ? file.relativePath
                    : null;
};

/** v2 file tools report `path`; the other keys cover MCP and plugin tools. */
const readInputPath = (input: Record<string, unknown> | undefined): string | null => (
    typeof input?.path === 'string'
        ? input.path
        : typeof input?.filePath === 'string'
            ? input.filePath
            : typeof input?.file_path === 'string'
                ? input.file_path
                : null
);

export const getPrimaryToolPath = (
    toolName: string,
    input: Record<string, unknown> | undefined,
    metadata: Record<string, unknown> | undefined,
): string | null => {
    if (isPatchTool(toolName)) {
        const files = Array.isArray(metadata?.files) ? metadata.files : [];
        for (const file of files) {
            if (isRecord(file) && file.type !== 'delete' && file.status !== 'deleted') {
                const filePath = getApplyPatchFilePath(file);
                if (filePath) {
                    return filePath;
                }
            }
        }
        return null;
    }

    if (isEditTool(toolName)) {
        const files = Array.isArray(metadata?.files) ? metadata.files : [];
        const first = files.find((file) => isRecord(file));
        const fromMetadata = first ? getApplyPatchFilePath(first) : null;
        return fromMetadata ?? readInputPath(input);
    }

    if (isWriteTool(toolName)) {
        return readInputPath(input);
    }

    return null;
};

/** Only `edit` and `patch` results carry `metadata.files` with diffs in v2. */
const supportsDiffMetadata = (toolName: string): boolean => carriesFileDiffs(toolName);

const getMetadataFileForPath = (
    metadata: Record<string, unknown>,
    preferredPath?: string,
): Record<string, unknown> | undefined => {
    const files = Array.isArray(metadata.files) ? metadata.files : [];
    if (!preferredPath) {
        const first = files[0];
        return isRecord(first) ? first : undefined;
    }

    return files.find((file): file is Record<string, unknown> => (
        isRecord(file)
        && (file.file === preferredPath
            || file.relativePath === preferredPath
            || file.filePath === preferredPath
            || file.movePath === preferredPath)
    ));
};

export const getPrimaryDiffFromMetadata = (
    toolName: string,
    metadata?: Record<string, unknown>,
    preferredPath?: string,
): string | undefined => {
    if (!metadata || !supportsDiffMetadata(toolName)) {
        return undefined;
    }

    const matchedFile = getMetadataFileForPath(metadata, preferredPath);
    const filePatch = getPatchText(matchedFile?.patch) ?? getPatchText(matchedFile?.diff);
    if (filePatch) {
        return filePatch;
    }

    return getPatchText(metadata.patch) ?? getPatchText(metadata.diff);
};

/** Top-level patch a tool card falls back to when metadata carries no per-file entries. */
export const getToolFallbackDiff = (metadata: Record<string, unknown> | undefined): string | undefined => {
    const fileDiff = isRecord(metadata?.filediff) ? metadata.filediff : undefined;
    return getPatchText(metadata?.patch)
        ?? getPatchText(metadata?.diff)
        ?? getPatchText(fileDiff?.patch)
        ?? getPatchText(fileDiff?.diff);
};

export const extractFirstChangedLineFromDiff = (diffText: string): number | undefined => {
    if (!diffText) {
        return undefined;
    }

    let currentNewLine: number | undefined;
    let firstHunkStart: number | undefined;
    for (const rawLine of diffText.split('\n')) {
        const line = rawLine.replace(/\r$/, '');
        const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
        if (hunkMatch) {
            const parsed = Number.parseInt(hunkMatch[1] ?? '', 10);
            if (Number.isFinite(parsed)) {
                currentNewLine = Math.max(1, parsed);
                firstHunkStart ??= currentNewLine;
            }
            continue;
        }

        if (currentNewLine === undefined) {
            continue;
        }
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) {
            continue;
        }
        if (line.startsWith('+')) {
            return currentNewLine;
        }
        if (line.startsWith(' ')) {
            currentNewLine += 1;
        }
    }

    return firstHunkStart;
};

export const getFirstChangedLineFromMetadata = (
    toolName: string,
    metadata?: Record<string, unknown>,
    preferredPath?: string,
): number | undefined => {
    if (!metadata || !supportsDiffMetadata(toolName)) {
        return undefined;
    }

    if (preferredPath) {
        const matchedFile = getMetadataFileForPath(metadata, preferredPath);
        const matchedPatch = getPatchText(matchedFile?.patch) ?? getPatchText(matchedFile?.diff);
        if (matchedPatch) {
            const matchedLine = extractFirstChangedLineFromDiff(matchedPatch);
            if (matchedLine !== undefined) {
                return matchedLine;
            }
        }
    }

    const topLevelPatch = getPatchText(metadata.patch) ?? getPatchText(metadata.diff);
    if (topLevelPatch) {
        const topLevelLine = extractFirstChangedLineFromDiff(topLevelPatch);
        if (topLevelLine !== undefined) {
            return topLevelLine;
        }
    }

    const firstFile = getMetadataFileForPath(metadata);
    const firstPatch = getPatchText(firstFile?.patch) ?? getPatchText(firstFile?.diff);
    return firstPatch ? extractFirstChangedLineFromDiff(firstPatch) : undefined;
};

/**
 * Quick-open target for a tool card: the primary mutated file plus the diff
 * entry the expanded card renders for it. Both the collapsed header icon and
 * the expanded "open file" button resolve their line from the same entry
 * patch, so they always land on the same line.
 */
export const resolveToolQuickOpenTarget = (
    toolName: string,
    input: Record<string, unknown> | undefined,
    metadata: Record<string, unknown> | undefined,
): { filePath: string; line?: number; patch?: string } | null => {
    const filePath = getPrimaryToolPath(toolName, input, metadata);
    if (!filePath) {
        return null;
=======
const APPLY_PATCH_ENVELOPE_PATTERN = /^\*\*\*\s+(?:Begin Patch|End Patch|Add File:|Update File:|Delete File:|Move to:)/m;
const HUNK_HEADER_PATTERN = /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/m;
const GIT_DIFF_FILE_BREAK_PATTERN = /(?=^diff --git\s+)/gm;
const GIT_DIFF_FILE_BREAK_TEST = /^diff --git\s+/m;
const UNIFIED_DIFF_FILE_BREAK_PATTERN = /(?=^---\s+\S)/gm;
const UNIFIED_DIFF_FILE_BREAK_TEST = /^---\s+\S/m;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const normalizePatchText = (patch: string): string => {
    return patch.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
};

const normalizeBareUnifiedHeaderLines = (patch: string): string => {
    let reachedHunk = false;
    return patch.split('\n').map((line) => {
        if (line.startsWith('@@')) {
            reachedHunk = true;
            return line;
        }

        if (reachedHunk) {
            return line;
        }

        const headerMatch = line.match(/^\s*(---|\+\+\+)\s+(.+)$/);
        if (!headerMatch) {
            return line;
        }

        const marker = headerMatch[1];
        const rawPath = headerMatch[2] ?? '';
        if (rawPath.trim() === '/dev/null') {
            return `${marker} /dev/null`;
        }

        return `${marker} ${rawPath.replace(/\\/g, '/')}`;
    }).join('\n');
};

const normalizeLooseUnifiedHunkBody = (patch: string): string => {
    let inHunk = false;
    return patch.split('\n').map((line) => {
        if (line.startsWith('@@')) {
            inHunk = true;
            return line;
        }

        if (!inHunk || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('diff --git')) {
            return line;
        }

        if (line.length === 0) {
            return ' ';
        }

        const first = line[0];
        if (first === ' ' || first === '+' || first === '-' || first === '\\') {
            return line;
        }

        return ` ${line}`;
    }).join('\n');
};

const formatHunkRange = (start: string, count: number): string => {
    return count === 1 ? start : `${start},${count}`;
};

const recountUnifiedHunkHeaders = (patch: string): string => {
    const lines = patch.split('\n');
    const result = [...lines];

    for (let index = 0; index < lines.length; index += 1) {
        const header = lines[index] ?? '';
        const match = header.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
        if (!match) {
            continue;
        }

        let oldCount = 0;
        let newCount = 0;
        for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
            const line = lines[bodyIndex] ?? '';
            if (line.startsWith('@@') || line.startsWith('--- ') || line.startsWith('diff --git')) {
                break;
            }

            if (line.startsWith('\\')) {
                continue;
            }

            if (line.startsWith('+')) {
                newCount += 1;
                continue;
            }

            if (line.startsWith('-')) {
                oldCount += 1;
                continue;
            }

            oldCount += 1;
            newCount += 1;
        }

        result[index] = `@@ -${formatHunkRange(match[1] ?? '0', oldCount)} +${formatHunkRange(match[2] ?? '0', newCount)} @@${match[3] ?? ''}`;
    }

    return result.join('\n');
};

const normalizeLooseUnifiedPatch = (patch: string): string => {
    return recountUnifiedHunkHeaders(normalizeLooseUnifiedHunkBody(normalizeBareUnifiedHeaderLines(normalizePatchText(patch))));
};

export const getPatchText = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
        return /\S/.test(value) ? value : undefined;
    }

    if (isRecord(value)) {
        const patch = value.patch;
        if (typeof patch === 'string') {
            return /\S/.test(patch) ? patch : undefined;
        }
    }

    return undefined;
};

export const getApplyPatchFilePath = (file: unknown): string | null => {
    if (!isRecord(file)) {
        return null;
    }

    return typeof file.file === 'string'
        ? file.file
        : typeof file.movePath === 'string'
            ? file.movePath
            : typeof file.filePath === 'string'
                ? file.filePath
                : typeof file.relativePath === 'string'
                    ? file.relativePath
                    : null;
};

const readInputPath = (input: Record<string, unknown> | undefined): string | null => (
    typeof input?.path === 'string'
        ? input.path
        : typeof input?.filePath === 'string'
            ? input.filePath
            : typeof input?.file_path === 'string'
                ? input.file_path
                : null
);

export const getPrimaryToolPath = (
    toolName: string,
    input: Record<string, unknown> | undefined,
    metadata: Record<string, unknown> | undefined,
): string | null => {
    if (isPatchTool(toolName)) {
        const files = Array.isArray(metadata?.files) ? metadata.files : [];
        for (const file of files) {
            if (isRecord(file) && file.type !== 'delete' && file.status !== 'deleted') {
                const filePath = getApplyPatchFilePath(file);
                if (filePath) {
                    return filePath;
                }
            }
        }
        return null;
    }

    if (isEditTool(toolName)) {
        const files = Array.isArray(metadata?.files) ? metadata.files : [];
        const first = files.find((file) => isRecord(file));
        const fromMetadata = first ? getApplyPatchFilePath(first) : null;
        return fromMetadata ?? readInputPath(input);
    }

    if (isWriteTool(toolName)) {
        return readInputPath(input);
    }

    return null;
};

const supportsDiffMetadata = (toolName: string): boolean => carriesFileDiffs(toolName);

const getMetadataFileForPath = (
    metadata: Record<string, unknown>,
    preferredPath?: string,
): Record<string, unknown> | undefined => {
    const files = Array.isArray(metadata.files) ? metadata.files : [];
    if (!preferredPath) {
        const first = files[0];
        return isRecord(first) ? first : undefined;
    }

    return files.find((file): file is Record<string, unknown> => (
        isRecord(file)
        && (file.file === preferredPath
            || file.relativePath === preferredPath
            || file.filePath === preferredPath
            || file.movePath === preferredPath)
    ));
};

export const getPrimaryDiffFromMetadata = (
    toolName: string,
    metadata?: Record<string, unknown>,
    preferredPath?: string,
): string | undefined => {
    if (!metadata || !supportsDiffMetadata(toolName)) {
        return undefined;
    }

    const matchedFile = getMetadataFileForPath(metadata, preferredPath);
    const filePatch = getPatchText(matchedFile?.patch) ?? getPatchText(matchedFile?.diff);
    if (filePatch) {
        return filePatch;
    }

    return getPatchText(metadata.patch) ?? getPatchText(metadata.diff);
};

export const getToolFallbackDiff = (metadata: Record<string, unknown> | undefined): string | undefined => {
    const fileDiff = isRecord(metadata?.filediff) ? metadata.filediff : undefined;
    return getPatchText(metadata?.patch)
        ?? getPatchText(metadata?.diff)
        ?? getPatchText(fileDiff?.patch)
        ?? getPatchText(fileDiff?.diff);
};

export const extractFirstChangedLineFromDiff = (diffText: string): number | undefined => {
    if (!diffText) {
        return undefined;
    }

    let currentNewLine: number | undefined;
    let firstHunkStart: number | undefined;
    for (const rawLine of diffText.split('\n')) {
        const line = rawLine.replace(/\r$/, '');
        const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
        if (hunkMatch) {
            const parsed = Number.parseInt(hunkMatch[1] ?? '', 10);
            if (Number.isFinite(parsed)) {
                currentNewLine = Math.max(1, parsed);
                firstHunkStart ??= currentNewLine;
            }
            continue;
        }

        if (currentNewLine === undefined) {
            continue;
        }
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) {
            continue;
        }
        if (line.startsWith('+')) {
            return currentNewLine;
        }
        if (line.startsWith(' ')) {
            currentNewLine += 1;
        }
    }

    return firstHunkStart;
};

export const getFirstChangedLineFromMetadata = (
    toolName: string,
    metadata?: Record<string, unknown>,
    preferredPath?: string,
): number | undefined => {
    if (!metadata || !supportsDiffMetadata(toolName)) {
        return undefined;
    }

    if (preferredPath) {
        const matchedFile = getMetadataFileForPath(metadata, preferredPath);
        const matchedPatch = getPatchText(matchedFile?.patch) ?? getPatchText(matchedFile?.diff);
        if (matchedPatch) {
            const matchedLine = extractFirstChangedLineFromDiff(matchedPatch);
            if (matchedLine !== undefined) {
                return matchedLine;
            }
        }
    }

    const topLevelPatch = getPatchText(metadata.patch) ?? getPatchText(metadata.diff);
    if (topLevelPatch) {
        const topLevelLine = extractFirstChangedLineFromDiff(topLevelPatch);
        if (topLevelLine !== undefined) {
            return topLevelLine;
        }
    }

    const firstFile = getMetadataFileForPath(metadata);
    const firstPatch = getPatchText(firstFile?.patch) ?? getPatchText(firstFile?.diff);
    return firstPatch ? extractFirstChangedLineFromDiff(firstPatch) : undefined;
};

export const resolveToolQuickOpenTarget = (
    toolName: string,
    input: Record<string, unknown> | undefined,
    metadata: Record<string, unknown> | undefined,
): { filePath: string; line?: number; patch?: string } | null => {
    const filePath = getPrimaryToolPath(toolName, input, metadata);
    if (!filePath) {
        return null;
>>>>>>> upstream/main
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

function normalizeFileOp(op?: string): 'create' | 'delete' | 'update' | undefined {
    return op === 'create' || op === 'delete' || op === 'update' ? op : undefined;
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

function parseDiffHunks(path: string, text: string): Omit<ToolDiff, 'path'> | undefined {
    if (!text.trim()) return { diff: '', additions: 0, deletions: 0 };
    if (text.startsWith('---') || text.startsWith('@@')) {
        let additions = 0;
        let deletions = 0;
        for (const line of text.split('\n')) {
            if (line.startsWith('+++') || line.startsWith('---')) continue;
            if (line.startsWith('+')) additions++;
            else if (line.startsWith('-')) deletions++;
        }
        return { diff: text, additions, deletions };
    }
    return parseNativeDiff(path, text);
}

const AST_EDIT_CHANGE_LINE_RE = /^([+\- ])\s*(\d+)\s*(?:│|[:|])\s*(.*)$/;

function parseAstEditOutput(output: unknown): ToolFileChange[] {
    if (!output || typeof output !== 'object') return [];
    if ('details' in output && output.details && typeof output.details === 'object') {
        const details = output.details;
        if ('perFileResults' in details && Array.isArray(details.perFileResults)) {
            return details.perFileResults.flatMap((file: unknown): ToolFileChange[] => {
                if (!file || typeof file !== 'object' || !('path' in file) || typeof file.path !== 'string') return [];
                const diffText = 'diff' in file && typeof file.diff === 'string' ? file.diff : '';
                const parsed = parseNativeDiff(file.path, diffText);
                return [{
                    path: normalizeWorkspaceToolPath(file.path),
                    op: 'update',
                    ...parsed,
                }];
            });
        }
    }
    let text = '';
    if ('details' in output && output.details && typeof output.details === 'object' && 'displayContent' in output.details && typeof output.details.displayContent === 'string') {
        text = output.details.displayContent;
    } else if ('content' in output && Array.isArray(output.content)) {
        text = output.content
            .filter((block: unknown) => Boolean(block && typeof block === 'object' && 'type' in block && block.type === 'text' && 'text' in block && typeof block.text === 'string'))
            .map((block: { text: string }) => block.text)
            .join('\n');
    }
    if (text) {
        const files: ToolFileChange[] = [];
        let currentDir = '';
        let currentPath: string | null = null;
        let hunks: string[] = [];
        let additions = 0;
        let deletions = 0;
        let lastOld: number | undefined;

<<<<<<< HEAD
        const flushCurrent = () => {
            if (currentPath && hunks.length > 0) {
                files.push({
                    path: normalizeWorkspaceToolPath(currentPath),
                    op: 'update',
                    diff: `--- a/${currentPath}\n+++ b/${currentPath}\n${hunks.join('\n')}\n`,
                    additions,
                    deletions,
||||||| bc50ba56aa
    try {
        const parsedPatches = parsePatchFiles(normalized, undefined, true);
        if (parsedPatches.length !== 1) {
            return null;
        }

        const files = parsedPatches[0]?.files ?? [];
        const file = files[0];
        if (files.length !== 1 || !file || file.hunks.length === 0) {
            return null;
        }

        return {
            patch: normalized,
            title: normalizeParsedPath(file.name),
        };
    } catch {
        return null;
    }
};

const getPatchChunks = (patch: string): string[] => {
    const isGitDiff = GIT_DIFF_FILE_BREAK_TEST.test(patch);
    const hasUnifiedDiff = UNIFIED_DIFF_FILE_BREAK_TEST.test(patch);
    if (!isGitDiff && !hasUnifiedDiff) {
        return [];
    }

    return patch
        .split(isGitDiff ? GIT_DIFF_FILE_BREAK_PATTERN : UNIFIED_DIFF_FILE_BREAK_PATTERN)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0);
};

const getPatchEntriesFromText = (
    patch: string,
    fallbackTitle: string,
    idPrefix: string,
    resolveTitle: (path: string) => string,
): DiffPatchEntry[] => {
    if (isToolDiffPreviewOversized(patch)) {
        return [{
            id: `${idPrefix}-0`,
            title: resolveTitle(fallbackTitle),
            patch,
            renderMode: 'text',
        }];
    }

    const normalized = normalizeLooseUnifiedPatch(patch);
    if (!normalized) {
        return [];
    }

    const direct = getRenderablePatchInfo(normalized);
    if (direct) {
        const title = direct.title ? resolveTitle(direct.title) : resolveTitle(fallbackTitle);
        return [{ id: `${idPrefix}-0`, title, patch: direct.patch, renderMode: 'diff' }];
    }

    const chunkEntries: DiffPatchEntry[] = [];
    for (const chunk of getPatchChunks(normalized)) {
        const info = getRenderablePatchInfo(chunk);
        const title = info?.title ? resolveTitle(info.title) : resolveTitle(fallbackTitle);
        if (!info) {
            if (HUNK_HEADER_PATTERN.test(chunk) || GIT_DIFF_FILE_BREAK_TEST.test(chunk) || UNIFIED_DIFF_FILE_BREAK_TEST.test(chunk)) {
                chunkEntries.push({
                    id: `${idPrefix}-${chunkEntries.length}`,
                    title,
                    patch: chunk,
                    renderMode: 'text',
=======
    try {
        const parsedPatches = parsePatchFiles(normalized, { throwOnError: true });
        if (parsedPatches.length !== 1) {
            return null;
        }

        const files = parsedPatches[0]?.files ?? [];
        const file = files[0];
        if (files.length !== 1 || !file || file.hunks.length === 0) {
            return null;
        }

        return {
            patch: normalized,
            title: normalizeParsedPath(file.name),
        };
    } catch {
        return null;
    }
};

const getPatchChunks = (patch: string): string[] => {
    const isGitDiff = GIT_DIFF_FILE_BREAK_TEST.test(patch);
    const hasUnifiedDiff = UNIFIED_DIFF_FILE_BREAK_TEST.test(patch);
    if (!isGitDiff && !hasUnifiedDiff) {
        return [];
    }

    return patch
        .split(isGitDiff ? GIT_DIFF_FILE_BREAK_PATTERN : UNIFIED_DIFF_FILE_BREAK_PATTERN)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0);
};

const getPatchEntriesFromText = (
    patch: string,
    fallbackTitle: string,
    idPrefix: string,
    resolveTitle: (path: string) => string,
): DiffPatchEntry[] => {
    if (isToolDiffPreviewOversized(patch)) {
        return [{
            id: `${idPrefix}-0`,
            title: resolveTitle(fallbackTitle),
            patch,
            renderMode: 'text',
        }];
    }

    const normalized = normalizeLooseUnifiedPatch(patch);
    if (!normalized) {
        return [];
    }

    const direct = getRenderablePatchInfo(normalized);
    if (direct) {
        const title = direct.title ? resolveTitle(direct.title) : resolveTitle(fallbackTitle);
        return [{ id: `${idPrefix}-0`, title, patch: direct.patch, renderMode: 'diff' }];
    }

    const chunkEntries: DiffPatchEntry[] = [];
    for (const chunk of getPatchChunks(normalized)) {
        const info = getRenderablePatchInfo(chunk);
        const title = info?.title ? resolveTitle(info.title) : resolveTitle(fallbackTitle);
        if (!info) {
            if (HUNK_HEADER_PATTERN.test(chunk) || GIT_DIFF_FILE_BREAK_TEST.test(chunk) || UNIFIED_DIFF_FILE_BREAK_TEST.test(chunk)) {
                chunkEntries.push({
                    id: `${idPrefix}-${chunkEntries.length}`,
                    title,
                    patch: chunk,
                    renderMode: 'text',
>>>>>>> upstream/main
                });
            }
            hunks = [];
            additions = 0;
            deletions = 0;
            lastOld = undefined;
        };

        for (const rawLine of text.split('\n')) {
            const dirMatch = /^#+\s+([^\s].*\/)$/.exec(rawLine);
            if (dirMatch) {
                currentDir = dirMatch[1]!;
                continue;
            }
            const fileMatch = /^#+\s+([^\s()]+)(?:\s+\([^)]*\))?/.exec(rawLine)
                || /^\[([^#\]]+)(?:#[a-zA-Z0-9]+)?\]/.exec(rawLine);
            if (fileMatch) {
                flushCurrent();
                const matched = fileMatch[1]!;
                currentPath = currentDir && !matched.startsWith(currentDir) ? `${currentDir}${matched}` : matched;
                continue;
            }
            if (!currentPath) continue;
            const change = AST_EDIT_CHANGE_LINE_RE.exec(rawLine);
            if (!change) continue;
            const marker = change[1]!;
            const lineNumber = parseInt(change[2]!, 10);
            if (lastOld === undefined || lineNumber > lastOld + 1 || lineNumber < lastOld) {
                hunks.push(`@@ -${lineNumber} +${lineNumber} @@`);
            }
            lastOld = lineNumber;
            if (marker === '+') additions++;
            else if (marker === '-') deletions++;
            hunks.push(`${marker}${change[3]}`);
        }
        flushCurrent();
        if (files.length > 0) return files;
    }
    if ('details' in output && output.details && typeof output.details === 'object') {
        const details = output.details;
        if ('fileReplacements' in details && Array.isArray(details.fileReplacements)) {
            return details.fileReplacements.flatMap((item: unknown): ToolFileChange[] => {
                if (item && typeof item === 'object' && 'path' in item && typeof item.path === 'string') {
                    const count = 'count' in item && typeof item.count === 'number' ? item.count : 0;
                    return [{
                        path: normalizeWorkspaceToolPath(item.path),
                        op: 'update',
                        additions: count,
                        deletions: count,
                    }];
                }
                return [];
            });
        }
    }
    return [];
}
/** Successful native mutations only; call inputs are never evidence of a diff. */
export function getToolFileChanges(part: ToolPart, pairedCall?: ToolCallPart): ToolFileChange[] {
    if (part.type === 'tool_call') {
        if (!isEditTool(part.toolName) || !part.editPreview?.files) return [];
        return part.editPreview.files.flatMap((file): ToolFileChange[] => {
            if (!file || file.error) return [];
            const path = file.path;
            if (workspaceRelativePath(path) === null) return [];
            const parsed = file.diff ? parseDiffHunks(path, file.diff) : undefined;
            return [{
                path: normalizeWorkspaceToolPath(path),
                op: normalizeFileOp(file.op),
                ...parsed,
            }];
        });
    }
    if (part.type !== 'tool_result' || part.isError) return [];
    const call = pairedCall?.toolCallId === part.toolCallId && pairedCall.toolName === part.toolName ? pairedCall : undefined;
    if (isWriteTool(part.toolName)) {
        const resolved = writeResultSchema.safeParse(part.output).data?.details.resolvedPath;
        const inputPath = pathValueSchema.safeParse(call?.input.path).data;
        // Writes to tool devices/coordination URLs do not mutate project files.
        const path = resolved ?? (inputPath && !/^[a-z][a-z0-9+.-]*:\/\//i.test(inputPath) ? inputPath : undefined);
        return path && workspaceRelativePath(path) !== null ? [{ path: normalizeWorkspaceToolPath(path) }] : [];
    }
    if (isAstEditTool(part.toolName)) {
        return parseAstEditOutput(part.output);
    }
    if (!isEditTool(part.toolName)) return [];
    const details = editResultSchema.safeParse(part.output).data?.details;
    if (!details) {
        if (call?.editPreview?.files) {
            return call.editPreview.files.flatMap((file): ToolFileChange[] => {
                if (!file || file.error) return [];
                const path = file.path;
                if (workspaceRelativePath(path) === null) return [];
                const parsed = file.diff ? parseDiffHunks(path, file.diff) : undefined;
                return [{
                    path: normalizeWorkspaceToolPath(path),
                    op: normalizeFileOp(file.op),
                    ...parsed,
                }];
            });
        }
        return [];
    }
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
    if ((isEditTool(part.toolName) || isWriteTool(part.toolName)) && path && workspaceRelativePath(path) !== null)
        return normalizeWorkspaceToolPath(path);
    if (isAstEditTool(part.toolName)) {
        if (path && workspaceRelativePath(path) !== null) return normalizeWorkspaceToolPath(path);
        const paths = Array.isArray(part.input.paths) && typeof part.input.paths[0] === 'string'
            ? part.input.paths[0] : null;
        if (paths && workspaceRelativePath(paths) !== null) return normalizeWorkspaceToolPath(paths);
    }
    return null;
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
    if (call && isReadTool(call.toolName) && readPath) {
        const parsed = parseNativeReadPath(readPath);
        if (!parsed.path || workspaceRelativePath(parsed.path) === null) return null;
        return { filePath: normalizeWorkspaceToolPath(parsed.path), line: parsed.line };
    }
    const filePath = getPrimaryToolPath(part, pairedCall);
    if (!filePath) return null;
    const diff = getToolDiffs(part, pairedCall).find((file) => file.path === filePath)?.diff;
    return { filePath, line: diff ? extractFirstChangedLineFromDiff(diff) : undefined };
}
