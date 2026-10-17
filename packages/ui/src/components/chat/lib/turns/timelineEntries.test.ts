import { beforeEach, describe, expect, test } from 'bun:test';
import type { Message } from '@openchamber/agent-contract';
import { projectTurnRecords } from './projectTurnRecords';
import { buildHistoryEntries, type TimelineEntry } from './timelineEntries';
import type { ChatMessageEntry, TurnProjectionResult, TurnRecord } from './types';

const user = (id: string): ChatMessageEntry => ({
    messageId: id, sessionId: 's', turnId: id, role: 'user', createdAt: 1,
    parts: [{ type: 'text', partId: `${id}_text`, content: id }],
});

const assistant = (id: string, turnId = id): ChatMessageEntry => ({
    messageId: id, sessionId: 's', turnId, role: 'assistant', createdAt: 1, parts: [],
});

const notice = (id: string): ChatMessageEntry => ({
    messageId: id, sessionId: 's', turnId: id, role: 'system', createdAt: 1, parts: [],
});

const turnsOf = (count: number): ChatMessageEntry[] => Array.from({ length: count }, (_, index) => [
    user(`u${index}`),
    assistant(`a${index}`),
]).flat();

let previousProjection: TurnProjectionResult | null = null;

const build = (messages: ChatMessageEntry[], previous: TimelineEntry[], tail?: ChatMessageEntry) => {
    const projection = projectTurnRecords(messages, { previousProjection });
    previousProjection = projection;
    const staticTurns: TurnRecord[] = projection.turns.slice(0, -1);
    return buildHistoryEntries({
        staticTurns,
        lastTurnId: projection.lastTurnId,
        turnsWithLaterAssistant: new Set(),
        messages,
        ungroupedMessageIds: projection.ungroupedMessageIds,
        hasStreamingTurn: true,
        trailingEntryFirstMessage: tail ?? projection.turns.at(-1)?.userMessage,
    }, previous);
};

const reusedCount = (before: TimelineEntry[], after: TimelineEntry[]): number => {
    const previous = new Set(before);
    return after.filter((entry) => previous.has(entry)).length;
};

describe('buildHistoryEntries', () => {
    beforeEach(() => {
        previousProjection = null;
    });

    test('links each turn to the first message of the row after it', () => {
        const messages = turnsOf(3);
        const entries = build(messages, []);

        expect(entries.map((entry) => entry.key)).toEqual(['turn:u0', 'turn:u1']);
        const [first, second] = entries;
        expect(first?.kind === 'turn' && first.nextEntryFirstMessage).toBe(messages[2]);
        expect(second?.kind === 'turn' && second.nextEntryFirstMessage).toBe(messages[4]);
    });

    test('a rebuild with unchanged rows returns the previous array', () => {
        const messages = turnsOf(50);
        const first = build(messages, []);

        expect(build(messages, first)).toBe(first);
    });

    test('a new turn adds one row and keeps every existing row object', () => {
        const messages = turnsOf(50);
        const before = build(messages, []);
        const grown = [...messages, user('u50'), assistant('a50')];

        const after = build(grown, before);

        expect(before).toHaveLength(49);
        expect(after).toHaveLength(50);
        expect(reusedCount(before, after)).toBe(49);
    });

    test('a turn re-projected under the same id gets a new row object', () => {
        const messages = turnsOf(5);
        const before = build(messages, []);
        const changed = [...messages];
        changed[3] = {
            ...assistant('a1'),
            parts: [{ partId: 'p', type: 'text', content: 'edited' }],
        };

        const after = build(changed, before);
        const beforeRow = before.find((entry) => entry.key === 'turn:u1');
        const afterRow = after.find((entry) => entry.key === 'turn:u1');

        expect(afterRow).not.toBe(beforeRow);
        expect(reusedCount(before, after)).toBe(before.length - 1);
    });

    test('keeps a notice outside any turn in its place between turns', () => {
        const messages = [notice('n0'), ...turnsOf(2)];
        const entries = build(messages, []);

        expect(entries.map((entry) => entry.key)).toEqual(['msg:n0', 'turn:u0']);
        const [noticeRow, turnRow] = entries;
        expect(noticeRow?.kind === 'ungrouped' && noticeRow.nextMessage).toBe(messages[1]);
        expect(turnRow?.kind === 'turn' && turnRow.nextEntryFirstMessage).toBe(messages[3]);
    });
});
