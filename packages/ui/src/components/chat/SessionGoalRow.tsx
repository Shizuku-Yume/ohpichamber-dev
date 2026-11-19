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
<<<<<<< HEAD
  const { mode, enabled } = useSessionGoal(sessionId ?? '', directory);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  if (!sessionId || !enabled || !mode) return null;
||||||| bc50ba56aa
  const { goal, enabled } = useSessionGoal(sessionId ?? '', directory);
  const objectiveContent = useGoalObjectiveContent(sessionId ?? '', goal);
  const sessionStatus = useSessionStatus(sessionId ?? '', directory);
  const [busy, setBusy] = React.useState(false);
  // The agent stopped but the goal is still active: the server is sitting out
  // the quiet window and running the audit.
  const evaluating = Boolean(sessionId && enabled && goal?.status === 'active' && (!sessionStatus || sessionStatus.type === 'idle'));

  const handleToggleStatus = React.useCallback(async (nextStatus: 'active' | 'paused') => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      await setSessionGoalStatus(sessionId, directory, nextStatus);
    } catch (error) {
      console.warn('[session-goal] status change failed:', error);
      toast.error(t('chat.goal.toast.actionFailed'));
    } finally {
      setBusy(false);
    }
  }, [sessionId, directory, busy, t]);

  if (!sessionId || !enabled || !goal) {
    return null;
  }

  // Accounting only lands on idle ticks — hide the counter until there is a
  // real number (or a budget worth tracking against) instead of showing "0".
  const usage = goal.tokenBudget
    ? t('chat.goal.usage.tokensWithBudget', {
        used: formatGoalTokens(goal.tokensUsed),
        budget: formatGoalTokens(goal.tokenBudget),
      })
    : (goal.tokensUsed > 0 ? t('chat.goal.usage.tokens', { used: formatGoalTokens(goal.tokensUsed) }) : null);

  const pauseResume = goal.status === 'active'
    ? { icon: 'pause' as const, labelKey: 'chat.goal.action.pause' as const, tooltipKey: 'contextTooltips.chat.goalPause' as const, next: 'paused' as const }
    : (goal.status === 'paused' || goal.status === 'blocked' || goal.status === 'budgetLimited'
      ? { icon: 'play' as const, labelKey: 'chat.goal.action.resume' as const, tooltipKey: 'contextTooltips.chat.goalResume' as const, next: 'active' as const }
      : null);

=======
  const { goal, enabled } = useSessionGoal(sessionId ?? '', directory);
  const objectiveContent = useGoalObjectiveContent(sessionId ?? '', goal);
  const sessionStatus = useSessionStatus(sessionId ?? '', directory);
  const [busy, setBusy] = React.useState(false);
  const evaluating = Boolean(sessionId && enabled && goal?.status === 'active' && (!sessionStatus || sessionStatus.type === 'idle'));

  const handleToggleStatus = React.useCallback(async (nextStatus: 'active' | 'paused') => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      await setSessionGoalStatus(sessionId, directory, nextStatus);
    } catch (error) {
      console.warn('[session-goal] status change failed:', error);
      toast.error(t('chat.goal.toast.actionFailed'));
    } finally {
      setBusy(false);
    }
  }, [sessionId, directory, busy, t]);

  if (!sessionId || !enabled || !goal) {
    return null;
  }

  const usage = goal.tokenBudget
    ? t('chat.goal.usage.tokensWithBudget', {
        used: formatGoalTokens(goal.tokensUsed),
        budget: formatGoalTokens(goal.tokenBudget),
      })
    : (goal.tokensUsed > 0 ? t('chat.goal.usage.tokens', { used: formatGoalTokens(goal.tokensUsed) }) : null);

  const pauseResume = goal.status === 'active'
    ? { icon: 'pause' as const, labelKey: 'chat.goal.action.pause' as const, tooltipKey: 'contextTooltips.chat.goalPause' as const, next: 'paused' as const }
    : (goal.status === 'paused' || goal.status === 'blocked' || goal.status === 'budgetLimited'
      ? { icon: 'play' as const, labelKey: 'chat.goal.action.resume' as const, tooltipKey: 'contextTooltips.chat.goalResume' as const, next: 'active' as const }
      : null);

>>>>>>> upstream/main
  return (
<<<<<<< HEAD
    <div role="group" className="flex h-10 min-w-0 items-center gap-2 border-b border-border/60 pl-3 pr-1.5" aria-label={t('chat.goal.row.aria')}>
      <Icon name="target" className="size-3.5 flex-shrink-0" aria-hidden="true" />
      <button type="button" className="min-w-0 flex-1 truncate text-left text-sm text-foreground" onClick={() => setDialogOpen(true)}>{mode.objective}</button>
      <span className="flex-shrink-0 typography-meta text-muted-foreground">{t(mode.status === 'budget-limited' ? 'chat.goal.status.budgetLimited' : `chat.goal.status.${mode.status}` as never)}</span>
      <span className="flex-shrink-0 typography-meta text-muted-foreground tabular-nums">{mode.tokenBudget === null ? t('chat.goal.usage.tokens', { used: mode.tokensUsed }) : t('chat.goal.usage.tokensWithBudget', { used: mode.tokensUsed, budget: mode.tokenBudget })}</span>
      <SessionGoalDialog open={dialogOpen} onOpenChange={setDialogOpen} sessionId={sessionId} directory={directory} />
||||||| bc50ba56aa
    <div
      role="group"
      className="flex oc-composer-row min-w-0 items-center gap-2 border-b border-edge ps-3 pe-1.5"
      aria-label={t('chat.goal.row.aria')}
    >
      <Icon name="target" className="size-3.5 flex-shrink-0" style={{ color: sessionGoalStatusColor[goal.status] }} aria-hidden="true" />
      <span dir="auto" className="min-w-0 flex-1 truncate oc-ui-start-align text-sm text-foreground" title={objectiveContent ?? undefined}>
        {objectiveContent || t('chat.goal.dialog.titleManage')}
      </span>
      {evaluating ? (
        // Show the audit instead of a static "Active" that looks stuck.
        <span className="flex flex-shrink-0 items-center gap-1 typography-meta text-muted-foreground">
          <Spinner className="h-3 w-3" aria-hidden="true" />
          {t('chat.goal.status.evaluating')}
        </span>
      ) : (
        <span className="flex-shrink-0 typography-meta text-muted-foreground">
          {t(sessionGoalStatusLabelKey[goal.status] as never)}
        </span>
      )}
      {usage ? (
        <span className="flex-shrink-0 typography-meta tabular-nums text-muted-foreground">
          {usage}
        </span>
      ) : null}
      {pauseResume ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleToggleStatus(pauseResume.next)}
                onMouseDown={(event) => event.preventDefault()}
                disabled={busy}
                className="shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                <Icon name={pauseResume.icon} className="size-3" aria-hidden="true" />
                {t(pauseResume.labelKey)}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>{t(pauseResume.tooltipKey)}</TooltipContent>
        </Tooltip>
      ) : null}
=======
    <div
      role="group"
      className="flex oc-composer-row min-w-0 items-center gap-2 border-b border-edge ps-3 pe-1.5"
      aria-label={t('chat.goal.row.aria')}
    >
      <Icon name="target" className="size-3.5 flex-shrink-0" style={{ color: sessionGoalStatusColor[goal.status] }} aria-hidden="true" />
      <span dir="auto" className="min-w-0 flex-1 truncate oc-ui-start-align text-sm text-foreground" title={objectiveContent ?? undefined}>
        {objectiveContent || t('chat.goal.dialog.titleManage')}
      </span>
      {evaluating ? (
        <span className="flex flex-shrink-0 items-center gap-1 typography-meta text-muted-foreground">
          <Spinner className="h-3 w-3" aria-hidden="true" />
          {t('chat.goal.status.evaluating')}
        </span>
      ) : (
        <span className="flex-shrink-0 typography-meta text-muted-foreground">
          {t(sessionGoalStatusLabelKey[goal.status] as never)}
        </span>
      )}
      {usage ? (
        <span className="flex-shrink-0 typography-meta tabular-nums text-muted-foreground">
          {usage}
        </span>
      ) : null}
      {pauseResume ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleToggleStatus(pauseResume.next)}
                onMouseDown={(event) => event.preventDefault()}
                disabled={busy}
                className="shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                <Icon name={pauseResume.icon} className="size-3" aria-hidden="true" />
                {t(pauseResume.labelKey)}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>{t(pauseResume.tooltipKey)}</TooltipContent>
        </Tooltip>
      ) : null}
>>>>>>> upstream/main
    </div>
  );
});

SessionGoalRow.displayName = 'SessionGoalRow';
