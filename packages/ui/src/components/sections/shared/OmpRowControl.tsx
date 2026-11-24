import React from 'react';
import type { OmpSetting, OmpSettingOption, OmpSettingValue } from '@openchamber/agent-contract';
import { useI18n, type I18nKey, type I18nParams } from '@/lib/i18n';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SettingsCheckboxRow,
  SettingsChipGroup,
  SettingsFieldRow,
  SETTINGS_NUMBER_STEPPER_ROW_CLASS,
  SETTINGS_NUMBER_UNIT_CLASS,
  SETTINGS_WIDTH_NUMBER_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { NumberInput } from '@/components/ui/number-input';
import { inferUnit, isSentinelOption, optionSlug, storedNumber, type OmpRowUnit } from './ompRowHelpers';

type Translate = (key: I18nKey, params?: I18nParams) => string;

const UNIT_LABEL_KEYS = {
  percent: 'settings.omp.unit.percent',
  seconds: 'settings.omp.unit.seconds',
  minutes: 'settings.omp.unit.minutes',
  hours: 'settings.omp.unit.hours',
  tokens: 'settings.omp.unit.tokens',
  milliseconds: 'settings.omp.unit.milliseconds',
  kilobytes: 'settings.omp.unit.kilobytes',
  lines: 'settings.omp.unit.lines',
  columns: 'settings.omp.unit.columns',
  calls: 'settings.omp.unit.calls',
} satisfies Record<OmpRowUnit, I18nKey>;

/** One option as the row draws it: already in the locale, with its explanation. */
interface RowChoice {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

/**
 * The locale's name and one-line explanation for an option.
 *
 * The key is the option's slug under the row, so option copy lives beside the
 * row's own label and description. OMP's English label is a fallback only a
 * setting the vocabulary has not covered yet can reach.
 */
function optionCopy(t: Translate, settingId: string, option: OmpSettingOption): RowChoice {
  // SAFETY: the locale key set is generated from the same registry ids and
  // option slugs that `settings-ui.test.ts` requires copy for, so every row
  // this control draws has these keys; a missing key just falls back below.
  const labelKey = `settings.omp.items.${settingId}.options.${optionSlug(option.value)}` as I18nKey;
  const label = t(labelKey);
  // SAFETY: the description key is the label key plus a suffix, so it is a
  // locale key exactly when the label one is.
  const descriptionKey = `${labelKey}.description` as I18nKey;
  const translated = t(descriptionKey);
  const description = translated !== descriptionKey ? translated : option.description;
  const choice: RowChoice = {
    value: option.value,
    label: label === labelKey ? option.label : label,
  };
  if (description) return { ...choice, description };
  return choice;
}

/**
 * A row's declared options in the locale. On a number row OMP's `default`
 * option means "no value" and takes the shared Default string; on an enum it
 * is an ordinary value whose copy already names it (`Standard`, say).
 */
function rowChoices(t: Translate, setting: OmpSetting, sentinelLabel?: string): RowChoice[] {
  const declared = setting.options ?? (setting.enumValues ?? []).map((choice) => ({ value: choice, label: choice }));
  return declared.map((option) =>
    sentinelLabel !== undefined && isSentinelOption(option.value)
      ? { ...optionCopy(t, setting.id, option), label: sentinelLabel }
      : optionCopy(t, setting.id, option));
}

/**
 * Settings select control for an OMP option row.
 *
 * Renders the `<Select>` trigger with `SETTINGS_WIDTH_SELECT_CLASS` so it hugs
 * its value between `8ch` and `28ch`. When the selected option carries an
 * explanation, the caller passes it to `SettingsFieldRow`'s `description` prop
 * so the helper text sits beneath the left field label while the trigger stays
 * vertically centered on the trailing edge.
 */
const OmpOptionSelect: React.FC<{
  label: string;
  value: string;
  choices: readonly RowChoice[];
  fallbackLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, choices, fallbackLabel, disabled, onChange }) => {
  const selected = choices.find((choice) => choice.value === value);
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS} aria-label={label}>
        <SelectValue>{selected?.label ?? fallbackLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/** The option whose stored value equals `value`, by exact or numeric match. */
function matchingOption(options: readonly OmpSettingOption[], value: OmpSettingValue): OmpSettingOption | undefined {
  const numeric = storedNumber(value);
  return options.find((option) => option.value === String(value)
    || (numeric !== undefined && Number(option.value) === numeric));
}

/**
 * One registry row: label and description from the locale, control from type/options.
 *
 * A boolean is an enable/disable switch, so it is a checkbox row; every other
 * type has a separate value control, so it is a field row (label left, control
 * trailing via `SettingsFieldRow`'s `@xl:justify-end`) exactly like the rest
 * of Settings. Hug-width row selects (`SETTINGS_WIDTH_SELECT_CLASS`) share the
 * same trailing right edge as the page's own rows.
 *
 * An enum keeps chips while its choices are short and unexplained; once the
 * list is long or a choice needs a sentence, it becomes a select and the
 * selected option's explanation sits beneath the field label via
 * `SettingsFieldRow`'s `description` prop.
 */
export const OmpRowControl: React.FC<{
  setting: OmpSetting;
  value: OmpSettingValue;
  disabled?: boolean;
  description?: React.ReactNode;
  info?: React.ReactNode;
  onChange: (value: OmpSettingValue) => void;
}> = ({ setting, value, disabled, description: descriptionProp, info: infoProp, onChange }) => {
  const { t } = useI18n();
  // SAFETY: `settings.omp.items.<id>.label` keys are generated for every
  // exposed row id, and `settings-ui.test.ts` fails when one is missing; the
  // fallback below only covers a row added between generations.
  const labelKey = `settings.omp.items.${setting.id}.label` as I18nKey;
  // The locale is the only user-facing name. `settings-ui.test.ts` fails when an
  // exposed row has no copy, so the OMP label is a fallback only a new setting
  // could reach, and the id never becomes prose: `modelRoles` used to render as
  // a raw id because its OMP label is empty.
  const label = t(labelKey) === labelKey ? (setting.label || setting.id.replace(/\./g, ' ')) : t(labelKey);
  // SAFETY: the description key differs from the label key only by its suffix
  // and belongs to the same generated row entry, so it is a locale key exactly
  // when the label one is.
  const descriptionKey = `settings.omp.items.${setting.id}.description` as I18nKey;
  const settingInfo = t(descriptionKey) === descriptionKey ? setting.description : t(descriptionKey);
  const info = infoProp ?? settingInfo;
  const anchor = `omp.${setting.id}`;

  if (setting.type === 'boolean') {
    return (
      <SettingsCheckboxRow
        settingsItem={anchor}
        checked={value === true}
        onChange={onChange}
        disabled={disabled}
        label={label}
        description={descriptionProp}
        info={info}
        ariaLabel={label}
      />
    );
  }

  if (setting.type === 'number') {
    if (setting.options && setting.options.length > 0) {
      const options = setting.options;
      // `-1` is a real option ("unlimited") on the rows that declare it; only a
      // row without it reads a stored -1 as OMP's unset sentinel.
      const isDefault = value === null || value === 'default'
        || (value === -1 && !options.some((option) => option.value === '-1'));
      const sentinel = options.find((option) => isSentinelOption(option.value));
      const matched = isDefault ? sentinel : matchingOption(options, value);
      const selectValue = isDefault
        ? (sentinel?.value ?? 'default')
        : (matched?.value ?? String(value));
      const fallbackLabel = isDefault
        ? t('settings.omp.value.default')
        : value === undefined || value === null ? '' : String(value);
      const choices = rowChoices(t, setting, t('settings.omp.value.default'));
      const selectedChoice = choices.find((choice) => choice.value === selectValue);

      return (
        <SettingsFieldRow
          label={label}
          description={descriptionProp ?? selectedChoice?.description}
          info={info}
          settingsItem={anchor}
        >
          <OmpOptionSelect
            label={label}
            value={selectValue}
            choices={choices}
            fallbackLabel={fallbackLabel}
            disabled={disabled}
            onChange={(next) => {
              if (isSentinelOption(next)) {
                // The sentinel option stands for "no value", which OMP's config
                // layer spells -1 on every row that declares the option.
                onChange(-1);
                return;
              }
              const numeric = Number(next);
              onChange(Number.isNaN(numeric) ? next : numeric);
            }}
          />
        </SettingsFieldRow>
      );
    }

    const unit = inferUnit(setting.id);
    // `-1` is OMP's unset sentinel on a free-form number, so the stepper shows
    // empty with the Default placeholder rather than the literal -1.
    const stored = storedNumber(value);
    const stepperValue = stored !== undefined && stored !== -1 ? stored : undefined;
    return (
      <SettingsFieldRow label={label} description={descriptionProp} info={info} settingsItem={anchor}>
        <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
          {/* The chip goes first so the stepper is the trailing element: the
              control column packs to the row's inline end, so the stepper ends
              on the same right edge as every select, with or without a unit.
              After the stepper, its width would push the stepper off that edge. */}
          {unit ? <span className={SETTINGS_NUMBER_UNIT_CLASS}>{t(UNIT_LABEL_KEYS[unit])}</span> : null}
          <NumberInput
            value={stepperValue}
            placeholder={t('settings.omp.value.default')}
            onValueChange={onChange}
            onClear={() => onChange(null)}
            disabled={disabled}
            className={SETTINGS_WIDTH_NUMBER_CLASS}
            aria-label={label}
          />
        </div>
      </SettingsFieldRow>
    );
  }

  if (setting.type === 'string') {
    return (
      <SettingsFieldRow label={label} description={descriptionProp} info={info} settingsItem={anchor}>
        <Input
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          inputSize="compact"
          className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
          aria-label={label}
        />
      </SettingsFieldRow>
    );
  }

  const choices = rowChoices(t, setting);
  const current = value === null || value === undefined ? '' : String(value);
  const explained = choices.some((choice) => choice.description !== undefined);
  if (choices.length <= 3 && !explained) {
    return (
      <SettingsFieldRow label={label} description={descriptionProp} info={info} settingsItem={anchor}>
        <SettingsChipGroup
          value={current}
          aria-label={label}
          options={choices.map((choice) => ({ value: choice.value, label: choice.label }))}
          onChange={(next) => onChange(next)}
        />
      </SettingsFieldRow>
    );
  }

  const selectedChoice = choices.find((choice) => choice.value === current);

  return (
    <SettingsFieldRow
      label={label}
      description={descriptionProp ?? selectedChoice?.description}
      info={info}
      settingsItem={anchor}
    >
      <OmpOptionSelect
        label={label}
        value={current}
        choices={choices}
        fallbackLabel={current === '' ? t('settings.omp.value.default') : current}
        disabled={disabled}
        onChange={(next) => onChange(next)}
      />
    </SettingsFieldRow>
  );
};
