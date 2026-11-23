import React from 'react';
import type { ModelCatalogInfo, ProviderConfigurationRead, ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import {
  SettingsCheckboxRow,
  SettingsDisclosure,
  SettingsFieldRow,
  SettingsSection,
  SettingsStackedField,
  SETTINGS_WIDTH_LONG_TEXT_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { useProviderLogo } from '@/hooks/useProviderLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from '@/components/icon/Icon';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { CUSTOM_PROVIDER_ICONS, type CustomProviderIcon } from '@/lib/customProviderIcons';
import { providerLogoUploadSupported } from '@/lib/customProviderLogos';
import { useUIStore } from '@/stores/useUIStore';
import { ProviderLogoImageControl } from './ProviderLogoImageControl';
import { cn } from '@/lib/utils';
import {
  AUTO_FILL_ENRICH_LIMIT,
  AUTO_FILL_OPENROUTER_LIMIT,
  OMP_BEDROCK_GUARDRAIL_TRACES,
  OMP_DISCOVERY_TYPES,
  OMP_PROVIDER_APIS,
  OMP_PROVIDER_AUTH_MODES,
  applyModelCatalogInfo,
  autoFillIds,
  autoFillNoticeFor,
  buildCustomProviderRequest,
  buildProviderDiscoveryRequest,
  createDiscoveredModelRow,
  createEmptyCustomProviderForm,
  createHeaderRow,
  createModelRow,
  duplicateModelRow,
  formatAutoFillNoticeModels,
  idsMissingCatalog,
  legacyProtocolForApi,
  markModelFieldTyped,
  unresolvedAutoFillIds,
  validateCustomProviderForm,
  type AutoFillNotice,
  type ConfigApiKeyAction,
  type CustomProviderFieldErrors,
  type CustomProviderFormState,
  type CustomProviderPersistPlan,
  type CustomProviderTranslator,
  type HeaderFieldErrors,
  type ModelFieldErrors,
  type ModelRow,
} from './custom-provider-form';
import { CustomProviderModelsDialog } from './CustomProviderModelsDialog';
import { CustomProviderModelRow } from './CustomProviderModelRow';
import { OmpHeadersEditor, OmpRemoteCompactionFields, TriStateSelect } from './OmpProviderSubforms';
import { problemMessage } from '@/lib/problemMessage';

const UNSET_VALUE = '__default__';

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
  onDeleteProvider?: () => Promise<void>;
  onResetOverrides?: () => Promise<void>;
}

const apiDisplayLabel = (api: string, t: CustomProviderTranslator): string => {
  switch (api) {
    case 'openai-completions':
      return `${t('settings.providers.page.custom.field.protocol.openaiChat')} (${api})`;
    case 'openai-responses':
      return `${t('settings.providers.page.custom.field.protocol.openaiResponses')} (${api})`;
    case 'anthropic-messages':
      return `${t('settings.providers.page.custom.field.protocol.anthropicMessages')} (${api})`;
    default:
      return api;
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
  onDeleteProvider,
  onResetOverrides,
}) => {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const isEdit = Boolean(initial);
  const [form, setForm] = React.useState<CustomProviderFormState>(() => createEmptyCustomProviderForm(initial, initialIcon));
  const [fieldErrors, setFieldErrors] = React.useState<CustomProviderFieldErrors>({});
  const [modelErrors, setModelErrors] = React.useState<ModelFieldErrors[]>([]);
  const [overrideErrors, setOverrideErrors] = React.useState<ModelFieldErrors[]>([]);
  const [headerErrors, setHeaderErrors] = React.useState<HeaderFieldErrors[]>([]);
  const [metadataErrors, setMetadataErrors] = React.useState<HeaderFieldErrors[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [discovering, setDiscovering] = React.useState(false);
  const [discoveryError, setDiscoveryError] = React.useState<string | null>(null);
  const [discoveredModels, setDiscoveredModels] = React.useState<ProviderModelDiscoveryResult['models'] | null>(null);
  const [modelsDialogOpen, setModelsDialogOpen] = React.useState(false);
  const [autoFilling, setAutoFilling] = React.useState(false);
  const [autoFillNotice, setAutoFillNotice] = React.useState<AutoFillNotice | null>(null);
  const [unresolvedModelIds, setUnresolvedModelIds] = React.useState<string[]>([]);
  const [modelSearch, setModelSearch] = React.useState('');
  const [modelApiFilter, setModelApiFilter] = React.useState<string>('all');
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(() => (
    new Set(initial ? [] : form.models.map((model) => model.row))
  ));
  const [expandedOverrides, setExpandedOverrides] = React.useState<Set<string>>(() => new Set());
  const [discoveryOpen, setDiscoveryOpen] = React.useState(() => form.discoveryEnabled);
  const [compatOpen, setCompatOpen] = React.useState(() => Boolean(
    form.compatJson.trim() || form.disableStrictTools !== 'default' || form.transportPiNative,
  ));
  const [bedrockOpen, setBedrockOpen] = React.useState(() => Boolean(
    form.api === 'bedrock-converse-stream'
    || form.guardrailIdentifier.trim()
    || form.guardrailVersion.trim()
    || form.guardrailTrace
    || form.requestMetadata.length > 0,
  ));
  const [remoteCompactionOpen, setRemoteCompactionOpen] = React.useState(() => Boolean(
    form.remoteCompactionEnabled !== 'default'
    || form.remoteCompactionApi
    || form.remoteCompactionEndpoint.trim()
    || form.remoteCompactionModel.trim()
    || form.remoteCompactionV2StreamingEnabled !== 'default'
    || form.remoteCompactionV2Endpoint.trim()
    || form.remoteCompactionStreamingEndpoint.trim(),
  ));
  const lifetime = React.useRef(true);
  React.useEffect(() => { lifetime.current = true; return () => { lifetime.current = false; }; }, []);

  const logoProviderId = form.providerId.trim() || 'custom';
  const { hasLogo: providerHasLogo } = useProviderLogo(logoProviderId);
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
  const disabled = busy || discovering || autoFilling;
  const partialNoticeModels = formatAutoFillNoticeModels(
    unresolvedModelIds,
    (models, count) => t('settings.providers.page.custom.models.autofill.notice.moreModels', { models, count }),
  );

  const setField = (key: 'providerId' | 'name' | 'endpoint' | 'apiKey', value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (key === 'apiKey') return;
    setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const toggleRow = (row: string) => setExpandedRows((previous) => {
    const next = new Set(previous);
    if (next.has(row)) next.delete(row);
    else next.add(row);
    return next;
  });

  const toggleOverrideRow = (row: string) => setExpandedOverrides((previous) => {
    const next = new Set(previous);
    if (next.has(row)) next.delete(row);
    else next.add(row);
    return next;
  });

  const clearAutoFillNotice = () => {
    setAutoFillNotice(null);
    setUnresolvedModelIds([]);
  };

  const discoverEndpointAvailable = Boolean(form.endpoint.trim() || form.effectiveBaseUrl.trim());

  const discoverModels = async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    const runtime = getRuntimeKey();
    try {
      const result = await canonicalClient.discoverProviderModels(workspaceId, buildProviderDiscoveryRequest(form, isEdit));
      if (lifetime.current && runtime === getRuntimeKey()) {
        setDiscoveredModels(result.models);
        setModelsDialogOpen(true);
        clearAutoFillNotice();
      }
    } catch (error) {
      if (lifetime.current && runtime === getRuntimeKey()) {
        setDiscoveryError(problemMessage(error, t('settings.providers.page.custom.discovery.failed')));
      }
    } finally {
      if (lifetime.current) setDiscovering(false);
    }
  };

  const addDiscoveredModels = (modelIds: string[]) => {
    const wanted = new Set(modelIds.map((modelId) => modelId.trim()));
    setForm((previous) => {
      const existing = new Set(previous.models.map((model) => model.modelId.trim()).filter(Boolean));
      const added = (discoveredModels ?? [])
        .map((model) => ({ ...model, modelId: model.modelId.trim() }))
        .filter((model) => wanted.has(model.modelId) && !existing.has(model.modelId))
        .map(createDiscoveredModelRow);
      const kept = previous.models.filter((model) => model.modelId.trim() || model.name.trim());
      return { ...previous, models: [...kept, ...added] };
    });
    setModelErrors([]);
    clearAutoFillNotice();
  };

  const removeModelRows = (modelIds: string[]) => {
    const unwanted = new Set(modelIds);
    setForm((previous) => {
      const models = previous.models.filter((model) => !unwanted.has(model.modelId.trim()));
      const allowEmpty = previous.isBuiltIn || previous.discoveryEnabled || previous.modelOverrides.length > 0;
      return { ...previous, models: models.length > 0 || allowEmpty ? models : [createModelRow()] };
    });
    setModelErrors([]);
    clearAutoFillNotice();
  };

  const updateModelAt = (kind: 'models' | 'modelOverrides', index: number, updater: (row: ModelRow) => ModelRow) => {
    setForm((previous) => ({
      ...previous,
      [kind]: previous[kind].map((row, rowIndex) => (rowIndex === index ? updater(row) : row)),
    }));
  };

  const clearModelErrorAt = (kind: 'models' | 'modelOverrides', index: number, field: keyof ModelFieldErrors) => {
    const setter = kind === 'models' ? setModelErrors : setOverrideErrors;
    setter((previous) => {
      const next = [...previous];
      next[index] = { ...(next[index] ?? {}), [field]: undefined };
      return next;
    });
  };

  const autoFillModels = async () => {
    const ids = autoFillIds(form.models);
    if (ids.length === 0) return;
    setAutoFilling(true);
    setAutoFillNotice(null);
    setUnresolvedModelIds([]);
    const runtime = getRuntimeKey();
    const answers = new Map<string, ModelCatalogInfo>();
    const isCurrent = () => lifetime.current && runtime === getRuntimeKey();
    let lookupNotice: 'enterprise' | 'failed' | null = null;
    const enrichIds = ids.slice(0, AUTO_FILL_ENRICH_LIMIT);
    const overCap = ids.slice(AUTO_FILL_ENRICH_LIMIT);
    try {
      const enriched = await canonicalClient.enrichProviderModels(workspaceId, {
        ...(form.providerId.trim() ? { providerId: form.providerId.trim() } : {}),
        models: enrichIds.map((modelId) => ({ modelId })),
      });
      if (!isCurrent()) return;
      for (const entry of enriched.models) {
        if (entry.catalog) answers.set(entry.modelId, entry.catalog);
      }
      const candidates = idsMissingCatalog(form.models, answers);
      const missing = candidates.slice(0, AUTO_FILL_OPENROUTER_LIMIT);
      if (missing.length > 0) {
        try {
          const openRouter = await canonicalClient.openRouterModelInfo(missing);
          if (!isCurrent()) return;
          for (const entry of openRouter.models) answers.set(entry.modelId, entry.catalog);
        } catch (error) {
          if (!isCurrent()) return;
          lookupNotice = error instanceof CanonicalApiError && error.problem.code === 'enterprise_mode' ? 'enterprise' : 'failed';
        }
      }
      const preview = applyModelCatalogInfo(form.models, answers);
      setForm((previous) => ({ ...previous, models: applyModelCatalogInfo(previous.models, answers).models }));
      if (!isCurrent()) return;
      const unresolved = unresolvedAutoFillIds([...candidates, ...overCap], answers);
      setUnresolvedModelIds(unresolved);
      setAutoFillNotice(autoFillNoticeFor({
        lookup: lookupNotice,
        answered: answers.size,
        filled: preview.filled,
        unresolved,
      }));
    } catch (error) {
      if (!isCurrent()) return;
      const refused = error instanceof CanonicalApiError && error.problem.code === 'enterprise_mode';
      setAutoFillNotice(refused ? 'enterprise' : 'failed');
    } finally {
      if (lifetime.current) setAutoFilling(false);
    }
  };

  const hasModelErrors = (entry: ModelFieldErrors | undefined): boolean => Boolean(
    entry && (
      entry.modelId || entry.name || entry.baseUrl || entry.contextWindow || entry.maxContextWindow || entry.maxOutputTokens
      || entry.thinkingEfforts || entry.thinkingEffortMapJson || entry.cost || entry.promptCacheShort || entry.promptCacheLong
      || entry.premiumMultiplier || entry.imageCountBudget || entry.compatJson || entry.remoteCompactionEndpoint
      || entry.remoteCompactionV2Endpoint || entry.remoteCompactionStreamingEndpoint
      || entry.headers?.some((h) => h.name || h.value)
    ),
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || discovering) return;
    setFormError(null);
    const validation = validateCustomProviderForm(form, existingProviderIDs, isEdit, t);
    setFieldErrors(validation.fields);
    setModelErrors(validation.models);
    setOverrideErrors(validation.modelOverrides);
    setHeaderErrors(validation.headers);
    setMetadataErrors(validation.requestMetadata);

    const rowsWithErrors = form.models
      .filter((_, index) => hasModelErrors(validation.models[index]))
      .map((model) => model.row);
    if (rowsWithErrors.length > 0) {
      setExpandedRows((previous) => new Set([...previous, ...rowsWithErrors]));
    }
    const overridesWithErrors = form.modelOverrides
      .filter((_, index) => hasModelErrors(validation.modelOverrides[index]))
      .map((model) => model.row);
    if (overridesWithErrors.length > 0) {
      setExpandedOverrides((previous) => new Set([...previous, ...overridesWithErrors]));
    }
    if (validation.fields.discoveryTimeoutMs) setDiscoveryOpen(true);
    if (validation.fields.compatJson) setCompatOpen(true);
    if (validation.requestMetadata.some((r) => r.name || r.value)) setBedrockOpen(true);
    if (
      validation.fields.remoteCompactionEndpoint
      || validation.fields.remoteCompactionV2Endpoint
      || validation.fields.remoteCompactionStreamingEndpoint
    ) {
      setRemoteCompactionOpen(true);
    }
    if (!validation.valid) return;

    let plan: CustomProviderPersistPlan;
    try {
      plan = buildCustomProviderRequest(form, revision);
    } catch (error) {
      setFormError(problemMessage(error, t('settings.providers.native.invalidConfiguration')));
      return;
    }
    try {
      await onSubmit(plan);
      if (lifetime.current) setForm((previous) => ({ ...previous, apiKey: '', configApiKeyValue: '', configApiKeyAction: 'keep' }));
    } catch (error) {
      if (lifetime.current) setFormError(problemMessage(error, t('settings.providers.page.toast.customProviderSaveFailed')));
    }
  };

  const handleDeleteProvider = async () => {
    if (!onDeleteProvider || busy) return;
    const confirmed = await confirm({
      title: t('settings.providers.page.custom.omp.actions.deleteProvider'),
      message: t('settings.providers.page.custom.omp.actions.confirmDelete', {
        provider: form.name.trim() || form.providerId,
      }),
      action: t('settings.providers.page.custom.omp.actions.deleteProvider'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await onDeleteProvider();
    } catch (error) {
      if (lifetime.current) setFormError(problemMessage(error, t('settings.providers.page.toast.customProviderSaveFailed')));
    }
  };

  const handleResetOverrides = async () => {
    if (!onResetOverrides || busy) return;
    const confirmed = await confirm({
      title: t('settings.providers.page.custom.omp.actions.resetOverrides'),
      message: t('settings.providers.page.custom.omp.actions.confirmResetOverrides', {
        provider: form.name.trim() || form.providerId,
      }),
      action: t('settings.providers.page.custom.omp.actions.resetOverrides'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await onResetOverrides();
    } catch (error) {
      if (lifetime.current) setFormError(problemMessage(error, t('settings.providers.page.toast.customProviderSaveFailed')));
    }
  };

  const configApiKeyStatusText = (): string => {
    const status = form.configApiKeyStatus;
    if (!status.configured) return t('settings.providers.page.custom.omp.configApiKey.statusNone');
    switch (status.source) {
      case 'env':
        return t('settings.providers.page.custom.omp.configApiKey.statusEnv', { envVar: status.envVar });
      case 'command':
        return t('settings.providers.page.custom.omp.configApiKey.statusCommand');
      case 'literal':
        return t('settings.providers.page.custom.omp.configApiKey.statusLiteral');
    }
  };

  const configApiKeyActionLabel = (action: ConfigApiKeyAction): string => {
    switch (action) {
      case 'keep':
        return t('settings.providers.page.custom.omp.configApiKey.keep');
      case 'set':
        return t('settings.providers.page.custom.omp.configApiKey.set');
      case 'clear':
        return t('settings.providers.page.custom.omp.configApiKey.clear');
    }
  };

  const authLabel = (authMode: string): string => {
    switch (authMode) {
      case 'apiKey':
        return t('settings.providers.page.custom.omp.auth.apiKey');
      case 'none':
        return t('settings.providers.page.custom.omp.auth.none');
      case 'oauth':
        return t('settings.providers.page.custom.omp.auth.oauth');
      default:
        return t('settings.providers.page.custom.omp.option.default');
    }
  };

  const allowEmptyModels = form.isBuiltIn || form.discoveryEnabled || form.modelOverrides.length > 0;
  const canRemoveModel = (count: number) => allowEmptyModels || count > 1;

  return (
    <form onSubmit={submit}>
      <SettingsSection
        title={form.isBuiltIn
          ? t('settings.providers.page.custom.builtInTitle')
          : isEdit
            ? t('settings.providers.page.custom.editTitle')
            : t('settings.providers.page.custom.title')}
        settingsItem="providers.custom"
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <p className={SETTINGS_HELPER_CLASS}>
          {form.isBuiltIn
            ? t('settings.providers.page.custom.builtInDescription')
            : t('settings.providers.native.customDescription')}
        </p>

        {authFailureHint ? (
          <p className="typography-meta text-[var(--status-warning)]" role="status">
            {authFailureHint}
          </p>
        ) : null}

        <SettingsFieldRow
          label={t('settings.providers.page.custom.field.providerID.label')}
          info={t('settings.providers.page.custom.field.providerID.info')}
        >
          <div className={cn('flex min-w-0 flex-col gap-1', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>
            <Input
              value={form.providerId}
              onChange={(event) => setField('providerId', event.target.value)}
              placeholder={t('settings.providers.page.custom.field.providerID.placeholder')}
              inputSize="compact"
              className="w-full rounded-md px-3 font-mono text-xs"
              autoFocus={!isEdit}
              disabled={isEdit || busy}
              aria-invalid={Boolean(fieldErrors.providerId)}
              aria-label={t('settings.providers.page.custom.field.providerID.label')}
            />
            {fieldErrors.providerId ? <p className="typography-meta text-[var(--status-error)]">{fieldErrors.providerId}</p> : null}
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow
          label={t('settings.providers.page.custom.field.protocol.label')}
          info={t('settings.providers.page.custom.field.protocol.info')}
        >
          <Select
            value={form.api || UNSET_VALUE}
            onValueChange={(next) => {
              if (next === UNSET_VALUE) {
                setForm((previous) => ({ ...previous, api: '' }));
                return;
              }
              const matched = OMP_PROVIDER_APIS.find((entry) => entry === next);
              if (matched) {
                setForm((previous) => ({
                  ...previous,
                  api: matched,
                  protocol: legacyProtocolForApi(matched) ?? previous.protocol,
                }));
                if (matched === 'bedrock-converse-stream') setBedrockOpen(true);
              }
            }}
            disabled={busy}
          >
            <SelectTrigger aria-label={t('settings.providers.page.custom.field.protocol.label')} className={SETTINGS_WIDTH_SELECT_CLASS}>
              <SelectValue>
                {form.api ? apiDisplayLabel(form.api, t) : t('settings.providers.page.custom.omp.api.inherit')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.api.inherit')}</SelectItem>
              {OMP_PROVIDER_APIS.map((api) => (
                <SelectItem key={api} value={api}>{apiDisplayLabel(api, t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFieldRow>

        <SettingsFieldRow
          label={t('settings.providers.page.custom.field.name.label')}
          info={t('settings.providers.page.custom.field.name.info')}
        >
          <div className={cn('flex min-w-0 flex-col gap-1', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>
            <Input
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
              disabled={busy}
              placeholder={form.providerId.trim() || t('settings.providers.page.custom.field.name.placeholder')}
              inputSize="compact"
              className="w-full rounded-md px-3"
              aria-invalid={Boolean(fieldErrors.name)}
              aria-label={t('settings.providers.page.custom.field.name.label')}
            />
            {fieldErrors.name ? <p className="typography-meta text-[var(--status-error)]">{fieldErrors.name}</p> : null}
          </div>
        </SettingsFieldRow>

        <SettingsStackedField
          label={t('settings.providers.page.custom.field.icon.label')}
          info={t('settings.providers.page.custom.field.icon.info')}
        >
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('settings.providers.page.custom.field.icon.label')}>
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
          <SettingsFieldRow
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
          </SettingsFieldRow>
        ) : null}

        <SettingsFieldRow
          label={t('settings.providers.page.custom.field.baseURL.label')}
          info={t('settings.providers.page.custom.field.baseURL.info')}
        >
          <div className={cn('flex min-w-0 flex-col gap-1', SETTINGS_WIDTH_LONG_TEXT_CLASS)}>
            <Input
              value={form.endpoint}
              onChange={(event) => setField('endpoint', event.target.value)}
              disabled={busy}
              placeholder={form.effectiveBaseUrl || t('settings.providers.page.custom.field.baseURL.placeholder')}
              inputSize="compact"
              className="w-full rounded-md px-3 font-mono text-xs"
              aria-invalid={Boolean(fieldErrors.endpoint)}
              aria-label={t('settings.providers.page.custom.field.baseURL.label')}
            />
            {fieldErrors.endpoint ? <p className="typography-meta text-[var(--status-error)]">{fieldErrors.endpoint}</p> : null}
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow
          label={t('settings.providers.page.custom.field.apiKey.label')}
          info={(
            <div className="space-y-1">
              <p>{t('settings.providers.page.custom.omp.storedApiKey.info')}</p>
              <p>{t('settings.providers.native.secretHint')}</p>
            </div>
          )}
        >
          <Input
            type="password"
            value={form.apiKey}
            onChange={(event) => setField('apiKey', event.target.value)}
            disabled={busy}
            placeholder={isEdit
              ? t('settings.providers.page.custom.field.apiKey.editPlaceholder')
              : t('settings.providers.page.custom.omp.storedApiKey.placeholder')}
            autoComplete="new-password"
            inputSize="compact"
            className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'rounded-md px-3 font-mono text-xs')}
            aria-label={t('settings.providers.page.custom.field.apiKey.label')}
          />
        </SettingsFieldRow>

        <SettingsFieldRow
          label={t('settings.providers.page.custom.omp.auth.label')}
          info={t('settings.providers.page.custom.omp.auth.info')}
        >
          <Select
            value={form.auth || UNSET_VALUE}
            onValueChange={(next) => {
              if (next === UNSET_VALUE) {
                setForm((previous) => ({ ...previous, auth: '' }));
                return;
              }
              const matched = OMP_PROVIDER_AUTH_MODES.find((entry) => entry === next);
              if (matched) setForm((previous) => ({ ...previous, auth: matched }));
            }}
            disabled={busy}
          >
            <SelectTrigger aria-label={t('settings.providers.page.custom.omp.auth.label')} className={SETTINGS_WIDTH_SELECT_CLASS}>
              <SelectValue>{authLabel(form.auth)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.option.default')}</SelectItem>
              {OMP_PROVIDER_AUTH_MODES.map((authMode) => (
                <SelectItem key={authMode} value={authMode}>{authLabel(authMode)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFieldRow>

        <SettingsFieldRow
          label={t('settings.providers.page.custom.omp.authHeader.label')}
          info={t('settings.providers.page.custom.omp.authHeader.info')}
        >
          <TriStateSelect
            value={form.authHeader}
            onChange={(authHeader) => setForm((previous) => ({ ...previous, authHeader }))}
            ariaLabel={t('settings.providers.page.custom.omp.authHeader.label')}
            disabled={busy}
            triggerClassName={SETTINGS_WIDTH_SELECT_CLASS}
          />
        </SettingsFieldRow>

        <SettingsFieldRow
          label={t('settings.providers.page.custom.omp.configApiKey.label')}
          info={t('settings.providers.page.custom.omp.configApiKey.info')}
        >
          <div className={cn('flex min-w-0 flex-col gap-1.5', SETTINGS_WIDTH_LONG_TEXT_CLASS)}>
            <p className={SETTINGS_HELPER_CLASS}>{configApiKeyStatusText()}</p>
            <Select
              value={form.configApiKeyAction}
              onValueChange={(next) => {
                if (next === 'keep' || next === 'set' || next === 'clear') {
                  setForm((previous) => ({ ...previous, configApiKeyAction: next }));
                }
              }}
              disabled={busy}
            >
              <SelectTrigger aria-label={t('settings.providers.page.custom.omp.configApiKey.label')} className="w-full">
                <SelectValue>{configApiKeyActionLabel(form.configApiKeyAction)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">{t('settings.providers.page.custom.omp.configApiKey.keep')}</SelectItem>
                <SelectItem value="set">{t('settings.providers.page.custom.omp.configApiKey.set')}</SelectItem>
                {form.configApiKeyStatus.configured ? (
                  <SelectItem value="clear">{t('settings.providers.page.custom.omp.configApiKey.clear')}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            {form.configApiKeyAction === 'set' ? (
              <Input
                type="password"
                value={form.configApiKeyValue}
                onChange={(event) => setForm((previous) => ({ ...previous, configApiKeyValue: event.target.value }))}
                disabled={busy}
                placeholder={t('settings.providers.page.custom.omp.configApiKey.placeholder')}
                autoComplete="new-password"
                inputSize="compact"
                className="w-full rounded-md px-3 font-mono text-xs"
                aria-label={t('settings.providers.page.custom.omp.configApiKey.placeholder')}
              />
            ) : null}
          </div>
        </SettingsFieldRow>
      </SettingsSection>

      <SettingsSection
        title={t('settings.providers.page.custom.models.title')}
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <div className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'flex flex-col gap-2')}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void discoverModels()}
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
              onClick={() => void autoFillModels()}
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
              onOpenChange={(open) => {
                setModelsDialogOpen(open);
                if (!open) setDiscoveredModels(null);
              }}
              discovered={discoveredModels}
              models={form.models}
              busy={busy}
              onAdd={addDiscoveredModels}
              onRemove={removeModelRows}
            />
          ) : null}
        </div>

        {form.models.length >= 6 ? (
          <div className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'flex flex-col gap-2')}>
            <Input
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
              placeholder={t('settings.providers.page.custom.omp.models.searchPlaceholder')}
              aria-label={t('settings.providers.page.custom.omp.models.searchPlaceholder')}
              inputSize="compact"
              className="w-full rounded-md px-3"
              disabled={busy}
            />
            {(() => {
              const apiCounts = new Map<string, number>();
              for (const model of form.models) {
                const apiKey = model.api || form.api || 'inherited';
                apiCounts.set(apiKey, (apiCounts.get(apiKey) ?? 0) + 1);
              }
              if (apiCounts.size <= 1) return null;
              return (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('settings.providers.page.custom.omp.model.api')}>
                  <Button
                    type="button"
                    size="xs"
                    variant={modelApiFilter === 'all' ? 'chip' : 'outline'}
                    onClick={() => setModelApiFilter('all')}
                  >
                    {t('settings.providers.page.custom.models.dialog.filter.all')} ({form.models.length})
                  </Button>
                  {Array.from(apiCounts.entries()).map(([apiKey, count]) => (
                    <Button
                      key={apiKey}
                      type="button"
                      size="xs"
                      variant={modelApiFilter === apiKey ? 'chip' : 'outline'}
                      onClick={() => setModelApiFilter(apiKey)}
                    >
                      {apiKey === 'inherited' ? t('settings.providers.page.custom.omp.models.inheritedApi') : apiKey} ({count})
                    </Button>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : null}

        {form.models.length > 0 ? (
          <div className={SETTINGS_WIDTH_LONG_TEXT_CLASS}>
            {form.models.map((model, index) => {
              const query = modelSearch.trim().toLowerCase();
              const resolvedApi = model.api || form.api || 'inherited';
              if (modelApiFilter !== 'all' && resolvedApi !== modelApiFilter) return null;
              if (query && !model.modelId.toLowerCase().includes(query) && !model.name.toLowerCase().includes(query)) return null;
              return (
                <CustomProviderModelRow
                  key={model.row}
                  mode="definition"
                  isEdit={isEdit}
                  providerDefaultApi={form.api}
                  model={model}
                  errors={modelErrors[index]}
                  expanded={expandedRows.has(model.row)}
                  disabled={busy}
                  onToggle={() => toggleRow(model.row)}
                  onUpdate={(updater) => updateModelAt('models', index, updater)}
                  onClearError={(field) => clearModelErrorAt('models', index, field)}
                  onUserEdit={(field) => updateModelAt('models', index, (row) => markModelFieldTyped(row, field))}
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

      <SettingsSection
        title={t('settings.providers.page.custom.omp.overrides.title')}
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.page.custom.omp.overrides.description')}</p>
        {form.modelOverrides.length > 0 ? (
          <div className={SETTINGS_WIDTH_LONG_TEXT_CLASS}>
            {form.modelOverrides.map((override, index) => (
              <CustomProviderModelRow
                key={override.row}
                mode="override"
                isEdit={isEdit}
                model={override}
                errors={overrideErrors[index]}
                expanded={expandedOverrides.has(override.row)}
                disabled={busy}
                onToggle={() => toggleOverrideRow(override.row)}
                onUpdate={(updater) => updateModelAt('modelOverrides', index, updater)}
                onClearError={(field) => clearModelErrorAt('modelOverrides', index, field)}
                onUserEdit={(field) => updateModelAt('modelOverrides', index, (row) => markModelFieldTyped(row, field))}
                onRemove={() => {
                  setForm((previous) => ({
                    ...previous,
                    modelOverrides: previous.modelOverrides.filter((_, rowIndex) => rowIndex !== index),
                  }));
                  setOverrideErrors((previous) => previous.filter((_, rowIndex) => rowIndex !== index));
                }}
              />
            ))}
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled}
          onClick={() => {
            const row = createModelRow();
            setForm((previous) => ({ ...previous, modelOverrides: [...previous.modelOverrides, row] }));
            setOverrideErrors((previous) => [...previous, {}]);
            setExpandedOverrides((previous) => new Set([...previous, row.row]));
          }}
        >
          {t('settings.providers.page.custom.omp.overrides.add')}
        </Button>
      </SettingsSection>

      <SettingsSection
        title={t('settings.providers.page.custom.headers.title')}
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.page.custom.headers.description')}</p>
        <div className={SETTINGS_WIDTH_LONG_TEXT_CLASS}>
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
      </SettingsSection>

      <SettingsSection
        title={t('settings.providers.page.custom.omp.advanced.title')}
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <SettingsDisclosure
          title={t('settings.providers.page.custom.omp.discovery.title')}
          secondary={form.discoveryEnabled ? form.discoveryType : undefined}
          expanded={discoveryOpen}
          onToggle={() => setDiscoveryOpen((prev) => !prev)}
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
          expanded={compatOpen}
          onToggle={() => setCompatOpen((prev) => !prev)}
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
          secondary={form.guardrailIdentifier.trim() || undefined}
          expanded={bedrockOpen}
          onToggle={() => setBedrockOpen((prev) => !prev)}
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
          secondary={form.remoteCompactionEndpoint.trim() || undefined}
          expanded={remoteCompactionOpen}
          onToggle={() => setRemoteCompactionOpen((prev) => !prev)}
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
                setForm((previous) => ({
                  ...previous,
                  ...(patch.enabled !== undefined ? { remoteCompactionEnabled: patch.enabled } : {}),
                  ...(patch.api !== undefined ? { remoteCompactionApi: patch.api } : {}),
                  ...(patch.endpoint !== undefined ? { remoteCompactionEndpoint: patch.endpoint } : {}),
                  ...(patch.model !== undefined ? { remoteCompactionModel: patch.model } : {}),
                  ...(patch.v2StreamingEnabled !== undefined ? { remoteCompactionV2StreamingEnabled: patch.v2StreamingEnabled } : {}),
                  ...(patch.v2Endpoint !== undefined ? { remoteCompactionV2Endpoint: patch.v2Endpoint } : {}),
                  ...(patch.streamingEndpoint !== undefined ? { remoteCompactionStreamingEndpoint: patch.streamingEndpoint } : {}),
                }));
                if (patch.endpoint !== undefined) setFieldErrors((previous) => ({ ...previous, remoteCompactionEndpoint: undefined }));
                if (patch.v2Endpoint !== undefined) setFieldErrors((previous) => ({ ...previous, remoteCompactionV2Endpoint: undefined }));
                if (patch.streamingEndpoint !== undefined) setFieldErrors((previous) => ({ ...previous, remoteCompactionStreamingEndpoint: undefined }));
              }}
            />
          </div>
        </SettingsDisclosure>
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
        {!form.isBuiltIn && onDeleteProvider ? (
          <Button
            type="button"
            variant="destructive"
            size="xs"
            onClick={() => void handleDeleteProvider()}
            disabled={busy}
          >
            {t('settings.providers.page.custom.omp.actions.deleteProvider')}
          </Button>
        ) : null}
        {form.isBuiltIn && form.hasNativeEntry && onResetOverrides ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => void handleResetOverrides()}
            disabled={busy}
          >
            {t('settings.providers.page.custom.omp.actions.resetOverrides')}
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
      {confirmDialog}
    </form>
  );
};
