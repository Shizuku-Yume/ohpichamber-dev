import React from 'react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import {
  GLOBAL_IDENTITY_ID,
  activeIdentityFor,
  isSshRemoteUrl,
  proposeIdentityForHost,
  remoteTraits,
  type RemoteTraits,
  selectableIdentities,
  identityAccountConnected,
} from '@/lib/source-control/identity';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { GitOperationResultError, runGitClone } from '@/lib/boundGitNetworkOperation';
import { PendingGitOperationError } from '@/lib/source-control/git-operation-recovery';
import { useGitOperationRecovery } from '@/components/views/git/useGitOperationRecovery';
import { GitOperationStatus } from '@/components/views/git/GitOperationStatus';
import { useExistingRepositorySummary } from './useExistingRepositorySummary';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { identityTransport, isCompleteIdentity } from '@/lib/api/git-identity';
import { applyIdentityToRepository, identityApplicability, type IdentityApplicability } from '@/lib/source-control/applyIdentity';
import type { GitIdentityProfile } from '@/lib/api/types';
import { useSourceControlAuthStore, useConnectedAccountIds } from '@/stores/useSourceControlAuthStore';
import { IdentityDropdown } from '@/components/views/git/GitHeader';
import { useMobileAppActions } from '@/apps/mobileAppContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
<<<<<<< HEAD
||||||| bc50ba56aa
import { initialBrowseQuery, isRootedBrowseQuery, projectBrowsePlaces, resolveBrowseQuery } from './directoryExplorerStart';
=======
import { getBrowseParentPath, initialBrowseQuery, isRootedBrowseQuery, joinBrowsePath, projectBrowsePlaces, resolveBrowseQuery, trimTrailingSeparators } from './directoryExplorerStart';
>>>>>>> upstream/main
import { getDirectoryPickerLabelKey } from './directoryExplorerLabels';
import { initialBrowseQuery } from './directoryExplorerStart';
import { formatShortcutForDisplay } from '@/lib/shortcuts';
import { useUIStore } from '@/stores/useUIStore';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useFileSystemAccess } from '@/hooks/useFileSystemAccess';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { useDeviceInfo } from '@/lib/device';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { Icon } from "@/components/icon/Icon";
import { hostFilesystem } from '@/lib/host-filesystem';
import { useI18n } from '@/lib/i18n';
import {
  isFilesystemError,
  type FilesystemErrorReason,
} from '@/lib/api/files-errors';

interface DirectoryExplorerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
<<<<<<< HEAD
||||||| bc50ba56aa
  /** Takes over from opening a new session draft in the added project. Picks one folder at a time. */
  onProjectAdded?: (project: { id: string; path: string }) => void;
=======
  onProjectAdded?: (project: { id: string; path: string }) => void;
>>>>>>> upstream/main
}

type BrowseEntry = {
  name: string;
  path: string;
};

<<<<<<< HEAD
type BrowseRow =
  | { type: 'up'; value: 'browse:up'; name: string; path: string | null }
  // An added folder can still be browsed for its subfolders; only adding it again is blocked.
  | { type: 'directory'; value: string; name: string; path: string; added: boolean };
||||||| bc50ba56aa
// An added folder can still be browsed for its subfolders; only adding it again is blocked.
// A link to an added project names that project and where it really is.
type BrowseRow = {
  value: string;
  name: string;
  path: string;
  added: boolean;
  linkTarget: { label: string; path: string } | null;
};

type ExplorerView = 'folder' | 'opencode' | 'clone';

const LOADING_MESSAGE_DELAY_MS = 200;
=======
type BrowseRow = {
  value: string;
  name: string;
  path: string;
  added: boolean;
  linkTarget: { label: string; path: string } | null;
};

type ExplorerView = 'folder' | 'opencode' | 'clone';

const LOADING_MESSAGE_DELAY_MS = 200;
>>>>>>> upstream/main

const normalizeSeparators = (value: string): string => value.replace(/\\/g, '/');

const hasTrailingPathSeparator = (value: string): boolean => value.endsWith('/');

const ensureBrowseDirectoryPath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || hasTrailingPathSeparator(trimmed)) return trimmed;
  return `${trimmed}/`;
};

const getLastPathSeparatorIndex = (value: string): number => value.lastIndexOf('/');

const getBrowseDirectoryPath = (value: string): string => {
  if (hasTrailingPathSeparator(value)) return value;
  const lastSeparator = getLastPathSeparatorIndex(value);
  if (lastSeparator < 0) return value;
  return value.slice(0, lastSeparator + 1);
};

const getBrowseLeafPathSegment = (value: string): string => {
  const lastSeparator = getLastPathSeparatorIndex(value);
  return value.slice(lastSeparator + 1);
};

<<<<<<< HEAD
const getBrowseParentPath = (value: string): string | null => {
  const trimmed = trimTrailingSeparators(value.trim());
  if (!trimmed || trimmed === '~' || trimmed === '~/' || trimmed === '/') return null;
  const lastSeparator = getLastPathSeparatorIndex(trimmed);
  if (lastSeparator < 0) return null;
  if (trimmed.startsWith('~/') && lastSeparator <= 1) return '~/';
  if (lastSeparator === 0) return '/';
  return `${trimmed.slice(0, lastSeparator)}/`;
};

const canNavigateUp = (value: string): boolean => hasTrailingPathSeparator(value) && getBrowseParentPath(value) !== null;
||||||| bc50ba56aa
const getBrowseParentPath = (value: string): string | null => {
  const trimmed = trimTrailingSeparators(value.trim());
  if (!trimmed || trimmed === '~' || trimmed === '~/' || trimmed === '/') return null;
  const lastSeparator = getLastPathSeparatorIndex(trimmed);
  if (lastSeparator < 0) return null;
  if (trimmed.startsWith('~/') && lastSeparator <= 1) return '~/';
  if (lastSeparator === 0) return '/';
  return `${trimmed.slice(0, lastSeparator)}/`;
};

const lastPathSegment = (value: string): string => {
  const trimmed = trimTrailingSeparators(value);
  return trimmed.slice(getLastPathSeparatorIndex(trimmed) + 1) || trimmed;
};
=======
const lastPathSegment = (value: string): string => {
  const trimmed = trimTrailingSeparators(value);
  return trimmed.slice(getLastPathSeparatorIndex(trimmed) + 1) || trimmed;
};
>>>>>>> upstream/main

const appendBrowsePathSegment = (currentPath: string, segment: string): string => (
  `${getBrowseDirectoryPath(currentPath)}${segment}/`
);

const normalizeDirectoryPath = (path: string | null | undefined): string | null => {
  if (!path) return null;
  const normalized = trimTrailingSeparators(normalizeSeparators(path.trim()));
  if (!normalized) return null;
  return normalized.toLowerCase();
};

const displayPathToAbsolutePath = (value: string, homeDirectory: string): string => {
  const trimmed = value.trim();
  if (trimmed === '~') return homeDirectory;
  if (trimmed.startsWith('~/')) {
    const rest = trimmed.slice(1);
    return rest.startsWith('//') ? rest.slice(1) : `${homeDirectory}${rest}`;
  }
  return trimmed;
};

const cloneDirectoryName = (remoteUrl: string): string => {
  const withoutQuery = remoteUrl.trim().split(/[?#]/, 1)[0] ?? '';
  const name = withoutQuery.match(/([^/:]+?)(?:\.git)?\/?$/)?.[1]?.trim() ?? '';
  return name === '.' || name === '..' ? '' : name;
};

const isPrimaryModifierPressed = (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
};

const focusPathInput = (input: HTMLInputElement | null): void => {
  if (!input) return;
  input.focus({ preventScroll: true });
  const valueLength = input.value.length;
  input.setSelectionRange(valueLength, valueLength);
  input.scrollLeft = input.scrollWidth;
};

const resolveFreshFilesystemHome = async (): Promise<string | null> => {
  try {
    const response = await runtimeFetch('/api/fs/home', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json() as { home?: unknown };
      if (typeof data.home === 'string' && data.home.trim().length > 0) {
        return normalizeSeparators(data.home.trim());
      }
    }
  } catch {
    // Fall back to the client helper below.
  }

  return hostFilesystem.getFilesystemHome().catch(() => null);
};

export const DirectoryExplorerDialog: React.FC<DirectoryExplorerDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { t } = useI18n();
  const { git, sourceControl } = useRuntimeAPIs();
  const runtimeKey = getRuntimeKey();
  const openContextSurface = useUIStore((s) => s.openContextSurface);
  const mobileActions = useMobileAppActions();
  const refreshAccounts = useSourceControlAuthStore((s) => s.refreshAll);
  const homeDirectory = useDirectoryStore((s) => s.homeDirectory);
  const projects = useProjectsStore((s) => s.projects);
  const addProject = useProjectsStore((s) => s.addProject);
  const addProjects = useProjectsStore((s) => s.addProjects);
  const [selectedPaths, setSelectedPaths] = React.useState<string[]>([]);
  const setSessionSwitcherOpen = useUIStore((s) => s.setSessionSwitcherOpen);
  const openNewSessionDraft = useSessionUIStore((s) => s.openNewSessionDraft);
  const gitIdentityProfiles = useGitIdentitiesStore((s) => s.profiles);
  const gitIdentityPhase = useGitIdentitiesStore((s) => s.phase);
  const globalGitIdentity = useGitIdentitiesStore((s) => s.globalIdentity);
  const defaultGitIdentityId = useGitIdentitiesStore((s) => s.defaultGitIdentityId);
  const { canRequestAccess, requestAccess, startAccessing } = useFileSystemAccess();
  const { isMobile } = useDeviceInfo();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const rowRefs = React.useRef(new Map<string, HTMLElement>());
  const [dialogHomeDirectory, setDialogHomeDirectory] = React.useState('');
  const [query, setQuery] = React.useState('~/');
  const [entries, setEntries] = React.useState<BrowseEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isBrowseDirectoryMissing, setIsBrowseDirectoryMissing] = React.useState(false);
  const [browseErrorReason, setBrowseErrorReason] = React.useState<FilesystemErrorReason | null>(null);
  const [browseReloadKey, setBrowseReloadKey] = React.useState(0);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isOpeningFinder, setIsOpeningFinder] = React.useState(false);
  const [addButtonWidth, setAddButtonWidth] = React.useState(0);
  const [isCloneMode, setIsCloneMode] = React.useState(false);
  const [cloneRemoteUrl, setCloneRemoteUrl] = React.useState('');
  const [identityChoice, setIdentityChoice] = React.useState<{ key: string; id: string } | null>(null);
  const cloneController = React.useRef<AbortController | null>(null);
<<<<<<< HEAD
||||||| bc50ba56aa
  const openCodeProjects = useOpenCodeProjects(open && !runtime.isVSCode && !onProjectAdded, runtimeKey);
  // The OpenCode list can be gone by the time a view of it would show.
  const view = requestedView === 'opencode' && openCodeProjects.length === 0 ? 'folder' : requestedView;
  const isCloneMode = view === 'clone';
  const isOpenCodeView = view === 'opencode';
  // A single-folder flow never selects; the clone destination is the path field.
  const canSelect = !onProjectAdded && !isCloneMode;
=======
  const openCodeProjects = useOpenCodeProjects(open && !runtime.isVSCode && !onProjectAdded, runtimeKey);
  const view = requestedView === 'opencode' && openCodeProjects.length === 0 ? 'folder' : requestedView;
  const isCloneMode = view === 'clone';
  const isOpenCodeView = view === 'opencode';
  const canSelect = !onProjectAdded && !isCloneMode;
>>>>>>> upstream/main
  const cloneRecovery = useGitOperationRecovery(open && isCloneMode ? 'clone' : null, git, sourceControl, { kind: 'clone' });
  const [showHidden, setShowHidden] = React.useState(false);

  const explorerRootDirectory = dialogHomeDirectory || homeDirectory;

<<<<<<< HEAD
  const addedProjectPaths = React.useMemo(() => new Set(
    projects
      .map((project) => normalizeDirectoryPath(project.path))
      .filter((path): path is string => Boolean(path))
  ), [projects]);
||||||| bc50ba56aa
  const addedProjectsByPath = React.useMemo(() => {
    const byPath = new Map<string, (typeof projects)[number]>();
    for (const project of projects) {
      const normalized = normalizeDirectoryPath(project.path);
      if (normalized) byPath.set(normalized, project);
    }
    return byPath;
  }, [projects]);
  // Settings keep a project under its real path, so a folder that links to an
  // added project is that project and adding it again would add nothing.
  // Keyed by the normalized folder path; filled as folders are listed.
  const [realPaths, setRealPaths] = React.useState<ReadonlyMap<string, string>>(new Map());
  const addedProjectOf = React.useCallback((path: string) => {
    const normalized = normalizeDirectoryPath(path);
    if (!normalized) return null;
    const own = addedProjectsByPath.get(normalized);
    if (own) return own;
    const real = normalizeDirectoryPath(realPaths.get(normalized));
    return (real && addedProjectsByPath.get(real)) || null;
  }, [addedProjectsByPath, realPaths]);
=======
  const addedProjectsByPath = React.useMemo(() => {
    const byPath = new Map<string, (typeof projects)[number]>();
    for (const project of projects) {
      const normalized = normalizeDirectoryPath(project.path);
      if (normalized) byPath.set(normalized, project);
    }
    return byPath;
  }, [projects]);
  const [realPaths, setRealPaths] = React.useState<ReadonlyMap<string, string>>(new Map());
  const addedProjectOf = React.useCallback((path: string) => {
    const normalized = normalizeDirectoryPath(path);
    if (!normalized) return null;
    const own = addedProjectsByPath.get(normalized);
    if (own) return own;
    const real = normalizeDirectoryPath(realPaths.get(normalized));
    return (real && addedProjectsByPath.get(real)) || null;
  }, [addedProjectsByPath, realPaths]);
>>>>>>> upstream/main

  React.useEffect(() => {
    if (!open) return;
    setQuery('~/');
    setEntries([]);
    setHighlightedIndex(0);
    setIsConfirming(false);
    setIsOpeningFinder(false);
    setIsCloneMode(false);
    setCloneRemoteUrl('');
    setIdentityChoice(null);
    setSelectedPaths([]);
    setShowHidden(false);
    requestAnimationFrame(() => focusPathInput(inputRef.current));

    let cancelled = false;
    const resolveHome = async () => {
      const resolved = await resolveFreshFilesystemHome();
      if (cancelled) return;
      const home = resolved || homeDirectory || '';
      setDialogHomeDirectory(home);
      const start = initialBrowseQuery(useProjectsStore.getState().projects, home);
      setQuery((current) => (current === '~/' ? start : current));
      requestAnimationFrame(() => focusPathInput(inputRef.current));
    };
    void resolveHome();
    return () => {
      cancelled = true;
      cloneController.current?.abort();
    };
  }, [homeDirectory, open, runtimeKey]);

  React.useEffect(() => {
    if (open && isCloneMode) void refreshAccounts(sourceControl);
  }, [open, isCloneMode, refreshAccounts, sourceControl, runtimeKey]);



  const connectedAccountIds = useConnectedAccountIds();
  const availableGitIdentities = React.useMemo(
    () => selectableIdentities(gitIdentityProfiles, globalGitIdentity,
      (identity) => isCompleteIdentity(identity)
        && identityAccountConnected(identity, connectedAccountIds)),
    [gitIdentityProfiles, globalGitIdentity, connectedAccountIds],
  );


<<<<<<< HEAD
  const browseDirectoryDisplayPath = React.useMemo(() => getBrowseDirectoryPath(query), [query]);
||||||| bc50ba56aa
  // The last folder the field pointed at, which a rail entry stays selected for
  // while the field is cleared or holds a bare name.
  React.useEffect(() => {
    if (isRootedBrowseQuery(query) && query.includes('/')) setBrowsedFolder(getBrowseDirectoryPath(query));
  }, [query]);
  const resolvedQuery = React.useMemo(() => resolveBrowseQuery(query, browsedFolder), [browsedFolder, query]);
  const browseDirectoryDisplayPath = React.useMemo(() => getBrowseDirectoryPath(resolvedQuery), [resolvedQuery]);
=======
  React.useEffect(() => {
    if (isRootedBrowseQuery(query) && query.includes('/')) setBrowsedFolder(getBrowseDirectoryPath(query));
  }, [query]);
  const resolvedQuery = React.useMemo(() => resolveBrowseQuery(query, browsedFolder), [browsedFolder, query]);
  const browseDirectoryDisplayPath = React.useMemo(() => getBrowseDirectoryPath(resolvedQuery), [resolvedQuery]);
>>>>>>> upstream/main
  const browseFilterQuery = React.useMemo(
    () => (hasTrailingPathSeparator(query) ? '' : getBrowseLeafPathSegment(query)),
    [query]
  );
  const browseDirectoryAbsolutePath = React.useMemo(
    () => explorerRootDirectory ? displayPathToAbsolutePath(browseDirectoryDisplayPath, explorerRootDirectory) : '',
    [browseDirectoryDisplayPath, explorerRootDirectory]
  );

  React.useEffect(() => {
    if (!open || !browseDirectoryAbsolutePath) {
      setEntries([]);
      setBrowseErrorReason(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
<<<<<<< HEAD
||||||| bc50ba56aa
    // A listing usually arrives within a frame or two. The previous rows stay
    // until then, so switching folders does not flash a loading line.
    const slowLoading = setTimeout(() => setIsLoadingSlowly(true), LOADING_MESSAGE_DELAY_MS);
=======
    const slowLoading = setTimeout(() => setIsLoadingSlowly(true), LOADING_MESSAGE_DELAY_MS);
>>>>>>> upstream/main
    setIsBrowseDirectoryMissing(false);
    setBrowseErrorReason(null);
    hostFilesystem.listLocalDirectory(browseDirectoryAbsolutePath)
      .then((result) => {
        if (cancelled) return;
        setIsBrowseDirectoryMissing(false);
        setBrowseErrorReason(null);
        const nextEntries = result
          .filter((entry) => entry.isDirectory)
          .map((entry) => ({
            name: entry.name,
            path: normalizeSeparators(entry.path),
          }))
          .sort((left, right) => left.name.localeCompare(right.name));
<<<<<<< HEAD
||||||| bc50ba56aa
        // With the rows, so a link never shows as addable first. The folder
        // itself is resolved too: the path field can point at it.
        const resolved = await opencodeClient.getDirectoryRealPaths([
          browseDirectoryAbsolutePath,
          ...nextEntries.map((entry) => entry.path),
        ]);
        if (cancelled) return;
        setIsBrowseDirectoryMissing(false);
        setBrowseErrorReason(null);
        setRealPaths((current) => {
          const next = new Map(current);
          for (const [path, realPath] of resolved) {
            const normalized = normalizeDirectoryPath(path);
            if (normalized) next.set(normalized, realPath);
          }
          return next;
        });
=======
        const resolved = await opencodeClient.getDirectoryRealPaths([
          browseDirectoryAbsolutePath,
          ...nextEntries.map((entry) => entry.path),
        ]);
        if (cancelled) return;
        setIsBrowseDirectoryMissing(false);
        setBrowseErrorReason(null);
        setRealPaths((current) => {
          const next = new Map(current);
          for (const [path, realPath] of resolved) {
            const normalized = normalizeDirectoryPath(path);
            if (normalized) next.set(normalized, realPath);
          }
          return next;
        });
>>>>>>> upstream/main
        setEntries(nextEntries);
      })
      .catch((error) => {
        if (!cancelled) {
          setEntries([]);
          const reason = isFilesystemError(error) ? error.reason : 'unknown';
          setBrowseErrorReason(reason);
          setIsBrowseDirectoryMissing(reason === 'not-found');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [browseDirectoryAbsolutePath, browseReloadKey, open]);

  const filteredEntries = React.useMemo(() => {
    const lowerFilter = browseFilterQuery.toLowerCase();
    const includeHidden = showHidden || browseFilterQuery.startsWith('.');
    return entries.filter((entry) => (
      entry.name.toLowerCase().startsWith(lowerFilter) && (includeHidden || !entry.name.startsWith('.'))
    ));
  }, [browseFilterQuery, entries, showHidden]);

  const rows = React.useMemo<BrowseRow[]>(() => {
<<<<<<< HEAD
    const nextRows: BrowseRow[] = [];
    if (canNavigateUp(query)) {
      nextRows.push({ type: 'up', value: 'browse:up', name: '..', path: getBrowseParentPath(query) });
    }
    for (const entry of filteredEntries) {
      const normalized = normalizeDirectoryPath(entry.path);
      nextRows.push({
        type: 'directory',
||||||| bc50ba56aa
    // A folder is a link when it is not where its parent really is: a link
    // further up (a linked home folder) moves every row and marks none.
    const folderRealPath = realPaths.get(normalizeDirectoryPath(browseDirectoryAbsolutePath) ?? '');
    return filteredEntries.map((entry) => {
      const project = addedProjectOf(entry.path);
      const unlinkedPath = !folderRealPath ? entry.path
        : isRootPath(folderRealPath) ? `/${entry.name}`
          : `${trimTrailingSeparators(folderRealPath)}/${entry.name}`;
      const isLink = project !== null && normalizeDirectoryPath(project.path) !== normalizeDirectoryPath(unlinkedPath);
      return {
=======
    const folderRealPath = realPaths.get(normalizeDirectoryPath(browseDirectoryAbsolutePath) ?? '');
    return filteredEntries.map((entry) => {
      const project = addedProjectOf(entry.path);
      const unlinkedPath = folderRealPath ? joinBrowsePath(folderRealPath, entry.name) : entry.path;
      const isLink = project !== null && normalizeDirectoryPath(project.path) !== normalizeDirectoryPath(unlinkedPath);
      return {
>>>>>>> upstream/main
        value: `browse:${entry.path}`,
        name: entry.name,
        path: entry.path,
<<<<<<< HEAD
        added: Boolean(normalized && addedProjectPaths.has(normalized)),
      });
    }
    return nextRows;
  }, [addedProjectPaths, filteredEntries, query]);
||||||| bc50ba56aa
        added: project !== null,
        // The sidebar's name for the project.
        linkTarget: isLink ? {
          label: formatProjectLabel(project.label?.trim() || formatDirectoryName(project.path, explorerRootDirectory) || project.path),
          path: project.path,
        } : null,
      };
    });
  }, [addedProjectOf, browseDirectoryAbsolutePath, explorerRootDirectory, filteredEntries, realPaths]);
=======
        added: project !== null,
        linkTarget: isLink ? {
          label: formatProjectLabel(project.label?.trim() || formatDirectoryName(project.path, explorerRootDirectory) || project.path),
          path: project.path,
        } : null,
      };
    });
  }, [addedProjectOf, browseDirectoryAbsolutePath, explorerRootDirectory, filteredEntries, realPaths]);
>>>>>>> upstream/main

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [query, rows.length]);

  const targetPath = React.useMemo(() => {
    if (!explorerRootDirectory) return '';
    return trimTrailingSeparators(displayPathToAbsolutePath(query, explorerRootDirectory));
  }, [explorerRootDirectory, query]);
  // Selections apply to the currently browsed directory: navigating into
  // another folder clears the pending batch so the primary action always
  // reflects the visible picker state.
  React.useEffect(() => {
    setSelectedPaths([]);
  }, [browseDirectoryAbsolutePath]);
  const selectionPaths = React.useMemo(
    () => selectedPaths.filter((path) => {
      const normalized = normalizeDirectoryPath(path);
      return Boolean(normalized && !addedProjectPaths.has(normalized));
    }),
    [addedProjectPaths, selectedPaths]
  );
  const togglePathSelection = React.useCallback((path: string) => {
    setSelectedPaths((prev) => (
      prev.includes(path) ? prev.filter((entry) => entry !== path) : [...prev, path]
    ));
  }, []);

  const exactEntry = React.useMemo(() => {
    if (!browseFilterQuery) return null;
    return filteredEntries.find((entry) => entry.name === browseFilterQuery) ?? null;
  }, [browseFilterQuery, filteredEntries]);
  const cloneDestination = React.useMemo(() => {
    if (!isCloneMode || !targetPath || isLoading) return '';
    const pointsAtExistingFolder = hasTrailingPathSeparator(query)
      ? !isBrowseDirectoryMissing && browseErrorReason === null
      : exactEntry !== null;
    if (!pointsAtExistingFolder) return targetPath;
    const name = cloneDirectoryName(cloneRemoteUrl);
    if (!name) return '';
<<<<<<< HEAD
    return isRootPath(targetPath) ? `/${name}` : `${targetPath}/${name}`;
  }, [browseErrorReason, cloneRemoteUrl, exactEntry, isBrowseDirectoryMissing, isCloneMode, isLoading, query, targetPath]);
||||||| bc50ba56aa
    return isRootPath(targetPath) ? `/${name}` : `${targetPath}/${name}`;
  }, [browseErrorReason, cloneRemoteUrl, exactEntry, isBrowseDirectoryMissing, isCloneMode, isLoading, resolvedQuery, targetPath]);
=======
    return joinBrowsePath(targetPath, name);
  }, [browseErrorReason, cloneRemoteUrl, exactEntry, isBrowseDirectoryMissing, isCloneMode, isLoading, resolvedQuery, targetPath]);
>>>>>>> upstream/main
  const submitTarget = isCloneMode ? cloneDestination : targetPath;
  const normalizedTargetPath = normalizeDirectoryPath(submitTarget);
  const isAlreadyAdded = Boolean(normalizedTargetPath && addedProjectPaths.has(normalizedTargetPath));
  const shouldCreateTarget = Boolean(
    targetPath
    && !isAlreadyAdded
    && (browseErrorReason === null || browseErrorReason === 'not-found')
    && (
      (hasTrailingPathSeparator(query) && isBrowseDirectoryMissing)
      || (!hasTrailingPathSeparator(query) && browseFilterQuery.trim().length > 0 && exactEntry === null)
    )
  );
  const canAddProject = !isConfirming
    && !isOpeningFinder
<<<<<<< HEAD
    && browseErrorReason !== 'os-permission'
    && browseErrorReason !== 'invalid-response'
    && browseErrorReason !== 'unknown'
    && ((!isCloneMode && selectionPaths.length > 0) || (!isAlreadyAdded && Boolean(submitTarget)));
  // Adding a directory that is already a repository: read what its own .git
  // states so the association can be offered instead of asked for. Nothing is
  // written until the project is added with the proposal still selected. A
  // closed dialog adds nothing: its path is the home, which it would read on
  // every launch.
||||||| bc50ba56aa
    && (isOpenCodeView || (
      browseErrorReason !== 'os-permission'
      && browseErrorReason !== 'invalid-response'
      && browseErrorReason !== 'unknown'
    ))
    && (selectionPaths.length > 0 || (!isOpenCodeView && !isAlreadyAdded && Boolean(submitTarget)));
  // Adding a directory that is already a repository: read what its own .git
  // states so the association can be offered instead of asked for. Nothing is
  // written until the project is added with the proposal still selected. A
  // closed dialog adds nothing: its path is the home, which it would read on
  // every launch.
=======
    && (isOpenCodeView || (
      browseErrorReason !== 'os-permission'
      && browseErrorReason !== 'invalid-response'
      && browseErrorReason !== 'unknown'
    ))
    && (selectionPaths.length > 0 || (!isOpenCodeView && !isAlreadyAdded && Boolean(submitTarget)));
>>>>>>> upstream/main
  const existingRepository = useExistingRepositorySummary(targetPath, { sourceControl, git },
    open && !isCloneMode && !isAlreadyAdded && !shouldCreateTarget && selectionPaths.length === 0);
  React.useEffect(() => {
    if (existingRepository) void refreshAccounts(sourceControl);
  }, [existingRepository, refreshAccounts, runtimeKey, sourceControl]);

  const existingPrimaryRemote = existingRepository?.primaryRemote ?? null;
  const identityRemote = React.useMemo((): RemoteTraits | null => {
    if (isCloneMode) return cloneRemoteUrl.trim() ? remoteTraits(cloneRemoteUrl) : null;
    if (!existingPrimaryRemote) return null;
<<<<<<< HEAD
    return { host: existingPrimaryRemote.host, https: existingPrimaryRemote.https, ssh: existingPrimaryRemote.ssh };
||||||| bc50ba56aa
    // The summary decides which transports the remote allows, and it counts
    // one only while its fetch and push endpoints agree: an identity applied
    // here writes a grant for the remote as a whole, so a key or credential
    // that reaches just the fetch endpoint does not answer for it. The address
    // itself — its host and SSH port — is the fetch endpoint's own.
    const fetchTraits = remoteTraits(existingPrimaryRemote.fetch.displayUrl);
    return { ...fetchTraits, https: existingPrimaryRemote.https, ssh: existingPrimaryRemote.ssh };
=======
    const fetchTraits = remoteTraits(existingPrimaryRemote.fetch.displayUrl);
    return { ...fetchTraits, https: existingPrimaryRemote.https, ssh: existingPrimaryRemote.ssh };
>>>>>>> upstream/main
  }, [isCloneMode, cloneRemoteUrl, existingPrimaryRemote]);
  const identityHost = identityRemote?.host ?? null;
  const identityChoiceKey = `${isCloneMode ? 'clone' : 'add'}:${identityHost ?? ''}`;
  const identityApplicabilityOf = React.useCallback((identity: GitIdentityProfile): IdentityApplicability =>
    identityRemote ? identityApplicability(identity, identityRemote) : { applicable: true },
  [identityRemote]);
  const existingAuthor = existingRepository?.author ?? null;
  const proposedIdentity = React.useMemo(() => {
    const applicable = availableGitIdentities.filter((identity) => identityApplicabilityOf(identity).applicable);
    if (!isCloneMode) {
      return activeIdentityFor(applicable, globalGitIdentity, existingAuthor, (author) => ({
        id: 'local-config', name: author.userName, ...author, color: 'info', icon: 'user',
      }));
    }
    return proposeIdentityForHost(applicable, identityHost, defaultGitIdentityId);
  }, [availableGitIdentities, defaultGitIdentityId, existingAuthor, globalGitIdentity, identityApplicabilityOf, identityHost, isCloneMode]);
  const identityChosen = identityChoice?.key === identityChoiceKey;
  const selectedGitIdentity = React.useMemo(() => {
    const chosen = identityChosen
      ? availableGitIdentities.find((identity) => identity.id === identityChoice?.id)
      : null;
    return chosen ?? proposedIdentity;
  }, [availableGitIdentities, identityChoice, identityChosen, proposedIdentity]);
  const cloneSelection: Parameters<typeof runGitClone>[0]['selection'] | null = React.useMemo(() => {
    if (!selectedGitIdentity) return null;
    const https = cloneRemoteUrl.trim().startsWith('https://');
    const transport = identityTransport(selectedGitIdentity);
    if (transport === 'account' && selectedGitIdentity.account && https) {
      return { transportMode: 'managed', credentialAccount: selectedGitIdentity.account };
    }
    if (transport === 'ssh' && selectedGitIdentity.sshCredentialId && isSshRemoteUrl(cloneRemoteUrl)) {
      return { transportMode: 'managed', sshCredentialId: selectedGitIdentity.sshCredentialId };
    }
    if (transport === 'anonymous' && https) return { transportMode: 'anonymous' };
    if (transport === 'system') return { transportMode: 'system', unverifiedConfirmed: true };
    return null;
  }, [cloneRemoteUrl, selectedGitIdentity]);

  const canSubmitClone = canAddProject && !cloneRecovery.blocked && cloneRemoteUrl.trim().length > 0
    && Boolean(cloneSelection);
  const highlightedRow = rows[highlightedIndex] ?? null;
  const hasHighlightedBrowseItem = Boolean(
    highlightedRow && (highlightedRow.type === 'up' || highlightedRow.type === 'directory')
  );
  const submitModifierLabel = formatShortcutForDisplay('mod');
  const submitActionLabel = !isCloneMode && selectionPaths.length > 0
    ? t('directoryExplorerDialog.actions.addSelected')
    : isAlreadyAdded
    ? t('directoryExplorerDialog.actions.alreadyAdded')
    : isCloneMode
      ? isConfirming
        ? t('directoryExplorerDialog.actions.cloning')
        : t('directoryExplorerDialog.actions.cloneAndAdd')
    : isConfirming
      ? t('directoryExplorerDialog.actions.adding')
    : shouldCreateTarget
      ? t('directoryExplorerDialog.actions.createAndAdd')
      : t('directoryExplorerDialog.actions.addProject');

  React.useLayoutEffect(() => {
    const button = addButtonRef.current;
    if (!button) return;

    const updateWidth = () => setAddButtonWidth(Math.ceil(button.getBoundingClientRect().width));
    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(button);
    return () => observer.disconnect();
  }, [submitActionLabel]);

  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.scrollLeft = input.scrollWidth;
  }, [addButtonWidth, query]);

  React.useLayoutEffect(() => {
    if (!open) return;
    focusPathInput(inputRef.current);
  }, [open]);

  React.useLayoutEffect(() => {
    const row = rows[highlightedIndex];
    if (!row) return;
    rowRefs.current.get(row.value)?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, rows]);

  const handleClose = React.useCallback(() => {
    cloneController.current?.abort();
    onOpenChange(false);
  }, [onOpenChange]);

  const openProjectDraft = React.useCallback((projectId: string, projectPath: string) => {
    if (isMobile) setSessionSwitcherOpen(false);
    openNewSessionDraft({ selectedProjectId: projectId, directoryOverride: projectPath });
    handleClose();
  }, [handleClose, isMobile, openNewSessionDraft, setSessionSwitcherOpen]);

  const handleQuickAdd = React.useCallback(async (event: React.MouseEvent, path: string) => {
    event.stopPropagation();
    const normalized = normalizeDirectoryPath(path);
    if (normalized && addedProjectPaths.has(normalized)) return;
    const project = await addProject(path);
    if (!project) {
      toast.error(t('directoryExplorerDialog.toast.failedToAddProject'), {
        description: t('directoryExplorerDialog.toast.selectValidDirectoryPath'),
      });
      return;
    }
    openProjectDraft(project.id, project.path);
  }, [addProject, addedProjectPaths, openProjectDraft, t]);

  const finalizeSelection = React.useCallback(async (target: string) => {
    if (runtimeKey !== getRuntimeKey()) return;
    if (isConfirming) return;
    if (isCloneMode && (!canSubmitClone || cloneController.current)) return;
    const capturedRuntime = runtimeKey;
<<<<<<< HEAD
    const normalized = normalizeDirectoryPath(target);
    // Batch selections supersede the single-target flow. Only the single-target
    // flow is blocked by an already-added (or missing) directory.
||||||| bc50ba56aa
    // Batch selections supersede the single-target flow. Only the single-target
    // flow is blocked by an already-added (or missing) directory.
=======
>>>>>>> upstream/main
    const selectionToAdd = isCloneMode
      ? []
      : selectedPaths.filter((path) => {
        const selectionNormalized = normalizeDirectoryPath(path);
        return Boolean(selectionNormalized && !addedProjectPaths.has(selectionNormalized));
      });
    if (selectionToAdd.length === 0 && (!target || (normalized && addedProjectPaths.has(normalized)))) return;
    let selectedTarget = target;
    let setupRequired = false;

    setIsConfirming(true);
    try {
<<<<<<< HEAD
||||||| bc50ba56aa
      // A folder picked outside the list (the system picker) has not been
      // resolved yet; a link to an added project is that project.
      const normalized = normalizeDirectoryPath(target);
      if (selectionToAdd.length === 0 && !isCloneMode && normalized && !realPaths.has(normalized)) {
        const realPath = normalizeDirectoryPath((await opencodeClient.getDirectoryRealPaths([target])).get(target));
        if (realPath && addedProjectsByPath.has(realPath)) return;
      }
=======
      const normalized = normalizeDirectoryPath(target);
      if (selectionToAdd.length === 0 && !isCloneMode && normalized && !realPaths.has(normalized)) {
        const realPath = normalizeDirectoryPath((await opencodeClient.getDirectoryRealPaths([target])).get(target));
        if (realPath && addedProjectsByPath.has(realPath)) return;
      }
>>>>>>> upstream/main
      const shouldCreateSelection = !isCloneMode && shouldCreateTarget && normalizeDirectoryPath(target) === normalizeDirectoryPath(targetPath);
      if (isCloneMode) {
        const remoteUrl = cloneRemoteUrl.trim();
        if (!remoteUrl) {
          toast.error(t('directoryExplorerDialog.toast.cloneUrlRequired'));
          return;
        }
        const selection = cloneSelection;
        if (!selection) return;
        const recovery = cloneRecovery.start();
        if (!recovery) return;
        const controller = new AbortController();
        cloneController.current = controller;
        const result = await runGitClone({
          remoteUrl,
          destinationPath: target,
          gitIdentityId: selectedGitIdentity && selectedGitIdentity.id !== GLOBAL_IDENTITY_ID
            ? selectedGitIdentity.id : undefined,
          providerAccount: selectedGitIdentity?.account ?? undefined,
          git,
          selection,
          signal: controller.signal,
          onOperation: recovery.onOperation,
        }).finally(recovery.finish);
        if (result.status === 'cancelled') return;
        setupRequired = result.status === 'setup-required';
        selectedTarget = target;
      } else if (selectionToAdd.length > 0) {
        const added = await addProjects(selectionToAdd);
        if (added.length === 0) {
          toast.error(t('directoryExplorerDialog.toast.failedToAddProject'), {
            description: t('directoryExplorerDialog.toast.selectValidDirectoryPath'),
          });
          return;
        }
        toast.success(t('directoryExplorerDialog.toast.addedProjects', { count: added.length }));
        setSelectedPaths([]);
        handleClose();
        return;
      } else if (shouldCreateSelection) {
        await hostFilesystem.createDirectory(target, { asProject: true });
      }
      if (capturedRuntime !== getRuntimeKey()) return;
      const project = await addProject(selectedTarget);
      if (!project) {
        toast.error(t('directoryExplorerDialog.toast.failedToAddProject'), {
          description: t('directoryExplorerDialog.toast.selectValidDirectoryPath'),
        });
        return;
      }
      if (!isCloneMode && identityChosen && selectedGitIdentity && existingRepository
        && existingRepository.directory === selectedTarget) {
        const outcome = await applyIdentityToRepository({
          directory: project.path,
          remoteName: existingRepository.primaryRemote?.name ?? null,
          identity: selectedGitIdentity,
        }, { git, sourceControl });
        if (outcome.status === 'failed' && outcome.reason !== 'runtime') toast.warning(t('directoryExplorerDialog.existing.bindFailed'));
      }
      openProjectDraft(project.id, project.path);
      if (setupRequired) {
        if (mobileActions) mobileActions.openChanges();
        else openContextSurface(project.path, 'git');
        toast.warning(t('directoryExplorerDialog.clone.setupRequired'));
      }
    } catch (error) {
      if (capturedRuntime !== getRuntimeKey()) return;
      if (error instanceof GitOperationResultError || error instanceof PendingGitOperationError) return;
      toast.error(t('directoryExplorerDialog.toast.failedToSelectDirectory'), {
        description: error instanceof Error ? error.message : t('directoryExplorerDialog.toast.unknownError'),
      });
    } finally {
      cloneController.current = null;
      setIsConfirming(false);
    }
  }, [addProject, addProjects, addedProjectPaths, canSubmitClone, cloneRecovery, cloneSelection, identityChosen, cloneRemoteUrl, existingRepository, git, handleClose, isCloneMode, isConfirming, mobileActions, openContextSurface, openProjectDraft, runtimeKey, selectedGitIdentity, selectedPaths, shouldCreateTarget, sourceControl, targetPath, t]);

  const browseToDisplayPath = React.useCallback((displayPath: string) => {
    setQuery(ensureBrowseDirectoryPath(displayPath));
  }, []);

  const browseToEntry = React.useCallback((entry: BrowseEntry) => {
    setQuery(appendBrowsePathSegment(query, entry.name));
  }, [query]);

<<<<<<< HEAD
  const executeRow = React.useCallback((row: BrowseRow | null) => {
    if (!row) return;
    if (row.type === 'up') {
      if (row.path) browseToDisplayPath(row.path);
      return;
    }
    browseToEntry(row);
  }, [browseToDisplayPath, browseToEntry]);
||||||| bc50ba56aa
  const parentDisplayPath = getBrowseParentPath(browseDirectoryDisplayPath);
  const browseUp = React.useCallback(() => {
    if (parentDisplayPath) browseToDisplayPath(parentDisplayPath);
  }, [browseToDisplayPath, parentDisplayPath]);

  const selectView = React.useCallback((next: ExplorerView, displayPath?: string) => {
    setRequestedView(next);
    // A selection survives moving between folders, so one batch can gather
    // projects from anywhere. A clone adds one repository, so it has no batch.
    if (next === 'clone') setSelectedPaths([]);
    setHighlightedIndex(0);
    if (displayPath) browseToDisplayPath(displayPath);
    if (next !== 'opencode' && !isMobile) requestAnimationFrame(() => focusPathInput(inputRef.current));
  }, [browseToDisplayPath, isMobile]);
=======
  const parentDisplayPath = getBrowseParentPath(browseDirectoryDisplayPath);
  const browseUp = React.useCallback(() => {
    if (parentDisplayPath) browseToDisplayPath(parentDisplayPath);
  }, [browseToDisplayPath, parentDisplayPath]);

  const selectView = React.useCallback((next: ExplorerView, displayPath?: string) => {
    setRequestedView(next);
    if (next === 'clone') setSelectedPaths([]);
    setHighlightedIndex(0);
    if (displayPath) browseToDisplayPath(displayPath);
    if (next !== 'opencode' && !isMobile) requestAnimationFrame(() => focusPathInput(inputRef.current));
  }, [browseToDisplayPath, isMobile]);
>>>>>>> upstream/main

  const handleOpenInFinder = React.useCallback(async () => {
    if (!canRequestAccess || isOpeningFinder) return;
    setIsOpeningFinder(true);
    try {
      const result = await requestAccess(targetPath);
      if (!result.success || !result.path) {
        if (result.error && result.error !== 'Directory selection cancelled') {
          toast.error(t('directoryExplorerDialog.toast.failedToSelectDirectory'), {
            description: result.error,
          });
        }
        return;
      }

      const accessResult = await startAccessing(result.path);
      if (!accessResult.success) {
        toast.error(t('directoryExplorerDialog.toast.failedToOpenDirectory'), {
          description: accessResult.error || t('directoryExplorerDialog.toast.desktopCouldNotGrantAccess'),
        });
        return;
      }

      await finalizeSelection(result.path);
    } catch (error) {
      toast.error(t('directoryExplorerDialog.toast.failedToSelectDirectory'), {
        description: error instanceof Error ? error.message : t('directoryExplorerDialog.toast.unknownError'),
      });
    } finally {
      setIsOpeningFinder(false);
    }
  }, [canRequestAccess, finalizeSelection, isOpeningFinder, requestAccess, startAccessing, t, targetPath]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(rows.length - 1, index + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === ' ') {
<<<<<<< HEAD
      // Only treat Space as a selection toggle when the user is actively
      // browsing a directory (trailing slash or no filter typing). When
      // the input is in path-entry mode, Space is a literal character
      // and must reach the input value.
      if (hasTrailingPathSeparator(query) && !isCloneMode) {
||||||| bc50ba56aa
      // Only treat Space as a selection toggle when the user is actively
      // browsing a directory (trailing slash or no filter typing). When
      // the input is in path-entry mode, Space is a literal character
      // and must reach the input value.
      if (hasTrailingPathSeparator(resolvedQuery) && !isCloneMode) {
=======
      if (hasTrailingPathSeparator(resolvedQuery) && !isCloneMode) {
>>>>>>> upstream/main
        event.preventDefault();
        if (highlightedRow && highlightedRow.type === 'directory' && !highlightedRow.added) {
          togglePathSelection(highlightedRow.path);
        }
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (isPrimaryModifierPressed(event)) {
        void finalizeSelection(submitTarget);
        return;
      }
      if (hasHighlightedBrowseItem) {
        executeRow(highlightedRow);
      }
      return;
    }
    if (event.key === 'Backspace' && query === '') {
      event.preventDefault();
      handleClose();
    }
  }, [executeRow, finalizeSelection, handleClose, hasHighlightedBrowseItem, highlightedRow, isCloneMode, query, rows.length, submitTarget, togglePathSelection]);

  const showHiddenToggle = (
    <button
      type="button"
      onClick={() => setShowHidden((value) => !value)}
      className="flex flex-shrink-0 items-center gap-2 rounded-lg px-2 py-1 typography-meta text-muted-foreground transition-colors hover:bg-interactive-hover/40"
    >
      {showHidden ? <Icon name="checkbox" className="h-4 w-4 text-primary" /> : <Icon name="checkbox-blank" className="h-4 w-4" />}
      {t('directoryExplorerDialog.toggle.showHidden')}
    </button>
  );

<<<<<<< HEAD
  /**
   * One control for the three answers a repository needs.
   *
   * The identity says whose account it is, how transfers authenticate and who
   * commits, so the screen names the configuration rather than asking for its
   * parts.
   */
  const identityPicker = availableGitIdentities.length ? (
    <>
      <IdentityDropdown
        activeProfile={selectedGitIdentity ?? null}
        identities={availableGitIdentities}
        onSelect={(identity) => setIdentityChoice({ key: identityChoiceKey, id: identity.id })}
        isApplying={isConfirming}
        applicability={identityApplicabilityOf}
        triggerClassName="w-full max-w-none border border-border"
        menuAlign="start"
      />
      {isCloneMode && cloneRemoteUrl.trim() && selectedGitIdentity && !cloneSelection ? (
        <p className="typography-micro text-muted-foreground">{t('directoryExplorerDialog.clone.identityMismatch')}</p>
      ) : null}
    </>
  ) : gitIdentityPhase === 'ready' ? null : (
    <p className="typography-micro text-muted-foreground">{t('gitIdentities.state.unknown')}</p>
  );
||||||| bc50ba56aa
  /**
   * One control for the three answers a repository needs.
   *
   * The identity says whose account it is, how transfers authenticate and who
   * commits, so the screen names the configuration rather than asking for its
   * parts.
   */
  const renderIdentityPicker = (triggerClassName: string, iconOnly = false) => availableGitIdentities.length ? (
    <IdentityDropdown
      activeProfile={selectedGitIdentity ?? null}
      identities={availableGitIdentities}
      onSelect={(identity) => setIdentityChoice({ key: identityChoiceKey, id: identity.id })}
      isApplying={isConfirming}
      applicability={identityApplicabilityOf}
      triggerClassName={triggerClassName}
      iconOnly={iconOnly}
      menuAlign={iconOnly ? 'end' : 'start'}
    />
  ) : null;
=======
  const renderIdentityPicker = (triggerClassName: string, iconOnly = false) => availableGitIdentities.length ? (
    <IdentityDropdown
      activeProfile={selectedGitIdentity ?? null}
      identities={availableGitIdentities}
      onSelect={(identity) => setIdentityChoice({ key: identityChoiceKey, id: identity.id })}
      isApplying={isConfirming}
      applicability={identityApplicabilityOf}
      triggerClassName={triggerClassName}
      iconOnly={iconOnly}
      menuAlign={iconOnly ? 'end' : 'start'}
    />
  ) : null;
>>>>>>> upstream/main

<<<<<<< HEAD
  const inputSection = (
    <div className="px-2.5 py-1.5">
      {!isCloneMode && existingRepository ? (
        <div className="mb-1.5 space-y-1.5">
          {identityPicker}
        </div>
      ) : null}
||||||| bc50ba56aa
  // In the footer, where it takes the hints' place: a repository found while
  // browsing must not move the list under the pointer.
  const existingRepositoryIdentity = view === 'folder' && existingRepository ? renderIdentityPicker('max-w-48') : null;

  // Both fields hold their own controls, so a control never needs a row of its own.
  const fieldClassName = 'oc-raised oc-field flex h-8 items-center gap-0.5 rounded-md bg-[var(--surface-elevated)] px-0.5';
  const fieldInputClassName = 'min-w-0 flex-1 bg-transparent font-mono typography-ui-label shadow-none hover:[&:not(:focus)]:[background-image:none] dark:bg-transparent';

  const fieldsSection = isOpenCodeView ? null : (
    // The window's close button sits at the end of this row.
    <div className={cn('flex flex-col gap-1.5 pb-2', isMobile ? 'pt-0' : 'ps-3 pe-11 pt-2')}>
=======
  const existingRepositoryIdentity = view === 'folder' && existingRepository ? renderIdentityPicker('max-w-48') : null;

  const fieldClassName = 'oc-raised oc-field flex h-8 items-center gap-0.5 rounded-md bg-[var(--surface-elevated)] px-0.5';
  const fieldInputClassName = 'min-w-0 flex-1 bg-transparent font-mono typography-ui-label shadow-none hover:[&:not(:focus)]:[background-image:none] dark:bg-transparent';

  const fieldsSection = isOpenCodeView ? null : (
    <div className={cn('flex flex-col gap-1.5 pb-2', isMobile ? 'pt-0' : 'ps-3 pe-11 pt-2')}>
>>>>>>> upstream/main
      {isCloneMode ? (
        <div className="mb-1.5 space-y-1.5">
          <GitOperationStatus entry={cloneRecovery.entry} onRefresh={() => void cloneRecovery.refresh()} onCancel={() => void cloneRecovery.cancel()} />
<<<<<<< HEAD
          <div className="flex items-center gap-1.5">
||||||| bc50ba56aa
          {/* The identity answers how this address is reached. A phone has no
              tooltip to name it, so there it keeps its own line. */}
          <div dir="ltr" className={fieldClassName}>
=======
          <div dir="ltr" className={fieldClassName}>
>>>>>>> upstream/main
            <Input
              value={cloneRemoteUrl}
              disabled={isConfirming}
              onChange={(event) => setCloneRemoteUrl(event.target.value)}
              placeholder={t('directoryExplorerDialog.clone.remoteUrlPlaceholder')}
              aria-label={t('directoryExplorerDialog.clone.remoteUrlPlaceholder')}
              className="min-w-0 flex-1 border-border/60 bg-[var(--surface-elevated)] font-mono typography-ui-label shadow-none"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
          {identityPicker}
        </div>
      ) : null}
<<<<<<< HEAD
      <div className="relative">
        <Icon name="folder-add" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
||||||| bc50ba56aa
      {/* A path field reads left to right in every language, like code. */}
      <div dir="ltr" className={fieldClassName}>
        <Button
          variant="ghost"
          size="sm"
          disabled={!parentDisplayPath || isConfirming}
          onMouseDown={(event) => event.preventDefault()}
          onClick={browseUp}
          aria-label={t('directoryExplorerDialog.browse.parentDirectory')}
          title={t('directoryExplorerDialog.browse.parentDirectory')}
          className="size-7 shrink-0 text-muted-foreground has-[>svg]:px-0"
        >
          <Icon name="arrow-up" className="size-4" />
        </Button>
=======
      <div dir="ltr" className={fieldClassName}>
        <Button
          variant="ghost"
          size="sm"
          disabled={!parentDisplayPath || isConfirming}
          onMouseDown={(event) => event.preventDefault()}
          onClick={browseUp}
          aria-label={t('directoryExplorerDialog.browse.parentDirectory')}
          title={t('directoryExplorerDialog.browse.parentDirectory')}
          className="size-7 shrink-0 text-muted-foreground has-[>svg]:px-0"
        >
          <Icon name="arrow-up" className="size-4" />
        </Button>
>>>>>>> upstream/main
        <Input
          ref={inputRef}
          value={query}
          disabled={isConfirming}
<<<<<<< HEAD
          onChange={(event) => setQuery(normalizeSeparators(event.target.value))}
||||||| bc50ba56aa
          onChange={(event) => {
            const value = normalizeSeparators(event.target.value);
            // Entering a folder by name moves the browsed folder, so the field
            // takes the full path rather than resolving against itself.
            setQuery(value.includes('/') ? resolveBrowseQuery(value, browsedFolder) : value);
          }}
=======
          onChange={(event) => {
            const value = normalizeSeparators(event.target.value);
            setQuery(value.includes('/') ? resolveBrowseQuery(value, browsedFolder) : value);
          }}
>>>>>>> upstream/main
          onKeyDown={handleKeyDown}
          placeholder={t('directoryExplorerDialog.pathInput.placeholder')}
          className="border-transparent bg-transparent pl-9 font-mono typography-ui-label shadow-none focus-visible:ring-0"
          style={!isMobile && addButtonWidth > 0 ? { paddingRight: `${addButtonWidth + 24}px` } : undefined}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
<<<<<<< HEAD
        {!isMobile ? (
          <Button
            ref={addButtonRef}
            variant="outline"
            size="xs"
            tabIndex={-1}
            className="absolute right-1.5 top-1/2 h-7 -translate-y-1/2 gap-1 px-2 typography-meta"
            disabled={isCloneMode ? !canSubmitClone : !canAddProject}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void finalizeSelection(submitTarget)}
            title={submitActionLabel}
          >
            {submitActionLabel}
||||||| bc50ba56aa
        {showHiddenToggle}
      </div>
    </div>
  );

  const renderSelectionBox = (path: string) => {
    const selected = selectedPaths.includes(path);
    return (
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); togglePathSelection(path); }}
        title={t('directoryExplorerDialog.browse.selectForAdd')}
        aria-label={t('directoryExplorerDialog.browse.selectForAdd')}
        aria-pressed={selected}
        className={cn('flex flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground', isMobile && '-my-3 -ms-2.5 px-2.5 py-3')}
      >
        <Icon name={selected ? 'checkbox' : 'checkbox-blank'} className={cn('size-4', selected && 'text-primary')} />
      </button>
    );
  };

  const renderRow = (row: {
    key: string;
    path: string;
    index: number;
    selectable: boolean;
    onActivate: () => void;
    rowRef?: (node: HTMLDivElement | null) => void;
    children: React.ReactNode;
  }) => {
    const isActive = row.index === highlightedIndex;
    return (
      // A div, not a button: a row holds its own select and add buttons, and a
      // button cannot contain buttons.
      <div
        key={row.key}
        ref={row.rowRef}
        role="button"
        tabIndex={0}
        onMouseEnter={() => setHighlightedIndex(row.index)}
        onFocus={() => setHighlightedIndex(row.index)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={row.onActivate}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            row.onActivate();
          }
        }}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-start transition-colors focus-visible:outline-none',
          isMobile ? 'min-h-11' : 'h-7.5',
          isActive && !isMobile && 'bg-interactive-selection text-interactive-selection-foreground',
        )}
      >
        {row.selectable && (isActive || isMobile || selectionPaths.length > 0)
          ? renderSelectionBox(row.path)
          : <Icon name="folder-6" className="size-4 flex-shrink-0 text-muted-foreground" />}
        {row.children}
      </div>
    );
  };

  const folderRows = (
    <div className="space-y-0.5">
      {rows.map((row, index) => renderRow({
        key: row.value,
        path: row.path,
        index,
        selectable: canSelect && !row.added,
        // These can be the previous folder's rows for a moment.
        onActivate: () => { if (!isLoading) browseToEntry(row); },
        rowRef: (node) => {
          if (node) rowRefs.current.set(row.value, node);
          else rowRefs.current.delete(row.value);
        },
        children: (
          <>
            <span dir="auto" className="oc-ui-start-align min-w-0 flex-1 truncate typography-ui-label text-foreground">{row.name}</span>
            {row.linkTarget ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex min-w-0 max-w-[40%] shrink items-center gap-1 typography-meta text-muted-foreground">
                    <Icon name="arrow-right" className="size-3.5 flex-shrink-0" />
                    <span dir="auto" className="truncate">{row.linkTarget.label}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t('directoryExplorerDialog.browse.linkTarget', { path: formatPathForDisplay(row.linkTarget.path, explorerRootDirectory) })}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {row.added ? (
              <span className="typography-meta text-muted-foreground">{t('directoryExplorerDialog.browse.addedBadge')}</span>
            ) : view === 'folder' && (!isMobile || onProjectAdded) ? (
              <Button
                variant="ghost"
                size="xs"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => handleQuickAdd(event, row.path)}
                disabled={isConfirming}
                className={cn('text-muted-foreground hover:text-foreground', index !== highlightedIndex && !isMobile && 'opacity-0 focus-visible:opacity-100')}
              >
                {t('directoryExplorerDialog.browse.quickAdd')}
              </Button>
            ) : null}
            <Icon name="arrow-right-s" className="size-3.5 flex-shrink-0 text-muted-foreground" />
          </>
        ),
      }))}
    </div>
  );

  const openCodeRows = (
    <div className="space-y-0.5">
      {openCodeProjects.map((project, index) => renderRow({
        key: project.path,
        path: project.path,
        index,
        selectable: true,
        onActivate: () => togglePathSelection(project.path),
        children: (
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span dir="auto" className="min-w-0 truncate typography-ui-label text-foreground">{project.name}</span>
            <span dir="ltr" title={project.path} className="min-w-0 truncate typography-meta text-muted-foreground">
              {formatPathForDisplay(project.parent, explorerRootDirectory)}
            </span>
          </span>
        ),
      }))}
    </div>
  );

  const emptyMessage = (text: string) => (
    <div className="px-4 py-10 text-center typography-ui-label text-muted-foreground">{text}</div>
  );

  const browseBody = isLoadingSlowly ? emptyMessage(t('directoryExplorerDialog.browse.loading'))
    : browseErrorReason && browseErrorReason !== 'not-found' ? (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <div className="typography-ui-label text-status-error">
          {browseErrorReason === 'os-permission'
            ? t('directoryExplorerDialog.browse.permissionDenied')
            : t('directoryExplorerDialog.browse.loadFailed')}
        </div>
        <div className="flex items-center gap-2">
          {browseErrorReason === 'os-permission' && canRequestAccess ? (
            <Button size="xs" onClick={() => void handleOpenInFinder()} disabled={isOpeningFinder}>
              {t('directoryExplorerDialog.browse.grantAccess')}
            </Button>
          ) : null}
          <Button variant="outline" size="xs" onClick={() => setBrowseReloadKey((key) => key + 1)}>
            {t('directoryExplorerDialog.browse.retry')}
=======
        {showHiddenToggle}
      </div>
    </div>
  );

  const renderSelectionBox = (path: string) => {
    const selected = selectedPaths.includes(path);
    return (
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); togglePathSelection(path); }}
        title={t('directoryExplorerDialog.browse.selectForAdd')}
        aria-label={t('directoryExplorerDialog.browse.selectForAdd')}
        aria-pressed={selected}
        className={cn('flex flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground', isMobile && '-my-3 -ms-2.5 px-2.5 py-3')}
      >
        <Icon name={selected ? 'checkbox' : 'checkbox-blank'} className={cn('size-4', selected && 'text-primary')} />
      </button>
    );
  };

  const renderRow = (row: {
    key: string;
    path: string;
    index: number;
    selectable: boolean;
    onActivate: () => void;
    rowRef?: (node: HTMLDivElement | null) => void;
    children: React.ReactNode;
  }) => {
    const isActive = row.index === highlightedIndex;
    return (
      // external: https://html.spec.whatwg.org/multipage/form-elements.html#the-button-element Rows contain their own buttons, so the outer row uses a div.
      <div
        key={row.key}
        ref={row.rowRef}
        role="button"
        tabIndex={0}
        onMouseEnter={() => setHighlightedIndex(row.index)}
        onFocus={() => setHighlightedIndex(row.index)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={row.onActivate}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            row.onActivate();
          }
        }}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-start transition-colors focus-visible:outline-none',
          isMobile ? 'min-h-11' : 'h-7.5',
          isActive && !isMobile && 'bg-interactive-selection text-interactive-selection-foreground',
        )}
      >
        {row.selectable && (isActive || isMobile || selectionPaths.length > 0)
          ? renderSelectionBox(row.path)
          : <Icon name="folder-6" className="size-4 flex-shrink-0 text-muted-foreground" />}
        {row.children}
      </div>
    );
  };

  const folderRows = (
    <div className="space-y-0.5">
      {rows.map((row, index) => renderRow({
        key: row.value,
        path: row.path,
        index,
        selectable: canSelect && !row.added,
        onActivate: () => { if (!isLoading) browseToEntry(row); },
        rowRef: (node) => {
          if (node) rowRefs.current.set(row.value, node);
          else rowRefs.current.delete(row.value);
        },
        children: (
          <>
            <span dir="auto" className="oc-ui-start-align min-w-0 flex-1 truncate typography-ui-label text-foreground">{row.name}</span>
            {row.linkTarget ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex min-w-0 max-w-[40%] shrink items-center gap-1 typography-meta text-muted-foreground">
                    <Icon name="arrow-right" className="size-3.5 flex-shrink-0" />
                    <span dir="auto" className="truncate">{row.linkTarget.label}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t('directoryExplorerDialog.browse.linkTarget', { path: formatPathForDisplay(row.linkTarget.path, explorerRootDirectory) })}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {row.added ? (
              <span className="typography-meta text-muted-foreground">{t('directoryExplorerDialog.browse.addedBadge')}</span>
            ) : view === 'folder' && (!isMobile || onProjectAdded) ? (
              <Button
                variant="ghost"
                size="xs"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => handleQuickAdd(event, row.path)}
                disabled={isConfirming}
                className={cn('text-muted-foreground hover:text-foreground', index !== highlightedIndex && !isMobile && 'opacity-0 focus-visible:opacity-100')}
              >
                {t('directoryExplorerDialog.browse.quickAdd')}
              </Button>
            ) : null}
            <Icon name="arrow-right-s" className="size-3.5 flex-shrink-0 text-muted-foreground" />
          </>
        ),
      }))}
    </div>
  );

  const openCodeRows = (
    <div className="space-y-0.5">
      {openCodeProjects.map((project, index) => renderRow({
        key: project.path,
        path: project.path,
        index,
        selectable: true,
        onActivate: () => togglePathSelection(project.path),
        children: (
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span dir="auto" className="min-w-0 truncate typography-ui-label text-foreground">{project.name}</span>
            <span dir="ltr" title={project.path} className="min-w-0 truncate typography-meta text-muted-foreground">
              {formatPathForDisplay(project.parent, explorerRootDirectory)}
            </span>
          </span>
        ),
      }))}
    </div>
  );

  const emptyMessage = (text: string) => (
    <div className="px-4 py-10 text-center typography-ui-label text-muted-foreground">{text}</div>
  );

  const browseBody = isLoadingSlowly ? emptyMessage(t('directoryExplorerDialog.browse.loading'))
    : browseErrorReason && browseErrorReason !== 'not-found' ? (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <div className="typography-ui-label text-status-error">
          {browseErrorReason === 'os-permission'
            ? t('directoryExplorerDialog.browse.permissionDenied')
            : t('directoryExplorerDialog.browse.loadFailed')}
        </div>
        <div className="flex items-center gap-2">
          {browseErrorReason === 'os-permission' && canRequestAccess ? (
            <Button size="xs" onClick={() => void handleOpenInFinder()} disabled={isOpeningFinder}>
              {t('directoryExplorerDialog.browse.grantAccess')}
            </Button>
          ) : null}
          <Button variant="outline" size="xs" onClick={() => setBrowseReloadKey((key) => key + 1)}>
            {t('directoryExplorerDialog.browse.retry')}
>>>>>>> upstream/main
          </Button>
        ) : null}
      </div>
    </div>
  );

  const resultsSection = (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-[var(--surface-elevated)] shadow-sm">
      <ScrollableOverlay outerClassName="max-h-[min(28rem,58vh)]" className="p-2">
        <div className="px-2 pb-1 pt-0.5 typography-meta font-medium uppercase tracking-wide text-muted-foreground/80">
          {t('directoryExplorerDialog.browse.directories')}
        </div>
        {isLoading ? (
          <div className="py-10 text-center typography-ui-label text-muted-foreground">
            {t('directoryExplorerDialog.browse.loading')}
          </div>
        ) : browseErrorReason && browseErrorReason !== 'not-found' ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <div className="typography-ui-label text-status-error">
              {browseErrorReason === 'os-permission'
                ? t('directoryExplorerDialog.browse.permissionDenied')
                : t('directoryExplorerDialog.browse.loadFailed')}
            </div>
            <div className="flex items-center gap-2">
              {browseErrorReason === 'os-permission' && canRequestAccess ? (
                <Button size="xs" onClick={() => void handleOpenInFinder()} disabled={isOpeningFinder}>
                  {t('directoryExplorerDialog.browse.grantAccess')}
                </Button>
              ) : null}
              <Button variant="outline" size="xs" onClick={() => setBrowseReloadKey((key) => key + 1)}>
                {t('directoryExplorerDialog.browse.retry')}
              </Button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center typography-ui-label text-muted-foreground">
            {t('directoryExplorerDialog.browse.empty')}
          </div>
        ) : (
          <div className="space-y-0.5">
            {rows.map((row, index) => {
              const isActive = index === highlightedIndex;
              return (
                <div
                  key={row.value}
                  ref={(node) => {
                    if (node) {
                      rowRefs.current.set(row.value, node);
                    } else {
                      rowRefs.current.delete(row.value);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => executeRow(row)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    executeRow(row);
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive && 'bg-interactive-selection text-interactive-selection-foreground',
                    !isActive && 'hover:bg-interactive-hover/50'
                  )}
                >
                  {row.type === 'up' ? (
                    <Icon name="arrow-left-s" className="h-4 w-4 flex-shrink-0 text-muted-foreground/80" />
                  ) : (
                    <Icon name="folder-6" className="h-4 w-4 flex-shrink-0 text-muted-foreground/80" />
                  )}
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate typography-ui-label text-foreground">{row.name}</span>
                  </span>
                  {row.type === 'directory' && row.added ? (
                    <span className="rounded-full border border-border/60 px-2 py-0.5 typography-meta text-muted-foreground">
                      {t('directoryExplorerDialog.browse.addedBadge')}
                    </span>
                  ) : row.type === 'directory' && !isCloneMode ? (
                    <>
                      <button
                        type="button"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); togglePathSelection(row.path); }}
                        title={t('directoryExplorerDialog.browse.selectForAdd')}
                        aria-label={t('directoryExplorerDialog.browse.selectForAdd')}
                        aria-pressed={selectedPaths.includes(row.path)}
                        className="flex-shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-interactive-hover/60 hover:text-foreground"
                      >
                        <Icon name={selectedPaths.includes(row.path) ? 'checkbox' : 'checkbox-blank'} className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => handleQuickAdd(event, row.path)}
                        className="flex-shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-interactive-hover/60 hover:text-foreground"
                        title={t('directoryExplorerDialog.browse.quickAdd')}
                      >
                        <Icon name="add" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </ScrollableOverlay>
    </div>
  );

  const content = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {inputSection}
      {resultsSection}
    </div>
  );

  const footerHints = (
<<<<<<< HEAD
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 typography-micro text-muted-foreground">
||||||| bc50ba56aa
    // One line tall: a hint a long button leaves no room for wraps out of sight whole.
    <div className="flex h-5 min-w-0 flex-wrap items-center gap-x-3 overflow-hidden whitespace-nowrap typography-micro text-muted-foreground">
=======
    <div className="flex h-5 min-w-0 flex-wrap items-center gap-x-3 overflow-hidden whitespace-nowrap typography-micro text-muted-foreground">
>>>>>>> upstream/main
      <span className="inline-flex items-center gap-1">
        <Icon name="arrow-up-s" className="h-3.5 w-3.5" />
        <Icon name="arrow-down-s" className="-ml-1 h-3.5 w-3.5" />
        {t('directoryExplorerDialog.footer.navigate')}
      </span>
      <span className="inline-flex items-center gap-1">
        <Icon name="corner-down-left" className="h-3.5 w-3.5" />
        {t('directoryExplorerDialog.footer.select')}
      </span>
      <span className="inline-flex items-center gap-1">
        <span>{submitModifierLabel}</span>
        <Icon name="corner-down-left" className="h-3.5 w-3.5" />
        {t('directoryExplorerDialog.footer.add')}
      </span>
    </div>
  );

<<<<<<< HEAD
  const renderFooter = () => (
    <>
      {!isMobile ? footerHints : null}
      <div className={cn('flex w-full flex-row justify-end gap-2 sm:w-auto', isMobile && 'justify-stretch')}>
        {canRequestAccess ? (
          <Button variant="ghost" size="xs" onClick={handleOpenInFinder} disabled={isConfirming || isOpeningFinder || isCloneMode}>
            {isOpeningFinder ? t('directoryExplorerDialog.actions.openingFinder') : t(getDirectoryPickerLabelKey())}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => { setIsCloneMode((value) => !value); setSelectedPaths([]); }}
          disabled={isConfirming || isOpeningFinder}
          className={cn(isMobile && 'flex-1')}
        >
          {isCloneMode ? t('directoryExplorerDialog.actions.addLocalProject') : t('directoryExplorerDialog.actions.cloneRepository')}
        </Button>
        {isMobile ? (
          <Button size="xs" onClick={() => void finalizeSelection(submitTarget)} disabled={isCloneMode ? !canSubmitClone : !canAddProject} className="flex-1">
            {submitActionLabel}
          </Button>
        ) : null}
      </div>
    </>
||||||| bc50ba56aa
  const submitButton = (
    <Button
      size="sm"
      disabled={isCloneMode ? !canSubmitClone : !canAddProject}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void finalizeSelection(submitTarget)}
      // The batch can hold folders that are not on screen.
      title={selectionPaths.length > 0
        ? selectionPaths.map((path) => formatPathForDisplay(path, explorerRootDirectory)).join('\n')
        : submitActionLabel}
      className={isMobile ? 'min-w-0 flex-1' : 'min-w-0 max-w-72'}
    >
      <span className="truncate">{submitActionLabel}</span>
    </Button>
=======
  const submitButton = (
    <Button
      size="sm"
      disabled={isCloneMode ? !canSubmitClone : !canAddProject}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void finalizeSelection(submitTarget)}
      title={selectionPaths.length > 0
        ? selectionPaths.map((path) => formatPathForDisplay(path, explorerRootDirectory)).join('\n')
        : submitActionLabel}
      className={isMobile ? 'min-w-0 flex-1' : 'min-w-0 max-w-72'}
    >
      <span className="truncate">{submitActionLabel}</span>
    </Button>
>>>>>>> upstream/main
  );

<<<<<<< HEAD
||||||| bc50ba56aa
  const finderButton = canRequestAccess && view === 'folder' ? (
    <Button variant="ghost" size="sm" onClick={handleOpenInFinder} disabled={isConfirming || isOpeningFinder} className="shrink-0">
      {isOpeningFinder ? t('directoryExplorerDialog.actions.openingFinder') : t(getDirectoryPickerLabelKey())}
    </Button>
  ) : null;

  const places: Array<{ key: string; label: string; icon: IconName; pressed: boolean; onSelect: () => void; startsGroup?: boolean }> = [
    ...['~/', ...projectBrowsePlaces(projects, explorerRootDirectory)].map((place) => ({
      key: place,
      label: place === '~/' ? t('directoryExplorerDialog.browse.home') : lastPathSegment(place),
      icon: place === '~/' ? 'home' as const : 'folder-6' as const,
      pressed: view === 'folder' && trimTrailingSeparators(browseDirectoryAbsolutePath) === trimTrailingSeparators(displayPathToAbsolutePath(place, explorerRootDirectory)),
      onSelect: () => selectView('folder', place),
    })),
  ];
  // VS Code clones nothing, and its projects are the workspace folders. Clone
  // comes before the OpenCode entry, which arrives late: it moves nothing.
  if (!runtime.isVSCode) {
    places.push({ key: 'clone', label: t('directoryExplorerDialog.actions.cloneRepository'), icon: 'git-branch', pressed: isCloneMode, onSelect: () => selectView('clone'), startsGroup: true });
  }
  if (openCodeProjects.length > 0) {
    places.push({ key: 'opencode', label: t('directoryExplorerDialog.opencode.title'), icon: 'history', pressed: isOpenCodeView, onSelect: () => selectView('opencode') });
  }

=======
  const finderButton = canRequestAccess && view === 'folder' ? (
    <Button variant="ghost" size="sm" onClick={handleOpenInFinder} disabled={isConfirming || isOpeningFinder} className="shrink-0">
      {isOpeningFinder ? t('directoryExplorerDialog.actions.openingFinder') : t(getDirectoryPickerLabelKey())}
    </Button>
  ) : null;

  const places: Array<{ key: string; label: string; icon: IconName; pressed: boolean; onSelect: () => void; startsGroup?: boolean }> = [
    ...['~/', ...projectBrowsePlaces(projects, explorerRootDirectory)].map((place) => ({
      key: place,
      label: place === '~/' ? t('directoryExplorerDialog.browse.home') : lastPathSegment(place),
      icon: place === '~/' ? 'home' as const : 'folder-6' as const,
      pressed: view === 'folder' && trimTrailingSeparators(browseDirectoryAbsolutePath) === trimTrailingSeparators(displayPathToAbsolutePath(place, explorerRootDirectory)),
      onSelect: () => selectView('folder', place),
    })),
  ];
  if (!runtime.isVSCode) {
    places.push({ key: 'clone', label: t('directoryExplorerDialog.actions.cloneRepository'), icon: 'git-branch', pressed: isCloneMode, onSelect: () => selectView('clone'), startsGroup: true });
  }
  if (openCodeProjects.length > 0) {
    places.push({ key: 'opencode', label: t('directoryExplorerDialog.opencode.title'), icon: 'history', pressed: isOpenCodeView, onSelect: () => selectView('opencode') });
  }

>>>>>>> upstream/main
  if (isMobile) {
    return (
      <MobileOverlayPanel
        open={open}
        onClose={handleClose}
<<<<<<< HEAD
        title={t('directoryExplorerDialog.title')}
        // Height only — the width stays on MobileOverlayPanel's shared max-w-lg
        // so this sheet matches every other mobile overlay on wide screens.
||||||| bc50ba56aa
        title={t('directoryExplorerDialog.actions.addProject')}
        // Height only — the width stays on MobileOverlayPanel's shared max-w-lg
        // so this sheet matches every other mobile overlay on wide screens.
=======
        title={t('directoryExplorerDialog.actions.addProject')}
>>>>>>> upstream/main
        className="h-[88dvh] max-h-[720px]"
        contentMaxHeightClassName="flex-1"
        footer={<div className="flex flex-col gap-2">{renderFooter()}</div>}
      >
<<<<<<< HEAD
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex justify-end">{showHiddenToggle}</div>
          {content}
||||||| bc50ba56aa
        <div className="flex h-full min-h-0 flex-col">
          {/* The desktop column, as one line a thumb can swipe. */}
          <div className="-mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-2">
            {places.map((place) => (
              <Button key={place.key} variant="chip" size="lg" aria-pressed={place.pressed} onClick={place.onSelect} className="shrink-0">
                {place.label}
              </Button>
            ))}
          </div>
          {fieldsSection}
          {resultsSection}
=======
        <div className="flex h-full min-h-0 flex-col">
          <div className="-mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-2">
            {places.map((place) => (
              <Button key={place.key} variant="chip" size="lg" aria-pressed={place.pressed} onClick={place.onSelect} className="shrink-0">
                {place.label}
              </Button>
            ))}
          </div>
          {fieldsSection}
          {resultsSection}
>>>>>>> upstream/main
        </div>
      </MobileOverlayPanel>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(value) => value ? onOpenChange(true) : handleClose()}>
      <DialogContent
        className="flex w-full max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[80vh]"
        initialFocus={false}
      >
        <DialogHeader className="px-5 pb-2 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>{t('directoryExplorerDialog.title')}</DialogTitle>
              <DialogDescription className="mt-2">{t('directoryExplorerDialog.description')}</DialogDescription>
            </div>
            {showHiddenToggle}
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-0">{content}</div>
        <DialogFooter className="flex w-full flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
