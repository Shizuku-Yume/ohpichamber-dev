import { create } from 'zustand';
import type { Session, Subagent } from '@openchamber/agent-contract';
import { SubagentSchema } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { isSessionDiscoveryFailed, registerWorkspaceDirectory, resetWorkspaceDirectories, resolveWorkspaceDirectory, resolveWorkspaceDisplayPath, splitGlobalSessionsByArchived, subscribeWorkspaceDirectories } from '@/stores/globalSessions';
import { normalizePath } from '@/lib/pathNormalization';
import { raiseSessionOrderingBaselines } from '@/sync/session-ordering';
import { mapWithConcurrency } from '@/lib/concurrency';
import {
  persistGlobalSessionSnapshot,
  persistManagedChatSessions,
  readGlobalSessionSnapshot,
  readManagedChatSessions,
} from '@/sync/persist-cache';
import { spaceIdOfDirectory } from '@/lib/spaces/space-route';
import { useSpacesStore } from '@/lib/spaces/spaces-store';
import { ensureChatsRootDirectory, getChatsRoot, isChatDirectoryPath } from '@/lib/chatDirectories';
import { countSyncPerformance } from '@/sync/performance-diagnostics';
import { retry, STARTUP_RETRY } from '@/sync/retry';
import { buildSubagentChildSessionRecord } from './subagentSessionTitle';
import {
  applyGlobalSessionStructureMutations,
  buildGlobalSessionStructure,
  mergeSessionDirectoryMetadata,
  resolveGlobalSessionDirectory,
  type GlobalSessionStructure,
  type GlobalSessionStructureMutation,
} from './globalSessionStructure';

export { mergeSessionDirectoryMetadata, resolveGlobalSessionDirectory } from './globalSessionStructure';

type GlobalSessionsStatus = 'idle' | 'loading' | 'ready' | 'error';

type LoadResult = {
  activeSessions: Session[];
  archivedSessions: Session[];
};

type GlobalSessionMutation =
  | { type: 'upsert'; session: Session }
  | { type: 'remove'; sessionId: string };

type GlobalSessionsState = {
  activeSessions: Session[];
  archivedSessions: Session[];
  entityById: ReadonlyMap<string, Session>;
  structure: GlobalSessionStructure;
  sessionsByDirectory: Map<string, Session[]>;
  reviewTransferBySessionId: Map<string, 'review-to-original' | 'original-to-review'>;
  mutationRevision: number;
  mutationRevisionBySessionId: Map<string, number>;
  hasLoaded: boolean;
  managedChatsHydrated: boolean;
  status: GlobalSessionsStatus;
  /** The global list request itself failed; partial per-scope errors do not set this. */
  globalRefreshFailed: boolean;
  discoveryErrors: ReadonlyMap<string, string>;
  failedChildDiscoveryParents: ReadonlySet<string>;
  clearWorkspaceDiscoveryErrors: (workspaceId: string) => void;
  /** Re-read the persisted managed-chats snapshot after the chats root is
      warm; retain newer mutations and stop after an authoritative load. */
  rehydrateManagedChatSessions: () => void;
  loadSessions: (fallbackActive?: Session[]) => Promise<LoadResult>;
  /**
   * The cheap pass between full loads: a fresh list, applied as mutations so a
   * reply that arrived elsewhere shows up without waiting for the next full
   * snapshot. It removes nothing, because a list that does not mention a
   * session is not the authority for a child's or an archived one's absence.
   */
  refreshSessionHead: () => Promise<boolean>;
  refreshSessionsForDirectories: (directories: Iterable<string>, fallbackActive?: Session[]) => Promise<LoadResult>;
  applySnapshot: (activeSessions: Session[], archivedSessions: Session[], status?: GlobalSessionsStatus) => void;
  applySessionMutations: (mutations: readonly GlobalSessionMutation[]) => void;
  noteDeferredSessionUpdate: (sessionId: string) => void;
  upsertSession: (session: Session) => void;
  upsertSessions: (sessions: Session[]) => void;
  upsertSubagents: (parent: Session, children: readonly Subagent[]) => void;
  removeSessions: (ids: Iterable<string>) => void;
  archiveSessions: (ids: Iterable<string>, archivedAt?: number) => void;
  resetForRuntimeSwitch: () => void;
};

const DIRECTORY_SESSION_REFRESH_CONCURRENCY = 2;
let directorySessionRefreshActive = 0;
const directorySessionRefreshWaiters: Array<() => void> = [];

const withDirectorySessionRefreshSlot = async <T>(task: () => Promise<T>): Promise<T> => {
  if (directorySessionRefreshActive >= DIRECTORY_SESSION_REFRESH_CONCURRENCY) {
    await new Promise<void>((resolve) => directorySessionRefreshWaiters.push(resolve));
  } else {
    directorySessionRefreshActive += 1;
  }
  try {
    return await task();
  } finally {
    const next = directorySessionRefreshWaiters.shift();
    if (next) next();
    else directorySessionRefreshActive = Math.max(0, directorySessionRefreshActive - 1);
  }
};

let inflightLoad: Promise<LoadResult> | null = null;
let inflightHead: Promise<boolean> | null = null;
// Bumped on runtime switch: an in-flight load from the previous instance must
// not apply its (stale) snapshot after the reset.
let loadGeneration = 0;
let completeLoadAt = 0;

type ChildDiscovery = { sessions: Session[]; succeededParents: Set<string>; failedParents: Set<string> };

// Children have history, but no snapshot or Host metadata endpoint. These stable
// host records provide sidebar identity and routing, not a child event cursor.
const discoverChildSessions = async (roots: readonly Session[], known: ReadonlyMap<string, Session>, generation: number): Promise<ChildDiscovery> => {
  const sessions: Session[] = [];
  const succeededParents = new Set<string>();
  const failedParents = new Set<string>();
  const rootIds = new Set(roots.map((root) => root.sessionId));
  const owners = new Map<string, string>();
  await mapWithConcurrency(roots.filter((root) => !root.parentSessionId && root.archivedAt === undefined), DIRECTORY_SESSION_REFRESH_CONCURRENCY, async (root) => {
    if (generation !== loadGeneration) return;
    try {
      const records = await withDirectorySessionRefreshSlot(() => {
        if (generation !== loadGeneration) throw new Error('Runtime changed before child discovery');
        return canonicalClient.listSubagents(root.sessionId);
      });
      if (generation !== loadGeneration) return;
      const children: Session[] = [];
      for (const record of records) {
        const child = SubagentSchema.parse(record);
        if (child.childSessionId === undefined) continue;
        const previous = known.get(child.childSessionId);
        const owner = owners.get(child.childSessionId);
        if (child.parentSessionId !== root.sessionId || rootIds.has(child.childSessionId)
          || owner !== undefined
          || (previous && previous.parentSessionId !== root.sessionId)) continue;
        children.push(buildSubagentChildSessionRecord(root, child));
        owners.set(child.childSessionId, root.sessionId);
      }
      sessions.push(...children);
      succeededParents.add(root.sessionId);
    } catch {
      failedParents.add(root.sessionId);
    }
  });
  return { sessions, succeededParents, failedParents };
};

const bindKnownWorkspaceDirectories = async (generation: number): Promise<{
  projectRootsById: Map<string, string>;
  /** The store action itself, called once the discovery snapshot has committed. */
  adoptGuessedSession: () => void;
}> => {
  const [{ useProjectsStore }, { useSessionUIStore }, { useDirectoryStore }] = await Promise.all([
    import('@/stores/useProjectsStore'), import('@/sync/session-ui-store'), import('@/stores/useDirectoryStore'),
  ]);
  const projectRootsById = new Map<string, string>();
  const adoptGuessedSession = useSessionUIStore.getState().adoptAuthoritativeSessionDirectory;
  if (generation !== loadGeneration) return { projectRootsById, adoptGuessedSession };
  const directoryState = useDirectoryStore.getState();
  const sessionState = useSessionUIStore.getState();
  const chatsRoot = getChatsRoot();
  const projectPaths = normalizeDirectorySet(useProjectsStore.getState().projects.map((project) => project.path));
  const candidates = normalizeDirectorySet([
    directoryState.currentDirectory,
    ...directoryState.directoryHistory,
    ...projectPaths,
    ...[...sessionState.availableWorktreesByProject.values()].flatMap((worktrees) => worktrees.map((worktree) => worktree.path)),
    ...[...sessionState.worktreeMetadata.values()].map((worktree) => worktree.path),
    ...(chatsRoot ? [chatsRoot] : []),
  ]);
  // A failed workspace list only means no derived directories this pass; the
  // candidate loop below still admits every directory it can resolve.
  const listedWorkspacesPromise = canonicalClient.listWorkspaces().catch(() => null);
  await mapWithConcurrency([...candidates], DIRECTORY_SESSION_REFRESH_CONCURRENCY, async (directory) => {
    if (generation !== loadGeneration) return;
    try {
      const workspace = await withDirectorySessionRefreshSlot(() => {
        if (generation !== loadGeneration) throw new Error('Runtime changed before workspace resolution');
        return canonicalClient.resolveWorkspace(directory);
      });
      if (generation !== loadGeneration) return;
      if (resolveWorkspaceDirectory(workspace.workspaceId) === null) {
        registerWorkspaceDirectory(workspace.workspaceId, directory);
      }
      if (workspace.displayPath === '.' || (workspace.displayPath === undefined && (directory === chatsRoot || projectPaths.has(directory)))) {
        projectRootsById.set(workspace.projectId, directory);
      }
    } catch {
      // A candidate is only a hint. Failed admission grants no path binding;
      // independently successful native session discovery remains usable.
    }
  });
  const listedWorkspaces = await listedWorkspacesPromise;
  if (generation === loadGeneration && listedWorkspaces) {
    const derived = new Map<string, string>();
    for (const ws of listedWorkspaces.items) {
      if (resolveWorkspaceDirectory(ws.workspaceId) !== null) continue;
      if (!ws.displayPath || ws.displayPath === '.') continue;
      const root = projectRootsById.get(ws.projectId);
      if (!root) continue;
      const directory = resolveWorkspaceDisplayPath(root, ws.displayPath);
      if (directory && !candidates.has(directory)) derived.set(ws.workspaceId, directory);
    }
    if (derived.size > 0) {
      await mapWithConcurrency([...derived.entries()], DIRECTORY_SESSION_REFRESH_CONCURRENCY, async ([expectedWorkspaceId, directory]) => {
        if (generation !== loadGeneration) return;
        try {
          const workspace = await withDirectorySessionRefreshSlot(() => {
            if (generation !== loadGeneration) throw new Error('Runtime changed before workspace resolution');
            return canonicalClient.resolveWorkspace(directory);
          });
          if (generation === loadGeneration && workspace.workspaceId === expectedWorkspaceId && resolveWorkspaceDirectory(workspace.workspaceId) === null) {
            registerWorkspaceDirectory(workspace.workspaceId, directory);
          }
        } catch {
          // Unreachable derived workspace stays unbound without failing sibling workspaces.
        }
      });
    }
  }
  return { projectRootsById, adoptGuessedSession };
};

const bindDerivedSessionWorkspaces = async (
  sessions: readonly Session[],
  projectRootsById: ReadonlyMap<string, string>,
  generation: number,
): Promise<void> => {
  if (generation !== loadGeneration || projectRootsById.size === 0) return;
  const derived = new Map<string, string>();
  for (const session of sessions) {
    if (resolveWorkspaceDirectory(session.workspaceId) !== null) continue;
    if (!session.displayPath || session.displayPath === '.' || session.displayPath === 'workspace') continue;
    const root = projectRootsById.get(session.projectId);
    if (!root) continue;
    const directory = resolveWorkspaceDisplayPath(root, session.displayPath);
    if (directory) derived.set(session.workspaceId, directory);
  }
  if (derived.size === 0) return;
  await mapWithConcurrency([...derived.entries()], DIRECTORY_SESSION_REFRESH_CONCURRENCY, async ([expectedWorkspaceId, directory]) => {
    if (generation !== loadGeneration) return;
    try {
      const workspace = await withDirectorySessionRefreshSlot(() => {
        if (generation !== loadGeneration) throw new Error('Runtime changed before workspace resolution');
        return canonicalClient.resolveWorkspace(directory);
      });
      if (generation === loadGeneration && workspace.workspaceId === expectedWorkspaceId && resolveWorkspaceDirectory(workspace.workspaceId) === null) {
        registerWorkspaceDirectory(workspace.workspaceId, directory);
      }
    } catch {
      // Unreachable derived session workspace stays unbound without failing discovery.
    }
  });
};

const buildSessionsByDirectory = (sessions: Session[]): Map<string, Session[]> => {
  const next = new Map<string, Session[]>();
  for (const session of sessions) {
    const directory = resolveGlobalSessionDirectory(session);
    if (!directory) {
      continue;
    }
    const existing = next.get(directory);
    if (existing) {
      existing.push(session);
      continue;
    }
    next.set(directory, [session]);
  }
  return next;
};

const getSessionSignature = (session: Session): string => JSON.stringify(session);

const readPersistedSessionSeed = (): Session[] => {
  const chats = readManagedChatSessions();
  const chatIds = new Set(chats.map((session) => session.sessionId));
  const others = readGlobalSessionSnapshot().filter((session) => !chatIds.has(session.sessionId));
  return sortSessionsByUpdated([...chats, ...others]);
};

const isSameSessionRecord = (existing: Session, incoming: Session): boolean => (
  existing === incoming || getSessionSignature(existing) === getSessionSignature(incoming)
);

const sameSessionList = (prev: Session[], next: Session[]): boolean => {
  if (prev === next) {
    return true;
  }
  if (prev.length !== next.length) {
    return false;
  }
  for (let index = 0; index < prev.length; index += 1) {
    if (!isSameSessionRecord(prev[index], next[index])) {
      return false;
    }
  }
  return true;
};

const getSessionUpdatedAt = (session: Session): number => {
  const updatedAt = session.updatedAt;
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }
  const createdAt = session.createdAt;
  return Number.isFinite(createdAt) ? createdAt : 0;
};

const sortSessionsByUpdated = (sessions: Session[]): Session[] => {
  return [...sessions].sort((left, right) => {
    const timeDelta = getSessionUpdatedAt(right) - getSessionUpdatedAt(left);
    if (timeDelta !== 0) return timeDelta;
    return right.sessionId.localeCompare(left.sessionId);
  });
};

const normalizeDirectorySet = (directories: Iterable<string>): Set<string> => {
  const next = new Set<string>();
  for (const directory of directories) {
    const normalized = normalizePath(directory);
    if (normalized && (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized))) next.add(normalized);
  }
  return next;
};

const replaceSessionsForDirectories = (
  existing: Session[],
  incoming: Session[],
  directories: Set<string>,
  failures: Readonly<Record<string, string>>,
): Session[] => {

  const existingById = new Map(existing.map((session) => [session.sessionId, session]));
  const incomingById = new Map<string, Session>();

  for (const session of incoming) {
    incomingById.set(session.sessionId, mergeSessionDirectoryMetadata(session, existingById.get(session.sessionId)));
  }

  const kept = existing.filter((session) => {
    if (incomingById.has(session.sessionId)) return false;
    const directory = resolveGlobalSessionDirectory(session);
    return !directory || !directories.has(directory) || isSessionDiscoveryFailed(session, failures);
  });

  return sortSessionsByUpdated([...incomingById.values(), ...kept]);
};

type DirectoryPageResult = {
  directories: Set<string>;
  sessions: Session[];
  errors: unknown[];
  failures: Record<string, string>;
};

const fetchDirectoryPages = async (
  directories: Set<string>,
): Promise<DirectoryPageResult> => {
  const generation = loadGeneration;
  const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
  const currentDirectory = normalizePath(useDirectoryStore.getState().currentDirectory);
  const orderedDirectories = [...directories].sort((left, right) => {
    if (left === currentDirectory) return -1;
    if (right === currentDirectory) return 1;
    return left.localeCompare(right);
  });
  const results = await mapWithConcurrency(orderedDirectories, DIRECTORY_SESSION_REFRESH_CONCURRENCY, async (directory) => {
    try {
      const workspace = await withDirectorySessionRefreshSlot(() => {
        if (generation !== loadGeneration) throw new Error('Runtime changed before workspace resolution');
        return canonicalClient.resolveWorkspace(directory);
      });
      if (generation !== loadGeneration) throw new Error('Runtime changed during workspace resolution');
      registerWorkspaceDirectory(workspace.workspaceId, directory);
      const result = await withDirectorySessionRefreshSlot(() => {
        if (generation !== loadGeneration) throw new Error('Runtime changed before session discovery');
        return canonicalClient.listSessions(workspace.workspaceId);
      });
      if (generation === loadGeneration && Object.keys(result.errors).length === 0) {
        useGlobalSessionsStore.getState().clearWorkspaceDiscoveryErrors(workspace.workspaceId);
      }
      return { status: 'fulfilled' as const, value: { directory, ...result } };
    } catch (reason) {
      return { status: 'rejected' as const, reason };
    }
  });

  const fulfilledDirectories = new Set<string>();
  const sessions: Session[] = [];
  const errors: unknown[] = [];
  const failures: Record<string, string> = {};

  for (const result of results) {
    if (result.status === 'fulfilled') {
      fulfilledDirectories.add(result.value.directory);
      Object.assign(failures, result.value.errors);
      if (Object.keys(result.value.errors).length > 0) errors.push(result.value.errors);
      sessions.push(...result.value.items);
    } else {
      errors.push(result.reason);
    }
  }

  return { directories: fulfilledDirectories, sessions, errors, failures };
};

const upsertSessionIntoList = (sessions: Session[], session: Session): Session[] => {
  const index = sessions.findIndex((candidate) => candidate.sessionId === session.sessionId);
  if (index === -1) {
    return [session, ...sessions];
  }
  const mergedSession = mergeSessionDirectoryMetadata(session, sessions[index]);
  if (isSameSessionRecord(sessions[index], mergedSession)) {
    return sessions;
  }
  const next = [...sessions];
  next[index] = mergedSession;
  return next;
};


const addUnlistedLiveSessions = (active: Session[], archived: Session[], live?: Session[]): Session[] => {
  if (!live || live.length === 0) return active;
  const listed = new Set([...active, ...archived].map((session) => session.sessionId));
  const unlisted = live.filter((session) => {
    if (session.archivedAt !== undefined) return false;
    if (listed.has(session.sessionId)) return false;
    listed.add(session.sessionId);
    return true;
  });
  return unlisted.length > 0 ? [...active, ...unlisted] : active;
};

const applySnapshot = (
  state: GlobalSessionsState,
  activeSessions: Session[],
  archivedSessions: Session[],
  status: GlobalSessionsStatus,
  markLoaded = status === 'ready',
  discoveryErrors = state.discoveryErrors,
): Partial<GlobalSessionsState> | GlobalSessionsState => {
  activeSessions = activeSessions.map((session) => {
    const previous = state.entityById.get(session.sessionId);
    return previous && isSameSessionRecord(previous, session) ? previous : session;
  });
  archivedSessions = archivedSessions.map((session) => {
    const previous = state.entityById.get(session.sessionId);
    return previous && isSameSessionRecord(previous, session) ? previous : session;
  });
  const nextActiveSessions = sameSessionList(state.activeSessions, activeSessions)
    ? state.activeSessions
    : activeSessions;
  const nextArchivedSessions = sameSessionList(state.archivedSessions, archivedSessions)
    ? state.archivedSessions
    : archivedSessions;
  const sessionsChanged = nextActiveSessions !== state.activeSessions
    || nextArchivedSessions !== state.archivedSessions;
  const nextEntityById = sessionsChanged
    ? new Map([...nextActiveSessions, ...nextArchivedSessions].map((session) => [session.sessionId, session]))
    : state.entityById;
  const nextStructure = nextActiveSessions !== state.activeSessions
    ? buildGlobalSessionStructure(nextActiveSessions)
    : state.structure;
  const nextSessionsByDirectory = nextActiveSessions === state.activeSessions
    ? state.sessionsByDirectory
    : buildSessionsByDirectory(nextActiveSessions);
  const nextReviewTransferMap = nextActiveSessions === state.activeSessions
    ? state.reviewTransferBySessionId
    : buildReviewTransferMap(nextActiveSessions);

  if (
    nextActiveSessions === state.activeSessions
    && nextArchivedSessions === state.archivedSessions
    && nextSessionsByDirectory === state.sessionsByDirectory
    && nextReviewTransferMap === state.reviewTransferBySessionId
    && (state.hasLoaded || !markLoaded)
    && state.status === status
    && state.discoveryErrors === discoveryErrors
  ) {
    return state;
  }

  return {
    activeSessions: nextActiveSessions,
    archivedSessions: nextArchivedSessions,
    entityById: nextEntityById,
    structure: nextStructure,
    sessionsByDirectory: nextSessionsByDirectory,
    reviewTransferBySessionId: nextReviewTransferMap,
    hasLoaded: markLoaded ? true : state.hasLoaded,
    status,
    discoveryErrors,
  };
};


const overlayMutationsSince = (
  state: GlobalSessionsState,
  activeSessions: Session[],
  archivedSessions: Session[],
  baselineRevision: number,
): LoadResult => {
  const affectedIds = new Set<string>();
  for (const [sessionId, revision] of state.mutationRevisionBySessionId) {
    if (revision > baselineRevision) affectedIds.add(sessionId);
  }
  if (affectedIds.size === 0) return { activeSessions, archivedSessions };

  const currentActive = new Map(state.activeSessions.map((session) => [session.sessionId, session]));
  const currentArchived = new Map(state.archivedSessions.map((session) => [session.sessionId, session]));
  const incoming = new Map([...activeSessions, ...archivedSessions].map((session) => [session.sessionId, session]));
  let nextActive = activeSessions.filter((session) => !affectedIds.has(session.sessionId));
  let nextArchived = archivedSessions.filter((session) => !affectedIds.has(session.sessionId));
  for (const sessionId of affectedIds) {
    const current = currentActive.get(sessionId) ?? currentArchived.get(sessionId);
    if (!current) continue;
    const merged = mergeSessionDirectoryMetadata(current, incoming.get(sessionId));
    if (merged.archivedAt === undefined) nextActive = upsertSessionIntoList(nextActive, merged);
    else nextArchived = upsertSessionIntoList(nextArchived, merged);
  }
  return { activeSessions: nextActive, archivedSessions: nextArchived };
};

const mutationRevisionPatch = (state: GlobalSessionsState, ids: Iterable<string>) => {
  const mutationRevision = state.mutationRevision + 1;
  const mutationRevisionBySessionId = new Map(state.mutationRevisionBySessionId);
  for (const id of ids) mutationRevisionBySessionId.set(id, mutationRevision);
  return { mutationRevision, mutationRevisionBySessionId };
};

const materializeChangedSessionList = (
  previous: readonly Session[],
  memberIds: ReadonlySet<string>,
  additions: ReadonlySet<string>,
  entityById: ReadonlyMap<string, Session>,
): Session[] => {
  const additionsInDisplayOrder = [...additions].reverse();
  const addedIds = new Set(additionsInDisplayOrder);
  const next = additionsInDisplayOrder.flatMap((sessionId) => {
    const session = entityById.get(sessionId);
    return session && memberIds.has(sessionId) ? [session] : [];
  });
  for (const previousSession of previous) {
    if (!memberIds.has(previousSession.sessionId) || addedIds.has(previousSession.sessionId)) continue;
    const session = entityById.get(previousSession.sessionId);
    if (session) next.push(session);
  }
  return next;
};

const updateSessionsByDirectory = (
  previous: Map<string, Session[]>,
  previousStructure: GlobalSessionStructure,
  nextStructure: GlobalSessionStructure,
  entityById: ReadonlyMap<string, Session>,
  mutations: readonly GlobalSessionStructureMutation[],
): Map<string, Session[]> => {
  const affectedDirectories = new Set<string>();
  const entityChangedDirectories = new Set<string>();
  for (const mutation of mutations) {
    const previousDirectory = mutation.previous && mutation.previous.archivedAt === undefined
      ? resolveGlobalSessionDirectory(mutation.previous)
      : null;
    const nextDirectory = mutation.next && mutation.next.archivedAt === undefined
      ? resolveGlobalSessionDirectory(mutation.next)
      : null;
    if (previousDirectory) affectedDirectories.add(previousDirectory);
    if (nextDirectory) {
      affectedDirectories.add(nextDirectory);
      entityChangedDirectories.add(nextDirectory);
    }
  }
  if (affectedDirectories.size === 0) return previous;

  let next: Map<string, Session[]> | null = null;
  for (const directory of affectedDirectories) {
    const previousIds = previousStructure.activeIdsByDirectory.get(directory);
    const nextIds = nextStructure.activeIdsByDirectory.get(directory);
    if (previousIds === nextIds && !entityChangedDirectories.has(directory)) continue;
    next ??= new Map(previous);
    if (!nextIds || nextIds.length === 0) {
      next.delete(directory);
      continue;
    }
    next.set(directory, nextIds.flatMap((sessionId) => {
      const session = entityById.get(sessionId);
      return session ? [session] : [];
    }));
  }
  return next ?? previous;
};

const applySessionMutations = (
  state: GlobalSessionsState,
  requestedMutations: readonly GlobalSessionMutation[],
): Partial<GlobalSessionsState> => {
  const mutations = requestedMutations;
  const revisionPatch = mutationRevisionPatch(state, mutations.map((mutation) => (
    mutation.type === 'upsert' ? mutation.session.sessionId : mutation.sessionId
  )));
  let nextEntityById: Map<string, Session> | null = null;
  const activeIds = new Set(state.activeSessions.map((session) => session.sessionId));
  const archivedIds = new Set(state.archivedSessions.map((session) => session.sessionId));
  const activeAdditions = new Set<string>();
  const archivedAdditions = new Set<string>();
  const structureMutations: GlobalSessionStructureMutation[] = [];
  let activeChanged = false;
  let archivedChanged = false;

  const addMember = (ids: Set<string>, additions: Set<string>, sessionId: string): void => {
    if (ids.has(sessionId)) return;
    ids.add(sessionId);
    additions.delete(sessionId);
    additions.add(sessionId);
  };
  const removeMember = (ids: Set<string>, additions: Set<string>, sessionId: string): void => {
    ids.delete(sessionId);
    additions.delete(sessionId);
  };

  for (const mutation of mutations) {
    const sessionId = mutation.type === 'upsert' ? mutation.session.sessionId : mutation.sessionId;
    const existingSession = (nextEntityById ?? state.entityById).get(sessionId) ?? null;
    if (mutation.type === 'remove') {
      if (!existingSession) continue;
      nextEntityById ??= new Map(state.entityById);
      nextEntityById.delete(sessionId);
      structureMutations.push({ sessionId, previous: existingSession, next: null });
      if (existingSession.archivedAt !== undefined) {
        archivedChanged = true;
        removeMember(archivedIds, archivedAdditions, sessionId);
      } else {
        activeChanged = true;
        removeMember(activeIds, activeAdditions, sessionId);
      }
      continue;
    }

    const sessionWithMetadata = mergeSessionDirectoryMetadata(mutation.session, existingSession);
    if (existingSession && isSameSessionRecord(existingSession, sessionWithMetadata)) continue;
    nextEntityById ??= new Map(state.entityById);
    nextEntityById.set(sessionId, sessionWithMetadata);
    structureMutations.push({ sessionId, previous: existingSession, next: sessionWithMetadata });
    const isArchived = sessionWithMetadata.archivedAt !== undefined;
    const wasArchived = existingSession !== null && existingSession.archivedAt !== undefined;
    if (existingSession) {
      if (wasArchived) archivedChanged = true;
      else activeChanged = true;
    }
    if (isArchived) {
      archivedChanged = true;
      removeMember(activeIds, activeAdditions, sessionId);
      addMember(archivedIds, archivedAdditions, sessionId);
    } else {
      activeChanged = true;
      removeMember(archivedIds, archivedAdditions, sessionId);
      addMember(activeIds, activeAdditions, sessionId);
    }
  }

  if (!nextEntityById) {
    return revisionPatch;
  }
  const nextActiveSessions = activeChanged
    ? materializeChangedSessionList(state.activeSessions, activeIds, activeAdditions, nextEntityById)
    : state.activeSessions;
  const nextArchivedSessions = archivedChanged
    ? materializeChangedSessionList(state.archivedSessions, archivedIds, archivedAdditions, nextEntityById)
    : state.archivedSessions;
  const nextStructure = applyGlobalSessionStructureMutations(state.structure, structureMutations);

  return {
    activeSessions: nextActiveSessions,
    archivedSessions: nextArchivedSessions,
    entityById: nextEntityById,
    structure: nextStructure,
    sessionsByDirectory: updateSessionsByDirectory(
      state.sessionsByDirectory,
      state.structure,
      nextStructure,
      nextEntityById,
      structureMutations,
    ),
    reviewTransferBySessionId: nextActiveSessions === state.activeSessions
      ? state.reviewTransferBySessionId
      : buildReviewTransferMap(nextActiveSessions),
    ...revisionPatch,
  };
};

const buildReviewTransferMap = (sessions: Session[]): GlobalSessionsState['reviewTransferBySessionId'] => {
  const next: GlobalSessionsState['reviewTransferBySessionId'] = new Map();
  const activeIds = new Set(sessions.map((session) => session.sessionId));
  for (const session of sessions) {
    const metadata = session.metadata?.openchamber;
    const target = metadata?.kind === 'review' ? metadata.originalSessionID : metadata?.reviewSessionID;
    if (!target || !activeIds.has(target)) continue;
    next.set(session.sessionId, metadata?.kind === 'review' ? 'review-to-original' : 'original-to-review');
  }
  return next;
};

const buildManagedChatSessionsState = (sessions: Session[], archivedSessions: Session[] = []) => ({
  activeSessions: sessions,
  archivedSessions,
  entityById: new Map([...sessions, ...archivedSessions].map((session) => [session.sessionId, session])),
  structure: buildGlobalSessionStructure(sessions),
  sessionsByDirectory: buildSessionsByDirectory(sessions),
  reviewTransferBySessionId: buildReviewTransferMap(sessions),
});

const initialState = buildManagedChatSessionsState(readPersistedSessionSeed());

export const useGlobalSessionsStore = create<GlobalSessionsState>((set, get) => ({
  ...initialState,
  mutationRevision: 0,
  mutationRevisionBySessionId: new Map(),
  hasLoaded: false,
  managedChatsHydrated: false,
  status: 'idle',
  globalRefreshFailed: false,
  discoveryErrors: new Map(),
  failedChildDiscoveryParents: new Set(),

  applySnapshot: (activeSessions, archivedSessions, status = 'ready') => {
    raiseSessionOrderingBaselines(activeSessions);
    set((state) => {
      const next = applySnapshot(state, activeSessions, archivedSessions, status);
      return status === 'error' ? next : { ...next, globalRefreshFailed: false };
    });
  },

  applySessionMutations: (mutations) => {
    if (mutations.length === 0) return;
    set((state) => applySessionMutations(state, mutations));
  },

  noteDeferredSessionUpdate: (sessionId) => {
    set((state) => mutationRevisionPatch(state, [sessionId]));
  },

  rehydrateManagedChatSessions: () => {
    const state = get();
    if (state.managedChatsHydrated || state.hasLoaded) return;
    const hydrated = overlayMutationsSince(state, readPersistedSessionSeed(), state.archivedSessions, 0);
    const unchanged = sameSessionList(hydrated.activeSessions, state.activeSessions)
      && sameSessionList(hydrated.archivedSessions, state.archivedSessions);
    set(unchanged
      ? { managedChatsHydrated: true }
      : { ...buildManagedChatSessionsState(hydrated.activeSessions, hydrated.archivedSessions), managedChatsHydrated: true });
  },

  resetForRuntimeSwitch: () => {
    loadGeneration += 1;
    completeLoadAt = 0;
    inflightLoad = null;
    inflightHead = null;
    resetWorkspaceDirectories();
    set({
      ...buildManagedChatSessionsState(readPersistedSessionSeed()),
      mutationRevision: 0,
      mutationRevisionBySessionId: new Map(),
      hasLoaded: false,
      managedChatsHydrated: false,
      status: 'idle',
      globalRefreshFailed: false,
      discoveryErrors: new Map(),
      failedChildDiscoveryParents: new Set(),
    });
  },

  loadSessions: async (fallbackActive) => {
    if (inflightLoad) {
      return inflightLoad;
    }

    const generation = loadGeneration;
    const baselineRevision = get().mutationRevision;
    const loadPromise = (async () => {
      let rootsReady = false;
      try {
        await ensureChatsRootDirectory();
        if (generation !== loadGeneration) return { activeSessions: [], archivedSessions: [] };
        rootsReady = true;
        get().rehydrateManagedChatSessions();
        let attempt = 0;
        return await retry(async () => {
          if (generation !== loadGeneration) throw new Error('Runtime changed before session discovery');
          attempt += 1;
          const result = await canonicalClient.listSessions();
          const retryPartial = attempt < (STARTUP_RETRY.attempts ?? 3)
            && Object.values(result.errors).some((code) => code === 'SERVICE_UNAVAILABLE');
          if (generation !== loadGeneration) return { activeSessions: [], archivedSessions: [] };
          const binding = await bindKnownWorkspaceDirectories(generation);

          if (generation !== loadGeneration) {
            // Runtime switched mid-load: this snapshot belongs to the previous
            // instance — drop it.
            return { activeSessions: [], archivedSessions: [] };
          }
          await bindDerivedSessionWorkspaces(result.items, binding.projectRootsById, generation);
          if (generation !== loadGeneration) return { activeSessions: [], archivedSessions: [] };
          const children = await discoverChildSessions(result.items, get().entityById, generation);
          if (generation !== loadGeneration) return { activeSessions: [], archivedSessions: [] };
          set((state) => {
            const incoming = [...result.items, ...children.sessions];
            const incomingIds = new Set(incoming.map((session) => session.sessionId));
            const retained = [...state.activeSessions, ...state.archivedSessions].filter((session) => (
              !incomingIds.has(session.sessionId) && (isSessionDiscoveryFailed(session, result.errors)
                || (session.parentSessionId !== undefined && (children.failedParents.has(session.parentSessionId)
                  || isSessionDiscoveryFailed(state.entityById.get(session.parentSessionId) ?? session, result.errors))))
            ));
            const { active, archived } = splitGlobalSessionsByArchived([
              ...incoming.map((session) => mergeSessionDirectoryMetadata(session, state.entityById.get(session.sessionId))),
              ...retained,
            ]);
            const reconciled = overlayMutationsSince(state, active, archived, baselineRevision);
            const newErrors = new Map<string, string>(Object.entries(result.errors)
              .filter(([, code]) => !retryPartial || code !== 'SERVICE_UNAVAILABLE'));
            const retainedIds = new Set([...reconciled.activeSessions, ...reconciled.archivedSessions].map((session) => session.sessionId));
            const failedChildDiscoveryParents = new Set([...state.failedChildDiscoveryParents]
              .filter((parentId) => retainedIds.has(parentId) && !children.succeededParents.has(parentId)));
            for (const parentId of children.failedParents) failedChildDiscoveryParents.add(parentId);
            for (const parentId of failedChildDiscoveryParents) newErrors.set(parentId, 'SERVICE_UNAVAILABLE');
            // Complete scopes reconcile during warmup; failed scopes retain their records.
            return {
              ...applySnapshot(state, reconciled.activeSessions, reconciled.archivedSessions, retryPartial ? 'loading' : 'ready', !retryPartial || state.hasLoaded, newErrors),
              failedChildDiscoveryParents,
              globalRefreshFailed: false,
            };
          });
          const committed = get();
          raiseSessionOrderingBaselines(committed.activeSessions);
          if (retryPartial) throw Object.assign(new Error('Session discovery is temporarily unavailable'), { status: 503 });
          completeLoadAt = committed.discoveryErrors.size === 0 ? Date.now() : 0;
          binding.adoptGuessedSession();
          return { activeSessions: committed.activeSessions, archivedSessions: committed.archivedSessions };
        }, STARTUP_RETRY);
      } catch (error) {
        if (generation !== loadGeneration) {
          return { activeSessions: [], archivedSessions: [] };
        }
        if (!rootsReady) {
          // No classification authority arrived. Preserve both memory and the
          // persisted snapshot so a retry can hydrate it after root recovery.
          set({ status: 'error', globalRefreshFailed: true });
          const state = get();
          return { activeSessions: state.activeSessions, archivedSessions: state.archivedSessions };
        }
        console.warn('[GlobalSessions] Failed to load sessions, using fallback snapshot:', error);
        set((state) => {
          const reconciled = overlayMutationsSince(
            state,
            addUnlistedLiveSessions(state.activeSessions, state.archivedSessions, fallbackActive),
            state.archivedSessions,
            baselineRevision,
          );
          return {
            ...applySnapshot(state, reconciled.activeSessions, reconciled.archivedSessions, 'error'),
            globalRefreshFailed: true,
          };
        });
        const committed = get();
        return { activeSessions: committed.activeSessions, archivedSessions: committed.archivedSessions };
      }
    })();

    inflightLoad = loadPromise;
    set({ status: 'loading' });
    const clearInflightLoad = () => {
      if (inflightLoad === loadPromise) {
        inflightLoad = null;
      }
    };
    void loadPromise.then(clearInflightLoad, clearInflightLoad);
    return loadPromise;
  },

  refreshSessionHead: async () => {
    if (inflightLoad) {
      await inflightLoad;
      return get().status === 'ready';
    }
    if (inflightHead) return inflightHead;
    // Only a complete load establishes the baseline this pass compares to.
    if (!get().hasLoaded || get().failedChildDiscoveryParents.size > 0) {
      await get().loadSessions();
      return get().status === 'ready';
    }
    const generation = loadGeneration;
    const baselineRevision = get().mutationRevision;
    const headPromise = (async () => {
      try {
        const result = await canonicalClient.listSessions();
        if (generation !== loadGeneration) return false;
        set((state) => {
          const mutations: GlobalSessionMutation[] = [];
          for (const session of result.items) {
            const existing = state.entityById.get(session.sessionId);
            const mutated = (state.mutationRevisionBySessionId.get(session.sessionId) ?? 0) > baselineRevision;
            if (mutated && !existing) continue;
            const merged = mutated && existing
              ? mergeSessionDirectoryMetadata(existing, session)
              : mergeSessionDirectoryMetadata(session, existing);
            if (!existing || !isSameSessionRecord(existing, merged)) mutations.push({ type: 'upsert', session: merged });
          }
          const discovered = mutations.length > 0 ? applySessionMutations(state, mutations) : state;
          const discoveryErrors = new Map(Object.entries(result.errors));
          for (const parentId of state.failedChildDiscoveryParents) discoveryErrors.set(parentId, 'SERVICE_UNAVAILABLE');
          return { ...discovered, discoveryErrors, globalRefreshFailed: false };
        });
        raiseSessionOrderingBaselines(result.items.flatMap((session) => {
          const committed = get().entityById.get(session.sessionId);
          return committed && committed.archivedAt === undefined ? [committed] : [];
        }));
        return true;
      } catch (error) {
        if (generation === loadGeneration) console.warn('[GlobalSessions] Failed to refresh session head:', error);
        return false;
      }
    })();
    inflightHead = headPromise;
    void headPromise.finally(() => { if (inflightHead === headPromise) inflightHead = null; });
    return headPromise;
  },

  clearWorkspaceDiscoveryErrors: (workspaceId) => {
    set((state) => {
      const discoveryErrors = new Map(state.discoveryErrors);
      for (const identity of discoveryErrors.keys()) {
        if (!state.failedChildDiscoveryParents.has(identity)
          && (identity === workspaceId || state.entityById.get(identity)?.workspaceId === workspaceId)) discoveryErrors.delete(identity);
      }
      return discoveryErrors.size === state.discoveryErrors.size ? state : { discoveryErrors };
    });
  },

  refreshSessionsForDirectories: async (directories, fallbackActive) => {
    const directorySet = normalizeDirectorySet(directories);
    if (directorySet.size === 0) {
      const state = get();
      return { activeSessions: state.activeSessions, archivedSessions: state.archivedSessions };
    }

    const generation = loadGeneration;
    const baselineRevision = get().mutationRevision;
    try {
      await ensureChatsRootDirectory();
    } catch {
      const state = get();
      return { activeSessions: state.activeSessions, archivedSessions: state.archivedSessions };
    }
    if (generation !== loadGeneration) {
      const state = get();
      return { activeSessions: state.activeSessions, archivedSessions: state.archivedSessions };
    }
    get().rehydrateManagedChatSessions();
    const fetched = await fetchDirectoryPages(directorySet);

    if (generation !== loadGeneration) {
      const state = get();
      return { activeSessions: state.activeSessions, archivedSessions: state.archivedSessions };
    }
    const children = await discoverChildSessions(fetched.sessions, get().entityById, generation);
    if (generation !== loadGeneration) {
      const state = get();
      return { activeSessions: state.activeSessions, archivedSessions: state.archivedSessions };
    }

    if (fetched.errors.length > 0) {
      console.warn('[GlobalSessions] Failed to refresh sessions for some directories:', fetched.errors[0]);
    }
    for (const directory of fetched.directories) {
      const spaceId = spaceIdOfDirectory(directory);
      if (spaceId !== null) useSpacesStore.getState().noteReachable(spaceId);
    }

    const { active, archived } = splitGlobalSessionsByArchived([...fetched.sessions, ...children.sessions].map((session) => (
      mergeSessionDirectoryMetadata(session, get().entityById.get(session.sessionId))
    )));
    const refreshedActiveIds = active.map((session) => session.sessionId);

    set((state) => {
      // Directory root discovery cannot prove a child disappeared. Only a
      // successful list for that child's parent authorizes replacement.
      const preservedChildren = state.activeSessions.filter((session) => session.parentSessionId !== undefined
        && !children.succeededParents.has(session.parentSessionId));
      const preservedArchivedChildren = state.archivedSessions.filter((session) => session.parentSessionId !== undefined
        && !children.succeededParents.has(session.parentSessionId));
      let nextArchivedSessions = replaceSessionsForDirectories(state.archivedSessions, [...archived, ...preservedArchivedChildren], fetched.directories, fetched.failures);
      if (sameSessionList(state.archivedSessions, nextArchivedSessions)) {
        nextArchivedSessions = state.archivedSessions;
      }

      let nextActiveSessions = replaceSessionsForDirectories(state.activeSessions, [...active, ...preservedChildren], fetched.directories, fetched.failures);
      nextActiveSessions = addUnlistedLiveSessions(nextActiveSessions, nextArchivedSessions, fallbackActive?.filter((session) => (
        !session.parentSessionId || !children.succeededParents.has(session.parentSessionId)
      )));
      if (sameSessionList(state.activeSessions, nextActiveSessions)) {
        nextActiveSessions = state.activeSessions;
      }

      const reconciled = overlayMutationsSince(state, nextActiveSessions, nextArchivedSessions, baselineRevision);
      nextActiveSessions = reconciled.activeSessions;
      nextArchivedSessions = reconciled.archivedSessions;

      const nextSessionsByDirectory = nextActiveSessions === state.activeSessions
        ? state.sessionsByDirectory
        : buildSessionsByDirectory(nextActiveSessions);
      const activeChanged = nextActiveSessions !== state.activeSessions;
      const archivedChanged = nextArchivedSessions !== state.archivedSessions;
      const failedChildDiscoveryParents = new Set(state.failedChildDiscoveryParents);
      const discoveryErrors = new Map(state.discoveryErrors);
      for (const parentId of children.succeededParents) {
        if (failedChildDiscoveryParents.delete(parentId) && !fetched.failures[parentId]) discoveryErrors.delete(parentId);
      }
      for (const parentId of children.failedParents) {
        failedChildDiscoveryParents.add(parentId);
        discoveryErrors.set(parentId, 'SERVICE_UNAVAILABLE');
      }

      if (
        !activeChanged
        && !archivedChanged
        && nextSessionsByDirectory === state.sessionsByDirectory
        && children.failedParents.size === 0
        && ![...children.succeededParents].some((parentId) => state.failedChildDiscoveryParents.has(parentId))
      ) {
        return state;
      }

      return {
        failedChildDiscoveryParents,
        discoveryErrors,
        activeSessions: nextActiveSessions,
        archivedSessions: nextArchivedSessions,
        entityById: new Map([...nextActiveSessions, ...nextArchivedSessions].map((session) => [session.sessionId, session])),
        structure: activeChanged ? buildGlobalSessionStructure(nextActiveSessions) : state.structure,
        sessionsByDirectory: nextSessionsByDirectory,
        reviewTransferBySessionId: nextActiveSessions === state.activeSessions
          ? state.reviewTransferBySessionId
          : buildReviewTransferMap(nextActiveSessions),
      };
    });

    const state = get();
    raiseSessionOrderingBaselines(refreshedActiveIds.flatMap((sessionId) => {
      const session = state.entityById.get(sessionId);
      return session && session.archivedAt === undefined ? [session] : [];
    }));
    return { activeSessions: state.activeSessions, archivedSessions: state.archivedSessions };
  },

  upsertSession: (session) => {
    set((state) => applySessionMutations(state, [{ type: 'upsert', session }]));
  },

  upsertSessions: (sessions) => {
    if (sessions.length === 0) return;
    set((state) => applySessionMutations(
      state,
      sessions.map((session) => ({ type: 'upsert' as const, session })),
    ));
  },

  upsertSubagents: (parent, children) => {
    set((state) => applySessionMutations(state, children.flatMap((child) => {
      if (child.childSessionId === undefined) return [];
      const previous = state.entityById.get(child.childSessionId);
      if (child.parentSessionId !== parent.sessionId || child.childSessionId === parent.rootSessionId
        || (previous && previous.parentSessionId !== parent.sessionId)) return [];
      return [{ type: 'upsert' as const, session: buildSubagentChildSessionRecord(parent, child, previous) }];
    })));
  },

  removeSessions: (ids) => {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    if (idSet.size === 0) {
      return;
    }

    set((state) => applySessionMutations(
      state,
      [...idSet].map((sessionId) => ({ type: 'remove' as const, sessionId })),
    ));
  },

  archiveSessions: (ids, archivedAt = Date.now()) => {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    if (idSet.size === 0) {
      return;
    }

    set((state) => {
      const movedSessions: Session[] = [];
      for (const sessionId of idSet) {
        const session = state.entityById.get(sessionId);
        if (!session || session.archivedAt !== undefined) continue;
        movedSessions.push({ ...session, archivedAt });
      }

      if (movedSessions.length === 0) {
        return mutationRevisionPatch(state, idSet);
      }
      const patch = applySessionMutations(
        state,
        movedSessions.map((session) => ({ type: 'upsert' as const, session })),
      );
      return {
        ...patch,
        ...mutationRevisionPatch(state, idSet),
      };
    });
  },
}));

subscribeWorkspaceDirectories(() => {
  const state = useGlobalSessionsStore.getState();
  if (state.activeSessions.length === 0) return;
  useGlobalSessionsStore.setState({
    structure: buildGlobalSessionStructure(state.activeSessions),
    sessionsByDirectory: buildSessionsByDirectory(state.activeSessions),
  });
});
/**
 * Before the first complete load the store holds a non-authoritative seed and
 * live upserts. Persist the saved snapshot plus explicit mutations until a
 * complete discovery succeeds; partial discovery cannot retire unread scopes.
 */
const persistGlobalSnapshotFrom = (state: GlobalSessionsState, previous: GlobalSessionsState): void => {
  if (state.hasLoaded) {
    if (state.activeSessions !== previous.activeSessions || state.sessionsByDirectory !== previous.sessionsByDirectory || !previous.hasLoaded) {
      persistGlobalSessionSnapshot(state.activeSessions.filter((session) => !isChatDirectoryPath(resolveGlobalSessionDirectory(session))));
    }
    return;
  }
  if (state.mutationRevision !== previous.mutationRevision || state.sessionsByDirectory !== previous.sessionsByDirectory) {
    persistGlobalSessionSnapshot(overlayMutationsSince(state, readGlobalSessionSnapshot(), [], 0).activeSessions.filter((session) => !isChatDirectoryPath(resolveGlobalSessionDirectory(session))));
  }
};

useGlobalSessionsStore.subscribe((state, previous) => {
  countSyncPerformance('globalSessionPublications');
  // Both snapshots split sessions by the chats root, so they wait for it.
  if (getChatsRoot() === null) return;
  if (
    state.activeSessions !== previous.activeSessions
    || state.sessionsByDirectory !== previous.sessionsByDirectory
    || (!state.managedChatsHydrated && state.mutationRevision !== previous.mutationRevision)
    || (state.hasLoaded && !previous.hasLoaded)
  ) {
    const sessions = !state.hasLoaded && !state.managedChatsHydrated
      ? overlayMutationsSince(state, readManagedChatSessions(), [], 0).activeSessions
      : state.activeSessions;
    const previousChats = new Set(readManagedChatSessions().map((session) => session.sessionId));
    persistManagedChatSessions(sessions.filter((session) => (
      isChatDirectoryPath(resolveGlobalSessionDirectory(session))
      || (resolveGlobalSessionDirectory(session) === null && previousChats.has(session.sessionId))
    )));
  }
  persistGlobalSnapshotFrom(state, previous);
});

export const ensureGlobalSessionsLoaded = async (fallbackActive?: Session[]): Promise<LoadResult> => {
  const state = useGlobalSessionsStore.getState();
  if (state.hasLoaded && state.status !== 'error') {
    return {
      activeSessions: state.activeSessions,
      archivedSessions: state.archivedSessions,
    };
  }
  return state.loadSessions(fallbackActive);
};

export const refreshGlobalSessions = async (fallbackActive?: Session[]): Promise<LoadResult> => {
  return useGlobalSessionsStore.getState().loadSessions(fallbackActive);
};

export const refreshGlobalSessionsWhenShown = async (completeMaxAgeMs: number, fallbackActive?: Session[]): Promise<void> => {
  const state = useGlobalSessionsStore.getState();
  const fresh = completeLoadAt > 0 && state.status === 'ready' && Date.now() - completeLoadAt < completeMaxAgeMs;
  if (fresh) await state.refreshSessionHead();
  else await state.loadSessions(fallbackActive);
};

export const refreshRecentGlobalSessions = (): Promise<boolean> => (
  useGlobalSessionsStore.getState().refreshSessionHead()
);

export const refreshGlobalSessionsForDirectories = async (
  directories: Iterable<string>,
  fallbackActive?: Session[],
): Promise<LoadResult> => {
  return useGlobalSessionsStore.getState().refreshSessionsForDirectories(directories, fallbackActive);
};
