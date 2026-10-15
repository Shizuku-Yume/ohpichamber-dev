import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { OpenCode } from '@opencode/client';
import type { Message, RuntimeSession } from '@openchamber/agent-contract';
import { useUIStore } from '@/stores/useUIStore';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import type { State } from '@/sync/types';

let WorkStatusTelemetrySection: typeof import('./WorkStatusTelemetrySection').WorkStatusTelemetrySection;
const directory = '/repo';
const sessionId = 'session-1';
const session: RuntimeSession = {
  sessionId, rootSessionId: sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: directory,
  createdAt: 0, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
};
const usage = { input: 100, output: 20, cacheRead: 40, cacheWrite: 0, totalTokens: 160, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 } };
const messages: Message[] = [
  { messageId: 'user-1', sessionId, turnId: 'turn-1', role: 'user', createdAt: 1000, parts: [] },
  { messageId: 'assistant-final', sessionId, turnId: 'turn-1', role: 'assistant', createdAt: 7000, providerId: 'test', modelId: 'test', usage, parts: [] },
];

describe('mounted turn telemetry with canonical sync stores', () => {
  let root: Root;
  let container: HTMLElement;
  let restore: () => void;
  const sdk = OpenCode.make({ baseUrl: 'http://telemetry.test', fetch: () => new Promise<Response>(() => undefined) });
  const render = async (selectedSession = sessionId) => act(async () => root.render(
    <SyncProvider sdk={sdk} directory={directory}>
      <I18nProvider><WorkStatusTelemetrySection sessionId={selectedSession} directory={directory} /></I18nProvider>
    </SyncProvider>,
  ));
  const publish = async (patch: Partial<State>) => {
    const store = getSyncChildStores().getChild(directory);
    if (!store) throw new Error('Expected directory store');
    await act(async () => store.setState(patch));
  };
  beforeEach(async () => {
    const win = new Window({ url: 'http://localhost' });
    const values = { window: win, document: win.document, navigator: win.navigator, Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement, HTMLIFrameElement: win.HTMLIFrameElement, localStorage: win.localStorage, getComputedStyle: win.getComputedStyle.bind(win), ResizeObserver: win.ResizeObserver, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    restore = () => { for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); } void win.happyDOM.close(); };
    ({ WorkStatusTelemetrySection } = await import('./WorkStatusTelemetrySection'));
    useUIStore.setState({ workStatusExpandedSections: {} });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await render();
    await publish({ session: [session], sessionTotal: 1, sessionStatusReady: true, session_status: { [sessionId]: { type: 'idle' } }, message: { [sessionId]: messages } });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); restore(); });
  test('renders canonical completed-turn usage when idle authority is available', () => {
    expect(container.textContent).toContain('Turn stats');
    expect(container.textContent).toContain('100 ↑ · 20 ↓');
    expect(container.textContent).toContain('Elapsed6.0s');
  });
  test('does not render stats while status is busy', async () => {
    await publish({ session_status: { [sessionId]: { type: 'busy' } } });
    expect(container.textContent).not.toContain('100 ↑ · 20 ↓');
  });
  test('does not retain another session scope', async () => {
    await render('other-session');
    expect(container.textContent).not.toContain('100 ↑ · 20 ↓');
  });
});
