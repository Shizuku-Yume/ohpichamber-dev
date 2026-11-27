import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import type { SelectedLineRange } from './fileViewTypes';
import type { PendingPathMove } from './useFileDocument';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/', width: 1280, height: 800 });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement, Event: browser.Event,
  CustomEvent: browser.CustomEvent, MutationObserver: browser.MutationObserver,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// React DOM reads the DOM when imported, so the module import order is part of the fixture.
const { createRoot } = await import('react-dom/client');
const { useFileComments } = await import('./useFileComments');
const { I18nProvider } = await import('@/lib/i18n');
const { SyncProvider } = await import('@/sync/sync-context');
const { nativeClient } = await import('@/sync/session-message-loader-test-fixtures');
const { useSessionUIStore } = await import('@/sync/session-ui-store');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { useInputStore } = await import('@/sync/input-store');
const { useInlineCommentDraftStore } = await import('@/stores/useInlineCommentDraftStore');

type Args = Parameters<typeof useFileComments>[0];

const directory = '/repo';
const client = nativeClient();

type Harness = {
  readonly draftResets: number;
  readonly lineSelection: () => SelectedLineRange | null;
  readonly savingResets: number;
  selectFile: (path: string | null) => Promise<void>;
  renameOpenFile: (from: string, to: string) => Promise<void>;
  settleMove: () => Promise<void>;
  render: (path: string | null) => Promise<void>;
  unmount: () => Promise<void>;
};

const createHarness = (): Harness => {
  let draftResets = 0;
  let savingResets = 0;
  let reactRoot: Root | null = null;
  let selectedPath: string | null = '/repo/a.txt';
  let lineSelectionValue: SelectedLineRange | null = null;
  let probeApi: {
    setPendingPathMove: (move: PendingPathMove | null) => void;
  } | null = null;

  const draft: Args['draft'] = {
    setDraftContent: (content) => {
      if (content === '') draftResets += 1;
    },
    setIsSaving: (saving) => {
      if (saving === false) savingResets += 1;
    },
  };

  function Probe() {
    const [pendingPathMoveTo, setPendingPathMoveTo] = React.useState<string | null>(null);
    probeApi = {
      setPendingPathMove: (move) => {
        setPendingPathMoveTo(move?.to ?? null);
      },
    };
    const comments = useFileComments({
      draft,
      editor: { editorViewRef: { current: null } },
      fileDocument: {
        fileContent: 'line one\nline two',
        fileLoading: false,
        loadedFilePath: selectedPath,
        pendingPathMoveTo,
      },
      tabs: { selectedFile: selectedPath ? { name: selectedPath.split('/').pop() ?? '', path: selectedPath, type: 'file' } : null },
      isMobile: false,
      visible: true,
    });
    lineSelectionValue = comments.lineSelection;
    return null;
  }

  const render = async () => {
    await act(async () => reactRoot?.render(
      <I18nProvider>
        <SyncProvider client={client} directory={directory}>
          <Probe />
        </SyncProvider>
      </I18nProvider>,
    ));
  };

  return {
    get draftResets() { return draftResets; },
    get savingResets() { return savingResets; },
    lineSelection: () => lineSelectionValue,
    selectFile: async (path) => {
      selectedPath = path;
      await render();
    },
    renameOpenFile: async (from, to) => {
      // The production move continuation writes the pending move and rebases
      // the tab store in one synchronous commit, so the selection switch and
      // the move state land in the same render here as well.
      selectedPath = to;
      await act(async () => {
        probeApi?.setPendingPathMove({ from, to });
        reactRoot?.render(
          <I18nProvider>
            <SyncProvider client={client} directory={directory}>
              <Probe />
            </SyncProvider>
          </I18nProvider>,
        );
      });
    },
    settleMove: async () => {
      await act(async () => probeApi?.setPendingPathMove(null));
    },
    render: async (path) => {
      selectedPath = path;
      reactRoot = createRoot(document.createElement('div'));
      await render();
    },
    unmount: async () => {
      await act(async () => reactRoot?.unmount());
      reactRoot = null;
    },
  };
};

describe('useFileComments file switch reset', () => {
  beforeEach(() => {
    useProjectsStore.setState({ projects: [{ id: 'repo', path: directory }] });
    useSessionUIStore.setState({ currentSessionId: 'ses_1', currentSessionDirectory: directory });
    useInputStore.setState({ composerAddress: { inline: { directory, sessionKey: 'ses_1' }, attachments: null } });
    useInlineCommentDraftStore.setState({ drafts: {} });
  });

  afterEach(() => {
    useInlineCommentDraftStore.setState({ drafts: {} });
  });

  test('switching to another file clears the line selection and the draft state', async () => {
    const harness = createHarness();
    try {
      await harness.render('/repo/a.txt');
      const baselineDrafts = harness.draftResets;
      expect(harness.lineSelection()).toBeNull();
      await harness.selectFile('/repo/b.txt');
      expect(harness.draftResets).toBeGreaterThan(baselineDrafts);
      expect(harness.savingResets).toBeGreaterThan(0);
    } finally {
      await harness.unmount();
    }
  });

  test('a rename of the open file keeps the selection and the draft through the rebase render', async () => {
    const harness = createHarness();
    try {
      await harness.render('/repo/a.txt');
      const baselineDrafts = harness.draftResets;
      const baselineSaving = harness.savingResets;
      await harness.renameOpenFile('/repo/a.txt', '/repo/b.txt');
      expect(harness.draftResets).toBe(baselineDrafts);
      expect(harness.savingResets).toBe(baselineSaving);
    } finally {
      await harness.unmount();
    }
  });

  test('the move clearing after the rebase does not reset the settled selection', async () => {
    const harness = createHarness();
    try {
      await harness.render('/repo/a.txt');
      const baselineDrafts = harness.draftResets;
      const baselineSaving = harness.savingResets;
      await harness.renameOpenFile('/repo/a.txt', '/repo/b.txt');
      await harness.settleMove();
      expect(harness.draftResets).toBe(baselineDrafts);
      expect(harness.savingResets).toBe(baselineSaving);
    } finally {
      await harness.unmount();
    }
  });

  test('switching away after the move settles resets the draft state again', async () => {
    const harness = createHarness();
    try {
      await harness.render('/repo/a.txt');
      const baselineDrafts = harness.draftResets;
      await harness.renameOpenFile('/repo/a.txt', '/repo/b.txt');
      await harness.settleMove();
      expect(harness.draftResets).toBe(baselineDrafts);
      await harness.selectFile('/repo/c.txt');
      expect(harness.draftResets).toBeGreaterThan(baselineDrafts);
    } finally {
      await harness.unmount();
    }
  });
});
