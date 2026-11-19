import type { SessionGoalStatus } from '@/lib/sessionGoalMetadata';

export const sessionGoalStatusColor: Record<SessionGoalStatus, string> = {
  active: 'var(--status-info)',
  paused: 'var(--surface-muted-foreground)',
  budgetLimited: 'var(--status-warning)',
  complete: 'var(--status-success)',
};

<<<<<<< HEAD
/**
 * The sidebar mark's wording, for the lane card that draws the same glyph.
 * A goal the canonical mode cannot report (blocked) has no entry here.
 */
||||||| bc50ba56aa
export const sessionGoalStatusLabelKey: Record<SessionGoalStatus, string> = {
  active: 'chat.goal.status.active',
  paused: 'chat.goal.status.paused',
  blocked: 'chat.goal.status.blocked',
  budgetLimited: 'chat.goal.status.budgetLimited',
  complete: 'chat.goal.status.complete',
};

/** For a mark that stands alone: the status word needs its subject there. */
=======
export const sessionGoalStatusLabelKey: Record<SessionGoalStatus, string> = {
  active: 'chat.goal.status.active',
  paused: 'chat.goal.status.paused',
  blocked: 'chat.goal.status.blocked',
  budgetLimited: 'chat.goal.status.budgetLimited',
  complete: 'chat.goal.status.complete',
};

>>>>>>> upstream/main
export const sessionGoalMarkLabelKey = {
  active: 'chat.goal.mark.active',
  paused: 'chat.goal.mark.paused',
  budgetLimited: 'chat.goal.mark.budgetLimited',
  complete: 'chat.goal.mark.complete',
} as const satisfies Record<SessionGoalStatus, string>;
