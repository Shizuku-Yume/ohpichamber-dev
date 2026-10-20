import React from 'react';
import type { WebSearchMutationResult, WebSearchProviderEntry } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsFieldRow,
  SettingsRadioGroup,
  SettingsRadioOption,
  SettingsSection,
  SETTINGS_CALLOUT_TITLE_CLASS,
  SETTINGS_CONTROL_CLUSTER_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
  SETTINGS_SELECT_SIZE,
} from '@/components/sections/shared/SettingsSection';
import { getWebSearchScopeKey, useWebSearchStore, type WebSearchSnapshot } from '@/stores/useWebSearchStore';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';

/**
 * Settings → Web search: which native search provider the agent uses, the
 * fallback chain, the request timeout, and the write-only credential each
 * provider takes. Configuration belongs to the selected agent directory; the
 * worker is authoritative and every write is applied with a revision CAS.
 */

type Selection =
  | { kind: 'off' }
  | { kind: 'default' }
  | { kind: 'provider'; id: string };

const currentSelection = (snapshot: WebSearchSnapshot): Selection => {
  if (!snapshot.enabled) return { kind: 'off' };
  if (snapshot.selectedProviderId === null) return { kind: 'default' };
  return { kind: 'provider', id: snapshot.selectedProviderId };
};

const sameSelection = (a: Selection, b: Selection): boolean =>
  a.kind === b.kind && (a.kind !== 'provider' || (b.kind === 'provider' && a.id === b.id));

/** Sentinel for the add-fallback select; it never leaves the control. */
const ADD_FALLBACK_VALUE = '__add-fallback__';

const SelectionSection: React.FC<{ snapshot: WebSearchSnapshot }> = ({ snapshot }) => {
  const { t } = useI18n();
  const update = useWebSearchStore((store) => store.update);
  const busy = useWebSearchStore((store) => store.busy);
  const selected = currentSelection(snapshot);
  const selectedProvider = snapshot.selectedProviderId === null
    ? null
    : snapshot.providers.find((provider) => provider.providerId === snapshot.selectedProviderId) ?? null;
  // A provider from the persisted configuration that the native catalog no
  // longer offers stays visible so the user can see why search does not run.
  const missingProvider = selected.kind === 'provider' && selectedProvider === null ? selected.id : null;
  const availableFallbacks = snapshot.providers.filter(
    (provider) => provider.providerId !== snapshot.selectedProviderId
      && !snapshot.fallbackProviderIds.includes(provider.providerId),
  );

  const commit = async (changes: Parameters<typeof update>[0]): Promise<void> => {
    if (!(await update(changes))) toast.error(t('settings.webSearch.toast.saveFailed'));
  };

  const choose = (selection: Selection): void => {
    if (busy || sameSelection(selection, selected)) return;
    if (selection.kind === 'off') {
      void commit({ enabled: false });
      return;
    }
    if (selection.kind === 'default') {
      void commit({ enabled: true, selectedProviderId: null });
      return;
    }
    // Removing the new primary from the fallback chain keeps the same CAS
    // write and honours the contract's primary-not-fallback rule.
    void commit({
      enabled: true,
      selectedProviderId: selection.id,
      fallbackProviderIds: snapshot.fallbackProviderIds.filter((providerId) => providerId !== selection.id),
    });
  };

  const [timeoutDraft, setTimeoutDraft] = React.useState(String(snapshot.timeoutSeconds));
  React.useEffect(() => {
    setTimeoutDraft(String(snapshot.timeoutSeconds));
  }, [snapshot.timeoutSeconds]);
  const timeoutValue = Number(timeoutDraft);
  const timeoutValid = timeoutDraft.trim().length > 0
    && Number.isFinite(timeoutValue)
    && timeoutValue >= 0.001
    && timeoutValue <= 300;

  return (
    <SettingsSection
      title={t('settings.webSearch.section.provider')}
      info={t('settings.webSearch.section.providerInfo')}
      divider={false}
      settingsItem="web-search.provider"
    >
      <div className="space-y-4">
        <div>
          <SettingsRadioGroup aria-label={t('settings.webSearch.section.provider')}>
            <SettingsRadioOption
              selected={selected.kind === 'default'}
              onSelect={() => choose({ kind: 'default' })}
              disabled={busy}
              ariaLabel={t('settings.webSearch.option.default')}
              label={t('settings.webSearch.option.default')}
              description={t('settings.webSearch.option.defaultDescription')}
            />
            {snapshot.providers.map((provider) => (
              <SettingsRadioOption
                key={provider.providerId}
                selected={selected.kind === 'provider' && selected.id === provider.providerId}
                onSelect={() => choose({ kind: 'provider', id: provider.providerId })}
                disabled={busy}
                ariaLabel={provider.name}
                label={provider.name}
              />
            ))}
            {missingProvider ? (
              <SettingsRadioOption
                selected
                onSelect={() => undefined}
                disabled={busy}
                ariaLabel={missingProvider}
                label={missingProvider}
                description={t('settings.webSearch.option.missing')}
              />
            ) : null}
            <SettingsRadioOption
              selected={selected.kind === 'off'}
              onSelect={() => choose({ kind: 'off' })}
              disabled={busy}
              ariaLabel={t('settings.webSearch.option.off')}
              label={t('settings.webSearch.option.off')}
            />
          </SettingsRadioGroup>
          {snapshot.providers.length === 0 ? (
            <p className={`${SETTINGS_HELPER_CLASS} mt-2`}>{t('settings.webSearch.native.noProviders')}</p>
          ) : null}
        </div>

        <SettingsFieldRow
          label={t('settings.webSearch.native.fallbacks')}
          info={t('settings.webSearch.native.fallbackInfo')}
          settingsItem="web-search.fallbacks"
        >
          <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} space-y-2`}>
            {snapshot.fallbackProviderIds.length > 0 ? (
              <div className="space-y-2">
                {snapshot.fallbackProviderIds.map((providerId) => {
                  const fallbackName = snapshot.providers.find((provider) => provider.providerId === providerId)?.name ?? providerId;
                  return (
                    <div key={providerId} className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate typography-ui-label text-foreground">{fallbackName}</span>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={busy}
                        aria-label={t('settings.webSearch.native.removeFallback', { provider: fallbackName })}
                        onClick={() => void commit({
                          fallbackProviderIds: snapshot.fallbackProviderIds.filter((value) => value !== providerId),
                        })}
                      >
                        {t('settings.webSearch.keys.remove')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <Select
              value={ADD_FALLBACK_VALUE}
              disabled={busy || availableFallbacks.length === 0}
              onValueChange={(value) => {
                if (value === ADD_FALLBACK_VALUE) return;
                void commit({ fallbackProviderIds: [...snapshot.fallbackProviderIds, value] });
              }}
            >
              <SelectTrigger
                size={SETTINGS_SELECT_SIZE}
                className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}
                aria-label={t('settings.webSearch.native.addFallback')}
              >
                <SelectValue>{() => t('settings.webSearch.native.addFallback')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ADD_FALLBACK_VALUE}>{t('settings.webSearch.native.addFallback')}</SelectItem>
                {availableFallbacks.map((provider) => (
                  <SelectItem key={provider.providerId} value={provider.providerId}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow
          label={t('settings.webSearch.native.timeout')}
          settingsItem="web-search.timeout"
        >
          <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex items-center gap-2`}>
            <Input
              type="number"
              min={0.001}
              max={300}
              step="any"
              value={timeoutDraft}
              disabled={busy}
              onChange={(event) => setTimeoutDraft(event.target.value)}
              aria-label={t('settings.webSearch.native.timeout')}
              className="h-8 min-w-0 flex-1"
            />
            <Button
              size="xs"
              disabled={busy || !timeoutValid || timeoutValue === snapshot.timeoutSeconds}
              onClick={() => void commit({ timeoutSeconds: timeoutValue })}
            >
              {t('settings.webSearch.keys.save')}
            </Button>
          </div>
        </SettingsFieldRow>
      </div>
    </SettingsSection>
  );
};

const ProviderKeyRow: React.FC<{ provider: WebSearchProviderEntry }> = ({ provider }) => {
  const { t } = useI18n();
  const saveKey = useWebSearchStore((store) => store.saveKey);
  const removeKey = useWebSearchStore((store) => store.removeKey);
  const busy = useWebSearchStore((store) => store.busy);
  const enterprise = useEnterpriseMode();
  const canWrite = provider.credentialWritable && !enterprise;
  const [draft, setDraft] = React.useState('');

  const handleSave = async () => {
    const key = draft.trim();
    if (!key || busy || !canWrite) return;
    const ok = await saveKey(provider.providerId, key);
    if (ok) {
      setDraft('');
      toast.success(t('settings.webSearch.toast.keySaved', { provider: provider.name }));
    } else {
      toast.error(t('settings.webSearch.toast.keySaveFailed'));
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    const ok = await removeKey(provider.providerId);
    if (!ok) toast.error(t('settings.webSearch.toast.keyRemoveFailed'));
  };

  return (
    <SettingsFieldRow
      label={provider.name}
      description={t(provider.configured ? 'settings.webSearch.native.configured' : 'settings.webSearch.native.unconfigured')}
    >
      {provider.credentialConfigured ? (
        <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex items-center justify-end gap-2`}>
          <span className="typography-meta text-muted-foreground">{t('settings.webSearch.keys.saved')}</span>
          <Button variant="outline" size="xs" disabled={busy} onClick={() => void handleRemove()}>
            {t('settings.webSearch.keys.remove')}
          </Button>
        </div>
      ) : canWrite ? (
        <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex items-center gap-2`}>
          <Input
            type="password"
            autoComplete="off"
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSave();
            }}
            placeholder={t('settings.webSearch.keys.placeholder')}
            aria-label={t('settings.webSearch.keys.inputAria', { provider: provider.name })}
            className="h-8 min-w-0 flex-1 rounded-md px-3 font-mono text-xs"
          />
          <Button size="xs" disabled={busy || draft.trim().length === 0} onClick={() => void handleSave()}>
            {t('settings.webSearch.keys.save')}
          </Button>
        </div>
      ) : null}
    </SettingsFieldRow>
  );
};

const KeysSection: React.FC<{ snapshot: WebSearchSnapshot }> = ({ snapshot }) => {
  const { t } = useI18n();
  // Enterprise mode: the runtime refuses new keys; saved keys can still be
  // removed. There is no env-name metadata in the native contract, so the
  // only key state shown is the provider's write-only credential flag.
  const enterprise = useEnterpriseMode();

  return (
    <SettingsSection
      title={t('settings.webSearch.section.keys')}
      info={t('settings.webSearch.native.keyInfo')}
      settingsItem="web-search.keys"
    >
      <div className="space-y-4">
        {enterprise ? <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.native.enterprise')}</p> : null}
        {snapshot.providers.length === 0 ? (
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.native.noProviders')}</p>
        ) : (
          snapshot.providers.map((provider) => <ProviderKeyRow key={provider.providerId} provider={provider} />)
        )}
      </div>
    </SettingsSection>
  );
};

const OutcomeSection: React.FC<{ outcome: WebSearchMutationResult }> = ({ outcome }) => {
  const { t } = useI18n();
  const failedWorkers = outcome.workers.filter((worker) => worker.status === 'failed');
  return (
    <SettingsSection divider={false} settingsItem="web-search.outcome">
      <div role="alert" className="space-y-1.5">
        <p className={SETTINGS_CALLOUT_TITLE_CLASS}>{t('settings.webSearch.native.partial')}</p>
        {outcome.persistence === 'failed' ? (
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.native.persistenceFailed')}</p>
        ) : null}
        {failedWorkers.map((worker) => (
          <p key={`${worker.sessionId}:${worker.workerGeneration}`} className={SETTINGS_HELPER_CLASS}>
            {t('settings.webSearch.native.workerFailed', {
              session: worker.sessionId,
              code: worker.code ?? '—',
            })}
          </p>
        ))}
      </div>
    </SettingsSection>
  );
};

export const WebSearchPage: React.FC = () => {
  const { t } = useI18n();
  const state = useWebSearchStore((store) => store.state);
  const error = useWebSearchStore((store) => store.error);
  const outcome = useWebSearchStore((store) => store.outcome);
  const load = useWebSearchStore((store) => store.load);

  // Read on open, and again when the page is opened for another project or
  // runtime (the snapshot is scoped to both).
  const scope = getWebSearchScopeKey();
  React.useEffect(() => {
    void load();
  }, [load, scope]);

  const snapshot = state.kind === 'ready' && state.snapshot.scope === scope ? state.snapshot : null;
  const failed = state.kind === 'failed';
  const partial = outcome !== null
    && (outcome.status !== 'applied'
      || outcome.persistence !== 'persisted'
      || outcome.workers.some((worker) => worker.status === 'failed'));

  return (
    <SettingsPageLayout
      title={t('settings.page.webSearch.title')}
      description={t('settings.page.webSearch.description')}
      showSaveStatus
    >
      {error !== null || failed ? (
        <SettingsSection divider={false}>
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="typography-meta text-[var(--status-error)]">
              {t(error === 'write' ? 'settings.webSearch.toast.saveFailed' : 'settings.webSearch.native.loadFailed')}
            </p>
            <Button variant="outline" size="xs" onClick={() => void load()}>
              {t('settings.webSearch.actions.retry')}
            </Button>
          </div>
        </SettingsSection>
      ) : null}
      {snapshot ? (
        <>
          {partial && outcome ? <OutcomeSection outcome={outcome} /> : null}
          <SelectionSection key={scope} snapshot={snapshot} />
          <KeysSection snapshot={snapshot} />
        </>
      ) : failed || error !== null ? null : (
        <SettingsSection divider={false}>
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.state.loading')}</p>
        </SettingsSection>
      )}
    </SettingsPageLayout>
  );
};
