import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Radio } from '@/components/ui/radio';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { dropdownTriggerVariants } from '@/components/ui/dropdown-trigger';
<<<<<<< HEAD
import { Icon } from '@/components/icon/Icon';
||||||| bc50ba56aa
=======
import { useI18n } from '@/lib/i18n';
import { isNewSetting } from '@/lib/settings/newSettings';
import { isSettingsAnchorAvailable, type SettingsSearchAvailabilityContext } from '@/lib/settings/search';
>>>>>>> upstream/main
import { cn } from '@/lib/utils';
import { SettingsInfoHint } from './SettingsInfoHint';

<<<<<<< HEAD
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
||||||| bc50ba56aa
/**
 * Width cap shared by every settings value picker.
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
const SETTINGS_TRIGGER_WIDTH_CLASS = 'w-fit max-w-[28ch]';
=======
const SETTINGS_TRIGGER_WIDTH_CLASS = 'w-fit max-w-[28ch]';
>>>>>>> upstream/main

<<<<<<< HEAD
/**
 * Settings select trigger in stacked cells — two-column cells, dialogs and
 * wrap rows, where there is no shared control column to line up with, so it
 * hugs its value.
 */
export const SETTINGS_SELECT_TRIGGER_CLASS = SETTINGS_HUG_WIDTH_CLASS;
||||||| bc50ba56aa
/** Settings select trigger in stacked cells. */
export const SETTINGS_SELECT_TRIGGER_CLASS = SETTINGS_TRIGGER_WIDTH_CLASS;
=======
export const SETTINGS_SELECT_TRIGGER_CLASS = SETTINGS_TRIGGER_WIDTH_CLASS;
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
/** Settings select trigger in SettingsFieldRow control columns. */
export const SETTINGS_SELECT_ROW_TRIGGER_CLASS = SETTINGS_TRIGGER_WIDTH_CLASS;
=======
export const SETTINGS_SELECT_ROW_TRIGGER_CLASS = SETTINGS_TRIGGER_WIDTH_CLASS;
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
/**
 * Width for every settings NumberInput stepper. Font-relative for the same
 * reason as the trigger cap above: a rem-fixed `w-16`/`w-20`/`w-24`/`w-32`
 * clips its own digits once the interface font is scaled up. The explicit
 * `typography-ui-label` pins `ch` to the same scaled font the inner numeric
 * field renders in, since the wrapper would otherwise inherit an unscaled one.
 * The rem part holds the two buttons, which are wider on a phone than `ch`
 * grows; the `ch` part holds five digits, the longest value (a port).
 */
export const SETTINGS_NUMBER_INPUT_CLASS = 'typography-ui-label w-[calc(5.75rem+5ch)]';
=======
export const SETTINGS_NUMBER_INPUT_CLASS = 'typography-ui-label w-[calc(5.75rem+5ch)]';
>>>>>>> upstream/main

<<<<<<< HEAD
/** Compact reset / icon action next to a settings-pane control (matches h-7 controls). */
||||||| bc50ba56aa
/** Compact reset / icon action next to a settings control (matches h-8 controls). */
=======
>>>>>>> upstream/main
export const SETTINGS_ICON_BUTTON_CLASS =
  'h-7 w-7 px-0 text-muted-foreground hover:text-foreground';

/**
 * The same icon action in a dialog: dialogs size to the window and keep the
 * `Input` default footprint (h-8), so their action matches that instead of the
 * settings pane's h-7 row.
 */
export const SETTINGS_DIALOG_ICON_BUTTON_CLASS =
  'h-8 w-8 px-0 text-muted-foreground hover:text-foreground';

// oxlint-disable-next-line react/only-export-components
export const SETTINGS_CUSTOM_TRIGGER_CLASS = cn(
  dropdownTriggerVariants(),
  SETTINGS_HUG_WIDTH_CLASS,
);

<<<<<<< HEAD
/**
 * Row wrapping a NumberInput + unit label + reset.
 * Keep the stepper intrinsic — never flex-grow it or +/- buttons stretch unevenly.
 * The row is block-level, so it still fills a stacked cell, while in a field
 * row it stays content-wide and the row's trailing alignment pushes it across.
 */
export const SETTINGS_NUMBER_STEPPER_ROW_CLASS = 'flex min-w-0 items-center gap-2';
||||||| bc50ba56aa
/** Shared width for stacked control clusters (select/input + reset). */
export const SETTINGS_CONTROL_CLUSTER_CLASS = 'w-full max-w-[24rem]';

/**
 * Row wrapping a NumberInput + unit label + reset.
 * Keep the stepper intrinsic — never flex-grow it or +/- buttons stretch unevenly.
 */
export const SETTINGS_NUMBER_STEPPER_ROW_CLASS = 'flex w-full min-w-0 items-center gap-2';
=======
export const SETTINGS_CONTROL_CLUSTER_CLASS = 'w-full max-w-[24rem]';

export const SETTINGS_NUMBER_STEPPER_ROW_CLASS = 'flex w-full min-w-0 items-center gap-2';
>>>>>>> upstream/main

export const SETTINGS_NUMBER_UNIT_CLASS =
  'typography-meta shrink-0 text-muted-foreground tabular-nums';

<<<<<<< HEAD
/**
 * Stack of field rows and mixed shapes (a field row next to a checkbox row,
 * a role editor next to OMP rows). Never the 6px checkbox stack.
 */
export const SETTINGS_SPACE_ROW_CLASS = 'space-y-4';
||||||| bc50ba56aa
/** Vertical stack spacing for fields inside a column. */
export const SETTINGS_FIELDS_STACK_CLASS = 'space-y-4';
=======
export const SETTINGS_FIELDS_STACK_CLASS = 'space-y-4';
>>>>>>> upstream/main

<<<<<<< HEAD
/** Pure checkbox / radio list stack. */
export const SETTINGS_SPACE_CHECKBOX_CLASS = 'space-y-1.5';
||||||| bc50ba56aa
/** Compact checkbox / radio list stack. */
export const SETTINGS_OPTION_STACK_CLASS = 'space-y-1.5';
=======
export const SETTINGS_OPTION_STACK_CLASS = 'space-y-1.5';
>>>>>>> upstream/main

export const SETTINGS_PAGE_TITLE_CLASS =
  'typography-settings-page-title text-muted-foreground';
export const SETTINGS_SECTION_TITLE_CLASS =
  'typography-settings-section-title text-foreground';
const SETTINGS_GROUP_TITLE_CLASS =
  'typography-settings-group-title text-foreground';
export const SETTINGS_FIELD_LABEL_CLASS =
  'typography-settings-field-label text-foreground';
export const SETTINGS_DESCRIPTION_CLASS =
  'typography-settings-description text-muted-foreground';
export const SETTINGS_HELPER_CLASS = 'typography-meta text-muted-foreground';
export const SETTINGS_CALLOUT_TITLE_CLASS = 'typography-meta font-medium text-foreground';
export const SETTINGS_BRAND_TITLE_CLASS =
  'typography-settings-section-title text-foreground';

export const SettingsBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="shrink-0 typography-micro px-1 rounded leading-none pb-px text-[var(--status-warning)] bg-[var(--status-warning)]/10">
    {children}
  </span>
);

const SettingsAvailabilityContext = React.createContext<SettingsSearchAvailabilityContext | null>(null);
export const SettingsAvailabilityProvider = SettingsAvailabilityContext.Provider;

export const SettingsNewBadge: React.FC<{ items: readonly (string | undefined)[] }> = ({ items }) => {
  const { t } = useI18n();
  const ctx = React.useContext(SettingsAvailabilityContext);
  if (!ctx || !items.some((item) => item != null && isNewSetting(item) && isSettingsAnchorAvailable(item, ctx))) return null;
  return <SettingsBadge>{t('settings.view.badge.new')}</SettingsBadge>;
};

interface SettingsSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  titleAccessory?: React.ReactNode;
  info?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  divider?: boolean;
  className?: string;
  contentClassName?: string;
  settingsItem?: string;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  description,
  titleAccessory,
  info,
  headerAction,
  children,
  divider = false,
  className,
  contentClassName,
  settingsItem,
}) => {
  const hasHeader = title != null || description != null || headerAction != null || info != null;

  return (
    <section
      data-settings-item={settingsItem}
      className={cn(
        'space-y-5 pt-10 first:pt-0',
        divider && 'border-t border-edge',
        className,
      )}
    >
      {hasHeader ? (
        <div className="flex min-w-0 flex-col items-start justify-between gap-3 @xl:flex-row">
          <div className="min-w-0 space-y-1">
            {title != null ? (
              <div className={cn('flex items-center gap-2', headerAction != null && 'min-h-7')}>
                {typeof title === 'string' || typeof title === 'number' ? (
                  <h2 className={SETTINGS_SECTION_TITLE_CLASS}>{title}</h2>
                ) : (
                  title
                )}
                <SettingsNewBadge items={[settingsItem]} />
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
  info?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  settingsItem?: string;
}

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
              <SettingsNewBadge items={[settingsItem]} />
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
  info?: React.ReactNode;
  descriptionPlacement?: 'before' | 'after';
  children: React.ReactNode;
  settingsItem?: string;
  className?: string;
  controlClassName?: string;
}

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
          <SettingsNewBadge items={[settingsItem]} />
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
  info?: React.ReactNode;
  children: React.ReactNode;
  settingsItem?: string;
  className?: string;
  controlClassName?: string;
  labelAccessory?: React.ReactNode;
  alignEnd?: boolean;
}

<<<<<<< HEAD
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
||||||| bc50ba56aa
/**
 * Side-by-side form row: fixed label column + control cluster.
 * Use inside full-width sections or single columns.
 *
 * The row's own vertical padding keeps two stacked rows of 32px controls
 * apart (8px between them), so a list of field rows needs no spacing of its
 * own and labels keep one rhythm whatever control sits beside them.
 */
=======
>>>>>>> upstream/main
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
          <SettingsNewBadge items={[settingsItem]} />
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
  info?: React.ReactNode;
  footer?: React.ReactNode;
}

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
        className={hasDescription ? 'mt-0.5 self-start' : undefined}
      />
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn(SETTINGS_FIELD_LABEL_CLASS, disabled && 'opacity-60')}>{label}</span>
          <SettingsNewBadge items={[settingsItem]} />
          {labelAccessory}
          {info != null ? <SettingsInfoHint>{info}</SettingsInfoHint> : null}
        </div>
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
  selectedClassName?: string;
  tooltip?: React.ReactNode;
}

interface SettingsChipGroupProps<T extends string> {
  value: T;
  options: Array<SettingsChipOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  'aria-label'?: string;
}

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
      <TooltipTrigger
        asChild
        onPointerDown={(event) => event.preventBaseUIHandler()}
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
