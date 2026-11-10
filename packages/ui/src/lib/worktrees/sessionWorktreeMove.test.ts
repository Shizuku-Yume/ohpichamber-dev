import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Session, SessionMoveToWorktreeRequest, SessionMoveToWorktreeResult, SessionRuntimeStatus } from '@openchamber/agent-contract';
import type { State } from '@/sync/types';
import type { WorktreeMetadata } from '@/types/worktree';
import type { ProjectRef } from '@/lib/worktrees/worktreeManager';
import type { SessionTreeMoveIntent, SessionTreeMoveMessages } from './sessionWorktreeMove';

const moveCalls: Array<{
  sessionId: string;
  sourceDirectory: string;
  destinationDirectory: string;
}> = [];
const refreshCalls: string[][] = [];
type RemoveProjectWorktreeCall = {
  projectDirectory: string;
  directory: string;
  deleteLocalBranch: boolean;
};
type MoveSessionImplementation = (
  session: Session,
  sourceDirectory: string,
  destinationDirectory: string,
) => Promise<void>;
type RefreshImplementation = (directories: string[]) => Promise<void>;
type GitStatusResult = {
  current: string;
  isClean: boolean;
  files: Array<{ path: string; index: string; working_dir: string }>;
};
type MoveToWorktreeRequest = SessionMoveToWorktreeRequest;
type MoveToWorktreeImplementation = (
  sessionId: string,
  request: MoveToWorktreeRequest,
) => Promise<SessionMoveToWorktreeResult>;
type ResolveProjectRefImplementation = (directory: string) => ProjectRef | null;
type DirectoryState = Pick<State, 'session_status'>;
type DeferredVoid = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};
type IncompleteRollbackCause = {
  moveError: Error;
  rollbackFailures: Array<{ sessionId: string; error: Error }>;
};

const removeWorktreeCalls: RemoveProjectWorktreeCall[] = [];
const moveToWorktreeCalls: Array<{ sessionId: string; request: MoveToWorktreeRequest }> = [];
const listWorktreesCalls: string[] = [];
const metadataWrites: Array<{ sessionId: string; metadata: WorktreeMetadata | null }> = [];
const toastSuccesses: string[] = [];
const toastErrors: Array<{ title: string; description?: string }> = [];
const toastWarnings: string[] = [];
const directoryStates = new Map<string, DirectoryState>();
const storedMetadata = new Map<string, WorktreeMetadata | null>();
// The shape `fetchProjectSetup` answers with: no shared commands, so nothing
// asks for trust; an empty teardown, so the removal carries none.
const EMPTY_PROJECT_SETUP = {
  trust: { hash: null as string | null, trusted: true },
  setupWorktree: [] as string[],
  setupWorktreeWait: false,
  teardownWorktree: [] as string[],
  projectActions: [] as unknown[],
  projectActionsPrimaryId: null as string | null,
  draftStarters: [] as unknown[],
  shared: {
    status: 'missing' as const,
    path: '.openchamber/project.json',
    setupWorktree: [] as string[],
    setupWorktreeWait: null as boolean | null,
    teardownWorktree: [] as string[],
    projectActions: [] as unknown[],
    draftStarters: [] as unknown[],
    plansDir: null as string | null,
  },
  personal: {
    setupWorktree: [] as string[],
    setupWorktreeWait: null as boolean | null,
    setupWorktreeMode: 'append' as const,
    worktreeDirectory: null as string | null,
    teardownWorktree: [] as string[],
    projectActions: [] as unknown[],
    projectActionsPrimaryId: null as string | null,
    draftStarters: [] as unknown[],
    hiddenSharedActionIds: [] as string[],
    sharedTrust: null as { hash: string; trustedAt: number } | null,
  },
};

const originalConsoleWarn = console.warn;
type SessionUIState = {
  availableWorktrees: WorktreeMetadata[];
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>;
  worktreeMetadata: Map<string, WorktreeMetadata | null>;
  getWorktreeMetadata: (sessionId: string) => WorktreeMetadata | null;
  setWorktreeMetadata: (sessionId: string, metadata: WorktreeMetadata | null) => void;
};

type SessionUIStatePatch = Partial<SessionUIState> | ((state: SessionUIState) => Partial<SessionUIState>);

const sessionUIState: SessionUIState = {
  availableWorktrees: [],
  availableWorktreesByProject: new Map<string, WorktreeMetadata[]>(),
  worktreeMetadata: new Map<string, WorktreeMetadata | null>(),
  getWorktreeMetadata: (sessionId: string) => storedMetadata.get(sessionId) ?? null,
  setWorktreeMetadata: (sessionId: string, metadata: WorktreeMetadata | null) => {
    storedMetadata.set(sessionId, metadata);
    metadataWrites.push({ sessionId, metadata });
  },
};

let moveSessionImplementation: MoveSessionImplementation = async () => {};
let refreshImplementation: RefreshImplementation = async () => {};
let latestMetadataResult: WorktreeMetadata;
let isGitRepositoryImplementation = async (directory: string): Promise<boolean> => {
  void directory;
  return true;
};
let getGitStatusImplementation = async (directory: string): Promise<GitStatusResult> => {
  void directory;
  return {
  current: 'feature',
  isClean: true,
  files: [],
  };
};
let moveToWorktreeImplementation: MoveToWorktreeImplementation = async (sessionId, request) => ({
  sessionId,
  directory: `/created-worktree/${request.worktree.name}`,
  previousDirectory: '/source',
  worktree: { name: request.worktree.name, branch: request.worktree.name, path: '/created-worktree' },
  changesMoved: false,
  carried: request.carry,
});
let resolveProjectRefImplementation: ResolveProjectRefImplementation = () => ({ id: 'project-1', path: '/repo' });
let projectFolderInRepository = '';
// Folder per project path, for tests where projects share a repository; falls back to `projectFolderInRepository`.
const projectFoldersByPath = new Map<string, string>();
let directoryInsideCheckout = true;

mock.module('@/components/ui', () => ({
  toast: {
    success: (message: string) => {
      toastSuccesses.push(message);
    },
    error: (title: string, options?: { description?: string }) => {
      toastErrors.push({ title, description: options?.description });
    },
    warning: (message: string) => {
      toastWarnings.push(message);
    },
  },
}));

mock.module('@/lib/gitApi', () => ({
  checkIsGitRepository: (directory: string) => isGitRepositoryImplementation(directory),
  getGitStatus: (directory: string) => getGitStatusImplementation(directory),
  deleteRemoteBranch: mock(),
  resolveGitRepositoryPrefix: mock((directory: string) => Promise.resolve(projectFoldersByPath.get(directory) ?? projectFolderInRepository)),
  resolveGitPrimaryRoot: mock(() => Promise.resolve('/repo')),
  validateWorktreeDirectory: mock(() => Promise.resolve({ valid: directoryInsideCheckout, insideWorktreeRoot: directoryInsideCheckout, resolvedWorktreeRoot: null, resolvedCwd: null })),
  git: {
    worktree: {
      list: mock(() => Promise.resolve([])),
      create: mock(() => Promise.resolve(null)),
      validate: mock(() => Promise.resolve({ ok: true, errors: [] })),
      teardown: mock(() => Promise.resolve({ success: true })),
      remove: mock((projectDirectory: string, options: { directory: string; deleteLocalBranch?: boolean }) => {
        removeWorktreeCalls.push({
          projectDirectory,
          directory: options.directory,
          deleteLocalBranch: options.deleteLocalBranch === true,
        });
        return Promise.resolve({ success: true });
      }),
    },
  },
}));

mock.module('@/lib/openchamberConfig', () => ({
  substituteCommandVariables: (command: string) => command,
  // A removal resolves the project's teardown first; nothing is configured
  // here, so it carries none and never asks for trust.
  fetchProjectSetup: async () => EMPTY_PROJECT_SETUP,
  getProjectSetup: async () => EMPTY_PROJECT_SETUP,
  updateProjectSetup: async () => true,
}));

mock.module('@/lib/worktreeSessionCreator', () => ({
  resolveProjectRef: mock((directory: string) => resolveProjectRefImplementation(directory)),
  resolveFolderProjectRef: mock((directory: string) => Promise.resolve(resolveProjectRefImplementation(directory))),
}));

// The Host makes the checkout and moves the session; this client asks once and
// adopts what it answers.
mock.module('@/api/canonicalClient', () => ({
  canonicalClient: {
    moveSessionToWorktree: (sessionId: string, request: MoveToWorktreeRequest) => {
      moveToWorktreeCalls.push({ sessionId, request });
      return moveToWorktreeImplementation(sessionId, request);
    },
  },
}));

// The real module, with the state writes faked: other code under test reads
// its waiters and subscriptions too.
const worktreeBootstrap = await import('@/lib/worktrees/worktreeBootstrap');
mock.module('@/lib/worktrees/worktreeBootstrap', () => ({
  ...worktreeBootstrap,
  clearWorktreeBootstrapState: mock(),
  markWorktreeBootstrapPending: mock(),
  setWorktreeBootstrapState: mock(),
  // Removal skips the teardown of a checkout whose bootstrap failed.
  getWorktreeBootstrapState: () => null,
  startWorktreeBootstrapWatcher: mock(),
}));

mock.module('@/lib/worktrees/worktreeStatus', () => ({
  invalidateResolvedProjectRootCache: mock(),
  resolveProjectRoot: (directory: string) => Promise.resolve(directory),
}));

mock.module('@/stores/useGlobalSessionsStore', () => ({
  refreshGlobalSessionsForDirectories: (directories: string[]) => {
    refreshCalls.push(directories);
    return refreshImplementation(directories);
  },
}));

// Mirrors session-actions: every child store is scanned, because a session's
// live status can be reported by a directory other than its own, and "no store
// covers this session" is 'unknown', never 'idle' — a populated store map says
// nothing about a session none of its stores holds.
const getSessionLiveActivity = (sessionId: string): 'unknown' | 'idle' | 'active' => {
  for (const state of directoryStates.values()) {
    const status = state.session_status[sessionId];
    if (status && status !== 'idle') return 'active';
  }
  for (const state of directoryStates.values()) {
    if (Object.hasOwn(state.session_status, sessionId)) return 'idle';
  }
  return 'unknown';
};

mock.module('@/sync/session-actions', () => ({
  moveSessionToDirectory: (session: Session, sourceDirectory: string, destinationDirectory: string) => {
    moveCalls.push({ sessionId: session.sessionId, sourceDirectory, destinationDirectory });
    return moveSessionImplementation(session, sourceDirectory, destinationDirectory);
  },
  getSessionLiveActivity,
  isSessionBusyNow: (sessionId: string) => getSessionLiveActivity(sessionId) === 'active',
}));

mock.module('@/sync/session-ui-store', () => ({
  useSessionUIStore: {
    getState: () => sessionUIState,
    setState: (patch: SessionUIStatePatch) => {
      const next = patch instanceof Function ? patch(sessionUIState) : patch;
      Object.assign(sessionUIState, next);
    },
  },
}));

mock.module('@/sync/session-worktree-store', () => ({
  useSessionWorktreeStore: {
    setState: mock(),
  },
}));

mock.module('@/sync/sync-refs', () => ({
  getDirectoryState: (directory: string) => directoryStates.get(directory),
}));

const {
  moveSessionTreeToExistingWorktree,
  requestSessionTreeMove,
} = await import('./sessionWorktreeMove');

const makeSession = (sessionId: string): Session => ({
  sessionId,
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  displayPath: '.',
  rootSessionId: sessionId,
  createdAt: 0,
  updatedAt: 0,
  epoch: 'epoch-1',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
});

const makeWorktreeMetadata = (overrides: Partial<WorktreeMetadata> = {}): WorktreeMetadata => ({
  path: '/destination',
  projectDirectory: '/repo',
  branch: 'feature',
  label: 'Destination',
  worktreeStatus: 'ready',
  worktreeSource: 'existing',
  ...overrides,
});

const makeMoveMessages = (): SessionTreeMoveMessages => ({
  success: 'move succeeded',
  failure: 'move failed',
  outcomeUnknown: 'worktree kept',
});

const makeQuickIntent = (): SessionTreeMoveIntent => ({
  kind: 'quick',
  root: makeSession('root'),
  descendants: [],
  sourceDirectory: '/source',
  messages: makeMoveMessages(),
});

const setStatuses = (directory: string, statuses: Record<string, SessionRuntimeStatus>): void => {
  directoryStates.set(directory, { session_status: statuses });
};

// Each step yields a macrotask: a removal resolves the project's teardown
// over its own async chain before git is asked, so a microtask-only poll can
// run out of attempts before the answer lands.
const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for condition');
};

const deferred = (): DeferredVoid => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const getIncompleteRollbackCause = (error: Error): IncompleteRollbackCause => {
  const cause = error.cause;
  if (!cause || !(cause instanceof Object)) {
    throw new Error('Expected rollback error cause details');
  }

  // SAFETY: createIncompleteRollbackError in the module under test attaches
  // this exact cause shape when rollback reporting fails.
  const parsed = cause as Partial<IncompleteRollbackCause>;
  if (!(parsed.moveError instanceof Error)) {
    throw new Error('Expected rollback moveError cause');
  }
  if (!Array.isArray(parsed.rollbackFailures)) {
    throw new Error('Expected rollback failures in cause');
  }

  const rollbackFailures = parsed.rollbackFailures.map((entry) => {
    if (!entry || !(entry instanceof Object)) {
      throw new Error('Expected rollback failure entry');
    }
    // SAFETY: the same helper populates every rollback entry with a string ID
    // and Error instance before this test helper reads it back.
    const failure = entry as { sessionId: string; error: Error };
    if (!(failure.error instanceof Error)) {
      throw new Error('Expected rollback failure error');
    }
    return { sessionId: failure.sessionId, error: failure.error };
  });

  return {
    moveError: parsed.moveError,
    rollbackFailures,
  };
};

describe('moveSessionTreeToExistingWorktree', () => {
  beforeEach(() => {
    moveCalls.length = 0;
    refreshCalls.length = 0;
    removeWorktreeCalls.length = 0;
    moveToWorktreeCalls.length = 0;
    listWorktreesCalls.length = 0;
    metadataWrites.length = 0;
    toastSuccesses.length = 0;
    toastErrors.length = 0;
    toastWarnings.length = 0;
    directoryStates.clear();
    storedMetadata.clear();
    sessionUIState.worktreeMetadata = new Map();
    sessionUIState.availableWorktreesByProject = new Map();
    latestMetadataResult = makeWorktreeMetadata({ label: 'Latest destination' });
    sessionUIState.availableWorktrees = [latestMetadataResult];
    moveSessionImplementation = async () => {};
    refreshImplementation = async () => {};
    isGitRepositoryImplementation = async () => true;
    getGitStatusImplementation = async () => ({
      current: 'feature',
      isClean: true,
      files: [],
    });
    moveToWorktreeImplementation = async (sessionId, request) => ({
      sessionId,
      directory: `/created-worktree/${request.worktree.name}`,
      previousDirectory: '/source',
      worktree: { name: request.worktree.name, branch: request.worktree.name, path: '/created-worktree' },
      changesMoved: false,
      carried: request.carry,
    });
    resolveProjectRefImplementation = () => ({ id: 'project-1', path: '/repo' });
    projectFolderInRepository = '';
    projectFoldersByPath.clear();
    directoryInsideCheckout = true;
    console.warn = () => {};
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
  });

  test('moves descendants before the root and refreshes both directories', async () => {
    const root = makeSession('root');
    const child = makeSession('child');
    const previousRootMetadata = makeWorktreeMetadata({ path: '/old-root', label: 'Old root' });
    const previousChildMetadata = makeWorktreeMetadata({ path: '/old-child', label: 'Old child' });
    const destination = makeWorktreeMetadata();
    setStatuses('/source', { root: 'idle', child: 'idle' });
    storedMetadata.set(root.sessionId, previousRootMetadata);
    storedMetadata.set(child.sessionId, previousChildMetadata);

    const result = await moveSessionTreeToExistingWorktree({
      root,
      descendants: [child],
      sourceDirectory: '/source',
      destination,
    });

    expect(result).toBe('/destination');
    expect(moveCalls).toEqual([
      { sessionId: 'child', sourceDirectory: '/source', destinationDirectory: '/destination' },
      { sessionId: 'root', sourceDirectory: '/source', destinationDirectory: '/destination' },
    ]);
    expect(metadataWrites).toEqual([
      { sessionId: 'child', metadata: latestMetadataResult },
      { sessionId: 'root', metadata: latestMetadataResult },
    ]);
    expect(refreshCalls).toEqual([['/source', '/destination']]);
    expect(removeWorktreeCalls).toEqual([]);
  });

  test('moves into the project folder inside an existing worktree while the metadata keeps the worktree root', async () => {
    const root = makeSession('root');
    setStatuses('/source', { root: 'idle' });
    projectFolderInRepository = 'ai';

    const result = await moveSessionTreeToExistingWorktree({
      root,
      descendants: [],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    });

    expect(result).toBe('/destination/ai');
    expect(moveCalls).toEqual([{ sessionId: 'root', sourceDirectory: '/source', destinationDirectory: '/destination/ai' }]);
    expect(metadataWrites).toEqual([{ sessionId: 'root', metadata: latestMetadataResult }]);
  });

  test('takes the folder from the project of the moved session when two projects share the repository', async () => {
    const sourceDirectory = '/repo/ai/src';
    setStatuses(sourceDirectory, { root: 'idle' });
    projectFoldersByPath.set('/repo/ai', 'ai');
    projectFoldersByPath.set('/repo/web', 'web');
    resolveProjectRefImplementation = (directory) => (
      directory === sourceDirectory ? { id: 'ai', path: '/repo/ai' } : { id: 'web', path: '/repo/web' }
    );

    const result = await moveSessionTreeToExistingWorktree({
      root: makeSession('root'),
      descendants: [],
      sourceDirectory,
      destination: makeWorktreeMetadata(),
    });

    expect(result).toBe('/destination/ai');
  });

  test('moves to the worktree root when the project folder is missing there', async () => {
    setStatuses('/source', { root: 'idle' });
    projectFolderInRepository = 'ai';
    directoryInsideCheckout = false;

    const result = await moveSessionTreeToExistingWorktree({
      root: makeSession('root'),
      descendants: [],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    });

    expect(result).toBe('/destination');
    expect(toastWarnings).toHaveLength(1);
  });

  test('refuses to move a session from inside a worktree folder into the same worktree', async () => {
    setStatuses('/destination/ai', { root: 'idle' });

    await expect(moveSessionTreeToExistingWorktree({
      root: makeSession('root'),
      descendants: [],
      sourceDirectory: '/destination/ai',
      destination: makeWorktreeMetadata(),
    })).rejects.toThrow('Source and destination are the same');
    expect(moveCalls).toEqual([]);
  });

  test('rejects a destination that normalizes to the source directory', async () => {
    setStatuses('/source', { root: 'idle' });

    await expect(moveSessionTreeToExistingWorktree({
      root: makeSession('root'),
      descendants: [],
      sourceDirectory: '/source/',
      destination: makeWorktreeMetadata({ path: '/source' }),
    })).rejects.toThrow('Source and destination are the same');

    expect(moveCalls).toEqual([]);
    expect(refreshCalls).toEqual([]);
  });

  test('rejects a destination worktree that is not ready', async () => {
    setStatuses('/source', { root: 'idle' });

    await expect(moveSessionTreeToExistingWorktree({
      root: makeSession('root'),
      descendants: [],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata({ worktreeStatus: 'pending' }),
    })).rejects.toThrow('Destination worktree is not ready');

    expect(moveCalls).toEqual([]);
  });

  test('rejects when the root session is busy before setup', async () => {
    setStatuses('/source', { root: 'running' });

    await expect(moveSessionTreeToExistingWorktree({
      root: makeSession('root'),
      descendants: [],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    })).rejects.toThrow('Session is not idle');

    expect(moveCalls).toEqual([]);
  });

  test('rejects when any descendant is busy before setup', async () => {
    const root = makeSession('root');
    const child = makeSession('child');
    setStatuses('/source', { root: 'idle', child: 'awaiting_input' });

    await expect(moveSessionTreeToExistingWorktree({
      root,
      descendants: [child],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    })).rejects.toThrow('Session is not idle');

    expect(moveCalls).toEqual([]);
  });

  test('rejects a duplicate move request while the root move is pending', async () => {
    const root = makeSession('root');
    const rootMove = deferred();
    setStatuses('/source', { root: 'idle' });
    moveSessionImplementation = async (session, sourceDirectory) => {
      if (session.sessionId === 'root' && sourceDirectory === '/source') {
        return rootMove.promise;
      }
    };

    const firstMove = moveSessionTreeToExistingWorktree({
      root,
      descendants: [],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    });
    await waitFor(() => moveCalls.length === 1);

    await expect(moveSessionTreeToExistingWorktree({
      root,
      descendants: [],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    })).rejects.toThrow('Session move already in progress');

    rootMove.resolve();
    await firstMove;
    expect(moveCalls).toHaveLength(1);
  });

  test('rolls back completed moves in reverse order, restores previous metadata, and never removes an existing destination', async () => {
    const root = makeSession('root');
    const childA = makeSession('child-a');
    const childB = makeSession('child-b');
    const previousRootMetadata = makeWorktreeMetadata({ path: '/old-root', label: 'Old root' });
    const previousChildAMetadata = makeWorktreeMetadata({ path: '/old-child-a', label: 'Old child A' });
    const previousChildBMetadata = makeWorktreeMetadata({ path: '/old-child-b', label: 'Old child B' });
    setStatuses('/source', { root: 'idle', 'child-a': 'idle', 'child-b': 'idle' });
    storedMetadata.set(root.sessionId, previousRootMetadata);
    storedMetadata.set(childA.sessionId, previousChildAMetadata);
    storedMetadata.set(childB.sessionId, previousChildBMetadata);
    moveSessionImplementation = async (session, sourceDirectory) => {
      if (session.sessionId === 'child-b' && sourceDirectory === '/source') {
        throw new Error('child-b failed');
      }
    };

    await expect(moveSessionTreeToExistingWorktree({
      root,
      descendants: [childA, childB],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    })).rejects.toThrow('child-b failed');

    expect(moveCalls).toEqual([
      { sessionId: 'child-a', sourceDirectory: '/source', destinationDirectory: '/destination' },
      { sessionId: 'child-b', sourceDirectory: '/source', destinationDirectory: '/destination' },
      { sessionId: 'child-a', sourceDirectory: '/destination', destinationDirectory: '/source' },
    ]);
    expect(metadataWrites).toEqual([
      { sessionId: 'child-a', metadata: latestMetadataResult },
      { sessionId: 'child-a', metadata: previousChildAMetadata },
    ]);
    expect(storedMetadata.get(root.sessionId)).toBe(previousRootMetadata);
    expect(storedMetadata.get(childA.sessionId)).toBe(previousChildAMetadata);
    expect(storedMetadata.get(childB.sessionId)).toBe(previousChildBMetadata);
    expect(removeWorktreeCalls).toEqual([]);
    expect(refreshCalls).toEqual([]);
  });

  test('rolls back an earlier child and never moves a later descendant that becomes busy', async () => {
    const root = makeSession('root');
    const childA = makeSession('child-a');
    const childB = makeSession('child-b');
    const childAMove = deferred();
    const previousRootMetadata = makeWorktreeMetadata({ path: '/old-root', label: 'Old root' });
    const previousChildAMetadata = makeWorktreeMetadata({ path: '/old-child-a', label: 'Old child A' });
    const previousChildBMetadata = makeWorktreeMetadata({ path: '/old-child-b', label: 'Old child B' });
    setStatuses('/source', { root: 'idle', 'child-a': 'idle', 'child-b': 'idle' });
    setStatuses('/destination', {});
    storedMetadata.set(root.sessionId, previousRootMetadata);
    storedMetadata.set(childA.sessionId, previousChildAMetadata);
    storedMetadata.set(childB.sessionId, previousChildBMetadata);
    moveSessionImplementation = async (session, sourceDirectory) => {
      if (session.sessionId === 'child-a' && sourceDirectory === '/source') {
        return childAMove.promise;
      }
    };

    const movePromise = moveSessionTreeToExistingWorktree({
      root,
      descendants: [childA, childB],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    });

    await waitFor(() => moveCalls.length === 1);
    setStatuses('/source', { root: 'idle', 'child-a': 'idle', 'child-b': 'running' });
    setStatuses('/destination', { 'child-a': 'idle' });
    childAMove.resolve();

    await expect(movePromise).rejects.toThrow('Session is not idle');

    expect(moveCalls).toEqual([
      { sessionId: 'child-a', sourceDirectory: '/source', destinationDirectory: '/destination' },
      { sessionId: 'child-a', sourceDirectory: '/destination', destinationDirectory: '/source' },
    ]);
    expect(metadataWrites).toEqual([
      { sessionId: 'child-a', metadata: latestMetadataResult },
      { sessionId: 'child-a', metadata: previousChildAMetadata },
    ]);
    expect(storedMetadata.get(root.sessionId)).toBe(previousRootMetadata);
    expect(storedMetadata.get(childA.sessionId)).toBe(previousChildAMetadata);
    expect(storedMetadata.get(childB.sessionId)).toBe(previousChildBMetadata);
    expect(removeWorktreeCalls).toEqual([]);
    expect(refreshCalls).toEqual([]);
  });

  test('reports an incomplete rollback explicitly and still does not remove the existing destination', async () => {
    const root = makeSession('root');
    const childA = makeSession('child-a');
    const childB = makeSession('child-b');
    setStatuses('/source', { root: 'idle', 'child-a': 'idle', 'child-b': 'idle' });
    moveSessionImplementation = async (session, sourceDirectory) => {
      if (session.sessionId === 'child-b' && sourceDirectory === '/source') {
        throw new Error('child-b failed');
      }
      if (session.sessionId === 'child-a' && sourceDirectory === '/destination') {
        throw new Error('rollback failed');
      }
    };

    const error = await moveSessionTreeToExistingWorktree({
      root,
      descendants: [childA, childB],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    }).catch((rejection) => rejection);

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw error;
    }
    expect(error.message.includes('could not be fully rolled back')).toBe(true);
    const cause = getIncompleteRollbackCause(error);
    expect(cause.moveError.message).toBe('child-b failed');
    expect(cause.rollbackFailures).toEqual([{ sessionId: 'child-a', error: new Error('rollback failed') }]);

    expect(removeWorktreeCalls).toEqual([]);
  });

  const expectBusyOrRetryRollbackBlock = async (status: Extract<SessionRuntimeStatus, 'running' | 'awaiting_input'>): Promise<void> => {
    const root = makeSession('root');
    const childA = makeSession('child-a');
    const childB = makeSession('child-b');
    setStatuses('/source', { root: 'idle', 'child-a': 'idle', 'child-b': 'idle' });
    setStatuses('/destination', {});
    moveSessionImplementation = async (session, sourceDirectory) => {
      if (sourceDirectory === '/source' && session.sessionId === 'child-a') {
        setStatuses('/destination', { 'child-a': status });
        return;
      }
      if (sourceDirectory === '/source' && session.sessionId === 'child-b') {
        throw new Error('child-b failed');
      }
    };

    await expect(moveSessionTreeToExistingWorktree({
      root,
      descendants: [childA, childB],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    })).rejects.toThrow('could not be fully rolled back');

    expect(moveCalls).toEqual([
      { sessionId: 'child-a', sourceDirectory: '/source', destinationDirectory: '/destination' },
      { sessionId: 'child-b', sourceDirectory: '/source', destinationDirectory: '/destination' },
    ]);
    expect(removeWorktreeCalls).toEqual([]);
  };

  test('does not attempt rollback for a moved child that becomes running in the destination', async () => {
    await expectBusyOrRetryRollbackBlock('running');
  });

  test('does not attempt rollback for a moved child that becomes awaiting input in the destination', async () => {
    await expectBusyOrRetryRollbackBlock('awaiting_input');
  });

  test('keeps the move successful when the post-move refresh fails', async () => {
    const root = makeSession('root');
    setStatuses('/source', { root: 'idle' });
    refreshImplementation = async () => {
      throw new Error('refresh failed');
    };

    const result = await moveSessionTreeToExistingWorktree({
      root,
      descendants: [],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    });

    expect(result).toBe('/destination');
    expect(refreshCalls).toEqual([['/source', '/destination']]);
  });

  test('asks the Host to make the checkout and move the session, and adopts its answer', async () => {
    setStatuses('/source', { root: 'idle' });
    isGitRepositoryImplementation = async () => true;

    requestSessionTreeMove(makeQuickIntent());

    await waitFor(() => toastSuccesses.length === 1);
    expect(moveToWorktreeCalls).toHaveLength(1);
    expect(moveToWorktreeCalls[0].sessionId).toBe('root');
    // One relative folder name, and the source branch as the start ref.
    expect(moveToWorktreeCalls[0].request).toMatchObject({ carry: [] });
    expect(moveToWorktreeCalls[0].request.worktree.name).toMatch(/^[^/\\]+$/);
    expect(moveToWorktreeCalls[0].request.worktree.startRef).toBe('feature');
    expect(moveCalls).toEqual([]);
    expect(removeWorktreeCalls).toEqual([]);
    // The new checkout and the destination are adopted before the next listing.
    expect(storedMetadata.get('root')).toMatchObject({ path: '/created-worktree', branch: expect.any(String) });
    expect(refreshCalls).toEqual([['/source', expect.stringContaining('/created-worktree')]]);
  });

  test('carries a Host rejection as it is, with no local removal of a checkout this client never made', async () => {
    setStatuses('/source', { root: 'idle' });
    moveToWorktreeImplementation = async () => {
      throw new Error('The uncommitted changes are kept in git stash stash@{0}');
    };

    requestSessionTreeMove(makeQuickIntent());

    await waitFor(() => toastErrors.length === 1);
    expect(toastErrors).toEqual([{ title: 'move failed', description: 'The uncommitted changes are kept in git stash stash@{0}' }]);
    expect(removeWorktreeCalls).toEqual([]);
    expect(moveCalls).toEqual([]);
    expect(refreshCalls).toEqual([]);
    // A failed move leaves no worktree of its own: the session keeps the
    // metadata it had (none here), so it is never claimed to have moved.
    expect(storedMetadata.get('root') ?? null).toBeNull();
  });

  test('a non-Git source moves without a start ref and without reading its status', async () => {
    setStatuses('/source', { root: 'idle' });
    isGitRepositoryImplementation = async () => false;
    let statusCallCount = 0;
    getGitStatusImplementation = async () => {
      statusCallCount += 1;
      return { current: 'feature', isClean: true, files: [] };
    };

    requestSessionTreeMove(makeQuickIntent());

    await waitFor(() => toastSuccesses.length === 1);
    expect(statusCallCount).toBe(0);
    expect(moveToWorktreeCalls).toHaveLength(1);
    expect(moveToWorktreeCalls[0].request.worktree).toEqual({ name: expect.any(String) });
  });

  test('moves an existing-worktree request as soon as it is requested', async () => {
    setStatuses('/source', { root: 'idle' });

    requestSessionTreeMove({
      kind: 'existing',
      root: makeSession('root'),
      descendants: [],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
      messages: makeMoveMessages(),
    });

    await waitFor(() => moveCalls.length === 1);
    expect(moveCalls).toEqual([{
      sessionId: 'root',
      sourceDirectory: '/source',
      destinationDirectory: '/destination',
    }]);
  });


  test('does not move the root when a descendant fails', async () => {
    const root = makeSession('root');
    const child = makeSession('child');
    setStatuses('/source', { root: 'idle', child: 'idle' });
    setStatuses('/destination', { root: 'idle' });
    moveSessionImplementation = async (session, sourceDirectory) => {
      if (session.sessionId === 'child' && sourceDirectory === '/source') {
        throw new Error('child failed');
      }
    };

    await expect(moveSessionTreeToExistingWorktree({
      root,
      descendants: [child],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    })).rejects.toThrow('child failed');

    expect(moveCalls).toEqual([
      { sessionId: 'child', sourceDirectory: '/source', destinationDirectory: '/destination' },
    ]);
  });

  // A move whose answer was lost may still have happened, so the UI must say
  // so rather than claim either outcome; the checkout stays with the Host.
  test('names a lost answer instead of claiming the move failed', async () => {
    setStatuses('/source', { root: 'idle' });
    moveToWorktreeImplementation = async () => {
      throw new Error('Request timed out');
    };

    requestSessionTreeMove(makeQuickIntent());

    await waitFor(() => toastErrors.length === 1);
    expect(toastErrors).toEqual([{ title: 'move failed', description: 'worktree kept' }]);
    expect(removeWorktreeCalls).toEqual([]);
    expect(moveCalls).toEqual([]);
  });

  test('refuses a second move while the first one runs, and clears the pending mark after it settles', async () => {
    setStatuses('/source', { root: 'idle' });
    let release!: () => void;
    moveToWorktreeImplementation = (sessionId, request) => new Promise((resolve) => {
      release = () => resolve({
        sessionId,
        directory: `/created-worktree/${request.worktree.name}`,
        previousDirectory: '/source',
        worktree: { name: request.worktree.name, branch: request.worktree.name, path: '/created-worktree' },
        changesMoved: false,
        carried: request.carry,
      });
    });

    requestSessionTreeMove(makeQuickIntent());
    requestSessionTreeMove(makeQuickIntent());
    await waitFor(() => moveToWorktreeCalls.length === 1);
    expect(moveToWorktreeCalls).toHaveLength(1);

    release();
    await waitFor(() => toastSuccesses.length === 1);
    // A later request is admitted again.
    moveToWorktreeImplementation = async (sessionId, request) => ({
      sessionId,
      directory: `/created-worktree/${request.worktree.name}`,
      previousDirectory: '/source',
      worktree: { name: request.worktree.name, branch: request.worktree.name, path: '/created-worktree' },
      changesMoved: false,
      carried: request.carry,
    });
    requestSessionTreeMove(makeQuickIntent());
    await waitFor(() => moveToWorktreeCalls.length === 2);
  });

  test('refuses to move a session whose live status is reported by another directory', async () => {
    setStatuses('/source', { root: 'idle' });
    setStatuses('/other-directory', { root: 'running' });

    await expect(moveSessionTreeToExistingWorktree({
      root: makeSession('root'),
      descendants: [],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    })).rejects.toThrow('Session is not idle');

    expect(moveCalls).toEqual([]);
  });

  test('refuses to move when no child store can report session status', async () => {
    directoryStates.clear();

    await expect(moveSessionTreeToExistingWorktree({
      root: makeSession('root'),
      descendants: [],
      sourceDirectory: '/source',
      destination: makeWorktreeMetadata(),
    })).rejects.toThrow('Session status is unavailable');

    expect(moveCalls).toEqual([]);
  });

  test('surfaces a pre-destination preparation failure without attempting removal', async () => {
    setStatuses('/source', { root: 'idle' });
    resolveProjectRefImplementation = () => null;

    requestSessionTreeMove(makeQuickIntent());

    await waitFor(() => toastErrors.length === 1);
    expect(toastErrors).toEqual([{ title: 'move failed', description: 'Unable to find the project for this session' }]);
    expect(removeWorktreeCalls).toEqual([]);
    expect(moveCalls).toEqual([]);
  });
});
