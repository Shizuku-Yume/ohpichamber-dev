import { z } from 'zod';
import type { Session } from '@openchamber/agent-contract';
import { isVSCodeRuntime } from '@/lib/desktop';
import { parseMetadata } from '@/lib/metadataParse';
import { normalizePath } from '@/lib/pathNormalization';
import { getOriginalSessionID, isReviewSession } from '@/lib/sessionReviewMetadata';


const openchamberNamespaceSchema = z.object({ openchamber: z.record(z.string(), z.unknown()) });

const getSessionOriginId = (session: Session): string | null => {
 if (isReviewSession(session)) return getOriginalSessionID(session);
 return session.parentSessionId ?? null;
};

const isMultiRunLane = (session: Session): boolean => Object.hasOwn(
  parseMetadata(openchamberNamespaceSchema, session.metadata).data?.openchamber ?? {},
  'multirun',
);

const sameFolder = (left: Session, right: Session): boolean => {
 const leftDirectory = normalizePath(left.displayPath ?? null);
 return leftDirectory !== null && leftDirectory === normalizePath(right.displayPath ?? null);
};

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
