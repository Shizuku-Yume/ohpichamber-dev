import type { Session } from '@openchamber/agent-contract';

export type SessionGoalStatus = 'active' | 'paused' | 'budgetLimited' | 'complete';

export const SESSION_GOAL_OBJECTIVE_CHAR_LIMIT = 5000;

export interface SessionGoalPayload {
  objective: string;
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
