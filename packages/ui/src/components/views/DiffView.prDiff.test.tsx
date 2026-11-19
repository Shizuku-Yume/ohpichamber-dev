import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { GitStatus } from '@/lib/api/types';
import type {
  ChangeRequest, PageResult, Project, SourceControlAuthStatus, SourceControlBindingRead, SourceControlIdentity, SourceControlReadContext, SourceControlUser,
} from '@/lib/source-control/types';

const endpoint = { displayUrl: 'https://github.com/team/project', fingerprint: 'fetch' };
const repository = { repositoryId: 'repo-1', configRevision: 'config', bare: false, remotes: [{ name: 'origin', fetch: endpoint, push: endpoint }] };
const BINDING: Extract<SourceControlBindingRead, { status: 'bound' }> = {
  status: 'bound', repository, revision: 4,
  binding: { repositoryId: 'repo-1', configRevision: 'config', revision: 4, state: 'bound',
    providers: [{ provider: 'github', instance: 'github.com', accountId: 'github.com#7', primaryRemote: 'origin', readiness: 'ready', endpoint }],
    remotes: [], auxiliary: [] },
};
const CONTEXT: SourceControlReadContext = {
  provider: 'github', instance: 'github.com', accountId: 'github.com#7', repositoryId: 'repo-1',
  bindingRevision: 4, directory: '/repo', primaryRemote: 'origin',
};
const USER: SourceControlUser = { provider: 'github', instance: 'github.com', id: '7', username: 'octocat' };
const CONNECTED: SourceControlAuthStatus = {
  provider: 'github', instance: 'github.com', status: 'connected', connected: true, user: USER,
  accounts: [{
    id: CONTEXT.accountId, credentialId: CONTEXT.accountId, credentialRevision: 1, providerUserId: 'github.com#7',
    providerUserStatus: 'available', user: USER, current: true, source: 'oauth', status: 'valid',
  }],
};
const IDENTITY: SourceControlIdentity = { provider: 'github', instance: 'github.com' };
const PROJECT: Project = { ...IDENTITY, id: 'team/project', owner: 'team', name: 'project', url: 'https://github.com/team/project' };
const PR: ChangeRequest = {
  ...IDENTITY, id: 'team/project#17', number: 17, project: PROJECT, title: 'PR 17',
  url: 'https://github.com/team/project/pull/17', state: 'open', draft: false, base: 'main', head: 'feature-17',
};

const STATUS: GitStatus = { current: 'feature-17', tracking: null, ahead: 0, behind: 0, files: [], isClean: true };

// B-1: the binding route answers 422 for a folder outside a repository, so the
// Changes view must not ask it there. It opens on the shared not-a-repository
// state (Git's own probe is the only git call it makes).
test('a non-repository directory asks no repository binding', async () => {
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
    if (url.pathname === '/api/git/projects') {
      return Response.json({ projects: [{ directory: '/chats', isGitRepository: false, status: null }] });
    }
    if (url.pathname === '/api/fs/git-dirs') return Response.json({ repositories: [] });
    return new Promise<Response>(() => {});
  }, originalFetch);
  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { CanonicalClient } = await import('@/api/canonicalClient');
  const { SyncProvider } = await import('@/sync/sync-context');
  const client = new CanonicalClient();
  const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
  const { createWebAPIs } = await import('../../../../web/src/api/index');
  const { DiffView } = await import('./DiffView');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<SyncProvider client={client} directory="/chats"><I18nProvider><RuntimeAPIContext.Provider value={createWebAPIs()}>
        <DiffView directory="/chats" diffScope="working" />
      </RuntimeAPIContext.Provider></I18nProvider></SyncProvider>);
    });
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

test('the pull request diff on a host without change-request diffs says so and offers no retry', async () => {
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
    if (url.pathname === '/api/source-control/binding') return Response.json(BINDING);
    if (url.pathname === '/api/git/status') return Response.json(STATUS);
    if (url.pathname === '/api/git/projects') return Response.json({ projects: [{ directory: '/repo', isGitRepository: true, status: STATUS }] });
    if (url.pathname === '/api/source-control/github/pulls/list') {
      return Response.json({ items: [PR], page: 1, hasMore: false } satisfies PageResult<ChangeRequest>);
    }
    // As the server refuses a host without the diff read.
    if (url.pathname.startsWith('/api/walkthrough/')) {
      return Response.json({ error: 'This source control provider does not offer change request walkthroughs', code: 'UNSUPPORTED_WALKTHROUGH_PROVIDER' }, { status: 422 });
    }
    // Git, status and the rest stay unanswered: the pull request scope does not wait on them.
    return new Promise<Response>(() => {});
  }, originalFetch);
  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { CanonicalClient } = await import('@/api/canonicalClient');
  const { SyncProvider } = await import('@/sync/sync-context');
  // The agent service stays unanswered: the walkthrough's pull request scope does not need it.
  const client = new CanonicalClient();
  const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
  const { createWebAPIs } = await import('../../../../web/src/api/index');
  const { getSourceControlAuthKey, useSourceControlAuthStore } = await import('@/stores/useSourceControlAuthStore');
  useSourceControlAuthStore.setState({
    entries: { [getSourceControlAuthKey(CONTEXT)]: { status: CONNECTED, isLoading: false, hasChecked: true } },
  });
  const { useSourceControlProviderRegistry } = await import('@/lib/source-control/providers/registry');
  const { githubLikeDescriptor } = await import('@/lib/source-control/providers/descriptor.fixture');
  const github = githubLikeDescriptor();
  const descriptor = { ...github, features: { ...github.features, changeRequestPatch: false } };
  useSourceControlProviderRegistry.setState({ ordered: [descriptor], byId: new Map([[descriptor.id, descriptor]]), status: 'ready', holdsList: true });
  // Opened on a pull request from the board, through the project's folder.
  const { usePullRequestSelectionStore } = await import('@/stores/usePullRequestSelectionStore');
  usePullRequestSelectionStore.getState().requestDiff('/repo', { kind: 'pr', number: 17, sourceRepo: { owner: 'team', repo: 'project' } }, CONTEXT);
  const { DiffView } = await import('./DiffView');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<SyncProvider client={client} directory="/repo"><I18nProvider><RuntimeAPIContext.Provider value={createWebAPIs()}>
        <DiffView directory="/repo" diffScope="pr" />
      </RuntimeAPIContext.Provider></I18nProvider></SyncProvider>);
    });
    // The repository check is batched on a timer; let it and the reads after it land.
    for (let round = 0; round < 4; round += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(container.textContent).toContain("GitHub doesn't serve pull request diffs");
    expect(container.textContent).not.toContain('does not offer change request walkthroughs');
    expect([...container.querySelectorAll('button')].map((button) => button.textContent)).not.toContain('Retry');
    // The diff is not asked of the host.
    expect(paths.filter((path) => path.startsWith('/api/walkthrough/'))).toEqual([]);
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

for (const provider of ['ext-source-control-provider', 'github'] as const) {
  test(`Board Changes loads ${provider} through the bound Host comparison`, async () => {
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
    const context = { ...CONTEXT, provider, instance: provider === 'github' ? 'github.com' : 'https://github.com', accountId: `${provider}#7` };
    const user = { ...USER, provider, instance: context.instance };
    const connected = { ...CONNECTED, provider, instance: context.instance, user, accounts: CONNECTED.accounts.map((account) => ({ ...account, id: context.accountId, credentialId: context.accountId, user })) };
    const urls: URL[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
      urls.push(url);
      if (url.pathname === '/api/source-control/binding') return Response.json({ ...BINDING, binding: { ...BINDING.binding, providers: BINDING.binding.providers.map((entry) => ({ ...entry, provider, accountId: context.accountId })) } });
      if (url.pathname === '/api/git/status') return Response.json(STATUS);
      if (url.pathname === '/api/git/projects') return Response.json({ projects: [{ directory: '/repo', isGitRepository: true, status: STATUS }] });
      if (url.pathname === '/api/walkthrough/pr-diff') return new Response('diff --git a/README.md b/README.md\nindex 1111111..2222222 100644\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-before\n+Steep for three minutes.\n', { headers: { 'content-type': 'text/plain' } });
      if (url.pathname.endsWith('/pulls/list')) return Response.json({ items: [], page: 1, hasMore: false });
      return new Promise<Response>(() => {});
    }, originalFetch);
    const { createRoot } = await import('react-dom/client');
    const { I18nProvider } = await import('@/lib/i18n');
    const { CanonicalClient } = await import('@/api/canonicalClient');
    const { SyncProvider } = await import('@/sync/sync-context');
    const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
    const { createWebAPIs } = await import('../../../../web/src/api/index');
    const { getSourceControlAuthKey, useSourceControlAuthStore } = await import('@/stores/useSourceControlAuthStore');
    useSourceControlAuthStore.setState({ entries: { [getSourceControlAuthKey(context)]: { status: connected, isLoading: false, hasChecked: true } } });
    const { useSourceControlProviderRegistry } = await import('@/lib/source-control/providers/registry');
    const { acmeDescriptor, githubLikeDescriptor } = await import('@/lib/source-control/providers/descriptor.fixture');
    const descriptor = provider === 'github' ? githubLikeDescriptor() : acmeDescriptor({ id: provider, label: 'Teahouse' });
    useSourceControlProviderRegistry.setState({ ordered: [descriptor], byId: new Map([[provider, descriptor]]), status: 'ready', holdsList: true });
    const { usePullRequestSelectionStore } = await import('@/stores/usePullRequestSelectionStore');
    const { repositoryBindingOwner } = await import('@/lib/source-control/repository-binding');
    repositoryBindingOwner.reset();
    usePullRequestSelectionStore.setState({ selections: new Map(), diffRequests: new Map(), diffContexts: new Map(), changesRepositories: new Map() });
    const { SourceBoardPullLinks } = await import('@/components/sourceBoard/SourceBoardActions');
    const { DiffView } = await import('./DiffView');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const pull = { kind: 'pull' as const, provider, number: 2, title: 'Teapot', url: 'https://example.com/2', body: '', bodyTruncated: false, createdAt: null, updatedAt: null, author: null, labels: [], commentCount: 0, sourceRepo: { owner: 'mona', repo: 'teapot', source: 'origin' }, state: 'open' as const, draft: false, head: 'feature', base: 'main', headSha: 'b'.repeat(40), headRepo: null };
    try {
      await act(async () => root.render(<SyncProvider client={new CanonicalClient()} directory="/repo"><I18nProvider><RuntimeAPIContext.Provider value={createWebAPIs()}>
        <SourceBoardPullLinks pull={pull} project={{ id: 'project', path: '/repo' }} repository={null} context={context} projectOwnsDirectory={() => true} currentDirectory="/repo" />
        <DiffView directory="/repo" diffScope="pr" />
      </RuntimeAPIContext.Provider></I18nProvider></SyncProvider>));
      const button = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === 'Changes');
      if (!button) throw new Error('Board Changes link is missing');
      await act(async () => button.click());
      for (let round = 0; round < 4; round += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
      const request = urls.find((url) => url.pathname === '/api/walkthrough/pr-diff' && url.searchParams.get('provider') === provider);
      expect(request).toBeDefined();
      expect(request?.searchParams.get('accountId')).toBe(context.accountId);
      expect(request?.searchParams.get('repositoryId')).toBe(context.repositoryId);
      expect(JSON.parse(request?.searchParams.get('source') ?? '{}')).toEqual({ kind: 'pr', number: 2, sourceRepo: { owner: 'mona', repo: 'teapot' } });
      expect(container.textContent).toContain('README.md');
      expect(container.textContent).not.toContain('GitHub not connected');
      // The board's handoff was consumed, but its context was retained. A
      // later authoritative binding revision must replace that authority.
      const bound = { ...BINDING, binding: { ...BINDING.binding, providers: BINDING.binding.providers.map((entry) => ({ ...entry, provider, instance: context.instance, accountId: context.accountId })) } };
      const mutation = repositoryBindingOwner.captureMutation(repositoryBindingOwner.scope('/repo'), bound);
      const beforeRebind = urls.length;
      const replacement = { ...context, accountId: `${provider}#8`, bindingRevision: 5 };
      const freshStatus = { ...connected, accounts: connected.accounts.map((account) => ({ ...account, id: replacement.accountId, credentialId: replacement.accountId })) };
      useSourceControlAuthStore.setState((state) => ({ entries: { ...state.entries, [getSourceControlAuthKey(replacement)]: { status: freshStatus, isLoading: false, hasChecked: true } } }));
      await act(async () => {
        usePullRequestSelectionStore.getState().requestDiff('/repo', { kind: 'pr', number: 97, sourceRepo: { owner: 'mona', repo: 'teapot' } }, context);
        expect(repositoryBindingOwner.setMutationResult(mutation, { ...bound, revision: 5, binding: { ...bound.binding, revision: 5, providers: bound.binding.providers.map((entry) => ({ ...entry, accountId: replacement.accountId })) } })).toBe(true);
        mutation.release();
      });
      for (let round = 0; round < 4; round += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
      const afterRebind = urls.slice(beforeRebind).filter((url) => url.pathname === '/api/walkthrough/pr-diff');
      expect(afterRebind.every((url) => url.searchParams.get('bindingRevision') !== '4')).toBe(true);
      expect(usePullRequestSelectionStore.getState().diffContexts.get('/repo')).toBeUndefined();
      expect([...usePullRequestSelectionStore.getState().selections.entries()].some(([key, value]) => key.includes(replacement.accountId) && value.source.number === 97)).toBe(false);
      await act(async () => usePullRequestSelectionStore.getState().requestDiff('/repo', { kind: 'pr', number: 2, sourceRepo: { owner: 'mona', repo: 'teapot' } }, replacement));
      for (let round = 0; round < 4; round += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
      expect(urls.slice(beforeRebind).some((url) => url.pathname === '/api/walkthrough/pr-diff' && url.searchParams.get('bindingRevision') === '5')).toBe(true);
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
}
