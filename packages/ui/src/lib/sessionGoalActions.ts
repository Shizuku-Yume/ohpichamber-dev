import { abortCurrentOperation, patchSessionMetadata } from '@/sync/session-actions';
import type { SessionMetadata } from '@openchamber/agent-contract';
import { distillGoalObjective } from '@/lib/smallModel';
import { formatMessage, useI18nStore } from '@/lib/i18n';
import { toast } from '@/components/ui';
import { deleteGoalObjectiveFile, writeGoalObjectiveFile } from '@/lib/goalObjectiveFiles';
import { SESSION_GOAL_OBJECTIVE_CHAR_LIMIT, type SessionGoalPayload, type SessionGoalStatus } from '@/lib/sessionGoalMetadata';

const createGoalId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const writeGoal = (
  sessionId: string,
  directory: string | undefined,
  update: (currentGoal: NonNullable<NonNullable<SessionMetadata['openchamber']>['goal']> | null) => NonNullable<NonNullable<SessionMetadata['openchamber']>['goal']> | null,
) => patchSessionMetadata(sessionId, directory, (metadata) => {
  const namespace = metadata.openchamber ?? {};
  const nextGoal = update(namespace.goal ?? null);
  const nextNamespace = { ...namespace };
  if (nextGoal) nextNamespace.goal = nextGoal;
  else {
    const { goal: _goal, ...rest } = nextNamespace;
    return Object.keys(rest).length > 0 ? { ...metadata, openchamber: rest } : (() => { const { openchamber: _openchamber, ...without } = metadata; return without; })();
  }
  return { ...metadata, openchamber: nextNamespace };
});

const TRIM_MARKER = '\n\n[… objective trimmed for the auditor — the full text was delivered in the chat message …]\n\n';

const fitObjective = async (raw: string, directory: string | undefined, sessionId: string): Promise<string> => {
  if (raw.length <= SESSION_GOAL_OBJECTIVE_CHAR_LIMIT) return raw;
  const distilled = await distillGoalObjective(raw, { directory, sessionId });
  if (distilled) return distilled.slice(0, SESSION_GOAL_OBJECTIVE_CHAR_LIMIT);
  const half = Math.max(0, Math.floor((SESSION_GOAL_OBJECTIVE_CHAR_LIMIT - TRIM_MARKER.length) / 2));
  toast.error(formatMessage(useI18nStore.getState().dictionary, 'chat.goal.toast.distillFallback'));
  return `${raw.slice(0, half)}${TRIM_MARKER}${raw.slice(-half)}`;
};

export interface SetSessionGoalInput { objective: string; tokenBudget: number | null }

export async function setSessionGoal(sessionId: string, directory: string | undefined, input: SetSessionGoalInput, existing: SessionGoalPayload | null): Promise<void> {
  const rawObjective = input.objective.trim();
  const objective = await fitObjective(rawObjective, directory, sessionId);
  const tokenBudget = input.tokenBudget !== null && Number.isFinite(input.tokenBudget) && input.tokenBudget > 0 ? Math.floor(input.tokenBudget) : null;
  const objectiveFile = await writeGoalObjectiveFile(sessionId, objective);
  const now = Date.now();
  await writeGoal(sessionId, directory, (currentGoal) => {
    if (existing && currentGoal && currentGoal.id === existing.id && existing.status !== 'complete') {
      return { ...currentGoal, objective: objectiveFile ? '' : objective, objectiveFile, tokenBudget, status: 'active', statusReason: 'resumed', blockedStreak: 0, updatedAt: now };
    }
    return { id: createGoalId(), objective: objectiveFile ? '' : objective, objectiveFile, status: 'active', tokenBudget, tokensUsed: 0, turnsUsed: 0, blockedStreak: 0, note: '', statusReason: '', lastAccountedMessageID: '', createdAt: now, updatedAt: now };
  });
}

export async function setSessionGoalStatus(sessionId: string, directory: string | undefined, status: Extract<SessionGoalStatus, 'active' | 'paused' | 'complete'>): Promise<void> {
  if (status === 'paused') void abortCurrentOperation(sessionId);
  await writeGoal(sessionId, directory, (currentGoal) => {
    if (!currentGoal) return null;
    const nextGoal = { ...currentGoal, status, statusReason: status === 'active' ? 'resumed' : status === 'complete' ? 'marked by user' : '', blockedStreak: 0, updatedAt: Date.now() };
    if (status === 'active') nextGoal.turnsUsed = 0;
    return nextGoal;
  });
}

export async function clearSessionGoal(sessionId: string, directory: string | undefined): Promise<void> {
  let wasActive = false;
  await writeGoal(sessionId, directory, (currentGoal) => {
    wasActive = currentGoal?.status === 'active';
    return null;
  });
  deleteGoalObjectiveFile(sessionId);
  if (wasActive) void abortCurrentOperation(sessionId);
}
