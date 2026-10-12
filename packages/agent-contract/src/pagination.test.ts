import { expect, test } from 'bun:test';
import { HistoryPageRequestSchema, HistoryPageSchema, ModelsPageSchema, PaginationCursorSchema, SessionsPageSchema } from './pagination.ts';

const session = {
  sessionId: 'session_1', projectId: 'project_1', workspaceId: 'workspace_1', displayPath: '.', rootSessionId: 'session_1',
  createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: null, metadataRevision: '0', archiveRevision: '0',
};
const model = {
  modelId: 'model_1', provider: 'provider_1', name: 'Model', modalities: ['text'], contextWindow: 8192,
  maxOutputTokens: 1024, reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null,
};
const turn = {
  turnId: 'turn_1', runId: 'run_1', sessionId: 'session_1', status: 'completed', userMessageId: 'message_1',
  assistantMessageIds: [], startedAt: 1, finishedAt: 2,
};
const message = { messageId: 'message_1', sessionId: 'session_1', turnId: 'turn_1', role: 'user', createdAt: 1, parts: [] };
const history = {
  sessionId: 'session_1', branch: { branchId: 'branch_1', branchVersion: '9007199254740993', leafMessageId: 'message_1' },
  turns: [turn], messages: [message], nextCursor: 'opaque_history_cursor',
};

test('page cursors are opaque and distinct from epoch stream cursors', () => {
  expect(PaginationCursorSchema.parse('opaque_history_cursor')).toBe('opaque_history_cursor');
  expect(PaginationCursorSchema.safeParse('').success).toBe(false);
  expect(PaginationCursorSchema.safeParse(3).success).toBe(false);
  expect(HistoryPageRequestSchema.parse({ sessionId: 'session_1', limit: 100, cursor: 'opaque_cursor', leafTurnId: 'turn_1' })).toEqual({
    sessionId: 'session_1', limit: 100, cursor: 'opaque_cursor', leafTurnId: 'turn_1',
  });
  expect(HistoryPageRequestSchema.parse({ sessionId: 'session_1' })).toEqual({ sessionId: 'session_1' });
  for (const limit of [0, 101, 1.5]) expect(HistoryPageRequestSchema.safeParse({ sessionId: 'session_1', limit }).success).toBe(false);
  expect(HistoryPageRequestSchema.safeParse({ sessionId: 'session_1', cursor: '' }).success).toBe(false);
});

test('session and model pages preserve populated, empty and continuing envelopes without wrappers', () => {
  expect(SessionsPageSchema.parse({ items: [session], nextCursor: 'session_cursor' })).toEqual({ items: [session], nextCursor: 'session_cursor' });
  expect(ModelsPageSchema.parse({ items: [model], nextCursor: null })).toEqual({ items: [model], nextCursor: null });
  expect(SessionsPageSchema.parse({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
  expect(ModelsPageSchema.parse({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
  expect(SessionsPageSchema.safeParse({ items: [{ ...session, metadataRevision: '1' }], nextCursor: null }).success).toBe(false);
  expect(SessionsPageSchema.safeParse({ items: [], nextCursor: '' }).success).toBe(false);
  expect(ModelsPageSchema.safeParse({ items: [{ ...model, modalities: ['video'] }], nextCursor: null }).success).toBe(false);
  expect(ModelsPageSchema.safeParse({ items: [], nextCursor: null, error: null }).success).toBe(false);
});

test('history pages retain branch identity independently of atomic snapshot recovery', () => {
  expect(HistoryPageSchema.parse(history)).toEqual(history);
  expect(HistoryPageSchema.parse({ ...history, turns: [], messages: [], nextCursor: null })).toEqual({
    ...history, turns: [], messages: [], nextCursor: null,
  });
  for (const invalid of [
    { ...history, messages: [{ ...message, sessionId: 'other_session' }] },
    { ...history, turns: [{ ...turn, sessionId: 'other_session' }] },
    { ...history, branch: { ...history.branch, branchVersion: '01' } },
    { ...history, cursor: 'epoch_1:1' }, { ...history, requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' } },
  ]) expect(HistoryPageSchema.safeParse(invalid).success).toBe(false);
});
