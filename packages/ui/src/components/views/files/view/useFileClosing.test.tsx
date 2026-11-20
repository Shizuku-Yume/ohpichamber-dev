import { expect, test } from 'bun:test';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { installHookTestDom } from '@/components/session/sidebar/test-utils/testDom';
import type { FileTabSelectionGuard } from '../fileTabSelectionGuard';
import type { FileTabCloseGuard, FileNode } from './fileViewTypes';
import { useFileClosing, useFileCloseState } from './useFileClosing';

test('file tab guards scope dirty confirmations and retain pending actions after failed saves', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  const closeGuard = createRef<FileTabCloseGuard>();
  const selectionGuard = createRef<FileTabSelectionGuard>();
  let file: FileNode | null = { name: 'a.txt', path: '/repo/a.txt', type: 'file' };
  let dirty = false;
  let saved = false;
  let confirmations = false;
  let continued = 0;
  let closing: ReturnType<typeof useFileClosing>;
  const continueAction = () => { continued += 1; };
  const noop = () => undefined;
  function Probe() {
    const closeState = useFileCloseState();
    confirmations = closeState.confirmDiscardOpen;
    closing = useFileClosing({
      canvasState: { setCanvasDirty: noop, setCanvasRemountNonce: noop },
      closeState,
      draft: { setDraftContent: noop },
      fileDocument: { fileContent: '', setDesktopImageSrc: noop, setFileContent: noop, setFileError: noop, setLoadedFilePath: noop },
      fileOpening: { getNextOpenFile: () => null, handleSelectFile: async () => undefined },
      fileSaving: { isDirty: dirty, saveDraft: async () => saved },
      layout: { setShowMobilePageContent: noop },
      scope: { root: '/repo', panelRoot: '/repo' },
      tabs: { openFiles: [], removeOpenPath: noop, selectedFile: file, setSelectedPath: noop },
      isMobile: false,
      onCloseFile: undefined,
      visible: false,
      fileTabCloseGuard: closeGuard,
      fileTabSelectionGuard: selectionGuard,
    });
    return null;
  }
  const render = async () => { await act(async () => root.render(<Probe />)); };
  try {
    await render();
    act(() => closeGuard.current?.('/repo', 'all', continueAction));
    expect(continued).toBe(1);
    dirty = true;
    await render();
    act(() => closeGuard.current?.('/elsewhere', 'all', continueAction));
    act(() => closeGuard.current?.('/repo', ['/repo/b.txt'], continueAction));
    act(() => selectionGuard.current?.('/repo', '/repo/a.txt', continueAction));
    expect(continued).toBe(4);
    act(() => closeGuard.current?.('/repo', ['/repo/a.txt'], continueAction));
    expect(confirmations).toBe(true);
    expect(continued).toBe(4);
    await act(async () => { await closing.saveAndContinue(); });
    expect(confirmations).toBe(true);
    expect(continued).toBe(4);
    saved = true;
    await act(async () => { await closing.saveAndContinue(); });
    expect(confirmations).toBe(false);
    expect(continued).toBe(5);
    act(() => selectionGuard.current?.('/repo', '/repo/b.txt', continueAction));
    expect(confirmations).toBe(true);
    act(() => closing.discardAndContinue());
    expect(continued).toBe(6);
    expect(confirmations).toBe(false);
    file = null;
    await render();
    act(() => closeGuard.current?.('/repo', 'all', continueAction));
    expect(continued).toBe(7);
    expect(confirmations).toBe(false);
  } finally {
    await act(async () => root.unmount());
    expect(closeGuard.current).toBeNull();
    expect(selectionGuard.current).toBeNull();
    dom.restore();
  }
});
