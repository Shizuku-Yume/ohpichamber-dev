import { act } from 'react';
import { expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { GitLogEntry, GitStatus } from '@/lib/api/types';
import { commitAndSwitchDirtyBranch } from '@/lib/source-control/dirty-branch-switch';
import type { SourceControlAuthStatus, SourceControlUser } from '@/lib/source-control/types';
import { closeTopmostBackLayer, registerBackLayer } from '@/lib/mobileBackLayers';

// These cases cover the repository panes, not the transcript: the turn scope's
// sync read is answered empty rather than standing up a provider for it.
const actualSyncContext = await import('@/sync/sync-context');
mock.module('@/sync/sync-context', () => ({
  ...actualSyncContext,
  useSessionMessages: () => [],
  useSessionDirectory: () => undefined,
}));

// Pull requests are read through the checkout's bound GitHub context, so the
// repository here is bound to an account the auth store knows as valid.
const ACCOUNT_ID = 'github.com#7';
const ENDPOINT = { displayUrl: 'https://github.com/fork/project', fingerprint: 'origin-fetch' };
const USER: SourceControlUser = { provider: 'github', instance: 'github.com', id: '7', username: 'octocat' };
const CONNECTED: SourceControlAuthStatus = {
  provider: 'github', instance: 'github.com', status: 'connected', connected: true, user: USER,
  accounts: [{
    id: ACCOUNT_ID, credentialId: ACCOUNT_ID, credentialRevision: 1, providerUserId: 'github.com#7',
    providerUserStatus: 'available', user: USER, current: true, source: 'oauth', status: 'valid',
  }],
};

test('dirty branch switching publishes through the managed chooser and keeps the branch after a failed push', async () => {
  for (const outcome of ['published', 'failed', 'local'] as const) {
    const events: string[] = [];
    await commitAndSwitchDirtyBranch({
      branch: 'main',
      directory: '/project/nested',
      sourceBranch: 'feature',
      createCommit: async (directory: string) => { events.push(`commit:${directory}`); },
      preparePush: async () => {
        events.push('prepare:push');
        return async () => {
          events.push('publish');
          if (outcome === 'failed') throw new Error('Push rejected');
        };
      },
      refresh: async () => { events.push('refresh'); },
      close: () => { events.push('close'); },
      checkout: async (branch: string) => { events.push(`checkout:${branch}`); },
      toast: { success: () => { }, error: () => { events.push('error'); } },
      t: (key: string) => key,
    }, 'Save changes', outcome !== 'local');
    expect(events).toEqual(outcome === 'local'
      ? ['commit:/project/nested', 'refresh', 'close', 'checkout:main']
      : outcome === 'failed'
        ? ['commit:/project/nested', 'prepare:push', 'publish', 'error', 'refresh', 'close']
        : ['commit:/project/nested', 'prepare:push', 'publish', 'refresh', 'close', 'checkout:main']);
  }
});

// Git's patch for a rename with unchanged content: headers, no hunks.
const pureRenamePatch = (from: string, to: string) =>
  `diff --git a/${from} b/${to}\nsimilarity index 100%\nrename from ${from}\nrename to ${to}\n`;

test('mobile comparisons drill into files, retry, resume, change source, and yield to external working diffs', async () => {
  const dom = new Window({ url: 'http://localhost' });
  dom.happyDOM.setWindowSize({ width: 390, height: 844 });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals = {
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, Node: dom.Node,
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
  const commits: GitLogEntry[] = ['a', 'b'].map((letter) => ({
    hash: letter.repeat(40), date: '2026-09-09T09:22:00Z', message: `Commit ${letter}`,
    refs: '', body: '', author_name: 'Test Author', author_email: 'test@example.com',
    filesChanged: 1, insertions: 0, deletions: 0, parents: [],
  }));
  const requests: URL[] = [];
  const originalFetch = globalThis.fetch;
  let failBranchDiff = true;
  const statusFailure: 'host' | 'timeout' | null = null;
  const refreshedStatus: GitStatus | null = null;
  let nestedIsRepository = true;
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    if (url.pathname === '/api/fs/home' || url.pathname === '/api/session-folders') return new Promise<Response>(() => { });
    requests.push(url);
    switch (url.pathname) {
      case '/api/git/remotes': return Response.json([]);
      case '/api/git/projects': return Response.json({ projects: [{ directory: '/repo', isGitRepository: true }] });
      case '/api/git/status': return statusFailure
        ? Response.json(statusFailure === 'timeout'
          ? { error: 'Git did not answer within 30 seconds.', code: 'GIT_REPOSITORY_UNREADABLE' }
          : { error: 'Host unavailable' }, { status: 500 })
        : Response.json(refreshedStatus ?? status);
      case '/api/walkthrough': return Response.json({
        source: { kind: 'working-tree', scope: 'all' }, generatedAt: '2026-11-19T12:00:00Z',
        hunks: [], hunkCount: 0,
        walkthrough: { title: 'Working changes tour', focus: 'Review this change', chapters: [{
          id: 'chapter', title: 'Implementation', icon: 'wrench', blurb: '',
          stops: [{ id: 'step', title: 'Inspect the change', hunkIds: [], importance: 'normal', prose: 'Step explanation' }],
        }] },
      });
      // The identity strip beside the branch reads these on mount.
      case '/api/git/identities': return Response.json([]);
      case '/api/git/global-identity': return Response.json(null);
      case '/api/source-control/binding': {
        const guest = url.searchParams.get('directory') === '/board-repo';
        const id = guest ? 'guest-repo' : 'repo';
        const revision = guest ? 3 : 1;
        return Response.json({
          status: 'bound', revision,
          repository: {
            supported: true, repositoryId: id, configRevision: 'rev', bare: false,
            remotes: [{ name: guest ? 'upstream' : 'origin', fetch: ENDPOINT, push: ENDPOINT }]
          },
          binding: {
            repositoryId: id, configRevision: 'rev', revision, state: 'bound',
            providers: [{ provider: guest ? 'ext-source-control-provider' : 'github', instance: 'github.com', accountId: guest ? 'ext-source-control-provider#7' : ACCOUNT_ID, primaryRemote: guest ? 'upstream' : 'origin', readiness: 'ready', endpoint: ENDPOINT }],
            remotes: [], auxiliary: []
          },
        });
      }
      case '/api/git/branch-base': return Response.json({ base: null });
      case '/api/git/range-files': return Response.json({ files: url.searchParams.get('base') === 'refs/heads/parent'
        ? [{ path: 'parent.png', status: 'M' }, { path: 'docs/moved.md', previousPath: 'docs/orig.md', status: 'R' }]
        : [{ path: 'branch.png', status: 'M' }] });
      case '/api/git/range-diff':
        if (url.searchParams.get('path') === 'docs/moved.md') return Response.json({ diff: pureRenamePatch('docs/orig.md', 'docs/moved.md') });
        return failBranchDiff
          ? Response.json({ error: 'Branch diff failed' }, { status: 500 })
          : Response.json({ diff: 'Binary files a/branch.png and b/branch.png differ' });
      case '/api/git/log': return Response.json({ all: commits, latest: commits[0], total: commits.length });
      case '/api/git/commit-files': return Response.json({ files: url.searchParams.get('hash')?.[0] === 'a'
        ? [{ path: 'commit-a.png', previousPath: 'old.png', changeType: 'R', insertions: 0, deletions: 0, isBinary: true }]
        : [{ path: 'commit-b.md', previousPath: 'old.md', changeType: 'R', insertions: 0, deletions: 0, isBinary: false }] });
      case '/api/git/commit-diff': return Response.json({ diff: url.searchParams.get('path') === 'commit-b.md'
        ? pureRenamePatch('old.md', 'commit-b.md')
        : 'Binary files a/old.png and b/commit.png differ' });
      case '/api/git/file-diff':
        if (url.searchParams.get('path') === 'nested/' && nestedIsRepository) {
          return Response.json({ error: 'Path is a separate Git repository: nested/', code: 'nested_repository' }, { status: 422 });
        }
        // A staged pure rename: the file-version read answers equal versions and no patch.
        if (url.searchParams.get('path') === 'docs/moved.md') return Response.json({ path: 'docs/moved.md', original: 'same\n', modified: 'same\n', isBinary: false });
        return Response.json({ path: url.searchParams.get('path'), original: '', modified: '', isBinary: true });
      // The bound status contract echoes the branch it answered for.
      case '/api/source-control/github/pr/status': return Response.json({
        identity: { provider: 'github', instance: 'github.com' },
        project: { provider: 'github', instance: 'github.com', id: 'upstream/project', owner: 'upstream', name: 'project', url: 'https://github.com/upstream/project' },
        branch: url.searchParams.get('branch'),
        changeRequest: {
          provider: 'github', instance: 'github.com', id: 'upstream/project#42', number: 42,
          project: { provider: 'github', instance: 'github.com', id: 'upstream/project', owner: 'upstream', name: 'project', url: 'https://github.com/upstream/project' },
          title: 'Published PR', url: 'https://github.com/upstream/project/pull/42', state: 'open', draft: false, head: 'feature', base: 'main',
        },
      });
      case '/api/source-control/github/pulls/list': return Response.json({
        items: [{
          provider: 'github', instance: 'github.com', id: 'upstream/project#42', number: 42,
          project: { provider: 'github', instance: 'github.com', id: 'upstream/project', owner: 'upstream', name: 'project', url: 'https://github.com/upstream/project' },
          title: 'Published PR', url: 'https://github.com/upstream/project/pull/42', state: 'open', draft: false, head: 'feature', base: 'main',
        }],
        page: 1, hasMore: false,
      });
      case '/api/walkthrough/pr-diff': return new Response('diff --git a/published.png b/published.png\nindex 1111111..2222222 100644\nBinary files a/published.png and b/published.png differ\n', { headers: { 'content-type': 'text/plain' } });
      default: throw new Error(`Unexpected request ${url.pathname}`);
    }
  }, originalFetch);

  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
  const { createWebAPIs } = await import('../../../web/src/api/index');
  const { useGitStore } = await import('@/stores/useGitStore');
  const { getSourceControlAuthKey, useSourceControlAuthStore } = await import('@/stores/useSourceControlAuthStore');
  useSourceControlAuthStore.setState({
    entries: { [getSourceControlAuthKey({ provider: 'github', instance: 'github.com' })]: { status: CONNECTED, isLoading: false, hasChecked: true } },
  });
  const { MobileChangesPane } = await import('./MobileChangesSurface');
  const apis = createWebAPIs();
  const status: GitStatus = { current: 'feature', tracking: null, ahead: 0, behind: 0, files: [], isClean: true, diffStats: { staged: {}, working: {} } };
  const seed = (directory: string, nextStatus = status) => {
    useGitStore.getState().setActiveDirectory(directory);
    const previous = useGitStore.getState().getDirectoryState(directory);
    if (!previous) throw new Error('Missing repository state');
    const now = Date.now();
    const directories = new Map(useGitStore.getState().directories);
    directories.set(directory, {
      ...previous, status: nextStatus, isGitRepo: true,
      branches: { all: ['feature', 'main', 'parent', 'remotes/origin/main'], current: 'feature', branches: {}, defaultBranches: { origin: 'main' } },
      log: { all: commits, latest: commits[0], total: 2 }, identity: { userName: 'Test Author', userEmail: 'test@example.com' },
      lastStatusFetch: now, lastBranchesFetch: now, lastLogFetch: now, lastIdentityFetch: now, lastRepoCheckAt: now,
    });
    useGitStore.setState({ directories });
  };
  seed('/repo');
  let directory = '/repo';
  let visible = true;
  let initialDiff: { path: string; staged: boolean } | null = null;
  let backHandler: (() => boolean) | null = null;
  const registerBackHandler = (handler: (() => boolean) | null) => { backHandler = handler; };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = () => act(async () => {
    root.render(<I18nProvider><RuntimeAPIContext.Provider value={apis}>
      <MobileChangesPane rootDirectory={directory}
        repository={{ rootIsGitRepo: true, gitDirectory: directory, nestedRepos: null, nestedRepoSelection: null, repositoryOptions: null, repositoriesKnown: true, unreadable: null }}
        visible={visible} initialDiff={initialDiff} registerBackHandler={registerBackHandler} />
    </RuntimeAPIContext.Provider></I18nProvider>);
  });
  const click = async (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    await act(async () => { element.click(); });
  };
  const chooseMode = async (label: string) => {
    await click('[aria-label="Select change mode"]');
    const option = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((element) => element.textContent === label);
    if (!option) throw new Error(`Missing mode ${label}`);
    await act(async () => { option.click(); });
  };
  const openFile = async (path: string) => {
    // A renamed row names both sides (`old → new`), so match on the destination.
    const button = [...container.querySelectorAll('[title]')]
      .find((node) => {
        const title = node.getAttribute('title') ?? '';
        return title === path || title.endsWith(` \u2192 ${path}`);
      })
      ?.closest('button');
    if (!button) throw new Error(`Missing file ${path}`);
    await act(async () => { button.click(); });
  };
  const comparisonRequests = () => requests.filter((url) => /\/(range-files|range-diff|commit-files|commit-diff)$/.test(url.pathname));
  const checkoutControl = () => [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'feature');

  try {
    await render();
    expect(backHandler).toBeNull();
    const modeTrigger = container.querySelector('[aria-label="Select change mode"]');
    const syncButton = container.querySelector('[aria-label="Publish"]');
    if (!modeTrigger || !syncButton) throw new Error('Missing Changes controls');
    expect(modeTrigger?.textContent).toBe('Changes');
    expect(container.querySelector('h2')).toBeNull();
    expect(checkoutControl()).toBeDefined();
    expect(syncButton).not.toBeNull();
    expect(modeTrigger?.closest('header')?.contains(syncButton)).toBe(false);
    expect(modeTrigger && syncButton && (modeTrigger.compareDocumentPosition(syncButton) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await chooseMode('Branch');
    expect(container.querySelector('[aria-label="Sync Changes"]')).toBeNull();
    expect(checkoutControl()).toBeUndefined();
    expect(container.textContent).toContain('origin/main');
    await click('[aria-label="Base branch"]');
    await click('[data-value="refs/heads/main"]');
    expect(container.querySelector('[title="branch.png"]')).not.toBeNull();
    await openFile('branch.png');
    expect(container.textContent).toContain('Branch diff failed');
    await act(async () => { expect(backHandler?.()).toBe(true); });
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector('[aria-label="Select change mode"]')?.textContent).toBe('Branch');
    expect(backHandler).toBeNull();
    await openFile('branch.png');
    expect(requests.filter((url) => url.pathname === '/api/git/file-diff')).toHaveLength(0);
    failBranchDiff = false;
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Retry');
    if (!retry) throw new Error('Missing diff retry');
    await act(async () => { retry.click(); });
    expect(container.textContent).toContain('Content of this file cannot be viewed.');
    expect(container.textContent).toContain('Branch · main');

    const beforeHide = comparisonRequests().length;
    visible = false;
    await render();
    expect(backHandler).toBeNull();
    await act(async () => { seed('/repo'); });
    expect(comparisonRequests()).toHaveLength(beforeHide);
    visible = true;
    await render();
    expect(container.querySelector('h2')?.textContent).toBe('branch.png');
    expect(backHandler).not.toBeNull();
    await click('[aria-label="Back"]');
    expect(backHandler).toBeNull();
    await click('[aria-label="Base branch"]');
    await click('[data-value="refs/heads/parent"]');
    expect(container.querySelector('[title="branch.png"]')).toBeNull();
    expect(container.querySelector('[title="parent.png"]')).not.toBeNull();
    // A pure rename names its source and says the content is unchanged, instead of an empty body.
    await openFile('docs/moved.md');
    expect(container.querySelector('h2')?.textContent).toBe('moved.md');
    expect(container.textContent).toContain('docs/orig.md → docs');
    expect(container.textContent).toContain('Renamed from docs/orig.md — content unchanged');
    const renameRequest = [...requests].reverse().find((url) => url.pathname === '/api/git/range-diff');
    expect(renameRequest?.searchParams.get('previousPath')).toBe('docs/orig.md');
    await click('[aria-label="Back"]');

    await chooseMode('Commit');
    expect(container.querySelector('[aria-label="Sync Changes"]')).toBeNull();
    expect(checkoutControl()).toBeUndefined();
    // A renamed entry names both sides: the row reads `old → new`.
    expect(container.querySelector('[title="old.png \u2192 commit-a.png"]')).not.toBeNull();
    await click('[aria-label="Select commit"]');
    await click(`[data-value="${'b'.repeat(40)}"]`);
    expect(container.querySelector('[title="commit-a.png"]')).toBeNull();
    await openFile('commit-b.md');
    expect(container.textContent).toContain('Commit · bbbbbbbb');
    expect(container.textContent).toContain('Renamed from old.md — content unchanged');
    const commitRequest = [...requests].reverse().find((url) => url.pathname === '/api/git/commit-diff');
    expect(commitRequest?.searchParams.get('hash')).toBe('b'.repeat(40));
    expect(commitRequest?.searchParams.get('previousPath')).toBe('old.md');
    expect(requests.filter((url) => url.pathname === '/api/git/range-diff').every((url) => url.searchParams.get('includeWorkingTree') === 'true')).toBe(true);

    await click('[aria-label="Back"]');
    await chooseMode('Pull Requests');
    const settled = Promise.withResolvers<void>();
    setTimeout(settled.resolve, 50);
    await act(async () => { await settled.promise; });
    expect(container.querySelector('[aria-label="Sync Changes"]')).toBeNull();
    expect(container.querySelector('[title="published.png"]')).not.toBeNull();
    await openFile('published.png');
    expect(container.textContent).toContain('Pull Requests · #42');
    expect(container.textContent).toContain('Content of this file cannot be viewed.');
    const prRequest = requests.find((url) => url.pathname === '/api/walkthrough/pr-diff');
    expect(JSON.parse(prRequest?.searchParams.get('source') ?? '')).toEqual({ kind: 'pr', number: 42, sourceRepo: { owner: 'upstream', repo: 'project' } });
    expect(prRequest?.searchParams.get('accountId')).toBe(ACCOUNT_ID);
    expect(prRequest?.searchParams.get('repositoryId')).toBe('repo');
    expect(requests.filter((url) => url.pathname === '/api/git/file-diff')).toHaveLength(0);

    // A board handoff on the phone selects and validates its own repository.
    const { usePullRequestSelectionStore } = await import('@/stores/usePullRequestSelectionStore');
    const { useSourceControlProviderRegistry } = await import('@/lib/source-control/providers/registry');
    const { acmeDescriptor } = await import('@/lib/source-control/providers/descriptor.fixture');
    const guest = 'ext-source-control-provider';
    const guestContext = { provider: guest, instance: 'https://github.com', accountId: `${guest}#7`, repositoryId: 'guest-repo', bindingRevision: 3, directory: '/board-repo', primaryRemote: 'upstream' };
    const guestUser = { ...USER, provider: guest, instance: guestContext.instance };
    const guestStatus = { ...CONNECTED, provider: guest, instance: guestContext.instance, user: guestUser, accounts: CONNECTED.accounts.map((account) => ({ ...account, id: guestContext.accountId, credentialId: guestContext.accountId, user: guestUser })) };
    useSourceControlAuthStore.setState((state) => ({ entries: { ...state.entries, [getSourceControlAuthKey(guestContext)]: { status: guestStatus, isLoading: false, hasChecked: true } } }));
    const descriptor = acmeDescriptor({ id: guest, label: 'Teahouse' });
    useSourceControlProviderRegistry.setState({ ordered: [descriptor], byId: new Map([[guest, descriptor]]), status: 'ready', holdsList: true });
    await act(async () => { seed('/board-repo'); });
    await act(async () => usePullRequestSelectionStore.getState().requestDiff('/repo', { kind: 'pr', number: 2, sourceRepo: { owner: 'mona', repo: 'teapot' } }, guestContext, '/board-repo'));
    for (let round = 0; round < 4; round += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    const guestRequest = requests.find((url) => url.pathname === '/api/walkthrough/pr-diff' && url.searchParams.get('provider') === guest);
    expect(guestRequest?.searchParams.get('directory')).toBe('/board-repo');
    expect(guestRequest?.searchParams.get('accountId')).toBe(guestContext.accountId);
    expect(guestRequest?.searchParams.get('repositoryId')).toBe(guestContext.repositoryId);
    expect(JSON.parse(guestRequest?.searchParams.get('source') ?? '{}')).toEqual({ kind: 'pr', number: 2, sourceRepo: { owner: 'mona', repo: 'teapot' } });
    expect(container.querySelector('[title="published.png"]')).not.toBeNull();
    // A consumed Board context must not outlive an authoritative rebind.
    const { repositoryBindingOwner } = await import('@/lib/source-control/repository-binding');
    const bound = { status: 'bound' as const, revision: 3, repository: { supported: true, repositoryId: 'guest-repo', configRevision: 'rev', bare: false, remotes: [{ name: 'upstream', fetch: ENDPOINT, push: ENDPOINT }] }, binding: { repositoryId: 'guest-repo', configRevision: 'rev', revision: 3, state: 'bound' as const, providers: [{ provider: guest, instance: guestContext.instance, accountId: guestContext.accountId, primaryRemote: 'upstream', readiness: 'ready' as const, endpoint: ENDPOINT }], remotes: [], auxiliary: [] } };
    const mutation = repositoryBindingOwner.captureMutation(repositoryBindingOwner.scope('/board-repo'), bound);
    const beforeRebind = requests.length;
    const replacement = { ...guestContext, accountId: `${guest}#8`, bindingRevision: 4 };
    const replacementStatus = { ...guestStatus, accounts: guestStatus.accounts.map((account) => ({ ...account, id: replacement.accountId, credentialId: replacement.accountId })) };
    useSourceControlAuthStore.setState((state) => ({ entries: { ...state.entries, [getSourceControlAuthKey(replacement)]: { status: replacementStatus, isLoading: false, hasChecked: true } } }));
    await act(async () => {
      usePullRequestSelectionStore.getState().requestDiff('/repo', { kind: 'pr', number: 97, sourceRepo: { owner: 'mona', repo: 'teapot' } }, guestContext, '/board-repo');
      expect(repositoryBindingOwner.setMutationResult(mutation, { ...bound, revision: 4, binding: { ...bound.binding, revision: 4, providers: bound.binding.providers.map((entry) => ({ ...entry, accountId: replacement.accountId })) } })).toBe(true);
      mutation.release();
    });
    for (let round = 0; round < 4; round += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(requests.slice(beforeRebind).filter((url) => url.pathname === '/api/walkthrough/pr-diff').every((url) => url.searchParams.get('bindingRevision') !== '3')).toBe(true);
    expect(usePullRequestSelectionStore.getState().diffContexts.get('/repo')).toBeUndefined();
    expect([...usePullRequestSelectionStore.getState().selections.entries()].some(([key, value]) => key.includes(replacement.accountId) && value.source.number === 97)).toBe(false);
    await act(async () => usePullRequestSelectionStore.getState().requestDiff('/repo', { kind: 'pr', number: 2, sourceRepo: { owner: 'mona', repo: 'teapot' } }, replacement, '/board-repo'));
    for (let round = 0; round < 4; round += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(requests.slice(beforeRebind).some((url) => url.pathname === '/api/walkthrough/pr-diff' && url.searchParams.get('bindingRevision') === '4')).toBe(true);
    await act(async () => usePullRequestSelectionStore.getState().clearChangesRepository('/repo'));

    await act(async () => { seed('/repo', { ...status, isClean: false, files: [{ path: 'working.png', index: 'M', working_dir: ' ' }] }); });
    initialDiff = { path: 'working.png', staged: true };
    await render();
    expect(container.querySelector('h2')?.textContent).toBe('working.png');
    const workingRequest = [...requests].reverse().find((url) => url.pathname === '/api/git/file-diff');
    expect(workingRequest?.searchParams.get('staged')).toBe('true');
    let workspaceOpen = true;
    const back = () => {
      if (closeTopmostBackLayer()) return;
      if (backHandler?.()) return;
      workspaceOpen = false;
    };
    let overlayOpen = true;
    const releaseOverlay = registerBackLayer(() => { overlayOpen = false; releaseOverlay(); });
    try {
      await act(async () => back());
      expect(overlayOpen).toBe(false);
      expect(workspaceOpen).toBe(true);
      expect(container.querySelector('h2')?.textContent).toBe('working.png');
    } finally {
      releaseOverlay();
    }
    await act(async () => back());
    expect(workspaceOpen).toBe(true);
    expect(backHandler).toBeNull();
    expect(container.querySelector('h2')).toBeNull();
    back();
    expect(workspaceOpen).toBe(false);
    visible = false;
    await render();
    visible = true;
    await render();
    expect(container.querySelector('h2')).toBeNull();
    expect(backHandler).toBeNull();
    expect(container.querySelector('[aria-label="Select change mode"]')?.textContent).toBe('Changes');
    expect(container.querySelector('[aria-label="Publish"]')).not.toBeNull();
    expect(checkoutControl()).toBeDefined();

    // A working-tree pure rename reads as one too, from its equal file versions.
    await act(async () => { seed('/repo', { ...status, isClean: false, files: [{ path: 'docs/moved.md', previousPath: 'docs/orig.md', index: 'R', working_dir: ' ' }] }); });
    initialDiff = { path: 'docs/moved.md', staged: true };
    await render();
    expect(container.querySelector('h2')?.textContent).toBe('moved.md');
    expect(container.textContent).toContain('Renamed from docs/orig.md — content unchanged');
    const workingRenameRequest = [...requests].reverse().find((url) => url.pathname === '/api/git/file-diff');
    expect(workingRenameRequest?.searchParams.get('previousPath')).toBe('docs/orig.md');
    await click('[aria-label="Back"]');

    // A nested-repository answer must not outlive the read that produced it.
    await act(async () => { seed('/repo', { ...status, isClean: false, files: [{ path: 'nested/', index: '?', working_dir: '?' }] }); });
    initialDiff = { path: 'nested/', staged: false };
    await render();
    expect(container.textContent).toContain('Separate Git repository');
    await click('[aria-label="Back"]');
    nestedIsRepository = false;
    initialDiff = { path: 'nested/', staged: false };
    await render();
    expect(container.querySelector('h2')?.textContent).toBe('nested/');
    expect(container.textContent).not.toContain('Separate Git repository');
    expect(container.textContent).toContain('Content of this file cannot be viewed.');
    await click('[aria-label="Back"]');
    await act(async () => { seed('/repo', { ...status, isClean: false, files: [{ path: 'working.png', index: 'M', working_dir: ' ' }] }); });

    await chooseMode('Branch');
    initialDiff = { path: 'working.png', staged: true };
    await render();
    expect(container.querySelector('h2')?.textContent).toBe('working.png');

    await act(async () => { seed('/repo-two'); });
    directory = '/repo-two';
    await render();
    expect(container.querySelector('[aria-label="Select change mode"]')?.textContent).toBe('Changes');
    expect(container.querySelector('h2')).toBeNull();
    expect(requests.some((url) => url.pathname === '/api/git/file-diff' && url.searchParams.get('directory') === '/repo-two')).toBe(false);
    expect(backHandler).toBeNull();
    initialDiff = { path: 'missing.png', staged: false };
    await render();
    expect(backHandler).not.toBeNull();
    await act(async () => { expect(backHandler?.()).toBe(true); });
    expect(backHandler).toBeNull();
    initialDiff = { path: 'missing.png', staged: false };
    await render();
    expect(backHandler).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    expect(backHandler).toBeNull();
    globalThis.fetch = originalFetch;
    await dom.happyDOM.abort();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
  // One scenario loads the Changes surface and walks every mode in happy-dom.
  // It takes about a second on an idle machine, but the full suite runs four
  // test processes at once, and there it crossed the 5 second default on Windows.
}, 30_000);

// Revert All used to launch one POST /api/git/revert per changed path at once.
// The server serializes reverts per repository, so the extra requests only hold
// browser connections away from reads. This drives the real Changes surface and
// counts transport calls in flight at the fetch boundary.
test('bounds Revert All fan-out to two in-flight revert requests', async () => {
  const dom = new Window({ url: 'http://localhost' });
  dom.happyDOM.setWindowSize({ width: 390, height: 844 });
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
  const files = Array.from({ length: 8 }, (_, index) => `src/file-${index}.ts`);
  let revertCalls = 0;
  let activeReverts = 0;
  let peakReverts = 0;
  let releaseReverts: () => void = () => { };
  const revertGate = new Promise<void>((resolve) => { releaseReverts = () => resolve(); });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    if (url.pathname === '/api/fs/home' || url.pathname === '/api/session-folders') return new Promise<Response>(() => { });
    switch (url.pathname) {
      case '/api/git/remotes': return Response.json([]);
      case '/api/git/remote-url': return Response.json({ url: null });
      case '/api/git/branches': return Response.json({ all: ['feature', 'main'], current: 'feature', branches: {}, defaultBranches: { origin: 'main' } });
      case '/api/git/status': return Response.json({ current: 'feature', tracking: null, ahead: 0, behind: 0, files: [], isClean: true, diffStats: { staged: {}, working: {} } });
      case '/api/git/file-diff': return Response.json({ path: url.searchParams.get('path'), original: '', modified: '', isBinary: true });
      case '/api/git/revert': {
        revertCalls += 1;
        activeReverts += 1;
        peakReverts = Math.max(peakReverts, activeReverts);
        await revertGate;
        activeReverts -= 1;
        return Response.json({ success: true });
      }
      default: throw new Error(`Unexpected request ${url.pathname}`);
    }
  }, originalFetch);
  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
  const { createWebAPIs } = await import('../../../web/src/api/index');
  const { useGitStore } = await import('@/stores/useGitStore');
  const { MobileChangesPane } = await import('./MobileChangesSurface');
  const apis = createWebAPIs();
  const dirtyStatus: GitStatus = {
    current: 'feature', tracking: null, ahead: 0, behind: 0, isClean: false,
    files: files.map((path) => ({ path, index: ' ', working_dir: 'M' })),
    diffStats: { staged: {}, working: {} },
  };
  useGitStore.getState().setActiveDirectory('/repo');
  const previous = useGitStore.getState().getDirectoryState('/repo');
  if (!previous) throw new Error('Missing repository state');
  const now = Date.now();
  const directories = new Map(useGitStore.getState().directories);
  directories.set('/repo', {
    ...previous, status: dirtyStatus, isGitRepo: true,
    branches: { all: ['feature', 'main'], current: 'feature', branches: {}, defaultBranches: { origin: 'main' } },
    log: { all: [], latest: null, total: 0 }, identity: { userName: 'Test Author', userEmail: 'test@example.com' },
    lastStatusFetch: now, lastBranchesFetch: now, lastLogFetch: now, lastIdentityFetch: now, lastRepoCheckAt: now,
  });
  useGitStore.setState({ directories });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<I18nProvider><RuntimeAPIContext.Provider value={apis}>
        <MobileChangesPane rootDirectory="/repo"
          repository={{ rootIsGitRepo: true, gitDirectory: '/repo', nestedRepos: null, nestedRepoSelection: null, repositoryOptions: null, repositoriesKnown: true, unreadable: null }}
          visible />
      </RuntimeAPIContext.Provider></I18nProvider>);
    });
    const revertAll = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Revert all');
    if (!revertAll) throw new Error('Missing Revert all');
    await act(async () => { revertAll.click(); });
    const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find((button) => button.textContent?.trim() === 'Revert all');
    if (!confirm) throw new Error('Missing Revert all confirmation');
    await act(async () => { confirm.click(); });
    // Two paths hold the only in-flight slots; the other six wait for one.
    expect(revertCalls).toBe(2);
    expect(peakReverts).toBeLessThanOrEqual(2);
    await act(async () => { releaseReverts(); });
    expect(revertCalls).toBe(files.length);
    expect(peakReverts).toBeLessThanOrEqual(2);
    expect(container.textContent).not.toContain('Revert all');
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await dom.happyDOM.abort();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}, 30_000);
