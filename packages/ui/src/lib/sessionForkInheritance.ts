import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { getSessionGoal } from '@/lib/sessionGoalMetadata';

/** Remove source-owned links while retaining copied goal and operational data. */
export function withoutSourceOwnedLinks(metadata: SessionMetadata): SessionMetadata {
  const namespace = metadata.openchamber;
  if (!namespace) return metadata;
  const { btwSessionID: _btw, reviewSessionID: _review, ...rest } = namespace;
  const cleaned = rest.kind === 'btw'
    ? (() => {
      const { kind: _kind, originalSessionID: _original, btwBoundaryMessageID: _boundary, ...plain } = rest;
      return plain;
    })()
    : rest;
  const goal = cleaned.goal;
  const nextGoal = goal?.status === 'active' ? { ...goal, status: 'paused' as const, statusReason: 'paused in fork' } : goal;
  const next = nextGoal === goal ? cleaned : { ...cleaned, goal: nextGoal };
  if (JSON.stringify(next) === JSON.stringify(namespace)) return metadata;
  return Object.keys(next).length > 0 ? { ...metadata, openchamber: next } : (() => { const { openchamber: _openchamber, ...restMetadata } = metadata; return restMetadata; })();
}

function withInlineGoalObjective(metadata: SessionMetadata, goalId: string, objective: string): SessionMetadata {
  const namespace = metadata.openchamber;
  const goal = namespace?.goal;
  if (!namespace || !goal || goal.id !== goalId) return metadata;
  return { ...metadata, openchamber: { ...namespace, goal: { ...goal, objective, objectiveFile: false } } };
}

export interface ForkInheritanceDeps {
  readGoalId: (sessionId: string) => Promise<string | null>;
  readObjective: (sessionId: string) => Promise<string | null>;
  writeObjective: (sessionId: string, content: string) => Promise<boolean>;
  patchMetadata: (sessionId: string, updater: (metadata: SessionMetadata) => SessionMetadata) => Promise<void>;
}

/** Repair a freshly created fork's metadata without making fork failure fatal. */
export async function applyForkInheritance(sourceSessionId: string, fork: Session, deps: ForkInheritanceDeps): Promise<void> {
  const goal = getSessionGoal(fork);
  let inlineObjective: string | null = null;
  if (goal?.objectiveFile) {
    try {
      const content = await deps.readObjective(sourceSessionId);
      if (content === null) {
        console.warn('[fork] source goal objective unavailable; fork keeps the inline fallback');
      } else if ((await deps.readGoalId(fork.sessionId)) !== goal.id) {
        console.warn('[fork] fork goal changed before the objective copy; skipping it');
      } else if (!(await deps.writeObjective(fork.sessionId, content))) {
        inlineObjective = content;
      }
    } catch (error) {
      console.warn('[fork] failed to copy the goal objective to the fork', error);
    }
  }

  const cleaned = withoutSourceOwnedLinks(fork.metadata ?? {});
  if (cleaned === (fork.metadata ?? {}) && inlineObjective === null) return;
  try {
    await deps.patchMetadata(fork.sessionId, (metadata) =>
      goal && inlineObjective !== null ? withInlineGoalObjective(cleaned, goal.id, inlineObjective) : cleaned);
  } catch (error) {
    console.warn('[fork] failed to update the fork metadata', error);
  }
}
