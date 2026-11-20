import React from 'react';

import { formatSessionActivityDuration } from '@/components/session/sessionActivityDurationFormat';
import { useDurationTickerNow } from '@/hooks/useDurationTicker';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Session, SessionSnapshot } from '@openchamber/agent-contract';
import { resolveUsageTone } from '@/lib/quota';
import { formatRetryCountdown, toRetryTargetTimestamp } from '@/lib/retryCountdown';
import { findAnsweringModelKey, limitsForAnsweringModel } from '@/lib/routing/contextWindowLimits';
import { useConfigStore } from '@/stores/useConfigStore';
import { resolveGlobalSessionDirectory } from '@/stores/globalSessionStructure';
import { findLatestContextFill } from '@/stores/utils/tokenUtils';
import { useDirectorySync } from '@/sync/sync-context';
import type { State } from '@/sync/types';
import { DEFAULT_CONTEXT_LIMIT } from './contextUsage';
import {
  SUBAGENT_SILENCE_MS,
  decodeSubagentActivity,
  encodeSubagentActivity,
  readSubagentActivity,
  subagentAlertInputs,
  toolCallText,
  type SubagentActivity,
} from './subagentActivity';

type ActivityInputs = { messages: State['message'][string] | undefined; turns: SessionSnapshot['turns'] | undefined; activeRunId: string | null | undefined; status: State['session_status'][string] | undefined; alertsOnly: boolean; encoded: string };

const useSubagentActivity = (childId: string, directory: string | null, alertsOnly: boolean): SubagentActivity | null => {
  const last = React.useRef<ActivityInputs | null>(null);
  const encoded = useDirectorySync(
    React.useCallback((state: State) => {
      const messages = state.message[childId];
      const turns = state.snapshot[childId]?.turns;
      const activeRunId = state.session.find((session) => session.sessionId === childId)?.activeRunId;
      const status = state.session_status[childId];
      const previous = last.current;
      if (previous && previous.messages === messages && previous.turns === turns && previous.activeRunId === activeRunId && previous.status === status && previous.alertsOnly === alertsOnly) return previous.encoded;
      const activeTurnIds = new Set((turns ?? []).filter((turn) => turn.runId === activeRunId
        && (turn.status === 'pending' || turn.status === 'running' || turn.status === 'awaiting_approval' || turn.status === 'awaiting_input')).map((turn) => turn.turnId));
      const activity = readSubagentActivity(messages, status, activeTurnIds);
      const next = encodeSubagentActivity(alertsOnly ? subagentAlertInputs(activity) : activity);
      last.current = { messages, turns, activeRunId, status, alertsOnly, encoded: next };
      return next;
    }, [alertsOnly, childId]),
    directory ?? undefined,
  );
  return React.useMemo(() => decodeSubagentActivity(encoded), [encoded]);
};

const useSubagentContextPercent = (child: Session, directory: string | null): number | null => {
  const providers = useConfigStore((state) => state.providers);
  const tokens = useDirectorySync(
    React.useCallback((state: State) => {
      const fill = findLatestContextFill(state.message[child.sessionId] ?? []);
      return fill?.state === 'measured' ? fill.totalTokens : 0;
    }, [child.sessionId]),
    directory ?? undefined,
  );
  const answeringKey = useDirectorySync(
    React.useCallback((state: State) => findAnsweringModelKey(state.message[child.sessionId] ?? []), [child.sessionId]),
    directory ?? undefined,
  );
  if (tokens <= 0) return null;
  const limit = limitsForAnsweringModel(answeringKey, providers).context
    || DEFAULT_CONTEXT_LIMIT;
  return (tokens / limit) * 100;
};

type SubagentContextTone = 'muted' | 'warning' | 'error';

const subagentContextTone = (percent: number): SubagentContextTone => {
  const tone = resolveUsageTone(Math.round(percent));
  return tone === 'critical' ? 'error' : tone === 'warn' ? 'warning' : 'muted';
};

const TONE_STYLE = {
  muted: undefined,
  warning: { color: 'var(--status-warning)' },
  error: { color: 'var(--status-error)' },
} satisfies Record<SubagentContextTone, React.CSSProperties | undefined>;

const TOOL_ELAPSED_SHOWN_MS = 10_000;

type ActivityText = { text: string; tone: 'muted' | 'warning' } | null;

const useActivityText = (activity: SubagentActivity | null): ActivityText => {
  const { t, locale } = useI18n();
  const ticking = activity !== null && (activity.kind === 'tool' && activity.since !== null || activity.kind === 'waiting' || activity.kind === 'retry');
  const now = useDurationTickerNow(ticking);
  if (!activity) return null;
  switch (activity.kind) {
    case 'retry': {
      const at = activity.at !== null && activity.at > 0 ? toRetryTargetTimestamp(activity.at, now) : null;
      const seconds = at !== null ? Math.ceil(Math.max(0, at - now) / 1000) : 0;
      const time = seconds > 0 ? formatRetryCountdown(seconds, locale) : null;
      const attempt = activity.attempt !== null && activity.attempt > 1 ? activity.attempt : null;
      const retrying = time && attempt ? t('chat.agentStatus.retry.inAttempt', { time, attempt })
        : time ? t('chat.agentStatus.retry.in', { time })
          : attempt ? t('chat.agentStatus.retry.attempt', { attempt })
            : t('chat.agentStatus.retry');
      return { text: activity.error ? `${activity.error} · ${retrying}` : retrying, tone: 'warning' };
    }
    case 'tool': {
      const call = toolCallText(activity);
      const elapsed = activity.since === null ? 0 : now - activity.since;
      return {
        text: elapsed >= TOOL_ELAPSED_SHOWN_MS ? `${call} · ${formatSessionActivityDuration(elapsed, t)}` : call,
        tone: 'muted',
      };
    }
    case 'thinking':
      return { text: t('chat.workStatus.subagent.activity.thinking'), tone: 'muted' };
    case 'writing':
      return { text: t('chat.workStatus.subagent.activity.writing'), tone: 'muted' };
    case 'waiting': {
      const quiet = now - activity.since;
      if (quiet >= SUBAGENT_SILENCE_MS) {
        return { text: t('chat.workStatus.subagent.activity.silent', { time: formatSessionActivityDuration(quiet, t) }), tone: 'warning' };
      }
      const last = activity.last ? toolCallText(activity.last) : '';
      return last ? { text: last, tone: 'muted' } : null;
    }
  }
};

export const SubagentActivityText: React.FC<{ childId: string; directory: string | null; identity: string; alertsOnly?: boolean }> = ({ childId, directory, identity, alertsOnly }) => {
  const activity = useSubagentActivity(childId, directory, alertsOnly ?? false);
  const line = useActivityText(activity);
  if (!line || (alertsOnly && line.tone !== 'warning')) return <>{identity}</>;
  return (
    <>
      <span style={line.tone === 'warning' ? { color: 'var(--status-warning)' } : undefined}>{line.text}</span>
      {identity ? ` · ${identity}` : null}
    </>
  );
};

export const SubagentContextValue: React.FC<{ child: Session; directory: string | null }> = ({ child, directory }) => {
  const { t } = useI18n();
  const percent = useSubagentContextPercent(child, resolveGlobalSessionDirectory(child) || directory);
  if (percent === null) return null;
  const rounded = Math.round(percent);
  const tone = subagentContextTone(percent);
  return (
    <span
      dir="ltr"
      className={cn('text-[0.6875rem] leading-4', tone === 'muted' && 'text-muted-foreground')}
      style={TONE_STYLE[tone]}
      aria-label={t('chat.workStatus.subagent.contextAria', { percent: rounded })}
    >
      {`${rounded}%`}
    </span>
  );
};
