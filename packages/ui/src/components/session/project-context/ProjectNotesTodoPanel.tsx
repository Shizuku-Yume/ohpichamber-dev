import React from 'react';

import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { useI18n } from '@/lib/i18n';
import { resolveProjectContextId, type ProjectRef, type ProjectTodoChange, type ProjectTodoItem } from '@/lib/projectContextApi';
import { observeProjectContext } from '@/lib/projectContextSync';
import { cn } from '@/lib/utils';
import { EMPTY_PROJECT_CONTEXT_ENTRY, useProjectContextStore } from '@/stores/useProjectContextStore';
import { useUIStore } from '@/stores/useUIStore';
import { TodoSendDialog } from '../TodoSendDialog';
import { NotesSection } from './NotesSection';
import { PlansSection } from './PlansSection';
import { TodosSection } from './TodosSection';
import { ContextPanelHeaderSlotProvider, ContextPanelHeaderToolbar } from '@/components/layout/contextPanelHeaderSlot';
import { useInContextPanelHeader } from '@/components/layout/contextPanelHeaderSlotContext';
import { useProjectTodoSend } from './useProjectTodoSend';
import { sortTodosWithCompletedLast } from './todoList';
import { KnowledgeSearchBar } from './KnowledgeSearchBar';
import { KnowledgeSplit } from './KnowledgeSplit';
import { Button } from '@/components/ui/button';
import { DelegatedTooltip } from '@/components/ui/row-tooltip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { noteDeleteKey, planDeleteKey, usePendingKnowledgeDeletes } from './pendingKnowledgeDeletes';
import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import { useSessionKnowledgePins } from './useSessionKnowledgePins';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

const ROW_TOOLTIP_CLASS = 'transition-none data-[starting-style]:opacity-100 data-[starting-style]:scale-100 data-[ending-style]:opacity-100 data-[ending-style]:scale-100';

const PlanView = React.lazy(() => import('@/components/views/PlanView').then((module) => ({ default: module.PlanView })));

interface ProjectNotesTodoPanelProps {
  projectRef: ProjectRef | null;
  visible?: boolean;
  projectLabel?: string | null;
  canCreateWorktree?: boolean;
  onActionComplete?: () => void;
  onOpenPlan?: (plan: { id: string; title: string; projectRef: ProjectRef }) => void;
  className?: string;
}

type ProjectContextTab = 'notes' | 'todos' | 'plans';

const TAB_ORDER: ProjectContextTab[] = ['notes', 'todos', 'plans'];

const SPLIT_MIN_WIDTH = 1040;

export const ProjectNotesTodoPanel: React.FC<ProjectNotesTodoPanelProps> = ({
  projectRef,
  visible = true,
  projectLabel,
  canCreateWorktree = false,
  onActionComplete,
  onOpenPlan,
  className,
}) => {
  const inPanelHeader = useInContextPanelHeader();
  const { t } = useI18n();

  const projectContextId = React.useMemo(() => resolveProjectContextId(projectRef), [projectRef]);
  const contextEntry = useProjectContextStore(
    (state) => (projectContextId ? state.entries[projectContextId] : undefined) ?? EMPTY_PROJECT_CONTEXT_ENTRY,
  );
  const saveTodos = useProjectContextStore((state) => state.saveTodos);
  const { pinnedNoteIds, pinnedPlanIds, togglePin: toggleSessionPin } = useSessionKnowledgePins();

  const isMobile = useUIStore((state) => state.isMobile);
  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const attachRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRootNode(node);
  }, []);
  const [panelWidth, setPanelWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const root = rootNode;
    if (!root) return;
    setPanelWidth(root.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setPanelWidth(entry.contentRect.width);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootNode]);
  const wide = !isMobile && panelWidth >= SPLIT_MIN_WIDTH;
  const [sectionsNode, setSectionsNode] = React.useState<HTMLElement | null>(null);
  const [allLabelsMeasureNode, setAllLabelsMeasureNode] = React.useState<HTMLDivElement | null>(null);
  const [activeLabelMeasureNode, setActiveLabelMeasureNode] = React.useState<HTMLDivElement | null>(null);
  const [sectionLabels, setSectionLabels] = React.useState<'all' | 'active' | 'none'>('all');
  React.useLayoutEffect(() => {
    if (!sectionsNode || !allLabelsMeasureNode || !activeLabelMeasureNode) return;
    const update = () => {
      const available = sectionsNode.clientWidth;
      setSectionLabels(
        allLabelsMeasureNode.offsetWidth <= available ? 'all'
          : activeLabelMeasureNode.offsetWidth <= available ? 'active'
            : 'none',
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(sectionsNode);
    observer.observe(allLabelsMeasureNode);
    observer.observe(activeLabelMeasureNode);
    return () => observer.disconnect();
  }, [sectionsNode, allLabelsMeasureNode, activeLabelMeasureNode]);
  const storedTab = useUIStore((state) => state.projectContextTab);
  const setStoredTab = useUIStore((state) => state.setProjectContextTab);
  const activeTab: ProjectContextTab = TAB_ORDER.includes(storedTab as ProjectContextTab)
    ? storedTab as ProjectContextTab
    : 'notes';
  // Todos open nothing, so they never split.
  const split = wide && activeTab !== 'todos';

  const [query, setQuery] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchFocusRequest, setSearchFocusRequest] = React.useState(0);
  const closeSearch = React.useCallback(() => {
    setSearchOpen(false);
    setQuery('');
  }, []);
  const toggleSearch = React.useCallback(() => {
    if (searchOpen) {
      closeSearch();
      return;
    }
    setSearchOpen(true);
    setSearchFocusRequest((request) => request + 1);
  }, [closeSearch, searchOpen]);
  const [openEntry, setOpenEntry] = React.useState<{ section: ProjectContextTab; id: string } | null>(null);
  const openIdIn = (section: ProjectContextTab): string | null => (
    openEntry?.section === section && activeTab === section ? openEntry.id : null
  );
  const openPlanId = openIdIn('plans');
  const listScrollerRef = React.useRef<HTMLDivElement | null>(null);
  const returnPointRef = React.useRef<{ section: ProjectContextTab; id: string; scrollTop: number } | null>(null);
  const openEntryIn = React.useCallback((section: ProjectContextTab, id: string | null) => {
    if (id) {
      returnPointRef.current = { section, id, scrollTop: listScrollerRef.current?.scrollTop ?? 0 };
    }
    setOpenEntry(id ? { section, id } : null);
  }, []);
  const openNote = React.useCallback((id: string | null) => openEntryIn('notes', id), [openEntryIn]);
  const openPlan = React.useCallback((plan: { id: string }) => openEntryIn('plans', plan.id), [openEntryIn]);
  const openPlanFromTodo = React.useCallback((planId: string) => {
    const plan = contextEntry.plans.find((entry) => entry.id === planId);
    if (!plan || !projectRef) return;
    if (onOpenPlan) {
      onOpenPlan({ id: plan.id, title: plan.title, projectRef });
      return;
    }
    setStoredTab('plans');
    openEntryIn('plans', plan.id);
  }, [contextEntry.plans, onOpenPlan, openEntryIn, projectRef, setStoredTab]);
  const [planViewGeneration, setPlanViewGeneration] = React.useState(0);
  const openEntryRef = React.useRef({ entry: openEntry, projectContextId });
  openEntryRef.current = { entry: openEntry, projectContextId };
  const handlePlanMoved = React.useCallback((projectId: string, previousId: string, movedId: string) => {
    const { entry: current, projectContextId: shownProjectId } = openEntryRef.current;
    if (shownProjectId !== projectId || current?.section !== 'plans' || current.id !== previousId) return;
    setOpenEntry({ section: 'plans', id: movedId });
    setPlanViewGeneration((generation) => generation + 1);
  }, []);
  const trimmedQuery = query.trim().toLowerCase();

  const todos = React.useMemo(
    () => sortTodosWithCompletedLast(contextEntry.todos),
    [contextEntry.todos],
  );
  const isLoading = contextEntry.loading && !contextEntry.loaded;

  const pendingDeletes = usePendingKnowledgeDeletes();
  const counts = React.useMemo(() => ({
    notes: contextEntry.notes.filter((note) => (
      !(projectRef && pendingDeletes.has(noteDeleteKey(projectRef, note.id))) && matchesRankQuery([note.body], query)
    )).length,
    todos: todos.filter((todo) => matchesRankQuery([todo.text], query)).length,
    plans: contextEntry.plans.filter((plan) => (
      !(projectRef && pendingDeletes.has(planDeleteKey(projectRef, plan.id))) && matchesRankQuery([plan.title], query)
    )).length,
  }), [contextEntry.notes, contextEntry.plans, pendingDeletes, projectRef, query, todos]);


  const send = useProjectTodoSend({ projectRef, canCreateWorktree, onActionComplete });

  React.useEffect(() => {
    if (!projectRef || !visible) {
      return;
    }
    return observeProjectContext(projectRef);
  }, [projectRef, visible]);

  const reportedErrorRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!contextEntry.error) {
      reportedErrorRef.current = null;
      return;
    }
    if (reportedErrorRef.current === contextEntry.error) {
      return;
    }
    reportedErrorRef.current = contextEntry.error;
    if (!contextEntry.loaded) {
      toast.error(t('rightSidebar.contextNotesTodo.toast.loadNotesFailed'));
    }
  }, [contextEntry.error, contextEntry.loaded, t]);

  const listShown = openEntry === null || openEntry.section !== activeTab;
  React.useLayoutEffect(() => {
    const point = returnPointRef.current;
    if (!point || !listShown) return;
    returnPointRef.current = null;
    if (point.section !== activeTab) return;
    const scroller = listScrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = point.scrollTop;
    const card = Array.from(scroller.querySelectorAll<HTMLElement>('[data-knowledge-entry-id]'))
      .find((element) => element.dataset.knowledgeEntryId === point.id);
    const target = card && card.tabIndex >= 0 ? card : card?.querySelector<HTMLElement>('button');
    target?.focus({ preventScroll: true });
  }, [activeTab, listShown]);

  React.useEffect(() => {
    setOpenEntry(null);
  }, [projectContextId]);

  React.useEffect(() => {
    setOpenEntry((current) => (current && current.section !== activeTab ? null : current));
  }, [activeTab]);

  const planRequest = useUIStore((state) => state.projectKnowledgePlanRequest);
  React.useEffect(() => {
    if (!planRequest || planRequest.projectContextId !== projectContextId || activeTab !== 'plans') return;
    useUIStore.getState().clearProjectKnowledgePlanRequest();
    openEntryIn('plans', planRequest.planId);
  }, [activeTab, openEntryIn, planRequest, projectContextId]);

  React.useEffect(() => {
    closeSearch();
  }, [closeSearch, projectContextId]);

  const followedQueryRef = React.useRef('');
  React.useEffect(() => {
    if (trimmedQuery === followedQueryRef.current) {
      return;
    }
    followedQueryRef.current = trimmedQuery;
    if (!trimmedQuery || counts[activeTab] > 0) {
      return;
    }
    const withMatches = TAB_ORDER.find((tab) => counts[tab] > 0);
    if (withMatches) {
      setStoredTab(withMatches);
    }
  }, [activeTab, counts, setStoredTab, trimmedQuery]);

  const handlePersistTodos = React.useCallback(
    // The change kind is part of the section's callback contract; the store
    // serializes and rolls back the whole list itself.
    (nextTodos: ProjectTodoItem[], _change?: ProjectTodoChange) => {
      if (!projectRef) {
        return;
      }
      // The store owns per-project write serialization and rollback; the panel
      // only decides what to persist and how to report a failure.
      void saveTodos(projectRef, nextTodos).then((saved) => {
        if (!saved) {
          toast.error(t('rightSidebar.contextNotesTodo.toast.saveNotesFailed'));
        }
      });
    },
    [projectRef, saveTodos, t]
  );

  const sections: Array<{ id: ProjectContextTab; icon: IconName; label: string; tooltip: string; count: number }> = React.useMemo(() => ([
    { id: 'notes', icon: 'sticky-note', label: t('rightSidebar.contextNotesTodo.tabs.notes'), tooltip: t('contextTooltips.workspace.section.notes'), count: counts.notes },
    { id: 'todos', icon: 'checkbox-circle', label: t('rightSidebar.contextNotesTodo.tabs.todos'), tooltip: t('contextTooltips.workspace.section.todos'), count: counts.todos },
    { id: 'plans', icon: 'file-text', label: t('rightSidebar.contextNotesTodo.tabs.plans'), tooltip: t('contextTooltips.workspace.section.plans'), count: counts.plans },
  ]), [counts, t]);

  if (!projectRef) {
    return (
      <div className={cn('w-full min-w-0 p-3', className)}>
        <p className="typography-meta text-muted-foreground">
          {t('rightSidebar.contextNotesTodo.empty.selectProject')}
        </p>
      </div>
    );
  }

  const entryOpen = openIdIn(activeTab) !== null;
  const showSearchBar = searchOpen && (split || !entryOpen);

  const projectTitle = projectLabel?.trim()
    || projectRef.path.split('/').filter(Boolean).pop()
    || projectRef.path;
  const searchLabel = t('rightSidebar.contextNotesTodo.search.placeholderInProject', { project: projectTitle });
  const nothingFound = trimmedQuery.length > 0 && sections.every((section) => section.count === 0);

  const renderSectionTab = (section: typeof sections[number], showLabel: boolean, interactive: boolean) => {
    const isActive = activeTab === section.id;
    const tab = (
      <button
        key={section.id}
        type="button"
        tabIndex={interactive ? undefined : -1}
        onClick={interactive ? () => setStoredTab(section.id) : undefined}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex h-7 flex-shrink-0 items-center gap-1.5 rounded-md px-2 transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive
            ? 'oc-selected'
            : 'text-muted-foreground hover:text-foreground hover:bg-interactive-hover',
        )}
      >
        <Icon name={section.icon} className="h-3.5 w-3.5 flex-shrink-0" />
        <span className={showLabel ? 'whitespace-nowrap typography-meta' : 'sr-only'}>{section.label}</span>
        <span className="typography-micro opacity-70">{section.count}</span>
      </button>
    );
    if (!interactive) return tab;
    return (
      <Tooltip key={section.id}>
        <TooltipTrigger asChild>{tab}</TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {section.tooltip}
        </TooltipContent>
      </Tooltip>
    );
  };

  const toolbar = (
    <div className="relative flex min-w-0 flex-1 items-center gap-1 pe-1">
      <nav
        ref={setSectionsNode}
        className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        aria-label={t('rightSidebar.contextNotesTodo.sections.label')}
      >
        {sections.map((section) => renderSectionTab(
          section,
          activeTab === section.id
            ? sectionLabels !== 'none'
            : !isMobile && sectionLabels === 'all',
          true,
        ))}
      </nav>
      <div aria-hidden="true" className="pointer-events-none invisible absolute start-0 top-0 h-0 w-0 overflow-hidden">
        <div ref={setAllLabelsMeasureNode} className="flex w-max items-center gap-1">
          {sections.map((section) => renderSectionTab(section, true, false))}
        </div>
        <div ref={setActiveLabelMeasureNode} className="flex w-max items-center gap-1">
          {sections.map((section) => renderSectionTab(section, activeTab === section.id, false))}
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleSearch}
            aria-pressed={searchOpen}
            className={cn('h-7 w-7 flex-shrink-0 p-0', searchOpen && 'bg-interactive-selection text-interactive-selection-foreground')}
            aria-label={searchLabel}
          >
            <Icon name="search" className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>{searchOpen ? t('chat.search.close') : searchLabel}</TooltipContent>
      </Tooltip>
    </div>
  );

  const plansList = (
    <PlansSection
      projectRef={projectRef}
      plans={contextEntry.plans}
      query={query}
      pinnedPlanIds={pinnedPlanIds}
      onTogglePinned={(planId, pinned) => toggleSessionPin('plan', planId, pinned)}
      selectedPlanId={split ? openPlanId : null}
      onPlanMoved={handlePlanMoved}
      onOpenPlan={onOpenPlan ?? openPlan}
    />
  );

  const planView = (planId: string) => (
    <React.Suspense fallback={null}>
      <ContextPanelHeaderSlotProvider value={null}>
        <PlanView
          key={`${planId}:${planViewGeneration}`}
          savedProjectPlan={{ projectRef, planId }}
          onNavigatedToChat={() => setOpenEntry(null)}
        />
      </ContextPanelHeaderSlotProvider>
    </React.Suspense>
  );

  return (
    <div ref={attachRoot} className={cn('flex h-full min-h-0 w-full min-w-0 flex-col', className)}>
      {inPanelHeader ? (
        <ContextPanelHeaderToolbar>{toolbar}</ContextPanelHeaderToolbar>
      ) : (
        <div className="flex flex-shrink-0 px-3 pt-2">{toolbar}</div>
      )}

      <div className="relative min-h-0 min-w-0 flex-1">
        {showSearchBar ? (
          // Over the list column in the split layout, so it never covers the
          // open entry's toolbar.
          <div className={cn('pointer-events-none absolute top-2 z-20', split ? 'inset-s-3' : 'inset-e-3')}>
            <KnowledgeSearchBar
              query={query}
              onQueryChange={setQuery}
              placeholder={searchLabel}
              nothingFound={nothingFound}
              focusRequest={searchFocusRequest}
              onClose={closeSearch}
            />
          </div>
        ) : null}
        {/* An open entry scrolls itself; nesting it in this scroller would give
          the panel two scrollbars for one document. In the split layout each
          column scrolls itself. */}
        <ScrollableOverlay
          ref={listScrollerRef}
          outerClassName="h-full min-w-0"
          className={cn(split ? 'overflow-hidden' : cn('p-3', entryOpen && 'overflow-hidden'))}
          disableHorizontal
        >
          {activeTab === 'notes' ? (
            <NotesSection
              projectRef={projectRef}
              notes={contextEntry.notes}
              disabled={isLoading}
              query={query}
              pinnedNoteIds={pinnedNoteIds}
              onTogglePinned={(noteId, pinned) => toggleSessionPin('note', noteId, pinned)}
              openNoteId={openIdIn('notes')}
              onOpenNote={openNote}
              split={split}
            />
          ) : null}

          {activeTab === 'todos' ? (
            // Todos open nothing, so a wide panel gets one column of readable
            // width instead of rows stretched edge to edge.
            <div className={cn(wide && 'mx-auto max-w-3xl')}>
              <TodosSection
                projectPath={projectRef?.path ?? ''}
                plans={contextEntry.plans}
                onOpenPlan={openPlanFromTodo}
                todos={todos}
                query={query}
                disabled={isLoading}
                canCreateWorktree={canCreateWorktree}
                sendingTodoId={send.sendingTodoId}
                onPersistTodos={handlePersistTodos}
                onSendToCurrentSession={send.sendToCurrentSession}
                onSendToNewSession={send.sendToNewSession}
                onSendToNewWorktreeSession={send.sendToNewWorktreeSession}
              />
            </div>
          ) : null}


          {activeTab === 'plans' ? (
            split ? (
              <KnowledgeSplit
                list={plansList}
                detail={openPlanId ? planView(openPlanId) : null}
                emptyLabel={t('rightSidebar.contextNotesTodo.plans.selectHint')}
              />
            ) : openPlanId ? planView(openPlanId) : plansList
          ) : null}
        </ScrollableOverlay>
      </div>

      <DelegatedTooltip containerRef={rootRef} className={ROW_TOOLTIP_CLASS} />

      <TodoSendDialog
        open={send.pendingSendTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            send.closeDialog();
          }
        }}
        target={send.pendingSendTarget?.kind ?? 'session'}
        projectDirectory={projectRef.path}
        submitting={send.isSubmitting}
        onConfirm={send.confirmSend}
      />
    </div>
  );
};
