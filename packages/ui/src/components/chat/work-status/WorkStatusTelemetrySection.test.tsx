import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Message, RuntimeSession } from '@openchamber/agent-contract';
import { useUIStore } from '@/stores/useUIStore';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import type { State } from '@/sync/types';

let WorkStatusTelemetrySection: typeof import('./WorkStatusTelemetrySection').WorkStatusTelemetrySection;
const directory = '/repo';
const sessionId = 'session-1';
const session: RuntimeSession & { metadata: null; metadataRevision: '0'; archiveRevision: '0' } = {
  sessionId, rootSessionId: sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: directory,
  createdAt: 0, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
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
  const render = async (selectedSession = sessionId) => act(async () => root.render(
    <SyncProvider directory={directory}>
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
    // Most cases follow a user who opened the section; it starts folded (see below).
    useUIStore.setState({ workStatusExpandedSections: { telemetry: true } });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await render();
    await publish({ session: [session], sessionTotal: 1, sessionStatusReady: true, session_status: { [sessionId]: 'idle' }, message: { [sessionId]: messages } });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); restore(); });
  test('renders canonical completed-turn usage when idle authority is available', () => {
    expect(container.textContent).toContain('Turn stats');
    expect(container.textContent).toContain('100 ↑ · 20 ↓');
    expect(container.textContent).toContain('Elapsed6.0s');
  });
  test('keeps the last completed turn visible while status is busy', async () => {
    await publish({ session_status: { [sessionId]: 'running' } });
    expect(container.textContent).toContain('100 ↑ · 20 ↓');
  });
  test('does not retain another session scope', async () => {
    await render('other-session');
    expect(container.textContent).not.toContain('100 ↑ · 20 ↓');
  });
  test('waits for authority, then shows actual token values even when idle is omitted from the snapshot', async () => {
    expect(container.textContent).toContain('Turn stats');
    expect(container.textContent).not.toContain('Whole turn');
    await publish({ sessionStatusReady: true });
    expect(container.textContent).toContain('100 ↑ · 20 ↓');
    expect(container.textContent).toContain('Turn stats');
    const heading = container.querySelector('button');
    if (!heading) throw new Error('Expected section heading');
    // No response speed without text parts; elapsed time and cost still show.
    expect(heading.textContent).toBe('Turn stats6.0s · $0.01');
    expect(heading.querySelectorAll('svg').length).toBe(2);
    expect(container.querySelectorAll('svg').length).toBe(2);
  });

  test('a pre-archive snapshot cannot enable turn stats after status invalidation', async () => {
    expect(container.textContent).toContain('100 ↑ · 20 ↓');
    await publish({ sessionStatusInvalidated: { [sessionId]: true } });
    expect(container.textContent).not.toContain('100 ↑ · 20 ↓');
    await publish({ sessionStatusInvalidated: {} });
    expect(container.textContent).toContain('100 ↑ · 20 ↓');
  });

  test('starts folded with time and cost in its heading, and keeps the user\'s choice', async () => {
    await render(false);
    await act(async () => {
      useUIStore.setState({ workStatusExpandedSections: {} });
      store().setState({ sessionStatusReady: true, part: { [assistant.id]: [
        { id: 'text', type: 'text', sessionID: sessionId, messageID: assistant.id, text: 'Final reply', time: { start: 3000, end: 5000 } },
      ] } });
    });
    await render();
    const heading = () => dom.container.querySelector('button');
    expect(heading()?.getAttribute('aria-expanded')).toBe('false');
    expect(heading()?.textContent).toBe('Turn stats6.0s · $0.01');
    expect(dom.container.textContent).not.toContain('Whole turn');
    await act(async () => heading()?.click());
    await render(false);
    await render();
    expect(heading()?.getAttribute('aria-expanded')).toBe('true');
    expect(dom.container.textContent).toContain('Whole turn');
  });

  test('collapsed remount keeps a usable header and reopening reads fresh data', async () => {
    const button = container.querySelector('button');
    if (!button) throw new Error('Expected collapse button');
    await act(async () => button.click());
    expect(dom.container.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
    expect(dom.container.querySelector('button')?.textContent).toBe('Turn stats~10 tok/s · 6.0s');
    expect(dom.container.textContent).not.toContain('Whole turn');
    const reopen = dom.container.querySelector('button');
    if (!reopen) throw new Error('Expected reopen button');
    await act(async () => reopen.click());
    expect(dom.container.textContent).toContain('Turn stats');
  });

  test('busy and waiting updates reuse the retained stats instead of re-aggregating', async () => {
    await publish({ session_status: { [sessionId]: 'running' } });
    // A different message set while busy must not replace the retained turn.
    await publish({ message: { [sessionId]: messages.slice(1) } });
    expect(container.textContent).toContain('100 ↑ · 20 ↓');
    await publish({ session_status: { [sessionId]: 'awaiting_input' } });
    expect(container.textContent).toContain('100 ↑ · 20 ↓');
  });

  test('session and directory changes cannot retain another scope, including equal IDs', async () => {
    await render('another-session');
    expect(container.textContent).not.toContain('100 ↑ · 20 ↓');
  });

  test('same-ID corrections, partial history and reverts replace rather than cache stale stats', async () => {
    await publish({ message: { [sessionId]: messages.slice(1) } });
    expect(container.textContent).not.toContain('100 ↑ · 20 ↓');
    await publish({ message: { [sessionId]: messages } });
    expect(container.textContent).toContain('100 ↑ · 20 ↓');
  });

  test('runtime identity changes discard retained results even with equal directory and session IDs', async () => {
    Object.defineProperty(window, '__OPENCHAMBER_API_BASE_URL__', { value: 'https://second-runtime.test', configurable: true });
    await render();
    expect(container.textContent).not.toContain('100 ↑ · 20 ↓');
  });

  test('the heading never fabricates response or whole-turn speed from canonical messages', async () => {
    await publish({ sessionStatusReady: true });
    expect(container.querySelector('button')?.textContent).toContain('Turn stats~10 tok/s · 6.0s');
    expect(container.textContent).not.toContain('Whole turn');
    await publish({ sessionStatusReady: true });
    expect(container.querySelector('button')?.textContent).toBe('Turn stats6.0s');
    expect(container.textContent).not.toContain('Whole turn');
  });

  test('the folded heading carries two figures: time and cost for a paid turn, speed and time for a free one', async () => {
    await act(async () => {
      useUIStore.getState().setWorkStatusSectionExpanded('telemetry', false);
      store().setState({ sessionStatusReady: true, part: { [assistant.id]: [
        { id: 'text', type: 'text', sessionID: sessionId, messageID: assistant.id, text: 'Final reply', time: { start: 3000, end: 5000 } },
      ] } });
    });
    const heading = () => dom.container.querySelector('button')?.textContent;
    expect(heading()).toBe('Turn stats6.0s · $0.01');
    await act(async () => store().setState({ message: { [sessionId]: [user, freeAssistant] } }));
    expect(heading()).toBe('Turn stats~10 tok/s · 6.0s');
  });

  test('every metric has a full-row focus target and hover waits 750ms', async () => {
    const triggers = container.querySelectorAll<HTMLElement>('[data-slot="tooltip-trigger"]');
    expect(triggers.length).toBeGreaterThan(0);
    for (const trigger of triggers) expect(trigger.tabIndex).toBe(0);
    expect(container.querySelectorAll('[title]').length).toBe(0);
  });

  test('keyboard focus exposes the cost explanation without adding an icon or native title', async () => {
    const triggers = container.querySelectorAll<HTMLElement>('[data-slot="tooltip-trigger"]');
    const cost = triggers[triggers.length - 1];
    if (cost) expect(cost.hasAttribute('title')).toBe(false);
  });
});
