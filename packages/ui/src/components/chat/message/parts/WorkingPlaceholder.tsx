import React from 'react';
import { useI18n, type Locale } from '@/lib/i18n';
import type { AgentStatus } from '@/lib/agentStatus';
import { useAgentStatusLabel } from '@/hooks/useAgentStatusLabel';
import { ProviderLogo } from '@/components/ui/ProviderLogo';

interface WorkingPlaceholderProps {
  isWorking: boolean;
  status: AgentStatus | null;
  isWaitingForPermission?: boolean;
  retryInfo?: { attempt?: number; maxAttempts?: number; next?: number } | null;
  agentName?: string;
  modelName?: string | null;
  providerId?: string | null;
}

const EPOCH_SECONDS_THRESHOLD = 1_000_000_000;
const EPOCH_MILLISECONDS_THRESHOLD = 1_000_000_000_000;

const toRetryTargetTimestamp = (next: number): number => {
  if (next >= EPOCH_MILLISECONDS_THRESHOLD) {
    return next;
  }
  if (next >= EPOCH_SECONDS_THRESHOLD) {
    return next * 1000;
  }
  return Date.now() + next;
};

/** "1h 30m" in the reader's language, two largest units. */
const formatRetryCountdown = (seconds: number, locale: Locale): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts: Array<[string, number]> = days > 0 ? [['day', days], ['hour', hours]]
    : hours > 0 ? [['hour', hours], ['minute', minutes]]
      : minutes > 0 ? [['minute', minutes], ['second', secs]]
        : [['second', secs]];
  // Each unit in the locale's narrow form ("2m", "2 хв"), joined by a space.
  return parts
    .filter(([, value], index) => index === 0 || value > 0)
    .map(([unit, value]) => new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value))
    .join(' ');
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

  // Countdown state for retry mode
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

  if (!isWorking) {
    return null;
  }

  const providerLogo = providerId ? (
    // Flex sibling of the label, never an inline rider on the text line: a
    // tall inline-block drags the line box with it and the label drifts off
    // the chip's vertical center. As flex children both center independently.
    // 16px box like the scroll pill's arrow icon. The padding normalizes
    // the mark to the arrow glyph's geometry (~10.4px wide, ~2.8px inset),
    // so equal boxes and equal paddings also mean equal visible edges.
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
      // Full muted-foreground, matching the scroll-to-bottom pill's status
      // text: the row and the pill hand off to each other in the same spot
      // and must read as one element changing chrome.
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
