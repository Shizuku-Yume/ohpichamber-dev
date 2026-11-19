import React from 'react';

import { toast } from '@/components/ui';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useGuestActions } from '@/hooks/useGuestSurfaces';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
<<<<<<< HEAD
import { guestActionsWhere, type GuestActionEntry } from '@/lib/guests/actions';
import { runGuestAction } from '@/lib/guests/run-action';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
||||||| bc50ba56aa
import { useDraftSpaceTarget } from '@/lib/spaces/useDraftSpaceTarget';
import { panelContentDirectory } from '@/lib/spaces/space-creation-requests';
import { SpacePreparing } from '@/components/session/spaces/SpacePreparing';
import { guestActionsWhere, type GuestActionEntry } from '@/lib/guests/actions';
import { runGuestAction } from '@/lib/guests/run-action';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
=======
import { useDraftSpaceTarget } from '@/lib/spaces/useDraftSpaceTarget';
import { panelContentDirectory } from '@/lib/spaces/space-creation-requests';
import { SpacePreparing } from '@/components/session/spaces/SpacePreparing';
>>>>>>> upstream/main
import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGitStatus, useGitStore } from '@/stores/useGitStore';
import { useFileTreeUpload } from '@/components/views/files/useFileTreeUpload';
import { useFileContentSearch } from '@/components/views/files/useFileContentSearch';
import { useDirectoryShowHidden } from '@/lib/directoryShowHidden';
<<<<<<< HEAD
import { setFilesViewShowGitignored, useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn, getRevealLabelKey } from '@/lib/utils';
import { hostFilesystem } from '@/lib/host-filesystem';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import {
  FileTreeChevron,
  FileTreeFileMarkers,
  FileTreeFolderBadge,
  FileTreeIndentGuides,
  FileTreeRowEnd,
} from '@/components/views/files/FileTreeRowParts';
import {
  fileTreeRowMenuFillClassName,
  fileTreeRowPaddingLeft,
  fileTreeRowStateClassName,
  type FileTreeGitStatus,
} from '@/components/views/files/fileTreeRow';
import { Icon } from "@/components/icon/Icon";
import { toastContextFileOpenFailure, validateContextFileOpen } from '@/lib/contextFileOpenGuard';
import { isBrowserClientRuntime, isDesktopLocalOriginActive, openDesktopPath } from '@/lib/desktop';
import { useDeviceInfo } from '@/lib/device';
||||||| bc50ba56aa
import { setFilesViewShowGitignored, useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn, getRevealLabelKey } from '@/lib/utils';
import { opencodeClient } from '@/lib/opencode/client';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import {
  FileTreeChevron,
  FileTreeFileMarkers,
  FileTreeFolderBadge,
  FileTreeIndentGuides,
  FileTreeRowEnd,
} from '@/components/views/files/FileTreeRowParts';
import {
  fileTreeRowMenuFillClassName,
  fileTreeRowPaddingLeft,
  fileTreeRowStateClassName,
  type FileTreeGitStatus,
} from '@/components/views/files/fileTreeRow';
import { Icon } from "@/components/icon/Icon";
import { toastContextFileOpenFailure, validateContextFileOpen } from '@/lib/contextFileOpenGuard';
import { isBrowserClientRuntime, isDesktopLocalOriginActive, openDesktopPath } from '@/lib/desktop';
import { useDeviceInfo } from '@/lib/device';
=======
import { useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import { cn } from '@/lib/utils';
import { isBrowserClientRuntime } from '@/lib/desktop';
>>>>>>> upstream/main
import { useI18n } from '@/lib/i18n';
<<<<<<< HEAD
import { isFileTreeDragWithinClickSlop, recordFileTreeDragStart, shouldTreatFileTreeDragEndAsClick } from './fileTreeDragClick';
import {
  getFileTreeDragSource,
  getFileTreeMovedPath,
  getFileTreeMoveTarget,
  setFileTreeDragSource,
  type FileTreeEntry,
} from './fileTreeMoveDrag';
import { buildFileTreeRows, withPinnedRowIndexes, type FileTreeRow } from './fileTreeRows';
import { problemMessage } from '@/lib/problemMessage';
||||||| bc50ba56aa
import { isFileTreeDragWithinClickSlop, recordFileTreeDragStart, shouldTreatFileTreeDragEndAsClick } from './fileTreeDragClick';
import {
  getFileTreeDragSource,
  getFileTreeMovedPath,
  getFileTreeMoveTarget,
  setFileTreeDragSource,
  type FileTreeEntry,
} from './fileTreeMoveDrag';
import { buildFileTreeRows, withPinnedRowIndexes, type FileTreeRow } from './fileTreeRows';
=======
import { type FileTreeRow } from './fileTreeRows';
import { FileTreeCrudDialog } from './sidebarFilesTree/FileTreeCrudDialog';
import { FileTreeDropIndicator } from './sidebarFilesTree/FileTreeDropIndicator';
import { FileTreeErrorRow } from './sidebarFilesTree/FileTreeErrorRow';
import { FileTreeFallbackList } from './sidebarFilesTree/FileTreeFallbackList';
import { FileTreeMoveDialog } from './sidebarFilesTree/FileTreeMoveDialog';
import { FileTreeSearchField, type FileTreeSearchMode } from './sidebarFilesTree/FileTreeSearchField';
import { FileTreeToolbar } from './sidebarFilesTree/FileTreeToolbar';
import { MemoizedFileRow } from './sidebarFilesTree/FileRow';
import type { FileNode } from './sidebarFilesTree/fileNode';
import { getDropTargetLabel, normalizePath } from './sidebarFilesTree/treePaths';
import { useFileNameSearch } from './sidebarFilesTree/useFileNameSearch';
import { useFileTreeDialogs } from './sidebarFilesTree/useFileTreeDialogs';
import { useFileTreeDragDrop } from './sidebarFilesTree/useFileTreeDragDrop';
import { useFileTreeGitMarks } from './sidebarFilesTree/useFileTreeGitMarks';
import { useFileTreeListing } from './sidebarFilesTree/useFileTreeListing';
import { useFileTreeOpening } from './sidebarFilesTree/useFileTreeOpening';
import { useFileTreeToggle } from './sidebarFilesTree/useFileTreeToggle';
import { useVirtualFileTree } from './sidebarFilesTree/useVirtualFileTree';
>>>>>>> upstream/main


export const SidebarFilesTree: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
  const runtimeKey = useGitStore((state) => state.runtimeKey);
  const panelDirectory = useEffectiveDirectory() ?? '';
<<<<<<< HEAD
  const directory = panelDirectory;
||||||| bc50ba56aa
  // A draft waiting for a new space lists the space, and nothing of this computer's until it runs.
  const draftSpace = useDraftSpaceTarget();
  const directory = panelContentDirectory(draftSpace, panelDirectory) ?? '';
  if (draftSpace?.kind === 'preparing') return <SpacePreparing />;
=======
  const draftSpace = useDraftSpaceTarget();
  const directory = panelContentDirectory(draftSpace, panelDirectory) ?? '';
  if (draftSpace?.kind === 'preparing') return <SpacePreparing />;
>>>>>>> upstream/main
  return <SidebarFilesTreeContent key={JSON.stringify([runtimeKey, directory])} visible={visible} currentDirectory={directory} panelDirectory={panelDirectory} />;
};

const SidebarFilesTreeContent: React.FC<{ visible: boolean; currentDirectory: string; panelDirectory: string }> = ({ visible, currentDirectory, panelDirectory }) => {
  const { t } = useI18n();
  const { files, runtime } = useRuntimeAPIs();
  const guestActions = useGuestActions();
  const isBrowserClient = isBrowserClientRuntime(runtime.platform);
  const root = normalizePath(currentDirectory.trim());
  const panelRoot = normalizePath(panelDirectory.trim());
  const showHidden = useDirectoryShowHidden();
  const showGitignored = useFilesViewShowGitignored();
  const gitStatus = useGitStatus(visible ? currentDirectory : null);

  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const canSearchContents = Boolean(files.searchContents);
  const [searchMode, setSearchMode] = React.useState<FileTreeSearchMode>('names');
  const [regexSearch, setRegexSearch] = React.useState(false);
  const contentSearchActive = canSearchContents && searchMode === 'contents';
  const contentSearch = useFileContentSearch({
    searchContents: files.searchContents,
    directory: currentDirectory,
    query: debouncedSearchQuery,
    regex: regexSearch,
    includeHidden: showHidden,
    respectGitignore: !showGitignored,
    active: visible && contentSearchActive,
  });

  const EMPTY_PATHS: string[] = React.useMemo(() => [], []);
  const EMPTY_CONTEXT_TABS: Array<{ mode: string; targetPath: string | null }> = React.useMemo(() => [], []);
  const expandedPaths = useFilesViewTabsStore((state) => (root ? (state.byRoot[root]?.expandedPaths ?? EMPTY_PATHS) : EMPTY_PATHS));
  const expandedPathSet = React.useMemo(() => new Set(expandedPaths), [expandedPaths]);
  const selectedPath = useFilesViewTabsStore((state) => (root ? (state.byRoot[root]?.selectedPath ?? null) : null));
  const expandPath = useFilesViewTabsStore((state) => state.expandPath);
  const collapseAllExpandedPaths = useFilesViewTabsStore((state) => state.collapseAllExpandedPaths);
  const contextTabs = useUIStore((state) => (panelRoot ? (state.contextPanelByDirectory[panelRoot]?.tabs ?? EMPTY_CONTEXT_TABS) : EMPTY_CONTEXT_TABS));
  const openContextFilePaths = React.useMemo(() => new Set(
    contextTabs
      .map((tab) => (tab.mode === 'file' ? tab.targetPath : null))
      .filter((targetPath): targetPath is string => typeof targetPath === 'string' && targetPath.length > 0)
      .map((targetPath) => normalizePath(targetPath))
  ), [contextTabs]);

  const { childrenByDir, loadErrorsByDir, loadedDirsRef, loadDirectory, refreshRoot, refreshDirectory } = useFileTreeListing({
    root,
    visible,
    showHidden,
    showGitignored,
    expandedPaths,
  });
  const { searchResults, searching } = useFileNameSearch({
    visible,
    currentDirectory,
    contentSearchActive,
    query: debouncedSearchQuery,
    showHidden,
    showGitignored,
  });
  const { getFileStatus, getFolderBadge } = useFileTreeGitMarks(gitStatus, root);
  const { openedMatch, handleOpenFile, handleOpenMatch, handleMatchDragStart, handleMatchDragEnd } = useFileTreeOpening({ root, panelRoot });

  const treeListRef = React.useRef<HTMLUListElement | null>(null);
  const { slidingRowPaths, toggleDirectory } = useFileTreeToggle({ root, treeListRef, loadedDirsRef, loadDirectory });

  const {
    canUpload,
    uploadingDirectory,
    uploadFiles,
    pickFiles,
    uploadElements,
  } = useFileTreeUpload({ root, refreshDirectory });
  const isUploading = uploadingDirectory !== null;
  const {
    dropTarget,
    moveDragPath,
    moveDropTarget,
    pendingMove,
    setPendingMove,
    canMove,
    setDropTarget,
    setMoveDropTarget,
    handleDropFiles,
    handleMoveDragChange,
    handleMoveDrop,
    handleConfirmMove,
    handleRootDragOver,
    handleRootDragLeave,
    handleRootDrop,
  } = useFileTreeDragDrop({ root, panelRoot, canUpload, isUploading, uploadFiles, refreshDirectory, expandPath });
  const dropIndicatorTarget = uploadingDirectory ?? dropTarget;

  const {
    activeDialog,
    setActiveDialog,
    dialogData,
    dialogInputValue,
    setDialogInputValue,
    isDialogSubmitting,
    handleOpenDialog,
    handleDialogSubmit,
  } = useFileTreeDialogs({ root, panelRoot, selectedPath, refreshDirectory });

  const canCreateFile = Boolean(files.writeFile);
  const canCreateFolder = Boolean(files.createDirectory);
  const canRename = Boolean(files.rename);
  const canDelete = Boolean(files.delete);
  const canReveal = Boolean(files.revealPath);

  const fileRowPermissions = React.useMemo(
    () => ({ canRename, canCreateFile, canCreateFolder, canDelete, canReveal }),
    [canRename, canCreateFile, canCreateFolder, canDelete, canReveal]
  );

  const handleRevealPath = React.useCallback((targetPath: string) => {
    if (!files.revealPath) return;
    void files.revealPath(targetPath).catch(() => {
      toast.error(t('sidebarFilesTree.toast.revealFailed'));
    });
  }, [files, t]);

<<<<<<< HEAD
  const handleOpenDialog = React.useCallback((type: 'createFile' | 'createFolder' | 'rename' | 'delete', data: { path: string; name?: string; type?: 'file' | 'directory' }) => {
    setActiveDialog(type);
    setDialogData(data);
    setDialogInputValue(type === 'rename' ? data.name || '' : '');
    setIsDialogSubmitting(false);
  }, []);

  const mapDirectoryEntries = React.useCallback((dirPath: string, entries: Array<{ name: string; path: string; isDirectory: boolean }>): FileNode[] => {
    const nodes = entries
      .filter((entry) => entry && typeof entry.name === 'string' && entry.name.length > 0)
      .filter((entry) => showHidden || !entry.name.startsWith('.'))
      .filter((entry) => showGitignored || !shouldIgnoreEntryName(entry.name))
      .map<FileNode>((entry) => {
        const name = entry.name;
        const normalizedEntryPath = normalizePath(entry.path || '');
        const path = normalizedEntryPath
          ? (isAbsolutePath(normalizedEntryPath)
            ? normalizedEntryPath
            : normalizePath(`${dirPath}/${normalizedEntryPath}`))
          : normalizePath(`${dirPath}/${name}`);
        const type = entry.isDirectory ? 'directory' : 'file';
        const extension = type === 'file' && name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
        return { name, path, type, extension };
      });

    return sortNodes(nodes);
  }, [showGitignored, showHidden]);

  const loadDirectory = React.useCallback(async (dirPath: string, isCancelled?: () => boolean, force = false) => {
    if (!visibleRef.current || isCancelled?.()) return;
    const normalizedDir = normalizePath(dirPath.trim());
    if (!normalizedDir) return;

    if (!force && loadedDirsRef.current.has(normalizedDir)) return;
    const requestRuntime = getRuntimeKey();
    return directoryRequests.run(normalizedDir, async (ownsRequest) => {
      const stale = () => !ownsRequest() || getRuntimeKey() !== requestRuntime;
      try {
        const respectGitignore = !showGitignored;
        const entries = files.listDirectory
          ? (await files.listDirectory(normalizedDir, { respectGitignore })).entries
          : await hostFilesystem.listLocalDirectory(normalizedDir, { respectGitignore });
        if (stale()) return;
        entryCountByDirRef.current.set(normalizedDir, entries.length);
        const mapped = mapDirectoryEntries(normalizedDir, entries);
        loadedDirsRef.current = new Set(loadedDirsRef.current);
        loadedDirsRef.current.add(normalizedDir);
        setLoadErrorsByDir((prev) => {
          if (!prev[normalizedDir]) return prev;
          const next = { ...prev };
          delete next[normalizedDir];
          return next;
        });
        setChildrenByDir((prev) => prev[normalizedDir] && areDirectoryNodesEqual(prev[normalizedDir], mapped)
          ? prev : { ...prev, [normalizedDir]: mapped });
      } catch (error) {
        if (stale()) return;
        const message = error instanceof Error ? error.message : String(error ?? '');
        console.error('Failed to load sidebar directory:', error);
        setLoadErrorsByDir((prev) => ({ ...prev, [normalizedDir]: message }));
      }
    }, force);
  }, [directoryRequests, files, mapDirectoryEntries, showGitignored]);

  const refreshRoot = React.useCallback(async () => {
    if (!root) return;

    // Cancel any previous refresh so stale results for the old root don't
    // land after the user switches projects.
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    directoryRequests.clear();

    try {
      // Refresh root and every expanded directory under it, but keep the
      // cached children visible while re-fetching so the tree stays expanded
      // and does not flash/collapse. Read expanded paths from the store at
      // call time so this callback stays stable when directories are toggled.
      const currentExpanded = useFilesViewTabsStore.getState().byRoot[root]?.expandedPaths ?? [];
      const normalizedExpanded = currentExpanded
        .map((p) => normalizePath(p))
        .filter((normalized): normalized is string =>
          Boolean(normalized) && normalized !== root && normalized.startsWith(`${root}/`),
        );
      const pathsToRefresh = [root, ...normalizedExpanded];

      loadedDirsRef.current = new Set(loadedDirsRef.current);
      for (const dirPath of pathsToRefresh) {
        loadedDirsRef.current.delete(dirPath);
      }

      setLoadErrorsByDir((prev) => {
        if (Object.keys(prev).length === 0) return prev;
        const next = { ...prev };
        let changed = false;
        for (const dirPath of pathsToRefresh) {
          if (dirPath in next) {
            delete next[dirPath];
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      const isCancelled = () => controller.signal.aborted;

      // Load root first, then expanded children with the same 3-at-a-time
      // concurrency limit used on startup to avoid API stampede.
      await loadDirectory(root, isCancelled);
      for (let i = 0; i < normalizedExpanded.length && !controller.signal.aborted; i += 3) {
        const batch = normalizedExpanded.slice(i, i + 3);
        await Promise.all(batch.map((dirPath) => loadDirectory(dirPath, isCancelled)));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('Failed to refresh sidebar tree:', error);
    } finally {
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
    }
  }, [directoryRequests, loadDirectory, root]);

  /**
   * Incrementally refresh a single directory without nuking the rest of the
   * tree.  Only the given directory is reloaded in-place; every other expanded
   * directory keeps its cached children so the UI does not flash/reset.
   */
  const refreshDirectory = React.useCallback(async (dirPath: string) => {
    if (!dirPath) {
      await refreshRoot();
      return;
    }
    const normalized = normalizePath(dirPath);
    loadedDirsRef.current = new Set(loadedDirsRef.current);
    loadedDirsRef.current.delete(normalized);
    await loadDirectory(normalized, undefined, true);
  }, [loadDirectory, refreshRoot]);

  React.useEffect(() => {
    if (!root) return;

    // Cancel any pending refresh so stale directory listings don't land after
    // the user switches projects or toggles showHidden / showGitignored.
    refreshAbortRef.current?.abort();
    loadedDirsRef.current = new Set();
    directoryRequests.clear();
    setLoadErrorsByDir({});
    setChildrenByDir((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    void loadDirectory(root);
  }, [directoryRequests, loadDirectory, root, showHidden, showGitignored]);

  React.useEffect(() => {
    if (!visible || !root || expandedPaths.length === 0) return;

    // Sort by depth so parent dirs load before children
    const toLoad = expandedPaths
      .map((p) => normalizePath(p))
      .filter((normalized): normalized is string =>
        !!normalized &&
        normalized !== root &&
        normalized.startsWith(`${root}/`) &&
        !loadedDirsRef.current.has(normalized) &&
          !directoryRequests.has(normalized),
      )
      .sort((a, b) => a.split('/').length - b.split('/').length);

    if (toLoad.length === 0) return;

    // Load with concurrency limit to avoid API stampede on startup.
    // Cancellation stops queued batches. Already-started, shared reads still
    // populate the same-scope cache; scope changes and unmount invalidate them.
    let cancelled = false;
    const isCancelled = () => cancelled;
    void (async () => {
      for (let i = 0; i < toLoad.length && !cancelled; i += 3) {
        const batch = toLoad.slice(i, i + 3);
        await Promise.all(batch.map((dir) => loadDirectory(dir, isCancelled)));
      }
    })();
    return () => { cancelled = true; };
  }, [directoryRequests, expandedPaths, loadDirectory, root, visible]);

  const wasVisibleRef = React.useRef(visible);
  React.useEffect(() => {
    const resumed = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (resumed) void refreshRoot();
  }, [refreshRoot, visible]);

  // Agent and app file changes re-list only what they touched. A listing on
  // screen reloads now, unless it is too large to resend; a loaded one out of
  // sight (collapsed, or inside a collapsed folder) is only forgotten, so
  // expanding it reads it again.
  const applyFileTreeChanges = React.useCallback(({ directories }: FileTreeChangeBatch) => {
    if (!root) return;
    const expanded = new Set(
      (useFilesViewTabsStore.getState().byRoot[root]?.expandedPaths ?? []).map((path) => normalizePath(path)),
    );
    const rootPrefix = root === '/' ? '/' : `${root}/`;
    const isOnScreen = (dir: string): boolean => {
      for (let current = dir; current !== root; current = getParentPath(current)) {
        if (!current.startsWith(rootPrefix) || !expanded.has(current)) return false;
      }
      return true;
    };
    const nearestLoaded = (dir: string): string | null => {
      for (let current = dir; current === root || current.startsWith(rootPrefix); current = getParentPath(current)) {
        if (loadedDirsRef.current.has(current)) return current;
        if (current === root) break;
      }
      return null;
    };

    const toLoad = new Set<string>();
    const toForget = new Set<string>();
    for (const changed of directories ?? loadedDirsRef.current) {
      const loaded = nearestLoaded(normalizePath(changed));
      if (!loaded) continue;
      (isOnScreen(loaded) ? toLoad : toForget).add(loaded);
    }
    if (toForget.size > 0) {
      loadedDirsRef.current = new Set([...loadedDirsRef.current].filter((dir) => !toForget.has(dir)));
    }
    const queue = [...toLoad].filter(
      (dir) => (entryCountByDirRef.current.get(dir) ?? 0) <= AUTO_RELIST_MAX_ENTRIES,
    );
    void (async () => {
      for (let i = 0; i < queue.length; i += 3) {
        await Promise.all(queue.slice(i, i + 3).map((dir) => loadDirectory(dir, undefined, true)));
      }
    })();
  }, [loadDirectory, root]);

  useFileTreeChanges({ root, active: visible, whileInactive: 'drop', onChanges: applyFileTreeChanges });

  // --- Fuzzy search scoring (matching FilesView) ---

  React.useEffect(() => {
    if (!visible) return;
    if (!currentDirectory || contentSearchActive) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const trimmedQuery = debouncedSearchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    searchFiles(currentDirectory, trimmedQuery, 150, {
      includeHidden: showHidden,
      respectGitignore: !showGitignored,
      type: 'file',
    })
      .then((hits) => {
        if (cancelled) return;

        const filtered = hits.filter((hit) => showGitignored || !shouldIgnorePath(hit.path));

        const mapped: FileNode[] = filtered.map((hit) => ({
          name: hit.name,
          path: normalizePath(hit.path),
          type: 'file',
          extension: hit.extension,
          relativePath: hit.relativePath,
        }));

        setSearchResults(mapped);
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [contentSearchActive, currentDirectory, debouncedSearchQuery, searchFiles, showHidden, showGitignored, visible]);

  // --- Git status helpers (matching FilesView) ---
  //
  // statusByPath / badgeByDir are precomputed once per gitStatus change so the
  // tree render is O(1) per node instead of O(N) per node. Without these
  // maps, a deep tree with 200 files and 40 directories would do ~8000
  // string comparisons on every render.

  const statusByPath = React.useMemo(() => {
    const map = new Map<string, FileTreeGitStatus>();
    if (!gitStatus?.files) return map;
    for (const file of gitStatus.files) {
      if (file.index === 'A' || file.working_dir === '?') {
        map.set(file.path, 'git-added');
      } else if (file.index === 'D') {
        map.set(file.path, 'git-deleted');
      } else if (file.index === 'M' || file.working_dir === 'M') {
        map.set(file.path, 'git-modified');
      }
    }
    return map;
  }, [gitStatus]);

  const badgeByDir = React.useMemo(() => {
    const map = new Map<string, { modified: number; added: number }>();
    if (!gitStatus?.files || !root) return map;
    for (const file of gitStatus.files) {
      const isModified = file.index === 'M' || file.working_dir === 'M';
      const isAdded = file.index === 'A' || file.working_dir === '?';
      if (!isModified && !isAdded) continue;
      const segments = file.path.split('/');
      if (segments.length <= 1) continue;
      let currentDir = root;
      for (let i = 0; i < segments.length - 1; i++) {
        currentDir = `${currentDir}/${segments[i]}`;
        let entry = map.get(currentDir);
        if (!entry) {
          entry = { modified: 0, added: 0 };
          map.set(currentDir, entry);
        }
        if (isModified) entry.modified++;
        if (isAdded) entry.added++;
      }
    }
    return map;
  }, [gitStatus, root]);

  const getFileStatus = React.useCallback((path: string): FileTreeGitStatus | null => {
    if (statusByPath.size === 0) return null;
    const relative = path.startsWith(root + '/') ? path.slice(root.length + 1) : path;
    return statusByPath.get(relative) ?? null;
  }, [statusByPath, root]);

  const getFolderBadge = React.useCallback((dirPath: string): { modified: number; added: number } | null => {
    if (badgeByDir.size === 0) return null;
    const entry = badgeByDir.get(dirPath);
    if (!entry) return null;
    return entry.modified + entry.added > 0 ? entry : null;
  }, [badgeByDir]);

  // --- File operations ---

  const handleOpenFile = React.useCallback(async (node: FileNode, options?: { pin?: boolean }) => {
    if (!root) return;

    const openValidation = await validateContextFileOpen(files, node.path, { directory: root });
    if (!openValidation.ok) {
      toastContextFileOpenFailure(node.path, openValidation);
      return;
    }

    setSelectedPath(root, node.path);
    addOpenPath(root, node.path);
    // Touch has no double-click to keep a preview, so it opens tabs outright.
    openContextFile(panelRoot, node.path, { preview: !options?.pin && !useUIStore.getState().isMobile });
  }, [addOpenPath, files, openContextFile, panelRoot, root, setSelectedPath]);

  // A find-in-files result opens its file at the matching line, as a preview
  // on a click and as a pinned tab on a double-click, like a tree row.
  const handleOpenMatch = React.useCallback(async (match: FileContentSearchMatch, options?: { pin?: boolean }) => {
    if (!root) return;

    const openValidation = await validateContextFileOpen(files, match.path, { directory: root });
    if (!openValidation.ok) {
      toastContextFileOpenFailure(match.path, openValidation);
      return;
    }

    setSelectedPath(root, match.path);
    addOpenPath(root, match.path);
    setOpenedMatch({ path: match.path, key: fileContentMatchKey(match) });
    openContextFileAtLine(panelRoot, match.path, match.line, match.column, { preview: !options?.pin && !useUIStore.getState().isMobile });
  }, [addOpenPath, files, openContextFileAtLine, panelRoot, root, setSelectedPath]);

  const handleMatchDragStart = React.useCallback((event: React.DragEvent<HTMLButtonElement>, match: FileContentSearchMatch) => {
    recordFileTreeDragStart(event);
    // Search results attach to the chat only; they never move.
    setFileTreeDragSource(null);
    event.dataTransfer.setData(INTERNAL_FILE_PATH_TYPE, match.relativePath);
    event.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleMatchDragEnd = React.useCallback((event: React.DragEvent<HTMLButtonElement>, match: FileContentSearchMatch) => {
    // A micro-drag suppressed the click this gesture was meant to be (#2368).
    if (shouldTreatFileTreeDragEndAsClick(event)) {
      void handleOpenMatch(match);
    }
  }, [handleOpenMatch]);

  // Rows on screen below a folder that opens stay mounted while they slide
  // down past the virtual range, so the list under the folder does not blank.
  const [slidingRowPaths, setSlidingRowPaths] = React.useState<readonly string[] | null>(null);
  const clearSlidingRowPaths = React.useCallback(() => setSlidingRowPaths(null), []);
  const treeListRef = React.useRef<HTMLUListElement | null>(null);
  const toggleWithMotion = useFileTreeDisclosure(treeListRef, { onSettled: clearSlidingRowPaths });
  const toggleDirectory = React.useCallback(async (dirPath: string) => {
    const normalized = normalizePath(dirPath);
    if (!root) return;

    const expanded = useFilesViewTabsStore.getState().byRoot[root]?.expandedPaths.includes(normalized) ?? false;
    toggleWithMotion(dirPath, expanded, () => {
      const mountedPaths = Array.from(treeListRef.current?.querySelectorAll<HTMLElement>('[data-tree-disclosure-path]') ?? [], (row) => row.dataset.treeDisclosurePath ?? '');
      setSlidingRowPaths(expanded ? null : mountedPaths.slice(mountedPaths.indexOf(dirPath) + 1));
      toggleExpandedPath(root, normalized);
    });
    if (!loadedDirsRef.current.has(normalized)) {
      await loadDirectory(normalized);
    }
  }, [loadDirectory, root, toggleExpandedPath, toggleWithMotion]);

  const {
    canUpload,
    uploadingDirectory,
    uploadFiles,
    pickFiles,
    uploadElements,
  } = useFileTreeUpload({ root, refreshDirectory });
  const isUploading = uploadingDirectory !== null;
  const dropIndicatorTarget = uploadingDirectory ?? dropTarget;

  const handleDropFiles = React.useCallback((directory: string, dataTransfer: DataTransfer) => {
    const droppedFiles = getExternalFiles(dataTransfer);
    if (droppedFiles.length === 0) return;
    setDropTarget(null);
    void uploadFiles(directory, droppedFiles);
  }, [uploadFiles]);

  const handleMoveDragChange = React.useCallback((source: FileTreeEntry | null) => {
    setFileTreeDragSource(source);
    if (!source) {
      setMoveDragPath(null);
      setMoveDropTarget(null);
      return;
    }
    // Dim the row only after the browser has taken the drag image from it.
    requestAnimationFrame(() => {
      if (getFileTreeDragSource()?.path === source.path) setMoveDragPath(source.path);
    });
  }, []);

  const moveEntry = React.useCallback(async (source: FileTreeEntry, targetDirectory: string) => {
    const toPath = getFileTreeMovedPath(source, targetDirectory);
    const result = await moveWorkspacePath(files, { tabs: panelRoot, files: root }, source.path, toPath);
    if (result === 'conflict') {
      toast.error(t('sidebarFilesTree.toast.nameTaken', {
        name: toPath.slice(toPath.lastIndexOf('/') + 1),
        folder: getDropTargetLabel(root, targetDirectory),
      }));
      return;
    }
    if (result === 'failed') {
      toast.error(t('sidebarFilesTree.toast.operationFailed'));
      return;
    }
    if (targetDirectory !== root) expandPath(root, targetDirectory);
    await Promise.all([
      refreshDirectory(getParentPath(source.path)),
      refreshDirectory(targetDirectory),
    ]).catch(() => undefined);
  }, [expandPath, files, panelRoot, refreshDirectory, root, t]);

  const handleMoveDrop = React.useCallback((source: FileTreeEntry, targetDirectory: string) => {
    if (useUIStore.getState().confirmFileTreeMove) {
      setPendingMove({ source, targetDirectory });
      return;
    }
    void moveEntry(source, targetDirectory);
  }, [moveEntry]);

  const handleConfirmMove = React.useCallback(() => {
    if (!pendingMove) return;
    setPendingMove(null);
    void moveEntry(pendingMove.source, pendingMove.targetDirectory);
  }, [moveEntry, pendingMove]);

  const getRootMoveTarget = React.useCallback((event: React.DragEvent, source: FileTreeEntry): string | null => {
    if (!canMove || isFileTreeDragWithinClickSlop(event)) return null;
    return getFileTreeMoveTarget(source, null, root);
  }, [canMove, root]);

  const handleRootDragOver = React.useCallback((event: React.DragEvent) => {
    const moveSource = getMoveDragSource(event.dataTransfer);
    if (moveSource) {
      const target = getRootMoveTarget(event, moveSource);
      setMoveDropTarget(target);
      if (!target) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      return;
    }
    if (!canUpload || isUploading || !root || !hasExternalFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropTarget(root);
  }, [canUpload, getRootMoveTarget, isUploading, root]);

  const handleRootDragLeave = React.useCallback((event: React.DragEvent) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    if (getMoveDragSource(event.dataTransfer)) {
      setMoveDropTarget(null);
      return;
    }
    if (!hasExternalFiles(event.dataTransfer)) return;
    setDropTarget(null);
  }, []);

  const handleRootDrop = React.useCallback((event: React.DragEvent) => {
    const moveSource = getMoveDragSource(event.dataTransfer);
    if (moveSource) {
      event.preventDefault();
      setMoveDropTarget(null);
      const target = getRootMoveTarget(event, moveSource);
      if (target && isDropOfMoveSource(event.dataTransfer, root, moveSource)) handleMoveDrop(moveSource, target);
      return;
    }
    if (!canUpload || isUploading || !root || !hasExternalFiles(event.dataTransfer)) return;
    event.preventDefault();
    handleDropFiles(root, event.dataTransfer);
  }, [canUpload, getRootMoveTarget, handleDropFiles, handleMoveDrop, isUploading, root]);

  // --- Dialog submit (matching FilesView) ---

  const handleDialogSubmit = React.useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dialogData || !activeDialog) return;

    setIsDialogSubmitting(true);
    const done = () => setIsDialogSubmitting(false);
    const closeDialog = () => setActiveDialog(null);

    if (activeDialog === 'createFile') {
      if (!dialogInputValue.trim()) {
        toast.error(t('sidebarFilesTree.toast.filenameRequired'));
        done();
        return;
      }
      if (!files.writeFile) {
        toast.error(t('sidebarFilesTree.toast.writeNotSupported'));
        done();
        return;
      }

      const parentPath = dialogData.path;
      const prefix = parentPath ? `${parentPath}/` : '';
      const newPath = normalizePath(`${prefix}${dialogInputValue.trim()}`);

      await files.writeFile(newPath, '')
        .then(async (result) => {
          if (result.success) {
            toast.success(t('sidebarFilesTree.toast.fileCreated'));
            await refreshDirectory(parentPath);
          }
          closeDialog();
        })
        .catch((error) => toast.error(problemMessage(error, t('sidebarFilesTree.toast.operationFailed'))))
        .finally(done);
      return;
    }

    if (activeDialog === 'createFolder') {
      if (!dialogInputValue.trim()) {
        toast.error(t('sidebarFilesTree.toast.folderNameRequired'));
        done();
        return;
      }

      const parentPath = dialogData.path;
      const prefix = parentPath ? `${parentPath}/` : '';
      const newPath = normalizePath(`${prefix}${dialogInputValue.trim()}`);

      await files.createDirectory(newPath)
        .then(async (result) => {
          if (result.success) {
            toast.success(t('sidebarFilesTree.toast.folderCreated'));
            await refreshDirectory(parentPath);
          }
          closeDialog();
        })
        .catch((error) => toast.error(problemMessage(error, t('sidebarFilesTree.toast.operationFailed'))))
        .finally(done);
      return;
    }

    if (activeDialog === 'rename') {
      if (!dialogInputValue.trim()) {
        toast.error(t('sidebarFilesTree.toast.nameRequired'));
        done();
        return;
      }
      if (!files.rename) {
        toast.error(t('sidebarFilesTree.toast.renameNotSupported'));
        done();
        return;
      }

      const oldPath = dialogData.path;
      const parentDir = oldPath.split('/').slice(0, -1).join('/');
      const prefix = parentDir ? `${parentDir}/` : '';
      const newName = dialogInputValue.trim();
      const newPath = normalizePath(`${prefix}${newName}`);

      // Open tabs and the editor, unsaved edits included, follow the new name.
      try {
        const result = await moveWorkspacePath(files, { tabs: panelRoot, files: root }, oldPath, newPath);
        if (result === 'moved') {
          toast.success(t('sidebarFilesTree.toast.renamedSuccessfully'));
          await refreshDirectory(parentDir);
          closeDialog();
        } else if (result === 'conflict') {
          toast.error(t('sidebarFilesTree.toast.nameTaken', { name: newName, folder: getDropTargetLabel(root, parentDir) }));
        } else {
          toast.error(t('sidebarFilesTree.toast.operationFailed'));
        }
      } catch (error) {
        toast.error(problemMessage(error, t('sidebarFilesTree.toast.operationFailed')));
      } finally {
        done();
      }
      return;
    }

    if (activeDialog === 'delete') {
      if (!files.delete) {
        toast.error(t('sidebarFilesTree.toast.deleteNotSupported'));
        done();
        return;
      }

      const deletedPath = dialogData.path;
      const parentDir = deletedPath.split('/').slice(0, -1).join('/');
      await files.delete(deletedPath)
        .then(async (result) => {
          if (result.success) {
            toast.success(t('sidebarFilesTree.toast.deletedSuccessfully'));
            await refreshDirectory(parentDir);
            if (root) {
              removeOpenPathsByPrefix(root, deletedPath);
            }
            if (selectedPath === deletedPath || (selectedPath && selectedPath.startsWith(deletedPath + '/'))) {
              setSelectedPath(root, null);
            }
          }
          closeDialog();
        })
        .catch((error) => toast.error(problemMessage(error, t('sidebarFilesTree.toast.operationFailed'))))
        .finally(done);
      return;
    }

    done();
  }, [activeDialog, dialogData, dialogInputValue, files, panelRoot, refreshDirectory, removeOpenPathsByPrefix, root, selectedPath, setSelectedPath, t]);

  // --- Tree rendering (matching FilesView with indent guides) ---

  // Virtualized: only the rows in and near view are in the document. With
  // every expanded folder mounted, a large repository put thousands of
  // elements under the context panel, and each open restyled all of them and
  // added them to the accessibility tree inside the opening animation.
  const treeRows = React.useMemo(
    () => (root ? buildFileTreeRows({ root, childrenByDir, expandedPaths: expandedPathSet, loadErrorsByDir }) : []),
    [childrenByDir, expandedPathSet, loadErrorsByDir, root],
  );
  const treeRowIndexByPath = React.useMemo(
    () => new Map(treeRows.flatMap((row, index) => (row.kind === 'node' ? [[row.node.path, index] as const] : []))),
    [treeRows],
  );
  const [treeScrollElement, setTreeScrollElement] = React.useState<HTMLElement | null>(null);
  const [treeListElement, setTreeListElement] = React.useState<HTMLUListElement | null>(null);
  const attachTreeList = React.useCallback((element: HTMLUListElement | null) => {
    treeListRef.current = element;
    setTreeListElement(element);
  }, []);
  const [focusedRowPath, setFocusedRowPath] = React.useState<string | null>(null);
  const pinnedRowIndexes = React.useMemo(
    () => [moveDragPath, focusedRowPath, ...(slidingRowPaths ?? [])].flatMap((path) => (path ? [treeRowIndexByPath.get(path) ?? -1] : [])),
    [focusedRowPath, moveDragPath, slidingRowPaths, treeRowIndexByPath],
  );
  const rangeExtractor = React.useCallback(
    (range: Range) => withPinnedRowIndexes(defaultRangeExtractor(range), pinnedRowIndexes, treeRows.length),
    [pinnedRowIndexes, treeRows.length],
  );
  // The list starts below the scroller's own padding.
  const [treeListOffset, setTreeListOffset] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!treeScrollElement || !treeListElement) return;
    const offset = treeListElement.getBoundingClientRect().top - treeScrollElement.getBoundingClientRect().top + treeScrollElement.scrollTop;
    setTreeListOffset(Math.max(0, Math.round(offset)));
  }, [treeListElement, treeScrollElement]);
  const measuredRowHeightRef = React.useRef<number | null>(null);
  // Only some rows are mounted, so the list keeps the width of every row seen
  // wider than the pane, by path: every row's fill and end lane then span the
  // scrolled width, and a wide row out of view keeps the list wide, or the
  // sideways scroll would snap back. A row is as wide as the list or its whole
  // name, so only a row wider than the list tells its own width. Mounted rows
  // report it through the virtualizer's resize observer; the write waits a
  // frame so it never resizes observed rows inside that observer's callback.
  const treeRowWidthsRef = React.useRef(new Map<string, number>());
  const treeWidthFrameRef = React.useRef<number | null>(null);
  const writeTreeWidth = React.useCallback((list: HTMLElement) => {
    const widest = Math.max(0, ...treeRowWidthsRef.current.values());
    list.style.setProperty('--oc-file-tree-width', `${widest}px`);
  }, []);
  const recordTreeRowWidth = React.useCallback((element: HTMLElement, width: number) => {
    const path = element.dataset.treeRowPath;
    const list = treeListRef.current;
    if (!path || !list || width <= list.clientWidth + 0.5) return;
    if (treeRowWidthsRef.current.get(path) === width) return;
    treeRowWidthsRef.current.set(path, width);
    if (treeWidthFrameRef.current !== null) return;
    treeWidthFrameRef.current = requestAnimationFrame(() => {
      treeWidthFrameRef.current = null;
      if (treeListRef.current) writeTreeWidth(treeListRef.current);
    });
  }, [writeTreeWidth]);
  React.useEffect(() => () => {
    if (treeWidthFrameRef.current !== null) cancelAnimationFrame(treeWidthFrameRef.current);
  }, []);
  // When the rows change, rows that left the tree drop out, and mounted rows
  // measure again from the pane's width, so a name that got shorter narrows
  // the list. Measuring lays the list out narrower for a moment, which clamps
  // the sideways scroll; it is restored before paint.
  React.useLayoutEffect(() => {
    if (!treeListElement) return;
    const widths = treeRowWidthsRef.current;
    for (const path of widths.keys()) {
      if (!treeRowIndexByPath.has(path)) widths.delete(path);
    }
    const scrollLeft = treeScrollElement?.scrollLeft ?? 0;
    treeListElement.style.removeProperty('--oc-file-tree-width');
    const listWidth = treeListElement.clientWidth;
    for (const row of treeListElement.children) {
      const path = row instanceof HTMLElement ? row.dataset.treeRowPath : undefined;
      if (!path) continue;
      const width = row.getBoundingClientRect().width;
      if (width > listWidth + 0.5) widths.set(path, width);
      else widths.delete(path);
    }
    writeTreeWidth(treeListElement);
    if (treeScrollElement) treeScrollElement.scrollLeft = scrollLeft;
  }, [treeListElement, treeRowIndexByPath, treeScrollElement, writeTreeWidth]);
  const treeVirtualizer = useVirtualizer<HTMLElement, HTMLLIElement>({
    count: treeRows.length,
    // Enabled before the scroller exists, the virtualizer would cache offset 0.
    enabled: treeScrollElement !== null,
    getScrollElement: () => treeScrollElement,
    // Rows a folder just showed start at their real height: with a guess they
    // moved once measured, and the rows sliding under an opening folder jumped
    // at the end of the motion.
    estimateSize: (index) => (treeRows[index]?.kind === 'node' ? measuredRowHeightRef.current : null) ?? FILE_TREE_ROW_ESTIMATE_PX,
    measureElement: (element, entry, instance) => {
      const size = measureElement(element, entry, instance);
      if (element.dataset.treeRowPath) measuredRowHeightRef.current = size;
      if (entry) recordTreeRowWidth(element, entry.borderBoxSize?.[0]?.inlineSize ?? element.getBoundingClientRect().width);
      return size;
    },
    getItemKey: (index) => treeRows[index]?.key ?? index,
    overscan: 12,
    scrollMargin: treeListOffset,
    rangeExtractor,
||||||| bc50ba56aa
  const handleOpenDialog = React.useCallback((type: 'createFile' | 'createFolder' | 'rename' | 'delete', data: { path: string; name?: string; type?: 'file' | 'directory' }) => {
    setActiveDialog(type);
    setDialogData(data);
    setDialogInputValue(type === 'rename' ? data.name || '' : '');
    setIsDialogSubmitting(false);
  }, []);

  const mapDirectoryEntries = React.useCallback((dirPath: string, entries: Array<{ name: string; path: string; isDirectory: boolean }>): FileNode[] => {
    const nodes = entries
      .filter((entry) => entry && typeof entry.name === 'string' && entry.name.length > 0)
      .filter((entry) => showHidden || !entry.name.startsWith('.'))
      .filter((entry) => showGitignored || !shouldIgnoreEntryName(entry.name))
      .map<FileNode>((entry) => {
        const name = entry.name;
        const normalizedEntryPath = normalizePath(entry.path || '');
        const path = normalizedEntryPath
          ? (isAbsolutePath(normalizedEntryPath)
            ? normalizedEntryPath
            : normalizePath(`${dirPath}/${normalizedEntryPath}`))
          : normalizePath(`${dirPath}/${name}`);
        const type = entry.isDirectory ? 'directory' : 'file';
        const extension = type === 'file' && name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
        return { name, path, type, extension };
      });

    return sortNodes(nodes);
  }, [showGitignored, showHidden]);

  const loadDirectory = React.useCallback(async (dirPath: string, isCancelled?: () => boolean, force = false) => {
    if (!visibleRef.current || isCancelled?.()) return;
    const normalizedDir = normalizePath(dirPath.trim());
    if (!normalizedDir) return;

    if (!force && loadedDirsRef.current.has(normalizedDir)) return;
    const requestRuntime = getRuntimeKey();
    return directoryRequests.run(normalizedDir, async (ownsRequest) => {
      const stale = () => !ownsRequest() || getRuntimeKey() !== requestRuntime;
      try {
        const respectGitignore = !showGitignored;
        const entries = files.listDirectory
          ? (await files.listDirectory(normalizedDir, { respectGitignore })).entries
          : await opencodeClient.listLocalDirectory(normalizedDir, { respectGitignore });
        if (stale()) return;
        entryCountByDirRef.current.set(normalizedDir, entries.length);
        const mapped = mapDirectoryEntries(normalizedDir, entries);
        loadedDirsRef.current = new Set(loadedDirsRef.current);
        loadedDirsRef.current.add(normalizedDir);
        setLoadErrorsByDir((prev) => {
          if (!prev[normalizedDir]) return prev;
          const next = { ...prev };
          delete next[normalizedDir];
          return next;
        });
        setChildrenByDir((prev) => prev[normalizedDir] && areDirectoryNodesEqual(prev[normalizedDir], mapped)
          ? prev : { ...prev, [normalizedDir]: mapped });
      } catch (error) {
        if (stale()) return;
        const message = error instanceof Error ? error.message : String(error ?? '');
        console.error('Failed to load sidebar directory:', error);
        setLoadErrorsByDir((prev) => ({ ...prev, [normalizedDir]: message }));
      }
    }, force);
  }, [directoryRequests, files, mapDirectoryEntries, showGitignored]);

  const refreshRoot = React.useCallback(async () => {
    if (!root) return;

    // Cancel any previous refresh so stale results for the old root don't
    // land after the user switches projects.
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    directoryRequests.clear();

    try {
      // Refresh root and every expanded directory under it, but keep the
      // cached children visible while re-fetching so the tree stays expanded
      // and does not flash/collapse. Read expanded paths from the store at
      // call time so this callback stays stable when directories are toggled.
      const currentExpanded = useFilesViewTabsStore.getState().byRoot[root]?.expandedPaths ?? [];
      const normalizedExpanded = currentExpanded
        .map((p) => normalizePath(p))
        .filter((normalized): normalized is string =>
          Boolean(normalized) && normalized !== root && normalized.startsWith(`${root}/`),
        );
      const pathsToRefresh = [root, ...normalizedExpanded];

      loadedDirsRef.current = new Set(loadedDirsRef.current);
      for (const dirPath of pathsToRefresh) {
        loadedDirsRef.current.delete(dirPath);
      }

      setLoadErrorsByDir((prev) => {
        if (Object.keys(prev).length === 0) return prev;
        const next = { ...prev };
        let changed = false;
        for (const dirPath of pathsToRefresh) {
          if (dirPath in next) {
            delete next[dirPath];
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      const isCancelled = () => controller.signal.aborted;

      // Load root first, then expanded children with the same 3-at-a-time
      // concurrency limit used on startup to avoid API stampede.
      await loadDirectory(root, isCancelled);
      for (let i = 0; i < normalizedExpanded.length && !controller.signal.aborted; i += 3) {
        const batch = normalizedExpanded.slice(i, i + 3);
        await Promise.all(batch.map((dirPath) => loadDirectory(dirPath, isCancelled)));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('Failed to refresh sidebar tree:', error);
    } finally {
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
    }
  }, [directoryRequests, loadDirectory, root]);

  /**
   * Incrementally refresh a single directory without nuking the rest of the
   * tree.  Only the given directory is reloaded in-place; every other expanded
   * directory keeps its cached children so the UI does not flash/reset.
   */
  const refreshDirectory = React.useCallback(async (dirPath: string) => {
    if (!dirPath) {
      await refreshRoot();
      return;
    }
    const normalized = normalizePath(dirPath);
    loadedDirsRef.current = new Set(loadedDirsRef.current);
    loadedDirsRef.current.delete(normalized);
    await loadDirectory(normalized, undefined, true);
  }, [loadDirectory, refreshRoot]);

  React.useEffect(() => {
    if (!root) return;

    // Cancel any pending refresh so stale directory listings don't land after
    // the user switches projects or toggles showHidden / showGitignored.
    refreshAbortRef.current?.abort();
    loadedDirsRef.current = new Set();
    directoryRequests.clear();
    setLoadErrorsByDir({});
    setChildrenByDir((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    void loadDirectory(root);
  }, [directoryRequests, loadDirectory, root, showHidden, showGitignored]);

  React.useEffect(() => {
    if (!visible || !root || expandedPaths.length === 0) return;

    // Sort by depth so parent dirs load before children
    const toLoad = expandedPaths
      .map((p) => normalizePath(p))
      .filter((normalized): normalized is string =>
        !!normalized &&
        normalized !== root &&
        normalized.startsWith(`${root}/`) &&
        !loadedDirsRef.current.has(normalized) &&
          !directoryRequests.has(normalized),
      )
      .sort((a, b) => a.split('/').length - b.split('/').length);

    if (toLoad.length === 0) return;

    // Load with concurrency limit to avoid API stampede on startup.
    // Cancellation stops queued batches. Already-started, shared reads still
    // populate the same-scope cache; scope changes and unmount invalidate them.
    let cancelled = false;
    const isCancelled = () => cancelled;
    void (async () => {
      for (let i = 0; i < toLoad.length && !cancelled; i += 3) {
        const batch = toLoad.slice(i, i + 3);
        await Promise.all(batch.map((dir) => loadDirectory(dir, isCancelled)));
      }
    })();
    return () => { cancelled = true; };
  }, [directoryRequests, expandedPaths, loadDirectory, root, visible]);

  const wasVisibleRef = React.useRef(visible);
  React.useEffect(() => {
    const resumed = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (resumed) void refreshRoot();
  }, [refreshRoot, visible]);

  // Agent and app file changes re-list only what they touched. A listing on
  // screen reloads now, unless it is too large to resend; a loaded one out of
  // sight (collapsed, or inside a collapsed folder) is only forgotten, so
  // expanding it reads it again.
  const applyFileTreeChanges = React.useCallback(({ directories }: FileTreeChangeBatch) => {
    if (!root) return;
    const expanded = new Set(
      (useFilesViewTabsStore.getState().byRoot[root]?.expandedPaths ?? []).map((path) => normalizePath(path)),
    );
    const rootPrefix = root === '/' ? '/' : `${root}/`;
    const isOnScreen = (dir: string): boolean => {
      for (let current = dir; current !== root; current = getParentPath(current)) {
        if (!current.startsWith(rootPrefix) || !expanded.has(current)) return false;
      }
      return true;
    };
    const nearestLoaded = (dir: string): string | null => {
      for (let current = dir; current === root || current.startsWith(rootPrefix); current = getParentPath(current)) {
        if (loadedDirsRef.current.has(current)) return current;
        if (current === root) break;
      }
      return null;
    };

    const toLoad = new Set<string>();
    const toForget = new Set<string>();
    for (const changed of directories ?? loadedDirsRef.current) {
      const loaded = nearestLoaded(normalizePath(changed));
      if (!loaded) continue;
      (isOnScreen(loaded) ? toLoad : toForget).add(loaded);
    }
    if (toForget.size > 0) {
      loadedDirsRef.current = new Set([...loadedDirsRef.current].filter((dir) => !toForget.has(dir)));
    }
    const queue = [...toLoad].filter(
      (dir) => (entryCountByDirRef.current.get(dir) ?? 0) <= AUTO_RELIST_MAX_ENTRIES,
    );
    void (async () => {
      for (let i = 0; i < queue.length; i += 3) {
        await Promise.all(queue.slice(i, i + 3).map((dir) => loadDirectory(dir, undefined, true)));
      }
    })();
  }, [loadDirectory, root]);

  useFileTreeChanges({ root, active: visible, whileInactive: 'drop', onChanges: applyFileTreeChanges });

  // --- Fuzzy search scoring (matching FilesView) ---

  React.useEffect(() => {
    if (!visible) return;
    if (!currentDirectory || contentSearchActive) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const trimmedQuery = debouncedSearchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    searchFiles(currentDirectory, trimmedQuery, 150, {
      includeHidden: showHidden,
      respectGitignore: !showGitignored,
      type: 'file',
    })
      .then((hits) => {
        if (cancelled) return;

        const filtered = hits.filter((hit) => showGitignored || !shouldIgnorePath(hit.path));

        const mapped: FileNode[] = filtered.map((hit) => ({
          name: hit.name,
          path: normalizePath(hit.path),
          type: 'file',
          extension: hit.extension,
          relativePath: hit.relativePath,
        }));

        setSearchResults(mapped);
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [contentSearchActive, currentDirectory, debouncedSearchQuery, searchFiles, showHidden, showGitignored, visible]);

  // --- Git status helpers (matching FilesView) ---
  //
  // statusByPath / badgeByDir are precomputed once per gitStatus change so the
  // tree render is O(1) per node instead of O(N) per node. Without these
  // maps, a deep tree with 200 files and 40 directories would do ~8000
  // string comparisons on every render.

  const statusByPath = React.useMemo(() => {
    const map = new Map<string, FileTreeGitStatus>();
    if (!gitStatus?.files) return map;
    for (const file of gitStatus.files) {
      if (file.index === 'A' || file.working_dir === '?') {
        map.set(file.path, 'git-added');
      } else if (file.index === 'D') {
        map.set(file.path, 'git-deleted');
      } else if (file.index === 'M' || file.working_dir === 'M') {
        map.set(file.path, 'git-modified');
      }
    }
    return map;
  }, [gitStatus]);

  const badgeByDir = React.useMemo(() => {
    const map = new Map<string, { modified: number; added: number }>();
    if (!gitStatus?.files || !root) return map;
    for (const file of gitStatus.files) {
      const isModified = file.index === 'M' || file.working_dir === 'M';
      const isAdded = file.index === 'A' || file.working_dir === '?';
      if (!isModified && !isAdded) continue;
      const segments = file.path.split('/');
      if (segments.length <= 1) continue;
      let currentDir = root;
      for (let i = 0; i < segments.length - 1; i++) {
        currentDir = `${currentDir}/${segments[i]}`;
        let entry = map.get(currentDir);
        if (!entry) {
          entry = { modified: 0, added: 0 };
          map.set(currentDir, entry);
        }
        if (isModified) entry.modified++;
        if (isAdded) entry.added++;
      }
    }
    return map;
  }, [gitStatus, root]);

  const getFileStatus = React.useCallback((path: string): FileTreeGitStatus | null => {
    if (statusByPath.size === 0) return null;
    const relative = path.startsWith(root + '/') ? path.slice(root.length + 1) : path;
    return statusByPath.get(relative) ?? null;
  }, [statusByPath, root]);

  const getFolderBadge = React.useCallback((dirPath: string): { modified: number; added: number } | null => {
    if (badgeByDir.size === 0) return null;
    const entry = badgeByDir.get(dirPath);
    if (!entry) return null;
    return entry.modified + entry.added > 0 ? entry : null;
  }, [badgeByDir]);

  // --- File operations ---

  const handleOpenFile = React.useCallback(async (node: FileNode, options?: { pin?: boolean }) => {
    if (!root) return;

    const openValidation = await validateContextFileOpen(files, node.path, { directory: root });
    if (!openValidation.ok) {
      toastContextFileOpenFailure(node.path, openValidation);
      return;
    }

    setSelectedPath(root, node.path);
    addOpenPath(root, node.path);
    // Touch has no double-click to keep a preview, so it opens tabs outright.
    openContextFile(panelRoot, node.path, { preview: !options?.pin && !useUIStore.getState().isMobile });
  }, [addOpenPath, files, openContextFile, panelRoot, root, setSelectedPath]);

  // A find-in-files result opens its file at the matching line, as a preview
  // on a click and as a pinned tab on a double-click, like a tree row.
  const handleOpenMatch = React.useCallback(async (match: FileContentSearchMatch, options?: { pin?: boolean }) => {
    if (!root) return;

    const openValidation = await validateContextFileOpen(files, match.path, { directory: root });
    if (!openValidation.ok) {
      toastContextFileOpenFailure(match.path, openValidation);
      return;
    }

    setSelectedPath(root, match.path);
    addOpenPath(root, match.path);
    setOpenedMatch({ path: match.path, key: fileContentMatchKey(match) });
    openContextFileAtLine(panelRoot, match.path, match.line, match.column, { preview: !options?.pin && !useUIStore.getState().isMobile });
  }, [addOpenPath, files, openContextFileAtLine, panelRoot, root, setSelectedPath]);

  const handleMatchDragStart = React.useCallback((event: React.DragEvent<HTMLButtonElement>, match: FileContentSearchMatch) => {
    recordFileTreeDragStart(event);
    // Search results attach to the chat only; they never move.
    setFileTreeDragSource(null);
    event.dataTransfer.setData(INTERNAL_FILE_PATH_TYPE, match.relativePath);
    event.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleMatchDragEnd = React.useCallback((event: React.DragEvent<HTMLButtonElement>, match: FileContentSearchMatch) => {
    // A micro-drag suppressed the click this gesture was meant to be (#2368).
    if (shouldTreatFileTreeDragEndAsClick(event)) {
      void handleOpenMatch(match);
    }
  }, [handleOpenMatch]);

  // Rows on screen below a folder that opens stay mounted while they slide
  // down past the virtual range, so the list under the folder does not blank.
  const [slidingRowPaths, setSlidingRowPaths] = React.useState<readonly string[] | null>(null);
  const clearSlidingRowPaths = React.useCallback(() => setSlidingRowPaths(null), []);
  const treeListRef = React.useRef<HTMLUListElement | null>(null);
  const toggleWithMotion = useFileTreeDisclosure(treeListRef, { onSettled: clearSlidingRowPaths });
  const toggleDirectory = React.useCallback(async (dirPath: string) => {
    const normalized = normalizePath(dirPath);
    if (!root) return;

    const expanded = useFilesViewTabsStore.getState().byRoot[root]?.expandedPaths.includes(normalized) ?? false;
    toggleWithMotion(dirPath, expanded, () => {
      const mountedPaths = Array.from(treeListRef.current?.querySelectorAll<HTMLElement>('[data-tree-disclosure-path]') ?? [], (row) => row.dataset.treeDisclosurePath ?? '');
      setSlidingRowPaths(expanded ? null : mountedPaths.slice(mountedPaths.indexOf(dirPath) + 1));
      toggleExpandedPath(root, normalized);
    });
    if (!loadedDirsRef.current.has(normalized)) {
      await loadDirectory(normalized);
    }
  }, [loadDirectory, root, toggleExpandedPath, toggleWithMotion]);

  const {
    canUpload,
    uploadingDirectory,
    uploadFiles,
    pickFiles,
    uploadElements,
  } = useFileTreeUpload({ root, refreshDirectory });
  const isUploading = uploadingDirectory !== null;
  const dropIndicatorTarget = uploadingDirectory ?? dropTarget;

  const handleDropFiles = React.useCallback((directory: string, dataTransfer: DataTransfer) => {
    const droppedFiles = getExternalFiles(dataTransfer);
    if (droppedFiles.length === 0) return;
    setDropTarget(null);
    void uploadFiles(directory, droppedFiles);
  }, [uploadFiles]);

  const handleMoveDragChange = React.useCallback((source: FileTreeEntry | null) => {
    setFileTreeDragSource(source);
    if (!source) {
      setMoveDragPath(null);
      setMoveDropTarget(null);
      return;
    }
    // Dim the row only after the browser has taken the drag image from it.
    requestAnimationFrame(() => {
      if (getFileTreeDragSource()?.path === source.path) setMoveDragPath(source.path);
    });
  }, []);

  const moveEntry = React.useCallback(async (source: FileTreeEntry, targetDirectory: string) => {
    const toPath = getFileTreeMovedPath(source, targetDirectory);
    const result = await moveWorkspacePath(files, { tabs: panelRoot, files: root }, source.path, toPath);
    if (result === 'conflict') {
      toast.error(t('sidebarFilesTree.toast.nameTaken', {
        name: toPath.slice(toPath.lastIndexOf('/') + 1),
        folder: getDropTargetLabel(root, targetDirectory),
      }));
      return;
    }
    if (result === 'failed') {
      toast.error(t('sidebarFilesTree.toast.operationFailed'));
      return;
    }
    if (targetDirectory !== root) expandPath(root, targetDirectory);
    await Promise.all([
      refreshDirectory(getParentPath(source.path)),
      refreshDirectory(targetDirectory),
    ]).catch(() => undefined);
  }, [expandPath, files, panelRoot, refreshDirectory, root, t]);

  const handleMoveDrop = React.useCallback((source: FileTreeEntry, targetDirectory: string) => {
    if (useUIStore.getState().confirmFileTreeMove) {
      setPendingMove({ source, targetDirectory });
      return;
    }
    void moveEntry(source, targetDirectory);
  }, [moveEntry]);

  const handleConfirmMove = React.useCallback(() => {
    if (!pendingMove) return;
    setPendingMove(null);
    void moveEntry(pendingMove.source, pendingMove.targetDirectory);
  }, [moveEntry, pendingMove]);

  const getRootMoveTarget = React.useCallback((event: React.DragEvent, source: FileTreeEntry): string | null => {
    if (!canMove || isFileTreeDragWithinClickSlop(event)) return null;
    return getFileTreeMoveTarget(source, null, root);
  }, [canMove, root]);

  const handleRootDragOver = React.useCallback((event: React.DragEvent) => {
    const moveSource = getMoveDragSource(event.dataTransfer);
    if (moveSource) {
      const target = getRootMoveTarget(event, moveSource);
      setMoveDropTarget(target);
      if (!target) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      return;
    }
    if (!canUpload || isUploading || !root || !hasExternalFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropTarget(root);
  }, [canUpload, getRootMoveTarget, isUploading, root]);

  const handleRootDragLeave = React.useCallback((event: React.DragEvent) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    if (getMoveDragSource(event.dataTransfer)) {
      setMoveDropTarget(null);
      return;
    }
    if (!hasExternalFiles(event.dataTransfer)) return;
    setDropTarget(null);
  }, []);

  const handleRootDrop = React.useCallback((event: React.DragEvent) => {
    const moveSource = getMoveDragSource(event.dataTransfer);
    if (moveSource) {
      event.preventDefault();
      setMoveDropTarget(null);
      const target = getRootMoveTarget(event, moveSource);
      if (target && isDropOfMoveSource(event.dataTransfer, root, moveSource)) handleMoveDrop(moveSource, target);
      return;
    }
    if (!canUpload || isUploading || !root || !hasExternalFiles(event.dataTransfer)) return;
    event.preventDefault();
    handleDropFiles(root, event.dataTransfer);
  }, [canUpload, getRootMoveTarget, handleDropFiles, handleMoveDrop, isUploading, root]);

  // --- Dialog submit (matching FilesView) ---

  const handleDialogSubmit = React.useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dialogData || !activeDialog) return;

    setIsDialogSubmitting(true);
    const done = () => setIsDialogSubmitting(false);
    const closeDialog = () => setActiveDialog(null);

    if (activeDialog === 'createFile') {
      if (!dialogInputValue.trim()) {
        toast.error(t('sidebarFilesTree.toast.filenameRequired'));
        done();
        return;
      }
      if (!files.writeFile) {
        toast.error(t('sidebarFilesTree.toast.writeNotSupported'));
        done();
        return;
      }

      const parentPath = dialogData.path;
      const prefix = parentPath ? `${parentPath}/` : '';
      const newPath = normalizePath(`${prefix}${dialogInputValue.trim()}`);

      await files.writeFile(newPath, '')
        .then(async (result) => {
          if (result.success) {
            toast.success(t('sidebarFilesTree.toast.fileCreated'));
            await refreshDirectory(parentPath);
          }
          closeDialog();
        })
        .catch(() => toast.error(t('sidebarFilesTree.toast.operationFailed')))
        .finally(done);
      return;
    }

    if (activeDialog === 'createFolder') {
      if (!dialogInputValue.trim()) {
        toast.error(t('sidebarFilesTree.toast.folderNameRequired'));
        done();
        return;
      }

      const parentPath = dialogData.path;
      const prefix = parentPath ? `${parentPath}/` : '';
      const newPath = normalizePath(`${prefix}${dialogInputValue.trim()}`);

      await files.createDirectory(newPath)
        .then(async (result) => {
          if (result.success) {
            toast.success(t('sidebarFilesTree.toast.folderCreated'));
            await refreshDirectory(parentPath);
          }
          closeDialog();
        })
        .catch(() => toast.error(t('sidebarFilesTree.toast.operationFailed')))
        .finally(done);
      return;
    }

    if (activeDialog === 'rename') {
      if (!dialogInputValue.trim()) {
        toast.error(t('sidebarFilesTree.toast.nameRequired'));
        done();
        return;
      }
      if (!files.rename) {
        toast.error(t('sidebarFilesTree.toast.renameNotSupported'));
        done();
        return;
      }

      const oldPath = dialogData.path;
      const parentDir = oldPath.split('/').slice(0, -1).join('/');
      const prefix = parentDir ? `${parentDir}/` : '';
      const newName = dialogInputValue.trim();
      const newPath = normalizePath(`${prefix}${newName}`);

      // Open tabs and the editor, unsaved edits included, follow the new name.
      try {
        const result = await moveWorkspacePath(files, { tabs: panelRoot, files: root }, oldPath, newPath);
        if (result === 'moved') {
          toast.success(t('sidebarFilesTree.toast.renamedSuccessfully'));
          await refreshDirectory(parentDir);
          closeDialog();
        } else if (result === 'conflict') {
          toast.error(t('sidebarFilesTree.toast.nameTaken', { name: newName, folder: getDropTargetLabel(root, parentDir) }));
        } else {
          toast.error(t('sidebarFilesTree.toast.operationFailed'));
        }
      } catch {
        toast.error(t('sidebarFilesTree.toast.operationFailed'));
      } finally {
        done();
      }
      return;
    }

    if (activeDialog === 'delete') {
      if (!files.delete) {
        toast.error(t('sidebarFilesTree.toast.deleteNotSupported'));
        done();
        return;
      }

      const deletedPath = dialogData.path;
      const parentDir = deletedPath.split('/').slice(0, -1).join('/');
      await files.delete(deletedPath)
        .then(async (result) => {
          if (result.success) {
            toast.success(t('sidebarFilesTree.toast.deletedSuccessfully'));
            await refreshDirectory(parentDir);
            if (root) {
              removeOpenPathsByPrefix(root, deletedPath);
            }
            if (selectedPath === deletedPath || (selectedPath && selectedPath.startsWith(deletedPath + '/'))) {
              setSelectedPath(root, null);
            }
          }
          closeDialog();
        })
        .catch(() => toast.error(t('sidebarFilesTree.toast.operationFailed')))
        .finally(done);
      return;
    }

    done();
  }, [activeDialog, dialogData, dialogInputValue, files, panelRoot, refreshDirectory, removeOpenPathsByPrefix, root, selectedPath, setSelectedPath, t]);

  // --- Tree rendering (matching FilesView with indent guides) ---

  // Virtualized: only the rows in and near view are in the document. With
  // every expanded folder mounted, a large repository put thousands of
  // elements under the context panel, and each open restyled all of them and
  // added them to the accessibility tree inside the opening animation.
  const treeRows = React.useMemo(
    () => (root ? buildFileTreeRows({ root, childrenByDir, expandedPaths: expandedPathSet, loadErrorsByDir }) : []),
    [childrenByDir, expandedPathSet, loadErrorsByDir, root],
  );
  const treeRowIndexByPath = React.useMemo(
    () => new Map(treeRows.flatMap((row, index) => (row.kind === 'node' ? [[row.node.path, index] as const] : []))),
    [treeRows],
  );
  const [treeScrollElement, setTreeScrollElement] = React.useState<HTMLElement | null>(null);
  const [treeListElement, setTreeListElement] = React.useState<HTMLUListElement | null>(null);
  const attachTreeList = React.useCallback((element: HTMLUListElement | null) => {
    treeListRef.current = element;
    setTreeListElement(element);
  }, []);
  const [focusedRowPath, setFocusedRowPath] = React.useState<string | null>(null);
  const pinnedRowIndexes = React.useMemo(
    () => [moveDragPath, focusedRowPath, ...(slidingRowPaths ?? [])].flatMap((path) => (path ? [treeRowIndexByPath.get(path) ?? -1] : [])),
    [focusedRowPath, moveDragPath, slidingRowPaths, treeRowIndexByPath],
  );
  const rangeExtractor = React.useCallback(
    (range: Range) => withPinnedRowIndexes(defaultRangeExtractor(range), pinnedRowIndexes, treeRows.length),
    [pinnedRowIndexes, treeRows.length],
  );
  // The list starts below the scroller's own padding.
  const [treeListOffset, setTreeListOffset] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!treeScrollElement || !treeListElement) return;
    const offset = treeListElement.getBoundingClientRect().top - treeScrollElement.getBoundingClientRect().top + treeScrollElement.scrollTop;
    setTreeListOffset(Math.max(0, Math.round(offset)));
  }, [treeListElement, treeScrollElement]);
  const measuredRowHeightRef = React.useRef<number | null>(null);
  // Only some rows are mounted, so the list keeps the width of every row seen
  // wider than the pane, by path: every row's fill and end lane then span the
  // scrolled width, and a wide row out of view keeps the list wide, or the
  // sideways scroll would snap back. A row is as wide as the list or its whole
  // name, so only a row wider than the list tells its own width. Mounted rows
  // report it through the virtualizer's resize observer; the write waits a
  // frame so it never resizes observed rows inside that observer's callback.
  const treeRowWidthsRef = React.useRef(new Map<string, number>());
  const treeWidthFrameRef = React.useRef<number | null>(null);
  const writeTreeWidth = React.useCallback((list: HTMLElement) => {
    const widest = Math.max(0, ...treeRowWidthsRef.current.values());
    list.style.setProperty('--oc-file-tree-width', `${widest}px`);
  }, []);
  const recordTreeRowWidth = React.useCallback((element: HTMLElement, width: number) => {
    const path = element.dataset.treeRowPath;
    const list = treeListRef.current;
    if (!path || !list || width <= list.clientWidth + 0.5) return;
    if (treeRowWidthsRef.current.get(path) === width) return;
    treeRowWidthsRef.current.set(path, width);
    if (treeWidthFrameRef.current !== null) return;
    treeWidthFrameRef.current = requestAnimationFrame(() => {
      treeWidthFrameRef.current = null;
      if (treeListRef.current) writeTreeWidth(treeListRef.current);
    });
  }, [writeTreeWidth]);
  React.useEffect(() => () => {
    if (treeWidthFrameRef.current !== null) cancelAnimationFrame(treeWidthFrameRef.current);
  }, []);
  // When the rows change, rows that left the tree drop out, and mounted rows
  // measure again from the pane's width, so a name that got shorter narrows
  // the list. Measuring lays the list out narrower for a moment, which clamps
  // the sideways scroll; it is restored before paint.
  React.useLayoutEffect(() => {
    if (!treeListElement) return;
    const widths = treeRowWidthsRef.current;
    for (const path of widths.keys()) {
      if (!treeRowIndexByPath.has(path)) widths.delete(path);
    }
    const scrollLeft = treeScrollElement?.scrollLeft ?? 0;
    treeListElement.style.removeProperty('--oc-file-tree-width');
    const listWidth = treeListElement.clientWidth;
    for (const row of treeListElement.children) {
      const path = row instanceof HTMLElement ? row.dataset.treeRowPath : undefined;
      if (!path) continue;
      const width = row.getBoundingClientRect().width;
      if (width > listWidth + 0.5) widths.set(path, width);
      else widths.delete(path);
    }
    writeTreeWidth(treeListElement);
    if (treeScrollElement) treeScrollElement.scrollLeft = scrollLeft;
  }, [treeListElement, treeRowIndexByPath, treeScrollElement, writeTreeWidth]);
  const treeVirtualizer = useVirtualizer<HTMLElement, HTMLLIElement>({
    count: treeRows.length,
    // Enabled before the scroller exists, the virtualizer would cache offset 0.
    enabled: treeScrollElement !== null,
    getScrollElement: () => treeScrollElement,
    // Rows a folder just showed start at their real height: with a guess they
    // moved once measured, and the rows sliding under an opening folder jumped
    // at the end of the motion.
    estimateSize: (index) => (treeRows[index]?.kind === 'node' ? measuredRowHeightRef.current : null) ?? FILE_TREE_ROW_ESTIMATE_PX,
    measureElement: (element, entry, instance) => {
      const size = measureElement(element, entry, instance);
      if (element.dataset.treeRowPath) measuredRowHeightRef.current = size;
      if (entry) recordTreeRowWidth(element, entry.borderBoxSize?.[0]?.inlineSize ?? element.getBoundingClientRect().width);
      return size;
    },
    getItemKey: (index) => treeRows[index]?.key ?? index,
    overscan: 12,
    scrollMargin: treeListOffset,
    rangeExtractor,
=======
  const { treeRows, virtualRows, totalSize, measureRow, treeListOffset, setTreeScrollElement, attachTreeList, handleTreeFocus, handleTreeBlur } = useVirtualFileTree({
    root,
    childrenByDir,
    expandedPathSet,
    loadErrorsByDir,
    selectedPath,
    moveDragPath,
    slidingRowPaths,
    treeListRef,
>>>>>>> upstream/main
  });

  const renderTreeRow = (row: FileTreeRow<FileNode>): React.ReactNode => {
    if (row.kind === 'error') {
      return <FileTreeErrorRow depth={row.depth} message={row.message} directory={row.directory} onRefresh={refreshDirectory} />;
    }
    const { node, depth, isExpanded } = row;
    const isDir = node.type === 'directory';
    return (
      <MemoizedFileRow
        node={node}
        root={root}
        isExpanded={isExpanded}
        isActive={selectedPath === node.path}
        isBrowserClient={isBrowserClient}
        depth={depth}
        isOpen={!isDir && openContextFilePaths.has(node.path)}
        status={!isDir ? getFileStatus(node.path) : undefined}
        badge={isDir ? getFolderBadge(node.path) : undefined}
        isDropTarget={isDir && (dropIndicatorTarget === node.path || moveDropTarget === node.path)}
        isDragSource={moveDragPath === node.path}
        canUpload={canUpload && !isUploading}
        canMove={canMove}
        permissions={fileRowPermissions}
        downloadFile={files.downloadFile}
        onSelect={handleOpenFile}
        onToggle={toggleDirectory}
        onRevealPath={handleRevealPath}
        onOpenDialog={handleOpenDialog}
        onSetDropTarget={setDropTarget}
        onDropFiles={handleDropFiles}
        onPickFiles={pickFiles}
        onMoveDragChange={handleMoveDragChange}
        onSetMoveDropTarget={setMoveDropTarget}
        onMoveDrop={handleMoveDrop}
        guestActions={guestActions}
      />
    );
  };

  const hasTree = Boolean(root && childrenByDir[root]);
  const rootLoadError = root ? loadErrorsByDir[root] : null;
  const isSearchActive = debouncedSearchQuery.trim().length > 0;
  const showsTree = !searching && !isSearchActive && searchResults.length === 0 && !rootLoadError && hasTree && Boolean(root);
  const dropTargetLabel = dropIndicatorTarget ? getDropTargetLabel(root, dropIndicatorTarget) : '';
  const moveDropTargetLabel = moveDropTarget ? getDropTargetLabel(root, moveDropTarget) : '';

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center gap-1 border-t border-edge-muted px-2">
        <FileTreeSearchField
          canSearchContents={canSearchContents}
          contentSearchActive={contentSearchActive}
          searchMode={searchMode}
          onSearchModeChange={setSearchMode}
          regexSearch={regexSearch}
          onToggleRegex={() => setRegexSearch((value) => !value)}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          inputRef={searchInputRef}
        />
        <FileTreeToolbar
          root={root}
          currentDirectory={currentDirectory}
          canCreateFile={canCreateFile}
          canCreateFolder={canCreateFolder}
          canUpload={canUpload}
          isUploading={isUploading}
          showGitignored={showGitignored}
          onOpenDialog={handleOpenDialog}
          onPickFiles={pickFiles}
          onRefresh={() => void refreshRoot()}
          onCollapseAll={() => {
            if (root) collapseAllExpandedPaths(root);
          }}
        />
      </div>

      <div className="relative flex-1 min-h-0">
        <ScrollableOverlay
          ref={setTreeScrollElement}
          outerClassName="h-full min-h-0"
          className={cn('@container px-1.5 py-1.5 [overflow-anchor:none]', (dropIndicatorTarget === root || moveDropTarget === root) && 'bg-interactive-selection/10')}
          onDragEnter={handleRootDragOver}
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
        >
          <FileTreeFallbackList
            root={root}
            selectedPath={selectedPath}
            contentSearchActive={contentSearchActive}
            contentSearch={contentSearch}
            openedMatch={openedMatch}
            searching={searching}
            isSearchActive={isSearchActive}
            searchResults={searchResults}
            rootLoadError={rootLoadError}
            hasTree={hasTree}
            onOpenMatch={handleOpenMatch}
            onMatchDragStart={handleMatchDragStart}
            onMatchDragEnd={handleMatchDragEnd}
            onOpenFile={handleOpenFile}
            onRefreshRoot={refreshRoot}
          />
        {showsTree ? (
          <ul
            ref={attachTreeList}
            className="relative min-w-[max(100%,var(--oc-file-tree-width,0px))]"
            style={{ height: totalSize }}
            onFocus={handleTreeFocus}
            onBlur={handleTreeBlur}
          >
            {virtualRows.map((item) => {
              const row = treeRows[item.index];
              if (!row) return null;
              const path = row.kind === 'node' ? row.node.path : undefined;
              return (
                <li
                  key={item.key}
                  ref={measureRow}
                  data-index={item.index}
                  data-tree-row-path={path}
                  data-tree-disclosure-path={row.kind === 'node' ? path : `${row.directory}/`}
                  data-file-tree-path={row.kind === 'node' && row.node.type === 'file' ? path : undefined}
                  className={cn('absolute inset-x-0 top-0', row.kind === 'node' && 'min-w-max')}
                  style={{ transform: `translateY(${item.start - treeListOffset}px)` }}
                >
                  {renderTreeRow(row)}
                </li>
              );
            })}
          </ul>
        ) : null}
        </ScrollableOverlay>
        <FileTreeDropIndicator
          uploadTarget={dropIndicatorTarget}
          isUploading={isUploading}
          uploadTargetLabel={dropTargetLabel}
          moveTarget={moveDropTarget}
          moveTargetLabel={moveDropTargetLabel}
        />
      </div>

      {uploadElements}

      <FileTreeCrudDialog
        activeDialog={activeDialog}
        dialogData={dialogData}
        inputValue={dialogInputValue}
        isSubmitting={isDialogSubmitting}
        onInputChange={setDialogInputValue}
        onSubmit={() => void handleDialogSubmit()}
        onClose={() => setActiveDialog(null)}
      />

      <FileTreeMoveDialog
        root={root}
        pendingMove={pendingMove}
        onCancel={() => setPendingMove(null)}
        onConfirm={handleConfirmMove}
      />
    </section>
  );
};
