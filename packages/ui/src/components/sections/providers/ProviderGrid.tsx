import React from 'react';
import type { Model, Provider } from '@openchamber/agent-contract';
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
  SettingsCardToolbar,
  type SettingsCardTone,
} from '@/components/sections/shared/SettingsCards';
import { SETTINGS_CALLOUT_TITLE_CLASS } from '@/components/sections/shared/SettingsSection';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';
import { useRoutingStore } from '@/stores/useRoutingStore';
import { getProviderCardStatus, type ProviderCardStatus } from './providerAuth';

/**
 * Enterprise mode already refuses provider and credential entry in the Host.
 * The native catalog carries no provider-policy file, so the notice states the
 * gate that applies here rather than borrowing OpenCode policy wording.
 */
const EnterpriseProvidersNotice: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-[var(--status-info-border)] bg-[var(--status-info-background)]/30 p-3">
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
  // Off is a choice, not a problem to fix, so it gets no warning.
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

const StatusPill: React.FC<{ status: ProviderCardStatus }> = ({ status }) => {
  const { t } = useI18n();
<<<<<<< HEAD
  const label = status.kind === 'connected'
    ? t('settings.providers.card.status.connected')
    : status.kind === 'environment'
      ? t('settings.providers.card.status.environment')
      : t('settings.providers.card.status.signInNeeded');
  const tone: SettingsCardTone = status.kind === 'connected'
    ? 'success'
=======
  let label: string;
  switch (status.kind) {
    case 'reauthNeeded': label = t('settings.providers.card.status.reauthNeeded'); break;
    case 'accounts': label = t('settings.providers.card.status.accounts', { count: status.count }); break;
    case 'connected': label = t('settings.providers.card.status.connected'); break;
    case 'noModels': label = t('settings.providers.card.status.noModels'); break;
    case 'environment': label = t('settings.providers.card.status.environment'); break;
    case 'signInNeeded': label = t('settings.providers.card.status.signInNeeded'); break;
  }
  const tone: SettingsCardTone = status.kind === 'signInNeeded' || status.kind === 'reauthNeeded' || status.kind === 'noModels'
    ? 'warning'
>>>>>>> bc50ba56a
    : status.kind === 'environment'
      ? 'neutral'
      : 'warning';
  return <SettingsCardPill tone={tone}>{label}</SettingsCardPill>;
};

interface ProviderGridProps {
  providers: readonly Provider[];
  models: readonly Model[];
  onSelect: (providerId: string) => void;
  onConnect: () => void;
  onOpenClassification: () => void;
  loadFailed?: boolean;
  onRetry?: () => void;
}

/** Browse view of the Providers page: one card per provider the workspace reports. */
export const ProviderGrid: React.FC<ProviderGridProps> = ({
  providers,
  models,
  onSelect,
  onConnect,
  onOpenClassification,
  loadFailed = false,
  onRetry,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  // Alphabetical by name, so a card is found by scanning rather than in the
  // order the providers happened to be configured.
  const alphabetical = React.useMemo(() => [...providers].sort((a, b) =>
    (a.name || a.providerId).localeCompare(b.name || b.providerId, undefined, { sensitivity: 'base' })), [providers]);
  const filtered = rankByQuery(alphabetical, query, (provider) => [provider.name || provider.providerId, provider.providerId]);
  const hasQuery = query.trim().length > 0;
  const modelCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const model of models) counts[model.provider] = (counts[model.provider] ?? 0) + 1;
    return counts;
  }, [models]);
  // The Host refuses new providers and credentials; this only keeps the way in hidden.
  const locked = useEnterpriseMode();

  return (
    <SettingsPageLayout
      title={t('settings.page.providers.title')}
<<<<<<< HEAD
      description={t('settings.providers.native.description')}
      headerEnd={<SettingsProjectSelector className="w-full min-w-0 @xl:w-56" />}
    >
      {locked ? <EnterpriseProvidersNotice /> : null}
      {loadFailed ? (
        <div className="mb-4 space-y-2">
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
=======
      namedBySidebar
      className="[&>section:first-of-type]:pt-8"
    >
      {locked ? <EnterpriseProvidersNotice directory={directory} integrations={integrations} /> : null}
      <SettingsCardToolbar
        search={providers.length > 0 ? { value: query, onChange: setQuery, placeholder: t('settings.providers.grid.searchPlaceholder') } : null}
        actions={<SettingsProjectSelector className="min-w-0 w-56" />}
      />
>>>>>>> bc50ba56a

      {providers.length === 0 ? (
        <p className="py-6 typography-meta text-muted-foreground">{t('settings.providers.grid.empty')}</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 typography-meta text-muted-foreground">{t('settings.providers.grid.noMatches', { query: query.trim() })}</p>
      ) : null}

      <div className={SETTINGS_CARD_GRID_CLASS}>
        {/* The one way in to connecting a provider, so it leads the grid. */}
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
=======
          const status = getProviderCardStatus({
            integrations,
            providerId: provider.id,
            optionsApiKey: readProviderApiKeySetting(provider),
            machineCredentials: usesMachineCredentials(provider),
            noModels: provider.models.length === 0,
          });
>>>>>>> bc50ba56a
          return (
            <SettingsCard
              key={provider.providerId}
              icon={<ProviderLogo providerId={provider.providerId} className="size-5" />}
              title={provider.name || provider.providerId}
              badges={status ? <StatusPill status={status} /> : null}
              footer={(
                <span
                  className="inline-flex items-center gap-1"
                  aria-label={t('settings.providers.card.models', { count })}
                >
                  <Icon name="stack" className="size-3.5 opacity-70" aria-hidden />
                  <span className="tabular-nums">{count}</span>
                </span>
              )}
              onOpen={() => onSelect(provider.providerId)}
            />
          );
        })}
      </div>
    </SettingsPageLayout>
  );
};
