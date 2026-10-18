import { describe, expect, test } from 'bun:test';
import type { Part, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { summarizeLiveActivity } from './liveActivitySummary';
import type { ChatMessageEntry } from './types';

const message = (parts: Part[], turnId = 'turn'): ChatMessageEntry => ({
    messageId: `message-${turnId}`, sessionId: 'session', turnId, role: 'assistant', createdAt: 1, parts,
});
const call = (id: string, toolName: string, path = '/project/a.ts'): ToolCallPart => ({
    type: 'tool_call', partId: `${id}-call`, toolCallId: id, toolName, input: { path }, status: 'completed',
});
const result = (id: string, toolName: string, details: NonNullable<ToolResultPart['output']> = {}, isError = false): ToolResultPart => ({
    type: 'tool_result', partId: `${id}-result`, toolCallId: id, toolName, isError,
    output: { content: [{ type: 'text', text: 'Native result' }], details },
});
const edit = (id: string, path: string, diff: string) => result(id, 'edit', { path, diff });

describe('native turn activity summary', () => {
    test('sums native per-file compact diffs and preserves first-touch order', () => {
        const summary = summarizeLiveActivity([message([
            edit('first', '/project/a.ts', '-1|before\n+1|after'),
            result('batch', 'edit', { diff: 'aggregate ignored', perFileResults: [
                { path: '/project/b.ts', diff: '+1|new\n+2|second', op: 'create' },
                { path: '/project/a.ts', diff: '-5|removed', op: 'update' },
            ] }),
        ])]);
        expect(summary).toMatchObject({ files: 2, additions: 3, deletions: 2, hasCompleteDiff: true,
            changedFiles: [
                { path: '/project/a.ts', additions: 1, deletions: 2 },
                { path: '/project/b.ts', additions: 2, deletions: 0 },
            ],
        });
    });
    test('write reports changed identity but never infers diff counts from content', () => {
        const summary = summarizeLiveActivity([message([
            call('write', 'write'), result('write', 'write', { resolvedPath: '/resolved/a.ts' }),
            edit('edit', '/resolved/a.ts', '+1|one'),
        ])]);
        expect(summary).toMatchObject({ files: 1, additions: 1, deletions: 0, hasCompleteDiff: false,
            changedFiles: [{ path: '/resolved/a.ts' }],
        });
    });
    test('moves an edited identity without losing counts or first-touch order', () => {
        const summary = summarizeLiveActivity([message([
            edit('a', '/project/old.ts', '+1|one'),
            edit('b', '/project/b.ts', '+1|two'),
            result('move', 'edit', { path: '/project/new.ts', sourcePath: '/project/old.ts', move: '/project/new.ts', diff: '' }),
        ])]);
        expect(summary.changedFiles).toEqual([
            { path: '/project/new.ts', additions: 1, deletions: 0 },
            { path: '/project/b.ts', additions: 1, deletions: 0 },
        ]);
        expect(summary.files).toBe(2);
    });
    test('keeps empty creates/deletes but excludes zero-change updates', () => {
        const summary = summarizeLiveActivity([message([
            result('empty', 'edit', { path: 'empty', diff: '', op: 'create' }),
            result('delete', 'edit', { path: 'deleted', diff: '', op: 'delete' }),
            result('noop', 'edit', { path: 'unchanged', diff: '', op: 'update' }),
        ])]);
        expect(summary.changedFiles).toEqual([
            { path: 'empty', additions: 0, deletions: 0 },
            { path: 'deleted', additions: 0, deletions: 0 },
        ]);
    });
    test('deduplicates result replay within a turn, not across turns', () => {
        const part = edit('reused', '/project/a.ts', '+1|one');
        const summary = summarizeLiveActivity([message([part, part]), message([part], 'other-turn')]);
        expect(summary.additions).toBe(2);
        expect(summary.files).toBe(1);
    });
    test('counts native bash/task activity, not retired names or unexecuted failures', () => {
        const summary = summarizeLiveActivity([message([
            result('bash', 'bash'),
            result('failed-bash', 'bash', { exitCode: 1 }, true),
            result('denied-bash', 'bash', {}, true),
            result('shell', 'shell'),
            result('task', 'task', { results: [{ id: 'worker-a' }], progress: [{ id: 'worker-a' }, { id: 'worker-b' }] }),
            result('read', 'read'), result('search', 'web_search'),
        ])]);
        expect(summary).toMatchObject({ commands: 2, subagents: 2, explored: true, researched: true });
    });
    test('never treats pending, failed, legacy or device writes as file mutations', () => {
        const summary = summarizeLiveActivity([message([
            call('pending', 'edit'),
            result('failed', 'edit', { path: 'a', diff: '+1|not applied' }, true),
            result('legacy', 'patch', { files: [{ file: 'a', patch: '+new' }] }),
            call('device', 'write', 'agent://worker'), result('device', 'write'),
        ])]);
        expect(summary).toMatchObject({ files: 0, additions: 0, deletions: 0, changedFiles: [] });
    });
    test('malformed compact diffs retain file identity with incomplete counts', () => {
        const summary = summarizeLiveActivity([message([edit('bad', '/project/a.ts', 'not a native diff')])]);
        expect(summary).toMatchObject({ files: 1, changedFiles: [{ path: '/project/a.ts' }], hasCompleteDiff: false });
    });
    test('keeps valid batch files while marking malformed entries incomplete', () => {
        const summary = summarizeLiveActivity([message([result('batch', 'edit', {
            diff: 'combined', perFileResults: [{ path: 'a', diff: '+1|one' }, null, { path: 3, diff: '+1|bad' }],
        })])]);
        expect(summary).toMatchObject({ files: 1, additions: 1, hasCompleteDiff: false,
            changedFiles: [{ path: 'a', additions: 1, deletions: 0 }],
        });
    });
    test('merging renamed identities retains the earliest touched slot', () => {
        const summary = summarizeLiveActivity([message([
            edit('destination', 'destination', '+1|one'), edit('between', 'between', '+1|two'),
            edit('source', 'source', '+1|three'),
            result('move', 'edit', { path: 'destination', sourcePath: 'source', diff: '', move: 'destination' }),
        ])]);
        expect(summary.changedFiles).toEqual([
            { path: 'destination', additions: 2, deletions: 0 }, { path: 'between', additions: 1, deletions: 0 },
        ]);
    });
    test('canonicalizes Windows identity case-insensitively', () => {
        const summary = summarizeLiveActivity([message([
            edit('first', 'C:\\Project\\a.ts', '+1|one'),
            edit('second', 'c:/project/a.ts', '+2|two'),
        ])]);
        expect(summary.files).toBe(1);
        expect(summary.additions).toBe(2);
    });
});
