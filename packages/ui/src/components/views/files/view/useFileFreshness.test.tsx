import { afterEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import type { PendingPathMove } from './useFileDocument';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/', width: 1280, height: 800 });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement, Event: browser.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// React DOM reads the DOM when imported, so the module import order is part of the fixture.
const { createRoot } = await import('react-dom/client');
const { useFileFreshness } = await import('./useFileFreshness');
const { beginFilePathMove } = await import('@/lib/filePathMoves');
const { FilesystemError } = await import('@/lib/api/files-errors');

let documentHidden = false;
Object.defineProperty(browser.document, 'hidden', { configurable: true, get: () => documentHidden });

type Args = Parameters<typeof useFileFreshness>[0];
type FileNode = NonNullable<Args['tabs']['selectedFile']>;

type HarnessState = {
  draftContent: string;
  failedFilePath: string | null;
  fileContent: string;
  fileError: string | null;
};

type HarnessOptions = {
  isDirty?: boolean;
  loadedFilePath?: string;
  readFile?: (path: string) => Promise<string>;
  readFileStat: (path: string) => Promise<{ path: string; size: number; mtimeMs: number } | null>;
};

type Harness = {
  state: HarnessState;
  render: (path: string | null) => Promise<void>;
  selectFile: (path: string | null) => Promise<void>;
  setPendingPathMove: (move: PendingPathMove | null) => Promise<void>;
  unmount: () => Promise<void>;
};

const missingFileError = (): Error => new FilesystemError('file not found', { reason: 'not-found' });

const fileNode = (path: string): FileNode => ({ name: path.split('/').pop() ?? '', path, type: 'file' });

const createHarness = (options: HarnessOptions): Harness => {
  const state: HarnessState = {
    draftContent: '',
    failedFilePath: null,
    fileContent: '',
    fileError: null,
  };
  const noop = () => undefined;

  // Stable identities mirror the production wiring, where the document module
  // hands out useState setters and useRef objects that never change identity.
  // The hook passes plain values to every mirrored setter; updater functions
  // only ever go to setFileContentRevision, which the harness no-ops.
  const fileSaving: Args['fileSaving'] = {
    applyLoadedTextContent: (content: string) => content,
    isDirty: options.isDirty ?? false,
    readFile: options.readFile ?? (async () => 'content'),
    readFileStat: options.readFileStat,
  };
  const diagram: Args['diagram'] = { diagramSavedXmlRef: { current: '' }, diagramXmlRef: { current: '' } };
  const scope: Args['scope'] = { fileScopeRef: { current: 'scope' }, root: '/repo' };
  const draft: Args['draft'] = { setDraftContent: noop };
  const pendingPathMoveRef: React.MutableRefObject<PendingPathMove | null> = { current: null };
  const refs = {
    activeFileLoadIdRef: { current: 0 },
    lastLoadedFileContentRef: { current: 'content' },
    lastLoadedFileRevisionRef: { current: 1 },
    lastLoadedFileStatRef: { current: null },
    loadingFilePathRef: { current: null },
    missingSeenPathRef: { current: null },
    pendingPathMoveRef,
  };
  // SAFETY: the production translator is a context value keyed by message id;
  // the harness only surfaces the key when an error path fires, so the
  // pass-through identity covers every key the hook can request.
  const t = ((key: string) => key) as Args['t'];

  let reactRoot: Root | null = null;
  let selectedPath: string | null = null;
  let probeApi: {
    setPendingPathMove: (move: PendingPathMove | null) => void;
  } | null = null;

  function Probe() {
    const [failedFilePath, setFailedFilePath] = React.useState<string | null>(null);
    const [loadedFilePath, setLoadedFilePath] = React.useState<string | null>(options.loadedFilePath ?? '/repo/a.txt');
    const [fileError, setFileError] = React.useState<string | null>(null);
    const [fileContent, setFileContent] = React.useState<string>('content');
    state.fileContent = fileContent;
    state.failedFilePath = failedFilePath;
    state.fileError = fileError;
    probeApi = {
      setPendingPathMove: (move) => {
        pendingPathMoveRef.current = move;
      },
    };
    useFileFreshness({
      diagram,
      draft,
      fileDocument: {
        ...refs,
        pendingPathMoveRef,
        contentDetectedBinary: false,
        failedFilePath,
        loadedFilePath,
        setDesktopImageSrc: noop,
        setFailedFilePath,
        setFileContent,
        setFileContentRevision: noop,
        setFileError,
        setLoadedFilePath,
      },
      fileSaving,
      scope,
      tabs: { selectedFile: selectedPath ? fileNode(selectedPath) : null },
      t,
      visible: true,
    });
    return null;
  }

  const flush = async () => {
    await act(async () => reactRoot?.render(<Probe />));
  };

  return {
    state,
    render: async (path) => {
      selectedPath = path;
      reactRoot = createRoot(document.createElement('div'));
      await flush();
    },
    selectFile: async (path) => {
      selectedPath = path;
      await flush();
    },
    setPendingPathMove: async (move) => {
      await act(async () => probeApi?.setPendingPathMove(move));
    },
    unmount: async () => {
      await act(async () => reactRoot?.unmount());
      reactRoot = null;
    },
  };
};

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const pollAgain = async () => {
  await act(async () => {
    browser.document.dispatchEvent(new browser.Event('visibilitychange'));
  });
  await flushMicrotasks();
};

describe('useFileFreshness move suppression', () => {
  afterEach(() => {
    documentHidden = false;
  });

  test('a missing stat with no move in flight surfaces the missing state', async () => {
    const harness = createHarness({
      readFileStat: async (path) => {
        if (path === '/repo/a.txt') throw missingFileError();
        return null;
      },
    });
    try {
      await harness.render('/repo/a.txt');
      await flushMicrotasks();
      expect(harness.state.failedFilePath).toBe('/repo/a.txt');
    } finally {
      await harness.unmount();
    }
  });

  test('a missing stat while the rename is in flight does not clear the document', async () => {
    const harness = createHarness({
      readFileStat: async (path) => {
        if (path === '/repo/a.txt') throw missingFileError();
        return null;
      },
    });
    const move = beginFilePathMove('/repo/a.txt');
    try {
      await harness.render('/repo/a.txt');
      await flushMicrotasks();
      expect(harness.state.failedFilePath).toBeNull();
      expect(harness.state.fileError).toBeNull();
      await pollAgain();
      await pollAgain();
      expect(harness.state.failedFilePath).toBeNull();
      expect(harness.state.fileError).toBeNull();
    } finally {
      move.abort();
      await harness.unmount();
    }
  });

  test('a missing stat in the commit window before the document follows does not clear the document', async () => {
    // The rename lands on the server before the client commit: the pre-move
    // path starts erroring exactly when the pending move is written, mirroring
    // the commit continuation in moveWorkspacePath.
    let renamed = false;
    const harness = createHarness({
      readFileStat: async (path) => {
        if (path === '/repo/a.txt' && renamed) throw missingFileError();
        return { path, size: 7, mtimeMs: 1000 };
      },
    });
    try {
      await harness.render('/repo/a.txt');
      await flushMicrotasks();
      expect(harness.state.failedFilePath).toBeNull();
      renamed = true;
      await harness.setPendingPathMove({ from: '/repo/a.txt', to: '/repo/b.txt' });
      await pollAgain();
      expect(harness.state.failedFilePath).toBeNull();
      expect(harness.state.fileError).toBeNull();
      await pollAgain();
      expect(harness.state.failedFilePath).toBeNull();
      expect(harness.state.fileError).toBeNull();
    } finally {
      await harness.unmount();
    }
  });
});
