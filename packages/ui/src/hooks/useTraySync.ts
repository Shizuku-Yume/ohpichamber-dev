import React from 'react';
import type { Session, SessionRuntimeStatus } from '@openchamber/agent-contract';
import { canUseElectronDesktopIPC, invokeDesktop, isDesktopLocalOriginActive } from '@/lib/desktop';
import { getRuntimeApiBaseUrl } from '@/lib/runtime-switch';
import { desktopHostsGet, getDesktopHostApiUrl, locationMatchesHost, redactSensitiveUrl } from '@/lib/desktopHosts';
import { getSyncChildStores } from '@/sync/sync-refs';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
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
  canSave?: boolean;
  id: string;
  sessionId: string;
  sessionTitle: string;
  label: string;
  directory: string;
};

type TrayUsageRow = { label: string; value: string };
type TrayUsageGroup = { provider: string; account: string | null; rows: TrayUsageRow[]; status: string | null };
type TrayUsage = { mode: 'usage' | 'remaining'; groups: TrayUsageGroup[] };

type TraySnapshot = {
  sessions: TraySession[];
  approvals: TrayApproval[];
  instanceName: string;
  usage: TrayUsage;
  dockBadgeCount: number;
};

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

const trayStatus = (status: SessionRuntimeStatus | undefined): TraySessionStatus =>
  status === 'running' || status === 'awaiting_approval' || status === 'awaiting_input' ? 'busy' : 'idle';

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

const resolveSessionSubtitle = (
  directory: string,
  projects: ProjectEntry[],
  worktreesByProject: Map<string, WorktreeMetadata[]>,
): string => {
  if (!directory) return '';
  const project = resolveProjectForSessionDirectory(projects, worktreesByProject, directory);
  const projectName = project?.label?.trim() || basenameOf(directory);
  const normDir = normalizeProjectPath(directory);

  // Cached Git status and recorded worktree metadata remain independent of
  // canonical session DTOs; the runtime does not expose legacy VCS state.
  let branch = '';
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

// Build the usage groups exactly like the header/mobile: only providers the
// user enabled for the dropdown AND that report as configured. Window rows only
// (the headline limits) — model breakdowns stay in the full UI.
const translateQuota = (key: I18nKey, params?: I18nParams): string =>
  formatMessage(useI18nStore.getState().dictionary, key, params);

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
        ? translateQuota('header.services.noRateLimitsReported')
        : null;
    groups.push({ provider: meta.name, account: null, rows, status });
  }
  return { mode, groups };
};

const resolveInstanceName = async (): Promise<{ kind: 'local' | 'fallback' } | { kind: 'named'; name: string } | null> => {
  try {
    if (isDesktopLocalOriginActive()) return { kind: 'local' };
    const localOrigin = (window as unknown as { __OPENCHAMBER_LOCAL_ORIGIN__?: string }).__OPENCHAMBER_LOCAL_ORIGIN__
      || window.location.origin;
    const runtimeApiBaseUrl = getRuntimeApiBaseUrl();
    if (runtimeApiBaseUrl && locationMatchesHost(runtimeApiBaseUrl, localOrigin)) return { kind: 'local' };
    const cfg = await desktopHostsGet();
    const match = cfg.hosts.find((host) =>
      runtimeApiBaseUrl ? locationMatchesHost(runtimeApiBaseUrl, getDesktopHostApiUrl(host)) : false);
    if (match?.label?.trim()) return { kind: 'named', name: redactSensitiveUrl(match.label.trim()) };
    return { kind: 'fallback' };
  } catch {
    return null;
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
        approvals.push({ kind: 'permission', canSave: request.policyTarget !== undefined, id, sessionId: sid, sessionTitle: '', label: permissionLabel(request), directory });
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
  const allSessions = useGlobalSessionsStore.getState().activeSessions;
  const childrenByParent = new Map<string, string[]>();
  for (const session of allSessions) {
    if (!session?.sessionId) continue;
    if (session.parentSessionId) {
      const siblings = childrenByParent.get(session.parentSessionId) ?? [];
      siblings.push(session.sessionId);
      childrenByParent.set(session.parentSessionId, siblings);
    }
  }

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
    .filter((s) => s?.sessionId && !s.parentSessionId) // root rows; sub-session work rolls up
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
      approvals.push({ kind: 'permission', canSave: request.policyTarget !== undefined, id, sessionId: request.sessionId, sessionTitle, label: permissionLabel(request), directory: pending.directory });
    }
    for (const request of pending.forms) {
      const id = request.questionId;
      if (seen.has(id)) continue;
      seen.add(id);
      approvals.push({ kind: 'form', id, sessionId: request.sessionId, sessionTitle, label: formLabel(request), directory: pending.directory });
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
    let instance: Awaited<ReturnType<typeof resolveInstanceName>> = null;
    const flushNow = () => {
      if (disposed) return;
      const { dictionary } = useI18nStore.getState();
      const instanceName = instance?.kind === 'named' ? instance.name
        : instance?.kind === 'local' ? formatMessage(dictionary, 'tray.instance.local')
          : instance?.kind === 'fallback' ? formatMessage(dictionary, 'tray.instance.fallback') : '';
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
    const unsubscribeLocale = useI18nStore.subscribe((state, previous) => {
      if (state.dictionary !== previous.dictionary) scheduleFlush();
    });
    const unsubscribeUI = useUIStore.subscribe((state, previous) => {
      if (state.dockBadgeEnabled !== previous.dockBadgeEnabled || state.notifyOnSubtasks !== previous.notifyOnSubtasks) {
        scheduleFlush();
      }
    });
    const stopBadgeSync = () => {
      disposed = true;
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      unsubscribeNotif();
      unsubscribeGlobal();
      unsubscribeLocale();
      unsubscribeUI();
    };

    if (!trayEnabled) {
      flushNow();
      return stopBadgeSync;
    }

    void resolveInstanceName().then((name) => {
      if (disposed) return;
      instance = name;
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
      .then((fn) => { unlisten = fn; })
      .catch(() => { /* ignore */ });

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
