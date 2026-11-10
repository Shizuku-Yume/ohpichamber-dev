import React from 'react';
import type { WebSearchMutationResult, WebSearchProviderEntry } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsCardPill } from '@/components/sections/shared/SettingsCards';
import { reportSettingsSaveState } from '@/lib/persistence';
import {
 SettingsFieldRow,
 SettingsSection,
 SETTINGS_CALLOUT_TITLE_CLASS,
 SETTINGS_CONTROL_CLUSTER_CLASS,
 SETTINGS_HELPER_CLASS,
 SETTINGS_ICON_BUTTON_CLASS,
 SETTINGS_NUMBER_INPUT_CLASS,
 SETTINGS_NUMBER_STEPPER_ROW_CLASS,
 SETTINGS_NUMBER_UNIT_CLASS,
 SETTINGS_SELECT_ROW_TRIGGER_CLASS,
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

/** OMP's native `providers.webSearchTimeoutSeconds` default, used by the reset action. */
const DEFAULT_TIMEOUT_SECONDS = 60;

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
  reportSettingsSaveState('saving');
  const ok = await update(changes);
  if (ok) {
   reportSettingsSaveState('saved');
  } else {
   reportSettingsSaveState('error');
   toast.error(t('settings.webSearch.toast.saveFailed'));
  }
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


 return (
  <SettingsSection
   title={t('settings.webSearch.section.provider')}
   info={t('settings.webSearch.section.providerInfo')}
   divider={false}
   settingsItem="web-search.provider"
  >
   <div className="space-y-4">
    <SettingsFieldRow
     label={t('settings.webSearch.section.provider')}
     info={t('settings.webSearch.section.providerInfo')}
     settingsItem="web-search.provider"
    >
     <Select
      value={selected.kind === 'off' ? 'off' : selected.kind === 'default' ? 'default' : selected.id}
      disabled={busy}
      onValueChange={(val) => {
       if (val === 'off') choose({ kind: 'off' });
       else if (val === 'default') choose({ kind: 'default' });
       else choose({ kind: 'provider', id: val });
      }}
     >
      <SelectTrigger className={SETTINGS_SELECT_ROW_TRIGGER_CLASS} aria-label={t('settings.webSearch.section.provider')}>
       <SelectValue>
        {selected.kind === 'off'
         ? t('settings.webSearch.option.off')
         : selected.kind === 'default'
          ? t('settings.webSearch.option.default')
          : (selectedProvider?.name ?? selected.id)}
       </SelectValue>
      </SelectTrigger>
      <SelectContent>
       <SelectItem value="default">{t('settings.webSearch.option.default')}</SelectItem>
       {snapshot.providers.map((p) => (
        <SelectItem key={p.providerId} value={p.providerId}>{p.name}</SelectItem>
       ))}
       {missingProvider ? (
        <SelectItem value={missingProvider}>{missingProvider}</SelectItem>
       ) : null}
       <SelectItem value="off">{t('settings.webSearch.option.off')}</SelectItem>
      </SelectContent>
     </Select>
    </SettingsFieldRow>

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
        className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}
        aria-label={t('settings.webSearch.native.addFallback')}
       >
        <SelectValue placeholder={t('settings.webSearch.native.addFallback')}>
         {t('settings.webSearch.native.addFallback')}
        </SelectValue>
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
     <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
      <NumberInput
       value={snapshot.timeoutSeconds}
       onValueChange={(value) => {
        if (!Number.isFinite(value) || value < 1 || value > 300) return;
        void commit({ timeoutSeconds: value });
       }}
       min={1}
       max={300}
       step={1}
       disabled={busy}
       className={SETTINGS_NUMBER_INPUT_CLASS}
       aria-label={t('settings.webSearch.native.timeout')}
      />
      <span className={SETTINGS_NUMBER_UNIT_CLASS} aria-hidden="true">{t('settings.webSearch.native.timeoutUnit')}</span>
      <Button
       variant="ghost"
       size="icon"
       className={SETTINGS_ICON_BUTTON_CLASS}
       disabled={busy || snapshot.timeoutSeconds === DEFAULT_TIMEOUT_SECONDS}
       onClick={() => void commit({ timeoutSeconds: DEFAULT_TIMEOUT_SECONDS })}
       aria-label={t('settings.webSearch.native.resetTimeout')}
       title={t('settings.common.actions.reset')}
      >
       <Icon name="restart" className="size-3.5" />
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
 const [showPassword, setShowPassword] = React.useState(false);
 const [expanded, setExpanded] = React.useState(!provider.credentialConfigured);

 const handleSave = async () => {
  const key = draft.trim();
  if (!key || busy || !canWrite) return;
  reportSettingsSaveState('saving');
  const ok = await saveKey(provider.providerId, key);
  if (ok) {
   setDraft('');
   reportSettingsSaveState('saved');
   toast.success(t('settings.webSearch.toast.keySaved', { provider: provider.name }));
  } else {
   reportSettingsSaveState('error');
   toast.error(t('settings.webSearch.toast.keySaveFailed'));
  }
 };

 const handleRemove = async () => {
  if (busy) return;
  reportSettingsSaveState('saving');
  const ok = await removeKey(provider.providerId);
  if (ok) {
   reportSettingsSaveState('saved');
  } else {
   reportSettingsSaveState('error');
   toast.error(t('settings.webSearch.toast.keyRemoveFailed'));
  }
 };

 return (
  <div className="rounded-lg border border-border/50 bg-[var(--surface-subtle)] p-3">
   <div className="flex items-center justify-between gap-2">
    <button
     type="button"
     onClick={() => setExpanded(!expanded)}
     className="flex min-w-0 flex-1 items-center gap-2 text-start"
    >
     <Icon
      name={expanded ? 'arrow-down-s' : 'arrow-right-s'}
      className="size-4 shrink-0 text-muted-foreground"
     />
     <span className="typography-ui-label text-foreground">{provider.name}</span>
     <SettingsCardPill tone={provider.credentialConfigured ? 'success' : 'neutral'}>
      {t(provider.credentialConfigured ? 'settings.webSearch.keys.saved' : 'settings.webSearch.native.unconfigured')}
     </SettingsCardPill>
    </button>
   </div>

   {expanded ? (
    <div className="mt-3 border-t border-border/40 pt-3">
     {provider.credentialConfigured ? (
      <div className="flex items-center justify-between gap-2">
       <span className="typography-meta text-muted-foreground">{t('settings.webSearch.native.configured')}</span>
       <Button variant="outline" size="xs" disabled={busy} onClick={() => void handleRemove()}>
        {t('settings.webSearch.keys.remove')}
       </Button>
      </div>
     ) : canWrite ? (
      <div className="space-y-2">
       <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
         <Input
          type={showPassword ? 'text' : 'password'}
          autoComplete="off"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
           if (event.key === 'Enter') void handleSave();
          }}
          placeholder={t('settings.webSearch.keys.placeholder')}
          aria-label={t('settings.webSearch.keys.inputAria', { provider: provider.name })}
          inputSize="compact"
          className="pe-8 font-mono"
         />
         <button
          type="button"
          tabIndex={-1}
          className="absolute inset-y-0 end-0 flex items-center pe-2 text-muted-foreground hover:text-foreground"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={t(showPassword ? 'settings.providers.page.actions.hide' : 'settings.projects.shared.actions.show')}
         >
          <Icon name={showPassword ? 'eye-off' : 'eye'} className="size-3.5" />
         </button>
        </div>
        <Button size="xs" disabled={busy || draft.trim().length === 0} onClick={() => void handleSave()}>
         {t('settings.webSearch.keys.save')}
        </Button>
       </div>
      </div>
     ) : (
      <p className="typography-meta text-muted-foreground">{t('settings.webSearch.native.enterprise')}</p>
     )}
    </div>
   ) : null}
  </div>
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

<<<<<<< HEAD
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
=======
  if (snapshot && open) {
    return <ProviderDetail entry={open} snapshot={snapshot} onBack={() => setOpenId(null)} />;
  }

  return (
    <SettingsPageLayout
      title={t('settings.page.webSearch.title')}
      namedBySidebar
      showSaveStatus
    >
      {snapshot ? (
        <>
          <ModeSection snapshot={snapshot} />
          <SettingsSection
            title={t('settings.webSearch.section.providers')}
            info={t('settings.webSearch.section.providersInfo')}
            settingsItem="web-search.providers"
          >
            {entries.length === 0 ? (
              <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.state.noProviders')}</p>
            ) : (
              <div className={SETTINGS_CARD_GRID_CLASS}>
                {entries.map((entry) => (
                  <ProviderCard key={entry.provider.id} entry={entry} snapshot={snapshot} onOpen={() => setOpenId(entry.provider.id)} />
                ))}
              </div>
            )}
            {snapshot.access === null ? (
              <p className={`${SETTINGS_HELPER_CLASS} mt-3`}>{t('settings.webSearch.state.keysUnavailable')}</p>
            ) : null}
          </SettingsSection>
        </>
      ) : state.kind === 'failed' ? (
        <SettingsSection divider={false}>
          <div className="flex flex-wrap items-center gap-3">
            <p className="typography-meta text-[var(--status-error)]">{t('settings.webSearch.state.loadFailed')}</p>
            <Button variant="outline" size="xs" onClick={() => void load()}>
              {t('settings.webSearch.actions.retry')}
            </Button>
          </div>
        </SettingsSection>
      ) : (
        <SettingsSection divider={false}>
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.state.loading')}</p>
        </SettingsSection>
      )}
    </SettingsPageLayout>
  );
>>>>>>> bc50ba56a
};
