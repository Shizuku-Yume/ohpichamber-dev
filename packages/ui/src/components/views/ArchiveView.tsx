import type { SidebarSessionLocation } from '@/components/session/sidebar/recent/sessionLocation';
import type { ConversationResult } from '@/hooks/useConversationSearch';
import type { ConversationResultContext } from '@/components/search/conversationResultContext';
import type { OmniAuthor } from '@/lib/search/omniQuery';
import { useMessageSearch } from '@/hooks/useMessageSearch';
import { ConversationResultRow } from '@/components/search/ConversationResultRow';
import { MatchHighlight } from '@/components/ui/MatchHighlight';
import { leadWithMatch } from '@/lib/messageSearch';
import { splitSnippet } from '@/lib/messageSearch';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { SearchStatusMark } from '@/components/search/SearchStatusMark';
import { SearchInMenu } from '@/components/search/SearchInMenu';
import { openSessionLink } from '@/lib/router/openSessionFromRoute';
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
import { isRestorableOnItsOwn } from '@/sync/session-restore-rule';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { loadWorktreeArchives, useWorktreeArchivesByProject } from '@/lib/worktrees/worktreeArchive';
import type { ProjectRef } from '@/lib/worktrees/worktreeManager';
import { ArchivedWorktreeRow } from './archive/ArchivedWorktreeRow';
import { useWorktreeArchiveActions } from './archive/useWorktreeArchiveActions';

type WorkspaceBucket = {
  workspaceId: string;
  directory: string;
  label: string;
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
  // Narrow selections: the cache's entity map changes with every active
  // session update, and the page only depends on which archived sessions are
  // listed and on their parents' titles.
  const listedSessions = useGlobalSessionsStore(useShallow((state) => state.archivedSessions
    .filter((session) => isRestorableOnItsOwn(session, state.entityById))));
  const parentTitlePairs = useGlobalSessionsStore(useShallow((state) => state.archivedSessions.flatMap((session) => {
    const parent = session.parentSessionId ? state.entityById.get(session.parentSessionId) : undefined;
    return parent ? [parent.sessionId, parent.title ?? ''] : [];
  })));
  const sessionsStatus = useGlobalSessionsStore((state) => state.status);
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
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const projects = useProjectsStore((state) => state.projects);
  const archivesByProject = useWorktreeArchivesByProject();
  const archiveActions = useWorktreeArchiveActions();

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

  const normalizedQuery = query.trim().toLowerCase();
  // A subsession under an archived parent comes back with that parent and is
  // not listed. One archived while its parent stays active would otherwise
  // show nowhere, so it is listed under its parent's title and restored alone.
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

  const buckets = React.useMemo<WorkspaceBucket[]>(() => {
    const byWorkspaceId = new Map<string, WorkspaceBucket>();
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
    }
    return [...byWorkspaceId.values()].sort((a, b) => b.sessions.length - a.sessions.length);
  }, [archivesByProject, labelOf, projects, sortedSessions, spaceArchives]);

  // Search spans every archived session; the workspace filter applies only while not searching.
  const filteredSessions = React.useMemo(() => {
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

  const visibleSessions = filteredSessions.slice(0, visibleCount);
  const remainingCount = filteredSessions.length - visibleSessions.length;
  const totalCount = sortedSessions.length;
  const isFailed = sessionsStatus === 'error' || (totalCount === 0 && hasDiscoveryErrors);

  const selectWorkspace = React.useCallback((workspaceId: string | null) => {
    setSelectedWorkspaceId(workspaceId);
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

  const emptyLabel = () => {
    if (totalCount === 0 && (sessionsStatus === 'error' || hasDiscoveryErrors)) return t('sessions.sidebar.group.empty.loadFailed');
    if (totalCount === 0 && sessionsStatus !== 'ready') return t('sessions.sidebar.group.empty.loadingSessions');
    return normalizedQuery ? t('sessions.archivePage.empty.noMatches') : t('sessions.archivePage.empty.noArchived');
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
      className={cn(
        'flex items-center justify-start rounded-md text-left text-muted-foreground/70 leading-tight hover:text-foreground hover:underline',
        layout === 'mobile' ? 'min-h-10 px-3 typography-micro' : 'mt-1 px-2 py-1 text-xs',
      )}>
      {t('sessions.sidebar.group.showMore')}
    </button>
  ) : null;
  if (layout === 'mobile') {
    // One column: no directory panel, so every row names its project. Touch
    // has no hover, so Restore is always visible. Deleting stays on desktop,
    // whose confirmation dialog the mobile shell does not mount.
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-1.5 px-3 pt-3">
          {searchInput}
          {totalCount > 0 || sessionsStatus === 'ready' ? (
            <p className="px-1 typography-micro text-muted-foreground">{countLabel}</p>
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
          {showMoreButton}
        </div>
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
        {fromDeletedSpace ? <Icon name="box-3" className="h-3.5 w-3.5 flex-shrink-0" /> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="flex-shrink-0 typography-micro text-muted-foreground/70">{count}</span>
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
                    >
                      <span dir="auto" className="min-w-0 flex-1 truncate text-left typography-ui-label text-foreground">
                        {title}
                      </span>
                      {normalizedQuery && directoryLabel ? (
                        <span className="max-w-40 flex-shrink-0 truncate text-[0.72rem] text-muted-foreground/70" title={sessionDirectory}>
                          {directoryLabel}
                        </span>
                      ) : null}
                      <span className="flex-shrink-0 text-[0.72rem] text-muted-foreground/75">
                        {formatSessionDateLabel(session.archivedAt ?? session.updatedAt ?? session.createdAt)}
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
                    </div>
                  </React.Fragment>
                );
              })}
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
