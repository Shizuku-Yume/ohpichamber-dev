import React from 'react';
import {
  SettingsCheckboxRow,
  SettingsChipGroup,
  SettingsDisclosure,
  SettingsFieldRow,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { formatGoalTokens } from '@/lib/sessionGoalMetadata';
import { useAutoOpenDisclosure } from '@/hooks/useAutoOpenDisclosure';
import { cn } from '@/lib/utils';
import {
  modelModalitiesForKind,
  type ModelAutoFillField,
  type ModelRow,
  type TriState,
} from './custom-provider-model-rows';
import { modelApiDisplayLabel } from './provider-api-labels';
import type { ModelFieldErrors } from './custom-provider-form';
import {
  FieldError,
  ModelAdvancedFields,
  ModelPricingFields,
  ModelProtocolFields,
  ModelThinkingFields,
} from './CustomProviderModelRowDisclosures';

interface CustomProviderModelRowProps {
  mode?: 'definition' | 'override';
  isEdit?: boolean;
  providerDefaultApi?: string;
  providerBaseUrl?: string;
  model: ModelRow;
  errors?: ModelFieldErrors;
  validationAttempt?: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (updater: (row: ModelRow) => ModelRow) => void;
  onClearError: (field: keyof ModelFieldErrors) => void;
  onUserEdit: (field: ModelAutoFillField) => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}

const positive = (value: string): number | null => {
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const extractUrlHost = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).host || trimmed;
  } catch {
    return trimmed;
  }
};

export const CustomProviderModelRow: React.FC<CustomProviderModelRowProps> = ({
  mode = 'definition',
  isEdit = false,
  providerDefaultApi = '',
  providerBaseUrl = '',
  model,
  errors,
  validationAttempt = 0,
  expanded,
  onToggle,
  onUpdate,
  onClearError,
  onUserEdit,
  onDuplicate,
  onRemove,
  disabled = false,
}) => {
  const { t } = useI18n();
  const editorId = React.useId();

  const hasProtocolError = Boolean(errors?.baseUrl || errors?.maxContextWindow);
  const hasThinkingError = Boolean(errors?.thinkingEfforts || errors?.thinkingEffortMapJson);
  const hasPricingError = Boolean(
    errors?.cost
    || errors?.promptCacheShort
    || errors?.promptCacheLong
    || errors?.premiumMultiplier,
  );
  const hasAdvancedError = Boolean(
    errors?.imageCountBudget
    || errors?.compatJson
    || errors?.remoteCompactionEndpoint
    || errors?.remoteCompactionV2Endpoint
    || errors?.remoteCompactionStreamingEndpoint
    || errors?.headers?.some((header) => Boolean(header.name || header.value)),
  );

  const [protocolOpen, toggleProtocolOpen] = useAutoOpenDisclosure(hasProtocolError, validationAttempt);
  const [thinkingOpen, toggleThinkingOpen] = useAutoOpenDisclosure(hasThinkingError, validationAttempt);
  const [pricingOpen, togglePricingOpen] = useAutoOpenDisclosure(hasPricingError, validationAttempt);
  const [advancedOpen, toggleAdvancedOpen] = useAutoOpenDisclosure(hasAdvancedError, validationAttempt);

  const modelId = model.modelId.trim();
  const name = model.name.trim();
  const title = name || modelId || t('settings.providers.page.custom.models.untitled');
  const context = positive(model.contextWindow);
  const maxContext = positive(model.maxContextWindow);
  const output = positive(model.maxOutputTokens);
  const modalities = modelModalitiesForKind(model.nativeKind);
  const baseModalityCount = model.modalities.filter((modality) => modality === 'text' || modality === 'image').length;

  const modelHost = extractUrlHost(model.baseUrl);
  const providerHost = extractUrlHost(providerBaseUrl);
  const baseUrlCue = modelHost && (!providerHost || modelHost.toLowerCase() !== providerHost.toLowerCase())
    ? modelHost
    : null;

  const effectiveApi = model.api || providerDefaultApi;
  const collapsedSummary = [
    effectiveApi ? modelApiDisplayLabel(effectiveApi) : null,
    context ? t('settings.providers.page.custom.omp.models.summaryContext', { value: formatGoalTokens(context) }) : null,
    output ? t('settings.providers.page.custom.omp.models.summaryOutput', { value: formatGoalTokens(output) }) : null,
    baseUrlCue,
  ].filter(Boolean).join(' · ');

  const sourceNote = (field: ModelAutoFillField) => {
    const source = model.filledFrom[field];
    if (!source) return null;
    const label = source === 'omp-catalog'
      ? t('settings.providers.page.custom.models.source.omp-catalog')
      : t('settings.providers.page.custom.models.source.openrouter');
    return <p className={SETTINGS_HELPER_CLASS}>{label}</p>;
  };

  const formatConfiguredCount = (count: number) => (
    count === 1
      ? t('settings.providers.page.custom.omp.models.summaryConfiguredSingle', { count })
      : t('settings.providers.page.custom.omp.models.summaryConfiguredPlural', { count })
  );

  const toolsTriState: TriState = model.toolsSupported === true ? 'true' : model.toolsSupported === false ? 'false' : 'default';
  const reasoningTriState: TriState = model.reasoning === true ? 'true' : model.reasoning === false ? 'false' : 'default';

  const triStateOptions: Array<{ value: TriState; label: string; disabled?: boolean }> = [
    { value: 'default', label: t('settings.providers.page.custom.omp.option.default'), disabled },
    { value: 'true', label: t('settings.providers.page.custom.omp.option.enabled'), disabled },
    { value: 'false', label: t('settings.providers.page.custom.omp.option.disabled'), disabled },
  ];

  const protocolSummary = [
    model.api ? modelApiDisplayLabel(model.api) : null,
    model.kind || null,
    modelHost,
    maxContext ? t('settings.providers.page.custom.omp.models.summaryMaxContext', { value: formatGoalTokens(maxContext) }) : null,
  ].filter(Boolean).join(' · ') || undefined;

  const hasThinkingOverride = Boolean(
    model.thinkingMode
    || model.thinkingDefaultLevel
    || model.thinkingEfforts.length > 0
    || model.thinkingSupportsDisplay !== 'default'
    || model.thinkingRequiresEffort !== 'default'
    || model.thinkingEffortMapJson.trim(),
  );
  const thinkingSummary = model.thinkingMode
    ? `${model.thinkingMode}${model.thinkingEfforts.length > 0 ? ` (${model.thinkingEfforts.join(', ')})` : ''}`
    : hasThinkingOverride
      ? t('settings.providers.page.custom.omp.model.thinking.configured')
      : undefined;

  const pricingExtraCount = [
    Boolean(model.costCacheRead.trim()),
    Boolean(model.costCacheWrite.trim()),
    Boolean(model.promptCacheShort.trim()),
    Boolean(model.promptCacheLong.trim()),
    Boolean(model.premiumMultiplier.trim()),
  ].filter(Boolean).length;
  const pricingSummary = model.costInput.trim() || model.costOutput.trim()
    ? `${model.costInput.trim() || '—'} / ${model.costOutput.trim() || '—'}`
    : pricingExtraCount > 0
      ? formatConfiguredCount(pricingExtraCount)
      : undefined;

  const hasRemoteCompaction = model.remoteCompactionEnabled !== 'default'
    || Boolean(model.remoteCompactionApi)
    || Boolean(model.remoteCompactionEndpoint.trim())
    || Boolean(model.remoteCompactionModel.trim())
    || model.remoteCompactionV2StreamingEnabled !== 'default'
    || Boolean(model.remoteCompactionV2Endpoint.trim())
    || Boolean(model.remoteCompactionStreamingEndpoint.trim());
  const hasModelHeaders = model.headerNames.length > 0
    || model.headersPatchRemove.length > 0
    || model.replaceHeaders
    || model.headers.some((header) => header.name.trim() || header.value);
  const advancedCount = [
    model.preferWebsockets !== 'default',
    model.omitMaxOutputTokens !== 'default',
    Boolean(model.imageCountBudget.trim()),
    Boolean(model.imageInputDecoder),
    Boolean(model.tokenizer),
    Boolean(model.contextPromotionTarget.trim()),
    Boolean(model.compactionModel.trim()),
    Boolean(model.compatJson.trim()),
    hasRemoteCompaction,
    hasModelHeaders,
  ].filter(Boolean).length;
  const advancedSummary = advancedCount > 0 ? formatConfiguredCount(advancedCount) : undefined;

  return (
    <div>
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
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', expanded && 'rotate-90 rtl:-rotate-90')}
            aria-hidden
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className={cn('truncate font-medium', SETTINGS_FIELD_LABEL_CLASS, !name && !modelId && 'text-muted-foreground')}>
                {title}
              </span>
              {name && modelId && name !== modelId ? (
                <span className="truncate font-mono text-xs text-muted-foreground">{modelId}</span>
              ) : null}
            </span>
            {collapsedSummary ? <span className={cn('truncate', SETTINGS_HELPER_CLASS)}>{collapsedSummary}</span> : null}
          </span>
        </button>
        {onDuplicate ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={SETTINGS_ICON_BUTTON_CLASS}
            onClick={onDuplicate}
            disabled={disabled}
            title={t('settings.providers.page.custom.omp.models.duplicate')}
            aria-label={t('settings.providers.page.custom.omp.models.duplicate')}
          >
            <Icon name="file-copy" className="size-4" />
          </Button>
        ) : null}
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={SETTINGS_ICON_BUTTON_CLASS}
            onClick={onRemove}
            disabled={disabled}
            title={t('settings.providers.page.custom.models.remove')}
            aria-label={t('settings.providers.page.custom.models.remove')}
          >
            <Icon name="delete-bin" className="size-4" />
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div id={editorId} className="space-y-4 pb-5 ps-6 pe-1 pt-2">
          <SettingsFieldRow label={t('settings.providers.page.custom.models.idLabel')}>
            <div className={cn('flex min-w-0 flex-col gap-1', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>
              <Input
                value={model.modelId}
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdate((row) => ({ ...row, modelId: value }));
                  onClearError('modelId');
                }}
                placeholder={t('settings.providers.page.custom.models.idPlaceholder')}
                inputSize="compact"
                className="w-full rounded-md px-3 font-mono text-xs"
                aria-invalid={Boolean(errors?.modelId)}
                aria-label={t('settings.providers.page.custom.models.idLabel')}
                disabled={disabled}
              />
              <FieldError message={errors?.modelId} />
            </div>
          </SettingsFieldRow>

          <SettingsFieldRow label={t('settings.providers.page.custom.models.nameLabel')}>
            <div className={cn('flex min-w-0 flex-col gap-1', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>
              <Input
                value={model.name}
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdate((row) => ({ ...row, name: value }));
                  onClearError('name');
                }}
                placeholder={t('settings.providers.page.custom.models.namePlaceholder')}
                inputSize="compact"
                className="w-full rounded-md px-3"
                aria-invalid={Boolean(errors?.name)}
                aria-label={t('settings.providers.page.custom.models.nameLabel')}
                disabled={disabled}
              />
              <FieldError message={errors?.name} />
            </div>
          </SettingsFieldRow>

          <SettingsFieldRow label={t('settings.providers.page.custom.models.contextWindow')}>
            <div className={cn('flex min-w-0 flex-col gap-1', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>
              <Input
                inputMode="numeric"
                value={model.contextWindow}
                onChange={(event) => {
                  const value = event.target.value;
                  onUserEdit('contextWindow');
                  onUpdate((row) => ({ ...row, contextWindow: value }));
                  onClearError('contextWindow');
                }}
                placeholder="128000"
                inputSize="compact"
                className="w-full rounded-md px-3 font-mono text-xs"
                aria-invalid={Boolean(errors?.contextWindow)}
                aria-label={t('settings.providers.page.custom.models.contextWindow')}
                disabled={disabled}
              />
              <FieldError message={errors?.contextWindow} />
              {sourceNote('contextWindow')}
            </div>
          </SettingsFieldRow>

          <SettingsFieldRow label={t('settings.providers.page.custom.models.maxOutputTokens')}>
            <div className={cn('flex min-w-0 flex-col gap-1', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>
              <Input
                inputMode="numeric"
                value={model.maxOutputTokens}
                onChange={(event) => {
                  const value = event.target.value;
                  onUserEdit('maxOutputTokens');
                  onUpdate((row) => ({ ...row, maxOutputTokens: value }));
                  onClearError('maxOutputTokens');
                }}
                placeholder="16384"
                inputSize="compact"
                className="w-full rounded-md px-3 font-mono text-xs"
                aria-invalid={Boolean(errors?.maxOutputTokens)}
                aria-label={t('settings.providers.page.custom.models.maxOutputTokens')}
                disabled={disabled}
              />
              <FieldError message={errors?.maxOutputTokens} />
              {sourceNote('maxOutputTokens')}
            </div>
          </SettingsFieldRow>

          <SettingsFieldRow label={t('settings.providers.page.custom.models.tools')}>
            <div className="flex min-w-0 flex-col gap-1">
              <div>
                <SettingsChipGroup
                  value={toolsTriState}
                  options={triStateOptions}
                  aria-label={t('settings.providers.page.custom.models.tools')}
                  onChange={(next) => {
                    onUserEdit('toolsSupported');
                    onUpdate((row) => ({
                      ...row,
                      toolsSupported: next === 'true' ? true : next === 'false' ? false : undefined,
                    }));
                  }}
                />
              </div>
              {sourceNote('toolsSupported')}
            </div>
          </SettingsFieldRow>

          <SettingsFieldRow label={t('settings.providers.page.custom.omp.model.reasoning')}>
            <div className="flex min-w-0 flex-col gap-1">
              <div>
                <SettingsChipGroup
                  value={reasoningTriState}
                  options={triStateOptions}
                  aria-label={t('settings.providers.page.custom.omp.model.reasoning')}
                  onChange={(next) => {
                    onUserEdit('reasoning');
                    onUpdate((row) => ({
                      ...row,
                      reasoning: next === 'true' ? true : next === 'false' ? false : undefined,
                      reasoningEffortSupported: next === 'true' ? true : next === 'false' ? false : undefined,
                    }));
                  }}
                />
              </div>
              {sourceNote('reasoning')}
            </div>
          </SettingsFieldRow>

          <SettingsFieldRow label={t('settings.providers.page.custom.models.inputCapabilities')}>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                {modalities.map((modality) => (
                  <SettingsCheckboxRow
                    key={modality}
                    checked={model.modalities.includes(modality)}
                    onChange={() => {
                      onUserEdit('modalities');
                      onUpdate((row) => {
                        const selected = row.modalities.includes(modality);
                        if (selected && row.modalities.length === 1) return row;
                        return {
                          ...row,
                          modalities: selected
                            ? row.modalities.filter((entry) => entry !== modality)
                            : [...row.modalities, modality],
                        };
                      });
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
          </SettingsFieldRow>

          <SettingsDisclosure
            title={t('settings.providers.page.custom.omp.model.protocol.title')}
            secondary={protocolSummary}
            expanded={protocolOpen}
            onToggle={toggleProtocolOpen}
          >
            <ModelProtocolFields
              model={model}
              errors={errors}
              mode={mode}
              disabled={disabled}
              onUpdate={onUpdate}
              onClearError={onClearError}
              onUserEdit={onUserEdit}
            />
          </SettingsDisclosure>

          <SettingsDisclosure
            title={t('settings.providers.page.custom.omp.model.thinking.title')}
            secondary={thinkingSummary}
            expanded={thinkingOpen}
            onToggle={toggleThinkingOpen}
          >
            <ModelThinkingFields
              model={model}
              errors={errors}
              disabled={disabled}
              onUpdate={onUpdate}
              onClearError={onClearError}
              onUserEdit={onUserEdit}
            />
          </SettingsDisclosure>

          <SettingsDisclosure
            title={t('settings.providers.page.custom.omp.model.pricing.title')}
            secondary={pricingSummary}
            expanded={pricingOpen}
            onToggle={togglePricingOpen}
          >
            <ModelPricingFields
              model={model}
              errors={errors}
              disabled={disabled}
              onUpdate={onUpdate}
              onClearError={onClearError}
              onUserEdit={onUserEdit}
            />
          </SettingsDisclosure>

          <SettingsDisclosure
            title={t('settings.providers.page.custom.omp.model.advanced.title')}
            secondary={advancedSummary}
            expanded={advancedOpen}
            onToggle={toggleAdvancedOpen}
          >
            <ModelAdvancedFields
              model={model}
              errors={errors}
              isEdit={isEdit}
              disabled={disabled}
              onUpdate={onUpdate}
              onClearError={onClearError}
              onUserEdit={onUserEdit}
            />
          </SettingsDisclosure>
        </div>
      ) : null}
    </div>
  );
};
