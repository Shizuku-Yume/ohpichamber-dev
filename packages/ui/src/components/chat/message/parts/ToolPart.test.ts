import { describe, expect, test } from 'bun:test';
import type { ToolResultPart } from '@openchamber/agent-contract';

import { renderTerminalOutput } from './toolOutput';
import { nativeToolResultContent, parseDiffToUnified, tryParseJsonOutput } from '../toolRenderers';
import { getStreamingThrottleText } from '../../hooks/useStreamingTextThrottle';

describe('canonical native result content', () => {
    const result = (output: ToolResultPart['output']): ToolResultPart => ({
        type: 'tool_result' as const, partId: 'result', toolCallId: 'call', toolName: 'read', isError: false, output,
    });

    test('decodes SDK text and preserves structured details', () => {
        expect(nativeToolResultContent(result({ content: [{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }], details: { path: 'src/a.ts' } })))
            .toEqual({ text: 'first\nsecond', images: [], details: { path: 'src/a.ts' } });
    });

    test('retains image attachments without turning them into text JSON', () => {
        expect(nativeToolResultContent(result({ content: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }] })))
            .toEqual({ text: '', images: [{ mediaType: 'image/png', data: 'aGVsbG8=' }], details: undefined });
    });

    test('preserves unknown content blocks and generic JSON instead of discarding results', () => {
        expect(nativeToolResultContent(result({ content: [{ type: 'custom', value: 'kept' }] })).text).toContain('kept');
        expect(nativeToolResultContent(result({ count: 0 })).text).toBe('{"count":0}');
        expect(nativeToolResultContent(result(null)).text).toBe('null');
        expect(nativeToolResultContent(result(undefined)).text).toBe('');
    });
});

describe('parseDiffToUnified', () => {
    test('handles a streamed diff with a bare Index header', () => {
        expect(parseDiffToUnified('Index:')).toEqual([]);
        expect(parseDiffToUnified('Index:\n@@ -1,1 +1,1 @@\n-old\n+new')).toEqual([
            {
                file: 'file',
                oldStart: 1,
                newStart: 1,
                lines: [
                    { type: 'removed', lineNumber: 1, content: 'old' },
                    { type: 'added', lineNumber: 1, content: 'new' },
                ],
            },
        ]);
    });

    test('preserves spaces when extracting the indexed filename', () => {
        const [hunk] = parseDiffToUnified('Index: src/my file.ts\n@@ -1,1 +1,1 @@\n-old\n+new');

        expect(hunk?.file).toBe('my file.ts');
    });
});

describe('renderTerminalOutput', () => {
    test('renders carriage-return progress updates as their latest value', () => {
        expect(renderTerminalOutput('Downloading 10%\r\u001B[2KDownloading 90%')).toBe('Downloading 90%');
    });

    test('removes ANSI styles while preserving the output text', () => {
        expect(renderTerminalOutput('\u001B[32mComplete\u001B[0m\n')).toBe('Complete\n');
    });

    test('applies cursor-up progress updates to the prior line', () => {
        expect(renderTerminalOutput('First\nWorking\u001B[1A\r\u001B[2KDone\n')).toBe('Done\nWorking');
    });

    test('CSI K erases from cursor to end of line', () => {
        expect(renderTerminalOutput('Hello World\u001B[5G\u001B[K')).toBe('Hell');
    });

    test('CSI 1 K erases from beginning of line through cursor, preserving suffix', () => {
        expect(renderTerminalOutput('Hello World\u001B[6G\u001B[1K')).toBe('      World');
    });

    test('CSI 2 K erases entire line', () => {
        expect(renderTerminalOutput('Hello World\u001B[2K')).toBe('');
    });

    test('handles large single-line output without quadratic slowdown', () => {
        const largeLine = 'A'.repeat(50000) + '\u001B[0m';
        const start = performance.now();
        const result = renderTerminalOutput(largeLine);
        const elapsed = performance.now() - start;
        expect(result).toBe('A'.repeat(50000));
        expect(elapsed).toBeLessThan(1000);
    });

    test('bounds synthetic rows from large cursor coordinates', () => {
        const result = renderTerminalOutput('\u001B[999999999Bdone');
        expect(result.endsWith('done')).toBe(true);
        expect(result.length <= 100_004).toBe(true);
    });

    test('bounds synthetic columns from large cursor coordinates', () => {
        const result = renderTerminalOutput('\u001B[999999999Cdone');
        expect(result.endsWith('done')).toBe(true);
        expect(result.length <= 100_004).toBe(true);
    });

    test('shares the synthetic allocation budget across cursor movements', () => {
        const result = renderTerminalOutput('\u001B[50001B\u001B[999999999Cdone');
        expect(result.endsWith('done')).toBe(true);
        expect(result.length <= 100_004).toBe(true);
    });

    test('bounds absolute cursor row and column coordinates', () => {
        const result = renderTerminalOutput('\u001B[999999999;999999999Hdone');
        expect(result.endsWith('done')).toBe(true);
        expect(result.length <= 100_004).toBe(true);
    });

    test('bounds absolute cursor columns', () => {
        const result = renderTerminalOutput('\u001B[999999999Gdone');
        expect(result.endsWith('done')).toBe(true);
        expect(result.length <= 100_004).toBe(true);
    });
});


describe('streaming output transitions', () => {
    test('allows shell snapshots to be rewritten or shortened while running', () => {
        expect(getStreamingThrottleText('progress 10%', 'progress 20%', true, true)).toBe('progress 20%');
        expect(getStreamingThrottleText('long output', 'short', true, true)).toBe('short');
    });

    test('preserves monotonic streaming text by default', () => {
        expect(getStreamingThrottleText('long output', 'short', true, false)).toBe('long output');
    });
});


describe('OhPiChamber tool output', () => {
    test('keeps the result envelope in the generic JSON rendering pipeline', () => {
        const result = {
            schemaVersion: 1,
            ok: true,
            action: 'projects.list',
            data: { projects: [] },
        };
        expect(tryParseJsonOutput(JSON.stringify(result))).toEqual({ data: result, isJson: true });
    });
});
