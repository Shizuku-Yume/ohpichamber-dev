import React from 'react';
import { useStore } from 'zustand';
import type {
  Model,
  Provider,
  ProviderAccounts as Accounts,
  ProviderAccountMutationRequest,
  ProviderConfigurationRead,
  ProviderOAuthMethods as Methods,
  ProviderMutationResult,
} from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { createProviderSettingsStore } from '@/stores/useProviderSettingsStore';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useUIStore } from '@/stores/useUIStore';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';
import { getRuntimeKey, subscribeRuntimeEndpointChanged, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { updateDesktopSettings } from '@/lib/persistence';
import { useI18n } from '@/lib/i18n';
import { formatCompactNumber } from '@/lib/numberFormat';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SettingsFieldRow,
  SettingsSection,
} from '@/components/sections/shared/SettingsSection';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import { SettingsBackButton } from '@/components/sections/shared/SettingsCards';
import { ClassificationProvidersPage } from '@/components/sections/classification/ClassificationProvidersPage';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { cn } from '@/lib/utils';
import { ProviderGrid } from './ProviderGrid';
import { ProviderConnectPicker } from './ProviderConnectPicker';
import { ProviderAccounts } from './ProviderAccounts';
import { ProviderApiKeyForm } from './ProviderApiKeyForm';
import { ProviderOAuthMethods } from './ProviderOAuthMethods';
import { CustomProviderForm } from './CustomProviderForm';
import { listConnectableProviders, listProvidersAcceptingKey } from './connectableProviders';
import {
  getProviderEnvironment,
  oauthMethodsForProvider,
  requiresProviderAuth,
  shouldAutoOpenAuthPanel,
} from './providerAuth';
import { CUSTOM_PROVIDER_ID, type CustomProviderPersistPlan } from './custom-provider-form';
import { problemMessage } from '@/lib/problemMessage';
import { ProviderLogoImageControl } from './ProviderLogoImageControl';
import { providerLogoUploadSupported, removeProviderLogo, uploadProviderLogo } from '@/lib/customProviderLogos';
import type { CustomProviderLogoPlan } from './custom-provider-form';

const ADD_PROVIDER_ID = '__add_provider__';
const CLASSIFICATION_PAGE_ID = '__classification__';

type Detail = { accounts: Accounts; configuration: ProviderConfigurationRead | null };

const formatTokens = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  if (value === 0) return '0';
  const formatted = formatCompactNumber(value);
  return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
};

<<<<<<< HEAD
interface ProviderDetailProps {
  workspaceId: string;
  revision: string;
  provider: Provider;
  models: Model[];
  methods: Methods | null;
  methodsFailed: boolean;
  existingIds: ReadonlySet<string>;
  enterprise: boolean;
  busy: boolean;
  initialEdit: boolean;
  /** The card asked for the key form, so it opens on arrival. */
  initialAddKey: boolean;
  authFailureHint: string | null;
  onRefresh: () => Promise<void>;
  onSave: (plan: CustomProviderPersistPlan) => Promise<void>;
  onClearAuthFailure: () => void;
  applyLogoPlan: (providerId: string, plan: CustomProviderLogoPlan) => Promise<void>;
  logoBusyId: string | null;
||||||| bc50ba56aa
// OpenCode owns the credential and announces the catalog change itself
// (`credential.updated` → catalog refresh); nothing to reload after it.
const connectIntegrationKey = async (request: IntegrationKeyRequest): Promise<void> => {
  await getIntegrationClient().integration.connect.key(request);
};

const ADD_PROVIDER_ID = '__add_provider__';
/** Not an OpenCode provider id: the page for OpenChamber's own classification providers (Jev). */
const CLASSIFICATION_PAGE_ID = '__classification__';

interface ProviderSourceInfo {
  exists: boolean;
  path?: string | null;
=======
const connectIntegrationKey = async (request: IntegrationKeyRequest): Promise<void> => {
  await getIntegrationClient().integration.connect.key(request);
};

const ADD_PROVIDER_ID = '__add_provider__';
const CLASSIFICATION_PAGE_ID = '__classification__';

interface ProviderSourceInfo {
  exists: boolean;
  path?: string | null;
>>>>>>> upstream/main
}

function ProviderDetail({
  workspaceId,
  revision,
  provider,
  models,
  methods,
  methodsFailed,
  existingIds,
  enterprise,
  busy,
  initialEdit,
  initialAddKey,
  authFailureHint,
  onRefresh,
  onSave,
  onClearAuthFailure,
  applyLogoPlan,
  logoBusyId,
}: ProviderDetailProps) {
  const { t } = useI18n();
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [editing, setEditing] = React.useState(initialEdit);
  const [query, setQuery] = React.useState('');
  const [showAuthPanel, setShowAuthPanel] = React.useState(initialAddKey);
  const [authPanelDismissed, setAuthPanelDismissed] = React.useState(false);
  const [accountBusyId, setAccountBusyId] = React.useState<string | null>(null);
  const [accountError, setAccountError] = React.useState<string | null>(null);
  const [disconnectBusy, setDisconnectBusy] = React.useState(false);
  const hiddenModels = useUIStore((state) => state.hiddenModels);
  const customProviderIcon = useUIStore((state) => state.customProviderIcons[provider.providerId]);
  const customProviderLogos = useUIStore((state) => state.customProviderLogos);
  const toggleHiddenModel = useUIStore((state) => state.toggleHiddenModel);
  const hideAllModels = useUIStore((state) => state.hideAllModels);
  const showAllModels = useUIStore((state) => state.showAllModels);
  const lifetime = React.useRef({ active: true, runtime: getRuntimeKey() });
  const current = () => lifetime.current.active && lifetime.current.runtime === getRuntimeKey();

  React.useEffect(() => {
    const owner = lifetime.current;
    owner.active = true;
    owner.runtime = getRuntimeKey();
    return () => { owner.active = false; };
  }, []);

  React.useEffect(() => {
    let active = true;
    const runtime = getRuntimeKey();
    setFailed(false);
    const configuration = canonicalClient.providerConfiguration(workspaceId, provider.providerId).catch((error) => {
      if (error instanceof CanonicalApiError && error.problem.code === 'PROVIDER_UNAVAILABLE') return null;
      throw error;
    });
    void Promise.all([
      canonicalClient.providerAccounts(workspaceId, provider.providerId),
      configuration,
    ]).then(([accounts, config]) => {
      if (active && runtime === getRuntimeKey()) setDetail({ accounts, configuration: config });
    }).catch(() => {
      if (active && runtime === getRuntimeKey()) setFailed(true);
    });
    return () => { active = false; };
  }, [workspaceId, provider.providerId, revision, retry]);

  const providerMethods = methods ? oauthMethodsForProvider(methods.methods, provider.providerId) : [];
  const accounts = detail?.accounts.accounts ?? [];
  const methodsLoading = methods === null && !methodsFailed;

  React.useEffect(() => {
    if (shouldAutoOpenAuthPanel({
      provider,
      userDismissed: authPanelDismissed,
      editingConfiguration: editing,
    })) {
      setShowAuthPanel(true);
    }
  }, [provider, authPanelDismissed, editing]);

  // A successful sign-in closes the panel before the catalog refresh lands;
  // keep it closed while the old "missing credential" snapshot is still here.
  React.useEffect(() => {
    if (provider.auth.status === 'configured' && authPanelDismissed) {
      setAuthPanelDismissed(false);
    }
  }, [provider.auth.status, authPanelDismissed]);

  const refreshAfterCredential = async () => {
    if (!current()) return;
    onClearAuthFailure();
    setShowAuthPanel(false);
    setAuthPanelDismissed(true);
    await onRefresh();
  };

  const mutateAccount = async (request: ProviderAccountMutationRequest) => {
    if (busy || disconnectBusy || accountBusyId !== null) return;
    const previous = detail?.accounts.accounts.find((account) => account.credentialRef === request.credentialRef);
    setAccountBusyId(request.credentialRef);
    setAccountError(null);
    try {
      const next = await canonicalClient.mutateProviderAccount(workspaceId, provider.providerId, request);
      if (!current()) return;
      setDetail((value) => value ? { ...value, accounts: next } : value);
      if (request.action === 'select') {
        toast.success(t('settings.providers.accounts.toast.switched', {
          account: previous?.label || previous?.email || previous?.accountId || request.credentialRef,
        }));
        await onRefresh();
      } else if (request.action === 'remove') {
        toast.success(t('settings.providers.accounts.toast.removed'));
        onClearAuthFailure();
        await onRefresh();
      }
    } catch (error) {
      if (current()) {
        setAccountError(problemMessage(error, t(request.action === 'label'
          ? 'settings.providers.accounts.toast.renameFailed'
          : request.action === 'select'
            ? 'settings.providers.accounts.toast.switchFailed'
            : 'settings.providers.accounts.toast.removeFailed')));
      }
    } finally {
      if (current()) setAccountBusyId(null);
    }
  };

  const disconnectCredentials = async () => {
    if (!detail || busy || disconnectBusy || accountBusyId !== null) return;
    setDisconnectBusy(true);
    const runtime = getRuntimeKey();
    try {
      let expectedRevision = detail.accounts.revision;
      for (const account of detail.accounts.accounts) {
        const result = await canonicalClient.deleteProviderCredential(workspaceId, provider.providerId, {
          expectedRevision,
          providerId: provider.providerId,
          credentialRef: account.credentialRef,
        });
        if (runtime !== getRuntimeKey()) return;
        expectedRevision = result.revision;
      }
      if (runtime !== getRuntimeKey()) return;
      toast.success(t('settings.providers.page.toast.providerDisconnected'));
      onClearAuthFailure();
      setShowAuthPanel(false);
      setAuthPanelDismissed(true);
      setEditing(false);
      await onRefresh();
    } catch (error) {
      if (runtime === getRuntimeKey()) {
        console.error('Failed to disconnect provider:', error);
        toast.error(problemMessage(error, t('settings.providers.page.toast.providerDisconnectFailed')));
        await onRefresh();
      }
    } finally {
      if (runtime === getRuntimeKey()) setDisconnectBusy(false);
    }
  };

  const writeApiKey = async (apiKey: string) => {
    await canonicalClient.writeProviderCredential(workspaceId, provider.providerId, {
      expectedRevision: revision,
      providerId: provider.providerId,
      credential: { method: 'api-key', apiKey },
    });
    await refreshAfterCredential();
  };

  if (failed) {
    return (
      <div className={SETTINGS_SPACE_ROW_CLASS}>
        <p role="alert" className="typography-meta text-[var(--status-error)]">
          {t('settings.providers.page.state.unableToLoadProviderList')}
        </p>
        <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
          {t('settings.providers.page.actions.tryAgain')}
        </Button>
      </div>
    );
  }
  if (!detail) {
    return <p role="status" className="typography-meta text-muted-foreground">{t('settings.providers.page.state.loading')}</p>;
  }
  if (editing && detail.configuration && !enterprise) {
    return (
      <CustomProviderForm
        key={`${provider.providerId}:${detail.configuration.revision}`}
        workspaceId={workspaceId}
        revision={revision}
        initial={detail.configuration}
        initialIcon={customProviderIcon ?? null}
        existingProviderIDs={existingIds}
        busy={busy || disconnectBusy}
        authFailureHint={authFailureHint}
        onCancel={() => setEditing(false)}
        onSubmit={async (plan) => {
          await onSave(plan);
          setEditing(false);
        }}
        onDisconnect={accounts.length > 0 ? () => void disconnectCredentials() : undefined}
      />
    );
  }

  const providerModels = models.filter((model) => model.provider === provider.providerId);
  const filteredModels = rankByQuery(providerModels, query, (model) => [model.name, model.modelId]);
  const hiddenModelIds = new Set(
    hiddenModels
      .filter((model) => model.providerID === provider.providerId)
      .map((model) => model.modelID),
  );
  const canConnect = !enterprise;
  const authStatusIncomplete = requiresProviderAuth(provider);
  const environment = getProviderEnvironment(provider);

  return (
    <>
      <SettingsSection
        title={t('settings.providers.accounts.title')}
        info={t('settings.providers.accounts.info')}
        divider={false}
        headerAction={(
          <div className="flex items-center gap-1">
            {detail.configuration && !enterprise ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  setAuthPanelDismissed(false);
                  setShowAuthPanel(false);
                  setEditing(true);
                }}
              >
                {t('settings.providers.page.actions.edit')}
              </Button>
            ) : null}
            {canConnect ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  const nextOpen = !showAuthPanel;
                  setShowAuthPanel(nextOpen);
                  setAuthPanelDismissed(!nextOpen);
                }}
              >
                {showAuthPanel ? (
                  t('settings.providers.page.actions.cancel')
                ) : (
                  <>
                    <Icon name="add" className="size-3.5" />
                    {accounts.length > 0
                      ? t('settings.providers.accounts.add')
                      : environment
                        ? t('settings.providers.page.actions.addKey')
                        : t('settings.providers.page.actions.connect')}
                  </>
                )}
              </Button>
            ) : null}
          </div>
        )}
        settingsItem="providers.auth"
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        {accounts.length > 0 ? (
          <ProviderAccounts
            roster={detail.accounts}
            busyId={accountBusyId}
            disabled={busy || disconnectBusy}
            onMutate={(request) => { void mutateAccount(request); }}
          />
        ) : !showAuthPanel && authStatusIncomplete ? (
          <div className="flex items-center gap-1.5 py-1.5">
            <Icon name="alert" className="size-4 shrink-0 text-[var(--status-warning)]" />
            <span className="typography-ui-label text-foreground">{t('settings.providers.page.auth.incomplete')}</span>
            {provider.authMethods.includes('api-key')
              ? <SettingsInfoHint>{t('settings.providers.page.auth.incompleteHint')}</SettingsInfoHint>
              : null}
          </div>
        ) : null}

        {environment ? (
          <SettingsFieldRow label={t('settings.providers.accounts.environment')}>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Icon name="terminal-box" className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate font-mono typography-ui-label text-foreground">
                {environment.variable ? `$${environment.variable}` : t('settings.providers.card.status.environment')}
              </span>
              <SettingsInfoHint>
                {environment.active
                  ? environment.variable
                    ? t('settings.providers.page.environment.using', { variable: environment.variable })
                    : t('settings.providers.page.environment.usingUnnamed')
                  : environment.variable
                    ? t('settings.providers.page.environment.overridden', { variable: environment.variable })
                    : t('settings.providers.page.environment.overriddenUnnamed')}
              </SettingsInfoHint>
            </span>
          </SettingsFieldRow>
        ) : null}

        {enterprise ? (
          <p className="typography-meta text-muted-foreground">{t('settings.providers.native.enterprise')}</p>
        ) : null}

        {!showAuthPanel || enterprise ? null : methodsLoading ? (
          <div className="py-1.5 typography-meta text-muted-foreground">
            {t('settings.providers.page.auth.loadingMethods')}
          </div>
        ) : (
          <div className={SETTINGS_SPACE_ROW_CLASS}>
            {provider.authMethods.includes('api-key') ? (
              <ProviderApiKeyForm
                key={provider.providerId}
                writeCanonicalKey={writeApiKey}
                disabled={busy || disconnectBusy}
              />
            ) : null}
            {providerMethods.length > 0 ? (
              <ProviderOAuthMethods
                key={`${provider.providerId}:${providerMethods.map((method) => method.methodId).join(',')}`}
                workspaceId={workspaceId}
                revision={revision}
                methods={providerMethods}
                disabled={busy || disconnectBusy}
                onConnected={refreshAfterCredential}
                className="border-t border-[var(--surface-subtle)] pt-2"
              />
            ) : null}
            {methodsFailed ? (
              <p role="alert" className="typography-meta text-[var(--status-error)]">
                {t('settings.providers.page.toast.authMethodsLoadFailed')}
              </p>
            ) : null}
          </div>
        )}

        {accountError ? <p role="alert" className="typography-meta text-[var(--status-error)]">{accountError}</p> : null}
        {authFailureHint ? <p role="status" className="typography-meta text-[var(--status-warning)]">{authFailureHint}</p> : null}
      </SettingsSection>

      {providerLogoUploadSupported() && (!detail?.configuration || enterprise) ? (
        <SettingsSection
          title={t('settings.providers.page.logo.title')}
          info={t('settings.providers.page.logo.info')}
          settingsItem="providers.logo"
        >
          <ProviderLogoImageControl
            preview={customProviderLogos[provider.providerId]
              ? <ProviderLogo providerId={provider.providerId} alt="" className="size-5" />
              : null}
            busy={logoBusyId === provider.providerId}
            onPick={(file) => void applyLogoPlan(provider.providerId, { kind: 'upload', file })}
            onRemove={() => void applyLogoPlan(provider.providerId, { kind: 'remove' })}
          />
        </SettingsSection>
      ) : null}

      {providerModels.length > 0 ? (
        <SettingsSection
          title={t('settings.providers.page.models.title')}
          titleAccessory={(
            <span className="typography-micro text-muted-foreground font-normal">({providerModels.length})</span>
          )}
          headerAction={(
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="xs"
                onClick={() => hideAllModels(provider.providerId, providerModels.map((model) => model.modelId))}
              >
                {t('settings.providers.page.actions.hideAll')}
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => showAllModels(provider.providerId)}
              >
                {t('settings.providers.page.actions.showAll')}
              </Button>
            </div>
          )}
          settingsItem="providers.models"
        >
          <div className="relative mb-2">
            <Icon name="search" className="absolute inset-s-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('settings.providers.page.models.filterPlaceholder')}
              className="h-7 w-full ps-8"
            />
          </div>

          {filteredModels.length === 0 ? (
            <p className="py-4 text-center typography-meta text-muted-foreground">
              {t('settings.providers.page.models.noModelsMatchFilter')}
            </p>
          ) : (
            <div className="divide-y divide-[var(--surface-subtle)]">
              {filteredModels.map((model) => {
                const isHidden = hiddenModelIds.has(model.modelId);
                const contextTokens = formatTokens(model.contextWindow);
                const outputTokens = formatTokens(model.maxOutputTokens);
                const tokenSummary = [
                  contextTokens ? `${contextTokens} ${t('settings.providers.page.models.tokenBadge.context')}` : null,
                  outputTokens ? `${outputTokens} ${t('settings.providers.page.models.tokenBadge.output')}` : null,
                ].filter(Boolean).join(' · ');
                const capabilities: Array<{ key: string; icon: IconName; label: string }> = [];
                if (model.toolsSupported) capabilities.push({ key: 'tools', icon: 'tools', label: t('settings.providers.page.models.capability.toolCalling') });
                if (model.reasoningEffortSupported) capabilities.push({ key: 'reasoning', icon: 'brain-ai-3', label: t('settings.providers.page.models.capability.reasoning') });
                if (model.modalities.includes('image')) capabilities.push({ key: 'image', icon: 'file-image', label: t('settings.providers.page.models.capability.imageInput') });

                return (
                  <div key={model.modelId} className="py-1.5">
                    <div className={cn('flex items-center gap-3', isHidden && 'opacity-50')}>
                      <span className="min-w-0 flex-1 truncate typography-meta font-medium text-foreground">
                        {model.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        {tokenSummary || capabilities.length > 0 ? (
                          <SettingsInfoHint className="@xl:hidden inline-flex size-6">
                            <div className="space-y-1.5">
                              {tokenSummary ? <div className="font-medium">{tokenSummary}</div> : null}
                              {capabilities.map(({ key, icon, label }) => (
                                <div key={key} className="flex items-center gap-1.5">
                                  <Icon name={icon} className="size-3.5" />
                                  {label}
                                </div>
                              ))}
                            </div>
                          </SettingsInfoHint>
                        ) : null}
                        <div className="hidden shrink-0 items-center gap-2 @xl:flex">
                          {tokenSummary ? (
                            <span className="shrink-0 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 typography-micro text-muted-foreground">
                              {tokenSummary}
                            </span>
                          ) : null}
                          {capabilities.length > 0 ? (
                            <div className="flex shrink-0 items-center gap-1">
                              {capabilities.map(({ key, icon, label }) => (
                                <span
                                  key={key}
                                  className="flex size-5 items-center justify-center rounded bg-[var(--surface-muted)] text-muted-foreground"
                                  title={label}
                                  aria-label={label}
                                >
                                  <Icon name={icon} className="size-3" />
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={SETTINGS_ICON_BUTTON_CLASS}
                          onClick={() => toggleHiddenModel(provider.providerId, model.modelId)}
                          title={isHidden
                            ? t('settings.providers.page.models.actions.showModelInSelectors')
                            : t('settings.providers.page.models.actions.hideModelFromSelectors')}
                          aria-label={isHidden
                            ? t('settings.providers.page.models.actions.showModel')
                            : t('settings.providers.page.models.actions.hideModel')}
                        >
                          {isHidden
                            ? <Icon name="eye-off" className="size-3.5" />
                            : <Icon name="eye" className="size-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SettingsSection>
      ) : null}
    </>
  );
}

export const ProvidersPage: React.FC = () => {
  const { t } = useI18n();
<<<<<<< HEAD
  const directory = useSettingsDirectory();
  const enterprise = useEnterpriseMode();
  const [store] = React.useState(() => createProviderSettingsStore());
  const state = useStore(store);
  const [selected, setSelected] = React.useState('');
  const [candidate, setCandidate] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [partialProvider, setPartialProvider] = React.useState<string | null>(null);
  /** Set when a grid card asked for its key form, so the detail opens on it. */
  const [addKeyFor, setAddKeyFor] = React.useState<string | null>(null);
  const [methods, setMethods] = React.useState<Methods | null>(null);
  const [methodsFailed, setMethodsFailed] = React.useState(false);
  const connectRequested = useUIStore((value) => value.settingsProvidersConnectRequested);
  const openRequested = useUIStore((value) => value.settingsProvidersOpenRequested);
  const classificationRequested = useUIStore((value) => value.settingsProvidersClassificationRequested);

  const current = state.directory === directory && state.runtimeKey === getRuntimeKey();

  React.useEffect(() => {
    store.getState().reset();
    setSelected('');
    setCandidate('');
    setPartialProvider(null);
    setAddKeyFor(null);
    setMethods(null);
    setMethodsFailed(false);
    if (directory) void store.getState().load(directory);
    const before = subscribeRuntimeEndpointWillChange(() => {
      store.getState().reset();
      setSelected('');
      setCandidate('');
      setPartialProvider(null);
      setAddKeyFor(null);
      setMethods(null);
      setMethodsFailed(false);
      setBusy(false);
    });
    const after = subscribeRuntimeEndpointChanged(() => {
      if (directory) void store.getState().load(directory);
    });
    return () => {
      before();
      after();
      store.getState().reset();
    };
  }, [directory, store]);

||||||| bc50ba56aa
  const { isMobile } = useDeviceInfo();
  // Settings browses whichever project its own selector points at; the app
  // stays where it is.
  const settingsDirectory = useSettingsDirectory();
  const chatProviders = useConfigStore((state) => selectProvidersForDirectory(state, settingsDirectory));
  const settingsOnlyProviders = useConfigStore((state) => selectSettingsOnlyProvidersForDirectory(state, settingsDirectory));
  // Which provider the page shows is its own state. The config store's
  // selectedProviderId belongs to the chat's model selection; sharing it made
  // Settings open on the chat's provider and marked the chat selection manual.
  const connectRequested = useUIStore((state) => state.settingsProvidersConnectRequested);
  const setConnectRequested = useUIStore((state) => state.setSettingsProvidersConnectRequested);
  const classificationRequested = useUIStore((state) => state.settingsProvidersClassificationRequested);
  const setClassificationRequested = useUIStore((state) => state.setSettingsProvidersClassificationRequested);
  const openRequested = useUIStore((state) => state.settingsProvidersOpenRequested);
  const setOpenRequested = useUIStore((state) => state.setSettingsProvidersOpenRequested);
  const [selectedProviderId, setSelectedProvider] = React.useState(() => (
    connectRequested ? ADD_PROVIDER_ID : classificationRequested ? CLASSIFICATION_PAGE_ID : openRequested ?? ''
  ));
=======
  const { isMobile } = useDeviceInfo();
  const settingsDirectory = useSettingsDirectory();
  const chatProviders = useConfigStore((state) => selectProvidersForDirectory(state, settingsDirectory));
  const settingsOnlyProviders = useConfigStore((state) => selectSettingsOnlyProvidersForDirectory(state, settingsDirectory));
  const connectRequested = useUIStore((state) => state.settingsProvidersConnectRequested);
  const setConnectRequested = useUIStore((state) => state.setSettingsProvidersConnectRequested);
  const classificationRequested = useUIStore((state) => state.settingsProvidersClassificationRequested);
  const setClassificationRequested = useUIStore((state) => state.setSettingsProvidersClassificationRequested);
  const openRequested = useUIStore((state) => state.settingsProvidersOpenRequested);
  const setOpenRequested = useUIStore((state) => state.setSettingsProvidersOpenRequested);
  const [selectedProviderId, setSelectedProvider] = React.useState(() => (
    connectRequested ? ADD_PROVIDER_ID : classificationRequested ? CLASSIFICATION_PAGE_ID : openRequested ?? ''
  ));
>>>>>>> upstream/main
  React.useEffect(() => {
    if (!connectRequested) return;
    if (current) {
      setCandidate('');
      setSelected(enterprise ? '' : ADD_PROVIDER_ID);
      useUIStore.getState().setSettingsProvidersConnectRequested(false);
    }
  }, [connectRequested, current, enterprise]);

<<<<<<< HEAD
||||||| bc50ba56aa
  // The app only loads providers for the project it is on; Settings has to ask
  // for the one it is looking at. Without a project that is the app's own.
  const loadProviders = useConfigStore((state) => state.loadProviders);
=======
  const loadProviders = useConfigStore((state) => state.loadProviders);
  const catalogReloadRevision = useConfigStore((state) => state.catalogReloadRevision);
>>>>>>> upstream/main
  React.useEffect(() => {
<<<<<<< HEAD
    if (!classificationRequested || !current) return;
    setCandidate('');
    setSelected(CLASSIFICATION_PAGE_ID);
    useUIStore.getState().setSettingsProvidersClassificationRequested(false);
  }, [classificationRequested, current]);
||||||| bc50ba56aa
    void loadProviders({ directory: settingsDirectory, source: 'settings:providers' });
  }, [loadProviders, settingsDirectory]);
=======
    void loadProviders({ directory: settingsDirectory, source: 'settings:providers' });
  }, [catalogReloadRevision, loadProviders, settingsDirectory]);
>>>>>>> upstream/main

<<<<<<< HEAD
||||||| bc50ba56aa
  // Starts from the list read earlier in this app session (prefetched at
  // startup or from the last visit), then reads it again below.
  const [catalog, setCatalog] = React.useState<IntegrationCatalog | null>(() => peekIntegrationCatalog());
  const [integrationsLoadFailed, setIntegrationsLoadFailed] = React.useState(false);
  const integrations = catalog?.integrations ?? null;
  // A provider with no model at all gets a card only while it holds a stored
  // login: without one there is nothing on its page to act on. Joined so a
  // re-read of the integrations that changes no card keeps the same array.
  const storedLoginIds = settingsOnlyProviders
    .filter((provider) => providerHoldsStoredLogin(integrations, provider))
    .map((provider) => provider.id)
    .join('\n');
  const providers = React.useMemo(() => {
    const loginIds = new Set(storedLoginIds.split('\n'));
    const manageable = settingsOnlyProviders.filter(
      (provider) => provider.models.length > 0 || loginIds.has(provider.id),
    );
    return manageable.length > 0 ? [...chatProviders, ...manageable] : chatProviders;
  }, [chatProviders, settingsOnlyProviders, storedLoginIds]);
  // Null until read, and where the runtime has no OpenChamber server (VS Code).
  const [disabledProviders, setDisabledProviders] = React.useState<string[] | null>(null);
=======
  const [catalog, setCatalog] = React.useState<IntegrationCatalog | null>(() => peekIntegrationCatalog());
  const [integrationsLoadFailed, setIntegrationsLoadFailed] = React.useState(false);
  const integrations = catalog?.integrations ?? null;
  const storedLoginIds = settingsOnlyProviders
    .filter((provider) => providerHoldsStoredLogin(integrations, provider))
    .map((provider) => provider.id)
    .join('\n');
  const providers = React.useMemo(() => {
    const loginIds = new Set(storedLoginIds.split('\n'));
    const manageable = settingsOnlyProviders.filter(
      (provider) => provider.models.length > 0 || loginIds.has(provider.id),
    );
    return manageable.length > 0 ? [...chatProviders, ...manageable] : chatProviders;
  }, [chatProviders, settingsOnlyProviders, storedLoginIds]);
  const [disabledProviders, setDisabledProviders] = React.useState<string[] | null>(null);
>>>>>>> upstream/main
  React.useEffect(() => {
    if (!openRequested || !current) return;
    setCandidate('');
    setSelected(openRequested);
    useUIStore.getState().setSettingsProvidersOpenRequested(null);
  }, [openRequested, current]);

  React.useEffect(() => {
    if (!enterprise) return;
    setSelected((value) => value === ADD_PROVIDER_ID ? '' : value);
    setCandidate('');
    setPartialProvider(null);
    setAddKeyFor(null);
  }, [enterprise]);

  React.useEffect(() => {
    if (!state.workspaceId || !current) {
      setMethods(null);
      return;
    }
    let active = true;
<<<<<<< HEAD
    const runtime = getRuntimeKey();
    const workspaceId = state.workspaceId;
    canonicalClient.providerOAuthMethods(workspaceId)
      .then((next) => {
        if (!active || runtime !== getRuntimeKey()) return;
        setMethods(next);
        setMethodsFailed(false);
      })
      .catch((error) => {
        if (!active || runtime !== getRuntimeKey()) return;
        console.error('Failed to load provider OAuth methods:', error);
        setMethodsFailed(true);
||||||| bc50ba56aa
    fetchDisabledProviders()
      .then((list) => { if (active) setDisabledProviders(list); })
      .catch((error) => { console.warn('[providers] could not read disabled providers:', error); });
    return () => { active = false; };
  }, []);
  const handleProviderDisabled = React.useCallback(async (providerId: string, disabled: boolean) => {
    try {
      setDisabledProviders(await setProviderDisabledRequest(providerId, disabled));
      if (disabled) setSelectedProvider('');
      toast.success(disabled
        ? t('settings.providers.disabled.toast.disabled', { provider: providerId })
        : t('settings.providers.disabled.toast.enabled', { provider: providerId }));
      void loadProviders({ directory: settingsDirectory, source: 'settings:providers', fresh: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadProviders, setSelectedProvider, settingsDirectory, t]);
  // Only the first read blocks the credential forms; a re-read keeps showing
  // the methods already known.
  const authLoading = catalog === null && !integrationsLoadFailed;
  const [authBusyKey, setAuthBusyKey] = React.useState<string | null>(null);
  const [accountBusyId, setAccountBusyId] = React.useState<string | null>(null);
  const [modelQuery, setModelQuery] = React.useState('');
  const [candidateProviderId, setCandidateProviderId] = React.useState('');
  const [providerSources, setProviderSources] = React.useState<Record<string, ProviderSources>>({});
  // The config-file entry per provider; the edit form starts from it, not from
  // the live provider (which lacks `env` and carries generated reasoning levels).
  const [storedProviderConfigs, setStoredProviderConfigs] = React.useState<Record<string, StoredProviderEntry | null>>({});
  // Bumped after auth writes so the source snapshot is refetched even when the
  // selected provider id is unchanged (OAuth/API key success path).
  const [providerSourcesRevision, setProviderSourcesRevision] = React.useState(0);
  // Bumped after a credential write so the integration snapshot (which owns the
  // "connected" signal in v2) is refetched even when the selection is unchanged.
  const [integrationsRevision, setIntegrationsRevision] = React.useState(0);
  const backgroundIntegrationsReadRef = React.useRef(false);
  // An administrator turned on enterprise mode: providers come from the
  // OpenCode config, and the server refuses new ones and new keys.
  const enterpriseLocked = useEnterpriseMode();
  const [editingCustomProviderId, setEditingCustomProviderId] = React.useState<string | null>(null);
  const [editingCustomFormInitial, setEditingCustomFormInitial] = React.useState<CustomProviderFormState | null>(null);
  const [editingCustomScope, setEditingCustomScope] = React.useState<ProviderConfigScope | null>(null);
  const [customAuthFailureHint, setCustomAuthFailureHint] = React.useState<string | null>(null);
  const [lastCustomPersistId, setLastCustomPersistId] = React.useState<string | null>(null);
  const isAddMode = selectedProviderId === ADD_PROVIDER_ID;
  const isCustomCreateMode = isAddMode && candidateProviderId === CUSTOM_PROVIDER_ID;
  const isCustomEditMode = Boolean(
    editingCustomProviderId
    && selectedProviderId
    && editingCustomProviderId === selectedProviderId
    && !isAddMode,
  );

  React.useEffect(() => {
    // Auth methods drive which credential UI to show (API key vs OAuth). Keep
    // them loaded for the active provider view so OAuth-only plugins never fall
    // back to an API key form merely because methods were never fetched, and so
    // an already-listed provider can still offer re-authentication. The card
    // grid reads the same list for each provider's status, and the connect
    // page derives what can still be connected from it.
    let isMounted = true;
    // A re-read nobody asked for keeps the list on screen quietly when it fails.
    const background = backgroundIntegrationsReadRef.current;
    backgroundIntegrationsReadRef.current = false;

    const loadIntegrations = async () => {
      try {
        const next = await loadIntegrationCatalog();
        if (!isMounted) return;
        setCatalog(next);
        setIntegrationsLoadFailed(false);
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load provider integrations:', error);
        if (background) return;
        // A list already on screen stays; only a page with none says it failed.
        setIntegrationsLoadFailed(true);
=======
    fetchDisabledProviders()
      .then((list) => { if (active) setDisabledProviders(list); })
      .catch((error) => { console.warn('[providers] could not read disabled providers:', error); });
    return () => { active = false; };
  }, []);
  const handleProviderDisabled = React.useCallback(async (providerId: string, disabled: boolean) => {
    try {
      setDisabledProviders(await setProviderDisabledRequest(providerId, disabled));
      if (disabled) setSelectedProvider('');
      toast.success(disabled
        ? t('settings.providers.disabled.toast.disabled', { provider: providerId })
        : t('settings.providers.disabled.toast.enabled', { provider: providerId }));
      void loadProviders({ directory: settingsDirectory, source: 'settings:providers', fresh: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadProviders, setSelectedProvider, settingsDirectory, t]);
  const authLoading = catalog === null && !integrationsLoadFailed;
  const [authBusyKey, setAuthBusyKey] = React.useState<string | null>(null);
  const [accountBusyId, setAccountBusyId] = React.useState<string | null>(null);
  const [modelQuery, setModelQuery] = React.useState('');
  const [candidateProviderId, setCandidateProviderId] = React.useState('');
  const [providerSources, setProviderSources] = React.useState<Record<string, ProviderSources>>({});
  const [storedProviderConfigs, setStoredProviderConfigs] = React.useState<Record<string, StoredProviderEntry | null>>({});
  const [providerSourcesRevision, setProviderSourcesRevision] = React.useState(0);
  const [integrationsRevision, setIntegrationsRevision] = React.useState(0);
  const backgroundIntegrationsReadRef = React.useRef(false);
  const enterpriseLocked = useEnterpriseMode();
  const [editingCustomProviderId, setEditingCustomProviderId] = React.useState<string | null>(null);
  const [editingCustomFormInitial, setEditingCustomFormInitial] = React.useState<CustomProviderFormState | null>(null);
  const [editingCustomScope, setEditingCustomScope] = React.useState<ProviderConfigScope | null>(null);
  const [customAuthFailureHint, setCustomAuthFailureHint] = React.useState<string | null>(null);
  const [lastCustomPersistId, setLastCustomPersistId] = React.useState<string | null>(null);
  const isAddMode = selectedProviderId === ADD_PROVIDER_ID;
  const isCustomCreateMode = isAddMode && candidateProviderId === CUSTOM_PROVIDER_ID;
  const isCustomEditMode = Boolean(
    editingCustomProviderId
    && selectedProviderId
    && editingCustomProviderId === selectedProviderId
    && !isAddMode,
  );

  React.useEffect(() => {
    let isMounted = true;
    const background = backgroundIntegrationsReadRef.current;
    backgroundIntegrationsReadRef.current = false;

    const loadIntegrations = async () => {
      try {
        const next = await loadIntegrationCatalog();
        if (!isMounted) return;
        setCatalog(next);
        setIntegrationsLoadFailed(false);
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load provider integrations:', error);
        if (background) return;
        setIntegrationsLoadFailed(true);
>>>>>>> upstream/main
        toast.error(t('settings.providers.page.toast.authMethodsLoadFailed'));
      });
    return () => { active = false; };
  }, [state.workspaceId, state.runtimeKey, current, t]);

  const rawProviders = state.providers?.providers;
  const rawModels = state.models?.models;
  const providers = rawProviders ?? [];
  const models = rawModels ?? [];
  const connectedProviders = React.useMemo(() => {
    const list = rawProviders ?? [];
    const executableProviders = new Set((rawModels ?? []).map((m) => m.provider));
    return list.filter(
      (p) => p.auth.status === 'configured' || executableProviders.has(p.providerId),
    );
  }, [rawProviders, rawModels]);
  const provider = providers.find((entry) => entry.providerId === selected);
  const existingIds = new Set(providers.map((entry) => entry.providerId));
  const connectable = state.providers ? listConnectableProviders(providers) : null;
  const keyProviders = new Set(listProvidersAcceptingKey(providers).map((entry) => entry.id));
  const connectListFailed = !state.providers && Boolean(state.error);

  const backToGrid = () => {
    setCandidate('');
    setSelected('');
    setPartialProvider(null);
    setAddKeyFor(null);
  };

<<<<<<< HEAD
  const openProvider = (providerId: string) => {
    setAddKeyFor(null);
    if (providers.some((entry) => entry.providerId === providerId)) {
      setCandidate('');
      setSelected(providerId);
||||||| bc50ba56aa
  // An account switch made outside this page (after a usage limit, by another
  // client, in OpenCode's TUI) moves the Active mark too.
  React.useEffect(
    () => subscribeCredentialChanges(() => {
      backgroundIntegrationsReadRef.current = true;
      setIntegrationsRevision((revision) => revision + 1);
    }),
    [],
  );

  const connectedProviderIds = React.useMemo(
    () => new Set(providers.map((provider) => provider.id)),
    [providers]
  );

  const unconnectedProviders = React.useMemo(
    () => (catalog ? listConnectableProviders(catalog, connectedProviderIds) : null),
    [catalog, connectedProviderIds]
  );

  React.useEffect(() => {
    // A candidate requested from Classification providers arrives before the
    // list does; judge it only once there is a list to judge it against.
    if (selectedProviderId !== ADD_PROVIDER_ID || !unconnectedProviders || unconnectedProviders.length === 0) {
=======
  React.useEffect(
    () => subscribeCredentialChanges(() => {
      backgroundIntegrationsReadRef.current = true;
      setIntegrationsRevision((revision) => revision + 1);
    }),
    [],
  );

  const connectedProviderIds = React.useMemo(
    () => new Set(providers.map((provider) => provider.id)),
    [providers]
  );

  const unconnectedProviders = React.useMemo(
    () => (catalog ? listConnectableProviders(catalog, connectedProviderIds) : null),
    [catalog, connectedProviderIds]
  );

  React.useEffect(() => {
    if (selectedProviderId !== ADD_PROVIDER_ID || !unconnectedProviders || unconnectedProviders.length === 0) {
>>>>>>> upstream/main
      return;
    }
    setCandidate(providerId);
    setSelected(ADD_PROVIDER_ID);
  };

  const requestProviderKey = (providerId: string) => {
    if (enterprise) return;
    setAddKeyFor(providerId);
    setCandidate('');
    setSelected(providerId);
  };

  const saveCustomProvider = async (plan: CustomProviderPersistPlan) => {
    if (!state.workspaceId || !current || enterprise || busy) throw new Error('Provider settings are not writable');
    const workspaceId = state.workspaceId;
    const runtime = getRuntimeKey();
    const providerId = plan.request.configuration.providerId;
    setBusy(true);
    try {
      let result: ProviderMutationResult;
      try {
<<<<<<< HEAD
        result = await canonicalClient.configureProvider(workspaceId, providerId, plan.request);
||||||| bc50ba56aa
        // OpenChamber-only metadata endpoint: the SDK exposes provider data but
        // not local auth/source-file provenance used by this settings UI.
        const query = settingsDirectory ? `?directory=${encodeURIComponent(settingsDirectory)}` : '';
        const response = await runtimeFetch(`/api/provider/${encodeURIComponent(selectedProviderId)}/source${query}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || t('settings.providers.page.toast.providerSourcesLoadFailed'));
        }

        const sources = (payload?.sources ?? payload?.data?.sources) as ProviderSources | undefined;
        if (!cancelled && sources) {
          setProviderSources((prev) => ({
            ...prev,
            [selectedProviderId]: sources,
          }));
          setStoredProviderConfigs((prev) => ({
            ...prev,
            // A missing or malformed entry falls back to live data in the form.
            [selectedProviderId]: storedProviderEntrySchema.safeParse(payload?.config ?? payload?.data?.config).data ?? null,
          }));
        }
=======
        const query = settingsDirectory ? `?directory=${encodeURIComponent(settingsDirectory)}` : '';
        const response = await runtimeFetch(`/api/provider/${encodeURIComponent(selectedProviderId)}/source${query}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || t('settings.providers.page.toast.providerSourcesLoadFailed'));
        }

        const sources = (payload?.sources ?? payload?.data?.sources) as ProviderSources | undefined;
        if (!cancelled && sources) {
          setProviderSources((prev) => ({
            ...prev,
            [selectedProviderId]: sources,
          }));
          setStoredProviderConfigs((prev) => ({
            ...prev,
            [selectedProviderId]: storedProviderEntrySchema.safeParse(payload?.config ?? payload?.data?.config).data ?? null,
          }));
        }
>>>>>>> upstream/main
      } catch (error) {
        toast.error(error instanceof Error && error.message
          ? error.message
          : t('settings.providers.page.toast.customProviderSaveFailed'));
        throw error;
      }
      if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;

      let keyFailed = false;
      if (plan.apiKey) {
        try {
          await canonicalClient.writeProviderCredential(workspaceId, result.providerId, {
            expectedRevision: result.revision,
            providerId: result.providerId,
            credential: { method: 'api-key', apiKey: plan.apiKey },
          });
        } catch {
          keyFailed = true;
        }
      }

      const previousIcon = useUIStore.getState().customProviderIcons[result.providerId];
      if (previousIcon !== (plan.icon ?? undefined)) {
        try {
          const nextIcons = { ...useUIStore.getState().customProviderIcons };
          if (plan.icon) nextIcons[result.providerId] = plan.icon;
          else delete nextIcons[result.providerId];
          await updateDesktopSettings({ customProviderIcons: nextIcons });
          useUIStore.getState().setCustomProviderIcon(result.providerId, plan.icon);
        } catch (error) {
          // The provider and its credential are already saved; the icon is cosmetic.
          console.warn('[providers] could not save the provider icon:', error);
        }
      }
      await applyLogoPlan(result.providerId, plan.logo);

<<<<<<< HEAD
      if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;
      setPartialProvider(keyFailed ? result.providerId : null);
      setCandidate('');
      await store.getState().refresh();
      if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;
      setSelected(result.providerId);
      if (keyFailed) toast.error(t('settings.providers.page.custom.authFailure.keyAfterConfig'));
      else toast.success(t('settings.providers.page.toast.customProviderSaved', { provider: plan.request.configuration.name }));
    } finally {
      if (runtime === getRuntimeKey()) setBusy(false);
    }
  };
||||||| bc50ba56aa
    return () => {
      cancelled = true;
    };
  }, [selectedProviderId, providerSourcesRevision, settingsDirectory, t]);

  const refreshProviderSources = React.useCallback(() => {
    setProviderSourcesRevision((revision) => revision + 1);
  }, []);

  const refreshIntegrations = React.useCallback(() => {
    setIntegrationsRevision((revision) => revision + 1);
  }, []);

  const markAuthWriteSucceeded = React.useCallback((providerId: string) => {
    // Optimistically record a connection so a providers refresh that has not yet
    // landed cannot reopen the panel / hide models with a stale
    // "Credentials missing" summary before the integration refetch arrives.
    setCatalog((prev) => prev && {
      ...prev,
      integrations: prev.integrations.map((integration) => (
        integration.id === providerId && integration.connections.length === 0
          ? { ...integration, connections: [{ type: 'credential', id: `pending:${providerId}`, label: providerId, method: 'key' }] }
          : integration
      )),
    });
    setCandidateProviderId('');
    setSelectedProvider(providerId);
    refreshProviderSources();
    refreshIntegrations();
  }, [refreshIntegrations, refreshProviderSources, setSelectedProvider]);

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedSources = selectedProviderId ? providerSources[selectedProviderId] : undefined;
=======
    return () => {
      cancelled = true;
    };
  }, [selectedProviderId, providerSourcesRevision, settingsDirectory, t]);

  const refreshProviderSources = React.useCallback(() => {
    setProviderSourcesRevision((revision) => revision + 1);
  }, []);

  const refreshIntegrations = React.useCallback(() => {
    setIntegrationsRevision((revision) => revision + 1);
  }, []);

  const markAuthWriteSucceeded = React.useCallback((providerId: string) => {
    setCatalog((prev) => prev && {
      ...prev,
      integrations: prev.integrations.map((integration) => (
        integration.id === providerId && integration.connections.length === 0
          ? { ...integration, connections: [{ type: 'credential', id: `pending:${providerId}`, label: providerId, method: 'key' }] }
          : integration
      )),
    });
    setCandidateProviderId('');
    setSelectedProvider(providerId);
    refreshProviderSources();
    refreshIntegrations();
  }, [refreshIntegrations, refreshProviderSources, setSelectedProvider]);

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedSources = selectedProviderId ? providerSources[selectedProviderId] : undefined;
>>>>>>> upstream/main

  const [logoBusyId, setLogoBusyId] = React.useState<string | null>(null);
  const applyLogoPlan = async (providerId: string, logoPlan: CustomProviderLogoPlan) => {
    if (logoPlan.kind === 'keep' || !providerLogoUploadSupported()) return;
    if (logoPlan.kind === 'remove' && !useUIStore.getState().customProviderLogos[providerId]) return;
    setLogoBusyId(providerId);
    try {
      if (logoPlan.kind === 'upload') {
        useUIStore.getState().setCustomProviderLogo(providerId, await uploadProviderLogo(providerId, logoPlan.file));
      } else {
        await removeProviderLogo(providerId);
        useUIStore.getState().setCustomProviderLogo(providerId, null);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      toast.error(logoPlan.kind === 'upload'
        ? t('settings.providers.page.logo.toast.uploadFailed', { reason })
        : t('settings.providers.page.logo.toast.removeFailed', { reason }));
    } finally {
      setLogoBusyId(null);
    }
  };

<<<<<<< HEAD
  const markAuthWriteSucceeded = async (providerId: string) => {
    const runtime = getRuntimeKey();
    const workspaceId = store.getState().workspaceId;
    setPartialProvider(null);
    setCandidate('');
    await store.getState().refresh();
    if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;
    setSelected(providerId);
||||||| bc50ba56aa
  const handleSaveCustomProvider = async (plan: CustomProviderPersistPlan) => {
    const busyKey = `custom:${plan.providerID}`;
    setAuthBusyKey(busyKey);
    setLastCustomPersistId(plan.providerID);
    setCustomAuthFailureHint(null);

    try {
      // Config first: OpenCode registers a custom provider's key method only
      // once the provider is in its config, so the key follows the write.
      const keyRequest = buildIntegrationKeyRequest(plan);
      const upsertBody = buildProviderUpsertRequest(plan, {
        // Create defaults to user. Edit must rewrite the winning config layer
        // (custom > project > user) so project/custom providers are not copied
        // into a global user override.
        scope: editingCustomProviderId
          ? (editingCustomScope ?? resolveProviderConfigScope(providerSources[editingCustomProviderId]))
          : 'user',
      });
      const response = await runtimeFetch(`/api/provider${settingsDirectory ? `?directory=${encodeURIComponent(settingsDirectory)}` : ''}`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(upsertBody),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || t('settings.providers.page.toast.customProviderSaveFailed'));
      }
      if (keyRequest) {
        try {
          await storeKeyAfterConfigWrite(() => getIntegrationClient().integration.connect.key(keyRequest));
        } catch (error) {
          setCustomAuthFailureHint(t('settings.providers.page.custom.authFailure.keyAfterConfig'));
          throw error;
        }
      }

      // Only a chosen icon is stored; "default" removes the entry so the
      // provider's own logo (or the generic fallback) shows again.
      const nextCustomProviderIcons = { ...useUIStore.getState().customProviderIcons };
      if (plan.icon) nextCustomProviderIcons[plan.providerID] = plan.icon;
      else delete nextCustomProviderIcons[plan.providerID];
      await updateDesktopSettings({ customProviderIcons: nextCustomProviderIcons });
      setCustomProviderIcon(plan.providerID, plan.icon);
      // The provider is saved by now; a failed image write is reported on its own
      // and does not reopen the form, whose next Save would store the key again.
      await applyLogoPlan(plan.providerID, plan.logo);

      toast.success(t('settings.providers.page.toast.customProviderSaved', { provider: plan.name }));
      setCandidateProviderId('');
      setEditingCustomProviderId(null);
      setEditingCustomFormInitial(null);
      setEditingCustomScope(null);
      setCustomAuthFailureHint(null);
      setLastCustomPersistId(null);
      // OpenCode watches its config file and rebuilds the catalog on its own.
      markAuthWriteSucceeded(plan.providerID);
    } catch (error) {
      console.error('Failed to save custom provider:', error);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t('settings.providers.page.toast.customProviderSaveFailed'),
      );
    } finally {
      setAuthBusyKey(null);
    }
=======
  const handleSaveCustomProvider = async (plan: CustomProviderPersistPlan) => {
    const busyKey = `custom:${plan.providerID}`;
    setAuthBusyKey(busyKey);
    setLastCustomPersistId(plan.providerID);
    setCustomAuthFailureHint(null);

    try {
      const keyRequest = buildIntegrationKeyRequest(plan);
      const upsertBody = buildProviderUpsertRequest(plan, {
        scope: editingCustomProviderId
          ? (editingCustomScope ?? resolveProviderConfigScope(providerSources[editingCustomProviderId]))
          : 'user',
      });
      const response = await runtimeFetch(`/api/provider${settingsDirectory ? `?directory=${encodeURIComponent(settingsDirectory)}` : ''}`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(upsertBody),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || t('settings.providers.page.toast.customProviderSaveFailed'));
      }
      if (keyRequest) {
        try {
          await storeKeyAfterConfigWrite(() => getIntegrationClient().integration.connect.key(keyRequest));
        } catch (error) {
          setCustomAuthFailureHint(t('settings.providers.page.custom.authFailure.keyAfterConfig'));
          throw error;
        }
      }

      const nextCustomProviderIcons = { ...useUIStore.getState().customProviderIcons };
      if (plan.icon) nextCustomProviderIcons[plan.providerID] = plan.icon;
      else delete nextCustomProviderIcons[plan.providerID];
      await updateDesktopSettings({ customProviderIcons: nextCustomProviderIcons });
      setCustomProviderIcon(plan.providerID, plan.icon);
      await applyLogoPlan(plan.providerID, plan.logo);

      toast.success(t('settings.providers.page.toast.customProviderSaved', { provider: plan.name }));
      setCandidateProviderId('');
      setEditingCustomProviderId(null);
      setEditingCustomFormInitial(null);
      setEditingCustomScope(null);
      setCustomAuthFailureHint(null);
      setLastCustomPersistId(null);
      markAuthWriteSucceeded(plan.providerID);
    } catch (error) {
      console.error('Failed to save custom provider:', error);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t('settings.providers.page.toast.customProviderSaveFailed'),
      );
    } finally {
      setAuthBusyKey(null);
    }
>>>>>>> upstream/main
  };

<<<<<<< HEAD
  const writeCandidateKey = async (apiKey: string) => {
    if (!state.workspaceId || !state.providers || !current || enterprise) throw new Error('Provider settings are not writable');
    await canonicalClient.writeProviderCredential(state.workspaceId, candidate, {
      expectedRevision: state.providers.revision,
      providerId: candidate,
      credential: { method: 'api-key', apiKey },
    });
    await markAuthWriteSucceeded(candidate);
||||||| bc50ba56aa
  const handleOAuthConnected = (providerId: string) => {
    // Optimistic mark + sources refetch so the page does not stick on a stale
    // "Credentials missing" summary while the providers refresh lands.
    markAuthWriteSucceeded(providerId);
=======
  const handleOAuthConnected = (providerId: string) => {
    markAuthWriteSucceeded(providerId);
>>>>>>> upstream/main
  };

<<<<<<< HEAD
  if (selected === CLASSIFICATION_PAGE_ID) {
||||||| bc50ba56aa
  const handleDisconnectProvider = async (providerId: string) => {
    const busyKey = `disconnect:${providerId}`;
    setAuthBusyKey(busyKey);

    try {
      // v2 keeps credentials in OpenCode, one record per stored login; the
      // provider is disconnected once every one of them is gone. Env-backed
      // connections are not removable from here — they live in the environment.
      const credentials = getCredentialConnections(
        findIntegrationForProvider(integrations ?? [], providerId),
      );
      const sdk = opencodeClient.getSdkClient();
      for (const credential of credentials) {
        await sdk.credential.remove({ credentialID: credential.id });
      }

      toast.success(t('settings.providers.page.toast.providerDisconnected'));
      refreshProviderSources();
      refreshIntegrations();
    } catch (error) {
      console.error('Failed to disconnect provider:', error);
      toast.error(t('settings.providers.page.toast.providerDisconnectFailed'));
    } finally {
      setAuthBusyKey(null);
    }
  };

  const handleDisconnectCustomProvider = async (providerId: string) => {
    if (!providerId) {
      return;
    }
    await handleDisconnectProvider(providerId);
    setEditingCustomProviderId(null);
    setEditingCustomFormInitial(null);
    setEditingCustomScope(null);
    setCustomAuthFailureHint(null);
    setLastCustomPersistId(null);
    setCandidateProviderId('');
  };

  // Each account action waits for the server's answer and then rereads the
  // integration list; OpenCode owns which credential is active, so nothing is
  // flipped locally first.
  const runAccountAction = async (
    account: CredentialConnection,
    action: () => Promise<void>,
    messages: { success?: string; failure: string },
  ) => {
    setAccountBusyId(account.id);
    try {
      await action();
      if (messages.success) toast.success(messages.success);
    } catch (error) {
      console.error('Provider account action failed:', error);
      toast.error(messages.failure);
    } finally {
      setAccountBusyId(null);
      refreshIntegrations();
    }
  };

  const handleActivateAccount = (account: CredentialConnection) => runAccountAction(
    account,
    async () => {
      await opencodeClient.getSdkClient().credential.activate({ credentialID: account.id });
    },
    {
      success: t('settings.providers.accounts.toast.switched', { account: account.label }),
      failure: t('settings.providers.accounts.toast.switchFailed'),
    },
  );

  const handleRenameAccount = (account: CredentialConnection, label: string) => runAccountAction(
    account,
    async () => {
      await opencodeClient.getSdkClient().credential.update({ credentialID: account.id, label });
    },
    { failure: t('settings.providers.accounts.toast.renameFailed') },
  );

  const handleRemoveAccount = (account: CredentialConnection) => runAccountAction(
    account,
    async () => {
      await opencodeClient.getSdkClient().credential.remove({ credentialID: account.id });
      refreshProviderSources();
    },
    {
      success: t('settings.providers.accounts.toast.removed'),
      failure: t('settings.providers.accounts.toast.removeFailed'),
    },
  );

  const backToGrid = () => {
    setCandidateProviderId('');
    setSelectedProvider('');
  };
  const backButton = <SettingsBackButton label={t('settings.providers.page.back')} onClick={backToGrid} />;


  // A classification source that needs a key links to the provider holding it:
  // its own page when OpenCode already lists it, the connect form otherwise.
  const openProviderForKey = (providerId: string) => {
    if (providers.some((provider) => provider.id === providerId)) {
      setSelectedProvider(providerId);
      return;
    }
    setCandidateProviderId(providerId);
    setSelectedProvider(ADD_PROVIDER_ID);
  };

  if (selectedProviderId === CLASSIFICATION_PAGE_ID) {
    return <ClassificationProvidersPage titleLeading={backButton} onOpenProvider={openProviderForKey} />;
  }

  // Enterprise mode: the way in stays hidden and the server refuses anyway.
  if (isAddMode && !enterpriseLocked && !candidateProviderId) {
=======
  const handleDisconnectProvider = async (providerId: string) => {
    const busyKey = `disconnect:${providerId}`;
    setAuthBusyKey(busyKey);

    try {
      const credentials = getCredentialConnections(
        findIntegrationForProvider(integrations ?? [], providerId),
      );
      const sdk = opencodeClient.getSdkClient();
      for (const credential of credentials) {
        await sdk.credential.remove({ credentialID: credential.id });
      }

      toast.success(t('settings.providers.page.toast.providerDisconnected'));
      refreshProviderSources();
      refreshIntegrations();
    } catch (error) {
      console.error('Failed to disconnect provider:', error);
      toast.error(t('settings.providers.page.toast.providerDisconnectFailed'));
    } finally {
      setAuthBusyKey(null);
    }
  };

  const handleDisconnectCustomProvider = async (providerId: string) => {
    if (!providerId) {
      return;
    }
    await handleDisconnectProvider(providerId);
    setEditingCustomProviderId(null);
    setEditingCustomFormInitial(null);
    setEditingCustomScope(null);
    setCustomAuthFailureHint(null);
    setLastCustomPersistId(null);
    setCandidateProviderId('');
  };

  const runAccountAction = async (
    account: CredentialConnection,
    action: () => Promise<void>,
    messages: { success?: string; failure: string },
  ) => {
    setAccountBusyId(account.id);
    try {
      await action();
      if (messages.success) toast.success(messages.success);
    } catch (error) {
      console.error('Provider account action failed:', error);
      toast.error(messages.failure);
    } finally {
      setAccountBusyId(null);
      refreshIntegrations();
    }
  };

  const handleActivateAccount = (account: CredentialConnection) => runAccountAction(
    account,
    async () => {
      await opencodeClient.getSdkClient().credential.activate({ credentialID: account.id });
    },
    {
      success: t('settings.providers.accounts.toast.switched', { account: account.label }),
      failure: t('settings.providers.accounts.toast.switchFailed'),
    },
  );

  const handleRenameAccount = (account: CredentialConnection, label: string) => runAccountAction(
    account,
    async () => {
      await opencodeClient.getSdkClient().credential.update({ credentialID: account.id, label });
    },
    { failure: t('settings.providers.accounts.toast.renameFailed') },
  );

  const handleRemoveAccount = (account: CredentialConnection) => runAccountAction(
    account,
    async () => {
      await opencodeClient.getSdkClient().credential.remove({ credentialID: account.id });
      refreshProviderSources();
    },
    {
      success: t('settings.providers.accounts.toast.removed'),
      failure: t('settings.providers.accounts.toast.removeFailed'),
    },
  );

  const backToGrid = () => {
    setCandidateProviderId('');
    setSelectedProvider('');
  };
  const backButton = <SettingsBackButton label={t('settings.providers.page.back')} onClick={backToGrid} />;


  const openProviderForKey = (providerId: string) => {
    if (providers.some((provider) => provider.id === providerId)) {
      setSelectedProvider(providerId);
      return;
    }
    setCandidateProviderId(providerId);
    setSelectedProvider(ADD_PROVIDER_ID);
  };

  if (selectedProviderId === CLASSIFICATION_PAGE_ID) {
    return <ClassificationProvidersPage titleLeading={backButton} onOpenProvider={openProviderForKey} />;
  }

  if (isAddMode && !enterpriseLocked && !candidateProviderId) {
>>>>>>> upstream/main
    return (
<<<<<<< HEAD
      <ClassificationProvidersPage
        titleLeading={<SettingsBackButton label={t('settings.providers.page.back')} onClick={backToGrid} />}
        onOpenProvider={openProvider}
||||||| bc50ba56aa
      <SettingsPageLayout
        title={t('settings.providers.page.connect.title')}
        titleLeading={backButton}
        showSaveStatus={false}
      >
        <ProviderConnectPicker
          providers={unconnectedProviders}
          loadFailed={integrationsLoadFailed}
          onSelect={setCandidateProviderId}
          onSelectCustom={() => setCandidateProviderId(CUSTOM_PROVIDER_ID)}
        />
      </SettingsPageLayout>
    );
  }

  if (isAddMode && !enterpriseLocked) {
    // A chosen provider: back returns to the picker, not to the grid.
    const candidateBackButton = (
      <SettingsBackButton label={t('settings.providers.page.back')} onClick={() => setCandidateProviderId('')} />
    );
    const candidateName = unconnectedProviders?.find((provider) => provider.id === candidateProviderId)?.name ?? candidateProviderId;
    return (
      <SettingsPageLayout
        title={isCustomCreateMode ? t('settings.providers.page.connect.title') : candidateName}
        titleLeading={isCustomCreateMode ? candidateBackButton : (
          <span className="flex items-center gap-2">
            {candidateBackButton}
            <ProviderLogo providerId={candidateProviderId} className="h-5 w-5 shrink-0" />
          </span>
        )}
        showSaveStatus={false}
      >
          {isCustomCreateMode ? (
            <CustomProviderForm
              mode="create"
              existingProviderIDs={connectedProviderIds}
              busy={authBusyKey?.startsWith('custom:') ?? false}
              authFailureHint={customAuthFailureHint}
              onCancel={() => {
                setCandidateProviderId('');
                setCustomAuthFailureHint(null);
                setLastCustomPersistId(null);
              }}
              onDisconnect={
                customAuthFailureHint && lastCustomPersistId
                  ? () => void handleDisconnectCustomProvider(lastCustomPersistId)
                  : undefined
              }
              onSubmit={handleSaveCustomProvider}
            />
          ) : (
            <SettingsSection
              title={t('settings.providers.page.auth.title')}
              divider={false}
              settingsItem="providers.auth"
              contentClassName="space-y-4"
            >
              {authLoading ? (
                <p className="typography-meta text-muted-foreground">{t('settings.providers.page.auth.loadingMethods')}</p>
              ) : (
                <>
                  {(() => {
                    const candidateIntegration = findIntegrationForProvider(integrations ?? [], candidateProviderId);
                    return (
                      <ProviderAuthMethodCards
                        key={candidateProviderId}
                        integrationId={candidateProviderId}
                        showApiKey={shouldShowApiKeyAuth(candidateIntegration)}
                        keyMethod={getKeyMethod(candidateIntegration)}
                        signInIntegrationId={getSignInIntegrationId(candidateProviderId)}
                        signInMethods={getSignInMethods(
                          findIntegrationForProvider(integrations ?? [], getSignInIntegrationId(candidateProviderId)),
                        )}
                        credentials={[]}
                        canAdd
                        connectKey={connectIntegrationKey}
                        onKeySaved={() => markAuthWriteSucceeded(candidateProviderId)}
                        onSignedIn={() => handleOAuthConnected(candidateProviderId)}
                      />
                    );
                  })()}
                </>
              )}
            </SettingsSection>
          )}
      </SettingsPageLayout>
    );
  }

  if (!selectedProvider) {
    return (
      <ProviderGrid
        providers={providers}
        integrations={integrations}
        directory={settingsDirectory}
        onSelect={setSelectedProvider}
        onConnect={() => setSelectedProvider(ADD_PROVIDER_ID)}
        onOpenClassification={() => setSelectedProvider(CLASSIFICATION_PAGE_ID)}
        disabledProviders={disabledProviders}
        onEnableProvider={(providerId) => void handleProviderDisabled(providerId, false)}
=======
      <SettingsPageLayout
        title={t('settings.providers.page.connect.title')}
        titleLeading={backButton}
        showSaveStatus={false}
      >
        <ProviderConnectPicker
          providers={unconnectedProviders}
          loadFailed={integrationsLoadFailed}
          onSelect={setCandidateProviderId}
          onSelectCustom={() => setCandidateProviderId(CUSTOM_PROVIDER_ID)}
        />
      </SettingsPageLayout>
    );
  }

  if (isAddMode && !enterpriseLocked) {
    const candidateBackButton = (
      <SettingsBackButton label={t('settings.providers.page.back')} onClick={() => setCandidateProviderId('')} />
    );
    const candidateName = unconnectedProviders?.find((provider) => provider.id === candidateProviderId)?.name ?? candidateProviderId;
    return (
      <SettingsPageLayout
        title={isCustomCreateMode ? t('settings.providers.page.connect.title') : candidateName}
        titleLeading={isCustomCreateMode ? candidateBackButton : (
          <span className="flex items-center gap-2">
            {candidateBackButton}
            <ProviderLogo providerId={candidateProviderId} className="h-5 w-5 shrink-0" />
          </span>
        )}
        showSaveStatus={false}
      >
          {isCustomCreateMode ? (
            <CustomProviderForm
              mode="create"
              existingProviderIDs={connectedProviderIds}
              busy={authBusyKey?.startsWith('custom:') ?? false}
              authFailureHint={customAuthFailureHint}
              onCancel={() => {
                setCandidateProviderId('');
                setCustomAuthFailureHint(null);
                setLastCustomPersistId(null);
              }}
              onDisconnect={
                customAuthFailureHint && lastCustomPersistId
                  ? () => void handleDisconnectCustomProvider(lastCustomPersistId)
                  : undefined
              }
              onSubmit={handleSaveCustomProvider}
            />
          ) : (
            <SettingsSection
              title={t('settings.providers.page.auth.title')}
              settingsItem="providers.auth"
              contentClassName="space-y-4"
            >
              {authLoading ? (
                <p className="typography-meta text-muted-foreground">{t('settings.providers.page.auth.loadingMethods')}</p>
              ) : (
                <>
                  {(() => {
                    const candidateIntegration = findIntegrationForProvider(integrations ?? [], candidateProviderId);
                    return (
                      <ProviderAuthMethodCards
                        key={candidateProviderId}
                        integrationId={candidateProviderId}
                        showApiKey={shouldShowApiKeyAuth(candidateIntegration)}
                        keyMethod={getKeyMethod(candidateIntegration)}
                        signInIntegrationId={getSignInIntegrationId(candidateProviderId)}
                        signInMethods={getSignInMethods(
                          findIntegrationForProvider(integrations ?? [], getSignInIntegrationId(candidateProviderId)),
                        )}
                        credentials={[]}
                        canAdd
                        connectKey={connectIntegrationKey}
                        onKeySaved={() => markAuthWriteSucceeded(candidateProviderId)}
                        onSignedIn={() => handleOAuthConnected(candidateProviderId)}
                      />
                    );
                  })()}
                </>
              )}
            </SettingsSection>
          )}
      </SettingsPageLayout>
    );
  }

  if (!selectedProvider) {
    return (
      <ProviderGrid
        providers={providers}
        integrations={integrations}
        directory={settingsDirectory}
        onSelect={setSelectedProvider}
        onConnect={() => setSelectedProvider(ADD_PROVIDER_ID)}
        onOpenClassification={() => setSelectedProvider(CLASSIFICATION_PAGE_ID)}
        disabledProviders={disabledProviders}
        onEnableProvider={(providerId) => void handleProviderDisabled(providerId, false)}
>>>>>>> upstream/main
      />
    );
  }

<<<<<<< HEAD
  if (!directory) {
    return (
      <SettingsPageLayout title={t('settings.page.providers.title')} showSaveStatus={false}>
        <p role="alert" className="typography-meta text-muted-foreground">{t('common.unavailable')}</p>
      </SettingsPageLayout>
    );
  }
||||||| bc50ba56aa
  const providerModels = Array.isArray(selectedProvider.models) ? selectedProvider.models : [];
  // Hiding a model only takes it out of the chat pickers, which never list image models.
  const canHideModels = !settingsOnlyProviders.includes(selectedProvider);
  const selectedIntegration = findIntegrationForProvider(integrations ?? [], selectedProvider.id);
  const signInMethods = getSignInMethods(
    findIntegrationForProvider(integrations ?? [], getSignInIntegrationId(selectedProvider.id)),
  );
  const showApiKeyAuth = shouldShowApiKeyAuth(selectedIntegration);
  const integrationsLoaded = integrations !== null;
  const sourcesLoaded = Boolean(selectedSources);
  const isEditableCustomProvider = sourcesLoaded
    && isConfigDefinedCustomProvider(selectedProvider, selectedSources);
  const hasCredentials = providerHasCredentials({
    connections: getProviderConnections(integrations ?? [], selectedProvider.id),
    optionsApiKey: readProviderApiKeySetting(selectedProvider),
    machineCredentials: usesMachineCredentials(selectedProvider),
  });
  const showModelsSection = shouldShowModelsSection({
    modelCount: providerModels.length,
    integrationsLoaded,
    hasCredentials,
    isEditableCustomProvider,
  });
  const providerConnections = getProviderConnections(integrations ?? [], selectedProvider.id) ?? [];
  // Requests go through one integration only: the provider's own, or the one it
  // is bound to (OpenCode Go moves to the Console once you are signed in there).
  // Its first credential is the active account; credentials stored under the
  // other integration stay listed so they can be removed, but are not in use.
  const usedIntegrationId = selectedProvider.integrationID ?? selectedProvider.id;
  const usedCredentials = getCredentialConnections(findIntegrationForProvider(integrations ?? [], usedIntegrationId));
  const activeAccountId = usedCredentials[0]?.id ?? null;
  const unusedAccountIds = new Set(
    providerConnections.flatMap((connection) => (
      connection.type === 'credential' && !usedCredentials.some((used) => used.id === connection.id)
        ? [connection.id]
        : []
    )),
  );
  const storedCredentials = providerConnections.filter(
    (connection): connection is CredentialConnection => connection.type === 'credential',
  );
  const environmentConnections = providerConnections.filter((connection) => connection.type === 'env');
  // With no stored account in use, OpenCode can still use a key from an
  // environment variable or the config, or credentials on the server machine.
  const inUseWithoutCredential = activeAccountId !== null
    ? null
    : usesMachineCredentials(selectedProvider)
      ? 'external'
      : environmentConnections.length > 0 || readProviderApiKeySetting(selectedProvider) !== null
        ? 'key'
        : null;
  const configSources = [
    selectedSources?.user.exists ? t('settings.providers.page.connectionDetails.source.userConfig') : null,
    selectedSources?.project.exists ? t('settings.providers.page.connectionDetails.source.projectConfig') : null,
    selectedSources?.custom?.exists ? t('settings.providers.page.connectionDetails.source.customConfig') : null,
  ].filter((source): source is string => source !== null);
  const providerTitleLeading = (
    <span className="flex items-center gap-2">
      {backButton}
      <ProviderLogo providerId={selectedProvider.id} className="h-5 w-5 shrink-0" />
    </span>
  );
  const providerDescription = (
    <span className="typography-settings-description text-muted-foreground">
      <span className="font-mono">{selectedProvider.id}</span>
      {configSources.length > 0
        ? <> · {t('settings.providers.page.configuredIn', { sources: configSources.join(', ') })}</>
        : null}
    </span>
  );
=======
  const providerModels = Array.isArray(selectedProvider.models) ? selectedProvider.models : [];
  const canHideModels = !settingsOnlyProviders.includes(selectedProvider);
  const selectedIntegration = findIntegrationForProvider(integrations ?? [], selectedProvider.id);
  const signInMethods = getSignInMethods(
    findIntegrationForProvider(integrations ?? [], getSignInIntegrationId(selectedProvider.id)),
  );
  const showApiKeyAuth = shouldShowApiKeyAuth(selectedIntegration);
  const integrationsLoaded = integrations !== null;
  const sourcesLoaded = Boolean(selectedSources);
  const isEditableCustomProvider = sourcesLoaded
    && isConfigDefinedCustomProvider(selectedProvider, selectedSources);
  const hasCredentials = providerHasCredentials({
    connections: getProviderConnections(integrations ?? [], selectedProvider.id),
    optionsApiKey: readProviderApiKeySetting(selectedProvider),
    machineCredentials: usesMachineCredentials(selectedProvider),
  });
  const showModelsSection = shouldShowModelsSection({
    modelCount: providerModels.length,
    integrationsLoaded,
    hasCredentials,
    isEditableCustomProvider,
  });
  const providerConnections = getProviderConnections(integrations ?? [], selectedProvider.id) ?? [];
  const usedIntegrationId = selectedProvider.integrationID ?? selectedProvider.id;
  const usedCredentials = getCredentialConnections(findIntegrationForProvider(integrations ?? [], usedIntegrationId));
  const activeAccountId = usedCredentials[0]?.id ?? null;
  const unusedAccountIds = new Set(
    providerConnections.flatMap((connection) => (
      connection.type === 'credential' && !usedCredentials.some((used) => used.id === connection.id)
        ? [connection.id]
        : []
    )),
  );
  const storedCredentials = providerConnections.filter(
    (connection): connection is CredentialConnection => connection.type === 'credential',
  );
  const environmentConnections = providerConnections.filter((connection) => connection.type === 'env');
  const inUseWithoutCredential = activeAccountId !== null
    ? null
    : usesMachineCredentials(selectedProvider)
      ? 'external'
      : environmentConnections.length > 0 || readProviderApiKeySetting(selectedProvider) !== null
        ? 'key'
        : null;
  const configSources = [
    selectedSources?.user.exists ? t('settings.providers.page.connectionDetails.source.userConfig') : null,
    selectedSources?.project.exists ? t('settings.providers.page.connectionDetails.source.projectConfig') : null,
    selectedSources?.custom?.exists ? t('settings.providers.page.connectionDetails.source.customConfig') : null,
  ].filter((source): source is string => source !== null);
  const providerTitleLeading = (
    <span className="flex items-center gap-2">
      {backButton}
      <ProviderLogo providerId={selectedProvider.id} className="h-5 w-5 shrink-0" />
    </span>
  );
  const providerDescription = (
    <span className="typography-settings-description text-muted-foreground">
      <span className="font-mono">{selectedProvider.id}</span>
      {configSources.length > 0
        ? <> · {t('settings.providers.page.configuredIn', { sources: configSources.join(', ') })}</>
        : null}
    </span>
  );
>>>>>>> upstream/main

  if (!current || (state.loading && !state.providers)) {
    return (
      <SettingsPageLayout title={t('settings.page.providers.title')} showSaveStatus={false}>
        <p role="status" className="typography-meta text-muted-foreground">{t('settings.providers.page.state.loading')}</p>
      </SettingsPageLayout>
    );
  }

  if (selected === ADD_PROVIDER_ID && !enterprise) {
    const backButton = <SettingsBackButton label={t('settings.providers.page.back')} onClick={backToGrid} />;
    if (!candidate) {
      return (
        <SettingsPageLayout
          title={t('settings.providers.page.connect.title')}
          titleLeading={backButton}
          showSaveStatus={false}
        >
          <ProviderConnectPicker
            providers={connectable}
            loadFailed={connectListFailed}
            onSelect={setCandidate}
            onSelectCustom={() => setCandidate(CUSTOM_PROVIDER_ID)}
          />
        </SettingsPageLayout>
      );
    }

    const isCustomCreate = candidate === CUSTOM_PROVIDER_ID;
    const candidateBackButton = (
      <SettingsBackButton
        label={t('settings.providers.page.back')}
        onClick={() => setCandidate('')}
      />
    );
    const candidateProvider = providers.find((entry) => entry.providerId === candidate);
    const candidateName = candidateProvider?.name ?? candidate;
    const candidateSupportsApiKey = candidateProvider?.authMethods.includes('api-key') ?? true;

    return (
      <SettingsPageLayout
        title={isCustomCreate ? t('settings.providers.page.connect.title') : candidateName}
        titleLeading={isCustomCreate ? candidateBackButton : (
          <span className="flex items-center gap-2">
            {candidateBackButton}
            <ProviderLogo providerId={candidate} className="size-5 shrink-0" />
          </span>
        )}
        showSaveStatus={false}
      >
        {isCustomCreate ? (
          <CustomProviderForm
            workspaceId={state.workspaceId ?? ''}
            revision={state.providers?.revision ?? '0'}
            existingProviderIDs={existingIds}
            busy={busy}
            onCancel={() => {
              setCandidate('');
              setPartialProvider(null);
            }}
            onSubmit={saveCustomProvider}
          />
        ) : (
          <SettingsSection
            title={t('settings.providers.page.auth.title')}
            divider={false}
            settingsItem="providers.auth"
            contentClassName={SETTINGS_SPACE_ROW_CLASS}
          >
            {methods === null && !methodsFailed ? (
              <p className="typography-meta text-muted-foreground">
                {t('settings.providers.page.auth.loadingMethods')}
              </p>
            ) : (
              <>
                {candidateSupportsApiKey ? (
                  <ProviderApiKeyForm
                    key={candidate}
                    writeCanonicalKey={writeCandidateKey}
                    disabled={busy}
                  />
                ) : null}
                {methods ? (
                  <ProviderOAuthMethods
                    key={candidate}
                    workspaceId={state.workspaceId ?? ''}
                    revision={state.providers?.revision ?? '0'}
                    methods={oauthMethodsForProvider(methods.methods, candidate)}
                    disabled={busy}
                    onConnected={() => markAuthWriteSucceeded(candidate)}
                    className="border-t border-[var(--surface-subtle)] pt-2"
                  />
                ) : null}
                {methodsFailed ? (
                  <p role="alert" className="typography-meta text-[var(--status-error)]">
                    {t('settings.providers.page.toast.authMethodsLoadFailed')}
                  </p>
                ) : null}
              </>
            )}
          </SettingsSection>
        )}
      </SettingsPageLayout>
    );
  }

  if (provider) {
    return (
      <SettingsPageLayout
        title={provider.name || provider.providerId}
        titleLeading={(
          <span className="flex items-center gap-2">
            <SettingsBackButton label={t('settings.providers.page.back')} onClick={backToGrid} />
            <ProviderLogo providerId={provider.providerId} className="size-5 shrink-0" />
          </span>
        )}
        description={(
          <span className="typography-settings-description text-muted-foreground">
            <span className="font-mono">{provider.providerId}</span>
          </span>
        )}
        showSaveStatus={false}
      >
        <ProviderDetail
          key={`${state.runtimeKey}:${state.workspaceId}:${provider.providerId}`}
          workspaceId={state.workspaceId ?? ''}
          revision={state.providers?.revision ?? '0'}
          provider={provider}
          models={models}
          methods={methods}
          methodsFailed={methodsFailed}
          existingIds={existingIds}
          enterprise={enterprise}
          busy={busy}
          initialEdit={partialProvider === provider.providerId}
          initialAddKey={addKeyFor === provider.providerId}
          authFailureHint={partialProvider === provider.providerId
            ? t('settings.providers.page.custom.authFailure.keyAfterConfig')
            : null}
          onRefresh={state.refresh}
          onSave={saveCustomProvider}
          onClearAuthFailure={() => setPartialProvider(null)}
          applyLogoPlan={applyLogoPlan}
          logoBusyId={logoBusyId}
        />
      </SettingsPageLayout>
    );
  }

  return (
<<<<<<< HEAD
    <ProviderGrid
      providers={connectedProviders}
      models={models}
      keyProviders={keyProviders}
      onSelect={openProvider}
      onConnect={() => setSelected(ADD_PROVIDER_ID)}
      onAddKey={requestProviderKey}
      onOpenClassification={() => setSelected(CLASSIFICATION_PAGE_ID)}
      loadFailed={connectListFailed}
      onRetry={() => { void state.refresh(); }}
    />
||||||| bc50ba56aa
    <SettingsPageLayout
      title={selectedProvider.name || selectedProvider.id}
      titleLeading={providerTitleLeading}
      description={providerDescription}
      showSaveStatus={false}
    >
      <SettingsSection
        title={t('settings.providers.accounts.title')}
        info={t('settings.providers.accounts.info')}
        divider={false}
        headerAction={(
          <div className="flex items-center gap-1">
            {isEditableCustomProvider && !enterpriseLocked ? (
              <Button
                variant="outline"
                size="xs"
                className="!font-normal"
                onClick={() => {
                  setCustomAuthFailureHint(null);
                  setEditingCustomFormInitial(providerToEditFormState(
                    selectedProvider,
                    storedProviderConfigs[selectedProvider.id] ?? null,
                    customProviderIcons[selectedProvider.id],
                  ));
                  setEditingCustomScope(resolveProviderConfigScope(selectedSources));
                  setEditingCustomProviderId(selectedProvider.id);
                }}
              >
                {t('settings.providers.page.actions.edit')}
              </Button>
            ) : null}
            {disabledProviders !== null ? (
              <Button
                variant="outline"
                size="xs"
                className="!font-normal"
                title={t('settings.providers.disabled.disableHint')}
                onClick={() => void handleProviderDisabled(selectedProvider.id, true)}
              >
                {t('settings.providers.disabled.disable')}
              </Button>
            ) : null}
          </div>
        )}
        settingsItem="providers.auth"
        contentClassName="space-y-4"
      >
        {environmentConnections.length > 0 ? (
          <ProviderAccounts
            connections={environmentConnections}
            activeId={activeAccountId}
            unusedIds={unusedAccountIds}
            busyId={accountBusyId}
            canSwitch={false}
            showActive={false}
            onActivate={(account) => void handleActivateAccount(account)}
            onRename={(account, label) => void handleRenameAccount(account, label)}
            onRemove={(account) => void handleRemoveAccount(account)}
          />
        ) : null}

        {authLoading ? (
          <div className="py-1.5 typography-meta text-muted-foreground">{t('settings.providers.page.auth.loadingMethods')}</div>
        ) : (
          <ProviderAuthMethodCards
            key={selectedProvider.id}
            integrationId={selectedProvider.id}
            showApiKey={showApiKeyAuth}
            keyMethod={getKeyMethod(selectedIntegration)}
            signInIntegrationId={getSignInIntegrationId(selectedProvider.id)}
            signInMethods={signInMethods}
            credentials={storedCredentials}
            accounts={{
              activeId: activeAccountId,
              unusedIds: unusedAccountIds,
              busyId: accountBusyId,
              ...getAccountSwitching(providerConnections, unusedAccountIds),
              onActivate: (account) => void handleActivateAccount(account),
              onRename: (account, label) => void handleRenameAccount(account, label),
              onRemove: (account) => void handleRemoveAccount(account),
            }}
            inUseWithoutCredential={inUseWithoutCredential}
            canAdd={!enterpriseLocked}
            connectKey={connectIntegrationKey}
            onKeySaved={() => markAuthWriteSucceeded(selectedProvider.id)}
            onSignedIn={() => handleOAuthConnected(selectedProvider.id)}
          />
        )}

        {/* The switch happens in the managed OpenCode plugin; VS Code runs its own OpenCode without it. */}
        {usedCredentials.length > 0 && !isVSCodeRuntime() ? (
          <ProviderAccountSwitchToggle providerId={selectedProvider.id} accountCount={usedCredentials.length} />
        ) : null}

        {enterpriseLocked ? (
          <p className="typography-meta text-muted-foreground">{t('settings.providers.enterpriseMode')}</p>
        ) : null}
      </SettingsSection>

      {/* A custom provider sets its logo in the edit form, unless enterprise mode hides the form. */}
      {providerLogoUploadSupported() && sourcesLoaded && (!isEditableCustomProvider || enterpriseLocked) ? (
        <SettingsSection
          title={t('settings.providers.page.logo.title')}
          info={t('settings.providers.page.logo.info')}
          settingsItem="providers.logo"
        >
          <ProviderLogoImageControl
            preview={customProviderLogos[selectedProvider.id]
              ? <ProviderLogo providerId={selectedProvider.id} alt="" className="size-5" />
              : null}
            busy={logoBusyId === selectedProvider.id}
            onPick={(file) => void applyLogoPlan(selectedProvider.id, { kind: 'upload', file })}
            onRemove={() => void applyLogoPlan(selectedProvider.id, { kind: 'remove' })}
          />
        </SettingsSection>
      ) : null}

      {providerModels.length === 0 ? (
        <SettingsSection
          title={t('settings.providers.page.models.title')}
          titleAccessory={modelCountAccessory}
          settingsItem="providers.models"
        >
          <p className="typography-meta text-muted-foreground">{t('settings.providers.page.models.none')}</p>
        </SettingsSection>
      ) : null}

      {showModelsSection ? (
      <SettingsSection
        title={t('settings.providers.page.models.title')}
        titleAccessory={modelCountAccessory}
        headerAction={canHideModels ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="xs"
              className="!font-normal"
              onClick={() => {
                const allIds = providerModels
                  .map((model) => (typeof model?.id === 'string' ? model.id : ''))
                  .filter((id) => id.length > 0);
                hideAllModels(selectedProvider.id, allIds);
              }}
            >
              {t('settings.providers.page.actions.hideAll')}
            </Button>
            <Button
              variant="outline"
              size="xs"
              className="!font-normal"
              onClick={() => showAllModels(selectedProvider.id)}
            >
              {t('settings.providers.page.actions.showAll')}
            </Button>
          </div>
        ) : undefined}
        settingsItem="providers.models"
      >
            <div className="relative mb-2">
              <Icon name="search" className="absolute inset-s-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
                placeholder={t('settings.providers.page.models.filterPlaceholder')}
                className="h-7 ps-8 w-full"
              />
            </div>

            {filteredModels.length === 0 ? (
              <p className="typography-meta text-muted-foreground py-4 text-center">{t('settings.providers.page.models.noModelsMatchFilter')}</p>
            ) : (
              <div className="divide-y divide-[var(--surface-subtle)]">
                {filteredModels.map((model) => {
                  const modelId = typeof model?.id === 'string' ? model.id : '';
                  const modelName = typeof model?.name === 'string' ? model.name : modelId;
                  const metadata = modelId ? getModelMetadata(selectedProvider.id, modelId) as ModelMetadata | undefined : undefined;
                  const isHidden = canHideModels && hiddenModels.some(
                    (item) => item.providerID === selectedProvider.id && item.modelID === modelId
                  );

                  const contextTokens = formatTokens(metadata?.limit?.context);
                  const outputTokens = formatTokens(metadata?.limit?.output);
                  const tokenSummary = [
                    contextTokens ? `${contextTokens} ${t('settings.providers.page.models.tokenBadge.context')}` : null,
                    outputTokens ? `${outputTokens} ${t('settings.providers.page.models.tokenBadge.output')}` : null,
                  ].filter(Boolean).join(' · ');

                  const capabilityIcons: Array<{ key: string; icon: IconName; label: string }> = [];
                  if (metadata?.tool_call) capabilityIcons.push({ key: 'tools', icon: "tools", label: t('settings.providers.page.models.capability.toolCalling') });
                  if (metadata?.reasoning) capabilityIcons.push({ key: 'reasoning', icon: "brain-ai-3", label: t('settings.providers.page.models.capability.reasoning') });
                  if (metadata?.attachment) capabilityIcons.push({ key: 'image', icon: "file-image", label: t('settings.providers.page.models.capability.imageInput') });

                  return (
                    <div key={modelId} className="py-1.5">
                      <div
                        className={cn(
                          "flex items-center gap-3",
                          isHidden && 'opacity-50',
                        )}
                      >
                      <span className="typography-meta font-medium text-foreground truncate flex-1 min-w-0">
                        {modelName}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isMobile ? (
                          // A phone row has room for the name only; the limits
                          // and capabilities move behind a tap.
                          (tokenSummary || capabilityIcons.length > 0) ? (
                            <SettingsInfoHint className="h-6 w-6">
                              <div className="space-y-1.5">
                                {tokenSummary ? <div className="font-medium">{tokenSummary}</div> : null}
                                {capabilityIcons.map(({ key, icon: iconName, label }) => (
                                  <div key={key} className="flex items-center gap-1.5">
                                    <Icon name={iconName} className="h-3.5 w-3.5" />
                                    {label}
                                  </div>
                                ))}
                              </div>
                            </SettingsInfoHint>
                          ) : null
                        ) : (
                          <>
                        {tokenSummary ? (
                          <span className="typography-micro text-muted-foreground flex-shrink-0 oc-tile-inset px-1.5 py-0.5 rounded">
                            {tokenSummary}
                          </span>
                        ) : null}
                        {capabilityIcons.length > 0 && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {capabilityIcons.map(({ key, icon: iconName, label }) => (
                              <span
                                key={key}
                                className="flex h-5 w-5 rounded items-center justify-center text-muted-foreground oc-tile-inset"
                                title={label}
                                aria-label={label}
                              >
                                <Icon name={iconName} className="h-3 w-3" />
                              </span>
                            ))}
                          </div>
                        )}
                          </>
                        )}
                        {canHideModels ? (
                        <button
                          type="button"
                          onClick={() => toggleHiddenModel(selectedProvider.id, modelId)}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--interactive-hover)]/50"
                          title={isHidden ? t('settings.providers.page.models.actions.showModelInSelectors') : t('settings.providers.page.models.actions.hideModelFromSelectors')}
                          aria-label={isHidden ? t('settings.providers.page.models.actions.showModel') : t('settings.providers.page.models.actions.hideModel')}
                        >
                          {isHidden ? <Icon name="eye-off" className="h-3.5 w-3.5" /> : <Icon name="eye" className="h-3.5 w-3.5" />}
                        </button>
                        ) : null}
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
      </SettingsSection>
      ) : null}
    </SettingsPageLayout>
=======
    <SettingsPageLayout
      title={selectedProvider.name || selectedProvider.id}
      titleLeading={providerTitleLeading}
      description={providerDescription}
      showSaveStatus={false}
    >
      <SettingsSection
        title={t('settings.providers.accounts.title')}
        info={t('settings.providers.accounts.info')}
        headerAction={(
          <div className="flex items-center gap-1">
            {isEditableCustomProvider && !enterpriseLocked ? (
              <Button
                variant="outline"
                size="xs"
                className="!font-normal"
                onClick={() => {
                  setCustomAuthFailureHint(null);
                  setEditingCustomFormInitial(providerToEditFormState(
                    selectedProvider,
                    storedProviderConfigs[selectedProvider.id] ?? null,
                    customProviderIcons[selectedProvider.id],
                  ));
                  setEditingCustomScope(resolveProviderConfigScope(selectedSources));
                  setEditingCustomProviderId(selectedProvider.id);
                }}
              >
                {t('settings.providers.page.actions.edit')}
              </Button>
            ) : null}
            {disabledProviders !== null ? (
              <Button
                variant="outline"
                size="xs"
                className="!font-normal"
                title={t('settings.providers.disabled.disableHint')}
                onClick={() => void handleProviderDisabled(selectedProvider.id, true)}
              >
                {t('settings.providers.disabled.disable')}
              </Button>
            ) : null}
          </div>
        )}
        settingsItem="providers.auth"
        contentClassName="space-y-4"
      >
        {environmentConnections.length > 0 ? (
          <ProviderAccounts
            connections={environmentConnections}
            activeId={activeAccountId}
            unusedIds={unusedAccountIds}
            busyId={accountBusyId}
            canSwitch={false}
            showActive={false}
            onActivate={(account) => void handleActivateAccount(account)}
            onRename={(account, label) => void handleRenameAccount(account, label)}
            onRemove={(account) => void handleRemoveAccount(account)}
          />
        ) : null}

        {authLoading ? (
          <div className="py-1.5 typography-meta text-muted-foreground">{t('settings.providers.page.auth.loadingMethods')}</div>
        ) : (
          <ProviderAuthMethodCards
            key={selectedProvider.id}
            integrationId={selectedProvider.id}
            showApiKey={showApiKeyAuth}
            keyMethod={getKeyMethod(selectedIntegration)}
            signInIntegrationId={getSignInIntegrationId(selectedProvider.id)}
            signInMethods={signInMethods}
            credentials={storedCredentials}
            accounts={{
              activeId: activeAccountId,
              unusedIds: unusedAccountIds,
              busyId: accountBusyId,
              ...getAccountSwitching(providerConnections, unusedAccountIds),
              onActivate: (account) => void handleActivateAccount(account),
              onRename: (account, label) => void handleRenameAccount(account, label),
              onRemove: (account) => void handleRemoveAccount(account),
            }}
            inUseWithoutCredential={inUseWithoutCredential}
            canAdd={!enterpriseLocked}
            connectKey={connectIntegrationKey}
            onKeySaved={() => markAuthWriteSucceeded(selectedProvider.id)}
            onSignedIn={() => handleOAuthConnected(selectedProvider.id)}
          />
        )}

        {usedCredentials.length > 0 && !isVSCodeRuntime() ? (
          <ProviderAccountSwitchToggle providerId={selectedProvider.id} accountCount={usedCredentials.length} />
        ) : null}

        {enterpriseLocked ? (
          <p className="typography-meta text-muted-foreground">{t('settings.providers.enterpriseMode')}</p>
        ) : null}
      </SettingsSection>

      {providerLogoUploadSupported() && sourcesLoaded && (!isEditableCustomProvider || enterpriseLocked) ? (
        <SettingsSection
          title={t('settings.providers.page.logo.title')}
          info={t('settings.providers.page.logo.info')}
          settingsItem="providers.logo"
        >
          <ProviderLogoImageControl
            preview={customProviderLogos[selectedProvider.id]
              ? <ProviderLogo providerId={selectedProvider.id} alt="" className="size-5" />
              : null}
            busy={logoBusyId === selectedProvider.id}
            onPick={(file) => void applyLogoPlan(selectedProvider.id, { kind: 'upload', file })}
            onRemove={() => void applyLogoPlan(selectedProvider.id, { kind: 'remove' })}
          />
        </SettingsSection>
      ) : null}

      {providerModels.length === 0 ? (
        <SettingsSection
          title={t('settings.providers.page.models.title')}
          titleAccessory={modelCountAccessory}
          settingsItem="providers.models"
        >
          <p className="typography-meta text-muted-foreground">{t('settings.providers.page.models.none')}</p>
        </SettingsSection>
      ) : null}

      {showModelsSection ? (
      <SettingsSection
        title={t('settings.providers.page.models.title')}
        titleAccessory={modelCountAccessory}
        headerAction={canHideModels ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="xs"
              className="!font-normal"
              onClick={() => {
                const allIds = providerModels
                  .map((model) => (typeof model?.id === 'string' ? model.id : ''))
                  .filter((id) => id.length > 0);
                hideAllModels(selectedProvider.id, allIds);
              }}
            >
              {t('settings.providers.page.actions.hideAll')}
            </Button>
            <Button
              variant="outline"
              size="xs"
              className="!font-normal"
              onClick={() => showAllModels(selectedProvider.id)}
            >
              {t('settings.providers.page.actions.showAll')}
            </Button>
          </div>
        ) : undefined}
        settingsItem="providers.models"
      >
            <div className="relative mb-2">
              <Icon name="search" className="absolute inset-s-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
                placeholder={t('settings.providers.page.models.filterPlaceholder')}
                className="h-7 ps-8 w-full"
              />
            </div>

            {filteredModels.length === 0 ? (
              <p className="typography-meta text-muted-foreground py-4 text-center">{t('settings.providers.page.models.noModelsMatchFilter')}</p>
            ) : (
              <div className="divide-y divide-[var(--surface-subtle)]">
                {filteredModels.map((model) => {
                  const modelId = typeof model?.id === 'string' ? model.id : '';
                  const modelName = typeof model?.name === 'string' ? model.name : modelId;
                  const metadata = modelId ? getModelMetadata(selectedProvider.id, modelId) as ModelMetadata | undefined : undefined;
                  const isHidden = canHideModels && hiddenModels.some(
                    (item) => item.providerID === selectedProvider.id && item.modelID === modelId
                  );

                  const contextTokens = formatTokens(metadata?.limit?.context);
                  const outputTokens = formatTokens(metadata?.limit?.output);
                  const tokenSummary = [
                    contextTokens ? `${contextTokens} ${t('settings.providers.page.models.tokenBadge.context')}` : null,
                    outputTokens ? `${outputTokens} ${t('settings.providers.page.models.tokenBadge.output')}` : null,
                  ].filter(Boolean).join(' · ');

                  const capabilityIcons: Array<{ key: string; icon: IconName; label: string }> = [];
                  if (metadata?.tool_call) capabilityIcons.push({ key: 'tools', icon: "tools", label: t('settings.providers.page.models.capability.toolCalling') });
                  if (metadata?.reasoning) capabilityIcons.push({ key: 'reasoning', icon: "brain-ai-3", label: t('settings.providers.page.models.capability.reasoning') });
                  if (metadata?.attachment) capabilityIcons.push({ key: 'image', icon: "file-image", label: t('settings.providers.page.models.capability.imageInput') });

                  return (
                    <div key={modelId} className="py-1.5">
                      <div
                        className={cn(
                          "flex items-center gap-3",
                          isHidden && 'opacity-50',
                        )}
                      >
                      <span className="typography-meta font-medium text-foreground truncate flex-1 min-w-0">
                        {modelName}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isMobile ? (
                          (tokenSummary || capabilityIcons.length > 0) ? (
                            <SettingsInfoHint className="h-6 w-6">
                              <div className="space-y-1.5">
                                {tokenSummary ? <div className="font-medium">{tokenSummary}</div> : null}
                                {capabilityIcons.map(({ key, icon: iconName, label }) => (
                                  <div key={key} className="flex items-center gap-1.5">
                                    <Icon name={iconName} className="h-3.5 w-3.5" />
                                    {label}
                                  </div>
                                ))}
                              </div>
                            </SettingsInfoHint>
                          ) : null
                        ) : (
                          <>
                        {tokenSummary ? (
                          <span className="typography-micro text-muted-foreground flex-shrink-0 oc-tile-inset px-1.5 py-0.5 rounded">
                            {tokenSummary}
                          </span>
                        ) : null}
                        {capabilityIcons.length > 0 && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {capabilityIcons.map(({ key, icon: iconName, label }) => (
                              <span
                                key={key}
                                className="flex h-5 w-5 rounded items-center justify-center text-muted-foreground oc-tile-inset"
                                title={label}
                                aria-label={label}
                              >
                                <Icon name={iconName} className="h-3 w-3" />
                              </span>
                            ))}
                          </div>
                        )}
                          </>
                        )}
                        {canHideModels ? (
                        <button
                          type="button"
                          onClick={() => toggleHiddenModel(selectedProvider.id, modelId)}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--interactive-hover)]/50"
                          title={isHidden ? t('settings.providers.page.models.actions.showModelInSelectors') : t('settings.providers.page.models.actions.hideModelFromSelectors')}
                          aria-label={isHidden ? t('settings.providers.page.models.actions.showModel') : t('settings.providers.page.models.actions.hideModel')}
                        >
                          {isHidden ? <Icon name="eye-off" className="h-3.5 w-3.5" /> : <Icon name="eye" className="h-3.5 w-3.5" />}
                        </button>
                        ) : null}
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
      </SettingsSection>
      ) : null}
    </SettingsPageLayout>
>>>>>>> upstream/main
  );
};
