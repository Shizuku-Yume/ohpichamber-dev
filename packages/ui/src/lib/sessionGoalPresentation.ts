import type { SessionGoalStatus } from '@/lib/sessionGoalMetadata';

export const sessionGoalStatusColor: Record<SessionGoalStatus, string> = {
  active: 'var(--status-info)',
  paused: 'var(--surface-muted-foreground)',
  budgetLimited: 'var(--status-warning)',
  complete: 'var(--status-success)',
};

/**
 * The sidebar mark's wording, for the lane card that draws the same glyph.
 * A goal the canonical mode cannot report (blocked) has no entry here.
 */
export const sessionGoalMarkLabelKey = {
  active: 'chat.goal.mark.active',
  paused: 'chat.goal.mark.paused',
  budgetLimited: 'chat.goal.mark.budgetLimited',
  complete: 'chat.goal.mark.complete',
} as const satisfies Record<SessionGoalStatus, string>;
