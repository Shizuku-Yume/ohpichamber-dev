import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { SessionSnapshot } from '@openchamber/agent-contract';
import type { StoreApi } from 'zustand';
import { I18nProvider } from '@/lib/i18n';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import type { DirectoryStore } from '@/sync/child-store';
import { installSessionSnapshot } from '@/sync/event-reducer';
import { useNotificationStore } from '@/sync/notification-store';
import { nativeClient, nativeMessage, nativeSnapshot } from '@/sync/session-message-loader-test-fixtures';
import { SyncProvider, useDirectoryStore } from '@/sync/sync-context';
import { SessionErrorNotice } from './SessionErrorNotice';

const DIR = '/workspace/error-notice';
const SESSION = 'session-error-notice';

function failedSnapshot(error?: string): SessionSnapshot {
  const user = nativeMessage(SESSION, 'prompt', 10);
  const assistant = { ...nativeMessage(SESSION, 'reply', 20, 'assistant'), turnId: user.turnId, parts: [] };
  return {
    ...nativeSnapshot(SESSION, [user, assistant]),
    turns: [{ turnId: user.turnId, sessionId: SESSION, runId: 'run-failed', status: 'failed',
      userMessageId: user.messageId, assistantMessageIds: [assistant.messageId], startedAt: 10, finishedAt: 30, error }],
  };
}

describe('SessionErrorNotice canonical history hydration', () => {
  let browser: Window;
  let root: Root;
  let host: HTMLElement;
  let store: StoreApi<DirectoryStore>;
  let restoreGlobals: () => void;

  const Probe = () => {
    store = useDirectoryStore(DIR, { bootstrap: false });
    return <SessionErrorNotice sessionId={SESSION} directory={DIR} />;
  };
  const install = async (snapshot: SessionSnapshot) => {
    await act(async () => store.setState(previous => installSessionSnapshot(previous, snapshot)));
  };

  beforeEach(async () => {
    browser = new Window({ url: 'http://runtime.test' });
    const descriptors = new Map<string, PropertyDescriptor | undefined>();
    for (const [name, value] of Object.entries({ window: browser, document: browser.document,
      navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element,
      Node: browser.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
      descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    restoreGlobals = () => {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    };
    useNotificationStore.setState({ list: [] });
    registerWorkspaceDirectory('workspace-a', DIR);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<I18nProvider><SyncProvider client={nativeClient()} directory={DIR}>
      <Probe />
    </SyncProvider></I18nProvider>));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    useNotificationStore.setState({ list: [] });
    resetWorkspaceDirectories();
    host.remove();
    restoreGlobals();
    browser.close();
  });

  test.each(['401 Invalid API key', 'Agent execution failed'])('restores %s without live notifications', async error => {
    await install(failedSnapshot(error));
    expect(store.getState().snapshot[SESSION]?.turns.at(-1)?.error).toBe(error);
    expect(useNotificationStore.getState().list).toHaveLength(0);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(error);
  });

  test('a failed turn without detail still explains that the reply stopped', async () => {
    await install(failedSnapshot());
    expect(host.querySelector('[role="status"]')?.textContent).toContain('The Agent Service stopped this reply');
  });

  test('empty history and completed or cancelled turns do not report failures', async () => {
    await install(nativeSnapshot(SESSION, []));
    expect(host.querySelector('[role="status"]')).toBeNull();
    for (const status of ['completed', 'cancelled'] as const) {
      const snapshot = failedSnapshot();
      snapshot.turns[0]!.status = status;
      await install(snapshot);
      expect(host.querySelector('[role="status"]')).toBeNull();
    }
  });

  test('a newer turn and a busy session suppress the old failure', async () => {
    const failed = failedSnapshot('401 Invalid API key');
    await install(failed);
    expect(host.textContent).toContain('401 Invalid API key');
    const busy = { ...failed, session: { ...failed.session, runtimeStatus: 'running' as const } };
    await install(busy);
    expect(host.querySelector('[role="status"]')).toBeNull();
    const next = nativeSnapshot(SESSION, [nativeMessage(SESSION, 'next-reply', 40, 'assistant')]);
    next.turns.unshift(failed.turns[0]!);
    await install(next);
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  test('does not duplicate an assistant tool error', async () => {
    const failed = failedSnapshot('Tool failed');
    failed.messages[1]!.parts = [{ type: 'tool_result', partId: 'result', toolCallId: 'call',
      toolName: 'bash', isError: true, error: 'Tool failed' }];
    await install(failed);
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  test('retains equally recent live error detail', async () => {
    const time = Date.now();
    const failed = failedSnapshot('Stored failure');
    failed.turns[0]!.finishedAt = time;
    await install(failed);
    await act(async () => useNotificationStore.getState().append({ session: SESSION, directory: DIR,
      time, error: { name: 'ProviderError', message: 'Live provider detail' } }));
    expect(host.textContent).toContain('ProviderError: Live provider detail');
    expect(host.textContent).not.toContain('Stored failure');
  });
});
