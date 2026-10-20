import { describe, expect, test } from 'bun:test';
import type { Message, Part } from '@openchamber/agent-contract';

import { attachToolResultsForDisplay } from '../messageDisplayNormalization';
import { buildLiveStreamingEntry, type StreamingTailEntry } from './streamingTailEntry';
import type { ChatMessageEntry, TurnRecord } from './types';

const message = (id: string, role: ChatMessageEntry['role'], turnId?: string, parts: Part[] = []): ChatMessageEntry => ({
    messageId: id, sessionId: 'ses_1', turnId: turnId ?? id, role, createdAt: 1, parts,
});

const textPart = (id: string, text: string): Part => ({ type: 'text', partId: id, content: text });

const reasoningPart = (id: string, text: string): Part => ({ type: 'reasoning', partId: id, content: text });

const turnEntry = (assistant: ChatMessageEntry): StreamingTailEntry => {
    const user = message('user_1', 'user');
    return {
        kind: 'turn',
        key: 'turn:user_1',
        isLastTurn: true,
        turn: {
            turnId: 'user_1',
            userMessageId: 'user_1',
            userMessage: user,
            headerMessageId: assistant.messageId,
            messages: [],
            assistantMessageIds: [assistant.messageId],
            assistantMessages: [assistant],
            activityParts: [],
            activitySegments: [],
            summary: {},
            hasTools: false,
            hasReasoning: false,
            stream: { isStreaming: true, isRetrying: false },
        } satisfies TurnRecord,
    };
};

describe('buildLiveStreamingEntry', () => {
    test('returns the same entry when the active message is not in the tail', () => {
        const assistant = message('assistant_1', 'assistant', 'user_1', [textPart('part_1', 'old')]);
        const entry = turnEntry(assistant);

        const next = buildLiveStreamingEntry(entry, {
            livePartsByMessageId: { assistant_other: [textPart('part_live', 'live')] },
            showTextJustificationActivity: true,
            showTurnChangedFiles: false,
        });

        expect(next).toBe(entry);
    });

    test('rebuilds only the streaming turn with live parts', () => {
        const assistant = message('assistant_1', 'assistant', 'user_1', [textPart('part_1', 'hel')]);
        const entry = turnEntry(assistant);
        const liveParts = [reasoningPart('part_1_live', 'thinking')];

        const next = buildLiveStreamingEntry(entry, {
            livePartsByMessageId: { assistant_1: liveParts },
            showTextJustificationActivity: true,
            showTurnChangedFiles: false,
        });

        expect(next).not.toBe(entry);
        expect(next.kind).toBe('turn');
        if (next.kind !== 'turn') return;
        expect(next.turn.assistantMessages[0]?.parts).toBe(liveParts);
        expect(next.turn.activityParts.length).toBeGreaterThan(0);
    });

    test('updates an ungrouped streaming message with live parts', () => {
        const stale = message('assistant_1', 'assistant', undefined, [textPart('part_1', 'old')]);
        const entry: StreamingTailEntry = {
            kind: 'ungrouped',
            key: 'msg:assistant_1',
            message: stale,
        };
        const liveParts = [textPart('part_1_live', 'live')];

        const next = buildLiveStreamingEntry(entry, {
            livePartsByMessageId: { assistant_1: liveParts },
            showTextJustificationActivity: false,
            showTurnChangedFiles: false,
        });

        expect(next).not.toBe(entry);
        expect(next.kind).toBe('ungrouped');
        if (next.kind !== 'ungrouped') return;
        expect(next.message.parts).toBe(liveParts);
    });

    test('keeps contract step_summary parts and drops a non-object live entry', () => {
        const stale = message('assistant_1', 'assistant', 'user_1', [textPart('part_1', 'old')]);
        const entry = turnEntry(stale);
        const visible = textPart('part_visible', 'visible');
        const summary: Part = { type: 'step_summary', partId: 'part_summary', title: 'Done' };
        // SAFETY: the live store is untyped at runtime; JSON.parse supplies the non-part value normalizeParts must reject.
        const invalid = JSON.parse('null') as Part;

        const next = buildLiveStreamingEntry(entry, {
            livePartsByMessageId: { assistant_1: [invalid, summary, visible] },
            showTextJustificationActivity: true,
            showTurnChangedFiles: false,
        });

        expect(next.kind).toBe('turn');
        if (next.kind !== 'turn') return;
        expect(next.turn.assistantMessages[0]?.parts).toEqual([summary, visible]);
    });

    test('keeps display-paired tool results when live parts omit the system result', () => {
        const call: Part = {
            type: 'tool_call', partId: 'edit-call', toolCallId: 'edit-1', toolName: 'edit',
            input: { path: 'NOTES.md' }, status: 'completed',
        };
        const result: Part = {
            type: 'tool_result', partId: 'edit-result', toolCallId: 'edit-1', toolName: 'edit',
            output: { content: [{ type: 'text', text: 'updated' }], details: { diff: '-old\n+new', op: 'update' } },
            isError: false,
        };
        const rawAssistant = message('assistant_1', 'assistant', 'user_1', [call]);
        const system = message('system_1', 'system', 'user_1', [result]);
        const display = attachToolResultsForDisplay([rawAssistant], [rawAssistant, system])[0]!;
        expect(display.parts).toHaveLength(2);
        const entry = turnEntry(display);

        // The live part store still carries the result on the system message,
        // so the assistant's live parts contain only the call.
        const next = buildLiveStreamingEntry(entry, {
            livePartsByMessageId: { assistant_1: [call] },
            showTextJustificationActivity: true,
            showTurnChangedFiles: false,
        });

        expect(next.kind).toBe('turn');
        if (next.kind !== 'turn') return;
        expect(next.turn.assistantMessages[0]?.parts).toEqual([call, result]);
        expect(next.turn.activityParts.some((activity) => activity.part === result)).toBe(true);
    });

    test('never duplicates a tool result that is already in live parts', () => {
        const call: Part = {
            type: 'tool_call', partId: 'edit-call', toolCallId: 'edit-1', toolName: 'edit',
            input: { path: 'NOTES.md' }, status: 'completed',
        };
        const result: Part = {
            type: 'tool_result', partId: 'edit-result', toolCallId: 'edit-1', toolName: 'edit',
            output: { content: [{ type: 'text', text: 'updated' }] }, isError: false,
        };
        const assistant = message('assistant_1', 'assistant', 'user_1', [call, result]);

        const next = buildLiveStreamingEntry(turnEntry(assistant), {
            livePartsByMessageId: { assistant_1: [call, result] },
            showTextJustificationActivity: true,
            showTurnChangedFiles: false,
        });

        expect(next.kind).toBe('turn');
        if (next.kind !== 'turn') return;
        expect(next.turn.assistantMessages[0]?.parts.map((part) => part.partId)).toEqual(['edit-call', 'edit-result']);
    });

    test('keeps a finished step message on its live parts after the stream moves on', () => {
        const finished = message('assistant_1', 'assistant', 'user_1', []);
        const streaming = message('assistant_2', 'assistant', 'user_1', []);
        const entry = turnEntry(finished);
        if (entry.kind !== 'turn') return;
        entry.turn.assistantMessageIds = ['assistant_1', 'assistant_2'];
        entry.turn.assistantMessages = [finished, streaming];
        const finishedLive = [textPart('part_tool_done', 'tool output')];
        const streamingLive = [textPart('part_streaming', 'streaming')];

        const next = buildLiveStreamingEntry(entry, {
            livePartsByMessageId: { assistant_1: finishedLive, assistant_2: streamingLive },
            showTextJustificationActivity: true,
            showTurnChangedFiles: false,
        });

        expect(next.kind).toBe('turn');
        if (next.kind !== 'turn') return;
        expect(next.turn.assistantMessages[0]?.parts).toEqual(finishedLive);
        expect(next.turn.assistantMessages[1]?.parts).toEqual(streamingLive);
    });

    test('never erases record parts with an empty live array', () => {
        const assistant = message('assistant_1', 'assistant', 'user_1', [textPart('part_1', 'kept')]);
        const entry = turnEntry(assistant);

        const next = buildLiveStreamingEntry(entry, {
            livePartsByMessageId: { assistant_1: [] },
            showTextJustificationActivity: true,
            showTurnChangedFiles: false,
        });

        expect(next).toBe(entry);
    });
});

describe('buildLiveStreamingEntry reuse across publishes', () => {
    const options = (liveParts: Part[]) => ({
        livePartsByMessageId: { asst_1: liveParts },
        showTextJustificationActivity: false,
        showTurnChangedFiles: false,
    });

    test('an unchanged record and live parts normalize to the same message object', () => {
        const record = message('asst_1', 'assistant', 'user_1', [textPart('p1', 'old')]);
        const entry: StreamingTailEntry = { kind: 'ungrouped', key: 'asst_1', message: record };
        const liveParts = [textPart('p1', 'new text')];

        const first = buildLiveStreamingEntry(entry, options(liveParts));
        const second = buildLiveStreamingEntry(entry, options(liveParts));
        expect(first.kind === 'ungrouped' && second.kind === 'ungrouped' && first.message === second.message).toBe(true);

        const changed = buildLiveStreamingEntry(entry, options([textPart('p1', 'newer text')]));
        expect(changed.kind === 'ungrouped' && first.kind === 'ungrouped' && changed.message !== first.message).toBe(true);
    });
});
