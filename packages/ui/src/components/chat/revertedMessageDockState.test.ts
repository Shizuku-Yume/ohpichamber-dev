import { describe, expect, test } from 'bun:test';
import type { Message, Part } from '@openchamber/agent-contract';
import type { State } from '@/sync/types';

import { EMPTY_REVERTED_MESSAGE_DOCK_STATE, buildRevertedMessageDockState } from './revertedMessageDockState';

const sessionId = 'session-1';
const message = (messageId: string, role: Message['role'], partContent?: string): Message => ({
    messageId,
    sessionId,
    turnId: `turn-${messageId}`,
    role,
    createdAt: 1,
    parts: partContent === undefined ? [] : [{ type: 'text', partId: `part-${messageId}`, content: partContent }],
});

const state = (partial: Partial<State>): Pick<State, 'session' | 'message'> => ({
    session: [],
    message: {},
    ...partial,
});

const session = {
    sessionId,
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    displayPath: '.',
    rootSessionId: sessionId,
    createdAt: 1,
    updatedAt: 1,
    epoch: 'epoch-1',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    metadata: null,
    metadataRevision: '0',
    archiveRevision: '0',
} satisfies State['session'][number];

describe('buildRevertedMessageDockState', () => {
    test('does not infer staged reverts from canonical messages or parts', () => {
        const previous = buildRevertedMessageDockState(state({
            session: [session],
            message: { [sessionId]: [message('message-1', 'user', 'Prompt'), message('message-2', 'assistant', 'Reply')] },
        }), sessionId);
        const next = buildRevertedMessageDockState(state({
            session: [{ ...session, updatedAt: 2 }],
            message: { [sessionId]: [message('message-1', 'user', 'Updated prompt'), message('message-2', 'assistant', 'Reply')] },
        }), sessionId, previous);

        expect(previous).toBe(EMPTY_REVERTED_MESSAGE_DOCK_STATE);
        expect(next).toBe(EMPTY_REVERTED_MESSAGE_DOCK_STATE);
        expect(next.records).toEqual([]);
    });
});
