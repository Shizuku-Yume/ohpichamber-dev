import React from 'react';
import type { ProviderOAuthMethods as Methods, ProviderOAuthRequest, ProviderOAuthResult } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { openExternalUrl } from '@/lib/url';
import { getRuntimeKey } from '@/lib/runtime-switch';

type Attempt = { method: Methods['methods'][number]; flow: ProviderOAuthResult; expectedRevision: string };

export function ProviderOAuthMethods({ workspaceId, revision, methods, onConnected, disabled = false }: {
  workspaceId: string; revision: string; methods: Methods['methods']; onConnected: () => Promise<void>; disabled?: boolean;
}) {
  const { t } = useI18n();
  const [attempt, setAttempt] = React.useState<Attempt | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  const owner = React.useRef({ active: true, serial: 0, runtime: getRuntimeKey(), attempt: null as Attempt | null });

  React.useEffect(() => {
    const lifetime = owner.current;
    lifetime.active = true;
    return () => {
      lifetime.active = false; lifetime.serial++;
      const current = lifetime.attempt;
      if (current && current.flow.status !== 'authenticated' && lifetime.runtime === getRuntimeKey()) {
        void canonicalClient.providerOAuth(workspaceId, current.method.methodId, {
          action: 'cancel', flowId: current.flow.flowId, generation: current.flow.generation,
        }).catch(() => { /* Host disconnect/restart also retires the bound flow. */ });
      }
    };
  }, [workspaceId]);

  const send = async (method: Methods['methods'][number], request: ProviderOAuthRequest, expectedRevision: string) => {
    const lifetime = owner.current;
    const serial = ++lifetime.serial;
    setBusy(true); setFailed(false);
    try {
      const flow = await canonicalClient.providerOAuth(workspaceId, method.methodId, request);
      if (!lifetime.active || lifetime.runtime !== getRuntimeKey() || serial !== lifetime.serial) {
        if (request.action === 'start' && lifetime.runtime === getRuntimeKey()) {
          void canonicalClient.providerOAuth(workspaceId, method.methodId, { action: 'cancel', flowId: flow.flowId, generation: flow.generation }).catch(() => {});
        }
        return;
      }
      if (flow.providerId !== method.storeCredentialsAs) throw new Error('OAuth provider identity mismatch');
      if (flow.status === 'cancelled') {
        lifetime.attempt = null; setAttempt(null); setInput('');
      } else {
        const next = { method, flow, expectedRevision };
        lifetime.attempt = next; setAttempt(next);
        if (flow.status === 'failed') setFailed(true);
        if (flow.status === 'authenticated') { setInput(''); await onConnected(); }
      }
    } catch {
      if (lifetime.active && serial === lifetime.serial && lifetime.runtime === getRuntimeKey()) setFailed(true);
    } finally {
      if (lifetime.active && serial === lifetime.serial) setBusy(false);
    }
  };

  React.useEffect(() => {
    if (!attempt || attempt.flow.status !== 'pending' || busy || failed || disabled) return;
    const timer = setTimeout(() => {
      void send(attempt.method, { action: 'status', flowId: attempt.flow.flowId, generation: attempt.flow.generation }, attempt.expectedRevision);
    }, 1500);
    return () => clearTimeout(timer);
    // send deliberately reads the latest mounted lifetime; one outstanding request per flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, busy, failed, disabled]);

  const active = attempt && (attempt.flow.status === 'pending' || attempt.flow.status === 'ready');
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">{methods.map((method) => <Button key={method.methodId} type="button" variant="outline" disabled={busy || Boolean(active) || disabled}
      onClick={() => { setInput(''); void send(method, { action: 'start', expectedRevision: revision }, revision); }}>{method.name}</Button>)}</div>
    {attempt && <div className="space-y-3 rounded-lg border p-3">
      {attempt.flow.instructions && <p className="whitespace-pre-wrap text-sm">{attempt.flow.instructions}</p>}
      {attempt.flow.authorizationUrl && <div className="space-y-2">
        <p className="break-all text-xs text-muted-foreground">{attempt.flow.authorizationUrl}</p>
        <Button type="button" variant="outline" onClick={() => void openExternalUrl(attempt.flow.authorizationUrl!)}>{t('settings.providers.page.actions.open')}</Button>
      </div>}
      {attempt.flow.status === 'pending' && <p role="status" className="text-sm">{t('settings.providers.page.auth.oauth.waiting')}</p>}
      {attempt.flow.manualInput && attempt.flow.status === 'pending' && <form className="space-y-2" onSubmit={(event) => {
        event.preventDefault();
        if (!input || busy || disabled) return;
        const value = input; setInput('');
        void send(attempt.method, { action: 'input', flowId: attempt.flow.flowId, generation: attempt.flow.generation, input: value }, attempt.expectedRevision);
      }}>
        <label className="block space-y-1 text-sm">{attempt.flow.prompt || t('settings.providers.page.auth.oauth.codeHint')}
          <Input type="password" autoComplete="off" value={input} disabled={busy || disabled} onChange={(event) => setInput(event.target.value)}
            placeholder={t('settings.providers.page.auth.pasteAuthorizationCodePlaceholder')} />
        </label>
        <Button type="submit" disabled={!input || busy || disabled}>{t('settings.providers.page.actions.continue')}</Button>
      </form>}
      {attempt.flow.status === 'ready' && <Button type="button" disabled={busy || disabled} onClick={() => void send(attempt.method, {
        action: 'commit', flowId: attempt.flow.flowId, generation: attempt.flow.generation, expectedRevision: attempt.expectedRevision,
      }, attempt.expectedRevision)}>{t('settings.providers.page.actions.complete')}</Button>}
      {active && <Button type="button" variant="ghost" disabled={busy} onClick={() => void send(attempt.method, {
        action: 'cancel', flowId: attempt.flow.flowId, generation: attempt.flow.generation,
      }, attempt.expectedRevision)}>{t('settings.providers.page.actions.cancel')}</Button>}
      {attempt.flow.status === 'authenticated' && <p role="status" className="text-sm">{t('settings.providers.page.toast.oauthCompleted')}</p>}
      {failed && attempt.flow.status === 'pending' && <Button type="button" variant="outline" disabled={busy} onClick={() => void send(attempt.method, {
        action: 'status', flowId: attempt.flow.flowId, generation: attempt.flow.generation,
      }, attempt.expectedRevision)}>{t('settings.providers.page.actions.tryAgain')}</Button>}
    </div>}
    {failed && <p role="alert" className="text-sm text-[var(--status-error)]">{t('settings.providers.page.toast.oauthCompleteFailed')}</p>}
  </div>;
}
