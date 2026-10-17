import { describe, expect, test } from 'bun:test';
import type { Message, Session } from '@openchamber/agent-contract';
import type { State } from '@/sync/types';
import { selectRunningSubagentRuns, withRunningSubagentRuns } from './runningSubagentRuns';
const PARENT = 'ses_parent';
const session = (sessionId: string, createdAt: number, parentSessionId: string | undefined = PARENT): Session => ({
    sessionId, parentSessionId, rootSessionId: parentSessionId ?? sessionId, projectId: 'proj', workspaceId: 'workspace',
    displayPath: sessionId, createdAt, updatedAt: createdAt, epoch: '0', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    archivedAt: undefined, metadata: { title: `run ${sessionId}` }, metadataRevision: '1', archiveRevision: '0',
});
const state = (sessions: Session[], busy: string[], invalidated: string[] = []): Pick<State, 'session' | 'session_status' | 'sessionStatusInvalidated'> => ({
    session: sessions,
    session_status: Object.fromEntries(sessions.map((item) => [item.sessionId, busy.includes(item.sessionId) ? 'running' as const : 'idle' as const])),
    sessionStatusInvalidated: invalidated.reduce<Record<string, true>>((result, id) => {
        result[id] = true;
        return result;
    }, {}),
});
const message = (messageId: string, createdAt: number): Message => ({
    messageId, sessionId: PARENT, turnId: messageId, role: 'user', createdAt, parts: [],
});

describe('selectRunningSubagentRuns', () => {
    test('projects busy child sessions without synthesizing transcript records', () => {
        const runs = selectRunningSubagentRuns(state([session('child', 10), session('idle', 11)], ['child']), PARENT);
        expect(runs).toEqual([{ type: 'running_subagent', sessionId: 'child', parentSessionId: PARENT, createdAt: 10, description: 'run child' }]);
    });
    test('ignores children of other sessions and invalidated busy status', () => {
        expect(selectRunningSubagentRuns(state([session('other', 10, 'elsewhere'), session('invalid', 11)], ['other', 'invalid'], ['invalid']), PARENT)).toEqual([]);
    });
});

describe('withRunningSubagentRuns', () => {
    test('inserts runs at their creation time', () => {
        const messages = [message('before', 1), message('after', 20)];
        const runs = selectRunningSubagentRuns(state([session('child', 10)], ['child']), PARENT);
        expect(withRunningSubagentRuns(messages, runs).map((entry) => 'messageId' in entry ? entry.messageId : entry.sessionId)).toEqual(['before', 'child', 'after']);
    });
    test('returns the timeline untouched without runs', () => {
        const messages = [message('one', 1)];
        expect(withRunningSubagentRuns(messages, [])).toBe(messages);
    });
});
