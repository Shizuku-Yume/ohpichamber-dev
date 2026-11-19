import type { ToolCallPart } from '@openchamber/agent-contract';
import { z } from 'zod';
import { normalizeFilePath, toAbsoluteFilePath } from '@/lib/path-utils';
import { isEditTool, isExplorationTool, isShellTool, isSubagentTool, isWebTool } from '@/lib/toolHelpers';
import { getToolFileChanges } from '../../message/parts/toolDiffUtils';
import type { ChatMessageEntry } from './types';

<<<<<<< HEAD
const executionSchema = z.object({ details: z.object({ exitCode: z.number().optional() }) });
const agentSchema = z.object({ id: z.string().min(1) });
const editBatchSchema = z.object({ details: z.object({
    perFileResults: z.array(z.object({ path: z.string().min(1), diff: z.string() })).optional(),
}) });
const taskResultSchema = z.object({ details: z.object({
    results: z.array(agentSchema.nullable().catch(null)).optional(),
    progress: z.array(agentSchema.nullable().catch(null)).optional(),
}) });
||||||| bc50ba56aa
const patchTextSchema = z.string().regex(/\S/);
const patchSchema = z.union([patchTextSchema, z.object({ patch: patchTextSchema }).transform((value) => value.patch)]);
const optionalText = z.string().trim().min(1).optional().catch(undefined);
const optionalCount = z.number().int().nonnegative().optional().catch(undefined);
const fileSchema = z.object({
    // v2 reports `FileDiff.Info` ({ file, patch, additions, deletions, status });
    // the other keys keep MCP and plugin tools using older naming working.
    file: optionalText,
    filePath: optionalText,
    relativePath: optionalText,
    movePath: optionalText,
    type: optionalText,
    status: optionalText,
    patch: patchSchema.optional().catch(undefined),
    diff: patchSchema.optional().catch(undefined),
    additions: optionalCount,
    deletions: optionalCount,
});
// Tool metadata is an external boundary. Parse only the fields whose meaning
// is established by our edit/patch renderers; unrelated or malformed fields
// must not erase other valid calls from the report.
const metadataSchema = z.object({
    files: z.array(fileSchema.nullable().catch(null)).optional().catch(undefined),
    filediff: fileSchema.optional().catch(undefined),
    patch: patchSchema.optional().catch(undefined),
    diff: patchSchema.optional().catch(undefined),
    sessionID: optionalText,
    sessionId: optionalText,
    exit: z.number().optional().catch(undefined),
});
const inputSchema = z.object({
    path: optionalText,
    filePath: optionalText,
    file_path: optionalText,
});
=======
const patchTextSchema = z.string().regex(/\S/);
const patchSchema = z.union([patchTextSchema, z.object({ patch: patchTextSchema }).transform((value) => value.patch)]);
const optionalText = z.string().trim().min(1).optional().catch(undefined);
const optionalCount = z.number().int().nonnegative().optional().catch(undefined);
const fileSchema = z.object({
    file: optionalText,
    filePath: optionalText,
    relativePath: optionalText,
    movePath: optionalText,
    type: optionalText,
    status: optionalText,
    patch: patchSchema.optional().catch(undefined),
    diff: patchSchema.optional().catch(undefined),
    additions: optionalCount,
    deletions: optionalCount,
});
const metadataSchema = z.object({
    files: z.array(fileSchema.nullable().catch(null)).optional().catch(undefined),
    filediff: fileSchema.optional().catch(undefined),
    patch: patchSchema.optional().catch(undefined),
    diff: patchSchema.optional().catch(undefined),
    sessionID: optionalText,
    sessionId: optionalText,
    exit: z.number().optional().catch(undefined),
});
const inputSchema = z.object({
    path: optionalText,
    filePath: optionalText,
    file_path: optionalText,
});
>>>>>>> upstream/main

interface TurnFileChange {
<<<<<<< HEAD
    /** Canonical path reported by the native tool; no project root is inferred. */
||||||| bc50ba56aa
    /** Path relative to the message's project root, as the turn diff lists it. */
=======
>>>>>>> upstream/main
    path: string;
    additions?: number;
    deletions?: number;
}
export interface LiveActivitySummary {
    files: number;
    changedFiles: TurnFileChange[];
    additions: number;
    deletions: number;
    hasCompleteDiff: boolean;
    explored: boolean;
    commands: number;
    researched: boolean;
    subagents: number;
}
<<<<<<< HEAD
||||||| bc50ba56aa

function countPatch(patch: string | undefined): { additions: number; deletions: number } | undefined {
    if (!patch) return undefined;
    let additions = 0;
    let deletions = 0;
    let hasHunk = false;
    let oldRemaining = 0;
    let newRemaining = 0;
    // Count hunk bodies, not file headers. A source line beginning with ++ or
    // -- is still a real added/deleted line inside a hunk.
    for (const line of patch.split('\n')) {
        const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (hunk) {
            if (oldRemaining !== 0 || newRemaining !== 0) return undefined;
            hasHunk = true;
            oldRemaining = Number(hunk[2] ?? 1);
            newRemaining = Number(hunk[4] ?? 1);
        } else if (oldRemaining > 0 || newRemaining > 0) {
            if (line.startsWith('+') && newRemaining > 0) {
                additions++;
                newRemaining--;
            } else if (line.startsWith('-') && oldRemaining > 0) {
                deletions++;
                oldRemaining--;
            } else if (line.startsWith(' ') && oldRemaining > 0 && newRemaining > 0) {
                oldRemaining--;
                newRemaining--;
            } else if (!line.startsWith('\\ No newline')) {
                return undefined;
            }
        }
    }
    return hasHunk && oldRemaining === 0 && newRemaining === 0 ? { additions, deletions } : undefined;
}

=======

function countPatch(patch: string | undefined): { additions: number; deletions: number } | undefined {
    if (!patch) return undefined;
    let additions = 0;
    let deletions = 0;
    let hasHunk = false;
    let oldRemaining = 0;
    let newRemaining = 0;
    // external: https://git-scm.com/docs/diff-format Count added and deleted hunk lines, including source lines beginning with ++ or --.
    for (const line of patch.split('\n')) {
        const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (hunk) {
            if (oldRemaining !== 0 || newRemaining !== 0) return undefined;
            hasHunk = true;
            oldRemaining = Number(hunk[2] ?? 1);
            newRemaining = Number(hunk[4] ?? 1);
        } else if (oldRemaining > 0 || newRemaining > 0) {
            if (line.startsWith('+') && newRemaining > 0) {
                additions++;
                newRemaining--;
            } else if (line.startsWith('-') && oldRemaining > 0) {
                deletions++;
                oldRemaining--;
            } else if (line.startsWith(' ') && oldRemaining > 0 && newRemaining > 0) {
                oldRemaining--;
                newRemaining--;
            } else if (!line.startsWith('\\ No newline')) {
                return undefined;
            }
        }
    }
    return hasHunk && oldRemaining === 0 && newRemaining === 0 ? { additions, deletions } : undefined;
}

>>>>>>> upstream/main
interface FileChangeRecord {
    path: string;
    additions: number;
    deletions: number;
    complete: boolean;
}

function canonicalPath(path: string): string {
    const normalized = normalizeFilePath(path);
    if (/^[A-Za-z]:\//.test(normalized)) return toAbsoluteFilePath(normalized.slice(0, 3), normalized.slice(3));
    if (normalized.startsWith('//')) {
        const [server, share, ...parts] = normalized.slice(2).split('/');
        return toAbsoluteFilePath(`//${server}/${share}`, parts.join('/'));
    }
    return normalized.startsWith('/') ? toAbsoluteFilePath('/', normalized.slice(1)) : normalized;
}
const keyOf = (path: string): string => /^([A-Za-z]:\/|\/\/)/.test(path) ? path.toLowerCase() : path;

export function summarizeLiveActivity(messages: readonly ChatMessageEntry[]): LiveActivitySummary {
    const summary: LiveActivitySummary = {
        files: 0, changedFiles: [], additions: 0, deletions: 0, hasCompleteDiff: true,
        explored: false, commands: 0, researched: false, subagents: 0,
    };
<<<<<<< HEAD
    const files = new Map<string, FileChangeRecord>();
||||||| bc50ba56aa
    // Keyed by comparable absolute path; insertion order is first-touch order.
    const changedFiles = new Map<string, FileChangeRecord>();
=======
    const changedFiles = new Map<string, FileChangeRecord>();
>>>>>>> upstream/main
    const subagents = new Set<string>();
    const seen = new Set<string>();
    const calls = new Map<string, ToolCallPart>();
    for (const message of messages) {
<<<<<<< HEAD
||||||| bc50ba56aa
        // v2 assistant messages carry no working directory, and tool inputs
        // arrive already resolved, so paths are used as the tool reported them.
        const cwd = '';
        const root = '';
        const canonicalPath = (path: string) => {
            const absolute = normalizeFilePath(cwd ? toAbsoluteFilePath(cwd, path) : path);
            if (/^[A-Za-z]:\//.test(absolute)) {
                return toAbsoluteFilePath(absolute.slice(0, 3), absolute.slice(3));
            }
            if (absolute.startsWith('//')) {
                const [server, share, ...parts] = absolute.slice(2).split('/');
                return toAbsoluteFilePath(`//${server}/${share}`, parts.join('/'));
            }
            return absolute.startsWith('/') ? toAbsoluteFilePath('/', absolute.slice(1)) : absolute;
        };
        // Windows drive and UNC paths compare case-insensitively.
        const keyOf = (canonical: string) => /^([A-Za-z]:\/|\/\/)/.test(canonical) ? canonical.toLowerCase() : canonical;
=======
        const cwd = '';
        const root = '';
        const canonicalPath = (path: string) => {
            const absolute = normalizeFilePath(cwd ? toAbsoluteFilePath(cwd, path) : path);
            if (/^[A-Za-z]:\//.test(absolute)) {
                return toAbsoluteFilePath(absolute.slice(0, 3), absolute.slice(3));
            }
            if (absolute.startsWith('//')) {
                const [server, share, ...parts] = absolute.slice(2).split('/');
                return toAbsoluteFilePath(`//${server}/${share}`, parts.join('/'));
            }
            return absolute.startsWith('/') ? toAbsoluteFilePath('/', absolute.slice(1)) : absolute;
        };
        // external: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file#naming-conventions Windows drive and UNC paths compare case-insensitively.
        const keyOf = (canonical: string) => /^([A-Za-z]:\/|\/\/)/.test(canonical) ? canonical.toLowerCase() : canonical;
>>>>>>> upstream/main
        for (const part of message.parts) {
<<<<<<< HEAD
            if (part.type === 'tool_call') calls.set(`${message.turnId}\0${part.toolCallId}`, part);
||||||| bc50ba56aa
            if (part.type !== 'tool') continue;
            const callKey = `${message.info.id}:${part.callID || part.id}`;
            if (seenCalls.has(callKey)) continue;
            seenCalls.add(callKey);
            const state = part.state;
            if (state.status !== 'completed' && state.status !== 'error') continue;
            const tool = part.tool;
            const metadata = metadataSchema.safeParse(state.metadata).data;
            if (isShellTool(tool) && (state.status === 'completed' || metadata?.exit !== undefined)) {
                summary.commands++;
            }
            if (state.status !== 'completed') continue;
            summary.explored ||= isExplorationTool(tool);
            summary.researched ||= isWebTool(tool);
            if (isSubagentTool(tool)) {
                const childSession = metadata?.sessionID ?? metadata?.sessionId;
                if (childSession) subagents.add(childSession);
            }
            if (!isFileChangeTool(tool)) continue;

            const input = inputSchema.safeParse(state.input).data;
            if (metadata?.files?.some((file) => file === null)) summary.hasCompleteDiff = false;
            const entries = metadata?.files?.filter((file) => file !== null);
            const files = entries?.length ? entries : [metadata?.filediff ?? {}];
            let callAdditions = 0;
            let callDeletions = 0;
            const callRecords: FileChangeRecord[] = [];
            const unstattedRecords: FileChangeRecord[] = [];
            const callPaths = new Set<string>();
            for (const file of files) {
                // A `write` result carries no diff at all in v2, so its path
                // only exists on the call's input.
                const originalPath = file.file ?? file.filePath ?? file.relativePath
                    ?? (isPatchTool(tool) ? undefined : input?.path ?? input?.filePath ?? input?.file_path);
                const path = file.movePath ?? originalPath;
                if (!path) {
                    summary.hasCompleteDiff = false;
                    continue;
                }
                const canonical = canonicalPath(path);
                const key = keyOf(canonical);
                if (callPaths.has(key)) continue;
                callPaths.add(key);
                const stats = countPatch(file.patch ?? file.diff)
                    ?? (file.additions !== undefined && file.deletions !== undefined
                        ? { additions: file.additions, deletions: file.deletions } : undefined);
                const isAddOrDelete = file.type === 'add' || file.type === 'delete'
                    || file.status === 'added' || file.status === 'deleted';
                if (stats && stats.additions === 0 && stats.deletions === 0
                    && !file.movePath && !isAddOrDelete) continue;
                let record = changedFiles.get(key);
                // A rename moves an existing identity rather than counting it
                // again when the same file was edited earlier in this turn.
                if (file.movePath && originalPath) {
                    const previousKey = keyOf(canonicalPath(originalPath));
                    const previous = previousKey === key ? undefined : changedFiles.get(previousKey);
                    if (previous) {
                        changedFiles.delete(previousKey);
                        if (record) {
                            record.additions += previous.additions;
                            record.deletions += previous.deletions;
                            record.complete &&= previous.complete;
                        } else {
                            record = previous;
                        }
                    }
                }
                if (!record) {
                    record = { path: getRelativeFilePath(canonical, root), additions: 0, deletions: 0, complete: true };
                } else if (file.movePath) {
                    record.path = getRelativeFilePath(canonical, root);
                }
                changedFiles.set(key, record);
                callRecords.push(record);
                if (!stats) {
                    unstattedRecords.push(record);
                } else {
                    record.additions += stats.additions;
                    record.deletions += stats.deletions;
                    callAdditions += stats.additions;
                    callDeletions += stats.deletions;
                }
            }
            if (unstattedRecords.length > 0) {
                // The top-level patch describes the entire call. Use it instead
                // of (never in addition to) any per-file numbers already found.
                const fallback = countPatch(metadata?.patch ?? metadata?.diff);
                if (fallback) {
                    callAdditions = fallback.additions;
                    callDeletions = fallback.deletions;
                    // A single-file call's whole patch is that file's patch; with
                    // several files it cannot be split, so those files keep no numbers.
                    if (callRecords.length === 1) {
                        callRecords[0].additions += fallback.additions;
                        callRecords[0].deletions += fallback.deletions;
                    } else {
                        for (const record of unstattedRecords) record.complete = false;
                    }
                } else {
                    summary.hasCompleteDiff = false;
                    for (const record of unstattedRecords) record.complete = false;
                }
            }
            summary.additions += callAdditions;
            summary.deletions += callDeletions;
=======
            if (part.type !== 'tool') continue;
            const callKey = `${message.info.id}:${part.callID || part.id}`;
            if (seenCalls.has(callKey)) continue;
            seenCalls.add(callKey);
            const state = part.state;
            if (state.status !== 'completed' && state.status !== 'error') continue;
            const tool = part.tool;
            const metadata = metadataSchema.safeParse(state.metadata).data;
            if (isShellTool(tool) && (state.status === 'completed' || metadata?.exit !== undefined)) {
                summary.commands++;
            }
            if (state.status !== 'completed') continue;
            summary.explored ||= isExplorationTool(tool);
            summary.researched ||= isWebTool(tool);
            if (isSubagentTool(tool)) {
                const childSession = metadata?.sessionID ?? metadata?.sessionId;
                if (childSession) subagents.add(childSession);
            }
            if (!isFileChangeTool(tool)) continue;

            const input = inputSchema.safeParse(state.input).data;
            if (metadata?.files?.some((file) => file === null)) summary.hasCompleteDiff = false;
            const entries = metadata?.files?.filter((file) => file !== null);
            const files = entries?.length ? entries : [metadata?.filediff ?? {}];
            let callAdditions = 0;
            let callDeletions = 0;
            const callRecords: FileChangeRecord[] = [];
            const unstattedRecords: FileChangeRecord[] = [];
            const callPaths = new Set<string>();
            for (const file of files) {
                const originalPath = file.file ?? file.filePath ?? file.relativePath
                    ?? (isPatchTool(tool) ? undefined : input?.path ?? input?.filePath ?? input?.file_path);
                const path = file.movePath ?? originalPath;
                if (!path) {
                    summary.hasCompleteDiff = false;
                    continue;
                }
                const canonical = canonicalPath(path);
                const key = keyOf(canonical);
                if (callPaths.has(key)) continue;
                callPaths.add(key);
                const stats = countPatch(file.patch ?? file.diff)
                    ?? (file.additions !== undefined && file.deletions !== undefined
                        ? { additions: file.additions, deletions: file.deletions } : undefined);
                const isAddOrDelete = file.type === 'add' || file.type === 'delete'
                    || file.status === 'added' || file.status === 'deleted';
                if (stats && stats.additions === 0 && stats.deletions === 0
                    && !file.movePath && !isAddOrDelete) continue;
                let record = changedFiles.get(key);
                if (file.movePath && originalPath) {
                    const previousKey = keyOf(canonicalPath(originalPath));
                    const previous = previousKey === key ? undefined : changedFiles.get(previousKey);
                    if (previous) {
                        changedFiles.delete(previousKey);
                        if (record) {
                            record.additions += previous.additions;
                            record.deletions += previous.deletions;
                            record.complete &&= previous.complete;
                        } else {
                            record = previous;
                        }
                    }
                }
                if (!record) {
                    record = { path: getRelativeFilePath(canonical, root), additions: 0, deletions: 0, complete: true };
                } else if (file.movePath) {
                    record.path = getRelativeFilePath(canonical, root);
                }
                changedFiles.set(key, record);
                callRecords.push(record);
                if (!stats) {
                    unstattedRecords.push(record);
                } else {
                    record.additions += stats.additions;
                    record.deletions += stats.deletions;
                    callAdditions += stats.additions;
                    callDeletions += stats.deletions;
                }
            }
            if (unstattedRecords.length > 0) {
                const fallback = countPatch(metadata?.patch ?? metadata?.diff);
                if (fallback) {
                    callAdditions = fallback.additions;
                    callDeletions = fallback.deletions;
                    if (callRecords.length === 1) {
                        callRecords[0].additions += fallback.additions;
                        callRecords[0].deletions += fallback.deletions;
                    } else {
                        for (const record of unstattedRecords) record.complete = false;
                    }
                } else {
                    summary.hasCompleteDiff = false;
                    for (const record of unstattedRecords) record.complete = false;
                }
            }
            summary.additions += callAdditions;
            summary.deletions += callDeletions;
>>>>>>> upstream/main
        }
    }
    for (const message of messages) {
        for (const part of message.parts) {
            if (part.type !== 'tool_result') continue;
            const callKey = `${message.turnId}\0${part.toolCallId}`;
            if (seen.has(callKey)) continue;
            seen.add(callKey);
            if (isShellTool(part.toolName) && (!part.isError || executionSchema.safeParse(part.output).data?.details.exitCode !== undefined)) summary.commands++;
            if (part.isError) continue;
            summary.explored ||= isExplorationTool(part.toolName);
            summary.researched ||= isWebTool(part.toolName);
            if (isSubagentTool(part.toolName)) {
                const details = taskResultSchema.safeParse(part.output).data?.details;
                for (const agent of [...(details?.results ?? []), ...(details?.progress ?? [])]) {
                    if (agent) subagents.add(agent.id);
                }
            }
            const changes = getToolFileChanges(part, calls.get(callKey));
            if (isEditTool(part.toolName) && changes.length === 0) summary.hasCompleteDiff = false;
            if (isEditTool(part.toolName) && !editBatchSchema.safeParse(part.output).success) summary.hasCompleteDiff = false;
            for (const change of changes) {
                const complete = change.additions !== undefined && change.deletions !== undefined;
                if (complete && change.additions === 0 && change.deletions === 0 && !change.sourcePath && change.op !== 'create' && change.op !== 'delete') continue;
                const path = canonicalPath(change.path);
                const key = keyOf(path);
                let record = files.get(key);
                if (change.sourcePath) {
                    const previousKey = keyOf(canonicalPath(change.sourcePath));
                    const previous = previousKey === key ? undefined : files.get(previousKey);
                    if (previous) {
                        // Replace the old identity in place to retain first-touch order.
                        const renamed = new Map<string, FileChangeRecord>();
                        for (const [existingKey, existing] of files) {
                            if (existingKey === previousKey || existingKey === key) {
                                if (!renamed.has(key)) renamed.set(key, previous);
                            } else renamed.set(existingKey, existing);
                        }
                        if (record) {
                            previous.additions += record.additions;
                            previous.deletions += record.deletions;
                            previous.complete &&= record.complete;
                        }
                        files.clear();
                        for (const [existingKey, existing] of renamed) files.set(existingKey, existing);
                        record = previous;
                    }
                }
                record ??= { path, additions: 0, deletions: 0, complete: true };
                record.path = path;
                record.complete &&= complete;
                record.additions += change.additions ?? 0;
                record.deletions += change.deletions ?? 0;
                files.set(key, record);
                summary.additions += change.additions ?? 0;
                summary.deletions += change.deletions ?? 0;
                summary.hasCompleteDiff &&= complete;
            }
        }
    }
    summary.files = files.size;
    summary.changedFiles = Array.from(files.values(), (file) => file.complete
        ? { path: file.path, additions: file.additions, deletions: file.deletions }
        : { path: file.path });
    summary.subagents = subagents.size;
    return summary;
}
