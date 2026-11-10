import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { KnowledgeRowContextMenu, type KnowledgeMenuItem } from './KnowledgeActions';

/**
 * One entry in any project knowledge list.
 *
 * Notes and memories drifted into two different-looking rows in the same panel:
 * one a bare block of text opened by clicking the text, the other a bordered
 * card opened by a chevron. They hold different content but they are the same
 * kind of thing to read, so they share this shell and this interaction.
 *
 * A collapsed card opens on a click anywhere on it — the whole card is the
 * target, not a chevron the user has to aim at. An expanded card closes only
 * through its collapse action, because its body is editable and a stray click
 * in the text must not throw the editor away.
 */
export const KnowledgeCard: React.FC<{
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Shown above the body: a badge, a title, whatever the section needs. */
  header?: React.ReactNode;
  /** The preview or the editor, depending on `expanded`. */
  children: React.ReactNode;
  /** Stacked to the right, so the text keeps the full row width. */
  actions?: React.ReactNode;
  /** The card's right-click menu: the items of its ⋯ menu. */
  menuItems?: KnowledgeMenuItem[];
  footer?: React.ReactNode;
<<<<<<< HEAD
  expandLabel: string;
}> = ({ expanded, onToggleExpanded, header, children, actions, footer, expandLabel }) => {
  const { t } = useI18n();

  return (
    <li
      className={cn(
        'oc-surface-elevated flex flex-col gap-1 rounded-lg border border-[var(--interactive-border)] bg-surface-elevated px-2 py-1.5',
        !expanded && 'cursor-pointer hover:border-[var(--interactive-border)] hover:bg-interactive-hover/30',
      )}
      onClick={expanded ? undefined : onToggleExpanded}
      onKeyDown={expanded ? undefined : (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleExpanded();
        }
      }}
      role={expanded ? undefined : 'button'}
      tabIndex={expanded ? undefined : 0}
      aria-label={expanded ? undefined : expandLabel}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          {header}
          {children}
        </div>

        {/* Stopped here rather than on each control: every action is a click on
            the card too, and without this each one would also toggle it. */}
        <div
          className="flex flex-shrink-0 flex-col items-center gap-0.5"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {expanded ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('rightSidebar.contextNotesTodo.notes.actions.collapse')}
              title={t('rightSidebar.contextNotesTodo.notes.actions.collapse')}
            >
              <Icon name="arrow-up-s" className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {actions}
        </div>
      </div>

      {footer ? <div className="min-w-0">{footer}</div> : null}
    </li>
  );
=======
}> = ({ entryId, selected = false, onOpen, label, header, children, actions, menuItems, footer }) => {
  const card = (
    <li
      data-knowledge-entry-id={entryId}
      className={cn(
        'group/knowledge oc-surface-elevated flex cursor-pointer flex-col gap-1 rounded-lg border border-edge bg-surface-elevated px-2.5 py-2 transition-colors',
        'hover:border-[var(--interactive-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'border-[var(--interactive-selection)] bg-interactive-selection/40',
      )}
      aria-current={selected ? 'true' : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={label}
    />
  );
  const content = (
    <>
      <div className="flex min-h-6 min-w-0 items-start gap-2">
        <div className="flex min-h-6 min-w-0 flex-1 items-center gap-1.5">{header}</div>

        {/* Stopped here rather than on each control: every action is a click on
            the card too, and without this each one would also open it. */}
        {actions ? (
          <div
            className="-me-1 flex flex-shrink-0 items-center gap-0.5"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </div>

      {children}

      {footer ? <div className="min-w-0">{footer}</div> : null}
    </>
  );
  return menuItems && menuItems.length > 0
    ? <KnowledgeRowContextMenu items={menuItems} render={card}>{content}</KnowledgeRowContextMenu>
    : React.cloneElement(card, undefined, content);
>>>>>>> bc50ba56a
};
