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
      <WorkStatusRow leading={<Icon name="target-fill" className="size-4 shrink-0" />} label={mode.objective} onClick={() => setDialogOpen(true)} ariaLabel={t('chat.workStatus.goal.open')} value={<span>{t(mode.status === 'budget-limited' ? 'chat.goal.status.budgetLimited' : `chat.goal.status.${mode.status}` as never)}</span>} />
      <SessionGoalDialog open={dialogOpen} onOpenChange={setDialogOpen} sessionId={sessionId} directory={directory ?? undefined} />
    </>
  );
};
