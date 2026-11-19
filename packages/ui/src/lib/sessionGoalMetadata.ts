import type { Session } from '@openchamber/agent-contract';

<<<<<<< HEAD
export type SessionGoalStatus = 'active' | 'paused' | 'budgetLimited' | 'complete';
||||||| bc50ba56aa
// Session goal driven by the server's session-goal runtime, stored under
// session.metadata.openchamber.goal. The UI writes goals (create/edit/
// pause/resume/clear) by patching this metadata; the server loop accounts
// usage, checks progress with Jev or the small model, and auto-continues the
// session until the goal settles.
export type SessionGoalStatus = 'active' | 'paused' | 'blocked' | 'budgetLimited' | 'complete';

const SESSION_GOAL_STATUSES: SessionGoalStatus[] = ['active', 'paused', 'blocked', 'budgetLimited', 'complete'];
=======
export type SessionGoalStatus = 'active' | 'paused' | 'blocked' | 'budgetLimited' | 'complete';

const SESSION_GOAL_STATUSES: SessionGoalStatus[] = ['active', 'paused', 'blocked', 'budgetLimited', 'complete'];
>>>>>>> upstream/main

export const SESSION_GOAL_OBJECTIVE_CHAR_LIMIT = 5000;

export interface SessionGoalPayload {
  objective: string;
<<<<<<< HEAD
||||||| bc50ba56aa
  /** True when the objective text lives in a server-side file keyed by session id. */
  objectiveFile: boolean;
=======
  objectiveFile: boolean;
>>>>>>> upstream/main
  status: SessionGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
}

export function getSessionGoal(session: Session | null | undefined): SessionGoalPayload | null {
  const mode = session?.mode;
  if (mode?.kind !== 'goal') return null;
  return {
    objective: mode.objective.trim().slice(0, SESSION_GOAL_OBJECTIVE_CHAR_LIMIT),
    status: mode.status === 'budget-limited' ? 'budgetLimited' : mode.status,
    tokenBudget: mode.tokenBudget,
    tokensUsed: mode.tokensUsed,
  };
}

export function formatGoalTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${Math.round(count / 1000)}K`;
  if (count >= 1_000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}
