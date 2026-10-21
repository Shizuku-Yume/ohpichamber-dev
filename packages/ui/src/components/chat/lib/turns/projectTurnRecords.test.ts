import { describe, expect, test } from 'bun:test';
import type { Message } from '@openchamber/agent-contract';
import { projectTurnRecords } from './projectTurnRecords';
import type { ChatMessageEntry } from './types';

function createMessageEntry({ id, role, createdAt, turnId = id }: { id: string; role: 'user' | 'assistant' | 'system'; createdAt: number; turnId?: string }): ChatMessageEntry {
    return { messageId: id, sessionId: 'session', turnId, role, createdAt, parts: [] };
}

describe('projectTurnRecords', () => {
    test('groups assistant replies under their parent user turn', () => {
        const user = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });

        const projection = projectTurnRecords([user, assistant]);

        expect(projection.turns).toHaveLength(1);
        expect(projection.turns[0]?.turnId).toBe('u1');
        expect(projection.turns[0]?.assistantMessageIds).toEqual(['a1']);
        expect(projection.ungroupedMessageIds.size).toBe(0);
    });

    test('splits consecutive assistant replies across the user turns they follow', () => {
        const user1 = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant1 = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });
        const user2 = createMessageEntry({ id: 'u2', role: 'user', createdAt: 3 });
        const assistant2 = createMessageEntry({ id: 'a2', role: 'assistant', createdAt: 4, turnId: 'u2' });

        const projection = projectTurnRecords([user1, assistant1, user2, assistant2]);

        expect(projection.turns).toHaveLength(2);
        expect(projection.turns[0]?.turnId).toBe('u1');
        expect(projection.turns[0]?.assistantMessageIds).toEqual(['a1']);
        expect(projection.turns[1]?.turnId).toBe('u2');
        expect(projection.turns[1]?.assistantMessageIds).toEqual(['a2']);
        expect(projection.ungroupedMessageIds.size).toBe(0);
    });

    test('does not render an assistant reply that arrives before any user turn', () => {
        // A page loaded from the middle of a session can start on an assistant
        // message; it has no turn to belong to and must not invent one.
        const orphan = createMessageEntry({ id: 'a0', role: 'assistant', createdAt: 1 });
        const user1 = createMessageEntry({ id: 'u1', role: 'user', createdAt: 2 });
        const assistant1 = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 3, turnId: 'u1' });

        const projection = projectTurnRecords([orphan, user1, assistant1]);

        expect(projection.turns).toHaveLength(1);
        expect(projection.turns[0]?.turnId).toBe('u1');
        expect(projection.turns[0]?.assistantMessageIds).toEqual(['a1']);
        expect(projection.ungroupedMessageIds.has('a0')).toBe(false);
        expect(projection.indexes.messageToTurnId.has('a0')).toBe(false);
    });

    test('does not render orphan assistant messages as standalone ungrouped entries', () => {
        const assistant = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 1 });

        const projection = projectTurnRecords([assistant]);

        expect(projection.turns).toHaveLength(0);
        expect(projection.ungroupedMessageIds.has('a1')).toBe(false);
        expect(projection.indexes.messageToTurnId.has('a1')).toBe(false);
    });

    test('opens a turn at a subagent run report so the parent reply renders under it', () => {
        const user = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });
        const report = createMessageEntry({ id: 's1', role: 'user', createdAt: 3 });
        const reaction = createMessageEntry({ id: 'a2', role: 'assistant', createdAt: 4, turnId: 's1' });

        const projection = projectTurnRecords([user, assistant, report, reaction]);

        expect(projection.turns.map((turn) => turn.turnId)).toEqual(['u1', 's1']);
        expect(projection.turns[1]?.assistantMessageIds).toEqual(['a2']);
        expect(projection.ungroupedMessageIds.has('s1')).toBe(false);
    });

    test('opens a turn at a compaction so the steps after it render under it', () => {
        // OpenCode compacts mid-run and the agent carries on; those steps must
        // not rejoin the prompt's turn and push the compaction above the prompt.
        const user = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const before = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });
        const compaction = createMessageEntry({ id: 'c1', role: 'user', createdAt: 3 });
        const after = createMessageEntry({ id: 'a2', role: 'assistant', createdAt: 4, turnId: 'c1' });

        const projection = projectTurnRecords([user, before, compaction, after]);

        expect(projection.turns.map((turn) => turn.turnId)).toEqual(['u1', 'c1']);
        expect(projection.turns[0]?.assistantMessageIds).toEqual(['a1']);
        expect(projection.turns[1]?.assistantMessageIds).toEqual(['a2']);
        expect(projection.ungroupedMessageIds.has('c1')).toBe(false);
    });

    test('keeps non-assistant orphan messages available as ungrouped entries', () => {
        const system = createMessageEntry({ id: 's1', role: 'system', createdAt: 1 });

        const projection = projectTurnRecords([system]);

        expect(projection.turns).toHaveLength(0);
        expect(projection.ungroupedMessageIds.has('s1')).toBe(true);
    });

    test('reuses unchanged turn records from the previous projection', () => {
        const user1 = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant1 = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });
        const user2 = createMessageEntry({ id: 'u2', role: 'user', createdAt: 3 });
        const assistant2 = createMessageEntry({ id: 'a2', role: 'assistant', createdAt: 4, turnId: 'u2' });
        const initial = projectTurnRecords([user1, assistant1, user2, assistant2]);
        const updatedAssistant2: ChatMessageEntry = {
            ...assistant2,
            parts: [{ type: 'text', partId: 'p1', content: 'stream update' }],
        };

        const next = projectTurnRecords([user1, assistant1, user2, updatedAssistant2], {
            previousProjection: initial,
        });

        expect(next.turns[0]).toBe(initial.turns[0]);
        expect(next.turns[1]).not.toBe(initial.turns[1]);
    });

    test('hydrates updated turns when a previous projection exists but no turn is reusable', () => {
        const user = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });
        const initial = projectTurnRecords([user, assistant]);
        const updatedAssistant: ChatMessageEntry = {
            ...assistant,
            parts: [{ type: 'tool_call', partId: 'tool_1', toolCallId: 'call_1', toolName: 'bash', input: {}, status: 'completed' }],
        };

        const next = projectTurnRecords([user, updatedAssistant], {
            previousProjection: initial,
        });

        expect(next.turns).toHaveLength(1);
        expect(next.turns[0]).not.toBe(initial.turns[0]);
        expect(next.turns[0]?.hasTools).toBe(true);
        expect(next.turns[0]?.activityParts).toHaveLength(1);
        expect(next.turns[0]?.stream.isStreaming).toBe(false);
        expect(next.turns[0]?.stream.isRetrying).toBe(false);
    });

    test('reuses the whole turns array when every turn is unchanged', () => {
        const user = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2 });
        const initial = projectTurnRecords([user, assistant]);

        const next = projectTurnRecords([user, assistant], {
            previousProjection: initial,
        });

        expect(next.turns).toBe(initial.turns);
        expect(next.turns[0]).toBe(initial.turns[0]);
    });

    test('merges turns started by hidden user messages when merging is enabled', () => {
        const user1 = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        user1.parts = [{ type: 'text', partId: 'p1', content: 'visible prompt' }];
        const assistant1 = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });
        const hiddenUser = createMessageEntry({ id: 'u2', role: 'user', createdAt: 3 });
        const assistant2 = createMessageEntry({ id: 'a2', role: 'assistant', createdAt: 4, turnId: 'u2' });

        const projection = projectTurnRecords([user1, assistant1, hiddenUser, assistant2], {
            mergeHiddenUserTurns: true,
        });

        expect(projection.turns).toHaveLength(1);
        expect(projection.turns[0]?.turnId).toBe('u1');
        expect(projection.turns[0]?.assistantMessageIds).toEqual(['a1', 'a2']);
        expect(projection.ungroupedMessageIds.has('u2')).toBe(false);
    });

    test('keeps hidden user messages as separate turns when merging is disabled', () => {
        const user1 = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant1 = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });
        const hiddenUser = createMessageEntry({ id: 'u2', role: 'user', createdAt: 3 });
        const assistant2 = createMessageEntry({ id: 'a2', role: 'assistant', createdAt: 4, turnId: 'u2' });

        const projection = projectTurnRecords([user1, assistant1, hiddenUser, assistant2]);

        expect(projection.turns).toHaveLength(2);
        expect(projection.turns[1]?.turnId).toBe('u2');
    });

    test('does not merge a hidden user message when there is no previous turn', () => {
        const hiddenUser = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        const assistant = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });

        const projection = projectTurnRecords([hiddenUser, assistant], {
            mergeHiddenUserTurns: true,
        });

        expect(projection.turns).toHaveLength(1);
        expect(projection.turns[0]?.turnId).toBe('u1');
        expect(projection.turns[0]?.assistantMessageIds).toEqual(['a1']);
    });

    test('chains merges across consecutive hidden user messages', () => {
        const user1 = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        user1.parts = [{ type: 'text', partId: 'p1', content: 'visible prompt' }];
        const assistant1 = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });
        const hidden1 = createMessageEntry({ id: 'u2', role: 'user', createdAt: 3 });
        const assistant2 = createMessageEntry({ id: 'a2', role: 'assistant', createdAt: 4, turnId: 'u2' });
        const hidden2 = createMessageEntry({ id: 'u3', role: 'user', createdAt: 5 });
        const assistant3 = createMessageEntry({ id: 'a3', role: 'assistant', createdAt: 6, turnId: 'u3' });

        const projection = projectTurnRecords([user1, assistant1, hidden1, assistant2, hidden2, assistant3], {
            mergeHiddenUserTurns: true,
        });

        expect(projection.turns).toHaveLength(1);
        expect(projection.turns[0]?.assistantMessageIds).toEqual(['a1', 'a2', 'a3']);
    });

    test('keeps text inline (not justification) when a message is blocked on a pending question', () => {
        const user = createMessageEntry({ id: 'u1', role: 'user', createdAt: 1 });
        user.parts = [{ type: 'text', partId: 'p1', content: 'prompt' }];
        const assistant = createMessageEntry({ id: 'a1', role: 'assistant', createdAt: 2, turnId: 'u1' });
        // The turn is blocked waiting for the user's answer: no finish and a
        // pending question tool part, with context text before the question.
        assistant.parts = [
            { type: 'text', partId: 'ap1', content: 'context before the question' },
            { type: 'tool_call', partId: 'ap2', toolCallId: 'c1', toolName: 'question', input: {}, status: 'pending_approval' },
        ];

        const projection = projectTurnRecords([user, assistant], {
            showTextJustificationActivity: true,
        });

        const turn = projection.turns[0];
        expect(turn).toBeDefined();
        const textActivity = turn?.activityParts.find((activity) => activity.partIndex === 0);
        expect(textActivity?.kind).not.toBe('justification');
        // The question tool itself still participates in the activity group.
        const questionActivity = turn?.activityParts.find((activity) => activity.partIndex === 1);
        expect(questionActivity?.kind).toBe('tool');
    });
});
