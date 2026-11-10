import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Turn } from '@openchamber/agent-contract';

import type { LatestReply, LatestReplyRecord } from '@/lib/messages/latestReply';
import { useAutoReadAloud, type AutoReadAloudOptions } from './useAutoReadAloud';

let root: Root | null = null;
let host: HTMLElement;
let appStateListener: ((state: { isActive: boolean }) => void) | undefined;
let getAppState: () => Promise<{ isActive: boolean }>;
let listenerRemovals = 0;

mock.module('@capacitor/app', () => ({
<<<<<<< HEAD
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
=======
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
>>>>>>> bc50ba56a
};

const Probe: React.FC<AutoReadAloudOptions> = (props) => {
  useAutoReadAloud(props);
  return null;
};

const reply = (messageId: string, text = `Text of ${messageId}`): LatestReply => ({ messageId, text });

<<<<<<< HEAD
const turn = (turnId: string, status: Turn['status'], assistantMessageIds: string[] = []): Turn => ({
  turnId,
  sessionId: 'ses_1',
  runId: `run_${turnId}`,
  status,
  userMessageId: `user_${turnId}`,
  assistantMessageIds,
  startedAt: 1,
  finishedAt: status === 'completed' ? 2 : undefined,
=======
const completedRecord = (id: string, text: string): LatestReplyRecord => ({
    info: {
        id,
        role: 'assistant',
        sessionID: 'ses_1',
        time: { created: 1, completed: 2 },
        agent: 'build',
        providerID: 'anthropic',
        modelID: 'claude-opus-4-1',
        finish: 'stop',
    },
    parts: [{ id: `${id}-part`, sessionID: 'ses_1', messageID: id, type: 'text', text }],
>>>>>>> bc50ba56a
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

type MountOptions = Omit<AutoReadAloudOptions, 'history' | 'olderCompletedReplyIds'> & Partial<Pick<AutoReadAloudOptions, 'history' | 'olderCompletedReplyIds'>>;

const mount = (props: MountOptions) => act(async () => root?.render(<Probe history={[]} olderCompletedReplyIds={new Set()} {...props} />));

beforeEach(() => {
<<<<<<< HEAD
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
=======
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
>>>>>>> bc50ba56a
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(globalThis, 'navigator');
});

describe('useAutoReadAloud', () => {
<<<<<<< HEAD
  const setVisible = (visible: boolean) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: visible ? 'visible' : 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  };
=======
    const setVisible = (visible: boolean) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: visible ? 'visible' : 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
    };

    test('a native mobile background reply is skipped without a claim or replay on return', async () => {
        useNativeMobile();
        const { calls, play } = recorder();
        const claims: string[] = [];
        const claim = async (id: string) => { claims.push(id); return true; };
        const props = { sessionKey: 'ses_1', ready: true, sessionIsActive: true, reply: null, enabled: true, play, claim };
        await mount(props);
        setVisible(false);
        await mount({ ...props, reply: reply('background') });
        setVisible(true);
        await mount({ ...props, reply: reply('background') });
        expect(calls).toEqual([]);
        expect(claims).toEqual([]);
        await mount({ ...props, reply: reply('foreground') });
        expect(calls).toEqual(['Text of foreground']);
    });

    test('backgrounding during a claim cancels it even after returning', async () => {
        useNativeMobile();
        const { calls, play } = recorder();
        let resolveClaim: (claimed: boolean) => void = () => {};
        const claim = () => new Promise<boolean>((resolve) => { resolveClaim = resolve; });
        const props = { sessionKey: 'ses_1', ready: true, sessionIsActive: true, reply: null, enabled: true, play, claim };
        await mount(props);
        await mount({ ...props, reply: reply('pending') });
        setVisible(false);
        setVisible(true);
        await act(async () => resolveClaim(true));
        expect(calls).toEqual([]);
    });

    test('preparation eligibility stays cancelled after a background round trip', async () => {
        useNativeMobile();
        let canStart: (() => boolean) | undefined;
        const play: AutoReadAloudOptions['play'] = async (_text, options) => { canStart = options?.canStart; };
        const props = { sessionKey: 'ses_1', ready: true, sessionIsActive: true, reply: null, enabled: true, play };
        await mount(props);
        await mount({ ...props, reply: reply('preparing') });
        expect(canStart?.()).toBe(true);
        setVisible(false);
        setVisible(true);
        expect(canStart?.()).toBe(false);
    });

    test('web and desktop keep claiming and preparing replies in a hidden document', async () => {
        const claims: string[] = [];
        const guards: Array<() => boolean> = [];
        const claim = async (id: string) => { claims.push(id); return true; };
        const play: AutoReadAloudOptions['play'] = async (_text, options) => {
            if (options?.canStart) guards.push(options.canStart);
        };
        const props = { sessionKey: 'ses_1', ready: true, sessionIsActive: true, reply: null, enabled: true, play, claim };
        await mount(props);
        setVisible(false);
        await mount({ ...props, reply: reply('background') });
        expect(claims).toEqual(['background']);
        expect(guards[0]()).toBe(true);
        setVisible(true);
        setVisible(false);
        expect(guards[0]()).toBe(true);
    });

    test('web and desktop allow a pending claim to finish after a background round trip', async () => {
        const { calls, play } = recorder();
        let resolveClaim: (claimed: boolean) => void = () => {};
        const claim = () => new Promise<boolean>((resolve) => { resolveClaim = resolve; });
        const props = { sessionKey: 'ses_1', ready: true, sessionIsActive: true, reply: null, enabled: true, play, claim };
        await mount(props);
        await mount({ ...props, reply: reply('pending') });
        setVisible(false);
        setVisible(true);
        await act(async () => resolveClaim(true));
        expect(calls).toEqual(['Text of pending']);
    });

    test('native lifecycle alone cancels preparation and removes its listener on unmount', async () => {
        useNativeMobile();
        let canStart: (() => boolean) | undefined;
        const play: AutoReadAloudOptions['play'] = async (_text, options) => { canStart = options?.canStart; };
        const props = { sessionKey: 'ses_1', ready: true, sessionIsActive: true, reply: null, enabled: true, play };
        await mount(props);
        await mount({ ...props, reply: reply('preparing') });
        expect(canStart?.()).toBe(true);
        appStateListener?.({ isActive: false });
        appStateListener?.({ isActive: true });
        expect(canStart?.()).toBe(false);
        act(() => root?.unmount());
        root = null;
        expect(listenerRemovals).toBe(1);
    });

    test('unknown native state stays silent and a newer lifecycle event wins over initial state', async () => {
        useNativeMobile();
        let resolveState: (state: { isActive: boolean }) => void = () => {};
        getAppState = () => new Promise((resolve) => { resolveState = resolve; });
        const { calls, play } = recorder();
        const claims: string[] = [];
        const claim = async (id: string) => { claims.push(id); return true; };
        const props = { sessionKey: 'ses_1', ready: true, sessionIsActive: true, reply: null, enabled: true, play, claim };
        await mount(props);
        await mount({ ...props, reply: reply('unknown') });
        appStateListener?.({ isActive: false });
        await act(async () => resolveState({ isActive: true }));
        await mount({ ...props, reply: reply('inactive') });
        expect(calls).toEqual([]);
        expect(claims).toEqual([]);
        appStateListener?.({ isActive: true });
        await mount({ ...props, reply: reply('active') });
        expect(calls).toEqual(['Text of active']);
    });

    test('session changes and disabling auto-read invalidate preparation', async () => {
        const guards: Array<() => boolean> = [];
        const play: AutoReadAloudOptions['play'] = async (_text, options) => {
            if (options?.canStart) guards.push(options.canStart);
        };
        const props = { sessionKey: 'ses_1', ready: true, sessionIsActive: true, reply: null, enabled: true, play };
        await mount(props);
        await mount({ ...props, reply: reply('preparing') });
        await mount({ ...props, reply: reply('preparing'), enabled: false });
        await mount({ ...props, reply: reply('preparing'), enabled: true });
        expect(guards[0]()).toBe(false);
        await mount({ ...props, reply: reply('next') });
        await mount({ ...props, sessionKey: 'ses_2' });
        await mount({ ...props, reply: reply('next') });
        expect(guards[1]()).toBe(false);
    });
    test('a reply already present at mount is the baseline, not speech', async () => {
        const { calls, play } = recorder();
>>>>>>> bc50ba56a

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

<<<<<<< HEAD
    expect(calls).toEqual(['First answer']);
  });
=======
    test('trimming back to an older answer in history does not read it', async () => {
        const { calls, play } = recorder();
        const history = [completedRecord('a1', 'First answer'), completedRecord('a2', 'Second answer')];

        await mount({ sessionKey: 'ses_1', ready: true, sessionIsActive: true, reply: reply('a2', 'Second answer'), history, enabled: true, play });
        await mount({ sessionKey: 'ses_1', ready: true, sessionIsActive: false, reply: reply('a1', 'First answer'), history: history.slice(0, 1), enabled: true, play });

        expect(calls).toEqual([]);
    });

    test('trimming to an answer from a later history page never claims it or blocks a new answer', async () => {
        const { calls, play } = recorder();
        const claims: string[] = [];
        const claim = async (id: string) => { claims.push(id); return true; };
        const history = [completedRecord('a2', 'Second answer')];
        const props = { sessionKey: 'ses_1', ready: true, enabled: true, play, claim };

        await mount({ ...props, sessionIsActive: false, reply: reply('a2'), history });
        await mount({ ...props, sessionIsActive: true, reply: reply('a2'), history });
        const older = completedRecord('a1', 'Older answer');
        const olderCompletedReplyIds = new Set(['a1']);
        await mount({ ...props, sessionIsActive: true, reply: reply('a2'), history: [older, ...history], olderCompletedReplyIds });
        await mount({ ...props, sessionIsActive: false, reply: reply('a1', 'Older answer'), history: [older], olderCompletedReplyIds });
        expect(claims).toEqual([]);
        expect(calls).toEqual([]);

        await mount({ ...props, sessionIsActive: true, reply: null, history: [older], olderCompletedReplyIds });
        await mount({ ...props, sessionIsActive: false, reply: reply('a3', 'New answer'), history: [older, completedRecord('a3', 'New answer')], olderCompletedReplyIds });
        expect(claims).toEqual(['a3']);
        expect(calls).toEqual(['New answer']);
    });

    test('history in the baseline does not block the next answer', async () => {
        const { calls, play } = recorder();
        const first = [completedRecord('a1', 'First answer')];

        await mount({ sessionKey: 'ses_1', ready: true, sessionIsActive: false, reply: reply('a1', 'First answer'), history: first, enabled: true, play });
        await mount({ sessionKey: 'ses_1', ready: true, sessionIsActive: true, reply: reply('a1', 'First answer'), history: first, enabled: true, play });
        await mount({
            sessionKey: 'ses_1',
            ready: true,
            sessionIsActive: false,
            reply: reply('a2', 'Second answer'),
            history: [...first, completedRecord('a2', 'Second answer')],
            enabled: true,
            play,
        });

        expect(calls).toEqual(['Second answer']);
    });

    test('a reply that arrives while auto-read is off is not spoken when it is turned on', async () => {
        const { calls, play } = recorder();
>>>>>>> bc50ba56a

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
