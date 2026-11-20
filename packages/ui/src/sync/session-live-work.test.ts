import { beforeEach, expect, test } from 'bun:test';
import type { CanonicalEvent } from '@openchamber/agent-contract';
import { applySessionLiveWorkEvents, applySessionLiveWorkSnapshot, currentLiveTool, resetSessionLiveWork, seedSessionContextFromHost, sessionContextRevision, SESSION_LIVE_WORK_MAX, useSessionLiveWorkStore } from './session-live-work';
import { nativeMessage, nativeSnapshot } from './session-message-loader-test-fixtures';

const envelope = { sessionId: 'session-a', epoch: 'epoch-a', sequence: '1', timestamp: 1 };
const start = (id: string, input: Record<string, string> = {}): CanonicalEvent => ({ ...envelope, type: 'tool.started', toolCallId: id, toolName: 'read', input });
const stop = (id: string): CanonicalEvent => ({ ...envelope, type: 'tool.completed', toolCallId: id, status: 'completed', isError: false });
const current = () => currentLiveTool(useSessionLiveWorkStore.getState().tools.get(envelope.sessionId));
beforeEach(resetSessionLiveWork);

test('tracks canonical tool intent, complete input and parallel completion', () => {
  applySessionLiveWorkEvents([start('slow', { path: 'src/main.ts' }), start('fast')]);
  expect(current()?.partID).toBe('fast');
  applySessionLiveWorkEvents([stop('fast')]);
  expect(current()?.path).toBe('src/main.ts');
  applySessionLiveWorkEvents([stop('slow')]);
  expect(current()?.path).toBe('src/main.ts');
});

test('empty batches preserve references and unrelated sessions', () => {
  applySessionLiveWorkEvents([start('one')]);
  const state = useSessionLiveWorkStore.getState();
  applySessionLiveWorkEvents([]);
  expect(useSessionLiveWorkStore.getState()).toBe(state);
  applySessionLiveWorkEvents([{ ...envelope, sessionId: 'other', type: 'session.status', runtimeStatus: 'idle', activeRunId: null }]);
  expect(current()?.partID).toBe('one');
});

test('terminal runtime state forgets a tool whose completion was lost', () => {
  applySessionLiveWorkEvents([start('one')]);
  applySessionLiveWorkEvents([{ ...envelope, type: 'session.status', runtimeStatus: 'unavailable', activeRunId: null }]);
  expect(current()).toBeUndefined();
});

test('canonical usage is authoritative and compaction can make it unknown', () => {
  applySessionLiveWorkEvents([{ ...envelope, type: 'message.updated', messageId: 'message-a', usage: { input: 10, output: 2, cacheRead: 3, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }]);
  expect(useSessionLiveWorkStore.getState().context.get(envelope.sessionId)).toEqual({ state: 'measured', tokens: 15 });
  applySessionLiveWorkEvents([{ ...envelope, type: 'session.compacted', compactionId: 'compact-a', tokensBefore: 15, completedAt: 2 }]);
  expect(useSessionLiveWorkStore.getState().context.get(envelope.sessionId)).toEqual({ state: 'compacted' });
});

test('old Host reads cannot replace newer events or cross runtime reset', () => {
  const since = sessionContextRevision();
  applySessionLiveWorkEvents([{ ...envelope, type: 'session.compacted', compactionId: 'compact-a', tokensBefore: 15, completedAt: 2 }]);
  seedSessionContextFromHost(new Map([[envelope.sessionId, { state: 'measured', tokens: 200 }]]), since);
  expect(useSessionLiveWorkStore.getState().context.get(envelope.sessionId)).toEqual({ state: 'compacted' });
  const beforeReset = sessionContextRevision();
  resetSessionLiveWork();
  seedSessionContextFromHost(new Map([[envelope.sessionId, { state: 'measured', tokens: 200 }]]), beforeReset);
  expect(useSessionLiveWorkStore.getState().context.size).toBe(0);
});

test('shell input never becomes a file target', () => {
  applySessionLiveWorkEvents([start('shell', { command: 'echo private' })]);
  expect(current()?.path).toBeNull();
});

test('snapshot context is authoritative without reviving historical tools', () => {
  const message = nativeMessage('session-a');
  message.parts = [{ type: 'tool_call', partId: 'part-a', toolCallId: 'tool-a', toolName: 'read', input: {}, status: 'running' }];
  applySessionLiveWorkEvents([start('old')]);
  applySessionLiveWorkSnapshot(nativeSnapshot('session-a', [message]));
  expect(current()).toBeUndefined();
  expect(useSessionLiveWorkStore.getState().context.size).toBe(0);
});

test('unrelated session caches stay bounded', () => {
  for (let index = 0; index <= SESSION_LIVE_WORK_MAX; index += 1) {
    applySessionLiveWorkEvents([{ ...envelope, sessionId: `session-${index}`, type: 'tool.started', toolCallId: 'one', toolName: 'read', input: {} }]);
  }
  expect(useSessionLiveWorkStore.getState().tools.size).toBe(SESSION_LIVE_WORK_MAX);
  expect(useSessionLiveWorkStore.getState().tools.has('session-0')).toBe(false);
});
