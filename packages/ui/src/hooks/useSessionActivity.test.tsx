import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { nativeQuestion } from '@/sync/session-message-loader-test-fixtures';
import type { State } from '@/sync/types';

const directoryState: Pick<State, 'snapshot' | 'session'> = { snapshot: {}, session: [] };
let forms: State['form'] = {};
const form = nativeQuestion('ses_a');

mock.module('@/sync/sync-context', () => ({
  useSessionStatus: () => 'running',
  useSessionCompacting: () => null,
  useSessionForms: (sessionId: string) => forms[sessionId] ?? [],
  useSessionPermissions: () => [],
  useDirectorySync: <T,>(select: (state: typeof directoryState) => T) => select(directoryState),
}));
mock.module('@/sync/session-ui-store', () => ({ useSessionUIStore: () => null }));

const { useSessionActivity } = await import('./useSessionActivity');

let root: Root | null = null;
let host: HTMLElement;
const originals = new Map<string, PropertyDescriptor | undefined>();

const Probe: React.FC = () => <span data-id="phase">{useSessionActivity('ses_a', '/repo').phase}</span>;
const phase = () => host.querySelector('[data-id="phase"]')?.textContent ?? null;
const render = () => act(async () => root?.render(<Probe />));

beforeEach(() => {
  const dom = new Window({ url: 'http://localhost' });
  const globals = { window: dom, document: dom.document, navigator: dom.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  forms = {};
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

test('a native pending question holds the running session composer idle', async () => {
  forms = { ses_a: [form] };
  await render();
  expect(phase()).toBe('idle');
});

test('a running session without pending questions keeps Queue and Stop', async () => {
  await render();
  expect(phase()).toBe('busy');
});

test('a canonical question resolution restores Queue and Stop without waiting for transcript parts', async () => {
  forms = { ses_a: [form] };
  await render();
  expect(phase()).toBe('idle');
  forms = { ses_a: [] };
  await render();
  expect(phase()).toBe('busy');
});

test('a question arriving before transcript parts keeps the running composer idle', async () => {
  await render();
  expect(phase()).toBe('busy');
  forms = { ses_a: [form] };
  await render();
  expect(phase()).toBe('idle');
});

test('a refreshed snapshot of the same pending question keeps the composer idle', async () => {
  forms = { ses_a: [form] };
  await render();
  expect(phase()).toBe('idle');
  forms = { ses_a: [{ ...form }] };
  await render();
  expect(phase()).toBe('idle');
});

test('a question in another session does not change the running composer', async () => {
  forms = { ses_b: [nativeQuestion('ses_b')] };
  await render();
  expect(phase()).toBe('busy');
});

test('resolving one of multiple pending questions keeps the composer idle', async () => {
  const remaining = { ...form, questionId: 'question-b' };
  forms = { ses_a: [form, remaining] };
  await render();
  expect(phase()).toBe('idle');
  forms = { ses_a: [remaining] };
  await render();
  expect(phase()).toBe('idle');
});
