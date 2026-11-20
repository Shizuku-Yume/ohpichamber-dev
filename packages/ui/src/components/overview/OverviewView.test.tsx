import { act } from 'react';
import { afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

const session = (sessionId: string, title: string, time: { created?: number; updated?: number } = {}, metadata?: SessionMetadata | null): Session => ({
  sessionId, projectId: 'project', workspaceId: 'ws', displayPath: 'repo', rootSessionId: sessionId,
  createdAt: time.created ?? NOW - HOUR, updatedAt: time.updated ?? NOW - HOUR, epoch: '1', headSequence: '1',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }, title,
  metadata: metadata ?? null,
  metadataRevision: metadata ? '1' : '0', archiveRevision: '0',
});

const inWork = (extra: Record<string, unknown> = {}): SessionMetadata => ({ openchamber: { work: { state: 'open', openedAt: 1 }, ...extra } });
const unread = (metadata: SessionMetadata): SessionMetadata => ({
  ...metadata, openchamber: { ...metadata.openchamber, workbench: { lastIdleAt: NOW } },
});

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

test('the page sums up, lists what waits first, and asks before marking everything done', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const globals = {
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent,
    MutationObserver: dom.MutationObserver, KeyboardEvent: dom.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(async () => Response.json({}), originalFetch);

  const { createRoot } = await import('react-dom/client');
  const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
  const { createWebAPIs } = await import('../../../../web/src/api/index');
  const { I18nProvider } = await import('@/lib/i18n');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  const { useGlobalSessionsStore } = await import('@/stores/useGlobalSessionsStore');
  const { useGlobalBlockingRequestsStore } = await import('@/sync/global-blocking-requests');
  const { OverviewPage } = await import('./OverviewView');

  const hint = inWork({ work: { state: 'open', openedAt: 1, suggestDoneAt: NOW } });
  useGlobalSessionsStore.getState().applySnapshot([
    session('asking', 'Fix relay reconnect'),
    session('finished', 'Usage stats', { updated: NOW - HOUR }, unread(inWork())),
    session('done-a', 'Release notes', { updated: NOW - 2 * HOUR }, hint),
    session('done-b', 'Tray icon states', { updated: NOW - 2 * HOUR }, hint),
    session('quiet', 'Not in work', { updated: NOW - HOUR }),
  ], [], 'ready');
  useGlobalBlockingRequestsStore.setState({
    bySession: new Map([['asking', {
      directory: '/repo', permissions: [],
      forms: [{ questionId: 'f', sessionId: 'asking', turnId: 't1', prompt: 'Which branch?', status: 'pending', version: '1', epoch: '1', workerGeneration: '1', requestedAt: NOW }],
    }]]),
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  cleanup = () => {
    act(() => root.unmount());
    globalThis.fetch = originalFetch;
    useGlobalBlockingRequestsStore.setState({ bySession: new Map() });
  };

  await act(async () => root.render(
    <RuntimeAPIContext.Provider value={createWebAPIs()}>
      <I18nProvider>
        <TooltipProvider>
          <OverviewPage layout="page" onLeave={() => undefined} />
        </TooltipProvider>
      </I18nProvider>
    </RuntimeAPIContext.Provider>,
  ));

  const text = container.textContent ?? '';
  expect(text).toContain('2 need you');
  expect(text).toContain('2 look done');
  // The question a session waits on is named under its title.
  expect(text).toContain('Which branch?');
  expect([...container.querySelectorAll('button')].filter((button) => button.textContent === 'Answer').length).toBe(1);
  expect(text.indexOf('Fix relay reconnect')).toBeLessThan(text.indexOf('Usage stats'));
  expect(text).toContain('asks a question');
  // An unread end wears the sidebar's unread mark instead of a word.
  expect(container.querySelectorAll('[data-session-activity-indicator="unread"]').length).toBe(1);
  expect(text).not.toContain('Not in work');

  const markAll = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Mark all done');
  expect(markAll).toBeDefined();
  await act(async () => markAll!.click());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain('Mark 2 sessions done?');
  expect(dialog?.textContent).toContain('Release notes');
  expect(dialog?.textContent).toContain('Tray icon states');
  expect(dialog?.textContent).toContain('Tray icon states');
});

test('the page renders an explicit error state when session load fails', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const globals = {
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent,
    MutationObserver: dom.MutationObserver, KeyboardEvent: dom.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
  const { createWebAPIs } = await import('../../../../web/src/api/index');
  const { I18nProvider } = await import('@/lib/i18n');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  const { useGlobalSessionsStore } = await import('@/stores/useGlobalSessionsStore');
  const { OverviewPage } = await import('./OverviewView');

  useGlobalSessionsStore.getState().applySnapshot([], [], 'error');

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => root.render(
    <RuntimeAPIContext.Provider value={createWebAPIs()}>
      <I18nProvider>
        <TooltipProvider>
          <OverviewPage layout="page" onLeave={() => undefined} />
        </TooltipProvider>
      </I18nProvider>
    </RuntimeAPIContext.Provider>,
  ));

  expect(container.querySelector('[data-testid="overview-error-state"]')).not.toBeNull();
  expect(container.textContent).toContain('Could not load sessions.');
  act(() => root.unmount());
});
