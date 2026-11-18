import { afterAll, afterEach, beforeAll, expect, spyOn, test } from 'bun:test';
import { plugin } from 'bun';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import type { RuntimeAPIs } from '@/lib/api/types';
import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';

/**
 * `/btw` regression coverage: typing or picking the command must open the
 * transient panel and route the question to the btw control route, never to
 * the main send path. `/compact` on a too-small session is a "nothing to do"
 * notice, not a failure toast.
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
  if (path.endsWith('/location')) {
    return Response.json({ directory: '/workspace', project: { id: 'project', directory: '/workspace', canonical: '/workspace' } });
  }
  if (path.endsWith('/session')) return Response.json({ data: [] });
  if (path.endsWith('/config')) return Response.json([]);
  if (path === '/api/config/settings') return Response.json({ projects: [{ path: '/workspace', label: 'Workspace' }], activeProjectId: 'path_L3dvcmtzcGFjZQ' });
  return Response.json({});
});

plugin({
  name: 'composer-btw-vite-modules',
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

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { EditorView } = await import('@codemirror/view');
const { I18nProvider } = await import('@/lib/i18n');
const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
const { ChatInput } = await import('../ChatInput');
const { SyncProvider } = await import('@/sync/sync-context');
const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
const { useSessionUIStore } = await import('@/sync/session-ui-store');
const { useBtwStore } = await import('@/stores/useBtwStore');
const { useAuthSessionStore } = await import('@/lib/runtime-auth-expiry');
const { useConfigStore } = await import('@/stores/useConfigStore');
const { canonicalClient, CanonicalApiError } = await import('@/api/canonicalClient');
const { toast } = await import('@/components/ui');

// SAFETY: mounting reads only the runtime descriptor and the source-control
// object's identity; no runtime API method is invoked.
const runtimeAPIs = { runtime: { platform: 'web', isDesktop: false }, sourceControl: {} } as RuntimeAPIs;
const SESSION_ID = 'ses_btw';

const wrap = (content: ReactNode) => (
  <RuntimeAPIContext.Provider value={runtimeAPIs}>
    <ThemeSystemProvider>
      <I18nProvider>
        <SyncProvider directory="/workspace">{content}</SyncProvider>
      </I18nProvider>
    </ThemeSystemProvider>
  </RuntimeAPIContext.Provider>
);

let container: HTMLDivElement;
let root: Root;

const mount = async () => {
  localStorage.removeItem('openchamber.chatDrafts.v2');
  useDirectoryStore.setState({ currentDirectory: '/workspace' });
  useSessionUIStore.setState({ currentSessionId: SESSION_ID, currentSessionDirectory: '/workspace', newSessionDraft: { ...useSessionUIStore.getState().newSessionDraft, open: false } });
  useBtwStore.getState().clearPanelState(SESSION_ID);
  useAuthSessionStore.setState({ state: 'ok' });
  useConfigStore.setState({ currentProviderId: 'fixture', currentModelId: 'fixture-model' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const { useCommandsStore } = await import('@/stores/useCommandsStore');
  // Admission drops a selection whose record is not in the global index, so a
  // mounted session must exist there and own its directory.
  const { useGlobalSessionsStore } = await import('@/stores/useGlobalSessionsStore');
  const { registerWorkspaceDirectory } = await import('@/stores/globalSessions');
  registerWorkspaceDirectory('workspace-fixture', '/workspace');
  useGlobalSessionsStore.getState().upsertSession({
    sessionId: SESSION_ID, projectId: 'project-fixture', workspaceId: 'workspace-fixture', displayPath: '.',
    rootSessionId: SESSION_ID, createdAt: 1, updatedAt: 1, epoch: 'epoch-1', headSequence: '0', runtimeStatus: 'idle',
    activeRunId: null, mode: { kind: 'main' }, metadata: null, metadataRevision: '0', archiveRevision: '0',
  });
  useCommandsStore.setState({ catalogsByDirectory: { '/workspace': { workspaceId: 'workspace', revision: '1', commands: [], builtinCommands: ['compact'] } }, commandsByDirectory: { '/workspace': [] } });
  // The catalog is authoritative here; a catalog reload would hit the network.
  spyOn(useCommandsStore.getState(), 'loadCommands').mockResolvedValue(true);
  await act(async () => { root.render(wrap(<ChatInput />)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  // Session admission can clear the route selection before discovery lands;
  // once mounted the composer must be bound to the session this test drives.
  // Admission reconciles against global discovery, which resolves late here.
  // Bind once it settles and verify the composer actually took the selection.
  for (let attempt = 0; attempt < 60 && useSessionUIStore.getState().currentSessionId !== SESSION_ID; attempt += 1) {
    await act(async () => {
      useSessionUIStore.setState({ currentSessionId: SESSION_ID, currentSessionDirectory: '/workspace' });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  if (useSessionUIStore.getState().currentSessionId !== SESSION_ID) throw new Error('The composer session never bound');
  const content = container.querySelector<HTMLElement>('.cm-content');
  const view = content ? EditorView.findFromDOM(content) : null;
  if (!view) throw new Error('The composer editor did not mount');
  return view;
};

const typeAndSubmit = async (view: { dispatch: (transactions: { changes: { from: number; to: number; insert: string }; userEvent: string }) => void; state: { doc: { length: number } } }, text: string) => {
  await act(async () => { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input.type' }); });
  const form = container.querySelector('form');
  if (!form) throw new Error('Expected composer form');

  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const settled = Promise.withResolvers<void>();
    setTimeout(settled.resolve, 800);
    await settled.promise;
  });
};

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useBtwStore.getState().clearPanelState(SESSION_ID);
});
afterAll(() => { browser.close(); });

beforeAll(() => {
  // The composer only offers the command once auth and a model are live.
  useAuthSessionStore.setState({ state: 'ok' });
});

test('/btw <question> activates the panel and clears the main composer instead of sending a run', async () => {
  const view = await mount();
  const askBtw = spyOn(canonicalClient, 'askBtw').mockResolvedValue({ recordId: 'btw-record' });
  const createRun = spyOn(canonicalClient, 'createRun').mockResolvedValue({ run: { runId: 'run-a', sessionId: SESSION_ID, status: 'running', origin: 'host', createdAt: 1 } });
  try {
    await typeAndSubmit(view, '/btw what is 2+2?');
    // Pre-fix the branch returned before touching the panel store: the text
    // vanished, nothing mounted, and no btw request was made.
    expect(container.querySelector('[aria-label="btw"]')).not.toBeNull();
    expect(askBtw).toHaveBeenCalledTimes(1);
    expect(askBtw.mock.calls[0]?.[0]).toBe(SESSION_ID);
    expect(askBtw.mock.calls[0]?.[1]).toBe('what is 2+2?');
    expect(createRun).not.toHaveBeenCalled();
    expect(view.state.doc.length).toBe(0);
    expect(useBtwStore.getState().byParent[SESSION_ID]?.ephemeralRecordId).toBe('btw-record');
  } finally {
    askBtw.mockRestore();
    createRun.mockRestore();
  }
});

test('bare /btw enters pending mode and the next submit asks the btw route', async () => {
  const view = await mount();
  const askBtw = spyOn(canonicalClient, 'askBtw').mockResolvedValue({ recordId: 'btw-record-2' });
  const createRun = spyOn(canonicalClient, 'createRun').mockResolvedValue({ run: { runId: 'run-b', sessionId: SESSION_ID, status: 'running', origin: 'host', createdAt: 1 } });
  try {
    await typeAndSubmit(view, '/btw');
    expect(askBtw).not.toHaveBeenCalled();
    expect(createRun).not.toHaveBeenCalled();
    expect(useBtwStore.getState().byParent[SESSION_ID]?.pending).toBe(true);
    expect(container.querySelector('[aria-label="btw"]')).not.toBeNull();
    await typeAndSubmit(view, 'why is the sky blue?');
    expect(askBtw).toHaveBeenCalledTimes(1);
    expect(askBtw.mock.calls[0]?.[1]).toBe('why is the sky blue?');
    expect(createRun).not.toHaveBeenCalled();
  } finally {
    askBtw.mockRestore();
    createRun.mockRestore();
  }
});

test('compacting a too-small session is an informational notice, not a failure', async () => {
  const view = await mount();
  const tooSmall = new CanonicalApiError({
    type: 'urn:ohpichamber:problem:SESSION_TOO_SMALL', title: 'Session too small', status: 422,
    detail: 'Nothing to compact (session too small)', code: 'SESSION_TOO_SMALL', retryable: false,
  });
  const compact = spyOn(canonicalClient, 'compactSession').mockRejectedValue(tooSmall);
  const info = spyOn(toast, 'info').mockImplementation(() => 'notice');
  const error = spyOn(toast, 'error').mockImplementation(() => 'failure');
  try {
    await typeAndSubmit(view, '/compact');
    expect(compact).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  } finally {
    compact.mockRestore();
    info.mockRestore();
    error.mockRestore();
  }
});
