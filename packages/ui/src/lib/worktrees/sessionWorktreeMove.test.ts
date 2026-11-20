import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Session, SessionSnapshot, SessionMoveToWorktreeRequest, SessionMoveToWorktreeResult, SessionRuntimeStatus } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
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

let readSession: (sessionId: string) => Promise<SessionSnapshot>;

mock.module('@/lib/openchamberConfig', () => ({
  getWorktreeCreateCommand: async () => '',
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
const realCanonicalModule = await import('@/api/canonicalClient');
mock.module('@/api/canonicalClient', () => ({
  ...realCanonicalModule,
  canonicalClient: {
    getSession: (sessionId: string) => readSession(sessionId),
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
  moveWorktreeSessionsThenRemove,
  requestSessionTreeMove,
} = await import('./sessionWorktreeMove');
const { switchRuntimeEndpoint } = await import('@/lib/runtime-switch');

const makeSession = (sessionId: string, directory?: string): Session => ({
  sessionId,
  projectId: 'project-1',
  workspaceId: directory ?? 'workspace-1',
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

  test('requests one family relocation and refreshes both directories', async () => {
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

describe('moveWorktreeSessionsThenRemove', () => {
  const worktreePath = '/worktrees/feature';
  const projectDirectory = '/repo';
  const root = makeSession('root', 'source-workspace');
  const child = { ...makeSession('child', 'source-workspace'), parentSessionId: 'root', rootSessionId: 'root' };
  let moved = false;
  let removals = 0;
  let readIds: string[];
  let serverMember: (session: Session) => Session;

  const keep = () => moveWorktreeSessionsThenRemove({
    worktreePath, projectDirectory, readSessions: () => moved ? [] : [root, child],
    removeWorktree: async () => { removals += 1; return true; },
  });

  beforeEach(() => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime-a.test', runtimeKey: 'runtime-a' });
    registerWorkspaceDirectory('source-workspace', worktreePath);
    registerWorkspaceDirectory('destination-workspace', projectDirectory);
    moved = false;
    removals = 0;
    readIds = [];
    moveCalls.length = 0;
    metadataWrites.length = 0;
    directoryStates.clear();
    resolveProjectRefImplementation = () => ({ id: 'project-1', path: projectDirectory });
    moveSessionImplementation = async () => { moved = true; };
    refreshImplementation = async () => {};
    serverMember = (session) => ({ ...session, workspaceId: moved ? 'destination-workspace' : 'source-workspace' });
    readSession = async (sessionId) => {
      readIds.push(sessionId);
      const session = serverMember(sessionId === root.sessionId ? root : child);
      return {
        session, activeRun: null, cursor: 'epoch-1:0',
        branch: { branchId: 'branch', branchVersion: '0', leafMessageId: null },
        window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false },
        messages: [], turns: [], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
      };
    };
  });

  afterEach(() => resetWorkspaceDirectories());

  test('moves once without a local status store, then confirms every member before removing', async () => {
    await expect(keep()).resolves.toEqual({ removed: true });
    expect(moveCalls.map((move) => move.sessionId)).toEqual(['root']);
    expect(readIds.slice(-2).sort()).toEqual(['child', 'root']);
    expect(removals).toBe(1);
  });

  test('leaves the checkout intact when a child is still in its source workspace', async () => {
    serverMember = (session) => ({ ...session, workspaceId: moved && session.sessionId === 'root' ? 'destination-workspace' : 'source-workspace' });
    await expect(keep()).rejects.toMatchObject({ reason: 'unconfirmed' });
    expect(removals).toBe(0);
  });

  test('leaves the checkout intact when Canonical reports that a member is running', async () => {
    serverMember = (session) => session.sessionId === 'child' ? { ...session, runtimeStatus: 'running' } : session;
    await expect(keep()).rejects.toMatchObject({ reason: 'busy' });
    expect(moveCalls).toEqual([]);
    expect(removals).toBe(0);
  });

  test('does not treat a failed status read as idle', async () => {
    readSession = async () => { throw new Error('offline'); };
    await expect(keep()).rejects.toMatchObject({ reason: 'unknown' });
    expect(moveCalls).toEqual([]);
    expect(removals).toBe(0);
  });

  test('does not publish or remove after switching away and back during relocation', async () => {
    moveSessionImplementation = async () => {
      switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime-b.test', runtimeKey: 'runtime-b' });
      switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime-a.test', runtimeKey: 'runtime-a' });
    };
    await expect(keep()).rejects.toMatchObject({ reason: 'switched' });
    expect(metadataWrites).toEqual([]);
    expect(removals).toBe(0);
  });
});
