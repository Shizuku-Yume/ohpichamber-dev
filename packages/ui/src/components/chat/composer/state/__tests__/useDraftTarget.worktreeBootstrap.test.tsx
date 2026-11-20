import { act } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

const PROJECT = { id: 'project', path: '/repo' };
const WORKTREE = '/repo-feature';

describe('useDraftTarget while a new worktree attaches', () => {
  let dom: Window;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    dom = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, {
      window: dom,
      document: dom.document, Event: dom.Event, CustomEvent: dom.CustomEvent,
      navigator: dom.navigator,
      localStorage: dom.localStorage,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
      if (url.pathname === '/api/fs/home') return Response.json({ home: '/sandbox' });
      return new Response(null, { status: 503 });
    }, originalFetch);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    dom.close();
  });

  test.each(['staged', 'unstaged'])('refreshes a clean draft warning after a %s edit and clears it after commit', async (change) => {
    const { createRoot } = await import('react-dom/client');
    const { I18nProvider } = await import('@/lib/i18n');
    const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
    const { createWebAPIs } = await import('../../../../../../../web/src/api/index');
    const { useProjectsStore } = await import('@/stores/useProjectsStore');
    const { useSessionUIStore } = await import('@/sync/session-ui-store');
    const { useGitStore } = await import('@/stores/useGitStore');
    const { notifyGitStatusInvalidated } = await import('@/lib/gitStatusInvalidation');
    const { useDraftTarget } = await import('../useDraftTarget');
    let dirty = false;
    let failStatus = false;
    let lightStatusReads = 0;
    const status = () => ({ current: 'main', tracking: null, ahead: 0, behind: 0,
      files: dirty ? [{ path: 'file.txt', index: change === 'staged' ? 'M' : ' ', working_dir: change === 'unstaged' ? 'M' : ' ' }] : [], isClean: !dirty });
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
      if (url.pathname === '/api/git/status') {
        if (url.searchParams.get('mode') === 'light') lightStatusReads += 1;
        return failStatus ? new Response(null, { status: 503 }) : Response.json(status());
      }
      if (url.pathname === '/api/git/branches') return Response.json({ all: ['main'], current: 'main', branches: {} });
      if (url.pathname === '/api/fs/home') return Response.json({ home: '/sandbox' });
      return new Response(null, { status: 503 });
    }, originalFetch);
    const apis = createWebAPIs();
    await useGitStore.getState().fetchStatus(PROJECT.path, {
      ...apis.git, checkIsGitRepository: async () => true, getGitStatus: async () => status(),
    });
    useProjectsStore.setState({ projects: [PROJECT], activeProjectId: PROJECT.id });
    useSessionUIStore.setState({ availableWorktreesByProject: new Map(), newSessionDraft: {
      draftId: 2, open: true, selectedProjectId: PROJECT.id, directoryOverride: PROJECT.path,
      parentID: null, target: 'project',
    } });
    let hasChanges = false;
    const Probe = () => {
      hasChanges = useDraftTarget(true).selectedDraftDirectoryHasUncommittedChanges;
      return null;
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<I18nProvider><RuntimeAPIContext.Provider value={apis}><Probe /></RuntimeAPIContext.Provider></I18nProvider>));
      expect(hasChanges).toBe(false);
      const indexRevision = useGitStore.getState().directories.get(PROJECT.path)?.indexRevision;
      dirty = true;
      await act(async () => {
        notifyGitStatusInvalidated(PROJECT.path);
        await useGitStore.getState().fetchStatus(PROJECT.path, apis.git, { silent: true, force: true });
      });
      if (change === 'unstaged') {
        expect(useGitStore.getState().directories.get(PROJECT.path)?.indexRevision).toBe(indexRevision);
      }
      for (let attempt = 0; attempt < 20 && !hasChanges; attempt += 1) {
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
      }
      expect(hasChanges).toBe(true);
      const readsBeforeOtherDirectory = lightStatusReads;
      await act(async () => {
        await useGitStore.getState().fetchStatus(WORKTREE, {
          ...apis.git, checkIsGitRepository: async () => true, getGitStatus: async () => status(),
        }, { silent: true, force: true });
      });
      expect(lightStatusReads).toBe(readsBeforeOtherDirectory);
      failStatus = true;
      await act(async () => {
        notifyGitStatusInvalidated(PROJECT.path);
        useGitStore.getState().bumpIndexRevision(PROJECT.path);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(hasChanges).toBe(true);
      failStatus = false;
      dirty = false;
      await act(async () => {
        notifyGitStatusInvalidated(PROJECT.path);
        useGitStore.getState().bumpIndexRevision(PROJECT.path);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(hasChanges).toBe(false);
    } finally {
      await act(async () => root.unmount());
    }
  });

  test('keeps the selected worktree listed until its bootstrap settles, without rewriting the draft', async () => {
    const { createRoot } = await import('react-dom/client');
    const { I18nProvider } = await import('@/lib/i18n');
    const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
    const { createWebAPIs } = await import('../../../../../../../web/src/api/index');
    const { useProjectsStore } = await import('@/stores/useProjectsStore');
    const { useSessionUIStore } = await import('@/sync/session-ui-store');
    const { markWorktreeBootstrapPending, setWorktreeBootstrapState, clearWorktreeBootstrapState } = await import('@/lib/worktrees/worktreeBootstrap');
    const { useDraftTarget } = await import('../useDraftTarget');

    useProjectsStore.setState({ projects: [PROJECT], activeProjectId: PROJECT.id });
    useSessionUIStore.setState({
      availableWorktreesByProject: new Map(),
      newSessionDraft: {
        draftId: 1,
        open: true,
        selectedProjectId: PROJECT.id,
        directoryOverride: WORKTREE,
        parentID: null,
        target: 'project',
      },
    });
    markWorktreeBootstrapPending(WORKTREE);

    let listed: string[] = [];
    const Probe = () => {
      listed = useDraftTarget(false).draftBranchItems.map((item) => item.value);
      return null;
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider>
          <RuntimeAPIContext.Provider value={createWebAPIs()}>
            <Probe />
          </RuntimeAPIContext.Provider>
        </I18nProvider>,
      );
    });

    // Git lists the worktree only once its attach finishes, so a refresh in
    // this window omits it; the selection must survive that.
    expect(listed).toContain(WORKTREE);
    await act(async () => {
      useSessionUIStore.setState({ availableWorktreesByProject: new Map([[PROJECT.path, []]]) });
    });
    expect(listed).toContain(WORKTREE);
    expect(useSessionUIStore.getState().newSessionDraft.directoryOverride).toBe(WORKTREE);

    await act(async () => {
      setWorktreeBootstrapState(WORKTREE, { status: 'failed', error: 'attach failed', updatedAt: Date.now() });
    });
    expect(listed).not.toContain(WORKTREE);

    await act(async () => root.unmount());
    clearWorktreeBootstrapState(WORKTREE);
  });
});
