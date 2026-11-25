import React from 'react';
import {
  SettingsSection,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_LONG_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { CustomProviderModelsDialog } from './CustomProviderModelsDialog';
import { CustomProviderModelRow } from './CustomProviderModelRow';
import { modelApiDisplayLabel } from './provider-api-labels';
import {
  createModelRow,
  duplicateModelRow,
  markModelFieldTyped,
  type ModelAutoFillField,
  type ModelRow,
} from './custom-provider-model-rows';
import type {
  CustomProviderFormState,
  ModelFieldErrors,
} from './custom-provider-form';
import type { AutoFillNotice } from './custom-provider-autofill';
import type { ProviderModelDiscoveryResult } from '@openchamber/agent-contract';

interface CustomProviderModelsSectionProps {
  form: CustomProviderFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomProviderFormState>>;
  isEdit: boolean;
  busy: boolean;
  disabled: boolean;
  validationAttempt: number;
  providerBaseUrl: string;
  modelErrors: ModelFieldErrors[];
  setModelErrors: React.Dispatch<React.SetStateAction<ModelFieldErrors[]>>;
  expandedRows: Set<string>;
  setExpandedRows: React.Dispatch<React.SetStateAction<Set<string>>>;
  modelSearch: string;
  setModelSearch: (value: string) => void;
  modelApiFilter: string;
  setModelApiFilter: (value: string) => void;
  discovering: boolean;
  discoveryError: string | null;
  discoverEndpointAvailable: boolean;
  onDiscover: () => void;
  autoFilling: boolean;
  autoFillNotice: AutoFillNotice | null;
  partialNoticeModels: string;
  onAutoFill: () => void;
  clearAutoFillNotice: () => void;
  discoveredModels: ProviderModelDiscoveryResult['models'] | null;
  modelsDialogOpen: boolean;
  onModelsDialogChange: (open: boolean) => void;
  addDiscoveredModels: (ids: string[]) => void;
  removeModelRows: (rows: string[]) => void;
  updateModelAt: (list: 'models' | 'modelOverrides', index: number, updater: (row: ModelRow) => ModelRow) => void;
  clearModelErrorAt: (list: 'models' | 'modelOverrides', index: number, field: keyof ModelFieldErrors) => void;
}

export const CustomProviderModelsSection: React.FC<CustomProviderModelsSectionProps> = ({
  form,
  setForm,
  isEdit,
  busy,
  disabled,
  validationAttempt,
  providerBaseUrl,
  modelErrors,
  setModelErrors,
  expandedRows,
  setExpandedRows,
  modelSearch,
  setModelSearch,
  modelApiFilter,
  setModelApiFilter,
  discovering,
  discoveryError,
  discoverEndpointAvailable,
  onDiscover,
  autoFilling,
  autoFillNotice,
  partialNoticeModels,
  onAutoFill,
  clearAutoFillNotice,
  discoveredModels,
  modelsDialogOpen,
  onModelsDialogChange,
  addDiscoveredModels,
  removeModelRows,
  updateModelAt,
  clearModelErrorAt,
}) => {
  const { t } = useI18n();

  const apiCounts = new Map<string, number>();
  for (const model of form.models) {
    const apiKey = model.api || form.api || 'inherited';
    apiCounts.set(apiKey, (apiCounts.get(apiKey) ?? 0) + 1);
  }
  const showModelSearch = form.models.length >= 6;
  const showModelApiChips = apiCounts.size >= 2;
  const activeModelApiFilter = modelApiFilter !== 'all' && apiCounts.has(modelApiFilter) ? modelApiFilter : 'all';
  const allowEmptyModels = form.isBuiltIn || form.discoveryEnabled || form.modelOverrides.length > 0;
  const canRemoveModel = (count: number) => allowEmptyModels || count > 1;

  const toggleRow = (row: string) => setExpandedRows((previous) => {
    const next = new Set(previous);
    if (next.has(row)) next.delete(row);
    else next.add(row);
    return next;
  });

  const query = modelSearch.trim().toLowerCase();

  return (
    <SettingsSection
      title={t('settings.providers.page.custom.models.title')}
      divider
      contentClassName={SETTINGS_SPACE_ROW_CLASS}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onDiscover}
            disabled={disabled || !discoverEndpointAvailable}
          >
            <Icon name="search" className="size-3.5" />
            {discovering
              ? t('settings.providers.page.custom.discovery.fetching')
              : t('settings.providers.page.custom.discovery.fetch')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onAutoFill}
            disabled={disabled || !form.models.some((model) => model.modelId.trim())}
          >
            <Icon name="sparkling" className="size-3.5" />
            {autoFilling
              ? t('settings.providers.page.custom.models.autofill.running')
              : t('settings.providers.page.custom.models.autofill.action')}
          </Button>
          <SettingsInfoHint>{t('settings.providers.page.custom.models.autofill.info')}</SettingsInfoHint>
        </div>
        {discoveryError ? <p className="typography-meta text-[var(--status-error)]" role="alert">{discoveryError}</p> : null}
        {autoFillNotice ? (
          <p className="typography-meta text-muted-foreground" role="status">
            {autoFillNotice === 'partial'
              ? t('settings.providers.page.custom.models.autofill.notice.partial', { models: partialNoticeModels })
              : t(`settings.providers.page.custom.models.autofill.notice.${autoFillNotice}`)}
          </p>
        ) : null}
        {discoveredModels ? (
          <CustomProviderModelsDialog
            open={modelsDialogOpen}
            onOpenChange={onModelsDialogChange}
            discovered={discoveredModels}
            models={form.models}
            busy={busy}
            onAdd={addDiscoveredModels}
            onRemove={removeModelRows}
          />
        ) : null}
      </div>

      {showModelSearch || showModelApiChips ? (
        <div className="flex flex-col gap-2">
          {showModelSearch ? (
            <Input
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
              placeholder={t('settings.providers.page.custom.omp.models.searchPlaceholder')}
              aria-label={t('settings.providers.page.custom.omp.models.searchPlaceholder')}
              inputSize="compact"
              className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'rounded-md px-3')}
              disabled={busy}
            />
          ) : null}
          {showModelApiChips ? (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('settings.providers.page.custom.omp.model.api')}>
              <Button
                type="button"
                size="xs"
                variant={activeModelApiFilter === 'all' ? 'chip' : 'outline'}
                aria-pressed={activeModelApiFilter === 'all'}
                onClick={() => setModelApiFilter('all')}
              >
                {t('settings.providers.page.custom.models.dialog.filter.all')} ({form.models.length})
              </Button>
              {Array.from(apiCounts.entries()).map(([apiKey, count]) => (
                <Button
                  key={apiKey}
                  type="button"
                  size="xs"
                  variant={activeModelApiFilter === apiKey ? 'chip' : 'outline'}
                  aria-pressed={activeModelApiFilter === apiKey}
                  onClick={() => setModelApiFilter(apiKey)}
                >
                  {apiKey === 'inherited'
                    ? t('settings.providers.page.custom.omp.models.inheritedApi')
                    : modelApiDisplayLabel(apiKey)} ({count})
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {form.models.length > 0 ? (
        <div className="divide-y divide-border/50">
          {form.models.map((model, index) => {
            const resolvedApi = model.api || form.api || 'inherited';
            if (activeModelApiFilter !== 'all' && resolvedApi !== activeModelApiFilter) return null;
            if (query && !model.modelId.toLowerCase().includes(query) && !model.name.toLowerCase().includes(query)) return null;
            return (
              <CustomProviderModelRow
                key={model.row}
                mode="definition"
                isEdit={isEdit}
                providerDefaultApi={form.api}
                providerBaseUrl={providerBaseUrl}
                model={model}
                errors={modelErrors[index]}
                validationAttempt={validationAttempt}
                expanded={expandedRows.has(model.row)}
                disabled={busy}
                onToggle={() => toggleRow(model.row)}
                onUpdate={(updater) => updateModelAt('models', index, updater)}
                onClearError={(field) => clearModelErrorAt('models', index, field)}
                onUserEdit={(field: ModelAutoFillField) => updateModelAt('models', index, (row) => markModelFieldTyped(row, field))}
                onDuplicate={() => {
                  const copy = duplicateModelRow(model);
                  setForm((previous) => ({
                    ...previous,
                    models: [
                      ...previous.models.slice(0, index + 1),
                      copy,
                      ...previous.models.slice(index + 1),
                    ],
                  }));
                  setModelErrors((previous) => [
                    ...previous.slice(0, index + 1),
                    {},
                    ...previous.slice(index + 1),
                  ]);
                  setExpandedRows((previous) => new Set([...previous, copy.row]));
                  clearAutoFillNotice();
                }}
                onRemove={canRemoveModel(form.models.length) ? () => {
                  setForm((previous) => ({
                    ...previous,
                    models: previous.models.filter((_, rowIndex) => rowIndex !== index),
                  }));
                  setModelErrors((previous) => previous.filter((_, rowIndex) => rowIndex !== index));
                  clearAutoFillNotice();
                } : undefined}
              />
            );
          })}
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={disabled}
        onClick={() => {
          const row = createModelRow();
          setForm((previous) => ({ ...previous, models: [...previous.models, row] }));
          setModelErrors((previous) => [...previous, {}]);
          setExpandedRows((previous) => new Set([...previous, row.row]));
          clearAutoFillNotice();
        }}
      >
        {t('settings.providers.page.custom.models.add')}
      </Button>
    </SettingsSection>
  );
};
