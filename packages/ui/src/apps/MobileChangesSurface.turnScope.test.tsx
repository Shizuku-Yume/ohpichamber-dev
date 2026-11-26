import { act } from 'react';
import { afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { TurnDiffSchema, type TurnDiff, type TurnDiffFile } from '@openchamber/agent-contract';
import type { GitStatus } from '@/lib/api/types';
import { clearCanonicalTurnDiffCache } from '@/hooks/useCanonicalTurnDiff';

const SESSION = 'ses_mobile_turn';
const PINNED_SESSION = 'ses_mobile_pinned';
const TURN = 'turn_latest';
const PINNED_TURN = 'turn_historical';

const fileRow = (overrides: Partial<TurnDiffFile> = {}): TurnDiffFile => ({
  path: 'src/a.ts',
  status: 'modified',
  before: 'const value = 1;\n',
  after: 'const value = 2;\n',
  patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-const value = 1;\n+const value = 2;\n',
  additions: 1,
  deletions: 1,
  provenance: [{ tool: 'edit', agent: 'session', at: 1000 }],
  truncated: false,
  incomplete: false,
  ...overrides,
});

const turnDiffPayload = (sessionId: string, turnId: string, overrides: Partial<TurnDiff> = {}): TurnDiff => TurnDiffSchema.parse({
  sessionId,
  turnId,
  state: 'ready',
  files: [fileRow()],
  ...overrides,
});

type Harness = {
  container: HTMLElement;
  requests: URL[];
  turnDiffRequests: URL[];
  render: () => Promise<void>;
  setInitialDiff: (diff: { path: string; staged: boolean; scope?: 'turn'; turnId?: string; sessionId?: string | null; directory?: string | null } | null) => void;
  cleanup: () => Promise<void>;
  click: (selector: string) => Promise<void>;
};

const boot = async ({
  turnDiffs,
  sessionId = SESSION,
}: {
  turnDiffs: Map<string, TurnDiff>;
  sessionId?: string | null;
}): Promise<Harness> => {
  const dom = new Window({ url: 'http://localhost' });
  dom.happyDOM.setWindowSize({ width: 390, height: 844 });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals = {
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, Node: dom.Node,
    HTMLTextAreaElement: dom.HTMLTextAreaElement, HTMLDivElement: dom.HTMLDivElement, HTMLButtonElement: dom.HTMLButtonElement, HTMLSpanElement: dom.HTMLSpanElement, SVGElement: dom.SVGElement,
    Document: dom.Document, DocumentFragment: dom.DocumentFragment, ShadowRoot: dom.ShadowRoot,
    customElements: dom.customElements, CSSStyleSheet: dom.CSSStyleSheet,
    Event: dom.Event, CustomEvent: dom.CustomEvent, KeyboardEvent: dom.KeyboardEvent, MouseEvent: dom.MouseEvent,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver, IntersectionObserver: dom.IntersectionObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  clearCanonicalTurnDiffCache();
  const status: GitStatus = { current: 'feature', tracking: null, ahead: 0, behind: 0, files: [], isClean: true, diffStats: { staged: {}, working: {} } };
  const requests: URL[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    if (url.pathname === '/api/fs/home' || url.pathname === '/api/session-folders') return new Promise<Response>(() => { });
    const turnDiffMatch = /^\/api\/agent\/v1\/sessions\/([^/]+)\/turns\/([^/]+)\/diff$/.exec(url.pathname);
    if (turnDiffMatch) {
      requests.push(url);
      const payload = turnDiffs.get(`${turnDiffMatch[1]}/${turnDiffMatch[2]}`);
      if (!payload) return Response.json({ type: 'about:blank', title: 'not found', status: 404, detail: 'missing', code: 'SESSION_NOT_FOUND' }, { status: 404 });
      return Response.json(payload);
    }
    if (url.pathname.startsWith('/api/agent/v1/')) return new Promise<Response>(() => { });
    requests.push(url);
    switch (url.pathname) {
      case '/api/git/remotes': return Response.json([]);
      case '/api/git/remote-url': return Response.json({ url: null });
      case '/api/git/projects': return Response.json({ projects: [{ directory: '/repo', isGitRepository: true }] });
      case '/api/git/status': return Response.json(status);
      case '/api/git/branches': return Response.json({ all: ['feature', 'main'], current: 'feature', branches: {}, defaultBranches: { origin: 'main' } });
      case '/api/git/identities': return Response.json([]);
      case '/api/git/global-identity': return Response.json(null);
      case '/api/git/branch-base': return Response.json({ base: null });
      case '/api/git/file-diff': return Response.json({ path: url.searchParams.get('path'), original: '', modified: '', isBinary: true });
      case '/api/source-control/binding': return Response.json({ status: 'unbound' });
      default: return new Promise<Response>(() => { });
    }
  }, originalFetch);

  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { CanonicalClient } = await import('@/api/canonicalClient');
  const { SyncProvider } = await import('@/sync/sync-context');
  const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
  const { createWebAPIs } = await import('../../../web/src/api/index');
  const { useGitStore } = await import('@/stores/useGitStore');
  const { useSessionUIStore } = await import('@/sync/session-ui-store');
  const { MobileChangesPane } = await import('./MobileChangesSurface');
  const apis = createWebAPIs();
  const client = new CanonicalClient();
  useGitStore.getState().setActiveDirectory('/repo');
  const previous = useGitStore.getState().getDirectoryState('/repo');
  if (!previous) throw new Error('Missing repository state');
  const now = Date.now();
  const directories = new Map(useGitStore.getState().directories);
  directories.set('/repo', {
    ...previous, status, isGitRepo: true,
    branches: { all: ['feature', 'main'], current: 'feature', branches: {}, defaultBranches: { origin: 'main' } },
    log: { all: [], latest: null, total: 0 }, identity: { userName: 'Test Author', userEmail: 'test@example.com' },
    lastStatusFetch: now, lastBranchesFetch: now, lastLogFetch: now, lastIdentityFetch: now, lastRepoCheckAt: now,
  });
  useGitStore.setState({ directories });
  const initialSessionUI = useSessionUIStore.getState();
  useSessionUIStore.setState({ currentSessionId: sessionId, currentSessionDirectory: '/repo' });

  let initialDiff: { path: string; staged: boolean; scope?: 'turn'; turnId?: string; sessionId?: string | null; directory?: string | null } | null = null;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = () => act(async () => {
    root.render(<SyncProvider client={client} directory="/repo"><I18nProvider><RuntimeAPIContext.Provider value={apis}>
      <MobileChangesPane rootDirectory="/repo"
        repository={{ rootIsGitRepo: true, gitDirectory: '/repo', nestedRepos: null, nestedRepoSelection: null, repositoryOptions: null, repositoriesKnown: true, unreadable: null }}
        visible initialDiff={initialDiff} />
    </RuntimeAPIContext.Provider></I18nProvider></SyncProvider>);
  });
  const settle = async () => {
    for (let round = 0; round < 12; round += 1) await act(async () => { await Promise.resolve(); });
  };
  const harness: Harness = {
    container,
    requests,
    turnDiffRequests: [],
    render: async () => { await render(); await settle(); },
    setInitialDiff: (diff) => { initialDiff = diff; },
    click: async (selector: string) => {
      const element = container.querySelector<HTMLElement>(selector) ?? document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      await act(async () => { element.click(); });
      await settle();
    },
    cleanup: async () => {
      await act(async () => root.unmount());
      useSessionUIStore.setState(initialSessionUI);
      globalThis.fetch = originalFetch;
      await dom.happyDOM.abort();
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
  Object.defineProperty(harness, 'turnDiffRequests', {
    get: () => requests.filter((url) => /\/turns\/[^/]+\/diff$/.test(url.pathname)),
  });
  return harness;
};

afterEach(() => {
  clearCanonicalTurnDiffCache();
});

test('a turn-scoped initial diff opens the turn file detail, never the working-tree diff', async () => {
  const harness = await boot({
    turnDiffs: new Map([[`${SESSION}/${TURN}`, turnDiffPayload(SESSION, TURN)]]),
  });
  try {
    harness.setInitialDiff({ path: 'src/a.ts', staged: false, scope: 'turn', turnId: TURN, sessionId: SESSION, directory: '/repo' });
    await harness.render();
    expect(harness.container.querySelector('h2')?.textContent).toBe('a.ts');
    expect(harness.container.textContent).toContain('Changed files');
    expect(harness.turnDiffRequests.map((url) => url.pathname)).toEqual([`/api/agent/v1/sessions/${SESSION}/turns/${TURN}/diff`]);
    expect(harness.requests.filter((url) => url.pathname === '/api/git/file-diff')).toEqual([]);
  } finally {
    await harness.cleanup();
  }
}, 30_000);

test('a pill on a historical turn of another session diffs that turn of that session', async () => {
  const harness = await boot({
    turnDiffs: new Map([
      [`${PINNED_SESSION}/${PINNED_TURN}`, turnDiffPayload(PINNED_SESSION, PINNED_TURN, { files: [fileRow({ path: 'src/historical.ts' })] })],
    ]),
  });
  try {
    harness.setInitialDiff({ path: 'src/historical.ts', staged: false, scope: 'turn', turnId: PINNED_TURN, sessionId: PINNED_SESSION, directory: '/repo' });
    await harness.render();
    expect(harness.turnDiffRequests.map((url) => url.pathname)).toEqual([`/api/agent/v1/sessions/${PINNED_SESSION}/turns/${PINNED_TURN}/diff`]);
    expect(harness.container.querySelector('h2')?.textContent).toBe('historical.ts');
  } finally {
    await harness.cleanup();
  }
}, 30_000);

test('a pinned turn file absent from the turn rows keeps the turn scope list instead of the working diff', async () => {
  const harness = await boot({
    turnDiffs: new Map([[`${SESSION}/${TURN}`, turnDiffPayload(SESSION, TURN, { files: [fileRow({ path: 'src/other.ts' })] })]]),
  });
  try {
    harness.setInitialDiff({ path: 'src/missing.ts', staged: false, scope: 'turn', turnId: TURN, sessionId: SESSION, directory: '/repo' });
    await harness.render();
    expect(harness.container.querySelector('h2')).toBeNull();
    expect(harness.container.querySelector('[aria-label="Select change mode"]')?.textContent).toBe('Changed files');
    expect(harness.container.querySelector('[title="src/other.ts"]')).not.toBeNull();
    expect(harness.requests.filter((url) => url.pathname === '/api/git/file-diff')).toEqual([]);
  } finally {
    await harness.cleanup();
  }
}, 30_000);

test('an unsupported pinned turn shows the explicit state and never the working diff', async () => {
  const harness = await boot({
    turnDiffs: new Map([[`${SESSION}/${TURN}`, turnDiffPayload(SESSION, TURN, { state: 'unsupported', files: [] })]]),
  });
  try {
    harness.setInitialDiff({ path: 'src/a.ts', staged: false, scope: 'turn', turnId: TURN, sessionId: SESSION, directory: '/repo' });
    await harness.render();
    expect(harness.container.textContent).toContain("Changes for this turn weren't recorded");
    expect(harness.container.querySelector('h2')).toBeNull();
    expect(harness.requests.filter((url) => url.pathname === '/api/git/file-diff')).toEqual([]);
  } finally {
    await harness.cleanup();
  }
}, 30_000);

test('the turn detail passes the rename previous path and shows the incomplete notice', async () => {
  const harness = await boot({
    turnDiffs: new Map([
      [`${SESSION}/${TURN}`, turnDiffPayload(SESSION, TURN, {
        files: [
          fileRow({ path: 'src/new.ts', status: 'renamed', previousPath: 'src/old.ts' }),
          fileRow({ path: 'src/broken.ts', before: undefined, after: undefined, patch: undefined, additions: 0, deletions: 0, incomplete: true }),
        ],
      })],
    ]),
  });
  try {
    harness.setInitialDiff({ path: 'src/new.ts', staged: false, scope: 'turn', turnId: TURN, sessionId: SESSION, directory: '/repo' });
    await harness.render();
    expect(harness.container.textContent).toContain('src/old.ts → src');
    expect(harness.container.textContent).toContain("Some file contents couldn't be reconstructed");
  } finally {
    await harness.cleanup();
  }
}, 30_000);

test('the incomplete notice also shows on the turn file list', async () => {
  const harness = await boot({
    turnDiffs: new Map([
      [`${SESSION}/${TURN}`, turnDiffPayload(SESSION, TURN, {
        files: [fileRow({ path: 'src/broken.ts', before: undefined, after: undefined, patch: undefined, additions: 0, deletions: 0, incomplete: true })],
      })],
    ]),
  });
  try {
    harness.setInitialDiff({ path: 'src/absent.ts', staged: false, scope: 'turn', turnId: TURN, sessionId: SESSION, directory: '/repo' });
    await harness.render();
    expect(harness.container.textContent).toContain("Some file contents couldn't be reconstructed");
    expect(harness.container.querySelector('[title="src/broken.ts"]')).not.toBeNull();
  } finally {
    await harness.cleanup();
  }
}, 30_000);
