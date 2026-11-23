import React from 'react';
import { formatModelRef, parseModelSelector, type Model } from '@openchamber/agent-contract';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import {
  SettingsFieldRow,
  SettingsStackedField,
  SETTINGS_WIDTH_SELECT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import {
  concreteEffort,
  levelLabel,
  listModelEfforts,
  splitRoleSelector,
  formatRoleSelector,
  modelForSelector,
} from '@/components/sections/shared/modelRoleSelectors';

interface ModelEffortPickerProps {
  model: Model | undefined;
  /** The level the selector carries explicitly; empty means "the model's own". */
  effort: string;
  /** The session-wide level an unset model default inherits. */
  globalLevel?: string;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (level: string) => void;
}

/**
 * The one effort control: lists the model's concrete levels and shows the
 * level that currently runs. There is no synthetic "default" row, so what the
 * trigger says is what a send would carry.
 */
export const ModelEffortPicker: React.FC<ModelEffortPickerProps> = ({
  model, effort: explicitEffort, globalLevel, disabled, ariaLabel, onChange,
}) => {
  const { t } = useI18n();
  const efforts = React.useMemo(() => listModelEfforts(model, t), [model, t]);
  const current = concreteEffort(model, explicitEffort, globalLevel);
  // The level that runs has to be selectable whether or not the catalog lists
  // it: a level written earlier, or the session-wide one, still runs.
  const options = React.useMemo(
    () => (efforts.some((entry) => entry.level === current)
      ? efforts
      : [...efforts, { level: current, label: levelLabel(t, current) }]),
    [current, efforts, t],
  );
  if (options.length === 0) return null;
  const currentLabel = options.find((entry) => entry.level === current)?.label ?? current;
  return (
    <Select value={current} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS} aria-label={ariaLabel}>
        <SelectValue>{currentLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((entry) => (
          <SelectItem key={entry.level} value={entry.level}>{entry.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

interface ModelRoleEditorProps {
  /** Role id this row writes, for example `vision` or `commit`. */
  role: string;
  /** The whole `modelRoles` record, so an unset role can say what it inherits. */
  roles: Readonly<Record<string, string>>;
  models: readonly Model[];
  /**
   * The project this editor describes, so its model picker reads that
   * project's catalog. Omitted means the active project, which is a different
   * workspace whenever Settings follows its own selector.
   */
  directory?: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  info?: React.ReactNode;
  /** Anchor for the model control. */
  settingsItem?: string;
  /** Accessible name for the effort control when the row's label is not it. */
  effortLabel?: string;
  disabled?: boolean;
  /** The role's value is still loading; the picker shows its loading trigger, never the inherit placeholder. */
  loading?: boolean;
  /** Row layout: a field row in a section, or a stacked cell in a two-column grid. */
  layout?: 'row' | 'stacked';
  /** '' clears the role, which is OMP's explicit inherit state. */
  onChange: (selector: string) => void;
  /**
   * The effort level the role inherits when its selector omits one, so the
   * effort control can name what an unset suffix means instead of guessing.
   */
  globalLevel?: string;
}

/**
 * One editor for every model role a Settings page assigns.
 *
 * The old page rebuilt this per surface: a 16-card grid on the OMP page, a
 * select per role on Defaults, another on Git, each with its own parser,
 * `__inherit__`/`__default__` sentinel and duplicated effort list. Assigning a
 * role means picking a catalog model and, for a model that reasons, a level;
 * the selector grammar and the effort vocabulary live here once.
 */
export const ModelRoleEditor: React.FC<ModelRoleEditorProps> = ({
  role, roles, models, directory, globalLevel, label, description, info, settingsItem, effortLabel,
  disabled, loading, layout = 'row', onChange,
}) => {
  const { t } = useI18n();
  const selector = roles[role] ?? '';
  const { model: modelId, effort } = React.useMemo(
    () => splitRoleSelector(selector, models),
    [selector, models],
  );
  const model = React.useMemo(() => modelForSelector(models, modelId), [models, modelId]);
  const parsed = React.useMemo(() => parseModelSelector(modelId), [modelId]);

  const onModelChange = React.useCallback(
    (providerId: string, nextModelId: string) => {
      if (!providerId || !nextModelId) {
        onChange('');
        return;
      }
      const nextModel = models.find((candidate) => candidate.provider === providerId && candidate.modelId === nextModelId);
      const nextEfforts = nextModel?.reasoningEffortSupported ? nextModel.reasoningOptions : [];
      const keepsEffort = effort !== '' && (nextEfforts.length === 0 || nextEfforts.some((option) => option.reasoningEffort === effort));
      onChange(formatRoleSelector(formatModelRef({ provider: providerId, modelId: nextModelId }), keepsEffort ? effort : ''));
    },
    [effort, models, onChange],
  );

  const onEffortChange = React.useCallback(
    (level: string) => onChange(formatRoleSelector(modelId, level)),
    [modelId, onChange],
  );

  const controls = (
    <>
      <ModelSelector
        providerId={parsed?.providerId ?? ''}
        modelId={parsed?.modelId ?? ''}
        onChange={onModelChange}
        directory={directory}
        disabled={disabled}
        loading={loading}
        placeholder={t('settings.omp.modelRoles.inheritFallback')}
        className={SETTINGS_WIDTH_SELECT_CLASS}
      />
      <ModelEffortPicker
        model={model}
        effort={effort}
        globalLevel={globalLevel}
        disabled={disabled}
        ariaLabel={effortLabel ?? t('settings.omp.modelRoles.effortAria', { role: String(label) })}
        onChange={onEffortChange}
      />
    </>
  );

  if (layout === 'stacked') {
    return (
      <SettingsStackedField
        label={label}
        description={description}
        info={info}
        settingsItem={settingsItem}
        controlClassName="max-w-none"
      >
        <div className="flex flex-wrap items-center gap-2">
          {controls}
        </div>
      </SettingsStackedField>
    );
  }
  return (
    <SettingsFieldRow
      label={label}
      description={description}
      info={info}
      settingsItem={settingsItem}
    >
      {controls}
    </SettingsFieldRow>
  );
};
