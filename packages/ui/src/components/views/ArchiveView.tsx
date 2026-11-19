import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui';
import { cn, formatDirectoryName } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { sessionEvents } from '@/lib/sessionEvents';
import { useUIStore } from '@/stores/useUIStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { formatSessionDateLabel, normalizePath } from '@/components/session/sidebar/utils';
import { useShallow } from 'zustand/react/shallow';
import { SessionSearchInput } from '@/components/session/SessionSearchInput';
import { requestReasoningReveal } from '@/components/chat/search/reasoningReveal';
import { refreshSpaceArchives, useSpaceArchivesStore } from '@/lib/spaces/space-archives';
<<<<<<< HEAD
import { isRestorableOnItsOwn } from '@/sync/session-restore-rule';
||||||| bc50ba56aa
import { isRestorableOnItsOwn } from '@/sync/session-restore-rule';
import { createSessionOwnershipIndex } from '@/components/session/sidebar/sessions/sessionOwnership';
import { formatProjectLabel } from '@/components/session/sidebar/utils';
=======
import { selectArchivedSessions, selectActiveArchiveSessions, selectArchiveParentTitles } from './archive/sessionSelectors';
import { createSessionOwnershipIndex } from '@/components/session/sidebar/sessions/sessionOwnership';
import { formatProjectLabel } from '@/components/session/sidebar/utils';
import { resolveSidebarSessionLocations, type SidebarSessionLocation } from '@/components/session/sidebar/recent/sessionLocation';
>>>>>>> upstream/main
import { useProjectsStore } from '@/stores/useProjectsStore';
<<<<<<< HEAD
||||||| bc50ba56aa
import { useGlobalSyncStore } from '@/sync/global-sync-store';
=======
import { useGitAllBranches } from '@/stores/useGitStore';
import { useGlobalSyncStore } from '@/sync/global-sync-store';
import { useSidebarSpaces } from '@/lib/spaces/spaces-store';
>>>>>>> upstream/main
import { loadWorktreeArchives, useWorktreeArchivesByProject } from '@/lib/worktrees/worktreeArchive';
import type { ProjectRef } from '@/lib/worktrees/worktreeManager';
import { ArchivedWorktreeRow } from './archive/ArchivedWorktreeRow';
import { useWorktreeArchiveActions } from './archive/useWorktreeArchiveActions';
<<<<<<< HEAD
||||||| bc50ba56aa
import { isSessionDirectoryAdmitted } from '@/sync/session-admission-rule';
=======
import { isSessionDirectoryAdmitted } from '@/sync/session-admission-rule';
import { openSessionLink } from '@/lib/router/openSessionFromRoute';
import { useConversationSearch, type ConversationResult } from '@/hooks/useConversationSearch';
import { useMessageSearch } from '@/hooks/useMessageSearch';
import { ConversationResultRow } from '@/components/search/ConversationResultRow';
import { conversationContextFromLocation, type ConversationResultContext, type ConversationResultProject } from '@/components/search/conversationResultContext';
import type { SearchMetaItem } from '@/components/search/SearchMetaList';
import { SearchInMenu } from '@/components/search/SearchInMenu';
import { effectiveSearchScope, useSearchScopes } from '@/components/search/searchScopes';
import { SearchStatusMark } from '@/components/search/SearchStatusMark';
import { useSearchFailureText } from '@/components/search/searchStatusText';
import { searchScopeQuery, type OmniAuthor, type SearchScope } from '@/lib/search/omniQuery';
import { MatchHighlight } from '@/components/ui/MatchHighlight';
import { leadWithMatch, splitSnippet } from '@/lib/messageSearch';
>>>>>>> upstream/main

<<<<<<< HEAD
type WorkspaceBucket = {
  workspaceId: string;
||||||| bc50ba56aa
/**
 * A group in the panel on the left: a project with its worktrees (archived
 * ones included), the chats of a deleted isolated space (named after the
 * space, with no way to restore them), or everything else.
 */
type ArchiveBucket = {
  key: string;
  kind: 'project' | 'space' | 'other';
  label: string;
  /** The project's root or the space's directory; empty for everything else. */
=======
type ArchiveBucket = {
  key: string;
  kind: 'project' | 'space' | 'other';
  label: string;
>>>>>>> upstream/main
  directory: string;
<<<<<<< HEAD
  label: string;
||||||| bc50ba56aa
  /** The project's id, for a project bucket. */
  projectId?: string;
=======
  projectId?: string;
>>>>>>> upstream/main
  sessions: Session[];
  // The chats of a deleted isolated space: named after the space, with no way to restore them.
  fromDeletedSpace: boolean;
  /** Canonical project identity when the bucket belongs to a configured project. */
  projectId?: string;
};


const PAGE_SIZE = 100;

const NO_SEARCH_LOCATIONS: ReadonlyMap<string, SidebarSessionLocation> = new Map();
const NO_DIRECTORIES: readonly string[] = [];

type SearchResultRowsProps = {
  result: ConversationResult;
  query: string;
  context: ConversationResultContext;
  mobile: boolean;
  onOpen: () => void;
  onOpenExcerpt: (messageId: string) => void;
  onRestore: () => void;
  restoreLabel: string;
  restorable: boolean;
  author: OmniAuthor;
  includeReasoning: boolean;
  contentAvailable: boolean;
};

function ArchiveSearchResultRow({ result, query, context, mobile, onOpen, onOpenExcerpt, onRestore, restoreLabel, restorable, author, includeReasoning, contentAvailable }: SearchResultRowsProps): React.ReactNode {
  const { t } = useI18n();
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  const expansionKey = `${query}\0${author}\0${includeReasoning}\0${contentAvailable}`;
  const showMatches = expandedKey === expansionKey;
  const matches = useMessageSearch({ query, enabled: showMatches && contentAvailable, limit: PAGE_SIZE, sessionId: result.sessionId, lifecycle: 'archived', role: author === 'any' ? null : author, includeReasoning });
  const openHit = (messageId: string, hitRole: string): void => {
    requestReasoningReveal(hitRole === 'reasoning' ? messageId : null);
    onOpenExcerpt(messageId);
  };
  return <div data-archive-search-result={result.sessionId}>
    <ConversationResultRow
      result={result}
      context={context}
      mobile={mobile}
      onOpen={onOpen}
      onOpenExcerpt={() => {
        if (result.excerpt) openHit(result.excerpt.messageId, result.excerpt.role);
      }}
      onShowMoreMatches={result.moreMatches > 0 && contentAvailable ? () => setExpandedKey(expansionKey) : undefined}
      trailing={restorable ? <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size={mobile ? 'lg' : 'xs'} className={mobile ? 'min-h-11 min-w-11' : undefined} onClick={onRestore} aria-label={restoreLabel}><Icon name="inbox-unarchive" className="size-3.5" /></Button></TooltipTrigger><TooltipContent>{restoreLabel}</TooltipContent></Tooltip> : null}
    />
    {showMatches ? <div className="ms-3 space-y-0.5" data-archive-other-matches={result.sessionId} aria-live="polite">
      {'hits' in matches.state ? matches.state.hits.filter((hit) => hit.id !== result.excerpt?.messageId).map((hit) => <button key={hit.id} type="button" className="block w-full truncate text-start typography-micro text-muted-foreground hover:text-foreground" onClick={() => openHit(hit.id, hit.role)}><MatchHighlight segments={leadWithMatch(splitSnippet(hit.snippet))} /></button>) : null}
      {matches.state.status === 'loading' ? <span className="typography-micro text-muted-foreground">{t('search.omni.status.searching')}</span> : null}
      {matches.state.status === 'error' || (matches.state.status === 'ready' && matches.state.pageError) ? <span className="typography-micro text-muted-foreground">{t('search.omni.status.error')}</span> : null}
      {matches.state.status === 'unavailable' ? <span className="typography-micro text-muted-foreground">{t('search.omni.status.unsupported')}</span> : null}
      {matches.state.status === 'too-short' ? <span className="typography-micro text-muted-foreground">{t('search.omni.status.tooShort')}</span> : null}
      {matches.state.status === 'ready' && matches.state.next ? <button type="button" className="typography-micro text-muted-foreground hover:text-foreground hover:underline" onClick={matches.loadMore} disabled={matches.state.loadingMore}>{t('search.omni.result.loadMore')}</button> : null}
    </div> : null}
  </div>;
}

const groupByParent = (sessions: Session[]): Session[] => {
  const byParent = new Map<string, Session[]>();
  for (const session of sessions) {
    if (!session.parentSessionId) continue;
    const siblings = byParent.get(session.parentSessionId);
    if (siblings) siblings.push(session);
    else byParent.set(session.parentSessionId, [session]);
  }
  const grouped: Session[] = [];
  const placedParents = new Set<string>();
  for (const session of sessions) {
    if (!session.parentSessionId) {
      grouped.push(session);
      continue;
    }
    if (placedParents.has(session.parentSessionId)) continue;
    placedParents.add(session.parentSessionId);
    grouped.push(...(byParent.get(session.parentSessionId) ?? []));
  }
  return grouped;
};

export function ArchiveSessionsView({ layout, onLeave }: {
  layout: 'page' | 'mobile';
  onLeave: () => void;
}): React.ReactNode {
  const { t } = useI18n();
  const messageSearchEnabled = useUIStore((state) => state.messageSearchEnabled);
  const messageSearchReasoningEnabled = useUIStore((state) => state.messageSearchReasoningEnabled);
  const showReasoningTraces = useUIStore((state) => state.showReasoningTraces);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
  const unarchiveSession = useSessionUIStore((state) => state.unarchiveSession);
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
<<<<<<< HEAD
  // Narrow selections: the cache's entity map changes with every active
  // session update, and the page only depends on which archived sessions are
  // listed and on their parents' titles.
  const listedSessions = useGlobalSessionsStore(useShallow((state) => state.archivedSessions
    .filter((session) => isRestorableOnItsOwn(session, state.entityById))));
  const parentTitlePairs = useGlobalSessionsStore(useShallow((state) => state.archivedSessions.flatMap((session) => {
    const parent = session.parentSessionId ? state.entityById.get(session.parentSessionId) : undefined;
    return parent ? [parent.sessionId, parent.title ?? ''] : [];
  })));
||||||| bc50ba56aa
  const projects = useProjectsStore((state) => state.projects);
  const worktreesByProject = useSessionUIStore((state) => state.availableWorktreesByProject);
  // Narrow selections: the cache's entity map changes with every active
  // session update, and the page only depends on which archived sessions are
  // listed and on their parents' titles.
  const listedSessions = useGlobalSessionsStore(useShallow((state) => state.archivedSessions
    .filter((session) => isRestorableOnItsOwn(session, state.entityById))));
  const parentTitlePairs = useGlobalSessionsStore(useShallow((state) => state.archivedSessions.flatMap((session) => {
    const parent = session.parentID ? state.entityById.get(session.parentID) : undefined;
    return parent ? [parent.id, parent.title] : [];
  })));
=======
  const projects = useProjectsStore((state) => state.projects);
  const worktreesByProject = useSessionUIStore((state) => state.availableWorktreesByProject);
  const gitBranches = useGitAllBranches(true);
  const spaceList = useSidebarSpaces();
  const listedSessions = useGlobalSessionsStore(useShallow(selectArchivedSessions));
  const activeSessions = useGlobalSessionsStore(useShallow(selectActiveArchiveSessions));
  const parentTitlePairs = useGlobalSessionsStore(useShallow(selectArchiveParentTitles));
>>>>>>> upstream/main
  const sessionsStatus = useGlobalSessionsStore((state) => state.status);
<<<<<<< HEAD
  const discoveryErrors = useGlobalSessionsStore((state) => state.discoveryErrors);
  const loadSessions = useGlobalSessionsStore((state) => state.loadSessions);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const handleRetry = React.useCallback(async () => {
    setIsRetrying(true);
    try {
      await loadSessions();
    } finally {
      setIsRetrying(false);
    }
  }, [loadSessions]);
  const hasDiscoveryErrors = Boolean(discoveryErrors && discoveryErrors.size > 0);
  const [query, setQuery] = React.useState(initialQuery);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<string | null>(null);
  const spaceArchives = useSpaceArchivesStore((state) => state.byWorkspaceId);
||||||| bc50ba56aa
  const [query, setQuery] = React.useState(initialQuery);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
=======
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
>>>>>>> upstream/main
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
<<<<<<< HEAD
  const projects = useProjectsStore((state) => state.projects);
  const archivesByProject = useWorktreeArchivesByProject();
  const archiveActions = useWorktreeArchiveActions();
||||||| bc50ba56aa
  const spaceArchives = useSpaceArchivesStore((state) => state.byDirectory);
=======
  const spaceArchives = useSpaceArchivesStore((state) => state.byDirectory);
  const [text, setText] = React.useState('');
  const [searchScope, setSearchScope] = React.useState<SearchScope>('everything');
  const searchScopes = useSearchScopes();
  const { searchIn, author } = searchScopeQuery(effectiveSearchScope(searchScope, searchScopes));
>>>>>>> upstream/main

<<<<<<< HEAD
  // The chats of deleted spaces are read-only and named after their space; refresh when the page opens.
||||||| bc50ba56aa
  // The chats of deleted spaces are read-only and named after their space; read which they are
  // each time the page opens, since a space may have been deleted from another window.
=======
>>>>>>> upstream/main
  React.useEffect(() => {
    void refreshSpaceArchives().catch(() => {});
  }, []);

  // Archived worktrees live in each project's repository; read them each time
  // the page opens, like the spaces above.
  React.useEffect(() => {
    for (const project of projects) void loadWorktreeArchives(project.path).catch(() => undefined);
  }, [projects]);

  const labelOf = React.useCallback((workspaceId: string, directory: string): string => {
    const archive = spaceArchives?.get(workspaceId);
    if (archive) return archive.name;
    return directory ? (formatDirectoryName(directory, homeDirectory) || directory) : t('sessions.archivePage.otherProjects');
  }, [homeDirectory, spaceArchives, t]);

<<<<<<< HEAD
  const normalizedQuery = query.trim().toLowerCase();
  // A subsession under an archived parent comes back with that parent and is
  // not listed. One archived while its parent stays active would otherwise
  // show nowhere, so it is listed under its parent's title and restored alone.
||||||| bc50ba56aa
  const normalizedQuery = query.trim().toLowerCase();

  const openCodeProjects = useGlobalSyncStore((state) => state.projects);

  // Sessions belong to their project the way the sidebar groups them: by
  // folder, then by OpenCode's project, which is what still places a session
  // of a worktree that is gone.
  const ownership = React.useMemo(() => createSessionOwnershipIndex(
    listedSessions,
    projects.flatMap((project) => {
      const normalizedPath = normalizePath(project.path);
      return normalizedPath ? [{ id: project.id, normalizedPath }] : [];
    }),
    worktreesByProject,
    false,
    [],
    openCodeProjects,
  ), [listedSessions, openCodeProjects, projects, worktreesByProject]);

  // A worktree that is gone matches no project by folder, so its sessions are
  // listed once the server confirms the folder is missing. A folder that still
  // exists stays behind admission, whatever project OpenCode files it under.
  const unadmittedOwnedDirectories = React.useMemo(() => [...new Set(listedSessions.flatMap((session) => {
    const directory = resolveGlobalSessionDirectory(session);
    return directory && ownership.bySessionId.has(session.id) && !isSessionDirectoryAdmitted(directory, projects, worktreesByProject) ? [directory] : [];
  }))].sort().join('\n'), [listedSessions, ownership, projects, worktreesByProject]);
  const [goneDirectories, setGoneDirectories] = React.useState<ReadonlySet<string>>(() => new Set());
  React.useEffect(() => {
    if (!unadmittedOwnedDirectories) return undefined;
    let current = true;
    void Promise.all(unadmittedOwnedDirectories.split('\n').map(async (directory) => (
      await opencodeClient.getDirectoryAvailability(directory) === 'missing' ? [directory] : []
    ))).then((gone) => {
      if (current) setGoneDirectories(new Set(gone.flat()));
    });
    return () => { current = false; };
  }, [unadmittedOwnedDirectories]);

  // A subsession under an archived parent comes back with that parent and is
  // not listed. One archived while its parent stays active would otherwise
  // show nowhere, so it is listed under its parent's title and restored alone.
=======
  const normalizedQuery = text.toLowerCase();
  const hasSearchQuery = normalizedQuery !== '';

  const openCodeProjects = useGlobalSyncStore((state) => state.projects);

  const ownershipCandidates = React.useMemo(() => [...listedSessions, ...activeSessions], [activeSessions, listedSessions]);
  const ownershipProjects = React.useMemo(() => projects.flatMap((project) => {
    const normalizedPath = normalizePath(project.path);
    return normalizedPath ? [{ id: project.id, normalizedPath }] : [];
  }), [projects]);
  const ownership = React.useMemo(() => createSessionOwnershipIndex(
    ownershipCandidates,
    ownershipProjects,
    worktreesByProject,
    false,
    [],
    openCodeProjects,
  ), [openCodeProjects, ownershipCandidates, ownershipProjects, worktreesByProject]);
  const searchOwnership = React.useMemo(() => (hasSearchQuery ? createSessionOwnershipIndex(
    ownershipCandidates,
    ownershipProjects,
    worktreesByProject,
    false,
    [],
    openCodeProjects,
    spaceList,
  ) : null), [hasSearchQuery, openCodeProjects, ownershipCandidates, ownershipProjects, spaceList, worktreesByProject]);
  const spaceLabelById = React.useMemo(() => new Map(spaceList.map((space) => [space.id, space.name])), [spaceList]);
  const locationProjects = React.useMemo(() => projects.flatMap((project) => {
    const normalizedPath = normalizePath(project.path);
    if (!normalizedPath) return [];
    return [{
      id: project.id,
      label: formatProjectLabel(project.label?.trim() || formatDirectoryName(normalizedPath, homeDirectory) || normalizedPath),
      normalizedPath,
    }];
  }), [homeDirectory, projects]);
  const projectById = React.useMemo(() => new Map(projects.map((project): [string, ConversationResultProject] => [project.id, {
    id: project.id,
    label: formatProjectLabel(project.label?.trim() || formatDirectoryName(project.path, homeDirectory) || project.path),
    icon: project.icon,
    color: project.color,
    iconImage: project.iconImage,
    iconBackground: project.iconBackground,
  }])), [homeDirectory, projects]);
  const searchLocationBySessionId = React.useMemo(() => (searchOwnership ? resolveSidebarSessionLocations({
    sessions: ownershipCandidates,
    projects: locationProjects,
    ownerBySessionId: searchOwnership.bySessionId,
    spaceLabelById,
    availableWorktreesByProject: worktreesByProject,
    gitBranches,
    homeDirectory,
    hideBranchMatchingProjectLabel: false,
  }) : NO_SEARCH_LOCATIONS), [gitBranches, homeDirectory, locationProjects, ownershipCandidates, searchOwnership, spaceLabelById, worktreesByProject]);
  const locationProjectById = React.useMemo(() => new Map(locationProjects.map((project) => [project.id, project])), [locationProjects]);

  const unadmittedOwnedDirectories = React.useMemo(() => [...new Set(ownershipCandidates.flatMap((session) => {
    const directory = resolveGlobalSessionDirectory(session);
    return directory && ownership.bySessionId.has(session.id) && !isSessionDirectoryAdmitted(directory, projects, worktreesByProject) ? [directory] : [];
  }))].sort().join('\n'), [ownership, ownershipCandidates, projects, worktreesByProject]);
  const [goneDirectories, setGoneDirectories] = React.useState<ReadonlySet<string>>(() => new Set());
  React.useEffect(() => {
    if (!unadmittedOwnedDirectories) return undefined;
    let current = true;
    void Promise.all(unadmittedOwnedDirectories.split('\n').map(async (directory) => (
      await opencodeClient.getDirectoryAvailability(directory) === 'missing' ? [directory] : []
    ))).then((gone) => {
      if (current) setGoneDirectories(new Set(gone.flat()));
    });
    return () => { current = false; };
  }, [unadmittedOwnedDirectories]);

>>>>>>> upstream/main
  const sortedSessions = React.useMemo(
    () => [...listedSessions].sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
    [listedSessions],
  );

  const parentTitles = React.useMemo(() => {
    const titles = new Map<string, string>();
    for (let index = 0; index < parentTitlePairs.length; index += 2) titles.set(parentTitlePairs[index], parentTitlePairs[index + 1]);
    return titles;
  }, [parentTitlePairs]);

  const parentTitleAbove = (rows: Session[], index: number): string | null => {
    const parentSessionId = rows[index]?.parentSessionId;
    if (!parentSessionId || rows[index - 1]?.parentSessionId === parentSessionId) return null;
    return parentTitles.get(parentSessionId) || t('sessions.sidebar.session.untitled');
  };

<<<<<<< HEAD
  const buckets = React.useMemo<WorkspaceBucket[]>(() => {
    const byWorkspaceId = new Map<string, WorkspaceBucket>();
||||||| bc50ba56aa
  const archivesByProject = useWorktreeArchivesByProject();
  const archiveActions = useWorktreeArchiveActions();

  // Archived worktrees live in each project's repository; read them each time
  // the page opens, like the spaces above.
  React.useEffect(() => {
    for (const project of projects) void loadWorktreeArchives(project.path).catch(() => undefined);
  }, [projects]);

  const buckets = React.useMemo<ArchiveBucket[]>(() => {
    const byKey = new Map<string, ArchiveBucket>();
    const bucketFor = (key: string, create: () => Omit<ArchiveBucket, 'sessions'>): ArchiveBucket => {
      const existing = byKey.get(key);
      if (existing) return existing;
      const bucket = { ...create(), sessions: [] };
      byKey.set(key, bucket);
      return bucket;
    };
    const projectBucket = (root: string) => {
      const project = projects.find((entry) => normalizePath(entry.path) === root);
      return bucketFor(root, () => ({
        key: root,
        kind: 'project',
        label: formatProjectLabel(project?.label?.trim() || root.split('/').filter(Boolean).pop() || root),
        directory: root,
        projectId: project?.id,
      }));
    };
=======
  const archivesByProject = useWorktreeArchivesByProject();
  const archiveActions = useWorktreeArchiveActions();

  React.useEffect(() => {
    for (const project of projects) void loadWorktreeArchives(project.path).catch(() => undefined);
  }, [projects]);

  const buckets = React.useMemo<ArchiveBucket[]>(() => {
    const byKey = new Map<string, ArchiveBucket>();
    const bucketFor = (key: string, create: () => Omit<ArchiveBucket, 'sessions'>): ArchiveBucket => {
      const existing = byKey.get(key);
      if (existing) return existing;
      const bucket = { ...create(), sessions: [] };
      byKey.set(key, bucket);
      return bucket;
    };
    const projectBucket = (root: string) => {
      const project = projects.find((entry) => normalizePath(entry.path) === root);
      return bucketFor(root, () => ({
        key: root,
        kind: 'project',
        label: formatProjectLabel(project?.label?.trim() || root.split('/').filter(Boolean).pop() || root),
        directory: root,
        projectId: project?.id,
      }));
    };
>>>>>>> upstream/main
    for (const session of sortedSessions) {
      const workspaceId = session.workspaceId;
      const directory = normalizePath(resolveGlobalSessionDirectory(session)) ?? '';
      const existing = byWorkspaceId.get(workspaceId);
      if (existing) {
        existing.sessions.push(session);
        continue;
      }
      byWorkspaceId.set(workspaceId, {
        workspaceId,
        directory,
        label: labelOf(workspaceId, directory),
        sessions: [session],
        fromDeletedSpace: spaceArchives?.has(workspaceId) ?? false,
        projectId: session.projectId,
      });
    }
<<<<<<< HEAD
    // A project whose only archive is a worktree without sessions is listed too.
    for (const project of projects) {
      const key = normalizePath(project.path);
      const archives = key ? archivesByProject.get(key)?.archives ?? [] : [];
      if (archives.length === 0) continue;
      if ([...byWorkspaceId.values()].some((bucket) => bucket.projectId === project.id)) continue;
      byWorkspaceId.set(`project:${project.id}`, {
        workspaceId: `project:${project.id}`,
        directory: key ?? project.path,
        label: project.label?.trim() || labelOf(project.id, key ?? project.path),
        sessions: [],
        fromDeletedSpace: false,
        projectId: project.id,
      });
||||||| bc50ba56aa
    // A project whose only archive is a worktree without sessions is listed too.
    for (const [root, entry] of archivesByProject) {
      if (entry.archives.length > 0) projectBucket(root);
=======
    for (const [root, entry] of archivesByProject) {
      if (entry.archives.length > 0) projectBucket(root);
>>>>>>> upstream/main
    }
    return [...byWorkspaceId.values()].sort((a, b) => b.sessions.length - a.sessions.length);
  }, [archivesByProject, labelOf, projects, sortedSessions, spaceArchives]);

<<<<<<< HEAD
  // Search spans every archived session; the workspace filter applies only while not searching.
||||||| bc50ba56aa
  const selectedBucket = selectedKey === null ? null : buckets.find((bucket) => bucket.key === selectedKey) ?? null;
  const selectedProject = selectedBucket?.projectId ? { id: selectedBucket.projectId, path: selectedBucket.directory } : null;
  // The selected project's archived worktrees, each with its own sessions.
  const worktreeGroups = React.useMemo(() => {
    if (normalizedQuery || selectedBucket?.kind !== 'project') return [];
    const listed = new Map(selectedBucket.sessions.map((session) => [session.id, session] as const));
    return (archivesByProject.get(selectedBucket.directory)?.archives ?? []).map((archive) => ({
      archive,
      sessions: groupByParent(archive.sessionIds.flatMap((id) => {
        const session = listed.get(id);
        return session ? [session] : [];
      }).sort((a, b) => (b.time?.archived ?? 0) - (a.time?.archived ?? 0))),
    }));
  }, [archivesByProject, normalizedQuery, selectedBucket]);
  const inWorktreeGroup = React.useMemo(
    () => new Set(worktreeGroups.flatMap((group) => group.sessions.map((session) => session.id))),
    [worktreeGroups],
  );

  // Search spans every archived session; the directory filter applies only
  // while not searching.
=======
  const projectLabelFor = React.useCallback((session: Session, directory: string | null): string | null => {
    if (directory && spaceArchives?.has(directory)) return labelOf(directory);
    const owner = ownership.bySessionId.get(session.id);
    if (!owner) return null;
    const project = projects.find((entry) => entry.id === owner.projectId);
    return formatProjectLabel(project?.label?.trim() || owner.projectRoot.split('/').filter(Boolean).pop() || owner.projectRoot);
  }, [labelOf, ownership, projects, spaceArchives]);
  const topologyWorktrees = React.useMemo(() => [...worktreesByProject.entries()].flatMap(([projectRoot, worktrees]) => worktrees.map((worktree) => ({ ...worktree, projectRoot: normalizePath(projectRoot) }))), [worktreesByProject]);
  const topologyDirectories = React.useMemo(() => [...new Set([
    ...projects.map((project) => normalizePath(project.path)),
    ...topologyWorktrees.map((worktree) => normalizePath(worktree.path)),
  ].filter((directory): directory is string => Boolean(directory)))], [projects, topologyWorktrees]);
  const worktreeLabelFor = React.useCallback((session: Session): string | null => {
    const directory = normalizePath(resolveGlobalSessionDirectory(session));
    const worktree = topologyWorktrees.find((entry) => normalizePath(entry.path) === directory);
    if (worktree) return [worktree.label, worktree.branch, worktree.path].filter(Boolean).join(' ');
    const owner = ownership.bySessionId.get(session.id);
    if (!owner || owner.kind !== 'worktree') return null;
    return owner.scopeDirectory.split('/').filter(Boolean).pop() || owner.scopeDirectory;
  }, [ownership, topologyWorktrees]);
  const selectedBucket = selectedKey === null ? null : buckets.find((bucket) => bucket.key === selectedKey) ?? null;
  const searchedSessions = selectedBucket?.sessions ?? sortedSessions;
  const searchedSessionById = React.useMemo(() => new Map(searchedSessions.map((session) => [session.id, session])), [searchedSessions]);
  const archiveSearchResultContext = React.useCallback(({
    result,
    mobile,
  }: {
    result: ConversationResult;
    mobile: boolean;
  }): ConversationResultContext => {
    const session = searchedSessionById.get(result.sessionId);
    const directory = normalizePath(result.directory ?? session?.directory ?? null);
    const location = searchLocationBySessionId.get(result.sessionId);
    const spaceArchive = directory ? spaceArchives?.get(directory) : undefined;
    const projectId = location?.projectId ?? null;
    const extras: SearchMetaItem[] = [];
    const parentTitle = session?.parentID ? parentTitles.get(session.parentID) : null;
    if (parentTitle) extras.push({ key: 'parent', text: parentTitle, dir: 'auto', priority: 'yield' });
    if (!mobile) extras.push({
      key: 'date',
      text: formatSessionDateLabel(session?.time?.archived ?? session?.time?.updated ?? Date.now()),
      dir: 'auto',
      priority: 'keep',
    });
    return conversationContextFromLocation({
      location,
      directory,
      project: spaceArchive || !projectId ? null : projectById.get(projectId) ?? null,
      projectRoot: projectId ? locationProjectById.get(projectId)?.normalizedPath ?? null : null,
      homeDirectory,
      folderOverride: spaceArchive?.name ?? null,
      extras,
    });
  }, [homeDirectory, locationProjectById, parentTitles, projectById, searchLocationBySessionId, searchedSessionById, spaceArchives]);
  const searchDirectories = React.useMemo<readonly string[]>(() => {
    if (!hasSearchQuery) return NO_DIRECTORIES;
    const directories = new Set<string>();
    if (!selectedBucket) {
      for (const directory of topologyDirectories) directories.add(directory);
    } else if (selectedBucket.kind === 'project') {
      directories.add(selectedBucket.directory);
      for (const worktree of topologyWorktrees) {
        const directory = normalizePath(worktree.path);
        if (directory && worktree.projectRoot === selectedBucket.directory) directories.add(directory);
      }
      for (const session of ownershipCandidates) {
        const directory = normalizePath(resolveGlobalSessionDirectory(session));
        if (directory && normalizePath(ownership.bySessionId.get(session.id)?.projectRoot ?? null) === selectedBucket.directory) directories.add(directory);
      }
    }
    for (const session of searchedSessions) {
      const directory = normalizePath(resolveGlobalSessionDirectory(session));
      if (directory) directories.add(directory);
    }
    return [...directories];
  }, [hasSearchQuery, ownership, ownershipCandidates, searchedSessions, selectedBucket, topologyDirectories, topologyWorktrees]);
  const metadataItems = React.useMemo(() => searchedSessions.map((session) => {
    const directory = normalizePath(resolveGlobalSessionDirectory(session));
    return { sessionId: session.id, title: session.title || t('sessions.sidebar.session.untitled'), projectLabel: projectLabelFor(session, directory), worktreeLabel: worktreeLabelFor(session), directory, archived: true, updatedAt: session.time?.archived ?? session.time?.updated };
  }), [projectLabelFor, searchedSessions, t, worktreeLabelFor]);
  const conversationSearch = useConversationSearch({
    enabled: hasSearchQuery, text: normalizedQuery, lifecycle: 'archived', searchIn: searchDirectories.length === 0 ? 'titles' : searchIn, author, metadataItems, directories: searchDirectories,
    isAdmitted: (directory) => Boolean(directory && searchDirectories.includes(directory)) && (isSessionDirectoryAdmitted(directory, projects, worktreesByProject) || Boolean(directory && spaceArchives?.has(directory)) || Boolean(directory && goneDirectories.has(directory))),
    branchOnly: true, pageSize: PAGE_SIZE,
  });
  const contentStatus = conversationSearch.contentStatus;
  const searchFailure = useSearchFailureText(contentStatus, searchIn === 'messages');

  const selectedProject = selectedBucket?.projectId ? { id: selectedBucket.projectId, path: selectedBucket.directory } : null;
  const worktreeGroups = React.useMemo(() => {
    if (hasSearchQuery || selectedBucket?.kind !== 'project') return [];
    const listed = new Map(selectedBucket.sessions.map((session) => [session.id, session] as const));
    return (archivesByProject.get(selectedBucket.directory)?.archives ?? []).map((archive) => ({
      archive,
      sessions: groupByParent(archive.sessionIds.flatMap((id) => {
        const session = listed.get(id);
        return session ? [session] : [];
      }).sort((a, b) => (b.time?.archived ?? 0) - (a.time?.archived ?? 0))),
    }));
  }, [archivesByProject, hasSearchQuery, selectedBucket]);
  const inWorktreeGroup = React.useMemo(
    () => new Set(worktreeGroups.flatMap((group) => group.sessions.map((session) => session.id))),
    [worktreeGroups],
  );

  const searchResults = conversationSearch.results;
>>>>>>> upstream/main
  const filteredSessions = React.useMemo(() => {
<<<<<<< HEAD
    if (normalizedQuery) {
      if (normalizedQuery.startsWith('ses_')) {
        return sortedSessions.filter((session) => session.sessionId.toLowerCase() === normalizedQuery);
      }
      return groupByParent(rankByQuery(sortedSessions, normalizedQuery, (session) => [session.title ?? '']));
    }
    if (selectedWorkspaceId === null) return groupByParent(sortedSessions);
    return groupByParent(buckets.find((bucket) => bucket.workspaceId === selectedWorkspaceId)?.sessions ?? []);
  }, [buckets, normalizedQuery, selectedWorkspaceId, sortedSessions]);

  const selectedBucket = selectedWorkspaceId === null
    ? null
    : buckets.find((bucket) => bucket.workspaceId === selectedWorkspaceId) ?? null;
  const selectedProjectId = selectedBucket?.projectId ?? null;
  const selectedProjectPath = selectedProjectId === null
    ? null
    : projects.find((entry) => entry.id === selectedProjectId)?.path ?? null;
  const selectedProject = selectedProjectId !== null && selectedProjectPath !== null
    ? { id: selectedProjectId, path: selectedProjectPath }
    : null;

  // The selected project's archived worktrees, shown above its archived sessions.
  const selectedWorktreeArchives = React.useMemo(() => {
    if (normalizedQuery || selectedProjectPath === null) return [];
    const key = normalizePath(selectedProjectPath);
    return key ? archivesByProject.get(key)?.archives ?? [] : [];
  }, [archivesByProject, normalizedQuery, selectedProjectPath]);

  // The phone has no project panel, so every project's archived worktrees are
  // listed above the sessions there.
  const allWorktreeArchives = React.useMemo(() => {
    if (normalizedQuery) return [];
    return projects.flatMap((project) => {
      const key = normalizePath(project.path);
      const archives = key ? archivesByProject.get(key)?.archives ?? [] : [];
      return archives.map((archive) => ({ project: { id: project.id, path: project.path } satisfies ProjectRef, archive }));
    });
  }, [archivesByProject, normalizedQuery, projects]);
||||||| bc50ba56aa
    if (normalizedQuery) {
      if (normalizedQuery.startsWith('ses_')) {
        return sortedSessions.filter((session) => session.id.toLowerCase() === normalizedQuery);
      }
      return groupByParent(rankByQuery(sortedSessions, normalizedQuery, (session) => [session.title]));
    }
    if (selectedBucket === null) return groupByParent(sortedSessions);
    return groupByParent(selectedBucket.sessions.filter((session) => !inWorktreeGroup.has(session.id)));
  }, [inWorktreeGroup, normalizedQuery, selectedBucket, sortedSessions]);
=======
    if (selectedBucket === null) return groupByParent(sortedSessions);
    return groupByParent(selectedBucket.sessions.filter((session) => !inWorktreeGroup.has(session.id)));
  }, [inWorktreeGroup, selectedBucket, sortedSessions]);
>>>>>>> upstream/main

  const visibleSessions = filteredSessions.slice(0, visibleCount);
<<<<<<< HEAD
  const remainingCount = filteredSessions.length - visibleSessions.length;
  const totalCount = sortedSessions.length;
  const isFailed = sessionsStatus === 'error' || (totalCount === 0 && hasDiscoveryErrors);
||||||| bc50ba56aa
  const remainingCount = filteredSessions.length - visibleSessions.length;
  const totalCount = sortedSessions.length;
=======
  const remainingCount = (hasSearchQuery ? searchResults.length : filteredSessions.length) - visibleCount;
  const archiveCount = sortedSessions.length;
  const searchCount = conversationSearch.totalCount;
  const searchCountsByDirectory = conversationSearch.countsByDirectory;
  const countForBucket = React.useCallback((bucket: ArchiveBucket): number | null => {
    if (!hasSearchQuery) return bucket.sessions.length;
    const counts = searchCountsByDirectory;
    if (!counts) return null;
    let count = 0;
    for (const [directory, directoryCount] of counts) {
      if (bucket.kind === 'space' && directory === bucket.directory) count += directoryCount;
      const topologyOwner = topologyWorktrees
        .filter((worktree) => directory === normalizePath(worktree.path))
        .sort((a, b) => (b.projectRoot?.length ?? 0) - (a.projectRoot?.length ?? 0))[0]?.projectRoot
        ?? projects.map((project) => normalizePath(project.path)).filter((root): root is string => root !== null && (directory === root || directory.startsWith(root + '/'))).sort((a, b) => b.length - a.length)[0];
      const session = ownershipCandidates.find((candidate) => normalizePath(resolveGlobalSessionDirectory(candidate)) === directory);
      const ownerRoot = topologyOwner ?? (session ? ownership.bySessionId.get(session.id)?.projectRoot : undefined);
      if (bucket.kind === 'project' && ownerRoot === bucket.directory) count += directoryCount;
      if (bucket.kind === 'other' && !ownerRoot && !spaceArchives?.has(directory)) count += directoryCount;
    }
    return count;
  }, [hasSearchQuery, ownership, ownershipCandidates, projects, searchCountsByDirectory, spaceArchives, topologyWorktrees]);
>>>>>>> upstream/main

<<<<<<< HEAD
  const selectWorkspace = React.useCallback((workspaceId: string | null) => {
    setSelectedWorkspaceId(workspaceId);
||||||| bc50ba56aa
  const selectBucket = React.useCallback((directory: string | null) => {
    setSelectedKey(directory);
=======
  const selectBucket = React.useCallback((key: string | null) => {
    setSelectedKey(key);
>>>>>>> upstream/main
    setVisibleCount(PAGE_SIZE);
  }, []);

  const search = (next: string) => {
    setText(next);
    if (next === '') setSearchScope('everything');
    else if (!hasSearchQuery) setSelectedKey(null);
    setVisibleCount(PAGE_SIZE);
  };

  const openSession = React.useCallback((session: Session) => {
    const directory = normalizePath(resolveGlobalSessionDirectory(session));
    setCurrentSession(session.sessionId, directory ?? undefined);
    onLeave();
  }, [onLeave, setCurrentSession]);

  const restoreSession = React.useCallback((session: Session) => {
    void unarchiveSession(session.sessionId).then((success) => {
      if (success) toast.success(t('sessions.sidebar.session.restore.success'));
      else toast.error(t('sessions.sidebar.session.restore.error'));
    });
  }, [t, unarchiveSession]);

<<<<<<< HEAD
||||||| bc50ba56aa
  const copySessionId = React.useCallback((sessionId: string) => {
    void copyTextToClipboard(sessionId)
      .then((result) => {
        if (result.ok) {
          toast.success(t('sessions.sidebar.session.copyId.success'));
          return;
        }
        toast.error(t('sessions.sidebar.session.copyId.error'));
      })
      .catch(() => toast.error(t('sessions.sidebar.session.copyId.error')));
  }, [t]);

=======
  const copySessionId = React.useCallback((sessionId: string) => {
    void copyTextToClipboard(sessionId)
      .then((result) => {
        if (result.ok) {
          toast.success(t('sessions.sidebar.session.copyId.success'));
          return;
        }
        toast.error(t('sessions.sidebar.session.copyId.error'));
      })
      .catch(() => toast.error(t('sessions.sidebar.session.copyId.error')));
  }, [t]);

  const countText = (count: number) => (count === 1
    ? t('sessions.archivePage.countSingle', { count })
    : t('sessions.archivePage.countPlural', { count }));
  const shownCount = hasSearchQuery ? searchCount : filteredSessions.length;
  const countLabel = shownCount === null ? null : countText(shownCount);
>>>>>>> upstream/main
  const searchInput = (
    <SessionSearchInput
      value={text}
      onSearch={search}
      mobile={layout === 'mobile'}
      placeholder={t('sessions.archivePage.searchPlaceholder')}
      clearLabel={t('sessions.sidebar.header.search.clear')}
      trailing={hasSearchQuery ? <>
        <SearchStatusMark status={contentStatus} scope={searchScope} />
        <SearchInMenu mobile={layout === 'mobile'} scope={searchScope} onChange={(next) => { setSearchScope(next); setVisibleCount(PAGE_SIZE); }} />
      </> : undefined}
    />
  );

<<<<<<< HEAD
  const countLabel = filteredSessions.length === 1
    ? t('sessions.archivePage.countSingle', { count: filteredSessions.length })
    : t('sessions.archivePage.countPlural', { count: filteredSessions.length });
||||||| bc50ba56aa
  const countLabel = filteredSessions.length === 1
    ? t('sessions.archivePage.countSingle', { count: filteredSessions.length })
    : t('sessions.archivePage.countPlural', { count: filteredSessions.length });

  // An empty list is only "no archived sessions" once the session list has
  // actually loaded; before that, or after a failed load, say so instead.
=======
>>>>>>> upstream/main
  const emptyLabel = () => {
<<<<<<< HEAD
    if (totalCount === 0 && (sessionsStatus === 'error' || hasDiscoveryErrors)) return t('sessions.sidebar.group.empty.loadFailed');
    if (totalCount === 0 && sessionsStatus !== 'ready') return t('sessions.sidebar.group.empty.loadingSessions');
    return normalizedQuery ? t('sessions.archivePage.empty.noMatches') : t('sessions.archivePage.empty.noArchived');
||||||| bc50ba56aa
    if (totalCount === 0 && sessionsStatus === 'error') return t('sessions.sidebar.group.empty.loadFailed');
    if (totalCount === 0 && sessionsStatus !== 'ready') return t('sessions.sidebar.group.empty.loadingSessions');
    return normalizedQuery ? t('sessions.archivePage.empty.noMatches') : t('sessions.archivePage.empty.noArchived');
=======
    if (archiveCount === 0 && sessionsStatus === 'error') return t('sessions.sidebar.group.empty.loadFailed');
    if (archiveCount === 0 && sessionsStatus !== 'ready') return t('sessions.sidebar.group.empty.loadingSessions');
    if (hasSearchQuery && (contentStatus.kind === 'loading' || contentStatus.kind === 'ready' && contentStatus.indexing)) return t('search.omni.status.searching');
    return hasSearchQuery ? t('sessions.archivePage.empty.noMatches') : t('sessions.archivePage.empty.noArchived');
>>>>>>> upstream/main
  };
  const discoveryErrorBanner = hasDiscoveryErrors ? (
    <div className="mb-2 flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
      <span>{t('sessions.sidebar.group.empty.loadFailed')}</span>
      <Button variant="ghost" size="xs" onClick={() => void handleRetry()} disabled={isRetrying} className="h-6 px-2 text-xs hover:bg-destructive/20">
        {isRetrying ? t('sessions.sidebar.group.empty.loadingSessions') : t('sessions.sidebar.group.empty.retry')}
      </Button>
    </div>
  ) : null;
  const emptyState = (
    <div className="py-10 text-center text-muted-foreground space-y-3">
      <p className="typography-ui-label font-semibold">{emptyLabel()}</p>
      {isFailed ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => void handleRetry()} disabled={isRetrying}>
            {isRetrying ? t('sessions.sidebar.group.empty.loadingSessions') : t('sessions.sidebar.group.empty.retry')}
          </Button>
        </div>
      ) : null}
    </div>
  );
<<<<<<< HEAD
  const showMoreButton = remainingCount > 0 ? (
    <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
||||||| bc50ba56aa

  const showMoreButton = remainingCount > 0 ? (
    <button
      type="button"
      onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
=======

  const searchResultRows = (mobile: boolean) => (searchResults.length === 0 ? emptyState : searchResults.slice(0, visibleCount).map((result) => {
    const session = searchedSessionById.get(result.sessionId);
    return <ArchiveSearchResultRow
      key={result.sessionId}
      result={result}
      query={normalizedQuery}
      context={archiveSearchResultContext({ result, mobile })}
      mobile={mobile}
      restorable={Boolean(session) && !(spaceArchives?.has(result.directory ?? '') ?? false)}
      onOpen={() => { void openSessionLink(result.sessionId, null); onLeave(); }}
      onOpenExcerpt={(messageId) => { void openSessionLink(result.sessionId, messageId); onLeave(); }}
      onRestore={() => { if (session) restoreSession(session); }}
      restoreLabel={t('sessions.archivePage.restoreSessionAria', { title: result.title })}
      author={author}
      includeReasoning={messageSearchReasoningEnabled && showReasoningTraces}
      contentAvailable={messageSearchEnabled}
    />;
  }));

  const hasMoreContent = contentStatus.kind === 'ready' && contentStatus.hasMore;
  const showMoreButton = remainingCount > 0 || (hasSearchQuery && hasMoreContent) ? (
    <button
      type="button"
      onClick={() => {
        setVisibleCount((count) => count + PAGE_SIZE);
        if (hasMoreContent) conversationSearch.loadMore();
      }}
>>>>>>> upstream/main
      className={cn(
        'flex items-center justify-start rounded-md text-left text-muted-foreground/70 leading-tight hover:text-foreground hover:underline',
        layout === 'mobile' ? 'min-h-10 px-3 typography-micro' : 'mt-1 px-2 py-1 text-xs',
      )}>
      {t('sessions.sidebar.group.showMore')}
    </button>
  ) : null;
  if (layout === 'mobile') {
<<<<<<< HEAD
    // One column: no directory panel, so every row names its project. Touch
    // has no hover, so Restore is always visible. Deleting stays on desktop,
    // whose confirmation dialog the mobile shell does not mount.
||||||| bc50ba56aa
    // The desktop's page in one column. Its groups (every session, each
    // project, a deleted space's chats, everything else) become a row of
    // chips that scrolls sideways; a project's archived worktrees are tiles
    // holding their sessions above its loose ones. Touch has no hover, so
    // Restore and a worktree's Delete are always shown. Deleting a session
    // stays on the desktop, whose confirmation dialog the mobile shell does
    // not mount.
    const renderMobileSessionRow = (session: Session, index: number, rows: Session[], inTile: boolean) => {
      const sessionDirectory = normalizePath(resolveGlobalSessionDirectory(session)) ?? '';
      const title = session.title || t('sessions.sidebar.session.untitled');
      // A deleted space's chat has nowhere to be restored to.
      const restorable = !(spaceArchives?.has(sessionDirectory) ?? false);
      const parentTitle = parentTitleAbove(rows, index);
      // Only a list that mixes groups names each row's group.
      const showGroup = selectedBucket === null || normalizedQuery.length > 0;
      // In a worktree's tile the titles line up with the worktree's name, past its icon.
      const indent = inTile ? (session.parentID ? 'ps-[2.875rem]' : 'ps-[2.125rem]') : (session.parentID ? 'ps-7' : 'ps-4');
      return (
        <React.Fragment key={session.id}>
          {parentTitle ? (
            <p dir="auto" className={cn('truncate oc-ui-start-align pt-2 pe-2 typography-micro text-muted-foreground', inTile ? 'ps-[2.125rem]' : 'ps-4')}>{parentTitle}</p>
          ) : null}
          <div className="flex items-center pe-1.5">
            <button
              type="button"
              className={cn('flex min-h-10 min-w-0 flex-1 items-center py-1 pe-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', indent)}
              style={{ touchAction: 'manipulation' }}
              onClick={() => openSession(session)}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span dir="auto" className="block truncate oc-ui-start-align typography-ui-label text-foreground">{title}</span>
                <span className="flex items-center gap-2.5 typography-micro text-muted-foreground">
                  {showGroup ? <span className="block min-w-0 flex-1 truncate">{labelOf(sessionDirectory)}</span> : null}
                  <span className="shrink-0 tabular-nums">
                    {formatSessionDateLabel(session.time?.archived ?? session.time?.updated ?? session.time?.created ?? Date.now())}
                  </span>
                </span>
              </span>
            </button>
            {restorable ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="w-10 shrink-0 px-0 text-muted-foreground"
                onClick={() => restoreSession(session)}
                aria-label={t('sessions.archivePage.restoreSessionAria', { title })}
                style={{ touchAction: 'manipulation' }}
              >
                <Icon name="inbox-unarchive" className="size-5" />
              </Button>
            ) : null}
          </div>
        </React.Fragment>
      );
    };
    const renderChip = (key: string, label: string, count: number, selected: boolean, onSelect: () => void, fromDeletedSpace = false) => (
      <Button
        key={key}
        type="button"
        variant="chip"
        size="sm"
        className="shrink-0"
        aria-pressed={selected}
        onClick={onSelect}
        style={{ touchAction: 'manipulation' }}
      >
        {fromDeletedSpace ? <Icon name="instance" className="size-3.5" /> : null}
        <span dir="auto" className="max-w-40 truncate">{label}</span>
        <span className="tabular-nums text-muted-foreground">{count}</span>
      </Button>
    );
=======
    const renderMobileSessionRow = (session: Session, index: number, rows: Session[], inTile: boolean) => {
      const sessionDirectory = normalizePath(resolveGlobalSessionDirectory(session)) ?? '';
      const title = session.title || t('sessions.sidebar.session.untitled');
      const restorable = !(spaceArchives?.has(sessionDirectory) ?? false);
      const parentTitle = parentTitleAbove(rows, index);
      const showGroup = selectedBucket === null;
      const indent = inTile ? (session.parentID ? 'ps-[2.875rem]' : 'ps-[2.125rem]') : (session.parentID ? 'ps-7' : 'ps-4');
      return (
        <React.Fragment key={session.id}>
          {parentTitle ? (
            <p dir="auto" className={cn('truncate oc-ui-start-align pt-2 pe-2 typography-micro text-muted-foreground', inTile ? 'ps-[2.125rem]' : 'ps-4')}>{parentTitle}</p>
          ) : null}
          <div className="flex items-center pe-1.5">
            <button
              type="button"
              className={cn('flex min-h-10 min-w-0 flex-1 items-center py-1 pe-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', indent)}
              style={{ touchAction: 'manipulation' }}
              onClick={() => openSession(session)}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span dir="auto" className="block truncate oc-ui-start-align typography-ui-label text-foreground">{title}</span>
                <span className="flex items-center gap-2.5 typography-micro text-muted-foreground">
                  {showGroup ? <span className="block min-w-0 flex-1 truncate">{labelOf(sessionDirectory)}</span> : null}
                  <span className="shrink-0 tabular-nums">
                    {formatSessionDateLabel(session.time?.archived ?? session.time?.updated ?? session.time?.created ?? Date.now())}
                  </span>
                </span>
              </span>
            </button>
            {restorable ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="w-10 shrink-0 px-0 text-muted-foreground"
                onClick={() => restoreSession(session)}
                aria-label={t('sessions.archivePage.restoreSessionAria', { title })}
                style={{ touchAction: 'manipulation' }}
              >
                <Icon name="inbox-unarchive" className="size-5" />
              </Button>
            ) : null}
          </div>
        </React.Fragment>
      );
    };
    const renderChip = (key: string, label: string, count: number | null, selected: boolean, onSelect: () => void, fromDeletedSpace = false) => (
      <Button
        key={key}
        type="button"
        variant="chip"
        size="sm"
        className="shrink-0"
        aria-pressed={selected}
        onClick={onSelect}
        style={{ touchAction: 'manipulation' }}
      >
        {fromDeletedSpace ? <Icon name="instance" className="size-3.5" /> : null}
        <span dir="auto" className="max-w-40 truncate">{label}</span>
        {count === null ? null : <span className="tabular-nums text-muted-foreground">{count}</span>}
      </Button>
    );
>>>>>>> upstream/main
    return (
<<<<<<< HEAD
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-1.5 px-3 pt-3">
          {searchInput}
          {totalCount > 0 || sessionsStatus === 'ready' ? (
            <p className="px-1 typography-micro text-muted-foreground">{countLabel}</p>
||||||| bc50ba56aa
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-2 pt-3">
          <div className="px-3">{searchInput}</div>
          {/* Groups filter while not searching; a search spans them all. */}
          {!normalizedQuery && buckets.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]">
              {renderChip('__all__', t('sessions.archivePage.all'), totalCount, selectedKey === null, () => selectBucket(null))}
              {buckets.map((bucket) => renderChip(
                bucket.key,
                bucket.label,
                bucket.sessions.length,
                selectedKey === bucket.key,
                () => selectBucket(bucket.key),
                bucket.kind === 'space',
              ))}
            </div>
          ) : null}
          {totalCount > 0 || sessionsStatus === 'ready' ? (
            <p className="px-4 typography-micro text-muted-foreground">{countLabel}</p>
=======
      <div data-archive-page="mobile" className="flex h-full min-h-0 flex-col">
        <div data-archive-toolbar className="shrink-0 space-y-2 pt-3">
          <div className="px-3">
            {searchInput}
            {hasSearchQuery && searchFailure ? <p data-archive-search-failure role="status" className="px-2.5 pt-1 typography-micro text-muted-foreground">{searchFailure}</p> : null}
          </div>
          {buckets.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]">
              {renderChip('__all__', t('sessions.archivePage.all'), hasSearchQuery ? searchCount : archiveCount, selectedKey === null, () => selectBucket(null))}
              {buckets.map((bucket) => renderChip(
                bucket.key,
                bucket.label,
                countForBucket(bucket),
                selectedKey === bucket.key,
                () => selectBucket(bucket.key),
                bucket.kind === 'space',
              ))}
            </div>
          ) : null}
          {countLabel && (archiveCount > 0 || sessionsStatus === 'ready') ? (
            <p data-archive-count role="status" className="px-4 typography-micro text-muted-foreground">{countLabel}</p>
>>>>>>> upstream/main
          ) : null}
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto pt-1"
          style={{ paddingBottom: 'calc(0.5rem + var(--oc-safe-area-bottom, 0px))' }}
        >
          {allWorktreeArchives.length > 0 ? (
            <div className="pb-1">
              {allWorktreeArchives.map(({ project, archive }) => (
                <ArchivedWorktreeRow
                  key={archive.id}
                  touch
                  archive={archive}
                  busy={archiveActions.busyIds.has(archive.id)}
                  onRestore={() => void archiveActions.restore(project, archive)}
                  onDelete={() => void archiveActions.remove(project, archive)}
                />
              ))}
            </div>
          ) : null}
<<<<<<< HEAD
          {discoveryErrorBanner}
          {visibleSessions.length === 0 && allWorktreeArchives.length === 0 ? emptyState : visibleSessions.map((session, index) => {
            const workspaceId = session.workspaceId;
            const sessionDirectory = normalizePath(resolveGlobalSessionDirectory(session)) ?? '';
            const title = session.title || t('sessions.sidebar.session.untitled');
            // A deleted space's chat has nowhere to be restored to.
            const restorable = !(spaceArchives?.has(workspaceId) ?? false);
            const parentTitle = parentTitleAbove(visibleSessions, index);
            return (
              <React.Fragment key={session.sessionId}>
                {parentTitle ? (
                  <p dir="auto" className="truncate text-left px-4 pt-2 typography-micro text-muted-foreground">{parentTitle}</p>
                ) : null}
                <div className="flex items-center pr-1.5">
                  <button
                    type="button"
                    className={cn(
                      'flex min-h-10 min-w-0 flex-1 items-center py-1 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      session.parentSessionId ? 'pl-7' : 'pl-4',
                    )}
                    style={{ touchAction: 'manipulation' }}
                    onClick={() => openSession(session)}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span dir="auto" className="block truncate text-left typography-ui-label text-foreground">{title}</span>
                      <span className="flex items-center gap-2.5 typography-micro text-muted-foreground">
                        <span className="block min-w-0 flex-1 truncate">{labelOf(workspaceId, sessionDirectory)}</span>
                        <span className="shrink-0 tabular-nums">{formatSessionDateLabel(session.archivedAt ?? session.updatedAt ?? session.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                  {restorable ? (
                    <Button type="button" variant="ghost" size="lg" className="w-10 shrink-0 px-0 text-muted-foreground"
                      onClick={() => restoreSession(session)}
                      aria-label={t('sessions.archivePage.restoreSessionAria', { title })}
                      style={{ touchAction: 'manipulation' }}>
                      <Icon name="inbox-unarchive" className="size-5" />
                    </Button>
                  ) : null}
                </div>
              </React.Fragment>
            );
          })}
||||||| bc50ba56aa
          {visibleSessions.length === 0 && worktreeGroups.length === 0
            ? emptyState
            : visibleSessions.map((session, index) => renderMobileSessionRow(session, index, visibleSessions, false))}
=======
          <div data-archive-search-results>
          {hasSearchQuery ? searchResultRows(true) : visibleSessions.length === 0 && worktreeGroups.length === 0
            ? emptyState
            : visibleSessions.map((session, index) => renderMobileSessionRow(session, index, visibleSessions, false))}
>>>>>>> upstream/main
          {showMoreButton}
<<<<<<< HEAD
        </div>
||||||| bc50ba56aa
        </ScrollableOverlay>
=======
          </div>
        </ScrollableOverlay>
>>>>>>> upstream/main
        {archiveActions.dialog}
      </div>
    );
  }

  const renderDirectoryItem = (
    key: string,
    label: string,
    count: number | null,
    isSelected: boolean,
    onSelect: () => void,
    fullPath?: string,
    sessionsForDelete?: Session[],
    fromDeletedSpace = false,
  ) => (
    <div key={key} className="group/dir relative">
      <button
        type="button"
        onClick={onSelect}
        title={fromDeletedSpace ? t('spaces.archive.groupTitle', { name: label }) : fullPath}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left typography-ui-label transition-[padding] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          sessionsForDelete ? 'group-hover/dir:pr-8 group-focus-within/dir:pr-8' : '',
          isSelected
            ? 'bg-interactive-selection text-foreground'
            : 'text-muted-foreground hover:bg-interactive-hover/50 hover:text-foreground',
        )}
      >
<<<<<<< HEAD
        {fromDeletedSpace ? <Icon name="box-3" className="h-3.5 w-3.5 flex-shrink-0" /> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="flex-shrink-0 typography-micro text-muted-foreground/70">{count}</span>
||||||| bc50ba56aa
        {fromDeletedSpace ? <Icon name="instance" className="h-3.5 w-3.5 flex-shrink-0" /> : null}
        <span dir="auto" className="oc-ui-start-align min-w-0 flex-1 truncate">{label}</span>
        <span className="flex-shrink-0 typography-micro text-muted-foreground">{count}</span>
=======
        {fromDeletedSpace ? <Icon name="instance" className="h-3.5 w-3.5 flex-shrink-0" /> : null}
        <span dir="auto" className="oc-ui-start-align min-w-0 flex-1 truncate">{label}</span>
        {count === null ? null : <span className="flex-shrink-0 typography-micro text-muted-foreground">{count}</span>}
>>>>>>> upstream/main
      </button>
      {sessionsForDelete ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => sessionEvents.requestDelete({ sessions: sessionsForDelete, mode: 'session' })}
              className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/dir:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('sessions.archivePage.deleteProjectAria', { label })}
            >
              <Icon name="delete-bin" className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>{t('sessions.archivePage.deleteProject')}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );

<<<<<<< HEAD
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        {/* Directory filter panel */}
        <div className="flex w-64 flex-shrink-0 flex-col border-r border-border/50">
          <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {renderDirectoryItem(
              '__all__',
              t('sessions.archivePage.allDirectories'),
              totalCount,
              selectedWorkspaceId === null,
              () => selectWorkspace(null),
            )}
            {buckets.map((bucket) => renderDirectoryItem(
              bucket.workspaceId,
              bucket.label,
              bucket.sessions.length,
              selectedWorkspaceId === bucket.workspaceId,
              () => selectWorkspace(bucket.workspaceId),
              bucket.directory || undefined,
              bucket.sessions,
              bucket.fromDeletedSpace,
            ))}
          </div>
        </div>

        {/* Session list */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 px-6 pt-3">
            <div className="min-w-0 flex-1">
              {searchInput}
            </div>
            {/* Pages have no close button: you leave via the sidebar. */}
            <span className="flex h-8 flex-shrink-0 items-center self-start typography-micro text-muted-foreground">
              {countLabel}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
            <div className="mx-auto w-full max-w-3xl space-y-0.5">
              {selectedWorktreeArchives.length > 0 && selectedProject ? (
                <div className="pb-1">
                  {selectedWorktreeArchives.map((archive) => (
                    <ArchivedWorktreeRow
                      key={archive.id}
                      archive={archive}
                      busy={archiveActions.busyIds.has(archive.id)}
                      onRestore={() => void archiveActions.restore(selectedProject, archive)}
                      onDelete={() => void archiveActions.remove(selectedProject, archive)}
                    />
                  ))}
                </div>
              ) : null}
              {discoveryErrorBanner}
              {visibleSessions.length === 0 && selectedWorktreeArchives.length === 0 ? emptyState : visibleSessions.map((session, index) => {
                const workspaceId = session.workspaceId;
                const sessionDirectory = normalizePath(resolveGlobalSessionDirectory(session)) ?? '';
                const directoryLabel = labelOf(workspaceId, sessionDirectory);
                const title = session.title || t('sessions.sidebar.session.untitled');
                // A deleted space's chat has nowhere to be restored to.
                const restorable = !(spaceArchives?.has(workspaceId) ?? false);
                const parentTitle = parentTitleAbove(visibleSessions, index);
                return (
                  <React.Fragment key={session.sessionId}>
                    {parentTitle ? (
                      <p dir="auto" className="truncate text-left px-2 pt-2 typography-micro text-muted-foreground">{parentTitle}</p>
                    ) : null}
                    <div
                      className={cn(
                        'group relative flex cursor-pointer items-center gap-3 rounded-md py-1 pr-2 transition-[padding] hover:bg-interactive-hover/40 hover:pr-14 focus-within:pr-14',
                        session.parentSessionId ? 'pl-6' : 'pl-2',
                      )}
                      onClick={() => openSession(session)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openSession(session);
                        }
                      }}
||||||| bc50ba56aa
  const renderSessionRow = (session: Session, index: number, rows: Session[], indent = false) => {
              const sessionDirectory = normalizePath(resolveGlobalSessionDirectory(session)) ?? '';
              const directoryLabel = sessionDirectory ? labelOf(sessionDirectory) : null;
              // A deleted space's chat has nowhere to be restored to.
              const restorable = !(spaceArchives?.has(sessionDirectory) ?? false);
              const parentTitle = parentTitleAbove(rows, index);
              return (
                <React.Fragment key={session.id}>
                  {parentTitle ? (
                    <p dir="auto" className={cn('truncate oc-ui-start-align pt-2 pe-2 typography-micro text-muted-foreground', indent ? 'ps-[1.875rem]' : 'ps-2')}>{parentTitle}</p>
                  ) : null}
                  <ContextMenu>
                    <ContextMenuTrigger
                      render={<div
                        className={cn(
                          'group relative flex cursor-pointer items-center gap-3 rounded-md py-1 pe-2 transition-[padding] hover:bg-interactive-hover/40 hover:pe-14 focus-within:pe-14',
                          // In a worktree's tile the titles line up with the worktree's name, past its icon.
                          indent ? (session.parentID ? 'ps-[2.875rem]' : 'ps-[1.875rem]') : (session.parentID ? 'ps-6' : 'ps-2'),
                        )}
                        onClick={() => openSession(session)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openSession(session);
                          }
                        }}
                      />}
=======
  const renderSessionRow = (session: Session, index: number, rows: Session[], indent = false) => {
              const sessionDirectory = normalizePath(resolveGlobalSessionDirectory(session)) ?? '';
              const restorable = !(spaceArchives?.has(sessionDirectory) ?? false);
              const parentTitle = parentTitleAbove(rows, index);
              return (
                <React.Fragment key={session.id}>
                  {parentTitle ? (
                    <p dir="auto" className={cn('truncate oc-ui-start-align pt-2 pe-2 typography-micro text-muted-foreground', indent ? 'ps-[1.875rem]' : 'ps-2')}>{parentTitle}</p>
                  ) : null}
                  <ContextMenu>
                    <ContextMenuTrigger
                      render={<div
                        className={cn(
                          'group relative flex cursor-pointer items-center gap-3 rounded-md py-1 pe-2 transition-[padding] hover:bg-interactive-hover/40 hover:pe-14 focus-within:pe-14',
                          indent ? (session.parentID ? 'ps-[2.875rem]' : 'ps-[1.875rem]') : (session.parentID ? 'ps-6' : 'ps-2'),
                        )}
                        onClick={() => openSession(session)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openSession(session);
                          }
                        }}
                      />}
>>>>>>> upstream/main
                    >
                      <span dir="auto" className="min-w-0 flex-1 truncate text-left typography-ui-label text-foreground">
                        {title}
                      </span>
<<<<<<< HEAD
                      {normalizedQuery && directoryLabel ? (
                        <span className="max-w-40 flex-shrink-0 truncate text-[0.72rem] text-muted-foreground/70" title={sessionDirectory}>
                          {directoryLabel}
                        </span>
                      ) : null}
                      <span className="flex-shrink-0 text-[0.72rem] text-muted-foreground/75">
                        {formatSessionDateLabel(session.archivedAt ?? session.updatedAt ?? session.createdAt)}
||||||| bc50ba56aa
                      {normalizedQuery && directoryLabel ? (
                        <span className="max-w-40 flex-shrink-0 truncate text-[0.72rem] text-muted-foreground" title={sessionDirectory}>
                          {directoryLabel}
                        </span>
                      ) : null}
                      <span className="flex-shrink-0 text-[0.72rem] text-muted-foreground">
                        {formatSessionDateLabel(session.time?.archived ?? session.time?.updated ?? session.time?.created ?? Date.now())}
=======
                      <span className="flex-shrink-0 text-[0.72rem] text-muted-foreground">
                        {formatSessionDateLabel(session.time?.archived ?? session.time?.updated ?? session.time?.created ?? Date.now())}
>>>>>>> upstream/main
                      </span>
                      {restorable ? <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          restoreSession(session);
                        }}
                        className="absolute right-7 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity pointer-events-none hover:text-foreground group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={t('sessions.archivePage.restoreSessionAria', { title })}
                      >
                        <Icon name="inbox-unarchive" className="h-3.5 w-3.5" />
                      </button> : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          sessionEvents.requestDelete({ sessions: [session], mode: 'session' });
                        }}
                        className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity pointer-events-none hover:text-destructive group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={t('sessions.archivePage.deleteSessionAria', { title })}
                      >
                        <Icon name="delete-bin" className="h-3.5 w-3.5" />
                      </button>
<<<<<<< HEAD
||||||| bc50ba56aa
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-[180px]">
                      <ContextMenuItem className="[&>svg]:me-1" onClick={() => copySessionId(session.id)}>
                        <Icon name="file-copy" className="me-1 h-4 w-4" />
                        {t('sessions.sidebar.session.menu.copyId')}
                      </ContextMenuItem>
                      {restorable ? (
                        <ContextMenuItem className="[&>svg]:me-1" onClick={() => restoreSession(session)}>
                          <Icon name="inbox-unarchive" className="me-1 h-4 w-4" />
                          {t('sessions.sidebar.bulkActions.restore')}
                        </ContextMenuItem>
                      ) : null}
                      <ContextMenuItem
                        className="text-destructive focus:text-destructive [&>svg]:me-1"
                        onClick={() => sessionEvents.requestDelete({ sessions: [session], mode: 'session' })}
                      >
                        <Icon name="delete-bin" className="me-1 h-4 w-4" />
                        {t('sessions.sidebar.bulkActions.delete')}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </React.Fragment>
              );
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        {/* Directory filter panel */}
        <div className="flex w-64 flex-shrink-0 flex-col border-e border-edge">
          <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-0.5 p-2" disableHorizontal>
            {renderDirectoryItem(
              '__all__',
              t('sessions.archivePage.all'),
              totalCount,
              selectedKey === null,
              () => selectBucket(null),
            )}
            {buckets.map((bucket) => renderDirectoryItem(
              bucket.key,
              bucket.label,
              bucket.sessions.length,
              selectedKey === bucket.key,
              () => selectBucket(bucket.key),
              bucket.directory || undefined,
              bucket.sessions.length > 0 ? bucket.sessions : undefined,
              bucket.kind === 'space',
            ))}
          </ScrollableOverlay>
        </div>

        {/* Session list */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The search shares the list's column, so the two line up. */}
          <div className="px-6 pt-3">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
              <div className="min-w-0 flex-1">
                {searchInput}
              </div>
              {/* Pages have no close button: you leave via the sidebar. */}
              <span className="flex h-8 flex-shrink-0 items-center self-start typography-micro text-muted-foreground">
                {countLabel}
              </span>
            </div>
          </div>

          <ScrollableOverlay outerClassName="min-h-0 flex-1" className="px-6 py-3" disableHorizontal>
            <div className="mx-auto w-full max-w-3xl space-y-0.5">
              {/* Each archived worktree is a tile holding its sessions; the loose sessions follow. */}
              {worktreeGroups.length > 0 ? (
                <div className={cn('space-y-2', visibleSessions.length > 0 && 'pb-3')}>
                  {worktreeGroups.map(({ archive, sessions: groupSessions }) => (
                    <div key={archive.id} className="oc-tile rounded-lg p-1">
                      <ArchivedWorktreeRow
                        archive={archive}
                        busy={archiveActions.busyIds.has(archive.id)}
                        onRestore={() => { if (selectedProject) void archiveActions.restore(selectedProject, archive); }}
                        onDelete={() => { if (selectedProject) void archiveActions.remove(selectedProject, archive); }}
                      />
                      {groupSessions.map((session, index) => renderSessionRow(session, index, groupSessions, true))}
=======
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-[180px]">
                      <ContextMenuItem className="[&>svg]:me-1" onClick={() => copySessionId(session.id)}>
                        <Icon name="file-copy" className="me-1 h-4 w-4" />
                        {t('sessions.sidebar.session.menu.copyId')}
                      </ContextMenuItem>
                      {restorable ? (
                        <ContextMenuItem className="[&>svg]:me-1" onClick={() => restoreSession(session)}>
                          <Icon name="inbox-unarchive" className="me-1 h-4 w-4" />
                          {t('sessions.sidebar.bulkActions.restore')}
                        </ContextMenuItem>
                      ) : null}
                      <ContextMenuItem
                        className="text-destructive focus:text-destructive [&>svg]:me-1"
                        onClick={() => sessionEvents.requestDelete({ sessions: [session], mode: 'session' })}
                      >
                        <Icon name="delete-bin" className="me-1 h-4 w-4" />
                        {t('sessions.sidebar.bulkActions.delete')}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </React.Fragment>
              );
  };

  return (
    <div data-archive-page="desktop" className="@container absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-64 flex-shrink-0 flex-col border-e border-edge @min-[42rem]:flex">
          <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-0.5 p-2" disableHorizontal>
            {renderDirectoryItem(
              '__all__',
              t('sessions.archivePage.all'),
              hasSearchQuery ? searchCount : archiveCount,
              selectedKey === null,
              () => selectBucket(null),
            )}
            {buckets.map((bucket) => renderDirectoryItem(
              bucket.key,
              bucket.label,
              countForBucket(bucket),
              selectedKey === bucket.key,
              () => selectBucket(bucket.key),
              bucket.directory || undefined,
              bucket.sessions.length > 0 ? bucket.sessions : undefined,
              bucket.kind === 'space',
            ))}
          </ScrollableOverlay>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div data-archive-toolbar className="px-6 pt-3">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
              <div className="min-w-0 flex-1">
                {searchInput}
              </div>
              {countLabel ? (
                <span data-archive-count role="status" className="hidden h-8 flex-shrink-0 items-center typography-micro text-muted-foreground @min-[42rem]:flex">
                  {countLabel}
                </span>
              ) : null}
            </div>
          </div>

          <ScrollableOverlay outerClassName="min-h-0 flex-1" className="px-6 py-3" disableHorizontal>
            <div data-archive-search-results className="mx-auto w-full max-w-3xl space-y-0.5">
              {worktreeGroups.length > 0 ? (
                <div className={cn('space-y-2', visibleSessions.length > 0 && 'pb-3')}>
                  {worktreeGroups.map(({ archive, sessions: groupSessions }) => (
                    <div key={archive.id} data-archive-worktree-tile={archive.id} className="oc-tile rounded-lg p-1">
                      <ArchivedWorktreeRow
                        archive={archive}
                        busy={archiveActions.busyIds.has(archive.id)}
                        onRestore={() => { if (selectedProject) void archiveActions.restore(selectedProject, archive); }}
                        onDelete={() => { if (selectedProject) void archiveActions.remove(selectedProject, archive); }}
                      />
                      {groupSessions.map((session, index) => renderSessionRow(session, index, groupSessions, true))}
>>>>>>> upstream/main
                    </div>
<<<<<<< HEAD
                  </React.Fragment>
                );
              })}
||||||| bc50ba56aa
                  ))}
                </div>
              ) : null}
              {visibleSessions.length === 0 && worktreeGroups.length === 0
                ? emptyState
                : visibleSessions.map((session, index) => renderSessionRow(session, index, visibleSessions))}
=======
                  ))}
                </div>
              ) : null}
              {hasSearchQuery ? searchResultRows(false) : visibleSessions.length === 0 && worktreeGroups.length === 0
                ? emptyState
                : visibleSessions.map((session, index) => renderSessionRow(session, index, visibleSessions))}
>>>>>>> upstream/main
              {showMoreButton}
            </div>
          </div>
        </div>
      </div>
      {archiveActions.dialog}
    </div>
  );
}

export function ArchiveView(): React.ReactNode {
  const open = useUIStore((state) => state.isArchivePageOpen);
  const openCount = useUIStore((state) => state.archivePageOpenCount);
  const setOpen = useUIStore((state) => state.setArchivePageOpen);
  const leave = React.useCallback(() => setOpen(false), [setOpen]);
  if (!open) return null;
  return <ArchiveSessionsView key={openCount} layout="page" onLeave={leave} />;
}
