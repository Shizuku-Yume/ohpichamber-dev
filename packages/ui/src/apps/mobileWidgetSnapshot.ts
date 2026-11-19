import type { Session } from '@openchamber/agent-contract';

import type { ProjectEntry } from '@/lib/api/types';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionPinnedStore } from '@/stores/useSessionPinnedStore';
import { isSessionUnread } from '@/sync/session-unread';
import { compareSessionsByLifecycleOrder, useSessionOrderingStore } from '@/sync/session-ordering';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { resolveProjectForSessionDirectory } from '@/lib/projectResolution';
import { useSessionUIStore } from '@/sync/session-ui-store';

<<<<<<< HEAD
/**
 * Builds the lightweight session overview the native iOS widgets render (home medium,
 * lock-screen, Control Center). The widget process can't see the WebView, so the native
 * shell pulls this snapshot via `window.__OPENCHAMBER_WIDGET_SNAPSHOT__()` on
 * background/activate, writes it to the shared App Group, and reloads the widget timelines
 * (see SceneDelegate.writeWidgetSnapshot). Mirrors the sidebar's attention logic so the
 * widget's "needs attention" mark matches the in-app unread dot exactly:
 *   needsAttention = unseenCount > 0 && (!isSubtask || notifyOnSubtasks)
 */
||||||| bc50ba56aa
/**
 * Builds the lightweight session overview the native iOS widgets render (home medium,
 * lock-screen, Control Center), plus the project list the Shortcuts project picker reads. The widget process can't see the WebView, so the native
 * shell pulls this snapshot via `window.__OPENCHAMBER_WIDGET_SNAPSHOT__()` on
 * background/activate, writes it to the shared App Group, and reloads the widget timelines
 * (see SceneDelegate.writeWidgetSnapshot). The "needs attention" mark is the in-app
 * unread mark (`isSessionUnread`), so the widget and the sidebar agree.
 */
=======
>>>>>>> upstream/main

interface MobileWidgetSession {
<<<<<<< HEAD
 id: string;
 title: string;
 /** True when the session needs attention (unread + honouring the subtask setting). */
 unread: boolean;
 /** Project label for the session's directory (matched project name, else folder name). */
 project: string;
||||||| bc50ba56aa
  id: string;
  title: string;
  /** True when the session's last turn is unread. */
  unread: boolean;
  /** Project label for the session's directory (matched project name, else folder name). */
  project: string;
=======
  id: string;
  title: string;
  unread: boolean;
  project: string;
  status?: MobileWidgetSessionStatus;
>>>>>>> upstream/main
}

<<<<<<< HEAD
||||||| bc50ba56aa
/** A project the iOS Shortcuts picker offers (ShortcutProjectEntity in ShortcutRequests.swift). */
=======
type MobileWidgetSessionStatus = 'running' | 'retrying' | 'error';

>>>>>>> upstream/main
interface MobileWidgetProject {
 id: string;
 label: string;
}

interface MobileWidgetSnapshot {
<<<<<<< HEAD
 runtimeKey: string;
 attentionCount: number;
 recentSessions: MobileWidgetSession[];
 projects: MobileWidgetProject[];
||||||| bc50ba56aa
  /** Runtime instance that owns all session IDs and paths in this snapshot. */
  runtimeKey: string;
  /** Count of sessions needing attention — same signal that drives the app-icon badge. */
  attentionCount: number;
  /** Top-level sessions in the app's shared lifecycle order (capped for the medium widget). */
  recentSessions: MobileWidgetSession[];
  /** The runtime's projects, for the Shortcuts project picker. */
  projects: MobileWidgetProject[];
=======
  runtimeKey: string;
  attentionCount: number;
  recentSessions: MobileWidgetSession[];
  projects: MobileWidgetProject[];
>>>>>>> upstream/main
}
<<<<<<< HEAD
const RECENT_LIMIT = 6;
||||||| bc50ba56aa

const RECENT_LIMIT = 6;
=======

const RECENT_LIMIT = 10;
>>>>>>> upstream/main

const parentIdOf = (session: Session): string | null => session.parentSessionId ?? null;

const basename = (path: string): string => {
 const trimmed = path.replace(/\/+$/, '');
 return trimmed.slice(trimmed.lastIndexOf('/') + 1) || trimmed;
};

<<<<<<< HEAD
const normalizeProjectPath = (path: string): string =>
 path.replace(/\\/g, '/').replace(/\/+$/, '');

/** Project label for a session directory: longest matching project's name, else the folder name. */
||||||| bc50ba56aa
const normalizeProjectPath = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/+$/, '');

/** Project label for a session directory: longest matching project's name, else the folder name. */
=======
>>>>>>> upstream/main
const projectLabelForDirectory = (directory: string | null, projects: ProjectEntry[]): string => {
<<<<<<< HEAD
 if (!directory) return '';
 let best: ProjectEntry | null = null;
 let bestLen = -1;
 for (const project of projects) {
  const projectPath = normalizeProjectPath(project.path);
  if (directory === projectPath || directory.startsWith(`${projectPath}/`)) {
   if (projectPath.length > bestLen) {
    best = project;
    bestLen = projectPath.length;
   }
  }
 }
 if (best) {
  return best.label?.trim() || basename(best.path);
 }
 return basename(directory);
||||||| bc50ba56aa
  if (!directory) return '';
  let best: ProjectEntry | null = null;
  let bestLen = -1;
  for (const project of projects) {
    const projectPath = normalizeProjectPath(project.path);
    if (directory === projectPath || directory.startsWith(`${projectPath}/`)) {
      if (projectPath.length > bestLen) {
        best = project;
        bestLen = projectPath.length;
      }
    }
  }
  if (best) {
    return best.label?.trim() || basename(best.path);
  }
  return basename(directory);
=======
  if (!directory) return '';
  const project = resolveProjectForSessionDirectory(
    projects,
    useSessionUIStore.getState().availableWorktreesByProject,
    directory,
  );
  if (project) return project.label?.trim() || basename(project.path);
  return basename(directory);
>>>>>>> upstream/main
};

<<<<<<< HEAD
export const buildMobileWidgetSnapshot = (): MobileWidgetSnapshot => {
 const sessions = useGlobalSessionsStore.getState().activeSessions;
 const projects = useProjectsStore.getState().projects;
 const pinnedSessionIds = useSessionPinnedStore.getState().ids;
 const sessionOrderRanks = useSessionOrderingStore.getState().rankById;
||||||| bc50ba56aa
const buildMobileWidgetSnapshot = (): MobileWidgetSnapshot => {
  const sessions = useGlobalSessionsStore.getState().activeSessions;
  const projects = useProjectsStore.getState().projects;
  const pinnedSessionIds = useSessionPinnedStore.getState().ids;
  const sessionOrderRanks = useSessionOrderingStore.getState().rankById;
=======
const liveStatusOf = (sessionId: string): MobileWidgetSessionStatus | undefined => {
  const live = useGlobalSessionStatusStore.getState();
  if (live.statusById.get(sessionId)?.status.type === 'retry') return 'retrying';
  if (live.activeSessionIds.has(sessionId)) return 'running';
  if (live.observedById.get(sessionId)?.outcome === 'failed') return 'error';
  return undefined;
};

export const buildMobileWidgetSnapshot = (): MobileWidgetSnapshot => {
  const sessions = useGlobalSessionsStore.getState().activeSessions;
  const projects = useProjectsStore.getState().projects;
  const pinnedSessionIds = useSessionPinnedStore.getState().ids;
  const sessionOrderRanks = useSessionOrderingStore.getState().rankById;
>>>>>>> upstream/main

 let attentionCount = 0;
 const topLevel: Array<{ session: Session; unread: boolean; project: string }> = [];

 for (const session of sessions) {
  const unread = isSessionUnread(session);
  if (unread) {
   attentionCount += 1;
  }
  if (parentIdOf(session) === null) {
   topLevel.push({
    session,
    unread,
    project: projectLabelForDirectory(resolveGlobalSessionDirectory(session), projects),
   });
  }
 }

<<<<<<< HEAD
 topLevel.sort((a, b) => compareSessionsByLifecycleOrder(a.session, b.session, pinnedSessionIds, sessionOrderRanks));
 const recentSessions = topLevel
  .slice(0, RECENT_LIMIT)
  .map(({ session, unread, project }) => ({ id: session.sessionId, title: session.title ?? '', unread, project }));
||||||| bc50ba56aa
  topLevel.sort((a, b) => compareSessionsByLifecycleOrder(a.session, b.session, pinnedSessionIds, sessionOrderRanks));
  const recentSessions = topLevel
    .slice(0, RECENT_LIMIT)
    .map(({ session, unread, project }) => ({ id: session.id, title: session.title ?? '', unread, project }));
=======
  topLevel.sort((a, b) => compareSessionsByLifecycleOrder(a.session, b.session, pinnedSessionIds, sessionOrderRanks));
  const recentSessions = topLevel
    .slice(0, RECENT_LIMIT)
    .map(({ session, unread, project }) => {
      const row: MobileWidgetSession = { id: session.id, title: session.title ?? '', unread, project };
      const status = liveStatusOf(session.id);
      if (status) row.status = status;
      return row;
    });
>>>>>>> upstream/main

 return {
  runtimeKey: getRuntimeKey(),
  attentionCount,
  recentSessions,
  projects: projects.map((project) => ({ id: project.id, label: project.label?.trim() || basename(project.path) })),
 };
};

const SNAPSHOT_GLOBAL_KEY = '__OPENCHAMBER_WIDGET_SNAPSHOT__';

export const installMobileWidgetSnapshotBridge = (): void => {
 if (typeof window === 'undefined') {
  return;
 }
 (window as typeof window & { [SNAPSHOT_GLOBAL_KEY]?: () => string | null })[SNAPSHOT_GLOBAL_KEY] = () => {
  try {
   return JSON.stringify(buildMobileWidgetSnapshot());
  } catch {
   return null;
  }
 };
};
