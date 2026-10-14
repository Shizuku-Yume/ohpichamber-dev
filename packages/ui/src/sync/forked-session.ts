import type { Session } from '@openchamber/agent-contract';

/**
 * Hydrate an identity discovered after a fork command through the authoritative
 * Session insertion path. Forking has no synthetic canonical event variant;
 * callers supply identity and a native Host-projected Session read.
 */
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
