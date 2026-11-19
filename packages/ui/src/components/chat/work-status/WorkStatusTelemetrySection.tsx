import React from 'react';
import { getCurrentIntlLocale, useI18n } from '@/lib/i18n';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDirectorySync, useSessionMessageRecords, useSyncDirectory, useSyncRuntime } from '@/sync/sync-context';
import { normalizePath } from '@/lib/pathNormalization';
import { useUIStore } from '@/stores/useUIStore';
import {
  WorkStatusCollapsibleSection,
  WorkStatusRow,
  WorkStatusValue,
} from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
import {
  formatTelemetryDuration,
  formatTelemetryTokens,
  formatThroughputRate,
  getLatestCompletedTurnStats,
  type CompletedTurnStats,
} from './telemetry';

type Props = {
  sessionId: string | null;
  directory: string | null;
};

const formatCost = (cost: number): string => `$${cost.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`;

const TelemetryRow: React.FC<{ label: string; description: string; value: React.ReactNode }> = ({ label, description, value }) => (
  <Tooltip delayDuration={750}>
    <TooltipTrigger asChild>
      <div tabIndex={0} className="min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <WorkStatusRow label={label} value={value} />
      </div>
    </TooltipTrigger>
    <TooltipContent side="left" sideOffset={8} className="max-w-[min(320px,calc(100vw-24px))] whitespace-normal break-words text-left">
      <p className="font-medium">{label}</p>
      <p>{description}</p>
    </TooltipContent>
  </Tooltip>
);

export const WorkStatusTelemetrySection: React.FC<Props> = ({ sessionId, directory }) => {
  const { t } = useI18n();
  const expanded = useUIStore(
    React.useCallback((state) => state.workStatusExpandedSections['telemetry'] ?? true, []),
  );
  const { runtimeKey } = useSyncRuntime();
  const syncDirectory = useSyncDirectory();
  const scope = JSON.stringify([runtimeKey, normalizePath(directory ?? syncDirectory), sessionId]);
  const status = useDirectorySync(
    React.useCallback((state) => sessionId && !state.sessionStatusInvalidated?.[sessionId]
      ? state.session_status[sessionId] ?? 'unavailable'
      : 'unavailable', [sessionId]),
    directory ?? undefined,
  );
<<<<<<< HEAD
  const eligibleForStats = Boolean(sessionId && expanded && status === 'idle');
||||||| bc50ba56aa
  // The collapsed header still needs the latest completed response speed.
  const eligibleForStats = Boolean(sessionId && status === 'idle');
=======
  const eligibleForStats = Boolean(sessionId && status === 'idle');
>>>>>>> upstream/main

  const records = useSessionMessageRecords(
    sessionId ?? '',
    directory ?? undefined,
    { enabled: eligibleForStats },
  );

  const turns = useDirectorySync(
    React.useCallback((state) => (sessionId ? state.snapshot[sessionId]?.turns ?? null : null), [sessionId]),
    directory ?? undefined,
  );

  const computed = React.useMemo(() => {
    if (!eligibleForStats) return null;
    return getLatestCompletedTurnStats(records, turns);
  }, [eligibleForStats, records, turns]);

  const [retained, setRetained] = React.useState<{ scope: string; stats: CompletedTurnStats | null } | null>(null);
  React.useEffect(() => {
    if (eligibleForStats) {
      setRetained({ scope, stats: computed });
<<<<<<< HEAD
    } else {
      setRetained((previous) => previous?.scope === scope && status !== 'unavailable' ? previous : null);
||||||| bc50ba56aa
    } else if (status === 'unknown') {
      setRetained(null);
    } else if (retained?.scope !== scope) {
      // A mid-run mount reads warm history once without subscribing to the stream.
      const snapshot = buildSessionMessageRecordsSnapshot(store.getState(), sessionId ?? '');
      setRetained({ scope, stats: getPreviousCompletedTurnStats(snapshot.list) });
=======
    } else if (status === 'unknown') {
      setRetained(null);
    } else if (retained?.scope !== scope) {
      const snapshot = buildSessionMessageRecordsSnapshot(store.getState(), sessionId ?? '');
      setRetained({ scope, stats: getPreviousCompletedTurnStats(snapshot.list) });
>>>>>>> upstream/main
    }
<<<<<<< HEAD
  }, [scope, status, eligibleForStats, computed]);
  const stats = eligibleForStats ? computed : status !== 'unavailable' && retained?.scope === scope ? retained.stats : null;
  const summary = stats && stats.responseTokensPerSecond !== null
    ? formatThroughputRate(stats.responseTokensPerSecond)
    : undefined;
||||||| bc50ba56aa
  }, [scope, status, eligibleForStats, computed, retained?.scope, store, sessionId]);
  const stats = eligibleForStats ? computed : status !== 'unknown' && retained?.scope === scope ? retained.stats : null;
  const previousTurn = stats !== null && (stats.previousTurn || !eligibleForStats);
  const rate = stats && stats.responseTokensPerSecond !== null
    ? formatThroughputRate(stats.responseTokensPerSecond)
    : undefined;
  const summary = previousTurn
    ? rate !== undefined
      ? t('chat.workStatus.telemetry.previousTurnRate', { rate })
      : t('chat.workStatus.telemetry.previousTurn')
    : rate;
=======
  }, [scope, status, eligibleForStats, computed, retained?.scope, store, sessionId]);
  const stats = eligibleForStats ? computed : status !== 'unknown' && retained?.scope === scope ? retained.stats : null;
  const previousTurn = stats !== null && (stats.previousTurn || !eligibleForStats);
  const hasCost = stats !== null && stats.cost !== null && stats.cost > 0;
  const figures = stats ? [
    !hasCost && stats.responseTokensPerSecond !== null ? formatThroughputRate(stats.responseTokensPerSecond) : null,
    stats.elapsedDurationMs !== null ? formatTelemetryDuration(stats.elapsedDurationMs) : null,
    hasCost && stats.cost !== null ? formatCost(stats.cost) : null,
  ].filter((figure): figure is string => figure !== null).join(' · ') : '';
  const summary = previousTurn
    ? figures
      ? t('chat.workStatus.telemetry.previousTurnRate', { rate: figures })
      : t('chat.workStatus.telemetry.previousTurn')
    : figures || undefined;
>>>>>>> upstream/main

  useReportWorkStatusPresence('telemetry', Boolean(sessionId));

  if (!sessionId) return null;

  return (
    <WorkStatusCollapsibleSection
      id="telemetry"
      title={t('chat.workStatus.section.telemetry')}
      icon="bar-chart-2"
      summary={summary}
    >
      {stats ? (
        <>
          {stats.responseTokensPerSecond !== null ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.responseSpeed')}
              description={t('chat.workStatus.telemetry.responseSpeedDescription')}
              value={<WorkStatusValue>{formatThroughputRate(stats.responseTokensPerSecond)}</WorkStatusValue>}
            />
          ) : null}
          {stats.tokensPerSecond !== null ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.speed')}
              description={t('chat.workStatus.telemetry.speedDescription')}
              value={<WorkStatusValue>{formatThroughputRate(stats.tokensPerSecond)}</WorkStatusValue>}
            />
          ) : null}
          {stats.elapsedDurationMs !== null ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.elapsed')}
              description={t('chat.workStatus.telemetry.elapsedDescription')}
              value={<WorkStatusValue>{formatTelemetryDuration(stats.elapsedDurationMs)}</WorkStatusValue>}
            />
          ) : null}

          {stats.totalLlmDurationMs !== null ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.llmDuration')}
              description={t('chat.workStatus.telemetry.llmDurationDescription')}
              value={<WorkStatusValue>{formatTelemetryDuration(stats.totalLlmDurationMs)}</WorkStatusValue>}
            />
          ) : null}

          {stats.totalToolDurationMs !== null ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.toolDuration')}
              description={t('chat.workStatus.telemetry.toolDurationDescription')}
              value={<WorkStatusValue>{formatTelemetryDuration(stats.totalToolDurationMs)}</WorkStatusValue>}
            />
          ) : null}

          {stats.avgTtftMs !== null ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.ttft')}
              description={t('chat.workStatus.telemetry.ttftDescription')}
              value={<WorkStatusValue>{formatTelemetryDuration(stats.avgTtftMs)}</WorkStatusValue>}
            />
          ) : null}

          {stats.avgFirstOutputMs !== null ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.firstOutput')}
              description={t('chat.workStatus.telemetry.firstOutputDescription')}
              value={<WorkStatusValue>{formatTelemetryDuration(stats.avgFirstOutputMs)}</WorkStatusValue>}
            />
          ) : null}

          {stats.stepsCount > 1 ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.steps')}
              description={t('chat.workStatus.telemetry.stepsDescription')}
              value={<WorkStatusValue>{stats.stepsCount}</WorkStatusValue>}
            />
          ) : null}

          {stats.inputTokens !== null && stats.outputTokens !== null && stats.totalGeneratedTokens !== null ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.tokens')}
              description={t('chat.workStatus.telemetry.tokensDescription', {
                input: stats.inputTokens.toLocaleString(getCurrentIntlLocale()),
                output: stats.outputTokens.toLocaleString(getCurrentIntlLocale()),
              })}
              value={(
                <WorkStatusValue>
                  {t('chat.workStatus.telemetry.tokens.inOut', {
                    input: formatTelemetryTokens(stats.inputTokens),
                    output: formatTelemetryTokens(stats.totalGeneratedTokens),
                  })}
                </WorkStatusValue>
              )}
            />
          ) : null}

          {stats.cacheHitPercent !== null ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.cacheHit')}
              description={t('chat.workStatus.telemetry.cacheHitDescription')}
              value={(
                <WorkStatusValue tone={stats.cacheHitPercent >= 50 ? 'success' : 'default'}>
                  {`${stats.cacheHitPercent}%`}
                </WorkStatusValue>
              )}
            />
          ) : null}

          {stats.cost !== null ? (
            <TelemetryRow
              label={t('chat.workStatus.telemetry.cost')}
              description={t('chat.workStatus.telemetry.costDescription')}
              value={<WorkStatusValue tone="muted">{formatCost(stats.cost)}</WorkStatusValue>}
            />
          ) : null}
        </>
      ) : null}
    </WorkStatusCollapsibleSection>
  );
};
