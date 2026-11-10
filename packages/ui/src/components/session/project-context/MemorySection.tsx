import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import React from 'react';

import { toast } from '@/components/ui';
import { AttachedOverlayScrollbar } from '@/components/ui/AttachedOverlayScrollbar';
import { Button } from '@/components/ui/button';
<<<<<<< HEAD
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { KnowledgeCard } from './KnowledgeCard';
=======
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KnowledgeCard } from './KnowledgeCard';
import { KnowledgeEntryView } from './KnowledgeEntryView';
import { KnowledgeSplit } from './KnowledgeSplit';
import { KnowledgeMenu } from './KnowledgeActions';
import { ButtonTooltip } from '@/components/ui/action-toolbar';
import { memoryDeleteKey, scheduleKnowledgeDelete, usePendingKnowledgeDeletes } from './pendingKnowledgeDeletes';
>>>>>>> bc50ba56a
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { AGENT_MEMORY_BODY_MAX_LENGTH, AGENT_MEMORY_TITLE_MAX_LENGTH, type AgentMemoryEntry, type AgentMemoryScope } from '@/lib/agentMemoryApi';
import { classifyMemory, memoryViewKey, type MemoryBadge } from '@/lib/agentMemoryBadges';
import { cn } from '@/lib/utils';
import { selectProjectMemoryForPath, useAgentMemoryStore } from '@/stores/useAgentMemoryStore';
import { useUIStore } from '@/stores/useUIStore';

/**
<<<<<<< HEAD
 * One stored memory.
 *
 * Read-only text on purpose: this is what the agent wrote, and the useful
 * action on someone else's claim is to remove it, not to quietly rewrite it
 * into something the agent will contradict next session.
=======
 * Starts the tidy-up session. Offered only while both scopes are loaded for
 * this project: a store that failed to load would reach the agent as empty,
 * and it would tidy against half the data.
 */
const MemoryTidyButton: React.FC<{ projectPath: string | null }> = ({ projectPath }) => {
  const { t } = useI18n();
  const [starting, setStarting] = React.useState(false);
  const ready = useAgentMemoryStore((state) => (
    Boolean(projectPath)
    && state.loaded
    && !state.loading
    && !state.globalFailed
    && !state.projectFailed
    && state.projectPath === projectPath
    && state.global.length + state.project.length > 0
  ));

  const handleClick = async () => {
    if (!projectPath || starting) return;
    const { global, project } = useAgentMemoryStore.getState();
    setStarting(true);
    try {
      const outcome = await startMemoryTidy({
        projectPath,
        title: t('rightSidebar.contextNotesTodo.memory.tidy.sessionTitle'),
        memory: { global, project },
      });
      if (!outcome.ok) {
        toast.error(t(outcome.reason === 'no-model'
          ? 'rightSidebar.contextNotesTodo.memory.tidy.noModel'
          : 'rightSidebar.contextNotesTodo.memory.tidy.failed'));
      }
    } catch {
      toast.error(t('rightSidebar.contextNotesTodo.memory.tidy.failed'));
    } finally {
      setStarting(false);
    }
  };

  return (
    <ButtonTooltip label={t('contextTooltips.workspace.memory.tidy')} className="ms-auto shrink-0">
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={!ready || starting}
        onClick={() => void handleClick()}
        className="gap-1 border-[var(--status-info-border)] bg-[var(--status-info-background)] text-[var(--status-info)] hover:bg-[var(--status-info-background)] hover:text-[var(--status-info)]"
      >
        <Icon name={starting ? 'loader-4' : 'brush'} className={cn('size-3.5', starting && 'animate-spin')} />
        {t('rightSidebar.contextNotesTodo.memory.tidy.action')}
      </Button>
    </ButtonTooltip>
  );
};

const MemoryBadgePill: React.FC<{ badge: MemoryBadge }> = ({ badge }) => {
  const { t } = useI18n();
  if (!badge) return null;
  return (
    <span
      className={cn(
        'flex-shrink-0 rounded-full px-1.5 py-px typography-micro font-medium',
        badge === 'new'
          ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
          : 'bg-[var(--status-warning)]/15 text-[var(--status-warning)]',
      )}
    >
      {t(badge === 'new'
        ? 'rightSidebar.contextNotesTodo.memory.badge.new'
        : 'rightSidebar.contextNotesTodo.memory.badge.changed')}
    </span>
  );
};

/** Type and the withheld warning: the card footer and the open entry's toolbar. */
const MemoryMeta: React.FC<{ entry: AgentMemoryEntry; scopeLabel?: string }> = ({ entry, scopeLabel }) => {
  const { t } = useI18n();
  const typeLabel = t(`rightSidebar.contextNotesTodo.memory.type.${entry.type}` as Parameters<typeof t>[0]);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 typography-micro text-muted-foreground">
      {scopeLabel ? (
        <>
          <span>{scopeLabel}</span>
          <span aria-hidden="true">·</span>
        </>
      ) : null}
      <span>{typeLabel}</span>
      {entry.flagged ? (
        // Shown rather than hidden: an entry withheld from the agent is
        // exactly the one the user needs to look at.
        <span className="flex items-center gap-1 text-[var(--status-error)]">
          <Icon name="error-warning" className="h-3 w-3 flex-shrink-0" />
          {t('rightSidebar.contextNotesTodo.memory.flagged')}
        </span>
      ) : null}
    </span>
  );
};

/**
 * One stored memory in the list. A click opens it.
>>>>>>> bc50ba56a
 *
 * There is no confirm button. A badge that the user has to dismiss by hand asks
 * them to do work that tells the agent nothing — the agent already has the
 * memory either way — so the badge clears itself once they have looked.
 */
const MemoryRow: React.FC<{
  entry: AgentMemoryEntry;
  badge: MemoryBadge;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSave: (patch: { title?: string; body?: string }) => void;
  onDelete: () => void;
<<<<<<< HEAD
}> = ({ entry, badge, expanded, onToggleExpanded, onSave, onDelete }) => {
=======
  selected: boolean;
}> = ({ entry, badge, onOpen, onDelete , selected}) => {
  const { t } = useI18n();
  const menuItems = [{
    id: 'delete',
    label: t('rightSidebar.contextNotesTodo.memory.actions.delete'),
    destructive: true,
    onSelect: onDelete,
  }];
  return (
    <KnowledgeCard
      selected={selected}
      entryId={entry.id}
      onOpen={onOpen}
      label={entry.title}
      header={(
        <>
          <MemoryBadgePill badge={badge} />
          <span className="min-w-0 flex-1 truncate typography-ui-label font-medium text-foreground" dir="auto" title={entry.title}>
            {entry.title}
          </span>
        </>
      )}
      actions={<KnowledgeMenu items={menuItems} />}
      menuItems={menuItems}
      footer={<MemoryMeta entry={entry} />}
    >
      <p className="line-clamp-2 whitespace-pre-wrap break-words typography-meta text-muted-foreground" dir="auto">
        {entry.body}
      </p>
    </KnowledgeCard>
  );
};

/**
 * An open memory, in place of the list, with its title and text editable.
 *
 * Editable on purpose. A memory worded badly enough to mislead should be
 * fixable where it is read; deleting it and hoping the agent learns it again,
 * better, is not a repair. Changes save when a field loses focus and when the
 * entry is left. A rewrite by the agent is adopted while the user has not
 * changed anything since the last version they saw.
 */
const MemoryView: React.FC<{
  entry: AgentMemoryEntry;
  badge: MemoryBadge;
  scopeLabel: string;
  onSave: (patch: { title: string; body: string }) => void;
  onDelete: () => void;
  onClose: () => void;
  showBack: boolean;
}> = ({ entry, badge, scopeLabel, onSave, onDelete, onClose , showBack}) => {
>>>>>>> bc50ba56a
  const { t } = useI18n();
  const [titleDraft, setTitleDraft] = React.useState(entry.title);
  const [bodyDraft, setBodyDraft] = React.useState(entry.body);

  // Adopt an external rewrite only while this row is not being edited, so the
  // agent saving mid-edit cannot swallow what the user is typing.
  React.useEffect(() => {
    if (expanded) return;
    setTitleDraft(entry.title);
    setBodyDraft(entry.body);
  }, [entry.body, entry.title, expanded]);

<<<<<<< HEAD
  const commit = React.useCallback(() => {
=======
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const [bodyScroller, setBodyScroller] = React.useState<HTMLTextAreaElement | null>(null);
  const emojiPicker = useEmojiPicker(bodyRef);
  const commitRef = React.useRef<() => void>(() => {});
  commitRef.current = () => {
>>>>>>> bc50ba56a
    const title = titleDraft.trim();
    const body = bodyDraft.trim();
    // An emptied field is a rejected write, not a delete: restore it rather
    // than sending something the server will refuse.
    if (!title || !body) {
      setTitleDraft(entry.title);
      setBodyDraft(entry.body);
      return;
    }
    if (title === entry.title && body === entry.body) {
      return;
    }
    onSave({ title, body });
  }, [bodyDraft, entry.body, entry.title, onSave, titleDraft]);

  const typeLabel = t(`rightSidebar.contextNotesTodo.memory.type.${entry.type}` as Parameters<typeof t>[0]);

  return (
    <KnowledgeCard
      expanded={expanded}
      onToggleExpanded={() => {
        if (expanded) commit();
        onToggleExpanded();
      }}
      expandLabel={entry.title}
      footer={(
        <span className="flex flex-wrap items-center gap-x-2 typography-micro text-muted-foreground">
          {typeLabel}
          {entry.flagged ? (
            // Shown rather than hidden: an entry withheld from the agent is
            // exactly the one the user needs to look at.
            <span className="flex items-center gap-1 text-[var(--status-error)]">
              <Icon name="error-warning" className="h-3 w-3 flex-shrink-0" />
              {t('rightSidebar.contextNotesTodo.memory.flagged')}
            </span>
          ) : null}
        </span>
      )}
      header={badge ? (
        <span
          className={cn(
            'mb-0.5 mr-1.5 inline-block rounded-full px-1.5 py-px typography-micro font-medium',
            badge === 'new'
              ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
              : 'bg-[var(--status-warning)]/15 text-[var(--status-warning)]',
          )}
        >
          {t(badge === 'new'
            ? 'rightSidebar.contextNotesTodo.memory.badge.new'
            : 'rightSidebar.contextNotesTodo.memory.badge.changed')}
        </span>
      ) : null}
      actions={(
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('rightSidebar.contextNotesTodo.memory.actions.delete')}
          title={t('rightSidebar.contextNotesTodo.memory.actions.delete')}
        >
          <Icon name="delete-bin" className="h-3.5 w-3.5" />
        </button>
      )}
    >
<<<<<<< HEAD
      {expanded ? (
        // Editable on purpose. A memory worded badly enough to mislead should
        // be fixable where it is read; deleting it and hoping the agent learns
        // it again, better, is not a repair.
        <div className="flex flex-col gap-1">
          <Input
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value.slice(0, AGENT_MEMORY_TITLE_MAX_LENGTH))}
            onBlur={commit}
            aria-label={t('rightSidebar.contextNotesTodo.memory.actions.editTitle')}
            className="h-7 typography-ui-label"
          />
          <Textarea
            simple
            rows={Math.min(20, Math.max(3, bodyDraft.split('\n').length + 1))}
            value={bodyDraft}
            onChange={(event) => setBodyDraft(event.target.value.slice(0, AGENT_MEMORY_BODY_MAX_LENGTH))}
            onBlur={commit}
            aria-label={t('rightSidebar.contextNotesTodo.memory.actions.editBody')}
            className="min-h-0 w-full resize-none bg-transparent p-0 typography-meta leading-normal text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
          />
        </div>
      ) : (
        <>
          <span className="block min-w-0 truncate typography-ui-label text-foreground">{entry.title}</span>
          <p className="line-clamp-2 whitespace-pre-wrap break-words typography-meta text-muted-foreground">
            {entry.body}
          </p>
        </>
      )}
    </KnowledgeCard>
=======
      <div className="flex h-full min-h-0 flex-col gap-2">
        <input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value.slice(0, AGENT_MEMORY_TITLE_MAX_LENGTH))}
          onBlur={() => commitRef.current()}
          aria-label={t('rightSidebar.contextNotesTodo.memory.actions.editTitle')}
          dir="auto"
          className="w-full flex-shrink-0 bg-transparent typography-ui-header font-semibold text-foreground outline-none focus-visible:outline-none"
        />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <textarea
            ref={(node) => {
              bodyRef.current = node;
              setBodyScroller(node);
            }}
            value={bodyDraft}
            onChange={(event) => setBodyDraft(event.target.value.slice(0, AGENT_MEMORY_BODY_MAX_LENGTH))}
            onBlur={() => commitRef.current()}
            aria-label={t('rightSidebar.contextNotesTodo.memory.actions.editBody')}
            dir="auto"
            className="min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent typography-ui-label leading-relaxed text-foreground outline-none focus-visible:outline-none"
          />
          <AttachedOverlayScrollbar scroller={bodyScroller} disableHorizontal />
        </div>
        {emojiPicker}
      </div>
    </KnowledgeEntryView>
>>>>>>> bc50ba56a
  );
};

/**
 * What the agent has chosen to remember, in the two scopes it writes to.
 *
 * The scopes are a switch rather than one merged list: a claim about the user
 * reaches every project, so which store a memory sits in is the most important
 * thing about it and must never be something the reader has to infer.
 */
export const MemorySection: React.FC<{
  projectPath: string | null;
  query: string;
}> = ({ projectPath, query }) => {
  const { t } = useI18n();
  const [scope, setScope] = React.useState<AgentMemoryScope>('project');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const globalEntries = useAgentMemoryStore((state) => state.global);
  const projectEntries = useAgentMemoryStore((state) => selectProjectMemoryForPath(state, projectPath));
  const globalFailed = useAgentMemoryStore((state) => state.globalFailed);
  const projectFailed = useAgentMemoryStore((state) => state.projectFailed);
  const deleteEntry = useAgentMemoryStore((state) => state.deleteEntry);
  const saveEntry = useAgentMemoryStore((state) => state.saveEntry);
  const markViewed = useUIStore((state) => state.markAgentMemoryViewed);

  const entries = scope === 'global' ? globalEntries : projectEntries;
  const scopeFailed = scope === 'global' ? globalFailed : projectFailed;
  const viewKey = memoryViewKey(scope, projectPath);
  const storedViewedAt = useUIStore((state) => state.agentMemoryViewedAt[viewKey] ?? 0);

  /**
   * The mark is frozen for the length of the visit and only advanced on the way
   * out. Reading the live value would clear every badge the instant the tab
   * opened, which is the one moment the user is trying to read them.
   */
  const baselineRef = React.useRef(storedViewedAt);
  const [baseline, setBaseline] = React.useState(storedViewedAt);
  React.useEffect(() => {
    baselineRef.current = useUIStore.getState().agentMemoryViewedAt[viewKey] ?? 0;
    setBaseline(baselineRef.current);
    return () => {
      markViewed(viewKey, Date.now());
    };
  }, [markViewed, viewKey]);

  const visibleEntries = React.useMemo(
    () => entries.filter((entry) => matchesRankQuery([entry.title, entry.body], query)),
    [entries, query],
  );

  const handleDelete = React.useCallback(async (memoryId: string) => {
    if (!await deleteEntry(scope, memoryId)) {
      const detail = useAgentMemoryStore.getState().error;
      toast.error(
        t('rightSidebar.contextNotesTodo.memory.toast.deleteFailed'),
        detail ? { description: detail } : undefined,
      );
    }
  }, [deleteEntry, scope, t]);

  const handleSave = React.useCallback(async (memoryId: string, patch: { title?: string; body?: string }) => {
    if (!await saveEntry(scope, memoryId, patch)) {
      const detail = useAgentMemoryStore.getState().error;
      toast.error(
        t('rightSidebar.contextNotesTodo.memory.toast.saveFailed'),
        detail ? { description: detail } : undefined,
      );
    }
  }, [saveEntry, scope, t]);

  const scopeOptions: Array<{ id: AgentMemoryScope; label: string; tooltip: string; count: number }> = [
    {
      id: 'project',
      label: t('rightSidebar.contextNotesTodo.memory.scope.project'),
      tooltip: t('contextTooltips.workspace.memory.scope.project'),
      count: projectEntries.length,
    },
    {
      id: 'global',
      label: t('rightSidebar.contextNotesTodo.memory.scope.global'),
      tooltip: t('contextTooltips.workspace.memory.scope.global'),
      count: globalEntries.length,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* Chips rather than a tab strip: these pick which store you are reading,
          not which view you are in, and the chip's pressed state says which one
          is selected far more plainly than a pill sitting on a matching
          background did. */}
<<<<<<< HEAD
      <div role="group" aria-label={t('rightSidebar.contextNotesTodo.memory.scope.label')} className="flex items-center gap-1">
        {scopeOptions.map((option) => (
          <Button
            key={option.id}
            type="button"
            variant="chip"
            size="xs"
            aria-pressed={scope === option.id}
            className="!font-normal"
            onClick={() => setScope(option.id)}
          >
            {`${option.label} ${option.count}`}
          </Button>
        ))}
=======
      <div className="flex items-center gap-1">
        <div role="group" aria-label={t('rightSidebar.contextNotesTodo.memory.scope.label')} className="flex items-center gap-1">
          {scopeOptions.map((option) => (
            <Tooltip key={option.id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="chip"
                  size="xs"
                  aria-pressed={scope === option.id}
                  className="!font-normal"
                  onClick={() => {
                    scopePickedRef.current = true;
                    setScope(option.id);
                  }}
                >
                  {`${option.label} ${option.count}`}
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>{option.tooltip}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <MemoryTidyButton projectPath={projectPath} />
>>>>>>> bc50ba56a
      </div>

      {scope === 'project' && !projectPath ? (
        <p className="typography-meta text-muted-foreground">
          {t('rightSidebar.contextNotesTodo.memory.empty.noProject')}
        </p>
      ) : scopeFailed ? (
        // Said plainly rather than shown as an empty list: an empty tab would
        // read as the agent having forgotten everything it knew.
        <p className="typography-meta text-muted-foreground">
          {t('rightSidebar.contextNotesTodo.memory.empty.unavailable')}
        </p>
      ) : visibleEntries.length === 0 ? (
        <p className="typography-meta text-muted-foreground">
          {query.trim()
            ? t('rightSidebar.contextNotesTodo.memory.empty.noMatches')
            : t('rightSidebar.contextNotesTodo.memory.empty.nothing')}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visibleEntries.map((entry) => (
            <MemoryRow
              key={entry.id}
              entry={entry}
              badge={classifyMemory(entry, baseline)}
              expanded={expandedId === entry.id}
              onToggleExpanded={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              onSave={(patch) => void handleSave(entry.id, patch)}
              onDelete={() => void handleDelete(entry.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
};
