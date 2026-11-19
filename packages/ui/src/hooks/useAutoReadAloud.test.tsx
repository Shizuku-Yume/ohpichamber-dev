import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Turn } from '@openchamber/agent-contract';

import type { LatestReply } from '@/lib/messages/latestReply';
import { useAutoReadAloud, type AutoReadAloudOptions } from './useAutoReadAloud';

let root: Root | null = null;
let host: HTMLElement;
let appStateListener: ((state: { isActive: boolean }) => void) | undefined;
let getAppState: () => Promise<{ isActive: boolean }>;
let listenerRemovals = 0;

mock.module('@capacitor/app', () => ({
  App: {
    addListener: async (_event: string, listener: typeof appStateListener) => {
      appStateListener = listener;
      return { remove: async () => { listenerRemovals += 1; } };
    },
    getState: () => getAppState(),
  },
}));

const useNativeMobile = () => {
  Object.defineProperty(window, 'Capacitor', { value: { isNativePlatform: () => true } });
};

const Probe: React.FC<AutoReadAloudOptions> = (props) => {
  useAutoReadAloud(props);
  return null;
};

const reply = (messageId: string, text = `Text of ${messageId}`): LatestReply => ({ messageId, text });

const turn = (turnId: string, status: Turn['status'], assistantMessageIds: string[] = []): Turn => ({
  turnId,
  sessionId: 'ses_1',
  runId: `run_${turnId}`,
  status,
  userMessageId: `user_${turnId}`,
  assistantMessageIds,
  startedAt: 1,
  finishedAt: status === 'completed' ? 2 : undefined,
});

const recorder = () => {
  const calls: string[] = [];
  return {
    calls,
    play: async (text: string): Promise<void> => {
      calls.push(text);
    },
  };
};

const mount = (props: AutoReadAloudOptions) => act(async () => root?.render(<Probe {...props} />));

beforeEach(() => {
  appStateListener = undefined;
  getAppState = async () => ({ isActive: true });
  listenerRemovals = 0;
  const dom = new Window({ url: 'http://localhost' });
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: dom });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: dom.navigator });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });
  host = document.createElement('div');
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(globalThis, 'navigator');
});

describe('useAutoReadAloud', () => {
    const setVisible = (visible: boolean) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: visible ? 'visible' : 'hidden' });
        document.dispatchEvent(new window.Event('visibilitychange'));
    };

  test('reads the answer to a turn this surface watched complete', async () => {
    const { calls, play } = recorder();
    const claim = async () => true;
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim } as const;
    await mount({ ...base, sessionIsActive: false, reply: null, turns: [] });
    await mount({ ...base, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_1', 'The answer'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });

    expect(calls).toEqual(['The answer']);
  });

  test('a reply already finished when the session opens is never read', async () => {
    const { calls, play } = recorder();
    const claim = async () => true;
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim } as const;
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_old', 'Yesterday\'s answer'),
      turns: [turn('turn_old', 'completed', ['assistant_old'])],
    });

    expect(calls).toEqual([]);
  });

  test('a page of older turns fetched later is never read', async () => {
    const { calls, play } = recorder();
    const claim = async () => true;
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim } as const;
    await mount({ ...base, sessionIsActive: false, reply: null, turns: [] });
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_old', 'A paginated answer'),
      turns: [turn('turn_old', 'completed', ['assistant_old'])],
    });

    expect(calls).toEqual([]);
  });

  test('the same answer becoming newest again after a revert is not read twice', async () => {
    const { calls, play } = recorder();
    const claim = async () => true;
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim } as const;
    await mount({ ...base, sessionIsActive: false, reply: null, turns: [] });
    await mount({ ...base, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_1', 'First answer'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });
    // The turn is reverted, then re-completed with the same message.
    await mount({ ...base, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_1', 'First answer'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });

    expect(calls).toEqual(['First answer']);
  });

  test('a failed turn\'s partial answer is never read', async () => {
    const { calls, play } = recorder();
    const claim = async () => true;
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim } as const;
    await mount({ ...base, sessionIsActive: false, reply: null, turns: [] });
    await mount({ ...base, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_1', 'Half an answer'),
      turns: [turn('turn_1', 'failed', ['assistant_1'])],
    });

    expect(calls).toEqual([]);
  });

  test('a cancelled turn\'s answer is never read', async () => {
    const { calls, play } = recorder();
    const claim = async () => true;
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim } as const;
    await mount({ ...base, sessionIsActive: false, reply: null, turns: [] });
    await mount({ ...base, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_1', 'Cut short'),
      turns: [turn('turn_1', 'cancelled', ['assistant_1'])],
    });

    expect(calls).toEqual([]);
  });

  test('disabled auto-read stays silent', async () => {
    const { calls, play } = recorder();
    const base = { sessionKey: 'ses_1', ready: true, play, claim: async () => true } as const;
    await mount({ ...base, enabled: false, sessionIsActive: false, reply: null, turns: [] });
    await mount({ ...base, enabled: false, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      enabled: false,
      sessionIsActive: false,
      reply: reply('assistant_1', 'Not read'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });

    expect(calls).toEqual([]);
  });

  test('a session switch does not read the previous session\'s answer', async () => {
    const { calls, play } = recorder();
    const claim = async () => true;
    const base = { ready: true, enabled: true, play, claim } as const;
    await mount({ ...base, sessionKey: 'ses_1', sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      sessionKey: 'ses_1',
      sessionIsActive: false,
      reply: reply('assistant_1', 'Answer one'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });
    // The same completed turn id now belongs to another session.
    await mount({
      ...base,
      sessionKey: 'ses_2',
      sessionIsActive: false,
      reply: reply('assistant_1', 'Answer one'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });

    expect(calls).toEqual(['Answer one']);
  });

  test('a cross-window claim that loses keeps this window silent', async () => {
    const { calls, play } = recorder();
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play } as const;
    await mount({ ...base, claim: async () => false, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      claim: async () => false,
      sessionIsActive: false,
      reply: reply('assistant_1', 'Read elsewhere'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });

    expect(calls).toEqual([]);
  });

  test('a native mobile reply that finished in the background is skipped and not replayed on return', async () => {
    useNativeMobile();
    const { calls, play } = recorder();
    const claims: string[] = [];
    const claim = async (id: string) => { claims.push(id); return true; };
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim } as const;
    await mount({ ...base, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    setVisible(false);
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_1', 'Background answer'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });
    setVisible(true);
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_1', 'Background answer'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });

    expect(calls).toEqual([]);
    expect(claims).toEqual([]);
  });

  test('backgrounding during a claim cancels it even after returning', async () => {
    useNativeMobile();
    const { calls, play } = recorder();
    const gate = Promise.withResolvers<boolean>();
    const claim = () => gate.promise;
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim } as const;
    await mount({ ...base, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_1', 'Pending answer'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });
    setVisible(false);
    setVisible(true);
    await act(async () => gate.resolve(true));

    expect(calls).toEqual([]);
  });

  test('a lagging session flag does not make a finished turn count as watched', async () => {
    const { calls, play } = recorder();
    const claim = async () => true;
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim } as const;
    await mount({
      ...base,
      sessionIsActive: true,
      reply: reply('assistant_old', 'An earlier answer'),
      turns: [turn('turn_old', 'completed', ['assistant_old'])],
    });

    expect(calls).toEqual([]);
  });

  test('auto-read disabled across a completion never speaks that answer when re-enabled', async () => {
    const { calls, play } = recorder();
    const claim = async () => true;
    const base = { sessionKey: 'ses_1', ready: true, play, claim } as const;
    await mount({ ...base, enabled: false, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      enabled: false,
      sessionIsActive: false,
      reply: reply('assistant_1', 'Finished while off'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });
    await mount({
      ...base,
      enabled: true,
      sessionIsActive: false,
      reply: reply('assistant_1', 'Finished while off'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });

    expect(calls).toEqual([]);
  });

  test('final text arriving late for the watched turn is still read', async () => {
    const { calls, play } = recorder();
    const claim = async () => true;
    const base = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim } as const;
    await mount({ ...base, sessionIsActive: true, reply: null, turns: [turn('turn_1', 'running')] });
    await mount({
      ...base,
      sessionIsActive: false,
      reply: null,
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });
    await mount({
      ...base,
      sessionIsActive: false,
      reply: reply('assistant_1', 'The answer'),
      turns: [turn('turn_1', 'completed', ['assistant_1'])],
    });

    expect(calls).toEqual(['The answer']);
  });
});
