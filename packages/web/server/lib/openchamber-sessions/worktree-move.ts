import path from 'node:path';
import { asNonEmptyString } from '../shared/guards.js';
import type { JsonValue } from '../shared/json-values.js';
import { OpenChamberControlError, asControlError } from '../openchamber-control/error.js';
import type { ControlErrorStash } from '../openchamber-control/error.js';
import type { BootstrapStore, CheckoutHydration } from '../git/service-contracts.js';

export interface WorktreeCreatedInfo {
  name: string;
  branch: string;
  path: string;
}

export interface WorktreeStartDirectoryResult {
  directory: string;
  fallback: string | null;
}

export interface WorktreeSetupResult {
  startCommand: string;
  untrustedSkipped: string[];
}

export type WorktreeCreateInput =
  | { mode: 'existing'; name: string; existingBranch: string; setUpstream: boolean; startCommand?: string }
  | { mode: 'new'; name: string; startRef: string; branchName?: string; startCommand?: string };

export type MovedWorktreeSessions = JsonValue[] | object[] | { workspaceId: string; sessions: object[] };

export interface WorktreeMoverDependencies {
  createWorktree: (
    directory: string,
    input: WorktreeCreateInput,
    options: {
      bootstrapStore: BootstrapStore;
      hydrateCheckout: (input: { directory: string; parentRemoteName: string }) => Promise<CheckoutHydration | JsonValue | void | undefined>;
    },
  ) => Promise<WorktreeCreatedInfo>;
  removeWorktree: (
    directory: string,
    input: { directory: string; deleteLocalBranch: boolean; cancelSetup: boolean },
    options: { bootstrapStore?: BootstrapStore | undefined },
  ) => Promise<JsonValue | void | undefined>;
  waitForWorktreeReady: (directory: string) => Promise<{ setupStillRunning: boolean }>;
  resolveStartDirectory?: (input: { sourceDirectory: string; worktreeRoot: string }) => Promise<WorktreeStartDirectoryResult>;
  hydrateCheckout: (input: { directory: string; parentDirectory: string; parentRemoteName: string }) => Promise<CheckoutHydration | JsonValue | void | undefined>;
  bootstrapStore: BootstrapStore;
  stashPush: (directory: string, options: { message: string; paths: string[] }) => Promise<JsonValue | void | undefined>;
  getPathsWithoutChanges: (directory: string, paths: string[]) => Promise<string[]>;
  stashApply: (directory: string, options: { ref: string }) => Promise<JsonValue | void | undefined>;
  stashDrop: (directory: string, options: { ref: string }) => Promise<JsonValue | void | undefined>;
  listStashes: (directory: string) => Promise<ControlErrorStash[]>;
  getBranches: (directory: string, options: { remote: 'local' }) => Promise<{ all: string[]; defaultBranches: Record<string, string> }>;
  resolvePrimaryWorktreeRoot: (directory: string) => Promise<{ root: string }>;
  moveSession?: (
    sessionId: string,
    directory: string,
    context: { worktreeRoot: string; worktree: WorktreeCreatedInfo },
  ) => Promise<MovedWorktreeSessions | void>;
  resolveWorktreeSetup?: (sourceDirectory: string) => Promise<WorktreeSetupResult>;
  warn?: (message: string, cause: unknown) => void;
}

export interface MoveWorktreeInput {
  sessionId?: string | null | undefined;
  directory?: string | null | undefined;
  name?: string | null | undefined;
  branchName?: string | null | undefined;
  startRef?: string | null | undefined;
  existingBranch?: string | null | undefined;
  carry?: readonly string[] | undefined;
  setup?: WorktreeSetupResult | undefined;
  startDirectory?: ((input: { sourceDirectory: string; worktreeRoot: string }) => Promise<WorktreeStartDirectoryResult>) | undefined;
  moveSession?: WorktreeMoverDependencies['moveSession'] | undefined;
}

export interface MoveWorktreeResult {
  sessionId: string;
  directory: string;
  previousDirectory: string;
  worktree: {
    name: string;
    branch: string;
    path: string;
    existingBranch?: string;
    startRef?: string | null;
  };
  changesMoved: boolean;
  carried: string[];
  sessions?: MovedWorktreeSessions;
  startDirectoryFallback?: string;
  untrustedSetupCommandsSkipped?: string[];
}

export const createSessionWorktreeMover = (dependencies: WorktreeMoverDependencies) => {
  const {
    createWorktree,
    removeWorktree,
    waitForWorktreeReady,
    resolveStartDirectory,
    hydrateCheckout,
    bootstrapStore,
    stashPush,
    getPathsWithoutChanges,
    stashApply,
    stashDrop,
    listStashes,
    getBranches,
    resolvePrimaryWorktreeRoot,
    moveSession,
    resolveWorktreeSetup = async () => ({ startCommand: '', untrustedSkipped: [] }),
    warn = (message, cause) => console.warn(message, cause instanceof Error ? cause.message : String(cause)),
  } = dependencies;

  const resolveDefaultStartRef = async (root: string): Promise<string> => {
    const branches = await getBranches(root, { remote: 'local' });
    const local = new Set(branches.all);
    const remotes = Object.keys(branches.defaultBranches);
    const remote = remotes.includes('origin') ? 'origin' : remotes[0];
    const name = remote ? branches.defaultBranches[remote] : null;
    if (name && local.has(name)) return name;
    if (name) return `remotes/${remote}/${name}`;
    for (const candidate of ['main', 'master']) {
      if (local.has(candidate)) return candidate;
    }
    return 'HEAD';
  };

  const waitingWorktrees = new Map<string, { worktree: WorktreeCreatedInfo; ownsBranch: boolean }>();

  const findStash = async (directory: string, predicate: (entry: ControlErrorStash) => boolean): Promise<ControlErrorStash | null> =>
    (await listStashes(directory)).find(predicate) ?? null;

  const carryChanges = async ({
    source,
    destination,
    sessionId,
    name,
    paths,
  }: {
    source: string;
    destination: string;
    sessionId: string;
    name: string;
    paths: string[];
  }): Promise<ControlErrorStash | null> => {
    const message = `OhPiChamber: session ${sessionId} moved to worktree ${name}`;
    const before = new Set((await listStashes(source)).map((entry) => entry.hash));
    await stashPush(source, { message, paths: paths.map((filePath) => path.resolve(source, filePath)) });
    let stash: ControlErrorStash | null;
    try {
      stash = await findStash(source, (entry) => !before.has(entry.hash) && entry.message.includes(message));
    } catch (error) {
      throw new OpenChamberControlError(
        `The stash list could not be read after stashing the uncommitted changes: ${error instanceof Error ? error.message : String(error)}. If git stash list shows "${message}", the changes are there`,
        500,
      );
    }
    if (!stash) return null;
    try {
      await stashApply(destination, { ref: stash.hash });
    } catch (error) {
      throw new OpenChamberControlError(
        `The uncommitted changes do not apply in the new worktree: ${error instanceof Error ? error.message : String(error)}`,
        409,
        { stash },
      );
    }
    return stash;
  };

  const dropStash = async (directory: string, stash: ControlErrorStash): Promise<void> => {
    const entry = await findStash(directory, (candidate) => candidate.hash === stash.hash);
    if (entry) await stashDrop(directory, { ref: entry.ref });
  };

  const restoreChanges = async (source: string, stash: ControlErrorStash): Promise<void> => {
    await stashApply(source, { ref: stash.hash });
    await dropStash(source, stash);
  };

  const removeCreatedWorktree = (root: string, worktree: WorktreeCreatedInfo, deleteLocalBranch: boolean): Promise<void> =>
    removeWorktree(root, {
      directory: worktree.path,
      deleteLocalBranch,
      cancelSetup: true,
    }, { bootstrapStore }).then(
      () => undefined,
      (error) => { warn(`Failed to remove worktree ${worktree.path} after a failed session move:`, error); },
    );

  const move = async (input: MoveWorktreeInput): Promise<MoveWorktreeResult> => {
    const sessionId = asNonEmptyString(input?.sessionId);
    if (!sessionId) throw new OpenChamberControlError('sessionId is required', 400);
    const source = asNonEmptyString(input?.directory);
    if (!source) throw new OpenChamberControlError('The session has no directory to move from', 400);
    const name = asNonEmptyString(input?.name);
    if (!name) throw new OpenChamberControlError('worktree is required: a short folder name for the task', 400);
    const existingBranch = asNonEmptyString(input?.existingBranch);
    const branchName = asNonEmptyString(input?.branchName);
    if (existingBranch && (branchName || asNonEmptyString(input?.startRef))) {
      throw new OpenChamberControlError('existingBranch checks out that branch as it is; do not combine it with branch or startRef', 400);
    }
    const carry = input?.carry ?? [];
    if (!Array.isArray(carry) || carry.some((entry) => !asNonEmptyString(entry))) {
      throw new OpenChamberControlError('carry is a list of file paths', 400);
    }
    const paths = [...new Set(carry.map((entry) => entry.trim()))];
    if (paths.length > 0) {
      const unchanged = await getPathsWithoutChanges(source, paths);
      if (unchanged.length > 0) {
        throw new OpenChamberControlError(`carry paths have no uncommitted changes or cannot be resolved by git: ${unchanged.join(', ')}`, 400);
      }
    }

    const { root } = await resolvePrimaryWorktreeRoot(source);
    let startRef: string | null = null;
    let worktreeInput: WorktreeCreateInput;
    let ownsBranch = true;
    if (existingBranch) {
      ownsBranch = !(await getBranches(root, { remote: 'local' })).all.includes(existingBranch);
      worktreeInput = { mode: 'existing', name, existingBranch, setUpstream: true };
    } else {
      startRef = asNonEmptyString(input?.startRef) || await resolveDefaultStartRef(root);
      worktreeInput = { mode: 'new', name, startRef };
      if (branchName) worktreeInput.branchName = branchName;
    }
    const setup = input.setup ?? await resolveWorktreeSetup(source);
    if (setup.startCommand) worktreeInput.startCommand = setup.startCommand;

    let worktree: WorktreeCreatedInfo;
    const waitingKey = JSON.stringify([sessionId, source, root, worktreeInput]);
    const waiting = waitingWorktrees.get(waitingKey);
    waitingWorktrees.delete(waitingKey);
    const retained = waiting && await resolvePrimaryWorktreeRoot(waiting.worktree.path)
      .then((found) => found?.root === root, () => false);
    if (retained) {
      ({ worktree, ownsBranch } = waiting);
    } else {
      try {
        worktree = await createWorktree(root, worktreeInput, {
          bootstrapStore,
          hydrateCheckout: ({ directory, parentRemoteName }) => hydrateCheckout({ directory, parentDirectory: root, parentRemoteName }),
        });
      } catch (error) {
        throw asControlError(error, 'Failed to create the worktree');
      }
    }

    let stash: ControlErrorStash | null = null;
    let movedSessions: MovedWorktreeSessions | null = null;
    let start: WorktreeStartDirectoryResult = { directory: worktree.path, fallback: null };
    let setupStillRunning = false;
    try {
      ({ setupStillRunning } = await waitForWorktreeReady(worktree.path));
      if (!setupStillRunning) {
        const startDirectoryResolver = input.startDirectory ?? resolveStartDirectory;
        if (!startDirectoryResolver) throw new OpenChamberControlError('Worktree start directory resolution is unavailable', 503);
        start = await startDirectoryResolver({ sourceDirectory: source, worktreeRoot: worktree.path });
        if (paths.length > 0) stash = await carryChanges({ source, destination: worktree.path, sessionId, name, paths });
        const relocate = input.moveSession ?? moveSession;
        if (!relocate) throw new OpenChamberControlError('Session relocation is unavailable', 503);
        movedSessions = await relocate(sessionId, start.directory, { worktreeRoot: worktree.path, worktree }) ?? null;
      }
    } catch (error) {
      const removal = retained ? Promise.resolve() : removeCreatedWorktree(root, worktree, ownsBranch);
      const failure = asControlError(error, 'Failed to move the session into the worktree');
      const pending = stash ?? failure.stash ?? null;
      if (pending) {
        try {
          await restoreChanges(source, pending);
        } catch (restoreError) {
          throw new OpenChamberControlError(
            `${failure.message}. The uncommitted changes are kept in git stash ${pending.hash} (${pending.message}); restoring them failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
            500,
          );
        }
      }
      await removal;
      throw failure;
    }

    if (setupStillRunning) {
      waitingWorktrees.set(waitingKey, { worktree, ownsBranch });
      throw new OpenChamberControlError(
        `The project's setup commands are still running in ${worktree.path}, so session ${sessionId} stayed in ${source} and no files were carried. Call session.moveToWorktree again with the same worktree to move in once they finish`,
        503,
        { partial: true, partialAction: 'worktree-setup-running', directory: worktree.path },
      );
    }

    if (stash) {
      await dropStash(root, stash).catch((error) => {
        warn(`The moved changes are applied, but their stash ${stash.ref} could not be dropped:`, error);
      });
    }

    const worktreeSummary: MoveWorktreeResult['worktree'] = {
      name: worktree.name,
      branch: worktree.branch,
      path: worktree.path,
    };
    if (existingBranch) worktreeSummary.existingBranch = existingBranch;
    else worktreeSummary.startRef = startRef;

    const result: MoveWorktreeResult = {
      sessionId,
      directory: start.directory,
      previousDirectory: source,
      worktree: worktreeSummary,
      changesMoved: stash !== null,
      carried: paths,
    };
    if (movedSessions) result.sessions = movedSessions;
    if (start.fallback) result.startDirectoryFallback = start.fallback;
    if (setup.untrustedSkipped.length > 0) result.untrustedSetupCommandsSkipped = setup.untrustedSkipped;
    return result;
  };

  return { move, resolveDefaultStartRef };
};
