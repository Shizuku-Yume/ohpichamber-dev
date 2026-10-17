import { describe, expect, test } from 'bun:test';
import { projectTurnChangedFiles } from './projectTurnSummary';
import { projectTurnRecords } from './projectTurnRecords';
import type { ChatMessageEntry } from './types';

type Part = ChatMessageEntry['parts'][number];

const diff = '@@ -1,1 +1,2 @@\n-before\n+after\n+added';

function user(): ChatMessageEntry {
    return { messageId: 'user', sessionId: 'session', turnId: 'user', role: 'user', createdAt: 1, parts: [{ type: 'text', partId: 'request', content: 'Request' }] };
}

function assistant(id: string, parts: Part[], _finish?: string): ChatMessageEntry {
    return { messageId: id, sessionId: 'session', turnId: 'user', role: 'assistant', createdAt: 2, parts };
}

function edit(id: string, filePath: string, patch = diff): Part[] {
    return [
        { type: 'tool_call', partId: `${id}-call`, toolCallId: id, toolName: 'edit', input: { filePath }, status: 'completed' },
        { type: 'tool_result', partId: `${id}-result`, toolCallId: id, toolName: 'edit', output: { file: filePath, patch }, isError: false },
    ];
}

describe('projectTurnChangedFiles', () => {
    test('lists the files the turn edited, with the counts from each call patch', () => {
        expect(projectTurnChangedFiles([
            assistant('a', [...edit('one', '/project/src/a.ts'), ...edit('two', '/project/src/b.ts')], 'stop'),
        ])).toEqual([
            { file: '/project/src/a.ts', additions: 2, deletions: 1 },
            { file: '/project/src/b.ts', additions: 2, deletions: 1 },
        ]);
    });

    test('keeps a file the tool touched even when its counts are unknown', () => {
        const write: Part[] = [
            { type: 'tool_call', partId: 'write-call', toolCallId: 'write', toolName: 'write', input: { filePath: '/project/src/c.ts', content: 'x' }, status: 'completed' },
            { type: 'tool_result', partId: 'write-result', toolCallId: 'write', toolName: 'write', isError: false },
        ];
        expect(projectTurnChangedFiles([assistant('a', write, 'stop')]))
            .toEqual([{ file: '/project/src/c.ts' }]);
    });

    test('a turn that edited nothing yields no files', () => {
        expect(projectTurnChangedFiles([assistant('a', [], 'stop')])).toBeUndefined();
    });

    test('native has no working-tree snapshot, so a subagent turn lists nothing of its own', () => {
        const task: Part[] = [
            { type: 'tool_call', partId: 'child-call', toolCallId: 'child', toolName: 'task', input: {}, status: 'completed' },
            { type: 'tool_result', partId: 'child-result', toolCallId: 'child', toolName: 'task', isError: false },
        ];
        expect(projectTurnChangedFiles([assistant('a', task, 'stop')])).toBeUndefined();
    });
});

describe('projectTurnRecords changed files', () => {
    const options = { showTextJustificationActivity: false, showTurnChangedFiles: true };

    test('projects files once the turn has a final answer and not before', () => {
        const parts = edit('one', '/project/src/a.ts');
        const streaming = projectTurnRecords([user(), assistant('a', parts)], options);
        expect(streaming.turns[0]?.changedFiles).toBeUndefined();

        const finished = projectTurnRecords([user(), assistant('a', parts, 'stop')], options);
        expect(finished.turns[0]?.changedFiles).toEqual([{ file: '/project/src/a.ts', additions: 2, deletions: 1 }]);
    });

    test('leaves files out while the setting is off', () => {
        const projection = projectTurnRecords(
            [user(), assistant('a', edit('one', '/project/src/a.ts'), 'stop')],
            { ...options, showTurnChangedFiles: false },
        );
        expect(projection.turns[0]?.changedFiles).toBeUndefined();
    });
});
