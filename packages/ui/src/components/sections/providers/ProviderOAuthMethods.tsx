import React from 'react';
import type { ProviderOAuthMethods as Methods, ProviderOAuthRequest, ProviderOAuthResult } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { copyTextToClipboard } from '@/lib/clipboard';
import { openExternalUrl } from '@/lib/url';
<<<<<<< HEAD
import { getRuntimeKey } from '@/lib/runtime-switch';

type Attempt = { method: Methods['methods'][number]; flow: ProviderOAuthResult; expectedRevision: string };

interface OAuthOwner {
  active: boolean;
  serial: number;
  runtime: string;
  attempt: Attempt | null;
=======
import { opencodeClient } from '@/lib/opencode/client';
import { getIntegrationClient } from '@/lib/opencode/integration-catalog';
import {
  collectFieldAnswer,
  defaultFieldValues,
  describeOAuthError,
  extractUserCode,
  fieldLabel,
  firstUnansweredField,
  isAnswerableField,
  shouldOpenAuthorizationUrl,
  type OAuthAttempt,
} from './provider-oauth';
import { ProviderFormFields } from './ProviderFormFields';
import type { SignInMethod } from './providerAuth';

interface ProviderOAuthMethodsProps {
  /** The integration that owns these methods; it shares the provider's id. */
  integrationId: string;
  methods: SignInMethod[];
  /** Called once a credential has been stored, so the caller can reload providers. */
  onConnected: () => void | Promise<void>;
  /**
   * Location the integration belongs to. An MCP server's OAuth integration
   * exists only in the Location whose config declares the server, so its
   * requests must resolve that directory. Without one, requests go where the
   * integration list is read (`getIntegrationClient`).
   */
  directory?: string | null;
  /** Layout only — the caller owns separation from whatever sits above. */
  className?: string;
  /** Start the only sign-in method on mount, for a sign-in the user just asked for elsewhere. */
  autoStart?: boolean;
  /** Off when a surrounding card already names the method. */
  showMethodLabels?: boolean;
  /** The start button's text, when the surface has a more specific word than "Connect". */
  connectLabel?: string;
  /** Off when the caller starts the sign-in from its own button; only the attempt's progress and errors show. */
  showStartButton?: boolean;
  /**
   * Told `true` when a sign-in starts and `false` when it ends, fails or this unmounts,
   * so a caller that mounts this only in some states can keep it until then.
   */
  onActiveChange?: (active: boolean) => void;
>>>>>>> bc50ba56a
}

const STATUS_POLL_INTERVAL_MS = 1500;

/**
 * Device codes are only carried inside the human-readable instructions
 * (`Enter code: ABCD-1234`), so they are recovered by shape.
 */
const DEVICE_CODE_PATTERN = /[A-Z0-9]{4}-[A-Z0-9]{4,5}/;

const extractUserCode = (instructions: string): string | undefined =>
  DEVICE_CODE_PATTERN.exec(instructions)?.[0] ?? undefined;

interface ProviderOAuthMethodsProps {
  workspaceId: string;
  revision: string;
  methods: Methods['methods'];
  /** Called once a credential has been committed, so the caller can reload providers. */
  onConnected: () => void | Promise<void>;
  disabled?: boolean;
  /** Layout only — the caller owns separation from whatever sits above. */
  className?: string;
}

/**
 * Sign-in for a provider's native OAuth methods.
 *
 * The native flow is transactional: `start` opens an attempt, `status` renews
 * its lease and reports progress, `input` answers a manual prompt, `cancel`
 * drops it, and `commit` stores the credential under the starting revision.
 * Only one method can run at a time, and an abandoned attempt is cancelled
 * upstream on unmount so it cannot linger until it expires.
 */
export const ProviderOAuthMethods: React.FC<ProviderOAuthMethodsProps> = ({
  workspaceId,
  revision,
  methods,
  onConnected,
  disabled = false,
  className,
<<<<<<< HEAD
}) => {
  const { t } = useI18n();
  const [attempt, setAttempt] = React.useState<Attempt | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  const [failedMethodId, setFailedMethodId] = React.useState<string | null>(null);
  const owner = React.useRef<OAuthOwner>({ active: true, serial: 0, runtime: getRuntimeKey(), attempt: null });
=======
  autoStart = false,
  showMethodLabels = true,
  connectLabel,
  showStartButton = true,
  onActiveChange,
}) => {
  const { t } = useI18n();
  // Picked once per directory prop: OpenCode keeps an OAuth attempt in the
  // location that started it, so status, complete and cancel must not follow
  // the app to another project mid-flow.
  const client = React.useMemo(
    () => (directory ? opencodeClient.getScopedSdkClient(directory) : getIntegrationClient()),
    [directory],
  );
  const sdk = React.useCallback(() => client, [client]);
  const [flow, setFlow] = React.useState<Flow>(IDLE);
  const [fieldValues, setFieldValues] = React.useState<Record<string, FormValue>>({});
  const [codeInput, setCodeInput] = React.useState('');
  /** The address pasted into a waiting `paste` attempt, and how handing it over went. */
  const [redirectInput, setRedirectInput] = React.useState('');
  const [redirectSubmit, setRedirectSubmit] = React.useState<{ submitting: boolean; error: string | null }>({
    submitting: false,
    error: null,
  });
  /** Set while a poll loop is live; clearing it stops the loop at its next tick. */
  const activeAttemptRef = React.useRef<string | null>(null);
>>>>>>> bc50ba56a

  React.useEffect(() => {
    const lifetime = owner.current;
    lifetime.active = true;
    return () => {
      lifetime.active = false;
      lifetime.serial++;
      const current = lifetime.attempt;
      if (current && current.flow.status !== 'authenticated' && lifetime.runtime === getRuntimeKey()) {
        void canonicalClient.providerOAuth(workspaceId, current.method.methodId, {
          action: 'cancel',
          flowId: current.flow.flowId,
          generation: current.flow.generation,
        }).catch(() => { /* Host disconnect/restart also retires the bound flow. */ });
      }
    };
  }, [workspaceId]);

<<<<<<< HEAD
  const send = async (method: Methods['methods'][number], request: ProviderOAuthRequest, expectedRevision: string) => {
    const lifetime = owner.current;
    const serial = ++lifetime.serial;
    setBusy(true);
    setFailed(false);
    setFailedMethodId(null);
    try {
      const flow = await canonicalClient.providerOAuth(workspaceId, method.methodId, request);
      if (!lifetime.active || lifetime.runtime !== getRuntimeKey() || serial !== lifetime.serial) {
        if (request.action === 'start' && lifetime.runtime === getRuntimeKey()) {
          void canonicalClient.providerOAuth(workspaceId, method.methodId, {
            action: 'cancel',
            flowId: flow.flowId,
            generation: flow.generation,
          }).catch(() => {});
        }
        return;
      }
      if (flow.providerId !== method.storeCredentialsAs) throw new Error('OAuth provider identity mismatch');
      if (flow.status === 'cancelled') {
        lifetime.attempt = null;
        setAttempt(null);
        setInput('');
        return;
      }
      const next = { method, flow, expectedRevision };
      lifetime.attempt = next;
      setAttempt(next);
      if (flow.status === 'failed') {
        setFailed(true);
        setFailedMethodId(method.methodId);
      } else if (flow.status === 'authenticated') {
        lifetime.attempt = null;
        setAttempt(null);
        setInput('');
        toast.success(t('settings.providers.page.toast.oauthCompleted'));
        await onConnected();
      }
    } catch (error) {
      if (lifetime.active && serial === lifetime.serial && lifetime.runtime === getRuntimeKey()) {
        console.error('OAuth flow failed:', error);
        setFailed(true);
        setFailedMethodId(method.methodId);
      }
    } finally {
      if (lifetime.active && serial === lifetime.serial) setBusy(false);
    }
  };

  React.useEffect(() => {
    if (!attempt || attempt.flow.status !== 'pending' || busy || failed || disabled) return;
    const timer = setTimeout(() => {
      void send(attempt.method, {
        action: 'status',
        flowId: attempt.flow.flowId,
        generation: attempt.flow.generation,
      }, attempt.expectedRevision);
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
    // send deliberately reads the latest mounted lifetime; one outstanding request per flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, busy, failed, disabled]);
=======
  /** An attempt that starts after unmount is cancelled instead of opening a browser tab nobody follows. */
  const unmountedRef = React.useRef(false);
  React.useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      const pending = activeAttemptRef.current;
      if (pending) cancelAttempt(pending);
    };
  }, [cancelAttempt]);

  const activeMethodID = flow.phase === 'idle' ? null : flow.methodID;

  const signInActive = flow.phase !== 'idle' && flow.phase !== 'failed';
  React.useEffect(() => {
    if (!signInActive || !onActiveChange) return undefined;
    onActiveChange(true);
    return () => onActiveChange(false);
  }, [signInActive, onActiveChange]);
  const busy = flow.phase === 'connecting'
    || flow.phase === 'waiting'
    || (flow.phase === 'awaitingCode' && flow.submitting);
>>>>>>> bc50ba56a

  const copy = async (value: string, successKey: I18nKey, failureKey: I18nKey) => {
    const result = await copyTextToClipboard(value);
    if (result.ok) toast.success(t(successKey));
    else toast.error(t(failureKey));
  };

<<<<<<< HEAD
  const active = attempt && (attempt.flow.status === 'pending' || attempt.flow.status === 'ready');
  const userCode = attempt?.flow.instructions ? extractUserCode(attempt.flow.instructions) : undefined;
=======
  const succeed = async (successKey: I18nKey = 'settings.providers.page.toast.oauthCompleted') => {
    activeAttemptRef.current = null;
    setFlow(IDLE);
    toast.success(t(successKey));
    await onConnected();
  };

  const fail = (methodID: string, error: unknown, fallbackKey: I18nKey) => {
    activeAttemptRef.current = null;
    console.error('OAuth flow failed:', error);
    setFlow({ phase: 'failed', methodID, message: describeOAuthError(error, t, fallbackKey) });
  };

  /**
   * Polls an `auto` attempt to completion. Never throws: the user already has
   * control in the browser, so a failure here is a flow state, not an exception
   * to unwind. Stops as soon as the attempt is no longer the active one, which
   * is how cancel and unmount tear it down.
   */
  const pollAttempt = async (methodID: string, attemptID: string) => {
    const client = sdk();
    while (activeAttemptRef.current === attemptID) {
      await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL_MS));
      if (activeAttemptRef.current !== attemptID) return;
      try {
        const { data: status } = await client.integration.oauth.status({ integrationID: integrationId, attemptID });
        if (activeAttemptRef.current !== attemptID) return;
        if (status.status === 'complete') {
          await succeed();
          return;
        }
        if (status.status === 'failed') {
          setFlow({ phase: 'failed', methodID, message: status.message });
          activeAttemptRef.current = null;
          return;
        }
      } catch (error) {
        if (activeAttemptRef.current !== attemptID) return;
        fail(methodID, error, 'settings.providers.page.toast.oauthCompleteFailed');
        return;
      }
    }
  };

  const runExternalConnect = async (methodID: string, answer: Record<string, FormValue>) => {
    setFlow({ phase: 'connecting', methodID });
    try {
      // OpenCode refuses an answer for a method without a form, even an empty one.
      await sdk().integration.connect.external({
        integrationID: integrationId,
        methodID,
        answer: Object.keys(answer).length > 0 ? answer : undefined,
      });
    } catch (error) {
      fail(methodID, error, 'settings.providers.page.toast.externalConnectFailed');
      return;
    }
    await succeed('settings.providers.page.toast.externalConnected');
  };

  const runConnect = async (method: SignInMethod, answer: Record<string, FormValue>) => {
    if (method.type === 'external') {
      await runExternalConnect(method.id, answer);
      return;
    }
    setFlow({ phase: 'connecting', methodID: method.id });

    let attempt: OAuthAttempt;
    try {
      const { data } = await sdk().integration.oauth.connect({
        integrationID: integrationId,
        methodID: method.id,
        ...(Object.keys(answer).length > 0 ? { answer } : {}),
      });
      attempt = {
        attemptID: data.attemptID,
        mode: data.mode,
        url: data.url,
        instructions: data.instructions,
        paste: data.paste === true,
      };
    } catch (error) {
      fail(method.id, error, 'settings.providers.page.toast.oauthStartFailed');
      return;
    }

    if (unmountedRef.current) {
      cancelAttempt(attempt.attemptID);
      return;
    }
    activeAttemptRef.current = attempt.attemptID;

    // Claude Code CLI owns its OAuth flow and opens the browser itself. Its
    // integration URL is informational only; opening it creates a misleading
    // docs tab alongside the real sign-in page.
    if (shouldOpenAuthorizationUrl(integrationId, attempt.url)) {
      void openExternalUrl(attempt.url);
    }

    if (attempt.mode === 'code') {
      setCodeInput('');
      setFlow({ phase: 'awaitingCode', methodID: method.id, attempt, submitting: false });
      return;
    }

    setRedirectInput('');
    setRedirectSubmit({ submitting: false, error: null });
    setFlow({ phase: 'waiting', methodID: method.id, attempt });
    await pollAttempt(method.id, attempt.attemptID);
  };

  const beginConnect = (method: SignInMethod) => {
    const fields = (method.form ?? []).filter(isAnswerableField);
    if (fields.length === 0) {
      void runConnect(method, {});
      return;
    }
    setFieldValues(defaultFieldValues(fields));
    setFlow({ phase: 'prompting', methodID: method.id, fields, error: null });
  };

  const autoStartedRef = React.useRef(false);
  React.useEffect(() => {
    if (!autoStart || autoStartedRef.current || methods.length !== 1) return;
    autoStartedRef.current = true;
    beginConnect(methods[0]);
    // Once per mount: a later render must not restart a sign-in the user cancelled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, methods]);

  const submitFields = (method: SignInMethod) => {
    if (flow.phase !== 'prompting') {
      return;
    }
    const unanswered = firstUnansweredField(flow.fields, fieldValues);
    if (unanswered) {
      setFlow({
        ...flow,
        error: t('settings.providers.page.auth.oauth.promptRequired', { field: fieldLabel(unanswered) }),
      });
      return;
    }
    void runConnect(method, collectFieldAnswer(flow.fields, fieldValues));
  };

  const submitCode = async () => {
    if (flow.phase !== 'awaitingCode') {
      return;
    }
    const code = codeInput.trim();
    if (!code) {
      return;
    }
    const { methodID, attempt } = flow;
    setFlow({ ...flow, submitting: true });
    try {
      await sdk().integration.oauth.complete({
        integrationID: integrationId,
        attemptID: attempt.attemptID,
        code,
      });
      await succeed();
    } catch (error) {
      fail(methodID, error, 'settings.providers.page.toast.oauthCompleteFailed');
    }
  };

  /**
   * Hands a waiting attempt the address the browser landed on. OpenCode settles
   * the attempt through its status, which the poll loop already watches; a
   * rejected address leaves the attempt waiting, so the user can paste again.
   */
  const submitRedirect = async () => {
    if (flow.phase !== 'waiting') return;
    const address = redirectInput.trim();
    if (!address) return;
    const { attemptID } = flow.attempt;
    setRedirectSubmit({ submitting: true, error: null });
    // Accepted, it stays submitting until the poll loop reads the result.
    try {
      await sdk().integration.oauth.complete({ integrationID: integrationId, attemptID, code: address });
    } catch (error) {
      if (activeAttemptRef.current !== attemptID) return;
      setRedirectSubmit({
        submitting: false,
        error: describeOAuthError(error, t, 'settings.providers.page.toast.oauthCompleteFailed'),
      });
    }
  };

  /** Drops the attempt upstream so a half-finished sign-in cannot be resumed by accident. */
  const cancel = () => {
    if (flow.phase === 'waiting' || flow.phase === 'awaitingCode') {
      cancelAttempt(flow.attempt.attemptID);
    }
    setFlow(IDLE);
  };

  const renderAttemptDetails = (attempt: OAuthAttempt) => {
    const userCode = extractUserCode(attempt.instructions);
    return (
      <>
        {attempt.instructions && (
          <p className="typography-meta text-[var(--status-info-text)] bg-[var(--status-info-background)] px-2 py-1.5 rounded">
            {attempt.instructions}
          </p>
        )}

        {userCode && (
          <div className="flex items-center gap-2">
            <Input
              value={userCode}
              readOnly
              aria-label={t('settings.providers.page.auth.oauth.deviceCodeLabel')}
              className="font-mono text-center tracking-widest"
            />
            <Button
              variant="outline"
              size="xs"
              className="!font-normal shrink-0"
              onClick={() => void copy(
                userCode,
                'settings.providers.page.toast.deviceCodeCopied',
                'settings.providers.page.toast.deviceCodeCopyFailed',
              )}
            >
              {t('settings.providers.page.actions.copyCode')}
            </Button>
          </div>
        )}

        {attempt.url && (
          <div className="flex items-center gap-2">
            <Input
              value={attempt.url}
              readOnly
              aria-label={t('settings.providers.page.auth.oauth.linkLabel')}
              className="text-xs text-muted-foreground"
            />
            <div className="flex gap-1 shrink-0">
              <Button
                variant="outline"
                size="xs"
                className="!font-normal"
                onClick={() => void openExternalUrl(attempt.url)}
              >
                {t('settings.providers.page.actions.open')}
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="!font-normal"
                onClick={() => void copy(
                  attempt.url,
                  'settings.providers.page.toast.oauthLinkCopied',
                  'settings.providers.page.toast.oauthLinkCopyFailed',
                )}
              >
                {t('settings.providers.page.actions.copy')}
              </Button>
            </div>
          </div>
        )}
      </>
    );
  };
>>>>>>> bc50ba56a

  return (
    <div className={cn('space-y-4', className)}>
      {methods.map((method) => {
        const isActive = attempt?.method.methodId === method.methodId;
        return (
<<<<<<< HEAD
          <div key={method.methodId} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="typography-ui-label text-foreground">{method.name}</div>
              <Button
                variant="outline"
                size="xs"
                className="!font-normal shrink-0"
                disabled={busy || Boolean(active) || disabled}
                onClick={() => {
                  setInput('');
                  void send(method, { action: 'start', expectedRevision: revision }, revision);
                }}
              >
                {t('settings.providers.page.actions.connect')}
              </Button>
            </div>
=======
          <div key={method.id} className="space-y-3">
            {showStartButton ? (
              <div className="flex items-center justify-between gap-2">
                {showMethodLabels ? <div className="typography-ui-label text-foreground">{method.label}</div> : null}
                <Button
                  variant="outline"
                  size="xs"
                  className="!font-normal shrink-0"
                  onClick={() => beginConnect(method)}
                  disabled={busy}
                >
                  {connectLabel ?? t('settings.providers.page.actions.connect')}
                </Button>
              </div>
            ) : null}
>>>>>>> bc50ba56a

            {isActive && attempt && attempt.flow.status === 'pending' && !failed ? (
              <div className="space-y-3">
<<<<<<< HEAD
                {attempt.flow.instructions ? (
                  <p className="typography-meta text-[var(--status-info-text)] bg-[var(--status-info-background)] px-2 py-1.5 rounded">
                    {attempt.flow.instructions}
                  </p>
                ) : null}
=======
                <ProviderFormFields
                  fields={flow.fields}
                  values={fieldValues}
                  onChange={(key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }))}
                />
                {flow.error && (
                  <p dir="auto" className="typography-meta text-[var(--status-error)]">{flow.error}</p>
                )}
                <div className="flex items-center gap-2">
                  <Button size="xs" className="!font-normal" onClick={() => submitFields(method)}>
                    {t('settings.providers.page.actions.continue')}
                  </Button>
                  <Button variant="ghost" size="xs" className="!font-normal" onClick={cancel}>
                    {t('settings.providers.page.actions.cancel')}
                  </Button>
                </div>
              </div>
            )}
>>>>>>> bc50ba56a

                {attempt.flow.browserCookieNames && attempt.flow.browserCookieNames.length > 0 ? (
                  <p className="typography-meta text-muted-foreground">
                    {t('settings.providers.native.browserCookies', { cookies: attempt.flow.browserCookieNames.join(', ') })}
                  </p>
                ) : null}

                {userCode ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={userCode}
                      readOnly
                      aria-label={t('settings.providers.page.auth.oauth.deviceCodeLabel')}
                      className="font-mono text-center tracking-widest"
                    />
                    <Button
                      variant="outline"
                      size="xs"
                      className="!font-normal shrink-0"
                      onClick={() => void copy(
                        userCode,
                        'settings.providers.page.toast.deviceCodeCopied',
                        'settings.providers.page.toast.deviceCodeCopyFailed',
                      )}
                    >
                      {t('settings.providers.page.actions.copyCode')}
                    </Button>
                  </div>
                ) : null}

                {attempt.flow.authorizationUrl ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={attempt.flow.authorizationUrl}
                      readOnly
                      aria-label={t('settings.providers.page.auth.oauth.linkLabel')}
                      className="text-xs text-muted-foreground"
                    />
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="outline"
                        size="xs"
                        className="!font-normal"
                        onClick={() => void openExternalUrl(attempt.flow.authorizationUrl!)}
                      >
                        {t('settings.providers.page.actions.open')}
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        className="!font-normal"
                        onClick={() => void copy(
                          attempt.flow.authorizationUrl!,
                          'settings.providers.page.toast.oauthLinkCopied',
                          'settings.providers.page.toast.oauthLinkCopyFailed',
                        )}
                      >
                        {t('settings.providers.page.actions.copy')}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2">
                  <p className="typography-meta text-muted-foreground flex items-center gap-2">
                    <Icon name="loader" className="h-3.5 w-3.5 animate-spin" />
                    {t('settings.providers.page.auth.oauth.waiting')}
                  </p>
<<<<<<< HEAD
=======
                  <Button variant="ghost" size="xs" className="!font-normal shrink-0" onClick={cancel}>
                    {t('settings.providers.page.actions.cancel')}
                  </Button>
                </div>
                <p className="typography-meta text-muted-foreground">
                  {t('settings.providers.page.auth.oauth.waitingHint')}
                </p>
                {flow.attempt.paste && (
                  <div className="space-y-2">
                    <p className="typography-meta text-muted-foreground">
                      {t('settings.providers.page.auth.oauth.pasteRedirectHint')}
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={redirectInput}
                        onChange={(event) => setRedirectInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void submitRedirect();
                        }}
                        placeholder={t('settings.providers.page.auth.oauth.pasteRedirectPlaceholder')}
                        aria-label={t('settings.providers.page.auth.oauth.pasteRedirectPlaceholder')}
                        className="font-mono text-xs"
                        disabled={redirectSubmit.submitting}
                      />
                      <Button
                        size="xs"
                        className="!font-normal shrink-0"
                        onClick={() => void submitRedirect()}
                        disabled={redirectSubmit.submitting || redirectInput.trim().length === 0}
                      >
                        {t('settings.providers.page.actions.complete')}
                      </Button>
                    </div>
                    {/* Reserved, so an error does not push what follows. */}
                    <p className="typography-meta min-h-[1lh] text-[var(--status-error)]">
                      {redirectSubmit.error}
                    </p>
                  </div>
                )}
              </div>
            )}

            {isActive && flow.phase === 'awaitingCode' && (
              <div className="space-y-3">
                {renderAttemptDetails(flow.attempt)}
                <p className="typography-meta text-muted-foreground">
                  {t('settings.providers.page.auth.oauth.codeHint')}
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={codeInput}
                    onChange={(event) => setCodeInput(event.target.value)}
                    placeholder={t('settings.providers.page.auth.pasteAuthorizationCodePlaceholder')}
                    className="font-mono text-xs"
                    disabled={flow.submitting}
                  />
                  <Button
                    size="xs"
                    className="!font-normal shrink-0"
                    onClick={() => void submitCode()}
                    disabled={flow.submitting || codeInput.trim().length === 0}
                  >
                    {flow.submitting
                      ? t('settings.providers.page.actions.saving')
                      : t('settings.providers.page.actions.complete')}
                  </Button>
>>>>>>> bc50ba56a
                  <Button
                    variant="ghost"
                    size="xs"
                    className="!font-normal shrink-0"
                    disabled={busy}
                    onClick={() => void send(attempt.method, {
                      action: 'cancel',
                      flowId: attempt.flow.flowId,
                      generation: attempt.flow.generation,
                    }, attempt.expectedRevision)}
                  >
                    {t('settings.providers.page.actions.cancel')}
                  </Button>
                </div>

                <p className="typography-meta text-muted-foreground">
                  {t('settings.providers.page.auth.oauth.waitingHint')}
                </p>

                {attempt.flow.manualInput ? (
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!input || busy || disabled) return;
                      const value = input;
                      setInput('');
                      void send(attempt.method, {
                        action: 'input',
                        flowId: attempt.flow.flowId,
                        generation: attempt.flow.generation,
                        input: value,
                      }, attempt.expectedRevision);
                    }}
                  >
                    <p className="typography-meta text-muted-foreground">
                      {attempt.flow.prompt || t('settings.providers.page.auth.oauth.codeHint')}
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder={t('settings.providers.page.auth.pasteAuthorizationCodePlaceholder')}
                        autoComplete="off"
                        className="font-mono text-xs"
                        disabled={busy || disabled}
                      />
                      <Button
                        type="submit"
                        size="xs"
                        className="!font-normal shrink-0"
                        disabled={busy || disabled || input.trim().length === 0}
                      >
                        {t('settings.providers.page.actions.continue')}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : null}

            {isActive && attempt && attempt.flow.status === 'ready' && !failed ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    className="!font-normal"
                    disabled={busy || disabled}
                    onClick={() => void send(attempt.method, {
                      action: 'commit',
                      flowId: attempt.flow.flowId,
                      generation: attempt.flow.generation,
                      expectedRevision: attempt.expectedRevision,
                    }, attempt.expectedRevision)}
                  >
                    {t('settings.providers.page.actions.complete')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="!font-normal"
                    disabled={busy}
                    onClick={() => void send(attempt.method, {
                      action: 'cancel',
                      flowId: attempt.flow.flowId,
                      generation: attempt.flow.generation,
                    }, attempt.expectedRevision)}
                  >
                    {t('settings.providers.page.actions.cancel')}
                  </Button>
                </div>
              </div>
            ) : null}

            {failed && (failedMethodId === method.methodId || isActive) ? (
              <div className="space-y-2">
<<<<<<< HEAD
                <p role="alert" className="typography-meta text-[var(--status-error)]">
                  {t('settings.providers.page.toast.oauthCompleteFailed')}
                </p>
                <p className="typography-meta text-muted-foreground">
                  {t('settings.providers.native.oauthFailureHint')}
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  className="!font-normal"
                  disabled={busy || disabled}
                  onClick={() => {
                    setFailed(false);
                    setFailedMethodId(null);
                    setInput('');
                    void send(method, { action: 'start', expectedRevision: revision }, revision);
                  }}
                >
                  {t('settings.providers.page.actions.tryAgain')}
                </Button>
=======
                <p dir="auto" className="typography-meta text-[var(--status-error)]">{flow.message}</p>
                {showStartButton ? (
                  <Button
                    variant="outline"
                    size="xs"
                    className="!font-normal"
                    onClick={() => beginConnect(method)}
                  >
                    {t('settings.providers.page.actions.tryAgain')}
                  </Button>
                ) : null}
>>>>>>> bc50ba56a
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
