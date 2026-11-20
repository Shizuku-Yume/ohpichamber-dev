import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Input } from '@/components/ui/input';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { useFileTreeUpload } from '@/components/views/files/useFileTreeUpload';
import { AUTO_RELIST_MAX_ENTRIES, useFileTreeChanges, type FileTreeChangeBatch } from '@/components/views/files/useFileTreeChanges';
import type { FileTabCloseGuard } from '@/components/views/FilesView';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useI18n } from '@/lib/i18n';
import { useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import type { FileListEntry, FileSearchResult } from '@/lib/api/types';
import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { normalizeContextPanelDirectoryKey, useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import { normalizePath as normalizePathImpl } from '@/lib/pathNormalization';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { toast } from '@/components/ui';
import { copyTextToClipboard } from '@/lib/clipboard';
import { GuestIcon } from '@/components/layout/GuestRailIcon';
import { useGuestActions } from '@/hooks/useGuestSurfaces';
import { guestActionsWhere, type GuestActionEntry } from '@/lib/guests/actions';
import { runGuestAction } from '@/lib/guests/run-action';
import { MobileRowMenu } from './mobileSidebar/MobileRowMenu';
import { MOBILE_HEADER_BUTTON_CLASS, MOBILE_HEADER_CLASS, MOBILE_HEADER_TITLE_CLASS } from '@/components/ui/mobileHeader';

const LazyFilesEditor = React.lazy(() =>
  import('@/components/views/FilesView').then((module) => ({ default: module.FilesView })),
);

type MobileFilesRoute =
  | { type: 'browser'; directory: string }
  | { type: 'file'; path: string; returnDirectory: string };

type MobileSearchOutcome = { kind: 'success'; results: FileSearchResult[] } | { kind: 'error' };

const getNameFromPath = (path: string): string => {
  const normalized = normalizePathImpl(path) ?? '';
  if (!normalized || normalized === '/') return normalized || '/';
  return normalized.split('/').filter(Boolean).at(-1) ?? normalized;
};

const getParentDirectory = (path: string): string | null => {
  const normalized = normalizePathImpl(path) ?? '';
  if (!normalized || normalized === '/') return null;
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return normalized.startsWith('/') ? '/' : null;
  return normalized.slice(0, index);
};

const getRelativePath = (path: string, root: string): string => {
  const normalizedPath = normalizePathImpl(path) ?? '';
  const normalizedRoot = normalizePathImpl(root) ?? '';
  if (!normalizedRoot || normalizedPath === normalizedRoot) return getNameFromPath(normalizedPath);
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) return normalizedPath.slice(normalizedRoot.length + 1);
  return normalizedPath;
};

const formatFileSize = (size?: number): string => {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = size / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === units[units.length - 1]) return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
    value /= 1024;
  }
  return '';
};

type MobileFilesSurfaceProps = {
  onClose?: () => void;
  visible?: boolean;
  registerBackHandler?: (handler: (() => boolean) | null) => void;
};

export const MobileFilesSurface: React.FC<MobileFilesSurfaceProps> = ({ onClose, visible = true, registerBackHandler }) => {
  const draftSpace = useDraftSpaceTarget();
  const root = normalizePathImpl(useEffectiveDirectory() ?? null) ?? '';
  return <MobileFilesSurfaceForRoot key={root} root={root} onClose={onClose} visible={visible} registerBackHandler={registerBackHandler} />;
};

const MobileFilesSurfaceForRoot: React.FC<MobileFilesSurfaceProps & { root: string; visible: boolean }> = ({ root, onClose, visible, registerBackHandler }) => {
  const { t } = useI18n();
  const { files } = useRuntimeAPIs();
  const showGitignored = useFilesViewShowGitignored();
  const setSelectedPath = useFilesViewTabsStore((state) => state.setSelectedPath);
  const [route, setRoute] = React.useState<MobileFilesRoute>(() => ({ type: 'browser', directory: root }));
  const [entries, setEntries] = React.useState<FileListEntry[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = React.useState(false);
  const [directoryError, setDirectoryError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [searchOutcome, setSearchOutcome] = React.useState<MobileSearchOutcome | null>(null);
  const [searchAttempt, setSearchAttempt] = React.useState(0);
  const normalizedQuery = query.trim();
  const directoryLoadRequestIdRef = React.useRef(0);

  const currentDirectory = route.type === 'browser' ? route.directory : route.returnDirectory;
  const currentDirectoryRef = React.useRef(currentDirectory);
  currentDirectoryRef.current = currentDirectory;
  const fileTabCloseGuard = React.useRef<FileTabCloseGuard | null>(null);

  const returnToBrowser = React.useCallback(() => {
    if (route.type !== 'file') return false;
    const leave = () => setRoute({ type: 'browser', directory: route.returnDirectory });
    const guard = fileTabCloseGuard.current;
    if (guard) {
      guard(normalizeContextPanelDirectoryKey(root), 'all', leave);
    } else {
      leave();
    }
    return true;
  }, [root, route]);

  React.useEffect(() => {
    if (!visible || route.type !== 'file' || !registerBackHandler) return;
    registerBackHandler(returnToBrowser);
    return () => registerBackHandler(null);
  }, [visible, route.type, registerBackHandler, returnToBrowser]);

  const loadDirectory = React.useCallback(async (directory: string, options?: { background?: boolean }) => {
    if (!directory) return;
    const respectGitignore = !showGitignored;
    const requestId = directoryLoadRequestIdRef.current + 1;
    directoryLoadRequestIdRef.current = requestId;
    setIsLoadingDirectory(true);
    if (!options?.background) setDirectoryError(null);
    try {
      const result = await files.listDirectory(directory, { respectGitignore });
      if (directoryLoadRequestIdRef.current !== requestId) return;
      setDirectoryError(null);
      setEntries(result.entries.slice().sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
    } catch (error) {
      if (directoryLoadRequestIdRef.current !== requestId) return;
      if (options?.background) {
        console.error('Failed to reload mobile directory:', error);
        return;
      }
      setEntries([]);
      setDirectoryError(error instanceof Error ? error.message : t('mobile.files.error.listFailed'));
    } finally {
      if (directoryLoadRequestIdRef.current === requestId) {
        setIsLoadingDirectory(false);
      }
    }
  }, [files, showGitignored, t]);

  React.useEffect(() => {
    if (route.type !== 'browser') return;
    void loadDirectory(route.directory);
  }, [loadDirectory, route]);

  const routeRef = React.useRef(route);
  routeRef.current = route;
  const entriesRef = React.useRef(entries);
  entriesRef.current = entries;
  const reloadChangedDirectory = React.useCallback(({ directories }: FileTreeChangeBatch) => {
    const current = routeRef.current;
    if (current.type !== 'browser') return;
    if (directories && !directories.some((directory) => (normalizePathImpl(directory) ?? '') === (normalizePathImpl(current.directory) ?? ''))) return;
    if (entriesRef.current.length > AUTO_RELIST_MAX_ENTRIES) return;
    void loadDirectory(current.directory, { background: true });
  }, [loadDirectory]);
  useFileTreeChanges({ root, active: visible, whileInactive: 'hold', onChanges: reloadChangedDirectory });

  const refreshUploadedDirectory = React.useCallback(async (directory: string) => {
    if ((normalizePathImpl(directory) ?? '') !== (normalizePathImpl(currentDirectoryRef.current) ?? '')) return;
    await loadDirectory(currentDirectoryRef.current);
  }, [loadDirectory]);

  const { canUpload, uploadingDirectory, pickFiles, uploadElements } = useFileTreeUpload({
    root,
    refreshDirectory: refreshUploadedDirectory,
  });
  const isUploading = uploadingDirectory !== null;
  const guestActions = useGuestActions();
  const fileActions = React.useMemo<MobileFileActions>(
    () => ({ root, entries: guestActionsWhere(guestActions, 'file') }),
    [guestActions, root],
  );

  React.useEffect(() => {
    setSearchOutcome(null);
    if (route.type !== 'browser' || !normalizedQuery) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void files.search({ directory: route.directory, query: normalizedQuery, maxResults: 40 })
        .then((results) => {
          if (!cancelled) setSearchOutcome({ kind: 'success', results });
        })
        .catch(() => {
          if (!cancelled) setSearchOutcome({ kind: 'error' });
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [files, normalizedQuery, route, searchAttempt]);

  const openDirectory = (directory: string) => {
    setQuery('');
    setRoute({ type: 'browser', directory });
  };

  const openFile = (path: string) => {
    setSelectedPath(root, path);
    setRoute({ type: 'file', path, returnDirectory: currentDirectory || root });
  };

  const pendingFileFocusPath = useUIStore((state) => state.pendingFileFocusPath);
  const pendingFileNavigation = useUIStore((state) => state.pendingFileNavigation);
  React.useEffect(() => {
    const target = normalizePathImpl(pendingFileNavigation?.path ?? pendingFileFocusPath ?? '') ?? '';
    if (!target || !root) return;
    setSelectedPath(root, target, { allowOutsideRoot: true });
    setRoute({ type: 'file', path: target, returnDirectory: root });
    if (pendingFileFocusPath) useUIStore.getState().setPendingFileFocusPath(null);
  }, [pendingFileFocusPath, pendingFileNavigation, root, setSelectedPath]);

  if (!root) {
    return <MobileFilesState message={t('mobile.files.empty.noDirectory')} />;
  }

  if (route.type === 'file') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-[var(--oc-header-height,56px)] shrink-0 items-center gap-2 border-b border-border/70 px-3 text-foreground">
          <button
            type="button"
            className="-ml-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('header.actions.backAria')}
            onClick={returnToBrowser}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="arrow-left" className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate typography-ui-header text-foreground">{getNameFromPath(route.path)}</h2>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary>
            <React.Suspense fallback={<MobileFilesState loading message={t('filesView.state.loading')} />}>
              <LazyFilesEditor mode="editor-only" fileTabCloseGuard={fileTabCloseGuard} />
            </React.Suspense>
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  const directoryLabel = route.directory === root ? t('mobile.files.rootDirectory') : getNameFromPath(route.directory);

  const rawParent = getParentDirectory(route.directory);
  const parentWithinRoot =
    route.directory !== root && rawParent !== null && (rawParent === root || rawParent.startsWith(`${root}/`));
  const canGoBack = parentWithinRoot && !normalizedQuery;
  const parentDirectory = parentWithinRoot ? rawParent : null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      {uploadElements}
      <header className="flex h-[var(--oc-header-height,56px)] shrink-0 items-center gap-2 px-3 text-foreground">
        {onClose ? (
          <button
            type="button"
            className="-ml-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('mobile.surface.closeAria')}
            onClick={onClose}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="close" className="size-5" />
          </button>
        ) : null}
        {canGoBack && parentDirectory ? (
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('mobile.files.backToParentAria', { name: getNameFromPath(parentDirectory) })}
            onClick={() => openDirectory(parentDirectory)}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="arrow-left" className="size-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate typography-ui-label text-foreground">{directoryLabel}</h2>
        </div>
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('mobile.files.refreshAria')}
          onClick={() => void loadDirectory(route.directory)}
          style={{ touchAction: 'manipulation' }}
        >
          <Icon name="refresh" className={cn('size-5', isLoadingDirectory && 'animate-spin')} />
        </button>
        {canUpload ? (
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            aria-label={t('sidebarFilesTree.actions.uploadFilesTitle')}
            onClick={() => pickFiles(route.directory)}
            disabled={isUploading}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name={isUploading ? 'loader-4' : 'upload-2'} className={cn('size-5', isUploading && 'animate-spin')} />
          </button>
        ) : null}
      </header>
      <div className="shrink-0 px-4 pb-2 pt-1">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('mobile.files.search.placeholder')}
            className="h-11 pl-9"
          />
        </div>
      </div>

      <ScrollShadow className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {normalizedQuery ? (
          <MobileSearchResults
            outcome={searchOutcome}
            onOpenFile={openFile}
            onRetry={() => setSearchAttempt((attempt) => attempt + 1)}
          />
        ) : directoryError ? (
          <MobileFilesState message={directoryError} />
        ) : query.trim() ? (
          <MobileSearchResults root={root} results={visibleSearchResults} isSearching={isSearching} actions={fileActions} onOpenFile={openFile} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-[var(--surface-elevated)]">
            {entries.length === 0 && !isLoadingDirectory ? (
              <div className="px-4 py-8 text-center text-muted-foreground">{t('mobile.files.empty.directory')}</div>
            ) : null}
            {entries.map((entry) => (
              <MobileFileRow
                key={entry.path}
                name={entry.name}
                path={entry.path}
                directory={entry.isDirectory}
                meta={entry.isDirectory ? undefined : formatFileSize(entry.size)}
                actions={fileActions}
                onClick={() => entry.isDirectory ? openDirectory(entry.path) : openFile(entry.path)}
              />
            ))}
          </div>
        )}
      </ScrollShadow>
    </div>
  );
};

type MobileFileActions = { root: string; entries: GuestActionEntry[] };

const MobileFileRow: React.FC<{
  name: string;
  path: string;
  directory: boolean;
  meta?: string;
  actions: MobileFileActions;
  onClick: () => void;
}> = ({ name, path, directory, meta, actions, onClick }) => {
  const { t } = useI18n();
  const row = (
    <button
      type="button"
      className="flex min-h-14 w-full items-center gap-3 border-b border-border/70 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      onClick={onClick}
      style={{ touchAction: 'manipulation' }}
    >
      {directory ? (
        <Icon name="folder-3-fill" className="size-5 shrink-0 text-primary/80" />
      ) : (
        <FileTypeIcon filePath={path} className="size-5 shrink-0" />
      )}
      <span className="block min-w-0 flex-1 truncate typography-ui-label text-foreground">{name}</span>
      {meta ? <span className="shrink-0 typography-micro text-muted-foreground">{meta}</span> : null}
      {directory ? <Icon name="arrow-right-s" className="size-4 shrink-0 text-muted-foreground/60" /> : null}
    </button>
  );
  const copyPath = () => {
    void copyTextToClipboard(path).then((result) => {
      if (result.ok) {
        toast.success(t('sidebarFilesTree.toast.pathCopied'));
        return;
      }
      toast.error(t('sidebarFilesTree.toast.copyFailed'));
    });
  };
  return (
    <MobileRowMenu
      menu={<>
        <ContextMenuItem onClick={copyPath}>
          <Icon name="link" className="me-1 size-4" />
          {t('sidebarFilesTree.menu.copyPath')}
        </ContextMenuItem>
        {actions.entries.length > 0 ? <ContextMenuSeparator /> : null}
        {actions.entries.map((entry) => (
          <ContextMenuItem
            key={`${entry.guest.id}:${entry.action.id}`}
            onClick={() => { void runGuestAction(entry, { kind: 'file', action: entry.action.id, directory: actions.root || null, path, isDirectory: directory }, t); }}
          >
            <GuestIcon icon={entry.icon} iconSrc={entry.iconSrc} className="me-1 size-4" />
            {entry.action.label}
          </ContextMenuItem>
        ))}
      </>}
    >
      {row}
    </MobileRowMenu>
  );
};

const MobileSearchResults: React.FC<{
  outcome: MobileSearchOutcome | null;
  actions: MobileFileActions;
  onOpenFile: (path: string) => void;
  onRetry: () => void;
}> = ({ outcome, actions, onOpenFile, onRetry }) => {
  const { t } = useI18n();
  const root = normalizePathImpl(useEffectiveDirectory() ?? null) ?? '';
  if (!outcome) return <MobileFilesState loading message={t('common.loading')} />;
  if (outcome.kind === 'error') {
    return (
      <MobileFilesState message={t('mobile.files.search.failed')}>
        <Button type="button" variant="outline" size="lg" onClick={onRetry}>{t('mobile.files.search.retry')}</Button>
      </MobileFilesState>
    );
  }
  if (outcome.results.length === 0) return <MobileFilesState message={t('mobile.files.search.empty')} />;
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-[var(--surface-elevated)]">
      {outcome.results.map((result) => (
        <MobileFileRow
          key={result.path}
          name={getNameFromPath(result.path)}
          path={result.path}
          directory={false}
          meta={getRelativePath(result.path, root)}
          actions={actions}
          onClick={() => onOpenFile(result.path)}
        />
      ))}
    </div>
  );
};


const MobileFilesState: React.FC<React.PropsWithChildren<{ message: string; loading?: boolean }>> = ({ message, loading = false, children }) => (
  <div className="flex h-full items-center justify-center px-6 text-center">
    <div className="flex max-w-sm flex-col items-center gap-2">
      {loading ? <Icon name="loader-4" className="size-5 animate-spin text-muted-foreground" /> : <Icon name="folder-open-fill" className="size-6 text-muted-foreground" />}
      <p role="status" className="typography-ui-label font-semibold text-foreground">{message}</p>
      {children}
    </div>
  </div>
);
