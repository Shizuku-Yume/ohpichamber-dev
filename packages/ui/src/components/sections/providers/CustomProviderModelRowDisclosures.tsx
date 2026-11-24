import React from 'react';
import {
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_HELPER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  OMP_MODEL_APIS,
  OMP_MODEL_KINDS,
  OMP_MODEL_TOKENIZERS,
  OMP_THINKING_EFFORTS,
  OMP_THINKING_MODES,
} from '@openchamber/agent-contract';
import {
  COMPAT_BOOLEAN_FLAGS,
  COMPAT_MAX_TOKENS_FIELDS,
  readCompatBooleanFlag,
  readCompatMaxTokensField,
  updateCompatJsonFlag,
  type ModelAutoFillField,
  type ModelRow,
} from './custom-provider-model-rows';
import { modelApiDisplayLabel } from './provider-api-labels';
import type { ModelFieldErrors } from './custom-provider-form';
import { OmpHeadersEditor, OmpRemoteCompactionFields, TriStateSelect } from './OmpProviderSubforms';

const UNSET_VALUE = '__default__';

interface ModelDisclosureFieldsProps {
  model: ModelRow;
  errors?: ModelFieldErrors;
  mode?: 'definition' | 'override';
  isEdit?: boolean;
  disabled?: boolean;
  onUpdate: (updater: (row: ModelRow) => ModelRow) => void;
  onClearError: (field: keyof ModelFieldErrors) => void;
  onUserEdit: (field: ModelAutoFillField) => void;
}

export const FieldError: React.FC<{ message?: string }> = ({ message }) => (
  message ? <p className="typography-meta text-[var(--status-error)]">{message}</p> : null
);

export const ModelProtocolFields: React.FC<ModelDisclosureFieldsProps> = ({
  model,
  errors,
  mode = 'definition',
  disabled = false,
  onUpdate,
  onClearError,
}) => {
  const { t } = useI18n();
  return (
    <div className="space-y-2.5 ps-4 pt-1">
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
              <SelectValue>
                {model.api ? modelApiDisplayLabel(model.api) : t('settings.providers.page.custom.omp.model.apiInherit')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.model.apiInherit')}</SelectItem>
              {OMP_MODEL_APIS.map((api) => (
                <SelectItem key={api} value={api}>{modelApiDisplayLabel(api)}</SelectItem>
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

      <div className={cn('grid grid-cols-1 gap-2', mode === 'definition' && '@xl:grid-cols-2')}>
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
            <FieldError message={errors?.baseUrl} />
          </div>
        ) : null}
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
          <FieldError message={errors?.maxContextWindow} />
        </div>
      </div>
    </div>
  );
};

export const ModelThinkingFields: React.FC<ModelDisclosureFieldsProps> = ({
  model,
  errors,
  disabled = false,
  onUpdate,
  onClearError,
  onUserEdit,
}) => {
  const { t } = useI18n();
  const sourceNote = (field: ModelAutoFillField) => {
    const source = model.filledFrom[field];
    if (!source) return null;
    const label = source === 'omp-catalog'
      ? t('settings.providers.page.custom.models.source.omp-catalog')
      : t('settings.providers.page.custom.models.source.openrouter');
    return <p className={SETTINGS_HELPER_CLASS}>{label}</p>;
  };
  return (
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
            <FieldError message={errors?.thinkingEfforts} />
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
        </>
      ) : null}

      {model.thinkingMode || Boolean(model.thinkingEffortMapJson.trim()) || Boolean(errors?.thinkingEffortMapJson) ? (
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
          <FieldError message={errors?.thinkingEffortMapJson} />
        </div>
      ) : null}
      {sourceNote('thinking')}
    </div>
  );
};

export const ModelPricingFields: React.FC<ModelDisclosureFieldsProps> = ({
  model,
  errors,
  disabled = false,
  onUpdate,
  onClearError,
  onUserEdit,
}) => {
  const { t } = useI18n();
  const sourceNote = (field: ModelAutoFillField) => {
    const source = model.filledFrom[field];
    if (!source) return null;
    const label = source === 'omp-catalog'
      ? t('settings.providers.page.custom.models.source.omp-catalog')
      : t('settings.providers.page.custom.models.source.openrouter');
    return <p className={SETTINGS_HELPER_CLASS}>{label}</p>;
  };
  return (
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
      <FieldError message={errors?.cost} />
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
          <FieldError message={errors?.promptCacheShort} />
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
          <FieldError message={errors?.promptCacheLong} />
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
          <FieldError message={errors?.premiumMultiplier} />
        </div>
      </div>
    </div>
  );
};

export const ModelAdvancedFields: React.FC<ModelDisclosureFieldsProps> = ({
  model,
  errors,
  isEdit = false,
  disabled = false,
  onUpdate,
  onClearError,
  onUserEdit,
}) => {
  const { t } = useI18n();
  const sourceNote = (field: ModelAutoFillField) => {
    const source = model.filledFrom[field];
    if (!source) return null;
    const label = source === 'omp-catalog'
      ? t('settings.providers.page.custom.models.source.omp-catalog')
      : t('settings.providers.page.custom.models.source.openrouter');
    return <p className={SETTINGS_HELPER_CLASS}>{label}</p>;
  };
  return (
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
          <FieldError message={errors?.imageCountBudget} />
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
        <FieldError message={errors?.compatJson} />
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
            onUpdate((row) => {
              const next = { ...row };
              if (patch.enabled !== undefined) next.remoteCompactionEnabled = patch.enabled;
              if (patch.api !== undefined) next.remoteCompactionApi = patch.api;
              if (patch.endpoint !== undefined) next.remoteCompactionEndpoint = patch.endpoint;
              if (patch.model !== undefined) next.remoteCompactionModel = patch.model;
              if (patch.v2StreamingEnabled !== undefined) next.remoteCompactionV2StreamingEnabled = patch.v2StreamingEnabled;
              if (patch.v2Endpoint !== undefined) next.remoteCompactionV2Endpoint = patch.v2Endpoint;
              if (patch.streamingEndpoint !== undefined) next.remoteCompactionStreamingEndpoint = patch.streamingEndpoint;
              return next;
            });
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
          onHeadersChange={(headers) => {
            onUpdate((row) => ({ ...row, headers }));
            if (errors?.headers) onClearError('headers');
          }}
        />
      </div>
    </div>
  );
};
