import React from 'react';
import {
  SettingsCheckboxRow,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  apiDisplayLabel,
  OMP_PROVIDER_APIS,
  createHeaderRow,
  type HeaderFieldErrors,
  type HeaderRow,
  type TriState,
} from './custom-provider-form';
import type { OmpProviderApi } from '@openchamber/agent-contract';

const UNSET_VALUE = '__default__';

export const TriStateSelect: React.FC<{
  value: TriState;
  onChange: (value: TriState) => void;
  ariaLabel: string;
  disabled?: boolean;
  triggerClassName?: string;
}> = ({ value, onChange, ariaLabel, disabled = false, triggerClassName }) => {
  const { t } = useI18n();
  const labelFor = (current: TriState) => {
    if (current === 'true') return t('settings.providers.page.custom.omp.option.enabled');
    if (current === 'false') return t('settings.providers.page.custom.omp.option.disabled');
    return t('settings.providers.page.custom.omp.option.default');
  };

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next === 'default' || next === 'true' || next === 'false') onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className={triggerClassName ?? 'w-full'}>
        <SelectValue>{labelFor(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">{t('settings.providers.page.custom.omp.option.default')}</SelectItem>
        <SelectItem value="true">{t('settings.providers.page.custom.omp.option.enabled')}</SelectItem>
        <SelectItem value="false">{t('settings.providers.page.custom.omp.option.disabled')}</SelectItem>
      </SelectContent>
    </Select>
  );
};

export const OmpHeadersEditor: React.FC<{
  isEdit: boolean;
  headerNames: readonly string[];
  headersPatchRemove: readonly string[];
  headers: readonly HeaderRow[];
  replaceHeaders: boolean;
  headerErrors?: readonly HeaderFieldErrors[];
  disabled?: boolean;
  onToggleRemoveExisting: (name: string) => void;
  onReplaceHeadersChange: (replace: boolean) => void;
  onHeadersChange: (headers: HeaderRow[]) => void;
  onClearHeaderError?: (index: number, key: 'name' | 'value') => void;
  onRemoveHeaderError?: (index: number) => void;
  onAddHeaderError?: () => void;
}> = ({
  isEdit,
  headerNames,
  headersPatchRemove,
  headers,
  replaceHeaders,
  headerErrors = [],
  disabled = false,
  onToggleRemoveExisting,
  onReplaceHeadersChange,
  onHeadersChange,
  onClearHeaderError,
  onRemoveHeaderError,
  onAddHeaderError,
}) => {
    const { t } = useI18n();

    return (
      <div className="flex flex-col gap-2">
        {isEdit && headerNames.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className={SETTINGS_HELPER_CLASS}>
              {t('settings.providers.native.configuredHeaders', { names: headerNames.join(', ') })}
            </p>
            {!replaceHeaders ? (
              <div className="flex flex-wrap gap-1.5">
                {headerNames.map((name) => {
                  const marked = headersPatchRemove.includes(name);
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-1.5 rounded border border-border/60 px-2 py-0.5 typography-meta"
                    >
                      <span className={cn('font-mono text-xs', marked && 'line-through text-muted-foreground')}>{name}</span>
                      {marked ? (
                        <span className="text-xs text-[var(--status-warning)]">
                          ({t('settings.providers.page.custom.omp.headers.markedForRemoval')})
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={disabled}
                        onClick={() => onToggleRemoveExisting(name)}
                      >
                        {marked
                          ? t('settings.providers.page.custom.omp.headers.undoRemove')
                          : t('settings.providers.page.custom.omp.headers.removeExisting')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {isEdit ? (
          <SettingsCheckboxRow
            checked={replaceHeaders}
            onChange={onReplaceHeadersChange}
            disabled={disabled}
            label={t('settings.providers.native.replaceHeaders')}
            ariaLabel={t('settings.providers.native.replaceHeaders')}
          />
        ) : null}

        {!replaceHeaders && isEdit ? (
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.page.custom.omp.headers.addDescription')}</p>
        ) : null}

        {headers.map((header, index) => (
          <div key={header.row} className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className={SETTINGS_FIELD_LABEL_CLASS}>
                  {t('settings.providers.page.custom.headers.keyLabel')}
                </label>
                <Input
                  value={header.name}
                  onChange={(event) => {
                    const value = event.target.value;
                    onHeadersChange(headers.map((row, rowIndex) => (rowIndex === index ? { ...row, name: value } : row)));
                    onClearHeaderError?.(index, 'name');
                  }}
                  disabled={disabled}
                  placeholder={t('settings.providers.page.custom.headers.keyPlaceholder')}
                  className="h-7 w-full rounded-md px-3 font-mono text-xs"
                  aria-invalid={Boolean(headerErrors[index]?.name)}
                  aria-label={t('settings.providers.page.custom.headers.keyLabel')}
                />
                {headerErrors[index]?.name ? (
                  <p className="typography-meta text-[var(--status-error)]">{headerErrors[index]?.name}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <label className={SETTINGS_FIELD_LABEL_CLASS}>
                  {t('settings.providers.page.custom.headers.valueLabel')}
                </label>
                <Input
                  type="password"
                  value={header.value}
                  onChange={(event) => {
                    const value = event.target.value;
                    onHeadersChange(headers.map((row, rowIndex) => (rowIndex === index ? { ...row, value } : row)));
                    onClearHeaderError?.(index, 'value');
                  }}
                  disabled={disabled}
                  placeholder={t('settings.providers.page.custom.headers.valuePlaceholder')}
                  autoComplete="new-password"
                  className="h-7 w-full rounded-md px-3 font-mono text-xs"
                  aria-invalid={Boolean(headerErrors[index]?.value)}
                  aria-label={t('settings.providers.page.custom.headers.valueLabel')}
                />
                {headerErrors[index]?.value ? (
                  <p className="typography-meta text-[var(--status-error)]">{headerErrors[index]?.value}</p>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={SETTINGS_ICON_BUTTON_CLASS}
              disabled={disabled || (replaceHeaders && !isEdit && headers.length <= 1)}
              onClick={() => {
                onHeadersChange(headers.filter((_, rowIndex) => rowIndex !== index));
                onRemoveHeaderError?.(index);
              }}
              aria-label={t('settings.providers.page.custom.headers.remove')}
            >
              <Icon name="delete-bin" className="size-4" />
            </Button>
          </div>
        ))}

        <div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={disabled}
            onClick={() => {
              onHeadersChange([...headers, createHeaderRow()]);
              onAddHeaderError?.();
            }}
          >
            {t('settings.providers.page.custom.headers.add')}
          </Button>
        </div>
      </div>
    );
  };

interface RemoteCompactionFieldValues {
  enabled: TriState;
  api: '' | OmpProviderApi;
  endpoint: string;
  model: string;
  v2StreamingEnabled: TriState;
  v2Endpoint: string;
  streamingEndpoint: string;
}

export const OmpRemoteCompactionFields: React.FC<{
  values: RemoteCompactionFieldValues;
  errors?: {
    endpoint?: string;
    v2Endpoint?: string;
    streamingEndpoint?: string;
  };
  disabled?: boolean;
  onChange: (patch: Partial<RemoteCompactionFieldValues>) => void;
}> = ({ values, errors = {}, disabled = false, onChange }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.remoteCompaction.enabled')}</label>
          <TriStateSelect
            value={values.enabled}
            onChange={(enabled) => onChange({ enabled })}
            ariaLabel={t('settings.providers.page.custom.omp.remoteCompaction.enabled')}
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.remoteCompaction.api')}</label>
          <Select
            value={values.api || UNSET_VALUE}
            onValueChange={(next) => {
              if (next === UNSET_VALUE) {
                onChange({ api: '' });
                return;
              }
              const matched = OMP_PROVIDER_APIS.find((entry) => entry === next);
              if (matched) onChange({ api: matched });
            }}
            disabled={disabled}
          >
            <SelectTrigger aria-label={t('settings.providers.page.custom.omp.remoteCompaction.api')} className="w-full">
              <SelectValue>{values.api ? apiDisplayLabel(values.api) : t('settings.providers.page.custom.omp.option.default')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.option.default')}</SelectItem>
              {OMP_PROVIDER_APIS.map((api) => (
                <SelectItem key={api} value={api}>{apiDisplayLabel(api)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.remoteCompaction.endpoint')}</label>
          <Input
            value={values.endpoint}
            onChange={(event) => onChange({ endpoint: event.target.value })}
            placeholder="https://..."
            className="h-8 w-full rounded-md px-3 font-mono text-xs"
            aria-invalid={Boolean(errors.endpoint)}
            aria-label={t('settings.providers.page.custom.omp.remoteCompaction.endpoint')}
            disabled={disabled}
          />
          {errors.endpoint ? <p className="typography-meta text-[var(--status-error)]">{errors.endpoint}</p> : null}
        </div>
        <div className="flex flex-col gap-1">
          <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.remoteCompaction.model')}</label>
          <Input
            value={values.model}
            onChange={(event) => onChange({ model: event.target.value })}
            placeholder="gpt-5-mini"
            className="h-8 w-full rounded-md px-3 font-mono text-xs"
            aria-label={t('settings.providers.page.custom.omp.remoteCompaction.model')}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.remoteCompaction.v2Streaming')}</label>
          <TriStateSelect
            value={values.v2StreamingEnabled}
            onChange={(v2StreamingEnabled) => onChange({ v2StreamingEnabled })}
            ariaLabel={t('settings.providers.page.custom.omp.remoteCompaction.v2Streaming')}
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.remoteCompaction.v2Endpoint')}</label>
          <Input
            value={values.v2Endpoint}
            onChange={(event) => onChange({ v2Endpoint: event.target.value })}
            placeholder="https://..."
            className="h-8 w-full rounded-md px-3 font-mono text-xs"
            aria-invalid={Boolean(errors.v2Endpoint)}
            aria-label={t('settings.providers.page.custom.omp.remoteCompaction.v2Endpoint')}
            disabled={disabled}
          />
          {errors.v2Endpoint ? <p className="typography-meta text-[var(--status-error)]">{errors.v2Endpoint}</p> : null}
        </div>
        <div className="flex flex-col gap-1">
          <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.remoteCompaction.streamingEndpoint')}</label>
          <Input
            value={values.streamingEndpoint}
            onChange={(event) => onChange({ streamingEndpoint: event.target.value })}
            placeholder="https://..."
            className="h-8 w-full rounded-md px-3 font-mono text-xs"
            aria-invalid={Boolean(errors.streamingEndpoint)}
            aria-label={t('settings.providers.page.custom.omp.remoteCompaction.streamingEndpoint')}
            disabled={disabled}
          />
          {errors.streamingEndpoint ? <p className="typography-meta text-[var(--status-error)]">{errors.streamingEndpoint}</p> : null}
        </div>
      </div>
    </div>
  );
};
