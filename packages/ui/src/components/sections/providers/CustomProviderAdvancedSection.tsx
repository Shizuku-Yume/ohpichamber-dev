import React from 'react';
import {
  SettingsCheckboxRow,
  SettingsDisclosure,
  SettingsSection,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_LONG_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { OmpHeadersEditor, OmpRemoteCompactionFields, TriStateSelect } from './OmpProviderSubforms';
import { apiDisplayLabel } from './provider-api-labels';
import { createHeaderRow } from './custom-provider-model-rows';
import {
  OMP_BEDROCK_GUARDRAIL_TRACES,
  OMP_DISCOVERY_TYPES,
  type CustomProviderFieldErrors,
  type CustomProviderFormState,
  type HeaderFieldErrors,
} from './custom-provider-form';

const UNSET_VALUE = '__unset__';

interface CustomProviderAdvancedSectionProps {
  form: CustomProviderFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomProviderFormState>>;
  fieldErrors: CustomProviderFieldErrors;
  setFieldErrors: React.Dispatch<React.SetStateAction<CustomProviderFieldErrors>>;
  headerErrors: HeaderFieldErrors[];
  setHeaderErrors: React.Dispatch<React.SetStateAction<HeaderFieldErrors[]>>;
  metadataErrors: HeaderFieldErrors[];
  setMetadataErrors: React.Dispatch<React.SetStateAction<HeaderFieldErrors[]>>;
  isEdit: boolean;
  busy: boolean;
  headersOpen: boolean;
  onToggleHeaders: () => void;
  discoveryOpen: boolean;
  onToggleDiscovery: () => void;
  compatOpen: boolean;
  onToggleCompat: () => void;
  bedrockOpen: boolean;
  onToggleBedrock: () => void;
  remoteCompactionOpen: boolean;
  onToggleRemoteCompaction: () => void;
  overridesSummary?: string;
  overridesOpen: boolean;
  onToggleOverrides: () => void;
  overrides: React.ReactNode;
}

export const CustomProviderAdvancedSection: React.FC<CustomProviderAdvancedSectionProps> = ({
  form,
  setForm,
  fieldErrors,
  setFieldErrors,
  headerErrors,
  setHeaderErrors,
  metadataErrors,
  setMetadataErrors,
  isEdit,
  busy,
  headersOpen,
  onToggleHeaders,
  discoveryOpen,
  onToggleDiscovery,
  compatOpen,
  onToggleCompat,
  bedrockOpen,
  onToggleBedrock,
  remoteCompactionOpen,
  onToggleRemoteCompaction,
  overridesSummary,
  overridesOpen,
  onToggleOverrides,
  overrides,
}) => {
  const { t } = useI18n();

  const headersSummary = (() => {
    const pendingRows = form.headers.filter((header) => header.name.trim() || header.value);
    if (form.replaceHeaders) {
      if (pendingRows.length === 0) {
        return isEdit ? t('settings.providers.page.custom.headers.summary.replaceEmpty') : undefined;
      }
      return pendingRows.length === 1
        ? t('settings.providers.page.custom.headers.summary.single', { count: 1 })
        : t('settings.providers.page.custom.headers.summary.plural', { count: pendingRows.length });
    }
    const activeNames = new Set(
      form.headerNames
        .filter((name) => !form.headersPatchRemove.includes(name))
        .map((name) => name.toLowerCase()),
    );
    let unnamedCount = 0;
    for (const row of pendingRows) {
      const name = row.name.trim().toLowerCase();
      if (name) activeNames.add(name);
      else unnamedCount += 1;
    }
    const activeCount = activeNames.size + unnamedCount;
    if (activeCount > 0) {
      return activeCount === 1
        ? t('settings.providers.page.custom.headers.summary.single', { count: 1 })
        : t('settings.providers.page.custom.headers.summary.plural', { count: activeCount });
    }
    const removedCount = form.headersPatchRemove.length;
    if (removedCount > 0) {
      return removedCount === 1
        ? t('settings.providers.page.custom.headers.summary.removingSingle', { count: 1 })
        : t('settings.providers.page.custom.headers.summary.removingPlural', { count: removedCount });
    }
    return undefined;
  })();

  const discoverySummary = form.discoveryEnabled ? form.discoveryType : undefined;

  const compatSummary = [
    form.compatJson.trim() ? t('settings.providers.page.custom.compat.summary.customJson') : null,
    form.disableStrictTools === 'true'
      ? t('settings.providers.page.custom.compat.summary.strictToolsOff')
      : form.disableStrictTools === 'false'
        ? t('settings.providers.page.custom.compat.summary.strictToolsOn')
        : null,
    form.transportPiNative ? t('settings.providers.page.custom.compat.summary.piNative') : null,
  ].filter(Boolean).join(' · ') || undefined;

  const hasGuardrail = Boolean(
    form.guardrailIdentifier.trim() || form.guardrailVersion.trim() || form.guardrailTrace,
  );
  const metadataCount = form.requestMetadata.filter((entry) => entry.name.trim() || entry.value).length;
  const bedrockSummary = [
    hasGuardrail ? t('settings.providers.page.custom.bedrock.summary.guardrailConfigured') : null,
    metadataCount > 0
      ? metadataCount === 1
        ? t('settings.providers.page.custom.bedrock.summary.metadataSingle', { count: 1 })
        : t('settings.providers.page.custom.bedrock.summary.metadataPlural', { count: metadataCount })
      : null,
  ].filter(Boolean).join(' · ') || undefined;

  const hasRemoteCompactionEndpoint = Boolean(
    form.remoteCompactionEndpoint.trim()
    || form.remoteCompactionV2Endpoint.trim()
    || form.remoteCompactionStreamingEndpoint.trim(),
  );
  const remoteCompactionSummary = [
    hasRemoteCompactionEndpoint
      ? t('settings.providers.page.custom.remoteCompaction.summary.endpointSet')
      : null,
    !hasRemoteCompactionEndpoint && form.remoteCompactionEnabled === 'true'
      ? t('settings.providers.page.custom.omp.option.enabled')
      : !hasRemoteCompactionEndpoint && form.remoteCompactionEnabled === 'false'
        ? t('settings.providers.page.custom.omp.option.disabled')
        : null,
    form.remoteCompactionModel.trim() || null,
    form.remoteCompactionApi ? apiDisplayLabel(form.remoteCompactionApi) : null,
  ].filter(Boolean).join(' · ') || undefined;

  return (
    <SettingsSection
      title={t('settings.providers.page.custom.advancedSection.title')}
      divider
      contentClassName={SETTINGS_SPACE_ROW_CLASS}
    >
      <SettingsDisclosure
        title={t('settings.providers.page.custom.headers.title')}
        secondary={headersSummary}
        expanded={headersOpen}
        onToggle={onToggleHeaders}
      >
        <div className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'space-y-3 ps-4 pt-1')}>
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.page.custom.headers.description')}</p>
          <OmpHeadersEditor
            isEdit={isEdit}
            headerNames={form.headerNames}
            headersPatchRemove={form.headersPatchRemove}
            headers={form.headers}
            replaceHeaders={form.replaceHeaders}
            headerErrors={headerErrors}
            disabled={busy}
            onToggleRemoveExisting={(headerName) => setForm((previous) => ({
              ...previous,
              headersPatchRemove: previous.headersPatchRemove.includes(headerName)
                ? previous.headersPatchRemove.filter((item) => item !== headerName)
                : [...previous.headersPatchRemove, headerName],
            }))}
            onReplaceHeadersChange={(replaceHeaders) => setForm((previous) => ({
              ...previous,
              replaceHeaders,
              headers: replaceHeaders ? previous.headers : [],
            }))}
            onHeadersChange={(headers) => setForm((previous) => ({ ...previous, headers }))}
            onClearHeaderError={(index, key) => setHeaderErrors((previous) => {
              const next = [...previous];
              next[index] = { ...(next[index] ?? {}), [key]: undefined };
              return next;
            })}
            onRemoveHeaderError={(index) => setHeaderErrors((previous) => previous.filter((_, rowIndex) => rowIndex !== index))}
            onAddHeaderError={() => setHeaderErrors((previous) => [...previous, {}])}
          />
        </div>
      </SettingsDisclosure>

      <SettingsDisclosure
        title={t('settings.providers.page.custom.omp.overrides.title')}
        secondary={overridesSummary}
        expanded={overridesOpen}
        onToggle={onToggleOverrides}
      >
        {overrides}
      </SettingsDisclosure>

      <SettingsDisclosure
        title={t('settings.providers.page.custom.omp.discovery.title')}
        secondary={discoverySummary}
        expanded={discoveryOpen}
        onToggle={onToggleDiscovery}
      >
        <div className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'space-y-3 ps-4 pt-1')}>
          <SettingsCheckboxRow
            checked={form.discoveryEnabled}
            onChange={(discoveryEnabled) => setForm((previous) => ({ ...previous, discoveryEnabled }))}
            disabled={busy}
            label={t('settings.providers.page.custom.omp.discovery.enable')}
            ariaLabel={t('settings.providers.page.custom.omp.discovery.enable')}
          />
          {form.discoveryEnabled ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.discovery.type')}</label>
                  <Select
                    value={form.discoveryType}
                    onValueChange={(next) => {
                      const matched = OMP_DISCOVERY_TYPES.find((entry) => entry === next);
                      if (matched) setForm((previous) => ({ ...previous, discoveryType: matched }));
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger aria-label={t('settings.providers.page.custom.omp.discovery.type')} className="w-full">
                      <SelectValue>{form.discoveryType}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {OMP_DISCOVERY_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.discovery.timeoutMs')}</label>
                  <Input
                    inputMode="numeric"
                    value={form.discoveryTimeoutMs}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm((previous) => ({ ...previous, discoveryTimeoutMs: value }));
                      setFieldErrors((previous) => ({ ...previous, discoveryTimeoutMs: undefined }));
                    }}
                    placeholder="10000"
                    className="h-8 w-full rounded-md px-3 font-mono text-xs"
                    aria-invalid={Boolean(fieldErrors.discoveryTimeoutMs)}
                    aria-label={t('settings.providers.page.custom.omp.discovery.timeoutMs')}
                    disabled={busy}
                  />
                  {fieldErrors.discoveryTimeoutMs ? (
                    <p className="typography-meta text-[var(--status-error)]">{fieldErrors.discoveryTimeoutMs}</p>
                  ) : null}
                </div>
              </div>
              {form.discoveryType === 'openai-models-list' ? (
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.discovery.injectV1')}</label>
                  <TriStateSelect
                    value={form.discoveryInjectV1}
                    onChange={(discoveryInjectV1) => setForm((previous) => ({ ...previous, discoveryInjectV1 }))}
                    ariaLabel={t('settings.providers.page.custom.omp.discovery.injectV1')}
                    disabled={busy}
                  />
                </div>
              ) : null}
              {(form.discoveryType === 'openai-models-list' || form.discoveryType === 'lm-studio' || form.discoveryType === 'proxy') ? (
                <div className="flex flex-col gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.discovery.advertisedReasoning')}</label>
                  <TriStateSelect
                    value={form.discoveryAdvertisedReasoning}
                    onChange={(discoveryAdvertisedReasoning) => setForm((previous) => ({ ...previous, discoveryAdvertisedReasoning }))}
                    ariaLabel={t('settings.providers.page.custom.omp.discovery.advertisedReasoning')}
                    disabled={busy}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </SettingsDisclosure>

      <SettingsDisclosure
        title={t('settings.providers.page.custom.omp.advanced.title')}
        secondary={compatSummary}
        expanded={compatOpen}
        onToggle={onToggleCompat}
      >
        <div className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'space-y-3 ps-4 pt-1')}>
          <div className="flex flex-col gap-1">
            <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.disableStrictTools')}</label>
            <TriStateSelect
              value={form.disableStrictTools}
              onChange={(disableStrictTools) => setForm((previous) => ({ ...previous, disableStrictTools }))}
              ariaLabel={t('settings.providers.page.custom.omp.disableStrictTools')}
              disabled={busy}
            />
          </div>
          <SettingsCheckboxRow
            checked={form.transportPiNative}
            onChange={(transportPiNative) => setForm((previous) => ({ ...previous, transportPiNative }))}
            disabled={busy}
            label={t('settings.providers.page.custom.omp.transportPiNative')}
            ariaLabel={t('settings.providers.page.custom.omp.transportPiNative')}
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.compat.label')}</label>
              <SettingsInfoHint>{t('settings.providers.page.custom.omp.compat.info')}</SettingsInfoHint>
            </div>
            <Textarea
              value={form.compatJson}
              onChange={(event) => {
                const value = event.target.value;
                setForm((previous) => ({ ...previous, compatJson: value }));
                setFieldErrors((previous) => ({ ...previous, compatJson: undefined }));
              }}
              placeholder={'{"supportsStore": true}'}
              rows={3}
              className="w-full font-mono text-xs"
              aria-invalid={Boolean(fieldErrors.compatJson)}
              aria-label={t('settings.providers.page.custom.omp.compat.label')}
              disabled={busy}
            />
            {fieldErrors.compatJson ? <p className="typography-meta text-[var(--status-error)]">{fieldErrors.compatJson}</p> : null}
          </div>
        </div>
      </SettingsDisclosure>

      <SettingsDisclosure
        title={t('settings.providers.page.custom.omp.bedrock.title')}
        secondary={bedrockSummary}
        expanded={bedrockOpen}
        onToggle={onToggleBedrock}
      >
        <div className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'space-y-3 ps-4 pt-1')}>
          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.bedrock.guardrailId')}</label>
              <Input
                value={form.guardrailIdentifier}
                onChange={(event) => setForm((previous) => ({ ...previous, guardrailIdentifier: event.target.value }))}
                className="h-8 w-full rounded-md px-3 font-mono text-xs"
                aria-label={t('settings.providers.page.custom.omp.bedrock.guardrailId')}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.bedrock.guardrailVersion')}</label>
              <Input
                value={form.guardrailVersion}
                onChange={(event) => setForm((previous) => ({ ...previous, guardrailVersion: event.target.value }))}
                placeholder="DRAFT"
                className="h-8 w-full rounded-md px-3 font-mono text-xs"
                aria-label={t('settings.providers.page.custom.omp.bedrock.guardrailVersion')}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.bedrock.guardrailTrace')}</label>
              <Select
                value={form.guardrailTrace || UNSET_VALUE}
                onValueChange={(next) => {
                  if (next === UNSET_VALUE) {
                    setForm((previous) => ({ ...previous, guardrailTrace: '' }));
                    return;
                  }
                  const matched = OMP_BEDROCK_GUARDRAIL_TRACES.find((entry) => entry === next);
                  if (matched) setForm((previous) => ({ ...previous, guardrailTrace: matched }));
                }}
                disabled={busy}
              >
                <SelectTrigger aria-label={t('settings.providers.page.custom.omp.bedrock.guardrailTrace')} className="w-full">
                  <SelectValue>{form.guardrailTrace || t('settings.providers.page.custom.omp.option.default')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.option.default')}</SelectItem>
                  {OMP_BEDROCK_GUARDRAIL_TRACES.map((trace) => (
                    <SelectItem key={trace} value={trace}>{trace}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.omp.bedrock.requestMetadata')}</span>
            {form.requestMetadata.map((entry, index) => (
              <div key={entry.row} className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 @xl:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Input
                      value={entry.name}
                      onChange={(event) => {
                        const value = event.target.value;
                        setForm((previous) => ({
                          ...previous,
                          requestMetadata: previous.requestMetadata.map((item, rowIndex) => (
                            rowIndex === index ? { ...item, name: value } : item
                          )),
                        }));
                        setMetadataErrors((previous) => {
                          const next = [...previous];
                          next[index] = { ...(next[index] ?? {}), name: undefined };
                          return next;
                        });
                      }}
                      placeholder={t('settings.providers.page.custom.omp.bedrock.metadataKey')}
                      className="h-7 w-full rounded-md px-3 font-mono text-xs"
                      aria-invalid={Boolean(metadataErrors[index]?.name)}
                      aria-label={t('settings.providers.page.custom.omp.bedrock.metadataKey')}
                      disabled={busy}
                    />
                    {metadataErrors[index]?.name ? (
                      <p className="typography-meta text-[var(--status-error)]">{metadataErrors[index]?.name}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Input
                      value={entry.value}
                      onChange={(event) => {
                        const value = event.target.value;
                        setForm((previous) => ({
                          ...previous,
                          requestMetadata: previous.requestMetadata.map((item, rowIndex) => (
                            rowIndex === index ? { ...item, value } : item
                          )),
                        }));
                        setMetadataErrors((previous) => {
                          const next = [...previous];
                          next[index] = { ...(next[index] ?? {}), value: undefined };
                          return next;
                        });
                      }}
                      placeholder={t('settings.providers.page.custom.omp.bedrock.metadataValue')}
                      className="h-7 w-full rounded-md px-3 font-mono text-xs"
                      aria-invalid={Boolean(metadataErrors[index]?.value)}
                      aria-label={t('settings.providers.page.custom.omp.bedrock.metadataValue')}
                      disabled={busy}
                    />
                    {metadataErrors[index]?.value ? (
                      <p className="typography-meta text-[var(--status-error)]">{metadataErrors[index]?.value}</p>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={SETTINGS_ICON_BUTTON_CLASS}
                  disabled={busy}
                  onClick={() => {
                    setForm((previous) => ({
                      ...previous,
                      requestMetadata: previous.requestMetadata.filter((_, rowIndex) => rowIndex !== index),
                    }));
                    setMetadataErrors((previous) => previous.filter((_, rowIndex) => rowIndex !== index));
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
                disabled={busy}
                onClick={() => {
                  setForm((previous) => ({ ...previous, requestMetadata: [...previous.requestMetadata, createHeaderRow()] }));
                  setMetadataErrors((previous) => [...previous, {}]);
                }}
              >
                {t('settings.providers.page.custom.omp.bedrock.addMetadata')}
              </Button>
            </div>
          </div>
        </div>
      </SettingsDisclosure>

      <SettingsDisclosure
        title={t('settings.providers.page.custom.omp.remoteCompaction.title')}
        secondary={remoteCompactionSummary}
        expanded={remoteCompactionOpen}
        onToggle={onToggleRemoteCompaction}
      >
        <div className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'ps-4 pt-1')}>
          <OmpRemoteCompactionFields
            values={{
              enabled: form.remoteCompactionEnabled,
              api: form.remoteCompactionApi,
              endpoint: form.remoteCompactionEndpoint,
              model: form.remoteCompactionModel,
              v2StreamingEnabled: form.remoteCompactionV2StreamingEnabled,
              v2Endpoint: form.remoteCompactionV2Endpoint,
              streamingEndpoint: form.remoteCompactionStreamingEndpoint,
            }}
            errors={{
              endpoint: fieldErrors.remoteCompactionEndpoint,
              v2Endpoint: fieldErrors.remoteCompactionV2Endpoint,
              streamingEndpoint: fieldErrors.remoteCompactionStreamingEndpoint,
            }}
            disabled={busy}
            onChange={(patch) => {
              setForm((previous) => {
                const next = { ...previous };
                if (patch.enabled !== undefined) next.remoteCompactionEnabled = patch.enabled;
                if (patch.api !== undefined) next.remoteCompactionApi = patch.api;
                if (patch.endpoint !== undefined) next.remoteCompactionEndpoint = patch.endpoint;
                if (patch.model !== undefined) next.remoteCompactionModel = patch.model;
                if (patch.v2StreamingEnabled !== undefined) next.remoteCompactionV2StreamingEnabled = patch.v2StreamingEnabled;
                if (patch.v2Endpoint !== undefined) next.remoteCompactionV2Endpoint = patch.v2Endpoint;
                if (patch.streamingEndpoint !== undefined) next.remoteCompactionStreamingEndpoint = patch.streamingEndpoint;
                return next;
              });
              if (patch.endpoint !== undefined) setFieldErrors((previous) => ({ ...previous, remoteCompactionEndpoint: undefined }));
              if (patch.v2Endpoint !== undefined) setFieldErrors((previous) => ({ ...previous, remoteCompactionV2Endpoint: undefined }));
              if (patch.streamingEndpoint !== undefined) setFieldErrors((previous) => ({ ...previous, remoteCompactionStreamingEndpoint: undefined }));
            }}
          />
        </div>
      </SettingsDisclosure>
    </SettingsSection>
  );
};
