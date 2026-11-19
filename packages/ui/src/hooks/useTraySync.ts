import React from 'react';
import type { Session, SessionRuntimeStatus } from '@openchamber/agent-contract';
import { canUseElectronDesktopIPC, invokeDesktop, isDesktopLocalOriginActive } from '@/lib/desktop';
import { getRuntimeApiBaseUrl } from '@/lib/runtime-switch';
import { desktopHostsGet, getDesktopHostApiUrl, locationMatchesHost, redactSensitiveUrl } from '@/lib/desktopHosts';
import { getSyncChildStores } from '@/sync/sync-refs';
<<<<<<< HEAD
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
||||||| bc50ba56aa
import { useBackgroundShellsStore } from '@/sync/background-shells';
import { useBackgroundImagesStore } from '@/sync/background-images';
import { collectOpenTurnSessionIds, useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { usePrWatchStore } from '@/sync/pr-watch';
import { useWorkflowActivityStore } from '@/sync/workflow-activity';
=======
import { useBackgroundShellsStore } from '@/sync/background-shells';
import { useBackgroundImagesStore } from '@/sync/background-images';
import { collectOpenTurnSessionIds, useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { usePrWatchStore } from '@/sync/pr-watch';
import { useExtensionWaitsStore } from '@/sync/extension-waits';
import { useWorkflowActivityStore } from '@/sync/workflow-activity';
>>>>>>> upstream/main
import {
  useGlobalBlockingRequestsStore,
  type BlockingFormRequest,
  type BlockingPermissionRequest,
} from '@/sync/global-blocking-requests';
import { compareSessionsByLifecycleOrder, useSessionOrderingStore } from '@/sync/session-ordering';
import { isSessionUnread, isSessionUnreadWithError, isUnreadTurn } from '@/sync/session-unread';
import { useNotificationStore } from '@/sync/notification-store';
import { useSessionPinnedStore } from '@/stores/useSessionPinnedStore';
import { respondToPermission } from '@/sync/session-actions';
import {
  useGlobalSessionsStore,
  resolveGlobalSessionDirectory,
} from '@/stores/useGlobalSessionsStore';
import { useQuotaStore } from '@/stores/useQuotaStore';
import { QUOTA_PROVIDERS, formatWindowLabel, formatQuotaValueLabel } from '@/lib/quota';
import { formatMessage, useI18nStore } from '@/lib/i18n/store';
import type { I18nKey, I18nParams } from '@/lib/i18n';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGitStore } from '@/stores/useGitStore';
import { useUIStore } from '@/stores/useUIStore';
import { resolveProjectForSessionDirectory, normalizeProjectPath } from '@/lib/projectResolution';
import type { ProjectEntry } from '@/lib/api/types';
import type { WorktreeMetadata } from '@/types/worktree';
import { toast } from '@/components/ui';

const TRAY_ACTION_EVENT = 'openchamber:tray-action';
const POLL_INTERVAL_MS = 5000;
const FLUSH_DEBOUNCE_MS = 500;
const MAX_SESSIONS = 20;

type TraySessionStatus = 'idle' | 'busy' | 'retry';

type TraySession = {
  id: string;
  title: string;
  status: TraySessionStatus;
  branch: string;
  unseen: number;
  hasError: boolean;
  directory: string;
  subtitle: string;
};

type TrayApproval = {
  kind: 'permission' | 'form';
  id: string;
  sessionId: string;
  sessionTitle: string;
  label: string;
  directory: string;
<<<<<<< HEAD
||||||| bc50ba56aa
  // Whether responding "always" would remember anything. Forms never can, and a
  // permission can only when the request carries save patterns, so the tray can
  // drop the "Allow always" item instead of offering a no-op.
  canSave: boolean;
=======
  canSave: boolean;
>>>>>>> upstream/main
};

type TrayUsageRow = { label: string; value: string };
type TrayUsageGroup = { provider: string; rows: TrayUsageRow[]; status: string | null };
type TrayUsage = { mode: 'usage' | 'remaining'; groups: TrayUsageGroup[] };

type TraySnapshot = {
  sessions: TraySession[];
  approvals: TrayApproval[];
  instanceName: string;
  usage: TrayUsage;
<<<<<<< HEAD
  // Number of chats (root sessions) with unseen activity, for the macOS dock
  // badge. 0 when the user disabled the badge — the main process clears it.
||||||| bc50ba56aa
  // Number of chats (root sessions with a sidebar row) with unseen activity,
  // for the macOS dock badge. 0 when the user disabled the badge — the main
  // process clears it.
=======
>>>>>>> upstream/main
  dockBadgeCount: number;
};

<<<<<<< HEAD
// focus-session / new-session are routed natively by the main process through
// the existing `openchamber:open-session` / `openchamber:open-draft-session`
// events (handled in App.tsx). Only respond-permission needs handling here.
||||||| bc50ba56aa
// focus-session / new-session are routed natively by the main process through
// the existing `openchamber:open-session` / `openchamber:open-draft-session`
// events (handled in App.tsx). Permission responses and mark-all-read run here.
=======
>>>>>>> upstream/main
type TrayAction =
  | { type: 'respond-permission'; sessionId: string; id: string; response: 'once' | 'always' | 'reject' };

type DesktopBridgeGlobal = {
  listen?: (
    event: string,
    handler: (evt: { payload?: unknown }) => void
  ) => Promise<() => void>;
};

const isTrayPlatform = (): boolean => {
  if (typeof window === 'undefined') return false;
  const platform = (window as unknown as { __OPENCHAMBER_PLATFORM__?: string }).__OPENCHAMBER_PLATFORM__;
  return platform === 'darwin' || platform === 'win32' || platform === 'linux';
};

const isTrayEnabled = (): boolean =>
  typeof window !== 'undefined' && window.__OPENCHAMBER_ELECTRON__?.trayEnabled !== false;

const permissionLabel = (request: BlockingPermissionRequest): string =>
  request.commandSummary.trim() || request.toolName.trim() || request.actionType;

const formLabel = (request: BlockingFormRequest): string => request.prompt.trim() || 'Question';

<<<<<<< HEAD
const trayStatus = (status: SessionRuntimeStatus | undefined): TraySessionStatus =>
  status === 'running' || status === 'awaiting_approval' || status === 'awaiting_input' ? 'busy' : 'idle';
||||||| bc50ba56aa
// The tray lists sessions by activity alone; pins only order the sidebar.
const NO_PINNED_SESSIONS = new Set<string>();
=======
const NO_PINNED_SESSIONS = new Set<string>();
>>>>>>> upstream/main

const compareSessionOrder = (left: Session, right: Session): number => (
  compareSessionsByLifecycleOrder(
    left,
    right,
    useSessionPinnedStore.getState().ids,
    useSessionOrderingStore.getState().rankById,
  )
);

const basenameOf = (p: string): string => {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
};

<<<<<<< HEAD
// Resolve the project metadata line using Host directory and cached Git facts.
||||||| bc50ba56aa
// Resolve the "project · branch" metadata line for a session from its directory,
// covering both project-root sessions and worktree sessions (which map back to
// their parent project). Branch prefers the live VCS value; falls back to the
// worktree's recorded branch when the directory isn't currently synced.
=======
>>>>>>> upstream/main
const resolveSessionSubtitle = (
  directory: string,
  projects: ProjectEntry[],
  worktreesByProject: Map<string, WorktreeMetadata[]>,
): string => {
  if (!directory) return '';
  const project = resolveProjectForSessionDirectory(projects, worktreesByProject, directory);
  const projectName = project?.label?.trim() || basenameOf(directory);
  const normDir = normalizeProjectPath(directory);

<<<<<<< HEAD
  // Cached Git status and recorded worktree metadata remain independent of
  // canonical session DTOs; the runtime does not expose legacy VCS state.
  let branch = '';
||||||| bc50ba56aa
  // Branch resolution, most-authoritative first: live VCS from the sync store,
  // then the git store's cached status (covers project-root sessions whose
  // directory isn't actively synced), then recorded worktree metadata.
  let branch = (normDir && branchByDirectory.get(normDir)) || '';
=======
  let branch = (normDir && branchByDirectory.get(normDir)) || '';
>>>>>>> upstream/main
  if (!branch) {
    for (const [dir, gitState] of useGitStore.getState().directories) {
      if (normalizeProjectPath(dir) === normDir) { branch = gitState.status?.current ?? ''; break; }
    }
  }
  if (!branch) {
    for (const worktrees of worktreesByProject.values()) {
      const match = worktrees.find((wt) => normalizeProjectPath(wt.path) === normDir);
      if (match?.branch) { branch = match.branch; break; }
    }
  }

  return branch ? `${projectName} · ${branch}` : projectName;
};

<<<<<<< HEAD
// Build the usage groups exactly like the header/mobile: only providers the
// user enabled for the dropdown AND that report as configured. Window rows only
// (the headline limits) — model breakdowns stay in the full UI.
const translateQuota = (key: I18nKey, params?: I18nParams): string =>
  formatMessage(useI18nStore.getState().dictionary, key, params);

||||||| bc50ba56aa
// Build the usage groups exactly like the header/mobile: only providers the
// user enabled for the dropdown AND that report as configured. Window rows only
// (the headline limits) — model breakdowns stay in the full UI.
=======
>>>>>>> upstream/main
const buildUsage = (): TrayUsage => {
  const { results, dropdownProviderIds, displayMode } = useQuotaStore.getState();
  const mode: TrayUsage['mode'] = displayMode === 'remaining' ? 'remaining' : 'usage';
  if (!dropdownProviderIds.length) return { mode, groups: [] };

  const byProvider = new Map(results.map((result) => [result.providerId, result]));
  const groups: TrayUsageGroup[] = [];
  for (const meta of QUOTA_PROVIDERS) {
    if (!dropdownProviderIds.includes(meta.id)) continue;
    const result = byProvider.get(meta.id);
    if (!result || result.configured !== true) continue;

    const rows: TrayUsageRow[] = [];
    for (const [label, window] of Object.entries(result.usage?.windows ?? {})) {
      const percent = mode === 'remaining' ? window.remainingPercent : window.usedPercent;
      rows.push({ label: formatWindowLabel(label), value: formatQuotaValueLabel(window, percent, translateQuota) });
    }

    const status = !result.ok && result.error
      ? result.error
      : rows.length === 0
        ? 'No rate limits reported'
        : null;
    groups.push({ provider: meta.name, rows, status });
  }
  return { mode, groups };
};

const resolveInstanceName = async (): Promise<string> => {
  try {
    if (isDesktopLocalOriginActive()) return 'Local OhPiChamber';
    const localOrigin = (window as unknown as { __OPENCHAMBER_LOCAL_ORIGIN__?: string }).__OPENCHAMBER_LOCAL_ORIGIN__
      || window.location.origin;
    const runtimeApiBaseUrl = getRuntimeApiBaseUrl();
    if (runtimeApiBaseUrl && locationMatchesHost(runtimeApiBaseUrl, localOrigin)) return 'Local OhPiChamber';
    const cfg = await desktopHostsGet();
    const match = cfg.hosts.find((host) =>
      runtimeApiBaseUrl ? locationMatchesHost(runtimeApiBaseUrl, getDesktopHostApiUrl(host)) : false);
    if (match?.label?.trim()) return redactSensitiveUrl(match.label.trim());
    return 'Instance';
  } catch {
    return '';
  }
};

type LiveData = {
  statusById: Map<string, TraySessionStatus>;
  approvals: TrayApproval[];
  titleById: Map<string, string>;
};

const collectLiveData = (): LiveData => {
  const statusById = new Map<string, TraySessionStatus>();
  const approvals: TrayApproval[] = [];
  const titleById = new Map<string, string>();

  let stores;
  try {
    stores = getSyncChildStores();
  } catch {
    return { statusById, approvals, titleById };
  }

  for (const [directory, store] of stores.children.entries()) {
    const state = store.getState();
<<<<<<< HEAD
||||||| bc50ba56aa
    // Normalize the key so it matches the session directory regardless of
    // trailing slashes / separators.
    if (state.vcs?.branch) branchByDirectory.set(normalizeProjectPath(directory) ?? directory, state.vcs.branch);
=======
    if (state.vcs?.branch) branchByDirectory.set(normalizeProjectPath(directory) ?? directory, state.vcs.branch);
>>>>>>> upstream/main

    for (const session of state.session) {
      if (!session?.sessionId) continue;
      titleById.set(session.sessionId, session.title ?? '');
    }

    for (const [sessionId, status] of Object.entries(state.session_status ?? {})) {
      const mapped = trayStatus(status);
      const existing = statusById.get(sessionId);
      if (!existing || existing === 'idle') statusById.set(sessionId, mapped);
    }

    for (const [sessionId, requests] of Object.entries(state.permission ?? {})) {
      for (const request of requests ?? []) {
        const id = request.approvalId;
        const sid = request.sessionId || sessionId;
        approvals.push({ kind: 'permission', id, sessionId: sid, sessionTitle: '', label: permissionLabel(request), directory });
      }
    }
    for (const [sessionId, requests] of Object.entries(state.form ?? {})) {
      for (const request of requests ?? []) {
        const id = request.questionId;
        const sid = request.sessionId || sessionId;
        approvals.push({ kind: 'form', id, sessionId: sid, sessionTitle: '', label: formLabel(request), directory });
      }
    }
  }

  return { statusById, approvals, titleById };
};

const buildSnapshot = (instanceName: string, includeTray: boolean): TraySnapshot => {
<<<<<<< HEAD

  // The list source is the GLOBAL store — every project/worktree the backend
  // knows about, independent of which directories this client has opened. Live
  // status/unread/branch are merged in by id where we have them (the session's
  // directory is synced); otherwise the row is shown as idle.
||||||| bc50ba56aa
  // The list source is the GLOBAL store — every project/worktree the backend
  // knows about, independent of which directories this client has opened. Live
  // status/unread/branch are merged in by id where we have them (the session's
  // directory is synced); otherwise the row is shown as idle.
=======
>>>>>>> upstream/main
  const allSessions = useGlobalSessionsStore.getState().activeSessions;
<<<<<<< HEAD
  const childrenByParent = new Map<string, string[]>();
  for (const session of allSessions) {
    if (!session?.sessionId) continue;
    if (session.parentSessionId) {
      const siblings = childrenByParent.get(session.parentSessionId) ?? [];
      siblings.push(session.sessionId);
      childrenByParent.set(session.parentSessionId, siblings);
||||||| bc50ba56aa
  const lineage = createSessionLineage(allSessions);
  const collectDescendants = (rootId: string): string[] => (
    lineage.descendantsOf(rootId, 'active').map((session) => session.id)
  );

  const projects = useProjectsStore.getState().projects;
  const worktreesByProject = useSessionUIStore.getState().availableWorktreesByProject;

  // The tray and the dock badge cover the sessions that have a sidebar row
  // (`sessionHasSidebarRow`). Sessions from unconfigured directories (an eval
  // run in /tmp, a removed project, a /btw fork) have none, cannot be opened
  // or removed from there, so they would take the tray's limited slots and
  // hold a dock count the user has no way to clear. Pending approvals use the
  // same admission rule below.
  const pinnedIds = useSessionPinnedStore.getState().ids;
  type Sections = { chats: boolean; pinned: boolean; work: boolean };
  const hasRowIn = (session: Session, sections: Sections): boolean => {
    const directory = resolveGlobalSessionDirectory(session);
    const isAdmitted = isSessionDirectoryAdmitted(directory, projects, worktreesByProject);
    // A managed chat keeps its identity when its directory no longer sits under
    // the chats root, so the project id identifies it too. Only the Chats section
    // lists a chat: the Pinned and In work zones leave chats out.
    if (isChatDirectoryPath(directory) || session.projectID === CHAT_DRAFT_PROJECT_ID) {
      return sessionHasSidebarRow(session, { isAdmitted, isPlaced: sections.chats, isPinned: false, zones: { pinned: false, work: false } });
=======
  const lineage = createSessionLineage(allSessions);
  const collectDescendants = (rootId: string): string[] => (
    lineage.descendantsOf(rootId, 'active').map((session) => session.id)
  );

  const projects = useProjectsStore.getState().projects;
  const worktreesByProject = useSessionUIStore.getState().availableWorktreesByProject;

  const pinnedIds = useSessionPinnedStore.getState().ids;
  type Sections = { chats: boolean; pinned: boolean; work: boolean };
  const hasRowIn = (session: Session, sections: Sections): boolean => {
    const directory = resolveGlobalSessionDirectory(session);
    const isAdmitted = isSessionDirectoryAdmitted(directory, projects, worktreesByProject);
    if (isChatDirectoryPath(directory) || session.projectID === CHAT_DRAFT_PROJECT_ID) {
      return sessionHasSidebarRow(session, { isAdmitted, isPlaced: sections.chats, isPinned: false, zones: { pinned: false, work: false } });
>>>>>>> upstream/main
    }
<<<<<<< HEAD
  }
||||||| bc50ba56aa
    return sessionHasSidebarRow(session, {
      isAdmitted,
      isPlaced: isSpaceDirectory(directory)
        || resolveProjectForSessionDirectory(projects, worktreesByProject, directory) !== null,
      isPinned: isSessionPinned(pinnedIds, session.directory, session.id),
      zones: sections,
    });
  };
  // The badge counts only rows the sidebar renders now: with the Chats,
  // Pinned or In work section hidden, a session only that section lists has no
  // row to read. The tray list keeps such a session, because its tray row
  // opens it directly.
  const display = useSessionDisplayStore.getState();
  const shownSections: Sections = {
    chats: display.showChatsSection,
    pinned: display.showPinnedSection,
    work: useUIStore.getState().sessionWorkEnabled && display.showWorkSection,
  };
  const allSections: Sections = { chats: true, pinned: true, work: true };
=======
    return sessionHasSidebarRow(session, {
      isAdmitted,
      isPlaced: isSpaceDirectory(directory)
        || resolveProjectForSessionDirectory(projects, worktreesByProject, directory) !== null,
      isPinned: isSessionPinned(pinnedIds, session.directory, session.id),
      zones: sections,
    });
  };
  const display = useSessionDisplayStore.getState();
  const shownSections: Sections = {
    chats: display.showChatsSection,
    pinned: display.showPinnedSection,
    work: useUIStore.getState().sessionWorkEnabled && display.showWorkSection,
  };
  const allSections: Sections = { chats: true, pinned: true, work: true };
>>>>>>> upstream/main

<<<<<<< HEAD
  const collectDescendants = (rootId: string): string[] => {
    const out: string[] = [];
    const stack = [...(childrenByParent.get(rootId) ?? [])];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      stack.push(...(childrenByParent.get(id) ?? []));
    }
    return out;
  };
||||||| bc50ba56aa
  // OpenCode stamps a turn's end on the record even when the session only idles
  // on background work: until that work ends its row reads as working, so it
  // counts as unread nowhere here.
  const openTurnIds = collectOpenTurnSessionIds(useGlobalSessionStatusStore.getState().activeSessionIds, [
    useWorkflowActivityStore.getState().runningSessionIds,
    useBackgroundShellsStore.getState().sessionIds,
    useBackgroundImagesStore.getState().sessionIds,
    usePrWatchStore.getState().bySession.keys(),
  ]);
  const hasUnreadTurn = (session: Session): boolean => isSessionUnread(session) && !openTurnIds.has(session.id);
=======
  const openTurnIds = collectOpenTurnSessionIds(useGlobalSessionStatusStore.getState().activeSessionIds, [
    useWorkflowActivityStore.getState().runningSessionIds,
    useBackgroundShellsStore.getState().sessionIds,
    useBackgroundImagesStore.getState().sessionIds,
    usePrWatchStore.getState().bySession.keys(),
    useExtensionWaitsStore.getState().bySession.keys(),
  ]);
  const hasUnreadTurn = (session: Session): boolean => isSessionUnread(session) && !openTurnIds.has(session.id);
>>>>>>> upstream/main

<<<<<<< HEAD
  // Count the full root list, independently of the tray's visibility and limit.
  const ui = useUIStore.getState();
  let dockBadgeCount = 0;
  if (ui.dockBadgeEnabled) {
    for (const session of allSessions) {
      if (!session?.sessionId || session.parentSessionId) continue;
      const isUnread = isSessionUnread(session);
      let familyUnseen = isUnread ? 1 : 0;
      if (familyUnseen === 0 && ui.notifyOnSubtasks) {
        familyUnseen = collectDescendants(session.sessionId)
          .reduce((sum, id) => sum + (isUnreadTurn(useGlobalSessionsStore.getState().entityById.get(id)) ? 1 : 0), 0);
      }
      if (familyUnseen > 0) dockBadgeCount += 1;
    }
  }
||||||| bc50ba56aa
  // Count the full root list, independently of the tray's visibility and limit.
  // Only top-level sessions are ever unread (`isSessionUnread`); a subtask
  // reports to its parent.
  const dockUnread = useUIStore.getState().dockBadgeEnabled
    ? allSessions.filter((session) => hasUnreadTurn(session) && hasRowIn(session, shownSections))
    : [];
  const dockBadgeCount = dockUnread.length;
  const dockUnreadSessions = dockUnread
    .sort((left, right) => (right.time.idle ?? right.time.updated) - (left.time.idle ?? left.time.updated) || left.id.localeCompare(right.id))
    .slice(0, 10)
    .map((session) => ({ id: session.id, title: session.title, directory: resolveGlobalSessionDirectory(session) ?? '' }));
=======
  const dockUnread = useUIStore.getState().dockBadgeEnabled
    ? allSessions.filter((session) => hasUnreadTurn(session) && hasRowIn(session, shownSections))
    : [];
  const dockBadgeCount = dockUnread.length;
  const dockUnreadSessions = dockUnread
    .sort((left, right) => (right.time.idle ?? right.time.updated) - (left.time.idle ?? left.time.updated) || left.id.localeCompare(right.id))
    .slice(0, 10)
    .map((session) => ({ id: session.id, title: session.title, directory: resolveGlobalSessionDirectory(session) ?? '' }));
>>>>>>> upstream/main
  if (!includeTray) {
    return { sessions: [], approvals: [], instanceName, usage: { mode: 'usage', groups: [] }, dockBadgeCount };
  }

  const live = collectLiveData();
  const titleById = new Map<string, string>(live.titleById);
  for (const session of allSessions) {
    if (session?.sessionId && session.title) titleById.set(session.sessionId, session.title);
    const status = trayStatus(session.runtimeStatus);
    if (!live.statusById.has(session.sessionId) || live.statusById.get(session.sessionId) === 'idle') {
      live.statusById.set(session.sessionId, status);
    }
  }

  const globalStatusById = useGlobalSessionStatusStore.getState().statusById;
  const resolveStatus = (id: string): TraySessionStatus => {
    const fromStores = live.statusById.get(id);
    if (fromStores && fromStores !== 'idle') return fromStores;
    return trayStatus(globalStatusById.get(id)?.status) === 'busy' ? 'busy' : fromStores ?? 'idle';
  };

  const rollupStatus = (family: string[]): TraySessionStatus => {
    const statuses = family.map((id) => resolveStatus(id));
    if (statuses.includes('busy')) return 'busy';
    if (statuses.includes('retry')) return 'retry';
    return 'idle';
  };

  const projects = useProjectsStore.getState().projects;
  const worktreesByProject = useSessionUIStore.getState().availableWorktreesByProject;

  const sessions: TraySession[] = allSessions
<<<<<<< HEAD
    .filter((s) => s?.sessionId && !s.parentSessionId) // root rows; sub-session work rolls up
||||||| bc50ba56aa
    .filter((s) => s?.id && !s.parentID) // root rows; sub-session work rolls up
    .filter((session) => hasRowIn(session, allSections))
=======
    .filter((s) => s?.id && !s.parentID)
    .filter((session) => hasRowIn(session, allSections))
>>>>>>> upstream/main
    .slice()
    .sort(compareSessionOrder)
    .slice(0, MAX_SESSIONS)
    .map((session) => {
      const family = [session.sessionId, ...collectDescendants(session.sessionId)];
      const directory = resolveGlobalSessionDirectory(session) ?? '';
      return {
        id: session.sessionId,
        title: session.title || 'Untitled session',
        status: rollupStatus(family),
        // Canonical directory state has no legacy VCS branch projection.
        branch: '',
        unseen: isSessionUnread(session) ? 1 : 0,
        hasError: isSessionUnreadWithError(session),
        directory,
        subtitle: resolveSessionSubtitle(directory, projects, worktreesByProject),
      };
    });

  const approvals = live.approvals.map((a) => ({ ...a, sessionTitle: titleById.get(a.sessionId) || '' }));
  const seen = new Set(approvals.map((a) => a.id));
  for (const [sessionId, pending] of useGlobalBlockingRequestsStore.getState().bySession) {
    const sessionTitle = titleById.get(sessionId) || '';
    for (const request of pending.permissions) {
      const id = request.approvalId;
      if (seen.has(id)) continue;
      seen.add(id);
      approvals.push({ kind: 'permission', id, sessionId: request.sessionId, sessionTitle, label: permissionLabel(request), directory: pending.directory });
    }
<<<<<<< HEAD
    for (const request of pending.forms) {
      const id = request.questionId;
      if (seen.has(id)) continue;
      seen.add(id);
      approvals.push({ kind: 'form', id, sessionId: request.sessionId, sessionTitle, label: formLabel(request), directory: pending.directory });
||||||| bc50ba56aa
    // A page that waits for the user's answer is listed like a form: the tray
    // only opens the session for either.
    for (const request of [...pending.forms, ...pending.pages]) {
      if (seen.has(request.id)) continue;
      seen.add(request.id);
      approvals.push({ kind: 'form', id: request.id, sessionId, sessionTitle, label: formLabel(request), directory: pending.directory, canSave: false });
=======
    for (const request of [...pending.forms, ...pending.pages]) {
      if (seen.has(request.id)) continue;
      seen.add(request.id);
      approvals.push({ kind: 'form', id: request.id, sessionId, sessionTitle, label: formLabel(request), directory: pending.directory, canSave: false });
>>>>>>> upstream/main
    }
  }

  return { sessions, approvals, instanceName, usage: buildUsage(), dockBadgeCount };
};

export const useTraySync = (): void => {
  React.useEffect(() => {
    if (!isTrayPlatform() || !canUseElectronDesktopIPC()) return;
    const trayEnabled = isTrayEnabled();

    let disposed = false;
    let lastSerialized = '';
    let flushTimer: number | null = null;
    let instanceName = '';
    const flushNow = () => {
      if (disposed) return;
      const snapshot = buildSnapshot(instanceName, trayEnabled);
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSerialized) return;
      lastSerialized = serialized;
      void invokeDesktop('desktop_tray_update', snapshot);
    };

    const scheduleFlush = () => {
      if (disposed || flushTimer !== null) return;
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        flushNow();
      }, FLUSH_DEBOUNCE_MS);
    };

    const unsubscribeNotif = useNotificationStore.subscribe(() => scheduleFlush());
    const unsubscribeGlobal = useGlobalSessionsStore.subscribe(() => scheduleFlush());
<<<<<<< HEAD
||||||| bc50ba56aa
    // Cross-project status map: fed live by the sync dispatcher from the global
    // event stream and seeded from the host by the root global-sessions poll.
    // The tray used to poll `/session/status?directory=` for up to 20
    // directories every 5 seconds, which made OpenCode create an instance for
    // each of them; the host seed covers the same startup gap for free.
    const unsubscribeGlobalStatus = useGlobalSessionStatusStore.subscribe(() => scheduleFlush());
    // Background work ending turns a waiting session unread with no change to its record.
    const unsubscribeWorkflows = useWorkflowActivityStore.subscribe(() => scheduleFlush());
    const unsubscribeShells = useBackgroundShellsStore.subscribe(() => scheduleFlush());
    const unsubscribeImages = useBackgroundImagesStore.subscribe(() => scheduleFlush());
    const unsubscribePrWatches = usePrWatchStore.subscribe(() => scheduleFlush());
=======
    const unsubscribeGlobalStatus = useGlobalSessionStatusStore.subscribe(() => scheduleFlush());
    const unsubscribeWorkflows = useWorkflowActivityStore.subscribe(() => scheduleFlush());
    const unsubscribeShells = useBackgroundShellsStore.subscribe(() => scheduleFlush());
    const unsubscribeImages = useBackgroundImagesStore.subscribe(() => scheduleFlush());
    const unsubscribePrWatches = usePrWatchStore.subscribe(() => scheduleFlush());
    const unsubscribeExtensionWaits = useExtensionWaitsStore.subscribe(() => scheduleFlush());
>>>>>>> upstream/main
    const unsubscribeUI = useUIStore.subscribe((state, previous) => {
<<<<<<< HEAD
      if (state.dockBadgeEnabled !== previous.dockBadgeEnabled || state.notifyOnSubtasks !== previous.notifyOnSubtasks) {
||||||| bc50ba56aa
      if (state.dockBadgeEnabled !== previous.dockBadgeEnabled
        || state.sessionWorkEnabled !== previous.sessionWorkEnabled) {
        scheduleFlush();
      }
    });
    // Projects, discovered worktrees, pins and the shown sections decide which
    // sessions have a sidebar row, so they move the badge as well as the tray
    // list and its "project · branch" subtitles (deduped, so cheap).
    const unsubscribeProjects = useProjectsStore.subscribe(() => scheduleFlush());
    const unsubscribeWorktrees = useSessionUIStore.subscribe(() => scheduleFlush());
    const unsubscribePins = useSessionPinnedStore.subscribe(() => scheduleFlush());
    const unsubscribeSections = useSessionDisplayStore.subscribe((state, previous) => {
      if (state.showChatsSection !== previous.showChatsSection
        || state.showPinnedSection !== previous.showPinnedSection
        || state.showWorkSection !== previous.showWorkSection) {
=======
      if (state.dockBadgeEnabled !== previous.dockBadgeEnabled
        || state.sessionWorkEnabled !== previous.sessionWorkEnabled) {
        scheduleFlush();
      }
    });
    const unsubscribeProjects = useProjectsStore.subscribe(() => scheduleFlush());
    const unsubscribeWorktrees = useSessionUIStore.subscribe(() => scheduleFlush());
    const unsubscribePins = useSessionPinnedStore.subscribe(() => scheduleFlush());
    const unsubscribeSections = useSessionDisplayStore.subscribe((state, previous) => {
      if (state.showChatsSection !== previous.showChatsSection
        || state.showPinnedSection !== previous.showPinnedSection
        || state.showWorkSection !== previous.showWorkSection) {
>>>>>>> upstream/main
        scheduleFlush();
      }
    });
    const stopBadgeSync = () => {
      disposed = true;
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      unsubscribeNotif();
      unsubscribeGlobal();
<<<<<<< HEAD
||||||| bc50ba56aa
      unsubscribeGlobalStatus();
      unsubscribeWorkflows();
      unsubscribeShells();
      unsubscribeImages();
      unsubscribePrWatches();
=======
      unsubscribeGlobalStatus();
      unsubscribeWorkflows();
      unsubscribeShells();
      unsubscribeImages();
      unsubscribePrWatches();
      unsubscribeExtensionWaits();
>>>>>>> upstream/main
      unsubscribeUI();
    };

    if (!trayEnabled) {
      flushNow();
      return stopBadgeSync;
    }

    void resolveInstanceName().then((name) => {
      if (disposed) return;
      instanceName = name;
      flushNow();
    });

    const storeUnsubs = new Map<string, () => void>();

    const rebindStores = () => {
      if (disposed) return;
      let stores;
      try {
        stores = getSyncChildStores();
      } catch {
        return;
      }
      const live = new Set<string>();
      for (const [directory, store] of stores.children.entries()) {
        live.add(directory);
        if (!storeUnsubs.has(directory)) {
          storeUnsubs.set(directory, store.subscribe(() => scheduleFlush()));
        }
      }
      for (const [directory, unsub] of storeUnsubs) {
        if (!live.has(directory)) {
          unsub();
          storeUnsubs.delete(directory);
        }
      }
    };

    let unsubscribeRegistry: (() => void) | null = null;
    try {
      unsubscribeRegistry = getSyncChildStores().subscribeRegistry(() => {
        rebindStores();
        scheduleFlush();
      });
    } catch {
      // Sync provider not mounted yet — the fallback poll below recovers.
    }
    rebindStores();

    // Project labels and discovered worktrees feed the "project · branch"
    // subtitle; refresh the tray when they change (deduped, so cheap).
    const unsubscribeProjects = useProjectsStore.subscribe(() => scheduleFlush());
    const unsubscribeWorktrees = useSessionUIStore.subscribe(() => scheduleFlush());
    const unsubscribeGit = useGitStore.subscribe(() => scheduleFlush());
    // Cross-project status map: fed live by the sync dispatcher from the global
    // event stream and seeded from the host by the root global-sessions poll.
    // The tray used to poll `/session/status?directory=` for up to 20
    // directories every 5 seconds, which made OpenCode create an instance for
    // each of them; the host seed covers the same startup gap for free.
    const unsubscribeGlobalStatus = useGlobalSessionStatusStore.subscribe(() => scheduleFlush());
    const unsubscribeGlobalRequests = useGlobalBlockingRequestsStore.subscribe(() => scheduleFlush());
    const unsubscribeSessionOrder = useSessionOrderingStore.subscribe(() => scheduleFlush());
    const unsubscribePinnedSessions = useSessionPinnedStore.subscribe(() => scheduleFlush());

<<<<<<< HEAD
    // Usage: push to the tray whenever the quota store changes, and do one
    // initial fetch for enabled providers so the submenu isn't empty on launch.
    // Settings and quotas are read by the boot registry, not by a tray mount:
    // a tray-only read was the second reader that kept the store's settings
    // disagreement alive. Opening the tray asks for fresh numbers instead.
||||||| bc50ba56aa
    // Seed dropdown quotas once after readiness; later native openings refresh
    // through the readouts' shared freshness window without a tray quota timer.
=======
>>>>>>> upstream/main
    const unsubscribeQuota = useQuotaStore.subscribe(() => scheduleFlush());

    const interval = window.setInterval(() => { rebindStores(); flushNow(); }, POLL_INTERVAL_MS);

    flushNow();

    return () => {
      stopBadgeSync();
      window.clearInterval(interval);
      unsubscribeProjects();
      unsubscribeWorktrees();
      unsubscribeGit();
      unsubscribeGlobalStatus();
      unsubscribeGlobalRequests();
      unsubscribeSessionOrder();
      unsubscribePinnedSessions();
      unsubscribeQuota();
      unsubscribeRegistry?.();
      for (const unsub of storeUnsubs.values()) unsub();
      storeUnsubs.clear();
    };
  }, []);

  React.useEffect(() => {
    if (!isTrayPlatform() || !isTrayEnabled() || !canUseElectronDesktopIPC()) return;
    const bridge = (window as unknown as { __OPENCHAMBER_DESKTOP__?: DesktopBridgeGlobal }).__OPENCHAMBER_DESKTOP__;
    const listen = bridge?.listen;
    if (typeof listen !== 'function') return;

    const handle = (action: TrayAction) => {
      switch (action.type) {
        case 'respond-permission':
          void respondToPermission(action.sessionId, action.id, action.response).catch(() => {
            toast.error('Failed to respond to permission request');
          });
          break;
      }
    };

    let unlisten: null | (() => void | Promise<void>) = null;
    listen(TRAY_ACTION_EVENT, (evt) => {
      const action = evt?.payload as TrayAction | undefined;
      if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
      handle(action);
    })
<<<<<<< HEAD
      .then((fn) => { unlisten = fn; })
      .catch(() => { /* ignore */ });
||||||| bc50ba56aa
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
        void invokeDesktop('desktop_tray_actions_ready');
      })
      .catch(() => { /* ignore */ });
=======
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
        void invokeDesktop('desktop_tray_actions_ready');
      })
      .catch(() => {   });
>>>>>>> upstream/main

    return () => {
      try {
        const result = unlisten?.();
        if (result instanceof Promise) void result.catch(() => { });
      } catch {
        // ignore
      }
    };
  }, []);
};
