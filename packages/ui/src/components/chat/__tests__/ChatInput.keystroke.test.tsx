import { afterAll, expect, spyOn, test } from 'bun:test';
import { plugin } from 'bun';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import type { RuntimeAPIs } from '@/lib/api/types';
<<<<<<< HEAD
import type { ReactNode } from 'react';
=======
import type { Session } from '@/lib/opencode/model';
import type { EditorView as CodeMirrorView } from '@codemirror/view';
import type { Root } from 'react-dom/client';
>>>>>>> bc50ba56a

/**
 * Counts which components render per keystroke without instrumenting them.
 *
 * React reports every commit to the DevTools hook. The walk mirrors React
 * DevTools' own render detection: a subtree whose child pointer is unchanged
 * was skipped entirely, and a component fiber carrying the PerformedWork flag
 * actually ran its render function in this commit (a memo bailout does not).
 */
type ComponentFunction = { name: string };
type CommitFiber = {
  tag: number;
  // Read only for component tags: the function itself (0, 15), a forwardRef
  // object with `render` (11), or a memo object with `type` (14).
  type: (ComponentFunction & { type?: ComponentFunction; render?: ComponentFunction }) | null;
  flags: number;
  child: CommitFiber | null;
  sibling: CommitFiber | null;
  alternate: CommitFiber | null;
};

const FUNCTION_COMPONENT = 0;
const FORWARD_REF = 11;
const MEMO_COMPONENT = 14;
const SIMPLE_MEMO_COMPONENT = 15;
const COMPONENT_TAGS = new Set([FUNCTION_COMPONENT, FORWARD_REF, MEMO_COMPONENT, SIMPLE_MEMO_COMPONENT]);
const PERFORMED_WORK = 1;

const renderedByName = new Map<string, number>();
let counting = false;

const fiberName = (fiber: CommitFiber): string => {
  if (fiber.tag === FORWARD_REF) return fiber.type?.render?.name ?? '';
  if (fiber.tag === MEMO_COMPONENT) return fiber.type?.type?.name ?? '';
  return fiber.type?.name ?? '';
};

const walk = (fiber: CommitFiber | null, mounted: boolean): void => {
  for (let node = fiber; node; node = node.sibling) {
    const isMount = mounted || node.alternate === null;
    const didRender = isMount || (node.flags & PERFORMED_WORK) === PERFORMED_WORK;
    if (didRender && COMPONENT_TAGS.has(node.tag)) {
      const name = fiberName(node);
      if (name) renderedByName.set(name, (renderedByName.get(name) ?? 0) + 1);
    }
    if (isMount || node.child !== node.alternate?.child) {
      walk(node.child, isMount);
    }
  }
};

Object.assign(globalThis, {
  __REACT_DEVTOOLS_GLOBAL_HOOK__: {
    isDisabled: false,
    supportsFiber: true,
    renderers: new Map(),
    inject: () => 1,
    onScheduleFiberRoot: () => undefined,
    onCommitFiberRoot: (_id: number, root: { current: CommitFiber }) => {
      if (!counting) return;
      const current = root.current;
      walk(current.child, current.alternate === null);
    },
    onCommitFiberUnmount: () => undefined,
    onPostCommitFiberRoot: () => undefined,
    checkDCE: () => undefined,
  },
});

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

// Nothing typed here reaches a server; settings retain the admitted project.
spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const path = new URL(input instanceof Request ? input.url : input.toString(), 'http://localhost/').pathname;
  if (path === '/api/config/settings') return Response.json({ projects: [{ id: 'project', path: '/workspace' }] });
  if (path.endsWith('/location')) {
    return Response.json({ directory: '/workspace', project: { id: 'project', directory: '/workspace', canonical: '/workspace' } });
  }
  if (path.endsWith('/session')) return Response.json({ data: [] });
  if (path.endsWith('/config')) return Response.json([]);
  // The project registry is instance settings: without it the session is
  // not admitted, so the composer has no session and shows no builtins.
  if (path === '/api/config/settings') return Response.json({ projects: [{ path: '/workspace', label: 'Workspace' }], activeProjectId: 'path_L3dvcmtzcGFjZQ' });
  return Response.json({});
});

// Vite-only module forms the composer's import graph reaches.
plugin({
  name: 'composer-keystroke-vite-modules',
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

const { act, Profiler } = await import('react');
const { createRoot } = await import('react-dom/client');
const { EditorView } = await import('@codemirror/view');
const { setLanguageContext } = await import('../composer/editor/composerLanguage');
const { I18nProvider } = await import('@/lib/i18n');
const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
const { ChatInput } = await import('../ChatInput');
const { SyncProvider } = await import('@/sync/sync-context');
<<<<<<< HEAD
const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
=======
const { useDirectoryStore, ensureHomeDirectoryResolved } = await import('@/stores/useDirectoryStore');
const { updateDesktopSettings } = await import('@/lib/persistence');
const { getSyncChildStores } = await import('@/sync/sync-refs');
const { OpenCode } = await import('@opencode/client');

const sdk = OpenCode.make({
  baseUrl: 'https://sync.test',
  fetch: async (request) => {
    const path = new URL(request instanceof Request ? request.url : request.toString()).pathname;
    if (path.endsWith('/event')) {
      return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } });
    }
    const body = path.endsWith('/location')
      ? { directory: '/workspace', project: { id: 'project', directory: '/workspace', canonical: '/workspace' } }
      : path.endsWith('/session/active') ? {}
      : { data: [] };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  },
});
>>>>>>> bc50ba56a

// SAFETY: Mounting and typing read only the runtime descriptor and the
// source-control object's identity; no runtime API method is invoked.
const runtimeAPIs = { runtime: { platform: 'web', isDesktop: false }, sourceControl: {} } as RuntimeAPIs;

const { useSessionUIStore } = await import('@/sync/session-ui-store');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
useProjectsStore.setState({ projects: [{ id: 'project', path: '/workspace' }] });
const { dispatchPromptHistorySearch } = await import('../composer/state/promptHistorySearchRoute');
const { createInputHistoryIdentity, useInputHistoryStore } = await import('@/stores/useInputHistoryStore');
const { getRuntimeKey } = await import('@/lib/runtime-switch');

// Stands in for the window keydown listener that useKeyboardShortcuts installs
// for search_prompt_history: the combo match is the dispatcher's job, and the
// route it hands the event to is the real one the composer registers.
window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'ArrowUp' && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    dispatchPromptHistorySearch(event);
  }
});

const KEYSTROKES = 20;

type TypingCost = {
  commits: number;
  renderMs: number;
  componentRenders: number;
  languageContextUpdates: number;
  rendersByComponent: Map<string, number>;
};

/** Mounts a fresh composer, types KEYSTROKES characters, and reports the per-keystroke cost. */
const measureTyping = async (scenario: 'session' | 'draft'): Promise<TypingCost> => {
  // Both scenarios share one process: text persisted by the previous one
  // would be restored into this composer and measured as typing.
  localStorage.removeItem('openchamber.chatDrafts.v2');
  useDirectoryStore.setState({ currentDirectory: '/workspace' });
  useSessionUIStore.setState(scenario === 'session'
    ? { currentSessionId: 'ses_typing', currentSessionDirectory: '/workspace' }
    : {
        currentSessionId: null,
        currentSessionDirectory: null,
        newSessionDraft: { ...useSessionUIStore.getState().newSessionDraft, open: true, target: 'project', directoryOverride: '/workspace' },
      });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let commits = 0;
  let renderMs = 0;
  try {
    await act(async () => {
      root.render(
        <RuntimeAPIContext.Provider value={runtimeAPIs}>
          <ThemeSystemProvider>
            <I18nProvider>
              <SyncProvider directory="/workspace">
                <Profiler id="composer" onRender={(_id, _phase, actual) => { commits += 1; renderMs += actual; }}>
                  <ChatInput />
                </Profiler>
              </SyncProvider>
            </I18nProvider>
          </ThemeSystemProvider>
        </RuntimeAPIContext.Provider>,
      );
    });
<<<<<<< HEAD
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    // The project registry arrives with the settings sync, and a session is
    // only shown once its folder is admitted: let it install before typing so
    // the run measures keystrokes, not bootstrap.
    const { useProjectsStore } = await import('@/stores/useProjectsStore');
    for (let index = 0; index < 50 && useProjectsStore.getState().projects.length === 0; index += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
=======
    await act(async () => {
      // Home discovery queues a settings echo that can otherwise land during typing.
      await ensureHomeDirectoryResolved();
      await updateDesktopSettings({});
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
>>>>>>> bc50ba56a

    const content = container.querySelector<HTMLElement>('.cm-content');
    const view = content ? EditorView.findFromDOM(content) : null;
    if (!view) throw new Error('The composer editor did not mount');

    let languageContextUpdates = 0;
    const update = view.update.bind(view);
    view.update = (transactions) => {
      if (transactions.some((transaction) => transaction.effects.some((effect) => effect.is(setLanguageContext)))) {
        languageContextUpdates += 1;
      }
      update(transactions);
    };

    commits = 0;
    renderMs = 0;
    renderedByName.clear();
    counting = true;
    for (let index = 0; index < KEYSTROKES; index += 1) {
      await act(async () => {
        view.dispatch({ changes: { from: view.state.doc.length, insert: 'a' }, userEvent: 'input.type' });
      });
    }
    counting = false;
    // The instrument has to have fired: every keystroke reaches the editor.
    expect(view.state.doc.length).toBe(KEYSTROKES);
    const componentRenders = [...renderedByName.values()].reduce((sum, count) => sum + count, 0);
    const cost: TypingCost = {
      commits: commits / KEYSTROKES,
      renderMs: renderMs / KEYSTROKES,
      componentRenders: componentRenders / KEYSTROKES,
      languageContextUpdates,
      rendersByComponent: new Map(renderedByName),
    };
    console.log(`[${scenario}] commits/keystroke=${cost.commits} renderMs/keystroke=${cost.renderMs.toFixed(2)} componentRenders/keystroke=${cost.componentRenders} languageContextUpdates=${languageContextUpdates}`);
    console.log([...renderedByName.entries()].map(([name, count]) => `${name}:${count / KEYSTROKES}`).sort().join(' '));
    return cost;
  } finally {
    counting = false;
    await act(async () => root.unmount());
    container.remove();
  }
};

afterAll(() => {
  browser.close();
});

/**
 * Children of the composer that do not depend on the draft text. Each may
 * render once over the run, on the first keystroke, when the composer turns
 * from empty to sendable; never on every keystroke.
 *
 * Before this guard (same scenario, 20 keystrokes): an existing session
 * rendered 23 components and re-tokenized the editor's language context on
 * every keystroke; a new-session draft rendered 52 components per keystroke.
 */
const TEXT_INDEPENDENT_CHILDREN = [
  'ComposerFooterView',
  'ComposerAutocompletePopupsView',
  'PermissionDockView',
  'FormDockView',
  'BtwPanelView',
  'DraftTargetSelectorsView',
  'DraftPresetChipsView',
  'ReviewFlowDialogView',
  'QueuedMessagesStrip',
  'ComposerDictation',
  'ComposerModeSelector',
];

const expectOnlyTheEditorFollowsTheText = (cost: TypingCost) => {
  expect(cost.rendersByComponent.get('ChatInputComponent')).toBe(KEYSTROKES);
  expect(cost.languageContextUpdates).toBe(0);
  for (const name of TEXT_INDEPENDENT_CHILDREN) {
    // Paired with the name so a failure says which child followed the text.
    const renders = cost.rendersByComponent.get(name) ?? 0;
    expect([name, renders]).toEqual([name, Math.min(renders, 1)]);
  }
};

test('typing in an existing session re-renders only the composer shell and its editor', async () => {
  expectOnlyTheEditorFollowsTheText(await measureTyping('session'));
});

test('typing in a new-session draft re-renders only the composer shell and its editor', async () => {
  expectOnlyTheEditorFollowsTheText(await measureTyping('draft'));
});

test('worker catalog builtins appear without disk templates and context output is a notice', async () => {
  // These imports must follow the DOM and Vite-module bootstrap above, just
  // like ChatInput: static loading initializes browser-only dependencies too early.
  const { CommandAutocomplete } = await import('../CommandAutocomplete');
  const { useCommandsStore } = await import('@/stores/useCommandsStore');
  const { canonicalClient } = await import('@/api/canonicalClient');
  const { toast } = await import('@/components/ui');
  const { useAuthSessionStore } = await import('@/lib/runtime-auth-expiry');
  const { useConfigStore } = await import('@/stores/useConfigStore');
  const { useSnippetsStore } = await import('@/stores/useSnippetsStore');
  const builtinCommands = ['compact', 'shake', 'todo', 'jobs', 'usage', 'context', 'tools'];
  useDirectoryStore.setState({ currentDirectory: '/workspace' });
  useSessionUIStore.setState({ currentSessionId: 'ses_slash', currentSessionDirectory: '/workspace', newSessionDraft: { ...useSessionUIStore.getState().newSessionDraft, open: false } });
  const deployCommand = { commandId: 'cmd-deploy', name: 'deploy', description: 'Deploy application', content: 'Deploy $1', scope: 'workspace' as const, source: '(project)', editable: true };
  useCommandsStore.setState({ catalogsByDirectory: { '/workspace': { workspaceId: 'workspace', revision: '1', commands: [deployCommand], builtinCommands } }, commandsByDirectory: { '/workspace': [deployCommand] } });
  useSnippetsStore.setState({ catalogsByDirectory: new Map([['/workspace', { workspaceId: 'workspace', revision: '1', templates: [{ templateId: 'template-deploy', name: 'deploy', description: 'Deploy application', content: 'Deploy $1', scope: 'workspace', source: '(project)', editable: true }] }]]) });
  const loadTemplates = spyOn(useSnippetsStore.getState(), 'loadSnippets').mockResolvedValue(true);
  const load = spyOn(useCommandsStore.getState(), 'loadCommands').mockResolvedValue(true);
  const run = spyOn(canonicalClient, 'runBuiltinCommand').mockResolvedValue({ type: 'command', output: 'Context window: 65536 tokens' });
  const compact = spyOn(canonicalClient, 'compactSession').mockResolvedValue({ type: 'compact', compactionId: 'compact-proof', tokensBefore: 1, completedAt: 1 });
  const notice = spyOn(toast, 'info').mockImplementation(() => 'notice');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const wrap = (content: ReactNode) => <RuntimeAPIContext.Provider value={runtimeAPIs}><ThemeSystemProvider><I18nProvider><SyncProvider directory="/workspace">{content}</SyncProvider></I18nProvider></ThemeSystemProvider></RuntimeAPIContext.Provider>;
  try {
    await act(async () => root.render(wrap(<CommandAutocomplete searchQuery="" onCommandSelect={() => {}} onClose={() => {}} />)));
    // The row's name span is its `font-medium` child, inside the scroll list.
    const names = [...container.querySelectorAll('[data-slot="scrollable-overlay"] .font-medium, .overlay-scrollbar-target .font-medium')]
      .map(item => item.textContent?.replace(/^\//, ''));
    expect(names.filter(name => builtinCommands.includes(name ?? ''))).toEqual([...builtinCommands].sort());
    expect(names).not.toContain('ssh');
    expect(names).toContain('deploy');
    useAuthSessionStore.setState({ state: 'ok' });
    useConfigStore.setState({ currentProviderId: 'fixture', currentModelId: 'fixture-model' });
    await act(async () => root.render(wrap(<ChatInput />)));
    const content = container.querySelector<HTMLElement>('.cm-content');
    const view = content ? EditorView.findFromDOM(content) : null;
    if (!view) throw new Error('Expected composer editor');
    const catalogReady = Promise.withResolvers<boolean>();
    load.mockImplementation(() => catalogReady.promise);
    await act(async () => useCommandsStore.setState({ catalogsByDirectory: {} }));
    await act(async () => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '/context' }, userEvent: 'input.type' }));
    const form = container.querySelector('form');
    if (!form) throw new Error('Expected composer form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const settled = Promise.withResolvers<void>();
      setTimeout(settled.resolve, 50);
      await settled.promise;
    });
    expect(run).not.toHaveBeenCalled();
    await act(async () => {
      useCommandsStore.setState({ catalogsByDirectory: { '/workspace': { workspaceId: 'workspace', revision: '1', commands: [], builtinCommands } } });
      catalogReady.resolve(true);
      const settled = Promise.withResolvers<void>();
      setTimeout(settled.resolve, 50);
      await settled.promise;
    });
    expect(run).toHaveBeenCalledWith('ses_slash', '/context');
    expect(notice).toHaveBeenCalledWith('Context window: 65536 tokens');
    await act(async () => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '/compact focus' }, userEvent: 'input.type' }));
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const settled = Promise.withResolvers<void>();
      setTimeout(settled.resolve, 50);
      await settled.promise;
    });
    expect(compact).toHaveBeenCalledWith('ses_slash', 'focus');
    expect(run).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    load.mockRestore(); loadTemplates.mockRestore(); run.mockRestore(); compact.mockRestore(); notice.mockRestore();
  }
});

type MountedComposer = { container: HTMLDivElement; root: Root; view: CodeMirrorView };

const SEARCH_SESSION_ID = 'ses_prompt_history_search';

/** Mounts the composer on a fixed session and sets its draft text to `draftText`. */
const mountComposer = async (draftText: string): Promise<MountedComposer> => {
  useDirectoryStore.setState({ currentDirectory: '/workspace' });
  useSessionUIStore.setState({ currentSessionId: SEARCH_SESSION_ID, currentSessionDirectory: '/workspace' });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <RuntimeAPIContext.Provider value={runtimeAPIs}>
        <ThemeSystemProvider>
          <I18nProvider>
            <SyncProvider sdk={sdk} directory="/workspace">
              <ChatInput />
            </SyncProvider>
          </I18nProvider>
        </ThemeSystemProvider>
      </RuntimeAPIContext.Provider>,
    );
  });
  await flushFrames();
  const content = container.querySelector<HTMLElement>('.cm-content');
  const view = content ? EditorView.findFromDOM(content) : null;
  if (!view) throw new Error('The composer editor did not mount');
  await act(async () => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: draftText } });
  });
  return { container, root, view };
};

const unmountComposer = async (composer: MountedComposer) => {
  await act(async () => composer.root.unmount());
  composer.container.remove();
};

/** Lets pending animation frames and their scheduled focus work run. */
const flushFrames = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

const keyEvent = (key: string, init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });

const pressKey = async (target: Element, key: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    target.dispatchEvent(keyEvent(key, init));
  });
};

const openPromptHistorySearch = (composer: MountedComposer) => pressKey(composer.view.contentDOM, 'ArrowUp', { ctrlKey: true });

const searchInput = (composer: MountedComposer) => composer.container.querySelector<HTMLInputElement>('[data-prompt-history-search-input]');

/** Seeds the global bucket the composer reads for ordinary and searched recall; the newest entry is the last one. */
const seedGlobalHistory = (text: string) => {
  const identity = createInputHistoryIdentity(getRuntimeKey(), '/workspace', SEARCH_SESSION_ID);
  if (!identity) throw new Error('No input history identity for the test runtime');
  useInputHistoryStore.getState().applyScope('global');
  useInputHistoryStore.getState().appendSubmissions(identity, [{ text, attachmentKeys: [], restorableAttachments: [] }]);
};

test('Escape closes the history search and returns focus to the composer', async () => {
  const composer = await mountComposer('draft text');
  try {
    await openPromptHistorySearch(composer);
    const input = searchInput(composer);
    if (!input) throw new Error('The history search did not open');
    expect(document.activeElement === input).toBe(true);
    await pressKey(input, 'Escape');
    await flushFrames();
    expect(searchInput(composer) === null).toBe(true);
    expect(composer.view.hasFocus).toBe(true);
    expect(composer.view.state.doc.toString()).toBe('draft text');
  } finally {
    await unmountComposer(composer);
  }
});

test('reopening the history search before the closing focus frame runs keeps the new search focused', async () => {
  const composer = await mountComposer('draft text');
  try {
    await openPromptHistorySearch(composer);
    const first = searchInput(composer);
    if (!first) throw new Error('The history search did not open');
    // Synchronous act: both commits land before any timer, so the close's
    // deferred composer focus is still pending when the search reopens.
    act(() => { first.dispatchEvent(keyEvent('Escape')); });
    act(() => { composer.view.contentDOM.dispatchEvent(keyEvent('ArrowUp', { ctrlKey: true })); });
    const reopened = searchInput(composer);
    if (!reopened) throw new Error('The history search did not reopen');
    await flushFrames();
    // Identity checks, not toBe: a failing DOM-node diff prints the whole tree.
    expect(searchInput(composer) === reopened).toBe(true);
    expect(document.activeElement === reopened).toBe(true);
    expect(composer.view.state.doc.toString()).toBe('draft text');
  } finally {
    await unmountComposer(composer);
  }
});

test('reopening the history search after picking a prompt keeps the new search focused', async () => {
  seedGlobalHistory('older prompt');
  const composer = await mountComposer('');
  try {
    await openPromptHistorySearch(composer);
    const input = searchInput(composer);
    if (!input) throw new Error('The history search did not open');
    act(() => { input.dispatchEvent(keyEvent('Enter')); });
    expect(composer.view.state.doc.toString()).toBe('older prompt');
    // Reopen in the same synchronous turn as the pick, before its focus frame.
    act(() => { composer.view.contentDOM.dispatchEvent(keyEvent('ArrowUp', { ctrlKey: true })); });
    const reopened = searchInput(composer);
    if (!reopened) throw new Error('The history search did not reopen');
    await flushFrames();
    expect(searchInput(composer) === reopened).toBe(true);
    expect(document.activeElement === reopened).toBe(true);
    expect(composer.view.state.doc.toString()).toBe('older prompt');
  } finally {
    await unmountComposer(composer);
  }
});

test('a picked prompt with CRLF line breaks leaves the caret at the end of the editor text', async () => {
  seedGlobalHistory('first\r\nsecond');
  const composer = await mountComposer('');
  try {
    await openPromptHistorySearch(composer);
    const input = searchInput(composer);
    if (!input) throw new Error('The history search did not open');
    await pressKey(input, 'Enter');
    await flushFrames();
    const end = composer.view.state.doc.length;
    expect(composer.view.state.doc.toString()).toBe('first\nsecond');
    expect(composer.view.state.selection.main.head).toBe(end);
    expect(composer.view.state.selection.main.empty).toBe(true);
    expect(composer.view.hasFocus).toBe(true);
  } finally {
    await unmountComposer(composer);
  }
});
