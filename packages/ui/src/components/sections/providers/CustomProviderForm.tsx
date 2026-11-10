import React from 'react';
import type { ProviderConfigurationRead, ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import {
  SettingsCheckboxRow,
  SettingsSection,
  SettingsStackedField,
  SETTINGS_CONTROL_CLUSTER_CLASS,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_FIELDS_STACK_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_SELECT_TRIGGER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { useProviderLogo } from '@/hooks/useProviderLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
<<<<<<< HEAD
import { getRuntimeKey } from '@/lib/runtime-switch';
import { canonicalClient } from '@/api/canonicalClient';
import { CUSTOM_PROVIDER_ICONS, type CustomProviderIcon } from '@/lib/customProviderIcons';
=======
import { runtimeFetch } from '@/lib/runtime-fetch';
import { CUSTOM_PROVIDER_ICONS } from '@/lib/customProviderIcons';
import { providerLogoUploadSupported } from '@/lib/customProviderLogos';
import { useUIStore } from '@/stores/useUIStore';
import { ProviderLogoImageControl } from './ProviderLogoImageControl';
>>>>>>> bc50ba56a
import { cn } from '@/lib/utils';
import {
  CUSTOM_PROVIDER_PROTOCOLS,
  buildCustomProviderRequest,
  buildProviderDiscoveryRequest,
  createEmptyCustomProviderForm,
  createHeaderRow,
  createModelRow,
  isCustomProviderProtocol,
  validateCustomProviderForm,
  type CustomProviderFormState,
  type CustomProviderPersistPlan,
  type CustomProviderFieldErrors,
  type CustomProviderProtocol,
  type CustomProviderTranslator,
  type HeaderFieldErrors,
  type ModelFieldErrors,
} from './custom-provider-form';
import { CustomProviderModelDiscovery } from './CustomProviderModelDiscovery';
import { CustomProviderModelRow } from './CustomProviderModelRow';

interface CustomProviderFormProps {
  workspaceId: string;
  revision: string;
  initial?: ProviderConfigurationRead;
  initialIcon?: CustomProviderIcon | null;
  existingProviderIDs: ReadonlySet<string>;
  busy?: boolean;
  authFailureHint?: string | null;
  onSubmit: (plan: CustomProviderPersistPlan) => Promise<void>;
  onCancel: () => void;
  onDisconnect?: () => void | Promise<void>;
}

const protocolLabel = (protocol: CustomProviderProtocol, t: CustomProviderTranslator): string => {
  switch (protocol) {
    case 'chat-completions':
      return t('settings.providers.page.custom.field.protocol.openaiChat');
    case 'responses':
      return t('settings.providers.page.custom.field.protocol.openaiResponses');
    case 'messages':
      return t('settings.providers.page.custom.field.protocol.anthropicMessages');
    case 'generate-content':
      return protocol;
    default:
      return protocol;
  }
};

export const CustomProviderForm: React.FC<CustomProviderFormProps> = ({
  workspaceId,
  revision,
  initial,
  initialIcon = null,
  existingProviderIDs,
  busy = false,
  authFailureHint = null,
  onSubmit,
  onCancel,
  onDisconnect,
}) => {
  const { t } = useI18n();
  const isEdit = Boolean(initial);
  const [form, setForm] = React.useState<CustomProviderFormState>(() => createEmptyCustomProviderForm(initial, initialIcon));
  const [fieldErrors, setFieldErrors] = React.useState<CustomProviderFieldErrors>({});
  const [modelErrors, setModelErrors] = React.useState<ModelFieldErrors[]>([]);
  const [headerErrors, setHeaderErrors] = React.useState<HeaderFieldErrors[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [discovering, setDiscovering] = React.useState(false);
  const [discoveryError, setDiscoveryError] = React.useState<string | null>(null);
  const [discoveredModels, setDiscoveredModels] = React.useState<ProviderModelDiscoveryResult['models'] | null>(null);
  // Rows open for editing. A provider can carry dozens of imported models, so
  // saved and imported rows start collapsed; a row added by hand opens.
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(() => (
    new Set(initial ? [] : form.models.map((model) => model.row))
  ));
  const lifetime = React.useRef(true);
  React.useEffect(() => { lifetime.current = true; return () => { lifetime.current = false; }; }, []);

  const logoProviderId = form.providerId.trim() || 'custom';
  const { hasLogo: providerHasLogo } = useProviderLogo(logoProviderId);
<<<<<<< HEAD
  const disabled = busy || discovering;
=======
  // A logo stored under the typed ID: kept when the provider was removed and is added again.
  const storedLogo = useUIStore((state) => state.customProviderLogos[logoProviderId]);
  const pickedLogoFile = form.logo instanceof File ? form.logo : null;
  const [pickedLogoUrl, setPickedLogoUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!pickedLogoFile) {
      setPickedLogoUrl(null);
      return;
    }
    const url = URL.createObjectURL(pickedLogoFile);
    setPickedLogoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pickedLogoFile]);
>>>>>>> bc50ba56a

  const setField = (key: 'providerId' | 'name' | 'endpoint' | 'apiKey', value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (key === 'apiKey') return;
    setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const setProtocol = (protocol: CustomProviderProtocol) => {
    setForm((previous) => ({ ...previous, protocol }));
  };

  const setModel = (index: number, key: keyof ModelFieldErrors, value: string) => {
    setForm((previous) => ({
      ...previous,
      models: previous.models.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [key]: value } : row
      )),
    }));
    setModelErrors((previous) => {
      const next = [...previous];
      next[index] = { ...(next[index] ?? {}), [key]: undefined };
      return next;
    });
  };

  const toggleModality = (index: number, modality: CustomProviderFormState['models'][number]['modalities'][number]) => {
    setForm((previous) => ({
      ...previous,
      models: previous.models.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const selected = row.modalities.includes(modality);
        if (selected && row.modalities.length === 1) return row;
        return {
          ...row,
          modalities: selected
            ? row.modalities.filter((value) => value !== modality)
            : [...row.modalities, modality],
        };
      }),
    }));
  };

  const setTools = (index: number, toolsSupported: boolean) => {
    setForm((previous) => ({
      ...previous,
      models: previous.models.map((row, rowIndex) => (
        rowIndex === index ? { ...row, toolsSupported } : row
      )),
    }));
  };

  const setHeader = (index: number, key: 'name' | 'value', value: string) => {
    setForm((previous) => ({
      ...previous,
      headers: previous.headers.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    }));
    setHeaderErrors((previous) => {
      const next = [...previous];
      next[index] = { ...(next[index] ?? {}), [key]: undefined };
      return next;
    });
  };

  const toggleRow = (row: string) => setExpandedRows((previous) => {
    const next = new Set(previous);
    if (next.has(row)) next.delete(row);
    else next.add(row);
    return next;
  });

  const discoverModels = async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    const runtime = getRuntimeKey();
    try {
      const result = await canonicalClient.discoverProviderModels(workspaceId, buildProviderDiscoveryRequest(form, isEdit));
      if (lifetime.current && runtime === getRuntimeKey()) setDiscoveredModels(result.models);
    } catch {
      if (lifetime.current && runtime === getRuntimeKey()) {
        setDiscoveryError(t('settings.providers.page.custom.discovery.failed'));
      }
    } finally {
      if (lifetime.current) setDiscovering(false);
    }
  };

  const addDiscoveredModels = (models: ProviderModelDiscoveryResult['models']) => {
    setForm((previous) => {
      const existing = new Set(previous.models.map((model) => model.modelId.trim()).filter(Boolean));
      const added = models.filter((model) => !existing.has(model.modelId)).map((model) => createModelRow(model));
      // The blank starter row of a new form gives way to the imported models.
      const kept = previous.models.filter((model) => model.modelId.trim() || model.name.trim());
      return { ...previous, models: [...kept, ...added] };
    });
    setModelErrors([]);
    setDiscoveredModels(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || discovering) return;
    setFormError(null);
    const validation = validateCustomProviderForm(form, existingProviderIDs, isEdit, t);
    setFieldErrors(validation.fields);
    setModelErrors(validation.models);
    setHeaderErrors(validation.headers);
    // A collapsed row would hide its own error.
    const rowsWithErrors = form.models
      .filter((_, index) => Object.values(validation.models[index] ?? {}).some(Boolean))
      .map((model) => model.row);
    if (rowsWithErrors.length > 0) {
      setExpandedRows((previous) => new Set([...previous, ...rowsWithErrors]));
    }
    if (!validation.valid) return;

    let plan: CustomProviderPersistPlan;
    try {
      plan = buildCustomProviderRequest(form, revision);
    } catch {
      setFormError(t('settings.providers.native.invalidConfiguration'));
      return;
    }
    try {
      await onSubmit(plan);
      if (lifetime.current) setForm((previous) => ({ ...previous, apiKey: '' }));
    } catch {
      if (lifetime.current) setFormError(t('settings.providers.page.toast.customProviderSaveFailed'));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-0">
      <SettingsSection
        title={isEdit ? t('settings.providers.page.custom.editTitle') : t('settings.providers.page.custom.title')}
        divider={false}
        settingsItem="providers.custom"
        contentClassName={SETTINGS_FIELDS_STACK_CLASS}
      >
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.native.customDescription')}</p>

        {authFailureHint ? (
          <p className="typography-meta text-[var(--status-warning)]" role="status">
            {authFailureHint}
          </p>
        ) : null}

        <SettingsStackedField
          label={t('settings.providers.page.custom.field.providerID.label')}
          info={t('settings.providers.page.custom.field.providerID.info')}
        >
          <Input
            value={form.providerId}
            onChange={(event) => setField('providerId', event.target.value)}
            placeholder={t('settings.providers.page.custom.field.providerID.placeholder')}
            className="h-7 rounded-md px-3 font-mono text-xs"
            autoFocus={!isEdit}
            disabled={isEdit || busy}
            aria-invalid={Boolean(fieldErrors.providerId)}
            aria-label={t('settings.providers.page.custom.field.providerID.label')}
          />
          {fieldErrors.providerId ? <p className="mt-1 typography-meta text-[var(--status-error)]">{fieldErrors.providerId}</p> : null}
        </SettingsStackedField>

        <SettingsStackedField
          label={t('settings.providers.page.custom.field.protocol.label')}
          info={t('settings.providers.page.custom.field.protocol.info')}
        >
          <Select
            value={form.protocol}
            onValueChange={(protocol) => {
              if (isCustomProviderProtocol(protocol)) {
                setProtocol(protocol);
              }
            }}
            disabled={busy}
          >
<<<<<<< HEAD
            <SelectTrigger aria-label={t('settings.providers.page.custom.field.protocol.label')} className={SETTINGS_SELECT_TRIGGER_CLASS}>
              <SelectValue>{protocolLabel(form.protocol, t)}</SelectValue>
=======
            <SelectTrigger aria-label={t('settings.providers.page.custom.field.protocol.label')} className="w-full">
              <SelectValue>
                {form.protocol === 'openai-responses'
                  ? t('settings.providers.page.custom.field.protocol.openaiResponses')
                  : form.protocol === 'anthropic-messages'
                    ? t('settings.providers.page.custom.field.protocol.anthropicMessages')
                    : t('settings.providers.page.custom.field.protocol.openaiChat')}
              </SelectValue>
>>>>>>> bc50ba56a
            </SelectTrigger>
            <SelectContent>
              {CUSTOM_PROVIDER_PROTOCOLS.map((protocol) => (
                <SelectItem key={protocol} value={protocol}>
                  {protocolLabel(protocol, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsStackedField>

        <SettingsStackedField
          label={t('settings.providers.page.custom.field.name.label')}
          info={t('settings.providers.page.custom.field.name.info')}
        >
          <Input
            value={form.name}
            onChange={(event) => setField('name', event.target.value)}
            disabled={busy}
            placeholder={t('settings.providers.page.custom.field.name.placeholder')}
            className="h-7 rounded-md px-3"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-label={t('settings.providers.page.custom.field.name.label')}
          />
          {fieldErrors.name ? <p className="mt-1 typography-meta text-[var(--status-error)]">{fieldErrors.name}</p> : null}
        </SettingsStackedField>

        <SettingsStackedField
          label={t('settings.providers.page.custom.field.icon.label')}
          info={t('settings.providers.page.custom.field.icon.info')}
        >
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('settings.providers.page.custom.field.icon.label')}>
            {/* Default keeps the provider's own logo when its id has one. */}
            <Button
              type="button"
              variant={form.icon === null ? 'chip' : 'ghost'}
              size="icon"
              className={cn(SETTINGS_ICON_BUTTON_CLASS, form.icon === null && 'text-foreground')}
              aria-label={t('settings.providers.page.custom.field.icon.option.default')}
              title={t('settings.providers.page.custom.field.icon.option.default')}
              aria-pressed={form.icon === null}
              disabled={busy}
              onClick={() => setForm((previous) => ({ ...previous, icon: null }))}
            >
              {providerHasLogo
                ? <ProviderLogo providerId={logoProviderId} className="size-4" ignoreCustomIcon />
                : <Icon name="checkbox-blank-circle" className="size-4 text-muted-foreground" />}
            </Button>
            {CUSTOM_PROVIDER_ICONS.map((entry) => (
              <Button
                key={entry.id}
                type="button"
                variant={form.icon === entry.id ? 'chip' : 'ghost'}
                size="icon"
                className={cn(SETTINGS_ICON_BUTTON_CLASS, form.icon === entry.id && 'text-foreground')}
                aria-label={t(`settings.providers.page.custom.field.icon.option.${entry.id}`)}
                title={t(`settings.providers.page.custom.field.icon.option.${entry.id}`)}
                aria-pressed={form.icon === entry.id}
                disabled={busy}
                onClick={() => setForm((previous) => ({ ...previous, icon: entry.id }))}
              >
                <Icon name={entry.icon} className="size-4" />
              </Button>
            ))}
          </div>
        </SettingsStackedField>

        {providerLogoUploadSupported() ? (
          <SettingsStackedField
            label={t('settings.providers.page.logo.title')}
            info={t('settings.providers.page.logo.info')}
            settingsItem="providers.logo"
          >
            <ProviderLogoImageControl
              preview={pickedLogoUrl
                ? <img src={pickedLogoUrl} alt="" className="size-5 object-contain" />
                : form.logo === null && storedLogo ? <ProviderLogo providerId={logoProviderId} alt="" className="size-5" /> : null}
              busy={busy}
              onPick={(file) => setForm((previous) => ({ ...previous, logo: file }))}
              onRemove={() => setForm((previous) => ({ ...previous, logo: 'removed' }))}
            />
          </SettingsStackedField>
        ) : null}

        <SettingsStackedField
          label={t('settings.providers.page.custom.field.baseURL.label')}
          info={t('settings.providers.page.custom.field.baseURL.info')}
        >
          <Input
            value={form.endpoint}
            onChange={(event) => setField('endpoint', event.target.value)}
            disabled={busy}
            placeholder={t('settings.providers.page.custom.field.baseURL.placeholder')}
            className="h-7 rounded-md px-3 font-mono text-xs"
            aria-invalid={Boolean(fieldErrors.endpoint)}
            aria-label={t('settings.providers.page.custom.field.baseURL.label')}
          />
          {fieldErrors.endpoint ? <p className="mt-1 typography-meta text-[var(--status-error)]">{fieldErrors.endpoint}</p> : null}
        </SettingsStackedField>

        <SettingsStackedField
          label={t('settings.providers.page.custom.field.apiKey.label')}
          info={isEdit
            ? t('settings.providers.page.custom.field.apiKey.editInfo')
            : t('settings.providers.page.custom.field.apiKey.info')}
          description={t('settings.providers.native.secretHint')}
        >
          <Input
            type="password"
            value={form.apiKey}
            onChange={(event) => setField('apiKey', event.target.value)}
            disabled={busy}
            placeholder={isEdit
              ? t('settings.providers.page.custom.field.apiKey.editPlaceholder')
              : t('settings.providers.page.custom.field.apiKey.placeholder')}
            autoComplete="new-password"
            className="h-7 rounded-md px-3 font-mono text-xs"
            aria-label={t('settings.providers.page.custom.field.apiKey.label')}
          />
        </SettingsStackedField>
      </SettingsSection>

      <SettingsSection
        title={t('settings.providers.page.custom.models.title')}
        contentClassName={SETTINGS_FIELDS_STACK_CLASS}
      >
        <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} space-y-2`}>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void discoverModels()}
              disabled={disabled || !form.endpoint.trim()}
            >
              <Icon name="search" className="size-3.5" />
              {discovering
                ? t('settings.providers.page.custom.discovery.fetching')
                : t('settings.providers.page.custom.discovery.fetch')}
            </Button>
            <SettingsInfoHint>{t('settings.providers.native.discoveryHint')}</SettingsInfoHint>
          </div>
          {discoveryError ? <p className="typography-meta text-[var(--status-error)]" role="alert">{discoveryError}</p> : null}
          {discoveredModels ? (
            <CustomProviderModelDiscovery
              models={discoveredModels}
              existingIds={new Set(form.models.map((model) => model.modelId.trim()).filter(Boolean))}
              onAdd={addDiscoveredModels}
              onCancel={() => setDiscoveredModels(null)}
            />
          ) : null}
        </div>

        <div className={SETTINGS_CONTROL_CLUSTER_CLASS}>
          {form.models.map((model, index) => (
            <CustomProviderModelRow
              key={model.row}
              model={model}
              errors={modelErrors[index]}
              expanded={expandedRows.has(model.row)}
              disabled={busy}
              onToggle={() => toggleRow(model.row)}
              onChange={(key, value) => setModel(index, key, value)}
<<<<<<< HEAD
              onToggleModality={(modality) => toggleModality(index, modality)}
              onToolsChange={(tools) => setTools(index, tools)}
=======
              onToggleCapability={(target, capability) => toggleCapability(index, target, capability)}
              onToolsChange={(tools) => setForm((previous) => ({
                ...previous,
                models: previous.models.map((entry, rowIndex) => rowIndex === index ? { ...entry, tools, capabilitiesKnown: true, metadataSource: 'manual' } : entry),
              }))}
              // Unchecked writes `chat` explicitly: the save merges over the
              // stored entry, so leaving `type` out would keep `image`.
              onImageGenerationChange={(imageGeneration) => setForm((previous) => ({
                ...previous,
                models: previous.models.map((entry, rowIndex) => rowIndex === index ? { ...entry, type: imageGeneration ? 'image' : 'chat' } : entry),
              }))}
>>>>>>> bc50ba56a
              onRemove={form.models.length > 1 ? () => {
                setForm((previous) => ({
                  ...previous,
                  models: previous.models.filter((_, rowIndex) => rowIndex !== index),
                }));
                setModelErrors((previous) => previous.filter((_, rowIndex) => rowIndex !== index));
              } : undefined}
            />
          ))}
        </div>
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
          }}
        >
          {t('settings.providers.page.custom.models.add')}
        </Button>
      </SettingsSection>

      <SettingsSection
        title={t('settings.providers.page.custom.headers.title')}
        contentClassName={SETTINGS_FIELDS_STACK_CLASS}
      >
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.page.custom.headers.description')}</p>
        {isEdit ? (
          <div className="space-y-2">
            {form.headerNames.length > 0 ? (
              <p className="typography-meta text-muted-foreground">
                {t('settings.providers.native.configuredHeaders', { names: form.headerNames.join(', ') })}
              </p>
            ) : null}
            <SettingsCheckboxRow
              checked={form.replaceHeaders}
              onChange={(replaceHeaders) => setForm((previous) => ({
                ...previous,
                replaceHeaders,
                headers: replaceHeaders ? previous.headers : [],
              }))}
              label={t('settings.providers.native.replaceHeaders')}
              ariaLabel={t('settings.providers.native.replaceHeaders')}
            />
          </div>
        ) : null}
        {form.replaceHeaders ? (
          <>
            {form.headers.map((header, index) => (
              <div key={header.row} className={`${SETTINGS_CONTROL_CLUSTER_CLASS} space-y-2`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <label className={SETTINGS_FIELD_LABEL_CLASS}>
                        {t('settings.providers.page.custom.headers.keyLabel')}
                      </label>
                      <Input
                        value={header.name}
                        onChange={(event) => setHeader(index, 'name', event.target.value)}
                        disabled={busy}
                        placeholder={t('settings.providers.page.custom.headers.keyPlaceholder')}
                        className="mt-1 h-7 rounded-md px-3 font-mono text-xs"
                        aria-invalid={Boolean(headerErrors[index]?.name)}
                        aria-label={t('settings.providers.page.custom.headers.keyLabel')}
                      />
                      {headerErrors[index]?.name ? (
                        <p className="mt-1 typography-meta text-[var(--status-error)]">{headerErrors[index]?.name}</p>
                      ) : null}
                    </div>
                    <div>
                      <label className={SETTINGS_FIELD_LABEL_CLASS}>
                        {t('settings.providers.page.custom.headers.valueLabel')}
                      </label>
                      <Input
                        type="password"
                        value={header.value}
                        onChange={(event) => setHeader(index, 'value', event.target.value)}
                        disabled={busy}
                        placeholder={t('settings.providers.page.custom.headers.valuePlaceholder')}
                        autoComplete="new-password"
                        className="mt-1 h-7 rounded-md px-3 font-mono text-xs"
                        aria-invalid={Boolean(headerErrors[index]?.value)}
                        aria-label={t('settings.providers.page.custom.headers.valueLabel')}
                      />
                      {headerErrors[index]?.value ? (
                        <p className="mt-1 typography-meta text-[var(--status-error)]">{headerErrors[index]?.value}</p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={SETTINGS_ICON_BUTTON_CLASS}
                    disabled={form.headers.length <= 1}
                    onClick={() => {
                      if (form.headers.length <= 1) return;
                      setForm((previous) => ({
                        ...previous,
                        headers: previous.headers.filter((_, rowIndex) => rowIndex !== index),
                      }));
                      setHeaderErrors((previous) => previous.filter((_, rowIndex) => rowIndex !== index));
                    }}
                    aria-label={t('settings.providers.page.custom.headers.remove')}
                  >
                    <Icon name="delete-bin" className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={disabled}
              onClick={() => {
                setForm((previous) => ({
                  ...previous,
                  headers: [...previous.headers, createHeaderRow()],
                }));
                setHeaderErrors((previous) => [...previous, {}]);
              }}
            >
              {t('settings.providers.page.custom.headers.add')}
            </Button>
          </>
        ) : null}
      </SettingsSection>

      {formError ? <p className="py-3 typography-meta text-[var(--status-error)]" role="alert">{formError}</p> : null}

      <div className="flex flex-wrap items-center gap-2 py-4">
        <Button type="button" variant="outline" size="xs" onClick={onCancel} disabled={busy}>
          {t('settings.providers.page.custom.actions.back')}
        </Button>
        {onDisconnect ? (
          <Button
            type="button"
            variant="destructive"
            size="xs"
            onClick={() => void onDisconnect()}
            disabled={busy}
          >
            {t('settings.providers.page.actions.disconnect')}
          </Button>
        ) : null}
        <Button type="submit" size="xs" disabled={busy || discovering}>
          {busy
            ? t('settings.providers.page.actions.saving')
            : isEdit
              ? t('settings.providers.page.custom.actions.update')
              : t('settings.providers.page.custom.actions.save')}
        </Button>
      </div>
    </form>
  );
};
