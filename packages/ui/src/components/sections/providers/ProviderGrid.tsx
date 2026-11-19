import React from 'react';
<<<<<<< HEAD
import type { Model, Provider } from '@openchamber/agent-contract';
||||||| bc50ba56aa
import type { IntegrationInfo } from '@opencode/client';
=======
import type { Integration as IntegrationInfo } from '@/lib/opencode/model';
>>>>>>> upstream/main
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Icon } from '@/components/icon/Icon';
<<<<<<< HEAD
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
||||||| bc50ba56aa
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
=======
import { useI18n, type I18nKey } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
>>>>>>> upstream/main
import { rankByQuery } from '@/lib/search/fuzzySearch';
import {
  SETTINGS_CARD_GRID_CLASS,
  SettingsAddCard,
  SettingsCard,
  SettingsCardPill,
  SettingsCardSearch,
} from '@/components/sections/shared/SettingsCards';
import {
  SETTINGS_CALLOUT_TITLE_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';
import { useRoutingStore } from '@/stores/useRoutingStore';
<<<<<<< HEAD
import {
  getProviderCardStatus,
  type ProviderCardStatus,
  type ProviderEnvironmentStatus,
} from './providerAuth';
||||||| bc50ba56aa
import { opencodeClient } from '@/lib/opencode/client';
import { openExternalUrl } from '@/lib/url';
import { SettingsInlineLink } from '@/components/sections/classification/JevAccessNote';

const PROVIDER_POLICIES_DOCS_URL = 'https://opencode.ai/v2/docs/policies/';

/** Whether the OpenCode config denies any provider; null while unknown or when the read failed. */
const useConfigDeniesAnyProvider = (directory: string | null): boolean | null => {
  const [restricted, setRestricted] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setRestricted(null);
    opencodeClient.configDeniesAnyProvider(directory)
      .then((value) => { if (!cancelled) setRestricted(value); })
      .catch((error) => {
        // Unknown is not "no policy": stay quiet, but leave a trace.
        console.warn('[providers] could not read OpenCode provider policies:', error instanceof Error ? error.message : String(error));
        if (!cancelled) setRestricted(null);
      });
    return () => { cancelled = true; };
  }, [directory]);
  return restricted;
};
=======
import { opencodeClient } from '@/lib/opencode/client';
import { openExternalUrl } from '@/lib/url';
import { SettingsInlineLink } from '@/components/sections/classification/JevAccessNote';

const PROVIDER_POLICIES_DOCS_URL = 'https://opencode.ai/v2/docs/policies/';

const useConfigDeniesAnyProvider = (directory: string | null): boolean | null => {
  const [restricted, setRestricted] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setRestricted(null);
    opencodeClient.configDeniesAnyProvider(directory)
      .then((value) => { if (!cancelled) setRestricted(value); })
      .catch((error) => {
        console.warn('[providers] could not read OpenCode provider policies:', error instanceof Error ? error.message : String(error));
        if (!cancelled) setRestricted(null);
      });
    return () => { cancelled = true; };
  }, [directory]);
  return restricted;
};
>>>>>>> upstream/main

<<<<<<< HEAD
/**
 * Enterprise mode already refuses provider and credential entry in the Host.
 * The native catalog carries no provider-policy file, so the notice states the
 * gate that applies here rather than borrowing OpenCode policy wording.
 */
const EnterpriseProvidersNotice: React.FC = () => {
||||||| bc50ba56aa
/**
 * Enterprise mode keeps OpenChamber from adding providers, but which ones
 * OpenCode may use is its own `provider.use` policy. The config files are
 * readable; rules from a connected OpenCode Console workspace are not (OpenCode
 * keeps them in memory), and they arrive only through its `opencode`
 * integration. So: no policy and no Console is a certain gap and a warning;
 * no policy with Console connected is a maybe and an info line. Nothing extra
 * is said while either answer is unknown.
 */
const EnterpriseProvidersNotice: React.FC<{ directory: string | null; integrations: readonly IntegrationInfo[] | null }> = ({ directory, integrations }) => {
=======
const EnterpriseProvidersNotice: React.FC<{ directory: string | null; integrations: readonly IntegrationInfo[] | null }> = ({ directory, integrations }) => {
>>>>>>> upstream/main
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--status-info-border)] bg-[var(--status-info-background)]/30 p-3">
      <Icon name="information" className="mt-0.5 size-4 shrink-0 text-[var(--status-info)]" aria-hidden />
      <div className="min-w-0 space-y-1.5">
        <p className={SETTINGS_CALLOUT_TITLE_CLASS}>{t('settings.providers.enterpriseTitle')}</p>
        <p className="typography-meta text-muted-foreground">{t('settings.providers.native.enterprise')}</p>
      </div>
    </div>
  );
};

<<<<<<< HEAD
/**
 * Classification providers answer OpenChamber's own Jev decisions (safety
 * net, Auto), not the native model catalog, so they get one card of their own
 * that opens a dedicated page.
 */
||||||| bc50ba56aa
/**
 * Classification providers answer OpenChamber's own Jev decisions (safety
 * net, Auto), not OpenCode, so they get one card of their own that opens a
 * dedicated page. Absent where there is no OpenChamber server (VS Code).
 */
=======
>>>>>>> upstream/main
const ClassificationCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { t } = useI18n();
  const available = useRoutingStore((state) => state.available);
  const jevAvailable = useRoutingStore((state) => state.jevAvailable);
  const off = useRoutingStore((state) => state.classifier?.selected === 'off');
  if (!available) return null;
  return (
    <SettingsCard
      icon={<ProviderLogo providerId="typesafe" className="size-5" />}
      title={t('settings.classification.page.title')}
      subtitle="jev"
      badges={(
        <SettingsCardPill tone={jevAvailable ? 'success' : off ? 'neutral' : 'warning'}>
          {jevAvailable
            ? t('settings.classification.card.ready')
            : off ? t('settings.classification.card.off') : t('settings.classification.card.notSetUp')}
        </SettingsCardPill>
      )}
      footer={<span className="min-w-0 truncate">{t('settings.classification.card.usedFor')}</span>}
      onOpen={onOpen}
    />
  );
};

<<<<<<< HEAD
const EnvironmentPill: React.FC<{ environment: ProviderEnvironmentStatus | null }> = ({ environment }) => {
  const { t } = useI18n();
  const label = environment?.variable
    ? t('settings.providers.card.status.environmentVariable', { variable: environment.variable })
    : t('settings.providers.card.status.environment');
  return <SettingsCardPill tone="neutral">{label}</SettingsCardPill>;
};
||||||| bc50ba56aa
type GridProvider = Provider & { models: Model[] };

interface ProviderGridProps {
  providers: readonly GridProvider[];
  /** Null while the integration list is loading; cards then show no status. */
  integrations: readonly IntegrationInfo[] | null;
  directory: string | null;
  onSelect: (providerId: string) => void;
  onConnect: () => void;
  onOpenClassification: () => void;
  /** Providers turned off in the user's config; null where the runtime cannot tell. */
  disabledProviders?: readonly string[] | null;
  onEnableProvider?: (providerId: string) => void;
}
=======
type GridProvider = Provider & { models: Model[] };

const BILLING_KEY_BY_PROVIDER = new Map<string, I18nKey>([
  ['opencode', 'settings.providers.card.billing.payPerUse'],
  ['opencode-go', 'settings.providers.card.billing.subscription'],
]);

interface ProviderGridProps {
  providers: readonly GridProvider[];
  integrations: readonly IntegrationInfo[] | null;
  directory: string | null;
  onSelect: (providerId: string) => void;
  onConnect: () => void;
  onOpenClassification: () => void;
  disabledProviders?: readonly string[] | null;
  onEnableProvider?: (providerId: string) => void;
}
>>>>>>> upstream/main

<<<<<<< HEAD
/**
 * The card's badges: its state, plus the environment source whenever a
 * variable backs the provider. Both show while a stored key wins, because the
 * key being used and the variable still being set are separate facts.
 */
const StatusPills: React.FC<{ status: ProviderCardStatus }> = ({ status }) => {
||||||| bc50ba56aa
/**
 * Providers configured in the selected project's own config. Everything else
 * comes from the user's config, credentials or the environment. Read through
 * the OpenChamber-only source endpoint, because the SDK does not expose which
 * config file defined a provider.
 */
const useProjectProviderIds = (providers: readonly GridProvider[], directory: string | null): ReadonlySet<string> => {
  const [projectIds, setProjectIds] = React.useState<ReadonlySet<string>>(() => new Set());

  React.useEffect(() => {
    let cancelled = false;
    const query = directory ? `?directory=${encodeURIComponent(directory)}` : '';
    void Promise.all(providers.map(async (provider) => {
      try {
        const response = await runtimeFetch(`/api/provider/${encodeURIComponent(provider.id)}/source${query}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null);
        const sources = payload?.sources ?? payload?.data?.sources;
        return sources?.project?.exists === true ? provider.id : null;
      } catch {
        // A provider whose source cannot be read just loses its Project chip.
        return null;
      }
    })).then((ids) => {
      if (!cancelled) setProjectIds(new Set(ids.filter((id): id is string => id !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [directory, providers]);

  return projectIds;
};

const StatusPill: React.FC<{ status: ProviderCardStatus }> = ({ status }) => {
=======
const useProjectProviderIds = (providers: readonly GridProvider[], directory: string | null): ReadonlySet<string> => {
  const [projectIds, setProjectIds] = React.useState<ReadonlySet<string>>(() => new Set());

  React.useEffect(() => {
    let cancelled = false;
    const query = directory ? `?directory=${encodeURIComponent(directory)}` : '';
    void Promise.all(providers.map(async (provider) => {
      try {
        const response = await runtimeFetch(`/api/provider/${encodeURIComponent(provider.id)}/source${query}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null);
        const sources = payload?.sources ?? payload?.data?.sources;
        return sources?.project?.exists === true ? provider.id : null;
      } catch {
        return null;
      }
    })).then((ids) => {
      if (!cancelled) setProjectIds(new Set(ids.filter((id): id is string => id !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [directory, providers]);

  return projectIds;
};

const StatusPill: React.FC<{ status: ProviderCardStatus }> = ({ status }) => {
>>>>>>> upstream/main
  const { t } = useI18n();
  if (status.kind === 'environment') {
    return <EnvironmentPill environment={status.environment} />;
  }
  return (
    <>
      <SettingsCardPill tone={status.kind === 'connected' ? 'success' : 'warning'}>
        {status.kind === 'connected'
          ? t('settings.providers.card.status.connected')
          : t('settings.providers.card.status.signInNeeded')}
      </SettingsCardPill>
      {status.environment ? <EnvironmentPill environment={status.environment} /> : null}
    </>
  );
};

<<<<<<< HEAD
interface ProviderGridProps {
  providers: readonly Provider[];
  models: readonly Model[];
  /** Providers whose environment credential a saved key would outrank. */
  keyProviders: ReadonlySet<string>;
  onSelect: (providerId: string) => void;
  onConnect: () => void;
  onAddKey: (providerId: string) => void;
  onOpenClassification: () => void;
  loadFailed?: boolean;
  onRetry?: () => void;
}

/** Browse view of the Providers page: one card per provider the workspace reports. */
export const ProviderGrid: React.FC<ProviderGridProps> = ({
  providers,
  models,
  keyProviders,
  onSelect,
  onConnect,
  onAddKey,
  onOpenClassification,
  loadFailed = false,
  onRetry,
}) => {
||||||| bc50ba56aa
/** Browse view of the Providers page: one card per provider OpenCode reports. */
export const ProviderGrid: React.FC<ProviderGridProps> = ({ providers, integrations, directory, onSelect, onConnect, onOpenClassification, disabledProviders, onEnableProvider }) => {
=======
export const ProviderGrid: React.FC<ProviderGridProps> = ({ providers, integrations, directory, onSelect, onConnect, onOpenClassification, disabledProviders, onEnableProvider }) => {
>>>>>>> upstream/main
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
<<<<<<< HEAD
  // Alphabetical by name, so a card is found by scanning rather than in the
  // order the providers happened to be configured.
||||||| bc50ba56aa
  const projectIds = useProjectProviderIds(providers, directory);
  // Alphabetical by name, so a card is found by scanning rather than in the
  // order the providers happened to be configured.
=======
  const projectIds = useProjectProviderIds(providers, directory);
>>>>>>> upstream/main
  const alphabetical = React.useMemo(() => [...providers].sort((a, b) =>
    (a.name || a.providerId).localeCompare(b.name || b.providerId, undefined, { sensitivity: 'base' })), [providers]);
  const filtered = rankByQuery(alphabetical, query, (provider) => [provider.name || provider.providerId, provider.providerId]);
  const hasQuery = query.trim().length > 0;
<<<<<<< HEAD
  const modelCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const model of models) counts[model.provider] = (counts[model.provider] ?? 0) + 1;
    return counts;
  }, [models]);
  // The Host refuses new providers and credentials; this only keeps the way in hidden.
||||||| bc50ba56aa
  // The server refuses new providers and keys; this only keeps the way in hidden.
=======
>>>>>>> upstream/main
  const locked = useEnterpriseMode();

  return (
    <SettingsPageLayout
      title={t('settings.page.providers.title')}
      description={t('settings.providers.native.description')}
      headerEnd={<SettingsProjectSelector className={SETTINGS_WIDTH_SHORT_TEXT_CLASS} />}
    >
      {locked ? <div className="mb-4"><EnterpriseProvidersNotice /></div> : null}
      {loadFailed ? (
        <div className="mb-4 flex flex-col gap-2">
          <p role="alert" className="typography-meta text-[var(--status-error)]">{t('settings.providers.page.state.unableToLoadProviderList')}</p>
          {onRetry ? (
            <Button variant="outline" size="xs" className="!font-normal" onClick={onRetry}>
              {t('settings.providers.page.actions.tryAgain')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {providers.length > 0 ? (
        <SettingsCardSearch value={query} onChange={setQuery} placeholder={t('settings.providers.grid.searchPlaceholder')} />
      ) : null}

      {providers.length === 0 ? (
        <p className="py-6 typography-meta text-muted-foreground">{t('settings.providers.grid.empty')}</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 typography-meta text-muted-foreground">{t('settings.providers.grid.noMatches', { query: query.trim() })}</p>
      ) : null}

      <div className={SETTINGS_CARD_GRID_CLASS}>
        {hasQuery || locked ? null : (
          <SettingsAddCard
            label={t('settings.providers.grid.connect')}
            hint={t('settings.providers.grid.connectHint')}
            onClick={onConnect}
            settingsItem="providers.connect"
          />
        )}
        {hasQuery ? null : <ClassificationCard onOpen={onOpenClassification} />}
        {filtered.map((provider) => {
<<<<<<< HEAD
          const status = getProviderCardStatus(provider);
          const count = modelCounts[provider.providerId] ?? 0;
          // An environment-backed credential can still be outranked by a key
          // saved here, so those cards offer the key form directly. Enterprise
          // mode refuses credential writes, so the way in stays hidden.
          const offerKey = !locked && keyProviders.has(provider.providerId);
          const name = provider.name || provider.providerId;
||||||| bc50ba56aa
          const status = getProviderCardStatus({
            integrations,
            providerId: provider.id,
            optionsApiKey: readProviderApiKeySetting(provider),
            machineCredentials: usesMachineCredentials(provider),
            noModels: provider.models.length === 0,
          });
=======
          const status = getProviderCardStatus({
            integrations,
            providerId: provider.id,
            optionsApiKey: readProviderApiKeySetting(provider),
            machineCredentials: usesMachineCredentials(provider),
            noModels: provider.models.length === 0,
          });
          const billingKey = BILLING_KEY_BY_PROVIDER.get(provider.id);
>>>>>>> upstream/main
          return (
            <SettingsCard
<<<<<<< HEAD
              key={provider.providerId}
              icon={<ProviderLogo providerId={provider.providerId} className="size-5" />}
              title={name}
              badges={status ? <StatusPills status={status} /> : null}
||||||| bc50ba56aa
              key={provider.id}
              icon={<ProviderLogo providerId={provider.id} className="size-5" />}
              title={provider.name || provider.id}
              badges={status ? <StatusPill status={status} /> : null}
=======
              key={provider.id}
              icon={<ProviderLogo providerId={provider.id} className="size-5" />}
              title={provider.name || provider.id}
              description={billingKey ? t(billingKey) : undefined}
              badges={status ? <StatusPill status={status} /> : null}
>>>>>>> upstream/main
              footer={(
                <span
                  className="inline-flex items-center gap-1"
                  aria-label={t('settings.providers.card.models', { count })}
                >
                  <Icon name="stack" className="size-3.5 opacity-70" aria-hidden />
                  <span className="tabular-nums">{count}</span>
                </span>
              )}
              control={offerKey ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className={SETTINGS_ICON_BUTTON_CLASS}
                  aria-label={t('settings.providers.page.actions.addKeyFor', { provider: name })}
                  title={t('settings.providers.page.actions.addKeyFor', { provider: name })}
                  onClick={() => onAddKey(provider.providerId)}
                >
                  <Icon name="key" className="size-4" />
                </Button>
              ) : undefined}
              onOpen={() => onSelect(provider.providerId)}
            />
          );
        })}
      </div>
<<<<<<< HEAD
||||||| bc50ba56aa

      {/* OpenCode drops a disabled provider from its list, so this is the only way back. */}
      {disabledProviders && disabledProviders.length > 0 && onEnableProvider ? (
        <SettingsSection title={t('settings.providers.disabled.title')} info={t('settings.providers.disabled.info')}>
          <div className="space-y-1">
            {disabledProviders.map((providerId) => (
              <div key={providerId} className="flex items-center gap-2 py-1">
                <ProviderLogo providerId={providerId} className="size-4 shrink-0 opacity-60" />
                <span className="min-w-0 flex-1 truncate typography-ui-label text-muted-foreground">{providerId}</span>
                <Button size="xs" variant="outline" className="!font-normal" onClick={() => onEnableProvider(providerId)}>
                  {t('settings.providers.disabled.enable')}
                </Button>
              </div>
            ))}
          </div>
        </SettingsSection>
      ) : null}
=======

      {disabledProviders && disabledProviders.length > 0 && onEnableProvider ? (
        <SettingsSection title={t('settings.providers.disabled.title')} info={t('settings.providers.disabled.info')}>
          <div className="space-y-1">
            {disabledProviders.map((providerId) => (
              <div key={providerId} className="flex items-center gap-2 py-1">
                <ProviderLogo providerId={providerId} className="size-4 shrink-0 opacity-60" />
                <span className="min-w-0 flex-1 truncate typography-ui-label text-muted-foreground">{providerId}</span>
                <Button size="xs" variant="outline" className="!font-normal" onClick={() => onEnableProvider(providerId)}>
                  {t('settings.providers.disabled.enable')}
                </Button>
              </div>
            ))}
          </div>
        </SettingsSection>
      ) : null}
>>>>>>> upstream/main
    </SettingsPageLayout>
  );
};
