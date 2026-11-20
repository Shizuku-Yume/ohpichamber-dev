import React from 'react';
import { useI18n, type Locale } from '@/lib/i18n';
import type { AgentStatus } from '@/lib/agentStatus';
import { useAgentStatusLabel } from '@/hooks/useAgentStatusLabel';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { formatRetryCountdown, toRetryTargetTimestamp } from '@/lib/retryCountdown';

interface WorkingPlaceholderProps {
  isWorking: boolean;
  status: AgentStatus | null;
  isWaitingForPermission?: boolean;
  retryInfo?: { attempt?: number; maxAttempts?: number; next?: number } | null;
  agentName?: string;
  modelName?: string | null;
  providerId?: string | null;
}

const formatLimitReset = (t: ReturnType<typeof useI18n>['t'], locale: Locale, at: number): string => {
  const date = new Date(at);
  const time = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return t('chat.agentStatus.limit.today', { time });
  return t('chat.agentStatus.limit.later', { date: date.toLocaleDateString(locale, { month: 'short', day: 'numeric' }), time });
};

export function WorkingPlaceholder({
  isWorking,
  status,
  isWaitingForPermission,
  retryInfo,
  modelName,
  providerId,
}: WorkingPlaceholderProps) {
  const { t, locale } = useI18n();

  // The label follows the live status directly. A dwell here used to hold
  // every change for 1.2s, which made the row lag behind the call the agent
  // was actually making; the status source already keeps the text stable
  // between real changes.
  const displayedText: AgentStatus | null = isWorking
    ? (isWaitingForPermission ? { key: 'chat.agentStatus.waitingPermission' } : status)
    : null;
  const displayedPermission = isWorking && Boolean(isWaitingForPermission);
  const displayedLabel = useAgentStatusLabel(displayedText, modelName);

  const [retryCountdown, setRetryCountdown] = React.useState<number | null>(null);

  React.useEffect(() => {
    const rawNext = retryInfo?.next;
    if (!rawNext || rawNext <= 0) {
      setRetryCountdown(null);
      return;
    }

    const retryTargetAt = toRetryTargetTimestamp(rawNext);

    const update = () => {
      const remaining = Math.max(0, retryTargetAt - Date.now());
      setRetryCountdown(Math.ceil(remaining / 1000));
    };

    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [retryInfo?.next, retryInfo?.attempt]);

  const clearTimers = React.useCallback(() => {
    if (processQueueTimerRef.current) {
      clearTimeout(processQueueTimerRef.current);
      processQueueTimerRef.current = null;
    }
  }, []);

  const showStatus = React.useCallback((text: AgentStatus, permission: boolean) => {
    clearTimers();
    queuedStatusRef.current = null;
    setDisplayedText(text);
    setDisplayedPermission(permission);
    statusShownAtRef.current = Date.now();
  }, [clearTimers]);

  const scheduleQueueProcess = React.useCallback(() => {
    if (processQueueTimerRef.current) return;
    const elapsed = Date.now() - statusShownAtRef.current;
    const remaining = Math.max(0, STATUS_DISPLAY_TIME_MS - elapsed);
    processQueueTimerRef.current = setTimeout(() => {
      processQueueTimerRef.current = null;

      const queued = queuedStatusRef.current;
      if (queued) {
        showStatus(queued.text, queued.permission);
      }
    }, remaining);
  }, [showStatus]);

  React.useEffect(() => {
    if (!isWorking) {
      clearTimers();
      queuedStatusRef.current = null;
      setDisplayedText(null);
      setDisplayedPermission(false);
      return;
    }

    if (retryInfo) {
      clearTimers();
      queuedStatusRef.current = null;
      return;
    }

    const incomingText: AgentStatus | null = isWaitingForPermission ? { key: 'chat.agentStatus.waitingPermission' } : status;
    const incomingPermission = Boolean(isWaitingForPermission);
    const incomingGeneric = Boolean(isGenericStatus) && !incomingPermission;

    if (!incomingText) {
      return;
    }

    if (!displayedTextRef.current) {
      showStatus(incomingText, incomingPermission);
      return;
    }

    const shown = displayedTextRef.current;
    if (shown && agentStatusSignature(incomingText) === agentStatusSignature(shown) && incomingPermission === displayedPermissionRef.current) {
      return;
    }

    if (incomingGeneric) {
      return;
    }

    const elapsed = Date.now() - statusShownAtRef.current;
    if (elapsed >= STATUS_DISPLAY_TIME_MS) {
      showStatus(incomingText, incomingPermission);
      return;
    }

    queuedStatusRef.current = { text: incomingText, permission: incomingPermission };
    scheduleQueueProcess();
  }, [
    isWorking,
    status,
    isGenericStatus,
    isWaitingForPermission,
    retryInfo,
    clearTimers,
    showStatus,
    scheduleQueueProcess,
  ]);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  if (!isWorking) {
    return null;
  }

  const providerLogo = providerId ? (
    <ProviderLogo providerId={providerId} alt="" fallback={null} className="h-4 w-4 shrink-0 p-[1.3px] me-1.5" />
  ) : null;

  // Retry state: OMP names the attempt and the cap ("Retrying · attempt 1 of 3")
  // and counts the wait down, so the row does the same.
  if (retryInfo) {
    const attempt = retryInfo.attempt ?? null;
    const max = retryInfo.maxAttempts ?? null;
    const time = retryCountdown !== null && retryCountdown > 0 ? formatRetryCountdown(retryCountdown, locale) : null;
    const retrying = time && attempt && max ? t('chat.agentStatus.retry.inAttempt', { time, attempt, max })
      : time ? t('chat.agentStatus.retry.in', { time })
        : attempt && max ? t('chat.agentStatus.retry.attempt', { attempt, max })
          : t('chat.agentStatus.retry');
    const resetsAt = retryInfo.resetsAt;
    const retryTargetAt = retryInfo.next ? toRetryTargetTimestamp(retryInfo.next) : Date.now();
    const retryText = resetsAt !== undefined && resetsAt > retryTargetAt
      ? `${formatLimitReset(t, locale, resetsAt)} · ${retrying}`
      : retrying;

    return (
      <div
        className="flex h-full items-center text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-label={retrying}
      >
        {providerLogo}
        <span className="typography-ui-header">{retrying}</span>
      </div>
    );
  }

  if (!displayedText || !displayedLabel) {
    return null;
  }

  const label = displayedLabel;

  return (
    <div
      className={
        'flex h-full items-center text-muted-foreground'
      }
      role="status"
      aria-live={displayedPermission ? 'assertive' : 'polite'}
      aria-label={label}
      data-waiting={displayedPermission ? 'true' : undefined}
    >
      {providerLogo}
      <span className="text-[0.8125rem] leading-4">{label}</span>
    </div>
  );
}
