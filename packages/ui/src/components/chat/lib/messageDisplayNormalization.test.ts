import { describe, expect, test } from 'bun:test';
import type { ChatMessageEntry } from './turns/types';
import { getNormalizedMessageForDisplay } from './messageDisplayNormalization';

const message = (parts: ChatMessageEntry['parts']): ChatMessageEntry => ({
    messageId: 'assistant-1', sessionId: 'session-1', turnId: 'turn-1', role: 'assistant', createdAt: 1, parts,
});

describe('display normalization', () => {
    test('keeps an unchanged message as the same object', () => {
        const source = message([{ type: 'text', partId: 'part-1', content: 'hello' }]);
        expect(getNormalizedMessageForDisplay(source)).toBe(source);
        expect(getNormalizedMessageForDisplay(source)).toBe(source);
    });

    test('drops a malformed part and memoizes the copy', () => {
        const malformed = { partId: 'part-bad', content: 'no type' } as unknown as ChatMessageEntry['parts'][number];
        const source = message([{ type: 'text', partId: 'part-1', content: 'hello' }, malformed]);
        const normalized = getNormalizedMessageForDisplay(source);
        expect(normalized).not.toBe(source);
        expect(normalized.parts).toHaveLength(1);
        expect(getNormalizedMessageForDisplay(source)).toBe(normalized);
    });

    test('anchors streamed results beside their calls rather than in completion order', () => {
        const calls = ['todo', 'bash', 'task'].map((toolName) => ({
            type: 'tool_call' as const, partId: `${toolName}-call`, toolCallId: toolName, toolName, input: {}, status: 'running' as const,
        }));
        const results = ['todo', 'task', 'bash'].map((toolName) => ({
            type: 'tool_result' as const, partId: `${toolName}-result`, toolCallId: toolName, toolName, isError: false,
        }));
        for (let count = 0; count <= results.length; count++) {
            const source = message([...calls, ...results.slice(0, count)]);
            const normalized = getNormalizedMessageForDisplay(source);
            const resultIds = new Set(results.slice(0, count).map((part) => part.toolCallId));
            const rows = normalized.parts.filter((part) => part.type !== 'tool_call' || !resultIds.has(part.toolCallId));
            expect(rows.map((part) => part.type === 'tool_call' || part.type === 'tool_result' ? part.toolName : part.type))
                .toEqual(['todo', 'bash', 'task']);
            expect(source.parts).toEqual([...calls, ...results.slice(0, count)]);
            expect(getNormalizedMessageForDisplay(source)).toBe(normalized);
        }
    });

    test('keeps unmatched results and does not pair a different tool with the same call id', () => {
        const source = message([
            { type: 'tool_call', partId: 'call', toolCallId: 'shared', toolName: 'bash', input: {}, status: 'running' },
            { type: 'text', partId: 'text', content: 'between' },
            { type: 'tool_result', partId: 'wrong-tool', toolCallId: 'shared', toolName: 'task', isError: false },
            { type: 'tool_result', partId: 'orphan', toolCallId: 'orphan', toolName: 'bash', isError: false },
        ]);
        expect(getNormalizedMessageForDisplay(source)).toBe(source);
    });
});
