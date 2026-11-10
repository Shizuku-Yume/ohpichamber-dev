import { toast } from '@/components/ui';
import { getDescendantIds } from '@/components/session/sidebar/list/sessionCollection';
import { collectSessionSubtreeIds, runSessionSubtreeAction, type SessionSubtreeAction } from '@/components/session/sidebar/sessions/sessionSubtreeActions';
import type { I18nKey, I18nParams } from '@/lib/i18n';
import type { Session } from '@openchamber/agent-contract';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { toggleSessionPin } from '@/sync/session-pins';
import { useUIStore } from '@/stores/useUIStore';
<<<<<<< HEAD
import { SessionDirectoryMissingError, setSessionWorkState } from '@/sync/session-actions';
=======
import { setSessionWorkState } from '@/sync/session-actions';
import { setSessionPinList } from '@/sync/session-pins';
import { getSessionPinList } from '@/lib/sessionPins';
import { DEFAULT_PIN_LIST } from '@/lib/sidebarSections';
import { requestPinTo } from '@/components/session/sidebar/sections/sectionActions';
>>>>>>> bc50ba56a
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getSessionDirectory } from '../mobileSessionFields';

type Translate = (key: I18nKey, params?: I18nParams) => string;

/** The active sessions by parent, read when an action runs rather than on every render. */
const childrenOfActiveSessions = (): Map<string, Session[]> => {
 const children = new Map<string, Session[]>();
 for (const session of useGlobalSessionsStore.getState().activeSessions) {
  const parentId = session.parentSessionId;
  if (!parentId) continue;
  children.set(parentId, [...(children.get(parentId) ?? []), session]);
 }
 return children;
};

/** Opens a session from the list: its project becomes the active one and the drawer closes. */
export const selectMobileSession = (session: Session, projectId: string | null, close: () => void): void => {
 // Selecting a session always leaves a full-page surface, as on the desktop.
 useUIStore.getState().closeMainSurfaces();
 if (projectId) useProjectsStore.getState().setActiveProjectIdOnly(projectId);
 void useSessionUIStore.getState().setCurrentSession(session.sessionId, getSessionDirectory(session) || null);
 close();
};

/**
 * Archive or delete a session with its subagents. Lineage is resolved over
 * every active session rather than the rows on screen: a subagent can sit in
 * another worktree and still belongs to its parent.
 */
export const runMobileSubtreeAction = (action: SessionSubtreeAction, session: Session, t: Translate): ReturnType<typeof runSessionSubtreeAction> => {
 const store = useSessionUIStore.getState();
 return runSessionSubtreeAction(
  action,
  session,
  collectSessionSubtreeIds(session.sessionId, getDescendantIds(childrenOfActiveSessions(), session.sessionId), action === 'delete'),
  { archiveSession: store.archiveSession, archiveSessions: store.archiveSessions, deleteSession: store.deleteSession, deleteSessions: store.deleteSessions },
  t,
 );
};

<<<<<<< HEAD
export const toggleMobileSessionWork = async (session: Session, inWork: boolean, t: Translate): Promise<void> => {
 try {
  await setSessionWorkState(session.sessionId, getSessionDirectory(session) || null, inWork ? 'done' : 'open');
 } catch (error) {
  toastSessionWorkFailure(error instanceof SessionDirectoryMissingError, () => { void runMobileSubtreeAction('archive', session, t); }, t);
 }
=======
/**
 * Track a root session's work, or with sessions of it in work, mark all of
 * them done, as the desktop row does.
 */
export const toggleMobileSessionWork = async (session: Session, sessionsInWork: readonly Session[], t: Translate): Promise<void> => {
  try {
    if (sessionsInWork.length === 0) {
      await setSessionWorkState(session.id, getSessionDirectory(session) || null, 'open');
      return;
    }
    for (const entry of sessionsInWork) {
      await setSessionWorkState(entry.id, getSessionDirectory(entry) || getSessionDirectory(session) || null, 'done');
    }
  } catch {
    toast.error(t('sessions.sidebar.session.work.updateFailed'));
  }
>>>>>>> bc50ba56a
};

/** The swipe's Pin: Pinned at once while there are no pin lists, a choice of list once there are. */
export const toggleMobileSessionPin = (session: Session, pinned: boolean, t: Translate): void => {
<<<<<<< HEAD
 const directory = getSessionDirectory(session);
 if (!directory) return;
 const failedKey = pinned ? 'sessions.sidebar.session.pin.unpinFailed' : 'sessions.sidebar.session.pin.pinFailed';
 toggleSessionPin({ directory, sessionId: session.sessionId }).catch(() => toast.error(t(failedKey)));
=======
  const directory = getSessionDirectory(session);
  if (!directory) return;
  const target = { directory, sessionId: session.id };
  requestPinTo({
    current: pinned ? getSessionPinList(session) ?? DEFAULT_PIN_LIST : null,
    pin: (list) => { setSessionPinList(target, true, list).catch(() => toast.error(t('sessions.sidebar.session.pin.pinFailed'))); },
    unpin: () => { setSessionPinList(target, false, null).catch(() => toast.error(t('sessions.sidebar.session.pin.unpinFailed'))); },
  });
>>>>>>> bc50ba56a
};

export const renameMobileSession = async (sessionId: string, title: string, t: Translate): Promise<void> => {
 try {
  await useSessionUIStore.getState().updateSessionTitle(sessionId, title);
 } catch {
  toast.error(t('mobile.sessions.renameError'));
 }
};
