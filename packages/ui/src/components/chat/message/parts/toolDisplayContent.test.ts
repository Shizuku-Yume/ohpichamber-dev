import { describe, expect, test } from 'bun:test';
import type { JsonObject } from '@openchamber/agent-contract';
import { preferredDisplayContent, resolveExpandedInputPreview } from './toolDisplayContent';
describe('preferredDisplayContent', () => {
    test('prefers non-empty string displayContent for grep and ast_grep', () => {
        const cleanGrep = 'src/app.ts:12: const answer = 42;';
        const hashlineFallback = 'src/app.ts#AB12\n12#XY|const answer = 42;';
        expect(preferredDisplayContent({ displayContent: cleanGrep, matchCount: 1 }, hashlineFallback)).toBe(cleanGrep);

        const cleanAstGrep = 'src/index.ts\n  10: return foo();';
        expect(preferredDisplayContent({ displayContent: cleanAstGrep }, hashlineFallback)).toBe(cleanAstGrep);
    });

    test('prefers non-empty read displayContent object text over hashline output', () => {
        const cleanRead = 'export function hello() {\n  return "world";\n}';
        const hashlineFallback = 'src/hello.ts#1A2B\n1#XY|export function hello() {\n2#ZZ|  return "world";\n3#CD|}';
        expect(
            preferredDisplayContent(
                {
                    displayContent: {
                        text: cleanRead,
                        startLine: 1,
                        lineNumbers: [1, 2, 3],
                    },
                    rowPrefixes: true,
                },
                hashlineFallback,
            ),
        ).toBe(cleanRead);
    });

    test('falls back when displayContent is empty, whitespace-only, missing, or malformed', () => {
        const fallback = '1#AA|const x = 1;';
        expect(preferredDisplayContent(undefined, fallback)).toBe(fallback);
        expect(preferredDisplayContent(null, fallback)).toBe(fallback);
        expect(preferredDisplayContent({}, fallback)).toBe(fallback);
        expect(preferredDisplayContent({ displayContent: '' }, fallback)).toBe(fallback);
        expect(preferredDisplayContent({ displayContent: '   \n\t ' }, fallback)).toBe(fallback);
        expect(preferredDisplayContent({ displayContent: { text: '' } }, fallback)).toBe(fallback);
        expect(preferredDisplayContent({ displayContent: { text: '   ' } }, fallback)).toBe(fallback);
        expect(preferredDisplayContent({ displayContent: 42 }, fallback)).toBe(fallback);
        expect(preferredDisplayContent('not-an-object', fallback)).toBe(fallback);
    });
});

describe('resolveExpandedInputPreview', () => {
    test('suppresses raw JSON for task, ast_edit, todo, retain, and generate_image array inputs', () => {
        const samples: Array<{ toolName: string; input: JsonObject }> = [
            {
                toolName: 'task',
                input: {
                    agent: 'task',
                    tasks: [{
                        name: 'AlphaScout',
                        agent: 'task',
                        description: 'Inspect package exports in packages/ui',
                        assignment: 'Read packages/ui/src/index.ts and list all public exports.',
                    }],
                },
            },
            {
                toolName: 'ast_edit',
                input: { ops: [{ pat: 'old()', out: 'new()' }], paths: ['src/a.ts'] },
            },
            {
                toolName: 'todo',
                input: { op: 'init', list: [{ phase: 'Plan', items: ['Step 1'] }] },
            },
            {
                toolName: 'retain',
                input: { items: [{ content: 'Remember this fact', scope: 'project' }] },
            },
            {
                toolName: 'generate_image',
                input: { subject: 'Sunset', changes: ['Add clouds'] },
            },
        ];

        for (const sample of samples) {
            const preview = resolveExpandedInputPreview({
                input: sample.input,
                toolName: sample.toolName,
                isWrite: false,
                hideToolInputPreview: false,
                writeContent: undefined,
            });
            expect(preview.hasInputText).toBe(false);
            expect(preview.inputTextContent).toBe('');
            expect(preview.hasScalarInputRows).toBe(false);
        }
    });
});
