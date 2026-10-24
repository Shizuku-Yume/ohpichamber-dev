import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { plugin } from 'bun';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
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
  if (path.endsWith('/config')) return Response.json([]);
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
const { nativeClient, nativeHistory, nativeSnapshot } = await import('@/sync/session-message-loader-test-fixtures');

// Mounting the column reads only the runtime descriptor and theme/i18n; no
// runtime API method is invoked.
const runtimeAPIs = { runtime: { platform: 'web', isDesktop: false }, sourceControl: {} } as RuntimeAPIs;
const DIRECTORY = '/workspace';
const SESSION_ID = 'session-accepted-run';

const hostSession = (): Session => ({
  ...nativeSnapshot(SESSION_ID, []).session,
  metadata: { title: 'Fresh session' }, metadataRevision: '1', archiveRevision: '0',
  runtimeStatus: 'running', activeRunId: 'run-accepted',
});
/** What the column holds right after the Host accepted a run: no message yet. */
const acceptedRunSnapshot = (sessionId: string) => {
  const snapshot = nativeSnapshot(sessionId, []);
  snapshot.session = { ...snapshot.session, runtimeStatus: 'running', activeRunId: 'run-accepted' };
  snapshot.activeRun = { runId: 'run-accepted', sessionId, status: 'running', createdAt: 3 };
  return snapshot;
};
const client = nativeClient({
  getSnapshot: async (sessionId: string) => acceptedRunSnapshot(sessionId),
  getHistory: async (sessionId: string) => nativeHistory([], null, acceptedRunSnapshot(sessionId)),
  listSessions: async () => ({ items: [hostSession()], errors: {} }),
});
client.listProjects = async () => ({ items: [], errors: {} });
client.listWorkspaces = async () => ({ items: [], errors: {} });
client.subscribeSessionEvents = () => () => {};

let container: HTMLDivElement;
let root: Root;
let seedStore: StoreApi<DirectoryStore> | null = null;

const Seed = () => {
  seedStore = useDirectoryStore(DIRECTORY, { bootstrap: false });
  return null;
};

describe('chat status live region on an accepted new-session run', () => {
  beforeEach(() => {
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
    await browser.happyDOM.close();
  });

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
});
