import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ReferencePickerItem } from '@/components/references/referencePickerItems';
import type { GitHubIssueReference } from '@/lib/api/types';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  Node: browser.Node,
  Event: browser.Event,
  CustomEvent: browser.CustomEvent,
  KeyboardEvent: browser.KeyboardEvent,
  MouseEvent: browser.MouseEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const reference: GitHubIssueReference = {
  kind: 'issue', number: 42, title: 'Fix the board launch', url: 'https://example.test/issues/42',
  body: '', bodyTruncated: false, createdAt: null, updatedAt: null, author: null, labels: [], commentCount: 0,
  sourceRepo: { source: 'github', owner: 'acme', repo: 'app' }, state: 'open',
};
const item: ReferencePickerItem = { source: 'github', reference };
const project = { id: 'project-1', path: '/workspace/app' };
const resolveCalls: unknown[] = [];
const pushedReferences: unknown[] = [];
type DraftOptions = { selectedProjectId?: string | null; directoryOverride?: string | null; preserveDirectoryOverride?: boolean };
const openedDrafts: DraftOptions[] = [];
const closedSurfaces: number[] = [];

const sessionState = {
  currentSessionId: 'session-7',
  newSessionDraft: { open: false },
  getDirectoryForSession: () => '/workspace/app',
  openNewSessionDraft: (options?: DraftOptions) => { if (options) openedDrafts.push(options); },
};
const useSessionUIStore = Object.assign(
  <T,>(selector: (state: typeof sessionState) => T): T => selector(sessionState),
  { getState: () => sessionState },
);
const uiState = { closeMainSurfaces: () => closedSurfaces.push(1) };
const useUIStore = Object.assign(
  <T,>(selector: (state: typeof uiState) => T): T => selector(uiState),
  { getState: () => uiState },
);

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => React.createElement('button', { type: 'button', onClick: onSelect }, children),
  DropdownMenuRadioGroup: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  DropdownMenuRadioItem: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
mock.module('@/components/ui/button', () => ({ Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement('button', { ...props, onClick, type: 'button' }, children) }));
mock.module('@/components/ui', () => ({ toast: { error: mock(() => undefined), success: mock(() => undefined), message: mock(() => undefined) } }));
mock.module('@/components/icon/Icon', () => ({ Icon: () => null }));
mock.module('@/components/icons/DiffIcon', () => ({ DiffViewIcon: () => null }));
mock.module('@/components/ui/confirm-dialog', () => ({ useConfirmDialog: () => ({ confirm: async () => false, dialog: null }) }));
mock.module('@/hooks/useRuntimeAPIs', () => ({ useRuntimeAPIs: () => ({ sourceControl: {}, linear: null }) }));
mock.module('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
mock.module('@/stores/usePullRequestSelectionStore', () => ({ usePullRequestSelectionStore: () => null }));
mock.module('@/stores/useWalkthroughStore', () => ({ useWalkthroughStore: () => null }));
mock.module('@/stores/useUIStore', () => ({ useUIStore }));
mock.module('@/sync/session-ui-store', () => ({ useSessionUIStore }));
mock.module('@/sync/sync-context', () => ({ useSession: () => ({ metadata: { title: 'Current session' } }) }));
mock.module('@/components/chat/composer/pendingComposerReferences', () => ({ usePendingComposerReferences: { getState: () => ({ push: (references: unknown[]) => pushedReferences.push(...references) }) } }));
mock.module('@/components/references/resolveComposerReferences', () => ({ resolveComposerReferences: async (selection: unknown[]) => { resolveCalls.push(selection); return { references: selection, failures: [] }; } }));
mock.module('@/components/references/referenceSources', () => ({ readLinearIssueDetail: async () => null }));
mock.module('@/stores/useProjectsStore', () => ({ useProjectsStore: () => [] }));

const { SourceBoardActions } = await import('./SourceBoardActions');

describe('SourceBoardActions launch behavior', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    openedDrafts.length = 0;
    pushedReferences.length = 0;
    resolveCalls.length = 0;
    closedSurfaces.length = 0;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const render = async (onStartWorktree = () => undefined, onLeave = () => undefined) => {
    await act(async () => {
      root.render(
        <SourceBoardActions
          item={item}
          project={project}
          context={null}
          onStartWorktree={onStartWorktree}
          onChanged={() => undefined}
          onLeave={onLeave}
        />,
      );
    });
  };

  test('starts a canonical project draft and attaches the selected reference', async () => {
    const left = mock(() => undefined);
    await render(undefined, left);
    const button = [...host.querySelectorAll('button')].find((entry) => entry.textContent?.includes('sourceBoard.actions.newSession'));
    expect(button).toBeTruthy();
    await act(async () => button?.click());
    await Promise.resolve();
    expect(openedDrafts).toEqual([{ selectedProjectId: 'project-1', directoryOverride: '/workspace/app' }]);
    expect(left).toHaveBeenCalledTimes(1);
    expect(resolveCalls).toHaveLength(1);
    expect(pushedReferences).toEqual([{ source: 'github', reference, includeDiff: false }]);
  });

  test('closes board surfaces before attaching to the current session', async () => {
    const left = mock(() => undefined);
    await render(undefined, left);
    const button = [...host.querySelectorAll('button')].find((entry) => entry.textContent?.includes('sourceBoard.actions.currentSession'));
    expect(button).toBeTruthy();
    await act(async () => button?.click());
    await Promise.resolve();
    expect(closedSurfaces).toEqual([1]);
    expect(left).toHaveBeenCalledTimes(1);
    expect(resolveCalls).toHaveLength(1);
    expect(pushedReferences).toEqual([{ source: 'github', reference, includeDiff: false }]);
  });

  test('delegates worktree creation with the selected project and reference', async () => {
    const worktree = mock(() => undefined);
    await render(worktree);
    const button = [...host.querySelectorAll('button')].find((entry) => entry.textContent?.includes('sourceBoard.actions.newWorktreeSession'));
    expect(button).toBeTruthy();
    await act(async () => button?.click());
    expect(worktree).toHaveBeenCalledWith(project, { source: 'github', reference, includeDiff: false });
    expect(openedDrafts).toHaveLength(0);
  });
});
