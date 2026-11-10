import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { useSessionGoal } from '@/hooks/useSessionGoal';
import { useI18n } from '@/lib/i18n';
import { SessionGoalDialog } from '@/components/chat/SessionGoalDialog';

interface SessionGoalRowProps {
  sessionId: string | null;
  directory?: string;
}

export const SessionGoalRow: React.FC<SessionGoalRowProps> = React.memo(({ sessionId, directory }) => {
  const { t } = useI18n();
  const { mode, enabled } = useSessionGoal(sessionId ?? '', directory);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  if (!sessionId || !enabled || !mode) return null;
  return (
    <div role="group" className="flex h-10 min-w-0 items-center gap-2 border-b border-border/60 pl-3 pr-1.5" aria-label={t('chat.goal.row.aria')}>
      <Icon name="target" className="size-3.5 flex-shrink-0" aria-hidden="true" />
      <button type="button" className="min-w-0 flex-1 truncate text-left text-sm text-foreground" onClick={() => setDialogOpen(true)}>{mode.objective}</button>
      <span className="flex-shrink-0 typography-meta text-muted-foreground">{t(mode.status === 'budget-limited' ? 'chat.goal.status.budgetLimited' : `chat.goal.status.${mode.status}` as never)}</span>
      <span className="flex-shrink-0 typography-meta text-muted-foreground tabular-nums">{mode.tokenBudget === null ? t('chat.goal.usage.tokens', { used: mode.tokensUsed }) : t('chat.goal.usage.tokensWithBudget', { used: mode.tokensUsed, budget: mode.tokenBudget })}</span>
      <SessionGoalDialog open={dialogOpen} onOpenChange={setDialogOpen} sessionId={sessionId} directory={directory} />
    </div>
  );
});

SessionGoalRow.displayName = 'SessionGoalRow';
