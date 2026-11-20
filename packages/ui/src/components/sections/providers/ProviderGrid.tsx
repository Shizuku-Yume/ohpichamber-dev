import { runtimeFetch } from '@/lib/runtime-fetch';
import React from 'react';
import type { Integration as Model, Provider } from '@openchamber/agent-contract';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
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
import {
  getProviderCardStatus,
  type ProviderCardStatus,
  type ProviderEnvironmentStatus,
} from './providerAuth';

/**
 * Enterprise mode already refuses provider and credential entry in the Host.
 * The native catalog carries no provider-policy file, so the notice states the
 * gate that applies here rather than borrowing OpenCode policy wording.
 */
const EnterpriseProvidersNotice: React.FC = () => {
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

/**
 * Classification providers answer OpenChamber's own Jev decisions (safety
 * net, Auto), not the native model catalog, so they get one card of their own
 * that opens a dedicated page.
 */
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

const EnvironmentPill: React.FC<{ environment: ProviderEnvironmentStatus | null }> = ({ environment }) => {
  const { t } = useI18n();
  const label = environment?.variable
    ? t('settings.providers.card.status.environmentVariable', { variable: environment.variable })
    : t('settings.providers.card.status.environment');
  return <SettingsCardPill tone="neutral">{label}</SettingsCardPill>;
};

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
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const projectIds = useProjectProviderIds(providers, directory);
  const alphabetical = React.useMemo(() => [...providers].sort((a, b) =>
    (a.name || a.providerId).localeCompare(b.name || b.providerId, undefined, { sensitivity: 'base' })), [providers]);
  const filtered = rankByQuery(alphabetical, query, (provider) => [provider.name || provider.providerId, provider.providerId]);
  const hasQuery = query.trim().length > 0;
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
          const status = getProviderCardStatus(provider);
          const count = modelCounts[provider.providerId] ?? 0;
          // An environment-backed credential can still be outranked by a key
          // saved here, so those cards offer the key form directly. Enterprise
          // mode refuses credential writes, so the way in stays hidden.
          const offerKey = !locked && keyProviders.has(provider.providerId);
          const name = provider.name || provider.providerId;
          const billingKey = BILLING_KEY_BY_PROVIDER.get(provider.providerId);
          return (
            <SettingsCard
              key={provider.providerId}
              icon={<ProviderLogo providerId={provider.providerId} className="size-5" />}
              title={name}
              description={billingKey ? t(billingKey) : undefined}
              badges={status ? <StatusPills status={status} /> : null}
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
    </SettingsPageLayout>
  );
};
