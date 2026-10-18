import React from 'react';
import type { ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

export function CustomProviderModelDiscovery({ models, existingIds, onImport, onCancel }: {
  models: ProviderModelDiscoveryResult['models']; existingIds: ReadonlySet<string>;
  onImport: (models: ProviderModelDiscoveryResult['models']) => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(models.filter((model) => !existingIds.has(model.modelId)).map((model) => model.modelId)));
  const [query, setQuery] = React.useState('');
  return <div className="space-y-3 rounded-lg border p-3">
    <h3 className="text-sm font-medium">{t('settings.providers.page.custom.discovery.review')}</h3>
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('settings.providers.page.models.filterPlaceholder')} />
    <div className="max-h-72 space-y-2 overflow-y-auto">
      {models.filter((model) => `${model.name} ${model.modelId}`.toLowerCase().includes(query.toLowerCase())).map((model) => <label key={model.modelId} className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={existingIds.has(model.modelId)} checked={selected.has(model.modelId)} onChange={(event) => setSelected((previous) => {
          const next = new Set(previous);
          if (event.target.checked) next.add(model.modelId); else next.delete(model.modelId);
          return next;
        })} />
        <span>{model.name} <span className="text-muted-foreground">{model.modelId}</span></span>
        {existingIds.has(model.modelId) && <span>{t('settings.providers.page.custom.discovery.alreadyAdded')}</span>}
      </label>)}
    </div>
    <div className="flex gap-2">
      <Button type="button" size="sm" disabled={!selected.size} onClick={() => onImport(models.filter((model) => selected.has(model.modelId)))}>{t('settings.providers.page.custom.discovery.importSelected', { count: selected.size })}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>{t('settings.providers.page.actions.cancel')}</Button>
    </div>
  </div>;
}
