import { HostRequestError, type GuestLoadState, type GuestSessionRecord, type GuestWorkspaceQuery, type GuestWorkspaceSnapshot, type GuestWorktree } from '@openchamber/sdk';
import type { Session as CanonicalSession } from '@openchamber/agent-contract';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getAllSyncSessionMap, getDirectoryState, getSyncChildStores } from '@/sync/sync-refs';
import { getLinkedIssues, isLinkedChange } from '@/lib/linkedIssues';
import { checkoutHoldsDirectory, checkoutHoldsSubfolder } from '@/lib/worktrees/worktreePaths';
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

/**
 * The Host directories a Guest project covers: its root plus registered
 * worktrees. Guest project ids are settings ids; sessions carry Host project
 * ids and a project-relative display path, so membership is by workspace
 * directory rather than either of those fields.
 */
export const guestProjectDirectories = (projectId: string): ReadonlySet<string> => {
  const project = useProjectsStore.getState().projects.find((entry) => entry.id === projectId);
  if (!project) return new Set();
  const directories = new Set<string>();
  const root = normalizePath(project.path);
  if (root) directories.add(root);
  for (const worktree of guestProjectWorktrees(project.path)) {
    const directory = normalizePath(worktree.path);
    if (directory) directories.add(directory);
  }
  return directories;
};
const toWorktree = (entry: WorktreeMetadata): GuestWorktree => ({
  directory: entry.path, name: entry.name ?? entry.label, branch: entry.branch,
  status: entry.worktreeStatus === 'not-a-repo' ? 'invalid' : entry.worktreeStatus ?? 'ready',
});
const combinedState = (states: GuestLoadState[]): GuestLoadState => states.includes('error') ? 'error' : states.includes('loading') ? 'loading' : 'ready';

const guestItems = (session: CanonicalSession, guestId: string): GuestSessionRecord['items'] => {
  const items: GuestSessionRecord['items'] = [];
  for (const entry of getLinkedIssues(session)) {
    // Only this extension's links are guest data; the host id never leaves the host.
    if (entry.kind !== 'guest' || entry.providerId !== guestId) continue;
    items.push(entry.data === undefined ? { id: entry.identifier } : { id: entry.identifier, data: entry.data });
  }
  return items;
};

const projectSession = (session: CanonicalSession, directory: string, projectId: string, worktrees: ReadonlyMap<string, GuestWorktree>, guestId: string): GuestSessionRecord => {
  const id = session.sessionId;
  const child = getDirectoryState(directory);
  const live = useGlobalSessionStatusStore.getState();
  const observed = live.observedById.get(id);
  const liveStatus = live.statusById.get(id)?.status;
  const attached = useSessionUIStore.getState().worktreeMetadata.get(id);
  const sessionDirectory = normalizePath(directory) ?? directory;
  // A session of a project opened on a folder of its repository runs in that
  // folder of its worktree, so a worktree holds its own sub-folders.
  const holdingRoot = [...worktrees.keys()].filter((root) => checkoutHoldsDirectory(root, sessionDirectory))
    .sort((a, b) => b.length - a.length)[0];
  const attachedRoot = normalizePath(attached?.path);
  const worktree = (holdingRoot ? worktrees.get(holdingRoot) : undefined)
    ?? (attached && attachedRoot && checkoutHoldsDirectory(attachedRoot, sessionDirectory) ? toWorktree(attached) : null);
  let activity: GuestSessionRecord['activity'] = 'unknown';
  if (useConfigStore.getState().isConnected) {
    const childReady = child?.sessionStatusReady === true && child.sessionStatusInvalidated?.[id] !== true;
    activity = liveStatus === 'running' || session.runtimeStatus === 'running' && liveStatus === undefined ? 'running'
      : liveStatus === 'awaiting_approval' || session.runtimeStatus === 'awaiting_approval' && liveStatus === undefined ? 'waiting-permission'
      : liveStatus === 'awaiting_input' || session.runtimeStatus === 'awaiting_input' && liveStatus === undefined ? 'waiting-question'
      : childReady || observed ? 'idle' : 'unknown';
    if (child?.permission[id]?.length) activity = 'waiting-permission';
    else if (child?.form[id]?.length) activity = 'waiting-question';
  }
  // The guest SDK has no cancelled outcome; do not label cancellation a failure.
  const outcome = observed?.outcome;
  return {
    id, title: session.title ?? id, projectId, directory, parentId: session.parentSessionId ?? null,
    createdAt: session.createdAt, updatedAt: session.updatedAt, archivedAt: session.archivedAt ?? null, worktree, activity,
    outcome: activity === 'idle' && (outcome === 'completed' || outcome === 'failed') ? outcome : null,
    items: guestItems(session, guestId),
    links: getLinkedIssues(session).map((item) => ({ title: item.title, url: item.url, kind: isLinkedChange(item) ? 'change' : 'issue', linkedAt: item.linkedAt })),
  };
};

/** Store projection only. Layout-owned sync and topology discovery supply hydration. */
export const readGuestWorkspace = (query: GuestWorkspaceQuery, guestId: string): GuestWorkspaceSnapshot => {
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
  const directories = guestProjectDirectories(query.projectId);
  const manager = getSyncChildStores();
  const global = useGlobalSessionsStore.getState();
  const coverage = [...directories].map((directory) => {
    const bootstrap = manager.getBootstrapState(directory);
    const state: GuestLoadState = bootstrap === 'failed' || global.status === 'error' ? 'error' : global.status === 'ready' ? 'ready' : 'loading';
    return { directory, state };
  });
  const worktreeRoots = worktrees.map((worktree) => normalizePath(worktree.directory) ?? worktree.directory);
  // A session of a project opened on a folder of its repository runs in that
  // folder of its worktree (`<worktree>/ai`), so a worktree holds its sub-folders.
  const belongsToProject = (directory: string): boolean => {
    const key = normalizePath(directory) ?? directory;
    return directories.has(key) || worktreeRoots.some((root) => checkoutHoldsSubfolder(root, key));
  };
  const records = new Map<string, { session: CanonicalSession; directory: string }>();
  for (const session of getAllSyncSessionMap().values()) {
    const directory = resolveGlobalSessionDirectory(session);
    if (directory && belongsToProject(directory)) records.set(session.sessionId, { session, directory });
  }
  const worktreeByPath = new Map(worktrees.map((worktree) => [normalizePath(worktree.directory) ?? worktree.directory, worktree]));
  return { ...query, state: combinedState([topologyState, ...coverage.map((entry) => entry.state)]), coverage, sessions: [...records.values()].map(({ session, directory }) => projectSession(session, directory, query.projectId, worktreeByPath, guestId)) };
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
