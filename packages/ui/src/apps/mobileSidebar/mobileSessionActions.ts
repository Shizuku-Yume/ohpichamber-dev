import { toast } from '@/components/ui';
import { getDescendantIds } from '@/components/session/sidebar/list/sessionCollection';
import { collectSessionSubtreeIds, runSessionSubtreeAction, type SessionSubtreeAction } from '@/components/session/sidebar/sessions/sessionSubtreeActions';
import { toastSessionWorkFailure } from '@/components/session/sidebar/sessions/sessionWorkFailure';
import type { I18nKey, I18nParams } from '@/lib/i18n';
import type { Session } from '@openchamber/agent-contract';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { toggleSessionPin } from '@/sync/session-pins';
import { useUIStore } from '@/stores/useUIStore';
<<<<<<< HEAD
import { SessionDirectoryMissingError, setSessionWorkState } from '@/sync/session-actions';
||||||| bc50ba56aa
import { setSessionWorkState } from '@/sync/session-actions';
import { setSessionPinList } from '@/sync/session-pins';
import { getSessionPinList } from '@/lib/sessionPins';
import { DEFAULT_PIN_LIST } from '@/lib/sidebarSections';
import { requestPinTo } from '@/components/session/sidebar/sections/sectionActions';
=======
import { setSessionWorkState } from '@/sync/session-actions';
import { settleRunningOperatorChildren } from '@/sync/operator-children-done';
import { setSessionPinList } from '@/sync/session-pins';
import { getSessionPinList } from '@/lib/sessionPins';
import { DEFAULT_PIN_LIST } from '@/lib/sidebarSections';
import { requestPinTo } from '@/components/session/sidebar/sections/sectionActions';
>>>>>>> upstream/main
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getSessionDirectory } from '../mobileSessionFields';
import { problemMessage } from '@/lib/problemMessage';

type Translate = (key: I18nKey, params?: I18nParams) => string;

const childrenOfActiveSessions = (): Map<string, Session[]> => {
 const children = new Map<string, Session[]>();
 for (const session of useGlobalSessionsStore.getState().activeSessions) {
  const parentId = session.parentSessionId;
  if (!parentId) continue;
  children.set(parentId, [...(children.get(parentId) ?? []), session]);
 }
 return children;
};

export const selectMobileSession = (session: Session, projectId: string | null, close: () => void): void => {
<<<<<<< HEAD
 // Selecting a session always leaves a full-page surface, as on the desktop.
 useUIStore.getState().closeMainSurfaces();
 if (projectId) useProjectsStore.getState().setActiveProjectIdOnly(projectId);
 void useSessionUIStore.getState().setCurrentSession(session.sessionId, getSessionDirectory(session) || null);
 close();
||||||| bc50ba56aa
  // Selecting a session always leaves a full-page surface, as on the desktop.
  useUIStore.getState().closeMainSurfaces();
  if (projectId) useProjectsStore.getState().setActiveProjectIdOnly(projectId);
  void useSessionUIStore.getState().setCurrentSession(session.id, getSessionDirectory(session) || null);
  close();
=======
  useUIStore.getState().closeMainSurfaces();
  if (projectId) useProjectsStore.getState().setActiveProjectIdOnly(projectId);
  void useSessionUIStore.getState().setCurrentSession(session.id, getSessionDirectory(session) || null);
  close();
>>>>>>> upstream/main
};

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

export const toggleMobileSessionWork = async (session: Session, sessionsInWork: readonly Session[], t: Translate): Promise<void> => {
<<<<<<< HEAD
 try {
  if (sessionsInWork.length === 0) {
   await setSessionWorkState(session.sessionId, getSessionDirectory(session) || null, 'open');
   return;
||||||| bc50ba56aa
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
=======
  try {
    if (sessionsInWork.length === 0) {
      await setSessionWorkState(session.id, getSessionDirectory(session) || null, 'open');
      return;
    }
    if (!await settleRunningOperatorChildren(sessionsInWork.map((entry) => entry.id))) return;
    for (const entry of sessionsInWork) {
      await setSessionWorkState(entry.id, getSessionDirectory(entry) || getSessionDirectory(session) || null, 'done');
    }
  } catch {
    toast.error(t('sessions.sidebar.session.work.updateFailed'));
>>>>>>> upstream/main
  }
  for (const entry of sessionsInWork) {
   await setSessionWorkState(entry.sessionId, getSessionDirectory(entry) || getSessionDirectory(session) || null, 'done');
  }
 } catch (error) {
  toastSessionWorkFailure(error instanceof SessionDirectoryMissingError, () => { void runMobileSubtreeAction('archive', session, t); }, t);
 }
};

export const toggleMobileSessionPin = (session: Session, pinned: boolean, t: Translate): void => {
 const directory = getSessionDirectory(session);
 if (!directory) return;
 const failedKey = pinned ? 'sessions.sidebar.session.pin.unpinFailed' : 'sessions.sidebar.session.pin.pinFailed';
 toggleSessionPin({ directory, sessionId: session.sessionId }).catch((error) => toast.error(problemMessage(error, t(failedKey))));
};

export const renameMobileSession = async (sessionId: string, title: string, t: Translate): Promise<void> => {
 try {
  await useSessionUIStore.getState().updateSessionTitle(sessionId, title);
 } catch (error) {
  toast.error(problemMessage(error, t('mobile.sessions.renameError')));
 }
};
