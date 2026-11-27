import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { plugin } from 'bun';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import type { Root } from 'react-dom/client';
import type { StoreApi } from 'zustand';
import type { Session } from '@openchamber/agent-contract';
import type { RuntimeAPIs } from '@/lib/api/types';
import type { DirectoryStore } from '@/sync/child-store';

/**
 * The chat status live region must exist as soon as the Host accepts a run,
 * even on a brand-new session whose first message has not been admitted to the
 * transcript yet. This mounts the real chat column in that exact state and
 * asserts the consumer-visible accessibility node instead of any internal
 * wiring.
 */
const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage,
  Node: browser.Node,
  Text: browser.Text,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  HTMLFormElement: browser.HTMLFormElement,
  Range: browser.Range,
  Selection: browser.Selection,
  DocumentFragment: browser.DocumentFragment,
  Event: browser.Event,
  KeyboardEvent: browser.KeyboardEvent,
  MouseEvent: browser.MouseEvent,
  FocusEvent: browser.FocusEvent,
  InputEvent: browser.InputEvent,
  CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  IntersectionObserver: browser.IntersectionObserver,
  matchMedia: browser.matchMedia.bind(browser),
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  customElements: browser.customElements,
  HTMLDivElement: browser.HTMLDivElement,
  HTMLSpanElement: browser.HTMLSpanElement,
  SVGElement: browser.SVGElement,
  ShadowRoot: browser.ShadowRoot,
  CSSStyleSheet: browser.CSSStyleSheet,
  DOMParser: browser.DOMParser,
  IS_REACT_ACT_ENVIRONMENT: true,
});

spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const path = new URL(input instanceof Request ? input.url : input.toString(), 'http://localhost/').pathname;
  if (path.endsWith('/location')) return Response.json({ directory: '/workspace', project: { id: 'project', directory: '/workspace', canonical: '/workspace' } });
  if (path.endsWith('/session')) return Response.json({ data: [] });
  if (path === '/api/agent/v1/workspaces/resolve') return Response.json({ workspaceId: 'workspace-a', projectId: PROJECT_ID, name: 'Workspace' });
  if (path.endsWith('/commands')) return Response.json({ workspaceId: 'workspace-a', revision: '0', commands: [], builtinCommands: [] });
  if (path.endsWith('/skills/catalog')) return Response.json({ workspaceId: 'workspace-a', skills: [] });
  if (path.endsWith('/skills/files')) return Response.json({ workspaceId: 'workspace-a', sources: { workspace: '0', agent: '0' }, skills: [] });
  if (path.startsWith('/api/projects/') && path.endsWith('/config')) return Response.json({
    trust: { hash: null, trusted: true }, setupWorktree: [], setupWorktreeWait: false,
    teardownWorktree: [], projectActions: [], projectActionsPrimaryId: null, draftStarters: [],
    shared: {
      status: 'missing', path: '.openchamber/project.json', setupWorktree: [], setupWorktreeWait: null,
      teardownWorktree: [], projectActions: [], draftStarters: [], plansDir: null,
    },
    personal: {
      setupWorktree: [], setupWorktreeWait: null, setupWorktreeMode: 'append', worktreeDirectory: null,
      teardownWorktree: [], projectActions: [], projectActionsPrimaryId: null, draftStarters: [],
      hiddenSharedActionIds: [], sharedTrust: null,
    },
  });
  if (path.endsWith('/config')) return Response.json([]);
  // The settings document owns the project list; an answer without it would
  // empty the list the column's admission check reads.
  if (path.endsWith('/config/settings')) return Response.json({ projects: [{ path: DIRECTORY }] });
  return Response.json({});
});

plugin({
  name: 'chat-container-live-region-vite-modules',
  setup(build) {
    build.onResolve({ filter: /\?worker&url$/ }, ({ path }) => ({ path, namespace: 'worker-url' }));
    build.onLoad({ filter: /.*/, namespace: 'worker-url' }, () => ({ contents: 'export default "";', loader: 'js' }));
    build.onLoad({ filter: /useProviderLogo\.ts$/ }, ({ path }) => {
      const directory = resolve(dirname(path), '../assets/provider-logos');
      const logos = Object.fromEntries(readdirSync(directory).filter((name) => name.endsWith('.svg')).map((name) => [
        `../assets/provider-logos/${name}`, pathToFileURL(resolve(directory, name)).href,
      ]));
      return { contents: readFileSync(path, 'utf8').replace(/import\.meta\.glob<string>\([\s\S]*?\);/, `${JSON.stringify(logos)};`), loader: 'ts' };
    });
  },
});

// Static imports would evaluate React DOM and the chat module graph before the
// happy-dom globals above exist, so this test loads them after the browser.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
const { ChatContainer } = await import('../ChatContainer');
const { SyncProvider, useDirectoryStore } = await import('@/sync/sync-context');
const { useSessionUIStore } = await import('@/sync/session-ui-store');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { useUIStore } = await import('@/stores/useUIStore');
const { nativeClient, nativeHistory, nativeSnapshot } = await import('@/sync/session-message-loader-test-fixtures');
// The store derives a project's id from its path; a seeded list or a settings
// sync that names the same folder must agree on that id.
const { createProjectIdFromPath } = await import('@/lib/projectId');

// Mounting the column reads only the runtime descriptor and theme/i18n; no
// runtime API method is invoked.
const runtimeAPIs = { runtime: { platform: 'web', isDesktop: false }, sourceControl: {} } as RuntimeAPIs;
const DIRECTORY = '/workspace';
const SESSION_ID = 'session-accepted-run';
const PROJECT_ID = createProjectIdFromPath(DIRECTORY);

const hostSession = (): Session => ({
  ...nativeSnapshot(SESSION_ID, []).session,
  title: 'Fresh session', metadata: {}, metadataRevision: '1', archiveRevision: '0',
  runtimeStatus: 'running', activeRunId: 'run-accepted',
});
/** What the column holds right after the Host accepted a run: no message yet. */
const acceptedRunSnapshot = (sessionId: string) => {
  const snapshot = nativeSnapshot(sessionId, []);
  snapshot.session = { ...snapshot.session, runtimeStatus: 'running', activeRunId: 'run-accepted' };
  snapshot.activeRun = { runId: 'run-accepted', sessionId, status: 'running', origin: 'host', createdAt: 3 };
  return snapshot;
};
const client = nativeClient({
  getSnapshot: async (sessionId: string) => acceptedRunSnapshot(sessionId),
  getHistory: async (sessionId: string) => nativeHistory([], null, acceptedRunSnapshot(sessionId)),
  listSessions: async () => ({ items: [hostSession()], errors: {} }),
});
client.listProjects = async () => ({
  items: [{ projectId: PROJECT_ID, name: 'Workspace', workspaceIds: ['workspace-a'] }],
  errors: {},
});
client.listWorkspaces = async () => ({
  items: [{ workspaceId: 'workspace-a', projectId: PROJECT_ID, name: 'Workspace', displayPath: '.' }],
  errors: {},
});
client.subscribeSessionEvents = () => () => { };

let container: HTMLDivElement;
let root: Root;
let seedStore: StoreApi<DirectoryStore> | null = null;

const Seed = () => {
  seedStore = useDirectoryStore(DIRECTORY, { bootstrap: false });
  return null;
};

describe('chat status live region on an accepted new-session run', () => {
  beforeEach(() => {
    useUIStore.setState({ isMobile: false });
    // The column is shown for a session whose folder is an admitted project.
    useProjectsStore.setState({ projects: [{ id: PROJECT_ID, path: DIRECTORY, label: 'Workspace' }], activeProjectId: PROJECT_ID });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    useSessionUIStore.setState({
      currentSessionId: SESSION_ID,
      currentSessionDirectory: DIRECTORY,
      newSessionDraft: { ...useSessionUIStore.getState().newSessionDraft, open: false, target: 'chat', directoryOverride: null },
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    seedStore = null;
    container.remove();
    window.history.replaceState(null, '', '/');
    await browser.happyDOM.abort();
  });

  afterAll(async () => { await browser.happyDOM.close(); });

  test('renders a named polite status node while working with no timeline messages', async () => {
    await act(async () => {
      root.render(
        <RuntimeAPIContext.Provider value={runtimeAPIs}>
          <ThemeSystemProvider>
            <I18nProvider>
              <SyncProvider directory={DIRECTORY} client={client}>
                <Seed />
                <ChatContainer autoOpenDraft={false} />
              </SyncProvider>
            </I18nProvider>
          </ThemeSystemProvider>
        </RuntimeAPIContext.Provider>,
      );
    });
    // The column loads the accepted-run snapshot: the session becomes running
    // with no timeline messages. Wait for that store state instead of a clock.
    const snapshotApplied = Promise.withResolvers<void>();
    expect(seedStore).not.toBeNull();
    const acceptedWithoutMessages = (state: DirectoryStore) => (
      state.session_status[SESSION_ID] === 'running' && (state.message[SESSION_ID] ?? []).length === 0
    );
    const unsubscribe = seedStore!.subscribe((state) => {
      if (acceptedWithoutMessages(state)) snapshotApplied.resolve();
    });
    if (acceptedWithoutMessages(seedStore!.getState())) snapshotApplied.resolve();
    await act(async () => { await snapshotApplied.promise; });
    unsubscribe();
    const state = seedStore!.getState();
    expect(state.session_status[SESSION_ID]).toBe('running');
    expect(state.message[SESSION_ID] ?? []).toHaveLength(0);

    const node = container.querySelector('[role="status"][aria-live="polite"]');
    expect(node).not.toBeNull();
    expect((node?.getAttribute('aria-label') ?? '').trim().length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-label="Stop generating"]')).not.toBeNull();
  });

  test.each(['project', 'chat'] as const)('keeps the %s draft welcome in a scrollable, safely centered region', async (target) => {
    window.history.replaceState(null, '', '/?surface=mobile');
    useUIStore.setState({ isMobile: true });
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      newSessionDraft: {
        ...useSessionUIStore.getState().newSessionDraft,
        open: true, target, selectedProjectId: PROJECT_ID, directoryOverride: DIRECTORY,
      },
    });
    await act(async () => {
      root.render(
        <RuntimeAPIContext.Provider value={runtimeAPIs}>
          <ThemeSystemProvider>
            <I18nProvider>
              <SyncProvider directory={DIRECTORY} client={client}>
                <ChatContainer autoOpenDraft={false} />
              </SyncProvider>
            </I18nProvider>
          </ThemeSystemProvider>
        </RuntimeAPIContext.Provider>,
      );
    });
    const welcome = container.querySelector('.oc-draft-center');
    const heading = welcome?.querySelector('h1');
    expect(container.querySelectorAll('h1').length).toBe(1);
    expect(heading?.textContent).toContain(target === 'project' ? 'Workspace' : 'What are we working on?');
    expect(welcome?.classList.contains('overflow-y-auto')).toBe(true);
    expect(welcome?.classList.contains('min-h-0')).toBe(true);
    expect(welcome?.classList.contains('flex-1')).toBe(true);
    expect(welcome?.classList.contains('justify-center')).toBe(false);
    expect(heading?.parentElement?.parentElement).toBe(welcome);
    expect(heading?.parentElement?.classList.contains('my-auto')).toBe(true);
    expect(heading?.parentElement?.classList.contains('shrink-0')).toBe(true);
    expect(heading?.parentElement?.contains(welcome?.querySelector('.oc-draft-starters') ?? null)).toBe(true);
    expect(welcome?.contains(container.querySelector('[data-composer-slot]'))).toBe(false);
  });
});
