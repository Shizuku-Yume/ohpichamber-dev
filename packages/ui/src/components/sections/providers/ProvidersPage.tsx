import React from 'react';
import { useStore } from 'zustand';
import type {
  Model,
  Provider,
  ProviderAccounts as Accounts,
  ProviderAccountMutationRequest,
  ProviderAccountSelection,
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
  providerAccountName,
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

type Detail = { accounts: Accounts; selection: ProviderAccountSelection | null; configuration: ProviderConfigurationRead | null };

const formatTokens = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  if (value === 0) return '0';
  const formatted = formatCompactNumber(value);
  return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
};

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
  onDeleteProvider: (providerId: string) => Promise<void>;
  onResetOverrides: (providerId: string) => Promise<void>;
  onClearAuthFailure: () => void;
  applyLogoPlan: (providerId: string, plan: CustomProviderLogoPlan) => Promise<void>;
  logoBusyId: string | null;
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
  onDeleteProvider,
  onResetOverrides,
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
      canonicalClient.providerAccountSelection(workspaceId, provider.providerId),
      configuration,
    ]).then(([accounts, selection, config]) => {
      if (active && runtime === getRuntimeKey()) setDetail({ accounts, selection, configuration: config });
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
    const previousIndex = request.action === 'automatic' ? -1
      : detail?.accounts.accounts.findIndex((account) => account.credentialRef === request.credentialRef) ?? -1;
    const previous = detail?.accounts.accounts[previousIndex];
    setAccountBusyId(request.action === 'automatic' ? 'automatic' : request.credentialRef);
    setAccountError(null);
    try {
      const next = await canonicalClient.mutateProviderAccount(workspaceId, provider.providerId, request);
      const selection = await canonicalClient.providerAccountSelection(workspaceId, provider.providerId);
      if (!current()) return;
      setDetail((value) => value ? { ...value, accounts: next, selection } : value);
      if (request.action === 'automatic') {
        toast.success(t('settings.providers.accounts.selection.enabled'));
        await onRefresh();
      } else if (request.action === 'select') {
        toast.success(t('settings.providers.accounts.toast.switched', {
          account: previous ? providerAccountName(previous, previousIndex, t) : '',
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
          : request.action === 'select' || request.action === 'automatic'
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
  const canEditConfiguration = Boolean((detail.configuration?.native || detail.configuration?.configuration) && !enterprise);
  if (editing && detail.configuration && canEditConfiguration) {
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
        onDeleteProvider={!detail.configuration.native?.isBuiltIn ? async () => {
          await onDeleteProvider(provider.providerId);
          setEditing(false);
        } : undefined}
        onResetOverrides={detail.configuration.native?.isBuiltIn && detail.configuration.native?.hasNativeEntry ? async () => {
          await onResetOverrides(provider.providerId);
          setEditing(false);
        } : undefined}
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
            {canEditConfiguration ? (
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
            selection={detail.selection}
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
            <div className="space-y-1">
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

  React.useEffect(() => {
    if (!connectRequested) return;
    if (current) {
      setCandidate('');
      setSelected(enterprise ? '' : ADD_PROVIDER_ID);
      useUIStore.getState().setSettingsProvidersConnectRequested(false);
    }
  }, [connectRequested, current, enterprise]);

  React.useEffect(() => {
    if (!classificationRequested || !current) return;
    setCandidate('');
    setSelected(CLASSIFICATION_PAGE_ID);
    useUIStore.getState().setSettingsProvidersClassificationRequested(false);
  }, [classificationRequested, current]);

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

  const openProvider = (providerId: string) => {
    setAddKeyFor(null);
    if (providers.some((entry) => entry.providerId === providerId)) {
      setCandidate('');
      setSelected(providerId);
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
    const providerId = plan.providerId;
    setBusy(true);
    try {
      let result: ProviderMutationResult;
      try {
        result = await canonicalClient.configureProvider(workspaceId, providerId, plan.request);
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

      if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;
      setPartialProvider(keyFailed ? result.providerId : null);
      setCandidate('');
      await store.getState().refresh();
      if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;
      setSelected(result.providerId);
      if (keyFailed) toast.error(t('settings.providers.page.custom.authFailure.keyAfterConfig'));
      else toast.success(t('settings.providers.page.toast.customProviderSaved', { provider: plan.providerName }));
    } finally {
      if (runtime === getRuntimeKey()) setBusy(false);
    }
  };

  const deleteCustomProvider = async (providerId: string) => {
    if (!state.workspaceId || !current || enterprise || busy) throw new Error('Provider settings are not writable');
    const workspaceId = state.workspaceId;
    const runtime = getRuntimeKey();
    const expectedRevision = state.providers?.revision ?? '0';
    setBusy(true);
    try {
      await canonicalClient.deleteProvider(workspaceId, providerId, {
        expectedRevision,
        providerId,
      });
      if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;
      setPartialProvider(null);
      setCandidate('');
      setSelected('');
      await store.getState().refresh();
    } finally {
      if (runtime === getRuntimeKey()) setBusy(false);
    }
  };

  const resetBuiltInOverrides = async (providerId: string) => {
    if (!state.workspaceId || !current || enterprise || busy) throw new Error('Provider settings are not writable');
    const workspaceId = state.workspaceId;
    const runtime = getRuntimeKey();
    const expectedRevision = state.providers?.revision ?? '0';
    setBusy(true);
    try {
      await canonicalClient.configureProvider(workspaceId, providerId, {
        expectedRevision,
        native: {
          providerId,
          baseUrl: null,
          api: null,
          configApiKey: null,
          auth: null,
          authHeader: null,
          headers: {},
          compat: null,
          disableStrictTools: null,
          transport: null,
          guardrailIdentifier: null,
          guardrailVersion: null,
          guardrailTrace: null,
          requestMetadata: null,
          discovery: null,
          remoteCompaction: null,
          models: [],
          modelOverrides: {},
        },
      });
      if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;
      await store.getState().refresh();
    } finally {
      if (runtime === getRuntimeKey()) setBusy(false);
    }
  };

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

  const markAuthWriteSucceeded = async (providerId: string) => {
    const runtime = getRuntimeKey();
    const workspaceId = store.getState().workspaceId;
    setPartialProvider(null);
    setCandidate('');
    await store.getState().refresh();
    if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;
    setSelected(providerId);
  };

  const writeCandidateKey = async (apiKey: string) => {
    if (!state.workspaceId || !state.providers || !current || enterprise) throw new Error('Provider settings are not writable');
    await canonicalClient.writeProviderCredential(state.workspaceId, candidate, {
      expectedRevision: state.providers.revision,
      providerId: candidate,
      credential: { method: 'api-key', apiKey },
    });
    await markAuthWriteSucceeded(candidate);
  };

  if (selected === CLASSIFICATION_PAGE_ID) {
    return (
      <ClassificationProvidersPage
        titleLeading={<SettingsBackButton label={t('settings.providers.page.back')} onClick={backToGrid} />}
        onOpenProvider={openProvider}
      />
    );
  }

  if (!directory) {
    return (
      <SettingsPageLayout title={t('settings.page.providers.title')} showSaveStatus={false}>
        <p role="alert" className="typography-meta text-muted-foreground">{t('common.unavailable')}</p>
      </SettingsPageLayout>
    );
  }

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
          onDeleteProvider={deleteCustomProvider}
          onResetOverrides={resetBuiltInOverrides}
          onClearAuthFailure={() => setPartialProvider(null)}
          applyLogoPlan={applyLogoPlan}
          logoBusyId={logoBusyId}
        />
      </SettingsPageLayout>
    );
  }

  return (
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
  );
};
