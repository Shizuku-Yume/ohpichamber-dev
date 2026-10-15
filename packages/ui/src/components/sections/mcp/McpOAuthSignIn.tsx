import React from 'react';
import type { MCPOAuthConfigInput, MCPOAuthResult, MCPOAuthRequest } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { resolveMcpDirectory } from '@/stores/useMcpConfigStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { openExternalUrl } from '@/lib/url';

interface McpOAuthSignInProps {
  serverId: string;
  directory: string | null;
  onConnected: () => void | Promise<void>;
}

export const McpOAuthSignIn: React.FC<McpOAuthSignInProps> = ({ serverId, directory, onConnected }) => {
  const { t } = useI18n();
  const [state, setState] = React.useState<MCPOAuthResult | null>(null);
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [callbackInput, setCallbackInput] = React.useState('');
  const [clientId, setClientId] = React.useState('');
  const [clientSecret, setClientSecret] = React.useState('');
  const [scopes, setScopes] = React.useState('');
  const [redirectUri, setRedirectUri] = React.useState('');
  const owner = React.useRef(0);
  React.useEffect(() => {
    const attempt = ++owner.current;
    setState(null); setWorkspaceId(null); setError(null); setBusy(false); setCallbackInput('');
    setClientId(''); setClientSecret(''); setScopes(''); setRedirectUri('');
    void (async () => {
      try {
        const workspace = await canonicalClient.resolveWorkspace(resolveMcpDirectory(directory));
        const result = await canonicalClient.getWorkspaceMcpOAuth(workspace.workspaceId, serverId);
        if (owner.current !== attempt) return;
        setWorkspaceId(workspace.workspaceId); setState(result);
      } catch (failure) { if (owner.current === attempt) setError(failure instanceof Error ? failure.message : String(failure)); }
    })();
    return () => { owner.current += 1; };
  }, [directory, serverId]);
  const submit = async (action: MCPOAuthRequest['action']) => {
    if (!state || !workspaceId || busy) return;
    const attempt = owner.current;
    const fields = { persistedRevision: state.persistedRevision, workerGeneration: state.worker.workerGeneration };
    setBusy(true); setError(null);
    try {
      let request: MCPOAuthRequest;
      if (action === 'start') {
        const oauth: MCPOAuthConfigInput = {
          ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
          ...(scopes.trim() ? { scopes: scopes.trim() } : {}),
          ...(redirectUri.trim() ? { redirectUri: redirectUri.trim() } : {}),
        };
        if (clientSecret) {
          const credential = await canonicalClient.writeWorkspaceMcpCredential(workspaceId, serverId, { persistedRevision: state.persistedRevision, value: clientSecret });
          if (owner.current !== attempt) return;
          oauth.clientSecretRef = credential.credentialRef;
          setClientSecret('');
        }
        request = { action, ...fields, ...(Object.keys(oauth).length ? { oauth } : {}) };
      } else if (action === 'disconnect') request = { action, ...fields };
      else {
        if (state.status !== 'pending') return;
        request = action === 'cancel' ? { action, ...fields, flowId: state.pendingFlow.flowId }
          : { action, ...fields, flowId: state.pendingFlow.flowId, ...(callbackInput.trim() ? { callbackInput: callbackInput.trim() } : {}) };
      }
      const result = await canonicalClient.submitWorkspaceMcpOAuth(workspaceId, serverId, request);
      if (owner.current !== attempt) return;
      setState(result); setCallbackInput('');
      if (result.status === 'authenticated') await onConnected();
    } catch (failure) { if (owner.current === attempt) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { if (owner.current === attempt) setBusy(false); }
  };
  return <section className="space-y-3">
    {error && <p role="alert" className="text-status-error">{error}</p>}
    {state && <>
      <p>{state.authenticated ? t('settings.mcp.page.status.label.connected') : t('settings.mcp.page.status.label.needsAuth')}</p>
      {state.status !== 'pending' && <>
        <Input aria-label={t('settings.mcp.page.advanced.oauthClientIdPlaceholder')} placeholder={t('settings.mcp.page.advanced.oauthClientIdPlaceholder')} value={clientId} onChange={event => setClientId(event.target.value)} />
        <Input type="password" autoComplete="off" aria-label={t('settings.mcp.page.advanced.oauthClientSecretPlaceholder')} placeholder={t('settings.mcp.page.advanced.oauthClientSecretPlaceholder')} value={clientSecret} onChange={event => setClientSecret(event.target.value)} />
        <Input aria-label={t('settings.mcp.page.advanced.oauthScopesPlaceholder')} placeholder={t('settings.mcp.page.advanced.oauthScopesPlaceholder')} value={scopes} onChange={event => setScopes(event.target.value)} />
        <Input aria-label={t('settings.mcp.page.advanced.oauthRedirectUriPlaceholder')} placeholder={t('settings.mcp.page.advanced.oauthRedirectUriPlaceholder')} value={redirectUri} onChange={event => setRedirectUri(event.target.value)} />
        <Button disabled={busy} onClick={() => void submit('start')}>{t('settings.mcp.page.actions.authorize')}</Button>
      </>}
      {state.status === 'pending' && <>
        <p>{state.pendingFlow.instructions}</p>
        <code className="break-all">{state.pendingFlow.authorizationUrl}</code>
        <Button onClick={() => void openExternalUrl(state.pendingFlow.launchUrl ?? state.pendingFlow.authorizationUrl).catch(failure => setError(String(failure)))}>{t('settings.mcp.page.actions.openInBrowser')}</Button>
        <Input aria-label={t('settings.mcp.page.auth.callbackInputPlaceholder')} placeholder={t('settings.mcp.page.auth.callbackInputPlaceholder')} value={callbackInput} onChange={event => setCallbackInput(event.target.value)} />
        <Button disabled={busy} onClick={() => void submit('complete')}>{t('settings.mcp.page.actions.completeAuthorization')}</Button>
        <Button disabled={busy} onClick={() => void submit('cancel')}>{t('settings.common.actions.cancel')}</Button>
      </>}
      {state.authenticated && <Button disabled={busy} onClick={() => void submit('disconnect')}>{t('settings.mcp.page.actions.clearAuth')}</Button>}
    </>}
  </section>;
};
