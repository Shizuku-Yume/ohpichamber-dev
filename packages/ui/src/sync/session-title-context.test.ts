import { describe, expect, test } from 'bun:test';
import type { Message, Turn } from '@openchamber/agent-contract';
import { collectNativeTitleTurns, loadSessionTitleTurns } from './session-title-context';
import type { SessionMessageLoadState } from './session-message-loader';
const message = (messageId: string, turnId: string, role: Message['role'], content: string): Message => ({ messageId, sessionId: 'session_1', turnId, role, createdAt: 1, parts: [{ type: 'text', partId: `${messageId}_text`, content }] });
const turn = (turnId: string, userMessageId: string, assistantMessageIds: string[], status: Turn['status'] = 'completed'): Turn => ({ turnId, userMessageId, assistantMessageIds, sessionId: 'session_1', runId: 'run_1', status, startedAt: 1, ...(status === 'completed' ? { finishedAt: 2 } : {}) });
describe('native title turn context', () => {
  test('uses the final assistant of an authoritatively completed turn', () => {
    const user = message('user', 'turn', 'user', 'Explain the fix');
    const intermediate = message('intermediate', 'turn', 'assistant', 'Checking');
    const final = message('final', 'turn', 'assistant', 'The fix is complete');
    expect(collectNativeTitleTurns([user, intermediate, final], [turn('turn', 'user', ['intermediate', 'final'])])).toEqual([{ user, assistant: final }]);
  });
  test('retains a completed attachment-only user prompt', () => {
    const user: Message = { ...message('user', 'turn', 'user', ''), parts: [{ type: 'attachment', partId: 'attachment_part', attachmentId: 'attachment_1', name: 'notes.txt', mediaType: 'text/plain', size: 10, uri: 'attachment://attachment_1' }] };
    const assistant = message('assistant', 'turn', 'assistant', 'The notes explain the task');
    expect(collectNativeTitleTurns([user, assistant], [turn('turn', 'user', ['assistant'])])).toEqual([{ user, assistant }]);
  });
  test('never infers completion from partial assistant text or reasoning', () => {
    const user = message('user', 'turn', 'user', 'Explain the fix');
    const assistant = message('assistant', 'turn', 'assistant', 'Still working');
    expect(collectNativeTitleTurns([user, assistant], [turn('turn', 'user', ['assistant'], 'running')])).toEqual([]);
    expect(collectNativeTitleTurns([user, { ...assistant, parts: [{ type: 'reasoning', partId: 'reasoning', content: 'private thought' }] }], [turn('turn', 'user', ['assistant'])])).toEqual([]);
    expect(collectNativeTitleTurns([user, assistant], [turn('turn', 'user', ['assistant'], 'failed')])).toEqual([]);
  });
  test('requires the final assistant and respects an explicit branch boundary', () => {
    const user = message('user', 'turn', 'user', 'Question');
    const assistant = message('assistant', 'turn', 'assistant', 'Answer');
    const complete = turn('turn', 'user', ['assistant']);
    expect(collectNativeTitleTurns([user], [complete])).toEqual([]);
    expect(collectNativeTitleTurns([user, assistant], [complete], 'assistant')).toEqual([]);
    expect(collectNativeTitleTurns([user, assistant], [complete], 'missing')).toEqual([]);
  });
  test('retains only the latest three completed native turns', () => {
    const turns = Array.from({ length: 5 }, (_, index) => turn(`turn_${index}`, `user_${index}`, [`assistant_${index}`]));
    const messages = turns.flatMap((entry) => [message(entry.userMessageId, entry.turnId, 'user', 'Question'), message(entry.assistantMessageIds[0], entry.turnId, 'assistant', 'Answer')]);
    expect(collectNativeTitleTurns(messages, turns).map((entry) => entry.user.turnId)).toEqual(['turn_2', 'turn_3', 'turn_4']);
  });
});

describe('native title context loader', () => {
  const target = { directory: '/repo', sessionId: 'session_1' };
  const ready = (): SessionMessageLoadState => ({ status: 'ready', loadingKind: null, error: null, resolved: true, limit: 100, cursor: 'history_1', complete: false, generation: 0, updatedAt: 1 });
  test('shares loader pagination and stops once three completed turns are covered', async () => {
    let turns = [turn('turn_2', 'user_2', ['assistant_2']), turn('turn_3', 'user_3', ['assistant_3'])];
    let messages = turns.flatMap((entry) => [message(entry.userMessageId, entry.turnId, 'user', 'Question'), message(entry.assistantMessageIds[0], entry.turnId, 'assistant', 'Answer')]);
    let state = ready();
    let olderReads = 0;
    const result = await loadSessionTitleTurns({ target, signal: new AbortController().signal, getMessages: () => messages, getTurns: () => turns, loader: {
      getSnapshot: () => state,
      ensure: async () => {},
      loadOlder: async () => {
        olderReads += 1;
        const older = turn('turn_1', 'user_1', ['assistant_1']);
        turns = [older, ...turns];
        messages = [message('user_1', 'turn_1', 'user', 'Question'), message('assistant_1', 'turn_1', 'assistant', 'Answer'), ...messages];
        state = { ...state, cursor: 'history_2' };
      },
    } });
    expect(olderReads).toBe(1);
    expect(result.map((entry) => entry.user.turnId)).toEqual(['turn_1', 'turn_2', 'turn_3']);
  });
  test('failed authority never returns cached title context', async () => {
    const error = new Error('offline');
    const cached = [message('user', 'turn', 'user', 'Question'), message('assistant', 'turn', 'assistant', 'Answer')];
    await expect(loadSessionTitleTurns({ target, signal: new AbortController().signal, getMessages: () => cached, getTurns: () => [turn('turn', 'user', ['assistant'])], loader: {
      getSnapshot: () => ({ ...ready(), status: 'error', error }),
      ensure: async () => { throw error; },
      loadOlder: async () => {},
    } })).rejects.toThrow('offline');
  });
  test('rejects a pagination cursor that makes no progress', async () => {
    await expect(loadSessionTitleTurns({ target, signal: new AbortController().signal, getMessages: () => [], getTurns: () => [], loader: {
      getSnapshot: ready,
      ensure: async () => {},
      loadOlder: async () => {},
    } })).rejects.toThrow('pagination made no progress');
  });
  test('successful complete empty history returns empty context without requesting older pages', async () => {
    let olderReads = 0;
    expect(await loadSessionTitleTurns({ target, signal: new AbortController().signal, getMessages: () => [], getTurns: () => [], loader: {
      getSnapshot: () => ({ ...ready(), complete: true, cursor: undefined }),
      ensure: async () => {},
      loadOlder: async () => { olderReads += 1; },
    } })).toEqual([]);
    expect(olderReads).toBe(0);
  });
  test('rejects a loader generation replaced during pagination rather than mixing title context', async () => {
    let state = ready();
    await expect(loadSessionTitleTurns({ target, signal: new AbortController().signal, getMessages: () => [], getTurns: () => [], loader: {
      getSnapshot: () => state,
      ensure: async () => {},
      loadOlder: async () => { state = { ...state, generation: state.generation + 1, complete: true }; },
    } })).rejects.toThrow('Session history is unavailable');
  });
});
