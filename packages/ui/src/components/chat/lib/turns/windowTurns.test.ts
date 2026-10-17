import { describe, expect, test } from 'bun:test';
import type { Message } from '@openchamber/agent-contract';
import { buildTurnWindowModel, updateTurnWindowModelIncremental } from './windowTurns';
import type { ChatMessageEntry } from './types';

function message({ id, role, turnId }: { id: string; role: 'user' | 'assistant' | 'system'; turnId?: string }): ChatMessageEntry {
    return {
        messageId: id,
        sessionId: 'session_1',
        turnId: turnId ?? id,
        role,
        createdAt: 1,
        parts: [],
    } satisfies Message;
}

describe('windowTurns', () => {
    test('does not map assistant messages without a parent to the current turn', () => {
        const user = message({ id: 'u1', role: 'user' });
        const assistant = message({ id: 'a1', role: 'assistant' });

        const model = buildTurnWindowModel([user, assistant]);

        expect(model.messageToTurnId.get('u1')).toBe('u1');
        expect(model.messageToTurnId.has('a1')).toBe(false);
    });

    test('incremental update does not map assistant messages without a parent to the current turn', () => {
        const user = message({ id: 'u1', role: 'user' });
        const assistant = message({ id: 'a1', role: 'assistant' });
        const base = buildTurnWindowModel([user]);

        const next = updateTurnWindowModelIncremental(base, [user], [user, assistant]);

        expect(next?.messageToTurnId.get('u1')).toBe('u1');
        expect(next?.messageToTurnId.has('a1')).toBe(false);
    });

    test('maps assistant messages to their parent user turn', () => {
        const user = message({ id: 'u1', role: 'user' });
        const assistant = message({ id: 'a1', role: 'assistant', turnId: 'u1' });

        const model = buildTurnWindowModel([user, assistant]);

        expect(model.messageToTurnId.get('a1')).toBe('u1');
    });
});
