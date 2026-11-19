import type { Session } from '@openchamber/agent-contract';
import { ensureGlobalSessionsLoaded, resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { setSessionOpener } from '@/sync/session-navigation';
import { requestMessageFocus } from './messageFocus';

<<<<<<< HEAD
||||||| bc50ba56aa
// Only synchronous selection notifications inside a redirect replace history.
let redirecting = false;
export const isSessionOpenRedirect = (): boolean => redirecting;

=======
let redirecting = false;
export const isSessionOpenRedirect = (): boolean => redirecting;

>>>>>>> upstream/main
export type SessionOpenOptions = {
<<<<<<< HEAD
 /** The owning directory when the caller already knows it (a desktop event or a notification carries one). */
 directory?: string | null;
 /** The message a link names. */
 messageId?: string | null;
 /** Native jump-list entries may outlive their session. Unknown IDs do not select anything. */
 requireKnownSession?: boolean;
||||||| bc50ba56aa
  /** The owning directory when the caller already knows it (a desktop event or a notification carries one). */
  directory?: string | null;
  /** The message a link names. */
  messageId?: string | null;
  /** Native jump-list entries may outlive their session. Unknown IDs do not select anything. */
  requireKnownSession?: boolean;
=======
  directory?: string | null;
  messageId?: string | null;
  requireKnownSession?: boolean;
>>>>>>> upstream/main
};

const resolveSessionDir = (session: Session | undefined): string | null => {
 if (!session) return null;
 return resolveGlobalSessionDirectory(session);
};

<<<<<<< HEAD
const selectSession = (sessionId: string, directoryHint: string | null): void => {
 const state = useSessionUIStore.getState();
 const directory = directoryHint ?? state.getDirectoryForSession(sessionId);
 const directoryChanged = directory !== null && directory !== state.currentSessionDirectory;
 if (state.currentSessionId !== sessionId || directoryChanged) {
  state.setCurrentSession(sessionId, directory);
 }
||||||| bc50ba56aa
const btwParentOf = (session: Session | undefined): string | null => {
  const parentId = getBtwOriginalSessionID(session);
  return parentId && session && parentId !== session.id ? parentId : null;
};

/**
 * A `/btw` fork is a side transcript inside its parent's panel, not a session
 * of its own: no list shows it, so opening it by id strands the reader in a
 * transcript with no way back. Resolve it to its parent when that parent still
 * exists; a deleted parent leaves only the fork to open.
 */
const targetFor = (
  session: Session | undefined,
  fallbackId: string,
  parentExists: (parentId: string) => boolean,
): SessionOpenTarget => {
  const parentId = btwParentOf(session);
  const directory = session ? resolveGlobalSessionDirectory(session) : null;
  return parentId && parentExists(parentId)
    ? { sessionId: parentId, directory, btwParentId: parentId }
    : { sessionId: fallbackId, directory, btwParentId: null };
};

const selectTarget = (target: SessionOpenTarget, directoryHint: string | null): void => {
  const state = useSessionUIStore.getState();
  const directory = directoryHint ?? state.getDirectoryForSession(target.sessionId) ?? target.directory;
  const directoryChanged = directory !== null && directory !== state.currentSessionDirectory;
  if (state.currentSessionId !== target.sessionId || directoryChanged) {
    state.setCurrentSession(target.sessionId, directory);
  }
  if (target.btwParentId) {
    useBtwStore.getState().setPanelState(target.btwParentId, { collapsed: false });
  }
=======
const btwParentOf = (session: Session | undefined): string | null => {
  const parentId = getBtwOriginalSessionID(session);
  return parentId && session && parentId !== session.id ? parentId : null;
};

const targetFor = (
  session: Session | undefined,
  fallbackId: string,
  parentExists: (parentId: string) => boolean,
): SessionOpenTarget => {
  const parentId = btwParentOf(session);
  const directory = session ? resolveGlobalSessionDirectory(session) : null;
  return parentId && parentExists(parentId)
    ? { sessionId: parentId, directory, btwParentId: parentId }
    : { sessionId: fallbackId, directory, btwParentId: null };
};

const selectTarget = (target: SessionOpenTarget, directoryHint: string | null): void => {
  const state = useSessionUIStore.getState();
  const directory = directoryHint ?? state.getDirectoryForSession(target.sessionId) ?? target.directory;
  const directoryChanged = directory !== null && directory !== state.currentSessionDirectory;
  if (state.currentSessionId !== target.sessionId || directoryChanged) {
    state.setCurrentSession(target.sessionId, directory);
  }
  if (target.btwParentId) {
    useBtwStore.getState().setPanelState(target.btwParentId, { collapsed: false });
  }
>>>>>>> upstream/main
};

<<<<<<< HEAD
/**
 * Opens the session a route, a link, a notification, or a toast names.
 */
||||||| bc50ba56aa
/**
 * Opens the session a route, a link, a notification, or a toast names.
 *
 * A message link keeps its named session: the message lives in that
 * transcript, and selecting the parent would not find it.
 */
=======
>>>>>>> upstream/main
export async function openSession(sessionId: string, options: SessionOpenOptions = {}): Promise<void> {
<<<<<<< HEAD
 const requestedId = sessionId.trim();
 if (!requestedId) return;
 if (options.requireKnownSession) {
  const selectedBeforeLoad = useSessionUIStore.getState().currentSessionId;
||||||| bc50ba56aa
  const requestedId = sessionId.trim();
  if (!requestedId) return;
  if (options.requireKnownSession) {
    const selectedBeforeLoad = useSessionUIStore.getState().currentSessionId;
    const snapshot = await ensureGlobalSessionsLoaded().catch(() => null);
    if (useSessionUIStore.getState().currentSessionId !== selectedBeforeLoad) return;
    if (!snapshot || ![...snapshot.activeSessions, ...snapshot.archivedSessions].some((session) => session.id === requestedId)) return;
  }

  const messageId = options.messageId?.trim() || null;
  if (messageId) requestMessageFocus(requestedId, messageId);

  const initialStore = useGlobalSessionsStore.getState();
  const initialTarget = messageId
    ? { sessionId: requestedId, directory: null, btwParentId: null }
    : targetFor(initialStore.entityById.get(requestedId), requestedId, (parentId) => initialStore.entityById.has(parentId));
  selectTarget(initialTarget, options.directory?.trim() || null);

  // Cold loads often do not know the owning directory, or even the session
  // record, so the first selection can guess. Once the global list is
  // available, re-select with what it says unless the user already moved.
=======
  const requestedId = sessionId.trim();
  if (!requestedId) return;
  if (options.requireKnownSession) {
    const selectedBeforeLoad = useSessionUIStore.getState().currentSessionId;
    const snapshot = await ensureGlobalSessionsLoaded().catch(() => null);
    if (useSessionUIStore.getState().currentSessionId !== selectedBeforeLoad) return;
    if (!snapshot || ![...snapshot.activeSessions, ...snapshot.archivedSessions].some((session) => session.id === requestedId)) return;
  }

  const messageId = options.messageId?.trim() || null;
  if (messageId) requestMessageFocus(requestedId, messageId);

  const initialStore = useGlobalSessionsStore.getState();
  const initialTarget = messageId
    ? { sessionId: requestedId, directory: null, btwParentId: null }
    : targetFor(initialStore.entityById.get(requestedId), requestedId, (parentId) => initialStore.entityById.has(parentId));
  selectTarget(initialTarget, options.directory?.trim() || null);

>>>>>>> upstream/main
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

export function openSessionLink(sessionId: string, messageId: string | null): Promise<void> {
 return openSession(sessionId, { messageId });
}

export function openSessionFromRoute(sessionId: string): Promise<void> {
 return openSession(sessionId);
}

setSessionOpener((sessionId, directory) => {
 void openSession(sessionId, { directory });
});
