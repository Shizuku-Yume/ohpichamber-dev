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
import { getRuntimeKey } from '@/lib/runtime-switch';

type Attempt = { method: Methods['methods'][number]; flow: ProviderOAuthResult; expectedRevision: string };

interface OAuthOwner {
  active: boolean;
  serial: number;
  runtime: string;
  attempt: Attempt | null;
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
}) => {
  const { t } = useI18n();
  const [attempt, setAttempt] = React.useState<Attempt | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  const [failedMethodId, setFailedMethodId] = React.useState<string | null>(null);
  const owner = React.useRef<OAuthOwner>({ active: true, serial: 0, runtime: getRuntimeKey(), attempt: null });

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

  const copy = async (value: string, successKey: I18nKey, failureKey: I18nKey) => {
    const result = await copyTextToClipboard(value);
    if (result.ok) toast.success(t(successKey));
    else toast.error(t(failureKey));
  };

  const active = attempt && (attempt.flow.status === 'pending' || attempt.flow.status === 'ready');
  const userCode = attempt?.flow.instructions ? extractUserCode(attempt.flow.instructions) : undefined;

  return (
    <div className={cn('space-y-4', className)}>
      {methods.map((method) => {
        const isActive = attempt?.method.methodId === method.methodId;
        return (
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

            {isActive && attempt && attempt.flow.status === 'pending' && !failed ? (
              <div className="space-y-3">
                {attempt.flow.instructions ? (
                  <p className="typography-meta text-[var(--status-info-text)] bg-[var(--status-info-background)] px-2 py-1.5 rounded">
                    {attempt.flow.instructions}
                  </p>
                ) : null}

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
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
