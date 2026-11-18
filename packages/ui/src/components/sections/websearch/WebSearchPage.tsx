import React from 'react';
import type { WebSearchMutationResult, WebSearchProviderEntry } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { toast } from '@/components/ui';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
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
  SETTINGS_WIDTH_LONG_TEXT_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_WIDTH_NUMBER_CLASS,
  SETTINGS_NUMBER_STEPPER_ROW_CLASS,
  SETTINGS_NUMBER_UNIT_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SettingsChipGroup,
  SettingsFieldRow,
  SettingsSection,
} from '@/components/sections/shared/SettingsSection';
import { SettingsSortableList, type SettingsSortableListItem } from '@/components/sections/shared/SettingsSortableList';
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

/** Native search providers whose service-side name needs the UI's own wording. */
const WEB_SEARCH_PROVIDER_NAME_KEYS: Record<string, I18nKey> = {
  'web/hosted': 'settings.webSearch.provider.hosted',
};

/** The reader's name for a search provider: a known id is translated, an unknown one keeps the service's name. */
export const getWebSearchProviderName = (
  provider: Pick<WebSearchProviderEntry, 'providerId' | 'name'>,
  t: (key: I18nKey) => string,
): string => {
  const key = WEB_SEARCH_PROVIDER_NAME_KEYS[provider.providerId];
  return key ? t(key) : provider.name;
};

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
    // Re-enabling a provider already stored as the selection still writes it:
    // only a provider that is both selected and enabled needs no change.
    if (snapshot.enabled && snapshot.selectedProviderId === providerId) return;
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
  // A chosen provider presses neither chip: the two describe the fallback
  // modes, and the status line names the provider, as on the connect page.
  const mode: 'default' | 'off' | 'provider' = !snapshot.enabled
    ? 'off'
    : snapshot.selectedProviderId === null ? 'default' : 'provider';

  const status = !snapshot.enabled
    ? t('settings.webSearch.mode.offDescription')
    : snapshot.selectedProviderId === null
      ? t('settings.webSearch.option.defaultDescription')
      : selectedProvider
        ? t('settings.webSearch.mode.providerDescription', { provider: getWebSearchProviderName(selectedProvider, t) })
        : t('settings.webSearch.mode.missingDescription', { provider: snapshot.selectedProviderId });

  return (
    <SettingsSection
      title={t('settings.webSearch.section.provider')}
      info={t('settings.webSearch.native.info')}
      divider={false}
      settingsItem="web-search.provider"
    >
      <div className={SETTINGS_SPACE_ROW_CLASS}>
        <div className="space-y-2">
          <SettingsChipGroup<'default' | 'off' | 'provider'>
            aria-label={t('settings.webSearch.section.provider')}
            value={mode}
            options={[
              { value: 'default', label: t('settings.webSearch.option.default') },
              { value: 'off', label: t('settings.webSearch.option.off') },
            ]}
            onChange={(value) => {
              if (value !== 'provider') chooseMode(value);
            }}
          />
          <p className={SETTINGS_HELPER_CLASS}>{status}</p>
        </div>
        <TimeoutRow snapshot={snapshot} />
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
      title={getWebSearchProviderName(provider, t)}
      badges={pill}
      footer={footer ? <span className="min-w-0 truncate">{footer}</span> : null}
      muted={!provider.configured || needsKey}
      onOpen={onOpen}
      actions={actions}
      actionsLabel={t('settings.webSearch.card.actions', { provider: getWebSearchProviderName(provider, t) })}
    />
  );
};

const TimeoutRow: React.FC<{ snapshot: WebSearchSnapshot }> = ({ snapshot }) => {
  const { t } = useI18n();
  const { busy, commit } = useChoose(snapshot);

  return (
    <SettingsFieldRow label={t('settings.webSearch.native.timeout')} settingsItem="web-search.timeout">
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
          className={SETTINGS_WIDTH_NUMBER_CLASS}
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
  );
};

const FallbackStatus: React.FC<{
  provider: WebSearchProviderEntry | undefined;
  label: string;
  busy: boolean;
  onOpen: () => void;
}> = ({ provider, label, busy, onOpen }) => {
  const { t } = useI18n();
  if (!provider) {
    return <SettingsCardPill tone="warning">{t('settings.webSearch.card.needsSetup')}</SettingsCardPill>;
  }
  const needsKey = provider.requiresCredential && !provider.credentialConfigured;
  const needsSetup = !provider.configured;
  if (!needsKey && !needsSetup) return null;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onOpen}
      aria-label={t('settings.webSearch.native.configureFallback', { provider: label })}
      title={t('settings.webSearch.native.configureFallback', { provider: label })}
      className="max-w-40 shrink-0 cursor-pointer truncate rounded-full bg-[var(--status-warning)]/15 px-2 py-0.5 text-[0.625rem] font-medium text-[var(--status-warning)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {needsKey ? t('settings.webSearch.card.needsKey') : t('settings.webSearch.card.needsSetup')}
    </button>
  );
};

interface FallbackRow extends SettingsSortableListItem {
  provider: WebSearchProviderEntry | undefined;
}

const FallbacksSection: React.FC<{
  snapshot: WebSearchSnapshot;
  onOpenProvider: (providerId: string) => void;
}> = ({ snapshot, onOpenProvider }) => {
  const { t } = useI18n();
  const { busy, commit } = useChoose(snapshot);
  const rows: FallbackRow[] = snapshot.fallbackProviderIds.map((providerId) => {
    const provider = snapshot.providers.find((entry) => entry.providerId === providerId);
    return {
      id: providerId,
      label: provider ? getWebSearchProviderName(provider, t) : getWebSearchProviderName({ providerId, name: providerId }, t),
      provider,
    };
  });
  // The primary provider is never offered as a fallback, and an unconfigured
  // provider cannot be added: the Use action gates on the same flag.
  const addable = snapshot.providers.filter(
    (provider) => provider.configured
      && provider.providerId !== snapshot.selectedProviderId
      && !snapshot.fallbackProviderIds.includes(provider.providerId),
  );

  return (
    <SettingsSection
      title={t('settings.webSearch.native.fallbacks')}
      info={t('settings.webSearch.native.fallbackInfo')}
      settingsItem="web-search.fallbacks"
    >
      <div className={SETTINGS_SPACE_ROW_CLASS}>
        {rows.length === 0 ? (
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.native.fallbacksEmpty')}</p>
        ) : (
          <SettingsSortableList
            items={rows}
            disabled={busy}
            dragInstructions={t('settings.webSearch.native.dragInstructions')}
            listClassName="gap-2"
            rowClassName="oc-tile oc-tile-hover rounded-xl px-3 py-2"
            onReorder={(providerIds) => void commit({ fallbackProviderIds: providerIds })}
            renderRow={(row, index) => (
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="oc-tile-inset flex size-5 shrink-0 items-center justify-center rounded-md typography-micro font-medium tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span
                  className={cn(
                    'oc-tile-inset flex size-7 shrink-0 items-center justify-center rounded-lg',
                    (!row.provider?.configured || (row.provider.requiresCredential && !row.provider.credentialConfigured)) && 'opacity-60',
                  )}
                  aria-hidden="true"
                >
                  <Icon name="global" className="size-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1 truncate typography-ui-label font-medium text-foreground">
                  {row.label}
                </span>
                <FallbackStatus
                  provider={row.provider}
                  label={row.label}
                  busy={busy}
                  onOpen={() => onOpenProvider(row.id)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  className={cn(SETTINGS_ICON_BUTTON_CLASS, 'shrink-0')}
                  aria-label={t('settings.webSearch.native.removeFallback', { provider: row.label })}
                  title={t('settings.webSearch.native.removeFallback', { provider: row.label })}
                  onClick={() => void commit({
                    fallbackProviderIds: snapshot.fallbackProviderIds.filter((value) => value !== row.id),
                  })}
                >
                  <Icon name="close" className="size-3.5" />
                </Button>
              </div>
            )}
          />
        )}
        <div className="flex flex-col items-start gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs" disabled={busy || addable.length === 0}>
                <Icon name="add" className="size-3.5" />
                {t('settings.webSearch.native.addFallback')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {addable.map((provider) => (
                <DropdownMenuItem
                  key={provider.providerId}
                  onClick={() => void commit({
                    fallbackProviderIds: [...snapshot.fallbackProviderIds, provider.providerId],
                  })}
                >
                  {getWebSearchProviderName(provider, t)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {addable.length === 0 && rows.length > 0 ? (
            <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.native.addFallbackNone')}</p>
          ) : null}
        </div>
      </div>
    </SettingsSection>
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
    if (ok) toast.success(t('settings.webSearch.toast.keySaved', { provider: getWebSearchProviderName(provider, t) }));
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
    ? t('settings.webSearch.mode.providerDescription', { provider: getWebSearchProviderName(provider, t) })
    : !provider.configured
      ? t('settings.webSearch.detail.needsSetup', { provider: getWebSearchProviderName(provider, t) })
      : null;

  return (
    <SettingsPageLayout
      title={getWebSearchProviderName(provider, t)}
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
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {enterprise ? <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.keys.enterpriseMode')}</p> : null}
          {!provider.credentialWritable ? (
            <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.detail.noKey')}</p>
          ) : provider.credentialConfigured ? (
            <SettingsFieldRow label={t('settings.webSearch.keys.label')} info={t('settings.webSearch.native.keyInfo')}>
              <div className={`${SETTINGS_WIDTH_LONG_TEXT_CLASS} flex items-center justify-end gap-2`}>
                <span className="typography-meta text-muted-foreground">{t('settings.webSearch.keys.saved')}</span>
                <Button variant="outline" size="xs" disabled={busy} onClick={() => void handleRemove()}>
                  {t('settings.webSearch.keys.remove')}
                </Button>
              </div>
            </SettingsFieldRow>
          ) : enterprise ? null : (
            <SettingsFieldRow label={t('settings.webSearch.keys.label')} info={t('settings.webSearch.native.keyInfo')}>
              <div className={`${SETTINGS_WIDTH_LONG_TEXT_CLASS} flex items-center gap-2`}>
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
                  aria-label={t('settings.webSearch.keys.inputAria', { provider: getWebSearchProviderName(provider, t) })}
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

  // The boot registry read the snapshot; this only re-reads when the page is
  // opened for another project or runtime (the snapshot is scoped to both).
  //
  // The dependency is the scope string and the state's KIND, never the state
  // object: `load()` publishes a fresh `{ kind: 'loading' }` on every call, so
  // depending on the object re-ran this effect for its own write and the page
  // resolved the workspace thousands of times without ever reading the
  // snapshot. A kind that is already loading or failed is left alone; the
  // store's own retry button owns the failed case.
  const scope = getWebSearchScopeKey();
  const stateKind = state.kind;
  // A read is only "already running" for the scope it started in. A scope
  // change mid-read abandons the old request, so the page must start the new
  // one rather than wait for a reply that will be discarded.
  const loadingScope = state.kind === 'loading' ? state.scope : null;
  const readyScope = state.kind === 'ready' ? state.snapshot.scope : null;
  React.useEffect(() => {
    if (stateKind === 'ready' && readyScope === scope) return;
    if (stateKind === 'loading' && loadingScope !== scope) {
      void load();
      return;
    }
    if (stateKind === 'loading' || stateKind === 'failed') return;
    void load();
  }, [load, scope, stateKind, loadingScope, readyScope]);

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
          <ModeSection snapshot={snapshot} />
          <SettingsSection
            title={t('settings.webSearch.section.providers')}
            info={t('settings.webSearch.section.providersInfo')}
            settingsItem="web-search.providers"
          >
            {/* Each key is on its provider's own screen, so the registry's
                "API keys" result lands on the cards that open those screens. */}
            {snapshot.providers.length === 0 ? (
              <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.native.noProviders')}</p>
            ) : (
              <div className={SETTINGS_CARD_GRID_CLASS} data-settings-item="web-search.keys">
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
          <FallbacksSection snapshot={snapshot} onOpenProvider={(providerId) => setOpenId(providerId)} />
        </>
      ) : failed || error !== null ? null : (
        <SettingsSection divider={false}>
          {/* Never read yet, or a read is in flight: both are "not answered". */}
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.state.loading')}</p>
        </SettingsSection>
      )}
    </SettingsPageLayout>
  );
};
