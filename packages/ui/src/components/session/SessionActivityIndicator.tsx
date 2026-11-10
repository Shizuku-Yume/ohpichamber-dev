import React from 'react';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { useI18n } from '@/lib/i18n';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { cn } from '@/lib/utils';

/**
 * What a session row or aggregate is showing: its own turn running
<<<<<<< HEAD
 * (busy/retry), a pause kept open by a background subagent or a background
 * command, or a finished turn the user has not seen.
 */
type SessionActivityIndicatorState = 'running' | 'subagent' | 'shell' | 'pullRequest' | 'unread';

const PRESENTATION = {
  running: { icon: 'circle', colorClass: 'text-status-info', labelKey: 'sessions.sidebar.session.status.active' },
  subagent: { icon: 'robot', colorClass: 'text-status-info', labelKey: 'sessions.sidebar.session.status.backgroundSubagent' },
  shell: { icon: 'terminal', colorClass: 'text-status-info', labelKey: 'sessions.sidebar.session.status.backgroundCommand' },
  // Waiting on a pull request shares the running circle: the row's linked pull
  // request already puts that icon there, and the tooltip names the wait.
=======
 * (busy/retry), a pause kept open by a workflow run, a background subagent, a
 * background command or image, an agent waiting on its pull request, or a
 * finished turn the user has not seen.
 */
type SessionActivityIndicatorState = 'running' | 'workflow' | 'subagent' | 'shell' | 'image' | 'pullRequest' | 'unread';

const PRESENTATION = {
  running: { icon: 'circle', colorClass: 'text-status-info', labelKey: 'sessions.sidebar.session.status.active' },
  workflow: { icon: 'flow-chart', colorClass: 'text-status-info', labelKey: 'sessions.sidebar.session.status.workflowRunning' },
  subagent: { icon: 'robot-2', colorClass: 'text-status-info', labelKey: 'sessions.sidebar.session.status.backgroundSubagent' },
  shell: { icon: 'terminal', colorClass: 'text-status-info', labelKey: 'sessions.sidebar.session.status.backgroundCommand' },
  image: { icon: 'image', colorClass: 'text-status-info', labelKey: 'sessions.sidebar.session.status.backgroundImage' },
>>>>>>> bc50ba56a
  pullRequest: { icon: 'circle', colorClass: 'text-status-info', labelKey: 'sessions.sidebar.session.status.waitingOnPullRequest' },
  unread: { icon: 'checkbox-circle', colorClass: 'text-status-success', labelKey: 'sessions.sidebar.session.status.unread' },
} as const satisfies Record<SessionActivityIndicatorState, { icon: IconName; colorClass: string; labelKey: string }>;

/**
<<<<<<< HEAD
 * Live-activity marker for one session row or aggregate. Each state has its
 * own static icon, so a row says why it is busy without motion; motion lives
 * in the 1 Hz elapsed counter (see faa9c243). The opt-in
 * `animatedActivityIndicators` preference replaces every running kind with a
 * `loader-4` spinner stepped to 20 fps (`.activity-spinner`, VS Code's
 * steps() throttling); the unread icon stays.
=======
 * Live-activity marker for one session row or aggregate. Each state has a
 * static icon, so a row says why it is busy without motion; motion lives in
 * the 1 Hz elapsed counter (see faa9c243). Waiting on a pull request shares
 * the running circle: a linked pull request already puts that icon on the row,
 * and the tooltip names the wait. The opt-in
 * `animatedActivityIndicators` preference replaces every running kind with the
 * shared `Spinner` (four steps a second); the unread icon stays.
>>>>>>> bc50ba56a
 */
export const SessionActivityIndicator: React.FC<{
  state: SessionActivityIndicatorState;
  className?: string;
  /** Extra classes for the running kinds only (e.g. the switcher's pulse). */
  runningClassName?: string;
}> = ({ state, className, runningClassName }) => {
  const { t } = useI18n();
  const animated = useSessionDisplayStore((s) => s.animatedActivityIndicators);
  const presentation = PRESENTATION[state];
  const label = t(presentation.labelKey);
  const running = state !== 'unread';

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      aria-label={label}
      title={label}
      data-session-activity-indicator={state}
    >
      {running && animated ? (
        <Icon name="loader-4" className="activity-spinner h-3 w-3 text-status-info" />
      ) : (
        <Icon
          name={presentation.icon}
          className={cn('h-3 w-3', presentation.colorClass, running && runningClassName)}
        />
      )}
    </span>
  );
};
