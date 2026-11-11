import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import { peekMessageFocus } from '@/lib/router/messageFocus';
import { navigateFromNotification } from '@/lib/router/notificationNavigation';
import { openSession } from '@/lib/router/openSessionFromRoute';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useRouter } from './useRouter';

const DIRECTORY = '/project';

const session = (sessionId: string, updatedAt: number): Session => ({
  sessionId, projectId: 'project', workspaceId: 'workspace',
  displayPath: 'project',
  rootSessionId: sessionId, createdAt: 1, updatedAt, epoch: 'epoch',
  headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  mode: { kind: 'main' }, metadata: null, metadataRevision: '0', archiveRevision: '0',
});

const previous = session('previous', 1);
const next = session('next', 2);
const initialGlobalSessions = useGlobalSessionsStore.getState();
let dom: Window;
let root: Root;
let entries: string[];
let restoreHistory: () => void;
let replaceURL: (url: string) => void;
const originals = new Map<string, PropertyDescriptor | undefined>();
const Harness = () => { useRouter(); return null; };

beforeEach(() => {
  dom = new Window({ url: 'http://localhost/?session=previous' });
  for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    localStorage: dom.localStorage, CustomEvent: dom.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  registerWorkspaceDirectory('workspace', DIRECTORY);
  useProjectsStore.setState({ projects: [{ id: 'project', path: DIRECTORY, label: 'Project', lastOpenedAt: 1 }] });
  useSessionUIStore.getState().setCurrentSession('previous', DIRECTORY);
  useUIStore.setState({ isSettingsDialogOpen: false });
  useGlobalSessionsStore.setState({
    activeSessions: [previous, next], archivedSessions: [],
    entityById: new Map([[previous.sessionId, previous], [next.sessionId, next]]),
    hasLoaded: true, status: 'ready',
  });
  // Happy DOM reloads documents on Back instead of emitting same-document popstate.
  // Keep native URL writes and model only the history traversal for this test.
  entries = [window.location.href];
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);
  const pushSpy = spyOn(window.history, 'pushState').mockImplementation((state, unused, url) => {
    push(state, unused, url);
    entries.push(window.location.href);
  });
  const replaceSpy = spyOn(window.history, 'replaceState').mockImplementation((state, unused, url) => {
    replace(state, unused, url);
    entries[entries.length - 1] = window.location.href;
  });
  replaceURL = (url) => replace({}, '', url);
  restoreHistory = () => { pushSpy.mockRestore(); replaceSpy.mockRestore(); };
  root = createRoot(document.createElement('div'));
});

afterEach(async () => {
  await act(async () => root.unmount());
  restoreHistory();
  useGlobalSessionsStore.setState(initialGlobalSessions, true);
  resetWorkspaceDirectories();
  await dom.happyDOM.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  originals.clear();
});

const back = async () => {
  await act(async () => {
    entries.pop();
    replaceURL(entries[entries.length - 1]);
    window.dispatchEvent(new window.PopStateEvent('popstate'));
  });
};

test('a cold notification open adds one entry and one Back returns to the previous chat', async () => {
  await act(async () => root.render(<Harness />));
  const length = entries.length;
  await act(async () => openSession(next.sessionId, { directory: DIRECTORY }));
  expect(useSessionUIStore.getState().currentSessionId).toBe(next.sessionId);
  expect(window.location.search).toBe('?session=next');
  expect(entries.length).toBe(length + 1);
  await back();
  expect(useSessionUIStore.getState().currentSessionId).toBe('previous');
  expect(window.location.search).toBe('?session=previous');
  // A store update after popstate must still create a fresh navigation entry.
  await act(async () => openSession(next.sessionId));
  expect(window.location.search).toBe('?session=next');
});

test('repeated Back to a message link preserves its transcript and message target', async () => {
  window.history.replaceState({}, '', '/?session=next&message=msg');
  window.history.pushState({}, '', '/?session=previous');
  await act(async () => root.render(<Harness />));

  for (let visit = 0; visit < 2; visit++) {
    await back();
    expect(useSessionUIStore.getState().currentSessionId).toBe('next');
    expect(window.location.search).toBe('?session=next&message=msg');
    // The message target is a request for that timeline, not a route rewrite.
    expect(peekMessageFocus('next')?.messageId).toBe('msg');
    await act(async () => openSession(previous.sessionId));
  }
});

test('an initial message link keeps its message target', async () => {
  window.history.replaceState({}, '', '/?session=next&message=msg');
  await act(async () => root.render(<Harness />));
  expect(useSessionUIStore.getState().currentSessionId).toBe('next');
  expect(window.location.search).toBe('?session=next&message=msg');
  expect(peekMessageFocus('next')?.messageId).toBe('msg');
});

test('a PWA notification opens one entry and preserves one-step Back', async () => {
  await act(async () => root.render(<Harness />));
  const length = entries.length;
  await act(async () => {
    expect(navigateFromNotification('http://localhost/?session=next')).toBe(true);
  });
  expect(useSessionUIStore.getState().currentSessionId).toBe('next');
  expect(window.location.search).toBe('?session=next');
  expect(entries.length).toBe(length + 1);
  await back();
  expect(useSessionUIStore.getState().currentSessionId).toBe('previous');
  expect(window.location.search).toBe('?session=previous');
});

for (const source of ['initial route', 'PWA notification']) {
  test(`Back during a cold ${source} preserves the previous chat`, async () => {
    if (source === 'PWA notification') {
      await act(async () => root.render(<Harness />));
    } else {
      window.history.pushState({}, '', '/?session=next');
    }
    const snapshot = { activeSessions: [previous, next], archivedSessions: [] };
    const loading = Promise.withResolvers<typeof snapshot>();
    const load = spyOn(useGlobalSessionsStore.getState(), 'loadSessions').mockImplementation(() => loading.promise);
    useGlobalSessionsStore.setState({ activeSessions: [], entityById: new Map(), hasLoaded: false, status: 'loading' });
    try {
      await act(async () => {
        if (source === 'PWA notification') {
          expect(navigateFromNotification('http://localhost/?session=next')).toBe(true);
        } else {
          root.render(<Harness />);
        }
      });
      expect(useSessionUIStore.getState().currentSessionId).toBe('next');
      await back();
      expect(window.location.search).toBe('?session=previous');
      await act(async () => {
        useGlobalSessionsStore.setState({ ...snapshot, hasLoaded: true, status: 'ready' });
        loading.resolve(snapshot);
        await loading.promise;
      });
      expect(useSessionUIStore.getState().currentSessionId).toBe('previous');
      expect(window.location.search).toBe('?session=previous');
      expect(entries).toEqual(['http://localhost/?session=previous']);
    } finally {
      loading.resolve(snapshot);
      load.mockRestore();
    }
  });
}
