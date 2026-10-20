import { describe, expect, test } from 'bun:test';
import type { ChatMessageEntry } from './turns/types';
import { attachToolResultsForDisplay } from './messageDisplayNormalization';

type Role = ChatMessageEntry['role'];
const message = (messageId: string, role: Role, parts: ChatMessageEntry['parts'], turnId = 'turn-1'): ChatMessageEntry => ({
    messageId, sessionId: 'session-1', turnId, role, createdAt: 1, parts,
});
const call = (toolCallId: string, status: 'running' | 'completed' = 'completed') => ({
    type: 'tool_call' as const, partId: `${toolCallId}-call`, toolCallId, toolName: 'edit',
    input: { path: 'NOTES.md' }, status,
});
const result = (toolCallId: string, isError = false, partId = `${toolCallId}-result`) => ({
    type: 'tool_result' as const, partId, toolCallId, toolName: 'edit',
    output: {
        content: [{ type: 'text' as const, text: isError ? 'edit failed' : 'updated' }],
        details: { path: 'NOTES.md', diff: ' 1|# Fixture\n-2|old\n+2|new', op: 'update' },
    },
    isError, error: isError ? 'Tool execution failed' : undefined,
});

describe('display-only native tool result pairing', () => {
    test('pairs a completed system result into its exact call message without mutating the transcript', () => {
        const assistant = message('assistant-1', 'assistant', [call('call-1')]);
        const system = message('system-1', 'system', [result('call-1')]);
        const display = attachToolResultsForDisplay([assistant], [assistant, system]);
        expect(display).toHaveLength(1);
        expect(display[0]).not.toBe(assistant);
        expect(display[0]!.parts.map(part => part.type)).toEqual(['tool_call', 'tool_result']);
        expect(display[0]!.parts[1]).toEqual(result('call-1'));
        expect(assistant.parts).toHaveLength(1);
        expect(system.parts).toHaveLength(1);
        expect(attachToolResultsForDisplay(display, [assistant, system])).toBe(display);
    });

    test('preserves a failed result as a failure and pairs only the exact call', () => {
        const assistant = message('assistant-1', 'assistant', [call('call-1')]);
        const system = message('system-1', 'system', [result('call-1', true), result('other-call')]);
        const display = attachToolResultsForDisplay([assistant], [assistant, system]);
        expect(display[0]!.parts).toHaveLength(2);
        const paired = display[0]!.parts[1];
        expect(paired.type === 'tool_result' && paired.isError).toBe(true);
        expect(paired.type === 'tool_result' && paired.error).toBe('Tool execution failed');
    });

    test('leaves an unmatched running call untouched', () => {
        const assistant = message('assistant-1', 'assistant', [call('call-1', 'running')]);
        const system = message('system-1', 'system', [result('other-call')]);
        const displayMessages = [assistant];
        expect(attachToolResultsForDisplay(displayMessages, [assistant, system])).toBe(displayMessages);
        expect(assistant.parts).toHaveLength(1);
        expect(assistant.parts[0]!.type === 'tool_call' && assistant.parts[0]!.status).toBe('running');
    });

    test('re-renders with a new message identity when a live result arrives for the same call', () => {
        const assistant = message('assistant-1', 'assistant', [call('call-1', 'running')]);
        const before = attachToolResultsForDisplay([assistant], [assistant]);
        const updatedAssistant = assistant;
        const system = message('system-1', 'system', [result('call-1')]);
        const after = attachToolResultsForDisplay([updatedAssistant], [updatedAssistant, system]);
        expect(after[0]).not.toBe(before[0]);
        expect(after[0]!.messageId).toBe('assistant-1');
        expect(after[0]!.parts).toHaveLength(2);
        expect(before[0]!.parts).toHaveLength(1);
    });

    test('keeps multi-call and multi-turn results with their owning messages once', () => {
        const first = message('assistant-1', 'assistant', [call('call-1'), call('call-2')]);
        const second = message('assistant-2', 'assistant', [call('call-3')]);
        const system = message('system-1', 'system', [result('call-2'), result('call-1'), result('call-3')]);
        const display = attachToolResultsForDisplay([first, second], [first, second, system]);
        expect(display[0]!.parts.map(part => part.partId)).toEqual(['call-1-call', 'call-1-result', 'call-2-call', 'call-2-result']);
        expect(display[1]!.parts.map(part => part.partId)).toEqual(['call-3-call', 'call-3-result']);
    });

    test('does not join a reused toolCallId to another turn', () => {
        const first = message('assistant-1', 'assistant', [call('call-1')], 'turn-1');
        const second = message('assistant-2', 'assistant', [call('call-1')], 'turn-2');
        const firstResult = result('call-1', false, 'turn-1-result');
        const secondResult = result('call-1', false, 'turn-2-result');
        const systemOne = message('system-1', 'system', [firstResult], 'turn-1');
        const systemTwo = message('system-2', 'system', [secondResult], 'turn-2');
        const display = attachToolResultsForDisplay([first, second], [first, second, systemOne, systemTwo]);
        expect(display[0]!.parts.map(part => part.partId)).toEqual(['call-1-call', 'turn-1-result']);
        expect(display[1]!.parts.map(part => part.partId)).toEqual(['call-1-call', 'turn-2-result']);
    });
});
