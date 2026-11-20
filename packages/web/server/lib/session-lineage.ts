/**
 * Which canonical runtime sessions are children of another root. A child is
 * identified by the Host-owned relation `sessionId !== rootSessionId`; no
 * OpenCode parent field or inferred directory relationship is used.
 */
import { z } from 'zod';
import { CanonicalEventSchema } from '@openchamber/agent-contract';

const DEFAULT_LIMIT = 5000;

export const OPERATOR_CHILD_KIND = 'operator-child';

const operatorChildSchema = z.object({
  metadata: z.object({ openchamber: z.object({ kind: z.literal(OPERATOR_CHILD_KIND), parentID: z.string().min(1) }) }),
});

/** A session an operator agent started for itself, which no user answers in. */
export const isOperatorChildSession = (record: unknown) => operatorChildSchema.safeParse(record).success;

export function createSessionLineage({ limit = DEFAULT_LIMIT } = {}) {
  // sessionId -> true for a child, false for an independent root.
  const isChildById = new Map();

  const remember = (sessionId, rootSessionId) => {
    if (typeof sessionId !== 'string' || !sessionId || typeof rootSessionId !== 'string' || !rootSessionId) return;
    isChildById.delete(sessionId);
    isChildById.set(sessionId, rootSessionId !== sessionId);
    while (isChildById.size > limit) isChildById.delete(isChildById.keys().next().value);
  };

  /** Learn session lineage only from validated canonical Host events. */
  const observe = (payload) => {
    const parsed = CanonicalEventSchema.safeParse(payload);
    if (!parsed.success) return;
    const event = parsed.data;
    if (event.type === 'session.updated' && event.session) {
      remember(event.session.sessionId, event.session.rootSessionId);
      return;
    }
    if (event.type === 'session.deleted') {
      for (const sessionId of event.deletedSessionIds) isChildById.delete(sessionId);
    }
  };

  /** True for a known child, false for a known root, undefined when unknown. */
  const isChild = (sessionId) => isChildById.get(sessionId);

  return { observe, remember, isChild };
}
