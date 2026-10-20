import React from 'react';
import { useStore } from 'zustand';
import type { Provider, Model, ProviderAccounts as Accounts, ProviderConfigurationRead, ProviderOAuthMethods as Methods } from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { createProviderSettingsStore } from '@/stores/useProviderSettingsStore';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useUIStore } from '@/stores/useUIStore';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';
import { getRuntimeKey, subscribeRuntimeEndpointChanged, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsSection } from '@/components/sections/shared/SettingsSection';
import { SettingsBackButton } from '@/components/sections/shared/SettingsCards';
import { ClassificationProvidersPage } from '@/components/sections/classification/ClassificationProvidersPage';
import { ProviderGrid } from './ProviderGrid';
import { ProviderAccounts } from './ProviderAccounts';
import { ProviderApiKeyForm } from './ProviderApiKeyForm';
import { ProviderOAuthMethods } from './ProviderOAuthMethods';
import { CustomProviderForm } from './CustomProviderForm';
import { hasCanonicalStoredCredential, oauthMethodsForProvider } from './providerAuth';
import type { CustomProviderPersistPlan } from './custom-provider-form';

const ADD_PROVIDER_ID = '__add_provider__';
const CLASSIFICATION_PAGE_ID = '__classification__';

type Detail = { accounts: Accounts; configuration: ProviderConfigurationRead | null; methods: Methods };

function ProviderDetail({ workspaceId, revision, provider, models, existingIds, enterprise, busy, initialEdit, onRefresh, onSave, onDisconnect }: {
  workspaceId: string; revision: string; provider: Provider; models: Model[]; existingIds: ReadonlySet<string>;
  enterprise: boolean; busy: boolean; initialEdit: boolean; onRefresh: () => Promise<void>;
  onSave: (plan: CustomProviderPersistPlan) => Promise<void>; onDisconnect: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [editing, setEditing] = React.useState(initialEdit);
  const [query, setQuery] = React.useState('');
  const hiddenModels = useUIStore((state) => state.hiddenModels);
  const toggleHiddenModel = useUIStore((state) => state.toggleHiddenModel);
  const hideAllModels = useUIStore((state) => state.hideAllModels);
  const showAllModels = useUIStore((state) => state.showAllModels);
  React.useEffect(() => {
    let active = true;
    const runtime = getRuntimeKey();
    setFailed(false);
    const configuration = canonicalClient.providerConfiguration(workspaceId, provider.providerId).catch((error: unknown) => {
      if (error instanceof CanonicalApiError && error.problem.code === 'PROVIDER_UNAVAILABLE') return null;
      throw error;
    });
    void Promise.all([canonicalClient.providerAccounts(workspaceId, provider.providerId), configuration,
      canonicalClient.providerOAuthMethods(workspaceId)]).then(([accounts, config, methods]) => {
      if (active && runtime === getRuntimeKey()) setDetail({ accounts, configuration: config, methods });
    }).catch(() => { if (active && runtime === getRuntimeKey()) setFailed(true); });
    return () => { active = false; };
  }, [workspaceId, provider.providerId, revision, retry]);

  if (failed) return <div className="space-y-3"><p role="alert">{t('settings.providers.page.state.unableToLoadProviderList')}</p>
    <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>{t('settings.providers.page.actions.tryAgain')}</Button></div>;
  if (!detail) return <p role="status">{t('settings.providers.page.state.loading')}</p>;
  if (editing && detail.configuration && !enterprise) return <CustomProviderForm key={`${provider.providerId}:${detail.configuration.revision}`}
    workspaceId={workspaceId} revision={detail.configuration.revision} initial={detail.configuration} existingProviderIDs={existingIds}
    busy={busy} onCancel={() => setEditing(false)} onSubmit={async (plan) => { await onSave(plan); setEditing(false); }} />;

  const providerModels = models.filter((model) => model.provider === provider.providerId);
  const methods = oauthMethodsForProvider(detail.methods.methods, provider.providerId);
  const hidden = new Set(hiddenModels.filter((model) => model.providerID === provider.providerId).map((model) => model.modelID));
  return <>
    <SettingsSection title={t('settings.providers.accounts.title')} description={t('settings.providers.accounts.info')}>
      <ProviderAccounts roster={detail.accounts} disabled={busy} onMutate={async (input) => {
        await canonicalClient.mutateProviderAccount(workspaceId, provider.providerId, input);
        await onRefresh();
      }} />
      {provider.auth.status === 'configured' && provider.auth.source !== 'stored-credential' && <p className="text-sm text-muted-foreground">{t('settings.providers.card.status.environment')}</p>}
    </SettingsSection>
    {!enterprise && <SettingsSection title={t('settings.providers.page.auth.title')}>
      <div className="space-y-4">
        {methods.length > 0 && <ProviderOAuthMethods key={provider.providerId} workspaceId={workspaceId} revision={revision} methods={methods} onConnected={onRefresh} disabled={busy} />}
        {provider.authMethods.includes('api-key') && <ProviderApiKeyForm disabled={busy} writeCanonicalKey={async (apiKey) => {
          await canonicalClient.writeProviderCredential(workspaceId, provider.providerId, { expectedRevision: revision, providerId: provider.providerId, credential: { method: 'api-key', apiKey } });
          await onRefresh();
        }} />}
      </div>
    </SettingsSection>}
    <div className="flex flex-wrap gap-2 py-3">
      {!enterprise && detail.configuration && <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>{t('settings.providers.page.actions.edit')}</Button>}
      {(hasCanonicalStoredCredential(provider) || detail.configuration) && <Button variant="outline" disabled={busy} onClick={() => void onDisconnect().catch(() => toast.error(t('settings.providers.page.toast.providerDisconnectFailed')))}>{t('settings.providers.page.actions.disconnect')}</Button>}
    </div>
    <SettingsSection title={t('settings.providers.page.models.title')}>
      <div className="space-y-3">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('settings.providers.page.models.filterPlaceholder')} />
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => hideAllModels(provider.providerId, providerModels.map((model) => model.modelId))}>{t('settings.providers.page.actions.hideAll')}</Button>
          <Button size="sm" variant="ghost" onClick={() => showAllModels(provider.providerId)}>{t('settings.providers.page.actions.showAll')}</Button>
        </div>
        {providerModels.filter((model) => `${model.name} ${model.modelId}`.toLowerCase().includes(query.toLowerCase())).map((model) => <div key={model.modelId} className="flex items-center justify-between gap-2 rounded-lg border p-3">
          <div className="min-w-0 text-sm"><p className="break-words font-medium">{model.name}</p><p className="break-all text-xs text-muted-foreground">{model.modelId}</p>
            <p className="text-xs text-muted-foreground">{t('settings.providers.page.custom.discovery.contextValue', { value: model.contextWindow })} · {t('settings.providers.page.custom.discovery.outputValue', { value: model.maxOutputTokens })}</p></div>
          <Button size="sm" variant="ghost" onClick={() => toggleHiddenModel(provider.providerId, model.modelId)}>{t(hidden.has(model.modelId) ? 'settings.providers.page.models.actions.showModel' : 'settings.providers.page.models.actions.hideModel')}</Button>
        </div>)}
      </div>
    </SettingsSection>
  </>;
}

export const ProvidersPage: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const enterprise = useEnterpriseMode();
  const [store] = React.useState(() => createProviderSettingsStore());
  const state = useStore(store);
  const [selected, setSelected] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [partialProvider, setPartialProvider] = React.useState<string | null>(null);
  const connectRequested = useUIStore((value) => value.settingsProvidersConnectRequested);
  const openRequested = useUIStore((value) => value.settingsProvidersOpenRequested);
  const classificationRequested = useUIStore((value) => value.settingsProvidersClassificationRequested);
  React.useEffect(() => {
    if (connectRequested) { setSelected(ADD_PROVIDER_ID); useUIStore.getState().setSettingsProvidersConnectRequested(false); }
    else if (classificationRequested) { setSelected(CLASSIFICATION_PAGE_ID); useUIStore.getState().setSettingsProvidersClassificationRequested(false); }
    else if (openRequested) { setSelected(openRequested); useUIStore.getState().setSettingsProvidersOpenRequested(null); }
  }, [connectRequested, classificationRequested, openRequested]);
  React.useEffect(() => {
    store.getState().reset();
    if (directory) void store.getState().load(directory);
    const before = subscribeRuntimeEndpointWillChange(() => { store.getState().reset(); setSelected(''); setPartialProvider(null); setBusy(false); });
    const after = subscribeRuntimeEndpointChanged(() => { if (directory) void store.getState().load(directory); });
    return () => { before(); after(); store.getState().reset(); };
  }, [directory, store]);

  const providers = state.providers?.providers ?? [];
  const provider = providers.find((entry) => entry.providerId === selected);
  const existingIds = new Set(providers.map((entry) => entry.providerId));
  const current = state.directory === directory && state.runtimeKey === getRuntimeKey();
  const save = async (plan: CustomProviderPersistPlan) => {
    if (!state.workspaceId || !current || enterprise || busy) return;
    const workspaceId = state.workspaceId;
    const runtime = getRuntimeKey();
    setBusy(true);
    try {
      const result = await canonicalClient.configureProvider(workspaceId, plan.request.configuration.providerId, plan.request);
      if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;
      let partial = false;
      if (plan.apiKey) {
        try { await canonicalClient.writeProviderCredential(workspaceId, result.providerId, {
          expectedRevision: result.revision, providerId: result.providerId, credential: { method: 'api-key', apiKey: plan.apiKey },
        }); } catch { partial = true; }
      }
      if (runtime !== getRuntimeKey() || store.getState().workspaceId !== workspaceId) return;
      setPartialProvider(partial ? result.providerId : null);
      setSelected(result.providerId);
      await store.getState().refresh();
      if (partial) toast.error(t('settings.providers.page.custom.authFailure.keyAfterConfig'));
      else toast.success(t('settings.providers.page.toast.customProviderSaved', { provider: plan.request.configuration.name }));
    } finally {
      if (runtime === getRuntimeKey()) setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!provider || !state.workspaceId || !state.providers || busy) return;
    const workspaceId = state.workspaceId;
    const runtime = getRuntimeKey();
    setBusy(true);
    try {
      if (hasCanonicalStoredCredential(provider) && provider.auth.status === 'configured') {
        await canonicalClient.deleteProviderCredential(workspaceId, provider.providerId, {
          expectedRevision: state.providers.revision, providerId: provider.providerId, credentialRef: provider.auth.credentialRef,
        });
      } else {
        await canonicalClient.deleteProvider(workspaceId, provider.providerId, { expectedRevision: state.providers.revision, providerId: provider.providerId });
      }
      if (runtime === getRuntimeKey() && store.getState().workspaceId === workspaceId) {
        setPartialProvider(null); await store.getState().refresh();
      }
    } finally { if (runtime === getRuntimeKey()) setBusy(false); }
  };

  if (selected === CLASSIFICATION_PAGE_ID) return <ClassificationProvidersPage titleLeading={<SettingsBackButton label={t('settings.providers.page.back')} onClick={() => setSelected('')} />} onOpenProvider={setSelected} />;
  return <SettingsPageLayout title={provider?.name ?? t(selected === ADD_PROVIDER_ID ? 'settings.providers.page.custom.title' : 'settings.providers.connect.all')}
    titleLeading={selected ? <SettingsBackButton label={t('settings.providers.page.back')} onClick={() => { setSelected(''); setPartialProvider(null); }} /> : undefined}
    description={!selected ? t('settings.providers.native.description') : undefined}
    headerEnd={!selected && !enterprise ? <Button onClick={() => setSelected(ADD_PROVIDER_ID)}>{t('settings.providers.page.custom.title')}</Button> : undefined}>
    {enterprise && <SettingsSection title={t('settings.providers.enterpriseTitle')}><p className="text-sm text-muted-foreground">{t('settings.providers.native.enterprise')}</p></SettingsSection>}
    {!directory || !current || (state.loading && !state.providers) ? <p role="status">{t('settings.providers.page.state.loading')}</p> : <>
      {state.error && <div className="space-y-2 py-3"><p role="alert">{t('settings.providers.page.state.unableToLoadProviderList')}</p><Button variant="outline" onClick={() => void state.refresh()}>{t('settings.providers.page.actions.tryAgain')}</Button></div>}
      {partialProvider === selected && <p role="alert" className="py-3 text-sm text-[var(--status-warning)]">{t('settings.providers.page.custom.authFailure.keyAfterConfig')}</p>}
      {selected === ADD_PROVIDER_ID && !enterprise && state.workspaceId && state.providers ? <CustomProviderForm workspaceId={state.workspaceId} revision={state.providers.revision}
        existingProviderIDs={existingIds} busy={busy} onCancel={() => setSelected('')} onSubmit={save} />
        : provider && state.workspaceId && state.providers ? <ProviderDetail key={`${state.runtimeKey}:${state.workspaceId}:${provider.providerId}`}
          workspaceId={state.workspaceId} revision={state.providers.revision} provider={provider} models={state.models?.models ?? []} existingIds={existingIds}
          enterprise={enterprise} busy={busy} initialEdit={partialProvider === provider.providerId} onRefresh={state.refresh} onSave={save} onDisconnect={disconnect} />
          : <ProviderGrid providers={providers} models={state.models?.models ?? []} onSelect={setSelected} />}
    </>}
  </SettingsPageLayout>;
};
