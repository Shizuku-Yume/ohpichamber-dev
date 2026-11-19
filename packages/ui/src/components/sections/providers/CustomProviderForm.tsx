import React from 'react';
import type { ModelCatalogInfo, ProviderConfigurationRead, ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import {
  SettingsCheckboxRow,
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
<<<<<<< HEAD
||||||| bc50ba56aa
  SETTINGS_CONTROL_CLUSTER_CLASS,
=======
  SETTINGS_CONTROL_CLUSTER_CLASS,
  SETTINGS_SECTION_TITLE_CLASS,
>>>>>>> upstream/main
} from '@/components/sections/shared/SettingsSection';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { useProviderLogo } from '@/hooks/useProviderLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { canonicalClient } from '@/api/canonicalClient';
import { CUSTOM_PROVIDER_ICONS, type CustomProviderIcon } from '@/lib/customProviderIcons';
import { providerLogoUploadSupported } from '@/lib/customProviderLogos';
import { useUIStore } from '@/stores/useUIStore';
import { ProviderLogoImageControl } from './ProviderLogoImageControl';
import { cn } from '@/lib/utils';
import {
  CUSTOM_PROVIDER_PROTOCOLS,
<<<<<<< HEAD
  AUTO_FILL_ENRICH_LIMIT,
  AUTO_FILL_OPENROUTER_LIMIT,
  applyModelCatalogInfo,
  autoFillIds,
  autoFillNoticeFor,
  formatAutoFillNoticeModels,
  unresolvedAutoFillIds,
  buildCustomProviderRequest,
  buildProviderDiscoveryRequest,
  createDiscoveredModelRow,
||||||| bc50ba56aa
=======
  EMPTY_CLIENT_CERTIFICATE,
>>>>>>> upstream/main
  createEmptyCustomProviderForm,
  createHeaderRow,
  createModelRow,
<<<<<<< HEAD
  idsMissingCatalog,
  isCustomProviderProtocol,
  markModelFieldTyped,
  validateCustomProviderForm,
||||||| bc50ba56aa
  modelDiscoveryErrorSchema,
  modelDiscoveryResponseSchema,
  modelRowFromDiscovery,
  validateCustomProvider,
  type DiscoveredModel,
=======
  modelDiscoveryErrorSchema,
  modelDiscoveryResponseSchema,
  modelRowFromDiscovery,
  storedClientCertificateOf,
  validateCustomProvider,
  type ClientCertificateFields,
  type DiscoveredModel,
>>>>>>> upstream/main
  type CustomProviderFormState,
  type CustomProviderPersistPlan,
  type CustomProviderFieldErrors,
  type CustomProviderProtocol,
  type CustomProviderTranslator,
  type AutoFillNotice,
  type HeaderFieldErrors,
  type ModelAutoFillField,
  type ModelFieldErrors,
} from './custom-provider-form';
import { CustomProviderModelsDialog } from './CustomProviderModelsDialog';
import { CustomProviderModelRow } from './CustomProviderModelRow';
import { CanonicalApiError } from '@/api/canonicalClient';
import { problemMessage } from '@/lib/problemMessage';

<<<<<<< HEAD
interface CustomProviderFormProps {
  workspaceId: string;
  revision: string;
  initial?: ProviderConfigurationRead;
  initialIcon?: CustomProviderIcon | null;
||||||| bc50ba56aa
type CustomProviderFormProps = {
=======
const hasClientCertificate = (form: CustomProviderFormState | undefined): boolean => (
  Boolean(form?.tls && (form.tls.cert.trim() || form.tls.key.trim() || form.tls.passphrase.trim()))
);

type CustomProviderFormProps = {
>>>>>>> upstream/main
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
<<<<<<< HEAD
  const [discoveredModels, setDiscoveredModels] = React.useState<ProviderModelDiscoveryResult['models'] | null>(null);
  const [modelsDialogOpen, setModelsDialogOpen] = React.useState(false);
  const [autoFilling, setAutoFilling] = React.useState(false);
  // A fill that had to stop at the OMP catalog says so instead of reading as
  // a complete answer; a fill that wrote nothing says that too.
  const [autoFillNotice, setAutoFillNotice] = React.useState<AutoFillNotice | null>(null);
  // Ids no source could answer for, listed in the partial notice.
  const [unresolvedModelIds, setUnresolvedModelIds] = React.useState<string[]>([]);
  // Rows open for editing. A provider can carry dozens of imported models, so
  // saved and imported rows start collapsed; a row added by hand opens.
||||||| bc50ba56aa
  const [discoveredModels, setDiscoveredModels] = React.useState<DiscoveredModel[] | null>(null);
  // Rows open for editing. A provider can carry dozens of imported models, so
  // saved and imported rows start collapsed; a row added by hand opens.
=======
  const [discoveredModels, setDiscoveredModels] = React.useState<DiscoveredModel[] | null>(null);
>>>>>>> upstream/main
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(() => (
    new Set(initial ? [] : form.models.map((model) => model.row))
  ));
<<<<<<< HEAD
  const lifetime = React.useRef(true);
  React.useEffect(() => { lifetime.current = true; return () => { lifetime.current = false; }; }, []);

  const logoProviderId = form.providerId.trim() || 'custom';
||||||| bc50ba56aa
  const seededEditProviderIdRef = React.useRef<string | null>(null);
  const logoProviderId = form.providerID.trim() || 'custom';
=======
  const [certificateOpen, setCertificateOpen] = React.useState(() => hasClientCertificate(initialValues));
  const seededEditProviderIdRef = React.useRef<string | null>(null);
  const logoProviderId = form.providerID.trim() || 'custom';
>>>>>>> upstream/main
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
  // A long list of ids would bury the row; the count carries the rest through
  // the translated "and N more" sentence.
  const partialNoticeModels = formatAutoFillNoticeModels(
    unresolvedModelIds,
    (models, count) => t('settings.providers.page.custom.models.autofill.notice.moreModels', { models, count }),
  );

<<<<<<< HEAD
  const setField = (key: 'providerId' | 'name' | 'endpoint' | 'apiKey', value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (key === 'apiKey') return;
    setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
||||||| bc50ba56aa
  React.useEffect(() => {
    if (!initialValues) {
      return;
    }
    // Edit mode: seed once per provider id so parent re-renders (new object
    // identity for the same snapshot) do not wipe in-progress edits.
    if (isEdit && seededEditProviderIdRef.current === initialValues.providerID) {
      return;
    }
    seededEditProviderIdRef.current = isEdit ? initialValues.providerID : null;
    setForm(initialValues);
    setErr({});
    setModelErrors([]);
    setHeaderErrors([]);
    setExpandedRows(new Set());
    setDiscoveredModels(null);
  }, [initialValues, isEdit]);

  const setField = (key: keyof Pick<CustomProviderFormState, 'providerID' | 'name' | 'baseURL' | 'apiKey'>, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErr((prev) => ({ ...prev, [key]: undefined }));
=======
  React.useEffect(() => {
    if (!initialValues) {
      return;
    }
    if (isEdit && seededEditProviderIdRef.current === initialValues.providerID) {
      return;
    }
    seededEditProviderIdRef.current = isEdit ? initialValues.providerID : null;
    setForm(initialValues);
    setErr({});
    setModelErrors([]);
    setHeaderErrors([]);
    setExpandedRows(new Set());
    setCertificateOpen(hasClientCertificate(initialValues));
    setDiscoveredModels(null);
  }, [initialValues, isEdit]);

  const setField = (key: keyof Pick<CustomProviderFormState, 'providerID' | 'name' | 'baseURL' | 'apiKey'>, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErr((prev) => ({ ...prev, [key]: undefined }));
>>>>>>> upstream/main
  };

<<<<<<< HEAD
  const setProtocol = (protocol: CustomProviderProtocol) => {
    setForm((previous) => ({ ...previous, protocol }));
  };

  const setModel = (index: number, key: keyof ModelFieldErrors, value: string) => {
    setForm((previous) => ({
      ...previous,
      models: previous.models.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [key]: value } : row
||||||| bc50ba56aa
  const setModel = (index: number, key: ModelTextField, value: string) => {
    setForm((prev) => ({
      ...prev,
      models: prev.models.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [key]: value, metadataSource: 'manual' } : row
=======
  const setTls = (key: keyof ClientCertificateFields, value: string) => {
    setForm((prev) => ({ ...prev, tls: { ...(prev.tls ?? EMPTY_CLIENT_CERTIFICATE), [key]: value } }));
    setErr((prev) => ({ ...prev, tlsCert: undefined, tlsKey: undefined }));
  };

  const setModel = (index: number, key: ModelTextField, value: string) => {
    setForm((prev) => ({
      ...prev,
      models: prev.models.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [key]: value, metadataSource: 'manual' } : row
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
  const discoverModels = async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    try {
      const headers = Object.fromEntries(form.headers
        .map((header) => [header.key.trim(), header.value.trim()] as const)
        .filter(([key, value]) => key && value));
      const response = await runtimeFetch('/api/provider/discover-models', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerID: isEdit ? form.providerID : undefined,
          baseURL: form.baseURL,
          apiKey: form.apiKey,
          headers,
          enrich: true,
          metadataProviderID: form.providerID,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const parsed = modelDiscoveryResponseSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        throw new Error(modelDiscoveryErrorSchema.safeParse(payload).data?.error
          || t('settings.providers.page.custom.discovery.failed'));
      }
      setDiscoveredModels(parsed.data.models);
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : t('settings.providers.page.custom.discovery.failed'));
    } finally {
      setDiscovering(false);
    }
  };

  const addDiscoveredModels = (selected: DiscoveredModel[]) => {
    setForm((previous) => {
      const existing = new Set(previous.models.map((model) => model.id.trim()).filter(Boolean));
      const added = selected.filter((model) => !existing.has(model.id)).map(modelRowFromDiscovery);
      // The blank starter row of a new form gives way to the imported models.
      const kept = previous.models.filter((model) => model.id.trim() || model.name.trim());
      return { ...previous, models: [...kept, ...added] };
    });
    setModelErrors([]);
    setDiscoveredModels(null);
  };

=======
  const discoverModels = async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    try {
      const headers = Object.fromEntries(form.headers
        .map((header) => [header.key.trim(), header.value.trim()] as const)
        .filter(([key, value]) => key && value));
      const response = await runtimeFetch('/api/provider/discover-models', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerID: isEdit ? form.providerID : undefined,
          baseURL: form.baseURL,
          apiKey: form.apiKey,
          headers,
          tls: storedClientCertificateOf(form.tls),
          enrich: true,
          metadataProviderID: form.providerID,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const parsed = modelDiscoveryResponseSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        throw new Error(modelDiscoveryErrorSchema.safeParse(payload).data?.error
          || t('settings.providers.page.custom.discovery.failed'));
      }
      setDiscoveredModels(parsed.data.models);
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : t('settings.providers.page.custom.discovery.failed'));
    } finally {
      setDiscovering(false);
    }
  };

  const addDiscoveredModels = (selected: DiscoveredModel[]) => {
    setForm((previous) => {
      const existing = new Set(previous.models.map((model) => model.id.trim()).filter(Boolean));
      const added = selected.filter((model) => !existing.has(model.id)).map(modelRowFromDiscovery);
      const kept = previous.models.filter((model) => model.id.trim() || model.name.trim());
      return { ...previous, models: [...kept, ...added] };
    });
    setModelErrors([]);
    setDiscoveredModels(null);
  };

>>>>>>> upstream/main
  const toggleRow = (row: string) => setExpandedRows((previous) => {
    const next = new Set(previous);
    if (next.has(row)) next.delete(row);
    else next.add(row);
    return next;
  });

  /** The fill summary described the previous row set; a changed set retires it. */
  const clearAutoFillNotice = () => {
    setAutoFillNotice(null);
    setUnresolvedModelIds([]);
  };

  const discoverModels = async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    const runtime = getRuntimeKey();
    try {
      const result = await canonicalClient.discoverProviderModels(workspaceId, buildProviderDiscoveryRequest(form, isEdit));
      if (lifetime.current && runtime === getRuntimeKey()) {
        setDiscoveredModels(result.models);
        setModelsDialogOpen(true);
        // The reviewed list changed; an old fill summary no longer describes it.
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
      // Discovery may pad an id; the row and the dialog both carry it trimmed.
      const added = (discoveredModels ?? [])
        .map((model) => ({ ...model, modelId: model.modelId.trim() }))
        .filter((model) => wanted.has(model.modelId) && !existing.has(model.modelId))
        .map(createDiscoveredModelRow);
      // The blank starter row of a new form gives way to the imported models.
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
      // A provider keeps at least one editable row to fill in.
      return { ...previous, models: models.length > 0 ? models : [createModelRow()] };
    });
    setModelErrors([]);
    clearAutoFillNotice();
  };

  const markTyped = (index: number, field: ModelAutoFillField) => {
    setForm((previous) => ({
      ...previous,
      models: previous.models.map((row, rowIndex) => (rowIndex === index ? markModelFieldTyped(row, field) : row)),
    }));
  };

  /**
   * Fills the blanks from OMP's bundled catalog first, then asks the Host for
   * OpenRouter's view of the ids the catalog did not know. Only ids travel.
   * Enterprise policy or a failed request leaves the catalog-only result and
   * says so; a value the user typed is never replaced.
   */
  const autoFillModels = async () => {
    const ids = autoFillIds(form.models);
    if (ids.length === 0) return;
    setAutoFilling(true);
    setAutoFillNotice(null);
    setUnresolvedModelIds([]);
    const runtime = getRuntimeKey();
    const answers = new Map<string, ModelCatalogInfo>();
    const isCurrent = () => lifetime.current && runtime === getRuntimeKey();
    // A refusal or failure of the OpenRouter leg outlives the later summary:
    // the catalog-only result must never read as a complete one.
    let lookupNotice: 'enterprise' | 'failed' | null = null;
    // Each source has its own cap; ids beyond a cap were never asked about.
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
      // Applied to the rows the form holds now, so a field typed while the
      // requests ran is still skipped; the preview only feeds the notice.
      const preview = applyModelCatalogInfo(form.models, answers);
      setForm((previous) => ({ ...previous, models: applyModelCatalogInfo(previous.models, answers).models }));
      if (!isCurrent()) return;
      // Every id either source did not answer, including ids a cap kept out of
      // a request: those are exactly the rows whose limits stay empty.
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

<<<<<<< HEAD
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || discovering) return;
    setFormError(null);
    const validation = validateCustomProviderForm(form, existingProviderIDs, isEdit, t);
    setFieldErrors(validation.fields);
    setModelErrors(validation.models);
    setHeaderErrors(validation.headers);
    // A collapsed row would hide its own error.
||||||| bc50ba56aa
    const output = validateCustomProvider({
      form,
      t: ((key, vars) => t(key as Parameters<typeof t>[0], vars)) as CustomProviderTranslator,
      existingProviderIDs,
      disabledProviders,
      editingProviderID: isEdit ? form.providerID : undefined,
      allowExistingAuth: isEdit && allowExistingAuth,
    });
    setErr(output.err);
    setModelErrors(output.models);
    setHeaderErrors(output.headers);
    // A collapsed row would hide its own error.
=======
    const output = validateCustomProvider({
      form,
      t: ((key, vars) => t(key as Parameters<typeof t>[0], vars)) as CustomProviderTranslator,
      existingProviderIDs,
      disabledProviders,
      editingProviderID: isEdit ? form.providerID : undefined,
      allowExistingAuth: isEdit && allowExistingAuth,
    });
    setErr(output.err);
    setModelErrors(output.models);
    setHeaderErrors(output.headers);
    if (output.err.tlsCert || output.err.tlsKey) setCertificateOpen(true);
>>>>>>> upstream/main
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
    } catch (error) {
      setFormError(problemMessage(error, t('settings.providers.native.invalidConfiguration')));
      return;
    }
    try {
      await onSubmit(plan);
      if (lifetime.current) setForm((previous) => ({ ...previous, apiKey: '' }));
    } catch (error) {
      if (lifetime.current) setFormError(problemMessage(error, t('settings.providers.page.toast.customProviderSaveFailed')));
    }
  };

  return (
    <form onSubmit={submit}>
      <SettingsSection
        title={isEdit ? t('settings.providers.page.custom.editTitle') : t('settings.providers.page.custom.title')}
        settingsItem="providers.custom"
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.native.customDescription')}</p>

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
            value={form.protocol}
            onValueChange={(protocol) => {
              if (isCustomProviderProtocol(protocol)) {
                setProtocol(protocol);
              }
<<<<<<< HEAD
||||||| bc50ba56aa
              // Saved levels were spelled for the old protocol; rebuild them for the new one.
              setForm((prev) => ({
                ...prev,
                protocol,
                models: prev.models.map((row) => (row.savedVariants ? { ...row, savedVariants: {} } : row)),
              }));
=======
              setForm((prev) => ({
                ...prev,
                protocol,
                models: prev.models.map((row) => (row.savedVariants ? { ...row, savedVariants: {} } : row)),
              }));
>>>>>>> upstream/main
            }}
            disabled={busy}
          >
            <SelectTrigger aria-label={t('settings.providers.page.custom.field.protocol.label')} className={SETTINGS_WIDTH_SELECT_CLASS}>
              <SelectValue>{protocolLabel(form.protocol, t)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CUSTOM_PROVIDER_PROTOCOLS.map((protocol) => (
                <SelectItem key={protocol} value={protocol}>
                  {protocolLabel(protocol, t)}
                </SelectItem>
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
              placeholder={t('settings.providers.page.custom.field.name.placeholder')}
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
              placeholder={t('settings.providers.page.custom.field.baseURL.placeholder')}
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
              <p>
                {isEdit
                  ? t('settings.providers.page.custom.field.apiKey.editInfo')
                  : t('settings.providers.page.custom.field.apiKey.info')}
              </p>
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
              : t('settings.providers.page.custom.field.apiKey.placeholder')}
            autoComplete="new-password"
            inputSize="compact"
            className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'rounded-md px-3 font-mono text-xs')}
            aria-label={t('settings.providers.page.custom.field.apiKey.label')}
          />
        </SettingsFieldRow>
      </SettingsSection>

      <SettingsSection
        title={t('settings.providers.page.custom.models.title')}
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <div className={`${SETTINGS_WIDTH_LONG_TEXT_CLASS} flex flex-col gap-2`}>
          <div className="flex flex-wrap items-center gap-1.5">
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

        <div className={SETTINGS_WIDTH_LONG_TEXT_CLASS}>
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
              onUserEdit={(field) => markTyped(index, field)}
||||||| bc50ba56aa
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
=======
              onToggleCapability={(target, capability) => toggleCapability(index, target, capability)}
              onToolsChange={(tools) => setForm((previous) => ({
                ...previous,
                models: previous.models.map((entry, rowIndex) => rowIndex === index ? { ...entry, tools, capabilitiesKnown: true, metadataSource: 'manual' } : entry),
              }))}
              onImageGenerationChange={(imageGeneration) => setForm((previous) => ({
                ...previous,
                models: previous.models.map((entry, rowIndex) => rowIndex === index ? { ...entry, type: imageGeneration ? 'image' : 'chat' } : entry),
              }))}
>>>>>>> upstream/main
              onRemove={form.models.length > 1 ? () => {
                setForm((previous) => ({
                  ...previous,
                  models: previous.models.filter((_, rowIndex) => rowIndex !== index),
                }));
                setModelErrors((previous) => previous.filter((_, rowIndex) => rowIndex !== index));
                clearAutoFillNotice();
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
            clearAutoFillNotice();
          }}
        >
          {t('settings.providers.page.custom.models.add')}
        </Button>
      </SettingsSection>

      <SettingsSection
        title={t('settings.providers.page.custom.headers.title')}
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.page.custom.headers.description')}</p>
        {isEdit ? (
          <div className="flex flex-col gap-2">
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
              <div key={header.row} className={`${SETTINGS_WIDTH_LONG_TEXT_CLASS} flex flex-col gap-2`}>
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <label className={SETTINGS_FIELD_LABEL_CLASS}>
                        {t('settings.providers.page.custom.headers.keyLabel')}
                      </label>
                      <Input
                        value={header.name}
                        onChange={(event) => setHeader(index, 'name', event.target.value)}
                        disabled={busy}
                        placeholder={t('settings.providers.page.custom.headers.keyPlaceholder')}
                        className="h-7 rounded-md px-3 font-mono text-xs"
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
                        onChange={(event) => setHeader(index, 'value', event.target.value)}
                        disabled={busy}
                        placeholder={t('settings.providers.page.custom.headers.valuePlaceholder')}
                        autoComplete="new-password"
                        className="h-7 rounded-md px-3 font-mono text-xs"
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

<<<<<<< HEAD
      {formError ? <p className="py-3 typography-meta text-[var(--status-error)]" role="alert">{formError}</p> : null}

||||||| bc50ba56aa
=======
      <Collapsible open={certificateOpen} onOpenChange={setCertificateOpen}>
        <CollapsibleTrigger className="-mx-2 mt-8 w-auto justify-start gap-1.5">
          <span className={SETTINGS_SECTION_TITLE_CLASS}>{t('settings.providers.page.custom.tls.title')}</span>
          <Icon name={certificateOpen ? 'arrow-up-s' : 'arrow-down-s'} className="h-4 w-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className={`${SETTINGS_FIELDS_STACK_CLASS} pt-3`}>
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.page.custom.tls.description')}</p>
          <SettingsStackedField
            label={t('settings.providers.page.custom.tls.cert.label')}
            info={t('settings.providers.page.custom.tls.cert.info')}
          >
            <Input
              value={form.tls?.cert ?? ''}
              onChange={(event) => setTls('cert', event.target.value)}
              placeholder={t('settings.providers.page.custom.tls.cert.placeholder')}
              className="h-8 rounded-md px-3 font-mono text-xs"
              aria-invalid={Boolean(err.tlsCert)}
              aria-label={t('settings.providers.page.custom.tls.cert.label')}
            />
            {err.tlsCert ? <p className="mt-1 typography-meta text-[var(--status-error)]">{err.tlsCert}</p> : null}
          </SettingsStackedField>
          <SettingsStackedField
            label={t('settings.providers.page.custom.tls.key.label')}
            info={t('settings.providers.page.custom.tls.key.info')}
          >
            <Input
              value={form.tls?.key ?? ''}
              onChange={(event) => setTls('key', event.target.value)}
              placeholder={t('settings.providers.page.custom.tls.key.placeholder')}
              className="h-8 rounded-md px-3 font-mono text-xs"
              aria-invalid={Boolean(err.tlsKey)}
              aria-label={t('settings.providers.page.custom.tls.key.label')}
            />
            {err.tlsKey ? <p className="mt-1 typography-meta text-[var(--status-error)]">{err.tlsKey}</p> : null}
          </SettingsStackedField>
          <SettingsStackedField
            label={t('settings.providers.page.custom.tls.passphrase.label')}
            info={t('settings.providers.page.custom.tls.passphrase.info')}
          >
            <Input
              type="password"
              value={form.tls?.passphrase ?? ''}
              onChange={(event) => setTls('passphrase', event.target.value)}
              placeholder={t('settings.providers.page.custom.tls.passphrase.placeholder')}
              className="h-8 rounded-md px-3 font-mono text-xs"
              aria-label={t('settings.providers.page.custom.tls.passphrase.label')}
            />
          </SettingsStackedField>
        </CollapsibleContent>
      </Collapsible>

>>>>>>> upstream/main
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
