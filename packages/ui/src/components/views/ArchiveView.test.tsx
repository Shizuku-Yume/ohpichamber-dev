import { afterAll, afterEach, beforeEach, expect, jest, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
const browser = new Window({ url: 'http://localhost' });
let root: Root;
const descriptors = new Map<string, PropertyDescriptor | undefined>();
// React DOM detects input-event support when imported, so install the DOM first.
for (const [key, value] of Object.entries({ window: browser, document: browser.document, Event: browser.Event, CustomEvent: browser.CustomEvent, navigator: browser.navigator, localStorage: browser.localStorage, Element: browser.Element, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true });
}
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useUIStore } = await import('@/stores/useUIStore');
const { useGlobalSessionsStore } = await import('@/stores/useGlobalSessionsStore');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
registeredSettings = () => ({ projects: useProjectsStore.getState().projects });
const { useGlobalSyncStore } = await import('@/sync/global-sync-store');
const { ArchiveSessionsView, ArchiveView } = await import('./ArchiveView');
const navigation = await import('@/lib/router/openSessionFromRoute');
const { useSessionUIStore } = await import('@/sync/session-ui-store');
const initialSessionUI = useSessionUIStore.getState();
const testRestorers: Array<() => void> = [];
const initialUI = useUIStore.getState();
const initialSessions = useGlobalSessionsStore.getState();
const session = (sessionId: string, title: string, archivedAt?: number): Session => ({
  sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: 'workspace', rootSessionId: sessionId,
  createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  ...(archivedAt === undefined ? {} : { archivedAt }),
  title: title, metadata: {}, metadataRevision: '1', archiveRevision: archivedAt === undefined ? '0' : '1',
});

beforeEach(() => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  useUIStore.setState({ isArchivePageOpen: true });
  registerWorkspaceDirectory('workspace', '/workspace');
});

afterEach(async () => {
  await act(async () => root.unmount());
  for (const restore of testRestorers.splice(0)) restore();
  useSessionUIStore.setState(initialSessionUI);
  useUIStore.setState(initialUI);
  useGlobalSessionsStore.setState(initialSessions);
  document.body.replaceChildren();
});

afterAll(async () => {
  await browser.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('archive search uses exact IDs and preserves title search and archive membership', async () => {
  const id = 'ses_f88b1a2b3c4d';
  useGlobalSessionsStore.setState({
    archivedSessions: [session(id, 'Release notes'), session('ses_f88b1a2b3c4e', id)],
    activeSessions: [session('ses_active', 'Active session')],
  });
  await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));
  const input = browser.document.querySelector('input');
  if (!input) throw new Error('Archive search input missing');
  const setValue = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('Input value setter missing');
  const search = async (query: string) => {
    await act(async () => {
      setValue.call(input, query);
      input.dispatchEvent(new browser.Event('input', { bubbles: true }));
      input.dispatchEvent(new browser.Event('change', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    return [...document.querySelectorAll('[data-conversation-title], [role="button"] > span:first-child')].map((row) => row.textContent);
  };
  expect(await search(id)).toEqual(['Release notes']);
  expect(await search(`  ${id.toUpperCase()}  `)).toEqual(['Release notes']);
  for (const query of ['ses_', 'ses_f88b', 'ses_f88b1a2b3c4f', `${id}x`, `${id} error`, 'ses_active']) {
    expect(await search(query)).toEqual([]);
  }
  expect(await search('release')).toEqual(['Release notes']);
  expect(await search('releaze')).toEqual([]);
  expect(await search('')).toHaveLength(2);
});

test('the chats of a deleted space are grouped under its name and cannot be restored', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(async () => new Response(JSON.stringify({
    archives: [{ spaceId: 'a1b2c3d4e5f6', name: 'Fix login', workspaceId: 'space-workspace' }],
  }), { status: 200 }), originalFetch);
  try {
    registerWorkspaceDirectory('space-workspace', '/data/spaces/archive/a1b2c3d4e5f6');
    useGlobalSessionsStore.setState({
      archivedSessions: [
        { ...session('ses_space1', 'Agent chat'), workspaceId: 'space-workspace' },
        session('ses_mine1', 'My chat'),
      ],
      activeSessions: [],
    });
    await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const groups = [...document.querySelectorAll('.group\\/dir button[title]')].map((button) => button.textContent);
    expect(groups.some((label) => label?.startsWith('Fix login'))).toBe(true);
    expect(document.querySelector('[aria-label="Restore Agent chat"]')).toBeNull();
    expect(document.querySelector('[aria-label="Restore My chat"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Delete Agent chat"]')).not.toBeNull();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the mobile layout names each row\'s project, offers Restore without Delete, and leaves when a session opens', async () => {
  useGlobalSessionsStore.setState({
    archivedSessions: [session('ses_mobile1', 'Phone chat')],
    activeSessions: [],
  });
  let left = 0;
  await act(async () => root.render(
    <I18nProvider><ArchiveSessionsView layout="mobile" onLeave={() => { left += 1; }} /></I18nProvider>,
  ));
  expect(document.querySelector('.group\\/dir')).toBeNull();
  expect(document.querySelector('[aria-label="Restore Phone chat"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Delete Phone chat"]')).toBeNull();
  const row = [...document.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Phone chat'));
  if (!row) throw new Error('Archived session row missing');
  expect(row.textContent).toContain('workspace');
  await act(async () => { row.click(); });
  expect(left).toBe(1);
});

test('every open starts with an empty search', async () => {
  useGlobalSessionsStore.setState({
    archivedSessions: [session('ses_a', 'Release notes'), session('ses_b', 'Login fix')],
    activeSessions: [],
    status: 'ready',
  });
  const advance = searchClock();
  useUIStore.getState().setArchivePageOpen(true);
  await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));
  await typeSearch('release');
  await advance(250);
  expect(browser.document.querySelector('input')?.value).toBe('release');

  // Opening it again, even while it is on screen, drops the search.
  await act(async () => { useUIStore.getState().setArchivePageOpen(true); });
  expect(browser.document.querySelector('input')?.value).toBe('');
  await act(async () => { useUIStore.getState().setArchivePageOpen(false); });
  expect(browser.document.querySelector('input')).toBeNull();
});

test('an empty archive is not reported before the session list has loaded, or after it failed to load', async () => {
  const emptyText = () => document.querySelector('p.font-semibold')?.textContent;
  useGlobalSessionsStore.setState({ archivedSessions: [], activeSessions: [], status: 'loading' });
  await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));
  expect(emptyText()).toBe('Loading sessions…');
  await act(async () => { useGlobalSessionsStore.setState({ status: 'error' }); });
  expect(emptyText()).toBe('Could not refresh sessions.');
  await act(async () => { useGlobalSessionsStore.setState({ status: 'ready' }); });
  expect(emptyText()).toBe('No archived sessions');
});

test('a subsession archived while its parent stays active is listed under the parent\'s title', async () => {
  let commits = 0;
  const boss = session('ses_boss', 'Boss');
  const archivedParent = session('ses_old', 'Old run', 5);
  const sub = (id: string, title: string, parentSessionId: string, archivedAt: number): Session => ({
    ...session(id, title, archivedAt), parentSessionId, rootSessionId: parentSessionId,
  });
  useGlobalSessionsStore.getState().applySnapshot(
    [boss],
    [
      session('ses_plain', 'Plain chat', 3),
      sub('ses_fix', 'Fix capture', 'ses_boss', 4),
      sub('ses_review', 'Review fix', 'ses_boss', 1),
      archivedParent,
      sub('ses_old_child', 'Old child', 'ses_old', 5),
    ],
    'ready',
  );
  await act(async () => root.render(<React.Profiler id="archive" onRender={() => { commits += 1; }}><I18nProvider><ArchiveView /></I18nProvider></React.Profiler>));
  const list = document.querySelector('.max-w-3xl');
  if (!list) throw new Error('Archive list missing');
  const rows = [...list.children].map((element) => (element.tagName === 'P'
    ? `# ${element.textContent}`
    : element.querySelector('span')?.textContent));
  // Both subsessions of the active parent sit together under its title, at the
  // place of the newer one; a subsession of an archived parent stays hidden.
  expect(rows).toEqual(['Old run', '# Boss', 'Fix capture', 'Review fix', 'Plain chat']);
  expect(document.querySelector('[aria-label="Restore Fix capture"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Restore Old child"]')).toBeNull();
  const before = commits;
  await act(async () => {
    for (let i = 0; i < 100; i++) useGlobalSessionsStore.getState().noteDeferredSessionUpdate(boss.id);
  });
  expect(commits).toBe(before);
  await act(async () => useGlobalSessionsStore.getState().upsertSession({ ...boss, title: 'Renamed boss' }));
  expect(list.textContent).toContain('Renamed boss');
  await act(async () => useGlobalSessionsStore.getState().upsertSession({ ...boss, time: { ...boss.time, archived: 6 } }));
  expect(document.querySelector('[aria-label="Restore Fix capture"]')).toBeNull();
});
test('renders discovery error banner with retry button on partial discovery error, while listing healthy archived sessions', async () => {
  useGlobalSessionsStore.setState({
    archivedSessions: [session('ses_healthy', 'Healthy archived chat', 10)],
    activeSessions: [],
    status: 'ready',
    discoveryErrors: new Map([['wsp_failing', 'METADATA_READ_FAILED']]),
  });
  await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));
  const banner = document.querySelector('.bg-destructive\\/10');
  expect(banner).not.toBeNull();
  expect(banner?.textContent).toContain('Could not refresh sessions.');
  const retryBtn = banner?.querySelector('button');
  expect(retryBtn).not.toBeNull();
  expect(retryBtn?.textContent).toBe('Try again');

  const titles = [...document.querySelectorAll('[role="button"] > span:first-child')].map((row) => row.textContent);
  expect(titles).toContain('Healthy archived chat');
});

// These tests keep the view, input, search hooks and response parsing real.
// Only the network, navigation boundary and debounce clock are controlled.
function searchClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  // SAFETY: the fake records only `run` and `delay`; the code under test never reads `setTimeout.__promisify__`.
  const set = spyOn(window, 'setTimeout').mockImplementation(((run: () => void, delay = 0) => {
    const id = nextId++;
    timers.set(id, { at: now + delay, run });
    return id;
  }) as typeof window.setTimeout);
  const clear = spyOn(window, 'clearTimeout').mockImplementation((id) => { timers.delete(Number(id)); });
  testRestorers.push(() => { set.mockRestore(); clear.mockRestore(); });
  return async (milliseconds: number) => {
    const end = now + milliseconds;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      await act(async () => { next[1].run(); });
    }
    now = end;
  };
}

async function typeSearch(value: string) {
  const input = browser.document.querySelector('input');
  const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set;
  if (!input || !setter) throw new Error('Archive input missing');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new browser.Event('input', { bubbles: true }));
  });
}

async function clickSearch(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing search action ${selector}`);
  await act(async () => { button.click(); });
}

// The field's one menu: where the search looks.
async function pickSearchScope(scope: 'everything' | 'titles' | 'user' | 'assistant' | 'reasoning') {
  await clickSearch('[data-search-in-trigger]');
  await clickSearch(`[data-search-in-option="${scope}"]`);
}

const contentHit = (id: string) => ({
  sessionId: id, sessionTitle: `Conversation ${id}`, directory: '/workspace', archived: true,
  messageId: `msg_${id}`, role: 'user', createdAt: 1, snippet: 'A \uE000needle\uE001 in content', matchCount: 3,
});
const searchIndex = { backfill: { state: 'done', total: 0, done: 0 }, sessions: 2, messages: 4, lifecycleComplete: true };
const contentPage = (ids: string[], next: string | null = null) => ({
  status: 'ok', hits: ids.map(contentHit), next, totals: { sessions: 2, byDirectory: { '/workspace': 2 } }, index: searchIndex,
});
const expandedHit = (id: string) => ({
  id, sessionId: 'ses_content', sessionTitle: 'Ordinary title', directory: '/workspace',
  role: 'user', createdAt: 2, snippet: `${id} has \uE000needle\uE001 text`,
});

async function renderSearch(layout: 'page' | 'mobile' = 'page', onLeave: () => void = () => undefined) {
  useUIStore.setState({ messageSearchEnabled: true, messageSearchReasoningEnabled: false, showReasoningTraces: true });
  useGlobalSessionsStore.setState({ archivedSessions: [session('ses_content', 'Ordinary title')], activeSessions: [], status: 'ready' });
  await act(async () => root.render(<I18nProvider><ArchiveSessionsView layout={layout} onLeave={onLeave} /></I18nProvider>));
}

test('live archive content search debounces without Enter and renders the next conversation page', async () => {
  const advance = searchClock();
  let resolveNext: ((response: Response) => void) | undefined;
  const nextPage = new Promise<Response>((resolve) => { resolveNext = resolve; });
  messageSearchResponse = (url) => url.searchParams.has('before') ? nextPage : contentPage(['ses_content'], 'conversation-page-2');
  await renderSearch();
  await typeSearch('needle');
  await advance(99);
  expect(messageSearchRequests).toHaveLength(0);
  await advance(1);
  expect(document.querySelector('[data-conversation-result]')).toBeNull();
  await advance(149);
  expect(messageSearchRequests).toHaveLength(0);
  await advance(1);
  expect(document.querySelector('[data-conversation-title]')?.textContent).toBe('Conversation ses_content');
  expect(document.querySelector('[data-conversation-excerpt-action] mark')?.textContent).toBe('needle');
  const more = [...document.querySelectorAll<HTMLButtonElement>('[data-archive-search-results] button')].find((button) => button.textContent === 'Show more');
  if (!more) throw new Error('Conversation pager missing');
  await act(async () => more.click());
  expect(messageSearchRequests.at(-1)?.searchParams.get('before')).toBe('conversation-page-2');
  expect(document.querySelector('[data-conversation-result="ses_content"]')).not.toBeNull();
  expect(document.querySelector('[data-conversation-result="ses_second"]')).toBeNull();
  await act(async () => { resolveNext?.(Response.json(contentPage(['ses_second']))); });
  expect([...document.querySelectorAll('[data-conversation-title]')].map((title) => title.textContent)).toEqual(['Conversation ses_content', 'Conversation ses_second']);
});

test('excerpt and expanded message activation focus their message and leave without restoring', async () => {
  const advance = searchClock();
  const open = spyOn(navigation, 'openSessionLink').mockResolvedValue(undefined);
  const restore = spyOn(useSessionUIStore.getState(), 'unarchiveSession').mockResolvedValue(true);
  testRestorers.push(() => { open.mockRestore(); restore.mockRestore(); });
  let left = 0;
  messageSearchResponse = () => contentPage(['ses_content']);
  expandedResponse = () => Response.json({ status: 'ok', hits: [{ ...expandedHit('msg_expanded'), role: 'reasoning' }], next: null, index: searchIndex });
  const { isReasoningRevealTarget } = await import('@/components/chat/search/reasoningReveal');
  await renderSearch('page', () => { left += 1; });
  await typeSearch('needle');
  await advance(250);
  await clickSearch('[data-conversation-excerpt-action]');
  expect(open.mock.calls).toEqual([['ses_content', 'msg_ses_content']]);
  expect(left).toBe(1);
  await clickSearch('[data-conversation-more-matches]');
  await clickSearch('[data-archive-other-matches] button');
  expect(open.mock.calls.at(-1)).toEqual(['ses_content', 'msg_expanded']);
  // A reasoning hit asks its collapsed turn and reasoning block to open.
  expect(isReasoningRevealTarget('msg_expanded')).toBe(true);
  expect(left).toBe(2);
  expect(restore).not.toHaveBeenCalled();
});

test('expanded archive matches keep the picked author, highlight snippets and fetch the next message page', async () => {
  const advance = searchClock();
  messageSearchResponse = () => contentPage(['ses_content']);
  expandedResponse = (url) => Response.json({ status: 'ok', hits: [expandedHit(url.searchParams.has('before') ? 'msg_next' : 'msg_first')], next: url.searchParams.has('before') ? null : 'message-page-2', index: searchIndex });
  await renderSearch();
  await typeSearch('needle');
  await advance(250);
  await pickSearchScope('user');
  await advance(150);
  expect(messageSearchRequests.at(-1)?.searchParams.get('role')).toBe('user');
  await clickSearch('[data-conversation-more-matches]');
  expect(expandedRequests[0]?.searchParams.get('session')).toBe('ses_content');
  expect(expandedRequests[0]?.searchParams.get('role')).toBe('user');
  expect(expandedRequests[0]?.searchParams.get('reasoning')).toBe('0');
  expect(expandedRequests[0]?.searchParams.get('lifecycle')).toBe('archived');
  expect(document.querySelector('[data-archive-other-matches] mark')?.textContent).toBe('needle');
  expect(/[\uE000\uE001]/.test(document.querySelector('[data-archive-other-matches]')?.textContent ?? '')).toBe(false);
  await clickSearch('[data-archive-other-matches] button:last-child');
  expect(expandedRequests.at(-1)?.searchParams.get('before')).toBe('message-page-2');
  expect(document.querySelector('[data-archive-other-matches]')?.textContent).toContain('msg_first');
  expect(document.querySelector('[data-archive-other-matches]')?.textContent).toContain('msg_next');
});

test('expanded message paging failure preserves hits and displays failure feedback', async () => {
  const advance = searchClock();
  messageSearchResponse = () => contentPage(['ses_content']);
  expandedResponse = (url) => url.searchParams.has('before')
    ? new Response('unavailable', { status: 500 })
    : Response.json({ status: 'ok', hits: [expandedHit('msg_kept')], next: 'failed-page', index: searchIndex });
  await renderSearch();
  await typeSearch('needle');
  await advance(250);
  await clickSearch('[data-conversation-more-matches]');
  await clickSearch('[data-archive-other-matches] button:last-child');
  const matches = document.querySelector('[data-archive-other-matches]');
  expect(expandedRequests.at(-1)?.searchParams.get('before')).toBe('failed-page');
  expect(matches?.textContent).toContain('msg_kept');
  expect(document.querySelector('[data-conversation-result="ses_content"]')).not.toBeNull();
  expect(matches?.querySelector('span.typography-micro')?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
});

test('phone search keeps its controls in the field and says a failed message search in words', async () => {
  const advance = searchClock();
  await renderSearch('mobile');
  const failure = () => document.querySelector('[data-archive-search-failure]')?.textContent ?? null;
  await typeSearch('ordinary');
  await advance(250);
  // The mark and the menu sit inside the field, with no row of filters under it; the count keeps its own line.
  const field = document.querySelector('[data-session-search-input]');
  expect(document.querySelector('[data-archive-count]')?.textContent).toBe('1 archived session');
  expect(field?.querySelector('[data-search-in-trigger]')).not.toBeNull();
  expect(document.querySelector('[data-search-scope-trigger]')).toBeNull();
  expect(failure()).toBeNull();
  messageSearchResponse = () => new Response('failed', { status: 500 });
  await typeSearch('ordinary title');
  await advance(250);
  expect(failure()).toBe('Couldn\'t search messages. Titles and projects are still searched.');
  expect(field?.querySelector('[data-search-status="error"]')).not.toBeNull();
  expect(document.querySelector('[data-conversation-result="ses_content"]')).not.toBeNull();
  // Indexing is work under way, not a failure: no mark and no line.
  messageSearchResponse = () => ({ ...contentPage([]), index: { ...searchIndex, backfill: { state: 'running', done: 3, total: 10 } } });
  await typeSearch('ordinary');
  await advance(250);
  expect(failure()).toBeNull();
  expect(field?.querySelector('[data-search-status]')).toBeNull();
  expect(document.querySelector('[data-conversation-result="ses_content"]')).not.toBeNull();
});

test('phone search restores through its localized named action, and active sessions are never found', async () => {
  const advance = searchClock();
  const restore = spyOn(useSessionUIStore.getState(), 'unarchiveSession').mockResolvedValue(true);
  testRestorers.push(() => restore.mockRestore());
  await renderSearch('mobile');
  await act(async () => useGlobalSessionsStore.setState({ activeSessions: [session('ses_active_result', 'Ordinary active', 0)] }));
  await typeSearch('ordinary');
  await advance(250);
  expect(resultIds()).toEqual(['ses_content']);
  await clickSearch('[data-conversation-result="ses_content"] button[aria-label="Restore Ordinary title"]');
  expect(restore.mock.calls).toEqual([['ses_content']]);
});

test('search metadata retains a standalone child parent title and an unmatched query has an explicit empty state', async () => {
  const advance = searchClock();
  await renderSearch();
  await act(async () => useGlobalSessionsStore.getState().applySnapshot(
    [session('ses_parent', 'Parent caption', 0)],
    [{ ...session('ses_child', 'Child needle'), parentID: 'ses_parent' }], 'ready',
  ));
  await typeSearch('needle');
  await advance(250);
  const childMeta = [...document.querySelectorAll('[data-conversation-result="ses_child"] [data-search-meta-item]')];
  expect(childMeta.map((item) => item.getAttribute('data-search-meta-item')).slice(-2)).toEqual(['parent', 'date']);
  expect(childMeta.at(-2)?.textContent).toContain('Parent caption');
  expect(childMeta.map((item) => item.textContent).join('')).not.toContain('·');
  await typeSearch('unmatched query');
  await advance(250);
  expect(document.querySelector('[data-conversation-result]')).toBeNull();
  expect(document.querySelector('[data-archive-search-results] p')?.textContent?.trim().length).toBeGreaterThan(0);
});

test('archive search renders project context, fallback folders, and ordered extras without dot separators', async () => {
  const advance = searchClock();
  const spaceDirectory = '/data/spaces/archive/a1b2c3d4e5f6';
  spaceArchives = [{ spaceId: 'a1b2c3d4e5f6', name: 'Fix login', directory: spaceDirectory }];
  await renderSearch();
  await act(async () => {
    useSessionUIStore.setState({ availableWorktreesByProject: new Map([
      ['/workspace', [
        { path: '/worktrees/feature', projectDirectory: '/workspace', branch: 'feature/archive', label: 'feature' },
        { path: '/gone/worktree', projectDirectory: '/workspace', branch: '', label: 'gone' },
      ]],
    ]) });
    useGlobalSessionsStore.getState().applySnapshot(
      [session('ses_parent', 'Parent title', 0)],
      [
        { ...session('ses_branch', 'Branch result'), directory: '/worktrees/feature' },
        { ...session('ses_gone', 'Gone result'), directory: '/gone/worktree' },
        { ...session('ses_space', 'Space result'), directory: spaceDirectory },
        { ...session('ses_child', 'Child result'), parentID: 'ses_parent' },
      ],
      'ready',
    );
  });
  messageSearchResponse = () => ({
    status: 'ok',
    hits: [
      { ...contentHit('ses_branch'), directory: '/worktrees/feature' },
      { ...contentHit('ses_gone'), directory: '/gone/worktree' },
      { ...contentHit('ses_space'), directory: spaceDirectory },
      contentHit('ses_child'),
    ],
    next: null,
    totals: { sessions: 4, byDirectory: {} },
    index: searchIndex,
  });
  await typeSearch('needle');
  await advance(250);

  const branch = document.querySelector('[data-conversation-result="ses_branch"]');
  expect(branch?.querySelector('[data-search-meta-item="project"]')?.textContent).toContain('workspace');
  expect(branch?.querySelector('[data-search-meta-item="branch"]')?.textContent).toBe('feature/archive');
  expect(document.querySelector('[data-conversation-result="ses_gone"] [data-search-meta-item="worktree-folder"]')?.textContent).toBe('worktree');
  expect(document.querySelector('[data-conversation-result="ses_space"] [data-search-meta-item="folder"]')?.textContent).toBe('Fix login');
  expect(document.querySelector('[data-conversation-result="ses_space"] [data-search-meta-item="project"]')).toBeNull();
  const childItems = [...document.querySelectorAll('[data-conversation-result="ses_child"] [data-search-meta-item]')];
  expect(childItems.map((item) => item.getAttribute('data-search-meta-item')).slice(-2)).toEqual(['parent', 'date']);
  expect(childItems.map((item) => item.textContent).join('')).not.toContain('·');
});

test('an archived chat in the chats root shows no project or folder, only its date', async () => {
  const advance = searchClock();
  await renderSearch();
  await act(async () => useGlobalSessionsStore.getState().applySnapshot(
    [],
    [{ ...session('ses_chat', 'Chat result'), directory: '/home/test/.config/ohpichamber/chats/ses_chat' }],
    'ready',
  ));
  await typeSearch('chat result');
  await advance(250);
  const row = document.querySelector('[data-conversation-result="ses_chat"]');
  expect(row).not.toBeNull();
  expect([...row?.querySelectorAll('[data-search-meta-item]') ?? []].map((item) => item.getAttribute('data-search-meta-item'))).toEqual(['date']);
  expect(row?.querySelector('[data-search-meta-icon]')).toBeNull();
});

test('the Search in menu narrows a search to titles, and a cleared search starts wide again', async () => {
  const advance = searchClock();
  messageSearchResponse = () => contentPage(['ses_content']);
  await renderSearch();
  await act(async () => {
    useSessionUIStore.setState({ availableWorktreesByProject: new Map([
      ['/workspace', [{ path: '/worktrees/task', projectDirectory: '/workspace', branch: 'quasar', label: 'task' }]],
    ]) });
    useGlobalSessionsStore.setState({ archivedSessions: [
      session('ses_content', 'Ordinary title'),
      { ...session('ses_task', 'Ordinary current'), directory: '/worktrees/task' },
      session('ses_named', 'Quasar notes'),
    ] });
  });
  // Everything: a title, a worktree's branch and a message all match.
  await typeSearch('quasar');
  await advance(250);
  expect(resultIds().sort()).toEqual(['ses_content', 'ses_named', 'ses_task']);
  const requests = messageSearchRequests.length;
  await pickSearchScope('titles');
  await advance(250);
  expect(resultIds()).toEqual(['ses_named']);
  expect(messageSearchRequests).toHaveLength(requests);
  expect(document.querySelector('[data-search-in-trigger]')?.getAttribute('aria-label')).toContain('Titles only');
  // The scope belongs to the search it was picked for.
  await typeSearch('');
  await typeSearch('quasar');
  await advance(250);
  expect(resultIds().sort()).toEqual(['ses_content', 'ses_named', 'ses_task']);
});
