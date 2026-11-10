import type { Session } from '@openchamber/agent-contract';
import { ensureGlobalSessionsLoaded, resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { setSessionOpener } from '@/sync/session-navigation';
import { requestMessageFocus } from './messageFocus';

export type SessionOpenOptions = {
 /** The owning directory when the caller already knows it (a desktop event or a notification carries one). */
 directory?: string | null;
 /** The message a link names. */
 messageId?: string | null;
 /** Native jump-list entries may outlive their session. Unknown IDs do not select anything. */
 requireKnownSession?: boolean;
};

const resolveSessionDir = (session: Session | undefined): string | null => {
 if (!session) return null;
 return resolveGlobalSessionDirectory(session);
};

const selectSession = (sessionId: string, directoryHint: string | null): void => {
 const state = useSessionUIStore.getState();
 const directory = directoryHint ?? state.getDirectoryForSession(sessionId);
 const directoryChanged = directory !== null && directory !== state.currentSessionDirectory;
 if (state.currentSessionId !== sessionId || directoryChanged) {
  state.setCurrentSession(sessionId, directory);
 }
};

/**
 * Opens the session a route, a link, a notification, or a toast names.
 */
export async function openSession(sessionId: string, options: SessionOpenOptions = {}): Promise<void> {
 const requestedId = sessionId.trim();
 if (!requestedId) return;
 if (options.requireKnownSession) {
  const selectedBeforeLoad = useSessionUIStore.getState().currentSessionId;
  const snapshot = await ensureGlobalSessionsLoaded().catch(() => null);
  if (useSessionUIStore.getState().currentSessionId !== selectedBeforeLoad) return;
  if (!snapshot || ![...snapshot.activeSessions, ...snapshot.archivedSessions].some((session) => session.sessionId === requestedId)) return;
 }

 const messageId = options.messageId?.trim() || null;
 if (messageId) requestMessageFocus(requestedId, messageId);

 const initialStore = useGlobalSessionsStore.getState();
 const initialSession = initialStore.entityById.get(requestedId);
 selectSession(requestedId, options.directory?.trim() || resolveSessionDir(initialSession));

 // Cold loads often do not know the owning directory yet, so the first
 // selection guesses from the directory hint or cached entity. Once the global
 // list arrives, update to the authoritative workspace directory.
 const snapshot = await ensureGlobalSessionsLoaded().catch(() => null);
 if (!snapshot) return;

 const latest = useSessionUIStore.getState();
 if (latest.currentSessionId !== requestedId) return;

 const sessions = [...snapshot.activeSessions, ...snapshot.archivedSessions];
 const session = sessions.find((entry) => entry.sessionId === requestedId);
 if (!session) return;

 const directory = resolveSessionDir(session);
 if (!directory || directory === latest.currentSessionDirectory) return;
 latest.setCurrentSession(requestedId, directory);
}

/**
 * Opens a session link and, for a message link, asks the session's timeline
 * to show that message: on entry, or right away if the session is open.
 */
export function openSessionLink(sessionId: string, messageId: string | null): Promise<void> {
 return openSession(sessionId, { messageId });
}

/**
 * Select a session named by `/?session=`.
 */
export function openSessionFromRoute(sessionId: string): Promise<void> {
 return openSession(sessionId);
}

// Register here to keep the session store independent of the router.
setSessionOpener((sessionId, directory) => {
 void openSession(sessionId, { directory });
});
