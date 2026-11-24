import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { SessionActivityDuration } from '@/components/session/SessionActivityDuration';
import { formatSessionActivityDuration } from '@/components/session/sessionActivityDurationFormat';
import { useI18n } from '@/lib/i18n';
import { resolveGlobalSessionDirectory } from '@/stores/globalSessionStructure';
import { useHasSessionActivityDuration } from '@/sync/session-activity-timing';
import { WorkStatusRow, WorkStatusValue } from './WorkStatusPrimitives';
import { formatCost } from './subagentCost';
import { SubagentActivityText, SubagentContextValue } from './SubagentLive';
import { formatTelemetryTokens } from './telemetry';
import { subagentRowLook, type SubagentRow } from './useSubagentRows';

const RunningDuration: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const hasDuration = useHasSessionActivityDuration(sessionId, true);
  return hasDuration ? <SessionActivityDuration sessionId={sessionId} running className="text-[0.6875rem] leading-4" /> : null;
};

const RowDetail: React.FC<{ row: SubagentRow; directory: string | null; showActivity: boolean }> = ({ row, directory, showActivity }) => {
  const { t } = useI18n();
  if (row.busy && !row.blocked && !row.asked) {
    const activityDirectory = (row.child ? resolveGlobalSessionDirectory(row.child) : null) || directory;
    return (
      <span dir="auto" className="oc-ui-start-align block truncate">
        <SubagentActivityText
          childId={row.childSessionId ?? row.subagentId}
          subagent={row.subagent}
          directory={activityDirectory}
          identity={row.identity}
          alertsOnly={!showActivity}
        />
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span dir="auto" className="oc-ui-start-align min-w-0 flex-1 truncate">{row.identity}</span>
      {row.finished && row.elapsedMs !== null ? (
        <span dir="auto" className="shrink-0 tabular-nums">{formatSessionActivityDuration(row.elapsedMs, t)}</span>
      ) : null}
    </span>
  );
};

export const SubagentStatusRow: React.FC<{
  row: SubagentRow;
  directory: string | null;
  onClick?: () => void;
  ariaLabel: string;
  expanded?: boolean;
  showActivity?: boolean;
}> = ({ row, directory, onClick, ariaLabel, expanded, showActivity = false }) => {
  const { t } = useI18n();
  const { blocked, asked, busy } = row;
  const label = row.displayName?.trim() || t('chat.workStatus.subagent.untitled');
  const look = subagentRowLook(row);
  const report = row.finished ? row.reportLine : null;
  const durationSessionId = row.childSessionId;
  return (
    <WorkStatusRow
      onClick={onClick}
      ariaLabel={[ariaLabel, look.labelKey ? t(look.labelKey) : ''].filter(Boolean).join('. ')}
      expanded={expanded}
      className={row.detached ? 'opacity-50' : undefined}
      leading={(
        <span className="flex size-[13px] shrink-0 items-center justify-center">
          <Icon name={look.icon} className="size-3" style={look.color ? { color: look.color } : undefined} />
        </span>
      )}
      label={<span className={row.finished ? 'oc-title-rest' : 'text-foreground'}>{label}</span>}
      labelDir="auto"
      detail={busy || row.identity || row.finished ? <RowDetail row={row} directory={directory} showActivity={showActivity} /> : undefined}
      tooltip={report || row.identity ? (
        <span className="flex flex-col gap-0.5">
          {row.identity ? <span>{row.identity}</span> : null}
          {report ? <span dir="auto">{report}</span> : null}
        </span>
      ) : undefined}
      value={(
        <>
          {blocked ? (
            <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.needsPermission')}</WorkStatusValue>
          ) : asked ? (
            <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.askedQuestion')}</WorkStatusValue>
          ) : busy && durationSessionId ? <RunningDuration sessionId={durationSessionId} /> : null}
          {busy || blocked || asked ? <SubagentContextValue child={row.child} subagent={row.subagent} directory={directory} /> : null}
          {row.tokens > 0 ? <span dir="ltr" className="text-[0.6875rem] leading-4 text-muted-foreground">{formatTelemetryTokens(row.tokens)}</span> : null}
          {row.cost > 0 ? <span dir="ltr" className="text-[0.6875rem] leading-4 text-muted-foreground">{formatCost(row.cost)}</span> : null}
        </>
      )}
    />
  );
};
