import React, { act } from 'react';
import { expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';

// A row is one case of the matrix, named so the callback destructures it
// instead of each element arriving as `any`.
type ConflictCase = ['merge' | 'cherry-pick', 'current' | 'new', boolean];

const CONFLICT_CASES: readonly ConflictCase[] = [
  ['merge', 'current', false], ['merge', 'current', true], ['merge', 'new', false], ['merge', 'new', true],
  ['cherry-pick', 'current', false], ['cherry-pick', 'current', true], ['cherry-pick', 'new', false], ['cherry-pick', 'new', true],
];

test.each(CONFLICT_CASES)('%s %s destination rejects a runtime switch (return=%s) during prompt read', async ([surface, destination, returnToA]) => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, location: dom.location, localStorage: dom.localStorage, Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent, KeyboardEvent: dom.KeyboardEvent, MouseEvent: dom.MouseEvent, MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver, getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const git = await import('@/lib/gitApi');
  const { switchRuntimeEndpoint } = await import('@/lib/runtime-switch');
  const { useSessionUIStore } = await import('@/sync/session-ui-store');
  const { useInputStore } = await import('@/sync/input-store');
  const { ConflictDialog } = await import('./ConflictDialog');
  const integrate = await import('@/lib/git/integrateWorktreeCommits');
  const { IntegrateCommitsSection } = await import('./IntegrateCommitsSection');
  const cherry = spyOn(integrate, 'isCherryPickInProgress').mockResolvedValue(true);
  const cherryDetails = spyOn(integrate, 'getIntegrateConflictDetails').mockResolvedValue({ statusPorcelain: 'UU file', unmergedFiles: ['file'], diff: 'private', currentPatchMeta: 'commit', currentPatch: 'private patch' });
  const previousSession = useSessionUIStore.getState().currentSessionId;
  const detail = spyOn(git, 'getConflictDetails').mockResolvedValue({ operation: 'merge', headInfo: 'head', diff: 'sensitive', statusPorcelain: 'UU file', unmergedFiles: ['file'] });
  const draft = spyOn(useSessionUIStore.getState(), 'openNewSessionDraft');
  const text = spyOn(useInputStore.getState(), 'setPendingInputText');
  const synthetic = spyOn(useInputStore.getState(), 'setPendingSyntheticParts');
  let release!: () => void; let start!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const reached = new Promise<void>((resolve) => { start = resolve; });
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    if (url.pathname === '/api/magic-prompts') { start(); await gate; return Response.json({ version: 1, overrides: {} }); }
    return Response.json({});
  });
  switchRuntimeEndpoint({ apiBaseUrl: 'http://a.test', runtimeKey: 'conflict-a' });
  useSessionUIStore.setState({ currentSessionId: 'session-a' });
  dom.localStorage.setItem('openchamber.integrate.conflict:session-a', JSON.stringify({ repoRoot: '/repo', tempWorktreePath: '/tmp/worktree', sourceBranch: 'feature', targetBranch: 'main', cleanTargetWorktrees: [], remainingCommits: [], currentCommit: 'abc1234' }));
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => { root.render(<I18nProvider>{surface === 'merge'
      ? <ConflictDialog open onOpenChange={() => {}} directory="/repo" operation="merge" onAbort={() => {}} />
      : <IntegrateCommitsSection repoRoot="/repo" promptDirectory="/repo/subdir" sourceBranch="feature" defaultTargetBranch="feature" localBranches={[]} worktreeMetadata={{ path: '/repo', projectDirectory: '/repo', branch: 'feature', label: 'feature' }} />}</I18nProvider>); });
    const label = surface === 'merge' ? (destination === 'current' ? 'Resolve in current session' : 'Resolve in new session') : (destination === 'current' ? 'Current session' : 'New session');
    const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === label);
    if (!button) throw new Error(`Missing ${label}`);
    await act(async () => { button.click(); await reached; });
    switchRuntimeEndpoint({ apiBaseUrl: 'http://b.test', runtimeKey: 'conflict-b' });
    if (returnToA) switchRuntimeEndpoint({ apiBaseUrl: 'http://a.test', runtimeKey: 'conflict-a' });
    await act(async () => { release(); await gate; });
    expect(draft).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled(); expect(synthetic).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount()); fetch.mockRestore(); detail.mockRestore(); cherry.mockRestore(); cherryDetails.mockRestore(); draft.mockRestore(); text.mockRestore(); synthetic.mockRestore();
    useSessionUIStore.setState({ currentSessionId: previousSession }); await dom.happyDOM.abort();
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
