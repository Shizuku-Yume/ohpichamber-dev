import React from 'react';
import type { Model } from '@openchamber/agent-contract';
import {
  SettingsCheckboxRow,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { formatGoalTokens } from '@/lib/sessionGoalMetadata';
import { cn } from '@/lib/utils';
import { modelModalitiesForKind, type ModelAutoFillField, type ModelFieldErrors, type ModelRow } from './custom-provider-form';

type ModelTextField = 'modelId' | 'name' | 'contextWindow' | 'maxOutputTokens';

interface CustomProviderModelRowProps {
  model: ModelRow;
  errors?: ModelFieldErrors;
  expanded: boolean;
  onToggle: () => void;
  onChange: (key: ModelTextField, value: string) => void;
  onToggleModality: (modality: Model['modalities'][number]) => void;
  onToolsChange: (tools: boolean) => void;
  /** The row changed a field by hand; auto-fill must never overwrite it. */
  onUserEdit: (field: ModelAutoFillField) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

const positive = (value: string): number | null => {
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * One model of a custom provider. Collapsed, it reads as a single line (name,
 * id, the limits and anything beyond plain text), so a provider with dozens
 * of imported models stays scannable; the editor opens on demand.
 */
export const CustomProviderModelRow: React.FC<CustomProviderModelRowProps> = ({
  model,
  errors,
  expanded,
  onToggle,
  onChange,
  onToggleModality,
  onToolsChange,
  onUserEdit,
  onRemove,
  disabled = false,
}) => {
  const { t } = useI18n();
  const editorId = React.useId();
  const modelId = model.modelId.trim();
  const name = model.name.trim();
  const title = name || modelId || t('settings.providers.page.custom.models.untitled');
  const context = positive(model.contextWindow);
  const output = positive(model.maxOutputTokens);
  const modalities = modelModalitiesForKind(model.nativeKind);
  const extraInputs = model.modalities.filter((modality) => modality !== 'text');
  // The writer needs text or image on every model, so the last of those two
  // stays checked even on a tts row where audio alone would read as valid.
  const baseModalityCount = model.modalities.filter((modality) => modality === 'text' || modality === 'image').length;
  const summary = [
    context ? t('settings.providers.page.custom.discovery.contextValue', { value: formatGoalTokens(context) }) : null,
    output ? t('settings.providers.page.custom.discovery.outputValue', { value: formatGoalTokens(output) }) : null,
    extraInputs.length > 0 ? extraInputs.join(', ') : null,
    model.toolsSupported === false ? t('settings.providers.page.custom.models.toolsOff') : null,
  ].filter(Boolean).join(' · ');

  const fieldError = (message?: string) => (
    message ? <p className="typography-meta text-[var(--status-error)]">{message}</p> : null
  );

  // A filled value names where it came from; a typed one needs no label.
  const sourceNote = (field: ModelAutoFillField) => {
    const source = model.filledFrom[field];
    if (!source) return null;
    return <p className={cn('mt-0.5', SETTINGS_HELPER_CLASS)}>{t(`settings.providers.page.custom.models.source.${source}`)}</p>;
  };

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-1 py-1">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-expanded={expanded}
          aria-controls={editorId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-start hover:bg-[var(--interactive-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--interactive-focus-ring)]"
        >
          <Icon
            name="arrow-right-s"
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90 rtl:-rotate-90')}
            aria-hidden
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className={cn('truncate', SETTINGS_FIELD_LABEL_CLASS, !name && !modelId && 'text-muted-foreground')}>{title}</span>
              {name && modelId && name !== modelId ? (
                <span className="truncate font-mono text-xs text-muted-foreground">{modelId}</span>
              ) : null}
            </span>
            {summary ? <span className={cn('truncate', SETTINGS_HELPER_CLASS)}>{summary}</span> : null}
          </span>
        </button>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={SETTINGS_ICON_BUTTON_CLASS}
            onClick={onRemove}
            disabled={disabled}
            aria-label={t('settings.providers.page.custom.models.remove')}
          >
            <Icon name="delete-bin" className="size-4" />
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div id={editorId} className="space-y-3 pb-4 ps-7 pe-1 pt-1">
          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.models.idLabel')}</label>
              <Input
                value={model.modelId}
                onChange={(event) => onChange('modelId', event.target.value)}
                placeholder={t('settings.providers.page.custom.models.idPlaceholder')}
                className="h-8 rounded-md px-3 font-mono text-xs"
                aria-invalid={Boolean(errors?.modelId)}
                aria-label={t('settings.providers.page.custom.models.idLabel')}
                disabled={disabled}
              />
              {fieldError(errors?.modelId)}
            </div>
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.models.nameLabel')}</label>
              <Input
                value={model.name}
                onChange={(event) => onChange('name', event.target.value)}
                placeholder={t('settings.providers.page.custom.models.namePlaceholder')}
                className="h-8 rounded-md px-3"
                aria-invalid={Boolean(errors?.name)}
                aria-label={t('settings.providers.page.custom.models.nameLabel')}
                disabled={disabled}
              />
              {fieldError(errors?.name)}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.models.contextWindow')}</label>
              <Input
                inputMode="numeric"
                value={model.contextWindow}
                onChange={(event) => {
                  onUserEdit('contextWindow');
                  onChange('contextWindow', event.target.value);
                }}
                placeholder="128000"
                className="h-8 rounded-md px-3 font-mono text-xs"
                aria-invalid={Boolean(errors?.contextWindow)}
                aria-label={t('settings.providers.page.custom.models.contextWindow')}
                disabled={disabled}
              />
              {fieldError(errors?.contextWindow)}
              {sourceNote('contextWindow')}
            </div>
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.models.maxOutputTokens')}</label>
              <Input
                inputMode="numeric"
                value={model.maxOutputTokens}
                onChange={(event) => {
                  onUserEdit('maxOutputTokens');
                  onChange('maxOutputTokens', event.target.value);
                }}
                placeholder="16384"
                className="h-8 rounded-md px-3 font-mono text-xs"
                aria-invalid={Boolean(errors?.maxOutputTokens)}
                aria-label={t('settings.providers.page.custom.models.maxOutputTokens')}
                disabled={disabled}
              />
              {fieldError(errors?.maxOutputTokens)}
              {sourceNote('maxOutputTokens')}
            </div>
          </div>

          <div className="space-y-1">
            <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.models.inputCapabilities')}</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {modalities.map((modality) => (
                <SettingsCheckboxRow
                  key={modality}
                  checked={model.modalities.includes(modality)}
                  onChange={() => {
                    onUserEdit('modalities');
                    onToggleModality(modality);
                  }}
                  disabled={disabled || (model.modalities.includes(modality)
                    && (baseModalityCount === 1 && (modality === 'text' || modality === 'image')))}
                  label={modality}
                  ariaLabel={modality}
                />
              ))}
            </div>
            {sourceNote('modalities')}
          </div>

          <div className="space-y-1">
            <SettingsCheckboxRow
              checked={model.toolsSupported === true}
              onChange={(tools) => {
                onUserEdit('toolsSupported');
                onToolsChange(tools);
              }}
              disabled={disabled}
              label={t('settings.providers.page.custom.models.tools')}
              ariaLabel={t('settings.providers.page.custom.models.tools')}
            />
            {sourceNote('toolsSupported')}
          </div>

          {/* Reasoning and pricing have no control here, so their provenance
              is read as a line of its own. */}
          {model.filledFrom.reasoning || model.filledFrom.pricing ? (
            <p className={SETTINGS_HELPER_CLASS}>
              {([
                model.filledFrom.reasoning
                  ? `${t('settings.providers.page.models.capability.reasoning')} · ${t(`settings.providers.page.custom.models.source.${model.filledFrom.reasoning}`)}`
                  : null,
                model.filledFrom.pricing
                  ? `${t('settings.providers.page.custom.models.pricing')} · ${t(`settings.providers.page.custom.models.source.${model.filledFrom.pricing}`)}`
                  : null,
              ]).filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
