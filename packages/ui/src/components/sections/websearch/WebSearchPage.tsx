import React from 'react';
import type { WebSearchMutationResult, WebSearchProviderEntry } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
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
import { getWebSearchProviderName } from './websearchProviderName';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';

<<<<<<< HEAD
/**
 * Settings → Web search: which native search provider the agent uses, the
 * fallback chain, the request timeout, and the write-only credential each
 * provider takes. Configuration belongs to the selected agent directory; the
 * worker is authoritative and every write is applied with a revision CAS.
 *
 * The page opens on the mode (default, off) and a card per provider; a card
 * opens the provider, where its key is added and it is chosen for search.
 */
||||||| bc50ba56aa
/**
 * Settings → Web search: which provider OpenCode's `websearch` tool uses, and
 * the API key (or, for a server the user runs, the address) each provider
 * takes. Both belong to OpenCode: the choice is the `websearch` key of its
 * config, the keys are integration credentials, so the page reads them from
 * OpenCode and writes them back.
 *
 * The page opens on the mode (default, any provider, off) and a card per
 * provider; a card opens the provider, where its key is added and it is
 * chosen for search. A plugin provider OpenCode offers only once connected
 * has a card too, so its key goes in where it is chosen.
 */
=======
>>>>>>> upstream/main

/** OMP's native `providers.webSearchTimeoutSeconds` default, used by the reset action. */
const DEFAULT_TIMEOUT_SECONDS = 60;

<<<<<<< HEAD
type ModeValue = 'default' | 'off';
||||||| bc50ba56aa
/** One provider as the page shows it: offered for search, or waiting for its key. */
type ProviderEntry = {
  provider: WebSearchProvider;
  access: WebSearchProviderAccess | null;
  /** False for a plugin provider OpenCode offers only once connected. */
  usable: boolean;
};

const providerEntries = (snapshot: WebSearchSnapshot): ProviderEntry[] => [
  ...snapshot.providers.map((provider) => ({ provider, access: snapshot.access?.[provider.id] ?? null, usable: true })),
  ...snapshot.connectable.map((provider) => ({ provider, access: snapshot.access?.[provider.id] ?? null, usable: false })),
].sort((a, b) => a.provider.name.localeCompare(b.provider.name, undefined, { sensitivity: 'base' }));
=======
type ProviderEntry = {
  provider: WebSearchProvider;
  access: WebSearchProviderAccess | null;
  usable: boolean;
};

const providerEntries = (snapshot: WebSearchSnapshot): ProviderEntry[] => [
  ...snapshot.providers.map((provider) => ({ provider, access: snapshot.access?.[provider.id] ?? null, usable: true })),
  ...snapshot.connectable.map((provider) => ({ provider, access: snapshot.access?.[provider.id] ?? null, usable: false })),
].sort((a, b) => a.provider.name.localeCompare(b.provider.name, undefined, { sensitivity: 'base' }));
>>>>>>> upstream/main

const useChoose = (snapshot: WebSearchSnapshot) => {
  const { t } = useI18n();
<<<<<<< HEAD
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
||||||| bc50ba56aa
  const setSelection = useWebSearchStore((store) => store.setSelection);
  // A project config's `websearch` wins over the file Settings writes, so a
  // choice here would snap back.
  const locked = snapshot.projectOverride !== null;
  const choose = (selection: WebSearchSelection) => {
    if (locked || sameSelection(selection, snapshot.selection)) return;
    void setSelection(selection).then((ok) => {
      if (!ok) toast.error(t('settings.webSearch.toast.saveFailed'));
=======
  const setSelection = useWebSearchStore((store) => store.setSelection);
  const locked = snapshot.projectOverride !== null;
  const choose = (selection: WebSearchSelection) => {
    if (locked || sameSelection(selection, snapshot.selection)) return;
    void setSelection(selection).then((ok) => {
      if (!ok) toast.error(t('settings.webSearch.toast.saveFailed'));
>>>>>>> upstream/main
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

<<<<<<< HEAD
  const status = !snapshot.enabled
    ? t('settings.webSearch.mode.offDescription')
    : snapshot.selectedProviderId === null
      ? t('settings.webSearch.option.defaultDescription')
      : selectedProvider
        ? t('settings.webSearch.mode.providerDescription', { provider: getWebSearchProviderName(selectedProvider, t) })
        : t('settings.webSearch.mode.missingDescription', { provider: snapshot.selectedProviderId });
||||||| bc50ba56aa
  const options: Array<{ value: ModeValue; label: string; disabled?: boolean }> = [
    { value: 'default', label: t('settings.webSearch.option.default'), disabled: locked },
    ...(snapshot.providers.length > 0
      ? [{ value: 'random' as const, label: t('settings.webSearch.option.random'), disabled: locked }]
      : []),
    { value: 'off', label: t('settings.webSearch.option.off'), disabled: locked },
  ];

  const status = selected.kind === 'default'
    ? t('settings.webSearch.option.defaultDescription')
    : selected.kind === 'random'
      ? t('settings.webSearch.option.randomDescription')
      : selected.kind === 'off'
        ? t('settings.webSearch.mode.offDescription')
        : providerName
          // A configured provider OpenCode no longer offers (plugin removed,
          // typo in the file) is named, so the user can see why search fails.
          ? t('settings.webSearch.mode.providerDescription', { provider: providerName })
          : t('settings.webSearch.mode.missingDescription', { provider: selected.id });
=======
  const options: Array<{ value: ModeValue; label: string; disabled?: boolean }> = [
    { value: 'default', label: t('settings.webSearch.option.default'), disabled: locked },
    ...(snapshot.providers.length > 0
      ? [{ value: 'random' as const, label: t('settings.webSearch.option.random'), disabled: locked }]
      : []),
    { value: 'off', label: t('settings.webSearch.option.off'), disabled: locked },
  ];

  const status = selected.kind === 'default'
    ? t('settings.webSearch.option.defaultDescription')
    : selected.kind === 'random'
      ? t('settings.webSearch.option.randomDescription')
      : selected.kind === 'off'
        ? t('settings.webSearch.mode.offDescription')
        : providerName
          ? t('settings.webSearch.mode.providerDescription', { provider: providerName })
          : t('settings.webSearch.mode.missingDescription', { provider: selected.id });
>>>>>>> upstream/main

  return (
    <SettingsSection
      title={t('settings.webSearch.section.provider')}
<<<<<<< HEAD
      info={t('settings.webSearch.native.info')}
      divider={false}
||||||| bc50ba56aa
      info={t('settings.webSearch.section.providerInfo')}
      divider={false}
=======
      info={t('settings.webSearch.section.providerInfo')}
>>>>>>> upstream/main
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
<<<<<<< HEAD
  const { busy, commit } = useChoose(snapshot);
||||||| bc50ba56aa
  const saveKey = useWebSearchStore((store) => store.saveKey);
  const removeKey = useWebSearchStore((store) => store.removeKey);
  const [draft, setDraft] = React.useState('');
  const [answer, setAnswer] = React.useState<WebSearchConnectAnswer>({});
  const [busy, setBusy] = React.useState(false);
  const takesKey = connect.kind === 'key';
  const names = access.envNames.join(', ');
  // Field explanations and examples live behind the info icon: a URL example
  // does not fit in the field, so the field shows only its label.
  const hintLines = [
    ...connect.fields.flatMap((field) => [
      field.description,
      field.placeholder ? t('settings.webSearch.keys.fieldExample', { example: field.placeholder }) : null,
    ]),
    access.envNames.length === 0
      ? null
      : takesKey ? t('settings.webSearch.keys.envHint', { names }) : t('settings.webSearch.keys.envHintForm', { names }),
  ].filter((line): line is string => Boolean(line));
  const info = hintLines.length > 0
    ? hintLines.map((line) => <span key={line} className="block">{line}</span>)
    : undefined;
  const filledAnswer = Object.fromEntries(
    Object.entries(answer).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value !== ''),
  );
  const complete = (!takesKey || draft.trim() !== '') && connect.fields.every((field) => !field.required || filledAnswer[field.key] !== undefined);
=======
  const saveKey = useWebSearchStore((store) => store.saveKey);
  const removeKey = useWebSearchStore((store) => store.removeKey);
  const [draft, setDraft] = React.useState('');
  const [answer, setAnswer] = React.useState<WebSearchConnectAnswer>({});
  const [busy, setBusy] = React.useState(false);
  const takesKey = connect.kind === 'key';
  const names = access.envNames.join(', ');
  const hintLines = [
    ...connect.fields.flatMap((field) => [
      field.description,
      field.placeholder ? t('settings.webSearch.keys.fieldExample', { example: field.placeholder }) : null,
    ]),
    access.envNames.length === 0
      ? null
      : takesKey ? t('settings.webSearch.keys.envHint', { names }) : t('settings.webSearch.keys.envHintForm', { names }),
  ].filter((line): line is string => Boolean(line));
  const info = hintLines.length > 0
    ? hintLines.map((line) => <span key={line} className="block">{line}</span>)
    : undefined;
  const filledAnswer = Object.fromEntries(
    Object.entries(answer).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value !== ''),
  );
  const complete = (!takesKey || draft.trim() !== '') && connect.fields.every((field) => !field.required || filledAnswer[field.key] !== undefined);
>>>>>>> upstream/main

  return (
<<<<<<< HEAD
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
||||||| bc50ba56aa
    <SettingsFieldRow label={rowLabel} info={info}>
      {status.kind === 'stored' ? (
        <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex items-center justify-end gap-2`}>
          <span className="typography-meta text-muted-foreground">
            {takesKey ? t('settings.webSearch.keys.saved') : t('settings.webSearch.keys.connected')}
          </span>
          <Button variant="outline" size="xs" disabled={busy} onClick={() => void handleRemove()}>
            {t('settings.webSearch.keys.remove')}
          </Button>
        </div>
      ) : status.kind === 'env' ? (
        <span className="typography-meta text-muted-foreground">
          {t('settings.webSearch.keys.fromEnv', { name: status.name })}
        </span>
      ) : locked ? null : inputs.length === 1 ? (
        <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex items-center gap-2`}>
          {inputs}
          {saveButton}
        </div>
      ) : (
        // Several fields stack, with Save after the last one.
        <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex flex-col gap-2`}>
          {inputs.slice(0, -1).map((input, index) => (
            <div key={index} className="flex">{input}</div>
          ))}
          <div className="flex items-center gap-2">
            {inputs.at(-1)}
            {saveButton}
          </div>
        </div>
      )}
=======
    <SettingsFieldRow label={rowLabel} info={info}>
      {status.kind === 'stored' ? (
        <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex items-center justify-end gap-2`}>
          <span className="typography-meta text-muted-foreground">
            {takesKey ? t('settings.webSearch.keys.saved') : t('settings.webSearch.keys.connected')}
          </span>
          <Button variant="outline" size="xs" disabled={busy} onClick={() => void handleRemove()}>
            {t('settings.webSearch.keys.remove')}
          </Button>
        </div>
      ) : status.kind === 'env' ? (
        <span className="typography-meta text-muted-foreground">
          {t('settings.webSearch.keys.fromEnv', { name: status.name })}
        </span>
      ) : locked ? null : inputs.length === 1 ? (
        <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex items-center gap-2`}>
          {inputs}
          {saveButton}
        </div>
      ) : (
        <div className={`${SETTINGS_CONTROL_CLUSTER_CLASS} flex flex-col gap-2`}>
          {inputs.slice(0, -1).map((input, index) => (
            <div key={index} className="flex">{input}</div>
          ))}
          <div className="flex items-center gap-2">
            {inputs.at(-1)}
            {saveButton}
          </div>
        </div>
      )}
>>>>>>> upstream/main
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
<<<<<<< HEAD
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
||||||| bc50ba56aa
  const { choose, locked } = useChoose(snapshot);
  // Enterprise mode: the server refuses new keys (they connect through the
  // same OpenCode route as model providers); saved ones can still be removed.
  const keysLocked = useEnterpriseMode();
  const { provider, access, usable } = entry;
  const inUse = snapshot.selection.kind === 'provider' && snapshot.selection.id === provider.id;
  const connect = access?.connect ?? null;
=======
  const { choose, locked } = useChoose(snapshot);
  const keysLocked = useEnterpriseMode();
  const { provider, access, usable } = entry;
  const inUse = snapshot.selection.kind === 'provider' && snapshot.selection.id === provider.id;
  const connect = access?.connect ?? null;
>>>>>>> upstream/main

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
      <SettingsSection>
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

<<<<<<< HEAD
  // The boot registry read the snapshot; this only re-reads when the page is
  // opened for another project or runtime (the snapshot is scoped to both).
  //
  // The dependency is the scope string and the state's KIND, never the state
  // object: `load()` publishes a fresh `{ kind: 'loading' }` on every call, so
  // depending on the object re-ran this effect for its own write and the page
  // resolved the workspace thousands of times without ever reading the
  // snapshot. A kind that is already loading or failed is left alone; the
  // store's own retry button owns the failed case.
||||||| bc50ba56aa
  // Read on open, and again when the page is opened for another project or
  // runtime (the snapshot is scoped to both).
=======
>>>>>>> upstream/main
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
<<<<<<< HEAD
  const failed = state.kind === 'failed';
  const partial = outcome !== null
    && (outcome.status !== 'applied'
      || outcome.persistence !== 'persisted'
      || outcome.workers.some((worker) => worker.status === 'failed'));
||||||| bc50ba56aa
  const entries = snapshot ? providerEntries(snapshot) : [];
  // A provider that went away (plugin removed) closes its screen.
  const open = openId ? entries.find((entry) => entry.provider.id === openId) ?? null : null;
=======
  const entries = snapshot ? providerEntries(snapshot) : [];
  const open = openId ? entries.find((entry) => entry.provider.id === openId) ?? null : null;
>>>>>>> upstream/main

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
<<<<<<< HEAD
      ) : failed || error !== null ? null : (
        <SettingsSection divider={false}>
          {/* Never read yet, or a read is in flight: both are "not answered". */}
||||||| bc50ba56aa
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
=======
      ) : state.kind === 'failed' ? (
        <SettingsSection>
          <div className="flex flex-wrap items-center gap-3">
            <p className="typography-meta text-[var(--status-error)]">{t('settings.webSearch.state.loadFailed')}</p>
            <Button variant="outline" size="xs" onClick={() => void load()}>
              {t('settings.webSearch.actions.retry')}
            </Button>
          </div>
        </SettingsSection>
      ) : (
        <SettingsSection>
>>>>>>> upstream/main
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.webSearch.state.loading')}</p>
        </SettingsSection>
      )}
    </SettingsPageLayout>
  );
};
