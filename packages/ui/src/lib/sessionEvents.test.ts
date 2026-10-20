import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import type { ToolCallPart, ToolResultPart, ToolStatus } from '@openchamber/agent-contract';
import { Window } from 'happy-dom';
import { sessionEvents } from './sessionEvents';
import { handleEvents } from '@/sync/sync-context';
import { ChildStoreManager } from '@/sync/child-store';
import { installSessionSnapshot } from '@/sync/event-reducer';
import { nativeSnapshot, nativeMessage } from '@/sync/session-message-loader-test-fixtures';
import { fileTreeChanges, subscribeFileTreeChanges } from './fileTreeChanges';

const call = (id: string, toolName = 'write', status: ToolStatus = 'running'): ToolCallPart => ({
  type: 'tool_call', partId: `call-${id}`, toolCallId: id, toolName, input: {}, status,
});
const result = (id: string, toolName = 'write', isError = false): ToolResultPart => ({
  type: 'tool_result', partId: `result-${id}`, toolCallId: id, toolName, isError,
});
const finish = (directory: string, id: string, tool = 'write', sessionId = 'session') => {
  sessionEvents.requestGitRefreshForToolTransition(directory, sessionId, call(id, tool), call(id, tool, 'completed'));
};

describe('native Git refresh hints', () => {
  let hints: Array<{ directory: string; paths?: string[] }>;
  let unsubscribe: () => void;
  const globals = new Map<string, PropertyDescriptor | undefined>();
  beforeEach(() => {
    const window = new Window({ url: 'http://localhost/' });
    for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator })) {
      globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    jest.useFakeTimers();
    hints = [];
    unsubscribe = sessionEvents.onGitRefreshHint((hint) => hints.push(hint));
  });
  afterEach(() => {
    unsubscribe();
    sessionEvents.cancelPendingGitRefreshes();
    jest.useRealTimers();
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    globals.clear();
  });

  test('coalesces a burst per directory without postponing the original window', () => {
    finish('/repo', 'first');
    jest.advanceTimersByTime(249);
    finish('/repo', 'second');
    expect(hints).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(hints).toEqual([{ directory: '/repo' }]);
    finish('/repo', 'third');
    finish('/other', 'fourth');
    jest.advanceTimersByTime(250);
    expect(hints).toEqual([{ directory: '/repo' }, { directory: '/repo' }, { directory: '/other' }]);
  });

  test('pairs split identities by toolCallId and never refreshes twice for a call and result', () => {
    const running = call('one', 'bash');
    sessionEvents.requestGitRefreshForToolTransition('/repo', 'session', running, call('one', 'bash', 'completed'));
    jest.advanceTimersByTime(250);
    sessionEvents.requestGitRefreshForToolTransition('/repo', 'session', running, result('one', 'bash'));
    sessionEvents.requestGitRefreshForToolTransition('/repo', 'session', undefined, result('one', 'bash'));
    jest.advanceTimersByTime(250);
    expect(hints).toEqual([{ directory: '/repo' }]);
  });

  test('failed mutations refresh but read-only, running and denied calls do not', () => {
    finish('/repo', 'read', 'read');
    sessionEvents.requestGitRefreshForToolTransition('/repo', 'session', undefined, call('running'));
    sessionEvents.requestGitRefreshForToolTransition('/repo', 'session', undefined, call('denied', 'write', 'denied'));
    sessionEvents.requestGitRefreshForToolTransition('/repo', 'session', call('denied', 'write', 'denied'), result('denied'));
    jest.advanceTimersByTime(250);
    expect(hints).toEqual([]);
    sessionEvents.requestGitRefreshForToolTransition('/repo', 'session', call('failed', 'edit'), call('failed', 'edit', 'failed'));
    jest.advanceTimersByTime(250);
    expect(hints).toEqual([{ directory: '/repo' }]);
  });

  test('unrelated previous final identities cannot suppress a new result', () => {
    sessionEvents.requestGitRefreshForToolTransition('/repo', 'session', result('old'), result('new', 'bash', true));
    jest.advanceTimersByTime(250);
    expect(hints).toEqual([{ directory: '/repo' }]);
  });

  test('direct hints remain immediate and runtime reset drops pending hints and deduplication', () => {
    finish('/repo', 'one');
    sessionEvents.requestGitRefresh({ directory: '/repo', paths: ['src/a.ts'] });
    expect(hints).toEqual([{ directory: '/repo', paths: ['src/a.ts'] }]);
    sessionEvents.cancelPendingGitRefreshes();
    jest.advanceTimersByTime(250);
    expect(hints).toHaveLength(1);
    finish('/repo', 'one');
    jest.advanceTimersByTime(250);
    expect(hints).toHaveLength(2);
  });

  test('accepted live native events invalidate without mounting tool renderers; duplicates and gaps do not', () => {
    const manager = new ChildStoreManager();
    const store = manager.ensureChild('/repo', { bootstrap: false });
    const message = { ...nativeMessage('session'), role: 'assistant' as const, parts: [call('write', 'write'), call('bash', 'bash')] };
    message.parts[0]!.input = { path: 'new.ts', content: 'new' };
    const snapshot = nativeSnapshot('session', [message]);
    snapshot.session.runtimeStatus = 'running';
    snapshot.session.activeRunId = 'run';
    snapshot.activeRun = { runId: 'run', sessionId: 'session', status: 'running', createdAt: 1 };
    store.setState((state) => installSessionSnapshot(state, snapshot));
    const changes: Array<{ directory: string; paths?: string[] }> = [];
    const stop = subscribeFileTreeChanges((change) => changes.push(change));
    const envelope = { sessionId: 'session', epoch: 'epoch-a', timestamp: 2 };
    const target = { directory: '/repo', sessionId: 'session' };
    try {
      const completed = { ...envelope, sequence: '5', type: 'tool.completed' as const, toolCallId: 'write', status: 'completed' as const, isError: false };
      expect(handleEvents(target, [completed], manager)).toBe(true);
      expect(handleEvents(target, [completed], manager)).toBe(true);
      expect(changes).toEqual([{ directory: '/repo', paths: ['/repo/new.ts'] }]);
      expect(handleEvents(target, [{ ...completed, sequence: '7', toolCallId: 'bash' }], manager)).toBe(false);
      expect(handleEvents(target, [{ ...completed, sequence: '6', toolCallId: 'bash', status: 'failed', isError: true }], manager)).toBe(true);
      expect(handleEvents(target, [{ ...envelope, sequence: '7', type: 'part.started', messageId: message.messageId, part: result('write') }], manager)).toBe(true);
      expect(handleEvents(target, [{ ...envelope, sequence: '8', type: 'run.cancelled', runId: 'run', finishedAt: 3 }], manager)).toBe(true);
      jest.advanceTimersByTime(250);
      expect(hints).toEqual([{ directory: '/repo' }]);
      expect(changes).toEqual([{ directory: '/repo', paths: ['/repo/new.ts'] }, { directory: '/repo' }]);
    } finally {
      stop();
      fileTreeChanges.reset();
      manager.disposeAll();
    }
  });
});
