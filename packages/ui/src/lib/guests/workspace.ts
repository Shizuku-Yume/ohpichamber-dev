import { HostRequestError, type GuestLoadState, type GuestSessionRecord, type GuestWorkspaceQuery, type GuestWorkspaceSnapshot, type GuestWorktree } from '@openchamber/sdk';
import type { Session as CanonicalSession } from '@openchamber/agent-contract';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getAllSyncSessionMap, getSyncChildStores } from '@/sync/sync-refs';
import { normalizePath } from '@/lib/pathNormalization';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { useUIStore } from '@/stores/useUIStore';
import type { WorktreeMetadata } from '@/types/worktree';

export const guestProject = (projectId: string) => {
  const state = useProjectsStore.getState();
  if (!state.hasServerSnapshot) throw new HostRequestError('HOST_UNAVAILABLE', 'The project registry has not loaded.');
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) throw new HostRequestError('NOT_FOUND', 'Project is not registered.');
  return project;
};
export const guestProjectWorktrees = (directory: string): WorktreeMetadata[] => (
  useSessionUIStore.getState().availableWorktreesByProject.get(normalizePath(directory) ?? directory) ?? []
);
const toWorktree = (entry: WorktreeMetadata): GuestWorktree => ({
  directory: entry.path, name: entry.name ?? entry.label, branch: entry.branch,
  status: entry.worktreeStatus === 'not-a-repo' ? 'invalid' : entry.worktreeStatus ?? 'ready',
});
const combinedState = (states: GuestLoadState[]): GuestLoadState => states.includes('error') ? 'error' : states.includes('loading') ? 'loading' : 'ready';

const projectSession = (session: CanonicalSession, worktrees: ReadonlyMap<string, GuestWorktree>): GuestSessionRecord => {
  const id = session.sessionId;
  const observed = useGlobalSessionStatusStore.getState().observedById.get(id);
  const attached = useSessionUIStore.getState().worktreeMetadata.get(id);
  const worktree = worktrees.get(session.displayPath) ?? (attached && normalizePath(attached.path) === normalizePath(session.displayPath) ? toWorktree(attached) : null);
  let activity: GuestSessionRecord['activity'] = 'unknown';
  if (useConfigStore.getState().isConnected) activity = session.runtimeStatus === 'running' ? 'running' : session.runtimeStatus === 'awaiting_approval' ? 'waiting-permission' : session.runtimeStatus === 'awaiting_input' ? 'waiting-question' : session.runtimeStatus === 'idle' ? 'idle' : 'unknown';
  return { id, title: session.metadata?.title ?? id, projectId: session.projectId, directory: session.displayPath, parentId: session.parentSessionId ?? null, createdAt: session.createdAt, updatedAt: session.updatedAt, archivedAt: session.archivedAt ?? null, worktree, activity, outcome: activity === 'idle' ? observed?.outcome ?? null : null, items: [] };
};

/** Store projection only. Layout-owned sync and topology discovery supply hydration. */
export const readGuestWorkspace = (query: GuestWorkspaceQuery, _guestId: string): GuestWorkspaceSnapshot => {
  const projects = useProjectsStore.getState();
  if (query.kind === 'projects') return {
    kind: 'projects', state: projects.serverSnapshotFailed ? 'error' : projects.hasServerSnapshot ? 'ready' : 'loading',
    projects: projects.hasServerSnapshot ? projects.projects.map((project) => ({ id: project.id, name: project.label || project.path.split('/').pop() || project.path, directory: project.path })) : [],
  };
  const project = projects.projects.find((entry) => entry.id === query.projectId);
  const topology = useSessionUIStore.getState();
  const path = project ? normalizePath(project.path) ?? project.path : '';
  const topologyState = project ? topology.worktreeDiscoveryByProject.get(path) ?? 'loading' : projects.hasServerSnapshot ? 'error' : 'loading';
  const worktrees = project ? guestProjectWorktrees(project.path).map(toWorktree) : [];
  if (query.kind === 'worktrees') return { ...query, state: topologyState, worktrees };
  const directories = new Set(project ? [path, ...worktrees.map((worktree) => normalizePath(worktree.directory) ?? worktree.directory)] : []);
  const manager = getSyncChildStores();
  const global = useGlobalSessionsStore.getState();
  const coverage = [...directories].map((directory) => {
    const bootstrap = manager.getBootstrapState(directory);
    const state: GuestLoadState = bootstrap === 'failed' || global.status === 'error' ? 'error' : global.status === 'ready' ? 'ready' : 'loading';
    return { directory, state };
  });
  const records = new Map<string, CanonicalSession>();
  for (const session of getAllSyncSessionMap().values()) if (session.projectId === query.projectId) records.set(session.sessionId, session);
  const worktreeByPath = new Map(worktrees.map((worktree) => [normalizePath(worktree.directory) ?? worktree.directory, worktree]));
  return { ...query, state: combinedState([topologyState, ...coverage.map((entry) => entry.state)]), coverage, sessions: [...records.values()].map((session) => projectSession(session, worktreeByPath)) };
};

type Observer = { listeners: Set<(snapshot: GuestWorkspaceSnapshot) => void>; snapshot: GuestWorkspaceSnapshot; dispose: () => void };
const observers = new Map<string, Observer>();

/** One projection/subscription set per extension and query, shared by its frames. */
export const observeGuestWorkspace = (query: GuestWorkspaceQuery, guestId: string, listener: (snapshot: GuestWorkspaceSnapshot) => void): (() => void) => {
  const key = JSON.stringify([getRuntimeKey(), guestId, query]);
  let observer = observers.get(key);
  if (!observer) {
    const listeners = new Set<(snapshot: GuestWorkspaceSnapshot) => void>();
    const current: Observer = { listeners, snapshot: readGuestWorkspace(query, guestId), dispose: () => {} };
    let queued = false;
    let disposed = false;
    let serialized = JSON.stringify(current.snapshot);
    const update = () => {
      if (queued || disposed) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (disposed) return;
        const next = readGuestWorkspace(query, guestId);
        const json = JSON.stringify(next);
        if (json === serialized) return;
        serialized = json;
        current.snapshot = next;
        for (const notify of listeners) notify(next);
      });
    };
    const unsubs = [useProjectsStore.subscribe((state, previous) => {
      if (state.projects !== previous.projects || state.hasServerSnapshot !== previous.hasServerSnapshot || state.serverSnapshotFailed !== previous.serverSnapshotFailed) update();
    })];
    if (query.kind !== 'projects') unsubs.push(useSessionUIStore.subscribe((state, previous) => {
      if (state.availableWorktreesByProject !== previous.availableWorktreesByProject || state.worktreeDiscoveryByProject !== previous.worktreeDiscoveryByProject || state.worktreeMetadata !== previous.worktreeMetadata) update();
    }));
    if (query.kind === 'sessions') {
      const manager = getSyncChildStores();
      unsubs.push(
        useGlobalSessionsStore.subscribe((state, previous) => { if (state.activeSessions !== previous.activeSessions || state.archivedSessions !== previous.archivedSessions || state.status !== previous.status) update(); }),
        useGlobalSessionStatusStore.subscribe(update),
        useConfigStore.subscribe((state, previous) => { if (state.isConnected !== previous.isConnected) update(); }),
        manager.subscribeBootstrap(update),
        manager.subscribeAllSelected((state) => state.session, update),
        manager.subscribeAllSelected((state) => state.permission, update),
        manager.subscribeAllSelected((state) => state.form, update),
        manager.subscribeAllSelected((state) => state.sessionStatusReady, update),
        manager.subscribeAllSelected((state) => state.sessionStatusInvalidated, update),
      );
    }
    current.dispose = () => { disposed = true; for (const unsubscribe of unsubs) unsubscribe(); observers.delete(key); };
    unsubs.push(subscribeRuntimeEndpointChanged(current.dispose));
    observers.set(key, current);
    observer = current;
  }
  observer.listeners.add(listener);
  listener(observer.snapshot);
  const current = observer;
  return () => { current.listeners.delete(listener); if (current.listeners.size === 0) current.dispose(); };
};

export const openGuestSession = (sessionId: string): void => {
  const session = getAllSyncSessionMap().get(sessionId) ?? useGlobalSessionsStore.getState().entityById.get(sessionId);
  if (!session?.displayPath) throw new HostRequestError('NO_SESSION', 'Session is not available.');
  useSessionUIStore.getState().setCurrentSession(sessionId, session.displayPath);
  useUIStore.getState().closeMainSurfaces();
};
