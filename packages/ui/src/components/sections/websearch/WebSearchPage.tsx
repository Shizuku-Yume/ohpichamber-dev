import React from 'react';
import type { WebSearchMutationResult, WebSearchProviderEntry } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { reportSettingsSaveState } from '@/lib/persistence';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SETTINGS_CARD_GRID_CLASS,
  SettingsBackButton,
  SettingsCard,
  SettingsCardIcon,
  SettingsCardPill,
  type SettingsCardAction,
} from '@/components/sections/shared/SettingsCards';
import {
  SETTINGS_CALLOUT_TITLE_CLASS,
  SETTINGS_CONTROL_CLUSTER_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_NUMBER_INPUT_CLASS,
  SETTINGS_NUMBER_STEPPER_ROW_CLASS,
  SETTINGS_NUMBER_UNIT_CLASS,
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
  SettingsChipGroup,
  SettingsFieldRow,
  SettingsSection,
} from '@/components/sections/shared/SettingsSection';
import { getWebSearchScopeKey, useWebSearchStore, type WebSearchSnapshot } from '@/stores/useWebSearchStore';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';

/**
 * Settings → Web search: which native search provider the agent uses, the
 * fallback chain, the request timeout, and the write-only credential each
 * provider takes. Configuration belongs to the selected agent directory; the
 * worker is authoritative and every write is applied with a revision CAS.
 *
 * The page opens on the mode (default, off) and a card per provider; a card
 * opens the provider, where its key is added and it is chosen for search.
 */

/** Sentinel for the add-fallback select; it never leaves the control. */
const ADD_FALLBACK_VALUE = '__add-fallback__';

/** OMP's native `providers.webSearchTimeoutSeconds` default, used by the reset action. */
const DEFAULT_TIMEOUT_SECONDS = 60;

type ModeValue = 'default' | 'off';

const useChoose = (snapshot: WebSearchSnapshot) => {
  const { t } = useI18n();
  const update = useWebSearchStore((store) => store.update);
  const busy = useWebSearchStore((store) => store.busy);

  const commit = async (changes: Parameters<typeof update>[0]): Promise<boolean> => {
    if (busy) return false;
    reportSettingsSaveState('saving');
    const ok = await update(changes);
    reportSettingsSaveState(ok ? 'saved' : 'error');
    if (!ok) toast.error(t('settings.webSearch.toast.saveFailed'));
    return ok;
  };

  const chooseMode = (mode: ModeValue): void => {
    if (mode === 'off') {
      if (!snapshot.enabled) return;
      void commit({ enabled: false });
      return;
    }
    if (snapshot.enabled && snapshot.selectedProviderId === null) return;
    void commit({ enabled: true, selectedProviderId: null });
  };

  const chooseProvider = (providerId: string): void => {
    if (snapshot.selectedProviderId === providerId) return;
    // Removing the new primary from the fallback chain keeps the same CAS
    // write and honours the contract's primary-not-fallback rule.
    void commit({
      enabled: true,
      selectedProviderId: providerId,
      fallbackProviderIds: snapshot.fallbackProviderIds.filter((id) => id !== providerId),
    });
  };

  return { chooseMode, chooseProvider, busy, commit };
};

const ModeSection: React.FC<{ snapshot: WebSearchSnapshot }> = ({ snapshot }) => {
  const { t } = useI18n();
  const { chooseMode } = useChoose(snapshot);
  const selectedProvider = snapshot.selectedProviderId === null
    ? null
    : snapshot.providers.find((provider) => provider.providerId === snapshot.selectedProviderId) ?? null;
  const mode: ModeValue = snapshot.selectedProviderId === null ? 'default' : 'off';

  const status = !snapshot.enabled
    ? t('settings.webSearch.mode.offDescription')
    : snapshot.selectedProviderId === null
      ? t('settings.webSearch.option.defaultDescription')
      : selectedProvider
        ? t('settings.webSearch.mode.providerDescription', { provider: selectedProvider.name })
        : t('settings.webSearch.mode.missingDescription', { provider: snapshot.selectedProviderId });

  return (
    <SettingsSection
      title={t('settings.webSearch.section.provider')}
      info={t('settings.webSearch.native.info')}
      divider={false}
      settingsItem="web-search.provider"
    >
      <div className="space-y-2">
        <SettingsChipGroup<ModeValue>
          aria-label={t('settings.webSearch.section.provider')}
          value={mode}
          options={[
            { value: 'default', label: t('settings.webSearch.option.default') },
            { value: 'off', label: t('settings.webSearch.option.off') },
          ]}
          onChange={chooseMode}
        />
        <p className={SETTINGS_HELPER_CLASS}>{status}</p>
      </div>
    </SettingsSection>
  );
};

const ProviderCard: React.FC<{ provider: WebSearchProviderEntry; snapshot: WebSearchSnapshot; onOpen: () => void }> = ({ provider, snapshot, onOpen }) => {
  const { t } = useI18n();
  const { chooseProvider, busy } = useChoose(snapshot);
  const inUse = snapshot.enabled && snapshot.selectedProviderId === provider.providerId;
  const needsKey = provider.requiresCredential && !provider.credentialConfigured;

  const pill = inUse
    ? <SettingsCardPill tone="success">{t('settings.webSearch.card.inUse')}</SettingsCardPill>
    : needsKey
      ? <SettingsCardPill tone="warning">{t('settings.webSearch.card.needsKey')}</SettingsCardPill>
      : !provider.configured
        ? <SettingsCardPill tone="warning">{t('settings.webSearch.card.needsSetup')}</SettingsCardPill>
        : null;

  const footer = provider.credentialConfigured
    ? t('settings.webSearch.keys.saved')
    : !provider.requiresCredential
      ? t('settings.webSearch.card.keyOptional')
      : null;

  const actions: SettingsCardAction[] = !inUse && !busy && provider.configured
    ? [{ label: t('settings.webSearch.actions.use'), icon: 'check', onSelect: () => chooseProvider(provider.providerId) }]
    : [];

  return (
    <SettingsCard
      icon={<SettingsCardIcon name="global" />}
      title={provider.name}
      badges={pill}
      footer={footer ? <span className="min-w-0 truncate">{footer}</span> : null}
      muted={!provider.configured || needsKey}
      onOpen={onOpen}
      actions={actions}
      actionsLabel={t('settings.webSearch.card.actions', { provider: provider.name })}
    />
  );
};

const FallbacksAndTimeout: React.FC<{ snapshot: WebSearchSnapshot }> = ({ snapshot }) => {
  const { t } = useI18n();
  const { busy, commit } = useChoose(snapshot);
  const availableFallbacks = snapshot.providers.filter(
    (provider) => provider.providerId !== snapshot.selectedProviderId
      && !snapshot.fallbackProviderIds.includes(provider.providerId),
  );

  return (
    <>
      <SettingsSection
        title={t('settings.webSearch.native.fallbacks')}
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
      </SettingsSection>
      <SettingsSection title={t('settings.webSearch.native.timeout')} settingsItem="web-search.timeout">
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
      </SettingsSection>
    </>
  );
};

const ProviderDetail: React.FC<{ provider: WebSearchProviderEntry; snapshot: WebSearchSnapshot; onBack: () => void }> = ({ provider, snapshot, onBack }) => {
  const { t } = useI18n();
  const { chooseProvider, busy } = useChoose(snapshot);
  // Enterprise mode blocks adding a key; a saved one can still be removed.
  const enterprise = useEnterpriseMode();
  const saveKey = useWebSearchStore((store) => store.saveKey);
  const removeKey = useWebSearchStore((store) => store.removeKey);
  const [draft, setDraft] = React.useState('');
  const inUse = snapshot.enabled && snapshot.selectedProviderId === provider.providerId;

  const handleSave = async () => {
    const key = draft.trim();
    if (!key || busy || enterprise) return;
    reportSettingsSaveState('saving');
    const ok = await saveKey(provider.providerId, key);
    if (ok) setDraft('');
    reportSettingsSaveState(ok ? 'saved' : 'error');
    if (ok) toast.success(t('settings.webSearch.toast.keySaved', { provider: provider.name }));
    else toast.error(t('settings.webSearch.toast.keySaveFailed'));
  };

  const handleRemove = async () => {
    if (busy) return;
    reportSettingsSaveState('saving');
    const ok = await removeKey(provider.providerId);
    reportSettingsSaveState(ok ? 'saved' : 'error');
    if (!ok) toast.error(t('settings.webSearch.toast.keyRemoveFailed'));
  };

  const useLine = inUse
    ? t('settings.webSearch.mode.providerDescription', { provider: provider.name })
    : !provider.configured
      ? t('settings.webSearch.detail.needsSetup', { provider: provider.name })
      : null;

  return (
    <SettingsPageLayout
      title={provider.name}
      titleLeading={<SettingsBackButton label={t('settings.webSearch.detail.back')} onClick={onBack} />}
      showSaveStatus
    >
      <SettingsSection divider={false}>
        <div className="space-y-2">
          {useLine ? <p className="typography-meta text-foreground">{useLine}</p> : null}
          {provider.configured && !inUse ? (
            <Button size="sm" disabled={busy} onClick={() => chooseProvider(provider.providerId)}>
              {t('settings.webSearch.actions.use')}
            </Button>
          ) : null}
        </div>
      </SettingsSection>
      <SettingsSection>
        <div className="space-y-4">
          {enterprise ? <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.keys.enterpriseMode')}</p> : null}
          {!provider.credentialWritable ? (
            <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.detail.noKey')}</p>
          ) : provider.credentialConfigured ? (
            <SettingsFieldRow label={t('settings.webSearch.keys.label')} info={t('settings.webSearch.native.keyInfo')}>
              <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex items-center justify-end gap-2`}>
                <span className="typography-meta text-muted-foreground">{t('settings.webSearch.keys.saved')}</span>
                <Button variant="outline" size="xs" disabled={busy} onClick={() => void handleRemove()}>
                  {t('settings.webSearch.keys.remove')}
                </Button>
              </div>
            </SettingsFieldRow>
          ) : enterprise ? null : (
            <SettingsFieldRow label={t('settings.webSearch.keys.label')} info={t('settings.webSearch.native.keyInfo')}>
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
                  inputSize="compact"
                  className="min-w-0 flex-1 font-mono"
                />
                <Button size="xs" disabled={busy || draft.trim().length === 0} onClick={() => void handleSave()}>
                  {t('settings.webSearch.keys.save')}
                </Button>
              </div>
            </SettingsFieldRow>
          )}
        </div>
      </SettingsSection>
    </SettingsPageLayout>
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
  const [openId, setOpenId] = React.useState<string | null>(null);

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

  // A provider that went away closes its screen.
  const open = snapshot && openId ? snapshot.providers.find((entry) => entry.providerId === openId) ?? null : null;
  if (snapshot && open) {
    return <ProviderDetail provider={open} snapshot={snapshot} onBack={() => setOpenId(null)} />;
  }

  return (
    <SettingsPageLayout
      title={t('settings.page.webSearch.title')}
      namedBySidebar
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
          <ModeSection snapshot={snapshot} />
          <SettingsSection
            title={t('settings.webSearch.section.providers')}
            info={t('settings.webSearch.section.providersInfo')}
            settingsItem="web-search.providers"
          >
            {snapshot.providers.length === 0 ? (
              <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.native.noProviders')}</p>
            ) : (
              <div className={SETTINGS_CARD_GRID_CLASS}>
                {snapshot.providers.map((provider) => (
                  <ProviderCard
                    key={provider.providerId}
                    provider={provider}
                    snapshot={snapshot}
                    onOpen={() => setOpenId(provider.providerId)}
                  />
                ))}
              </div>
            )}
          </SettingsSection>
          <FallbacksAndTimeout snapshot={snapshot} />
        </>
      ) : failed || error !== null ? null : (
        <SettingsSection divider={false}>
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.state.loading')}</p>
        </SettingsSection>
      )}
    </SettingsPageLayout>
  );
};
