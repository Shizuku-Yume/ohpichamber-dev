import type { Session } from '@openchamber/agent-contract';

<<<<<<< HEAD
/**
 * Hydrate an identity discovered after a fork command through the authoritative
 * Session insertion path. Forking has no synthetic canonical event variant;
 * callers supply identity and a native Host-projected Session read.
 */
||||||| bc50ba56aa
/**
 * OpenCode 2.x announces a fork with `session.forked` only: no
 * `session.created` follows, and the event carries ids, not the record. Every
 * client that did not start the fork would otherwise miss it until its session
 * list reloads. This reads the fork's record and hands it back as a
 * `session.created`, so it lands through the same path as any new session.
 *
 * The forking client already inserted the record from the fork response, so a
 * session this client knows is left alone. A fork this client is creating
 * itself (`/btw`, which marks the fork only after it exists) is left to that
 * flow. A failed read applies nothing; the next list read picks the fork up.
 *
 * A patch for the fork can land while its record is being read (the `/btw`
 * marker does), and the global router drops patches for sessions it hasn't
 * seen, so the read record would be stale. Such a fork is read once more.
 */
=======
>>>>>>> upstream/main
export type ForkedSessionDeps = {
  isKnown: (sessionId: string) => boolean;
  isCreatingLocally: (parentSessionId: string) => boolean;
  getSession: (sessionId: string) => Promise<Session>;
  isCurrent: () => boolean;
  apply: (session: Session) => void;
};

const patchedDuringRead = new Map<string, boolean>();

export function noteForkedSessionPatched(sessionId: string): void {
  if (patchedDuringRead.has(sessionId)) patchedDuringRead.set(sessionId, true);
}

export async function applyForkedSession(
  event: { sessionId: string; parentSessionId: string },
  deps: ForkedSessionDeps,
): Promise<void> {
  if (!deps.isCurrent() || deps.isKnown(event.sessionId) || deps.isCreatingLocally(event.parentSessionId) || patchedDuringRead.has(event.sessionId)) return;
  let session: Session;
  try {
    patchedDuringRead.set(event.sessionId, false);
    session = await deps.getSession(event.sessionId);
    if (patchedDuringRead.get(event.sessionId)) session = await deps.getSession(event.sessionId);
  } catch {
    return;
  } finally {
    patchedDuringRead.delete(event.sessionId);
  }
  if (!deps.isCurrent() || deps.isKnown(event.sessionId) || session.sessionId !== event.sessionId) return;
  deps.apply(session);
}
