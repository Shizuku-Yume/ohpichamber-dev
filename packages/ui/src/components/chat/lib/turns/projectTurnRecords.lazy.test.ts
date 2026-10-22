import { describe, expect, test } from 'bun:test';
import type { Message, Part } from '@openchamber/agent-contract';
import { projectTurnRecords } from './projectTurnRecords';
import type { ChatMessageEntry } from './types';

// Counts reads of each part's `type`, the first field the summary, activity
// and changed-files projections inspect.
const countPartReads = (part: Part, counter: { reads: number }): Part => {
    const counted = { ...part };
    Object.defineProperty(counted, 'type', {
        enumerable: true,
        get: () => {
            counter.reads += 1;
            return part.type;
        },
    });
    return counted;
};

const userEntry = (messageId: string, createdAt: number): ChatMessageEntry => ({
    messageId, sessionId: 's', turnId: messageId, role: 'user', createdAt, parts: [{ type: 'text', partId: `${messageId}_text`, content: 'Fix it' }],
});

const assistantEntry = (messageId: string, createdAt: number, counter: { reads: number }): ChatMessageEntry => {
    const message: Message = {
        messageId, sessionId: 's', turnId: `u${messageId.slice(1)}`, role: 'assistant', createdAt,
        parts: [
            { type: 'reasoning', partId: `${messageId}_reasoning`, content: 'thinking' },
            { type: 'tool_call', partId: `${messageId}_tool`, toolCallId: `${messageId}_call`, toolName: 'edit', input: { filePath: `/repo/${messageId}.ts` }, status: 'completed' },
            { type: 'text', partId: `${messageId}_text`, content: 'Done.' },
        ],
    };
    return { ...message, parts: message.parts.map((part) => countPartReads(part, counter)) };
};

const buildSession = (turnCount: number, counter: { reads: number }): ChatMessageEntry[] => (
    Array.from({ length: turnCount }, (_, index) => [
        userEntry(`u${index}`, index * 10),
        assistantEntry(`a${index}`, index * 10 + 1, counter),
    ]).flat()
);

describe('projectTurnRecords lazy derived fields', () => {
    test('opening a 100-turn session reads no assistant parts until a turn is rendered', () => {
        const counter = { reads: 0 };
        const messages = buildSession(100, counter);

        const projection = projectTurnRecords(messages, { showTextJustificationActivity: false, showTurnChangedFiles: true, mergeHiddenUserTurns: true });

        expect(projection.turns).toHaveLength(100);
        // Hydrating summary, activity and changed files for every turn up
        // front read each assistant part several times (recorded: 2700 reads
        // for 300 parts). Only rendered turns pay for them now.
        expect(counter.reads).toBe(0);

        const rendered = projection.turns.slice(-3);
        for (const turn of rendered) {
            void turn.activitySegments;
            void turn.changedFiles;
            void turn.summaryText;
        }
        const readsForThreeTurns = counter.reads;
        expect(readsForThreeTurns).toBeGreaterThan(0);

        // Reading again is free: each turn derives its fields once.
        for (const turn of rendered) {
            void turn.activityParts;
            void turn.hasTools;
            void turn.diffStats;
        }
        expect(counter.reads).toBe(readsForThreeTurns);
    });

    test('derives the same fields lazily as an eager read would', () => {
        const counter = { reads: 0 };
        const [turn] = projectTurnRecords(buildSession(1, counter), { showTextJustificationActivity: false, showTurnChangedFiles: true }).turns;

        expect(turn?.summaryText).toBe('Done.');
        expect(turn?.hasTools).toBe(true);
        expect(turn?.hasReasoning).toBe(true);
        expect(turn?.changedFiles?.map((file) => file.file)).toEqual(['/repo/a0.ts']);
        expect(turn?.diffStats?.files).toBe(1);
        expect(turn?.activityParts.map((activity) => activity.kind)).toEqual(['reasoning', 'tool']);
    });

    test('hides changed files but keeps diff stats when the setting is off', () => {
        const counter = { reads: 0 };
        const [turn] = projectTurnRecords(buildSession(1, counter), { showTextJustificationActivity: false, showTurnChangedFiles: false }).turns;

        expect(turn?.changedFiles).toBeUndefined();
        expect(turn?.diffStats?.files).toBe(1);
    });

    test('a spread copy carries the derived values', () => {
        const counter = { reads: 0 };
        const [turn] = projectTurnRecords(buildSession(1, counter), { showTextJustificationActivity: false, showTurnChangedFiles: true }).turns;
        if (!turn) throw new Error('expected a turn');

        const copy = { ...turn, assistantMessages: [] };

        expect(copy.summaryText).toBe('Done.');
        expect(copy.activityParts).toBe(turn.activityParts);
    });
});
