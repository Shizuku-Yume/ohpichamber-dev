import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { useSessionGoal } from '@/hooks/useSessionGoal';
import { SessionGoalDialog } from '@/components/chat/SessionGoalDialog';
import { WorkStatusRow } from './WorkStatusPrimitives';

type Props = { sessionId: string | null; directory: string | null };

export const WorkStatusGoalRow: React.FC<Props> = ({ sessionId, directory }) => {
  const { t } = useI18n();
  const { mode, enabled } = useSessionGoal(sessionId ?? '', directory ?? undefined);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  if (!enabled || !mode || !sessionId) return null;
  return (
    <>
<<<<<<< HEAD
      <WorkStatusRow leading={<Icon name="target-fill" className="size-4 shrink-0" />} label={mode.objective} onClick={() => setDialogOpen(true)} ariaLabel={t('chat.workStatus.goal.open')} value={<span>{t(mode.status === 'budget-limited' ? 'chat.goal.status.budgetLimited' : `chat.goal.status.${mode.status}` as never)}</span>} />
      <SessionGoalDialog open={dialogOpen} onOpenChange={setDialogOpen} sessionId={sessionId} directory={directory ?? undefined} />
=======
      <WorkStatusRow
        leading={(
          <Icon
            name={goal?.status ? 'target-fill' : 'target'}
            className="size-3.5 shrink-0"
            style={{ color: goal ? sessionGoalStatusColor[goal.status] : undefined }}
          />
        )}
        label={objective}
        labelDir="auto"
        onClick={() => setDialogOpen(true)}
        ariaLabel={t('chat.workStatus.goal.open')}
        value={canPause || canResume ? (
          <WorkStatusRowAction
            tone={canPause ? 'info' : 'warning'}
            disabled={busy}
            ariaLabel={canPause ? t('chat.workStatus.goal.pause') : t('chat.workStatus.goal.resume')}
            onClick={() => { void handleToggleStatus(canPause ? 'paused' : 'active'); }}
          >
            {canPause ? t('chat.workStatus.goal.pause') : t('chat.workStatus.goal.resume')}
          </WorkStatusRowAction>
        ) : undefined}
      />
      <SessionGoalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sessionId={sessionId}
        directory={directory ?? undefined}
      />
>>>>>>> bc50ba56a
    </>
  );
};
