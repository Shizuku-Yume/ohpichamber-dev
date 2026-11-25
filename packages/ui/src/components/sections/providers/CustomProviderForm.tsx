import React from 'react';
import type { ModelCatalogInfo, ProviderConfigurationRead, ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import {
  SettingsFieldRow,
  SettingsSection,
  SETTINGS_WIDTH_LONG_TEXT_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_HELPER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { cn } from '@/lib/utils';
import {
  OMP_PROVIDER_APIS,
  OMP_PROVIDER_AUTH_MODES,
  createEmptyCustomProviderForm,
  legacyProtocolForApi,
  validateCustomProviderForm,
  type CustomProviderFieldErrors,
  type CustomProviderFormState,
  type CustomProviderPersistPlan,
  type HeaderFieldErrors,
  type ModelFieldErrors,
} from './custom-provider-form';
import {
  createModelRow,
  markModelFieldTyped,
  type ModelRow,
} from './custom-provider-model-rows';
import { apiDisplayLabel } from './provider-api-labels';
import { buildCustomProviderRequest, buildProviderDiscoveryRequest } from './custom-provider-persist';
import {
  AUTO_FILL_ENRICH_LIMIT,
  AUTO_FILL_OPENROUTER_LIMIT,
  applyModelCatalogInfo,
  autoFillIds,
  autoFillNoticeFor,
  createDiscoveredModelRow,
  formatAutoFillNoticeModels,
  idsMissingCatalog,
  unresolvedAutoFillIds,
  type AutoFillNotice,
} from './custom-provider-autofill';
import { CustomProviderAppearanceDisclosure } from './CustomProviderAppearanceDisclosure';
import { CustomProviderAdvancedSection } from './CustomProviderAdvancedSection';
import { CustomProviderModelsSection } from './CustomProviderModelsSection';
import type { CustomProviderIcon } from '@/lib/customProviderIcons';
import { CustomProviderModelRow } from './CustomProviderModelRow';
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
  const [appearanceOpen, setAppearanceOpen] = React.useState(false);
  const [headersOpen, setHeadersOpen] = React.useState(false);
  const [overridesOpen, setOverridesOpen] = React.useState(false);
  const [discoveryOpen, setDiscoveryOpen] = React.useState(false);
  const [compatOpen, setCompatOpen] = React.useState(false);
  const [bedrockOpen, setBedrockOpen] = React.useState(false);
  const [remoteCompactionOpen, setRemoteCompactionOpen] = React.useState(false);
  const [validationAttempt, setValidationAttempt] = React.useState(0);
  const lifetime = React.useRef(true);
  React.useEffect(() => { lifetime.current = true; return () => { lifetime.current = false; }; }, []);

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
    setValidationAttempt((count) => count + 1);
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
    if (validation.headers.some((row) => row.name || row.value)) {
      setHeadersOpen(true);
    }
    const overridesWithErrors = form.modelOverrides
      .filter((_, index) => hasModelErrors(validation.modelOverrides[index]))
      .map((model) => model.row);
    if (overridesWithErrors.length > 0) {
      setExpandedOverrides((previous) => new Set([...previous, ...overridesWithErrors]));
      setOverridesOpen(true);
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

  const providerBaseUrl = form.endpoint.trim() || form.effectiveBaseUrl.trim();

  const overridesSummary = form.modelOverrides.length > 0
    ? form.modelOverrides.length === 1
      ? t('settings.providers.page.custom.overrides.summary.single', { count: 1 })
      : t('settings.providers.page.custom.overrides.summary.plural', { count: form.modelOverrides.length })
    : undefined;

  return (
    <form onSubmit={submit}>
      <SettingsSection
        title={form.isBuiltIn
          ? t('settings.providers.page.custom.builtInTitle')
          : isEdit
            ? t('settings.providers.page.custom.editTitle')
            : t('settings.providers.page.custom.title')}
        info={form.isBuiltIn
          ? t('settings.providers.page.custom.builtInDescription')
          : t('settings.providers.native.customDescription')}
        divider={false}
        settingsItem="providers.custom"
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        {authFailureHint ? (
          <p className="typography-meta text-[var(--status-warning)]" role="status">
            {authFailureHint}
          </p>
        ) : null}

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
                {form.api ? apiDisplayLabel(form.api) : t('settings.providers.page.custom.omp.api.inherit')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET_VALUE}>{t('settings.providers.page.custom.omp.api.inherit')}</SelectItem>
              {OMP_PROVIDER_APIS.map((api) => (
                <SelectItem key={api} value={api}>{apiDisplayLabel(api)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFieldRow>

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

        <CustomProviderAppearanceDisclosure
          form={form}
          setForm={setForm}
          expanded={appearanceOpen}
          onToggle={() => setAppearanceOpen((prev) => !prev)}
          disabled={busy}
        />
      </SettingsSection>

      <CustomProviderModelsSection
        form={form}
        setForm={setForm}
        isEdit={isEdit}
        busy={busy}
        disabled={disabled}
        validationAttempt={validationAttempt}
        providerBaseUrl={providerBaseUrl}
        modelErrors={modelErrors}
        setModelErrors={setModelErrors}
        expandedRows={expandedRows}
        setExpandedRows={setExpandedRows}
        modelSearch={modelSearch}
        setModelSearch={setModelSearch}
        modelApiFilter={modelApiFilter}
        setModelApiFilter={setModelApiFilter}
        discovering={discovering}
        discoveryError={discoveryError}
        discoverEndpointAvailable={discoverEndpointAvailable}
        onDiscover={() => void discoverModels()}
        autoFilling={autoFilling}
        autoFillNotice={autoFillNotice}
        partialNoticeModels={partialNoticeModels}
        onAutoFill={() => void autoFillModels()}
        clearAutoFillNotice={clearAutoFillNotice}
        discoveredModels={discoveredModels}
        modelsDialogOpen={modelsDialogOpen}
        onModelsDialogChange={(open) => {
          setModelsDialogOpen(open);
          if (!open) setDiscoveredModels(null);
        }}
        addDiscoveredModels={addDiscoveredModels}
        removeModelRows={removeModelRows}
        updateModelAt={updateModelAt}
        clearModelErrorAt={clearModelErrorAt}
      />

      <CustomProviderAdvancedSection
        form={form}
        setForm={setForm}
        fieldErrors={fieldErrors}
        setFieldErrors={setFieldErrors}
        headerErrors={headerErrors}
        setHeaderErrors={setHeaderErrors}
        metadataErrors={metadataErrors}
        setMetadataErrors={setMetadataErrors}
        isEdit={isEdit}
        busy={busy}
        headersOpen={headersOpen}
        onToggleHeaders={() => setHeadersOpen((prev) => !prev)}
        discoveryOpen={discoveryOpen}
        onToggleDiscovery={() => setDiscoveryOpen((prev) => !prev)}
        compatOpen={compatOpen}
        onToggleCompat={() => setCompatOpen((prev) => !prev)}
        bedrockOpen={bedrockOpen}
        onToggleBedrock={() => setBedrockOpen((prev) => !prev)}
        remoteCompactionOpen={remoteCompactionOpen}
        onToggleRemoteCompaction={() => setRemoteCompactionOpen((prev) => !prev)}
        overridesSummary={overridesSummary}
        overridesOpen={overridesOpen}
        onToggleOverrides={() => setOverridesOpen((prev) => !prev)}
        overrides={(
          <div className="space-y-3 ps-4 pt-1">
            <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.page.custom.omp.overrides.description')}</p>
            {form.modelOverrides.length > 0 ? (
              <div className="divide-y divide-border/50">
                {form.modelOverrides.map((override, index) => (
                  <CustomProviderModelRow
                    key={override.row}
                    mode="override"
                    isEdit={isEdit}
                    providerDefaultApi={form.api}
                    providerBaseUrl={providerBaseUrl}
                    model={override}
                    errors={overrideErrors[index]}
                    validationAttempt={validationAttempt}
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
            <div>
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
            </div>
          </div>
        )}
      />

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
