import { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

// B-1: the Git tab on a folder outside a repository shows the shared
// not-a-repository state. It must not ask the binding route, which answers 422
// there and logs a console error on every open.
test('the Git tab on a non-repository directory asks no repository binding', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals = {
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, Node: dom.Node,
    customElements: dom.customElements, CSSStyleSheet: dom.CSSStyleSheet,
    Event: dom.Event, CustomEvent: dom.CustomEvent, KeyboardEvent: dom.KeyboardEvent, MouseEvent: dom.MouseEvent,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    paths.push(url.pathname);
    // Git's own answer for the managed chats folder: not a repository, and
    // nothing under it to discover.
    if (url.pathname === '/api/git/projects') {
      return Response.json({ projects: [{ directory: '/chats', isGitRepository: false, status: null }] });
    }
    if (url.pathname === '/api/fs/git-dirs') return Response.json({ repositories: [] });
    // Everything the gated binding would ask stays unanswered, and the
    // assertion below says it was never asked.
    return new Promise<Response>(() => { });
  }, originalFetch);
  // DOM globals must exist before React and Base UI evaluate, so these test
  // modules load after the happy-dom installation above rather than statically.
  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { CanonicalClient } = await import('@/api/canonicalClient');
  const { SyncProvider } = await import('@/sync/sync-context');
  const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
  const client = new CanonicalClient();
  const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
  const { createWebAPIs } = await import('../../../../web/src/api/index');
  const { GitView } = await import('./GitView');
  useDirectoryStore.setState({ currentDirectory: '/chats' });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<SyncProvider client={client} directory="/chats"><I18nProvider><RuntimeAPIContext.Provider value={createWebAPIs()}>
        <GitView isActive />
      </RuntimeAPIContext.Provider></I18nProvider></SyncProvider>);
    });
    // The repository check is batched on a timer; let it and discovery land.
    for (let round = 0; round < 4; round += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(paths).not.toContain('/api/source-control/binding');
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await dom.happyDOM.abort();
    for (const [name, value] of originals) {
      if (value) Object.defineProperty(globalThis, name, value);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}, 30_000);
