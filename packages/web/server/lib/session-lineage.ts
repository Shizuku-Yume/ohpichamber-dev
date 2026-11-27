import { z } from 'zod';
import type { CanonicalEvent } from '@openchamber/agent-contract';
import { safeParseCanonicalEvent } from './event-stream/validated-event.js';
import type { JsonValue } from './shared/json-values.js';

const DEFAULT_LIMIT = 5000;

export const OPERATOR_CHILD_KIND = 'operator-child';

const operatorChildSchema = z.object({
  metadata: z.object({ openchamber: z.object({ kind: z.literal(OPERATOR_CHILD_KIND), parentID: z.string().min(1) }) }),
});

export interface OperatorChildRecord {
  metadata?: JsonValue | null | undefined;
}

export const isOperatorChildSession = (record: OperatorChildRecord | null | undefined): boolean =>
  operatorChildSchema.safeParse(record).success;

export interface SessionLineageOptions {
  limit?: number;
}

export type SessionLineageObservation = CanonicalEvent | JsonValue | undefined;

export interface SessionLineage {
  observe: (payload: SessionLineageObservation) => void;
  remember: (sessionId: string, rootSessionId: string) => void;
  isChild: (sessionId: string) => boolean | undefined;
}

export function createSessionLineage({ limit = DEFAULT_LIMIT }: SessionLineageOptions = {}): SessionLineage {
  const isChildById = new Map<string, boolean>();

  const remember = (sessionId: string, rootSessionId: string): void => {
    if (!sessionId || !rootSessionId) return;
    isChildById.delete(sessionId);
    isChildById.set(sessionId, rootSessionId !== sessionId);
    while (isChildById.size > limit) {
      const oldest = isChildById.keys().next().value;
      if (oldest === undefined) break;
      isChildById.delete(oldest);
    }
  };

  const observe = (payload: SessionLineageObservation): void => {
    const parsed = safeParseCanonicalEvent(payload);
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

  const isChild = (sessionId: string): boolean | undefined => isChildById.get(sessionId);

  return { observe, remember, isChild };
}
