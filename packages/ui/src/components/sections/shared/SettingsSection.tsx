import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Radio } from '@/components/ui/radio';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { dropdownTriggerVariants } from '@/components/ui/dropdown-trigger';
import { Icon } from '@/components/icon/Icon';
import { cn } from '@/lib/utils';
import { SettingsInfoHint } from './SettingsInfoHint';

/**
 * Width cap shared by the settings pickers that hug their value.
 *
 * `applyTypography` scales the `--typography-*` vars but never the root rem,
 * so a rem-based cap (`max-w-48`) stays 192px while the label inside it grows,
 * and the value clips at 150–200% interface font size. `ch` is measured
 * against the trigger's own `typography-ui-label` font, so the cap grows with
 * the setting.
 *
 * A trigger hugs its value, the chevron right after it, so a short value is a
 * short button rather than a wide box with the chevron pushed to its edge.
 * The cap keeps a long value from stretching across the pane; it truncates.
 */
const SETTINGS_HUG_WIDTH_CLASS = 'w-fit max-w-[28ch]';

/**
 * Settings select trigger in stacked cells — two-column cells, dialogs and
 * wrap rows, where there is no shared control column to line up with, so it
 * hugs its value.
 */
export const SETTINGS_SELECT_TRIGGER_CLASS = SETTINGS_HUG_WIDTH_CLASS;

/**
 * Settings select trigger in a `SettingsFieldRow` control column.
 *
 * Hugs its selected value between `8ch` and `28ch` (font-relative `ch`, so the
 * bounds scale with interface font size). Short labels (`Default`, `500 行`,
 * `Low`) stay compact instead of stretching into wide empty bars, while long
 * labels cap at `28ch` and truncate. `SettingsFieldRow` packs the control
 * column to the trailing edge (`@xl:justify-end`), so row selects still share
 * one right edge.
 */
export const SETTINGS_WIDTH_SELECT_CLASS = 'w-fit min-w-[8ch] max-w-[28ch]';

/**
 * Short text field in a row (a name, an id): full width when stacked below
 * `@xl`, and `14rem` on `@xl`+. `SettingsFieldRow` packs it to the trailing edge
 * (`@xl:justify-end`), so a section of selects and short inputs keeps one right
 * edge.
 */
export const SETTINGS_WIDTH_SHORT_TEXT_CLASS = 'w-full @xl:w-56';

/**
 * Long text field, textarea, or stacked control cluster (select/input plus a
 * reset): fills its column up to a readable cap.
 */
export const SETTINGS_WIDTH_LONG_TEXT_CLASS = 'w-full max-w-[24rem]';

/**
 * Width for every settings NumberInput stepper. Font-relative for the same
 * reason as the trigger cap above: a rem-fixed `w-16`/`w-20`/`w-24`/`w-32`
 * clips its own digits once the interface font is scaled up. The explicit
 * `typography-ui-label` pins `ch` to the same scaled font the inner numeric
 * field renders in, since the wrapper would otherwise inherit an unscaled one.
 * The rem part holds the two buttons, which are wider on a phone than `ch`
 * grows; the `ch` part holds five digits, the longest value (a port).
 */
export const SETTINGS_WIDTH_NUMBER_CLASS = 'typography-ui-label w-[calc(5.75rem+5ch)]';

/** Compact reset / icon action next to a settings-pane control (matches h-7 controls). */
export const SETTINGS_ICON_BUTTON_CLASS =
  'h-7 w-7 px-0 text-muted-foreground hover:text-foreground';

/**
 * The same icon action in a dialog: dialogs size to the window and keep the
 * `Input` default footprint (h-8), so their action matches that instead of the
 * settings pane's h-7 row.
 */
export const SETTINGS_DIALOG_ICON_BUTTON_CLASS =
  'h-8 w-8 px-0 text-muted-foreground hover:text-foreground';

/** Custom dropdown triggers (ModelSelector / AgentSelector) in settings field rows. */
// oxlint-disable-next-line react/only-export-components
export const SETTINGS_CUSTOM_TRIGGER_CLASS = cn(
  dropdownTriggerVariants(),
  SETTINGS_HUG_WIDTH_CLASS,
);

/**
 * Row wrapping a NumberInput + unit label + reset.
 * Keep the stepper intrinsic — never flex-grow it or +/- buttons stretch unevenly.
 * The row is block-level, so it still fills a stacked cell, while in a field
 * row it stays content-wide and the row's trailing alignment pushes it across.
 */
export const SETTINGS_NUMBER_STEPPER_ROW_CLASS = 'flex min-w-0 items-center gap-2';

/** Unit suffix next to a settings number stepper (%, px, …). */
export const SETTINGS_NUMBER_UNIT_CLASS =
  'typography-meta shrink-0 text-muted-foreground tabular-nums';

/**
 * Stack of field rows and mixed shapes (a field row next to a checkbox row,
 * a role editor next to OMP rows). Never the 6px checkbox stack.
 */
export const SETTINGS_SPACE_ROW_CLASS = 'space-y-4';

/** Pure checkbox / radio list stack. */
export const SETTINGS_SPACE_CHECKBOX_CLASS = 'space-y-1.5';

/**
 * Settings heading classes by context (size + default color).
 * Prefer these over ad-hoc typography-* + color combinations.
 */
/** L1 — page / detail-pane title (larger, quieter than section titles). */
export const SETTINGS_PAGE_TITLE_CLASS =
  'typography-settings-page-title text-muted-foreground';
/** L2 — section title inside a settings page. */
export const SETTINGS_SECTION_TITLE_CLASS =
  'typography-settings-section-title text-foreground';
/** L3 — control-group heading inside a section. */
const SETTINGS_GROUP_TITLE_CLASS =
  'typography-settings-group-title text-foreground';
/** L4 — field / control labels. */
export const SETTINGS_FIELD_LABEL_CLASS =
  'typography-settings-field-label text-foreground';
/** Supporting copy under page or section titles. */
export const SETTINGS_DESCRIPTION_CLASS =
  'typography-settings-description text-muted-foreground';
/** Supporting copy under group titles and fields. */
export const SETTINGS_HELPER_CLASS = 'typography-meta text-muted-foreground';
/** Callout / alert headline inside a section (not a control-group title). */
export const SETTINGS_CALLOUT_TITLE_CLASS = 'typography-meta font-medium text-foreground';
/** Brand / product name under a logo — quieter than L1 page title. */
export const SETTINGS_BRAND_TITLE_CLASS =
  'typography-settings-section-title text-foreground';

export const SettingsBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="shrink-0 typography-micro px-1 rounded leading-none pb-px text-[var(--status-warning)] bg-[var(--status-warning)]/10">
    {children}
  </span>
);

interface SettingsSectionProps {
  /** Section title. Strings render as the shared h2 style. */
  title?: React.ReactNode;
  /** Optional supporting text under the title. */
  description?: React.ReactNode;
  /** Optional icon/badge next to the title. */
  titleAccessory?: React.ReactNode;
  /** Helper text hidden behind an info icon next to the title. */
  info?: React.ReactNode;
  /** Optional action aligned to the right of the header. */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Show a top border divider.
   * Use `false` for the first section under the page header.
   * @default true
   */
  divider?: boolean;
  className?: string;
  contentClassName?: string;
  settingsItem?: string;
}

/**
 * Shared settings section chrome: single-style header + optional divider.
 */
export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  description,
  titleAccessory,
  info,
  headerAction,
  children,
  divider = true,
  className,
  contentClassName,
  settingsItem,
}) => {
  const hasHeader = title != null || description != null || headerAction != null || info != null;

  return (
    <section
      data-settings-item={settingsItem}
      className={cn(
        'space-y-5',
        divider ? 'border-t border-edge py-8' : 'pb-8',
        className,
      )}
    >
      {hasHeader ? (
        <div className="flex min-w-0 flex-col items-start justify-between gap-3 @xl:flex-row">
          <div className="min-w-0 space-y-1">
            {title != null ? (
              <div className="flex items-center gap-2">
                {typeof title === 'string' || typeof title === 'number' ? (
                  <h2 className={SETTINGS_SECTION_TITLE_CLASS}>{title}</h2>
                ) : (
                  title
                )}
                {titleAccessory}
                {info != null ? <SettingsInfoHint>{info}</SettingsInfoHint> : null}
              </div>
            ) : null}
            {description != null ? (
              <div className={SETTINGS_DESCRIPTION_CLASS}>{description}</div>
            ) : null}
          </div>
          {headerAction ? <div className="min-w-0 max-w-full @xl:shrink-0">{headerAction}</div> : null}
        </div>
      ) : null}
      <div className={cn(contentClassName)}>{children}</div>
    </section>
  );
};

interface SettingsTwoColumnProps {
  children: React.ReactNode;
  className?: string;
}

/** Responsive two-column settings grid used when space allows. */
export const SettingsTwoColumn: React.FC<SettingsTwoColumnProps> = ({
  children,
  className,
}) => {
  return (
    <div className={cn('grid grid-cols-1 gap-6 @3xl:grid-cols-2 @3xl:gap-10', className)}>
      {children}
    </div>
  );
};

interface SettingsGroupTitleProps {
  children: React.ReactNode;
  className?: string;
  as?: 'h2' | 'h3' | 'div';
}

/** In-section control-group heading (quieter than SettingsSection title). */
export const SettingsGroupTitle: React.FC<SettingsGroupTitleProps> = ({
  children,
  className,
  as: Tag = 'h3',
}) => {
  return (
    <Tag className={cn(SETTINGS_GROUP_TITLE_CLASS, className)}>
      {children}
    </Tag>
  );
};

interface SettingsControlGroupProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Helper text hidden behind an info icon next to the group title. */
  info?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  settingsItem?: string;
}

/** Labeled control cluster inside a section (radios, chips, stacked fields). */
export const SettingsControlGroup: React.FC<SettingsControlGroupProps> = ({
  title,
  description,
  info,
  children,
  className,
  contentClassName,
  settingsItem,
}) => {
  return (
    <div data-settings-item={settingsItem} className={cn('space-y-2', className)}>
      {title != null || description != null || info != null ? (
        <div className="space-y-0.5">
          {title != null ? (
            <div className="flex items-center gap-1.5">
              <SettingsGroupTitle>{title}</SettingsGroupTitle>
              {info != null ? <SettingsInfoHint>{info}</SettingsInfoHint> : null}
            </div>
          ) : null}
          {description != null ? (
            <p className={SETTINGS_HELPER_CLASS}>{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className={cn(contentClassName)}>{children}</div>
    </div>
  );
};

interface SettingsStackedFieldProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Helper text hidden behind an info icon next to the label. */
  info?: React.ReactNode;
  /** Where helper text sits relative to the control. @default 'before' */
  descriptionPlacement?: 'before' | 'after';
  children: React.ReactNode;
  settingsItem?: string;
  className?: string;
  controlClassName?: string;
}

/**
 * Label (+ optional description) above a control — for two-column cells.
 * Prefer this over SettingsFieldRow inside SettingsTwoColumn (FieldRow overflows half-width columns).
 */
export const SettingsStackedField: React.FC<SettingsStackedFieldProps> = ({
  label,
  description,
  info,
  descriptionPlacement = 'before',
  children,
  settingsItem,
  className,
  controlClassName,
}) => {
  const descriptionNode =
    description != null ? (
      <p className={SETTINGS_HELPER_CLASS}>{description}</p>
    ) : null;

  return (
    <div data-settings-item={settingsItem} className={cn('space-y-2', className)}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <div className={SETTINGS_FIELD_LABEL_CLASS}>{label}</div>
          {info != null ? <SettingsInfoHint>{info}</SettingsInfoHint> : null}
        </div>
        {descriptionPlacement === 'before' ? descriptionNode : null}
      </div>
      <div className={cn('flex min-w-0 items-center gap-2', SETTINGS_WIDTH_LONG_TEXT_CLASS, controlClassName)}>{children}</div>
      {descriptionPlacement === 'after' ? descriptionNode : null}
    </div>
  );
};

interface SettingsFieldRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Helper text hidden behind an info icon next to the label. */
  info?: React.ReactNode;
  children: React.ReactNode;
  settingsItem?: string;
  className?: string;
  controlClassName?: string;
  /** Extra node next to the label, before the info hint (e.g. a "new" badge). */
  labelAccessory?: React.ReactNode;
  /** Align control to the trailing edge on desktop. @default true */
  alignEnd?: boolean;
}

/**
 * Side-by-side form row: fixed label column + control column that grows to
 * the row's trailing edge.
 *
 * The control column is `flex-1` at every width, so `alignEnd` (`@xl:justify-end`)
 * packs its content to the trailing edge (a `w-fit` column would have no free
 * space to distribute). That lets hug-width row selects (`SETTINGS_WIDTH_SELECT_CLASS`)
 * and other controls share one right edge without stretching short labels into
 * fixed-width bars. Below `@xl` the row stacks, so a narrow pane keeps label
 * above control. A control that fills the column (a row-filling input) passes
 * `controlClassName`.
 *
 * The row's own vertical padding keeps two stacked rows of 32px controls
 * apart (8px between them), so a list of field rows needs no spacing of its
 * own and labels keep one rhythm whatever control sits beside them.
 */
export const SettingsFieldRow: React.FC<SettingsFieldRowProps> = ({
  label,
  description,
  info,
  children,
  settingsItem,
  className,
  controlClassName,
  labelAccessory,
  alignEnd = true,
}) => {
  return (
    <div
      data-settings-item={settingsItem}
      className={cn(
        'flex flex-col gap-2 py-1 @xl:flex-row @xl:items-center @xl:gap-8',
        className,
      )}
    >
      <div className="min-w-0 @xl:w-56 @xl:shrink-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className={cn('min-w-0 truncate', SETTINGS_FIELD_LABEL_CLASS)}>{label}</div>
          {labelAccessory}
          {info != null ? <SettingsInfoHint>{info}</SettingsInfoHint> : null}
        </div>
        {description != null ? (
          <p className={cn(SETTINGS_HELPER_CLASS, 'mt-0.5')}>{description}</p>
        ) : null}
      </div>
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2',
          alignEnd && '@xl:justify-end',
          controlClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};

interface SettingsDisclosureProps {
  /** Item name; truncates. */
  title: React.ReactNode;
  /** Quiet one-line summary next to the title; truncates. */
  secondary?: React.ReactNode;
  /**
   * Trailing control (a checkbox row, say). It sits beside the toggle rather
   * than inside it, so it stays its own hit target — and adds its own focus
   * stop, so a header is two tab stops rather than one.
   */
  accessory?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Rendered only while expanded. */
  children: React.ReactNode;
  settingsItem?: string;
  className?: string;
}

/**
 * A flat list item that expands into its editor: one ghost header row with a
 * chevron, the item name and a quiet summary, then the editor below. No card,
 * border or divide chrome — a list of these reads as one flat stack.
 */
export const SettingsDisclosure: React.FC<SettingsDisclosureProps> = ({
  title,
  secondary,
  accessory,
  expanded,
  onToggle,
  children,
  settingsItem,
  className,
}) => {
  const contentId = React.useId();

  return (
    <div data-settings-item={settingsItem} className={cn('py-1', className)}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          aria-expanded={expanded}
          aria-controls={expanded ? contentId : undefined}
          onClick={onToggle}
          className="flex h-auto min-w-0 flex-1 justify-start gap-2 px-1 py-1.5"
        >
          <Icon
            name="arrow-right-s"
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-150',
              expanded && 'rotate-90 rtl:-rotate-90',
            )}
          />
          <span className={cn(SETTINGS_FIELD_LABEL_CLASS, 'min-w-0 truncate font-medium')}>
            {title}
          </span>
          {secondary != null ? (
            <span className={cn(SETTINGS_HELPER_CLASS, 'min-w-0 truncate')}>{secondary}</span>
          ) : null}
        </Button>
        {accessory}
      </div>
      {expanded ? (
        <div id={contentId} className={cn(SETTINGS_SPACE_ROW_CLASS, 'px-1 pb-4 pt-2')}>
          {children}
        </div>
      ) : null}
    </div>
  );
};

interface SettingsInsetProps {
  children: React.ReactNode;
  className?: string;
  settingsItem?: string;
}

/** Optional inset block under a section (spacing only; section dividers own borders). */
export const SettingsInset: React.FC<SettingsInsetProps> = ({
  children,
  className,
  settingsItem,
}) => {
  return (
    <div
      data-settings-item={settingsItem}
      className={cn('pt-4', className)}
    >
      {children}
    </div>
  );
};

interface SettingsCheckboxRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  settingsItem?: string;
  className?: string;
  labelAccessory?: React.ReactNode;
  /** Helper text hidden behind an info icon next to the label. */
  info?: React.ReactNode;
  /**
   * A line under the label that holds its own controls (a link). It sits
   * outside the clickable row, so the link is not a button inside a button,
   * and lines up with the label.
   */
  footer?: React.ReactNode;
}

/** Shared checkbox setting row with keyboard support. */
export const SettingsCheckboxRow: React.FC<SettingsCheckboxRowProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  ariaLabel,
  settingsItem,
  className,
  labelAccessory,
  info,
  footer,
}) => {
  const toggle = () => {
    if (!disabled) onChange(!checked);
  };

  const hasDescription = description != null;

  const row = (
    <div
      data-settings-item={footer != null ? undefined : settingsItem}
      className={cn(
        'group flex cursor-pointer gap-2 py-0.5',
        hasDescription ? 'items-start' : 'items-center',
        disabled && 'cursor-not-allowed',
        className,
      )}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={checked}
      aria-disabled={disabled || undefined}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          toggle();
        }
      }}
    >
      <Checkbox
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={ariaLabel}
        // With a description below, the box lines up with the label's line
        // rather than the middle of both lines.
        className={hasDescription ? 'mt-0.5 self-start' : undefined}
      />
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn(SETTINGS_FIELD_LABEL_CLASS, disabled && 'opacity-60')}>{label}</span>
          {labelAccessory}
          {info != null ? <SettingsInfoHint>{info}</SettingsInfoHint> : null}
        </div>
        {/* A description stays at full strength on a disabled row: it is
            usually what says why the option is off and how to turn it on. */}
        {hasDescription ? (
          <span className={SETTINGS_HELPER_CLASS}>{description}</span>
        ) : null}
      </div>
    </div>
  );

  if (footer == null) return row;
  return (
    <div data-settings-item={settingsItem}>
      {row}
      {/* Checkbox (16px) plus the row's gap (8px): the footer starts under the label. */}
      <div className="ps-6">{footer}</div>
    </div>
  );
};

interface SettingsRadioOptionProps {
  selected: boolean;
  onSelect: () => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/** Single radio option row used inside SettingsRadioGroup. */
export const SettingsRadioOption: React.FC<SettingsRadioOptionProps> = ({
  selected,
  onSelect,
  label,
  description,
  ariaLabel,
  disabled = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex cursor-pointer gap-2 py-0.5',
        description != null ? 'items-start' : 'items-center',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          if (!disabled) onSelect();
        }
      }}
    >
      <Radio
        checked={selected}
        onChange={onSelect}
        disabled={disabled}
        ariaLabel={ariaLabel}
        className={description != null ? 'mt-0.5' : undefined}
      />
      <div className="flex min-w-0 flex-col">
        <span
          className="typography-settings-field-label font-normal text-foreground"
        >
          {label}
        </span>
        {description != null ? (
          <span className={SETTINGS_HELPER_CLASS}>{description}</span>
        ) : null}
      </div>
    </div>
  );
};

interface SettingsRadioGroupProps {
  'aria-label': string;
  children: React.ReactNode;
  className?: string;
}

/** Accessible radio group wrapper with compact vertical spacing. */
export const SettingsRadioGroup: React.FC<SettingsRadioGroupProps> = ({
  'aria-label': ariaLabel,
  children,
  className,
}) => {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn(SETTINGS_SPACE_CHECKBOX_CLASS, className)}>
      {children}
    </div>
  );
};

interface SettingsChipOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  /** Replaces the raised look while this option is the chosen one (a brand colour, for example). */
  selectedClassName?: string;
  /**
   * Shown on hover (long-press on touch). The popup stays open while the
   * pointer is on it, so it may carry a link. Keep what the user must read
   * visible elsewhere: touch users rarely long-press.
   */
  tooltip?: React.ReactNode;
}

interface SettingsChipGroupProps<T extends string> {
  value: T;
  options: Array<SettingsChipOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * An option's explanation, shown at once on hover: it is how the choice is
 * read, not a hint after the fact. A disabled option, whose tooltip usually
 * says why, also opens it on tap, since a tap does nothing else there and
 * touch has no hover; a tap elsewhere closes it.
 */
const ChipTooltip: React.FC<{
  disabled?: boolean;
  content: React.ReactNode;
  children: React.ReactElement;
}> = ({ disabled, content, children }) => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const popupRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open || !disabled) return;
    // A press inside the popup is on its link (Set up access, say), which must still get the click.
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (triggerRef.current?.contains(event.target) || popupRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress, true);
  }, [disabled, open]);

  const popup = (
    <TooltipContent side="top" sideOffset={6} className="max-w-xs">
      <div ref={popupRef}>{content}</div>
    </TooltipContent>
  );
  if (!disabled) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        {popup}
      </Tooltip>
    );
  }
  return (
    <Tooltip delayDuration={0} open={open} onOpenChange={setOpen}>
      {/* A disabled button gets no pointer events, so the tooltip hangs on a
          wrapper. Base UI closes a tooltip when its trigger is pressed, so
          that handler is skipped, as in SettingsInfoHint. */}
      <TooltipTrigger
        asChild
        onPointerDown={(event) => event.preventBaseUIHandler()}
        // Opens, never toggles: with a mouse the hover has already opened it.
        onClick={(event) => {
          event.preventBaseUIHandler();
          setOpen(true);
        }}
      >
        <span ref={triggerRef} className="inline-flex" tabIndex={0}>{children}</span>
      </TooltipTrigger>
      {popup}
    </Tooltip>
  );
};

/**
 * Compact segmented enum picker, drawn like the active-pill tab strip: the
 * options sit in a recessed track and the chosen one is raised out of it.
 * The track is as tall as the other settings controls (32px), so a row with
 * chips lines up with a row holding a select or a stepper.
 */
export function SettingsChipGroup<T extends string>({
  value,
  options,
  onChange,
  className,
  'aria-label': ariaLabel,
}: SettingsChipGroupProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'oc-recessed inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const selected = value === option.value;
        const chip = (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            disabled={option.disabled}
            aria-pressed={selected}
            className={cn(
              'rounded-md !font-normal',
              selected
                // Light themes paint elevated darker than the canvas, so the
                // raised option takes the canvas colour there, like the tab pill.
                ? option.selectedClassName
                ?? 'oc-raised bg-[var(--surface-background)] text-foreground hover:bg-[var(--surface-background)] dark:bg-[var(--surface-elevated)] dark:hover:bg-[var(--surface-elevated)]'
                : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
        if (!option.tooltip) return chip;
        return (
          <ChipTooltip key={option.value} disabled={option.disabled} content={option.tooltip}>
            {chip}
          </ChipTooltip>
        );
      })}
    </div>
  );
}
