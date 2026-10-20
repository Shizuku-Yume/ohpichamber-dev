import React from 'react';
import type { MCPOAuthConfigInput, MCPOAuthResult, MCPOAuthRequest } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { resolveMcpDirectory } from '@/stores/useMcpConfigStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { SettingsFieldRow, SETTINGS_HELPER_CLASS } from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { openExternalUrl } from '@/lib/url';

interface McpOAuthSignInProps {
  serverId: string;
  directory: string | null;
  onConnected: () => void | Promise<void>;
}

/** Native MCP OAuth flow: configuration, pending browser handoff and connection state. */
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
    const runtimeKey = getRuntimeKey();
    setState(null);
    setWorkspaceId(null);
    setError(null);
    setBusy(false);
    setCallbackInput('');
    setClientId('');
    setClientSecret('');
    setScopes('');
    setRedirectUri('');
    void (async () => {
      try {
        const workspace = await canonicalClient.resolveWorkspace(resolveMcpDirectory(directory));
        if (owner.current !== attempt || getRuntimeKey() !== runtimeKey) return;
        const result = await canonicalClient.getWorkspaceMcpOAuth(workspace.workspaceId, serverId);
        if (owner.current !== attempt || getRuntimeKey() !== runtimeKey) return;
        setWorkspaceId(workspace.workspaceId);
        setState(result);
      } catch (failure) {
        if (owner.current === attempt) setError(failure instanceof Error ? failure.message : String(failure));
      }
    })();
    return () => { owner.current += 1; };
  }, [directory, serverId]);

  const submit = async (action: MCPOAuthRequest['action']) => {
    if (!state || !workspaceId || busy) return;
    const attempt = owner.current;
    const runtimeKey = getRuntimeKey();
    const assertRuntime = () => {
      if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed.');
    };
    const fields = { persistedRevision: state.persistedRevision, workerGeneration: state.worker.workerGeneration };
    setBusy(true);
    setError(null);
    try {
      assertRuntime();
      let request: MCPOAuthRequest;
      if (action === 'start') {
        const oauth: MCPOAuthConfigInput = {};
        const trimmedClientId = clientId.trim();
        const trimmedScopes = scopes.trim();
        const trimmedRedirectUri = redirectUri.trim();
        if (trimmedClientId) oauth.clientId = trimmedClientId;
        if (trimmedScopes) oauth.scopes = trimmedScopes;
        if (trimmedRedirectUri) oauth.redirectUri = trimmedRedirectUri;
        if (clientSecret) {
          assertRuntime();
          const credential = await canonicalClient.writeWorkspaceMcpCredential(workspaceId, serverId, { persistedRevision: state.persistedRevision, value: clientSecret });
          assertRuntime();
          if (owner.current !== attempt) return;
          oauth.clientSecretRef = credential.credentialRef;
          setClientSecret('');
        }
        request = Object.keys(oauth).length > 0
          ? { action, ...fields, oauth }
          : { action, ...fields };
      } else if (action === 'disconnect') {
        request = { action, ...fields };
      } else {
        if (state.status !== 'pending') return;
        const flowId = state.pendingFlow.flowId;
        const callback = callbackInput.trim();
        request = action === 'cancel'
          ? { action, ...fields, flowId }
          : callback
            ? { action, ...fields, flowId, callbackInput: callback }
            : { action, ...fields, flowId };
      }
      assertRuntime();
      const result = await canonicalClient.submitWorkspaceMcpOAuth(workspaceId, serverId, request);
      assertRuntime();
      if (owner.current !== attempt) return;
      setState(result);
      setCallbackInput('');
      if (result.status === 'authenticated') await onConnected();
    } catch (failure) {
      if (owner.current === attempt) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (owner.current === attempt) setBusy(false);
    }
  };

  const openAuthorizationUrl = (url: string) => {
    void openExternalUrl(url).catch((failure) => setError(String(failure)));
  };

  const copyAuthorizationUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('settings.mcp.page.toast.authorizationUrlCopied'));
    } catch {
      toast.error(t('settings.mcp.page.toast.authorizationUrlCopyFailed'));
    }
  };

  return (
    <div className="space-y-4">
      {error ? <p role="alert" className="typography-meta text-[var(--status-error)]">{error}</p> : null}
      {state ? (
        <>
          <p className={SETTINGS_HELPER_CLASS}>
            {state.authenticated ? t('settings.mcp.page.status.label.connected') : t('settings.mcp.page.status.label.needsAuth')}
          </p>

          {state.status !== 'pending' ? (
            <div className="space-y-3">
              <SettingsFieldRow label={t('settings.mcp.page.advanced.oauthClientIdPlaceholder')}>
                <Input
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder={t('settings.mcp.page.advanced.oauthClientIdPlaceholder')}
                  aria-label={t('settings.mcp.page.advanced.oauthClientIdPlaceholder')}
                  className="h-8 w-full max-w-sm"
                  disabled={busy}
                />
              </SettingsFieldRow>
              <SettingsFieldRow label={t('settings.mcp.page.advanced.oauthClientSecretPlaceholder')}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  placeholder={t('settings.mcp.page.advanced.oauthClientSecretPlaceholder')}
                  aria-label={t('settings.mcp.page.advanced.oauthClientSecretPlaceholder')}
                  className="h-8 w-full max-w-sm"
                  disabled={busy}
                />
              </SettingsFieldRow>
              <SettingsFieldRow label={t('settings.mcp.page.advanced.oauthScopesPlaceholder')}>
                <Input
                  value={scopes}
                  onChange={(event) => setScopes(event.target.value)}
                  placeholder={t('settings.mcp.page.advanced.oauthScopesPlaceholder')}
                  aria-label={t('settings.mcp.page.advanced.oauthScopesPlaceholder')}
                  className="h-8 w-full max-w-sm"
                  disabled={busy}
                />
              </SettingsFieldRow>
              <SettingsFieldRow label={t('settings.mcp.page.advanced.oauthRedirectUriPlaceholder')}>
                <Input
                  value={redirectUri}
                  onChange={(event) => setRedirectUri(event.target.value)}
                  placeholder={t('settings.mcp.page.advanced.oauthRedirectUriPlaceholder')}
                  aria-label={t('settings.mcp.page.advanced.oauthRedirectUriPlaceholder')}
                  className="h-8 w-full max-w-sm"
                  disabled={busy}
                />
              </SettingsFieldRow>
              <Button disabled={busy} onClick={() => void submit('start')} size="xs" className="!font-normal">
                {busy ? t('settings.mcp.page.actions.working') : t('settings.mcp.page.actions.authorize')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {state.pendingFlow.instructions ? <p className={SETTINGS_HELPER_CLASS}>{state.pendingFlow.instructions}</p> : null}
              <div className="space-y-1">
                <p className="typography-micro text-muted-foreground">{t('settings.mcp.page.auth.authorizationUrl')}</p>
                <code className="block break-all rounded-md bg-[var(--surface-elevated)] px-3 py-2 typography-micro text-foreground/80">
                  {state.pendingFlow.authorizationUrl}
                </code>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  className="!font-normal"
                  onClick={() => openAuthorizationUrl(state.pendingFlow.launchUrl ?? state.pendingFlow.authorizationUrl)}
                >
                  {t('settings.mcp.page.actions.openInBrowser')}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="!font-normal"
                  onClick={() => void copyAuthorizationUrl(state.pendingFlow.authorizationUrl)}
                >
                  {t('settings.mcp.page.actions.copyLink')}
                </Button>
              </div>
              <div className="space-y-2">
                <p className="typography-ui-label text-foreground">{t('settings.mcp.page.auth.manualFallbackTitle')}</p>
                <p className="typography-micro text-muted-foreground">{t('settings.mcp.page.auth.manualFallbackDescription')}</p>
                <Input
                  aria-label={t('settings.mcp.page.auth.callbackInputPlaceholder')}
                  placeholder={t('settings.mcp.page.auth.callbackInputPlaceholder')}
                  value={callbackInput}
                  onChange={(event) => setCallbackInput(event.target.value)}
                  className="h-8 w-full max-w-md"
                  disabled={busy}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={busy} onClick={() => void submit('complete')} size="xs" className="!font-normal">
                    {busy ? t('settings.mcp.page.actions.completing') : t('settings.mcp.page.actions.completeAuthorization')}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void submit('cancel')} size="xs" className="!font-normal">
                    {t('settings.common.actions.cancel')}
                  </Button>
                </div>
              </div>
              <p className="typography-micro text-muted-foreground/70">{t('settings.mcp.page.auth.waitingForOpenCode')}</p>
            </div>
          )}

          {state.authenticated ? (
            <Button disabled={busy} onClick={() => void submit('disconnect')} size="xs" variant="outline" className="!font-normal">
              {busy ? t('settings.mcp.page.actions.clearing') : t('settings.mcp.page.actions.clearAuth')}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
};
