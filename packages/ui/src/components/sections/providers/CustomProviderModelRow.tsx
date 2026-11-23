import React from 'react';
import {
  SettingsCheckboxRow,
  SettingsDisclosure,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { formatGoalTokens } from '@/lib/sessionGoalMetadata';
import { cn } from '@/lib/utils';
import {
  COMPAT_BOOLEAN_FLAGS,
  COMPAT_MAX_TOKENS_FIELDS,
  OMP_MODEL_APIS,
  OMP_MODEL_KINDS,
  OMP_MODEL_TOKENIZERS,
  OMP_THINKING_EFFORTS,
  OMP_THINKING_MODES,
  modelModalitiesForKind,
  readCompatBooleanFlag,
  readCompatMaxTokensField,
  updateCompatJsonFlag,
  type ModelAutoFillField,
  type ModelFieldErrors,
  type ModelRow,
  type TriState,
} from './custom-provider-form';
import { OmpHeadersEditor, OmpRemoteCompactionFields, TriStateSelect } from './OmpProviderSubforms';

const UNSET_VALUE = '__default__';

interface CustomProviderModelRowProps {
  mode?: 'definition' | 'override';
  isEdit?: boolean;
  providerDefaultApi?: string;
  model: ModelRow;
  errors?: ModelFieldErrors;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (updater: (row: ModelRow) => ModelRow) => void;
  onClearError: (field: keyof ModelFieldErrors) => void;
  /** The row changed a field by hand; auto-fill must never overwrite it. */
  onUserEdit: (field: ModelAutoFillField) => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}

const positive = (value: string): number | null => {
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * One model definition (`models[]`) or per-model override (`modelOverrides.<id>`).
 * Collapsed, it reads as a single line; expanded, it surfaces all OMP 19.0.0 fields
 * with nested disclosures for thinking, pricing/cache, and advanced/headers.
 */
export const CustomProviderModelRow: React.FC<CustomProviderModelRowProps> = ({
  mode = 'definition',
  isEdit = false,
  providerDefaultApi = '',
  model,
  errors,
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
  const [thinkingOpen, setThinkingOpen] = React.useState(false);
  const [pricingOpen, setPricingOpen] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const modelId = model.modelId.trim();
  const name = model.name.trim();
  const title = name || modelId || t('settings.providers.page.custom.models.untitled');
  const context = positive(model.contextWindow);
  const output = positive(model.maxOutputTokens);
  const modalities = modelModalitiesForKind(model.nativeKind);
  const extraInputs = model.modalities.filter((modality) => modality !== 'text');
  const baseModalityCount = model.modalities.filter((modality) => modality === 'text' || modality === 'image').length;

  const baseUrlCue = (() => {
    const trimmed = model.baseUrl.trim();
    if (!trimmed) return null;
    try {
      return new URL(trimmed).host;
    } catch {
      return trimmed;
    }
  })();

  const thinkingSummary = model.thinkingMode
    ? `${model.thinkingMode}${model.thinkingEfforts.length > 0 ? ` (${model.thinkingEfforts.join(', ')})` : ''}`
    : undefined;

  const summary = [
    baseUrlCue,
    context ? t('settings.providers.page.custom.discovery.contextValue', { value: formatGoalTokens(context) }) : null,
    output ? t('settings.providers.page.custom.discovery.outputValue', { value: formatGoalTokens(output) }) : null,
    thinkingSummary ?? null,
    extraInputs.length > 0 ? extraInputs.join(', ') : null,
    model.toolsSupported === false ? t('settings.providers.page.custom.models.toolsOff') : null,
    model.preferWebsockets === 'true' ? 'WS' : null,
  ].filter(Boolean).join(' · ');
  const fieldError = (message?: string) => (
    message ? <p className="typography-meta text-[var(--status-error)]">{message}</p> : null
  );

  const sourceNote = (field: ModelAutoFillField) => {
    const source = model.filledFrom[field];
    if (!source) return null;
    const label = source === 'omp-catalog'
      ? t('settings.providers.page.custom.models.source.omp-catalog')
      : t('settings.providers.page.custom.models.source.openrouter');
    return <p className={SETTINGS_HELPER_CLASS}>{label}</p>;
  };
  const toolsTriState: TriState = model.toolsSupported === true ? 'true' : model.toolsSupported === false ? 'false' : 'default';
  const reasoningTriState: TriState = model.reasoning === true ? 'true' : model.reasoning === false ? 'false' : 'default';
  const pricingSummary = model.costInput.trim() || model.costOutput.trim()
    ? `${model.costInput || '—'} / ${model.costOutput || '—'}`
    : undefined;
  const advancedCount = [
    model.preferWebsockets !== 'default',
    model.omitMaxOutputTokens !== 'default',
    Boolean(model.imageCountBudget.trim()),
    Boolean(model.imageInputDecoder),
    Boolean(model.tokenizer),
    Boolean(model.contextPromotionTarget.trim()),
    Boolean(model.compactionModel.trim()),
    Boolean(model.compatJson.trim()),
    model.headerNames.length > 0 || model.headers.some((h) => h.name.trim() || h.value),
  ].filter(Boolean).length;

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
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className={cn('truncate', SETTINGS_FIELD_LABEL_CLASS, !name && !modelId && 'text-muted-foreground')}>{title}</span>
              {name && modelId && name !== modelId ? (
                <span className="truncate font-mono text-xs text-muted-foreground">{modelId}</span>
              ) : null}
              {model.api ? (
                <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono typography-micro text-muted-foreground">
                  {model.api}
                </span>
              ) : providerDefaultApi ? (
                <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 typography-micro text-muted-foreground">
                  {t('settings.providers.page.custom.omp.models.inheritedApi')}
                </span>
              ) : null}
              {model.kind && model.kind !== 'chat' ? (
                <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono typography-micro text-muted-foreground">
                  {model.kind}
                </span>
              ) : null}
            </span>
            {summary ? <span className={cn('truncate', SETTINGS_HELPER_CLASS)}>{summary}</span> : null}
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
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdate((row) => ({ ...row, modelId: value }));
                  onClearError('modelId');
                }}
                placeholder={t('settings.providers.page.custom.models.idPlaceholder')}
                className="h-8 w-full rounded-md px-3 font-mono text-xs"
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
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdate((row) => ({ ...row, name: value }));
                  onClearError('name');
                }}
                placeholder={t('settings.providers.page.custom.models.namePlaceholder')}
                className="h-8 w-full rounded-md px-3"
                aria-invalid={Boolean(errors?.name)}
                aria-label={t('settings.providers.page.custom.models.nameLabel')}
                disabled={disabled}
              />
              {fieldError(errors?.name)}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.api')}</label>
              <Select
                value={model.api || UNSET_VALUE}
                onValueChange={(next) => {
                  if (next === UNSET_VALUE) {
                    onUpdate((row) => ({ ...row, api: '' }));
                    return;
                  }
                  const matched = OMP_MODEL_APIS.find((entry) => entry === next);
                  if (matched) onUpdate((row) => ({ ...row, api: matched }));
                }}
                disabled={disabled}
              >
                <SelectTrigger aria-label={t('settings.providers.page.custom.omp.model.api')} className="w-full">
                  <SelectValue>{model.api || t('settings.providers.page.custom.omp.api.inherit')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.api.inherit')}</SelectItem>
                  {OMP_MODEL_APIS.map((api) => (
                    <SelectItem key={api} value={api}>{api}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.kind')}</label>
              <Select
                value={model.kind || UNSET_VALUE}
                onValueChange={(next) => {
                  if (next === UNSET_VALUE) {
                    onUpdate((row) => ({ ...row, kind: '', nativeKind: 'chat' }));
                    return;
                  }
                  const matched = OMP_MODEL_KINDS.find((entry) => entry === next);
                  if (matched) {
                    onUpdate((row) => ({
                      ...row,
                      kind: matched,
                      nativeKind: matched,
                    }));
                  }
                }}
                disabled={disabled}
              >
                <SelectTrigger aria-label={t('settings.providers.page.custom.omp.model.kind')} className="w-full">
                  <SelectValue>{model.kind || t('settings.providers.page.custom.omp.option.default')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.option.default')}</SelectItem>
                  {OMP_MODEL_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>{kind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === 'definition' ? (
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.baseUrl')}</label>
              <Input
                value={model.baseUrl}
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdate((row) => ({ ...row, baseUrl: value }));
                  onClearError('baseUrl');
                }}
                placeholder="https://..."
                className="h-8 w-full rounded-md px-3 font-mono text-xs"
                aria-invalid={Boolean(errors?.baseUrl)}
                aria-label={t('settings.providers.page.custom.omp.model.baseUrl')}
                disabled={disabled}
              />
              {fieldError(errors?.baseUrl)}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.models.contextWindow')}</label>
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
                className="h-8 w-full rounded-md px-3 font-mono text-xs"
                aria-invalid={Boolean(errors?.contextWindow)}
                aria-label={t('settings.providers.page.custom.models.contextWindow')}
                disabled={disabled}
              />
              {fieldError(errors?.contextWindow)}
              {sourceNote('contextWindow')}
            </div>
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.maxContextWindow')}</label>
              <Input
                inputMode="numeric"
                value={model.maxContextWindow}
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdate((row) => ({ ...row, maxContextWindow: value }));
                  onClearError('maxContextWindow');
                }}
                placeholder="1000000"
                className="h-8 w-full rounded-md px-3 font-mono text-xs"
                aria-invalid={Boolean(errors?.maxContextWindow)}
                aria-label={t('settings.providers.page.custom.omp.model.maxContextWindow')}
                disabled={disabled}
              />
              {fieldError(errors?.maxContextWindow)}
            </div>
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.models.maxOutputTokens')}</label>
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
                className="h-8 w-full rounded-md px-3 font-mono text-xs"
                aria-invalid={Boolean(errors?.maxOutputTokens)}
                aria-label={t('settings.providers.page.custom.models.maxOutputTokens')}
                disabled={disabled}
              />
              {fieldError(errors?.maxOutputTokens)}
              {sourceNote('maxOutputTokens')}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.models.tools')}</label>
              <TriStateSelect
                value={toolsTriState}
                onChange={(next) => {
                  onUserEdit('toolsSupported');
                  onUpdate((row) => ({
                    ...row,
                    toolsSupported: next === 'true' ? true : next === 'false' ? false : undefined,
                  }));
                }}
                ariaLabel={t('settings.providers.page.custom.models.tools')}
                disabled={disabled}
              />
              {sourceNote('toolsSupported')}
            </div>
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.reasoning')}</label>
              <TriStateSelect
                value={reasoningTriState}
                onChange={(next) => {
                  onUserEdit('reasoning');
                  onUpdate((row) => ({
                    ...row,
                    reasoning: next === 'true' ? true : next === 'false' ? false : undefined,
                    reasoningEffortSupported: next === 'true' ? true : next === 'false' ? false : undefined,
                  }));
                }}
                ariaLabel={t('settings.providers.page.custom.omp.model.reasoning')}
                disabled={disabled}
              />
              {sourceNote('reasoning')}
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

          <SettingsDisclosure
            title={t('settings.providers.page.custom.omp.model.thinking.title')}
            secondary={thinkingSummary}
            expanded={thinkingOpen}
            onToggle={() => setThinkingOpen((prev) => !prev)}
          >
            <div className="space-y-2.5 ps-4 pt-1">
              <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.thinking.mode')}</label>
                  <Select
                    value={model.thinkingMode || UNSET_VALUE}
                    onValueChange={(next) => {
                      onUserEdit('thinking');
                      onClearError('thinkingEfforts');
                      if (next === UNSET_VALUE) {
                        onUpdate((row) => ({ ...row, thinkingMode: '', thinkingEfforts: [], thinkingDefaultLevel: '' }));
                        return;
                      }
                      const matched = OMP_THINKING_MODES.find((entry) => entry === next);
                      if (matched) {
                        onUpdate((row) => ({
                          ...row,
                          thinkingMode: matched,
                          thinkingEfforts: row.thinkingEfforts.length > 0 ? row.thinkingEfforts : ['low', 'medium', 'high'],
                        }));
                      }
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger aria-label={t('settings.providers.page.custom.omp.model.thinking.mode')} className="w-full">
                      <SelectValue>{model.thinkingMode || t('settings.providers.page.custom.omp.model.thinking.none')}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.model.thinking.none')}</SelectItem>
                      {OMP_THINKING_MODES.map((thinkingMode) => (
                        <SelectItem key={thinkingMode} value={thinkingMode}>{thinkingMode}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {model.thinkingMode ? (
                  <div className="flex flex-col gap-1">
                    <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.thinking.defaultLevel')}</label>
                    <Select
                      value={model.thinkingDefaultLevel || UNSET_VALUE}
                      onValueChange={(next) => {
                        onUserEdit('thinking');
                        if (next === UNSET_VALUE) {
                          onUpdate((row) => ({ ...row, thinkingDefaultLevel: '' }));
                          return;
                        }
                        const matched = OMP_THINKING_EFFORTS.find((entry) => entry === next);
                        if (matched) onUpdate((row) => ({ ...row, thinkingDefaultLevel: matched }));
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger aria-label={t('settings.providers.page.custom.omp.model.thinking.defaultLevel')} className="w-full">
                        <SelectValue>{model.thinkingDefaultLevel || t('settings.providers.page.custom.omp.option.default')}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.option.default')}</SelectItem>
                        {OMP_THINKING_EFFORTS.map((effort) => (
                          <SelectItem key={effort} value={effort}>{effort}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              {model.thinkingMode ? (
                <>
                  <div className="flex flex-col gap-1">
                    <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.thinking.efforts')}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {OMP_THINKING_EFFORTS.map((effort) => {
                        const active = model.thinkingEfforts.includes(effort);
                        return (
                          <Button
                            key={effort}
                            type="button"
                            variant="chip"
                            size="xs"
                            aria-pressed={active}
                            disabled={disabled}
                            onClick={() => {
                              onUserEdit('thinking');
                              onClearError('thinkingEfforts');
                              onUpdate((row) => ({
                                ...row,
                                thinkingEfforts: active
                                  ? row.thinkingEfforts.filter((entry) => entry !== effort)
                                  : OMP_THINKING_EFFORTS.filter((entry) => entry === effort || row.thinkingEfforts.includes(entry)),
                              }));
                            }}
                          >
                            {effort}
                          </Button>
                        );
                      })}
                    </div>
                    {fieldError(errors?.thinkingEfforts)}
                  </div>

                  <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.thinking.supportsDisplay')}</label>
                      <TriStateSelect
                        value={model.thinkingSupportsDisplay}
                        onChange={(thinkingSupportsDisplay) => {
                          onUserEdit('thinking');
                          onUpdate((row) => ({ ...row, thinkingSupportsDisplay }));
                        }}
                        ariaLabel={t('settings.providers.page.custom.omp.model.thinking.supportsDisplay')}
                        disabled={disabled}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.thinking.requiresEffort')}</label>
                      <TriStateSelect
                        value={model.thinkingRequiresEffort}
                        onChange={(thinkingRequiresEffort) => {
                          onUserEdit('thinking');
                          onUpdate((row) => ({ ...row, thinkingRequiresEffort }));
                        }}
                        ariaLabel={t('settings.providers.page.custom.omp.model.thinking.requiresEffort')}
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.thinking.effortMap')}</label>
                    <Textarea
                      value={model.thinkingEffortMapJson}
                      onChange={(event) => {
                        const value = event.target.value;
                        onUserEdit('thinking');
                        onUpdate((row) => ({ ...row, thinkingEffortMapJson: value }));
                        onClearError('thinkingEffortMapJson');
                      }}
                      placeholder={'{"high": "model-thinking"}'}
                      rows={2}
                      className="w-full font-mono text-xs"
                      aria-invalid={Boolean(errors?.thinkingEffortMapJson)}
                      aria-label={t('settings.providers.page.custom.omp.model.thinking.effortMap')}
                      disabled={disabled}
                    />
                    {fieldError(errors?.thinkingEffortMapJson)}
                  </div>
                </>
              ) : null}
              {sourceNote('thinking')}
            </div>
          </SettingsDisclosure>

          <SettingsDisclosure
            title={t('settings.providers.page.custom.omp.model.pricing.title')}
            secondary={pricingSummary}
            expanded={pricingOpen}
            onToggle={() => setPricingOpen((prev) => !prev)}
          >
            <div className="space-y-2.5 ps-4 pt-1">
              <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.pricing.input')}</label>
                  <Input
                    inputMode="decimal"
                    value={model.costInput}
                    onChange={(event) => {
                      const value = event.target.value;
                      onUserEdit('pricing');
                      onUpdate((row) => ({ ...row, costInput: value }));
                      onClearError('cost');
                    }}
                    placeholder="0"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-label={t('settings.providers.page.custom.omp.model.pricing.input')}
                    disabled={disabled}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.pricing.output')}</label>
                  <Input
                    inputMode="decimal"
                    value={model.costOutput}
                    onChange={(event) => {
                      const value = event.target.value;
                      onUserEdit('pricing');
                      onUpdate((row) => ({ ...row, costOutput: value }));
                      onClearError('cost');
                    }}
                    placeholder="0"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-label={t('settings.providers.page.custom.omp.model.pricing.output')}
                    disabled={disabled}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.pricing.cacheRead')}</label>
                  <Input
                    inputMode="decimal"
                    value={model.costCacheRead}
                    onChange={(event) => {
                      const value = event.target.value;
                      onUserEdit('pricing');
                      onUpdate((row) => ({ ...row, costCacheRead: value }));
                      onClearError('cost');
                    }}
                    placeholder="0"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-label={t('settings.providers.page.custom.omp.model.pricing.cacheRead')}
                    disabled={disabled}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.pricing.cacheWrite')}</label>
                  <Input
                    inputMode="decimal"
                    value={model.costCacheWrite}
                    onChange={(event) => {
                      const value = event.target.value;
                      onUserEdit('pricing');
                      onUpdate((row) => ({ ...row, costCacheWrite: value }));
                      onClearError('cost');
                    }}
                    placeholder="0"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-label={t('settings.providers.page.custom.omp.model.pricing.cacheWrite')}
                    disabled={disabled}
                  />
                </div>
              </div>
              {fieldError(errors?.cost)}
              {sourceNote('pricing')}

              <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.pricing.cacheShort')}</label>
                  <Input
                    inputMode="numeric"
                    value={model.promptCacheShort}
                    onChange={(event) => {
                      const value = event.target.value;
                      onUpdate((row) => ({ ...row, promptCacheShort: value }));
                      onClearError('promptCacheShort');
                    }}
                    placeholder="300"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-invalid={Boolean(errors?.promptCacheShort)}
                    aria-label={t('settings.providers.page.custom.omp.model.pricing.cacheShort')}
                    disabled={disabled}
                  />
                  {fieldError(errors?.promptCacheShort)}
                </div>
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.pricing.cacheLong')}</label>
                  <Input
                    inputMode="numeric"
                    value={model.promptCacheLong}
                    onChange={(event) => {
                      const value = event.target.value;
                      onUpdate((row) => ({ ...row, promptCacheLong: value }));
                      onClearError('promptCacheLong');
                    }}
                    placeholder="3600"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-invalid={Boolean(errors?.promptCacheLong)}
                    aria-label={t('settings.providers.page.custom.omp.model.pricing.cacheLong')}
                    disabled={disabled}
                  />
                  {fieldError(errors?.promptCacheLong)}
                </div>
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.pricing.premiumMultiplier')}</label>
                  <Input
                    inputMode="decimal"
                    value={model.premiumMultiplier}
                    onChange={(event) => {
                      const value = event.target.value;
                      onUpdate((row) => ({ ...row, premiumMultiplier: value }));
                      onClearError('premiumMultiplier');
                    }}
                    placeholder="1"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-invalid={Boolean(errors?.premiumMultiplier)}
                    aria-label={t('settings.providers.page.custom.omp.model.pricing.premiumMultiplier')}
                    disabled={disabled}
                  />
                  {fieldError(errors?.premiumMultiplier)}
                </div>
              </div>
            </div>
          </SettingsDisclosure>

          <SettingsDisclosure
            title={t('settings.providers.page.custom.omp.model.advanced.title')}
            secondary={advancedCount > 0 ? String(advancedCount) : undefined}
            expanded={advancedOpen}
            onToggle={() => setAdvancedOpen((prev) => !prev)}
          >
            <div className="space-y-3 ps-4 pt-1">
              <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.preferWebsockets')}</label>
                  <TriStateSelect
                    value={model.preferWebsockets}
                    onChange={(preferWebsockets) => onUpdate((row) => ({ ...row, preferWebsockets }))}
                    ariaLabel={t('settings.providers.page.custom.omp.model.preferWebsockets')}
                    disabled={disabled}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.omitMaxOutputTokens')}</label>
                  <TriStateSelect
                    value={model.omitMaxOutputTokens}
                    onChange={(omitMaxOutputTokens) => onUpdate((row) => ({ ...row, omitMaxOutputTokens }))}
                    ariaLabel={t('settings.providers.page.custom.omp.model.omitMaxOutputTokens')}
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.imageCountBudget')}</label>
                  <Input
                    inputMode="numeric"
                    value={model.imageCountBudget}
                    onChange={(event) => {
                      const value = event.target.value;
                      onUserEdit('imageCountBudget');
                      onUpdate((row) => ({ ...row, imageCountBudget: value }));
                      onClearError('imageCountBudget');
                    }}
                    placeholder="5"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-invalid={Boolean(errors?.imageCountBudget)}
                    aria-label={t('settings.providers.page.custom.omp.model.imageCountBudget')}
                    disabled={disabled}
                  />
                  {fieldError(errors?.imageCountBudget)}
                  {sourceNote('imageCountBudget')}
                </div>
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.imageInputDecoder')}</label>
                  <Select
                    value={model.imageInputDecoder || UNSET_VALUE}
                    onValueChange={(next) => onUpdate((row) => ({ ...row, imageInputDecoder: next === 'stb' ? 'stb' : '' }))}
                    disabled={disabled}
                  >
                    <SelectTrigger aria-label={t('settings.providers.page.custom.omp.model.imageInputDecoder')} className="w-full">
                      <SelectValue>{model.imageInputDecoder || t('settings.providers.page.custom.omp.option.default')}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.option.default')}</SelectItem>
                      <SelectItem value="stb">stb</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.tokenizer')}</label>
                  <Select
                    value={model.tokenizer || UNSET_VALUE}
                    onValueChange={(next) => {
                      if (next === UNSET_VALUE) {
                        onUpdate((row) => ({ ...row, tokenizer: '' }));
                        return;
                      }
                      const matched = OMP_MODEL_TOKENIZERS.find((entry) => entry === next);
                      if (matched) onUpdate((row) => ({ ...row, tokenizer: matched }));
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger aria-label={t('settings.providers.page.custom.omp.model.tokenizer')} className="w-full">
                      <SelectValue>{model.tokenizer || t('settings.providers.page.custom.omp.option.default')}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.option.default')}</SelectItem>
                      {OMP_MODEL_TOKENIZERS.map((tokenizer) => (
                        <SelectItem key={tokenizer} value={tokenizer}>{tokenizer}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.contextPromotionTarget')}</label>
                  <Input
                    value={model.contextPromotionTarget}
                    onChange={(event) => {
                      const value = event.target.value;
                      onUpdate((row) => ({ ...row, contextPromotionTarget: value }));
                    }}
                    placeholder="provider/model"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-label={t('settings.providers.page.custom.omp.model.contextPromotionTarget')}
                    disabled={disabled}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.model.compactionModel')}</label>
                  <Input
                    value={model.compactionModel}
                    onChange={(event) => {
                      const value = event.target.value;
                      onUpdate((row) => ({ ...row, compactionModel: value }));
                    }}
                    placeholder="provider/model"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-label={t('settings.providers.page.custom.omp.model.compactionModel')}
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.models.compatFlags')}</span>
                <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
                  {COMPAT_BOOLEAN_FLAGS.map((flag) => (
                    <div key={flag} className="flex flex-col gap-1">
                      <label className="font-mono typography-micro text-muted-foreground">{flag}</label>
                      <TriStateSelect
                        value={readCompatBooleanFlag(model.compatJson, flag)}
                        onChange={(nextValue) => {
                          onUpdate((row) => ({
                            ...row,
                            compatJson: updateCompatJsonFlag(row.compatJson, flag, nextValue),
                          }));
                          onClearError('compatJson');
                        }}
                        ariaLabel={flag}
                        disabled={disabled}
                      />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <label className="font-mono typography-micro text-muted-foreground">
                      {t('settings.providers.page.custom.omp.models.compatMaxTokensField')}
                    </label>
                    <Select
                      value={readCompatMaxTokensField(model.compatJson) || UNSET_VALUE}
                      onValueChange={(next) => {
                        onUpdate((row) => ({
                          ...row,
                          compatJson: updateCompatJsonFlag(row.compatJson, 'maxTokensField', next === UNSET_VALUE ? '' : next),
                        }));
                        onClearError('compatJson');
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger aria-label={t('settings.providers.page.custom.omp.models.compatMaxTokensField')} className="w-full">
                        <SelectValue>{readCompatMaxTokensField(model.compatJson) || t('settings.providers.page.custom.omp.option.default')}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.option.default')}</SelectItem>
                        {COMPAT_MAX_TOKENS_FIELDS.map((field) => (
                          <SelectItem key={field} value={field}>{field}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.compat.label')}</label>
                <Textarea
                  value={model.compatJson}
                  onChange={(event) => {
                    const value = event.target.value;
                    onUpdate((row) => ({ ...row, compatJson: value }));
                    onClearError('compatJson');
                  }}
                  placeholder={'{"supportsStore": true}'}
                  rows={2}
                  className="w-full font-mono text-xs"
                  aria-invalid={Boolean(errors?.compatJson)}
                  aria-label={t('settings.providers.page.custom.omp.compat.label')}
                  disabled={disabled}
                />
                {fieldError(errors?.compatJson)}
              </div>

              <div className="space-y-1.5">
                <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.remoteCompaction.title')}</span>
                <OmpRemoteCompactionFields
                  values={{
                    enabled: model.remoteCompactionEnabled,
                    api: model.remoteCompactionApi,
                    endpoint: model.remoteCompactionEndpoint,
                    model: model.remoteCompactionModel,
                    v2StreamingEnabled: model.remoteCompactionV2StreamingEnabled,
                    v2Endpoint: model.remoteCompactionV2Endpoint,
                    streamingEndpoint: model.remoteCompactionStreamingEndpoint,
                  }}
                  errors={{
                    endpoint: errors?.remoteCompactionEndpoint,
                    v2Endpoint: errors?.remoteCompactionV2Endpoint,
                    streamingEndpoint: errors?.remoteCompactionStreamingEndpoint,
                  }}
                  disabled={disabled}
                  onChange={(patch) => {
                    onUpdate((row) => ({
                      ...row,
                      ...(patch.enabled !== undefined ? { remoteCompactionEnabled: patch.enabled } : {}),
                      ...(patch.api !== undefined ? { remoteCompactionApi: patch.api } : {}),
                      ...(patch.endpoint !== undefined ? { remoteCompactionEndpoint: patch.endpoint } : {}),
                      ...(patch.model !== undefined ? { remoteCompactionModel: patch.model } : {}),
                      ...(patch.v2StreamingEnabled !== undefined ? { remoteCompactionV2StreamingEnabled: patch.v2StreamingEnabled } : {}),
                      ...(patch.v2Endpoint !== undefined ? { remoteCompactionV2Endpoint: patch.v2Endpoint } : {}),
                      ...(patch.streamingEndpoint !== undefined ? { remoteCompactionStreamingEndpoint: patch.streamingEndpoint } : {}),
                    }));
                    if (patch.endpoint !== undefined) onClearError('remoteCompactionEndpoint');
                    if (patch.v2Endpoint !== undefined) onClearError('remoteCompactionV2Endpoint');
                    if (patch.streamingEndpoint !== undefined) onClearError('remoteCompactionStreamingEndpoint');
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.headers.title')}</span>
                <OmpHeadersEditor
                  isEdit={isEdit}
                  headerNames={model.headerNames}
                  headersPatchRemove={model.headersPatchRemove}
                  headers={model.headers}
                  replaceHeaders={model.replaceHeaders}
                  headerErrors={errors?.headers}
                  disabled={disabled}
                  onToggleRemoveExisting={(headerName) => onUpdate((row) => ({
                    ...row,
                    headersPatchRemove: row.headersPatchRemove.includes(headerName)
                      ? row.headersPatchRemove.filter((item) => item !== headerName)
                      : [...row.headersPatchRemove, headerName],
                  }))}
                  onReplaceHeadersChange={(replaceHeaders) => onUpdate((row) => ({
                    ...row,
                    replaceHeaders,
                    headers: replaceHeaders ? row.headers : [],
                  }))}
                  onHeadersChange={(headers) => onUpdate((row) => ({ ...row, headers }))}
                />
              </div>
            </div>
          </SettingsDisclosure>
        </div>
      ) : null}
    </div>
  );
};
