import { describe, expect, test } from 'bun:test';
import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import {
    extractFirstChangedLineFromDiff, getPrimaryToolPath, getToolDiffs,
    getToolFileChanges, normalizeWorkspaceToolPath, resolveToolQuickOpenTarget,
} from './toolDiffUtils';
import { getToolDiffPreviewText, isToolDiffPreviewOversized, TOOL_DIFF_PREVIEW_MAX_CHARS, TOOL_DIFF_PREVIEW_MAX_LINES } from './toolDiffPreview';

const call = (toolName: string, path = '/project/file.ts'): ToolCallPart => ({
    type: 'tool_call', partId: 'call-part', toolCallId: 'call', toolName, input: { path, content: 'new\n' }, status: 'completed',
});
const result = (details: NonNullable<ToolResultPart['output']>, toolName = 'edit', isError = false): ToolResultPart => ({
    type: 'tool_result', partId: 'result-part', toolCallId: 'call', toolName, isError,
    output: { content: [{ type: 'text', text: 'Updated file' }], details },
});

describe('native tool diffs', () => {
    test('converts numbered compact rows into a renderable unified diff', () => {
        const part = result({ path: '/project/file.ts', diff: ' 10|context\n-11|before\n+11|after\n+12|extra\n 12|tail' });
        expect(getToolDiffs(part)).toEqual([{
            path: '/project/file.ts', additions: 2, deletions: 1,
            diff: '--- a//project/file.ts\n+++ b//project/file.ts\n@@ -10,3 +10,4 @@\n context\n-before\n+after\n+extra\n tail\n',
        }]);
        expect(resolveToolQuickOpenTarget(part)).toEqual({ filePath: '/project/file.ts', line: 11 });
    });
    test('preserves separated regions and cumulative line offsets', () => {
        const [file] = getToolDiffs(result({ path: 'a.ts', diff: '+1|first\n…\n 8|context\n-9|old\n+10|new' }));
        expect(file?.diff).toContain('@@ -0,0 +1,1 @@\n+first');
        expect(file?.diff).toContain('@@ -8,2 +9,2 @@\n context\n-old\n+new');
        expect(file).toMatchObject({ additions: 2, deletions: 1 });
    });
    test('uses each per-file result exactly once and ignores aggregate text', () => {
        const part = result({
            diff: 'combined display only', perFileResults: [
                { path: '/project/deleted.ts', op: 'delete', diff: '-1|gone' },
                { path: '/project/new.ts', sourcePath: '/project/old.ts', move: '/project/new.ts', op: 'update', diff: '-42|before\n+42|after' },
                { path: '/project/error.ts', diff: '+1|not applied', isError: true },
            ]
        });
        expect(getToolDiffs(part).map((file) => file.path)).toEqual(['/project/deleted.ts', '/project/new.ts']);
        expect(resolveToolQuickOpenTarget(part)).toEqual({ filePath: '/project/new.ts', line: 42 });
        expect(getToolFileChanges(part)[1]?.sourcePath).toBe('/project/old.ts');
    });
    test('retains zero-line creates, deletes, and moves', () => {
        expect(getToolFileChanges(result({ path: 'empty', op: 'create', diff: '' }))).toEqual([
            { path: 'empty', op: 'create', sourcePath: undefined, diff: '', additions: 0, deletions: 0 },
        ]);
        expect(getToolDiffs(result({ path: 'empty', op: 'create', diff: '' }))).toEqual([]);
    });
    test('does not turn malformed or legacy payloads into successful diffs', () => {
        expect(getToolDiffs(result({ path: 'a', diff: '@@ -1 +1 @@\n-old\n+new' }))).toEqual([]);
        expect(getToolDiffs({ ...result({}), output: { files: [{ file: 'a', patch: '+new' }] } })).toEqual([]);
        expect(getToolDiffs(result({ path: 'a', diff: '+1|new' }, 'edit', true))).toEqual([]);
        expect(getToolDiffs(call('edit'))).toEqual([]);
        expect(getToolDiffs(result({ path: 'a', diff: '+1|new' }, 'patch'))).toEqual([]);
    });
    test('write results expose the resolved path without inventing line counts', () => {
        const part = result({ resolvedPath: '/resolved/file.ts' }, 'write');
        expect(getToolFileChanges(part, call('write'))).toEqual([{ path: '/resolved/file.ts' }]);
        expect(getToolDiffs(part, call('write'))).toEqual([]);
        expect(getPrimaryToolPath(part, call('write'))).toBe('/resolved/file.ts');
        expect(resolveToolQuickOpenTarget(part, call('write'))).toEqual({ filePath: '/resolved/file.ts', line: undefined });
    });
    test('successful writes can recover the input path, but not device writes or mismatched calls', () => {
        const part = result({}, 'write');
        expect(getToolFileChanges(part, call('write'))).toEqual([{ path: '/project/file.ts' }]);
        expect(getToolFileChanges(part, call('write', 'agent://worker'))).toEqual([]);
        expect(getToolFileChanges(part, { ...call('write'), toolCallId: 'other' })).toEqual([]);
        expect(getToolFileChanges(part, call('edit'))).toEqual([]);
        expect(getToolFileChanges({ ...part, isError: true }, call('write'))).toEqual([]);
    });
    test('quick-open call previews never become reported results', () => {
        expect(getPrimaryToolPath(call('edit'))).toBe('/project/file.ts');
        expect(getToolDiffs(call('write'))).toEqual([]);
        expect(extractFirstChangedLineFromDiff('@@ -10,2 +12,3 @@\n context\n-old\n+new\n+extra')).toBe(13);
    });
    test('forwards tool_stream_update edit previews on tool calls into live file changes and diffs', () => {
        const callWithPreview: ToolCallPart = {
            ...call('edit'),
            editPreview: {
                files: [
                    { path: 'src/main.ts', diff: '-1|old\n+1|new\n+2|added', firstChangedLine: 1, op: 'update' },
                ],
                streaming: true,
            },
        };
        const changes = getToolFileChanges(callWithPreview);
        expect(changes).toHaveLength(1);
        expect(changes[0].path).toBe('src/main.ts');
        expect(changes[0].op).toBe('update');
        expect(changes[0].additions).toBe(2);
        expect(changes[0].deletions).toBe(1);
        expect(changes[0].diff).toContain('--- a/src/main.ts');
        expect(changes[0].diff).toContain('+++ b/src/main.ts');

        const diffs = getToolDiffs(callWithPreview);
        expect(diffs).toHaveLength(1);
        expect(diffs[0].additions).toBe(2);
        expect(diffs[0].deletions).toBe(1);
    });
    test('read selectors target the file and their first requested line', () => {
        const read: ToolCallPart = {
            type: 'tool_call', partId: 'read-part', toolCallId: 'read-call', toolName: 'read',
            input: { path: 'src/file.ts:50-100' }, status: 'completed',
        };
        expect(resolveToolQuickOpenTarget(read)).toEqual({ filePath: 'src/file.ts', line: 50 });
    });
    test('strips the privacy-sanitized workspace sentinel from result and write targets', () => {
        const part = result({ path: '[workspace]/NOTES.md', diff: '-1|old\n+1|new' });
        expect(getToolFileChanges(part)[0]?.path).toBe('NOTES.md');
        expect(getToolDiffs(part)[0]?.path).toBe('NOTES.md');
        expect(resolveToolQuickOpenTarget(part)).toEqual({ filePath: 'NOTES.md', line: 1 });

        const batch = result({
            diff: 'combined', perFileResults: [
                { path: '[workspace]/src/a.ts', move: '[workspace]/src/b.ts', sourcePath: '[workspace]/src/a.ts', diff: '+1|new' },
            ]
        });
        expect(getToolFileChanges(batch)).toMatchObject([{ path: 'src/b.ts', sourcePath: 'src/a.ts' }]);

        const write = result({ resolvedPath: '[workspace]/NOTES.md' }, 'write');
        expect(resolveToolQuickOpenTarget(write, call('write', '[workspace]/NOTES.md'))).toEqual({ filePath: 'NOTES.md', line: undefined });
        expect(resolveToolQuickOpenTarget(result({}, 'write'), call('write', '[workspace]/NOTES.md'))).toEqual({ filePath: 'NOTES.md', line: undefined });

        const read: ToolCallPart = {
            type: 'tool_call', partId: 'read-sentinel', toolCallId: 'read-sentinel', toolName: 'read',
            input: { path: '[workspace]/src/file.ts:50-100' }, status: 'completed',
        };
        expect(resolveToolQuickOpenTarget(read)).toEqual({ filePath: 'src/file.ts', line: 50 });
    });
    test('keeps unrelated placeholders and resolved absolute or relative paths unchanged', () => {
        expect(getToolFileChanges(result({ path: '[agent-directory]/settings.json', diff: '' }))[0]?.path)
            .toBe('[agent-directory]/settings.json');
        expect(getToolFileChanges(result({}, 'write'), call('write', 'agent://worker'))).toEqual([]);
        expect(resolveToolQuickOpenTarget(result({ path: '/project/src/a.ts', diff: '+1|new' })))
            .toEqual({ filePath: '/project/src/a.ts', line: 1 });
        expect(resolveToolQuickOpenTarget(result({ path: 'src/a.ts', diff: '+1|new' })))
            .toEqual({ filePath: 'src/a.ts', line: 1 });
    });
    test('keeps sentinel traversal on its existing contained resolution', () => {
        expect(normalizeWorkspaceToolPath('[workspace]/../outside.ts')).toBe('[workspace]/../outside.ts');
        expect(resolveToolQuickOpenTarget(result({ path: '[workspace]/../outside.ts', diff: '+1|new' }))).toBeNull();
        expect(getToolFileChanges(result({ path: '[workspace]/../outside.ts', diff: '+1|new' }))).toEqual([]);
        // A non-sentinel relative escape keeps the resolution and the Host-owned containment check it already had.
        expect(resolveToolQuickOpenTarget(result({ path: '../outside.ts', diff: '+1|new' })))
            .toEqual({ filePath: '../outside.ts', line: 1 });
    });
    test('refuses sentinel targets that spell another root or rely on path re-normalization', () => {
        for (const path of [
            '[workspace]//etc/passwd',
            '[workspace]/ /etc/passwd',
            '[workspace]/..\\etc\\passwd',
            '[workspace]/src\\..\\..\\..\\etc\\passwd',
            '[workspace]/C:/Users/me/notes.md',
            '[workspace]/src/../../etc/passwd',
        ]) {
            expect(normalizeWorkspaceToolPath(path)).toBe(path);
            expect(resolveToolQuickOpenTarget(result({ path, diff: '+1|new' }))).toBeNull();
            expect(getToolFileChanges(result({ path, diff: '+1|new' }))).toEqual([]);
        }
    });
    test('extracts target and quick-open paths for running hashline, apply_patch, and sloppy edit calls', () => {
        const hashlineCall: ToolCallPart = {
            type: 'tool_call', partId: 'hashline-call', toolCallId: 'hashline-call', toolName: 'edit', status: 'running',
            input: { input: '[src/hashline.ts#A1B2]\nPUT 1.=1:\n+next' },
        };
        expect(getPrimaryToolPath(hashlineCall)).toBe('src/hashline.ts');
        expect(resolveToolQuickOpenTarget(hashlineCall)).toEqual({ filePath: 'src/hashline.ts', line: undefined });

        const streamingHashlineCall: ToolCallPart = {
            type: 'tool_call', partId: 'hashline-stream', toolCallId: 'hashline-stream', toolName: 'edit', status: 'running',
            input: { input: '[src/streaming.ts#A1' },
        };
        expect(getPrimaryToolPath(streamingHashlineCall)).toBe('src/streaming.ts');

        const applyPatchCall: ToolCallPart = {
            type: 'tool_call', partId: 'patch-call', toolCallId: 'patch-call', toolName: 'apply_patch', status: 'running',
            input: { input: '*** Begin Patch\n*** Update File: src/updated.ts\n@@\n-a\n+b\n*** End Patch' },
        };
        expect(getPrimaryToolPath(applyPatchCall)).toBe('src/updated.ts');
        expect(resolveToolQuickOpenTarget(applyPatchCall)).toEqual({ filePath: 'src/updated.ts', line: undefined });

        const sloppyCall: ToolCallPart = {
            type: 'tool_call', partId: 'sloppy-call', toolCallId: 'sloppy-call', toolName: 'edit', status: 'running',
            input: { input: '*** Edit File: src/sloppy.ts\n*** Replace Block: fn\n+next' },
        };
        expect(getPrimaryToolPath(sloppyCall)).toBe('src/sloppy.ts');
    });
});

describe('bounded tool diff previews', () => {
    test('bounds oversized previews by lines and characters', () => {
        const patch = Array.from({ length: TOOL_DIFF_PREVIEW_MAX_LINES + 1 }, () => '+line').join('\n');
        expect(isToolDiffPreviewOversized(patch)).toBe(true);
        expect(getToolDiffPreviewText(patch).split('\n')).toHaveLength(TOOL_DIFF_PREVIEW_MAX_LINES + 1);
        const long = `+${'x'.repeat(TOOL_DIFF_PREVIEW_MAX_CHARS + 1000)}`;
        expect(getToolDiffPreviewText(long)).toHaveLength(TOOL_DIFF_PREVIEW_MAX_CHARS + 2);
    });
    test('does not split astral characters at the limit', () => {
        const prefix = `+${'x'.repeat(TOOL_DIFF_PREVIEW_MAX_CHARS - 2)}`;
        expect(getToolDiffPreviewText(`${prefix}😀${'y'.repeat(100)}`)).toBe(`${prefix}\n…`);
    });
    test('preserves previews at limits and recognizes carriage returns', () => {
        const characters = 'x'.repeat(TOOL_DIFF_PREVIEW_MAX_CHARS);
        const lines = Array.from({ length: TOOL_DIFF_PREVIEW_MAX_LINES }, () => '+line').join('\n');
        expect(getToolDiffPreviewText(characters)).toBe(characters);
        expect(getToolDiffPreviewText(`${lines}\n`)).toBe(`${lines}\n`);
        expect(isToolDiffPreviewOversized(`${lines.replaceAll('\n', '\r')}\r+extra`)).toBe(true);
    });
});
