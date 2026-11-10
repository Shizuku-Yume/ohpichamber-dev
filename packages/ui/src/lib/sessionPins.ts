import { z } from 'zod';
import type { Session, SessionMetadata as Metadata } from '@openchamber/agent-contract';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { normalizePath } from '@/lib/pathNormalization';

/**
 * A pin lives in the session's metadata, `session.metadata.openchamber.pinned`,
 * so every client of the server sees it, the way In work state travels. The
 * sidebar and the lists match pins by a key of runtime, directory and session:
 * the same session id can appear under two directories, and a runtime switch
 * must not carry one server's pins onto another.
 */
export const getPinnedSessionKey = (runtimeKey: string, directory: string, sessionId: string): string | null => {
 const normalizedDirectory = normalizePath(directory);
 if (!runtimeKey || !normalizedDirectory || !sessionId) return null;
 return JSON.stringify([runtimeKey, normalizedDirectory, sessionId]);
};

export const isSessionPinned = (ids: ReadonlySet<string>, directory: string | null | undefined, sessionId: string): boolean => {
 if (!directory) return false;
 const key = getPinnedSessionKey(getRuntimeKey(), directory, sessionId);
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
