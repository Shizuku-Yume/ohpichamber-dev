import type { ToolCallPart } from '@openchamber/agent-contract';
import { z } from 'zod';
import { normalizeFilePath, toAbsoluteFilePath } from '@/lib/path-utils';
import { isExplorationTool, isShellTool, isSubagentTool, isWebTool } from '@/lib/toolHelpers';
import { getToolFileChanges } from '../../message/parts/toolDiffUtils';
import type { ChatMessageEntry } from './types';

const executionSchema = z.object({ details: z.object({ exitCode: z.number().optional() }) });
const agentSchema = z.object({ id: z.string().min(1) });
const editBatchSchema = z.object({ details: z.object({
    perFileResults: z.array(z.object({ path: z.string().min(1), diff: z.string() })).optional(),
}) });
const taskResultSchema = z.object({ details: z.object({
    results: z.array(agentSchema.nullable().catch(null)).optional(),
    progress: z.array(agentSchema.nullable().catch(null)).optional(),
}) });

interface TurnFileChange {
    /** Canonical path reported by the native tool; no project root is inferred. */
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
    const files = new Map<string, FileChangeRecord>();
    const subagents = new Set<string>();
    const seen = new Set<string>();
    const calls = new Map<string, ToolCallPart>();
    for (const message of messages) {
        for (const part of message.parts) {
            if (part.type === 'tool_call') calls.set(`${message.turnId}\0${part.toolCallId}`, part);
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
            if (part.toolName === 'edit' && changes.length === 0) summary.hasCompleteDiff = false;
            if (part.toolName === 'edit' && !editBatchSchema.safeParse(part.output).success) summary.hasCompleteDiff = false;
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
