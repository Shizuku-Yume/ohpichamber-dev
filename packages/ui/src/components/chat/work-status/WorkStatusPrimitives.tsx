import React from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUIStore } from '@/stores/useUIStore';
import type { IconName } from '@/components/icon/icons';

<<<<<<< HEAD
/**
 * Row/section vocabulary for the work-status panel.
 *
 * Every readout is a labelled row — icon, name, trailing value — so a glance
 * answers "what is this number" without hovering. Sections carry a heading and
 * are separated by a hairline; the panel itself stays chrome-less, since it is
 * an object inside the chat rather than a docked pane.
 */
||||||| bc50ba56aa
/**
 * Row/section vocabulary for the work-status panel.
 *
 * Every readout is a labelled row — icon, name, trailing value — so a glance
 * answers "what is this number" without hovering. Sections carry a heading and
 * are separated by space alone; the panel itself stays chrome-less, since it is
 * an object inside the chat rather than a docked pane.
 *
 * On the phone's Status tab (`WorkStatusTouchContext`) the same vocabulary
 * takes the phone's grouped look, the one its Usage popover has: a quiet
 * heading over a toned card per section, rows with a 20px icon column, muted
 * label and value on the end, text from the typography scale. Sections never
 * branch on it themselves.
 */
=======
>>>>>>> upstream/main

const SECTION_CLASS = cn(
  'flex flex-col',
  '[&:not(:first-child)]:mt-3 [&:not(:first-child)]:border-t',
  '[&:not(:first-child)]:border-[var(--interactive-border)] [&:not(:first-child)]:pt-3',
);

<<<<<<< HEAD
const HEADING_CLASS = 'text-xs font-semibold text-foreground';
||||||| bc50ba56aa
const HEADING_CLASS = 'text-xs font-semibold text-foreground';
const TOUCH_HEADING_CLASS = 'typography-meta font-semibold text-muted-foreground';
const SUMMARY_CLASS = 'min-w-0 max-w-[60%] truncate text-end text-muted-foreground tabular-nums';

/** A section's rows on the phone: one toned card, a tone step from the page, no border. */
const TouchCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col rounded-xl bg-foreground/[0.03] py-0.5">{children}</div>
);
=======
const HEADING_CLASS = 'text-[0.8125rem] font-medium text-foreground';
const TOUCH_HEADING_CLASS = 'typography-meta font-semibold text-muted-foreground';
const SUMMARY_CLASS = 'min-w-0 max-w-[60%] truncate text-end tabular-nums';
const SUMMARY_DESKTOP_CLASS = 'text-[0.8125rem] text-foreground';
const SUMMARY_TOUCH_CLASS = 'typography-meta text-muted-foreground';

const TouchCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col rounded-xl bg-foreground/[0.03] py-0.5">{children}</div>
);
>>>>>>> upstream/main

export const WorkStatusSection: React.FC<{
  title: string;
<<<<<<< HEAD
  /** Aggregate for the whole section; belongs on the heading, not on a row. */
||||||| bc50ba56aa
  /** Names what the section is about, right after the title (the project). */
  subject?: React.ReactNode;
  /** Aggregate for the whole section; belongs on the heading, not on a row. */
=======
  icon: IconName;
  subject?: React.ReactNode;
>>>>>>> upstream/main
  summary?: React.ReactNode;
  children: React.ReactNode;
<<<<<<< HEAD
}> = ({ title, summary, children }) => (
  <section className={SECTION_CLASS}>
    <div data-work-status-heading className="mb-0.5 flex items-center gap-2 px-1">
      <h3 className={cn(HEADING_CLASS, 'min-w-0 flex-1 truncate')}>{title}</h3>
      {summary !== undefined && summary !== null ? (
        <span className="min-w-0 max-w-[60%] truncate text-right text-xs text-muted-foreground tabular-nums">{summary}</span>
      ) : null}
    </div>
    {children}
  </section>
);
||||||| bc50ba56aa
}> = ({ title, subject, summary, children }) => {
  const touch = React.useContext(WorkStatusTouchContext);
  return (
    <section className={SECTION_CLASS}>
      <div data-work-status-heading className={cn('flex items-center gap-2', touch ? 'mb-1.5 min-h-6 px-2.5' : 'mb-0.5 px-1')}>
        <h3 className={cn(touch ? TOUCH_HEADING_CLASS : HEADING_CLASS, 'min-w-0 flex-1 truncate')}>
          {title}
          {subject ? <span className="ms-1.5 font-normal text-muted-foreground">{subject}</span> : null}
        </h3>
        {summary !== undefined && summary !== null ? (
          <span dir="auto" className={cn(SUMMARY_CLASS, touch ? 'typography-meta' : 'text-xs')}>{summary}</span>
        ) : null}
      </div>
      {touch ? <TouchCard>{children}</TouchCard> : children}
    </section>
  );
};
=======
}> = ({ title, icon, subject, summary, children }) => {
  const touch = React.useContext(WorkStatusTouchContext);
  const trailing = summary ?? subject;
  return (
    <section className={SECTION_CLASS}>
      <div data-work-status-heading className={cn('flex items-center gap-2', touch ? 'mb-1.5 min-h-6 px-2.5' : 'mb-0.5 h-6 px-1')}>
        {touch ? null : <Icon name={icon} className="size-[13px] shrink-0 text-muted-foreground" />}
        <h3 className={cn(touch ? TOUCH_HEADING_CLASS : HEADING_CLASS, 'min-w-0 flex-1 truncate')}>
          {title}
        </h3>
        {trailing !== undefined && trailing !== null ? (
          <span dir="auto" className={cn(SUMMARY_CLASS, touch ? SUMMARY_TOUCH_CLASS : SUMMARY_DESKTOP_CLASS)}>{trailing}</span>
        ) : null}
      </div>
      {touch ? <TouchCard>{children}</TouchCard> : children}
    </section>
  );
};
>>>>>>> upstream/main

export const WorkStatusCollapsibleSection: React.FC<{
  id: string;
  title: string;
  icon?: IconName;
  iconNode?: React.ReactNode;
  iconColor?: string;
  summary?: React.ReactNode;
  action?: React.ReactNode;
  actionLayout?: 'inline' | 'below';
  defaultExpanded?: boolean;
  collapsedContent?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, icon, iconNode, iconColor, summary, action, actionLayout = 'inline', defaultExpanded = false, collapsedContent, children }) => {
  const stored = useUIStore(
    React.useCallback((state) => state.workStatusExpandedSections[id], [id]),
  );
  const setExpandedInStore = useUIStore((state) => state.setWorkStatusSectionExpanded);
  const expanded = stored ?? defaultExpanded;
  return (
    <section data-work-status-section={id} className={SECTION_CLASS}>
      <div data-work-status-heading className={cn('mb-0.5 flex items-center gap-1', actionLayout === 'inline' && 'h-6')}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpandedInStore(id, !expanded)}
          className={cn(
<<<<<<< HEAD
            'group/section flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left',
            // No hover fill anywhere in the panel: at this row density the blocks
            // of colour read as selection, not as affordance. Interactivity shows
            // through the text instead.
||||||| bc50ba56aa
            'group/section flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-start',
            // On the phone the whole heading is the tap target, as tall as a finger needs.
            touch ? 'min-h-9' : 'px-1',
            // No hover fill anywhere in the panel: at this row density the blocks
            // of colour read as selection, not as affordance. Interactivity shows
            // through the text instead.
=======
            'group/section flex min-w-0 flex-1 items-center gap-2 rounded-md text-start',
            touch ? 'min-h-9' : 'px-1',
>>>>>>> upstream/main
            'transition-colors hover:text-foreground',
          )}
        >
          {touch ? (iconNode ?? (icon ? (
            <Icon
              name={icon}
              className={cn('size-4 shrink-0', !iconColor && 'text-muted-foreground')}
              style={iconColor ? { color: iconColor } : undefined}
            />
<<<<<<< HEAD
          ) : null)}
          <span className={cn(HEADING_CLASS, 'min-w-0 truncate')}>{title}</span>
          <Icon
            name={expanded ? 'arrow-down-s' : 'arrow-right-s'}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
||||||| bc50ba56aa
          ) : null)}
          <span className={cn(touch ? TOUCH_HEADING_CLASS : HEADING_CLASS, 'min-w-0 truncate')}>{title}</span>
          <Icon
            name={expanded ? 'arrow-down-s' : 'arrow-right-s'}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
=======
          ) : null)) : (
            <span className="relative inline-flex size-[13px] shrink-0 items-center justify-center">
              {iconNode || icon ? (
                <span className={cn('inline-flex transition-opacity', expanded ? 'opacity-0' : 'group-hover/section:opacity-0 group-focus-visible/section:opacity-0')}>
                  {iconNode ?? (icon ? (
                    <Icon
                      name={icon}
                      className={cn('size-[13px] shrink-0', !iconColor && 'text-muted-foreground')}
                      style={iconColor ? { color: iconColor } : undefined}
                    />
                  ) : null)}
                </span>
              ) : null}
              <Icon
                name={expanded ? 'arrow-down-s' : 'arrow-right-s'}
                className={cn(
                  'absolute inset-0 size-[13px] text-muted-foreground transition-opacity rtl:-scale-x-100',
                  !(iconNode || icon) || expanded ? 'opacity-100' : 'opacity-0 group-hover/section:opacity-100 group-focus-visible/section:opacity-100',
                )}
              />
            </span>
          )}
          <span className={cn(touch ? TOUCH_HEADING_CLASS : HEADING_CLASS, 'min-w-0 truncate transition-colors group-hover/section:text-foreground')}>{title}</span>
>>>>>>> upstream/main
          <span className="flex-1" />
          {summary !== undefined && summary !== null ? (
<<<<<<< HEAD
            <span className="min-w-0 max-w-[60%] truncate text-right text-xs text-muted-foreground tabular-nums">{summary}</span>
||||||| bc50ba56aa
            <span dir="auto" className={cn(SUMMARY_CLASS, touch ? 'typography-meta pe-2.5' : 'text-xs')}>{summary}</span>
=======
            <span dir="auto" className={cn(SUMMARY_CLASS, touch ? SUMMARY_TOUCH_CLASS : SUMMARY_DESKTOP_CLASS)}>{summary}</span>
          ) : null}
          {touch ? (
            <Icon
              name={expanded ? 'arrow-down-s' : 'arrow-right-s'}
              className="me-2.5 size-3.5 shrink-0 text-muted-foreground rtl:-scale-x-100"
            />
>>>>>>> upstream/main
          ) : null}
        </button>
        {actionLayout === 'inline' ? action : null}
      </div>
      {actionLayout === 'below' ? action : null}
      {expanded ? children : collapsedContent}
    </section>
  );
};

type RowProps = {
  icon?: IconName;
  iconColor?: string;
  leading?: React.ReactNode;
  label: React.ReactNode;
  value?: React.ReactNode;
  detail?: React.ReactNode;
  muted?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  expanded?: boolean;
  tooltip?: React.ReactNode;
  className?: string;
<<<<<<< HEAD
||||||| bc50ba56aa
  /**
   * Direction of a label that is not a translated string: `auto` for names and
   * titles people or agents wrote, `ltr` for branches and paths. A translated
   * label keeps the interface's direction.
   */
  labelDir?: 'auto' | 'ltr';
=======
  labelDir?: 'auto' | 'ltr';
>>>>>>> upstream/main
};

export const WorkStatusRow: React.FC<RowProps> = ({
  icon,
  iconColor,
  leading,
  label,
  value,
  detail,
  muted,
  onClick,
  ariaLabel,
  expanded,
  tooltip,
  className,
}) => {
  const labelId = React.useId();
<<<<<<< HEAD
  const body = (
||||||| bc50ba56aa
  const touch = React.useContext(WorkStatusTouchContext);
  const leadingNode = leading ?? (icon ? (
    <Icon
      name={icon}
      className={cn('size-3.5 shrink-0', !iconColor && 'text-muted-foreground')}
      style={iconColor ? { color: iconColor } : undefined}
    />
  ) : null);
  const body = (
=======
  const touch = React.useContext(WorkStatusTouchContext);
  const twoLines = detail !== undefined && detail !== null;
  const leadingNode = leading ?? (icon ? (
    <Icon
      name={icon}
      className={cn('size-[13px] shrink-0', !iconColor && 'text-muted-foreground')}
      style={iconColor ? { color: iconColor } : undefined}
    />
  ) : null);
  const leadingSlot = touch && leadingNode ? (
    <span className="flex size-5 shrink-0 items-center justify-center [&>span]:size-5 [&_svg]:size-4">{leadingNode}</span>
  ) : leadingNode;
  const firstLine = (
>>>>>>> upstream/main
    <>
<<<<<<< HEAD
      {leading ?? (icon ? (
        <Icon
          name={icon}
          className={cn('size-4 shrink-0', !iconColor && 'text-muted-foreground')}
          style={iconColor ? { color: iconColor } : undefined}
        />
      ) : null)}
      <span id={labelId} className={cn('min-w-0 flex-1 truncate text-[13px]', muted && 'text-muted-foreground')}>
||||||| bc50ba56aa
      {touch && leadingNode ? (
        // The phone's icon column: 20px wide, every glyph in it at 16px, so
        // the status glyphs sections centre in a 14px slot line up as well.
        <span className="flex size-5 shrink-0 items-center justify-center [&>span]:size-5 [&_svg]:size-4">{leadingNode}</span>
      ) : leadingNode}
      <span id={labelId} dir={labelDir} className={cn('min-w-0 flex-1 truncate', labelDir && 'oc-ui-start-align', touch ? 'typography-ui-label' : 'text-[0.8125rem]', muted && 'text-muted-foreground')}>
=======
      <span id={labelId} dir={labelDir} className={cn('min-w-0 flex-1 truncate', labelDir && 'oc-ui-start-align', touch ? 'typography-ui-label' : 'text-[0.8125rem]', muted && 'text-muted-foreground')}>
>>>>>>> upstream/main
        {label}
      </span>
      {value !== undefined && value !== null ? (
<<<<<<< HEAD
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] tabular-nums">{value}</span>
||||||| bc50ba56aa
        <span className={cn('flex shrink-0 items-center gap-1.5 tabular-nums', touch ? 'typography-ui-label font-medium text-foreground' : 'text-[0.8125rem]')}>{value}</span>
=======
        <span className={cn('flex shrink-0 items-center gap-1.5 tabular-nums text-foreground', touch ? 'typography-ui-label font-medium' : 'text-[0.8125rem]')}>{value}</span>
>>>>>>> upstream/main
      ) : null}
    </>
  );
  const body = twoLines ? (
    <>
      {leadingSlot ? <span className={cn('flex shrink-0 items-center', touch ? 'h-6' : 'h-5')}>{leadingSlot}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('flex min-w-0 items-center', touch ? 'h-6 gap-3' : 'h-5 gap-2')}>{firstLine}</span>
        <span className={cn('min-w-0 truncate text-muted-foreground', touch ? 'typography-meta' : 'text-[0.6875rem] leading-4')}>{detail}</span>
      </span>
    </>
  ) : (
    <>
      {leadingSlot}
      {firstLine}
    </>
  );

  const shared = cn(
<<<<<<< HEAD
    'flex h-7 w-full items-center gap-2 rounded-md px-1 text-left text-muted-foreground',
||||||| bc50ba56aa
    'flex w-full items-center text-start text-muted-foreground',
    touch ? 'min-h-11 gap-3 rounded-xl px-2.5' : 'h-7 gap-2 rounded-md px-1',
=======
    'flex w-full text-start text-muted-foreground',
    twoLines ? 'items-start' : 'items-center',
    touch
      ? cn('min-h-11 gap-3 rounded-xl px-2.5', twoLines && 'py-1.5')
      : cn('gap-2 rounded-md px-1', twoLines ? 'py-[3px]' : 'h-[1.625rem]'),
>>>>>>> upstream/main
    className,
  );

  const row = onClick ? (
    <div className={cn(shared, 'relative transition-colors hover:text-foreground')}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : labelId}
<<<<<<< HEAD
        className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--interactive-focus-ring)]"
||||||| bc50ba56aa
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--interactive-focus-ring)]"
=======
        aria-expanded={expanded}
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--interactive-focus-ring)]"
>>>>>>> upstream/main
      />
<<<<<<< HEAD
      <div className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-2 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
||||||| bc50ba56aa
      <div className={cn('pointer-events-none relative flex min-w-0 flex-1 items-center [&_a]:pointer-events-auto [&_button]:pointer-events-auto', touch ? 'gap-3' : 'gap-2')}>
=======
      <div className={cn('pointer-events-none relative flex min-w-0 flex-1 [&_a]:pointer-events-auto [&_button]:pointer-events-auto', twoLines ? 'items-start' : 'items-center', touch ? 'gap-3' : 'gap-2')}>
>>>>>>> upstream/main
        {body}
      </div>
    </div>
  ) : <div className={shared} tabIndex={tooltip ? 0 : undefined}>{body}</div>;

  if (!tooltip) return row;

  return (
<<<<<<< HEAD
    <Tooltip delayDuration={750}>
||||||| bc50ba56aa
    // Above the row, as on every dense row, so it never covers the rows
    // under it or the actions beside it.
    <Tooltip delayDuration={300}>
=======
    <Tooltip delayDuration={300}>
>>>>>>> upstream/main
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="left" sideOffset={8} className="max-w-[min(320px,calc(100vw-24px))] whitespace-normal break-words text-left">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

type WorkStatusTone = 'default' | 'muted' | 'success' | 'error' | 'warning' | 'info';

const TONE_COLOR: Record<Exclude<WorkStatusTone, 'default' | 'muted'>, string> = {
  success: 'var(--status-success)',
  error: 'var(--status-error)',
  warning: 'var(--status-warning)',
  info: 'var(--status-info)',
};

export const WorkStatusValue: React.FC<{
  children: React.ReactNode;
  tone?: WorkStatusTone;
}> = ({ children, tone = 'default' }) => (
  <span
    className={tone === 'muted' ? 'text-muted-foreground' : undefined}
    style={tone === 'default' || tone === 'muted' ? undefined : { color: TONE_COLOR[tone] }}
  >
    {children}
  </span>
);

export const WorkStatusRowAction: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'warning' | 'error' | 'info';
  disabled?: boolean;
  ariaLabel?: string;
}> = ({ children, onClick, tone = 'default', disabled, ariaLabel }) => {
  const color = tone === 'default' ? undefined : TONE_COLOR[tone];
  const button = (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'shrink-0 rounded-full px-1.5 py-px text-[11px] font-medium leading-4 transition-opacity',
        'hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50',
        !color && 'bg-[var(--interactive-hover)] text-muted-foreground',
      )}
      style={color
        ? { color, backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }
        : undefined}
    >
      {children}
    </button>
  );
  if (!ariaLabel) return button;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>{ariaLabel}</TooltipContent>
    </Tooltip>
  );
};

export const WorkStatusPill: React.FC<{
  children: React.ReactNode;
  color?: string;
  background?: string;
}> = ({ children, color, background }) => (
  <span
    className={cn(
      'rounded-full px-1.5 py-px text-[11px] font-medium leading-4',
      !color && 'bg-[var(--interactive-hover)] text-muted-foreground',
    )}
    style={color ? { color, backgroundColor: background } : undefined}
  >
    {children}
  </span>
);

<<<<<<< HEAD
/** Full-width callout for states that block the branch (merge, rebase, …). */
export const WorkStatusCallout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="mx-1 mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium"
    style={{ backgroundColor: 'var(--status-warning-background)', color: 'var(--status-warning)' }}
  >
    <Icon name="alert" className="size-4 shrink-0" />
    <span className="min-w-0 truncate">{children}</span>
  </div>
);
||||||| bc50ba56aa
/** Full-width callout for states that block the branch (merge, rebase, …). */
export const WorkStatusCallout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const touch = React.useContext(WorkStatusTouchContext);
  return (
    <div
      className={cn(
        'flex items-center gap-2 font-medium',
        touch ? 'mx-1.5 my-1 rounded-lg px-2.5 py-2 typography-ui-label' : 'mx-1 mb-1 rounded-md px-2 py-1.5 text-[0.8125rem]',
      )}
      style={{ backgroundColor: 'var(--status-warning-background)', color: 'var(--status-warning)' }}
    >
      <Icon name="alert" className={cn('shrink-0', touch ? 'size-4' : 'size-3.5')} />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
};
=======
export const WorkStatusCallout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const touch = React.useContext(WorkStatusTouchContext);
  return (
    <div
      className={cn(
        'flex items-center gap-2 font-medium',
        touch ? 'mx-1.5 my-1 rounded-lg px-2.5 py-2 typography-ui-label' : 'mx-1 mb-1 rounded-md px-2 py-1.5 text-[0.8125rem]',
      )}
      style={{ backgroundColor: 'var(--status-warning-background)', color: 'var(--status-warning)' }}
    >
      <Icon name="alert" className={cn('shrink-0', touch ? 'size-4' : 'size-[13px]')} />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
};
>>>>>>> upstream/main

<<<<<<< HEAD
/** Context-window fill, drawn under its row rather than inside it. */
export const WorkStatusMeter: React.FC<{ percent: number; color: string }> = ({ percent, color }) => (
  <div className="mx-1 mb-1 h-1 overflow-hidden rounded-full bg-[var(--chat-divider)]">
    <div
      className="h-full rounded-full"
      style={{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }}
    />
  </div>
);
||||||| bc50ba56aa
/** Context-window fill, drawn under its row rather than inside it. */
export const WorkStatusMeter: React.FC<{ percent: number; color: string }> = ({ percent, color }) => {
  const touch = React.useContext(WorkStatusTouchContext);
  return (
    <div className={cn('h-1 overflow-hidden rounded-full bg-[var(--chat-divider)]', touch ? 'mx-2.5 mb-2' : 'mx-1 mb-1')}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }}
      />
    </div>
  );
};

/**
 * A line explaining the readout above it (a cost split, a compaction note):
 * no icon and no label column, since it reports nothing of its own.
 */
export const WorkStatusNote: React.FC<{ children: React.ReactNode; truncate?: boolean }> = ({ children, truncate }) => {
  const touch = React.useContext(WorkStatusTouchContext);
  return (
    <p
      className={cn(
        'text-muted-foreground tabular-nums',
        touch ? 'mb-2 ms-[2.625rem] me-2.5 typography-meta' : 'mx-1 mb-1 text-[0.6875rem] leading-4',
        truncate && 'truncate',
      )}
    >
      {children}
    </p>
  );
};
=======
export const WorkStatusMeter: React.FC<{ percent: number; color: string }> = ({ percent, color }) => {
  const touch = React.useContext(WorkStatusTouchContext);
  return (
    <div className={cn('h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] dark:bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)]', touch ? 'mx-2.5 mb-2' : 'mx-1 mt-[3px] mb-[5px]')}>
      <div
        className={cn('h-full rounded-full', percent > 0 && 'min-w-1')}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }}
      />
    </div>
  );
};

export const WorkStatusNote: React.FC<{ children: React.ReactNode; truncate?: boolean; tooltip?: string }> = ({ children, truncate, tooltip }) => {
  const touch = React.useContext(WorkStatusTouchContext);
  const note = (
    <p
      className={cn(
        'text-muted-foreground tabular-nums',
        touch ? 'mb-2 ms-[2.625rem] me-2.5 typography-meta' : 'mx-1 mb-1 text-[0.6875rem] leading-4',
        (truncate || tooltip) && 'truncate',
      )}
      tabIndex={tooltip ? 0 : undefined}
    >
      {children}
    </p>
  );
  if (!tooltip) return note;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{note}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="max-w-[min(320px,calc(100vw-24px))] whitespace-normal break-words text-start">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};
>>>>>>> upstream/main
