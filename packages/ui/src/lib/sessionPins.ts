import { z } from 'zod';
import type { Session, SessionMetadata as Metadata } from '@openchamber/agent-contract';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { normalizePath } from '@/lib/pathNormalization';

export const getPinnedSessionKey = (runtimeKey: string, directory: string, sessionId: string): string | null => {
 const normalizedDirectory = normalizePath(directory);
 if (!runtimeKey || !normalizedDirectory || !sessionId) return null;
 return JSON.stringify([runtimeKey, normalizedDirectory, sessionId]);
};

const pinnedKeyCache = new Map<string, Map<string, Map<string, string | null>>>();

const cachedPinnedSessionKey = (runtimeKey: string, directory: string, sessionId: string): string | null => {
  let byDirectory = pinnedKeyCache.get(runtimeKey);
  if (!byDirectory) {
    byDirectory = new Map();
    pinnedKeyCache.set(runtimeKey, byDirectory);
  }
  let bySession = byDirectory.get(directory);
  if (!bySession) {
    bySession = new Map();
    byDirectory.set(directory, bySession);
  }
  let key = bySession.get(sessionId);
  if (key === undefined) {
    key = getPinnedSessionKey(runtimeKey, directory, sessionId);
    bySession.set(sessionId, key);
  }
  return key;
};

export const isSessionPinned = (ids: ReadonlySet<string>, directory: string | null | undefined, sessionId: string): boolean => {
  if (!directory || ids.size === 0) return false;
  const key = cachedPinnedSessionKey(getRuntimeKey(), directory, sessionId);
  return key ? ids.has(key) : false;
};

const directPinSchema = z.object({ isPinned: z.boolean().optional() });

export const isSessionPinnedInMetadata = (session: Session | null | undefined): boolean => (
 directPinSchema.safeParse(session).data?.isPinned === true
 || Boolean(session?.metadata?.isPinned)
 || Boolean(session?.metadata?.openchamber?.pinned)
);

/** The metadata after the user pinned (`at` = when) or unpinned the session. */
export function withSessionPinned(metadata: Metadata, pinned: boolean, now: number): Metadata {
 const isPinned = Boolean(metadata.isPinned || metadata.openchamber?.pinned);
 if (isPinned === pinned) return metadata;
 const currentOc = metadata.openchamber ?? {};
 if (pinned) {
  return {
   ...metadata,
   isPinned: true,
   openchamber: {
    ...currentOc,
    pinned: { at: now },
   },
  };
 }
 const nextOc = { ...currentOc };
 delete nextOc.pinned;
 const next: Metadata = {
  ...metadata,
  openchamber: nextOc,
 };
 delete next.isPinned;
 return next;
}
