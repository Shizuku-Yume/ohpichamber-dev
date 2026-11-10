import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import React from 'react';

import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { requestFileAccess } from '@/lib/desktop';
import { getCurrentIntlLocale, useI18n } from '@/lib/i18n';
import { parsePlanMarkdown, resolveProjectContextId, type ProjectPlanLink, type ProjectRef } from '@/lib/projectContextApi';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { cn } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectContextStore } from '@/stores/useProjectContextStore';
<<<<<<< HEAD
import { useUIStore } from '@/stores/useUIStore';
=======
import { KnowledgeComposer } from './KnowledgeComposer';
import { KNOWLEDGE_ICON_BUTTON_CLASS } from './knowledgeRowStyle';
import { KnowledgeMenu, KnowledgePinToggle, KnowledgeRowContextMenu } from './KnowledgeActions';
import { ButtonTooltip } from '@/components/ui/action-toolbar';
import { formatKnowledgeDate } from './knowledgeFormat';
import { planDeleteKey, scheduleKnowledgeDelete, usePendingKnowledgeDeletes } from './pendingKnowledgeDeletes';

/**
 * Agents tick plan steps with their own file tools, which announce nothing,
 * so the list re-reads while it is on screen. The server answers with each
 * plan's step counts, never its text, and re-reads only files that changed.
 */
const PLAN_LIST_REFRESH_MS = 10_000;

/** Ticked steps of the plan's `## Steps` checklist, or Done once all are. */
const PlanProgressLabel: React.FC<{ progress: ProjectPlanProgress }> = ({ progress }) => {
  const { t } = useI18n();
  if (progress.done >= progress.total) {
    return (
      <span className="shrink-0 typography-micro px-1 rounded leading-none pb-px text-[var(--status-success)] bg-[var(--status-success)]/15">
        {t('rightSidebar.contextNotesTodo.plans.progress.done')}
      </span>
    );
  }
  return (
    <span
      className="shrink-0 typography-micro tabular-nums text-muted-foreground"
      title={t('rightSidebar.contextNotesTodo.plans.progress.title', { done: progress.done, total: progress.total })}
    >
      {`${progress.done}/${progress.total}`}
    </span>
  );
};
>>>>>>> bc50ba56a

/**
 * Saved plan markdown for the project.
 *
 * Plan mutations touch neither notes nor todos, so this section talks to the
 * store directly instead of routing writes through the container.
 */
export const PlansSection: React.FC<{
  projectRef: ProjectRef;
  plans: ProjectPlanLink[];
  /** Panel-wide filter, matched against plan titles. */
  query: string;
  /** Hosts without a ContextPanel (mobile) render their own plan viewer. The
      plan carries its owner so the host viewer never guesses the project. */
  onOpenPlan?: (plan: { id: string; title: string; projectRef: ProjectRef }) => void;
  pinnedPlanIds: ReadonlySet<string>;
  onTogglePinned: (planId: string, pinned: boolean) => Promise<boolean>;
}> = ({ projectRef, plans, query, onOpenPlan, pinnedPlanIds, onTogglePinned }) => {
  const { t } = useI18n();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const [deletingPlanId, setDeletingPlanId] = React.useState<string | null>(null);
  const createPlan = useProjectContextStore((state) => state.createPlan);
  const removePlan = useProjectContextStore((state) => state.deletePlan);
  const movePlan = useProjectContextStore((state) => state.movePlan);
  const [movingPlanId, setMovingPlanId] = React.useState<string | null>(null);

  // A plan changes id when it moves between the two folders; the list reloads
  // from the returned context, so nothing here tracks the new id.
  const handleMovePlan = React.useCallback(
    async (plan: ProjectPlanLink) => {
      if (movingPlanId) return;
      const direction = plan.source === 'shared' ? 'unshare' : 'share';
      setMovingPlanId(plan.id);
      try {
        const ok = await movePlan(projectRef, plan.id, direction);
        if (!ok) {
          const detail = useProjectContextStore.getState().getEntry(projectRef).error;
          toast.error(t('rightSidebar.contextNotesTodo.toast.movePlanFailed'), detail ? { description: detail } : undefined);
        }
      } finally {
        setMovingPlanId(null);
      }
    },
    [movePlan, movingPlanId, projectRef, t],
  );
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);

  const handleDeletePlan = React.useCallback(
    async (planId: string) => {
      if (deletingPlanId) {
        return;
      }
      setDeletingPlanId(planId);
      try {
        const ok = await removePlan(projectRef, planId);
        if (!ok) {
          toast.error(t('rightSidebar.contextNotesTodo.toast.deletePlanFailed'));
        }
      } finally {
        setDeletingPlanId(null);
      }
    },
    [deletingPlanId, projectRef, removePlan, t]
  );

  // Imported files arrive as a whole markdown document; split it the same way
  // the server would so the stored plan keeps the author's heading.
  const importPlanFromText = React.useCallback(
    async (text: string, fallbackTitle: string) => {
      if (!text.trim()) {
        toast.error(t('rightSidebar.contextNotesTodo.toast.planFileEmpty'));
        return;
      }
      const parsed = parsePlanMarkdown(text, fallbackTitle || t('rightSidebar.contextNotesTodo.plan.defaultTitle'));
      const created = await createPlan(projectRef, { title: parsed.title, body: parsed.body });
      if (!created) {
        toast.error(t('rightSidebar.contextNotesTodo.toast.importPlanFailed'));
        return;
      }
      toast.success(t('rightSidebar.contextNotesTodo.toast.planImported'));
    },
    [createPlan, projectRef, t]
  );

  const handleTriggerImport = React.useCallback(async () => {
    if (isImporting) {
      return;
    }
    const result = await requestFileAccess({
      defaultPath: projectRef.path,
      filters: [
        { name: t('contextTooltips.workspace.plans.filterPlanFiles'), extensions: ['md', 'markdown', 'txt'] },
        { name: t('contextTooltips.workspace.plans.filterAllFiles'), extensions: ['*'] },
      ],
    });

    if (result.success && result.path) {
      setIsImporting(true);
      try {
        const params = new URLSearchParams({ path: result.path, allowOutsideWorkspace: 'true' });
        if (result.outsideFileGrant) {
          params.set('outsideFileGrant', result.outsideFileGrant);
        }
        const response = await runtimeFetch(`/api/fs/read?${params.toString()}`, { cache: 'no-store' });
        if (!response.ok) {
          toast.error(t('rightSidebar.contextNotesTodo.toast.readPlanFileFailed'));
          return;
        }
        const text = await response.text();
        const fallbackTitle = result.path.split('/').pop()?.replace(/\.(md|markdown|txt)$/i, '').trim() || '';
        await importPlanFromText(text, fallbackTitle);
      } catch (error) {
        const description = error instanceof Error ? error.message : undefined;
        toast.error(t('rightSidebar.contextNotesTodo.toast.readPlanFileFailed'), description ? { description } : undefined);
      } finally {
        setIsImporting(false);
      }
      return;
    }

    if (result.error === 'Native file picker not available') {
      // Fall back to the HTML file input for web/non-desktop runtimes.
      fileInputRef.current?.click();
    }
  }, [importPlanFromText, isImporting, projectRef.path, t]);

  const handleUploadFile = React.useCallback(
    async (file: File | null) => {
      if (!file) {
        return;
      }
      setIsImporting(true);
      try {
        const text = await file.text();
        const fallbackTitle = file.name.replace(/\.(md|markdown|txt)$/i, '').trim();
        await importPlanFromText(text, fallbackTitle);
      } catch (error) {
        const description = error instanceof Error ? error.message : undefined;
        toast.error(t('rightSidebar.contextNotesTodo.toast.readPlanFileFailed'), description ? { description } : undefined);
      } finally {
        setIsImporting(false);
      }
    },
    [importPlanFromText, t]
  );

  const handleTogglePinned = React.useCallback(
    async (planId: string, pinned: boolean) => {
      const ok = await onTogglePinned(planId, pinned);
      if (!ok) {
        const detail = useProjectContextStore.getState().getEntry(projectRef).error;
        toast.error(t('rightSidebar.contextNotesTodo.toast.updatePlanFailed'), detail ? { description: detail } : undefined);
      }
    },
    [onTogglePinned, projectRef, t]
  );

  const visiblePlans = React.useMemo(
    () => plans.filter((plan) => matchesRankQuery([plan.title], query)),
    [plans, query],
  );

  const handleOpenPlan = React.useCallback(
    (plan: ProjectPlanLink) => {
      if (onOpenPlan) {
        onOpenPlan({ id: plan.id, title: plan.title, projectRef });
        return;
      }
      const panelDirectory = currentDirectory?.trim() || projectRef.path.trim();
      if (!panelDirectory) {
        return;
      }
      useUIStore.getState().openProjectKnowledgePlan(panelDirectory, resolveProjectContextId(projectRef), plan.id);
    },
    [currentDirectory, onOpenPlan, projectRef]
  );

  return (
    <div className="space-y-2">
<<<<<<< HEAD
      <div className="flex items-center justify-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void handleUploadFile(file);
            event.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          onClick={handleTriggerImport}
          disabled={isImporting}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('rightSidebar.contextNotesTodo.plans.importFromFile')}
          title={t('rightSidebar.contextNotesTodo.plans.importFromFile')}
        >
          <Icon name="add" className="h-3.5 w-3.5" />
        </button>
      </div>
=======
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleUploadFile(file);
          event.currentTarget.value = '';
        }}
      />
      <KnowledgeComposer
        placeholder={t('rightSidebar.contextNotesTodo.plans.newPlaceholder')}
        addLabel={t('rightSidebar.contextNotesTodo.plans.create')}
        maxLength={PROJECT_PLAN_TITLE_MAX_LENGTH}
        dictation={false}
        onSubmit={handleCreatePlan}
        extraActions={(
          <ButtonTooltip label={t('rightSidebar.contextNotesTodo.plans.importFromFile')} className="shrink-0">
            <button
              type="button"
              onClick={handleTriggerImport}
              disabled={isImporting}
              className={KNOWLEDGE_ICON_BUTTON_CLASS}
              aria-label={t('rightSidebar.contextNotesTodo.plans.importFromFile')}
            >
              <Icon name="upload-2" className="h-3.5 w-3.5" />
            </button>
          </ButtonTooltip>
        )}
      />
>>>>>>> bc50ba56a

      <div className="rounded-lg border border-edge bg-background/40">
        {visiblePlans.length === 0 ? (
          <p className="px-3 py-3 typography-meta text-muted-foreground">
            {query.trim()
              ? t('rightSidebar.contextNotesTodo.search.noResults', { query: query.trim() })
              : t('rightSidebar.contextNotesTodo.plans.empty')}
          </p>
        ) : (
<<<<<<< HEAD
          <ul className="divide-y divide-border/50">
            {visiblePlans.map((plan) => (
              <li key={plan.id} className="flex items-center gap-1.5 px-2.5 py-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenPlan(plan)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
=======
          <ul className="divide-y divide-edge">
            {visiblePlans.map((plan) => {
              const pinned = pinnedPlanIds.has(plan.id);
              const shared = plan.source === 'shared';
              const sessionId = plan.session?.sessionId;
              const menuItems = [
                {
                  id: 'move',
                  label: shared
                    ? t('rightSidebar.contextNotesTodo.plans.menu.makePersonal')
                    : t('rightSidebar.contextNotesTodo.plans.menu.share'),
                  hint: shared
                    ? t('rightSidebar.contextNotesTodo.plans.makePersonal')
                    : t('rightSidebar.contextNotesTodo.plans.share'),
                  onSelect: () => void handleMovePlan(plan),
                },
                {
                  id: 'delete',
                  label: t('rightSidebar.contextNotesTodo.plans.deletePlan'),
                  destructive: true,
                  onSelect: () => handleDeletePlan(plan.id),
                },
              ];
              return (
                <KnowledgeRowContextMenu
                  key={plan.id}
                  items={menuItems}
                  disabled={movingPlanId === plan.id}
                  render={(
                    <li
                      data-knowledge-entry-id={plan.id}
                      aria-current={plan.id === selectedPlanId ? 'true' : undefined}
                      className={cn('group/knowledge flex items-center gap-1 py-1 pe-1.5 ps-1', plan.id === selectedPlanId && 'bg-interactive-selection/40')}
                    />
                  )}
>>>>>>> bc50ba56a
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate typography-ui-label text-foreground">{plan.title}</span>
                    {plan.source === 'shared' ? (
                      <span className="shrink-0 typography-micro px-1 rounded leading-none pb-px text-muted-foreground bg-[var(--surface-subtle)]">
                        {t('rightSidebar.contextNotesTodo.plans.sharedBadge')}
                      </span>
                    ) : null}
<<<<<<< HEAD
                  </span>
                  <span className="flex-shrink-0 typography-micro text-muted-foreground">
                    {new Date(plan.createdAt).toLocaleDateString(getCurrentIntlLocale())}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleMovePlan(plan)}
                  disabled={movingPlanId === plan.id}
                  className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  title={plan.source === 'shared'
                    ? t('rightSidebar.contextNotesTodo.plans.makePersonal')
                    : t('rightSidebar.contextNotesTodo.plans.share')}
                  aria-label={plan.source === 'shared'
                    ? t('rightSidebar.contextNotesTodo.plans.makePersonal')
                    : t('rightSidebar.contextNotesTodo.plans.share')}
                >
                  <Icon name={plan.source === 'shared' ? 'user' : 'team'} className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleTogglePinned(plan.id, !pinnedPlanIds.has(plan.id))}
                  className={cn(
                    'inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    pinnedPlanIds.has(plan.id) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-pressed={pinnedPlanIds.has(plan.id)}
                  aria-label={pinnedPlanIds.has(plan.id)
                    ? t('rightSidebar.contextNotesTodo.notes.actions.unpin')
                    : t('rightSidebar.contextNotesTodo.notes.actions.pin')}
                  title={pinnedPlanIds.has(plan.id)
                    ? t('rightSidebar.contextNotesTodo.notes.actions.unpin')
                    : t('rightSidebar.contextNotesTodo.notes.actions.pin')}
                >
                  <Icon name="pushpin" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeletePlan(plan.id)}
                  disabled={deletingPlanId === plan.id}
                  className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  title={t('rightSidebar.contextNotesTodo.plans.deletePlan')}
                  aria-label={t('rightSidebar.contextNotesTodo.plans.deletePlanWithTitle', { title: plan.title })}
                >
                  <Icon name="delete-bin" className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
=======
                    {plan.progress ? <PlanProgressLabel progress={plan.progress} /> : null}
                    <span className="ms-auto flex-shrink-0 typography-micro text-muted-foreground">
                      {formatKnowledgeDate(plan.createdAt)}
                    </span>
                  </button>
                  {sessionId ? (
                    <button
                      type="button"
                      onClick={() => void openSessionLink(sessionId, null)}
                      className={KNOWLEDGE_ICON_BUTTON_CLASS}
                      aria-label={t('rightSidebar.contextNotesTodo.plans.session.open')}
                      data-row-tooltip={t('rightSidebar.contextNotesTodo.plans.session.open')}
                    >
                      <Icon name="chat-3" className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <KnowledgePinToggle
                    pinned={pinned}
                    onToggle={() => void handleTogglePinned(plan.id, !pinned)}
                  />
                  <KnowledgeMenu disabled={movingPlanId === plan.id} items={menuItems} />
                </KnowledgeRowContextMenu>
              );
            })}
>>>>>>> bc50ba56a
          </ul>
        )}
      </div>
    </div>
  );
};
