import React from 'react';
import { type FileNode, type FilesViewProps } from './fileViewTypes';
import { guardFileTabSelection } from '../fileTabSelectionGuard';
import { normalizeContextPanelDirectoryKey } from '@/stores/ui/contextTabs';
import { toComparablePath } from './fileViewPaths';
import { registerCloseTabTarget } from '@/lib/closeTabTarget';
import { type useFileSaving, type useFileDraft } from './useFileSaving';
import { type useFileOpening } from './useFileOpening';
import { type useFileCanvasState } from './useFileCanvas';
import { type useFileDocument } from './useFileDocument';
import { type useFileLayout } from './useFileLayout';
import { type useFileScope } from './useFileScope';
import { type useFileTabs } from './useFileTabs';

export function useFileCloseState() {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = React.useState(false);
  const pendingSelectFileRef = React.useRef<FileNode | null>(null);
  const pendingClosePathRef = React.useRef<string | null>(null);
  const skipDirtyOnceRef = React.useRef(false);

  return { confirmDiscardOpen, setConfirmDiscardOpen, pendingSelectFileRef, pendingClosePathRef, skipDirtyOnceRef };
}

export function useFileClosing({ canvasState, closeState, draft, fileDocument, fileOpening, fileSaving, layout, scope, tabs, isMobile, onCloseFile, visible, fileTabCloseGuard, fileTabSelectionGuard }: {
  canvasState: Pick<ReturnType<typeof useFileCanvasState>, 'setCanvasDirty' | 'setCanvasRemountNonce'>;
  closeState: Pick<ReturnType<typeof useFileCloseState>, 'pendingClosePathRef' | 'pendingSelectFileRef' | 'setConfirmDiscardOpen' | 'skipDirtyOnceRef'>;
  draft: Pick<ReturnType<typeof useFileDraft>, 'setDraftContent'>;
  fileDocument: Pick<ReturnType<typeof useFileDocument>, 'fileContent' | 'setDesktopImageSrc' | 'setFileContent' | 'setFileError' | 'setLoadedFilePath'>;
  fileOpening: Pick<ReturnType<typeof useFileOpening>, 'getNextOpenFile' | 'handleSelectFile'>;
  fileSaving: Pick<ReturnType<typeof useFileSaving>, 'isDirty' | 'saveDraft'>;
  layout: Pick<ReturnType<typeof useFileLayout>, 'setShowMobilePageContent'>;
  scope: Pick<ReturnType<typeof useFileScope>, 'root' | 'panelRoot'>;
  tabs: Pick<ReturnType<typeof useFileTabs>, 'openFiles' | 'removeOpenPath' | 'selectedFile' | 'setSelectedPath'>;
  isMobile: boolean;
  onCloseFile: FilesViewProps['onCloseFile'];
  visible: boolean;
  fileTabCloseGuard: FilesViewProps['fileTabCloseGuard'];
  fileTabSelectionGuard: FilesViewProps['fileTabSelectionGuard'];
}) {
  const { setCanvasDirty, setCanvasRemountNonce } = canvasState;
  const { pendingClosePathRef, pendingSelectFileRef, setConfirmDiscardOpen, skipDirtyOnceRef } = closeState;
  const { setDraftContent } = draft;
  const { fileContent, setDesktopImageSrc, setFileContent, setFileError, setLoadedFilePath } = fileDocument;
  const { getNextOpenFile, handleSelectFile } = fileOpening;
  const { isDirty, saveDraft } = fileSaving;
  const { setShowMobilePageContent } = layout;
  const { root, panelRoot } = scope;
  const { openFiles, removeOpenPath, selectedFile, setSelectedPath } = tabs;
  const pendingAction = React.useRef<(() => void) | null>(null);
  const confirmDraftAction = React.useCallback((action: () => void) => {
    if (pendingAction.current) return;
    pendingAction.current = action;
    pendingSelectFileRef.current = null;
    pendingClosePathRef.current = null;
    setConfirmDiscardOpen(true);
  }, [pendingClosePathRef, pendingSelectFileRef, setConfirmDiscardOpen]);
  React.useLayoutEffect(() => {
    pendingAction.current = null;
    setConfirmDiscardOpen(false);
  }, [panelRoot, selectedFile?.path, setConfirmDiscardOpen]);
  React.useLayoutEffect(() => {
    if (!fileTabSelectionGuard) return;
    const guard: NonNullable<FilesViewProps['fileTabSelectionGuard']>['current'] = (directoryKey, targetPath, select) => guardFileTabSelection({
      sameDirectory: directoryKey === normalizeContextPanelDirectoryKey(panelRoot),
      currentPath: selectedFile ? toComparablePath(selectedFile.path) : null,
      targetPath: targetPath ? toComparablePath(targetPath) : null,
      isDirty,
      confirm: confirmDraftAction,
      select,
    });
    fileTabSelectionGuard.current = guard;
    return () => {
      if (fileTabSelectionGuard.current === guard) fileTabSelectionGuard.current = null;
    };
  }, [confirmDraftAction, fileTabSelectionGuard, isDirty, panelRoot, selectedFile]);
  React.useLayoutEffect(() => {
    if (!fileTabCloseGuard) return;
    const guard: NonNullable<FilesViewProps['fileTabCloseGuard']>['current'] = (directoryKey, paths, close) => {
      if (directoryKey === normalizeContextPanelDirectoryKey(panelRoot) && selectedFile && isDirty
        && (paths === 'all' || paths.some((path) => toComparablePath(path) === toComparablePath(selectedFile.path)))) {
        confirmDraftAction(close);
      } else close();
    };
    fileTabCloseGuard.current = guard;
    return () => {
      if (fileTabCloseGuard.current === guard) fileTabCloseGuard.current = null;
    };
  }, [confirmDraftAction, fileTabCloseGuard, isDirty, panelRoot, selectedFile]);

  const closeOpenFile = React.useCallback((path: string, nextFile: FileNode | null) => {
    if (onCloseFile) {
      onCloseFile(path);
      return;
    }

    if (root) {
      removeOpenPath(root, path);
    }

    if (selectedFile?.path !== path) {
      return;
    }

    if (nextFile) {
      void handleSelectFile(nextFile);
      return;
    }

    if (root) {
      setSelectedPath(root, null);
    }
    setFileContent('');
    setFileError(null);
    setDesktopImageSrc('');
    setLoadedFilePath(null);
    if (isMobile) {
      setShowMobilePageContent(false);
    }
  }, [handleSelectFile, isMobile, onCloseFile, removeOpenPath, root, selectedFile?.path, setDesktopImageSrc, setFileContent, setFileError, setLoadedFilePath, setSelectedPath, setShowMobilePageContent]);

  const discardAndContinue = React.useCallback(() => {
    const nextFile = pendingSelectFileRef.current;
    const closePath = pendingClosePathRef.current;

    pendingSelectFileRef.current = null;
    pendingClosePathRef.current = null;

    skipDirtyOnceRef.current = true;

    setConfirmDiscardOpen(false);

    setCanvasDirty(false);
    setCanvasRemountNonce((nonce) => nonce + 1);
    setDraftContent(fileContent);

    if (pendingAction.current) {
      const action = pendingAction.current;
      pendingAction.current = null;
      action();
      return;
    }

    if (closePath) {
      closeOpenFile(closePath, nextFile);
      return;
    }

    if (nextFile) {
      void handleSelectFile(nextFile);
      return;
    }

  }, [closeOpenFile, fileContent, handleSelectFile, pendingClosePathRef, pendingSelectFileRef, setCanvasDirty, setCanvasRemountNonce, setConfirmDiscardOpen, setDraftContent, skipDirtyOnceRef]);

  const saveAndContinue = React.useCallback(async () => {
    const nextFile = pendingSelectFileRef.current;
    const closePath = pendingClosePathRef.current;

    const saved = await saveDraft();
    if (!saved) {
      skipDirtyOnceRef.current = false;
      return;
    }

    pendingSelectFileRef.current = null;
    pendingClosePathRef.current = null;

    skipDirtyOnceRef.current = true;

    setConfirmDiscardOpen(false);

    if (pendingAction.current) {
      const action = pendingAction.current;
      pendingAction.current = null;
      action();
      return;
    }

    if (closePath) {
      closeOpenFile(closePath, nextFile);
      return;
    }

    if (nextFile) {
      await handleSelectFile(nextFile);
      return;
    }

  }, [closeOpenFile, handleSelectFile, pendingClosePathRef, pendingSelectFileRef, saveDraft, setConfirmDiscardOpen, skipDirtyOnceRef]);

  const handleCloseFile = React.useCallback((path: string) => {
    const isActive = selectedFile?.path === path;
    const nextFile = getNextOpenFile(path, openFiles);

    if (isActive && isDirty) {
      setConfirmDiscardOpen(true);
      pendingSelectFileRef.current = nextFile;
      pendingClosePathRef.current = path;
      return;
    }

    closeOpenFile(path, nextFile);
  }, [closeOpenFile, getNextOpenFile, isDirty, openFiles, pendingClosePathRef, pendingSelectFileRef, selectedFile?.path, setConfirmDiscardOpen]);

  const handleCloseFileRef = React.useRef(handleCloseFile);
  React.useEffect(() => {
    handleCloseFileRef.current = handleCloseFile;
  }, [handleCloseFile]);
  const closeTargetPath = selectedFile?.path ?? null;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!visible || !closeTargetPath) return;
    return registerCloseTabTarget(() => handleCloseFileRef.current(closeTargetPath), rootRef);
  }, [closeTargetPath, visible]);
  return {
    discardAndContinue, saveAndContinue, rootRef,
  };
}
