import React from 'react';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { SessionActivityDuration } from '@/components/session/SessionActivityDuration';
import { useHasSessionActivityDuration } from '@/sync/session-activity-timing';
import { useI18n } from '@/lib/i18n';
import { useAllLiveSessions, useAllSessionStatuses, useDirectorySync } from '@/sync/sync-context';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusValue } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
import type { State } from '@/sync/types';

type Props = {
  sessionId: string | null;
  directory: string | null;
};

const SECTION_ID = 'subagents';

const SubagentDuration: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const hasDuration = useHasSessionActivityDuration(sessionId, true);
  return hasDuration ? <SessionActivityDuration sessionId={sessionId} running /> : null;
};

/**
 * Running subagents and, more importantly, their blockers: a permission request
 * raised by a child session has no representation in the transcript, so this
 * panel is the only place it becomes visible.
 */
export const WorkStatusSubagentsSection: React.FC<Props> = ({ sessionId, directory }) => {
  const { t } = useI18n();
  const isMobile = useUIStore((state) => state.isMobile);

  const liveSessions = useAllLiveSessions();
  const statuses = useAllSessionStatuses();
  const children = React.useMemo(
    () => (sessionId ? liveSessions.filter((candidate) => candidate.parentSessionId === sessionId) : []),
    [liveSessions, sessionId],
  );

  // Canonical sessions do not carry legacy model/cost summaries; omit them.
  // One subscription covers every child: per-session hooks would multiply
  // store subscriptions by the number of subagents.
  const permissions = useDirectorySync(React.useCallback((state: State) => state.permission, []));
  const forms = useDirectorySync(React.useCallback((state: State) => state.form, []));
  // The last turn's outcome outlives the live status: a child that went idle
  // after an error reads as failed, not done. Joined to a string so the
  // selector stays stable while nothing about these children changes.
  const failedChildIds = useGlobalSessionStatusStore(React.useCallback((state) => children
    .filter((child) => state.observedById.get(child.sessionId)?.outcome === 'failed')
    .map((child) => child.sessionId)
    .join('\n'), [children]));

  const openContextPanelTab = useUIStore((state) => state.openContextPanelTab);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
  const setSectionExpanded = useUIStore((state) => state.setWorkStatusSectionExpanded);

  // Subagents appearing where there were none is the one moment this section
  // has something urgent to say, so it opens itself. Only on the empty→present
  // edge: re-expanding on every count change would fight a user who just
  // collapsed it.
  const hadChildren = React.useRef(children.length > 0);
  React.useEffect(() => {
    const present = children.length > 0;
    if (present && !hadChildren.current) setSectionExpanded(SECTION_ID, true);
    hadChildren.current = present;
  }, [children.length, setSectionExpanded]);

  // Mobile selects the child session in place; other layouts open the child's
  // read-only chat in the context panel.
  const openChildSession = React.useCallback((childId: string, label: string) => {
    if (!directory) return;
    if (isMobile) {
      setCurrentSession(childId, directory);
      return;
    }
    openContextPanelTab(directory, {
      mode: 'chat',
      dedupeKey: `session:${childId}`,
      label,
      readOnly: true,
    });
  }, [directory, isMobile, openContextPanelTab, setCurrentSession]);

  useReportWorkStatusPresence('subagents', children.length > 0);

  if (children.length === 0) return null;

  const failedIds = new Set(failedChildIds.split('\n'));
  const rows = children.map((child) => {
    const status = statuses[child.sessionId] ?? child.runtimeStatus;
    const blocked = status === 'awaiting_approval' || (permissions[child.sessionId]?.length ?? 0) > 0;
    const asked = status === 'awaiting_input' || (forms[child.sessionId]?.length ?? 0) > 0;
    const busy = status === 'running' || status === 'awaiting_approval' || status === 'awaiting_input';
    const failed = !busy && failedIds.has(child.sessionId);
    const done = !failed && status === 'idle';
    return { child, blocked, asked, busy, failed, done, finished: !blocked && !asked && (done || failed) };
  });
  // Newest first by creation, never by last activity: an activity order
  // reshuffled the rows on every step, moving them under the pointer. Finished
  // rows sink below the unfinished ones but keep the same order among
  // themselves, so a fully finished list reads exactly as it did at launch.
  rows.sort((left, right) => (Number(left.finished) - Number(right.finished))
    || (right.child.createdAt - left.child.createdAt));

  const busyChildren = rows.filter((row) => row.busy).length;

  return (
    <WorkStatusCollapsibleSection
      id={SECTION_ID}
      title={t('chat.workStatus.section.subagents')}
      icon="ai-agent"
      defaultExpanded
      summary={busyChildren > 0 ? `${busyChildren}/${children.length}` : children.length}
    >
      <div className="max-h-56 overflow-y-auto">
        {rows.map(({ child, blocked, asked, busy, failed, done }) => {
          const label = child.metadata?.title?.trim() || t('chat.workStatus.subagent.untitled');
          let icon: IconName = 'time';
          let iconColor: string | undefined;
          let statusLabel = '';
          if (blocked || asked) {
            icon = 'alert';
            iconColor = 'var(--status-warning)';
            statusLabel = t(blocked ? 'chat.workStatus.subagent.needsPermission' : 'chat.workStatus.subagent.askedQuestion');
          } else if (busy) {
            icon = 'record-circle';
            iconColor = 'var(--status-info)';
            statusLabel = t('chat.workStatus.subagent.working');
          } else if (failed) {
            icon = 'close-circle';
            iconColor = 'var(--status-error)';
            statusLabel = t('chat.workStatus.subagent.failed');
          } else if (done) {
            icon = 'checkbox-circle';
            iconColor = 'var(--status-success)';
            statusLabel = t('chat.workStatus.subagent.done');
          }
          return (
            <WorkStatusRow
              key={child.sessionId}
              onClick={directory ? () => openChildSession(child.sessionId, label) : undefined}
              ariaLabel={[t('chat.workStatus.action.openSubagent', { name: label }), statusLabel].filter(Boolean).join('. ')}
              // The smaller status glyph sits centred in the panel's 16px icon
              // slot, so it lines up under the section icon and the label
              // starts where every other row's does.
              leading={(
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <Icon name={icon} className="size-3.5" style={iconColor ? { color: iconColor } : undefined} />
                </span>
              )}
              label={label}
              value={(
                <>
                  {blocked ? (
                    <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.needsPermission')}</WorkStatusValue>
                  ) : asked ? (
                    <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.askedQuestion')}</WorkStatusValue>
                  ) : busy ? <SubagentDuration sessionId={child.sessionId} /> : null}
                </>
              )}
            />
          );
        })}
      </div>
    </WorkStatusCollapsibleSection>
  );
};
