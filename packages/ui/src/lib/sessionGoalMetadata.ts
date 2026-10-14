import type { Session } from '@openchamber/agent-contract';

export type SessionGoalStatus = 'active' | 'paused' | 'blocked' | 'budgetLimited' | 'complete';

export const SESSION_GOAL_OBJECTIVE_CHAR_LIMIT = 5000;

export interface SessionGoalPayload {
  id: string;
  objective: string;
  objectiveFile: boolean;
  status: SessionGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  turnsUsed: number;
  statusReason: string;
  evaluationProviderID: string;
  evaluationModelID: string;
  lastAccountedMessageID: string;
  createdAt: number;
  updatedAt: number;
}

export function getSessionGoal(session: Session | null | undefined): SessionGoalPayload | null {
  const goal = session?.metadata?.openchamber?.goal;
  if (!goal?.id || (!goal.objective && !goal.objectiveFile) || !goal.status) return null;
  return {
    id: goal.id,
    objective: (goal.objective ?? '').trim().slice(0, SESSION_GOAL_OBJECTIVE_CHAR_LIMIT),
    objectiveFile: goal.objectiveFile === true,
    status: goal.status,
    tokenBudget: goal.tokenBudget ?? null,
    tokensUsed: goal.tokensUsed ?? 0,
    turnsUsed: goal.turnsUsed ?? 0,
    statusReason: goal.statusReason ?? '',
    evaluationProviderID: goal.evaluationProviderID ?? '',
    evaluationModelID: goal.evaluationModelID ?? '',
    lastAccountedMessageID: goal.lastAccountedMessageID ?? '',
    createdAt: goal.createdAt ?? 0,
    updatedAt: goal.updatedAt ?? 0,
  };
}

export function formatGoalTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${Math.round(count / 1000)}K`;
  if (count >= 1_000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}
