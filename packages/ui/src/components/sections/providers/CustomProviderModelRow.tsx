import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import type { ModelRow } from './custom-provider-form';

export function CustomProviderModelRow({ model, onChange, onRemove, disabled }: {
  model: ModelRow; onChange: (model: ModelRow) => void; onRemove: () => void; disabled?: boolean;
}) {
  const { t } = useI18n();
  return <fieldset disabled={disabled} className="space-y-3 rounded-lg border p-3">
    <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
      {(['modelId', 'name', 'contextWindow', 'maxOutputTokens'] as const).map((field) => {
        const key = { modelId: 'settings.providers.page.custom.models.idLabel', name: 'settings.providers.page.custom.models.nameLabel',
          contextWindow: 'settings.providers.page.custom.models.contextWindow', maxOutputTokens: 'settings.providers.page.custom.models.maxOutputTokens' } as const;
        return <label key={field} className="space-y-1 text-sm">{t(key[field])}
          <Input required value={model[field]} type={field === 'contextWindow' || field === 'maxOutputTokens' ? 'number' : 'text'}
            min={1} step={1} onChange={(event) => onChange({ ...model, [field]: event.target.value })} />
        </label>;
      })}
    </div>
    <details>
      <summary className="cursor-pointer text-sm">{t('settings.providers.native.modelDetails')}</summary>
      <label className="block space-y-1 text-sm">{t('settings.providers.native.modelDetailsHint')}
        <textarea className="min-h-48 w-full rounded-md border bg-transparent p-2 font-mono text-xs" value={model.details}
          spellCheck={false} onChange={(event) => onChange({ ...model, details: event.target.value })} />
      </label>
    </details>
    <Button type="button" size="sm" variant="ghost" onClick={onRemove}>{t('settings.providers.page.custom.models.remove')}</Button>
  </fieldset>;
}
