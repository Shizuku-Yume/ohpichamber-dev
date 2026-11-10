import { z } from 'zod';
import type { Session } from '@openchamber/agent-contract';
import { isVSCodeRuntime } from '@/lib/desktop';
import { normalizePath } from '@/lib/pathNormalization';
import { getOriginalSessionID, isReviewSession } from '@/lib/sessionReviewMetadata';

/**
 * Which session a sidebar row nests under.
 *
 * A subagent nests under the run that spawned it (`parentSessionId`).
 * A root session that grew out of another one in the same folder nests under
 * that one too, so the work they share reads as one entry.
 */

const openchamberNamespaceSchema = z.object({ openchamber: z.record(z.string(), z.unknown()) });

/** The session this root session grew out of, before checking where either lives. */
const getSessionOriginId = (session: Session): string | null => {
 if (isReviewSession(session)) return getOriginalSessionID(session);
 return session.parentSessionId ?? null;
};

// A present marker is enough: a fork inherits its source's marker and is still
// kept out of the run (see `lib/multirun/identity.ts`).
const isMultiRunLane = (session: Session): boolean => Object.hasOwn(
 openchamberNamespaceSchema.safeParse(session.metadata).data?.openchamber ?? {},
 'multirun',
);

const sameFolder = (left: Session, right: Session): boolean => {
 const leftDirectory = normalizePath(left.displayPath ?? null);
 return leftDirectory !== null && leftDirectory === normalizePath(right.displayPath ?? null);
};

/**
 * The session `session` nests under, or null for a root. `lookup` answers for
 * the sessions the caller lists; an origin it does not know (not loaded, in
 * another project) leaves the session a root.
 */
export const resolveSessionNestingParentId = (
 session: Session,
 lookup: (sessionId: string) => Session | undefined,
): string | null => {
 if (isVSCodeRuntime() || session.archivedAt || isMultiRunLane(session)) return null;
 if (session.parentSessionId) return session.parentSessionId;
 const originId = getSessionOriginId(session);
 if (!originId || originId === session.sessionId) return null;
 const origin = lookup(originId);
 if (!origin || origin.archivedAt || !sameFolder(session, origin)) return null;
 const seen = new Set<string>([session.sessionId]);
 let current: Session | undefined = origin;
 while (current && !seen.has(current.sessionId)) {
  seen.add(current.sessionId);
  const next = current.parentSessionId ?? getSessionOriginId(current);
  if (!next) return originId;
  if (seen.has(next)) return next === session.sessionId ? null : originId;
  current = lookup(next);
 }
 return originId;
};
