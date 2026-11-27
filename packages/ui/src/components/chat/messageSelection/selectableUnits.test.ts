import { afterEach, describe, expect, test } from 'bun:test';

import type { Part } from '@openchamber/agent-contract';
import { useMessageSelectionStore } from '@/stores/useMessageSelectionStore';
import type { ChatMessageEntry } from '../lib/turns/types';
import { listSelectableUnits } from './selectableUnits';
import { pickSelectedUnits } from './selectionExport';

let partCounter = 0;
const text = (content: string): Part => ({ partId: `p${partCounter++}`, type: 'text', content });
const tool = (): Part => ({
    partId: `p${partCounter++}`,
    type: 'tool_call',
    toolCallId: `tc${partCounter}`,
    toolName: 'read',
    input: { path: 'a.ts' },
    status: 'completed',
});
const reasoning = (content: string): Part => ({ partId: `p${partCounter++}`, type: 'reasoning', content });

const user = (messageId: string, ...parts: Part[]): ChatMessageEntry => ({
    messageId,
    sessionId: 's',
    turnId: messageId,
    role: 'user',
    createdAt: 1,
    parts,
});

const assistant = (messageId: string, ...parts: Part[]): ChatMessageEntry => ({
    messageId,
    sessionId: 's',
    turnId: 't',
    role: 'assistant',
    providerId: 'p',
    modelId: 'm',
    createdAt: 2,
    parts,
});

describe('listSelectableUnits', () => {
    test('takes a prompt and its whole answer, without tools and reasoning', () => {
        const units = listSelectableUnits([
            user('u1', text('Why?')),
            assistant('a1', reasoning('hmm'), text('Reading first.'), tool()),
            assistant('a2', tool(), text('Because.')),
            user('u2', text('Thanks')),
        ]);
        expect(units.map((unit) => unit.key)).toEqual(['prompt:u1', 'answer:u1', 'prompt:u2']);
        expect(units[1]).toMatchObject({ kind: 'answer', messageId: 'a2', segments: ['Reading first.', 'Because.'], modelID: 'm' });
    });

    test('leaves out an answer with no text', () => {
        const units = listSelectableUnits([user('u1', text('Run it')), assistant('a1', tool())]);
        expect(units.map((unit) => unit.key)).toEqual(['prompt:u1']);
    });

    test('reports a selected unit that is gone', () => {
        const records = [user('u1', text('Hi')), assistant('a1', text('Hello'))];
        expect(pickSelectedUnits(records, new Set(['answer:u1', 'prompt:u1'])).complete).toBe(true);
        const picked = pickSelectedUnits(records, new Set(['answer:u1', 'prompt:gone']));
        expect(picked).toMatchObject({ complete: false, units: [{ key: 'answer:u1' }] });
    });
});

describe('useMessageSelectionStore', () => {
    afterEach(() => useMessageSelectionStore.getState().end());

    test('toggles, adds a range from the last click and ends for its own session only', () => {
        const store = useMessageSelectionStore.getState();
        const order = ['prompt:1', 'answer:1', 'prompt:2', 'answer:2'];
        store.begin('s1', 'prompt:1');
        store.toggle('s1', 'answer:1');
        store.toggle('s1', 'answer:1');
        store.selectRange('s1', 'answer:2', order);
        expect([...useMessageSelectionStore.getState().selection!.keys]).toEqual(order);
        store.toggle('s2', 'prompt:9');
        store.end('s2');
        expect(useMessageSelectionStore.getState().selection?.keys.size).toBe(4);
        store.end('s1');
        expect(useMessageSelectionStore.getState().selection).toBeNull();
    });
});
