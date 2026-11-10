import type { Session } from '@openchamber/agent-contract';

export type SessionGoalStatus = 'active' | 'paused' | 'budgetLimited' | 'complete';

export const SESSION_GOAL_OBJECTIVE_CHAR_LIMIT = 5000;

export interface SessionGoalPayload {
  objective: string;
  status: SessionGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
}

<<<<<<< HEAD
export function getSessionGoal(session: Session | null | undefined): SessionGoalPayload | null {
  const mode = session?.mode;
  if (mode?.kind !== 'goal') return null;
=======
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isGoalStatus = (value: unknown): value is SessionGoalStatus =>
  typeof value === 'string' && (SESSION_GOAL_STATUSES as string[]).includes(value);

export function getSessionGoal(session: Pick<Session, 'metadata'> | null | undefined): SessionGoalPayload | null {
  const metadata = session?.metadata;
  if (!isRecord(metadata)) return null;
  const namespace = metadata.openchamber;
  if (!isRecord(namespace)) return null;
  const goal = namespace.goal;
  if (!isRecord(goal)) return null;

  const id = typeof goal.id === 'string' ? goal.id : '';
  const objective = typeof goal.objective === 'string' ? goal.objective.trim() : '';
  const objectiveFile = goal.objectiveFile === true;
  if (!id || (!objective && !objectiveFile) || !isGoalStatus(goal.status)) return null;

  const tokenBudget = typeof goal.tokenBudget === 'number' && Number.isFinite(goal.tokenBudget) && goal.tokenBudget > 0
    ? Math.floor(goal.tokenBudget)
    : null;
  const asCount = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

>>>>>>> bc50ba56a
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
