import React from 'react';
import type { WebSearchProviderEntry } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';
import { useI18n } from '@/lib/i18n';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsFieldRow, SettingsSection, SETTINGS_CONTROL_CLUSTER_CLASS, SETTINGS_HELPER_CLASS } from '@/components/sections/shared/SettingsSection';
import { getWebSearchScopeKey, useWebSearchStore, type WebSearchSnapshot } from '@/stores/useWebSearchStore';

const ProviderKeyRow: React.FC<{ provider: WebSearchProviderEntry }> = ({ provider }) => {
  const { t } = useI18n();
  const saveKey = useWebSearchStore((store) => store.saveKey);
  const removeKey = useWebSearchStore((store) => store.removeKey);
  const enterprise = useEnterpriseMode();
  const canWrite = provider.credentialWritable && !enterprise;
  const busy = useWebSearchStore((store) => store.busy);
  const [draft, setDraft] = React.useState('');
  return <SettingsFieldRow label={provider.name}>
    <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex items-center gap-2`}>
      <Input type="password" autoComplete="off" disabled={busy || !canWrite} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('settings.webSearch.keys.placeholder')} aria-label={t('settings.webSearch.keys.inputAria', { provider: provider.name })} className="h-8 min-w-0 flex-1" />
      <Button size="xs" disabled={busy || !canWrite || !draft.trim()} onClick={() => { const key = draft.trim(); setDraft(''); void saveKey(provider.providerId, key).then((ok) => { if (!ok) toast.error(t('settings.webSearch.toast.keySaveFailed')); }); }}>{t('settings.webSearch.keys.save')}</Button>
      <Button variant="outline" size="xs" disabled={busy || !provider.credentialConfigured} onClick={() => void removeKey(provider.providerId).then((ok) => { if (!ok) toast.error(t('settings.webSearch.toast.keyRemoveFailed')); })}>{t('settings.webSearch.keys.remove')}</Button>
    </div>
  </SettingsFieldRow>;
};

const SearchSettings: React.FC<{ snapshot: WebSearchSnapshot }> = ({ snapshot }) => {
  const { t } = useI18n();
  const enterprise = useEnterpriseMode();
  const update = useWebSearchStore((store) => store.update);
  const busy = useWebSearchStore((store) => store.busy);
  const [timeout, setTimeout] = React.useState(String(snapshot.timeoutSeconds));
  React.useEffect(() => { setTimeout(String(snapshot.timeoutSeconds)); }, [snapshot.timeoutSeconds]);
  const commit = async (changes: Parameters<typeof update>[0]) => {
    if (!(await update(changes))) toast.error(t('settings.webSearch.toast.saveFailed'));
  };
  const timeoutValue = Number(timeout);
  const timeoutValid = Number.isFinite(timeoutValue) && timeoutValue > 0 && timeoutValue <= 300;
  const availableFallbacks = snapshot.providers.filter((provider) => provider.providerId !== snapshot.selectedProviderId && !snapshot.fallbackProviderIds.includes(provider.providerId));
  return <>
    <SettingsSection title={t('settings.webSearch.section.provider')} info={t('settings.webSearch.native.info')} divider={false} settingsItem="web-search.provider">
      <div className="space-y-3">
        {enterprise ? <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.native.enterprise')}</p> : null}
        <SettingsFieldRow label={t('settings.webSearch.native.enabled')}>
          <input type="checkbox" checked={snapshot.enabled} disabled={busy} onChange={(event) => void commit({ enabled: event.target.checked })} aria-label={t('settings.webSearch.native.enabled')} />
        </SettingsFieldRow>
        <SettingsFieldRow label={t('settings.webSearch.section.provider')}>
          <select className="h-8 rounded-md border border-border bg-background px-2" value={snapshot.selectedProviderId ?? ''} disabled={busy} onChange={(event) => { const selectedProviderId = event.target.value || null; void commit({ selectedProviderId, fallbackProviderIds: snapshot.fallbackProviderIds.filter((providerId) => providerId !== selectedProviderId) }); }} aria-label={t('settings.webSearch.section.provider')}>
            <option value="">{t('settings.webSearch.option.default')}</option>
            {snapshot.selectedProviderId && !snapshot.providers.some((provider) => provider.providerId === snapshot.selectedProviderId) ? <option value={snapshot.selectedProviderId}>{snapshot.selectedProviderId}</option> : null}
            {snapshot.providers.map((provider) => <option key={provider.providerId} value={provider.providerId}>{provider.name}</option>)}
          </select>
        </SettingsFieldRow>
        <SettingsFieldRow label={t('settings.webSearch.native.fallbacks')} info={t('settings.webSearch.native.fallbackInfo')}>
          <div className="space-y-2">
            <ol>{snapshot.fallbackProviderIds.map((providerId) => <li key={providerId} className="flex items-center gap-2"><span>{snapshot.providers.find((provider) => provider.providerId === providerId)?.name ?? providerId}</span><Button variant="outline" size="xs" disabled={busy} aria-label={t('settings.webSearch.native.removeFallback', { provider: providerId })} onClick={() => void commit({ fallbackProviderIds: snapshot.fallbackProviderIds.filter((value) => value !== providerId) })}>{t('settings.webSearch.keys.remove')}</Button></li>)}</ol>
            <select value="" disabled={busy || availableFallbacks.length === 0} onChange={(event) => { if (event.target.value) void commit({ fallbackProviderIds: [...snapshot.fallbackProviderIds, event.target.value] }); }} aria-label={t('settings.webSearch.native.fallbacks')} className="h-8 rounded-md border border-border bg-background px-2"><option value="">{t('settings.webSearch.native.addFallback')}</option>{availableFallbacks.map((provider) => <option key={provider.providerId} value={provider.providerId}>{provider.name}</option>)}</select>
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label={t('settings.webSearch.native.timeout')}>
          <div className="flex items-center gap-2"><Input type="number" min={0.001} max={300} step="any" value={timeout} disabled={busy} onChange={(event) => setTimeout(event.target.value)} aria-label={t('settings.webSearch.native.timeout')} className="h-8 w-24" /><Button size="xs" disabled={busy || !timeoutValid || timeoutValue === snapshot.timeoutSeconds} onClick={() => void commit({ timeoutSeconds: timeoutValue })}>{t('settings.webSearch.keys.save')}</Button></div>
        </SettingsFieldRow>
      </div>
    </SettingsSection>
    <SettingsSection title={t('settings.webSearch.section.keys')} info={t('settings.webSearch.native.keyInfo')} settingsItem="web-search.keys">
      <div className="space-y-4">
        {snapshot.providers.map((provider) => <div key={provider.providerId}>
          <p className={SETTINGS_HELPER_CLASS}>{provider.name}: {provider.configured ? t('settings.webSearch.native.configured') : t('settings.webSearch.native.unconfigured')}</p>
          {provider.credentialConfigured ? <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.keys.saved')}</p> : null}
          {provider.credentialWritable ? <ProviderKeyRow provider={provider} /> : null}
        </div>)}
        {snapshot.providers.length === 0 ? <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.native.noProviders')}</p> : null}
      </div>
    </SettingsSection>
  </>;
};

export const WebSearchPage: React.FC = () => {
  const { t } = useI18n();
  const state = useWebSearchStore((store) => store.state);
  const error = useWebSearchStore((store) => store.error);
  const outcome = useWebSearchStore((store) => store.outcome);
  const load = useWebSearchStore((store) => store.load);
  const scope = getWebSearchScopeKey();
  React.useEffect(() => { void load(); }, [load, scope]);
  const snapshot = state.kind === 'ready' && state.snapshot.scope === scope ? state.snapshot : null;
  const partial = outcome && (outcome.status !== 'applied' || outcome.persistence !== 'persisted' || outcome.workers.some((worker) => worker.status === 'failed'));
  return <SettingsPageLayout title={t('settings.page.webSearch.title')} description={t('settings.page.webSearch.description')} showSaveStatus>
    {error ? <p role="alert" className="typography-meta text-[var(--status-error)]">{t(error === 'read' ? 'settings.webSearch.native.loadFailed' : 'settings.webSearch.toast.saveFailed')}<Button variant="outline" size="xs" onClick={() => void load()}>{t('settings.webSearch.actions.retry')}</Button></p> : null}
    {snapshot ? <>
      {partial ? <div role="alert" className="typography-meta text-[var(--status-error)]"><p>{t('settings.webSearch.native.partial')}</p>{outcome.persistence === 'failed' ? <p>{t('settings.webSearch.native.persistenceFailed')}</p> : null}<ul>{outcome.workers.filter((worker) => worker.status === 'failed').map((worker) => <li key={`${worker.sessionId}:${worker.workerGeneration}`}>{t('settings.webSearch.native.workerFailed', { session: worker.sessionId, code: worker.code ?? '—' })}</li>)}</ul></div> : null}
      <SearchSettings key={scope} snapshot={snapshot} />
    </> : <SettingsSection divider={false}><p className={SETTINGS_HELPER_CLASS}>{t(state.kind === 'failed' ? 'settings.webSearch.native.loadFailed' : 'settings.webSearch.state.loading')}</p></SettingsSection>}
  </SettingsPageLayout>;
};
