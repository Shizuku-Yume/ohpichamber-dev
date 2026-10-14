import { beforeEach, describe, expect, test } from 'bun:test';
import type { Message, SessionSnapshot } from '@openchamber/agent-contract';
import { INITIAL_STATE, type State } from './types';
import { updateChangedStreamingSessions, updateStreamingState, useStreamingStore } from './streaming';
const message = (messageId: string, role: 'user' | 'assistant'): Message => ({ messageId, sessionId: 'session_1', turnId: 'turn_1', role, createdAt: 1, parts: [] });
const stateWithMessages = (messages: Message[], status: State['session_status'][string] = 'running'): State => ({ ...INITIAL_STATE, session_status: { session_1: status }, message: { session_1: messages } });
beforeEach(() => useStreamingStore.setState({ streamingMessageIds: new Map(), messageStreamStates: new Map() }));
describe('native streaming state', () => {
  test('tracks trailing assistant while runtime is live', () => {
    updateStreamingState(stateWithMessages([message('user_1', 'user'), message('assistant_1', 'assistant')]), 10);
    expect(useStreamingStore.getState().streamingMessageIds.get('session_1')).toBe('assistant_1');
  });
  test('does not carry a prior assistant into a new user turn', () => {
    updateStreamingState(stateWithMessages([message('user_1', 'user'), message('assistant_1', 'assistant')]), 10);
    updateStreamingState(stateWithMessages([message('user_1', 'user'), message('assistant_1', 'assistant'), message('user_2', 'user')]), 20);
    expect(useStreamingStore.getState().streamingMessageIds.get('session_1')).toBeNull();
  });
  test('run status settling completes the stream', () => {
    updateStreamingState(stateWithMessages([message('user_1', 'user'), message('assistant_1', 'assistant')]), 10);
    updateStreamingState(stateWithMessages([message('user_1', 'user'), message('assistant_1', 'assistant')], 'idle'), 20);
    expect(useStreamingStore.getState().streamingMessageIds.get('session_1')).toBeNull();
    expect(useStreamingStore.getState().messageStreamStates.get('assistant_1')?.phase).toBe('completed');
  });
  test('incremental message replacement moves the live marker', () => {
    const previous = stateWithMessages([message('user_1', 'user'), message('assistant_1', 'assistant')]);
    updateStreamingState(previous, 10);
    const next = stateWithMessages([message('user_1', 'user'), message('assistant_1', 'assistant'), message('assistant_2', 'assistant')]);
    updateChangedStreamingSessions(next, previous, 20);
    expect(useStreamingStore.getState().streamingMessageIds.get('session_1')).toBe('assistant_2');
    expect(useStreamingStore.getState().messageStreamStates.get('assistant_1')?.phase).toBe('completed');
  });
  test('full reconciliation retains the live ID during the heartbeat window', () => {
    const state = stateWithMessages([message('assistant_1', 'assistant')]);
    updateStreamingState(state, 10);
    updateStreamingState(state, 20);
    expect(useStreamingStore.getState().streamingMessageIds.get('session_1')).toBe('assistant_1');
    updateStreamingState(stateWithMessages([message('assistant_1', 'assistant')], 'idle'), 30);
    expect(useStreamingStore.getState().messageStreamStates.get('assistant_1')?.phase).toBe('completed');
  });
  test('an inner turn can complete while its outer run remains live', () => {
    const user = message('user_1', 'user'); const assistant = message('assistant_1', 'assistant');
    const snapshot: SessionSnapshot = {
      session: { sessionId: 'session_1', projectId: 'project_1', workspaceId: 'workspace_1', displayPath: 'repo', rootSessionId: 'session_1', createdAt: 1, updatedAt: 1, epoch: 'epoch_1', headSequence: '1', runtimeStatus: 'running', activeRunId: 'run_1' },
      cursor: 'epoch_1:1', activeRun: { runId: 'run_1', sessionId: 'session_1', status: 'running', createdAt: 1 },
      branch: { branchId: 'branch_1', branchVersion: '0', leafMessageId: 'assistant_1' },
      window: { firstTurnId: 'turn_1', lastTurnId: 'turn_1', firstMessageId: 'user_1', lastMessageId: 'assistant_1', hasEarlier: false },
      turns: [{ turnId: 'turn_1', sessionId: 'session_1', runId: 'run_1', status: 'running', userMessageId: 'user_1', assistantMessageIds: ['assistant_1'], startedAt: 1 }],
      messages: [user, assistant], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
    };
    const previous = { ...stateWithMessages([user, assistant]), snapshot: { session_1: snapshot } };
    updateStreamingState(previous, 10);
    const completed = { ...snapshot, turns: [{ ...snapshot.turns[0], status: 'completed' as const, finishedAt: 2 }] };
    updateChangedStreamingSessions({ ...previous, snapshot: { session_1: completed } }, previous, 20);
    expect(useStreamingStore.getState().streamingMessageIds.get('session_1')).toBeNull();
    expect(useStreamingStore.getState().messageStreamStates.get('assistant_1')?.phase).toBe('completed');
  });
});
