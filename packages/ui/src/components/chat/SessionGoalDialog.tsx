import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/ui/number-input';
import { SESSION_GOAL_OBJECTIVE_CHAR_LIMIT } from '@/lib/sessionGoalMetadata';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionGoal } from '@/hooks/useSessionGoal';
import { useI18n } from '@/lib/i18n';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { canonicalClient } from '@/api/canonicalClient';
import { problemMessage } from '@/lib/problemMessage';

interface SessionGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  directory?: string;
}

export function SessionGoalDialog({ open, onOpenChange, sessionId, directory }: SessionGoalDialogProps) {
  const isMobile = useUIStore((state) => state.isMobile);

  if (isMobile) {
    return open ? <SessionGoalDialogBody mobile onOpenChange={onOpenChange} sessionId={sessionId} directory={directory} /> : null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <SessionGoalDialogBody mobile={false} onOpenChange={onOpenChange} sessionId={sessionId} directory={directory} />
      </DialogContent>
    </Dialog>
  );
}

interface SessionGoalDialogBodyProps extends Omit<SessionGoalDialogProps, 'open'> {
  mobile: boolean;
}

function SessionGoalDialogBody({ mobile, onOpenChange, sessionId, directory }: SessionGoalDialogBodyProps) {
  const { t } = useI18n();
  const { mode: goal, running } = useSessionGoal(sessionId, directory);
  const [objective, setObjective] = React.useState(() => goal?.objective ?? '');
  const [budgetEnabled, setBudgetEnabled] = React.useState(() => Boolean(goal?.tokenBudget));
  const [tokenBudget, setTokenBudget] = React.useState<number>(() => goal?.tokenBudget ?? 200_000);
  const [busy, setBusy] = React.useState(false);
  const run = React.useCallback(async (action: () => Promise<unknown>, closeAfter: boolean) => {
    setBusy(true);
    try {
      await action();
      if (closeAfter) onOpenChange(false);
    } catch (error) {
      toast.error(problemMessage(error, t('chat.goal.toast.actionFailed')));
    } finally {
      setBusy(false);
    }
  }, [onOpenChange, t]);
  const trimmedObjective = objective.trim();
  const isCompleted = goal?.status === 'complete';
  const budgetValue = budgetEnabled ? tokenBudget : null;
  const canSave = !running && trimmedObjective.length > 0 && (!goal || goal.objective !== trimmedObjective || goal.tokenBudget !== budgetValue);
  const handleSave = () => run(async () => {
    if (goal) await canonicalClient.goal(sessionId, { op: 'drop' });
    await canonicalClient.goal(sessionId, { op: 'create', objective: trimmedObjective, tokenBudget: budgetValue });
  }, true);
  const title = goal ? t('chat.goal.dialog.titleManage') : t('chat.goal.dialog.titleCreate');

  const body = (
    <div className="space-y-3">
      {goal ? <p className="typography-meta">{t(goal.status === 'budget-limited' ? 'chat.goal.status.budgetLimited' : `chat.goal.status.${goal.status}` as never)} · {goal.tokenBudget === null ? t('chat.goal.usage.tokens', { used: goal.tokensUsed }) : t('chat.goal.usage.tokensWithBudget', { used: goal.tokensUsed, budget: goal.tokenBudget })}</p> : null}
      {isCompleted ? <ScrollableOverlay as="p" outerClassName="max-h-48" className="whitespace-pre-wrap break-words typography-meta text-muted-foreground" disableHorizontal>{goal.objective}</ScrollableOverlay> : (
        <>
          <div className="space-y-1">
            <span className="typography-ui-label">{t('chat.goal.dialog.objectiveLabel')}</span>
            <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder={t('chat.goal.dialog.objectivePlaceholder')} maxLength={SESSION_GOAL_OBJECTIVE_CHAR_LIMIT} rows={4} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={budgetEnabled} onChange={setBudgetEnabled} ariaLabel={t('chat.goal.dialog.budgetLabel')} />
            <span>{t('chat.goal.dialog.budgetLabel')}</span>
            {budgetEnabled ? <NumberInput value={tokenBudget} onValueChange={(value) => setTokenBudget(typeof value === 'number' && value > 0 ? Math.floor(value) : 1000)} min={1000} max={100_000_000} step={50_000} /> : null}
          </div>
        </>
      )}
      {goal && (goal.status === 'active' || goal.status === 'paused') ? <Button size="sm" variant="ghost" disabled={busy || (goal.status === 'paused' && running)} onClick={() => run(() => canonicalClient.goal(sessionId, { op: goal.status === 'active' ? 'pause' : 'resume' }), false)}>{t(goal.status === 'active' ? 'chat.goal.action.pause' : 'chat.goal.action.resume')}</Button> : null}
      <div className="flex justify-end gap-2">
        {goal ? <Button variant="destructive" size="sm" disabled={busy} onClick={() => run(() => canonicalClient.goal(sessionId, { op: 'drop' }), true)}>{t('chat.goal.action.clear')}</Button> : null}
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>{t('chat.goal.action.cancel')}</Button>
        {!isCompleted ? <Button size="sm" disabled={busy || !canSave} onClick={handleSave}>{t(goal ? 'chat.goal.action.save' : 'chat.goal.action.start')}</Button> : null}
      </div>
    </div>
  );


  if (mobile) {
    return (
      <MobileOverlayPanel open title={title} onClose={() => onOpenChange(false)}>
        {body}
      </MobileOverlayPanel>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      {body}
    </>
  );
}
