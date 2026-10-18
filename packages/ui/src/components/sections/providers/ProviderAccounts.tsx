import React from 'react';
import type { ProviderAccounts as Accounts, ProviderAccountMutationRequest } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

export function ProviderAccounts({ roster, onMutate, disabled = false }: {
  roster: Accounts; onMutate: (request: ProviderAccountMutationRequest) => Promise<void>; disabled?: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [label, setLabel] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mutate = async (request: ProviderAccountMutationRequest) => {
    if (busy || disabled) return;
    setBusy(true); setError(null);
    try { await onMutate(request); setEditing(null); }
    catch { setError(t(request.action === 'label' ? 'settings.providers.accounts.toast.renameFailed'
      : request.action === 'select' ? 'settings.providers.accounts.toast.switchFailed' : 'settings.providers.accounts.toast.removeFailed')); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3">
    {roster.accounts.map((account, index) => {
      const name = account.label || account.email || account.accountId || `${t(account.method === 'oauth' ? 'settings.providers.accounts.method.oauth' : 'settings.providers.accounts.method.key')} ${index + 1}`;
      return <div key={account.credentialRef} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <div className="min-w-36 flex-1">
          <p className="break-words text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{t(account.active ? 'settings.providers.accounts.active'
            : account.method === 'oauth' ? 'settings.providers.accounts.method.oauthUnused' : 'settings.providers.accounts.method.keyUnused')}</p>
        </div>
        {editing === account.credentialRef ? <form className="flex flex-wrap gap-2" onSubmit={(event) => {
          event.preventDefault();
          void mutate({ action: 'label', expectedRevision: roster.revision, credentialRef: account.credentialRef, label });
        }}>
          <Input aria-label={t('settings.providers.accounts.nameAria')} autoFocus maxLength={128} disabled={busy || disabled} value={label} onChange={(event) => setLabel(event.target.value)} />
          <Button type="submit" size="sm" disabled={busy || disabled}>{t('settings.providers.accounts.save')}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>{t('settings.providers.page.actions.cancel')}</Button>
        </form> : <>
          {!account.active && <Button type="button" size="sm" variant="outline" disabled={busy || disabled || account.disabled}
            aria-label={t('settings.providers.accounts.useAria', { account: name })}
            onClick={() => void mutate({ action: 'select', expectedRevision: roster.revision, credentialRef: account.credentialRef })}>{t('settings.providers.accounts.use')}</Button>}
          <Button type="button" size="sm" variant="ghost" disabled={busy || disabled} onClick={() => { setEditing(account.credentialRef); setLabel(account.label ?? ''); }}>{t('settings.providers.accounts.rename')}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy || disabled}
            onClick={() => void mutate({ action: 'remove', expectedRevision: roster.revision, credentialRef: account.credentialRef })}>{t('settings.providers.accounts.remove')}</Button>
        </>}
      </div>;
    })}
    {error && <p role="alert" className="text-sm text-[var(--status-error)]">{error}</p>}
  </div>;
}
