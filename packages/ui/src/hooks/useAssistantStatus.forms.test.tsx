import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { nativeQuestion } from '@/sync/session-message-loader-test-fixtures';
import type { State } from '@/sync/types';

let questions: ReturnType<typeof nativeQuestion>[] = [];
const directoryState: Pick<State, 'snapshot' | 'session' | 'message'> = { snapshot: {}, session: [], message: {} };
const NO_MESSAGES: never[] = [];
const NO_SERVERS: never[] = [];

mock.module('@/components/chat/chatColumnSession', () => ({
  useChatSessionSelection: () => ({ sessionId: 'ses_a', directory: '/repo' }),
}));
mock.module('@/sync/sync-context', () => ({
  useSession: () => undefined,
  useSessionMessages: () => NO_MESSAGES,
  useSessionStatus: () => 'running',
  useSessionCompacting: () => null,
  useSessionForms: () => questions,
  useSessionStatusSnapshotReady: () => true,
  useSessionMessagesSelector: () => false,
  useSessionPermissions: () => NO_MESSAGES,
  useDirectorySync: <T,>(select: (state: typeof directoryState) => T) => select(directoryState),
}));
mock.module('@/sync/session-ui-store', () => ({
  useSessionUIStore: <T,>(select: (state: { sessionAbortFlags: Map<string, unknown> }) => T) => select({ sessionAbortFlags: new Map() }),
}));
mock.module('@/sync/session-actions', () => ({ readUnloadedFormToolLinks: () => {} }));
mock.module('@/stores/useMcpConfigStore', () => ({
  selectMcpServersForDirectory: () => NO_SERVERS,
  useMcpConfigStore: <T,>(select: (state: { loadMcpConfigs: () => Promise<void> }) => T) => select({ loadMcpConfigs: async () => {} }),
}));

const { useAssistantStatus } = await import('./useAssistantStatus');
let root: Root | null = null;
let host: HTMLElement;
const originals = new Map<string, PropertyDescriptor | undefined>();

const Probe: React.FC = () => {
  const { working } = useAssistantStatus();
  return <span data-id="working">{String(working.isWorking)}</span>;
};
const working = () => host.querySelector('[data-id="working"]')?.textContent ?? null;
const render = () => act(async () => root?.render(<Probe />));

beforeEach(() => {
  const dom = new Window({ url: 'http://localhost' });
  const globals = { window: dom, document: dom.document, navigator: dom.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  questions = [];
  host = document.createElement('div');
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});

test('a running session reports work until the Agent Service asks for input', async () => {
  await render();
  expect(working()).toBe('true');
  questions = [nativeQuestion('ses_a')];
  await render();
  expect(working()).toBe('false');
  questions = [];
  await render();
  expect(working()).toBe('true');
});
