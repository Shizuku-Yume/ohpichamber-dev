import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { TodoPhase } from '@openchamber/agent-contract';
import { I18nProvider } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import { applyDirectoryEvent, installSessionSnapshot } from '@/sync/event-reducer';
import { nativeClient, nativeSnapshot } from '@/sync/session-message-loader-test-fixtures';

let WorkStatusTasksSection: typeof import('./WorkStatusTasksSection').WorkStatusTasksSection;
const directory = '/repo';
const sessionId = 'session-tasks';
const phases: TodoPhase[] = [{ name: 'Plan', tasks: [
  { content: 'Finish this', status: 'pending' },
  { content: 'Current work', status: 'in_progress' },
  { content: 'Waiting work', status: 'blocked', blocker: 'Needs review' },
  { content: 'Already done', status: 'completed' },
  { content: 'Not needed', status: 'abandoned' },
] }];

describe('Canonical work-status tasks', () => {
  let root: Root;
  let host: HTMLElement;
  let restore: () => void;
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
  const render = async (selected: string | null = sessionId) => act(async () => {
    root.render(<I18nProvider><SyncProvider client={nativeClient()} directory={directory}>
      <WorkStatusTasksSection sessionId={selected} directory={directory} />
    </SyncProvider></I18nProvider>);
  });
  const publish = async (todos: TodoPhase[]) => {
    const snapshot = nativeSnapshot(sessionId);
    snapshot.todos = todos;
    await act(async () => getSyncChildStores().getChild(directory)!.setState((state) => installSessionSnapshot(state, snapshot)));
  };
  beforeEach(async () => {
    const win = new Window({ url: 'http://tasks.test' });
    const values = { window: win, Window: win.Window, document: win.document, navigator: win.navigator, Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement, HTMLIFrameElement: win.HTMLIFrameElement, getComputedStyle: win.getComputedStyle.bind(win), ResizeObserver: win.ResizeObserver, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    restore = () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      void win.happyDOM.close();
    };
    ({ WorkStatusTasksSection } = await import('./WorkStatusTasksSection'));
    registerWorkspaceDirectory('workspace-a', directory);
    useUIStore.setState({ workStatusExpandedSections: { tasks: true } });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    fetchSpy = spyOn(globalThis, 'fetch');
    await render();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    const todoRequests = fetchSpy.mock.calls.filter(([request]) => (request instanceof Request ? request.url : String(request)).includes('/api/session-todos/'));
    fetchSpy.mockRestore();
    resetWorkspaceDirectories();
    restore();
    expect(todoRequests).toHaveLength(0);
  });

  test('renders every Canonical status from the scoped snapshot without Host todo polling', async () => {
    await publish(phases);
    expect(host.textContent).toContain('2/5');
    for (const task of phases[0].tasks) expect(host.textContent).toContain(task.content);
    expect(host.textContent!.indexOf('Current work')).toBeLessThan(host.textContent!.indexOf('Finish this'));
  });

  test('an ordered empty update clears tasks instead of restoring cached tasks', async () => {
    await publish(phases);
    await act(async () => getSyncChildStores().getChild(directory)!.setState((state) => applyDirectoryEvent(state, {
      sessionId, epoch: 'epoch-a', sequence: '5', timestamp: 10, type: 'session.updated', todos: [],
    }).state));
    expect(host.textContent).toBe('');
  });

  test('does not leak another session checklist into an absent or unselected session', async () => {
    await publish(phases);
    await render('other-session');
    expect(host.textContent).toBe('');
    await render(null);
    expect(host.textContent).toBe('');
  });
});
