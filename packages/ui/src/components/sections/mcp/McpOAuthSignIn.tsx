import React from 'react';
import type { MCPOAuthConfigInput, MCPOAuthPendingFlow, MCPOAuthResult, MCPOAuthRequest } from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { resolveMcpDirectory } from '@/stores/useMcpConfigStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import {
  SettingsFieldRow,
  SETTINGS_HELPER_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_LONG_TEXT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { formatSessionActivityDuration } from '@/components/session/sessionActivityDurationFormat';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { openExternalUrl } from '@/lib/url';
import { problemMessage } from '@/lib/problemMessage';
import { currentMcpOAuthAutoOpen, currentMcpOAuthRedirect } from './mcpOAuthRedirect';

/** A flow the Agent Service holds stays answerable well after a browser handoff. */
const POLL_INTERVAL_MS = 1_500;
/** Past this the panel stops waiting and offers a fresh flow. */
const FLOW_BUDGET_MS = 5 * 60_000;
const ELAPSED_TICK_MS = 1_000;

interface McpOAuthSignInProps {
<<<<<<< HEAD
  serverId: string;
||||||| bc50ba56aa
  serverName: string;
  /** The Location whose config declares the server; its integration lives there. */
=======
  serverName: string;
>>>>>>> upstream/main
  directory: string | null;
  onConnected: () => void | Promise<void>;
<<<<<<< HEAD
  /**
   * The install that just saved this server starts its one sign-in method on
   * its own, so saving and signing in are one action.
   */
  autoStart?: boolean;
  /** The owner clears its `autoStart` flag here, so a later visit stays manual. */
  onAutoStartConsumed?: () => void;
||||||| bc50ba56aa
  /** Start the sign-in as soon as the integration shows up. */
  autoStart?: boolean;
  /** The start button's text; "Connect" when absent. */
  connectLabel?: string;
  /** Off when the caller starts the sign-in from its own button (with `autoStart`). */
  showStartButton?: boolean;
  /**
   * Told while a sign-in runs. Starting one from another machine writes the
   * server's redirect, and OpenCode reports the server `pending` while it
   * reconnects, so a caller that mounts this only for `needs_auth` must keep
   * it mounted until the sign-in ends: unmounting cancels the attempt.
   */
  onActiveChange?: (active: boolean) => void;
=======
  autoStart?: boolean;
  connectLabel?: string;
  showStartButton?: boolean;
  onActiveChange?: (active: boolean) => void;
  onUnavailable?: () => void;
>>>>>>> upstream/main
}

<<<<<<< HEAD
type OAuthErrorTone = 'error' | 'neutral' | 'info';
type OAuthError = { text: string; tone: OAuthErrorTone };
/** What an unmount must cancel: the flow and the revisions that own it. */
type PendingFlowOwner = { workspaceId: string; persistedRevision: string; workerGeneration: string; flowId: string };
type ActionOptions = { openBrowser?: boolean; silent?: boolean };

/** Native MCP OAuth flow: configuration, pending browser handoff and connection state. */
export const McpOAuthSignIn: React.FC<McpOAuthSignInProps> = ({ serverId, directory, onConnected, autoStart = false, onAutoStartConsumed }) => {
  const { t } = useI18n();
  const [state, setState] = React.useState<MCPOAuthResult | null>(null);
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<OAuthError | null>(null);
  const [clientIdHint, setClientIdHint] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [autoStarting, setAutoStarting] = React.useState(false);
  const [callbackInput, setCallbackInput] = React.useState('');
  const [clientId, setClientId] = React.useState('');
  const [clientSecret, setClientSecret] = React.useState('');
  const [scopes, setScopes] = React.useState('');
  const [redirectUri, setRedirectUri] = React.useState('');
  const [polling, setPolling] = React.useState<{ flowId: string } | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [timedOut, setTimedOut] = React.useState(false);
  const [focusClientId, setFocusClientId] = React.useState(0);
  const owner = React.useRef(0);
  const autoStarted = React.useRef(false);
  const notified = React.useRef(false);
  const openedFlows = React.useRef(new Set<string>());
  const activeFlow = React.useRef<PendingFlowOwner | null>(null);
  const clientIdRef = React.useRef<HTMLInputElement>(null);
  const focusPending = React.useRef(false);
  const onConnectedRef = React.useRef(onConnected);
  const onAutoStartConsumedRef = React.useRef(onAutoStartConsumed);

  React.useEffect(() => {
    onConnectedRef.current = onConnected;
    onAutoStartConsumedRef.current = onAutoStartConsumed;
  });

  const connectOnce = React.useCallback(async () => {
    if (notified.current) return;
    notified.current = true;
    await onConnectedRef.current();
  }, []);

  /** The install opens the browser; the waiting panel must not open it again per tick. */
  const openAuthorizationUrlOnce = React.useCallback((flow: MCPOAuthPendingFlow) => {
    if (openedFlows.current.has(flow.flowId)) return;
    openedFlows.current.add(flow.flowId);
    void openExternalUrl(flow.launchUrl ?? flow.authorizationUrl).catch((failure) => {
      setError({ text: failure instanceof Error ? failure.message : String(failure), tone: 'error' });
    });
  }, []);

  /** The line for a sign-in failure: policy refusals read as policy in the
   * user's language, a cancel is neutral, and everything else is the provider's
   * own sentence in red. */
  const failureLine = React.useCallback((code: string, detail: string): OAuthError => {
    if (code === 'enterprise_mode') return { text: t('integrationsCatalog.oauth.enterpriseMode'), tone: 'info' };
    if (code === 'MCP_OAUTH_CANCELLED') return { text: t('integrationsCatalog.oauth.cancelled'), tone: 'neutral' };
    return { text: detail, tone: 'error' };
  }, [t]);

  const applyResult = React.useCallback((result: MCPOAuthResult, workspace: string, options: { openBrowser?: boolean } = {}) => {
    setState(result);
    if (result.status === 'pending') {
      activeFlow.current = {
        workspaceId: workspace,
        persistedRevision: result.persistedRevision,
        workerGeneration: result.worker.workerGeneration,
        flowId: result.pendingFlow.flowId,
      };
      setPolling({ flowId: result.pendingFlow.flowId });
      setTimedOut(false);
      setElapsedMs(0);
      // Under a relay no callback reaches this machine, so an automatic browser
      // handoff would promise a finish that cannot happen; the pending panel
      // asks for the pasted callback instead.
      if (options.openBrowser === true && currentMcpOAuthAutoOpen()) openAuthorizationUrlOnce(result.pendingFlow);
      return;
    }
    activeFlow.current = null;
    setPolling(null);
    // The latch guards one connection per sign-in, not one per panel: clearing
    // the auth and signing in again must connect again.
    if (result.status !== 'authenticated') notified.current = false;
    // A flow that failed after the browser handoff reports it here; the panel
    // keeps its form so the user can retry, and stops waiting either way.
    if (result.status === 'unauthenticated' && result.error) {
      setError(failureLine(result.error.code, result.error.detail));
      return;
    }
    // Either way of finishing (poll or a pasted callback) reaches this one
    // place, so the server connects at most once.
    if (result.status === 'authenticated') void connectOnce();
  }, [connectOnce, failureLine, openAuthorizationUrlOnce]);

  const handleFailure = React.useCallback(async (failure: Error, workspace: string) => {
    const code = failure instanceof CanonicalApiError ? failure.problem.code : undefined;
    // A Host refusal (enterprise mode) and a cancel are not provider failures;
    // `failureLine` says so in the user's language.
    if (code === 'enterprise_mode' || code === 'MCP_OAUTH_CANCELLED') {
      setError(failureLine(code, problemMessage(failure, t('integrationsCatalog.oauth.failed'))));
      return;
    }
    if (code === 'MCP_OAUTH_IN_PROGRESS') {
      // Another attempt holds a flow: wait on that one instead of refusing.
      setError({ text: t('integrationsCatalog.oauth.inProgress'), tone: 'info' });
      const existing = await canonicalClient.getWorkspaceMcpOAuth(workspace, serverId).catch(() => null);
      if (existing) applyResult(existing, workspace);
      return;
    }
    if (code === 'MCP_OAUTH_CLIENT_REGISTRATION_REJECTED') {
      // The provider refused dynamic client registration and its own sentence
      // names the endpoint and the reason. It belongs beside the field that
      // fixes it, not as a dead-end error above the form.
      setClientIdHint(problemMessage(failure, t('integrationsCatalog.oauth.failed')));
      setFocusClientId((value) => value + 1);
      return;
    }
    setError({ text: problemMessage(failure, t('integrationsCatalog.oauth.failed')), tone: 'error' });
  }, [applyResult, failureLine, serverId, t]);

  const perform = async (
    action: MCPOAuthRequest['action'],
    base: MCPOAuthResult,
    workspace: string,
    options: ActionOptions = {},
  ): Promise<void> => {
    if (busy) return;
    const attempt = owner.current;
    const runtimeKey = getRuntimeKey();
    const assertRuntime = () => {
      if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed.');
    };
    const fields = { persistedRevision: base.persistedRevision, workerGeneration: base.worker.workerGeneration };
    setBusy(true);
    setError(null);
    try {
      let request: MCPOAuthRequest;
      if (action === 'start') {
        // The redirect is chosen by the runtime, not by whoever serves the page:
        // a local flow returns to the Agent Service's pinned loopback listener,
        // and a remote or mobile one returns to the Host's public callback. A
        // value the user typed keeps its meaning.
        const oauth: MCPOAuthConfigInput = { redirectUri: redirectUri.trim() || currentMcpOAuthRedirect() };
        const trimmedClientId = clientId.trim();
        const trimmedScopes = scopes.trim();
        if (trimmedClientId) oauth.clientId = trimmedClientId;
        if (trimmedScopes) oauth.scopes = trimmedScopes;
        if (clientSecret) {
          assertRuntime();
          const credential = await canonicalClient.writeWorkspaceMcpCredential(workspace, serverId, { persistedRevision: base.persistedRevision, value: clientSecret });
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
        if (base.status !== 'pending') return;
        const flowId = base.pendingFlow.flowId;
        const callback = callbackInput.trim();
        request = action === 'cancel'
          ? { action, ...fields, flowId }
          : callback
            ? { action, ...fields, flowId, callbackInput: callback }
            : { action, ...fields, flowId };
      }
      assertRuntime();
      const result = await canonicalClient.submitWorkspaceMcpOAuth(workspace, serverId, request);
      assertRuntime();
      if (owner.current !== attempt) return;
      setClientIdHint(null);
      setCallbackInput('');
      applyResult(result, workspace, { openBrowser: options.openBrowser === true });
      // A cancel the Agent Service accepted answers with the plain unauthenticated
      // state, so the refusal path never runs: say what happened here instead of
      // letting the panel silently return to its form.
      if (action === 'cancel' && options.silent !== true) {
        setError({ text: t('integrationsCatalog.oauth.cancelled'), tone: 'neutral' });
      }
    } catch (caught) {
      // The transport throws problem documents and nothing else; anything that
      // is not an Error already lost its cause, so its text is all that is left.
      const failure = caught instanceof Error ? caught : new Error(String(caught));
      if (owner.current === attempt && options.silent !== true) await handleFailure(failure, workspace);
    } finally {
      if (owner.current === attempt) setBusy(false);
    }
  };

  // The mount load effect runs once per server and directory; it reads the
  // current action runner, whose form fields change on every keystroke. The
  // auto-start flag is read once too, so the owner clearing it afterwards does
  // not reset the panel mid-flow.
  const performRef = React.useRef(perform);
  React.useEffect(() => { performRef.current = perform; });
  const applyResultRef = React.useRef(applyResult);
  React.useEffect(() => { applyResultRef.current = applyResult; });

  React.useEffect(() => {
    const attempt = ++owner.current;
    const runtimeKey = getRuntimeKey();
    autoStarted.current = false;
    notified.current = false;
    activeFlow.current = null;
    setState(null);
    setWorkspaceId(null);
    setError(null);
    setClientIdHint(null);
    setBusy(false);
    setAutoStarting(false);
    setCallbackInput('');
    setClientId('');
    setClientSecret('');
    setScopes('');
    setRedirectUri('');
    setPolling(null);
    setElapsedMs(0);
    setTimedOut(false);
    void (async () => {
      try {
        const workspace = await canonicalClient.resolveWorkspace(resolveMcpDirectory(directory));
        if (owner.current !== attempt || getRuntimeKey() !== runtimeKey) return;
        const result = await canonicalClient.getWorkspaceMcpOAuth(workspace.workspaceId, serverId);
        if (owner.current !== attempt || getRuntimeKey() !== runtimeKey) return;
        setWorkspaceId(workspace.workspaceId);
        applyResultRef.current(result, workspace.workspaceId);
      } catch (failure) {
        if (owner.current === attempt) setError({ text: failure instanceof Error ? failure.message : String(failure), tone: 'error' });
      }
    })();
    return () => { owner.current += 1; };
  }, [directory, serverId]);

  // The install's flag can arrive with the panel's first render or just after
  // it (the saved server is published before the install pass finishes), so the
  // start is driven by the flag and the loaded state, not by the mount alone.
  // One start per panel: the guard survives StrictMode and re-renders, and the
  // owner is told the flag was used so a later visit stays manual.
  React.useEffect(() => {
    if (!autoStart || autoStarted.current || !state || !workspaceId || state.status !== 'unauthenticated') return;
    autoStarted.current = true;
    onAutoStartConsumedRef.current?.();
    setAutoStarting(true);
    void performRef.current('start', state, workspaceId, { openBrowser: true })
      .finally(() => setAutoStarting(false));
  }, [autoStart, state, workspaceId]);

  // While a flow is pending the panel asks the Agent Service for its real state,
  // so a browser sign-in turns the server connected without another click.
  React.useEffect(() => {
    if (!polling || !workspaceId || timedOut) return;
    const attempt = owner.current;
    const runtimeKey = getRuntimeKey();
    const timer = setInterval(() => {
      void (async () => {
        const fresh = await canonicalClient.getWorkspaceMcpOAuth(workspaceId, serverId).catch(() => null);
        if (!fresh || owner.current !== attempt || getRuntimeKey() !== runtimeKey) return;
        if (fresh.status === 'pending') return;
        applyResult(fresh, workspaceId);
      })();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [applyResult, polling, serverId, timedOut, workspaceId]);

  React.useEffect(() => {
    if (!polling || timedOut) {
      if (!polling) setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= FLOW_BUDGET_MS) setTimedOut(true);
    }, ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, [polling, timedOut]);

  // Leaving the panel ends the flow it was waiting on; guessing would leave the
  // Agent Service holding a browser handoff nobody is watching.
  React.useEffect(() => () => {
    const flow = activeFlow.current;
    activeFlow.current = null;
    if (!flow) return;
    void canonicalClient.submitWorkspaceMcpOAuth(flow.workspaceId, serverId, {
      action: 'cancel',
      persistedRevision: flow.persistedRevision,
      workerGeneration: flow.workerGeneration,
      flowId: flow.flowId,
    }).catch(() => undefined);
  }, [directory, serverId]);

  React.useEffect(() => {
    if (focusClientId === 0) return;
    focusPending.current = true;
  }, [focusClientId]);

  React.useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    clientIdRef.current?.focus();
  });

  const startAnotherFlow = async () => {
    if (!state || !workspaceId) return;
    setTimedOut(false);
    if (state.status === 'pending') await perform('cancel', state, workspaceId, { silent: true });
    const attempt = owner.current;
    const fresh = await canonicalClient.getWorkspaceMcpOAuth(workspaceId, serverId).catch(() => null);
    if (!fresh || owner.current !== attempt) return;
    if (fresh.status !== 'unauthenticated') {
      applyResult(fresh, workspaceId);
      return;
    }
    await perform('start', fresh, workspaceId, { openBrowser: true });
  };

  const openAuthorizationUrl = (url: string) => {
    void openExternalUrl(url).catch((failure) => setError({ text: String(failure), tone: 'error' }));
  };

  const copyAuthorizationUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('settings.mcp.page.toast.authorizationUrlCopied'));
    } catch (error) {
      toast.error(problemMessage(error, t('settings.mcp.page.toast.authorizationUrlCopyFailed')));
    }
  };
||||||| bc50ba56aa
/**
 * The OAuth sign-in for a remote MCP server. OpenCode registers such a server
 * as an integration with one `oauth` method, so the sign-in is the same
 * connect / status / complete flow the Providers page runs; only the lookup
 * (by server name, in the server's Location) is MCP-specific. Renders nothing
 * while the integration is unknown.
 */
export const McpOAuthSignIn: React.FC<McpOAuthSignInProps> = ({
  serverName,
  directory,
  onConnected,
  autoStart,
  connectLabel,
  showStartButton,
  onActiveChange,
}) => {
  const integration = useMcpOAuthIntegration(serverName, directory);
  if (!integration) return null;
=======
export const McpOAuthSignIn: React.FC<McpOAuthSignInProps> = ({
  serverName,
  directory,
  onConnected,
  autoStart,
  connectLabel,
  showStartButton,
  onActiveChange,
  onUnavailable,
}) => {
  const integration = useMcpOAuthIntegration(serverName, directory, true, onUnavailable);
  if (!integration) return null;
  const methods = getMcpOAuthMethods(integration);
>>>>>>> upstream/main

  return (
<<<<<<< HEAD
    <div className={SETTINGS_SPACE_ROW_CLASS}>
      {error ? (
        <p
          role={error.tone === 'error' ? 'alert' : 'status'}
          className={cn('typography-meta', error.tone === 'error' ? 'text-[var(--status-error)]' : 'text-muted-foreground')}
        >
          {error.text}
        </p>
      ) : null}
      {state ? (
        <>
          <p className={SETTINGS_HELPER_CLASS}>
            {state.authenticated ? t('settings.mcp.page.status.label.connected') : t('settings.mcp.page.status.label.needsAuth')}
          </p>

          {state.status === 'pending' ? (
            <div className={SETTINGS_SPACE_ROW_CLASS}>
              {state.pendingFlow.instructions ? <p className={SETTINGS_HELPER_CLASS}>{state.pendingFlow.instructions}</p> : null}
              {timedOut ? (
                <div className="space-y-2">
                  <p className="typography-meta text-muted-foreground">{t('integrationsCatalog.oauth.timedOut')}</p>
                  <Button disabled={busy} onClick={() => void startAnotherFlow()} size="xs" className="!font-normal">
                    {t('integrationsCatalog.oauth.tryAgain')}
                  </Button>
                </div>
              ) : (
                <>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="typography-micro text-muted-foreground">
                      {t('integrationsCatalog.oauth.elapsed', { time: formatSessionActivityDuration(elapsedMs, t) })}
                    </p>
                    <Button variant="ghost" disabled={busy} onClick={() => workspaceId && void perform('cancel', state, workspaceId)} size="xs" className="!font-normal">
                      {t('settings.common.actions.cancel')}
                    </Button>
                  </div>
                </>
              )}
              <div className={SETTINGS_SPACE_ROW_CLASS}>
                <p className="typography-ui-label text-foreground">{t('settings.mcp.page.auth.manualFallbackTitle')}</p>
                <p className="typography-micro text-muted-foreground">{t('settings.mcp.page.auth.manualFallbackDescription')}</p>
                <Input
                  aria-label={t('settings.mcp.page.auth.callbackInputPlaceholder')}
                  placeholder={t('settings.mcp.page.auth.callbackInputPlaceholder')}
                  value={callbackInput}
                  onChange={(event) => setCallbackInput(event.target.value)}
                  className={SETTINGS_WIDTH_LONG_TEXT_CLASS}
                  disabled={busy}
                />
                <Button disabled={busy} onClick={() => workspaceId && void perform('complete', state, workspaceId)} size="xs" className="!font-normal">
                  {busy ? t('settings.mcp.page.actions.completing') : t('settings.mcp.page.actions.completeAuthorization')}
                </Button>
              </div>
            </div>
          ) : (
            <div className={SETTINGS_SPACE_ROW_CLASS}>
              {clientIdHint ? (
                <p role="status" className="typography-meta text-[var(--status-warning)]">{clientIdHint}</p>
              ) : null}
              <SettingsFieldRow label={t('settings.mcp.page.advanced.oauthClientIdPlaceholder')}>
                <Input
                  ref={clientIdRef}
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder={t('settings.mcp.page.advanced.oauthClientIdPlaceholder')}
                  aria-label={t('settings.mcp.page.advanced.oauthClientIdPlaceholder')}
                  className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
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
                  className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
                  disabled={busy}
                />
              </SettingsFieldRow>
              <SettingsFieldRow label={t('settings.mcp.page.advanced.oauthScopesPlaceholder')}>
                <Input
                  value={scopes}
                  onChange={(event) => setScopes(event.target.value)}
                  placeholder={t('settings.mcp.page.advanced.oauthScopesPlaceholder')}
                  aria-label={t('settings.mcp.page.advanced.oauthScopesPlaceholder')}
                  className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
                  disabled={busy}
                />
              </SettingsFieldRow>
              <SettingsFieldRow label={t('settings.mcp.page.advanced.oauthRedirectUriPlaceholder')}>
                <Input
                  value={redirectUri}
                  onChange={(event) => setRedirectUri(event.target.value)}
                  placeholder={t('settings.mcp.page.advanced.oauthRedirectUriPlaceholder')}
                  aria-label={t('settings.mcp.page.advanced.oauthRedirectUriPlaceholder')}
                  className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
                  disabled={busy}
                />
              </SettingsFieldRow>
              {autoStarting ? (
                <p className={SETTINGS_HELPER_CLASS}>{t('integrationsCatalog.oauth.starting')}</p>
              ) : (
                <Button disabled={busy} onClick={() => workspaceId && void perform('start', state, workspaceId, { openBrowser: true })} size="xs" className="!font-normal">
                  {busy ? t('settings.mcp.page.actions.working') : t('settings.mcp.page.actions.authorize')}
                </Button>
              )}
            </div>
          )}

          {state.authenticated ? (
            <Button disabled={busy} onClick={() => workspaceId && void perform('disconnect', state, workspaceId)} size="xs" variant="outline" className="!font-normal">
              {busy ? t('settings.mcp.page.actions.clearing') : t('settings.mcp.page.actions.clearAuth')}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
||||||| bc50ba56aa
    <ProviderOAuthMethods
      key={integration.id}
      integrationId={integration.id}
      methods={getMcpOAuthMethods(integration)}
      directory={directory}
      onConnected={onConnected}
      autoStart={autoStart}
      connectLabel={connectLabel}
      showStartButton={showStartButton}
      onActiveChange={onActiveChange}
    />
=======
    <ProviderOAuthMethods
      key={integration.id}
      integrationId={integration.id}
      methods={methods}
      directory={directory}
      onConnected={onConnected}
      autoStart={autoStart}
      connectLabel={connectLabel}
      showStartButton={(showStartButton ?? true) || methods.length > 1}
      onActiveChange={onActiveChange}
    />
>>>>>>> upstream/main
  );
};
