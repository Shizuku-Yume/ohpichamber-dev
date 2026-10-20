import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

export function ProviderApiKeyForm({ writeCanonicalKey, disabled = false }: {
  writeCanonicalKey: (apiKey: string) => Promise<void>; disabled?: boolean;
}) {
  const { t } = useI18n();
  const [apiKey, setApiKey] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  return <form className="space-y-3" onSubmit={(event) => {
    event.preventDefault();
    if (!apiKey || saving || disabled) return;
    setSaving(true); setFailed(false);
    void writeCanonicalKey(apiKey).then(() => setApiKey('')).catch(() => setFailed(true)).finally(() => setSaving(false));
  }}>
    <label className="block space-y-1 text-sm">{t('settings.providers.page.auth.apiKeyLabel')}
      <Input required type="password" autoComplete="new-password" disabled={saving || disabled} value={apiKey}
        onChange={(event) => setApiKey(event.target.value)} placeholder={t('settings.providers.page.auth.apiKeyPlaceholder')} />
    </label>
    <p className="text-xs text-muted-foreground">{t('settings.providers.native.secretHint')}</p>
    {failed && <p role="alert" className="text-sm text-[var(--status-error)]">{t('settings.providers.page.toast.apiKeySaveFailed')}</p>}
    <Button type="submit" disabled={!apiKey || saving || disabled}>{t(saving ? 'settings.providers.page.actions.saving' : 'settings.providers.page.actions.saveKey')}</Button>
  </form>;
}
