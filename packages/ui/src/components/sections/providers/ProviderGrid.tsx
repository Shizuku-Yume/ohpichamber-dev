import React from 'react';
import type { Provider, Model } from '@openchamber/agent-contract';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { SettingsCard, SettingsCardPill, SETTINGS_CARD_GRID_CLASS } from '@/components/sections/shared/SettingsCards';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

export function ProviderGrid({ providers, models, onSelect }: { providers: Provider[]; models: Model[]; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const counts: Record<string, number> = {};
  for (const model of models) counts[model.provider] = (counts[model.provider] ?? 0) + 1;
  const visible = providers.filter((provider) => `${provider.name} ${provider.providerId}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-3">
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('settings.providers.grid.searchPlaceholder')} />
    <div className={SETTINGS_CARD_GRID_CLASS}>{visible.map((provider) => <SettingsCard key={provider.providerId}
      title={provider.name} subtitle={provider.providerId} icon={<ProviderLogo providerId={provider.providerId} className="size-8" />}
      badges={<SettingsCardPill tone={provider.auth.status === 'configured' ? 'success' : 'neutral'}>{t(provider.auth.status === 'configured'
        ? 'settings.providers.card.status.connected' : 'settings.providers.card.status.signInNeeded')}</SettingsCardPill>}
      footer={t('settings.providers.card.models', { count: counts[provider.providerId] ?? 0 })} onOpen={() => onSelect(provider.providerId)} />)}</div>
    {!visible.length && <p className="text-sm text-muted-foreground">{query ? t('settings.providers.grid.noMatches', { query }) : t('settings.providers.grid.empty')}</p>}
  </div>;
}
